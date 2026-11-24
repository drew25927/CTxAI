# 최종 성과발표 영상용 장 — 쇼케이스 장과 같은 포스터 배경·타이포(함렛 Black + 본명조 Light, 크림색)
# 화면 아래 약 200px(1920 기준)은 내레이션 자막 자리라 비워 둔다.
# 사용: python3 pres_slides.py <실제 화면 스틸 폴더(front_R.png 등 — 녹화본 62초, 판정 직후 정면)> <출력 폴더>  → snap 으로 4K PNG
import os, sys, html

STILLS, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
EDIT = os.path.join(HERE, "..", "showcase_edit")
FONT_DIR = os.path.join(EDIT, "fonts")
POSTER = os.path.join(EDIT, "assets", "poster.png")
CINE = os.path.join(EDIT, "assets", "cinematic")
CREAM = "#F1E6D2"
e = html.escape

CSS = f"""
@font-face{{font-family:'Hahmlet';src:url('file://{FONT_DIR}/Hahmlet-VF.ttf');font-weight:100 900}}
@font-face{{font-family:'Noto Serif KR';src:url('file://{FONT_DIR}/NotoSerifKR-VF.ttf');font-weight:200 900}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1920px;height:1080px;overflow:hidden;font-family:'Noto Serif KR',serif;font-weight:300;-webkit-font-smoothing:antialiased;word-break:keep-all;color:{CREAM}}}
.dark{{position:relative;width:1920px;height:1080px;background:#14120f;overflow:hidden}}
.ttl{{font-family:'Hahmlet',serif;font-weight:900;letter-spacing:-1px}}
.kick{{font-size:22px;letter-spacing:8px;opacity:.75}}
.box{{border:1.5px solid rgba(241,230,210,.5);background:rgba(10,9,8,.35)}}
.hdr{{position:absolute;top:34px;left:48px;font-size:17px;letter-spacing:1px;opacity:.7}}
"""

def poster_bg(crop_y=470, blur=7, shade=.66):
    k = 1920 / 1024
    return (f"<div style=\"position:absolute;inset:-24px;background:url('file://{POSTER}') 0 {-crop_y * k + 24:.0f}px/1968px auto no-repeat;filter:blur({blur}px)\"></div>"
            f"<div style='position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,{shade - .12}) 0%,rgba(0,0,0,{shade + .22}) 100%)'></div>")

def write(name, body, crop_y=470, blur=7, shade=.66):
    doc = (f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body><div class='dark'>"
           f"{poster_bg(crop_y, blur, shade)}<div class='hdr'>2026 KAIST CT×AI 콘텐츠 마이크로디그리 과정 | 최종 성과발표</div>"
           f"<div style='position:absolute;inset:0'>{body}</div></div></body></html>")
    with open(os.path.join(OUT, name + ".html"), "w") as f: f.write(doc)

def head(kick, title, top=96):
    return (f"<div style='position:absolute;top:{top}px;left:120px;right:120px'><div class='kick'>{e(kick)}</div>"
            f"<div class='ttl' style='font-size:64px;margin-top:14px'>{e(title)}</div></div>")

def img(path, w, h, extra=""):
    return f"<div style=\"width:{w}px;height:{h}px;background:#222 url('file://{path}') center/cover;{extra}\"></div>"

# 1. 기획 의도 — 한 문장 카드
write("p_intent", """
<div style="position:absolute;inset:0 0 140px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div style="font-size:52px;letter-spacing:6px;margin-bottom:26px">기다림은,</div>
  <div class="ttl" style="font-size:104px;line-height:1.3">내가 어떤 사람인지<br>드러나는 시간</div>
</div>""", 470, 5, .55)

# 2-1. 분기형 대신 섞기
bars = "".join(f"<div style='display:flex;align-items:center;gap:22px;margin:22px 0'><div style='width:190px;font-size:32px;text-align:right'>{n}</div>"
               f"<div style='width:{int(v * 620)}px;height:34px;background:{c}'></div><div style='font-size:30px'>{v:.1f}</div></div>"
               for n, v, c in [("로맨스", .7, "#E7B98C"), ("공포", .2, "#6F8C88"), ("블랙코미디", .1, "#B49AC2")])
write("p_branch", head("무엇이 새로운가", "고르게 하는 대신, 섞는다") + f"""
<div style="position:absolute;top:300px;left:120px;width:760px;height:500px" class="box">
  <div style="padding:30px 36px;font-size:30px;letter-spacing:4px;opacity:.8">분기형 인터랙티브 영화</div>
  <svg width="760" height="380" viewBox="0 0 760 380" style="position:absolute;left:0;top:110px">
    <g stroke="{CREAM}" stroke-width="2" fill="none" opacity=".8">
      <rect x="60" y="140" width="180" height="70" rx="6"/><path d="M240 175 L380 90 M240 175 L380 260"/>
      <rect x="380" y="55" width="140" height="70" rx="6"/><rect x="380" y="225" width="140" height="70" rx="6"/>
      <path d="M520 90 L580 90 M520 260 L580 260"/><rect x="580" y="55" width="130" height="70" rx="6"/><rect x="580" y="225" width="130" height="70" rx="6"/>
    </g>
    <g fill="{CREAM}" font-family="Noto Serif KR" font-size="26" text-anchor="middle">
      <text x="150" y="184">선택지</text><text x="450" y="99">A</text><text x="450" y="269">B</text>
      <text x="645" y="99">결말 1</text><text x="645" y="269">결말 2</text></g>
  </svg>
</div>
<div style="position:absolute;top:300px;left:960px;width:840px;height:500px" class="box">
  <div style="padding:30px 36px;font-size:30px;letter-spacing:4px;opacity:.8">버스정류장 · 기다림</div>
  <div style="padding:0 36px">{bars}</div>
  <div style="padding:6px 36px;font-size:30px;line-height:1.6">관객의 반응에 따라 비율이 계속 바뀌는<br><b style="font-weight:600">한 가지 색</b></div>
</div>""")

# 2-2. 고정 구조, 가변 표현
def col(x, title, items, tone):
    li = "".join(f"<div style='font-size:36px;margin:22px 0'>{e(i)}</div>" for i in items)
    return (f"<div class='box' style='position:absolute;top:300px;left:{x}px;width:760px;height:480px;padding:40px 50px;{tone}'>"
            f"<div class='ttl' style='font-size:54px;margin-bottom:24px'>{e(title)}</div>{li}</div>")
write("p_fixed", head("모두에게 같은 것, 사람마다 다른 것", "고정 구조, 가변 표현")
      + col(120, "고정 구조", ["트럭이 지나간다", "고양이가 멈춘다", "버스는 반드시 온다"], "")
      + col(1040, "가변 표현", ["하늘과 빛", "옆에 앉는 사람", "그 사람의 말"], "border-color:rgba(231,185,140,.8)"))

# 3. 사건 타임라인 — 사건은 아무것도 요구하지 않는 측정 장치
ev = [("0:12", "카페에서 나온 사람이\n횡단보도를 건넌다"), ("0:25", "트럭이 지나가며\n물보라가 튄다"), ("0:43", "고양이가 눈앞에서\n멈춰 선다"),
      ("0:58", "옆에 앉을 사람이\n정해진다"), ("1:03", "옆 사람이 앉고\n말을 건다"), ("끝", "버스가 온다")]
xs = [140 + i * 300 for i in range(len(ev))]
dots = "".join(f"<div style='position:absolute;left:{x}px;top:452px;width:22px;height:22px;border-radius:50%;background:{CREAM}'></div>"
               f"<div style='position:absolute;left:{x - 110}px;top:400px;width:242px;text-align:center;font-size:28px;opacity:.8'>{t}</div>"
               f"<div style='position:absolute;left:{x - 120}px;top:500px;width:262px;text-align:center;font-size:28px;line-height:1.5'>{e(d).replace(chr(10), '<br>')}</div>"
               for x, (t, d) in zip(xs, ev))
write("p_events", head("관객이 겪는 5분", "사건은, 아무것도 요구하지 않는 측정 장치") + f"""
<div style="position:absolute;left:150px;right:150px;top:462px;height:2px;background:{CREAM};opacity:.6"></div>{dots}
<div style="position:absolute;left:120px;right:120px;top:700px;text-align:center;font-size:32px;letter-spacing:2px">
돌아봤는가 · 얼마나 빨리 · 얼마나 오래 · 다시 확인했는가</div>""")

# 4-1. 세 층
layers = [("01", "센서", "고개의 방향·속도·머문 시간\n(헤드셋은 얼굴을 가린다)"), ("02", "상태", "로맨스 · 공포 · 블랙코미디 비율\n오래된 반응은 옅어지고, 완만하게 따라간다"),
          ("03", "연출", "하늘 · 안개 · 가로등\n옆 사람의 거리 · 말 사이의 침묵")]
boxes = "".join(f"<div class='box' style='position:absolute;top:310px;left:{120 + i * 580}px;width:520px;height:420px;padding:36px 40px'>"
                f"<div style='font-size:26px;opacity:.7'>{n}</div><div class='ttl' style='font-size:66px;margin:10px 0 26px'>{t}</div>"
                f"<div style='font-size:28px;line-height:1.7'>{e(d).replace(chr(10), '<br>')}</div></div>"
                + (f"<div style='position:absolute;top:490px;left:{648 + i * 580}px;font-size:44px;opacity:.8'>→</div>" if i < 2 else "")
                for i, (n, t, d) in enumerate(layers))
write("p_layers", head("어떻게 작동하나", "센서 → 상태 → 연출") + boxes)

# 4-2. 눈에 띄는 순간 (실제 프로토타입 화면 스틸)
trig = [(f"{CINE}/look_horror.jpg", "공포가 짙어지면", "오후인데 가로등이 켜진다"), (f"{CINE}/look_romance.jpg", "로맨스가 짙어지면", "구름이 갈라지고 도로가 금빛으로"),
        (f"{CINE}/look_comedy.jpg", "블랙코미디가 짙어지면", "그림자가 사라진다")]  # 발표용 데모 영상(R05 계열)의 장면
cards = "".join(f"<div style='position:absolute;top:290px;left:{120 + i * 580}px;width:520px'>{img(os.path.join(STILLS, f), 520, 300, 'border:1.5px solid rgba(241,230,210,.5)')}"
                f"<div style='font-size:28px;margin-top:22px;opacity:.8'>{e(a)}</div><div class='ttl' style='font-size:40px;margin-top:8px'>{e(b)}</div></div>"
                for i, (f, a, b) in enumerate(trig))
write("p_triggers", head("수치만으로는 알아채기 어렵다", "눈에 띄는 순간") + cards
      + "<div style='position:absolute;right:120px;top:120px;font-size:22px;opacity:.75'>연출 시안 · 실제 헤드셋 화면 아님</div>")

# 2-3. 같은 순간, 세 개의 정류장 (실제 프로토타입 화면, 같은 시각의 정면)
same = [("front_R.png", "로맨스"), ("front_H.png", "공포"), ("front_C.png", "블랙코미디")]
cols = "".join(f"<div style='position:absolute;top:300px;left:{120 + i * 580}px;width:520px'>{img(os.path.join(STILLS, f), 520, 520, 'border:1.5px solid rgba(241,230,210,.5)')}"
               f"<div class='ttl' style='font-size:44px;margin-top:22px;text-align:center'>{e(n)}</div></div>" for i, (f, n) in enumerate(same))
write("p_same", head("같은 순간", "같은 정류장, 세 개의 하늘") + cols
      + "<div style='position:absolute;right:120px;top:120px;font-size:22px;opacity:.75'>실제 프로토타입 화면 · 장르 강제 지정 시연 · 같은 시각</div>")

# 4-3. 대사
write("p_lines", head("대사", "미리 준비하고, 가장 가까운 줄을 고른다") + f"""
<div style="position:absolute;top:320px;left:120px;right:120px;display:flex;align-items:center;justify-content:center;gap:40px;font-size:40px">
  <div class="box" style="padding:34px 44px;text-align:center"><div class="ttl" style="font-size:84px">46</div>확정 대사</div><div>+</div>
  <div class="box" style="padding:34px 44px;text-align:center"><div class="ttl" style="font-size:84px">92</div>장르별 변주</div><div>=</div>
  <div class="box" style="padding:34px 44px;text-align:center;border-color:rgba(231,185,140,.85)"><div class="ttl" style="font-size:84px">138</div>미리 합성한 줄</div>
</div>
<div style="position:absolute;top:640px;left:120px;right:120px;text-align:center;font-size:34px;line-height:1.7">
재생 직전, 지금의 배합에 가장 가까운 줄을 고른다<br><span style="opacity:.8">질문 뒤에는 고개로 대답한다 — 끄덕임 · 고개 젓기 · 침묵</span></div>""")

# 5. 만든 것
built = [("체험", "Next.js · three.js · WebXR\nMeta Quest 3 브라우저 목표 · 데스크톱 검증"), ("장면", "아트팀의 정류장 장면을 웹으로\n세 장르 인물은 직접 그린 원화를 바탕으로"),
         ("소리", "대사 138줄 AI 음성\n장르별 배경음악 세 트랙"), ("끝난 뒤", "QR로 받는 「오늘의 정류장 카드」\n앉은 인물 · 하늘의 변화")]
grid = "".join(f"<div class='box' style='position:absolute;top:{290 + (i // 2) * 230}px;left:{120 + (i % 2) * 850}px;width:810px;height:200px;padding:28px 36px'>"
               f"<div class='ttl' style='font-size:40px'>{e(a)}</div><div style='font-size:28px;line-height:1.6;margin-top:10px'>{e(b).replace(chr(10), '<br>')}</div></div>"
               for i, (a, b) in enumerate(built))
write("p_built", head("무엇을 만들었나", "만든 것") + grid
      + "<div style='position:absolute;top:770px;left:120px;right:120px;text-align:center;font-size:27px;letter-spacing:1px'>"
        "<b style='font-weight:600'>AI Tool</b>&nbsp; Claude Haiku 4.5 · ElevenLabs · Suno · MiniMax · MediaPipe · Claude Code</div>")

# 6. 바뀐 것
rows = [("장르", "공포 · 로맨스 · 코미디 · 판타지", "공포 · 로맨스 · 블랙코미디"), ("시간", "밤", "소나기가 그친 오후 (대낮의 어둠)"),
        ("판정", "음성 대답", "행동 — 시선과 고개"), ("구조", "한 번 판정하고 고정", "옆 사람은 1분쯤 정해지고, 연출은 끝까지 바뀐다"),
        ("대사", "AI가 그 자리에서 생성", "미리 준비한 138줄에서 고르기")]
tbl = "".join(f"<div style='display:flex;align-items:center;font-size:31px;padding:17px 0;border-bottom:1px solid rgba(241,230,210,.3)'>"
              f"<div style='width:170px;opacity:.75'>{a}</div><div style='width:600px;opacity:.8'>{e(b)}</div><div style='width:70px'>→</div><div style='flex:1'>{e(c)}</div></div>"
              for a, b, c in rows)
write("p_changes", head("처음 기획에서", "바뀐 것") + f"<div style='position:absolute;top:290px;left:140px;right:140px'>{tbl}</div>"
      + "<div style='position:absolute;top:780px;left:120px;right:120px;text-align:center;font-size:30px'>배운 것 — 반응이 없는 순간을 채우면, 결과가 한쪽으로 쏠린다</div>")

# 7. 남은 과제
todo = ["관객 파일럿 — 관객이 느낀 장르와 시스템 판정의 일치율", "판정 기준값 보정 — 지금은 실제 관객 없이 정한 잠정치",
        "헤드셋 실기기 성능 확인", "시네마틱 수준의 인물을 실제 체험으로"]
li = "".join(f"<div style='display:flex;gap:26px;align-items:baseline;font-size:36px;margin:30px 0'><div style='font-size:28px;opacity:.7'>0{i + 1}</div><div>{e(t)}</div></div>"
             for i, t in enumerate(todo))
write("p_limits", head("한계와 다음 단계", "남은 과제") + f"<div style='position:absolute;top:290px;left:160px;right:160px'>{li}</div>")

# 8. 감사합니다
write("p_thanks", """
<div style="position:absolute;inset:0 0 120px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div class="ttl" style="font-size:120px">감사합니다</div>
  <div style="font-size:30px;letter-spacing:8px;margin-top:30px">팀 운칠기삼 · 김운기 · 이혜원 · 윤단 · 정동욱</div>
</div>""", 560, 5, .6)
print("장 HTML:", sorted(f for f in os.listdir(OUT) if f.endswith(".html")))
