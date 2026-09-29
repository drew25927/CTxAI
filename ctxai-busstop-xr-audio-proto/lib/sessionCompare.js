// 두 관객 비교 화면(/film/compare)의 재료 — 저장된 세션 JSON 하나를 비교 화면이 그리는 값으로 편다(B14b·B96·B100).
//
// /film 세션과 /interim 세션은 모양이 다르다.
//  - /film    : events 에 kind:"event" 가 붙고 시각은 실제 경과 초(배속 회차는 × speed 해야 영화 시간). 판정은 verdict(0:58),
//               제어는 control.slots(개구리·고양이 변형)·control:micro(미세 자극)·control:actuate(연속 구동) 이벤트.
//  - /interim : events 에 kind 가 없고 cue 시각이 이미 영화 시간. 판정은 팀 5신호 점수 judge(1:55),
//               다섯 사건은 누구에게나 같은 중립 탐침이라 "바꾼 연출" 이 없다 — 같은 자극에 다른 반응이 비교의 요점.
// 긴장 추정 x̂ 는 두 라우트 모두 engagement 리포트(windows·stimuli)에서 같은 함수(estimateTensionSeries)로 다시 계산한다.
// 합성 관객·트랙 고정(?bias)·배속 회차는 배지로 드러낸다 — bias 세션은 0:01 부터 한 장르로 기울어 "0:01 부터 갈라졌습니다"
// 가 나오고(B96), 배속 회차는 팀 판정이 1배속과 달라질 수 있다(B57·B125).
//
// 순수 함수만 둔다(node 로 테스트: scripts/test-session-compare.mjs).

import { estimateTensionSeries } from "./tensionEstimate.js";
import { probeMarks } from "./interimProbes.js";
import { T as INTERIM_T } from "./interimTimeline.js";
import { GENRE_LABEL, mmss, stimulusLabel, filmTimeEvents } from "./viewerText.js";

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
  if (route === "interim") out.push({ key: "control", text: "연출 고정(중립 탐침 다섯)", tone: "info" });
  else if (sess.control?.actuation) out.push({ key: "control", text: sess.control.actuation.on ? "제어 ON" : "제어 OFF", tone: "info" });
  else out.push({ key: "control", text: "제어 기록 없음", tone: "info" });
  return out;
}

/**
 * "이 관객에게 바꾼 연출" 한 줄(B96).
 *  /interim  → 바꾼 것이 없다는 사실(다섯 사건은 같은 자극, 판정 뒤 옆자리 인물과 인사만 장르별).
 *  /film OFF → 고정 연출.
 *  /film ON  → 슬롯 변형(개구리·고양이) · 미세 자극 횟수 · 연속 구동(켜진 틱의 평균 u 와 평균 오프셋).
 * 연속 구동의 오프셋은 deriveParams 기본값에 더한 값이라, 같은 관객의 OFF 회차 대비 차이와 같은 뜻이다.
 */
export function directionChangeText(sess) {
  if (!sess) return "";
  if (sessionRoute(sess) === "interim") {
    return `바꾼 연출 없음 — 다섯 사건(S1~S5)은 누구에게나 같은 자극이고, 판정(${mmss(INTERIM_T.judge)}) 뒤 옆자리 인물과 인사만 장르별로 갈립니다`;
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
  return series.map((p) => ({ t: Math.round(p.t * sp * 100) / 100, tension: p.tension }));
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
 * /interim 다섯 사건 중 반응한 것·안 한 것 — engagement.stimuli 의 responded(우리 관측 축). 팀 등급과 별개.
 * /film 은 null — 비교 화면이 헤드 포즈 채점의 "본 것/안 본 것" 을 쓴다(탐침 이름이 겹쳐 S 번호가 잘못 붙는다).
 * @returns {{responded:string[], missed:string[]}|null}
 */
export function probeResponses(sess) {
  const st = sess?.engagement?.stimuli;
  if (sessionRoute(sess) !== "interim" || !Array.isArray(st) || !st.length) return null;
  const sig = Object.fromEntries(probeMarks().map((m) => [m.name, m.label]));
  const tag = (s) => `${sig[s.name] ? `${sig[s.name]} ` : ""}${stimulusLabel(s.name)}`;
  const sorted = st.slice().sort((a, b) => (sig[a.name] || a.name).localeCompare(sig[b.name] || b.name));
  return { responded: sorted.filter((s) => s.responded).map(tag), missed: sorted.filter((s) => !s.responded).map(tag) };
}

/**
 * x̂ 봉우리 — 계열에서 가장 높은 점과 6초 안의 가장 가까운 사건 눈금.
 * @returns {{t, tension, label}|null}
 */
export function xhatPeak(series, marks = []) {
  if (!series?.length) return null;
  let p = series[0];
  for (const q of series) if (q.tension > p.tension) p = q;
  let near = null, best = Infinity;
  for (const m of marks) { const d = Math.abs(m.t - p.t); if (d < best && p.t >= m.t - 1) { best = d; near = m; } }
  return { t: p.t, tension: p.tension, label: near && best <= 6 ? near.label : null };
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
