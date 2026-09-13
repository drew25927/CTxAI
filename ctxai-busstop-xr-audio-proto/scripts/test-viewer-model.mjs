// 관객 응답 모델 회귀 테스트 — 합성 관객의 θ를 근사 복원하고 예측이 모집단 평균을 이기는지 본다.
import assert from "node:assert/strict";
import { fitViewerModel, predictResponse, doseForTarget, responseMagnitude, VIEWER_PRIOR } from "../lib/viewerModel.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

// 참 모델에서 탐침 레코드를 만든다. responseMagnitude 가 정확히 mag 를 돌려주도록 peakAmp 만 채운다.
function stim(theta, dose, nth) {
  const mag = theta.g * dose * Math.pow(1 - theta.rho, nth);
  return { name: `s${nth}`, kind: "startle", channel: "audio", dose, nth, dur: 1, responded: 1,
    peakAmp: mag * 180, maxVel: 0, lookSec: 0, retreat: 0, lookLatency: theta.L, moveLatency: theta.L, recoverySec: theta.tau, recheck: 0 };
}
const DOSES = [0.7, 0.9, 0.6, 0.8, 1.0, 0.75];
function session(theta, count = 6) { return DOSES.slice(0, count).map((d, i) => stim(theta, d, i)); }

test("responseMagnitude: peakAmp 90° = 0.5, maxVel 200 = 0.3, retreat 10cm = 0.3", () => {
  assert.ok(Math.abs(responseMagnitude({ peakAmp: 90, dur: 1 }) - 0.5) < 1e-9);
  assert.ok(Math.abs(responseMagnitude({ maxVel: 200, dur: 1 }) - 0.3) < 1e-9);
  assert.ok(Math.abs(responseMagnitude({ retreat: 0.1, dur: 1 }) - 0.3) < 1e-9);
});

test("빠른 회복 vs 느린 회복: 추정 τ가 갈린다", () => {
  const fast = fitViewerModel(session({ g: 0.8, L: 0.4, tau: 1.0, rho: 0.05 }));
  const slow = fitViewerModel(session({ g: 0.8, L: 0.4, tau: 3.5, rho: 0.05 }));
  assert.ok(fast.tau < 1.6, `fast.tau ${fast.tau}`);
  assert.ok(slow.tau > 2.8, `slow.tau ${slow.tau}`);
  assert.ok(fast.tau < slow.tau);
});

test("습관화형: ρ 추정이 크고, 비습관화형은 작다", () => {
  const hab = fitViewerModel(session({ g: 1.0, L: 0.5, tau: 2, rho: 0.4 }));
  const flat = fitViewerModel(session({ g: 1.0, L: 0.5, tau: 2, rho: 0.05 }));
  assert.ok(hab.rho > 0.2, `hab.rho ${hab.rho}`);
  assert.ok(flat.rho < 0.2, `flat.rho ${flat.rho}`);
});

test("지연 L 추정이 참값을 따라간다", () => {
  const m = fitViewerModel(session({ g: 0.8, L: 0.9, tau: 2, rho: 0.1 }));
  assert.ok(Math.abs(m.L - 0.9) < 0.25, `L ${m.L}`);
});

test("이득 g 추정이 참값 근방", () => {
  const m = fitViewerModel(session({ g: 1.2, L: 0.5, tau: 2, rho: 0.1 }));
  assert.ok(m.g > 0.8 && m.g < 1.5, `g ${m.g}`);
});

test("예측: 뒤 사건(held-out nth)을 모집단 평균보다 잘 맞힌다 (습관화형)", () => {
  const truth = { g: 1.0, L: 0.5, tau: 2, rho: 0.4 };
  const train = session(truth, 4);            // nth 0..3 으로 식별
  const theta = fitViewerModel(train);
  const nthHeld = 4, doseHeld = 0.9;
  const actual = truth.g * doseHeld * Math.pow(1 - truth.rho, nthHeld);
  const pred = predictResponse(theta, { dose: doseHeld, nth: nthHeld });
  const popMean = VIEWER_PRIOR.g * doseHeld;   // 모집단 평균(습관화 무시)
  assert.ok(Math.abs(pred - actual) < Math.abs(popMean - actual), `pred ${pred.toFixed(3)} vs pop ${popMean.toFixed(3)} (actual ${actual.toFixed(3)})`);
});

test("doseForTarget: 그 용량을 넣으면 목표 반응이 나온다", () => {
  const theta = { g: 0.8, L: 0.5, tau: 2, rho: 0.2 };
  const target = 0.4, nth = 2;
  const d = doseForTarget(theta, target, nth, 1);
  assert.ok(Math.abs(predictResponse(theta, { dose: d, nth }) - target) < 1e-6, `got ${predictResponse(theta, { dose: d, nth })}`);
});

test("표본 없음 → 사전분포 그대로, 확신도 0", () => {
  const m = fitViewerModel([]);
  assert.equal(m.g, VIEWER_PRIOR.g);
  assert.equal(m.rho, VIEWER_PRIOR.rho);
  assert.equal(m.confidence, 0);
});

test("응답 하나 → 절편만 갱신, 습관화는 사전분포 유지, 확신도 낮음", () => {
  const m = fitViewerModel([stim({ g: 2.0, L: 0.3, tau: 1.5, rho: 0.3 }, 0.8, 0)]);
  assert.equal(m.rho, VIEWER_PRIOR.rho);
  assert.ok(m.confidence <= 0.5);
  assert.ok(m.g > VIEWER_PRIOR.g, `g ${m.g}`);  // 큰 반응 하나가 g를 사전분포 위로 당긴다
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
