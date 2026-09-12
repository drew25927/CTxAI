"use client";

// /interim — 중간시연(2분20초 MVP). 기다림_정류장_XR_중간시연_구현가이드_v1.0.docx +
// 기다림_정류장_프로젝트개요서.pdf 그대로.
//
// /film(5분짜리 반응형 실시간 영화, "다음 단계"에 그대로 남는다)과는 별개 라우트다 — 판정
// 시점·사건 타이밍·결말이 완전히 달라서, 이미 배포된 /film을 고치는 대신 새로 분리했다.
// 3D 무대(components/ReactiveStage)는 그대로 재사용한다.
//
// 판정 엔진: lib/interimJudge.js (등급 A~E → 점수표 → 5개 규칙, 프로젝트개요서 §3·§3-1)
// 타임라인: lib/interimTimeline.js (사건 5개 + 판초 인물→옆사람 반전)
// 드리프트: lib/interimDrift.js (신호당 12/24/36/45/50% 누적 → 확정 시 4초 100% 스냅)
// 등급 변환: lib/interimGrader.js (센서 원시값 → S1~S5 등급)
//
// 실제로 연결된 센서
//   헤드셋 IMU(또는 데스크톱 드래그) — S1(판초 인물 접근)·S3(포스터)·S5(개구리) 담당.
//   항상 켜져 있다 — 헤드셋이 없어도 카메라 방향 자체가 신호라 드래그로도 동작한다.
//   lib/headPoseSense.js를 그대로 재사용.
//
//   웹캠(관객 얼굴) — S2(트럭 물보라)·S4(고양이) 담당. 권한을 거부하거나 얼굴이 안 잡히면
//   그 신호는 "관측 실패"로 남는다(판정 엔진의 규칙④가 처리). lib/behaviorSense.js 재사용.
//
//   마이크 — S2·S4의 보조 신호(웃음·탄성·비명). 표정과 같은 사건을 다른 채널로 보는
//   것이라, 표정에 안 잡혀도 소리가 크게 나면 그대로 인정한다. lib/interimMic.js —
//   짧은 녹음 안에서 소리가 한 번 크게 튀는지(탄성·비명) 여러 번 반복되는지(웃음)만
//   보는 잠정 휴리스틱이다.
//
//   기립 감지 — S5(개구리) 등급 A("크게 놀라 기립") 전용. 헤드셋 높이(Y) 변화로 잡는다.
//   lib/standUpSense.js — 데스크톱 드래그는 카메라 위치가 안 바뀌므로(회전만) 실제
//   헤드셋 세션(WebXR)에서만 의미가 있고, 데스크톱에서는 항상 false다.
//
// 아직 연결 안 된 것
//   외부 몸 카메라 — 스펙은 별도 카메라를 가정하지만 이 웹 앱엔 얼굴 웹캠 하나뿐이라
//   S2·S4는 그 웹캠으로 근사한다(lib/interimGrader.js 상단 주석 참고).
//
// URL 옵션
//   ?s1=A&s2=B...   특정 신호를 강제로 덮어쓴다(점검용) — 주면 그 신호는 실제 센서 대신
//                   이 값을 쓴다. 안 주면 실제 센서 결과를 쓴다.
//   ?speed=3        영화 시간 배속 (데모용)
//   ?cam=0          웹캠 채널 끄기
//   ?mic=0          마이크 채널 끄기 (둘 다 끄면 S2·S4가 항상 "관측 실패"로 남는다)

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { XR, createXRStore, useXR } from "@react-three/xr";
import { Euler, MathUtils } from "three";
import ReactiveStage from "@/components/ReactiveStage";
import { CUES, evalActors } from "@/lib/interimTimeline";
import { createInterimDrift } from "@/lib/interimDrift";
import { judge } from "@/lib/interimJudge";
import { createHeadPoseSensor } from "@/lib/headPoseSense";
import { createStandUpSensor } from "@/lib/standUpSense";
import { observe } from "@/lib/behaviorSense";
import { recordClip, analyzeMicBurst } from "@/lib/interimMic";
import {
  gradeS1FromHeadPose, gradeS3FromHeadPose, gradeS5FromHeadPose,
  gradeS2FromWebcam, gradeS4FromWebcam,
} from "@/lib/interimGrader";
import s from "../story/story.module.css";
import f from "../film/film.module.css";

const xrStore = createXRStore();
const CANVAS_CAMERA = { position: [0, 1.15, 0.35], fov: 60 };
const GENRE_META = {
  R: { accent: "#f2a7c0", label: "로맨스" },
  H: { accent: "#8fae95", label: "공포" },
  C: { accent: "#e0a86a", label: "블랙코미디" },
};
// 프로젝트개요서 §5 — 인사 한마디는 판정의 증명이다. 대사·음성은 별도 후속 작업에서
// 정식으로 붙인다. 지금은 스펙 문구를 자막으로만 보여준다.
const GREETING = {
  R: "아, 안녕하세요! 저 시끄럽지 않았어요?",
  H: "...아까부터 보고 계셨죠.",
  C: "뭘 봐.",
};
const SIGNALS = ["S1", "S2", "S3", "S4", "S5"];
// 신호 하나를 재는 웹캠 관찰 창 길이(ms, 실제 시간 — speed 배속과 무관하게 카메라·모델은
// 실시간으로 돈다). behaviorSense.observe()는 첫 1.2초를 기준선 잡기에 쓰므로 그보다는 길게.
const WEBCAM_GRADE_MS = { S2: 2500, S4: 4500 };

function useQuery() {
  const [q, setQ] = useState({});
  useEffect(() => { setQ(Object.fromEntries(new URLSearchParams(window.location.search).entries())); }, []);
  return q;
}

// Canvas 안에서 도는 디렉터 — 카메라 포즈를 헤드 포즈 센서에 먹이고, 시간을 밀고, 큐를 쏘고,
// 드리프트를 tick하고, 판정 시점에 judge()를 부른다. 렌더는 순수하게 actorsRef/driftRef를
// 프레임마다 갱신하는 것뿐이라 React 상태로 만들지 않는다 — 화면 전환이 필요한 지점만
// onCue로 페이지에 알린다.
function InterimDirector({ actorsRef, driftRef, sensorRef, standUpRef, observationsRef, onCue, speed = 1 }) {
  const session = useXR((xr) => xr.session);
  const euler = useMemo(() => new Euler(), []);
  const tRef = useRef(0);
  const cueIdxRef = useRef(0);
  const judgedRef = useRef(false);

  useFrame((state, dt) => {
    const clamped = Math.min(dt, 0.1);

    // 카메라 포즈 → 헤드 포즈 센서. 헤드셋이든 데스크톱 드래그든 카메라 방향 자체가
    // 신호라 똑같이 동작한다 (film/page.js의 FilmDirector와 같은 패턴).
    euler.setFromQuaternion(state.camera.quaternion, "YXZ");
    const yaw = -MathUtils.radToDeg(euler.y);
    const pitch = MathUtils.radToDeg(euler.x);
    const z = session ? state.camera.position.z : 0;
    sensorRef.current?.update(yaw, pitch, z, clamped);
    standUpRef.current?.update(state.camera.position.y, clamped, !!session);

    tRef.current += clamped * speed;
    const t = tRef.current;

    while (cueIdxRef.current < CUES.length && t >= CUES[cueIdxRef.current].t) {
      const cue = CUES[cueIdxRef.current++];
      onCue?.(cue, t);
      if (cue.sense) sensorRef.current?.beginEvent(cue.name, cue.sense.azimuth, cue.sense.dur / speed, { kind: cue.sense.kind, tail: 4 / speed });
      if (cue.signal && !judgedRef.current) {
        // 부분 관측치로 "지금까지의 선두 장르"를 뽑아 드리프트에 알린다 (§4 "선두가
        // 바뀌면 방향도 바뀐다"). 최종 판정과 같은 엔진을 재사용 — 별도 로직 없음.
        const partial = judge(observationsRef.current);
        driftRef.current.readSignal(partial.genre);
      }
      if (cue.name === "judge" && !judgedRef.current) {
        judgedRef.current = true;
        const result = judge(observationsRef.current);
        driftRef.current.finalize(result.genre);
        onCue?.({ name: "judged", result }, t);
      }
    }

    driftRef.current.tick(dt);
    actorsRef.current = evalActors(t, { dominant: driftRef.current.st.finalGenre });
  });

  return null;
}

function XRProbe({ onChange }) {
  const session = useXR((xr) => xr.session);
  useEffect(() => { onChange(!!session); }, [session, onChange]);
  return null;
}

export default function InterimPage() {
  const q = useQuery();
  const [phase, setPhase] = useState("gate"); // gate | running | greeting | end
  const [genre, setGenre] = useState(null);
  const [xrActive, setXrActive] = useState(false);
  const [xrError, setXrError] = useState(null);
  const [camStatus, setCamStatus] = useState("idle"); // idle | starting | on | denied | no-face | off
  const [micStatus, setMicStatus] = useState("idle"); // idle | starting | on | denied | off
  const [hud, setHud] = useState(null);

  const actorsRef = useRef({});
  const driftRef = useRef(null);
  const sensorRef = useRef(null);
  const standUpRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const micStreamRef = useRef(null);
  const debugObsRef = useRef({});   // ?s1=A 같은 강제 덮어쓰기
  const liveGradesRef = useRef({}); // 실제 센서가 매긴 등급
  const observationsRef = useRef({}); // judge()에 실제로 들어가는 값 — 매 프레임 병합

  if (!driftRef.current) driftRef.current = createInterimDrift();
  if (!standUpRef.current) standUpRef.current = createStandUpSensor();
  if (!sensorRef.current) {
    sensorRef.current = createHeadPoseSensor({
      push: () => {}, // 연속 블렌딩(lib/directionState.js)은 안 쓴다 — 드리프트는 interimDrift가 따로 맡는다
      mark: (name, detail) => {
        if (name !== "event:scored") return;
        const cue = CUES.find((c) => c.name === detail.name);
        if (!cue?.signal) return;
        const grade =
          cue.signal === "S1" ? gradeS1FromHeadPose(detail.feats) :
          cue.signal === "S3" ? gradeS3FromHeadPose(detail.feats) :
          cue.signal === "S5" ? gradeS5FromHeadPose(detail.feats, { stoodUp: standUpRef.current?.stoodUp }) : null;
        if (grade) liveGradesRef.current = { ...liveGradesRef.current, [cue.signal]: grade };
      },
    });
  }

  useEffect(() => {
    const obs = {};
    for (const sig of SIGNALS) {
      const v = q[sig.toLowerCase()];
      if (v) obs[sig] = v.toUpperCase();
    }
    debugObsRef.current = obs;
  }, [q]);

  // 매 프레임 판정 엔진에 들어갈 값 = 디버그 강제값(있으면) 우선, 없으면 실제 센서 등급.
  useEffect(() => {
    const id = setInterval(() => {
      const merged = {};
      for (const sig of SIGNALS) {
        const v = debugObsRef.current[sig] || liveGradesRef.current[sig];
        if (v) merged[sig] = v;
      }
      observationsRef.current = merged;
      const d = driftRef.current;
      if (d) {
        setHud({
          current: { ...d.st.current }, settled: d.st.settled, elapsed: d.st.elapsed,
          grades: merged,
          stoodUp: !!standUpRef.current?.stoodUp,
          debugSignals: new Set(Object.keys(debugObsRef.current)),
        });
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  const speed = Number(q.speed) || 1;
  const useCam = q.cam !== "0";
  const useMic = q.mic !== "0";

  function onCue(cue) {
    if (cue.name === "judged") { setGenre(cue.result.genre); return; }
    if (cue.name === "transition") setPhase("running");
    if (cue.name === "greeting") setPhase("greeting");
    if (cue.name === "end") setPhase("end");

    // 웹캠 담당 신호(S2·S4) — 그 사건 순간에만 짧게 관찰한다. 이미 디버그로 강제돼
    // 있으면(?s2=A) 카메라를 돌릴 필요가 없다.
    if (cue.signal === "S2" || cue.signal === "S4") {
      if (debugObsRef.current[cue.signal]) return;
      runWebcamGrade(cue.signal);
    }
  }

  async function runWebcamGrade(signal) {
    const ms = WEBCAM_GRADE_MS[signal] || 3000;
    const wantsCam = useCam && camStatus !== "denied" && videoRef.current;
    const wantsMic = micStreamRef.current && micStatus !== "denied";
    if (!wantsCam && !wantsMic) return;

    const [obs, micBlob] = await Promise.all([
      wantsCam ? observe(videoRef.current, ms, null) : Promise.resolve(null),
      wantsMic ? recordClip(micStreamRef.current, ms) : Promise.resolve(null),
    ]);
    const mic = micBlob ? await analyzeMicBurst(micBlob) : null;

    let m = null;
    if (obs) {
      if (!obs.ok) setCamStatus("model-fail");
      else {
        m = obs.metrics;
        if ((m.lostTrackingSec || 0) > (ms / 1000) * 0.6) { setCamStatus("no-face"); m = null; }
        else setCamStatus("on");
      }
    }
    if (!m && !mic) return; // 웹캠·마이크 둘 다 아무것도 못 잡았으면 관측 실패로 남긴다(규칙④)

    const grade = signal === "S2" ? gradeS2FromWebcam(m, mic) : gradeS4FromWebcam(m, mic);
    liveGradesRef.current = { ...liveGradesRef.current, [signal]: grade };
  }

  async function start() {
    setPhase("running");
    if (useCam) {
      try {
        setCamStatus("starting");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      } catch { setCamStatus("denied"); }
    } else setCamStatus("off");

    if (useMic) {
      try {
        setMicStatus("starting");
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setMicStatus("on");
      } catch { setMicStatus("denied"); }
    } else setMicStatus("off");
  }

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function enterVr() {
    try { await xrStore.enterVR(); } catch { setXrError("VR 진입에 실패했습니다 — 헤드셋 연결과 브라우저의 WebXR 지원을 확인해 주세요."); }
  }

  const accent = genre ? GENRE_META[genre].accent : "#cfd8e3";
  const gateShown = phase === "gate";
  const showHud = q.hud !== "0" && !gateShown;
  const CAM_LABEL = { idle: "대기", starting: "연결 중…", on: "연결됨", denied: "권한 거부", "no-face": "얼굴 인식 실패", "model-fail": "모델 로딩 실패", off: "꺼짐(?cam=0)" };
  const MIC_LABEL = { idle: "대기", starting: "연결 중…", on: "연결됨", denied: "권한 거부", off: "꺼짐(?mic=0)" };
  const okColor = (v) => (v === "on" ? "#8fd68f" : v === "denied" || v === "model-fail" ? "#e08a8a" : "#c9c9c9");

  return (
    <div className={s.stage} style={{ "--accent": accent }}>
      <div className={s.bgLayer}>
        <Canvas shadows="soft" gl={{ antialias: true }}>
          <PerspectiveCamera makeDefault position={CANVAS_CAMERA.position} fov={CANVAS_CAMERA.fov} />
          <XR store={xrStore}>
            <ReactiveStage actorsRef={actorsRef} directionRef={driftRef} dominant={genre} reflect={!xrActive} />
            <XRProbe onChange={setXrActive} />
            {phase !== "gate" && (
              <InterimDirector actorsRef={actorsRef} driftRef={driftRef} sensorRef={sensorRef} standUpRef={standUpRef} observationsRef={observationsRef} onCue={onCue} speed={speed} />
            )}
          </XR>
          <OrbitControls target={[0, 1.15, 0.34]} enableZoom={false} enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={-0.35} />
        </Canvas>
        <div className={s.vignette} />
      </div>

      <video ref={videoRef} muted playsInline className={s.hiddenVideo} />

      <div className={s.topBar}>
        <a className={s.homeLink} href="/todo">← 대시보드</a>
        <span className={s.dim}>중간시연(2분20초 MVP) · <a href="/film" style={{ color: "inherit" }}>5분 버전(다음 단계)</a></span>
        <div className={s.genreChip}>
          <button className={s.resetBtn} onClick={enterVr}>🥽 Enter VR</button>
          {genre && <><span className={s.genreDot} />{GENRE_META[genre].label}</>}
        </div>
      </div>

      {xrError && <p className={s.introSub} style={{ position: "absolute", top: 70, width: "100%", textAlign: "center", zIndex: 6 }}>{xrError}</p>}

      {gateShown && (
        <div className={s.intro}>
          <div className={s.introCard}>
            <p className={s.introEyebrow}>정류장 · 중간시연</p>
            <h1 className={s.introTitle}>정류장 벤치에 앉아 주세요</h1>
            <p className={s.introSub}>
              고르는 것은 없습니다. 약 2분 동안 평범한 사건들이 일어나고, 당신의 반응에 따라
              하늘과 빛, 옆에 앉는 사람이 정해집니다. 헤드셋이 있으면 위 "Enter VR"로 들어가고,
              없으면 드래그로 둘러보세요. {useCam || useMic ? "웹캠·마이크는 반응을 보태는 보조 채널입니다." : ""}
            </p>
            <div className={s.choices}>
              <button className={s.choiceBtn} onClick={start}>
                시작하기 <span className={s.choiceArrow}>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showHud && hud && (
        <div className={f.hud} style={{ "--accent": accent }}>
          <div className={f.hudTitle}>연출 상태 · {genre ? "확정" : "관찰 중"} · {mmss(hud.elapsed)}</div>
          {["R", "H", "C"].map((g) => (
            <div key={g} className={f.bar}>
              <span>{GENRE_META[g].label}</span>
              <div className={f.barTrack}><div className={f.barFill} style={{ width: `${Math.round((hud.current[g] || 0) * 100)}%`, background: GENRE_META[g].accent }} /></div>
              <span>{Math.round((hud.current[g] || 0) * 100)}%</span>
            </div>
          ))}
          <div className={f.hudMeta}>드리프트 <b>{Math.round(hud.settled * 100)}%</b></div>
          <div className={f.hudMeta}>
            신호 <b>{SIGNALS.map((sig) => `${sig}:${hud.grades[sig] || "-"}${hud.debugSignals.has(sig) ? "(강제)" : ""}`).join(" ")}</b>
          </div>
          <div className={f.hudMeta} style={{ opacity: 0.85 }}>
            센서 — 헤드셋/드래그 <b style={{ color: "#8fd68f" }}>연결됨</b> · 웹캠 <b style={{ color: okColor(camStatus) }}>{CAM_LABEL[camStatus]}</b> · 마이크 <b style={{ color: okColor(micStatus) }}>{MIC_LABEL[micStatus]}</b>
          </div>
          <div className={f.hudMeta} style={{ opacity: 0.85 }}>
            기립 감지(S5:A) <b style={{ color: hud.stoodUp ? "#8fd68f" : "#c9c9c9" }}>{!xrActive ? "헤드셋 필요(데스크톱)" : hud.stoodUp ? "감지됨" : "대기 중"}</b>
          </div>
          <div className={f.hudMeta} style={{ opacity: 0.6 }}>
            미연결 — 외부 몸 카메라 (S2·S4는 얼굴 웹캠으로 근사 중)
          </div>
        </div>
      )}

      {phase === "greeting" && genre && (
        <div className={s.subtitleBar}>
          <div className={s.subtitleInner}>
            <p className={s.lineText}>{GREETING[genre]}</p>
          </div>
        </div>
      )}

      {phase === "end" && (
        <div className={s.intro}>
          <div className={s.introCard}>
            <p className={s.introEyebrow}>정류장 · 중간시연</p>
            <h1 className={s.introTitle}>{genre ? GENRE_META[genre].label : "-"}</h1>
            <p className={s.introSub}>체험이 끝났습니다.</p>
            <div className={s.choices}>
              <button className={s.choiceBtn} onClick={() => window.location.reload()}>다시 앉기 ↺</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function mmss(sec) {
  const s2 = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s2 / 60)).padStart(2, "0")}:${String(s2 % 60).padStart(2, "0")}`;
}
