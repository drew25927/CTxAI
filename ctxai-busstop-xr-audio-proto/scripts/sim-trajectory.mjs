// 궤적 추종 시뮬레이터 — 합성 관객 N명에게 제어 on/off 로 자극을 주고, 필수 키프레임에서
// 관객 간 긴장 궤적의 분산을 비교한다. 미션의 핵심 증명("제어 on 이면 궤적 분산이 작다")을
// 파일럿 전에 코드로 확인한다. 실제 사람이 아니라 모델이 만든 관객이므로 상한 증거는 아니고,
// 제어기·모델·곡선이 서로 맞물려 동작하는지와 방향성을 본다.
//
// 규약 주의(B88): 이 시뮬은 초기 설계 규약이다 — 도입부 탐침 3개(poster·figure·truck)까지 제어기가 변형을 고른다.
// 현행 설계(/film)는 탐침을 중립으로 두고 frog·cat 만 고르므로, 현행 설계의 수치는 `npm run sim:plot`(lib/tensionSim.js
// full 열 · 현실 조건 행)을 쓴다. 이 스크립트의 "분산 N%↓" 는 발표·심사 수치로 인용하지 않는다.
//
//   node scripts/sim-trajectory.mjs [N] [track]

import { fitViewerModel, predictResponse } from "../lib/viewerModel.js";
import { runController, candidateSlots, CONTROL_PARAMS } from "../lib/slotController.js";
import { curveAt, slotById, variantOf, requiredEvents, SLOTS } from "../lib/tensionCurve.js";
import { TENSION_PARAMS } from "../lib/tensionEstimate.js";

const N = parseInt(process.argv[2] || "200", 10);
const TRACK = process.argv[3] || "H";
const K_RESP = TENSION_PARAMS.K_RESP, BASE = TENSION_PARAMS.BASE, RISE = TENSION_PARAMS.RISE_SEC;

// 재현 가능한 난수 (mulberry32)
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(12345);
const uni = (a, b) => a + (b - a) * rand();
function makeViewer() { return { g: uni(0.3, 1.3), L: uni(0.3, 0.9), tau: uni(1.0, 4.0), rho: uni(0.0, 0.45) }; }

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function decayTo(peak, dt, tau) { return clamp01(BASE + (peak - BASE) * Math.exp(-Math.max(0, dt) / tau)); }

// 참 관객 θtrue 가 주어진 dose 계획에 실제로 보이는 긴장(슬롯별 봉우리)과 탐침 레코드.
function simulate(track, plan, thetaTrue) {
  const cc = {}; let x0 = BASE; const tension = {}; const records = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i], slot = slotById(p.slotId), nth = cc[p.channel] || 0;
    const mag = predictResponse(thetaTrue, { dose: p.dose, nth });
    const peak = clamp01(x0 + K_RESP * mag);
    tension[p.slotId] = peak;
    records.push({ name: p.slotId, onset: p.t, dur: 1, channel: p.channel, dose: p.dose, nth, responded: mag > 0.02 ? 1 : 0, peakAmp: mag * 180, maxVel: 0, lookSec: 0, retreat: 0, lookLatency: thetaTrue.L, moveLatency: thetaTrue.L, recoverySec: thetaTrue.tau, recheck: 0 });
    cc[p.channel] = nth + 1;
    const next = plan[i + 1];
    x0 = next ? decayTo(peak, next.t - p.t, thetaTrue.tau) : peak;
  }
  return { tension, records };
}

const cands = candidateSlots();
const midVariant = (slot) => slot.variants[Math.floor((slot.variants.length - 1) / 2)]; // 가운데 변형 = 고정 연출
const offPlan = cands.map((s) => ({ slotId: s.id, t: s.t, channel: s.channel, dose: midVariant(s).dose }));

// 측정 슬롯 = 변형이 둘 이상인(제어기가 실제로 조절하는) 슬롯. 곡선 전체에서 분산을 본다.
const kfSlots = cands.filter((s) => s.variants.length > 1);

// 한 모드의 통계 — 두 모드가 같은 관객 집합을 쓰도록 같은 시드의 별도 RNG 를 쓴다.
function runStats(mode) {
  const local = rng(42);
  const u = (a, b) => a + (b - a) * local();
  const perKf = Object.fromEntries(kfSlots.map((s) => [s.id, []]));
  let sumErr2 = 0, cnt = 0;
  for (let v = 0; v < N; v++) {
    const th = { g: u(0.3, 1.3), L: u(0.3, 0.9), tau: u(1.0, 4.0), rho: u(0.0, 0.45) };
    let plan;
    if (mode === "off") plan = offPlan;
    else { const probe = simulate(TRACK, offPlan.slice(0, 3), th).records; plan = runController(TRACK, fitViewerModel(probe)).plan; }
    const { tension } = simulate(TRACK, plan, th);
    for (const s of kfSlots) { const x = tension[s.id] ?? BASE; const tgt = curveAt(TRACK, s.t + RISE).target; perKf[s.id].push(x); sumErr2 += (x - tgt) ** 2; cnt++; }
  }
  const std = (arr) => { const m = arr.reduce((a, b) => a + b, 0) / arr.length; return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length); };
  const perKfStd = Object.fromEntries(kfSlots.map((s) => [s.id, std(perKf[s.id])]));
  return { perKfStd, rmse: Math.sqrt(sumErr2 / cnt), meanStd: Object.values(perKfStd).reduce((a, b) => a + b, 0) / kfSlots.length };
}
const off = runStats("off");
const on = runStats("on");

console.log(`트랙 ${TRACK} · 관객 ${N}명 · 측정 슬롯 [${kfSlots.map((s) => s.id).join(", ")}] · 초기 설계 규약(탐침까지 변형 선택 — 현행 설계 수치는 npm run sim:plot)`);
console.log(`제어 OFF (고정 연출): 궤적 표준편차 평균 ${off.meanStd.toFixed(3)} · 목표 RMSE ${off.rmse.toFixed(3)}`);
console.log(`제어 ON  (관객모델):  궤적 표준편차 평균 ${on.meanStd.toFixed(3)} · 목표 RMSE ${on.rmse.toFixed(3)}`);
for (const s of kfSlots) console.log(`   ${s.id}: OFF std ${off.perKfStd[s.id].toFixed(3)} → ON std ${on.perKfStd[s.id].toFixed(3)}`);
const pass = on.meanStd < off.meanStd && on.rmse < off.rmse;
console.log(pass ? `\nPASS — 제어 ON 이 관객 간 분산(${(100 * (1 - on.meanStd / off.meanStd)).toFixed(0)}%↓)과 목표 오차(${(100 * (1 - on.rmse / off.rmse)).toFixed(0)}%↓)를 줄였다` : `\nFAIL — 분산 감소 없음`);
process.exit(pass ? 0 : 1);
