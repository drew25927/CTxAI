// /film?rec=1 녹화 조각을 받아 capture/<file> 에 이어 붙인다 (lib/filmRecorder.js). 로컬 개발 서버 전용 —
// 배포본에서는 막는다. seq=0 이면 파일을 새로 만든다.
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "capture");

export async function POST(req) {
  if (process.env.NODE_ENV === "production") return Response.json({ ok: false }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const file = String(sp.get("file") || "");
  if (!/^[\w.-]+\.(mp4|webm|json)$/.test(file)) return Response.json({ ok: false, error: "bad file" }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  await mkdir(DIR, { recursive: true });
  const p = path.join(DIR, file);
  if (sp.get("seq") === "0") await writeFile(p, buf); else await appendFile(p, buf);
  return Response.json({ ok: true, bytes: buf.length });
}
