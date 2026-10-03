"""아트팀 Blender 원본(ART/BUS_STOP_XR_SOFT_FINISH_V03.blend)에서 /film용 소품 5개를 GLB로 내보낸다.

    Blender -b ART/BUS_STOP_XR_SOFT_FINISH_V03.blend --python scripts/blender/export_art_env.py

결과: public/reactive/art/{shelter,cafe,lantern,truck,cat}.glb
- 원본 좌표(Blender Z-up)를 그대로 내보낸다 — glTF 변환(Y-up)은 exporter가 하고, 장면에 놓는 위치·방향·크기 맞춤은
  components/ArtEnv.jsx 의 앵커 상수가 한다. 그래서 이 스크립트는 오브젝트를 옮기지 않는다(부모만 풀어 월드 위치를 고정).
- 트럭(9.7만)·고양이(8.7만 삼각형)는 Decimate 로 줄이고, 4K 텍스처는 2K JPEG 로 줄인다. 웹에서 쓸 수 있는 크기가 목적이다.
- 벤치는 뺀다: /film 의 옆사람 착석 높이·위치(좌면 0.50m)가 기존 벤치 기준이라 벤치는 기존 것을 쓴다.
"""
import os
import bpy

OUT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), "..", "ctxai-busstop-xr-audio-proto", "public", "reactive", "art"))
os.makedirs(OUT, exist_ok=True)
MAX_TEX = 2048


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def shrink_images():
    for img in bpy.data.images:
        if img.size[0] > MAX_TEX or img.size[1] > MAX_TEX:
            w, h = img.size
            k = MAX_TEX / max(w, h)
            img.scale(int(w * k), int(h * k))


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def export(name, objs, decimate=None):
    objs = [o for o in objs if o.type in ("MESH", "CURVE")]
    if decimate:
        for o in objs:
            if o.type == "MESH":
                select_only([o])
                m = o.modifiers.new("dec", "DECIMATE")
                m.ratio = decimate
                bpy.ops.object.modifier_apply(modifier="dec")
    select_only(objs)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")  # 선택 밖 부모(빈 오브젝트)에 의존하지 않게 월드 위치 고정
    select_only(objs)
    path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_image_format="JPEG", export_jpeg_quality=85, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_yup=True,
    )
    print(f"[export] {name}: {sum(tris(o) for o in objs if o.type == 'MESH')} tris, {os.path.getsize(path) / 1024:.0f} KB -> {path}")


shrink_images()
O = bpy.data.objects
export("shelter", [o for o in bpy.data.collections["01_SHELTER_V20"].all_objects if not o.name.startswith("Bench")])
export("cafe", list(bpy.data.collections["03_CAFE_REPLACEABLE_V20"].all_objects))
export("lantern", [O["V18 LANTERN far +000m"]])
export("truck", [O["V17_TRUCK__TRUCK_FINAL"]], decimate=0.25)
export("cat", [O["V17_CAT__CAT_FINAL"]], decimate=0.14)
