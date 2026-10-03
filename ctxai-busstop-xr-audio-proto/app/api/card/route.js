// 체험 카드 열람 — GET /api/card?token=<16~32자 16진>. 센서 데이터 없는 요약만 돌려준다(lib/cardSummary.js).
import { getCard } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const card = await getCard(token);
  return card
    ? Response.json({ ok: true, card }, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ ok: false, error: "not found" }, { status: 404 });
}
