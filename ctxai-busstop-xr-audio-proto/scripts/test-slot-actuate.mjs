// 슬롯 변형 액추에이터 회귀 테스트(B78) — 변형표 완결성·OFF=고정 연출·관객별로 다른 변형·고양이 동선·chooseSlotNow 규약
import assert from "node:assert/strict";
import { decideSlot, catSchedule, missingActuations, SLOT_ACTUATION, NEUTRAL_ACTUATION, NEUTRAL_DOSE, CONTROLLED_SLOTS, DECIDE_AT, CAT_TIMING_NEUTRAL, PROBE_DOSE } from "../lib/slotActuate.js";
import { SIM_PARAMS } from "../lib/tensionSim.js";
import { chooseSlotNow, runController, candidateSlots } from "../lib/slotController.js";
import { slotById, variantOf } from "../lib/tensionCurve.js";
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

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
