// 경계 조건 회귀 — 빈 입력·무응답·감작(negative rho)·0 성향에서 크래시나 이상값이 없는지.
import assert from "node:assert/strict";
import { fitViewerModel, predictResponse, doseForTarget, VIEWER_PRIOR } from "../lib/viewerModel.js";
import { runController } from "../lib/slotController.js";
import { selectTrack, trackReachability } from "../lib/trackSelect.js";
import { estimateTensionSeries } from "../lib/tensionEstimate.js";
import { curveAt } from "../lib/tensionCurve.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }
const finite = (x) => Number.isFinite(x);

test("무응답 탐침만 있으면 사전분포로 수렴(응답 하나도 안 셈)", () => {
  const stim = [0, 1, 2].map((nth) => ({ name: `s${nth}`, kind: "startle", channel: "audio", dose: 0.7, nth, dur: 1, responded: 0, peakAmp: 0, recoverySec: null, lookLatency: null }));
  const th = fitViewerModel(stim);
  assert.equal(th.g, VIEWER_PRIOR.g);
  assert.equal(th.rho, VIEWER_PRIOR.rho);
  assert.equal(th.nResp, 0);
});

test("이득·회복은 항상 유한하고 양수, 습관화는 (-0.9,0.95)", () => {
  for (const stim of [[], [{ name: "x", channel: "av", dose: 0, nth: 0, dur: 1, responded: 1, peakAmp: 0 }]]) {
    const th = fitViewerModel(stim);
    assert.ok(finite(th.g) && th.g > 0, `g ${th.g}`);
    assert.ok(finite(th.tau) && th.tau > 0, `tau ${th.tau}`);
    assert.ok(th.rho > -0.9 && th.rho < 0.95, `rho ${th.rho}`);
  }
});

test("감작(negative rho) 관객도 제어기가 유한한 계획을 낸다", () => {
  const th = { g: 0.6, L: 0.5, tau: 2, rho: -0.5 };
  const { entries } = runController("H", th);
  assert.ok(entries.length >= 5);
  for (const e of entries) assert.ok(finite(e.predTension) && e.predTension >= 0 && e.predTension <= 1, `${e.slotId} ${e.predTension}`);
});

test("doseForTarget 는 항상 [0,1]", () => {
  for (const th of [{ g: 0.02, rho: 0.9 }, { g: 5, rho: -0.9 }, { g: 0.6, rho: 0.2 }]) {
    for (const nth of [0, 3]) { const d = doseForTarget(th, 0.5, nth, 1); assert.ok(d >= 0 && d <= 1, `d ${d}`); }
  }
});

test("trackSelect: 성향이 전부 0 이어도 크래시 없이 도달가능성으로 고른다", () => {
  const sel = selectTrack({ g: 0.7, L: 0.5, tau: 2, rho: 0.15 }, { genrePrior: { R: 0, H: 0, C: 0 }, priorWeight: 0.5 });
  assert.ok(["R", "H", "C"].includes(sel.track));
  const reach = trackReachability({ g: 0.7, L: 0.5, tau: 2, rho: 0.15 });
  for (const g of ["R", "H", "C"]) assert.ok(finite(reach[g]));
});

test("estimateTensionSeries: 빈 창·빈 자극 → 빈 배열, 자극만 있고 창 없으면 빈 배열", () => {
  assert.deepEqual(estimateTensionSeries({ windows: [], stimuli: [] }), []);
  assert.deepEqual(estimateTensionSeries({ windows: [], stimuli: [{ name: "x", onset: 5, dur: 1, peakAmp: 90 }] }), []);
});

test("curveAt: 알 수 없는 트랙은 크래시 대신 기본값", () => {
  const c = curveAt("Z", 30);
  assert.ok(finite(c.target) && finite(c.tol));
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
