// 디렉터 모니터·HUD 의 문구 도우미(순수 함수) —
//   (1) 줄바꿈이 라벨과 값 사이에서 일어나지 않게 붙인다(B65). 패널(폭 320px)은 word-break: keep-all 로 한글 단어
//       안에서는 끊지 않지만 "회복 0.848s" 처럼 라벨과 숫자 사이의 보통 공백에서는 끊긴다("회복 / 0.848s").
//       숫자·부호 앞의 공백을 줄바꿈 없는 공백(U+00A0)으로 바꾸면 " · " 구분자에서만 줄이 접힌다.
//   (2) "도달가능 트랙: R … · H … · C … → H" 가 "트랙을 H 로 바꾼다" 로 읽히지 않게 점수 줄을 만든다(B154).
//       selectTrack 의 track 은 도달 점수(0.7)와 장르 성향(0.3)을 섞은 선택이라 도달 점수 최고와 다를 수 있다
//       (bias=R:6 완주: R 0.869 · H 0.947 · C 0.89 인데 선택 R). 둘 다 참고값이고 판정 트랙은 바뀌지 않는다.

const NBSP = " ";

/** 숫자·부호(0-9 − + × .) 앞의 보통 공백을 줄바꿈 없는 공백으로. 그 밖의 공백(" · ", 단어 사이)은 그대로 둔다. */
export function glueNumbers(text) {
  if (text == null) return text;
  return String(text).replace(/ (?=[0-9−+×.])/g, NBSP);
}

/** 라벨과 값을 줄바꿈 없는 공백으로 잇는다. pair("회복", "0.848s") → "회복 0.848s" */
export function pair(label, value) {
  return `${label}${NBSP}${value}`;
}

/**
 * 도달 점수를 세 조각으로. sel = lib/trackSelect selectTrack 결과 {track, reach:{R,H,C}}.
 *   best  = 도달 점수가 가장 높은 트랙, pick = selectTrack 이 고른 트랙(성향 반영), scores = "R 0.87 · H 0.95 · C 0.89"
 */
export function reachParts(sel) {
  if (!sel || !sel.reach) return null;
  const r = sel.reach;
  const best = ["R", "H", "C"].slice().sort((a, b) => (r[b] ?? 0) - (r[a] ?? 0))[0];
  return { best, pick: sel.track, scores: ["R", "H", "C"].map((g) => pair(g, r[g])).join(" · ") };
}

/**
 * 도달 점수 한 줄(B154). 도달 점수 최고와 성향 반영 선택이 다르면 둘 다 적는다.
 * current 는 지금 트랙 — 문자열(판정 뒤)이고 선택과 다르면 "현재 R 유지" 를 붙여 트랙이 바뀌지 않음을 밝힌다.
 * current 가 판정 전 배합 객체(B92)거나 없으면 붙이지 않는다. 화살표(→)는 쓰지 않는다.
 *   "도달 점수 R 0.777 · H 0.926 · C 0.85 · 최고 H(참고 · 현재 R 유지)"
 *   "도달 점수 R 0.869 · H 0.947 · C 0.89 · 최고 H · 성향 반영 선택 R(참고)"
 * 라벨과 값("최고 H"·"현재 R")은 줄바꿈 없는 공백으로 잇는다 — 1배속 완주 프레임에서 "최고 / H(참고)" 로 갈렸다.
 */
export function reachText(sel, current) {
  const p = reachParts(sel);
  if (!p) return null;
  const pickNote = p.pick && p.pick !== p.best ? ` · ${pair("성향 반영 선택", p.pick)}` : "";
  const keep = typeof current === "string" && current && current !== p.pick ? ` · ${pair("현재", current)} 유지` : "";
  return `도달 점수 ${p.scores} · ${pair("최고", p.best)}${pickNote}(참고${keep})`;
}
