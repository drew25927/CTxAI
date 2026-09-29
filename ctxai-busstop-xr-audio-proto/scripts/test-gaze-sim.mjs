// 합성 관객(lib/gazeSim.js) 회귀 테스트 — node scripts/test-gaze-sim.mjs
// 세 프로필을 /interim·/film 타임라인 위에서 돌려 센서 → 관객 응답 모델 θ̂ 가 의도한 순서로 갈리는지,
// 같은 시드가 같은 궤적을 재현하는지, 자세값이 물리적으로 말이 되는 범위인지 본다.
import assert from "node:assert/strict";
import { createGazeSim, GAZE_PROFILE_NAMES, GAZE_PROFILES, isGazeProfile, SEAT_Y, TALK } from "../lib/gazeSim.js";
import { answerWatchStart, answerWatchUpdate, answerWatchResult, beatOf, playsLine, nextPlayedBeat, subtitleHoldSec, splitLead, dialogueQuiet } from "../lib/dialogueBeats.js";
import { DIALOGUE_V2_LINES } from "../lib/dialogueV2Lines.js";
import { createEngagementSensor } from "../lib/engagementSense.js";
import { fitViewerModel } from "../lib/viewerModel.js";
import { CUES as INTERIM_CUES, T as IT } from "../lib/interimTimeline.js";
import { probeFor, INTERIM_PROBES } from "../lib/interimProbes.js";
import { CUES as FILM_CUES, T as FT } from "../lib/filmTimeline.js";
import { createHeadPoseSensor } from "../lib/headPoseSense.js";
import { createDirectionState, rank } from "../lib/directionState.js";
import { createStandUpSensor } from "../lib/standUpSense.js";
import { gradeS1FromHeadPose, gradeS3FromHeadPose, gradeS5FromHeadPose } from "../lib/interimGrader.js";
import { judge } from "../lib/interimJudge.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

const DT = 1 / 60;

// /interim 다섯 사건을 예정 탐침으로 (영화 초 기준)
const INTERIM_PROBE_LIST = INTERIM_CUES.filter((c) => INTERIM_PROBES[c.name]).map((c) => ({ t: c.t, name: c.name, ...INTERIM_PROBES[c.name] }));
// /film 도입부 사건(sense 있는 큐)
const FILM_PROBE_LIST = FILM_CUES.filter((c) => c.sense).map((c) => ({ t: c.t, name: c.name, azimuth: c.sense.azimuth, dur: c.sense.dur, kind: c.sense.kind, channel: c.sfx ? "audio" : "av" }));

/** 합성 관객을 센서에 먹여 끝까지 돌린다. 예정 탐침은 sim 과 센서 양쪽에 같은 시각에 들어간다. */
function runInterim(profile, { seed = 1, until = IT.end, speed = 1 } = {}) {
  const sim = createGazeSim(profile, { seed, probes: INTERIM_PROBE_LIST, speed });
  const eng = createEngagementSensor({});
  const fired = new Set();
  const poses = [];
  for (let t = 0; t < until; t += DT * speed) {
    for (const c of INTERIM_CUES) if (!fired.has(c.name) && t >= c.t) { fired.add(c.name); const p = probeFor(c.name, speed); if (p) eng.beginStimulus(p); }
    const pose = sim.step(t, DT);
    poses.push(pose);
    eng.update(pose, DT);
  }
  const data = eng.data();
  return { sim, data, theta: fitViewerModel(data.stimuli), poses };
}

function runFilm(profile, { seed = 1, until = 75 } = {}) {
  const sim = createGazeSim(profile, { seed, probes: FILM_PROBE_LIST });
  const eng = createEngagementSensor({});
  const fired = new Set();
  for (let t = 0; t < until; t += DT) {
    for (const c of FILM_CUES) if (!fired.has(c.name) && t >= c.t && c.sense) { fired.add(c.name); eng.beginStimulus({ name: c.name, azimuth: c.sense.azimuth, dur: c.sense.dur, kind: c.sense.kind, channel: c.sfx ? "audio" : "av", dose: c.volume ?? null, tail: 4 }); }
    eng.update(sim.step(t, DT), DT);
  }
  const data = eng.data();
  return { data, theta: fitViewerModel(data.stimuli) };
}

test("프로필 이름 — fearful·curious·calm 세 개, 모르는 이름은 거부", () => {
  assert.deepEqual([...GAZE_PROFILE_NAMES].sort(), ["calm", "curious", "fearful"]);
  assert.ok(isGazeProfile("fearful")); assert.ok(!isGazeProfile("bold")); assert.ok(!isGazeProfile(undefined));
  assert.throws(() => createGazeSim("bold"), /알 수 없는 합성 관객 프로필/);
  for (const p of GAZE_PROFILE_NAMES) assert.ok(GAZE_PROFILES[p].label, p);
});

test("/interim 타임라인: θ̂ 이득 순서 fearful > curious > calm, 응답 수도 같은 순서", () => {
  const F = runInterim("fearful"), U = runInterim("curious"), C = runInterim("calm");
  for (const r of [F, U, C]) assert.equal(r.data.stimuli.length, 5, "탐침 5개가 모두 닫힌다");
  assert.ok(F.theta.g > U.theta.g, `g fearful ${F.theta.g} > curious ${U.theta.g}`);
  assert.ok(U.theta.g > C.theta.g, `g curious ${U.theta.g} > calm ${C.theta.g}`);
  assert.ok(F.theta.nResp >= U.theta.nResp && U.theta.nResp >= C.theta.nResp, `nResp ${F.theta.nResp}/${U.theta.nResp}/${C.theta.nResp}`);
  assert.ok(F.theta.confidence >= 0.6, `fearful 확신 ${F.theta.confidence}`);
  assert.ok(C.theta.confidence < F.theta.confidence, `calm 확신 ${C.theta.confidence} < fearful ${F.theta.confidence}`);
});

test("/interim: 공포형은 뒤로 물러나고(개구리) 벌떡 일어나며, 차분형은 순간 사건에 거의 반응하지 않는다", () => {
  const F = runInterim("fearful"), C = runInterim("calm");
  const frogF = F.data.stimuli.find((s) => s.name === "frog"), frogC = C.data.stimuli.find((s) => s.name === "frog");
  assert.ok(frogF.retreat >= 0.07, `fearful frog retreat ${frogF.retreat}`);
  assert.ok(frogC.retreat < 0.01, `calm frog retreat ${frogC.retreat}`);
  assert.ok(Math.max(...F.poses.map((p) => p.y)) > SEAT_Y + 0.25, "공포형은 개구리에 벌떡 일어난다");
  assert.ok(Math.max(...C.poses.map((p) => p.y)) < SEAT_Y + 0.02, "차분형은 앉아 있다");
  const posterC = C.data.stimuli.find((s) => s.name === "poster");
  assert.equal(posterC.responded, 0, "차분형은 포스터를 안 본다");
  const figC = C.data.stimuli.find((s) => s.name === "figureApproach");
  assert.ok(figC.lookSec >= 3, `차분형은 인물을 지속 관찰 ${figC.lookSec}s`);
});

test("같은 시드는 같은 궤적, 다른 시드는 (공포형 재확인 시점이) 달라진다", () => {
  const a = runInterim("fearful", { seed: 7 }), b = runInterim("fearful", { seed: 7 }), c = runInterim("fearful", { seed: 8 });
  assert.deepEqual(a.poses.slice(0, 3000), b.poses.slice(0, 3000));
  assert.deepEqual(a.theta, b.theta);
  assert.ok(a.poses.some((p, i) => Math.abs(p.yaw - c.poses[i].yaw) > 1), "시드가 다르면 궤적이 다르다");
});

test("자세값 범위 — NaN 없음, |yaw| ≤ 180, |pitch| ≤ 30, 0 ≤ z ≤ 0.2, 앉은 높이 ± 0.5m, 프레임 각속도 < 900°/s", () => {
  for (const p of GAZE_PROFILE_NAMES) {
    const { poses } = runInterim(p);
    let prev = null;
    for (const q of poses) {
      for (const k of ["yaw", "pitch", "roll", "x", "y", "z"]) assert.ok(Number.isFinite(q[k]), `${p} ${k}`);
      assert.ok(Math.abs(q.yaw) <= 180 && Math.abs(q.pitch) <= 30, `${p} yaw ${q.yaw} pitch ${q.pitch}`);
      assert.ok(q.z >= 0 && q.z <= 0.2, `${p} z ${q.z}`);
      assert.ok(q.y >= SEAT_Y - 0.5 && q.y <= SEAT_Y + 0.5, `${p} y ${q.y}`);
      if (prev) assert.ok(Math.abs(q.yaw - prev.yaw) / DT < 900, `${p} 각속도 ${Math.abs(q.yaw - prev.yaw) / DT}`);
      prev = q;
    }
  }
});

test("조용할 때(자극 없음 10초): 잔움직임 fearful > curious > calm, 차분형은 거의 정지", () => {
  const rms = {};
  for (const p of GAZE_PROFILE_NAMES) {
    const sim = createGazeSim(p, { seed: 3 });
    const eng = createEngagementSensor({});
    for (let t = 0; t < 10; t += DT) eng.update(sim.step(t, DT), DT);
    const w = eng.data().windows;
    rms[p] = w.reduce((a, x) => a + x.angVelRms, 0) / w.length;
  }
  assert.ok(rms.fearful > rms.curious && rms.curious > rms.calm, JSON.stringify(rms));
  assert.ok(rms.calm < 3, `calm angVelRms ${rms.calm}`);
  assert.ok(rms.fearful < 40, `fearful angVelRms ${rms.fearful} — 산만함으로 오인될 만큼 크면 안 된다`);
});

test("trigger() 경로 == 예정 탐침 경로 (같은 시드·같은 시각에 발동하면 같은 궤적)", () => {
  const a = createGazeSim("curious", { seed: 5, probes: INTERIM_PROBE_LIST });
  const b = createGazeSim("curious", { seed: 5 });
  const fired = new Set();
  let maxDiff = 0;
  for (let t = 0; t < 60; t += DT) {
    for (const p of INTERIM_PROBE_LIST) if (!fired.has(p.name) && t >= p.t) { fired.add(p.name); b.trigger({ name: p.name, azimuth: p.azimuth, dur: p.dur, kind: p.kind, channel: p.channel }); }
    const pa = a.step(t, DT), pb = b.step(t, DT);
    maxDiff = Math.max(maxDiff, Math.abs(pa.yaw - pb.yaw));
  }
  assert.ok(maxDiff < 1e-9, `maxDiff ${maxDiff}`);
  assert.equal(b.triggered.length, INTERIM_PROBE_LIST.filter((p) => p.t < 60).length);
});

test("setRest: 옆사람 방위를 주면 쉴 때 그쪽(× restFactor)을 본다 — 호기심형이 차분형보다, 차분형이 공포형보다 많이 돌린다", () => {
  const mean = {};
  for (const p of GAZE_PROFILE_NAMES) {
    const sim = createGazeSim(p, { seed: 2 });
    sim.setRest(60);
    let sum = 0, cnt = 0;
    for (let t = 0; t < 20; t += DT) { const q = sim.step(t, DT); if (t > 10) { sum += q.yaw; cnt++; } }
    mean[p] = sum / cnt;
  }
  assert.ok(mean.curious > mean.calm && mean.calm > mean.fearful, JSON.stringify(mean));
  assert.ok(Math.abs(mean.calm - 60 * GAZE_PROFILES.calm.restFactor) < 3, `calm 평균 ${mean.calm}`);
});

// B67 — 옆사람이 말하는 동안은 화자를 본다. /film 의 옆사람은 방위 ≈ 87°(벤치 같은 줄)이고 쉬는 방위는 63° 상한이다.
const NPC_AZ = 87, REST_CAP = 63;
test("B67 말하는 동안: 세 프로필 모두 방위의 max(restFactor, TALK.factor) 를 본다 — 공포형 22° → 57°, 화자가 가로 시야(±46°) 안에 든다", () => {
  const HALF_HFOV = 45.8; // 1600×900, 세로 fov 60°
  for (const p of GAZE_PROFILE_NAMES) {
    const sim = createGazeSim(p, { seed: 4 });
    let restSum = 0, restN = 0, talkSum = 0, talkN = 0, talkMaxErr = 0;
    const talkTarget = REST_CAP * Math.max(GAZE_PROFILES[p].restFactor, TALK.factor);
    for (let t = 0; t < 20; t += DT) {
      sim.setRest(REST_CAP, { talk: t >= 10 });
      const q = sim.step(t, DT);
      if (t > 6 && t < 10) { restSum += q.yaw; restN++; }
      if (t > 11.5) { talkSum += q.yaw; talkN++; talkMaxErr = Math.max(talkMaxErr, Math.abs(q.yaw - talkTarget)); }
    }
    const rest = restSum / restN, talk = talkSum / talkN;
    assert.ok(Math.abs(talk - talkTarget) < 3, `${p} 말하는 동안 평균 ${talk.toFixed(1)}° (목표 ${talkTarget.toFixed(1)}°)`);
    assert.ok(talkMaxErr < 6, `${p} 말하는 동안 목표에서 ${talkMaxErr.toFixed(1)}° 까지 벗어남 — 호기심형 두리번(±25°)은 멈춰야 한다`);
    assert.ok(NPC_AZ - talk < HALF_HFOV - 10, `${p} 화자가 화면 가장자리에서 10° 이상 안쪽 (${(NPC_AZ - talk).toFixed(1)}°)`);
    if (p === "fearful") {
      assert.ok(Math.abs(rest - REST_CAP * GAZE_PROFILES.fearful.restFactor) < 3, `공포형 쉴 때 ${rest.toFixed(1)}°`);
      assert.ok(NPC_AZ - rest > HALF_HFOV, `공포형 쉴 때는 화자가 화면 밖 (${(NPC_AZ - rest).toFixed(1)}°) — 고치기 전 상태`);
    }
  }
});

test("B67 talk 을 주지 않으면 종전 궤적과 같다 (setRest(az) == setRest(az, {talk:false}))", () => {
  for (const p of GAZE_PROFILE_NAMES) {
    const a = createGazeSim(p, { seed: 9 }), b = createGazeSim(p, { seed: 9 });
    let maxDiff = 0;
    for (let t = 0; t < 15; t += DT) { a.setRest(REST_CAP); b.setRest(REST_CAP, { talk: false }); maxDiff = Math.max(maxDiff, Math.abs(a.step(t, DT).yaw - b.step(t, DT).yaw)); }
    assert.equal(maxDiff, 0, p);
    assert.equal(b.talking, false);
  }
});

test("B67 가짜 응답 없음: 줄 시작에 화자 쪽으로 돌아도 질문 뒤 기다림(answerWatch)이 끄덕임·돌림·가로젓기로 읽지 않는다 — 3 프로필 × 시드 1~8 × 줄 길이 0.8~4s", () => {
  // talk 없음(B67 이전)도 같이 돌려 센다 — 호기심형의 두리번(±25°)이 화자 50° 안에서 12° 넘게 움직이면 "가로젓기" 로 읽혀
  // 가짜 응답이 났다. 말하는 동안 두리번을 멈추는 것이 그것도 막는다.
  const fake = { true: [], false: [] };
  for (const p of GAZE_PROFILE_NAMES) for (let seed = 1; seed <= 8; seed++) for (const lineSec of [0.8, 1.5, 2.5, 4]) for (const talkOn of [true, false]) {
    const sim = createGazeSim(p, { seed });
    let t = 0, q = null;
    for (; t < 8; t += DT) { sim.setRest(REST_CAP); q = sim.step(t, DT); }                        // 쉬는 중(곁눈질)
    for (const end = t + lineSec; t < end; t += DT) { sim.setRest(REST_CAP, { talk: talkOn }); q = sim.step(t, DT); } // 줄 재생
    const w = answerWatchStart(q.yaw, q.pitch, NPC_AZ);
    for (const end = t + 3; t < end; t += DT) { sim.setRest(REST_CAP, { talk: talkOn }); q = sim.step(t, DT); answerWatchUpdate(w, q.yaw, q.pitch); } // 질문 뒤 기다림 3초
    const r = answerWatchResult(w);
    if (r.answered) fake[talkOn].push(`${p}/s${seed}/${lineSec}s:${r.how}(yaw 폭 ${(w.yawMax - w.yawMin).toFixed(1)}°)`);
  }
  console.log(`    가짜 응답 — talk 켬 ${fake.true.length}/96 · talk 끔(B67 이전) ${fake.false.length}/96 ${fake.false.slice(0, 4).join(" ")}`);
  assert.equal(fake.true.length, 0, fake.true.join(" "));
});

// B118 — 자막 창과 화자 보기 창. /film 공포 트랙 대사 장면(버스 전 12줄, 질문 무응답 갈래)을 runScene 의 순서대로 시간표로 펴서
// 합성 관객을 돌리고, 자막이 떠 있는 표본 중 화자가 화면 안(|옆사람 방위 − yaw| ≤ 40°)인 비율을 센다.
// 줄마다 말 길이(초)는 B21 ON 녹화 세션(work/evidence/b21/sessions/on-2026-09-29T17-22-40-716Z_H.json)의 talk 구간에서 질문 기다림을 뺀 값.
// 정책 "b67": 보는 창 = 말하는 동안(+질문 기다림), 자막 = 다음 줄이 뜰 때까지(B118 이전 페이지).
// 정책 "b118": 보는 창 = 줄 앞 lookLead 초 + 말하는 동안 + 자막 유지(subtitleHoldSec), 자막 = 말 끝 + 유지 시간(다음 줄이 뜨면 덮임).
const H_AUDIO = { "01": 2.6, "02": 3.3, "03": 3.0, "04": 2.8, "05": 2.5, "06": 4.3, "08": 1.2, "09": 2.6, "10": 1.6, "11": 1.1, "12": 2.9, "13": 1.6 };
function sceneSchedule(policy, gap) {
  const lines = DIALOGUE_V2_LINES.filter((l) => l.genre === "H");
  const subs = [], looks = [], asks = [];
  const lead = (w) => { const [r, l] = splitLead(w); t += r; looks.push([t, t + l]); t += l; };
  let t = 5; // 장면 전 5초는 쉬는 자세(곁눈질)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], b = beatOf(l);
    if (!playsLine(b, false)) continue;
    if (b.atBus) break;
    if (b.before) { if (policy === "b118") lead(b.before); else t += b.before; }
    const from = t;
    t += H_AUDIO[l.seq];
    if (b.to === "ask") { asks.push([t, t + (b.wait ?? 2.5)]); t += b.wait ?? 2.5; }
    looks.push([from, t]);
    if (policy === "b118") { const hold = subtitleHoldSec(l.text, t - from); subs.push({ from, to: t + hold }); looks.push([t, t + hold]); }
    else subs.push({ from, to: null });
    if (b.after) t += b.after;
    const nb = nextPlayedBeat(lines, i, false);
    if (policy === "b118" && nb && !nb.atBus && !nb.before) lead(gap); else t += gap;
  }
  subs.forEach((x, k) => { const next = subs[k + 1]?.from ?? t; x.to = x.to == null ? next : Math.min(x.to, next); });
  return { subs, looks, asks, end: t };
}
// micro: null(미세 자극 없음) | "every"(12초마다 무조건 — B118 이전) | "quiet"(12초 간격 + dialogueQuiet 가 허락할 때만 — B118)
const MICRO_EVERY = 12;
function runSceneView(profile, seed, policy, gap, micro = null) {
  const sch = sceneSchedule(policy, gap);
  const sim = createGazeSim(profile, { seed });
  const lookStarts = sch.looks.map(([a]) => a).sort((a, b) => a - b);
  let inSub = 0, nSub = 0, w = null, wAsk = null, lastMicro = -Infinity, micros = 0;
  const fake = [];
  for (let t = 0; t < sch.end; t += DT) {
    const looking = sch.looks.some(([a, b]) => t >= a && t < b);
    if (micro && t - lastMicro >= MICRO_EVERY && t > 5) {
      const quietUntil = lookStarts.find((a) => a > t) ?? Infinity;
      if (micro === "every" || dialogueQuiet({ talking: looking, lookAhead: false, lookUntil: -1, quietUntil }, t)) {
        sim.trigger({ name: `micro-${++micros}`, azimuth: -60, dur: 1.5, kind: "probe", channel: "audio" }); lastMicro = t;
      }
    }
    sim.setRest(REST_CAP, { talk: looking });
    const q = sim.step(t, DT);
    if (sch.subs.some((x) => t >= x.from && t < x.to)) { nSub++; if (Math.abs(NPC_AZ - q.yaw) <= 40) inSub++; }
    const ask = sch.asks.find(([a, b]) => t >= a && t < b);
    if (ask && ask !== wAsk) { w = answerWatchStart(q.yaw, q.pitch, NPC_AZ); wAsk = ask; }
    else if (ask) answerWatchUpdate(w, q.yaw, q.pitch);
    else if (w) { const r = answerWatchResult(w); if (r.answered) fake.push(r.how); w = null; }
  }
  return { ratio: inSub / nSub, subSec: sch.subs.reduce((a, x) => a + x.to - x.from, 0), fake, micros };
}
test("B118 자막이 떠 있는 동안 화자가 화면 안 ≥ 90% — 공포 트랙 대사 장면 · 3 프로필 × 시드 1~8 × 줄 사이 침묵 0.4/1.2/2.2s, 질문 기다림 가짜 응답 0", () => {
  const stat = { b67: { min: 1, sum: 0, n: 0, worst: "" }, b118: { min: 1, sum: 0, n: 0, worst: "", fake: [] } };
  for (const policy of ["b67", "b118"]) for (const p of GAZE_PROFILE_NAMES) for (let seed = 1; seed <= 8; seed++) for (const gap of [0.4, 1.2, 2.2]) {
    const r = runSceneView(p, seed, policy, gap), st = stat[policy];
    st.sum += r.ratio; st.n++;
    if (r.ratio < st.min) { st.min = r.ratio; st.worst = `${p}/s${seed}/침묵 ${gap}s`; }
    if (policy === "b118") st.fake.push(...r.fake.map((h) => `${p}/s${seed}/${gap}:${h}`));
  }
  const f = (st) => `최저 ${Math.round(st.min * 100)}% (${st.worst}) · 평균 ${Math.round((st.sum / st.n) * 100)}%`;
  console.log(`    자막이 떠 있는 동안 화자가 화면 안 — B118 이전 ${f(stat.b67)} → B118 ${f(stat.b118)}`);
  const fearful = { b67: runSceneView("fearful", 1, "b67", 1.2), b118: runSceneView("fearful", 1, "b118", 1.2) };
  console.log(`    공포형 seed 1 침묵 1.2s: 자막 합 ${fearful.b67.subSec.toFixed(1)}s ${Math.round(fearful.b67.ratio * 100)}% → ${fearful.b118.subSec.toFixed(1)}s ${Math.round(fearful.b118.ratio * 100)}%`);
  assert.ok(stat.b118.min >= 0.9, `B118 최저 ${stat.b118.min.toFixed(3)} (${stat.b118.worst})`);
  assert.ok(fearful.b67.ratio < 0.6, `B118 이전 공포형이 이미 ${fearful.b67.ratio.toFixed(2)} — 시간표 모형이 페이지와 다르다`);
  assert.equal(stat.b118.fake.length, 0, `가짜 응답 ${stat.b118.fake.join(" ")}`);
});

test("B118 미세 자극은 대사를 밟지 않는다 — 12초마다 울려도 dialogueQuiet 가 막으면 자막 창 비율 ≥ 90%, 가짜 응답 0, 장면에서 2번 이상은 울린다", () => {
  const st = { every: { min: 1, worst: "" }, quiet: { min: 1, worst: "", minMicro: Infinity, fake: [] } };
  for (const mode of ["every", "quiet"]) for (const p of GAZE_PROFILE_NAMES) for (let seed = 1; seed <= 8; seed++) for (const gap of [0.4, 1.2, 2.2]) {
    const r = runSceneView(p, seed, "b118", gap, mode), x = st[mode];
    if (r.ratio < x.min) { x.min = r.ratio; x.worst = `${p}/s${seed}/침묵 ${gap}s`; }
    if (mode === "quiet") { x.minMicro = Math.min(x.minMicro, r.micros); x.fake.push(...r.fake.map((h) => `${p}/s${seed}/${gap}:${h}`)); }
  }
  console.log(`    미세 자극 12초마다 — 막지 않으면 최저 ${Math.round(st.every.min * 100)}% (${st.every.worst}) · dialogueQuiet 로 막으면 최저 ${Math.round(st.quiet.min * 100)}% (${st.quiet.worst}), 장면 중 울린 수 최소 ${st.quiet.minMicro}`);
  assert.ok(st.quiet.min >= 0.9, `막았는데 최저 ${st.quiet.min.toFixed(3)} (${st.quiet.worst})`);
  assert.ok(st.quiet.minMicro >= 2, `장면 중 미세 자극이 ${st.quiet.minMicro}번뿐 — 조용한 창이 너무 좁다`);
  assert.equal(st.quiet.fake.length, 0, st.quiet.fake.join(" "));
});

test("/film 도입부(t=60s 까지): 공포형 θ̂ 확신 ≥ 60%, 세 프로필 이득 순서 유지", () => {
  const F = runFilm("fearful", { until: 60 }), U = runFilm("curious", { until: 60 }), C = runFilm("calm", { until: 60 });
  assert.ok(F.data.stimuli.length >= 5, `닫힌 탐침 ${F.data.stimuli.length}`);
  assert.ok(F.theta.confidence >= 0.6, `fearful 확신 ${F.theta.confidence} (응답 ${F.theta.nResp}/${F.theta.n})`);
  assert.ok(F.theta.g > U.theta.g && U.theta.g > C.theta.g, `g ${F.theta.g} / ${U.theta.g} / ${C.theta.g}`);
});

// 팀 판정 경로(headPoseSense → directionState / interimGrader → judge)에 합성 관객을 넣었을 때의 장르 — 1배속.
// 배속 관찰에서는 센서의 응시·회복 임계값(초)이 실제 초 기준이라 판정이 코미디 쪽으로 쏠린다(배속 인공물).
function filmGenre(profile) {
  const d = createDirectionState(); const s = createHeadPoseSensor({ push: d.pushEvidence, mark: d.markEvent });
  const sim = createGazeSim(profile, { seed: 1, probes: FILM_PROBE_LIST }); const fired = new Set();
  for (let t = 0; t < FT.judge + 6; t += DT) {
    for (const c of FILM_CUES) if (c.sense && t >= c.t && !fired.has(c.name)) { fired.add(c.name); s.beginEvent(c.name, c.sense.azimuth, c.sense.dur, { kind: c.sense.kind }); }
    const p = sim.step(t, DT); s.update(p.yaw, p.pitch, p.z, DT); d.tick(DT);
  }
  return { genre: rank(d.st.current).dominant, current: d.st.current };
}
// /interim 은 페이지(app/interim/page.js)와 같은 조건 — 판정은 T.judge 에서, 그 시각까지 채점된 사건만 judge() 에 넣는다.
// 페이지는 헤드셋 세션이 아니면 합성 관객에게 큐마다 lib/interimProbes 의 탐침을 trigger 하므로(S2·S4 포함) 여기서도 같은 목록을 준다.
function interimGenre(profile) {
  const s = createHeadPoseSensor({ push: () => {}, mark: () => {} }); const su = createStandUpSensor();
  const sim = createGazeSim(profile, { seed: 1, probes: INTERIM_PROBE_LIST }); const fired = new Set();
  for (let t = 0; t < IT.judge; t += DT) {
    for (const c of INTERIM_CUES) if (c.sense && t >= c.t && !fired.has(c.name)) { fired.add(c.name); s.beginEvent(c.name, c.sense.azimuth, c.sense.dur, { kind: c.sense.kind, tail: 4 }); }
    const p = sim.step(t, DT); s.update(p.yaw, p.pitch, p.z, DT); su.update(p.y, DT, true);
  }
  const by = Object.fromEntries(s.report().events.map((e) => [e.name, e.feats]));
  // 페이지처럼 채점된 신호만 넣는다(없는 신호는 생략 — judge() 가 0점 취급). 세 신호가 다 있어야 정상.
  const obs = {};
  if (by.figureApproach) obs.S1 = gradeS1FromHeadPose(by.figureApproach);
  if (by.poster) obs.S3 = gradeS3FromHeadPose(by.poster);
  if (by.frog) obs.S5 = gradeS5FromHeadPose(by.frog, { stoodUp: su.stoodUp });
  return { ...judge(obs), obs, stoodUp: su.stoodUp, feats: by };
}

test("팀 판정 경로(1배속, 판정 시각 T.judge): 공포형 → 공포, 차분형 → 로맨스 (/film·/interim 모두), 호기심형 → /interim 코미디", () => {
  const fF = filmGenre("fearful"), cF = filmGenre("calm");
  assert.equal(fF.genre, "H", `film fearful ${JSON.stringify(fF.current)}`);
  assert.equal(cF.genre, "R", `film calm ${JSON.stringify(cF.current)}`);
  const fI = interimGenre("fearful"), uI = interimGenre("curious"), cI = interimGenre("calm");
  for (const [name, r] of [["fearful", fI], ["curious", uI], ["calm", cI]]) {
    assert.ok(r.obs.S1 && r.obs.S3 && r.obs.S5, `${name}: 판정 시각에 S1·S3·S5 가 모두 채점돼 있어야 한다 ${JSON.stringify(r.obs)}`);
  }
  assert.equal(fI.genre, "H", `interim fearful ${JSON.stringify(fI.obs)} ${JSON.stringify(fI.totals)}`);
  assert.equal(fI.obs.S5, "A", "공포형은 개구리에 벌떡(S5:A)");
  assert.equal(fI.obs.S3, "B", `공포형은 포스터를 오래 못 읽는다(S3:B 힐끗) — lookSec ${fI.feats.poster?.lookSec}`);
  assert.equal(uI.genre, "C", `interim curious ${JSON.stringify(uI.obs)}`);
  assert.equal(cI.genre, "R", `interim calm ${JSON.stringify(cI.obs)}`);
  assert.equal(cI.obs.S1, "A", "차분형은 인물을 지속 관찰(S1:A)");
});

test("배속 4: 예정 탐침의 길이를 실제 초로 환산해도 다섯 사건이 모두 닫히고 이득 순서가 같다", () => {
  const F = runInterim("fearful", { speed: 4 }), C = runInterim("calm", { speed: 4 });
  assert.equal(F.data.stimuli.length, 5); assert.equal(C.data.stimuli.length, 5);
  assert.ok(F.theta.g > C.theta.g, `g ${F.theta.g} > ${C.theta.g}`);
});

// 세 프로필 θ̂ 표 — 저널·문서에 옮겨 적는 용도
console.log("\n합성 관객 θ̂ (/interim, 1배속, seed 1 — 창작값이지 실측이 아님)");
for (const p of GAZE_PROFILE_NAMES) {
  const { theta, data } = runInterim(p);
  const resp = data.stimuli.map((s) => `${s.name}:${s.responded ? "○" : "×"}`).join(" ");
  console.log(`  ${p.padEnd(8)} g=${theta.g} L=${theta.L}s τ=${theta.tau}s ρ=${theta.rho} 응답 ${theta.nResp}/${theta.n} 확신 ${Math.round(theta.confidence * 100)}%  ${resp}`);
}
console.log("합성 관객 θ̂ (/film 도입부 t<75, 1배속, seed 1)");
for (const p of GAZE_PROFILE_NAMES) {
  const { theta } = runFilm(p);
  console.log(`  ${p.padEnd(8)} g=${theta.g} L=${theta.L}s τ=${theta.tau}s ρ=${theta.rho} 응답 ${theta.nResp}/${theta.n} 확신 ${Math.round(theta.confidence * 100)}%`);
}
console.log(`\n${n} 통과 (gaze-sim)`);
