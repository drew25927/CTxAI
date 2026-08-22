"use client";

// 웹캠 입력 — MediaPipe FaceLandmarker 로 원시 샘플을 모은다.
//
// 순수 계산(metricsFrom · judgeFromBehavior · fuseChannels …)은
// lib/behaviorCore.js 에 있고, 이 파일이 그대로 다시 내보낸다.
// 기존 호출부는 변경 없이 이 파일에서 계속 가져다 쓰면 된다.
//
// 근거·설계 배경은 behaviorCore.js 머리말 참고.

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { LANDMARK_IDS, BLENDSHAPE_KEYS, metricsFrom } from "./behaviorCore.js";

export * from "./behaviorCore.js";

const NOSE = 1;
const LEFT_EDGE = 234;
const RIGHT_EDGE = 454;
const FOREHEAD = 10;
const NOSE_BRIDGE = 168;

let landmarkerPromise = null;

function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks("/mediapipe-wasm").then((fileset) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      })
    ).catch(() =>
      FilesetResolver.forVisionTasks("/mediapipe-wasm").then((fileset) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
        })
      )
    );
  }
  return landmarkerPromise;
}


function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 계산에 실제로 쓰는 5개 점의 최소 visibility — 손이 얼굴을 가리면 낮게 나온다.
// 지금은 판정에 쓰지 않고 세션에 기록만 한다 (구현_리스크 §1-2).
function minVisibility(landmarks) {
  const pts = [landmarks[NOSE], landmarks[LEFT_EDGE], landmarks[RIGHT_EDGE], landmarks[FOREHEAD], landmarks[NOSE_BRIDGE]];
  return Math.min(...pts.map((p) => (typeof p?.visibility === "number" ? p.visibility : 1)));
}

function liveSignal(lm) {
  const nose = lm[NOSE], l = lm[LEFT_EDGE], r = lm[RIGHT_EDGE], top = lm[FOREHEAD], bottom = lm[NOSE_BRIDGE];
  if (!nose || !l || !r || !top || !bottom) return null;
  const width = dist(l, r) || 1e-6;
  const height = dist(top, bottom) || 1e-6;
  return {
    dx: (nose.x - (l.x + r.x) / 2) / width,
    dy: (nose.y - (top.y + bottom.y) / 2) / height,
    scale: width,
  };
}

function pickBlendshapes(categories) {
  const out = {};
  if (!categories?.length) return out;
  for (const c of categories) {
    if (BLENDSHAPE_KEYS.includes(c.categoryName)) out[c.categoryName] = Number(c.score.toFixed(4));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 1) I/O — 카메라에서 원시 샘플을 모은다. 판정 계산은 하지 않는다.
// ─────────────────────────────────────────────────────────────

/**
 * durationMs 동안 비디오를 샘플링해 RawSample[] 을 만든다.
 *
 * RawSample = { t, lm: number[]|null, bs: {shape: score}, vis: number }
 *   t   관찰 시작 후 경과 ms
 *   lm  LANDMARK_IDS 순서의 평탄 배열 [x,y,z, x,y,z, ...] · 얼굴 없으면 null
 *   bs  BLENDSHAPE_KEYS 점수
 *   vis 계산에 쓰는 점들의 최소 visibility
 *
 * onTick(live) 는 화면 표시 전용이다 — 여기서 만든 값은 판정에 쓰이지 않는다.
 */
export async function sampleFrames(videoEl, durationMs, onTick, opts = {}) {
  const stride = Math.max(1, opts.stride || 1); // 랜드마크 저장 간격 (파일 크기 조절)
  let landmarker;
  try {
    landmarker = await getLandmarker();
  } catch (e) {
    return { ok: false, reason: "model_load_failed", samples: [], lostMs: 0, durationMs };
  }

  const samples = [];
  const startedAt = performance.now();
  let lastT = 0;
  let lostMs = 0;
  let frameNo = 0;
  let displayBase = null;
  let raf;

  await new Promise((resolve) => {
    function tick() {
      const now = performance.now();
      const elapsed = now - startedAt;
      const frameDelta = elapsed - lastT;
      lastT = elapsed;

      if (videoEl.readyState >= 2) {
        const result = landmarker.detectForVideo(videoEl, now);
        const lm = result?.faceLandmarks?.[0];
        if (lm) {
          if (frameNo % stride === 0) {
            const flat = new Array(LANDMARK_IDS.length * 3);
            for (let i = 0; i < LANDMARK_IDS.length; i++) {
              const p = lm[LANDMARK_IDS[i]];
              flat[i * 3] = Number(p.x.toFixed(4));
              flat[i * 3 + 1] = Number(p.y.toFixed(4));
              flat[i * 3 + 2] = Number(p.z.toFixed(4));
            }
            samples.push({
              t: Math.round(elapsed),
              lm: flat,
              bs: pickBlendshapes(result?.faceBlendshapes?.[0]?.categories),
              vis: Number(minVisibility(lm).toFixed(3)),
            });
          }
          frameNo++;

          // 화면 표시용 — 대충 맞으면 된다. 판정은 metricsFrom() 이 다시 한다.
          const sig = liveSignal(lm);
          if (sig) {
            if (!displayBase && elapsed > 800) displayBase = sig;
            onTick?.({
              faceFound: true,
              dx: displayBase ? sig.dx - displayBase.dx : 0,
              dy: displayBase ? sig.dy - displayBase.dy : 0,
              scaleRatio: displayBase ? sig.scale / displayBase.scale : 1,
            });
          }
        } else {
          samples.push({ t: Math.round(elapsed), lm: null, bs: {}, vis: 0 });
          lostMs += Math.max(0, frameDelta);
          onTick?.({ faceFound: false });
        }
      }

      if (elapsed >= durationMs) { resolve(); return; }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  });
  cancelAnimationFrame(raf);

  return { ok: true, samples, lostMs, durationMs };
}

/**
 * 기존 호출부 호환용 얇은 래퍼 — /judge · /judge-v2 · /story-v2 가 쓴다.
 * 새 코드는 sampleFrames() + metricsFrom() 을 따로 부르는 편이 좋다
 * (원시 샘플을 세션 파일에 남길 수 있으므로).
 */
export async function observe(videoEl, durationMs, onTick) {
  const out = await sampleFrames(videoEl, durationMs, onTick);
  if (!out.ok) return { ok: false, reason: out.reason };
  return {
    ok: true,
    samples: out.samples,
    metrics: metricsFrom(out.samples, { durationMs, lostMs: out.lostMs }),
  };
}
