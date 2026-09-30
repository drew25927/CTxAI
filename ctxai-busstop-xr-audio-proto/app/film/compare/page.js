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
// /film/compare?…&kiosk=1  → 전시·녹화용(개발용 링크 숨김)

import { useEffect, useMemo, useState } from "react";
import s from "../../story/story.module.css";
import f from "../film.module.css";
import { mixLines, verdictOf, mmss, fingerprintText, MOMENT_TEXT, MOMENT_BASIS } from "@/lib/viewerText";
import { lengthNote, labelRows, LABEL_LAYOUT, sessionRoute, sessionBadges, directionChangeText, xhatSeries, eventMarks, judgeTime, judgeLine, lookResponses, lookText, momentsOf, peakText, NO_PEAK_TEXT, xhatGap, pairWarning, biasOf, movieTrajectory, markBefore, eventPeaks, leaderBands } from "@/lib/sessionCompare";
import { observedSegments } from "@/lib/tensionEstimate";

const GENRE = { R: { label: "로맨스", accent: "#f2a7c0" }, H: { label: "공포", accent: "#8fae95" }, C: { label: "블랙코미디", accent: "#e0a86a" } };
const XHAT_COLOR = { a: "#7fd1ff", b: "#ffcf7a" }; // x̂ 곡선 — A 하늘색 실선, B 호박색 점선

function useQuery() {
  const [q, setQ] = useState({});
  useEffect(() => { setQ(Object.fromEntries(new URLSearchParams(window.location.search).entries())); }, []);
  return q;
}

// 사건 눈금·판정선 — 두 차트가 같이 쓴다. 눈금은 A 세션 기준(없으면 B), 시각은 영화 시간(lib/sessionCompare.js).
// layer="lines" 는 곡선 아래에, layer="labels" 는 곡선 위에 그린다 — 이름표를 곡선보다 먼저 그리면 "판정"·사건 이름이
// 선에 가려진다(B197, B 칸 바닥의 "판정" 이 블랙코미디 선과 겹침). 이름표 글자에는 배경색 테두리(halo)를 둔다.
const HALO = { paintOrder: "stroke", stroke: "#0b0f14", strokeWidth: 3, strokeLinejoin: "round" };
// 이름표 줄은 i%3 순환이 아니라 폭을 보고 배치한다(lib/sessionCompare labelRows · B210) — 0:37~0:53 에 몰린 개구리·고양이·비명이 붙지 않는다.
function Marks({ marks, judgeT, x, H, PAD, labelTop = PAD, layer = "both" }) {
  const lines = layer !== "labels", labels = layer !== "lines";
  const rows = labelRows(marks, x);
  return (
    <>
      {judgeT != null && (
        <g>
          {lines && <line x1={x(judgeT)} x2={x(judgeT)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />}
          {labels && <text x={x(judgeT) + 3} y={H - PAD - 4} fill="rgba(255,255,255,0.7)" fontSize="9" style={HALO}>판정</text>}
        </g>
      )}
      {marks.map((m, i) => (
        <g key={i}>
          {lines && <line x1={x(m.t)} x2={x(m.t)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />}
          {labels && <text x={x(m.t) + LABEL_LAYOUT.offset} y={labelTop + 10 + rows[i] * LABEL_LAYOUT.rowH} fill="rgba(255,255,255,0.45)" fontSize="9" style={HALO}>{m.label}</text>}
        </g>
      ))}
    </>
  );
}

// 궤적·눈금·판정선은 모두 영화 시간 — /film 배속 회차도 × speed 로 맞춘 것(movieTrajectory·eventMarks·judgeTime)
// A·B 를 위아래 두 칸으로 나누고, 칸마다 맨 위에 그 시각 선두 장르의 색 띠를 깐다(B187). 한 칸에 겹쳐 그리면 /interim 공포형
// (블랙코미디 0.67 선두)과 차분형(로맨스 0.67 선두)처럼 값이 대칭인 쌍은 선이 같은 높이에 포개져, 머리글의 "1:13 부터 갈라졌습니다"
// 가 그래프에서 보이지 않았다(검토 턴 44 crop-compare-mix.png). 갈라진 시각(diverge)은 두 칸을 가로지르는 세로선으로.
function Chart({ a, b, divergeAt }) {
  const W = 900, LEFT = 24, PAD = 10, LANE = 104, GAP = 14, BAND = 8;
  const H = PAD * 2 + LANE * 2 + GAP;
  const ta = movieTrajectory(a), tb = movieTrajectory(b);
  const tMax = Math.max(ta.at(-1)?.t || 1, tb.at(-1)?.t || 1);
  const x = (t) => LEFT + (t / tMax) * (W - LEFT - PAD);
  const lanes = [
    { key: "A", tr: ta, top: PAD },
    { key: "B", tr: tb, top: PAD + LANE + GAP },
  ];
  const ref = a || b;
  return (
    <svg className={f.chart} style={{ height: H }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Marks marks={eventMarks(ref)} judgeT={judgeTime(ref)} x={x} H={H} PAD={PAD} layer="lines" />
      {lanes.map(({ key, tr, top }) => {
        const y = (v) => top + BAND + 4 + (1 - v) * (LANE - BAND - 6);
        const path = (g) => tr.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[g]).toFixed(1)}`).join(" ");
        return (
          <g key={key}>
            <rect x={LEFT} y={top} width={W - LEFT - PAD} height={LANE} fill="rgba(255,255,255,0.03)" />
            {leaderBands(tr).map((bd, i) => (
              <rect key={i} x={x(bd.t0)} y={top} width={Math.max(0.5, x(bd.t1) - x(bd.t0))} height={BAND} fill={bd.g ? GENRE[bd.g].accent : "rgba(255,255,255,0.18)"} />
            ))}
            {tr.length > 0 && ["R", "H", "C"].map((g) => <path key={g} d={path(g)} fill="none" stroke={GENRE[g].accent} strokeWidth="2.2" />)}
            <text x={4} y={top + LANE / 2 + 5} fill="rgba(255,255,255,0.85)" fontSize="14" fontWeight="700">{key}</text>
          </g>
        );
      })}
      {divergeAt != null && (
        <g>
          <line x1={x(divergeAt)} x2={x(divergeAt)} y1={PAD} y2={H - PAD} stroke="#ffffff" strokeWidth="1.4" strokeDasharray="2 3" />
          <text x={x(divergeAt) - 4} y={PAD + LANE + GAP - 3} fill="#ffffff" fontSize="10" textAnchor="end" style={HALO}>갈라짐 {mmss(divergeAt)}</text>
        </g>
      )}
      <Marks marks={eventMarks(ref)} judgeT={judgeTime(ref)} x={x} H={H} PAD={PAD} labelTop={PAD + BAND + 2} layer="labels" />
    </svg>
  );
}

function describe(sess) {
  if (!sess) return "";
  if (sessionRoute(sess) === "interim") return describeInterim(sess);
  // 배합은 판정 때 것이 주 문장, 끝 배합은 "판정 뒤 흐름" — 종료 카드와 같은 규칙(lib/viewerText.js, B86).
  // B86 이전 세션은 verdict 가 없어 judge 큐 시각의 궤적 표본으로 되살린다.
  // 사건별 반응은 "돌아본·움찔만·반응 없던" 세 갈래(B128) — 옛 "본 것/안 본 것" 은 기준을 밝히지 않아 "안 본 개구리가 x̂ 최고" 가 모순으로 읽혔다
  const mix = mixLines({ verdict: verdictOf(sess), final: sess.final });
  const look = lookText(lookResponses(sess));
  return `옆에 앉은 사람 ${GENRE[sess.dominant]?.label || "-"} · ${mix.main}` + (mix.after ? ` · ${mix.after}` : "")
    + (look ? ` · ${look}` : "")
    + (sess.selfReport ? ` · 본인 느낌: ${GENRE[sess.selfReport]?.label}` : "");
}

// 긴장 추정 x̂ 두 곡선(B14b) — 두 라우트 모두 engagement 리포트에서 같은 함수로 다시 계산한 값(영화 시간).
// /interim 두 세션이면 "같은 다섯 사건, 다른 두 사람" 이 이 그림 하나로 보인다.
// 사건 사이(사건 반응 몫 없음)는 흐린 가는 선 — 모니터·종료 카드와 같은 규칙(B151, observedSegments). 두 순간(B144)은 세션 색으로:
// 가장 크게 반응(x̂ 최고)은 점, 가장 차분히 집중(집중도 최고 2초)은 바닥 막대(A 아래 줄 · B 위 줄).
// 이름표는 곡선 위 띠(BAND)에 따로 두어 봉우리 점(●, 상한 1.0 이면 맨 위)과 겹치지 않는다(B210). 띠 높이는 실제로 쓴 줄 수만큼.
function XhatChart({ a, b, sa, sb, ma, mb }) {
  const W = 900, PLOT = 140, PAD = 10;
  const tMax = Math.max(sa.at(-1)?.t || 1, sb.at(-1)?.t || 1, movieTrajectory(a).at(-1)?.t || 1, movieTrajectory(b).at(-1)?.t || 1);
  const x = (t) => PAD + (t / tMax) * (W - PAD * 2);
  const ref = a || b;
  const marks = eventMarks(ref);
  const nRows = marks.length ? Math.max(...labelRows(marks, x)) + 1 : 0;
  const BAND = nRows ? 10 + nRows * LABEL_LAYOUT.rowH : 0; // 마지막 줄 글자 바닥과 상한 1.0 봉우리 점(r 5 + 테두리)의 사이를 남긴다
  const H = PAD * 2 + BAND + PLOT;
  const y = (v) => H - PAD - v * PLOT;
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.tension).toFixed(1)}`).join(" ");
  const curve = (sr, color, dash) => observedSegments(sr).map((g, i) => (
    <path key={i} d={path(g.points)} fill="none" stroke={color} strokeWidth={g.observed ? 2.2 : 1.2} strokeOpacity={g.observed ? 1 : 0.4} strokeDasharray={dash} />
  ));
  const calmBar = (m, color, row) => m?.calm && (
    <rect x={x(m.calm.t0)} y={H - PAD - 5 - row * 7} width={Math.max(4, x(m.calm.t1) - x(m.calm.t0))} height={5} rx={1.5} fill={color} opacity={0.85} />
  );
  const peakDot = (m, color) => m?.peak && <circle cx={x(m.peak.t)} cy={y(m.peak.tension)} r={5} fill={color} stroke="#0b0f14" strokeWidth={1.5} />;
  // 사건별 봉우리 점(B222) — 한 창(2초)짜리 침 모양 봉우리도 자리가 보이게 작은 점(r 3). 큰 점(r 5)은 세션 최고 봉우리 그대로
  const eventDots = (sr, color, key) => eventPeaks(sr, marks).map((p) => <circle key={`${key}-${p.name}-${p.t}`} cx={x(p.t)} cy={y(p.tension)} r={3} fill={color} stroke="#0b0f14" strokeWidth={1} />);
  return (
    <svg className={f.chart} style={{ height: H }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0.5, 1].map((v) => <line key={v} x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.07)" />)}
      <Marks marks={marks} judgeT={judgeTime(ref)} x={x} H={H} PAD={PAD} layer="lines" />
      {calmBar(ma, XHAT_COLOR.a, 0)}
      {calmBar(mb, XHAT_COLOR.b, 1)}
      {sa.length > 0 && curve(sa, XHAT_COLOR.a)}
      {sb.length > 0 && curve(sb, XHAT_COLOR.b, "6 4")}
      {sa.length > 0 && eventDots(sa, XHAT_COLOR.a, "a")}
      {sb.length > 0 && eventDots(sb, XHAT_COLOR.b, "b")}
      {peakDot(ma, XHAT_COLOR.a)}
      {peakDot(mb, XHAT_COLOR.b)}
      <Marks marks={marks} judgeT={judgeTime(ref)} x={x} H={H} PAD={PAD} layer="labels" />
    </svg>
  );
}

// /interim 세션의 판정·반응 줄 — 팀 5신호 판정(등급·점수 그대로)과 우리 관측 축의 사건별 반응(돌아본·움찔만·반응 없던, B128).
function describeInterim(sess) {
  const parts = [`옆에 앉은 사람 ${GENRE[sess.dominant]?.label || "-"}`];
  const jl = judgeLine(sess);
  if (jl) parts.push(jl);
  const look = lookText(lookResponses(sess));
  if (look) parts.push(look);
  return parts.join(" · ");
}

// 반응률·웃음·집중 풀림·반응 지문 한 줄 — engagement.summary 로. 반응 지문(fingerprintText)은 종료 카드와 같은 함수(lib/viewerText.js, B84·B108).
// 두 순간(가장 크게 반응·가장 차분히 집중)은 카드 맨 아래 줄로 옮겼다(B144, momentsOf).
// 세션의 집중도 시각은 실제 경과 초라 배속 회차(sess.speed)는 영화 시간으로 곱해 적는다.
function engageLine(sess) {
  const s = sess?.engagement?.summary;
  if (!s) return null;
  const sp = sess?.speed || 1;
  const parts = [];
  if (s.probeResponseRate != null) parts.push(`사건 반응 ${Math.round(s.probeResponseRate * 100)}%`);
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
  const kiosk = q.kiosk === "1"; // ?kiosk=1 — 전시·녹화용: 개발용 "← /film" 링크를 숨긴다(/film·/interim 과 같은 규칙, B122)
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
  const ma = useMemo(() => momentsOf(a), [a]); // 두 순간(B144) — 종료 카드와 같은 함수
  const mb = useMemo(() => momentsOf(b), [b]);
  const lenNote = useMemo(() => lengthNote(a, b), [a, b]); // /film 쌍의 길이 차이와 원인(B221) — 배합 그래프 아래 범례
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
        {kiosk ? <span /> : <a className={s.homeLink} href="/film">← /film</a>}
        <span className={s.dim}>두 관객 비교 · 같은 정류장, 다른 하늘</span>
        <span />
      </div>
      <div style={{ maxWidth: 960, margin: "70px auto 40px", padding: "0 20px", wordBreak: "keep-all" /* 한글 단어 안에서 접지 않는다(B163) */ }}>
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
        <Chart a={a} b={b} divergeAt={biasSplit ? null : divergeAt} />
        <div className={f.legend}>
          {["R", "H", "C"].map((g) => <span key={g}><i style={{ background: GENRE[g].accent }} />{GENRE[g].label}</span>)}
          <span className={s.dim}>위 칸 A · 아래 칸 B · 칸 위 띠 = 그 시각 선두 장르(회색 = 비슷함)</span>
        </div>
        {/* /film 쌍의 길이 차이와 원인(B221) — 범례 flex 행 안에 두면 두 줄로 접혀 그래프 오른쪽 끝을 넘어가므로 한 문단으로 */}
        {lenNote && <p className={s.dim} style={{ margin: "2px 0 0", fontSize: 12 }}>{lenNote}</p>}
        {(sa.length > 0 || sb.length > 0) && (
          <div style={{ margin: "14px 0 6px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
              긴장 추정 x̂ — {bothInterim ? "같은 다섯 사건, 다른 두 사람" : "두 관객의 반응"}
            </p>
            <XhatChart a={a} b={b} sa={sa} sb={sb} ma={ma} mb={mb} />
            <div className={f.legend}>
              <span><i style={{ background: XHAT_COLOR.a }} />A 실선</span>
              <span><i style={{ background: XHAT_COLOR.b }} />B 점선</span>
              <span className={s.dim}>● 가장 크게 반응 · ▬ 가장 차분히 집중 · 흐린 선 = 사건 사이(잔움직임만)</span>
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
            {(() => { const m = key === "a" ? ma : mb; return m.peak || m.noPeak || m.calm ? (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: XHAT_COLOR[key] }}>
                {m.peak && <>● {MOMENT_TEXT.peak} {peakText(m.peak)}</>}
                {m.noPeak && <>{MOMENT_TEXT.peak}: {NO_PEAK_TEXT}</>}
                {(m.peak || m.noPeak) && m.calm && " · "}
                {m.calm && <>▬ {MOMENT_TEXT.calm} {m.calm.text}</>}
              </p>
            ) : null; })()}
          </div>
        ))}
        {/* 세 기준(B128·B144) — 한 카드의 "돌아본 사건"·"가장 크게 반응"·"가장 차분히 집중" 은 서로 다른 것을 잰다 */}
        <p className={s.dim} style={{ fontSize: 12, margin: "0 0 6px" }}>읽는 법: {MOMENT_BASIS.join(" · ")}. 시선(돌아봤나)·반응의 크기(x̂)·집중도는 서로 다른 것을 재므로 다른 사건·순간을 가리킬 수 있습니다.</p>
        <p className={s.dim} style={{ fontSize: 12 }}>세션은 /film·/interim 종료 시 data/sessions/ 에 자동 저장됩니다. 전시에서는 두 사람이 이 화면을 나란히 보는 자리를 체험 자리와 떨어뜨려 두세요 (요청서 v5.0 §3.3 마이크 오염).</p>
      </div>
    </div>
  );
}
