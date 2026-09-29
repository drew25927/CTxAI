// 슬롯 변형 액추에이터 — 제어기가 고른 변형(lib/tensionCurve.js SLOTS variants)을 /film 이 실제로 울리는 값으로 바꾼다.
//
// 배경(B78): 시뮬(lib/tensionSim.js full 모드)에서 관객 차이를 줄이는 주된 손은 슬롯 변형 선택인데, /film 은 계획을
// 모니터 권고·세션 기록에만 쓰고 개구리·고양이는 늘 같은 볼륨으로 울렸다. 이 모듈은 에셋을 새로 만들지 않고
// 이미 있는 효과음의 볼륨·반복 횟수·간격과 고양이 동선의 타이밍만으로 세 변형을 구현한다.
//
// 원칙
//   1. 도입부 탐침 세 개(poster·figure·truck)는 건드리지 않는다 — 관객을 공정히 읽는 중립 탐침이라 용량을 바꾸면 θ 추정이 오염된다.
//      제어하는 슬롯은 그 뒤의 frog(0:37)·cat(0:45) 둘이다(tensionSim N_PROBE=3 과 같은 경계).
//   2. 제어 OFF(?control 없음)는 지금까지의 /film 과 정확히 같다 — 볼륨 0.8 한 번, 고양이 동선 T.catIn→catStop→catOut→catGone.
//      ON/OFF 비교(B21)에서 OFF 가 기준선이어야 하므로 OFF 는 어떤 변형도 아닌 "고정 연출" 이다.
//   3. 결정 시각은 슬롯의 첫 자극보다 조금 앞이다(DECIDE_AT) — 고양이는 소리(43.6s)보다 동선(43s)이 먼저라 42s 에 정한다.
//      그 순간의 θ̂(앞 탐침 응답으로 적합)·x̂ 으로 slotController.chooseSlotNow 가 변형을 고른다.
//   4. 변형의 용량(dose)은 설계값 그대로 engagementSense 레코드에 기록한다 — θ̂ 회귀는 r = g·d·(1−ρ)^n 이라 실제로 넣은
//      용량을 알아야 이득을 바로 읽는다. 합성 관객(gazeSim)도 같은 용량 배율로 반응한다(DOSE_REF 기준).
// 값은 전부 창작·잠정치 — 사운드·기획이 파일럿을 듣고 고친다.

import { T } from "./filmTimeline.js";
import { SLOTS, slotById } from "./tensionCurve.js";
import { chooseSlotNow } from "./slotController.js";
import { TENSION_PARAMS } from "./tensionEstimate.js";

/** 제어 OFF 의 큐 볼륨 = 용량 기준(filmTimeline CUES frog·cat volume). 합성 관객은 이 용량에 배율 1 로 반응한다. */
export const NEUTRAL_DOSE = 0.8;

/** 제어기가 실제로 변형을 고르는 슬롯 — 탐침 3개 뒤의 시각 고정 슬롯. 순서는 시각 순. */
export const CONTROLLED_SLOTS = Object.freeze(["frog", "cat"]);

/** 결정 시각(영화 초) — 슬롯의 첫 자극(소리·동선)보다 앞. 잠정치. */
export const DECIDE_AT = Object.freeze({ frog: T.frog - 0.5, cat: T.catIn - 1.0 });

/** 고양이 동선의 구간 길이(초): 뛰어드는 시간·벤치 앞에서 노려보는 시간·달아나는 시간. 중립 = 지금 /film 값(2 / 1.5 / 2.5). */
export const CAT_TIMING_NEUTRAL = Object.freeze({ stop: T.catStop - T.catIn, pause: T.catOut - T.catStop, out: T.catGone - T.catOut });

// 변형 → 실제 값. sfx 는 public/reactive/audio/sfx_<key>.mp3, volume 0~1, plays 반복 횟수, gap 반복 간격(영화 초).
// 용량 순(dose 오름차순)으로 볼륨이 단조 증가해야 한다(테스트로 고정) — 제어기의 "용량이 크면 더 센 자극" 가정이 실제 소리에서도 성립하게.
export const SLOT_ACTUATION = Object.freeze({
  frog: Object.freeze({
    once:  Object.freeze({ sfx: "10", volume: 0.5, plays: 1, gap: 0 }),    // 한 번, 멀리서
    twice: Object.freeze({ sfx: "10", volume: 0.7, plays: 2, gap: 1.6 }),  // 두 번 — 두 번째 울음이 "아직 거기 있다" 는 느낌
    loud:  Object.freeze({ sfx: "10", volume: 1.0, plays: 1, gap: 0 }),    // 한 번, 바로 뒤에서
  }),
  cat: Object.freeze({
    playful: Object.freeze({ sfx: "11", volume: 0.5, plays: 1, gap: 0, timing: Object.freeze({ stop: 2.6, pause: 2.2, out: 2.4 }) }), // 느긋하게 다가와 오래 본다
    mid:     Object.freeze({ sfx: "11", volume: 0.8, plays: 1, gap: 0, timing: CAT_TIMING_NEUTRAL }),                               // 지금 /film 동선
    sudden:  Object.freeze({ sfx: "11", volume: 1.0, plays: 1, gap: 0, timing: Object.freeze({ stop: 1.1, pause: 0.7, out: 1.6 }) }), // 튀어들어 노려보고 바로 달아난다
  }),
});

/** 제어 OFF 의 고정 연출 — filmTimeline CUES 와 같은 값. 어떤 변형 id 도 아니다. */
export const NEUTRAL_ACTUATION = Object.freeze({
  frog: Object.freeze({ sfx: "10", volume: NEUTRAL_DOSE, plays: 1, gap: 0 }),
  cat: Object.freeze({ sfx: "11", volume: NEUTRAL_DOSE, plays: 1, gap: 0, timing: CAT_TIMING_NEUTRAL }),
});

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * 고양이 동선의 절대 시각(영화 초). 들어오는 시각(T.catIn)은 변형과 무관하게 고정 — 슬롯의 자리는 뼈대다.
 * @param {{stop:number, pause:number, out:number}} [timing=CAT_TIMING_NEUTRAL]
 * @returns {{catIn:number, catStop:number, catOut:number, catGone:number}}
 */
export function catSchedule(timing = CAT_TIMING_NEUTRAL) {
  const tm = { ...CAT_TIMING_NEUTRAL, ...(timing || {}) };
  const catIn = T.catIn;
  const catStop = r2(catIn + tm.stop);
  const catOut = r2(catStop + tm.pause);
  const catGone = r2(catOut + tm.out);
  return { catIn, catStop, catOut, catGone };
}

/**
 * 슬롯 하나의 실시간 결정.
 * @param {object} a
 * @param {"frog"|"cat"} a.slotId
 * @param {boolean} a.controlOn      ?control=1 인가. 아니면 고정 연출(중립)
 * @param {string}  a.track          잠정 우세 장르(판정 전) 또는 판정 결과
 * @param {object|null} a.theta      관객 모델 θ̂(fitViewerModel). 없으면 중립
 * @param {number|null} a.xhat       현재 긴장 추정
 * @returns {{slotId, variantId:string|null, dose:number, reason:string, actuation:object, schedule?:object, target?:number, predTension?:number, nth?:number}}
 */
export function decideSlot({ slotId, controlOn, track, theta, xhat }) {
  if (!CONTROLLED_SLOTS.includes(slotId)) throw new Error(`제어 대상 슬롯이 아니다: ${slotId}`);
  const neutral = NEUTRAL_ACTUATION[slotId];
  const withSchedule = (out, act) => (act.timing ? { ...out, schedule: catSchedule(act.timing) } : out);
  if (!controlOn) return withSchedule({ slotId, variantId: null, dose: NEUTRAL_DOSE, reason: "제어 OFF — 고정 연출(중립)", actuation: neutral }, neutral);
  if (!theta || !(theta.n > 0)) return withSchedule({ slotId, variantId: null, dose: NEUTRAL_DOSE, reason: "θ̂ 없음(탐침 응답 0) — 중립", actuation: neutral }, neutral);
  const c = chooseSlotNow(track, slotId, xhat ?? TENSION_PARAMS.BASE, theta);
  const act = SLOT_ACTUATION[slotId][c.variantId];
  if (!act) return withSchedule({ slotId, variantId: null, dose: NEUTRAL_DOSE, reason: `변형 ${c.variantId} 의 실제 값이 없다 — 중립`, actuation: neutral }, neutral);
  return withSchedule({ slotId, variantId: c.variantId, dose: c.dose, reason: c.reason, target: c.target, predTension: c.predTension, nth: c.nth, actuation: act }, act);
}

/** 모든 제어 슬롯의 모든 변형에 실제 값이 있는가(테스트·기동 점검용). 빠진 것의 "slot/variant" 목록을 돌려준다. */
export function missingActuations() {
  const out = [];
  for (const id of CONTROLLED_SLOTS) {
    const slot = slotById(id);
    for (const v of slot?.variants || []) if (!SLOT_ACTUATION[id]?.[v.id]) out.push(`${id}/${v.id}`);
  }
  return out;
}

export { SLOTS };
