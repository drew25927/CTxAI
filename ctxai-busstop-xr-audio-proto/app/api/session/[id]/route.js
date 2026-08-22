// 세션 원본 내려받기 — scripts/replay.mjs 로 돌려보거나 분석에 쓴다.
//
//   GET /api/session/<id>    gzip 된 JSONL 그대로

import { getSessionBytes } from "../../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const bytes = await getSessionBytes(params.id);
  if (!bytes) return new Response("없음", { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${params.id}.jsonl.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
