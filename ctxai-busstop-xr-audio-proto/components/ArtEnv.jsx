"use client";

// 아트팀 최종 모델(ART/BUS_STOP_XR_SOFT_FINISH_V03.blend → scripts/blender/export_art_env.py → public/reactive/art/*.glb)을
// /film 의 기존 배치에 맞춰 끼운다. 연출(배우 동선·트럭 차선·고양이 경로·조명 상태)은 그대로 두고 모델만 바꾼다.
//
// GLB 좌표 = Blender 좌표를 Y-up 으로 바꾼 것: (x, y, z) = (bx, bz, −by). 그래서 각 소품은
//   "원본에서의 기준점 C 를 장면의 목표 위치 T 로" 옮기는 한 줄(바깥 그룹 = T·회전·크기, 안쪽 그룹 = −C)로 끝난다.
// 기준점·방향은 원본을 직접 재서 정했다(주석 참고) — 값이 어긋나면 이 파일의 상수만 고치면 된다.

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";

const URL = {
  shelter: "/reactive/art/shelter.glb",
  cafe: "/reactive/art/cafe.glb",
  lantern: "/reactive/art/lantern.glb",
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

// 정류장 지붕·기둥·유리·네온 — 벤치는 뺐다(옆사람 착석 높이가 기존 벤치 기준). 원본 바닥 폭 3.8×깊이 2.6m 를
// 0.82배 하면 /film 의 기존 정류장(x −1…2.2, z −0.95…1.15, 지붕 높이 2.38)과 정확히 겹친다.
// 원본 기준점 C = 바닥 중심 (x 0, z −0.2) → 장면 (0.6, 0.1).
export function ArtShelter() {
  return (
    <group position={[0.6, 0, 0.1]} scale={0.82}>
      <group position={[0, 0, 0.2]}><Model url={URL.shelter} /></group>
    </group>
  );
}

// 카페 — 원본 문 앵커(−59.46, y 10.15) 를 우비 인물이 나오는 문(−17.9, −24.6)에 놓고 기존처럼 0.25rad 관객 쪽으로 돌린다.
// 원본 카페 바닥이 길보다 0.9m 높아서 그만큼 내린다. 크기는 1배(문 높이 2.2m ≈ 사람 키에 맞다).
export function ArtCafe({ children }) {
  return (
    <group position={[-17.9, 0, -24.6]} rotation={[0, 0.25, 0]}>
      <group position={[59.46, -0.9, 10.15]}><Model url={URL.cafe} /></group>
      {children}
    </group>
  );
}

// 가로등 — 원본은 높이 5.14m(기둥 바닥 y=12.27). 0.7배면 머리(확산판 중심)가 3.06m, 팔 길이 0.53m 로 기존 가로등과 같다.
// 팔은 원본에서 장면 +z 쪽으로 뻗는다 → armSign −1 이면 π 돌려 −z(도로 쪽)로 뻗게 한다.
export const LANTERN_HEAD = { y: 3.06, z: 0.525 };
export function ArtLantern({ armSign = 1 }) {
  return (
    <group rotation={[0, armSign < 0 ? Math.PI : 0, 0]} scale={0.7}>
      <group position={[0, 0, 12.27]}><Model url={URL.lantern} /></group>
    </group>
  );
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
export function ArtCat({ x, z, running, facingBench, bob }) {
  const rot = facingBench ? 0.2 : -Math.PI / 2;
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
