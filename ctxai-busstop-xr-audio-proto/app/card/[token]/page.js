"use client";

// 체험 카드 — 관객이 /film 종료 화면의 QR 을 폰으로 찍으면 열리는 페이지.
// 앉은 인물의 장르·마지막 배합·하늘이 변한 궤적을 이미지 한 장(1080×1350)으로 그려 저장·공유하게 한다.
// 이미지는 서버가 아니라 이 브라우저의 canvas 가 그린다(서버 부담 없음). 데이터는 /api/card (센서 데이터 없는 요약).

import { useEffect, useRef, useState } from "react";

const GENRE = {
  R: { label: "로맨스", accent: "#f2a7c0", line: "옆에 앉은 사람은 오늘 당신 쪽으로 기울었습니다." },
  H: { label: "공포", accent: "#8fae95", line: "옆에 앉은 사람은 끝까지 조금 낯설었습니다." },
  C: { label: "블랙코미디", accent: "#e0a86a", line: "옆에 앉은 사람 덕분에 이상하게 웃음이 났습니다." },
};
const EVENT_LABEL = { poster: "포스터", cafeBell: "우비 인물", truckSplash: "물보라", frog: "개구리", cat: "고양이", catScream: "비명" };
const W = 1080, H = 1350;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, y); line = ch; y += lineH; } else line += ch;
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}

async function drawCard(canvas, card) {
  const g = GENRE[card.dominant] || GENRE.R;
  const ctx = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;
  ctx.fillStyle = "#0b0e13"; ctx.fillRect(0, 0, W, H);

  // 원화 — 앉은 인물 장르의 메인뷰, 위쪽 절반
  const art = await loadImage(`/story/art/${card.dominant}-02.jpg`);
  if (art) {
    const ah = 640, scale = Math.max(W / art.width, ah / art.height);
    const sw = W / scale, sh = ah / scale;
    ctx.drawImage(art, (art.width - sw) / 2, (art.height - sh) / 2, sw, sh, 0, 0, W, ah);
  }
  const fade = ctx.createLinearGradient(0, 380, 0, 700);
  fade.addColorStop(0, "rgba(11,14,19,0)"); fade.addColorStop(1, "#0b0e13");
  ctx.fillStyle = fade; ctx.fillRect(0, 380, W, 320);

  // 위 제목이 밝은 하늘 위에서도 읽히도록 어둡게 깐다
  const top = ctx.createLinearGradient(0, 0, 0, 170);
  top.addColorStop(0, "rgba(11,14,19,0.75)"); top.addColorStop(1, "rgba(11,14,19,0)");
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 170);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "500 30px 'Pretendard','Apple SD Gothic Neo',sans-serif";
  ctx.fillText("정류장 · 반응형 실시간 영화", 64, 92);

  ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "400 34px 'Pretendard','Apple SD Gothic Neo',sans-serif";
  ctx.fillText("오늘 옆에 앉은 사람", 64, 700);
  ctx.fillStyle = g.accent; ctx.font = "700 112px 'Pretendard','Apple SD Gothic Neo',sans-serif";
  ctx.fillText(g.label, 64, 810);
  ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "400 32px 'Pretendard','Apple SD Gothic Neo',sans-serif";
  wrapText(ctx, g.line, 64, 868, W - 128, 46);

  // 마지막 배합 막대
  let by = 960;
  for (const k of ["R", "H", "C"]) {
    const v = card.mix?.[k] ?? 0;
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "400 28px 'Pretendard','Apple SD Gothic Neo',sans-serif";
    ctx.fillText(GENRE[k].label, 64, by + 22);
    ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(250, by, 640, 26);
    ctx.fillStyle = GENRE[k].accent; ctx.fillRect(250, by, 640 * Math.min(1, v / 100), 26);
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.textAlign = "right"; ctx.fillText(`${v}%`, W - 64, by + 22); ctx.textAlign = "left";
    by += 48;
  }

  // 하늘이 변한 궤적
  const cx0 = 64, cx1 = W - 64, cy0 = 1135, cy1 = 1265;
  const pts = card.points || [];
  if (pts.length > 1) {
    const tMax = pts[pts.length - 1].t || 1;
    const X = (t) => cx0 + (t / tMax) * (cx1 - cx0), Y = (v) => cy1 - v * (cy1 - cy0);
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
    for (const e of card.events || []) { ctx.beginPath(); ctx.moveTo(X(e.t), cy0); ctx.lineTo(X(e.t), cy1); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const k of ["R", "H", "C"]) {
      ctx.strokeStyle = GENRE[k].accent; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p[k])) : ctx.moveTo(X(p.t), Y(p[k]))));
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "400 22px 'Pretendard','Apple SD Gothic Neo',sans-serif";
    ctx.fillText("하늘이 바뀐 흐름", 64, 1120);
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = "400 22px 'Pretendard','Apple SD Gothic Neo',sans-serif";
  const d = card.createdAt ? new Date(card.createdAt) : null;
  ctx.fillText(`KAIST CTxAI · Team 7${d ? ` · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}` : ""}`, 64, 1316);
}

export default function CardPage({ params }) {
  const canvasRef = useRef(null);
  const [state, setState] = useState("loading"); // loading | ready | missing | error
  const [card, setCard] = useState(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/card?token=${encodeURIComponent(params.token)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 404) return setState("missing");
        const j = await r.json();
        if (!j?.ok) return setState("error");
        setCard(j.card); setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [params.token]);

  useEffect(() => {
    if (state !== "ready" || !card || !canvasRef.current) return;
    drawCard(canvasRef.current, card);
    setCanShare(typeof navigator !== "undefined" && !!navigator.canShare);
  }, [state, card]);

  function toBlob() {
    return new Promise((resolve) => canvasRef.current.toBlob(resolve, "image/png"));
  }
  async function save() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "busstop-card.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function share() {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], "busstop-card.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "정류장" });
      else await save();
    } catch { /* 공유 창을 닫은 경우 */ }
  }

  const g = card ? GENRE[card.dominant] : null;
  return (
    <main style={{ minHeight: "100vh", background: "#0b0e13", color: "#e8ecf1", display: "grid", placeItems: "center", padding: "20px 16px 40px", fontFamily: "'Pretendard','Apple SD Gothic Neo',system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        {state === "loading" && <p style={{ textAlign: "center", opacity: 0.7 }}>카드를 불러오는 중…</p>}
        {state === "missing" && <p style={{ textAlign: "center", opacity: 0.8, lineHeight: 1.7 }}>이 카드를 찾을 수 없습니다.<br />QR 코드를 다시 찍어 주세요.</p>}
        {state === "error" && <p style={{ textAlign: "center", opacity: 0.8 }}>카드를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>}
        {state === "ready" && (
          <>
            <canvas ref={canvasRef} style={{ width: "100%", height: "auto", borderRadius: 14, display: "block", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }} aria-label={`옆에 앉은 사람: ${g?.label}`} />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={save} style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: `1px solid ${g?.accent}`, background: "transparent", color: g?.accent, fontSize: 16, fontWeight: 600 }}>이미지 저장</button>
              {canShare && <button onClick={share} style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "none", background: g?.accent, color: "#0b0e13", fontSize: 16, fontWeight: 700 }}>공유하기</button>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
