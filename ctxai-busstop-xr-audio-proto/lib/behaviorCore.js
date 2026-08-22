// 행동 판정의 순수 계산 코어 — 브라우저 API 도 MediaPipe 도 쓰지 않는다.
//
// lib/behaviorSense.js 에서 갈라져 나온 파일이다. 카메라 입력(sampleFrames)은
// 브라우저 전용이라 node 에서 못 부르는데, 판정 계산은 node 에서 돌려야
// 회귀 테스트(scripts/replay.mjs)가 성립한다. 그래서 계산만 여기로 옮겼다.
//
// 브라우저 코드는 계속 lib/behaviorSense.js 에서 가져다 쓰면 된다 —
// 그쪽이 이 파일을 통째로 다시 내보낸다.

const NOSE = 1;
const LEFT_EDGE = 234;
const RIGHT_EDGE = 454;
const FOREHEAD = 10;
// 턱(152번) 대신 미간(168번)을 아래쪽 기준점으로 쓴다 — 입을 가리는 등
// 손이 얼굴 아래쪽을 가리는 흔한 동작에도 턱 랜드마크가 안 흔들리게.
const NOSE_BRIDGE = 168;

// 세션 파일에 남길 랜드마크 인덱스.
//
// 478개를 다 저장하면 세션당 수 MB 라 못 쓰고, 지금 계산에 쓰는 5개만 저장하면
// 나중에 기준점을 바꿀 때 과거 데이터를 못 쓴다 — 실제로 이미 한 번 바꿨다
// (턱 152 → 미간 168, 손 가림 대응). 그래서 얼굴 윤곽 전체 + 코 계열 + 눈썹
// 안쪽까지 저장해 재계산 여지를 남긴다.
export const LANDMARK_IDS = [
  // FACE_OVAL
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
  // 코 계열 · 눈썹 안쪽
  1, 168, 4, 5, 6, 105, 334,
];

const LM_INDEX = new Map(LANDMARK_IDS.map((id, i) => [id, i]));

/** 평탄 배열로 저장된 RawSample.lm 에서 랜드마크 하나를 꺼낸다. */
export function lmPoint(flat, id) {
  const i = LM_INDEX.get(id);
  if (i === undefined || !flat) return null;
  const o = i * 3;
  return { x: flat[o], y: flat[o + 1], z: flat[o + 2] };
}

// 노이즈로 볼 최소 변위 (정규화 좌표계, 얼굴 폭/높이 대비 비율)
const NOISE_TH = 0.045;
const SCALE_DROP_TH = 0.10;   // 얼굴 폭이 기준 대비 이만큼 줄면 "뒤로 뺌"
const SUSTAINED_SEC_TH = 2.0;
const SLOW_RECOVERY_MS = 3000;
const FAST_RECOVERY_MS = 2000;
// 한 프레임 안에서 이보다 더 튀면 손 가림 등 인식 오류로 보고 버린다
// (실제 고개 회전은 한 프레임 만에 이 정도로 안 튐)
const MAX_FRAME_JUMP = 0.10;
// 얼굴 기준자세를 잡는 구간. 프로브 하네스는 기저선이 8초라 더 길게 줄 수 있다.
const DEFAULT_CALIB_MS = 1200;

export const CHANNEL_WEIGHTS = { behavior: 0.5, text: 0.3, voice: 0.2 };

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 계산에 실제로 쓰는 5개 점의 최소 visibility(모델이 직접 보고하는 "이 점이
// 가려지지 않고 보이는가" 신뢰도). 손이 얼굴을 가리면 여기서 낮게 나온다.
// 지금은 판정에 쓰지 않고 세션에 기록만 한다 — 실측으로 쓸모를 확인한 뒤
// 채널 가중치에 반영할 자리다 (구현_리스크 §1-2).
function minVisibility(landmarks) {
  const pts = [landmarks[NOSE], landmarks[LEFT_EDGE], landmarks[RIGHT_EDGE], landmarks[FOREHEAD], landmarks[NOSE_BRIDGE]];
  return Math.min(...pts.map((p) => (typeof p?.visibility === "number" ? p.visibility : 1)));
}

// MediaPipe 블렌드셰이프(ARKit 호환, 실제 얼굴 캡처 데이터로 학습된 모델)에서
// 공포/놀람·웃음 관련 항목만 뽑는다 — 내가 지어낸 규칙이 아니라 모델 출력값이다.
// jawOpen(입 벌어짐)은 뺐다 — 크게 웃을 때도 입이 벌어져서 공포와 혼동된다
// (리허설에서 발견: 웃었는데 공포로 판정됨). 눈 커짐·눈썹 안쪽 치켜올림은
// 웃음과 겹치지 않는 훨씬 특이적인 공포 신호라 이 둘만 남긴다.
const FEAR_SHAPES = ["eyeWideLeft", "eyeWideRight", "browInnerUp"];
const AMUSEMENT_SHAPES = ["mouthSmileLeft", "mouthSmileRight", "cheekSquintLeft", "cheekSquintRight"];
// 세션에 기록할 블렌드셰이프 — 위 둘의 합집합에 jawOpen 을 더한다. jawOpen 은
// 판정에서 뺐지만(웃음/공포 혼동) 기록은 해 둔다. 나중에 조합을 바꿔도
// 과거 세션에서 다시 계산할 수 있게 하려는 것.
export const BLENDSHAPE_KEYS = [...new Set([...FEAR_SHAPES, ...AMUSEMENT_SHAPES, "jawOpen"])];

function shapeMax(bs, names) {
  let max = 0;
  for (const n of names) {
    const v = bs?.[n] || 0;
    if (v > max) max = v;
  }
  return max;
}

// 랜드마크 → { dx, dy, scale } (정규화 좌표, 얼굴 크기로 나눈 상대값)
// 평탄 배열(저장본)과 MediaPipe 원본 배열 양쪽에서 쓰이도록 접근자를 받는다.
function frameSignal(get) {
  const nose = get(NOSE);
  const l = get(LEFT_EDGE);
  const r = get(RIGHT_EDGE);
  const top = get(FOREHEAD);
  const bottom = get(NOSE_BRIDGE);
  if (!nose || !l || !r || !top || !bottom) return null;
  const width = dist(l, r) || 1e-6;
  const height = dist(top, bottom) || 1e-6;
  const cx = (l.x + r.x) / 2;
  const cy = (top.y + bottom.y) / 2;
  return {
    dx: (nose.x - cx) / width,
    dy: (nose.y - cy) / height,
    scale: width,
  };
}

/** RawSample 에서 신호를 뽑는다 — 리플레이도 이 함수를 그대로 쓴다. */
export function signalOf(sample) {
  if (!sample?.lm) return null;
  return frameSignal((id) => lmPoint(sample.lm, id));
}

// ─────────────────────────────────────────────────────────────
// 2) 순수 계산 — RawSample[] → 관찰 지표
// ─────────────────────────────────────────────────────────────

/**
 * 원시 샘플에서 관찰 지표를 만든다. 카메라도 시계도 안 쓴다 —
 * 같은 입력이면 언제 어디서 돌려도 같은 값이 나온다.
 */
export function metricsFrom(samples, opts = {}) {
  const durationMs = opts.durationMs ?? (samples?.length ? samples[samples.length - 1].t : 0);
  const calibMs = opts.calibMs ?? DEFAULT_CALIB_MS;

  // 얼굴을 놓친 시간. 라이브에서 잰 lostMs 가 있으면 그걸 쓰고, 없으면
  // (리플레이 경로) 샘플의 실제 타임스탬프 차이로 다시 센다.
  let lostMs = opts.lostMs;
  if (typeof lostMs !== "number") {
    lostMs = 0;
    for (let i = 1; i < (samples?.length || 0); i++) {
      if (!samples[i].lm && samples[i].t > calibMs) lostMs += samples[i].t - samples[i - 1].t;
    }
  }
  const lostTrackingSec = Number((lostMs / 1000).toFixed(2));

  const empty = {
    maxAbsDx: 0, maxAbsDy: 0, maxScaleDrop: 0, reversals: 0,
    sustainedSec: 0, recoveryMs: 0, lostTrackingSec, moved: false,
    maxFear: 0, maxAmusement: 0, minVis: 0, rejectedFrames: 0,
  };
  if (!samples?.length) return empty;

  // 손이 얼굴을 스치는 등으로 한 프레임 만에 물리적으로 불가능하게 튀면
  // 인식 오류로 보고 버린다. 예전에는 수집 루프 안에서 했는데, 순수 계산으로
  // 옮겨서 저장된 세션에도 똑같이 적용되게 했다.
  const accepted = [];
  let lastAccepted = null;
  let rejectedFrames = 0;
  let minVis = 1;
  for (const s of samples) {
    const sig = signalOf(s);
    if (!sig) continue;
    const jump = lastAccepted
      ? Math.max(Math.abs(sig.dx - lastAccepted.dx), Math.abs(sig.dy - lastAccepted.dy))
      : 0;
    if (lastAccepted && jump > MAX_FRAME_JUMP) { rejectedFrames++; continue; }
    lastAccepted = sig;
    if (s.vis < minVis) minVis = s.vis;
    accepted.push({ t: s.t, ...sig, bs: s.bs });
  }

  // 표정 모델 최대값은 기준자세 구간을 뺀 뒤에 잰다.
  //
  // ⚠ 위의 튐 거부(accepted)를 통과한 프레임이 아니라 얼굴이 잡힌 프레임
  // 전부에서 잰다. 좌표가 튀는 것과 표정 모델 출력은 무관한 신호인데, 예전
  // 구조에서는 손이 얼굴을 스쳐 좌표가 튀면 그 프레임의 표정 점수까지 같이
  // 버려졌다 — 셋 중 근거가 가장 튼튼한 채널(학습된 모델 출력)을 근거가
  // 가장 약한 채널(내 임의 좌표 임계값) 때문에 버리는 셈이라 방향이 거꾸로다.
  let maxFear = 0, maxAmusement = 0;
  for (const s of samples) {
    if (!s.lm || s.t <= calibMs) continue;
    maxFear = Math.max(maxFear, shapeMax(s.bs, FEAR_SHAPES));
    maxAmusement = Math.max(maxAmusement, shapeMax(s.bs, AMUSEMENT_SHAPES));
  }

  const early = accepted.filter((s) => s.t <= calibMs);
  // 얼굴을 거의 못 잡았어도(예: 관찰 내내 옆/뒤를 봄) 실패로 버리지 않는다 —
  // "계속 얼굴이 안 잡혔다" 자체가 강한 행동 신호다 (판정_기준.md §2).
  if (!early.length || accepted.length < 10) {
    return {
      ...empty,
      maxFear: Number(maxFear.toFixed(3)),
      maxAmusement: Number(maxAmusement.toFixed(3)),
      minVis: Number(minVis.toFixed(3)),
      rejectedFrames,
    };
  }

  const baseline = {
    dx: early.reduce((a, s) => a + s.dx, 0) / early.length,
    dy: early.reduce((a, s) => a + s.dy, 0) / early.length,
    scale: early.reduce((a, s) => a + s.scale, 0) / early.length,
  };

  const dev = accepted
    .filter((s) => s.t > calibMs)
    .map((s) => ({ t: s.t, dx: s.dx - baseline.dx, dy: s.dy - baseline.dy, scaleDrop: baseline.scale - s.scale }));

  let maxAbsDx = 0, maxAbsDy = 0, maxScaleDrop = 0, peakT = dev.length ? dev[0].t : 0;
  let reversals = 0, lastSign = 0;
  let sustainedMs = 0;

  for (let i = 0; i < dev.length; i++) {
    const d = dev[i];
    if (Math.abs(d.dx) > maxAbsDx) { maxAbsDx = Math.abs(d.dx); peakT = d.t; }
    if (Math.abs(d.dy) > maxAbsDy) maxAbsDy = Math.abs(d.dy);
    if (d.scaleDrop > maxScaleDrop) maxScaleDrop = d.scaleDrop;

    if (Math.abs(d.dx) > NOISE_TH) {
      // 프레임 간격을 30fps 로 가정하던 것을 실제 타임스탬프 차이로 고쳤다 —
      // 프레임률이 다르면 sustainedSec 이 통째로 틀어지던 버그. 프레임이 크게
      // 밀린 구간(탭 비활성 등)은 200ms 로 잘라 과대계상을 막는다.
      sustainedMs += i > 0 ? Math.min(200, d.t - dev[i - 1].t) : 0;
      const sign = Math.sign(d.dx);
      if (lastSign !== 0 && sign !== lastSign) reversals++;
      lastSign = sign;
    }
  }

  // 애초에 노이즈 이상으로 움직인 적이 없으면 "회복"이라는 개념 자체가 없다.
  // 예전에는 이 경우에도 첫 샘플 시각이 회복 시간으로 잡혀서, 가만히 있던
  // 관객에게 근거 없는 "빠른 회복"(코미디 신호)이 붙었다.
  const moved = maxAbsDx > NOISE_TH;
  const after = dev.filter((d) => d.t >= peakT);
  const recoveredAt = after.find((d) => Math.abs(d.dx) < NOISE_TH * 0.7);
  const recoveryMs = !moved ? 0 : recoveredAt ? recoveredAt.t - peakT : durationMs - peakT;

  return {
    maxAbsDx: Number(maxAbsDx.toFixed(3)),
    maxAbsDy: Number(maxAbsDy.toFixed(3)),
    maxScaleDrop: Number(maxScaleDrop.toFixed(3)),
    reversals,
    sustainedSec: Number((sustainedMs / 1000).toFixed(2)),
    recoveryMs: Math.round(recoveryMs),
    lostTrackingSec,
    moved,
    maxFear: Number(maxFear.toFixed(3)),
    maxAmusement: Number(maxAmusement.toFixed(3)),
    minVis: Number(minVis.toFixed(3)),
    rejectedFrames,
  };
}

// ─────────────────────────────────────────────────────────────
// 3) 순수 판정 — 지표 → {R,H,C}
// ─────────────────────────────────────────────────────────────

// 정류장_스크립트_v2.md §2-4 규칙을 웹캠 지표로 옮긴 소프트 스코어 버전.
// 하드 라벨 대신 {R,H,C} 0~1 점수(합=1)를 반환해서 다른 채널과 가중합할 수 있게 한다.
// 자세한 근거는 Bus/규격/판정_기준.md 참고 — 임계값은 전부 잠정치.
export function judgeFromBehavior(metrics) {
  if (!metrics) {
    return { scores: { R: 1, H: 0, C: 0 }, reason: "관찰 실패 — 로맨스 디폴트" };
  }

  // 코 위치 기반 추정치(내 임의 임계값)에, 실제 학습된 표정 모델이 준
  // 공포/놀람 표정 점수(maxFear)를 하나의 증거로 같이 넣는다 — 손으로 얼굴을
  // 가려서 좌표가 튀는 것과 진짜 겁먹은 표정을 구분하는 데 도움이 된다.
  const rawDefensiveSig = clamp01(Math.max(
    metrics.maxScaleDrop / SCALE_DROP_TH,
    metrics.maxAbsDy / 0.12,
    (metrics.lostTrackingSec || 0) / 2,
    metrics.maxFear || 0
  ));
  // 웃을 때 고개를 뒤로 젖히는 동작이 "겁먹어서 뒤로 뺌"으로 오판되는 걸
  // 막는다 — 표정 모델이 뚜렷한 웃음을 감지했으면 방어 신호를 깎는다
  // (리허설에서 발견: 웃었는데 공포로 판정됨).
  const defensiveSig = clamp01(rawDefensiveSig * (1 - (metrics.maxAmusement || 0) * 0.8));
  const sustainedSig = clamp01(metrics.sustainedSec / (SUSTAINED_SEC_TH * 1.5));
  // "회복"은 움직인 적이 있어야 성립하는 개념이다. 애초에 노이즈 이상으로
  // 움직이지 않은 관객에게는 느린 회복(공포)도 빠른 회복(코미디)도 아니라
  // "회복할 것이 없음"이 맞다 — 예전에는 recoveryMs 가 0 이면 fastRecovery 가
  // 1.0 이 돼서, 가만히 있던 관객이 자동으로 코미디 점수를 0.33 받았다.
  const moved = metrics.moved !== false;
  const slowRecoverySig = moved ? clamp01(metrics.recoveryMs / SLOW_RECOVERY_MS) : 0;
  const H = (defensiveSig + sustainedSig + slowRecoverySig) / 3;

  const exploreSig = clamp01(metrics.reversals / 3);
  const fastRecoverySig = moved ? clamp01(1 - metrics.recoveryMs / FAST_RECOVERY_MS) : 0;
  const amusementSig = metrics.maxAmusement || 0;
  const C = (exploreSig + fastRecoverySig + amusementSig) / 3;

  const R = clamp01(1 - Math.max(H, C));
  const sum = R + H + C || 1;

  const reason = H >= C && H > R
    ? "방어 반응·지속 경계·느린 회복 신호"
    : C > R
      ? "탐색(방향 전환)·빠른 회복 신호"
      : "낮은/모호한 반응";

  return { scores: { R: R / sum, H: H / sum, C: C / sum }, reason };
}

// 행동/텍스트/음성 세 채널의 {R,H,C} 소프트 점수를 가중합한다.
// 가중치는 Bus/규격/판정_기준.md §3 표와 동일 (행동 50 · 텍스트 30 · 음성 20).
//
// 2026-08-22 갱신 — 연속 블렌딩 채택(Bus/규격/구현_리스크와_지원_필요사항.md §3).
// 예전엔 여기서 argmax로 승자 하나를 뽑아 로맨스 디폴트로 떨어뜨렸는데, 그건
// 원안(7조_버스정류장.md)의 핵심 주장인 "연속 파라미터 블렌딩"과 반대되는
// 단순화였다. 이제 승자를 뽑지 않고 {R,H,C} 벡터를 그대로 반환한다.
// `dominant`/`secondary`는 그림·대사처럼 원래 이산적인 자산을 고를 때만
// 쓰는 보조 라벨이지, 판정 결과 자체는 아니다.
export function fuseChannels({ behaviorScores, textScores, voiceScores }) {
  const w = CHANNEL_WEIGHTS;
  const channels = [];
  if (behaviorScores) channels.push([behaviorScores, w.behavior]);
  if (textScores) channels.push([textScores, w.text]);
  if (voiceScores) channels.push([voiceScores, w.voice]);

  if (!channels.length) {
    const scores = { R: 1, H: 0, C: 0 };
    return { scores, dominant: "R", secondary: null, confidence: 1, reason: "신호 없음 — 로맨스 디폴트" };
  }

  const totalW = channels.reduce((a, [, cw]) => a + cw, 0);
  const fused = { R: 0, H: 0, C: 0 };
  for (const [sc, cw] of channels) {
    for (const g of ["R", "H", "C"]) fused[g] += (sc[g] || 0) * (cw / totalW);
  }

  const sorted = Object.entries(fused).sort((a, b) => b[1] - a[1]);
  const [dominant] = sorted[0];
  const [secondary, secondaryScore] = sorted[1];

  return {
    scores: fused,
    dominant,
    secondary: secondaryScore > 0.15 ? secondary : null, // 보조 장르로 취급할 최소 비중
    confidence: confidenceOf(fused),
    reason: `${dominant} 우세 (${Math.round(sorted[0][1] * 100)}%)`,
  };
}

// 벡터가 얼마나 "뚜렷한지"를 섀넌 엔트로피로 잰다 — 이산 분류 때는
// "1등-2등 점수 차이"로 충분했지만, 연속 벡터에서는 {0.34,0.33,0.33}(고르게
// 섞임 → 재질문 필요)과 {0.7,0.2,0.1}(뚜렷하지만 순수하지 않음 → 재질문
// 불필요)을 구분해야 한다. 1에 가까울수록 확신, 0에 가까울수록(고르게
// 섞임) 재질문 후보. 근거: Bus/규격/구현_리스크와_지원_필요사항.md §4-4.
export function confidenceOf(scores) {
  const vals = Object.values(scores).filter((v) => v > 0);
  if (!vals.length) return 0;
  const entropy = -vals.reduce((a, p) => a + p * Math.log(p), 0);
  const maxEntropy = Math.log(3); // 장르 3개 균등 분포일 때 최대
  return clamp01(1 - entropy / maxEntropy);
}

// 값이 계속 갱신될 때(예: 재질문 후 답을 더 들었을 때) 급변 없이 완만하게
// 따라가게 한다. 근거: 구현_리스크와_지원_필요사항.md §4-3 (파라미터 떨림).
export function smoothScores(prev, next, alpha = 0.4) {
  if (!prev) return next;
  const out = {};
  for (const g of ["R", "H", "C"]) out[g] = prev[g] * (1 - alpha) + next[g] * alpha;
  const sum = out.R + out.H + out.C || 1;
  return { R: out.R / sum, H: out.H / sum, C: out.C / sum };
}
