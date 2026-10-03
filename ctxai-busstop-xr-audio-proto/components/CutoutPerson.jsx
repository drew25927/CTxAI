"use client";

// 2D 컷아웃 인물 — 아트팀 전신 시트에서 오린 방향별 투명 PNG(public/reactive/cutouts, scripts/cutout_characters.py)를
// 3D 장면에 세운다. 리깅 GLB(RiggedPerson)를 대신하는 임시 대체: 납작한 판이 항상 카메라 쪽(Y축만)을 보고,
// 인물이 향한 방향과 카메라의 상대 각도에 따라 정면·3/4·옆·뒤 그림을 바꿔 끼운다.
// 걷기·앉기 동작은 없다 — 걷기는 위아래 흔들림, 앉기는 골반 위쪽만 잘라 벤치 좌면에 올리는 것으로 대신한다.
//
// 상태/시선 인터페이스는 RiggedPerson과 같다(walking·seated·facing·lookRef·cueRef) — 호출부만 바꿔 끼우면 된다.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { CanvasTexture, SRGBColorSpace, MathUtils, PlaneGeometry, Vector3, MeshStandardMaterial, DoubleSide } from "three";
import cast from "@/public/reactive/cutouts/manifest.json";

const VIEW_ORDER = ["front", "threeq", "side", "back"];
const SEAT_Y = 0.5; // 벤치 좌면 높이(m) — ReactiveStage SIT_POSE.seatY 와 같다
const tmpV = new Vector3();

// 인물 → 카메라 상대 각도(cos)로 쓸 그림을 고른다. cosθ=1: 인물이 카메라를 정면으로 봄.
function pickView(cos) {
  if (cos > 0.92) return "front";
  if (cos > 0.38) return "threeq";
  if (cos > -0.38) return "side";
  return "back";
}

// 앉힐 때 보여 줄 윗부분 — 아래쪽 가장자리를 부드럽게 흐려 좌면에 묻히게 하는 알파 맵(세로 방향).
function useFadeMap(cropFrac) {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas"); c.width = 4; c.height = 256;
    const g = c.getContext("2d");
    // 캔버스 y/256 = 1 − v. 앉힌 판의 아래 가장자리는 v = 1 − cropFrac(= y 비율 cropFrac)이고, 그 위 0.14만큼 흐려진다.
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(Math.max(0.01, cropFrac - 0.14), "#fff");
    grad.addColorStop(Math.min(0.99, cropFrac), "#000");
    grad.addColorStop(1, "#000");
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
    return t;
  }, [cropFrac]);
}

export default function CutoutPerson({ genre = "R", walking = false, seated = false, facing = 0, lookRef = null, cueRef = null, scale = 1 }) {
  const entry = cast[genre] || cast.R;
  const { heightM, seatCrop, faces } = entry.meta;
  const textures = useTexture(VIEW_ORDER.map((v) => `/reactive/cutouts/${entry.views[v].file}`));
  useMemo(() => textures.forEach((t) => { t.colorSpace = SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; }), [textures]);
  const fadeMap = useFadeMap(seatCrop);

  const root = useRef();   // 인물 위치 기준(부모 그룹 회전 포함)
  const body = useRef();   // 카메라를 바라보며 흔들리는 판
  const blend = useRef(seated ? 1 : 0);
  const appear = useRef(0);
  const curView = useRef("front");
  const mirror = useRef(1);

  // 판 모양 — 서 있을 땐 전체, 앉으면 머리~골반만(UV를 잘라서). 방향마다 가로 비율이 다르다.
  const geos = useMemo(() => VIEW_ORDER.map((v) => {
    const { w, h } = entry.views[v];
    const W = heightM * (w / h);
    return {
      full: new PlaneGeometry(W, heightM),
      seat: (() => {
        const g = new PlaneGeometry(W, heightM * seatCrop);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - seatCrop + uv.getY(i) * seatCrop);
        return g;
      })(),
    };
  }), [entry, heightM, seatCrop]);

  const meshes = useRef([]);
  const mats = useMemo(() => textures.map((t) => {
    const common = { map: t, transparent: true, alphaTest: 0.02, roughness: 1, metalness: 0, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.3, side: DoubleSide };
    return { full: new MeshStandardMaterial(common), seat: new MeshStandardMaterial({ ...common, alphaMap: fadeMap }) };
  }), [textures, fadeMap]);

  useFrame((state, dt) => {
    if (!root.current || !body.current) return;
    appear.current = Math.min(1, appear.current + dt / 0.6);
    const target = seated ? 1 : 0;
    blend.current = target > blend.current ? Math.min(1, blend.current + dt / 0.7) : Math.max(0, blend.current - dt / 0.7);
    const k = blend.current;

    // 월드 위치·인물 정면 방위(facing 은 RiggedPerson과 같은 규약: 모델 +z 기준 Y회전)
    root.current.getWorldPosition(tmpV);
    const px = tmpV.x, pz = tmpV.z;
    root.current.getWorldDirection(tmpV); // 그룹 +z 방향 (facing 회전 포함)
    let fwd = Math.atan2(tmpV.x, tmpV.z);
    const toCam = Math.atan2(state.camera.position.x - px, state.camera.position.z - pz);
    let d = Math.atan2(Math.sin(toCam - fwd), Math.cos(toCam - fwd));

    // 시선 접촉률만큼 몸을 관객 쪽으로 돌린다(그림이 정면·3/4쪽으로 바뀐다) — RiggedPerson 머리 look-at 대응
    if (lookRef) {
      const amt = (cueRef?.current?.lineGaze ?? lookRef.current?.npcGaze ?? 0.4) * (k > 0 ? 1 : 0.6);
      d *= 1 - MathUtils.clamp(amt, 0, 1) * 0.75;
    }
    const view = pickView(Math.cos(d));
    curView.current = view;
    // 3/4·옆 그림이 향한 쪽(faces)과 화면에서 실제로 향해야 할 쪽이 다르면 좌우 반전
    const screenSide = Math.sign(Math.sin(-d)) || 1; // 인물이 화면 오른쪽(+)/왼쪽(-)을 보는 쪽
    const f = faces[view];
    mirror.current = f === 0 ? 1 : (f === screenSide ? 1 : -1);

    meshes.current.forEach((m, i) => {
      if (!m) return;
      const on = VIEW_ORDER[i] === view;
      m.visible = on;
      if (on) {
        m.geometry = k > 0.5 ? geos[i].seat : geos[i].full;
        m.material = k > 0.5 ? mats[i].seat : mats[i].full;
        m.scale.x = mirror.current;
        // 앉음: 그림 아래 가장자리가 좌면 높이에 오도록 / 섬: 발이 바닥에
        const h = k > 0.5 ? heightM * seatCrop : heightM;
        m.position.y = (k > 0.5 ? SEAT_Y - 0.02 : 0) + h / 2;
      }
    });

    // 판을 카메라 쪽으로 (Y축만) — 부모 월드 회전을 빼 준다
    root.current.getWorldDirection(tmpV);
    body.current.rotation.y = toCam - Math.atan2(tmpV.x, tmpV.z);
    // 걷기 흔들림 / 앉아서 숨쉬기
    const t = state.clock.elapsedTime;
    const bob = walking && k < 0.5 ? Math.abs(Math.sin(t * 7)) * 0.03 : Math.sin(t * 1.25) * 0.004 * k;
    body.current.position.y = bob;
    body.current.rotation.z = walking && k < 0.5 ? Math.sin(t * 7) * 0.025 : 0;
    mats.forEach((m) => { m.full.opacity = appear.current; m.seat.opacity = appear.current; });
  });

  return (
    <group ref={root} rotation={[0, facing, 0]} scale={scale}>
      <group ref={body}>
        {VIEW_ORDER.map((v, i) => (
          <mesh key={v} ref={(m) => { meshes.current[i] = m; }} geometry={geos[i].full} material={mats[i].full} visible={v === "front"} />
        ))}
      </group>
      {/* 바닥 그림자 — 납작한 판은 그림자를 못 만들어서 덩어리 그림자로 대신 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} visible={!seated}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}
