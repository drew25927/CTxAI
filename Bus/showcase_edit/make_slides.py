# 쇼케이스 영상 레이아웃 장 — 주최측 「영상콘텐츠 레이아웃」(예시: MineD) 구조를 우리 내용으로 다시 만든다.
# 1920×1080 CSS 로 쓰고 snap(WKWebView)으로 3840×2160 PNG 를 뽑는다.
# 사용: python3 make_slides.py <배경 jpg 폴더> <출력 폴더>
import html, os, sys

BG, OUT = sys.argv[1], sys.argv[2]
ART = "/Users/drew/CTxAI/Bus/ArtWork_Final"
os.makedirs(OUT, exist_ok=True)

HEADER = "2026 KAIST CT×AI 콘텐츠 마이크로디그리 과정 | <b>팀 프로젝트</b>"
TITLE_KO, TITLE_EN = "버스 정류장 - 기다림", "Bus Stop - The Waiting"
TEAM = "팀 운칠기삼"
MEMBERS = ["김운기", "이혜원", "윤단", "정동욱"]
AI_TOOLS = "Claude Haiku 4.5, ElevenLabs, Suno, MediaPipe, Claude Code"

SCENARIO_SHORT = ("소나기가 막 그친 오후, 관객은 VR 속 정류장 벤치에 앉아 버스를 기다린다. 아무것도 고르지 않아도 "
                  "어디를 보고 어떻게 움직였는지가 하늘과 빛, 옆에 앉는 사람과 그 사람의 말을 바꾸어, 같은 정류장에서 "
                  "누군가는 로맨스를, 누군가는 공포를, 누군가는 블랙코미디를 보고 나온다.")
TECH_SHORT = ("헤드셋의 고개 방향과 머문 시간을 읽어 세 장르의 배합 비율을 체험 내내 갱신하고, 그 비율이 하늘·안개·가로등·"
              "옆사람이 앉는 거리와 대사 사이의 침묵을 매 프레임 바꾼다. Next.js·three.js·WebXR 로 만들어 Meta Quest 3 에서 실행된다.")
SCENARIO_LONG = (SCENARIO_SHORT + " 기다림은 아무 일도 일어나지 않는 시간이 아니라, 내가 어떤 사람인지가 조용히 드러나는 시간이다. "
                 "그래서 선택지를 내미는 대신 관객이 기다리는 모습 자체가 영화를 만들게 했다. 버스는 누구에게나 온다. 결말은 같고, 기다린 방식만 다르다.")
TECH_LONG = ("포스터가 파닥이고, 트럭이 물보라를 튀기고, 고양이가 눈앞에 멈춰 서는 사건들이 관객에게 아무것도 요구하지 않는 측정 장치다. "
             "고개 방향과 머문 시간을 읽어 로맨스·공포·블랙코미디의 배합을 갱신하고, 그 배합이 장면 전체를 매 프레임 움직인다. "
             "대사는 실시간 생성의 지연과 품질 편차를 피하려고 확정 46줄과 장르 변주까지 138줄을 미리 AI 음성으로 합성해 두고, "
             "재생 직전에 현재 배합에 가장 가까운 줄을 고른다. 질문 뒤에는 관객의 끄덕임과 고개 젓기를 대답으로 읽는다.")

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;font-family:'Apple SD Gothic Neo','AppleSDGothicNeo-Regular',sans-serif;-webkit-font-smoothing:antialiased}
.dark{position:relative;width:1920px;height:1080px;color:#fff;background:#111;overflow:hidden}
.bgimg{position:absolute;inset:-30px;background:center/cover no-repeat;filter:blur(var(--blur,0px))}
.dark::before{content:'';position:absolute;inset:0;background:var(--shade);z-index:1}
.dark>*:not(.bgimg){z-index:2}
.hdr{position:absolute;top:34px;left:48px;font-size:17px;color:rgba(255,255,255,.75);letter-spacing:.2px}
.hdr b{color:#fff}
.accent{color:#F39A2B}
.foot{position:absolute;left:0;right:0;bottom:62px;text-align:center;font-size:24px;font-weight:700}
.foot::before{content:'';display:block;width:84px;height:1px;background:rgba(255,255,255,.55);margin:0 auto 26px}
.light{position:relative;width:1920px;height:1080px;background:#fff;color:#222}
.light .hdr{color:#999}.light .hdr b{color:#555}
.light .foot{color:#999;font-weight:600}.light .foot::before{background:#ccc}
"""

def page(body, cls, bg=None, shade="rgba(0,0,0,.55)", blur=6):
    style = f"--shade:{shade};--blur:{blur}px" if bg else ""
    layer = f"<div class='bgimg' style=\"background-image:url('file://{bg}')\"></div>" if bg else ""
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body><div class='{cls}' style=\"{style}\">{layer}{body}</div></body></html>"

def write(name, doc):
    with open(os.path.join(OUT, name + ".html"), "w") as f: f.write(doc)

e = html.escape
foot = f"<div class='foot'>{TEAM}</div>"

# 타이틀
write("title", page(f"""
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-bottom:40px">
  <div style="font-size:19px;color:rgba(255,255,255,.8);margin-bottom:46px">{HEADER}</div>
  <div class="accent" style="font-size:150px;font-weight:800;letter-spacing:-4px;line-height:1.05">버스 정류장</div>
  <div style="font-size:52px;font-weight:300;margin-top:22px;letter-spacing:1px">기다림 · {TITLE_EN}</div>
</div>{foot}""", "dark", f"{BG}/R_100.jpg", "linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.65))", blur=3))

# 메인 디스플레이 작품 소개 (시나리오 + 구현 기술 요약)
write("main_intro", page(f"""
<div class="hdr">{HEADER}</div>
<div class="accent" style="position:absolute;top:66px;left:48px;font-size:32px;font-weight:700">{TITLE_KO}</div>
<div style="position:absolute;top:150px;left:200px;right:200px;bottom:170px;display:flex;flex-direction:column;justify-content:center;text-align:center">
  <div class="accent" style="font-size:30px;font-weight:600;margin-bottom:20px">콘텐츠 시나리오</div>
  <div style="font-size:31px;line-height:1.75">{e(SCENARIO_SHORT)}</div>
  <div class="accent" style="font-size:30px;font-weight:600;margin:56px 0 20px">구현 기술</div>
  <div style="font-size:31px;line-height:1.75">{e(TECH_SHORT)}</div>
  <div style="font-size:27px;margin-top:34px"><b>AI Tool</b> <span style="opacity:.85">{AI_TOOLS}</span></div>
</div>{foot}""", "dark", f"{BG}/H_100.jpg", "rgba(0,0,0,.72)"))

def text_page(name, label, text, bg, tools=False):
    write(name, page(f"""
<div class="hdr">{HEADER}</div>
<div style="position:absolute;top:150px;left:230px;right:230px;bottom:190px;display:flex;flex-direction:column;justify-content:center;text-align:center">
  <div class="accent" style="font-size:34px;font-weight:600;margin-bottom:34px">{TITLE_KO}</div>
  <div class="accent" style="font-size:31px;font-weight:600;margin-bottom:28px">{label}</div>
  <div style="font-size:31px;line-height:1.8">{e(text)}</div>
  {f'<div style="font-size:27px;margin-top:40px"><b>AI Tool</b> <span style="opacity:.85">{AI_TOOLS}</span></div>' if tools else ''}
</div>{foot}""", "dark", bg, "rgba(0,0,0,.7)"))

text_page("scenario", "콘텐츠 시나리오", SCENARIO_LONG, f"{BG}/R_75.jpg")
text_page("tech", "구현 기술", TECH_LONG, f"{BG}/C_100.jpg", tools=True)

# 콘텐츠 개발 / 기술 개발 — 흰 바탕 3칸
PANEL_CSS = ("position:absolute;top:250px;bottom:150px;width:560px;border:1.5px solid #ccc;padding:22px 22px 18px;"
             "display:flex;flex-direction:column")
def panel(x, num, title, inner, text):
    return (f"<div style='{PANEL_CSS};left:{x}px'><div style='font-size:22px;font-weight:700;margin-bottom:16px'>{num} "
            f"<span style='color:#E2582B'>{title}</span></div><div style='flex:1;min-height:0'>{inner}</div>"
            f"<div style='font-size:19px;line-height:1.6;color:#444;margin-top:16px'>{e(text)}</div></div>")
def light_page(name, heading, panels):
    write(name, page(f"""
<div class="hdr">{HEADER}</div>
<div style="position:absolute;top:66px;left:48px;font-size:30px;color:#888">{TITLE_KO}</div>
<div style="position:absolute;top:150px;left:90px;font-size:42px;font-weight:700">{heading}</div>
{''.join(panel(90 + i * 590, f'0{i+1}', *p) for i, p in enumerate(panels))}
<div class="foot">{TEAM}</div>""", "light"))

def img(path, style=""):
    return f"<div style=\"background:#eee url('file://{path}') center/cover no-repeat;{style}\"></div>"
def grid(cells, cols):
    return f"<div style='display:grid;grid-template-columns:repeat({cols},1fr);gap:8px;height:100%'>{''.join(cells)}</div>"

light_page("content_dev", "콘텐츠 개발", [
    ("캐릭터 원화 · 컷아웃",
     grid([img(f"{ART}/{d}/04_캐릭터마스터숏_{g}.png") for d, g in [("2_로맨스", "로맨스"), ("3_공포", "공포"), ("4_코미디", "코미디")]], 1),
     "세 장르의 옆사람을 직접 그린 원화로 만들고, 2D 컷아웃으로 오려 3D 정류장에 앉혔다. 배합이 정해지면 그 장르의 인물이 걸어와 옆에 앉는다."),
    ("정류장 장면 · 장르 조명",
     grid([img(f"{ART}/{d}/02_메인뷰_{g}.png") for d, g in [("1_디폴트", "디폴트_보정"), ("2_로맨스", "로맨스"), ("3_공포", "공포"), ("4_코미디", "코미디")]], 2),
     "아트팀이 만든 정류장 장면을 웹으로 옮기고, 기본·로맨스·공포·코미디 네 조명 룩을 배합 비율대로 섞는다. 하늘·안개·가로등이 체험 내내 움직인다."),
    ("사건 · 대사 · 사운드",
     grid([img(f"{ART}/1_디폴트/04_트럭_마스터숏_디폴트.png"), img(f"{ART}/1_디폴트/06_고양이마스터샷_디폴트.png")], 1),
     "트럭과 고양이 같은 사건이 관객의 시선을 끈다. 대사 138줄은 ElevenLabs 로 미리 합성했고, 장르별 BGM 세 트랙이 늘 함께 흐르며 볼륨만 배합을 따른다."),
])

def flow(items):
    box = "border:1.5px solid #E2582B;border-radius:10px;padding:12px 14px;font-size:20px;text-align:center;background:#FFF6F1"
    arrow = "<div style='text-align:center;color:#E2582B;font-size:22px;line-height:1.2'>▼</div>"
    return "<div style='display:flex;flex-direction:column;justify-content:center;height:100%'>" + arrow.join(f"<div style='{box}'>{i}</div>" for i in items) + "</div>"

light_page("tech_dev", "기술 개발", [
    ("배합 엔진",
     flow(["관객의 반응<br><span style='font-size:16px;color:#777'>고개 방향 · 머문 시간 · 끄덕임</span>",
           "증거 → 로맨스 · 공포 · 코미디 배합",
           "매핑표",
           "하늘 · 안개 · 가로등 · 옆사람 거리<br>대사 사이 침묵 · BGM"]),
     "선택지 대신 반응을 증거로 모은다. 오래된 반응은 무게가 줄고, 배합은 이산 판정 한 번(누가 앉는가) 뒤에도 계속 흐른다."),
    ("시스템 구조",
     flow(["Meta Quest 3 · WebXR 브라우저",
           "Next.js · three.js (React Three Fiber)",
           "미리 합성한 대사 · 효과음 · BGM (로컬)",
           "운영자 모니터 · 세션 기록 · QR 카드"]),
     "헤드셋 브라우저에서 바로 실행된다. 실시간 생성 없이 미리 합성한 소리만 써서 지연이 없고, 체험이 끝나면 「오늘의 정류장 카드」를 QR 로 받는다."),
    ("반응 읽기",
     flow(["사건마다 방향과 시간창",
           "고개가 돌아갔나 · 얼마나 머물렀나",
           "질문 뒤: 끄덕임 · 가로젓기 · 돌림",
           "증거로 누적"]),
     "포스터·트럭·고양이처럼 소리가 나는 쪽을 미리 알기 때문에, 고개가 그쪽으로 돌았는지와 머문 시간만으로 관객의 태도를 읽는다."),
])

# 크레딧
write("credits", page(f"""
<div class="hdr">{HEADER}</div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-bottom:60px">
  <div class="accent" style="font-size:34px;font-weight:600;margin-bottom:44px">{TITLE_KO}</div>
  <div style="font-size:27px;color:#F7C08A;margin-bottom:20px">개발팀</div>
  <div style="font-size:31px;color:#F7C08A;font-weight:700;margin-bottom:26px">{TEAM}</div>
  {''.join(f'<div style="font-size:32px;line-height:1.75">{m}</div>' for m in MEMBERS)}
</div>{foot}""", "dark", f"{BG}/C_130.jpg", "rgba(0,0,0,.66)"))
print("ok")
