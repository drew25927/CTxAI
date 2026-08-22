// 프로브 세션 저장·목록 — app/probe 가 쓴다.
//
//   GET  /api/session        저장된 세션 요약 목록
//   POST /api/session        multipart: id, meta(JSON), file(.jsonl.gz)
//
// 업로드는 반드시 gzip 된 상태로 온다. Vercel 서버리스 함수는 요청 바디가
// ~4.5MB 를 넘으면 413 으로 거부하는데(개발_이어가기.md §6), 세션 원본 JSONL 은
// 랜드마크 시계열 때문에 1MB 에 육박한다. 압축하면 30KB 안팎이라 여유가 크다.

import { putSession, listSessions } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ sessions: await listSessions() });
}

export async function POST(req) {
  let form;
  try {
    form = await req.formData();
  } catch (e) {
    return Response.json({ ok: false, error: "잘못된 요청입니다" }, { status: 400 });
  }

  const id = form.get("id");
  const file = form.get("file");
  if (typeof id !== "string" || !file || typeof file === "string") {
    return Response.json({ ok: false, error: "id 와 file 이 필요합니다" }, { status: 400 });
  }

  let meta = {};
  try { meta = JSON.parse(form.get("meta") || "{}"); } catch (e) {}

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const summary = await putSession(id, bytes, meta);
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
