// 슬롯 MPC 제어기 — 궤적 추종 연출의 결정 축.
//
// 각 슬롯에서, 현재 관객 모델 θ̂ 로 다음 몇 슬롯까지 긴장 궤적을 예측하고, 변형 후보 중
// 목표 곡선과의 편차(+서사 비용, +제약 위반 페널티)가 최소인 것을 고른다. 후보가 적어
// 완전 열거로 충분하고 매 슬롯 한 번만 돈다(수신 지평·receding horizon).
//
// 선행 기술과의 차이: Dolby·Warner 특허는 목표를 콘텐츠에 고정하고 현재 오차만 본다.
// 여기서는 (1) 관객별 동역학 θ 로 예측하고, (2) 습관화(nth)를 반영해 용량·채널을 바꾸며,
// (3) 목표가 이 관객에게 도달 불가능하면(이득 낮음) 곡선을 도달 가능한 선으로 자연히 완화한다
//    (최소 편차를 찾으므로 최대 용량을 골라도 목표에 못 미치면 그 최대를 고른다).

import { predictResponse } from "./viewerModel.js";
import { curveAt, SLOTS, slotById, variantOf } from "./tensionCurve.js";
import { TENSION_PARAMS } from "./tensionEstimate.js";

export const CONTROL_PARAMS = Object.freeze({
  LAMBDA_NARRATIVE: 0.12,   // 서사 비용 가중
  CEILING_PENALTY: 6,       // 상한 초과 벌점(제곱 계수)
  CHANNEL_PENALTY: 0.5,     // 같은 채널 연속(최소 간격 안) 벌점
  HORIZON: 2,               // 앞으로 몇 슬롯까지 예측
  RISE_SEC: TENSION_PARAMS.RISE_SEC,
  DEFAULT_TAU: TENSION_PARAMS.DEFAULT_TAU,
  K_RESP: TENSION_PARAMS.K_RESP,
});

function clamp01(x) { return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; }
const r3 = (x) => Math.round(x * 1000) / 1000;

/** 자극 하나로 도달할 봉우리 긴장. */
function predPeak(theta, x0, dose, nth, P) {
  return clamp01(x0 + P.K_RESP * predictResponse(theta, { dose, nth }));
}

/** 봉우리 뒤 dt 초 감쇠한 긴장(다음 슬롯 시작값). */
function decayTo(peak, dt, tau) {
  const base = TENSION_PARAMS.BASE;
  return clamp01(base + (peak - base) * Math.exp(-Math.max(0, dt) / tau));
}

/** 한 슬롯·한 변형의 즉시 비용과 결과 상태. */
function stepCost(track, slot, variant, x0, theta, channelCounts, prev, P) {
  const tEff = slot.t + P.RISE_SEC;
  const { target, ceiling } = curveAt(track, tEff);
  const nth = channelCounts[slot.channel] || 0;
  const peak = predPeak(theta, x0, variant.dose, nth, P);
  let cost = (peak - target) ** 2;
  if (peak > ceiling) cost += P.CEILING_PENALTY * (peak - ceiling) ** 2;
  cost += P.LAMBDA_NARRATIVE * (slot.narrativeCost || 0);
  if (prev && prev.channel === slot.channel) {
    const minGap = Math.max(slot.minGap || 0, 6);
    if (slot.t - prev.t < minGap) cost += P.CHANNEL_PENALTY;
  }
  return { cost, peak, target, ceiling, nth };
}

/** 재귀 수신 지평 — 슬롯 idx 부터 depth 만큼 최소 누적 비용. */
function horizonCost(track, cands, idx, x0, theta, channelCounts, prev, depth, P) {
  if (depth <= 0 || idx >= cands.length) return 0;
  const slot = cands[idx];
  let best = Infinity;
  for (const v of slot.variants) {
    const r = stepCost(track, slot, v, x0, theta, channelCounts, prev, P);
    const cc = { ...channelCounts, [slot.channel]: (channelCounts[slot.channel] || 0) + 1 };
    const next = cands[idx + 1];
    const x1 = next ? decayTo(r.peak, next.t - slot.t, r.nth != null ? P.DEFAULT_TAU : P.DEFAULT_TAU) : r.peak;
    const future = horizonCost(track, cands, idx + 1, x1, theta, cc, { t: slot.t, channel: slot.channel }, depth - 1, P);
    best = Math.min(best, r.cost + future);
  }
  return best;
}

/**
 * 슬롯 하나의 변형 선택.
 * @returns {{variantId, dose, predTension, target, cost, nth, reason}}
 */
export function chooseVariant(track, cands, idx, x0, theta, channelCounts, prev, params = CONTROL_PARAMS) {
  const P = params;
  const slot = cands[idx];
  let best = null;
  for (const v of slot.variants) {
    const r = stepCost(track, slot, v, x0, theta, channelCounts, prev, P);
    const cc = { ...channelCounts, [slot.channel]: (channelCounts[slot.channel] || 0) + 1 };
    const next = cands[idx + 1];
    const x1 = next ? decayTo(r.peak, next.t - slot.t, P.DEFAULT_TAU) : r.peak;
    const future = horizonCost(track, cands, idx + 1, x1, theta, cc, { t: slot.t, channel: slot.channel }, P.HORIZON - 1, P);
    const total = r.cost + future;
    if (!best || total < best.total) best = { variantId: v.id, dose: v.dose, predTension: r3(r.peak), target: r3(r.target), cost: r3(total), nth: r.nth, total };
  }
  const gap = best.predTension - best.target;
  const reason = `목표 ${best.target} / 예측 ${best.predTension}${gap < -0.08 ? " (도달 한계 — 최대 자극)" : gap > 0.08 ? " (상한 눌림)" : ""}${best.nth > 0 ? ` · 채널 ${slot.channel} ${best.nth}번째` : ""}`;
  delete best.total;
  return { ...best, reason };
}

/** 후보 슬롯 목록 — 시각 고정 슬롯을 시각 순으로. (미세 슬롯은 t 를 주면 포함) */
export function candidateSlots(extra = []) {
  const fixed = SLOTS.filter((s) => s.t != null).map((s) => ({ ...s }));
  return [...fixed, ...extra].sort((a, b) => a.t - b.t);
}

/**
 * 전 슬롯 계획을 만든다(시뮬레이터·모니터용).
 * @returns {{plan:Array, entries:Array}}  entries: chooseVariant 결과 + slotId·t·channel
 */
export function runController(track, theta, { extraSlots = [], params = CONTROL_PARAMS } = {}) {
  const P = params;
  const cands = candidateSlots(extraSlots);
  const channelCounts = {};
  let prev = null;
  let x0 = TENSION_PARAMS.BASE;
  const entries = [];
  for (let i = 0; i < cands.length; i++) {
    const slot = cands[i];
    const choice = chooseVariant(track, cands, i, x0, theta, channelCounts, prev, P);
    entries.push({ slotId: slot.id, t: slot.t, channel: slot.channel, ...choice });
    channelCounts[slot.channel] = (channelCounts[slot.channel] || 0) + 1;
    prev = { t: slot.t, channel: slot.channel };
    const next = cands[i + 1];
    x0 = next ? decayTo(choice.predTension, next.t - slot.t, P.DEFAULT_TAU) : choice.predTension;
  }
  return { entries, plan: entries.map((e) => ({ slotId: e.slotId, variantId: e.variantId, t: e.t, channel: e.channel, dose: e.dose, predTension: e.predTension })) };
}
