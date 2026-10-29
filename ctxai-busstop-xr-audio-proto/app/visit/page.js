// 관람객용 주소 — 디렉토리북 QR(2026-10-29)이 가리키는 곳. 인쇄물이라 주소를 바꿀 수 없으니
// 옵션은 여기서만 고친다.
//   visitor=1  세션 기록에 관람객 표시 → /api/session 목록·파일럿 일치율·fit-judging 에서 빠진다
//   live=0     운영자 모니터(/film/live)에 안 뜬다
//   hud=0      개발용 상태 막대·줄 번호를 숨긴 전시 화면
//   cam=0      폰에서 전면 카메라 권한을 묻지 않는다 (표정은 보조 신호)
import { redirect } from "next/navigation";

export default function VisitPage() {
  redirect("/film?visitor=1&live=0&hud=0&cam=0");
}
