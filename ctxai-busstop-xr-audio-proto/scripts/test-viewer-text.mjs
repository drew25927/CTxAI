// 관객 결과 문장 회귀 테스트(B86·B84·B117·B121) — 종료 카드·비교 화면의 배합 줄이 판정과 모순되지 않고, 반응 지문·집중한 순간이 세 화면에서 같은 규칙으로 나온다
import assert from "node:assert/strict";
import { mixText, verdictOf, mixLines, mmss, GENRE_LABEL, fingerprintText, focusText, focusSpan, MOMENT_TEXT, MOMENT_BASIS, talkAt, sceneAt, stimulusLabel, filmTimeEvents } from "../lib/viewerText.js";

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


// ── B121 반올림 동률 — B21 OFF 카드 "로맨스 36% · 공포 36%"(실제 .359 vs .357)
test("mixText 동률(B121): 반올림해서 이웃이 같아지면 소수 한 자리로 내려 1위 근거가 보인다", () => {
  assert.equal(mixText({ R: 0.359, H: 0.357, C: 0.284 }), "로맨스 35.9% · 공포 35.7% · 블랙코미디 28.4%");
  // 한 자리로도 같으면 두 자리
  assert.equal(mixText({ R: 0.3594, H: 0.3586, C: 0.282 }), "로맨스 35.94% · 공포 35.86% · 블랙코미디 28.20%");
  // 동률이 아니면 정수 그대로(기존 회차 문구 불변)
  assert.equal(mixText({ R: 0.377, H: 0.397, C: 0.225 }), "공포 40% · 로맨스 38% · 블랙코미디 23%");
  // 2·3위 동률은 상관없다 — 드리프트가 끝난 /interim 의 100/0/0
  assert.equal(mixText({ R: 1, H: 0, C: 0 }), "로맨스 100% · 공포 0% · 블랙코미디 0%");
});

// ── B84·B108 반응 지문 — 1배속 합성 관객 세 프로필의 θ̂(b59/sessions-summary-1x.txt) + 비교 화면에서 같았던 두 관객(review16)
const THETA = {
  fearful: { g: 1.274, L: 0.168, tau: 0.438, rho: -0.004, n: 5, nResp: 5, confidence: 1 },
  curious: { g: 1.04, L: 0.218, tau: 0.693, rho: 0.098, n: 5, nResp: 5, confidence: 1 },
  calm: { g: 0.6, L: 0.217, tau: 1, rho: 0.15, n: 5, nResp: 2, confidence: 0.2 },
};
test("fingerprintText: 세 프로필이 서로 다른 문장을 받는다", () => {
  const out = Object.fromEntries(Object.entries(THETA).map(([k, th]) => [k, fingerprintText(th)]));
  assert.equal(out.fearful, "자극마다 크게 흔들렸고, 빠르게 반응하고 금방 가라앉았으며 반복돼도 반응이 유지됐습니다");
  assert.equal(out.curious, "자극에 또렷이 흔들렸고, 빠르게 반응하고 금방 가라앉았으며 반복돼도 반응이 유지됐습니다");
  assert.equal(out.calm, "자극에 살짝 흔들렸고, 빠르게 반응하고 금방 가라앉았으며 반복돼도 반응이 유지됐습니다");
  assert.equal(new Set(Object.values(out)).size, 3);
});
test("fingerprintText(B84): 비교 화면에서 같은 문장이던 공포형(g 1.287)·차분형(g 0.208)이 갈린다", () => {
  const a = fingerprintText({ g: 1.287, L: 0.15, tau: 0.8, rho: 0.0, n: 9, nResp: 9 });
  const b = fingerprintText({ g: 0.208, L: 0.3, tau: 0.9, rho: 0.1, n: 9, nResp: 3 });
  assert.notEqual(a, b);
  assert.match(a, /^자극마다 크게 흔들렸고/);
  assert.match(b, /^전반적으로 차분했고/);
});
test("fingerprintText: 응답 0·1건도 문장이 나온다(null 아님) — 지문 대신 사실을 적는다", () => {
  assert.equal(fingerprintText({ g: 0, L: 0, tau: 0, rho: 0, n: 5, nResp: 0 }), "사건 5개에 고개를 돌린 기록이 없어 반응 지문을 만들지 못했습니다");
  assert.equal(fingerprintText({ g: 0.5, L: 0.2, tau: 1, rho: 0, n: 5, nResp: 1 }), "사건 5개 중 한 번만 반응해 반응 지문을 쓰기에는 이릅니다");
  assert.equal(fingerprintText({ g: 0, L: 0, tau: 0, rho: 0, n: 0, nResp: 0 }), "기록된 사건이 없어 반응 지문을 만들지 못했습니다");
  assert.equal(fingerprintText(null), null);
});
test("fingerprintText: 지연·회복·습관화 구절도 임계값으로 갈린다", () => {
  const slow = fingerprintText({ g: 1.0, L: 0.9, tau: 3, rho: 0.4, n: 5, nResp: 5 });
  assert.equal(slow, "자극에 또렷이 흔들렸고, 한 박자 늦게 반응하고 여운이 오래 남았으며 반복될수록 반응이 눈에 띄게 줄었습니다");
});

// ── B117 집중한 순간 — review25 세션(1배속)의 모양: topSegments[0] t0 148.5 (near null) 은 대사 13 과 버스 장면 사이
const FILM_EVENTS = [
  { t: 0, kind: "event", name: "phase", detail: "intro" },
  { t: 43.6, kind: "event", name: "cue", detail: "cat" },
  { t: 58, kind: "event", name: "phase", detail: "judged" },
  { t: 69, kind: "event", name: "phase", detail: "scene" },
  { t: 100.3, kind: "event", name: "talk", detail: { seq: "05", from: 98.4 } },
  { t: 143.1, kind: "event", name: "talk", detail: { seq: "13", from: 141.6 } },
  { t: 147.6, kind: "event", name: "phase", detail: "bus" },
  { t: 156, kind: "event", name: "talk", detail: { seq: "14", from: 154.9 } },
  { t: 170.8, kind: "event", name: "phase", detail: "end" },
];
test("focusText: near 가 있으면 사건 이름 + m:ss", () => {
  assert.equal(focusText({ topSegments: [{ t0: 44.5, t1: 46.5, score: 0.9, near: { name: "cat", onset: 43.6 } }] }, { events: FILM_EVENTS }), "고양이 (0:44)");
  assert.equal(stimulusLabel("micro-2"), "먼 문 소리");
  assert.equal(stimulusLabel("figureApproach"), "우비 인물");
});
test("focusText(B117): near 가 없으면 그 시각에 걸친 대사 줄 — 초 단위 '170초 무렵' 이 아니라 m:ss", () => {
  assert.equal(focusText({ topSegments: [{ t0: 99, t1: 101, score: 0.9, near: null }] }, { events: FILM_EVENTS }), "대사 05 무렵 (1:39)");
  // 창이 안 겹쳐도 3초 안이면 가장 가까운 줄
  assert.equal(focusText({ topSegments: [{ t0: 144, t1: 146, score: 0.9, near: null }] }, { events: FILM_EVENTS }), "대사 13 무렵 (2:24)");
});
test("focusSpan(B144): 가장 차분히 집중한 구간을 영화 시간으로 — 배속이면 × speed, 없으면 null", () => {
  assert.deepEqual(focusSpan({ topSegments: [{ t0: 44.5, t1: 46.5, score: 0.9, near: { name: "cat" } }] }), { t0: 44.5, t1: 46.5, near: "cat" });
  assert.deepEqual(focusSpan({ topSegments: [{ t0: 10, t1: 12, score: 0.9, near: null }] }, 4), { t0: 40, t1: 48, near: null });
  assert.equal(focusSpan({ topSegments: [] }), null);
  assert.equal(focusSpan(null), null);
});

test("MOMENT_TEXT(B128·B144): 세 기준의 이름 — 옛 '본 것'·'가장 집중'·'x̂ 최고' 를 쓰지 않고 기준을 밝힌다", () => {
  assert.equal(MOMENT_TEXT.peak, "가장 크게 반응한 순간");
  assert.equal(MOMENT_TEXT.calm, "가장 차분히 집중한 순간");
  assert.equal(MOMENT_TEXT.turned, "돌아본 사건");
  assert.equal(MOMENT_TEXT.flinched, "움찔만 한 사건");
  const all = [...Object.values(MOMENT_TEXT), ...MOMENT_BASIS].join(" | ");
  assert.ok(!/본 것|x̂ 최고 \d/.test(all), all);
  assert.ok(MOMENT_BASIS.some((b) => b.includes("±28°")) && MOMENT_BASIS.some((b) => b.includes("x̂")) && MOMENT_BASIS.some((b) => b.includes("집중도")));
});

test("focusText: 대사도 없으면 장면 이름(버스 장면), 그것도 없으면 'm:ss 무렵'", () => {
  assert.equal(focusText({ topSegments: [{ t0: 162.7, t1: 164.7, score: 0.87, near: null }] }, { events: FILM_EVENTS }), "버스 장면 (2:42)");
  assert.equal(focusText({ topSegments: [{ t0: 148.5, t1: 154.5, score: 0.88, near: null }] }, { events: [] }), "2:28 무렵");
  assert.equal(focusText({ topSegments: [] }, {}), null);
  assert.equal(focusText(null), null);
});
test("focusText: 배속 회차는 센서 시각(실제 초)에 speed 를 곱해 영화 시간으로 맞춘다", () => {
  // 4배속에서 실제 24.75초 = 영화 1:39 → 대사 05
  assert.equal(focusText({ topSegments: [{ t0: 24.75, t1: 25.25, score: 0.9, near: null }] }, { events: FILM_EVENTS, speed: 4 }), "대사 05 무렵 (1:39)");
});
test("filmTimeEvents: /film 4배속 세션(이벤트 t 실제 초, talk.from 영화 초)을 영화 시간으로 — 1배속은 그대로", () => {
  // b14a/sessions 4배속 공포형: phase bus 68.3(실제) · talk 01 from 71.1(영화) → t 21.6(실제)
  const ev4 = [{ t: 17.3, kind: "event", name: "phase", detail: "scene" }, { t: 21.6, kind: "event", name: "talk", detail: { seq: "01", from: 71.1 } }, { t: 68.3, kind: "event", name: "phase", detail: "bus" }];
  const ev = filmTimeEvents(ev4, 4);
  assert.equal(ev[0].t, 69.2);
  assert.equal(ev[1].t, 86.4); assert.equal(ev[1].detail.from, 71.1);
  assert.equal(focusText({ topSegments: [{ t0: 19, t1: 21, near: null }] }, { events: ev, speed: 4 }), "대사 01 무렵 (1:16)");
  assert.equal(focusText({ topSegments: [{ t0: 68.7, t1: 74.7, near: null }] }, { events: ev, speed: 4 }), "버스 장면 (4:34)");
  assert.strictEqual(filmTimeEvents(ev4, 1), ev4);
});
test("focusText(/interim): cue 이벤트(judge·greeting)로 장면을 찾는다 — 팀 페이지의 events 모양 {t,name,detail}", () => {
  const ev = [{ t: 15, name: "cue", detail: "figureApproach" }, { t: 115, name: "cue", detail: "judge" }, { t: 125, name: "cue", detail: "greeting" }];
  assert.equal(sceneAt(ev, 118), "판정 직후");
  assert.equal(focusText({ topSegments: [{ t0: 126, t1: 128, near: null }] }, { events: ev }), "인사 장면 (2:06)");
  assert.equal(talkAt(ev, 126), null);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
