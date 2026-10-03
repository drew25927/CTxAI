// /interim 판정 뒤 관객별 연출(B170a) — 다섯 신호 판정(팀 코드, "누가 옆에 앉는가")은 그대로 두고, 판정 뒤 인사 구간
// (1:58 기둥 옆 등장 ~ 2:20 암전)의 "어떻게 다가와 앉는가" 네 값을 관객 응답 모델 θ̂ 와 사건 반응 봉우리 x̂ 로 정한다.
//
//   seatDistance  옆사람 착석 거리(m)          — interimTimeline.evalActors 의 seatX = 0.35 + 거리
//   approachSec   기둥 옆에서 벤치까지 걸어오는 시간(초) — 지금은 T.npcSeated − T.figureGone = 6초 고정
//   greetDelaySec 앉은 뒤 인사(greeting 큐)까지 기다리는 시간(초) — 지금은 T.greeting − T.npcSeated = 6초 고정
//   gazeAtViewer  앉은 뒤 관객을 보는 비율(0~1)  — ReactiveStage 의 npcGaze. /interim 무대는 deriveParams 가 주는 장르 앵커(공포 0.12·로맨스 0.75·
//                 코미디 0.5)를 이미 쓰고 있으므로, 배선은 앵커와의 차이를 applyActuation 오프셋(adjustRef)으로 얹는다
//
// 왜 여기인가 — 미션 문장 "5신호 판정 위에 θ 와 x̂ 를 얹어 관객마다 다른 연출이 화면에서 보이게" 가 /interim 에서는 비어 있었다
// (θ̂·x̂ 는 HUD·디렉터 모니터·종료 카드에만 쓰였고 연출을 바꾸지 않았다). 도입부 다섯 사건 S1~S5 는 θ 를 공정히 읽는 중립 탐침이라
// 그대로 두고, 판정이 끝난 뒤에만 바꾼다. 이 파일은 순수 함수만 둔다(node 로 테스트: scripts/test-interim-adapt.mjs).
// 배선(B170b): app/interim/page.js 가 판정 순간 한 번 interimAdapt() 를 불러 adaptRef 에 두고 — evalActors 에 seatDistance·approachSec 를,
// 인사 큐 발동 시각에 times.greeting 을, 무대(ReactiveStage adjustRef)에 시선 오프셋을 넘기며, 세션 control.adapt 와 control:adapt 이벤트로 남긴다.
// ?adapt=0 이면 고정 연출(오늘 값) — 같은 관객으로 켬/끔 비교가 된다.
//
// 규칙
//   1. 민감도 지수 s ∈ [−1, +1] — 이득 g(무게 ½) · 회복 τ(¼) · 사건 반응 봉우리 x̂(¼)의 가중합. 각 항은 사전분포(VIEWER_PRIOR)를
//      0 으로 두고 "두 배 이득 = +1", "회복 1.5초 느림 = +1", "봉우리 0.9 = +1" 로 정규화한다. 과민(+): 이득 큼·회복 느림·봉우리 높음.
//      봉우리가 없으면(사건 반응 0) g·τ 두 항만 무게를 다시 맞춰 쓴다.
//   2. 과민 관객은 더 멀리 · 천천히 · 늦게 · 눈을 덜 맞추고, 둔감 관객은 더 가까이 · 빨리 · 일찍 · 눈을 더 맞춘다. 장르와 무관한
//      "세기" 다이얼이다 — 장르(누가 앉는가)는 팀 판정이 이미 정했고, 여기서는 그 사람이 얼마나 부담스럽게 다가오는가만 조절한다.
//   3. 바탕값은 장르 앵커(lib/directionMap.js ANCHORS — /film 과 같은 창작값)에서 거리·시선을, 타임라인(lib/interimTimeline.js T)에서
//      시간을 가져온다. 공포는 멀고(1.2) 눈을 피하고(0.12), 로맨스는 가깝고(0.78) 오래 본다(0.75).
//   4. θ̂ 가 서지 않았으면(θ̂ 없음 · 응답 2건 미만 · 신뢰도 0.2 미만) 오늘의 고정 연출(거리 0.9 · 6초 · 6초 · 시선은 장르 앵커 그대로)을 돌려준다 —
//      추정 없이 연출을 바꾸지 않는다(slotActuate.decideSlot "θ̂ 이 없으면 중립" 과 같은 원칙). 1배속 합성 차분형은 응답 1/5 · 신뢰도 0.1 이라
//      이 갈래로 간다(work/evidence/review51/compare/sessions/…_interim_R.json).
//   5. 출력은 범위 안 — 거리 0.5~1.4(controlActuate RANGES.npcDistance = 요청서 v5.0 §2.7), 시간은 인사가 암전 4초 전에는 나오게.
//
// 값은 전부 잠정치(창작 결정) — 파일럿을 보고 기획·연출이 고친다.

import { VIEWER_PRIOR } from "./viewerModel.js";
import { ANCHORS } from "./directionMap.js";
import { T } from "./interimTimeline.js";

export const ADAPT_PARAMS = Object.freeze({
  MIN_RESP: 2,          // 응답 2건 미만이면 θ̂ 는 사전분포에 끌린 값 — 바꾸지 않는다(잠정치)
  MIN_CONFIDENCE: 0.2,  // fitViewerModel.confidence 하한(응답 2건 · 반복 횟수 한 가지 = 0.2)
  G_REF: VIEWER_PRIOR.g,      // 이득 기준(0.6) — 이 값이 지수 0
  G_LOG_SPAN: Math.log(2),    // 이득 두 배 = +1, 절반 = −1
  TAU_REF: VIEWER_PRIOR.tau,  // 회복 기준(2.0초)
  TAU_SPAN: 1.5,              // 회복 1.5초 느림 = +1
  PEAK_REF: 0.5,              // 사건 반응 봉우리 x̂ 기준
  PEAK_SPAN: 0.4,             // 봉우리 0.9 = +1 · 0.1 = −1
  W_G: 0.5, W_TAU: 0.25, W_PEAK: 0.25, // 가중치(합 1). 봉우리가 없으면 g·τ 를 다시 정규화
  DIST_SPAN: 0.3,       // s = ±1 에서 거리 ±0.3 m
  APPROACH_SPAN: 2.5,   // ±2.5 초 — 과민이면 천천히 다가온다
  GREET_SPAN: 3,        // ±3 초 — 과민이면 앉은 뒤 한참 있다가 말을 건다
  GAZE_SPAN: 0.2,       // ±0.2 — 과민이면 눈을 덜 맞춘다
  END_MARGIN_SEC: 4,    // 인사는 암전(T.end) 이 값 전에는 나와야 한다
});

// 오늘의 고정 연출(θ̂ 가 서지 않았을 때 그대로 돌려주는 값) — interimTimeline 의 상수와 같다. 시선은 여기 없다: 오늘 /interim 무대의
// 시선은 deriveParams 가 주는 장르 앵커(ANCHORS[genre].npcGaze)라 장르마다 다르고, 고정 갈래는 그 앵커를 그대로 돌려준다.
export const FIXED = Object.freeze({
  seatDistance: ANCHORS.neutral.npcDistance,   // 0.9 (= evalActors 의 seatX = 0.35 + 0.9)
  approachSec: T.npcSeated - T.figureGone,      // 6
  greetDelaySec: T.greeting - T.npcSeated,      // 6
});

// 적용 뒤 허용 범위. 거리는 controlActuate.RANGES.npcDistance 와 같은 값(요청서 v5.0 §2.7), 시간은 타임라인이 깨지지 않는 선.
// 거리 상한 1.4 는 요청서 v5.0 §2.7 · /film controlActuate.RANGES.npcDistance 와 같은 값이다. 공포 앵커 1.2 는 과민 쪽 여유가 0.2 m 뿐이지만
// 상한을 넓히지 않는다(B212 결정 · 2026-09-30): 무대 벤치(painted_wooden_bench.glb 폭 1.165 m × scale 1.9 = 2.21 m · 중심 x 0.6 → 끝 x ≈ 1.71)에서
// 옆사람 착석 x = 0.35 + 거리라 1.4 m 는 이미 벤치 끝(1.75)이다. 공포 과민은 거리 대신 걸어옴·기다림·시선이 더 가른다. 더 멀리 두려면 벤치를 늘려야 한다.
export const ADAPT_RANGES = Object.freeze({
  seatDistance: [0.5, 1.4],
  approachSec: [3, 9],
  greetDelaySec: [2.5, 9.5],
  gazeAtViewer: [0, 1],
});

export const GENRES = Object.freeze(["R", "H", "C"]);

function clamp(x, lo, hi) { return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; }
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

/** x̂ 봉우리 인자 — 숫자, sessionCompare.xhatPeak 의 {tension}, 또는 null. */
function peakValue(xhatPeak) {
  if (xhatPeak == null) return null;
  const v = typeof xhatPeak === "number" ? xhatPeak : xhatPeak.tension;
  return Number.isFinite(v) ? v : null;
}

/** θ̂ 가 연출을 바꿀 만큼 섰는가. 아니면 이유 문장을 돌려준다(null = 됐다). */
export function adaptBlockReason(theta, P = ADAPT_PARAMS) {
  if (!theta) return "관객 모델 없음";
  const n = theta.n ?? 0, nResp = theta.nResp ?? 0;
  if (n === 0) return "기록된 사건 없음";
  if (nResp < P.MIN_RESP) return `응답 ${nResp}/${n} · 모델이 서지 않음`;
  if (!(Number.isFinite(theta.confidence) && theta.confidence >= P.MIN_CONFIDENCE)) return `모델 신뢰도 ${Math.round((theta.confidence || 0) * 100)}% · 기준 ${Math.round(P.MIN_CONFIDENCE * 100)}% 미만`;
  if (!(Number.isFinite(theta.g) && theta.g > 0)) return "이득 추정값 없음";
  return null;
}

/**
 * 민감도 지수 s ∈ [−1, +1] 과 그 항들.
 * @returns {{index:number, parts:{g:number, tau:number, peak:number|null}}}
 */
export function sensitivityIndex(theta, xhatPeak, P = ADAPT_PARAMS) {
  const g = Number.isFinite(theta?.g) && theta.g > 0 ? theta.g : P.G_REF;
  const tau = Number.isFinite(theta?.tau) ? theta.tau : P.TAU_REF;
  const sG = clamp(Math.log(g / P.G_REF) / P.G_LOG_SPAN, -1, 1);
  const sTau = clamp((tau - P.TAU_REF) / P.TAU_SPAN, -1, 1);
  const pk = peakValue(xhatPeak);
  const sPeak = pk == null ? null : clamp((pk - P.PEAK_REF) / P.PEAK_SPAN, -1, 1);
  let index;
  if (sPeak == null) {
    const w = P.W_G + P.W_TAU;
    index = (P.W_G * sG + P.W_TAU * sTau) / (w > 0 ? w : 1);
  } else {
    const w = P.W_G + P.W_TAU + P.W_PEAK;
    index = (P.W_G * sG + P.W_TAU * sTau + P.W_PEAK * sPeak) / (w > 0 ? w : 1);
  }
  return { index: r3(clamp(index, -1, 1)), parts: { g: r3(sG), tau: r3(sTau), peak: sPeak == null ? null : r3(sPeak) } };
}

/** 지수 → 사람이 읽는 성향 이름(잠정 경계 ±0.33). */
export function profileLabel(index) {
  if (!Number.isFinite(index)) return "보통";
  return index >= 0.33 ? "과민" : index <= -0.33 ? "둔감" : "보통";
}

/**
 * /interim 판정 뒤 관객별 연출 값.
 * @param {object} a
 * @param {object|null} a.theta     fitViewerModel 결과 θ̂ ({g,L,tau,rho,n,nResp,confidence})
 * @param {number|{tension:number}|null} [a.xhatPeak]  사건 반응 창 안 x̂ 최고(sessionCompare.xhatPeak) — 없으면 g·τ 만
 * @param {"R"|"H"|"C"|null} [a.genre]  팀 판정 장르(finalGenre). 없거나 모르면 중립 앵커
 * @param {object} [params]  ADAPT_PARAMS 덮어쓰기
 * @returns {{adapted:boolean, seatDistance:number, approachSec:number, greetDelaySec:number, gazeAtViewer:number,
 *   index:number, profile:string, parts:{g,tau,peak}|null, base:{seatDistance,gazeAtViewer}, genre:string|null,
 *   times:{figureGone:number, npcSeated:number, greeting:number}, reason:string}}
 *   adapted=false 면 거리·걸어옴·기다림은 FIXED 와 정확히 같고 시선은 장르 앵커(base.gazeAtViewer) 그대로다.
 */
export function interimAdapt({ theta, xhatPeak = null, genre = null } = {}, params = ADAPT_PARAMS) {
  const P = { ...ADAPT_PARAMS, ...params };
  const gen = GENRES.includes(genre) ? genre : null;
  const anchor = gen ? ANCHORS[gen] : ANCHORS.neutral;
  const base = { seatDistance: anchor.npcDistance, gazeAtViewer: anchor.npcGaze };
  const times = (approach, greet) => {
    const npcSeated = r2(T.figureGone + approach);
    return { figureGone: T.figureGone, npcSeated, greeting: r2(npcSeated + greet) };
  };

  const blocked = adaptBlockReason(theta, P);
  if (blocked) {
    return {
      adapted: false, ...FIXED, gazeAtViewer: base.gazeAtViewer, index: 0, profile: "보통", parts: null, base, genre: gen,
      times: times(FIXED.approachSec, FIXED.greetDelaySec), reason: `${blocked} → 고정 연출`,
    };
  }

  const { index: s, parts } = sensitivityIndex(theta, xhatPeak, P);
  const R = ADAPT_RANGES;
  const seatDistance = r2(clamp(base.seatDistance + s * P.DIST_SPAN, R.seatDistance[0], R.seatDistance[1]));
  const approachSec = r2(clamp(FIXED.approachSec + s * P.APPROACH_SPAN, R.approachSec[0], R.approachSec[1]));
  // 인사가 암전 전에 나오도록 — 기둥 옆 등장(figureGone) + 다가옴 + 기다림 ≤ 암전 − 여유
  const greetMax = Math.min(R.greetDelaySec[1], T.end - P.END_MARGIN_SEC - T.figureGone - approachSec);
  const greetDelaySec = r2(clamp(FIXED.greetDelaySec + s * P.GREET_SPAN, R.greetDelaySec[0], Math.max(R.greetDelaySec[0], greetMax)));
  const gazeAtViewer = r2(clamp(base.gazeAtViewer - s * P.GAZE_SPAN, R.gazeAtViewer[0], R.gazeAtViewer[1]));
  const profile = profileLabel(s);
  const sign = s > 0 ? "+" : "";
  return {
    adapted: true, seatDistance, approachSec, greetDelaySec, gazeAtViewer, index: s, profile, parts, base, genre: gen,
    times: times(approachSec, greetDelaySec),
    reason: `${profile}(민감도 ${sign}${s.toFixed(2)} · 응답 ${theta.nResp}/${theta.n} · 신뢰도 ${Math.round(theta.confidence * 100)}%)`,
  };
}

/**
 * 비교 화면·카드용 한 줄 — "바꾼 연출" 줄의 본문.
 *   adapted: "공포형 옆사람 · 거리 1.35 m(앵커 1.2) · 8.2초 걸어와 7.5초 뒤 인사 · 시선 2% · 과민(민감도 +0.49 · 응답 5/5 · 신뢰도 100%)"
 *   fixed:   "고정 연출 · 거리 0.9 m · 6초 걸어와 6초 뒤 인사 · 시선 75% — 응답 1/5 · 모델이 서지 않음"(시선은 장르 앵커 · 로맨스 0.75)
 */
const secText = (x) => x.toFixed(1).replace(/\.0$/, "");
export function adaptText(a, labels = { R: "로맨스", H: "공포", C: "블랙코미디" }) {
  if (!a) return "";
  const who = a.genre ? `${labels[a.genre]} 옆사람` : "옆사람";
  const body = `거리 ${a.seatDistance} m${a.adapted ? `(앵커 ${a.base.seatDistance})` : ""} · ${secText(a.approachSec)}초 걸어와 ${secText(a.greetDelaySec)}초 뒤 인사 · 시선 ${Math.round(a.gazeAtViewer * 100)}%`;
  if (!a.adapted) return `고정 연출 · ${body} — ${a.reason.replace(/ → 고정 연출$/, "")}`;
  return `${who} · ${body} · ${a.reason}`;
}
