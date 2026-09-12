// 대시보드(app/todo/page.jsx)에 쓰는 정적 목록 — 개발 중인 화면·발표 자료.
// 새 페이지를 만들거나 문서를 추가하면 여기에 한 줄 추가하면 됩니다.

// legacy: true 인 항목은 메인 그리드가 아니라 화면 밑 "이전 버전" 접이식
// 섹션에 모아서 보여준다 — V2/신규 버전이 있는 옛 화면이 최신 화면과
// 뒤섞여 스크롤만 길어지는 걸 막기 위함.
export const DEV_SCREENS = [
  {
    group: "관객용 체험 데모",
    items: [
      { href: "/story", tag: "V1 · 기존", tagKind: "old", title: "시나리오 데모", legacy: true,
        desc: "장르 하나로 확정해서 보여주는 이전 버전." },
      { href: "/story-v2", tag: "V2 · 신규", tagKind: "new", title: "시나리오 데모",
        desc: "장르 배합 비율(예: 공포60%+코미디40%) 그대로 보여주는 최신 버전." },
      { href: "/film", tag: "V3 · 실시간 영화", tagKind: "new", title: "반응형 실시간 영화",
        desc: "판정을 한 번으로 끝내지 않고, 관객 반응에 따라 하늘·빛·옆사람·대사가 체험 내내 계속 바뀜." },
      { href: "/story-vr", tag: "실험 · VR", tagKind: "exp", title: "시나리오 데모 (웹 VR)",
        desc: "헤드셋/웹캠 관찰 + 3D 배경. 판정 로직은 V2와 동일." },
      { href: "/demo", tag: "실험", tagKind: "exp", title: "로맨스 LLM 대사 목업", legacy: true,
        desc: "Claude가 즉석 대사를 만드는 별도 프로토타입 (판정 시스템과 미연결)." },
    ],
  },
  {
    group: "판정 확인용 (개발자용)",
    items: [
      { href: "/judge", tag: "V1 · 기존", tagKind: "old", title: "판정 대시보드", legacy: true,
        desc: "장르 하나로 확정되는 점수를 보여주는 이전 버전." },
      { href: "/judge-v2", tag: "V2 · 신규", tagKind: "new", title: "판정 대시보드",
        desc: "3채널 점수와 배합 비율을 실시간 막대그래프로 확인." },
      { href: "/verify", tag: "점검", tagKind: "util", title: "파이프라인 점검",
        desc: "웹캠·음성 인식이 서버까지 잘 도는지 빠르게 확인." },
      { href: "/selftest", tag: "점검", tagKind: "util", title: "브라우저 호환성 점검",
        desc: "이 브라우저에서 음성 분석이 되는지 확인 (팀원 각자 점검)." },
      { href: "/whitebox", tag: "3D", tagKind: "util", title: "화이트박스 (3D 조립)",
        desc: "아트 3D 모델(GLB) 조립·확인. Quest 3 VR 진입 가능." },
    ],
  },
  {
    group: "소재 확인용",
    items: [
      { href: "/vo", tag: "듣기", tagKind: "util", title: "대사 음성(TTS) 듣기",
        desc: "스크립트 v2 대사 46줄 듣기." },
      { href: "/sfx", tag: "듣기", tagKind: "util", title: "효과음 후보 듣기",
        desc: "후보 17개 중 골라 주세요." },
    ],
  },
  {
    group: "운영",
    items: [
      { href: "/upload", tag: "숨김", tagKind: "hidden", title: "파일 올리는 곳",
        desc: "그림·오디오 파일 업로드 (평소엔 메뉴에서 숨김)." },
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
