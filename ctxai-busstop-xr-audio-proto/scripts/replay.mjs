// 세션 리플레이 + 골든 대조 — 하네스의 세 번째 다리.
//
// 저장된 세션(JSONL)에서 RawSample[] 과 요각 시계열을 복원해, 라이브와
// **같은 순수 함수**에 통과시킨다. 카메라도 마이크도 없이 판정 로직 전체를
// 재계산할 수 있으므로, 임계값을 고칠 때마다 다른 게 깨지는지 즉시 확인된다.
//
// 이것이 없던 동안의 상태가 구현_리스크와_지원_필요사항.md §1-1 에 적혀 있다:
//   "마지막 라운드에서는 회귀 테스트 4개 중 2개가 재실패해서,
//    패치가 패치를 부르는 상태였습니다."
//
//   node scripts/replay.mjs                 fixtures/ 전부 리플레이 + 골든 대조
//   node scripts/replay.mjs <파일…>          지정한 세션만
//   node scripts/replay.mjs --verbose        프로브별 커널까지 출력
//   node scripts/replay.mjs --update-golden  현재 결과를 골든으로 저장

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { metricsFrom, judgeFromBehavior, fuseChannels, confidenceOf } from "../lib/behaviorCore.js";
import { kernelsFrom, judgeFromKernels } from "../lib/probeWindow.js";
import { PROBES } from "../lib/probes.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "..", "fixtures");
const GOLDEN = path.join(FIXTURES, "golden.json");

const argv = process.argv.slice(2);
const VERBOSE = argv.includes("--verbose");
const UPDATE = argv.includes("--update-golden");
const FILES = argv.filter((a) => !a.startsWith("--"));

// ── 세션 읽기 ──────────────────────────────────────────────

export function readSession(file) {
  const raw = file.endsWith(".gz")
    ? zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")
    : fs.readFileSync(file, "utf8");

  const out = { meta: null, probes: [], gaze: [], samples: [], label: null, channels: {} };
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    switch (e.type) {
      case "meta": out.meta = e; break;
      case "probe": out.probes.push(e); break;
      case "gaze": out.gaze.push({ t: e.t, yaw: e.yaw, pitch: e.pitch }); break;
      case "frame": out.samples.push({ t: e.t, lm: e.lm, bs: e.bs, vis: e.vis }); break;
      case "channels": out.channels = e; break;   // 텍스트·음성 채널 점수 (있으면)
      case "label": out.label = e; break;
      default: break;
    }
  }
  return out;
}

// ── 리플레이 — 라이브와 완전히 같은 함수를 탄다 ────────────

export function replay(session) {
  // 요각 경로 (판정 주 신호)
  const R = kernelsFrom({ gaze: session.gaze, samples: session.samples, probes: PROBES });
  const gazeJudge = judgeFromKernels(R.kernels);

  // 웹캠 좌표 경로 (방식 B — 나란히 기록해 두고 나중에 비교)
  const totalMs = session.meta?.totalMs ?? (session.samples.at(-1)?.t || 0);
  const metrics = metricsFrom(session.samples, { durationMs: totalMs, calibMs: 8000 });
  const camJudge = judgeFromBehavior(metrics);

  const fused = fuseChannels({
    behaviorScores: gazeJudge.scores,
    textScores: session.channels.textScores ?? null,
    voiceScores: session.channels.voiceScores ?? null,
  });

  return { baseline: R.baseline, kernels: R.kernels, gazeJudge, metrics, camJudge, fused };
}

// ── 출력 ───────────────────────────────────────────────────

const pct = (v) => `${Math.round(v * 100)}`.padStart(3);
const bar = (s) => `R${pct(s.R)} H${pct(s.H)} C${pct(s.C)}`;
const top = (s) => Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];

function checkExpect(expect, scores) {
  if (!expect) return null;
  const t = top(scores);
  if (expect === "notH") return t !== "H";
  if (expect === "C>H") return scores.C > scores.H;
  return t === expect;
}

function run() {
  const files = FILES.length
    ? FILES
    : fs.readdirSync(FIXTURES)
        .filter((f) => f.endsWith(".jsonl") || f.endsWith(".jsonl.gz"))
        .map((f) => path.join(FIXTURES, f));

  if (!files.length) {
    console.error("픽스처가 없습니다. 먼저: node scripts/synth-sessions.mjs");
    process.exit(1);
  }

  const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, "utf8")) : {};
  const next = {};
  let pass = 0, fail = 0;

  console.log("이름                      요각 판정        웹캠 판정        기대  골든");
  console.log("─".repeat(78));

  for (const file of files) {
    const name = path.basename(file).replace(/\.jsonl(\.gz)?$/, "");
    const session = readSession(file);
    const r = replay(session);

    const round = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v.toFixed(4))]));
    next[name] = {
      gaze: round(r.gazeJudge.scores),
      cam: round(r.camJudge.scores),
      fused: round(r.fused.scores),
      confidence: Number(r.fused.confidence.toFixed(4)),
      intensity: Object.fromEntries(r.kernels.map((k) => [k.probeId, k.intensity])),
    };

    // 기대값 (v2.md §2-5 · 리허설 회귀)
    const exp = session.label?.expect ?? null;
    const expOk = checkExpect(exp, r.gazeJudge.scores);

    // 골든 대조 — 판정이 조용히 바뀌었는지
    const g = golden[name];
    let goldOk = null;
    if (g) {
      const same = ["R", "H", "C"].every((k) => Math.abs(g.gaze[k] - next[name].gaze[k]) < 0.005);
      goldOk = same;
    }

    const mark = (v) => (v === null ? " · " : v ? " ✓ " : " ✗ ");
    if (expOk === false || goldOk === false) fail++; else pass++;

    console.log(
      name.padEnd(24) +
      bar(r.gazeJudge.scores).padEnd(17) +
      bar(r.camJudge.scores).padEnd(17) +
      `${(exp || "-").padEnd(5)}${mark(expOk)}${mark(goldOk)}`
    );

    if (VERBOSE) {
      console.log("   기저선  yaw " + r.baseline.yaw + "° · pitch " + r.baseline.pitch + "° (" + r.baseline.n + "샘플)");
      console.log("   신호    " + JSON.stringify(r.gazeJudge.signals));
      for (const k of r.kernels) {
        console.log(
          `   ${k.probeId.padEnd(7)} 강도${k.intensity}` +
          ` 획득 ${k.acquired ? "O" : "X"}` +
          ` 잠복 ${String(k.latencyMs ?? "-").padStart(5)}ms` +
          ` 오차 ${String(k.peakErrorDeg ?? "-").padStart(6)}°` +
          ` 온타깃 ${String(k.onTargetMs).padStart(5)}ms` +
          ` 복귀 ${String(k.returnMs ?? "느림").padStart(5)}` +
          ` 재확인 ${k.revisits}` +
          ` 공포 ${k.peakFear.toFixed(2)} 웃음 ${k.peakAmusement.toFixed(2)}` +
          ` 얼굴유실 ${k.faceLostMs}ms`
        );
      }
      console.log("");
    }
  }

  console.log("─".repeat(78));
  console.log(`${pass} 통과 / ${fail} 실패`);

  if (UPDATE) {
    fs.writeFileSync(GOLDEN, JSON.stringify(next, null, 2) + "\n");
    console.log(`골든 갱신 → ${path.relative(process.cwd(), GOLDEN)}`);
  } else if (!fs.existsSync(GOLDEN)) {
    console.log("골든이 없습니다. 지금 결과가 맞다면: node scripts/replay.mjs --update-golden");
  }

  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("replay.mjs")) run();
