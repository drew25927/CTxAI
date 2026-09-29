"use client";

// 디렉터 모니터 — 관객 응답 모델 θ̂·긴장 추정 x̂·(작가 목표 곡선)·도달가능 트랙·다음 자극 추천을
// 한 패널에 보여준다. /film(5분 반응형 영화)과 /interim(2분20초 중간시연)이 같은 컴포넌트를 쓴다.
//
// 두 라우트의 차이는 props 로만 가른다:
//   /film    showTarget=true  — 트랙별 작가 곡선(lib/tensionCurve.js)이 있으니 점선으로 겹친다. next(슬롯 추천) 표시.
//   /interim showTarget=false — 도입부 다섯 사건은 중립 탐침이라 목표 곡선이 없다. 대신 사건 눈금(S1~S5)을 찍는다.
//
// monitor 객체 모양(페이지가 250ms/200ms 틱마다 만든다):
//   { track, theta:{g,L,tau,rho,confidence,nResp}, xhat, target?, tol?, ceiling?, series:[{t,tension}],
//     nStim, sel?:{track,reach}, control?:bool, micro?:number, note?,
//     next?:{kind:"slot"|"micro"|"done", slotId, variantId?, dose?, reason, count?, max?}   ← lib/slotController nextAdvice
//     actuate?:{u,mode,offsets},     ← /film 연속 액추에이터(lib/controlActuate.js)의 현재 구동량·오프셋
//     slots?:{frog?:{variantId,dose,actuation:{volume,plays}}, cat?:{…}} }   ← /film 슬롯 변형 확정값(lib/slotActuate.js, B78). variantId null = 고정 연출

import { curveAt } from "@/lib/tensionCurve";

// 작은 그래프 — 작가 목표 곡선(점선)과 관객 긴장 추정 x̂(실선), 현재 시각 표시, 사건 눈금.
export function MonitorChart({ series = [], track = "H", tNow = 0, ceiling = 1, tMax: tMaxProp = 180, showTarget = true, marks = [] }) {
  const W = 292, H = 60, PAD = 4;
  const tMax = Math.max(tMaxProp, tNow, series.length ? series[series.length - 1].t : 0);
  const x = (t) => PAD + (t / tMax) * (W - PAD * 2);
  const y = (v) => H - PAD - v * (H - PAD * 2);
  const target = [];
  if (showTarget && track) {
    for (let t = 0; t <= tMax; t += 6) target.push(`${t === 0 ? "M" : "L"}${x(t).toFixed(1)},${y(curveAt(track, t).target).toFixed(1)}`);
  }
  const xhat = series.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.tension).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", background: "rgba(255,255,255,0.04)", borderRadius: 6 }}>
      {showTarget && <line x1={PAD} x2={W - PAD} y1={y(ceiling)} y2={y(ceiling)} stroke="rgba(224,168,106,0.4)" strokeDasharray="2 3" />}
      {marks.map((m) => (
        <g key={m.label + m.t}>
          <line x1={x(m.t)} x2={x(m.t)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.14)" />
          <text x={x(m.t) + 2} y={PAD + 8} fill="rgba(255,255,255,0.45)" fontSize="8" fontFamily="ui-monospace, monospace">{m.label}</text>
        </g>
      ))}
      {target.length > 0 && <path d={target.join(" ")} fill="none" stroke="rgba(255,255,255,0.45)" strokeDasharray="4 3" strokeWidth="1.5" />}
      {xhat && <path d={xhat} fill="none" stroke="#7fd1ff" strokeWidth="2" />}
      <line x1={x(tNow)} x2={x(tNow)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.3)" />
    </svg>
  );
}

const fmt2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "-");
const sgn = (v, d = 2) => (v > 0 ? "+" : "") + v.toFixed(d);
const ACT_MODE = { arouse: "각성", relax: "이완", hold: "유지", off: "대기" };

// 연속 액추에이터 한 줄 — 0 이 아닌 축만. (BGM 은 배율, 나머지는 deriveParams 값에 더한 오프셋)
function actuateText(a) {
  const o = a.offsets || {};
  const parts = [];
  if (o.npcSilence) parts.push(`침묵 ${sgn(o.npcSilence)}s`);
  if (o.bgmGain) parts.push(`BGM ×${(1 + o.bgmGain).toFixed(2)}`);
  if (o.lampOn) parts.push(`가로등 ${sgn(o.lampOn)}`);
  if (o.fogDensity) parts.push(`안개 ${sgn(o.fogDensity, 3)}`);
  if (o.npcDistance) parts.push(`거리 ${sgn(o.npcDistance)}m`);
  if (o.npcGaze) parts.push(`시선 ${sgn(o.npcGaze * 100, 0)}%`);
  return parts.length ? parts.join(" · ") : "오프셋 0";
}

// 슬롯 변형 확정 한 줄(B78) — 개구리·고양이가 실제로 어떤 변형으로 울렸는가. 제어 OFF 는 "고정" 으로 표시.
function slotsText(slots, eventLabel) {
  const ids = Object.keys(slots || {});
  if (!ids.length) return null;
  return ids.map((id) => {
    const c = slots[id]; const a = c.actuation || {};
    const label = eventLabel[id] || id;
    if (!c.variantId) return `${label} 고정(${a.volume ?? "-"})`;
    return `${label} → ${c.variantId}(용량 ${c.dose}${a.plays > 1 ? ` · ${a.plays}회` : ""} · 볼륨 ${a.volume})`;
  }).join(" · ");
}

// "다음" 줄의 머리 — 고정 슬롯이면 계획 변형·용량, 고정 슬롯이 끝났으면 미세 자극 차례(B66), 장면 뒤면 없음
function nextHeadline(next, eventLabel) {
  const label = eventLabel[next.slotId] || next.slotId;
  if (next.kind === "done") return <span style={{ opacity: 0.6 }}>다음 개입 없음</span>;
  if (next.kind === "micro") {
    return <span>다음 미세 자극 <b>{label}</b> {next.count ?? 0}/{next.max ?? 3}{next.dose != null && <> → <b>{next.variantId}</b> (용량 {next.dose})</>}</span>;
  }
  return <span>다음 <b>{label}</b> → <b>{next.variantId}</b> (용량 {next.dose})</span>;
}

export default function DirectorMonitor({ monitor, tNow = 0, tMax = 180, showTarget = true, marks = [], eventLabel = {}, title = "디렉터 모니터" }) {
  if (!monitor) return null;
  const { theta } = monitor;
  const hasTarget = showTarget && Number.isFinite(monitor.target);
  const xhatColor = hasTarget
    ? (monitor.xhat > monitor.target + monitor.tol ? "#e0a86a" : monitor.xhat < monitor.target - monitor.tol ? "#8fae95" : "#cfe")
    : "#7fd1ff";
  return (
    <div style={{ position: "fixed", top: 12, left: 12, zIndex: 40, width: 320, padding: "12px 14px", borderRadius: 10, background: "rgba(12,14,20,0.82)", color: "#e6e9f0", font: "12px/1.5 ui-monospace, monospace", border: "1px solid rgba(255,255,255,0.12)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <b>{title}</b><span style={{ opacity: 0.6 }}>트랙 {monitor.track || "-"} · 자극 {monitor.nStim}</span>
      </div>
      <MonitorChart series={monitor.series} track={monitor.track || "H"} tNow={tNow} ceiling={monitor.ceiling ?? 1} tMax={tMax} showTarget={showTarget} marks={marks} />
      <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0" }}>
        {hasTarget ? <span>목표 <b>{fmt2(monitor.target)}</b></span> : <span style={{ opacity: 0.6 }}>목표 곡선 없음(중립 탐침)</span>}
        <span>추정 x̂ <b style={{ color: xhatColor }}>{fmt2(monitor.xhat)}</b></span>
      </div>
      {theta && (
        <div style={{ opacity: 0.85 }}>관객모델 θ̂: 이득 {theta.g} · 지연 {theta.L}s · 회복 {theta.tau}s · 습관화 {theta.rho} <span style={{ opacity: 0.5 }}>(확신 {Math.round((theta.confidence || 0) * 100)}% · 응답 {theta.nResp}/{theta.n})</span></div>
      )}
      {monitor.sel && <div style={{ opacity: 0.85 }}>도달가능 트랙: R {monitor.sel.reach.R} · H {monitor.sel.reach.H} · C {monitor.sel.reach.C} → <b>{monitor.sel.track}</b></div>}
      {monitor.control != null && (
        <div style={{ opacity: 0.85 }}>실제 제어: {monitor.control ? <b style={{ color: "#7fd1ff" }}>ON · 미세 자극 {monitor.micro ?? 0}/3</b> : <span style={{ opacity: 0.6 }}>OFF (advisory)</span>}</div>
      )}
      {monitor.control && monitor.actuate && (
        <div style={{ opacity: 0.85, fontSize: 11 }}>연속 구동 <b>{ACT_MODE[monitor.actuate.mode] || monitor.actuate.mode}</b> u {sgn(monitor.actuate.u || 0)} · {actuateText(monitor.actuate)}</div>
      )}
      {monitor.slots && slotsText(monitor.slots, eventLabel) && (
        <div style={{ opacity: 0.85, fontSize: 11 }}>슬롯 변형 {slotsText(monitor.slots, eventLabel)}</div>
      )}
      {monitor.note && <div style={{ opacity: 0.7 }}>{monitor.note}</div>}
      {monitor.next && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          {nextHeadline(monitor.next, eventLabel)}
          <div style={{ opacity: 0.7, fontSize: 11 }}>{monitor.next.reason}</div>
        </div>
      )}
    </div>
  );
}
