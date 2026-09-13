// 긴장 추정 회귀 테스트
import assert from "node:assert/strict";
import { estimateTensionSeries, tensionAt, peaks, TENSION_PARAMS } from "../lib/tensionEstimate.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

const win = (t1, angVelRms = 0) => ({ t0: t1 - 2, t1, angVelRms });
const wins = (n, vel = 0) => Array.from({ length: n }, (_, i) => win((i + 1) * 2, vel));
// 반응 크기 mag = peakAmp/180 (다른 항 0). big≈0.5, small≈0.06
const bigStartle = { name: "cat", onset: 30, dur: 1, peakAmp: 90, recoverySec: 2 };   // mag 0.5
const smallStartle = { name: "cat", onset: 30, dur: 1, peakAmp: 18, recoverySec: 2 };  // mag 0.1

test("놀람 자극 뒤 봉우리, 그 뒤 하강", () => {
  const s = estimateTensionSeries({ windows: wins(30), stimuli: [bigStartle] });
  const at = (t) => s.find((p) => p.t === t).tension;
  assert.ok(at(32) > at(24), `after ${at(32)} vs before ${at(24)}`);   // 자극 직후 창에서 상승(봉우리는 onset+0.6s)
  assert.ok(at(32) > at(40), `peak-ish ${at(32)} vs later ${at(40)}`); // 이후 하강
  assert.ok(at(56) < at(32), "멀리서 더 낮다");
});

test("값은 0~1", () => {
  const s = estimateTensionSeries({ windows: wins(30, 100), stimuli: [bigStartle, { ...bigStartle, onset: 40, name: "x" }] });
  for (const p of s) assert.ok(p.tension >= 0 && p.tension <= 1, `t=${p.t} ${p.tension}`);
});

test("조용하면(자극·움직임 없음) 바닥 긴장 근처", () => {
  const s = estimateTensionSeries({ windows: wins(10), stimuli: [] });
  for (const p of s) assert.ok(Math.abs(p.tension - TENSION_PARAMS.BASE) < 1e-6, `${p.tension}`);
});

test("큰 반응이 작은 반응보다 봉우리가 높다", () => {
  const big = tensionAt([bigStartle], 30.6);
  const small = tensionAt([smallStartle], 30.6);
  assert.ok(big > small, `big ${big} small ${small}`);
});

test("느린 회복(τ 큼)이 나중에 더 높게 남는다", () => {
  const fast = tensionAt([{ ...bigStartle, recoverySec: 1 }], 36);
  const slow = tensionAt([{ ...bigStartle, recoverySec: 4 }], 36);
  assert.ok(slow > fast, `slow ${slow} fast ${fast}`);
});

test("예감: preLook 이면 자극 전에 이미 조금 오른다", () => {
  const withAnt = tensionAt([{ ...bigStartle, preLook: 1 }], 28);   // onset 30, 2초 전
  const without = tensionAt([{ ...bigStartle, preLook: 0 }], 28);
  assert.ok(withAnt > without, `ant ${withAnt} none ${without}`);
});

test("잔움직임이 크면 긴장 바닥이 올라간다", () => {
  const still = estimateTensionSeries({ windows: wins(4, 0), stimuli: [] }).at(-1).tension;
  const moving = estimateTensionSeries({ windows: wins(4, 60), stimuli: [] }).at(-1).tension;
  assert.ok(moving > still, `moving ${moving} still ${still}`);
});

test("peaks: 봉우리 시각에 가까운 자극 이름", () => {
  const s = estimateTensionSeries({ windows: wins(40), stimuli: [bigStartle] });
  const pk = peaks(s, [bigStartle]);
  assert.ok(pk.length >= 1, "봉우리 있음");
  assert.equal(pk[0].near, "cat");
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
