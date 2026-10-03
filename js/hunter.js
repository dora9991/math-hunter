// ハンター（プレイヤー）：見た目・ポーズ・状態遷移・移動・被弾
import * as THREE from 'three';
import { HUNTER, SHARPNESS, SHARPNESS_MAX } from './config.js';
import { clamp, lerp, damp, dampAngle, wrapAngle, smooth, track, TAU, approach } from './util.js';
import { joint, part, limb, solveIK2, setWorldQuat, swordQuat } from './rig.js';
import { GS, drawnIdlePose, stance, chargePose, CHARGE, chargeLevel, chargeMv, GREATSWORD, WEAPONS, LONGSWORD } from './weapons.js';
import { CREATURES } from './assets.js';

// ポーズのチャンネル
const CH = ['rootY', 'pitch', 'yawOff', 'hipsX', 'hipsY', 'hipsZ', 'spineX', 'spineY', 'chestX', 'chestY', 'chestZ', 'headX', 'headY',
  'thighLX', 'thighLZ', 'shinL', 'footL', 'thighRX', 'thighRZ', 'shinR', 'footR',
  'uArmLX', 'uArmLZ', 'fArmL', 'uArmRX', 'uArmRZ', 'fArmR',
  'gripX', 'gripY', 'gripZ', 'bladeX', 'bladeY', 'bladeZ', 'edgeX', 'edgeY', 'edgeZ', 'ik', 'onBack', 'knife'];
export const I = Object.fromEntries(CH.map((n, i) => [n, i]));
const NCH = CH.length;
const STEP_CH = [I.ik, I.onBack, I.knife]; // 補間しないチャンネル

function restPose(p) {
  p.fill(0);
  p[I.uArmLZ] = 0.12; p[I.uArmRZ] = -0.12; p[I.fArmL] = -0.25; p[I.fArmR] = -0.25;
  p[I.bladeY] = 1; p[I.edgeZ] = 1; p[I.onBack] = 1;
  return p;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _g2 = { x: 0, y: 0 };
const _q = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const _pR = new THREE.Vector3(), _pL = new THREE.Vector3(), _grip = new THREE.Vector3(), _bl = new THREE.Vector3();
const _fk = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];

export class Hunter {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.maxHp = HUNTER.maxHp;
    this.pose = restPose(new Float32Array(NCH));
    this.target = restPose(new Float32Array(NCH));
    this.from = restPose(new Float32Array(NCH));
    this.blendT = 1; this.blendDur = 0.12;
    this.blade = { a: new THREE.Vector3(), b: new THREE.Vector3(), pa: new THREE.Vector3(), pb: new THREE.Vector3(), ok: false };
    this.W = WEAPONS.gs;
    this.buildModel();
    this.setWeapon('gs');
    this.reset();
  }

  reset() {
    this.hp = HUNTER.maxHp; this.red = 0; this.regenDelay = 0;
    this.stamina = HUNTER.maxStamina; this.staminaDelay = 0; this.exhaustLock = false;
    this.sharp = SHARPNESS_MAX;
    this.drawn = false;
    this.state = 'free'; this.t = 0;
    this.speedNow = 0; this.runPhase = 0; this.sprinting = false;
    this.move = null; this.motionPrev = 0; this.buffer = null; this.bufferT = 0;
    this.chargeT = 0; this.chargeLv = 0;
    this.invuln = false; this.iframe = 0; this.hitstop = 0;
    this.swingId = 0; this.swingHit = false; this.attackActive = false;
    this.item = null; this.then = null;
    this.knockDir = new THREE.Vector3();
    this.stunTime = 0;
    this.inWater = false;
    this.god = false;
    this.lastHitBy = new Map();
    this.blade.ok = false;
    this.spirit = 0; this.spiritIdle = 0; this.winIdx = -1;
    this.moveMul = 1;
  }

  // 武器の持ち替え（拠点の装備画面から）
  setWeapon(id) {
    this.W = WEAPONS[id] || WEAPONS.gs;
    for (const [k, g] of Object.entries(this.swords)) g.visible = k === this.W.id;
    const back = this.J.back;
    if (this.sword && this.sword.parent) this.sword.parent.remove(this.sword);
    this.sword = this.swords[this.W.id];
    this.swordGlow = this.glows[this.W.id];
    back.add(this.sword);
    this.blade.ok = false;
  }
  get spiritFull() { return this.W.id === 'ls' && this.spirit >= 99.5; }

  // ---------------- 見た目 ----------------
  buildModel() {
    const M = {
      steel: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.36, flatShading: true }),
      dark: new THREE.MeshStandardMaterial({ color: 0x3b3f46, metalness: 0.6, roughness: 0.45, flatShading: true }),
      leather: new THREE.MeshStandardMaterial({ color: 0x4d3627, roughness: 0.85, flatShading: true }),
      cloth: new THREE.MeshStandardMaterial({ color: 0x2b4a70, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc9a54a, metalness: 0.8, roughness: 0.35, flatShading: true }),
      skin: new THREE.MeshStandardMaterial({ color: 0xdcae88, roughness: 0.7 }),
      plume: new THREE.MeshStandardMaterial({ color: 0xb3302a, roughness: 0.8, flatShading: true }),
      blade: new THREE.MeshStandardMaterial({ color: 0xc3cad2, metalness: 0.9, roughness: 0.22, flatShading: true }),
      bladeDark: new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.8, roughness: 0.4 }),
    };
    this.M = M;
    const root = new THREE.Group(); root.name = 'hunter';
    this.root = root;
    const J = {};
    this.J = J;
    if (CREATURES.hunter) this._bodySkinned(CREATURES.hunter, root, J);
    else this._bodyProcedural(root, J, M);
    this._weapons(root, J, M);
  }

  // Blender で作った体（骨の位置と向きは、下の手作りの関節と同じ）
  _bodySkinned(gltf, root, J) {
    this.skinned = true;
    root.add(gltf.scene);
    for (const n of ['pivot', 'hips', 'spine', 'chest', 'neck', 'head', 'back', 'uArmR', 'fArmR', 'handR', 'uArmL', 'fArmL', 'handL', 'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL']) {
      J[n] = gltf.scene.getObjectByName(n);
      if (!J[n]) throw new Error('骨が見つかりません: ' + n);
    }
    J.pivot.rotation.order = 'YXZ';
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.material.envMapIntensity = 0.9;
    });
  }

  _bodyProcedural(root, J, M) {
    J.pivot = joint('pivot', root, 0, 0.95, 0); J.pivot.rotation.order = 'YXZ';
    J.hips = joint('hips', J.pivot);
    J.spine = joint('spine', J.hips, 0, 0.12, 0);
    J.chest = joint('chest', J.spine, 0, 0.22, 0);
    J.neck = joint('neck', J.chest, 0, 0.28, 0);
    J.head = joint('head', J.neck, 0, 0.08, 0);
    J.uArmR = joint('uArmR', J.chest, -0.2, 0.2, 0);
    J.fArmR = joint('fArmR', J.uArmR, 0, -0.32, 0);
    J.handR = joint('handR', J.fArmR, 0, -0.3, 0);
    J.uArmL = joint('uArmL', J.chest, 0.2, 0.2, 0);
    J.fArmL = joint('fArmL', J.uArmL, 0, -0.32, 0);
    J.handL = joint('handL', J.fArmL, 0, -0.3, 0);
    J.thighR = joint('thighR', J.hips, -0.1, -0.02, 0);
    J.shinR = joint('shinR', J.thighR, 0, -0.44, 0);
    J.footR = joint('footR', J.shinR, 0, -0.44, 0);
    J.thighL = joint('thighL', J.hips, 0.1, -0.02, 0);
    J.shinL = joint('shinL', J.thighL, 0, -0.44, 0);
    J.footL = joint('footL', J.shinL, 0, -0.44, 0);
    J.back = joint('back', J.chest, 0, 0.0, -0.19);

    // 胴体
    part(J.hips, new THREE.BoxGeometry(0.34, 0.16, 0.22), M.leather, 0, 0.02, 0);
    part(J.hips, new THREE.BoxGeometry(0.37, 0.07, 0.25), M.gold, 0, 0.1, 0);                 // ベルト
    part(J.hips, new THREE.BoxGeometry(0.26, 0.34, 0.03), M.cloth, 0, -0.14, 0.12, 0.08);    // 前垂れ
    part(J.hips, new THREE.BoxGeometry(0.3, 0.38, 0.03), M.cloth, 0, -0.15, -0.12, -0.08);   // 後ろ垂れ
    part(J.spine, new THREE.BoxGeometry(0.3, 0.2, 0.2), M.leather, 0, 0.1, 0);
    part(J.chest, new THREE.BoxGeometry(0.42, 0.34, 0.26), M.steel, 0, 0.12, 0.01);          // 胸当て
    part(J.chest, new THREE.BoxGeometry(0.2, 0.2, 0.05), M.gold, 0, 0.14, 0.14);              // 胸の紋章
    for (const s of [-1, 1]) {
      const pad = part(J.chest, new THREE.SphereGeometry(0.13, 8, 6, 0, TAU, 0, Math.PI * 0.55), M.steel, s * 0.25, 0.24, 0, 0, 0, s * 0.35);
      pad.scale.set(1.1, 0.9, 1.05);
    }
    // 頭
    part(J.head, new THREE.SphereGeometry(0.12, 12, 10), M.skin, 0, 0.1, 0.01);
    const helm = part(J.head, new THREE.SphereGeometry(0.145, 12, 9, 0, TAU, 0, Math.PI * 0.62), M.steel, 0, 0.1, 0);
    helm.scale.set(1, 1.08, 1.1);
    part(J.head, new THREE.BoxGeometry(0.25, 0.035, 0.05), M.dark, 0, 0.1, 0.13);            // 目のすき間
    part(J.head, new THREE.BoxGeometry(0.035, 0.1, 0.3), M.plume, 0, 0.27, -0.03);            // とさか
    part(J.head, new THREE.ConeGeometry(0.035, 0.22, 5), M.plume, 0, 0.2, -0.2, -1.2);
    // 腕
    for (const s of ['R', 'L']) {
      limb(J['uArm' + s], 0.055, 0.3, M.leather, 0.05);
      limb(J['fArm' + s], 0.05, 0.27, M.leather, 0.045);
      const g = part(J['fArm' + s], new THREE.CylinderGeometry(0.065, 0.058, 0.17, 7), M.steel, 0, -0.18, 0);
      g.castShadow = true;
      part(J['hand' + s], new THREE.BoxGeometry(0.085, 0.1, 0.08), M.dark, 0, -0.03, 0);
      limb(J['thigh' + s], 0.075, 0.42, M.leather, 0.066);
      limb(J['shin' + s], 0.066, 0.4, M.leather, 0.055);
      part(J['shin' + s], new THREE.CylinderGeometry(0.085, 0.07, 0.3, 7), M.steel, 0, -0.2, 0.012);
      part(J['foot' + s], new THREE.BoxGeometry(0.11, 0.085, 0.25), M.dark, 0, -0.03, 0.06);
    }

  }

  _weapons(root, J, M) {
    // 大剣
    const sword = new THREE.Group(); sword.name = 'sword';
    const L = GREATSWORD.bladeLen, W = 0.3;
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, L - 0.2); sh.lineTo(0.03, L); sh.lineTo(-W / 2, L - 0.1); sh.closePath();
    const bgeo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
    bgeo.translate(0, 0, -0.02);
    part(sword, bgeo, M.blade, 0, 0.05, 0);
    part(sword, new THREE.BoxGeometry(0.05, L * 0.72, 0.07), M.bladeDark, 0, 0.08 + L * 0.36, 0);
    part(sword, new THREE.BoxGeometry(0.48, 0.09, 0.12), M.gold, 0, 0.02, 0);
    part(sword, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 7), M.leather, 0, -0.2, 0);
    part(sword, new THREE.IcosahedronGeometry(0.055, 0), M.gold, 0, -0.42, 0);
    const gsGlow = part(sword, new THREE.BoxGeometry(W * 1.15, L * 1.02, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.05 + L * 0.5, 0);
    gsGlow.castShadow = false;
    // 太刀（細く長い刀）
    const ls = new THREE.Group(); ls.name = 'longsword';
    const LL = LONGSWORD.bladeLen;
    const ksh = new THREE.Shape();
    ksh.moveTo(-0.035, 0); ksh.lineTo(0.035, 0); ksh.quadraticCurveTo(0.05, LL * 0.6, 0.012, LL); ksh.lineTo(-0.03, LL - 0.12); ksh.quadraticCurveTo(-0.02, LL * 0.5, -0.035, 0);
    const kgeo = new THREE.ExtrudeGeometry(ksh, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
    kgeo.translate(0, 0, -0.007);
    part(ls, kgeo, M.blade, 0, 0.04, 0);
    part(ls, new THREE.CylinderGeometry(0.075, 0.075, 0.025, 12), M.gold, 0, 0.02, 0);                      // つば
    part(ls, new THREE.CylinderGeometry(0.024, 0.026, 0.42, 7), new THREE.MeshStandardMaterial({ color: 0x23202a, roughness: 0.8 }), 0, -0.21, 0);
    part(ls, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 7), M.gold, 0, -0.43, 0);
    const lsGlow = part(ls, new THREE.BoxGeometry(0.16, LL * 1.02, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xfff0e0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.04 + LL * 0.5, 0);
    lsGlow.castShadow = false;
    this.swords = { gs: sword, ls };
    this.glows = { gs: gsGlow, ls: lsGlow };
    this.sword = null;
    // はぎ取り用ナイフ
    const knife = new THREE.Group();
    part(knife, new THREE.BoxGeometry(0.03, 0.25, 0.012), M.blade, 0, -0.16, 0.0);
    part(knife, new THREE.BoxGeometry(0.035, 0.09, 0.035), M.leather, 0, -0.02, 0);
    knife.visible = false;
    J.handR.add(knife);
    this.knife = knife;

    root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    gsGlow.castShadow = false; lsGlow.castShadow = false;
    ls.traverse(o => { if (o.isMesh && o !== lsGlow) o.castShadow = true; });
  }

  // ---------------- ポーズ ----------------
  _computeTarget(p, dt) {
    restPose(p);
    const st = this.state, t = this.t;
    switch (st) {
      case 'free': this._locoPose(p, false); break;
      case 'drawn': this._locoPose(p, true); break;
      case 'attack': this.move.pose(p, I, t); break;
      case 'charge': chargePose(p, I, this.chargeT, Math.min(this.chargeLv, 3)); break;
      case 'guard': case 'guardHit': this._guardPose(p); break;
      case 'roll': this._rollPose(p); break;
      case 'draw': this._drawPose(p); break;
      case 'sheathe': this._sheathePose(p); break;
      case 'item': this._itemPose(p); break;
      case 'flinch': this._flinchPose(p); break;
      case 'knock': this._knockPose(p); break;
      case 'stun': this._stunPose(p); break;
      case 'stagger': this._staggerPose(p); break;
      case 'exhausted': this._exhaustPose(p); break;
      case 'dead': this._deadPose(p); break;
      case 'carve': case 'gather': this._carvePose(p); break;
      case 'bounce': this._bouncePose(p); break;
      case 'victory': this._victoryPose(p); break;
    }
  }

  _locoPose(p, drawn) {
    const sp = this.speedNow, ph = this.runPhase;
    const k = clamp(sp / HUNTER.runSpeed, 0, 1.5);
    const time = this.game.time;
    if (drawn) {
      this.W.idle(p, I, time);
      if (sp > 0.1) {
        const a = 0.45 * Math.min(1, sp / HUNTER.drawnSpeed);
        p[I.thighLX] += -Math.sin(ph) * a; p[I.thighRX] += Math.sin(ph) * a;
        p[I.shinL] += Math.max(0, Math.cos(ph)) * a * 1.4; p[I.shinR] += Math.max(0, -Math.cos(ph)) * a * 1.4;
        p[I.rootY] += Math.cos(ph * 2) * 0.02;
        p[I.chestY] += Math.sin(ph) * 0.05;
      }
      return;
    }
    // 納刀
    p[I.rootY] = -0.01 + Math.sin(time * 2) * 0.006;
    if (sp > 0.1) {
      const sprint = this.sprinting;
      const A = sprint ? 0.95 : 0.75 * Math.min(1, k + 0.2);
      p[I.thighLX] = -Math.sin(ph) * A; p[I.thighRX] = Math.sin(ph) * A;
      p[I.shinL] = 0.15 + Math.max(0, Math.cos(ph)) * A * 1.5;
      p[I.shinR] = 0.15 + Math.max(0, -Math.cos(ph)) * A * 1.5;
      p[I.footL] = -0.1 + Math.sin(ph) * 0.2; p[I.footR] = -0.1 - Math.sin(ph) * 0.2;
      p[I.rootY] = -0.03 + Math.cos(ph * 2) * 0.035;
      p[I.spineX] = sprint ? 0.24 : 0.12;
      p[I.chestY] = Math.sin(ph) * 0.18; p[I.hipsY] = -Math.sin(ph) * 0.12;
      const C = sprint ? 0.9 : 0.7;
      p[I.uArmLX] = Math.sin(ph) * C; p[I.uArmRX] = -Math.sin(ph) * C;
      p[I.fArmL] = -1.25; p[I.fArmR] = -1.25;
      p[I.uArmLZ] = 0.15; p[I.uArmRZ] = -0.15;
      p[I.headX] = -p[I.spineX] * 0.6;
      // 曲がるときは内側へ、加速では前へ、減速では後ろへ体を傾ける
      const tl = clamp((this.turnVel || 0) * 0.045, -0.22, 0.22);
      p[I.hipsZ] = -tl; p[I.chestZ] = -tl * 0.6; p[I.headY] = tl * 0.8;
      p[I.spineX] += clamp((this.accel || 0) * 0.012, -0.1, 0.14);
    } else {
      // 立ち止まっているとき：呼吸と、ゆっくりした体重移動
      p[I.chestX] = Math.sin(time * 1.7) * 0.025; p[I.hipsZ] = Math.sin(time * 0.6) * 0.03; p[I.chestZ] = -Math.sin(time * 0.6) * 0.02;
      p[I.uArmLZ] = 0.12 + Math.sin(time * 1.7) * 0.02; p[I.uArmRZ] = -0.12 - Math.sin(time * 1.7) * 0.02;
    }
  }
  _guardPose(p) {
    p[I.ik] = 1; p[I.onBack] = 0;
    p[I.gripX] = 0.0; p[I.gripY] = 0.07; p[I.gripZ] = 0.36;
    p[I.bladeX] = 0.22; p[I.bladeY] = 0.975; p[I.bladeZ] = 0.02;
    p[I.edgeX] = 0.975; p[I.edgeY] = -0.22; p[I.edgeZ] = 0;
    p[I.rootY] = -0.14; p[I.chestX] = 0.12;
    p[I.thighLX] = -0.6; p[I.shinL] = 0.7; p[I.thighRX] = 0.3; p[I.shinR] = 0.5; p[I.thighLZ] = 0.15; p[I.thighRZ] = -0.15;
    if (this.state === 'guardHit') { const s = Math.max(0, 1 - this.t / 0.3); p[I.chestX] -= s * 0.25; p[I.rootY] -= s * 0.06; }
  }
  _rollPose(p) {
    const u = clamp(this.t / 0.46, 0, 1);
    const tuck = Math.sin(Math.min(1, this.t / 0.5) * Math.PI);
    p[I.pitch] = smooth(u) * TAU;
    p[I.rootY] = -0.45 * tuck;
    p[I.thighLX] = -1.9 * tuck; p[I.thighRX] = -1.7 * tuck; p[I.shinL] = 2.3 * tuck; p[I.shinR] = 2.2 * tuck;
    p[I.spineX] = 0.5 * tuck; p[I.chestX] = 0.4 * tuck; p[I.headX] = 0.5 * tuck;
    if (this.drawn) {
      this.W.stance(p, I); p[I.ik] = 1; p[I.onBack] = 0;
    } else {
      p[I.uArmLX] = -1.2 * tuck; p[I.uArmRX] = -1.2 * tuck; p[I.fArmL] = -1.8 * tuck; p[I.fArmR] = -1.8 * tuck;
    }
  }
  _drawPose(p) {
    const t = this.t;
    if (t < 0.22) {
      const u = smooth(t / 0.22);
      p[I.uArmRX] = lerp(-0.2, -2.7, u); p[I.uArmRZ] = -0.3 * u; p[I.fArmR] = lerp(-0.3, -1.2, u);
      p[I.uArmLX] = lerp(-0.2, -2.2, u); p[I.uArmLZ] = 0.1 + 0.4 * u; p[I.fArmL] = lerp(-0.3, -1.4, u);
    } else { this.W.idle(p, I, this.game.time); }
    this._walkLegs(p, 0.3);
  }
  _sheathePose(p) {
    const t = this.t;
    if (t < 0.38) {
      this.W.idle(p, I, this.game.time);
      const u = smooth(t / 0.38);
      p[I.gripY] = lerp(p[I.gripY], 0.5, u); p[I.gripX] = lerp(p[I.gripX], -0.12, u); p[I.gripZ] = lerp(p[I.gripZ], -0.05, u);
      p[I.bladeX] = lerp(p[I.bladeX], 0.3, u); p[I.bladeY] = lerp(p[I.bladeY], -0.95, u); p[I.bladeZ] = lerp(p[I.bladeZ], -0.1, u);
    } else {
      const u = smooth((t - 0.38) / 0.3);
      p[I.uArmRX] = lerp(-2.6, -0.2, u); p[I.fArmR] = lerp(-1.2, -0.3, u); p[I.uArmRZ] = -0.12;
    }
    this._walkLegs(p, 0.35);
  }
  _walkLegs(p, a) {
    if (this.speedNow < 0.1) return;
    const ph = this.runPhase;
    p[I.thighLX] += -Math.sin(ph) * a; p[I.thighRX] += Math.sin(ph) * a;
    p[I.shinL] += Math.max(0, Math.cos(ph)) * a * 1.3; p[I.shinR] += Math.max(0, -Math.cos(ph)) * a * 1.3;
  }
  _itemPose(p) {
    const it = this.item, t = this.t;
    if (!it) return;
    if (it.kind === 'drink') {
      if (t < it.flexAt) {
        const u = smooth(Math.min(1, t / 0.3));
        p[I.uArmRX] = -1.4 * u; p[I.uArmRZ] = -0.35 * u; p[I.fArmR] = -2.3 * u;
        p[I.headX] = -0.45 * smooth(clamp((t - 0.3) / 0.3, 0, 1));
        p[I.chestX] = -0.1 * u;
        this._walkLegs(p, 0.25);
      } else {
        // 飲んだあとのガッツポーズ
        const u = smooth(Math.min(1, (t - it.flexAt) / 0.2));
        p[I.uArmLX] = -0.35 * u; p[I.uArmRX] = -0.35 * u;
        p[I.uArmLZ] = 1.35 * u; p[I.uArmRZ] = -1.35 * u;
        p[I.fArmL] = -2.1 * u; p[I.fArmR] = -2.1 * u;
        p[I.chestX] = -0.15 * u; p[I.headX] = -0.2 * u; p[I.rootY] = -0.06 * u;
        p[I.thighLZ] = 0.15 * u; p[I.thighRZ] = -0.15 * u;
      }
    } else if (it.kind === 'whet') {
      const kneel = smooth(Math.min(1, t / 0.3));
      p[I.rootY] = -0.42 * kneel;
      p[I.thighLX] = -1.3 * kneel; p[I.shinL] = 1.35 * kneel; p[I.footL] = -0.05;
      p[I.thighRX] = 0.2 * kneel; p[I.shinR] = 1.9 * kneel; p[I.footR] = -0.4 * kneel;
      p[I.chestX] = 0.35 * kneel; p[I.headX] = 0.25 * kneel;
      p[I.onBack] = 1;
      const stroke = Math.sin(t * 9) * 0.35 * kneel;
      p[I.uArmRX] = -0.9 * kneel + stroke; p[I.fArmR] = -1.2 * kneel;
      p[I.uArmLX] = -0.9 * kneel; p[I.uArmLZ] = 0.3 * kneel; p[I.fArmL] = -1.3 * kneel;
    } else if (it.kind === 'throw') {
      const w = smooth(Math.min(1, t / 0.28)), f = smooth(clamp((t - 0.28) / 0.14, 0, 1));
      p[I.uArmRX] = lerp(0, 1.0, w) + lerp(0, -2.4, f); p[I.fArmR] = -0.9 * w + 0.6 * f; p[I.uArmRZ] = -0.25;
      p[I.chestY] = -0.4 * w + 0.7 * f; p[I.chestX] = 0.15 * f;
      p[I.thighLX] = -0.4; p[I.shinL] = 0.3; p[I.thighRX] = 0.3;
    } else if (it.kind === 'trap') {
      const c = smooth(Math.min(1, t / 0.35)) * (1 - smooth(clamp((t - 1.1) / 0.3, 0, 1)));
      p[I.rootY] = -0.45 * c; p[I.thighLX] = -1.4 * c; p[I.shinL] = 1.5 * c; p[I.thighRX] = -0.2 * c; p[I.shinR] = 2.0 * c; p[I.footR] = -0.4 * c;
      p[I.chestX] = 0.6 * c; p[I.uArmLX] = -1.0 * c; p[I.uArmRX] = -1.0 * c; p[I.fArmL] = -0.5 * c; p[I.fArmR] = -0.5 * c;
    }
    if (this.drawn) { p[I.onBack] = 0; this.W.stance(p, I); p[I.ik] = 1; }
  }
  _flinchPose(p) {
    const s = Math.sin(Math.min(1, this.t / 0.45) * Math.PI);
    if (this.drawn) { this.W.idle(p, I, 0); }
    p[I.chestX] -= 0.4 * s; p[I.headX] = -0.4 * s; p[I.rootY] -= 0.08 * s;
    if (!this.drawn) { p[I.uArmLX] = -0.6 * s; p[I.uArmRX] = -0.6 * s; p[I.uArmLZ] = 0.6 * s; p[I.uArmRZ] = -0.6 * s; }
  }
  _knockPose(p) {
    const t = this.t;
    const fall = smooth(Math.min(1, t / 0.45));
    const up = smooth(clamp((t - 1.35) / 0.55, 0, 1));
    const lie = fall * (1 - up);
    p[I.pitch] = -1.45 * lie;
    p[I.rootY] = -0.76 * lie + Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.35;
    p[I.thighLX] = -0.6 * lie; p[I.thighRX] = -0.2 * lie; p[I.shinL] = 0.8 * lie; p[I.shinR] = 0.3 * lie;
    p[I.uArmLZ] = 0.9 * lie; p[I.uArmRZ] = -0.9 * lie; p[I.headX] = 0.3 * lie;
    if (up > 0 && up < 1) { p[I.thighLX] -= Math.sin(up * Math.PI) * 1.2; p[I.shinL] += Math.sin(up * Math.PI) * 1.4; }
    if (this.drawn) { this.W.stance(p, I); p[I.ik] = 1; p[I.onBack] = 0; }
  }
  _stunPose(p) {
    const u = smooth(Math.min(1, this.t / 0.2));
    const shake = Math.sin(this.t * 40) * 0.03;
    p[I.uArmLX] = -2.4 * u; p[I.uArmRX] = -2.4 * u; p[I.uArmLZ] = 0.9 * u; p[I.uArmRZ] = -0.9 * u;
    p[I.fArmL] = -2.3 * u; p[I.fArmR] = -2.3 * u;
    p[I.rootY] = -0.2 * u; p[I.chestX] = 0.35 * u + shake; p[I.headX] = 0.3 * u;
    p[I.thighLX] = -0.5 * u; p[I.shinL] = 0.7 * u; p[I.thighRX] = -0.2 * u; p[I.shinR] = 0.6 * u;
    if (this.drawn) { p[I.onBack] = 0; this.W.stance(p, I); p[I.ik] = 0; }
  }
  _staggerPose(p) {
    const s = Math.sin(this.t * 14) * (1 - clamp(this.t / 0.8, 0, 1));
    p[I.chestZ] = s * 0.25; p[I.uArmLZ] = 0.8 + s * 0.4; p[I.uArmRZ] = -0.8 + s * 0.4; p[I.rootY] = -0.08;
    if (this.drawn) { p[I.onBack] = 0; this.W.stance(p, I); p[I.ik] = 1; }
  }
  _exhaustPose(p) {
    const u = smooth(Math.min(1, this.t / 0.25)), br = Math.sin(this.t * 6) * 0.03;
    p[I.spineX] = 0.55 * u + br; p[I.chestX] = 0.2 * u; p[I.rootY] = -0.12 * u;
    p[I.thighLX] = -0.4 * u; p[I.shinL] = 0.6 * u; p[I.thighRX] = -0.3 * u; p[I.shinR] = 0.5 * u;
    p[I.uArmLX] = -0.9 * u; p[I.uArmRX] = -0.9 * u; p[I.fArmL] = -0.2; p[I.fArmR] = -0.2;
  }
  _deadPose(p) {
    const u = smooth(Math.min(1, this.t / 0.9));
    p[I.pitch] = 1.45 * u; p[I.rootY] = -0.72 * u;
    p[I.uArmLZ] = 0.5 * u; p[I.uArmRZ] = -0.5 * u; p[I.thighLX] = 0.1; p[I.headY] = 0.4 * u;
  }
  _carvePose(p) {
    const t = this.t, k = smooth(Math.min(1, t / 0.25));
    p[I.rootY] = -0.45 * k; p[I.thighLX] = -1.3 * k; p[I.shinL] = 1.4 * k; p[I.thighRX] = 0.1 * k; p[I.shinR] = 2.0 * k; p[I.footR] = -0.45 * k;
    p[I.chestX] = 0.45 * k; p[I.headX] = 0.3 * k;
    const stab = this.state === 'carve' ? Math.max(0, Math.sin(t * 11)) : 0;
    p[I.uArmRX] = (-1.1 + stab * 0.5) * k; p[I.fArmR] = -0.6 * k;
    p[I.uArmLX] = -0.8 * k; p[I.uArmLZ] = 0.2; p[I.fArmL] = -0.9 * k;
    p[I.knife] = this.state === 'carve' ? 1 : 0;
  }
  _bouncePose(p) {
    this.W.idle(p, I, 0);
    const s = Math.sin(Math.min(1, this.t / 0.55) * Math.PI);
    p[I.gripY] += 0.35 * s; p[I.gripZ] -= 0.1 * s; p[I.chestX] -= 0.35 * s; p[I.rootY] -= 0.05;
  }
  _victoryPose(p) {
    const u = smooth(Math.min(1, this.t / 0.3));
    p[I.uArmRX] = -2.9 * u; p[I.fArmR] = -0.3 * u; p[I.uArmRZ] = -0.2;
    p[I.chestX] = -0.12 * u; p[I.headX] = -0.25 * u;
  }

  _applyPose(p) {
    const J = this.J;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.visFacing ?? this.facing;
    J.pivot.position.y = 0.95 + p[I.rootY];
    J.pivot.rotation.set(p[I.pitch], p[I.yawOff], 0);
    J.hips.rotation.set(p[I.hipsX], p[I.hipsY], p[I.hipsZ]);
    J.spine.rotation.set(p[I.spineX], p[I.spineY], 0);
    J.chest.rotation.set(p[I.chestX], p[I.chestY], p[I.chestZ]);
    J.head.rotation.set(p[I.headX], p[I.headY], 0);
    J.neck.rotation.set(0, 0, 0);
    J.thighL.rotation.set(p[I.thighLX], 0, p[I.thighLZ]); J.shinL.rotation.set(p[I.shinL], 0, 0); J.footL.rotation.set(p[I.footL], 0, 0);
    J.thighR.rotation.set(p[I.thighRX], 0, p[I.thighRZ]); J.shinR.rotation.set(p[I.shinR], 0, 0); J.footR.rotation.set(p[I.footR], 0, 0);
    J.uArmL.rotation.set(p[I.uArmLX], 0, p[I.uArmLZ]); J.fArmL.rotation.set(p[I.fArmL], 0, 0);
    J.uArmR.rotation.set(p[I.uArmRX], 0, p[I.uArmRZ]); J.fArmR.rotation.set(p[I.fArmR], 0, 0);
    J.handL.rotation.set(0, 0, 0); J.handR.rotation.set(0, 0, 0);
    this.knife.visible = p[I.knife] > 0.5;
    const s = this.sword;
    if (p[I.onBack] > 0.5) {
      if (s.parent !== J.back) J.back.add(s);
      s.position.set(-0.1, 0.24, 0);
      swordQuat(0.32, -0.95, 0, -0.95, -0.32, 0, s.quaternion);
    } else {
      if (s.parent !== J.chest) J.chest.add(s);
      s.position.set(p[I.gripX], p[I.gripY], p[I.gripZ]);
      swordQuat(p[I.bladeX], p[I.bladeY], p[I.bladeZ], p[I.edgeX], p[I.edgeY], p[I.edgeZ], s.quaternion);
    }
    this.root.updateMatrixWorld(true);
    if (p[I.ik] > 0.5 && p[I.onBack] < 0.5) {
      // 両手で柄を握る
      s.getWorldPosition(_grip);
      s.getWorldQuaternion(_qs);
      _bl.set(0, 1, 0).applyQuaternion(_qs);
      _pR.copy(_grip).addScaledVector(_bl, -0.07);
      _pL.copy(_grip).addScaledVector(_bl, -0.26);
      J.chest.getWorldQuaternion(_q);
      // Blender の体では、手首ではなく「手のひら」が柄に届くよう、前腕を少し長めに扱う
      const fore = this.skinned ? 0.365 : 0.3;
      solveIK2(J.uArmR, J.fArmR, 0.32, fore, _pR, _v.set(-1, -0.5, -0.4).applyQuaternion(_q));
      solveIK2(J.uArmL, J.fArmL, 0.32, fore, _pL, _v.set(1, -0.5, -0.4).applyQuaternion(_q));
      if (!this.skinned) { setWorldQuat(J.handR, _qs); setWorldQuat(J.handL, _qs); }
    }
    // 柄を握る・離す瞬間は、直前の腕の形から少し時間をかけて移る（手がカクッと飛ばないように）
    const arms = this.arms || (this.arms = [J.uArmR, J.fArmR, J.uArmL, J.fArmL]);
    if (this.armBlend < 1) {
      const u = smooth(this.armBlend);
      for (let i = 0; i < 4; i++) { _q.copy(arms[i].quaternion); arms[i].quaternion.copy(this.armFrom[i]).slerp(_q, u); }
      this.root.updateMatrixWorld(true);
    }
    for (let i = 0; i < 4; i++) _fk[i].copy(arms[i].quaternion);
    // 刃の位置（当たり判定用）
    const b = this.blade;
    b.pa.copy(b.a); b.pb.copy(b.b);
    b.a.set(0, this.W.id === 'ls' ? 0.35 : 0.3, 0).applyMatrix4(s.matrixWorld);
    b.b.set(0, this.W.def.bladeLen + 0.05, 0).applyMatrix4(s.matrixWorld);
    if (!b.ok) { b.pa.copy(b.a); b.pb.copy(b.b); b.ok = true; }
  }

  _updatePose(dt) {
    // 旋回と加減速（体の傾きに使う）
    if (dt > 0) {
      this.turnVel = damp(this.turnVel || 0, wrapAngle(this.facing - (this.prevFacing ?? this.facing)) / dt, 10, dt);
      this.accel = damp(this.accel || 0, (this.speedNow - (this.prevSpeed || 0)) / dt, 8, dt);
    }
    this.prevFacing = this.facing; this.prevSpeed = this.speedNow;
    // 見た目の向きは、ほんの少し遅れて追う（前転や吹き飛びで、体の向きが1コマで切り替わらないように）
    this.visFacing = dt > 0 && !this.snapPose && !this.smoothOff && this.visFacing !== undefined ? dampAngle(this.visFacing, this.facing, 26, dt) : this.facing;
    this._computeTarget(this.target, dt);
    const raw = this.raw || (this.raw = new Float32Array(NCH));
    if (this.blendT < this.blendDur) {
      this.blendT += dt;
      const u = smooth(this.blendT / this.blendDur);
      for (let i = 0; i < NCH; i++) raw[i] = lerp(this.from[i], this.target[i], u);
      // 背中⇔手の切り替え中はブレンドしない（剣が飛ばないように）
      if (this.from[I.onBack] !== this.target[I.onBack]) for (let i = I.gripX; i <= I.edgeZ; i++) raw[i] = this.target[i];
    } else raw.set(this.target);
    // 姿勢をなめらかに追わせる（カクッとした切り替わりをなくす）。攻撃中は速めに追従
    const k = dt > 0 && !this.smoothOff ? 1 - Math.exp(-(this.state === 'attack' || this.state === 'roll' ? 45 : 24) * dt) : 1;
    const snap = this.snapPose, swap = raw[I.onBack] !== this.pose[I.onBack];
    for (let i = 0; i < NCH; i++) this.pose[i] = snap ? raw[i] : this.pose[i] + (raw[i] - this.pose[i]) * k;
    // 剣が背中⇔手で入れ替わる瞬間だけは、剣の位置を追わせない（途中を飛んで見えるため）
    if (swap) for (let i = I.gripX; i <= I.edgeZ; i++) this.pose[i] = raw[i];
    for (const i of STEP_CH) this.pose[i] = this.target[i];
    // 柄を握る・離すが切り替わったら、直前の腕の形（_fk）から 0.15 秒かけて移る
    const ikOn = this.pose[I.ik] > 0.5 && this.pose[I.onBack] < 0.5;
    if (!this.armFrom) { this.armFrom = _fk.map(q => q.clone()); this.armBlend = 1; this.ikWas = ikOn; }
    if (ikOn !== this.ikWas) { this.ikWas = ikOn; for (let i = 0; i < 4; i++) this.armFrom[i].copy(_fk[i]); this.armBlend = 0; }
    this.armBlend = snap || dt <= 0 || this.smoothOff ? 1 : Math.min(1, this.armBlend + dt / 0.15);
    this.snapPose = false;
    this._applyPose(this.pose);
  }

  // ---------------- 状態 ----------------
  setState(st, blend = 0.12) {
    this.state = st; this.t = 0;
    // 前転の回転（2π）は0と同じ姿勢なので、巻き戻らないように丸める
    this.pose[I.pitch] = wrapAngle(this.pose[I.pitch]);
    this.from.set(this.pose); this.blendT = 0; this.blendDur = Math.max(blend, blend >= 0.1 ? 0.17 : blend);
    this.attackActive = false;
    if (st !== 'attack') this.move = null;
  }

  get sharpLevel() {
    let acc = 0;
    for (let i = 0; i < SHARPNESS.length; i++) {
      acc += SHARPNESS[i].len;
      if (this.sharp <= acc) return i;
    }
    return SHARPNESS.length - 1;
  }
  get sharpMult() { return SHARPNESS[this.sharpLevel].mult; }

  canRoll() { return this.stamina >= 8 && !this.exhaustLock; }
  spendStamina(v) { this.stamina = Math.max(0, this.stamina - v); this.staminaDelay = HUNTER.staminaRegenDelay; }

  startRoll(it) {
    let dx = it.mx, dz = it.mz;
    if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(this.facing); dz = Math.cos(this.facing); }
    this.rollYaw = Math.atan2(dx, dz);
    this.facing = this.rollYaw;
    this.spendStamina(HUNTER.rollCost);
    this.setState('roll', 0.06);
    this.game.sfx('roll');
    this.game.fx.dust(this.pos, 4, 0.6);
  }

  startAttack(move, level = 0) {
    // 気刃斬りはゲージを使う。足りなければ普通の縦斬りに
    if (move.spiritMove) {
      if (this.spirit < move.cost) { this.game.message('気刃ゲージが足りない', 'warn'); move = this.W.moves.vslash; }
      else this.spirit -= move.cost;
    }
    this.setState('attack', move.id === 'chargeSlash' ? 0.03 : 0.09);
    this.move = move; this.motionPrev = 0;
    this.swingId++; this.swingHit = false; this.winIdx = -1;
    this.chargeLevelUsed = level;
    this.curMv = move.id === 'chargeSlash' ? chargeMv(level) : move.mv;
    this.buffer = null;
    this.soundDone = false; this.soundsDone = 0;
    if (move.fromSheathed) this.drawn = true;
  }
  // いま当たり判定の出ている区間（なければ -1）
  _hitWindow(t) {
    const mv = this.move;
    const wins = mv.hits || [[mv.active[0], mv.active[1], mv.mv]];
    for (let i = 0; i < wins.length; i++) if (t >= wins[i][0] && t <= wins[i][1]) return i;
    return -1;
  }

  startItem() {
    const items = this.game.items;
    const def = items.current();
    if (!def || items.count(def.id) <= 0) { this.game.message('アイテムがありません', 'warn'); return false; }
    if (this.drawn) { this.setState('sheathe'); this.then = 'item'; return true; }
    this.item = { id: def.id, kind: def.kind, dur: def.dur, at: def.at, flexAt: def.flexAt || 99, done: false };
    this.setState('item', 0.1);
    if (def.kind === 'drink') { items.consume(def.id); this.game.sfx('drink'); }
    return true;
  }

  tryInteract() {
    const g = this.game;
    const target = g.findInteract ? g.findInteract(this) : null;
    if (!target) return false;
    this.interactTarget = target;
    if (this.drawn) { this.drawn = false; }
    this.facing = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    this.setState(target.type === 'supply' ? 'gather' : 'carve', 0.12);
    return true;
  }

  // 攻撃を受けた
  takeHit(h) {
    if (this.state === 'dead') return false;
    if (this.invuln || this.iframe > 0) return false;
    const toSrc = Math.atan2(h.srcX - this.pos.x, h.srcZ - this.pos.z);
    const front = Math.abs(wrapAngle(toSrc - this.facing)) < 1.75;
    if (h.kind === 'roar') {
      if ((this.state === 'guard' || this.state === 'guardHit') && front) { this.game.message('咆哮をガードした', 'info'); return true; }
      if (this.state === 'roll' && this.t < 0.35) return false;
      this.stunTime = h.duration || 1.6;
      this.setState('stun', 0.1);
      return true;
    }
    if (h.kind === 'tremor') {
      if (this.state === 'roll' || this.state === 'knock' || this.state === 'dead') return false;
      this.setState('stagger', 0.08);
      return true;
    }
    if ((this.state === 'guard' || this.state === 'guardHit') && front && h.guardable !== false) {
      const cost = h.power * 0.55;
      this.spendStamina(cost);
      this.sharp = Math.max(1, this.sharp - 2);
      this.game.sfx('guard');
      this.game.fx.sparks(_v.copy(this.pos).setY(this.pos.y + 1.2).addScaledVector(_v2.set(Math.sin(this.facing), 0, Math.cos(this.facing)), 0.6), 12, 0xffe08a);
      const chip = h.damage * (h.power > 40 ? 0.2 : 0.08);
      if (!this.god) this.hp = Math.max(1, this.hp - chip);
      this.guardPush = clamp(h.power / 12, 1.2, 5.5);
      this.guardPushT = 0;
      if (this.stamina <= 0) { this.game.message('ガードが崩された！', 'warn'); this._damage(h.damage * 0.5, h); return true; }
      this.setState('guardHit', 0.05);
      this.game.camShake(0.25);
      return true;
    }
    this._damage(h.damage, h);
    return true;
  }
  _damage(dmg, h) {
    if (this.god) dmg = 0;
    this.hp -= dmg;
    this.red = Math.min(this.maxHp - Math.max(0, this.hp), this.red * 0.5 + dmg * HUNTER.redRatio);
    this.regenDelay = 1.5;
    this.iframe = 0.3;
    this.game.onHunterHurt(dmg, h);
    this.drawnWas = this.drawn;
    if (this.hp <= 0) {
      this.hp = 0; this.red = 0;
      this.setState('dead', 0.1);
      this.invuln = true;
      this.game.onHunterDown();
      return;
    }
    this.knockDir.set(this.pos.x - h.srcX, 0, this.pos.z - h.srcZ);
    if (this.knockDir.lengthSq() < 1e-4) this.knockDir.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    this.knockDir.normalize();
    if (h.knock === 'knockdown') {
      this.facing = Math.atan2(-this.knockDir.x, -this.knockDir.z);
      this.knockPower = h.knockPower || 6;
      this.setState('knock', 0.06);
    } else {
      this.setState('flinch', 0.06);
    }
  }

  // 回復
  heal(v) {
    this.hp = Math.min(this.maxHp, this.hp + v);
    this.red = Math.min(this.red, this.maxHp - this.hp);
  }

  hurtCapsule(a, b) {
    const low = this.state === 'knock' || this.state === 'dead' || this.state === 'roll';
    a.set(this.pos.x, this.pos.y + 0.3, this.pos.z);
    b.set(this.pos.x, this.pos.y + (low ? 0.7 : 1.5), this.pos.z);
    return 0.38;
  }

  _moveBy(dx, dz) {
    const W = this.game.world, T = W.terrain;
    let nx = this.pos.x + dx, nz = this.pos.z + dz;
    const margin = -0.7;
    const sd = T.sdAt(nx, nz);
    if (sd > margin) {
      T.sdGrad(nx, nz, _g2);
      nx -= _g2.x * (sd - margin); nz -= _g2.y * (sd - margin);
    }
    for (const c of W.colliders) {
      const ex = nx - c.x, ez = nz - c.z, r = c.r + HUNTER.radius;
      const d2 = ex * ex + ez * ez;
      if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); nx = c.x + ex / d * r; nz = c.z + ez / d * r; }
    }
    const m = this.game.monster;
    if (m && m.alive !== undefined) {
      const out = m.pushOut(nx, nz, HUNTER.radius);
      if (out) { nx = out.x; nz = out.z; }
    }
    this.pos.x = nx; this.pos.z = nz;
    this.pos.y = T.heightAt(nx, nz);
    this.inWater = T.waterDepth(nx, nz) > 0.25;
  }

  _face(it, lambda, dt) {
    if (it.moveLen > 0.15) this.facing = dampAngle(this.facing, Math.atan2(it.mx, it.mz), lambda, dt);
  }

  update(dt, it) {
    this.iframe = Math.max(0, this.iframe - dt);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this._applyPose(this.pose);
      return;
    }
    this.t += dt;
    this.invuln = false;
    this.staminaDelay -= dt;
    this.regenDelay -= dt;
    const waterMul = this.inWater ? HUNTER.waterSlow : 1;
    let regenStamina = true;
    // 入力の先行入力（コンボ用）
    if (it.atkA) { this.buffer = 'A'; this.bufferT = 0.45; }
    if (it.atkB) { this.buffer = 'B'; this.bufferT = 0.45; }
    if (it.atkAB) { this.buffer = 'AB'; this.bufferT = 0.45; }
    if (it.dodge) { this.buffer = 'roll'; this.bufferT = 0.35; }
    if (it.spirit && this.W.id === 'ls') { this.buffer = 'S'; this.bufferT = 0.45; }
    this.bufferT -= dt;
    if (this.bufferT <= 0) this.buffer = null;

    const st = this.state;
    let targetSpeed = 0;

    if (st === 'free') {
      this.drawn = false;
      if (it.dodge && this.canRoll()) { this.startRoll(it); }
      else if (it.atkA || it.atkB || it.atkAB || (it.spirit && this.W.id === 'ls')) { this.startAttack(this.W.moves.drawSlash); }
      else if (it.sheathe) { this.setState('draw'); }
      else if (it.useItem) { this.startItem(); }
      else if (it.interact && this.tryInteract()) { /* はぎ取り・支給品 */ }
      else {
        const m = it.moveLen;
        this.sprinting = false;
        if (m > 0.1) {
          const sprint = it.sprint && this.stamina > 0 && !this.exhaustLock;
          this.sprinting = sprint;
          targetSpeed = (sprint ? HUNTER.sprintSpeed : HUNTER.runSpeed) * Math.min(1, m * 1.25) * waterMul;
          this._face(it, 15, dt);
          if (sprint) {
            regenStamina = false;
            this.spendStamina(HUNTER.sprintCost * dt);
            if (this.stamina <= 0) { this.exhaustLock = true; this.setState('exhausted', 0.15); this.game.message('スタミナ切れ！', 'warn'); }
          }
        }
        this.speedNow = damp(this.speedNow, targetSpeed, 14, dt);
        if (this.speedNow > 0.05) {
          const dir = Math.hypot(it.mx, it.mz) > 0.1 ? Math.atan2(it.mx, it.mz) : this.facing;
          const mix = dampAngle(this.facing, dir, 30, dt);
          this._moveBy(Math.sin(mix) * this.speedNow * dt, Math.cos(mix) * this.speedNow * dt);
        }
        this.runPhase += this.speedNow / (this.sprinting ? 2.9 : 2.3) * TAU * dt;
      }
    } else if (st === 'drawn') {
      this.drawn = true;
      const mvs = this.W.moves, first = this.W.first;
      if (it.dodge && this.canRoll()) this.startRoll(it);
      else if (it.atkA) this.startAttack(mvs[first.A]);
      else if (it.atkB) this.startAttack(mvs[first.B]);
      else if (it.atkAB) this.startAttack(mvs[first.AB]);
      else if (this.W.canGuard && it.guard) this.setState('guard', 0.1);
      else if (!this.W.canGuard && it.spirit) this.startAttack(mvs[first.S]);
      else if (it.sheathe || (it.sprint && it.moveLen > 0.2)) this.setState('sheathe');
      else if (it.useItem) this.startItem();
      else if (it.interact && this.tryInteract()) { /* */ }
      else {
        // strafe：向きを変えずに動く（数式バトルで、敵を見たまま立ち位置を直す）
        if (it.moveLen > 0.1) {
          targetSpeed = this.W.drawnSpeed * (this.moveMul || 1) * Math.min(1, it.moveLen * 1.25) * waterMul;
          if (it.strafe) this.strafeYaw = Math.atan2(it.mx, it.mz); else { this.strafeYaw = undefined; this._face(it, this.W.id === 'ls' ? 10 : 7, dt); }
        }
        this.speedNow = damp(this.speedNow, targetSpeed, 10, dt);
        const my = this.strafeYaw ?? this.facing;
        if (this.speedNow > 0.05) this._moveBy(Math.sin(my) * this.speedNow * dt, Math.cos(my) * this.speedNow * dt);
        else this.strafeYaw = undefined;
        this.runPhase += this.speedNow / 1.5 * TAU * dt;
      }
    } else if (st === 'attack') {
      const mv = this.move, t = this.t;
      this.speedNow = 0;
      if (t < mv.active[0] * 0.8) this._face(it, 3.5, dt);
      const d = mv.motion ? track(t, mv.motion) : 0;
      const dd = d - this.motionPrev; this.motionPrev = d;
      if (dd !== 0) this._moveBy(Math.sin(this.facing) * dd, Math.cos(this.facing) * dd);
      if (mv.sounds) { while (this.soundsDone < mv.sounds.length && t >= mv.sounds[this.soundsDone]) { this.soundsDone++; this.game.sfx('swing'); } }
      else if (!this.soundDone && t >= (mv.sound ?? mv.active[0])) { this.soundDone = true; this.game.sfx(mv.id === 'chargeSlash' || mv.id === 'ls_round' ? 'swingHeavy' : 'swing'); }
      if (mv.chargeable && this.W.canCharge && it.atkAHeld && t >= mv.chargeCheck && t < mv.active[0]) {
        this.chargeT = 0; this.chargeLv = 0;
        this.setState('charge', 0.1);
        this.drawn = true;
      } else {
        const wi = this._hitWindow(t);
        if (wi !== this.winIdx) {
          if (wi >= 0 && this.winIdx >= 0 || wi >= 0 && mv.hits) { this.swingHit = false; this.swingId++; if (mv.hits) this.curMv = mv.hits[wi][2]; }
          this.winIdx = wi;
        }
        this.attackActive = wi >= 0 && !this.swingHit;
        if (t >= mv.active[1] && t - dt < mv.active[1] && !this.swingHit && mv.id !== 'hslash') this.game.onSwingEnd(this);
        let next = null;
        if (t >= mv.rollFrom && this.buffer === 'roll' && this.canRoll()) { this.buffer = null; this.startRoll(it); }
        else if (t >= mv.comboFrom && this.buffer && this.buffer !== 'roll' && mv.combo[this.buffer]) { next = this.W.moves[mv.combo[this.buffer]]; this.buffer = null; this.startAttack(next); }
        else if (t >= mv.duration) this.setState('drawn', 0.15);
      }
    } else if (st === 'charge') {
      this.chargeT += dt;
      const lv = chargeLevel(this.chargeT);
      if (lv !== this.chargeLv) {
        this.chargeLv = lv;
        if (lv >= 1 && lv <= 3) { this.game.sfx('charge' + lv); this.game.fx.chargeFlash(this, lv); }
        if (lv === 4) this.game.sfx('overcharge');
      }
      this._face(it, 2.2, dt);
      this.speedNow = 0;
      if (!it.atkAHeld || this.chargeT >= CHARGE.auto) this.startAttack(GS.chargeSlash, lv);
    } else if (st === 'guard') {
      this.drawn = true;
      this.speedNow = 0;
      regenStamina = true;
      if (!it.guard) this.setState('drawn', 0.12);
      else if (it.dodge && this.canRoll()) this.startRoll(it);
      else this._face(it, 2.0, dt);
    } else if (st === 'guardHit') {
      const u = Math.max(0, 1 - this.t / 0.35);
      const push = this.guardPush * 2.2 * u * dt;
      this._moveBy(-Math.sin(this.facing) * push, -Math.cos(this.facing) * push);
      if (this.t > 0.38) this.setState(it.guard ? 'guard' : 'drawn', 0.1);
    } else if (st === 'roll') {
      const t = this.t;
      const sp = t < 0.34 ? lerp(8.2, 5.8, t / 0.34) : lerp(5.8, 0.4, clamp((t - 0.34) / 0.22, 0, 1));
      this._moveBy(Math.sin(this.rollYaw) * sp * dt * waterMul, Math.cos(this.rollYaw) * sp * dt * waterMul);
      this.invuln = t >= HUNTER.rollIFrames[0] && t <= HUNTER.rollIFrames[1];
      regenStamina = false;
      this.speedNow = 0;
      if (t >= HUNTER.rollTime) {
        if (this.buffer === 'roll' && this.canRoll()) { this.buffer = null; this.startRoll(it); }
        else this.setState(this.drawn ? 'drawn' : 'free', 0.14);
      }
    } else if (st === 'draw') {
      if (this.t >= 0.22) this.drawn = true;
      this._face(it, 8, dt);
      if (it.moveLen > 0.1) { this.speedNow = HUNTER.drawnSpeed * 0.7; this._moveBy(Math.sin(this.facing) * this.speedNow * dt, Math.cos(this.facing) * this.speedNow * dt); this.runPhase += dt * 6; } else this.speedNow = 0;
      if (this.t >= 0.45) this.setState('drawn', 0.1);
    } else if (st === 'sheathe') {
      if (this.t >= 0.4 && this.drawn) { this.drawn = false; this.game.sfx('sheathe'); }
      this._face(it, 8, dt);
      if (it.moveLen > 0.1) { this.speedNow = HUNTER.drawnSpeed; this._moveBy(Math.sin(this.facing) * this.speedNow * dt, Math.cos(this.facing) * this.speedNow * dt); this.runPhase += dt * 7; } else this.speedNow = 0;
      if (this.t >= 0.72) {
        this.drawn = false;
        if (this.then === 'item') { this.then = null; this.setState('free', 0.05); this.startItem(); }
        else this.setState('free', 0.12);
      }
    } else if (st === 'item') {
      const itm = this.item;
      if (itm.kind === 'drink' && this.t < itm.flexAt && it.moveLen > 0.1) {
        this._face(it, 6, dt);
        this.speedNow = HUNTER.itemWalkSpeed; this.runPhase += dt * 5;
        this._moveBy(Math.sin(this.facing) * this.speedNow * dt, Math.cos(this.facing) * this.speedNow * dt);
      } else this.speedNow = 0;
      if (!itm.done && this.t >= itm.at) { itm.done = true; this.game.items.effect(itm.id, this); }
      if (itm.kind === 'whet' && this.t > 0.3 && it.dodge && this.canRoll() && !itm.done) { this.item = null; this.startRoll(it); }
      else if (this.t >= itm.dur) { this.item = null; this.setState(this.drawn ? 'drawn' : 'free', 0.15); }
    } else if (st === 'flinch') {
      const u = Math.max(0, 1 - this.t / 0.3);
      this._moveBy(this.knockDir.x * 3 * u * dt, this.knockDir.z * 3 * u * dt);
      if (this.t >= 0.5) this.setState(this.drawn ? 'drawn' : 'free', 0.12);
    } else if (st === 'knock') {
      const t = this.t;
      if (t < 0.5) { const u = 1 - t / 0.5; this._moveBy(this.knockDir.x * this.knockPower * u * dt * 1.6, this.knockDir.z * this.knockPower * u * dt * 1.6); }
      this.invuln = t > 1.3 || t < 0.1;
      // 倒れている間に回避で受け身
      if (t > 0.7 && t < 1.3 && it.dodge && this.canRoll()) { this.startRoll({ mx: it.mx, mz: it.mz, moveLen: it.moveLen }); }
      else if (t >= 1.95) this.setState(this.drawn ? 'drawn' : 'free', 0.15);
    } else if (st === 'stun') {
      if (this.t >= this.stunTime) this.setState(this.drawn ? 'drawn' : 'free', 0.15);
    } else if (st === 'stagger') {
      if (this.t >= 0.8) this.setState(this.drawn ? 'drawn' : 'free', 0.12);
    } else if (st === 'bounce') {
      if (this.t >= 0.6) this.setState('drawn', 0.12);
    } else if (st === 'exhausted') {
      regenStamina = true;
      if (this.t >= 1.1) this.setState('free', 0.15);
    } else if (st === 'dead') {
      this.invuln = true;
      regenStamina = false;
    } else if (st === 'carve' || st === 'gather') {
      const dur = st === 'carve' ? 1.25 : 0.8, at = st === 'carve' ? 0.95 : 0.5;
      if (!this.interactDone && this.t >= at) { this.interactDone = true; this.game.onInteract(this, this.interactTarget); }
      if (this.t >= dur) { this.interactDone = false; this.setState('free', 0.15); }
    } else if (st === 'victory') {
      if (this.t >= 2.2) this.setState('free', 0.2);
    }

    // スタミナ・赤ゲージの回復
    if (regenStamina && this.staminaDelay <= 0 && !(this.state === 'free' && this.sprinting)) {
      this.stamina = Math.min(HUNTER.maxStamina, this.stamina + HUNTER.staminaRegen * dt * (this.state === 'guard' ? 0.5 : 1));
    }
    if (this.exhaustLock && this.stamina >= 30) this.exhaustLock = false;
    if (this.red > 0 && this.regenDelay <= 0 && this.state !== 'dead') {
      const r = Math.min(this.red, HUNTER.redRegen * dt);
      this.hp = Math.min(this.maxHp, this.hp + r); this.red -= r;
    }
    // 溜め中は刀身が光る
    let glow = 0;
    if (this.W.id === 'gs') {
      glow = this.state === 'charge' ? [0, 0.18, 0.35, 0.6, 0.15][this.chargeLv] + Math.sin(this.game.time * 30) * 0.05 : 0;
      this.swordGlow.material.color.setHex(this.chargeLv >= 3 && this.chargeLv < 4 ? 0xff7040 : 0xffd060);
    } else {
      // 気刃ゲージ：しばらく当てないと少しずつ減る
      this.spiritIdle += dt;
      if (this.spiritIdle > 6 && this.spirit > 0) this.spirit = Math.max(0, this.spirit - 4 * dt);
      glow = this.drawn ? (this.spiritFull ? 0.32 + Math.sin(this.game.time * 8) * 0.06 : this.spirit / 100 * 0.12) : 0;
      if (this.state === 'attack' && this.move && this.move.spiritMove) glow = Math.max(glow, 0.45);
      this.swordGlow.material.color.setHex(this.spiritFull ? 0xff6a5a : 0xfff0e0);
    }
    this.swordGlow.material.opacity = damp(this.swordGlow.material.opacity, glow, 20, dt);

    this._updatePose(dt);
  }

  // 大剣の当たり（ヒットした直後にゲーム側から呼ばれる）
  onHit(result) {
    this.swingHit = true;
    this.attackActive = false;
    this.hitstop = result.hitstop;
    if (this.W.id === 'ls' && this.move && !result.bounce) {
      if (this.move.spirit) this.spirit = Math.min(100, this.spirit + this.move.spirit);
      this.spiritIdle = 0;
    }
    const cost = result.bounce ? 2 : 1;
    this.sharp = Math.max(1, this.sharp - cost);
    if (result.bounce && this.move && this.move.id !== 'chargeSlash') {
      this.setState('bounce', 0.05);
    }
  }
}
