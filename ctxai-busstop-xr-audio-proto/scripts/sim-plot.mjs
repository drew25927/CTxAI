// 제어 OFF/ON 긴장 궤적 그래프 — 심사·학회용 증거물(B20). lib/tensionSim.js 로 합성 관객을 돌려 SVG 를 그리고,
// 크롬이 있으면 PNG 도 만든다. 의존성 없음(node 만).
//
//   node scripts/sim-plot.mjs [outDir] [--cloud N] [--stats N] [--b55 session.json ...] [--no-png] [--scale 2]
//
// 산출물(outDir 기본 data/sim/):
//   sim-onoff.{svg,png}            트랙 H/R/C × (OFF · ON 슬롯 고정(B78 이전) · ON 설계 전체 = /film 현재) — 관객 3유형 + 무작위 N명
//                                  + 수치 요약에 현실 조건(B87: 결정 때 닫힌 레코드만 · DECIDE_AT · /film 탐침 용량) 행
//   sim-b77-continuous.{svg,png}   연속 채널의 되먹임(B77) — 참 효과 가정 × x̂ 모델 항 유무
//   sim-b75-two-hands.{svg,png}    미세 자극 vs 연속 손의 충돌(B75) — 그대로 vs 자극 뒤 hold
//   sim-b55-theta-scale.{svg,png}  (--b55) 실측 세션의 θ̂ 회귀에서 track 레코드 척도 차이(B55)
//   sim-summary.{txt,json}         수치 요약
//
// 그림의 관객은 모델이 만든 관객이다. 상한 증거가 아니라 제어기·모델·곡선이 맞물리는 방향의 근거다.

import fs from "node:fs";
import path from "node:path";
import { simulateViewer, summarize, summarizeAtPeaks, ARCHETYPES, rng, randomViewer, SIM_PARAMS } from "../lib/tensionSim.js";
import { fitViewerModel, responseMagnitude } from "../lib/viewerModel.js";
import { runController } from "../lib/slotController.js";
import { ACTUATE_PARAMS } from "../lib/controlActuate.js";
import { TENSION_PARAMS } from "../lib/tensionEstimate.js";
import { SLOTS } from "../lib/tensionCurve.js";
import { Svg, Panel, legend, toPng, findChrome } from "./svgplot.mjs";

// ---- 인자 ----
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const outDir = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--"))) || "data/sim";
const N_CLOUD = parseInt(flag("--cloud", "24"), 10);
const N_STATS = parseInt(flag("--stats", "200"), 10);
const SCALE = parseFloat(flag("--scale", "2"));
const NO_PNG = argv.includes("--no-png");
const b55Files = (() => { const i = argv.indexOf("--b55"); if (i < 0) return []; const out = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith("--"); j++) out.push(argv[j]); return out; })();
fs.mkdirSync(outDir, { recursive: true });

const COLORS = { sensitive: "#d64545", typical: "#2f6fd6", blunt: "#2e9e5b", measured: "#8e44ad", cloud: "#9aa0a6", target: "#111", band: "#e4e4e4", ceiling: "#c0392b", slot: "#8a8a8a", verdict: "#444" };
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const pct = (a, b) => { if (!(b > 0)) return "–"; const v = Math.round(Math.abs(1 - a / b) * 100); return `${v === 0 ? "±" : a < b ? "−" : "+"}${v}%`; };
const SLOT_LABEL = { poster: "포스터", figure: "인물", truck: "트럭", frog: "개구리", cat: "고양이" };
const fixedSlots = SLOTS.filter((s) => s.t != null);
const summary = { generatedAt: new Date().toISOString(), params: SIM_PARAMS, archetypes: ARCHETYPES, onoff: {}, b77: {}, b75: {}, b55: [] };
const lines = [];
const say = (s = "") => { lines.push(s); console.log(s); };

// ---- 공통: 한 트랙·한 모드의 관객 묶음 ----
function cloudRuns(track, mode, N, opts) { const r = rng(42); const runs = []; for (let v = 0; v < N; v++) runs.push(simulateViewer({ track, theta: randomViewer(r), mode, opts })); return runs; }
function archRuns(track, mode, opts) { return Object.fromEntries(Object.keys(ARCHETYPES).map((k) => [k, simulateViewer({ track, theta: ARCHETYPES[k], mode, opts })])); }

/** 긴장 패널 + 구동량 띠 + 아래 주석 한 벌. 주석은 그래프 밖(띠 아래)에 둔다. */
function drawTension(svg, { x, y, w, h, hu, xd, title, run0, cloud = [], arch = {}, showXhat = false, viewers = null, xTicks, note = [], ud = [-1, 1], uTicks = [-1, 0, 1] }) {
  const p = new Panel(svg, { x, y, w, h, xd, yd: [0, 1], title, xTicks, yTicks: [0, 0.25, 0.5, 0.75, 1], xFmt: mmss, yFmt: (v) => v.toFixed(2), yLabel: "긴장 x (0~1)" }).frame();
  p.band(run0.t, run0.target.map((v, i) => v - run0.tol[i]), run0.target.map((v, i) => v + run0.tol[i]), { fill: COLORS.band });
  p.hline(run0.ceiling, { color: COLORS.ceiling, dash: "4 3", width: 1 }, `상한 ${run0.ceiling}`);
  fixedSlots.forEach((s, i) => p.vline(s.t, { color: COLORS.slot, dash: "2 3", width: 1 }, SLOT_LABEL[s.id], { color: "#666", y: p.top + 11 + (i % 2) * 11 }));
  p.vline(SIM_PARAMS.VERDICT_T, { color: COLORS.verdict, dash: "5 3", width: 1.2 }, `판정·착석 ${mmss(SIM_PARAMS.VERDICT_T)}`);
  p.vline(SIM_PARAMS.SCENE_END, { color: COLORS.verdict, dash: "5 3", width: 1.2 }, `장면 끝 ${mmss(SIM_PARAMS.SCENE_END)}`);
  const every2 = (arr) => arr.filter((_, i) => i % 2 === 0);
  for (const r of cloud) p.series(every2(r.t), every2(r.x), { color: COLORS.cloud, width: 1, opacity: 0.45 });
  p.series(run0.t, run0.target, { color: COLORS.target, width: 1.8 });
  const vs = viewers || Object.entries(arch).map(([k, r]) => ({ key: k, run: r, color: COLORS[k] }));
  for (const v of vs) {
    p.series(v.run.t, v.run.x, { color: v.color, width: 2.2 });
    if (showXhat) p.series(v.run.t, v.run.xhat, { color: v.color, width: 1.6, dash: "6 3", opacity: 0.9 });
    for (const m of v.run.micro) { const i = Math.round((m.t + TENSION_PARAMS.RISE_SEC) / SIM_PARAMS.DT); p.marker(m.t, v.run.x[i] + 0.035, "tri", 5, { fill: v.color }); }
  }
  const u = new Panel(svg, { x, y: y + h, w, h: hu, xd, yd: ud, xTicks, yTicks: uTicks, xFmt: mmss, yFmt: (v) => (v > 0 ? `+${v}` : String(v)), yLabel: "구동량 u", xLabel: "영화 시간" }).frame();
  u.hline(0, { color: "#bbb", width: 1 });
  u.vline(SIM_PARAMS.VERDICT_T, { color: COLORS.verdict, dash: "5 3", width: 1 }); u.vline(SIM_PARAMS.SCENE_END, { color: COLORS.verdict, dash: "5 3", width: 1 });
  for (const v of vs) {
    u.series(v.run.t, v.run.u, { color: v.color, width: 1.8 });
    // 이완(relax) 틱 표시 — 두 손이 맞서는 순간
    v.run.mode.forEach((m, i) => { if (m === "relax") u.marker(v.run.t[i], v.run.u[i], "dot", 2.6, { fill: v.color, stroke: "#fff", width: 0.8 }); });
  }
  note.forEach((l, i) => svg.text(p.left, y + h + hu + 12 + i * 14, l, { size: 10.5, color: "#333" }));
  return { p, u };
}

// =====================================================================
// 그림 1 — 제어 OFF/ON 궤적 (H/R/C × OFF·film·full)
// =====================================================================
function figOnOff() {
  const MODES = [
    { key: "off", title: "제어 OFF — 고정 연출(모든 슬롯 가운데 변형, 판정 뒤 자극 없음)" },
    { key: "film", title: "제어 ON · 슬롯 고정(B78 이전 /film) — 중립 탐침 5개, 판정 뒤 미세 자극(≤3회) + 연속 채널" },
    { key: "full", title: "제어 ON · 설계 전체 = /film 현재 — 탐침 3개 뒤 슬롯 변형을 θ̂ 로 선택 + 판정 뒤 두 손" },
  ];
  const W = 1860, PW = 600, PH = 300, UH = 74, ROW = PH + UH + 76, TOP = 92;
  const svg = new Svg(W, TOP + 3 * ROW + 10);
  svg.text(20, 30, "제어 OFF/ON 긴장 궤적 시뮬레이션 — 관객 3유형 + 무작위 24명, 트랙 H(공포)·R(로맨스)·C(블랙코미디)", { size: 20, weight: "bold" });
  svg.text(20, 52, `합성 관객 θ = (이득 g, 지연 L, 회복 τ, 습관화 ρ) · 참 긴장 = 이산 자극 응답의 지수 감쇠 합(tensionEstimate 와 같은 커널, x̂ = x) · 연속 채널(침묵·안개·거리)이 긴장에 미치는 효과는 미검증이라 0 으로 둠(B77 그림 참조) · 값은 창작·잠정치 — 실제 관객 증거가 아님`, { size: 11.5, color: "#444" });
  legend(svg, 20, 76, [
    { label: `민감형 g${ARCHETYPES.sensitive.g} τ${ARCHETYPES.sensitive.tau}s ρ${ARCHETYPES.sensitive.rho}`, color: COLORS.sensitive },
    { label: `보통형 g${ARCHETYPES.typical.g} τ${ARCHETYPES.typical.tau}s ρ${ARCHETYPES.typical.rho}`, color: COLORS.typical },
    { label: `둔감형 g${ARCHETYPES.blunt.g} τ${ARCHETYPES.blunt.tau}s ρ${ARCHETYPES.blunt.rho}`, color: COLORS.blunt },
    { label: `무작위 ${N_CLOUD}명(g 0.3~1.3 · τ 1~4s · ρ 0~0.45, seed 42)`, color: COLORS.cloud, width: 1 },
    { label: "작가 목표 곡선", color: COLORS.target }, { label: "허용폭 ±tol", color: COLORS.band, kind: "band" },
    { label: "트랙 상한", color: COLORS.ceiling, dash: "4 3", width: 1 }, { label: "미세 자극 발동", color: "#555", kind: "tri" },
    { label: "구동량 u 의 이완(relax) 틱", color: "#555", kind: "dot" },
  ]);
  const xd = [0, SIM_PARAMS.T_END], xTicks = [0, 30, 60, 90, 120, 150, 180];
  const tracks = [["H", "공포"], ["R", "로맨스"], ["C", "블랙코미디"]];
  say("== 그림 1 sim-onoff — 슬롯 봉우리(변형이 둘 이상인 슬롯의 봉우리, sim-trajectory 와 같은 정의) · 장면 1:08~2:30 격자(1초) · 전 구간 0~2:30");
  say(`   관객: 무작위 ${N_STATS}명(seed 42) — 그림의 ${N_CLOUD}명은 그 앞부분`);
  for (let r = 0; r < tracks.length; r++) {
    const [track, name] = tracks[r];
    const stat = {};
    for (const m of MODES) {
      const runs = cloudRuns(track, m.key, N_STATS);
      stat[m.key] = { peaks: summarizeAtPeaks(runs), scene: summarize(runs, { t0: SIM_PARAMS.VERDICT_T, t1: SIM_PARAMS.SCENE_END }), all: summarize(runs, { t0: 0, t1: SIM_PARAMS.SCENE_END }), microAvg: runs.reduce((a, x) => a + x.micro.length, 0) / runs.length, uEndAvg: runs.reduce((a, x) => a + x.u[Math.round(SIM_PARAMS.SCENE_END / SIM_PARAMS.DT)], 0) / runs.length };
    }
    // 현실 조건(B87) — OFF 도 같은 탐침 용량으로 돌려 짝을 맞춘다. 그림에는 그리지 않고 수치만(아래 full 칸 주석 · 요약).
    const real = {};
    for (const k of ["off", "full"]) {
      const runs = cloudRuns(track, k, N_STATS, { realistic: true });
      real[k] = { peaks: summarizeAtPeaks(runs), scene: summarize(runs, { t0: SIM_PARAMS.VERDICT_T, t1: SIM_PARAMS.SCENE_END }), nFit: k === "full" ? runs[0].plan.filter((p) => p.nFit != null).map((p) => `${SLOT_LABEL[p.slotId]} ${p.nFit}개`).join(" · ") : null };
    }
    stat.realistic = real;
    summary.onoff[track] = stat;
    say(`-- 트랙 ${track}(${name})`);
    for (const m of MODES) {
      const s = stat[m.key], o = stat.off;
      const d = m.key === "off" ? "" : ` | OFF 대비 봉우리 std ${pct(s.peaks.meanStd, o.peaks.meanStd)} · RMSE ${pct(s.peaks.rmse, o.peaks.rmse)} / 장면 RMSE ${pct(s.scene.rmse, o.scene.rmse)}`;
      say(`   ${m.key.padEnd(4)} 봉우리 std ${s.peaks.meanStd.toFixed(3)} · RMSE ${s.peaks.rmse.toFixed(3)} | 장면 std ${s.scene.meanStd.toFixed(3)} · RMSE ${s.scene.rmse.toFixed(3)} | 전구간 RMSE ${s.all.rmse.toFixed(3)} | 미세 자극 ${s.microAvg.toFixed(2)}회 · u@2:30 ${s.uEndAvg.toFixed(2)}${d}`);
    }
    const ro = stat.realistic.off, rf = stat.realistic.full;
    say(`   현실 조건(B87 · 결정 때 닫힌 레코드만: ${rf.nFit} · 탐침 용량 /film 큐 볼륨)`);
    say(`   off·현실  봉우리 std ${ro.peaks.meanStd.toFixed(3)} · RMSE ${ro.peaks.rmse.toFixed(3)} | 장면 RMSE ${ro.scene.rmse.toFixed(3)}`);
    say(`   full·현실 봉우리 std ${rf.peaks.meanStd.toFixed(3)} · RMSE ${rf.peaks.rmse.toFixed(3)} | 장면 RMSE ${rf.scene.rmse.toFixed(3)} | OFF·현실 대비 봉우리 std ${pct(rf.peaks.meanStd, ro.peaks.meanStd)} · RMSE ${pct(rf.peaks.rmse, ro.peaks.rmse)} / 장면 RMSE ${pct(rf.scene.rmse, ro.scene.rmse)}`);
    for (let c = 0; c < MODES.length; c++) {
      const m = MODES[c];
      const cloud = cloudRuns(track, m.key, N_CLOUD), arch = archRuns(track, m.key);
      const s = stat[m.key], o = stat.off;
      const note = [
        `슬롯 봉우리: 관객 간 std ${s.peaks.meanStd.toFixed(3)} · 목표 RMSE ${s.peaks.rmse.toFixed(3)}${m.key === "off" ? "" : ` (OFF 대비 ${pct(s.peaks.meanStd, o.peaks.meanStd)} · ${pct(s.peaks.rmse, o.peaks.rmse)})`}`,
        `장면 1:08~2:30: 목표 RMSE ${s.scene.rmse.toFixed(3)}${m.key === "off" ? "" : ` (${pct(s.scene.rmse, o.scene.rmse)})`} · 미세 자극 평균 ${s.microAvg.toFixed(1)}회 · u@2:30 평균 ${s.uEndAvg.toFixed(2)}`,
      ];
      if (m.key === "full") {
        note.push(`frog/cat 변형: 민감형 ${arch.sensitive.plan.slice(3).map((p) => p.variantId).join("·")} / 둔감형 ${arch.blunt.plan.slice(3).map((p) => p.variantId).join("·")} · 위 수치는 이상 조건(결정 때 앞 탐침 응답 전부)`);
        const ro = stat.realistic.off, rf = stat.realistic.full;
        note.push(`현실 조건(결정 때 닫힌 레코드 ${rf.nFit} · /film 탐침 용량, OFF·현실 대비): 봉우리 std ${pct(rf.peaks.meanStd, ro.peaks.meanStd)} · RMSE ${pct(rf.peaks.rmse, ro.peaks.rmse)}`);
      }
      drawTension(svg, { x: 16 + c * (PW + 16), y: TOP + r * ROW, w: PW, h: PH, hu: UH, xd, xTicks, title: `${track} ${name} · ${m.title}`, run0: arch.typical, cloud, arch, note });
    }
  }
  return svg;
}

// =====================================================================
// 그림 2 — B77 연속 채널의 되먹임
// =====================================================================
function figB77() {
  const ROWS = [
    { truth: 0, title: `가정 A — 연속 채널이 참 긴장에 효과 없음(K=0): 침묵·안개·거리를 밀어도 관객은 그대로` },
    { truth: SIM_PARAMS.CONT_K, title: `가정 B — 효과 있음: u=+1 을 유지하면 기준 관객(g=${ACTUATE_PARAMS.G_REF}) 긴장이 서서히 +${SIM_PARAMS.CONT_K} (시정수 ${SIM_PARAMS.CONT_TAU}s, 이득 g 에 비례)` },
  ];
  const COLS = [
    { model: "none", title: "(1) 현재 코드 — x̂ 은 이산 자극 응답만 본다(연속 채널은 개루프)" },
    { model: "slow", title: `(2) x̂ 에 연속 채널의 느린 항 추가(모델 항 K=${SIM_PARAMS.CONT_K}·u, 시정수 ${SIM_PARAMS.CONT_TAU}s)` },
  ];
  const W = 1560, PW = 750, PH = 300, UH = 74, ROW = PH + UH + 86, TOP = 96;
  const svg = new Svg(W, TOP + 2 * ROW + 6);
  svg.text(20, 30, "B77 — 연속 채널(침묵·BGM·가로등·안개·거리·시선)은 x̂ 에 되먹임되지 않는다: 참 효과 가정 × x̂ 모델 항 유무", { size: 20, weight: "bold" });
  svg.text(20, 52, "트랙 H(공포) · 설계 전체 = /film 현재 모드(탐침 3 뒤 슬롯 변형 + 판정 뒤 미세 자극·연속 채널) · 실선 = 참 긴장 x, 점선 = 추정 x̂ · 1배속 실측(B11c)에서 u 는 2:14 에 +1.0 으로 포화했고 x̂ 은 0.17 에 머물렀다", { size: 11.5, color: "#444" });
  svg.text(20, 70, "결론용 관찰 — 장면(1:08~2:30)의 작가 목표 0.62~0.85 는 이산 자극(≤3회, 용량 ≤0.6)만으로는 어느 관객도 못 닿는다. 연속 채널이 긴장을 실제로 올린다면(가정 B) (1) 은 민감형을 상한 근처까지 밀고, (2) 는 u 를 덜 포화시킨다. 어느 가정이 맞는지는 파일럿이 정한다.", { size: 11.5, color: "#444" });
  legend(svg, 20, 90, [{ label: "민감형 x(실선) / x̂(점선)", color: COLORS.sensitive }, { label: "둔감형 x / x̂", color: COLORS.blunt }, { label: "작가 목표 ±tol", color: COLORS.band, kind: "band" }, { label: "상한", color: COLORS.ceiling, dash: "4 3", width: 1 }, { label: "미세 자극", color: "#555", kind: "tri" }]);
  const xd = [60, SIM_PARAMS.T_END], xTicks = [60, 80, 100, 120, 140, 160, 180];
  say("== 그림 2 sim-b77-continuous — 트랙 H · full 모드(= /film 현재) · 민감형/둔감형 (t=2:30 값)");
  for (let r = 0; r < ROWS.length; r++) for (let c = 0; c < COLS.length; c++) {
    const opts = { contTruth: ROWS[r].truth, contModel: COLS[c].model };
    const runs = { sensitive: simulateViewer({ track: "H", theta: ARCHETYPES.sensitive, mode: "full", opts }), blunt: simulateViewer({ track: "H", theta: ARCHETYPES.blunt, mode: "full", opts }) };
    const iEnd = Math.round(SIM_PARAMS.SCENE_END / SIM_PARAMS.DT), i0 = Math.round(SIM_PARAMS.VERDICT_T / SIM_PARAMS.DT);
    const rows = Object.entries(runs).map(([k, run]) => ({ key: k, uEnd: run.u[iEnd], xEnd: run.x[iEnd], xhatEnd: run.xhat[iEnd], xMax: Math.max(...run.x.slice(i0, iEnd + 1)), overCeil: run.x.slice(i0, iEnd + 1).filter((v) => v > run.ceiling).length * SIM_PARAMS.DT, uSatSec: run.u.slice(i0, iEnd + 1).filter((v) => v >= 0.999).length * SIM_PARAMS.DT }));
    summary.b77[`truth${ROWS[r].truth}_${COLS[c].model}`] = rows;
    const note = rows.map((x) => `${x.key === "sensitive" ? "민감형" : "둔감형"}: u@2:30 ${x.uEnd.toFixed(2)} · u=+1 포화 ${x.uSatSec.toFixed(0)}s · x 최대 ${x.xMax.toFixed(2)}${x.overCeil > 0 ? ` (상한 초과 ${x.overCeil.toFixed(1)}s)` : ""} · x̂@2:30 ${x.xhatEnd.toFixed(2)} vs x ${x.xEnd.toFixed(2)}`);
    say(`   가정 ${ROWS[r].truth === 0 ? "A" : "B"} × 모델 ${COLS[c].model.padEnd(4)} | ${note.join(" | ")}`);
    drawTension(svg, { x: 16 + c * (PW + 16), y: TOP + r * ROW, w: PW, h: PH, hu: UH, xd, xTicks, title: `${ROWS[r].title.split(":")[0]} × ${COLS[c].title.split(" — ")[0]}`, run0: runs.sensitive, arch: runs, showXhat: true, note: [ROWS[r].title, COLS[c].title, ...note] });
  }
  return svg;
}

// =====================================================================
// 그림 3 — B75 두 손의 충돌
// =====================================================================
function figB75() {
  const MEASURED = { key: "measured", label: "실측 공포형 θ̂(1배속 세션 B59: g1.28 L0.19 τ0.43 ρ0)", g: 1.28, L: 0.19, tau: 0.43, rho: 0 };
  const ROWS = [["C", "블랙코미디(상한 0.7)"], ["R", "로맨스(상한 0.75)"]];
  const COLS = [{ hold: 0, title: "(3) 창 없음(B75 이전) — 자극 직후 x̂ 봉우리를 연속 손이 즉시 이완으로 맞선다" }, { hold: SIM_PARAMS.HOLD_AFTER_MICRO, title: `(1) 미세 자극 뒤 ${SIM_PARAMS.HOLD_AFTER_MICRO}s 는 연속 손을 멈춤(settle) — /film 현재` }];
  const W = 1560, PW = 750, PH = 290, UH = 110, ROW = PH + UH + 66, TOP = 96;
  const svg = new Svg(W, TOP + 2 * ROW + 6);
  svg.text(20, 30, "B75 — 두 손의 상호작용: 미세 자극의 과도 응답을 연속 액추에이터가 상쇄하는가 (창 없음 vs 자극 뒤 멈춤 — /film 은 B75 부터 멈춤)", { size: 20, weight: "bold" });
  svg.text(20, 52, "film 모드 · 판정 1:08 뒤 미세 자극(먼 문, 간격 12s, ≤3회)이 x̂ 을 순간 올리면, 멈춤 창이 없을 때 연속 액추에이터(SLEW 0.2/s)가 허용폭 위라고 보고 u 를 내린다(relax, ●) · 공포 트랙에서는 목표(0.62~0.85)가 높아 이 충돌이 나지 않고, 코미디·로맨스에서 난다", { size: 11.5, color: "#444" });
  svg.text(20, 70, "3배속 실측(B11b)에서는 x̂ 이 0.26→1.0 으로 튀어 u 가 −1 까지 갔다(합성 관객의 정향 세기가 모델 관객보다 크다) — 여기서는 모델 관객 두 명으로 방향만 본다", { size: 11.5, color: "#444" });
  legend(svg, 20, 90, [{ label: "민감형 g1.2 τ3.5s", color: COLORS.sensitive }, { label: MEASURED.label, color: COLORS.measured }, { label: "작가 목표 ±tol", color: COLORS.band, kind: "band" }, { label: "상한", color: COLORS.ceiling, dash: "4 3", width: 1 }, { label: "미세 자극", color: "#555", kind: "tri" }, { label: "u 의 이완(relax) 틱", color: "#555", kind: "dot" }]);
  const xd = [64, 110], xTicks = [64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108];
  say("== 그림 3 sim-b75-two-hands — film 모드 · 판정 뒤 1:04~1:50");
  for (let r = 0; r < ROWS.length; r++) for (let c = 0; c < COLS.length; c++) {
    const [track, name] = ROWS[r];
    const opts = { holdAfterMicro: COLS[c].hold };
    const vs = [{ key: "sensitive", run: simulateViewer({ track, theta: ARCHETYPES.sensitive, mode: "film", opts }), color: COLORS.sensitive }, { key: "measured", run: simulateViewer({ track, theta: MEASURED, mode: "film", opts }), color: COLORS.measured }];
    const rows = vs.map((v) => { const i0 = Math.round(64 / SIM_PARAMS.DT), i1 = Math.round(110 / SIM_PARAMS.DT); const modes = v.run.mode.slice(i0, i1); const us = v.run.u.slice(i0, i1); return { key: v.key, relaxTicks: modes.filter((m) => m === "relax").length, holdTicks: modes.filter((m) => m === "settle").length, uMin: Math.min(...us), micro: v.run.micro.map((m) => m.t), xPeak: Math.max(...v.run.x.slice(i0, i1)) }; });
    summary.b75[`${track}_hold${COLS[c].hold}`] = rows;
    const note = rows.map((x) => `${x.key === "sensitive" ? "민감형" : "실측 공포형"}: relax 틱 ${x.relaxTicks} · u 최소 ${x.uMin.toFixed(2)} · x 봉우리 ${x.xPeak.toFixed(2)} · 미세 자극 ${x.micro.map(mmss).join("·")}`);
    say(`   ${track} hold=${COLS[c].hold}s | ${note.join(" | ")}`);
    drawTension(svg, { x: 16 + c * (PW + 16), y: TOP + r * ROW, w: PW, h: PH, hu: UH, xd, xTicks, title: `${track} ${name} · ${COLS[c].title}`, run0: vs[0].run, viewers: vs, note, ud: [-0.3, 0.6], uTicks: [-0.2, 0, 0.2, 0.4, 0.6] });
  }
  return svg;
}

// =====================================================================
// 그림 4 — B55 실측 세션의 θ̂ 회귀에서 track 레코드 척도
// =====================================================================
function figB55(files) {
  const sessions = files.map((f) => { const s = JSON.parse(fs.readFileSync(f, "utf8")); return { file: path.basename(f), route: s.route || "film", viewer: s.viewer, speed: s.speed, dominant: s.dominant, stimuli: s.engagement?.stimuli || [] }; }).filter((s) => s.stimuli.length);
  if (!sessions.length) return null;
  const W = 1560, PW = Math.floor((W - 16 * (sessions.length + 1)) / sessions.length), PH = 400, TOP = 96;
  const svg = new Svg(W, TOP + PH + 164);
  svg.text(20, 30, "B55 — θ̂ 회귀 y = log(반응크기/용량) = log g + n·log(1−ρ) 에서 track 레코드(수십 초 추적 사건)는 probe 와 척도가 다르다", { size: 20, weight: "bold" });
  svg.text(20, 52, "실측 세션(합성 공포형 관객, 1배속)의 engagement.stimuli 를 그대로 회귀 · 파랑 ● probe/startle · 주황 ▲ track · 테두리 초록 ● 미세 자극(판정 뒤, /film 만) · 실선 = 전체 레코드 적합(현재 코드) · 점선 = track 제외 적합", { size: 11.5, color: "#444" });
  svg.text(20, 70, "읽는 법 — ▲ 가 ● 의 선보다 한참 아래 있으면 track 의 반응 크기(응시 비율 위주)가 probe 의 정향 세기와 같은 자로 잰 값이 아니라는 뜻. 회귀는 이 점을 nth=0 의 '작은 반응' 으로 읽어 g 를 낮추고 ρ 를 0/음수 쪽으로 민다.", { size: 11.5, color: "#444" });
  say("== 그림 4 sim-b55-theta-scale — 실측 세션 θ̂ 적합 비교");
  const KIND_COLOR = { probe: "#2f6fd6", startle: "#2f6fd6", track: "#e67e22", micro: "#2e9e5b" };
  sessions.forEach((s, c) => {
    const pts = s.stimuli.map((st) => ({ st, kind: st.name.startsWith("micro") ? "micro" : st.kind, nth: st.nth || 0, mag: responseMagnitude(st), y: Math.log(Math.max(1e-6, responseMagnitude(st)) / Math.max(0.05, st.dose ?? 1)) }));
    const all = fitViewerModel(s.stimuli), probe = fitViewerModel(s.stimuli.filter((st) => st.kind !== "track"));
    const track = s.dominant || "H";
    const planOf = (th) => runController(track, th).entries.filter((e) => ["frog", "cat"].includes(e.slotId)).map((e) => `${e.slotId}:${e.variantId}(${e.dose})`).join(" ");
    const gScale = (th) => Math.max(ACTUATE_PARAMS.G_SCALE_MIN, Math.min(ACTUATE_PARAMS.G_SCALE_MAX, ACTUATE_PARAMS.G_REF / th.g)).toFixed(2);
    const nMax = Math.max(3, ...pts.map((p) => p.nth)) + 1;
    const p = new Panel(svg, { x: 16 + c * (PW + 16), y: TOP, w: PW, h: PH, xd: [-0.5, nMax], yd: [-0.6, 1.6], title: `${s.route === "interim" ? "/interim" : "/film"} · ${s.viewer?.label || ""} seed ${s.viewer?.seed ?? "-"} · ${s.file}`, xTicks: Array.from({ length: nMax + 1 }, (_, i) => i), yTicks: [-0.5, 0, 0.5, 1, 1.5], xFmt: (v) => String(v), yFmt: (v) => v.toFixed(1), xLabel: "n = 같은 채널 안 반복 횟수(nth)", yLabel: "y = log(반응크기 / 용량)", titleSize: 12.5 }).frame();
    const xs = [-0.5, nMax];
    // 사전분포 수축 없는 단순 회귀선(회색) — 모델 선(검정)이 점보다 아래에 있는 이유(사전 g 0.6·ρ 0.15 로 수축)를 보이기 위해
    const ols = (arr) => { const n = arr.length; if (n < 2) return null; const mx = arr.reduce((a, q) => a + q.nth, 0) / n, my = arr.reduce((a, q) => a + q.y, 0) / n; let sxy = 0, sxx = 0; for (const q of arr) { sxy += (q.nth - mx) * (q.y - my); sxx += (q.nth - mx) ** 2; } const slope = sxx > 1e-9 ? sxy / sxx : 0; return { slope, intercept: my - slope * mx }; };
    const olsAll = ols(pts), olsProbe = ols(pts.filter((q) => q.kind !== "track"));
    if (olsAll) p.series(xs, xs.map((n) => olsAll.intercept + n * olsAll.slope), { color: "#999", width: 1.2 });
    if (olsProbe) p.series(xs, xs.map((n) => olsProbe.intercept + n * olsProbe.slope), { color: "#999", width: 1.2, dash: "6 4" });
    p.series(xs, xs.map((n) => Math.log(all.g) + n * Math.log(1 - all.rho)), { color: "#111", width: 1.8 });
    p.series(xs, xs.map((n) => Math.log(probe.g) + n * Math.log(1 - probe.rho)), { color: "#111", width: 1.6, dash: "6 4" });
    for (const q of pts) {
      const kind = q.kind === "track" ? "tri" : "dot";
      p.marker(q.nth, q.y, kind, kind === "tri" ? 7 : 5, { fill: KIND_COLOR[q.kind] || "#555", stroke: q.kind === "micro" ? "#145a32" : "none", width: 1.5 });
      svg.text(p.sx(q.nth) + 8, p.sy(q.y) + 4, `${q.st.name}${q.kind === "track" ? ` (${q.st.dur}s · 응시 ${Math.round((q.st.lookSec || 0) / Math.max(1, q.st.dur) * 100)}%)` : ""}`, { size: 9.5, color: "#333" });
    }
    const note = [
      `전체 적합(현재):   g ${all.g} · ρ ${all.rho} · τ ${all.tau} · n ${all.n} · 확신 ${all.confidence} → gScale ${gScale(all)} · 계획 ${planOf(all)}`,
      `track 제외 적합:   g ${probe.g} · ρ ${probe.rho} · τ ${probe.tau} · n ${probe.n} · 확신 ${probe.confidence} → gScale ${gScale(probe)} · 계획 ${planOf(probe)}`,
    ];
    note.push(`▲ track 의 y 는 probe 회귀선보다 ${(() => { const tr = pts.find((q) => q.kind === "track"); if (!tr) return "-"; const pred = Math.log(probe.g) + tr.nth * Math.log(1 - probe.rho); return (pred - tr.y).toFixed(2); })()} 아래 · ${planOf(all) !== planOf(probe) ? "계획이 두 적합에서 다르다" : gScale(all) !== gScale(probe) ? `계획은 같고 gScale 만 ${gScale(all)}→${gScale(probe)}` : "계획·gScale 이 두 적합에서 같다(이 관객은 이득이 높아 최소 용량·배율 하한에서 포화)"}`);
    note.push(`회색 = 수축 없는 단순 회귀(전체 ${olsAll ? `절편 ${olsAll.intercept.toFixed(2)} 기울기 ${olsAll.slope.toFixed(2)}` : "-"} / track 제외 ${olsProbe ? `절편 ${olsProbe.intercept.toFixed(2)} 기울기 ${olsProbe.slope.toFixed(2)}` : "-"})`);
    note.push(`검정 = 사전분포(g 0.6 · ρ 0.15, kG 1.5 · kRho 2.5)로 수축한 모델 선 — 합성 관객의 반응이 사전보다 커서 점 아래에 놓인다`);
    note.forEach((l, i) => svg.text(p.left, TOP + PH + 12 + i * 14, l, { size: 10, color: "#333" }));
    summary.b55.push({ file: s.file, route: s.route, all, probeOnly: probe, planAll: planOf(all), planProbe: planOf(probe), gScaleAll: gScale(all), gScaleProbe: gScale(probe), points: pts.map((q) => ({ name: q.st.name, kind: q.kind, nth: q.nth, mag: Math.round(q.mag * 1000) / 1000, y: Math.round(q.y * 1000) / 1000 })) });
    say(`   ${s.file} (${s.route}) | ${note.join(" | ")}`);
  });
  legend(svg, 20, TOP + PH + 106, [{ label: "probe/startle", color: KIND_COLOR.probe, width: 4 }, { label: "track", color: KIND_COLOR.track, kind: "tri" }, { label: "미세 자극(probe, 판정 뒤)", color: KIND_COLOR.micro, width: 4 }, { label: "전체 적합(수축)", color: "#111" }, { label: "track 제외 적합(수축)", color: "#111", dash: "6 4" }, { label: "단순 회귀(수축 없음)", color: "#999", width: 1.2 }]);
  // 결론 문장은 세션 적합값에서 만든다(세션을 바꿔 다시 그려도 캡션이 수치와 어긋나지 않게)
  const b55 = summary.b55.slice(-sessions.length);
  const planSame = b55.filter((r) => r.planAll === r.planProbe).length;
  const gDiff = b55.filter((r) => r.gScaleAll !== r.gScaleProbe).map((r) => `${r.route} ${r.gScaleAll}→${r.gScaleProbe}`);
  const rhoUp = b55.filter((r) => r.probeOnly.rho > r.all.rho).map((r) => `${r.route} ${r.all.rho}→${r.probeOnly.rho}`);
  const verdict = `실측 ${b55.length}세션 중 계획이 같은 세션 ${planSame} · gScale 차이 ${gDiff.length ? gDiff.join(", ") : "없음"} · track 을 빼면 ρ 가 오른다 ${rhoUp.length ? rhoUp.join(", ") : "없음"}(습관화 추정에 영향)`;
  svg.text(20, TOP + PH + 132, "후보 — (1) g·ρ 는 probe 만으로 적합하고 track 은 L·τ 와 응시 지표에만 쓴다  (2) kind 별 척도 상수(파일럿 실측으로 보정)  (3) 그대로 둔다.", { size: 11.5, color: "#444" });
  svg.text(20, TOP + PH + 150, verdict, { size: 11.5, color: "#444" });
  say(`   결론: ${verdict}`);
  return svg;
}

// ---- 실행 ----
const chrome = NO_PNG ? null : findChrome();
async function emit(name, svg) {
  if (!svg) return;
  const svgPath = path.join(outDir, `${name}.svg`), pngPath = path.join(outDir, `${name}.png`);
  fs.writeFileSync(svgPath, svg.toString());
  let png = false;
  if (chrome) png = await toPng(svgPath, pngPath, svg.w, svg.h, { scale: SCALE, chrome });
  say(`   → ${svgPath}${png ? ` · ${pngPath} (${svg.w}×${svg.h} @${SCALE}x)` : NO_PNG ? "" : " · PNG 생략(크롬 없음 — CHROME=경로 로 지정)"}`);
}
await emit("sim-onoff", figOnOff());
await emit("sim-b77-continuous", figB77());
await emit("sim-b75-two-hands", figB75());
if (b55Files.length) await emit("sim-b55-theta-scale", figB55(b55Files)); else say("   (--b55 세션 없음 — 그림 4 생략)");
fs.writeFileSync(path.join(outDir, "sim-summary.json"), JSON.stringify(summary, null, 1));
fs.writeFileSync(path.join(outDir, "sim-summary.txt"), lines.join("\n") + "\n");
say(`→ ${path.join(outDir, "sim-summary.txt")} · sim-summary.json`);
