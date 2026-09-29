# 정류장 — 프로젝트 앱 (Next.js)

KAIST CTxAI 캡스톤 7조 <버스 정류장>의 팀 도구이자 체험 프로토타입입니다. 한 저장소 안에
팀 대시보드(할 일·에셋·오디오 듣기)와 관객용 체험 화면이 같이 들어 있습니다.

## 체험 화면 — 어느 것을 열어야 하나

| 주소 | 무엇 | 상태 |
|---|---|---|
| **`/film`** | **반응형 실시간 영화.** 관객이 어디를 보고 어떻게 움직이는지가 체험 내내 하늘·빛·안개·가로등·옆사람의 거리와 시선·대사 간격·BGM·대사 변주를 움직인다. 헤드셋(WebXR)과 데스크톱 드래그 모두 지원 | 2026-09-10 · 현재 기준 |
| `/story-vr` | 관찰 11초 → 판정 1회 → 고정 장면. 3D 그레이박스 + WebXR | 이전 버전 |
| `/story-v2` | 위와 같은 판정에 2D 원화 배경 | 이전 버전 |
| `/story` | 장르 하나를 확정하는 v1 | 구버전 |

`/film` URL 옵션: `?speed=3`(영화 시간 배속) · `?scene=240`(장면 목표 길이 초) · `?cam=0`(웹캠 채널 끄기) · `?hud=0`(HUD 숨김) · `?voice=1`(음성 채널) · `?voicefake=horror`(마이크 대신 샘플) ·
`?rig=0`(리깅 캐릭터 대신 캡슐) · `?fx=0`(후처리·도로 반사 끄기, Quest 성능 점검) · `?pool=1`(대사 변주 풀) · `?bias=H:6`(강제 배합, 발표·QA용 — 정지 관객은 로맨스 증거가 쌓여 6 정도라야 확실히 기운다) · `?rigtest=1`(캐릭터 서기·앉기 점검) ·
`?auto=1`(게이트 없이 1.5초 뒤 자동 시작) · `?gaze=0`(데스크톱 자동 시선 끄기 — 기본은 옆사람이 앉으면 카메라가 오른쪽으로 돈다) ·
`?monitor=1`(디렉터 모니터 — 목표 긴장 곡선 vs 관객 긴장 추정, 관객 응답 모델 θ̂, 다음 자극 추천, 도달 가능 트랙) · `?track=H|R|C`(모니터 목표 트랙 고정) · `?kiosk=1`(전시·녹화용 — "← 대시보드"·"이전 버전" 링크·상단 "처음으로"·세션 JSON 내려받기를 숨긴다. `/interim` 도 같은 옵션으로 두 링크를 숨긴다)

헤드리스 관찰: `scripts/observe.sh shots/run1` 한 줄이 헤드리스 크롬을 띄우고 `/film?auto=1&cam=0` 을 열어 5초마다 PNG·HUD 텍스트(`hud.txt`)를 남긴다(dev 서버 포트는 `FILM_PORT`, 기본 3017).
낱개로는 `node scripts/cdp.mjs open|eval|shot|drag|loop|close` — `drag` 로 고개를 돌리고 `shot` 으로 한 장 찍는다. 탭은 한 번에 하나만(둘이면 fps 가 떨어져 영화 시간이 느려진다).
소리 있는 완주 영상: `node scripts/cdp.mjs record 9224 "http://localhost:3017/film?cam=0" /tmp/film_rec 225 12` → `scripts/assemble-recording.sh /tmp/film_rec out.mp4`. 디자인만 볼 때는 `/film?auto=1&cam=0&bus=1`(정차한 버스)·`?truck=1`·`?rigtest=1`(리그·머리 크기)·`?answer=1`(답함 갈래 강제).

설계와 매핑표, 남은 일은 [`Bus/규격/반응형_실시간_영화.md`](../Bus/규격/반응형_실시간_영화.md).

## 궤적 추종 연출 엔진 + 집중도 트래킹 (2026-09-13)

작가가 트랙별 긴장 곡선을 쓰면, 엔진이 관객마다 다른 반응 동역학을 사건들에서 식별해 자극을 골라 그 곡선을 좇게 한다. 헤드 포즈에서 집중도·탐침 반응·잔움직임을 데이터로 남긴다. 설계·한계는 설계 문서 §8·§9, 기획은 [`../../work/기획_7조_궤적추종연출_20260912_v1.md`](../../work/기획_7조_궤적추종연출_20260912_v1.md).

- 순수 함수 라이브러리(전부 회귀 테스트): `lib/engagementSense.js`(집중도·탐침·잔움직임), `lib/viewerModel.js`(관객 응답 모델 θ), `lib/tensionCurve.js`(곡선·슬롯), `lib/tensionEstimate.js`(긴장 추정 x̂), `lib/slotController.js`(슬롯 MPC), `lib/trackSelect.js`(도달 가능성 트랙 선택).
- `npm test` — 전 모듈 회귀(진단 + 통합 파이프라인 + 경계 조건).
- `npm run sim` — 합성 관객 300명으로 제어 on/off 궤적 분산 비교(H·R·C). 제어 on 이 분산·목표오차를 줄이는지 확인.
- `npm run export:engagement` — `data/sessions/*.json` 을 분석·학습용 CSV 로(`data/engagement_export/`): 세션별 `_raw`·`_windows`·`_stimuli`·`_control`, 전체 `sessions_summary.csv`.
- `/film?monitor=1` — 위 옵션 참고. 세션 종료 시 JSON 에 `engagement`·`control` 로그가 남는다.
- **현재 advisory** — 모니터·로그·시뮬레이션은 동작하지만 실제 자극은 아직 고정이다. 용량별 SFX·근접 트럭·고양이 변형 에셋이 오면 `onCue` 에서 `chooseVariant` 결과를 적용해 실제 제어가 된다.

## 로컬 실행

```bash
npm install
npm run pull-assets   # 팀 대시보드에 올라간 오디오를 public/reactive/audio/ 로 (최초 1회, 이미 커밋돼 있으면 생략)
npm run film          # dev 서버 — 셸에 NODE_ENV·TURBOPACK 이 잡혀 있어도 안전
```

`http://localhost:3000/film`. 헤드폰 권장. 빌드는 `npm run build:clean`, 회귀 테스트는 `npm test`.

`/film`은 외부 서비스 없이 돕니다. 실시간 대사 생성(`/api/dialogue`)·음성 합성(`/api/tts`)·STT와 톤 분석(`/api/mood`, `/api/voicetone`)을 쓸 때만
`.env.local`에 `OPENROUTER_API_KEY` 하나가 필요합니다.

## 구조

```
app/film/                 반응형 실시간 영화 페이지 (디렉터·오디오·대사 루프·HUD·종료 카드)
app/api/session/          세션 기록 저장 (data/sessions/) + 자기보고 일치율 집계
lib/directionState.js     연출 상태 — 증거 누적·완만 추종·정착도·확신도·궤적
lib/directionMap.js       매핑표(온톨로지) — 장르 앵커값, 사건 트리거, BGM 게인
lib/headPoseSense.js      헤드 포즈 센서 — 사건별·창 단위 증거
lib/filmTimeline.js       타임라인 — 다섯 사건과 배우 위치(시간의 순수 함수)
lib/dialoguePool.js       대사 풀 근접 매칭
components/ReactiveStage.jsx  반응형 무대 (BlockoutStage 지형 재사용, 리깅 임시 배우)
public/reactive/audio/    대사 46줄·SFX 18·BGM 3·안내방송 (+ pool/ 변주 138줄)
public/reactive/models/   Meshy 리깅 캐릭터 (meshopt, 5~7MB) · props/ PolyHaven CC0 소품·침엽수 (26MB)
public/reactive/hdri/     PolyHaven CC0 순수 하늘 HDRI 3장 (2k, 13MB)
scripts/blender/          Mixamo FBX → GLB 병합 스크립트 (Blender 헤드리스)
scripts/                  pull-assets · gen-dialogue-pool · sim-headpose · test-direction · synthesize-dialogue(레거시)
```

대시보드·업로드·할 일·조명 프리셋(`/`, `/todo`, `/upload`, `/whitebox`, `/vo`, `/sfx`)은 8월 구조 그대로이며 Supabase를 씁니다.
그쪽은 `ONBOARDING.md`를 보세요.
