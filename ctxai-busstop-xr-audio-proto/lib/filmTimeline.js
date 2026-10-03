// /film 타임라인 — 정류장_스크립트_v2.md §1 공통 도입부(다섯 관찰 단서)를 시간축에 놓고,
// 배우(우비 인물·트럭·고양이·옆사람·버스)의 위치를 시간의 순수 함수로 계산한다.
//
// 시간은 "영화 시간"(초). 데모용으로 speed 배수를 걸어 압축할 수 있다.
// 위치 좌표: 벤치 착석 지점 바닥 = (0,0,0), 정면 = -z, 오른쪽 = +x. 도로는 정면에서 좌우(x)로 지나간다.
//
// 오디오 큐의 key는 public/reactive/audio/manifest.json 의 sfx key다.

export const T = {
  poster: 6,
  cafeBell: 12,
  figureWalkEnd: 40,
  truckStart: 25, truckSplash: 29, truckEnd: 34,
  frog: 37,
  catIn: 43, catStop: 45, catOut: 46.5, catGone: 49,
  catScream: 52, clatter: 53,
  judge: 58,          // 우비 인물이 시야에서 사라지고, 판정 라벨(누가 앉는가)이 정해진다
  announce: 59,       // "272번 버스는 5분 후 도착 예정입니다"
  npcWalkStart: 62, npcSeated: 68, // 6초 걷기(−6 → 벤치 끝, 1.5m/s) — 관객 앞을 지나는 모습이 보이도록
  sceneStart: 69,     // 이때부터 대사 루프(페이지가 진행) — 상태는 계속 갱신된다
};

// 한 번만 발동하는 큐 — 오디오와 센서 사건. 페이지의 디렉터가 t가 큐를 지날 때 fire 한다.
export const CUES = [
  { t: 0.5, name: "ambience", sfx: "01", loop: true, volume: 0.45 },
  { t: T.poster, name: "poster", sfx: "14", volume: 0.7, sense: { azimuth: 72, dur: 3, kind: "probe" } },
  { t: T.cafeBell, name: "cafeBell", sfx: "09", volume: 0.55, sense: { azimuth: -38, dur: T.figureWalkEnd - T.cafeBell, kind: "track" } },
  { t: T.truckSplash - 0.6, name: "truckSplash", sfx: "02", volume: 0.9, sense: { azimuth: 8, dur: 2.5, kind: "startle" } },
  { t: T.frog, name: "frog", sfx: "10", volume: 0.8, sense: { azimuth: 135, dur: 3, kind: "probe" } },
  { t: T.catIn + 0.6, name: "cat", sfx: "11", volume: 0.8, sense: { azimuth: 30, dur: T.catGone - T.catIn - 0.6, kind: "startle" } },
  { t: T.catScream, name: "catScream", sfx: "12", volume: 0.9, sense: { azimuth: -115, dur: 2.5, kind: "probe" } },
  { t: T.clatter, name: "clatter", sfx: "13", volume: 0.7 },
  { t: T.judge, name: "judge" },
  { t: T.announce, name: "announce", slot: "vo_announce", volume: 1.0 },
  { t: T.npcWalkStart, name: "npcWalk" },
  { t: T.npcSeated, name: "npcSeated" },
  { t: T.sceneStart, name: "scene" },
];

import { nearLane, roadCenter } from "./artRoad.js";
const CAT_CURB_OFFSET = 1.15, ROAD_Y = -0.08; // 고양이 길: 가까운 차선 중앙에서 인도 쪽으로 1.15m(연석 바로 밖), 차도 노면 높이

// 아트 월드용 큐 — 우비 인물은 건너편 인도 앞쪽 왼쪽(−66°)에서 정면 쪽(−25°)으로 걸어오다 길을 건너므로(−63°)
// 그 가운데 −42°(허용 ±28° → −14~−70°)로 잡는다. 고양이는 오른쪽에서 들어와 정면(오른쪽 6°)에 멈춘다.
// 고양이는 정면 가까이(오른쪽 8°)에 멈추므로 관찰 방위를 30° → 15°(들어오는 길과 멈춤 자리 사이)로, 머무는 시간만큼 길게.
export const CUES_ART = CUES.map((c) => {
  if (c.name === "cafeBell") return { ...c, sense: { ...c.sense, azimuth: -42 } };
  if (c.name === "cat") return { ...c, sense: { ...c.sense, azimuth: 15, dur: 7.1 } };
  return c;
});

function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function seg(t, a, b) { return smooth((t - a) / (b - a)); }

/**
 * 시간 t(초) → 배우 상태. dominant는 판정 뒤 앉는 인물(R/H/C), npcDistance는 연출 상태에서 온 값.
 * busAt: 버스가 도착하기 시작한 시각(페이지가 대사 종료 시 설정). null이면 아직.
 */
// 배우 좌표계 — 관객이 서 있는 자리(쉘터 안 벤치 오른쪽 끝) 바닥 = 원점, 정면 = -z, 오른쪽 = +x.
// 도로: 가까운 차선 중심 z=-4.75, 건너편 차선 중심 z=-15.25 (연석 -3 / 중앙선 -10 / 건너편 연석 -17).
// 카페 (-19,-26) · 횡단보도 x=-5 · 공원 입구 숲 +x 쪽 · 풀숲 뒤 z>2.
function heading(dx, dz) { return Math.atan2(dx, dz); } // 모델 정면(+z)이 진행 방향을 보게 하는 yaw
const BUS_STOP_X = -1.2; // 정차 시 차체 중심. 앞문은 +2.4 → x≈1.2

// layout: "classic"(예전 코드 지형) | "art"(아트팀 Unity 월드, components/ArtWorld.jsx). 아트 월드는 도로·쉘터·카페 위치가
// 달라서 몇 군데 좌표가 바뀐다 — 가까운 차선 중앙 z −4.4, 트럭이 밟는 큰 물웅덩이 x≈−2, 옆사람 자리는 관객 왼쪽,
// 우비 인물은 건너편 인도 앞쪽 왼쪽에서 나타나 관객 앞에서 길을 건너고, 고양이는 쉘터 앞을 오른쪽→왼쪽으로 지나간다.
export function evalActors(t, { dominant = null, npcDistance = 0.9, busAt = null, leaveAt = null, layout = "classic" } = {}) {
  const a = {};
  const art = layout === "art";
  const laneZ = art ? -4.4 : -4.75;

  // 우비 인물 — 카페 문(-18,-24.4)에서 나와 횡단보도 건너편 끝(-5,-17.6)까지 걷고, 트럭이 지나가길
  // 기다렸다가(36~40s) 길을 건너(40~52s) 인도를 따라 정류장 왼쪽 옆(-2.8, 0.2)까지 오고(52~58s, 판정),
  // 정류장 왼쪽 관목(-3,1.9) 뒤로 돌아 들어가(58~61s) 사라진다 — 시야 안에서 갑자기 없어지지 않게.
  const figureEnd = T.judge + 3;
  if (art && t >= T.cafeBell && t < figureEnd) {
    // 아트 월드 — 아트팀 원래 동선은 카페(약 60m, −80°)에서 시작해 정류장 뒤편 보행로를 따라와 관객 시야 밖이었다(사용자 지적).
    // 그래서 도로 건너 인도 앞쪽 왼쪽(약 24m, −66°)에서 나타나 정면 쪽으로 걸어오다, 트럭이 지나간 뒤 관객 앞에서 길을 건너
    // 쉘터 왼쪽으로 들어온다 — 내내 관객 기준 −25~−66° 안에 있어 고개를 조금만 돌리면 보인다.
    const far = (x) => roadCenter(x) - 4.6, near = (x) => roadCenter(x) + 3.9; // 건너편 인도 / 이쪽 인도 중앙
    let x, z, walking = true, yaw;
    if (t < 36) { const p = seg(t, T.cafeBell + 1, 36); x = lerp(-24, -5, p); z = far(x); yaw = heading(1, far(x + 1) - far(x)); walking = t >= T.cafeBell + 1; }
    else if (t < 40) { x = -5; z = far(-5); walking = false; yaw = heading(0, 1); }               // 트럭이 지나가길 기다린다
    else if (t < 52) { const p = seg(t, 40, 52); x = -5; z = lerp(far(-5), near(-5), p); yaw = heading(0, 1); } // 관객 앞에서 길을 건넌다
    else if (t < T.judge) {                                                                          // 쉘터 앞 → 왼쪽 안쪽
      const p = (t - 52) / (T.judge - 52);
      if (p < 0.5) { x = lerp(-5, -2.4, p * 2); z = lerp(near(-5), -1.5, p * 2); yaw = heading(2.6, -1.5 - near(-5)); }
      else { x = lerp(-2.4, -2.17, (p - 0.5) * 2); z = lerp(-1.5, 0.74, (p - 0.5) * 2); yaw = heading(0.1, 1); }
    } else {                                                                                         // 판정 뒤 왼쪽 입구로 나가 뒤편 풀숲으로
      const p = (t - T.judge) / (figureEnd - T.judge);
      x = p < 0.5 ? lerp(-2.17, -4.6, p * 2) : lerp(-4.6, -5.6, (p - 0.5) * 2);
      z = p < 0.5 ? lerp(0.74, 0.8, p * 2) : lerp(0.8, 2.8, (p - 0.5) * 2);
      yaw = p < 0.5 ? heading(-1, 0) : heading(-0.5, 1);
    }
    a.figure = { visible: true, x, z, walking, yaw, bob: t };
  } else if (t >= T.cafeBell && t < figureEnd) {
    let x, z, walking = true;
    if (t < 36) { const p = seg(t, T.cafeBell + 1, 36); x = lerp(-18, -5, p); z = lerp(-24.4, -17.6, p); }
    else if (t < 40) { x = -5; z = -17.6; walking = false; }
    else if (t < 52) { const p = seg(t, 40, 52); x = -5; z = lerp(-17.6, -2.4, p); }
    else if (t < T.judge) { const p = (t - 52) / (T.judge - 52); x = lerp(-5, -2.8, p); z = lerp(-2.4, 0.2, p); }
    else { const p = (t - T.judge) / (figureEnd - T.judge); x = lerp(-2.8, -3.6, p); z = lerp(0.2, 2.8, p); }
    // 진행 방향으로 몸을 돌린다 (정지 중엔 도로를 본다)
    const yaw = t < 36 ? heading(13, 6.8) : t < 52 ? heading(0, 1) : t < T.judge ? heading(2.2, 2.6) : heading(-0.8, 2.6);
    a.figure = { visible: true, x, z, walking, yaw, bob: t };
  } else a.figure = { visible: false };

  // 포터 트럭 — 가까운 차선을 오른쪽에서 왼쪽으로(v2.md §1-3). 정류장 앞(x≈0.6)에서 물웅덩이를 밟는다.
  if (t >= T.truckStart && t <= T.truckEnd) {
    const p = (t - T.truckStart) / (T.truckEnd - T.truckStart);
    // 54m/9s ≈ 22km/h — 정면 시야(±48°)에 2초쯤 머문다. 아트 월드는 물웅덩이가 x≈−2 라 끝점을 −38 로 늘려 물보라 순간(29s)에 그 위를 지나게 한다
    const tx = lerp(27, art ? -38 : -27, p);
    if (art) { const l = nearLane(tx); a.truck = { visible: true, x: tx, z: l.z, yaw: Math.atan2(-1, -l.slope) }; } // 휜 도로를 따라 −x 로
    else a.truck = { visible: true, x: tx, z: laneZ };
    a.splash = t >= T.truckSplash - 0.2 && t <= T.truckSplash + 1.2 ? (t - (T.truckSplash - 0.2)) / 1.4 : null;
  } else { a.truck = { visible: false }; a.splash = null; }

  // 고양이 — 오른쪽 공원 진입로(9,-2.6)에서 뛰어들어 벤치 앞(0.9,-1.5)에 멈춰 관객을 보고, 왼쪽(-9,-2.2)으로 달아난다.
  // 아트 월드 — 쉘터 기준 오른쪽에서 왼쪽으로 지나간다(사용자 요청). 시야 밖(오른쪽 57°)에서 걸어 들어와 연석 바로 밖 차도 가장자리
  // (가까운 차선 중앙 +1.15m ≈ z −3.2, 노면 y −0.08)를 천천히 가로지르다 거의 정면(0.35, −3.2 — 오른쪽 6°·아래 22°)에 멈춰
  // 2초간 관객을 보고, 다시 왼쪽으로 빠져나간다(큰 물웅덩이 x≈−2 를 지난다). 관객이 서 있게 바뀌어(눈 1.6m) 인도(z −2.05)에
  // 멈추면 아래 31° 로 화면 밑에 걸려 차도 쪽으로 1.15m 물렸다. 트럭(25–34s)과 겹치지 않는다. 비명(52s)은 그대로.
  const catT = art ? { in: T.catIn, stop: T.catIn + 3.2, out: T.catIn + 5.2, gone: T.catIn + 7.7 } : null;
  if (art && t >= catT.in && t <= catT.gone) {
    let x, running = true, facingBench = false, yaw = -Math.PI / 2;
    if (t < catT.stop) { const p = (t - catT.in) / (catT.stop - catT.in); x = lerp(5.5, 0.35, p); } // 걷는 속도로 일정하게
    else if (t < catT.out) { x = 0.35; running = false; facingBench = true; }
    else { const p = seg(t, catT.out, catT.gone); x = lerp(0.35, -6.5, p); }
    const z = nearLane(x).z + CAT_CURB_OFFSET;
    if (facingBench) yaw = heading(-x, -z);
    a.cat = { visible: true, x, y: ROAD_Y, z, running, facingBench, yaw, bob: t };
  } else if (!art && t >= T.catIn && t <= T.catGone) {
    let x, z, running = true, facingBench = false;
    if (t < T.catStop) { const p = seg(t, T.catIn, T.catStop); x = lerp(9, 0.9, p); z = lerp(-2.6, -1.5, p); }
    else if (t < T.catOut) { x = 0.9; z = -1.5; running = false; facingBench = true; }
    else { const p = seg(t, T.catOut, T.catGone); x = lerp(0.9, -9, p); z = lerp(-1.5, -2.2, p); }
    a.cat = { visible: true, x, z, running, facingBench, bob: t };
  } else a.cat = { visible: false };

  // 포스터 — 바람에 파닥이는 순간
  a.posterFlutter = t >= T.poster && t < T.poster + 2.5 ? Math.sin((t - T.poster) * 18) * Math.exp(-(t - T.poster) * 1.4) : 0;

  // 옆사람 — 왼쪽 인도(-6,-1.7)에서 인도를 따라 걸어와(관객 앞 1.5m 를 지나며 얼굴이 보인다) 벤치 오른쪽 끝 앞에서
  // 멈춰 돌아선 뒤 앉는다. 관객 코앞(0.5m 안)으로는 절대 들어오지 않는다. 착석 뒤 거리는 연출 상태가 정한다.
  if (dominant && t >= T.npcWalkStart) {
    // 아트 월드는 벤치가 관객 왼쪽으로 뻗어 있어(좌면 x −1.67…0.53) 옆사람이 왼쪽에 앉는다 — 왼쪽 인도에서 걸어와 바로 앉는다
    const seatX = art ? Math.max(-1.55, -(0.35 + npcDistance)) : 0.35 + npcDistance;
    const turnAt = T.npcSeated - 1.1;
    if (art) {
      if (t < turnAt) {
        const p = (t - T.npcWalkStart) / (turnAt - T.npcWalkStart);
        a.npc = { visible: true, x: lerp(-7.5, seatX, p), z: lerp(-1.6, -1.2, p), seated: false, walking: true, yaw: heading(7.5 + seatX, 0.4), bob: t };
      } else if (t < T.npcSeated) {
        const p = seg(t, turnAt, T.npcSeated);
        a.npc = { visible: true, x: seatX, z: lerp(-1.2, 0.3, p), seated: false, walking: true, yaw: lerp(heading(7.5 + seatX, 0.4), Math.PI + 0.15, p), bob: t };
      } else {
        a.npc = { visible: true, x: seatX, z: 0.3, seated: true, walking: false, yaw: Math.PI, bob: t };
      }
    } else if (t < turnAt) {
      const p = (t - T.npcWalkStart) / (turnAt - T.npcWalkStart); // 등속 — 걷는 사람은 가감속이 거의 없다
      const x = lerp(-6, seatX + 0.15, p), z = lerp(-1.7, -1.25, p);
      a.npc = { visible: true, x, z, seated: false, walking: true, yaw: heading(seatX + 6.15, 0.45), bob: t };
    } else if (t < T.npcSeated) {
      const p = seg(t, turnAt, T.npcSeated);
      const x = lerp(seatX + 0.15, seatX, p), z = lerp(-1.25, 0.3, p);
      // 벤치 앞에서 몸을 돌려(도로 쪽을 보며) 뒷걸음으로 앉는다 — 착석 yaw(π+0.15)와 이어져 툭 돌지 않는다
      a.npc = { visible: true, x, z, seated: false, walking: true, yaw: lerp(heading(seatX + 6.15, 0.45), Math.PI + 0.15, p), bob: t };
    } else {
      a.npc = { visible: true, x: seatX, z: 0.3, seated: true, walking: false, yaw: Math.PI, bob: t };
    }
  } else a.npc = { visible: false };

  // 272번 버스 — 왼쪽 커브 너머(v1.1)에서 가까운 차선으로 와서 정류장 앞에 선다. 차체 중심 x=−1.2 에 서면
  // 앞문(차체 앞쪽 2.4m)이 관객 정면 오른쪽 x≈1.2 에 온다. 문이 열리고 인물이 떠난다.
  if (busAt != null && t >= busAt) {
    const p = seg(t, busAt, busAt + 7);
    const x = lerp(-48, BUS_STOP_X, p);
    const stopped = t >= busAt + 7;
    a.bus = { visible: true, x, z: laneZ, stopped, doorOpen: stopped, headlight: 1 - p * 0.4 };
    if (art) { const l = nearLane(x); a.bus.z = l.z; a.bus.yaw = Math.atan2(1, l.slope); } // 휜 도로를 따라 +x 로
    // 인물 퇴장 — 공포: 벤치 뒤 풀숲으로 / 로맨스·코미디: 버스 문 앞(1.2,-2.6)으로. 정차는 9초(문 열림 1초 뒤 일어선다)
    if (stopped && a.npc.visible) {
      const q = seg(t, busAt + 8, busAt + 14);
      if (dominant === "H") {
        // 공포: 벤치 뒤 풀숲으로 — 아트 월드에선 옆사람이 왼쪽에 있으니 왼쪽 뒤로
        if (art) {
          // 아트 쉘터는 뒤가 반투명 유리 벽이라 대각선으로 가면 벽을 뚫는다 — 손님이 들어온 왼쪽 입구(z≈0.7)로 나가 뒤편 풀숲으로
          const x = q < 0.5 ? lerp(a.npc.x, -3.6, q * 2) : lerp(-3.6, -4.6, (q - 0.5) * 2);
          const z = q < 0.5 ? lerp(0.3, 0.7, q * 2) : lerp(0.7, 3.2, (q - 0.5) * 2);
          a.npc = { ...a.npc, seated: false, walking: q < 1, x, z, yaw: q < 0.5 ? heading(-1, 0.15) : heading(-0.4, 1), bob: t, visible: q < 1 };
        } else {
          a.npc = { ...a.npc, seated: false, walking: q < 1, x: lerp(a.npc.x, 1.6, q), z: lerp(0.3, 3.6, q), yaw: heading(0.5, 3.3), bob: t, visible: q < 1 };
        }
      }
      else a.npc = { ...a.npc, seated: false, walking: q < 1, x: lerp(a.npc.x, BUS_STOP_X + 2.4, q), z: lerp(0.3, -2.7, q), yaw: heading(BUS_STOP_X + 2.4 - a.npc.x, -3.0), bob: t, visible: q < 0.98 };
    }
    // 출발 시각 — 기본 +16. 마지막 말이 길면(배속 관찰 등) 디렉터가 leaveAt 을 뒤로 민다: 문은 말이 끝날 때까지 열려 있다
    const leave = Math.max(leaveAt ?? busAt + 16, busAt + 16);
    a.bus.doorOpen = stopped && t < leave;
    a.busLeaving = t >= leave ? seg(t, leave, leave + 6) : 0;
    if (a.busLeaving > 0) {
      a.bus.x = lerp(BUS_STOP_X, 50, a.busLeaving);
      if (art) { const l = nearLane(a.bus.x); a.bus.z = l.z; a.bus.yaw = Math.atan2(1, l.slope); }
    }
    a.fade = t >= leave + 3 ? seg(t, leave + 3, leave + 7) : 0;
  } else { a.bus = { visible: false }; a.busLeaving = 0; a.fade = 0; }

  return a;
}
