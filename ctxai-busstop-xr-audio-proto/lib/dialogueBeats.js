// 대사 비트 — 대사 순서는 CSV(Bus/규격/대사양식_v2.csv) 그대로 두고, 줄마다 연출만 덧붙인다.
//
// 배경: 스크립트 v1.1·v2 는 질문 뒤에 "답하면 A, 안 하면 B" 식 약한 갈래를 두었는데(예: R-05 질문 → 답하면 R-06
// "어머, 진짜요?", 안 하면 R-07 "…차도남인가"), CSV 로 옮기면서 두 갈래가 한 줄로 평탄화되어 둘 다 연달아
// 재생됐다 — 인물이 혼자 묻고 혼자 답하는 것처럼 들린 원인. 여기서 갈래를 되살리되, 관객의 답은
// **말이 아니라 고개**(끄덕임·가로젓기·인물 쪽으로 돌림)로만 받는다. 마이크·STT 는 쓰지 않는다.
//
//   to     "self"   혼잣말·연습 — 관객을 보지 않고(정면) 작게 말한다
//          "viewer" 관객을 보며 말한다
//          "ask"    관객에게 묻는다 — 말한 뒤 관객을 보며 wait 초 기다린다
//   gaze   시선 접촉률 덮어쓰기 (0~1). 없으면 to 로 정한다 (self 0.08 · viewer 0.85 · ask 1.0)
//   branch "answered" | "silent" — 직전 질문에 관객이 고개로 응했는지에 따라 둘 중 하나만 재생
//   before / after  이 줄 앞·뒤에 더 두는 쉼(초, 실제 속도). 상태가 정한 침묵(npcSilence) 위에 더해진다
//   wait   ask 뒤 기다리는 시간(초). 기본 2.5
//   vol    음량 배율 (혼잣말은 작게)
//   atBus  272 가 정차하고 문이 열린 뒤에 하는 마지막 말

export const DIALOGUE_V2_BEATS = {
  // 로맨스 (v1.1 §1) — 면접 인사 연습 → 들킴 → 사과 → 질문 → 불안 → 고백 → 응원 부탁
  "R.01": { to: "self", vol: 0.7, before: 2.0 },
  "R.02": { to: "viewer", before: 0.5 },
  "R.03": { to: "self", vol: 0.8, before: 1.5 },
  "R.04": { to: "self", before: 0.2 },
  "R.05": { to: "ask", wait: 3.0, before: 1.2 },
  "R.06": { to: "viewer", branch: "answered" },
  "R.07": { to: "self", branch: "silent", vol: 0.8 },
  "R.08": { to: "viewer", before: 1.5 },
  "R.09": { to: "viewer", before: 0.4 },
  "R.10": { to: "self", vol: 0.7, before: 0.8, after: 4.0 }, // "수다가 뚝 끊긴다"
  "R.11": { to: "ask", wait: 2.5 },
  "R.12": { to: "self", vol: 0.8, before: 1.5 },
  "R.13": { to: "viewer", before: 1.5, after: 1.0 },
  "R.14": { to: "viewer", atBus: true },
  // 공포 (v2 §3) — 정면을 본 채 묻는다 → 처음으로 돌아본다 → 30초 침묵 → 관찰당했음을 의식시킴 → "먼저 가세요"
  "H.01": { to: "self", before: 2.0, after: 2.0 },
  "H.02": { to: "self" },
  "H.03": { to: "ask", wait: 2.5, before: 1.5 },
  "H.04": { to: "viewer" },
  "H.05": { to: "viewer", after: 8.0 }, // "30초. 낙수 소리만 남는다" — 실제 속도 8초, ?scene= 이면 더 늘어난다
  "H.06": { to: "ask", gaze: 0.1, wait: 3.0 }, // 이번엔 관객을 보지 않고 묻는다
  "H.07": { to: "viewer", branch: "answered" },
  "H.08": { to: "self", branch: "silent" },
  "H.09": { to: "self", before: 2.0 },
  "H.10": { to: "ask", wait: 2.5, before: 2.5 },
  "H.11": { to: "viewer", before: 0.6 },
  "H.12": { to: "self", before: 3.0 },
  "H.13": { to: "self", after: 3.0 },
  "H.14": { to: "viewer", atBus: true },
  // 블랙코미디 (v2 §3) — 벤치 아래를 더듬으며 혼잣말 → 질문 → 반복이 애처로워짐 → 포스터 원본 → 버스
  "C.01": { to: "self", before: 1.0 },
  "C.02": { to: "self", before: 1.0 },
  "C.03": { to: "viewer", before: 0.8 },
  "C.04": { to: "self" },
  "C.05": { to: "self" },
  "C.06": { to: "ask", wait: 2.5, before: 0.8 },
  "C.07": { to: "viewer", before: 0.3 }, // 답하든 안 하든 웃는다 — 갈래 없음
  "C.08": { to: "self" },
  "C.09": { to: "self", before: 2.5 },
  "C.10": { to: "viewer", before: 1.0 },
  "C.11": { to: "self", vol: 0.8, before: 3.0 },
  "C.12": { to: "self", vol: 0.8, before: 3.0 },
  "C.13": { to: "self", vol: 0.8, before: 2.5 },
  "C.14": { to: "viewer", before: 3.0 },
  "C.15": { to: "viewer", before: 1.0 },
  "C.16": { to: "viewer" },
  "C.17": { to: "self", vol: 0.8, before: 1.5, after: 2.0 },
  "C.18": { to: "viewer", atBus: true },
};

const GAZE_BY_TO = { self: 0.08, viewer: 0.85, ask: 1.0 };

export function beatOf(line) {
  return DIALOGUE_V2_BEATS[`${line.genre}.${line.seq}`] || { to: "viewer" };
}

export function gazeFor(beat) {
  return beat.gaze ?? GAZE_BY_TO[beat.to] ?? 0.6;
}

// 이 줄을 이번 회차에 재생하는가 — 갈래 줄은 직전 질문의 응답 여부와 맞을 때만
export function playsLine(beat, answered) {
  if (!beat.branch) return true;
  return beat.branch === "answered" ? !!answered : !answered;
}

// 한 회차에 실제로 재생되는 줄 수 (갈래 쌍은 하나로 센다) — 자막의 "n / N줄"
export function playedCount(lines) {
  return lines.reduce((n, l) => n + (beatOf(l).branch === "silent" ? 0 : 1), 0);
}

// 비트가 더하는 쉼의 합(초) — ?scene= 목표 길이에서 빼서 나머지를 줄 사이에 고르게 나눈다
export function beatsTotalSec(lines) {
  return lines.reduce((s, l) => { const b = beatOf(l); return s + (b.before || 0) + (b.after || 0) + (b.to === "ask" ? (b.wait ?? 2.5) : 0); }, 0);
}

// i 번째 줄 다음에 실제로 재생될 줄의 비트 — 갈래가 맞지 않는 줄은 건너뛴다(시간을 쓰지 않는다). 없으면 null
export function nextPlayedBeat(lines, i, answered) {
  for (let j = i + 1; j < lines.length; j++) { const b = beatOf(lines[j]); if (playsLine(b, answered)) return b; }
  return null;
}

// ─── 자막 창과 화자 보기 창(B118) ───────────────────────────────────────────────────────
// 자막은 말이 끝난 뒤(질문이면 기다림 뒤) 읽을 시간만큼만 남기고 지운다. 예전에는 다음 줄이 뜰 때까지 남아서
// (H-05 는 말 2.5초에 자막 11.8초, 마지막 말은 버스가 떠날 때까지 8.8초) 합성 관객이 도로 쪽으로 돌아간 뒤에도
// "자막은 있는데 말하는 사람이 없는" 화면이 줄마다 나왔다 — B21 녹화에서 자막이 떠 있는 표본 중 화자가 화면 안인
// 비율이 38~40% 였다(work/evidence/b118/before.txt).
// 합성 관객이 화자를 보는 창은 자막 창에 맞춘다: 줄이 뜨기 lookLead 초 전(돌아보는 데 걸리는 시간 — 공포형 22°→48° 가
// TALK.rate 2.5 로 약 0.54초)부터 자막이 지워질 때까지. lookLead 는 줄 앞 기다림의 끝 부분을 떼어 쓰므로 대사 속도는 그대로다.
// 숫자는 잠정치(창작값): 초당 12자로 읽는다고 보고, 말이 끝난 뒤 최소 0.7초·최대 2초 남긴다.
export const SUBTITLE_TIMING = Object.freeze({ cps: 12, holdMin: 0.7, holdMax: 2.0, lookLead: 0.6 });

/** 말이 끝난 뒤 자막을 더 남길 초. shownSec = 이미 떠 있던 초(말 + 질문 기다림). 공백은 글자 수에 넣지 않는다. */
export function subtitleHoldSec(text, shownSec = 0) {
  const T = SUBTITLE_TIMING;
  const chars = String(text ?? "").replace(/\s/g, "").length;
  const need = chars / T.cps - Math.max(0, Number(shownSec) || 0);
  return Math.min(T.holdMax, Math.max(T.holdMin, need));
}

/** 줄 앞 기다림 waitSec 을 [그냥 쉬는 초, 화자 쪽을 보며 기다리는 초] 로 나눈다. 기다림이 lookLead 보다 짧으면 전부 보며 기다린다. */
export function splitLead(waitSec, lead = SUBTITLE_TIMING.lookLead) {
  const w = Math.max(0, Number(waitSec) || 0);
  const l = Math.min(w, Math.max(0, Number(lead) || 0));
  return [w - l, l];
}

// ─── 대사를 밟지 않는다(B118) ────────────────────────────────────────────────────────────
// 연출 쪽 소리(제어기의 미세 자극 — 먼 기척)는 옆사람이 말하지 않고, 자막도 없고, 다음 줄을 보러 돌기(lookLead) 전까지
// QUIET_NEED_SEC 이상 조용할 때만 낸다. B118 완주에서 질문 기다림 중(92.4s)이나 줄 사이 1.3초 틈(95.1s)에 울리면 합성 관객이
// −50° 로 돌아서 다음 줄 자막이 떠 있는 동안 화자가 화면 밖이었다. 3초 = 그 틈에서 −50° → 45° 로 돌아오기까지 걸린 2.9초에
// 맞춘 잠정치. 공포 트랙이면 H-05 뒤 8초("낙수 소리만 남는다")처럼 긴 침묵에서 울린다.
export const QUIET_NEED_SEC = 3.0;

/** 줄(beat)이 끝난 뒤 다음 줄을 보러 돌기 전까지 조용한 초 — after + 줄 사이 침묵(gapSec, 버스 앞 줄이면 0) + 다음 줄 before
 *  (다음이 버스 장면이면 도착 7.2초) − lookLead. beat 가 null 이면 장면 첫 줄 앞(after·침묵 없음은 gapSec 0 으로 준다). */
export function silenceAfter(beat, nextBeat, gapSec = 0, lead = SUBTITLE_TIMING.lookLead) {
  const own = (beat?.after || 0) + (beat?.atBus ? 0 : Math.max(0, Number(gapSec) || 0));
  const ahead = nextBeat ? (nextBeat.atBus ? 7.2 : nextBeat.before || 0) : 0;
  return Math.max(0, own + ahead - (nextBeat ? lead : 0));
}

/** 지금(t) 연출 소리를 내도 대사를 밟지 않는가. s = { talking, lookAhead, lookUntil, quietUntil } (페이지의 filmRef 모양). */
export function dialogueQuiet(s, t, need = QUIET_NEED_SEC) {
  if (!s) return true;
  if (s.talking || s.lookAhead) return false;
  if (t < (s.lookUntil ?? -Infinity)) return false;
  return (s.quietUntil ?? Infinity) - t >= need;
}

// ─── 비언어 응답 감시 — 질문 뒤 wait 초 동안 머리 자세만 본다 ───────────────────────────
// 응답으로 치는 것: 끄덕임(앙각 폭 ≥ NOD_DEG), 가로젓기(방위 폭 ≥ SHAKE_DEG 이면서 인물 쪽 반경 안),
// 돌림(질문 시작 땐 인물에서 TURN_FROM_DEG 밖을 보다가 창 안에서 TURN_TO_DEG 안으로 들어옴).
// 임계값은 잠정치 — 헤드셋 파일럿 실측으로 고친다.
export const ANSWER_THRESHOLDS = { NOD_DEG: 7, SHAKE_DEG: 12, SHAKE_WITHIN_DEG: 50, TURN_FROM_DEG: 35, TURN_TO_DEG: 25 };

const angDiff = (a, b) => { let d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };

export function answerWatchStart(yawDeg, pitchDeg, npcAzimuthDeg) {
  return { yawMin: yawDeg, yawMax: yawDeg, pitchMin: pitchDeg, pitchMax: pitchDeg, npcAz: npcAzimuthDeg, awayAtStart: npcAzimuthDeg == null ? false : angDiff(yawDeg, npcAzimuthDeg) > ANSWER_THRESHOLDS.TURN_FROM_DEG, turnedTo: false, shakeNear: true };
}

export function answerWatchUpdate(w, yawDeg, pitchDeg) {
  if (!w) return w;
  w.yawMin = Math.min(w.yawMin, yawDeg); w.yawMax = Math.max(w.yawMax, yawDeg);
  w.pitchMin = Math.min(w.pitchMin, pitchDeg); w.pitchMax = Math.max(w.pitchMax, pitchDeg);
  if (w.npcAz != null) {
    const d = angDiff(yawDeg, w.npcAz);
    if (w.awayAtStart && d <= ANSWER_THRESHOLDS.TURN_TO_DEG) w.turnedTo = true;
    if (d > ANSWER_THRESHOLDS.SHAKE_WITHIN_DEG) w.shakeNear = false;
  }
  return w;
}

export function answerWatchResult(w) {
  if (!w) return { answered: false, how: null };
  const T = ANSWER_THRESHOLDS;
  if (w.pitchMax - w.pitchMin >= T.NOD_DEG) return { answered: true, how: "nod" };
  if (w.turnedTo) return { answered: true, how: "turn" };
  if (w.shakeNear && w.yawMax - w.yawMin >= T.SHAKE_DEG) return { answered: true, how: "shake" };
  return { answered: false, how: null };
}
