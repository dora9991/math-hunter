"""第二部の12体。共通リグ上で、蟹・螳螂・鹿・鴉・環竜などの輪郭を造形する。"""
import math
import bpy

SPEC = {
 'thalass': ('305a67','a6c5b8','25434f','80e3dc',1.12,'scorpion'),
 'voltis': ('284d76','b7d7d8','193951','8fe7ff',0.85,'fin'),
 'mycelia': ('6b5263','c8b6a0','403b50','f8bad7',1.12,'crown'),
 'silvark': ('567450','c8d9a4','293e34','c2eda9',0.85,'scorpion'),
 'ammor': ('a08055','ded0a3','4d5954','efd7a0',1.22,'shell'),
 'osiron': ('b6b4a2','ded9c3','6e7776','fff0c1',0.92,'metalwing'),
 'nivalis': ('bcc7cb','e7e5d4','647e8c','c5f4ed',1.02,'tree'),
 'fenrig': ('485f86','bdc8da','293a5b','a9ccff',0.98,'mane'),
 'corvex': ('333043','9c95a7','1b2634','bca9ee',0.80,'batwing'),
 'aether': ('577e91','d3e3db','374d68','b7f0ff',0.95,'metalwing'),
 'gargant': ('8a7155','c2ac85','4b5054','e8c08a',1.50,'shell'),
 'oraclis': ('c9b9a3','f4ead2','605e78','ffe0b1',1.08,'batwing'),
}

def add_form(ID, ns):
    if ID not in SPEC: return
    ell, spike, taper, finish, v = (ns[k] for k in ('ell','spike','taper','finish','v'))
    skin, armor, accent, belly, pieces = (ns[k] for k in ('skin','armor','accent','belly','pieces'))
    def drop(prefixes):
        for o in pieces[:]:
            if o.name.startswith(prefixes): pieces.remove(o); bpy.data.objects.remove(o, do_unlink=True)
    def ring(name, p, radius, material, bone, rotation=(0,0,0)):
        bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=v(p),major_radius=radius,minor_radius=.095,rotation=rotation)
        return finish(bpy.context.object,name,material,bone,False)
    def box(name,p,scale,material,bone):
        bpy.ops.mesh.primitive_cube_add(size=2,location=v(p)); o=bpy.context.object; o.scale=(scale[0],scale[2],scale[1]);
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        return finish(o,name,material,bone,False)
    if ID=='thalass':
        drop(('tail_','sting','stinger_','neck_top','horn_'))
        for o in pieces:
            if o.name in ('torso','haunch','chest'): o.scale.x*=1.6; o.scale.z*=.65
        ell('crab_dome',(0,4.05,1.4),(2.8,.85,2.8),armor,'spine')
        for s in (-1,1):
            for i in range(3):
                a=(s*1.3,3.1,.5+i*.9); b=(s*(3.7-i*.25),2.5,-.2+i*1.1); c=(s*(4.0-i*.2),.6,-.5+i*1.2)
                taper('crab_leg_a',a,b,.18,.12,armor,'spine'); taper('crab_leg_b',b,c,.12,.04,accent,'spine')
            ell('crab_eye_stalk',(s*.75,5.1,5.5),(.15,.6,.15),accent,'head')
    if ID=='voltis':
        drop(('thigh_','shin_','foot_','toe_','arm_','forearm_','hand_'))
        for i in range(5): ell('electric_orb',(0,4.7,3-i),(.35,.35,.35),accent,'spine' if i<3 else 'pelvis')
        for s in (-1,1):
            for i in range(6): spike('serpent_hood',(s*.4,4.5,4.2),(s*(1.6+i*.15),5.8-i*.22,3.8-i*.2),.12,accent,'neck1')
        ell('serpent_keel',(0,2.9,1.6),(.8,.65,3.3),skin,'spine')
    if ID=='mycelia':
        drop(('poison_crown','horn_'))
        for i in range(5):
            x=(i%3-1)*1.2; z=.1+(i//3)*1.6; h=5.0+(i%2)*.8
            taper('mushroom_stem',(x,3.8,z),(x,h,z),.23,.15,belly,'spine')
            ell('mushroom_cap',(x,h,z),(1.1,.38,.95),accent,'spine')
            for j in range(3): ell('cap_spot',(x+(j-1)*.4,h+.27,z+.12),(.12,.07,.13),armor,'spine',8)
    if ID=='silvark':
        drop(('sting','stinger_','pincer_','claw_shoulder'))
        for o in pieces:
            if o.name in ('haunch','torso','chest'): o.scale.x*=.65
        for side,s in (('L',1),('R',-1)):
            bone='wing'+side
            taper('mantis_upper',(s*1.1,4,2.5),(s*3.2,5.5,3.3),.27,.16,armor,bone)
            spike('mantis_scythe',(s*3.2,5.5,3.3),(s*3.7,2.1,5.9),.55,accent,bone)
            for j in range(4): spike('mantis_serration',(s*3.4,4.9-j*.5,3.8+j*.3),(s*2.8,4.6-j*.5,4.2+j*.3),.11,belly,bone)
            ell('compound_eye',(s*.7,4.8,6.25),(.26,.26,.3),accent,'head')
    if ID=='ammor':
        ell('clock_shell',(0,4.8,.6),(1.9,1.75,1.55),armor,'spine')
        for i in range(3): ring('shell_clock',(0,4.8,.6+i*.3),1.5-i*.35,accent,'spine',(math.pi/2,0,0))
        for i in range(8):
            a=i*math.pi/4; spike('clock_tooth',(math.cos(a)*1.5,4.8+math.sin(a)*1.5,1),(math.cos(a)*2,4.8+math.sin(a)*2,1),.2,armor,'spine')
    if ID in ('osiron','corvex'):
        if ID=='corvex': drop(('horn_','moon_crescent'))
        spike('long_beak',(0,4.5,6.4),(0,4.1,8.4),.55,armor,'head')
        for side,s in (('L',1),('R',-1)):
            for j in range(7):
                spike('long_feather',(s*(2+j*.48),4.6,1.9-j*.2),(s*(3.3+j*.48),4.1,-1.7-j*.15),.24,accent if ID=='osiron' else armor,'wing'+side)
        if ID=='osiron':
            for s in (-1,1):
                for j in range(4): taper('exposed_rib',(s*.3,3.7,.3+j*.65),(s*1.5,3.1,.3+j*.65),.12,.08,belly,'spine')
        else:
            for j in range(5): spike('raven_crest',(0,4.9,5.4-j*.2),(0,5.9-j*.08,5.0-j*.3),.18,armor,'head')
    if ID=='nivalis':
        drop(('living_crown','moss_','twig_'))
        for side,s in (('L',1),('R',-1)):
            for j in range(5):
                a=(s*(.5+j*.25),5.4+j*.27,5.6-j*.12); b=(s*(1.4+j*.31),6.3+j*.38,5.3-j*.13)
                spike('frost_antler',a,b,.13,accent,'horn'+side)
            ell('deer_ear',(s*.85,4.95,5.8),(.48,.17,.24),skin,'head')
            taper('deer_front',(s*1,3,3),(s*1.2,.4,3.8),.25,.13,armor,'farm'+side)
    if ID=='fenrig':
        drop(('nose_lightning',))
        for side,s in (('L',1),('R',-1)):
            spike('wolf_ear',(s*.5,5.0,5.7),(s*.9,6.25,5.35),.36,armor,'head')
            for j in range(6): spike('wolf_ruff',(s*.7,4.3,3.1+j*.25),(s*1.7,5.1-j*.1,2.6+j*.2),.23,belly,'chest')
        ell('wolf_snout',(0,4.45,6.8),(.4,.35,1),skin,'head')
    if ID in ('aether','oraclis'):
        drop(('moon_crescent',))
        for i,bone in enumerate(('spine','chest','head')):
            ring('star_halo',(0,4.2+i*.5,1.2+i*2),2.1-i*.25,accent,bone,(math.pi/2,.22*i,0))
        if ID=='oraclis':
            for side,s in (('L',1),('R',-1)):
                for j in range(3):
                    spike('oracle_crown',(s*.3,5.1,5.5),(s*(.6+j*.65),6.6-j*.1,5.2-j*.2),.22,accent,'horn'+side)
                    ring('boundary_ring',(s*(2.2+j*.85),4.8-j*.3,1.2-j*.7),.65+j*.2,accent,'wing'+side,(.4,math.pi/2,0))
    if ID=='gargant':
        for bone,z,y in (('pelvis',0,3.4),('spine',1.4,3.9),('chest',2.7,4)):
            box('castle_plate',(0,y,z),(1.8,.9,.65),armor,bone)
        for side,s in (('L',1),('R',-1)):
            box('greatshield',(s*2,3.9,2.5),(.85,1.45,.65),armor,'wing'+side)
            for j in range(3): box('battlement',(s*(1.1+j*.3),5.3,1.1),(.17,.42,.5),accent,'spine')
