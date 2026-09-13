// 통합 파이프라인 회귀 — 합성 세션 하나를 만들어 전 모듈이 인터페이스 어긋남 없이 물리는지 본다.
// engagementSense(자세→탐침·창) → viewerModel(θ) → tensionEstimate(x̂) → slotController(계획) → trackSelect(트랙).
import assert from "node:assert/strict";
import { createEngagementSensor } from "../lib/engagementSense.js";
import { fitViewerModel } from "../lib/viewerModel.js";
import { estimateTensionSeries } from "../lib/tensionEstimate.js";
import { runController } from "../lib/slotController.js";
import { selectTrack } from "../lib/trackSelect.js";
import { CUES } from "../lib/filmTimeline.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

const HZ = 72, DT = 1 / HZ;
// 실제 CUES 스케줄대로 자극을 열고, "겁 많은" 관객처럼 사건마다 그쪽으로 크게 돌아본다.
function syntheticSession() {
  const s = createEngagementSensor();
  let t = 0, yaw = 0, target = 0, hold = 0, rate = 3;
  const fired = new Set();
  const senseCues = CUES.filter((c) => c.sense);
  while (t < 60) {
    for (const c of senseCues) if (t >= c.t && !fired.has(c.name)) { fired.add(c.name); s.beginStimulus({ name: c.name, azimuth: c.sense.azimuth, dur: c.sense.dur, kind: c.sense.kind, channel: c.sfx ? "audio" : "av", dose: c.volume ?? 0.7, tail: 3 }); target = c.sense.azimuth * 0.9; rate = 12; hold = t + 2.5; }
    if (t > hold) { rate = 1.2; target = 0; }
    yaw += (target - yaw) * Math.min(1, rate * DT);
    s.update({ yaw, pitch: 0, roll: 0, x: 0, y: 0, z: 0 }, DT);
    t += DT;
  }
  return s;
}

test("전 파이프라인이 어긋남 없이 물린다", () => {
  const s = syntheticSession();
  const data = s.data();
  assert.ok(data.stimuli.length >= 4, `탐침 ${data.stimuli.length}`);
  assert.ok(data.windows.length >= 20, `창 ${data.windows.length}`);

  const theta = fitViewerModel(data.stimuli);
  assert.ok(theta.g > 0 && theta.tau > 0 && theta.nResp >= 1, JSON.stringify(theta));

  const series = estimateTensionSeries(data);
  assert.equal(series.length, data.windows.length);
  for (const p of series) assert.ok(p.tension >= 0 && p.tension <= 1);
  assert.ok(Math.max(...series.map((p) => p.tension)) > 0.2, "봉우리가 생긴다");

  const rec = runController("H", theta);
  assert.ok(rec.entries.length >= 5);
  for (const e of rec.entries) assert.ok(e.variantId && e.predTension >= 0 && e.predTension <= 1);

  const sel = selectTrack(theta, { genrePrior: { R: 0.2, H: 0.6, C: 0.2 } });
  assert.ok(["R", "H", "C"].includes(sel.track));
  assert.ok(sel.reach.R >= 0 && sel.reach.H >= 0 && sel.reach.C >= 0);
});

test("크게 반응한 관객은 이득이 사전분포 위, 응답 다수", () => {
  const s = syntheticSession();
  const theta = fitViewerModel(s.data().stimuli);
  assert.ok(theta.nResp >= 3, `nResp ${theta.nResp}`);
  assert.ok(theta.g > 0.4, `g ${theta.g}`);
});

test("report() 원시 CSV 와 data() 창/탐침이 일치한다", () => {
  const s = syntheticSession();
  const d = s.data(), r = s.report();
  assert.equal(r.windows.length, d.windows.length);
  assert.equal(r.stimuli.length, d.stimuli.length);
  assert.ok(r.raw.csv.split("\n").length > 100);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
