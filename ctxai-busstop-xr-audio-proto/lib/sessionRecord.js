"use client";

// 세션 기록기 — 프로브 하네스가 남기는 원시 시계열.
//
// 파일 형식은 JSONL 한 줄 = 한 이벤트. 라인 지향이라 중간이 잘려도 앞부분은
// 읽히고, scripts/replay.mjs 가 그대로 되읽어 판정을 재계산한다.
//
//   {"type":"meta",   sessionId, probeSet, totalMs, …}
//   {"type":"probe",  id, onsetMs, windowMs, azimuth, radius, modality}
//   {"type":"gaze",   t, yaw, pitch}                      ← 판정 주 신호 (방식 B)
//   {"type":"frame",  t, lm:[…], bs:{…}, vis}             ← 웹캠 (표정 + 비교용)
//   {"type":"channels", textScores, voiceScores, transcript}
//   {"type":"label",  selfReport, immersion, noticed, free}
//
// ⚠ 원본 영상은 저장하지 않는다. 랜드마크만 남기면 개인식별성이 훨씬 낮아
//   동의 절차가 가벼워지고, 판정에 필요한 것도 랜드마크뿐이다.

import { PROBES, PROBE_SET_ID, TOTAL_MS } from "./probes.js";

function randomId() {
  const a = new Uint8Array(8);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createRecorder(opts = {}) {
  const sessionId = opts.sessionId || `s_${randomId()}`;
  const lines = [];
  const push = (o) => lines.push(JSON.stringify(o));

  push({
    type: "meta",
    sessionId,
    probeSet: PROBE_SET_ID,
    totalMs: opts.totalMs ?? TOTAL_MS,
    startedAt: new Date().toISOString(),
    ua: navigator.userAgent,
    // 방식 B — 요각과 웹캠 좌표를 둘 다 기록하고 판정은 요각으로 한다.
    // 나중에 "코끝 좌표 휴리스틱이 요각을 얼마나 잘 근사했나" 를 실제로
    // 측정할 수 있게 하려는 것이다.
    judgeSignal: "yaw",
    consent: !!opts.consent,
    note: opts.note || "",
  });
  for (const p of PROBES) {
    push({
      type: "probe", id: p.id, onsetMs: p.onsetMs, windowMs: p.windowMs,
      azimuth: p.azimuth, radius: p.radius, elevation: p.elevation, modality: p.modality,
    });
  }

  let gazeCount = 0;
  let lastGazeT = -1;

  return {
    sessionId,

    /** 매 프레임 — 3D 카메라의 요각·고각. 같은 ms 에 두 번 들어오면 버린다. */
    gaze(t, yaw, pitch) {
      const tt = Math.round(t);
      if (tt === lastGazeT) return;
      lastGazeT = tt;
      gazeCount++;
      push({ type: "gaze", t: tt, yaw: Number(yaw.toFixed(2)), pitch: Number(pitch.toFixed(2)) });
    },

    /** 웹캠 샘플은 관찰이 끝난 뒤 한꺼번에 넣는다 (sampleFrames 반환값). */
    frames(samples) {
      for (const s of samples || []) push({ type: "frame", t: s.t, lm: s.lm, bs: s.bs, vis: s.vis });
    },

    channels(c) { push({ type: "channels", ...c }); },
    label(l) { push({ type: "label", ...l }); },
    event(name, data) { push({ type: "event", name, ...data }); },

    get stats() { return { gazeCount, lines: lines.length }; },

    toJsonl() { return lines.join("\n") + "\n"; },

    /**
     * gzip 해서 Blob 으로. Vercel 함수의 요청 바디 상한(~4.5MB)에 걸리지
     * 않으려면 반드시 압축해서 보내야 한다 — 원본은 1MB 에 육박하고
     * 압축하면 30KB 안팎이다. CompressionStream 이 없는 브라우저는
     * 그냥 원본을 보낸다(서버는 둘 다 받는다).
     */
    async toBlob() {
      const text = this.toJsonl();
      const raw = new Blob([text], { type: "application/x-ndjson" });
      if (typeof CompressionStream === "undefined") return { blob: raw, gzipped: false };
      try {
        const stream = raw.stream().pipeThrough(new CompressionStream("gzip"));
        const blob = await new Response(stream).blob();
        return { blob: new Blob([blob], { type: "application/gzip" }), gzipped: true };
      } catch {
        return { blob: raw, gzipped: false };
      }
    },

    async upload(meta) {
      const { blob, gzipped } = await this.toBlob();
      const form = new FormData();
      form.append("id", sessionId);
      form.append("meta", JSON.stringify({ ...meta, gzipped, sizeBytes: blob.size }));
      form.append("file", blob, `${sessionId}.jsonl.gz`);
      const res = await fetch("/api/session", { method: "POST", body: form });
      return res.json();
    },
  };
}
