# CTxAI — 7조 <버스 정류장>

KAIST CTxAI 캡스톤 7조의 저장소입니다. 관객이 아무것도 선택하지 않아도 머리 방향·표정·목소리 반응만으로
공포·로맨스·블랙코미디가 실시간으로 배합되는 정류장 체험(반응형 실시간 영화)을 만듭니다.

- 앱(Next.js. 체험 화면 `/film`·`/interim`·`/film/compare`·`/facecheck` + 팀 대시보드): [`ctxai-busstop-xr-audio-proto/`](ctxai-busstop-xr-audio-proto/README.md). 실행법·URL 옵션·궤적 추종 연출 엔진 설명은 그 README 에 있습니다.
- 팀 온보딩(라이브 사이트·Vercel·Supabase·모노레포 구조): [`ONBOARDING.md`](ONBOARDING.md)
- 기획·규격 문서: [`Bus/규격/`](Bus/규격/): 설계 [`반응형_실시간_영화.md`](Bus/규격/반응형_실시간_영화.md) · 이어받기 [`개발_이어가기.md`](Bus/규격/개발_이어가기.md) · 심사용 기술 요약 [`기술요약_궤적추종연출.md`](Bus/규격/기술요약_궤적추종연출.md) · `/interim` 인수인계 [`Bus/인수인계_중간시연_interim.md`](Bus/인수인계_중간시연_interim.md)

빨리 돌려 보기:

```bash
cd ctxai-busstop-xr-audio-proto
npm install
npm test                   # 회귀 22개 체인
npm run film -- -p 3021    # http://localhost:3021/film  (제어 ON 시연은 ?auto=1&cam=0&viewer=fearful&seed=1&bias=H:6&monitor=1&control=1&kiosk=1)
```
