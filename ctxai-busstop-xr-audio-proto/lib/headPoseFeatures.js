// 헤드 포즈 파생 피처 — 사건(프로브)마다 6개, 세션당 6개(사건 평균)로 줄여 판정 가중치 피팅에 쓴다.
//
// 지금 판정(lib/headPoseSense.js)은 "돌아봤나·얼마나 봤나" 위주라 놀라서 홱 도는 것과 얼어붙는 것을
// 가르지 못한다. 아래 피처는 전부 원시 헤드 포즈 시계열(30Hz, 센서 시간 기준)에서 다시 계산할 수 있어서,
// 정의를 고쳐도 파일럿을 다시 돌리지 않고 scripts/fit-judging.mjs 로 재계산한다.
//
//   flinch_peak  자극 후 0~1.2초 각속도(yaw·pitch 합성) 최대값, °/s             — 놀람 강도
//   freeze_dur   자극 후 0.3~4초에서 각속도 5°/s 미만이 이어진 가장 긴 구간, 초   — 공포 vs 코미디
//   return_lat   자극 쪽(±20°)을 처음 본 뒤 정면(기준선 ±15°)으로 돌아오기까지, 초 — 공포 느림 / 코미디 빠름
//                (못 돌아오면 관찰 창 끝까지 = 상한, 아예 안 봤으면 null)
//   revisit_n    자극이 끝난 뒤 5초 안에 그 방향 ±20° 로 다시 들어간 횟수         — 과경계
//   lean         자극 전 2초 대비 후 4초의 머리 앞뒤 위치 차, m (앞으로 +)        — 로맨스 기울임 / 회피
//   scan_ent     자극 후 8초 방위각 히스토그램(15° 칸) 엔트로피, 0~1              — 불안한 두리번거림
//
// 임계값(5°/s, ±15°, ±20°, 창 길이)은 위 정의 그대로의 고정값이다 — 피팅 대상은 피처 가중치이지 이 숫자가 아니다.

export const FEATURE_NAMES = ["flinch_peak", "freeze_dur", "return_lat", "revisit_n", "lean", "scan_ent"];
export const RAW_HZ = 30;

const FLINCH_WIN = 1.2;
const FREEZE_FROM = 0.3, FREEZE_TO = 4, FREEZE_VEL = 5;
const LOOK_DEG = 20, FRONT_DEG = 15, RETURN_MAX = 8;
const REVISIT_WIN = 5;
const LEAN_BEFORE = 2, LEAN_AFTER = 4;
const SCAN_WIN = 8, SCAN_BIN = 15;

function angDiff(a, b) { return Math.abs(((a - b) % 360 + 540) % 360 - 180); }

/** 원시 기록(열 단위, 정수 압축)을 [{t, yaw, pitch, z}] 로 푼다. */
export function unpackRaw(raw) {
  if (!raw?.yaw?.length) return [];
  const dt = 1 / (raw.hz || RAW_HZ);
  const out = new Array(raw.yaw.length);
  for (let i = 0; i < raw.yaw.length; i++) {
    out[i] = { t: (raw.t0 || 0) + i * dt, yaw: raw.yaw[i] / 10, pitch: (raw.pitch?.[i] ?? 0) / 10, z: (raw.z?.[i] ?? 0) / 1000 };
  }
  return out;
}

/** 각속도 °/s (yaw·pitch 합성). 프레임 간 떨림이 속도를 부풀리지 않게 0.1초(3표본) 간격으로 잰다. */
const SPEED_SPAN = 3;
function speeds(samples) {
  const v = new Array(samples.length).fill(0);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i], b = samples[Math.max(0, i - SPEED_SPAN)];
    const dt = Math.max(a.t - b.t, 1e-3);
    v[i] = Math.hypot(angDiff(a.yaw, b.yaw), a.pitch - b.pitch) / dt;
  }
  return v;
}

const between = (samples, from, to) => {
  const idx = [];
  for (let i = 0; i < samples.length; i++) if (samples[i].t >= from && samples[i].t <= to) idx.push(i);
  return idx;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * 사건 하나의 피처.
 * @param {Array<{t,yaw,pitch,z}>} samples  센서 시간 기준 30Hz 표본
 * @param {{name, azimuth, start, end, kind?}} probe  센서 시간 기준 시작·끝
 * @param {number} frontYaw  기준선 정면 방위(°)
 */
export function probeFeatures(samples, probe, frontYaw = 0) {
  const v = speeds(samples);
  const t0 = probe.start, az = probe.azimuth;

  const flinchIdx = between(samples, t0, t0 + FLINCH_WIN);
  const flinch_peak = flinchIdx.length ? Math.max(...flinchIdx.map((i) => v[i])) : null;

  let freeze_dur = 0, run = 0, prevT = null;
  for (const i of between(samples, t0 + FREEZE_FROM, t0 + FREEZE_TO)) {
    const dt = prevT == null ? 0 : samples[i].t - prevT;
    prevT = samples[i].t;
    if (v[i] < FREEZE_VEL) { run += dt; freeze_dur = Math.max(freeze_dur, run); } else run = 0;
  }
  if (!between(samples, t0 + FREEZE_FROM, t0 + FREEZE_TO).length) freeze_dur = null;

  // 복귀 지연 — 자극 쪽을 처음 본 시각부터, 정면 ±15°에 들어오기까지 (관찰 창: 자극 끝 + RETURN_MAX)
  let return_lat = null;
  const watch = between(samples, t0, (probe.end ?? t0) + RETURN_MAX);
  let lookAt = null;
  for (const i of watch) {
    const s = samples[i];
    if (lookAt == null) { if (angDiff(s.yaw, az) <= LOOK_DEG) lookAt = s.t; continue; }
    if (angDiff(s.yaw, frontYaw) <= FRONT_DEG) { return_lat = s.t - lookAt; break; }
  }
  if (lookAt != null && return_lat == null) return_lat = Math.max(0, samples[watch[watch.length - 1]].t - lookAt);
  // 자극 방향이 정면 근처(±20° 안)면 "돌아봤다가 복귀"를 정의할 수 없다
  if (angDiff(az, frontYaw) <= LOOK_DEG) return_lat = null;

  let revisit_n = 0, inside = null;
  for (const i of between(samples, probe.end ?? t0, (probe.end ?? t0) + REVISIT_WIN)) {
    const now = angDiff(samples[i].yaw, az) <= LOOK_DEG;
    if (inside === false && now) revisit_n++;
    inside = now;
  }

  const zb = mean(between(samples, t0 - LEAN_BEFORE, t0).map((i) => samples[i].z));
  const za = mean(between(samples, t0, t0 + LEAN_AFTER).map((i) => samples[i].z));
  const lean = zb == null || za == null ? null : zb - za; // z 는 뒤로 + 라서, 앞으로 기울면 +

  const bins = new Array(Math.round(360 / SCAN_BIN)).fill(0);
  const scanIdx = between(samples, t0, t0 + SCAN_WIN);
  for (const i of scanIdx) {
    const y = ((samples[i].yaw - frontYaw) % 360 + 360) % 360;
    bins[Math.min(bins.length - 1, Math.floor(y / SCAN_BIN))]++;
  }
  let scan_ent = null;
  if (scanIdx.length) {
    let h = 0;
    for (const c of bins) if (c) { const p = c / scanIdx.length; h -= p * Math.log(p); }
    scan_ent = h / Math.log(bins.length);
  }

  const r = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
  return { name: probe.name, kind: probe.kind || null, azimuth: az,
    flinch_peak: r(flinch_peak, 1), freeze_dur: r(freeze_dur), return_lat: r(return_lat), revisit_n, lean: r(lean, 4), scan_ent: r(scan_ent) };
}

/** 세션의 모든 사건 피처. */
export function sessionProbeFeatures(samples, probes, frontYaw = 0) {
  return (probes || []).map((p) => probeFeatures(samples, p, frontYaw));
}

/** 세션당 피처 벡터 6개 — 사건 평균(값이 없는 사건은 건너뜀). 전부 없으면 null. */
export function sessionVector(probeFeats) {
  const out = {};
  for (const f of FEATURE_NAMES) {
    const xs = (probeFeats || []).map((p) => p[f]).filter((x) => x != null && Number.isFinite(x));
    out[f] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }
  return out;
}
