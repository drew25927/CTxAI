"use client";

// 마이크 — 웃음·탄성·비명(S2·S4의 보조 신호, 프로젝트개요서 §3 센서표). 짧은 녹음 하나 안에서
// 소리가 "한 번 크게 튀는지"(탄성·비명 — S2)와 "여러 번 반복해서 튀는지"(웃음 — S4)를
// 대략 구분한다.
//
// lib/voiceProsody.js가 이미 하는 프레임 단위 RMS 계산 방식을 그대로 재사용했다 — 다만
// voiceProsody는 "대사에 담긴 톤"을 LLM에 물어보는 것이고, 여기는 "짧은 순간 소리가 몇 번
// 튀었는가"만 세는 훨씬 단순한 신호라 모델 호출 없이 처리한다.
//
// 검증된 음향 모델이 아니라 잠정 휴리스틱이다 — lib/voiceProsody.js의 폴백과 같은 성격으로,
// 프로젝트개요서 §3-1 규칙⑤(임계값은 실측)가 이 파일에도 그대로 적용된다.

const FRAME_SEC = 0.05;

/** data: Float32Array(모노 PCM, -1~1), sampleRate: Hz. 순수 함수 — 테스트하기 쉽게 분리. */
export function analyzeBurstFromSamples(data, sampleRate) {
  const frameSize = Math.max(1, Math.floor(sampleRate * FRAME_SEC));
  const frames = [];
  for (let i = 0; i + frameSize <= data.length; i += frameSize) {
    let sumSq = 0;
    for (let j = i; j < i + frameSize; j++) sumSq += data[j] * data[j];
    frames.push(Math.sqrt(sumSq / frameSize));
  }
  if (!frames.length) return { loud: 0, burstCount: 0 };

  const peak = Math.max(...frames);
  const threshold = Math.max(peak * 0.5, 0.05); // 최고점의 절반 이상, 최소 바닥값
  let burstCount = 0, above = false;
  for (const rms of frames) {
    if (rms >= threshold) { if (!above) burstCount++; above = true; }
    else above = false;
  }
  return { loud: Math.min(1, peak / 0.15), burstCount }; // 0.15는 잠정 상한 — 실측 전까지
}

export async function analyzeMicBurst(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const result = analyzeBurstFromSamples(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
    ctx.close?.();
    return result;
  } catch {
    return { loud: 0, burstCount: 0 };
  }
}

/** stream: getUserMedia({audio:true}) 스트림. ms 동안 녹음해서 Blob으로 돌려준다. */
export function recordClip(stream, ms) {
  return new Promise((resolve) => {
    const chunks = [];
    let rec;
    try {
      rec = new MediaRecorder(stream);
    } catch {
      resolve(null);
      return;
    }
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    rec.onerror = () => resolve(null);
    rec.start();
    setTimeout(() => { try { rec.stop(); } catch { resolve(null); } }, ms);
  });
}
