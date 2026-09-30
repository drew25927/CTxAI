# 정류장 — 프로젝트 앱 (Next.js)

KAIST CTxAI 캡스톤 7조 <버스 정류장>의 팀 도구이자 체험 프로토타입입니다. 한 저장소 안에
팀 대시보드(할 일·에셋·오디오 듣기)와 관객용 체험 화면이 같이 들어 있습니다.

## 체험 화면 — 어느 것을 열어야 하나

| 주소 | 무엇 | 상태 |
|---|---|---|
| **`/film`** | **반응형 실시간 영화.** 관객이 어디를 보고 어떻게 움직이는지가 체험 내내 하늘·빛·안개·가로등·옆사람의 거리와 시선·대사 간격·BGM·대사 변주를 움직인다. `?control=1` 을 붙이면 궤적 추종 연출 엔진이 관객마다 개구리·고양이 변형과 판정 뒤 미세 자극·연속 조정을 실제로 몬다(아래 절). 헤드셋(WebXR)과 데스크톱 드래그 모두 지원 | 2026-09-30 · 현재 기준 |
| **`/interim`** | **중간시연 MVP(2분 20초).** 다섯 신호(S1 관심 · S2 놀람 · S3 호기심 · S4 정서 · S5 경계)를 헤드 포즈·웹캠 표정·마이크·기립으로 판정한다. 팀 판정 로직은 그대로이고, 그 위에 디렉터 모니터(`?monitor=1`)·합성 관객(`?viewer=`)·종료 카드가 얹혀 있다. 다섯 사건은 누구에게나 같고(중립 탐침), 판정 뒤 인사 구간(1:58~2:20)의 옆사람 거리·걸어오는 시간·인사 시각·시선만 관객 응답 모델 θ̂ 로 관객마다 다르다(`?adapt=0` 이면 끔) | 2026-09-26 · 팀 기준 · 판정 뒤 연출 2026-09-30 |
| `/film/compare` | **관객 두 명 비교 화면.** `data/sessions/` 의 세션 둘(`?a=&b=`)을 나란히 놓는다. 같은 URL 의 제어 ON/OFF, 또는 같은 다섯 사건을 본 두 관객. 반응 지문·배합 그래프·x̂ 곡선·세 값. 머리글은 두 판정과 배합 궤적이 갈라진 시각을 적고, 갈라지지 않은 쌍(제어 ON/OFF)은 x̂ 평균 차이·가장 벌어진 순간·조건 차이를 적는다 | 심사·전시용 |
| `/facecheck` | 웹캠 표정 자가진단(무표정·공포·웃음). 팀원이 판정이 맞았는지 체크해 기록을 쌓는다 | 팀 도구 |
| `/story-vr` | 관찰 11초 → 판정 1회 → 고정 장면. 3D 그레이박스 + WebXR | 이전 버전 |
| `/story-v2` | 위와 같은 판정에 2D 원화 배경 | 이전 버전 |
| `/story` | 장르 하나를 확정하는 v1 | 구버전 |

### `/film` URL 옵션

- **재생·화면**: `?auto=1`(게이트 없이 1.5초 뒤 자동 시작) · `?speed=3`(영화 시간 배속. 화면 점검용이며 판정 증거는 1배속만, 아래 참고) · `?scene=240`(장면 목표 길이 초) · `?hud=0`(HUD 숨김) · `?kiosk=1`(전시·녹화용: "← 대시보드"·"이전 버전" 링크·상단 "처음으로"·세션 JSON 내려받기를 숨긴다. `/interim`·`/film/compare` 도 같은 옵션 — `/interim` 종료 카드의 세션 id 도 "기록을 저장했습니다" 로 바뀐다) · `?fx=0`(후처리·도로 반사 끄기, Quest 성능 점검) · `?rig=0`(리깅 캐릭터 대신 캡슐) · `?gaze=0`(데스크톱 자동 시선 끄기. 기본은 옆사람이 앉으면 카메라가 오른쪽으로 돈다)
- **입력 채널**: `?cam=0`(웹캠 채널 끄기) · `?voice=1`(음성 채널) · `?voicefake=horror`(마이크 대신 샘플) · `?viewer=fearful|curious|calm&seed=N`(합성 관객. 헤드셋 없이 머리 방향·후퇴를 지어내 센서에 넣는다. 결정적 난수라 같은 seed 는 같은 반응. 시연·증거용이며 임계값 보정 근거가 아니다) · `?talk=0`(합성 관객이 옆사람의 대사 중에 화자 쪽을 보지 않게 하는 비교용)
- **연출·엔진**: `?control=1`(궤적 추종 엔진의 실제 구동: 슬롯 변형 + 미세 자극 + 연속 조정. 기본은 꺼짐 = 고정 연출) · `?hold=N`(미세 자극 뒤 연속 조정을 N초 멈춰 반응을 읽는다, 기본 5) · `?monitor=1`(디렉터 모니터: 목표 긴장 곡선 vs 관객 긴장 추정 x̂, 관객 응답 모델 θ̂, 다음 자극과 그 이유, 도달 점수. 진행 중 사건의 반응은 "잠정"(점선), 사건만 진행 중이면 "우비 인물 진행 중", 회복이 빠른 관객의 한 창짜리 봉우리는 봉우리 뒤 6초 동안 "최근 봉우리 1.00 · 먼 문 소리 · 3초 전" 잔상 줄로 남고, 마지막 창이 아직 오르는 중이면 봉우리라 부르지 않고 "x̂ 오르는 중 0.23 · 물보라" 로 적는다) · `?track=H|R|C`(모니터의 목표 곡선만 고정) · `?bias=H:6`(장르 판정 자체를 고정하는 발표·QA용 옵션. 고정하지 않으면 공포·로맨스 판정 차이가 0.4%p 안팎이라 같은 URL 에서도 판정이 바뀔 수 있다) · `?pool=1`(대사 변주 풀) · `?answer=1`(답함 갈래 강제)
- **점검 화면**: `?bus=1`(정차한 버스) · `?truck=1` · `?rigtest=1`(캐릭터 서기·앉기·머리 크기) · `?benchyaw=N`(벤치를 N 라디안 돌려 놓는 개발용 옵션)

### `/interim` URL 옵션

`?auto=1` · `?cam=0` · `?mic=0` · `?speed=N` · `?s1=A`~`?s5=A`(신호 등급 A~E 강제) · `?hud=0` · `?kiosk=1`, 그리고 엔진 쪽 `?viewer=fearful|curious|calm&seed=N` · `?monitor=1`(S1~S5 눈금 위 x̂ 곡선·θ̂·도달 점수. 목표 곡선이 없는 화면이라 탐침이 진행 중이면 왼쪽에 "중립 탐침 S1 진행 중" 을 한 번만 적는다) · `?adapt=0`(판정 뒤 관객별 연출 끔 — 오늘의 고정 연출 0.9 m · 6초 · 6초. 같은 합성 관객으로 켬/끔 두 세션을 `/film/compare` 에 올려 비교) · `?look=1`(합성 관객이 판정 뒤 앉은 옆사람을 똑바로 본다 — 옆사람 거리·착석 시각이 프레임에 보이게 하는 시연·증거용. 기본은 프로필별 곁눈질이라 옆사람이 화면 밖에 있다. 인사 구간과 `?look=1` 에서는 시선을 8° 내려 앉은 옆사람의 좌면·무릎이 프레임 아랫변 안에 들어온다 — `gazeSim.SEATED_LOOK_PITCH`). 팀 옵션의 뜻과 테스트 절차는 [`Bus/인수인계_중간시연_interim.md`](../Bus/인수인계_중간시연_interim.md) §5.

**판정 증거는 반드시 1배속.** 팀 센서 임계값(응시 2초·회복 3/1.5초 등)은 실제 초 기준인데 `?speed` 는 사건 창만 압축하므로, 배속에서는 판정이 바뀐다(배속 3 의 `/film` 에서는 공포형 합성 관객도 블랙코미디로 판정됐다). 배속은 화면·3D 점검에만 쓰고, 판정·비교 화면·녹화 증거는 1배속으로 만든다.

### 헤드리스 관찰

- `scripts/observe.sh shots/run1` 한 줄이 헤드리스 크롬을 띄우고 `/film?auto=1&cam=0` 을 열어 5초마다 PNG·HUD 텍스트(`hud.txt`)를 남긴다(dev 서버 포트는 `FILM_PORT`, 기본 3017 — `FILM_PORT=3021 scripts/observe.sh …`).
- 낱개로는 `node scripts/cdp.mjs open|eval|shot|drag|loop|close` — `drag` 로 고개를 돌리고 `shot` 으로 한 장 찍는다. 탭은 한 번에 하나만(둘이면 fps 가 떨어져 영화 시간이 느려진다).
- 소리 있는 완주 영상: `node scripts/cdp.mjs record 9224 "http://localhost:3021/film?cam=0&kiosk=1" /tmp/film_rec 225 12` → `scripts/assemble-recording.sh /tmp/film_rec out.mp4`. `record` 는 게이트를 스스로 누르므로 `auto=1` 을 뺀다.
- 디자인만 볼 때는 `/film?auto=1&cam=0&bus=1`(정차한 버스)·`?truck=1`·`?rigtest=1`(리그·머리 크기)·`?answer=1`(답함 갈래 강제).

## 궤적 추종 연출 엔진 + 집중도 트래킹 (2026-09-13 · 2026-09-30 병합 뒤 상태)

작가가 트랙(공포 H · 로맨스 R · 블랙코미디 C)별 긴장 곡선을 쓰면, 엔진이 관객마다 다른 반응 동역학 θ(이득·지연·회복·습관화)를 도입부 탐침 반응에서 식별하고, 긴장 추정 x̂ 가 그 곡선을 좇도록 자극을 고른다. 도입부 탐침 3개(포스터·우비 인물·물보라)는 θ 오염을 막기 위해 중립으로 두고, 개구리·고양이 슬롯 변형과 판정 뒤 미세 자극·연속 조정만 바꾼다. 팀의 장르 판정 로직(`/film` 헤드 포즈 판정 · `/interim` 5신호 판정)은 건드리지 않는다. 헤드 포즈에서 집중도·탐침 반응·잔움직임을 데이터로 남긴다.

**`?control=1` 을 켰을 때 실제로 달라지는 것 (`/film`)**

- 개구리(0:37)·고양이(0:43) 슬롯: θ̂ 로 변형 후보(볼륨·반복·간격, 고양이 동선 타이밍)마다 앞으로의 긴장 궤적을 예측해 하나를 골라 실제로 울린다(`lib/slotActuate.js`). 1배속 완주에서 공포형은 개구리를 한 번만 볼륨 0.5 로 울렸다(OFF 는 0.8). 실제로 울린 볼륨은 페이지의 `window.__sfxLog` 로 확인한다.
- 판정 뒤 장면: x̂ 가 목표 곡선 아래면 먼 문 소리(미세 자극, 12초 간격·최대 3회, 대사 중에는 조용한 틈까지 미룸)를 울리고, 대사 간격·BGM·가로등·안개·옆사람 거리·시선 여섯 파라미터를 목표 부족분에 비례해 천천히 양방향으로 조정한다(`lib/controlActuate.js`). 가로등은 공포 트랙에서만 쓰고 판정 전에 이미 켜져 있어(1.0) 이완 방향으로만 내려간다 — 각성 쪽으로 실제로 미는 축은 다섯이고, 모니터의 연속 구동 줄은 그 상태를 "가로등 1.00(상한)" 으로 적는다. 미세 자극 뒤 `?hold=N` 초 동안은 연속 조정을 멈춰 반응을 읽는다.
- 끄면(기본) 고정 연출이다. 모니터·세션 기록은 그대로 남으므로 ON/OFF 비교의 대조군이 된다.
- `/interim` 에서는 판정 전에는 측정만 한다(다섯 사건 S1~S5 는 중립 탐침). 판정 뒤 인사 구간(1:58~2:20)은 관객마다 다르다 — θ̂·x̂ 봉우리의 민감도 지수로 옆사람 착석 거리(±0.3 m)·걸어오는 시간(±2.5초)·인사 시각(±3초)·시선(±0.2)을 정하고, θ̂ 응답이 2건 미만이면 오늘의 고정 연출(`lib/interimAdapt.js` · `?adapt=0` 으로 끔).

**모듈** (전부 순수 함수, `node` 만으로 테스트. 파일별 역할·테스트·사용처 표는 [`Bus/규격/개발_이어가기.md`](../Bus/규격/개발_이어가기.md) §10.2)

- 센서·모델: `lib/engagementSense.js`(집중도·탐침 반응·잔움직임) · `lib/viewerModel.js`(θ 온라인 식별) · `lib/tensionEstimate.js`(x̂) · `lib/gazeSim.js`(합성 관객 3유형) · `lib/interimProbes.js`(팀 큐 S1~S5 → 탐침 메타) · `lib/interimAdapt.js`(/interim 판정 뒤 관객별 연출 값 — 착석 거리·걸어오는 시간·인사 시각·시선. `app/interim/page.js decideAdapt` 가 판정 순간 한 번 불러 화면에 배선)
- 곡선·제어: `lib/tensionCurve.js`(목표 곡선·슬롯 카탈로그, 작가가 고치는 파일) · `lib/slotController.js`(슬롯 MPC + 미세 자극 결정) · `lib/slotActuate.js` · `lib/controlActuate.js` · `lib/trackSelect.js`(도달 점수. 참고값이며 판정 트랙을 바꾸지 않는다)
- 화면·비교: `components/DirectorMonitor.jsx` · `lib/monitorText.js` · `lib/viewerText.js`(종료 카드·비교 화면 문장) · `lib/sessionCompare.js` · `app/film/compare/`
- 시뮬·데이터: `lib/tensionSim.js` + `scripts/sim-plot.mjs`(제어 OFF/ON 시뮬 그래프) · `scripts/export-engagement.mjs` · `scripts/extract-features.mjs`

**명령**

```bash
npm test                    # 회귀 23개 체인(팀 4 + 엔진 19). 하나라도 실패하면 그 자리에서 멈추고 EXIT 1
npm run sim:plot            # 모델 관객 200명 × 트랙 3 × 제어 OFF/ON → data/sim/sim-onoff.png · sim-summary.txt. 발표 숫자는 "full·현실" 줄
npm run sim                 # 초기 설계 규약(탐침까지 제어)의 표본 시뮬 — 방향 확인용. 여기 숫자는 발표에 인용하지 않는다
npm run export:engagement   # data/sessions/*.json → data/engagement_export/ CSV(세션별 _raw·_windows·_stimuli·_control + sessions_summary.csv)
npm run extract:features    # 세션 → 학습용 특징 행렬 CSV
```

**지금 말할 수 있는 수치와 한계** (출처 [`Bus/규격/기술요약_수치표.md`](../Bus/규격/기술요약_수치표.md) · 한 장 요약 [`Bus/규격/기술요약_궤적추종연출.md`](../Bus/규격/기술요약_궤적추종연출.md))

- 시뮬(현실 조건: `/film` 과 같이 결정 시각까지 닫힌 레코드만 쓴다): 제어 ON 은 OFF 대비 사건 봉우리의 관객 간 표준편차를 공포 10% · 로맨스 14% · 블랙코미디 8% 줄이고, 목표 곡선 대비 RMSE 를 7% · 7% · 10% 줄인다. 이상 조건 상한은 16% · 19% · 14%. 줄어드는 곳은 개구리 슬롯(49%)이고 고양이 슬롯은 2% 뿐이다.
- `/film` 1배속 ON/OFF 완주: 판정 뒤 ON 이 OFF 보다 대사 간격 +0.45초 · 옆사람 거리 +0.15m · BGM ×1.25, 미세 자극 3회 vs 0회.
- 한계: 관객은 전부 합성이며 실제 사람 데이터는 아직 없다. x̂ 는 사건 반응만 재므로 판정 뒤 장면의 연속 조정은 측정되지 않는 구간을 미는 개루프 보정이다. 트랙을 고정하지 않으면 같은 URL 도 판정이 바뀔 수 있다. 배속 완주의 판정은 쓰지 않는다. 합성 관객은 옆사람의 대사 중에 화자 쪽을 보므로(`?talk=0` 이면 보지 않음) 미세 자극 반응 폭 같은 측정값이 이 설정에 따라 달라진다.

## 로컬 실행

```bash
npm install
npm run pull-assets        # 팀 대시보드에 올라간 오디오를 public/reactive/audio/ 로 (최초 1회, 이미 커밋돼 있으면 생략)
npm run film -- -p 3021    # dev 서버 — 셸에 NODE_ENV·TURBOPACK 이 잡혀 있어도 안전. -p 를 빼면 3000
```

`http://localhost:3021/film`. 헤드폰 권장. 빌드는 `npm run build:clean`(dev 서버가 도는 동안에는 돌리지 않는다. `.next` 가 꼬인다), 회귀 테스트는 `npm test`.

헤드리스·시연에 쓰는 URL 다섯 개(그대로 복붙 · 판정 증거는 1배속):

```
# /film 제어 ON · 합성 공포형 · 트랙 공포 고정 · 디렉터 모니터 · 전시 화면
http://localhost:3021/film?auto=1&cam=0&viewer=fearful&seed=1&bias=H:6&monitor=1&control=1&kiosk=1
# 같은 조건 제어 OFF(고정 연출) — 종료 카드·비교 화면의 대조군
http://localhost:3021/film?auto=1&cam=0&viewer=fearful&seed=1&bias=H:6&monitor=1&control=0&kiosk=1
# /interim 두 관객 — 같은 다섯 사건, 다른 반응
http://localhost:3021/interim?auto=1&cam=0&mic=0&viewer=fearful&seed=1&monitor=1&kiosk=1
http://localhost:3021/interim?auto=1&cam=0&mic=0&viewer=calm&seed=1&monitor=1&kiosk=1
# 비교 화면 — a·b 는 data/sessions/ 파일 이름(확장자 제외) = GET /api/session 목록의 id
http://localhost:3021/film/compare?a=<A 세션 id>&b=<B 세션 id>&kiosk=1
```

완주가 끝나면 세션이 `POST /api/session` 으로 `data/sessions/*.json`(gitignore)에 자동 저장된다. `engagement`(원시·2초 창·탐침 레코드)와 `control`(트랙·θ̂·슬롯 결정·구동 기록)이 같이 남으며, 항목은 [`개발_이어가기.md`](../Bus/규격/개발_이어가기.md) §10.5.

`/film`·`/interim`·`/film/compare` 는 외부 서비스 없이 돕니다. 실시간 대사 생성(`/api/dialogue`)·음성 합성(`/api/tts`)·STT 와 톤 분석(`/api/mood`, `/api/voicetone`)을 쓸 때만
`.env.local` 에 `OPENROUTER_API_KEY` 하나가 필요합니다. `/facecheck` 의 기록 저장과 대시보드는 Supabase(`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`)를 씁니다. 설정은 저장소 루트의 [`ONBOARDING.md`](../ONBOARDING.md).

## 구조

```
app/film/                 반응형 실시간 영화 페이지 (디렉터·오디오·대사 루프·HUD·종료 카드·엔진 배선)
app/film/compare/         관객 두 명 비교 화면
app/interim/              중간시연 MVP(팀) — 다섯 신호 판정 + 디렉터 모니터·합성 관객·종료 카드
app/facecheck/            웹캠 표정 자가진단(팀)
app/api/session/          세션 기록 저장 (data/sessions/) + 목록·요약
lib/directionState.js     연출 상태 — 증거 누적·완만 추종·정착도·확신도·궤적
lib/directionMap.js       매핑표(온톨로지) — 장르 앵커값, 사건 트리거, BGM 게인
lib/headPoseSense.js      헤드 포즈 센서 — 사건별·창 단위 증거
lib/filmTimeline.js       타임라인 — 다섯 사건과 배우 위치(시간의 순수 함수)
lib/dialoguePool.js       대사 풀 근접 매칭
lib/interimTimeline.js · interimJudge.js · interimGrader.js · interimDrift.js · interimMic.js · behaviorSense.js · standUpSense.js
                          /interim 의 타임라인·판정·채점·드리프트·마이크·표정·기립 (팀)
lib/engagementSense.js · viewerModel.js · tensionEstimate.js · tensionCurve.js · slotController.js · slotActuate.js · controlActuate.js ·
    trackSelect.js · tensionSim.js · gazeSim.js · interimProbes.js · interimAdapt.js · viewerText.js · monitorText.js · sessionCompare.js
                          궤적 추종 연출 엔진 (위 절)
components/ReactiveStage.jsx    반응형 무대 (BlockoutStage 지형 재사용, 리깅 임시 배우)
components/DirectorMonitor.jsx  디렉터 모니터 패널 + x̂ 그래프 (/film·/interim 공유)
public/reactive/audio/    대사 46줄·SFX 18·BGM 3·안내방송 (+ pool/ 변주 138줄)
public/reactive/models/   Meshy 리깅 캐릭터 (meshopt, 5~7MB) · props/ PolyHaven CC0 소품·침엽수 (26MB)
public/reactive/hdri/     PolyHaven CC0 순수 하늘 HDRI 3장 (2k, 13MB)
scripts/blender/          Mixamo FBX → GLB 병합 스크립트 (Blender 헤드리스)
scripts/                  test-*.mjs 회귀 21개 + sim-headpose·sim-interim (npm test 체인 23개) · sim-plot · sim-trajectory · export-engagement ·
                          extract-features · cdp.mjs · observe.sh · assemble-recording.sh · pull-assets · gen-dialogue-pool · synthesize-dialogue(레거시)
```

## 문서

- 설계·매핑표·남은 일: [`Bus/규격/반응형_실시간_영화.md`](../Bus/규격/반응형_실시간_영화.md): §8 집중도 데이터 · §9 궤적 추종 엔진(원리·모듈 표·배선·시뮬 근거·한계)
- 이어받기: [`Bus/규격/개발_이어가기.md`](../Bus/규격/개발_이어가기.md): §10 엔진(무엇이 바뀌나 · 모듈 지도 · 연결 지점 · 실행법 · 세션 JSON · 수치와 한계 · 팀에 제안 · B 번호 색인). `/interim` 은 [`Bus/인수인계_중간시연_interim.md`](../Bus/인수인계_중간시연_interim.md)
- 심사·학회용 한 장: [`Bus/규격/기술요약_궤적추종연출.md`](../Bus/규격/기술요약_궤적추종연출.md) + 수치 표 [`기술요약_수치표.md`](../Bus/규격/기술요약_수치표.md) + 그림 `기술요약_그림1.png`
- 기획 원문은 저장소 밖 `7_버스정류장/work/기획_7조_궤적추종연출_20260912_v1.md`
- 대시보드·업로드·할 일·조명 프리셋(`/`, `/todo`, `/upload`, `/whitebox`, `/vo`, `/sfx`)은 8월 구조 그대로이며 Supabase 를 씁니다. 그쪽은 [`ONBOARDING.md`](../ONBOARDING.md).
