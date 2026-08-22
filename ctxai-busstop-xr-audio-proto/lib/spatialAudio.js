"use client";

// 프로브 하네스의 공간음향 — HRTF PannerNode + 리스너 방향 추적.
//
// ⚠ 이 파일의 존재 이유이자 급소: **리스너 방향 갱신**.
//
// lib/audio.js 는 소리의 위치만 설정하고 "듣는 사람이 어디를 보고 있는지"는
// 갱신하지 않는다 — 지금까지는 둘러보는 기능이 없어서 문제가 안 됐다.
// 프로브 하네스에서는 이게 없으면 마우스로 개구리 쪽을 봐도 소리가 계속
// 오른쪽 뒤에서 들린다. 그러면 관객은 "찾았다"는 확인을 못 받고,
// 프로브(§1-4 개구리, §1-5 두 번째 울음) 전체가 성립하지 않는다.
//
// 음원은 전부 합성이다 — 실제 SFX 17종은 아직 후보 선정 중이고(/sfx),
// 하네스의 목적은 "자극이 반응을 유발하는가"를 보는 것이라 음색보다
// 방향·시점·거리가 중요하다. 최종 음원이 정해지면 makeVoice() 만 갈아끼운다.
//
// 근거: Bus/규격/정류장_스크립트_v2.md §1 · lib/probes.js

import { probeAt } from "./probes.js";

// ── 기본 유틸 ──────────────────────────────────────────────

function noiseBuffer(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** 0 으로 지수감쇠는 못 하므로 아주 작은 값으로 떨어뜨린 뒤 끊는다. */
function decay(param, from, to, t0, dur) {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(Math.max(from, 1e-4), t0);
  param.exponentialRampToValueAtTime(Math.max(to, 1e-4), t0 + dur);
}

// ── 패너 ───────────────────────────────────────────────────

function makePanner(ctx) {
  const p = ctx.createPanner();
  p.panningModel = "HRTF";
  p.distanceModel = "inverse";
  p.refDistance = 1.2;
  p.rolloffFactor = 0.9;
  p.maxDistance = 120;
  return p;
}

function setPannerPos(p, x, y, z, when) {
  if (p.positionX) {
    p.positionX.setValueAtTime(x, when);
    p.positionY.setValueAtTime(y, when);
    p.positionZ.setValueAtTime(z, when);
  } else {
    p.setPosition(x, y, z); // 구형 Safari
  }
}

// ── 프로브별 음색 ──────────────────────────────────────────
//
// 각 함수는 { out, stop } 을 돌려준다. out 을 패너에 물리고, 재생이 끝나면
// 호출자가 stop() 으로 정리한다. 길이는 대략 프로브 반응창 안에 들어간다.

function vPoster(ctx, t0) {
  // 파닥 — 젖은 종이가 유리에서 떨어졌다 붙는 소리. 짧은 노이즈 버스트 3~4회.
  const out = ctx.createGain();
  out.gain.value = 1;
  const nodes = [];
  const beats = [0, 0.16, 0.29, 0.55];
  for (const b of beats) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.09);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600 + Math.random() * 2200;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    decay(g.gain, 0.5, 0.001, t0 + b, 0.09);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t0 + b); src.stop(t0 + b + 0.1);
    nodes.push(src);
  }
  return { out, stop: () => nodes.forEach((n) => { try { n.stop(); } catch {} }) };
}

function vBell(ctx, t0) {
  // 딸랑 — 카페 문의 작은 금속 종. 문이 열리고 닫히며 두 번.
  const out = ctx.createGain();
  out.gain.value = 1;
  const nodes = [];
  for (const [at, amp] of [[0, 0.35], [1.9, 0.28]]) {
    for (const [f, a] of [[1180, 1], [1790, 0.55], [2630, 0.3]]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * (0.995 + Math.random() * 0.01);
      const g = ctx.createGain();
      decay(g.gain, amp * a, 0.0005, t0 + at, 1.1);
      o.connect(g); g.connect(out);
      o.start(t0 + at); o.stop(t0 + at + 1.2);
      nodes.push(o);
    }
  }
  return { out, stop: () => nodes.forEach((n) => { try { n.stop(); } catch {} }) };
}

function vTruck(ctx, t0, dur) {
  // 엔진 저역 + 젖은 타이어 마찰음, 그리고 물웅덩이를 밟는 순간의 물보라.
  const out = ctx.createGain();
  out.gain.value = 1;
  const nodes = [];

  const eng = ctx.createOscillator();
  eng.type = "sawtooth";
  eng.frequency.setValueAtTime(52, t0);
  eng.frequency.linearRampToValueAtTime(44, t0 + dur);
  const engLp = ctx.createBiquadFilter();
  engLp.type = "lowpass";
  engLp.frequency.value = 260;
  const engG = ctx.createGain();
  engG.gain.setValueAtTime(0.0001, t0);
  engG.gain.exponentialRampToValueAtTime(0.32, t0 + dur * 0.45);
  engG.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  eng.connect(engLp); engLp.connect(engG); engG.connect(out);
  eng.start(t0); eng.stop(t0 + dur + 0.05);
  nodes.push(eng);

  const tire = ctx.createBufferSource();
  tire.buffer = noiseBuffer(ctx, dur + 0.2);
  const tireBp = ctx.createBiquadFilter();
  tireBp.type = "bandpass";
  tireBp.frequency.value = 1500;
  tireBp.Q.value = 0.7;
  const tireG = ctx.createGain();
  tireG.gain.setValueAtTime(0.0001, t0);
  tireG.gain.exponentialRampToValueAtTime(0.2, t0 + dur * 0.45);
  tireG.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  tire.connect(tireBp); tireBp.connect(tireG); tireG.connect(out);
  tire.start(t0); tire.stop(t0 + dur + 0.1);
  nodes.push(tire);

  // 물보라 — 앞바퀴가 웅덩이를 밟는 순간. 저역통과가 위로 열렸다 닫힌다.
  const sp = t0 + dur * 0.45;
  const splash = ctx.createBufferSource();
  splash.buffer = noiseBuffer(ctx, 0.7);
  const spLp = ctx.createBiquadFilter();
  spLp.type = "lowpass";
  spLp.frequency.setValueAtTime(700, sp);
  spLp.frequency.exponentialRampToValueAtTime(7000, sp + 0.09);
  spLp.frequency.exponentialRampToValueAtTime(900, sp + 0.6);
  const spG = ctx.createGain();
  spG.gain.setValueAtTime(0.0001, sp);
  spG.gain.exponentialRampToValueAtTime(0.6, sp + 0.05);
  spG.gain.exponentialRampToValueAtTime(0.0001, sp + 0.65);
  splash.connect(spLp); spLp.connect(spG); spG.connect(out);
  splash.start(sp); splash.stop(sp + 0.7);
  nodes.push(splash);

  return { out, stop: () => nodes.forEach((n) => { try { n.stop(); } catch {} }) };
}

function vFrog(ctx, t0) {
  // 개구리 울음 — 낮은 펄스열에 포먼트를 씌운다. 세 번 운다.
  // "과도하게 크지 않지만 거리·높이·방향이 정확해" (v2.md §1-4)
  const out = ctx.createGain();
  out.gain.value = 1;
  const nodes = [];
  const croaks = [0, 0.85, 1.75];
  for (const c of croaks) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(62, t0 + c);
    o.frequency.linearRampToValueAtTime(48, t0 + c + 0.34);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 720;
    bp.Q.value = 5.5;
    // 울음 특유의 떨림 — 진폭을 빠르게 흔든다
    const trem = ctx.createOscillator();
    trem.type = "square";
    trem.frequency.value = 24;
    const tremG = ctx.createGain();
    tremG.gain.value = 0.22;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0 + c);
    g.gain.exponentialRampToValueAtTime(0.42, t0 + c + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + c + 0.36);
    trem.connect(tremG); tremG.connect(g.gain);
    o.connect(bp); bp.connect(g); g.connect(out);
    o.start(t0 + c); o.stop(t0 + c + 0.4);
    trem.start(t0 + c); trem.stop(t0 + c + 0.4);
    nodes.push(o, trem);
  }
  return { out, stop: () => nodes.forEach((n) => { try { n.stop(); } catch {} }) };
}

function meowVoice(ctx, t0, { amp = 0.4, dur = 0.7, base = 620 } = {}) {
  const nodes = [];
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(base * 0.8, t0);
  o.frequency.linearRampToValueAtTime(base * 1.45, t0 + dur * 0.3);
  o.frequency.linearRampToValueAtTime(base * 0.9, t0 + dur);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = base * 1.6;
  bp.Q.value = 3.2;
  const vib = ctx.createOscillator();
  vib.type = "sine";
  vib.frequency.value = 6.5;
  const vibG = ctx.createGain();
  vibG.gain.value = base * 0.05;
  vib.connect(vibG); vibG.connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(amp, t0 + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(bp); bp.connect(g);
  o.start(t0); o.stop(t0 + dur + 0.05);
  vib.start(t0); vib.stop(t0 + dur + 0.05);
  nodes.push(o, vib);
  return { node: g, nodes };
}

function vCat(ctx, t0) {
  // 1단계 — 뛰어들어와 급정지. 짧은 발소리 뒤 놀란 울음 한 번.
  const out = ctx.createGain();
  out.gain.value = 1;
  const nodes = [];
  for (const s of [0, 0.11, 0.2, 0.27]) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 1.4;
    const g = ctx.createGain();
    decay(g.gain, 0.18, 0.001, t0 + s, 0.05);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t0 + s); src.stop(t0 + s + 0.06);
    nodes.push(src);
  }
  const m = meowVoice(ctx, t0 + 0.45, { amp: 0.32, dur: 0.55, base: 660 });
  m.node.connect(out);
  nodes.push(...m.nodes);
  return { out, stop: () => nodes.forEach((n) => { try { n.stop(); } catch {} }) };
}

function vCry2(ctx, t0) {
  // 2단계 — "냐아악!" 훨씬 큰 울음, 이어서 금속 그릇이 넘어지는 달그락.
  // 무슨 일이 있었는지는 보여주지 않는다 (v2.md §1-5).
  const out = ctx.createGain();
  out.gain.value = 1;
  const nodes = [];

  const m = meowVoice(ctx, t0, { amp: 0.75, dur: 0.9, base: 780 });
  m.node.connect(out);
  nodes.push(...m.nodes);

  const clatterAt = t0 + 1.15;
  for (const [s, f] of [[0, 2400], [0.09, 3100], [0.15, 1900], [0.26, 2700], [0.38, 2200]]) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.16);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 7;
    const g = ctx.createGain();
    decay(g.gain, 0.34, 0.001, clatterAt + s, 0.17);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(clatterAt + s); src.stop(clatterAt + s + 0.18);
    nodes.push(src);
  }
  return { out, stop: () => nodes.forEach((n) => { try { n.stop(); } catch {} }) };
}

function vWiper(ctx, t0, dur) {
  // 카페 문이 열린 몇 초 동안 새어 나오는 실내 생활음 + 젖은 노면 발소리.
  const out = ctx.createGain();
  out.gain.value = 1;
  const nodes = [];

  const room = ctx.createBufferSource();
  room.buffer = noiseBuffer(ctx, 3.2);
  const rbp = ctx.createBiquadFilter();
  rbp.type = "bandpass"; rbp.frequency.value = 900; rbp.Q.value = 0.6;
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.0001, t0);
  rg.gain.exponentialRampToValueAtTime(0.14, t0 + 0.3);
  rg.gain.setValueAtTime(0.14, t0 + 1.6);
  rg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
  room.connect(rbp); rbp.connect(rg); rg.connect(out);
  room.start(t0); room.stop(t0 + 3.2);
  nodes.push(room);

  // 발소리 — 인물이 다가오는 동안 계속. 거리는 패너가 처리한다.
  const steps = Math.floor((dur - 3) / 0.62);
  for (let i = 0; i < steps; i++) {
    const at = t0 + 3 + i * 0.62;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1400 + (i % 2) * 500; bp.Q.value = 1.2;
    const g = ctx.createGain();
    decay(g.gain, 0.3, 0.001, at, 0.09);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(at); src.stop(at + 0.1);
    nodes.push(src);
  }
  return { out, stop: () => nodes.forEach((n) => { try { n.stop(); } catch {} }) };
}

const VOICES = {
  poster: (ctx, t0) => vPoster(ctx, t0),
  wiper: (ctx, t0, dur) => vWiper(ctx, t0, dur),
  truck: (ctx, t0, dur) => vTruck(ctx, t0, Math.min(dur, 3.6)),
  frog: (ctx, t0) => vFrog(ctx, t0),
  cat: (ctx, t0) => vCat(ctx, t0),
  cry2: (ctx, t0) => vCry2(ctx, t0),
};

// ── 앰비언스 ───────────────────────────────────────────────
// "풀벌레 소리가 낮게 이어진다. 정류장 처마에서는 모여 있던 빗물이 간헐적으로
//  떨어진다. 툭." (v2.md §1) — 자극이 아니라 바탕이라 공간화하지 않는다.

function createAmbience(ctx, dest) {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);

  const bugs = ctx.createBufferSource();
  bugs.buffer = noiseBuffer(ctx, 4);
  bugs.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 4600; bp.Q.value = 2.4;
  const bugG = ctx.createGain();
  bugG.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.type = "sine"; lfo.frequency.value = 3.1;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.025;
  lfo.connect(lfoG); lfoG.connect(bugG.gain);
  bugs.connect(bp); bp.connect(bugG); bugG.connect(out);

  let dripTimer = null;
  function drip() {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.07);
    const g = ctx.createGain();
    decay(g.gain, 0.16, 0.0005, t, 0.16);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.2);
    dripTimer = setTimeout(drip, 2200 + Math.random() * 4200);
  }

  return {
    start() {
      const t = ctx.currentTime;
      bugs.start(t); lfo.start(t);
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(1, t + 2);
      dripTimer = setTimeout(drip, 1500);
    },
    stop() {
      if (dripTimer) clearTimeout(dripTimer);
      try { bugs.stop(); lfo.stop(); } catch {}
      out.disconnect();
    },
  };
}

// ── 무대 ───────────────────────────────────────────────────

/**
 * 프로브 하네스의 오디오 무대.
 *
 *   const stage = createSpatialStage();
 *   stage.setListener(forward, up);   // 매 프레임 — 카메라 회전 반영 ★
 *   stage.fire(probe, elapsedMs);     // 프로브 시작
 *   stage.update(elapsedMs);          // 매 프레임 — 이동 프로브 위치 갱신
 */
export function createSpatialStage() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const ambience = createAmbience(ctx, master);
  const active = new Map(); // probeId → { probe, panner, voice, startedMs }

  // 리스너는 원점(관객 머리)에 고정하고 방향만 돌린다 — 앉아 있으므로 이동 없음.
  const L = ctx.listener;
  if (L.positionX) {
    L.positionX.value = 0; L.positionY.value = 0; L.positionZ.value = 0;
  } else if (L.setPosition) {
    L.setPosition(0, 0, 0);
  }

  /**
   * ★ 급소 — 카메라가 향한 방향을 리스너에 반영한다.
   * 이게 없으면 둘러봐도 소리 방향이 그대로라 프로브가 성립하지 않는다.
   * forward/up 은 3D 씬에서 계산해 넘긴다 (이 파일은 three.js 를 모른다).
   */
  function setListener(forward, up) {
    if (L.forwardX) {
      const t = ctx.currentTime;
      L.forwardX.setValueAtTime(forward.x, t);
      L.forwardY.setValueAtTime(forward.y, t);
      L.forwardZ.setValueAtTime(forward.z, t);
      L.upX.setValueAtTime(up.x, t);
      L.upY.setValueAtTime(up.y, t);
      L.upZ.setValueAtTime(up.z, t);
    } else if (L.setOrientation) {
      L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  function fire(probe) {
    if (active.has(probe.id)) return;
    const make = VOICES[probe.id];
    if (!make) return;
    const t0 = ctx.currentTime + 0.02;
    const durSec = probe.windowMs / 1000;
    const voice = make(ctx, t0, durSec);
    const panner = makePanner(ctx);
    const p0 = probeAt(probe, 0);
    setPannerPos(panner, p0.x, probe.elevation || 0, p0.z, t0);
    voice.out.connect(panner);
    panner.connect(master);
    active.set(probe.id, { probe, panner, voice, startedMs: null });
  }

  /** 이동 프로브(우비 인물·트럭·고양이)의 위치를 진행률에 맞춰 옮긴다. */
  function update(elapsedMs) {
    const t = ctx.currentTime;
    for (const [id, a] of active) {
      const prog = (elapsedMs - a.probe.onsetMs) / a.probe.windowMs;
      if (prog > 1.6) {
        a.voice.stop();
        try { a.panner.disconnect(); } catch {}
        active.delete(id);
        continue;
      }
      const p = probeAt(a.probe, Math.max(0, Math.min(1, prog)));
      setPannerPos(a.panner, p.x, a.probe.elevation || 0, p.z, t);
    }
  }

  return {
    ctx,
    setListener,
    fire,
    update,
    startAmbience: () => ambience.start(),
    resume: () => ctx.resume?.(),
    async stop() {
      ambience.stop();
      for (const [, a] of active) { a.voice.stop(); try { a.panner.disconnect(); } catch {} }
      active.clear();
      try { await ctx.close(); } catch {}
    },
  };
}
