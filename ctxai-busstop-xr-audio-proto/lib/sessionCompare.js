// 두 관객 비교 화면(/film/compare)의 재료 — 저장된 세션 JSON 하나를 비교 화면이 그리는 값으로 편다(B14b·B96·B100).
//
// /film 세션과 /interim 세션은 모양이 다르다.
//  - /film    : events 에 kind:"event" 가 붙고 시각은 실제 경과 초(배속 회차는 × speed 해야 영화 시간). 판정은 verdict(0:58),
//               제어는 control.slots(개구리·고양이 변형)·control:micro(미세 자극)·control:actuate(연속 구동) 이벤트.
//  - /interim : events 에 kind 가 없고 cue 시각이 이미 영화 시간. 판정은 팀 5신호 점수 judge(1:55),
//               다섯 사건은 누구에게나 같은 중립 탐침 — 같은 자극에 다른 반응이 비교의 요점. 판정 뒤 인사 구간의 관객별 연출은
//               control.adapt(lib/interimAdapt · B170b)로 남고 "바꾼 연출" 줄이 그것을 적는다(없으면 옛 세션 → 바꾼 연출 없음).
// 긴장 추정 x̂ 는 두 라우트 모두 engagement 리포트(windows·stimuli)에서 같은 함수(estimateTensionSeries)로 다시 계산한다.
// 합성 관객·트랙 고정(?bias)·배속 회차는 배지로 드러낸다 — bias 세션은 0:01 부터 한 장르로 기울어 "0:01 부터 갈라졌습니다"
// 가 나오고(B96), 배속 회차는 팀 판정이 1배속과 달라질 수 있다(B57·B125).
//
// 순수 함수만 둔다(node 로 테스트: scripts/test-session-compare.mjs).

import { estimateTensionSeries, isObserved } from "./tensionEstimate.js";
import { probeMarks } from "./interimProbes.js";
import { T as INTERIM_T } from "./interimTimeline.js";
import { adaptText } from "./interimAdapt.js";
import { GENRE_LABEL, mmss, stimulusLabel, filmTimeEvents, focusText, focusSpan, MOMENT_TEXT } from "./viewerText.js";

// 슬롯 변형 id(lib/tensionCurve.js SLOTS) → 비교 화면 이름. 모르는 것은 id 그대로.
const VARIANT_LABEL = { once: "한 번", twice: "두 번", loud: "크게", soft: "작게", mid: "중간", playful: "장난스럽게", sudden: "갑자기", brief: "잠깐", linger: "머묾", return: "돌아옴", near: "가까이", far: "멀리", flicker: "깜빡임", shut: "닫힘" };

const r2 = (v) => Math.round(v * 100) / 100;
const sgn = (v, d = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
const shows = (v, d = 2) => Number(Math.abs(v || 0).toFixed(d)) !== 0; // 표시 자릿수에서 0 이 되는 축은 적지 않는다("안개 −0.000" 방지)
export const MARK_NEAR_SEC = 8; // "가장 벌어진 순간 ○○ 뒤" 에 사건 이름을 붙이는 최대 거리(초) — 잠정치

/** "film" | "interim" — route 필드, 없으면(B100 이전 /film 세션) 파일 이름의 `_interim_` 로 가른다. */
export function sessionRoute(sess) {
  if (!sess) return null;
  if (sess.route === "interim" || sess.route === "film") return sess.route;
  return /_interim_/.test(sess.id || "") ? "interim" : "film";
}

/** ?bias 로 선입력한 장르 증거 — /film 은 evidence 이벤트(source "bias")로 남는다. 없으면 null. */
export function biasOf(sess) {
  const e = (sess?.events || []).find((x) => x.kind === "evidence" && x.source === "bias");
  if (!e) return null;
  const g = ["R", "H", "C"].find((k) => (e.scores?.[k] || 0) >= 1) || null;
  return g ? { g, w: e.weight ?? null } : null;
}

/** 이벤트를 영화 시간으로 — /film 은 실제 초 × speed, /interim 은 이미 영화 시간. */
export function movieEvents(sess) {
  if (!sess) return [];
  return sessionRoute(sess) === "interim" ? (sess.events || []) : filmTimeEvents(sess.events, sess.speed || 1);
}

/** 배합 궤적을 영화 시간으로 — /film 은 directionState 시계(실제 초)라 × speed, /interim 은 이미 영화 시간 표본. */
export function movieTrajectory(sess) {
  const tr = sess?.trajectory || [];
  const sp = sess?.speed || 1;
  if (sessionRoute(sess) === "interim" || sp === 1) return tr;
  return tr.map((p) => ({ ...p, t: Math.round(p.t * sp * 10) / 10 }));
}

/**
 * 비교 화면의 배지 — 이 세션이 어떤 조건에서 나온 것인지. tone "warn" 은 증거로 쓸 때 조심해야 하는 조건.
 * @returns {Array<{key:string, text:string, tone:"info"|"warn"}>}
 */
export function sessionBadges(sess) {
  if (!sess) return [];
  const out = [];
  const route = sessionRoute(sess);
  out.push({ key: "route", text: route === "interim" ? "/interim 중간시연 2:20" : "/film 3:30", tone: "info" });
  const v = sess.viewer;
  if (v?.synthetic) out.push({ key: "viewer", text: `합성 관객 ${v.label || v.profile || ""}${v.seed != null ? ` · seed ${v.seed}` : ""}`.trim(), tone: "warn" });
  else out.push({ key: "viewer", text: "실제 관객", tone: "info" });
  const b = biasOf(sess);
  if (b) out.push({ key: "bias", text: `트랙 고정 ?bias=${b.g}${b.w != null ? `:${b.w}` : ""} (${GENRE_LABEL[b.g]} 증거 선입력)`, tone: "warn" });
  const sp = sess.speed || 1;
  if (sp !== 1) out.push({ key: "speed", text: `배속 ×${sp} — 판정이 1배속과 다를 수 있음`, tone: "warn" });
  if (route === "interim") {
    // 판정 뒤 관객별 연출(B170b) — control.adapt 가 있으면 켜졌는지(성향)·고정이면 그 이유. 없으면 옛 세션(배선 전)
    const ad = sess.control?.adapt;
    out.push({ key: "control", text: !ad ? "연출 고정(중립 탐침 다섯)" : ad.adapted ? `판정 뒤 연출 적응 ON(θ̂·x̂ · ${ad.profile})` : `판정 뒤 연출 고정 — ${String(ad.reason || "").replace(/ → 고정 연출$/, "")}`, tone: "info" });
  }
  else if (sess.control?.actuation) out.push({ key: "control", text: sess.control.actuation.on ? "제어 ON" : "제어 OFF", tone: "info" });
  else out.push({ key: "control", text: "제어 기록 없음", tone: "info" });
  return out;
}

/**
 * "이 관객에게 바꾼 연출" 한 줄(B96).
 *  /interim  → control.adapt(판정 뒤 인사 구간의 관객별 연출 · B170b)가 있으면 그 네 값과 성향, 고정이면 그 이유. 옛 세션은 바꾼 것이 없다는 사실.
 *  /film OFF → 고정 연출.
 *  /film ON  → 슬롯 변형(개구리·고양이) · 미세 자극 횟수 · 연속 구동(켜진 틱의 평균 u 와 평균 오프셋).
 * 연속 구동의 오프셋은 deriveParams 기본값에 더한 값이라, 같은 관객의 OFF 회차 대비 차이와 같은 뜻이다.
 */
export function directionChangeText(sess) {
  if (!sess) return "";
  if (sessionRoute(sess) === "interim") {
    const same = `다섯 사건(S1~S5)은 누구에게나 같은 자극`, judge = mmss(INTERIM_T.judge);
    const ad = sess.control?.adapt; // 판정 뒤 관객별 연출(lib/interimAdapt · B170b)
    if (!ad) return `바꾼 연출 없음 — ${same}이고, 판정(${judge}) 뒤 옆자리 인물과 인사만 장르별로 갈립니다`;
    if (!ad.adapted) return `바꾼 연출 없음 — ${same}이고, 판정(${judge}) 뒤 인사 구간도 ${adaptText(ad)}`;
    return `이 관객에게 바꾼 연출(판정 ${judge} 뒤 인사 구간): ${adaptText(ad)}`;
  }
  const c = sess.control;
  if (!c) return "제어 기록이 없는 세션입니다";
  if (!c.actuation?.on) return "제어 OFF — 모든 관객에게 같은 연출(개구리·고양이 기본 용량 0.8, 미세 자극·연속 구동 없음)";
  const parts = [];
  for (const [id, s] of Object.entries(c.slots || {})) {
    if (!s?.variantId) continue;
    const vol = s.actuation?.volume;
    parts.push(`${stimulusLabel(id)} ${VARIANT_LABEL[s.variantId] || s.variantId}${vol != null ? `(볼륨 ${vol})` : ""}`);
  }
  const micro = (sess.events || []).filter((e) => e.name === "control:micro").length || c.actuation.micro || 0;
  if (micro) parts.push(`미세 자극 ${micro}회`);
  const act = actuationStats(sess);
  if (act.active) {
    const o = act.meanOffsets;
    const axes = [];
    if (shows(o.npcSilence)) axes.push(`침묵 ${sgn(o.npcSilence)}s`);
    if (shows(o.npcDistance)) axes.push(`거리 ${sgn(o.npcDistance)}m`);
    if (shows(o.npcGaze * 100, 0)) axes.push(`시선 ${sgn(o.npcGaze * 100, 0)}%`);
    if (shows(o.fogDensity, 3)) axes.push(`안개 ${sgn(o.fogDensity, 3)}`);
    if (shows(o.bgmGain)) axes.push(`BGM ×${(1 + o.bgmGain).toFixed(2)}`);
    parts.push(`연속 구동 ${act.active}틱 평균 u ${sgn(act.meanU)}${axes.length ? ` (${axes.join(" · ")})` : ""}`);
  }
  return parts.length ? `이 관객에게 바꾼 연출: ${parts.join(" · ")}` : "제어 ON — 바꾼 연출이 기록되지 않았습니다";
}

/**
 * 연속 구동 통계 — control:actuate 이벤트 중 켜진 틱(active, mode ≠ off)의 평균 u·평균 오프셋, 모드별 틱 수.
 * 멈춤(settle)·유지(hold) 틱도 평균에 넣는다 — 관객이 실제로 받은 연출의 평균이다.
 */
export function actuationStats(sess) {
  const ticks = (sess?.events || []).filter((e) => e.name === "control:actuate" && e.detail);
  const on = ticks.filter((e) => e.detail.active && e.detail.mode !== "off");
  const modes = {};
  for (const e of ticks) modes[e.detail.mode] = (modes[e.detail.mode] || 0) + 1;
  const keys = ["npcSilence", "npcDistance", "npcGaze", "fogDensity", "lampOn", "bgmGain"];
  const meanOffsets = Object.fromEntries(keys.map((k) => [k, on.length ? r2(on.reduce((s, e) => s + (e.detail.offsets?.[k] || 0), 0) / on.length * 1000) / 1000 : 0]));
  const meanU = on.length ? r2(on.reduce((s, e) => s + (e.detail.u || 0), 0) / on.length) : 0;
  return { ticks: ticks.length, active: on.length, modes, meanU, meanOffsets };
}

/**
 * 긴장 추정 x̂ 계열(영화 시간) — engagement 리포트의 창·탐침에서 다시 계산한다(두 라우트 같은 함수).
 * 리포트가 없고 /interim 의 control.tension 만 있으면 그것을 쓴다. 센서 시각은 실제 초라 × speed.
 * @returns {Array<{t, tension}>}
 */
export function xhatSeries(sess) {
  if (!sess) return [];
  const sp = sess.speed || 1;
  const eng = sess.engagement;
  let series = [];
  if (eng?.windows?.length) series = estimateTensionSeries({ windows: eng.windows, stimuli: eng.stimuli || [] });
  else if (Array.isArray(sess.control?.tension)) series = sess.control.tension;
  // fromStim 은 사건 반응 몫 — 비교 화면이 사건 사이 구간을 흐리게 그린다(B151, lib/tensionEstimate observedSegments). control.tension 엔 없다
  return series.map((p) => ({ t: Math.round(p.t * sp * 100) / 100, tension: p.tension, ...(Number.isFinite(p.fromStim) ? { fromStim: p.fromStim } : {}) }));
}

/**
 * 사건 눈금(영화 시간) — /interim 은 다섯 탐침 S1~S5(팀 신호 번호를 앞에), /film 은 event:start 이벤트와
 * 제어 ON 회차의 미세 자극(control:micro, "먼 문 소리") — 미세 자극이 빠지면 판정 뒤 x̂ 봉우리가 앞 사건의 것으로 읽힌다.
 * @returns {Array<{t, label, name}>}
 */
export function eventMarks(sess) {
  if (!sess) return [];
  if (sessionRoute(sess) === "interim") return probeMarks().map((m) => ({ t: m.t, label: `${m.label} ${stimulusLabel(m.name)}`, name: m.name }));
  let micro = 0;
  return movieEvents(sess)
    .filter((e) => e.kind === "event" && (e.name === "event:start" || e.name === "control:micro"))
    .map((e) => (e.name === "control:micro"
      ? { t: e.t, label: stimulusLabel(`micro-${++micro}`), name: `micro-${micro}` }
      : { t: e.t, label: stimulusLabel(e.detail?.name), name: e.detail?.name }));
}

// ── 비교 화면 사건 이름표 줄 배치(B210) ──
// 사건이 0:37~0:53 에 몰리는 /film 쌍에서 이름표를 i%3 줄로 돌리면 "개구리" 가 봉우리 점에 가리고 "고양이"·"비명" 이 붙었다
// (review51/crop-film-xhat-labels.png). 시각 순서로 훑으며 앞 이름표의 끝 + 간격이 이 이름표의 시작보다 왼쪽인 첫 줄에 놓고,
// 그런 줄이 없으면 새 줄(최대 maxRows)을, 그것도 없으면 가장 먼저 끝나는 줄을 쓴다. 글자 폭은 fontSize 9 기준의 추정치(잠정치).
export const LABEL_LAYOUT = Object.freeze({ charW: 9, asciiW: 5.2, gap: 6, maxRows: 4, rowH: 11, offset: 3 });
const WIDE_CHAR = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3000-\u303F\uFF00-\uFFEF\u4E00-\u9FFF]/;
/** 이름표 한 개의 추정 폭(px) — 한글·전각은 charW, 그 밖(숫자·영문·공백·기호)은 asciiW. */
export function labelWidth(label, L = LABEL_LAYOUT) {
  let w = 0;
  for (const ch of String(label ?? "")) w += WIDE_CHAR.test(ch) ? L.charW : L.asciiW;
  return w;
}
/** 눈금마다 이름표 줄 번호(0 = 맨 위). 입력 순서 그대로 돌려주고, 배치는 t 오름차순으로 한다. */
export function labelRows(marks, xOf, L = LABEL_LAYOUT) {
  const order = marks.map((_, i) => i).sort((a, b) => marks[a].t - marks[b].t);
  const rows = new Array(marks.length).fill(0);
  const end = []; // 줄마다 마지막 이름표의 오른쪽 끝
  for (const i of order) {
    const x0 = xOf(marks[i].t) + L.offset, x1 = x0 + labelWidth(marks[i].label, L);
    let r = end.findIndex((e) => e + L.gap <= x0);
    if (r < 0) { if (end.length < L.maxRows) { r = end.length; end.push(-Infinity); } else { r = end.indexOf(Math.min(...end)); } }
    end[r] = x1; rows[i] = r;
  }
  return rows;
}
/** 같은 줄에서 겹치는 이름표 쌍 — 테스트·검수용. 빈 배열이면 이름표끼리 겹치지 않는다. */
export function labelOverlaps(marks, xOf, rows, L = LABEL_LAYOUT) {
  const box = marks.map((m, i) => { const x0 = xOf(m.t) + L.offset; return { i, row: rows[i], x0, x1: x0 + labelWidth(m.label, L) }; });
  const out = [];
  for (let a = 0; a < box.length; a++) for (let b = a + 1; b < box.length; b++) {
    if (box[a].row !== box[b].row) continue;
    if (box[a].x1 + L.gap > box[b].x0 && box[b].x1 + L.gap > box[a].x0) out.push([marks[a].label, marks[b].label]);
  }
  return out;
}

/** 시각 t 직전(1초 여유)의 사건 눈금 — MARK_NEAR_SEC 안에 없으면 null. 여러 세션의 눈금을 합쳐 넘겨도 된다. */
export function markBefore(marks, t, near = MARK_NEAR_SEC) {
  let best = null;
  for (const m of marks || []) if (m.t <= t + 1 && t - m.t <= near && (!best || m.t > best.t)) best = m;
  return best;
}

/** 판정 시각(영화 시간) — /film 은 verdict.t, 없으면 judge 큐. /interim 은 judge 큐(1:55). 없으면 null. */
export function judgeTime(sess) {
  if (!sess) return null;
  if (sessionRoute(sess) === "film" && sess.verdict?.t != null) return sess.verdict.t;
  const j = movieEvents(sess).find((e) => e.name === "cue" && e.detail === "judge");
  return j ? j.t : null;
}

/**
 * /interim 팀 5신호 판정 한 줄 — "팀 판정(1:55) S1 B · S3 B · S5 A → 공포 5점 · 로맨스 1 · 블랙코미디 1". /film 이나 judge 가 없으면 null.
 * 등급·점수는 팀 코드(lib/interimJudge.js)가 낸 그대로 옮긴다.
 */
export function judgeLine(sess) {
  const j = sess?.judge;
  if (sessionRoute(sess) !== "interim" || !j?.totals) return null;
  const grades = (j.breakdown || []).map((b) => `${b.signal} ${b.grade}`).join(" · ");
  const order = ["R", "H", "C"].slice().sort((a, b) => (j.totals[b] || 0) - (j.totals[a] || 0));
  const pts = order.map((g, i) => `${GENRE_LABEL[g]} ${j.totals[g] || 0}${i === 0 ? "점" : ""}`).join(" · ");
  const t = judgeTime(sess);
  return `팀 판정${t != null ? `(${mmss(t)})` : ""} ${grades}${grades ? " → " : ""}${pts}`;
}

/**
 * 사건별 반응 네 갈래(B128·B158) — 돌아본 사건(turned: 사건 방향 ±28° 안으로 고개를 돌림) · 움찔만 한 사건(responded 인데 turned 아님:
 * 빠른 고개 움직임·후퇴만 있고 사건 쪽으로 돌아보지는 않음) · 보고만 있던 사건(atOnset: 시작할 때 이미 그쪽을 보고 있었고 반응 없음) ·
 * 반응 없던 사건. turned·atOnset 이 없는 옛 세션(B158 이전)은 looked 를 돌아본 것으로 읽는다(보고만 있던 갈래는 비어 있다 — 그때 센서는
 * 그것을 가르지 않았다). 두 라우트 모두 우리 관측 축 engagement.stimuli 하나로 가른다
 * (/film 헤드 포즈 채점 headPose.events[].feats.looked 도 같은 ±28° 기준 — 옛 "본 것/안 본 것" 은 그것을 기준 없이 적었다).
 * 긴장 x̂ 는 반응의 크기라 돌아보지 않은 사건이 x̂ 최고일 수 있다 — 그래서 "움찔만" 을 따로 적는다.
 * /interim 은 S 번호 순·S 번호를 앞에(팀 등급과 별개), /film 은 사건 시각 순. 같은 이름표가 한 갈래에 여러 번이면(미세 자극
 * "먼 문 소리") 한 번만 적고 "×3" 을 붙인다. engagement 가 없는 옛 /film 세션은 헤드 포즈 채점으로 돌아본 것만 가른다.
 * @returns {{turned:string[], flinched:string[], watched:string[], missed:string[]}|null}
 */
export function lookResponses(sess) {
  const st = sess?.engagement?.stimuli;
  const interim = sessionRoute(sess) === "interim";
  if (!Array.isArray(st) || !st.length) {
    const ev = interim ? null : sess?.headPose?.events;
    if (!Array.isArray(ev) || !ev.length) return null;
    return {
      turned: group(ev.filter((e) => e.feats?.looked).map((e) => stimulusLabel(e.name))),
      flinched: [],
      watched: [],
      missed: group(ev.filter((e) => !e.feats?.looked).map((e) => stimulusLabel(e.name))),
    };
  }
  const sig = interim ? Object.fromEntries(probeMarks().map((m) => [m.name, m.label])) : {};
  const tag = (s) => `${sig[s.name] ? `${sig[s.name]} ` : ""}${stimulusLabel(s.name)}`;
  const sorted = interim
    ? st.slice().sort((a, b) => (sig[a.name] || a.name).localeCompare(sig[b.name] || b.name))
    : st.slice().sort((a, b) => (a.onset ?? 0) - (b.onset ?? 0));
  const turned = (s) => (s.turned ?? s.looked) ? 1 : 0;
  return {
    turned: group(sorted.filter(turned).map(tag)),
    flinched: group(sorted.filter((s) => !turned(s) && s.responded).map(tag)),
    watched: group(sorted.filter((s) => !turned(s) && !s.responded && s.atOnset).map(tag)),
    missed: group(sorted.filter((s) => !turned(s) && !s.responded && !s.atOnset).map(tag)),
  };
}
function group(labels) {
  const count = new Map();
  for (const l of labels) count.set(l, (count.get(l) || 0) + 1);
  return [...count].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l));
}

/** 네 갈래를 한 줄로 — "돌아본 사건: 포스터, 물보라 · 움찔만 한 사건: 개구리". 비어 있는 갈래는 뺀다. 이름은 카드와 같은 MOMENT_TEXT. */
export function lookText(lr) {
  if (!lr) return "";
  return ["turned", "flinched", "watched", "missed"]
    .filter((k) => lr[k]?.length).map((k) => `${MOMENT_TEXT[k]}: ${lr[k].join(", ")}`).join(" · ");
}

export const X_CEIL = 0.999; // x̂ 는 1.0 에서 잘린다 — 창 안 최댓값(B150) 뒤 공포형 합성 관객은 봉우리가 1.0 에 여럿 붙는다(B152)

/** 사건 반응이 한 번도 없던 관객의 카드 문구(B189) — xhatPeak 가 null 인데 x̂ 계열은 있을 때. */
export const NO_PEAK_TEXT = "뚜렷한 반응 없음";

/**
 * x̂ 봉우리 — 사건 반응이 있는 창 중 x̂ 가 가장 높은 점과 6초 안의 가장 가까운 사건 눈금.
 * 후보는 사건 반응이 있는 창(lib/tensionEstimate isObserved)뿐이다(B189) — 사건 사이 창의 x̂ 는 바닥 + 잔움직임이라, 반응이 한 번도
 * 없던 관객은 판정 뒤 2:05 잔움직임 봉우리(x̂ 0.27)가 이름 없는 "가장 크게 반응" 이 됐다(검토 턴 44 재현). 그런 관객은 null.
 * 순서는 곡선에 그린 x̂ 그대로다 — fromStim 순으로 매기면 옛 세션 4개에서 점이 곡선의 더 높은 봉우리(S1 0.35)를 두고 낮은 곳
 * (S2 0.31)에 찍혔다(b22b-pre/peaks-*.txt). 여러 봉우리가 상한 1.0 에 닿았으면 잘리기 전 사건 반응 몫(fromStim)이 가장 큰 것을
 * 고르고 상한에 닿은 다른 사건 수를 capped 로 — 그러지 않으면 동률 여덟 곳 중 첫째(늘 포스터 0:08)로 정해진다.
 * @returns {{t, tension, label, capped}|null}  사건 반응이 있는 창이 없으면 null
 */
/**
 * 사건별 봉우리(B222) — 사건 눈금마다 그 뒤 창(다음 눈금 1초 전까지 · 최대 EVENT_PEAK_SPAN_SEC) 안 관측 x̂ 의 최고점.
 * 회복이 빠른 관객의 봉우리는 한 창(2초)짜리 침 모양이라 곡선만으로는 폭이 없다(review57 A 의 S3 포스터) — 비교 화면이 점(●)으로 찍는다.
 * 관측(사건 반응) 없는 사건은 뺀다. 같은 값이면 앞 점.
 * @returns {Array<{name:string, t:number, tension:number}>}
 */
export const EVENT_PEAK_SPAN_SEC = 12; // 잠정치 — 미세 자극 사이 간격(~30초)보다 짧고 사건 반응 꼬리(4.5초)보다 길게
export function eventPeaks(series = [], marks = []) {
  const ms = (marks || []).filter((m) => Number.isFinite(m?.t)).sort((a, b) => a.t - b.t);
  const out = [];
  for (let i = 0; i < ms.length; i++) {
    const t0 = ms[i].t - 1, t1 = Math.min(ms[i + 1] ? ms[i + 1].t - 1 : Infinity, ms[i].t + EVENT_PEAK_SPAN_SEC);
    let best = null;
    for (const p of series || []) { if (!(p.t >= t0 && p.t <= t1) || !isObserved(p)) continue; if (!best || p.tension > best.tension + 1e-9) best = p; }
    if (best) out.push({ name: ms[i].name, t: best.t, tension: best.tension });
  }
  return out;
}

export function xhatPeak(series, marks = []) {
  const cand = (series || []).filter((q) => isObserved(q));
  if (!cand.length) return null;
  const raw = (q) => (Number.isFinite(q.fromStim) ? q.fromStim : q.tension);
  let p = cand[0];
  for (const q of cand) {
    if (q.tension > p.tension + 1e-9 || (q.tension >= X_CEIL && p.tension >= X_CEIL && raw(q) > raw(p))) p = q;
  }
  const nearOf = (q) => {
    let near = null, best = Infinity;
    for (const m of marks) { const d = Math.abs(m.t - q.t); if (d < best && q.t >= m.t - 1) { best = d; near = m; } }
    return near && best <= 6 ? near : null;
  };
  const near = nearOf(p);
  const hit = new Set();
  if (p.tension >= X_CEIL) {
    for (const q of cand) {
      if (q.tension < X_CEIL) continue;
      const m = nearOf(q);
      hit.add(m ? `${m.label}@${m.t}` : `~${Math.round(q.t / 6)}`);
    }
  }
  return { t: p.t, tension: p.tension, label: near ? near.label : null, capped: hit.size > 1 ? hit.size : 0 };
}

/**
 * 카드의 두 순간(B144) — 가장 크게 반응한 순간(x̂ 최고)과 가장 차분히 집중한 순간(집중도 점수 최고 2초). 영화 시간.
 * 종료 카드(/film·/interim)는 세션 모양의 객체({route, speed, events, engagement})를 만들어 같은 함수를 부른다 — 카드와 비교 화면이 같은 답.
 * @param {object} sess
 * @param {object} [summary]  engagement.summary (없으면 sess.engagement.summary)
 * @returns {{peak:{t,tension,label,capped}|null, calm:{text,t0,t1}|null}}
 */
export function momentsOf(sess, summary = sess?.engagement?.summary) {
  const series = xhatSeries(sess);
  const peak = xhatPeak(series, eventMarks(sess));
  const sp = sess?.speed || 1;
  const span = focusSpan(summary, sp);
  let text = span ? focusText(summary, { events: movieEvents(sess), speed: sp }) : null;
  // /interim 은 사건 이름 앞에 S 번호 — 같은 카드의 "가장 크게 반응한 순간 S1 우비 인물" 과 표기를 맞춘다
  const sig = span?.near && sessionRoute(sess) === "interim" ? probeMarks().find((m) => m.name === span.near)?.label : null;
  if (sig) text = `${sig} ${text}`;
  // noPeak — x̂ 계열은 있는데 사건 반응이 한 번도 없었다(카드는 NO_PEAK_TEXT). 계열 자체가 없으면 붙이지 않는다
  return { peak, calm: span ? { text, t0: span.t0, t1: span.t1 } : null, ...(!peak && series.length ? { noPeak: true } : {}) };
}

/** "고양이 (0:44) · x̂ 1.00(상한에 닿은 8곳 중 최대)" · "물보라 (0:36) · x̂ 0.31" — 사건 이름이 없으면 "2:28 무렵". */
export function peakText(pk) {
  if (!pk) return null;
  const when = pk.label ? `${pk.label} (${mmss(pk.t)})` : `${mmss(pk.t)} 무렵`;
  return `${when} · x̂ ${pk.tension.toFixed(2)}${pk.capped ? `(상한에 닿은 ${pk.capped}곳 중 최대)` : ""}`;
}

export const LEAD_EPS = 0.02; // 선두 장르와 2위의 차이가 이보다 작으면 "비슷함"(회색 띠) — 잠정치

/**
 * 배합 궤적의 선두 장르 띠(B187) — 시각마다 R·H·C 중 가장 큰 장르를 구간으로 묶는다. 비교 화면이 A·B 칸 위에 색 띠로 그린다.
 * /interim 공포형 vs 차분형은 판정 뒤 블랙코미디 0.67 과 로맨스 0.67 이 같은 높이라, 한 그래프에 겹쳐 그리면 두 선이 포개져
 * "1:13 부터 갈라졌습니다" 가 그래프에서 안 보였다(검토 턴 44). 선두 장르를 색으로 보이면 높이가 같아도 갈라짐이 보인다.
 * @returns {Array<{t0, t1, g:"R"|"H"|"C"|null}>}  g null — 1·2위 차이가 LEAD_EPS 미만
 */
export function leaderBands(trajectory = [], eps = LEAD_EPS) {
  const out = [];
  for (let i = 0; i < trajectory.length; i++) {
    const p = trajectory[i];
    const order = ["R", "H", "C"].slice().sort((a, b) => (p[b] || 0) - (p[a] || 0));
    const g = (p[order[0]] || 0) - (p[order[1]] || 0) >= eps ? order[0] : null;
    const t1 = trajectory[i + 1]?.t ?? p.t;
    const cur = out[out.length - 1];
    if (cur && cur.g === g) cur.t1 = t1;
    else out.push({ t0: p.t, t1, g });
  }
  return out;
}

/**
 * 두 x̂ 계열의 차이 — 같은 시각(0.6초 안 최근접)끼리 평균 |ΔX|, 가장 크게 벌어진 시각. 짝이 없으면 null.
 * @returns {{n, meanAbs, maxGap:{t, a, b}}|null}
 */
export function xhatGap(sa, sb) {
  if (!sa?.length || !sb?.length) return null;
  let n = 0, sum = 0, max = null, j = 0;
  for (const p of sa) {
    while (j < sb.length - 1 && Math.abs(sb[j + 1].t - p.t) <= Math.abs(sb[j].t - p.t)) j++;
    const q = sb[j];
    if (Math.abs(q.t - p.t) > 0.6) continue;
    const d = Math.abs(p.tension - q.tension);
    n++; sum += d;
    if (!max || d > max.d) max = { d, t: p.t, a: p.tension, b: q.tension };
  }
  if (!n) return null;
  return { n, meanAbs: r2(sum / n), maxGap: { t: max.t, a: max.a, b: max.b } };
}

/**
 * 두 세션을 한 화면에 겹쳐도 되는가 — 라우트가 다르면 사건 시각표가 달라 곡선을 겹치면 안 된다.
 * @returns {string|null} 경고 문장
 */
export function pairWarning(a, b) {
  if (!a || !b) return null;
  const ra = sessionRoute(a), rb = sessionRoute(b);
  if (ra !== rb) return `두 세션의 체험이 다릅니다(A ${ra === "interim" ? "/interim" : "/film"} · B ${rb === "interim" ? "/interim" : "/film"}) — 사건 시각표가 달라 곡선을 겹쳐 읽으면 안 됩니다`;
  if ((a.speed || 1) !== (b.speed || 1)) return `두 세션의 배속이 다릅니다(A ×${a.speed || 1} · B ×${b.speed || 1})`;
  return null;
}
