"use client";

// 아트 장면 전체 — Unity 전달본의 구워진 월드(scripts/convert_unity_world.py → public/reactive/world/*.glb).
// 쉘터(벤치 포함)·도로·인도·지형·가로등/소품·유리·물웅덩이·불빛(static), 카페(cafe), 숲과 억새(forest)를 한 번에 놓는다.
// 월드 좌표의 "관객 눈" 은 (1.017, ·, −0.19) 이므로 장면 전체를 WORLD_OFFSET 만큼 옮겨 관객을 원점(카메라 z=0.35)에 둔다.
// 이렇게 하면 이 월드 안의 모든 위치가 /film 좌표로 곧바로 읽힌다 — 예: 도로 가까운 연석 z≈−2.7, 가까운 차선 중앙 z≈−4.4,
// 중앙선 z≈−6.2, 먼 인도 z≈−10…−12.4, 벤치 좌면 x −1.67…0.53(관객은 오른쪽 끝, 옆사람 자리는 왼쪽), 큰 물웅덩이 x≈−2 z≈−3.2.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Color } from "three";

export const WORLD_OFFSET = [-1.017, 0, 0.54];
// world: "unity" = 10/3 Unity 전달본 변환(scripts/convert_unity_world.py), "v13" = 11/8 아트 V13 Blender 장면 변환
// (scripts/blender/export_world_v13.py — 같은 좌표계·같은 재질 이름이라 아래 처리가 그대로 맞는다).
const URLS = {
  unity: { static: "/reactive/world/static.glb", cafe: "/reactive/world/cafe.glb", forest: "/reactive/world/forest.glb" },
  v13: { static: "/reactive/world_v13/static.glb", cafe: "/reactive/world_v13/cafe.glb", forest: "/reactive/world_v13/forest.glb" },
};

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

// 나무·갈대 바람 — 숲 재질의 정점을 월드 높이에 비례해(높이^1.5) 흔든다. 밑동은 그대로, 우듬지만 움직인다.
// 위치마다 위상이 달라 나무끼리 박자가 어긋나고, 느린 돌풍이 세기를 오르내리게 한다. 세기(wind)는 장르별로 바깥에서 준다.
// 쉘터·도로·담장(static)은 건드리지 않는다. 숲은 그림자를 안 받으므로 깊이 재질은 손대지 않는다.
function useWind(obj, windRef) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uWind: { value: 0.7 } }), []);
  useEffect(() => {
    obj.traverse((o) => {
      if (!o.isMesh || o.material.userData.wind) return;
      const m = o.material;
      m.userData.wind = true;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uWind = uniforms.uWind;
        sh.vertexShader = "uniform float uTime;\nuniform float uWind;\n" + sh.vertexShader.replace("#include <project_vertex>", `
          vec4 wPos = modelMatrix * vec4( transformed, 1.0 );
          float hgt = max( 0.0, wPos.y - 0.3 );
          float ph = uTime * 1.25 + wPos.x * 0.21 + wPos.z * 0.17;
          float gust = 0.55 + 0.45 * sin( uTime * 0.31 + wPos.x * 0.04 + wPos.z * 0.03 );
          float sway = uWind * 0.0035 * pow( hgt, 1.5 ) * gust * ( sin( ph ) + 0.3 * sin( ph * 2.3 + wPos.y * 0.7 ) );
          wPos.x += sway; wPos.z += sway * 0.4;
          vec4 mvPosition = viewMatrix * wPos;
          gl_Position = projectionMatrix * mvPosition;`);
      };
      m.customProgramCacheKey = () => "film-wind";
      m.needsUpdate = true;
    });
  }, [obj, uniforms]);
  useFrame((state, dt) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    const target = windRef?.current ?? 0.7;
    uniforms.uWind.value += (target - uniforms.uWind.value) * Math.min(1, dt * 0.5); // 장르가 바뀌면 몇 초에 걸쳐
  });
}

// glowRef 에는 "Glow"(가로등 확산판·카페 불빛) 재질이 들어온다 — 연출 상태의 점등 세기(lampI)를 매 프레임 거기에 쓴다.
export default function ArtWorld({ glowRef, world = "v13", wind = 0.7 }) {
  const windRef = useRef(wind); windRef.current = wind;
  const URL = URLS[world] || URLS.unity;
  const onMat = useMemo(() => (m) => { if (m && m.name === "Glow" && glowRef) glowRef.current = m; }, [glowRef]);
  const stat = useScene(URL.static, { cast: true, receive: true, onMaterial: onMat });
  const cafe = useScene(URL.cafe, { cast: false, receive: true });
  const forest = useScene(URL.forest, { cast: false, receive: false });
  useWind(forest, windRef);
  return (
    <group position={WORLD_OFFSET}>
      <primitive object={stat} />
      <primitive object={cafe} />
      <primitive object={forest} />
    </group>
  );
}

export const WORLD_URLS = Object.values(URLS.v13);
