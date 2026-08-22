// 레이아웃 감사 — 겹침과 넘침을 실제로 잰다.
// deck-standalone.html 에 주입해서 --dump-dom 으로 결과를 읽는다.
(function () {
  function run() {
    const OUT = [];
    const VH = window.innerHeight;

    // 등장 애니메이션 때문에 opacity:0 인 것들을 강제로 보이게
    document.querySelectorAll('.slide').forEach((s) => s.classList.add('seen'));
    document.querySelectorAll('.rise').forEach((e) => {
      e.style.opacity = '1';
      e.style.transform = 'none';
      e.style.transition = 'none';
    });

    const slides = [...document.querySelectorAll('.slide')];

    slides.forEach((slide, i) => {
      const id = slide.id || `s${i + 1}`;

      // ── 넘침 ──
      // 슬라이드는 뷰포트 한 장에 들어가야 한다. 자식들의 실제 높이 합을 잰다.
      const kids = [...slide.children];
      let top = Infinity, bottom = -Infinity;
      kids.forEach((k) => {
        const r = k.getBoundingClientRect();
        if (r.height === 0) return;
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      });
      const contentH = bottom - top;
      const padY = parseFloat(getComputedStyle(slide).paddingTop) * 2;
      const budget = VH - padY;
      const over = contentH - budget;
      OUT.push(
        `[${id}] 내용 ${Math.round(contentH)}px / 여유 ${Math.round(budget)}px ` +
        (over > 0 ? `→ ⚠ ${Math.round(over)}px 넘침` : `→ OK (${Math.round(-over)}px 여유)`)
      );

      // ── 가로 넘침 ──
      slide.querySelectorAll('*').forEach((el) => {
        if (el.ownerSVGElement) return;
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible') {
          OUT.push(`[${id}] ⚠ 가로 넘침: ${sig(el)} (${el.scrollWidth} > ${el.clientWidth})`);
        }
      });

      // ── 겹침 ──
      // 텍스트를 담은 말단 요소끼리 사각형이 겹치는지. 형제/사촌만 본다
      // (부모-자식은 당연히 겹치므로 제외).
      const leaves = [...slide.querySelectorAll('*')].filter((el) => {
        if (el.children.length > 0) return false;
        const txt = (el.textContent || '').trim();
        if (!txt) return false;
        const cs = getComputedStyle(el);
        if (cs.position === 'absolute' || cs.position === 'fixed') return false;
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      });

      const seen = new Set();
      for (let a = 0; a < leaves.length; a++) {
        for (let b = a + 1; b < leaves.length; b++) {
          const A = leaves[a], B = leaves[b];
          if (A.contains(B) || B.contains(A)) continue;
          const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
          const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (ox > 2 && oy > 2) {
            const key = sig(A) + '||' + sig(B);
            if (seen.has(key)) continue;
            seen.add(key);
            OUT.push(`[${id}] ⚠ 겹침 ${Math.round(ox)}×${Math.round(oy)}px: ${sig(A)} ↔ ${sig(B)}`);
          }
        }
      }

      // ── SVG 안의 텍스트 겹침 ──
      slide.querySelectorAll('svg').forEach((svg, si) => {
        const texts = [...svg.querySelectorAll('text')];
        for (let a = 0; a < texts.length; a++) {
          for (let b = a + 1; b < texts.length; b++) {
            const ra = texts[a].getBoundingClientRect(), rb = texts[b].getBoundingClientRect();
            const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (ox > 1 && oy > 1) {
              OUT.push(`[${id}] ⚠ SVG#${si} 라벨 겹침 ${Math.round(ox)}×${Math.round(oy)}px: ` +
                `"${texts[a].textContent.trim()}" ↔ "${texts[b].textContent.trim()}"`);
            }
          }
        }
        // 라벨이 도형(원)과 겹치는지 — 다이얼 라벨이 점 위에 얹히는 경우
        const dots = [...svg.querySelectorAll('circle')].filter((c) => { const r = +c.getAttribute('r'); return r >= 4 && r <= 9; });
        texts.forEach((t) => {
          const rt = t.getBoundingClientRect();
          dots.forEach((c) => {
            const rc = c.getBoundingClientRect();
            const ox = Math.min(rt.right, rc.right) - Math.max(rt.left, rc.left);
            const oy = Math.min(rt.bottom, rc.bottom) - Math.max(rt.top, rc.top);
            if (ox > 1 && oy > 1) {
              OUT.push(`[${id}] ⚠ SVG#${si} 라벨이 표식 위에: "${t.textContent.trim()}"`);
            }
          });
        });
      });
    });

    function sig(el) {
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).join('.')
        : '';
      const txt = (el.textContent || '').trim().slice(0, 22);
      return `${el.tagName.toLowerCase()}${cls}«${txt}»`;
    }

    document.documentElement.innerHTML =
      '<body><pre id="report">' +
      OUT.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n') +
      '\n\n총 ' + OUT.filter((l) => l.includes('⚠')).length + ' 건의 문제' +
      '</pre></body>';
  }

  // 폰트가 다 실린 뒤에 재야 정확하다
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => setTimeout(run, 400));
  } else {
    setTimeout(run, 1200);
  }
})();
