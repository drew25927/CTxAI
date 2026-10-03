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

const LABELS = ["무표정", "공포", "웃음"];
const LABEL_DESC = { 무표정: "표정 없이 평소 얼굴", 공포: "눈 크게 뜨고 눈썹 위로(무서운 표정)", 웃음: "활짝 웃으며 볼 조이기" };

function classify(fear, amusement) {
  if (amusement >= fear && amusement > EXPR_TH) return "웃음";
  if (fear > amusement && fear > EXPR_TH) return "공포";
  return "무표정";
}

export default function FaceCheck() {
  const [state, setState] = useState("idle"); // idle | running | done | error
  const [live, setLive] = useState({ faceFound: false });
  const [error, setError] = useState(null);
  const [intended, setIntended] = useState("무표정");
  const [name, setName] = useState("");
  const [results, setResults] = useState(null);
  const [submitMsg, setSubmitMsg] = useState(null);

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
      const obs = await observe(videoRef.current, OBSERVE_MS, setLive);
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

  const judged = live.faceFound && typeof live.fear === "number" ? classify(live.fear, live.amusement) : null;

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
              {l}
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
        {live.faceFound && judged && (
          <>
            <p style={{ fontSize: 28, fontWeight: 800, margin: "4px 0" }}>
              판정: {judged}
            </p>
            <p style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 14, color: "#8c9098" }}>
              공포 {live.fear.toFixed(3)} · 웃음 {live.amusement.toFixed(3)} (문턱값 {EXPR_TH})
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
