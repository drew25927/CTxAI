// /interim 판정 뒤 관객별 연출 회귀 테스트(B170a) — 세 합성 프로필이 서로 다른 값 · 범위 · θ̂ 신뢰도 낮으면 고정 연출 · 단조성 · 순수성
import assert from "node:assert/strict";
import { interimAdapt, adaptText, sensitivityIndex, adaptBlockReason, profileLabel, FIXED, ADAPT_RANGES, ADAPT_PARAMS, GENRES } from "../lib/interimAdapt.js";
import { ANCHORS } from "../lib/directionMap.js";
import { T, evalActors } from "../lib/interimTimeline.js";
import { RANGES as ACT_RANGES } from "../lib/controlActuate.js";
import { VIEWER_PRIOR } from "../lib/viewerModel.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

// 합성 프로필 세 개 — test-slot-actuate 의 SENSITIVE·BLUNT 와 같은 모양(θ̂ 필드 = fitViewerModel 결과)
const SENSITIVE = { g: 1.2, L: 0.3, tau: 3.5, rho: 0.1, n: 5, nResp: 5, levels: 2, confidence: 1 };
const MIDDLE = { g: VIEWER_PRIOR.g, L: 0.5, tau: VIEWER_PRIOR.tau, rho: 0.15, n: 5, nResp: 3, levels: 2, confidence: 0.6 };
const BLUNT = { g: 0.35, L: 0.7, tau: 1.2, rho: 0.35, n: 5, nResp: 3, levels: 2, confidence: 0.6 };
const PEAK = { SENSITIVE: 0.95, MIDDLE: 0.5, BLUNT: 0.25 };

// 1배속 실측(합성 관객 · 헤드리스 완주) — work/evidence/review51/compare/sessions/2026-09-29T22-29-26-935Z_interim_H.json(fearful) ·
// 2026-09-29T23-52-26-939Z_interim_R.json(calm) 의 control.theta 와 sessionCompare.momentsOf().peak.tension 을 그대로 옮겼다.
const REAL_FEARFUL = { theta: { g: 1.142, L: 0.167, tau: 0.648, rho: 0.001, n: 5, nResp: 5, levels: 3, confidence: 1 }, xhatPeak: { t: 96, tension: 1, label: "S5 개구리", capped: 3 }, genre: "H" };
const REAL_CALM = { theta: { g: 0.386, L: 0.335, tau: 1, rho: 0.15, n: 5, nResp: 1, levels: 1, confidence: 0.1 }, xhatPeak: { t: 16.3, tension: 0.311, label: "S1 우비 인물", capped: 0 }, genre: "R" };

const KEYS = ["seatDistance", "approachSec", "greetDelaySec", "gazeAtViewer"];
const inRange = (a) => KEYS.every((k) => a[k] >= ADAPT_RANGES[k][0] - 1e-9 && a[k] <= ADAPT_RANGES[k][1] + 1e-9);

test("고정 연출 FIXED 는 오늘의 /interim 과 같다 — 거리 0.9(= evalActors seatX 0.35 + 0.9) · 6초 걸어옴 · 6초 뒤 인사 · 시선은 장르 앵커라 FIXED 에 없다", () => {
  assert.equal(FIXED.seatDistance, 0.9);
  assert.equal(FIXED.approachSec, T.npcSeated - T.figureGone);
  assert.equal(FIXED.approachSec, 6);
  assert.equal(FIXED.greetDelaySec, T.greeting - T.npcSeated);
  assert.equal(FIXED.greetDelaySec, 6);
  assert.equal(FIXED.gazeAtViewer, undefined, "오늘 /interim 무대의 시선은 deriveParams 장르 앵커 — 장르마다 달라 상수가 아니다");
  assert.equal(ADAPT_RANGES.seatDistance[0], ACT_RANGES.npcDistance[0]);
  assert.equal(ADAPT_RANGES.seatDistance[1], ACT_RANGES.npcDistance[1]);
});

test("θ̂ 가 서지 않으면 고정 연출 — θ̂ 없음 · 사건 0 · 응답 1건 · 신뢰도 0.1 · 이득 없음 모두 FIXED 와 정확히 같고 adapted=false", () => {
  const cases = [
    [null, /관객 모델 없음/],
    [{ ...SENSITIVE, n: 0, nResp: 0 }, /기록된 사건 없음/],
    [{ ...SENSITIVE, nResp: 1, confidence: 0.1 }, /응답 1\/5/],
    [{ ...SENSITIVE, nResp: 2, confidence: 0.1 }, /신뢰도 10%/],
    [{ ...SENSITIVE, g: NaN }, /이득 추정값 없음/],
  ];
  for (const [theta, re] of cases) {
    for (const genre of [...GENRES, null]) {
      const a = interimAdapt({ theta, xhatPeak: 0.9, genre });
      assert.equal(a.adapted, false, JSON.stringify(theta));
      for (const k of ["seatDistance", "approachSec", "greetDelaySec"]) assert.equal(a[k], FIXED[k], `${k} ${JSON.stringify(theta)}`);
      assert.equal(a.gazeAtViewer, (genre ? ANCHORS[genre] : ANCHORS.neutral).npcGaze, `고정 갈래의 시선은 오늘 무대(장르 앵커) 그대로 ${genre}`);
      assert.match(a.reason, re);
      assert.match(a.reason, /고정 연출$/);
      assert.equal(a.index, 0); assert.equal(a.profile, "보통"); assert.equal(a.parts, null);
      assert.deepEqual(a.times, { figureGone: T.figureGone, npcSeated: T.npcSeated, greeting: T.greeting });
    }
  }
  assert.equal(adaptBlockReason(SENSITIVE), null);
  assert.equal(adaptBlockReason({ ...MIDDLE, nResp: 2, confidence: 0.2 }), null, "응답 2건 · 신뢰도 0.2 는 경계 안");
});

test("세 합성 프로필(같은 장르 H)은 네 값이 전부 다르다 — 과민 > 보통 > 둔감(거리·걸어옴·기다림), 시선은 반대", () => {
  const S = interimAdapt({ theta: SENSITIVE, xhatPeak: PEAK.SENSITIVE, genre: "H" });
  const M = interimAdapt({ theta: MIDDLE, xhatPeak: PEAK.MIDDLE, genre: "H" });
  const B = interimAdapt({ theta: BLUNT, xhatPeak: PEAK.BLUNT, genre: "H" });
  for (const a of [S, M, B]) { assert.equal(a.adapted, true); assert.ok(inRange(a), JSON.stringify(a)); }
  for (const k of ["seatDistance", "approachSec", "greetDelaySec"]) {
    assert.ok(S[k] > M[k] && M[k] > B[k], `${k}: S ${S[k]} M ${M[k]} B ${B[k]}`);
  }
  assert.ok(S.gazeAtViewer < M.gazeAtViewer && M.gazeAtViewer < B.gazeAtViewer, `gaze S ${S.gazeAtViewer} M ${M.gazeAtViewer} B ${B.gazeAtViewer}`);
  assert.equal(S.profile, "과민"); assert.equal(M.profile, "보통"); assert.equal(B.profile, "둔감");
  // 보통(사전분포 그대로 · 봉우리 0.5)은 지수 0 → 장르 앵커 그대로
  assert.equal(M.index, 0);
  assert.equal(M.seatDistance, ANCHORS.H.npcDistance); assert.equal(M.gazeAtViewer, ANCHORS.H.npcGaze);
  assert.equal(M.approachSec, FIXED.approachSec); assert.equal(M.greetDelaySec, FIXED.greetDelaySec);
  // 과민과 둔감의 거리 차이는 눈에 띄는 크기 — 공포는 앵커 1.2 가 상한 1.4 에 가까워 0.4 m(대신 걸어옴·기다림 차이 4초 이상), 로맨스·코미디는 0.45 m 이상(둔감 프로필의 지수는 −0.68)
  assert.ok(S.seatDistance - B.seatDistance >= 0.4 - 1e-9, `${S.seatDistance} − ${B.seatDistance}`);
  assert.ok(S.approachSec - B.approachSec >= 4 && S.greetDelaySec - B.greetDelaySec >= 4, `시간 차 ${S.approachSec}/${B.approachSec} · ${S.greetDelaySec}/${B.greetDelaySec}`);
  for (const g of ["R", "C"]) {
    const s2 = interimAdapt({ theta: SENSITIVE, xhatPeak: PEAK.SENSITIVE, genre: g }), b2 = interimAdapt({ theta: BLUNT, xhatPeak: PEAK.BLUNT, genre: g });
    assert.ok(s2.seatDistance - b2.seatDistance >= 0.45, `${g}: ${s2.seatDistance} − ${b2.seatDistance}`);
  }
});

test("장르 앵커 — 같은 θ̂ 라도 공포는 로맨스보다 멀고 눈을 덜 맞춘다(directionMap ANCHORS) · 장르를 모르면 중립 앵커 · 시간은 장르와 무관", () => {
  const byG = Object.fromEntries([...GENRES, null].map((g) => [g ?? "none", interimAdapt({ theta: MIDDLE, xhatPeak: 0.5, genre: g })]));
  assert.ok(byG.H.seatDistance > byG.R.seatDistance && byG.H.gazeAtViewer < byG.R.gazeAtViewer);
  for (const g of GENRES) { assert.equal(byG[g].seatDistance, ANCHORS[g].npcDistance); assert.equal(byG[g].gazeAtViewer, ANCHORS[g].npcGaze); assert.equal(byG[g].genre, g); }
  assert.equal(byG.none.seatDistance, ANCHORS.neutral.npcDistance); assert.equal(byG.none.genre, null);
  const times = new Set(Object.values(byG).map((a) => `${a.approachSec}/${a.greetDelaySec}`));
  assert.equal(times.size, 1, [...times].join(" "));
  // 모르는 장르 문자열도 중립으로
  assert.equal(interimAdapt({ theta: MIDDLE, xhatPeak: 0.5, genre: "X" }).genre, null);
});

test("범위 — g·τ·봉우리·장르를 극단까지 훑어도 네 값이 ADAPT_RANGES 안이고, 인사는 암전 4초 전에는 나온다", () => {
  let count = 0;
  for (const g of [0.02, 0.1, 0.3, 0.6, 1, 2, 5]) for (const tau of [0, 0.5, 2, 5, 20]) for (const pk of [null, 0, 0.3, 0.5, 0.8, 1]) for (const genre of [...GENRES, null]) {
    const a = interimAdapt({ theta: { ...SENSITIVE, g, tau }, xhatPeak: pk, genre });
    assert.equal(a.adapted, true);
    assert.ok(inRange(a), JSON.stringify({ g, tau, pk, genre, a }));
    assert.ok(a.times.greeting <= T.end - ADAPT_PARAMS.END_MARGIN_SEC + 1e-9, `greeting ${a.times.greeting}`);
    assert.ok(a.times.npcSeated > T.figureGone && a.times.greeting > a.times.npcSeated);
    assert.ok(a.index >= -1 && a.index <= 1);
    count++;
  }
  assert.ok(count >= 800);
});

test("단조성 — 이득 g 가 커질수록 거리·걸어옴·기다림은 줄지 않고 시선은 늘지 않는다(τ·봉우리 고정) · τ 와 봉우리도 같은 방향", () => {
  const gs = [0.1, 0.3, 0.45, 0.6, 0.9, 1.2, 2.4];
  const rows = gs.map((g) => interimAdapt({ theta: { ...MIDDLE, g }, xhatPeak: 0.5, genre: "C" }));
  for (let i = 1; i < rows.length; i++) {
    for (const k of ["seatDistance", "approachSec", "greetDelaySec"]) assert.ok(rows[i][k] >= rows[i - 1][k] - 1e-9, `${k} g ${gs[i]}`);
    assert.ok(rows[i].gazeAtViewer <= rows[i - 1].gazeAtViewer + 1e-9, `gaze g ${gs[i]}`);
  }
  const t1 = interimAdapt({ theta: { ...MIDDLE, tau: 0.5 }, xhatPeak: 0.5, genre: "C" }), t2 = interimAdapt({ theta: { ...MIDDLE, tau: 3.5 }, xhatPeak: 0.5, genre: "C" });
  assert.ok(t2.seatDistance > t1.seatDistance && t2.approachSec > t1.approachSec, "회복이 느릴수록 멀고 천천히");
  const p1 = interimAdapt({ theta: MIDDLE, xhatPeak: 0.2, genre: "C" }), p2 = interimAdapt({ theta: MIDDLE, xhatPeak: 0.9, genre: "C" });
  assert.ok(p2.seatDistance > p1.seatDistance && p2.greetDelaySec > p1.greetDelaySec, "봉우리가 높을수록 멀고 늦게");
});

test("민감도 지수 — 사전분포 관객(g 0.6 · τ 2 · 봉우리 0.5)은 0 · 이득 두 배 = g 항 +1 · 봉우리 없으면 g·τ 만 다시 정규화 · {tension} 객체도 받는다", () => {
  assert.deepEqual(sensitivityIndex(MIDDLE, 0.5), { index: 0, parts: { g: 0, tau: 0, peak: 0 } });
  const two = sensitivityIndex({ ...MIDDLE, g: 1.2 }, 0.5);
  assert.equal(two.parts.g, 1); assert.equal(two.index, 0.5);
  const noPeak = sensitivityIndex({ ...MIDDLE, g: 1.2 }, null);
  assert.equal(noPeak.parts.peak, null); assert.equal(noPeak.index, Math.round((0.5 * 1) / 0.75 * 1000) / 1000);
  assert.deepEqual(sensitivityIndex(MIDDLE, { tension: 0.9 }), sensitivityIndex(MIDDLE, 0.9));
  assert.equal(sensitivityIndex(MIDDLE, 0.9).parts.peak, 1);
  assert.equal(sensitivityIndex({ ...MIDDLE, g: 5, tau: 20 }, 1).index, 1, "포화");
  assert.equal(sensitivityIndex({ ...MIDDLE, g: 0.02, tau: 0 }, 0).index, -1, "포화");
  assert.equal(profileLabel(0.33), "과민"); assert.equal(profileLabel(-0.33), "둔감"); assert.equal(profileLabel(0.1), "보통"); assert.equal(profileLabel(NaN), "보통");
});

test("1배속 실측 θ̂ — 공포형(응답 5/5 · 신뢰도 1)은 공포 앵커보다 멀고 늦게, 차분형(응답 1/5 · 신뢰도 0.1)은 고정 연출 → 두 관객의 거리 차이 0.4 m 이상", () => {
  const F = interimAdapt(REAL_FEARFUL), C = interimAdapt(REAL_CALM);
  assert.equal(F.adapted, true); assert.equal(C.adapted, false);
  assert.ok(F.index > 0, `fearful index ${F.index}`);
  assert.ok(F.seatDistance > ANCHORS.H.npcDistance && F.greetDelaySec > FIXED.greetDelaySec && F.gazeAtViewer < ANCHORS.H.npcGaze, JSON.stringify(F));
  assert.equal(C.seatDistance, FIXED.seatDistance);
  assert.ok(F.seatDistance - C.seatDistance >= 0.4, `${F.seatDistance} − ${C.seatDistance}`);
  assert.match(C.reason, /응답 1\/5/);
});

test("순수성 — 같은 입력은 같은 출력(deepEqual) · 입력 객체를 바꾸지 않는다 · params 덮어쓰기는 원본 ADAPT_PARAMS 를 건드리지 않는다", () => {
  const theta = { ...SENSITIVE }, peak = { tension: 0.9 };
  const snap = JSON.stringify([theta, peak]);
  const a = interimAdapt({ theta, xhatPeak: peak, genre: "R" }), b = interimAdapt({ theta, xhatPeak: peak, genre: "R" });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify([theta, peak]), snap);
  const wide = interimAdapt({ theta: SENSITIVE, xhatPeak: 0.95, genre: "R" }, { DIST_SPAN: 0.6 });
  assert.ok(wide.seatDistance > a.seatDistance);
  assert.equal(ADAPT_PARAMS.DIST_SPAN, 0.3);
  assert.ok(Object.isFrozen(ADAPT_PARAMS) && Object.isFrozen(FIXED) && Object.isFrozen(ADAPT_RANGES));
});

test("adaptText — 고정 연출은 '고정 연출 · 거리 0.9 m …' 와 이유, 바꾼 연출은 장르 이름·거리(앵커)·초·시선·성향을 담는다", () => {
  const fixed = adaptText(interimAdapt(REAL_CALM));
  assert.match(fixed, /^고정 연출 · 거리 0\.9 m · 6초 걸어와 6초 뒤 인사 · 시선 75% — 응답 1\/5/, "시선 75% = 로맨스 앵커(오늘 무대 값)");
  assert.doesNotMatch(fixed, /고정 연출$/);
  const s = adaptText(interimAdapt(REAL_FEARFUL));
  assert.match(s, /^공포 옆사람 · 거리 1\.\d\d? m\(앵커 1\.2\) · \d+(\.\d+)?초 걸어와 \d+(\.\d+)?초 뒤 인사 · 시선 \d+% · (과민|보통)\(민감도 \+0\.\d\d · 응답 5\/5 · 신뢰도 100%\)$/);
  assert.equal(adaptText(null), "");
  assert.match(adaptText(interimAdapt({ theta: MIDDLE, xhatPeak: 0.5, genre: null })), /^옆사람 · 거리 0\.9 m\(앵커 0\.9\)/);
});

test("evalActors(B170b) — 인자를 안 넘기면 오늘과 같고(seatX 1.25 · 124초 착석), seatDistance·approachSec 를 넘기면 착석 x 와 시각이 그 값대로 · adapt.times 와 일치 · 판정 전에는 무관", () => {
  const r2 = (x) => Math.round(x * 100) / 100;
  const base = evalActors(T.npcSeated + 1, { dominant: "H" });
  assert.equal(base.npc.seated, true); assert.equal(r2(base.npc.x), 1.25);
  assert.deepEqual(evalActors(T.npcSeated + 1, { dominant: "H", seatDistance: 0.9, approachSec: 6 }), base, "기본값 = 오늘 값");
  assert.deepEqual(evalActors(T.npcSeated - 0.5, { dominant: "H", seatDistance: undefined, approachSec: undefined }), evalActors(T.npcSeated - 0.5, { dominant: "H" }), "undefined 도 기본값");
  const F = interimAdapt(REAL_FEARFUL);
  const far = evalActors(F.times.npcSeated + 0.01, { dominant: "H", seatDistance: F.seatDistance, approachSec: F.approachSec });
  assert.equal(far.npc.seated, true); assert.equal(r2(far.npc.x), r2(0.35 + F.seatDistance), `과민 착석 x ${far.npc.x}`);
  assert.ok(far.npc.x - base.npc.x >= 0.4, "공포형은 오늘 값보다 0.4 m 이상 멀리 앉는다");
  const still = evalActors(T.npcSeated + 0.5, { dominant: "H", seatDistance: F.seatDistance, approachSec: F.approachSec });
  assert.equal(still.npc.seated, false); assert.equal(still.npc.walking, true, "오늘 값으로는 앉아 있을 시각에 과민 관객의 옆사람은 아직 걷는 중");
  assert.equal(evalActors(F.times.npcSeated - 0.01, { dominant: "H", seatDistance: F.seatDistance, approachSec: F.approachSec }).npc.seated, false);
  assert.equal(evalActors(T.figureGone - 0.1, { dominant: "H", seatDistance: 1.4, approachSec: 9 }).npc.visible, false, "기둥 옆 등장 전에는 보이지 않음 그대로");
  assert.equal(evalActors(130, { seatDistance: 1.4, approachSec: 3 }).npc.visible, false, "판정 전(dominant 없음)은 인자와 무관");
  // 걷는 구간의 시작점(기둥 옆)은 인자와 무관 — 반전 트릭 유지
  const a0 = evalActors(T.figureGone + 0.01, { dominant: "R", seatDistance: 0.5, approachSec: 3 }), b0 = evalActors(T.figureGone + 0.01, { dominant: "R", seatDistance: 1.4, approachSec: 9 });
  assert.ok(Math.abs(a0.npc.x - b0.npc.x) < 0.02 && Math.abs(a0.npc.z - b0.npc.z) < 0.02, `등장 지점 ${a0.npc.x},${a0.npc.z} vs ${b0.npc.x},${b0.npc.z}`);
});

// 표 — 완료 판정용(세 합성 프로필 + 1배속 실측 두 관객)
console.log("\n프로필(장르 H)        지수    거리(m)  걸어옴(s)  기다림(s)  시선   성향");
for (const [name, theta, pk] of [["과민 SENSITIVE", SENSITIVE, PEAK.SENSITIVE], ["보통 MIDDLE   ", MIDDLE, PEAK.MIDDLE], ["둔감 BLUNT    ", BLUNT, PEAK.BLUNT]]) {
  const a = interimAdapt({ theta, xhatPeak: pk, genre: "H" });
  console.log(`${name}  ${(a.index >= 0 ? "+" : "") + a.index.toFixed(2)}   ${a.seatDistance.toFixed(2)}     ${a.approachSec.toFixed(1)}        ${a.greetDelaySec.toFixed(1)}        ${a.gazeAtViewer.toFixed(2)}   ${a.profile}`);
}
console.log("1배속 실측(review51 세션)");
for (const [name, inp] of [["fearful → H   ", REAL_FEARFUL], ["calm → R      ", REAL_CALM]]) {
  const a = interimAdapt(inp);
  console.log(`${name}  ${(a.index >= 0 ? "+" : "") + a.index.toFixed(2)}   ${a.seatDistance.toFixed(2)}     ${a.approachSec.toFixed(1)}        ${a.greetDelaySec.toFixed(1)}        ${a.gazeAtViewer.toFixed(2)}   ${a.adapted ? a.profile : "고정"}  ${adaptText(a)}`);
}

console.log(`\ntest-interim-adapt: ${n} passed${process.exitCode ? " (with failures)" : ""}`);
