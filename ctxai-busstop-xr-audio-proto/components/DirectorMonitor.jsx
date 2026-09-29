"use client";

// 디렉터 모니터 — 관객 응답 모델 θ̂·긴장 추정 x̂·(작가 목표 곡선)·도달가능 트랙·다음 자극 추천을
// 한 패널에 보여준다. /film(5분 반응형 영화)과 /interim(2분20초 중간시연)이 같은 컴포넌트를 쓴다.
//
// 두 라우트의 차이는 props 로만 가른다:
//   /film    showTarget=true  — 트랙별 작가 곡선(lib/tensionCurve.js)이 있으니 점선으로 겹친다. next(슬롯 추천) 표시.
//   /interim showTarget=false — 도입부 다섯 사건은 중립 탐침이라 목표 곡선이 없다. 대신 사건 눈금(S1~S5)을 찍는다.
//
// monitor 객체 모양(페이지가 250ms/200ms 틱마다 만든다):
//   { track, theta:{g,L,tau,rho,confidence,nResp}, xhat, target?, tol?, ceiling?, series:[{t,tension,fromStim?}], scene?:bool(판정 뒤 장면 구간, B149),
//     (track = "H"|"R"|"C" 또는 판정 전 배합 {R,H,C} — 점선은 배합 가중 기대 곡선, 머리글은 "잠정 R44 H34 C21", B92)
//     nStim, sel?:{track,reach}, decided?:bool(track 이 판정된 트랙인가 — /interim 은 판정 전 선두 장르를 track 에 주므로 false, B154), control?:bool, micro?:number, note?,
//     next?:{kind:"probe"|"slot"|"micro"|"done", slotId, variantId?, dose?, reason, count?, max?}   ← lib/slotController nextAdvice
//     actuate?:{u,mode,offsets,base?}, ← /film 연속 액추에이터(lib/controlActuate.js)의 현재 구동량·오프셋. base = 오프셋을 얹기 전 값(B116)
//     slots?:{frog?:{variantId,dose,actuation:{volume,plays}}, cat?:{…}} }   ← /film 슬롯 변형 확정값(lib/slotActuate.js, B78). variantId null = 고정 연출
//
// 줄바꿈(B65): 패널은 word-break: keep-all 이라 한글 단어 안에서 끊기지 않고, 라벨과 숫자 사이는 lib/monitorText glueNumbers 로
// 줄바꿈 없는 공백을 넣어 "회복 / 0.848s"·"응 / 답 7/7" 처럼 갈리지 않는다. 줄은 " · " 구분자에서만 접힌다.

import { curveAt, trackLabel } from "@/lib/tensionCurve";
import { actuationText } from "@/lib/controlActuate";
import { observedSegments, xhatReading, xhatScopeNote } from "@/lib/tensionEstimate";
import { glueNumbers, reachText } from "@/lib/monitorText";

// 작은 그래프 — 작가 목표 곡선(점선)과 관객 긴장 추정 x̂(실선), 현재 시각 표시, 사건 눈금.
// x̂ 는 사건 반응이 있는 구간만 진한 실선, 사건 사이(바닥 긴장 + 잔움직임뿐)는 흐린 가는 선(B149) — 사건 사이가 목표 아래에
// 붙어 있는 것은 추종 실패가 아니라 측정 밖이다. fromStim 이 없는 계열은 전부 진한 선(lib/tensionEstimate isObserved).
export function MonitorChart({ series = [], track = "H", tNow = 0, ceiling = 1, tMax: tMaxProp = 180, showTarget = true, marks = [], width = 292, height = 60 }) {
  const W = width, H = height, PAD = 4; // 기본 292×60 은 모니터 패널 폭. /interim 종료 카드는 더 넓게 그린다(B14a)
  const tMax = Math.max(tMaxProp, tNow, series.length ? series[series.length - 1].t : 0);
  const x = (t) => PAD + (t / tMax) * (W - PAD * 2);
  const y = (v) => H - PAD - v * (H - PAD * 2);
  const target = [];
  if (showTarget && track) {
    for (let t = 0; t <= tMax; t += 6) target.push(`${t === 0 ? "M" : "L"}${x(t).toFixed(1)},${y(curveAt(track, t).target).toFixed(1)}`);
  }
  const segs = observedSegments(series).map((g) => ({ observed: g.observed, d: g.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.tension).toFixed(1)}`).join(" ") }));
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
      {segs.map((g, i) => <path key={i} d={g.d} fill="none" stroke={g.observed ? "#7fd1ff" : "rgba(127,209,255,0.38)"} strokeWidth={g.observed ? 2 : 1.2} />)}
      <line x1={x(tNow)} x2={x(tNow)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.3)" />
    </svg>
  );
}

const fmt2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "-");
const sgn = (v, d = 2) => (v > 0 ? "+" : "") + v.toFixed(d);
const ACT_MODE = { arouse: "각성", relax: "이완", hold: "유지", settle: "자극 뒤 멈춤", off: "대기" };

// 연속 액추에이터 한 줄 — 0 이 아닌 축만. 페이지가 a.base(오프셋을 얹기 전 deriveParams 값)를 주면 실제로 움직인 양을,
// 이미 끝까지 밀린 축은 "포화" 로 적는다(B116 — 공포 트랙 가로등은 lampEarlyOn 이 1.0 으로 켜 둬서 +0.60 이 하나도 안 먹는다).
function actuateText(a) {
  return actuationText(a.offsets, a.base);
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

// "다음" 줄의 머리 — 중립 탐침이면 변형 없음(B85), 제어 슬롯은 결정 전 "지금 정하면" 미리보기(B106)·결정 뒤 확정 변형·용량, 고정 슬롯이 끝났으면 미세 자극 차례(B66), 장면 뒤면 없음
function nextHeadline(next, eventLabel) {
  const label = eventLabel[next.slotId] || next.slotId;
  if (next.kind === "done") return <span style={{ opacity: 0.6 }}>다음 개입 없음</span>;
  if (next.kind === "probe") return <span>다음 <b>{label}</b> · <span style={{ opacity: 0.75 }}>중립 탐침(변형 없음)</span></span>;
  if (next.kind === "micro") {
    return <span>다음 미세 자극 <b>{label}</b> {next.count ?? 0}/{next.max ?? 3}{next.dose != null && <> → <b>{next.variantId}</b> (용량&nbsp;{next.dose})</>}</span>;
  }
  // 결정 전 제어 슬롯(B106) — 계획이 아니라 지금 x̂·θ̂ 으로 고른 값이라 "지금 정하면" 을 붙인다. 결정되면 확정 줄로 바뀐다
  if (next.preview) return <span>다음 <b>{label}</b> → <span style={{ opacity: 0.75 }}>지금 정하면</span> <b>{next.variantId}</b> (용량&nbsp;{next.dose})</span>;
  return <span>다음 <b>{label}</b> → <b>{next.variantId}</b> (용량&nbsp;{next.dose})</span>;
}

export default function DirectorMonitor({ monitor, tNow = 0, tMax = 180, showTarget = true, marks = [], eventLabel = {}, title = "디렉터 모니터" }) {
  if (!monitor) return null;
  const { theta } = monitor;
  const hasTarget = showTarget && Number.isFinite(monitor.target);
  // 사건 사이의 x̂ 는 목표와 견주지 않는다(B149) — 회색 + "사건 사이". 사건 반응이 있을 때만 위(주황)·아래(초록)·안(흰)으로 칠한다
  const last = monitor.series?.length ? monitor.series[monitor.series.length - 1] : null;
  const reading = xhatReading(last ?? (Number.isFinite(monitor.xhat) ? { tension: monitor.xhat } : null), hasTarget ? { target: monitor.target, tol: monitor.tol } : {});
  const XHAT_COLOR = { above: "#e0a86a", below: "#8fae95", in: "#cfe", between: "rgba(230,233,240,0.55)" };
  const xhatColor = XHAT_COLOR[reading.state] || "#7fd1ff";
  const scopeNote = showTarget ? xhatScopeNote({ scene: !!monitor.scene, control: !!monitor.control }) : null;
  return (
    <div style={{ position: "fixed", top: 12, left: 12, zIndex: 40, width: 320, padding: "12px 14px", borderRadius: 10, background: "rgba(12,14,20,0.82)", color: "#e6e9f0", font: "12px/1.5 ui-monospace, monospace", border: "1px solid rgba(255,255,255,0.12)", wordBreak: "keep-all" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <b>{title}</b><span style={{ opacity: 0.6 }}>트랙 {trackLabel(monitor.track)} · 자극 {monitor.nStim}</span>
      </div>
      <MonitorChart series={monitor.series} track={monitor.track || "H"} tNow={tNow} ceiling={monitor.ceiling ?? 1} tMax={tMax} showTarget={showTarget} marks={marks} />
      <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0" }}>
        {/* "지금 목표" — 현재 시각의 곡선값. "다음" 줄의 "슬롯 시각 목표" 는 슬롯 시각(예: 고양이 0:45+RISE)의 곡선값이라 값이 다르다(B109) */}
        {hasTarget ? <span>지금 목표 <b>{fmt2(monitor.target)}</b></span> : <span style={{ opacity: 0.6 }}>목표 곡선 없음(중립 탐침)</span>}
        <span>추정 x̂ <b style={{ color: xhatColor }}>{fmt2(monitor.xhat)}</b>{reading.label && <span style={{ opacity: 0.6 }}> · {reading.label}</span>}</span>
      </div>
      {scopeNote && <div style={{ opacity: 0.6, fontSize: 11, marginTop: -4, marginBottom: 4, wordBreak: "keep-all" }}>{scopeNote}</div>}
      {theta && (
        <div style={{ opacity: 0.85 }}>관객모델 θ̂: {glueNumbers(`이득 ${theta.g} · 지연 ${theta.L}s · 회복 ${theta.tau}s · 습관화 ${theta.rho}`)} <span style={{ opacity: 0.5 }}>({glueNumbers(`모델 신뢰도 ${Math.round((theta.confidence || 0) * 100)}% · 응답 ${theta.nResp}/${theta.n}`)})</span></div>
      )}
      {/* 도달 점수(B154) — 점수 최고 트랙은 참고값이고 판정 트랙을 바꾸지 않는다. 화살표 대신 "최고 H(참고 · 현재 R 유지)" */}
      {monitor.sel && <div style={{ opacity: 0.85 }}>{glueNumbers(reachText(monitor.sel, monitor.decided === false ? null : monitor.track))}</div>}
      {monitor.control != null && (
        <div style={{ opacity: 0.85 }}>실제 제어: {monitor.control ? <b style={{ color: "#7fd1ff" }}>ON · 미세 자극 {monitor.micro ?? 0}/3</b> : <span style={{ opacity: 0.6 }}>OFF (advisory)</span>}</div>
      )}
      {monitor.control && monitor.actuate && (
        <div style={{ opacity: 0.85, fontSize: 11 }}>연속 구동 <b>{ACT_MODE[monitor.actuate.mode] || monitor.actuate.mode}{monitor.actuate.mode === "settle" && Number.isFinite(monitor.actuate.settleLeft) ? ` ${monitor.actuate.settleLeft.toFixed(1)}s` : ""}</b> {glueNumbers(`u ${sgn(monitor.actuate.u || 0)} · ${actuateText(monitor.actuate)}`)}</div>
      )}
      {monitor.slots && slotsText(monitor.slots, eventLabel) && (
        <div style={{ opacity: 0.85, fontSize: 11 }}>슬롯 변형 {glueNumbers(slotsText(monitor.slots, eventLabel))}</div>
      )}
      {monitor.note && <div style={{ opacity: 0.7 }}>{monitor.note}</div>}
      {monitor.next && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          {nextHeadline(monitor.next, eventLabel)}
          <div style={{ opacity: 0.7, fontSize: 11 }}>{glueNumbers(monitor.next.reason)}</div>
        </div>
      )}
    </div>
  );
}
