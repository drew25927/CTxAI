// 긴장 추정 x̂(t) — engagementSense 의 창·탐침에서 연속 긴장 궤적을 만든다.
//
// 궤적 추종 연출의 관측 축이다. 제어기(slotController)가 "지금 이 관객의 긴장이 목표 곡선의
// 어디에 있는가"를 알아야 다음 자극을 고른다. 스냅숏 감정 라벨이 아니라 변화의 모양이 필요하다.
//
// 모델(인과·causal):
//   x̂(t) = clamp01( BASE + Σ_k A_k·kernel(t − onset_k; τ_k) + FID·fidget(t) )
//   A_k    = K_RESP · responseMagnitude(자극 k)         반응이 클수록 큰 봉우리
//   kernel = 자극 뒤 지수 감쇠(회복 시정수 τ_k = recoverySec 또는 기본값), 자극 전 preLook 이면 완만한 예감 상승
//   fidget = 잔움직임(각속도)에서 온 낮은 지속 각성
//
// 사건 창은 탐침 반응이, 사이는 감쇠와 잔움직임이 채운다. 값은 0~1. τ_k 로 "회복이 느린 관객은
// 봉우리가 오래 남는다"가 자연히 나온다. 가중치는 잠정치 — 파일럿 자기보고로 보정한다.

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

/** 자극 하나가 시각 t 에 더하는 긴장 기여. */
function stimContribution(st, t, P) {
  const onset = st.onset ?? st.t ?? 0;
  const A = P.K_RESP * responseMagnitude(st);
  if (t < onset) {
    // 예감 — 자극 직전에 그쪽을 미리 봤을 때만 완만히 오른다
    if (!st.preLook) return 0;
    const dt = onset - t;
    if (dt > P.ANT_SEC) return 0;
    return P.K_ANT * st.preLook * (1 - dt / P.ANT_SEC);
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
 * 창 시각마다 긴장 궤적을 만든다.
 * @param {{windows:Array, stimuli:Array}} report  engagementSense report()
 * @returns {Array<{t, tension, fromStim, fidget}>}
 */
export function estimateTensionSeries({ windows = [], stimuli = [] } = {}, params = TENSION_PARAMS) {
  const P = params;
  return windows.map((w) => {
    const t = w.t1;
    let s = 0;
    for (const st of stimuli) s += stimContribution(st, t, P);
    const fid = P.FID * clamp01((w.angVelRms || 0) / P.FID_REF);
    return { t, tension: r3(clamp01(P.BASE + s + fid)), fromStim: r3(s), fidget: r3(fid) };
  });
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
