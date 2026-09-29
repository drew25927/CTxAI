"use client";

// 두 관객 비교 — "너 나랑 다른 걸 봤네".
// 원 제안서와 요청서 v5.0이 원한 장치(체험 뒤 두 사람이 카드를 비교하는 자리)를
// data/sessions/ 에 자동 저장된 연출 궤적으로 만든다. 같은 정류장, 같은 다섯 사건인데
// 두 사람의 하늘이 언제부터 어떻게 갈렸는지가 그래프 하나로 보인다.
//
// /interim 세션(route:"interim")도 읽는다(B14b) — 같은 다섯 사건(S1~S5)에 두 사람의 긴장 추정 x̂ 가 어떻게 달랐는지를
// 겹쳐 그린다. 세션마다 조건(합성 관객·?bias 트랙 고정·배속·제어 ON/OFF)을 배지로, 제어가 그 관객에게 바꾼 연출을
// 한 줄로 보인다(B96). 세션 모양 차이는 lib/sessionCompare.js 가 흡수한다.
//
// /film/compare            → 최근 두 세션
// /film/compare?a=<id>&b=<id>

import { useEffect, useMemo, useState } from "react";
import s from "../../story/story.module.css";
import f from "../film.module.css";
import { mixLines, verdictOf, mmss, fingerprintText, focusText, STIMULUS_LABEL } from "@/lib/viewerText";
import { sessionRoute, sessionBadges, directionChangeText, xhatSeries, eventMarks, judgeTime, judgeLine, probeResponses, xhatPeak, xhatGap, pairWarning, biasOf, movieEvents, movieTrajectory, markBefore } from "@/lib/sessionCompare";

const GENRE = { R: { label: "로맨스", accent: "#f2a7c0" }, H: { label: "공포", accent: "#8fae95" }, C: { label: "블랙코미디", accent: "#e0a86a" } };
const EVENT_LABEL = STIMULUS_LABEL; // 사건 이름표는 종료 카드와 한 표(lib/viewerText.js)
const XHAT_COLOR = { a: "#7fd1ff", b: "#ffcf7a" }; // x̂ 곡선 — A 하늘색 실선, B 호박색 점선

function useQuery() {
  const [q, setQ] = useState({});
  useEffect(() => { setQ(Object.fromEntries(new URLSearchParams(window.location.search).entries())); }, []);
  return q;
}

// 사건 눈금·판정선 — 두 차트가 같이 쓴다. 눈금은 A 세션 기준(없으면 B), 시각은 영화 시간(lib/sessionCompare.js).
function Marks({ marks, judgeT, x, H, PAD }) {
  return (
    <>
      {judgeT != null && (
        <g>
          <line x1={x(judgeT)} x2={x(judgeT)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
          <text x={x(judgeT) + 3} y={H - PAD - 4} fill="rgba(255,255,255,0.7)" fontSize="9">판정</text>
        </g>
      )}
      {marks.map((m, i) => (
        <g key={i}>
          <line x1={x(m.t)} x2={x(m.t)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
          <text x={x(m.t) + 3} y={PAD + 10 + (i % 3) * 11} fill="rgba(255,255,255,0.45)" fontSize="9">{m.label}</text>
        </g>
      ))}
    </>
  );
}

// 궤적·눈금·판정선은 모두 영화 시간 — /film 배속 회차도 × speed 로 맞춘 것(movieTrajectory·eventMarks·judgeTime)
function Chart({ a, b }) {
  const W = 900, H = 220, PAD = 10;
  const ta = movieTrajectory(a), tb = movieTrajectory(b);
  const tMax = Math.max(ta.at(-1)?.t || 1, tb.at(-1)?.t || 1);
  const x = (t) => PAD + (t / tMax) * (W - PAD * 2);
  const y = (v) => H - PAD - v * (H - PAD * 2);
  const path = (tr, g) => tr.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[g]).toFixed(1)}`).join(" ");
  const ref = a || b;
  return (
    <svg className={f.chart} style={{ height: 220 }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Marks marks={eventMarks(ref)} judgeT={judgeTime(ref)} x={x} H={H} PAD={PAD} />
      {["R", "H", "C"].map((g) => (
        <g key={g}>
          {ta.length > 0 && <path d={path(ta, g)} fill="none" stroke={GENRE[g].accent} strokeWidth="2.2" />}
          {tb.length > 0 && <path d={path(tb, g)} fill="none" stroke={GENRE[g].accent} strokeWidth="2.2" strokeDasharray="6 4" opacity="0.85" />}
        </g>
      ))}
    </svg>
  );
}

function describe(sess) {
  if (!sess) return "";
  if (sessionRoute(sess) === "interim") return describeInterim(sess);
  // 배합은 판정 때 것이 주 문장, 끝 배합은 "판정 뒤 흐름" — 종료 카드와 같은 규칙(lib/viewerText.js, B86).
  // B86 이전 세션은 verdict 가 없어 judge 큐 시각의 궤적 표본으로 되살린다.
  const mix = mixLines({ verdict: verdictOf(sess), final: sess.final });
  const ev = (sess.headPose?.events || []);
  const looked = ev.filter((e) => e.feats?.looked).map((e) => EVENT_LABEL[e.name] || e.name);
  const notLooked = ev.filter((e) => !e.feats?.looked).map((e) => EVENT_LABEL[e.name] || e.name);
  return `옆에 앉은 사람 ${GENRE[sess.dominant]?.label || "-"} · ${mix.main}` + (mix.after ? ` · ${mix.after}` : "")
    + (looked.length ? ` · 본 것: ${looked.join(", ")}` : "") + (notLooked.length ? ` · 안 본 것: ${notLooked.join(", ")}` : "")
    + (sess.selfReport ? ` · 본인 느낌: ${GENRE[sess.selfReport]?.label}` : "");
}

// 긴장 추정 x̂ 두 곡선(B14b) — 두 라우트 모두 engagement 리포트에서 같은 함수로 다시 계산한 값(영화 시간).
// /interim 두 세션이면 "같은 다섯 사건, 다른 두 사람" 이 이 그림 하나로 보인다.
function XhatChart({ a, b, sa, sb }) {
  const W = 900, H = 160, PAD = 10;
  const tMax = Math.max(sa.at(-1)?.t || 1, sb.at(-1)?.t || 1, movieTrajectory(a).at(-1)?.t || 1, movieTrajectory(b).at(-1)?.t || 1);
  const x = (t) => PAD + (t / tMax) * (W - PAD * 2);
  const y = (v) => H - PAD - v * (H - PAD * 2);
  const path = (sr) => sr.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.tension).toFixed(1)}`).join(" ");
  const ref = a || b;
  return (
    <svg className={f.chart} style={{ height: 160 }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0.5, 1].map((v) => <line key={v} x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.07)" />)}
      <Marks marks={eventMarks(ref)} judgeT={judgeTime(ref)} x={x} H={H} PAD={PAD} />
      {sa.length > 0 && <path d={path(sa)} fill="none" stroke={XHAT_COLOR.a} strokeWidth="2.2" />}
      {sb.length > 0 && <path d={path(sb)} fill="none" stroke={XHAT_COLOR.b} strokeWidth="2.2" strokeDasharray="6 4" />}
    </svg>
  );
}

// /interim 세션의 판정·반응 줄 — 팀 5신호 판정(등급·점수 그대로)과 우리 관측 축의 반응한 사건.
function describeInterim(sess) {
  const parts = [`옆에 앉은 사람 ${GENRE[sess.dominant]?.label || "-"}`];
  const jl = judgeLine(sess);
  if (jl) parts.push(jl);
  const pr = probeResponses(sess);
  if (pr) {
    if (pr.responded.length) parts.push(`반응한 사건: ${pr.responded.join(", ")}`);
    if (pr.missed.length) parts.push(`반응 없던 사건: ${pr.missed.join(", ")}`);
  }
  return parts.join(" · ");
}

// 집중·긴장 한 줄 — engagement.summary 로. 반응 지문(fingerprintText)·집중한 순간(focusText)은 종료 카드와 같은 함수(lib/viewerText.js, B84·B108).
// 세션의 집중도 시각은 실제 경과 초라 배속 회차(sess.speed)는 영화 시간으로 곱해 적는다(/film 세션은 이벤트도 실제 초라 movieEvents 가 맞춘다).
function engageLine(sess) {
  const s = sess?.engagement?.summary;
  if (!s) return null;
  const sp = sess?.speed || 1;
  const parts = [];
  if (s.probeResponseRate != null) parts.push(`사건 반응 ${Math.round(s.probeResponseRate * 100)}%`);
  const focus = focusText(s, { events: movieEvents(sess), speed: sp });
  if (focus) parts.push(`가장 집중 ${focus}`);
  if (s.laughEpisodes?.length) parts.push(`웃음 ${s.laughEpisodes.length}회`);
  if (s.dropPoint) parts.push(`집중 풀림 ${mmss(s.dropPoint.t * sp)}`);
  const fp = fingerprintText(sess?.control?.theta);
  return { metrics: parts.join(" · "), fp };
}

function diverge(a, b) {
  if (!a?.trajectory || !b?.trajectory) return null;
  const bt = movieTrajectory(b);
  for (const p of movieTrajectory(a)) {
    const q = bt.find((z) => Math.abs(z.t - p.t) < 0.6);
    if (!q) continue;
    const d = Math.abs(p.R - q.R) + Math.abs(p.H - q.H) + Math.abs(p.C - q.C);
    if (d > 0.35) return p.t;
  }
  return null;
}

export default function ComparePage() {
  const q = useQuery();
  const [list, setList] = useState([]);
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [ids, setIds] = useState({ a: null, b: null });

  useEffect(() => {
    fetch("/api/session").then((r) => r.json()).then((j) => {
      const items = (j.items || []).slice().reverse();
      setList(items);
      const ia = q.a || items[0]?.id || null;
      const ib = q.b || items.find((i) => i.id !== ia)?.id || null;
      setIds({ a: ia, b: ib });
    }).catch(() => {});
  }, [q.a, q.b]);

  useEffect(() => {
    if (ids.a) fetch(`/api/session?id=${encodeURIComponent(ids.a)}`).then((r) => r.json()).then((j) => setA(j.session || null));
    if (ids.b) fetch(`/api/session?id=${encodeURIComponent(ids.b)}`).then((r) => r.json()).then((j) => setB(j.session || null));
  }, [ids]);

  const divergeAt = useMemo(() => diverge(a, b), [a, b]);
  const same = a && b && a.dominant === b.dominant;
  const sa = useMemo(() => xhatSeries(a), [a]);
  const sb = useMemo(() => xhatSeries(b), [b]);
  // 라우트가 다르면(/interim vs /film) 사건 시각표가 달라 같은 시각끼리의 차이는 뜻이 없다 — 경고만 보이고 차이 줄은 뺀다
  const gap = useMemo(() => (a && b && sessionRoute(a) !== sessionRoute(b) ? null : xhatGap(sa, sb)), [a, b, sa, sb]);
  const warn = pairWarning(a, b);
  const bothInterim = a && b && sessionRoute(a) === "interim" && sessionRoute(b) === "interim";
  // 한쪽만 ?bias 로 트랙을 고정했으면 배합 궤적은 시작부터 다르다 — 그 "갈라진 시각" 은 관객 차이가 아니다(B96)
  const biasA = biasOf(a), biasB = biasOf(b);
  const biasSplit = a && b && (biasA?.g || null) !== (biasB?.g || null);
  // 가장 벌어진 순간의 이름 — 두 세션의 눈금을 합쳐 본다(ON 에만 있는 미세 자극도 잡히게)
  const gapAt = gap ? markBefore([...eventMarks(a), ...eventMarks(b)], gap.maxGap.t) : null;

  return (
    <div className={s.stage} style={{ overflow: "auto" }}>
      <div className={s.topBar}>
        <a className={s.homeLink} href="/film">← /film</a>
        <span className={s.dim}>두 관객 비교 · 같은 정류장, 다른 하늘</span>
        <span />
      </div>
      <div style={{ maxWidth: 960, margin: "70px auto 40px", padding: "0 20px" }}>
        <h1 className={f.endTitle} style={{ fontSize: 26 }}>
          {a && b ? (same ? `둘 다 ${GENRE[a.dominant].label}였지만, 같은 밤은 아니었습니다` : `A는 ${GENRE[a.dominant]?.label}, B는 ${GENRE[b.dominant]?.label}를 만났습니다`) : "세션을 고르세요"}
        </h1>
        <p className={f.endSub}>
          {biasSplit
            ? `${biasA ? "A" : "B"} 는 ?bias 로 ${GENRE[(biasA || biasB).g].label} 트랙에 고정한 세션이라 배합 궤적은 시작부터 다릅니다 — 갈라진 시각은 관객 차이가 아닙니다.`
            : divergeAt != null ? `두 정류장은 ${mmss(divergeAt)} 부터 갈라졌습니다.` : a && b ? "두 궤적이 거의 같습니다." : ""}
        </p>
        {warn && <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "#ffcf7a" }}>⚠ {warn}</p>}
        <p className={s.dim} style={{ margin: "0 0 4px", fontSize: 12 }}>장르 배합 궤적 — {bothInterim ? "팀 5신호 드리프트" : "연출 상태"}</p>
        <Chart a={a} b={b} />
        <div className={f.legend}>
          {["R", "H", "C"].map((g) => <span key={g}><i style={{ background: GENRE[g].accent }} />{GENRE[g].label}</span>)}
          <span className={s.dim}>실선 A · 점선 B</span>
        </div>
        {(sa.length > 0 || sb.length > 0) && (
          <div style={{ margin: "14px 0 6px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
              긴장 추정 x̂ — {bothInterim ? "같은 다섯 사건, 다른 두 사람" : "두 관객의 반응"}
            </p>
            <XhatChart a={a} b={b} sa={sa} sb={sb} />
            <div className={f.legend}>
              <span><i style={{ background: XHAT_COLOR.a }} />A 실선</span>
              <span><i style={{ background: XHAT_COLOR.b }} />B 점선</span>
              {gap && <span className={s.dim}>평균 차이 |Δx̂| {gap.meanAbs.toFixed(2)} · 가장 벌어진 순간 {gapAt ? `${gapAt.label} 뒤 ` : ""}{mmss(gap.maxGap.t)} (A {gap.maxGap.a.toFixed(2)} · B {gap.maxGap.b.toFixed(2)})</span>}
            </div>
          </div>
        )}
        {[["A", a, "a"], ["B", b, "b"]].map(([label, sess, key]) => (
          <div key={key} style={{ margin: "10px 0 16px", padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
              <b>{label}</b>
              <select value={ids[key] || ""} onChange={(e) => setIds((p) => ({ ...p, [key]: e.target.value }))} style={{ background: "rgba(0,0,0,0.4)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}>
                {list.map((i) => <option key={i.id} value={i.id}>{i.savedAt?.slice(5, 16).replace("T", " ")} · {i.route === "interim" ? "interim" : "film"} · {GENRE[i.dominant]?.label || "-"}{i.viewer?.label ? ` · 합성 ${i.viewer.label}` : ""}{i.speed && i.speed !== 1 ? ` · ×${i.speed}` : ""}{i.selfReport ? ` (본인 ${GENRE[i.selfReport]?.label})` : ""}</option>)}
              </select>
              {sessionBadges(sess).map((bd) => (
                <span key={bd.key} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${bd.tone === "warn" ? "rgba(255,207,122,0.55)" : "rgba(255,255,255,0.2)"}`, color: bd.tone === "warn" ? "#ffcf7a" : "rgba(255,255,255,0.7)" }}>{bd.text}</span>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{describe(sess)}</p>
            {(() => { const e = engageLine(sess); return e && (e.metrics || e.fp) ? (
              <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
                {e.metrics}{e.fp ? <> · <span style={{ fontStyle: "italic" }}>{e.fp}</span></> : null}
              </p>
            ) : null; })()}
            {sess && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>{directionChangeText(sess)}</p>}
            {(() => { const sr = key === "a" ? sa : sb; const pk = xhatPeak(sr, eventMarks(sess)); return pk ? (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: XHAT_COLOR[key] }}>x̂ 최고 {pk.tension.toFixed(2)} ({pk.label ? `${pk.label}, ` : ""}{mmss(pk.t)})</p>
            ) : null; })()}
          </div>
        ))}
        <p className={s.dim} style={{ fontSize: 12 }}>세션은 /film·/interim 종료 시 data/sessions/ 에 자동 저장됩니다. 전시에서는 두 사람이 이 화면을 나란히 보는 자리를 체험 자리와 떨어뜨려 두세요 (요청서 v5.0 §3.3 마이크 오염).</p>
      </div>
    </div>
  );
}
