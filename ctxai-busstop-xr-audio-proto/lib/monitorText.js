// 디렉터 모니터·HUD 의 문구 도우미(순수 함수) —
//   (1) 줄바꿈이 라벨과 값 사이에서 일어나지 않게 붙인다(B65). 패널(폭 320px)은 word-break: keep-all 로 한글 단어
//       안에서는 끊지 않지만 "회복 0.848s" 처럼 라벨과 숫자 사이의 보통 공백에서는 끊긴다("회복 / 0.848s").
//       숫자·부호 앞의 공백을 줄바꿈 없는 공백(U+00A0)으로 바꾸면 " · " 구분자에서만 줄이 접힌다.
//   (2) "도달가능 트랙: R … · H … · C … → H" 가 "트랙을 H 로 바꾼다" 로 읽히지 않게 점수 줄을 만든다(B154).
//       selectTrack 의 track 은 도달 점수(0.7)와 장르 성향(0.3)을 섞은 선택이라 도달 점수 최고와 다를 수 있다
//       (bias=R:6 완주: R 0.869 · H 0.947 · C 0.89 인데 선택 R). 둘 다 참고값이고 판정 트랙은 바뀌지 않는다.
//   (3) 연속 구동 한 줄(actuateLine) — 장면이 끝난 뒤 되돌림 구간을 "유지 u 0.00" 이 아니라 "장면 끝" 으로 적는다(B135).

import { actuationText } from "./controlActuate.js";

const NBSP = "\u00a0";

/**
 * 숫자·부호(0-9 − + × .) 앞의 보통 공백을 줄바꿈 없는 공백으로. 그 밖의 공백(" · ", 단어 사이)은 그대로 둔다.
 * 음수 부호(B65 재작업): 모니터 문구는 템플릿 리터럴로 숫자를 찍어 ASCII "-" 가 나온다(θ̂ 습관화 ρ "-0.06",
 * controlActuate 의 "시선 -8%"·"u -0.10"). 비교 화면(lib/sessionCompare)은 U+2212 "−" 를 쓴다. 공백·여는 괄호·줄 머리 뒤에서
 * 숫자를 여는 "-" 를 "−" 로 바꿔 두 화면의 부호를 맞추고, 그 앞 공백도 붙인다 — 예전 정규식은 "−" 만 받아 "습관화 / -0.06" 으로 갈렸다.
 * 숫자 사이의 "-"(날짜 09-29·범위 0.4-2.5)와 값 없음 표시("-" 단독)는 건드리지 않는다.
 */
export function glueNumbers(text) {
  if (text == null) return text;
  return String(text)
    .replace(/(^|[\s(])-(?=\.?[0-9])/g, "$1−")
    .replace(/ (?=[0-9−+×.])/g, NBSP);
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

const sgn = (v, d = 2) => (v > 0 ? "+" : "") + v.toFixed(d);

/** 연속 구동 모드 이름. return·ended 는 /film 이 장면(판정 뒤 착석~2:30) 밖 되돌림 구간에 붙인다(B135). */
export const ACT_MODE = { arouse: "각성", relax: "이완", hold: "유지", settle: "자극 뒤 멈춤", off: "대기", return: "장면 끝 · 기본값으로 복귀 중", ended: "장면 끝" };

/**
 * 디렉터 모니터의 연속 구동 한 줄 → { head(굵게), body }. a = 페이지의 adjustRef(lib/controlActuate actuationFor 결과 + base).
 *   각성·이완·유지·자극 뒤 멈춤: "각성" / "u +0.32 · 침묵 −0.10s · BGM ×1.11"
 *   장면 끝(ended): "장면 끝" / "· 구동 0(기본 연출)" — 되돌림 분기의 actuationFor 는 mode "hold" 를 돌려줘서 장면이 끝난 버스 구간에
 *   "유지 u 0.00 · 오프셋 0" 이 11줄 찍혔다(B135). 제어가 끝났는데 "유지" 는 아직 붙들고 있는 것처럼 읽힌다.
 */
export function actuateLine(a) {
  if (!a) return null;
  if (a.mode === "ended") return { head: ACT_MODE.ended, body: "· 구동 0(기본 연출)" };
  const left = a.mode === "settle" && Number.isFinite(a.settleLeft) ? ` ${a.settleLeft.toFixed(1)}s` : "";
  return { head: `${ACT_MODE[a.mode] || a.mode}${left}`, body: glueNumbers(`u ${sgn(a.u || 0)} · ${actuationText(a.offsets, a.base)}`) };
}
