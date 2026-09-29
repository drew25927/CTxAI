// 연출 엔진 회귀 테스트 — 외부 의존 없이 node 로 바로 돈다: node scripts/test-direction.mjs
// 매핑표·상태 저장소·풀 선택 규칙이 문서(반응형_실시간_영화.md §3·§4)와 어긋나면 여기서 잡힌다.

import assert from "node:assert/strict";
import { createDirectionState, entropyConfidence, rank } from "../lib/directionState.js";
import { ANCHORS, TRIGGERS, deriveParams, deriveBgmGains } from "../lib/directionMap.js";
import { pickPoolLine, TINT_THRESHOLD } from "../lib/dialoguePool.js";
import { evalActors, T } from "../lib/filmTimeline.js";
import { DIALOGUE_V2_LINES } from "../lib/dialogueV2Lines.js";
import { DIALOGUE_V2_BEATS, beatOf, playsLine, playedCount, gazeFor, nextPlayedBeat, subtitleHoldSec, splitLead, SUBTITLE_TIMING, silenceAfter, dialogueQuiet, quietState, QUIET_NEED_SEC, answerWatchStart, answerWatchUpdate, answerWatchResult } from "../lib/dialogueBeats.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("순수 벡터 + settled 1 이면 매핑표 앵커값 그대로", () => {
  for (const g of ["R", "H", "C"]) {
    const p = deriveParams({ R: g === "R" ? 1 : 0, H: g === "H" ? 1 : 0, C: g === "C" ? 1 : 0 }, 1);
    assert.ok(close(p.npcDistance, ANCHORS[g].npcDistance), `${g} npcDistance`);
    assert.ok(close(p.fogDensity, ANCHORS[g].fogDensity), `${g} fogDensity`);
  }
});

test("settled 0 이면 어떤 벡터든 중립 앵커", () => {
  const p = deriveParams({ R: 0, H: 1, C: 0 }, 0);
  assert.ok(close(p.npcDistance, ANCHORS.neutral.npcDistance));
  assert.ok(close(p.lampOn, ANCHORS.neutral.lampOn));
  assert.equal(p.triggers.lampEarlyOn, false);
});

test("사건 트리거 — 공포 42% 이상이면 가로등이 켜지고, 코미디 45% 이상이면 그림자 0", () => {
  const h = deriveParams({ R: 0.5, H: 0.45, C: 0.05 }, 1);
  assert.equal(h.triggers.lampEarlyOn, true); assert.ok(close(h.lampOn, 1));
  const c = deriveParams({ R: 0.5, H: 0.02, C: 0.48 }, 1);
  assert.equal(c.triggers.flatLight, true); assert.equal(c.shadow, 0);
  const under = deriveParams({ R: 0.6, H: 0.4, C: 0 }, 1);
  assert.equal(under.triggers.lampEarlyOn, false);
});

test("BGM 게인 — 상위 2개만, settled 0 이면 셋이 고르게", () => {
  const even = deriveBgmGains({ R: 0.6, H: 0.3, C: 0.1 }, 0);
  assert.ok(close(even.R, even.H) && close(even.H, even.C));
  const top2 = deriveBgmGains({ R: 0.6, H: 0.3, C: 0.1 }, 1);
  assert.ok(close(top2.C, 0)); assert.ok(top2.R > top2.H && top2.H > 0);
});

test("상태 저장소 — 증거가 쌓이면 target 이 기울고 current 는 완만히 따라간다", () => {
  const d = createDirectionState({ followRate: 0.6, settleMass: 2 });
  d.pushEvidence({ R: 0, H: 1, C: 0 }, 1, "test");
  // 균등 사전분포(0.8)가 깔려 있어 증거 1.0 으로는 약 0.7 — 한 방에 100% 가 되면 안 된다
  assert.ok(d.st.target.H > 0.6 && d.st.target.H < 0.8, `target.H=${d.st.target.H}`);
  d.tick(0.1);
  assert.ok(d.st.current.H < 0.5, "한 프레임에 다 따라가면 떨림 방지가 없는 것");
  for (let i = 0; i < 100; i++) d.tick(0.1);
  assert.ok(d.st.current.H > 0.6); assert.ok(d.st.settled > 0.45 && d.st.settled < 0.6, `settled=${d.st.settled}`);
  assert.equal(rank(d.st.current).dominant, "H");
  assert.ok(d.st.trajectory.length >= 15);
});

test("확신도 — 균등 0, 순수 1", () => {
  assert.ok(close(entropyConfidence({ R: 1 / 3, H: 1 / 3, C: 1 / 3 }), 0, 1e-9));
  assert.ok(close(entropyConfidence({ R: 1, H: 0, C: 0 }), 1));
});

test("풀 선택 — 보조 장르 비중이 임계값 이상이면 그 변주, 아니면 원문", () => {
  const pool = { ok: true, lines: [
    { genre: "H", seq: "01", secondary: "base", text: "b", file: "H_base_01.m4a" },
    { genre: "H", seq: "01", secondary: "R", text: "r", file: "H_R_01.m4a" },
  ] };
  assert.equal(pickPoolLine(pool, "H", "01", { R: TINT_THRESHOLD + 0.01, H: 0.6, C: 0.09 }).secondary, "R");
  assert.equal(pickPoolLine(pool, "H", "01", { R: 0.2, H: 0.7, C: 0.1 }).secondary, null);
  assert.equal(pickPoolLine(pool, "H", "01", { R: 0.1, H: 0.5, C: 0.4 }).secondary, null, "C 변주가 없으면 원문");
});

test("타임라인 — 판정 전엔 옆사람이 없고, 착석 뒤 거리는 상태값을 따른다", () => {
  assert.equal(evalActors(T.judge - 1, { dominant: null }).npc.visible, false);
  const seated = evalActors(T.npcSeated + 1, { dominant: "H", npcDistance: 1.35 });
  assert.equal(seated.npc.seated, true); assert.ok(close(seated.npc.x, 0.35 + 1.35));
  const truck = evalActors(T.truckSplash, { dominant: null });
  assert.equal(truck.truck.visible, true); assert.ok(truck.splash != null);
});

test("타임라인 — 옆사람은 관객 코앞(0.9m 안)으로 들어오지 않고, 버스 문 앞으로 걸어간다", () => {
  for (let t = T.npcWalkStart; t <= T.npcSeated; t += 0.25) {
    const { npc } = evalActors(t, { dominant: "R", npcDistance: 0.7 });
    const d = Math.hypot(npc.x, npc.z - 0.35);
    assert.ok(d >= 0.9, `t=${t} 관객과 ${d.toFixed(2)}m`);
  }
  const busAt = 100;
  const stop = evalActors(busAt + 7.5, { dominant: "R", npcDistance: 0.7, busAt });
  assert.ok(close(stop.bus.x, -1.2, 0.05) && stop.bus.doorOpen, "정차 위치·문 열림");
  const gone = evalActors(busAt + 13.9, { dominant: "R", npcDistance: 0.7, busAt });
  assert.ok(close(gone.npc.x, 1.2, 0.1) && gone.npc.z < -2.5, `문 앞(1.2,-2.7)으로: ${gone.npc.x.toFixed(2)},${gone.npc.z.toFixed(2)}`);
  const h = evalActors(busAt + 13.9, { dominant: "H", npcDistance: 1.2, busAt });
  assert.ok(h.npc.z > 3, "공포는 벤치 뒤 풀숲으로");
});

test("대사 비트 — 모든 비트가 CSV 줄을 가리키고, 46줄 전부 비트가 있다", () => {
  const ids = new Set(DIALOGUE_V2_LINES.map((l) => `${l.genre}.${l.seq}`));
  for (const k of Object.keys(DIALOGUE_V2_BEATS)) assert.ok(ids.has(k), `없는 줄 ${k}`);
  for (const id of ids) assert.ok(DIALOGUE_V2_BEATS[id], `비트 없음 ${id}`);
});

test("대사 비트 — 답함/안답함 쌍은 한 회차에 하나만 재생되고, 마지막 말은 장르마다 하나이며 버스 뒤", () => {
  for (const g of ["R", "H", "C"]) {
    const lines = DIALOGUE_V2_LINES.filter((l) => l.genre === g);
    for (const answered of [false, true]) {
      const played = lines.filter((l) => playsLine(beatOf(l), answered));
      assert.equal(played.length, playedCount(lines), `${g} answered=${answered} 재생 수`);
      const branches = played.filter((l) => beatOf(l).branch).map((l) => beatOf(l).branch);
      assert.ok(branches.every((b) => b === (answered ? "answered" : "silent")), `${g} 갈래 혼합`);
      // 마지막 말(atBus)의 표시 번호 == 전체 — 자막이 "13 / 13줄" 로 끝난다. 갈래를 둘 다 세면 12/13 에서 끝난다 (B91)
      const lastIdx = played.findIndex((l) => beatOf(l).atBus);
      assert.equal(lastIdx + 1, playedCount(lines), `${g} answered=${answered} 마지막 말 번호 ${lastIdx + 1} ≠ 전체 ${playedCount(lines)}`);
      assert.equal(lastIdx, played.length - 1, `${g} answered=${answered} 마지막 말 뒤에 줄이 더 있다`);
    }
    // 갈래 줄 바로 앞에는 질문(ask)이 있다
    lines.forEach((l, i) => { const b = beatOf(l); if (b.branch === "answered") assert.equal(beatOf(lines[i - 1]).to, "ask", `${g}.${l.seq} 앞이 질문이 아님`); });
    const last = lines.filter((l) => beatOf(l).atBus);
    assert.equal(last.length, 1, `${g} atBus 수`);
    assert.equal(last[0], lines[lines.length - 1], `${g} atBus 가 마지막 줄이 아님`);
  }
  assert.ok(gazeFor({ to: "self" }) < 0.2 && gazeFor({ to: "ask" }) > 0.9 && close(gazeFor({ to: "ask", gaze: 0.1 }), 0.1));
});

test("비언어 응답 — 가만히 있으면 무응답, 끄덕임·돌림·가로젓기는 응답. 자동 시선(고정값)은 응답이 아니다", () => {
  const still = answerWatchStart(70, -5, 77); for (let i = 0; i < 60; i++) answerWatchUpdate(still, 70 + Math.sin(i) * 1.5, -5 + Math.cos(i), 77);
  assert.equal(answerWatchResult(still).answered, false);
  const nod = answerWatchStart(70, -5, 77); for (const p of [-5, -8, -12, -14, -10, -6, -4]) answerWatchUpdate(nod, 70, p);
  assert.deepEqual(answerWatchResult(nod), { answered: true, how: "nod" });
  const turn = answerWatchStart(0, 0, 77); for (const y of [10, 25, 40, 55, 65, 72]) answerWatchUpdate(turn, y, 0);
  assert.deepEqual(answerWatchResult(turn), { answered: true, how: "turn" });
  const shake = answerWatchStart(70, 0, 77); for (const y of [76, 82, 74, 64, 70, 78]) answerWatchUpdate(shake, y, 0);
  assert.deepEqual(answerWatchResult(shake), { answered: true, how: "shake" });
  const away = answerWatchStart(0, 0, 77); for (const y of [-10, -20, -5, 5]) answerWatchUpdate(away, y, 0); // 인물 반대쪽에서 두리번 — 응답 아님
  assert.equal(answerWatchResult(away).answered, false);
});

test("B118 자막 유지 — 말이 끝난 뒤 읽을 시간만큼(최소 0.7·최대 2초), 이미 오래 떠 있었으면 최소만", () => {
  const T = SUBTITLE_TIMING;
  assert.equal(subtitleHoldSec("먼저 가세요.", 1.0), T.holdMin);                  // 6자 · 1초 말함 → 0.5 필요 < 최소
  assert.ok(close(subtitleHoldSec("가".repeat(24), 0.5), 1.5), "24자 = 2초 필요, 0.5초 떠 있었으면 1.5초 더");
  assert.equal(subtitleHoldSec("가".repeat(60), 0), T.holdMax);                  // 긴 줄도 2초 상한
  assert.equal(subtitleHoldSec("가 나 다 라 마 바 사 아 자 차 카 타", 0), 1.0);   // 공백은 세지 않는다(12자)
  assert.equal(subtitleHoldSec("질문입니다", 5.5), T.holdMin);                   // 질문 기다림까지 떠 있던 줄
  assert.equal(subtitleHoldSec(null, NaN), T.holdMin);
  // 모든 대사 줄에서 범위 안
  for (const l of DIALOGUE_V2_LINES) { const h = subtitleHoldSec(l.text, 0); assert.ok(h >= T.holdMin && h <= T.holdMax, `${l.genre}.${l.seq} ${h}`); }
});

test("B118 줄 앞 기다림 나누기 — 끝의 lookLead 초만 화자 쪽, 합은 그대로, 짧으면 전부", () => {
  const L = SUBTITLE_TIMING.lookLead;
  const [a, b] = splitLead(2.0); assert.ok(close(a + b, 2.0) && close(b, L), `${a}+${b}`);
  assert.deepEqual(splitLead(0.3), [0, 0.3]);
  assert.deepEqual(splitLead(0), [0, 0]);
  assert.deepEqual(splitLead(-1), [0, 0]);
  assert.deepEqual(splitLead(1.5, 0), [1.5, 0]);
});

test("B118 다음에 재생될 줄 — 갈래가 안 맞는 줄은 건너뛰고, 마지막 줄 뒤는 null", () => {
  const H = DIALOGUE_V2_LINES.filter((l) => l.genre === "H");
  const i06 = H.findIndex((l) => l.seq === "06");
  assert.equal(nextPlayedBeat(H, i06, false), beatOf(H.find((l) => l.seq === "08")), "무응답이면 07(answered) 을 건너뛰고 08");
  assert.equal(nextPlayedBeat(H, i06, true), beatOf(H.find((l) => l.seq === "07")));
  assert.equal(nextPlayedBeat(H, H.length - 1, false), null);
  assert.equal(nextPlayedBeat(H, H.length - 2, false).atBus, true);
});

test("B118 대사를 밟지 않는다 — 줄 뒤 조용한 시간과 연출 소리 허용 창", () => {
  const L = SUBTITLE_TIMING.lookLead;
  const H = DIALOGUE_V2_LINES.filter((l) => l.genre === "H");
  const bOf = (seq) => beatOf(H.find((l) => l.seq === seq));
  // H-05(after 8) → H-06(before 없음): 8 + 침묵 1.2 − lead
  assert.ok(close(silenceAfter(bOf("05"), bOf("06"), 1.2), 8 + 1.2 - L));
  // H-04(쉼 없음) → H-05(before 없음): 줄 사이 침묵 1.3 − lead = 0.7 — 연출 소리 금지
  assert.ok(close(silenceAfter(bOf("04"), bOf("05"), 1.3), 1.3 - L));
  // H-11 → H-12(before 3): 침묵 + 3 − lead
  assert.ok(close(silenceAfter(bOf("11"), bOf("12"), 1.2), 1.2 + 3 - L));
  // 버스 앞 줄 H-13(after 3) → H-14(atBus): after + 침묵 + 도착 7.2 − lead
  assert.ok(close(silenceAfter(bOf("13"), bOf("14"), 1.2), 3 + 1.2 + 7.2 - L));
  // 마지막 말 뒤(다음 없음, atBus 는 침묵 없음)
  assert.equal(silenceAfter(bOf("14"), null, 1.2), 0);
  // 장면 첫 줄 앞: H-01 before 2 − lead
  assert.ok(close(silenceAfter(null, nextPlayedBeat(H, -1, false), 0), 2 - L));
  // 허용 창
  const q = { talking: false, lookAhead: false, lookUntil: 10, quietUntil: 20 };
  assert.equal(dialogueQuiet(q, 9.9), false, "자막이 남아 있으면 금지");
  assert.equal(dialogueQuiet(q, 12), true);
  assert.equal(dialogueQuiet(q, 20 - QUIET_NEED_SEC + 0.01), false, "다음 줄까지 3초가 안 남으면 금지");
  assert.equal(dialogueQuiet({ ...q, talking: true }, 12), false, "말하는 중(질문 기다림 포함)");
  assert.equal(dialogueQuiet({ ...q, lookAhead: true }, 12), false, "다음 줄 보러 도는 중");
  assert.equal(dialogueQuiet({ talking: false, lookAhead: false, lookUntil: -1, quietUntil: Infinity }, 68), true, "대사 장면 밖(판정 직후 등)은 허용");
  assert.equal(dialogueQuiet(null, 0), true);
});

test("quietState: 사유판은 dialogueQuiet 와 같은 판정이고, 조용하지 않으면 왜인지 적는다 (B138)", () => {
  const q = { talking: false, lookAhead: false, lookUntil: 10, quietUntil: 20 };
  // 같은 판정 — 상태 네 가지 × 시각 격자
  const states = [q, { ...q, talking: true }, { ...q, talking: true, listen: true }, { ...q, lookAhead: true }, { talking: false, lookAhead: false, lookUntil: -1, quietUntil: Infinity }, null];
  for (const s of states) for (let t = 8; t <= 21; t += 0.25) assert.equal(quietState(s, t).quiet, dialogueQuiet(s, t), `${JSON.stringify(s)} t=${t}`);
  // 사유 — 질문 기다림 > 말하는 중 > 다음 줄 직전 > 자막 > 짧은 틈
  const w = (s, t) => { const r = quietState(s, t); return [r.why, r.label]; };
  assert.deepEqual(w({ ...q, talking: true, listen: true }, 12), ["ask", "질문 뒤 응답 대기 중"]);
  assert.deepEqual(w({ ...q, talking: true }, 12), ["talk", "대사 중"]);
  assert.deepEqual(w({ ...q, lookAhead: true }, 12), ["look", "다음 줄 직전"]);
  assert.deepEqual(w(q, 9.5), ["sub", "자막 표시 중"]);
  assert.ok(Math.abs(quietState(q, 9.5).left - 0.5) < 1e-9);
  assert.deepEqual(w(q, 18.8), ["gap", "다음 줄까지 1.2s"]);
  assert.deepEqual(w(q, 12), [null, ""]);
  assert.equal(quietState(q, 12).need, QUIET_NEED_SEC);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
