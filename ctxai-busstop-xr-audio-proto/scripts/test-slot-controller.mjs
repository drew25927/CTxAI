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


// microDecision (판정 뒤 미세 자극 액추에이터)
import { microDecision } from "../lib/slotController.js";
test("microDecision: 곡선 아래로 처지고 간격·예산 남으면 발동, 용량은 처진 만큼", () => {
  const r = microDecision({ xhat: 0.2, target: 0.65, tol: 0.1, tNow: 80, lastAt: -Infinity, count: 0 });
  assert.equal(r.fire, true);
  assert.ok(r.dose > 0.2 && r.dose <= 0.6, `dose ${r.dose}`);
});
test("microDecision: 목표 근처면 발동 안 함", () => {
  assert.equal(microDecision({ xhat: 0.6, target: 0.65, tol: 0.1, tNow: 80, lastAt: -Infinity, count: 0 }).fire, false);
});
test("microDecision: 최근에 이미 넣었으면(간격 부족) 발동 안 함", () => {
  assert.equal(microDecision({ xhat: 0.2, target: 0.65, tol: 0.1, tNow: 75, lastAt: 70, count: 1 }).fire, false);
});
test("microDecision: 예산(max) 소진되면 발동 안 함", () => {
  assert.equal(microDecision({ xhat: 0.2, target: 0.65, tol: 0.1, tNow: 200, lastAt: -Infinity, count: 3 }).fire, false);
});
test("microDecision: xhat 없으면 발동 안 함", () => {
  assert.equal(microDecision({ xhat: null, target: 0.65, tol: 0.1, tNow: 80, lastAt: -Infinity, count: 0 }).fire, false);
});

// nextAdvice (디렉터 모니터 "다음" 줄 — B66: 고정 슬롯이 끝난 뒤 고양이가 남던 결함)
import { nextAdvice, MICRO_PARAMS } from "../lib/slotController.js";
const planH = runController("H", { g: 0.8, L: 0.5, tau: 2, rho: 0.1 }).entries;
const sceneArgs = { entries: planH, verdict: true, target: 0.65, tol: 0.1, ceiling: 0.9, sceneStart: 68, sceneEnd: 150 };
test("nextAdvice: 고정 슬롯이 남았으면 그 슬롯 계획(0:40 → 고양이)", () => {
  const a = nextAdvice({ ...sceneArgs, tNow: 40 });
  assert.equal(a.kind, "slot"); assert.equal(a.slotId, "cat");
  assert.equal(a.variantId, entry({ entries: planH }, "cat").variantId);
});
test("nextAdvice: 고양이(0:45) 뒤로는 어떤 시각에도 고양이를 추천하지 않는다", () => {
  for (let t = 45.1; t <= 200; t += 0.5) {
    const a = nextAdvice({ ...sceneArgs, tNow: t, xhat: 0.2, lastMicroAt: -Infinity, microCount: 0 });
    assert.notEqual(a.slotId, "cat", `t=${t}`); assert.notEqual(a.kind, "slot", `t=${t}`);
  }
});
test("nextAdvice: 고양이 뒤·장면 전(0:50)과 판정 전에는 미세 자극 대기 안내", () => {
  const a = nextAdvice({ ...sceneArgs, tNow: 50, xhat: 0.2 });
  assert.equal(a.kind, "micro"); assert.equal(a.slotId, "micro-door"); assert.equal(a.dose, null);
  assert.ok(/판정 뒤 장면\(1:08~2:30\)/.test(a.reason), a.reason);
  assert.ok(/판정 뒤 장면/.test(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, verdict: false }).reason));
});
test("nextAdvice: 장면 안에서 곡선 아래면 microDecision 과 같은 용량으로 발동 조건 충족", () => {
  const a = nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2 });
  const d = microDecision({ xhat: 0.2, target: 0.65, tol: 0.1, tNow: 90, lastAt: -Infinity, count: 0 });
  assert.equal(a.dose, d.dose); assert.ok(/발동 조건 충족/.test(a.reason), a.reason);
  assert.ok(/권고만/.test(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, controlOn: false }).reason));
});
test("nextAdvice: 간격 대기·곡선 안·상한 위·예산 소진을 구분한다", () => {
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, lastMicroAt: 85, microCount: 1 }).reason, /간격 대기 7s \(직전 1:25\)/);
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.6 }).reason, /곡선 안/);
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.95 }).reason, /상한 위/);
  const spent = nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, microCount: MICRO_PARAMS.max });
  assert.match(spent.reason, /예산 소진 3\/3/); assert.equal(spent.dose, null);
});
test("nextAdvice: 장면 끝(2:30) 뒤는 제어 구간 끝", () => {
  const a = nextAdvice({ ...sceneArgs, tNow: 160, xhat: 0.2, microCount: 2 });
  assert.equal(a.kind, "done"); assert.equal(a.slotId, null); assert.match(a.reason, /제어 구간 끝 · 미세 자극 2\/3/);
});
test("MICRO_PARAMS 로 옮긴 뒤에도 microDecision 기본값이 그대로(간격 12s·예산 3·용량 0.2~0.6)", () => {
  assert.deepEqual({ ...MICRO_PARAMS }, { gap: 12, max: 3, doseMin: 0.2, doseMax: 0.6, doseBias: 0.2 });
  assert.equal(microDecision({ xhat: 0.2, target: 0.65, tol: 0.1, tNow: 80, lastAt: 68.5, count: 1 }).fire, false); // 11.5s < 12
  assert.equal(microDecision({ xhat: 0.2, target: 0.65, tol: 0.1, tNow: 80, lastAt: 67.5, count: 1 }).fire, true);
  assert.equal(microDecision({ xhat: 0.0, target: 0.9, tol: 0.1, tNow: 80 }).dose, 0.6);
  assert.equal(microDecision({ xhat: 0.5, target: 0.6, tol: 0.05, tNow: 80 }).dose, 0.3);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
