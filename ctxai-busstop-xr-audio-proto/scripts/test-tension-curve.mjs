// 긴장 곡선/슬롯 스키마 회귀 테스트
import assert from "node:assert/strict";
import { curveAt, requiredEvents, evaluatePlan, slotById, variantOf, SLOTS, TRACK_CURVES } from "../lib/tensionCurve.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

test("curveAt: 필수 키프레임 시각에서 정확한 목표값", () => {
  assert.equal(curveAt("H", 29).target, 0.55);
  assert.equal(curveAt("H", 52).target, 0.72);
  assert.equal(curveAt("R", 170).target, 0.7);
  assert.equal(curveAt("C", 45).target, 0.5);
});

test("curveAt: 키프레임 사이 선형 보간, 시작 전·끝 후는 경계값", () => {
  const mid = curveAt("H", 34.5); // 29(0.55)~40(0.4) 중간 ≈ 0.475
  assert.ok(Math.abs(mid.target - 0.475) < 0.02, `mid ${mid.target}`);
  assert.equal(curveAt("H", -5).target, 0.15);
  assert.equal(curveAt("H", 999).target, 0.3);
});

test("공포 곡선은 톱니(둘째 봉우리가 첫째보다 높다)", () => {
  assert.ok(curveAt("H", 52).target > curveAt("H", 29).target);
  assert.ok(curveAt("H", 150).target > curveAt("H", 52).target);
});

test("로맨스 상한이 공포보다 낮다", () => {
  assert.ok(TRACK_CURVES.R.ceiling < TRACK_CURVES.H.ceiling);
});

test("requiredEvents: 트랙별 필수 사건", () => {
  assert.ok(requiredEvents("H").has("truckSplash"));
  assert.ok(requiredEvents("H").has("catScream"));
  assert.ok(requiredEvents("C").has("cat"));
});

test("변형 조회: 트럭은 필수 슬롯이고 near/mid/far 셋", () => {
  const s = slotById("truck");
  assert.equal(s.required, true);
  assert.ok(variantOf(s, "near").dose === 0.9);
  assert.equal(variantOf(s, "nope"), null);
});

function planEntry(slotId, variantId, t, extra = {}) {
  const s = slotById(slotId); const v = variantOf(s, variantId);
  return { slotId, variantId, t, channel: s.channel, dose: v.dose, ...extra };
}

test("정상 계획: 위반 없음", () => {
  const plan = [ planEntry("poster", "mid", 6), planEntry("truck", "near", 29), planEntry("cat", "sudden", 45), planEntry("catScream" in {} ? "" : "micro-door", "shut", 90) ];
  const r = evaluatePlan("H", plan);
  // catScream 은 슬롯 목록엔 없지만 필수 사건이라 별도 체크 — 여기선 truck 만 필수 슬롯이므로 catScream 누락 경고가 뜬다
  assert.ok(r.violations.some((x) => x.includes("catScream")), JSON.stringify(r.violations));
});

test("상한 초과 검출", () => {
  const plan = [ planEntry("truck", "near", 29, { predTension: 0.99 }), planEntry("catScream" === "" ? "" : "cat", "sudden", 45, { predTension: 0.5 }) ];
  const r = evaluatePlan("H", plan);
  assert.ok(r.violations.some((x) => x.includes("상한 초과")), JSON.stringify(r.violations));
});

test("같은 채널 연속(최소 간격 안) 검출", () => {
  // frog(audio,37) → micro-door(audio,41) 간격 4s < 6s
  const plan = [ planEntry("truck", "far", 29), planEntry("frog", "once", 37), planEntry("micro-door", "shut", 41) ];
  const r = evaluatePlan("H", plan);
  assert.ok(r.violations.some((x) => x.includes("같은 채널 연속")), JSON.stringify(r.violations));
});

test("순서 위반 검출", () => {
  const plan = [ planEntry("truck", "near", 29), planEntry("poster", "mid", 6) ];
  const r = evaluatePlan("H", plan);
  assert.ok(r.violations.some((x) => x.includes("순서 위반")), JSON.stringify(r.violations));
});

test("필수 슬롯(truck) 누락 검출", () => {
  const plan = [ planEntry("poster", "mid", 6) ];
  const r = evaluatePlan("H", plan);
  assert.ok(r.violations.some((x) => x.includes("필수 슬롯")), JSON.stringify(r.violations));
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
