// 두 관객 비교 화면 재료 회귀 테스트(B14b·B96·B100) — /film 세션과 /interim 세션을 같은 화면에 올릴 때
// 라우트·조건 배지·바꾼 연출·x̂ 계열·사건 눈금·판정 시각이 세션 모양에 맞게 나오는가
import assert from "node:assert/strict";
import {
  sessionRoute, biasOf, movieEvents, movieTrajectory, sessionBadges, directionChangeText, actuationStats,
  xhatSeries, eventMarks, markBefore, MARK_NEAR_SEC, judgeTime, judgeLine, lookResponses, lookText, xhatPeak, xhatGap, pairWarning,
  momentsOf, peakText, NO_PEAK_TEXT, leaderBands, labelRows, labelWidth, labelOverlaps, LABEL_LAYOUT,
} from "../lib/sessionCompare.js";
import { interimAdapt } from "../lib/interimAdapt.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

// ── 고정 세션: 실제 세션(work/evidence/b59·b21)의 모양을 줄인 것 ──
// engagement 창 두 개·탐침 하나 — estimateTensionSeries 가 계열을 만들 수 있는 최소 모양
const win = (t1, v = 5) => ({ t0: t1 - 2, t1, angVelRms: v });
const stim = (name, onset, responded, extra = {}) => ({ name, kind: "probe", channel: "av", dose: 0.6, nth: 0, onset, dur: 3, azimuth: 30, preLook: 0, responded, looked: responded, lookLatency: responded ? 0.3 : null, moveLatency: responded ? 0.3 : null, lookSec: responded ? 2 : 0, peakAmp: responded ? 30 : 2, maxVel: responded ? 200 : 10, retreat: 0, recoverySec: responded ? 2 : null, recheck: 0, maskedSec: 0, ...extra });

function interimSession({ id, genre, profile, totals, breakdown, stimuli, speed = 1 }) {
  return {
    id, route: "interim", dominant: genre, speed,
    viewer: { synthetic: true, profile, label: { fearful: "공포형", calm: "차분형" }[profile], seed: 1 },
    trajectory: [{ t: 0, R: 0.333, H: 0.333, C: 0.333 }, { t: 139.9, R: genre === "R" ? 1 : 0, H: genre === "H" ? 1 : 0, C: genre === "C" ? 1 : 0 }],
    events: [{ t: 0, name: "viewer:synthetic", detail: { profile, seed: 1 } }, { t: 15, name: "cue", detail: "figureApproach" }, { t: 115, name: "cue", detail: "judge" }, { t: 140, name: "cue", detail: "end" }],
    judge: { genre, totals, breakdown, reason: "합산 최고 장르" },
    engagement: { windows: [win(14), win(16), win(74), win(76), win(78)], stimuli },
    control: { track: genre, theta: { g: 1, nResp: 2 }, tension: [{ t: 16, tension: 0.4 }] },
  };
}
const FEARFUL = interimSession({
  id: "2026-09-29T13-26-24-394Z_interim_H", genre: "H", profile: "fearful",
  totals: { R: 1, H: 5, C: 1 },
  breakdown: [{ signal: "S1", grade: "B" }, { signal: "S3", grade: "B" }, { signal: "S5", grade: "A" }],
  stimuli: [stim("truckSplash", 35, 1), stim("figureApproach", 15, 1, { kind: "track" }), stim("cat", 73, 1)],
});
const CALM = interimSession({
  id: "2026-09-29T13-31-36-948Z_interim_R", genre: "R", profile: "calm",
  totals: { R: 5, H: 0, C: 0 },
  breakdown: [{ signal: "S1", grade: "A" }, { signal: "S3", grade: "C" }, { signal: "S5", grade: "D" }],
  stimuli: [stim("figureApproach", 15, 1, { kind: "track" }), stim("truckSplash", 35, 1), stim("cat", 73, 0)],
});

const act = (t, active, mode, u, offsets) => ({ t, kind: "event", name: "control:actuate", detail: { t, active, mode, u, offsets } });
const ZERO = { npcSilence: 0, bgmGain: 0, lampOn: 0, fogDensity: 0, npcDistance: 0, npcGaze: 0 };
function filmSession({ on, bias = true, speed = 1, route = "film" }) {
  const events = [
    ...(bias ? [{ t: 0, kind: "evidence", source: "bias", weight: 6, scores: { R: 0, H: 1, C: 0 }, note: "?bias=H" }] : []),
    { t: 6 / speed, kind: "event", name: "event:start", detail: { name: "poster" } },
    { t: 37 / speed, kind: "event", name: "event:start", detail: { name: "frog" } },
    { t: 58 / speed, kind: "event", name: "cue", detail: "judge" },
    ...(on ? [{ t: 68, kind: "event", name: "control:micro", detail: { dose: 0.6 } }, { t: 80, kind: "event", name: "control:micro", detail: { dose: 0.6 } }] : []),
    act(70, on, on ? "arouse" : "off", on ? 0.8 : 0, on ? { ...ZERO, npcSilence: 0.5, npcDistance: 0.2, npcGaze: -0.1, bgmGain: 0.3 } : ZERO),
    act(72, on, on ? "settle" : "off", on ? 0.4 : 0, on ? { ...ZERO, npcSilence: 0.3, npcDistance: 0.1, npcGaze: -0.06, bgmGain: 0.1 } : ZERO),
  ];
  return {
    id: "2026-09-29T17-31-05-597Z_H", ...(route ? { route } : {}), dominant: "H", speed,
    viewer: { synthetic: true, profile: "fearful", label: "공포형", seed: 1 },
    verdict: { dominant: "H", mix: { R: 0.2, H: 0.67, C: 0.13 }, t: 58 },
    trajectory: [{ t: 0, R: 0.3, H: 0.4, C: 0.3 }], events,
    engagement: { windows: [win(36), win(38), win(40)], stimuli: [stim("frog", 37, 1)] },
    control: {
      track: "H", mode: on ? "full" : "off",
      slots: on ? { frog: { variantId: "once", dose: 0.4, actuation: { volume: 0.5 } }, cat: { variantId: "playful", dose: 0.4, actuation: { volume: 0.5 } } }
        : { frog: { variantId: null, dose: 0.8, actuation: { volume: 0.8 } } },
      actuation: { on, ticks: 2, micro: on ? 2 : 0 },
    },
  };
}
const ON = filmSession({ on: true });
const OFF = filmSession({ on: false });

test("sessionRoute: route 필드 우선, 없으면(B100 이전 /film) 파일 이름의 _interim_ 으로", () => {
  assert.equal(sessionRoute(FEARFUL), "interim");
  assert.equal(sessionRoute(ON), "film");
  assert.equal(sessionRoute({ id: "2026-09-29T13-26-24-394Z_interim_H" }), "interim");
  assert.equal(sessionRoute({ id: "2026-09-29T17-31-05-597Z_H" }), "film");
  assert.equal(sessionRoute(null), null);
});

test("biasOf: /film 의 ?bias 선입력 증거 → {g, w}, 없으면 null", () => {
  assert.deepEqual(biasOf(ON), { g: "H", w: 6 });
  assert.equal(biasOf(filmSession({ on: true, bias: false })), null);
  assert.equal(biasOf(FEARFUL), null);
});

test("sessionBadges(B96): 라우트·합성 관객·bias·배속·제어가 배지로, 증거로 쓸 때 조심할 조건은 warn", () => {
  const on = sessionBadges(ON);
  const txt = on.map((b) => b.text).join(" | ");
  assert.match(txt, /\/film/);
  assert.match(txt, /합성 관객 공포형 · seed 1/);
  assert.match(txt, /\?bias=H:6/);
  assert.match(txt, /제어 ON/);
  assert.equal(on.find((b) => b.key === "bias").tone, "warn");
  assert.equal(on.find((b) => b.key === "viewer").tone, "warn");
  assert.ok(!on.some((b) => b.key === "speed"), "1배속이면 배속 배지 없음");
  assert.match(sessionBadges(OFF).map((b) => b.text).join(" "), /제어 OFF/);
  const it = sessionBadges(FEARFUL).map((b) => b.text).join(" | ");
  assert.match(it, /\/interim/);
  assert.match(it, /중립 탐침/);
  assert.ok(!/bias/.test(it));
  const fast = sessionBadges({ ...FEARFUL, speed: 4 });
  assert.equal(fast.find((b) => b.key === "speed").tone, "warn");
  assert.match(fast.find((b) => b.key === "speed").text, /×4/);
  const real = sessionBadges({ ...ON, viewer: undefined });
  assert.equal(real.find((b) => b.key === "viewer").text, "실제 관객");
});

test("directionChangeText(B96): /film ON 은 슬롯 변형·미세 자극·연속 구동 평균, OFF 는 고정 연출, /interim 은 바꾼 연출 없음", () => {
  const on = directionChangeText(ON);
  assert.match(on, /^이 관객에게 바꾼 연출: /);
  assert.match(on, /개구리 한 번\(볼륨 0\.5\)/);
  assert.match(on, /고양이 장난스럽게\(볼륨 0\.5\)/);
  assert.match(on, /미세 자극 2회/);
  assert.match(on, /연속 구동 2틱 평균 u \+0\.60/);
  assert.match(on, /침묵 \+0\.40s/);
  assert.match(on, /거리 \+0\.15m/);
  assert.match(on, /시선 −8%/);
  assert.match(on, /BGM ×1\.20/);
  assert.ok(!/안개|가로등/.test(on), "0 인 축은 적지 않는다");
  assert.match(directionChangeText(OFF), /^제어 OFF — 모든 관객에게 같은 연출/);
  assert.match(directionChangeText(FEARFUL), /^바꾼 연출 없음 — 다섯 사건\(S1~S5\)은 누구에게나 같은 자극/);
  assert.match(directionChangeText(FEARFUL), /판정\(1:55\)/);
  assert.equal(directionChangeText({ id: "x_H" }), "제어 기록이 없는 세션입니다");
});

test("actuationStats: 켜진 틱만 평균, OFF 세션은 0", () => {
  const a = actuationStats(ON);
  assert.equal(a.ticks, 2);
  assert.equal(a.active, 2);
  assert.deepEqual(a.modes, { arouse: 1, settle: 1 });
  assert.equal(a.meanU, 0.6);
  assert.equal(a.meanOffsets.npcSilence, 0.4);
  const b = actuationStats(OFF);
  assert.equal(b.active, 0);
  assert.equal(b.meanU, 0);
  assert.equal(b.modes.off, 2);
});

test("directionChangeText·sessionBadges(B170b): /interim 세션에 control.adapt 가 있으면 판정 뒤 인사 구간의 바꾼 연출(네 값·성향), 고정이면 그 이유, 없으면(옛 세션) 예전 문장", () => {
  const ad = interimAdapt({ theta: { g: 1.142, L: 0.167, tau: 0.648, rho: 0.001, n: 5, nResp: 5, levels: 3, confidence: 1 }, xhatPeak: 1, genre: "H" });
  const s = { ...FEARFUL, control: { ...FEARFUL.control, adapt: ad } };
  assert.match(directionChangeText(s), /^이 관객에게 바꾼 연출\(판정 1:55 뒤 인사 구간\): 공포 옆사람 · 거리 1\.\d\d? m\(앵커 1\.2\) · \d+(\.\d)?초 걸어와 \d+(\.\d)?초 뒤 인사 · 시선 \d+% · 과민\(민감도 \+0\.\d\d · 응답 5\/5 · 신뢰도 100%\)$/);
  assert.equal(sessionBadges(s).find((b) => b.key === "control").text, "판정 뒤 연출 적응 ON(θ̂·x̂ · 과민)");
  const fx = interimAdapt({ theta: { g: 0.386, L: 0.335, tau: 1, rho: 0.15, n: 5, nResp: 1, levels: 1, confidence: 0.1 }, xhatPeak: 0.311, genre: "R" });
  const c = { ...CALM, control: { ...CALM.control, adapt: fx } };
  assert.match(directionChangeText(c), /^바꾼 연출 없음 — 다섯 사건\(S1~S5\)은 누구에게나 같은 자극이고, 판정\(1:55\) 뒤 인사 구간도 고정 연출 · 거리 0\.9 m · 6초 걸어와 6초 뒤 인사 · 시선 75% — 응답 1\/5 · 모델이 서지 않음$/);
  assert.equal(sessionBadges(c).find((b) => b.key === "control").text, "판정 뒤 연출 고정 — 응답 1/5 · 모델이 서지 않음");
  const off = { ...CALM, control: { ...CALM.control, adapt: { ...interimAdapt({ theta: null, genre: "R" }), reason: "?adapt=0 → 고정 연출" } } };
  assert.equal(sessionBadges(off).find((b) => b.key === "control").text, "판정 뒤 연출 고정 — ?adapt=0");
  assert.match(directionChangeText(FEARFUL), /^바꾼 연출 없음 — 다섯 사건\(S1~S5\)은 누구에게나 같은 자극이고, 판정\(1:55\) 뒤 옆자리 인물과 인사만 장르별로 갈립니다$/, "옛 세션(adapt 없음)");
  assert.equal(sessionBadges(FEARFUL).find((b) => b.key === "control").text, "연출 고정(중립 탐침 다섯)");
});

test("xhatSeries: 두 라우트 모두 engagement 에서 다시 계산, 배속이면 영화 시간(× speed), 리포트 없으면 control.tension", () => {
  const s = xhatSeries(FEARFUL);
  assert.equal(s.length, 5);
  assert.deepEqual(s.map((p) => p.t), [14, 16, 74, 76, 78]);
  assert.ok(s.every((p) => p.tension >= 0 && p.tension <= 1));
  const fast = xhatSeries({ ...FEARFUL, speed: 4 });
  assert.deepEqual(fast.map((p) => p.t), [56, 64, 296, 304, 312]);
  assert.deepEqual(xhatSeries({ ...FEARFUL, engagement: undefined }), [{ t: 16, tension: 0.4 }]);
  assert.deepEqual(xhatSeries(null), []);
});

test("xhat 계열이 관객을 가른다: 고양이(73s)에 반응한 공포형 > 반응 없는 차분형", () => {
  const f = xhatSeries(FEARFUL), c = xhatSeries(CALM);
  const at = (sr, t) => sr.find((p) => p.t === t).tension;
  assert.ok(at(f, 76) > at(c, 76) + 0.1, `공포형 ${at(f, 76)} vs 차분형 ${at(c, 76)}`);
  const g = xhatGap(f, c);
  assert.equal(g.n, 5);
  assert.ok(g.maxGap.t >= 74 && g.maxGap.t <= 78, `가장 벌어진 시각 ${g.maxGap.t}`);
  assert.ok(g.meanAbs > 0);
});

test("eventMarks: /interim 은 S1~S5 다섯 눈금(팀 신호 번호), /film 은 event:start 를 영화 시간으로", () => {
  const m = eventMarks(FEARFUL);
  assert.deepEqual(m.map((q) => q.label), ["S1 우비 인물", "S2 물보라", "S3 포스터", "S4 고양이", "S5 개구리"]);
  assert.deepEqual(m.map((q) => q.t), [15, 35, 55, 73, 95]); // 고양이는 catIn + 3(lib/interimProbes.js probeMarks)
  // 제어 ON 은 미세 자극(control:micro)도 "먼 문 소리" 눈금으로 — OFF 에는 없다
  assert.deepEqual(eventMarks(ON).map((q) => [q.label, q.t]), [["포스터", 6], ["개구리", 37], ["먼 문 소리", 68], ["먼 문 소리", 80]]);
  assert.deepEqual(eventMarks(OFF).map((q) => q.label), ["포스터", "개구리"]);
  const fast = filmSession({ on: true, speed: 4 });
  assert.deepEqual(eventMarks(fast).map((q) => q.t).slice(0, 2), [6, 37], "4배속 /film 세션도 영화 시간");
  assert.equal(movieEvents(fast).find((e) => e.name === "cue").t, 58);
});

test("movieTrajectory: /film 배속 회차는 궤적도 × speed(눈금과 같은 시계), /interim·1배속은 그대로", () => {
  const fast = { ...filmSession({ on: true, speed: 4 }), trajectory: [{ t: 0, R: 0.3, H: 0.4, C: 0.3 }, { t: 14.5, R: 0.2, H: 0.6, C: 0.2 }] };
  assert.deepEqual(movieTrajectory(fast).map((p) => p.t), [0, 58]);
  assert.equal(movieTrajectory(ON), ON.trajectory);
  assert.equal(movieTrajectory({ ...FEARFUL, speed: 4 }), FEARFUL.trajectory, "/interim 궤적은 이미 영화 시간");
  assert.deepEqual(movieTrajectory(null), []);
});

test("markBefore: 직전 사건을 MARK_NEAR_SEC 안에서만 — 16초 앞 사건은 이름으로 붙이지 않는다(ON/OFF 쌍의 1:08 봉우리는 '비명 뒤' 가 아니라 '먼 문 소리 뒤')", () => {
  const marks = [{ t: 52, label: "비명" }, { t: 68.1, label: "먼 문 소리" }];
  assert.equal(markBefore(marks, 68.7).label, "먼 문 소리");
  assert.equal(markBefore([{ t: 52, label: "비명" }], 68.7), null);
  assert.equal(markBefore(marks, 52.5).label, "비명");
  assert.equal(markBefore(marks, 51.2).label, "비명", "1초 여유 — 눈금 직전 표본");
  assert.equal(MARK_NEAR_SEC, 8);
  assert.equal(markBefore([], 10), null);
});

test("directionChangeText: 표시 자릿수에서 0 이 되는 축은 부호와 함께 찍지 않는다(\"안개 −0.000\")", () => {
  const tiny = filmSession({ on: true });
  tiny.events = tiny.events.map((e) => (e.name === "control:actuate" ? { ...e, detail: { ...e.detail, offsets: { ...e.detail.offsets, fogDensity: -0.0002, npcGaze: 0.001 } } } : e));
  const t = directionChangeText(tiny);
  assert.ok(!/안개/.test(t), t);
  assert.ok(!/시선/.test(t), t);
  assert.match(t, /침묵 \+0\.40s/);
});

test("judgeTime·judgeLine: /interim 은 judge 큐(1:55)와 팀 5신호 점수 그대로, /film 은 verdict.t 이고 judgeLine 없음", () => {
  assert.equal(judgeTime(FEARFUL), 115);
  assert.equal(judgeLine(FEARFUL), "팀 판정(1:55) S1 B · S3 B · S5 A → 공포 5점 · 로맨스 1 · 블랙코미디 1");
  assert.equal(judgeLine(CALM), "팀 판정(1:55) S1 A · S3 C · S5 D → 로맨스 5점 · 공포 0 · 블랙코미디 0");
  assert.equal(judgeTime(ON), 58);
  assert.equal(judgeLine(ON), null);
  assert.equal(judgeTime({ ...ON, verdict: null }), 58, "verdict 없으면 judge 큐");
});

test("lookResponses(B128): /interim 은 S 번호 순으로 돌아본·움찔만·반응 없던 사건, 기준은 engagement.stimuli 하나", () => {
  assert.deepEqual(lookResponses(CALM), { turned: ["S1 우비 인물", "S2 물보라"], flinched: [], watched: [], missed: ["S4 고양이"] });
  assert.deepEqual(lookResponses(FEARFUL).turned, ["S1 우비 인물", "S2 물보라", "S4 고양이"]);
  // 돌아보지 않았지만 빠른 고개 움직임이 있으면 "움찔만" — 옛 "안 본 것" 과 x̂ 최고가 같은 사건일 때 모순처럼 읽히던 경우
  const flinch = { ...FEARFUL, engagement: { ...FEARFUL.engagement, stimuli: [...FEARFUL.engagement.stimuli, stim("frog", 95, 1, { looked: 0, lookLatency: null, lookSec: 0 })] } };
  assert.deepEqual(lookResponses(flinch).flinched, ["S5 개구리"]);
  assert.equal(lookText(lookResponses(flinch)), "돌아본 사건: S1 우비 인물, S2 물보라, S4 고양이 · 움찔만 한 사건: S5 개구리");
  assert.equal(lookText(lookResponses(CALM)), "돌아본 사건: S1 우비 인물, S2 물보라 · 반응 없던 사건: S4 고양이");
});

test("lookResponses(B158): 시작할 때 이미 보던 사건은 돌아본 것이 아니다 — 움찔했으면 '움찔만', 아니면 '보고만 있던'", () => {
  // 1배속 /interim 차분형 S2 물보라(review38): preLook 1 · lookLatency 0.03 · 최대 편차 0.6° · 각속도 2.4°/s — 새 센서는 atOnset 1 · turned 0 · responded 0
  const watched = stim("truckSplash", 35, 0, { preLook: 1, atOnset: 1, turned: 0, looked: 1, lookLatency: 0.03, moveLatency: null, lookSec: 3.92, peakAmp: 0.6, maxVel: 2.4 });
  // 1배속 공포형 S2: 이미 보던 물보라에 222°/s 로 움찔 — responded 1 · turned 0
  const flinchedAt = stim("truckSplash", 35, 1, { preLook: 1, atOnset: 1, turned: 0, looked: 1, lookLatency: 0.02, moveLatency: 0.02, maxVel: 222 });
  const figure = stim("figureApproach", 15, 1, { kind: "track", turned: 1, atOnset: 0 });
  const calm = { ...CALM, engagement: { ...CALM.engagement, stimuli: [figure, watched, stim("cat", 75, 0, { atOnset: 0, turned: 0 })] } };
  assert.deepEqual(lookResponses(calm), { turned: ["S1 우비 인물"], flinched: [], watched: ["S2 물보라"], missed: ["S4 고양이"] });
  assert.equal(lookText(lookResponses(calm)), "돌아본 사건: S1 우비 인물 · 보고만 있던 사건: S2 물보라 · 반응 없던 사건: S4 고양이");
  const fear = { ...CALM, engagement: { ...CALM.engagement, stimuli: [figure, flinchedAt] } };
  assert.deepEqual(lookResponses(fear), { turned: ["S1 우비 인물"], flinched: ["S2 물보라"], watched: [], missed: [] });
});

test("lookResponses(B128): /film 은 사건 시각 순, 같은 이름표(미세 자극 먼 문 소리)는 ×N, engagement 없으면 헤드 포즈 채점", () => {
  const film = { ...ON, engagement: { ...ON.engagement, stimuli: [
    stim("micro-1", 68, 1), stim("frog", 37, 1, { looked: 0 }), stim("poster", 6, 1), stim("micro-2", 80, 1), stim("cat", 44, 0, { looked: 0 }),
  ] } };
  assert.deepEqual(lookResponses(film), { turned: ["포스터", "먼 문 소리 ×2"], flinched: ["개구리"], watched: [], missed: ["고양이"] });
  const old = { ...ON, engagement: undefined, headPose: { events: [{ name: "poster", feats: { looked: 1 } }, { name: "frog", feats: { looked: 0 } }] } };
  assert.deepEqual(lookResponses(old), { turned: ["포스터"], flinched: [], watched: [], missed: ["개구리"] });
  assert.equal(lookResponses({ ...ON, engagement: undefined }), null);
  assert.equal(lookText(null), "");
});

test("xhatPeak: 최고점과 6초 안에서 그 시각 직전·직후의 사건 눈금", () => {
  const p = xhatPeak([{ t: 10, tension: 0.2 }, { t: 76, tension: 0.8 }, { t: 90, tension: 0.3 }], eventMarks(FEARFUL));
  assert.deepEqual(p, { t: 76, tension: 0.8, label: "S4 고양이", capped: 0 });
  assert.equal(xhatPeak([{ t: 130, tension: 0.5 }], eventMarks(FEARFUL)).label, null, "사건에서 멀면 이름 없음");
  assert.equal(xhatPeak([], []), null);
});

test("xhatPeak(B144·B152): 여러 봉우리가 상한 1.0 에 닿으면 잘리기 전 fromStim 이 큰 것, 상한에 닿은 사건 수", () => {
  const sr = [{ t: 17, tension: 1, fromStim: 1.1 }, { t: 37, tension: 0.4, fromStim: 0.2 }, { t: 76, tension: 1, fromStim: 1.4 }, { t: 97, tension: 1, fromStim: 1.2 }];
  const p = xhatPeak(sr, eventMarks(FEARFUL));
  assert.equal(p.label, "S4 고양이", "첫째 동률(S1)이 아니라 잘리기 전 값이 가장 큰 S4");
  assert.equal(p.capped, 3);
  assert.equal(peakText(p), "S4 고양이 (1:16) · x̂ 1.00(상한에 닿은 3곳 중 최대)");
  assert.equal(peakText({ t: 36, tension: 0.31, label: "S2 물보라", capped: 0 }), "S2 물보라 (0:36) · x̂ 0.31");
  assert.equal(peakText({ t: 148, tension: 0.5, label: null, capped: 0 }), "2:28 무렵 · x̂ 0.50");
  assert.equal(peakText(null), null);
});

test("xhatPeak(B189): 사건 반응이 있는 창만 후보 — 잔움직임 봉우리는 '가장 크게 반응' 이 아니고, 반응이 한 번도 없으면 null", () => {
  // 1배속 /interim 차분형(review44): 2:05 사건 기여 0 · 잔움직임 0.15 → x̂ 0.27. 반응을 모두 0 으로 두면 카드가 "2:05 무렵 · x̂ 0.27" 을 적었다
  const fid = { t: 125.6, tension: 0.27, fromStim: 0, fidget: 0.15 };
  assert.equal(xhatPeak([{ t: 14, tension: 0.12, fromStim: 0 }, fid, { t: 130, tension: 0.2, fromStim: 0 }], eventMarks(CALM)), null);
  const p = xhatPeak([{ t: 16, tension: 0.22, fromStim: 0.1 }, fid], eventMarks(CALM));
  assert.equal(p.t, 16, "잔움직임 봉우리(0.27)가 더 높아도 사건 반응 창(0.22)");
  assert.equal(p.label, "S1 우비 인물");
  // 사건 반응이 한 번도 없던 관객의 카드 — x̂ 계열은 있는데 봉우리가 없다
  const none = interimSession({ id: "2026-09-29T23-52-26-939Z_interim_R", genre: "R", profile: "calm", totals: { R: 5, H: 0, C: 0 }, breakdown: [],
    stimuli: [stim("figureApproach", 15, 0, { kind: "track" }), stim("truckSplash", 35, 0)] });
  const m = momentsOf(none);
  assert.equal(m.peak, null);
  assert.equal(m.noPeak, true);
  assert.equal(NO_PEAK_TEXT, "뚜렷한 반응 없음");
  assert.equal(momentsOf(FEARFUL).noPeak, undefined, "봉우리가 있으면 붙지 않는다");
  assert.equal(momentsOf({ ...FEARFUL, engagement: undefined, control: {} }).noPeak, undefined, "계열이 없으면 붙지 않는다");
});

test("leaderBands(B187): 선두 장르 구간 — 값이 대칭인 두 관객(블랙코미디 0.67 vs 로맨스 0.67)도 띠 색으로 갈린다", () => {
  const mk = (lead) => [
    { t: 0, R: 0.333, H: 0.333, C: 0.334 },
    { t: 60, R: 0.333, H: 0.333, C: 0.334 },
    { t: 74, ...{ R: 0.165, H: 0.165, C: 0.165, [lead]: 0.67 } },
    { t: 140, ...{ R: 0.165, H: 0.165, C: 0.165, [lead]: 0.67 } },
  ];
  const A = leaderBands(mk("C")), B = leaderBands(mk("R"));
  assert.deepEqual(A, [{ t0: 0, t1: 74, g: null }, { t0: 74, t1: 140, g: "C" }], "1·2위 차이 0.001 은 비슷함(회색)");
  assert.deepEqual(B.map((b) => b.g), [null, "R"]);
  assert.notEqual(A.at(-1).g, B.at(-1).g, "같은 높이라도 선두 장르가 다르다");
  assert.deepEqual(leaderBands([]), []);
  assert.deepEqual(leaderBands([{ t: 5, R: 0.2, H: 0.7, C: 0.1 }]), [{ t0: 5, t1: 5, g: "H" }], "표본 하나");
});

test("momentsOf(B144): 가장 크게 반응(x̂ 최고)과 가장 차분히 집중(집중도 최고 2초)은 영화 시간 — 배속 회차도 × speed", () => {
  const summary = { topSegments: [{ t0: 29, t1: 31, score: 0.9, near: null }] };
  const m = momentsOf({ ...FEARFUL, engagement: { ...FEARFUL.engagement, summary } });
  assert.deepEqual(m.peak, xhatPeak(xhatSeries(FEARFUL), eventMarks(FEARFUL)), "비교 화면과 같은 계열·눈금");
  assert.ok(m.peak.label, "사건 이름이 붙는다");
  assert.deepEqual([m.calm.t0, m.calm.t1], [29, 31]);
  assert.equal(m.calm.text, "0:29 무렵", "focusText 와 같은 규칙(사건·대사·장면이 없으면 m:ss 무렵)");
  const fast = momentsOf({ ...FEARFUL, speed: 4, engagement: { ...FEARFUL.engagement, summary } });
  assert.deepEqual([fast.calm.t0, fast.calm.t1], [116, 124]);
  assert.equal(momentsOf({ ...FEARFUL, engagement: { ...FEARFUL.engagement } }).calm, null, "요약 없으면 calm 없음");
  // /interim 은 가까운 사건 이름에 S 번호 — 같은 카드의 "가장 크게 반응한 순간 S1 우비 인물" 과 같은 표기
  const near = { topSegments: [{ t0: 16.3, t1: 18.3, score: 0.9, near: { name: "figureApproach", onset: 15 } }] };
  assert.equal(momentsOf({ ...CALM, engagement: { ...CALM.engagement, summary: near } }).calm.text, "S1 우비 인물 (0:16)");
  assert.equal(momentsOf({ ...ON, engagement: { ...ON.engagement, summary: { topSegments: [{ t0: 37.5, t1: 39.5, score: 0.9, near: { name: "frog" } }] } } }).calm.text, "개구리 (0:37)", "/film 은 S 번호 없음");
  assert.deepEqual(momentsOf(null), { peak: null, calm: null });
});

test("xhatSeries(B151): 사건 반응 몫 fromStim 을 넘긴다 — 비교 화면이 사건 사이 구간을 흐리게 그린다", () => {
  const s = xhatSeries(FEARFUL);
  assert.ok(s.every((p) => Number.isFinite(p.fromStim)));
  assert.ok(s.find((p) => p.t === 76).fromStim > s.find((p) => p.t === 14).fromStim);
});

test("pairWarning: 라우트나 배속이 다르면 경고, 같으면 null", () => {
  assert.equal(pairWarning(FEARFUL, CALM), null);
  assert.equal(pairWarning(ON, OFF), null);
  assert.match(pairWarning(FEARFUL, ON), /체험이 다릅니다\(A \/interim · B \/film\)/);
  assert.match(pairWarning(FEARFUL, { ...CALM, speed: 4 }), /배속이 다릅니다/);
  assert.equal(pairWarning(null, CALM), null);
});

test("labelRows(B210): 0:37~0:53 에 몰린 /film 사건 이름표가 같은 줄에서 겹치지 않고, 줄 수는 maxRows 안 — 옛 i%3 순환은 겹쳤다", () => {
  // /film ON 세션의 사건 눈금(영화 시간) — 비교 화면 x̂ 그래프와 같은 축(W 900 · PAD 10 · tMax 200)
  const marks = [["포스터", 14], ["우비 인물", 21], ["물보라", 30], ["개구리", 37], ["고양이", 45], ["비명", 52], ["먼 문 소리", 68], ["먼 문 소리", 99], ["먼 문 소리", 127]].map(([label, t]) => ({ t, label }));
  const x = (t) => 10 + (t / 200) * 880;
  const rows = labelRows(marks, x);
  assert.equal(rows.length, marks.length);
  assert.deepEqual(labelOverlaps(marks, x, rows), [], "같은 줄 겹침 없음");
  assert.ok(Math.max(...rows) < LABEL_LAYOUT.maxRows, `줄 ${Math.max(...rows) + 1}`);
  // 더 몰린 눈금(2초 간격 넷): 옛 규칙 i%3 은 첫째·넷째가 같은 줄에서 겹치고, 폭을 보는 배치는 겹치지 않는다
  const dense = [["개구리", 37], ["고양이", 39], ["비명", 41], ["먼 문 소리", 43]].map(([label, t]) => ({ t, label }));
  assert.ok(labelOverlaps(dense, x, dense.map((_, i) => i % 3)).length > 0, "옛 규칙(i%3)은 겹친다 — 테스트가 의미 있음");
  assert.deepEqual(labelOverlaps(dense, x, labelRows(dense, x)), []);
  // 폭 추정: 한글은 charW, 공백·숫자는 asciiW
  assert.equal(labelWidth("개구리"), 3 * LABEL_LAYOUT.charW);
  assert.ok(Math.abs(labelWidth("S1 우비 인물") - (4 * LABEL_LAYOUT.asciiW + 4 * LABEL_LAYOUT.charW)) < 1e-9, String(labelWidth("S1 우비 인물")));
  // 입력 순서가 뒤섞여도 결과는 입력 순서대로 돌아오고 배치는 시각 순
  const shuffled = [marks[5], marks[3], marks[4]];
  const r2 = labelRows(shuffled, x);
  assert.deepEqual(labelOverlaps(shuffled, x, r2), []);
  assert.equal(r2[1], 0, "가장 이른 개구리가 맨 윗줄");
  // /interim 다섯 눈금(S1~S5 · 간격 넓음)은 한 줄에 다 들어간다
  const interim = [["S1 우비 인물", 16], ["S2 물보라", 40], ["S3 포스터", 62], ["S4 고양이", 84], ["S5 개구리", 100]].map(([label, t]) => ({ t, label }));
  const xi = (t) => 10 + (t / 140) * 880;
  assert.deepEqual(labelRows(interim, xi), [0, 0, 0, 0, 0]);
});
console.log(`\n${n} passed`);
