// 두 관객 비교 화면 재료 회귀 테스트(B14b·B96·B100) — /film 세션과 /interim 세션을 같은 화면에 올릴 때
// 라우트·조건 배지·바꾼 연출·x̂ 계열·사건 눈금·판정 시각이 세션 모양에 맞게 나오는가
import assert from "node:assert/strict";
import {
  sessionRoute, biasOf, movieEvents, movieTrajectory, sessionBadges, directionChangeText, actuationStats,
  xhatSeries, eventMarks, markBefore, MARK_NEAR_SEC, judgeTime, judgeLine, probeResponses, xhatPeak, xhatGap, pairWarning,
} from "../lib/sessionCompare.js";

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

test("probeResponses: /interim 은 S 번호 순으로 반응한 사건·없던 사건, /film 은 null(헤드 포즈 채점을 쓴다)", () => {
  assert.deepEqual(probeResponses(CALM), { responded: ["S1 우비 인물", "S2 물보라"], missed: ["S4 고양이"] });
  assert.deepEqual(probeResponses(FEARFUL).responded, ["S1 우비 인물", "S2 물보라", "S4 고양이"]);
  assert.equal(probeResponses(ON), null);
});

test("xhatPeak: 최고점과 6초 안에서 그 시각 직전·직후의 사건 눈금", () => {
  const p = xhatPeak([{ t: 10, tension: 0.2 }, { t: 76, tension: 0.8 }, { t: 90, tension: 0.3 }], eventMarks(FEARFUL));
  assert.deepEqual(p, { t: 76, tension: 0.8, label: "S4 고양이" });
  assert.equal(xhatPeak([{ t: 130, tension: 0.5 }], eventMarks(FEARFUL)).label, null, "사건에서 멀면 이름 없음");
  assert.equal(xhatPeak([], []), null);
});

test("pairWarning: 라우트나 배속이 다르면 경고, 같으면 null", () => {
  assert.equal(pairWarning(FEARFUL, CALM), null);
  assert.equal(pairWarning(ON, OFF), null);
  assert.match(pairWarning(FEARFUL, ON), /체험이 다릅니다\(A \/interim · B \/film\)/);
  assert.match(pairWarning(FEARFUL, { ...CALM, speed: 4 }), /배속이 다릅니다/);
  assert.equal(pairWarning(null, CALM), null);
});

console.log(`\n${n} passed`);
