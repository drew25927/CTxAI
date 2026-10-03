// 세션 기록 저장 — /film 종료 시 연출 상태 궤적·사건·헤드 포즈 채점을 남긴다.
//
// 파일럿(10~20명)에서 "시스템 판정 vs 본인이 느낀 장르" 일치율을 내려면 회차마다
// JSON이 자동으로 쌓여야 한다. 관객이 종료 카드에서 내려받기를 누르는 데 의존하지 않는다.
// 저장소는 다른 데이터와 같은 lib/store.js(배포판 Supabase, 키 없는 로컬은 storage/sessions/) —
// 예전처럼 프로젝트 폴더에 파일로 쓰면 Vercel(읽기 전용 파일시스템)에서 500 이 난다.
//
//   POST /api/session  { ...exportSession() 결과, selfReport?: "R"|"H"|"C" }
//   GET  /api/session  → 저장된 기록 목록과 요약(마지막 배합·앉은 인물·자기보고)
//   GET  /api/session?id=...  → 기록 하나
//   DELETE /api/session?id=... → 테스트·잘못된 기록 지우기

import { putSessionRecord, getSessionRecord, listSessionIds, removeSessionRecord, putCard } from "../../../lib/store";
import { makeCardSummary, CARD_TOKEN } from "../../../lib/cardSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "잘못된 요청 본문" }, { status: 400 }); }
  if (!body || !Array.isArray(body.trajectory)) return Response.json({ ok: false, error: "trajectory 가 필요합니다" }, { status: 400 });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dom = /^[RHC]$/.test(body.dominant || "") ? body.dominant : "x";
  const id = `${stamp}_${dom}`;
  // 체험 카드 — 클라이언트가 한 회차 동안 같은 token 을 보내면(자기보고로 다시 저장해도) 같은 카드가 갱신된다.
  const { cardToken: wantedToken, ...rest } = body;
  const cardToken = typeof wantedToken === "string" && CARD_TOKEN.test(wantedToken) ? wantedToken : null;
  try {
    await putSessionRecord(id, { id, savedAt: new Date().toISOString(), ...(cardToken ? { cardToken } : {}), ...rest });
  } catch (e) {
    return Response.json({ ok: false, error: `저장 실패: ${e.message}` }, { status: 502 });
  }
  if (cardToken) {
    try { await putCard(cardToken, makeCardSummary(rest)); } catch { /* 카드 실패는 기록 저장에 영향 없다 */ }
  }
  return Response.json({ ok: true, id, ...(cardToken ? { cardToken } : {}) });
}

export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    if (!/^[\w\-]+$/.test(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
    const j = await getSessionRecord(id);
    return j ? Response.json({ ok: true, session: j }) : Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const ids = await listSessionIds(200);
  const items = [];
  for (const sid of ids) {
    const j = await getSessionRecord(sid);
    if (!j) continue;
    items.push({
      id: j.id, savedAt: j.savedAt, dominant: j.dominant ?? null, selfReport: j.selfReport ?? null,
      final: j.final?.current ?? null, settled: j.final?.settled ?? null, confidence: j.final?.confidence ?? null,
      durationSec: j.trajectory?.length ? j.trajectory[j.trajectory.length - 1].t : null,
    });
  }
  const withReport = items.filter((i) => i.selfReport && i.dominant);
  const agree = withReport.filter((i) => i.selfReport === i.dominant).length;
  return Response.json({ ok: true, count: items.length, agreement: withReport.length ? { n: withReport.length, agree, rate: agree / withReport.length } : null, items });
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[\w\-]+$/.test(id)) return Response.json({ ok: false, error: "id 가 없습니다" }, { status: 400 });
  await removeSessionRecord(id);
  return Response.json({ ok: true });
}
