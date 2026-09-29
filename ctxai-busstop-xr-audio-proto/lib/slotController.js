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
/** 슬롯 사이 감쇠에 쓸 회복 시정수 — 관객별 τ(없으면 기본값). 지상진실 시뮬레이터와 같은 규약. */
function tauOf(theta, P) { return Number.isFinite(theta?.tau) && theta.tau > 0 ? theta.tau : P.DEFAULT_TAU; }

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
    const x1 = next ? decayTo(r.peak, next.t - slot.t, tauOf(theta, P)) : r.peak;
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
    const x1 = next ? decayTo(r.peak, next.t - slot.t, tauOf(theta, P)) : r.peak;
    const future = horizonCost(track, cands, idx + 1, x1, theta, cc, { t: slot.t, channel: slot.channel }, P.HORIZON - 1, P);
    const total = r.cost + future;
    if (!best || total < best.total) best = { variantId: v.id, dose: v.dose, predTension: r3(r.peak), target: r3(r.target), cost: r3(total), nth: r.nth, total };
  }
  const gap = best.predTension - best.target;
  const reason = `목표 ${best.target} / 예측 ${best.predTension}${gap < -0.08 ? " (도달 한계 — 최대 자극)" : gap > 0.08 ? " (상한 눌림)" : ""}${best.nth > 0 ? ` · 채널 ${slot.channel} ${best.nth}번째` : ""}`;
  delete best.total;
  return { ...best, reason };
}

/** 미세 자극 액추에이터의 기본값(잠정치) — microDecision 과 모니터 안내(nextAdvice)가 같은 값을 쓴다. */
export const MICRO_PARAMS = Object.freeze({ gap: 12, max: 3, doseMin: 0.2, doseMax: 0.6, doseBias: 0.2 });

/**
 * 판정 뒤 장면의 미세 자극 결정(실제 액추에이터) — 관객 긴장 x̂ 이 작가 곡선 아래로 처지면 은은한
 * 자극을 한 번 넣어 곡선 쪽으로 끌어올린다. 도입부 중립 탐침은 건드리지 않으므로 이 함수는 판정 뒤에만 쓴다.
 * @returns {{fire:boolean, dose:number}}
 */
export function microDecision({ xhat, target, tol, tNow, lastAt = -Infinity, count = 0 }, opts = {}) {
  const { gap, max, doseMin, doseMax, doseBias } = { ...MICRO_PARAMS, ...opts };
  if (xhat == null || !Number.isFinite(xhat)) return { fire: false, dose: 0 };
  const below = xhat < target - tol;
  const spaced = tNow - lastAt > gap;
  const budget = count < max;
  if (!(below && spaced && budget)) return { fire: false, dose: 0 };
  const dose = Math.max(doseMin, Math.min(doseMax, (target - xhat) + doseBias));
  return { fire: true, dose: Math.round(dose * 1000) / 1000 };
}

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "-");

/**
 * 디렉터 모니터의 "다음" 줄 — 지금 시각 뒤에 올 개입 하나를 고른다.
 *   (1) 남은 시각 고정 슬롯이 있으면 그 슬롯의 계획(runController entries 한 줄).
 *   (2) 고정 슬롯이 끝났으면 미세 자극(먼 문 — /film 이 실제로 울리는 방위 −60° 기척) 상태를 microDecision 과
 *       같은 조건으로 알린다: 판정·장면 전이면 대기, 장면 안이면 발동 조건 충족·곡선 안·상한 위·간격 대기·예산 소진,
 *       장면 뒤면 제어 구간 끝.
 * 예전에는 (1) 이 없으면 마지막 고정 슬롯(고양이 0:45)을 영화 끝까지 보여줬다(B66).
 * @returns {{kind:"slot"|"micro"|"done", slotId:string|null, variantId?:string, dose?:number|null, reason:string, count?:number, max?:number}}
 */
export function nextAdvice({ entries = [], tNow, verdict = true, xhat = null, target = null, tol = 0, ceiling = null,
  lastMicroAt = -Infinity, microCount = 0, controlOn = true, sceneStart = 68, sceneEnd = 150, micro = {} }) {
  const slot = entries.find((e) => e.t > tNow);
  if (slot) return { kind: "slot", slotId: slot.slotId, variantId: slot.variantId, dose: slot.dose, reason: slot.reason };
  const M = { ...MICRO_PARAMS, ...micro };
  if (tNow > sceneEnd) return { kind: "done", slotId: null, reason: `제어 구간 끝 · 미세 자극 ${microCount}/${M.max}` };
  const base = { kind: "micro", slotId: "micro-door", variantId: "shut", dose: null, count: microCount, max: M.max };
  const advisory = controlOn ? "" : " (제어 OFF — 권고만)";
  if (microCount >= M.max) return { ...base, reason: `예산 소진 ${microCount}/${M.max} — 남은 장면은 연속 구동만` };
  if (!verdict || tNow < sceneStart) return { ...base, reason: `판정 뒤 장면(${mmss(sceneStart)}~${mmss(sceneEnd)})에서 x̂ 이 곡선 아래로 처지면` };
  if (xhat == null || !Number.isFinite(xhat) || !Number.isFinite(target)) return { ...base, reason: "x̂ 추정 대기" };
  const d = microDecision({ xhat, target, tol, tNow, lastAt: lastMicroAt, count: microCount }, M);
  if (d.fire) return { ...base, dose: d.dose, reason: `x̂ ${f2(xhat)} < 목표 ${f2(target)}−${f2(tol)} → 발동 조건 충족${advisory}` };
  if (Number.isFinite(ceiling) && xhat > ceiling) return { ...base, reason: `상한 위(x̂ ${f2(xhat)} > ${f2(ceiling)}) — 자극 없음, 연속 구동이 이완` };
  if (xhat >= target - tol) return { ...base, reason: `곡선 안(x̂ ${f2(xhat)} ≥ ${f2(target - tol)}) — 대기` };
  const wait = Math.max(0, M.gap - (tNow - lastMicroAt));
  return { ...base, reason: `간격 대기 ${Math.ceil(wait)}s (직전 ${mmss(Math.max(0, lastMicroAt))})${advisory}` };
}

/**
 * 슬롯 하나를 지금 시점에서 고른다(실시간 구동용, /film ?control=1 full 모드).
 * runController 와 같은 규약(후보 목록·채널 셈·직전 슬롯)을 쓰되, 시작 긴장 x0 만 예측값이 아니라 현재 추정 x̂ 을 받는다 —
 * 앞 슬롯들이 실제로 어떻게 울렸고 관객이 어떻게 반응했는지가 이미 x̂ 에 들어 있으므로 계획을 다시 세우지 않고 이 슬롯만 결정한다.
 * @param {string} track  "H"|"R"|"C"(판정 전이면 잠정 우세 장르)
 * @param {string} slotId 시각 고정 슬롯 id(frog·cat …)
 * @param {number|null} x0 현재 긴장 추정(없으면 바닥값)
 * @param {object} theta  관객 모델 θ̂(fitViewerModel)
 * @returns {{slotId, t, channel, variantId, dose, predTension, target, cost, nth, reason}|null}  모르는 슬롯이면 null
 */
export function chooseSlotNow(track, slotId, x0, theta, params = CONTROL_PARAMS) {
  const cands = candidateSlots();
  const idx = cands.findIndex((s) => s.id === slotId);
  if (idx < 0) return null;
  const channelCounts = {};
  for (let i = 0; i < idx; i++) channelCounts[cands[i].channel] = (channelCounts[cands[i].channel] || 0) + 1;
  const prev = idx > 0 ? { t: cands[idx - 1].t, channel: cands[idx - 1].channel } : null;
  const start = Number.isFinite(x0) ? clamp01(x0) : TENSION_PARAMS.BASE;
  const choice = chooseVariant(track, cands, idx, start, theta, channelCounts, prev, params);
  return { slotId, t: cands[idx].t, channel: cands[idx].channel, ...choice };
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
    x0 = next ? decayTo(choice.predTension, next.t - slot.t, tauOf(theta, P)) : choice.predTension;
  }
  return { entries, plan: entries.map((e) => ({ slotId: e.slotId, variantId: e.variantId, t: e.t, channel: e.channel, dose: e.dose, predTension: e.predTension })) };
}
