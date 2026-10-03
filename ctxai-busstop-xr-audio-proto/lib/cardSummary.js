// 체험 카드(/card/<token>) 요약 — 세션 기록 전체가 아니라 카드에 그릴 것만 남긴다.
// 세션 기록에는 머리 움직임·시선 같은 센서 데이터가 들어 있어 공개 주소로 내보내지 않는다.
// 카드가 가진 것: 앉은 인물 장르, 마지막 배합(%), 하늘이 변한 궤적(최대 48점), 사건 표시.

const GENRES = ["R", "H", "C"];
const MAX_POINTS = 48;

export function makeCardSummary(session) {
  const traj = Array.isArray(session?.trajectory) ? session.trajectory : [];
  const step = Math.max(1, Math.ceil(traj.length / MAX_POINTS));
  const points = traj.filter((_, i) => i % step === 0 || i === traj.length - 1).map((p) => ({
    t: Number(p.t) || 0,
    R: Number(p.R) || 0, H: Number(p.H) || 0, C: Number(p.C) || 0,
    settled: Number(p.settled) || 0,
  }));
  const cur = session?.final?.current || {};
  const mix = Object.fromEntries(GENRES.map((g) => [g, Math.round((Number(cur[g]) || 0) * 100)]));
  const events = (Array.isArray(session?.events) ? session.events : [])
    .filter((e) => e?.kind === "event" && e?.name === "event:start" && e?.detail?.name)
    .map((e) => ({ t: Number(e.t) || 0, name: String(e.detail.name).slice(0, 24) }));
  const dominant = GENRES.includes(session?.dominant) ? session.dominant : GENRES.reduce((a, b) => (mix[b] > mix[a] ? b : a), "R");
  return {
    v: 1,
    createdAt: new Date().toISOString(),
    dominant,
    mix,
    durationSec: points.length ? points[points.length - 1].t : 0,
    points,
    events,
  };
}

export const CARD_TOKEN = /^[a-f0-9]{16,32}$/;
