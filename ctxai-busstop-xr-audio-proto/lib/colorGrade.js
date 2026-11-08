// 컨셉 이미지의 색 분위기를 3D 화면에 입히는 색 보정값 — components/ColorGrade.jsx 가 후처리로 적용한다.
//
// 근거(2026-10-03, public/story/art/ 컨셉 이미지 vs /film 화면의 밝기·색조 분포 측정):
//   디폴트 컨셉(D-01~03): 평균 밝기 0.46, 청회색(210~240°) 41~60% + 청록(180~210°) 12~17%, 따뜻한 주황은 5~15% 포인트
//   로맨스(R-02): 밝기 0.56, 따뜻한 주황 74%   공포(H-02): 밝기 0.15, 올리브 노랑-초록 51%
//   블랙코미디(C-02): 밝기 0.46, 청-보라 67% + 따뜻한 주황 10%
//   3D(로맨스 장면 한 장): 밝기 0.63(더 밝음), 노랑-초록 나뭇잎 8%, 하늘이 파랑·자주 46%(컨셉 R 은 주황)
//   3D(디폴트 장면, 보정 전): 밝기 0.46(이미 컨셉 수준 — 노출을 더 낮추면 0.35로 너무 어두워져 1.0 으로 둠), 채도 0.28(컨셉 0.19),
//     황금빛 나뭇잎(30~60°)이 20%(컨셉은 거의 0) — 보정 후 5%로 줄고 초록·청록으로 이동
// 채도는 이미 비슷했다 — 어긋난 건 "어떤 색이 어디에 쓰이느냐"와 밝기여서, 채도 전체를 건드리지 않고
// 노출·그림자/하이라이트 색조·나뭇잎 색(노랑-초록 → 청록)·먼 곳의 푸른 대기만 보정한다.
// 색 분위기만 맞추는 것이 목표다 — 3D의 선명함·윤곽은 그대로.
//
// 값은 "컨셉 쪽으로 옮기는 방향"의 초기값이다. ?grade=0(끔)~1(기본)~1.5 로 세기를 바꿔 비교한다.
// 2026-11-08: 장르 셋(R·H·C)은 컨셉 이미지 대신 아트 V13 최종 렌더 48컷 기준으로 다시 맞췄다(아래 GRADES 주석).

const v3 = (r, g, b) => [r, g, b];

export const GRADES = {
  // 판정 전(정착 0) — 디폴트 컨셉: 어둡고 차가운 청회색, 포인트만 따뜻한 호박색 (10/3 값 유지 — 3D 화면 기준으로 맞춘 기준점)
  D: { exposure: 1.0, saturation: 0.78, shadow: v3(0.012, 0.034, 0.05), highlight: v3(0.03, 0.012, -0.012), greenShift: 0.8, greenDesat: 0.3, hazeColor: v3(0.52, 0.6, 0.66), hazeAmount: 0.55 },
  // 아래 셋은 2026-11-08 아트 V13 최종 렌더 48컷(장르별 12방향)에 맞춰 다시 잡았다 — 디폴트 대비 차이만큼 D 에서 옮긴다.
  //   밝기·채도: 렌더 비율의 제곱근(앱의 장르 조명이 이미 밝기를 바꾸므로 절반만), 그림자·하이라이트 색조: 렌더의
  //   어두운/밝은 20% 평균색 차이 그대로, 먼 대기색: 렌더 위 1/3 평균색의 디폴트 대비 비율. 나뭇잎 색(greenShift)은 렌더의 주 색상대로.
  // 로맨스 — 렌더: 밝기 ×1.19, 채도 ×1.8, 주황 93%, 그림자·하이라이트 모두 주황, 복숭아빛 대기 (이전 값은 디폴트보다 어두웠다)
  R: { exposure: 1.09, saturation: 1.05, shadow: v3(0.061, 0.027, 0.008), highlight: v3(0.089, 0.001, -0.06), greenShift: 0.0, greenDesat: 0.0, hazeColor: v3(0.78, 0.72, 0.69), hazeAmount: 0.45 },
  // 공포 — 렌더: 밝기 ×0.61, 채도 ×2.3, 청록 98%, 청록 그림자·하이라이트, 짙은 청록 대기 (이전엔 올리브였다)
  H: { exposure: 0.78, saturation: 1.19, shadow: v3(-0.017, 0.039, 0.074), highlight: v3(-0.061, 0.045, 0.046), greenShift: 1.0, greenDesat: 0.0, hazeColor: v3(0.2, 0.34, 0.4), hazeAmount: 0.6 },
  // 블랙코미디 — 렌더: 밝기 ×1.17, 채도 ×0.82, 노랑-초록 68%, 누런 그림자, 회녹색 대기 (이전엔 청-보라였다)
  C: { exposure: 1.08, saturation: 0.7, shadow: v3(0.012, 0.045, 0.039), highlight: v3(0.02, 0.028, -0.018), greenShift: 0.0, greenDesat: 0.15, hazeColor: v3(0.55, 0.66, 0.66), hazeAmount: 0.5 },
};

const KEYS = ["exposure", "saturation", "greenShift", "greenDesat", "hazeAmount"];
const VEC = ["shadow", "highlight", "hazeColor"];

/** 연출 상태(현재 배합 R/H/C, 정착도)로 네 보정값을 섞는다. 정착 전엔 디폴트(D), 굳을수록 장르 쪽. */
export function blendGrade(current, settled) {
  const s = Math.max(0, Math.min(1, settled ?? 0));
  const w = { D: 1 - s, R: (current?.R ?? 0) * s, H: (current?.H ?? 0) * s, C: (current?.C ?? 0) * s };
  const sum = w.D + w.R + w.H + w.C || 1;
  const out = {};
  for (const k of KEYS) out[k] = Object.keys(w).reduce((a, g) => a + (w[g] / sum) * GRADES[g][k], 0);
  for (const k of VEC) out[k] = [0, 1, 2].map((i) => Object.keys(w).reduce((a, g) => a + (w[g] / sum) * GRADES[g][k][i], 0));
  return out;
}
