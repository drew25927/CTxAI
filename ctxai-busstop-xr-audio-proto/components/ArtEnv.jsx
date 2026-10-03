"use client";

// 움직이는 아트 소품 — 트럭·고양이(ART/BUS_STOP_XR_SOFT_FINISH_V03.blend → scripts/blender/export_art_env.py → public/reactive/art/*.glb).
// 정적 장면(쉘터·카페·도로·숲)은 components/ArtWorld.jsx.
//
// GLB 좌표 = Blender 좌표를 Y-up 으로 바꾼 것: (x, y, z) = (bx, bz, −by). 그래서 각 소품은
//   "원본에서의 기준점 C 를 장면의 목표 위치 T 로" 옮기는 한 줄(바깥 그룹 = T·회전·크기, 안쪽 그룹 = −C)로 끝난다.
// 기준점·방향은 원본을 직접 재서 정했다(주석 참고) — 값이 어긋나면 이 파일의 상수만 고치면 된다.

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";

const URL = {
  truck: "/reactive/art/truck.glb",
  cat: "/reactive/art/cat.glb",
};

function Model({ url }) {
  const { scene } = useGLTF(url, false, true);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return c;
  }, [scene]);
  return <primitive object={obj} />;
}

// 트럭 — 원본에서 캡이 −X, 적재함이 +X(= 오른쪽→왼쪽으로 달리는 방향과 같다). 기존 Truck 은 로컬 +z 가 앞이라
// 바깥 −π/2 회전과 합쳐 +π/2 를 한 번 더 돌린다. 기준점 = 차체 중심(x 3.66, z −8.15), 바퀴 바닥이 y −0.08.
export function ArtTruck() {
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <group position={[-3.66, 0.08, 8.15]}><Model url={URL.truck} /></group>
    </group>
  );
}

// 고양이 — 원본에서 머리가 +y_B(= GLB −z) 쪽이다. 기존 Cat 은 로컬 +z 가 앞이라 π 돌린다. 기준점 = 발 밑 중심(−0.45, 2.41).
// 원본은 선 자세 하나뿐이라 달릴 땐 몸을 위아래로 들썩이고 앞뒤로 살짝 기울여 달리는 느낌만 낸다.
export function ArtCat({ x, z, running, facingBench, bob, yaw }) {
  const rot = yaw ?? (facingBench ? 0.2 : -Math.PI / 2);
  const y = running ? Math.abs(Math.sin(bob * 14)) * 0.05 : 0;
  const pitch = running ? Math.sin(bob * 14) * 0.07 : 0;
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <group rotation={[pitch, 0, 0]}>
        <group rotation={[0, Math.PI, 0]}>
          <group position={[0.45, 0, 2.41]}><Model url={URL.cat} /></group>
        </group>
      </group>
    </group>
  );
}

export const ART_URLS = Object.values(URL);
