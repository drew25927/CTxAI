// 도달 가능성 기반 트랙 선택 — "장르 판정"을 "이 관객이 어느 곡선에 도달할 수 있는가"로 통합한다.
//
// 사용자 방향(2026-09-13, 기획 §4.5): 어떤 관객은 공포 곡선을 만족시킬 수 없다(이득이 낮고
// 습관화가 빠르면 아무리 자극해도 봉우리가 상승하지 않는다). 그러면 엔진은 그 관객에게 도달
// 가능한 곡선(코미디·로맨스)으로 간다. "세계가 관객을 읽는다"가 문자 그대로 구현되는 자리다.
//
// 도달 가능성 = 그 트랙 곡선을 목표로 제어기를 돌렸을 때 예측 궤적이 목표에 얼마나 붙는가.
// 제어기가 이미 최선을 다하므로, 남는 오차는 "이 관객에게 그 곡선이 무리인 정도"다.
// 필요하면 헤드포즈에서 온 장르 성향(genrePrior {R,H,C})과 섞는다.

import { runController } from "./slotController.js";

const GENRES = ["R", "H", "C"];
function clamp01(x) { return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; }
const r3 = (x) => Math.round(x * 1000) / 1000;

/** 트랙별 도달 가능성 점수(0~1, 높을수록 잘 맞춘다). */
export function trackReachability(theta) {
  const out = {};
  for (const track of GENRES) {
    const { entries } = runController(track, theta);
    if (!entries.length) { out[track] = 0; continue; }
    let err = 0;
    for (const e of entries) err += Math.abs(e.predTension - e.target);
    out[track] = r3(clamp01(1 - err / entries.length));
  }
  return out;
}

/**
 * 트랙 선택.
 * @param {object} theta  fitViewerModel 결과
 * @param {object} [opts]
 * @param {{R,H,C}} [opts.genrePrior]  헤드포즈에서 온 장르 성향(정규화 불필요, 상대값)
 * @param {number} [opts.priorWeight]  성향 반영 비중 0~1 (기본 0.3)
 * @returns {{track, reach, score, reason}}
 */
export function selectTrack(theta, { genrePrior = null, priorWeight = 0.3 } = {}) {
  const reach = trackReachability(theta);
  const score = {};
  let prior = null;
  if (genrePrior) {
    const sum = GENRES.reduce((a, g) => a + Math.max(0, genrePrior[g] || 0), 0) || 1;
    prior = Object.fromEntries(GENRES.map((g) => [g, Math.max(0, genrePrior[g] || 0) / sum]));
  }
  for (const g of GENRES) score[g] = r3(prior ? (1 - priorWeight) * reach[g] + priorWeight * prior[g] : reach[g]);
  const track = GENRES.slice().sort((a, b) => score[b] - score[a])[0];
  const runnerUp = GENRES.filter((g) => g !== track).sort((a, b) => score[b] - score[a])[0];
  const margin = score[track] - score[runnerUp];
  const reason = `도달가능성 R${reach.R} H${reach.H} C${reach.C}${prior ? ` · 성향 반영(${priorWeight})` : ""} → ${track}${margin < 0.03 ? " (근소)" : ""}`;
  return { track, reach, score, reason };
}
