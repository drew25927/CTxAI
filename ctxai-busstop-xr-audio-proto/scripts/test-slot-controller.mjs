// 슬롯 MPC 제어기 회귀 테스트
import assert from "node:assert/strict";
import { runController, chooseVariant, candidateSlots } from "../lib/slotController.js";
import { slotById, variantOf, TRACK_CURVES } from "../lib/tensionCurve.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }
const entry = (r, id) => r.entries.find((e) => e.slotId === id);

test("모든 후보 슬롯에 변형이 하나씩 배정되고, 그 변형은 슬롯 메뉴 안에 있다", () => {
  const r = runController("H", { g: 0.8, L: 0.5, tau: 2, rho: 0.1 });
  assert.equal(r.entries.length, candidateSlots().length);
  for (const e of r.entries) assert.ok(variantOf(slotById(e.slotId), e.variantId), `${e.slotId}/${e.variantId}`);
});

test("습관화형 관객은 반복 채널(트럭 av nth=1)에서 더 큰 용량을 받는다", () => {
  const hab = runController("H", { g: 0.8, L: 0.5, tau: 2, rho: 0.5 });
  const flat = runController("H", { g: 0.8, L: 0.5, tau: 2, rho: 0.0 });
  assert.ok(entry(hab, "truck").dose >= entry(flat, "truck").dose, `hab ${entry(hab, "truck").dose} flat ${entry(flat, "truck").dose}`);
});

test("이득 낮은 관객 + 높은 목표 → 트럭에서 최대 용량(near)", () => {
  const low = runController("H", { g: 0.2, L: 0.5, tau: 2, rho: 0.1 });
  assert.equal(entry(low, "truck").variantId, "near");
  assert.ok(entry(low, "truck").predTension < entry(low, "truck").target + 0.05, "목표에 못 미친다");
});

test("이득 매우 높은 관객 → 고양이에서 낮은 용량(playful)로 상한 회피", () => {
  const high = runController("H", { g: 2.0, L: 0.5, tau: 2, rho: 0.05 });
  assert.equal(entry(high, "cat").variantId, "playful", `골랐음 ${entry(high, "cat").variantId}`);
});

test("로맨스 트랙: 트럭 목표가 낮아(0.3 근처) 공포보다 작은 용량을 고른다", () => {
  const th = { g: 0.9, L: 0.5, tau: 2, rho: 0.1 };
  const rTruck = runController("R", th).entries.find((e) => e.slotId === "truck");
  const hTruck = runController("H", th).entries.find((e) => e.slotId === "truck");
  assert.ok(rTruck.dose <= hTruck.dose, `R ${rTruck.dose} H ${hTruck.dose}`);
});

test("예측 긴장이 대체로 상한 이하 (도달 가능한 목표에서)", () => {
  const r = runController("H", { g: 0.7, L: 0.5, tau: 2, rho: 0.15 });
  const ceiling = TRACK_CURVES.H.ceiling;
  for (const e of r.entries) assert.ok(e.predTension <= ceiling + 1e-6, `${e.slotId} ${e.predTension} > ${ceiling}`);
});

test("reason 문자열에 목표·예측이 들어간다", () => {
  const cands = candidateSlots();
  const c = chooseVariant("H", cands, 2, 0.3, { g: 0.2, L: 0.5, tau: 2, rho: 0.1 }, {}, null);
  assert.ok(/목표/.test(c.reason) && /예측/.test(c.reason), c.reason);
  assert.ok(/도달 한계/.test(c.reason), c.reason); // 이득 낮으니 도달 한계 표시
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
