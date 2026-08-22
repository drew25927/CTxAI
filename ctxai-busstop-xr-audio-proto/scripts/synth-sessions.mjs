// 합성 세션 생성기 — 회귀 픽스처와 사양 검증용.
//
// 정류장_스크립트_v2.md §2-5 "판정 예시" 의 체험자 A·B·C 를 실제 시계열로
// 옮긴다. 문서가 말로 적어 둔 세 사람이 코드에서도 각각 로맨스·공포·
// 블랙코미디로 나오는지가 이 파일의 검증 목표다.
//
// 여기에 리허설에서 실제로 났던 오작동 네 가지도 픽스처로 넣는다
// (구현_리스크와_지원_필요사항.md §1-1):
//   입 가림 → 공포 오판 / 웃음 → 공포 오판 / 침묵 → 가짜 음성 점수 / 개구리 사각지대
//
//   node scripts/synth-sessions.mjs            fixtures/ 에 세션 파일을 쓴다
//   node scripts/synth-sessions.mjs --print    쓰지 않고 판정 결과만 출력

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROBES, PROBE_SET_ID, TOTAL_MS, BASELINE_MS } from "../lib/probes.js";
import { LANDMARK_IDS } from "../lib/behaviorCore.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "..", "fixtures");

const P = Object.fromEntries(PROBES.map((p) => [p.id, p]));
const endOf = (id) => P[id].onsetMs + P[id].windowMs;

// ── 요각 시계열 ────────────────────────────────────────────
// 키프레임 [{t, yaw, pitch}] 를 60fps 로 보간한다. 사람이 고개를 돌리는
// 속도는 유한하므로 계단이 아니라 램프로 잇는다.

// 자극이 시작되기 전까지는 자세를 유지하게 만든다.
//
// 키프레임을 손으로 적으면 이전 키에서 다음 키까지 계속 보간돼서, 개구리
// 소리가 나기 5초 전부터 이미 뒤를 돌아보고 있는 궤적이 만들어진다. 그러면
// 잠복시간(자극 후 몇 ms 만에 반응했나)이 측정되지 않는다 — 반응 잠복은
// 논문의 핵심 지표라 픽스처가 이걸 망가뜨리면 안 된다.
function holdUntilOnsets(keys) {
  const out = [...keys];
  for (const p of PROBES) {
    const t = p.onsetMs;
    if (out.some((k) => Math.abs(k.t - t) < 30)) continue;
    let prev = null;
    for (const k of out) if (k.t < t && (!prev || k.t > prev.t)) prev = k;
    const next = out.find((k) => k.t > t);
    if (!prev || !next) continue;
    out.push({ t, yaw: prev.yaw, pitch: prev.pitch || 0 });
  }
  return out.sort((a, b) => a.t - b.t);
}

function gazeFrom(rawKeys, fps = 60) {
  const keys = holdUntilOnsets(rawKeys);
  const out = [];
  const step = 1000 / fps;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    const n = Math.max(1, Math.round((b.t - a.t) / step));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      // 부드럽게 — 실제 고개 회전의 가감속에 가깝게
      const e = u * u * (3 - 2 * u);
      out.push({
        t: Math.round(a.t + (b.t - a.t) * u),
        yaw: Number((a.yaw + (b.yaw - a.yaw) * e).toFixed(2)),
        pitch: Number(((a.pitch || 0) + ((b.pitch || 0) - (a.pitch || 0)) * e).toFixed(2)),
      });
    }
  }
  out.push({ t: keys[keys.length - 1].t, yaw: keys[keys.length - 1].yaw, pitch: keys[keys.length - 1].pitch || 0 });
  return out;
}

// ── 웹캠 시계열 ────────────────────────────────────────────
// 얼굴 랜드마크는 판정에 요각을 쓰기로 했으므로(방식 B) 여기서는 표정과
// 유실 구간만 의미가 있다. 좌표는 정면 고정으로 두고, 표정 구간과
// faceLost 구간만 지정한다.

const at = (id) => LANDMARK_IDS.indexOf(id) * 3;
function faceFlat(dx = 0, dy = 0) {
  const f = new Array(LANDMARK_IDS.length * 3).fill(0);
  const w = 0.2, h = 0.15, cx = 0.5, cy = 0.5;
  const put = (id, x, y) => { const o = at(id); f[o] = x; f[o + 1] = y; f[o + 2] = 0; };
  put(234, cx - w / 2, cy); put(454, cx + w / 2, cy);
  put(10, cx, cy - h / 2); put(168, cx, cy + h / 2);
  put(1, cx + dx * w, cy + dy * h);
  return f;
}

/**
 * spans: [{from, to, bs?, lost?, dx?, dy?}] — 겹치지 않는 구간들.
 * 지정 안 된 시각은 무표정·정면·얼굴 있음.
 */
function samplesFrom(spans, fps = 30, totalMs = TOTAL_MS) {
  const out = [];
  const step = 1000 / fps;
  for (let t = 0; t <= totalMs; t += step) {
    const s = spans.find((x) => t >= x.from && t <= x.to);
    out.push({
      t: Math.round(t),
      lm: s?.lost ? null : faceFlat(s?.dx || 0, s?.dy || 0),
      bs: s?.bs || {},
      vis: s?.lost ? 0 : s?.vis ?? 0.95,
    });
  }
  return out;
}

// ── 체험자 A — 로맨스 (v2.md §2-5) ────────────────────────
// "우비 인물 잠깐 봄, 물보라 반응 작음, 개구리 미확인, 고양이 잠깐 본 뒤
//  정면 복귀, 포스터 무관심 → 공포·탐색 패턴 모두 불충분"
function participantA() {
  const g = gazeFrom([
    { t: 0, yaw: 0 }, { t: BASELINE_MS, yaw: 0 },
    // 포스터 — 무관심
    { t: endOf("poster"), yaw: 2 },
    // 우비 인물 — 잠깐 보고 돌아옴
    { t: 23500, yaw: -30 }, { t: 26000, yaw: -30 }, { t: 27500, yaw: -2 },
    { t: endOf("wiper"), yaw: 0 },
    // 트럭 — 반응 작음
    { t: 41200, yaw: -12 }, { t: 42500, yaw: 0 }, { t: endOf("truck"), yaw: 0 },
    // 개구리 — 미확인
    { t: endOf("frog"), yaw: 1 },
    // 고양이 — 잠깐 보고 정면 복귀
    { t: 58800, yaw: 40 }, { t: 59800, yaw: -20 }, { t: 61000, yaw: 0 },
    { t: endOf("cat"), yaw: 0 },
    // 두 번째 울음 — 반응 없음
    { t: TOTAL_MS, yaw: 0 },
  ]);
  return { gaze: g, samples: samplesFrom([]) };
}

// ── 체험자 B — 공포 (v2.md §2-5) ──────────────────────────
// "우비 인물 계속 추적, 물보라에 뒤로 뺌, 개구리 방향 즉시 확인, 고양이에
//  크게 놀람, 두 번째 울음 이후에도 왼쪽 반복 확인, 자세 경직"
function participantB() {
  const g = gazeFrom([
    { t: 0, yaw: 0 }, { t: BASELINE_MS, yaw: 0 },
    { t: endOf("poster"), yaw: 0 },
    // 우비 인물 — 창 내내 추적 (-38 → -14)
    { t: 23000, yaw: -38 }, { t: 30000, yaw: -26 }, { t: endOf("wiper"), yaw: -14 },
    // 트럭 — 보다가 급히 시선을 거두고 굳는다 (회피 + 느린 복귀)
    { t: 40400, yaw: 40 }, { t: 40900, yaw: -35, pitch: -12 },
    { t: endOf("truck"), yaw: -35, pitch: -12 },
    // 개구리 — 즉시 뒤를 확인, 오래 머물고 천천히 복귀
    { t: 49600, yaw: 135 }, { t: 53500, yaw: 130 }, { t: endOf("frog"), yaw: 120 },
    { t: 57000, yaw: 40 },
    // 고양이 — 크게 놀람
    { t: 58600, yaw: 65 }, { t: 60500, yaw: -60 }, { t: endOf("cat"), yaw: -70 },
    // 두 번째 울음 — 확인하고, 끝난 뒤에도 왼쪽을 반복 확인
    { t: 65800, yaw: -115 }, { t: 69000, yaw: -110 }, { t: endOf("cry2"), yaw: -95 },
    { t: 72000, yaw: -40 }, { t: 73200, yaw: -113 }, { t: 74500, yaw: -110 },
    { t: TOTAL_MS, yaw: -108 },
  ]);
  const s = samplesFrom([
    // 트럭·고양이에서 놀람 표정 — 학습된 표정 모델이 잡는 신호
    { from: 40300, to: 42500, bs: { eyeWideLeft: 0.72, eyeWideRight: 0.7, browInnerUp: 0.55 }, dy: -0.1 },
    // 개구리 — 뒤를 크게 돌아보는 동안 웹캠이 얼굴을 놓친다 (사각지대)
    { from: 49500, to: 55000, lost: true },
    { from: 58500, to: 61000, bs: { eyeWideLeft: 0.8, eyeWideRight: 0.78, browInnerUp: 0.6 } },
    { from: 65500, to: 71000, lost: true },
  ]);
  return { gaze: g, samples: s };
}

// ── 체험자 C — 블랙코미디 (v2.md §2-5) ────────────────────
// "우비 인물을 트럭 뒤에서 다시 찾음, 물보라에 움찔하지만 곧 안정,
//  개구리 위치 확인, 고양이 끝까지 추적+재확인, 포스터 읽으려 몸을 기울임"
function participantC() {
  const g = gazeFrom([
    { t: 0, yaw: 0 }, { t: BASELINE_MS, yaw: 0 },
    // 포스터 — 읽으려고 오래 본다 (2단계)
    { t: 10600, yaw: 72, pitch: 6 }, { t: 14200, yaw: 70, pitch: 7 },
    { t: endOf("poster"), yaw: 60 },
    { t: 18000, yaw: 5 },
    // 우비 인물 — 본다
    { t: 23000, yaw: -36 }, { t: 30000, yaw: -24 }, { t: endOf("wiper"), yaw: -16 },
    // 트럭 — 움찔하지만 곧 안정 (빠른 복귀)
    { t: 40500, yaw: 45 }, { t: 41400, yaw: 5 }, { t: endOf("truck"), yaw: 0 },
    // 트럭이 지나간 뒤 우비 인물을 다시 찾는다 ← 재확인
    { t: 45000, yaw: -16 }, { t: 47000, yaw: -15 }, { t: 48200, yaw: 0 },
    // 개구리 — 위치를 확인하고 곧 돌아온다
    { t: 49800, yaw: 133 }, { t: 51800, yaw: 135 }, { t: 53200, yaw: 20 },
    { t: endOf("frog"), yaw: 2 },
    // 고양이 — 끝까지 추적
    { t: 58600, yaw: 68 }, { t: 60500, yaw: -20 }, { t: endOf("cat"), yaw: -78 },
    // 사라진 쪽을 다시 확인 ← 재확인
    { t: 64200, yaw: -76 },
    // 두 번째 울음 — 확인하고 곧 안정
    { t: 65900, yaw: -114 }, { t: 67800, yaw: -113 }, { t: 69500, yaw: -20 },
    { t: endOf("cry2"), yaw: 0 },
    { t: 73000, yaw: -112 }, { t: 74000, yaw: -10 }, { t: TOTAL_MS, yaw: 0 },
  ]);
  const s = samplesFrom([
    { from: 41000, to: 43000, bs: { mouthSmileLeft: 0.55, mouthSmileRight: 0.5 } },
    { from: 59000, to: 63500, bs: { mouthSmileLeft: 0.82, mouthSmileRight: 0.8, cheekSquintLeft: 0.6 } },
  ]);
  return { gaze: g, samples: s };
}

// ── 리허설 회귀 픽스처 ─────────────────────────────────────

// 입을 손으로 가림 — 좌표가 흔들려도 공포로 판정되면 안 된다
function regMouthCovered() {
  const g = gazeFrom([{ t: 0, yaw: 0 }, { t: BASELINE_MS, yaw: 0 }, { t: TOTAL_MS, yaw: 3 }]);
  const s = samplesFrom([{ from: 20000, to: 60000, dx: 0.02, dy: 0.03, vis: 0.35 }]);
  // 손이 스치며 좌표가 튀는 프레임 몇 개
  for (const t of [24000, 24033, 37000, 37033, 51000]) {
    const i = s.findIndex((x) => x.t >= t);
    if (i >= 0) s[i] = { ...s[i], lm: faceFlat(4, 4) };
  }
  return { gaze: g, samples: s };
}

// 크게 웃음 — C 가 H 보다 커야 한다
function regLaughing() {
  const g = gazeFrom([
    { t: 0, yaw: 0 }, { t: BASELINE_MS, yaw: 0 },
    { t: 58800, yaw: 60 }, { t: 60500, yaw: -30 }, { t: endOf("cat"), yaw: -60 },
    { t: TOTAL_MS, yaw: 0 },
  ]);
  const s = samplesFrom([
    // 웃으면서 고개를 뒤로 젖힌다 — 예전에 "겁먹어서 뒤로 뺌"으로 오판되던 동작
    { from: 58500, to: 66000, bs: { mouthSmileLeft: 0.9, mouthSmileRight: 0.88, cheekSquintLeft: 0.7 }, dy: -0.25 },
  ]);
  return { gaze: g, samples: s };
}

// 완전 침묵·무반응 — 로맨스 디폴트로 떨어져야 하고, 음성 채널은 null 이어야 한다
function regSilent() {
  return {
    gaze: gazeFrom([{ t: 0, yaw: 0 }, { t: TOTAL_MS, yaw: 0 }]),
    samples: samplesFrom([]),
    voiceScores: null,
    textScores: null,
  };
}

// 개구리만 강하게 확인 — 사각지대 프로브가 실제로 잡히는지
function regFrogOnly() {
  const g = gazeFrom([
    { t: 0, yaw: 0 }, { t: BASELINE_MS, yaw: 0 }, { t: 49000, yaw: 0 },
    { t: 49700, yaw: 135 }, { t: 54000, yaw: 133 }, { t: endOf("frog"), yaw: 128 },
    { t: 57000, yaw: 10 }, { t: 60000, yaw: 130 }, { t: 62000, yaw: 128 },
    { t: TOTAL_MS, yaw: 20 },
  ]);
  const s = samplesFrom([{ from: 49500, to: 56000, lost: true }, { from: 59500, to: 62500, lost: true }]);
  return { gaze: g, samples: s };
}

export const SESSIONS = {
  "participant-a-romance": { build: participantA, expect: "R", note: "v2.md §2-5 체험자 A" },
  "participant-b-horror": { build: participantB, expect: "H", note: "v2.md §2-5 체험자 B" },
  "participant-c-comedy": { build: participantC, expect: "C", note: "v2.md §2-5 체험자 C" },
  "reg-mouth-covered": { build: regMouthCovered, expect: "notH", note: "리허설 버그 — 입 가림이 공포로 오판" },
  "reg-laughing": { build: regLaughing, expect: "C>H", note: "리허설 버그 — 웃음이 공포로 오판" },
  "reg-silent": { build: regSilent, expect: "R", note: "리허설 버그 — 침묵인데 점수가 나옴" },
  "reg-frog-only": { build: regFrogOnly, expect: "H", note: "개구리 사각지대 프로브가 잡히는가" },
};

/** 세션 하나를 JSONL 문자열로. app/probe 가 쓰는 형식과 동일해야 한다. */
export function toJsonl(name, built) {
  const lines = [];
  lines.push(JSON.stringify({
    type: "meta", sessionId: `synth_${name}`, probeSet: PROBE_SET_ID,
    totalMs: TOTAL_MS, synthetic: true, note: SESSIONS[name]?.note || "",
  }));
  for (const p of PROBES) {
    lines.push(JSON.stringify({
      type: "probe", id: p.id, onsetMs: p.onsetMs, windowMs: p.windowMs,
      azimuth: p.azimuth, radius: p.radius, modality: p.modality,
    }));
  }
  for (const g of built.gaze) lines.push(JSON.stringify({ type: "gaze", ...g }));
  for (const s of built.samples) lines.push(JSON.stringify({ type: "frame", ...s }));
  lines.push(JSON.stringify({
    type: "label", expect: SESSIONS[name]?.expect ?? null, selfReport: null, synthetic: true,
  }));
  return lines.join("\n") + "\n";
}

if (process.argv[1] && process.argv[1].endsWith("synth-sessions.mjs")) {
  fs.mkdirSync(FIXTURES, { recursive: true });
  for (const [name, spec] of Object.entries(SESSIONS)) {
    const built = spec.build();
    // gzip 으로 저장한다 — 랜드마크 시계열이 세션당 ~950KB 라 그대로 커밋하면
    // 저장소가 금방 무거워진다. scripts/replay.mjs 가 .gz 를 그대로 읽는다.
    const file = path.join(FIXTURES, `${name}.jsonl.gz`);
    fs.writeFileSync(file, zlib.gzipSync(Buffer.from(toJsonl(name, built)), { level: 9 }));
    const kb = (fs.statSync(file).size / 1024).toFixed(0);
    console.log(`${name.padEnd(24)} gaze ${String(built.gaze.length).padStart(5)} · frame ${String(built.samples.length).padStart(5)} · ${kb} KB`);
  }
  console.log(`\n→ ${FIXTURES}`);
}
