// 모니터 문구 회귀 테스트(B65·B154) — 라벨과 숫자가 다른 줄로 갈리지 않고, 도달 점수 줄이 트랙 변경으로 읽히지 않는다
import assert from "node:assert/strict";
import { glueNumbers, pair, reachText, reachParts } from "../lib/monitorText.js";

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

console.log(`${n} passed`);
