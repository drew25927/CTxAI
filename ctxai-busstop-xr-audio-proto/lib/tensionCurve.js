// 긴장 곡선 + 슬롯/변형 스키마 — 작가가 쓰는 것.
//
// 작가는 트랙(R/H/C)마다 "긴장이 시간에 따라 이렇게 흘렀으면" 하는 목표 곡선을 키프레임으로
// 쓰고, 엔진이 조절할 수 있는 자리(슬롯)마다 변형 후보(용량·채널)를 적는다. 제어기(slotController)는
// 이 곡선을 목표로, 이 변형 메뉴 안에서 관객마다 다른 자극을 골라 궤적을 곡선에 맞춘다.
//
// 사용자 지적(2026-09-13): "관객 반응에 따라 달라지는 게 목적인데 곡선을 미리 정하면 어긋난다."
// 그래서 곡선은 트랙별 형태(문법)만 고정하고, 어떤 관객이 어느 트랙 곡선을 따를지는 판정이 정한다.
// 곡선의 절대 높이는 관객 이득에 따라 제어기가 도달 가능한 선으로 완화한다(doseForTarget).
//
// 좌표: 긴장 tension 0~1(각성에 가까운 축). 시각은 영화 시간 초. 필수 키프레임(must)은 대본 사건과
// 묶여 시각을 옮기지 않는다 — 높이만 관객에 맞춘다. 값은 창작 결정이라 기획이 고친다.

export const TRACK_CURVES = {
  // 공포: 봉우리가 점점 높아지는 톱니. 골은 앞 봉우리의 절반 아래로 안 내려간다.
  H: {
    ceiling: 0.92,
    keyframes: [
      { t: 0, target: 0.15, tol: 0.1 },
      { t: 29, target: 0.55, tol: 0.1, must: true, event: "truckSplash" },
      { t: 40, target: 0.4, tol: 0.1 },
      { t: 52, target: 0.72, tol: 0.1, must: true, event: "catScream" },
      { t: 110, target: 0.62, tol: 0.12 },
      { t: 150, target: 0.85, tol: 0.1, must: true, event: "lastLine" },
      { t: 175, target: 0.3, tol: 0.15 },
    ],
  },
  // 로맨스: 완만한 한 방향 상승 뒤 안정. 놀람은 낮게 묶는다.
  R: {
    ceiling: 0.75,
    keyframes: [
      { t: 0, target: 0.15, tol: 0.1 },
      { t: 29, target: 0.3, tol: 0.12 },
      { t: 58, target: 0.35, tol: 0.12 },
      { t: 120, target: 0.55, tol: 0.12 },
      { t: 170, target: 0.7, tol: 0.12, must: true, event: "lastLine" },
      { t: 185, target: 0.4, tol: 0.15 },
    ],
  },
  // 블랙코미디: 짧은 파열의 반복, 매번 완전히 내려온다. 끝에서 해소.
  C: {
    ceiling: 0.7,
    keyframes: [
      { t: 6, target: 0.2, tol: 0.1 },
      { t: 29, target: 0.48, tol: 0.12 },
      { t: 37, target: 0.25, tol: 0.1 },
      { t: 45, target: 0.5, tol: 0.12, must: true, event: "cat" },
      { t: 60, target: 0.3, tol: 0.12 },
      { t: 150, target: 0.55, tol: 0.12 },
      { t: 175, target: 0.3, tol: 0.15 },
    ],
  },
};

// 슬롯 — 자극을 넣거나 조절할 수 있는 시점. 순서·대본은 고정 뼈대, 엔진은 변형만 고른다.
// 각 변형: id, dose(용량 0~1), dt(시각 밀기, 초), channel. narrativeCost = 이 변형을 쓸 때의 서사 부담.
export const SLOTS = [
  { id: "poster", event: "poster", t: 6, channel: "av", azimuth: 72, minGap: 0, narrativeCost: 0.1,
    variants: [ { id: "soft", dose: 0.3 }, { id: "mid", dose: 0.5 }, { id: "loud", dose: 0.7 } ] },
  { id: "figure", event: "cafeBell", t: 12, channel: "visual", azimuth: -38, minGap: 0, narrativeCost: 0.3,
    variants: [ { id: "brief", dose: 0.3 }, { id: "linger", dose: 0.5 }, { id: "return", dose: 0.6 } ] },
  { id: "truck", event: "truckSplash", t: 29, channel: "av", azimuth: 8, minGap: 0, narrativeCost: 0.1, required: true,
    variants: [ { id: "near", dose: 0.9 }, { id: "mid", dose: 0.6 }, { id: "far", dose: 0.4 } ] },
  { id: "frog", event: "frog", t: 37, channel: "audio", azimuth: 135, minGap: 4, narrativeCost: 0.1,
    variants: [ { id: "once", dose: 0.4 }, { id: "twice", dose: 0.6 }, { id: "loud", dose: 0.7 } ] },
  { id: "cat", event: "cat", t: 45, channel: "av", azimuth: 30, minGap: 0, narrativeCost: 0.3,
    variants: [ { id: "playful", dose: 0.4 }, { id: "mid", dose: 0.65 }, { id: "sudden", dose: 0.9 } ] },
  { id: "micro-lamp", event: "lampFlicker", t: null, tRange: [60, 150], channel: "visual", azimuth: 20, minGap: 8, narrativeCost: 0.2, optional: true,
    variants: [ { id: "flicker", dose: 0.3 } ] },
  { id: "micro-door", event: "farDoor", t: null, tRange: [60, 150], channel: "audio", azimuth: -60, minGap: 8, narrativeCost: 0.2, optional: true,
    variants: [ { id: "shut", dose: 0.25 } ] },
];

function clamp01(x) { return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; }

/** 트랙 곡선의 시각 t 목표값과 허용폭. 키프레임 사이는 선형 보간. */
export function curveAt(track, t) {
  const c = TRACK_CURVES[track];
  if (!c) return { target: 0, tol: 0.15, ceiling: 1 };
  const kf = c.keyframes;
  if (t <= kf[0].t) return { target: kf[0].target, tol: kf[0].tol ?? 0.12, ceiling: c.ceiling };
  if (t >= kf[kf.length - 1].t) { const last = kf[kf.length - 1]; return { target: last.target, tol: last.tol ?? 0.12, ceiling: c.ceiling }; }
  for (let i = 1; i < kf.length; i++) {
    if (t <= kf[i].t) {
      const a = kf[i - 1], b = kf[i];
      const f = (t - a.t) / (b.t - a.t);
      return { target: clamp01(a.target + (b.target - a.target) * f), tol: (a.tol ?? 0.12) + ((b.tol ?? 0.12) - (a.tol ?? 0.12)) * f, ceiling: c.ceiling };
    }
  }
  return { target: kf[kf.length - 1].target, tol: 0.12, ceiling: c.ceiling };
}

/** 필수 키프레임(must)의 이벤트 이름 집합. */
export function requiredEvents(track) {
  return new Set((TRACK_CURVES[track]?.keyframes || []).filter((k) => k.must).map((k) => k.event));
}

export function slotById(id) { return SLOTS.find((s) => s.id === id) || null; }
export function variantOf(slot, variantId) { return (slot?.variants || []).find((v) => v.id === variantId) || null; }

/**
 * 계획 검사 — 고른 변형들이 제약을 지키는지.
 * @param {string} track
 * @param {Array} plan  [{ slotId, variantId, t, channel, dose, predTension? }] 시각 순
 * @returns {{ ok:boolean, violations:string[] }}
 */
export function evaluatePlan(track, plan) {
  const v = [];
  const c = TRACK_CURVES[track];
  const ceiling = c?.ceiling ?? 1;
  const sorted = [...plan].sort((a, b) => a.t - b.t);
  // 순서
  for (let i = 0; i < plan.length; i++) if (plan[i].t !== sorted[i].t) { v.push("순서 위반: 슬롯이 시각 순이 아니다"); break; }
  // 같은 채널 연속(최소 간격 안)
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].t - sorted[i - 1].t;
    const minGap = Math.max(slotById(sorted[i].slotId)?.minGap || 0, slotById(sorted[i - 1].slotId)?.minGap || 0, 6);
    if (sorted[i].channel && sorted[i].channel === sorted[i - 1].channel && gap < minGap) v.push(`같은 채널 연속: ${sorted[i - 1].slotId}→${sorted[i].slotId} (${gap.toFixed(1)}s < ${minGap}s)`);
  }
  // 상한 초과
  for (const p of sorted) if (p.predTension != null && p.predTension > ceiling + 1e-9) v.push(`상한 초과: ${p.slotId} 예측 ${p.predTension.toFixed(2)} > ${ceiling}`);
  // 필수 이벤트 누락
  const covered = new Set(sorted.map((p) => slotById(p.slotId)?.event));
  for (const ev of requiredEvents(track)) if (ev !== "lastLine" && !covered.has(ev)) v.push(`필수 사건 누락: ${ev}`);
  // 필수 슬롯 삭제 금지
  for (const s of SLOTS) if (s.required && !sorted.some((p) => p.slotId === s.id)) v.push(`필수 슬롯 누락: ${s.id}`);
  return { ok: v.length === 0, violations: v };
}
