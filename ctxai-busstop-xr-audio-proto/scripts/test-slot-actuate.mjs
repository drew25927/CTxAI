// 슬롯 변형 액추에이터 회귀 테스트(B78) — 변형표 완결성·OFF=고정 연출·관객별로 다른 변형·고양이 동선·chooseSlotNow 규약
import assert from "node:assert/strict";
import { decideSlot, catSchedule, missingActuations, SLOT_ACTUATION, NEUTRAL_ACTUATION, NEUTRAL_DOSE, CONTROLLED_SLOTS, DECIDE_AT, CAT_TIMING_NEUTRAL, PROBE_DOSE, previewSlotEntries } from "../lib/slotActuate.js";
import { SIM_PARAMS } from "../lib/tensionSim.js";
import { chooseSlotNow, runController, candidateSlots } from "../lib/slotController.js";
import { slotById, variantOf, controlTrack, curveAt } from "../lib/tensionCurve.js";
import { CUES, T, evalActors } from "../lib/filmTimeline.js";
import { createGazeSim, doseFactor, DOSE_REF } from "../lib/gazeSim.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

const SENSITIVE = { g: 1.2, L: 0.3, tau: 3.5, rho: 0.1, n: 3, nResp: 3, confidence: 0.6 };
const BLUNT = { g: 0.35, L: 0.7, tau: 1.2, rho: 0.35, n: 3, nResp: 3, confidence: 0.6 };
const cue = (name) => CUES.find((c) => c.name === name);

test("변형표 완결성: 제어 슬롯(frog·cat)의 모든 변형에 실제 값(sfx·volume·plays)이 있고, 표에 없는 변형 id 는 없다", () => {
  assert.deepEqual(missingActuations(), []);
  for (const id of CONTROLLED_SLOTS) {
    const slot = slotById(id);
    for (const [vid, a] of Object.entries(SLOT_ACTUATION[id])) {
      assert.ok(variantOf(slot, vid), `${id}/${vid} 는 SLOTS 에 없는 변형`);
      assert.ok(a.sfx && a.volume > 0 && a.volume <= 1 && a.plays >= 1, `${id}/${vid} ${JSON.stringify(a)}`);
      assert.equal(a.sfx, cue(id).sfx, `${id} 는 큐와 같은 효과음을 쓴다`);
    }
  }
});

test("용량이 큰 변형이 더 세게 울린다 — dose 오름차순으로 볼륨이 단조 증가(같으면 반복 횟수가 더 많다)", () => {
  for (const id of CONTROLLED_SLOTS) {
    const vs = [...slotById(id).variants].sort((a, b) => a.dose - b.dose);
    for (let i = 1; i < vs.length; i++) {
      const a = SLOT_ACTUATION[id][vs[i - 1].id], b = SLOT_ACTUATION[id][vs[i].id];
      assert.ok(b.volume > a.volume || (b.volume === a.volume && b.plays > a.plays), `${id}: ${vs[i - 1].id}(${a.volume}×${a.plays}) → ${vs[i].id}(${b.volume}×${b.plays})`);
    }
  }
});

test("제어 OFF: 어떤 관객이든 고정 연출 — 큐 볼륨(0.8) 한 번, 용량 0.8, variantId null, 고양이 동선은 T.* 그대로", () => {
  for (const theta of [SENSITIVE, BLUNT, null]) {
    for (const id of CONTROLLED_SLOTS) {
      const d = decideSlot({ slotId: id, controlOn: false, track: "H", theta, xhat: 0.3 });
      assert.equal(d.variantId, null); assert.equal(d.dose, NEUTRAL_DOSE);
      assert.equal(d.actuation.volume, cue(id).volume); assert.equal(d.actuation.plays, 1);
      assert.deepEqual(d.actuation, NEUTRAL_ACTUATION[id]);
    }
    const c = decideSlot({ slotId: "cat", controlOn: false, track: "H", theta, xhat: 0.3 });
    assert.deepEqual(c.schedule, { catIn: T.catIn, catStop: T.catStop, catOut: T.catOut, catGone: T.catGone });
  }
  assert.equal(decideSlot({ slotId: "frog", controlOn: false, track: "H", theta: SENSITIVE, xhat: 0.3 }).schedule, undefined);
});

test("제어 ON 인데 θ̂ 이 없으면(탐침 응답 0) 중립으로 — 추정 없이 변형을 고르지 않는다", () => {
  const d = decideSlot({ slotId: "frog", controlOn: true, track: "H", theta: null, xhat: null });
  assert.equal(d.variantId, null); assert.match(d.reason, /중립/);
  const e = decideSlot({ slotId: "cat", controlOn: true, track: "H", theta: { ...SENSITIVE, n: 0 }, xhat: null });
  assert.equal(e.variantId, null); assert.ok(e.schedule);
});

test("제어 ON: 같은 트랙(H)에서 민감형과 둔감형은 개구리·고양이 변형이 다르고, 둔감형이 더 큰 용량을 받는다", () => {
  for (const id of CONTROLLED_SLOTS) {
    const s = decideSlot({ slotId: id, controlOn: true, track: "H", theta: SENSITIVE, xhat: 0.3 });
    const b = decideSlot({ slotId: id, controlOn: true, track: "H", theta: BLUNT, xhat: 0.2 });
    assert.ok(s.variantId && b.variantId, `${id} 변형 없음`);
    assert.notEqual(s.variantId, b.variantId, `${id}: 둘 다 ${s.variantId}`);
    assert.ok(b.dose > s.dose, `${id}: 둔감형 ${b.dose} ≤ 민감형 ${s.dose}`);
    assert.ok(b.actuation.volume >= s.actuation.volume, `${id}: 볼륨 둔감형 ${b.actuation.volume} < 민감형 ${s.actuation.volume}`);
    assert.equal(s.actuation, SLOT_ACTUATION[id][s.variantId]);
    assert.match(s.reason, /목표 .* 예측/);
  }
});

test("고양이 동선: 모든 변형이 catIn 고정·단조 증가·비명(T.catScream) 전에 사라진다. sudden 은 neutral 보다 빨리 멈추고 빨리 떠난다", () => {
  const neutral = catSchedule();
  assert.deepEqual(neutral, { catIn: T.catIn, catStop: T.catStop, catOut: T.catOut, catGone: T.catGone });
  assert.deepEqual(catSchedule(CAT_TIMING_NEUTRAL), neutral);
  for (const [vid, a] of Object.entries(SLOT_ACTUATION.cat)) {
    const s = catSchedule(a.timing);
    assert.equal(s.catIn, T.catIn, vid);
    assert.ok(s.catIn < s.catStop && s.catStop < s.catOut && s.catOut < s.catGone, `${vid} ${JSON.stringify(s)}`);
    assert.ok(s.catGone < T.catScream, `${vid} 고양이가 비명(${T.catScream}s)까지 남는다: ${s.catGone}`);
    assert.ok(s.catGone > cue("cat").t + 0.5, `${vid} 소리 큐(${cue("cat").t}) 뒤 0.5초는 있어야 센서 창이 선다`);
  }
  const sudden = catSchedule(SLOT_ACTUATION.cat.sudden.timing), playful = catSchedule(SLOT_ACTUATION.cat.playful.timing);
  assert.ok(sudden.catStop < neutral.catStop && sudden.catGone < neutral.catGone);
  assert.ok(playful.catStop > neutral.catStop && playful.catGone > neutral.catGone);
});

test("evalActors 가 동선을 따른다 — sudden 은 44.5s 에 벤치 앞에 멈춰 관객을 보고, 기본 동선은 아직 달리는 중. catGone 뒤에는 보이지 않는다", () => {
  const sudden = catSchedule(SLOT_ACTUATION.cat.sudden.timing);
  const a = evalActors(44.5, { cat: sudden }), b = evalActors(44.5, {});
  assert.equal(a.cat.visible, true); assert.equal(a.cat.facingBench, true); assert.equal(a.cat.running, false);
  assert.equal(b.cat.visible, true); assert.equal(b.cat.running, true); assert.equal(b.cat.facingBench, false);
  assert.equal(evalActors(sudden.catGone + 0.1, { cat: sudden }).cat.visible, false);
  assert.equal(evalActors(sudden.catGone + 0.1, {}).cat.visible, true, "기본 동선은 그 시각에 아직 달아나는 중");
  // 동선을 안 주면 지금까지의 /film 과 같다(cat:null == 인자 없음)
  for (let t = 42; t <= 50; t += 0.5) assert.deepEqual(evalActors(t, { cat: null }).cat, evalActors(t, {}).cat, `t=${t}`);
});

test("chooseSlotNow: runController 와 같은 후보·채널 규약 — 슬롯 시각·채널이 같고, 변형은 메뉴 안. 모르는 슬롯은 null", () => {
  const plan = runController("H", SENSITIVE).entries;
  for (const id of CONTROLLED_SLOTS) {
    const c = chooseSlotNow("H", id, 0.3, SENSITIVE);
    const e = plan.find((p) => p.slotId === id);
    assert.equal(c.t, e.t); assert.equal(c.channel, e.channel);
    assert.ok(variantOf(slotById(id), c.variantId), `${id}/${c.variantId}`);
    assert.equal(c.nth, e.nth, `${id} 채널 반복 횟수는 계획과 같아야 한다`);
  }
  assert.equal(chooseSlotNow("H", "nope", 0.3, SENSITIVE), null);
  // x0 를 계획의 시작값과 같게 주면 계획과 같은 변형이 나온다(첫 제어 슬롯 frog 는 앞 슬롯 예측이 x0)
  const cands = candidateSlots(); const idx = cands.findIndex((s) => s.id === "frog");
  assert.ok(idx > 0);
});

test("결정 시각은 슬롯의 첫 자극보다 앞이다 — 개구리는 소리 큐 전, 고양이는 동선 시작(T.catIn) 전", () => {
  assert.ok(DECIDE_AT.frog < cue("frog").t && DECIDE_AT.frog > cue("frog").t - 2);
  assert.ok(DECIDE_AT.cat < T.catIn && DECIDE_AT.cat > T.catIn - 2);
  assert.ok(DECIDE_AT.frog > T.truckEnd, "트럭(세 번째 탐침)이 지나간 뒤에 정한다");
});

test("합성 관객 용량 배율: 용량 없음 == DOSE_REF(0.8) == 배율 1, 0.4 → 0.5, 1.0 → 1.25, 범위 밖은 자른다", () => {
  assert.equal(doseFactor(null), 1); assert.equal(doseFactor(undefined), 1); assert.equal(doseFactor(DOSE_REF), 1);
  assert.equal(doseFactor(0.4), 0.5); assert.equal(doseFactor(1.0), 1.25); assert.equal(doseFactor(0.1), 0.5); assert.equal(doseFactor(5), 1.25);
  // 같은 시드·같은 사건에서 용량 0.4 는 0.9 보다 고개를 덜 돌린다; 용량을 안 준 궤적은 0.8 과 같다
  const run = (dose) => { const s = createGazeSim("fearful", { seed: 3 }); for (let i = 0; i < 60; i++) s.step(0, 1 / 60); s.trigger({ name: "frog", azimuth: 135, dur: 3, kind: "probe", channel: "audio", dose }); let peak = 0; for (let i = 0; i < 120; i++) peak = Math.max(peak, Math.abs(s.step(1, 1 / 60).yaw)); return peak; };
  assert.ok(run(0.4) < run(0.9), `0.4 → ${run(0.4)} vs 0.9 → ${run(0.9)}`);
  assert.equal(run(null), run(0.8));
});

test("B85 PROBE_DOSE: 제어 슬롯이 아닌 시각 고정 슬롯 = 탐침 3개(tensionSim N_PROBE 와 같은 경계), 값은 onCue 가 레코드에 적는 큐 볼륨", () => {
  assert.deepEqual(Object.keys(PROBE_DOSE), ["poster", "figure", "truck"]);
  assert.equal(Object.keys(PROBE_DOSE).length, SIM_PARAMS.N_PROBE);
  const fixedSlots = candidateSlots().map((s) => s.id);
  assert.deepEqual([...Object.keys(PROBE_DOSE), ...CONTROLLED_SLOTS].sort(), fixedSlots.slice().sort()); // 빠진 슬롯·겹치는 슬롯 없음
  for (const [id, d] of Object.entries(PROBE_DOSE)) assert.equal(d, cue(slotById(id).event).volume, id);
  assert.deepEqual({ ...PROBE_DOSE }, { poster: 0.7, figure: 0.55, truck: 0.9 });
});
test("B85 /film 계획(runController fixed: PROBE_DOSE)의 개구리·고양이 변형은 메뉴 안이고, 탐침 세 줄은 변형이 없다", () => {
  for (const th of [SENSITIVE, BLUNT]) {
    const r = runController("H", th, { fixed: PROBE_DOSE });
    for (const e of r.entries) {
      if (CONTROLLED_SLOTS.includes(e.slotId)) assert.ok(variantOf(slotById(e.slotId), e.variantId), `${e.slotId}/${e.variantId}`);
      else { assert.equal(e.variantId, null, e.slotId); assert.equal(e.neutral, true, e.slotId); }
    }
  }
});

// B106 — 결정 전 모니터 줄은 계획(바닥값 x0 에서 다시 세운 값)이 아니라 지금 x̂·θ̂ 으로 고른 미리보기. 결정 시각의 미리보기 == decideSlot
test("B106 previewSlotEntries: seed 1 녹화의 θ̂(g 1.156·ρ 0.171)·x̂ 0.273 — 계획은 고양이 mid 인데 지금 정하면 playful. 미리보기는 decideSlot 과 같다", () => {
  const th = { g: 1.156, L: 0.2, tau: 2.0, rho: 0.171, n: 2, nResp: 2, confidence: 0.4 };
  const plan = runController("H", th, { fixed: PROBE_DOSE }).entries;
  assert.equal(plan.find((e) => e.slotId === "cat").variantId, "mid", "재현 전제: 계획(바닥값 x0)은 mid");
  const pv = previewSlotEntries(plan, { track: "H", theta: th, xhat: 0.273 });
  for (const id of CONTROLLED_SLOTS) {
    const e = pv.find((p) => p.slotId === id), d = decideSlot({ slotId: id, controlOn: true, track: "H", theta: th, xhat: 0.273 });
    assert.equal(e.variantId, d.variantId, id); assert.equal(e.dose, d.dose, id); assert.equal(e.preview, true, id);
    assert.ok(e.reason.endsWith(d.reason), `${id}: ${e.reason}`); assert.match(e.reason, /^x̂ 0\.27 기준 · /);
    assert.equal(e.t, plan.find((p) => p.slotId === id).t, `${id} 슬롯 시각은 계획 그대로`);
  }
  assert.equal(pv.find((e) => e.slotId === "cat").variantId, "playful");
  // 결정 순간의 입력이 같으면 어떤 x̂·θ̂ 에서도 미리보기 == 결정
  for (const x of [0.05, 0.2, 0.45, 0.7]) for (const t2 of [th, SENSITIVE, BLUNT]) for (const id of CONTROLLED_SLOTS)
    assert.equal(previewSlotEntries(plan, { track: "H", theta: t2, xhat: x }).find((e) => e.slotId === id).variantId, decideSlot({ slotId: id, controlOn: true, track: "H", theta: t2, xhat: x }).variantId, `${id} x̂ ${x} g ${t2.g}`);
});
test("B106 previewSlotEntries: 확정 줄·중립 탐침 줄은 그대로, θ̂ 이 없으면 미리보기도 중립(decideSlot 과 같이), 제어 OFF 여도 권고를 보인다", () => {
  const plan = runController("H", SENSITIVE, { fixed: PROBE_DOSE }).entries;
  const withConfirmed = plan.map((e) => (e.slotId === "frog" ? { ...e, variantId: "loud", dose: 0.7, reason: "확정 · 목표 x", confirmed: true } : e));
  const pv = previewSlotEntries(withConfirmed, { track: "H", theta: SENSITIVE, xhat: 0.9 });
  assert.deepEqual(pv.find((e) => e.slotId === "frog"), withConfirmed.find((e) => e.slotId === "frog"), "확정 줄은 그대로");
  for (const id of Object.keys(PROBE_DOSE)) assert.deepEqual(pv.find((e) => e.slotId === id), plan.find((e) => e.slotId === id), `${id} 탐침 줄은 그대로`);
  assert.equal(pv.find((e) => e.slotId === "cat").preview, true);
  assert.equal(pv.length, plan.length);
  const none = previewSlotEntries(plan, { track: "H", theta: null, xhat: null });
  for (const id of CONTROLLED_SLOTS) { const e = none.find((p) => p.slotId === id); assert.equal(e.variantId, "중립"); assert.equal(e.dose, NEUTRAL_DOSE); assert.match(e.reason, /θ̂ 없음/); assert.ok(!/x̂/.test(e.reason)); }
  const zero = previewSlotEntries(plan, { track: "H", theta: { ...SENSITIVE, n: 0 }, xhat: 0.3 });
  assert.equal(zero.find((e) => e.slotId === "cat").variantId, "중립");
});

test("B92 판정 전 슬롯 결정은 배합 기대 곡선 — seed 1 공포형 입력(개구리 R44·H34, 고양이 H44·R39)에서 두 슬롯이 같은 규칙으로, 목표는 두 장르 곡선 사이", () => {
  // 검토 턴 25 재완주 세션(review25/sessions/on-seed1-…_H.json)의 결정 순간 값 — 종전엔 개구리 track R(목표 0.315)·고양이 track H(0.549)
  const th = { g: 1.156, rho: 0.172, n: 2, nResp: 2 };
  const frogMix = controlTrack({ mix: { R: 0.443, H: 0.344, C: 0.213 } });
  const catMix = controlTrack({ mix: { R: 0.388, H: 0.438, C: 0.174 } });
  const f = decideSlot({ slotId: "frog", controlOn: true, track: frogMix, theta: th, xhat: 0.333 });
  const c = decideSlot({ slotId: "cat", controlOn: true, track: catMix, theta: th, xhat: 0.273 });
  const fR = decideSlot({ slotId: "frog", controlOn: true, track: "R", theta: th, xhat: 0.333 }).target, fH = decideSlot({ slotId: "frog", controlOn: true, track: "H", theta: th, xhat: 0.333 }).target;
  const cR = decideSlot({ slotId: "cat", controlOn: true, track: "R", theta: th, xhat: 0.273 }).target, cH = decideSlot({ slotId: "cat", controlOn: true, track: "H", theta: th, xhat: 0.273 }).target;
  assert.ok(f.target > fR && f.target < fH, `개구리 목표 ${f.target} ∈ (R ${fR}, H ${fH})`);
  assert.ok(c.target > cR && c.target < cH, `고양이 목표 ${c.target} ∈ (R ${cR}, H ${cH})`);
  // 이 입력에서는 변형 자체는 종전과 같다(once·playful) — B21 녹화의 소리는 그대로 대표성이 있다
  assert.equal(f.variantId, "once"); assert.equal(c.variantId, "playful");
  // 모니터 미리보기(B106)도 배합을 받으면 결정과 같다
  const plan = runController(frogMix, th, { fixed: PROBE_DOSE }).entries;
  assert.equal(plan.length, candidateSlots().length);
  for (const e of plan) assert.ok(Number.isFinite(e.predTension) && Number.isFinite(e.target), `${e.slotId} 계획 값`);
  for (const x of [0.05, 0.333, 0.7]) for (const id of CONTROLLED_SLOTS)
    assert.equal(previewSlotEntries(plan, { track: frogMix, theta: th, xhat: x }).find((e) => e.slotId === id).variantId, decideSlot({ slotId: id, controlOn: true, track: frogMix, theta: th, xhat: x }).variantId, `${id} x̂ ${x}`);
});
test("B92 배합이 한 장르로 몰리면 그 장르 글자와 같은 결정(판정 뒤로 넘어갈 때 규칙이 이어진다)", () => {
  for (const g of ["R", "H", "C"]) for (const id of CONTROLLED_SLOTS) for (const th of [SENSITIVE, BLUNT]) for (const x of [0.1, 0.4]) {
    const a = decideSlot({ slotId: id, controlOn: true, track: controlTrack({ mix: { [g]: 1 } }), theta: th, xhat: x });
    const b = decideSlot({ slotId: id, controlOn: true, track: g, theta: th, xhat: x });
    assert.equal(a.variantId, b.variantId, `${g} ${id} g ${th.g} x ${x}`); assert.ok(Math.abs(a.target - b.target) < 1e-9);
  }
  assert.ok(Math.abs(curveAt(controlTrack({ mix: { H: 1 } }), 52).target - 0.72) < 1e-9);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
