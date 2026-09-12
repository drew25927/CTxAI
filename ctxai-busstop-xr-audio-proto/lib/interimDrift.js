// 세계 드리프트 — 중간시연 스펙(기다림_정류장_프로젝트개요서.pdf §4) 그대로.
// 신호 판독 후 6초 지연, 선두 장르 쪽으로 12%→24%→36%→45%→50% 누적, 판정 확정 시
// 4초에 걸쳐 100%로 스냅한다.
//
// lib/directionState.js(반응형 실시간 영화 /film의 지수 추종·증거 누적, "다음 단계"에 남는
// 버전)와는 다른 훨씬 단순한 계단식 구현이다 — 다만 components/ReactiveStage.jsx가 실제로
// 읽는 모양(st.current:{R,H,C}, st.settled, st.elapsed)만 똑같이 맞춰서, ReactiveStage를
// 고치지 않고 그대로 재사용할 수 있게 했다.

const GENRES = ["R", "H", "C"];
const STEP_PCT = [0.12, 0.24, 0.36, 0.45, 0.50]; // 신호 1~5개째 판독 후 누적 목표
const STEP_DELAY_SEC = 6;
const SNAP_DURATION_SEC = 4;

function vectorFor(genre, pct) {
  const neutral = 1 / 3;
  const v = { R: neutral, H: neutral, C: neutral };
  if (!genre) return v;
  for (const g of GENRES) v[g] = neutral + ((g === genre ? 1 : 0) - neutral) * pct;
  return v;
}

export function createInterimDrift() {
  const st = {
    current: { R: 1 / 3, H: 1 / 3, C: 1 / 3 },
    settled: 0,
    elapsed: 0,
    phase: "idle",
    leadingGenre: null,
    finalGenre: null,
  };
  let stepIndex = 0;        // 지금까지 반영된 신호 개수(0~5)
  let pendingStepAt = null; // 다음 단계가 반영될 시각
  let snapStartAt = null;
  let snapTarget = null;

  // 신호 하나를 판독했다고 알린다. leadingGenre는 그 시점까지의 부분 합산 선두
  // (lib/interimJudge.js의 judge(partialObservations).genre를 페이지가 넘겨준다).
  function readSignal(leadingGenre) {
    if (stepIndex >= STEP_PCT.length) return;
    st.leadingGenre = leadingGenre;
    if (pendingStepAt == null) pendingStepAt = st.elapsed + STEP_DELAY_SEC;
  }

  // 판정 확정 — 4초에 걸쳐 100%로 스냅.
  function finalize(genre) {
    st.finalGenre = genre;
    st.leadingGenre = genre;
    snapStartAt = st.elapsed;
    snapTarget = genre;
    st.phase = "snapping";
  }

  function tick(dt) {
    if (!(dt > 0)) return st;
    st.elapsed += dt;

    if (snapStartAt != null) {
      const startPct = STEP_PCT[Math.max(0, stepIndex - 1)] ?? 0;
      const p = Math.min(1, (st.elapsed - snapStartAt) / SNAP_DURATION_SEC);
      st.settled = startPct + (1 - startPct) * p;
      st.current = vectorFor(snapTarget, st.settled);
      if (p >= 1) st.phase = "settled";
      return st;
    }

    if (pendingStepAt != null && st.elapsed >= pendingStepAt && stepIndex < STEP_PCT.length) {
      stepIndex += 1;
      pendingStepAt = null;
      st.phase = `step${stepIndex}`;
    }
    st.settled = stepIndex > 0 ? STEP_PCT[stepIndex - 1] : 0;
    st.current = vectorFor(st.leadingGenre, st.settled);
    return st;
  }

  return { st, readSignal, finalize, tick };
}
