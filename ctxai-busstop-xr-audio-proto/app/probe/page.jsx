"use client";

// 프로브 하네스 — 다섯 사건을 실제로 겪고, 원시 반응을 세션으로 남긴다.
//
// 이 화면이 세 가지를 한꺼번에 한다 (관찰 하네스):
//   ① 자극 제시   다섯 프로브를 정확한 시점·방위로 (공간음향 + 최소 시각 큐)
//   ② 기록        요각·랜드마크·표정·오디오를 원시 시계열로
//   ③ 리플레이 소재  저장된 세션을 scripts/replay.mjs 가 다시 계산한다
//
// 왜 필요한가: 판정 로직 전체가 "다섯 사건에 대한 반응"을 전제로 짜여 있는데
// 그 다섯 사건이 아직 없었다. /judge-v2 가 재던 것은 사실상 "카메라 앞에서
// 11초 동안 아무 자극 없이 뭘 했는가" 였다 — 자극이 없으면 반응도 없어서
// 임계값을 아무리 튜닝해도 파일럿이 성립하지 않는다.
//
// 판정 주 신호는 **마우스 룩 요각**이다 (v2.md §5 "시선 = 헤드셋 헤드 포즈").
// 웹캠 좌표도 나란히 기록해 둔다 — 나중에 "코끝 좌표 휴리스틱이 요각을
// 얼마나 잘 근사했나" 를 실제로 측정하기 위해서다.
//
// 관련: lib/probes.js · lib/spatialAudio.js · lib/probeWindow.js
//       components/ProbeStage.jsx · scripts/replay.mjs

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PROBES, TOTAL_MS, BASELINE_MS } from "@/lib/probes";
import { createSpatialStage } from "@/lib/spatialAudio";
import { createRecorder } from "@/lib/sessionRecord";
import { sampleFrames, metricsFrom, judgeFromBehavior, fuseChannels, smoothScores, confidenceOf } from "@/lib/behaviorSense";
import { kernelsFrom, judgeFromKernels } from "@/lib/probeWindow";
import { scoresFromMoodApi } from "@/lib/textKeywords";
import { DIALOGUE_V2_LINES, DIALOGUE_V2_SLOT_ID } from "@/lib/dialogueV2Lines";
import { startBgmBlend, stopBgmBlend } from "@/lib/bgmBlend";
import { analyzeProsody } from "@/lib/voiceProsody";
import s from "./probe.module.css";

// r3f 는 서버 렌더에서 창을 찾으므로 클라이언트 전용으로 불러온다.
const ProbeStage = dynamic(() => import("@/components/ProbeStage"), { ssr: false });

const LOOK_SENS = 0.24;   // 도/px
const PITCH_LIMIT = 78;
const GENRE_LABEL = { R: "로맨스", H: "공포", C: "블랙코미디" };

// 프로브 판정을 /story-v2 로 넘길 때 쓰는 자리.
// 다섯 사건에 대한 반응이 실제로 이야기를 바꾸는 것을 눈으로 보게 하려는 것 —
// 하네스는 측정까지가 역할이라 여기서 끊기지만, 그 벡터가 어디로 가는지는
// 보여야 한다.
export const HANDOFF_KEY = "busstop.probeResult";

export default function ProbePage() {
  const [phase, setPhase] = useState("gate"); // gate | running | voice | survey | done
  const [clock, setClock] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(null);
  const [survey, setSurvey] = useState({ selfReport: null, immersion: null, noticed: null, free: "" });
  // 캐릭터 장면 — 판정이 끝나면 같은 3D 씬 안에서 이어진다
  const [npc, setNpc] = useState(null);   // { genre, stage, t, speaking }
  const [bus, setBus] = useState(null);   // { t, doorOpen }
  const [subtitle, setSubtitle] = useState(null);
  const [live, setLive] = useState(null); // 진행 중 누적 판정 (HUD 표시용)

  const lookRef = useRef({ yaw: 0, pitch: 0 });
  const clockRef = useRef(0);
  const stageRef = useRef(null);
  const recRef = useRef(null);
  const firedRef = useRef(new Set());
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const framesRef = useRef(null);
  const gazeRef = useRef([]);
  const q1Ref = useRef(null);
  const lastPaintRef = useRef(0);
  // 하늘·빛·안개가 따라가는 목표. 사건이 하나씩 끝날 때마다 갱신된다.
  const moodRef = useRef({ scores: null, confidence: 0 });
  const closedRef = useRef(new Set());
  const smoothRef = useRef(null);
  const bgmRefs = { H: useRef(null), R: useRef(null), C: useRef(null) };
  const lineRef = useRef(null);
  const abortRef = useRef(false);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stageRef.current?.stop();
  }, []);

  // ── 마우스 룩 ────────────────────────────────────────────
  const dragRef = useRef(null);

  const onPointerDown = useCallback((e) => {
    if (phase !== "running") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  }, [phase]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    const L = lookRef.current;
    L.yaw += dx * LOOK_SENS;                                   // 오른쪽으로 끌면 오른쪽을 본다
    L.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, L.pitch - dy * LOOK_SENS));
  }, []);

  const endDrag = useCallback(() => { dragRef.current = null; setDragging(false); }, []);

  // 방향키 — 마우스로 큰 각도를 돌리기 어려운 경우의 보조 수단
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e) => {
      const L = lookRef.current;
      const step = e.shiftKey ? 12 : 4;
      if (e.key === "ArrowLeft") L.yaw -= step;
      else if (e.key === "ArrowRight") L.yaw += step;
      else if (e.key === "ArrowUp") L.pitch = Math.min(PITCH_LIMIT, L.pitch + step);
      else if (e.key === "ArrowDown") L.pitch = Math.max(-PITCH_LIMIT, L.pitch - step);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // ── 프레임 루프에서 불린다 (ProbeStage 의 useFrame) ──────
  const onFrame = useCallback((elapsed, yaw, pitch) => {
    // 요각 기록 — 판정 주 신호
    recRef.current?.gaze(elapsed, yaw, pitch);
    gazeRef.current.push({ t: Math.round(elapsed), yaw: Number(yaw.toFixed(2)), pitch: Number(pitch.toFixed(2)) });

    // 프로브 발화 — 시점이 되면 한 번만
    for (const p of PROBES) {
      if (elapsed >= p.onsetMs && !firedRef.current.has(p.id)) {
        firedRef.current.add(p.id);
        stageRef.current?.fire(p);
        recRef.current?.event("probe_fired", { id: p.id, atMs: Math.round(elapsed) });
      }
    }
    stageRef.current?.update(elapsed);

    // ── 사건이 하나 끝날 때마다 판정을 갱신한다 ──────────────
    //
    // 원안(7조_버스정류장.md)의 "누적형 대화로 파라미터 지속 업데이트" 가
    // 이것이다. 76초를 다 관찰한 뒤 한 번에 판정하면 관객 입장에서는
    // 아무 반응 없던 세계가 갑자기 바뀐다. 증거가 쌓이는 대로 하늘과 소리가
    // 조금씩 기울어야 "세계가 나를 읽고 있다" 가 된다.
    for (const p of PROBES) {
      const end = p.onsetMs + p.windowMs;
      if (elapsed < end + 400 || closedRef.current.has(p.id)) continue;
      closedRef.current.add(p.id);
      const done = PROBES.filter((x) => closedRef.current.has(x.id));
      const { kernels } = kernelsFrom({
        gaze: gazeRef.current,
        samples: framesRef.current?.samples || [],
        probes: done,
      });
      const judged = judgeFromKernels(kernels).scores;
      // 값이 뚝뚝 끊기지 않게 완만하게 따라간다 (구현_리스크 §4-3)
      smoothRef.current = smoothScores(smoothRef.current, judged, 0.55);
      // 증거가 적을 때는 확신도를 깎는다 — 하늘이 성급하게 확 바뀌지 않게
      const evidence = done.length / PROBES.length;
      const conf = confidenceOf(smoothRef.current) * (0.35 + evidence * 0.65);
      moodRef.current = { scores: smoothRef.current, confidence: conf };
      setLive({ scores: smoothRef.current, confidence: conf, n: done.length });
      startBgmBlend({ H: bgmRefs.H.current, R: bgmRefs.R.current, C: bgmRefs.C.current }, smoothRef.current);
      recRef.current?.event("partial_judgment", {
        atMs: Math.round(elapsed), afterProbe: p.id,
        scores: smoothRef.current, confidence: Number(conf.toFixed(3)),
      });
    }

    // 화면 갱신은 250ms 단위로만 — 매 프레임 setState 하면 렌더가 프레임을 잡아먹는다
    if (elapsed - lastPaintRef.current >= 250) {
      lastPaintRef.current = elapsed;
      setClock(elapsed);
    }
  }, []);

  // ── 시작 ─────────────────────────────────────────────────
  async function start(consent) {
    setError(null);
    setStatus("");
    lookRef.current = { yaw: 0, pitch: 0 };
    firedRef.current = new Set();
    closedRef.current = new Set();
    smoothRef.current = null;
    moodRef.current = { scores: null, confidence: 0 };
    abortRef.current = false;
    setLive(null);
    setNpc(null); setBus(null); setSubtitle(null);
    gazeRef.current = [];
    lastPaintRef.current = 0;
    framesRef.current = null;
    recRef.current = createRecorder({ consent });

    // 카메라·마이크 — 거부해도 진행한다. 요각만으로도 판정은 성립한다.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      recRef.current.event("permission_denied", { message: String(e?.name || e) });
    }

    try {
      const stage = createSpatialStage();
      await stage.resume();
      stage.startAmbience();
      stageRef.current = stage;
    } catch (e) {
      setError("오디오를 시작하지 못했습니다: " + (e?.message || e));
      return;
    }

    setPhase("running");

    // 웹캠 샘플링은 별도 루프로 병렬 진행 (판정 주 신호는 아니지만 표정을 준다)
    if (videoRef.current && streamRef.current) {
      sampleFrames(videoRef.current, TOTAL_MS, null, { stride: 2 })
        .then((out) => { framesRef.current = out; })
        .catch(() => { framesRef.current = null; });
    }

    // 프로브 시퀀스가 끝나면 음성 단계로
    setTimeout(() => finishProbes(), TOTAL_MS + 200);
  }

  // ── 프로브 종료 → Q1 ─────────────────────────────────────
  async function finishProbes() {
    setPhase("voice");
    setStatus("잠시만요…");
    stageRef.current?.update(TOTAL_MS + 5000); // 남은 보이스 정리

    const rec = recRef.current;
    rec?.frames(framesRef.current?.samples || []);

    // Q1 — "당신은 무엇을 기다리고 있습니까?"
    // 물어보되 답을 요구하지 않는다. 침묵하면 텍스트·음성 채널이 null 로
    // 빠지고 요각(행동)만으로 판정이 간다.
    let textScores = null, voiceScores = null, transcript = null;
    const track = streamRef.current?.getAudioTracks?.()[0];
    if (track) {
      try {
        setStatus("질문을 듣고, 편하게 답하시거나 그냥 계셔도 됩니다.");
        await playClip(q1Ref.current, 4000);
        setStatus("듣고 있습니다…");
        const blob = await recordFor(track, 6000);
        setStatus("정리하는 중…");
        const out = await scoreVoice(blob);
        textScores = out.textScores;
        voiceScores = out.voiceScores;
        transcript = out.transcript;
      } catch (e) {
        rec?.event("voice_failed", { message: String(e?.message || e) });
      }
    }
    rec?.channels({ textScores, voiceScores, transcript });

    // 판정 — 라이브에서도 리플레이와 **같은 순수 함수**를 탄다.
    const gaze = gazeRef.current;
    const samples = framesRef.current?.samples || [];
    const R = kernelsFrom({ gaze, samples });
    const gazeJudge = judgeFromKernels(R.kernels);
    const camMetrics = metricsFrom(samples, { durationMs: TOTAL_MS, calibMs: BASELINE_MS });
    const camJudge = judgeFromBehavior(camMetrics);
    const fused = fuseChannels({ behaviorScores: gazeJudge.scores, textScores, voiceScores });

    setResult({ baseline: R.baseline, kernels: R.kernels, gazeJudge, camMetrics, camJudge, fused, transcript });
    moodRef.current = { scores: fused.scores, confidence: 1 };
    setLive({ scores: fused.scores, confidence: fused.confidence, n: PROBES.length });
    startBgmBlend({ H: bgmRefs.H.current, R: bgmRefs.R.current, C: bgmRefs.C.current }, fused.scores);
    setStatus("");

    // 관찰은 끝났다. 이제 그 판정이 만든 이야기가 같은 씬에서 이어진다.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    runStory(fused);
  }

  // ── 캐릭터 장면 ──────────────────────────────────────────
  //
  // "하늘과 배경색이 장르에 따라 자연스럽게 바뀌며, 젖은 보도 위로 발걸음이
  //  가까워진다. 곧 누군가 관객 옆에 앉는다." (v2.md §1-6)
  //
  // 인물과 대사는 이산 채널이라 주도 장르로 하나를 고른다. 보조 장르는
  // 콜백 대사 한 줄로 들어온다 (구현_리스크 §4-1).
  function buildLines(dominant, secondary) {
    const base = DIALOGUE_V2_LINES.filter((l) => l.genre === dominant);
    if (!secondary) return base;
    const flavor = DIALOGUE_V2_LINES.find((l) => l.genre === secondary && l.seq === "01");
    if (!flavor) return base;
    const at = Math.min(2, base.length);
    return [...base.slice(0, at), { ...flavor, flavor: true }, ...base.slice(at)];
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function playLine(line) {
    // 오디오가 있으면 그 길이만큼, 없으면(로컬에 Supabase 키가 없을 때) 글자 수로.
    return new Promise((resolve) => {
      const el = lineRef.current;
      const fallback = Math.max(2200, line.text.length * 95);
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      if (!el) return setTimeout(fin, fallback);
      el.onended = fin;
      el.onerror = () => setTimeout(fin, fallback);
      el.src = `/api/vo2/file/${DIALOGUE_V2_SLOT_ID(line.genre, line.seq)}`;
      el.currentTime = 0;
      el.play().catch(() => setTimeout(fin, fallback));
      setTimeout(fin, fallback + 6000); // 최후의 안전장치
    });
  }

  async function runStory(fused) {
    setPhase("story");
    const genre = fused.dominant;
    const lines = buildLines(fused.dominant, fused.secondary);

    // 젖은 보도 위로 발걸음이 가까워진다 → 옆에 앉는다
    for (let i = 0; i <= 30 && !abortRef.current; i++) {
      setNpc({ genre, stage: "approach", t: i / 30, speaking: false });
      await sleep(110);
    }
    if (abortRef.current) return;
    setNpc({ genre, stage: "seated", t: 1, speaking: false });
    await sleep(1400);

    for (const line of lines) {
      if (abortRef.current) return;
      setSubtitle(line);
      setNpc({ genre, stage: "seated", t: 1, speaking: true });
      await playLine(line);
      setNpc({ genre, stage: "seated", t: 1, speaking: false });
      await sleep(520);
    }
    setSubtitle(null);

    // 272 가 온다
    if (abortRef.current) return;
    for (let i = 0; i <= 72 && !abortRef.current; i++) {
      setBus({ t: (i / 72) * 0.72, doorOpen: false });
      await sleep(150);
    }
    setBus({ t: 0.75, doorOpen: true });
    await sleep(900);

    // 떠난다 — 장르마다 방향이 다르다 (v2.md §3)
    for (let i = 0; i <= 26 && !abortRef.current; i++) {
      setNpc({ genre, stage: "leaving", t: i / 26, speaking: false });
      await sleep(150);
    }
    setNpc({ genre, stage: "gone", t: 1, speaking: false });
    for (let i = 0; i <= 24 && !abortRef.current; i++) {
      setBus({ t: 0.86 + (i / 24) * 0.14, doorOpen: false });
      await sleep(130);
    }
    setBus(null);

    // 암전. 벌레 소리와 낙수 소리가 3초 더 남는다. 툭.
    await sleep(2600);
    if (abortRef.current) return;
    endStory();
  }

  function endStory() {
    stopBgmBlend({ H: bgmRefs.H.current, R: bgmRefs.R.current, C: bgmRefs.C.current });
    lineRef.current?.pause();
    stageRef.current?.stop();
    stageRef.current = null;
    setPhase("survey");
  }

  function skipStory() {
    abortRef.current = true;
    setSubtitle(null);
    setNpc(null);
    setBus(null);
    endStory();
  }

  function playClip(el, fallbackMs) {
    return new Promise((resolve) => {
      if (!el) return setTimeout(resolve, 600);
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      el.currentTime = 0;
      el.onended = fin;
      el.play().catch(fin);
      setTimeout(fin, fallbackMs);
    });
  }

  function recordFor(track, ms) {
    return new Promise((resolve) => {
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

  async function scoreVoice(blob) {
    if (!blob) return { textScores: null, voiceScores: null, transcript: null };
    const [mood, prosody] = await Promise.all([
      (async () => {
        try {
          const form = new FormData();
          form.append("audio", blob, "clip.webm");
          const res = await fetch("/api/mood", { method: "POST", body: form });
          const d = await res.json();
          return d?.ok ? d : null;
        } catch { return null; }
      })(),
      analyzeProsody(blob).catch(() => ({ scores: null })),
    ]);
    return {
      textScores: scoresFromMoodApi(mood?.scores),
      voiceScores: prosody?.scores || null,
      transcript: mood?.transcript || null,
    };
  }

  // ── 저장 ─────────────────────────────────────────────────
  async function saveSession() {
    const rec = recRef.current;
    if (!rec || !result) return;
    setStatus("저장 중…");
    rec.label({ ...survey, expect: null });
    try {
      const out = await rec.upload({
        gazeScores: result.gazeJudge.scores,
        camScores: result.camJudge.scores,
        fusedScores: result.fused.scores,
        confidence: result.fused.confidence,
        intensity: Object.fromEntries(result.kernels.map((k) => [k.probeId, k.intensity])),
        selfReport: survey.selfReport,
        immersion: survey.immersion,
        noticed: survey.noticed,
        totalMs: TOTAL_MS,
      });
      if (out?.ok) { setSaved(out); setStatus(""); setPhase("done"); }
      else { setStatus(""); setError(out?.error || "저장에 실패했습니다"); }
    } catch (e) {
      setStatus("");
      setError(String(e?.message || e));
    }
  }

  // ── 화면 ─────────────────────────────────────────────────
  const progress = Math.min(1, clock / TOTAL_MS);
  const yawNow = Math.round(((lookRef.current.yaw % 360) + 540) % 360 - 180);

  return (
    <div className={s.wrap}>
      <div
        className={`${s.canvasHost} ${dragging ? s.dragging : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <ProbeStage
          lookRef={lookRef}
          clockRef={clockRef}
          stageRef={stageRef}
          running={phase === "running"}
          onFrame={onFrame}
          moodRef={moodRef}
          npc={npc}
          bus={bus}
        />
      </div>

      <video ref={videoRef} muted playsInline className={s.hiddenVideo} />
      <audio ref={q1Ref} src="/api/assets/file/vo.q1" preload="auto" />
      <audio ref={lineRef} />
      <audio ref={bgmRefs.H} />
      <audio ref={bgmRefs.R} />
      <audio ref={bgmRefs.C} />

      {phase === "running" && (
        <>
          <div className={`${s.hint} ${clock > 9000 ? s.hintFade : ""}`}>
            마우스를 끌어 둘러보세요 · 방향키도 됩니다
          </div>
          <div className={s.hud}>
            <span className={s.compass}>{yawNow >= 0 ? `우 ${yawNow}°` : `좌 ${-yawNow}°`}</span>
            <div className={s.progressTrack}>
              <div className={s.progressFill} style={{ width: `${progress * 100}%` }} />
            </div>
            <span className={s.compass}>{Math.floor(clock / 1000)}s</span>
          </div>
          {/* 개발용 — 사건마다 판정이 어떻게 기우는지 눈으로 본다.
              관객용 최종형에는 노출되지 않는다. */}
          {live && <LiveBlend live={live} />}
        </>
      )}

      {phase === "voice" && (
        <div className={s.overlay}>
          <div className={s.card}>
            <p className={s.eyebrow}>정류장</p>
            <h1>272번 버스는 5분 후 도착 예정입니다</h1>
            <p className={s.status}>{status}</p>
          </div>
        </div>
      )}

      {phase === "story" && (
        <>
          {subtitle && (
            <div className={s.subtitle}>
              <span className={s.subtitleSeq}>
                {subtitle.genre}-{subtitle.seq}{subtitle.flavor ? " · 배합 콜백" : ""}
              </span>
              <p className={s.subtitleText}>{subtitle.text}</p>
            </div>
          )}
          <button className={s.skip} onClick={skipStory}>건너뛰기 →</button>
        </>
      )}

      {phase === "gate" && <Gate onStart={start} error={error} />}

      {phase === "survey" && (
        <Survey
          survey={survey}
          setSurvey={setSurvey}
          result={result}
          status={status}
          error={error}
          onSave={saveSession}
        />
      )}

      {phase === "done" && <Done saved={saved} result={result} recRef={recRef} />}
    </div>
  );
}

// ── 게이트 ─────────────────────────────────────────────────

function Gate({ onStart, error }) {
  const [consent, setConsent] = useState(false);
  return (
    <div className={s.overlay}>
      <div className={s.card}>
        <p className={s.eyebrow}>프로브 하네스 · 파일럿</p>
        <h1>정류장 벤치에 앉아 계시면 됩니다</h1>
        <p>
          약 76초 동안 정류장에서 몇 가지 일이 일어납니다. 특별히 하실 일은 없습니다 —
          <b> 마우스를 끌어 둘러보시면 됩니다.</b> 소리가 나는 쪽을 보셔도 되고, 안 보셔도 됩니다.
        </p>

        <h2>준비</h2>
        <ul>
          <li><b>헤드폰을 착용해 주세요.</b> 방향이 들려야 하는 소리가 있습니다 — 스피커로는 측정이 안 됩니다.</li>
          <li>카메라와 마이크 권한을 허용하시면 표정·목소리도 함께 봅니다. 거부하셔도 진행됩니다.</li>
        </ul>

        <div className={s.note}>
          저장되는 것: 시선 방향의 시계열, 얼굴 랜드마크 좌표(43개 점), 표정 모델 점수,
          질문에 답하신 음성. <b>원본 영상은 저장하지 않습니다.</b>
        </div>

        <p className={s.q}>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 4 }} />
            <span>위 내용을 읽었고, 연구·개발 목적의 기록에 동의합니다.</span>
          </label>
        </p>

        {error && <p className={`${s.status} ${s.err}`}>{error}</p>}

        <div className={s.row}>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onStart(true)} disabled={!consent}>
            시작하기
          </button>
          <Link href="/judge-v2" className={s.btn} style={{ textDecoration: "none" }}>판정 대시보드</Link>
        </div>
      </div>
    </div>
  );
}

// ── 설문 ───────────────────────────────────────────────────

function Survey({ survey, setSurvey, result, status, error, onSave }) {
  const set = (k, v) => setSurvey((p) => ({ ...p, [k]: v }));
  return (
    <div className={s.overlay}>
      <div className={s.card}>
        <p className={s.eyebrow}>끝났습니다 · 세 가지만 여쭙겠습니다</p>
        <h1>방금 정류장은 어떤 이야기 같았나요?</h1>

        <p className={s.q}>1. 가장 가까운 쪽을 골라 주세요.</p>
        <div className={s.choices}>
          {["R", "H", "C"].map((g) => (
            <button
              key={g}
              className={`${s.choice} ${survey.selfReport === g ? s.choicePicked : ""}`}
              onClick={() => set("selfReport", g)}
            >
              {GENRE_LABEL[g]}
            </button>
          ))}
          <button
            className={`${s.choice} ${survey.selfReport === "none" ? s.choicePicked : ""}`}
            onClick={() => set("selfReport", "none")}
          >
            모르겠다
          </button>
        </div>

        <p className={s.q}>2. 그 자리에 있는 것 같았나요? (1 전혀 아님 — 5 매우 그렇다)</p>
        <div className={s.scale}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`${s.choice} ${survey.immersion === n ? s.choicePicked : ""}`}
              onClick={() => set("immersion", n)}
            >
              {n}
            </button>
          ))}
        </div>

        {/* 무요구 조건의 핵심 검증 — 관객이 측정당한다고 느꼈는가 */}
        <p className={s.q}>3. 체험 중에 &ldquo;내가 관찰·측정당하고 있다&rdquo;고 느끼셨나요?</p>
        <div className={s.choices}>
          {[["no", "전혀"], ["little", "조금"], ["yes", "뚜렷하게"]].map(([v, label]) => (
            <button
              key={v}
              className={`${s.choice} ${survey.noticed === v ? s.choicePicked : ""}`}
              onClick={() => set("noticed", v)}
            >
              {label}
            </button>
          ))}
        </div>

        <p className={s.q}>기억에 남는 순간이 있으면 한 줄 (선택)</p>
        <textarea
          className={s.textarea}
          value={survey.free}
          onChange={(e) => set("free", e.target.value)}
          placeholder="예: 뒤에서 개구리 소리가 나서 돌아봤어요"
        />

        {result && <ScoreBars title="이번 세션의 판정 (요각 기준)" scores={result.gazeJudge.scores} />}

        {status && <p className={s.status}>{status}</p>}
        {error && <p className={`${s.status} ${s.err}`}>{error}</p>}

        <div className={s.row}>
          <button
            className={`${s.btn} ${s.btnPrimary}`}
            onClick={onSave}
            disabled={!survey.selfReport || !survey.immersion || !survey.noticed || !!status}
          >
            세션 저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 완료 ───────────────────────────────────────────────────

function Done({ saved, result, recRef }) {
  const k = result?.kernels || [];

  // 판정 벡터를 그대로 이야기로 넘긴다. 이산 승자를 뽑지 않고 배합 비율
  // 그대로 넘어가므로, 보조 장르의 색감·콜백 대사까지 이 반응에서 나온다.
  function toStory() {
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({
        ...result.fused,
        sessionId: saved?.id || recRef?.current?.sessionId || null,
        intensity: Object.fromEntries(k.map((x) => [x.probeId, x.intensity])),
      }));
    } catch (e) { /* 저장 못 해도 이동은 한다 */ }
    window.location.href = "/story-v2?from=probe";
  }
  return (
    <div className={s.overlay}>
      <div className={s.card}>
        <p className={s.eyebrow}>저장됨</p>
        <h1>고맙습니다</h1>
        <p>이 세션은 판정 로직의 회귀 테스트와 임계값 보정에 쓰입니다.</p>

        {result && (
          <>
            <ScoreBars title="요각 기준 (판정 주 신호)" scores={result.gazeJudge.scores} />
            <ScoreBars title="웹캠 좌표 기준 (비교용)" scores={result.camJudge.scores} />
            <ScoreBars title="융합 — 행동 50 · 텍스트 30 · 음성 20" scores={result.fused.scores} />
          </>
        )}

        <h2>프로브별 반응 강도</h2>
        <div className={s.result}>
          {k.map((x) =>
            `${x.probeId.padEnd(7)} 강도${x.intensity}  ` +
            `획득 ${x.acquired ? "O" : "X"}  ` +
            `잠복 ${String(x.latencyMs ?? "-").padStart(5)}ms  ` +
            `온타깃 ${String(x.onTargetMs).padStart(5)}ms  ` +
            `재확인 ${x.revisits}  ` +
            `얼굴유실 ${x.faceLostMs}ms`
          ).join("\n")}
        </div>

        {saved?.id && (
          <p className={s.foot}>
            세션 <code>{saved.id}</code> · {Math.round((saved.bytes || 0) / 1024)}KB ·{" "}
            <a href={`/api/session/${saved.id}`}>원본 내려받기</a>
            {" — "}<code>node scripts/replay.mjs {saved.id}.jsonl.gz</code> 로 다시 계산됩니다.
          </p>
        )}

        <h2>이 반응이 만든 이야기</h2>
        <p>
          다섯 사건에 어떻게 반응했는지가 곧 어떤 이야기를 받게 되는지입니다.
          승자 하나를 뽑지 않으므로, 보조 장르의 색감과 콜백 대사까지 이 반응에서 나옵니다.
        </p>
        <div className={s.row}>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={toStory}>
            이 판정으로 이야기 이어보기 →
          </button>
        </div>

        <div className={s.row}>
          <button className={s.btn} onClick={() => window.location.reload()}>한 번 더</button>
          <Link href="/judge-v2" className={s.btn} style={{ textDecoration: "none" }}>판정 대시보드</Link>
          <Link href="/" className={s.btn} style={{ textDecoration: "none" }}>팀 대시보드</Link>
        </div>
      </div>
    </div>
  );
}

function LiveBlend({ live }) {
  return (
    <div className={s.liveBlend}>
      {["H", "R", "C"].map((g) => (
        <div key={g} className={s.liveRow}>
          <span className={s.liveLabel}>{GENRE_LABEL[g]}</span>
          <div className={s.liveTrack}>
            <div className={s.liveFill} style={{ width: `${Math.round((live.scores[g] || 0) * 100)}%` }} />
          </div>
        </div>
      ))}
      <div className={s.liveNote}>사건 {live.n}/6 · 확신 {Math.round(live.confidence * 100)}%</div>
    </div>
  );
}

function ScoreBars({ title, scores }) {
  if (!scores) return null;
  return (
    <>
      <h2>{title}</h2>
      <div className={s.bars}>
        {["R", "H", "C"].map((g) => (
          <div key={g} className={s.barRow}>
            <span className={s.barLabel}>{GENRE_LABEL[g]}</span>
            <div className={s.barTrack}>
              <div className={s.barFill} style={{ width: `${Math.round((scores[g] || 0) * 100)}%` }} />
            </div>
            <span className={s.barVal}>{Math.round((scores[g] || 0) * 100)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}
