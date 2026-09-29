// 관객 응답 모델 — engagementSense 의 탐침 레코드(stimuli[])에서 관객별 저차 동역학
// θ = (이득 g, 지연 L, 회복 시정수 τ, 습관화율 ρ) 를 온라인으로 식별한다.
//
// 이 프로젝트의 기술 주장(궤적 추종 연출)의 첫 조각이다. 선행 기술(Dolby·Warner 특허)은
// 목표를 콘텐츠에 고정하고 현재 오차만 보정할 뿐, 관객별 동역학 모델을 세우지 않는다.
// 여기서는 예정된 자극 몇 개(도입부 다섯 사건)로 그 사람의 반응 모양을 추정한다.
//
// 모델 (자극 k: 용량 d_k, 채널 안 반복 횟수 n_k):
//   반응 크기  r_k ≈ g · d_k · (1−ρ)^{n_k}
//   지연       모든 응답의 시선/움직임 지연 평균 → L
//   회복       모든 응답의 recoverySec 평균 → τ
// r_k(관측)는 정향 세기의 무차원 합(최대 편차·최대 각속도·응시·후퇴)이다.
//
// 식별은 로그 선형 회귀다: y = log(r_k / d_k) = log g + n_k·log(1−ρ).
// 표본이 적으므로(사건 5~6개, 응답은 더 적음) 모집단 사전분포로 수축(shrinkage)한다.
// 사전분포는 파일럿 실측으로 교체한다 — 지금 값은 잠정치.

export const VIEWER_PRIOR = Object.freeze({
  g: 0.6,        // 평균 이득 (무차원 반응 크기 / 용량)
  L: 0.5,        // 평균 시선 지연(초)
  tau: 2.0,      // 평균 회복 시정수(초)
  rho: 0.15,     // 평균 습관화율 (반복마다 반응이 15% 준다)
  // 수축 세기 — 사전분포를 관측 이 개수만큼의 가짜 표본으로 친다. 클수록 사전분포를 더 믿는다.
  kG: 1.5, kL: 1.0, kTau: 1.0, kRho: 2.5,
});

function clamp(x, lo, hi) { return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; }
const r3 = (x) => Math.round(x * 1000) / 1000;

// 반응 크기 가중치(잠정치). probe(순간 사건)는 정향 세기(편차·각속도·후퇴)가 본체이고, track(수십 초
// 추적 사건)은 얼마나 오래 봤는가(응시 비율)가 본체라 편차·각속도 가중을 절반으로 줄인다. track 의
// 순간 지표는 engagementSense 가 겹친 탐침 구간을 가려도 자기 정향 한 번은 남기 때문이다.
export const MAG_WEIGHTS = Object.freeze({
  probe: { peak: 0.5, vel: 0.3, dwell: 0.2, retreat: 0.3 },
  track: { peak: 0.25, vel: 0.15, dwell: 0.6, retreat: 0.15 },
});

/**
 * 탐침 레코드 하나의 관측 반응 크기(무차원, 0 이상). probe 는 정향 세기 위주, track 은 응시 비율 위주.
 * track 의 응시는 지속시간으로 정규화해 긴 사건이 과대평가되지 않게 한다.
 */
export function responseMagnitude(st) {
  if (!st) return 0;
  const dur = Math.max(1, st.dur || 1);
  const peak = (st.peakAmp || 0) / 90;                     // 90° 편차 = 1
  const vel = (st.maxVel || 0) / 200;                       // 200°/s = 1
  const dwell = Math.min(st.lookSec || 0, dur) / dur;       // 지속시간 대비 응시 비율
  const retreat = (st.retreat || 0) / 0.1;                  // 10cm 후퇴 = 1
  const W = st.kind === "track" ? MAG_WEIGHTS.track : MAG_WEIGHTS.probe;
  return Math.max(0, W.peak * peak + W.vel * vel + W.dwell * dwell + W.retreat * retreat);
}

/** 응답으로 볼 수 있는(반응이 있었던) 레코드만. responded 플래그가 있으면 그것도 존중. */
function usableResponses(stimuli) {
  return (stimuli || [])
    .map((st) => ({ st, mag: responseMagnitude(st), dose: st.dose == null ? 1 : Math.max(0.05, st.dose), nth: st.nth || 0 }))
    .filter((x) => x.mag > 1e-3 && (x.st.responded == null || x.st.responded));
}

/**
 * 관객 응답 모델 식별.
 * @param {Array} stimuli  engagementSense report().stimuli
 * @param {object} [prior] VIEWER_PRIOR 덮어쓰기
 * @returns {{g,L,tau,rho,n,nResp,levels,confidence}}
 */
export function fitViewerModel(stimuli, prior = VIEWER_PRIOR) {
  const P = { ...VIEWER_PRIOR, ...prior };
  const resp = usableResponses(stimuli);
  const n = (stimuli || []).length;
  const nResp = resp.length;

  // 지연 L — 시선·움직임 지연의 평균, 사전분포로 수축
  const lat = [];
  for (const { st } of resp) { if (st.lookLatency != null) lat.push(st.lookLatency); else if (st.moveLatency != null) lat.push(st.moveLatency); }
  const L = shrinkMean(lat, P.L, P.kL);

  // 회복 τ — recoverySec 평균, 사전분포로 수축
  const rec = resp.map(({ st }) => st.recoverySec).filter((v) => v != null && v >= 0);
  const tau = shrinkMean(rec, P.tau, P.kTau);

  // 이득 g·습관화 ρ — y = log(mag/dose) = log g + nth·log(1−ρ) 선형 회귀
  const xs = resp.map((x) => x.nth);
  const ys = resp.map((x) => Math.log(x.mag / x.dose));
  let logG = Math.log(P.g), slope = Math.log(1 - P.rho);
  if (ys.length >= 2 && new Set(xs).size >= 2) {
    const fit = linreg(xs, ys);
    // 사전분포와 관측을 표본수로 섞는다
    const wData = ys.length, wG = P.kG, wR = P.kRho;
    logG = (fit.intercept * wData + Math.log(P.g) * wG) / (wData + wG);
    slope = (fit.slope * wData + Math.log(1 - P.rho) * wR) / (wData + wR);
  } else if (ys.length >= 1) {
    // 반복 횟수(nth)가 하나뿐 — 기울기(습관화)는 식별할 수 없으니 사전분포 기울기를 두고 절편만 갱신한다.
    // 예전에는 점이 정확히 하나일 때만 갱신해서, 같은 nth 에서 두 번 이상 반응한 관객(/interim 의 개구리·우비 인물은 둘 다 채널 첫 사건)은
    // g 가 사전값 0.6 그대로 남았다 — 카드 지문이 사전값 문장이 된 원인(B147).
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    logG = ((my - slope * mx) * ys.length + Math.log(P.g) * P.kG) / (ys.length + P.kG);
  }
  const g = clamp(Math.exp(logG), 0.02, 5);
  const rho = clamp(1 - Math.exp(slope), -0.9, 0.95);

  // 확신도 — 응답 수가 많고 nth 분산이 있을수록 높다. levels = 응답이 걸친 nth 가짓수(2 미만이면 ρ 는 사전값 그대로다)
  const levels = new Set(xs).size;
  const confidence = clamp(nResp / 5, 0, 1) * (levels >= 2 ? 1 : 0.5);

  return { g: r3(g), L: r3(L), tau: r3(tau), rho: r3(rho), n, nResp, levels, confidence: r3(confidence) };
}

/** 자극 하나에 대한 예측 반응 크기. */
export function predictResponse(theta, { dose = 1, nth = 0 } = {}) {
  const d = dose == null ? 1 : Math.max(0.05, dose);
  return Math.max(0, theta.g * d * Math.pow(1 - theta.rho, nth));
}

/** 목표 반응 크기 target 을 내려면 용량이 얼마여야 하는가 (경계 [0,1]로 자름). */
export function doseForTarget(theta, target, nth = 0, doseMax = 1) {
  const denom = theta.g * Math.pow(1 - theta.rho, nth);
  if (!(denom > 1e-6)) return doseMax;
  return clamp(target / denom, 0, doseMax);
}

// --- 보조 ---
function shrinkMean(vals, prior, k) {
  if (!vals.length) return r3(prior);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return r3((m * vals.length + prior * k) / (vals.length + k));
}
function linreg(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx > 1e-9 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx };
}
