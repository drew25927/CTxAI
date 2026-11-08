# V13 아트 장면(BUS_STOP_XR_WORKER_READY_V13.blend)의 정적 월드·트럭·고양이를 웹용 GLB로 뽑는다.
# 원본 .blend 는 저장하지 않는다(백그라운드에서 열고 내보내기만).
#
#   Blender 5.2 -b <V13.blend> --python scripts/blender/export_world_v13.py -- <앱 public/reactive 경로>
#   결과: world_v13/{static,cafe,forest}.glb, art_v13/{truck,cat}.glb  (meshopt 압축은 끝에 gltf-transform 로)
#
# 왜 이렇게 하나: 원본 재질은 노이즈·램프·정점색+색조 보정으로 짠 절차적 노드라 glTF 로 그대로 안 나간다.
# 그래서 Cycles 로 "빛 없이 색만" 정점색(Col)에 굽고, 재질은 앱의 기존 월드(components/ArtWorld.jsx)가 알아보는
# 세 가지 이름으로 바꾼다 — PaintVertex(정점색), GlassClear(쉘터 유리), Glow(가로등 확산판·카페 불빛).
# 좌표는 Unity 월드와 같다(관객 눈 Blender (1.017, 0.19) = glTF (1.017, −0.19)) → ArtWorld 의 WORLD_OFFSET 그대로.
# 가까운 것(관객 12m 안)은 원본 밀도를 두고, 먼 것만 줄여 그룹별 삼각형 예산에 맞춘다.
import bpy, sys, os, math, subprocess, time
from mathutils import Vector

_args = sys.argv[sys.argv.index("--") + 1:]
ROOT = _args[0]
ONLY = set(_args[1].split(",")) if len(_args) > 1 else None  # 예: forest,truck,cat — 일부만 다시 뽑을 때
OUT_WORLD = os.path.join(ROOT, "world_v13"); OUT_ART = os.path.join(ROOT, "art_v13")
os.makedirs(OUT_WORLD, exist_ok=True); os.makedirs(OUT_ART, exist_ok=True)
EYE = Vector((1.017, 0.19, 1.35))
NEAR_M = 12.0
GROUPS = {
    "static": ["01_부스·벤치·유리_기본", "03_후면유리_정원·식물", "04_투명유리_단면·안전도트", "01_도로·인도·연석", "02_담장·지형·기본식생",
               "03_가로수_기본", "04_갈대·노면반사·원경", "08_연석_붓결·이끼", "09_가로등_기구외형", "16_낙엽_기본", "18_접지·균열·낙엽_세부"],
    "cafe": ["01_카페_건물·실내", "02_카페_석재기초"],
    "forest": ["05_회화수목_공통", "06_시야틈새_식재", "10_중경수목·갈대", "11_카페옆_관목", "12_배후_침엽수", "13_카페왼쪽_층별식재",
               "15_카페주변_수목보강", "19_360_수목_상부층", "20_360_관목·하부층"],
}
BUDGET = {"static": 120000, "cafe": 70000, "forest": 950000}
t0 = time.time()
def log(*a): print(f"[{time.time() - t0:6.1f}s]", *a, flush=True)

sc = bpy.context.scene
vl = bpy.context.view_layer
coll = {c.name: c for c in bpy.data.collections}

def ctx(objs, active=None):
    a = active or objs[0]
    return bpy.context.temp_override(selected_objects=objs, selected_editable_objects=objs, active_object=a, object=a)

def tris(o):
    o.data.calc_loop_triangles(); return len(o.data.loop_triangles)

def objects_of(names):
    out = []
    for n in names:
        c = coll.get(n)
        if not c: log("!! 컬렉션 없음", n); continue
        out += [o for o in c.all_objects if o.type in ("MESH", "CURVE", "FONT") and not o.hide_render]
    return list(dict.fromkeys(out))

def prepare(objs):
    """보이게·단일 사용자·모디파이어 적용한 메시로."""
    for o in objs:
        o.hide_set(False); o.hide_viewport = False
        if o.data and o.data.users > 1: o.data = o.data.copy()  # 인스턴스·복제 나무는 메시를 공유한다 — 감축 전에 떼어 낸다
    with ctx(objs):
        bpy.ops.object.convert(target="MESH")
    return [o for o in objs if o.type == "MESH" and len(o.data.polygons)]

def classify(m):
    if m is None: return "PAINT"
    types = {n.type for n in m.node_tree.nodes} if m.node_tree else set()
    # 쉘터 옆 유리(V11 clear shelter glass)·안전 도트는 Principled 가 아니라 Transparent+Glossy 혼합이다 — 투명으로
    if "BSDF_TRANSPARENT" in types: return "GLASS"
    p = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.node_tree else None
    if p is None: return "PAINT"
    if p.inputs["Transmission Weight"].default_value > 0.5:
        return "FROSTED" if p.inputs["Roughness"].default_value > 0.3 else "GLASS"  # 뒤쪽 사생활 유리는 거친 투과 = 반투명
    if not p.inputs["Alpha"].is_linked and p.inputs["Alpha"].default_value < 0.6: return "GLASS"
    if p.inputs["Emission Strength"].default_value > 0.5 or "diffuser" in m.name.lower() or "window glow" in m.name.lower(): return "GLOW"
    return "PAINT"

def bake_colors(objs):
    """빛 없이 확산색만 정점색 Col 로 굽는다(Cycles CPU, 1샘플). 굽는 동안 나머지는 렌더에서 빼 BVH 를 작게."""
    keep = set(objs)
    hidden = [o for o in sc.objects if o not in keep and not o.hide_render]
    for o in hidden: o.hide_render = True
    sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 1
    sc.render.bake.target = "VERTEX_COLORS"
    for o in objs:
        ca = o.data.color_attributes.get("Col") or o.data.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        o.data.color_attributes.active_color = ca
    with ctx(objs):
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, target="VERTEX_COLORS")
    for o in hidden: o.hide_render = False

def shared_materials():
    def mat(name):
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial"); p = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(p.outputs[0], out.inputs[0]); return m, nt, p
    paint, nt, p = mat("PaintVertex")
    ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], p.inputs["Base Color"]); p.inputs["Roughness"].default_value = 1.0
    glass, _, p = mat("GlassClear")
    p.inputs["Base Color"].default_value = (0.85, 0.9, 0.92, 1); p.inputs["Alpha"].default_value = 0.16; p.inputs["Roughness"].default_value = 0.08
    glass.surface_render_method = "BLENDED"
    frosted, _, p = mat("GlassFrosted")
    p.inputs["Base Color"].default_value = (0.86, 0.9, 0.9, 1); p.inputs["Alpha"].default_value = 0.5; p.inputs["Roughness"].default_value = 0.6
    frosted.surface_render_method = "BLENDED"
    glow, _, p = mat("Glow")
    p.inputs["Base Color"].default_value = (1.0, 0.82, 0.55, 1); p.inputs["Emission Color"].default_value = (1.0, 0.78, 0.48, 1)
    p.inputs["Emission Strength"].default_value = 1.0
    return {"PAINT": paint, "GLASS": glass, "FROSTED": frosted, "GLOW": glow}

def export_glb(objs, path, materials="EXPORT", image_format="AUTO"):
    for o in vl.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    vl.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_materials=materials, export_vertex_color="MATERIAL", export_image_format=image_format,
                              export_jpeg_quality=85, export_cameras=False, export_lights=False, export_animations=False, export_extras=False)

def meshopt(path):
    r = subprocess.run(["npx", "--yes", "@gltf-transform/cli@4", "meshopt", path, path], capture_output=True, text=True)
    if r.returncode: log("!! meshopt 실패", r.stderr[-400:])

# 0) 컬렉션 인스턴스를 실제 오브젝트로 (수목 일부가 인스턴스)
inst = [o for o in bpy.data.objects if o.instance_type != "NONE" and o.instance_collection and not o.hide_render]
if inst:
    with ctx(inst):
        bpy.ops.object.duplicates_make_real(use_base_parent=False, use_hierarchy=False)
    log("인스턴스 실체화", len(inst))
coll = {c.name: c for c in bpy.data.collections}

mats = shared_materials()
report = []
for group, names in GROUPS.items():
    if ONLY and group not in ONLY: continue
    objs = prepare(objects_of(names))
    total = sum(tris(o) for o in objs)
    log(group, "오브젝트", len(objs), "삼각형", total)
    # 거리별 감축 — 가까운 것은 그대로, 먼 것만 비율로
    def dist(o):
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        cen = sum(bb, Vector()) / 8
        return (Vector((cen.x, cen.y)) - Vector((EYE.x, EYE.y))).length
    near = [o for o in objs if dist(o) < NEAR_M]; far = [o for o in objs if o not in near]
    nt = sum(tris(o) for o in near); ft = sum(tris(o) for o in far)
    ratio = max(0.05, min(1.0, (BUDGET[group] - nt) / ft)) if ft else 1.0
    if ratio < 0.999:
        for o in far:
            if tris(o) < 120: continue
            m = o.modifiers.new("dec", "DECIMATE"); m.decimate_type = "COLLAPSE"; m.ratio = ratio
            with ctx([o]): bpy.ops.object.modifier_apply(modifier="dec")
    after = sum(tris(o) for o in objs)
    log(group, f"가까운 {nt} / 먼 {ft} → 비율 {ratio:.2f}, 결과 {after}")
    bake_colors(objs)
    log(group, "색 굽기 끝")
    # 재질 슬롯을 세 가지 공용 재질로
    for o in objs:
        for s in o.material_slots:
            s.material = mats[classify(s.material)]
    # 컬렉션 단위로 합쳐 그리기 호출을 줄인다(카메라 컬링 단위는 컬렉션)
    joined = []
    owner = {}
    for n in names:  # 여러 컬렉션에 걸친 오브젝트는 처음 컬렉션 하나에만
        c = coll.get(n)
        for o in (c.all_objects if c else []):
            if o in objs and o.name not in owner: owner[o.name] = n
    parts = {n: [o for o in objs if owner.get(o.name) == n] for n in names}  # 합치기 전에 전부 정해 둔다(합쳐진 쪽은 지워진다)
    for n in names:
        part = parts[n]
        if not part: continue
        for o in part:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        with ctx(part, part[0]): bpy.ops.object.join()
        part[0].name = f"{group}__{n}"; joined.append(part[0])
    path = os.path.join(OUT_WORLD, f"{group}.glb")
    export_glb(joined, path)
    meshopt(path)
    report.append((group, total, after, os.path.getsize(path)))
    log(group, "내보냄", path, os.path.getsize(path) // 1024, "KB")

# 트럭·고양이 — 텍스처 재질이라 굽지 않고, 색조 보정 노드를 걷어 이미지를 바로 베이스컬러에 잇는다. 4K → 2K JPEG.
def flatten_textured(m):
    nt = m.node_tree; p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    img = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image), None)
    for name in ("Base Color", "Normal", "Roughness", "Metallic"):
        for l in list(p.inputs[name].links): nt.links.remove(l)
    if img:
        nt.links.new(img.outputs["Color"], p.inputs["Base Color"])
        if img.image.size[0] > 2048: img.image.scale(2048, 2048)
# 트럭 바퀴 — 원본은 메시 한 덩어리(조각 1,620개)라 바퀴가 따로 없다. 바깥 타이어 면에 원을 맞춰 잰 축 중심(x, z)과
# 타이어 띠(y) 안의 면을 바퀴마다 떼어 내고 원점을 축에 둔다 → components/ArtEnv.jsx 가 굴린다(Blender Y축 = 차축).
TRUCK_WHEELS = {  # 이름: (축 x, 축 z, y 띠 시작, 끝)
    "WHEEL_FL": (2.071, 0.405, 7.15, 7.45), "WHEEL_FR": (2.136, 0.446, 8.77, 9.06),
    "WHEEL_RL": (4.813, 0.449, 7.30, 7.60), "WHEEL_RR": (4.796, 0.454, 8.76, 9.05),
}
def split_truck_wheels(o):
    import bmesh
    ground = min((o.matrix_world @ v.co).z for v in o.data.vertices)
    out = []
    for name, (cx, cz, y0, y1) in TRUCK_WHEELS.items():
        r = (cz - ground) * 0.97
        bm = bmesh.new(); bm.from_mesh(o.data)
        mw = o.matrix_world
        def inside(v):
            w = mw @ v.co
            return (w.x - cx) ** 2 + (w.z - cz) ** 2 < r * r and y0 <= w.y <= y1
        faces = [f for f in bm.faces if all(inside(v) for v in f.verts)]
        if not faces: bm.free(); log("!! 바퀴 면 없음", name); continue
        # 바퀴 면만 남긴 새 메시
        keep = set(faces)
        bm2 = bm.copy()
        bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if f.index not in {x.index for x in keep}], context="FACES")
        me = bpy.data.meshes.new(name); bm2.to_mesh(me); bm2.free()
        # 원래 메시에서는 지운다
        bmesh.ops.delete(bm, geom=faces, context="FACES"); bm.to_mesh(o.data); bm.free()
        w = bpy.data.objects.new(name, me)
        for c in o.users_collection: c.objects.link(w)
        for m in o.data.materials: me.materials.append(m)
        w.matrix_world = o.matrix_world.copy()
        # 원점을 차축으로: 메시를 축 위치만큼 옮기고 오브젝트를 반대로
        from mathutils import Matrix, Vector
        axle_world = Vector((cx, (y0 + y1) / 2, cz)); axle_local = o.matrix_world.inverted() @ axle_world
        me.transform(Matrix.Translation(-axle_local)); w.matrix_world = o.matrix_world @ Matrix.Translation(axle_local)
        log("트럭 바퀴", name, "면", len(me.polygons), "반지름", round(r, 3))
        out.append(w)
    return out

def single_mesh_in(collname):
    c = next(c for c in bpy.data.collections if collname in c.name)
    return [o for o in c.all_objects if o.type == "MESH" and not o.hide_render]
for name, collname, budget in (("truck", "포터_트럭", 25000), ("cat", "고양이", 12000)):
    if ONLY and name not in ONLY: continue
    objs = prepare(single_mesh_in(collname))
    if name == "truck":
        objs += split_truck_wheels(objs[0])
    for o in objs:
        for s in o.material_slots:
            if s.material: flatten_textured(s.material)
        before = tris(o)
        b = 1500 if o.name.startswith("WHEEL_") else budget
        if before > b:
            m = o.modifiers.new("dec", "DECIMATE"); m.ratio = b / before
            with ctx([o]): bpy.ops.object.modifier_apply(modifier="dec")
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        log(name, o.name, before, "→", tris(o), "bbox", [round(min(v[i] for v in bb), 2) for i in range(3)], [round(max(v[i] for v in bb), 2) for i in range(3)])
    path = os.path.join(OUT_ART, f"{name}.glb")
    export_glb(objs, path, image_format="JPEG")
    meshopt(path)
    report.append((name, 0, sum(tris(o) for o in objs), os.path.getsize(path)))
for r in report: print("REPORT", r)
