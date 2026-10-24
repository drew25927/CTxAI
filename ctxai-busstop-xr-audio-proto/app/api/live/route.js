// 실시간 진행 상황 — POST 는 /film 이 1.5초마다 보내고, GET 은 /film/live(운영자 모니터)가 1초마다 읽는다.
// 최근 90초 안에 갱신된 기기만 돌려준다. 센서 원자료는 받지 않는다 — 단계·장르 비중·지금 대사 같은 요약만.
import { putLive, listLive } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v, n) => (v == null ? null : String(v).slice(0, n));
const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 1000) / 1000 : null);

export async function POST(req) {
  let b;
  try { b = JSON.parse((await req.text()).slice(0, 8000)); } catch (e) { return Response.json({ ok: false }, { status: 400 }); }
  const w = b?.weights || {};
  const row = {
    id: str(b?.id, 40), at: new Date().toISOString(), device: str(b?.device, 40), phase: str(b?.phase, 20),
    t: num(b?.t), dominant: str(b?.dominant, 2), settled: num(b?.settled),
    weights: { R: num(w.R), H: num(w.H), C: num(w.C) },
    line: b?.line ? { genre: str(b.line.genre, 2), seq: str(b.line.seq, 4), text: str(b.line.text, 200), flavor: !!b.line.flavor, tinted: str(b.line.tinted, 2) } : null,
    ask: b?.ask ? { seq: str(b.ask.seq, 4), listening: !!b.ask.listening, answered: b.ask.answered ?? null } : null,
    caption: str(b?.caption, 80), xr: !!b?.xr, fps: num(b?.fps), cam: str(b?.cam, 20),
  };
  try { await putLive(row.id || "", row); } catch (e) { return Response.json({ ok: false, error: "bad id" }, { status: 400 }); }
  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({ ok: true, devices: await listLive() }, { headers: { "Cache-Control": "no-store" } });
}
