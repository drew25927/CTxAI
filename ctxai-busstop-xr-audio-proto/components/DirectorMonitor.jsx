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
//     (track = "H"|"R"|"C" 또는 판정 전 배합 {R,H,C} — 점선은 배합 가중 기대 곡선, 머리글은 "잠정 R44 H34 C21", B92 · /interim 판정 전 선두 장르는 decided:false 라 "트랙 잠정 R", B143)
//     nStim, sel?:{track,reach}, decided?:bool(track 이 판정된 트랙인가 — /interim 은 판정 전 선두 장르를 track 에 주므로 false, B154), control?:bool, micro?:number, note?,
//     active?:string[]  ← 진행 중(레코드가 아직 닫히지 않은) 사건 이름(B153·B159). 계열은 그 잠정 레코드를 더해 그린 값이라 마지막 점이 잠정이면
//                         "추정 x̂" 에 "잠정", 반응 몫 없이 사건만 진행 중이면 "사건 사이" 대신 "<사건> 진행 중". 잠정 구간은 그래프에 점선.
//     next?:{kind:"probe"|"slot"|"micro"|"done", slotId, variantId?, dose?, reason, count?, max?}   ← lib/slotController nextAdvice
//     actuate?:{u,mode,offsets,base?}, ← /film 연속 액추에이터(lib/controlActuate.js)의 현재 구동량·오프셋. base = 오프셋을 얹기 전 값(B116)
//     slots?:{frog?:{variantId,dose,actuation:{volume,plays}}, cat?:{…}} }   ← /film 슬롯 변형 확정값(lib/slotActuate.js, B78). variantId null = 고정 연출
//
// 줄바꿈(B65): 패널은 word-break: keep-all 이라 한글 단어 안에서 끊기지 않고, 라벨과 숫자 사이는 lib/monitorText glueNumbers 로
// 줄바꿈 없는 공백을 넣어 "회복 / 0.848s"·"응 / 답 7/7" 처럼 갈리지 않는다. 줄은 " · " 구분자에서만 접힌다.

import { curveAt } from "@/lib/tensionCurve";
import { observedSegments, xhatReading, xhatScopeNote, isProvisional } from "@/lib/tensionEstimate";
import { actuateLine, glueNumbers, goalRowText, reachText, recentPeakText, stimCountText, trackHeadText } from "@/lib/monitorText";
import { stimulusLabel, RESPONSE_BASIS } from "@/lib/viewerText";

export const MOMENT_COLOR = { peak: "#ffffff", calm: "rgba(143,214,143,0.85)" }; // 종료 카드 범례와 같은 색(B144)

// 작은 그래프 — 작가 목표 곡선(점선)과 관객 긴장 추정 x̂(실선), 현재 시각 표시, 사건 눈금.
// x̂ 는 사건 반응이 있는 구간만 진한 실선, 사건 사이(바닥 긴장 + 잔움직임뿐)는 흐린 가는 선(B149) — 사건 사이가 목표 아래에
// 붙어 있는 것은 추종 실패가 아니라 측정 밖이다. fromStim 이 없는 계열은 전부 진한 선(lib/tensionEstimate isObserved).
// moments(B144, 종료 카드용) — {peak:{t,tension}, calm:{t0,t1}}: 가장 크게 반응한 순간(x̂ 최고)은 흰 점, 가장 차분히 집중한 순간(집중도 최고 2초)은
// 바닥 띠. 두 순간은 다른 것을 재서 거의 늘 다른 때라, 곡선 위에 따로 찍어 "집중한 순간이 왜 봉우리가 아니냐" 를 그림으로 답한다.
export function MonitorChart({ series = [], track = "H", tNow = 0, ceiling = 1, tMax: tMaxProp = 180, showTarget = true, marks = [], width = 292, height = 60, moments = null }) {
  const W = width, H = height, PAD = 4; // 기본 292×60 은 모니터 패널 폭. /interim 종료 카드는 더 넓게 그린다(B14a)
  const tMax = Math.max(tMaxProp, tNow, series.length ? series[series.length - 1].t : 0);
  const x = (t) => PAD + (t / tMax) * (W - PAD * 2);
  const y = (v) => H - PAD - v * (H - PAD * 2);
  const target = [];
  if (showTarget && track) {
    for (let t = 0; t <= tMax; t += 6) target.push(`${t === 0 ? "M" : "L"}${x(t).toFixed(1)},${y(curveAt(track, t).target).toFixed(1)}`);
  }
  const segs = observedSegments(series).map((g) => ({ observed: g.observed, d: g.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.tension).toFixed(1)}`).join(" ") }));
  // 잠정 구간(B153) — 진행 중 자극의 잠정 레코드에 기댄 점은 흰 점선을 덧그린다(레코드가 닫히면 실선으로 굳는다). 앞 점 하나를 붙여 선이 이어진다
  const prov = [];
  series.forEach((p, i) => { if (isProvisional(p)) { const a = i > 0 ? series[i - 1] : p; prov.push(`M${x(a.t).toFixed(1)},${y(a.tension).toFixed(1)} L${x(p.t).toFixed(1)},${y(p.tension).toFixed(1)}`); } });
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
      {moments?.calm && (
        <rect x={x(moments.calm.t0)} y={H - PAD - 5} width={Math.max(3, x(moments.calm.t1) - x(moments.calm.t0))} height={5} rx={1.5} fill={MOMENT_COLOR.calm} />
      )}
      {segs.map((g, i) => <path key={i} d={g.d} fill="none" stroke={g.observed ? "#7fd1ff" : "rgba(127,209,255,0.38)"} strokeWidth={g.observed ? 2 : 1.2} />)}
      {prov.length > 0 && <path d={prov.join(" ")} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeDasharray="3 2" />}
      {moments?.peak && <circle cx={x(moments.peak.t)} cy={y(moments.peak.tension)} r={3.5} fill={MOMENT_COLOR.peak} stroke="#0b0f14" strokeWidth={1} />}
      <line x1={x(tNow)} x2={x(tNow)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.3)" />
    </svg>
  );
}

const fmt2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "-");

// 연속 액추에이터 한 줄은 lib/monitorText actuateLine — 0 이 아닌 축만. 페이지가 a.base(오프셋을 얹기 전 deriveParams 값)를 주면
// 실제로 움직인 양을, 이미 끝까지 밀린 축은 "포화" 로 적는다(B116 — 공포 트랙 가로등은 lampEarlyOn 이 1.0 으로 켜 둔다).
// 장면이 끝난 뒤(2:30~)는 "유지 u 0.00" 이 아니라 "장면 끝"(B135).

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
// 미세 자극은 "몇 번째가 다음인가" 를 적는다(B161) — 예전 "다음 미세 자극 먼 문 1/3" 의 1 은 이미 울린 횟수라 "다음 것이 첫 번째" 로 읽혔고,
// 예산을 다 쓴 뒤에도 "다음 미세 자극 먼 문 3/3" 으로 없는 "다음" 을 적었다. 울린 횟수는 머리 줄 "실제 제어: ON · 미세 자극 N/3" 에 있다.
function nextHeadline(next, eventLabel) {
  const label = eventLabel[next.slotId] || next.slotId;
  if (next.kind === "done") return <span style={{ opacity: 0.6 }}>다음 개입 없음</span>;
  if (next.kind === "probe") return <span>다음 <b>{label}</b> · <span style={{ opacity: 0.75 }}>중립 탐침(변형 없음)</span></span>;
  if (next.kind === "micro") {
    if (next.spent) return <span style={{ opacity: 0.6 }}>미세 자극 예산 소진({next.count ?? 0}/{next.max ?? 3})</span>;
    return <span>다음 미세 자극({(next.count ?? 0) + 1}번째) <b>{label}</b>{next.dose != null && <> → <b>{next.variantId}</b> (용량&nbsp;{next.dose})</>}</span>;
  }
  // 결정 전 제어 슬롯(B106) — 계획이 아니라 지금 x̂·θ̂ 으로 고른 값이라 "지금 정하면" 을 붙인다. 결정되면 확정 줄로 바뀐다
  if (next.preview) return <span>다음 <b>{label}</b> → <span style={{ opacity: 0.75 }}>지금 정하면</span> <b>{next.variantId}</b> (용량&nbsp;{next.dose})</span>;
  return <span>다음 <b>{label}</b> → <b>{next.variantId}</b> (용량&nbsp;{next.dose})</span>;
}

export default function DirectorMonitor({ monitor, tNow = 0, tMax = 180, showTarget = true, marks = [], eventLabel = {}, title = "디렉터 모니터" }) {
  if (!monitor) return null;
  const { theta } = monitor;
  const hasTarget = showTarget && Number.isFinite(monitor.target);
  // 사건 사이의 x̂ 는 목표와 견주지 않는다(B149) — 회색 + "사건 사이". 사건 반응이 있을 때만 위(주황)·아래(초록)·안(흰)으로 칠한다.
  // 진행 중 사건(B153·B159)은 이름표로 "<사건> 진행 중", 잠정 반응이면 "잠정" — 이름표는 페이지의 eventLabel(없으면 원래 이름)
  const last = monitor.series?.length ? monitor.series[monitor.series.length - 1] : null;
  const activeLabels = (monitor.active || []).map((n) => eventLabel[n] || stimulusLabel(n)); // micro-1 → "먼 문 소리"(viewerText 와 같은 표), 그 밖은 원래 이름
  const reading = xhatReading(last ?? (Number.isFinite(monitor.xhat) ? { tension: monitor.xhat } : null), { ...(hasTarget ? { target: monitor.target, tol: monitor.tol } : {}), active: activeLabels });
  // 행의 두 문구(B227) — 목표 곡선이 없는데 탐침이 진행 중이면 왼쪽 "중립 탐침 S1 진행 중" · 오른쪽은 값(과 "잠정")만. 함께 적으면 한 줄을 넘었다
  const row = goalRowText({ hasTarget, active: activeLabels, reading });
  const stimCount = stimCountText(monitor.nStim, activeLabels.length);
  // 머리글의 트랙 조각(B143) — /interim 판정 전 선두 장르는 "트랙 잠정 R"(decided false) · 선두 없음 "트랙 판정 전" · /film 판정 전 배합은 "트랙 잠정 H72 R19 C10"(B92) · 판정 뒤 "트랙 H"
  const head = trackHeadText(monitor.track, { decided: monitor.decided });
  const XHAT_COLOR = { above: "#e0a86a", below: "#8fae95", in: "#cfe", between: "rgba(230,233,240,0.55)" };
  const xhatColor = XHAT_COLOR[reading.state] || "#7fd1ff";
  const scopeNote = showTarget ? xhatScopeNote({ scene: !!monitor.scene, control: !!monitor.control }) : null;
  return (
    <div style={{ position: "fixed", top: 12, left: 12, zIndex: 40, width: 320, padding: "12px 14px", borderRadius: 10, background: "rgba(12,14,20,0.82)", color: "#e6e9f0", font: "12px/1.5 ui-monospace, monospace", border: "1px solid rgba(255,255,255,0.12)", wordBreak: "keep-all" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        {/* 자극 수는 닫힌 레코드 + 진행 중(B244 · "자극 0+1" · 풀이는 툴팁) — 긴 형식은 /interim 제목·/film 판정 전 트랙 라벨과 한 줄에 못 든다(monitorText.stimCountText) */}
        <b>{title}</b><span style={{ opacity: 0.6 }}><span title={head.title}>{head.text}</span> · <span title={stimCount.title}>{stimCount.text}</span></span>
      </div>
      <MonitorChart series={monitor.series} track={monitor.track || "H"} tNow={tNow} ceiling={monitor.ceiling ?? 1} tMax={tMax} showTarget={showTarget} marks={marks} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "6px 0" }}>
        {/* "지금 목표" — 현재 시각의 곡선값. "다음" 줄의 "슬롯 시각 목표" 는 슬롯 시각(예: 고양이 0:45+RISE)의 곡선값이라 값이 다르다(B109) */}
        {/* 목표 없는 구간의 왼쪽 문구는 lib/monitorText goalRowText — "목표 곡선 없음(중립 탐침)"(NBSP·WORD JOINER · B217) 또는 탐침 진행 중이면 "중립 탐침 S1 진행 중"(B227 · 오른쪽에서 같은 말을 뺀다) */}
        {hasTarget ? <span>지금 목표 <b>{fmt2(monitor.target)}</b></span> : <span style={{ opacity: 0.6 }}>{row.left}</span>}
        {/* 오른쪽 라벨이 길면 " · " 에서 두 줄이 된다 — 둘째 줄도 오른쪽에 붙이고(textAlign) 왼쪽 라벨과 사이(gap 8)를 둔다(B217). 1배속 표본에서 이 행은 18px 한 줄이어야 한다(B227) */}
        <span style={{ textAlign: "right" }}>추정 x̂ <b style={{ color: xhatColor }}>{fmt2(monitor.xhat)}</b>{row.right && <span style={{ opacity: 0.6 }}> · {row.right}</span>}</span>
      </div>
      {/* 최근 봉우리 잔상(B216) — 회복이 빠른 관객의 봉우리는 x̂ 숫자에 한 창(2초)만 머문다. 봉우리 뒤 6초 동안 값·사건·경과를 남긴다.
          마지막 점이 아직 오르는 중(rising)이면 봉우리가 아니라 현재값이므로 "x̂ 오르는 중 0.22 · 물보라" 로 적는다(B235 · monitorText.recentPeakText) */}
      {monitor.recent && (() => {
        const rc = monitor.recent;
        const rp = recentPeakText(rc, rc.name ? (eventLabel[rc.name] || stimulusLabel(rc.name)) : null);
        return rp && <div style={{ opacity: 0.7, fontSize: 11, marginTop: -4, marginBottom: 4, wordBreak: "keep-all" }}>{rp.label} <b>{rp.value}</b>{rp.tail}</div>;
      })()}
      {scopeNote && <div style={{ opacity: 0.6, fontSize: 11, marginTop: -4, marginBottom: 4, wordBreak: "keep-all" }}>{scopeNote}</div>}
      {theta && (
        <div style={{ opacity: 0.85 }}>관객모델 θ̂: {glueNumbers(`이득 ${theta.g} · 지연 ${theta.L}s · 회복 ${theta.tau}s · 습관화 ${theta.rho}`)} <span style={{ opacity: 0.5 }}>({glueNumbers(`모델 신뢰도 ${Math.round((theta.confidence || 0) * 100)}% · `)}{/* "응답" 의 정의는 툴팁으로 — HUD 사건 표의 "안 봄" 과 모순으로 읽혔다(B102) */}<span title={RESPONSE_BASIS}>{glueNumbers(`응답 ${theta.nResp}/${theta.n}`)}</span>)</span></div>
      )}
      {/* 도달 점수(B154) — 점수 최고 트랙은 참고값이고 판정 트랙을 바꾸지 않는다. 화살표 대신 "최고 H(참고 · 현재 R 유지)" */}
      {monitor.sel && <div style={{ opacity: 0.85 }}>{glueNumbers(reachText(monitor.sel, monitor.decided === false ? null : monitor.track))}</div>}
      {monitor.control != null && (
        <div style={{ opacity: 0.85 }}>실제 제어: {monitor.control ? <b style={{ color: "#7fd1ff" }}>ON · 미세 자극 {monitor.micro ?? 0}/3</b> : <span style={{ opacity: 0.6 }}>OFF (고정 연출)</span>}</div>
      )}
      {monitor.control && monitor.actuate && (() => {
        const line = actuateLine(monitor.actuate);
        return <div style={{ opacity: monitor.actuate.mode === "ended" ? 0.6 : 0.85, fontSize: 11 }}>연속 구동 <b>{line.head}</b> {line.body}</div>;
      })()}
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
