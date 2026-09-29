// 관객 결과 문장 회귀 테스트(B86) — 종료 카드·비교 화면의 배합 줄이 판정과 모순되지 않는다
import assert from "node:assert/strict";
import { mixText, verdictOf, mixLines, mmss, GENRE_LABEL } from "../lib/viewerText.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

// 검토 턴 16 세션(review16/2026-09-29T15-35-40-982Z_H.json)의 모양: 판정 0:58 에 H 42 : R 35, 끝에는 R 42 : H 37.
const JUDGE_MIX = { R: 0.35, H: 0.42, C: 0.23 };
const END_MIX = { R: 0.4186, H: 0.3674, C: 0.214 };
const traj = [
  { t: 0, R: 0.333, H: 0.333, C: 0.333, settled: 0, confidence: 0 },
  { t: 57.5, R: 0.36, H: 0.41, C: 0.23, settled: 0.9, confidence: 0.02 },
  { t: 58, ...JUDGE_MIX, settled: 0.9, confidence: 0.03 },
  { t: 58.5, R: 0.351, H: 0.419, C: 0.23, settled: 0.9, confidence: 0.03 },
  { t: 176.9, ...END_MIX, settled: 1, confidence: 0.033 },
];
const events = [
  { t: 0, kind: "event", name: "phase", detail: "intro" },
  { t: 58, kind: "event", name: "cue", detail: "judge" },
  { t: 58, kind: "event", name: "phase", detail: "judged" },
];
const OLD = { dominant: "H", final: { current: END_MIX, dominant: "R" }, trajectory: traj, events };

test("mixText: 큰 순서로 정렬하고 반올림한 백분율", () => {
  assert.equal(mixText(JUDGE_MIX), "공포 42% · 로맨스 35% · 블랙코미디 23%");
  assert.equal(mixText(END_MIX), "로맨스 42% · 공포 37% · 블랙코미디 21%");
  assert.equal(mixText(null), "");
});

test("mmss: 58 → 0:58, 125.7 → 2:05", () => {
  assert.equal(mmss(58), "0:58");
  assert.equal(mmss(125.7), "2:05");
  assert.equal(mmss(null), "0:00");
});

test("verdictOf: B86 이전 세션은 judge 큐 시각의 trajectory 표본(그 시각 이하 중 마지막)으로 판정 배합을 되살린다", () => {
  const v = verdictOf(OLD);
  assert.equal(v.source, "trajectory");
  assert.equal(v.dominant, "H");
  assert.equal(v.t, 58);
  assert.deepEqual(v.mix, JUDGE_MIX);
});

test("verdictOf: 저장된 verdict 가 있으면 그것을 쓴다", () => {
  const v = verdictOf({ ...OLD, verdict: { dominant: "H", mix: { R: 0.3, H: 0.5, C: 0.2 }, t: 58.2, confidence: 0.05 } });
  assert.equal(v.source, "saved");
  assert.equal(v.mix.H, 0.5);
  assert.equal(v.t, 58.2);
});

test("verdictOf: 판정 전에 끝난 세션(judge 큐 없음)은 null", () => {
  assert.equal(verdictOf({ ...OLD, events: events.filter((e) => e.detail !== "judge") }), null);
  assert.equal(verdictOf(null), null);
});

test("mixLines: 판정 뒤 1위가 바뀐 세션 — 주 문장은 판정 배합(1위 = 옆에 앉은 사람), 끝 배합은 '판정 뒤 흐름' 으로 따로", () => {
  const L = mixLines({ verdict: verdictOf(OLD), final: OLD.final });
  assert.equal(L.main, "판정(0:58) 공포 42% · 로맨스 35% · 블랙코미디 23%");
  assert.equal(L.drifted, true);
  assert.equal(L.after, "판정 뒤 반응은 로맨스 쪽으로 기울었습니다 (끝 배합 로맨스 42% · 공포 37% · 블랙코미디 21%)");
});

test("mixLines 모순 없음(B86 핵심): 주 문장에서 가장 앞선 장르 = 옆에 앉은 사람", () => {
  // 판정 뒤 흐름이 어느 쪽이든, 주 문장의 첫 장르 이름은 dominant 의 이름이다.
  for (const fin of [END_MIX, JUDGE_MIX, { R: 0.1, H: 0.2, C: 0.7 }]) {
    const L = mixLines({ verdict: verdictOf(OLD), final: { current: fin } });
    const first = L.main.replace(/^판정\([^)]*\) /, "").split(" ")[0];
    assert.equal(first, GENRE_LABEL[OLD.dominant], L.main);
  }
});

test("mixLines: 판정과 끝의 1위가 같으면 '기울었습니다' 없이 끝 배합만", () => {
  const L = mixLines({ verdict: verdictOf(OLD), final: { current: { R: 0.3, H: 0.5, C: 0.2 } } });
  assert.equal(L.drifted, false);
  assert.equal(L.after, "끝 배합 공포 50% · 로맨스 30% · 블랙코미디 20%");
});

test("mixLines: 판정이 없으면 끝 배합을 주 문장으로, after 없음", () => {
  const L = mixLines({ verdict: null, final: { current: END_MIX } });
  assert.equal(L.main, "끝 배합 로맨스 42% · 공포 37% · 블랙코미디 21%");
  assert.equal(L.after, null);
  assert.equal(mixLines({ verdict: null, final: null }).main, "");
});

test("mixLines: final 에 current 가 아닌 배합 객체를 바로 줘도 된다(페이지의 snap.current)", () => {
  const a = mixLines({ verdict: verdictOf(OLD), final: END_MIX });
  const b = mixLines({ verdict: verdictOf(OLD), final: { current: END_MIX } });
  assert.deepEqual(a, b);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
