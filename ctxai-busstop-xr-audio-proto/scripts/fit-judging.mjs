// 파일럿 판정 피팅 — 세션 기록(자기보고가 있는 것)으로 헤드 포즈 피처 6개의 가중치를 맞춘다.
//
//   node scripts/fit-judging.mjs                       배포판 /api/session 에서 읽기
//   node scripts/fit-judging.mjs --base http://localhost:3000
//   node scripts/fit-judging.mjs --file sessions.json  (세션 객체 배열 JSON, 또는 그런 파일이 든 폴더)
//   node scripts/fit-judging.mjs --synthetic 20        파이프라인 점검용 가짜 관객 20명 (실데이터 아님)
//   옵션: --lambda 1 (L2 세기) · --weighted (자기보고 강도 1~7 을 표본 가중치로) · --out fit.json (피팅 결과 저장)
//
// 정답 라벨 = 종료 카드의 자기보고(selfReport: R/H/C). 같은 회차가 여러 번 저장되면(자기보고로 다시 저장)
// cardToken 기준으로 하나만 쓴다. 원시 헤드 포즈(headPose.raw)가 있으면 lib/headPoseFeatures.js 로 다시
// 계산하므로, 피처 정의를 고친 뒤에도 파일럿을 다시 돌릴 필요가 없다.
//
// 모델: 다항 로지스틱 회귀(표준화 + 강한 L2). 평가: leave-one-out 일치율 (3클래스 우연 수준 33%).
// 폴백: 피처별 중앙값·장르별 중앙값 — 기존 점수표의 임계값을 "실측 중앙값"으로 갈아끼울 때 쓴다.

import fs from "node:fs";
import path from "node:path";
import { FEATURE_NAMES, unpackRaw, sessionProbeFeatures, sessionVector } from "../lib/headPoseFeatures.js";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(`--${k}`);
const LAMBDA = Number(opt("lambda", 1));
const CLASSES = ["R", "H", "C"];
const LABEL = { R: "로맨스", H: "공포", C: "블랙코미디" };

// ---------- 데이터 ----------
async function fromApi(base) {
  const list = await (await fetch(`${base}/api/session`)).json();
  const ids = (list.items || []).map((i) => i.id);
  const out = [];
  for (const id of ids) {
    const j = await (await fetch(`${base}/api/session?id=${encodeURIComponent(id)}`)).json();
    if (j.session) out.push(j.session);
  }
  return out;
}
function fromFile(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).filter((n) => n.endsWith(".json")).map((n) => JSON.parse(fs.readFileSync(path.join(p, n), "utf8")));
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return Array.isArray(j) ? j : [j];
}

// 가짜 관객 — scripts/sim-headpose.mjs 와 같은 세 유형에 개인차를 섞어, 실제 /film 센서를 그대로 돌린다.
async function synthetic(n) {
  const { createHeadPoseSensor } = await import("../lib/headPoseSense.js");
  const { CUES } = await import("../lib/filmTimeline.js");
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const jit = (x, k = 0.35) => x * (1 + (rnd() * 2 - 1) * k);
  const profiles = ["fearful", "curious", "calm"], label = { fearful: "H", curious: "C", calm: "R" };
  const out = [];
  for (let k = 0; k < n; k++) {
    const profile = profiles[k % 3];
    const s = createHeadPoseSensor({ push: () => {}, mark: () => {} });
    const dt = 1 / 60; let t = 0; const fired = new Set(); const active = [];
    let yaw = 0, z = 0, targetYaw = 0, targetZ = 0, holdUntil = 0, rate = 4;
    const mix = rnd() < 0.2 ? profiles[Math.floor(rnd() * 3)] : profile; // 20%는 사건마다 다른 유형처럼 반응(잡음)
    while (t < 75) {
      for (const c of CUES) if (t >= c.t && !fired.has(c.name)) { fired.add(c.name); if (c.sense) { s.beginEvent(c.name, c.sense.azimuth, c.sense.dur, { kind: c.sense.kind }); active.push({ ...c, at: t }); } }
      const ev = active.find((e) => t - e.at < 0.3 && t - e.at >= 0);
      const p = ev && rnd() < 0.15 ? mix : profile;
      if (ev) {
        if (p === "fearful") { targetYaw = ev.sense.azimuth * jit(0.9, 0.1); rate = jit(14); holdUntil = t + jit(3.5); targetZ = ev.sense.kind === "startle" ? jit(0.1) : 0.02; }
        if (p === "curious") { targetYaw = ev.sense.azimuth * jit(0.95, 0.1); rate = jit(6); holdUntil = t + jit(2.6); targetZ = -jit(0.03); }
        if (p === "calm") { targetYaw = ev.sense.kind === "track" ? ev.sense.azimuth * 0.8 : ev.sense.azimuth * jit(0.15); rate = jit(2.5); holdUntil = t + (ev.sense.kind === "track" ? jit(10) : jit(0.8)); targetZ = 0; }
      }
      if (t > holdUntil) {
        if (profile === "fearful") { rate = jit(0.9); targetYaw = 0; }
        if (profile === "curious") { rate = 8; targetYaw = (Math.floor(t * 0.7) % 2 ? 25 : -20) * jit(1); }
        if (profile === "calm") { rate = 2; targetYaw = 0; }
        targetZ = 0;
      }
      yaw += (targetYaw - yaw) * Math.min(1, rate * dt) + (rnd() - 0.5) * 0.15; // 추적 떨림
      z += (targetZ - z) * Math.min(1, 6 * dt);
      s.update(yaw, 0, z, dt); t += dt;
    }
    const hp = s.report({ full: true });
    out.push({ id: `synthetic_${k}`, selfReport: label[profile], selfIntensity: 1 + Math.floor(rnd() * 7), dominant: null, headPose: { raw: hp.raw, probes: hp.probes, baseline: hp.baseline, features: hp.features } });
  }
  return out;
}

function dedupe(sessions) {
  const by = new Map();
  for (const s of sessions) {
    const key = s.cardToken || s.id;
    const cur = by.get(key);
    const better = !cur || (!!s.selfReport && !cur.selfReport) || (!!s.selfReport === !!cur.selfReport && (s.savedAt || "") > (cur.savedAt || ""));
    if (better) by.set(key, s);
  }
  return [...by.values()];
}

function featuresOf(s) {
  const hp = s.headPose || {};
  if (hp.raw?.yaw?.length && hp.probes?.length) {
    return { vec: sessionVector(sessionProbeFeatures(unpackRaw(hp.raw), hp.probes, hp.baseline?.yaw ?? 0)), from: "raw" };
  }
  if (hp.features?.session) return { vec: hp.features.session, from: "stored" };
  return null;
}

// ---------- 수학 (작은 데이터라 의존성 없이) ----------
const median = (xs) => { const a = xs.filter((x) => x != null && Number.isFinite(x)).sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

function prepare(train) {
  // 결측은 학습 쪽 중앙값으로 채우고, 학습 쪽 평균·표준편차로 표준화
  const med = FEATURE_NAMES.map((f, j) => median(train.map((r) => r.x[j])) ?? 0);
  const filled = (x) => x.map((v, j) => (v == null || !Number.isFinite(v) ? med[j] : v));
  const X = train.map((r) => filled(r.x));
  const mu = FEATURE_NAMES.map((_, j) => X.reduce((a, r) => a + r[j], 0) / X.length);
  const sd = FEATURE_NAMES.map((_, j) => Math.sqrt(X.reduce((a, r) => a + (r[j] - mu[j]) ** 2, 0) / Math.max(1, X.length - 1)) || 1);
  const z = (x) => filled(x).map((v, j) => (v - mu[j]) / sd[j]);
  return { med, mu, sd, z };
}

function softmax(v) { const m = Math.max(...v); const e = v.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); }

function fitLogistic(Z, y, lambda, iters = 3000, lr = 0.2, sw = null) {
  const K = CLASSES.length, D = Z[0].length, N = Z.length;
  const w8 = sw || new Array(N).fill(1), W8 = w8.reduce((a, b) => a + b, 0) || 1;
  const W = Array.from({ length: K }, () => new Array(D).fill(0)), b = new Array(K).fill(0);
  for (let it = 0; it < iters; it++) {
    const gW = Array.from({ length: K }, () => new Array(D).fill(0)), gb = new Array(K).fill(0);
    for (let i = 0; i < N; i++) {
      const p = softmax(W.map((w, k) => b[k] + w.reduce((a, wj, j) => a + wj * Z[i][j], 0)));
      for (let k = 0; k < K; k++) { const e = (p[k] - (y[i] === k ? 1 : 0)) * w8[i]; gb[k] += e / W8; for (let j = 0; j < D; j++) gW[k][j] += (e * Z[i][j]) / W8; }
    }
    for (let k = 0; k < K; k++) { b[k] -= lr * gb[k]; for (let j = 0; j < D; j++) W[k][j] -= lr * (gW[k][j] + lambda * W[k][j]); }
  }
  return { W, b, predict: (z) => softmax(W.map((w, k) => b[k] + w.reduce((a, wj, j) => a + wj * z[j], 0))) };
}

// ---------- 실행 ----------
const sessions = has("synthetic") ? await synthetic(Number(opt("synthetic", 20)))
  : has("file") ? fromFile(opt("file"))
  : await fromApi(opt("base", "https://busstop-team.vercel.app"));

const all = dedupe(sessions);
const rows = [];
let noLabel = 0, noFeat = 0;
for (const s of all) {
  if (!CLASSES.includes(s.selfReport)) { noLabel++; continue; }
  const f = featuresOf(s);
  if (!f) { noFeat++; continue; }
  const inten = Number.isFinite(Number(s.selfIntensity)) ? Math.max(1, Math.min(7, Number(s.selfIntensity))) : null;
  rows.push({ id: s.id, y: CLASSES.indexOf(s.selfReport), sys: s.dominant || null, x: FEATURE_NAMES.map((n) => f.vec[n]), from: f.from, inten });
}

console.log(`세션 ${sessions.length}개 → 회차 ${all.length}개 (같은 cardToken 합침) · 자기보고 없음 ${noLabel} · 피처 없음(10/24 이전 기록) ${noFeat} · 사용 ${rows.length}`);
if (has("synthetic")) console.log("⚠️  --synthetic: 가짜 관객으로 파이프라인만 점검하는 중 — 아래 숫자는 실측이 아님");
const counts = CLASSES.map((c, k) => `${LABEL[c]} ${rows.filter((r) => r.y === k).length}`).join(" · ");
console.log(`라벨 분포: ${counts}`);
const WEIGHTED = has("weighted");
const sw = (rs) => (WEIGHTED ? rs.map((r) => (r.inten ?? 4) / 7) : null);
const intenLine = CLASSES.map((c, k) => { const xs = rows.filter((r) => r.y === k && r.inten != null).map((r) => r.inten); return `${LABEL[c]} ${xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "–"}`; }).join(" · ");
console.log(`자기보고 강도 평균(1~7): ${intenLine}${WEIGHTED ? "  — 표본 가중치로 사용" : ""}`);
if (rows.length < 6) { console.log("피팅하기엔 자기보고가 있는 회차가 너무 적다 (최소 6, 권장 15~20). 파일럿 뒤 다시 실행."); process.exit(0); }

// 현재 시스템 일치율 (비교 기준)
const withSys = rows.filter((r) => r.sys);
if (withSys.length) {
  const ok = withSys.filter((r) => CLASSES[r.y] === r.sys).length;
  console.log(`현재 판정 vs 자기보고: ${ok}/${withSys.length} = ${Math.round((ok / withSys.length) * 100)}%`);
}

// leave-one-out
const confusion = CLASSES.map(() => CLASSES.map(() => 0));
let correct = 0;
for (let i = 0; i < rows.length; i++) {
  const train = rows.filter((_, j) => j !== i);
  const prep = prepare(train);
  const m = fitLogistic(train.map((r) => prep.z(r.x)), train.map((r) => r.y), LAMBDA, 1500, 0.2, sw(train));
  const p = m.predict(prep.z(rows[i].x));
  const pred = p.indexOf(Math.max(...p));
  confusion[rows[i].y][pred]++;
  if (pred === rows[i].y) correct++;
}
const loo = correct / rows.length;
console.log(`\n다항 로지스틱 (λ=${LAMBDA}) leave-one-out 일치율: ${correct}/${rows.length} = ${Math.round(loo * 100)}%  (우연 수준 33%, 발표 방어선 55~65%)`);
console.log("혼동표 (행 = 자기보고, 열 = 예측)");
console.log("            " + CLASSES.map((c) => LABEL[c].padEnd(8)).join(""));
CLASSES.forEach((c, k) => console.log("  " + LABEL[c].padEnd(10) + confusion[k].map((v) => String(v).padEnd(8)).join("")));

// 전체로 다시 피팅 — 가중치(표준화 단위)
const prep = prepare(rows);
const model = fitLogistic(rows.map((r) => prep.z(r.x)), rows.map((r) => r.y), LAMBDA, 3000, 0.2, sw(rows));
console.log("\n가중치 (표준화 1σ 당, +면 그 장르 쪽)");
console.log("  " + "피처".padEnd(14) + CLASSES.map((c) => LABEL[c].padEnd(10)).join(""));
FEATURE_NAMES.forEach((f, j) => console.log("  " + f.padEnd(14) + CLASSES.map((_, k) => model.W[k][j].toFixed(2).padStart(6).padEnd(10)).join("")));

// 폴백 — 실측 중앙값
console.log("\n폴백: 피처별 실측 중앙값 (전체 / 장르별) — 점수표 임계값을 이 값으로 갈아끼울 때");
console.log("  " + "피처".padEnd(14) + "전체".padEnd(10) + CLASSES.map((c) => LABEL[c].padEnd(10)).join(""));
FEATURE_NAMES.forEach((f, j) => {
  const fmt = (v) => (v == null ? "–" : (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(3))).padEnd(10);
  console.log("  " + f.padEnd(14) + fmt(median(rows.map((r) => r.x[j]))) + CLASSES.map((_, k) => fmt(median(rows.filter((r) => r.y === k).map((r) => r.x[j])))).join(""));
});
console.log("  참고: flinch_peak 중앙값 → lib/headPoseSense.js STARTLE_YAW_VEL, return_lat 공포/코미디 중앙값 → SLOW_/FAST_RECOVERY_SEC 후보");

const outPath = opt("out", null);
if (outPath) {
  const result = {
    fittedAt: new Date().toISOString(), synthetic: has("synthetic"), n: rows.length, lambda: LAMBDA, weighted: WEIGHTED, loo, confusion,
    classes: CLASSES, features: FEATURE_NAMES, impute: prep.med, mean: prep.mu, std: prep.sd, weights: model.W, bias: model.b,
  };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n저장: ${outPath}`);
}
