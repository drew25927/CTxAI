// 긴장 추정 회귀 테스트
import assert from "node:assert/strict";
import { estimateTensionSeries, tensionAt, peaks, TENSION_PARAMS, OBS_EPS, isObserved, observedSegments, xhatReading, trackingStats, xhatScopeNote } from "../lib/tensionEstimate.js";

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

// B149 — 관측 범위: 사건 사이 창은 "측정 밖" 으로 가르고, 추종 요약은 전체·관측 창을 따로 센다
test("isObserved: 사건 기여가 OBS_EPS 이상이면 관측, 바닥값이면 사건 사이, fromStim 없으면 관측", () => {
  const s = estimateTensionSeries({ windows: wins(40), stimuli: [bigStartle] });
  const at = (t) => s.find((p) => p.t === t);
  assert.ok(isObserved(at(32)), `봉우리 직후 ${at(32).fromStim}`);
  assert.ok(!isObserved(at(20)), `자극 전 ${at(20).fromStim}`);
  assert.ok(!isObserved(at(60)), `오래 뒤 ${at(60).fromStim}`);
  assert.ok(isObserved({ t: 1, tension: 0.4 }), "fromStim 없는 외부 계열은 관측으로");
  assert.ok(OBS_EPS > 0 && OBS_EPS < 0.1);
});

test("observedSegments: 관측·사건 사이 구간이 번갈아 나오고 경계 점을 공유한다", () => {
  const s = estimateTensionSeries({ windows: wins(40), stimuli: [bigStartle] });
  const segs = observedSegments(s);
  assert.deepEqual(segs.map((g) => g.observed), [false, true, false]);
  assert.equal(segs[1].points[0], segs[0].points.at(-1), "앞 구간 마지막 점 = 뒤 구간 첫 점");
  assert.equal(segs[2].points[0], segs[1].points.at(-1));
  assert.equal(segs.reduce((k, g, i) => k + g.points.length - (i ? 1 : 0), 0), s.length, "공유 점을 빼면 원래 점 수");
  assert.deepEqual(observedSegments([]), []);
});

test("xhatReading: 사건 사이는 목표보다 한참 아래여도 'below' 가 아니라 'between'", () => {
  const base = { t: 80, tension: 0.18, fromStim: 0 };
  assert.equal(xhatReading(base, { target: 0.67, tol: 0.12 }).state, "between");
  assert.equal(xhatReading(base, { target: 0.67, tol: 0.12 }).label, "사건 사이");
  assert.equal(xhatReading({ ...base, fromStim: 0.2 }, { target: 0.67, tol: 0.12 }).state, "below");
  assert.equal(xhatReading({ t: 1, tension: 0.9, fromStim: 0.7 }, { target: 0.67, tol: 0.12 }).state, "above");
  assert.equal(xhatReading({ t: 1, tension: 0.6, fromStim: 0.4 }, { target: 0.67, tol: 0.12 }).state, "in");
  assert.equal(xhatReading({ t: 1, tension: 0.6, fromStim: 0.4 }, {}).state, "none", "목표 없음(/interim)");
  assert.equal(xhatReading(null).state, "none");
});

test("trackingStats: 구간 안 창만 세고, 관측 창의 허용폭 안을 따로 센다", () => {
  const s = estimateTensionSeries({ windows: wins(40), stimuli: [bigStartle] });
  const flat = () => ({ target: 0.6, tol: 0.1 });
  const all = trackingStats(s, flat);
  assert.equal(all.n, s.length);
  assert.ok(all.observed > 0 && all.observed < all.n, `관측 ${all.observed}/${all.n}`);
  assert.ok(all.observedInTol <= all.observed && all.inTol <= all.n);
  assert.equal(all.meanTarget, 0.6);
  const quiet = trackingStats(s, flat, { t0: 50, t1: 80 });
  assert.equal(quiet.observed, 0, "자극 20초 뒤는 사건 사이뿐");
  assert.equal(quiet.inTol, 0, "바닥 0.12 는 목표 0.6±0.1 밖");
  assert.equal(quiet.maxObservedXhat, null);
  assert.equal(trackingStats([], flat).n, 0);
  assert.equal(trackingStats([], flat).meanXhat, null);
});

test("xhatScopeNote: 장면에서만, 제어 ON 이면 연속 구동이 측정 밖이라고 밝힌다", () => {
  assert.equal(xhatScopeNote({ scene: false, control: true }), null);
  assert.match(xhatScopeNote({ scene: true, control: true }), /사건 반응만.*연속 구동.*측정 밖/);
  assert.match(xhatScopeNote({ scene: true, control: false }), /사건 반응만.*측정 밖/);
  assert.doesNotMatch(xhatScopeNote({ scene: true, control: false }), /연속 구동/);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
