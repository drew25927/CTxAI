// 웹캠 표정 인식 자가진단 기록 — /facecheck 페이지가 씁니다.
//
//   GET  /api/facecheck    지금까지 팀원들이 남긴 기록 전체
//   POST /api/facecheck    기록 하나 추가 { name?, intended, judged, correct, fear, amusement }

import { listFacecheckResults, addFacecheckResult, removeFacecheckResult } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABELS = ["무표정", "공포", "웃음", "미소", "놀람", "찌푸림", "슬픔"];

export async function GET() {
  return Response.json({ ok: true, results: await listFacecheckResults() });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return Response.json({ ok: false, error: "JSON 을 읽지 못했습니다" }, { status: 400 });
  }

  const { intended, judged, correct } = body || {};
  if (!LABELS.includes(intended) || !LABELS.includes(judged)) {
    return Response.json({
      ok: false, error: `intended/judged는 ${LABELS.join(" / ")} 중 하나여야 합니다`,
    }, { status: 400 });
  }
  if (typeof correct !== "boolean") {
    return Response.json({ ok: false, error: "correct(true/false)가 없습니다" }, { status: 400 });
  }

  const rec = await addFacecheckResult({
    name: body?.name, intended, judged, correct,
    fear: body?.fear, amusement: body?.amusement, scores: body?.scores,
  });
  return Response.json({ ok: true, result: rec, results: await listFacecheckResults() });
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id 가 없습니다" }, { status: 400 });

  const results = await removeFacecheckResult(id);
  return Response.json({ ok: true, results });
}
