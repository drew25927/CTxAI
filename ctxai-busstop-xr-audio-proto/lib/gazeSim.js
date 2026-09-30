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
    // 그쪽을 보는 시간(s). behind = 뒤쪽(|방위| ≥ BEHIND_DEG) 사건이 우선. probe 는 3초 미만 — 무서워서 포스터를 오래
    // 못 읽는다(팀 등급표 S3:B 힐끗). 3.2 로 두면 S3:A(몸 돌려 읽음 = 코미디 3점)가 돼 S5:A 와 동점 → 로맨스로 새던 값.
    hold: { probe: 2.2, startle: 3.2, track: 1.0, behind: 3.2 },
    retreat: { probe: 0.03, startle: 0.09, track: 0, behind: 0.09 }, // 뒤로 물러남(m)
    standUp: { behind: 0.35 },                            // 보이지 않는 뒤쪽 소리(개구리·비명)에 벌떡(m)
    returnRate: 0.9,                                      // 느린 회복(1/s)
    // track 중 "불안한 재확인". linger = 센서의 추적 창이 닫힌 뒤에도 이만큼(영화 초) 더 힐끗거린다 — 판초 인물은 1:53 에
    // 관찰이 끝나도 1:58 까지 화면에 있으므로 "그 사람 어디 갔지" 하고 계속 살핀다. 팀 등급표의 S1:B(반복 확인)는
    // 사건 종료 1.5초 뒤에 다시 봐야 잡히므로(headPoseSense recheck) 이 여운이 없으면 공포형이 S1:A(지속 관찰=로맨스)로 새어 나간다.
    glance: { every: [3.5, 5.5], factor: 0.5, hold: 1.2, rate: 10, linger: 8 },
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

// 용량 배율 — 슬롯 변형(lib/slotActuate.js)이 용량 d 를 주면 정향 각·후퇴를 d/DOSE_REF 배로 낸다(관객 응답 모델 r = g·d 와 같은 선형 가정).
// DOSE_REF 는 /film 도입부 큐의 볼륨(0.8, 제어 OFF 의 값)이라 용량을 안 주거나 0.8 이면 지금까지의 궤적과 같다. 배율 범위는 사람 고개의 범위 안(잠정치).
export const DOSE_REF = 0.8;
export const DOSE_SCALE = Object.freeze({ min: 0.5, max: 1.25 });
/** 용량 → 반응 배율. null/undefined 면 1. */
export function doseFactor(dose) {
  if (dose == null || !Number.isFinite(dose)) return 1;
  return Math.max(DOSE_SCALE.min, Math.min(DOSE_SCALE.max, dose / DOSE_REF));
}

// 말하는 사람을 본다(B67) — 옆사람이 대사를 하는 동안(질문 뒤 기다리는 시간 포함)은 쉬는 방위를 옆사람 쪽으로 이만큼
// (프로필 restFactor 보다 작으면 이 값)까지 돌리고, 돌아보는 속도도 rate 이상으로 올린다. 호기심형의 두리번은 멈춘다.
// 까닭: 공포형 restFactor 0.35 는 옆사람 방위(63° 상한)의 22° 만 돌아, 가로 시야 ±46°(1600×900, fov 60) 밖에 있는
// 옆사람(방위 ≈ 87°)이 대사 내내 프레임에 들어오지 않았다(시연 영상에 화자가 안 나옴). 사람은 옆에서 누가 말하면
// 대개 그쪽을 본다 — 창작값이지만 프로필과 무관한 한 값으로 둔다. 카메라와 센서는 계속 같은 자세를 쓴다.
// rate 는 질문 뒤 기다림(answerWatch)이 시작되기 전에 수렴하도록 빠르게 둔다 — 느리면 기다리는 동안 남은 회전이
// "가로젓기"(폭 12°)로 읽혀 가짜 응답이 된다(scripts/test-gaze-sim.mjs 가 확인).
export const TALK = Object.freeze({ factor: 0.9, rate: 2.5 });

// 앉은 옆사람을 볼 때의 쉬는 시선 pitch(도 · 위 +)(B234) — /interim 인사 구간·?look=1 처럼 "앉아 있는 옆사람" 을 쉬는 시선으로 볼 때
// 페이지가 setRest(az, { pitch: SEATED_LOOK_PITCH }) 로 준다. 카메라(눈높이 1.15 m · 세로 fov 60°)가 1.3~1.7 m 옆의 옆사람 얼굴을
// 수평으로 보면 프레임 아랫변이 좌면 높이(0.5 m) 언저리에 걸려 무릎·좌면이 잘리고, 앉은 사람이 선 사람처럼 읽혔다(검토 턴 62 인사 프레임).
// 8° 내리면 아랫변이 0.1~0.2 m 까지 내려와 좌면·무릎이 들어온다. 창작값이다. 사건(hold) 중에는 0 으로 돌아가 사건 쪽을 본다.
// 헤드셋 관객에게는 해당 없다(합성 관객 전용). 주지 않으면 0 이라 종전 궤적과 같다.
export const SEATED_LOOK_PITCH = -8;
const REST_PITCH_MAX = 20; // 쉬는 pitch 상한(도) — 흔들림·후퇴 항을 더해도 |pitch| ≤ 30 안에 두기 위해

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
  let restPitch = 0;                   // 쉴 때의 시선 pitch(도 · 위 +) — 앉은 옆사람의 무릎·좌면이 프레임에 들어오게 내릴 때(B234). setRest(az, {pitch})
  let talking = false;                 // 옆사람이 말하는 중(B67) — setRest(az, {talk}) 로 페이지가 준다
  let wanderOff = 0, nextWanderAt = P.wander ? between(rng, P.wander.every) : Infinity;
  let nextGlanceAt = P.glance ? 3 : Infinity;
  const active = [];                   // 진행 중 사건 {name, azimuth, kind, channel, at(실제 초), until(실제 초)}
  const fired = new Set();
  const log = [];                      // trigger 기록(테스트·세션용)
  let last = { yaw: 0, pitch: 0, roll: 0, x: 0, y: SEAT_Y, z: 0 };

  /** 사건 발동. dur 는 실제 초(페이지가 센서에 넘기는 값과 같다) — 안에서 영화 시간으로 되돌린다.
   *  dose 는 슬롯 변형의 용량(있으면 정향 각·후퇴를 doseFactor 배로, 없으면 1 — 도입부 탐침·미세 자극은 주지 않는다). */
  function trigger({ name, azimuth = 0, dur = 2, kind = "probe", channel = "av", dose = null } = {}) {
    const k = kind === "track" ? "track" : kind === "startle" ? "startle" : "probe";
    const untilSim = tSim + Math.max(0.2, (Number(dur) || 2) * sp);
    const amp = doseFactor(dose);
    active.push({ name, azimuth, kind: k, channel, at: tSim, until: untilSim });
    log.push({ name, azimuth, kind: k, channel, dose: dose ?? null, amp, at: Math.round(tSim * 100) / 100 });
    const behind = k !== "track" && Math.abs(azimuth) >= BEHIND_DEG;
    targetYaw = clampDeg(azimuth * pick(P.orient, k, false) * amp);
    rate = P.rate;
    holdUntil = tSim + pick(P.hold, k, behind);
    targetZ = pick(P.retreat, k, behind) * amp;
    const up = P.standUp ? pick(P.standUp, k, behind) : 0;
    if (up > 0) { targetY = SEAT_Y + up; standUntil = holdUntil + 1.2; }
    return { targetYaw, holdUntil };
  }

  /** 쉴 때 보는 방위(도). 옆사람이 앉으면 페이지가 그 방위를 넣는다. null 이면 정면.
   *  talk: 그 사람이 지금 말하는 중이면 true — 방위의 max(restFactor, TALK.factor) 만큼 본다(B67).
   *  factor: 비율을 직접 준다(1 = 그 방위를 똑바로 본다) — /interim ?look=1 증거·시연용(B170b). 주지 않으면 종전과 같다.
   *  pitch: 쉴 때의 시선 pitch(도 · 위 +) — 앉은 옆사람의 무릎·좌면이 프레임에 들어오게 내릴 때 SEATED_LOOK_PITCH(B234). 주지 않으면 0(종전과 같다).
   *         사건(hold) 중에는 무시하고 0 을 향한다. ±REST_PITCH_MAX 로 자른다. */
  function setRest(az, { talk = false, factor = null, pitch = 0 } = {}) {
    talking = !!talk && Number.isFinite(az);
    const f = Number.isFinite(factor) ? factor : talking ? Math.max(P.restFactor, TALK.factor) : P.restFactor;
    restAz = Number.isFinite(az) ? az * f : 0;
    restPitch = Number.isFinite(pitch) ? Math.max(-REST_PITCH_MAX, Math.min(REST_PITCH_MAX, pitch)) : 0;
  }

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
    const keep = Math.max(1, P.glance?.linger ?? 0); // 추적 사건은 재확인 여운(linger)만큼 더 살려 둔다
    for (let i = active.length - 1; i >= 0; i--) if (tSim > active[i].until + (active[i].kind === "track" ? keep : 1)) active.splice(i, 1);

    const holding = tSim <= holdUntil;
    if (!holding) {
      // 쉬는 자세 — 옆사람 쪽(rest) 또는 두리번(wander)
      if (P.wander && tSim >= nextWanderAt) { wanderOff = (rng() * 2 - 1) * P.wander.amp; nextWanderAt = tSim + between(rng, P.wander.every); }
      targetYaw = clampDeg(restAz + (P.wander && !talking ? wanderOff : 0));
      rate = P.wander ? P.wander.rate : P.returnRate;
      if (talking) rate = Math.max(rate, TALK.rate);
      targetZ = 0;
      if (tSim > standUntil) targetY = SEAT_Y;
      // 공포형의 불안한 재확인 — 추적 사건(인물)이 진행 중이면 몇 초마다 그쪽을 짧게 힐끗
      const track = P.glance ? active.find((a) => a.kind === "track" && tSim <= a.until + (P.glance.linger ?? 0)) : null;
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
    // pitch — 쉴 때는 restPitch(앉은 옆사람을 볼 때 −8° · B234), 사건(hold) 중에는 0(사건 쪽을 본다), 물러날 때는 턱을 살짝 당긴다(−3°)
    const pitchTarget = (holding ? 0 : restPitch) + (z > 0.02 ? -3 : 0);
    pitch += (pitchTarget - pitch) * Math.min(1, 4 * ds);

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
    get talking() { return talking; },
    get triggered() { return log.slice(); },
  };
}
