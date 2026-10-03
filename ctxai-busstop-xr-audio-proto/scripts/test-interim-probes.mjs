// lib/interimProbes.js 회귀 — 팀 큐와의 정합성, 배속 환산, 탐침 순서.
import assert from "node:assert/strict";
import { CUES, T } from "../lib/interimTimeline.js";
import { INTERIM_PROBES, INTERIM_PROBE_ORDER, INTERIM_DOSE, probeFor, probeMarks, interimTrack } from "../lib/interimProbes.js";
import { createEngagementSensor } from "../lib/engagementSense.js";
import { fitViewerModel } from "../lib/viewerModel.js";

let n = 0;
function ok(name, fn) { fn(); n++; console.log("  ✓", name); }

ok("탐침 5개가 팀 CUES 의 signal 큐와 1:1 로 대응한다", () => {
  const signalCues = CUES.filter((c) => c.signal).map((c) => c.name);
  assert.deepEqual(signalCues, INTERIM_PROBE_ORDER);
  for (const name of signalCues) assert.ok(INTERIM_PROBES[name], name);
});

ok("팀 큐에 sense 가 있는 S1·S3·S5 는 방위·길이·종류가 팀 값과 같다", () => {
  for (const c of CUES.filter((x) => x.sense)) {
    const p = INTERIM_PROBES[c.name];
    assert.equal(p.azimuth, c.sense.azimuth, c.name);
    assert.equal(p.dur, c.sense.dur, c.name);
    assert.equal(p.kind, c.sense.kind, c.name);
  }
});

ok("탐침이 아닌 큐는 null", () => {
  for (const name of ["ambience", "judge", "figureGone", "transition", "greeting", "end", "없는큐"]) assert.equal(probeFor(name), null);
});

ok("배속이면 길이·꼬리를 실제 시간으로 환산한다", () => {
  const p1 = probeFor("poster", 1), p4 = probeFor("poster", 4);
  assert.equal(p1.dur, 3); assert.equal(p1.tail, 4);
  assert.equal(p4.dur, 0.75); assert.equal(p4.tail, 1);
  assert.equal(p4.dose, INTERIM_DOSE);
  assert.equal(probeFor("poster", 0).dur, 3, "speed 0 은 1 로 본다");
});

ok("사건 눈금은 영화 시간 오름차순이고 S1~S5 라벨을 단다", () => {
  const m = probeMarks();
  assert.deepEqual(m.map((x) => x.label), ["S1", "S2", "S3", "S4", "S5"]);
  for (let i = 1; i < m.length; i++) assert.ok(m[i].t > m[i - 1].t);
  assert.equal(m[0].t, T.figureStart); assert.equal(m[4].t, T.frog);
});

ok("모니터 트랙 — 확정 전 선두, 확정 뒤 최종", () => {
  assert.equal(interimTrack(null), null);
  assert.equal(interimTrack({ leadingGenre: null, finalGenre: null }), null);
  assert.equal(interimTrack({ leadingGenre: "C", finalGenre: null }), "C");
  assert.equal(interimTrack({ leadingGenre: "C", finalGenre: "H" }), "H");
});

ok("탐침 다섯 개를 센서에 그대로 넣으면 레코드 5개와 θ̂ 가 나온다 (정면만 보는 관객)", () => {
  const eng = createEngagementSensor({});
  const speed = 4, dt = 1 / 60;
  const fired = new Set();
  for (let t = 0; t < T.end / speed; t += dt) {
    const ft = t * speed;
    for (const c of CUES) if (!fired.has(c.name) && ft >= c.t) { fired.add(c.name); const p = probeFor(c.name, speed); if (p) eng.beginStimulus(p); }
    eng.update({ yaw: 0, pitch: 0 }, dt);
  }
  const d = eng.data();
  assert.equal(d.stimuli.length, 5);
  assert.deepEqual(d.stimuli.map((s) => s.name).sort(), [...INTERIM_PROBE_ORDER].sort());
  const theta = fitViewerModel(d.stimuli);
  for (const k of ["g", "L", "tau", "rho", "confidence"]) assert.ok(Number.isFinite(theta[k]), k);
});

console.log(`${n} 통과 (interim-probes)`);
