"use client";

// 캐릭터 장면의 3D 배우들 — 옆에 앉는 사람과 272번 버스.
//
// 지금까지 /story-v2 는 이 구간을 **평면 그림 3장**으로 처리했다. 판정은 3D
// 안에서 하고 이야기는 이미지로 나오는 게 이상해서, 같은 씬 안에서 이어지도록
// 옮긴다. 전시 최종형은 어차피 옆자리에 실제로 사람이 앉는 것이다.
//
// 세 인물은 서로 다른 사람이다 — 블렌딩되지 않는 **이산 채널**이라
// 배합 벡터로 섞지 않고 주도 장르로 하나를 고른다
// (구현_리스크와_지원_필요사항.md §4-1 "등장인물").
//
//   🖤 공포        중년 남성 — 카페에서 나온 그 사람과 "거의 같지만 다른" 우비
//   💗 로맨스      젊은 여성 — 가방끈을 만지작거린다
//   💛 블랙코미디  할머니 — 지팡이, 앉는다기보다 몸을 던진다
//
// 근거: 정류장_스크립트_v2.md §3 · 정류장_스크립트_v1.1.md §1

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// 옆자리 — 벤치 오른쪽. 관객은 원점에 앉아 있다.
const SEAT = [0.62, 0, 0.12];

const SKIN = "#a98d78";

// ── 인물별 형태 ────────────────────────────────────────────

function HorrorMan({ mat }) {
  // "그 손은 여자의 손이 아니다. 중년 남성이다." — 후드를 넘긴 상태
  return (
    <group>
      <mesh material={mat.coat} position={[0, 0.66, 0]}>
        <capsuleGeometry args={[0.19, 0.42, 4, 10]} />
      </mesh>
      {/* 우비 — 카페에서 나온 그 사람과 거의 같은 색, 그런데 뭔가 하나 다르다 */}
      <mesh material={mat.poncho} position={[0, 0.78, 0]}>
        <coneGeometry args={[0.33, 0.62, 12, 1, true]} />
      </mesh>
      <mesh material={mat.skin} position={[0, 1.06, 0.01]}>
        <sphereGeometry args={[0.108, 14, 12]} />
      </mesh>
      {/* 넘긴 후드가 목 뒤에 접혀 있다 */}
      <mesh material={mat.ponchoDark} position={[0, 1.0, -0.13]} rotation={[0.7, 0, 0]}>
        <sphereGeometry args={[0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
      </mesh>
      {/* 무릎 — 정면을 본 채로 앉아 있다 */}
      {[-0.09, 0.09].map((x) => (
        <mesh key={x} material={mat.coat} position={[x, 0.38, -0.19]} rotation={[1.15, 0, 0]}>
          <capsuleGeometry args={[0.062, 0.3, 4, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function RomanceWoman({ mat }) {
  return (
    <group>
      <mesh material={mat.coatWarm} position={[0, 0.62, 0]}>
        <capsuleGeometry args={[0.155, 0.36, 4, 10]} />
      </mesh>
      <mesh material={mat.skin} position={[0, 0.96, 0.01]}>
        <sphereGeometry args={[0.098, 14, 12]} />
      </mesh>
      {/* 묶은 머리 */}
      <mesh material={mat.hair} position={[0, 1.0, -0.02]}>
        <sphereGeometry args={[0.104, 14, 12]} />
      </mesh>
      <mesh material={mat.hair} position={[0, 0.94, -0.11]}>
        <sphereGeometry args={[0.055, 10, 8]} />
      </mesh>
      {[-0.075, 0.075].map((x) => (
        <mesh key={x} material={mat.coatWarm} position={[x, 0.36, -0.17]} rotation={[1.2, 0, 0]}>
          <capsuleGeometry args={[0.052, 0.26, 4, 8]} />
        </mesh>
      ))}
      {/* 무릎 위의 가방 — 끈을 만지작거린다 */}
      <mesh material={mat.bag} position={[0.02, 0.5, -0.16]}>
        <boxGeometry args={[0.22, 0.16, 0.1]} />
      </mesh>
    </group>
  );
}

function ComedyGrandma({ mat }) {
  // "앉는다기보다 벤치에 몸을 던진다. 쿵." — 작고 구부정하다
  return (
    <group>
      <mesh material={mat.knit} position={[0, 0.58, 0.03]} rotation={[0.18, 0, 0]}>
        <capsuleGeometry args={[0.165, 0.3, 4, 10]} />
      </mesh>
      <mesh material={mat.skin} position={[0, 0.87, -0.02]}>
        <sphereGeometry args={[0.095, 14, 12]} />
      </mesh>
      <mesh material={mat.hair2} position={[0, 0.91, -0.03]}>
        <sphereGeometry args={[0.1, 14, 12]} />
      </mesh>
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} material={mat.knit} position={[x, 0.34, -0.16]} rotation={[1.25, 0, 0]}>
          <capsuleGeometry args={[0.055, 0.24, 4, 8]} />
        </mesh>
      ))}
      {/* 지팡이 — 탁. */}
      <mesh material={mat.cane} position={[0.24, 0.36, -0.1]} rotation={[0.12, 0, -0.1]}>
        <cylinderGeometry args={[0.014, 0.016, 0.72, 8]} />
      </mesh>
      <mesh material={mat.cane} position={[0.235, 0.71, -0.14]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.045, 0.014, 6, 12, Math.PI]} />
      </mesh>
    </group>
  );
}

const FIGURES = { H: HorrorMan, R: RomanceWoman, C: ComedyGrandma };

// ── 옆자리 인물 ────────────────────────────────────────────

/**
 * @param genre   "H" | "R" | "C" — 주도 장르. 이산 선택이다.
 * @param stage   "approach" | "seated" | "leaving" | "gone"
 * @param t       stage 안에서의 진행률 0~1
 * @param speaking 지금 말하고 있는가 — 미세한 상체 움직임
 */
export function SeatedNpc({ genre, stage, t, speaking }) {
  const ref = useRef();
  const bodyRef = useRef();

  const mat = useMemo(() => ({
    coat: new THREE.MeshStandardMaterial({ color: "#3b4149", roughness: 0.72 }),
    coatWarm: new THREE.MeshStandardMaterial({ color: "#7d6a63", roughness: 0.78 }),
    knit: new THREE.MeshStandardMaterial({ color: "#6b6257", roughness: 0.88 }),
    poncho: new THREE.MeshStandardMaterial({ color: "#4d5560", roughness: 0.32, metalness: 0.06, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
    ponchoDark: new THREE.MeshStandardMaterial({ color: "#3a414a", roughness: 0.34, side: THREE.DoubleSide }),
    skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.68 }),
    hair: new THREE.MeshStandardMaterial({ color: "#241d1a", roughness: 0.8 }),
    hair2: new THREE.MeshStandardMaterial({ color: "#8d8a84", roughness: 0.86 }),
    bag: new THREE.MeshStandardMaterial({ color: "#4a3f39", roughness: 0.75 }),
    cane: new THREE.MeshStandardMaterial({ color: "#4a3a2c", roughness: 0.7 }),
  }), []);

  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const now = clock.getElapsedTime();

    if (stage === "approach") {
      // 젖은 보도를 밟는 발소리와 함께 오른쪽에서 다가온다
      const x = SEAT[0] + (1 - t) * 3.2;
      g.position.set(x, 0, SEAT[2] - (1 - t) * 1.1);
      g.rotation.y = -0.35;
      g.visible = true;
    } else if (stage === "seated") {
      g.position.set(SEAT[0], 0, SEAT[2]);
      // 대부분 정면을 본다. 말할 때만 아주 조금 관객 쪽으로 돈다.
      g.rotation.y = -0.12 - (speaking ? 0.22 : 0);
      g.visible = true;
    } else if (stage === "leaving") {
      // 장르마다 떠나는 방향이 다르다 (v2.md §3)
      //   공포 정류장 뒤 풀숲 / 로맨스·코미디 버스 쪽
      const away = genre === "H" ? [SEAT[0] + 1.2, SEAT[2] + 5.5] : [SEAT[0] - 1.4, SEAT[2] - 4.2];
      g.position.set(SEAT[0] + (away[0] - SEAT[0]) * t, 0, SEAT[2] + (away[1] - SEAT[2]) * t);
      g.rotation.y = genre === "H" ? Math.PI * 0.86 : -0.9;
      g.visible = t < 0.98;
    } else {
      g.visible = false;
    }

    // 숨 — 앉아 있는 동안 상체가 아주 미세하게 오르내린다.
    // 이게 없으면 마네킹으로 보인다.
    if (bodyRef.current) {
      const breathe = Math.sin(now * 1.15) * 0.006;
      const talk = speaking ? Math.sin(now * 7.3) * 0.008 : 0;
      bodyRef.current.position.y = breathe + talk;
      bodyRef.current.rotation.x = speaking ? Math.sin(now * 5.1) * 0.012 : 0;
    }
  });

  const Figure = FIGURES[genre] || FIGURES.R;
  const standing = stage === "approach" || stage === "leaving";

  return (
    <group ref={ref} visible={false}>
      {/* 서 있을 때는 위로 올린다 — 앉은 자세로 걷지 않게 */}
      <group ref={bodyRef} position={[0, standing ? 0.34 : 0.42, 0]}>
        <Figure mat={mat} />
      </group>
    </group>
  );
}

// ── 272번 ──────────────────────────────────────────────────

/**
 * 버스는 도로 위 직선을 달려 정류장 앞에 선다.
 * 프로브의 트럭과 같은 규약 — 위치를 보간하고 방향은 거기서 나온다.
 *
 * @param t  0 → 오른쪽 멀리 / 0.72 이후 정차 / 1 → 왼쪽으로 사라짐
 */
export function Bus272({ t, doorOpen }) {
  const ref = useRef();
  const doorRef = useRef();

  const mat = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: "#3f6a92", roughness: 0.42, metalness: 0.34, envMapIntensity: 1.1 }),
    roof: new THREE.MeshStandardMaterial({ color: "#cfd4d8", roughness: 0.5, metalness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({
      color: "#17202a", roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.72, envMapIntensity: 1.8,
    }),
    tire: new THREE.MeshStandardMaterial({ color: "#1b1d20", roughness: 0.92 }),
    dest: new THREE.MeshBasicMaterial({ color: "#f2c56a" }),
    lamp: new THREE.MeshBasicMaterial({ color: "#ffeec9" }),
  }), []);

  const STOP_X = -1.6;      // 앞문이 관객 왼쪽 앞에 서도록
  const LANE_Z = -5.6;      // 트럭과 같은 차선

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    // 0~0.72 접근하며 감속, 0.72~0.86 정차, 이후 출발
    let x;
    if (t < 0.72) {
      const u = t / 0.72;
      const ease = 1 - Math.pow(1 - u, 2.4);   // 브레이크
      x = 34 + (STOP_X - 34) * ease;
    } else if (t < 0.86) {
      x = STOP_X;
    } else {
      const u = (t - 0.86) / 0.14;
      x = STOP_X - u * u * 40;
    }
    g.position.set(x, 0, LANE_Z);
    g.visible = t > 0.001 && t < 0.999;
    if (doorRef.current) {
      const target = doorOpen ? 1.02 : 0;
      doorRef.current.position.z += (target - doorRef.current.position.z) * 0.12;
    }
  });

  return (
    <group ref={ref} visible={false} rotation={[0, -Math.PI / 2, 0]}>
      {/* 차체 — 진행 방향이 -X 이므로 로컬 Z 가 길이 방향 */}
      <mesh material={mat.body} position={[0, 1.62, 0]} castShadow>
        <boxGeometry args={[2.5, 2.3, 10.6]} />
      </mesh>
      <mesh material={mat.roof} position={[0, 2.82, 0]}>
        <boxGeometry args={[2.42, 0.16, 10.4]} />
      </mesh>
      {/* 측면 창 — 관객 쪽 */}
      <mesh material={mat.glass} position={[1.26, 1.95, 0.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[8.2, 1.05]} />
      </mesh>
      <mesh material={mat.glass} position={[-1.26, 1.95, 0.6]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[8.2, 1.05]} />
      </mesh>
      {/* 앞유리 + 행선지 표시면 */}
      <mesh material={mat.glass} position={[0, 1.95, -5.32]}>
        <planeGeometry args={[2.2, 1.15]} />
      </mesh>
      <mesh material={mat.dest} position={[0, 2.6, -5.33]}>
        <planeGeometry args={[1.5, 0.26]} />
      </mesh>
      {/* 앞문 — 열리면 옆으로 밀린다 */}
      <group position={[1.27, 1.5, -3.5]}>
        <mesh ref={doorRef} material={mat.glass} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.0, 1.9]} />
        </mesh>
      </group>
      {/* 바퀴 */}
      {[-3.8, 3.2].map((z) =>
        [-1.2, 1.2].map((x) => (
          <mesh key={`${x}-${z}`} material={mat.tire} position={[x, 0.48, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.48, 0.48, 0.3, 14]} />
          </mesh>
        ))
      )}
      {/* 전조등 */}
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} material={mat.lamp} position={[x, 0.95, -5.34]}>
          <sphereGeometry args={[0.14, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}
