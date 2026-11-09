# 녹화 시간 기록(capture/v2_<장르>.json)으로 컷을 고른다 — 대사가 중간에 잘리지 않게 줄 시작·끝 시각에 맞춘다.
# 사용: python3 make_plans.py <capture 폴더> <slides 폴더> <plan 출력 폴더>
import json, os, sys

CAP, SLIDES, OUT = sys.argv[1:4]
GENRES = {"R": "로맨스", "H": "공포", "C": "블랙코미디"}

def load(g):
    d = json.load(open(os.path.join(CAP, f"v2_{g}.json")))
    src = os.path.join(CAP, f"v2_{g}.mp4")
    cue = {m["name"]: m["t"] for m in d["marks"] if m["type"] == "cue"}
    bus = next((m["t"] for m in d["marks"] if m["type"] == "bus"), None)
    lines = []
    for m in d["marks"]:
        if m["type"] == "line": lines.append({"t": m["t"], "text": m["text"], "seq": m["seq"]})
        if m["type"] == "lineEnd" and lines: lines[-1]["end"] = m["t"]
    return {"src": src, "cue": cue, "bus": bus, "lines": lines}

takes = {g: load(g) for g in GENRES}
subs = {t["src"]: [{"t": l["t"], "end": l["end"], "text": l["text"]} for l in t["lines"] if "end" in l] for t in takes.values()}

def seg(g, a, b, label=None):
    it = {"src": takes[g]["src"], "from": round(a, 2), "to": round(b, 2)}
    if label: it["label"] = label
    return it

def genre_part(g, n_lines, cue="npcWalk", lead=1.0):
    # 그 큐(안내방송·걷기·착석) 조금 전부터 n 번째 줄이 끝날 때까지
    t = takes[g]
    start = t["cue"][cue] - lead
    end = t["lines"][n_lines - 1]["end"] + 0.9
    return seg(g, start, end, GENRES[g])

def ending(g, lead=2.0, tail=3.0):
    t = takes[g]
    last = t["lines"][-1]
    return seg(g, t["bus"] - lead, last["end"] + tail)

def intro(g, spans):
    c = takes[g]["cue"]
    return [seg(g, c[a] + da, c[b] + db) for a, da, b, db in spans]

def slide(name, dur):
    return {"slide": os.path.join(SLIDES, name + ".png"), "dur": dur}

# 1분 축약 — 사건 몽타주 → 세 장르의 첫 만남 → 버스
short_body = intro("R", [("poster", -1.0, "cafeBell", 2.0), ("truckSplash", -1.0, "truckSplash", 4.0), ("cat", -0.5, "cat", 3.5)]) \
    + [genre_part(g, k, "npcSeated", -1.0) for g, k in [("R", 2), ("H", 1), ("C", 2)]] + [ending("R", lead=-1.0, tail=1.5)]
# 2분 풀 — 사건 몽타주 + 안내방송 → 장르마다 두세 줄 → 버스와 마지막 말
full_body = intro("R", [("poster", -1.0, "cafeBell", 3.0), ("truckSplash", -2.0, "truckSplash", 6.0), ("cat", -1.0, "cat", 7.0)]) \
    + [genre_part("R", 2, "announce", 0.3), genre_part("H", 2), genre_part("C", 5)] + [ending("R", tail=2.0)]

def total(items): return sum(i["dur"] if "slide" in i else i["to"] - i["from"] for i in items)

plans = {
    "main": [slide("title", 4), slide("main_intro", 10)] + short_body,
    "sub": [slide("title", 4), slide("scenario", 9), slide("tech", 10), slide("content_dev", 8), slide("tech_dev", 8)] + full_body + [slide("credits", 5)],
    "symposium": [slide("title", 4), slide("scenario", 9), slide("tech", 10)] + full_body + [slide("credits", 5)],
}
os.makedirs(OUT, exist_ok=True)
for name, items in plans.items():
    json.dump({"items": items, "subs": subs}, open(os.path.join(OUT, f"{name}.json"), "w"), ensure_ascii=False, indent=1)
    body = [i for i in items if "src" in i]
    print(f"{name}: 전체 {total(items):.1f}초 · 본영상 {total(body):.1f}초 · 구간 {len(body)}개")
