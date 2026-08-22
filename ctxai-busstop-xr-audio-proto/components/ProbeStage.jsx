"use client";

// 프로브 무대 — 1인칭 정류장 + 다섯 사건.
//
// 3D 에셋은 전부 코드로 만든다. 아트의 GLB 는 아직 없고(8/12~), 하네스의
// 목적은 "자극이 반응을 유발하는가"를 보는 것이라 형태의 완성도보다
// **방향·시점·거리**가 중요하다.
//
// 다만 너무 각지면 몰입이 깨져 반응 자체가 달라지므로, 에셋 없이 올릴 수 있는
// 만큼은 올렸다. 품질의 대부분은 형태가 아니라 아래 세 가지에서 나온다:
//   ① 환경맵      젖은 노면·유리·금속에 하늘이 비친다 (lib/proceduralTextures)
//   ② 거칠기 얼룩  균일하게 젖지 않는다 — 물이 고인 곳과 마른 곳이 갈린다
//   ③ 인스턴싱    풀숲 1800포기·수목 52그루. 밀도가 공간을 만든다
//
// 아트 GLB 가 나오면 <Whitebox> 안의 도형을 슬롯에서 불러온 GLB 로 바꾸면
// 된다 — 배치 좌표는 app/whitebox 와 같은 규약을 쓴다(원점 = 벤치 착석
// 지점 바닥, 눈높이 1.15m).
//
// 관객은 벤치에 앉아 있으므로 **이동은 없고 회전만** 있다. 이 요각이 판정의
// 주 신호이고, 헤드셋으로 갈 때 IMU 요각으로 그대로 갈아끼운다
// (v2.md §5 "시선 = 헤드셋 헤드 포즈").

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PROBES, EYE_HEIGHT, bearingToXZ, probeAt } from "@/lib/probes";
import { makeSkyMaterial, createSkyEnvBaker, makeBlotchTexture, makeMullionTexture } from "@/lib/proceduralTextures";
import { moodFor, approachMood } from "@/lib/genreMood";
import { SeatedNpc, Bus272 } from "./StageActors";

// ── 색 ─────────────────────────────────────────────────────
// "오후 네 시 무렵. 굵은 소나기가 조금 전에 지나갔다." (v2.md §1)
const C = {
  asphaltDry: "#43474d",
  asphaltWet: "#2e3238",
  sidewalk: "#5a5e63",
  curb: "#6d7176",
  soil: "#33372f",
  steel: "#565b62",
  steelDark: "#3a3e44",
  roof: "#6f757c",
  glass: "#c3d2dc",
  wood: "#7a6a55",
  woodDark: "#5d5041",
  signFace: "#2a2e33",
  signRim: "#767b81",
  paper: "#ded7c6",
  paperShade: "#b9b09c",
  grass1: "#3d5236",
  grass2: "#4c6340",
  grass3: "#2f4230",
  trunk: "#3a332b",
  needle: "#25342a",
  needleLight: "#31432f",
  cafeFrame: "#20242a",
  cafeGlow: "#e0a860",
  poncho: "#4d5560",
  ponchoDark: "#3a414a",
  truckBody: "#8a9096",
  truckCab: "#6a7076",
  cat: "#1e2025",
};

const up = new THREE.Vector3(0, 1, 0);

// 트럭 앞바퀴가 웅덩이를 밟는 지점 — 물보라와 웅덩이가 같은 자리를 봐야 한다.
// probeAt(truck, 0.44) 와 일치시킨다.
const SPLASH_AT = [3.1, -5.6];

// ── 공유 재질 ──────────────────────────────────────────────

function useSceneMaterials() {
  return useMemo(() => {
    const roadRough = makeBlotchTexture({ size: 256, blobs: 52, wetness: 0.72, seed: 3 });
    roadRough.repeat.set(9, 3);
    const groundRough = makeBlotchTexture({ size: 256, blobs: 40, wetness: 0.45, seed: 11 });
    groundRough.repeat.set(14, 14);
    const walkRough = makeBlotchTexture({ size: 256, blobs: 34, wetness: 0.5, seed: 7 });
    walkRough.repeat.set(6, 2);
    const mullion = makeMullionTexture({ cols: 6, rows: 4 });

    return {
      // 젖은 아스팔트 — 얼룩진 거칠기가 이 씬에서 가장 큰 차이를 만든다
      road: new THREE.MeshStandardMaterial({
        color: C.asphaltWet, roughness: 0.42, metalness: 0.06, roughnessMap: roadRough,
        envMapIntensity: 1.25,
      }),
      ground: new THREE.MeshStandardMaterial({
        color: C.soil, roughness: 0.86, metalness: 0.0, roughnessMap: groundRough,
        envMapIntensity: 0.5,
      }),
      sidewalk: new THREE.MeshStandardMaterial({
        color: C.sidewalk, roughness: 0.6, metalness: 0.03, roughnessMap: walkRough,
        envMapIntensity: 0.85,
      }),
      curb: new THREE.MeshStandardMaterial({ color: C.curb, roughness: 0.78, envMapIntensity: 0.6 }),
      // 물웅덩이 — 거의 거울. 하늘이 그대로 비친다
      puddle: new THREE.MeshStandardMaterial({
        color: "#20262d", roughness: 0.045, metalness: 0.92, envMapIntensity: 1.6,
      }),
      steel: new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.34, metalness: 0.82, envMapIntensity: 1.1 }),
      steelDark: new THREE.MeshStandardMaterial({ color: C.steelDark, roughness: 0.45, metalness: 0.7 }),
      roof: new THREE.MeshStandardMaterial({ color: C.roof, roughness: 0.38, metalness: 0.55, envMapIntensity: 1.0 }),
      // 유리 — transmission 은 쓰지 않는다. three.js 는 transmission>0 이면
      // 투과를 그리려고 씬을 한 번 더 렌더한다(별도 렌더타깃). 유리 4장이면
      // 매 프레임 렌더 비용이 두 배가 되고, 프레임이 밀리면 시선 샘플링
      // 자체가 망가진다. 얇은 창은 반사만으로 충분히 유리로 보인다.
      glass: new THREE.MeshStandardMaterial({
        color: C.glass, roughness: 0.05, metalness: 0.16,
        transparent: true, opacity: 0.24, side: THREE.DoubleSide, envMapIntensity: 2.2,
      }),
      wood: new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.72, envMapIntensity: 0.6 }),
      woodDark: new THREE.MeshStandardMaterial({ color: C.woodDark, roughness: 0.8 }),
      signFace: new THREE.MeshStandardMaterial({ color: C.signFace, roughness: 0.5, metalness: 0.25 }),
      signRim: new THREE.MeshStandardMaterial({ color: C.signRim, roughness: 0.35, metalness: 0.8 }),
      paper: new THREE.MeshStandardMaterial({ color: C.paper, roughness: 0.9, side: THREE.DoubleSide }),
      paperShade: new THREE.MeshStandardMaterial({ color: C.paperShade, roughness: 0.92, side: THREE.DoubleSide }),
      trunk: new THREE.MeshStandardMaterial({ color: C.trunk, roughness: 0.9 }),
      needle: new THREE.MeshStandardMaterial({ color: C.needle, roughness: 0.85 }),
      // 풀 — 인스턴스별 색은 setColorAt(instanceColor)으로 준다.
      // vertexColors 를 켜면 지오메트리의 color 속성을 찾으므로 오히려 깨진다.
      grass: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82, envMapIntensity: 0.45 }),
      cafeFrame: new THREE.MeshStandardMaterial({ color: C.cafeFrame, roughness: 0.4, metalness: 0.6 }),
      cafeGlass: new THREE.MeshStandardMaterial({
        color: "#8fa2ad", roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.55,
        envMapIntensity: 1.3,
      }),
      mullionMat: new THREE.MeshStandardMaterial({
        map: mullion, transparent: true, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide,
      }),
      drip: new THREE.MeshStandardMaterial({ color: "#b9c6ce", roughness: 0.1, metalness: 0.3, envMapIntensity: 1.4 }),
    };
  }, []);
}

// ── 인스턴싱 — 풀숲과 수목 ────────────────────────────────

// "정류장 뒤에는 빗물을 머금은 풀숲이 있고" (v2.md §1)
// 개구리가 우는 곳이다 — 소리만 나지만 풀숲 자체는 보여야 공간이 성립한다.
function GrassField({ material, count = 1800 }) {
  const ref = useRef();
  const geo = useMemo(() => new THREE.ConeGeometry(0.022, 0.42, 3), []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    let s = 12345;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

    for (let i = 0; i < count; i++) {
      // 정류장 뒤(+Z)와 좌우로 퍼진 띠
      const a = (rnd() * 2 - 1) * Math.PI;
      const r = 1.8 + rnd() * 14;
      let x = Math.sin(a) * r;
      let z = Math.cos(a) * r * 0.9 + 2.2;
      // 인도와 도로(-Z ~ +1.4)에는 안 자란다. 풀숲은 정류장 뒤에서 시작한다.
      if (z < 1.45) z = 1.45 + rnd() * 2.2;
      const h = 0.55 + rnd() * 0.95;
      pos.set(x, 0.42 * h * 0.5, z);
      e.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5);
      q.setFromEuler(e);
      scl.set(0.7 + rnd() * 0.7, h, 0.7 + rnd() * 0.7);
      m.compose(pos, q, scl);
      ref.current.setMatrixAt(i, m);
      const t = rnd();
      col.set(t < 0.4 ? C.grass1 : t < 0.75 ? C.grass2 : C.grass3);
      ref.current.setColorAt(i, col);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [count]);

  return <instancedMesh ref={ref} args={[geo, material, count]} frustumCulled={false} />;
}

// "정면 오른쪽에는 침엽수림과 호수공원 산책로가 보인다" (v2.md §1)
// 나무 44그루 × 부위 4개 = 176 드로우콜이던 것을 층별 인스턴싱 4개로 줄인다.
// 원거리 배경에 드로우콜을 쓰면 정작 프레임이 필요한 곳에서 밀린다.
const TREE_COUNT = 52;

function Treeline({ needle, trunk }) {
  const layers = [
    useRef(), // 줄기
    useRef(), // 아래 층
    useRef(), // 가운데 층
    useRef(), // 윗 층
  ];

  const specs = useMemo(() => {
    let s = 777;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: TREE_COUNT }, () => {
      const az = 26 + rnd() * 150;            // 오른쪽 ~ 뒤쪽으로 두른다
      const r = 23 + rnd() * 50;
      const { x, z } = bearingToXZ(az, r);
      return { x, z, h: 6 + rnd() * 7.5, w: 1.4 + rnd() * 1.2, rot: rnd() * Math.PI };
    });
  }, []);

  const geos = useMemo(() => [
    new THREE.CylinderGeometry(0.09, 0.14, 1, 6),
    new THREE.ConeGeometry(1, 0.5, 7),
    new THREE.ConeGeometry(0.78, 0.44, 7),
    new THREE.ConeGeometry(0.5, 0.36, 7),
  ], []);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    specs.forEach((t, i) => {
      const put = (ref, y, sx, sy) => {
        d.position.set(t.x, t.h * y, t.z);
        d.rotation.set(0, t.rot, 0);
        d.scale.set(t.w * sx, t.h * sy, t.w * sx);
        d.updateMatrix();
        ref.current?.setMatrixAt(i, d.matrix);
      };
      put(layers[0], 0.22, 1, 0.45);
      put(layers[1], 0.44, 1, 1);
      put(layers[2], 0.66, 1, 1);
      put(layers[3], 0.86, 1, 1);
    });
    layers.forEach((r) => { if (r.current) r.current.instanceMatrix.needsUpdate = true; });
  }, [specs]);

  return (
    <group>
      <instancedMesh ref={layers[0]} args={[geos[0], trunk, TREE_COUNT]} frustumCulled={false} />
      {[1, 2, 3].map((i) => (
        <instancedMesh key={i} ref={layers[i]} args={[geos[i], needle, TREE_COUNT]} frustumCulled={false} />
      ))}
    </group>
  );
}

// ── 정류장 ─────────────────────────────────────────────────

function Shelter({ M }) {
  return (
    <group>
      {/* 기둥 4개 — 사각 파이프가 아니라 살짝 테이퍼진 원형 강관 */}
      {[[-2.05, -0.95], [2.05, -0.95], [-2.05, 0.75], [2.05, 0.75]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh material={M.steel} position={[0, 1.24, 0]} castShadow>
            <cylinderGeometry args={[0.048, 0.062, 2.48, 12]} />
          </mesh>
          {/* 바닥 플랜지 */}
          <mesh material={M.steelDark} position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.11, 0.12, 0.04, 12]} />
          </mesh>
        </group>
      ))}

      {/* 지붕 — 도로 쪽으로 살짝 기운 판 + 처마 트림 + 낙수받이 */}
      <group position={[0, 2.5, -0.16]} rotation={[-0.045, 0, 0]}>
        <mesh material={M.roof} castShadow receiveShadow>
          <boxGeometry args={[4.7, 0.085, 2.5]} />
        </mesh>
        <mesh material={M.steelDark} position={[0, -0.07, -1.23]}>
          <boxGeometry args={[4.72, 0.11, 0.06]} />
        </mesh>
        <mesh material={M.steelDark} position={[0, -0.07, 1.23]}>
          <boxGeometry args={[4.72, 0.11, 0.06]} />
        </mesh>
        {/* 천장 안쪽은 어둡다 — 위에서 오는 빛이 막힌다 */}
        <mesh material={M.steelDark} position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.6, 2.4]} />
        </mesh>
      </group>

      {/* 등 뒤 유리 — "체험 내내 등 뒤의 부스 유리" (v1.1 §3 유리 세 겹) */}
      <group position={[0, 1.2, 0.78]}>
        <mesh material={M.glass}>
          <planeGeometry args={[4.1, 2.2]} />
        </mesh>
        {/* 창틀 */}
        {[-2.05, 0, 2.05].map((x) => (
          <mesh key={x} material={M.steelDark} position={[x, 0, 0.012]}>
            <boxGeometry args={[0.05, 2.24, 0.03]} />
          </mesh>
        ))}
        {[-1.1, 1.1].map((y) => (
          <mesh key={y} material={M.steelDark} position={[0, y, 0.012]}>
            <boxGeometry args={[4.14, 0.05, 0.03]} />
          </mesh>
        ))}
      </group>

      {/* 오른쪽 유리 — 찢어진 포스터가 붙어 있는 면 */}
      <group position={[2.02, 1.2, -0.1]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh material={M.glass}>
          <planeGeometry args={[1.66, 2.2]} />
        </mesh>
        {[-0.83, 0.83].map((x) => (
          <mesh key={x} material={M.steelDark} position={[x, 0, 0.012]}>
            <boxGeometry args={[0.05, 2.24, 0.03]} />
          </mesh>
        ))}
        {[-1.1, 1.1].map((y) => (
          <mesh key={y} material={M.steelDark} position={[0, y, 0.012]}>
            <boxGeometry args={[1.7, 0.05, 0.03]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Bench({ M }) {
  return (
    <group position={[0, 0, 0.12]}>
      {/* 좌판 — 널 5장. 판자 하나였던 것을 나눈 것만으로 인상이 크게 달라진다 */}
      {[-0.17, -0.085, 0, 0.085, 0.17].map((z, i) => (
        <mesh key={i} material={i % 2 ? M.woodDark : M.wood} position={[0, 0.44, z]} castShadow receiveShadow>
          <boxGeometry args={[2.5, 0.055, 0.072]} />
        </mesh>
      ))}
      {/* 등받이 널 3장 */}
      {[0.62, 0.72, 0.82].map((y, i) => (
        <mesh key={i} material={i % 2 ? M.woodDark : M.wood} position={[0, y, 0.3]} rotation={[0.12, 0, 0]} castShadow>
          <boxGeometry args={[2.5, 0.075, 0.05]} />
        </mesh>
      ))}
      {/* 강관 프레임 — 양끝과 가운데 */}
      {[-1.14, 0, 1.14].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh material={M.steel} position={[0, 0.21, 0]}>
            <boxGeometry args={[0.05, 0.42, 0.05]} />
          </mesh>
          <mesh material={M.steel} position={[0, 0.42, 0]}>
            <boxGeometry args={[0.05, 0.05, 0.44]} />
          </mesh>
          <mesh material={M.steel} position={[0, 0.63, 0.29]} rotation={[0.12, 0, 0]}>
            <boxGeometry args={[0.05, 0.42, 0.05]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Sign({ M }) {
  return (
    <group position={[1.62, 0, -1.5]} rotation={[0, -0.42, 0]}>
      <mesh material={M.steel} position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.036, 0.045, 2.1, 10]} />
      </mesh>
      <mesh material={M.steelDark} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.1, 0.11, 0.04, 10]} />
      </mesh>
      {/* 노선도 판 — 테두리 + 어두운 면. 이름 자리는 아직 비어 있다 (D5) */}
      <group position={[0, 1.82, 0.03]}>
        <mesh material={M.signRim}>
          <boxGeometry args={[0.98, 0.62, 0.035]} />
        </mesh>
        <mesh material={M.signFace} position={[0, 0, 0.023]}>
          <planeGeometry args={[0.9, 0.54]} />
        </mesh>
        {/* 노선 띠 */}
        <mesh material={M.signRim} position={[0, -0.14, 0.025]}>
          <planeGeometry args={[0.76, 0.018]} />
        </mesh>
        {[-0.3, -0.1, 0.1, 0.3].map((x) => (
          <mesh key={x} material={M.signRim} position={[x, -0.14, 0.026]}>
            <circleGeometry args={[0.026, 10]} />
          </mesh>
        ))}
        {/* 정류장 이름 자리 — 평면 사각형으로 분리 (요청서 §2.6) */}
        <mesh material={M.signFace} position={[0, 0.16, 0.026]}>
          <planeGeometry args={[0.74, 0.19]} />
        </mesh>
      </group>
    </group>
  );
}

// "아래쪽 절반은 찢겨나갔고, 남은 귀퉁이는 바람이 불 때마다
//  유리에서 떨어졌다 붙기를 반복한다" (v2.md §1-1)
function Poster({ M }) {
  const p = PROBES.find((x) => x.id === "poster");
  const q = bearingToXZ(p.azimuth, p.radius);
  return (
    <group position={[q.x, EYE_HEIGHT + 0.16, q.z]} rotation={[0, -Math.PI / 2 + 0.02, 0]}>
      {/* 남은 위쪽 절반 */}
      <mesh material={M.paper}>
        <planeGeometry args={[0.34, 0.24]} />
      </mesh>
      {/* 사진처럼 보이는 부분 — 무엇을 찾는 포스터인지 확실하지 않다 */}
      <mesh material={M.paperShade} position={[-0.08, 0.02, 0.002]}>
        <planeGeometry args={[0.13, 0.13]} />
      </mesh>
      {/* 남은 글자 줄 — "…찾습니다." "…사례합니다." */}
      {[0.02, -0.03].map((y, i) => (
        <mesh key={i} material={M.paperShade} position={[0.07, y, 0.002]}>
          <planeGeometry args={[0.14, 0.012]} />
        </mesh>
      ))}
      {/* 찢긴 아래 가장자리 — 삐죽삐죽하게 조각을 남긴다 */}
      {[-0.14, -0.07, 0.02, 0.1].map((x, i) => (
        <mesh key={i} material={M.paper} position={[x, -0.13 - (i % 2) * 0.02, 0]}>
          <planeGeometry args={[0.06, 0.05 + (i % 2) * 0.03]} />
        </mesh>
      ))}
    </group>
  );
}

// ── 노면 ───────────────────────────────────────────────────

function LaneDashes({ material, rows = [-7.2, -14.8], per = 26 }) {
  const ref = useRef();
  const geo = useMemo(() => new THREE.PlaneGeometry(3.6, 0.13), []);
  const count = rows.length * per;
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    let i = 0;
    for (const z of rows) {
      for (let k = 0; k < per; k++) {
        d.position.set(-100 + k * 8, 0.007, z);
        d.rotation.set(-Math.PI / 2, 0, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        ref.current?.setMatrixAt(i++, d.matrix);
      }
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [rows, per]);
  return <instancedMesh ref={ref} args={[geo, material, count]} frustumCulled={false} />;
}

function Ground({ M }) {
  const puddles = useMemo(() => {
    let s = 4242;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return [
      { x: SPLASH_AT[0], z: SPLASH_AT[1], r: 2.1, ry: 0.5 }, // 트럭이 밟는 웅덩이
      ...Array.from({ length: 7 }, () => ({
        x: (rnd() - 0.5) * 26,
        z: -3 - rnd() * 14,
        r: 0.5 + rnd() * 1.3,
        ry: 0.4 + rnd() * 0.5,
      })),
    ];
  }, []);

  return (
    <group>
      <mesh material={M.ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <planeGeometry args={[320, 320]} />
      </mesh>

      {/* 인도 — 정류장이 놓인 단 */}
      {/* 인도 — 도로 연석에서 정류장 뒤까지만. 이보다 넓으면 풀숲이
          인도 위에서 자란다(개구리가 우는 곳이 z≈+1.8 이다) */}
      <mesh material={M.sidewalk} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, -0.75]} receiveShadow>
        <planeGeometry args={[60, 4.6]} />
      </mesh>
      <mesh material={M.curb} position={[0, 0.03, -3.05]}>
        <boxGeometry args={[60, 0.13, 0.24]} />
      </mesh>

      {/* 왕복 4차선 — 완만하게 굽어 있지만 여기서는 직선으로 근사 */}
      <mesh material={M.road} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, -11]} receiveShadow>
        <planeGeometry args={[240, 15.6]} />
      </mesh>
      {/* 중앙선 2줄 */}
      {[-0.28, 0.28].map((d) => (
        <mesh key={d} material={M.curb} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, -11 + d]}>
          <planeGeometry args={[240, 0.14]} />
        </mesh>
      ))}
      {/* 차선 파선 — 60개를 개별 메시로 두면 드로우콜만 60이다. 인스턴싱 하나로. */}
      <LaneDashes material={M.curb} />

      {/* 물웅덩이 — 하늘이 비친다. 젖은 노면 인상의 절반은 여기서 나온다 */}
      {puddles.map((p, i) => (
        <mesh
          key={i}
          material={M.puddle}
          rotation={[-Math.PI / 2, 0, i * 0.7]}
          position={[p.x, p.z < -3.05 ? 0.009 : 0.066, p.z]}
          scale={[1, p.ry, 1]}
        >
          <circleGeometry args={[p.r, 26]} />
        </mesh>
      ))}
    </group>
  );
}

// ── 카페 ───────────────────────────────────────────────────
// "도로 건너편 왼쪽 약 50미터 거리에는 작은 온실형 베이커리 카페가 있다.
//  유리와 검은 금속 프레임 안쪽으로 식물과 빵 진열대가 보인다." (v2.md §1-2)

function Cafe({ M, glowRef }) {
  const w = bearingToXZ(-38, 52);
  return (
    <group position={[w.x, 0, w.z]} rotation={[0, 0.5, 0]}>
      {/* 온실 몸통 */}
      <mesh material={M.cafeGlass} position={[0, 2.6, 0]}>
        <boxGeometry args={[13, 5.2, 8.4]} />
      </mesh>
      {/* 창틀 격자 — 앞뒷면에 얇은 판으로 얹는다 */}
      {[4.25, -4.25].map((z) => (
        <mesh key={z} material={M.mullionMat} position={[0, 2.6, z]}>
          <planeGeometry args={[13, 5.2]} />
        </mesh>
      ))}
      {/* 박공 지붕 */}
      <mesh material={M.cafeFrame} position={[0, 5.9, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[9.6, 2.4, 4]} />
      </mesh>
      {/* 실내의 온기 — 문이 열리면 밝아진다 */}
      <mesh ref={glowRef} position={[0, 2.2, 4.32]}>
        <planeGeometry args={[12.4, 4.4]} />
        <meshBasicMaterial color={C.cafeGlow} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      {/* 진열대·식물 실루엣 */}
      {[-3.6, -1.2, 1.4, 3.8].map((x, i) => (
        <mesh key={x} material={M.cafeFrame} position={[x, 1.1 + (i % 2) * 0.4, 1.2]}>
          <boxGeometry args={[1.6, 2.2 + (i % 2) * 0.8, 0.8]} />
        </mesh>
      ))}
    </group>
  );
}

// ── 처마 낙수 ──────────────────────────────────────────────
// "정류장 처마에서는 모여 있던 빗물이 간헐적으로 떨어진다. 툭." (v2.md §1)

function RoofDrips({ M, count = 7 }) {
  const ref = useRef();
  const seeds = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      x: -2.0 + (i / (count - 1)) * 4.0,
      z: -1.32,
      phase: (i * 997) % 1000 / 1000,
      period: 2.6 + ((i * 31) % 17) / 6,
    })),
    [count]
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(() => new THREE.SphereGeometry(0.016, 6, 5), []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    seeds.forEach((s, i) => {
      const u = ((t / s.period + s.phase) % 1);
      const y = 2.42 - u * u * 2.42;               // 자유낙하 가속
      dummy.position.set(s.x, Math.max(0.02, y), s.z);
      dummy.scale.set(1, 1 + u * 1.6, 1);          // 떨어지며 길쭉해진다
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, M.drip, count]} frustumCulled={false} />;
}

// ── 화이트박스 전체 ────────────────────────────────────────

function Whitebox({ M, cafeGlowRef }) {
  return (
    <group>
      <Ground M={M} />
      <Shelter M={M} />
      <Bench M={M} />
      <Sign M={M} />
      <Poster M={M} />
      <GrassField material={M.grass} />
      <Treeline needle={M.needle} trunk={M.trunk} />
      <Cafe M={M} glowRef={cafeGlowRef} />
      <RoofDrips M={M} />
    </group>
  );
}

// ── 프로브 시각 큐 ─────────────────────────────────────────
// 청각 전용 프로브(개구리·두 번째 울음)는 여기에 아무것도 그리지 않는다.
// 그게 그 프로브의 설계다 — "무슨 일이 있었는지는 보여주지 않는다".

function ProbeVisuals({ clockRef, M, cafeGlowRef }) {
  const personRef = useRef();
  const personBobRef = useRef();
  const truckRef = useRef();
  const splashRef = useRef();
  const catRef = useRef();
  const catLegRef = useRef();
  const posterFlapRef = useRef();

  const P = useMemo(() => Object.fromEntries(PROBES.map((p) => [p.id, p])), []);

  useFrame(() => {
    const t = clockRef.current;
    const prog = (p) => (t - p.onsetMs) / p.windowMs;
    const vis = (o, on) => { if (o) o.visible = on; };

    // 1-1 포스터 귀퉁이 — 바람이 불 때마다 떨어졌다 붙는다
    {
      const u = prog(P.poster);
      const on = u > -0.02 && u < 1.5;
      vis(posterFlapRef.current, on);
      if (on && posterFlapRef.current) {
        const amp = Math.max(0, 1 - u * 0.7);
        posterFlapRef.current.rotation.y = Math.sin(t / 105) * 0.9 * amp;
      }
    }

    // 1-2 카페 문이 열리고 우비 인물이 걸어온다
    {
      const u = prog(P.wiper);
      // 문이 열려 있는 몇 초 동안 실내의 온기가 밖으로 새어 나온다
      if (cafeGlowRef.current) {
        const open = u > 0 && u < 0.2 ? 1 : 0;
        const m = cafeGlowRef.current.material;
        m.opacity += ((open ? 0.92 : 0.3) - m.opacity) * 0.08;
      }
      const on = u > 0.03 && u < 1.35;
      vis(personRef.current, on);
      if (on && personRef.current) {
        const q = probeAt(P.wiper, Math.max(0, Math.min(1, u)));
        personRef.current.position.set(q.x, 0, q.z);
        personRef.current.rotation.y = q.heading;
        // 걸음 — 위아래로 미세하게 흔들린다
        if (personBobRef.current) {
          personBobRef.current.position.y = Math.abs(Math.sin(t / 240)) * 0.045;
          personBobRef.current.rotation.z = Math.sin(t / 240) * 0.03;
        }
      }
    }

    // 1-3 포터 트럭 — 오른쪽 곡선에서 나와 왼쪽으로
    {
      const u = prog(P.truck);
      const on = u > 0 && u < 1.15;
      vis(truckRef.current, on);
      if (on && truckRef.current) {
        const q = probeAt(P.truck, Math.max(0, Math.min(1, u)));
        truckRef.current.position.set(q.x, Math.sin(t / 70) * 0.012, q.z); // 노면 요철
        truckRef.current.rotation.y = q.heading; // 가는 쪽을 본다
      }
      // 물보라 — 앞바퀴가 웅덩이를 밟는 순간. 웅덩이(SPLASH_AT)에서 출발해
      // 관객 쪽으로 포물선을 그린다. "실제로 몸을 덮칠 정도는 아니지만,
      // 시각적으로는 얼굴 가까이까지 다가오는 것처럼" (v2.md §1-3)
      const sp = (u - 0.44) / 0.3;
      const spOn = sp > 0 && sp < 1;
      vis(splashRef.current, spOn);
      if (spOn && splashRef.current) {
        splashRef.current.children.forEach((d, i) => {
          const kk = Math.min(1, Math.max(0, sp + i * 0.035));
          const spread = (i - 4) * 0.16;                       // 부채꼴로 벌어진다
          d.position.set(
            SPLASH_AT[0] + (0.5 + spread - SPLASH_AT[0]) * kk,
            0.3 + kk * 1.55 - kk * kk * 1.05,                  // 튀어올랐다 떨어진다
            SPLASH_AT[1] + (-1.7 - SPLASH_AT[1]) * kk
          );
          const sc = 0.08 + kk * (0.34 + Math.abs(spread) * 0.2);
          d.scale.set(sc, sc * 0.72, sc);
          d.material.opacity = 0.75 * (1 - kk * kk);
        });
      }
    }

    // 1-5 고양이 — 오른쪽에서 들어와 앞을 가로질러 왼쪽으로
    {
      const u = prog(P.cat);
      const on = u > 0 && u < 0.94;
      vis(catRef.current, on);
      if (on && catRef.current) {
        // 급정지 — 관객을 발견하고 아주 짧은 순간 멈춘다 (v2.md §1-5)
        const freeze = u > 0.27 && u < 0.43;
        const q = probeAt(P.cat, freeze ? 0.29 : Math.max(0, Math.min(1, u)));
        catRef.current.position.set(q.x, 0, q.z);
        // 달릴 때는 가는 쪽을, 급정지했을 때는 관객 쪽을 본다
        // ("체험자와 고양이가 아주 짧은 순간 서로를 바라본다" v2.md §1-5)
        catRef.current.rotation.y = freeze ? Math.atan2(-q.x, -q.z) : q.heading;
        // 달릴 때는 위아래로 튀고, 멈추면 몸을 움츠린다
        if (catLegRef.current) {
          catLegRef.current.position.y = freeze ? -0.03 : Math.abs(Math.sin(t / 55)) * 0.055;
          catLegRef.current.scale.y = freeze ? 0.85 : 1;
        }
      }
    }
  });

  return (
    <group>
      {/* 우비 인물 — 후드가 얼굴 대부분을 가리고 있어 성별과 나이를 알 수 없다 */}
      <group ref={personRef} visible={false}>
        <group ref={personBobRef}>
          <mesh material={M.steelDark} position={[0, 0.42, 0]}>
            <capsuleGeometry args={[0.15, 0.5, 4, 8]} />
          </mesh>
          {/* 우비 — 어깨에서 퍼지는 판초 */}
          <mesh position={[0, 0.86, 0]}>
            <coneGeometry args={[0.42, 1.0, 10, 1, true]} />
            <meshStandardMaterial color={C.poncho} roughness={0.32} metalness={0.06}
              side={THREE.DoubleSide} envMapIntensity={1.2} />
          </mesh>
          {/* 후드 */}
          <mesh position={[0, 1.38, -0.02]}>
            <sphereGeometry args={[0.17, 12, 10]} />
            <meshStandardMaterial color={C.ponchoDark} roughness={0.34} metalness={0.05} />
          </mesh>
          <mesh position={[0, 1.31, 0.09]} rotation={[0.4, 0, 0]}>
            <coneGeometry args={[0.2, 0.26, 10, 1, true]} />
            <meshStandardMaterial color={C.poncho} roughness={0.34} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>

      {/* 포터 트럭 — 캡 + 적재함 + 바퀴 + 전조등 */}
      <group ref={truckRef} visible={false}>
        <mesh material={M.steelDark} position={[0, 0.62, 0]}>
          <boxGeometry args={[4.9, 0.28, 1.86]} />
        </mesh>
        <mesh position={[-1.42, 1.28, 0]}>
          <boxGeometry args={[1.75, 1.28, 1.84]} />
          <meshStandardMaterial color={C.truckCab} roughness={0.4} metalness={0.42} envMapIntensity={1.1} />
        </mesh>
        <mesh material={M.glass} position={[-2.05, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.7, 0.62]} />
        </mesh>
        <mesh position={[0.95, 1.32, 0]}>
          <boxGeometry args={[3.0, 1.16, 1.9]} />
          <meshStandardMaterial color={C.truckBody} roughness={0.52} metalness={0.3} envMapIntensity={0.9} />
        </mesh>
        {[[-1.6, 0.92], [-1.6, -0.92], [1.35, 0.92], [1.35, -0.92]].map(([x, z], i) => (
          <mesh key={i} material={M.steelDark} position={[x, 0.42, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.26, 14]} />
          </mesh>
        ))}
        {/* 전조등 — 흐린 오후라 켜져 있다 */}
        {[0.62, -0.62].map((z) => (
          <mesh key={z} position={[-2.3, 1.0, z]}>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshBasicMaterial color="#f4ecd2" />
          </mesh>
        ))}
      </group>

      {/* 물보라 — 부채꼴로 튀어 오르는 물방울 무리 */}
      <group ref={splashRef} visible={false}>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial
              color="#d3dde4" transparent opacity={0.7} roughness={0.06} metalness={0.4}
              envMapIntensity={1.5} depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* 고양이 — 몸통 · 머리 · 귀 · 꼬리 */}
      <group ref={catRef} visible={false}>
        <group ref={catLegRef} position={[0, 0.2, 0]}>
          <mesh position={[0, 0, 0]}>
            <capsuleGeometry args={[0.085, 0.26, 4, 8]} />
            <meshStandardMaterial color={C.cat} roughness={0.85} />
          </mesh>
          <mesh position={[0.21, 0.05, 0]}>
            <sphereGeometry args={[0.088, 10, 8]} />
            <meshStandardMaterial color={C.cat} roughness={0.85} />
          </mesh>
          {[-0.045, 0.045].map((z) => (
            <mesh key={z} position={[0.22, 0.14, z]} rotation={[0, 0, -0.2]}>
              <coneGeometry args={[0.032, 0.07, 4]} />
              <meshStandardMaterial color={C.cat} roughness={0.85} />
            </mesh>
          ))}
          <mesh position={[-0.22, 0.08, 0]} rotation={[0, 0, 0.9]}>
            <capsuleGeometry args={[0.022, 0.24, 3, 6]} />
            <meshStandardMaterial color={C.cat} roughness={0.85} />
          </mesh>
          {[[0.1, 0.06], [0.1, -0.06], [-0.1, 0.06], [-0.1, -0.06]].map(([x, z], i) => (
            <mesh key={i} position={[x, -0.13, z]}>
              <capsuleGeometry args={[0.022, 0.1, 3, 6]} />
              <meshStandardMaterial color={C.cat} roughness={0.85} />
            </mesh>
          ))}
        </group>
      </group>

      {/* 포스터의 떨어졌다 붙는 귀퉁이 */}
      {(() => {
        const p = PROBES.find((x) => x.id === "poster");
        const q = bearingToXZ(p.azimuth, p.radius - 0.008);
        return (
          <group position={[q.x, EYE_HEIGHT + 0.03, q.z]} rotation={[0, -Math.PI / 2 + 0.02, 0]}>
            <group ref={posterFlapRef} visible={false} position={[-0.155, 0, 0]}>
              <mesh material={M.paper} position={[0.06, 0, 0]}>
                <planeGeometry args={[0.12, 0.1]} />
              </mesh>
            </group>
          </group>
        );
      })()}
    </group>
  );
}

// ── 카메라 · 요각 · 리스너 ────────────────────────────────

function Rig({ lookRef, clockRef, onFrame, stageRef, running }) {
  const { camera } = useThree();
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const upv = useMemo(() => new THREE.Vector3(), []);
  const startRef = useRef(null);

  useEffect(() => {
    camera.position.set(0, EYE_HEIGHT, 0);
    camera.rotation.order = "YXZ";
  }, [camera]);

  useEffect(() => { startRef.current = running ? performance.now() : null; }, [running]);

  useFrame(() => {
    camera.rotation.y = THREE.MathUtils.degToRad(-lookRef.current.yaw);
    camera.rotation.x = THREE.MathUtils.degToRad(lookRef.current.pitch);

    // ★ 리스너 방향 갱신 — 이게 없으면 둘러봐도 소리 방향이 안 바뀐다.
    const stage = stageRef.current;
    if (stage) {
      camera.getWorldDirection(fwd);
      upv.copy(up).applyQuaternion(camera.quaternion);
      stage.setListener(fwd, upv);
    }

    if (!running || startRef.current === null) return;
    const elapsed = performance.now() - startRef.current;
    clockRef.current = elapsed;
    onFrame?.(elapsed, lookRef.current.yaw, lookRef.current.pitch);
  });

  return null;
}

/**
 * 하늘 · 빛 · 안개를 배합 벡터에 맞춰 실시간으로 움직인다.
 *
 * v1.1 §3 "하나의 무대, 네 개의 날씨" 를 그대로 구현한 자리다 — 무대는
 * 그대로 두고 하늘과 빛만 바꾼다. 관객에게는 "시스템이 작동했다"가 아니라
 * **"날씨가 변했다"** 로 읽혀야 한다.
 *
 * moodRef.current = { scores, confidence } — 판정이 갱신될 때마다 바뀐다.
 * 값이 뚝뚝 끊기지 않도록 매 프레임 목표로 완만하게 따라간다
 * (구현_리스크 §4-3 파라미터 떨림).
 */
function SkyAndMood({ moodRef, sunRef, hemiRef }) {
  const { gl, scene } = useThree();
  const skyMat = useMemo(() => makeSkyMaterial(), []);
  const bakerRef = useRef(null);
  const cur = useRef(null);
  const lastBake = useRef(0);
  const lastBaked = useRef(null);

  useEffect(() => {
    const baker = createSkyEnvBaker(gl, skyMat);
    bakerRef.current = baker;
    scene.environment = baker.bake();
    scene.background = null; // 돔 메시가 배경 역할을 한다
    return () => { baker.dispose(); bakerRef.current = null; };
  }, [gl, scene, skyMat]);

  useFrame((_, delta) => {
    const target = moodFor(moodRef.current?.scores, moodRef.current?.confidence ?? 0);
    // 4초쯤에 걸쳐 따라간다 — 요청서 §2.4 의 전환 시간(4초/6초)과 같은 감각
    cur.current = approachMood(cur.current, target, Math.min(1, delta / 4));
    const m = cur.current;

    skyMat.uniforms.uTop.value.setRGB(...m.skyTop);
    skyMat.uniforms.uHorizon.value.setRGB(...m.skyHorizon);
    skyMat.uniforms.uBottom.value.setRGB(...m.skyBottom);

    if (sunRef.current) {
      sunRef.current.color.setRGB(...m.sunColor);
      sunRef.current.intensity = m.sunIntensity;
      // 해가 낮아질수록 빛이 길게 눕는다 (로맨스의 "낮은 해")
      const el = m.sunElevation;
      sunRef.current.position.set(-26 * (1 - el * 0.3), 6 + 34 * el, -16);
      sunRef.current.castShadow = m.shadow > 0.05;
      sunRef.current.shadow.intensity = Math.min(1, m.shadow);
    }
    if (hemiRef.current) {
      hemiRef.current.color.setRGB(...m.ambientSky);
      hemiRef.current.groundColor.setRGB(...m.ambientGround);
      hemiRef.current.intensity = m.ambientIntensity;
    }
    if (scene.fog) {
      scene.fog.color.setRGB(...m.fogColor);
      scene.fog.near = m.fogNear;
      scene.fog.far = m.fogFar;
    }
    gl.toneMappingExposure = m.exposure;

    // 환경맵은 매 프레임 구우면 비싸다. 색이 눈에 띄게 바뀌었을 때만.
    const now = performance.now();
    const key = m.skyHorizon[0] * 3 + m.skyTop[2] * 5 + m.skyBottom[1];
    if (now - lastBake.current > 500 && Math.abs(key - (lastBaked.current ?? -99)) > 0.012) {
      lastBake.current = now;
      lastBaked.current = key;
      const env = bakerRef.current?.bake();
      if (env) scene.environment = env;
    }
  });

  return (
    <mesh material={skyMat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[330, 32, 20]} />
    </mesh>
  );
}

// ── 무대 전체 ──────────────────────────────────────────────

export default function ProbeStage({ lookRef, clockRef, stageRef, running, onFrame, moodRef, npc, bus }) {
  const M = useSceneMaterials();
  const cafeGlowRef = useRef();
  const sunRef = useRef();
  const hemiRef = useRef();
  const fallbackMood = useRef({ scores: null, confidence: 0 });
  const mood = moodRef || fallbackMood;

  return (
    <Canvas
      shadows
      camera={{ position: [0, EYE_HEIGHT, 0], fov: 62, near: 0.05, far: 420 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        // 원거리를 부드럽게 지워 하늘과 잇는다 — 구름이 낮게 깔린 오후
        // 지평선 밝기와 맞춘다 — 안 맞으면 원거리가 하늘과 다른 색으로 사라져
        // "판자를 세워 둔" 인상이 난다
        scene.fog = new THREE.Fog("#a6adb4", 36, 215);
      }}
    >
      <SkyAndMood moodRef={mood} sunRef={sunRef} hemiRef={hemiRef} />

      {/* 해 — 색·세기·높이를 배합이 정한다 */}
      <directionalLight
        ref={sunRef}
        position={[-26, 30, -16]}
        intensity={1.15}
        color="#efe8d8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-far={70}
        shadow-bias={-0.0006}
      />
      {/* 하늘 전체가 광원이다 — 흐릴수록 세진다 */}
      <hemisphereLight ref={hemiRef} args={["#b7c0c9", "#2f342c", 0.85]} />
      {/* 정류장 안쪽을 살짝 들어 올린다 (지붕에 막혀 어두워지는 것 보정) */}
      <pointLight position={[0, 2.1, 0.2]} intensity={0.28} distance={7} decay={2} color="#cdd4dc" />

      <Whitebox M={M} cafeGlowRef={cafeGlowRef} />
      <ProbeVisuals clockRef={clockRef} M={M} cafeGlowRef={cafeGlowRef} />

      {/* 캐릭터 장면 — 판정이 끝나면 여기서 이야기가 이어진다 */}
      {npc && <SeatedNpc genre={npc.genre} stage={npc.stage} t={npc.t} speaking={npc.speaking} />}
      {bus && <Bus272 t={bus.t} doorOpen={bus.doorOpen} />}
      <Rig lookRef={lookRef} clockRef={clockRef} onFrame={onFrame} stageRef={stageRef} running={running} />
    </Canvas>
  );
}
