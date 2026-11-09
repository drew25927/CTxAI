// /film?rec=1 — 쇼케이스 제출용 4K 녹화 (2026-11-09).
//
// 화면 녹화로는 4K가 안 나온다(작업 Mac 화면 2560×1664). 그래서 캔버스를 3840×2160으로 직접 렌더하고
// canvas.captureStream + MediaRecorder 로 찍는다. 소리는 <audio> 요소마다 createMediaElementSource 로
// 녹화 트랙과 스피커 양쪽에 연결한다. 조각은 2초마다 /api/capture 로 보내 디스크에 이어 붙인다.
// DOM 위에 그리는 자막·HUD 는 캔버스 밖이라 녹화되지 않는다 — 자막은 편집에서 넣는다.

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.640033,mp4a.40.2", // H.264 High@5.1 — 4K 가능 레벨
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/webm;codecs=vp9,opus",
  "video/webm",
];

export function createFilmRecorder({ name, fps = 30, videoBitsPerSecond = 40_000_000 }) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const dest = ctx.createMediaStreamDestination();
  const tapped = new WeakSet();
  let rec = null;
  let seq = 0;
  let upload = Promise.resolve();
  let ext = "webm";
  let bytes = 0;
  // 창이 가려지면 캔버스 프레임이 멈춰 영상이 소리보다 짧아진다(2026-11-09 시험: 영상 112초 / 소리 168초) — 몇 번 가려졌는지 남긴다
  let hiddenCount = 0;
  const onVis = () => { if (document.hidden) hiddenCount++; };

  // 소리 요소 하나를 녹화 트랙 + 스피커로. 요소의 volume 은 소스 노드 앞에서 그대로 먹는다.
  function tap(audioEl) {
    if (!audioEl || tapped.has(audioEl)) return;
    tapped.add(audioEl);
    const src = ctx.createMediaElementSource(audioEl);
    src.connect(dest);
    src.connect(ctx.destination);
  }

  function start(canvas) {
    ctx.resume();
    const mimeType = MIME_CANDIDATES.find((m) => window.MediaRecorder?.isTypeSupported(m)) || "";
    ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond, audioBitsPerSecond: 256_000 });
    const file = `${name}.${ext}`;
    rec.ondataavailable = (e) => {
      if (!e.data?.size) return;
      const n = seq++;
      bytes += e.data.size;
      // 순서대로 올린다 — 첫 조각(n=0)은 파일을 새로 만든다
      upload = upload.then(() => fetch(`/api/capture?file=${encodeURIComponent(file)}&seq=${n}`, { method: "POST", body: e.data })).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    rec.start(2000);
    return { file, mimeType, width: canvas.width, height: canvas.height };
  }

  function stop() {
    return new Promise((resolve) => {
      if (!rec || rec.state === "inactive") { resolve({ bytes }); return; }
      document.removeEventListener("visibilitychange", onVis);
      rec.onstop = () => { upload.then(() => resolve({ bytes, chunks: seq, hiddenCount })); };
      rec.stop();
    });
  }

  return { tap, start, stop, get state() { return rec?.state || "idle"; } };
}
