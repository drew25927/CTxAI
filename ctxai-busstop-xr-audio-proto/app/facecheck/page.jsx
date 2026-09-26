"use client";

// 웹캠 표정 인식(fear/amusement)이 실제로 되는지 팀원 각자 확인하는 페이지.
//
// /interim(S2·S4)·/story-v2·/judge-v2가 전부 같은 lib/behaviorSense.js의 observe()로
// 표정을 읽는데, 그 전제(카메라가 무서운/웃는 표정을 실제로 구분하는가) 자체는
// 아무도 실측한 적이 없었다 — 시나리오를 연기하며 최종 등급만 보면, 등급이 틀렸을 때
// 그게 표정 인식 문제인지 등급 경계값 문제인지 구분이 안 된다. 이 페이지는 마이크·
// LLM 호출 없이 카메라만 켜서, 그 전제 하나만 따로 확인한다 — 팀원 각자 자기
// 카메라·조명·자리에서 한 번씩 눌러봐야 한다(한 사람만 확인하고 넘어가면 안 됨).

import { useRef, useState } from "react";
import { observe } from "@/lib/behaviorSense";
import s from "../tool/tool.module.css";

const OBSERVE_MS = 90000;

export default function FaceCheck() {
  const [state, setState] = useState("idle"); // idle | running | done | error
  const [live, setLive] = useState({ faceFound: false });
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

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
      await observe(videoRef.current, OBSERVE_MS, setLive);
      setState("done");
    } catch (e) {
      setError(e?.message || String(e));
      setState("error");
    }
  }

  return (
    <main className={s.wrap}>
      <h1>웹캠 표정 인식 확인</h1>
      <p className={s.dim}>
        <code>/interim</code>·<code>/film</code>의 놀람(S2)·정서(S4) 판정은 웹캠이 표정을 얼마나
        정확히 읽는지에 달려 있습니다. 전체 시나리오 셀프테스트(<code>Bus/규격/셀프테스트_임계값_보정.md</code>)를
        하기 전에, <b>팀원 각자 자기 카메라·조명·자리에서</b> 이 확인부터 통과해 주세요 — 한 사람만 해보고
        결과를 공유하는 게 아니라, 각자 자기 화면에서 직접 눌러봐야 합니다.
      </p>

      <div className={s.step}>
        <h2><span>1</span>카메라 켜고 확인 시작</h2>
        <video
          ref={videoRef} muted playsInline
          style={{ width: 260, borderRadius: 10, transform: "scaleX(-1)", background: "#111", display: "block", marginBottom: 12 }}
        />
        <button className={s.copy} onClick={run} disabled={state === "running"}>
          {state === "running"
            ? `관찰 중… (${OBSERVE_MS / 1000}초 — 그 사이 아래 3번 표정을 차례로 지어보세요)`
            : state === "done" ? "다시 확인" : "카메라 켜고 확인 시작"}
        </button>
        {error && (
          <p style={{ color: "#f08c8c", marginTop: 10 }}>
            카메라를 켤 수 없습니다: {error}. 브라우저 주소창 왼쪽의 카메라 권한을 허용했는지 확인해 주세요.
          </p>
        )}
      </div>

      <div className={s.step}>
        <h2><span>2</span>실시간 숫자</h2>
        <p>{live.faceFound ? "얼굴 감지됨" : "얼굴 없음 — 정면을 보고 밝은 곳에서 시도하세요"}</p>
        {live.faceFound && typeof live.fear === "number" && (
          <p style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 20, fontWeight: 700, margin: "6px 0 0" }}>
            공포 {live.fear.toFixed(3)} · 웃음 {live.amusement.toFixed(3)}
          </p>
        )}
      </div>

      <div className={s.step}>
        <h2><span>3</span>아래 표정을 하나씩 지어보고 확인</h2>
        <ul className={s.list}>
          <li>무표정 — 공포·웃음 둘 다 낮게(0에 가깝게) 나와야 정상</li>
          <li><b>무서운 표정</b> — 눈을 크게 뜨고 눈썹을 위로 올린다 → <b>공포</b>만 뚜렷이 올라가야 정상</li>
          <li><b>웃는 표정</b> — 활짝 웃으며 볼을 조인다(진짜 웃음) → <b>웃음</b>만 뚜렷이 올라가야 정상</li>
        </ul>
        <p className={s.dim} style={{ marginTop: 10 }}>
          숫자가 표정과 상관없이 거의 안 움직이거나, 두 표정에서 숫자가 같이 오르면 — 여기서 멈추고
          개발 쪽에 알려주세요. 이 상태로 뒤의 시나리오 테스트를 해봐야 등급이 왜 그렇게 나왔는지
          (표정 인식 문제인지, 등급 경계값 문제인지) 원인을 못 가릅니다.
        </p>
      </div>

      <footer className={s.foot}><a href="/todo">← 대시보드로</a></footer>
    </main>
  );
}
