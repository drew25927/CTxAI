// /interim 판정 시뮬레이션 — 세 종류의 관객을 흉내 내서 5신호(S1~S5)가 실제로 의도한
// 장르로 갈리는지 본다. /film의 scripts/sim-headpose.mjs와 같은 목적, 같은 한계:
// 이건 "로직이 말이 되는가"를 사람 없이 확인하는 것이지, 등급 경계 숫자 자체를 실측해
// 주지는 않는다 (합성 데이터는 내가 지어낸 것이라 실제 사람 반응이 아니다). 진짜 숫자
// 보정은 Bus/셀프테스트_임계값_보정.md 나 실제 파일럿으로 해야 한다.
//
// 헤드포즈 신호(S1·S3·S5)는 /film 시뮬과 똑같이 lib/headPoseSense.js를 그대로 돌려서
// feats를 뽑고, 그걸 lib/interimGrader.js의 등급 함수에 넣는다 — 실제 파이프라인 그대로.
// 웹캠·마이크 신호(S2·S4)는 MediaPipe 프레임을 합성할 수 없으니, 그 대신 "이런 표정·
// 소리가 나왔다"는 그럴듯한 metrics/mic 값을 직접 만들어 같은 등급 함수에 넣는다.

import { createHeadPoseSensor } from "../lib/headPoseSense.js";
import { createStandUpSensor } from "../lib/standUpSense.js";
import { CUES, T } from "../lib/interimTimeline.js";
import {
  gradeS1FromHeadPose, gradeS3FromHeadPose, gradeS5FromHeadPose,
  gradeS2FromWebcam, gradeS4FromWebcam,
} from "../lib/interimGrader.js";
import { judge } from "../lib/interimJudge.js";

// 프로필별 S2(트럭 물보라)·S4(고양이) 반응 — 웹캠 observe()·마이크 analyzeMicBurst()가
// 돌려주는 것과 같은 모양의 합성값. 숫자는 "이런 반응이면 이렇게 나오겠다" 수준의
// 그럴듯한 값이지, 실측치가 아니다.
const WEBCAM_PROFILE = {
  // 공포형 — 크게 놀라 물러남(S2), 고양이를 무서워함(S4)
  fearful: {
    S2: { m: { maxAbsDy: 0.16, maxScaleDrop: 0.05 }, mic: { burstCount: 1, loud: 0.55 } },
    S4: { m: { maxFear: 0.65, maxAmusement: 0.05, sustainedSec: 0.3 }, mic: null },
  },
  // 호기심 많은형 — 트럭에 탄성(웃음 쪽), 고양이 보고 웃음
  curious: {
    S2: { m: { maxAbsDy: 0.02, maxScaleDrop: 0, maxAmusement: 0.1 }, mic: { burstCount: 1, loud: 0.45 } },
    S4: { m: { maxFear: 0.05, maxAmusement: 0.6, sustainedSec: 0.5 }, mic: { burstCount: 2, loud: 0.4 } },
  },
  // 차분한형 — 트럭·고양이 둘 다 담담, 고양이는 그냥 오래 지켜봄
  calm: {
    S2: { m: { maxAbsDy: 0.01, maxScaleDrop: 0.01 }, mic: null },
    S4: { m: { maxFear: 0.05, maxAmusement: 0.05, sustainedSec: 1.4 }, mic: null },
  },
};

function run(profile) {
  const sensor = createHeadPoseSensor({ push: () => {}, mark: () => {} });
  const standUp = createStandUpSensor();
  const dt = 1 / 60;
  let t = 0;
  const fired = new Set();
  let yaw = 0, z = 0, y = 1.2;
  let targetYaw = 0, targetZ = 0, targetY = 1.2, holdUntil = 0, rate = 4;
  const active = [];
  let nextGlanceAt = 3; // 공포형의 "불안한 재확인" 스케줄 — 아래에서 갱신

  // S1(판초 인물)은 dur = T.judge - T.figureStart, tail 기본값 4초라 observeUntil이
  // T.judge를 넘어선다 — 그 시점까지 돌지 않으면 채점 자체가 안 되고 항상 "D"(관측 실패)로
  // 빠진다. 넉넉히 tail+여유를 더한다.
  while (t < T.judge + 6) {
    for (const c of CUES) {
      if (c.sense && t >= c.t && !fired.has(c.name)) {
        fired.add(c.name);
        sensor.beginEvent(c.name, c.sense.azimuth, c.sense.dur, { kind: c.sense.kind });
        active.push({ ...c, at: t });
      }
    }
    const ev = active.find((e) => t - e.at < 0.3 && t - e.at >= 0);
    if (ev) {
      const az = ev.sense.azimuth;
      if (profile === "fearful") {
        // 짧은 사건(포스터·개구리)엔 크게 반응 — 개구리(S5)는 벌떡 일어선다.
        // 긴 사건(판초 인물, 100초)은 첫 반응만으론 안 되고 아래 "불안한 재확인" 루프가 맡는다.
        targetYaw = az * (ev.name === "figureApproach" ? 0.6 : 0.85); rate = 12; holdUntil = t + (ev.name === "figureApproach" ? 1.0 : 3.2);
        if (ev.name === "frog") { targetY = 1.2 + 0.35; }
      }
      if (profile === "curious") {
        // 힐끗 보고 넘어감(S1) — 포스터(S3)만 3초 넘게 몸 돌려 읽는다
        targetYaw = az * 0.9; rate = 7; holdUntil = t + (ev.name === "poster" ? 3.4 : 0.9);
      }
      if (profile === "calm") {
        // 판초 인물은 3초 이상 지속 관찰, 나머지는 거의 반응 없음
        targetYaw = ev.name === "figureApproach" ? az * 0.7 : az * 0.1; rate = 3; holdUntil = t + (ev.name === "figureApproach" ? 4 : 0.3);
      }
    }
    if (t > holdUntil) { targetYaw = 0; targetZ = 0; if (profile !== "fearful" || t > holdUntil + 1.2) targetY = 1.2; }
    // 공포형의 "불안한 재확인" — 100초짜리 S1(판초 인물) 관찰 내내, 첫 반응이 끝난
    // 뒤로도 몇 초마다 짧게 그쪽을 힐끗거린다(경계). 무서운 걸 계속 곁눈질하는 건 흔한
    // 반응이라, 한 번 스쳐보고 마는 것보다 이쪽이 "무서워하는 사람"을 더 정직하게
    // 흉내 낸다. holdUntil을 잠깐만 여는 게 아니라, 힐끗거리는 1.2초 구간 내내 유지한다.
    const figureEv = active.find((e) => e.name === "figureApproach");
    if (profile === "fearful" && figureEv && t < T.judge) {
      if (t >= nextGlanceAt && !ev) {
        targetYaw = figureEv.sense.azimuth * 0.5; rate = 10; holdUntil = t + 1.2;
        nextGlanceAt = t + 3.5 + Math.random() * 2; // 다음 힐끗까지 3.5~5.5초
      }
    }
    yaw += (targetYaw - yaw) * Math.min(1, rate * dt);
    z += (targetZ - z) * Math.min(1, 6 * dt);
    y += (targetY - y) * Math.min(1, 8 * dt);
    sensor.update(yaw, 0, z, dt);
    standUp.update(y, dt, true); // 헤드셋 세션 가정 — 데스크톱이면 기립 신호 자체가 없다(standUpSense.js)
    t += dt;
  }

  const events = sensor.report().events;
  const byName = Object.fromEntries(events.map((e) => [e.name, e.feats]));
  const wc = WEBCAM_PROFILE[profile];

  const observations = {
    S1: byName.figureApproach ? gradeS1FromHeadPose(byName.figureApproach) : "D",
    S2: gradeS2FromWebcam(wc.S2.m, wc.S2.mic),
    S3: byName.poster ? gradeS3FromHeadPose(byName.poster) : "C",
    S4: gradeS4FromWebcam(wc.S4.m, wc.S4.mic),
    S5: byName.frog ? gradeS5FromHeadPose(byName.frog, { stoodUp: standUp.stoodUp }) : "D",
  };
  const result = judge(observations);

  console.log(profile.padEnd(8), `→ ${result.genre}  `, `R${result.totals.R} H${result.totals.H} C${result.totals.C}`, ` (${result.reason})`);
  for (const sig of ["S1", "S2", "S3", "S4", "S5"]) console.log("   ", sig, observations[sig]);
}

console.log("/interim 5신호 시뮬레이션 — 합성 데이터, 실측 아님(참고용)\n");
for (const p of ["fearful", "curious", "calm"]) run(p);
