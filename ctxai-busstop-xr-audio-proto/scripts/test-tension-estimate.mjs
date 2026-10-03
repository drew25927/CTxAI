// 긴장 추정 회귀 테스트
import assert from "node:assert/strict";
import { estimateTensionSeries, tensionAt, peaks, TENSION_PARAMS, OBS_EPS, isObserved, isProvisional, observedSegments, xhatReading, trackingStats, xhatScopeNote, fidgetOf, recentPeak, RECENT_PEAK } from "../lib/tensionEstimate.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

const win = (t1, angVelRms = 0) => ({ t0: t1 - 2, t1, angVelRms });
const wins = (n, vel = 0) => Array.from({ length: n }, (_, i) => win((i + 1) * 2, vel));
// 반응 크기 mag = peakAmp/180 (다른 항 0). big≈0.5, small≈0.06
const bigStartle = { name: "cat", onset: 30, dur: 1, peakAmp: 90, recoverySec: 2 };   // mag 0.5
const smallStartle = { name: "cat", onset: 30, dur: 1, peakAmp: 18, recoverySec: 2 };  // mag 0.1

test("놀람 자극 뒤 봉우리, 그 뒤 하강", () => {
  const s = estimateTensionSeries({ windows: wins(30), stimuli: [bigStartle] });
  const at = (t) => s.find((p) => p.t === t).tension;
  assert.ok(at(32) > at(24), `after ${at(32)} vs before ${at(24)}`);   // 자극 직후 창에서 상승(봉우리는 onset+0.6s)
  assert.ok(at(32) > at(40), `peak-ish ${at(32)} vs later ${at(40)}`); // 이후 하강
  assert.ok(at(56) < at(32), "멀리서 더 낮다");
});

test("값은 0~1", () => {
  const s = estimateTensionSeries({ windows: wins(30, 100), stimuli: [bigStartle, { ...bigStartle, onset: 40, name: "x" }] });
  for (const p of s) assert.ok(p.tension >= 0 && p.tension <= 1, `t=${p.t} ${p.tension}`);
});

test("조용하면(자극·움직임 없음) 바닥 긴장 근처", () => {
  const s = estimateTensionSeries({ windows: wins(10), stimuli: [] });
  for (const p of s) assert.ok(Math.abs(p.tension - TENSION_PARAMS.BASE) < 1e-6, `${p.tension}`);
});

test("큰 반응이 작은 반응보다 봉우리가 높다", () => {
  const big = tensionAt([bigStartle], 30.6);
  const small = tensionAt([smallStartle], 30.6);
  assert.ok(big > small, `big ${big} small ${small}`);
});

test("느린 회복(τ 큼)이 나중에 더 높게 남는다", () => {
  const fast = tensionAt([{ ...bigStartle, recoverySec: 1 }], 36);
  const slow = tensionAt([{ ...bigStartle, recoverySec: 4 }], 36);
  assert.ok(slow > fast, `slow ${slow} fast ${fast}`);
});

test("예감: preLook 이면 자극 전에 이미 조금 오른다", () => {
  const withAnt = tensionAt([{ ...bigStartle, preLook: 1 }], 28);   // onset 30, 2초 전
  const without = tensionAt([{ ...bigStartle, preLook: 0 }], 28);
  assert.ok(withAnt > without, `ant ${withAnt} none ${without}`);
});

test("예감(B158 후속): preTurn 이 있으면 preLook 대신 그것 — 원래 그쪽을 보던 관객(preLook 1 · preTurn 0)은 오르지 않는다", () => {
  const turned = tensionAt([{ ...bigStartle, preLook: 1, preTurn: 1 }], 28);
  const staring = tensionAt([{ ...bigStartle, preLook: 1, preTurn: 0 }], 28);
  assert.ok(turned > TENSION_PARAMS.BASE + 0.05, `turned ${turned}`);
  assert.equal(staring, TENSION_PARAMS.BASE);
});

test("예감(B195): 직전에 돌려 놓고 보기만 한 관객(preTurn 1 · responded 0)은 예감 봉우리도 없다 — 반응했으면(responded 1) 그대로 오른다", () => {
  // 검토 턴 44 재현: 1배속 /interim 차분형 물보라에 preTurn 1 · responded 0 → onset 직전 fromStim 0.147·0.18 로 "관측" 창이 생겼다
  const watched = { name: "truckSplash", kind: "probe", onset: 35, dur: 2.5, peakAmp: 0.6, maxVel: 2.4, lookSec: 3.92, retreat: 0, preLook: 1, preTurn: 1, atOnset: 1, responded: 0 };
  assert.equal(tensionAt([watched], 34), TENSION_PARAMS.BASE, "자극 1초 전");
  const s = estimateTensionSeries({ windows: wins(30), stimuli: [watched] });
  assert.ok(s.every((p) => p.fromStim === 0), `예감 봉우리 ${Math.max(...s.map((p) => p.fromStim))}`);
  assert.ok(s.every((p) => !isObserved(p)), "사건 사이로만 읽힌다");
  const reacted = tensionAt([{ ...bigStartle, preTurn: 1, responded: 1 }], 28);
  assert.ok(reacted > TENSION_PARAMS.BASE + 0.05, `반응한 사건의 예감 ${reacted}`);
});

test("반응하지 않은 사건(B158): responded 0 이면 응시(lookSec)가 길어도 봉우리가 없다 — responded 가 없으면 예전처럼", () => {
  // 1배속 /interim 차분형 S2 물보라: 편차 0.6° · 2.4°/s · 응시 3.92초(사건 2.5초) · preLook 1 · preTurn 0 → 예전 x̂ 0.31(카드 '가장 크게 반응')
  const watched = { name: "truckSplash", kind: "probe", onset: 35, dur: 2.5, peakAmp: 0.6, maxVel: 2.4, lookSec: 3.92, retreat: 0, preLook: 1, preTurn: 0, atOnset: 1, responded: 0 };
  const s = estimateTensionSeries({ windows: wins(30), stimuli: [watched] });
  assert.ok(s.every((p) => p.fromStim === 0), `봉우리 ${Math.max(...s.map((p) => p.fromStim))}`);
  const legacy = { ...watched, responded: undefined, preTurn: undefined };
  assert.ok(Math.max(...estimateTensionSeries({ windows: wins(30), stimuli: [legacy] }).map((p) => p.tension)) > 0.3, "옛 레코드 모양은 예전 값(0.31)");
});

test("잔움직임이 크면 긴장 바닥이 올라간다", () => {
  const still = estimateTensionSeries({ windows: wins(4, 0), stimuli: [] }).at(-1).tension;
  const moving = estimateTensionSeries({ windows: wins(4, 60), stimuli: [] }).at(-1).tension;
  assert.ok(moving > still, `moving ${moving} still ${still}`);
});

test("peaks: 봉우리 시각에 가까운 자극 이름", () => {
  const s = estimateTensionSeries({ windows: wins(40), stimuli: [bigStartle] });
  const pk = peaks(s, [bigStartle]);
  assert.ok(pk.length >= 1, "봉우리 있음");
  assert.equal(pk[0].near, "cat");
});

// B149 — 관측 범위: 사건 사이 창은 "측정 밖" 으로 가르고, 추종 요약은 전체·관측 창을 따로 센다
test("isObserved: 사건 기여가 OBS_EPS 이상이면 관측, 바닥값이면 사건 사이, fromStim 없으면 관측", () => {
  const s = estimateTensionSeries({ windows: wins(40), stimuli: [bigStartle] });
  const at = (t) => s.find((p) => p.t === t);
  assert.ok(isObserved(at(32)), `봉우리 직후 ${at(32).fromStim}`);
  assert.ok(!isObserved(at(20)), `자극 전 ${at(20).fromStim}`);
  assert.ok(!isObserved(at(60)), `오래 뒤 ${at(60).fromStim}`);
  assert.ok(isObserved({ t: 1, tension: 0.4 }), "fromStim 없는 외부 계열은 관측으로");
  assert.ok(OBS_EPS > 0 && OBS_EPS < 0.1);
});

test("observedSegments: 관측·사건 사이 구간이 번갈아 나오고 경계 점을 공유한다", () => {
  const s = estimateTensionSeries({ windows: wins(40), stimuli: [bigStartle] });
  const segs = observedSegments(s);
  assert.deepEqual(segs.map((g) => g.observed), [false, true, false]);
  assert.equal(segs[1].points[0], segs[0].points.at(-1), "앞 구간 마지막 점 = 뒤 구간 첫 점");
  assert.equal(segs[2].points[0], segs[1].points.at(-1));
  assert.equal(segs.reduce((k, g, i) => k + g.points.length - (i ? 1 : 0), 0), s.length, "공유 점을 빼면 원래 점 수");
  assert.deepEqual(observedSegments([]), []);
});

test("xhatReading: 사건 사이는 목표보다 한참 아래여도 'below' 가 아니라 'between'", () => {
  const base = { t: 80, tension: 0.18, fromStim: 0 };
  assert.equal(xhatReading(base, { target: 0.67, tol: 0.12 }).state, "between");
  assert.equal(xhatReading(base, { target: 0.67, tol: 0.12 }).label, "사건 사이");
  assert.equal(xhatReading({ ...base, fromStim: 0.2 }, { target: 0.67, tol: 0.12 }).state, "below");
  assert.equal(xhatReading({ t: 1, tension: 0.9, fromStim: 0.7 }, { target: 0.67, tol: 0.12 }).state, "above");
  assert.equal(xhatReading({ t: 1, tension: 0.6, fromStim: 0.4 }, { target: 0.67, tol: 0.12 }).state, "in");
  assert.equal(xhatReading({ t: 1, tension: 0.6, fromStim: 0.4 }, {}).state, "none", "목표 없음(/interim)");
  assert.equal(xhatReading(null).state, "none");
});

test("trackingStats: 구간 안 창만 세고, 관측 창의 허용폭 안을 따로 센다", () => {
  const s = estimateTensionSeries({ windows: wins(40), stimuli: [bigStartle] });
  const flat = () => ({ target: 0.6, tol: 0.1 });
  const all = trackingStats(s, flat);
  assert.equal(all.n, s.length);
  assert.ok(all.observed > 0 && all.observed < all.n, `관측 ${all.observed}/${all.n}`);
  assert.ok(all.observedInTol <= all.observed && all.inTol <= all.n);
  assert.equal(all.meanTarget, 0.6);
  const quiet = trackingStats(s, flat, { t0: 50, t1: 80 });
  assert.equal(quiet.observed, 0, "자극 20초 뒤는 사건 사이뿐");
  assert.equal(quiet.inTol, 0, "바닥 0.12 는 목표 0.6±0.1 밖");
  assert.equal(quiet.maxObservedXhat, null);
  assert.equal(trackingStats([], flat).n, 0);
  assert.equal(trackingStats([], flat).meanXhat, null);
});

test("xhatScopeNote: 장면에서만, 제어 ON 이면 연속 구동이 측정 밖이라고 밝힌다", () => {
  assert.equal(xhatScopeNote({ scene: false, control: true }), null);
  // B189 — "사건 반응만 잰다" 는 코드와 달랐다(사건 사이 창에도 잔움직임 항). 식 그대로 밝힌다
  assert.match(xhatScopeNote({ scene: true, control: true }), /사건 반응 \+ 잔움직임.*연속 구동.*측정 밖/);
  assert.match(xhatScopeNote({ scene: true, control: false }), /사건 반응 \+ 잔움직임.*측정 밖/);
  assert.doesNotMatch(xhatScopeNote({ scene: true, control: true }), /반응만/);
  assert.doesNotMatch(xhatScopeNote({ scene: true, control: false }), /연속 구동/);
});

// B150 — 창 끝 한 점이 아니라 창 안 최댓값. 회복이 빠른 큰 반응(recoverySec 0.1)이 창 끝에서 사라지던 문제
// 턴 32 재완주의 미세 자극 세 개(peakAmp 58.6·107.9·107.2, maxVel ~500°/s) 모양 — 1배속 2초 창 끝과 봉우리의 거리는 실행마다 다르다
const fastMicro = (name, onset, peakAmp, recoverySec) => ({ name, onset, dur: 1.5, kind: "probe", peakAmp, maxVel: 500, recoverySec });
const scene = [fastMicro("micro-1", 68, 58.6, 0.1), fastMicro("micro-2", 97.13, 107.9, 0.46), fastMicro("micro-3", 120.67, 107.2, 0.1)];
const sceneWins = Array.from({ length: 50 }, (_, i) => win(60 + (i + 1) * 2.05)); // 창 끝이 봉우리와 어긋나는 간격

test("창 안 최댓값: 회복 0.1초짜리 큰 반응도 봉우리를 품은 창에서 관측된다", () => {
  const s = estimateTensionSeries({ windows: sceneWins, stimuli: scene });
  for (const st of scene) {
    const pk = st.onset + TENSION_PARAMS.RISE_SEC;
    const p = s.find((q) => q.t >= pk);
    assert.ok(isObserved(p), `${st.name} 창 끝 ${p.t} fromStim ${p.fromStim}`);
    // B152 뒤 각속도 항이 포화해 micro-1(58.6°) 봉우리는 0.68, micro-2·3(107°)은 0.93 — 옛 규칙에선 셋 다 1.0 에 잘렸다. 판정 기준은 "창 안에서 봉우리가 보이는가"
    assert.ok(p.tension >= 0.65, `${st.name} 봉우리 ${p.tension}`);
    assert.ok(Math.abs(p.tPeak - pk) < 0.01, `${st.name} tPeak ${p.tPeak} vs ${pk}`);
  }
  // 옛 방식(창 끝 한 점)은 봉우리와 창 끝의 위상에 따라 놓친다 — 이 간격에서는 micro-1(τ 0.1, 창 끝이 봉우리 1.65초 뒤)
  const missed = scene.filter((st) => { const p = s.find((q) => q.t >= st.onset + TENSION_PARAMS.RISE_SEC); return tensionAt(scene, p.t) - TENSION_PARAMS.BASE < OBS_EPS; });
  assert.ok(missed.length >= 1, "옛 방식이 하나도 놓치지 않으면 이 테스트는 B150 을 막지 못한다");
  const pk = peaks(s, scene).filter((p) => p.t >= 68 && p.t <= 150);
  assert.deepEqual(pk.map((p) => p.near), ["micro-1", "micro-2", "micro-3"], JSON.stringify(pk));
});

test("창 안 최댓값: 격자로 훑은 최댓값과 같다(커널 조각마다 볼록 → 후보 시각만으로 정확)", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 40; k++) {
    const st = Array.from({ length: 4 }, (_, j) => ({ name: `s${j}`, onset: 10 + rnd() * 8, dur: 1, peakAmp: rnd() * 40, preLook: rnd() < 0.5 ? rnd() : 0, recoverySec: rnd() < 0.3 ? null : 0.05 + rnd() * 3 }));
    const w = { t0: 12 + rnd() * 4, t1: 0, angVelRms: 0 }; w.t1 = w.t0 + 2;
    const got = estimateTensionSeries({ windows: [w], stimuli: st })[0].fromStim;
    let brute = -Infinity;
    for (let t = w.t0; t <= w.t1 + 1e-9; t += 0.001) brute = Math.max(brute, tensionAt(st, t) - TENSION_PARAMS.BASE);
    // tensionAt 은 0~1 로 자르므로 자르지 않은 범위에서만 견준다
    if (brute + TENSION_PARAMS.BASE < 0.999) assert.ok(got >= brute - 2e-3, `k=${k} 후보 ${got} < 격자 ${brute}`);
  }
});

test("창 안 최댓값: 앞 창 끝~이 창 시작 틈의 봉우리도 이 창이 잡는다, t0 없는 창은 창 끝 한 점(예전)", () => {
  const st = [{ name: "gap", onset: 3.35, dur: 1, peakAmp: 90, maxVel: 400, recoverySec: 0.05 }]; // 봉우리 3.95
  const s = estimateTensionSeries({ windows: [{ t0: 2, t1: 3.9 }, { t0: 4, t1: 6 }], stimuli: st });
  assert.ok(isObserved(s[1]) && s[1].tPeak === 3.95, JSON.stringify(s[1]));
  const bare = estimateTensionSeries({ windows: [{ t1: 6 }], stimuli: st })[0];
  assert.equal(bare.tension, tensionAt(st, 6), "t0 없으면 t1 한 점");
});

test("진행 중 자극(B153): active 잠정 레코드가 계열에 더해져 닫히기 전에 봉우리가 보이고, 그 점은 fromActive·isProvisional 로 구별된다", () => {
  const w = wins(20); // 창 끝 2..40
  const prov = { name: "micro-1", onset: 30.2, dur: 1.5, peakAmp: 60, maxVel: 200, lookSec: 0.8, responded: 1, recoverySec: null, provisional: 1, elapsed: 1.8 };
  const closedOnly = estimateTensionSeries({ windows: w, stimuli: [] });
  const withActive = estimateTensionSeries({ windows: w, stimuli: [], active: [prov] });
  const at = (s, t) => s.find((p) => p.t === t);
  assert.ok(Math.abs(at(closedOnly, 32).tension - TENSION_PARAMS.BASE) < 1e-6, "닫힌 레코드만 보면 바닥");
  assert.ok(at(withActive, 32).tension > 0.5, `잠정 포함 봉우리 ${at(withActive, 32).tension}`);
  assert.ok(isProvisional(at(withActive, 32)) && at(withActive, 32).fromActive >= OBS_EPS, JSON.stringify(at(withActive, 32)));
  assert.ok(isObserved(at(withActive, 32)), "잠정 반응도 관측(사건 반응 몫)이다");
  assert.equal(at(withActive, 20).fromActive, 0, "자극 전 창은 잠정 몫 0");
  assert.ok(!isProvisional(at(withActive, 20)));
  for (const p of closedOnly) assert.equal(p.fromActive, undefined, "active 를 주지 않으면 필드도 없다(예전과 같은 결과)");
  // 같은 레코드가 닫혀 stimuli 로 옮겨 가면 값은 같고 잠정 표시만 사라진다(recoverySec 이 그대로 null 일 때)
  const closed = estimateTensionSeries({ windows: w, stimuli: [{ ...prov, provisional: undefined, elapsed: undefined }] });
  assert.equal(at(closed, 32).tension, at(withActive, 32).tension);
  assert.equal(at(closed, 32).fromActive, undefined);
  assert.ok(!isProvisional(at(closed, 32)));
});

test("xhatReading(B159): 진행 중 사건이 있으면 바닥 x̂ 를 '사건 사이' 가 아니라 '<사건> 진행 중' 으로, 잠정 반응이면 상태는 그대로 두고 '잠정' 을 붙인다", () => {
  const floor = { t: 40, tension: 0.12, fromStim: 0, fidget: 0 };
  assert.deepEqual(xhatReading(floor, { target: 0.5, tol: 0.1 }), { state: "between", label: "사건 사이", provisional: false });
  assert.deepEqual(xhatReading(floor, { target: 0.5, tol: 0.1, active: ["S1"] }), { state: "between", label: "S1\u00a0진행\u00a0중", provisional: false });
  assert.equal(xhatReading(floor, { active: ["S1", "S2"] }).label, "S1·S2\u00a0진행\u00a0중"); // NBSP — 패널에서 "진행 / 중" 으로 안 갈리게
  assert.equal(xhatReading(floor, { active: [] }).label, "사건 사이");
  const prov = { t: 40, tension: 0.8, fromStim: 0.68, fromActive: 0.68, fidget: 0 };
  assert.deepEqual(xhatReading(prov, { target: 0.5, tol: 0.1, active: ["먼 문 소리"] }), { state: "above", label: "잠정", provisional: true });
  assert.deepEqual(xhatReading(prov, { active: ["먼 문 소리"] }), { state: "none", label: "잠정", provisional: true }); // /interim 은 목표 없음
  const fixed = { t: 40, tension: 0.8, fromStim: 0.68, fromActive: 0, fidget: 0 };
  assert.deepEqual(xhatReading(fixed, { target: 0.5, tol: 0.1, active: ["S1"] }), { state: "above", label: "", provisional: false }); // 닫힌 반응 + 다른 사건 진행 중
  assert.deepEqual(xhatReading({ t: 40, tension: 0.8, fromStim: 0.68 }, { target: 0.9, tol: 0.05 }), { state: "below", label: "", provisional: false }); // 옛 계열(fromActive 없음)
  assert.equal(xhatReading(null, { active: ["S1"] }).state, "none");
});

test("잔움직임 항(B152): 사건 관측 안에 든 창은 그 비율만큼 뺀다 — stimRatio 1 이면 0, 0 이면 그대로, 없는 옛 창은 그대로 · 사건 창의 고개 돌림이 봉우리 위에 두 번 얹히지 않는다", () => {
  const P = TENSION_PARAMS;
  assert.ok(Math.abs(fidgetOf({ angVelRms: 115, stimRatio: 1 }) - 0) < 1e-9);
  assert.ok(Math.abs(fidgetOf({ angVelRms: 115, stimRatio: 0 }) - P.FID) < 1e-9);
  assert.ok(Math.abs(fidgetOf({ angVelRms: 115 }) - P.FID) < 1e-9, "stimRatio 없는 옛 창");
  assert.ok(Math.abs(fidgetOf({ angVelRms: 15, stimRatio: 0.5 }) - P.FID * 0.5 * 0.5) < 1e-9);
  // 1배속 공포형 poster 창 모양: 사건 반응 fromStim 0.80 + 바닥 0.12 = 0.92 — 옛 규칙은 각속도 RMS 115 의 잔움직임 0.15 가 더해져 1.0 에 잘렸다
  const st = [{ name: "poster", kind: "probe", onset: 6.0, dur: 3, peakAmp: 60.7, maxVel: 489, lookSec: 2.39, retreat: 0.03, responded: 1, recoverySec: 1.19 }];
  const w = [{ t0: 4, t1: 6, angVelRms: 9, stimRatio: 0 }, { t0: 6, t1: 8, angVelRms: 115, stimRatio: 0.97 }, { t0: 8, t1: 10, angVelRms: 31, stimRatio: 1 }];
  const s = estimateTensionSeries({ windows: w, stimuli: st });
  assert.ok(s[1].tension < 0.999 && s[1].tension > 0.85, `poster 봉우리 ${s[1].tension} (잘리지 않음)`);
  assert.ok(s[1].fidget < 0.01, `사건 창 잔움직임 ${s[1].fidget}`);
  const old = estimateTensionSeries({ windows: w.map((x) => ({ ...x, stimRatio: undefined })), stimuli: st });
  assert.ok(old[1].fidget > 0.14 && old[1].tension > s[1].tension, "옛 창(stimRatio 없음)은 예전처럼 더해진다");
});

test("최근 봉우리(B216): 가장 최근 국소 최댓값을 hold 초 동안 이름·경과와 함께 남긴다 — 마지막 점(오르는 중)도 후보 · 사건 사이 바닥·작은 봉우리는 없음 · 배속 무관한 실제 초", () => {
  const s = [{ t: 2, tension: 0.12, fromStim: 0 }, { t: 4, tension: 0.5, fromStim: 0.38 }, { t: 6, tension: 1.0, fromStim: 0.88, tPeak: 5.2, fromActive: 0.88 }, { t: 8, tension: 0.3, fromStim: 0.18 }, { t: 10, tension: 0.13, fromStim: 0.01 }];
  const st = [{ name: "micro-1", onset: 4.0, dur: 1.5 }, { name: "poster", onset: 20, dur: 3 }];
  assert.deepEqual(recentPeak(s, st, { tNow: 6 }), { t: 6, tPeak: 5.2, tension: 1, name: "micro-1", ago: 0.8, provisional: true, current: true, rising: false }); // 마지막 점이지만 창 안 꼭대기(5.2)가 지났다 → 봉우리
  assert.deepEqual(recentPeak(s, st, { tNow: 10 }), { t: 6, tPeak: 5.2, tension: 1, name: "micro-1", ago: 4.8, provisional: true, current: false, rising: false }); // 내려온 뒤에도 남는다
  assert.equal(recentPeak(s, st, { tNow: 12 }).ago, 6.8); // 봉우리 점(t 6) 뒤 6초까지
  assert.equal(recentPeak(s, st, { tNow: 12.1 }), null, "hold 6초가 지나면 없음");
  assert.equal(RECENT_PEAK.HOLD_SEC, 6);
  assert.equal(recentPeak(s, [], { tNow: 8 }).name, null, "자극 목록이 없으면 이름 없이");
  assert.equal(recentPeak(s, [{ name: "poster", onset: 5.9, dur: 3 }], { tNow: 8 }).name, null, "봉우리 시각(5.2)보다 0.5초 넘게 늦게 시작한 자극은 아니다");
  assert.equal(recentPeak(s, [{ name: "poster", onset: 5.4, dur: 3 }], { tNow: 8 }).name, "poster", "0.5초 안이면(창 끝에 찍힌 tPeak 의 오차) 그 자극");
  assert.equal(recentPeak([{ t: 2, tension: 0.12, fromStim: 0 }, { t: 4, tension: 0.27, fromStim: 0 }], st, { tNow: 4 }), null, "사건 사이 잔움직임(fromStim 0)은 봉우리가 아니다");
  assert.equal(recentPeak([{ t: 2, tension: 0.12, fromStim: 0 }, { t: 4, tension: 0.2, fromStim: 0.08 }], st, { tNow: 4 }), null, "바닥 위 0.1 미만은 봉우리가 아니다");
  // 봉우리가 둘이면 최근 것 — 앞 봉우리가 더 커도
  const two = [{ t: 2, tension: 1.0, fromStim: 0.88 }, { t: 4, tension: 0.4, fromStim: 0.28 }, { t: 6, tension: 0.7, fromStim: 0.58 }, { t: 8, tension: 0.3, fromStim: 0.18 }];
  assert.equal(recentPeak(two, [{ name: "cat", onset: 1 }, { name: "frog", onset: 5.5 }], { tNow: 8 }).name, "frog");
  // 상한 1.0 평평한 봉우리는 뒤쪽 점(가장 늦은 시각)
  const flat = [{ t: 2, tension: 0.5, fromStim: 0.38 }, { t: 4, tension: 1.0, fromStim: 0.9 }, { t: 6, tension: 1.0, fromStim: 0.95 }, { t: 8, tension: 0.4, fromStim: 0.28 }];
  assert.equal(recentPeak(flat, [], { tNow: 8 }).t, 6);
  assert.equal(recentPeak([], st, { tNow: 8 }), null);
});

test("최근 봉우리 rising(B235): 마지막 점의 창 안 최댓값이 창 끝에 있으면(커널 꼭대기가 창 뒤) 봉우리가 아니라 오르는 중 — 다음 창이 닫히면 그 점이 봉우리", () => {
  // 1배속 물보라: 창 끝 직전에 시작한 자극 → 창 끝 값 0.22 는 오르는 중, 다음 창 최댓값 0.96 이 봉우리
  const st = [{ name: "splash", onset: 3.9, dur: 1.2 }];
  const rise = [{ t: 2, tension: 0.12, fromStim: 0, tPeak: 2 }, { t: 4, tension: 0.22, fromStim: 0.1, tPeak: 4, fromActive: 0.1 }];
  const a = recentPeak(rise, st, { tNow: 4.5 });
  assert.equal(a.rising, true); assert.equal(a.current, true); assert.equal(a.name, "splash"); assert.equal(a.tension, 0.22);
  const next = [...rise, { t: 6, tension: 0.96, fromStim: 0.84, tPeak: 4.3 }];
  const b = recentPeak(next, st, { tNow: 6 });
  assert.equal(b.rising, false, "창 안 꼭대기 4.3 < 창 끝 6 → 봉우리"); assert.equal(b.current, true); assert.equal(b.tension, 0.96);
  assert.equal(recentPeak([...next, { t: 8, tension: 0.3, fromStim: 0.18, tPeak: 6 }], st, { tNow: 8 }).rising, false, "내려온 뒤는 current 도 rising 도 아님");
  assert.equal(recentPeak(rise, st, { tNow: 4.5 }).ago, 0.5, "rising 이어도 ago 는 창 끝 기준(모니터는 안 적는다)");
  // 0.01 반올림 오차 — tPeak 3.995 → 4 로 반올림된 값도 창 끝
  assert.equal(recentPeak([{ t: 2, tension: 0.12, fromStim: 0, tPeak: 2 }, { t: 4.004, tension: 0.22, fromStim: 0.1, tPeak: 4 }], st, { tNow: 4.5 }).rising, true);
  // 상한 1.0 에 닿은 마지막 점 — 꼭대기가 창 안(tPeak < t)이면 rising 아님(B216 "최근 봉우리 1.00 · 먼 문 소리 · 지금" 그대로)
  assert.equal(recentPeak([{ t: 2, tension: 0.12, fromStim: 0, tPeak: 2 }, { t: 4, tension: 1, fromStim: 0.9, tPeak: 2.4 }], [{ name: "micro-1", onset: 2.2, dur: 1 }], { tNow: 4 }).rising, false);
  // 상한 1.0 에 닿은 점은 창 끝이어도 rising 아님 — 더 오를 수 없다(1배속 비명: 창 끝 1.00 → "최근 봉우리 1.00 · 비명 · 지금")
  assert.equal(recentPeak([{ t: 2, tension: 0.12, fromStim: 0, tPeak: 2 }, { t: 4, tension: 1, fromStim: 0.95, tPeak: 4 }], [{ name: "scream", onset: 3.9, dur: 1 }], { tNow: 4 }).rising, false);
  // 옛 점(tPeak 없음)은 tPeak = t 라 마지막 점이면 rising — 저장 세션에는 tPeak 가 늘 있어 실제로는 안 생긴다
  assert.equal(recentPeak([{ t: 2, tension: 0.12, fromStim: 0 }, { t: 4, tension: 0.5, fromStim: 0.38 }], st, { tNow: 4 }).rising, true);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
