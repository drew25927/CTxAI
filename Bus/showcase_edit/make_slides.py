# 쇼케이스 영상 레이아웃 장 — 주최측 「영상콘텐츠 레이아웃」(예시: MineD) 구조를 우리 내용으로 다시 만든다.
# 타이포는 디렉토리북 포스터를 따른다: 크림색, 제목 함렛 Black, 보조 문구 본명조 Light(자간 넓게), 양옆 가는 선.
# 1920×1080 CSS 로 쓰고 snap(WKWebView)으로 3840×2160 PNG 를 뽑는다.
# 사용: python3 make_slides.py <배경 jpg 폴더> <출력 폴더>
import html, os, sys

BG, OUT = sys.argv[1], sys.argv[2]
ART = "/Users/drew/CTxAI/Bus/ArtWork_Final"
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")  # Hahmlet·Noto Serif KR 가변 글꼴 (OFL)
os.makedirs(OUT, exist_ok=True)

HEADER = "2026 KAIST CT×AI 콘텐츠 마이크로디그리 과정 | 팀 프로젝트"
TITLE_KO, TITLE_EN = "버스정류장", "BUS STOP · THE WAITING"
TAGLINE = "같은 정류장, 당신에게만 다른 이야기."  # 포스터 문구
TEAM = "팀 운칠기삼"
MEMBERS = ["김운기", "이혜원", "윤단", "정동욱"]
# 「옆 사람」의 공백은 줄바꿈 안 되는 공백(U+00A0) — 「옆 / 사람」으로 갈리지 않게
AI_TOOLS = "Claude Haiku 4.5, ElevenLabs, Suno, MiniMax, MediaPipe, Claude Code"  # MiniMax: 본영상 블랙코미디 시네마틱

SCENARIO_SHORT = ("소나기가 막 그친 오후, 관객은 VR 속 정류장 벤치에 앉아 버스를 기다린다. 아무것도 고르지 않아도 "
                  "어디를 보고 어떻게 움직였는지가 하늘과 빛, 옆에 앉는 사람과 그 사람의 말을 바꾸어, 같은 정류장에서 "
                  "누군가는 로맨스를, 누군가는 공포를, 누군가는 블랙코미디를 보고 나온다.")
TECH_SHORT = ("헤드셋의 고개 방향과 머문 시간을 읽어 세 장르의 배합 비율을 체험 내내 갱신하고, 그 비율이 하늘·안개·가로등·"
              "옆 사람이 앉는 거리와 대사 사이의 침묵을 매 프레임 바꾼다. Next.js·three.js·WebXR로 만들어 Meta Quest 3에서 실행된다.")
SCENARIO_LONG = (SCENARIO_SHORT + " 기다림은 아무 일도 일어나지 않는 시간이 아니라, 내가 어떤 사람인지가 조용히 드러나는 시간이다. "
                 "그래서 선택지를 내미는 대신 관객이 기다리는 모습 자체가 영화를 만들게 했다. 버스는 누구에게나 온다. 결말은 같고, 기다린 방식만 다르다.")
SCENARIO_ONE_RUN = " 소개 영상의 시네마틱 장면은 그중 블랙코미디로 흐른 한 회차다."  # 블랙코미디 시네마틱만 쓰는 제출본용
TECH_LONG = ("포스터가 파닥이고, 트럭이 물보라를 튀기고, 고양이가 눈앞에 멈춰 서는 사건들이 관객에게 아무것도 요구하지 않는 측정 장치다. "
             "고개 방향과 머문 시간을 읽어 로맨스·공포·블랙코미디의 배합을 갱신하고, 그 배합이 장면 전체를 매 프레임 움직인다. "
             "대사는 실시간 생성의 지연과 품질 편차를 피하려고 확정 46줄과 장르 변주까지 138줄을 미리 AI 음성으로 합성해 두고, "
             "재생 직전에 현재 배합에 가장 가까운 줄을 고른다. 질문 뒤에는 관객의 끄덕임과 고개 젓기를 대답으로 읽는다.")

CREAM = "#F1E6D2"
CSS = f"""
@font-face{{font-family:'Hahmlet';src:url('file://{FONT_DIR}/Hahmlet-VF.ttf');font-weight:100 900}}
@font-face{{font-family:'Noto Serif KR';src:url('file://{FONT_DIR}/NotoSerifKR-VF.ttf');font-weight:200 900}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1920px;height:1080px;overflow:hidden;font-family:'Noto Serif KR',serif;font-weight:300;-webkit-font-smoothing:antialiased;word-break:keep-all;overflow-wrap:break-word}}
.dark{{position:relative;width:1920px;height:1080px;color:{CREAM};background:#14120f;overflow:hidden}}
.bgimg{{position:absolute;inset:-30px;background:center/cover no-repeat;filter:blur(var(--blur,0px))}}
.dark::before{{content:'';position:absolute;inset:0;background:var(--shade);z-index:1}}
.dark>*:not(.bgimg){{z-index:2}}
.hdr{{position:absolute;top:34px;left:48px;font-size:17px;letter-spacing:1px;opacity:.7}}
.ttl{{font-family:'Hahmlet',serif;font-weight:900;letter-spacing:-1px}}
.en{{font-weight:400;letter-spacing:10px}}
.rule{{display:flex;align-items:center;justify-content:center;gap:28px;letter-spacing:12px}}
.rule i{{display:block;width:110px;height:1.5px;background:{CREAM};opacity:.75}}
.body{{font-weight:300;line-height:1.85;letter-spacing:.3px}}
.foot{{position:absolute;left:0;right:0;bottom:58px;text-align:center;font-size:24px;font-weight:400;letter-spacing:6px}}
.foot::before{{content:'';display:block;width:84px;height:1px;background:{CREAM};opacity:.55;margin:0 auto 24px}}
"""

# 글만 나오는 장의 배경은 포스터 그림 — 원본(assets/poster.png, 1024×1536)에서 글씨가 없는 가로 띠를 잘라 화면 폭에 맞추고,
# 키운 만큼 흐리게·어둡게 깐다. crop_y 는 원본 기준 띠의 위쪽 y (띠 높이 576 = 1024×9/16).
POSTER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "poster.png")
def poster_bg(crop_y, blur=5, shade=.52):
    k = 1920 / 1024
    return (f"<div style=\"position:absolute;inset:-24px;background:url('file://{POSTER}') 0 {-crop_y * k + 24:.0f}px/1968px auto no-repeat;filter:blur({blur}px)\"></div>"
            f"<div style='position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,{shade - .12}) 0%,rgba(0,0,0,{shade + .25}) 100%)'></div>")

# SLIDE_BG=poster — 레이아웃 장의 배경도 게임 스크린샷 대신 포스터로 (비교용 두 번째 판). 장마다 포스터의 다른 띠를 쓴다.
POSTER_MODE = os.environ.get("SLIDE_BG") == "poster"
POSTER_CROP = {"R_100.jpg": 470, "H_100.jpg": 240, "R_75.jpg": 560, "C_100.jpg": 380, "C_130.jpg": 300}

def page(body, bg=None, shade="rgba(0,0,0,.55)", blur=6):
    if POSTER_MODE and not body.lstrip().startswith("<div style=\"position:absolute;inset:-24px"):
        # 글 장 — 배경 사진 자리와 무늬 없는 장(콘텐츠·기술 개발) 모두 포스터 띠로
        crop = POSTER_CROP.get(os.path.basename(bg), 470) if bg else 470
        return page(poster_bg(crop, blur=7, shade=.62 if bg else .7) + body)
    style = f"--shade:{shade};--blur:{blur}px" if bg else "--shade:transparent"
    layer = f"<div class='bgimg' style=\"background-image:url('file://{bg}')\"></div>" if bg else ""
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body><div class='dark' style=\"{style}\">{layer}{body}</div></body></html>"

def write(name, doc):
    with open(os.path.join(OUT, name + ".html"), "w") as f: f.write(doc)

e = html.escape
foot = f"<div class='foot'>{TEAM}</div>"
def rule(text, size):
    return f"<div class='rule' style='font-size:{size}px'><i></i>{text}<i></i></div>"
def small_title(size=40):
    return f"<div class='ttl' style='font-size:{size}px'>{TITLE_KO}</div>"

# 타이틀 — 포스터 하단 타이포 그대로
write("title", page(f"""
<div class="hdr">{HEADER}</div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div class="en" style="font-size:30px">{TITLE_EN}</div>
  <div class="ttl" style="font-size:190px;line-height:1.1;margin:18px 0 6px;letter-spacing:-2px">{TITLE_KO}</div>
  {rule("기다림", 56)}
  <div style="font-size:34px;letter-spacing:6px;margin-top:40px">{TAGLINE}</div>
</div>{foot}""", f"{BG}/R_100.jpg", "linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.7))", blur=3))

# 메인 디스플레이 작품 소개 (시나리오 + 구현 기술 요약)
write("main_intro", page(f"""
<div class="hdr">{HEADER}</div>
<div style="position:absolute;top:120px;left:210px;right:210px;bottom:160px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  {small_title(46)}
  <div style="height:44px"></div>
  {rule("콘텐츠 시나리오", 28)}
  <div class="body" style="font-size:30px;margin-top:18px">{e(SCENARIO_SHORT)}</div>
  <div style="height:46px"></div>
  {rule("구현 기술", 28)}
  <div class="body" style="font-size:30px;margin-top:18px">{e(TECH_SHORT)}</div>
  <div style="font-size:24px;margin-top:30px;letter-spacing:1px;opacity:.85"><span style="font-weight:600">AI Tool</span>&nbsp; {AI_TOOLS}</div>
</div>{foot}""", f"{BG}/H_100.jpg", "rgba(0,0,0,.74)"))

def text_page(name, label, text, bg, tools=False):
    write(name, page(f"""
<div class="hdr">{HEADER}</div>
<div style="position:absolute;top:130px;left:230px;right:230px;bottom:170px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  {small_title(52)}
  <div style="height:40px"></div>
  {rule(label, 32)}
  <div class="body" style="font-size:31px;margin-top:26px">{e(text)}</div>
  {f'<div style="font-size:26px;margin-top:36px;letter-spacing:1px;opacity:.85"><span style="font-weight:600">AI Tool</span>&nbsp; {AI_TOOLS}</div>' if tools else ''}
</div>{foot}""", bg, "rgba(0,0,0,.72)"))

text_page("scenario", "콘텐츠 시나리오", SCENARIO_LONG + SCENARIO_ONE_RUN, f"{BG}/R_75.jpg")
text_page("scenario_promo", "콘텐츠 시나리오", SCENARIO_LONG, f"{BG}/R_75.jpg")  # 세 장르가 다 나오는 홍보 영상(R02)용
text_page("tech", "구현 기술", TECH_LONG, f"{BG}/C_100.jpg", tools=True)

# 콘텐츠 개발 / 기술 개발 — 3칸
PANEL_CSS = (f"position:absolute;top:250px;bottom:150px;width:560px;border:1.5px solid rgba(241,230,210,.45);padding:22px 22px 18px;"
             "display:flex;flex-direction:column;background:rgba(0,0,0,.25)")
def panel(x, num, title, inner, text):
    return (f"<div style='{PANEL_CSS};left:{x}px'><div style='font-size:23px;margin-bottom:16px;letter-spacing:1px'>"
            f"<span style='font-weight:400;opacity:.7'>{num}</span>&nbsp; <span class='ttl' style='font-size:26px;letter-spacing:0'>{title}</span></div>"
            f"<div style='flex:1;min-height:0'>{inner}</div>"
            f"<div class='body' style='font-size:19px;line-height:1.7;margin-top:16px;opacity:.92'>{e(text)}</div></div>")
def panel_page(name, heading, panels):
    write(name, page(f"""
<div class="hdr">{HEADER}</div>
<div style="position:absolute;top:84px;left:90px;right:90px;display:flex;align-items:baseline;gap:30px">
  <div class="ttl" style="font-size:54px">{heading}</div>
  <div style="font-size:26px;letter-spacing:4px;opacity:.75">{TITLE_KO} · 기다림</div>
</div>
{''.join(panel(90 + i * 590, f'0{i+1}', *p) for i, p in enumerate(panels))}
{foot}"""))

def img(path, style=""):
    return f"<div style=\"background:#222 url('file://{path}') center/cover no-repeat;{style}\"></div>"
def grid(cells, cols):
    return f"<div style='display:grid;grid-template-columns:repeat({cols},1fr);gap:8px;height:100%'>{''.join(cells)}</div>"

panel_page("content_dev", "콘텐츠 개발", [
    ("캐릭터 원화 · 시네마틱",
     grid([img(f"{ART}/{d}/04_캐릭터마스터숏_{g}.png") for d, g in [("2_로맨스", "로맨스"), ("3_공포", "공포"), ("4_코미디", "코미디")]]
          + [img(os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "demo_comedy_seated.jpg"))], 2),
     "체험에서는 세 장르의 옆 사람을 직접 그린 원화를 2D 컷아웃으로 오려 3D 정류장에 앉힌다. 소개 영상의 블랙코미디 장면(오른쪽 아래)은 MiniMax로 만든 시네마틱이다."),
    ("정류장 장면 · 장르 조명",
     grid([img(f"{ART}/{d}/02_메인뷰_{g}.png") for d, g in [("1_디폴트", "디폴트_보정"), ("2_로맨스", "로맨스"), ("3_공포", "공포"), ("4_코미디", "코미디")]], 2),
     "아트팀이 만든 정류장 장면을 웹으로 옮기고, 기본·로맨스·공포·블랙코미디 네 조명 룩을 배합 비율대로 섞는다. 하늘·안개·가로등이 체험 내내 움직인다."),
    ("사건 · 대사 · 사운드",
     grid([img(f"{ART}/1_디폴트/04_트럭_마스터숏_디폴트.png"), img(f"{ART}/1_디폴트/06_고양이마스터샷_디폴트.png")], 1),
     "트럭과 고양이 같은 사건이 관객의 시선을 끈다. 대사 138줄은 ElevenLabs로 미리 합성했고, 장르별 BGM 세 트랙이 늘 함께 흐르며 볼륨만 배합을 따른다."),
])

# 시네마틱판(수정본): 그림을 모두 홍보 영상(R02)의 시네마틱 장면으로 — 자막·「연출 시안」 표시가 없는 부분을 잘라 assets/cinematic/ 에 둠
CINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "cinematic")
panel_page("content_dev_cine", "콘텐츠 개발", [
    ("캐릭터 · 장르별 옆 사람",
     grid([img(f"{CINE}/char_{g}.jpg") for g in ["stranger", "romance", "comedy", "horror"]], 2),
     "직접 그린 원화를 바탕으로 세 장르의 옆 사람을 MiniMax 시네마틱으로 만들었다. 카페에서 나온 같은 낯선 사람이 배합에 따라 로맨스·블랙코미디·공포의 인물로 변해 옆에 앉는다."),
    ("정류장 장면 · 장르 룩",
     grid([img(f"{CINE}/look_{g}.jpg") for g in ["default", "romance", "comedy", "horror"]], 2),
     "아트팀이 만든 정류장 장면 하나가 기본·로맨스·블랙코미디·공포 네 룩으로 바뀐다. 하늘·빛·안개·가로등이 배합을 따라 함께 움직인다."),
    ("사건 · 대사 · 사운드",
     grid([img(f"{CINE}/event_truck.jpg"), img(f"{CINE}/event_cat.jpg")], 1),
     "트럭과 고양이 같은 사건이 관객의 시선을 끈다. 대사 138줄은 ElevenLabs로 미리 합성했고, 장르별 BGM 세 트랙이 늘 함께 흐르며 볼륨만 배합을 따른다."),
])

def flow(items):
    box = "border:1px solid rgba(241,230,210,.6);padding:12px 14px;font-size:20px;font-weight:400;text-align:center;line-height:1.5"
    arrow = "<div style='text-align:center;font-size:18px;line-height:1.5;opacity:.6'>▼</div>"
    return "<div style='display:flex;flex-direction:column;justify-content:center;height:100%'>" + arrow.join(f"<div style='{box}'>{i}</div>" for i in items) + "</div>"

panel_page("tech_dev", "기술 개발", [
    ("배합 엔진",
     flow(["관객의 반응<br><span style='font-size:16px;opacity:.7'>고개 방향 · 머문 시간 · 끄덕임</span>",
           "증거 → 로맨스 · 공포 · 블랙코미디 배합",
           "매핑표",
           "하늘 · 안개 · 가로등 · 옆 사람 거리<br>대사 사이 침묵 · BGM"]),
     "선택지 대신 반응을 증거로 모은다. 오래된 반응은 무게가 줄고, 배합은 이산 판정 한 번(누가 앉는가) 뒤에도 계속 흐른다."),
    ("시스템 구조",
     flow(["Meta Quest 3 · WebXR 브라우저",
           "Next.js · three.js (React Three Fiber)",
           "미리 합성한 대사 · 효과음 · BGM (로컬)",
           "운영자 모니터 · 세션 기록 · QR 카드"]),
     "헤드셋 브라우저에서 바로 실행된다. 실시간 생성 없이 미리 합성한 소리만 써서 지연이 없고, 체험이 끝나면 「오늘의 정류장 카드」를 QR로 받는다."),
    ("반응 읽기",
     flow(["사건마다 방향과 시간창",
           "고개가 돌아갔나 · 얼마나 머물렀나",
           "질문 뒤: 끄덕임 · 고개 젓기 · 돌림",
           "증거로 누적"]),
     "포스터·트럭·고양이처럼 소리가 나는 쪽을 미리 알기 때문에, 고개가 그쪽으로 돌았는지와 머문 시간만으로 관객의 태도를 읽는다."),
])

# 크레딧
write("credits", page(f"""
<div class="hdr">{HEADER}</div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-bottom:60px">
  <div class="en" style="font-size:24px;opacity:.85">{TITLE_EN}</div>
  <div class="ttl" style="font-size:96px;line-height:1.1;margin:10px 0 40px">{TITLE_KO}</div>
  {rule("개발팀", 28)}
  <div style="font-size:34px;font-weight:600;letter-spacing:6px;margin:26px 0 22px">{TEAM}</div>
  {''.join(f'<div style="font-size:32px;line-height:1.8;letter-spacing:6px">{m}</div>' for m in MEMBERS)}
</div>""", f"{BG}/C_130.jpg", "rgba(0,0,0,.7)"))
# 문구 카드 — 재편집(훅 구조)용. 포스터 배경에 포스터 타이포.
def card(name, lines, crop_y, shade=.52):
    rows = "".join(f"<div class='{'ttl' if big else ''}' style='font-size:{size}px;line-height:1.35;letter-spacing:{'-1px' if big else '6px'};margin:{14 if big else 10}px 0;text-shadow:0 0 30px rgba(0,0,0,.6)'>{e(t)}</div>"
                   for t, size, big in lines)
    write(name, page(f"""{poster_bg(crop_y, shade=shade)}<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">{rows}</div>"""))

card("card_open", [("같은 정류장.", 128, True), ("같은 5분.", 128, True)], 470)     # 정류장과 세 갈래 하늘
card("card_choice", [("옆에 앉는 사람은,", 60, False), ("당신이 정한다.", 120, True)], 240)  # 세 갈래 하늘 (위 문구 아래부터)
card("card_vr", [("실제 VR 체험 화면", 60, False), ("같은 순간, 세 개의 영화.", 120, True)], 470)  # 풀 영상 — 시네마틱에서 녹화본(세 화면 비교)으로 넘어가는 장
card("card_predict", [("시선으로 내 감정을 읽고,", 60, False), ("이야기가 바뀐다.", 120, True)], 240)  # 데모 소스판 — 장르가 블랙코미디 하나뿐일 때 card_choice 대신
card("card_end", [("버스는 누구에게나 온다.", 60, False), ("다만 나의 기다림,", 104, True), ("그건 나만의 경험이다.", 104, True)], 560, shade=.6)  # 젖은 도로와 카페
# 레이아웃 PPT 용 — 구분 장(주최측 템플릿의 「메인디스플레이 영상」 같은 장)과 영상 자리 장
def divider(name, title, sub):
    write(name, page(f"""{poster_bg(470, blur=8, shade=.6)}<div class="hdr">{HEADER}</div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div class="en" style="font-size:26px;opacity:.8">{TITLE_EN}</div>
  <div class="ttl" style="font-size:110px;margin:16px 0 26px">{title}</div>
  {rule(sub, 30)}
</div>{foot}"""))

def video_slot(name, label, file, bg):
    write(name, page(f"""<div class="hdr">{HEADER}</div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  {rule("영상", 30)}
  <div class="ttl" style="font-size:96px;margin:20px 0 26px">{label}</div>
  <div style="font-size:30px;letter-spacing:2px;opacity:.9">{file}</div>
  <div style="font-size:24px;letter-spacing:2px;opacity:.7;margin-top:14px">영상은 4K mp4로 따로 제출</div>
</div>{foot}""", bg, "rgba(0,0,0,.72)"))

divider("div_main", "메인 디스플레이", "타이틀 · 작품 소개 · 1분 하이라이트 영상")
divider("div_sub", "서브 디스플레이", "시나리오 · 구현 기술 · 콘텐츠 개발 · 기술 개발 · 풀 영상 · 개발팀")
divider("div_sym", "심포지엄", "시나리오 · 구현 기술 · 풀 영상 · 개발팀")
divider("div_cards", "본영상 문구 카드", "풀 영상 · 하이라이트 영상 안에 쓰인 장")
video_slot("slot_short", "하이라이트 영상 (1분)", "버스정류장-기다림_메인영상.mp4", f"{BG}/R_75.jpg")
video_slot("slot_full_sub", "풀 영상", "버스정류장-기다림_서브영상.mp4", f"{BG}/H_100.jpg")
video_slot("slot_full_sym", "풀 영상", "버스정류장-기다림_심포지엄영상.mp4", f"{BG}/C_100.jpg")
video_slot("slot_full_sym_promo", "풀 영상", "버스정류장-기다림_심포지엄영상_수정.mp4", f"{BG}/C_100.jpg")  # 심포지엄 홍보영상판
print("ok")
