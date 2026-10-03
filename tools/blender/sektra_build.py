"""晶殻竜セクトラ: ザルヴァと同じ骨格で動くオリジナルの敵モデル。

Blender 5.2:
  blender --background --python tools/blender/sektra_build.py
"""
import bpy
import bmesh
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/models/monster/zarva.glb"
DEST = ROOT / "assets/models/monster/sektra.glb"
BLEND = ROOT / "tools/blender/out/sektra.blend"
PREVIEW = ROOT / "tools/blender/out/sektra_preview.png"

# three.js の (x, 高さ, 前後) を Blender の (x, 前後, 高さ) に変換
def v(p):
    return Vector((p[0], -p[2], p[1]))

def material(name, color, metallic=0.0, roughness=0.72, glow=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Metallic"].default_value = metallic
    bs.inputs["Roughness"].default_value = roughness
    if glow:
        bs.inputs["Emission Color"].default_value = (*color, 1)
        bs.inputs["Emission Strength"].default_value = glow
    return m

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
for o in list(bpy.context.scene.objects):
    if o != rig:
        bpy.data.objects.remove(o, do_unlink=True)

skin = material("skin", (0.105, 0.14, 0.175))
under = material("underbelly", (0.235, 0.265, 0.275))
armor = material("parts", (0.055, 0.075, 0.10), 0.23, 0.42)
edge = material("armor_edge", (0.32, 0.38, 0.39), 0.26, 0.45)
dark_edge = material("dark_edge", (0.025, 0.035, 0.050), 0.28, 0.34)
crystal = material("crystal", (0.96, 0.29, 0.045), 0.12, 0.24, 0.35)
crystal_tip = material("crystal_tip", (1.0, 0.72, 0.20), 0.08, 0.18, 0.5)
vein = material("lava_vein", (0.56, 0.11, 0.025), 0.1, 0.34, 0.25)
eye = material("eye", (1.0, 0.68, 0.08), 0.0, 0.22, 1.6)
mouth = material("mouth", (0.12, 0.025, 0.015))

pieces = []

def finish(o, name, mat, bone, smooth=True):
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(mat)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    group = o.vertex_groups.new(name=bone)
    group.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    pieces.append(o)
    return o

def ell(name, p, scale, mat, bone, seg=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=v(p))
    o = bpy.context.object
    o.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat, bone)

def facet(name, p, scale, mat, bone, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=v(p))
    o = bpy.context.object
    o.scale = (scale[0], scale[2], scale[1])
    o.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, name, mat, bone, smooth=False)

def taper(name, a, b, r0, r1, mat, bone, sides=10):
    A, B = v(a), v(b)
    d = B - A
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=r0, radius2=r1, depth=d.length, location=(A+B)/2)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, name, mat, bone, smooth=False)

def crystal_spike(name, a, mid, tip, width, bone):
    taper(name + "_root", a, mid, width, width * 0.72, crystal, bone, 6)
    taper(name + "_tip", mid, tip, width * 0.72, 0.015, crystal_tip, bone, 6)

# 岩のような低い重心と、太い肩。胴体を骨ごとに分けてアニメーションに追従させる。
ell("hip_core", (0, 3.05, -0.35), (1.36, 1.18, 1.52), skin, "pelvis")
ell("belly", (0, 2.75, 0.75), (1.15, 0.79, 1.36), under, "spine")
ell("back", (0, 3.42, 1.45), (1.47, 1.25, 1.60), skin, "spine")
ell("shoulders", (0, 3.65, 2.9), (1.55, 1.25, 1.34), skin, "chest")
facet("breast_plate", (0, 3.02, 3.03), (1.18, 0.48, 0.95), armor, "chest")
facet("breast_keel", (0, 2.78, 3.45), (0.38, 0.35, 0.66), edge, "chest")
for side, bone in ((-1, "spine"), (1, "spine")):
    for i in range(4):
        facet("rib_plate_"+str(side)+"_"+str(i), (side*1.16, 3.00, 0.95+i*0.45),
              (0.44, 0.19, 0.31), armor, bone, (0, side*0.14, 0))
ell("neck_lower", (0, 4.05, 3.97), (0.74, 0.77, 0.96), skin, "neck1")
ell("neck_upper", (0, 4.43, 5.08), (0.61, 0.61, 0.82), skin, "neck2")

# 顔はくちばし状。左右に大きく張り出す結晶の冠で遠景からも識別できる。
ell("skull", (0, 4.56, 6.02), (0.91, 0.67, 0.91), skin, "head")
facet("brow", (0, 4.92, 6.43), (0.85, 0.29, 0.61), armor, "head")
taper("beak", (0, 4.42, 6.47), (0, 4.29, 7.62), 0.61, 0.29, armor, "head", 8)
facet("nose_ram", (0, 4.43, 7.41), (0.40, 0.22, 0.36), edge, "head")
ell("lower_jaw", (0, 4.04, 6.88), (0.58, 0.26, 0.81), under, "jaw")
facet("chin_armor", (0, 3.93, 7.08), (0.49, 0.23, 0.51), armor, "jaw")
ell("mouth_dark", (0, 4.19, 6.87), (0.38, 0.05, 0.62), mouth, "jaw")
crystal_spike("chin_fang", (0, 3.88, 7.14), (0, 3.66, 7.31), (0, 3.48, 7.46), 0.16, "jaw")
for s, side in ((1, "L"), (-1, "R")):
    ell("eye_socket_" + side, (s*0.70, 4.67, 6.43), (0.24, 0.17, 0.33), dark_edge, "head")
    ell("eye_" + side, (s*0.83, 4.71, 6.47), (0.07, 0.11, 0.16), eye, "head", 12, 8)
    crystal_spike("crown_" + side, (s*0.49, 5.05, 5.82), (s*0.83, 5.74, 5.72), (s*1.34, 6.25, 5.32), 0.31, "horn"+side)
    crystal_spike("ram_horn_" + side, (s*0.65, 4.94, 6.68), (s*1.16, 5.07, 6.94), (s*1.40, 5.09, 7.36), 0.22, "head")
    crystal_spike("cheek_" + side, (s*0.76, 4.45, 6.09), (s*1.08, 4.43, 5.87), (s*1.40, 4.39, 5.57), 0.21, "head")
    for i in range(3):
        z = 6.82 + i * 0.19
        taper("tooth_" + side + str(i), (s*(0.35-i*0.04), 4.28, z), (s*(0.34-i*0.04), 4.04, z+0.04), 0.065, 0.008, edge, "head", 6)

# 肩甲・腕・脚の装甲。左右の足元を大きくして踏みつけのシルエットを強くする。
for s, side in ((1, "L"), (-1, "R")):
    facet("shoulder_" + side, (s*1.31, 3.70, 3.00), (0.71, 0.56, 0.81), armor, "chest")
    facet("shoulder_outer_" + side, (s*1.68, 3.73, 3.10), (0.41, 0.43, 0.61), edge, "chest")
    crystal_spike("shoulder_horn_"+side, (s*1.67, 3.88, 3.00), (s*2.02, 4.35, 2.82), (s*2.27, 4.78, 2.43), 0.29, "chest")
    ell("arm_" + side, (s*1.02, 2.89, 3.29), (0.40, 0.58, 0.43), skin, "arm"+side)
    facet("forearm_" + side, (s*1.00, 2.18, 3.36), (0.43, 0.48, 0.46), armor, "farm"+side)
    crystal_spike("arm_blade_" + side, (s*1.09, 2.14, 3.45), (s*1.29, 1.74, 3.70), (s*1.43, 1.32, 4.08), 0.22, "farm"+side)
    for k in (-1, 0, 1):
        taper("hand_talon_"+side+str(k), (s*1.00+k*0.18, 1.87, 3.56),
              (s*1.02+k*0.22, 1.48, 3.91), 0.095, 0.015, edge, "farm"+side, 6)
    ell("haunch_" + side, (s*1.05, 2.58, 0.17), (0.72, 0.97, 0.87), skin, "thigh"+side)
    facet("thigh_armor_" + side, (s*1.39, 2.62, 0.20), (0.47, 0.75, 0.77), armor, "thigh"+side)
    facet("knee_" + side, (s*1.04, 1.32, 0.37), (0.46, 0.39, 0.56), edge, "shin"+side)
    crystal_spike("knee_blade_"+side, (s*1.11, 1.35, 0.69), (s*1.13, 1.29, 1.01), (s*1.16, 1.20, 1.38), 0.17, "shin"+side)
    taper("shin_" + side, (s*1.03, 1.28, 0.22), (s*1.03, 0.14, 0.17), 0.44, 0.26, skin, "shin"+side)
    ell("foot_" + side, (s*1.03, 0.13, 0.52), (0.47, 0.24, 0.76), armor, "foot"+side)
    for k in (-1, 0, 1):
        x = s*1.03+k*0.29
        taper("claw_"+side+str(k), (x, 0.13, 0.95), (x+k*0.04, 0.02, 1.35), 0.13, 0.015, edge, "foot"+side, 6)

# 六角結晶の背びれ。節ごとに骨に固定する。
spine = [
    ("neck2", 5.06, 4.75, 0.42), ("neck1", 4.46, 4.78, 0.56),
    ("chest", 3.54, 4.58, 0.74), ("chest", 2.83, 4.46, 0.81),
    ("spine", 2.05, 4.50, 0.89), ("spine", 1.31, 4.49, 0.80),
    ("pelvis", 0.55, 4.32, 0.68), ("pelvis", -0.24, 4.17, 0.55),
]
for i, (bone, z, y, h) in enumerate(spine):
    crystal_spike("back_crystal_"+str(i), (0, y-0.04, z), (0, y+h*0.53, z-0.24), (0, y+h, z-0.56), 0.27 if i < 2 else 0.35, bone)
    for s in (-1, 1):
        ell("back_scale_"+str(i)+str(s), (s*0.70, y-0.30, z), (0.31, 0.12, 0.48), armor, bone, 10, 7)

# 節のある長い尾と扇状の刃。元の当たり判定・切断位置と一致する。
tail_sections = [
    ("pelvis", -0.75, -1.35, 0.90, 0.72),
    ("tail0", -1.35, -2.7, 0.76, 0.59),
    ("tail1", -2.7, -4.15, 0.60, 0.46),
    ("tail2", -4.15, -5.5, 0.47, 0.34),
    ("tail3", -5.5, -6.75, 0.35, 0.23),
    ("tail4", -6.75, -7.87, 0.24, 0.06),
]
for i, (bone, a, b, r0, r1) in enumerate(tail_sections):
    taper("tail_"+str(i), (0, 3.1, a), (0, 3.03, b), r0, r1, skin, bone, 12)
    if i:
        crystal_spike("tail_fin_"+str(i), (0, 3.18, (a+b)/2), (0, 3.44, (a+b)/2-0.18), (0, 3.69, (a+b)/2-0.34), 0.15, bone)
for s in (-1, 1):
    crystal_spike("tail_tip_"+str(s), (s*0.12, 3.02, -7.47), (s*0.31, 3.04, -7.92), (s*0.48, 3.03, -8.30), 0.17, "tail4")
facet("tail_maul", (0, 3.04, -7.49), (0.56, 0.46, 0.74), armor, "tail4")
for s in (-1, 1):
    crystal_spike("maul_side_"+str(s), (s*0.38, 3.06, -7.56), (s*0.58, 3.13, -7.76), (s*0.86, 3.17, -8.06), 0.22, "tail4")

# 溶岩の線は装甲の隙間に短い節として配置する。マテリアルの発光がGLBにも残る。
for i in range(8):
    z = 0.35 + i*0.43
    bone = "pelvis" if i < 2 else ("spine" if i < 5 else "chest")
    for s in (-1, 1):
        ell("vein_"+str(i)+str(s), (s*(1.15 if i < 5 else 1.05), 3.47, z), (0.052, 0.045, 0.25), vein, bone, 8, 6)

# 単一の SkinnedMesh に統合
bpy.ops.object.select_all(action="DESELECT")
for o in pieces:
    o.select_set(True)
bpy.context.view_layer.objects.active = pieces[0]
bpy.ops.object.join()
creature = pieces[0]
creature.name = "Sektra"
creature.parent = rig
mod = creature.modifiers.new("Skin", "ARMATURE")
mod.object = rig

# 切断時に落ちる尻尾の複製（切断面から先だけ）。
tail = creature.copy()
tail.data = creature.data.copy()
bpy.context.scene.collection.objects.link(tail)
tail.name = "TailPiece"
tail.parent = None
tail.modifiers.clear()
tail.vertex_groups.clear()
bm = bmesh.new()
bm.from_mesh(tail.data)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                      plane_co=Vector((0, 4.15, 0)), plane_no=Vector((0, -1, 0)),
                      clear_outer=True)
for vert in bm.verts:
    vert.co -= Vector((0, 4.15, 3.1))
bm.to_mesh(tail.data)
bm.free()
tail.hide_render = True

DEST.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
for o in (rig, creature, tail):
    o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str(DEST), export_format="GLB", use_selection=True,
                          export_skins=True, export_animations=False, export_yup=True)
print("EXPORTED", DEST, DEST.stat().st_size)

# 編集用 .blend とサムネイル
tail.hide_render = True
world = bpy.data.worlds.new("Studio") if not bpy.data.worlds else bpy.data.worlds[0]
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.10, 0.13, 0.17, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
def light(name, loc, power, size):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = power
    d.shape = "DISK"
    d.size = size
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 3)) - o.location).to_track_quat("-Z", "Y").to_euler()
light("Key", (6, -9, 12), 1800, 8)
light("Rim", (-7, 3, 9), 1500, 7)
camd = bpy.data.cameras.new("PreviewCamera")
cam = bpy.data.objects.new("PreviewCamera", camd)
bpy.context.scene.collection.objects.link(cam)
cam.location = (12, -17, 10)
cam.rotation_euler = (Vector((0, -0.9, 3.4)) - cam.location).to_track_quat("-Z", "Y").to_euler()
camd.type = "ORTHO"
camd.ortho_scale = 17
bpy.context.scene.camera = cam
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = 48
sc.render.resolution_x = 1200
sc.render.resolution_y = 900
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = "PNG"
sc.render.filepath = str(PREVIEW)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.render.render(write_still=True)
print("PREVIEW", PREVIEW)
