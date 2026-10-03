# ハンター（主人公）を Blender でつくる
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/hunter_build.py -- <outdir>
# 体は「断面の積み重ね」で輪郭を決め、鎧は「厚みのある板」として重ねる（丸い塊を溶かす方法だと鎧が風船になるため）。
# 骨格はゲーム（js/hunter.js）と同じ表を使うので、動きはそのまま乗る。
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/hunter'
os.makedirs(OUT, exist_ok=True)

JOINTS = {
    'pivot': (None, (0, 0.95, 0)), 'hips': ('pivot', (0, 0.95, 0)), 'spine': ('hips', (0, 1.07, 0)), 'chest': ('spine', (0, 1.29, 0)),
    'neck': ('chest', (0, 1.57, 0)), 'head': ('neck', (0, 1.65, 0)), 'back': ('chest', (0, 1.29, -0.19)),
    'uArmR': ('chest', (-0.2, 1.49, 0)), 'fArmR': ('uArmR', (-0.2, 1.17, 0)), 'handR': ('fArmR', (-0.2, 0.87, 0)),
    'uArmL': ('chest', (0.2, 1.49, 0)), 'fArmL': ('uArmL', (0.2, 1.17, 0)), 'handL': ('fArmL', (0.2, 0.87, 0)),
    'thighR': ('hips', (-0.1, 0.93, 0)), 'shinR': ('thighR', (-0.1, 0.49, 0)), 'footR': ('shinR', (-0.1, 0.05, 0)),
    'thighL': ('hips', (0.1, 0.93, 0)), 'shinL': ('thighL', (0.1, 0.49, 0)), 'footL': ('shinL', (0.1, 0.05, 0)),
}
# 体（布）の重みづけに使う、骨ごとのだいたいの太さ
VOL = [('hips', (0, 0.9, 0), 0.16, (0, 0.98, 0), 0.16), ('spine', (0, 1.05, 0), 0.14, (0, 1.2, 0), 0.15),
       ('chest', (0, 1.28, 0), 0.17, (0, 1.47, 0), 0.17), ('neck', (0, 1.54, 0), 0.06, (0, 1.63, 0), 0.05)]
for s, S in ((1, 'L'), (-1, 'R')):
    VOL += [('uArm' + S, (s * 0.2, 1.49, 0), 0.06, (s * 0.2, 1.2, 0), 0.05), ('fArm' + S, (s * 0.2, 1.15, 0), 0.047, (s * 0.2, 0.92, 0), 0.035),
            ('thigh' + S, (s * 0.1, 0.93, 0), 0.09, (s * 0.1, 0.53, 0), 0.065), ('shin' + S, (s * 0.1, 0.46, 0), 0.06, (s * 0.1, 0.1, 0), 0.04)]


def materials():
    out = {}
    nb = NB('cloth')      # 上は青い刺し子、下はこげ茶
    quilt = nb.voronoi(30, 'DISTANCE_TO_EDGE', randomness=0.0)
    seam = nb.maprange(quilt.outputs['Distance'], 0.0, 0.05)
    weave = nb.noise(300, 2, 0.6)
    top = nb.mix(nb.noise(6, 2), nb.rgb((0.035, 0.08, 0.19)), nb.rgb((0.06, 0.13, 0.28)))
    pants = nb.mix(nb.noise(8, 2), nb.rgb((0.085, 0.066, 0.052)), nb.rgb((0.15, 0.115, 0.085)))
    col = nb.mix(nb.maprange(nb.xyz.outputs['Z'], 0.99, 0.93), top, pants)
    upper = nb.maprange(nb.xyz.outputs['Z'], 0.93, 0.99)
    seam = nb.math('ADD', nb.math('MULTIPLY', seam, upper), nb.math('SUBTRACT', 1.0, upper))
    shade = nb.math('MULTIPLY', nb.maprange(seam, 0, 1, 0.78, 1.0, False), nb.maprange(weave, 0, 1, 0.9, 1.07, False))
    col = nb.mix(1.0, col, nb.combine(shade, shade, shade), 'MULTIPLY')
    h = nb.math('ADD', nb.math('MULTIPLY', seam, 0.7), nb.math('MULTIPLY', weave, 0.3))
    out['cloth'] = (nb, nb.finish(col, h, 0.9, 0.0, 0.6, 0.004, ao=nb.maprange(nb.ao(0.12), 0, 1, 0.3, 1.0, False)))
    nb = NB('tabard')     # 前垂れ：青い布に金のふち
    weave = nb.noise(300, 2, 0.6)
    edge = nb.math('MAXIMUM', nb.maprange(nb.math('ABSOLUTE', nb.xyz.outputs['X']), 0.068, 0.078), nb.maprange(nb.xyz.outputs['Z'], 0.69, 0.675))
    col = nb.mix(edge, nb.mix(nb.noise(5, 2), nb.rgb((0.03, 0.07, 0.17)), nb.rgb((0.055, 0.12, 0.26))), nb.rgb((0.62, 0.45, 0.14)))
    col = nb.mix(1.0, col, nb.combine(*(nb.maprange(weave, 0, 1, 0.88, 1.06, False),) * 3), 'MULTIPLY')
    out['tabard'] = (nb, nb.finish(col, weave, 0.88, 0.0, 0.4, 0.003, ao=nb.maprange(nb.ao(0.1), 0, 1, 0.45, 1.0, False)))
    nb = NB('leather')
    crack = nb.voronoi(150, 'DISTANCE_TO_EDGE')
    grain = nb.maprange(crack.outputs['Distance'], 0.0, 0.1)
    col = nb.mix(nb.noise(18, 3), nb.rgb((0.085, 0.045, 0.025)), nb.rgb((0.19, 0.10, 0.055)))
    col = nb.mix(1.0, col, nb.combine(*(nb.maprange(grain, 0, 1, 0.72, 1.0, False),) * 3), 'MULTIPLY')
    out['leather'] = (nb, nb.finish(col, grain, nb.maprange(nb.noise(30, 2), 0, 1, 0.5, 0.72, False), 0.0, 0.45, 0.002, ao=nb.maprange(nb.ao(0.08), 0, 1, 0.3, 1.0, False)))
    nb = NB('metal')      # 鉄：ふちは使い込んで明るく、くぼみは暗く
    scratch = nb.noise(110, 4, 0.7)
    dent = nb.noise(16, 2, 0.5)
    base = nb.mix(dent, nb.rgb((0.30, 0.32, 0.36)), nb.rgb((0.50, 0.52, 0.56)))
    wear = nb.maprange(nb.geo.outputs['Pointiness'], 0.53, 0.66)
    col = nb.mix(nb.math('MULTIPLY', wear, 0.75), base, nb.rgb((0.78, 0.79, 0.81)))
    aov = nb.ao(0.09)
    rough = nb.math('ADD', nb.maprange(scratch, 0, 1, 0.24, 0.5, False), nb.maprange(aov, 0.0, 0.5, 0.4, 0.0, False))
    h = nb.math('ADD', nb.math('MULTIPLY', scratch, 0.2), nb.math('MULTIPLY', dent, 0.5))
    out['metal'] = (nb, nb.finish(col, h, rough, nb.maprange(aov, 0.05, 0.35), 0.3, 0.002, ao=nb.maprange(aov, 0, 1, 0.06, 1.0, False)))
    nb = NB('gold')
    col = nb.mix(nb.noise(40, 2), nb.rgb((0.60, 0.40, 0.10)), nb.rgb((0.85, 0.63, 0.21)))
    out['gold'] = (nb, nb.finish(col, nb.noise(140, 3), nb.maprange(nb.noise(60, 2), 0, 1, 0.22, 0.4, False), 1.0, 0.2, 0.002, ao=nb.maprange(nb.ao(0.05), 0, 1, 0.4, 1.0, False)))
    nb = NB('void')       # かぶとの中の暗がり
    out['void'] = (nb, nb.finish(nb.rgb((0.012, 0.012, 0.015)), None, 0.95, 0.0))
    nb = NB('plume')
    strand = nb.wave(260, 'X', 2.5, 1)
    col = nb.mix(strand, nb.rgb((0.28, 0.022, 0.018)), nb.rgb((0.6, 0.065, 0.045)))
    out['plume'] = (nb, nb.finish(col, strand, 0.85, 0.0, 0.6, 0.004))
    return out


clear_scene()
cycles_gpu(12)
M = materials()
parts = []

def add(ob, mat, bone=None, power=7):
    ob.data.materials.append(M[mat][1])
    if bone: rigid(ob, bone)
    else: compute_weights(ob, VOL, power)
    parts.append(ob)
    return ob

# ---- 体（布）----
add(solid(loft([(0, 0.88, 0, 0.15, 0.1), (0, 0.95, 0, 0.165, 0.108), (0, 1.06, 0, 0.14, 0.092), (0, 1.2, 0.005, 0.155, 0.1), (0, 1.36, 0.01, 0.18, 0.112),
                (0, 1.46, 0, 0.17, 0.09), (0, 1.52, 0, 0.07, 0.065), (0, 1.64, 0.01, 0.048, 0.05)], 16, 'torso', power=2.3)), 'cloth')
for s, S in ((1, 'L'), (-1, 'R')):
    add(solid(loft([(s * 0.2, 1.5, 0, 0.058, 0.06), (s * 0.205, 1.38, 0, 0.052, 0.057), (s * 0.2, 1.2, 0, 0.043, 0.046), (s * 0.2, 1.14, 0, 0.045, 0.047),
                    (s * 0.2, 1.02, 0, 0.04, 0.042), (s * 0.2, 0.9, 0, 0.031, 0.034)], 14, 'arm' + S)), 'cloth')
    add(solid(loft([(s * 0.1, 0.95, 0, 0.083, 0.095), (s * 0.1, 0.78, 0, 0.078, 0.088), (s * 0.1, 0.58, 0, 0.062, 0.068), (s * 0.1, 0.49, 0.005, 0.055, 0.06),
                    (s * 0.1, 0.38, -0.012, 0.056, 0.064), (s * 0.1, 0.22, 0, 0.043, 0.048), (s * 0.1, 0.1, 0, 0.038, 0.042)], 14, 'leg' + S)), 'cloth')
# 前垂れ・後ろ垂れ
add(solid(box((0, 0.84, 0.118), (0.17, 0.36, 0.014), 'tabardF'), 2, 0.004), 'tabard', 'hips')
add(solid(box((0, 0.83, -0.112), (0.2, 0.4, 0.014), 'tabardB'), 2, 0.004), 'tabard', 'hips')
for o in parts[-2:]: apply_transform(o)

# ---- 革 ----
add(plate(loft([(0, 1.035, 0.005, 0.172, 0.127), (0, 1.085, 0.005, 0.166, 0.122)], 20, 'belt', (False, False), 2.3), 0.012, 1), 'leather', 'hips')
for (c, sz) in (((0.135, 0.975, -0.085), (0.07, 0.08, 0.045)), ((-0.15, 0.975, 0.03), (0.05, 0.07, 0.06))):
    o = solid(box(c, sz, 'pouch'), 2, 0.008); apply_transform(o); add(o, 'leather', 'hips')
for s, S in ((1, 'L'), (-1, 'R')):
    add(solid(loft([(s * 0.2, 0.915, 0, 0.037, 0.04), (s * 0.2, 0.87, 0.004, 0.031, 0.044), (s * 0.2, 0.81, 0.01, 0.027, 0.043), (s * 0.2, 0.768, 0.012, 0.017, 0.03)], 12, 'glove' + S, power=2.6)), 'leather', 'hand' + S)
    add(solid(loft([(s * 0.1, 0.24, 0, 0.05, 0.054), (s * 0.1, 0.12, 0, 0.044, 0.048), (s * 0.1, 0.06, 0, 0.045, 0.05)], 12, 'bootTop' + S)), 'leather', 'shin' + S)
    add(solid(loft([(s * 0.1, 0.046, -0.062, 0.038, 0.038), (s * 0.1, 0.05, 0.0, 0.047, 0.048), (s * 0.1, 0.043, 0.08, 0.05, 0.041), (s * 0.1, 0.034, 0.15, 0.045, 0.032),
                    (s * 0.1, 0.027, 0.188, 0.03, 0.022)], 12, 'boot' + S, power=2.5, axis='z')), 'leather', 'foot' + S)

# ---- 鉄の鎧（厚みのある板）----
add(plate(loft([(0, 1.1, 0.005, 0.152, 0.108), (0, 1.2, 0.008, 0.166, 0.118), (0, 1.36, 0.014, 0.196, 0.138), (0, 1.46, 0.006, 0.186, 0.112), (0, 1.515, 0.004, 0.1, 0.085)],
               20, 'cuirass', (False, False), 2.5), 0.01, 1), 'metal', 'chest')
add(plate(loft([(0, 1.5, 0.004, 0.105, 0.09), (0, 1.56, 0.006, 0.07, 0.068)], 16, 'gorget', (False, False)), 0.008, 1), 'metal', 'chest')
helm = loft([(0, 1.6, 0.012, 0.1, 0.118), (0, 1.66, 0.012, 0.116, 0.132), (0, 1.725, 0.012, 0.121, 0.137), (0, 1.757, 0.012, 0.121, 0.137), (0, 1.82, 0.008, 0.108, 0.124),
             (0, 1.87, 0.004, 0.07, 0.085), (0, 1.895, 0.0, 0.025, 0.03)], 32, 'helm', (False, True), 2.2)
# 目のすき間（横）と、鼻から口のすき間（縦）＝T字に開ける
delete_faces(helm, lambda x, y, z: z > 0.05 and ((1.725 < y < 1.757 and abs(x) < 0.088) or (1.6 < y < 1.725 and abs(x) < 0.03)))
add(plate(helm, 0.012, 1), 'metal', 'head')
vo = bpy.data.objects.new('void', None)
void = ico((0, 1.71, 0.01), (0.098, 0.115, 0.112), 2)
vme = bpy.data.meshes.new('void'); void.to_mesh(vme); void.free()
vob = bpy.data.objects.new('void', vme); bpy.context.scene.collection.objects.link(vob); shade_smooth(vob)
add(vob, 'void', 'head')
add(plate(loft([(0, 1.625, 0.0, 0.108, 0.122), (0, 1.555, -0.008, 0.128, 0.134)], 20, 'aventail', (False, False)), 0.007, 1), 'metal', 'head')
for s, S in ((1, 'L'), (-1, 'R')):
    add(plate(dome((s * 0.235, 1.485, 0), (0.1, 0.085, 0.105), -0.15, 'pauldron' + S, 3, (s * 0.6, 0.8, 0)), 0.009, 1), 'metal', 'uArm' + S)
    add(plate(dome((s * 0.252, 1.425, 0), (0.082, 0.07, 0.09), 0.0, 'lame' + S, 3, (s, 0.3, 0)), 0.008, 1), 'metal', 'uArm' + S)
    add(plate(loft([(s * 0.2, 1.13, 0, 0.058, 0.06), (s * 0.2, 1.05, 0, 0.052, 0.054), (s * 0.2, 0.94, 0, 0.042, 0.045)], 14, 'vambrace' + S, (False, False)), 0.007, 1), 'metal', 'fArm' + S)
    add(plate(dome((s * 0.2, 1.165, -0.03), (0.055, 0.06, 0.05), -0.1, 'elbow' + S, 2, (0, 0, -1)), 0.007, 1), 'metal', 'fArm' + S)
    add(plate(dome((s * 0.155, 0.93, 0.0), (0.075, 0.125, 0.115), 0.1, 'tasset' + S, 3, (s, 0.15, 0)), 0.008, 1), 'metal', 'hips')
    add(plate(loft([(s * 0.1, 0.46, 0.004, 0.066, 0.07), (s * 0.1, 0.36, -0.004, 0.064, 0.072), (s * 0.1, 0.25, 0.002, 0.052, 0.057), (s * 0.1, 0.2, 0.002, 0.05, 0.054)],
                   14, 'greave' + S, (False, False)), 0.007, 1), 'metal', 'shin' + S)
    add(plate(dome((s * 0.1, 0.5, 0.03), (0.06, 0.07, 0.06), -0.2, 'knee' + S, 2, (0, 0, 1)), 0.007, 1), 'metal', 'shin' + S)
    add(plate(dome((s * 0.1, 0.035, 0.14), (0.05, 0.04, 0.062), -0.2, 'toe' + S, 2, (0, 0.5, 1)), 0.006, 1), 'metal', 'foot' + S)

# ---- 金のかざり・羽根 ----
add(solid(loft([(0, 1.885, 0.1, 0.006, 0.012), (0, 1.905, 0.04, 0.009, 0.03), (0, 1.912, -0.04, 0.009, 0.036), (0, 1.885, -0.12, 0.006, 0.02)], 10, 'crest', axis='z'), 1), 'gold', 'head')
add(plate(dome((0, 1.38, 0.146), (0.045, 0.045, 0.02), 0.2, 'emblem', 2, (0, 0, 1)), 0.004, 1), 'gold', 'chest')
o = solid(box((0, 1.06, 0.134), (0.05, 0.04, 0.012), 'buckle'), 1, 0.004); apply_transform(o); add(o, 'gold', 'hips')
pl = bpy.data.objects.new('plume', tube([(0, 1.92, -0.05), (0, 1.93, -0.14), (0, 1.86, -0.24), (0, 1.72, -0.3), (0, 1.6, -0.3)], [0.03, 0.04, 0.038, 0.028, 0.012], 10, 'plume'))
bpy.context.scene.collection.objects.link(pl); shade_smooth(pl)
add(pl, 'plume', 'head')

hunter = join(parts, 'Hunter')
print('TRIS hunter', tris(hunter))
uv_unwrap(hunter, 0.004)
imgs = new_images('hunter', 2048, small=1024)
bake_all(hunter, [M[k][0] for k in M], imgs)
save_images(imgs, OUT)
single_material(hunter, 'hunter', imgs)
rig = make_armature(JOINTS)
bind(hunter, rig)
triangulate(hunter)
export_glb(os.path.join(OUT, 'hunter.glb'), [rig, hunter], quality=80, tangents=False)
rig.hide_render = True
cam = setup_preview(0.0, lens=50)
shoot(cam, os.path.join(OUT, 'hunter_front.jpg'), (1.6, 1.25, 3.3), (0, 0.98, 0))
shoot(cam, os.path.join(OUT, 'hunter_back.jpg'), (-1.5, 1.3, -3.2), (0, 0.98, 0))
shoot(cam, os.path.join(OUT, 'hunter_face.jpg'), (0.55, 1.68, 1.0), (0, 1.6, 0))
print('DONE hunter')
