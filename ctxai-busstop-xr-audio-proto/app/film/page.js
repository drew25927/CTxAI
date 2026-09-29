"use client";

// /film — 반응형 실시간 VR 영화 (2026-09-10).
//
// /story-vr(관찰 11초 → 판정 1회 → 고정 장면)와 달리, 여기서는 체험 내내
// 연출 상태(lib/directionState.js)가 갱신되고, 그 상태가 매 프레임 장면 전체
// (하늘·태양·안개·가로등·도로 반사·옆사람의 거리와 시선·대사 간격·BGM)를 움직인다.
//
// 폐루프
//   헤드셋/카메라 포즈 ──┐
//   웹캠 얼굴(선택)  ──┼─→ 연출 상태 {R,H,C} ─→ 매핑표 ─→ 렌더·연기·소리
//                       └────────────── 관객이 그걸 보고 다시 반응 ──┘
//
// 이산으로 남는 것: "누가 앉는가"(R/H/C 세 인물 중 하나, 판정 시점 t≈58s에 확정)와
// 대사 46줄의 텍스트. 나머지는 전부 연속이고 착석 뒤에도 계속 움직인다.
//
// 인프라: Supabase·Vercel·ElevenLabs 없이 동작한다. 오디오는 public/reactive/audio
// (scripts/pull-assets.mjs 로 받은 로컬 파일)에서만 읽는다.
//
// URL 옵션: ?speed=2 (영화 시간 배속) · ?cam=0 (웹캠 채널 끄기) · ?hud=0 (HUD 숨김) · ?rig=0 (리깅 캐릭터 끄기) · ?fx=0 (후처리·도로 반사 끄기)
//           ?gaze=0 (데스크톱 자동 시선 끄기) · ?auto=1 (게이트 없이 자동 시작)
//           ?pool=1 (대사 풀 모드 — 원문 46줄 대신 상태에 따라 보조 장르 변주를 줄마다 고른다. 목소리는 OpenRouter 합성)
//           ?scene=240 (캐릭터 장면 목표 길이 초 — 대사 사이 침묵을 늘려 안내방송의 "5분 후 도착"에 가깝게. 기본 0 = 자연 길이)
//           ?voice=1 (음성 채널 — 안내방송 뒤 "당신은 무엇을 기다리고 있습니까?"를 묻고 답을 STT·톤 분석해 증거로 넣고,
//                     답에서 뽑은 명사를 정류장 이름 표지판에 쓴다. 요청서 v5.0 §2.6) · ?voicefake=romance (마이크 대신 샘플 파일)
//           ?viewer=fearful|curious|calm (합성 관객, lib/gazeSim.js — 헤드셋·드래그 없이 지어낸 관객의 고개 움직임을 센서에 넣고
//                     카메라도 그쪽으로 돌린다. 시연·증거용이며 화면에 배지를 항상 띄운다) · ?seed=N (합성 관객 난수 시드, 기본 1)
//           ?talk=0 (합성 관객이 옆사람의 대사 중에 화자 쪽을 보지 않게 — B67 이전 동작, 비교용)

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { XR, createXRStore, useXR } from "@react-three/xr";
import { EffectComposer, Bloom, Vignette, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Euler, MathUtils, Vector3 } from "three";
import ReactiveStage from "@/components/ReactiveStage";
import { createDirectionState, rank } from "@/lib/directionState";
import { createHeadPoseSensor } from "@/lib/headPoseSense";
import { createEngagementSensor } from "@/lib/engagementSense";
import { createGazeSim, isGazeProfile, GAZE_PROFILES } from "@/lib/gazeSim";
import { fitViewerModel } from "@/lib/viewerModel";
import { estimateTensionSeries, trackingStats, isObserved, OBS_EPS } from "@/lib/tensionEstimate";
import DirectorMonitor from "@/components/DirectorMonitor";
import { curveAt, controlTrack, isMixTrack } from "@/lib/tensionCurve";
import { runController, microDecision, nextAdvice } from "@/lib/slotController";
import { decideSlot, CONTROLLED_SLOTS, DECIDE_AT, PROBE_DOSE, previewSlotEntries } from "@/lib/slotActuate";
import { actuationFor, actuationEffect, bgmScale, ACTUATE_PARAMS, ACTUATED_KEYS } from "@/lib/controlActuate";
import { selectTrack } from "@/lib/trackSelect";
import { deriveBgmGains, deriveParams, TRIGGERS } from "@/lib/directionMap";
import { CUES, evalActors, T } from "@/lib/filmTimeline";
import { DIALOGUE_V2_LINES, DIALOGUE_V2_GENRE_LABEL } from "@/lib/dialogueV2Lines";
import { observe, judgeFromBehavior } from "@/lib/behaviorSense";
import { loadDialoguePool, pickPoolLine, poolCoverage } from "@/lib/dialoguePool";
import { beatOf, gazeFor, playsLine, playedCount, beatsTotalSec, nextPlayedBeat, subtitleHoldSec, splitLead, silenceAfter, dialogueQuiet, quietState, answerWatchStart, answerWatchUpdate, answerWatchResult } from "@/lib/dialogueBeats";
import { scoresFromMoodApi } from "@/lib/textKeywords";
import { analyzeProsody } from "@/lib/voiceProsody";
import { mixLines, mmss, fingerprintText, focusText, filmTimeEvents, STIMULUS_LABEL } from "@/lib/viewerText";
import s from "../story/story.module.css";
import f from "./film.module.css";

const xrStore = createXRStore();
const AUDIO_BASE = "/reactive/audio";
const CANVAS_CAMERA = { position: [0, 1.15, 0.35], fov: 60 };
const GENRE_META = {
  R: { accent: "#f2a7c0", label: "로맨스" },
  H: { accent: "#8fae95", label: "공포" },
  C: { accent: "#e0a86a", label: "블랙코미디" },
};
const CAM_WINDOW_MS = 8000;
const EVENT_LABEL = STIMULUS_LABEL; // 사건 이름표는 종료 카드·비교 화면·/interim 과 한 표(lib/viewerText.js)
// 관객 반응 지문(fingerprintText)·집중한 순간(focusText)도 lib/viewerText.js — 비교 화면과 사본이 갈라졌던 문제(B84·B108)

// 연속 액추에이터의 기준값(B116) — ReactiveStage 가 오프셋을 얹기 전의 deriveParams 값 중 구동 축만.
// 모니터·control:actuate 가 "밀려고 한 양(오프셋)" 이 아니라 "무대가 받은 양(적용 − 기준)" 을 적게 한다.
function actBase(snap) {
  const p = deriveParams(snap.current, snap.settled);
  return Object.fromEntries(ACTUATED_KEYS.filter((k) => Number.isFinite(p[k])).map((k) => [k, p[k]]));
}

// URL 옵션은 마운트 뒤에 읽는다 — 서버 렌더와 첫 클라이언트 렌더가 같아야 하이드레이션 오류가 없다.
function useQuery() {
  const [q, setQ] = useState({});
  useEffect(() => { setQ(Object.fromEntries(new URLSearchParams(window.location.search).entries())); }, []);
  return q;
}

// 캔버스 안에서 도는 디렉터 — 카메라 포즈를 센서에 넣고, 상태를 tick 하고, 타임라인을 밀고, 큐를 쏜다.
function FilmDirector({ directionRef, sensorRef, engagementRef, actorsRef, filmRef, onCue, onDecide, speed, debugBus = false, debugTruck = false, viewerSimRef, controlsRef }) {
  const session = useXR((xr) => xr.session);
  const euler = useMemo(() => new Euler(), []);
  const dir = useMemo(() => new Vector3(), []);
  useFrame((state, dt) => {
    const d = directionRef.current;
    const film = filmRef.current;
    if (!d || !film.running) return;
    if (!film.fired) film.fired = new Set();
    const clamped = Math.min(dt, 0.1);
    d.tick(clamped);

    // 카메라 포즈 → 헤드 포즈 센서. 오른쪽 = +yaw. 뒤로 물러남(z+)은 헤드셋 세션에서만 의미가 있다.
    euler.setFromQuaternion(state.camera.quaternion, "YXZ");
    let yaw = -MathUtils.radToDeg(euler.y);
    let pitch = MathUtils.radToDeg(euler.x);
    let roll = MathUtils.radToDeg(euler.z);
    if (film.autoGaze && film.autoGazeHold) { yaw = film.autoGazeHold.yaw; pitch = film.autoGazeHold.pitch; }
    const cp = state.camera.position;
    let x = session ? cp.x : 0, y = session ? cp.y : 0, z = session ? cp.z : 0;
    // 합성 관객(?viewer=, lib/gazeSim.js) — 헤드셋 세션이 아니면 카메라 대신 합성 자세를 센서에 넣고, 카메라도 같은
    // 방위로 돌려 프레임에 시선이 보이게 한다(DesktopGaze 와 같은 방식이며, 그쪽은 이때 마운트되지 않는다).
    const sim = viewerSimRef?.current;
    const simOn = !!sim && !session;
    if (simOn) {
      const p = sim.step(film.t, clamped);
      yaw = p.yaw; pitch = p.pitch; roll = p.roll; x = p.x; y = p.y; z = p.z;
      const c = controlsRef?.current;
      if (c) {
        const r = dir.copy(c.target).sub(cp).length() || 0.01;
        const ry = MathUtils.degToRad(yaw), rp = MathUtils.degToRad(pitch);
        dir.set(Math.sin(ry) * Math.cos(rp), Math.sin(rp), -Math.cos(ry) * Math.cos(rp)).multiplyScalar(r);
        cp.copy(c.target).sub(dir);
      }
    }
    sensorRef.current?.update(yaw, pitch, z, clamped);
    // 집중도·잔움직임·탐침 반응 — 같은 자세 스트림에서 데이터 세 층을 뽑는다(파일럿·모델·제작 도구용)
    engagementRef.current?.update({ yaw, pitch, roll, x, y, z }, clamped);

    // 영화 시간
    film.t += clamped * speed;
    // 슬롯 변형 결정(B78) — 개구리·고양이는 첫 자극(소리·동선)보다 조금 앞(DECIDE_AT)에서 그 순간의 θ̂·x̂ 으로 변형을 정한다.
    // 큐보다 먼저 돌아야 고양이 동선(43s)이 소리(43.6s)보다 앞서 정해진 타이밍을 쓴다. 제어 OFF 면 고정 연출로 정해진다.
    if (onDecide) for (const id of CONTROLLED_SLOTS) if (film.t >= DECIDE_AT[id] && !film.slotChoice?.[id]) onDecide(id);
    for (const cue of CUES) {
      if (film.t >= cue.t && !film.fired.has(cue.name)) {
        film.fired.add(cue.name);
        onCue(cue);
      }
    }

    const actors = evalActors(film.t, { dominant: film.dominant, npcDistance: film.npcDistance, busAt: film.busAt, leaveAt: film.leaveAt, cat: film.slotChoice?.cat?.schedule || null });
    if (debugBus) actors.bus = { visible: true, x: -1.2, z: -4.75, stopped: true, doorOpen: true, headlight: 0.6 }; // ?bus=1 — 정차한 버스를 바로 본다 (디자인 점검용)
    if (debugTruck) actors.truck = { visible: true, x: 1.0, z: -4.6 }; // ?truck=1 — 트럭을 물웅덩이 앞에 세운다
    actorsRef.current = actors;

    // 합성 관객이 쉴 때 보는 곳 — 버스가 오면 정면 약간 오른쪽, 옆사람이 앉아 있으면 그쪽(얼굴이 화면을 채우지 않게 DesktopGaze 와 같은 63° 상한)
    if (simOn) {
      const npcAz = actors.npc?.visible ? Math.min(MathUtils.radToDeg(AUTO_GAZE_NPC), MathUtils.radToDeg(Math.atan2(actors.npc.x - cp.x, -(actors.npc.z - cp.z)))) : null;
      const npcRest = npcAz != null && actors.npc.seated ? npcAz : null;
      // 옆사람이 말하는 동안(질문 뒤 기다림 포함)은 화자 쪽을 본다(B67, gazeSim TALK) — 공포형의 곁눈질(0.35)로는 화자가 화면 밖이었다.
      // 보는 창은 자막 창에 맞춘다(B118): 줄이 뜨기 조금 전(lookAhead)부터 자막이 지워질 때(lookUntil)까지. 버스가 온 뒤의
      // 마지막 말("먼저 가세요.")도 이 동안은 화자 쪽 — 그 밖에는 종전대로 버스가 우선이다.
      const talkLook = film.talkLook && (film.talking || film.lookAhead || film.t < film.lookUntil);
      // 말하는 쪽은 앉아 있지 않아도 본다 — 버스가 서면(busAt+7) 옆사람은 seated:false 가 되는데 마지막 말은 그 직후다
      if (npcAz != null && talkLook) sim.setRest(npcAz, { talk: true });
      else if (film.busAt != null) sim.setRest(MathUtils.radToDeg(AUTO_GAZE_BUS));
      else if (npcRest != null) sim.setRest(npcRest);
      else sim.setRest(0);
    }

    // 옆사람이 앉아 있으면 그 방향을 센서에 알려 "사람에 대한 관심"을 잰다
    if (actors.npc?.visible && actors.npc.seated && !film.autoGaze) {
      const dx = actors.npc.x - state.camera.position.x;
      const dz = actors.npc.z - state.camera.position.z;
      const npcAz = MathUtils.radToDeg(Math.atan2(dx, -dz));
      sensorRef.current?.setNpcAzimuth(npcAz);
      // 의도 일치용 "지금 볼 곳": 관객을 볼 차례(lineGaze 큼)면 옆사람, 혼잣말이면 정면, 대사 없으면 미지정
      engagementRef.current?.setIntent(film.lineGaze == null ? null : film.lineGaze > 0.4 ? npcAz : 0);
    } else { sensorRef.current?.setNpcAzimuth(null); engagementRef.current?.setIntent(null); }

    // 질문 뒤 기다리는 동안 — 머리 자세의 폭(끄덕임·가로젓기·돌림)을 잰다. 자동 시선 중엔 held 값이라 응답이 생기지 않는다.
    if (film.listen) {
      let npcAz = null;
      if (actors.npc?.visible && actors.npc.seated) npcAz = MathUtils.radToDeg(Math.atan2(actors.npc.x - state.camera.position.x, -(actors.npc.z - state.camera.position.z)));
      if (!film.watch) film.watch = answerWatchStart(yaw, pitch, npcAz); else answerWatchUpdate(film.watch, yaw, pitch);
    }

    if (film.onFrame) film.onFrame(film.t, actors);
  });

  return null;
}

// 데스크톱 자동 시선 — 헤드셋에서는 관객이 직접 고개를 돌리지만, 화면 데모에서는 아무도 드래그하지 않으면
// 옆사람이 앉은 뒤 카메라가 옆사람 쪽(오른쪽 약 60°)으로 천천히 돌아가고, 버스가 오면 정면으로 돌아온다.
// 드래그하면 8초 동안 손을 뗀다. 자동으로 도는 동안은 "사람에 대한 관심" 측정을 끈다(film.autoGaze).
const AUTO_GAZE_NPC = 1.1, AUTO_GAZE_BUS = 0.22, AUTO_GAZE_PITCH = -0.1; // 63° 오른쪽·약간 아래 — 옆사람이 화면 오른쪽 1/3 에 오고 도로가 남는다 (77° 는 얼굴이 화면을 채웠다)
function DesktopGaze({ controlsRef, actorsRef, filmRef }) {
  const session = useXR((xr) => xr.session);
  const manualUntil = useRef(0);
  const dir = useMemo(() => new Vector3(), []);
  // OrbitControls 는 이 컴포넌트보다 뒤에 마운트되므로(형제, JSX 순서) 마운트 효과에서는 ref 가 비어 있다 —
  // 첫 프레임에 한 번 붙이고, 언마운트 때 뗀다.
  const attached = useRef(null);
  const onStart = useMemo(() => () => { manualUntil.current = performance.now() + 8000; }, []);
  useEffect(() => () => { attached.current?.removeEventListener("start", onStart); attached.current = null; }, [onStart]);
  useFrame((state, dt) => {
    const film = filmRef.current; const c = controlsRef.current;
    if (c && attached.current !== c) { attached.current?.removeEventListener("start", onStart); c.addEventListener("start", onStart); attached.current = c; }
    if (session || !c || !film.running) { film.autoGaze = false; return; }
    const actors = actorsRef.current;
    const tune = (typeof window !== "undefined" && window.__gaze) || {}; // 점검용 덮어쓰기 {npc, bus, pitch} (rad)
    let target = null, targetPitch = 0;
    if (film.busAt != null) target = tune.bus ?? AUTO_GAZE_BUS;
    else if (actors?.npc?.visible && actors.npc.seated) { target = tune.npc ?? AUTO_GAZE_NPC; targetPitch = tune.pitch ?? AUTO_GAZE_PITCH; }
    if (target == null || performance.now() < manualUntil.current) { film.autoGaze = false; film.autoGazeHold = null; return; }
    // 현재 방위(오른쪽 +)·앙각을 카메라→타깃 벡터에서 읽어 목표 방위로 완만히 보간한다
    dir.copy(c.target).sub(state.camera.position);
    const r = dir.length() || 0.01;
    const yaw = Math.atan2(dir.x, -dir.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y / r)));
    if (!film.autoGaze) film.autoGazeHold = { yaw: MathUtils.radToDeg(yaw), pitch: MathUtils.radToDeg(pitch) }; // 센서엔 이 값이 계속 들어간다
    film.autoGaze = true;
    const ny = yaw + (target - yaw) * Math.min(1, dt * 0.9);
    const np = pitch + (targetPitch - pitch) * Math.min(1, dt * 0.9);
    dir.set(Math.sin(ny) * Math.cos(np), Math.sin(np), -Math.cos(ny) * Math.cos(np)).multiplyScalar(r);
    state.camera.position.copy(c.target).sub(dir);
  });
  return null;
}

// XR 세션 여부를 페이지 상태로 올린다 — 헤드셋에서는 도로 반사(장면을 한 번 더 그림)도 꺼서 프레임을 지킨다.
function XRProbe({ onChange }) {
  const session = useXR((xr) => xr.session);
  useEffect(() => { onChange(!!session); }, [session, onChange]);
  return null;
}

// 후처리 — 블룸·비네트·ACES 톤매핑. WebXR 세션 중에는 컴포저가 스테레오 렌더와 충돌하므로 끈다.
function Effects({ enabled }) {
  const session = useXR((xr) => xr.session);
  if (!enabled || session) return null;
  return (
    <EffectComposer disableNormalPass multisampling={0}>
      <Bloom luminanceThreshold={0.92} luminanceSmoothing={0.2} intensity={0.35} mipmapBlur />
      <Vignette eskil={false} offset={0.18} darkness={0.6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

function TrajectoryChart({ trajectory, events }) {
  const W = 660, H = 170, PAD = 8;
  if (!trajectory?.length) return null;
  const tMax = trajectory[trajectory.length - 1].t || 1;
  const x = (t) => PAD + (t / tMax) * (W - PAD * 2);
  const y = (v) => H - PAD - v * (H - PAD * 2);
  const path = (g) => trajectory.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[g]).toFixed(1)}`).join(" ");
  const marks = (events || []).filter((e) => e.kind === "event" && e.name === "event:start");
  // 판정 시각 — 그 뒤로도 배합이 흐른다는 것을 카드의 두 줄(판정 때 · 끝)과 함께 보이게 한다(B86).
  const judge = (events || []).find((e) => e.kind === "event" && e.name === "cue" && e.detail === "judge");
  return (
    <svg className={f.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {judge && (
        <g>
          <line x1={x(judge.t)} x2={x(judge.t)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
          <text x={x(judge.t) + 3} y={H - PAD - 4} fill="rgba(255,255,255,0.7)" fontSize="9">판정</text>
        </g>
      )}
      {marks.map((m, i) => (
        <g key={i}>
          <line x1={x(m.t)} x2={x(m.t)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
          {/* 사건이 초반 1분에 몰려 있어 라벨을 위아래로 번갈아 놓는다 */}
          <text x={x(m.t) + 3} y={PAD + 10 + (i % 3) * 11} fill="rgba(255,255,255,0.45)" fontSize="9">{EVENT_LABEL[m.detail?.name] || m.detail?.name}</text>
        </g>
      ))}
      <path d={path("R")} fill="none" stroke={GENRE_META.R.accent} strokeWidth="2" />
      <path d={path("H")} fill="none" stroke={GENRE_META.H.accent} strokeWidth="2" />
      <path d={path("C")} fill="none" stroke={GENRE_META.C.accent} strokeWidth="2" />
      <path d={trajectory.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.settled).toFixed(1)}`).join(" ")} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeDasharray="4 3" />
    </svg>
  );
}

export default function FilmPage() {
  const q = useQuery();
  const speed = Math.max(0.25, Math.min(6, Number(q.speed) || 1));
  const useCam = q.cam !== "0";
  const showHud = q.hud !== "0";
  const useRig = q.rig !== "0"; // ?rig=0 이면 리깅 캐릭터 대신 캡슐 실루엣
  const usePool = q.pool === "1"; // 대사 풀 모드 (lib/dialoguePool.js)
  const voiceFake = q.voicefake || null; // public/samples/<name>.m4a 를 마이크 대신 쓴다 (점검용)
  // 장면 목표 길이(초). 대사 오디오는 합쳐 1~1.5분이라 "5분 후 도착"을 채우려면 침묵을 늘려야 한다.
  // 침묵은 상태가 정한 값(npcSilence)을 하한으로 두고, 남는 시간을 줄 사이에 고르게 나눈다.
  const sceneTarget = Math.max(0, Number(q.scene) || 0);
  const fx = q.fx !== "0"; // ?fx=0 이면 후처리·도로 반사 끄기 (성능 점검용)
  const forceAnswer = q.answer === "1"; // ?answer=1 — 모든 질문을 "답함"으로 처리 (QA: 데스크톱에선 고개 응답이 생기지 않아 답함 갈래를 들을 수 없다)
  const [xrActive, setXrActive] = useState(false);
  // ?auto=1 — 마운트 직후 자동 시작 (관찰·리허설용. 브라우저 자동재생 정책에 따라 소리가 막힐 수 있다)
  const autoStart = q.auto === "1";
  useEffect(() => { if (autoStart && phase === "gate") { const id = setTimeout(() => start(), 1500); return () => clearTimeout(id); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [autoStart]);
  const useVoice = q.voice === "1" || !!voiceFake;
  const [signText, setSignText] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("off");
  const micRef = useRef(null);
  // ?bias=H (또는 H:1.5) — 시작 시 그 장르 증거를 미리 넣어 배합을 기울인다. 발표·QA용:
  // 같은 장면을 강제 배합으로 비교해 볼 때 쓴다. 실제 관객 세션에서는 쓰지 않는다.
  const bias = useMemo(() => { const [g, w] = String(q.bias || "").split(":"); return ["R", "H", "C"].includes(g) ? { g, w: Number(w) || 1.2 } : null; }, [q.bias]);
  // ?viewer=fearful|curious|calm — 합성 관객(lib/gazeSim.js). 시연·증거용이라 켜져 있으면 화면에 배지를 항상 띄우고 세션에 synthetic 표기를 남긴다.
  const viewerSim = isGazeProfile(q.viewer) ? q.viewer : null;
  const viewerSeed = Math.max(1, Math.floor(Number(q.seed) || 1));
  const viewerSimRef = useRef(null);
  const poolRef = useRef(null);
  useEffect(() => { if (usePool) loadDialoguePool().then((p) => { poolRef.current = p; }); }, [usePool]);

  const [phase, setPhase] = useState("gate"); // gate | intro | scene | bus | end
  const [hud, setHud] = useState(null);
  const [caption, setCaption] = useState("");
  const [line, setLine] = useState(null);
  const [talkStarted, setTalkStarted] = useState(false); // 첫 대사가 떴는가 — 자막이 줄 사이에 지워져도 HUD 접힘은 장면 내내 유지(B118)
  const [dominant, setDominant] = useState(null);
  const [verdict, setVerdict] = useState(null); // 판정 순간의 배합 — 종료 카드의 주 문장(B86)
  const [xrError, setXrError] = useState("");
  const [camStatus, setCamStatus] = useState("off");
  const [askStatus, setAskStatus] = useState(null); // 질문 뒤 기다림·응답 결과 (HUD — 헤드셋 파일럿에서 고개 응답이 잡히는지 보는 용도)

  const directionRef = useRef(null);
  const sensorRef = useRef(null);
  const engagementRef = useRef(null);
  const actorsRef = useRef({});
  const paramsRef = useRef(null);
  const adjustRef = useRef(null);   // 연속 액추에이터 결과(actuationFor) — ReactiveStage 가 매 프레임 읽어 오프셋을 얹는다
  const filmRef = useRef({ running: false, t: 0, dominant: null, npcDistance: 0.9, busAt: null, onFrame: null });
  const controlsRef = useRef(null);
  const audioRef = useRef(new Map());
  const bgmRef = useRef({});
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const abortRef = useRef({ aborted: false });

  function audio(name) {
    let a = audioRef.current.get(name);
    if (!a) {
      a = new Audio(`${AUDIO_BASE}/${name}`);
      a.preload = "auto";
      audioRef.current.set(name, a);
    }
    return a;
  }
  function playSfx(key, { volume = 0.8, loop = false } = {}) {
    const a = audio(`sfx_${key}.mp3`);
    a.loop = loop; a.volume = volume; a.currentTime = 0;
    a.play().catch(() => {});
    // 재생 기록(점검용) — 헤드리스에서는 소리를 들을 수 없으므로 window.__sfxLog 로 볼륨·횟수를 확인한다
    if (typeof window !== "undefined") (window.__sfxLog = window.__sfxLog || []).push({ t: Math.round((filmRef.current?.t || 0) * 100) / 100, key, volume: Math.round(volume * 1000) / 1000, loop });
    return a;
  }
  function playFile(name, volume = 1) {
    return new Promise((resolve) => {
      const a = audio(name);
      a.loop = false; a.volume = volume; a.currentTime = 0;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      a.onended = finish; a.onerror = finish;
      a.play().catch(finish);
      setTimeout(finish, 15000);
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // BGM 3트랙 — 항상 재생, 게인만 상태를 따른다
  function ensureBgm() {
    for (const g of ["H", "R", "C"]) {
      if (!bgmRef.current[g]) {
        const a = new Audio(`${AUDIO_BASE}/bgm_${g}.wav`);
        a.loop = true; a.volume = 0;
        bgmRef.current[g] = a;
      }
      bgmRef.current[g].play().catch(() => {});
    }
  }
  function stopBgm() { for (const a of Object.values(bgmRef.current)) { a.pause(); } }

  // HUD 갱신 + BGM 게인 — 250ms마다
  useEffect(() => {
    if (phase === "gate") return;
    const id = setInterval(() => {
      const d = directionRef.current;
      if (!d) return;
      const snap = d.snapshot();
      const gains = deriveBgmGains(snap.current, snap.settled);
      const bgmMul = bgmScale(adjustRef.current?.offsets); // 연속 액추에이터의 BGM 배율(직전 틱 값, 제어 OFF 면 1)
      for (const g of ["H", "R", "C"]) { const a = bgmRef.current[g]; if (a) a.volume += (Math.min(1, gains[g] * bgmMul) - a.volume) * 0.35; }
      const film = filmRef.current;
      // 착석 뒤 옆사람의 거리는 상태가 정한다 (요청서 v5.0 §2.7: 0.5~1.4m)
      film.npcDistance = paramsRef.current?.npcDistance ?? 0.9;

      // 판정 뒤 장면(착석~150초) — 연속 구동·미세 자극이 도는 구간. 모니터는 여기서 x̂ 의 측정 범위를 밝힌다(B149)
      const inScene = !!film.dominant && film.t >= T.npcSeated && film.t <= 150;

      // 디렉터 모니터 — 관객모델 θ̂·긴장 추정 x̂·목표 곡선·다음 개입 안내 (표시만 한다. 실제 구동은 아래 ?control=1 블록)
      if (q.monitor === "1") {
        const eng = engagementRef.current?.data?.();
        // 판정 전에는 선두 장르 하나가 아니라 지금 배합으로 가중한 기대 곡선을 목표로 한다(B92) — 확신 0.04 짜리 선두가
        // 바뀔 때마다 모니터 트랙이 R↔H 로 깜빡이고, 개구리·고양이가 서로 다른 장르 곡선으로 정해지던 문제. 판정 뒤에는 그 장르.
        const track = controlTrack({ forced: q.track, verdict: film.dominant, mix: snap.current });
        if (eng) {
          const theta = fitViewerModel(eng.stimuli);
          // 센서 시각은 실제 경과 초, 모니터의 목표 곡선·현재 시각은 영화 시간 — 배속이면 환산해 겹친다
          const series = estimateTensionSeries(eng).map((p) => (speed === 1 ? p : { ...p, t: Math.round(p.t * speed * 10) / 10 }));
          const last = series[series.length - 1];
          const tgt = curveAt(track, film.t);
          const rec = runController(track, theta, { fixed: PROBE_DOSE }); // 도입부 탐침은 중립 — 변형을 적지 않는다(B85)
          // 이미 확정된 슬롯(개구리·고양이, B78)은 계획 대신 실제로 고른 변형을 보인다 — 계획은 틱마다 다시 세워져 확정값과 어긋날 수 있다
          const confirmedEntries = rec.entries.map((e) => { const c = film.slotChoice?.[e.slotId]; return c ? { ...e, variantId: c.variantId ?? "중립", dose: c.dose, reason: `확정 · ${c.reason}`, confirmed: true } : e; });
          // 아직 정하지 않은 제어 슬롯은 계획 대신 "지금 정하면" 미리보기(B106) — decideSlotNow 와 같은 입력(그 순간의 θ̂·x̂)으로 같은
          // 함수(decideSlot)가 고르므로 결정 순간에 "mid 라더니 playful" 로 뒤집히지 않는다. 계획(rec.entries)은 세션 plan 에만 남는다.
          const entries = previewSlotEntries(confirmedEntries, { track, theta: eng.stimuli.length ? theta : null, xhat: last?.tension ?? null });
          // 다음 개입 — 남은 고정 슬롯이 없으면(고양이 0:45 뒤) 미세 자극의 발동 조건·대기 사유를 보인다(B66)
          // 대사 중(B118 dialogueQuiet)이면 조건이 맞아도 울리지 않으므로 "발동 조건 충족" 대신 미루는 사유를 적는다(B138).
          // x̂ 가 사건 사이 바닥값이면(B149) "처졌다" 가 아니라 "사건 사이" 로 적는다
          const next = nextAdvice({ entries, tNow: film.t, verdict: !!film.dominant, xhat: last?.tension ?? null, target: tgt.target, tol: tgt.tol, ceiling: tgt.ceiling,
            lastMicroAt: film.lastMicroAt ?? -Infinity, microCount: film.microCount || 0, controlOn: q.control === "1", sceneStart: T.npcSeated, sceneEnd: 150,
            quiet: quietState(film, film.t), observed: last ? isObserved(last) : true });
          const sel = theta.nResp >= 1 ? selectTrack(theta, { genrePrior: snap.current, priorWeight: 0.3 }) : null;
          setMonitor({ track, theta, xhat: last?.tension ?? null, target: tgt.target, tol: tgt.tol, ceiling: tgt.ceiling, series, next, nStim: eng.stimuli.length, sel, scene: inScene, control: q.control === "1", micro: film.microCount || 0, actuate: adjustRef.current ? { ...adjustRef.current, base: actBase(snap) } : null, slots: film.slotChoice || null });
        }
      }
      // 실제 제어(?control=1) — 판정 뒤 장면에서만. 도입부 다섯 사건은 관객을 공정히 읽기 위한
      // 중립 탐침이라 건드리지 않는다(용량을 바꾸면 그 사건이 만드는 θ 추정이 오염된다). 판정 뒤에는
      // 장르가 정해졌으니 두 손으로 관객 긴장 x̂ 을 작가 곡선 쪽으로 몬다:
      //   (1) 연속 액추에이터(lib/controlActuate.js) — 침묵·BGM·가로등·안개·거리·시선을 양방향으로 은은하게.
      //       결과는 adjustRef 에 두고 ReactiveStage 가 매 프레임 deriveParams 값 위에 얹는다(대사 간격 gapSec
      //       와 옆사람 거리는 paramsRef 를 읽으므로 따라온다). 제어 OFF 면 오프셋 0(항등).
      //   (2) 미세 자극(slotController.microDecision) — 곡선 아래로 처지면 먼 기척 소리를 한 번(3회 한도).
      // 기록: 2초(영화 시간)마다 control:actuate 이벤트 — 제어 OFF 세션에도 남겨 ON/OFF 궤적을 비교할 수 있게.
      const controlOn = q.control === "1";
      if (inScene) {
        const eng = engagementRef.current?.data?.();
        const theta = eng && eng.stimuli.length ? fitViewerModel(eng.stimuli) : null;
        const series = eng && eng.stimuli.length ? estimateTensionSeries(eng) : [];
        const xhat = series.length ? series[series.length - 1].tension : null;
        const tgt = curveAt(film.dominant, film.t);
        const prev = adjustRef.current;
        const dtFilm = prev ? Math.max(0, Math.min(2, film.t - prev.t)) : 0.25 * speed;
        // 미세 자극 뒤 HOLD_AFTER_MICRO 초는 연속 손을 멈춘다(B75) — ?hold=0 이면 창 없음(B75 이전과 비교용)
        const holdQ = q.hold ? Number(q.hold) : NaN;
        const actParams = Number.isFinite(holdQ) ? { ...ACTUATE_PARAMS, HOLD_AFTER_MICRO: Math.max(0, holdQ) } : ACTUATE_PARAMS;
        const act = actuationFor({ xhat, target: tgt.target, tol: tgt.tol, ceiling: tgt.ceiling, track: film.dominant, theta, prev, dt: dtFilm, active: controlOn, tNow: film.t, lastMicroAt: film.lastMicroAt }, actParams);
        adjustRef.current = { ...act, t: film.t, xhat, target: tgt.target };
        if (film.lastActuateLogAt == null || film.t - film.lastActuateLogAt >= 2) {
          const p = paramsRef.current || {};
          const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
          d.markEvent("control:actuate", {
            t: Math.round(film.t * 10) / 10, active: controlOn, mode: act.mode, u: act.u, uTarget: act.uTarget, err: act.err, gScale: act.gScale,
            ...(act.mode === "settle" ? { settleLeft: act.settleLeft } : {}),
            xhat: r3(xhat), target: r3(tgt.target), offsets: act.offsets, bgm: r3(bgmScale(act.offsets)),
            applied: { npcSilence: r3(p.npcSilence), lampOn: r3(p.lampOn), fogDensity: r3(p.fogDensity), npcDistance: r3(p.npcDistance), npcGaze: r3(p.npcGaze) },
            // 실제로 움직인 양(B116) — 오프셋 중 범위·트리거에 잘리지 않고 무대에 닿은 몫. 포화 축(공포 트랙 가로등)은 0
            delta: Object.fromEntries(actuationEffect(actBase(snap), act.offsets).map((e) => [e.key, e.delta])),
          });
          film.lastActuateLogAt = film.t; film.actuateLogCount = (film.actuateLogCount || 0) + 1;
        }
        // 대사를 밟지 않는다(B118, lib/dialogueBeats.js dialogueQuiet) — 옆사람이 말하거나 질문 뒤 기다리는 동안, 자막이 남아 있는
        // 동안, 다음 줄까지 3초가 안 남은 틈에는 미세 자극을 미룬다. 1차 완주에서 질문 03 기다림 중(92.4s)에 울려 합성 관객이
        // −50° 로 돌아섰고(자막 6.5초 중 45% 화자 화면 밖), 기다림 창의 고개 폭(answerWatch)도 그 회전이 오염시켰다.
        if (controlOn && eng && eng.stimuli.length && dialogueQuiet(film, film.t)) {
          const { fire, dose } = microDecision({ xhat, target: tgt.target, tol: tgt.tol, tNow: film.t, lastAt: film.lastMicroAt ?? -Infinity, count: film.microCount || 0 });
          if (fire) {
            playSfx("13", { volume: 0.12 + 0.22 * dose }); // 먼 기척(클래터) — 은은하게
            engagementRef.current?.beginStimulus({ name: `micro-${(film.microCount || 0) + 1}`, azimuth: -60, dur: 1.5 / speed, kind: "probe", channel: "audio", dose, tail: 3 / speed });
            viewerSimRef.current?.trigger({ name: `micro-${(film.microCount || 0) + 1}`, azimuth: -60, dur: 1.5 / speed, kind: "probe", channel: "audio" });
            d.markEvent("control:micro", { t: Math.round(film.t * 10) / 10, xhat, target: tgt.target, dose });
            film.lastMicroAt = film.t; film.microCount = (film.microCount || 0) + 1;
          }
        }
      } else if (adjustRef.current && adjustRef.current.u !== 0) {
        // 장면 밖(150초 뒤 버스 도착 구간) — 구동량을 서서히 0 으로 되돌린다
        adjustRef.current = { ...actuationFor({ xhat: null, target: 0, tol: 0, track: film.dominant, prev: adjustRef.current, dt: 0.25 * speed, active: true }), t: film.t };
      }

      setHud({ ...snap, t: film.t, params: paramsRef.current, lastEvidence: d.st.lastEvidence, camStatus, events: sensorRef.current?.report?.().events || [] });
    }, 250);
    return () => clearInterval(id);
  }, [phase, camStatus]);

  // 웹캠 채널 — 8초 창을 반복. 얼굴이 대부분 안 잡히면(헤드셋 착용 등) 그 창은 버린다.
  async function camLoop() {
    const video = videoRef.current;
    const token = abortRef.current; // 이 회차의 중단 토큰 — reset 뒤 새 회차가 시작돼도 옛 루프는 여기서 멈춘다
    while (!token.aborted && video && directionRef.current) {
      const obs = await observe(video, CAM_WINDOW_MS, null);
      if (token.aborted) break;
      if (!obs.ok) { setCamStatus("model-fail"); break; }
      const m = obs.metrics;
      if ((m.lostTrackingSec || 0) > (CAM_WINDOW_MS / 1000) * 0.6) { setCamStatus("no-face"); continue; }
      setCamStatus("on");
      const r = judgeFromBehavior(m);
      directionRef.current.pushEvidence(r.scores, 0.5, "webcam", r.reason);
    }
  }

  async function start() {
    abortRef.current = { aborted: false };
    const d = createDirectionState({ followRate: 0.6, decayHalfLifeSec: 150, settleMass: 2.5 });
    directionRef.current = d;
    sensorRef.current = createHeadPoseSensor({ push: d.pushEvidence, mark: d.markEvent });
    engagementRef.current = createEngagementSensor({ mark: d.markEvent });
    viewerSimRef.current = viewerSim ? createGazeSim(viewerSim, { seed: viewerSeed, speed }) : null; // 합성 관객은 영화 시간을 산다(배속이면 반응도 압축)
    if (viewerSimRef.current) d.markEvent("viewer:synthetic", { profile: viewerSim, seed: viewerSeed });
    paramsRef.current = null;
    adjustRef.current = null;
    filmRef.current = { running: true, t: 0, dominant: null, npcDistance: 0.9, busAt: null, onFrame: null, lastMicroAt: -999, microCount: 0, lastActuateLogAt: null, actuateLogCount: 0, slotChoice: {}, talking: false, talkLook: q.talk !== "0", lookAhead: false, lookUntil: -1, quietUntil: Infinity, subSeq: null, subFrom: 0, subGen: 0 };
    if (typeof window !== "undefined") window.__sfxLog = [];
    setDominant(null); setVerdict(null); setLine(null); setTalkStarted(false); setCaption(""); setAskStatus(null);
    if (bias) d.pushEvidence({ [bias.g]: 1 }, bias.w, "bias", `?bias=${bias.g}`);
    d.setPhase("intro");
    setPhase("intro");
    ensureBgm();

    setSignText("");
    if (useVoice && !voiceFake) {
      try {
        micRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setVoiceStatus("ready");
      } catch { setVoiceStatus("denied"); }
    } else if (voiceFake) setVoiceStatus("fake");

    if (useCam) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setCamStatus("starting");
        camLoop();
      } catch { setCamStatus("denied"); }
    }
  }

  // 슬롯 변형 결정(B78) — 개구리·고양이 슬롯을 지금 시점의 θ̂(앞 탐침 응답)·x̂·잠정 우세 장르로 정한다. 한 번 정하면 바꾸지 않는다.
  // 제어 OFF 면 고정 연출(볼륨 0.8 한 번, 기본 동선)로 정해져 지금까지의 /film 과 같다. 세션에는 control:slot 이벤트로 남는다.
  function decideSlotNow(slotId) {
    const d = directionRef.current;
    const film = filmRef.current;
    if (!d || !film.running) return null;
    if (film.slotChoice?.[slotId]) return film.slotChoice[slotId];
    const controlOn = q.control === "1";
    const eng = engagementRef.current?.data?.();
    const theta = eng && eng.stimuli.length ? fitViewerModel(eng.stimuli) : null;
    const series = eng && eng.stimuli.length ? estimateTensionSeries(eng) : [];
    const xhat = series.length ? series[series.length - 1].tension : null;
    const snap = d.snapshot();
    // 개구리(0:36.5)·고양이(0:42)는 판정(0:58) 전이라 배합 가중 기대 곡선으로 정한다(B92, 모니터와 같은 controlTrack).
    // 세션에는 track "mix" + 그때 배합(mix)으로 남긴다 — ?track= 강제나 판정 뒤 결정이면 장르 글자 그대로.
    const trk = controlTrack({ forced: q.track, verdict: film.dominant, mix: snap.current });
    const track = isMixTrack(trk) ? "mix" : trk;
    const mix = isMixTrack(trk) ? trk : null;
    const choice = { ...decideSlot({ slotId, controlOn, track: trk, theta, xhat }), t: Math.round(film.t * 10) / 10, track, mix };
    film.slotChoice = { ...(film.slotChoice || {}), [slotId]: choice };
    const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
    d.markEvent("control:slot", {
      t: choice.t, active: controlOn, slotId, variantId: choice.variantId, dose: choice.dose, reason: choice.reason, track, mix,
      xhat: r3(xhat), target: r3(choice.target), predTension: r3(choice.predTension), theta: theta ? { g: theta.g, rho: theta.rho, nResp: theta.nResp, n: theta.n } : null,
      actuation: { sfx: choice.actuation.sfx, volume: choice.actuation.volume, plays: choice.actuation.plays, gap: choice.actuation.gap }, schedule: choice.schedule || null,
    });
    return choice;
  }

  function onCue(cue) {
    const d = directionRef.current;
    const film = filmRef.current;
    if (!d) return;
    // 제어 슬롯(개구리·고양이)은 정해진 변형의 볼륨·반복·동선을 쓴다. 결정이 아직 없으면(배속이 커서 틱을 건너뛴 경우) 지금 정한다.
    const choice = CONTROLLED_SLOTS.includes(cue.name) ? (film.slotChoice?.[cue.name] || decideSlotNow(cue.name)) : null;
    const act = choice?.actuation || null;
    const volume = act ? act.volume : (cue.volume ?? 0.8);
    const dose = choice ? choice.dose : (cue.volume ?? null);
    const senseDur = cue.sense ? (choice?.schedule ? Math.max(0.5, choice.schedule.catGone - cue.t) : cue.sense.dur) : 0;
    if (cue.sfx) {
      playSfx(cue.sfx, { volume, loop: !!cue.loop });
      // 반복 변형(개구리 twice) — 간격은 영화 초, 실제 초로 환산. 체험이 끝났으면 울리지 않는다.
      for (let i = 1; i < (act?.plays || 1); i++) setTimeout(() => { if (film.running) playSfx(cue.sfx, { volume }); }, (act.gap * i / speed) * 1000);
    }
    if (cue.slot) playFile(`${cue.slot}.mp3`, cue.volume ?? 1);
    if (cue.sense) {
      sensorRef.current?.beginEvent(cue.name, cue.sense.azimuth, senseDur / speed, { kind: cue.sense.kind, tail: 4 / speed });
      // 탐침 반응 기록 — 채널·용량은 잠정(오디오 큐는 소리, 그 밖은 시청각). 제어 슬롯은 변형의 설계 용량을 그대로 적어 θ̂ 회귀가 이득을 바로 읽게 한다.
      engagementRef.current?.beginStimulus({ name: cue.name, azimuth: cue.sense.azimuth, dur: senseDur / speed, kind: cue.sense.kind, channel: cue.sfx ? "audio" : "av", dose, tail: 4 / speed });
      // 합성 관객도 같은 사건을 듣는다 — 방위·종류로 반응한다(채널은 기록용). 제어 슬롯은 용량 배율(gazeSim doseFactor)도 받는다.
      viewerSimRef.current?.trigger({ name: cue.name, azimuth: cue.sense.azimuth, dur: senseDur / speed, kind: cue.sense.kind, channel: cue.sfx ? "audio" : "av", dose: choice ? dose : null });
    }
    d.markEvent("cue", cue.name);

    if (cue.name === "judge") {
      // 이산 결정 하나 — 누가 앉는가. 그 뒤로도 상태는 계속 흐른다.
      const { dominant: dom } = rank(d.st.current);
      film.dominant = dom;
      // 판정 때 배합을 따로 남긴다 — 판정 뒤에도 증거는 쌓여 끝 배합은 다른 장르가 앞설 수 있다(B86).
      film.verdict = { dominant: dom, mix: { ...d.st.current }, t: Math.round(film.t * 10) / 10, confidence: d.st.confidence };
      setDominant(dom);
      setVerdict(film.verdict);
      d.setPhase("judged");
      setCaption("");
    }
    if (cue.name === "announce") {
      setCaption("272번 버스는 5분 후 도착 예정입니다");
      if (useVoice) setTimeout(() => runVoiceFlow(), 3200);
    }
    if (cue.name === "npcWalk") {
      setCaption("");
      if (film.dominant === "C") { playSfx("15", { volume: 0.6 }); }
      if (film.dominant === "R") { playSfx("04", { volume: 0.5 }); }
      if (film.dominant === "H") { playSfx("06", { volume: 0.35 }); }
    }
    if (cue.name === "npcSeated") { playSfx(film.dominant === "C" ? "16" : "05", { volume: 0.6 }); }
    if (cue.name === "scene") { d.setPhase("scene"); setPhase("scene"); runScene(); }
  }

  // ---- 음성 채널 ----
  function recordFor(ms) {
    return new Promise((resolve) => {
      const track = micRef.current?.getAudioTracks?.()[0];
      if (!track) return resolve(null);
      try {
        const rec = new MediaRecorder(new MediaStream([track]));
        const chunks = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
        rec.start();
        setTimeout(() => rec.stop(), ms);
      } catch { resolve(null); }
    });
  }
  async function captureAnswer(ms) {
    if (voiceFake) {
      try { return await (await fetch(`/samples/${encodeURIComponent(voiceFake)}.m4a`)).blob(); } catch { return null; }
    }
    return recordFor(ms);
  }
  async function scoreBlob(blob) {
    if (!blob) return { textScores: null, voiceScores: null, transcript: "", noun: "" };
    const [mood, prosody] = await Promise.all([
      (async () => {
        try {
          const form = new FormData();
          form.append("audio", blob, voiceFake ? "clip.m4a" : "clip.webm");
          const res = await fetch("/api/mood", { method: "POST", body: form });
          const data = await res.json();
          return data?.ok ? data : null;
        } catch { return null; }
      })(),
      analyzeProsody(blob).catch(() => null),
    ]);
    return { textScores: scoresFromMoodApi(mood?.scores), voiceScores: prosody?.scores || null, transcript: mood?.transcript || "", noun: mood?.noun || "" };
  }
  // 안내방송 뒤: Q1 → 답변(5초) → 애매하면 되묻기 1회 → 텍스트 0.9·톤 0.5 무게로 증거 → 표지판.
  // 타임라인과 나란히 돈다 — 옆사람이 걸어오는 동안 세계가 묻고, 관객이 답하면 앉은 뒤의 장면이 그 답을 반영한다.
  async function runVoiceFlow() {
    const d = directionRef.current;
    const token = abortRef.current;
    if (!d || token.aborted) return;
    setVoiceStatus("asking");
    await playFile("vo_q1.mp3", 1);
    setVoiceStatus("listening");
    let out = await scoreBlob(await captureAnswer(5000));
    if (!out.textScores && !token.aborted) {
      setVoiceStatus("reprompt");
      await playFile("vo_filler1.mp3", 0.9);
      await playFile("sfx_inhale.mp3", 0.8);
      await playFile("vo_reprompt.mp3", 1);
      setVoiceStatus("listening");
      out = await scoreBlob(await captureAnswer(4000));
    }
    if (token.aborted) return;
    if (out.textScores) d.pushEvidence(out.textScores, 0.9, "voice:text", out.transcript.slice(0, 40));
    if (out.voiceScores) d.pushEvidence(out.voiceScores, 0.5, "voice:tone");
    if (out.noun) { setSignText(`${out.noun} 앞`); d.markEvent("sign", out.noun); }
    d.markEvent("voice", { transcript: out.transcript, noun: out.noun });
    setVoiceStatus(out.textScores ? "done" : "silent");
  }

  // 캐릭터 장면 — 대사는 CSV 순서 그대로 튼다. 줄마다 붙은 비트(lib/dialogueBeats.js)가 누구에게 말하는지·앞뒤 쉼·
  // 질문 뒤 기다림·"답함/안답함" 갈래를 정한다. 관객의 답은 고개(끄덕임·가로젓기·돌림)로만 받는다 — 마이크 없음.
  // 마지막 말(atBus)은 272 가 정차하고 문이 열린 뒤에 한다.
  async function runScene() {
    const d = directionRef.current;
    const film = filmRef.current;
    const token = abortRef.current;
    const dom = film.dominant || "R";
    const base = DIALOGUE_V2_LINES.filter((l) => l.genre === dom);
    let insertedCallback = false;

    const pool = usePool ? poolRef.current : null;
    const poolOk = !!pool?.ok && poolCoverage(pool, dom).base === base.length;
    // ?scene= 목표 길이: (목표 − 대사 오디오 추정 합 − 비트 쉼 합) / 줄 수 만큼을 각 줄 뒤 침묵에 더한다.
    const extraGap = sceneTarget > 0 ? Math.max(0, (sceneTarget - base.length * 3.5 - beatsTotalSec(base)) / base.length) : 0;
    const gapSec = (p) => Math.max(p?.npcSilence ?? 1.2, 0) + extraGap;
    const sec = (s) => wait((s * 1000) / speed);
    // 영화 시간 기준 대기 — 버스 안무(filmTimeline)는 film.t 를 따르므로, fps 가 낮아 film.t 가 벽시계보다 느리게 갈 때도 어긋나지 않게
    const waitFilm = async (s) => { const t0 = film.t; while (!token.aborted && film.t - t0 < s) await wait(40); };
    const total = playedCount(base);
    let answered = false, played = 0, busStarted = false;
    // 말하는 구간(B67) — 줄 재생 시작부터 재생 끝(질문이면 기다림 끝)까지. 합성 관객은 이 동안 화자를 보고(FilmDirector),
    // 세션에는 구간마다 "talk" 이벤트(from = 시작 영화 초, t = 끝)를 남겨 화자가 화면에 들어왔는지 raw 자세로 따질 수 있게 한다.
    const talkBegin = (seq) => { film.talking = true; film.lookAhead = false; film.quietUntil = film.t; film.talkFrom = film.t; film.talkSeq = seq; };
    const talkEnd = () => { if (!film.talking) return; film.talking = false; d.markEvent("talk", { seq: film.talkSeq, from: Math.round(film.talkFrom * 10) / 10 }); };
    // 자막 창(B118) — 줄이 뜨면 subOn, 말이 끝나면(talkEnd 뒤) subHold 가 읽을 시간(subtitleHoldSec)만큼 두었다가 지운다.
    // 그 사이 다음 줄이 뜨면 새 줄이 덮고 예약은 무효(subGen). 합성 관객은 자막이 지워질 때(lookUntil)까지 화자를 계속 본다.
    // 지울 때 "sub" 이벤트(from = 뜬 영화 초, t = 지운 시각)를 남겨 자막이 떠 있는 동안 화자가 화면 안이었는지 raw 자세로 센다.
    const subMark = () => { if (film.subSeq == null) return; d.markEvent("sub", { seq: film.subSeq, from: Math.round(film.subFrom * 10) / 10 }); film.subSeq = null; };
    const subOn = (obj, seq) => { subMark(); film.subGen++; film.subSeq = seq; film.subFrom = film.t; setLine(obj); setTalkStarted(true); };
    const subOff = () => { subMark(); setLine(null); };
    const subHold = (text) => {
      const hold = subtitleHoldSec(text, film.t - film.subFrom);
      const gen = film.subGen;
      film.lookUntil = film.t + hold;
      waitFilm(hold).then(() => { if (!token.aborted && film.subGen === gen && film.subSeq != null) subOff(); });
    };
    // 줄 앞 기다림 — 끝의 lookLead 초는 화자 쪽을 보며 기다린다(돌아보는 데 걸리는 시간만큼 먼저). 기다림 길이는 그대로다.
    const waitThenLook = async (s) => { const [rest, lead] = splitLead(s); if (rest > 0) await sec(rest); if (token.aborted) return; film.lookAhead = true; if (lead > 0) await sec(lead); };
    // 지난 질문의 응답 표기는 다음 줄이 시작되면 흐리게 둔다 — "질문 10 · 응답 없음" 이 끝까지 선명하게 남던 문제 (B110)
    const staleAsk = () => setAskStatus((a) => (a && !a.listening ? { ...a, stale: true } : a));

    // 272 도착 — 버스가 커브를 돌아 들어와 정면(앞문 x≈1.2)에 서기까지 7.2초, 그 다음 문
    // lead: 도착 뒤 바로 마지막 말이 이어지면 문이 열리기 lookLead 초 전부터 화자 쪽을 본다(B118)
    const arriveBus = async (lead = false) => {
      busStarted = true;
      film.lineGaze = null;
      film.busAt = film.t;
      d.setPhase("bus");
      setPhase("bus");
      setAskStatus(null); // 질문 표기는 버스 장면부터 지운다 (B110)
      playSfx("07", { volume: 0.7 });
      setCaption("272");
      const [busRest, busLead] = lead ? splitLead(7.2) : [7.2, 0];
      await waitFilm(busRest); if (token.aborted) return;
      if (busLead > 0) { film.lookAhead = true; await waitFilm(busLead); if (token.aborted) return; }
      playSfx("08", { volume: 0.5 }); setCaption("");
    };

    // 첫 줄 앞 — 조용한 시간은 첫 줄의 before 에서 lookLead 를 뺀 만큼(dialogueQuiet · 미세 자극은 그 안에서만)
    film.quietUntil = film.t + silenceAfter(null, nextPlayedBeat(base, -1, answered), 0);
    for (let i = 0; i < base.length; i++) {
      if (token.aborted) return;
      const l = base[i];
      const b = beatOf(l);
      if (!playsLine(b, answered)) { d.markEvent("skip", { seq: l.seq, branch: b.branch }); continue; } // 갈래 중 하나만
      if (b.atBus) { await arriveBus(!b.before); if (token.aborted) return; }
      if (b.before) await waitThenLook(b.before);
      if (token.aborted) return;
      const p = paramsRef.current || {};
      const { secondary, secondaryWeight } = rank(d.st.current);

      // 보조 장르 콜백 — 비중이 임계값을 넘는 순간 한 번, 그 장르의 첫 줄을 끼워 넣는다 (마지막 말 앞에는 넣지 않는다)
      if (!insertedCallback && i >= 2 && !b.atBus && secondary !== dom && secondaryWeight >= TRIGGERS.secondaryCallback.above) {
        const cb = DIALOGUE_V2_LINES.find((x) => x.genre === secondary && x.seq === "01");
        if (cb) {
          insertedCallback = true;
          d.markEvent("callback", { genre: secondary, weight: secondaryWeight });
          film.lineGaze = 0.5;
          // 콜백은 줄 수(total)에 들어가지 않는다 — 진행 막대는 직전 줄에 머물고 자막 줄에는 번호 대신 "배합 콜백" 만 적는다 (B91)
          staleAsk();
          subOn({ ...cb, flavor: true, index: Math.max(0, played - 1), total }, `${cb.genre}-${cb.seq}`);
          talkBegin(`${cb.genre}-${cb.seq}`);
          await playFile(cb.file, Math.min(1, (p.npcVolume ?? 1) * 0.9));
          talkEnd();
          subHold(cb.text);
          film.quietUntil = film.t + silenceAfter(null, {}, gapSec(p));
          await waitThenLook(gapSec(p)); // 콜백 바로 뒤에 이 줄이 온다
        }
      }

      // 이 줄 — 풀 모드면 재생 직전 상태로 원문/보조 장르 변주를 고른다 (근접 매칭)
      let text = l.text, file = l.file, tinted = null;
      if (poolOk) {
        const pick = pickPoolLine(pool, dom, l.seq, d.st.current);
        if (pick) {
          text = pick.text; file = pick.file.replace(`${AUDIO_BASE}/`, ""); tinted = pick.secondary;
          d.markEvent("line", { seq: l.seq, secondary: pick.secondary, weight: Math.round(pick.weight * 100) / 100 });
        }
      }
      film.lineGaze = gazeFor(b);
      staleAsk();
      subOn({ ...l, text, tinted, to: b.to, index: played, total }, l.seq);
      played++;
      talkBegin(l.seq);
      await playFile(file, Math.min(1, (p.npcVolume ?? 1) * (b.vol ?? 1)));
      if (token.aborted) return;

      if (b.to === "ask") {
        // 관객을 보며 기다린다 — FilmDirector 가 이 동안 머리 자세 폭을 잰다
        film.watch = null; film.listen = true;
        setAskStatus({ seq: l.seq, listening: true });
        await sec(b.wait ?? 2.5);
        const r = answerWatchResult(film.watch);
        film.listen = false; film.watch = null;
        answered = forceAnswer || r.answered;
        const how = forceAnswer ? "forced" : r.how;
        setAskStatus({ seq: l.seq, listening: false, answered, how });
        d.markEvent("ask", { seq: l.seq, answered, how });
      }
      talkEnd(); // 질문이면 기다림까지 — 기다리는 동안 시선을 돌려 버리면 그 회전이 가로젓기로 읽힐 수 있다
      subHold(text);
      const nb = nextPlayedBeat(base, i, answered);
      const gap = gapSec(paramsRef.current);
      film.quietUntil = film.t + silenceAfter(b, nb, gap);
      if (b.after) await sec(b.after);
      if (!b.atBus) {
        // 다음 줄이 앞 쉼(before) 없이 바로 오면 이 침묵의 끝에서 화자 쪽으로 먼저 돈다. 앞 쉼이 있거나 버스 장면이면 그쪽에서 돈다.
        if (nb && !nb.atBus && !nb.before) await waitThenLook(gap);
        else await sec(gap);
      }
    }
    film.quietUntil = Infinity;
    if (token.aborted) return;
    if (!busStarted) await arriveBus();
    if (token.aborted) return;
    film.lineGaze = null;
    // 마지막 말이 끝난 뒤 → 버스 출발(기본 busAt+16, 말이 더 길었으면 1초 뒤) → 암전(출발 +3~+7). 인물 퇴장은 busAt+8 부터 (filmTimeline)
    film.leaveAt = Math.max(film.t + 1.0, film.busAt + 16);
    // 마지막 자막("먼저 가세요." 는 오디오가 1초)도 다른 줄처럼 읽을 시간(subHold, 최소 0.7초)만큼 남았다가 지워진다(B118) —
    // B91 의 "13 / 13줄" 이 한 프레임도 안 보이던 문제는 이것으로 막힌다. 버스가 떠날 때까지 두면(8.8초) 그동안 화자는 일어나
    // 떠나고(공포 트랙은 벤치 뒤 풀숲으로 나가 화면 밖), 합성 관객은 버스 쪽을 본다(B21 녹화에서 이 자막 동안 화자 화면 안 0%).
    // 혹시 남아 있으면 출발 때 지운다.
    await waitFilm(Math.max(0, film.leaveAt - film.t));
    if (token.aborted) return;
    subOff();
    await waitFilm(Math.max(2, film.leaveAt + 7.2 - film.t));
    if (token.aborted) return;
    d.setPhase("end");
    setPhase("end");
    film.running = false;
    stopBgm();
    audioRef.current.get("sfx_01.mp3")?.pause();
  }

  async function enterVr() {
    setXrError("");
    try {
      await xrStore.enterVR();
    } catch { setXrError("VR 진입에 실패했습니다 — 헤드셋 연결과 브라우저의 WebXR 지원을 확인해 주세요."); }
  }

  function reset() {
    abortRef.current.aborted = true;
    filmRef.current.running = false;
    stopBgm();
    for (const a of audioRef.current.values()) { a.pause(); }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    setPhase("gate"); setHud(null); setLine(null); setTalkStarted(false); setCaption(""); setDominant(null); setVerdict(null); setCamStatus("off");
  }

  function sessionData(extra = {}) {
    const d = directionRef.current;
    if (!d) return null;
    // 궤적 추종 로그 — 관객모델 θ̂와 제어기의 사후 계획(plan: 종료 시점 θ̂ 로 다시 세운 참고값 — 도입부 탐침은 neutral·variantId null, B85), 실제 구동 요약.
    // 실제로 움직인 것은 ?control=1 일 때의 슬롯 변형(slots · control:slot 이벤트, B78)·미세 자극(control:micro)·연속 파라미터(control:actuate 이벤트).
    let control;
    try {
      const eng = engagementRef.current?.data?.();
      if (eng && eng.stimuli.length) {
        const track = (q.track || filmRef.current.dominant || "H").toUpperCase();
        const theta = fitViewerModel(eng.stimuli);
        const a = adjustRef.current;
        const slots = {};
        for (const [id, c] of Object.entries(filmRef.current.slotChoice || {})) slots[id] = { t: c.t, track: c.track, mix: c.mix ?? null, variantId: c.variantId, dose: c.dose, reason: c.reason, target: c.target ?? null, predTension: c.predTension ?? null, actuation: { sfx: c.actuation.sfx, volume: c.actuation.volume, plays: c.actuation.plays, gap: c.actuation.gap }, schedule: c.schedule || null };
        // 장면 구간 추종 요약(B149) — 목표 허용폭 안 창을 전체·관측(사건 반응이 있는 창)으로 나눠 센다. 센서 시각은 실제 초라 배속이면 영화 초로 환산
        const dom = filmRef.current.dominant;
        const tracking = dom ? { track: dom, t0: T.npcSeated, t1: 150, eps: OBS_EPS,
          ...trackingStats(estimateTensionSeries(eng).map((p) => ({ ...p, t: p.t * speed })), (t) => curveAt(dom, t), { t0: T.npcSeated, t1: 150 }) } : null;
        control = { track, theta, mode: q.control === "1" ? "full" : "off", plan: runController(track, theta, { fixed: PROBE_DOSE }).entries, slots, tracking,
          actuation: { on: q.control === "1", holdAfterMicro: q.hold ? Math.max(0, Number(q.hold) || 0) : ACTUATE_PARAMS.HOLD_AFTER_MICRO, ticks: filmRef.current.actuateLogCount || 0, micro: filmRef.current.microCount || 0, last: a ? { t: a.t, u: a.u, mode: a.mode, offsets: a.offsets } : null } };
      }
    } catch { /* 로그 실패는 무시 */ }
    const vs = viewerSimRef.current;
    const viewer = vs ? { synthetic: true, profile: vs.profile, label: vs.label, seed: vs.seed } : undefined; // 합성 관객 세션은 파일에도 표기
    return d.exportSession({ route: "film", dominant: filmRef.current.dominant, verdict: filmRef.current.verdict || null, speed, viewer, headPose: sensorRef.current?.report?.(), engagement: engagementRef.current?.report?.(), control, ...extra });
  }

  // 종료 시 자동 저장 (data/sessions/, Supabase 아님). 실패해도 체험은 영향 없다.
  const [savedId, setSavedId] = useState(null);
  const [selfReport, setSelfReport] = useState(null);
  const [engSummary, setEngSummary] = useState(null);
  const [monitor, setMonitor] = useState(null); // 디렉터 모니터(?monitor=1): 목표 곡선 vs 추정 x̂, 관객모델 θ̂, 다음 자극 추천
  const [fingerprint, setFingerprint] = useState(null); // 종료 카드 반응 지문(관객 응답 모델 θ)
  async function saveSession(extra = {}) {
    const data = sessionData(extra);
    if (!data) return;
    try {
      const r = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const j = await r.json();
      if (j?.ok) setSavedId(j.id);
    } catch { /* 로컬 저장 실패는 무시 */ }
  }
  useEffect(() => {
    if (phase === "end") {
      setSelfReport(null);
      const eng = engagementRef.current?.data?.();
      setEngSummary(engagementRef.current?.report?.()?.summary || null);
      setFingerprint(eng ? fingerprintText(fitViewerModel(eng.stimuli)) : null);
      saveSession();
    } /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [phase]);

  function downloadSession() {
    const data = sessionData({ selfReport });
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `busstop-session-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  useEffect(() => () => { abortRef.current.aborted = true; stopBgm(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const accent = dominant ? GENRE_META[dominant].accent : "#cfd8e3";
  const lineAccent = line?.flavor ? GENRE_META[line.genre].accent : accent;
  const snap = hud;
  // HUD 접힘(B104) — 옆사람이 말하기 시작한 뒤(첫 줄부터 버스 장면까지) 오른쪽 HUD 의 사건 목록·마지막 증거 줄을 접어
  // 화자(x≈1120~1350px)를 가리지 않게 한다. 사건 목록은 판정(0:58) 전 탐침 여섯 개라 대사 중에는 더 늘지 않는다.
  // 자막은 줄 사이에 지워지므로(B118) line 이 아니라 talkStarted 로 접는다 — 줄마다 펼쳤다 접히며 깜빡이지 않게.
  const hudFold = (phase === "scene" && talkStarted) || phase === "bus";
  const hudEvents = snap?.events || [];
  const lastEvent = hudEvents.length ? hudEvents[hudEvents.length - 1] : null;
  const lastEventTop = lastEvent ? ["R", "H", "C"].sort((a, b) => lastEvent[b] - lastEvent[a])[0] : null;
  // 종료 카드 배합 두 줄 — 판정 때 배합이 주 문장, 끝 배합은 "판정 뒤 흐름"(lib/viewerText.js, 비교 화면과 같은 규칙)
  const endMix = phase === "end" ? mixLines({ verdict, final: snap?.current || null }) : null;
  const trig = snap?.params?.triggers || {};

  return (
    <div className={s.stage} style={{ "--accent": accent }}>
      <div className={s.bgLayer}>
        <Canvas shadows="soft" gl={{ antialias: true }}>
          <PerspectiveCamera makeDefault position={CANVAS_CAMERA.position} fov={CANVAS_CAMERA.fov} />
          <XR store={xrStore}>
            <ReactiveStage directionRef={directionRef} actorsRef={actorsRef} dominant={dominant} paramsOut={paramsRef} adjustRef={adjustRef} cueRef={filmRef} useRig={useRig} rigTest={q.rigtest === "1"} signText={signText} reflect={fx && !xrActive} benchYaw={Number(q.benchyaw) || 0} />
            <XRProbe onChange={setXrActive} />
            <Effects enabled={fx} />
            <FilmDirector directionRef={directionRef} sensorRef={sensorRef} engagementRef={engagementRef} actorsRef={actorsRef} filmRef={filmRef} onCue={onCue} onDecide={decideSlotNow} speed={speed} debugBus={q.bus === "1"} debugTruck={q.truck === "1"} viewerSimRef={viewerSimRef} controlsRef={controlsRef} />
            {q.gaze !== "0" && !viewerSim && <DesktopGaze controlsRef={controlsRef} actorsRef={actorsRef} filmRef={filmRef} />}
          </XR>
          {/* 드래그 = 제자리에서 고개 돌리기. 타깃을 카메라 바로 앞 1cm 에 두면 궤도 회전이 머리 회전처럼 된다
              (타깃이 멀면 카메라가 반대편으로 돌아가 도로 한가운데서 정류장을 보게 된다). */}
          <OrbitControls ref={controlsRef} target={[0, 1.15, 0.34]} enableZoom={false} enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={-0.35} />
        </Canvas>
        <div className={s.vignette} />
      </div>

      <video ref={videoRef} muted playsInline className={s.hiddenVideo} />

      <div className={s.topBar}>
        <a className={s.homeLink} href="/">← 대시보드</a>
        <span className={s.dim}>반응형 실시간 영화 · 폐루프 연출 상태 · <a href="/story-vr" style={{ color: "inherit" }}>이전 버전(1회 판정)</a></span>
        <div className={s.genreChip}>
          <button className={s.resetBtn} onClick={enterVr}>🥽 Enter VR</button>
          {phase !== "gate" && (
            <>
              {dominant && <><span className={s.genreDot} />{DIALOGUE_V2_GENRE_LABEL[dominant]}</>}
              <button className={s.resetBtn} onClick={reset}>⟲ 처음으로</button>
            </>
          )}
        </div>
      </div>

      {xrError && <p className={s.introSub} style={{ position: "absolute", top: 70, width: "100%", textAlign: "center", zIndex: 6 }}>{xrError}</p>}

      {viewerSim && <div className={f.synthBadge}>합성 관객(시연용) · {GAZE_PROFILES[viewerSim].label} · seed {viewerSeed} — 실제 관객의 반응이 아닙니다</div>}

      {showHud && snap && phase !== "gate" && phase !== "end" && (
        <div className={f.hud} style={{ "--accent": accent }}>
          <p className={f.hudTitle}><span>연출 상태</span><span>{snap.phase} · {Math.floor(snap.t / 60)}:{String(Math.floor(snap.t % 60)).padStart(2, "0")}</span></p>
          {["R", "H", "C"].map((g) => (
            <div key={g} className={f.bar}>
              <span>{GENRE_META[g].label}</span>
              <div className={f.barTrack}><div className={f.barFill} style={{ width: `${Math.round(snap.current[g] * 100)}%`, background: GENRE_META[g].accent }} /></div>
              <span style={{ textAlign: "right" }}>{Math.round(snap.current[g] * 100)}%</span>
            </div>
          ))}
          <div className={f.hudMeta}>
            <span>정착 <b>{Math.round(snap.settled * 100)}%</b></span>
            {/* "장르 확신" — 장르 배합의 확신도. 디렉터 모니터의 "모델 신뢰도"(θ̂ 응답 수)와는 다른 값이라 이름을 나눈다 (B94) */}
            <span>장르 확신 <b>{Math.round(snap.confidence * 100)}%</b></span>
            <span>웹캠 <b>{camStatus}</b></span>
            {useVoice && <span>음성 <b>{voiceStatus}</b></span>}
            {askStatus && <span className={askStatus.stale ? f.stale : undefined}>질문 {askStatus.seq} · <b>{askStatus.listening ? "응답 기다리는 중" : askStatus.answered ? `응답 ${{ nod: "끄덕임", turn: "돌림", shake: "가로젓기", forced: "강제" }[askStatus.how] || "있음"}` : "응답 없음"}</b></span>}
            {signText && <span>표지판 <b>{signText}</b></span>}
            <span>거리 <b>{snap.params ? snap.params.npcDistance.toFixed(2) : "-"}m</b></span>
            <span>시선 <b>{snap.params ? Math.round(snap.params.npcGaze * 100) : "-"}%</b></span>
            <span>침묵 <b>{snap.params ? snap.params.npcSilence.toFixed(1) : "-"}s</b></span>
          </div>
          <div className={f.hudTrig}>
            <span className={`${f.trig} ${trig.lampEarlyOn ? f.trigOn : ""}`}>가로등 점등</span>
            <span className={`${f.trig} ${trig.sunBreak ? f.trigOn : ""}`}>구름 갈라짐</span>
            <span className={`${f.trig} ${trig.flatLight ? f.trigOn : ""}`}>그림자 소멸</span>
          </div>
          {!hudFold && snap.lastEvidence && (
            <div className={f.lastEv}>↳ {snap.lastEvidence.source} {snap.lastEvidence.note ? `· ${snap.lastEvidence.note}` : ""}</div>
          )}
          {hudFold && lastEvent && (
            <div className={f.lastEv}>사건 {hudEvents.length}건 접힘 · 마지막 {EVENT_LABEL[lastEvent.name] || lastEvent.name} → <span style={{ color: GENRE_META[lastEventTop].accent }}>{GENRE_META[lastEventTop].label} {Math.round(lastEvent[lastEventTop] * 100)}</span></div>
          )}
          {!hudFold && snap.events?.length > 0 && (
            <div className={f.evList}>
              {snap.events.map((e) => {
                const top = ["R", "H", "C"].sort((a, b) => e[b] - e[a])[0];
                return (
                  <div key={e.name} className={f.evRow}>
                    <span>{EVENT_LABEL[e.name] || e.name}</span>
                    <span className={s.dim} title="임계값: LOOK_TOLERANCE_DEG=28 · STARTLE_YAW_VEL=140 · RETREAT_M=0.07 · SUSTAIN_SEC=2.0 (lib/headPoseSense.js)">
                      {e.feats.looked ? `봤음 ${e.feats.lookSec.toFixed(1)}s` : "안 봄"}
                      {e.feats.recheck ? " · 재확인" : ""}
                      {` · 속도${e.feats.maxVel.toFixed(0)}°/s`}
                      {` · 후퇴${e.feats.retreat.toFixed(2)}m`}
                      {e.feats.recoverySec != null ? ` · 회복${e.feats.recoverySec.toFixed(1)}s` : ""}
                    </span>
                    <span style={{ color: GENRE_META[top].accent }}>{GENRE_META[top].label} {Math.round(e[top] * 100)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {monitor && phase !== "gate" && phase !== "end" && (
        <DirectorMonitor monitor={monitor} tNow={snap?.t ?? 0} tMax={180} showTarget eventLabel={EVENT_LABEL} />
      )}

      {phase === "gate" && (
        <div className={s.intro}>
          <div className={s.introCard}>
            <p className={s.introEyebrow}>정류장 · 반응형 실시간 영화</p>
            <h1 className={s.introTitle}>정류장 벤치에 앉아 주세요</h1>
            <p className={s.introSub}>
              고르는 것은 없습니다. 당신이 어디를 보고 어떻게 움직이는지가 하늘과 빛, 옆에 앉는 사람을
              바꿉니다. 헤드셋이 있으면 위 "Enter VR"로 들어가고, 없으면 드래그로 둘러보세요.
              {useCam ? " 웹캠은 몸의 반응을 보태는 보조 채널입니다." : ""}
            </p>
            <button className={s.choiceBtn} onClick={start} style={{ justifyContent: "center" }}>
              <span>시작하기{speed !== 1 ? ` (${speed}배속)` : ""}</span>
            </button>
          </div>
        </div>
      )}

      {caption && (
        <div className={f.caption}><span className={f.captionText}>{caption}</span></div>
      )}

      {(phase === "scene" || phase === "bus") && line && (
        <div className={s.subtitleBar} style={{ "--accent": lineAccent }}>
          <div className={s.subtitleInner}>
            {/* 진행 막대·줄 번호는 개발용 — ?hud=0(전시 화면)에서는 자막만 남긴다 */}
            {showHud && (
              <div className={s.progressTrack}>
                <div className={s.progressFill} style={{ width: `${((line.index + 1) / line.total) * 100}%` }} />
              </div>
            )}
            {showHud && (
              <div className={s.seqRow}>
                <span className={s.seqBadge}>{line.genre}-{line.seq}</span>
                {line.flavor
                  ? <span className={s.dim}>배합 콜백 ({DIALOGUE_V2_GENRE_LABEL[line.genre]}) · {line.total}줄에 넣지 않음</span>
                  : <span>{line.index + 1} / {line.total}줄</span>}
                {line.tinted && <span className={s.dim}>· {DIALOGUE_V2_GENRE_LABEL[line.tinted]} 변주</span>}
              </div>
            )}
            <p className={s.lineText}>{line.text}</p>
          </div>
        </div>
      )}

      {phase === "end" && (
        <div className={s.intro}>
          <div className={f.endCard}>
            <h2 className={f.endTitle}>오늘의 정류장은 이렇게 흘렀습니다</h2>
            <p className={f.endSub}>
              옆에 앉은 사람: <b style={{ color: accent }}>{dominant ? GENRE_META[dominant].label : "-"}</b> ·
              {" "}{endMix.main}
            </p>
            {endMix.after && <p className={f.endSub} style={{ marginTop: -4, fontSize: 12.5, opacity: 0.75 }}>{endMix.after}</p>}
            <TrajectoryChart trajectory={directionRef.current?.st.trajectory} events={directionRef.current?.st.events} />
            <div className={f.legend}>
              {["R", "H", "C"].map((g) => <span key={g}><i style={{ background: GENRE_META[g].accent }} />{GENRE_META[g].label}</span>)}
              <span><i style={{ background: "rgba(255,255,255,0.35)" }} />정착도</span>
            </div>
            {engSummary && (
              <p className={f.endSub} style={{ marginTop: 12 }}>
                집중한 순간: <b style={{ color: accent }}>{focusText(engSummary, { events: filmTimeEvents(directionRef.current?.st.events, speed), speed }) || "-"}</b>
                {engSummary.probeResponseRate != null && <> · 사건에 반응한 비율 <b>{Math.round(engSummary.probeResponseRate * 100)}%</b></>}
                {engSummary.laughEpisodes?.length > 0 && <> · 웃음 <b>{engSummary.laughEpisodes.length}회</b></>}
                {engSummary.dropPoint && <> · 집중이 풀린 지점 <b>{mmss(engSummary.dropPoint.t * (speed || 1))}</b></>}
              </p>
            )}
            {fingerprint && <p className={f.endSub} style={{ marginTop: 6, fontStyle: "italic" }}>당신의 반응: {fingerprint}</p>}
            {/* 파일럿용 자기보고 — "당신이 느낀 정류장은?" 시스템 판정과의 일치율 재료 */}
            <div className={f.legend} style={{ justifyContent: "center", alignItems: "center", gap: 8 }}>
              <span>당신이 느낀 정류장은?</span>
              {["R", "H", "C"].map((g) => (
                <button
                  key={g}
                  className={f.endBtn}
                  style={{ padding: "5px 12px", borderColor: selfReport === g ? GENRE_META[g].accent : undefined, color: selfReport === g ? GENRE_META[g].accent : undefined }}
                  onClick={() => { setSelfReport(g); saveSession({ selfReport: g }); }}
                >{GENRE_META[g].label}</button>
              ))}
              {savedId && <span className={s.dim} style={{ fontSize: 11 }}>· 저장됨</span>}
            </div>
            <div className={f.endActions}>
              <button className={`${f.endBtn} ${f.endBtnMain}`} onClick={() => { reset(); setTimeout(start, 50); }}>다시 앉기</button>
              <button className={f.endBtn} onClick={downloadSession}>세션 기록 내려받기 (JSON)</button>
              <button className={f.endBtn} onClick={reset}>처음으로</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
