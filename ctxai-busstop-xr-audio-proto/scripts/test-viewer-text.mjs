// 관객 결과 문장 회귀 테스트(B86·B84·B117·B121) — 종료 카드·비교 화면의 배합 줄이 판정과 모순되지 않고, 반응 지문·집중한 순간이 세 화면에서 같은 규칙으로 나온다
import assert from "node:assert/strict";
import { mixText, verdictOf, mixLines, mmss, GENRE_LABEL, fingerprintText, focusText, focusSpan, MOMENT_TEXT, MOMENT_BASIS, talkAt, sceneAt, stimulusLabel, filmTimeEvents, prevStimulus, lookKind, LOOK_KIND_SHORT, hudEventText, HUD_LOOK_BASIS, RESPONSE_BASIS } from "../lib/viewerText.js";

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

// ── B84·B108·B224 반응 지문 — B152 뒤 1배속 합성 관객 세 프로필의 θ̂(/interim · 공포형 b152/sessions/fearful-on-* · 호기심형 b224/sessions/curious-* ·
//    차분형 b170b/sessions/calm-on-*) + 비교 화면에서 같았던 두 관객(review16). B152 전 값(공포형 1.274 · 호기심형 1.04 · 차분형 0.6)은 부풀어 있었다.
const THETA = {
  fearful: { g: 1.006, L: 0.15, tau: 0.52, rho: 0.084, n: 5, nResp: 5, levels: 3, confidence: 1 },
  curious: { g: 0.888, L: 0.17, tau: 0.727, rho: 0.116, n: 5, nResp: 5, levels: 3, confidence: 1 },
  calm: { g: 0.386, L: 0.355, tau: 1, rho: 0.15, n: 5, nResp: 1, levels: 1, confidence: 0.1 },
};
test("fingerprintText(B224): 공포형·호기심형은 같은 '또렷이' 문장, 차분형(응답 1/5)은 반응 수만 — 지문은 둘로 갈린다", () => {
  const out = Object.fromEntries(Object.entries(THETA).map(([k, th]) => [k, fingerprintText(th)]));
  assert.equal(out.fearful, "자극에 또렷이 흔들렸고, 빠르게 반응하고 금방 가라앉았으며 반복돼도 반응이 유지됐습니다");
  // 호기심형은 B152 뒤 θ̂ 가 공포형과 가깝다(g 0.89 vs 1.0 · L·τ·ρ 같은 단) — 같은 문장이 맞고, 둘은 카드의 "돌아본·움찔만" 줄과 팀 판정으로 갈린다
  assert.equal(out.curious, out.fearful);
  // 차분형은 응답 1/5 · 신뢰도 0.1 · θ̂ 사전값 — 성향 문장이 아니라 반응 수만(B147)
  assert.equal(out.calm, "사건 5개 중 한 번만 반응해 반응 지문을 쓰기에는 이릅니다");
  assert.equal(new Set(Object.values(out)).size, 2);
});
test("fingerprintText(B224): 같은 합성 공포형 seed 1 의 /film 제어 ON(g 0.980)·OFF(g 0.895)가 같은 이득 구절을 받는다(b152/sessions/)", () => {
  const on = fingerprintText({ g: 0.98, L: 0.165, tau: 0.859, rho: -0.03, n: 9, nResp: 9, levels: 9, confidence: 1 });
  const off = fingerprintText({ g: 0.895, L: 0.164, tau: 0.865, rho: -0.02, n: 6, nResp: 6, levels: 6, confidence: 1 });
  assert.equal(on, off);
  assert.match(on, /^자극에 또렷이 흔들렸고/);
  // 문턱 0.8 의 여유 — 실측 묶음(0.888~1.007) 아래 0.088, 그 아래는 "살짝"
  assert.match(fingerprintText({ g: 0.8, L: 0.2, tau: 1, rho: 0, n: 5, nResp: 5, levels: 3, confidence: 1 }), /^자극에 또렷이/);
  assert.match(fingerprintText({ g: 0.79, L: 0.2, tau: 1, rho: 0, n: 5, nResp: 5, levels: 3, confidence: 1 }), /^자극에 살짝/);
});
test("fingerprintText(B147): 신뢰도 0.1·사전값 θ̂(응답 1건) 에는 습관화·회복 같은 성향 구절이 없다", () => {
  const fp = fingerprintText(THETA.calm);
  assert.doesNotMatch(fp, /반복|유지|줄었|가라앉|여운|흔들/);
  assert.match(fp, /5개 중 한 번만/);
});
test("fingerprintText(B147): 습관화 구절은 반응이 두 가지 이상의 반복 횟수(nth)에 걸쳤을 때만", () => {
  // levels 1 — ρ 는 사전값이므로 습관화를 말하지 않고 회복 구절로 문장을 닫는다
  assert.equal(fingerprintText({ g: 1.0, L: 0.2, tau: 1, rho: 0.15, n: 5, nResp: 3, levels: 1, confidence: 0.3 }), "자극에 또렷이 흔들렸고, 빠르게 반응하고 금방 가라앉았습니다");
  assert.equal(fingerprintText({ g: 1.0, L: 0.2, tau: 3, rho: 0.15, n: 5, nResp: 3, levels: 1, confidence: 0.3 }), "자극에 또렷이 흔들렸고, 빠르게 반응하고 여운이 오래 남았습니다");
  assert.match(fingerprintText({ g: 1.0, L: 0.2, tau: 1, rho: 0.15, n: 5, nResp: 3, levels: 2, confidence: 0.6 }), /반복돼도 반응이 유지됐습니다$/);
  // levels 가 없는 옛 θ̂ — 확신도가 nResp/5 의 절반이면 nth 가 한 가지였다
  assert.doesNotMatch(fingerprintText({ g: 1.0, L: 0.2, tau: 1, rho: 0.15, n: 5, nResp: 4, confidence: 0.4 }), /반복/);
  assert.match(fingerprintText({ g: 1.0, L: 0.2, tau: 1, rho: 0.15, n: 5, nResp: 4, confidence: 0.8 }), /반복/);
});
test("fingerprintText(B84): 비교 화면에서 같은 문장이던 공포형(g 1.287)·차분형(g 0.208)이 갈린다", () => {
  const a = fingerprintText({ g: 1.287, L: 0.15, tau: 0.8, rho: 0.0, n: 9, nResp: 9 });
  const b = fingerprintText({ g: 0.208, L: 0.3, tau: 0.9, rho: 0.1, n: 9, nResp: 3 });
  assert.notEqual(a, b);
  assert.match(a, /^자극마다 크게 흔들렸고/);
  assert.match(b, /^전반적으로 차분했고/);
});
test("fingerprintText: 응답 0·1건도 문장이 나온다(null 아님) — 지문 대신 사실을 적는다", () => {
  assert.equal(fingerprintText({ g: 0, L: 0, tau: 0, rho: 0, n: 5, nResp: 0 }), "사건 5개에 반응한 기록이 없어 반응 지문을 만들지 못했습니다");
  assert.equal(fingerprintText({ g: 0.5, L: 0.2, tau: 1, rho: 0, n: 5, nResp: 1 }), "사건 5개 중 한 번만 반응해 반응 지문을 쓰기에는 이릅니다");
  assert.equal(fingerprintText({ g: 0, L: 0, tau: 0, rho: 0, n: 0, nResp: 0 }), "기록된 사건이 없어 반응 지문을 만들지 못했습니다");
  assert.equal(fingerprintText(null), null);
});
test("fingerprintText: 지연·회복·습관화 구절도 임계값으로 갈린다", () => {
  const slow = fingerprintText({ g: 1.0, L: 0.9, tau: 3, rho: 0.4, n: 5, nResp: 5, levels: 3, confidence: 1 });
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
  assert.equal(MOMENT_TEXT.watched, "보고만 있던 사건");
  assert.ok(MOMENT_BASIS.some((b) => b.startsWith("보고만 있던 = ")), "새 갈래(B158)도 읽는 법에 정의가 있다");
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

test("focusSpan·focusText(B231): 요약에 focusSegments 가 있으면 topSegments 대신 그것만(사건 밖 창 · 사건 이름 없음), 비어 있으면 없음, 없는 옛 요약은 topSegments", () => {
  // b152 OFF 세션의 모양 — topSegments[0] 은 비명 사건 창(52.6~54.5), focusSegments[0] 은 판정 직후 창(62.7~64.7)
  const sum = { topSegments: [{ t0: 52.6, t1: 54.5, score: 0.862, near: { name: "catScream", onset: 52.04 } }], focusSegments: [{ t0: 62.7, t1: 64.7, score: 0.855, near: null }] };
  assert.deepEqual(focusSpan(sum), { t0: 62.7, t1: 64.7, near: null });
  assert.equal(focusText(sum, { events: FILM_EVENTS }), "판정 직후 (1:02)");
  assert.deepEqual(focusSpan(sum, 4), { t0: 250.8, t1: 258.8, near: null }, "배속이면 × speed");
  assert.equal(focusSpan({ topSegments: sum.topSegments, focusSegments: [] }), null, "사건 밖 창이 하나도 없으면 calm 없음 — topSegments 로 돌아가지 않는다");
  assert.equal(focusText({ topSegments: sum.topSegments }, { events: FILM_EVENTS }), "비명 (0:52)", "focusSegments 없는 옛 요약은 종전 규칙");
  assert.ok(MOMENT_BASIS.some((b) => b.startsWith("가장 차분히 집중 = 판정 뒤 사건 사이 창(사건 관측 밖) 중 집중도 점수 최고 2초")), "읽는 법이 후보 범위(판정 뒤 · 사건 밖)를 밝힌다");
  assert.ok(MOMENT_BASIS.some((b) => b.includes("판정 전 창을 '판정 전' 표시로")), "읽는 법이 물러난 경우의 표시도 밝힌다");
});

test("focusText(B237·B242): 사건·대사·장면 이름이 없으면 앞에 시작한 마지막 사건에 '뒤' — 판정 전 창은 괄호 안 '· 판정 전', labelOf 로 /interim 의 S 번호", () => {
  // b170b 차분형의 모양: 판정(1:55) 전 자유 창 1:51~1:53 — 그때까지 phase·talk 이벤트가 없어 종전에는 "1:51 무렵" 이었다
  const ev = [{ t: 15, name: "cue", detail: "figureApproach" }, { t: 115, name: "cue", detail: "judge" }, { t: 126, name: "cue", detail: "transition" }];
  const stimuli = [{ name: "figureApproach", onset: 15 }, { name: "frog", onset: 95 }];
  assert.deepEqual(prevStimulus(stimuli, 111.7), { name: "frog", onset: 95 });
  assert.equal(prevStimulus(stimuli, 10), null, "앞에 시작한 사건이 없으면 null");
  assert.deepEqual(prevStimulus(stimuli, 400, 4), { name: "frog", onset: 380 }, "배속이면 onset × speed 로 영화 시간에 맞춘다");
  assert.equal(prevStimulus(undefined, 100), null);
  const seg = { t0: 111.7, t1: 113.7, score: 0.698, near: null };
  assert.equal(focusText({ focusSegments: [seg] }, { events: ev, stimuli }), "개구리 뒤 (1:51)");
  assert.equal(focusText({ focusSegments: [seg] }, { events: ev }), "1:51 무렵", "stimuli 를 안 주면 종전 문구");
  assert.equal(focusText({ focusSegments: [seg] }, { events: ev, stimuli, labelOf: (n) => `S5 ${stimulusLabel(n)}` }), "S5 개구리 뒤 (1:51)", "labelOf 가 이름표를 바꾼다(/interim 의 S 번호)");
  assert.equal(focusText({ focusSegments: [{ t0: 127, t1: 129, near: null }] }, { events: ev, stimuli }), "전환 장면 (2:07)", "장면 이름이 있으면 '뒤' 보다 먼저");
  // 판정 뒤 창이 없어 판정 전 창으로 물러난 회차(focusSegments 의 before) — 어느 갈래든 판정 전임을 밝힌다
  const before = { ...seg, before: true };
  assert.deepEqual(focusSpan({ focusSegments: [before] }), { t0: 111.7, t1: 113.7, near: null, before: true }, "focusSpan 이 before 를 그대로 넘긴다");
  assert.deepEqual(focusSpan({ focusSegments: [seg] }), { t0: 111.7, t1: 113.7, near: null }, "before 가 없으면 키도 없다(옛 deepEqual 그대로)");
  assert.equal(focusText({ focusSegments: [before] }, { events: ev, stimuli, labelOf: (n) => `S5 ${stimulusLabel(n)}` }), "S5 개구리 뒤 (1:51 · 판정 전)");
  assert.equal(focusText({ focusSegments: [before] }, { events: ev }), "판정 전 1:51 무렵");
  assert.equal(focusText({ focusSegments: [{ t0: 16.3, t1: 18.3, near: { name: "figureApproach" }, before: true }] }, { events: ev }), "우비 인물 (0:16 · 판정 전)");
});

// B102 — 사건별 반응 갈래는 한 함수(lookKind)로: 종료 카드·비교 화면(lookResponses)·/film HUD 사건 표가 같은 이름을 쓴다
test("lookKind(B102): 네 갈래 — turned 우선 · responded 면 움찔만 · atOnset 이면 보고만 있음 · 옛 레코드는 looked · 헤드 포즈 feats 는 둘로만", () => {
  assert.equal(lookKind({ turned: 1, responded: 1, atOnset: 0, looked: 1 }), "turned");
  assert.equal(lookKind({ turned: 0, responded: 1, atOnset: 0, looked: 0 }), "flinched", "돌아보지 않고 509°/s 로 움찔한 개구리");
  assert.equal(lookKind({ turned: 0, responded: 1, atOnset: 1, looked: 1 }), "flinched", "보고 있던 사건에 움찔해도 움찔만(B158)");
  assert.equal(lookKind({ turned: 0, responded: 0, atOnset: 1, looked: 1 }), "watched", "atOnset 이라 looked 가 켜져도 돌아본 것이 아니다");
  assert.equal(lookKind({ turned: 0, responded: 0, atOnset: 0, looked: 0 }), "missed");
  assert.equal(lookKind({ looked: 1 }), "turned", "turned 가 없는 B158 이전 레코드는 looked");
  assert.equal(lookKind({ looked: 0 }), "missed");
  assert.equal(lookKind({ looked: false, maxVel: 509, retreat: 0.04 }), "missed", "헤드 포즈 feats 만 있으면 속도로 움찔을 가르지 않는다(lookResponses 옛 세션 규칙과 같음)");
  assert.equal(lookKind(null), null);
  assert.deepEqual(Object.keys(LOOK_KIND_SHORT), ["turned", "flinched", "watched", "missed"]);
  for (const k of Object.keys(LOOK_KIND_SHORT)) assert.ok(MOMENT_TEXT[k].startsWith(LOOK_KIND_SHORT[k].slice(0, 2)), `${k}: HUD "${LOOK_KIND_SHORT[k]}" 와 카드 "${MOMENT_TEXT[k]}" 가 같은 낱말로 시작`);
});

test("hudEventText(B102): /film HUD 사건 표가 '봤음/안 봄' 대신 카드와 같은 갈래 이름 — 개구리(안 봄 · 509°/s)는 '움찔만'", () => {
  const frog = { looked: false, lookSec: 0, maxVel: 509, retreat: 0.04, recoverySec: null, recheck: 0 };
  const frogRec = { name: "frog", turned: 0, responded: 1, atOnset: 0, looked: 0 };
  assert.equal(hudEventText(frog, frogRec), "움찔만 · 속도 509°/s · 후퇴 0.04m");
  const poster = { looked: true, lookSec: 2.4, maxVel: 492, retreat: 0.03, recoverySec: 1.1, recheck: 0 };
  assert.equal(hudEventText(poster, { turned: 1, responded: 1, atOnset: 0, looked: 1 }), "돌아봄 2.4s · 속도 492°/s · 후퇴 0.03m · 회복 1.1s");
  const spray = { looked: true, lookSec: 3.9, maxVel: 307, retreat: 0.09, recoverySec: null, recheck: 1 };
  assert.equal(hudEventText(spray, { turned: 0, responded: 0, atOnset: 1, looked: 1 }), "보고만 있음 3.9s · 재확인 · 속도 307°/s · 후퇴 0.09m");
  assert.equal(hudEventText(frog, { ...frogRec, provisional: 1, elapsed: 1.2 }), "움찔만 · 잠정 · 속도 509°/s · 후퇴 0.04m", "진행 중 잠정 레코드");
  assert.equal(hudEventText({ looked: false, lookSec: 1.2, maxVel: 20, retreat: 0, recoverySec: null, recheck: 0 }, { turned: 0, responded: 0, atOnset: 0, looked: 1 }), "반응 없음 · 응시 1.2s · 속도 20°/s · 후퇴 0.00m", "응답 창 뒤에 늦게 본 사건은 응시 초를 따로");
  // 레코드가 없으면(집중도 센서 없음·옛 세션) 헤드 포즈 looked 로 둘만 — lookResponses 의 옛 세션 규칙과 같다
  assert.equal(hudEventText(frog, null), "반응 없음 · 속도 509°/s · 후퇴 0.04m");
  assert.equal(hudEventText(poster, undefined), "돌아봄 2.4s · 속도 492°/s · 후퇴 0.03m · 회복 1.1s");
  assert.equal(hudEventText({}, null), "반응 없음 · 속도 0°/s · 후퇴 0.00m", "feats 가 비어도 깨지지 않는다");
  for (const t of [hudEventText(frog, frogRec), hudEventText(frog, null), hudEventText(poster, null)]) assert.ok(!/봤음|안 봄/.test(t), t);
});

test("HUD·모니터 기준 문장(B102): 툴팁이 네 갈래 기준과 '응답 = 돌아봄 + 움찔만(봤는지와 별개)' 을 같은 수치로 적는다", () => {
  assert.ok(HUD_LOOK_BASIS.includes("±28°") && HUD_LOOK_BASIS.includes("60°/s") && HUD_LOOK_BASIS.includes("0.07m"), HUD_LOOK_BASIS);
  assert.ok(HUD_LOOK_BASIS.includes('"응답" = 돌아봄 + 움찔만'), HUD_LOOK_BASIS);
  assert.ok(RESPONSE_BASIS.startsWith("응답 = 돌아봄 + 움찔만") && RESPONSE_BASIS.includes("봤는지(응시)와 별개"), RESPONSE_BASIS);
  for (const k of Object.keys(LOOK_KIND_SHORT)) assert.ok(HUD_LOOK_BASIS.includes(LOOK_KIND_SHORT[k]), `툴팁에 "${LOOK_KIND_SHORT[k]}"`);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
