// 합성 관객(시연·증거용) — 헤드셋도 드래그도 없이 "무서워하는 사람 / 호기심 많은 사람 / 차분한 사람"의
// 고개 움직임을 흉내 내 {yaw, pitch, roll, x, y, z} 자세 스트림을 만든다. 페이지(/film·/interim)는
// ?viewer=fearful|curious|calm 으로 켜고, 이 자세를 실제 헤드셋 자세 대신 센서(headPoseSense·engagementSense)에
// 넣고 카메라도 같은 방향으로 돌린다(프레임에 시선이 보이게). scripts/sim-interim.mjs·sim-headpose.mjs·
// work/evidence/b02 프로토타입에 흩어져 있던 구동부를 한 곳에 정식화한 것이다.
//
// 정직 표기: 이것은 실측이 아니라 지어낸 관객이다. 등급 경계나 θ̂ 의 절대값을 보정하는 근거가 될 수 없고,
// "같은 사건에 다르게 반응하는 두 사람에게 엔진이 다른 θ̂·x̂ 를 내는가"를 사람 없이 화면·그래프로 보여주는
// 용도다. 페이지는 켜져 있는 동안 HUD 에 배지를 항상 띄우고, 세션 JSON 에 viewer:{synthetic:true} 를 남긴다.
//
// 결정적 난수(mulberry32) — 같은 profile·seed 면 같은 궤적. 증거물 재현용.
//
// 좌표 규약은 headPoseSense·engagementSense 와 같다: yaw 정면 0·오른쪽 +(도), pitch 위 +(도), roll(도),
// z 후퇴 +(m), y 머리 높이(m, 앉은 기준 SEAT_Y).
//
// 시간: 합성 관객은 "영화 시간"을 산다. 배속(speed)이면 반응 시간·응시 시간·회복 속도도 같은 비율로 압축된다.
// 실제 사람은 실시간이지만, 센서(headPoseSense·engagementSense)의 사건 창(dur·tail)이 배속으로 압축되므로 지어낸
// 관객까지 실시간으로 두면 "사건이 끝난 뒤에도 보고 있다"(재확인) 같은 배속 인공물이 생긴다. 영화 시간을 살게
// 하면 어느 배속에서든 사건 대비 같은 행동이 나와 증거물이 재현된다. 대신 배속 관찰의 θ̂ 지연·회복 절대값은
// 1/speed 로 읽어야 한다(1배속 표는 scripts/test-gaze-sim.mjs 가 찍는다).
//
// 모델(1차 지연): 목표 방위 target 으로 rate(1/s) 속도로 수렴하고, hold 가 끝나면 rest(옆사람 방향 등)로 돌아온다.
//   yaw ← yaw + (target − yaw)·min(1, rate·dt)
// 그 위에 프로필별 저주파 흔들림(sway)을 더한다 — 안절부절(공포형)·두리번(호기심형)·거의 정지(차분형).
// 아래 숫자는 전부 잠정치(창작값)다. 실제 사람의 반응 시간·크기가 아니다.

export const SEAT_Y = 1.2;

export const GAZE_PROFILES = Object.freeze({
  // 공포형 — 크고 빠르게 돌아보고, 뒤로 물러나고, 뒤쪽 소리엔 벌떡, 회복이 느리고, 추적 사건 내내 불안하게 재확인
  fearful: {
    label: "공포형",
    orient: { probe: 0.85, startle: 0.85, track: 0.6 },   // 방위의 이 비율만큼 돌린다
    rate: 12,                                             // 정향 속도(1/s)
    maxVel: 500,                                          // 고개 최대 각속도(°/s) — 1차 지연의 첫 프레임 점프를 사람 범위로 자른다
    hold: { probe: 3.2, startle: 3.2, track: 1.0, behind: 3.2 }, // 그쪽을 보는 시간(s). behind = 뒤쪽(|방위| ≥ BEHIND_DEG) 사건이 우선
    retreat: { probe: 0.03, startle: 0.09, track: 0, behind: 0.09 }, // 뒤로 물러남(m)
    standUp: { behind: 0.35 },                            // 보이지 않는 뒤쪽 소리(개구리·비명)에 벌떡(m)
    returnRate: 0.9,                                      // 느린 회복(1/s)
    glance: { every: [3.5, 5.5], factor: 0.5, hold: 1.2, rate: 10 }, // track 중 "불안한 재확인"
    wander: null,
    restFactor: 0.35,                                     // 옆사람이 앉으면 그쪽을 이만큼만(곁눈질)
    sway: { amp: 2.5, hz: 0.6 },                          // 안절부절
  },
  // 호기심형 — 거의 다 돌아보고, 볼거리(포스터·고양이)는 오래 읽고, 사이사이 두리번거린다
  curious: {
    label: "호기심형",
    orient: { probe: 0.9, startle: 0.9, track: 0.9 },
    rate: 7,
    maxVel: 300,
    hold: { probe: 3.4, startle: 1.6, track: 0.9, behind: 0.9 },
    retreat: { probe: 0, startle: 0, track: 0, behind: 0 },
    standUp: null,
    returnRate: 5,
    glance: null,
    wander: { every: [2.5, 4], amp: 25, rate: 3 },        // 쉬는 동안 ±amp° 안에서 목표를 바꾼다
    restFactor: 0.9,
    sway: { amp: 1.5, hz: 0.35 },
  },
  // 차분형 — 순간 사건엔 거의 반응하지 않고, 추적 사건(인물)만 오래 지켜본다
  calm: {
    label: "차분형",
    orient: { probe: 0.1, startle: 0.1, track: 0.7 },
    rate: 3,
    maxVel: 120,
    hold: { probe: 0.3, startle: 0.3, track: 4, behind: 0.3 },
    retreat: { probe: 0, startle: 0, track: 0, behind: 0 },
    standUp: null,
    returnRate: 2,
    glance: null,
    wander: null,
    restFactor: 0.8,
    sway: { amp: 0.4, hz: 0.15 },
  },
});

export const GAZE_PROFILE_NAMES = Object.freeze(Object.keys(GAZE_PROFILES));

// 이 방위보다 옆·뒤쪽 사건은 "보이지 않는 소리"로 친다(개구리 135°, 비명 -115°). 채널 표기는 페이지마다 달라
// (/film 은 모든 사건에 효과음이 있어 전부 audio) 믿을 수 없으므로 기하로 가른다.
export const BEHIND_DEG = 100;

/** ?viewer= 값이 합성 관객 프로필인가. */
export function isGazeProfile(name) { return typeof name === "string" && Object.prototype.hasOwnProperty.call(GAZE_PROFILES, name); }

// mulberry32 — 32비트 시드의 결정적 난수 [0,1)
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(table, kind, behind) {
  if (!table) return 0;
  if (behind && table.behind != null) return table.behind;
  return table[kind] ?? table.probe ?? 0;
}
const between = (rng, [lo, hi]) => lo + (hi - lo) * rng();
const clampDeg = (d) => Math.max(-175, Math.min(175, d));

/**
 * @param {"fearful"|"curious"|"calm"} profile
 * @param {object} [opts]
 * @param {number} [opts.seed=1]      결정적 난수 시드
 * @param {Array}  [opts.probes=[]]   예정 탐침 [{t(영화 초), name, azimuth, dur(영화 초), kind, channel}] — step(t) 가 t 를 넘기면 스스로 발동
 * @param {number} [opts.speed=1]     영화 배속 — probes 의 dur 를 실제 초로 환산할 때만 쓴다(trigger() 로 넘기는 dur 는 이미 실제 초)
 */
export function createGazeSim(profile, { seed = 1, probes = [], speed = 1 } = {}) {
  if (!isGazeProfile(profile)) throw new Error(`알 수 없는 합성 관객 프로필: ${profile} (${GAZE_PROFILE_NAMES.join("|")})`);
  const P = GAZE_PROFILES[profile];
  const rng = mulberry32(seed);
  const sp = Math.max(0.05, Number(speed) || 1);
  const phase = [rng() * 6.283, rng() * 6.283, rng() * 6.283];

  let tSim = 0;                        // 합성 관객의 시계 — 영화 시간(실제 초 × speed)
  let yaw = 0, pitch = 0, z = 0, y = SEAT_Y;
  let targetYaw = 0, targetZ = 0, targetY = SEAT_Y, rate = P.returnRate, holdUntil = -Infinity, standUntil = -Infinity;
  let restAz = 0;                      // 쉴 때 보는 곳(옆사람 방향 × restFactor 등). 페이지가 setRest 로 준다
  let wanderOff = 0, nextWanderAt = P.wander ? between(rng, P.wander.every) : Infinity;
  let nextGlanceAt = P.glance ? 3 : Infinity;
  const active = [];                   // 진행 중 사건 {name, azimuth, kind, channel, at(실제 초), until(실제 초)}
  const fired = new Set();
  const log = [];                      // trigger 기록(테스트·세션용)
  let last = { yaw: 0, pitch: 0, roll: 0, x: 0, y: SEAT_Y, z: 0 };

  /** 사건 발동. dur 는 실제 초(페이지가 센서에 넘기는 값과 같다) — 안에서 영화 시간으로 되돌린다. */
  function trigger({ name, azimuth = 0, dur = 2, kind = "probe", channel = "av" } = {}) {
    const k = kind === "track" ? "track" : kind === "startle" ? "startle" : "probe";
    const untilSim = tSim + Math.max(0.2, (Number(dur) || 2) * sp);
    active.push({ name, azimuth, kind: k, channel, at: tSim, until: untilSim });
    log.push({ name, azimuth, kind: k, channel, at: Math.round(tSim * 100) / 100 });
    const behind = k !== "track" && Math.abs(azimuth) >= BEHIND_DEG;
    targetYaw = clampDeg(azimuth * pick(P.orient, k, false));
    rate = P.rate;
    holdUntil = tSim + pick(P.hold, k, behind);
    targetZ = pick(P.retreat, k, behind);
    const up = P.standUp ? pick(P.standUp, k, behind) : 0;
    if (up > 0) { targetY = SEAT_Y + up; standUntil = holdUntil + 1.2; }
    return { targetYaw, holdUntil };
  }

  /** 쉴 때 보는 방위(도). 옆사람이 앉으면 페이지가 그 방위를 넣는다. null 이면 정면. */
  function setRest(az) { restAz = Number.isFinite(az) ? az * P.restFactor : 0; }

  /**
   * 한 프레임. t 는 영화 시간(예정 탐침 발동용), dt 는 실제 경과 초(안에서 speed 를 곱해 영화 시간으로 민다).
   * @returns {{yaw:number, pitch:number, roll:number, x:number, y:number, z:number}}
   */
  function step(t, dt) {
    if (!(dt > 0)) return last;
    // 예정 탐침은 시간을 밀기 전에 발동한다 — 페이지가 step() 직전에 trigger() 를 부르는 것과 같은 시각이 되도록
    for (const p of probes) {
      if (!fired.has(p.name) && t >= p.t) {
        fired.add(p.name);
        trigger({ name: p.name, azimuth: p.azimuth, dur: (p.dur ?? 2) / sp, kind: p.kind, channel: p.channel });
      }
    }
    const ds = dt * sp;                // 영화 시간 증분
    tSim += ds;
    for (let i = active.length - 1; i >= 0; i--) if (tSim > active[i].until + 1) active.splice(i, 1);

    const holding = tSim <= holdUntil;
    if (!holding) {
      // 쉬는 자세 — 옆사람 쪽(rest) 또는 두리번(wander)
      if (P.wander && tSim >= nextWanderAt) { wanderOff = (rng() * 2 - 1) * P.wander.amp; nextWanderAt = tSim + between(rng, P.wander.every); }
      targetYaw = clampDeg(restAz + (P.wander ? wanderOff : 0));
      rate = P.wander ? P.wander.rate : P.returnRate;
      targetZ = 0;
      if (tSim > standUntil) targetY = SEAT_Y;
      // 공포형의 불안한 재확인 — 추적 사건(인물)이 진행 중이면 몇 초마다 그쪽을 짧게 힐끗
      const track = P.glance ? active.find((a) => a.kind === "track" && tSim <= a.until) : null;
      if (track && tSim >= nextGlanceAt) {
        targetYaw = clampDeg(track.azimuth * P.glance.factor);
        rate = P.glance.rate;
        holdUntil = tSim + P.glance.hold;
        nextGlanceAt = tSim + between(rng, P.glance.every);
      }
    }

    // 1차 지연 + 각속도 상한(사람 고개의 범위, 영화 초 기준) — 상한이 없으면 첫 프레임에 20° 넘게 뛰어 1000°/s 가 넘는다
    const dYaw = (targetYaw - yaw) * Math.min(1, rate * ds);
    yaw += Math.max(-P.maxVel * ds, Math.min(P.maxVel * ds, dYaw));
    z += (targetZ - z) * Math.min(1, 6 * ds);
    y += (targetY - y) * Math.min(1, 8 * ds);
    pitch += ((z > 0.02 ? -3 : 0) - pitch) * Math.min(1, 4 * ds); // 물러날 때 턱을 살짝 당긴다

    // 저주파 흔들림 — 두 정현파의 합(같은 seed 면 같은 위상)
    const w = 2 * Math.PI * P.sway.hz;
    const swayYaw = P.sway.amp * (Math.sin(w * tSim + phase[0]) + 0.4 * Math.sin(2.3 * w * tSim + phase[1]));
    const swayPitch = 0.5 * P.sway.amp * Math.sin(0.7 * w * tSim + phase[2]);
    const roll = 0.3 * P.sway.amp * Math.sin(0.5 * w * tSim + phase[1]);

    last = { yaw: yaw + swayYaw, pitch: pitch + swayPitch, roll, x: 0, y, z };
    return last;
  }

  return {
    profile, label: P.label, seed,
    step, trigger, setRest,
    get last() { return last; },
    get elapsed() { return tSim; },   // 영화 시간
    get triggered() { return log.slice(); },
  };
}
