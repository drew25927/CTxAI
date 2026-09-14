// /interim 판정 회귀 테스트 — 외부 의존 없이 node 로 바로 돈다: node scripts/test-interim.mjs
// 등급 경계값(숫자) 자체는 실측 전 잠정치라 여기서 검증하지 않는다 — 이 테스트가 잡는 건
// "문서(기다림_정류장_프로젝트개요서.pdf §3)에 적힌 순서·조건대로 등급이 갈리는가"뿐이다.
// 숫자를 실측으로 고치면 이 테스트도 같이 고칠 것.

import assert from "node:assert/strict";
import {
  gradeS1FromHeadPose, gradeS3FromHeadPose, gradeS5FromHeadPose,
  gradeS2FromWebcam, gradeS4FromWebcam,
} from "../lib/interimGrader.js";
import { analyzeBurstFromSamples } from "../lib/interimMic.js";
import { createStandUpSensor } from "../lib/standUpSense.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

// ── S1 관심 (판초 인물) ──────────────────────────────────
test("S1 — 안 보면 D, 반복 확인이면 B, 3초 이상 지속이면 A, 그 외 힐끗이면 C", () => {
  assert.equal(gradeS1FromHeadPose(null), "D");
  assert.equal(gradeS1FromHeadPose({ looked: false }), "D");
  assert.equal(gradeS1FromHeadPose({ looked: true, recheck: true, lookSec: 0.5 }), "B");
  assert.equal(gradeS1FromHeadPose({ looked: true, recheck: false, lookSec: 3.0 }), "A");
  assert.equal(gradeS1FromHeadPose({ looked: true, recheck: false, lookSec: 1.0 }), "C");
});

// ── S3 호기심 (찢어진 포스터) ────────────────────────────
test("S3 — 안 보면 C, 3초 이상 몸 돌려 읽으면 A, 힐끗이면 B", () => {
  assert.equal(gradeS3FromHeadPose(null), "C");
  assert.equal(gradeS3FromHeadPose({ looked: false }), "C");
  assert.equal(gradeS3FromHeadPose({ looked: true, lookSec: 3.0 }), "A");
  assert.equal(gradeS3FromHeadPose({ looked: true, lookSec: 0.8 }), "B");
});

// ── S5 경계 (개구리) ─────────────────────────────────────
test("S5 — 기립이 최우선(A), 그다음 후퇴(B) > 돌아봄(C) > 무관심(D)", () => {
  assert.equal(gradeS5FromHeadPose(null, { stoodUp: true }), "A"); // feats 없어도 기립이면 A
  assert.equal(gradeS5FromHeadPose(null), "D");
  assert.equal(gradeS5FromHeadPose({ retreat: 0.1, looked: true }), "B");
  assert.equal(gradeS5FromHeadPose({ retreat: 0, looked: true }), "C");
  assert.equal(gradeS5FromHeadPose({ retreat: 0, looked: false }), "D");
});

// ── S2 놀람 (트럭 물웅덩이) ──────────────────────────────
test("S2 — 마이크 단발 큰 소리는 표정 무관 C, 그 외엔 표정 기반 A>B>D", () => {
  assert.equal(gradeS2FromWebcam(null, { burstCount: 1, loud: 0.5 }), "C");
  assert.equal(gradeS2FromWebcam(null, null), "D");
  assert.equal(gradeS2FromWebcam({ maxAmusement: 0.6 }, null), "C");
  assert.equal(gradeS2FromWebcam({ maxAbsDy: 0.15 }, null), "A");
  assert.equal(gradeS2FromWebcam({ maxAbsDy: 0.08 }, null), "B");
  assert.equal(gradeS2FromWebcam({ maxAbsDy: 0.01 }, null), "D");
});

// ── S4 정서 (고양이) ─────────────────────────────────────
test("S4 — 마이크 반복 웃음은 표정 무관 D, 그 외엔 웃음(D)>싫음(C)>약반응(B)>지켜봄(A)>무관심(E)", () => {
  assert.equal(gradeS4FromWebcam(null, { burstCount: 3, loud: 0.4 }), "D");
  assert.equal(gradeS4FromWebcam(null, null), "E");
  assert.equal(gradeS4FromWebcam({ maxAmusement: 0.6 }, null), "D");
  assert.equal(gradeS4FromWebcam({ maxFear: 0.6 }, null), "C");
  assert.equal(gradeS4FromWebcam({ maxFear: 0.3 }, null), "B");
  assert.equal(gradeS4FromWebcam({ sustainedSec: 2 }, null), "A");
  assert.equal(gradeS4FromWebcam({ sustainedSec: 0.2 }, null), "E");
});

// ── 마이크 버스트 분석 (순수 함수) ───────────────────────
test("마이크 — 무음은 burstCount 0, 단발 큰 소리는 1, 반복되면 그 횟수만큼", () => {
  const sr = 16000, frame = Math.floor(sr * 0.05); // FRAME_SEC = 0.05
  const silence = new Float32Array(frame * 3); // 전부 0
  assert.deepEqual(analyzeBurstFromSamples(silence, sr), { loud: 0, burstCount: 0 });

  const oneBurst = new Float32Array(frame * 3);
  for (let i = frame; i < frame * 2; i++) oneBurst[i] = 0.3; // 가운데 프레임만 크게
  const r1 = analyzeBurstFromSamples(oneBurst, sr);
  assert.equal(r1.burstCount, 1);
  assert.ok(r1.loud > 0.9); // 0.3 / 0.15 상한을 넘어 1로 클램프

  const threeBursts = new Float32Array(frame * 5); // 크고-조용-크고-조용-크게 = 3번
  for (let i = 0; i < frame; i++) threeBursts[i] = 0.3;
  for (let i = frame * 2; i < frame * 3; i++) threeBursts[i] = 0.3;
  for (let i = frame * 4; i < frame * 5; i++) threeBursts[i] = 0.3;
  assert.equal(analyzeBurstFromSamples(threeBursts, sr).burstCount, 3);
});

// ── 기립 감지 ─────────────────────────────────────────────
test("기립 — 데스크톱(비XR)에서는 아무리 솟아도 절대 감지 안 함", () => {
  const s = createStandUpSensor();
  for (let i = 0; i < 60; i++) s.update(1.2, 0.1, false); // 기준선 구간
  const stood = s.update(1.6, 0.1, false); // 큰 도약이지만 비XR
  assert.equal(stood, false);
});

test("기립 — 헤드셋에서 1.2초 안에 28cm 이상 솟으면 감지", () => {
  const s = createStandUpSensor();
  for (let i = 0; i < 55; i++) s.update(1.2, 0.1, true); // 5초 기준선(0.1*55=5.5s ≥ BASELINE_SEC)
  let stood = false;
  // 0.5초 만에 1.2 → 1.55 (35cm 상승, RISE_M=0.28 이상)
  for (let i = 0; i < 5; i++) stood = s.update(1.2 + (i + 1) * 0.07, 0.1, true);
  assert.equal(stood, true);
});

test("기립 — 3초에 걸친 완만한 상승(천천히 목을 폄)은 감지 안 함", () => {
  const s = createStandUpSensor();
  for (let i = 0; i < 55; i++) s.update(1.2, 0.1, true);
  let stood = false;
  // 3초 동안 0.28m 상승 — 어떤 1.2초 창을 봐도 상승폭이 임계값 미만
  const steps = 30, totalRise = 0.28, dt = 0.1;
  for (let i = 1; i <= steps; i++) stood = s.update(1.2 + (totalRise * i) / steps, dt, true) || stood;
  assert.equal(stood, false);
});

console.log(`\n${n} passed`);
