#!/usr/bin/env python3
"""아트팀 Unity 전달본의 구워진 월드(WorldGeometry.bytes, 포맷 'RXSB')를 웹용 GLB 3개로 바꾼다.

    python3 scripts/convert_unity_world.py        # (venv: numpy scipy pillow fast-simplification)
결과: public/reactive/world/{static,cafe,forest}.glb

왜 Blender 원본(.blend)이 아니라 이 파일인가: .blend 의 재질은 노이즈·램프·범프로 짠 프로시저럴 노드라 glTF 로
못 내보낸다. Unity 팀이 그걸 텍스처(Source/*.png)와 버텍스 컬러로 구워 둔 결과가 이 파일이라, 변환하면 팀이
Quest 에서 검증한 그 모습이 그대로 나온다.

RXSB 포맷(리틀엔디언): 'RXSB' u32 그룹수, 그룹마다 [u32 len,이름][u32 len,재질명][f32×3 원점][u32 정점수,u32 인덱스수]
  정점수×(pos3 nrm3 uv2 rgba4 = 12 float) + 인덱스수×u32.  정점 좌표는 원점 기준 로컬(Unity 축: x, y=높이, z=앞).

좌표 변환: Unity(x, y, z) → three/glTF(x, y, −z) — 원본 Blender(bx, by, bz) 기준으로 (bx, bz, −by) 와 같다.
이 월드의 "관객 눈" 은 Blender (1.017, 0.19) → three (1.017, −0.19) 이므로, /film 은 장면 전체를 (−1.017, 0, 0.54) 만큼
옮겨 관객을 원점(카메라 z=0.35)에 놓는다 — components/ArtWorld.jsx 의 WORLD_OFFSET.
"""
import json
import os
import struct
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
import fast_simplification

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_DIR = os.path.join(ROOT, "ART/BUS_STOP_XR_Unity_ColourFixed/Assets/BusStop/Source")
OUT = os.path.join(ROOT, "ctxai-busstop-xr-audio-proto/public/reactive/world")
MAX_TEX = {"Road": 2048, "Shelter": 2048, "Cafe": 2048, "Landscape": 1024, "StreetDetails": 1024, "CafeDoor": 1024}

# 재질 → glTF 재질 설정 (Unity .mat 값: GlassClear/Frosted/Water/Glow 는 직접 읽은 값)
MATS = {
    "PaintVertex": dict(rough=1.0, metal=0.0),
    "Shelter": dict(tex="Shelter", rough=0.8), "Road": dict(tex="Road", rough=0.85),
    "Landscape": dict(tex="Landscape", rough=0.95), "StreetDetails": dict(tex="StreetDetails", rough=0.8),
    "Cafe": dict(tex="Cafe", rough=0.8), "CafeDoor": dict(tex="CafeDoor", rough=0.7),
    "GlassClear": dict(color=(0.4, 0.35, 0.38, 0.06), rough=0.12, blend=True),
    "GlassFrosted": dict(color=(0.43, 0.32, 0.32, 0.93), rough=0.75, blend=True),
    "Water": dict(color=(0.1, 0.065, 0.12, 1.0), rough=0.12, metal=0.45),
    "Glow": dict(color=(1.0, 0.79, 0.48, 1.0), rough=0.6, emissive=(1.0, 0.79, 0.48)),
}


def parse(path):
    data = open(path, "rb").read()
    assert data[:4] == b"RXSB"
    off = 4
    (n,) = struct.unpack_from("<I", data, off); off += 4
    groups = []
    for _ in range(n):
        (l,) = struct.unpack_from("<I", data, off); off += 4; name = data[off:off + l].decode(); off += l
        (l,) = struct.unpack_from("<I", data, off); off += 4; mat = data[off:off + l].decode(); off += l
        origin = struct.unpack_from("<3f", data, off); off += 12
        vc, ic = struct.unpack_from("<II", data, off); off += 8
        v = np.frombuffer(data, dtype="<f4", count=vc * 12, offset=off).reshape(-1, 12); off += vc * 48
        idx = np.frombuffer(data, dtype="<u4", count=ic, offset=off).reshape(-1, 3); off += ic * 4
        groups.append(dict(name=name, mat=mat, origin=np.array(origin, np.float32), v=v, idx=idx))
    assert off == len(data)
    return groups


def to_three(g):
    v = g["v"]
    pos = v[:, 0:3] + g["origin"]
    pos = pos * np.array([1, 1, -1], np.float32)
    nrm = v[:, 3:6] * np.array([1, 1, -1], np.float32)
    uv = v[:, 6:8].copy(); uv[:, 1] = 1.0 - uv[:, 1]
    col = v[:, 8:12].copy()
    idx = g["idx"].astype(np.uint32)
    # 한 축 부호를 뒤집었으니 삼각형 감김이 저장된 법선과 맞는지 확인해 맞지 않으면 뒤집는다
    p0, p1, p2 = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    fn = np.cross(p1 - p0, p2 - p0)
    vn = nrm[idx[:, 0]] + nrm[idx[:, 1]] + nrm[idx[:, 2]]
    agree = (np.einsum("ij,ij->i", fn, vn) > 0).mean()
    if agree < 0.5:
        idx = idx[:, [0, 2, 1]]
    return pos.astype(np.float32), nrm.astype(np.float32), uv.astype(np.float32), col.astype(np.float32), np.ascontiguousarray(idx), agree


def thin_by_tree(pos, nrm, uv, col, idx, keep, cell=4.0, seed=7):
    """숲 타일 줄이기 — 삼각형을 무작위로 지우면 잎·줄기 조각이 공중에 떠 보인다(실제로 그랬다). 그래서 삼각형 중심을
    가로세로 cell(m) 칸으로 묶어(대략 나무 한 그루) 칸 단위로 통째로 남기거나 뺀다."""
    if keep >= 0.999:
        return pos, nrm, uv, col, idx
    c = pos[idx].mean(1)
    key = np.floor(c[:, [0, 2]] / cell).astype(np.int64)
    _, cid = np.unique(key, axis=0, return_inverse=True)
    rng = np.random.default_rng(seed)
    kept_cells = rng.random(cid.max() + 1) < keep
    tri = idx[kept_cells[cid.reshape(-1)]]
    used, inv = np.unique(tri, return_inverse=True)
    return pos[used], nrm[used], uv[used], col[used], inv.reshape(-1, 3).astype(np.uint32)


def decimate(pos, nrm, uv, col, idx, keep):
    """쿼드릭 단순화 후 속성은 가장 가까운 원래 정점에서 가져온다(카페용)."""
    if keep >= 0.98:
        return pos, nrm, uv, col, idx
    p, f = fast_simplification.simplify(pos.astype(np.float32), idx.astype(np.int32), target_reduction=1 - keep)
    used, f = np.unique(f, return_inverse=True)
    p = p[used]
    _, nn = cKDTree(pos).query(p)
    return p.astype(np.float32), nrm[nn], uv[nn], col[nn], f.reshape(-1, 3).astype(np.uint32)


class GLB:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.acc = []; self.meshes = []; self.mats = []; self.imgs = []; self.texs = []
        self.nodes = []; self.matidx = {}; self.texidx = {}

    def _view(self, b, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        o = len(self.bin); self.bin += b
        v = {"buffer": 0, "byteOffset": o, "byteLength": len(b)}
        if target: v["target"] = target
        self.views.append(v); return len(self.views) - 1

    def _acc(self, arr, ctype, typ, target=None, minmax=False):
        bv = self._view(arr.tobytes(), target)
        a = {"bufferView": bv, "componentType": ctype, "count": int(arr.shape[0]), "type": typ}
        if minmax: a["min"] = arr.min(0).tolist(); a["max"] = arr.max(0).tolist()
        self.acc.append(a); return len(self.acc) - 1

    def texture(self, name):
        if name in self.texidx: return self.texidx[name]
        im = Image.open(os.path.join(SRC_DIR, f"{name}.png")).convert("RGB")
        m = MAX_TEX.get(name, 1024)
        if max(im.size) > m: im = im.resize((m, m), Image.LANCZOS)
        import io
        b = io.BytesIO(); im.save(b, "JPEG", quality=88); bv = self._view(b.getvalue())
        self.imgs.append({"bufferView": bv, "mimeType": "image/jpeg", "name": name})
        self.texs.append({"source": len(self.imgs) - 1, "sampler": 0})
        self.texidx[name] = len(self.texs) - 1; return self.texidx[name]

    def material(self, key):
        if key in self.matidx: return self.matidx[key]
        c = MATS[key]; pbr = {"roughnessFactor": c.get("rough", 0.9), "metallicFactor": c.get("metal", 0.0)}
        m = {"name": key, "pbrMetallicRoughness": pbr, "doubleSided": True}
        if "tex" in c: pbr["baseColorTexture"] = {"index": self.texture(c["tex"])}
        if "color" in c: pbr["baseColorFactor"] = list(c["color"])
        if c.get("blend"): m["alphaMode"] = "BLEND"
        if "emissive" in c: m["emissiveFactor"] = list(c["emissive"])
        self.mats.append(m); self.matidx[key] = len(self.mats) - 1; return self.matidx[key]

    def add(self, name, matkey, pos, nrm, uv, col, idx):
        # 용량: 정점 색은 uint8, 색만 쓰는 재질은 UV 생략, 인덱스는 가능하면 uint16
        attrs = {"POSITION": self._acc(pos, 5126, "VEC3", 34962, True), "NORMAL": self._acc(nrm, 5126, "VEC3", 34962)}
        if "tex" in MATS[matkey]:
            attrs["TEXCOORD_0"] = self._acc(uv, 5126, "VEC2", 34962)
        c8 = np.clip(np.round(col * 255), 0, 255).astype(np.uint8)
        if not (c8[:, :3] == 255).all():
            attrs["COLOR_0"] = self._acc(c8, 5121, "VEC4", 34962, False)
            self.acc[-1]["normalized"] = True
        flat = idx.reshape(-1)
        if len(pos) < 65535:
            ia = self._acc(flat.astype(np.uint16), 5123, "SCALAR", 34963)
        else:
            ia = self._acc(flat.astype(np.uint32), 5125, "SCALAR", 34963)
        prim = {"attributes": attrs, "indices": ia, "material": self.material(matkey), "mode": 4}
        self.meshes.append({"name": name, "primitives": [prim]})
        self.nodes.append({"name": name, "mesh": len(self.meshes) - 1})

    def save(self, path):
        j = {"asset": {"version": "2.0", "generator": "convert_unity_world.py"}, "scene": 0, "scenes": [{"nodes": list(range(len(self.nodes)))}],
             "nodes": self.nodes, "meshes": self.meshes, "materials": self.mats, "accessors": self.acc, "bufferViews": self.views,
             "buffers": [{"byteLength": len(self.bin)}], "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]}
        if self.imgs: j["images"] = self.imgs; j["textures"] = self.texs
        js = json.dumps(j, separators=(",", ":")).encode()
        js += b" " * ((4 - len(js) % 4) % 4)
        while len(self.bin) % 4: self.bin.append(0)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, "wb") as f:
            f.write(struct.pack("<4sII", b"glTF", 2, total))
            f.write(struct.pack("<I4s", len(js), b"JSON")); f.write(js)
            f.write(struct.pack("<I4s", len(self.bin), b"BIN\0")); f.write(self.bin)
        # meshopt 압축 — /film 의 useGLTF(url, false, true) 가 디코더를 내장하고 있어 따로 파일이 필요 없다(약 1/3~1/4 크기)
        raw = path + ".raw"
        os.replace(path, raw)
        subprocess.run(["npx", "--yes", "@gltf-transform/cli@4", "meshopt", raw, path], check=True, capture_output=True)
        os.remove(raw)
        print(f"[glb] {os.path.basename(path)}: {len(self.meshes)} meshes, {sum(a['count'] for a in self.acc if a.get('type') == 'SCALAR') // 3} tris, {os.path.getsize(path) / 1e6:.1f} MB (meshopt)")


def main():
    os.makedirs(OUT, exist_ok=True)
    groups = parse(os.path.join(SRC_DIR, "WorldGeometry.bytes"))
    by = {g["name"]: g for g in groups}
    viewer = np.array([1.017, 0.0, -0.19], np.float32)  # three 좌표계의 관객 눈(x, _, z)

    def conv(name):
        pos, nrm, uv, col, idx, agree = to_three(by[name])
        print(f"  {name:14} verts {len(pos):7} tris {len(idx):7} winding-agree {agree:.2f}")
        return pos, nrm, uv, col, idx

    # 1) 정적 장면 — 쉘터(벤치 포함)·도로·지형·가로등/소품·유리·물웅덩이·불빛·카페 문
    s = GLB()
    for name in ["Shelter", "Road", "Landscape", "StreetDetails", "GlassClear", "GlassFrosted", "Water", "Glow", "CafeDoor"]:
        s.add(name, by[name]["mat"], *conv(name))
    s.save(os.path.join(OUT, "static.glb"))

    # 2) 카페 — 13만 삼각형. 떨어진 조각(화분·잎)이 많아 쿼드릭 단순화가 약 6만 삼각형에서 멈춘다(더 줄이려면 Blender Decimate 로)
    c = GLB()
    pos, nrm, uv, col, idx = conv("Cafe")
    c.add("Cafe", "Cafe", *decimate(pos, nrm, uv, col, idx, 0.16))
    c.save(os.path.join(OUT, "cafe.glb"))

    # 3) 숲 — 버텍스 컬러만 쓰는 100만+8만 삼각형. 가까운 타일은 그대로, 먼 타일만 나무 단위로 솎는다. 용량은 meshopt 압축으로 줄인다(아래 안내)
    f = GLB()
    total_in = total_out = 0
    for g in groups:
        if not (g["name"].startswith("Forest") or g["name"].startswith("Reeds")):
            continue
        pos, nrm, uv, col, idx, _ = to_three(g)
        c0 = pos.mean(0); d = float(np.hypot(c0[0] - viewer[0], c0[2] - viewer[2]))
        keep = 1.0 if d < 45 else 0.5 if d < 110 else 0.25  # 가까운 타일은 원본 그대로 — 관객이 실제로 보는 나무
        out = thin_by_tree(pos, nrm, uv, col, idx, keep)
        total_in += len(idx); total_out += len(out[4])
        f.add(g["name"], "PaintVertex", *out)
        print(f"  {g['name']:14} d={d:6.1f}m keep {keep:.2f}: {len(idx):6} -> {len(out[4]):6} tris")
    print(f"  forest total {total_in} -> {total_out} tris")
    f.save(os.path.join(OUT, "forest.glb"))


if __name__ == "__main__":
    main()
