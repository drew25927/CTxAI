// 프로브별 반응 커널 — 순수 함수. 카메라도 시계도 안 쓴다.
//
// 이 파일이 논문 프레이밍의 R 행렬을 만든다:
//
//   반응 커널   rᵢ = Φ( S[tᵢ, tᵢ+τᵢ] )        S = 요각·고각·표정 시계열
//   반응 프로파일 R = [r₁ … r₆]
//   장르 친화도  g = f(R) ∈ Δ²
//
// 지금 f() 는 학습된 것이 아니라 정류장_스크립트_v2.md §2-4 에 문서로 적힌
// 규칙을 그대로 옮긴 것이다. 임의로 지어낸 것이 아니라는 점이 중요하다 —
// 파일럿 데이터가 쌓이면 이 함수를 학습된 것으로 교체하는 게 목표고,
// 그때까지는 문서에 적힌 규칙이 기준선 역할을 한다.
//
// 근거: Bus/규격/정류장_스크립트_v2.md §2-2(반응 강도 0/1/2) · §2-3(자세 보정)
//       · §2-4(판정 규칙) · Bus/규격/판정_기준.md

import { PROBES, BASELINE_MS, angleDelta, probeAt, revisitWindow } from "./probes.js";

// ── 임계값 — 전부 잠정치 (v2.md §2 와 같은 성격) ──────────
const ON_TARGET_DEG = 25;    // 이 안이면 "그쪽을 봤다"
const DEVIATION_DEG = 10;    // 기저 자세에서 이 이상 벗어나면 "움직였다"
const RETURN_DEG = 6;        // 이 안으로 돌아오면 "복귀했다"
const LATENCY_GAIN_DEG = 12; // 초기 오차보다 이만큼 줄면 "향하기 시작했다"
// 자극 쪽으로 "돌렸다"고 인정할 최소 회전량.
//
// 이게 없으면 가만히 있는 관객도 시야를 가로지르는 프로브(트럭 78°→-78°,
// 고양이 70°→-80°)를 쳐다본 것으로 집계된다 — 자극이 관객 앞을 지나가면서
// 방위가 관객의 정지 시선과 한 번 일치하기 때문이다. 그건 반응이 아니라
// 자극이 지나간 것이다. 합성 세션 reg-silent 에서 실제로 발견했다.
const TURN_MIN_DEG = 8;
const SUSTAINED_MS = 2000;   // v2.md §2-2 "2초 이상 추적하거나 읽음"
const FAST_RETURN_MS = 1500;
const SLOW_RETURN_MS = 3000;

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** 시계열에서 t 시점 값을 선형 보간. 요각은 래핑을 고려해 델타로 더한다. */
function sampleAt(series, t, key) {
  if (!series?.length) return null;
  if (t <= series[0].t) return series[0][key];
  if (t >= series[series.length - 1].t) return series[series.length - 1][key];
  let lo = 0, hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = series[lo], b = series[hi];
  const u = (t - a.t) / Math.max(1, b.t - a.t);
  return a[key] + angleDelta(b[key], a[key]) * u;
}

/** 기저선 구간(자극 없음)의 평균 자세 — v2.md §2-3 "초기 5~8초의 평균 자세". */
export function baselineOf(gaze) {
  const early = (gaze || []).filter((g) => g.t <= BASELINE_MS);
  if (!early.length) return { yaw: 0, pitch: 0, n: 0 };
  // 요각은 첫 값을 기준으로 델타 평균을 내야 ±180 경계에서 안 깨진다.
  const ref = early[0].yaw;
  const dy = early.reduce((a, g) => a + angleDelta(g.yaw, ref), 0) / early.length;
  return {
    yaw: ref + dy,
    pitch: early.reduce((a, g) => a + g.pitch, 0) / early.length,
    n: early.length,
  };
}

/** 프로브 창 안의 표정 최대값과 얼굴 유실 시간 (웹캠 채널). */
function faceIn(samples, startMs, endMs) {
  let peakFear = 0, peakAmusement = 0, lostMs = 0, n = 0;
  const fear = ["eyeWideLeft", "eyeWideRight", "browInnerUp"];
  const amuse = ["mouthSmileLeft", "mouthSmileRight", "cheekSquintLeft", "cheekSquintRight"];
  const max = (bs, keys) => keys.reduce((a, k) => Math.max(a, bs?.[k] || 0), 0);
  const inWin = (samples || []).filter((s) => s.t >= startMs && s.t <= endMs);
  for (let i = 0; i < inWin.length; i++) {
    const s = inWin[i];
    if (!s.lm) {
      lostMs += i > 0 ? Math.min(200, s.t - inWin[i - 1].t) : 0;
      continue;
    }
    n++;
    peakFear = Math.max(peakFear, max(s.bs, fear));
    peakAmusement = Math.max(peakAmusement, max(s.bs, amuse));
  }
  return {
    peakFear: Number(peakFear.toFixed(3)),
    peakAmusement: Number(peakAmusement.toFixed(3)),
    faceLostMs: Math.round(lostMs),
    faceFrames: n,
  };
}

/**
 * 프로브 하나에 대한 반응 커널.
 *
 * 두 종류의 각도를 나눠 잰다:
 *   대상 기준 (yaw − 프로브 방위)   → 그쪽을 봤는가 · 얼마나 정확히 · 얼마나 오래
 *   기저 기준 (yaw − 기저선 요각)   → 얼마나 움직였는가 · 언제 돌아왔는가
 */
export function kernelFor(probe, gaze, samples, baseline) {
  const start = probe.onsetMs;
  const end = probe.onsetMs + probe.windowMs;
  const win = (gaze || []).filter((g) => g.t >= start && g.t <= end);

  const empty = {
    probeId: probe.id,
    onsetMs: start, windowMs: probe.windowMs,
    acquired: false, latencyMs: null, peakErrorDeg: null, onTargetMs: 0, movedDeg: 0,
    peakDevDeg: 0, dwellMs: 0, returnMs: null, reversals: 0, pitchDevDeg: 0,
    revisits: 0, revisitMs: 0,
    ...faceIn(samples, start, end),
    intensity: 0,
  };
  if (win.length < 2) return empty;

  const bearingAt = (t) => {
    const prog = clamp01((t - start) / probe.windowMs);
    return probeAt(probe, prog).azimuth;
  };

  const startYaw = win[0].yaw;
  const initialErr = Math.abs(angleDelta(startYaw, bearingAt(win[0].t)));
  // 자극이 시작될 때 이미 그쪽을 보고 있었으면 돌릴 필요가 없다.
  const alreadyOn = initialErr <= ON_TARGET_DEG;

  let peakErrorDeg = Infinity;
  let onTargetMs = 0;
  let latencyMs = null;
  let peakDevDeg = 0, peakDevT = start;
  let dwellMs = 0;
  let reversals = 0, lastSign = 0;
  let pitchDevDeg = 0;
  let movedDeg = 0;
  let orientedAt = alreadyOn ? start : null;

  for (let i = 0; i < win.length; i++) {
    const g = win[i];
    const dt = i > 0 ? Math.min(200, g.t - win[i - 1].t) : 0;

    // 창 시작 시점 대비 실제로 고개를 돌린 양 — "자극이 지나간 것"과
    // "내가 자극 쪽으로 돌린 것"을 가르는 값이다.
    const turned = Math.abs(angleDelta(g.yaw, startYaw));
    if (turned > movedDeg) movedDeg = turned;
    if (orientedAt === null && turned >= TURN_MIN_DEG) orientedAt = g.t;

    const err = Math.abs(angleDelta(g.yaw, bearingAt(g.t)));
    if (err < peakErrorDeg) peakErrorDeg = err;
    // 온타깃은 "돌린 뒤부터" 센다. 돌린 적이 없으면 0 이다.
    if (err <= ON_TARGET_DEG && orientedAt !== null && g.t >= orientedAt) onTargetMs += dt;
    if (latencyMs === null && orientedAt !== null && err <= initialErr - LATENCY_GAIN_DEG) latencyMs = g.t - start;

    const dev = angleDelta(g.yaw, baseline.yaw);
    if (Math.abs(dev) > peakDevDeg) { peakDevDeg = Math.abs(dev); peakDevT = g.t; }
    if (Math.abs(dev) > DEVIATION_DEG) {
      dwellMs += dt;
      const sign = Math.sign(dev);
      if (lastSign !== 0 && sign !== lastSign) reversals++;
      lastSign = sign;
    }
    pitchDevDeg = Math.max(pitchDevDeg, Math.abs(g.pitch - baseline.pitch));
  }

  // 복귀 — 최대 이탈 시점 이후 기저 자세로 돌아오기까지. 창을 넘어서까지
  // 안 돌아오면 null(= 느린 회복)로 둔다. 재확인 구간까지 이어서 본다.
  const rev = revisitWindow(probe);
  const tail = (gaze || []).filter((g) => g.t >= peakDevT && g.t <= rev.endMs);
  const returned = tail.find((g) => Math.abs(angleDelta(g.yaw, baseline.yaw)) < RETURN_DEG);
  const returnMs = returned ? returned.t - peakDevT : null;

  // 재확인 — 창이 끝난 뒤 다음 프로브 전까지 그쪽을 다시 보는 에피소드 수.
  // v2.md §2-2 "사라진 뒤 다시 확인함" / "사건이 끝난 뒤에도 그 방향을 의식함"
  // 재확인도 같은 함정이 있다 — 기저 자세가 우연히 프로브의 끝 방위와 가까우면
  // 가만히 있어도 "계속 재확인 중"으로 잡힌다. 그래서 기저 자세에서 벗어나
  // 그쪽을 보는 경우만 센다.
  const endBearing = bearingAt(end);
  const baseIsOnTarget = Math.abs(angleDelta(baseline.yaw, endBearing)) <= ON_TARGET_DEG;
  let revisits = 0, revisitMs = 0, inEpisode = false;
  const after = baseIsOnTarget ? [] : (gaze || []).filter((g) => g.t > rev.startMs && g.t <= rev.endMs);
  for (let i = 0; i < after.length; i++) {
    const on = Math.abs(angleDelta(after[i].yaw, endBearing)) <= ON_TARGET_DEG;
    if (on) {
      revisitMs += i > 0 ? Math.min(200, after[i].t - after[i - 1].t) : 0;
      if (!inEpisode) { revisits++; inEpisode = true; }
    } else inEpisode = false;
  }

  // 획득 = 자극 방향으로 시선이 갔고, **그쪽으로 돌린 것**일 때만.
  const oriented = alreadyOn || movedDeg >= TURN_MIN_DEG;
  const acquired = peakErrorDeg <= ON_TARGET_DEG && oriented;

  // v2.md §2-2 반응 강도 0/1/2 — 문서의 문장을 그대로 조건으로 옮긴 것.
  //   0 사건 방향으로 고개를 돌리지 않음 / 확인 불가
  //   1 사건 방향을 한 번 바라봄, 곧 원래 시선으로 복귀
  //   2 2초 이상 추적하거나 읽음 · 사라진 뒤 다시 확인 · 사건 뒤에도 그 방향을 의식
  let intensity = 0;
  if (acquired) intensity = 1;
  if (acquired && (onTargetMs >= SUSTAINED_MS || revisits >= 1 || revisitMs >= 800)) intensity = 2;

  return {
    probeId: probe.id,
    onsetMs: start, windowMs: probe.windowMs,
    acquired,
    latencyMs,
    peakErrorDeg: Number(peakErrorDeg.toFixed(1)),
    onTargetMs: Math.round(onTargetMs),
    movedDeg: Number(movedDeg.toFixed(1)),
    peakDevDeg: Number(peakDevDeg.toFixed(1)),
    dwellMs: Math.round(dwellMs),
    returnMs: returnMs === null ? null : Math.round(returnMs),
    reversals,
    pitchDevDeg: Number(pitchDevDeg.toFixed(1)),
    revisits,
    revisitMs: Math.round(revisitMs),
    ...faceIn(samples, start, end),
    intensity,
  };
}

/** 세션 전체 → 반응 프로파일 R. */
export function kernelsFrom({ gaze, samples, probes = PROBES }) {
  const baseline = baselineOf(gaze);
  return {
    baseline: { yaw: Number(baseline.yaw.toFixed(2)), pitch: Number(baseline.pitch.toFixed(2)), n: baseline.n },
    kernels: probes.map((p) => kernelFor(p, gaze, samples, baseline)),
  };
}

// ─────────────────────────────────────────────────────────────
// f(R) — 반응 프로파일 → 장르 친화도
//
// ⚠ 학습된 함수가 아니다. 정류장_스크립트_v2.md §2-4 의 세 규칙을
//    소프트 점수로 옮긴 것이다. 파일럿 데이터가 쌓이면 이 자리를 학습된
//    함수로 교체하는 것이 목표다 (구현_리스크 §1-1).
// ─────────────────────────────────────────────────────────────

// §2-4 가 이름으로 지목하는 프로브들
const DEFENSIVE_PROBES = ["truck", "cat"];               // A-1 방어 반응
// A-2 지속 경계. 두 종류를 나눠야 한다 —
//   frog·cry2 는 보이는 것이 없는 청각 프로브라, 그쪽을 오래 의식하는 것
//     자체가 경계다.
//   wiper 는 사람이 실제로 보이므로, 보고 있는 동안은 경계가 아니라 관심이다
//     (§2-4 C "우비 인물엔 관심을 보임"). §2-4 A-2 가 말하는 것은
//     "**사라진** 우비 인물"을 다시 확인하는 것 — 즉 창이 끝난 뒤의 재확인만
//     경계로 센다. 이걸 구분하지 않으면 우비 인물을 3초 본 것만으로 공포가
//     된다 (합성 세션 participant-a-romance 에서 발견).
const VIGILANCE_DWELL_PROBES = ["frog", "cry2"];
const VIGILANCE_REVISIT_PROBES = ["frog", "cry2", "wiper", "cat"];
const EXPLORE_PROBES = ["wiper", "poster", "frog", "cat"]; // B-1 탐색 행동
const PERSON_PROBES = ["wiper"];                          // C 사람에 대한 선택적 관심

const byId = (kernels) => Object.fromEntries(kernels.map((k) => [k.probeId, k]));

function meanReturnMs(kernels, ids) {
  const vals = ids
    .map((id) => byId(kernels)[id])
    .filter((k) => k && k.acquired)
    .map((k) => (k.returnMs === null ? SLOW_RETURN_MS * 1.5 : k.returnMs));
  if (!vals.length) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

export function judgeFromKernels(kernels) {
  const K = byId(kernels);
  const got = (id) => K[id] || null;

  // ── A-1 방어 반응 ──
  // 마우스 룩에는 "몸을 뒤로 뺌"이 없다. 그래서 방어는 (a) 표정 모델의
  // 공포/놀람, (b) 자극 방향에서 급히 시선을 거두는 회피, (c) 웹캠이 얼굴을
  // 놓칠 만큼 큰 반응 세 가지로 본다. (a) 가 가장 근거가 두껍다.
  let defensive = 0;
  for (const id of DEFENSIVE_PROBES) {
    const k = got(id);
    if (!k) continue;
    const startle = k.peakFear;
    // "얼굴을 피함" 의 대리 신호 — 크게 돌렸다가 거의 머무르지 않고 벗어남.
    // 임계를 DEVIATION_DEG(10°)에서 크게 올렸다. 10° 는 곁눈질 수준이라
    // 살짝 쳐다본 것도 전부 회피로 잡혔다 (participant-a-romance 에서 발견).
    // 마우스 룩에는 "몸을 뒤로 뺌" 에 해당하는 동작이 아예 없으므로, 이
    // 채널의 주 근거는 어디까지나 학습된 표정 모델(startle)이다.
    const avert = k.acquired && k.onTargetMs < 400 && k.peakDevDeg > 25 ? 0.5 : 0;
    const bigMove = clamp01(k.faceLostMs / 1500) * 0.6;
    defensive = Math.max(defensive, clamp01(Math.max(startle, avert, bigMove)));
  }

  // ── A-2 지속 경계 ── 재확인하거나(사라진 뒤에도 의식) 2초 이상 의식
  let vigilance = 0;
  for (const id of VIGILANCE_DWELL_PROBES) {
    const k = got(id);
    if (k?.acquired) vigilance = Math.max(vigilance, clamp01(k.onTargetMs / SUSTAINED_MS));
  }
  for (const id of VIGILANCE_REVISIT_PROBES) {
    const k = got(id);
    if (k) vigilance = Math.max(vigilance, clamp01(k.revisits / 2));
  }

  // ── A-3 느린 회복 ──
  const retDef = meanReturnMs(kernels, DEFENSIVE_PROBES);
  const slowReturn = retDef === null ? 0 : clamp01(retDef / SLOW_RETURN_MS);
  const fastReturn = retDef === null ? 0 : clamp01(1 - retDef / FAST_RETURN_MS);

  // ── B-1 탐색 행동 2개 이상이 2단계 ──
  const exploreTwos = EXPLORE_PROBES.filter((id) => got(id)?.intensity === 2).length;
  const explore = clamp01(exploreTwos / 2);

  // ── B-2 회피보다 확인 ── 자극 뒤에 다시 그쪽/주변을 확인
  const confirm = clamp01(
    kernels.reduce((a, k) => a + (k.revisits > 0 ? 1 : 0), 0) / 3
  );

  // 웃음은 공포와 겹치지 않는 코미디 신호 (behaviorSense 와 같은 교차 억제)
  const amusement = kernels.reduce((a, k) => Math.max(a, k.peakAmusement), 0);

  // ── C 사람에 대한 선택적 관심 + 낮은 각성 ──
  const personInterest = clamp01(
    PERSON_PROBES.reduce((a, id) => Math.max(a, (got(id)?.onTargetMs || 0) / 6000), 0)
  );
  const arousal = Math.max(defensive, explore, vigilance);

  // §2-4 는 "공포 → 블랙코미디 → 로맨스" 순서로 확인하라고 한다. 이산 선택을
  // 하지 않기로 했으므로(구현_리스크 §3) 순서를 하드 분기가 아니라 억제로 옮긴다:
  // 공포 신호가 뚜렷하면 코미디 쪽 점수를 깎는다.
  const Hraw = (defensive * (1 - amusement * 0.8) + vigilance + slowReturn) / 3;
  const Craw = (explore + confirm + Math.max(fastReturn, amusement)) / 3 * (1 - clamp01(Hraw) * 0.5);
  // 로맨스는 잔여값이 아니라 "사람 프로브에 대한 관심 + 낮은 각성"으로 잰다.
  // 원안의 약점(§1-3 "로맨스는 표준 감정 모델로 안 잡힘")을 프로브 구조가
  // 푸는 지점이다 — 감정이 아니라 반응 프로파일로 정의된다.
  const Rraw = (personInterest + (1 - clamp01(arousal))) / 2;

  const sum = Hraw + Craw + Rraw || 1;
  const scores = { R: Rraw / sum, H: Hraw / sum, C: Craw / sum };

  return {
    scores,
    signals: {
      defensive: Number(defensive.toFixed(3)),
      vigilance: Number(vigilance.toFixed(3)),
      slowReturn: Number(slowReturn.toFixed(3)),
      fastReturn: Number(fastReturn.toFixed(3)),
      explore: Number(explore.toFixed(3)),
      exploreTwos,
      confirm: Number(confirm.toFixed(3)),
      amusement: Number(amusement.toFixed(3)),
      personInterest: Number(personInterest.toFixed(3)),
      arousal: Number(arousal.toFixed(3)),
    },
    reason: `방어 ${defensive.toFixed(2)} · 경계 ${vigilance.toFixed(2)} · 탐색 ${exploreTwos}개 2단계 · 사람관심 ${personInterest.toFixed(2)}`,
  };
}
