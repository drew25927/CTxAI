// 신호(S1~S5) → 등급(A~E) 변환 — 기다림_정류장_프로젝트개요서.pdf §3 "무엇으로 읽는가" 표를
// 그대로 센서별로 나눈다. 등급이 나오면 lib/interimJudge.js의 judge()에 그대로 넣으면 된다.
//
//   헤드셋 IMU(머리 회전·각속도·기울기)  → S1·S3(단독), S5(일부)
//     lib/headPoseSense.js를 그대로 재사용한다 — 새 헤드 트래킹 코드를 만들지 않는다.
//     beginEvent(name, azimuthDeg, durationSec, {kind}) 로 사건을 걸어두면, 사건이 끝날 때
//     mark("event:scored", {feats}) 로 {looked, lookLatency, lookSec, maxVel, retreat,
//     recoverySec, recheck} 가 나온다 — 이 파일의 gradeS1FromHeadPose 등은 그 feats를 받는다.
//
//   웹캠(관객 얼굴)                     → S2·S4(일부), S5(일부) — 잠정 근사
//     스펙은 "외부 카메라(몸)"·"외부 카메라(하관)"라는 별도 카메라 두 대를 가정하지만,
//     이 웹 앱엔 관객 얼굴을 향한 웹캠 하나(lib/behaviorSense.js observe())뿐이다. 전시
//     부스에 몸 전체를 보는 카메라를 따로 놓기 전까지는 이 웹캠 신호(표정+고개/어깨 움직임)를
//     "몸+표정" 둘 다의 근사치로 쓴다.
//
//   마이크(웃음·탄성·비명)              → 아직 배선 안 됨. §3-1 규칙⑤(임계값은 실측) 대상과
//     같은 이유로, 마이크가 붙기 전까지는 이 파일의 함수들이 무음향 기본 등급(D/E)을 낸다.
//
// 등급 경계값(0.5, 0.12 같은 숫자)은 전부 잠정치다 — 파일럿 실측 전까지는 이 파일 안
// 상수만 바꾸면 된다. lib/headPoseSense.js·lib/behaviorSense.js 쪽 상수는 건드리지 않는다.

const LOOK_SUSTAINED_SEC = 3.0; // "3초 이상 봄" 등 문서가 명시한 값들은 그대로 가져온다

// ── S1·S3·S5 — 헤드셋 IMU (lib/headPoseSense.js의 event feats) ──

/** S1 관심 — 길 건너 판초 인물(0:15~1:55, kind:"track")을 얼마나 지속·반복해서 보는가. */
export function gradeS1FromHeadPose(feats) {
  if (!feats || !feats.looked) return "D";        // 안 봄
  if (feats.recheck) return "B";                   // 반복 확인
  if (feats.lookSec >= LOOK_SUSTAINED_SEC) return "A"; // 지속 관찰
  return "C";                                       // 한 번 힐끗
}

/** S3 호기심 — 찢어진 포스터(kind:"probe"). */
export function gradeS3FromHeadPose(feats) {
  if (!feats || !feats.looked) return "C";          // 안 봄
  if (feats.lookSec >= LOOK_SUSTAINED_SEC) return "A"; // 몸 돌려 읽음(3초+)
  return "B";                                        // 힐끗
}

/**
 * S5 경계 — 등 뒤 개구리(kind:"probe"). "기립"(A)은 헤드셋 높이(Y) 변화로 잡아야 하는데
 * 아직 배선 안 됐다 — 감지되면 stoodUp=true로 넘긴다. 그 전까지는 B~D만 나온다.
 */
export function gradeS5FromHeadPose(feats, { stoodUp = false } = {}) {
  if (stoodUp) return "A";           // 크게 놀라 기립
  if (!feats) return "D";
  if (feats.retreat > 0) return "B"; // 기피·움츠림(뒤로 물러남)
  if (feats.looked) return "C";      // 천천히 돌아봄
  return "D";                        // 무관심
}

// ── S2·S4 — 웹캠 + 마이크 (lib/behaviorSense.js observe()의 metrics,
//            lib/interimMic.js analyzeMicBurst()의 {loud, burstCount}) ──
//
// 마이크는 얼굴 표정과 "같은 걸 다른 채널로" 보는 것이라 — 표정에 안 잡혀도 소리가
// 크게 났으면(웃음·탄성) 그대로 인정한다. 둘 중 하나만 강하게 나와도 충분하다.

/** S2 놀람 — 물웅덩이 튀김(트럭). mic은 없으면 생략 가능(선택 인자). */
export function gradeS2FromWebcam(metrics, mic = null) {
  // 단발로 크게 소리 남 = 탄성·비명(웃음 쪽 웃음·탄성 등급과 같은 칸) — 표정과 무관하게 인정.
  if (mic && mic.burstCount === 1 && mic.loud > 0.4) return "C";
  if (!metrics) return "D";
  if ((metrics.maxAmusement || 0) > 0.5) return "C"; // 웃음·탄성
  const startle = Math.max(metrics.maxAbsDy || 0, metrics.maxScaleDrop || 0);
  if (startle > 0.12) return "A"; // 크게 놀라 물러남
  if (startle > 0.05) return "B"; // 움찔
  return "D";                     // 무반응
}

/** S4 정서 — 고양이와 눈맞춤. mic은 없으면 생략 가능(선택 인자). */
export function gradeS4FromWebcam(metrics, mic = null) {
  // 반복되는 소리(하하하) = 웃음 — 표정과 무관하게 인정.
  if (mic && mic.burstCount >= 2 && mic.loud > 0.3) return "D";
  if (!metrics) return "E";
  const fear = metrics.maxFear || 0, amuse = metrics.maxAmusement || 0;
  if (amuse > 0.5) return "D";                     // 웃음
  if (fear > 0.5) return "C";                      // 싫어함(놀람 방향)
  if (amuse > 0.2 || fear > 0.2) return "B";        // 같이 놀람(약한 반응)
  if ((metrics.sustainedSec || 0) > 1) return "A";  // 좋아함(눈 안 떼고 지켜봄 — 근사)
  return "E";                                       // 무관심
}
