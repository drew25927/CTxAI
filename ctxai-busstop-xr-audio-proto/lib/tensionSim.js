// 긴장 궤적 시뮬레이터(연속 시간) — 합성 관객 θ 에게 /film 타임라인(고정 슬롯 5개 → 판정 → 미세 자극 +
// 연속 액추에이터)을 제어 OFF/ON 으로 돌려 참 긴장 x(t)·추정 x̂(t)·구동량 u(t) 의 시계열을 만든다.
//
// scripts/sim-trajectory.mjs 가 "슬롯 봉우리 값" 만 보는 표본 시뮬레이터라면, 이 모듈은 0.25초 틱으로
// 전 구간을 밟아 그래프(scripts/sim-plot.mjs)와 두 손의 상호작용(B75)·연속 채널의 되먹임(B77)을 볼 수 있게 한다.
// 실제 사람이 아니라 모델이 만든 관객이므로 상한 증거가 아니라 "제어기·모델·곡선이 서로 맞물리는가" 의 근거다.
//
// 세 모드
//   off  : 고정 연출 — 모든 슬롯 가운데 변형, 미세 자극·연속 액추에이터 없음.
//   film : /film 의 현재 코드 — 고정 슬롯 5개는 전부 중립 탐침(가운데 변형), 판정(68s) 뒤 장면(~150s)에서
//          미세 자극(slotController.microDecision)과 연속 액추에이터(controlActuate.actuationFor)만 움직인다.
//   full : 설계 전체 — 탐침 N_PROBE 개 뒤의 고정 슬롯부터 제어기(chooseVariant)가 변형을 고르고, 판정 뒤는 film 과 같다.
//
// 참 관객 모델(지상진실)은 tensionEstimate 와 같은 커널이다: 자극 k 마다 A_k = K_RESP · g·d_k·(1−ρ)^{n_k} 봉우리가
// RISE_SEC 에 올라 τ 로 감쇠한다. 레코드 필드를 engagementSense report().stimuli 와 같게 만들어 x̂ 는 실제 코드
// (tensionAt) 가 그대로 계산한다 — 이산 자극에 대해서는 관측이 완벽하다(x̂ = x).
//
// 연속 채널(침묵·안개·거리 …)이 참 긴장에 미치는 효과는 파일럿 전이라 미검증이다. 기본값은 0(반영 안 함) 이고,
// B77 검토용으로 `contTruth`(참 효과)·`contModel`(x̂ 의 느린 항) 을 따로 켤 수 있다. 값은 전부 가정치.

import { predictResponse, fitViewerModel } from "./viewerModel.js";
import { chooseVariant, candidateSlots, microDecision, MICRO_PARAMS } from "./slotController.js";
import { curveAt } from "./tensionCurve.js";
import { tensionAt, TENSION_PARAMS } from "./tensionEstimate.js";
import { actuationFor, ACTUATE_PARAMS } from "./controlActuate.js";

export const SIM_PARAMS = Object.freeze({
  DT: 0.25,             // 틱(영화 시간 초) — /film 의 250ms 제어 틱과 같다
  T_END: 180,           // 시뮬 끝(버스 도착 구간까지)
  VERDICT_T: 68,        // 판정·옆사람 착석(filmTimeline T.npcSeated) — 이 뒤부터 두 손이 움직인다
  SCENE_END: 150,       // 장면 끝 — 이 뒤로 구동량은 0 으로 되돌아간다(/film 과 같은 값)
  N_PROBE: 3,           // 도입부 중립 탐침 수(poster·figure·truck) — full 모드는 그 뒤 슬롯부터 변형을 고른다
  MICRO_DUR: 1.5,       // 미세 자극(먼 문) 길이(초) — /film beginStimulus 와 같다
  CONT_K: 0.25,         // (가정) 연속 채널 u=+1 을 오래 유지하면 기준 관객(g = G_REF)의 긴장이 이만큼 오른다
  CONT_TAU: 12,         // (가정) 그 느린 항의 시정수(초) — 안개·침묵은 몇 초 만에 체감되지 않는다
  HOLD_AFTER_MICRO: ACTUATE_PARAMS.HOLD_AFTER_MICRO, // B75: 미세 자극 뒤 연속 손을 멈추는 창(초) — /film 과 같은 값(controlActuate)
});

// 관객 3유형 — 값은 창작·잠정치(sim-trajectory 의 관객 분포 g 0.3~1.3 · τ 1~4 · ρ 0~0.45 안에서 골랐다).
export const ARCHETYPES = Object.freeze({
  sensitive: Object.freeze({ key: "sensitive", label: "민감형", g: 1.2, L: 0.3, tau: 3.5, rho: 0.1 }),
  typical: Object.freeze({ key: "typical", label: "보통형", g: 0.7, L: 0.5, tau: 2.0, rho: 0.2 }),
  blunt: Object.freeze({ key: "blunt", label: "둔감형", g: 0.35, L: 0.7, tau: 1.2, rho: 0.35 }),
});

/** 재현 가능한 난수(mulberry32) — sim-trajectory·gazeSim 과 같은 생성기. */
export function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** sim-trajectory 와 같은 분포의 무작위 관객. */
export function randomViewer(rand) {
  const u = (a, b) => a + (b - a) * rand();
  return { g: u(0.3, 1.3), L: u(0.3, 0.9), tau: u(1.0, 4.0), rho: u(0.0, 0.45) };
}

function clamp01(x) { return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; }
const r3 = (x) => Math.round(x * 1000) / 1000;
const r4 = (x) => Math.round(x * 10000) / 10000;
const P0 = Object.freeze({ ...TENSION_PARAMS, BASE: 0 }); // 자극 기여분만(바닥 없이) 합칠 때

/** 참 관객 θ 가 (dose, nth) 자극에 보인 반응 레코드 — engagementSense report().stimuli 와 같은 필드. */
export function makeRecord(theta, { name, t, dur = 1, channel, dose, nth = 0, kind = "probe" }) {
  const mag = predictResponse(theta, { dose, nth });
  // responseMagnitude(probe) = 0.5·peakAmp/90 이므로 peakAmp = mag·180 이면 관측 크기가 정확히 mag 다.
  return { name, onset: t, dur, channel, dose, nth, kind, responded: mag > 0.02 ? 1 : 0, peakAmp: r4(mag * 180), maxVel: 0, lookSec: 0, retreat: 0, lookLatency: theta.L, moveLatency: theta.L, recoverySec: theta.tau };
}

/**
 * 한 관객의 타임라인 시뮬레이션.
 * @param {object} o
 * @param {"H"|"R"|"C"} o.track
 * @param {{g,L,tau,rho}} o.theta   참 관객
 * @param {"off"|"film"|"full"} [o.mode="off"]
 * @param {object} [o.opts]
 * @param {number}  [o.opts.contTruth=0]     연속 채널이 참 긴장에 미치는 효과(0 = 없음, CONT_K 등)
 * @param {"none"|"slow"} [o.opts.contModel="none"]  x̂ 에 연속 채널의 느린 항을 넣는가(B77 안 2)
 * @param {number}  [o.opts.holdAfterMicro=HOLD_AFTER_MICRO] 미세 자극 뒤 연속 손을 멈추는 창(초, B75). 0 이면 B75 이전(창 없음)
 * @param {object}  [o.params=SIM_PARAMS]
 * @returns {{t:number[], x:number[], xhat:number[], u:number[], mode:string[], target:number[], tol:number[], ceiling:number,
 *            stimuli:Array, micro:Array, plan:Array, thetaHat:object|null, track:string, simMode:string}}
 */
export function simulateViewer({ track, theta, mode = "off", opts = {}, params = SIM_PARAMS }) {
  const P = params;
  const contTruth = Number.isFinite(opts.contTruth) ? opts.contTruth : 0;
  const contModel = opts.contModel || "none";
  const hold = Number.isFinite(opts.holdAfterMicro) ? opts.holdAfterMicro : P.HOLD_AFTER_MICRO;
  const actParams = { ...ACTUATE_PARAMS, HOLD_AFTER_MICRO: hold };
  const cands = candidateSlots();
  const mid = (s) => s.variants[Math.floor((s.variants.length - 1) / 2)];

  const records = [];      // 지금까지 일어난 자극(참 관객의 반응 포함)
  const channelCounts = {};
  const plan = [];         // 고정 슬롯에서 고른 변형
  const micro = [];        // 미세 자극 발동 기록
  let prevSlot = null, slotIdx = 0;
  let thetaHat = null, thetaDirty = true;
  let act = null;          // 연속 액추에이터 직전 결과
  let lastMicroAt = -Infinity, microCount = 0;
  let xcTrue = 0, xcHat = 0; // 연속 채널의 느린 항(참 / 추정)

  const out = { t: [], x: [], xhat: [], u: [], mode: [], target: [], tol: [] };
  const ceiling = curveAt(track, 0).ceiling;
  const gRatio = theta.g / ACTUATE_PARAMS.G_REF;

  const steps = Math.round(P.T_END / P.DT);
  for (let i = 0; i <= steps; i++) {
    const t = r4(i * P.DT);
    const uPrev = act ? act.u : 0;

    // 연속 채널의 느린 항 — 직전 틱의 구동량이 시정수 CONT_TAU 로 스며든다.
    if (contTruth > 0) xcTrue += (P.DT / P.CONT_TAU) * (contTruth * gRatio * uPrev - xcTrue);
    if (contModel === "slow") xcHat += (P.DT / P.CONT_TAU) * (P.CONT_K * uPrev - xcHat);

    // 고정 슬롯 발동(시각 도달 시 한 번) — 변형은 그 순간의 x̂·θ̂ 로 고른다.
    while (slotIdx < cands.length && t >= cands[slotIdx].t) {
      const slot = cands[slotIdx];
      let dose = mid(slot).dose, variantId = mid(slot).id, reason = "중립(가운데 변형)";
      if (mode === "full" && slotIdx >= P.N_PROBE) {
        if (thetaDirty) { thetaHat = fitViewerModel(records); thetaDirty = false; }
        const x0 = clamp01(TENSION_PARAMS.BASE + tensionAt(records, slot.t, null, P0) + (contModel === "slow" ? xcHat : 0));
        const c = chooseVariant(track, cands, slotIdx, x0, thetaHat, channelCounts, prevSlot);
        dose = c.dose; variantId = c.variantId; reason = c.reason;
      }
      const nth = channelCounts[slot.channel] || 0;
      records.push(makeRecord(theta, { name: slot.id, t: slot.t, dur: 1, channel: slot.channel, dose, nth }));
      channelCounts[slot.channel] = nth + 1;
      plan.push({ slotId: slot.id, t: slot.t, channel: slot.channel, variantId, dose, nth, reason });
      prevSlot = { t: slot.t, channel: slot.channel };
      slotIdx++; thetaDirty = true;
    }

    const s = tensionAt(records, t, null, P0);            // 이산 자극 기여분(실제 추정기와 같은 커널)
    const x = clamp01(TENSION_PARAMS.BASE + s + xcTrue);
    const xhat = clamp01(TENSION_PARAMS.BASE + s + (contModel === "slow" ? xcHat : 0));
    const tgt = curveAt(track, t);

    let uMode = "off";
    if (mode !== "off" && t >= P.VERDICT_T && t <= P.SCENE_END) {
      if (thetaDirty) { thetaHat = fitViewerModel(records); thetaDirty = false; }
      // B75: 미세 자극 뒤 창에서는 actuationFor 가 u 를 직전 값에 묶는다(mode "settle") — /film 과 같은 코드 경로
      act = actuationFor({ xhat, target: tgt.target, tol: tgt.tol, ceiling: tgt.ceiling, track, theta: thetaHat, prev: act, dt: P.DT, active: true, tNow: t, lastMicroAt }, actParams);
      uMode = act.mode;
      const d = microDecision({ xhat, target: tgt.target, tol: tgt.tol, tNow: t, lastAt: lastMicroAt, count: microCount });
      if (d.fire) {
        const nth = channelCounts.audio || 0;
        records.push(makeRecord(theta, { name: `micro-${microCount + 1}`, t, dur: P.MICRO_DUR, channel: "audio", dose: d.dose, nth }));
        channelCounts.audio = nth + 1;
        micro.push({ t, dose: d.dose, xhat: r3(xhat), target: r3(tgt.target) });
        lastMicroAt = t; microCount++; thetaDirty = true;
      }
    } else if (act && act.u !== 0) {
      // 장면 밖 — 구동량을 슬루로 0 에 되돌린다(/film 과 같다)
      act = actuationFor({ xhat: null, target: 0, tol: 0, track, prev: act, dt: P.DT, active: true });
      uMode = act.u === 0 ? "off" : "hold";
    }

    out.t.push(t); out.x.push(r3(x)); out.xhat.push(r3(xhat)); out.u.push(act ? act.u : 0); out.mode.push(uMode);
    out.target.push(r3(tgt.target)); out.tol.push(r3(tgt.tol));
  }
  if (thetaDirty) thetaHat = records.length ? fitViewerModel(records) : null;
  return { ...out, ceiling, stimuli: records, micro, plan, thetaHat, track, simMode: mode, theta, opts: { contTruth, contModel, holdAfterMicro: hold } };
}

/**
 * 여러 관객의 궤적 통계 — 같은 시간 격자를 전제한다.
 * @param {Array} runs  simulateViewer 결과 배열
 * @param {{t0?:number, t1?:number, step?:number}} [win]  구간(기본 0~SCENE_END)·표본 간격(초)
 * @returns {{rmse:number, meanStd:number, n:number, samples:number}}  목표 대비 RMSE · 관객 간 표준편차의 시간 평균
 */
export function summarize(runs, { t0 = 0, t1 = SIM_PARAMS.SCENE_END, step = 1 } = {}) {
  if (!runs.length) return { rmse: 0, meanStd: 0, n: 0, samples: 0 };
  const dt = runs[0].t[1] - runs[0].t[0];
  const every = Math.max(1, Math.round(step / dt));
  let e2 = 0, stdSum = 0, cnt = 0;
  for (let i = 0; i < runs[0].t.length; i += every) {
    const t = runs[0].t[i];
    if (t < t0 || t > t1) continue;
    const xs = runs.map((r) => r.x[i]);
    const tgt = runs[0].target[i];
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    stdSum += Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    e2 += xs.reduce((a, b) => a + (b - tgt) ** 2, 0) / xs.length;
    cnt++;
  }
  return { rmse: r3(Math.sqrt(e2 / Math.max(1, cnt))), meanStd: r3(stdSum / Math.max(1, cnt)), n: runs.length, samples: cnt };
}

/**
 * 슬롯 봉우리 기준 통계(sim-trajectory.mjs 와 같은 정의) — 변형이 둘 이상인 고정 슬롯의 봉우리(t + RISE_SEC)에서
 * 목표 대비 RMSE 와 관객 간 표준편차.
 */
export function summarizeAtPeaks(runs) {
  if (!runs.length) return { rmse: 0, meanStd: 0, slots: [] };
  const cands = candidateSlots().filter((s) => s.variants.length > 1);
  const dt = runs[0].t[1] - runs[0].t[0];
  let e2 = 0, stdSum = 0, cnt = 0; const slots = [];
  for (const s of cands) {
    const i = Math.round((s.t + TENSION_PARAMS.RISE_SEC) / dt);
    const xs = runs.map((r) => r.x[i]);
    const tgt = runs[0].target[i];
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const std = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    stdSum += std; e2 += xs.reduce((a, b) => a + (b - tgt) ** 2, 0) / xs.length; cnt++;
    slots.push({ slotId: s.id, t: s.t, std: r3(std), mean: r3(m), target: r3(tgt) });
  }
  return { rmse: r3(Math.sqrt(e2 / Math.max(1, cnt))), meanStd: r3(stdSum / Math.max(1, cnt)), slots };
}

export const MICRO_DEFAULTS = MICRO_PARAMS;
