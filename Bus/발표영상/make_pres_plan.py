# 최종 성과발표 영상 계획 — 장(9개 장면 묶음)마다 내레이션 길이에 맞춰 화면을 나눠 깐다
# 내레이션은 tts/nar_<n>.mp3 (River · eleven_v3), 문장 자막 시각은 tts/captions.json (문장 사이 쉼으로 잼)
# 화면 표기: 동료의 데모 영상(연출 시안)에는 「연출 시안 · 실제 헤드셋 화면 아님」
# 사용: python3 make_pres_plan.py <발표 장 폴더> <쇼케이스 장 폴더> <출력 plan.json>
import json, os, sys

PRES, SHOW, OUT = sys.argv[1:4]
HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.expanduser("~")
D4 = f"{HOME}/Downloads/BUS_STOP_DEMO_4CLIPS_1080_20261110_R01"
R02 = f"{HOME}/Downloads/BUS_STOP_PROMO_3FILMS_R02_4K_MASTER/BUS_STOP_02_SUB_150s_R02_4K.mp4"
CAP = "/Users/drew/CTxAI/ctxai-busstop-xr-audio-proto/capture"
BGM = "/Users/drew/CTxAI/ctxai-busstop-xr-audio-proto/public/reactive/audio/bgm_R.wav"
caps = json.load(open(os.path.join(HERE, "tts", "captions.json")))
nar = lambda i: os.path.join(HERE, "tts", f"nar_{i}.mp3")
CINE_TAG, REAL_TAG = "연출 시안 · 실제 헤드셋 화면 아님", "실제 프로토타입 화면"
cue_R = {m["name"]: m["t"] for m in json.load(open(f"{CAP}/v2_R.json"))["marks"] if m["type"] == "cue"}

def slide(name, folder=PRES): return {"slide": os.path.join(folder, name + ".png"), "dur": None, "fade": 0.4}
def clip(src, a, b, tag=None, vol=0.35, **kw):
    it = {"src": src, "from": a, "to": b, "fade": 0.4, "srcVol": vol, **kw}
    if tag: it["notes"] = [{"kind": "tag", "at": 0.3, "dur": round(b - a - 0.6, 2), "text": tag}]
    return it
def cine_r02(a, b):  # R02 4K 홍보 영상 — 박힌 자막·장르 표시·「연출 시안」 표시를 확대로 잘라낸다
    return clip(R02, a, b, CINE_TAG, vol=0.3, zoom=1.32, zoomCenter=[0.5, 0.44])

# 화면은 동료가 발표용으로 만든 데모 영상 R05(메인·서브·심포지엄 B, 4K 로 늘린 수정본)에서 — 박힌 자막·표시는 확대로 잘라낸다
REV = "/Users/drew/CTxAI/Bus/showcase_edit/render/수정본"
M, S, B = (f"{REV}/버스정류장-기다림_{n}영상_수정.mp4" for n in ("메인", "서브", "심포지엄"))
G = 30  # 장면 길이는 1/30초 격자에 맞춘다 — 어긋나면 이음매에서 합성이 깨졌다(-11841)
snap = lambda x: round(round(x * G) / G, 4)
def demo(src, a, b, cx=0.5, cy=0.46, card=False):
    """데모 영상 구간. card=True 는 동료의 설명 카드(글이 화면 전체) — 확대·출처 표기 없이 그대로"""
    b = a + snap(b - a)
    if card: return clip(src, a, b, None, vol=0.3)
    # 1.38배 — 왼쪽 위 「BUS STOP / 기다림」, 오른쪽 위 「연출 시안」, 아래 자막이 모두 화면 밖으로 나간다
    return clip(src, a, b, CINE_TAG, vol=0.3, zoom=1.38, zoomCenter=[cx, cy])

items, narration, captions = [], [], []
t = 0.0
def section(i, visuals, lead=1.0, tail=1.4, extra=0.0, nar_at=None):
    """visuals: [(item, weight 또는 None=고정 길이)] — 장면 길이 = 앞 여유 + 내레이션 + 뒤 여유 + 말 없는 여분"""
    global t
    n = caps[str(i)]["dur"]
    fixed = sum(v["to"] - v["from"] for v, w in visuals if w is None)
    total = lead + n + tail + extra
    flex = max(total - fixed, 0); wsum = sum(w for _, w in visuals if w)
    start = t
    for v, w in visuals:
        if w is not None: v["dur"] = snap(flex * w / wsum)
        d = v["dur"] if "slide" in v else v["to"] - v["from"]
        items.append(v); t += d
    at = start + (lead if nar_at is None else nar_at)
    narration.append({"src": nar(i), "at": round(at, 2), "vol": 1.0})
    for s in caps[str(i)]["sents"]:
        captions.append({"t": round(at + s["t"], 2), "dur": round(s["end"] - s["t"] + 0.15, 2), "text": s["text"]})

# 0. 오프닝 — 말 없이 카페에서 나와 횡단보도를 건너는 사람 8초, 타이틀 위에 내레이션
o = demo(B, 22.0, 30.2); items.append(o); t += o["to"] - o["from"]
section(0, [(slide("title", SHOW), 1)], lead=1.2, tail=1.6)
# 1. 기획 의도 — 한 문장 → VR 을 쓰고 벤치에 앉은 관객
section(1, [(slide("p_intent"), 1), (demo(S, 6.0, 10.5), None)], tail=1.6)
# 2. 무엇이 새로운가 — 분기 대신 섞기 → 고정 구조·가변 표현 → 동료의 카드 「인물과 공간이, 함께 다른 영화가 됩니다」
section(2, [(slide("p_branch"), 1.3), (slide("p_fixed"), 1.0), (demo(B, 70.0, 77.0, card=True), None)], extra=2.0)
# 3. 관객이 겪는 5분 — 건너는 사람 → 트럭 → 고양이 → 카드 「선택지를 누르기 전에, 몸이 먼저 반응합니다」 → 사건 타임라인
section(3, [(demo(B, 26.0, 30.0), None), (demo(B, 44.5, 48.0, cx=0.45), None), (demo(B, 50.5, 55.0, cx=0.42, cy=0.52), None),
            (demo(B, 61.0, 66.5, card=True), None), (slide("p_events"), 1)], extra=2.0)
# 4. 어떻게 작동하나 — 세 층 → 눈에 띄는 순간 → 대사 → 카드 「미리 준비한 세계」 → 옆 사람이 말을 건다
section(4, [(slide("p_layers"), 3.2), (slide("p_triggers"), 2.6), (slide("p_lines"), 2.4), (demo(B, 115.5, 121.0, card=True), None),
            (demo(S, 75.0, 80.0), None)], extra=4.0)
# 5. 무엇을 만들었나 — 만든 것 → 마지막 문장(연출 시안)에 세 장르 인물
section(5, [(slide("p_built"), 1), (demo(S, 76.0, 80.5), None), (demo(S, 94.0, 98.5), None), (demo(S, 112.0, 116.5), None)], extra=1.0)
# 6. 바뀐 것과 배운 것
section(6, [(slide("p_changes"), 1)])
# 7. 남은 과제
section(7, [(slide("p_limits"), 1)])
# 8. 엔딩 — 버스 도착(말 없이 4초) 위로 내레이션, 끝 문구
section(8, [(demo(S, 133.0, 140.5), None), (slide("card_end", SHOW), 1)], lead=4.0, tail=1.2, nar_at=4.0)
items += [{"slide": os.path.join(SHOW, "credits.png"), "dur": 7.0, "fade": 0.5}, {"slide": os.path.join(PRES, "p_thanks.png"), "dur": 5.0, "fade": 0.6}]
t += 12.0

json.dump({"items": items, "subs": {}, "narration": narration, "captions": captions, "bed": {"src": BGM, "vol": 0.16}},
          open(OUT, "w"), ensure_ascii=False, indent=1)
print(f"전체 {t:.1f}초 ({t / 60:.1f}분) · 항목 {len(items)} · 자막 {len(captions)}")
