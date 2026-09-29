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

/** 배합을 큰 순서로 "공포 42% · 로맨스 35% · 블랙코미디 23%". */
export function mixText(mix, labels = GENRE_LABEL) {
  if (!mix) return "";
  return GENRES.slice()
    .sort((a, b) => (mix[b] || 0) - (mix[a] || 0))
    .map((g) => `${labels[g]} ${Math.round((mix[g] || 0) * 100)}%`)
    .join(" · ");
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
