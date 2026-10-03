"use client";

// 아트 장면 전체 — Unity 전달본의 구워진 월드(scripts/convert_unity_world.py → public/reactive/world/*.glb).
// 쉘터(벤치 포함)·도로·인도·지형·가로등/소품·유리·물웅덩이·불빛(static), 카페(cafe), 숲과 억새(forest)를 한 번에 놓는다.
// 월드 좌표의 "관객 눈" 은 (1.017, ·, −0.19) 이므로 장면 전체를 WORLD_OFFSET 만큼 옮겨 관객을 원점(카메라 z=0.35)에 둔다.
// 이렇게 하면 이 월드 안의 모든 위치가 /film 좌표로 곧바로 읽힌다 — 예: 도로 가까운 연석 z≈−2.7, 가까운 차선 중앙 z≈−4.4,
// 중앙선 z≈−6.2, 먼 인도 z≈−10…−12.4, 벤치 좌면 x −1.67…0.53(관객은 오른쪽 끝, 옆사람 자리는 왼쪽), 큰 물웅덩이 x≈−2 z≈−3.2.

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Color } from "three";

export const WORLD_OFFSET = [-1.017, 0, 0.54];
const URL = { static: "/reactive/world/static.glb", cafe: "/reactive/world/cafe.glb", forest: "/reactive/world/forest.glb" };

function useScene(url, { cast = false, receive = true, onMaterial } = {}) {
  const { scene } = useGLTF(url, false, true);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = cast; o.receiveShadow = receive;
      o.frustumCulled = true;
      const m = o.material;
      if (m && m.name === "GlassClear") { m.transparent = true; m.depthWrite = false; m.roughness = 0.1; o.castShadow = false; o.receiveShadow = false; }
      if (m && m.name === "GlassFrosted") { m.transparent = true; m.depthWrite = false; o.castShadow = false; }
      if (m && m.name === "Water") { m.envMapIntensity = 1.6; o.castShadow = false; }
      if (m && m.name === "Glow") { m.emissiveIntensity = 0.8; o.castShadow = false; }
      if (m && m.name === "PaintVertex") { m.roughness = 1; m.envMapIntensity = 0.5; }
    });
    return c;
  }, [scene, cast, receive]);
  useEffect(() => {
    if (!onMaterial) return;
    obj.traverse((o) => { if (o.isMesh) onMaterial(o.material); });
  }, [obj, onMaterial]);
  return obj;
}

// glowRef 에는 "Glow"(가로등 확산판·카페 불빛) 재질이 들어온다 — 연출 상태의 점등 세기(lampI)를 매 프레임 거기에 쓴다.
export default function ArtWorld({ glowRef }) {
  const onMat = useMemo(() => (m) => { if (m && m.name === "Glow" && glowRef) glowRef.current = m; }, [glowRef]);
  const stat = useScene(URL.static, { cast: true, receive: true, onMaterial: onMat });
  const cafe = useScene(URL.cafe, { cast: false, receive: true });
  const forest = useScene(URL.forest, { cast: false, receive: false });
  return (
    <group position={WORLD_OFFSET}>
      <primitive object={stat} />
      <primitive object={cafe} />
      <primitive object={forest} />
    </group>
  );
}

export const WORLD_URLS = Object.values(URL);
