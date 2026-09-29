// 중간시연(2분20초 MVP) 타임라인 — 기다림_정류장_XR_중간시연_구현가이드_v1.0.docx §2와
// 기다림_정류장_프로젝트개요서.pdf §2·§5를 그대로 옮긴다.
//
// lib/filmTimeline.js(5분짜리 /film, "다음 단계"에 남는 버전)와 좌표계·필드 모양은 맞췄다 —
// components/ReactiveStage.jsx를 고치지 않고 그대로 재사용하기 위해서다. actors.figure(정체
// 불명의 판초 인물)와 actors.npc(판정된 genre로 등장하는 옆사람)를 filmTimeline과 똑같이
// 분리했지만, 이 문서의 핵심 트릭대로 npc의 등장 지점을 figure가 사라지는 바로 그 자리
// (부스 기둥 옆, x=-0.95)로 맞췄다 — "같은 사람인 줄 알았는데" 반전이 filmTimeline의
// "전혀 다른 방향에서 옆사람 등장"보다 이 지점에서 훨씬 잘 읽힌다.
//
// dominant(R/H/C)를 ReactiveStage에 그대로 넘기면 리그 선택·색조는 ReactiveStage 안의
// 기존 로직(dominant==="H"?rig A:rig B, npcTint 등)이 알아서 처리한다 — 여기서 새로 만들
// 필요 없음.
//
// 시간은 "영화 시간"(초), t=0이 착석 시각. 좌표계는 filmTimeline과 동일 —
// 벤치 착석 지점 바닥=(0,0,0), 정면=-z, 오른쪽=+x.

export const T = {
  figureStart: 15,                                 // 0:15 카페 문 · 판초 인물 출발
  truckStart: 30, truckSplash: 35, truckEnd: 40,   // 0:35 트럭·물보라
  poster: 55,                                       // 0:55 바람·찢어진 포스터
  catIn: 70, catStop: 75, catOut: 83, catGone: 90,  // 1:15 고양이
  frog: 95,                                         // 1:35 개구리(뒤쪽, 화면엔 없음)
  lastLookStart: 100,                               // 1:40 마지막 관찰
  judge: 115,                                       // 1:55 판정 확정 (다섯 신호 합산)
  figureGone: 118,                                  // 판초 인물이 기둥 옆으로 사라짐
  npcSeated: 124,                                   // 판정된 인물이 기둥 옆에서 나와 앉기까지
  transition: 126,                                  // 2:06 하늘 4초 스냅 완료
  greeting: 130,                                    // 2:10 인사
  end: 140,                                         // 2:20 암전
};

// 한 번만 발동하는 큐 — 오디오·센서 사건. signal은 lib/interimJudge.js의 S1~S5와 대응한다.
// sense가 있는 큐(S1·S3·S5)는 헤드셋 IMU 담당 — lib/headPoseSense.js의 beginEvent(name,
// azimuthDeg, durationSec, {kind})에 그대로 넘긴다. sense가 없는 큐(S2·S4)는 웹캠 담당 —
// lib/behaviorSense.js의 observe()를 그 시점에 짧게 돌린다. (프로젝트개요서 §3 센서 분담표)
//
// S1(길 건너 판초 인물에 대한 지속적 관심)은 순간 사건이 아니라 0:15~1:55 내내 측정되는
// 값이라, azimuth는 인물이 걸어오는 방향의 대략치(카페 쪽, -35°)로 근사했다 — 실제로는
// 인물이 계속 이동하므로 이 고정값은 1차 근사다.
export const CUES = [
  { t: 0.5, name: "ambience", loop: true },
  { t: T.figureStart, name: "figureApproach", signal: "S1", sense: { azimuth: -35, dur: T.judge - T.figureStart, kind: "track" } },
  { t: T.truckSplash, name: "truckSplash", signal: "S2" },
  { t: T.poster, name: "poster", signal: "S3", sense: { azimuth: 72, dur: 3, kind: "probe" } },
  { t: T.catIn + 3, name: "cat", signal: "S4" },
  { t: T.frog, name: "frog", signal: "S5", sense: { azimuth: 135, dur: 3, kind: "probe" } },
  { t: T.judge, name: "judge" },
  { t: T.figureGone, name: "figureGone" },
  { t: T.transition, name: "transition" },
  { t: T.greeting, name: "greeting" },
  { t: T.end, name: "end" },
];

function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function seg(t, a, b) { return smooth((t - a) / (b - a)); }
function heading(dx, dz) { return Math.atan2(dx, dz); }

// 판초 인물 웨이포인트 — filmTimeline의 우비 인물과 같은 경로(카페 문 → 횡단보도 → 인도 →
// 정류장 앞 기둥)를 0:15~1:58(103초)에 맞게 늘렸다. 정확한 화각·타이밍은 3D 뷰에서 실제로
// 보면서 다듬어야 한다 — 지금은 filmTimeline과 같은 웨이포인트를 쓴 1차 초안.
const CROSS_READY = 95;        // 횡단보도 건너편 끝(트럭이 지나가길 기다림)
const CROSS_DONE = 108;        // 길을 다 건넘
const PILLAR_X = -0.95, PILLAR_Z = 0.35; // components/BlockoutStage.jsx Shelter()의 앞왼쪽 기둥

const NPC_ENTER_X = PILLAR_X, NPC_ENTER_Z = PILLAR_Z + 0.15; // figureGone과 거의 같은 자리에서 나온다

export function evalActors(t, { dominant = null } = {}) {
  const a = {};

  // 판초 인물 — 정체 불명. T.figureGone에 기둥 옆으로 사라진다(판정된 인물로 "바뀌는" 게
  // 아니라, ReactiveStage 구조상 별개 배우가 같은 자리에서 나오는 방식 — 관객에게는
  // "같은 사람이 기둥 뒤에서 정체를 드러냈다"로 읽히도록 등·퇴장 지점을 맞췄다).
  if (t >= T.figureStart && t < T.figureGone) {
    let x, z, walking = true;
    if (t < CROSS_READY) {
      const p = seg(t, T.figureStart, CROSS_READY);
      x = lerp(-18, -5, p); z = lerp(-24.4, -17.6, p);
    } else if (t < T.truckEnd + 2) {
      x = -5; z = -17.6; walking = false; // 트럭이 지나가길 기다린다
    } else if (t < CROSS_DONE) {
      const p = seg(t, T.truckEnd + 2, CROSS_DONE);
      x = -5; z = lerp(-17.6, -2.4, p);
    } else {
      const p = seg(t, CROSS_DONE, T.figureGone);
      x = lerp(-5, PILLAR_X, p); z = lerp(-2.4, PILLAR_Z, p);
    }
    const yaw = t < CROSS_READY ? heading(13, 6.8) : t < CROSS_DONE ? heading(0, 1) : heading(PILLAR_X + 5, PILLAR_Z + 2.4);
    a.figure = { visible: true, x, z, walking, yaw, bob: t };
  } else {
    a.figure = { visible: false };
  }

  // 판정된 옆사람 — 기둥 옆(판초 인물이 사라진 자리)에서 나와 벤치로 걸어와 앉는다.
  // filmTimeline.evalActors의 npc 로직과 같은 모양(seatX·turnAt 보간)이지만 시작점만 다르다.
  if (dominant && t >= T.figureGone) {
    const seatX = 0.35 + 0.9; // 착석 거리 — 연출 상태 세분화는 후속 튜닝 과제
    const turnAt = T.npcSeated - 1.1;
    if (t < turnAt) {
      const p = seg(t, T.figureGone, turnAt);
      const x = lerp(NPC_ENTER_X, seatX + 0.15, p), z = lerp(NPC_ENTER_Z, -1.25, p);
      a.npc = { visible: true, x, z, seated: false, walking: true, yaw: heading(seatX + 6.15, 0.45), bob: t };
    } else if (t < T.npcSeated) {
      const p = seg(t, turnAt, T.npcSeated);
      const x = lerp(seatX + 0.15, seatX, p), z = lerp(-1.25, 0.3, p);
      a.npc = { visible: true, x, z, seated: false, walking: true, yaw: lerp(heading(seatX + 6.15, 0.45), Math.PI + 0.15, p), bob: t };
    } else {
      a.npc = { visible: true, x: seatX, z: 0.3, seated: true, walking: false, yaw: Math.PI, bob: t };
    }
  } else {
    a.npc = { visible: false };
  }

  // 포터 트럭
  if (t >= T.truckStart && t <= T.truckEnd) {
    const p = (t - T.truckStart) / (T.truckEnd - T.truckStart);
    a.truck = { visible: true, x: lerp(27, -27, p), z: -4.75 };
    a.splash = t >= T.truckSplash - 0.2 && t <= T.truckSplash + 1.2 ? (t - (T.truckSplash - 0.2)) / 1.4 : null;
  } else { a.truck = { visible: false }; a.splash = null; }

  // 고양이
  if (t >= T.catIn && t <= T.catGone) {
    let x, z, running = true, facingBench = false;
    if (t < T.catStop) { const p = seg(t, T.catIn, T.catStop); x = lerp(9, 0.9, p); z = lerp(-2.6, -1.5, p); }
    else if (t < T.catOut) { x = 0.9; z = -1.5; running = false; facingBench = true; }
    else { const p = seg(t, T.catOut, T.catGone); x = lerp(0.9, -9, p); z = lerp(-1.5, -2.2, p); }
    a.cat = { visible: true, x, z, running, facingBench, bob: t };
  } else a.cat = { visible: false };

  // 포스터 파닥임
  a.posterFlutter = t >= T.poster && t < T.poster + 2.5 ? Math.sin((t - T.poster) * 18) * Math.exp(-(t - T.poster) * 1.4) : 0;

  return a;
}
