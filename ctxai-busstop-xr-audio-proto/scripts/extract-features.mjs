// 학습용 특징 추출 — 세션의 원시 자세 로그를 학습 모델 입력 행렬로 편다.
// 연구 레시피(CEAP-360VR 등으로 사전학습할 연속 긴장 회귀 모델)의 입력 특징을,
// 우리가 이미 만드는 데이터에서 같은 형식으로 뽑는다. 데이터셋 없이도 파일럿 데이터를
// 모델 입력 텐서로 준비하는 다리다.
//
//   node scripts/extract-features.mjs [out_dir] [--hop 0.5] [--win 2]
//
// 세션마다 <id>_features.csv:
//   t, angVelRms, stillRatio, rollActivity, posJitter, band05_4, band4_6, reversals,
//   awayRatio, intentMatch, pitchRel, retreat,            (windowEngagementSense.windowFeatures)
//   z_angVel, z_jitter,                                    (세션 내 z-점수 — 관객 정규화)
//   tension                                                (약라벨: tensionEstimate, 파일럿 자기보고로 대체 예정)
//
// 슬라이딩 창(기본 2초, 0.5초 홉)이라 AVEC 류 연속 회귀에 바로 쓰는 겹침 프레임이 된다.
// device-agnostic: yaw/pitch/roll 각도만 쓰고 위치는 흔들림(jitter)으로만 — Vive/Quest/WebXR 공통.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { windowFeatures, ENGAGE_PARAMS } from "../lib/engagementSense.js";
import { estimateTensionSeries } from "../lib/tensionEstimate.js";

const SRC = path.join(process.cwd(), "data", "sessions");
const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith("--")) || "data/feature_export";
const OUT = path.join(process.cwd(), outDir);
const HOP = Number((args[args.indexOf("--hop") + 1]) || 0.5);
const WIN = Number((args[args.indexOf("--win") + 1]) || 2);

const FEAT = ["angVelRms", "stillRatio", "rollActivity", "posJitter", "band05_4", "band4_6", "reversals", "awayRatio", "intentMatch", "pitchRel", "retreat"];
function csvRow(vals) { return vals.map((v) => (v == null ? "" : v)).join(","); }

/** 원시 CSV 문자열 → 표본 배열. */
export function parseRaw(csv) {
  const lines = csv.trim().split("\n");
  const cols = lines[0].split(",");
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(",");
    out.push({
      t: Number(p[idx.t_ms]) / 1000,
      yaw: Number(p[idx.yaw]), pitch: Number(p[idx.pitch]), roll: Number(p[idx.roll]),
      x: Number(p[idx.x_mm]) / 1000, y: Number(p[idx.y_mm]) / 1000, z: Number(p[idx.z_mm]) / 1000,
      intent: p[idx.intent_az] === "" ? null : Number(p[idx.intent_az]),
      stim: p[idx.stim] || "",
    });
  }
  return out;
}

function zstats(vals) {
  const v = vals.filter((x) => Number.isFinite(x));
  if (!v.length) return { m: 0, sd: 1 };
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
  return { m, sd };
}

/** 세션 하나 → 특징 행렬(겹침 창). */
export function extractFeatures(samples, tensionSeries, { hop = HOP, win = WIN } = {}) {
  if (!samples.length) return { columns: [], rows: [] };
  const baseSamples = samples.filter((s) => s.t <= ENGAGE_PARAMS.BASELINE_SEC);
  const bl = baseSamples.length ? baseSamples : samples.slice(0, Math.min(60, samples.length));
  const baseline = { yaw: avg(bl.map((s) => s.yaw)), pitch: avg(bl.map((s) => s.pitch)), z: avg(bl.map((s) => s.z)) };
  const tEnd = samples[samples.length - 1].t;
  const tFn = (t) => { // 가장 가까운 tension
    if (!tensionSeries?.length) return null;
    let best = null, bd = Infinity;
    for (const p of tensionSeries) { const d = Math.abs(p.t - t); if (d < bd) { bd = d; best = p.tension; } }
    return bd <= win ? best : null;
  };
  const raw = [];
  for (let end = win; end <= tEnd; end += hop) {
    const buf = samples.filter((s) => s.t > end - win && s.t <= end);
    const f = windowFeatures(buf, baseline);
    if (!f) continue;
    raw.push({ t: Math.round(end * 10) / 10, f, tension: tFn(end) });
  }
  const za = zstats(raw.map((r) => r.f.angVelRms));
  const zj = zstats(raw.map((r) => r.f.posJitter));
  const columns = ["t", ...FEAT, "z_angVel", "z_jitter", "tension"];
  const rows = raw.map((r) => [r.t, ...FEAT.map((k) => r.f[k]), round((r.f.angVelRms - za.m) / za.sd), round((r.f.posJitter - zj.m) / zj.sd), r.tension]);
  return { columns, rows };
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round = (x) => Math.round(x * 1000) / 1000;

async function main() {
  let names = [];
  try { names = (await fs.readdir(SRC)).filter((n) => n.endsWith(".json")).sort(); }
  catch { console.error(`세션 폴더 없음: ${SRC}`); process.exit(1); }
  if (!names.length) { console.error("세션 없음"); process.exit(1); }
  await fs.mkdir(OUT, { recursive: true });
  let done = 0, totalRows = 0;
  for (const n of names) {
    let j; try { j = JSON.parse(await fs.readFile(path.join(SRC, n), "utf8")); } catch { continue; }
    const e = j.engagement; if (!e?.raw?.csv) continue;
    const samples = parseRaw(e.raw.csv);
    const tension = estimateTensionSeries(e);
    const { columns, rows } = extractFeatures(samples, tension);
    if (!rows.length) continue;
    const id = j.id || n.replace(/\.json$/, "");
    await fs.writeFile(path.join(OUT, `${id}_features.csv`), [columns.join(","), ...rows.map(csvRow)].join("\n"));
    done++; totalRows += rows.length;
  }
  console.log(`세션 ${names.length}개 중 특징 ${done}개 → ${OUT} (겹침 창 ${WIN}s/홉 ${HOP}s, 총 ${totalRows}행)`);
  console.log(`  각 <id>_features.csv: [${["t", ...FEAT, "z_angVel", "z_jitter", "tension"].join(", ")}]`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
