// 중간시연(2분20초 MVP) 판정 엔진 — Bus/규격/기다림_정류장_프로젝트개요서.pdf §3·§3-1의
// 등급→점수표와 5개 규칙을 그대로 구현한다.
//
// 이건 lib/directionState.js(반응형 실시간 영화 /film의 연속 블렌딩, "다음 단계"에서 계속 씀)와
// 별개다 — 중간시연은 이산 등급(A~E) 다섯 개를 한 번씩만 관측해서 장르 하나를 확정하는
// 완전히 다른 방식이라, 기존 걸 고치는 대신 새 모듈로 분리했다.
//
// 입력은 센서 원시값이 아니라 이미 등급으로 분류된 값이다 (예: S2를 "A"로 볼지 "B"로 볼지
// 가르는 임계값은 §3-1 규칙⑤대로 실측 전까지 미정 — 그 매핑은 이 모듈의 책임이 아니다).

export const GENRES = ["R", "H", "C"];

// 신호별 등급→점수. 표는 프로젝트개요서 §3 그대로.
// S4의 D(웃음) 칸이 공포 -2인 것 자체가 §3-1 규칙②("웃음 우선 — 웃은 사람을 공포로
// 보내는 최악의 오판 방지")의 구현이다. 별도로 다시 빼지 않는다.
const SCORE_TABLE = {
  S1: {
    A: { R: 3, H: 0, C: 0 }, // 지속 관찰
    B: { R: 1, H: 2, C: 0 }, // 반복 확인
    C: { R: 0, H: 0, C: 1 }, // 한 번 힐끗
    D: { R: 0, H: 0, C: 1 }, // 안 봄
  },
  S2: {
    A: { R: 0, H: 3, C: 0 }, // 크게 놀라 물러남
    B: { R: 1, H: 1, C: 0 }, // 움찔
    C: { R: 1, H: 0, C: 2 }, // 웃음·탄성
    D: { R: 0, H: 0, C: 1 }, // 무반응
  },
  S3: {
    A: { R: 0, H: 0, C: 3 }, // 몸 돌려 읽음(3초+)
    B: { R: 0, H: 0, C: 1 }, // 힐끗
    C: { R: 1, H: 0, C: 0 }, // 안 봄
  },
  S4: {
    A: { R: 3, H: 0, C: 0 }, // 좋아함
    B: { R: 0, H: 2, C: 0 }, // 같이 놀람
    C: { R: 0, H: 2, C: 1 }, // 싫어함
    D: { R: 1, H: -2, C: 2 }, // 웃음
    E: { R: 0, H: 0, C: 1 }, // 무관심
  },
  S5: {
    A: { R: 0, H: 3, C: 0 }, // 크게 놀라 기립
    B: { R: 0, H: 2, C: 0 }, // 기피·움츠림
    C: { R: 1, H: 0, C: 2 }, // 천천히 돌아봄
    D: { R: 1, H: 0, C: 0 }, // 무관심
  },
};

export function scoreSignal(signal, grade) {
  const row = SCORE_TABLE[signal];
  if (!row) throw new Error(`모르는 신호입니다: ${signal}`);
  const cell = row[grade];
  if (!cell) throw new Error(`${signal}에 등급 "${grade}"이 없습니다 (가능: ${Object.keys(row).join(", ")})`);
  return cell;
}

/**
 * observations: { S1: "A", S2: "B", ... } — 다섯 신호 중 관측 못 한 건 생략해도 된다
 * (그 신호는 0점 취급, 다섯 개가 다 없으면 규칙④의 "무반응"으로 처리).
 *
 * 반환: { genre, totals: {R,H,C}, breakdown: [{signal,grade,points}], reason }
 */
export function judge(observations = {}) {
  const observedSignals = Object.keys(SCORE_TABLE).filter((s) => observations[s]);

  // 규칙④ 전반부 — 다섯 신호 전부 관측 실패(=무반응)면 로맨스로 디폴트. 판정 불능은 없다.
  if (observedSignals.length === 0) {
    return { genre: "R", totals: { R: 0, H: 0, C: 0 }, breakdown: [], reason: "무반응 → 로맨스 디폴트" };
  }

  const totals = { R: 0, H: 0, C: 0 };
  const breakdown = observedSignals.map((signal) => {
    const grade = observations[signal];
    const points = scoreSignal(signal, grade);
    totals.R += points.R; totals.H += points.H; totals.C += points.C;
    return { signal, grade, points };
  });

  // 규칙③ — 공포 확정. S2·A(크게 놀라 물러남)와 S5·A(크게 놀라 기립)가 둘 다 나오면
  // 나머지 신호 합산과 무관하게 공포로 즉시 확정한다 ("몸이 두 번 크게 반응한 사람은
  // 의심의 여지가 없다").
  if (observations.S2 === "A" && observations.S5 === "A") {
    return { genre: "H", totals, breakdown, reason: "공포 확정 규칙(S2·A + S5·A)" };
  }

  const max = Math.max(totals.R, totals.H, totals.C);
  const top = GENRES.filter((g) => totals[g] === max);

  // 규칙④ 후반부 — 동점이면 로맨스로 꺾는다.
  if (top.length > 1) {
    return { genre: "R", totals, breakdown, reason: "동점 → 로맨스 디폴트" };
  }

  // 규칙① — 다섯 신호 합산 최고 장르.
  return { genre: top[0], totals, breakdown, reason: "합산 최고 장르" };
}
