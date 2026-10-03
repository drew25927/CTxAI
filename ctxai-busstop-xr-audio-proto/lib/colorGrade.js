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

const v3 = (r, g, b) => [r, g, b];

export const GRADES = {
  // 판정 전(정착 0) — 디폴트 컨셉: 어둡고 차가운 청회색, 포인트만 따뜻한 호박색
  D: { exposure: 1.0, saturation: 0.78, shadow: v3(0.012, 0.034, 0.05), highlight: v3(0.03, 0.012, -0.012), greenShift: 0.8, greenDesat: 0.3, hazeColor: v3(0.52, 0.6, 0.66), hazeAmount: 0.55 },
  // 로맨스 — 따뜻한 주황·분홍, 그림자는 연한 자주
  R: { exposure: 0.84, saturation: 0.88, shadow: v3(0.04, 0.012, 0.03), highlight: v3(0.06, 0.026, -0.02), greenShift: 0.35, greenDesat: 0.1, hazeColor: v3(0.82, 0.6, 0.57), hazeAmount: 0.45 },
  // 공포 — 어둡고 올리브 톤: 나뭇잎 초록은 그대로 두고 그림자만 어둡게 눌러 준다
  H: { exposure: 0.9, saturation: 0.88, shadow: v3(0.0, 0.026, 0.012), highlight: v3(0.018, 0.034, 0.0), greenShift: 0.0, greenDesat: 0.12, hazeColor: v3(0.34, 0.4, 0.34), hazeAmount: 0.5 },
  // 블랙코미디 — 청-보라 바탕에 호박색 포인트
  C: { exposure: 0.92, saturation: 0.82, shadow: v3(0.03, 0.02, 0.06), highlight: v3(0.05, 0.03, 0.0), greenShift: 0.65, greenDesat: 0.25, hazeColor: v3(0.6, 0.58, 0.72), hazeAmount: 0.5 },
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
