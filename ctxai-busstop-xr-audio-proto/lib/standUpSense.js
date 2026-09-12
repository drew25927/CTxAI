// 기립 감지 — 헤드셋 높이(Y) 변화로 "벌떡 일어섰는가"를 잡는다. S5(경계) 등급 A 전용
// ("크게 놀라 기립" — 프로젝트개요서 §3 표).
//
// lib/headPoseSense.js는 yaw/pitch·앞뒤(z)만 본다 — 높이(Y)는 별개 관심사라 새 모듈로
// 뺐다. 그쪽 기존 사용처(app/film/page.js 등)는 이 모듈을 안 쓰므로 전혀 영향 없다.
//
// 데스크톱 드래그(OrbitControls)는 카메라 "위치"가 안 바뀌고 회전만 한다 — 그래서 이
// 신호는 실제 헤드셋 세션(WebXR)에서만 의미가 있고, 데스크톱에서는 항상 false다.

const RISE_M = 0.28;          // 이만큼 이상 머리 높이가 오르면 "일어섬" 후보 (잠정치 — 실측 전)
const RISE_WINDOW_SEC = 1.2;  // 이 시간 안에 오르면 "벌떡"(천천히 목을 펴는 것과 구분)
const BASELINE_SEC = 5;       // lib/headPoseSense.js와 같은 기준선 구간

export function createStandUpSensor() {
  let t = 0;
  let baselineY = null;
  const baseSamples = [];
  const recent = []; // 최근 RISE_WINDOW_SEC 안의 {t, y} 표본
  let stoodUp = false;

  /** 매 프레임. y는 미터(카메라 월드 높이), inXR는 실제 헤드셋 세션 여부. */
  function update(y, dt, inXR) {
    t += dt;
    if (!inXR) return stoodUp; // 데스크톱은 대상 아님 — 이미 감지된 값은 유지만 한다

    if (baseSamples.length < 60 && t < BASELINE_SEC) {
      baseSamples.push(y);
      baselineY = baseSamples.reduce((a, b) => a + b, 0) / baseSamples.length;
    }
    if (baselineY == null) baselineY = y;

    recent.push({ t, y });
    while (recent.length && t - recent[0].t > RISE_WINDOW_SEC) recent.shift();

    if (!stoodUp) {
      const minRecentY = Math.min(...recent.map((r) => r.y));
      if (y - minRecentY >= RISE_M && y - baselineY >= RISE_M * 0.8) stoodUp = true;
    }
    return stoodUp;
  }

  return { update, get stoodUp() { return stoodUp; } };
}
