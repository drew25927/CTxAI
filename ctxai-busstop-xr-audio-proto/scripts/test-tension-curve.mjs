// 긴장 곡선/슬롯 스키마 회귀 테스트
import assert from "node:assert/strict";
import { curveAt, requiredEvents, evaluatePlan, slotById, variantOf, SLOTS, TRACK_CURVES, isMixTrack, normalizeMix, controlTrack, trackLabel } from "../lib/tensionCurve.js";

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


// B92 — 판정 전 잠정 트랙은 선두 장르 하나가 아니라 배합 가중 기대 곡선
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
test("B92 curveAt(배합): 세 곡선의 목표·허용폭·상한을 배합으로 가중 평균한다", () => {
  const mix = { R: 0.443, H: 0.344, C: 0.213 };
  for (const t of [0, 20, 29, 36.5, 37, 42, 45, 58, 120, 150, 999]) {
    const m = curveAt(mix, t);
    const w = normalizeMix(mix);
    const exp = ["R", "H", "C"].reduce((a, g) => ({ target: a.target + w[g] * curveAt(g, t).target, tol: a.tol + w[g] * curveAt(g, t).tol, ceiling: a.ceiling + w[g] * curveAt(g, t).ceiling }), { target: 0, tol: 0, ceiling: 0 });
    assert.ok(near(m.target, exp.target) && near(m.tol, exp.tol) && near(m.ceiling, exp.ceiling), `t=${t} ${JSON.stringify(m)} vs ${JSON.stringify(exp)}`);
    const ts = ["R", "H", "C"].map((g) => curveAt(g, t).target);
    assert.ok(m.target >= Math.min(...ts) - 1e-9 && m.target <= Math.max(...ts) + 1e-9, `t=${t} 기대 목표는 세 곡선 사이`);
  }
  // 한 장르에 몰린 배합은 그 장르 곡선과 같다 — 판정 뒤 장르 글자로 넘어갈 때 목표가 튀지 않는 근거
  for (const g of ["R", "H", "C"]) for (const t of [10, 37, 45, 150]) assert.ok(near(curveAt({ [g]: 1 }, t).target, curveAt(g, t).target), `${g} t=${t}`);
});
test("B92 배합 목표는 연속이다: 선두가 R→H 로 바뀌는 순간 목표가 거의 움직이지 않는다(선두 장르 곡선은 크게 튄다)", () => {
  const before = { R: 0.401, H: 0.399, C: 0.2 }, after = { R: 0.399, H: 0.401, C: 0.2 };
  const t = 36.5 + 1.5; // 개구리 결정 뒤 봉우리(stepCost tEff)
  const jumpMix = Math.abs(curveAt(after, t).target - curveAt(before, t).target);
  const jumpDom = Math.abs(curveAt("H", t).target - curveAt("R", t).target);
  assert.ok(jumpMix < 0.005, `배합 목표 변화 ${jumpMix}`);
  assert.ok(jumpDom > 0.1, `선두 장르 곡선 변화 ${jumpDom}`);
});
test("B92 controlTrack: 강제 트랙 > 판정 > 판정 전 배합, trackLabel 은 큰 순 퍼센트", () => {
  const mix = { R: 0.443, H: 0.344, C: 0.213 };
  assert.equal(controlTrack({ forced: "c", verdict: "H", mix }), "C");
  assert.equal(controlTrack({ verdict: "H", mix }), "H");
  assert.deepEqual(controlTrack({ mix }), normalizeMix(mix));
  assert.ok(isMixTrack(controlTrack({ mix })));
  assert.equal(controlTrack({}), "H");
  assert.ok(!isMixTrack("H") && !isMixTrack(null) && !isMixTrack({ foo: 1 }));
  assert.equal(trackLabel(mix), "잠정 R44 H34 C21");
  assert.equal(trackLabel({ R: 0.388, H: 0.438, C: 0.174 }), "잠정 H44 R39 C17");
  assert.equal(trackLabel("H"), "H");
  assert.equal(trackLabel(null), "-");
  assert.deepEqual(normalizeMix({ R: 0, H: 0, C: 0 }), { R: 0.333, H: 0.333, C: 0.333 });
  assert.deepEqual(normalizeMix({ R: 2, H: 1, C: 1 }), { R: 0.5, H: 0.25, C: 0.25 });
});
test("B92 evaluatePlan(배합): 상한은 기대 상한, 필수 사건은 장르가 정해지지 않아 검사하지 않는다", () => {
  const mix = { R: 0.5, H: 0.5, C: 0 };
  const cap = (TRACK_CURVES.R.ceiling + TRACK_CURVES.H.ceiling) / 2; // 0.835
  const plan = [planEntry("poster", "mid", 6), planEntry("truck", "near", 29)];
  plan[1].predTension = cap + 0.02;
  assert.ok(evaluatePlan(mix, plan).violations.some((x) => x.includes("상한 초과")), "기대 상한 초과 검출");
  plan[1].predTension = cap - 0.02;
  assert.deepEqual(evaluatePlan(mix, plan).violations, []);
  assert.ok(evaluatePlan("R", plan).violations.some((x) => x.includes("상한 초과")), "같은 값이 로맨스 상한(0.75)은 넘는다");
});
console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
