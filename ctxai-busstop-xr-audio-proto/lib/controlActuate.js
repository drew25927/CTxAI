// 연속 파라미터 액추에이터 — 판정 뒤 장면에서 관객 긴장 x̂ 을 작가 곡선 쪽으로 은은하게 모는 두 번째 손.
//
// 미세 자극(slotController.microDecision)은 "한 번 톡 치는" 불연속 자극이라 올리는 방향밖에 없다.
// 이 모듈은 에셋 없이 이미 움직이는 연속 파라미터 여섯 개(대사 사이 침묵·BGM 볼륨·가로등·안개·
// 옆사람 거리·시선)를 양방향으로 민다: 목표 아래로 처지면 각성 쪽, 목표를 넘치거나 상한을 넘으면
// 이완 쪽. 결과는 lib/directionMap.js deriveParams 가 만든 값 위에 얹는 오프셋이다.
//
// 규칙
//   1. 데드밴드 — |목표 − x̂| ≤ tol(작가 곡선의 허용폭)이면 아무것도 하지 않고 오프셋을 0 으로 되돌린다.
//   2. 관객별 이득 — 같은 오차라도 θ̂ 이득 g 가 낮은 관객(잘 안 놀라는 사람)에게 더 세게, 높은
//      관객에게 더 약하게 민다(G_REF / g). "관객마다 다른 연출" 이 연속 채널에서도 생기는 자리다.
//   3. 상한 가중 — x̂ 이 트랙 상한(ceiling)을 넘으면 넘은 만큼 이완을 더 세게(제어기의 CEILING_PENALTY 와 같은 뜻).
//   4. 슬루 제한 — 구동량 u(−1~+1)는 초당 SLEW 이상 바뀌지 않는다. 관객이 "조명이 휙 바뀌었다" 고
//      알아채지 못하게 하는 장치다.
//   5. 비활성(active=false: 도입부 탐침 구간·?control=0) — u 를 즉시 0 으로, 오프셋은 정확히 0.
//      도입부 다섯 사건은 θ 를 공정히 읽는 중립 탐침이라 자극이 조금이라도 새면 추정이 오염된다.
//
// 방향표(AXES)는 "각성 = 그 트랙의 장르 색을 더 진하게" 로 정했다 — directionMap ANCHORS 에서 트랙
// 앵커가 중립 앵커로부터 떨어진 방향과 같은 부호다(공포는 침묵이 길고 안개가 짙고 옆사람이 멀다,
// 로맨스는 가깝고 오래 본다). 앵커끼리 차이가 없는 파라미터는 그 트랙에서 쓰지 않는다 — 가로등은
// 공포 트랙에서만 움직인다(로맨스·코미디 앵커는 가로등이 꺼진 오후). 값은 창작 결정이자 잠정치 —
// 기획·사운드가 파일럿을 보고 고친다.
// 범위는 정류장_역할별_요청서_v5.0.md §2.7 "코드가 제어할 것" 표를 넘지 않는다.

import { VIEWER_PRIOR } from "./viewerModel.js";

export const ACTUATE_PARAMS = Object.freeze({
  K_P: 4,            // 오차(허용폭 밖으로 나간 양) → 구동량. 0.25 넘게 벗어나면 포화(잠정치)
  K_CEIL: 2,         // 상한 초과분에 더 얹는 이완 가중(잠정치)
  G_REF: VIEWER_PRIOR.g, // 이 이득의 관객을 기준(배율 1)으로
  G_SCALE_MIN: 0.5,  // 이득 배율 하한 — 매우 잘 놀라는 관객도 절반까지만 줄인다
  G_SCALE_MAX: 2,    // 이득 배율 상한 — 잘 안 놀라는 관객도 두 배까지만
  SLEW: 0.2,         // 구동량 변화 한도(초당). 0 → 1 까지 5초
});

// 구동량 u = +1(최대 각성)일 때의 오프셋. u = −1 이면 부호가 반대(이완). 트랙별 창작값(잠정치).
// bgmGain 은 BGM 게인 배율의 증분이다(0.35 → 게인 ×1.35). 나머지는 deriveParams 값에 더한다.
export const AXES = Object.freeze({
  H: Object.freeze({ npcSilence: +0.6, bgmGain: +0.35, lampOn: +0.6, fogDensity: +0.02, npcDistance: +0.2, npcGaze: -0.1 }),
  R: Object.freeze({ npcSilence: -0.3, bgmGain: +0.3, lampOn: 0, fogDensity: -0.006, npcDistance: -0.2, npcGaze: +0.25 }),
  C: Object.freeze({ npcSilence: -0.3, bgmGain: +0.35, lampOn: 0, fogDensity: 0, npcDistance: -0.1, npcGaze: +0.2 }),
});

// 적용 뒤 값의 허용 범위. NPC 세 값은 요청서 v5.0 §2.7, 나머지는 렌더가 깨지지 않는 선.
export const RANGES = Object.freeze({
  npcSilence: [0.4, 2.5],
  npcDistance: [0.5, 1.4],
  npcGaze: [0, 1],
  lampOn: [0, 1],
  fogDensity: [0.008, 0.1],   // 0.1 을 넘으면 30m 카페가 지워진다
  bgmGain: [0.5, 1.6],        // BGM 게인 배율
});

export const ACTUATED_KEYS = Object.freeze(Object.keys(RANGES));

const ZERO = Object.freeze({ npcSilence: 0, bgmGain: 0, lampOn: 0, fogDensity: 0, npcDistance: 0, npcGaze: 0 });

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
const r4 = (x) => Math.round(x * 10000) / 10000;

/** 구동량 u 에서 트랙별 오프셋. 트랙을 모르면 0. */
export function offsetsFor(track, u) {
  const ax = AXES[track];
  if (!ax || !u) return { ...ZERO };
  const out = {};
  for (const k of ACTUATED_KEYS) out[k] = r4((ax[k] || 0) * u) || 0; // -0 을 0 으로
  return out;
}

/**
 * 한 틱의 연속 액추에이션.
 * @param {object} a
 * @param {number|null} a.xhat    현재 긴장 추정
 * @param {number} a.target       작가 곡선 목표(curveAt)
 * @param {number} a.tol          허용폭(데드밴드 반폭)
 * @param {number} [a.ceiling=1]  트랙 상한
 * @param {string} a.track        "H" | "R" | "C"
 * @param {object} [a.theta]      관객 모델 θ̂ (g 만 쓴다)
 * @param {{u:number}} [a.prev]   직전 틱 결과(없으면 u=0 에서 시작)
 * @param {number} [a.dt=0.25]    직전 틱 뒤 경과(영화 시간 초)
 * @param {boolean} [a.active=true] false 면 즉시 0(도입부 탐침·제어 OFF)
 * @returns {{u:number, uTarget:number, mode:"arouse"|"relax"|"hold"|"off", err:number, gScale:number, offsets:object}}
 */
export function actuationFor({ xhat, target, tol, ceiling = 1, track, theta, prev, dt = 0.25, active = true }, params = ACTUATE_PARAMS) {
  const P = params;
  if (!active || !AXES[track]) return { u: 0, uTarget: 0, mode: "off", err: 0, gScale: 1, offsets: { ...ZERO } };

  const g = Number.isFinite(theta?.g) && theta.g > 0 ? theta.g : P.G_REF;
  const gScale = clamp(P.G_REF / g, P.G_SCALE_MIN, P.G_SCALE_MAX);
  const band = Math.max(0, tol || 0);

  // 허용폭 밖으로 나간 양(부호: + 면 목표 아래 → 각성, − 면 위 → 이완). 안이면 0.
  let err = 0;
  if (xhat != null && Number.isFinite(xhat) && Number.isFinite(target)) {
    if (xhat < target - band) err = target - band - xhat;
    else if (xhat > target + band) err = target + band - xhat;
    if (xhat > ceiling) err -= P.K_CEIL * (xhat - ceiling);
  }
  const uTarget = clamp(P.K_P * gScale * err, -1, 1);

  const u0 = Number.isFinite(prev?.u) ? prev.u : 0;
  const step = P.SLEW * Math.max(0, dt);
  const u = r4(u0 + clamp(uTarget - u0, -step, step));
  const mode = uTarget > 0 ? "arouse" : uTarget < 0 ? "relax" : "hold";
  return { u, uTarget: r4(uTarget), mode, err: r4(err), gScale: r4(gScale), offsets: offsetsFor(track, u) };
}

/**
 * deriveParams 결과에 오프셋을 얹고 범위로 자른다. 입력은 바꾸지 않는다.
 * 오프셋이 전부 0 이면 입력과 같은 값을 돌려준다(OFF = 항등).
 */
export function applyActuation(params, offsets) {
  if (!params) return params;
  const o = offsets || ZERO;
  const out = { ...params };
  for (const k of ACTUATED_KEYS) {
    if (k === "bgmGain" || !Number.isFinite(params[k])) continue;
    if (!o[k]) continue;
    const [lo, hi] = RANGES[k];
    // 원래 값이 이미 범위 밖이면(작가 앵커가 범위를 벗어난 경우) 그 값을 넘어서까지 밀지는 않는다.
    out[k] = clamp(params[k] + o[k], Math.min(lo, params[k]), Math.max(hi, params[k]));
  }
  return out;
}

/** BGM 게인 배율(1 = 그대로). */
export function bgmScale(offsets) {
  const [lo, hi] = RANGES.bgmGain;
  return clamp(1 + (offsets?.bgmGain || 0), lo, hi);
}
