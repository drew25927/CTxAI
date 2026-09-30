// 긴장 추정 x̂(t) — engagementSense 의 창·탐침에서 연속 긴장 궤적을 만든다.
//
// 궤적 추종 연출의 관측 축이다. 제어기(slotController)가 "지금 이 관객의 긴장이 목표 곡선의
// 어디에 있는가"를 알아야 다음 자극을 고른다. 스냅숏 감정 라벨이 아니라 변화의 모양이 필요하다.
//
// 모델(인과·causal):
//   x̂(t) = clamp01( BASE + Σ_k A_k·kernel(t − onset_k; τ_k) + FID·fidget(t) )
//   A_k    = K_RESP · responseMagnitude(자극 k)         반응이 클수록 큰 봉우리 · 반응하지 않은 사건(responded 0)은 0
//   kernel = 자극 뒤 지수 감쇠(회복 시정수 τ_k = recoverySec 또는 기본값), 자극 전 그쪽으로 고개를 돌렸으면(preTurn) 완만한 예감 상승(반응한 사건만)
//   fidget = 잔움직임(각속도)에서 온 낮은 지속 각성
//
// 사건 창은 탐침 반응이, 사이는 감쇠와 잔움직임이 채운다. 값은 0~1. τ_k 로 "회복이 느린 관객은
// 봉우리가 오래 남는다"가 자연히 나온다. 가중치는 잠정치 — 파일럿 자기보고로 보정한다.
// 계열(estimateTensionSeries)은 2초 창마다 그 창 안의 최댓값을 창 끝 시각에 찍는다(B150) — 창 끝 한 점만 재면
// 회복이 빠른 관객의 봉우리가 창과 봉우리의 위상에 따라 보였다 안 보였다 했다.

import { responseMagnitude } from "./viewerModel.js";

export const TENSION_PARAMS = Object.freeze({
  BASE: 0.12,          // 아무 일 없을 때의 바닥 긴장
  K_RESP: 0.9,         // 반응 크기 → 봉우리 높이
  DEFAULT_TAU: 2.0,    // recoverySec 이 없을 때의 회복 시정수(초)
  RISE_SEC: 0.6,       // 자극 뒤 봉우리까지 상승 시간
  ANT_SEC: 3.0,        // 예감 상승 창(자극 전)
  K_ANT: 0.18,         // 예감 상승 높이
  FID: 0.15,           // 잔움직임 → 지속 각성
  FID_REF: 30,         // 각속도 RMS 이 값이면 fidget 항 1 (deg/s)
});

function clamp01(x) { return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; }
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * 예감 세기 — 자극 전에 그쪽으로 고개를 돌렸는가(preTurn). preTurn 이 없는 옛 레코드는 preLook.
 * preLook 만으로는 정면 가까운 사건(물보라 8°)을 정면만 보던 관객도 1 이라, 1배속 /interim 차분형은 움직이지 않은 물보라에서
 * x̂ 가 0.31 로 가장 높았다(B158 후속 · 턴 40).
 */
function anticipation(st) { return st.preTurn ?? st.preLook ?? 0; }

/** 자극 하나가 시각 t 에 더하는 긴장 기여. */
function stimContribution(st, t, P) {
  const onset = st.onset ?? st.t ?? 0;
  // 반응하지 않은 사건은 봉우리가 없다 — θ̂(fitViewerModel)도 responded 0 은 버린다. 이미 보던 사건을 계속 본 응시(lookSec)가
  // 반응 크기로 둔갑하지 않게 한다(B158). responded 가 없는 레코드는 예전처럼 크기만 본다.
  const A = st.responded === 0 ? 0 : P.K_RESP * responseMagnitude(st);
  if (t < onset) {
    // 예감 — 자극 직전에 그쪽으로 고개를 돌렸을 때만 완만히 오른다. 반응하지 않은 사건은 예감도 없다(B195) — 직전에 돌려 놓고
    // 계속 보기만 한 관객(preTurn 1 · responded 0)은 예감 항만으로 onset 직전 fromStim 0.18 봉우리가 생겼다(검토 턴 44)
    const ant = st.responded === 0 ? 0 : anticipation(st);
    if (!ant) return 0;
    const dt = onset - t;
    if (dt > P.ANT_SEC) return 0;
    return P.K_ANT * ant * (1 - dt / P.ANT_SEC);
  }
  const dt = t - onset;
  const tau = st.recoverySec != null && st.recoverySec > 0 ? st.recoverySec : P.DEFAULT_TAU;
  const rise = dt < P.RISE_SEC ? dt / P.RISE_SEC : 1;                 // 봉우리까지 빠른 상승
  const decay = Math.exp(-Math.max(0, dt - P.RISE_SEC) / tau);        // 그 뒤 회복 감쇠
  return A * rise * decay;
}

/** 시각 t 의 긴장 추정. stimuli 는 engagementSense report().stimuli, win 은 그 시각 창(선택). */
export function tensionAt(stimuli, t, win = null, params = TENSION_PARAMS) {
  const P = params;
  let x = P.BASE;
  for (const st of stimuli || []) x += stimContribution(st, t, P);
  if (win) x += P.FID * clamp01((win.angVelRms || 0) / P.FID_REF);
  return clamp01(x);
}

/**
 * 창 [t0,t1] 안에서 사건 기여 합의 최댓값과 그 시각(B150).
 * 창 끝 t1 한 점만 재면 회복이 빠른 큰 반응(recoverySec 0.1 · 107° 고개 돌림)이 창 끝에서 A·e^-14 ≈ 0 이 되어
 * 봉우리가 사라진다 — 1배속 공포형 재완주에서 미세 자극 3회 중 1회만 x̂ 에 보였다(턴 32). 커널 조각(예감 선형 상승 ·
 * 상승 선형 · 지수 감쇠) 안에서 합은 볼록이라 최댓값은 조각 경계(자극 직전·봉우리 onset+RISE)나 창 끝에 있다 —
 * 그 후보만 재면 정확하다. 창이 이미 지난 시각만 보므로 인과는 그대로다.
 */
function stimMaxInWindow(stimuli, t0, t1, P) {
  const cands = [t1];
  if (Number.isFinite(t0) && t0 < t1) {
    cands.push(t0);
    for (const st of stimuli) {
      const onset = st.onset ?? st.t ?? 0;
      const pk = onset + P.RISE_SEC;                       // 반응 봉우리 꼭대기
      if (pk > t0 && pk < t1) cands.push(pk);
      if (anticipation(st) && st.responded !== 0 && onset > t0 && onset <= t1) cands.push(onset - 1e-6); // 예감 꼭대기(자극 직전)
    }
  }
  let best = -Infinity, bestT = t1;
  for (const t of cands) {
    let s = 0;
    for (const st of stimuli) s += stimContribution(st, t, P);
    if (s > best + 1e-12) { best = s; bestT = t; }
  }
  return { s: best, at: bestT };
}

/**
 * 창마다 긴장 궤적을 만든다. 점은 창 끝 시각 t1 에 찍고, 값은 그 창 안 사건 기여의 최댓값(B150)이다.
 * 창 사이 틈(한 표본)도 놓치지 않게 앞 창의 t1 부터 잰다. t0 가 없는 창은 t1 한 점만 잰다(예전 동작).
 * @param {{windows:Array, stimuli:Array}} report  engagementSense report()
 * @returns {Array<{t, tension, fromStim, fidget, tPeak}>}  tPeak — 창 안에서 사건 기여가 가장 컸던 시각
 */
export function estimateTensionSeries({ windows = [], stimuli = [] } = {}, params = TENSION_PARAMS) {
  const P = params;
  return windows.map((w, i) => {
    const t = w.t1;
    const prevT1 = i > 0 ? windows[i - 1].t1 : null;
    const t0 = Number.isFinite(w.t0) ? (Number.isFinite(prevT1) ? Math.min(w.t0, prevT1) : w.t0) : null;
    const { s, at } = stimMaxInWindow(stimuli, t0, t, P);
    const fid = P.FID * clamp01((w.angVelRms || 0) / P.FID_REF);
    return { t, tension: r3(clamp01(P.BASE + s + fid)), fromStim: r3(s), fidget: r3(fid), tPeak: Math.round(at * 100) / 100 };
  });
}

// 관측 범위(B149) — x̂ 는 사건(탐침·미세 자극)에 대한 순간 반응에 잔움직임(FID, 최대 +0.15)을 더한 값이다. 사건 기여(fromStim)가
// OBS_EPS 보다 작은 창은 바닥 긴장 + 잔움직임뿐이라, 작가 곡선이 장면 구간에 적은 "지속 긴장"(대사·안개·침묵이 만드는 분위기)과 견줄 관측이 아니다.
// 1배속 공포형 bias=H 재완주에서 장면 39창 중 목표 허용폭 안 0 — 그중 사건 반응이 있던 창은 몇 개뿐이었다(review31/scene-gap.txt).
// 그래서 모니터는 사건 사이 창을 "추종 실패" 가 아니라 "측정 밖" 으로 보이고, 연속 구동(개루프)의 효과는 x̂ 로 주장하지 않는다.
// 연속 채널 효과를 x̂ 에 더하는 모형(B77 가정 B)은 파일럿에서 이득을 재기 전에는 넣지 않는다(B20 결론).
export const OBS_EPS = 0.03; // 잠정치 — 봉우리 A·e^-3 (회복 시정수 세 배 지난 꼬리) 수준

/** 이 창의 x̂ 가 사건 반응에 근거하는가. fromStim 이 없는 계열(외부에서 만든 {t,tension})은 관측으로 본다. */
export function isObserved(p, eps = OBS_EPS) {
  return !(p && Number.isFinite(p.fromStim)) || p.fromStim >= eps;
}

/**
 * 계열을 관측 구간·사건 사이 구간으로 가른다 — 모니터가 두 모양으로 그린다.
 * 구간이 바뀌는 자리에서는 앞 구간의 마지막 점을 뒤 구간 첫 점으로도 넣어 선이 끊기지 않게 한다.
 * @returns {Array<{observed:boolean, points:Array}>}
 */
export function observedSegments(series = [], eps = OBS_EPS) {
  const out = [];
  for (const p of series) {
    const obs = isObserved(p, eps);
    const cur = out[out.length - 1];
    if (cur && cur.observed === obs) { cur.points.push(p); continue; }
    out.push({ observed: obs, points: cur ? [cur.points[cur.points.length - 1], p] : [p] });
  }
  return out;
}

/**
 * 모니터의 x̂ 읽기 — 목표와 견줄 수 있는 관측인가, 견주면 위·안·아래 중 어디인가.
 * 사건 사이(관측 아님)는 목표가 있어도 "between" — 허용폭 밖으로 칠하지 않는다.
 * @returns {{state:"between"|"above"|"in"|"below"|"none", label:string}}
 */
export function xhatReading(p, { target, tol = 0, eps = OBS_EPS } = {}) {
  if (!p || !Number.isFinite(p.tension)) return { state: "none", label: "" };
  if (!isObserved(p, eps)) return { state: "between", label: "사건 사이" };
  if (!Number.isFinite(target)) return { state: "none", label: "" };
  if (p.tension > target + tol) return { state: "above", label: "" };
  if (p.tension < target - tol) return { state: "below", label: "" };
  return { state: "in", label: "" };
}

/** 장면 구간에서 모니터가 붙이는 한 줄 — 무엇을 재지 않는지 밝힌다(B149). 장면 밖이면 null. */
export function xhatScopeNote({ scene = false, control = false } = {}) {
  if (!scene) return null;
  // 모니터 폭(292px · 11px) 한 줄에 들어가는 길이 — "(개루프)" 까지 넣으면 단어 중간에서 줄이 바뀐다(턴 32 프레임).
  // "사건 반응만 잰다" 는 코드와 달랐다 — 사건 사이 창에도 잔움직임 항이 들어간다(B189, 1배속 /interim 차분형 2:05 x̂ 0.27)
  return control ? "x̂ = 사건 반응 + 잔움직임 · 연속 구동 효과는 측정 밖" : "x̂ = 사건 반응 + 잔움직임 · 장면의 지속 긴장은 측정 밖";
}

/**
 * 추종 요약(B149) — 구간 [t0,t1] 창 중 목표 허용폭 안 창 수를 전체·관측 창으로 나눠 센다. 세션·기술 요약용.
 * 사건 사이 창의 "허용폭 밖" 은 추종 실패가 아니라 측정 밖이므로 observedInTol/observed 를 따로 본다.
 * @param targetAt (t) => {target, tol}
 */
export function trackingStats(series = [], targetAt, { t0 = -Infinity, t1 = Infinity, eps = OBS_EPS } = {}) {
  let n = 0, inTol = 0, observed = 0, observedInTol = 0, sumT = 0, sumX = 0, maxObs = null;
  for (const p of series) {
    if (!(p.t >= t0 && p.t <= t1) || !Number.isFinite(p.tension)) continue;
    const { target, tol = 0 } = targetAt(p.t) || {};
    if (!Number.isFinite(target)) continue;
    const ok = Math.abs(p.tension - target) <= tol;
    n++; sumT += target; sumX += p.tension; if (ok) inTol++;
    if (isObserved(p, eps)) { observed++; if (ok) observedInTol++; maxObs = maxObs == null ? p.tension : Math.max(maxObs, p.tension); }
  }
  return { n, inTol, observed, observedInTol, meanTarget: n ? r3(sumT / n) : null, meanXhat: n ? r3(sumX / n) : null, maxObservedXhat: maxObs == null ? null : r3(maxObs) };
}

/** 봉우리 목록 — 국소 최댓값(앞뒤보다 큰 창)과 가까운 자극 이름. 분석·모니터용. */
export function peaks(series, stimuli = [], minProm = 0.1) {
  const out = [];
  for (let i = 1; i < series.length - 1; i++) {
    const p = series[i];
    if (p.tension >= series[i - 1].tension && p.tension > series[i + 1].tension && p.tension - TENSION_PARAMS.BASE >= minProm) {
      let near = null, best = Infinity;
      for (const st of stimuli) { const d = Math.abs((st.onset ?? 0) - p.t); if (d < best) { best = d; near = st.name; } }
      out.push({ t: p.t, tension: p.tension, near: best <= 6 ? near : null });
    }
  }
  return out;
}
