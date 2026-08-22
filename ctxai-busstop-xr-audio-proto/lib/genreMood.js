// 파라미터 → 연출값 매핑표.
//
// 구현_리스크와_지원_필요사항.md §4-2 가 "아직 설계되지 않았다"고 적어 둔 것이
// 이것이다. {H:0.6, R:0.3, C:0.1} 같은 숫자를 실제 조명 RGB·안개 농도·노출로
// 바꾸는 함수가 없어서, 연속 벡터가 나와도 그림 위에 반투명 색을 덮는 것
// 말고는 할 수 있는 게 없었다.
//
// 값의 근거는 제 취향이 아니라 문서다 — 정류장_스크립트_v1.1.md §3
// "하나의 무대, 네 개의 날씨":
//
//   로맨스  구름이 갈라지며 낮은 해가 뚫고 나온다. 젖은 도로 전체가 금빛으로 빛난다
//   공포    구름이 더 두꺼워진다. 오후 세 시인데 밤처럼 어둡다
//   코미디  균일하게 밝은 흐림. 그림자가 사라진다
//
// 그 문서가 이어서 말하는 것이 이 파일의 설계 원칙이기도 하다:
//   "공유되는 것은 무대의 전부이고, 갈리는 것은 하늘과 빛,
//    그리고 그 빛 아래 앉아 있는 사람이다."
// 그래서 여기서 바꾸는 것은 하늘·빛·안개뿐이고, 지오메트리는 건드리지 않는다.
//
// ⚠ 숫자는 잠정치다. 요청서 v5.0 §2.1 기준으로 **조명의 실제 값과 인상은
//   아트가 정한다.** 이 표는 아트 결과물이 오기 전까지의 자리지킴이고,
//   `Bus/규격/preset/` 의 lp_H·lp_R·lp_C 프리셋이 나오면 그 값을 여기 넣는다.

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

// hex → [r,g,b] 0~1
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * 무드 한 장 = 하늘·빛·안개·노출.
 *
 * skyTop/skyHorizon/skyBottom  하늘 그라디언트 3점 (환경맵도 여기서 나온다)
 * sunColor/sunIntensity        방향광 — "해"
 * sunElevation                 해의 높이(0~1). 낮을수록 길게 눕는 빛
 * ambientSky/ambientGround     반구광 위/아래 색
 * ambientIntensity             흐릴수록 커진다 (하늘 전체가 광원)
 * fogColor/fogNear/fogFar      가까울수록 답답하다
 * exposure                     톤매핑 노출
 * shadow                       그림자 세기(0이면 그림자가 사라진다)
 */
export const MOODS = {
  // 아직 어떤 장르도 아닌 정류장 — v2.md §1 의 공통 도입부
  neutral: {
    skyTop: "#5c6672", skyHorizon: "#cfd3d4", skyBottom: "#2b2f34",
    sunColor: "#efe8d8", sunIntensity: 1.15, sunElevation: 0.62,
    ambientSky: "#b7c0c9", ambientGround: "#2f342c", ambientIntensity: 0.85,
    fogColor: "#a6adb4", fogNear: 36, fogFar: 215,
    exposure: 1.05, shadow: 1,
  },

  // 💗 "구름이 갈라지며 낮은 해가 뚫고 나온다. 젖은 도로 전체가 금빛으로 빛난다"
  //    비 갠 뒤의 그 환함 — 무언가 좋은 일이 생길 것 같은
  R: {
    skyTop: "#6b7488", skyHorizon: "#f4d9a8", skyBottom: "#4a3f34",
    sunColor: "#ffd79a", sunIntensity: 2.35, sunElevation: 0.22, // 낮게 눕는 해
    ambientSky: "#e3ccb0", ambientGround: "#4a4038", ambientIntensity: 0.72,
    fogColor: "#dcc7a8", fogNear: 44, fogFar: 250,
    exposure: 1.22, shadow: 1.25,
  },

  // 🖤 "구름이 더 두꺼워진다. 오후 세 시인데 밤처럼 어둡다"
  //    시간이 잘못된 것 같은 — 대낮의 어둠은 밤의 어둠보다 무섭다
  H: {
    skyTop: "#20262e", skyHorizon: "#4a535d", skyBottom: "#12151a",
    sunColor: "#8fa2b4", sunIntensity: 0.28, sunElevation: 0.75,
    ambientSky: "#4d5763", ambientGround: "#14171b", ambientIntensity: 0.5,
    fogColor: "#39414a", fogNear: 16, fogFar: 105,  // 답답하게 가깝다
    exposure: 0.86, shadow: 0.35,
  },

  // 💛 "균일하게 밝은 흐림. 그림자가 사라진다"
  //    아무 일도 일어나지 않을 것 같은 평평함 — 그래서 작은 소동이 도드라진다
  C: {
    skyTop: "#a8b2bc", skyHorizon: "#e6e9ea", skyBottom: "#7d838a",
    sunColor: "#ffffff", sunIntensity: 0.18, sunElevation: 0.9,
    ambientSky: "#e2e6e9", ambientGround: "#8d9289", ambientIntensity: 1.55,
    fogColor: "#d3d8dc", fogNear: 52, fogFar: 260,
    exposure: 1.16, shadow: 0,   // ★ 그림자가 사라진다
  },
};

const COLOR_KEYS = ["skyTop", "skyHorizon", "skyBottom", "sunColor", "ambientSky", "ambientGround", "fogColor"];
const NUM_KEYS = ["sunIntensity", "sunElevation", "ambientIntensity", "fogNear", "fogFar", "exposure", "shadow"];

function lerpMood(a, b, t) {
  const out = {};
  for (const k of COLOR_KEYS) {
    const ca = rgb(a[k]), cb = rgb(b[k]);
    out[k] = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
  }
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

// 색을 이미 [r,g,b] 로 가진 무드끼리 섞을 때
function lerpResolved(a, b, t) {
  const out = {};
  for (const k of COLOR_KEYS) {
    out[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t, a[k][2] + (b[k][2] - a[k][2]) * t];
  }
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/**
 * 배합 벡터 → 실제 연출값.
 *
 * 상위 2개만 반영한다 — lib/bgmBlend.js·moodMix.js 와 같은 규칙이다.
 * 셋을 다 섞으면 색이 사라져 "같은 장면에 조명만 다른 버전"이 된다
 * (구현_리스크 §4-6 이 지적한 위험).
 *
 * @param scores      {R,H,C} 0~1
 * @param confidence  0~1. 낮으면 중립 쪽에 붙여 둔다 — 아직 판단이 안 섰는데
 *                    하늘이 확 바뀌면 관객이 그걸 눈치챈다. 증거가 쌓일수록
 *                    날씨가 그쪽으로 기운다.
 */
export function moodFor(scores, confidence = 1) {
  if (!scores) return lerpMood(MOODS.neutral, MOODS.neutral, 0);

  const sorted = ["R", "H", "C"]
    .map((g) => [g, clamp01(scores[g])])
    .sort((a, b) => b[1] - a[1]);

  const [g1, w1] = sorted[0];
  const [g2, w2] = sorted[1];
  const sum = w1 + w2 || 1;

  // 상위 2개끼리 먼저 섞고
  const blended = lerpMood(MOODS[g1], MOODS[g2], w2 / sum);
  // 확신도만큼 중립에서 그쪽으로 이동한다
  const strength = clamp01(0.25 + confidence * 0.75) * clamp01(w1 + w2);
  const neutral = lerpMood(MOODS.neutral, MOODS.neutral, 0);
  return lerpResolved(neutral, blended, strength);
}

/** 프레임마다 목표 무드로 완만하게 따라간다 — 값이 뚝뚝 끊기지 않게. */
export function approachMood(current, target, alpha) {
  if (!current) return target;
  return lerpResolved(current, target, clamp01(alpha));
}

export const MOOD_KEYS = { COLOR_KEYS, NUM_KEYS };
