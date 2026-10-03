// 시뮬레이터 회귀 — 제어 ON 이 세 트랙 모두에서 관객 간 분산과 목표 오차를 줄이는지 확인.
import assert from "node:assert/strict";
import { fitViewerModel, predictResponse } from "../lib/viewerModel.js";
import { runController, candidateSlots } from "../lib/slotController.js";
import { curveAt, slotById } from "../lib/tensionCurve.js";
import { TENSION_PARAMS } from "../lib/tensionEstimate.js";

const K = TENSION_PARAMS.K_RESP, BASE = TENSION_PARAMS.BASE, RISE = TENSION_PARAMS.RISE_SEC;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const decay = (peak, dt, tau) => clamp01(BASE + (peak - BASE) * Math.exp(-Math.max(0, dt) / tau));
function rng(s) { return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function simulate(plan, th) {
  const cc = {}; let x0 = BASE; const tension = {}; const rec = [];
  for (let i = 0; i < plan.length; i++) { const p = plan[i], nth = cc[p.channel] || 0, mag = predictResponse(th, { dose: p.dose, nth }); const peak = clamp01(x0 + K * mag); tension[p.slotId] = peak; rec.push({ name: p.slotId, onset: p.t, dur: 1, channel: p.channel, dose: p.dose, nth, responded: mag > 0.02 ? 1 : 0, peakAmp: mag * 180, recoverySec: th.tau, lookLatency: th.L }); cc[p.channel] = nth + 1; const nx = plan[i + 1]; x0 = nx ? decay(peak, nx.t - p.t, th.tau) : peak; }
  return { tension, rec };
}
const cands = candidateSlots();
const mid = (s) => s.variants[Math.floor((s.variants.length - 1) / 2)];
const offPlan = cands.map((s) => ({ slotId: s.id, t: s.t, channel: s.channel, dose: mid(s).dose }));
const meas = cands.filter((s) => s.variants.length > 1);

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

function run(track, N) {
  function stats(mode) {
    const r = rng(42); const u = (a, b) => a + (b - a) * r();
    const per = Object.fromEntries(meas.map((s) => [s.id, []])); let e2 = 0, c = 0;
    for (let v = 0; v < N; v++) { const th = { g: u(0.3, 1.3), L: u(0.3, 0.9), tau: u(1, 4), rho: u(0, 0.45) }; let plan; if (mode === "off") plan = offPlan; else { const probe = simulate(offPlan.slice(0, 3), th).rec; plan = runController(track, fitViewerModel(probe)).plan; } const { tension } = simulate(plan, th); for (const s of meas) { const x = tension[s.id] ?? BASE, tgt = curveAt(track, s.t + RISE).target; per[s.id].push(x); e2 += (x - tgt) ** 2; c++; } }
    const std = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
    return { meanStd: meas.reduce((x, s) => x + std(per[s.id]), 0) / meas.length, rmse: Math.sqrt(e2 / c) };
  }
  return { off: stats("off"), on: stats("on") };
}

for (const track of ["H", "R", "C"]) test(`${track}: 제어 ON 이 분산·목표오차를 줄인다`, () => {
  const { off, on } = run(track, 150);
  assert.ok(on.meanStd < off.meanStd, `std off ${off.meanStd.toFixed(3)} on ${on.meanStd.toFixed(3)}`);
  assert.ok(on.rmse < off.rmse, `rmse off ${off.rmse.toFixed(3)} on ${on.rmse.toFixed(3)}`);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
