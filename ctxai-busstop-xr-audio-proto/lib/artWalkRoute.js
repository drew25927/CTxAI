// 아트팀이 Blender 장면에 직접 그어 둔 우비 인물 동선(WALK_ROUTE_MEASURED_1mps, 총 71.1m)을 /film 좌표(x, z)로 옮긴 것.
// 카페 문(−60.4, −9.6) → 왼쪽 횡단보도로 도로를 건너 → 정류장 뒤편 보행로를 따라 → 쉘터 왼쪽 입구(−2.17, 0.74).
// 원본에서 3m 간격으로 다시 뽑았다. 좌표 변환: (bx − 1.017, 0.54 − by) — components/ArtWorld.jsx WORLD_OFFSET 과 같다.
export const ART_WALK_ROUTE = [
  [-60.41, -9.59],
  [-59.28, -6.86],
  [-57.99, -4.2],
  [-57.34, -1.27],
  [-56.68, 1.65],
  [-56.03, 4.58],
  [-54.82, 6.64],
  [-51.89, 6.01],
  [-48.95, 5.41],
  [-46.0, 4.85],
  [-43.05, 4.32],
  [-40.09, 3.83],
  [-37.12, 3.37],
  [-34.15, 2.95],
  [-31.18, 2.56],
  [-28.2, 2.21],
  [-25.21, 1.89],
  [-22.23, 1.62],
  [-19.24, 1.37],
  [-16.24, 1.17],
  [-13.25, 1.0],
  [-10.25, 0.87],
  [-7.25, 0.77],
  [-4.25, 0.71],
  [-2.17, 0.74],
];

const SEG = (() => {
  const acc = [0];
  for (let i = 1; i < ART_WALK_ROUTE.length; i++) {
    const [ax, az] = ART_WALK_ROUTE[i - 1], [bx, bz] = ART_WALK_ROUTE[i];
    acc.push(acc[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  return acc;
})();
export const ART_WALK_LENGTH = SEG[SEG.length - 1];

/** 동선 위 0~1 지점의 위치와 진행 방향(dx, dz). */
export function pointOnRoute(u) {
  const s = Math.max(0, Math.min(1, u)) * ART_WALK_LENGTH;
  let i = 1;
  while (i < SEG.length - 1 && SEG[i] < s) i++;
  const [ax, az] = ART_WALK_ROUTE[i - 1], [bx, bz] = ART_WALK_ROUTE[i];
  const f = (s - SEG[i - 1]) / Math.max(1e-6, SEG[i] - SEG[i - 1]);
  return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, dx: bx - ax, dz: bz - az };
}
