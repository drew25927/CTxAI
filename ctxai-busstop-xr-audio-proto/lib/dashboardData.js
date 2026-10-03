// 대시보드(app/todo/page.jsx)에 쓰는 정적 목록 — 개발 중인 화면·발표 자료.
// 새 페이지를 만들거나 문서를 추가하면 여기에 한 줄 추가하면 됩니다.

// legacy: true 인 항목은 메인 그리드에 안 나오고 화면 맨 밑 접힌 "숨긴 화면"에만 나온다(2026-10-03: 현재 버전만 보이게).
// 주소로 직접 들어가면 그대로 열린다 — 지운 게 아니라 숨긴 것.
export const DEV_SCREENS = [
  {
    group: "체험 화면 (현재 버전)",
    items: [
      { href: "/film", tag: "현재 · 실시간 영화", tagKind: "new", title: "반응형 실시간 영화",
        desc: "아트팀 장면(숲·도로·쉘터·카페) 위에서, 관객 반응에 따라 하늘·빛·옆사람·대사가 체험 내내 계속 바뀜." },
      { href: "/interim", tag: "현재 · 11/7 시연", tagKind: "new", title: "중간시연 (2분 20초)",
        desc: "머리 방향·웹캠 표정·마이크 5신호로 로맨스·공포·블랙코미디를 판정하는 발표용 데모." },
    ],
  },
  {
    group: "점검 (현재)",
    items: [
      { href: "/facecheck", tag: "필수 · 점검", tagKind: "util", title: "웹캠 표정 인식 확인",
        desc: "공포·웃음 등 표정 판정이 맞는지 팀원 각자 체크 — 기록이 쌓여 정확도로 집계됨." },
    ],
  },
  // 아래는 숨김 — 대시보드에선 맨 아래 접힌 "숨긴 화면"에만 나온다(주소로는 그대로 열림).
  {
    group: "숨김",
    items: [
      { href: "/story", tag: "V1", tagKind: "old", title: "시나리오 데모", legacy: true, desc: "장르 하나로 확정해서 보여주는 첫 버전." },
      { href: "/story-v2", tag: "V2", tagKind: "old", title: "시나리오 데모", legacy: true, desc: "장르 배합 비율 + 원화 25장." },
      { href: "/story-vr", tag: "실험 · VR", tagKind: "exp", title: "시나리오 데모 (웹 VR)", legacy: true, desc: "헤드셋/웹캠 관찰 + 3D 그레이박스." },
      { href: "/demo", tag: "실험", tagKind: "exp", title: "로맨스 LLM 대사 목업", legacy: true, desc: "즉석 대사 생성 프로토타입." },
      { href: "/judge", tag: "V1", tagKind: "old", title: "판정 대시보드", legacy: true, desc: "장르 하나로 확정되는 점수." },
      { href: "/judge-v2", tag: "V2", tagKind: "old", title: "판정 대시보드", legacy: true, desc: "3채널 점수·배합 비율." },
      { href: "/verify", tag: "점검", tagKind: "util", title: "파이프라인 점검", legacy: true, desc: "웹캠·음성 인식이 서버까지 도는지." },
      { href: "/selftest", tag: "점검", tagKind: "util", title: "브라우저 호환성 점검", legacy: true, desc: "이 브라우저에서 음성 분석이 되는지." },
      { href: "/whitebox", tag: "3D", tagKind: "util", title: "화이트박스 (3D 조립)", legacy: true, desc: "3D 모델 조립·조명 프리셋." },
      { href: "/vo", tag: "듣기", tagKind: "util", title: "대사 음성(TTS) 듣기", legacy: true, desc: "대사 46줄." },
      { href: "/sfx", tag: "듣기", tagKind: "util", title: "효과음 후보 듣기", legacy: true, desc: "후보 17개." },
      { href: "/upload", tag: "운영", tagKind: "hidden", title: "파일 올리는 곳", legacy: true, desc: "그림·오디오 파일 업로드." },
    ],
  },
];

export const REPORTS = [
  { href: "/onepager.html", external: true, title: "중간 발표 원페이지",
    desc: "지금까지 한 것 · 구현 중인 기술 · 최종 결과물 예시를 한 장으로 정리." },
  { href: "/guide?doc=tech-direction", title: "기술 발전 방향",
    desc: "지금 만드는 기술이 어디에 해당하고, 앞으로 어떻게 발전시킬지 정리한 문서." },
  { href: "/guide?doc=judgment-criteria", title: "판정 기준",
    desc: "행동·텍스트·음성 3채널을 어떻게 점수로 바꾸고 합치는지, 알려진 한계와 잠정치." },
  { href: "/guide?doc=implementation-risks", title: "구현 리스크 · 지원 필요사항",
    desc: "연속 블렌딩으로 갈 때 생기는 기술적 문제와, 팀 밖에서 지원받아야 할 것." },
  { href: "/guide?doc=role-reassignment", title: "역할별 재분장",
    desc: "방향이 바뀌면서 기획·아트·사운드·개발이 지금 뭘 해야 하는지 쉬운 설명과 함께 정리." },
];

// 체크리스트로는 안 잡히는 굵직한 진행 — git 커밋 로그에서 자동 생성됩니다.
// 수동으로 고치지 마세요: `npm run milestones`(레포 루트, git 있는 곳에서)를 실행하면
// scripts/gen-milestones.mjs 가 lib/milestones.generated.json 을 다시 씁니다.
import generated from "./milestones.generated.json";
export const MILESTONES = generated;
