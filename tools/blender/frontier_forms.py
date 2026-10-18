"""第三部13体と、道中の小型魔獣12体。形状を個別に追加する。"""
import bpy, math
SPEC={
 'sparko':('766642','d6c68e','414951','ffe59a',.72,'mane'),
 'bristle':('695e55','b8aa8c','43474d','e5ca9c',.88,'shell'),
 'capling':('73675c','d4cba5','433f4b','e8a7c5',.68,'crown'),
 'chittra':('698653','c5d9a8','334b3c','c6eb87',.65,'fin'),
 'sandlet':('a58b5c','dfcd9e','655b48','eed598',.65,'fin'),
 'dunebeetle':('8c6745','c8a46c','4e5048','e0c17c',.78,'shell'),
 'frosthare':('c8d4d3','f4eee0','7e9d9e','d8fff5',.65,'mane'),
 'snowcub':('7e96b4','dde1e0','384e6b','c8e8ff',.70,'mane'),
 'windling':('537c8b','bdd2c6','334854','b0e5ee',.60,'metalwing'),
 'nightbat':('655879','bfb1d0','302c4b','d8baff',.65,'batwing'),
 'ashling':('6b5b50','c9ac8a','3f3c3b','efb986',.70,'ice'),
 'emberling':('9d613b','f3c28b','584338','ffd889',.88,'magma'),
 'rhinox':('696b65','b7aa8a','3a4649','cfae7c',1.40,'shell'),
 'chelona':('66774d','b9c49a','354d43','b2d792',1.35,'shell'),
 'arachna':('63516f','c0a5bf','2f3447','d6a5f0',.92,'scorpion'),
 'seirun':('39716b','bbd9bf','24454e','9ceadf',.86,'fin'),
 'vulpira':('996c7a','f0d3c9','503d59','ffbadc',.85,'mane'),
 'mothria':('8b739b','dfd5c2','443d63','eac5ff',.95,'batwing'),
 'scorvex':('84714d','cfc28a','3f4545','e5c66d',1.05,'scorpion'),
 'solvyr':('a57940','eed4a3','5d4938','ffd680',1.10,'metalwing'),
 'gryphor':('6d8168','d6d5ae','394c4c','d5e5ac',1.04,'metalwing'),
 'noctyra':('5d587b','bdb6d0','2e3049','c0b3f1',1.05,'batwing'),
 'tempestr':('496b85','c5d5d6','283b55','a1e2ff',1.15,'metalwing'),
 'mammora':('7b7a72','d8cbb6','454c4a','e3d3b2',1.55,'mane'),
 'astravor':('9a947d','eee5c9','484861','ffe6a8',1.17,'batwing'),
}
SMALL=set(list(SPEC)[:12])
def add_form(ID,ns):
 if ID not in SPEC:return
 ell,spike,taper,panel,finish,v=(ns[k] for k in ('ell','spike','taper','panel','finish','v'))
 skin,armor,accent,belly,pieces=(ns[k] for k in ('skin','armor','accent','belly','pieces'))
 def drop(prefixes):
  for o in pieces[:]:
   if o.name.startswith(prefixes):pieces.remove(o);bpy.data.objects.remove(o,do_unlink=True)
 def ring(name,p,r,bone):
  bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,location=v(p),major_radius=r,minor_radius=.12,rotation=(math.pi/2,0,0))
  finish(bpy.context.object,name,accent,bone,False)
 if ID in SMALL:drop(('dorsal_','horn_','nose_lightning','ice_nose','poison_crown'))
 if ID in ('sparko','snowcub','frosthare','vulpira','mammora'):
  for side,s in (('L',1),('R',-1)):
   h=2.1 if ID=='frosthare' else 1.2
   taper('upright_ear',(s*.55,4.9,5.7),(s*.95,5+h,5.4),.32,.09,skin,'head')
 if ID in ('sparko','snowcub'):
  ell('fluffy_tail',(0,3.3,-6.6),(.95,.85,1.5),accent if ID=='sparko' else belly,'tail4')
 if ID=='bristle':
  for s in (-1,1):spike('boar_tusk',(s*.42,4.1,6.8),(s*1,5.2,7.3),.24,belly,'head')
  for j in range(5):spike('stone_bristle',(0,4.3,j*.7),(0,5.5,j*.7-.2),.23,armor,'spine')
 if ID=='capling':
  ell('great_mushroom_cap',(0,5.4,5.6),(1.8,.62,1.6),accent,'head')
  for j in range(7):
   a=j*math.tau/7;ell('cap_spot',(math.cos(a)*1.1,5.85,5.6+math.sin(a)),(.22,.12,.23),belly,'head',8)
 if ID=='chittra':
  for side,s in (('L',1),('R',-1)):
   panel('leaf_wing',[(s,4,2.4),(s*4.4,5.8,.5),(s*3.9,3.3,-1),(s*1.1,3.6,1)],[(0,1,2),(0,2,3)],accent,'wing'+side)
   spike('insect_antenna',(s*.35,5,5.8),(s*.95,6.9,6.2),.09,armor,'head')
 if ID in ('sandlet','seirun'):
  drop(('thigh_','shin_','foot_','toe_','arm_','forearm_','hand_','front_'))
  for j in range(5):ell('serpent_coil',(math.sin(j*1.4)*1.2,2.8,.5-j*.9),(.8,.75,1.1),skin,'pelvis' if j>2 else 'spine')
  for s in (-1,1):
   for j in range(4):spike('water_hood',(s*.5,4.5,4.4),(s*(1.6+j*.2),5.8-j*.4,3.8-j*.2),.15,accent,'neck1')
 if ID=='dunebeetle':
  ell('beetle_helmet',(0,5.0,5.7),(1.1,.55,1.1),armor,'head')
  spike('beetle_horn',(0,5.2,6.2),(0,6.8,7),.32,accent,'head')
  for s in (-1,1):
   for j in range(3):taper('beetle_leg',(s,3,.3+j*.8),(s*2.7,.7,j*.8),.16,.05,armor,'spine')
 if ID in ('windling','gryphor','tempestr'):
  drop(('horn_',))
  spike('bird_beak',(0,4.5,6.4),(0,4.15,8.1),.5,armor,'head')
  for side,s in (('L',1),('R',-1)):
   for j in range(6):spike('flight_feather',(s*(1.8+j*.55),4.8,1.9-j*.2),(s*(3+j*.6),4.1,-2-j*.13),.23,accent,'wing'+side)
  if ID!='windling':
   for j in range(5):spike('bird_crown',((j-2)*.2,5,5.4),((j-2)*.4,6.5+(.3 if j==2 else 0),5.1),.17,accent,'head')
 if ID in ('nightbat','noctyra'):
  for s in (-1,1):
   taper('radar_ear',(s*.65,5,5.6),(s*1.3,7.1,5.2),.5,.13,skin,'head')
  if ID=='noctyra':
   for side,s in (('L',1),('R',-1)):
    ring('bell_resonator',(s*2.2,4,1.5),1,'wing'+side)
 if ID=='ashling':
  for j in range(6):spike('ash_crest',(0,4.3,j*.6),(0,5.1,j*.6-.1),.2,armor,'spine')
 if ID=='emberling':
  ell('fire_sac',(0,3.7,2.5),(1.5,1.3,1.6),accent,'chest')
  for j in range(3):spike('flame_tuft',((j-1)*.3,5,5.6),((j-1)*.5,6.7-abs(j-1)*.5,5.1),.25,accent,'head')
 if ID=='rhinox':
  drop(('ramhorn_',))
  spike('rhinoceros_horn',(0,4.8,6.5),(0,7.2,7.6),.62,belly,'hornL')
  spike('second_rhino_horn',(0,5,5.8),(0,6.3,6.2),.32,belly,'hornR')
  for s in (-1,1):ell('iron_shoulder',(s*1.8,4.1,2.4),(1,.9,1),armor,'wing'+('L' if s>0 else 'R'))
 if ID=='chelona':
  ell('island_shell',(0,4.3,.9),(3.2,1.35,3.1),armor,'spine')
  for j in range(9):
   a=j*math.tau/9;ell('island_plate',(math.cos(a)*2,5.1,.9+math.sin(a)*1.8),(.65,.32,.7),skin,'spine',8)
  for j in range(3):
   taper('sapling',(j-1,5,1),(j-1,6.6,1),.12,.06,armor,'spine')
   ell('island_leaves',(j-1,6.6,1),(.7,.55,.7),accent,'spine',8)
 if ID=='arachna':
  drop(('sting','stinger','tail_','pincer_'))
  ell('spider_abdomen',(0,3.6,-.7),(1.9,1.8,2.2),skin,'pelvis')
  for side,s in (('L',1),('R',-1)):
   for j in range(4):
    bone='wing'+side if j>=2 else 'spine';a=(s,3.8,.1+j*.8);b=(s*(4.2-j*.25),4.2,-1+j*1.3);c=(s*(4.7-j*.2),.2,-1.6+j*1.4)
    taper('spider_leg_upper',a,b,.24,.15,armor,bone);taper('spider_leg_lower',b,c,.15,.04,accent,bone)
   for j in range(3):ell('spider_eye',(s*(.2+j*.2),4.8,6.3),(.14,.14,.14),accent,'head',8)
 if ID=='vulpira':
  drop(('horn_','nose_lightning'))
  for j in range(5):
   s=(j-2)*.8; taper('dream_tail',(0,3.1,-.5),(s*1.8,4.3,-6),.55,.28,skin,'pelvis');ell('dream_tail_tip',(s*1.8,4.4,-6.3),(.45,.55,.8),accent,'tail2')
 if ID=='mothria':
  for side,s in (('L',1),('R',-1)):
   ell('moth_eye_pattern',(s*3.4,4.9,.7),(1.1,.13,1.2),accent,'wing'+side)
   ell('moth_eye_center',(s*3.4,5.03,.7),(.48,.1,.55),armor,'wing'+side)
   spike('moth_antenna',(s*.4,5.1,5.7),(s*1.1,7,6.1),.12,accent,'head')
 if ID=='scorvex':
  for s in (-1,1):
   for j in range(4):taper('scorpion_leg',(s,3.4,.1+j*.7),(s*3.2,.3,-.8+j*.9),.19,.06,armor,'spine')
  ell('mineral_stinger',(0,5,-8),(.6,.8,.6),accent,'tail4')
 if ID=='solvyr':
  ring('sun_halo',(0,5.4,4.8),2.1,'head')
  for j in range(12):
   a=j*math.tau/12;spike('sun_ray',(math.cos(a)*1.8,5.4+math.sin(a)*1.8,4.8),(math.cos(a)*2.8,5.4+math.sin(a)*2.8,4.8),.15,accent,'head')
 if ID=='tempestr':
  for side,s in (('L',1),('R',-1)):
   for j in range(4):spike('lightning_feather',(s*(2+j*.8),5.2,1),(s*(3+j*.8),6.7,-.5),.24,accent,'wing'+side)
 if ID=='mammora':
  drop(('horn_','nose_lightning','muzzle'))
  for side,s in (('L',1),('R',-1)):
   taper('ivory_tusk',(s*.5,4.3,6.3),(s*1.6,3.3,7.4),.35,.18,belly,'horn'+side)
   spike('tusk_tip',(s*1.6,3.3,7.4),(s*1.8,4.3,8.2),.18,belly,'horn'+side)
   ell('elephant_ear',(s*1,4.6,5.5),(.9,1.3,.25),skin,'head')
  for j in range(5):ell('trunk_segment',(0,4.4-j*.6,6.8+j*.18),(.4-j*.035,.5,.4),skin,'jaw')
 if ID=='astravor':
  for j,bone in enumerate(('pelvis','spine','chest','head')):ring('creation_halo',(0,4.5+j*.4,.1+j*1.6),2.3-j*.2,bone)
  for side,s in (('L',1),('R',-1)):
   for j in range(4):
    spike('creation_crown',(s*.25,5.1,5.5),(s*(.5+j*.5),7.3-j*.3,5.1),.2,accent,'horn'+side)
    panel('second_star_wing',[(s,3.8,2),(s*5.4,3.1,-.7),(s*3.8,1.8,-2.1)],[(0,1,2)],accent,'wing'+side)
