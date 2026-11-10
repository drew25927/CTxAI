# 녹화 시간 기록(capture/v2_<장르>.json)으로 컷을 고른다 — 대사가 중간에 잘리지 않게 줄 시작·끝 시각에 맞춘다.
# 11/9 재편집: 체험 순서를 따라가지 않고 훅 구조로 —
#   「같은 정류장. 같은 5분.」 → 세 인물의 센 한 마디 → 「옆에 앉는 사람은, 당신이 정한다.」 → 사건 몽타주(원인)
#   → 세 화면 비교(같은 순간, 세 영화) → 장르별 예고편 → 버스 → 「버스는 누구에게나 온다…」 → 타이틀
# 빈 도로·걸어 들어오는 컷아웃·대사 사이 긴 침묵은 쓰지 않는다.
# 사용: python3 make_plans.py <capture 폴더> <slides 폴더> <plan 출력 폴더>
import json, os, sys

CAP, SLIDES, OUT = sys.argv[1:4]
GENRES = {"R": "로맨스", "H": "공포", "C": "블랙코미디"}

def load(g):
    d = json.load(open(os.path.join(CAP, f"v2_{g}.json")))
    cue = {m["name"]: m["t"] for m in d["marks"] if m["type"] == "cue"}
    bus = next((m["t"] for m in d["marks"] if m["type"] == "bus"), None)
    lines = {}
    last = None
    for m in d["marks"]:
        if m["type"] == "line": last = m["seq"]; lines[last] = {"t": m["t"], "text": m["text"]}
        if m["type"] == "lineEnd" and last: lines[last]["end"] = m["t"]
    return {"src": os.path.join(CAP, f"v2_{g}.mp4"), "cue": cue, "bus": bus, "lines": lines}

takes = {g: load(g) for g in GENRES}
SUB_FIX = {"...차도남 인가. 멋있다": "...차도남인가. 멋있다.", "카페 종소리 들으셨죠.": "카페 종소리 들으셨죠?"}  # 자막 표기만 (원본 대사 파일은 그대로)
def fix(text):
    for a, b in SUB_FIX.items(): text = text.replace(a, b)
    return text
subs = {t["src"]: [{"t": l["t"], "end": l["end"], "text": fix(l["text"])} for l in t["lines"].values() if "end" in l] for t in takes.values()}

BED_QUIET = 10.0  # 로맨스 녹화 도입부에서 음량이 고른 구간(10~36초, 개구리 37초 전) — 장은 최대 26초 (카페 종 12~14초는 작게 섞인다)
def slide(name, dur, bed=None):
    it = {"slide": os.path.join(SLIDES, name + ".png"), "dur": dur}
    if bed is not None: it["audio"] = {"src": takes["R"]["src"], "from": bed, "vol": 0.8 if bed != BED_QUIET else 0.55}  # 로맨스 녹화 도입부의 빗소리·BGM 을 깐다
    return it

def line(g, seq, pre=0.4, post=0.6, label=None, fade=0.15):
    l = takes[g]["lines"][seq]
    it = {"src": takes[g]["src"], "from": round(l["t"] - pre, 2), "to": round(l["end"] + post, 2), "fade": fade}
    if label: it["label"] = label
    return it

def event(cue, a, b, caption):
    c = takes["R"]["cue"][cue]
    return {"src": takes["R"]["src"], "from": round(c + a, 2), "to": round(c + b, 2), "caption": caption, "fade": 0.25}

def triptych():
    # 같은 순간의 세 영화 — 차례로 한 마디씩. (장르, 줄, 원본에서 띠를 자를 왼쪽 x — 인물이 칸 가운데 오게)
    picks = [("R", "05", 400), ("H", "04", 550), ("C", "08", 280)]
    panels, turns, t = [], [], 0.0
    for i, (g, seq, cx) in enumerate(picks):
        l = takes[g]["lines"][seq]
        lead = 0.7 if i == 0 else 0.4
        start = t
        t = start + lead + (l["end"] - l["t"]) + (0.8 if i == len(picks) - 1 else 0.5)
        turns.append([round(start, 2), round(t, 2)])
        panels.append({"src": takes[g]["src"], "from": round(l["t"] - start - lead, 2), "cx": cx})
    return {"tri": panels, "dur": round(t, 2), "turns": turns, "labels": [GENRES[g] for g, _, _ in picks], "head": "같은 순간, 세 개의 영화", "fade": 0.4}

def trailer(g, seqs):
    return [line(g, s, label=GENRES[g] if i == 0 else None) for i, s in enumerate(seqs)]

def bus(a=3.5):
    # 버스가 화면에 들어온 뒤부터 로맨스 인물의 마지막 말(「응원해 주세요!」)까지 — 버스 도착 전 빈 도로는 쓰지 않는다
    t = takes["R"]
    last = t["lines"][max(t["lines"])]
    return {"src": t["src"], "from": round(t["bus"] + a, 2), "to": round(last["end"] + 0.7, 2), "fade": 0.3}

# 시험판(DEMO=<데모 클립 폴더>): 1080p 시네마틱 두 컷을 섞는다 — 본영상 앞 VR 관객 컷, 몽타주의 고양이
DEMO = os.environ.get("DEMO")
def vr():
    # 01 오프닝 0~5초는 VR 을 쓴 관객이 벤치에 앉아 고개를 돌리는 장면(거의 무음) — 빗소리·BGM 을 깐다
    return {"src": os.path.join(DEMO, "01_OPENING_CAFE_CROSSING_1080p.mp4"), "from": 0.9, "to": 4.85, "fade": 0.4,
            "audio": {"src": takes["R"]["src"], "from": BED_QUIET, "vol": 0.55}}
def demo_cat():
    # 04 고양이가 털을 세우고 뛰어오른 뒤 걸어가는 데까지
    return {"src": os.path.join(DEMO, "04_CAT_FOREST_EXIT_1080p.mp4"), "from": 0.2, "to": 4.6, "caption": "무엇을 바라보는지", "fade": 0.25}

hook = [line("H", "13"), line("C", "10"), line("R", "12")]
# 포스터는 정면 카메라에 잡히지 않고(유리 옆), 트럭은 화면을 1.5초쯤만 지나간다 — 보이는 순간만 쓴다
montage = [event("truckSplash", -0.7, 1.6, "무엇에 놀라는지"), event("cat", -0.4, 4.6, "무엇을 바라보는지")]

if DEMO:
    montage[1] = demo_cat()
    for m in montage: m["box"] = True  # 고양이 컷은 바닥이 밝아 문구가 묻힌다 — 두 문구 모두 띠를 깐다
lead = [vr()] if DEMO else []

full_body = (lead + [slide("card_open", 3.2, bed=16.0)] + hook + [slide("card_choice", 3.2, bed=19.5)] + montage + [triptych()]
             + trailer("R", ["02", "07", "13"]) + trailer("H", ["01", "06", "11"]) + trailer("C", ["01", "09", "15"])
             + [bus(), slide("card_end", 4.5, bed=16.5)])
short_body = (lead + [slide("card_open", 2.6, bed=16.0)] + hook + [slide("card_choice", 2.6, bed=19.0), triptych()]
              + [line("R", "07", label="로맨스"), line("H", "01", label="공포"), line("C", "09", label="블랙코미디")]
              + [bus(a=4.5), slide("card_end", 4.0, bed=16.5)])

# 데모 소스판(DEMO=<4클립 폴더> DEMO_COMEDY=<블랙코미디 폴더> DEMO_ONLY=1): 본영상 화면을 데모 시네마틱으로만 짠다 (장·문구 카드는 그대로).
# 4클립 01: 0~5초 VR 관객 · 5~7.5초 벤치에서 본 정면 · 8초~ 카페에서 나온 인물이 횡단보도를 건넘 / 02: 빈 인도 (무음)
#        03: 2.4~3.9초 트럭 · 3.4초 물보라 / 04: 0.5~3.5초 고양이
# 블랙코미디 03: 인물이 인도를 걸어오며 할머니로 변하고(0~15초) 옆에 앉는다(15~25초)
# 소리가 거의 없는 컷엔 녹화본의 빗소리·BGM 만 깐다(화면은 안 씀).
def demo(n, a, b, caption=None, bed=False, fade=0.3, label=None, pkg=None):
    names = {1: "01_OPENING_CAFE_CROSSING", 2: "02_SIDEWALK_APPROACH", 3: "03_TRUCK_SPLASH", 4: "04_CAT_FOREST_EXIT"}
    src = os.path.join(pkg, n) if pkg else os.path.join(DEMO, names[n] + "_1080p.mp4")
    it = {"src": src, "from": a, "to": b, "fade": fade}
    if caption: it.update(caption=caption, box=True)
    if label: it["label"] = label
    if bed: it["audio"] = {"src": takes["R"]["src"], "from": BED_QUIET, "vol": 0.55}
    return it
if DEMO and os.environ.get("DEMO_ONLY"):
    COMEDY = os.environ["DEMO_COMEDY"]
    demo_body = [slide("card_open", 3.2, bed=16.0), vr(), demo(1, 4.95, 7.4),
                 demo(1, 9.4, 17.6, bed=True),                                   # 옆에 앉을 사람이 온다
                 slide("card_predict", 3.6, bed=19.5),                           # 장르가 하나뿐이라 「당신이 정한다」 대신 감정 예측으로 흐름이 바뀐다는 말
                 demo("03_BUS_STOP_COMEDY_R03_FULL_1080p.mp4", 0.6, 25.0, bed=True, fade=0.4, pkg=COMEDY),  # 장르가 하나뿐이라 라벨 없이
                 demo(3, 2.0, 4.9, "무엇에 놀라는지", fade=0.25), demo(4, 0.2, 6.0, "무엇을 바라보는지", fade=0.25),
                 demo(2, 1.0, 6.0, bed=True, fade=0.5),                          # 다시 조용한 기다림
                 slide("card_end", 4.5, bed=16.5)]
    full_body = short_body = demo_body

def total(items): return sum(i["dur"] if "dur" in i else i["to"] - i["from"] for i in items)

plans = {
    "main": [slide("title", 5, bed=BED_QUIET), slide("main_intro", 26, bed=BED_QUIET)] + short_body,
    "sub": [slide("title", 5, bed=BED_QUIET), slide("scenario", 18, bed=BED_QUIET), slide("tech", 19, bed=BED_QUIET), slide("content_dev", 16, bed=BED_QUIET), slide("tech_dev", 16, bed=BED_QUIET)] + full_body + [slide("credits", 7, bed=BED_QUIET)],
    "symposium": [slide("title", 5, bed=BED_QUIET), slide("scenario", 20, bed=BED_QUIET), slide("tech", 20, bed=BED_QUIET)] + full_body + [slide("credits", 7, bed=BED_QUIET)],
}
os.makedirs(OUT, exist_ok=True)
for name, items in plans.items():
    json.dump({"items": items, "subs": subs}, open(os.path.join(OUT, f"{name}.json"), "w"), ensure_ascii=False, indent=1)
    body = short_body if name == "main" else full_body
    print(f"{name}: 전체 {total(items):.1f}초 · 본영상 {total(body):.1f}초 · 항목 {len(items)}개")
