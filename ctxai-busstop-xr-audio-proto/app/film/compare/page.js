"use client";

// 두 관객 비교 — "너 나랑 다른 걸 봤네".
// 원 제안서와 요청서 v5.0이 원한 장치(체험 뒤 두 사람이 카드를 비교하는 자리)를
// data/sessions/ 에 자동 저장된 연출 궤적으로 만든다. 같은 정류장, 같은 다섯 사건인데
// 두 사람의 하늘이 언제부터 어떻게 갈렸는지가 그래프 하나로 보인다.
//
// /film/compare            → 최근 두 세션
// /film/compare?a=<id>&b=<id>

import { useEffect, useMemo, useState } from "react";
import s from "../../story/story.module.css";
import f from "../film.module.css";
import { mixLines, verdictOf, mmss, fingerprintText, focusText, filmTimeEvents, STIMULUS_LABEL } from "@/lib/viewerText";

const GENRE = { R: { label: "로맨스", accent: "#f2a7c0" }, H: { label: "공포", accent: "#8fae95" }, C: { label: "블랙코미디", accent: "#e0a86a" } };
const EVENT_LABEL = STIMULUS_LABEL; // 사건 이름표는 종료 카드와 한 표(lib/viewerText.js)

function useQuery() {
  const [q, setQ] = useState({});
  useEffect(() => { setQ(Object.fromEntries(new URLSearchParams(window.location.search).entries())); }, []);
  return q;
}

function Chart({ a, b }) {
  const W = 900, H = 220, PAD = 10;
  const tMax = Math.max(a?.trajectory?.at(-1)?.t || 1, b?.trajectory?.at(-1)?.t || 1);
  const x = (t) => PAD + (t / tMax) * (W - PAD * 2);
  const y = (v) => H - PAD - v * (H - PAD * 2);
  const path = (tr, g) => tr.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[g]).toFixed(1)}`).join(" ");
  const marks = (a?.events || []).filter((e) => e.kind === "event" && e.name === "event:start");
  const judge = (a?.events || []).find((e) => e.kind === "event" && e.name === "cue" && e.detail === "judge");
  return (
    <svg className={f.chart} style={{ height: 220 }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {judge && (
        <g>
          <line x1={x(judge.t)} x2={x(judge.t)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
          <text x={x(judge.t) + 3} y={H - PAD - 4} fill="rgba(255,255,255,0.7)" fontSize="9">판정</text>
        </g>
      )}
      {marks.map((m, i) => (
        <g key={i}>
          <line x1={x(m.t)} x2={x(m.t)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
          <text x={x(m.t) + 3} y={PAD + 10 + (i % 3) * 11} fill="rgba(255,255,255,0.45)" fontSize="9">{EVENT_LABEL[m.detail?.name] || m.detail?.name}</text>
        </g>
      ))}
      {["R", "H", "C"].map((g) => (
        <g key={g}>
          {a?.trajectory && <path d={path(a.trajectory, g)} fill="none" stroke={GENRE[g].accent} strokeWidth="2.2" />}
          {b?.trajectory && <path d={path(b.trajectory, g)} fill="none" stroke={GENRE[g].accent} strokeWidth="2.2" strokeDasharray="6 4" opacity="0.85" />}
        </g>
      ))}
    </svg>
  );
}

function describe(sess) {
  if (!sess) return "";
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

// 집중·긴장 한 줄 — engagement.summary 로. 반응 지문(fingerprintText)·집중한 순간(focusText)은 종료 카드와 같은 함수(lib/viewerText.js, B84·B108).
// 세션의 집중도 시각은 실제 경과 초라 배속 회차(sess.speed)는 영화 시간으로 곱해 적는다(/film 세션은 이벤트도 실제 초라 filmTimeEvents 로).
function engageLine(sess) {
  const s = sess?.engagement?.summary;
  if (!s) return null;
  const sp = sess?.speed || 1;
  const parts = [];
  if (s.probeResponseRate != null) parts.push(`사건 반응 ${Math.round(s.probeResponseRate * 100)}%`);
  const events = sess?.route === "interim" ? sess.events : filmTimeEvents(sess?.events, sp);
  const focus = focusText(s, { events, speed: sp });
  if (focus) parts.push(`가장 집중 ${focus}`);
  if (s.laughEpisodes?.length) parts.push(`웃음 ${s.laughEpisodes.length}회`);
  if (s.dropPoint) parts.push(`집중 풀림 ${mmss(s.dropPoint.t * sp)}`);
  const fp = fingerprintText(sess?.control?.theta);
  return { metrics: parts.join(" · "), fp };
}

function diverge(a, b) {
  if (!a?.trajectory || !b?.trajectory) return null;
  const bt = b.trajectory;
  for (const p of a.trajectory) {
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
          {divergeAt != null ? `두 정류장은 ${Math.floor(divergeAt / 60)}:${String(Math.floor(divergeAt % 60)).padStart(2, "0")} 부터 갈라졌습니다.` : a && b ? "두 궤적이 거의 같습니다." : ""}
        </p>
        <Chart a={a} b={b} />
        <div className={f.legend}>
          {["R", "H", "C"].map((g) => <span key={g}><i style={{ background: GENRE[g].accent }} />{GENRE[g].label}</span>)}
          <span className={s.dim}>실선 A · 점선 B</span>
        </div>
        {[["A", a, "a"], ["B", b, "b"]].map(([label, sess, key]) => (
          <div key={key} style={{ margin: "10px 0 16px", padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
              <b>{label}</b>
              <select value={ids[key] || ""} onChange={(e) => setIds((p) => ({ ...p, [key]: e.target.value }))} style={{ background: "rgba(0,0,0,0.4)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}>
                {list.map((i) => <option key={i.id} value={i.id}>{i.savedAt?.slice(5, 16).replace("T", " ")} · {GENRE[i.dominant]?.label || "-"}{i.selfReport ? ` (본인 ${GENRE[i.selfReport]?.label})` : ""}</option>)}
              </select>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{describe(sess)}</p>
            {(() => { const e = engageLine(sess); return e && (e.metrics || e.fp) ? (
              <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
                {e.metrics}{e.fp ? <> · <span style={{ fontStyle: "italic" }}>{e.fp}</span></> : null}
              </p>
            ) : null; })()}
          </div>
        ))}
        <p className={s.dim} style={{ fontSize: 12 }}>세션은 /film 종료 시 data/sessions/ 에 자동 저장됩니다. 전시에서는 두 사람이 이 화면을 나란히 보는 자리를 체험 자리와 떨어뜨려 두세요 (요청서 v5.0 §3.3 마이크 오염).</p>
      </div>
    </div>
  );
}
