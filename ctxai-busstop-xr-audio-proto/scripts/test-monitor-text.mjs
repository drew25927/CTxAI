// 모니터 문구 회귀 테스트(B65·B154) — 라벨과 숫자가 다른 줄로 갈리지 않고, 도달 점수 줄이 트랙 변경으로 읽히지 않는다
import assert from "node:assert/strict";
import { glueNumbers, pair, reachText, reachParts, actuateLine, ACT_MODE, goalRowText, NO_TARGET_LABEL } from "../lib/monitorText.js";
import { xhatReading } from "../lib/tensionEstimate.js";
import { actuationFor, offsetsFor, actuationText } from "../lib/controlActuate.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

const NB = " ";

test("glueNumbers: 라벨과 숫자·부호 사이 공백만 줄바꿈 없는 공백으로", () => {
  const s = glueNumbers("이득 1.13 · 지연 0.153s · 습관화 −0.055 · u +0.80 · BGM ×1.28");
  assert.equal(s, `이득${NB}1.13 · 지연${NB}0.153s · 습관화${NB}−0.055 · u${NB}+0.80 · BGM${NB}×1.28`);
  assert.ok(s.includes(" · "), "구분자 주변 공백은 그대로");
});

test("glueNumbers: 단어 사이 공백은 건드리지 않는다 (미룸 사유·괄호 안 숫자)", () => {
  assert.equal(glueNumbers("질문 뒤 응답 대기 중 → 조용한 틈(3초 이상)까지 미룸"), "질문 뒤 응답 대기 중 → 조용한 틈(3초 이상)까지 미룸");
  assert.equal(glueNumbers("사건 사이(x̂ 0.17) < 목표 0.66−0.11 · 대사 중"), `사건 사이(x̂${NB}0.17) < 목표${NB}0.66−0.11 · 대사 중`);
  assert.equal(glueNumbers("간격 대기 11s (직전 1:39)"), `간격 대기${NB}11s (직전${NB}1:39)`);
  assert.equal(glueNumbers(null), null);
  assert.equal(glueNumbers(""), "");
});

// B65 재작업(검토 턴 38) — 위 테스트는 입력에 U+2212 를 써서 ASCII "-" 결함을 가렸다. 모니터가 실제로 만드는 문자열로 확인한다
test("glueNumbers: 템플릿 리터럴의 ASCII 음수(θ̂ 습관화 ρ)도 라벨과 붙이고 부호를 U+2212 로 맞춘다", () => {
  const theta = { g: 1.13, L: 0.153, tau: 0.848, rho: -0.055 };
  const s = glueNumbers(`이득 ${theta.g} · 지연 ${theta.L}s · 회복 ${theta.tau}s · 습관화 ${theta.rho}`);
  assert.equal(s, `이득${NB}1.13 · 지연${NB}0.153s · 회복${NB}0.848s · 습관화${NB}−0.055`);
  assert.ok(!/ -|-0/.test(s), "ASCII 음수·보통 공백이 남지 않는다");
});
test("glueNumbers: 연속 구동 줄(controlActuate 의 ASCII 부호)도 붙는다 — 공포 트랙 각성의 시선은 늘 음수", () => {
  const off = offsetsFor("H", 0.8);
  assert.ok(off.npcGaze < 0, "H 각성은 시선을 줄인다(전제)");
  const raw = `u ${(-0.1).toFixed(2)} · ${actuationText(off)}`;
  assert.match(raw, / -0\.10 /, "생성 문자열은 ASCII '-' (전제)");
  const s = glueNumbers(raw);
  assert.ok(s.startsWith(`u${NB}−0.10 · `), s);
  assert.match(s, new RegExp(`시선${NB}−\\d+%`), s);
  assert.ok(!s.includes(" -") && !s.includes(`${NB}-`), s);
});
test("glueNumbers: 숫자 사이 '-'(날짜·범위)와 값 없음 표시 '-' 는 그대로", () => {
  assert.equal(glueNumbers("09-29 21:21 · 범위 0.4-2.5"), `09-29${NB}21:21 · 범위${NB}0.4-2.5`);
  assert.equal(glueNumbers("목표 - · x̂ -"), "목표 - · x̂ -");
  assert.equal(glueNumbers("(-0.1)"), "(−0.1)");
  assert.equal(glueNumbers("-0.5"), "−0.5");
  assert.equal(glueNumbers(`비교 −0.12`), `비교${NB}−0.12`, "이미 U+2212 인 비교 화면 문자열은 그대로 붙이기만");
});

test("actuateLine: 장면 안은 모드 + u·축, 장면 끝(ended)은 '유지 u 0.00' 이 아니라 '장면 끝' (B135)", () => {
  const act = actuationFor({ xhat: 0.2, target: 0.65, tol: 0.1, track: "H", theta: null, prev: { u: 0.5 }, dt: 0.25 });
  const l = actuateLine(act);
  assert.equal(l.head, "각성");
  assert.ok(l.body.startsWith(`u${NB}+0.`), l.body);
  // 되돌림 계산(xhat null)은 mode hold — 페이지가 return/ended 로 바꾼다. 그 두 값이 "유지" 로 적히지 않아야 한다
  const back = actuationFor({ xhat: null, target: 0, tol: 0, track: "H", prev: { u: 0.02 }, dt: 0.25 });
  assert.equal(back.mode, "hold", "전제: 되돌림 분기의 원래 mode");
  assert.equal(back.u, 0);
  const ended = actuateLine({ ...back, mode: "ended" });
  assert.deepEqual(ended, { head: "장면 끝", body: "· 구동 0(기본 연출)" });
  assert.ok(!JSON.stringify(ended).includes("유지") && !JSON.stringify(ended).includes("u 0.00"));
  const ret = actuateLine({ ...actuationFor({ xhat: null, target: 0, tol: 0, track: "H", prev: { u: 0.6 }, dt: 0.25 }), mode: "return" });
  assert.equal(ret.head, ACT_MODE.return);
  assert.match(ret.body, new RegExp(`^u${NB}\\+0\\.`));
  assert.equal(actuateLine({ ...act, mode: "settle", settleLeft: 3.27 }).head, "자극 뒤 멈춤 3.3s");
  assert.equal(actuateLine(null), null);
});

test("pair: 라벨과 값을 줄바꿈 없는 공백으로 잇는다", () => {
  assert.equal(pair("회복", "0.848s"), `회복${NB}0.848s`);
});

const SEL = { track: "H", reach: { R: 0.777, H: 0.926, C: 0.85 } };

test("reachText: 최고가 현재 트랙과 같으면 '참고' 만 — 화살표 없음", () => {
  const s = reachText(SEL, "H");
  assert.equal(s, `도달 점수 R${NB}0.777 · H${NB}0.926 · C${NB}0.85 · 최고${NB}H(참고)`);
  assert.ok(!s.includes("→"));
});

test("reachText: 현재 R 인데 선택이 H 면 '현재 R 유지' 를 붙인다 (B154 · b116r 프레임)", () => {
  const s = reachText(SEL, "R");
  assert.equal(s, `도달 점수 R${NB}0.777 · H${NB}0.926 · C${NB}0.85 · 최고${NB}H(참고 · 현재${NB}R 유지)`);
  assert.ok(!s.includes("→"));
});

// bias=R:6 1배속 완주(b139/onr): 도달 점수는 H 가 최고인데 selectTrack 은 성향(0.3)을 섞어 R 을 골랐다 — "최고 R" 로 적으면 거짓
const SEL_PULLED = { track: "R", reach: { R: 0.869, H: 0.947, C: 0.89 } };
test("reachText: 성향 반영 선택이 도달 점수 최고와 다르면 둘 다 적는다", () => {
  assert.equal(reachText(SEL_PULLED, "R"), `도달 점수 R${NB}0.869 · H${NB}0.947 · C${NB}0.89 · 최고${NB}H · 성향 반영 선택${NB}R(참고)`);
  assert.equal(reachText(SEL_PULLED, "H"), `도달 점수 R${NB}0.869 · H${NB}0.947 · C${NB}0.89 · 최고${NB}H · 성향 반영 선택${NB}R(참고 · 현재${NB}H 유지)`);
  assert.deepEqual(reachParts(SEL_PULLED), { best: "H", pick: "R", scores: `R${NB}0.869 · H${NB}0.947 · C${NB}0.89` });
});

test("reachText: 판정 전 배합 객체(B92)·현재 없음이면 유지 문구를 붙이지 않는다", () => {
  assert.match(reachText(SEL, { R: 0.4, H: 0.35, C: 0.25 }), /최고\u00A0H\(참고\)$/);
  assert.match(reachText(SEL, null), /최고\u00A0H\(참고\)$/);
  assert.match(reachText(SEL, undefined), /최고\u00A0H\(참고\)$/);
});

test("reachText: sel 없음 → null", () => {
  assert.equal(reachText(null, "H"), null);
  assert.equal(reachText({ track: "H" }, "H"), null);
});

// B227 — 목표 곡선이 없는 구간(/interim 전체 · /film 판정 전)에서 진행 중 탐침은 왼쪽에 한 번만. 1배속 /interim S1 구간(0:15~1:53)은 왼쪽
// "목표 곡선 없음(중립 탐침)" + 오른쪽 "추정 x̂ 0.12 · S1 진행 중" 이 292px 를 넘어 행이 36px(두 줄)였다(b216/interim-samples.jsonl 30/67 표본)
const WJ = "\u2060";
test("goalRowText: 목표 없음 + 탐침 진행 중 → 왼쪽 '중립 탐침 S1 진행 중', 오른쪽 꼬리표 없음", () => {
  const reading = xhatReading({ tension: 0.12, fromStim: 0, fromActive: 0 }, { active: ["S1"] });
  assert.equal(reading.state, "between"); assert.equal(reading.label, `S1${NB}진행${NB}중`, "전제: xhatReading 은 종전대로 '진행 중' 을 준다(B159)");
  const r = goalRowText({ hasTarget: false, active: ["S1"], reading });
  assert.equal(r.left, `중립${NB}탐침 S1${NB}진행${NB}중`);
  assert.equal(r.right, "", "오른쪽에 '진행 중' 을 되풀이하지 않는다");
  assert.ok(!r.left.includes("목표"), "이 순간은 '목표 곡선 없음' 대신 탐침을 적는다");
  const two = goalRowText({ hasTarget: false, active: ["S1", "S3"], reading: xhatReading({ tension: 0.12, fromStim: 0 }, { active: ["S1", "S3"] }) }); // 계열 점은 fromStim 0 을 가진다(없으면 isObserved 가 참)
  assert.equal(two.left, `중립${NB}탐침 S1·S3${NB}진행${NB}중`);
});
test("goalRowText: 탐침 진행 중인데 잠정 반응이면 '잠정' 은 오른쪽에 남는다", () => {
  const reading = xhatReading({ tension: 0.45, fromStim: 0.3, fromActive: 0.3 }, { active: ["S2"] });
  assert.equal(reading.label, "잠정", "전제"); assert.equal(reading.provisional, true);
  const r = goalRowText({ hasTarget: false, active: ["S2"], reading });
  assert.equal(r.left, `중립${NB}탐침 S2${NB}진행${NB}중`);
  assert.equal(r.right, "잠정");
});
test("goalRowText: 탐침 없음이면 종전 그대로 — 왼쪽 NBSP·WORD JOINER 라벨(B217), 오른쪽 '사건 사이'/빈 꼬리표", () => {
  const between = goalRowText({ hasTarget: false, active: [], reading: xhatReading({ tension: 0.16, fromStim: 0 }, {}) });
  assert.equal(between.left, NO_TARGET_LABEL);
  assert.equal(NO_TARGET_LABEL, `목표${NB}곡선${NB}없음${WJ}(중립${NB}탐침)`);
  assert.equal(between.right, "사건 사이");
  const closed = goalRowText({ hasTarget: false, active: [], reading: xhatReading({ tension: 0.31, fromStim: 0.2 }, {}) });
  assert.equal(closed.left, NO_TARGET_LABEL); assert.equal(closed.right, "");
  assert.deepEqual(goalRowText(), { left: NO_TARGET_LABEL, right: "" }, "reading 없음(첫 틱 '추정 x̂ -')");
});
test("goalRowText: 목표 곡선이 있으면(/film 판정 뒤) 왼쪽은 패널 몫(null), 오른쪽은 '먼 문 소리 진행 중' 그대로 — 왼쪽 '지금 목표 0.45' 가 짧아 한 줄에 든다", () => {
  const reading = xhatReading({ tension: 0.12, fromStim: 0 }, { target: 0.45, tol: 0.1, active: ["먼 문 소리"] });
  const r = goalRowText({ hasTarget: true, active: ["먼 문 소리"], reading });
  assert.equal(r.left, null);
  assert.equal(r.right, `먼 문 소리${NB}진행${NB}중`);
  assert.equal(goalRowText({ hasTarget: true, active: [], reading: xhatReading({ tension: 0.7, fromStim: 0.5 }, { target: 0.45, tol: 0.1 }) }).right, "");
});

console.log(`${n} passed`);
