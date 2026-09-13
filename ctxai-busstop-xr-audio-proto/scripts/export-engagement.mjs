// 파일럿 데이터 내보내기 — data/sessions/*.json 의 engagement 리포트를 분석·학습용 CSV 로 편다.
//   node scripts/export-engagement.mjs [out_dir]   (기본 data/engagement_export)
//
// 세션마다 세 파일:
//   <id>_raw.csv       원시 자세 샘플 전량 (t_ms,yaw,pitch,roll,x_mm,y_mm,z_mm,intent_az,stim)
//   <id>_windows.csv   2초 창 잔움직임 특징 + 집중도 시계열
//   <id>_stimuli.csv   탐침(사건)별 반응 레코드
// 그리고 전 세션 한 줄 요약 sessions_summary.csv (탐침 응답률·집중도·웃음·꺾인 시점·자기보고).

import fs from "node:fs/promises";
import path from "node:path";

const SRC = path.join(process.cwd(), "data", "sessions");
const OUT = path.join(process.cwd(), process.argv[2] || "data/engagement_export");

function csvRow(vals) { return vals.map((v) => (v == null ? "" : typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","); }

const WIN_COLS = ["t0", "t1", "n", "angVelRms", "stillRatio", "rollActivity", "posJitter", "band05_4", "band4_6", "reversals", "awayRatio", "intentMatch", "stimRatio", "pitchRel", "retreat"];
const ENG_COLS = ["t", "score", "probeResp", "calm", "intent", "laugh", "fidget"];
const STIM_COLS = ["name", "kind", "channel", "dose", "nth", "onset", "dur", "azimuth", "preLook", "preMove", "responded", "looked", "lookLatency", "moveLatency", "lookSec", "peakAmp", "maxVel", "retreat", "recoverySec", "recheck"];

async function main() {
  let names = [];
  try { names = (await fs.readdir(SRC)).filter((n) => n.endsWith(".json")).sort(); }
  catch { console.error(`세션 폴더가 없습니다: ${SRC}`); process.exit(1); }
  if (!names.length) { console.error("세션 파일이 없습니다."); process.exit(1); }
  await fs.mkdir(OUT, { recursive: true });

  const summary = [];
  let withEng = 0;
  for (const n of names) {
    let j;
    try { j = JSON.parse(await fs.readFile(path.join(SRC, n), "utf8")); } catch { continue; }
    const e = j.engagement;
    const id = j.id || n.replace(/\.json$/, "");
    if (!e) { summary.push({ id, hasEngagement: 0 }); continue; }
    withEng++;

    if (e.raw?.csv) await fs.writeFile(path.join(OUT, `${id}_raw.csv`), e.raw.csv);

    const winLines = [WIN_COLS.join(",")];
    const engByT = new Map((e.engagement || []).map((x) => [x.t, x]));
    for (const w of e.windows || []) {
      const row = WIN_COLS.map((c) => w[c]);
      const eng = engByT.get(w.t1);
      winLines.push(csvRow([...row, ...(eng ? ENG_COLS.slice(1).map((c) => eng[c]) : [])]));
    }
    winLines[0] = [...WIN_COLS, ...ENG_COLS.slice(1)].join(",");
    await fs.writeFile(path.join(OUT, `${id}_windows.csv`), winLines.join("\n"));

    const stimLines = [STIM_COLS.join(",")];
    for (const st of e.stimuli || []) stimLines.push(csvRow(STIM_COLS.map((c) => st[c])));
    await fs.writeFile(path.join(OUT, `${id}_stimuli.csv`), stimLines.join("\n"));

    // 궤적 추종 로그(있으면) — 관객모델 θ와 제어기 추천 계획
    const ctl = j.control;
    if (ctl?.plan?.length) {
      const cCols = ["slotId", "t", "channel", "variantId", "dose", "predTension", "target", "nth", "reason"];
      const cLines = [cCols.join(","), ...ctl.plan.map((p) => csvRow(cCols.map((c) => p[c])))];
      await fs.writeFile(path.join(OUT, `${id}_control.csv`), cLines.join("\n"));
    }
    const th = ctl?.theta || {};

    const s = e.summary || {};
    summary.push({
      id, hasEngagement: 1,
      dominant: j.dominant ?? null, selfReport: j.selfReport ?? null,
      durationSec: e.elapsed ?? null, rateHz: e.rateHz ?? null,
      stimuli: s.stimuli ?? null, probeResponseRate: s.probeResponseRate ?? null, anticipationRate: s.anticipationRate ?? null,
      meanEngagement: s.meanEngagement ?? null, calmMean: s.calmMean ?? null, fidgetMean: s.fidgetMean ?? null, intentMatchMean: s.intentMatchMean ?? null,
      laughEpisodes: (s.laughEpisodes || []).length,
      topSegment: s.topSegments?.[0] ? `${s.topSegments[0].t0}-${s.topSegments[0].t1}s(${s.topSegments[0].near?.name ?? "-"})` : null,
      dropPointSec: s.dropPoint?.t ?? null,
      ctlTrack: ctl?.track ?? null, thetaG: th.g ?? null, thetaL: th.L ?? null, thetaTau: th.tau ?? null, thetaRho: th.rho ?? null, thetaConf: th.confidence ?? null,
      microFires: (j.events || []).filter((ev) => ev.name === "control:micro").length,
    });
  }

  const sumCols = ["id", "hasEngagement", "dominant", "selfReport", "durationSec", "rateHz", "stimuli", "probeResponseRate", "anticipationRate", "meanEngagement", "calmMean", "fidgetMean", "intentMatchMean", "laughEpisodes", "topSegment", "dropPointSec", "ctlTrack", "thetaG", "thetaL", "thetaTau", "thetaRho", "thetaConf", "microFires"];
  const sumLines = [sumCols.join(","), ...summary.map((r) => csvRow(sumCols.map((c) => r[c])))];
  await fs.writeFile(path.join(OUT, "sessions_summary.csv"), sumLines.join("\n"));

  console.log(`세션 ${names.length}개 중 집중도 데이터 ${withEng}개 → ${OUT}`);
  console.log(`  sessions_summary.csv (${summary.length}행), 세션마다 _raw/_windows/_stimuli.csv`);
}
main();
