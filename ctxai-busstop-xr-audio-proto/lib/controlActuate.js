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
//   6. 미세 자극 뒤 멈춤(B75) — 첫 번째 손(미세 자극)이 방금 울렸으면 HOLD_AFTER_MICRO 초 동안 u 를
//      직전 값에 묶어 둔다(mode "settle"). 자극 직후 x̂ 은 과도 응답으로 잠깐 치솟는데, 그 봉우리를 보고
//      연속 손이 곧바로 이완으로 맞서면 두 손이 서로 싸운다(3배속 실측에서 u −1 까지 갔다). 창이 끝나면
//      그때의 x̂ 으로 다시 판단한다. 시뮬(sim-b75-two-hands.png)에서 이 창은 모델 관객의 충돌을 0 으로 만들고
//      긴장 봉우리는 바꾸지 않았다.
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
  HOLD_AFTER_MICRO: 5, // 미세 자극 뒤 연속 손을 멈추는 창(영화 시간 초, B75) ≈ 응답 상승 + 보통형 2τ(잠정치)
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
 * @param {number} [a.tNow]        현재 영화 시간(초) — lastMicroAt 과 함께 주면 미세 자극 뒤 멈춤 창을 본다
 * @param {number} [a.lastMicroAt] 직전 미세 자극 시각(영화 시간 초). 없으면 멈춤 창 없음
 * @returns {{u:number, uTarget:number, mode:"arouse"|"relax"|"hold"|"settle"|"off", err:number, gScale:number, offsets:object, settleLeft?:number}}
 *   mode "hold" 는 데드밴드 안(u 를 0 쪽으로 되돌리는 중), "settle" 은 미세 자극 뒤 멈춤 창(u 를 직전 값에 묶음).
 */
export function actuationFor({ xhat, target, tol, ceiling = 1, track, theta, prev, dt = 0.25, active = true, tNow, lastMicroAt }, params = ACTUATE_PARAMS) {
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

  // 미세 자극 뒤 멈춤 창 — u·오프셋은 직전 값 그대로. err·uTarget 은 "창이 없었다면" 을 기록용으로 남긴다.
  const since = Number.isFinite(tNow) && Number.isFinite(lastMicroAt) ? tNow - lastMicroAt : Infinity;
  if (P.HOLD_AFTER_MICRO > 0 && since >= 0 && since < P.HOLD_AFTER_MICRO) {
    return { u: u0, uTarget: r4(uTarget), mode: "settle", err: r4(err), gScale: r4(gScale), offsets: offsetsFor(track, u0), settleLeft: r4(P.HOLD_AFTER_MICRO - since) };
  }

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

// 실제로 움직인 양(B116) — 오프셋은 "밀려고 한 양" 이고, 무대가 받은 양은 얹은 뒤 − 얹기 전이다.
// 범위(RANGES)나 트리거가 이미 끝까지 민 축은 오프셋이 있어도 0 이다. 대표 사례가 공포 트랙의 가로등:
// deriveParams 의 lampEarlyOn 트리거가 판정 전에 base 를 1.0 으로 켜 두므로 각성 쪽 +0.6 은 전부 잘린다
// (B11c 비교에서 ON−OFF 가로등 0.00). 모니터가 오프셋을 그대로 적으면 "가로등 +0.60" 이 움직이지 않은
// 축에도 찍힌다.
// 그래서 가로등은 공포 트랙에서 이완(u < 0 · 과민 관객) 방향으로만 실제로 움직이고(1.0 → 0.4), 로맨스·블랙코미디는
// 오프셋 0 이다(B245 · 연속 파라미터 6개 중 각성 쪽으로 미는 축은 5개). 설계 결정이라 lampEarlyOn 의 헤드룸은
// 여기서 바꾸지 않고 문서(설계 §9 · 개발_이어가기 §10.2 · 기술 요약 한계)에 적었다.
// 포화·한계 판정은 오프셋 크기에 대한 상대 기준이다(검토 턴 31). 절대 기준 1e-3 은 안개처럼 오프셋 자체가
// 작은 축(로맨스 트랙 u 0.08 → −0.0005)을 실제로 다 움직였는데도 "포화" 로 찍었다. 잠정치.
const EFFECT_REL = 0.05;   // 오프셋의 5% 도 못 움직이면 포화, 95% 에 못 미치면 한계
const EFFECT_FLOOR = 1e-6; // 부동소수 오차 바닥
// 못 움직인 축은 base 가 이미 미는 쪽 범위 끝(또는 그 너머 · 작가 앵커)에 있다는 뜻이므로, 모니터에는 "포화" 대신
// 상태로 적는다 — "가로등 1.00(상한)". 1배속 ON 완주의 연속 구동 줄 55개 중 40개가 "가로등 포화(1.00)" 을 반복해
// 제어기 결함처럼 읽혔다(B245 · work/evidence/review68/film-samples.jsonl).

/**
 * 오프셋이 0 이 아닌 축마다 실제로 움직인 양.
 * @param {object} base     deriveParams 결과(오프셋을 얹기 전). BGM 은 배율 1 이 기준이라 base 가 필요 없다
 * @param {object} offsets  actuationFor().offsets
 * @returns {Array<{key:string, offset:number, delta:number, value:number, saturated:boolean, clipped:boolean, bound:("upper"|"lower"|null)}>}
 *   delta = 얹은 뒤 − 얹기 전(BGM 은 배율 − 1), value = 얹은 뒤 값. saturated = 오프셋이 있는데 하나도 못 움직임
 *   (bound = 미는 쪽의 범위 끝 · 오프셋 양수면 "upper", 음수면 "lower" · 못 움직인 축에만 · B245),
 *   clipped = 일부만 움직임(범위 끝에 닿음). base 에 없는 축(BGM 제외)은 건너뛴다.
 */
export function actuationEffect(base, offsets) {
  const o = offsets || ZERO;
  const applied = applyActuation(base, o);
  const out = [];
  for (const k of ACTUATED_KEYS) {
    const off = o[k] || 0;
    if (!off) continue;
    let delta, value;
    if (k === "bgmGain") { value = bgmScale(o); delta = value - 1; }
    else {
      if (!Number.isFinite(base?.[k])) continue;
      value = applied[k]; delta = value - base[k];
    }
    const tol = Math.max(EFFECT_FLOOR, Math.abs(off) * EFFECT_REL);
    const saturated = Math.abs(delta) < tol;
    const clipped = !saturated && Math.abs(delta) < Math.abs(off) - tol;
    const bound = saturated ? (off > 0 ? "upper" : "lower") : null;
    out.push({ key: k, offset: r4(off), delta: r4(delta) || 0, value: r4(value), saturated, clipped, bound });
  }
  return out;
}

const sgn = (v, d = 2) => (v > 0 ? "+" : "") + v.toFixed(d);
// digits: 증감(fmt)을 적는 자릿수. 이 자릿수에서 0 이 되는 양은 줄에 적지 않는다(sessionCompare 의 shows 와 같은 규칙).
const AXIS_TEXT = {
  npcSilence: { label: "침묵", fmt: (v) => `${sgn(v)}s`, val: (v) => `${v.toFixed(2)}s`, digits: 2 },
  bgmGain: { label: "BGM", fmt: (v) => `×${(1 + v).toFixed(2)}`, val: (v) => `×${v.toFixed(2)}`, digits: 2 },
  lampOn: { label: "가로등", fmt: (v) => sgn(v), val: (v) => v.toFixed(2), digits: 2 },
  fogDensity: { label: "안개", fmt: (v) => sgn(v, 3), val: (v) => v.toFixed(3), digits: 3 },
  npcDistance: { label: "거리", fmt: (v) => `${sgn(v)}m`, val: (v) => `${v.toFixed(2)}m`, digits: 2 },
  npcGaze: { label: "시선", fmt: (v) => `${sgn(v * 100, 0)}%`, val: (v) => `${Math.round(v * 100)}%`, digits: 0, scale: 100 },
};
const shows = (t, v) => Number(Math.abs((v || 0) * (t.scale || 1)).toFixed(t.digits)) !== 0;

/**
 * 디렉터 모니터 "연속 구동" 한 줄(B116). base 를 주면 실제로 움직인 양을 적는다:
 *   움직인 축 "침묵 +0.58s", 범위 끝에 닿아 일부만 움직인 축 "침묵 +0.40s(한계)",
 *   이미 범위 끝이라 못 움직인 축은 지금 값과 상태로 "가로등 1.00(상한)"·"침묵 0.40s(하한)"(B245 · 종전 "가로등 포화(1.00)").
 * 오프셋이나 움직인 양이 표시 자릿수에서 0 이 되는 축은 적지 않는다("안개 +0.000"·"안개 0.100(상한)" 대신 생략).
 * base 가 없으면(구버전 호출) 종전처럼 오프셋을 적는다.
 */
export function actuationText(offsets, base) {
  const o = offsets || ZERO;
  const effects = base ? Object.fromEntries(actuationEffect(base, o).map((e) => [e.key, e])) : null;
  const parts = [];
  for (const [k, t] of Object.entries(AXIS_TEXT)) { // 표시 순서는 AXIS_TEXT 순(종전 모니터와 같다)
    if (!effects) { if (shows(t, o[k])) parts.push(`${t.label} ${t.fmt(o[k])}`); continue; }
    const e = effects[k];
    if (!e || !shows(t, e.offset)) continue;
    if (e.saturated) parts.push(`${t.label} ${t.val(e.value)}(${e.bound === "lower" ? "하한" : "상한"})`);
    else if (shows(t, e.delta)) parts.push(`${t.label} ${t.fmt(e.delta)}${e.clipped ? "(한계)" : ""}`);
  }
  return parts.length ? parts.join(" · ") : "오프셋 0";
}
