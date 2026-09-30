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
  assert.match(c.reason, /^슬롯 시각 목표 /, "B109 — 모니터 머리의 \"지금 목표\"(현재 시각) 와 이름을 나눈다"); // 슬롯 시각(t+RISE)의 곡선값
  assert.ok(/도달 한계/.test(c.reason), c.reason); // 이득 낮으니 도달 한계 표시
});

test("reason(B193): 목표에서 벗어난 이유를 화면이 말한다 — 가장 약한 변형으로도 초과 · 상한 넘어 벌점 · 1.0 에서 잘림, '상한 눌림' 은 없다", () => {
  const cands = candidateSlots();
  const frog = cands.findIndex((s) => s.id === "frog"), cat = cands.findIndex((s) => s.id === "cat");
  const mid = chooseVariant("H", cands, frog, 0.3, { g: 0.8, L: 0.5, tau: 2, rho: 0.1 }, {}, null);
  assert.equal(mid.variantId, "once", "가장 약한 변형");
  assert.match(mid.reason, /\(가장 약한 변형으로도 목표 초과\)$/, mid.reason);
  assert.doesNotMatch(mid.reason, /상한/, "0.92 아래면 상한 이야기를 하지 않는다");
  const high = chooseVariant("H", cands, cat, 0.5, { g: 1.2, L: 0.5, tau: 2, rho: 0.1 }, { audio: 1 }, null);
  assert.match(high.reason, /가장 약한 변형으로도 목표 초과 · 상한 0\.92 넘어 벌점\)$/, high.reason);
  const clip = chooseVariant("H", cands, cat, 0.5, { g: 2.0, L: 0.5, tau: 2, rho: 0.1 }, { audio: 1 }, null);
  assert.match(clip.reason, /상한 0\.92 넘어 벌점 · 예측 1\.0 에서 잘림\)$/, clip.reason);
  const near = chooseVariant("H", cands, frog, 0.3, { g: 0.3, L: 0.5, tau: 2, rho: 0.1 }, {}, null);
  assert.equal(near.reason, `슬롯 시각 목표 ${near.target} / 예측 ${near.predTension}`, "목표 근처(|차| ≤ 0.08)면 사유 없음");
  for (const r of [mid, high, clip, near, chooseVariant("H", cands, 2, 0.3, { g: 0.2, L: 0.5, tau: 2, rho: 0.1 }, {}, null)]) assert.doesNotMatch(r.reason, /눌림/, r.reason);
  assert.equal(near.ceiling, 0.92, "결정에 곡선 상한이 실린다");
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
test("nextAdvice: 대사 때문에 미루는 동안은 \"발동 조건 충족\" 이 아니라 사유와 \"미룸\" 을 적는다 (B138)", () => {
  const talk = { quiet: false, why: "talk", label: "대사 중", need: 3 };
  const a = nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, quiet: talk });
  const d = microDecision({ xhat: 0.2, target: 0.65, tol: 0.1, tNow: 90, lastAt: -Infinity, count: 0 });
  assert.equal(a.kind, "micro"); assert.equal(a.deferred, true); assert.equal(a.dose, d.dose, "미뤄도 용량은 지금 조건 그대로");
  assert.doesNotMatch(a.reason, /발동 조건 충족/); assert.match(a.reason, /대사 중 → 조용한 틈\(3초 이상\)까지 미룸/);
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, quiet: { quiet: false, why: "gap", label: "다음 줄까지 1.2s", need: 3 } }).reason, /다음 줄까지 1\.2s → 조용한 틈/);
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, quiet: talk, controlOn: false }).reason, /미룸 \(제어 OFF — 권고만\)/);
  // 조용하면 종전 문구 — quiet 를 안 줘도 같다
  const calm = nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, quiet: { quiet: true, why: null, label: "", need: 3 } });
  assert.match(calm.reason, /발동 조건 충족/); assert.equal(calm.deferred, undefined);
  assert.equal(calm.reason, nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2 }).reason);
  // 조건이 안 맞으면 대사 중이어도 원래 사유(간격 대기·곡선 안·예산 소진)가 먼저다 — "미룸" 은 조건이 맞을 때만
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, lastMicroAt: 85, microCount: 1, quiet: talk }).reason, /간격 대기/);
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.6, quiet: talk }).reason, /곡선 안/);
  assert.equal(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, microCount: 3, quiet: talk }).spent, true);
});
test("nextAdvice: x̂ 가 사건 사이 바닥값이면 \"사건 사이\" 로 적는다 — 판정 규칙은 같다 (B138·B149)", () => {
  const obs = nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2 });
  const between = nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, observed: false });
  assert.equal(between.dose, obs.dose);
  assert.match(between.reason, /^사건 사이\(x̂ 0\.20\) < 목표 0\.65−0\.10 → 발동 조건 충족/);
  assert.match(obs.reason, /^x̂ 0\.20 < 목표/);
  // 장면 전 안내도 "처지면" 이 아니라 사건 사이를 포함한다고 밝힌다
  assert.match(nextAdvice({ ...sceneArgs, tNow: 50, xhat: 0.2 }).reason, /목표 아래면\(사건 사이 포함\) 먼 문으로 반응을 잰다/);
});
test("nextAdvice: 간격 대기·곡선 안·상한 위·예산 소진을 구분한다", () => {
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, lastMicroAt: 85, microCount: 1 }).reason, /간격 대기 7s \(직전 1:25\)/);
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.6 }).reason, /곡선 안/);
  assert.match(nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.95 }).reason, /상한 위/);
  const spent = nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, microCount: MICRO_PARAMS.max });
  assert.equal(spent.spent, true); assert.equal(spent.count, 3); assert.equal(spent.dose, null);
  assert.equal(spent.reason, "남은 장면(~2:30)은 연속 구동만");
});
test("nextAdvice: 미세 자극 머리는 울린 횟수(count)를 주고, 예산이 남아 있으면 spent 가 없다 (B161)", () => {
  // 모니터 머리 "다음 미세 자극(count+1번째)" — count 는 이미 울린 수. 예전 "다음 미세 자극 먼 문 1/3" 이 "다음 것이 첫 번째" 로 읽혔다
  for (const c of [0, 1, 2]) {
    const a = nextAdvice({ ...sceneArgs, tNow: 90, xhat: 0.2, lastMicroAt: -Infinity, microCount: c });
    assert.equal(a.kind, "micro"); assert.equal(a.count, c); assert.equal(a.spent, undefined, `count ${c}`);
    assert.doesNotMatch(a.reason, /소진/);
  }
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

// B85 — 도입부 중립 탐침(poster·figure·truck)은 계획·모니터에서 변형을 적지 않는다
const FIXED = { poster: 0.7, figure: 0.55, truck: 0.9 }; // /film 이 실제로 울리는 용량(slotActuate PROBE_DOSE — test-slot-actuate 가 값을 고정)
const TH = { g: 0.8, L: 0.5, tau: 2, rho: 0.1 };
test("B85 runController fixed: 탐침은 neutral·variantId null·용량 고정, 개구리·고양이는 여전히 메뉴 안에서 고른다", () => {
  for (const track of ["H", "R", "C"]) for (const th of [TH, { g: 0.2, L: 0.5, tau: 2, rho: 0.1 }, { g: 2.0, L: 0.5, tau: 2, rho: 0.05 }]) {
    const r = runController(track, th, { fixed: FIXED });
    assert.equal(r.entries.length, candidateSlots().length);
    for (const e of r.entries) {
      if (e.slotId in FIXED) {
        assert.equal(e.neutral, true); assert.equal(e.variantId, null); assert.equal(e.dose, FIXED[e.slotId]);
        assert.match(e.reason, /^중립 탐침 — 변형 없음/);
        const p = r.plan.find((q) => q.slotId === e.slotId); assert.equal(p.neutral, true); assert.equal(p.variantId, null);
      } else {
        assert.equal(e.neutral, undefined); assert.ok(variantOf(slotById(e.slotId), e.variantId), `${track} ${e.slotId}/${e.variantId}`);
      }
    }
  }
});
test("B85 runController fixed: 탐침 용량은 예측에 그대로 들어간다(물보라 0.9 가 0.4 보다 높은 봉우리) — 메뉴에서 고르지 않을 뿐 궤적 예측은 이어 간다", () => {
  const hi = entry(runController("H", TH, { fixed: { ...FIXED, truck: 0.9 } }), "truck");
  const lo = entry(runController("H", TH, { fixed: { ...FIXED, truck: 0.4 } }), "truck");
  assert.ok(hi.predTension > lo.predTension, `0.9 → ${hi.predTension} vs 0.4 → ${lo.predTension}`);
});
test("B85 fixed 를 주지 않으면 종전과 같다(모든 슬롯에서 변형을 고르고 neutral 표시 없음 — sim-trajectory 규약)", () => {
  const r = runController("H", TH);
  assert.deepEqual(r.entries, planH);
  for (const e of r.entries) { assert.equal(e.neutral, undefined); assert.ok(e.variantId); }
});
test("B85 nextAdvice: 0:00~0:29 은 어떤 시각에도 변형을 추천하지 않는다(kind probe · variantId null), 물보라 뒤(0:30)부터 개구리 계획", () => {
  const planF = runController("H", TH, { fixed: FIXED }).entries;
  const byT = { 0: "poster", 5.9: "poster", 6.1: "figure", 20: "truck", 28.9: "truck" };
  for (let t = 0; t < 29; t += 0.25) {
    const a = nextAdvice({ ...sceneArgs, entries: planF, tNow: t, verdict: false });
    assert.equal(a.kind, "probe", `t=${t}`); assert.equal(a.variantId, null, `t=${t}`);
    assert.ok(!/→/.test(a.reason), `t=${t} ${a.reason}`);
  }
  for (const [t, id] of Object.entries(byT)) assert.equal(nextAdvice({ ...sceneArgs, entries: planF, tNow: Number(t) }).slotId, id, `t=${t}`);
  const frog = nextAdvice({ ...sceneArgs, entries: planF, tNow: 30 });
  assert.equal(frog.kind, "slot"); assert.equal(frog.slotId, "frog"); assert.ok(frog.variantId);
});
test("B85 nextAdvice: 제어 OFF 면 슬롯 계획에 \"권고만\" 이 붙고(고정 연출이라 그 변형으로 울리지 않는다) 탐침에는 붙지 않는다", () => {
  const planF = runController("H", TH, { fixed: FIXED }).entries;
  assert.match(nextAdvice({ ...sceneArgs, entries: planF, tNow: 30, controlOn: false }).reason, /제어 OFF — 권고만\)$/);
  assert.ok(!/권고만/.test(nextAdvice({ ...sceneArgs, entries: planF, tNow: 30 }).reason));
  assert.ok(!/권고만/.test(nextAdvice({ ...sceneArgs, entries: planF, tNow: 20, controlOn: false }).reason));
  // 페이지가 확정 슬롯을 confirmed 로 바꿔 넘기면(고정 연출로 이미 정해짐) "권고만" 을 덧붙이지 않는다
  const confirmed = planF.map((e) => (e.slotId === "cat" ? { ...e, variantId: "중립", dose: 0.8, reason: "확정 · 제어 OFF — 고정 연출(중립)", confirmed: true } : e));
  assert.equal(nextAdvice({ ...sceneArgs, entries: confirmed, tNow: 44, controlOn: false }).reason, "확정 · 제어 OFF — 고정 연출(중립)");
  // B106 미리보기 줄(preview) — kind slot 에 preview true 가 붙어 모니터가 "지금 정하면" 을 그린다. 제어 OFF 면 "권고만" 도 붙는다
  const previewed = planF.map((e) => (e.slotId === "cat" ? { ...e, variantId: "playful", dose: 0.4, reason: "x̂ 0.27 기준 · 목표 0.549 / 예측 0.559 · 채널 av 2번째", preview: true } : e));
  const on = nextAdvice({ ...sceneArgs, entries: previewed, tNow: 44 });
  assert.equal(on.kind, "slot"); assert.equal(on.preview, true); assert.equal(on.variantId, "playful"); assert.equal(on.dose, 0.4);
  assert.equal(on.reason, "x̂ 0.27 기준 · 목표 0.549 / 예측 0.559 · 채널 av 2번째");
  assert.match(nextAdvice({ ...sceneArgs, entries: previewed, tNow: 44, controlOn: false }).reason, /^x̂ 0\.27 기준 .* \(제어 OFF — 권고만\)$/);
  assert.equal(nextAdvice({ ...sceneArgs, entries: planF, tNow: 44 }).preview, false, "계획 줄(미리보기 아님)은 preview false");
  assert.equal(nextAdvice({ ...sceneArgs, entries: confirmed, tNow: 44, controlOn: false }).preview, false, "확정 줄은 preview false");
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
