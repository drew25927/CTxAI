// 디제틱 프로브 배터리 — 정류장_스크립트_v2.md §1 의 다섯 사건을 "계측 가능한
// 자극"으로 형식화한 것.
//
// 핵심 발상: 다섯 사건은 스토리 비트인 동시에 교정된 프로브다. 각각이
// (시점 · 방위 · 고도 · 양식 · 반응창)을 정확히 알고 있으므로, 관객의 반응을
// "자유로운 얼굴에서 감정 분류"가 아니라 "알려진 자극에 대한 반응 커널"로
// 측정할 수 있다. 관객은 측정당하는 걸 모른다 — 프로브가 곧 이야기이기 때문.
//
// 근거: Bus/규격/정류장_스크립트_v2.md §1·§2 · Bus/규격/판정_기준.md §2
//
// ── 좌표 규약 ─────────────────────────────────────────────
// 씬 원점 = 벤치 착석 지점 바닥 (0,0,0) — 명명규칙.md §3
// 관객 눈높이 y = 1.15m (앉은 자세)
// 정면 = -Z. 방위각 θ 는 정면에서 시계방향(오른쪽이 +).
//   x = r·sin θ,  z = -r·cos θ
//   θ=0 정면 · θ=+90 오른쪽 · θ=+135 오른쪽 뒤 · θ=-90 왼쪽

export const EYE_HEIGHT = 1.15;

/** 방위각(도)+거리 → 씬 좌표. 프로브 정의와 오디오 패너가 같은 함수를 쓴다. */
export function bearingToXZ(azimuthDeg, radius) {
  const a = (azimuthDeg * Math.PI) / 180;
  return { x: radius * Math.sin(a), z: -radius * Math.cos(a) };
}

/** 씬 좌표 → 방위각(도). 기록된 요각과 프로브 방위를 비교할 때 쓴다. */
export function xzToBearing(x, z) {
  return (Math.atan2(x, -z) * 180) / Math.PI;
}

/** 두 각도의 차이를 -180~180 으로 정규화. 요각이 누적돼도 안전하게 비교된다. */
export function angleDelta(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// ── 기저선 구간 ───────────────────────────────────────────
// v2.md §2-3 "초기 5~8초의 평균 자세를 기준으로" — 이 구간에는 자극을 넣지
// 않는다. 여기서 잰 평균 요각·고각이 이후 모든 이탈의 기준점이 된다.
export const BASELINE_MS = 8000;

// ── 프로브 배터리 ─────────────────────────────────────────
//
// onsetMs    자극 시작 시각
// windowMs   반응 관찰창 — 이 안의 궤적으로 커널을 만든다
// azimuth    방위각(도) — 고정 프로브만
// radius     거리(m) — 고정 프로브만
// path       이동 프로브의 실제 경로 { from:[x,z], to:[x,z] } (씬 좌표, m)
//
// ⚠ 이동 프로브는 방위·거리를 보간하면 안 된다.
//   예전에 트럭을 azimuth [78,-78] · radius [9,9] 로 적었는데, 그러면 관객을
//   중심으로 반지름 9m 원을 도는 궤적이 된다 — 도로를 달리는 게 아니라
//   회전목마다. 시작·끝 지점(z≈-1.9)이 인도 위였다.
//   실제 위치를 보간하고 방위는 거기서 유도해야, 앞을 지나갈 때 방위가
//   빠르게 쓸리고 멀리서는 천천히 움직이는 자연스러운 각속도가 나온다.
// elevation  고도(m, 눈높이 기준 오프셋)
// modality   "v" 시각만 · "a" 청각만 · "av" 둘 다
// expect     이 프로브가 어느 축의 근거가 되는지 (판정이 아니라 문서화용)
//
// ⚠ 임계값·시점은 전부 잠정치다. v2.md §2 마지막 경고와 같은 성격 —
//   파일럿 전까지는 "이 순서로 자극이 온다"는 것만 확정이다.

export const PROBES = [
  {
    id: "poster",
    label: "찢어진 포스터",
    onsetMs: 10000,
    windowMs: 5000,
    azimuth: 72,
    radius: 1.1,
    elevation: 0.2,
    modality: "av", // 시각 + 종이 스치는 소리(파닥)
    expect: "정보의 빈칸을 확인하려 드는가 — 탐색(C)",
    note: "v2.md §1-1. 관객 오른쪽 유리, 근거리. 글자를 읽으려면 몸을 기울여야 한다.",
  },
  {
    id: "wiper",
    label: "카페 문과 우비 인물",
    onsetMs: 22000,
    windowMs: 16000, // 장시간 추적 프로브 — 창이 길다
    // 카페 앞(-30,-38)에서 나와 도로를 건너 정류장 쪽으로 걸어온다.
    // 약 48m → 15m, 16초. 보통 걸음 속도.
    path: { from: [-30, -38], to: [-7.5, -13] },
    elevation: -0.6,
    modality: "av", // 카페 종(딸랑) + 이동하는 인물
    expect: "사람과 이동에 관심을 두는가 — 로맨스(R)의 유일한 양성 신호",
    note: "v2.md §1-2. 전방 왼쪽 50m. 로맨스를 잔여값이 아니라 측정값으로 만드는 프로브.",
  },
  {
    id: "truck",
    label: "포터 트럭 물보라",
    onsetMs: 40000,
    windowMs: 4000,
    // 도로 위 직선 — 오른쪽 곡선에서 나와 왼쪽으로. 가까운 차선(z=-5.6).
    // 52m 를 4초에 = 약 47km/h.
    path: { from: [26, -5.6], to: [-26, -5.6] },
    elevation: -0.4,
    modality: "av",
    expect: "몸 가까운 사건에 대한 반사 — 방어 진폭·복귀 시상수(H)",
    note: "v2.md §1-3. 물이 얼굴 쪽으로 부채꼴로 튄다. 움찔·후퇴·회복속도를 잰다.",
  },
  {
    id: "frog",
    label: "오른쪽 뒤 개구리",
    onsetMs: 49000,
    windowMs: 6000,
    azimuth: 135, // 등 뒤 오른쪽
    radius: 2.6,
    elevation: -1.0,
    modality: "a", // ★ 소리만. 시각적으로 아무것도 없다.
    expect: "화면 밖 공간에 대한 민감도",
    note:
      "v2.md §1-4. 판정_기준.md §2 가 '정면 카메라의 사각지대'로 지목한 프로브 — " +
      "웹캠으로는 얼굴 인식이 끊기지만 요각으로는 그대로 측정된다.",
  },
  {
    id: "cat",
    label: "고양이 등장",
    onsetMs: 58000,
    windowMs: 5000,
    // 오른쪽 공원 진입로에서 정류장 안까지 들어왔다가, 앞을 가로질러 왼쪽으로.
    path: { from: [3.4, 0.2], to: [-5.0, -2.4] },
    elevation: -1.0,
    modality: "av",
    expect: "돌발 반응 — 놀람(H) vs 즐거움(C) 의 분기점",
    note: "v2.md §1-5 1단계. 급정지 후 서로 바라보는 짧은 순간이 있다.",
  },
  {
    id: "cry2",
    label: "두 번째 울음",
    onsetMs: 65000,
    windowMs: 6000,
    azimuth: -115, // 왼쪽 시야 밖
    radius: 6,
    elevation: -0.8,
    modality: "a", // ★ 소리만. 무슨 일이 있었는지 보여주지 않는다.
    expect: "사건을 기억하고 재확인하는가 — 지속 경계(H) vs 확인 욕구(C)",
    note: "v2.md §1-5 2단계. '냐아악!' + 달그락. 복선 역할.",
  },
];

// 마지막 프로브(cry2)가 71초에 끝나므로, 그 뒤에 "재확인" 을 관찰할 꼬리
// 구간을 남긴다 — v2.md §2-2 의 "사건이 끝난 뒤에도 그 방향을 의식함" 은
// 창이 끝난 다음을 봐야 잴 수 있다. 이 5초가 판정 직전 구간이기도 하다.
export const TOTAL_MS = 76000;

export const PROBE_BY_ID = Object.fromEntries(PROBES.map((p) => [p.id, p]));

/**
 * 진행률 t(0~1) 지점의 위치·방위·거리. 오디오 패너와 3D 가 같이 쓴다.
 *
 * 이동 프로브는 **위치를 보간하고 방위를 유도**한다. 방위를 직접 보간하면
 * 관객을 도는 원호가 되어 버린다(위 ⚠ 참고).
 * heading 은 진행 방향(라디안) — 트럭·고양이가 가는 쪽을 보게 한다.
 */
export function probeAt(probe, t) {
  if (probe.path) {
    const { from, to } = probe.path;
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[1] + (to[1] - from[1]) * t;
    return {
      x, z,
      azimuth: xzToBearing(x, z),
      radius: Math.hypot(x, z),
      heading: Math.atan2(to[0] - from[0], to[1] - from[1]),
    };
  }
  const azimuth = probe.azimuth;
  const radius = probe.radius;
  const { x, z } = bearingToXZ(azimuth, radius);
  return { x, z, azimuth, radius, heading: Math.atan2(-x, -z) };
}

/** 프로브가 끝난 뒤 "재확인"으로 셀 구간 — 다음 프로브 시작 전까지. */
export function revisitWindow(probe) {
  const end = probe.onsetMs + probe.windowMs;
  const next = PROBES.find((p) => p.onsetMs > probe.onsetMs);
  return { startMs: end, endMs: next ? next.onsetMs : TOTAL_MS };
}

/** 세션 파일에 남길 프로브 스펙 — 나중에 배터리가 바뀌어도 재현되도록. */
export const PROBE_SET_ID = "v2.6probes.2026-08-22";
