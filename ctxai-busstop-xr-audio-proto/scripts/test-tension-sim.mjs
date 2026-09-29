// 긴장 궤적 시뮬레이터(lib/tensionSim.js) 회귀 — 세 모드가 설계대로 움직이고, 제어 ON 이 관객 간 분산·목표
// 오차를 줄이며, B75(두 손 충돌)·B77(연속 채널 되먹임) 검토용 옵션이 의도한 방향으로 동작하는지.
import assert from "node:assert/strict";
import { simulateViewer, summarize, summarizeAtPeaks, ARCHETYPES, rng, randomViewer, SIM_PARAMS } from "../lib/tensionSim.js";
import { MICRO_PARAMS } from "../lib/slotController.js";
import { PROBE_DOSE } from "../lib/slotActuate.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }
const at = (t) => Math.round(t / SIM_PARAMS.DT);
const cloud = (track, mode, N = 40, opts) => { const r = rng(42); const runs = []; for (let v = 0; v < N; v++) runs.push(simulateViewer({ track, theta: randomViewer(r), mode, opts })); return runs; };

test("off: 미세 자극 없음 · 구동량 0 · x̂ = x · 슬롯은 전부 가운데 변형", () => {
  const r = simulateViewer({ track: "H", theta: ARCHETYPES.typical, mode: "off" });
  assert.equal(r.micro.length, 0);
  assert.ok(r.u.every((u) => u === 0));
  assert.ok(r.x.every((x, i) => x === r.xhat[i]));
  assert.deepEqual(r.plan.map((p) => p.variantId), ["mid", "linger", "mid", "twice", "mid"]);
  assert.equal(r.t.length, Math.round(SIM_PARAMS.T_END / SIM_PARAMS.DT) + 1);
});

test("film: 고정 슬롯은 중립, 판정 뒤 미세 자극 3회(간격 ≥ gap) · 판정 전 구동량 0 · 장면 뒤 0 으로 복귀", () => {
  const r = simulateViewer({ track: "H", theta: ARCHETYPES.blunt, mode: "film" });
  assert.deepEqual(r.plan.map((p) => p.variantId), ["mid", "linger", "mid", "twice", "mid"]);
  assert.equal(r.micro.length, MICRO_PARAMS.max);
  assert.ok(r.micro[0].t >= SIM_PARAMS.VERDICT_T);
  for (let i = 1; i < r.micro.length; i++) assert.ok(r.micro[i].t - r.micro[i - 1].t > MICRO_PARAMS.gap, `간격 ${r.micro[i].t - r.micro[i - 1].t}`);
  assert.ok(r.u.slice(0, at(SIM_PARAMS.VERDICT_T)).every((u) => u === 0), "판정 전 구동량");
  assert.ok(r.u[at(100)] > 0.5, "둔감형은 목표 아래라 각성 방향");
  assert.equal(r.u[at(SIM_PARAMS.T_END)], 0, "장면 뒤 복귀");
  // 미세 자극이 실제로 x 를 올린다(발동 직후 봉우리 > 발동 직전)
  const m = r.micro[0]; assert.ok(r.x[at(m.t + 1)] > r.x[at(m.t)] + 0.05);
});

test("full: 탐침 3개 뒤 슬롯(frog·cat)만 관객에 따라 다른 변형 — 민감형은 약하게, 둔감형은 세게", () => {
  const s = simulateViewer({ track: "H", theta: ARCHETYPES.sensitive, mode: "full" });
  const b = simulateViewer({ track: "H", theta: ARCHETYPES.blunt, mode: "full" });
  for (const r of [s, b]) assert.deepEqual(r.plan.slice(0, 3).map((p) => p.variantId), ["mid", "linger", "mid"], "탐침은 중립");
  const dose = (r, id) => r.plan.find((p) => p.slotId === id).dose;
  assert.ok(dose(s, "frog") < dose(b, "frog"), `frog ${dose(s, "frog")} vs ${dose(b, "frog")}`);
  assert.ok(dose(s, "cat") < dose(b, "cat"), `cat ${dose(s, "cat")} vs ${dose(b, "cat")}`);
  assert.ok(s.thetaHat.g > b.thetaHat.g, "θ̂ 이득이 참값 순서를 따른다");
});

for (const track of ["H", "R", "C"]) test(`${track}: full 이 off 보다 슬롯 봉우리 분산·목표 오차를 줄인다 (무작위 40명)`, () => {
  const off = summarizeAtPeaks(cloud(track, "off")), on = summarizeAtPeaks(cloud(track, "full"));
  assert.ok(on.meanStd < off.meanStd, `std off ${off.meanStd} on ${on.meanStd}`);
  assert.ok(on.rmse < off.rmse, `rmse off ${off.rmse} on ${on.rmse}`);
});

test("film 이 off 보다 장면(68~150s) 목표 오차를 줄인다 — 미세 자극만으로는 조금", () => {
  const off = summarize(cloud("H", "off"), { t0: 68, t1: 150 }), on = summarize(cloud("H", "film"), { t0: 68, t1: 150 });
  assert.ok(on.rmse < off.rmse, `rmse off ${off.rmse} on ${on.rmse}`);
});

test("결정적: 같은 입력이면 같은 궤적", () => {
  const a = simulateViewer({ track: "C", theta: ARCHETYPES.sensitive, mode: "full" });
  const b = simulateViewer({ track: "C", theta: ARCHETYPES.sensitive, mode: "full" });
  assert.deepEqual(a.x, b.x); assert.deepEqual(a.u, b.u); assert.deepEqual(a.micro, b.micro);
});

test("B75: 코미디 트랙 민감형 — 창이 없으면(B75 이전) 미세 자극 직후 연속 손이 이완(relax)으로 맞서고, 기본값(/film 과 같은 창)에서는 멈춘다", () => {
  const asIs = simulateViewer({ track: "C", theta: ARCHETYPES.sensitive, mode: "film", opts: { holdAfterMicro: 0 } });
  const hold = simulateViewer({ track: "C", theta: ARCHETYPES.sensitive, mode: "film" });
  assert.equal(hold.opts.holdAfterMicro, SIM_PARAMS.HOLD_AFTER_MICRO, "기본값은 /film 의 창");
  const m = asIs.micro[0];
  const win = (r) => r.mode.slice(at(m.t) + 1, at(m.t + SIM_PARAMS.HOLD_AFTER_MICRO));
  assert.ok(win(asIs).includes("relax"), `as-is 창 안 모드 ${[...new Set(win(asIs))]}`);
  assert.ok(win(hold).every((x) => x === "settle"), `hold 창 안 모드 ${[...new Set(win(hold))]}`);
  const uWin = (r) => r.u.slice(at(m.t) + 1, at(m.t + SIM_PARAMS.HOLD_AFTER_MICRO));
  assert.ok(new Set(uWin(hold)).size === 1, "hold 창 안에서 u 불변");
  assert.ok(Math.min(...uWin(asIs)) < uWin(hold)[0], "as-is 는 창 안에서 u 가 내려간다");
  assert.deepEqual(hold.micro.map((x) => x.t), asIs.micro.map((x) => x.t), "미세 자극 시각은 같다");
});

test("B77: 연속 채널의 느린 항 — 참 효과가 있으면 x 가 x̂ 보다 오르고(as-is 는 못 본다), 모델 항을 넣으면 민감형의 u 가 덜 포화한다", () => {
  const asIs = simulateViewer({ track: "H", theta: ARCHETYPES.sensitive, mode: "film", opts: { contTruth: SIM_PARAMS.CONT_K, contModel: "none" } });
  const slow = simulateViewer({ track: "H", theta: ARCHETYPES.sensitive, mode: "film", opts: { contTruth: SIM_PARAMS.CONT_K, contModel: "slow" } });
  assert.ok(asIs.x[at(140)] > asIs.xhat[at(140)] + 0.2, `as-is x ${asIs.x[at(140)]} x̂ ${asIs.xhat[at(140)]}`);
  assert.ok(slow.xhat[at(140)] > asIs.xhat[at(140)] + 0.1, "모델 항이 x̂ 을 올린다");
  assert.ok(slow.u[at(100)] < asIs.u[at(100)], `u slow ${slow.u[at(100)]} < as-is ${asIs.u[at(100)]}`);
  assert.ok(Math.max(...slow.x) < Math.max(...asIs.x), "모델 항이 있으면 참 긴장의 최대치가 낮다(과잉 구동 완화)");
  const none = simulateViewer({ track: "H", theta: ARCHETYPES.sensitive, mode: "film" });
  assert.deepEqual(none.x, none.xhat, "기본값(효과 0·모델 없음)은 x̂ = x");
});

test("B87 현실 조건: 개구리·고양이 결정은 그 시각까지 닫힌 레코드만(우비 인물은 아직 열림 → 2개) · 탐침 용량은 /film 큐 볼륨", () => {
  const ideal = simulateViewer({ track: "H", theta: ARCHETYPES.typical, mode: "full" });
  const real = simulateViewer({ track: "H", theta: ARCHETYPES.typical, mode: "full", opts: { realistic: true } });
  assert.deepEqual(ideal.plan.filter((p) => p.nFit != null).map((p) => p.nFit), [3, 4], "이상 조건은 앞 자극 전부");
  assert.deepEqual(real.plan.filter((p) => p.nFit != null).map((p) => p.nFit), [2, 2], "현실 조건: 포스터·물보라만 닫힘");
  assert.deepEqual(real.plan.slice(0, 3).map((p) => p.dose), [PROBE_DOSE.poster, PROBE_DOSE.figure, PROBE_DOSE.truck]);
  assert.equal(real.opts.realistic, true);
  assert.ok(real.stimuli.every((r) => r.closeAt >= r.onset), "닫히는 시각은 자극 뒤");
  const off = simulateViewer({ track: "H", theta: ARCHETYPES.typical, mode: "off" });
  assert.ok(off.stimuli.every((r) => r.closeAt === r.onset), "기본값은 이상 조건(즉시 닫힘)");
});

// 40명에서는 H 가 현실 0.154 · 이상 0.153 으로 거의 같아(표본 흔들림) 120명으로 본다. sim:plot 200명: 봉우리 std H −16%→−13% · R −19%→−14% · C −14%→−12%.
for (const track of ["H", "R", "C"]) test(`B87 ${track}: 현실 조건에서도 full 이 off 보다 봉우리 분산·목표 오차를 줄이지만, 감소 폭은 이상 조건보다 크지 않다 (무작위 120명)`, () => {
  const red = (o, f, k) => 1 - f[k] / o[k];
  const io = summarizeAtPeaks(cloud(track, "off", 120)), iF = summarizeAtPeaks(cloud(track, "full", 120));
  const ro = summarizeAtPeaks(cloud(track, "off", 120, { realistic: true })), rF = summarizeAtPeaks(cloud(track, "full", 120, { realistic: true }));
  for (const k of ["meanStd", "rmse"]) {
    const ideal = red(io, iF, k), real = red(ro, rF, k);
    assert.ok(real > 0, `${k} 현실 조건 감소 ${real.toFixed(3)}`);
    assert.ok(real <= ideal, `${k} 현실 ${real.toFixed(3)} ≤ 이상 ${ideal.toFixed(3)}`);
  }
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
