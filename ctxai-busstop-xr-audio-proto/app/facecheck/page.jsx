"use client";

// 웹캠 표정 인식 자가진단 대시보드.
//
// 이전 버전은 공포/웃음 원시 숫자만 보여줬다 — 이번엔 그 숫자를 문턱값으로
// 나눠 "무표정/공포/웃음" 중 하나로 직접 판정해서 보여주고, 그 판정이 맞았는지
// 팀원이 직접 체크해서 /api/facecheck(Supabase)에 데이터로 쌓는다. 한 사람만
// 해보는 게 아니라 팀원 모두가 각자 남긴 기록이 쌓여야 인식 정확도를 숫자로
// 말할 수 있다.
//
// 판정 로직은 lib/behaviorSense.js의 observe()가 이미 계산해 주는 fear/amusement
// 두 값을 그대로 재사용한다 — 새 인식 로직을 만들지 않는다.

import { useRef, useState, useEffect, useCallback } from "react";
import { observe } from "@/lib/behaviorSense";
import s from "../tool/tool.module.css";

const OBSERVE_MS = 5 * 60 * 1000; // 시간 제한에 쫓기지 않도록 5분 — 다 됐으면 "다시 확인"
const EXPR_TH = 0.4; // 이 값 넘으면 "뚜렷이 지었다"고 본다. lib/interimGrader.js의 0.5보다
                      // 살짝 낮다 — 여긴 등급이 아니라 "인식 자체가 되는가"를 보는 자리라서.

// 앞의 3개(무표정·공포·웃음)가 지금 판정(/interim 등)이 실제로 쓰는 것. 뒤 4개는
// "이 표정들도 구분되는가"를 팀이 실측해 보는 실험용 — 임계값은 추정치이고 판정에는
// 아직 반영되지 않는다(로맨스에 긍정 신호가 없는 문제를 풀 후보: 미소).
const LABELS = ["무표정", "공포", "웃음", "미소", "놀람", "찌푸림", "슬픔"];
const EXPERIMENTAL = new Set(["미소", "놀람", "찌푸림", "슬픔"]);
const LABEL_DESC = {
  무표정: "표정 없이 평소 얼굴",
  공포: "눈 크게 뜨고 눈썹 위로, 입은 다문 채(무서운 표정)",
  웃음: "활짝 웃으며 볼 조이기",
  미소: "입꼬리만 살짝 올리는 부드러운 미소 (로맨스 후보 신호)",
  놀람: "입을 벌리고 눈을 크게 (헉! 하는 표정)",
  찌푸림: "눈살·코를 찌푸림 (싫어하는 표정)",
  슬픔: "입꼬리를 아래로 내림",
};

// 라벨별 "뚜렷이 지었다"고 보는 문턱값(기준선을 뺀 점수에 적용). 추정치.
const TH = { 웃음: 0.4, 공포: 0.4, 놀람: 0.35, 찌푸림: 0.35, 슬픔: 0.3, 미소: 0.2 };
const KEYS = { 웃음: "amusement", 공포: "fear", 놀람: "surprise", 찌푸림: "frown", 슬픔: "sad", 미소: "smile" };

function rawScores(live) {
  const e = live.extra || {};
  return { fear: live.fear || 0, amusement: live.amusement || 0, smile: e.smile || 0, surprise: e.surprise || 0, frown: e.frown || 0, sad: e.sad || 0 };
}

// 절대 점수가 아니라 "내 무표정 대비 얼마나 올랐나"로 본다 — 사람마다 평소 얼굴의
// 입꼬리·눈썹 값이 달라서, 기준선 없이는 무표정도 미소/찌푸림으로 읽히기 쉽다.
function rank(live, base) {
  const raw = rawScores(live);
  const adj = {};
  for (const k of Object.keys(raw)) adj[k] = Math.max(0, raw[k] - (base?.[k] || 0));
  const ratio = {};
  for (const l of Object.keys(TH)) ratio[l] = adj[KEYS[l]] / TH[l];
  if (ratio.웃음 >= 1) ratio.미소 = 0; // 미소 점수는 웃음 점수에 포함돼 있어서, 크게 웃으면 미소로 잘못 읽힘
  const order = Object.entries(ratio).sort((a, b) => b[1] - a[1]);
  const [best, bestR] = order[0];
  if (bestR < 1) return { label: "무표정", ambiguousWith: null, ratio, order, raw, adj };
  const [second, secondR] = order[1];
  const ambiguousWith = secondR >= 1 * 0.75 && secondR >= 0.75 * bestR ? second : null;
  return { label: best, ambiguousWith, ratio, order, raw, adj };
}

export default function FaceCheck() {
  const [state, setState] = useState("idle"); // idle | running | done | error
  const [live, setLive] = useState({ faceFound: false });
  const [error, setError] = useState(null);
  const [intended, setIntended] = useState("무표정");
  const [name, setName] = useState("");
  const [results, setResults] = useState(null);
  const [submitMsg, setSubmitMsg] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [calibrating, setCalibrating] = useState(false);
  const liveRef = useRef({});

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const loadResults = useCallback(async () => {
    try {
      const res = await fetch("/api/facecheck");
      const data = await res.json();
      if (data?.ok) setResults(data.results);
    } catch {}
  }, []);

  useEffect(() => { loadResults(); }, [loadResults]);

  async function run() {
    setState("running");
    setError(null);
    try {
      const stream = streamRef.current || await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setLive({ faceFound: false, loading: true });
      const obs = await observe(videoRef.current, OBSERVE_MS, (l) => { liveRef.current = l; setLive(l); });
      if (obs && obs.ok === false) {
        setError(obs.reason === "model_load_failed"
          ? "얼굴 인식 모델을 불러오지 못했습니다(네트워크 또는 브라우저 WebAssembly 문제). 새로고침 후 다시 시도하거나 Chrome에서 열어 보세요."
          : String(obs.reason));
        setState("error");
        return;
      }
      setState("done");
    } catch (e) {
      setError(e?.message || String(e));
      setState("error");
    }
  }

  function calibrate() {
    setCalibrating(true);
    const samples = [];
    const t = setInterval(() => {
      const l = liveRef.current;
      if (l?.faceFound && typeof l.fear === "number") samples.push(rawScores(l));
    }, 80);
    setTimeout(() => {
      clearInterval(t);
      setCalibrating(false);
      if (samples.length < 5) { setSubmitMsg("기준선 실패 — 얼굴이 안 잡혔습니다. 정면을 보고 다시 눌러 주세요."); return; }
      const avg = {};
      for (const k of Object.keys(samples[0])) avg[k] = samples.reduce((a, x) => a + x[k], 0) / samples.length;
      setBaseline(avg);
      setSubmitMsg("✓ 무표정 기준선을 잡았습니다 — 이제 표정을 지어보세요.");
    }, 2000);
  }

  const ranked = live.faceFound && typeof live.fear === "number" ? rank(live, baseline) : null;
  const judged = ranked?.label || null;

  async function submit(correct) {
    if (!judged) return;
    setSubmitMsg(null);
    try {
      const res = await fetch("/api/facecheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, intended, judged, correct,
          fear: live.fear, amusement: live.amusement,
          ambiguousWith: ranked?.ambiguousWith || "", baseline: !!baseline,
          scores: {
            ...ranked.raw,
            adj_fear: ranked.adj.fear, adj_amusement: ranked.adj.amusement, adj_smile: ranked.adj.smile,
            adj_surprise: ranked.adj.surprise, adj_frown: ranked.adj.frown, adj_sad: ranked.adj.sad,
          },
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        setSubmitMsg(correct ? "✓ 기록했습니다 — 판정 맞음" : "✓ 기록했습니다 — 판정 틀림");
        setResults(data.results);
      } else {
        setSubmitMsg(`기록 실패: ${data?.error || "알 수 없는 오류"}`);
      }
    } catch (e) {
      setSubmitMsg(`기록 실패: ${e.message}`);
    }
  }

  const stats = summarize(results);

  return (
    <main className={s.wrap}>
      <h1>웹캠 표정 인식 확인</h1>
      <p className={s.dim}>
        <code>/interim</code>·<code>/film</code>의 놀람(S2)·정서(S4) 판정은 웹캠이 표정을 얼마나
        정확히 읽는지에 달려 있습니다. <b>팀원 각자 자기 카메라·조명·자리에서</b> 아래 순서대로
        확인하고, 판정이 맞았는지 직접 체크해 주세요 — 한 사람만 해보는 게 아니라 팀원 각자
        기록을 남겨야 정확도를 숫자로 알 수 있습니다.
      </p>

      <div className={s.step}>
        <h2><span>1</span>카메라 켜기</h2>
        <video
          ref={videoRef} muted playsInline
          style={{ width: 260, borderRadius: 10, transform: "scaleX(-1)", background: "#111", display: "block", marginBottom: 12 }}
        />
        <button className={s.copy} onClick={run} disabled={state === "running"}>
          {state === "running" ? "관찰 중… (필요한 만큼 표정을 지어보세요)" : state === "done" ? "다시 시작" : "카메라 켜고 확인 시작"}
        </button>
        {error && (
          <p style={{ color: "#f08c8c", marginTop: 10 }}>
            카메라를 켤 수 없습니다: {error}. 브라우저 주소창 왼쪽의 카메라 권한을 허용했는지 확인해 주세요.
          </p>
        )}
      </div>

      <div className={s.step}>
        <h2><span>2</span>지금 이 표정을 지어보세요</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {LABELS.map((l) => (
            <button
              key={l}
              onClick={() => setIntended(l)}
              className={s.copy}
              style={intended === l ? { background: "#3a4a3f", borderColor: "#5a8a68" } : {}}
            >
              {l}{EXPERIMENTAL.has(l) ? " (실험)" : ""}
            </button>
          ))}
        </div>
        <p className={s.dim}>{LABEL_DESC[intended]}</p>
      </div>

      <div className={s.step}>
        <h2><span>3</span>판정 결과</h2>
        <p className={s.dim} style={{ fontSize: 13 }}>
          상태: {state === "idle" ? "카메라 꺼짐 — 1번에서 시작"
            : state === "error" ? "오류 — 위 메시지 확인"
            : state === "done" ? "관찰 끝 — 다시 시작"
            : live.loading ? "얼굴 인식 모델 불러오는 중… (처음엔 수 초 걸림)"
            : !live.faceFound ? "카메라는 켜졌지만 얼굴이 안 잡힘 — 정면·밝은 곳"
            : live.rejected ? "얼굴 잡힘 (움직임이 커서 이 프레임은 이동 계산에서 제외 — 표정 판정은 계속됨)"
            : "정상 인식 중"}
        </p>
        {!live.faceFound && !live.loading && state === "running" && <p>얼굴 없음 — 정면을 보고 밝은 곳에서 시도하세요</p>}
        <div style={{ margin: "8px 0" }}>
          <button className={s.copy} onClick={calibrate} disabled={state !== "running" || calibrating || !live.faceFound}>
            {calibrating ? "기준선 재는 중… 무표정으로 가만히" : baseline ? "무표정 기준선 다시 잡기" : "① 먼저 무표정으로 기준선 잡기 (2초)"}
          </button>
          <span className={s.dim} style={{ marginLeft: 10, fontSize: 13 }}>
            {baseline ? "기준선 적용 중 — 점수는 '내 무표정 대비 상승분'" : "기준선 없음 — 평소 얼굴이 미소·찌푸림으로 읽힐 수 있음"}
          </span>
        </div>
        {live.faceFound && ranked && (
          <>
            <p style={{ fontSize: 28, fontWeight: 800, margin: "4px 0" }}>
              판정: {judged}
              {ranked.ambiguousWith && (
                <span style={{ fontSize: 16, fontWeight: 600, color: "#e0b860" }}> — {ranked.ambiguousWith}와 애매함</span>
              )}
            </p>
            <div style={{ display: "grid", gap: 4, margin: "8px 0", maxWidth: 420 }}>
              {ranked.order.map(([l, r]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ width: 52, color: l === judged ? "#e8e8ea" : "#8c9098" }}>{l}</span>
                  <div style={{ flex: 1, height: 8, background: "#24272e", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                    <div style={{ width: `${Math.min(100, (r / 2) * 100)}%`, height: "100%", background: r >= 1 ? "#6fae7f" : "#4a5260" }} />
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#8c9098" }} />
                  </div>
                  <span style={{ width: 36, textAlign: "right", color: "#8c9098" }}>{r.toFixed(1)}</span>
                </div>
              ))}
            </div>
            <p className={s.dim} style={{ fontSize: 12.5 }}>
              막대 가운데 선(1.0)을 넘으면 "뚜렷이 지었다". 두 표정이 함께 넘으면 "애매함"으로 표시합니다.
            </p>
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <input
            type="text" placeholder="이름(선택, 팀원 구분용)" value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 7, border: "1px solid #3d434d",
              background: "#1b1d22", color: "#e8e8ea", fontSize: 13.5, marginBottom: 10, width: 220,
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className={s.copy} disabled={!judged} onClick={() => submit(true)}
            style={{ background: "#2f4a34", borderColor: "#4f8a5e" }}>
            "{intended}" 지었을 때 → 판정 맞음
          </button>
          <button className={s.copy} disabled={!judged} onClick={() => submit(false)}
            style={{ background: "#4a2f2f", borderColor: "#8a4f4f" }}>
            판정 틀림
          </button>
        </div>
        {submitMsg && <p style={{ marginTop: 10 }}>{submitMsg}</p>}
      </div>

      <div className={s.step}>
        <h2><span>4</span>지금까지 팀 전체 기록</h2>
        {!results && <p className={s.dim}>불러오는 중…</p>}
        {results && results.length === 0 && <p className={s.dim}>아직 기록 없음 — 위에서 첫 기록을 남겨보세요.</p>}
        {results && results.length > 0 && (
          <>
            <p style={{ fontWeight: 700 }}>
              전체 {stats.total}건 · 정확도 {stats.accuracyPct}%
            </p>
            <ul className={s.list}>
              {LABELS.map((l) => (
                <li key={l}>
                  {l}로 지었을 때: {stats.byIntended[l]?.total || 0}건 중 {stats.byIntended[l]?.correct || 0}건 맞음
                  {stats.byIntended[l]?.total ? ` (${Math.round((stats.byIntended[l].correct / stats.byIntended[l].total) * 100)}%)` : ""}
                </li>
              ))}
            </ul>
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", color: "#9aa8c0" }}>최근 기록 {Math.min(20, results.length)}건 펼치기</summary>
              <ul className={s.list} style={{ marginTop: 8, fontSize: 13 }}>
                {[...results].slice(-20).reverse().map((r) => (
                  <li key={r.id} style={{ color: r.correct ? "#7fd67f" : "#f08c8c" }}>
                    {r.correct ? "✓" : "✗"} {r.name || "익명"} — 지은 표정 "{r.intended}" → 판정 "{r.judged}"
                    <span style={{ color: "#8c9098" }}> (공포{r.fear?.toFixed?.(2)}·웃음{r.amusement?.toFixed?.(2)}, {new Date(r.createdAt).toLocaleString("ko-KR")})</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>

      <footer className={s.foot}><a href="/todo">← 대시보드로</a></footer>
    </main>
  );
}

function summarize(results) {
  if (!results) return { total: 0, accuracyPct: 0, byIntended: {} };
  const byIntended = {};
  let correct = 0;
  for (const r of results) {
    if (!byIntended[r.intended]) byIntended[r.intended] = { total: 0, correct: 0 };
    byIntended[r.intended].total++;
    if (r.correct) { byIntended[r.intended].correct++; correct++; }
  }
  return {
    total: results.length,
    accuracyPct: results.length ? Math.round((correct / results.length) * 100) : 0,
    byIntended,
  };
}
