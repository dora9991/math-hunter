# 焔角竜ザルヴァを Blender でつくる（Claude が書いたスクリプト。Blender 5.2 で動作）
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/zarva_build.py -- <mode> <outdir>
#     mode = shape : 形だけ作って確認用の画像を出す（速い）
#     mode = full  : 形 → うろこ → 色と凹凸の焼き込み → 骨 → GLB 書き出し
#
# 考え方：
#   1. ゲームと同じ骨格（関節の位置）を表にして持つ
#   2. 骨格にそって「先細りのカプセル」と楕円球を並べ、ボクセルで1つの立体に溶かし合わせる
#   3. 角・歯・爪・背びれは別の硬い部品として足す
#   4. 細かい版にうろこの凹凸をつけ、色と法線を粗い版（ゲーム用）へ焼き込む
#   5. 骨は「向きをそろえた短い棒」にして、ゲーム側の関節の回し方をそのまま使えるようにする
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MODE = argv[0] if argv else 'shape'
OUT = argv[1] if len(argv) > 1 else '/tmp/zarva'
os.makedirs(OUT, exist_ok=True)

# three.js の座標（x:左, y:上, z:前）→ Blender（x, -z, y）
def B(p):
    return Vector((p[0], -p[2], p[1]))

# ---- ゲームと同じ骨格（three.js のワールド座標） ----
JOINTS = {
    'pelvis': (None, (0, 3.05, 0)),
    'spine': ('pelvis', (0, 3.35, 1.25)),
    'chest': ('spine', (0, 3.55, 2.70)),
    'neck1': ('chest', (0, 4.05, 3.80)),
    'neck2': ('neck1', (0, 4.35, 4.85)),
    'head': ('neck2', (0, 4.47, 5.85)),
    'jaw': ('head', (0, 4.15, 6.10)),
    'hornL': ('head', (0.40, 5.05, 6.15)),
    'hornR': ('head', (-0.40, 5.05, 6.15)),
    'armL': ('chest', (0.85, 3.00, 3.25)),
    'farmL': ('armL', (0.85, 2.25, 3.25)),
    'armR': ('chest', (-0.85, 3.00, 3.25)),
    'farmR': ('armR', (-0.85, 2.25, 3.25)),
    'tail0': ('pelvis', (0, 3.20, -1.35)),
    'tail1': ('tail0', (0, 3.15, -2.70)),
    'tail2': ('tail1', (0, 3.10, -4.15)),
    'tail3': ('tail2', (0, 3.05, -5.50)),
    'tail4': ('tail3', (0, 3.00, -6.75)),
    'thighL': ('pelvis', (1.0, 2.75, 0.25)),
    'shinL': ('thighL', (1.0, 1.30, 0.25)),
    'footL': ('shinL', (1.0, 0.0, 0.25)),
    'thighR': ('pelvis', (-1.0, 2.75, 0.25)),
    'shinR': ('thighR', (-1.0, 1.30, 0.25)),
    'footR': ('shinR', (-1.0, 0.0, 0.25)),
}

# ---- 体の立体：(骨, 始点, 半径(x,y,z)または数値, 終点, 半径) ----
def R(r):
    return (r, r, r) if isinstance(r, (int, float)) else r

BODY = []
def cone(bone, p1, r1, p2, r2):
    BODY.append((bone, p1, R(r1), p2, R(r2)))
def blob(bone, p, r):
    BODY.append((bone, p, R(r), p, R(r)))

# 胴
cone('pelvis', (0, 3.05, -0.55), (1.2, 1.2, 1.2), (0, 3.3, 1.0), (1.36, 1.42, 1.3))
cone('spine', (0, 3.3, 1.0), (1.36, 1.42, 1.3), (0, 3.5, 2.5), (1.2, 1.32, 1.2))
blob('spine', (0, 2.72, 1.3), (1.05, 0.92, 1.5))            # 腹
cone('chest', (0, 3.5, 2.5), (1.2, 1.32, 1.2), (0, 3.75, 3.35), (0.96, 1.05, 0.9))
blob('chest', (0, 2.95, 2.95), (0.72, 0.85, 1.0))           # 胸の竜骨
for s in (1, -1):
    blob('pelvis', (s * 0.68, 3.6, 0.15), (0.55, 0.5, 0.85))   # 腰の張り出し
# 首
cone('neck1', (0, 3.85, 3.3), (0.92, 1.0, 0.9), (0, 4.3, 4.8), (0.72, 0.78, 0.7))
cone('neck2', (0, 4.3, 4.8), (0.72, 0.78, 0.7), (0, 4.5, 5.8), (0.64, 0.68, 0.6))
blob('neck1', (0, 3.6, 3.9), (0.55, 0.55, 0.8))             # のど
# 頭（上あご側）
blob('head', (0, 4.66, 6.1), (0.74, 0.6, 0.8))               # 頭骨
blob('head', (0, 4.98, 5.72), (0.5, 0.28, 0.45))             # 後頭部のとさか
cone('head', (0, 4.58, 6.6), (0.58, 0.42, 0.5), (0, 4.5, 7.5), (0.4, 0.25, 0.3))   # 鼻づら
blob('head', (0, 4.8, 7.0), (0.2, 0.13, 0.5))                # 鼻すじ
for s in (1, -1):
    blob('head', (s * 0.46, 5.02, 6.55), (0.19, 0.13, 0.46))   # 眉
    blob('head', (s * 0.62, 4.52, 6.4), (0.19, 0.2, 0.5))      # ほお骨
    blob('head', (s * 0.6, 4.32, 5.95), (0.27, 0.4, 0.4))      # あごの付け根の筋肉
    blob('head', (s * 0.19, 4.66, 7.58), 0.12)                 # 鼻孔のふくらみ
    cone('head', (s * 0.44, 4.36, 6.7), 0.1, (s * 0.31, 4.36, 7.5), 0.085)  # 上くちびる
# 尻尾
cone('pelvis', (0, 3.05, -0.55), (1.2, 1.2, 1.2), (0, 3.2, -1.35), (0.98, 1.0, 0.9))
cone('tail0', (0, 3.2, -1.35), (0.98, 1.0, 0.9), (0, 3.15, -2.7), 0.8)
cone('tail1', (0, 3.15, -2.7), 0.8, (0, 3.1, -4.15), 0.62)
cone('tail2', (0, 3.1, -4.15), 0.62, (0, 3.05, -5.5), 0.45)
cone('tail3', (0, 3.05, -5.5), 0.45, (0, 3.0, -6.75), 0.3)
cone('tail4', (0, 3.0, -6.75), 0.3, (0, 3.0, -7.9), 0.1)
# 脚と腕（左右）
for s, L in ((1, 'L'), (-1, 'R')):
    blob('thigh' + L, (s * 0.95, 2.55, 0.35), (0.7, 1.05, 1.15))       # もも（太い）
    cone('thigh' + L, (s * 1.0, 2.75, 0.25), 0.78, (s * 1.0, 1.3, 0.25), 0.46)
    blob('shin' + L, (s * 1.0, 1.3, 0.47), 0.3)                         # ひざ
    blob('shin' + L, (s * 1.0, 0.95, 0.02), (0.4, 0.55, 0.48))         # ふくらはぎ
    cone('shin' + L, (s * 1.0, 1.3, 0.25), 0.46, (s * 1.0, 0.0, 0.25), 0.3)
    blob('foot' + L, (s * 1.0, 0.02, 0.08), 0.3)                        # かかと
    cone('foot' + L, (s * 1.0, 0.0, 0.25), 0.3, (s * 1.0, -0.6, 0.32), 0.3)
    for k in (-1, 0, 1):                                                # 指
        cone('foot' + L, (s * 1.0, -0.6, 0.36), 0.2, (s * 1.0 + k * 0.34, -0.7, 1.05), 0.12)
    blob('chest', (s * 0.72, 3.3, 3.05), (0.45, 0.5, 0.55))             # 肩
    cone('arm' + L, (s * 0.85, 3.0, 3.25), 0.32, (s * 0.85, 2.25, 3.25), 0.23)
    cone('farm' + L, (s * 0.85, 2.25, 3.25), 0.23, (s * 0.85, 1.62, 3.3), 0.15)

# 下あご（口が開くので別の立体）
JAW = [('jaw', (0, 4.1, 6.1), (0.52, 0.2, 0.3), (0, 4.02, 7.4), (0.33, 0.13, 0.2)),
       ('jaw', (0, 3.96, 7.25), (0.25, 0.14, 0.2), (0, 3.96, 7.25), (0.25, 0.14, 0.2)),
       ('jaw', (0.48, 4.16, 6.05), 0.21, (0.48, 4.16, 6.05), 0.21),
       ('jaw', (-0.48, 4.16, 6.05), 0.21, (-0.48, 4.16, 6.05), 0.21)]


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def ico(center, radius3, sub=3):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    c = B(center)
    # 半径は three の (x,y,z) → Blender の (x, z→-y なので y と z を入れ替え)
    radius3 = R(radius3)
    sx, sy, sz = radius3[0], radius3[2], radius3[1]
    for v in bm.verts:
        v.co = Vector((v.co.x * sx + c.x, v.co.y * sy + c.y, v.co.z * sz + c.z))
    return bm

def hull_part(p1, r1, p2, r2):
    """2つの楕円球の凸包＝先細りのカプセル"""
    bm = ico(p1, r1)
    if tuple(p1) != tuple(p2):
        bm2 = ico(p2, r2)
        me_tmp = bpy.data.meshes.new('tmp'); bm2.to_mesh(me_tmp); bm2.free()
        bm.from_mesh(me_tmp); bpy.data.meshes.remove(me_tmp)
        res = bmesh.ops.convex_hull(bm, input=bm.verts)
        junk = [e for e in res.get('geom_interior', []) + res.get('geom_unused', []) if isinstance(e, bmesh.types.BMVert)]
        if junk:
            bmesh.ops.delete(bm, geom=junk, context='VERTS')
    return bm

def build_union(parts, name, voxel):
    """立体を全部つないでボクセルで1つに溶かす"""
    bm_all = bmesh.new()
    for (_, p1, r1, p2, r2) in parts:
        bm = hull_part(p1, r1, p2, r2)
        me_tmp = bpy.data.meshes.new('tmp'); bm.to_mesh(me_tmp); bm.free()
        bm_all.from_mesh(me_tmp); bpy.data.meshes.remove(me_tmp)
    me = bpy.data.meshes.new(name)
    bm_all.to_mesh(me); bm_all.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    me.remesh_voxel_size = voxel
    me.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()
    return ob

def smooth(ob, factor=0.6, iters=10):
    m = ob.modifiers.new('sm', 'SMOOTH'); m.factor = factor; m.iterations = iters
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)

def shade_smooth(ob):
    for p in ob.data.polygons: p.use_smooth = True

# ---- 硬い部品（角・歯・爪・背びれ・目）----
def tube(points, radii, sides=10, name='tube', flat=1.0):
    """折れ線にそった先細りの筒（角・爪など）。flat<1 で板状に"""
    bm = bmesh.new()
    rings = []
    pts = [B(p) for p in points]
    for i, c in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        a = d.cross(up).normalized(); b = d.cross(a).normalized()
        ring = []
        for k in range(sides):
            t = k / sides * math.tau
            ring.append(bm.verts.new(c + (a * math.cos(t) * flat + b * math.sin(t)) * radii[i]))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(sides):
            bm.faces.new([rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]])
    bm.faces.new(list(reversed(rings[0])))
    tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1] * 1.5)
    for k in range(sides):
        bm.faces.new([rings[-1][k], rings[-1][(k + 1) % sides], tip])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.verts.index_update(); bm.verts.ensure_lookup_table()
    tv = [min(1.0, (v.index // sides) / max(1, len(pts) - 1)) for v in bm.verts]
    tv[-1] = 1.0
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me['tvals'] = tv
    return me

RIGID = []   # (mesh, 骨の名前, 色(頂点カラー用の関数 or 定数))
def add_rigid(me, bone, col):
    RIGID.append((me, bone, col))

IVORY = (0.86, 0.80, 0.62); DARK = (0.10, 0.08, 0.07); TOOTH = (0.92, 0.88, 0.78); PLATE = (0.16, 0.10, 0.09)

def build_rigid():
    # 角：頭の上から後ろへ反る（根元は象牙色、先は黒）
    for s, L in ((1, 'L'), (-1, 'R')):
        pts = [(s * 0.40, 5.02, 6.2), (s * 0.5, 5.35, 5.85), (s * 0.62, 5.72, 5.35), (s * 0.7, 6.0, 4.75), (s * 0.72, 6.12, 4.2)]
        add_rigid(tube(pts, [0.24, 0.21, 0.17, 0.11, 0.05], 10, 'horn' + L), 'horn' + L, 'horn')
    # 鼻の角
    add_rigid(tube([(0, 4.72, 7.3), (0, 4.95, 7.38), (0, 5.15, 7.3)], [0.13, 0.09, 0.04], 8, 'nosehorn'), 'head', 'horn')
    # 背びれ（首から尻尾まで。板状のとげ）
    spine_pts = [('neck2', 4.95, 5.2, 0.42), ('neck1', 4.9, 4.4, 0.5), ('neck1', 4.85, 3.7, 0.58), ('chest', 4.75, 3.0, 0.66), ('spine', 4.72, 2.2, 0.72), ('spine', 4.68, 1.4, 0.74),
                 ('pelvis', 4.5, 0.6, 0.7), ('pelvis', 4.25, -0.3, 0.64), ('tail0', 4.12, -1.3, 0.58), ('tail0', 3.98, -2.1, 0.52), ('tail1', 3.86, -2.9, 0.46),
                 ('tail1', 3.74, -3.7, 0.4), ('tail2', 3.6, -4.5, 0.34), ('tail2', 3.5, -5.2, 0.28), ('tail3', 3.4, -5.9, 0.22), ('tail3', 3.3, -6.5, 0.17), ('tail4', 3.2, -7.1, 0.12)]
    for bone, y, z, h in spine_pts:
        add_rigid(tube([(0, y - 0.25, z + 0.05), (0, y + h * 0.5, z - h * 0.25), (0, y + h, z - h * 0.75)], [h * 0.34, h * 0.24, h * 0.07], 8, 'plate', flat=0.35), bone, 'plate')
    # 歯（上あご・下あご）
    for s in (1, -1):
        for i in range(7):
            z = 6.75 + i * 0.105; x = s * (0.4 - i * 0.02)
            add_rigid(tube([(x, 4.32, z), (x * 0.98, 4.12, z + 0.02)], [0.05, 0.015], 6, 'tooth'), 'head', 'tooth')
        for i in range(6):
            z = 6.8 + i * 0.1; x = s * (0.3 - i * 0.015)
            add_rigid(tube([(x, 4.1, z), (x, 4.3, z + 0.02)], [0.045, 0.012], 6, 'tooth'), 'jaw', 'tooth')
    for k in (-1, 1):   # 前歯
        add_rigid(tube([(k * 0.12, 4.3, 7.62), (k * 0.11, 4.08, 7.66)], [0.055, 0.015], 6, 'tooth'), 'head', 'tooth')
        add_rigid(tube([(k * 0.1, 4.08, 7.45), (k * 0.1, 4.28, 7.47)], [0.045, 0.012], 6, 'tooth'), 'jaw', 'tooth')
    # 爪（足・手）
    for s, L in ((1, 'L'), (-1, 'R')):
        for k in (-1, 0, 1):
            bx = s * 1.0 + k * 0.3
            add_rigid(tube([(bx, -0.66, 0.95), (bx + k * 0.03, -0.62, 1.2), (bx + k * 0.05, -0.74, 1.38)], [0.11, 0.08, 0.03], 8, 'claw'), 'foot' + L, 'claw')
            hx = s * 0.85 + k * 0.09
            add_rigid(tube([(hx, 1.66, 3.3), (hx, 1.48, 3.36), (hx, 1.36, 3.5)], [0.05, 0.04, 0.015], 6, 'claw'), 'farm' + L, 'claw')
        # かかとのとげ
        add_rigid(tube([(s * 1.0, -0.3, 0.0), (s * 1.0, -0.25, -0.2), (s * 1.0, -0.32, -0.36)], [0.1, 0.07, 0.025], 8, 'claw'), 'foot' + L, 'claw')

def build_eyes():
    out = []
    for s in (1, -1):
        bm = ico((s * 0.535, 4.78, 6.8), (0.07, 0.08, 0.095), 2)
        me = bpy.data.meshes.new('eye'); bm.to_mesh(me); bm.free()
        out.append(me)
    return out

def build_pupils():
    out = []
    for s in (1, -1):
        bm = ico((s * 0.593, 4.78, 6.83), (0.018, 0.066, 0.03), 2)
        me = bpy.data.meshes.new('pupil'); bm.to_mesh(me); bm.free()
        me['tvals'] = [1.0] * len(me.vertices)
        out.append(me)
    return out


# ---- 確認用の画像 ----
def setup_preview(target=(0, 3.0, 0.0)):
    sc = bpy.context.scene
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.65, 0.78, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = 0.2
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(35))
    # 地面
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    me = bpy.data.meshes.new('ground'); bm.to_mesh(me); bm.free()
    g = bpy.data.objects.new('ground', me); g.location = (0, 0, -0.72); sc.collection.objects.link(g)
    gm = bpy.data.materials.new('ground'); gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.36, 0.22, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    me.materials.append(gm)
    cam = bpy.data.cameras.new('cam'); cam.lens = 40
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    sc.render.resolution_x = 720; sc.render.resolution_y = 480
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 85
    try:
        sc.render.engine = 'CYCLES'
        sc.cycles.samples = 24; sc.cycles.use_denoising = True
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices: d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e:
        print('cycles gpu setup failed', e)
    return co

def shoot(cam, name, pos, look=(0, 3.0, 0.0)):
    cam.location = B(pos)
    d = B(look) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)

def simple_mat(name, color, rough=0.6, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 3
    return m

def link(me, name, mat=None):
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if mat: me.materials.append(mat)
    shade_smooth(ob)
    return ob


if MODE == 'shape':
    clear_scene()
    body = build_union(BODY, 'body', 0.085)
    smooth(body, 0.7, 14); shade_smooth(body)
    jaw = build_union(JAW, 'jawmesh', 0.05)
    smooth(jaw, 0.6, 8); shade_smooth(jaw)
    skin = simple_mat('skin', (0.42, 0.11, 0.07), 0.65)
    body.data.materials.append(skin); jaw.data.materials.append(skin)
    build_rigid()
    cols = {'horn': IVORY, 'plate': PLATE, 'tooth': TOOTH, 'claw': DARK}
    mats = {k: simple_mat(k, v, 0.45) for k, v in cols.items()}
    for me, bone, col in RIGID: link(me, me.name, mats[col])
    eye = simple_mat('eye', (1, 0.8, 0.2), 0.3, emit=(1.0, 0.65, 0.1))
    for me in build_eyes(): link(me, 'eye', eye)
    print('TRIS body', sum(len(p.vertices) - 2 for p in body.data.polygons), 'jaw', sum(len(p.vertices) - 2 for p in jaw.data.polygons))
    cam = setup_preview()
    shoot(cam, 'shape_side.jpg', (17, 4.2, 0.5), (0, 2.8, 0.2))
    shoot(cam, 'shape_front34.jpg', (9, 4.5, 15), (0, 3.2, 2.0))
    shoot(cam, 'shape_head.jpg', (3.6, 5.0, 10.2), (0, 4.6, 6.4))
    print('DONE shape')


# =====================================================================
#  full：色・凹凸の焼き込み → 骨 → GLB
# =====================================================================
TEX = 2048

def three_co(v):
    """Blender の頂点座標 → three.js の座標"""
    return (v.x, v.z, -v.y)

def skin_material(img_color, img_normal):
    """うろこの色と凹凸をプログラムで作る素材（焼き込み元）"""
    m = bpy.data.materials.new('skin'); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    for n in list(N): N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    geo = N.new('ShaderNodeNewGeometry')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sep.inputs[0])
    pos = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], pos.inputs[0])

    def val(v):
        n = N.new('ShaderNodeValue'); n.outputs[0].default_value = v; return n.outputs[0]
    def rgb(c):
        n = N.new('ShaderNodeRGB'); n.outputs[0].default_value = (*c, 1); return n.outputs[0]
    def maprange(x, a, b, c=0.0, d=1.0, smooth=True):
        n = N.new('ShaderNodeMapRange'); n.interpolation_type = 'SMOOTHSTEP' if smooth else 'LINEAR'
        L.new(x, n.inputs[0]); n.inputs[1].default_value = a; n.inputs[2].default_value = b; n.inputs[3].default_value = c; n.inputs[4].default_value = d
        return n.outputs[0]
    def mix(fac, a, b):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'
        if isinstance(fac, float): n.inputs[0].default_value = fac
        else: L.new(fac, n.inputs[0])
        L.new(a, n.inputs[6]); L.new(b, n.inputs[7])
        return n.outputs[2]
    def math_(op, a, b=None):
        n = N.new('ShaderNodeMath'); n.operation = op
        if isinstance(a, float): n.inputs[0].default_value = a
        else: L.new(a, n.inputs[0])
        if b is not None:
            if isinstance(b, float): n.inputs[1].default_value = b
            else: L.new(b, n.inputs[1])
        return n.outputs[0]

    # 大きな色むら
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.55; noise.inputs['Detail'].default_value = 3
    L.new(geo.outputs['Position'], noise.inputs['Vector'])
    back = mix(noise.outputs['Fac'], rgb((0.15, 0.028, 0.022)), rgb((0.36, 0.075, 0.045)))
    # 背中のしま（体の前後方向＝Blender の Y）
    wave = N.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'Y'
    wave.inputs['Scale'].default_value = 0.75; wave.inputs['Distortion'].default_value = 5.5; wave.inputs['Detail'].default_value = 2; wave.inputs['Detail Scale'].default_value = 1.2
    L.new(geo.outputs['Position'], wave.inputs['Vector'])
    stripe = maprange(wave.outputs['Fac'], 0.55, 0.8)
    up = maprange(sep.outputs['Z'], 0.05, 0.6)
    stripe = math_('MULTIPLY', stripe, up)
    back = mix(math_('MULTIPLY', stripe, 0.8), back, rgb((0.045, 0.015, 0.015)))
    # 腹（下向きの面）は明るい色
    belly = maprange(sep.outputs['Z'], -0.25, -0.8)
    col = mix(belly, back, rgb((0.56, 0.40, 0.25)))
    # うろこ：セルの境目を暗く、セルごとに明るさを少し変える
    vor = N.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 7.5
    L.new(geo.outputs['Position'], vor.inputs['Vector'])
    edge = maprange(vor.outputs['Distance'], 0.0, 0.085)
    vor2 = N.new('ShaderNodeTexVoronoi'); vor2.feature = 'F1'; vor2.inputs['Scale'].default_value = 7.5
    L.new(geo.outputs['Position'], vor2.inputs['Vector'])
    cellv = N.new('ShaderNodeSeparateColor'); L.new(vor2.outputs['Color'], cellv.inputs[0])
    cell = maprange(cellv.outputs[0], 0.0, 1.0, 0.82, 1.12, False)
    shade = math_('MULTIPLY', maprange(edge, 0.0, 1.0, 0.62, 1.0, False), cell)
    # 腹は横じまの板（腹板）
    scute = N.new('ShaderNodeTexWave'); scute.wave_type = 'BANDS'; scute.bands_direction = 'Y'; scute.inputs['Scale'].default_value = 2.6
    L.new(geo.outputs['Position'], scute.inputs['Vector'])
    scute_line = maprange(scute.outputs['Fac'], 0.0, 0.14, 0.55, 1.0)
    shade = mix(belly, shade, scute_line) if False else math_('MULTIPLY', shade, math_('ADD', math_('MULTIPLY', belly, math_('SUBTRACT', scute_line, 1.0)), 1.0))
    # くぼみを暗く（影のたまり）
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.7; ao.samples = 12
    aof = maprange(ao.outputs['AO'], 0.0, 1.0, 0.4, 1.0, False)
    shade = math_('MULTIPLY', shade, aof)
    # 足先・尻尾の先は黒ずむ
    low = maprange(pos.outputs['Z'], 0.6, -0.4)            # Blender の Z＝高さ
    col = mix(math_('MULTIPLY', low, 0.55), col, rgb((0.08, 0.04, 0.035)))
    tailtip = maprange(pos.outputs['Y'], 5.6, 7.8)        # Blender の +Y＝後ろ
    col = mix(math_('MULTIPLY', tailtip, 0.6), col, rgb((0.06, 0.02, 0.02)))
    # 口の中は暗い赤
    mz = maprange(pos.outputs['Y'], -6.25, -6.45)          # 前（-Y）へ 6.3 より先
    mh = math_('MULTIPLY', maprange(pos.outputs['Z'], 4.0, 4.1), maprange(pos.outputs['Z'], 4.42, 4.32))
    mx = maprange(math_('ABSOLUTE', pos.outputs['X']), 0.36, 0.26)
    mouth = math_('MULTIPLY', math_('MULTIPLY', mz, mh), mx)
    col = mix(mouth, col, rgb((0.22, 0.03, 0.035)))
    final = N.new('ShaderNodeMix'); final.data_type = 'RGBA'; final.blend_type = 'MULTIPLY'; final.inputs[0].default_value = 1.0
    L.new(col, final.inputs[6])
    sh3 = N.new('ShaderNodeCombineColor'); L.new(shade, sh3.inputs[0]); L.new(shade, sh3.inputs[1]); L.new(shade, sh3.inputs[2])
    L.new(sh3.outputs[0], final.inputs[7])
    emit = N.new('ShaderNodeEmission'); L.new(final.outputs[2], emit.inputs['Color'])

    # 凹凸（バンプ）：うろこの境目をへこませ、腹板・しわを足す
    bsdf = N.new('ShaderNodeBsdfPrincipled'); bsdf.inputs['Roughness'].default_value = 0.7
    h1 = maprange(vor.outputs['Distance'], 0.0, 0.12)
    wr = N.new('ShaderNodeTexNoise'); wr.inputs['Scale'].default_value = 3.0; wr.inputs['Detail'].default_value = 6; wr.inputs['Roughness'].default_value = 0.65
    L.new(geo.outputs['Position'], wr.inputs['Vector'])
    h = math_('ADD', math_('MULTIPLY', h1, 0.7), math_('MULTIPLY', wr.outputs['Fac'], 0.5))
    h = math_('ADD', h, math_('MULTIPLY', math_('MULTIPLY', belly, maprange(scute.outputs['Fac'], 0.0, 0.2)), 0.8))
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.9; bump.inputs['Distance'].default_value = 0.035
    L.new(h, bump.inputs['Height'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    # 焼き込み先の画像
    tc = N.new('ShaderNodeTexImage'); tc.image = img_color; tc.name = 'bake_color'
    tn = N.new('ShaderNodeTexImage'); tn.image = img_normal; tn.name = 'bake_normal'
    return m, out, emit, bsdf, tc, tn

def bake(ob, mat, out, shader, target_node, kind):
    nt = mat.node_tree
    for l in list(out.inputs['Surface'].links): nt.links.remove(l)
    nt.links.new(shader.outputs[0], out.inputs['Surface'])
    for n in nt.nodes: n.select = False
    target_node.select = True; nt.nodes.active = target_node
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type=kind, margin=12, use_clear=True)

def final_material(mat, img_color, img_normal):
    nt = mat.node_tree; N = nt.nodes; L = nt.links
    for n in list(N): N.remove(n)
    out = N.new('ShaderNodeOutputMaterial'); b = N.new('ShaderNodeBsdfPrincipled')
    tc = N.new('ShaderNodeTexImage'); tc.image = img_color
    tn = N.new('ShaderNodeTexImage'); tn.image = img_normal; tn.image.colorspace_settings.name = 'Non-Color'
    nm = N.new('ShaderNodeNormalMap')
    L.new(tc.outputs['Color'], b.inputs['Base Color']); L.new(tn.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.68; b.inputs['Metallic'].default_value = 0.0
    L.new(b.outputs[0], out.inputs['Surface'])

def set_white(me, name='Col'):
    ca = me.color_attributes.new(name, 'FLOAT_COLOR', 'CORNER')
    n = len(me.loops)
    ca.data.foreach_set('color', np.ones(n * 4, dtype=np.float32))

def lerp3(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def rigid_color(kind, t):
    if kind == 'horn': return lerp3((0.80, 0.72, 0.52), (0.08, 0.06, 0.05), sstep(0.45, 1.0, t))
    if kind == 'plate': return lerp3((0.20, 0.07, 0.05), (0.03, 0.02, 0.02), sstep(0.2, 1.0, t))
    if kind == 'tooth': return lerp3((0.78, 0.70, 0.52), (0.95, 0.93, 0.86), sstep(0.0, 0.6, t))
    return lerp3((0.14, 0.11, 0.10), (0.03, 0.03, 0.03), sstep(0.2, 1.0, t))

def compute_weights(ob, parts, skip_group=None):
    """骨の重み：各立体（先細りカプセル）までの「半径で割った距離」が小さい骨ほど強く効く"""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64); me.vertices.foreach_get('co', co); co = co.reshape(n, 3)
    P = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)       # three.js 座標
    bones = sorted({b for (b, *_r) in parts})
    best = {b: np.full(n, 1e9) for b in bones}
    for (b, p1, r1, p2, r2) in parts:
        p1 = np.array(p1, float); p2 = np.array(p2, float); d = p2 - p1; l2 = float(d @ d)
        t = np.zeros(n) if l2 < 1e-9 else np.clip(((P - p1) @ d) / l2, 0, 1)
        c = p1 + np.outer(t, d)
        rr = np.mean(r1) + (np.mean(r2) - np.mean(r1)) * t
        nd = np.linalg.norm(P - c, axis=1) / rr
        best[b] = np.minimum(best[b], nd)
    W = np.stack([1.0 / np.maximum(best[b], 0.3) ** 7 for b in bones], axis=1)
    # 上位4本に絞って正規化
    idx = np.argsort(-W, axis=1)[:, :4]
    top = np.take_along_axis(W, idx, axis=1)
    top /= top.sum(axis=1, keepdims=True)
    groups = {b: ob.vertex_groups.new(name=b) if b not in ob.vertex_groups else ob.vertex_groups[b] for b in bones}
    skip = set()
    if skip_group and skip_group in ob.vertex_groups:
        gi = ob.vertex_groups[skip_group].index
        skip = {v.index for v in me.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}
    for vi in range(n):
        if vi in skip: continue
        for k in range(4):
            w = float(top[vi, k])
            if w > 0.01: groups[bones[idx[vi, k]]].add([vi], w, 'REPLACE')


if MODE == 'full':
    clear_scene()
    sc = bpy.context.scene
    # ---- 形 ----
    body = build_union(BODY, 'body', 0.1)
    smooth(body, 0.7, 14)
    jaw = build_union(JAW, 'jawmesh', 0.06)
    smooth(jaw, 0.6, 8)
    jg = jaw.vertex_groups.new(name='jaw'); jg.add(list(range(len(jaw.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    jaw.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    skin = body; skin.name = 'Zarva'
    shade_smooth(skin)
    print('TRIS skin', sum(len(p.vertices) - 2 for p in skin.data.polygons))
    # ---- UV ----
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    # ---- 焼き込み ----
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices: d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e: print('gpu', e)
    sc.cycles.samples = 12
    img_c = bpy.data.images.new('zarva_color', TEX, TEX, alpha=False)
    img_n = bpy.data.images.new('zarva_normal', 1024, 1024, alpha=False); img_n.colorspace_settings.name = 'Non-Color'
    mat, out, emit, bsdf, tc, tn = skin_material(img_c, img_n)
    skin.data.materials.append(mat)
    bake(skin, mat, out, emit, tc, 'EMIT'); print('baked color')
    sc.cycles.samples = 4
    bake(skin, mat, out, bsdf, tn, 'NORMAL'); print('baked normal')
    img_c.filepath_raw = os.path.join(OUT, 'zarva_color.png'); img_c.file_format = 'PNG'; img_c.save()
    img_n.filepath_raw = os.path.join(OUT, 'zarva_normal.png'); img_n.file_format = 'PNG'; img_n.save()
    final_material(mat, img_c, img_n)
    set_white(skin.data)
    # ---- 骨の重み（体）----
    compute_weights(skin, BODY, skip_group='jaw')
    # ---- 硬い部品 ----
    build_rigid()
    for me in build_pupils(): RIGID.append((me, 'head', 'claw'))
    parts_mat = bpy.data.materials.new('parts'); parts_mat.use_nodes = True
    pn = parts_mat.node_tree.nodes; pb = pn['Principled BSDF']; pb.inputs['Roughness'].default_value = 0.42
    vc = pn.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    parts_mat.node_tree.links.new(vc.outputs['Color'], pb.inputs['Base Color'])
    eye_mat = simple_mat('eye', (1.0, 0.78, 0.2), 0.25, emit=(1.0, 0.62, 0.08))
    rig_objs = []
    for me, bone, kind in RIGID:
        ob = bpy.data.objects.new(me.name, me); sc.collection.objects.link(ob)
        me.materials.append(parts_mat)
        tv = list(me['tvals'])
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        cols = np.empty(len(me.loops) * 4, dtype=np.float32)
        for li, lp in enumerate(me.loops):
            c = rigid_color(kind, tv[lp.vertex_index]); cols[li * 4:li * 4 + 4] = (c[0], c[1], c[2], 1.0)
        ca.data.foreach_set('color', cols)
        g = ob.vertex_groups.new(name=bone); g.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
        shade_smooth(ob); rig_objs.append(ob)
    for me in build_eyes():
        ob = bpy.data.objects.new('eye', me); sc.collection.objects.link(ob)
        me.materials.append(eye_mat); set_white(me)
        g = ob.vertex_groups.new(name='head'); g.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
        shade_smooth(ob); rig_objs.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in rig_objs: ob.select_set(True)
    skin.select_set(True); bpy.context.view_layer.objects.active = skin
    bpy.ops.object.join()
    print('TRIS total', sum(len(p.vertices) - 2 for p in skin.data.polygons), 'materials', [m.name for m in skin.data.materials])
    # ---- 切れた尻尾（別の物体）----
    bpy.ops.object.select_all(action='DESELECT'); skin.select_set(True); bpy.context.view_layer.objects.active = skin
    bpy.ops.object.duplicate()
    tailp = bpy.context.view_layer.objects.active; tailp.name = 'TailPiece'
    tailp.vertex_groups.clear()
    bm = bmesh.new(); bm.from_mesh(tailp.data)
    CUT = 4.15   # three の z = -4.15 より後ろ（Blender では y > 4.15）
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vector((0, CUT, 0)), plane_no=Vector((0, -1, 0)), clear_outer=True)
    edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if edges: bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    for v in bm.verts: v.co -= Vector((0, CUT, 3.1))     # 切り口を原点に
    bm.to_mesh(tailp.data); bm.free()
    # ---- 骨（向きをそろえた短い棒）----
    arm = bpy.data.armatures.new('Rig'); ao = bpy.data.objects.new('Rig', arm); sc.collection.objects.link(ao)
    bpy.ops.object.select_all(action='DESELECT'); ao.select_set(True); bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (parent, pos) in JOINTS.items():
        eb = arm.edit_bones.new(name); eb.head = B(pos); eb.tail = B(pos) + Vector((0, 0, 0.2)); eb.roll = 0
    for name, (parent, pos) in JOINTS.items():
        if parent: arm.edit_bones[name].parent = arm.edit_bones[parent]; arm.edit_bones[name].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    print('BONE MATRIX pelvis', [tuple(round(x, 3) for x in row) for row in arm.bones['pelvis'].matrix_local.to_3x3()])
    skin.parent = ao
    md = skin.modifiers.new('Armature', 'ARMATURE'); md.object = ao
    # ---- 書き出し ----
    for ob in (skin, tailp):
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(ob.data); bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    for ob in (ao, skin, tailp): ob.select_set(True)
    bpy.context.view_layer.objects.active = ao
    path = os.path.join(OUT, 'zarva.glb')
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_skins=True, export_animations=False, export_yup=True,
              export_image_format='JPEG', export_tangents=False, export_materials='EXPORT')
    for extra in ({'export_image_quality': 80, 'export_vertex_color': 'ACTIVE', 'export_all_vertex_colors': False, 'export_active_vertex_color_when_no_material': True},
                  {'export_image_quality': 80, 'export_vertex_color': 'ACTIVE'}, {'export_jpeg_quality': 88, 'export_colors': True}, {}):
        try:
            bpy.ops.export_scene.gltf(**kw, **extra); print('EXPORT OK with', list(extra)); break
        except TypeError as e:
            print('export retry:', str(e)[:120])
    print('GLB', os.path.getsize(path) // 1024, 'KB')
    # ---- 確認用の画像（焼き込んだ質感つき）----
    tailp.hide_render = True; ao.hide_render = True
    cam = setup_preview()
    shoot(cam, 'full_side.jpg', (17, 4.2, 0.5), (0, 2.8, 0.2))
    shoot(cam, 'full_front34.jpg', (8.5, 4.6, 14.5), (0, 3.3, 2.4))
    shoot(cam, 'full_head.jpg', (3.4, 5.0, 10.0), (0, 4.6, 6.5))
    print('DONE full')
