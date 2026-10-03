"""数学ハンターの新しい10体を、共通リグに結びつけた個別のBlenderモデルとして作る。"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ID = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'raizen'
SPEC = {
    # 基色 / 腹 / 外殻 / 発光 / 体格 / 特徴
    'raizen':  ('38404a','7b8381','242936','ffd34b',0.91,'mane'),
    'gradon':  ('776959','a99a79','514b42','d2ad76',1.25,'shell'),
    'morga':   ('286963','76a48e','1e4d49','70d8b7',0.98,'fin'),
    'frostra': ('7aadc0','c2e6e9','426f89','c9f3ff',1.06,'ice'),
    'salda':   ('a87a49','d6b27c','62442f','f2c775',0.88,'scorpion'),
    'velum':   ('536842','a3b37a','36472e','96e068',1.17,'tree'),
    'nebra':   ('624c75','ab8bb0','362a4c','b487ef',0.96,'crown'),
    'galdo':   ('566879','b5c2cc','303b4c','b4d6ff',1.02,'metalwing'),
    'barza':   ('553a34','8d6750','242627','ff7842',1.30,'magma'),
    'lunax':   ('444263','9383a8','25243c','d1bdff',0.98,'batwing'),
}
if ID not in SPEC: raise SystemExit('Unknown monster: ' + ID)
skin_h, belly_h, armor_h, light_h, bulk, kind = SPEC[ID]

def rgb(h):
    return tuple(int(h[i:i+2], 16) / 255 for i in (0,2,4))
def v(p): return Vector((p[0], -p[2], p[1]))
def mat(name, hexcolor, metal=0, rough=0.65, glow=0, double=False):
    m = bpy.data.materials.new(name)
    c = rgb(hexcolor); m.diffuse_color = (*c, 1); m.use_nodes = True
    m.use_backface_culling = not double
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*c,1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if glow:
        b.inputs['Emission Color'].default_value = (*c,1)
        b.inputs['Emission Strength'].default_value = glow
    return m

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets/models/monster/zarva.glb'))
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
for o in list(bpy.context.scene.objects):
    if o != rig: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for side, s in (('L',1),('R',-1)):
    bone = rig.data.edit_bones.new('wing'+side)
    bone.head = v((s*1.12, 4.00, 2.44))
    bone.tail = bone.head + Vector((0,0,0.25))
    bone.parent = rig.data.edit_bones['chest']
    bone.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

skin = mat('skin', skin_h, rough=0.75)
belly = mat('belly', belly_h, rough=0.77)
armor = mat('parts', armor_h, metal=0.24 if kind=='metalwing' else 0.04, rough=0.46)
accent = mat('accent', light_h, rough=0.4, glow=0.24)
eye = mat('eye', light_h, rough=0.22, glow=1.8)
membrane = mat('membrane', armor_h, rough=0.7, double=True)
dark = mat('mouth', '1b1b24', rough=0.9)
pieces = []

def finish(o,name,material,bone,smooth=True):
    o.name=name; o.data.materials.clear(); o.data.materials.append(material)
    if smooth:
        for p in o.data.polygons: p.use_smooth=True
    vg=o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
    pieces.append(o)
    return o
def ell(name,pos,scale,material,bone,segments=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=8,location=v(pos))
    o=bpy.context.object; o.scale=(scale[0],scale[2],scale[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,material,bone)
def taper(name,a,b,r0,r1,material,bone,sides=7):
    A,B=v(a),v(b); d=B-A
    bpy.ops.mesh.primitive_cone_add(vertices=sides,radius1=r0,radius2=r1,depth=d.length,location=(A+B)/2)
    o=bpy.context.object; o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,name,material,bone,False)
def spike(name,a,b,r,material,bone): return taper(name,a,b,r,0.008,material,bone,6)
def panel(name,pts,faces,material,bone):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata([v(p) for p in pts],[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.scene.collection.objects.link(o)
    return finish(o,name,material,bone,False)

# 胴の比率と頭の大きさで、遠目からでも種別が分かるようにする。
longneck = kind in ('ice','metalwing','batwing','fin')
head_scale = 0.9 if kind in ('metalwing','batwing') else 1.16 if kind in ('mane','scorpion') else 1
ell('haunch',(0,3.02,-0.18),(1.25*bulk,1.10*bulk,1.55*bulk),skin,'pelvis')
ell('torso',(0,3.32,1.20),(1.22*bulk,1.17*bulk,1.48*bulk),skin,'spine')
ell('chest',(0,3.70,2.65),(1.30*bulk,1.16*bulk,1.23*bulk),skin,'chest')
ell('breast',(0,3.12,2.70),(0.85*bulk,0.67,1.04),belly,'chest')
ell('throat',(0,4.08,3.87),(0.58,0.60,0.86 if longneck else 0.72),skin,'neck1')
ell('neck_top',(0,4.40,4.91),(0.52,0.51,0.72 if longneck else 0.60),skin,'neck2')
ell('skull',(0,4.55,5.88),(0.73*head_scale,0.61*head_scale,0.80*head_scale),skin,'head')
taper('muzzle',(0,4.44,6.25),(0,4.27,7.45 if kind=='fin' else 7.15),0.50*head_scale,0.24,armor,'head',8)
ell('lower_jaw',(0,4.05,6.77),(0.45,0.18,0.63),belly,'jaw')
ell('mouth_dark',(0,4.17,6.79),(0.39,0.07,0.58),dark,'jaw')
for side,s in (('L',1),('R',-1)):
    ell('eye_'+side,(s*0.61,4.72,6.30),(0.10,0.11,0.14),eye,'head',10)
    # 角は既存の horn ボーンに結びつき、頭部破壊で縮む。
    if kind=='tree':
        spike('antler_'+side,(s*0.38,4.97,5.67),(s*1.11,6.30,5.48),0.20,armor,'horn'+side)
        for j in range(3): spike('twig_'+side+str(j),(s*(0.58+j*0.15),5.33+j*0.22,5.61),(s*(0.91+j*0.16),5.68+j*0.22,5.96),0.08,accent,'horn'+side)
    elif kind=='scorpion':
        spike('mandible_'+side,(s*0.55,4.38,6.37),(s*1.07,4.05,7.42),0.22,armor,'horn'+side)
    elif kind=='shell':
        spike('ramhorn_'+side,(s*0.50,4.95,5.87),(s*1.50,5.18,6.16),0.40,armor,'horn'+side)
    else:
        spike('horn_'+side,(s*0.43,4.99,5.84),(s*(1.13 if kind in ('ice','metalwing') else 0.88),5.82,5.55),0.22,accent,'horn'+side)
    for j in range(3):
        spike('fang_'+side+str(j),(s*(0.34-j*0.05),4.21,6.42+j*0.16),(s*(0.34-j*0.05),3.95,6.48+j*0.16),0.075,belly,'head')

# 背・胸の固有の輪郭。
for i,(bone,z,y) in enumerate((('pelvis',0.0,4.15),('spine',1.0,4.52),('spine',1.95,4.64),('chest',2.86,4.73),('neck1',3.88,4.67))):
    h = 0.75 if kind in ('mane','ice','magma') else 0.46
    if kind=='shell': h=0.22
    spike('dorsal_'+str(i),(0,y,z),(0,y+h,z-0.35),0.24,accent if kind in ('ice','magma','mane') else armor,bone)
if kind in ('shell','magma'):
    ell('carapace',(0,4.18,1.12),(1.54*bulk,0.62,1.55*bulk),armor,'spine')
    for s in (-1,1):
        for i in range(4): ell('shell_plate_'+str(s)+'_'+str(i),(s*1.18*bulk,4.05,0.18+i*0.61),(0.39,0.22,0.46),accent if kind=='magma' else armor,'spine',10)
if kind=='mane':
    for s in (-1,1):
        for i in range(6): spike('mane_'+str(s)+'_'+str(i),(s*0.6,4.45,3.25+i*0.26),(s*(1.18+i*0.06),4.83,2.8+i*0.24),0.16,accent,'chest')
if kind=='crown':
    for i in range(-3,4): spike('poison_crown_'+str(i),(i*0.19,4.98,5.54),(i*0.35,5.76+0.28*(3-abs(i)),5.1),0.15,accent,'head')
if kind=='tree':
    for s in (-1,1):
        for i in range(4): ell('moss_'+str(s)+'_'+str(i),(s*1.1,4.09,0.22+i*0.75),(0.42,0.22,0.44),accent,'spine',10)
    for i in range(3):
        ell('living_crown_'+str(i),((i-1)*0.75,5.05+i*0.22,0.52+i*0.55),(0.78,0.52,0.76),accent,'spine',10)
if kind=='mane':
    for s in (-1,1):
        for i in range(5):
            spike('ruff_'+str(s)+'_'+str(i),(s*0.8,4.08,2.87+i*0.25),
                  (s*1.52,3.77,2.55+i*0.25),0.19,armor,'chest')
    spike('nose_lightning',(0,4.85,6.43),(0,5.43,6.52),0.19,accent,'head')
if kind=='shell':
    for s in (-1,1):
        for i in range(5):
            spike('rock_ridge_'+str(s)+'_'+str(i),(s*1.35*bulk,4.31,-0.43+i*0.57),
                  (s*1.78*bulk,4.72,-0.63+i*0.57),0.29,armor,'spine')
    ell('forehead_shield',(0,4.92,5.95),(0.86,0.28,0.58),armor,'head',10)
if kind=='fin':
    for s in (-1,1):
        for i in range(3):
            panel('gill_'+str(s)+'_'+str(i),[(s*0.55,4.45,3.88+i*0.27),(s*1.30,4.94,3.73+i*0.27),
                (s*1.10,4.02,3.60+i*0.27)],[(0,1,2)],accent,'neck1')
    panel('dorsal_sail',[(0,4.54,0.08),(0,6.05,0.94),(0,5.70,1.85),(0,4.62,2.50)],[(0,1,2),(0,2,3)],membrane,'spine')
if kind=='ice':
    for s in (-1,1):
        for i in range(4):
            spike('ice_lance_'+str(s)+'_'+str(i),(s*0.77,4.53,0.30+i*0.73),
                  (s*1.39,5.45+i*0.13,-0.08+i*0.75),0.24,accent,'spine' if i<3 else 'chest')
    spike('ice_nose',(0,4.63,6.43),(0,5.31,7.05),0.22,accent,'head')
if kind=='scorpion':
    for s in (-1,1):
        for i in range(4):
            spike('carapace_rib_'+str(s)+'_'+str(i),(s*0.92,4.02,0.21+i*0.62),
                  (s*1.56,4.35,0.07+i*0.62),0.23,armor,'spine')
    spike('stinger_hook',(0,5.18,-7.96),(0,4.12,-8.72),0.26,accent,'tail4')
if kind=='crown':
    for s in (-1,1):
        for i in range(4):
            ell('poison_sac_'+str(s)+'_'+str(i),(s*1.13,4.08,0.2+i*0.7),
                (0.32,0.29,0.31),accent,'spine',10)
if kind=='metalwing':
    ell('steel_mask',(0,4.82,6.1),(0.73,0.27,0.61),armor,'head',10)
    spike('steel_beak',(0,4.43,6.95),(0,4.23,7.67),0.27,accent,'head')
if kind=='magma':
    for s in (-1,1):
        for i in range(5):
            spike('magma_crack_'+str(s)+'_'+str(i),(s*0.90,4.52,-0.27+i*0.64),
                  (s*1.39,5.35,-0.52+i*0.64),0.22,accent,'spine' if i<4 else 'chest')
    ell('molten_throat',(0,3.81,3.57),(0.55,0.26,0.51),accent,'neck1',10)
if kind=='batwing':
    for s in (-1,1):
        spike('moon_crescent_'+str(s),(s*0.40,5.12,5.62),(s*1.42,6.14,5.62),0.23,accent,'horn'+('L' if s>0 else 'R'))
    ell('shadow_collar',(0,4.25,3.48),(0.86,0.33,0.55),armor,'neck1',10)

# 横の破壊可能な部位。翼竜は翼膜、地上種は鰭・鋏・肩甲を大きく張り出す。
flying = kind in ('metalwing','batwing')
for side,s in (('L',1),('R',-1)):
    bone='wing'+side
    if flying:
        spread=5.4 if kind=='metalwing' else 5.9
        pts=[(s*1.12,4.00,2.44),(s*2.48,5.0,2.2),(s*spread,5.83,0.95),(s*(spread-0.52),4.18,-0.28),(s*3.9,3.13,-1.28),(s*2.45,3.25,-1.67)]
        panel('wing_'+side,pts,[(0,1,5),(1,4,5),(1,3,4),(1,2,3)],membrane,bone)
        for j in (2,3,4,5): taper('wing_finger_'+side+str(j),pts[0] if j==5 else pts[1],pts[j],0.13 if j==2 else 0.075,0.015,accent if kind=='metalwing' else armor,bone)
        spike('wing_hook_'+side,pts[1],(s*2.75,5.26,2.67),0.19,armor,bone)
    elif kind in ('fin','ice','crown'):
        pts=[(s*1.15,4.03,2.38),(s*2.45,4.91,2.24),(s*3.5,5.4,1.08),(s*3.0,3.84,0.5),(s*1.72,3.65,1.17)]
        panel('side_fin_'+side,pts,[(0,1,4),(1,3,4),(1,2,3)],accent if kind=='ice' else membrane,bone)
        for j in (2,3): spike('fin_ray_'+side+str(j),pts[0],pts[j],0.15,armor,bone)
    elif kind=='scorpion':
        ell('claw_shoulder_'+side,(s*1.78,3.93,2.35),(0.8,0.53,0.81),armor,bone)
        taper('pincer_'+side,(s*2.2,3.92,2.55),(s*3.90,3.63,3.33),0.43,0.26,armor,bone)
        ell('pincer_knuckle_'+side,(s*3.84,3.64,3.35),(0.56,0.40,0.57),armor,bone,10)
        spike('pincer_tip_'+side,(s*4.03,3.69,3.58),(s*3.58,3.49,4.53),0.28,accent,bone)
        spike('pincer_lower_'+side,(s*3.73,3.45,3.62),(s*3.53,3.52,4.33),0.21,armor,bone)
    else:
        ell('shoulder_armor_'+side,(s*1.71,4.07,2.44),(0.65*bulk,0.58,0.78),armor,bone)
        spike('shoulder_blade_'+side,(s*1.80,4.10,2.35),(s*3.3,4.55,1.85),0.35,accent,bone)
        if kind in ('tree','mane'): spike('second_blade_'+side,(s*1.9,4.0,1.85),(s*2.7,4.9,1.2),0.20,armor,bone)

for side,s in (('L',1),('R',-1)):
    leg=0.68 if flying else 1.0
    ell('thigh_'+side,(s*1.01,2.48,0.25),(0.72*bulk*leg,0.95,0.90*leg),skin,'thigh'+side)
    taper('shin_'+side,(s*1.01,1.42,0.21),(s*1.01,0.20,0.30),0.48*bulk*leg,0.27*leg,skin,'shin'+side)
    ell('foot_'+side,(s*1.01,0.16,0.52),(0.45*leg,0.25*leg,0.73*leg),armor,'foot'+side)
    for j in (-1,0,1): spike('toe_'+side+str(j),(s*1.01+j*0.25,0.12,0.9),(s*1.01+j*0.28,0.00,1.40),0.10,accent,'foot'+side)
    ell('arm_'+side,(s*0.94,2.87,3.08),(0.31*bulk,0.48,0.35),skin,'arm'+side)
    taper('forearm_'+side,(s*0.94,2.45,3.09),(s*0.94,1.90,3.25),0.28*bulk,0.17,armor,'farm'+side)
    if kind in ('mane','shell','tree','magma'):
        front=0.68 if kind=='mane' else 1.12 if kind in ('shell','magma') else 0.9
        ell('front_haunch_'+side,(s*1.03,2.45,3.15),(0.56*front,0.84,0.63*front),skin,'arm'+side)
        taper('front_leg_'+side,(s*1.03,2.12,3.25),(s*1.12,0.43,3.54),0.43*front,0.26*front,armor,'farm'+side,9)
        ell('front_paw_'+side,(s*1.13,0.32,3.70),(0.41*front,0.24,0.62*front),armor,'farm'+side,10)
        for j in (-1,0,1): spike('front_claw_'+side+str(j),(s*1.13+j*0.18,0.25,4.10),
                                     (s*1.13+j*0.20,0.06,4.47),0.07,accent,'farm'+side)
    for j in (-1,0,1): spike('hand_'+side+str(j),(s*0.94+j*0.08,1.9,3.3),(s*0.94+j*0.1,1.62,3.57),0.065,accent,'farm'+side)

# 長い尾。サルダだけ立ち上がった毒針、他は扇・刃・球根状の先端を使う。
tailbones=['pelvis','tail0','tail1','tail2','tail3','tail4']
tailz=[(-0.65,-1.35),(-1.35,-2.64),(-2.64,-3.96),(-3.96,-5.24),(-5.24,-6.43),(-6.43,-7.48)]
for i,(a,b) in enumerate(tailz):
    r=0.71*(0.75**i)*bulk
    taper('tail_'+str(i),(0,3.04,a),(0,3.02,b),r,max(0.07,r*0.69),skin,tailbones[i],9)
if kind=='scorpion':
    spike('sting',(0,3.03,-7.44),(0,5.18,-7.96),0.34,accent,'tail4')
elif kind in ('fin','ice','metalwing','batwing'):
    for s in (-1,1): spike('tail_blade_'+str(s),(0,3.02,-7.03),(s*1.08,3.55,-7.9),0.23,accent,'tail4')
else:
    ell('tail_club',(0,3.02,-7.39),(0.55,0.51,0.63),armor,'tail4',10)
    for s in (-1,1): spike('tail_club_spike_'+str(s),(s*0.24,3.22,-7.5),(s*0.78,3.58,-7.9),0.13,accent,'tail4')

bpy.ops.object.select_all(action='DESELECT')
for o in pieces: o.select_set(True)
bpy.context.view_layer.objects.active=pieces[0]
bpy.ops.object.join()
creature=pieces[0]; creature.name=ID.title(); creature.parent=rig
modifier=creature.modifiers.new('Skin','ARMATURE'); modifier.object=rig

# 尻尾切断時に地面に残る部品。
bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,location=(0,0,0))
tailpiece=bpy.context.object; tailpiece.name='TailPiece'; tailpiece.scale=(0.42,0.73,0.38)
tailpiece.data.materials.append(armor); tailpiece.hide_render=True

dest=ROOT/'assets/models/monster'/f'{ID}.glb'
blend=ROOT/'tools/blender/out'/f'{ID}.blend'
preview=ROOT/'tools/blender/out'/f'{ID}_preview.png'
dest.parent.mkdir(parents=True,exist_ok=True); blend.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for o in (rig,creature,tailpiece): o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,
                          export_skins=True,export_animations=False,export_yup=True)
print('EXPORTED',ID,dest.stat().st_size)

world=bpy.data.worlds.new('Dark studio'); bpy.context.scene.world=world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.08,0.11,0.14,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.85
def light(name,loc,power,color):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.size=8; data.color=rgb(color)
    ob=bpy.data.objects.new(name,data); bpy.context.scene.collection.objects.link(ob); ob.location=loc
    ob.rotation_euler=(Vector((0,0,3))-ob.location).to_track_quat('-Z','Y').to_euler()
light('Key',(7,-11,12),2100,'ffffff'); light('Rim',(-7,3,11),1550,light_h)
camd=bpy.data.cameras.new('PreviewCamera'); cam=bpy.data.objects.new('PreviewCamera',camd)
bpy.context.scene.collection.objects.link(cam); cam.location=(10,-19,10)
cam.rotation_euler=(Vector((0,-1,3.3))-cam.location).to_track_quat('-Z','Y').to_euler()
camd.type='ORTHO'; camd.ortho_scale=18.5 if flying else 16.7
bpy.context.scene.camera=cam
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=24
sc.render.resolution_x=800; sc.render.resolution_y=600; sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG'; sc.render.filepath=str(preview)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.render.render(write_still=True)
print('PREVIEW',ID,preview.stat().st_size)
