# 제출용 레이아웃 파일 — 만든 장(4K PNG)을 한 장씩 꽉 채운 16:9 PPT. 글자는 이미지라 주최측 PC 글꼴과 상관없이 똑같이 보인다.
# 순서는 주최측 「영상콘텐츠 레이아웃」을 따른다: 메인 디스플레이 → 서브 디스플레이 → 심포지엄, 그 뒤에 본영상 문구 카드.
# 사용: python make_pptx.py <slides 폴더> <출력.pptx>   (python-pptx 필요)
import os, sys
from pptx import Presentation
from pptx.util import Emu

SLIDES, OUT = sys.argv[1], sys.argv[2]
ORDER = [
    "div_main", "title", "main_intro", "slot_short",
    "div_sub", "title", "scenario", "tech", "content_dev", "tech_dev", "slot_full_sub", "credits",
    "div_sym", "title", "scenario", "tech", "slot_full_sym", "credits",
    "div_cards", "card_open", "card_choice", "card_end",
]

prs = Presentation()
prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 16:9 (13.333 × 7.5 in)
blank = prs.slide_layouts[6]
for name in ORDER:
    s = prs.slides.add_slide(blank)
    s.shapes.add_picture(os.path.join(SLIDES, name + ".png"), 0, 0, prs.slide_width, prs.slide_height)
    s.notes_slide.notes_text_frame.text = name
prs.save(OUT)
print(f"{len(ORDER)}장 → {OUT}")
