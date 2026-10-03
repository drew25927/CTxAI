// 아트팀 최종 원화(Bus/ArtWork_Final, 25장)를 웹용 JPEG로 줄여 둔 public/story/art/ 의 컷 목록.
// 파일명: <장르>-<번호>.jpg — D=디폴트, R=로맨스, H=공포, C=코미디. 번호는 원본 파일명 앞 숫자.
//
// 배경으로 쓸 수 있는 "장면" 컷과, 흰 배경 위에 그린 "시트"(턴어라운드·의상 클로즈업)는 쓰임이 달라
// 나눠 둔다 — 시트를 전체 화면 배경으로 깔면 흰 종이가 보인다.
//   장면: 전체뷰(01)·메인뷰(02)·사이드뷰(03)·캐릭터 마스터숏(04) — 디폴트는 04=트럭, 06=고양이
//   시트: 클로즈업(05)·전신(06) — 디폴트는 05=트럭, 07=고양이 턴어라운드

const p = (g, n) => `/story/art/${g}-${String(n).padStart(2, "0")}.jpg`;

export const ART = {
  // 게이트·관찰 단계(장르 확정 전). 04 트럭/06 고양이는 /interim의 S2·S4 사건 장면과 같은 소재다.
  D: {
    gate: p("D", 1),
    observe: [p("D", 2), p("D", 3), p("D", 4), p("D", 6)],
    sheets: [p("D", 5), p("D", 7)],
  },
  // 공개 단계 — 대사가 진행될수록 전체 → 메인 → 옆 → 인물 순으로 다가간다(원본 번호 순서).
  R: { scenes: [p("R", 1), p("R", 2), p("R", 3), p("R", 4)], sheets: [p("R", 5), p("R", 6)] },
  H: { scenes: [p("H", 1), p("H", 2), p("H", 3), p("H", 4)], sheets: [p("H", 5), p("H", 6)] },
  C: { scenes: [p("C", 1), p("C", 2), p("C", 3), p("C", 4)], sheets: [p("C", 5), p("C", 6)] },
};

/** 대사 진행도(index/전체 줄 수)에 맞는 장면 컷. */
export function sceneForProgress(genre, index, total) {
  const scenes = ART[genre]?.scenes || [];
  if (!scenes.length) return null;
  const i = Math.min(scenes.length - 1, Math.floor((index / Math.max(1, total)) * scenes.length));
  return scenes[i];
}

export const ALL_ART_URLS = Object.values(ART).flatMap((g) =>
  [g.gate, ...(g.observe || []), ...(g.scenes || []), ...(g.sheets || [])].filter(Boolean)
);
