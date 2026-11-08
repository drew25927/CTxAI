# V13 아트 장면(BUS_STOP_XR_WORKER_READY_V13.blend)에서 272번 버스만 웹용 GLB로 뽑는다 — components/BusArt.jsx 가 읽는다.
# 원본 .blend 는 저장하지 않는다(백그라운드에서 열고 내보내기만).
#   Blender 5.2 -b <V13.blend> --python scripts/blender/export_bus_v13.py -- public/reactive/models/bus272_v13.glb
# 하는 일: 문 닫힘·바퀴 0으로 굳힘 → 베벨 끔 → 고정 차체 1 + 문짝 8 + 바퀴 4로 메시 병합(그리기 호출 약 970 → 13) →
#   차체만 약 5만 삼각형으로 줄임 → 절차적 에나멜 색은 원본 램프 중간값으로, 유리(투과)는 반투명 알파로 → GLB.
# 문·바퀴 컨트롤(CTRL_DOOR_*·CTRL_WHEEL_*)은 노드로 남겨 앱에서 원본 드라이버 식대로 돌린다.

import bpy, sys
from mathutils import Matrix
OUT = sys.argv[sys.argv.index("--")+1]
BUDGET_STATIC, BUDGET_DOOR, BUDGET_WHEEL = 50000, 1600, 2600
bus = [c for c in bpy.data.collections if "버스_272" in c.name][0]
root = bpy.data.objects['CTRL_BUS_272__MOVE_THIS']
for k, v in dict(front_door=0.0, rear_door=0.0, steer_deg=0.0, wheel_roll_m=0.0, body_roll_deg=0.0, body_pitch_deg=0.0, body_heave_m=0.0, wipers=0.5).items():
    if k in root.keys(): root[k] = v
root.location = (0, 0, 0); root.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
objs = list(bus.all_objects)
# 드라이버를 굳힌다(현재 값으로) — 변환·병합 뒤엔 드라이버가 깨지므로 지운다
for o in objs:
    if o.animation_data:
        for d in list(o.animation_data.drivers): o.animation_data.drivers.remove(d)
ctrl = {o.name: o for o in objs if o.name.startswith('CTRL_')}
MOVING = [n for n in ctrl if n.startswith(('CTRL_DOOR_', 'CTRL_WHEEL_'))]
def group_of(o):
    p = o.parent
    while p is not None:
        if p.name in MOVING: return p.name
        p = p.parent
    return 'STATIC'
for o in objs:
    for m in o.modifiers:
        if m.type == 'BEVEL': m.show_render = m.show_viewport = False
# 숨김 렌더 오브젝트 삭제
geo = [o for o in objs if o.type in ('MESH', 'CURVE', 'FONT')]
dead = [o for o in geo if o.hide_render]
for o in dead: bpy.data.objects.remove(o, do_unlink=True)
geo = [o for o in geo if o not in dead]
vl = bpy.context.view_layer
for o in vl.objects: o.select_set(False)
for o in geo:
    o.hide_set(False); o.hide_viewport = False
    o.select_set(True)
vl.objects.active = geo[0]
with bpy.context.temp_override(selected_objects=geo, selected_editable_objects=geo, active_object=geo[0], object=geo[0]):
    bpy.ops.object.convert(target='MESH')
meshes = [o for o in bus.all_objects if o.type == 'MESH']
groups = {}
for o in meshes: groups.setdefault(group_of(o), []).append(o)
joined = {}
for g, ms in groups.items():
    target = root if g == 'STATIC' else ctrl[g]
    for o in ms:
        mw = o.matrix_world.copy(); o.parent = target; o.matrix_world = mw
    act = ms[0]
    with bpy.context.temp_override(selected_objects=ms, selected_editable_objects=ms, active_object=act, object=act):
        bpy.ops.object.join()
    act.name = f"MESH_{g}"
    joined[g] = act
def tris(o):
    o.data.calc_loop_triangles(); return len(o.data.loop_triangles)
report = []
for g, o in joined.items():
    budget = BUDGET_STATIC if g == 'STATIC' else BUDGET_DOOR if 'DOOR' in g else BUDGET_WHEEL
    before = tris(o)
    if before > budget:
        m = o.modifiers.new("dec", 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = budget / before; m.use_collapse_triangulate = True
        with bpy.context.temp_override(selected_objects=[o], selected_editable_objects=[o], active_object=o, object=o):
            bpy.ops.object.modifier_apply(modifier="dec")
    report.append((g, before, tris(o), len(o.material_slots)))
# 재질 — 절차적 색을 원래 값(램프 중간·기본값)으로 굳히고, 유리는 반투명으로
def flatten(m):
    nt = m.node_tree; p = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    bc = p.inputs['Base Color']
    if bc.is_linked:
        ramps = [n for n in nt.nodes if n.type == 'VALTORGB']
        rgb = [n for n in nt.nodes if n.type == 'RGB']
        if rgb: col = list(rgb[0].outputs[0].default_value)
        elif ramps:
            es = ramps[0].color_ramp.elements; col = [(es[0].color[i] + es[-1].color[i]) / 2 for i in range(4)]
        else: col = list(bc.default_value)
        for l in list(bc.links): nt.links.remove(l)
        bc.default_value = col
    for name in ('Normal',):
        for l in list(p.inputs[name].links): nt.links.remove(l)
    for name in ('Roughness', 'Metallic'):
        for l in list(p.inputs[name].links): nt.links.remove(l)
    tw = p.inputs['Transmission Weight'].default_value
    if tw > 0.3:
        p.inputs['Transmission Weight'].default_value = 0.0
        p.inputs['Alpha'].default_value = 0.22 if tw > 0.9 else 0.55
        m.surface_render_method = 'BLENDED'
mats = {s.material for o in joined.values() for s in o.material_slots if s.material}
for m in mats: flatten(m)
# 빈 empty 정리(CTRL 이 아닌 것)
for o in list(bus.all_objects):
    if o.type == 'EMPTY' and not o.name.startswith('CTRL_') and not o.children: bpy.data.objects.remove(o, do_unlink=True)
for o in vl.objects: o.select_set(False)
keep = [root] + list(root.children_recursive)
for o in keep: o.select_set(True)
vl.objects.active = root
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_animations=False, export_cameras=False, export_lights=False, export_extras=False)
for r in report: print("GROUP", r)
print("TOTAL_TRIS", sum(r[2] for r in report), "MATS", len(mats), "NODES", len(keep))
