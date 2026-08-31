"use client";

// 정류장 그레이박스(blockout) — GLB 업로드나 유료 이미지→3D API 없이, 코드로 직접
// 만든 실제 3D 지오메트리다. 근거는 Bus/규격/3D_배경_구성_기획.md(확정) 하나뿐 —
// 그 문서가 인용하는 두 원문만 따른다:
//
//   정류장_스크립트_v1.1.md: "공유되는 것은 무대의 전부(굽은 도로·온실·호수·침엽수림·
//   정류장)이고, 갈리는 것은 하늘과 빛, 그리고 그 아래 앉은 사람이다."
//   → 지형(나무 개수·위치·도로·카페·정류장 구조)은 장르와 무관하게 딱 한 번만
//     정한다. 장르가 바꾸는 건 <color background>·안개·조명(MOODS)뿐이다.
//     이전에 나무·카페 크기를 장르 코드 안에서 계속 다시 추측하던 게
//     "계속 이상해지는" 원인이었다 — 지형과 조명을 분리해서 고친다.
//
//   같은 문서의 장르별 하늘 표(원문 그대로):
//     로맨스: "구름이 갈라지며 낮은 해가 뚫고 나온다. 도로 전체가 금빛"
//     공포:   "구름이 더 두꺼워진다. 오후 세 시인데 밤처럼 어둡다" — 밤(navy)이
//             아니라 어두운 대낮 흐림이다.
//     블랙코미디: "균일하게 밝은 흐림. 그림자가 사라진다" — 방향광을 거의 끄고
//             앰비언트로만 채워 그림자 자체가 안 생기게 한다.
//
// v2.md §1의 방위·거리(카페 -38°, 오른쪽 유리 포스터 +72°, 침엽수림 +30~90°,
// 뒤쪽 풀숲 180° 등 — 정확한 각도가 없는 곳은 서술로 추정했다는 게 기획서에
// 명시돼 있음)도 지형에 포함되어 고정이다.

// ── 지형(고정) ──────────────────────────────────────────────
// 장르 무관 — 여기 있는 값은 다시 만지지 않는다. 조명만 MOODS에서 바뀐다.

const NEON_COLOR = "#ff9a3d"; // 지붕 밑 LED — 실제 조명기구 색이라 장르로 안 바뀜
const ROAD_COLOR = "#43464a"; // 아스팔트 고유색 — 장르별 느낌은 조명이 만든다

// ── 조명(장르별로만 다름) ───────────────────────────────────
const MOODS = {
  // 공통 도입부 — v2.md §1 "두꺼운 구름, 빛이 간헐적으로 새어 나옴, 밝고
  // 어두운 부분이 불규칙하게 섞임" — 아직 어느 장르도 아닌 중간 상태.
  neutral: { sky: "#9aa0a8", fog: "#9aa0a8", fogDensity: 0.032, ambient: "#c9ccd4", ambientI: 0.8, sun: "#f0ece0", sunI: 0.55, shadows: true },
  // 공포 — "밤처럼 어둡다"이지 밤은 아니다. 네이비색이 아니라 어둡고 탁한 회갈색.
  H: { sky: "#3d4043", fog: "#383b3e", fogDensity: 0.065, ambient: "#3a3d40", ambientI: 0.5, sun: "#565a5c", sunI: 0.12, shadows: true },
  // 로맨스 — "낮은 해가 뚫고 나옴, 도로 전체가 금빛" — 셋 중 유일하게 강한 방향광.
  R: { sky: "#f0b46a", fog: "#e6a374", fogDensity: 0.022, ambient: "#f4c99a", ambientI: 0.7, sun: "#ffd27a", sunI: 1.7, shadows: true },
  // 블랙코미디 — "균일하게 밝은 흐림, 그림자가 사라진다" — 방향광을 거의 죽이고
  // 앰비언트로만 채운다(castShadow 없음 → 그림자 자체가 안 생김).
  C: { sky: "#e9ecec", fog: "#e5e8e8", fogDensity: 0.012, ambient: "#f5f6f4", ambientI: 1.35, sun: "#ffffff", sunI: 0.05, shadows: false },
};

// 아주 가늘고 뾰족한 삼나무 — 원화(메인뷰) 기준 지붕(~2.4m)의 3~4배 높이,
// 밑동 반지름은 극단적으로 얇게. 개체 수를 줄이고 간격을 넓혀야
// 원화처럼 "듬성듬성, 개체가 구분됨"이 나온다 — Reeds/ForestRing 배치 참고.
function Cypress({ position, height = 7, lean = 0 }) {
  const segs = 5;
  return (
    <group position={position} rotation={[0, 0, lean]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.7, 6]} />
        <meshStandardMaterial color="#3a2e22" />
      </mesh>
      {Array.from({ length: segs }, (_, i) => {
        const t = i / segs;
        const y = 0.7 + (height - 0.7) * ((i + 0.9) / segs);
        const r = 0.22 * (1 - t * 0.85);
        const h = (height - 0.7) / segs + 0.15;
        return (
          <mesh key={i} position={[0, y, 0]} castShadow>
            <coneGeometry args={[Math.max(r, 0.02), h, 7]} />
            <meshStandardMaterial color={i % 2 === 0 ? "#233d2a" : "#2c4a33"} />
          </mesh>
        );
      })}
    </group>
  );
}

// 둥근 전나무 — 삼나무 사이에 드문드문 섞어 실루엣만 다양하게 한다.
function RoundPine({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 1, 6]} />
        <meshStandardMaterial color="#4a3a2a" />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <coneGeometry args={[0.75, 2.0, 8]} />
        <meshStandardMaterial color="#2f4a34" />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <coneGeometry args={[0.5, 1.6, 8]} />
        <meshStandardMaterial color="#38583e" />
      </mesh>
    </group>
  );
}

// 억새/갈대 군락 — 도로 건너 앞줄, 나무보다 낮고 관객과 가깝다.
function Reeds({ position, count = 5 }) {
  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => {
        const dx = (i - count / 2) * 0.12 + (i % 2 ? 0.05 : -0.03);
        const h = 0.9 + (i % 3) * 0.25;
        const lean = (i % 2 ? 1 : -1) * (0.08 + (i % 3) * 0.03);
        return (
          <mesh key={i} position={[dx, h / 2, 0]} rotation={[0, 0, lean]}>
            <cylinderGeometry args={[0.008, 0.02, h, 4]} />
            <meshStandardMaterial color="#c2b073" />
          </mesh>
        );
      })}
    </group>
  );
}

// 360도 배경 숲 — v2.md §1이 특정 방위(카페·포스터·침엽수림)만 서술해서, 그
// 사이는 하늘만 보이는 구멍이 남는다. 아주 먼 반경에 듬성듬성(원화처럼 개체가
// 구분되게, 촘촘한 벽이 아니게) 둘러 수평선을 채운다 — 개수를 줄이고 반경을
// 넓혀서 안개에 살짝 묻히는 먼 숲처럼 보이게 한다.
// Math.random() 대신 인덱스 기반 결정적 값 — 서버/클라이언트 하이드레이션 불일치 방지.
function ForestRing({ radius = 19, count = 13 }) {
  const trees = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + ((i * 53) % 11) * 0.025;
    const r = radius + ((i * 37) % 9) * 0.9;
    const height = 5.5 + ((i * 13) % 4);
    return {
      x: Math.sin(angle) * r,
      z: -Math.cos(angle) * r,
      height,
      isPine: i % 3 === 0,
    };
  });
  return (
    <>
      {trees.map((t, i) =>
        t.isPine ? (
          <RoundPine key={i} position={[t.x, 0, t.z]} scale={1 + (t.height - 6) * 0.1} />
        ) : (
          <Cypress key={i} position={[t.x, 0, t.z]} height={t.height} lean={((i % 3) - 1) * 0.02} />
        )
      )}
    </>
  );
}

function StreetLamp({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 3, 8]} />
        <meshStandardMaterial color="#33363c" />
      </mesh>
      <mesh position={[0, 2.95, 0.22]} rotation={[Math.PI / 2.4, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.5, 6]} />
        <meshStandardMaterial color="#33363c" />
      </mesh>
      <mesh position={[0, 2.9, 0.42]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color="#fff2c0" emissive="#fff2c0" emissiveIntensity={1.4} />
      </mesh>
      <pointLight position={[0, 2.9, 0.42]} color="#ffedb0" intensity={0.6} distance={4} />
    </group>
  );
}

// 정류장 지붕 — 원화의 핵심 디테일: 어두운 금속 프레임, 따뜻한 목재 지붕,
// 지붕 밑면을 따라 흐르는 얇은 네온 띠 두 줄(고정색 — NEON_COLOR).
function Shelter() {
  const postXs = [-0.95, 0.95];
  const postZs = [0.35, -1.05];
  return (
    <group>
      <mesh position={[0, 2.35, -0.35]} rotation={[0.04, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.08, 1.6]} />
        <meshStandardMaterial color="#4a3222" />
      </mesh>
      {[-0.55, 0.35].map((z) => (
        <mesh key={z} position={[0, 2.31, z]}>
          <boxGeometry args={[1.95, 0.015, 0.03]} />
          <meshStandardMaterial color={NEON_COLOR} emissive={NEON_COLOR} emissiveIntensity={1.6} />
        </mesh>
      ))}
      {postXs.map((x) =>
        postZs.map((z) => (
          <group key={`${x}-${z}`}>
            <mesh position={[x, 0.35, z]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
              <meshStandardMaterial color="#8a5a2e" />
            </mesh>
            <mesh position={[x, 1.5, z]} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 1.6, 8]} />
              <meshStandardMaterial color="#22242a" />
            </mesh>
          </group>
        ))
      )}
      <mesh position={[0, 1.1, -1.05]}>
        <boxGeometry args={[1.9, 2.1, 0.02]} />
        <meshPhysicalMaterial color="#bcd4e0" transparent opacity={0.22} roughness={0.08} metalness={0.1} />
      </mesh>
      <mesh position={[-0.95, 1.1, -0.35]}>
        <boxGeometry args={[0.02, 2.1, 1.4]} />
        <meshPhysicalMaterial color="#bcd4e0" transparent opacity={0.22} roughness={0.08} metalness={0.1} />
      </mesh>
      {/* 오른쪽 유리 — v2.md §1-1 "관객 오른쪽 유리에는 비에 젖은 포스터가
          붙어 있다" (다섯 관찰 단서 중 하나, 방위각 +72°는 기획서에서 추정값). */}
      <mesh position={[0.95, 1.1, -0.35]}>
        <boxGeometry args={[0.02, 2.1, 1.4]} />
        <meshPhysicalMaterial color="#bcd4e0" transparent opacity={0.22} roughness={0.08} metalness={0.1} />
      </mesh>
      <mesh position={[0.94, 1.25, -0.55]} rotation={[0, -Math.PI / 2, 0.06]}>
        <planeGeometry args={[0.32, 0.44]} />
        <meshStandardMaterial color="#e8e2d0" side={2} />
      </mesh>
    </group>
  );
}

function Bench() {
  return (
    <group position={[0, 0, 0.05]}>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.06, 0.42]} />
        <meshStandardMaterial color="#6b3a28" />
      </mesh>
      <mesh position={[0, 0.68, -0.19]} rotation={[-0.12, 0, 0]} castShadow>
        <boxGeometry args={[1.7, 0.5, 0.05]} />
        <meshStandardMaterial color="#6b3a28" />
      </mesh>
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.2, 0]}>
          <boxGeometry args={[0.06, 0.4, 0.38]} />
          <meshStandardMaterial color="#1e1a17" />
        </mesh>
      ))}
    </group>
  );
}

// v2.md §1-2 "도로 건너편 왼쪽 약 50미터 거리" — 원화의 카페는 실루엣 수준으로
// 작고 멀다. 방위각 -38°는 기획서 추정치.
function Cafe() {
  return (
    <group position={[-13, 0, -18]} scale={0.55}>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 2.1, 2.2]} />
        <meshStandardMaterial color="#2a2622" />
      </mesh>
      <mesh position={[0, 1.05, 1.11]}>
        <planeGeometry args={[2.3, 1.3]} />
        <meshStandardMaterial color="#ff8a5c" emissive="#ff6a3c" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0, 2.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.1, 0.7, 4]} />
        <meshStandardMaterial color="#1c1a17" />
      </mesh>
      <pointLight position={[0, 1.2, 1.5]} color="#ff8a5c" intensity={0.35} distance={3} />
    </group>
  );
}

// ── 지형 전체(고정) — 장르 인자를 받지 않는다 ──────────────────
function Terrain() {
  return (
    <>
      {/* 도로(왕복 4차선, v2.md §1) + 인도 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.4, 0, -10]} receiveShadow>
        <planeGeometry args={[8, 40]} />
        <meshStandardMaterial color={ROAD_COLOR} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.6, 0.01, -6]} receiveShadow>
        <planeGeometry args={[2.2, 20]} />
        <meshStandardMaterial color="#5c5c58" />
      </mesh>
      {[-0.06, 0.06].map((dx) => (
        <mesh key={dx} rotation={[-Math.PI / 2, 0, 0]} position={[2.4 + dx, 0.015, -12]}>
          <planeGeometry args={[0.04, 34]} />
          <meshStandardMaterial color="#e0b840" />
        </mesh>
      ))}
      {[0.35, 4.45].map((laneX) =>
        Array.from({ length: 10 }, (_, i) => (
          <mesh key={`${laneX}-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[laneX, 0.015, -1.5 - i * 2.2]}>
            <planeGeometry args={[0.08, 1.1]} />
            <meshStandardMaterial color="#d8d8d0" />
          </mesh>
        ))
      )}

      <Shelter />
      <Bench />
      <Cafe />

      {/* v2.md §1 "정류장 뒤에는 빗물을 머금은 풀숲이 있고" — 담장이 아니다. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, 0.02, 1.9]} receiveShadow>
        <planeGeometry args={[7, 1]} />
        <meshStandardMaterial color="#3a4a36" />
      </mesh>
      <Reeds position={[-2.2, 0, 1.85]} count={6} />
      <Reeds position={[-0.6, 0, 1.9]} count={7} />
      <Reeds position={[1.0, 0, 1.88]} count={6} />
      <Reeds position={[2.6, 0, 1.92]} count={7} />
      {/* 오른쪽 뒤 약 45도(=정면 기준 +135°, 기획서 추정) — v2.md §1-4 개구리 단서.
          소리 전용 사건이라 3D 자산은 필요 없지만 방향을 표시할 수풀만 더 둔다. */}
      <Reeds position={[1.9, 0, 1.9]} count={5} />
      {Array.from({ length: 4 }, (_, i) => (
        <RoundPine key={`bg${i}`} position={[-3 + i * 2, 0, 3.4 + (i % 2) * 0.5]} scale={0.9 + i * 0.08} />
      ))}

      {/* 도로 건너편(4차선 폭 밖, x>6.4) — v2.md §1 "정면 오른쪽에는 침엽수림과
          호수공원 산책로". 개체 수를 줄이고 x·z 간격을 넓혀 원화처럼 나무가
          겹치지 않고 하나씩 구분되게 한다. */}
      <Reeds position={[6.6, 0, -2.0]} count={5} />
      <Reeds position={[7.6, 0, -6.0]} count={6} />
      <Reeds position={[6.6, 0, -10.5]} count={5} />

      {[
        [7.2, -2.4, 6.5, -0.04],
        [8.8, -6.6, 7.2, 0.03],
        [7.0, -11.0, 6.0, -0.02],
        [9.2, -15.6, 8.2, 0.05],
      ].map(([x, z, h, lean], i) => (
        <Cypress key={i} position={[x, 0, z]} height={h} lean={lean} />
      ))}
      <RoundPine position={[6.8, 0, -8.8]} scale={1.1} />

      {/* 왼쪽(관객 쪽) 나무열 — 담장 자리였던 곳 너머 */}
      {[-1.6, -2.1].map((x, i) => (
        <Cypress key={`l${i}`} position={[x, 0, -1.2 - i * 3.2]} height={5.5 + i * 0.9} lean={(i - 0.5) * 0.03} />
      ))}
      {/* 뒤쪽 풀숲 너머 — 뒤돌아봤을 때도 깊이가 있게, 개체 수는 적게 */}
      {[-2.5, 1.0].map((x, i) => (
        <RoundPine key={`b${i}`} position={[x, 0, 3.6 + i * 0.5]} scale={1.0 + i * 0.1} />
      ))}

      <StreetLamp position={[6.3, 0, -6]} />
      <StreetLamp position={[1.4, 0, -0.3]} />

      {/* 배경 링 — 위 사건별 배치 사이에 하늘만 보이던 구멍을 없앤다 */}
      <ForestRing />
    </>
  );
}

export default function BlockoutStage({ genre }) {
  const mood = MOODS[genre] || MOODS.neutral;

  return (
    <>
      <color attach="background" args={[mood.sky]} />
      <fogExp2 attach="fog" args={[mood.fog, mood.fogDensity]} />
      <ambientLight color={mood.ambient} intensity={mood.ambientI} />
      <directionalLight position={[3, 6, 2]} color={mood.sun} intensity={mood.sunI} castShadow={mood.shadows} />

      <Terrain />
    </>
  );
}
