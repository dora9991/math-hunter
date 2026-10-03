// エフェクト：火花・土ぼこり・炎・煙・剣の軌跡・衝撃の輪・ダメージ数値・画面フラッシュ
import * as THREE from 'three';
import { clamp, lerp, Rng } from './util.js';

const rng = new Rng(99);
const _v = new THREE.Vector3(), _c = new THREE.Color();

// 粒の絵（1枚に4コマ：やわらかい光／煙／火花の筋／炎）を canvas で描く
function particleAtlas() {
  const S = 128, cv = document.createElement('canvas');
  cv.width = S * 4; cv.height = S;
  const g = cv.getContext('2d');
  const r = new Rng(7);
  // 0: やわらかい光
  let grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.75)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  // 1: 煙（もこもこ）
  for (let i = 0; i < 38; i++) {
    const x = S + S / 2 + r.range(-26, 26), y = S / 2 + r.range(-26, 26), rr = r.range(14, 30);
    grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  // 2: 火花の筋（縦長）
  grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.ellipse(S * 2 + S / 2, S / 2, S * 0.09, S * 0.48, 0, 0, Math.PI * 2); g.fill();
  // 3: 炎（しずく形）
  for (let i = 0; i < 22; i++) {
    const x = S * 3 + S / 2 + r.range(-16, 16), y = S * 0.62 + r.range(-26, 18), rr = r.range(12, 26) * (1 - Math.abs(y - S * 0.62) / S * 0.6);
    grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, 'rgba(255,255,255,0.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
let ATLAS = null;
export const FRAME = { glow: 0, smoke: 1, streak: 2, flame: 3 };

// 粒：絵つきの板をカメラに向けてまとめて描く（1回の描画で数千個）
class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0; this.additive = additive;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.par = new Float32Array(max * 4);   // 大きさ・回転・コマ・濃さ
    this.str = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.grow = new Float32Array(max); this.size0 = new Float32Array(max); this.spin = new Float32Array(max);
    if (!ATLAS) ATLAS = particleAtlas();
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const A = (arr, n) => { const a = new THREE.InstancedBufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = A(this.pos, 3); this.aVel = A(this.vel, 3); this.aCol = A(this.col, 3); this.aPar = A(this.par, 4); this.aStr = A(this.str, 1);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aVel', this.aVel); g.setAttribute('aCol', this.aCol); g.setAttribute('aPar', this.aPar); g.setAttribute('aStr', this.aStr);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: ATLAS }, uBoost: { value: additive ? 1.9 : 1.0 } },
      vertexShader: `attribute vec3 aPos; attribute vec3 aVel; attribute vec3 aCol; attribute vec4 aPar; attribute float aStr;
        varying vec2 vUv; varying vec3 vCol; varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
          vec2 corner = position.xy;
          float size = aPar.x * 0.1;
          if (aStr > 0.0) {
            vec3 vv = (modelViewMatrix * vec4(aVel, 0.0)).xyz;
            float sp = length(vv.xy);
            vec2 dir = sp > 0.001 ? vv.xy / sp : vec2(0.0, 1.0);
            vec2 perp = vec2(-dir.y, dir.x);
            mv.xy += dir * corner.y * size * (1.0 + aStr * sp) + perp * corner.x * size * 0.5;
          } else {
            float c = cos(aPar.y), s = sin(aPar.y);
            mv.xy += vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * size;
          }
          vUv = vec2((uv.x + aPar.z) * 0.25, uv.y);
          vCol = aCol; vA = aPar.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D tMap; uniform float uBoost; varying vec2 vUv; varying vec3 vCol; varying float vA;
        void main(){ float a = texture2D(tMap, vUv).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vCol * uBoost, a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 5 : 4;
    this.uScale = { value: 1 };   // 旧版との互換用（未使用）
    scene.add(this.mesh);
  }
  // o = { frame, rot, spin, stretch }
  spawn(x, y, z, vx, vy, vz, color, size, life, grav = 0, drag = 0, grow = 0, o = null) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    _c.set(color);
    this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
    this.par[i * 4] = size; this.par[i * 4 + 1] = o && o.rot !== undefined ? o.rot : rng.range(0, 6.28); this.par[i * 4 + 2] = o && o.frame ? o.frame : 0; this.par[i * 4 + 3] = 1;
    this.str[i] = o && o.stretch ? o.stretch : 0; this.spin[i] = o && o.spin ? o.spin : 0;
    this.size0[i] = size;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); continue; }
      const k = i * 3, dr = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const u = this.life[i] / this.maxLife[i];
      this.par[i * 4 + 3] = Math.min(1, u * 2.2) * Math.min(1, (1 - u) * 12 + 0.25);
      this.par[i * 4] = this.size0[i] * (1 + this.grow[i] * (1 - u));
      this.par[i * 4 + 1] += this.spin[i] * dt;
      i++;
    }
    this.mesh.geometry.instanceCount = this.n;
    this.aPos.needsUpdate = true; this.aVel.needsUpdate = true; this.aCol.needsUpdate = true; this.aPar.needsUpdate = true; this.aStr.needsUpdate = true;
  }
  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (let c = 0; c < 3; c++) { this.pos[i * 3 + c] = this.pos[j * 3 + c]; this.vel[i * 3 + c] = this.vel[j * 3 + c]; this.col[i * 3 + c] = this.col[j * 3 + c]; }
    for (let c = 0; c < 4; c++) this.par[i * 4 + c] = this.par[j * 4 + c];
    this.str[i] = this.str[j]; this.spin[i] = this.spin[j]; this.size0[i] = this.size0[j]; this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.grow[i] = this.grow[j];
  }
  clear() { this.n = 0; this.mesh.geometry.instanceCount = 0; }
}

// 剣の軌跡
class Trail {
  constructor(scene) {
    this.N = 18;
    this.samples = [];
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.N * 2 * 3);
    this.colArr = new Float32Array(this.N * 2 * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colArr, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.color = new THREE.Color(0xfff2c8);
  }
  push(a, b, color) {
    this.samples.unshift({ a: a.clone(), b: b.clone(), age: 0 });
    if (color !== undefined) this.color.set(color);
    if (this.samples.length > this.N) this.samples.pop();
  }
  update(dt) {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[this.samples.length - 1].age > 0.16) this.samples.pop();
    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i], a = Math.max(0, 1 - s.age / 0.16) * (1 - i / this.N) * 0.55;
      this.posArr.set([s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z], i * 6);
      this.colArr.set([this.color.r, this.color.g, this.color.b, a * 0.25, this.color.r, this.color.g, this.color.b, a], i * 8);
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, Math.max(0, (n - 1) * 6));
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, camera, overlayEl) {
    this.scene = scene; this.camera = camera;
    this.add = new ParticleSystem(scene, 2500, true);
    this.norm = new ParticleSystem(scene, 2500, false);
    this.trail = new Trail(scene);
    this.rings = [];
    this.floaters = [];
    this.overlay = overlayEl;
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'screen-flash';
    overlayEl.appendChild(this.flashEl);
    this.flashA = 0;
    this.floatLayer = document.createElement('div');
    this.floatLayer.className = 'float-layer';
    overlayEl.appendChild(this.floatLayer);
    this.showNumbers = true;
  }

  resize(h, fov) {
    const s = h * 0.5 / Math.tan(THREE.MathUtils.degToRad(fov) / 2) * 0.1;
    this.add.uScale.value = s; this.norm.uScale.value = s;
  }

  // 火花：飛ぶ向きに伸びる光の筋
  sparks(p, n, color = 0xffc070, speed = 7) {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, 6.283), b = rng.range(-0.4, 1.2), s = rng.range(0.4, 1) * speed;
      this.add.spawn(p.x, p.y, p.z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 1.5, Math.sin(a) * Math.cos(b) * s, color, rng.range(1.4, 2.8), rng.range(0.2, 0.45), 14, 3, 0, { frame: FRAME.streak, stretch: 0.2 });
    }
  }
  glow(p, color, size, life = 0.12) { this.add.spawn(p.x, p.y, p.z, 0, 0, 0, color, size, life, 0, 0, 0.7, { frame: FRAME.glow, rot: 0 }); }
  // 命中：閃光＋火花の筋＋（やわらかい所は）赤いしぶき
  hitBurst(p, soft, heavy) {
    const n = heavy ? 30 : 18;
    this.glow(p, soft ? 0xffb070 : 0xfff4e0, heavy ? 13 : 8, heavy ? 0.13 : 0.09);
    this.sparks(p, soft ? n : Math.floor(n * 0.6), soft ? 0xff9a40 : 0xfff0b0, soft ? 9 : 7);
    for (let i = 0; i < (soft ? 14 : 4); i++) {
      this.norm.spawn(p.x, p.y, p.z, rng.range(-3, 3), rng.range(0, 4.5), rng.range(-3, 3), soft ? 0x7a1612 : 0x8a8680, rng.range(1.6, 3.6), rng.range(0.3, 0.55), 10, 3, 0.6, { frame: FRAME.glow });
    }
    this.ring(p, heavy ? 2.4 : 1.4, soft ? 0xffb060 : 0xffffff, 0.16, true);
  }
  bounce(p) { this.glow(p, 0xffffff, 7, 0.08); this.sparks(p, 24, 0xfff6b0, 10); this.ring(p, 1.0, 0xffffff, 0.12, true); }
  dust(p, n = 8, spread = 1.5, color = 0xa8946f) {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, 6.283), s = rng.range(0.5, 1.6) * spread;
      this.norm.spawn(p.x + Math.cos(a) * 0.3, p.y + 0.2, p.z + Math.sin(a) * 0.3, Math.cos(a) * s, rng.range(0.5, 1.6), Math.sin(a) * s, color, rng.range(8, 14), rng.range(0.7, 1.3), -0.3, 2.2, 1.7, { frame: FRAME.smoke, spin: rng.range(-1, 1) });
    }
  }
  bigDust(p, radius) {
    for (let i = 0; i < 46; i++) {
      const a = rng.range(0, 6.283), r = rng.range(0, radius);
      this.norm.spawn(p.x + Math.cos(a) * r, p.y + 0.3, p.z + Math.sin(a) * r, Math.cos(a) * 4.5, rng.range(0.8, 2.8), Math.sin(a) * 4.5, 0x9c8a6c, rng.range(18, 32), rng.range(0.9, 1.7), -0.2, 1.8, 1.5, { frame: FRAME.smoke, spin: rng.range(-0.8, 0.8) });
    }
    for (let i = 0; i < 14; i++) {   // 小石
      const a = rng.range(0, 6.283), sp = rng.range(3, 8);
      this.norm.spawn(p.x, p.y + 0.2, p.z, Math.cos(a) * sp, rng.range(3, 8), Math.sin(a) * sp, 0x5a5046, rng.range(1.2, 2.4), rng.range(0.6, 1.1), 16, 0.5, 0, { frame: FRAME.glow });
    }
    this.ring(p, radius * 1.6, 0xd8c8a8, 0.35, false);
  }
  fire(p, n = 3, spread = 0.4) {
    for (let i = 0; i < n; i++) {
      const col = [0xff7a22, 0xffb040, 0xff4a14][rng.int(0, 2)];
      this.add.spawn(p.x + rng.range(-spread, spread), p.y + rng.range(-spread, spread), p.z + rng.range(-spread, spread),
        rng.range(-0.7, 0.7), rng.range(0.8, 2.4), rng.range(-0.7, 0.7), col, rng.range(7, 13), rng.range(0.25, 0.5), -1.5, 1, -0.5, { frame: FRAME.flame, rot: rng.range(-0.5, 0.5), spin: rng.range(-2, 2) });
    }
    if (rng.chance(0.35)) this.add.spawn(p.x, p.y, p.z, rng.range(-1.5, 1.5), rng.range(1.5, 4), rng.range(-1.5, 1.5), 0xffc060, rng.range(0.6, 1.2), rng.range(0.5, 1.1), -1, 0.6, 0, { frame: FRAME.streak, stretch: 0.25 });
  }
  smoke(p, n = 2, color = 0x4a4642) {
    for (let i = 0; i < n; i++) this.norm.spawn(p.x + rng.range(-0.3, 0.3), p.y, p.z + rng.range(-0.3, 0.3), rng.range(-0.3, 0.3), rng.range(0.8, 1.6), rng.range(-0.3, 0.3), color, rng.range(8, 14), rng.range(1.0, 1.8), -0.4, 0.8, 2.4, { frame: FRAME.smoke, spin: rng.range(-0.7, 0.7) });
  }
  explosion(p, r = 2.5) {
    this.glow(p, 0xffc070, 30, 0.18);
    for (let i = 0; i < 46; i++) {
      const a = rng.range(0, 6.283), b = rng.range(-0.2, 1.3), s = rng.range(2, 8);
      this.add.spawn(p.x, p.y, p.z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s, Math.sin(a) * Math.cos(b) * s, rng.chance(0.5) ? 0xff6a1a : 0xffb030, rng.range(12, 24), rng.range(0.3, 0.7), 2, 3, 1, { frame: FRAME.flame, spin: rng.range(-3, 3) });
    }
    this.sparks(p, 26, 0xffd080, 13);
    this.smoke(p, 14);
    this.ring(p, r * 1.8, 0xffa040, 0.3, true);
    this.decal(p, r * 1.1);
  }
  drool(p) { this.norm.spawn(p.x, p.y, p.z, rng.range(-0.2, 0.2), -0.5, rng.range(-0.2, 0.2), 0xd8e6e8, rng.range(1.4, 2.4), 0.9, 9, 0.5, 0, { frame: FRAME.glow }); }
  steam(p, dir) { this.norm.spawn(p.x, p.y, p.z, dir.x * 3 + rng.range(-0.4, 0.4), dir.y * 3 + 0.8, dir.z * 3 + rng.range(-0.4, 0.4), 0xf0e0d8, rng.range(5, 8), 0.7, -0.5, 2.5, 2.6, { frame: FRAME.smoke, spin: rng.range(-1, 1) }); }
  electric(p, r) {
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, 6.283);
      this.add.spawn(p.x + Math.cos(a) * r * rng.next(), p.y + rng.range(0, 2.5), p.z + Math.sin(a) * r * rng.next(), rng.range(-5, 5), rng.range(-2, 5), rng.range(-5, 5), rng.chance(0.5) ? 0x9fd8ff : 0xffffff, rng.range(2, 4), rng.range(0.08, 0.2), 0, 4, 0, { frame: FRAME.streak, stretch: 0.3 });
    }
  }
  chargeFlash(h, lv) {
    const p = _v.copy(h.blade.a).lerp(h.blade.b, 0.5);
    const col = lv === 3 ? 0xff6a30 : lv === 2 ? 0xffd040 : 0xfff4c0;
    this.glow(p, col, 6 + lv * 3.5, 0.16);
    for (let i = 0; i < 10 + lv * 8; i++) {
      const a = rng.range(0, 6.283), s = rng.range(2, 5);
      this.add.spawn(p.x, p.y, p.z, Math.cos(a) * s, rng.range(-1, 3), Math.sin(a) * s, col, rng.range(1.6, 3), 0.35, 0, 5, 0, { frame: FRAME.streak, stretch: 0.25 });
    }
    this.ring(p, 1.2 + lv * 0.5, col, 0.2, true);
  }
  // 溜めている間、足もとから光の粒が立ちのぼる
  chargeAura(pos, lv) {
    const col = lv >= 3 ? 0xff7a40 : lv === 2 ? 0xffd050 : 0xfff0b0;
    const a = rng.range(0, 6.283), r = rng.range(0.3, 0.9);
    this.add.spawn(pos.x + Math.cos(a) * r, pos.y + 0.1, pos.z + Math.sin(a) * r, 0, rng.range(1.5, 3.5), 0, col, rng.range(0.8, 1.6), rng.range(0.4, 0.8), -1, 0.5, 0, { frame: FRAME.streak, stretch: 0.3 });
  }
  // 空中をただよう光のちり（雰囲気づくり）
  ambient(cam, dt) {
    this.ambT = (this.ambT || 0) - dt;
    if (this.ambT > 0) return;
    this.ambT = 0.09;
    const a = rng.range(0, 6.283), r = rng.range(2, 14);
    this.add.spawn(cam.x + Math.cos(a) * r, cam.y + rng.range(-2.5, 2), cam.z + Math.sin(a) * r, rng.range(-0.25, 0.25), rng.range(-0.05, 0.2), rng.range(-0.25, 0.25), 0x8a8658, rng.range(0.4, 0.9), rng.range(3, 6), 0, 0.1, 0, { frame: FRAME.glow });
  }
  // 水しぶき
  splash(p) {
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, 6.283), s = rng.range(0.8, 2.2);
      this.norm.spawn(p.x, p.y + 0.05, p.z, Math.cos(a) * s, rng.range(1.5, 3.2), Math.sin(a) * s, 0xdcecf2, rng.range(0.8, 1.6), rng.range(0.3, 0.5), 9, 0.5, 0, { frame: FRAME.glow });
    }
    this.ring(p, 1.3, 0xe8f4f8, 0.45, false);
  }
  // 地面の焦げ跡（しばらくすると消える）
  decal(p, r) {
    if (!this.decalTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const g = cv.getContext('2d'), grd = g.createRadialGradient(64, 64, 6, 64, 64, 64);
      grd.addColorStop(0, 'rgba(8,6,5,0.9)'); grd.addColorStop(0.6, 'rgba(20,14,10,0.55)'); grd.addColorStop(1, 'rgba(20,14,10,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      this.decalTex = new THREE.CanvasTexture(cv);
      this.decals = [];
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.06, p.z); m.scale.setScalar(r * 2); m.renderOrder = 1;
    this.scene.add(m);
    this.decals.push({ m, t: 0 });
    if (this.decals.length > 8) { const o = this.decals.shift(); this.scene.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); }
  }
  ring(p, size, color, dur, additive) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.position.copy(p);
    if (additive) m.lookAt(this.camera.position); else m.rotation.x = -Math.PI / 2;
    m.renderOrder = 7;
    this.scene.add(m);
    this.rings.push({ m, t: 0, dur, size });
  }
  roarWave(p) {
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.BackSide }));
      m.position.copy(p);
      this.scene.add(m);
      this.rings.push({ m, t: -k * 0.25, dur: 0.7, size: 16, sphere: true });
    }
  }
  swordTrail(h, color) { this.trail.push(h.blade.a, h.blade.b, color); }

  number(p, value, crit) {
    if (!this.showNumbers) return;
    this.floatText(p, String(Math.round(value)), crit ? 'dmg crit' : 'dmg');
  }
  floatText(p, text, cls, dur = 0.9) {
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    this.floatLayer.appendChild(el);
    this.floaters.push({ el, p: p.clone(), t: 0, dur, dx: rng.range(-20, 20) });
  }
  flash(a = 0.9) { this.flashA = Math.max(this.flashA, a); }

  update(dt, w, h) {
    this.add.update(dt); this.norm.update(dt); this.trail.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t < 0) { r.m.visible = false; continue; }
      r.m.visible = true;
      const u = r.t / r.dur;
      if (u >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); continue; }
      const s = lerp(0.3, r.size, 1 - (1 - u) * (1 - u));
      r.m.scale.set(s, s, s);
      r.m.material.opacity = (r.sphere ? 0.22 : 0.8) * (1 - u);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= f.dur) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      _v.copy(f.p); _v.y += f.t * 1.2;
      _v.project(this.camera);
      if (_v.z > 1) { f.el.style.display = 'none'; continue; }
      f.el.style.display = '';
      const x = (_v.x * 0.5 + 0.5) * w + f.dx * f.t, y = (-_v.y * 0.5 + 0.5) * h;
      f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(clamp(2.5 * (1 - f.t / f.dur), 0, 1));
    }
    if (this.decals) for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]; d.t += dt;
      d.m.material.opacity = Math.max(0, 1 - Math.max(0, d.t - 8) / 6);
      if (d.t > 14) { this.scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); this.decals.splice(i, 1); }
    }
    if (this.flashA > 0) { this.flashA = Math.max(0, this.flashA - dt * 1.6); }
    this.flashEl.style.opacity = this.flashA.toFixed(3);
  }

  clear() {
    this.add.clear(); this.norm.clear();
    if (this.decals) { for (const d of this.decals) this.scene.remove(d.m); this.decals.length = 0; }
    for (const r of this.rings) this.scene.remove(r.m);
    this.rings.length = 0;
    for (const f of this.floaters) f.el.remove();
    this.floaters.length = 0;
    this.trail.samples.length = 0;
  }
}
