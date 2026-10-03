// 디렉터 모니터·HUD 의 문구 도우미(순수 함수) —
//   (1) 줄바꿈이 라벨과 값 사이에서 일어나지 않게 붙인다(B65). 패널(폭 320px)은 word-break: keep-all 로 한글 단어
//       안에서는 끊지 않지만 "회복 0.848s" 처럼 라벨과 숫자 사이의 보통 공백에서는 끊긴다("회복 / 0.848s").
//       숫자·부호 앞의 공백을 줄바꿈 없는 공백(U+00A0)으로 바꾸면 " · " 구분자에서만 줄이 접힌다.
//   (2) "도달가능 트랙: R … · H … · C … → H" 가 "트랙을 H 로 바꾼다" 로 읽히지 않게 점수 줄을 만든다(B154).
//       selectTrack 의 track 은 도달 점수(0.7)와 장르 성향(0.3)을 섞은 선택이라 도달 점수 최고와 다를 수 있다
//       (bias=R:6 완주: R 0.869 · H 0.947 · C 0.89 인데 선택 R). 둘 다 참고값이고 판정 트랙은 바뀌지 않는다.
//   (3) 연속 구동 한 줄(actuateLine) — 장면이 끝난 뒤 되돌림 구간을 "유지 u 0.00" 이 아니라 "장면 끝" 으로 적는다(B135).
//   (4) "지금 목표 | 추정 x̂" 행의 두 문구(goalRowText) — 목표 곡선이 없는 구간에서 진행 중 탐침은 왼쪽에 한 번만 적는다(B227).
//   (5) 최근 봉우리 잔상 한 줄(recentPeakText) — 마지막 점이 아직 오르는 중이면 "봉우리" 가 아니라 "x̂ 오르는 중" 으로 적는다(B235).
//   (6) 머리글의 자극 수(stimCountText) — 닫힌 레코드 수에 진행 중 수를 "자극 0+1" 로 붙인다(B244). 탐침이 진행 중인데 "자극 0" 이면 "x̂ 오르는 중 · 포스터" 와 어긋나 보였다.
//   (7) 머리글의 트랙 문구(trackHeadText) — 판정 전 선두 장르를 "트랙 R" 이 아니라 "트랙 잠정 R" 로 적는다(B143). /interim 1배속 표본에서 머리글이
//       0:14 "트랙 R" → 1:08 "트랙 C" → 1:55 "트랙 H" 로 바뀌어 판정이 두 번 뒤집힌 것처럼 읽혔다. /film 은 판정 전 배합을 "잠정 H72 R19 C10" 으로 적는다(B92).

import { actuationText } from "./controlActuate.js";
import { isMixTrack, trackLabel } from "./tensionCurve.js";
import { GENRE_LABEL } from "./viewerText.js";

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

const WJ = "\u2060";

/** 목표 곡선이 없는 구간의 왼쪽 문구 — NBSP 로 묶고 "(" 앞에 WORD JOINER(B217 · keep-all 이어도 한글 뒤 여는 괄호 앞은 줄바꿈 자리라 "없음 / (중립 탐침)" 으로 갈렸다) */
export const NO_TARGET_LABEL = `목표${NBSP}곡선${NBSP}없음${WJ}(중립${NBSP}탐침)`;

/**
 * 디렉터 모니터 "지금 목표 | 추정 x̂" 행의 두 문구(B227). reading 은 tensionEstimate.xhatReading 결과, active 는 진행 중 사건의 이름표.
 *   목표 곡선이 있으면(/film 판정 뒤 장면) left 는 null(패널이 "지금 목표 0.45" 를 찍는다) · right 는 reading.label 그대로("먼 문 소리 진행 중"·"잠정").
 *   목표 곡선이 없고(/interim 전체 · /film 판정 전) 진행 중 탐침이 있으면 left 를 "중립 탐침 S1 진행 중" 으로 적고 right 에서 같은 말을 뺀다 —
 *   왼쪽 "목표 곡선 없음(중립 탐침)" 과 오른쪽 "추정 x̂ 0.12 · S1 진행 중" 을 함께 두면 패널 한 줄(292px · 12px 모노스페이스)을 넘어
 *   오른쪽 라벨이 " · " 에서 두 줄로 갈렸다(1배속 /interim S1 구간 0:15~1:53 내내 행 높이 36px · work/evidence/b216/interim-samples.jsonl).
 *   "사건 사이" 보다 짧은 "S1 중" 으로 줄여도 두 사건("S1·S3 진행 중")이면 다시 넘치므로, 줄이는 대신 자리를 옮긴다.
 *   잠정 반응의 "잠정" 은 right 에 남긴다(반응이 잠정이라는 정보는 "진행 중" 과 다른 말이고 짧다).
 * @returns {{left:string|null, right:string}}
 */
export function goalRowText({ hasTarget = false, active = [], reading = null } = {}) {
  const label = reading?.label || "";
  const names = (active || []).filter(Boolean);
  if (hasTarget) return { left: null, right: label };
  if (!names.length) return { left: NO_TARGET_LABEL, right: label };
  // "중립 탐침" 과 "S1 진행 중" 은 각각 NBSP 로 묶고 그 사이만 보통 공백 — 혹시 넘치면 단어 안이 아니라 거기서 접힌다
  return { left: `중립${NBSP}탐침 ${names.join("·")}${NBSP}진행${NBSP}중`, right: reading?.state === "between" ? "" : label };
}

/**
 * 최근 봉우리 잔상 줄(B216)의 세 조각 — 모니터는 value 만 굵게 찍는다(B235).
 *   rising(마지막 점 · 창 안 최댓값이 창 끝 = 아직 오르는 중): "x̂ 오르는 중 | 0.22 | · 물보라 · 잠정" — 경과("N초 전")는 적지 않는다.
 *   그 밖: "최근 봉우리 | 0.96 | · 물보라 · 3초 전 · 잠정". ago < 1 이면 "지금".
 * @param {{tension:number, ago:number, provisional?:boolean, rising?:boolean}} rc  tensionEstimate.recentPeak 결과(배속이면 ago 는 영화 초)
 * @param {string|null} name  사건 표시 이름(eventLabel/stimulusLabel 을 거친 것) — 없으면 이름 없이
 * @returns {{label:string, value:string, tail:string}|null}
 */
export function recentPeakText(rc, name = null) {
  if (!rc || !Number.isFinite(rc.tension)) return null;
  const value = rc.tension.toFixed(2);
  const parts = [];
  if (name) parts.push(name);
  if (!rc.rising) parts.push(rc.ago < 1 ? "지금" : `${Math.round(rc.ago)}초${NBSP}전`);
  if (rc.provisional) parts.push("잠정");
  // 라벨은 보통 공백 — 줄이 짧아(≤ 30자 · 11px) 접힐 일이 없고, 기존 관찰 하네스가 '최근 봉우리' 를 보통 공백으로 찾는다
  return { label: rc.rising ? "x̂ 오르는 중" : "최근 봉우리", value, tail: parts.map((x) => ` · ${x}`).join("") };
}

/**
 * 머리글의 자극 수(B244) — 모니터 "트랙 R · 자극 N" 과 /interim HUD "자극 N · x̂" 의 N 은 닫힌 레코드 수(θ̂·슬롯 결정에 쓰는 것)라
 * 탐침이 진행 중일 때(0:06 "x̂ 오르는 중 0.34 · 포스터" · 0:21 "중립 탐침 S1 진행 중")도 "자극 0" 이어서 같은 패널의 "진행 중" 줄과 어긋나 보였다.
 * 진행 중 자극이 있으면 "자극 0+1" 로 붙인다 — /interim HUD 가 이미 쓰던 표기. 긴 형식("자극 0(+1 진행 중)" · "자극 0 · 진행 중 1")은
 * /interim 머리글(제목 "디렉터 모니터 · 중간시연")에서 두 줄(36px)로 접히고, /film 판정 전 트랙 라벨("잠정 H91 R4 C4")과도 한 줄에 못 든다
 * (지금 빌드 실측 · work/evidence/b244/measure.log: 161px 36 · "자극 0+1" 107px 18). 풀이는 title(툴팁)로.
 * @param {number} nStim  닫힌 레코드 수(engagementSense data().stimuli.length)
 * @param {number} nActive  진행 중 자극 수(active.length 또는 current().active)
 * @returns {{text:string, title:string}}  text 는 "자극\u00a00+1"(숫자 앞 NBSP · 안에 공백 없음) · title 은 "닫힌 자극 0 · 진행 중 1"
 */
export function stimCountText(nStim, nActive = 0) {
  const n = Number.isFinite(nStim) ? nStim : 0;
  const m = Number.isFinite(nActive) && nActive > 0 ? nActive : 0;
  return { text: `자극${NBSP}${n}${m ? `+${m}` : ""}`, title: m ? `닫힌 자극 ${n} · 진행 중 ${m}` : `닫힌 자극 ${n}` };
}

/**
 * 머리글의 트랙 문구(B143) — 모니터 머리글 "트랙 <값> · 자극 N" 의 왼쪽 조각 → { text, title(툴팁) }.
 *   /interim 은 판정 확정 전에 드리프트 선두 장르 한 글자를 track 자리에 준다(lib/interimProbes interimTrack). 그것을 "트랙 R" 로 찍으면
 *   확정처럼 읽히고, 1배속 공포형 seed 1 표본에서는 0:14 "트랙 R" → 1:08 "트랙 C" → 1:55 "트랙 H" 로 바뀌어 판정이 두 번 뒤집힌 것처럼 보였다
 *   (work/evidence/b244/analysis-interim.txt 머리글 분포). /film 은 판정 전 배합 {R,H,C} 를 주고 trackLabel 이 "잠정 H72 R19 C10" 으로 적는다(B92).
 *   판정 전(decided === false)이면 같은 말로 "트랙 잠정 R", 선두가 아직 없으면(종전 "트랙 -") "트랙 판정 전". 판정 뒤·강제(?track=)·decided 생략은 종전 "트랙 H".
 *   문구 폭: "잠정 " 만 늘어(3자) /interim 머리글(제목 "디렉터 모니터 · 중간시연" · B244 실측 한 줄 상한 약 160px)에서 "트랙 잠정 R · 자극 4+1" 도 한 줄에 든다.
 *   공백은 보통 공백 — 종전 머리글("트랙 R"·"트랙 잠정 H72 R19 C10")과 같은 표기라 관찰 하네스의 문자열 검사가 그대로 맞는다(행 높이는 표본으로 확인).
 * @param {string|object|null} track  "H"|"R"|"C" · 판정 전 배합 {R,H,C}(B92) · null(선두 없음)
 * @param {{decided?:boolean}} [o]  decided === false 면 track 은 선두 장르일 뿐(/interim 이 B154 와 같은 뜻으로 준다). 생략(undefined)·true 면 판정·강제 트랙.
 * @returns {{text:string, title:string}}
 */
export function trackHeadText(track, { decided } = {}) {
  if (isMixTrack(track)) {
    const label = trackLabel(track); // "잠정 H72 R19 C10"
    return { text: `트랙 ${label}`, title: `판정 전 · 배합으로 가중한 기대 곡선 ${label.replace(/^잠정 /, "")} · 확정 아님` };
  }
  const g = typeof track === "string" && track ? track : null;
  if (!g) return { text: "트랙 판정 전", title: "판정 전 · 선두 장르 없음" };
  const name = GENRE_LABEL[g] ? `${g}(${GENRE_LABEL[g]})` : g;
  if (decided === false) return { text: `트랙 잠정 ${g}`, title: `판정 전 · 드리프트 선두 ${name} · 확정 아님` };
  return { text: `트랙 ${g}`, title: `판정 트랙 ${name}` };
}
