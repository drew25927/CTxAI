// 합성 관객(lib/gazeSim.js) 회귀 테스트 — node scripts/test-gaze-sim.mjs
// 세 프로필을 /interim·/film 타임라인 위에서 돌려 센서 → 관객 응답 모델 θ̂ 가 의도한 순서로 갈리는지,
// 같은 시드가 같은 궤적을 재현하는지, 자세값이 물리적으로 말이 되는 범위인지 본다.
import assert from "node:assert/strict";
import { createGazeSim, GAZE_PROFILE_NAMES, GAZE_PROFILES, isGazeProfile, SEAT_Y } from "../lib/gazeSim.js";
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
function interimGenre(profile) {
  const s = createHeadPoseSensor({ push: () => {}, mark: () => {} }); const su = createStandUpSensor();
  const probes = INTERIM_CUES.filter((c) => c.sense).map((c) => ({ t: c.t, name: c.name, azimuth: c.sense.azimuth, dur: c.sense.dur, kind: c.sense.kind }));
  const sim = createGazeSim(profile, { seed: 1, probes }); const fired = new Set();
  for (let t = 0; t < IT.judge + 6; t += DT) {
    for (const c of INTERIM_CUES) if (c.sense && t >= c.t && !fired.has(c.name)) { fired.add(c.name); s.beginEvent(c.name, c.sense.azimuth, c.sense.dur, { kind: c.sense.kind }); }
    const p = sim.step(t, DT); s.update(p.yaw, p.pitch, p.z, DT); su.update(p.y, DT, true);
  }
  const by = Object.fromEntries(s.report().events.map((e) => [e.name, e.feats]));
  const obs = { S1: by.figureApproach ? gradeS1FromHeadPose(by.figureApproach) : "D", S3: by.poster ? gradeS3FromHeadPose(by.poster) : "C", S5: by.frog ? gradeS5FromHeadPose(by.frog, { stoodUp: su.stoodUp }) : "D" };
  return { ...judge(obs), obs, stoodUp: su.stoodUp };
}

test("팀 판정 경로(1배속): 공포형 → 공포, 차분형 → 로맨스 (/film·/interim 모두), 호기심형 → /interim 코미디", () => {
  const fF = filmGenre("fearful"), cF = filmGenre("calm");
  assert.equal(fF.genre, "H", `film fearful ${JSON.stringify(fF.current)}`);
  assert.equal(cF.genre, "R", `film calm ${JSON.stringify(cF.current)}`);
  const fI = interimGenre("fearful"), uI = interimGenre("curious"), cI = interimGenre("calm");
  assert.equal(fI.genre, "H", `interim fearful ${JSON.stringify(fI.obs)}`);
  assert.equal(fI.obs.S5, "A", "공포형은 개구리에 벌떡(S5:A)");
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
