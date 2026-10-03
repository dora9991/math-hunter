# Blender スクリプト共通の部品（形づくり・焼き込み・骨・書き出し・確認画像）
# 使う側： import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from lib import *
import bpy, bmesh, os, math
import numpy as np
from mathutils import Vector


def B(p):
    """three.js の座標（x:左, y:上, z:前）→ Blender（x, -z, y）"""
    return Vector((p[0], -p[2], p[1]))


def R(r):
    return (r, r, r) if isinstance(r, (int, float)) else r


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def ico(center, radius3, sub=3):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    c = B(center)
    radius3 = R(radius3)
    sx, sy, sz = radius3[0], radius3[2], radius3[1]
    for v in bm.verts:
        v.co = Vector((v.co.x * sx + c.x, v.co.y * sy + c.y, v.co.z * sz + c.z))
    return bm


def hull_part(p1, r1, p2, r2, sub=3):
    """2つの楕円球の凸包＝先細りのカプセル"""
    bm = ico(p1, r1, sub)
    if tuple(p1) != tuple(p2):
        bm2 = ico(p2, r2, sub)
        tmp = bpy.data.meshes.new('tmp'); bm2.to_mesh(tmp); bm2.free()
        bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
        res = bmesh.ops.convex_hull(bm, input=bm.verts)
        junk = [e for e in res.get('geom_interior', []) + res.get('geom_unused', []) if isinstance(e, bmesh.types.BMVert)]
        if junk:
            bmesh.ops.delete(bm, geom=junk, context='VERTS')
    return bm


def build_union(parts, name, voxel, sub=3):
    """(骨, 始点, 半径, 終点, 半径) の立体を全部つないで、ボクセルで1つに溶かす"""
    bm_all = bmesh.new()
    for (_b, p1, r1, p2, r2) in parts:
        bm = hull_part(p1, R(r1), p2, R(r2), sub)
        tmp = bpy.data.meshes.new('tmp'); bm.to_mesh(tmp); bm.free()
        bm_all.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    me = bpy.data.meshes.new(name)
    bm_all.to_mesh(me); bm_all.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT')
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


def displace(ob, strength, scale, kind='CLOUDS', depth=2):
    """表面をでこぼこにする（岩・葉のかたまり用）"""
    tex = bpy.data.textures.new('disp', kind)
    tex.noise_scale = scale
    if hasattr(tex, 'noise_depth'): tex.noise_depth = depth
    m = ob.modifiers.new('disp', 'DISPLACE'); m.texture = tex; m.strength = strength; m.texture_coords = 'GLOBAL'; m.mid_level = 0.5
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)


def shade_smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def tube(points, radii, sides=10, name='tube', flat=1.0):
    """折れ線にそった先細りの筒（角・爪・枝など）。tvals＝根元0〜先1"""
    bm = bmesh.new()
    rings = []
    pts = [B(p) for p in points]
    for i, c in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        a = d.cross(up).normalized(); b = d.cross(a).normalized()
        ring = [bm.verts.new(c + (a * math.cos(k / sides * math.tau) * flat + b * math.sin(k / sides * math.tau)) * radii[i]) for k in range(sides)]
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


def set_color(me, rgb=(1, 1, 1), name='Col'):
    """頂点カラー（全体を1色に）"""
    ca = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'CORNER')
    n = len(me.loops)
    arr = np.tile(np.array([rgb[0], rgb[1], rgb[2], 1.0], dtype=np.float32), n)
    ca.data.foreach_set('color', arr)


def uv_unwrap(ob, margin=0.003, angle=66):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


def cycles_gpu(samples=12):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices: d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e:
        print('gpu', e)
    sc.cycles.samples = samples


# ---------- ノードを書きやすくする小物 ----------
class NB:
    """マテリアルのノードを短く書くための道具"""
    def __init__(self, name):
        self.mat = bpy.data.materials.new(name); self.mat.use_nodes = True
        self.nt = self.mat.node_tree; self.N = self.nt.nodes; self.L = self.nt.links
        for n in list(self.N): self.N.remove(n)
        self.out = self.N.new('ShaderNodeOutputMaterial')
        self.geo = self.N.new('ShaderNodeNewGeometry')
        self.pos = self.geo.outputs['Position']
        self.nrm = self.N.new('ShaderNodeSeparateXYZ'); self.L.new(self.geo.outputs['Normal'], self.nrm.inputs[0])
        self.xyz = self.N.new('ShaderNodeSeparateXYZ'); self.L.new(self.pos, self.xyz.inputs[0])

    def _in(self, sock, v):
        if isinstance(v, (int, float)): sock.default_value = v
        elif isinstance(v, tuple): sock.default_value = (*v, 1) if len(v) == 3 else v
        else: self.L.new(v, sock)

    def rgb(self, c):
        n = self.N.new('ShaderNodeRGB'); n.outputs[0].default_value = (*c, 1); return n.outputs[0]

    def maprange(self, x, a, b, c=0.0, d=1.0, smooth=True):
        n = self.N.new('ShaderNodeMapRange'); n.interpolation_type = 'SMOOTHSTEP' if smooth else 'LINEAR'
        self._in(n.inputs[0], x); n.inputs[1].default_value = a; n.inputs[2].default_value = b; n.inputs[3].default_value = c; n.inputs[4].default_value = d
        return n.outputs[0]

    def mix(self, fac, a, b, blend='MIX'):
        n = self.N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
        self._in(n.inputs[0], fac); self._in(n.inputs[6], a); self._in(n.inputs[7], b)
        return n.outputs[2]

    def math(self, op, a, b=None):
        n = self.N.new('ShaderNodeMath'); n.operation = op
        self._in(n.inputs[0], a)
        if b is not None: self._in(n.inputs[1], b)
        return n.outputs[0]

    def noise(self, scale, detail=2, rough=0.5, vec=None, dims='3D', w=None):
        n = self.N.new('ShaderNodeTexNoise'); n.noise_dimensions = dims
        n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        self.L.new(vec or self.pos, n.inputs['Vector'])
        if w is not None: self._in(n.inputs['W'], w)
        return n.outputs['Fac']

    def voronoi(self, scale, feature='DISTANCE_TO_EDGE', vec=None, randomness=1.0):
        n = self.N.new('ShaderNodeTexVoronoi'); n.feature = feature
        n.inputs['Scale'].default_value = scale; n.inputs['Randomness'].default_value = randomness
        self.L.new(vec or self.pos, n.inputs['Vector'])
        return n

    def wave(self, scale, direction='Y', distortion=0.0, detail=2, vec=None, kind='BANDS'):
        n = self.N.new('ShaderNodeTexWave'); n.wave_type = kind
        if kind == 'BANDS': n.bands_direction = direction
        n.inputs['Scale'].default_value = scale; n.inputs['Distortion'].default_value = distortion; n.inputs['Detail'].default_value = detail
        self.L.new(vec or self.pos, n.inputs['Vector'])
        return n.outputs['Fac']

    def ao(self, distance=0.3, samples=12):
        n = self.N.new('ShaderNodeAmbientOcclusion'); n.inputs['Distance'].default_value = distance; n.samples = samples
        return n.outputs['AO']

    def combine(self, r, g, b):
        n = self.N.new('ShaderNodeCombineColor')
        self._in(n.inputs[0], r); self._in(n.inputs[1], g); self._in(n.inputs[2], b)
        return n.outputs[0]

    def finish(self, color, height, rough, metal, bump_strength=0.6, bump_dist=0.01, ao=None):
        """色・凹凸・粗さ・金属の4つを決める。焼き込み用の3つのシェーダーを用意する"""
        if ao is not None:
            color = self.mix(1.0, color, self.combine(ao, ao, ao), 'MULTIPLY')
        self.emit_color = self.N.new('ShaderNodeEmission'); self._in(self.emit_color.inputs['Color'], color)
        self.emit_orm = self.N.new('ShaderNodeEmission'); self._in(self.emit_orm.inputs['Color'], self.combine(1.0, rough, metal))
        self.bsdf = self.N.new('ShaderNodeBsdfPrincipled')
        if height is not None:
            bump = self.N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = bump_strength; bump.inputs['Distance'].default_value = bump_dist
            self._in(bump.inputs['Height'], height)
            self.L.new(bump.outputs['Normal'], self.bsdf.inputs['Normal'])
        return self.mat


def bake_all(ob, builders, images, samples_color=12):
    """ob の全マテリアル（NB で作ったもの）を images=(color, normal, orm) に焼き込む"""
    sc = bpy.context.scene
    for nb in builders:
        nb.t = []
        for img in images:
            t = nb.N.new('ShaderNodeTexImage'); t.image = img; nb.t.append(t)
    def run(kind, which, idx, samples):
        sc.cycles.samples = samples
        for nb in builders:
            for l in list(nb.out.inputs['Surface'].links): nb.nt.links.remove(l)
            src = {'color': nb.emit_color, 'orm': nb.emit_orm, 'bsdf': nb.bsdf}[which]
            nb.L.new(src.outputs[0], nb.out.inputs['Surface'])
            for n in nb.N: n.select = False
            nb.t[idx].select = True; nb.N.active = nb.t[idx]
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type=kind, margin=10, use_clear=True)
    run('EMIT', 'color', 0, samples_color)
    run('NORMAL', 'bsdf', 1, 4)
    run('EMIT', 'orm', 2, 2)


def single_material(ob, name, images, rough=None, metal=None):
    """焼き込んだ画像だけを使う仕上げのマテリアルに置き換える（glTF で書き出せる形）"""
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links
    b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexImage'); tc.image = images[0]
    tn = N.new('ShaderNodeTexImage'); tn.image = images[1]; tn.image.colorspace_settings.name = 'Non-Color'
    nm = N.new('ShaderNodeNormalMap')
    L.new(tc.outputs['Color'], b.inputs['Base Color']); L.new(tn.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], b.inputs['Normal'])
    if len(images) > 2 and images[2] is not None:
        to = N.new('ShaderNodeTexImage'); to.image = images[2]; to.image.colorspace_settings.name = 'Non-Color'
        sp = N.new('ShaderNodeSeparateColor'); L.new(to.outputs['Color'], sp.inputs[0])
        L.new(sp.outputs[1], b.inputs['Roughness']); L.new(sp.outputs[2], b.inputs['Metallic'])
    else:
        b.inputs['Roughness'].default_value = 0.7 if rough is None else rough
        b.inputs['Metallic'].default_value = 0.0 if metal is None else metal
    ob.data.materials.clear(); ob.data.materials.append(m)
    for p in ob.data.polygons: p.material_index = 0
    return m


def new_images(prefix, size, with_orm=True, small=None):
    """small を指定すると、法線と ORM はその大きさにする（容量を減らす）"""
    s2 = small or size
    c = bpy.data.images.new(prefix + '_color', size, size, alpha=False)
    n = bpy.data.images.new(prefix + '_normal', s2, s2, alpha=False); n.colorspace_settings.name = 'Non-Color'
    o = None
    if with_orm:
        o = bpy.data.images.new(prefix + '_orm', s2, s2, alpha=False); o.colorspace_settings.name = 'Non-Color'
    return [c, n, o]


def save_images(images, outdir):
    for img in images:
        if img is None: continue
        img.filepath_raw = os.path.join(outdir, img.name + '.png'); img.file_format = 'PNG'; img.save()


def compute_weights(ob, parts, power=7, only=None):
    """骨の重み：各立体までの「半径で割った距離」が小さい骨ほど強く効く。only=頂点番号の集合"""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64); me.vertices.foreach_get('co', co); co = co.reshape(n, 3)
    P = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)
    bones = sorted({b for (b, *_r) in parts})
    best = {b: np.full(n, 1e9) for b in bones}
    for (b, p1, r1, p2, r2) in parts:
        p1 = np.array(p1, float); p2 = np.array(p2, float); d = p2 - p1; l2 = float(d @ d)
        t = np.zeros(n) if l2 < 1e-9 else np.clip(((P - p1) @ d) / l2, 0, 1)
        c = p1 + np.outer(t, d)
        rr = np.mean(R(r1)) + (np.mean(R(r2)) - np.mean(R(r1))) * t
        best[b] = np.minimum(best[b], np.linalg.norm(P - c, axis=1) / rr)
    W = np.stack([1.0 / np.maximum(best[b], 0.3) ** power for b in bones], axis=1)
    k = min(4, len(bones))
    idx = np.argsort(-W, axis=1)[:, :k]
    top = np.take_along_axis(W, idx, axis=1)
    top /= top.sum(axis=1, keepdims=True)
    groups = {b: (ob.vertex_groups.get(b) or ob.vertex_groups.new(name=b)) for b in bones}
    verts = range(n) if only is None else only
    for vi in verts:
        for j in range(k):
            w = float(top[vi, j])
            if w > 0.01: groups[bones[idx[vi, j]]].add([vi], w, 'REPLACE')


def make_armature(joints, name='Rig', stub=0.05):
    """骨＝向きをそろえた短い棒。書き出すと、どの関節も回転なし・位置だけになる"""
    sc = bpy.context.scene
    arm = bpy.data.armatures.new(name); ao = bpy.data.objects.new(name, arm); sc.collection.objects.link(ao)
    bpy.ops.object.select_all(action='DESELECT'); ao.select_set(True); bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode='EDIT')
    for n, (parent, pos) in joints.items():
        eb = arm.edit_bones.new(n); eb.head = B(pos); eb.tail = B(pos) + Vector((0, 0, stub)); eb.roll = 0
    for n, (parent, pos) in joints.items():
        if parent: arm.edit_bones[n].parent = arm.edit_bones[parent]; arm.edit_bones[n].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return ao


def bind(ob, armature):
    ob.parent = armature
    md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = armature


def triangulate(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data); bm.free()


def export_glb(path, objs, skins=True, quality=88, tangents=True):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_skins=skins, export_animations=False, export_yup=True,
              export_image_format='JPEG', export_tangents=tangents, export_materials='EXPORT')
    for extra in ({'export_image_quality': quality, 'export_vertex_color': 'ACTIVE', 'export_all_vertex_colors': False, 'export_active_vertex_color_when_no_material': True},
                  {'export_image_quality': quality, 'export_vertex_color': 'ACTIVE'}, {'export_jpeg_quality': quality}, {}):
        try:
            bpy.ops.export_scene.gltf(**kw, **extra); break
        except TypeError as e:
            print('export retry:', str(e)[:100])
    print('GLB', os.path.basename(path), os.path.getsize(path) // 1024, 'KB')


# ---------- 確認用の画像 ----------
def setup_preview(ground_z=0.0, size=(720, 480), lens=40, samples=24):
    sc = bpy.context.scene
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.65, 0.78, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = 0.2
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(35))
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    me = bpy.data.meshes.new('ground'); bm.to_mesh(me); bm.free()
    g = bpy.data.objects.new('ground', me); g.location = (0, 0, ground_z); sc.collection.objects.link(g)
    gm = bpy.data.materials.new('ground'); gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.36, 0.22, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    me.materials.append(gm)
    cam = bpy.data.cameras.new('cam'); cam.lens = lens
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    sc.render.resolution_x = size[0]; sc.render.resolution_y = size[1]
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 85
    cycles_gpu(samples); sc.cycles.use_denoising = True
    return co


def shoot(cam, path, pos, look):
    cam.location = B(pos)
    d = B(look) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------- 硬い物（鎧・道具）用の形づくり ----------
def _link(me, name):
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def loft(sections, sides=16, name='loft', caps=(True, True), power=2.0, axis='y'):
    """断面を積み重ねて形を作る。sections = [(cx, cy, cz, ra, rb), ...]（three.js 座標）
    axis='y'：断面は水平（ra=左右, rb=前後）で上下に積む。axis='z'：断面は前後に並ぶ（ra=左右, rb=上下）。
    power>2 で断面が角ばる"""
    bm = bmesh.new()
    rings = []
    e = 2.0 / power
    for (cx, cy, cz, ra, rb) in sections:
        ring = []
        for k in range(sides):
            t = k / sides * math.tau
            c, s = math.cos(t), math.sin(t)
            u = math.copysign(abs(c) ** e, c) * ra
            v = math.copysign(abs(s) ** e, s) * rb
            p = (cx + u, cy, cz + v) if axis == 'y' else (cx + u, cy + v, cz)
            ring.append(bm.verts.new(B(p)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(sides):
            bm.faces.new([rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]])
    for end, ring, sec in ((0, rings[0], sections[0]), (1, rings[-1], sections[-1])):
        if not caps[end]: continue
        c = bm.verts.new(B((sec[0], sec[1], sec[2])))
        for k in range(sides):
            bm.faces.new([ring[k], ring[(k + 1) % sides], c])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return _link(me, name)


def dome(center, radius3, cut=-0.25, name='dome', sub=3, up=(0, 1, 0)):
    """楕円球を平面で切った「おわん」（肩当て・ひざ当てなど）。up＝ふくらむ向き（three.js 座標）"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    upv = B(up).normalized()
    kill = [v for v in bm.verts if v.co.dot(upv) < cut]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    c = B(center); r = R(radius3)
    sx, sy, sz = r[0], r[2], r[1]
    for v in bm.verts:
        v.co = Vector((v.co.x * sx + c.x, v.co.y * sy + c.y, v.co.z * sz + c.z))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return _link(me, name)


def box(center, size3, name='box', rot=(0, 0, 0)):
    """箱（three.js 座標の中心と大きさ。rot は Blender のオイラー角）"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    s = R(size3)
    for v in bm.verts:
        v.co = Vector((v.co.x * s[0], v.co.y * s[2], v.co.z * s[1]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = _link(me, name)
    ob.location = B(center); ob.rotation_euler = rot
    return ob


def apply_mod(ob, kind, **kw):
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in kw.items(): setattr(m, k, v)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)
    return ob


def apply_transform(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def plate(ob, thickness=0.008, subdiv=1, bevel=0.0):
    """開いた形に厚みをつけて板にする（ふちが見えるので鎧らしくなる）"""
    apply_mod(ob, 'SOLIDIFY', thickness=thickness, offset=1.0)
    if bevel > 0: apply_mod(ob, 'BEVEL', width=bevel, segments=2, limit_method='ANGLE')
    if subdiv: apply_mod(ob, 'SUBSURF', levels=subdiv)
    shade_smooth(ob)
    return ob


def solid(ob, subdiv=1, bevel=0.0):
    if bevel > 0: apply_mod(ob, 'BEVEL', width=bevel, segments=2, limit_method='ANGLE')
    if subdiv: apply_mod(ob, 'SUBSURF', levels=subdiv)
    shade_smooth(ob)
    return ob


def cut(ob, cutter):
    """ob から cutter の形をくり抜く"""
    m = ob.modifiers.new('bool', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter
    try: m.solver = 'EXACT'
    except Exception: pass
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    fix_normals(ob)
    return ob


def fix_normals(ob):
    """面の向きを外向きにそろえる（くり抜きのあとに裏返ることがある）"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    vol = bm.calc_volume(signed=True)
    if vol < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    print('NORMALS', ob.name, 'volume', round(vol, 5))
    bm.to_mesh(ob.data); bm.free()
    return ob


def rigid(ob, bone):
    """全部の頂点を1本の骨にしっかり固定する"""
    g = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
    g.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    return ob


def delete_faces(ob, pred):
    """pred(three.js 座標の面の中心 x,y,z) が真の面を消す（かぶとの目のすき間など）"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        if pred(c.x, c.z, -c.y): kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    return ob
