// 의존성 없는 최소 SVG 그래프 도우미 — sim-plot.mjs 가 쓴다. matplotlib 이 없는 환경에서도 `node` 만으로
// 선 그래프·띠·마커·주석을 그리고, 헤드리스 크롬으로 PNG 를 만든다(toPng).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', Helvetica, Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f = (v) => (Math.round(v * 100) / 100).toString();

/** 문서 — 요소를 문자열로 쌓는다. */
export class Svg {
  constructor(w, h, bg = "#ffffff") { this.w = w; this.h = h; this.parts = [`<rect x="0" y="0" width="${w}" height="${h}" fill="${bg}"/>`]; }
  add(s) { this.parts.push(s); return this; }
  text(x, y, str, { size = 13, color = "#222", anchor = "start", weight = "normal", baseline = "alphabetic", opacity = 1, family = FONT } = {}) {
    return this.add(`<text x="${f(x)}" y="${f(y)}" font-family="${family}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}" dominant-baseline="${baseline}" opacity="${opacity}">${esc(str)}</text>`);
  }
  line(x1, y1, x2, y2, { color = "#222", width = 1, dash = null, opacity = 1 } = {}) {
    return this.add(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""} opacity="${opacity}"/>`);
  }
  rect(x, y, w, h, { fill = "none", stroke = "none", width = 1, opacity = 1, rx = 0 } = {}) {
    return this.add(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}" rx="${rx}"/>`);
  }
  polyline(pts, { color = "#222", width = 1.5, dash = null, opacity = 1 } = {}) {
    if (!pts.length) return this;
    return this.add(`<polyline points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""} opacity="${opacity}" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  polygon(pts, { fill = "#ddd", stroke = "none", opacity = 1 } = {}) {
    return this.add(`<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" fill="${fill}" stroke="${stroke}" opacity="${opacity}"/>`);
  }
  circle(x, y, r, { fill = "#222", stroke = "none", width = 1, opacity = 1 } = {}) {
    return this.add(`<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}"/>`);
  }
  /** 위로 뾰족한 삼각형 마커 */
  triangle(x, y, s, opts = {}) { return this.polygon([[x, y - s], [x - s * 0.9, y + s * 0.7], [x + s * 0.9, y + s * 0.7]], opts); }
  toString() { return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">\n${this.parts.join("\n")}\n</svg>\n`; }
}

/**
 * 좌표계가 있는 패널 — 데이터 → 화면 변환과 축·눈금·제목을 맡는다.
 * @param {Svg} svg
 * @param {{x,y,w,h, xd:[number,number], yd:[number,number], title?, xLabel?, yLabel?, xTicks?:number[], yTicks?:number[], xFmt?, yFmt?}} o
 */
export class Panel {
  constructor(svg, o) {
    Object.assign(this, { svg, xTicks: [], yTicks: [], xFmt: (v) => String(v), yFmt: (v) => String(v), title: "", xLabel: "", yLabel: "", titleSize: 14 }, o);
    this.left = this.x + 44; this.top = this.y + (this.title ? 26 : 8); this.right = this.x + this.w - 10; this.bottom = this.y + this.h - (this.xLabel ? 34 : 22);
  }
  sx(v) { return this.left + ((v - this.xd[0]) / (this.xd[1] - this.xd[0])) * (this.right - this.left); }
  sy(v) { return this.bottom - ((v - this.yd[0]) / (this.yd[1] - this.yd[0])) * (this.bottom - this.top); }
  inX(v) { return v >= this.xd[0] && v <= this.xd[1]; }
  clipPts(xs, ys) { const out = []; for (let i = 0; i < xs.length; i++) if (this.inX(xs[i])) out.push([this.sx(xs[i]), this.sy(Math.max(this.yd[0], Math.min(this.yd[1], ys[i])))]); return out; }
  frame() {
    const s = this.svg;
    s.rect(this.left, this.top, this.right - this.left, this.bottom - this.top, { fill: "#fff", stroke: "#999", width: 1 });
    for (const t of this.xTicks) { const x = this.sx(t); s.line(x, this.bottom, x, this.bottom + 4, { color: "#666" }); s.line(x, this.top, x, this.bottom, { color: "#eee" }); s.text(x, this.bottom + 15, this.xFmt(t), { size: 10, color: "#555", anchor: "middle" }); }
    for (const t of this.yTicks) { const y = this.sy(t); s.line(this.left - 4, y, this.left, y, { color: "#666" }); s.line(this.left, y, this.right, y, { color: "#eee" }); s.text(this.left - 6, y + 3.5, this.yFmt(t), { size: 10, color: "#555", anchor: "end" }); }
    if (this.title) s.text(this.left, this.y + 16, this.title, { size: this.titleSize, weight: "bold" });
    if (this.xLabel) s.text((this.left + this.right) / 2, this.bottom + 29, this.xLabel, { size: 11, color: "#444", anchor: "middle" });
    if (this.yLabel) s.add(`<text transform="translate(${f(this.x + 12)},${f((this.top + this.bottom) / 2)}) rotate(-90)" font-family="${FONT}" font-size="11" fill="#444" text-anchor="middle">${esc(this.yLabel)}</text>`);
    return this;
  }
  band(xs, lo, hi, opts) { const up = this.clipPts(xs, hi), dn = this.clipPts(xs, lo).reverse(); if (up.length) this.svg.polygon([...up, ...dn], opts); return this; }
  series(xs, ys, opts) { this.svg.polyline(this.clipPts(xs, ys), opts); return this; }
  vline(xv, opts, label = null, labelOpts = {}) { if (!this.inX(xv)) return this; const x = this.sx(xv); this.svg.line(x, this.top, x, this.bottom, opts); if (label) { const { y = this.top + 11, ...rest } = labelOpts; this.svg.text(x + 3, y, label, { size: 9.5, color: opts.color || "#444", ...rest }); } return this; }
  hline(yv, opts, label = null) { const y = this.sy(yv); this.svg.line(this.left, y, this.right, y, opts); if (label) this.svg.text(this.right - 3, y - 3, label, { size: 9.5, color: opts.color || "#444", anchor: "end" }); return this; }
  marker(xv, yv, kind, size, opts) { if (!this.inX(xv)) return this; const x = this.sx(xv), y = this.sy(yv); if (kind === "tri") this.svg.triangle(x, y, size, opts); else this.svg.circle(x, y, size, opts); return this; }
  note(lines, { x = null, y = null, size = 10.5, color = "#333", lineH = 14, anchor = "start", bg = "rgba(255,255,255,0.85)" } = {}) {
    const px = x ?? this.left + 6, py = y ?? this.top + 8;
    const wMax = Math.max(...lines.map((l) => l.length)) * size * 0.58 + 10;
    if (bg) this.svg.rect(px - 4, py - 2, wMax, lines.length * lineH + 4, { fill: bg, rx: 3 });
    lines.forEach((l, i) => this.svg.text(px, py + (i + 1) * lineH - 3, l, { size, color, anchor }));
    return this;
  }
}

/** 범례 한 줄 — items: [{label, color, dash?, kind?:"line"|"tri"|"band"}] */
export function legend(svg, x, y, items, { size = 11, gap = 16 } = {}) {
  let cx = x;
  for (const it of items) {
    if (it.kind === "tri") svg.triangle(cx + 6, y - 3, 5, { fill: it.color });
    else if (it.kind === "dot") svg.circle(cx + 6, y - 4, 3.2, { fill: it.color, stroke: "#fff", width: 0.8 });
    else if (it.kind === "band") svg.rect(cx, y - 8, 14, 9, { fill: it.color, opacity: it.opacity ?? 1 });
    else svg.line(cx, y - 4, cx + 16, y - 4, { color: it.color, width: it.width || 2, dash: it.dash || null });
    svg.text(cx + 20, y, it.label, { size });
    cx += 20 + it.label.length * size * 0.62 + gap;
  }
  return cx;
}

/** 크롬 경로 — 환경변수 CHROME 우선. 없으면 null(PNG 생략). */
export function findChrome() {
  const cands = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"].filter(Boolean);
  return cands.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

/**
 * SVG 파일 → PNG. 헤드리스 크롬의 --screenshot 을 쓴다(원격 디버깅 포트 불필요, 화면 캡처 아님).
 * macOS 의 새 헤드리스는 PNG 를 다 쓴 뒤에도 프로세스가 한참 안 끝나므로, 파일 크기가 안정되면 직접 끝낸다.
 * @returns {Promise<boolean>} 성공 여부
 */
export async function toPng(svgPath, pngPath, w, h, { scale = 2, chrome = findChrome(), timeoutMs = 60000 } = {}) {
  if (!chrome) return false;
  const html = svgPath.replace(/\.svg$/, ".html");
  fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style></head><body>${fs.readFileSync(svgPath, "utf8")}</body></html>`);
  try { fs.unlinkSync(pngPath); } catch {}
  const profile = path.join(process.env.TMPDIR || "/tmp", "chrome-svgplot-profile");
  const child = spawn(chrome, ["--headless=new", `--screenshot=${path.resolve(pngPath)}`, `--window-size=${w},${h}`, `--force-device-scale-factor=${scale}`, "--hide-scrollbars", "--no-first-run", "--disable-gpu", `--user-data-dir=${profile}`, `file://${path.resolve(html)}`], { stdio: "ignore" });
  const t0 = Date.now();
  let lastSize = -1, stable = 0, exited = false;
  child.on("exit", () => { exited = true; });
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
    let size = -1; try { size = fs.statSync(pngPath).size; } catch {}
    if (size > 0 && size === lastSize) { if (++stable >= 3) break; } else stable = 0;
    lastSize = size;
    if (exited) break;
  }
  if (!exited) { try { child.kill("SIGKILL"); } catch {} }
  try { fs.unlinkSync(html); } catch {}
  return fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0;
}
