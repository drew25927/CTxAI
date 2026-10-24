"use client";

// 운영자 모니터 — 헤드셋(또는 다른 PC)에서 돌고 있는 /film 의 진행 상황을 실시간으로 본다.
// /film 이 1.5초마다 /api/live 로 요약(단계·영화 시간·장르 비중·지금 대사·질문 대기·VR 여부·fps)을 올리고,
// 이 페이지는 1초마다 읽는다. 최근 90초 안에 갱신된 기기만 보인다. 화면 자체를 보려면 Quest 캐스팅을 쓴다.

import { useEffect, useState } from "react";
import s from "../../story/story.module.css";
import f from "../film.module.css";

const BAR = { gridTemplateColumns: "80px 1fr 44px" };
const GENRE = { R: { label: "로맨스", accent: "#f2a7c0" }, H: { label: "공포", accent: "#8fae95" }, C: { label: "블랙코미디", accent: "#e0a86a" } };
const PHASE = { gate: "시작 전", intro: "도입부(사건 5개)", judged: "판정", scene: "인물 장면", bus: "버스 도착", end: "끝 · 결과 화면" };

const mmss = (t) => `${Math.floor((t || 0) / 60)}:${String(Math.floor((t || 0) % 60)).padStart(2, "0")}`;

function Device({ d, now }) {
  const age = Math.max(0, Math.round((now - Date.parse(d.at)) / 1000));
  const stale = age > 6;
  const w = d.weights || {};
  const dom = d.dominant && GENRE[d.dominant];
  return (
    <div style={{ border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,.04)", opacity: stale ? 0.55 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 18 }}>{d.device || "기기"} {d.xr ? "· 🥽 VR 중" : ""}</strong>
        <span className={s.dim} style={{ fontSize: 13 }}>
          {stale ? `⚠️ ${age}초째 소식 없음` : `${age}초 전 갱신`} · fps {d.fps ?? "–"} · 웹캠 {d.cam || "–"}
        </span>
      </div>
      <p style={{ margin: "10px 0 4px", fontSize: 15 }}>
        <b>{PHASE[d.phase] || d.phase}</b> · 영화 {mmss(d.t)}
        {dom && <> · 판정 <b style={{ color: dom.accent }}>{dom.label}</b></>}
        {d.settled != null && <span className={s.dim}> (안정도 {Math.round(d.settled * 100)}%)</span>}
      </p>
      {["R", "H", "C"].map((g) => (
        <div key={g} className={f.bar} style={BAR}>
          <span>{GENRE[g].label}</span>
          <div className={f.barTrack}><div className={f.barFill} style={{ width: `${Math.round((w[g] || 0) * 100)}%`, background: GENRE[g].accent }} /></div>
          <span style={{ textAlign: "right" }}>{Math.round((w[g] || 0) * 100)}%</span>
        </div>
      ))}
      <div style={{ marginTop: 10, minHeight: 44, fontSize: 15, lineHeight: 1.5 }}>
        {d.line ? (
          <>
            <span className={s.dim}>{GENRE[d.line.genre]?.label} {d.line.seq}{d.line.flavor ? " · 보조 장르 끼워 넣기" : ""}{d.line.tinted ? ` · ${GENRE[d.line.tinted]?.label} 변주` : ""}</span>
            <div>“{d.line.text}”</div>
          </>
        ) : d.caption ? <span>{d.caption}</span> : <span className={s.dim}>지금 나오는 대사 없음</span>}
        {d.ask?.listening && <div style={{ color: "#f0d080" }}>↳ 관객 대답 기다리는 중 (고개 끄덕임·가로젓기)</div>}
        {d.ask && !d.ask.listening && d.ask.answered != null && <div className={s.dim}>↳ {d.ask.seq}번 질문: {d.ask.answered ? "답함" : "답 없음"}</div>}
      </div>
    </div>
  );
}

export default function LivePage() {
  const [devices, setDevices] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        const j = await r.json();
        if (alive) { setDevices(j.devices || []); setErr(""); }
      } catch (e) { if (alive) setErr("서버에 연결하지 못했습니다 — 다시 시도 중"); }
      if (alive) setNow(Date.now());
    };
    poll();
    const t = setInterval(poll, 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div className={s.stage} style={{ overflow: "auto" }}>
      <div className={s.topBar}>
        <a className={s.homeLink} href="/film">← /film</a>
        <span className={s.dim}>운영자 모니터 · 실시간 진행 상황</span>
      </div>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "84px 16px 40px" }}>
      <p className={s.dim} style={{ marginTop: 0 }}>
        지금 /film 을 열어 둔 기기(Quest·PC)의 진행 상황 — 1초마다 갱신. 헤드셋 화면 자체는 Quest 캐스팅으로 보세요.
      </p>
      {err && <p style={{ color: "#f0a0a0" }}>{err}</p>}
      <div style={{ display: "grid", gap: 14 }}>
        {devices.length === 0
          ? <p className={s.dim}>지금 /film 을 열어 둔 기기가 없습니다. 헤드셋에서 busstop-team.vercel.app/film 을 열면 여기에 나타납니다.</p>
          : devices.map((d) => <Device key={d.id} d={d} now={now} />)}
      </div>
      </div>
    </div>
  );
}
