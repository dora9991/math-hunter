"""蒼翼竜ヴェイラ: 飛行・翼破壊に対応した骨つきモデルを生成する。"""
import bpy
import bmesh
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/models/monster/zarva.glb"
DEST = ROOT / "assets/models/monster/veira.glb"
BLEND = ROOT / "tools/blender/out/veira.blend"
PREVIEW = ROOT / "tools/blender/out/veira_preview.png"
FRONT = ROOT / "tools/blender/out/veira_front.png"

def v(p):
    return Vector((p[0], -p[2], p[1]))

def mat(name, c, metal=0, rough=0.65, emit=0, double=False):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*c, 1)
    m.use_nodes = True
    m.use_backface_culling = not double
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*c, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*c, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
for o in list(bpy.context.scene.objects):
    if o != rig:
        bpy.data.objects.remove(o, do_unlink=True)

# 胸に左右の翼骨を増設。元の竜の関節はすべて維持する。
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for side, s in (("L", 1), ("R", -1)):
    bone = rig.data.edit_bones.new("wing" + side)
    bone.head = v((s*1.18, 4.02, 2.48))
    bone.tail = bone.head + Vector((0, 0, 0.24))
    bone.parent = rig.data.edit_bones["chest"]
    bone.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")

skin = mat("skin", (0.065, 0.21, 0.28))
belly = mat("belly", (0.25, 0.42, 0.46))
crest = mat("parts", (0.035, 0.12, 0.20), 0.13, 0.42)
rim = mat("wing_rim", (0.35, 0.64, 0.68), 0.12, 0.38)
membrane = mat("wing_membrane", (0.055, 0.31, 0.42), 0, 0.75, double=True)
membrane2 = mat("wing_membrane_light", (0.09, 0.38, 0.49), 0, 0.72, double=True)
horn = mat("horn", (0.68, 0.84, 0.82), 0.08, 0.35)
eye = mat("eye", (0.15, 0.92, 1.0), 0, 0.22, 1.3)
mouth = mat("mouth", (0.015, 0.055, 0.08))
pieces = []

def finish(o, name, material, bone, smooth=True):
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(material)
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    g = o.vertex_groups.new(name=bone)
    g.add(list(range(len(o.data.vertices))), 1, "REPLACE")
    pieces.append(o)
    return o

def ell(name, pos, scale, material, bone, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=10, location=v(pos))
    o = bpy.context.object
    o.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, material, bone)

def taper(name, a, b, r0, r1, material, bone, sides=9):
    A, B = v(a), v(b)
    d = B-A
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=r0, radius2=r1, depth=d.length, location=(A+B)/2)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, name, material, bone, False)

def blade(name, a, mid, end, width, material, bone):
    taper(name+"_root", a, mid, width, width*0.58, material, bone, 6)
    taper(name+"_tip", mid, end, width*0.58, 0.01, material, bone, 6)

def panel(name, coords, faces, material, bone):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([v(p) for p in coords], [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    return finish(ob, name, material, bone, False)

# 細身の竜体と長い首。翼で画面全体のシルエットを作る。
ell("pelvis", (0, 3.02, -0.25), (1.03, 0.92, 1.25), skin, "pelvis")
ell("spine", (0, 3.27, 1.30), (1.05, 1.01, 1.48), skin, "spine")
ell("chest", (0, 3.67, 2.79), (1.20, 1.10, 1.22), skin, "chest")
ell("breast", (0, 3.03, 2.94), (0.85, 0.70, 0.95), belly, "chest")
ell("neck_low", (0, 4.08, 3.91), (0.60, 0.64, 0.97), skin, "neck1")
ell("neck_high", (0, 4.40, 5.03), (0.51, 0.54, 0.85), skin, "neck2")
ell("head", (0, 4.53, 6.02), (0.68, 0.54, 0.76), skin, "head")
taper("snout", (0, 4.48, 6.45), (0, 4.32, 7.55), 0.48, 0.22, crest, "head", 8)
ell("jaw", (0, 4.10, 6.91), (0.42, 0.17, 0.66), belly, "jaw")
ell("mouth_dark", (0, 4.21, 6.94), (0.35, 0.04, 0.55), mouth, "jaw")
for s, side in ((1, "L"), (-1, "R")):
    ell("eye_"+side, (s*0.62, 4.70, 6.52), (0.075, 0.095, 0.14), eye, "head", 12)
    blade("head_horn_"+side, (s*0.43, 4.98, 5.94), (s*0.72, 5.36, 5.72), (s*1.02, 5.68, 5.30), 0.19, horn, "horn"+side)
    blade("cheek_fin_"+side, (s*0.62, 4.51, 6.11), (s*0.96, 4.56, 5.76), (s*1.30, 4.56, 5.44), 0.12, rim, "head")
    for k in range(5):
        taper("tooth_"+side+str(k), (s*(0.36-k*0.035), 4.25, 6.73+k*0.16),
              (s*(0.36-k*0.035), 4.06, 6.76+k*0.16), 0.045, 0.008, horn, "head", 6)

# 背の羽飾りと体側の細い装甲
for i, (bone, z, y, h) in enumerate([
    ("neck2", 5.20, 4.82, 0.50), ("neck1", 4.38, 4.72, 0.58),
    ("chest", 3.35, 4.65, 0.66), ("spine", 2.25, 4.45, 0.70),
    ("spine", 1.42, 4.40, 0.63), ("pelvis", 0.50, 4.12, 0.53),
]):
    blade("dorsal_"+str(i), (0, y, z), (0, y+h*0.6, z-0.25), (0, y+h, z-0.58), 0.22, rim, bone)
for s, side in ((1, "L"), (-1, "R")):
    for k in range(4):
        ell("flank_"+side+str(k), (s*0.94, 3.25, 0.8+k*0.47), (0.20, 0.12, 0.35), crest, "spine" if k<3 else "chest", 10)

# 翼膜を四つの区画に分け、骨状の筋を表面に重ねる。
for s, side in ((1, "L"), (-1, "R")):
    bone = "wing"+side
    pts = [
        (s*1.18, 4.02, 2.48), (s*2.65, 5.02, 2.15), (s*5.65, 6.00, 1.07),
        (s*5.15, 4.28, -0.25), (s*4.35, 3.17, -1.36),
        (s*3.08, 2.68, -2.07), (s*1.31, 3.45, -1.03),
    ]
    panel("wing_membrane_"+side, pts, [(0,1,6), (1,5,6), (1,4,5), (1,3,4), (1,2,3)], membrane, bone)
    panel("wing_highlight_"+side,
          [pts[1], pts[2], pts[3], (s*3.0, 4.45, 1.1)],
          [(0,1,3), (1,2,3)], membrane2, bone)
    for j, end in enumerate((pts[2], pts[3], pts[4], pts[5])):
        taper("wing_finger_"+side+str(j), pts[0] if j == 0 else pts[1], end,
              0.12 if j==0 else 0.08, 0.025, rim, bone, 6)
    taper("wing_leading_"+side, pts[0], pts[1], 0.20, 0.14, skin, bone, 8)
    blade("wing_hook_"+side, pts[1], (s*2.85, 5.20, 2.43), (s*3.04, 5.15, 2.76), 0.14, horn, bone)

# 脚・腕・鉤爪
for s, side in ((1, "L"), (-1, "R")):
    ell("thigh_"+side, (s*1.00, 2.57, 0.27), (0.60, 0.91, 0.86), skin, "thigh"+side)
    taper("shin_"+side, (s*1.00, 1.34, 0.25), (s*1.00, 0.08, 0.30), 0.37, 0.23, skin, "shin"+side)
    ell("foot_"+side, (s*1.00, 0.12, 0.54), (0.36, 0.20, 0.67), crest, "foot"+side)
    for k in (-1, 0, 1):
        taper("foot_claw_"+side+str(k), (s*1.00+k*0.24, 0.11, 0.93),
              (s*1.00+k*0.28, 0.00, 1.30), 0.105, 0.01, horn, "foot"+side, 6)
    ell("arm_"+side, (s*0.88, 2.91, 3.26), (0.27, 0.44, 0.30), skin, "arm"+side)
    ell("forearm_"+side, (s*0.88, 2.22, 3.30), (0.27, 0.42, 0.30), crest, "farm"+side)
    for k in (-1, 0, 1):
        taper("hand_claw_"+side+str(k), (s*0.88+k*0.08, 1.84, 3.44),
              (s*0.88+k*0.11, 1.58, 3.68), 0.055, 0.01, horn, "farm"+side, 6)

# 長い尾。飛行中に舵になる二枚の尾翼。
for i, (bone, a, b, r0, r1) in enumerate([
    ("pelvis",-0.7,-1.35,0.82,0.66), ("tail0",-1.35,-2.7,0.66,0.50),
    ("tail1",-2.7,-4.15,0.50,0.37), ("tail2",-4.15,-5.5,0.37,0.28),
    ("tail3",-5.5,-6.75,0.28,0.18), ("tail4",-6.75,-7.85,0.18,0.05),
]):
    taper("tail_"+str(i), (0,3.05,a), (0,3.02,b), r0, r1, skin, bone, 10)
for s in (-1,1):
    blade("tail_fin_"+str(s), (s*0.08,3.02,-7.25), (s*0.45,3.20,-7.75),
          (s*1.02,3.46,-8.25), 0.22, rim, "tail4")

bpy.ops.object.select_all(action="DESELECT")
for o in pieces: o.select_set(True)
bpy.context.view_layer.objects.active = pieces[0]
bpy.ops.object.join()
creature = pieces[0]
creature.name = "Veira"
creature.parent = rig
modifier = creature.modifiers.new("Skin", "ARMATURE")
modifier.object = rig

# 尻尾切断用
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
                      plane_co=Vector((0,4.15,0)), plane_no=Vector((0,-1,0)), clear_outer=True)
for vert in bm.verts: vert.co -= Vector((0,4.15,3.1))
bm.to_mesh(tail.data)
bm.free()
tail.hide_render = True

DEST.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
for o in (rig, creature, tail): o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str(DEST), export_format="GLB", use_selection=True,
                          export_skins=True, export_animations=False, export_yup=True)
print("EXPORTED", DEST, DEST.stat().st_size)

world = bpy.data.worlds.new("SkyStudio")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.09,0.14,0.18,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
def light(name, loc, power):
    data = bpy.data.lights.new(name, "AREA"); data.energy = power; data.size = 8
    ob = bpy.data.objects.new(name, data); bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector((0,0,3))-ob.location).to_track_quat("-Z","Y").to_euler()
light("Key", (5,-10,12), 1800)
light("Rim", (-7,3,10), 1700)
camd = bpy.data.cameras.new("PreviewCamera")
cam = bpy.data.objects.new("PreviewCamera", camd)
bpy.context.scene.collection.objects.link(cam)
cam.location = (10,-18,9)
cam.rotation_euler = (Vector((0,-1.0,3.3))-cam.location).to_track_quat("-Z","Y").to_euler()
camd.type = "ORTHO"; camd.ortho_scale = 18
bpy.context.scene.camera = cam
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.samples = 48
sc.render.resolution_x = 1200; sc.render.resolution_y = 900; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = "PNG"; sc.render.filepath = str(PREVIEW)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.render.render(write_still=True)
print("PREVIEW", PREVIEW)
cam.location = (0, -18, 11)
cam.rotation_euler = (Vector((0,-1.0,3.6))-cam.location).to_track_quat("-Z","Y").to_euler()
sc.render.filepath = str(FRONT)
bpy.ops.render.render(write_still=True)
print("FRONT", FRONT)
