import * as THREE from 'three';

// 数式バトルの舞台装飾。地形の高さを追うため、従来のワールドをそのまま利用できる。
const THEMES = {
  storm:  { floor: 0x355466, stone: 0x536575, accent: 0xffd34b, form: 'spire', sky: 0x425879, horizon: 0x8196a1, sun: 0xdbe6ff, strength: 1.75 },
  stone:  { floor: 0x6f6657, stone: 0x625949, accent: 0xd2ad76, form: 'ruin', sky: 0x7d8091, horizon: 0xc1ad92, sun: 0xffe1b8, strength: 2.2 },
  marsh:  { floor: 0x24685c, stone: 0x3b6458, accent: 0x70d8b7, form: 'reed', sky: 0x577f81, horizon: 0x88aba0, sun: 0xc8f5e1, strength: 1.65 },
  ice:    { floor: 0x8ccada, stone: 0x9dcad5, accent: 0xc9f3ff, form: 'crystal', sky: 0x5d8bb5, horizon: 0xc7e4f1, sun: 0xe8f9ff, strength: 2.35 },
  dune:   { floor: 0x9a7041, stone: 0x8d6741, accent: 0xf2c775, form: 'obelisk', sky: 0xb78155, horizon: 0xe9bd7e, sun: 0xffd695, strength: 2.4 },
  forest: { floor: 0x345b2c, stone: 0x4e5d3c, accent: 0x96e068, form: 'tree', sky: 0x4c765f, horizon: 0x9dbb89, sun: 0xdbffc0, strength: 1.65 },
  poison: { floor: 0x514060, stone: 0x67537a, accent: 0xb487ef, form: 'fungus', sky: 0x675078, horizon: 0x9e89a5, sun: 0xdfbdf9, strength: 1.65 },
  sky:    { floor: 0x516478, stone: 0x596c7e, accent: 0xb4d6ff, form: 'pillar', sky: 0x3e79bd, horizon: 0xaed3eb, sun: 0xe8f6ff, strength: 2.5 },
  lava:   { floor: 0x5e342f, stone: 0x372f2f, accent: 0xff7842, form: 'vent', sky: 0x633b45, horizon: 0xb97959, sun: 0xffad76, strength: 1.75 },
  moon:   { floor: 0x3b3d67, stone: 0x505779, accent: 0xd1bdff, form: 'arch', sky: 0x22294f, horizon: 0x59638d, sun: 0xb6c2ff, strength: 1.25 },
};

function circleOnTerrain(terrain, x, z, radius, material) {
  const pos = [], idx = [], seg = 48, rings = 10;
  for (let j = 0; j <= rings; j++) {
    const r = radius * j / rings;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      pos.push(px, terrain.heightAt(px, pz) + 0.055, pz);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; mesh.material.side = THREE.DoubleSide;
  return mesh;
}

export function buildBattlefield(game, beast, anchor, spots) {
  const t = game.world.terrain, theme = THEMES[beast.stage], root = new THREE.Group();
  root.name = `battlefield_${beast.stage}`;
  const world = game.world;
  const nestVisible = world.nest?.visible;
  if (beast.area === 4 && world.nest) world.nest.visible = false;
  const before = { top: world.skyMat.uniforms.top.value.clone(), horizon: world.skyMat.uniforms.horizon.value.clone(),
    fog: game.scene.fog.color.clone(), background: game.scene.background.clone(),
    sun: world.sun.color.clone(), strength: world.sun.intensity };
  world.skyMat.uniforms.top.value.setHex(theme.sky);
  world.skyMat.uniforms.horizon.value.setHex(theme.horizon);
  game.scene.fog.color.setHex(theme.horizon);
  game.scene.background.setHex(theme.horizon);
  world.sun.color.setHex(theme.sun); world.sun.intensity = theme.strength;
  const stone = new THREE.MeshStandardMaterial({ color: theme.stone, roughness: 0.84, flatShading: true });
  const floor = new THREE.MeshStandardMaterial({ color: theme.floor, transparent: true,
    opacity: ['ice','dune','lava','moon'].includes(beast.stage) ? 0.69 : 0.52, roughness: 0.92, depthWrite: false });
  const accent = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.38, roughness: 0.42, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x26332e, roughness: 1, flatShading: true });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; root.add(m); return m; };
  const at = (r, a) => [anchor.x + Math.cos(a) * r, anchor.z + Math.sin(a) * r];
  const cone = (x,z,r,h,mat=accent) => add(new THREE.ConeGeometry(r,h,6),mat,x,t.heightAt(x,z)+h/2,z);
  const column = (x,z,r,h,mat=stone) => add(new THREE.CylinderGeometry(r*0.75,r,h,7),mat,x,t.heightAt(x,z)+h/2,z);
  root.add(circleOnTerrain(t,anchor.x,anchor.z,11.8,floor));
  const groundLine = (x1,z1,x2,z2,width=0.10) => {
    const p1=new THREE.Vector3(x1,t.heightAt(x1,z1)+0.12,z1);
    const p2=new THREE.Vector3(x2,t.heightAt(x2,z2)+0.12,z2);
    const dir=p2.clone().sub(p1), len=dir.length();
    const mesh=add(new THREE.CylinderGeometry(width,width,len,6),accent,(x1+x2)/2,(p1.y+p2.y)/2,(z1+z2)/2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
    mesh.castShadow=false;
  };
  if (['lava','ice','storm'].includes(beast.stage)) for (let i=0;i<18;i++) {
    const a=i*Math.PI/9+0.17, r=5.2+(i%4)*0.36;
    const [x1,z1]=at(r,a),[x2,z2]=at(r+2.3+(i%3)*0.4,a+0.12*(i%2?1:-1));
    groundLine(x1,z1,x2,z2,beast.stage==='lava'?0.12:0.07);
    if (i%3===0) { const [x3,z3]=at(r+3.2,a+0.27); groundLine(x2,z2,x3,z3,0.06); }
  }
  if (beast.stage==='moon') for (let i=0;i<12;i++) {
    const a=i*Math.PI/6, [x1,z1]=at(8.1,a), [x2,z2]=at(8.1,a+0.30);
    groundLine(x1,z1,x2,z2,0.065);
  }
  // 立ち位置と相手の動線から離して外縁を作る。
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 + 0.12, [x,z] = at(16.5 + (i%3)*0.9,a), y = t.heightAt(x,z);
    const towardCamera = (x-anchor.x)*anchor.fx + (z-anchor.z)*anchor.fz;
    if (towardCamera > 5) continue;
    if (theme.form === 'spire') {
      column(x,z,0.72,2.2); cone(x,z,0.53,3.5);
      if (i%3===0) cone(x+0.8,z-0.5,0.22,1.4);
    } else if (theme.form === 'ruin' || theme.form === 'pillar' || theme.form === 'arch') {
      const h = theme.form === 'pillar' ? 5.7 : 3.7;
      column(x,z,0.68,h);
      add(new THREE.BoxGeometry(1.9,0.42,1.9),accent,x,y+h+0.15,z);
      if (theme.form === 'arch' && i%2===0) {
        const [xx,zz] = at(15.7,a+0.19);
        const b = add(new THREE.BoxGeometry(2.4,0.35,0.45),stone,(x+xx)/2,y+h-0.25,(z+zz)/2);
        b.rotation.y = -a;
      }
    } else if (theme.form === 'reed') {
      for (let k=0;k<4;k++) { const xx=x+(k-1.5)*0.45, zz=z+Math.sin(k*2)*0.5; column(xx,zz,0.08,1.4+(k%2)*0.55,dark); cone(xx,zz,0.18,0.52,accent); }
      if (i%3===0) add(new THREE.SphereGeometry(0.55,8,6),accent,x,y+0.55,z);
    } else if (theme.form === 'crystal') {
      cone(x,z,0.75,3.8); cone(x+1,z+0.5,0.38,2.25,stone);
    } else if (theme.form === 'obelisk') {
      const o=column(x,z,0.75,3.0); o.rotation.z=0.1*(i%3-1); cone(x,z,0.55,1.2,accent);
    } else if (theme.form === 'tree') {
      column(x,z,0.42,3.8,dark);
      add(new THREE.IcosahedronGeometry(1.65,1),stone,x,y+4.15,z);
      add(new THREE.IcosahedronGeometry(1.1,1),accent,x+0.7,y+4.5,z+0.3);
    } else if (theme.form === 'fungus') {
      column(x,z,0.17,1.8,stone);
      const cap=add(new THREE.SphereGeometry(0.9,10,6),accent,x,y+1.82,z); cap.scale.y=0.35;
      cone(x+0.8,z,0.25,1.2,accent);
    } else if (theme.form === 'vent') {
      const b=add(new THREE.DodecahedronGeometry(1.35,0),stone,x,y+0.65,z); b.scale.y=0.58;
      cone(x,z,0.43,1.8,accent);
    }
  }
  // 各フィールド固有色の照明と、攻撃前にも認識できる三か所の目印。
  const light = new THREE.PointLight(theme.accent, 48, 34, 2);
  light.position.set(anchor.x,t.heightAt(anchor.x,anchor.z)+7,anchor.z); root.add(light);
  for (const spot of spots) {
    const y=t.heightAt(spot.x,spot.z);
    const tile=add(new THREE.CylinderGeometry(1.03,1.16,0.16,12),stone,spot.x,y-0.02,spot.z);
    tile.castShadow=false;
    const mark=add(new THREE.RingGeometry(0.72,0.9,24),accent,spot.x,y+0.09,spot.z);
    mark.rotation.x=-Math.PI/2; mark.castShadow=false;
  }
  game.scene.add(root);
  return { root, dispose() {
    game.scene.remove(root);
    if (world.nest && nestVisible !== undefined) world.nest.visible = nestVisible;
    world.skyMat.uniforms.top.value.copy(before.top); world.skyMat.uniforms.horizon.value.copy(before.horizon);
    game.scene.fog.color.copy(before.fog); game.scene.background.copy(before.background);
    world.sun.color.copy(before.sun); world.sun.intensity = before.strength;
    const geos=new Set(), mats=new Set();
    root.traverse(o=>{ if (o.isMesh) { geos.add(o.geometry); mats.add(o.material); } });
    geos.forEach(g=>g.dispose()); mats.forEach(m=>m.dispose());
  } };
}
