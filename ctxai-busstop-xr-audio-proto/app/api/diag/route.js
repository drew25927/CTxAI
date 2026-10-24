// 헤드셋 진단 로그 — POST 로 올리고(/film?diag=1 이 자동 전송), GET /api/diag[?id=...] 로 읽는다(기본: 가장 최근, ?list=1 이면 최근 id 목록).
// 쓰기를 열어 둔 이유: Quest 브라우저 콘솔은 밖에서 읽을 수 없다. 크기를 작게 막고, ?diag=1 일 때만 전송한다.
import { putDiag, getDiag, listDiagIds } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let body;
  try { body = JSON.parse((await req.text()).slice(0, 40000)); } catch (e) { return Response.json({ ok: false }, { status: 400 }); }
  const id = String(body?.id || "");
  const log = Array.isArray(body?.log) ? body.log.slice(-80).map((x) => String(x).slice(0, 400)) : [];
  try {
    await putDiag(id, { id, at: new Date().toISOString(), ua: String(body?.ua || "").slice(0, 200), log });
  } catch (e) { return Response.json({ ok: false, error: "bad id" }, { status: 400 }); }
  return Response.json({ ok: true });
}

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  if (sp.get("list") === "1") return Response.json({ ok: true, ids: await listDiagIds() }, { headers: { "Cache-Control": "no-store" } });
  const id = sp.get("id") || "latest";
  const d = await getDiag(id);
  return d ? Response.json({ ok: true, diag: d }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ ok: false }, { status: 404 });
}
