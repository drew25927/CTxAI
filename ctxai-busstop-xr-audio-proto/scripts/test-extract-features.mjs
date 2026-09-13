// 학습용 특징 추출 회귀 — 합성 세션 원시 CSV → 겹침 창 특징 행렬이 형식·유한값을 지키는지.
import assert from "node:assert/strict";
import { createEngagementSensor } from "../lib/engagementSense.js";
import { estimateTensionSeries } from "../lib/tensionEstimate.js";
import { extractFeatures, parseRaw } from "./extract-features.mjs";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

const HZ = 72, DT = 1 / HZ;
function synth() {
  const s = createEngagementSensor();
  let t = 0, yaw = 0, tg = 0, hold = 0, rate = 3; const fired = new Set();
  const cues = [{ n: "poster", az: 72, d: 3, k: "probe", t: 6, ch: "av", dose: 0.5 }, { n: "truck", az: 8, d: 2.5, k: "startle", t: 29, ch: "av", dose: 0.9 }, { n: "cat", az: 30, d: 3, k: "startle", t: 43, ch: "av", dose: 0.8 }];
  while (t < 50) {
    for (const c of cues) if (t >= c.t && !fired.has(c.n)) { fired.add(c.n); s.beginStimulus({ name: c.n, azimuth: c.az, dur: c.d, kind: c.k, channel: c.ch, dose: c.dose, tail: 3 }); tg = c.az * 0.9; rate = 12; hold = t + 2.5; }
    if (t > hold) { rate = 1.2; tg = 0; }
    yaw += (tg - yaw) * Math.min(1, rate * DT);
    s.update({ yaw, pitch: 0, roll: 0, x: 0, y: 0, z: 0 }, DT);
    t += DT;
  }
  return s.report();
}

test("parseRaw: 헤더대로 표본을 복원한다", () => {
  const rep = synth();
  const rows = parseRaw(rep.raw.csv);
  assert.ok(rows.length > 1000, `표본 ${rows.length}`);
  assert.ok(Number.isFinite(rows[0].t) && Number.isFinite(rows[0].yaw));
});

test("extractFeatures: 겹침 창 행렬, 컬럼 완비, 값 유한", () => {
  const rep = synth();
  const samples = parseRaw(rep.raw.csv);
  const tension = estimateTensionSeries(rep);
  const { columns, rows } = extractFeatures(samples, tension, { hop: 0.5, win: 2 });
  assert.ok(columns.includes("angVelRms") && columns.includes("z_angVel") && columns.includes("tension"));
  assert.ok(rows.length > 50, `행 ${rows.length}`);
  const iAng = columns.indexOf("angVelRms"), iZ = columns.indexOf("z_angVel"), iT = columns.indexOf("tension");
  for (const r of rows) { assert.ok(Number.isFinite(r[0]), "t"); assert.ok(Number.isFinite(r[iAng]), "angVel"); assert.ok(Number.isFinite(r[iZ]), "z"); assert.ok(r[iT] == null || (r[iT] >= 0 && r[iT] <= 1), "tension"); }
});

test("가장 큰 각속도 창은 사건 온셋(6·29·43) 근처에 있다", () => {
  const rep = synth();
  const samples = parseRaw(rep.raw.csv);
  const { columns, rows } = extractFeatures(samples, estimateTensionSeries(rep));
  const iAng = columns.indexOf("angVelRms");
  const top = rows.slice().sort((a, b) => b[iAng] - a[iAng])[0];
  const onsets = [6, 29, 43];
  const near = Math.min(...onsets.map((o) => Math.abs(top[0] - o)));
  assert.ok(near <= 4, `최대 각속도 창 t=${top[0]} 이 온셋에서 ${near}s 떨어짐`);
});

test("빈 표본 → 빈 행렬", () => {
  const { rows } = extractFeatures([], []);
  assert.equal(rows.length, 0);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
