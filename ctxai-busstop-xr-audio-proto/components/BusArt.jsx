"use client";
// 272번 버스 — 아트팀 V13 Blender 장면(BUS_STOP_XR_WORKER_READY_V13.blend)의 버스를 웹용으로 줄인 GLB.
// 변환(scripts/blender/export_bus_v13.py): 문 닫힘·바퀴 0 상태로 굳히고, 모서리 베벨을 끄고, 고정 차체 1개 + 문짝 8 + 바퀴 4 로
// 메시를 합친 뒤 차체만 약 5만 삼각형으로 줄였다(원본 약 30만 → 합계 약 6.4만). 절차적 에나멜 색은 원본 램프 중간값으로 굳혔다.
//
// 리그는 원본 드라이버를 그대로 옮긴다 (Blender 로컬 Z → glTF Y, Blender 로컬 Y → glTF −Z):
//   앞문/뒷문 접이식 두 짝: A = ∓v·85°, B = ±v·170° (v = 열림 0~1)
//   바퀴: 굴러간 거리 m / 반지름 0.59
// 로컬 좌표는 components/Bus.jsx 와 같게 맞춘다: +z 가 앞, −x 가 연석(관객) 쪽, 앞문 중심 z≈2.4 (타임라인의 정차 위치 기준).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Vector3 } from "three";

export const BUS_ART_URL = "/reactive/models/bus272_v13.glb";
const DOOR_A = 1.483529864, DOOR_B = 2.967059728, WHEEL_R = 0.59;
const FRONT_DOOR_SHIFT = -1.21; // V13 앞문 중심(로컬 z≈3.61)을 기존 버스의 앞문 자리(z≈2.4)로
const DOOR_SPEED = 1.1; // 열림/닫힘 초당 변화량 (약 0.9초)

export default function BusArt({ doorOpen = false }) {
  const { scene } = useGLTF(BUS_ART_URL, false, true);
  const group = useRef();
  const rig = useMemo(() => {
    const find = (n) => scene.getObjectByName(n);
    const doors = [];
    for (const which of ["FRONT", "REAR"]) {
      for (const side of ["1", "-1"]) {
        const s = side === "1" ? -1 : 1; // _1_ 은 A 가 −, B 가 +
        const a = find(`CTRL_DOOR_${which}_${side}_A`), b = find(`CTRL_DOOR_${which}_${side}_B`);
        if (a) doors.push({ node: a, k: s * DOOR_A, which });
        if (b) doors.push({ node: b, k: -s * DOOR_B, which });
      }
    }
    const wheels = ["0_-1", "0_1", "1_-1", "1_1"].map((n) => find(`CTRL_WHEEL_${n}`)).filter(Boolean);
    return { doors, wheels };
  }, [scene]);
  useEffect(() => {
    scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }, [scene]);

  const st = useRef({ front: 0, prev: null, roll: 0 });
  const wp = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    const s = st.current;
    const target = doorOpen ? 1 : 0;
    s.front += Math.max(-DOOR_SPEED * dt, Math.min(DOOR_SPEED * dt, target - s.front));
    for (const d of rig.doors) d.node.rotation.y = d.which === "FRONT" ? d.k * s.front : 0;
    // 바퀴 — 이 버스가 실제로 움직인 거리(월드)만큼 굴린다
    if (group.current) {
      group.current.getWorldPosition(wp);
      if (s.prev) s.roll += wp.distanceTo(s.prev);
      s.prev = (s.prev || new Vector3()).copy(wp);
    }
    for (const w of rig.wheels) w.rotation.z = s.roll / WHEEL_R;
  });

  return (
    <group ref={group}>
      <primitive object={scene} position={[0, 0, FRONT_DOOR_SHIFT]} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}

useGLTF.preload(BUS_ART_URL, false, true);
