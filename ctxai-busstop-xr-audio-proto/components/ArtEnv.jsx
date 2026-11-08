"use client";

// 움직이는 아트 소품 — 트럭·고양이(ART/BUS_STOP_XR_SOFT_FINISH_V03.blend → scripts/blender/export_art_env.py → public/reactive/art/*.glb).
// 정적 장면(쉘터·카페·도로·숲)은 components/ArtWorld.jsx.
//
// GLB 좌표 = Blender 좌표를 Y-up 으로 바꾼 것: (x, y, z) = (bx, bz, −by). 그래서 각 소품은
//   "원본에서의 기준점 C 를 장면의 목표 위치 T 로" 옮기는 한 줄(바깥 그룹 = T·회전·크기, 안쪽 그룹 = −C)로 끝난다.
// 기준점·방향은 원본을 직접 재서 정했다(주석 참고) — 값이 어긋나면 이 파일의 상수만 고치면 된다.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Vector3 } from "three";

// unity = 10/3 V03 원본에서 뽑은 것, v13 = 11/8 아트 V13 원본(scripts/blender/export_world_v13.py — 트럭은 청록 재도장판).
// 기준점(C)은 원본에서 잰 값: 트럭 차체 중심, 고양이 발 밑 중심 (GLB 좌표 x, z).
const URLS = {
  unity: { truck: "/reactive/art/truck.glb", cat: "/reactive/art/cat.glb", truckC: [3.66, 8.15], catC: [-0.45, 2.41] },
  // V13 고양이는 머리가 −y_B(= GLB +z) 쪽이다 — 꼬리를 높이 세워 가장 높은 점이 꼬리라 헷갈렸다(머리 쪽이 폭 0.18m·정점 4배, 2026-11-08 실측).
  v13: { truck: "/reactive/art_v13/truck.glb", cat: "/reactive/art_v13/cat.glb", truckC: [3.55, 8.15], catC: [-0.45, 1.635], catHead: 1 },
};

function useModel(url) {
  const { scene } = useGLTF(url, false, true);
  return useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return c;
  }, [scene]);
}
function Model({ url }) {
  return <primitive object={useModel(url)} />;
}

// 트럭 바퀴 굴리기 — V13 트럭 GLB 에는 바퀴가 WHEEL_FL/FR/RL/RR 노드로 떨어져 있고 원점이 차축이다
// (scripts/blender/export_world_v13.py). 차축은 Blender Y = glTF −Z 라, 캡 쪽(−X)으로 달릴 때 glTF Z 기준 +거리/반지름.
// 트럭이 실제로 움직인 거리(월드)만큼 돌린다. 반지름은 원본에서 잰 값(축 높이 − 바닥).
const TRUCK_WHEEL_R = { WHEEL_FL: 0.469, WHEEL_FR: 0.508, WHEEL_RL: 0.511, WHEEL_RR: 0.516 };
function RollingTruck({ url }) {
  const obj = useModel(url);
  const wheels = useMemo(() => Object.keys(TRUCK_WHEEL_R).map((n) => [obj.getObjectByName(n), TRUCK_WHEEL_R[n]]).filter(([w]) => w), [obj]);
  const st = useRef({ prev: null, dist: 0 });
  const wp = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (!wheels.length) return;
    obj.getWorldPosition(wp);
    const s = st.current;
    if (s.prev) s.dist += wp.distanceTo(s.prev);
    s.prev = (s.prev || new Vector3()).copy(wp);
    for (const [w, r] of wheels) w.rotation.z = s.dist / r;
  });
  return <primitive object={obj} />;
}

// 트럭 — 원본에서 캡이 −X, 적재함이 +X(= 오른쪽→왼쪽으로 달리는 방향과 같다). 기존 Truck 은 로컬 +z 가 앞이라
// 바깥 −π/2 회전과 합쳐 +π/2 를 한 번 더 돌린다. 기준점 = 차체 중심(x 3.66, z −8.15), 바퀴 바닥이 y −0.08.
export function ArtTruck({ world = "v13" }) {
  const U = URLS[world] || URLS.unity;
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <group position={[-U.truckC[0], 0.08, U.truckC[1]]}><RollingTruck url={U.truck} /></group>
    </group>
  );
}

// 고양이 — unity(V03) 판은 머리가 +y_B(= GLB −z) 쪽이라 π 돌리고, V13 판은 머리가 GLB +z 쪽이라 그대로 둔다(catHead). 기존 Cat 은 로컬 +z 가 앞. 기준점 = 발 밑 중심(−0.45, 2.41).
// 원본은 선 자세 하나뿐이라 달릴 땐 몸을 위아래로 들썩이고 앞뒤로 살짝 기울여 달리는 느낌만 낸다.
// 고양이 걸음 — 원본은 선 자세 하나뿐이라, 셰이더로 다리(발 밑에서 약 22cm까지)만 앞뒤로 흔들고 디딜 때 살짝 든다.
// 발끝일수록 크게, 대각선 짝(앞왼쪽+뒤오른쪽)끼리 같은 박자 — 실제 고양이 걸음. 달릴 때만, 멈춰 응시할 땐 가만히.
// 좌표는 GLB 메시 자체 공간(양자화 −1…1): y −1 = 발바닥, z < 0 = 머리 쪽, x 부호 = 좌우.
const CAT_LEG_TOP = -0.37; // 0.22m / 0.70m 높이를 −1…1 로
// head: 머리가 메시 +z 쪽이면 1, −z 쪽이면 −1. 발을 들 때(cos>0) 머리 쪽으로 내딛어야 앞으로 걷는다.
function CatModel({ url, running, bob, head = -1 }) {
  const obj = useModel(url);
  const u = useMemo(() => ({ uPhase: { value: 0 }, uAmp: { value: 0 }, uHead: { value: head } }), [head]);
  const mats = useMemo(() => {
    const out = [];
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material.clone();
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uPhase = u.uPhase; sh.uniforms.uAmp = u.uAmp; sh.uniforms.uHead = u.uHead;
        sh.vertexShader = "uniform float uPhase;\nuniform float uAmp;\nuniform float uHead;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          if ( transformed.y < ${CAT_LEG_TOP.toFixed(2)} ) {
            float w = clamp( ( ${CAT_LEG_TOP.toFixed(2)} - transformed.y ) / ( ${CAT_LEG_TOP.toFixed(2)} + 1.0 ), 0.0, 1.0 );
            float side = transformed.x >= 0.0 ? 1.0 : -1.0;
            float fb = transformed.z * uHead > 0.0 ? 1.0 : -1.0;
            float ph = uPhase + ( side * fb > 0.0 ? 0.0 : 3.14159 );
            transformed.z += uHead * sin( ph ) * uAmp * w * 0.16;
            transformed.y += max( 0.0, cos( ph ) ) * uAmp * w * 0.06;
          }`);
      };
      m.customProgramCacheKey = () => "film-cat-gait";
      o.material = m; out.push(m);
    });
    return out;
  }, [obj, u]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame((_, dt) => {
    u.uPhase.value = (bob || 0) * 7; // 몸 들썩임(bob*14)의 절반 — 한 걸음에 두 번 들썩인다
    const target = running ? 1 : 0;
    u.uAmp.value += (target - u.uAmp.value) * Math.min(1, dt * 6);
  });
  return <primitive object={obj} />;
}

export function ArtCat({ x, z, running, facingBench, bob, yaw, world = "v13" }) {
  const U = URLS[world] || URLS.unity;
  const rot = yaw ?? (facingBench ? 0.2 : -Math.PI / 2);
  const y = running ? Math.abs(Math.sin(bob * 14)) * 0.05 : 0;
  const pitch = running ? Math.sin(bob * 14) * 0.07 : 0;
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <group rotation={[pitch, 0, 0]}>
        <group rotation={[0, U.catHead === 1 ? 0 : Math.PI, 0]}>
          <group position={[-U.catC[0], 0, U.catC[1]]}><CatModel url={U.cat} running={running} bob={bob} head={U.catHead ?? -1} /></group>
        </group>
      </group>
    </group>
  );
}

export const ART_URLS = [URLS.v13.truck, URLS.v13.cat];
