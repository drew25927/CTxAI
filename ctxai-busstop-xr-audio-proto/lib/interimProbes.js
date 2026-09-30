// /interim 큐 → 우리 탐침 메타 — 팀의 다섯 사건(S1~S5)을 lib/engagementSense.js 의 beginStimulus 에
// 넘길 때 쓰는 방위·길이·종류·채널이다. 팀 코드(lib/interimTimeline.js CUES, lib/interimJudge.js)는
// 손대지 않고, 이 파일이 큐 이름만 보고 옆에서 참조한다.
//
// 왜 따로 두는가: 팀 큐의 `sense`(S1·S3·S5)는 헤드셋 IMU 판정용이고 S2·S4 는 웹캠 담당이라 방위가
// 없다. 우리 관측 축(관객 응답 모델 θ̂·긴장 추정 x̂)은 다섯 사건 모두를 "탐침"으로 보고 반응 크기·
// 지연·회복을 재야 하므로, S2·S4 에도 /film 과 같은 방위(트럭 8°, 고양이 30°)를 보조 메타로 붙인다.
// 팀의 `if (cue.sense)` 분기와 등급 판정은 그대로다.
//
// 도입부 다섯 사건은 중립 탐침이다 — 용량을 바꾸면 그 사건이 만드는 θ̂ 추정이 오염되므로 여기서는
// 관측만 하고 자극을 바꾸지 않는다(설계 문서 §9).

import { T, S1_DUR } from "./interimTimeline.js";

// 잠정치 — 팀 큐에는 용량(볼륨) 개념이 없어 균일값을 쓴다. /film 큐 볼륨의 중앙값(0.5~0.8) 근사.
// 응답 모델의 회귀는 log(반응/용량) 이라 균일값이면 이득 g 의 절대 크기만 바뀌고 관객 간 순서는 같다.
export const INTERIM_DOSE = 0.6;

export const INTERIM_PROBES = Object.freeze({
  // S1 판초 인물 — 0:15 부터 추적(track). 길이는 팀 큐와 같은 S1_DUR(94초, 꼬리 4초 포함 1:53 에 닫힘 — 판정 1:55 전에
  // 레코드가 확정돼 θ̂·도달가능 트랙이 판정 시각에 완성된다). 방위는 팀 큐와 같은 카페 쪽 -35°(1차 근사).
  figureApproach: { azimuth: -35, dur: S1_DUR, kind: "track", channel: "visual" },
  // S2 트럭 물보라 — 정면 약간 오른쪽. 물보라 1.4초 + 여운.
  truckSplash: { azimuth: 8, dur: 2.5, kind: "probe", channel: "av" },
  // S3 포스터 — 팀 큐 sense 와 동일.
  poster: { azimuth: 72, dur: 3, kind: "probe", channel: "av" },
  // S4 고양이 — 벤치 앞에 멈춰 관객을 보는 구간(catStop~catOut 의 앞부분).
  cat: { azimuth: 30, dur: 5, kind: "probe", channel: "av" },
  // S5 개구리 — 뒤쪽, 소리만(화면엔 없음).
  frog: { azimuth: 135, dur: 3, kind: "probe", channel: "audio" },
});

export const INTERIM_PROBE_ORDER = ["figureApproach", "truckSplash", "poster", "cat", "frog"];

/**
 * 큐 이름 → beginStimulus 인자. 탐침이 아닌 큐(ambience·judge·transition…)는 null.
 * speed 배속이면 길이·꼬리를 실제 시간으로 환산한다(센서는 실제 경과 초로 돈다).
 */
export function probeFor(cueName, speed = 1) {
  const p = INTERIM_PROBES[cueName];
  if (!p) return null;
  const sp = Math.max(0.05, Number(speed) || 1);
  return { name: cueName, azimuth: p.azimuth, dur: p.dur / sp, kind: p.kind, channel: p.channel, dose: INTERIM_DOSE, tail: 4 / sp };
}

/** 디렉터 모니터의 사건 눈금 — 영화 시간 기준 다섯 탐침의 시각과 신호 라벨. */
export function probeMarks() {
  const at = { figureApproach: T.figureStart, truckSplash: T.truckSplash, poster: T.poster, cat: T.catIn + 3, frog: T.frog };
  const sig = { figureApproach: "S1", truckSplash: "S2", poster: "S3", cat: "S4", frog: "S5" };
  return INTERIM_PROBE_ORDER.map((n) => ({ t: at[n], label: sig[n], name: n }));
}

/**
 * 모니터에 표시할 트랙 — 판정 확정 전에는 드리프트 선두, 확정 뒤에는 최종 장르. 둘 다 없으면 null.
 * (팀 드리프트 상태 st: lib/interimDrift.js) 페이지는 decided(= finalGenre 유무)를 함께 넘기고, 모니터 머리글은 판정 전 선두를
 * "트랙 잠정 R" 로 적는다(lib/monitorText trackHeadText · B143) — 선두는 S1~S5 를 읽을 때마다 바뀔 수 있는 부분 합산 결과다.
 */
export function interimTrack(driftSt) {
  if (!driftSt) return null;
  return driftSt.finalGenre || driftSt.leadingGenre || null;
}
