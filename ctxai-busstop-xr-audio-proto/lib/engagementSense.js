// 집중도·잔움직임·탐침 반응 센서 — 헤드셋 자세(초당 72~90회)만으로 "얼마나 빠져 있는가"를
// 시계열 데이터로 남긴다. lib/headPoseSense.js 가 같은 자세 스트림에서 장르 증거 {R,H,C} 를
// 만드는 동안, 이 모듈은 파일럿·모델 학습·제작 도구용 데이터 세 층을 뽑는다.
//
//   raw        원시 자세 샘플 전량 (t_ms, yaw, pitch, roll, x_mm, y_mm, z_mm, intent_az, stim).
//              아래 임계값은 전부 잠정치라서 원시를 남겨야 나중에 다시 계산할 수 있다. 5분 세션이
//              약 2~3만 행, CSV 문자열로 1MB 안팎이다.
//   windows    2초 창마다 잔움직임 특징: 각속도 RMS, 위치 흔들림, 정지 비율, roll 활동, 0.5~4Hz 대역
//              RMS(안절부절), 4~6Hz 대역 RMS(웃음 리듬 후보), 방향 전환 횟수, 정면 이탈 비율,
//              의도 방향 일치율, 기준 대비 pitch, 후퇴.
//   stimuli    탐침(연출된 사건)마다 반응 레코드: 예감(자극 전 3초에 그쪽을 먼저 봤는가 preLook · 그쪽으로 돌렸는가 preTurn)·시작 순간 이미 그쪽을
//              보던 중(atOnset)·자극 전 움직임·응답 여부(돌아봄 turned·빠른 움직임·후퇴)·시선 지연·움직임 지연·
//              응시·최대 편차·최대 각속도·후퇴·회복·재확인, 그리고 자극 메타(시각·종류·채널·용량·같은 채널 몇 번째).
//   engagement 창마다 집중도 합성 점수(잠정) = 탐침 응답률 · 잔움직임 억제 · 의도 일치의 가중 평균.
//
// 근거: 몰입할 때 목적 없는 움직임이 억제된다(비도구적 움직임 억제, NIMI), 빠져나간 관객은 탐침에
// 반응하지 않는다(정향 반응), 작가가 보게 하려던 곳을 본다(의도 일치). 합성 가중치와 기준값은
// 파일럿 자기보고로 다시 맞춘다 — 그래서 합성 점수보다 원시·창·탐침 레코드가 본체다.
//
// 콘텐츠 동기 제외: 탐침이 진행 중인 창과 웃음 후보 창에서는 잔움직임을 "산만함"으로 세지 않는다.
// 그 움직임은 자극에 대한 정향이거나 웃음이지 이탈이 아니다.
//
// track 탐침 마스킹: 판초 인물처럼 수십 초 동안 추적하는 사건(kind "track") 위에 다른 탐침(트럭·포스터·
// 고양이·개구리)이 겹치면, 그 탐침을 향한 정향 움직임(최대 각속도·최대 편차·후퇴·움직임 지연)은 track
// 레코드에 넣지 않는다. 그 표본은 겹친 탐침의 반응이지 추적 대상에 대한 반응이 아니다 — 안 가리면
// 개구리에 놀란 각속도가 인물 추적의 반응 크기로 둔갑해 θ̂·x̂ 를 오염시킨다. 응시(lookSec)와 시선 지연은
// 방위로 가르므로 계속 세고, 가린 시간은 maskedSec 로 남긴다.
//
// 진행 중 자극의 잠정 레코드(B153·B159): 레코드는 자극이 끝나고 꼬리(tail)까지 지나야 닫힌다(observeUntil ≈ onset + dur + 4초 ·
// track 종류는 수십 초). 그 전에는 data().stimuli 에 없어서 실시간 x̂(모니터·판정 뒤 제어기)이 반응을 약 4.5초 늦게, /interim S1(94초
// 추적)은 1:53 에야 보였다. 그래서 data() 는 진행 중 자극도 같은 모양의 잠정 레코드(provisional 1 · 지금까지의 peakAmp·maxVel·응답)로
// `active` 에 따로 돌려준다 — x̂ 계열은 그것을 더해 그리고 "잠정" 으로 표시하되, θ̂ 적합(fitViewerModel)·슬롯 결정(decideSlotNow ·
// B194)·세션 저장은 닫힌 레코드(stimuli)만 쓴다. 잠정 값은 지금까지의 최댓값이라 닫힌 값보다 클 수 없고, recoverySec 이 아직 없으면 x̂ 는
// 기본 회복 시정수로 그린다(닫히면 실제 회복으로 다시 계산된다).
//
// 좌표 규약은 headPoseSense 와 같다 — yaw 정면 0·오른쪽 +, pitch 는 카메라 euler.x(위가 +), roll 은
// euler.z, 위치는 미터. 시각은 체험 시작 기준 실제 경과 초(배속과 무관).

export const ENGAGE_PARAMS = Object.freeze({
  LOOK_TOL_DEG: 28,        // 방위 ±이만큼이면 "그쪽을 봤다" (headPoseSense 와 동일)
  STILL_DEG_S: 5,          // 각속도가 이 아래면 "정지" 샘플
  REVERSAL_MIN_DEG: 3,     // 이만큼 이상 움직인 뒤 방향이 바뀌어야 방향 전환으로 센다 (노이즈 제외)
  WINDOW_SEC: 2,           // 잔움직임 창 길이
  PRE_LOOK_SEC: 3,         // 예감: 자극 전 이만큼 안에 그쪽을 봤는가
  PRE_MOVE_SEC: 1,         // 자극 전 이만큼 안의 최대 각속도
  RESPONSE_SEC: 2.5,       // 탐침 응답으로 치는 시간 (track 종류는 사건 길이 전체)
  MOVE_RESP_DEG_S: 60,     // 이보다 빠른 고개 움직임은 "움직임 응답"
  RETREAT_M: 0.07,         // 뒤로 이만큼 물러나면 응답 (헤드셋 세션에서만 의미)
  BASELINE_SEC: 5,         // 초기 자세 기준선
  RESAMPLE_HZ: 60,         // 대역 RMS 계산용 균일 격자
  FIDGET_BAND: [0.5, 4],   // [lo, hi) Hz — 안절부절
  LAUGH_BAND: [4, 6],      // [lo, hi) Hz — 웃음 리듬 후보
  FIDGET_REF_DEG_S: 30,    // 이 각속도 RMS 면 잔움직임 억제 0 (잠정)
  JITTER_REF_MM: 6,        // 이 위치 흔들림이면 억제 0 (잠정)
  LAUGH_REF_DEG_S: 60,     // 4~6Hz 대역 RMS 가 이 값이면 웃음 점수 1 (잠정)
  PROBE_ALPHA: 0.35,       // 탐침 응답률의 지수 가중 갱신 계수
  WEIGHTS: { probe: 0.45, calm: 0.35, intent: 0.2 },
});

export const RAW_COLUMNS = ["t_ms", "yaw", "pitch", "roll", "x_mm", "y_mm", "z_mm", "intent_az", "stim"];

function clamp01(x) { return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; }
function wrap180(d) { return ((d % 360) + 540) % 360 - 180; }
function angDiff(a, b) { return Math.abs(wrap180(a - b)); }
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * 불규칙 표본 [{t, v}] 을 균일 격자로 보간해 평균을 빼고, 각 대역 [lo, hi) Hz 의 RMS 를 낸다.
 * 짧은 창(2초)이라 FFT 대신 대역 안 빈만 직접 DFT 한다 — 빈 12개 × 120표본 정도.
 */
export function bandRms(samples, tStart, dur, hz, bands) {
  if (!samples.length || !(dur > 0)) return bands.map(() => 0);
  const N = Math.max(8, Math.round(dur * hz));
  const grid = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const tt = tStart + i / hz;
    while (j + 1 < samples.length && samples[j + 1].t <= tt) j++;
    const a = samples[j], b = samples[Math.min(j + 1, samples.length - 1)];
    const span = b.t - a.t;
    grid[i] = span > 0 ? a.v + (b.v - a.v) * clamp01((tt - a.t) / span) : a.v;
  }
  let mean = 0; for (let i = 0; i < N; i++) mean += grid[i]; mean /= N;
  for (let i = 0; i < N; i++) grid[i] -= mean;
  const df = hz / N;
  return bands.map(([lo, hi]) => {
    const kLo = Math.max(1, Math.ceil(lo / df)), kHi = Math.min(Math.floor(N / 2), Math.floor(hi / df - 1e-9));
    let sum = 0;
    for (let k = kLo; k <= kHi; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) { const ph = (2 * Math.PI * k * n) / N; re += grid[n] * Math.cos(ph); im -= grid[n] * Math.sin(ph); }
      sum += re * re + im * im;
    }
    return Math.sqrt(2 * sum) / N; // 단측 스펙트럼 → 대역 제한 신호의 RMS
  });
}

/** 한 창의 표본 [{t, yaw, pitch, roll, x, y, z, intent, stim}] → 잔움직임 특징. 표본이 4개 미만이면 null. */
export function windowFeatures(buf, baseline, P = ENGAGE_PARAMS) {
  const n = buf.length;
  if (n < 4) return null;
  const t0 = buf[0].t, t1 = buf[n - 1].t, dur = Math.max(1e-3, t1 - t0);
  let sumV2 = 0, still = 0, rollAct = 0, away = 0, intentN = 0, intentHit = 0, stimN = 0, pitchSum = 0, retreat = 0;
  let mx = 0, my = 0, mz = 0;
  const vPitch = [], vRoll = [];
  let reversals = 0, dir = 0, extreme = buf[0].yaw;
  for (let i = 0; i < n; i++) {
    const s = buf[i];
    pitchSum += s.pitch; mx += s.x; my += s.y; mz += s.z;
    if (angDiff(s.yaw, baseline.yaw) > P.LOOK_TOL_DEG) away++;
    if (s.intent != null) { intentN++; if (angDiff(s.yaw, s.intent) <= P.LOOK_TOL_DEG) intentHit++; }
    if (s.stim) stimN++;
    retreat = Math.max(retreat, s.z - baseline.z);
    if (i > 0) {
      const p = buf[i - 1];
      const dt = Math.max(1e-3, s.t - p.t);
      const dy = wrap180(s.yaw - p.yaw), dp = s.pitch - p.pitch, dr = wrap180(s.roll - p.roll);
      const v = Math.sqrt(dy * dy + dp * dp + dr * dr) / dt;
      sumV2 += v * v;
      if (v < P.STILL_DEG_S) still++;
      rollAct += Math.abs(dr);
      vPitch.push({ t: s.t, v: dp / dt });
      vRoll.push({ t: s.t, v: dr / dt });
      const d = wrap180(s.yaw - extreme);
      if (dir === 0) { if (Math.abs(d) >= P.REVERSAL_MIN_DEG) { dir = Math.sign(d); extreme = s.yaw; } }
      else if (Math.sign(d) === dir) extreme = s.yaw;
      else if (Math.abs(d) >= P.REVERSAL_MIN_DEG) { reversals++; dir = -dir; extreme = s.yaw; }
    }
  }
  mx /= n; my /= n; mz /= n;
  let jit = 0;
  for (const s of buf) { const dx = s.x - mx, dy = s.y - my, dz = s.z - mz; jit += dx * dx + dy * dy + dz * dz; }
  const [fidP, laughP] = bandRms(vPitch, t0, dur, P.RESAMPLE_HZ, [P.FIDGET_BAND, P.LAUGH_BAND]);
  const [fidR, laughR] = bandRms(vRoll, t0, dur, P.RESAMPLE_HZ, [P.FIDGET_BAND, P.LAUGH_BAND]);
  return {
    t0: r1(t0), t1: r1(t1), n,
    angVelRms: r2(Math.sqrt(sumV2 / (n - 1))),
    stillRatio: r3(still / (n - 1)),
    rollActivity: r2(rollAct / dur),
    posJitter: r2(Math.sqrt(jit / n) * 1000),
    band05_4: r2(Math.hypot(fidP, fidR)),
    band4_6: r2(Math.hypot(laughP, laughR)),
    reversals,
    awayRatio: r3(away / n),
    intentMatch: intentN ? r3(intentHit / intentN) : null,
    stimRatio: r3(stimN / n),
    pitchRel: r2(pitchSum / n - baseline.pitch),
    retreat: r3(retreat),
  };
}

/** 집중도 시계열에서 "꺾인 시점" — 앞 구간 평균과 뒤 구간 평균의 차가 가장 큰 시각. 차가 minDrop 미만이면 null. */
export function changePoint(series, { minSegSec = 20, minDrop = 0.2 } = {}) {
  if (!series || series.length < 4) return null;
  const tEnd = series[series.length - 1].t, tStart = series[0].t;
  let best = null;
  let sumBefore = 0;
  const total = series.reduce((a, p) => a + p.score, 0);
  for (let i = 1; i < series.length; i++) {
    sumBefore += series[i - 1].score;
    const t = series[i].t;
    if (t - tStart < minSegSec || tEnd - t < minSegSec) continue;
    const before = sumBefore / i, after = (total - sumBefore) / (series.length - i);
    const drop = before - after;
    if (!best || drop > best.drop) best = { t, before: r3(before), after: r3(after), drop: r3(drop) };
  }
  return best && best.drop >= minDrop ? best : null;
}

function mergeSegments(items, gapSec) {
  const out = [];
  for (const w of [...items].sort((a, b) => a.t0 - b.t0)) {
    const last = out[out.length - 1];
    if (last && w.t0 - last.t1 <= gapSec) { last.t1 = Math.max(last.t1, w.t1); last.score = Math.max(last.score, w.score); }
    else out.push({ t0: w.t0, t1: w.t1, score: w.score });
  }
  return out;
}

function nearestStimulus(stimuli, t) {
  let best = null;
  for (const s of stimuli || []) {
    const d = Math.abs(s.onset - t);
    if (!best || d < best.d) best = { d, name: s.name, onset: s.onset };
  }
  return best && best.d <= 20 ? { name: best.name, onset: best.onset } : null;
}

/** 세션 하나의 요약 — 종료 카드와 내보내기 스크립트가 같은 함수를 쓴다. */
export function summarizeEngagement({ windows = [], stimuli = [], engagement = [] } = {}, P = ENGAGE_PARAMS) {
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const responded = stimuli.filter((s) => s.responded).length;
  const scored = engagement.map((e, i) => ({ t0: windows[i]?.t0 ?? e.t - P.WINDOW_SEC, t1: e.t, score: e.score }));
  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const label = (seg) => ({ ...seg, near: nearestStimulus(stimuli, seg.t0) });
  const top = mergeSegments(byScore.slice(0, 3), P.WINDOW_SEC + 0.5).sort((a, b) => b.score - a.score).map(label);
  const low = mergeSegments(byScore.slice(-3), P.WINDOW_SEC + 0.5).sort((a, b) => a.score - b.score).map(label);
  const laughWins = scored.filter((s, i) => (engagement[i]?.laugh ?? 0) >= 0.5);
  const intentVals = windows.map((w) => w.intentMatch).filter((v) => v != null);
  const m = mean(engagement.map((e) => e.score));
  return {
    stimuli: stimuli.length,
    responded,
    probeResponseRate: stimuli.length ? r3(responded / stimuli.length) : null,
    anticipationRate: stimuli.length ? r3(stimuli.filter((s) => s.preLook).length / stimuli.length) : null,
    meanEngagement: m == null ? null : r3(m),
    calmMean: r3(mean(engagement.map((e) => e.calm)) ?? 0),
    fidgetMean: r2(mean(windows.map((w) => w.angVelRms)) ?? 0),
    intentMatchMean: intentVals.length ? r3(mean(intentVals)) : null,
    topSegments: top,
    lowSegments: low,
    laughEpisodes: mergeSegments(laughWins, P.WINDOW_SEC + 0.5),
    dropPoint: changePoint(engagement),
  };
}

/**
 * @param {object} opts
 * @param {(name, detail) => void} [opts.mark]  연출 상태의 이벤트 로그 (markEvent)
 * @param {object} [opts.params]  ENGAGE_PARAMS 덮어쓰기 (테스트·파일럿 보정용)
 */
export function createEngagementSensor({ mark, params } = {}) {
  const P = { ...ENGAGE_PARAMS, ...(params || {}) };
  let t = 0;
  let baseline = null;
  let prev = null;
  const rows = [];                 // 원시 CSV 행
  const history = [];              // 최근 PRE_LOOK_SEC 초 {t, yaw, v}
  let buf = [];                    // 현재 창의 표본
  let winStart = 0;
  const windows = [];
  const active = new Map();        // 진행 중 탐침
  const done = [];                 // 끝난 탐침
  const channelCount = new Map();
  let intentAz = null;             // 대사 등에서 페이지가 지정한 "지금 볼 곳"
  let probeResp = 0.5;             // 탐침 응답률 (지수 가중, 사전값 0.5)
  let calm = 0.7;                  // 마지막으로 갱신된 잔움직임 억제
  const series = [];

  function setIntent(az) { intentAz = Number.isFinite(az) ? az : null; }

  function beginStimulus({ name, azimuth, dur, kind = "probe", channel = "av", dose = null, tail = 4 }) {
    const nth = channelCount.get(channel) || 0;
    channelCount.set(channel, nth + 1);
    const onset = t;
    // preTurn — 자극 전 창 안에서 다른 곳을 보다가 그쪽으로 고개를 돌렸는가(예감). preLook 은 그쪽을 본 적이 있는가라서, 정면 가까운
    // 사건(물보라 8°)은 정면만 보던 관객도 1 이 된다 — 예감이 아니라 원래 시선이다(B158 후속). x̂ 의 예감 상승은 preTurn 을 쓴다.
    let preLook = 0, preMove = 0, preAway = 0, preTurn = 0;
    for (const h of history) {
      if (h.t < onset - P.PRE_LOOK_SEC) continue;
      const on = angDiff(h.yaw, azimuth) <= P.LOOK_TOL_DEG;
      if (on) { preLook = 1; if (preAway) preTurn = 1; } else preAway = 1;
      if (h.t >= onset - P.PRE_MOVE_SEC) preMove = Math.max(preMove, h.v);
    }
    active.set(name, {
      name, kind, channel, dose, nth, onset: r2(onset), dur: r2(dur), azimuth,
      observeUntil: onset + dur + tail, respWindow: kind === "track" ? dur : P.RESPONSE_SEC,
      preLook, preTurn, preMove: r1(preMove), yawAtOnset: prev?.yaw ?? baseline?.yaw ?? 0,
      // 자극이 시작되는 순간 이미 사건 방향 ±LOOK_TOL 안을 보고 있었는가 — 그러면 첫 표본에서 looked 가 켜지지만 고개를 돌린 것이 아니다(B158)
      atOnset: angDiff(prev?.yaw ?? baseline?.yaw ?? 0, azimuth) <= P.LOOK_TOL_DEG ? 1 : 0,
      looked: 0, lookLatency: null, moveLatency: null, lookSec: 0, peakAmp: 0, maxVel: 0, retreat: 0,
      leftAt: null, everLeft: false, recoverySec: null, recheck: 0, maskedSec: 0,
    });
    mark?.("stim:start", { name, azimuth, channel, dose, nth });
  }

  // 탐침 상태 → 레코드. 닫을 때(final)와 진행 중 잠정 레코드(B153)가 같은 규칙으로 응답을 판정한다 — 잠정 레코드는 지금까지의 값이라
  // 닫힌 값을 넘지 않고, 닫히면 같은 이름의 레코드가 stimuli 로 옮겨 간다.
  function recordOf(st, final) {
    // 응답 = 사건 쪽으로 고개를 돌림(turned) · 빠른 고개 움직임 · 후퇴. 이미 그쪽을 보고 있던 사건(atOnset)은 looked 가 저절로 켜지므로
    // 돌아본 것으로 세지 않는다 — 1배속 /interim 차분형은 정면 8° 물보라를 보고만 있었는데(최대 편차 0.6°·각속도 2.4°/s) 응답으로 세여
    // θ̂ 응답 수와 "돌아본 사건" 에 들어갔다(B158). 보고 있던 사건에 움찔했으면 움직임 응답으로 그대로 센다.
    const turned = st.looked && !st.atOnset && st.lookLatency != null && st.lookLatency <= st.respWindow ? 1 : 0;
    const responded = turned || st.moveLatency != null || st.retreat >= P.RETREAT_M ? 1 : 0;
    const rec = {
      name: st.name, kind: st.kind, channel: st.channel, dose: st.dose, nth: st.nth, onset: st.onset, dur: st.dur, azimuth: st.azimuth,
      preLook: st.preLook, preTurn: st.preTurn, preMove: st.preMove, atOnset: st.atOnset, responded, turned, looked: st.looked, lookLatency: st.lookLatency, moveLatency: st.moveLatency,
      lookSec: r2(st.lookSec), peakAmp: r1(st.peakAmp), maxVel: r1(st.maxVel), retreat: r3(st.retreat), recoverySec: st.recoverySec, recheck: st.recheck,
      maskedSec: r2(st.maskedSec),
    };
    // 진행 중이면 잠정 표시와 경과(초) — 모니터가 "잠정"·"진행 중" 을 적고, 닫힌 레코드와 구별해 θ̂·결정에서 걸러 낸다
    return final ? rec : { ...rec, provisional: 1, elapsed: r2(t - st.onset) };
  }

  function closeStimulus(st) {
    active.delete(st.name);
    const rec = recordOf(st, true);
    const responded = rec.responded;
    done.push(rec);
    // 집중도의 탐침 항은 "빠져나가지 않았는가" 를 잰다 — 이미 보던 사건을 계속 지켜본 관객(atOnset · 응시가 사건 길이의 절반 이상)은
    // 반응(responded)은 아니어도 빠져나간 것도 아니므로 응답률을 깎지 않는다. θ̂·카드의 반응 비율은 responded 그대로다.
    const attended = responded || (st.atOnset && st.lookSec >= 0.5 * st.dur) ? 1 : 0;
    probeResp += P.PROBE_ALPHA * (attended - probeResp);
    mark?.("stim:done", rec);
  }

  function closeWindow() {
    const w = windowFeatures(buf, baseline, P);
    buf = [];
    winStart = t;
    if (!w) return;
    windows.push(w);
    const laugh = clamp01(w.band4_6 / P.LAUGH_REF_DEG_S);
    const fidget = w.angVelRms / P.FIDGET_REF_DEG_S + w.posJitter / P.JITTER_REF_MM;
    // 탐침에 닿은 창과 웃음 후보 창의 움직임은 산만함이 아니다(정향·웃음) — 억제 값을 갱신하지 않는다
    if (w.stimRatio === 0 && laugh < 0.5) calm = clamp01(1 - fidget);
    const intent = w.intentMatch;
    const W = P.WEIGHTS;
    const score = intent == null
      ? (W.probe * probeResp + W.calm * calm) / (W.probe + W.calm)
      : W.probe * probeResp + W.calm * calm + W.intent * intent;
    series.push({ t: w.t1, score: r3(score), probeResp: r3(probeResp), calm: r3(calm), intent: intent == null ? null : r3(intent), laugh: r3(laugh), fidget: r2(fidget) });
  }

  /**
   * 매 프레임. 각도는 도, 위치는 미터, dt 는 실제 경과 초.
   * @param {{yaw:number, pitch:number, roll?:number, x?:number, y?:number, z?:number}} s
   */
  function update(s, dt) {
    if (!(dt > 0)) return;
    t += dt;
    const yaw = s.yaw, pitch = s.pitch, roll = s.roll ?? 0, x = s.x ?? 0, y = s.y ?? 0, z = s.z ?? 0;
    if (!baseline) baseline = { yaw, pitch, z };
    else if (t < P.BASELINE_SEC) {
      baseline.yaw += (yaw - baseline.yaw) * 0.1;
      baseline.pitch += (pitch - baseline.pitch) * 0.1;
      baseline.z += (z - baseline.z) * 0.1;
    }
    const v = prev ? Math.hypot(wrap180(yaw - prev.yaw), pitch - prev.pitch, wrap180(roll - prev.roll)) / dt : 0;
    const retreat = Math.max(0, z - baseline.z);

    // 진행 중 탐침 — track 위에 다른 탐침이 겹친 표본에서는 track 의 정향 지표를 갱신하지 않는다(머리말 참조)
    let latest = null;
    let probeActive = false;
    for (const st of active.values()) if (st.kind !== "track") { probeActive = true; break; }
    for (const st of active.values()) {
      if (!latest || st.onset > latest.onset) latest = st;
      const since = t - st.onset;
      const lookingAt = angDiff(yaw, st.azimuth) <= P.LOOK_TOL_DEG;
      if (st.kind === "track" && probeActive) st.maskedSec += dt;
      else {
        st.maxVel = Math.max(st.maxVel, v);
        st.retreat = Math.max(st.retreat, retreat);
        st.peakAmp = Math.max(st.peakAmp, angDiff(yaw, st.yawAtOnset));
        if (st.moveLatency == null && v >= P.MOVE_RESP_DEG_S && since <= st.respWindow) st.moveLatency = r2(since);
      }
      if (t <= st.onset + st.dur + 1.5) {
        if (lookingAt) { if (!st.looked) { st.looked = 1; st.lookLatency = r2(since); } st.lookSec += dt; st.leftAt = null; }
        else if (st.looked && st.leftAt == null) { st.leftAt = t; st.everLeft = true; }
      } else if (lookingAt && st.looked) st.recheck = 1;
      if (st.leftAt != null && st.recoverySec == null && angDiff(yaw, baseline.yaw) < P.LOOK_TOL_DEG * 0.6) st.recoverySec = r2(t - st.leftAt);
    }
    for (const st of [...active.values()]) if (t >= st.observeUntil) closeStimulus(st);

    const stimName = latest && t <= latest.onset + latest.dur + 1.5 ? latest.name : "";
    const intentEff = stimName ? latest.azimuth : intentAz;

    rows.push([Math.round(t * 1000), r1(yaw), r1(pitch), r1(roll), Math.round(x * 1000), Math.round(y * 1000), Math.round(z * 1000), intentEff == null ? "" : r1(intentEff), stimName].join(","));
    history.push({ t, yaw, v });
    while (history.length && history[0].t < t - P.PRE_LOOK_SEC - 0.5) history.shift();
    // 창을 먼저 닫고 나서 이번 표본을 새 창에 넣는다 — 경계에 걸친 표본이 앞 창을 오염시키지
    // 않도록(부동소수점 때문에 자극·웃음 시작 표본 하나가 직전 정지 창에 새는 것을 막는다).
    if (t - winStart >= P.WINDOW_SEC) closeWindow();
    buf.push({ t, yaw, pitch, roll, x, y, z, intent: intentEff, stim: stimName });

    prev = { yaw, pitch, roll };
  }

  function current() {
    const last = series[series.length - 1];
    return { score: last?.score ?? null, probeResp: r3(probeResp), calm: r3(calm), laugh: last?.laugh ?? 0, stimuli: done.length, responded: done.filter((d) => d.responded).length, active: active.size };
  }

  // 가벼운 접근자 — 원시 CSV 를 만들지 않는다. 250ms HUD·모니터가 매 틱 부르므로 report() 대신 이걸 쓴다.
  // stimuli 는 닫힌 레코드만(θ̂·슬롯 결정·세션 저장용), active 는 진행 중 자극의 잠정 레코드(실시간 x̂ 표시용 · B153·B159 · 머리말 참조).
  function data() { return { elapsed: r1(t), windows, stimuli: done, engagement: series, active: [...active.values()].map((st) => recordOf(st, false)) }; }

  function report() {
    return {
      version: 1,
      params: P,
      elapsed: r1(t),
      rateHz: r1(rows.length / Math.max(1e-3, t)),
      baseline: baseline ? { yaw: r1(baseline.yaw), pitch: r1(baseline.pitch), z: r3(baseline.z) } : null,
      raw: { columns: RAW_COLUMNS, csv: `${RAW_COLUMNS.join(",")}\n${rows.join("\n")}` },
      windows,
      stimuli: done,
      engagement: series,
      summary: summarizeEngagement({ windows, stimuli: done, engagement: series }, P),
    };
  }

  return { update, beginStimulus, setIntent, current, data, report };
}
