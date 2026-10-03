#!/usr/bin/env python3
"""장르별 캐릭터 전신 시트(흰 배경, 앞·3/4·옆·뒤 4방향)를 방향별 투명 PNG로 오려 낸다.

    python3 scripts/cutout_characters.py            # 기본 경로 사용
필요: pillow numpy scipy (venv 권장). 결과는 public/reactive/cutouts/<장르>-<방향>.png + manifest.json.

흰 종이 배경은 "가장자리와 이어진 흰색"만 지운다 — 인물 안쪽의 밝은 부분(반투명 판초 등)은
가장자리와 안 이어져 있으면 남는다. 방향은 가로 방향으로 비어 있는 틈을 기준으로 나눈다.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = {
    "R": os.path.join(ROOT, "Bus/ArtWork_Final/2_로맨스/06_캐릭터전신_로맨스.png"),
    "H": os.path.join(ROOT, "Bus/ArtWork_Final/3_공포/06_캐릭터전신_공포.png"),
    "C": os.path.join(ROOT, "Bus/ArtWork_Final/4_코미디/06_캐릭터전신_코미디.png"),
}
OUT = os.path.join(ROOT, "ctxai-busstop-xr-audio-proto/public/reactive/cutouts")
VIEWS = ["front", "threeq", "side", "back"]
# 장면에서 쓰는 값 — heightM: 실제 키(미터, 굽은 할머니는 굽은 높이), seatCrop: 앉힐 때 머리부터 몇 %까지만 보여 줄지
# (골반 근처), faces: 그림 속 인물이 향한 쪽(+1 = 화면 오른쪽, -1 = 왼쪽, 정면/뒤는 0).
META = {
    "R": {"heightM": 1.62, "seatCrop": 0.56, "faces": {"front": 0, "threeq": 1, "side": 1, "back": 0}},
    "H": {"heightM": 1.78, "seatCrop": 0.52, "faces": {"front": 0, "threeq": 1, "side": 1, "back": 0}},
    "C": {"heightM": 1.50, "seatCrop": 0.60, "faces": {"front": 0, "threeq": -1, "side": -1, "back": 0}},
}
BG_TOL = 22      # 종이색과 이 거리 안이면 배경 후보
MAX_H = 1000     # 출력 높이 상한(px)
PAD = 6


def foreground_mask(rgb):
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb.astype(np.float32) - bg) ** 2).sum(axis=2))
    cand = dist < BG_TOL
    lab, _ = ndi.label(cand)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge_labels))
    fg = ~bgmask
    fg = ndi.binary_opening(fg, iterations=1)       # 종이 질감 점 제거
    lab2, n = ndi.label(fg)                          # 작은 부스러기 제거
    if n:
        sizes = ndi.sum(fg, lab2, range(1, n + 1))
        keep = [i + 1 for i, sz in enumerate(sizes) if sz > 0.002 * fg.size]
        fg = np.isin(lab2, keep)
    return ndi.binary_fill_holes(fg)


def split_columns(fg, min_gap=24, min_width=60):
    cols = fg.any(axis=0)
    runs, start = [], None
    for x, v in enumerate(cols):
        if v and start is None:
            start = x
        if not v and start is not None:
            runs.append([start, x]); start = None
    if start is not None:
        runs.append([start, len(cols)])
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [r for r in merged if r[1] - r[0] >= min_width]


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for g, path in SRC.items():
        rgb = np.array(Image.open(path).convert("RGB"))
        fg = foreground_mask(rgb)
        runs = split_columns(fg)
        if len(runs) != len(VIEWS):
            print(f"[{g}] 방향 {len(runs)}개 감지 (기대 {len(VIEWS)}) — 구간: {runs}", file=sys.stderr)
        # 가장자리 안티앨리어싱: 1px 침식 후 살짝 흐리게
        core = ndi.binary_erosion(fg, iterations=1)
        alpha = np.clip(ndi.gaussian_filter(core.astype(np.float32), 0.9), 0, 1)
        # 투명 픽셀의 RGB가 종이 흰색이면 3D에서 텍스처 보간 때 가장자리에 흰 테두리가 번진다 —
        # 불투명하지 않은 픽셀의 색을 가장 가까운 인물 픽셀 색으로 채운다.
        solid = alpha > 0.98
        _, (iy, ix) = ndi.distance_transform_edt(~solid, return_indices=True)
        rgb = rgb[iy, ix]
        rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
        manifest[g] = {"meta": META[g], "views": {}}
        for name, (x0, x1) in zip(VIEWS, runs):
            sub = fg[:, x0:x1]
            ys = np.where(sub.any(axis=1))[0]
            y0, y1 = max(0, ys[0] - PAD), min(rgba.shape[0], ys[-1] + PAD)
            crop = Image.fromarray(rgba[y0:y1, max(0, x0 - PAD):min(rgba.shape[1], x1 + PAD)], "RGBA")
            if crop.height > MAX_H:
                crop = crop.resize((round(crop.width * MAX_H / crop.height), MAX_H), Image.LANCZOS)
            fn = f"{g}-{name}.png"
            crop.save(os.path.join(OUT, fn), optimize=True)
            manifest[g]["views"][name] = {"file": fn, "w": crop.width, "h": crop.height}
            print(f"{fn}: {crop.width}x{crop.height}")
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
