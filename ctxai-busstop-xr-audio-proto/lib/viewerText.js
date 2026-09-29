// 관객에게 보여 주는 결과 문장 — /film 종료 카드와 /film/compare 비교 화면이 같은 규칙을 쓰도록 한곳에 둔다.
//
// 판정(0:58)은 "누가 옆에 앉는가" 를 한 번 정하는 이산 결정이고, 연출 상태(directionState)는 그 뒤에도
// 반응을 계속 쌓는다(설계 원칙: 증거가 체험 내내 흐른다). 그래서 체험이 끝날 때의 배합은 판정 때와 다를 수
// 있다 — 판정은 공포 42 : 로맨스 35 로 공포를 앉혔는데 끝 배합은 로맨스 42 가 앞서는 식. 이것을 "마지막 배합"
// 하나로만 보이면 "옆에 앉은 사람: 공포 · 마지막 배합 로맨스 42%" 처럼 카드가 스스로 모순된다(B86).
// 여기서는 판정 때 배합을 주 문장으로, 끝 배합은 "판정 뒤 흐름" 으로 나눠 적는다.
//
// 순수 함수만 둔다(node 로 테스트: scripts/test-viewer-text.mjs).

export const GENRE_LABEL = { R: "로맨스", H: "공포", C: "블랙코미디" };
const GENRES = ["R", "H", "C"];

export function mmss(t) {
  const s = Math.max(0, Math.floor(Number(t) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function topOf(mix) {
  return GENRES.slice().sort((a, b) => (mix[b] || 0) - (mix[a] || 0))[0];
}

/**
 * 배합을 큰 순서로 "공포 42% · 로맨스 35% · 블랙코미디 23%".
 * 반올림한 뒤 이웃끼리 같은 값이 되면(예: .359 vs .357 → "로맨스 36% · 공포 36%") 1위가 왜 1위인지 카드에서 안 보이므로
 * 그때만 소수 한 자리(그래도 같으면 두 자리)로 내린다(B121). 동률이 아닌 보통 회차는 정수 그대로.
 */
export function mixText(mix, labels = GENRE_LABEL) {
  if (!mix) return "";
  const order = GENRES.slice().sort((a, b) => (mix[b] || 0) - (mix[a] || 0));
  const pct = order.map((g) => (mix[g] || 0) * 100);
  // 1위와 2위만 본다 — 2·3위의 동률(예: 드리프트가 끝난 /interim 의 "로맨스 100% · 공포 0% · 블랙코미디 0%")은 카드의 뜻을 바꾸지 않는다
  let digits = 0;
  for (; digits < 2; digits++) {
    if (pct[0].toFixed(digits) !== pct[1].toFixed(digits)) break;
  }
  return order.map((g, i) => `${labels[g]} ${pct[i].toFixed(digits)}%`).join(" · ");
}

/**
 * 판정 기록 — 세션에 저장된 verdict 가 있으면 그것, 없으면(B86 이전 세션) events 의 "cue judge" 시각에
 * 가장 가까운 앞쪽 trajectory 표본으로 되살린다. 판정 전에 끝난 세션이면 null.
 * @returns {{dominant, mix:{R,H,C}, t, confidence, source:"saved"|"trajectory"}|null}
 */
export function verdictOf(session) {
  if (!session) return null;
  const v = session.verdict;
  if (v && v.dominant && v.mix) return { dominant: v.dominant, mix: v.mix, t: v.t ?? null, confidence: v.confidence ?? null, source: "saved" };
  const judge = (session.events || []).find((e) => e.kind === "event" && e.name === "cue" && e.detail === "judge");
  const traj = session.trajectory || [];
  if (!judge || !traj.length) return null;
  let p = null;
  for (const s of traj) { if (s.t <= judge.t + 1e-6) p = s; else break; }
  if (!p) return null;
  const mix = { R: p.R, H: p.H, C: p.C };
  // 페이지는 판정 순간의 current 로 dominant 를 정했으므로 저장된 dominant 를 우선한다(표본 간격 0.5초의 차이).
  return { dominant: session.dominant || topOf(mix), mix, t: judge.t, confidence: p.confidence ?? null, source: "trajectory" };
}

/**
 * 종료 카드·비교 화면의 배합 두 줄.
 *  main  — "판정(0:58) 공포 42% · 로맨스 35% · 블랙코미디 23%" (판정이 없으면 끝 배합을 "끝 배합" 으로)
 *  after — 판정 뒤 흐름. 끝 배합의 1위가 판정과 다르면 "판정 뒤 반응은 로맨스 쪽으로 기울었습니다 (끝 배합 …)",
 *          같으면 "끝 배합 …". 판정이 없으면 null.
 *  drifted — 끝 배합의 1위가 판정과 다른가.
 */
export function mixLines({ verdict, final }, labels = GENRE_LABEL) {
  const fin = final?.current || final || null;
  if (!verdict) return { main: fin ? `끝 배합 ${mixText(fin, labels)}` : "", after: null, drifted: false };
  const when = verdict.t != null ? `판정(${mmss(verdict.t)})` : "판정";
  const main = `${when} ${mixText(verdict.mix, labels)}`;
  if (!fin) return { main, after: null, drifted: false };
  const endTop = topOf(fin);
  const drifted = endTop !== verdict.dominant;
  const after = drifted
    ? `판정 뒤 반응은 ${labels[endTop]} 쪽으로 기울었습니다 (끝 배합 ${mixText(fin, labels)})`
    : `끝 배합 ${mixText(fin, labels)}`;
  return { main, after, drifted };
}

// ─────────────────────────────────────────────────────────────────────────────
// 자극(탐침·사건) 이름 → 관객에게 보이는 이름. /film 종료 카드·/film/compare·/interim 이 같은 표를 쓴다(B108).
export const STIMULUS_LABEL = {
  poster: "포스터", cafeBell: "우비 인물", figure: "우비 인물", figureApproach: "우비 인물",
  truck: "물보라", truckSplash: "물보라", frog: "개구리", cat: "고양이", catScream: "비명",
  "micro-lamp": "가로등", "micro-door": "먼 문",
};
export function stimulusLabel(name) {
  if (!name) return "";
  if (STIMULUS_LABEL[name]) return STIMULUS_LABEL[name];
  if (/^micro-\d+$/.test(name)) return "먼 문 소리"; // /film 의 미세 자극은 micro-1, micro-2 … 로 기록된다(슬롯 micro-door)
  return name;
}

/**
 * 관객 반응 지문 — fitViewerModel 의 θ̂ 를 사람이 읽는 한 문장으로. /film 종료 카드·/film/compare·/interim 이 같은 규칙(B84·B108).
 * 이득 g 는 네 단(크게 흔들림 / 또렷이 / 가볍게 / 차분) — 1배속 합성 관객 세 프로필(공포형 g≈1.27, 호기심형 g≈1.04, 차분형 g≈0.6)이
 * 서로 다른 문장을 받도록 잡은 잠정치다. 응답이 2건 미만이면 지문 대신 그 사실을 정직하게 적는다(문장은 항상 나온다).
 */
export const FINGERPRINT_THRESHOLDS = { gainHigh: 1.2, gainClear: 0.9, gainLow: 0.45, latencyFast: 0.5, recoverFast: 2, habituate: 0.25 }; // 잠정치
export function fingerprintText(theta, T = FINGERPRINT_THRESHOLDS) {
  if (!theta) return null;
  const n = theta.n ?? 0, nResp = theta.nResp ?? 0;
  if (n === 0) return "기록된 사건이 없어 반응 지문을 만들지 못했습니다";
  if (nResp === 0) return `사건 ${n}개에 고개를 돌린 기록이 없어 반응 지문을 만들지 못했습니다`;
  if (nResp < 2) return `사건 ${n}개 중 한 번만 반응해 반응 지문을 쓰기에는 이릅니다`;
  const gain = theta.g >= T.gainHigh ? "자극마다 크게 흔들렸고, "
    : theta.g >= T.gainClear ? "자극에 또렷이 흔들렸고, "
    : theta.g >= T.gainLow ? "자극에 살짝 흔들렸고, "
    : "전반적으로 차분했고, ";
  const lat = theta.L < T.latencyFast ? "빠르게 반응하고" : "한 박자 늦게 반응하고";
  const rec = theta.tau < T.recoverFast ? "금방 가라앉았으며" : "여운이 오래 남았으며";
  const hab = theta.rho > T.habituate ? "반복될수록 반응이 눈에 띄게 줄었습니다" : "반복돼도 반응이 유지됐습니다";
  return `${gain}${lat} ${rec} ${hab}`;
}

// 장면 이름 — /film 은 phase 이벤트(intro·judged·scene·bus), /interim 은 cue 이벤트(judge·transition·greeting)로 장면이 바뀐다.
const PHASE_LABEL = { intro: "도입부", judged: "판정 직후", scene: "옆사람 장면", bus: "버스 장면", judge: "판정 직후", transition: "전환 장면", greeting: "인사 장면" };
function phaseEvents(events) {
  return (events || []).filter((e) => (e.name === "phase" && PHASE_LABEL[e.detail]) || (e.name === "cue" && typeof e.detail === "string" && ["judge", "transition", "greeting"].includes(e.detail)));
}
/** t 시각에 걸친 대사 줄 — talk 이벤트(detail.from ~ t). 창이 안 겹치면 3초 안의 가장 가까운 줄. */
export function talkAt(events, t0, t1 = t0) {
  let best = null;
  for (const e of events || []) {
    if (e.name !== "talk" || !e.detail || e.detail.from == null) continue;
    const a = e.detail.from, b = e.t;
    const overlap = a <= t1 && b >= t0;
    const gap = overlap ? 0 : Math.min(Math.abs(a - t1), Math.abs(b - t0));
    if (gap > 3) continue;
    if (!best || gap < best.gap) best = { seq: e.detail.seq, from: a, to: b, gap };
  }
  return best;
}
export function sceneAt(events, t) {
  let cur = null;
  for (const e of phaseEvents(events)) { if (e.t <= t + 1e-6) cur = PHASE_LABEL[e.detail]; else break; }
  return cur;
}

/**
 * /film 세션의 이벤트를 영화 시간으로 — /film 은 이벤트 t 와 집중도 시각이 실제 경과 초이고(directionState.elapsed),
 * talk 의 detail.from 과 verdict.t 만 영화 시간(film.t = 실제 초 × speed)이다. 1배속이면 둘이 같아 아무것도 바뀌지 않는다.
 * /interim 은 cue 이벤트가 이미 영화 시간이라 이 함수를 거치지 않는다.
 */
export function filmTimeEvents(events, speed = 1) {
  const sp = speed || 1;
  if (sp === 1) return events || [];
  return (events || []).map((e) => ({ ...e, t: e.t * sp }));
}

/**
 * 종료 카드·비교 화면의 "집중한 순간" — engagement.summary.topSegments[0] 을 사람이 읽는 말로(B117).
 *  near 가 있으면 "고양이 (0:45)", 없으면 그 시각에 걸친 대사 줄("대사 05 무렵 (1:43)")이나 장면 이름("버스 장면 (2:30)"),
 *  둘 다 없으면 "2:28 무렵". 시각은 언제나 m:ss.
 * 집중도 센서의 시각은 실제 경과 초라 배속 회차에서는 ctx.speed 를 곱해 영화 시간으로 맞춘다. ctx.events 는 영화 시간이어야 한다
 * (/film 은 filmTimeEvents 로 맞춰서, /interim 은 그대로).
 * @param {object} summary  engagement.summary
 * @param {{events?:Array, speed?:number}} ctx
 */
export function focusText(summary, ctx = {}) {
  const seg = summary?.topSegments?.[0];
  if (!seg) return null;
  const sp = ctx.speed || 1;
  const t0 = seg.t0 * sp, t1 = (seg.t1 ?? seg.t0) * sp;
  const when = mmss(t0);
  if (seg.near?.name) return `${stimulusLabel(seg.near.name)} (${when})`;
  const talk = talkAt(ctx.events, t0, t1);
  if (talk) return `대사 ${talk.seq} 무렵 (${when})`;
  const scene = sceneAt(ctx.events, t0);
  if (scene) return `${scene} (${when})`;
  return `${when} 무렵`;
}
