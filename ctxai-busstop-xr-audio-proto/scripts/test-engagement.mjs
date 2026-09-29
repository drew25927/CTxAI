// 집중도 센서 회귀 테스트 — 외부 의존 없이 node 로 바로 돈다: node scripts/test-engagement.mjs
// 합성 자세 시퀀스(72Hz)로 잔움직임 창·탐침 레코드·집중도 합성·요약이 설계 문서(§4.6)대로 나오는지 본다.

import assert from "node:assert/strict";
import { createEngagementSensor, windowFeatures, changePoint, summarizeEngagement, ENGAGE_PARAMS } from "../lib/engagementSense.js";

let n = 0;
function test(name, fn) { try { fn(); n++; console.log("ok ", name); } catch (e) { console.log("FAIL", name, "—", e.message); process.exitCode = 1; } }

const HZ = 72, DT = 1 / HZ;
/** 합성 관객 — pose(t) 가 {yaw,pitch,roll,x,y,z} 를 돌려주면 그 자세를 sec 초 동안 72Hz 로 먹인다. */
function feed(s, sec, pose, tOffset = 0) {
  const steps = Math.round(sec * HZ);
  for (let i = 0; i < steps; i++) s.update({ yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0, ...pose(tOffset + i * DT) }, DT);
}
const still = () => ({});

test("가만히 있는 관객: 각속도 RMS 낮고 정지 비율·억제 높다", () => {
  const s = createEngagementSensor();
  feed(s, 10, still);
  const r = s.report();
  assert.ok(r.windows.length >= 4, `창 ${r.windows.length}`);
  const w = r.windows[r.windows.length - 1];
  assert.ok(w.angVelRms < 1, `angVelRms ${w.angVelRms}`);
  assert.ok(w.stillRatio > 0.95, `stillRatio ${w.stillRatio}`);
  assert.ok(r.engagement.at(-1).calm > 0.95, `calm ${r.engagement.at(-1).calm}`);
});

test("안절부절(0.8Hz 좌우 흔들림 + roll): 각속도 RMS 높고 억제 낮고 0.5~4Hz 대역이 4~6Hz 보다 크다", () => {
  const s = createEngagementSensor();
  feed(s, 6, still);
  feed(s, 8, (t) => ({ yaw: 15 * Math.sin(2 * Math.PI * 0.8 * t), roll: 6 * Math.sin(2 * Math.PI * 0.8 * t + 1), pitch: 4 * Math.sin(2 * Math.PI * 0.8 * t) }), 6);
  const r = s.report();
  const w = r.windows.at(-1);
  assert.ok(w.angVelRms > 30, `angVelRms ${w.angVelRms}`);
  assert.ok(w.band05_4 > w.band4_6 * 3, `band05_4 ${w.band05_4} vs band4_6 ${w.band4_6}`);
  assert.ok(w.reversals >= 2, `reversals ${w.reversals}`);
  assert.ok(r.engagement.at(-1).calm < 0.3, `calm ${r.engagement.at(-1).calm}`);
});

test("웃음 리듬(pitch 5Hz ±4°): 4~6Hz 대역이 커지고 웃음 점수 ≥ 0.5, 억제 값은 그 창에서 갱신되지 않는다", () => {
  const s = createEngagementSensor();
  feed(s, 6, still);
  const calmBefore = s.current().calm;
  feed(s, 4, (t) => ({ pitch: 4 * Math.sin(2 * Math.PI * 5 * t) }), 6);
  const r = s.report();
  const w = r.windows.at(-1);
  assert.ok(w.band4_6 > w.band05_4, `band4_6 ${w.band4_6} vs band05_4 ${w.band05_4}`);
  assert.ok(r.engagement.at(-1).laugh >= 0.5, `laugh ${r.engagement.at(-1).laugh}`);
  assert.equal(s.current().calm, calmBefore);
  assert.ok(r.summary.laughEpisodes.length >= 1, "웃음 에피소드");
});

test("탐침 응답: 자극 뒤 0.4초에 그쪽으로 돌리면 responded=1, 지연·응시·회복이 기록되고 응답률이 오른다", () => {
  const s = createEngagementSensor();
  feed(s, 5, still);
  s.beginStimulus({ name: "frog", azimuth: 72, dur: 3, kind: "probe", channel: "audio", dose: 0.8, tail: 4 });
  // 0.4초 뒤 0.3초에 걸쳐 72° 로 돌리고 2초 응시, 0.5초에 걸쳐 복귀
  feed(s, 8, (t) => {
    if (t < 0.4) return {};
    if (t < 0.7) return { yaw: 72 * ((t - 0.4) / 0.3) };
    if (t < 2.7) return { yaw: 72 };
    if (t < 3.2) return { yaw: 72 * (1 - (t - 2.7) / 0.5) };
    return {};
  });
  const r = s.report();
  assert.equal(r.stimuli.length, 1);
  const st = r.stimuli[0];
  assert.equal(st.responded, 1);
  assert.equal(st.looked, 1);
  assert.ok(st.lookLatency >= 0.4 && st.lookLatency <= 0.8, `lookLatency ${st.lookLatency}`);
  assert.ok(st.moveLatency != null && st.moveLatency <= 0.8, `moveLatency ${st.moveLatency}`);
  assert.ok(st.lookSec >= 1.8, `lookSec ${st.lookSec}`);
  assert.ok(st.peakAmp >= 70, `peakAmp ${st.peakAmp}`);
  assert.ok(st.recoverySec != null && st.recoverySec < 1.5, `recoverySec ${st.recoverySec}`);
  assert.equal(st.nth, 0);
  assert.ok(s.current().probeResp > 0.5, `probeResp ${s.current().probeResp}`);
  assert.equal(r.summary.probeResponseRate, 1);
});

test("탐침 무응답: 가만히 있으면 responded=0, 응답률이 내려가고 같은 채널 두 번째는 nth=1", () => {
  const s = createEngagementSensor();
  feed(s, 5, still);
  s.beginStimulus({ name: "frog", azimuth: 135, dur: 3, kind: "probe", channel: "audio", tail: 2 });
  feed(s, 6, still);
  s.beginStimulus({ name: "catScream", azimuth: -115, dur: 2.5, kind: "probe", channel: "audio", tail: 2 });
  feed(s, 6, still);
  const r = s.report();
  assert.equal(r.stimuli.length, 2);
  assert.equal(r.stimuli[0].responded, 0);
  assert.equal(r.stimuli[1].nth, 1);
  assert.ok(s.current().probeResp < 0.5, `probeResp ${s.current().probeResp}`);
  assert.equal(r.summary.probeResponseRate, 0);
});

test("예감: 자극 전에 이미 그쪽을 보고 있으면 preLook=1", () => {
  const s = createEngagementSensor();
  feed(s, 5, still);
  feed(s, 2, () => ({ yaw: 70 }));
  s.beginStimulus({ name: "poster", azimuth: 72, dur: 3, kind: "probe", channel: "av", tail: 1 });
  feed(s, 5, () => ({ yaw: 70 }));
  const r = s.report();
  assert.equal(r.stimuli[0].preLook, 1);
  assert.equal(r.stimuli[0].preTurn, 1, "정면(0°)을 보다가 자극 2초 전에 70° 로 돌렸다");
  assert.equal(r.summary.anticipationRate, 1);
});

test("예감(B158 후속): 원래 정면을 보던 관객에게 정면 8° 사건은 preLook=1 이지만 preTurn=0", () => {
  const s = createEngagementSensor();
  feed(s, 8, still);
  s.beginStimulus({ name: "truckSplash", azimuth: 8, dur: 2.5, kind: "probe", channel: "av", tail: 1 });
  feed(s, 4, still);
  const st = s.report().stimuli[0];
  assert.equal(st.preLook, 1);
  assert.equal(st.preTurn, 0);
});

test("이미 보던 사건(B158): 시작할 때 사건 방향 안을 보고 있었고 움직이지 않았으면 atOnset=1 · turned=0 · responded=0", () => {
  // 1배속 /interim 차분형 S2 물보라(방위 8°)의 모양 — 정면을 보던 관객이 그대로 앉아 있었다(편차 0.6° · 각속도 2.4°/s)
  const s = createEngagementSensor();
  feed(s, 6, still);
  s.beginStimulus({ name: "truckSplash", azimuth: 8, dur: 2.5, kind: "probe", channel: "av", dose: 0.6, tail: 2 });
  feed(s, 6, (t) => ({ yaw: 0.3 * Math.sin(t) }));
  const r = s.report().stimuli[0];
  assert.equal(r.atOnset, 1);
  assert.equal(r.looked, 1, "looked 는 '그쪽을 봤다' 그대로 남는다");
  assert.equal(r.turned, 0);
  assert.equal(r.responded, 0, "돌아본 것도 움찔한 것도 아니다");
  assert.equal(s.report().summary.probeResponseRate, 0);
  assert.ok(s.current().probeResp > 0.5, `지켜본 관객의 집중도 탐침 항은 사전값 0.5 에서 내려가지 않는다 (${s.current().probeResp})`);
});

test("이미 보던 사건에 움찔(B158): 빠른 고개 움직임이 있으면 turned=0 이어도 responded=1", () => {
  const s = createEngagementSensor();
  feed(s, 6, still);
  s.beginStimulus({ name: "truckSplash", azimuth: 8, dur: 2.5, kind: "probe", channel: "av", dose: 0.6, tail: 2 });
  // 0.1초 뒤 0.1초 동안 18° 움찔(≈180°/s) 후 제자리
  feed(s, 6, (t) => ({ yaw: t < 0.1 ? 0 : t < 0.2 ? -180 * (t - 0.1) : -18 + Math.min(18, 20 * (t - 0.2)) }));
  const r = s.report().stimuli[0];
  assert.equal(r.atOnset, 1);
  assert.equal(r.turned, 0);
  assert.equal(r.responded, 1);
  assert.ok(r.moveLatency != null && r.moveLatency < 0.3, `moveLatency ${r.moveLatency}`);
});

test("돌아본 사건(B158): 시작할 때 다른 곳을 보다가 사건 쪽으로 돌리면 atOnset=0 · turned=1", () => {
  const s = createEngagementSensor();
  feed(s, 6, still);
  s.beginStimulus({ name: "poster", azimuth: 72, dur: 3, kind: "probe", channel: "av", dose: 0.6, tail: 2 });
  // 천천히(≈40°/s) 돌려 움직임 응답 없이 시선만으로 응답
  feed(s, 6, (t) => ({ yaw: Math.min(72, 40 * t) }));
  const r = s.report().stimuli[0];
  assert.equal(r.atOnset, 0);
  assert.equal(r.turned, 1);
  assert.equal(r.moveLatency, null, "느린 회전이라 움직임 응답은 없다");
  assert.equal(r.responded, 1);
});

test("의도 일치: setIntent(60) 동안 60° 를 보면 intentMatch≈1, 정면을 보면 ≈0, 해제하면 null", () => {
  // 전환을 2초 창 경계(4·8·12초)에 맞춰 각 창이 한 국면만 담게 한다
  const s = createEngagementSensor();
  feed(s, 4, still);
  s.setIntent(60);
  feed(s, 4, () => ({ yaw: 58 }));      // 의도 방향을 본다 → 창 6~8 은 온전히 일치
  const a = s.report().windows.at(-1);
  feed(s, 4, still);                     // 의도는 여전히 60 인데 정면을 본다 → 불일치
  const b = s.report().windows.at(-1);
  s.setIntent(null);
  feed(s, 4, still);
  const c = s.report().windows.at(-1);
  assert.ok(a.intentMatch >= 0.95, `match ${a.intentMatch}`);
  assert.ok(b.intentMatch <= 0.05, `match ${b.intentMatch}`);
  assert.equal(c.intentMatch, null);
});

test("탐침 진행 중 창의 정향 움직임은 억제 값을 깎지 않는다 (콘텐츠 동기 제외)", () => {
  const s = createEngagementSensor();
  feed(s, 6, still);
  const calmBefore = s.current().calm;
  s.beginStimulus({ name: "cat", azimuth: 30, dur: 2.5, kind: "startle", channel: "av", tail: 1 });
  feed(s, 2, (t) => ({ yaw: 30 * Math.sin(2 * Math.PI * 1.5 * t) }));
  assert.equal(s.current().calm, calmBefore);
});

test("track 탐침 위에 겹친 probe: probe 를 향한 각속도·편차·후퇴는 track 레코드에 새지 않고, 응시는 계속 센다", () => {
  const s = createEngagementSensor();
  feed(s, 5, still);
  s.beginStimulus({ name: "figure", azimuth: -35, dur: 20, kind: "track", channel: "visual", tail: 1 });
  feed(s, 3, still);                                                                                  // t=5~8 track 만 진행
  s.beginStimulus({ name: "frog", azimuth: 135, dur: 3, kind: "probe", channel: "audio", tail: 2 });  // t=8, 관찰 종료 t=13
  // t=8~: 0.3초에 135° 로 홱 돌리며(≈450°/s) 9cm 물러서 2초 응시, 0.5초에 복귀. probe 가 닫힌 뒤(t≥13.5)
  // 0.5초에 걸쳐 인물 쪽 -35° 로 돌려 4초 응시하고 0.5초에 복귀 — 이 느린 정향(70°/s)만 track 의 몫이다.
  feed(s, 12, (t) => {
    if (t < 0.3) return { yaw: 135 * (t / 0.3), z: 0.09 * (t / 0.3) };
    if (t < 2.3) return { yaw: 135, z: 0.09 };
    if (t < 2.8) return { yaw: 135 * (1 - (t - 2.3) / 0.5), z: 0.09 * (1 - (t - 2.3) / 0.5) };
    if (t < 5.5) return {};
    if (t < 6) return { yaw: -35 * ((t - 5.5) / 0.5) };
    if (t < 10) return { yaw: -35 };
    if (t < 10.5) return { yaw: -35 * (1 - (t - 10) / 0.5) };
    return {};
  });
  feed(s, 8, still);                                                                                  // track 종료(t=26)
  const r = s.report();
  const track = r.stimuli.find((x) => x.name === "figure"), frog = r.stimuli.find((x) => x.name === "frog");
  assert.ok(frog.maxVel > 300 && frog.retreat >= 0.08, `frog vel ${frog.maxVel} retreat ${frog.retreat}`);
  assert.ok(track.maxVel < 100, `track maxVel ${track.maxVel} — probe 의 450°/s 가 새면 안 된다`);
  assert.ok(track.peakAmp < 45, `track peakAmp ${track.peakAmp} — probe 의 135° 가 새면 안 된다`);
  assert.ok(track.retreat < 0.01, `track retreat ${track.retreat}`);
  assert.ok(track.lookSec >= 3.5, `track lookSec ${track.lookSec}`);
  assert.ok(track.maskedSec > 4 && track.maskedSec < 6, `maskedSec ${track.maskedSec} (probe 관찰 5초)`);
  assert.equal(track.responded, 1);
  assert.equal(frog.maskedSec, 0);
});

test("원시 CSV: 헤더 + 먹인 표본 수만큼 행, intent_az·stim 열이 채워진다", () => {
  const s = createEngagementSensor();
  feed(s, 3, still);
  s.beginStimulus({ name: "frog", azimuth: 135, dur: 1, kind: "probe", channel: "audio", tail: 0.5 });
  feed(s, 1, still);
  const r = s.report();
  const lines = r.raw.csv.split("\n");
  assert.equal(lines.length, 1 + Math.round(4 * HZ));
  assert.equal(lines[0], "t_ms,yaw,pitch,roll,x_mm,y_mm,z_mm,intent_az,stim");
  assert.ok(lines.at(-1).endsWith(",135,frog"), lines.at(-1));
  assert.ok(r.rateHz > 60 && r.rateHz < 80, `rateHz ${r.rateHz}`);
});

test("꺾인 시점: 0.8 → 0.3 으로 떨어지는 시계열은 경계 근처를 찾고, 평평하면 null", () => {
  const series = [];
  for (let t = 2; t <= 120; t += 2) series.push({ t, score: t <= 60 ? 0.8 : 0.3 });
  const cp = changePoint(series);
  assert.ok(cp && Math.abs(cp.t - 62) <= 4, JSON.stringify(cp));
  const flat = series.map((p) => ({ t: p.t, score: 0.6 }));
  assert.equal(changePoint(flat), null);
});

test("요약: 가장 집중한 구간에 가까운 탐침 이름이 붙는다", () => {
  const windows = [], engagement = [];
  for (let i = 0; i < 30; i++) { const t1 = (i + 1) * 2; windows.push({ t0: t1 - 2, t1, angVelRms: 5, intentMatch: null }); engagement.push({ t: t1, score: i >= 10 && i <= 12 ? 0.9 : 0.4, calm: 0.5, laugh: 0 }); }
  const stimuli = [{ name: "cat", onset: 21, responded: 1, preLook: 0 }, { name: "poster", onset: 6, responded: 0, preLook: 0 }];
  const sum = summarizeEngagement({ windows, stimuli, engagement });
  assert.equal(sum.topSegments[0].near?.name, "cat");
  assert.equal(sum.probeResponseRate, 0.5);
  assert.ok(sum.topSegments[0].t0 >= 20 && sum.topSegments[0].t1 <= 26, JSON.stringify(sum.topSegments[0]));
});

test("windowFeatures 는 표본 4개 미만이면 null", () => {
  assert.equal(windowFeatures([{ t: 0, yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 }], { yaw: 0, pitch: 0, z: 0 }, ENGAGE_PARAMS), null);
});

console.log(`\n${n} 통과${process.exitCode ? " (실패 있음)" : ""}`);
