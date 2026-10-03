// 大型モンスター「焔角竜ザルヴァ」：見た目・歩き（足のIK）・AI・攻撃・部位
import * as THREE from 'three';
import { MONSTER } from './config.js';
import { clamp, lerp, damp, dampAngle, wrapAngle, approachAngle, smooth, easeIn, easeOut, track, phase, Rng, TAU, segSegDist2, pointSegDist2 } from './util.js';
import { joint, part, solveIK2, setWorldQuat } from './rig.js';
import { AREAS, NEST, CAMP, areaPath } from './world.js';
import { CREATURES } from './assets.js';
import { BESTIARY, enemyName } from './bestiary.js';

// ---- ポーズのチャンネル ----
const MCH = ['bodyY', 'pitch', 'roll', 'drop', 'yawOff', 'spineX', 'spineY', 'chestX', 'chestY', 'neck1X', 'neck1Y', 'neck2X', 'neck2Y', 'headX', 'headY', 'headZ', 'jaw', 'wing',
  'armLX', 'armRX', 'farmL', 'farmR', 'tailX', 'tailY', 'tailCurl', 'legFK', 'thighLX', 'shinLX', 'footLX', 'thighRX', 'shinRX', 'footRX', 'thighLZ', 'thighRZ', 'look', 'liftR', 'liftL'];
const P = Object.fromEntries(MCH.map((n, i) => [n, i]));
const NCH = MCH.length;
const HIP_H = 3.05;          // 骨盤の高さ
const THIGH = 1.45, SHIN = 1.3, ANKLE_H = 0.72;

function basePose(p) {
  p.fill(0);
  p[P.spineX] = -0.04; p[P.chestX] = -0.1;
  p[P.neck1X] = -0.38; p[P.neck2X] = 0.08; p[P.headX] = 0.36;
  p[P.tailX] = -0.13; p[P.jaw] = 0.04;
  p[P.armLX] = 0.5; p[P.armRX] = 0.5; p[P.farmL] = -1.1; p[P.farmR] = -1.1;
  p[P.look] = 1;
  return p;
}
// FK の脚（寝る・倒れるなど）
function legsFolded(p, k) {
  p[P.legFK] = 1;
  p[P.thighLX] = -1.25 * k; p[P.shinLX] = 2.3 * k; p[P.footLX] = -1.2 * k;
  p[P.thighRX] = -1.25 * k; p[P.shinRX] = 2.3 * k; p[P.footRX] = -1.2 * k;
}
function legsStandFK(p) {
  p[P.legFK] = 1;
  p[P.thighLX] = -0.45; p[P.shinLX] = 0.95; p[P.footLX] = -0.5;
  p[P.thighRX] = -0.45; p[P.shinRX] = 0.95; p[P.footRX] = -0.5;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _g2 = { x: 0, y: 0 };
const UP = new THREE.Vector3(0, 1, 0);

// ---- 当たり判定のカプセル（関節のローカル座標） ----
class HitCapsule {
  constructor(joint, a, b, r, part) {
    this.joint = joint; this.a = new THREE.Vector3(...a); this.b = new THREE.Vector3(...b); this.r = r; this.part = part;
    this.wa = new THREE.Vector3(); this.wb = new THREE.Vector3(); this.off = false;
  }
  update() { this.wa.copy(this.a).applyMatrix4(this.joint.matrixWorld); this.wb.copy(this.b).applyMatrix4(this.joint.matrixWorld); }
}

// ---- 足：IK と踏みしめ ----
class Leg {
  constructor(side, thigh, shin, foot) {
    this.side = side; this.thigh = thigh; this.shin = shin; this.foot = foot;
    this.planted = new THREE.Vector3(); this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.cur = new THREE.Vector3();
    this.stepping = false; this.stepT = 0; this.stepDur = 0.5; this.idle = 0;
  }
}

export class Monster {
  constructor(game) {
    this.game = game;
    this.variant = 'zarva';
    this._tailPieces = {};
    this.name = MONSTER.name;
    this.rng = new Rng(game.seed * 7 + 3);
    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.vel = new THREE.Vector3();
    this.air = 0;
    this.pose = basePose(new Float32Array(NCH));
    this.target = basePose(new Float32Array(NCH));
    this.from = basePose(new Float32Array(NCH));
    this.blendT = 1; this.blendDur = 0.25;
    this.activeAttacks = [];
    this.atkSeq = 1;
    this.tailSway = 0; this.tailLag = 0; this.prevFacing = 0;
    this.lookYaw = 0; this.lookPitch = 0;
    this.projectiles = [];
    this.buildModel();
    this.resetForDemo();
  }

  // =================== 見た目 ===================
  buildModel() {
    this.glowMat = new THREE.MeshBasicMaterial({ color: BESTIARY[this.variant]?.color || (this.variant === 'veira' ? 0x52dfff : 0xff6a20), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    if (CREATURES[this.variant]) this._buildSkinned(CREATURES[this.variant]);
    else this._buildProcedural();
    this._buildHitboxes();
  }

  setVariant(variant = 'zarva') {
    if (variant !== 'sektra' && variant !== 'veira' && !BESTIARY[variant]) variant = 'zarva';
    if (variant !== 'zarva' && !CREATURES[variant]) variant = 'zarva';
    if (variant === this.variant) return;
    if (this.cutTail) { this.game.scene.remove(this.cutTail); this.cutTail = null; }
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    this.projectiles = [];
    this.game.scene.remove(this.root);
    this.variant = variant;
    this.name = enemyName(variant);
    this.skinned = false;
    this.stump = null;
    this.buildModel();
  }

  // Blender で作った骨つきモデルを使う（骨の配置はこのファイルの関節と同じ）
  _buildSkinned(gltf) {
    this.skinned = true;
    const root = new THREE.Group(); root.name = 'monster';
    this.root = root;
    const J = {};
    J.pivot = joint('pivot', root); J.pivot.rotation.order = 'YZX';
    J.pivot.add(gltf.scene);
    const bone = n => gltf.scene.getObjectByName(n);
    for (const n of ['pelvis', 'spine', 'chest', 'neck1', 'neck2', 'head', 'jaw', 'armL', 'farmL', 'armR', 'farmR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'hornL', 'hornR']) {
      J[n] = bone(n);
      if (!J[n]) throw new Error('骨が見つかりません: ' + n);
    }
    J.tail = [0, 1, 2, 3, 4].map(i => bone('tail' + i));
    J.wingL = bone('wingL');
    J.wingR = bone('wingR');
    if ((this.variant === 'veira' || BESTIARY[this.variant]) && (!J.wingL || !J.wingR)) throw new Error('側面の骨が見つかりません');
    this.J = J;
    this.mats = {};
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material;
      if (m.name === 'skin') { this.mats.skin = m; m.roughness = 0.7; m.envMapIntensity = 0.6; }
      if (m.name === 'eye') { this.eyeMat = m; m.emissiveIntensity = 2.2; }
      if (m.name === 'parts') { m.roughness = 0.45; }
    });
    if (!this.mats.skin) this.mats.skin = new THREE.MeshStandardMaterial();
    if (!this.eyeMat) this.eyeMat = new THREE.MeshStandardMaterial();
    // 切れた尻尾用の部品は、切断のときまで隠しておく
    this.tailPiece = gltf.scene.getObjectByName('TailPiece') || this._tailPieces[this.variant];
    if (this.tailPiece) {
      if (this.tailPiece.parent) this.tailPiece.parent.remove(this.tailPiece);
      this._tailPieces[this.variant] = this.tailPiece;
    }
    this.horns = [J.hornL, J.hornR];
    this.tailMeshes = [[], [], [], [], []];
    this.mouthGlow = part(J.head, new THREE.SphereGeometry(0.45, 10, 8), this.glowMat, 0, -0.25, 1.1);
    this.mouthGlow.castShadow = false;
    this.game.scene.add(root);
  }

  _buildProcedural() {
    const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.78, metalness: 0.05, flatShading: true, ...extra });
    const skin = mat(0x7c2b1d), skin2 = mat(0x5e1f16), belly = mat(0xc4935f), plate = mat(0x2c2321, { roughness: 0.6 }),
      horn = mat(0xe2d3ae, { roughness: 0.5 }), hornTip = mat(0x3a2c24), tooth = mat(0xf1ead8, { roughness: 0.4 }), mouth = mat(0x3a0e0c);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa010, emissiveIntensity: 1.2 });
    this.mats = { skin, skin2, belly, plate, horn, hornTip, tooth, mouth };
    const ell = (parent, sx, sy, sz, m, x = 0, y = 0, z = 0, seg = 12) => {
      const mesh = part(parent, new THREE.SphereGeometry(1, seg, Math.max(6, seg - 3)), m, x, y, z);
      mesh.scale.set(sx, sy, sz);
      return mesh;
    };
    // 先細りの筒（+Z か -Z に伸びる）
    const tube = (parent, len, r0, r1, m, dir = 1, x = 0, y = 0, z = 0) => {
      const g = new THREE.CylinderGeometry(r1, r0, len, 9, 1);
      g.translate(0, len / 2, 0);
      g.rotateX(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      return part(parent, g, m, x, y, z);
    };
    // 下向き（-Y）に伸びる筒
    const down = (parent, len, r0, r1, m, x = 0, y = 0, z = 0) => {
      const g = new THREE.CylinderGeometry(r0, r1, len, 8, 1);
      g.translate(0, -len / 2, 0);
      return part(parent, g, m, x, y, z);
    };
    const cone = (parent, r, h, m, x, y, z, rx = 0, ry = 0, rz = 0, seg = 5) => part(parent, new THREE.ConeGeometry(r, h, seg), m, x, y, z, rx, ry, rz);

    const root = new THREE.Group(); root.name = 'monster';
    this.root = root;
    const J = {};
    J.pivot = joint('pivot', root); J.pivot.rotation.order = 'YZX';
    J.pelvis = joint('pelvis', J.pivot, 0, HIP_H, 0);
    J.spine = joint('spine', J.pelvis, 0, 0.3, 1.25);
    J.chest = joint('chest', J.spine, 0, 0.2, 1.45);
    J.neck1 = joint('neck1', J.chest, 0, 0.5, 1.1);
    J.neck2 = joint('neck2', J.neck1, 0, 0.3, 1.05);
    J.head = joint('head', J.neck2, 0, 0.12, 1.0);
    J.jaw = joint('jaw', J.head, 0, -0.32, 0.25);
    J.armL = joint('armL', J.chest, 0.85, -0.55, 0.55); J.farmL = joint('farmL', J.armL, 0, -0.75, 0);
    J.armR = joint('armR', J.chest, -0.85, -0.55, 0.55); J.farmR = joint('farmR', J.armR, 0, -0.75, 0);
    const tailLen = [1.35, 1.45, 1.35, 1.25, 1.15];
    J.tail = [];
    let tp = J.pelvis, tz = -1.35;
    for (let i = 0; i < 5; i++) { const t = joint('tail' + i, tp, 0, i === 0 ? 0.15 : -0.05, i === 0 ? tz : -tailLen[i - 1]); J.tail.push(t); tp = t; }
    J.thighL = joint('thighL', J.pelvis, 1.0, -0.3, 0.25); J.shinL = joint('shinL', J.thighL, 0, -THIGH, 0); J.footL = joint('footL', J.shinL, 0, -SHIN, 0);
    J.thighR = joint('thighR', J.pelvis, -1.0, -0.3, 0.25); J.shinR = joint('shinR', J.thighR, 0, -SHIN, 0); J.footR = joint('footR', J.shinR, 0, -SHIN, 0);
    J.shinR.position.set(0, -THIGH, 0);
    this.J = J;

    // 胴体
    ell(J.pelvis, 1.4, 1.3, 1.85, skin, 0, 0.05, -0.15);
    ell(J.spine, 1.55, 1.5, 1.55, skin, 0, 0, 0.1);
    ell(J.spine, 1.25, 1.0, 1.3, belly, 0, -0.62, 0.2);
    ell(J.chest, 1.35, 1.4, 1.35, skin, 0, 0.05, 0.3);
    ell(J.chest, 1.05, 0.95, 1.1, belly, 0, -0.55, 0.45);
    // 背中のとげ
    const spikes = [[J.pelvis, 0, 1.25, -0.8, 0.28, 0.9], [J.pelvis, 0, 1.3, 0.2, 0.32, 1.0], [J.spine, 0, 1.45, -0.2, 0.34, 1.1], [J.spine, 0, 1.45, 0.8, 0.34, 1.05], [J.chest, 0, 1.35, 0.1, 0.3, 0.95], [J.chest, 0, 1.25, 0.95, 0.26, 0.8]];
    for (const [j, x, y, z, r, h] of spikes) cone(j, r, h, plate, x, y, z, -0.35);
    // 首
    tube(J.neck1, 1.35, 1.0, 0.85, skin, 1, 0, 0, -0.1);
    tube(J.neck2, 1.2, 0.85, 0.72, skin, 1, 0, 0, -0.1);
    ell(J.neck1, 0.7, 0.55, 0.9, belly, 0, -0.5, 0.6);
    cone(J.neck1, 0.22, 0.7, plate, 0, 0.85, 0.5, -0.4); cone(J.neck2, 0.2, 0.6, plate, 0, 0.72, 0.45, -0.4);
    // 頭
    ell(J.head, 0.8, 0.72, 1.05, skin, 0, 0.12, 0.35);
    const snout = part(J.head, new THREE.BoxGeometry(0.95, 0.55, 1.2), skin, 0, 0.02, 1.15);
    snout.geometry.translate(0, 0, 0); snout.scale.set(1, 1, 1);
    part(J.head, new THREE.BoxGeometry(1.0, 0.18, 0.45), skin2, 0, 0.5, 0.75, 0.25);               // 眉
    for (const s of [-1, 1]) {
      const eye = part(J.head, new THREE.SphereGeometry(0.11, 8, 6), this.eyeMat, s * 0.43, 0.33, 0.95);
      eye.castShadow = false;
    }
    // 角（部位破壊で折れる）
    this.horns = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(s * 0.42, 0.62, 0.35); g.rotation.set(-1.15, 0, s * -0.32); J.head.add(g);
      const h1 = cone(g, 0.3, 1.5, horn, 0, 0.72, 0, 0, 0, 0, 6);
      const h2 = cone(g, 0.12, 0.5, hornTip, 0, 1.6, 0, 0, 0, 0, 6);
      this.horns.push(g);
      this.hornParts = (this.hornParts || []).concat([h1, h2]);
    }
    cone(J.head, 0.16, 0.55, horn, 0, 0.42, 1.55, 0.5);                                         // 鼻の角
    // 上あごの歯
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) cone(J.head, 0.06, 0.25, tooth, s * 0.4, -0.3, 0.75 + i * 0.2, Math.PI);
    // 下あご
    part(J.jaw, new THREE.BoxGeometry(0.82, 0.26, 1.3), skin2, 0, -0.08, 0.72);
    part(J.jaw, new THREE.BoxGeometry(0.66, 0.1, 1.1), mouth, 0, 0.06, 0.7);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) cone(J.jaw, 0.055, 0.22, tooth, s * 0.34, 0.15, 0.55 + i * 0.2);
    // 口の中の火
    this.mouthGlow = part(J.head, new THREE.SphereGeometry(0.45, 10, 8), this.glowMat, 0, -0.25, 1.1);
    this.mouthGlow.castShadow = false;
    // 小さな腕
    for (const s of ['L', 'R']) {
      down(J['arm' + s], 0.78, 0.26, 0.2, skin);
      down(J['farm' + s], 0.62, 0.18, 0.14, skin2);
      for (let k = -1; k <= 1; k++) cone(J['farm' + s], 0.05, 0.28, hornTip, k * 0.08, -0.72, 0.05, 0.3);
    }
    // 尻尾
    const tr = [[1.05, 0.88], [0.88, 0.7], [0.7, 0.52], [0.52, 0.36], [0.36, 0.14]];
    this.tailMeshes = [];
    for (let i = 0; i < 5; i++) {
      const L = tailLen[i];
      const m = tube(J.tail[i], L + 0.1, tr[i][0], tr[i][1], skin, -1);
      const s = cone(J.tail[i], 0.2 - i * 0.025, 0.7 - i * 0.07, plate, 0, tr[i][0] * 0.85, -L * 0.5, 0.35);
      this.tailMeshes.push([m, s]);
    }
    cone(J.tail[4], 0.28, 0.9, plate, 0, 0, -1.3, -Math.PI / 2);                                  // 尻尾の先のとげ
    this.tailMeshes[4].push(J.tail[4].children[J.tail[4].children.length - 1]);
    // 脚
    for (const s of ['L', 'R']) {
      ell(J['thigh' + s], 0.95, 1.2, 1.1, skin, 0, -0.6, 0.08);
      ell(J['thigh' + s], 0.7, 0.8, 0.8, skin2, 0, -1.25, 0.05, 9);
      down(J['shin' + s], SHIN, 0.56, 0.4, skin);
      down(J['foot' + s], 0.72, 0.4, 0.32, skin2);
      for (let k = -1; k <= 1; k++) {
        const toe = part(J['foot' + s], new THREE.ConeGeometry(0.13, 0.75, 5), hornTip, k * 0.22, -0.72, 0.3, Math.PI / 2 - 0.05, 0, 0);
        toe.rotation.y = k * 0.25;
      }
    }
    root.traverse(o => { if (o.isMesh && o.material !== this.glowMat) { o.castShadow = true; o.receiveShadow = true; } });
    this.game.scene.add(root);
  }

  _buildHitboxes() {
    const J = this.J;
    const tailLen = [1.35, 1.45, 1.35, 1.25, 1.15];
    // 当たり判定
    const H = (j, a, b, r, p) => new HitCapsule(j, a, b, r, p);
    this.hitboxes = [
      H(J.head, [0, 0.15, 0.1], [0, 0.0, 1.55], 0.78, 'head'),
      H(J.jaw, [0, 0, 0.1], [0, -0.05, 1.3], 0.45, 'head'),
      H(J.neck1, [0, 0, 0], [0, 0.3, 1.05], 0.9, 'neck'),
      H(J.neck2, [0, 0, 0], [0, 0.1, 1.0], 0.78, 'neck'),
      H(J.pelvis, [0, 0.05, -0.9], [0, 0.1, 0.6], 1.35, 'body'),
      H(J.spine, [0, 0, -0.3], [0, 0.05, 0.8], 1.45, 'body'),
      H(J.chest, [0, 0, 0], [0, 0.05, 0.8], 1.3, 'body'),
      H(J.armL, [0, 0, 0], [0, -0.75, 0], 0.3, 'arm'), H(J.farmL, [0, 0, 0], [0, -0.7, 0], 0.22, 'arm'),
      H(J.armR, [0, 0, 0], [0, -0.75, 0], 0.3, 'arm'), H(J.farmR, [0, 0, 0], [0, -0.7, 0], 0.22, 'arm'),
      H(J.thighL, [0, -0.15, 0], [0, -1.2, 0], 0.8, 'legL'), H(J.shinL, [0, 0, 0], [0, -SHIN, 0], 0.45, 'legL'), H(J.footL, [0, 0, 0], [0, -0.7, 0.3], 0.38, 'legL'),
      H(J.thighR, [0, -0.15, 0], [0, -1.2, 0], 0.8, 'legR'), H(J.shinR, [0, 0, 0], [0, -SHIN, 0], 0.45, 'legR'), H(J.footR, [0, 0, 0], [0, -0.7, 0.3], 0.38, 'legR'),
    ];
    const tr2 = [1.0, 0.82, 0.64, 0.48, 0.34];
    if (J.wingL && J.wingR) {
      this.hitboxes.push(H(J.wingL, [0, 0, 0], [3.6, 0.3, -0.7], 0.85, 'wingL'));
      this.hitboxes.push(H(J.wingR, [0, 0, 0], [-3.6, 0.3, -0.7], 0.85, 'wingR'));
    }
    this.tailBoxes = [];
    for (let i = 0; i < 5; i++) { const hb = H(J.tail[i], [0, 0, 0], [0, 0, -tailLen[i]], tr2[i], 'tail'); this.hitboxes.push(hb); this.tailBoxes.push(hb); }
    this.hb = Object.fromEntries(['head', 'jaw', 'neck1', 'neck2', 'pelvis', 'spine', 'chest'].map((k, i) => [k, this.hitboxes[i]]));
    this.legs = [new Leg(1, J.thighL, J.shinL, J.footL), new Leg(-1, J.thighR, J.shinR, J.footR)];
  }

  // =================== リセット ===================
  _resetCommon() {
    this.alive = true; this.dead = false; this.gone = false;
    this.hp = this.maxHp;
    this.state = 'wander';
    this.act = null;
    this.inCombat = false; this.enraged = false; this.enrageT = 0; this.tired = false; this.tiredT = 0;
    this.dmgSinceEnrage = 0; this.pendingEnrage = false;
    this.limping = false; this.fled = false; this.areaChanged = false; this.wantArea = null;
    this.sleeping = false; this.trapped = false; this.trapCount = 0; this.flashCount = 0; this.blindT = 0;
    this.painted = false; this.paintTime = 0;
    this.partDmg = {}; this.partHits = {}; this.tripBonus = 1; this.headBroken = false; this.headFlinches = 0; this.tailDmg = 0; this.tailCut = false;
    this.wingBroken = { L: false, R: false };
    this.wingFlinches = { L: 0, R: 0 };
    if (this.J.wingL) this.J.wingL.scale.setScalar(1);
    if (this.J.wingR) this.J.wingR.scale.setScalar(1);
    this.lostT = 0; this.lastAttack = ''; this.recent = [];
    this.visibleToHunter = false;
    this.speedMul = 1;
    this.activeAttacks.length = 0;
    // 見た目を元に戻す
    for (const g of this.horns) g.scale.set(1, 1, 1);
    for (const segs of this.tailMeshes.slice(2)) for (const m of segs) m.visible = true;
    if (this.skinned) this.J.tail[2].scale.setScalar(1);
    for (let i = 2; i < 5; i++) this.tailBoxes[i].off = false;
    if (this.stump) { this.stump.visible = false; }
    if (this.cutTail) { this.game.scene.remove(this.cutTail); this.cutTail = null; }
    this.eyeMat.color.setHex(BESTIARY[this.variant]?.color || (this.variant === 'veira' ? 0xa9f6ff : 0xffd23a));
    this.eyeMat.emissive.setHex(BESTIARY[this.variant]?.color || (this.variant === 'veira' ? 0x37dfff : 0xffa010));
    this.mats.skin.emissive.setHex(0x000000);
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    this.projectiles = [];
    this.root.visible = true;
    this.air = 0;
    this.blendT = 1;
    this._placeFeet();
  }
  resetForDemo() {
    this.demo = true;
    this.maxHp = MONSTER.maxHp;
    const a = AREAS[2];
    this.pos.set(a.x + 4, 0, a.z - 6);
    this.pos.y = this.game.world.terrain.heightAt(this.pos.x, this.pos.z);
    this.facing = 0.6;
    this.area = 2;
    this.diff = { hp: 1, dmg: 1, speed: 1 };
    this._resetCommon();
    this.startAction('idle');
  }
  resetForHunt(diff) {
    this.demo = false;
    this.diff = diff;
    this.maxHp = Math.round(MONSTER.maxHp * diff.hp);
    const a = this.rng.chance(0.5) ? AREAS[2] : AREAS[3];
    this.area = a.id;
    const ang = this.rng.range(0, TAU);
    this.pos.set(a.x + Math.cos(ang) * 6, 0, a.z + Math.sin(ang) * 6);
    this.pos.y = this.game.world.terrain.heightAt(this.pos.x, this.pos.z);
    this.facing = this.rng.range(-Math.PI, Math.PI);
    this._resetCommon();
    this.startAction('idle');
  }
  _placeFeet() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.root.updateMatrixWorld(true);
    for (const L of this.legs) {
      this._homePos(L, L.planted);
      L.cur.copy(L.planted); L.stepping = false;
    }
  }

  // =================== 便利関数 ===================
  get hunter() { return this.game.hunter; }
  focusPoint() { return this.hb.chest.wa.clone().lerp(this.hb.neck1.wa, 0.3); }
  focusX() { return this.hb.chest.wa.x; }
  focusZ() { return this.hb.chest.wa.z; }
  zoneFor(part) {
    const z = MONSTER.parts[part].zone;
    if (part === 'head' && this.headBroken) return z + 5;
    return z;
  }
  _hunterRel() {
    // 数式バトルでは、ハンターではなく決まった場所（aim）をねらう
    const t = this.aim || this.hunter.pos;
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const ang = wrapAngle(Math.atan2(dx, dz) - this.facing);
    return { dist, ang, dx, dz, yaw: Math.atan2(dx, dz) };
  }
  _forward(out) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  _move(dx, dz, margin = -2.8) {
    const T = this.game.world.terrain;
    let nx = this.pos.x + dx, nz = this.pos.z + dz;
    const sd = T.sdAt(nx, nz);
    let blocked = false;
    // ベースキャンプには入らない
    const cx = nx - CAMP.x, cz = nz - CAMP.z, cd = Math.hypot(cx, cz);
    if (cd < 24) { nx = CAMP.x + cx / cd * 24; nz = CAMP.z + cz / cd * 24; blocked = true; }
    if (sd > margin) { T.sdGrad(nx, nz, _g2); nx -= _g2.x * (sd - margin); nz -= _g2.y * (sd - margin); blocked = true; }
    this.pos.x = nx; this.pos.z = nz;
    this.pos.y = T.heightAt(nx, nz);
    return blocked;
  }
  _turnToward(yaw, rate, dt) {
    const before = this.facing;
    // 回り始めと止まり際をなめらかに（目標に近づくほど遅く、動き出しは少しずつ速く）
    const left = Math.abs(wrapAngle(yaw - this.facing));
    this.turnEase = Math.min(1, (this.turnEase || 0) + dt * 3.5);
    this.turnUsed = true;
    rate *= Math.min(1, 0.25 + left * 1.6) * (0.35 + 0.65 * this.turnEase);
    this.facing = approachAngle(this.facing, yaw, rate * dt);
    return Math.abs(wrapAngle(yaw - this.facing)) < 0.05 || this.facing === before && Math.abs(wrapAngle(yaw - this.facing)) < 0.1;
  }
  canBeTrapped() { return this.alive && !this.trapped && this.air < 0.3 && !this.sleeping && this.state !== 'topple'; }
  footNear(p, r) {
    for (const L of this.legs) if (Math.hypot(L.cur.x - p.x, L.cur.z - p.z) < r) return true;
    return Math.hypot(this.pos.x - p.x, this.pos.z - p.z) < r * 0.8;
  }
  pointHits(p, r) {
    for (const hb of this.hitboxes) { if (hb.off) continue; const rr = hb.r + r; if (pointSegDist2(p, hb.wa, hb.wb) < rr * rr) return true; }
    return false;
  }
  nearestBodyPoint(x, z) {
    let best = null;
    for (const hb of this.hitboxes) {
      if (hb.off || (hb.part !== 'body' && hb.part !== 'neck' && hb.part !== 'legL' && hb.part !== 'legR')) continue;
      for (let i = 0; i <= 4; i++) {
        _v.lerpVectors(hb.wa, hb.wb, i / 4);
        const d = Math.hypot(_v.x - x, _v.z - z) - hb.r;
        if (!best || d < best.d) best = { d, x: _v.x, z: _v.z };
      }
    }
    return best;
  }
  // ハンターを体の外に押し出す
  pushOut(x, z, r) {
    const baseY = this.game.world.terrain.heightAt(x, z);
    _v2.set(x, baseY + 0.2, z); _v3.set(x, baseY + 1.7, z);
    let moved = false;
    for (const hb of this.hitboxes) {
      if (hb.off || hb.part === 'arm') continue;
      const rr = hb.r * 0.9 + r;
      const d2 = segSegDist2(_v2, _v3, hb.wa, hb.wb);
      if (d2 < rr * rr) {
        // 最近点の水平方向へ押し出す
        const ax = hb.wa.x, az = hb.wa.z, bx = hb.wb.x, bz = hb.wb.z;
        const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz;
        const t = l2 > 1e-6 ? clamp(((x - ax) * abx + (z - az) * abz) / l2, 0, 1) : 0;
        const cx = ax + abx * t, cz = az + abz * t;
        let ex = x - cx, ez = z - cz, el = Math.hypot(ex, ez);
        if (el < 1e-4) { ex = Math.sin(this.facing + Math.PI / 2); ez = Math.cos(this.facing + Math.PI / 2); el = 1; }
        const need = rr - Math.sqrt(d2);
        x += ex / el * need; z += ez / el * need;
        moved = true;
      }
    }
    return moved ? { x, z } : null;
  }

  // =================== 行動 ===================
  startAction(name, opts = {}) {
    const def = ACTIONS[name];
    if (name !== 'pounce' && name !== 'beastMove' && this.air !== 0 &&
        !(name === 'hold' && (this.variant === 'veira' || BESTIARY[this.variant]?.flying))) { this.air = 0; this._placeFeet(); }
    this.glow = 0;
    this.state = name;
    this.act = { name, def, t: 0, dur: opts.dur ?? (typeof def.dur === 'function' ? def.dur(this) : def.dur ?? 1), o: opts, id: (this.atkSeq += 10), d: {} };
    this.from.set(this.pose); this.blendT = 0; this.blendDur = opts.blend ?? def.blend ?? 0.25;
    if (def.enter) def.enter(this, this.act);
  }

  _decide() {
    if (!this.alive) return;
    if (this.scripted) { this.startAction('hold'); return; }   // 数式バトル：行動は台本（mathbattle.js）が決める
    const h = this.hunter;
    if (this.pendingEnrage) { this.pendingEnrage = false; this._enrage(); return; }
    if (this.demo) {
      const r = this.rng.next();
      if (r < 0.12) this.startAction('roar', { demo: true });
      else if (r < 0.55) this.startAction('wander');
      else this.startAction('idle');
      return;
    }
    if (this.limping && this.area !== 4 && !this.sleeping) { this.fled = true; this._leaveTo(4); return; }
    if (this.wantArea !== null && this.wantArea !== undefined) { const a = this.wantArea; this.wantArea = null; this._leaveTo(a); return; }
    if (!this.inCombat) {
      if (this.area === 4 && this.limping) { this.startAction('sleep'); return; }
      this.startAction(this.rng.chance(0.55) ? 'wander' : 'idle');
      return;
    }
    // 戦闘中
    if (h.state === 'dead') { this.startAction('idle', { dur: 2 }); return; }
    // 攻撃のあとは少し間をあける（反撃のチャンス）
    const prevAtk = this.lastWasAttack;
    this.lastWasAttack = false;
    if (prevAtk && this.rng.chance(this.enraged ? 0.35 : this.tired ? 0.9 : 0.7)) { this.startAction('threat'); return; }
    // キャンプにいるハンターは追わない
    if (Math.hypot(h.pos.x - CAMP.x, h.pos.z - CAMP.z) < 20) { this.lostT += 2; if (this.lostT > 6) { this._endCombat(); this.startAction('wander'); return; } this.startAction('idle', { dur: 1.5 }); return; }
    const rel = this._hunterRel();
    if (rel.dist > 60) { this.lostT += 1; if (this.lostT > 6) { this._endCombat(); this.startAction('wander'); return; } }
    else this.lostT = 0;
    const a = Math.abs(rel.ang), d = rel.dist;
    const W = [];
    const add = (n, w) => { if (w > 0) W.push([n, w * (this.recent.includes(n) ? 0.35 : 1)]); };
    if (a > 1.1) {
      if (d < 11) { add('tailSpin', 5); add('turn', 4); if (d < 6) add('stomp', 2); }
      else add('turn', 10);
    } else if (a > 0.45) {
      if (d < 9) { add('tailSpin', 3); add('turn', 3); add('bite', 1.5); add('stomp', 1.5); }
      else { add('turn', 6); add('fireball', 2); }
    } else {
      if (d < 7) { add('bite', 5); add('stomp', 2); add('tailSpin', 1.5); add('threat', 1); }
      else if (d < 15) { add('pounce', 3.5); add('fireball', 2.5); add('charge', 2.5); add('approach', 2); add('bite', d < 9 ? 2 : 0); }
      else if (d < 32) { add('charge', 4.5); add('fireball', 3); add('pounce', d < 20 ? 1.5 : 0); add('approach', 2); }
      else { add('approach', 6); add('charge', 2); }
    }
    let n = this.rng.weighted(W);
    this.recent.push(n); if (this.recent.length > 2) this.recent.shift();
    this.lastWasAttack = !!ACTIONS[n].attack;
    this.startAction(n);
  }

  _startCombat(roar = true) {
    if (this.inCombat || this.demo) return;
    this.inCombat = true;
    this.lostT = 0;
    this.game.onCombatStart();
    if (roar && this.alive) this.startAction('roar');
  }
  _endCombat() {
    if (!this.inCombat) return;
    this.inCombat = false;
    this.game.onCombatEnd();
  }
  loseTarget() {
    this._endCombat();
    if (this.alive && !this.sleeping && this.state !== 'leave') this.startAction('idle', { dur: 3 });
  }
  _leaveTo(areaId) {
    const path = areaPath(this.area, areaId);
    this.startAction('leave', { path: path.map(i => AREAS[i]), dest: areaId });
  }
  _enrage() {
    this.enraged = true; this.enrageT = MONSTER.enrageTime; this.tired = false;
    this.dmgSinceEnrage = 0;
    this.eyeMat.color.setHex(0xff3a20); this.eyeMat.emissive.setHex(0xff2200);
    this.mats.skin.emissive.setHex(0x2a0400);
    this.startAction('roar', { enrage: true });
  }

  // ---- ダメージを受けた ----
  receiveHit(hit) {
    if (!this.alive) return;
    const pdef = MONSTER.parts[hit.part];
    this.hp -= hit.damage;
    this.dmgSinceEnrage += hit.damage;
    const g = this.game;
    if (this.sleeping) { this.sleeping = false; this._startCombat(false); this.startAction('roar', { wake: true }); }
    else if (!this.inCombat && this.state !== 'leave') this._startCombat(true);
    if (this.hp <= 0) { this.hp = 0; this._die(); return; }
    // 尻尾切断
    if (hit.part === 'tail' && !this.tailCut) {
      this.tailDmg += hit.damage;
      if (this.tailDmg >= pdef.cutAt) this._cutTail();
    }
    // 怯み・転倒・部位破壊
    this.partDmg[hit.part] = (this.partDmg[hit.part] || 0) + hit.damage;
    const need = pdef.flinch * (pdef.trip ? this.tripBonus : 1) * (this.flinchScale ? this.flinchScale[hit.part] ?? 1 : 1);
    const canInterrupt = !['topple', 'dead', 'trapped', 'sleep'].includes(this.state) && this.air < 0.5;
    if (this.partDmg[hit.part] >= need) {
      this.partDmg[hit.part] = 0;
      if (hit.part === 'head' && !this.headBroken) {
        this.headFlinches++;
        if (this.headFlinches >= pdef.breakAt) this._breakHead();
      }
      if (hit.part === 'wingL' || hit.part === 'wingR') {
        const side = hit.part === 'wingL' ? 'L' : 'R';
        if (!this.wingBroken[side] && ++this.wingFlinches[side] >= pdef.breakAt) this._breakWing(side);
      }
      if (canInterrupt) {
        if (pdef.trip) { this.tripBonus *= 1.35; this.startAction('topple'); }
        else if (this.state !== 'roar' || !this.act.o.enrage) this.startAction('flinch', { part: hit.part });
      }
    }
    // 怒り
    if (!this.enraged && this.dmgSinceEnrage >= MONSTER.enrageEvery * this.maxHp) this.pendingEnrage = true;
    // 瀕死
    if (!this.limping && this.hp < this.maxHp * MONSTER.limpRatio) {
      this.limping = true;
      g.message(`${this.name}は足を引きずっている！`, 'info');
    }
    // エリア移動（体力が半分を切ったら一度だけ）
    if (!this.areaChanged && this.hp < this.maxHp * 0.55 && !this.limping) {
      this.areaChanged = true;
      if (this.rng.chance(0.7)) {
        const options = [1, 2, 3].filter(a => a !== this.area);
        this.wantArea = this.rng.pick(options);
      }
    }
  }
  _die() {
    this.alive = false; this.dead = true;
    this.sleeping = false; this.trapped = false;
    this.startAction('dead');
    this._endCombat();
    this.eyeMat.emissive.setHex(0x000000); this.eyeMat.color.setHex(0x333333);
    this.mats.skin.emissive.setHex(0x000000);
    this.game.onMonsterDead();
  }
  _breakHead() {
    this.headBroken = true;
    for (const g of this.horns) { if (this.skinned) g.scale.setScalar(0.42); else g.scale.set(1, 0.42, 1); }
    this.game.fx.sparks(this.hb.head.wb, 30, 0xfff0c0, 8);
    this.game.fx.explosion(this.hb.head.wa.clone(), 1);
    this.game.onPartBreak('頭部', BESTIARY[this.variant] ? `${this.name}の角` : this.variant === 'sektra' ? '熔晶竜の結晶角' : this.variant === 'veira' ? '蒼翼竜の角' : '焔角竜の角');
  }
  _breakWing(side) {
    this.wingBroken[side] = true;
    const bone = this.J['wing' + side];
    bone.scale.setScalar(0.55);
    bone.getWorldPosition(_v);
    this.game.fx.sparks(_v, 34, BESTIARY[this.variant]?.color || 0x9defff, 9);
    const partName = BESTIARY[this.variant]?.sidePart || '翼';
    this.game.onPartBreak(`${side === 'L' ? '左' : '右'}${partName}`, BESTIARY[this.variant] ? `${this.name}の${partName}` : '蒼翼竜の翼膜');
  }
  _cutTail() {
    this.tailCut = true;
    const J = this.J;
    // 切れた尻尾を別の物体として落とす
    const g = new THREE.Group();
    this.root.updateMatrixWorld(true);
    const base = J.tail[2];
    base.getWorldPosition(g.position);
    base.getWorldQuaternion(g.quaternion);
    const inv = new THREE.Matrix4().copy(base.matrixWorld).invert();
    if (this.skinned) {
      // 骨つきモデル：尻尾の先の骨を縮めて消し、別に用意した尻尾の部品を落とす
      if (this.tailPiece) { const c = this.tailPiece.clone(true); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); g.add(c); }
      base.scale.setScalar(0.001);
    }
    for (let i = 2; i < 5; i++) {
      for (const m of this.tailMeshes[i]) {
        const c = m.clone();
        c.matrixAutoUpdate = true;
        const mw = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
        mw.decompose(c.position, c.quaternion, c.scale);
        g.add(c);
        m.visible = false;
      }
      this.tailBoxes[i].off = true;
    }
    g.userData.vel = new THREE.Vector3(Math.sin(this.facing + Math.PI) * 2, 3, Math.cos(this.facing + Math.PI) * 2);
    g.userData.spin = (this.rng.next() - 0.5) * 4;
    g.userData.rest = false;
    this.game.scene.add(g);
    this.cutTail = g;
    if (!this.stump) {
      this.stump = part(J.tail[1], new THREE.CircleGeometry(0.66, 10), new THREE.MeshStandardMaterial({ color: this.variant === 'veira' ? 0x244d58 : 0x8a1a14, roughness: 0.6, side: THREE.DoubleSide }), 0, 0, -1.45, 0, 0, 0);
    }
    this.stump.visible = true;
    this.game.fx.hitBurst(g.position, true, true);
    this.game.onTailCut();
    if (this.alive && this.state !== 'topple') this.startAction('flinch', { part: 'tail' });
  }
  flash(p) {
    if (!this.alive || this.sleeping) return;
    const head = this.hb.head.wb;
    const dx = p.x - head.x, dz = p.z - head.z, d = Math.hypot(dx, dz);
    if (d > 32) return;
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - this.facing));
    if (ang > 1.35 && d > 4) return;
    const dur = [10, 7, 5, 4][Math.min(3, this.flashCount)];
    this.flashCount++;
    this._startCombat(false);
    this.game.message('モンスターの目がくらんだ！', 'good');
    this.startAction('blinded', { dur });
  }
  trap(p) {
    this.trapped = true;
    const dur = [8, 6, 4.5][Math.min(2, this.trapCount)];
    this.trapCount++;
    this._startCombat(false);
    this.game.message('雷撃罠にかかった！', 'good');
    this.startAction('trapped', { dur });
  }

  // =================== 毎フレーム ===================
  update(dt) {
    const g = this.game;
    this.speedMul = (this.diff?.speed || 1) * (this.enraged ? 1.18 : 1) * (this.tired ? 0.85 : 1);
    if (this.alive && !this.demo) {
      if (this.enraged) { this.enrageT -= dt; if (this.enrageT <= 0) { this.enraged = false; this.tired = true; this.tiredT = MONSTER.tiredTime; this.eyeMat.color.setHex(this.variant === 'veira' ? 0xa9f6ff : 0xffd23a); this.eyeMat.emissive.setHex(this.variant === 'veira' ? 0x37dfff : 0xffa010); this.mats.skin.emissive.setHex(0x000000); } }
      if (this.tired) { this.tiredT -= dt; if (this.tiredT <= 0) this.tired = false; }
      if (this.painted) { this.paintTime -= dt; if (this.paintTime <= 0) { this.painted = false; g.message('ペイントの効果が切れた', 'info'); } }
      // 発見
      const h = this.hunter;
      const rel = this._hunterRel();
      this.visibleToHunter = rel.dist < 45;
      if (!this.scripted && !this.inCombat && !this.sleeping && h.state !== 'dead' && this.state !== 'leave') {
        if (rel.dist < 12 || (rel.dist < MONSTER.sightRange && Math.abs(rel.ang) < 1.4)) this._startCombat(true);
      }
      if (this.inCombat && h.state === 'dead') this.lostT += dt * 0.2;
      this.area = g.world.terrain.areaAt(this.pos.x, this.pos.z).id;
    }
    // 行動
    const a = this.act;
    const adt = dt * (a && a.def.noScale ? 1 : this.speedMul);
    const fBefore = this.facing;
    const pBefore = _v3.copy(this.pos);
    if (a && this.frozen) { /* テスト用：動きを止める */ }
    else if (a) {
      a.t += adt;
      if (a.def.update) a.def.update(this, a, adt, dt);
      if (a.t >= a.dur && !a.def.loop) { if (this.act === a) this._decide(); }
    } else this._decide();
    if (!this.turnUsed) this.turnEase = Math.max(0, (this.turnEase || 0) - dt * 4);
    this.turnUsed = false;
    // 速度（足の踏み出しに使う）
    if (dt > 0) {
      this.vel.set((this.pos.x - pBefore.x) / dt, 0, (this.pos.z - pBefore.z) / dt);
      const turnRate = wrapAngle(this.facing - fBefore) / dt;
      this.tailLag = damp(this.tailLag, clamp(-turnRate * 0.35, -0.8, 0.8), 4, dt);
    }
    this.tailSway += dt * (this.inCombat ? 1.6 : 1.0);
    // 疲労のよだれ・怒りの吐息
    if (this.alive && this.tired && Math.random() < dt * 6) g.fx.drool(this.hb.jaw.wb);
    if (this.alive && this.enraged && Math.random() < dt * 5) g.fx.steam(this.hb.head.wb, _v.set(Math.sin(this.facing), -0.2, Math.cos(this.facing)));
    // ポーズ
    this._computePose(dt);
    this._apply(dt);
    // 当たり判定の更新
    for (const hb of this.hitboxes) hb.update();
    this.activeAttacks.length = 0;
    if (this.act && this.act.def.attacks && this.alive) this.act.def.attacks(this, this.act, this.activeAttacks);
    this._updateProjectiles(dt);
    this._updateCutTail(dt);
  }

  _computePose(dt) {
    const p = basePose(this.target);
    const a = this.act;
    if (this.variant === 'veira' || BESTIARY[this.variant]?.flying) p[P.wing] = 0.14 + Math.sin(this.game.time * 7.5) * (this.air > 0.5 ? 0.31 : 0.12);
    // 呼吸
    const br = Math.sin(this.game.time * (this.tired ? 3.2 : 1.6));
    p[P.chestX] += br * 0.02; p[P.neck1X] += br * 0.015;
    if (a && a.def.pose) a.def.pose(this, a, p);
    // 足を引きずる
    if (this.limping && this.alive && (this.state === 'leave' || this.state === 'wander' || this.state === 'approach')) { p[P.roll] += Math.sin(this.game.time * 5) * 0.06; p[P.headX] += 0.15; }
    if (this.tired) { p[P.neck1X] += 0.15; p[P.headX] += 0.1; p[P.jaw] += 0.15; }
    if (this.blendT < this.blendDur) {
      this.blendT += dt;
      const u = smooth(this.blendT / this.blendDur);
      for (let i = 0; i < NCH; i++) p[i] = lerp(this.from[i], p[i], u);
    }
    // 重い体らしく、姿勢を少し遅れて追わせる（カクッとした切り替わりをなくす）
    const k = dt > 0 && !this.snapPose && !this.smoothOff ? 1 - Math.exp(-(a && a.def.attack ? 26 : 16) * dt) : 1;
    const fk = p[P.legFK], lL = p[P.liftL], lR = p[P.liftR];
    for (let i = 0; i < NCH; i++) this.pose[i] += (p[i] - this.pose[i]) * k;
    this.pose[P.legFK] = fk; this.pose[P.liftL] = lL; this.pose[P.liftR] = lR;
    this.snapPose = false;
  }

  _apply(dt) {
    const p = this.pose, J = this.J;
    this.root.position.set(this.pos.x, this.pos.y + this.air, this.pos.z);
    // 歩くたびに体が持ち上がり、踏んでいる脚の側へ少し傾く。着地でわずかに沈む
    let bob = 0, sway = 0;
    if (p[P.legFK] < 0.5 && this.air < 0.2) for (const L of this.legs) if (L.stepping) { const sn = Math.sin(Math.min(1, L.stepT) * Math.PI); bob += sn * 0.09; sway += L.side * sn * 0.04; }
    const sdt = dt || 0.016;
    this.bob = damp(this.bob || 0, bob, 12, sdt); this.sway = damp(this.sway || 0, sway, 9, sdt);
    this.thud = damp(this.thud || 0, 0, 7, sdt);
    this.root.rotation.y = this.facing;
    J.pivot.position.y = p[P.drop];
    J.pivot.rotation.set(0, p[P.yawOff], p[P.roll] + this.sway);
    J.pelvis.position.y = HIP_H + p[P.bodyY] + this.bob - this.thud * 0.07;
    J.pelvis.rotation.set(p[P.pitch], 0, 0);
    J.spine.rotation.set(p[P.spineX], p[P.spineY], 0);
    J.chest.rotation.set(p[P.chestX], p[P.chestY], 0);
    // 頭をハンターへ向ける
    let ly = 0, lp = 0;
    const h = this.game.hunter;
    if (!this.demo && this.alive && h && p[P.look] > 0.01 && this.inCombat) {
      const hx = h.pos.x - this.pos.x, hz = h.pos.z - this.pos.z;
      ly = clamp(wrapAngle(Math.atan2(hx, hz) - this.facing - p[P.yawOff]), -0.9, 0.9) * p[P.look];
      lp = clamp((Math.hypot(hx, hz) < 9 ? 0.35 : 0.1), 0, 0.4) * p[P.look];
    }
    this.lookYaw = damp(this.lookYaw, ly, 4, dt); this.lookPitch = damp(this.lookPitch, lp, 3, dt);
    J.neck1.rotation.set(p[P.neck1X], p[P.neck1Y] + this.lookYaw * 0.4, 0);
    J.neck2.rotation.set(p[P.neck2X] + this.lookPitch * 0.4, p[P.neck2Y] + this.lookYaw * 0.3, 0);
    J.head.rotation.set(p[P.headX] + this.lookPitch * 0.3, p[P.headY] + this.lookYaw * 0.3, p[P.headZ]);
    J.jaw.rotation.set(p[P.jaw], 0, 0);
    J.armL.rotation.set(p[P.armLX], 0, 0.15); J.farmL.rotation.set(p[P.farmL], 0, 0);
    J.armR.rotation.set(p[P.armRX], 0, -0.15); J.farmR.rotation.set(p[P.farmR], 0, 0);
    if (J.wingL) J.wingL.rotation.set(0, 0, p[P.wing]);
    if (J.wingR) J.wingR.rotation.set(0, 0, -p[P.wing]);
    const amp = this.inCombat ? 0.07 : 0.05;
    const w = [0.5, 0.75, 0.95, 1.1, 1.2];
    for (let i = 0; i < 5; i++) {
      const sway = amp * (0.4 + i * 0.3) * Math.sin(this.tailSway - i * 0.6);
      J.tail[i].rotation.set(p[P.tailX] * w[i] + p[P.tailCurl] * (i * 0.12), (p[P.tailY] + this.tailLag) * w[i] * 0.55 + sway, 0);
    }
    this.mouthGlow.material.opacity = this.glow || 0;
    this.root.updateMatrixWorld(true);
    // 脚
    if (p[P.legFK] > 0.5 || this.air > 0.2) {
      J.thighL.rotation.set(p[P.thighLX], 0, p[P.thighLZ]); J.shinL.rotation.set(p[P.shinLX], 0, 0); J.footL.rotation.set(p[P.footLX], 0, 0);
      J.thighR.rotation.set(p[P.thighRX], 0, p[P.thighRZ]); J.shinR.rotation.set(p[P.shinRX], 0, 0); J.footR.rotation.set(p[P.footRX], 0, 0);
      if (this.air > 0.2 && p[P.legFK] < 0.5) {
        const k = clamp(this.air / 1.5, 0, 1);
        for (const s of ['L', 'R']) { J['thigh' + s].rotation.set(-0.45 - 0.6 * k, 0, 0); J['shin' + s].rotation.set(0.95 + 0.8 * k, 0, 0); J['foot' + s].rotation.set(-0.5 - 0.3 * k, 0, 0); }
      }
      this.root.updateMatrixWorld(true);
      for (const L of this.legs) { L.foot.getWorldPosition(L.cur); L.cur.y -= ANKLE_H; L.planted.copy(L.cur); L.planted.y = this.game.world.terrain.heightAt(L.cur.x, L.cur.z); L.stepping = false; }
      this.fkWas = true;
    } else {
      if (this.fkWas) { this.fkWas = false; for (const L of this.legs) { this._homePos(L, L.planted); L.cur.copy(L.planted); } }
      this._legsIK(dt, p);
    }
  }

  _homePos(L, out) {
    // 足を置く基本位置（体の少し前・横）
    out.set(L.side * 1.08, 0, 0.35).applyAxisAngle(UP, this.facing).add(this.pos);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.2) out.addScaledVector(this.vel, L.stepDur * 0.55);
    out.y = this.game.world.terrain.heightAt(out.x, out.z);
    return out;
  }

  _legsIK(dt, p) {
    const T = this.game.world.terrain;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const running = sp > 7;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i], O = this.legs[1 - i];
      L.stepDur = running ? 0.26 : sp > 2 ? 0.48 : 0.42;
      const home = this._homePos(L, _v);
      const dist = Math.hypot(home.x - L.planted.x, home.z - L.planted.z);
      L.idle += dt;
      const lift = p[i === 0 ? P.liftL : P.liftR];
      const thresh = running ? 2.2 : sp > 0.5 ? 1.25 : 0.55;
      if (!L.stepping && lift < 0.01 && (!O.stepping || running && O.stepT > 0.5) && (dist > thresh || (dist > 0.35 && L.idle > 0.6))) {
        L.stepping = true; L.stepT = 0; L.from.copy(L.planted); L.to.copy(home);
      }
      if (L.stepping) {
        L.stepT += dt / L.stepDur;
        const u = Math.min(1, L.stepT);
        L.to.copy(this._homePos(L, _v2));
        L.cur.lerpVectors(L.from, L.to, smooth(u));
        L.cur.y = lerp(L.from.y, L.to.y, u) + Math.sin(u * Math.PI) * (running ? 0.9 : 0.6);
        if (u >= 1) {
          L.stepping = false; L.planted.copy(L.to); L.idle = 0;
          this._footstep(L, running);
        }
      } else {
        L.cur.copy(L.planted);
      }
      // 足を持ち上げる（足踏み攻撃）
      const target = _v2.copy(L.cur);
      if (lift > 0) {
        _v.set(L.side * 1.1, 0, 0.9).applyAxisAngle(UP, this.facing).add(this.pos);
        target.lerp(_v, Math.min(1, lift)); target.y = L.cur.y + lift * 2.1;
      }
      target.y += ANKLE_H;
      // IK（膝は前へ）
      _v3.set(Math.sin(this.facing), 0.15, Math.cos(this.facing));
      solveIK2(L.thigh, L.shin, THIGH, SHIN, target, _v3);
      // 足の甲は下向き、つま先は前
      _e.set(-0.25 - lift * 0.6, this.facing + p[P.yawOff], 0, 'YXZ');
      _q.setFromEuler(_e);
      setWorldQuat(L.foot, _q);
    }
  }
  _footstep(L, running) {
    const g = this.game;
    this.thud = 1;
    g.fx.dust(L.planted, running ? 8 : 4, running ? 2.2 : 1.2);
    if (g.mode !== 'hunt') return;
    const d = L.planted.distanceTo(g.hunter.pos);
    if (d < 40) { g.sfx('step'); if (d < 18) g.camShake((running ? 0.12 : 0.05) * (1 - d / 18)); }
  }

  // ---- 火球 ----
  _spitFire() {
    const g = this.game, h = this.hunter;
    const mouth = this.hb.head.wb.clone();
    const tgt = this.demo ? mouth.clone().add(_v.set(Math.sin(this.facing) * 20, -4, Math.cos(this.facing) * 20))
      : this.aim ? new THREE.Vector3(this.aim.x, g.world.terrain.heightAt(this.aim.x, this.aim.z) + 0.3, this.aim.z)
        : h.pos.clone().add(_v.set(0, 0.8, 0));
    const dir = tgt.sub(mouth).normalize();
    // 前方以外には撃たない
    const fwd = this._forward(_v2);
    if (dir.x * fwd.x + dir.z * fwd.z < 0.4) dir.set(fwd.x, -0.15, fwd.z).normalize();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5010, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.add(glow);
    mesh.position.copy(mouth);
    g.scene.add(mesh);
    this.projectiles.push({ mesh, vel: dir.multiplyScalar(24), t: 0, id: (this.atkSeq += 10), exploded: false });
    g.sfx('fire');
  }
  _updateProjectiles(dt) {
    const g = this.game, T = g.world.terrain;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      pr.mesh.position.addScaledVector(pr.vel, dt);
      const p = pr.mesh.position;
      g.fx.fire(p, 2, 0.5);
      let boom = pr.t > 2.6 || p.y < T.heightAt(p.x, p.z) + 0.3 || T.sdAt(p.x, p.z) > 2;
      if (!this.demo && !boom) {
        // 直撃
        this.activeAttacks.push({ id: pr.id, kind: 'hit', shapes: [{ type: 'sphere', c: p, r: 0.9 }], damage: 28, knock: 'knockdown', power: 40, knockPower: 7, srcX: p.x - pr.vel.x, srcZ: p.z - pr.vel.z, onHit: () => { pr.hitHunter = true; } });
        if (pr.hitHunter) boom = true;
      }
      if (boom) {
        g.fx.explosion(p.clone(), 3);
        g.sfx('explode');
        if (g.mode === 'hunt') {
          const d = p.distanceTo(g.hunter.pos);
          if (d < 20) g.camShake(0.35 * (1 - d / 20));
          if (!pr.hitHunter && !this.demo) this.activeAttacks.push({ id: pr.id + 1, kind: 'hit', shapes: [{ type: 'sphere', c: p.clone(), r: 3.0 }], damage: 20, knock: 'knockdown', power: 35, knockPower: 6, srcX: p.x, srcZ: p.z });
        }
        g.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
  _updateCutTail(dt) {
    const t = this.cutTail;
    if (!t || t.userData.rest) return;
    const T = this.game.world.terrain;
    t.userData.vel.y -= 18 * dt;
    t.position.addScaledVector(t.userData.vel, dt);
    t.rotateY(t.userData.spin * dt);
    const gy = T.heightAt(t.position.x, t.position.z) + 0.55;
    if (t.position.y < gy) {
      t.position.y = gy;
      if (Math.abs(t.userData.vel.y) < 2) {
        t.userData.rest = true;
        // 地面に沿って寝かせる
        _v.set(0, 0, -1).applyQuaternion(t.quaternion); _v.y = 0; _v.normalize();
        t.quaternion.setFromUnitVectors(_v2.set(0, 0, -1), _v);
      } else { t.userData.vel.y *= -0.3; t.userData.vel.x *= 0.5; t.userData.vel.z *= 0.5; this.game.fx.dust(t.position, 6, 1.5); }
    }
  }

  // 攻撃の形をつくる
  _capsShapes(parts, extraR = 0.1) {
    const out = [];
    for (const hb of this.hitboxes) if (!hb.off && parts.includes(hb.part)) out.push({ type: 'capsule', a: hb.wa, b: hb.wb, r: hb.r + extraR });
    return out;
  }
  _atk(a, sub, o) {
    return Object.assign({ id: a.id + sub, kind: 'hit', srcX: this.pos.x, srcZ: this.pos.z, guardable: true }, o);
  }
}

// =================== 行動の定義 ===================
// t は行動開始からの時間（怒り・疲労で速さが変わる）
const ACTIONS = {
  idle: {
    dur: m => m.demo ? m.rng.range(2, 4) : m.rng.range(1.5, 3.5),
    pose(m, a, p) {
      const t = a.t;
      p[P.neck1Y] += Math.sin(t * 0.7) * 0.25; p[P.headX] += Math.sin(t * 0.5) * 0.08;
      if (!m.inCombat) p[P.look] = 0;
    },
  },
  // 攻撃のあいまの威嚇（ハンターの方を向く）
  threat: {
    dur: m => m.enraged ? m.rng.range(0.3, 0.7) : m.tired ? m.rng.range(1.4, 2.4) : m.rng.range(0.7, 1.4),
    enter(m) { if (m.rng.chance(0.4)) m.game.sfx('growl'); },
    update(m, a, dt) { if (!m.demo) m._turnToward(m._hunterRel().yaw, MONSTER.turnSpeed * 0.7, dt); },
    pose(m, a, p) { p[P.neck1X] += 0.12; p[P.headX] += 0.1; p[P.jaw] += 0.12 + Math.sin(a.t * 9) * 0.05; p[P.bodyY] = -0.1; },
  },
  // 数式バトルの待機：決まった場所（anchor）に戻って正面を向く。windup が上がるほど、次の攻撃の構えになる
  hold: {
    dur: 9999, loop: true,
    update(m, a, dt) {
      if (m.variant === 'veira' || BESTIARY[m.variant]?.flying) m.air = damp(m.air, m.wingBroken.L || m.wingBroken.R ? 1.18 : 1.9, 2.4, dt);
      const an = m.anchor;
      if (!an) return;
      const dx = an.x - m.pos.x, dz = an.z - m.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.04) { const sp = Math.min(MONSTER.walkSpeed * 0.8, d * 3); m._move(dx / d * sp * dt, dz / d * sp * dt); }
      m._turnToward(an.yaw, MONSTER.turnSpeed, dt);
      const w = m.windup || 0;
      m.glow = m.windKind === 'fireball' ? w * 0.6 : 0;
      if (m.windKind === 'fireball' && w > 0.3 && Math.random() < dt * 14 * w) m.game.fx.fire(m.hb.head.wb, 1, 0.25);
    },
    pose(m, a, p) {
      const w = smooth(m.windup || 0), k = m.windKind, t = a.t;
      p[P.bodyY] = -0.1 + Math.sin(t * 1.3) * 0.03;
      p[P.neck1X] += 0.1; p[P.headX] += 0.06;
      p[P.jaw] += 0.1 + Math.sin(t * 7) * 0.04 * (0.3 + w);
      p[P.neck1Y] += Math.sin(t * 0.9) * 0.12 * (1 - w);
      p[P.tailY] = Math.sin(t * 1.1) * 0.15;
      if (k === 'bite') { p[P.neck1X] -= 0.3 * w; p[P.headX] -= 0.15 * w; p[P.jaw] += 0.4 * w; p[P.bodyY] -= 0.14 * w; p[P.pitch] = -0.04 * w; }
      else if (k === 'stomp') { p[P.roll] += (m.windSide || 1) * 0.07 * w; p[P.bodyY] -= 0.12 * w; p[m.windSide > 0 ? P.liftR : P.liftL] = 0.22 * w * (0.6 + 0.4 * Math.sin(t * 5)); }
      else if (k === 'tailSpin') { p[P.bodyY] -= 0.28 * w; p[P.tailY] = Math.sin(t * 2.6) * 0.55 * w; p[P.tailX] += 0.12 * w; p[P.pitch] = 0.05 * w; }
      else if (k === 'fireball') { p[P.neck1X] -= 0.35 * w; p[P.chestX] -= 0.1 * w; p[P.jaw] += 0.3 * w; p[P.headX] -= 0.12 * w; }
      else if (k === 'crystalPillars') { p[P.bodyY] -= 0.35*w; p[P.pitch] -= 0.18*w; p[P.armLX] -= 0.85*w; p[P.armRX] -= 0.85*w; p[P.tailX] += 0.25*w; }
      else if (k === 'crystalRupture') { p[P.bodyY] -= 0.48*w; p[P.pitch] += 0.18*w; p[P.tailX] += 0.5*w; p[P.tailY] += Math.sin(t*5)*0.25*w; }
      else if (k === 'skyDive') { p[P.wing] = 0.55*w; p[P.pitch] = -0.16*w; p[P.tailX] += 0.28*w; }
      else if (k === 'galeSweep') { p[P.wing] = 0.68*w; p[P.roll] = (m.windSide || 1)*0.12*w; }
      else if (k === 'meteorBreath') { p[P.wing] = 0.92*w; p[P.neck1X] -= 0.42*w; p[P.jaw] += 0.58*w; }
      else if (m.windStyle) {
        const s = m.windStyle;
        const heavy = ['quake', 'slam', 'charge', 'root'].includes(s);
        const aerial = ['dive', 'wing', 'storm'].includes(s) && BESTIARY[m.variant]?.flying;
        p[P.bodyY] -= (heavy ? 0.32 : 0.17) * w;
        p[P.pitch] += (heavy ? 0.17 : -0.12) * w;
        p[P.tailY] += Math.sin(t * 4) * 0.18 * w;
        p[P.neck1X] -= 0.24 * w; p[P.jaw] += 0.36 * w;
        p[P.armLX] -= (s === 'claw' || s === 'sweep' ? 0.8 : 0.32) * w;
        p[P.armRX] -= (s === 'claw' || s === 'sweep' ? 0.8 : 0.32) * w;
        if (aerial) p[P.wing] += 0.6 * w;
      }
      p[P.look] = 1;
    },
  },
  // 新しい10体の固有技。style ごとに重心、部位、浮上、回転を変える。
  beastMove: {
    attack: true, dur: 3.25, blend: 0.11,
    update(m, a, dt) {
      const s = a.o.style;
      const fly = BESTIARY[m.variant]?.flying;
      const hit = a.o.hitAt || 1.12, an = m.anchor;
      if (an) {
        const rush = ['pounce','charge','lance','dive','phase','burrow'].includes(s) ?
          1.8 * smooth(phase(a.t, 0.30, hit * 0.92)) * (1 - smooth(phase(a.t, hit + 0.12, 2.65))) : 0;
        const sidestep = ['claw','sweep','wing','tail','spin'].includes(s) ?
          (a.o.dir || 1) * 0.85 * Math.sin(Math.PI * Math.min(1, a.t / 2.5)) : 0;
        m.pos.x = an.x + an.fx * rush + an.lx * sidestep;
        m.pos.z = an.z + an.fz * rush + an.lz * sidestep;
        m.pos.y = m.game.world.terrain.heightAt(m.pos.x, m.pos.z);
      }
      if (fly) {
        const jump = ['dive', 'storm', 'phase'].includes(s) ? 2.3 * Math.sin(Math.PI * Math.min(1, a.t / 2.25)) : 0;
        m.air = damp(m.air, (m.wingBroken.L || m.wingBroken.R ? 1.1 : 1.85) + jump, 5, dt);
      } else if (['pounce', 'burrow', 'phase'].includes(s)) {
        m.air = Math.sin(Math.PI * Math.min(1, a.t / 1.35)) * (s === 'burrow' ? -0.72 : 1.0);
      }
      m.glow = ['breath', 'pulse', 'storm', 'quake'].includes(s) ?
        Math.max(0, 0.8 * (1 - Math.abs(a.t - (a.o.hitAt || 1.2)) / 1.2)) : 0;
    },
    pose(m, a, p) {
      const s = a.o.style, hit = a.o.hitAt || 1.12, t = a.t;
      const charge = smooth(phase(t, 0, hit * 0.62)) * (1 - smooth(phase(t, hit * 0.84, hit + 0.06)));
      const swing = smooth(phase(t, hit * 0.76, hit + 0.08)) * (1 - smooth(phase(t, hit + 0.45, 2.8)));
      const side = a.o.dir || 1;
      if (['charge', 'pounce', 'dive', 'phase', 'burrow'].includes(s)) {
        p[P.bodyY] = -0.34*charge + 0.16*swing;
        p[P.pitch] = -0.28*charge + 0.52*swing;
        p[P.neck1X] -= 0.42*charge; p[P.headX] += 0.35*swing;
        p[P.armLX] -= 0.75*swing; p[P.armRX] -= 0.75*swing;
        p[P.wing] += 0.5*charge - 0.45*swing;
      } else if (['claw', 'sweep', 'wing', 'lance', 'tail'].includes(s)) {
        p[P.roll] = side * (0.20*charge - 0.38*swing);
        p[P.yawOff] = side * (0.28*charge - 0.66*swing);
        p[P.armLX] -= 0.9*charge - 0.72*swing;
        p[P.armRX] -= 0.6*charge - 0.58*swing;
        p[P.tailY] = side * (0.9*charge - 1.12*swing);
        p[P.tailCurl] = 0.55*swing;
        p[P.wing] += 0.8*charge - 0.55*swing;
      } else if (['slam', 'quake', 'root'].includes(s)) {
        p[P.bodyY] = -0.24*charge - 0.62*swing;
        p[P.pitch] = -0.35*charge + 0.43*swing;
        p[P.armLX] -= 1.2*charge - 0.65*swing;
        p[P.armRX] -= 1.2*charge - 0.65*swing;
        p[P.tailX] += 0.45*charge - 0.2*swing;
      } else if (s === 'spin') {
        p[P.yawOff] = side * (0.25*charge + 5.9*swing);
        p[P.tailY] = 1.0*swing; p[P.bodyY] = -0.2*swing;
        p[P.armLX] -= 0.7*swing; p[P.armRX] -= 0.7*swing;
      } else {
        p[P.neck1X] -= 0.58*charge - 0.28*swing;
        p[P.headX] -= 0.24*charge - 0.18*swing;
        p[P.jaw] = 0.28*charge + 0.95*swing;
        p[P.chestX] -= 0.16*charge;
        p[P.wing] += 0.65*charge + 0.22*swing;
      }
      if (a.o.followAt) {
        const second = smooth(phase(t, a.o.followAt-0.62, a.o.followAt+0.1)) *
          (1-smooth(phase(t, a.o.followAt+0.50, a.o.followAt+1.25)));
        if (['quake','slam','root'].includes(s)) {
          p[P.bodyY] -= 0.55*second; p[P.pitch] += 0.34*second;
          p[P.armLX] -= 0.75*second; p[P.armRX] -= 0.75*second;
        } else if (['claw','sweep','wing','tail'].includes(s)) {
          p[P.roll] += side*0.35*second; p[P.yawOff] += side*0.58*second;
          p[P.tailY] -= side*0.88*second; p[P.wing] += 0.55*second;
        } else {
          p[P.jaw] += 0.70*second; p[P.neck1X] -= 0.30*second;
          p[P.wing] += 0.42*second;
        }
      }
      p[P.look] = 0.2;
    },
  },
  // ヴェイラ：翼を畳んで上空から狙った立ち位置へ急降下する。
  skyDive: {
    attack: true, dur: 3.4, blend: 0.10,
    enter(m, a) { a.d.done = false; },
    update(m, a, dt) {
      if (a.t < 0.55) m.air = 2 + 2.4*smooth(phase(a.t, 0, 0.55));
      else if (a.t < 1.15) m.air = 4.4 - 3.9*smooth(phase(a.t, 0.55, 1.15));
      else m.air = 0.5 + 1.4*smooth(phase(a.t, 1.18, 3.0));
      if (!a.d.done && a.t >= 1.08) {
        a.d.done = true;
        const spot = m.game.math?.spots[a.o.lane ?? 1];
        if (spot) {
          const y = m.game.world.terrain.heightAt(spot.x, spot.z);
          const at = new THREE.Vector3(spot.x, y+0.1, spot.z);
          m.game.fx.bigDust(at, 3.6);
          m.game.fx.sparks(at, 24, 0x92eaff, 8);
          m.game.camShake(0.5);
          m.game.sfx('stomp');
        }
      }
    },
    pose(m, a, p) {
      const dive = smooth(phase(a.t, 0.53, 0.85))*(1-smooth(phase(a.t, 1.1, 1.48)));
      const recover = smooth(phase(a.t, 1.15, 2.2));
      p[P.wing] = 0.25 - 0.50*dive + 0.35*recover;
      p[P.pitch] = -0.55*dive + 0.18*recover;
      p[P.neck1X] -= 0.25*dive;
      p[P.armLX] -= 0.5*dive; p[P.armRX] -= 0.5*dive;
      p[P.tailX] += 0.34*dive;
      p[P.look] = 0.2;
    },
  },
  // ヴェイラ：片翼を大きく振り、隣り合う二つの立ち位置を薙ぐ。
  galeSweep: {
    attack: true, dur: 3.0, blend: 0.12,
    enter(m, a) { a.d.done = false; },
    update(m, a, dt) {
      m.air = damp(m.air, 2.15, 4, dt);
      if (!a.d.done && a.t >= 1.10) {
        a.d.done = true;
        for (const lane of a.o.lanes || [0,1]) {
          const spot = m.game.math?.spots[lane];
          if (!spot) continue;
          const at = new THREE.Vector3(spot.x, m.game.world.terrain.heightAt(spot.x,spot.z)+0.2, spot.z);
          m.game.fx.ring(at, 3.4, 0x8deaff, 0.5, true);
          m.game.fx.sparks(at, 18, 0x9cefff, 7);
        }
        m.game.camShake(0.3);
        m.game.sfx('roar');
      }
    },
    pose(m, a, p) {
      const wind = smooth(phase(a.t, 0, 0.85))*(1-smooth(phase(a.t, 1.08, 1.27)));
      const slash = smooth(phase(a.t, 1.05, 1.25))*(1-smooth(phase(a.t, 1.8, 3)));
      p[P.wing] = 0.95*wind - 0.32*slash;
      p[P.roll] = (a.o.dir || 1)*(0.14*wind - 0.23*slash);
      p[P.pitch] = -0.12*wind + 0.12*slash;
      p[P.tailY] = (a.o.dir || 1)*0.25*slash;
      p[P.look] = 0.25;
    },
  },
  // ヴェイラの大技：高度を上げ、三か所すべてへ蒼い衝撃波を落とす。
  meteorBreath: {
    attack: true, dur: 4.3, blend: 0.12,
    enter(m, a) { a.d.done = false; },
    update(m, a, dt) {
      m.air = a.t < 1.55 ? 2.0 + 2.8*smooth(phase(a.t, 0, 1.3))
        : 4.8 - 2.9*smooth(phase(a.t, 1.55, 4.2));
      m.glow = a.t < 1.5 ? 0.85*smooth(phase(a.t, 0.1, 1.3)) : Math.max(0, 0.85-(a.t-1.5)*0.65);
      if (!a.d.done && a.t >= 1.48) {
        a.d.done = true;
        for (const spot of m.game.math?.spots || []) {
          const at = new THREE.Vector3(spot.x, m.game.world.terrain.heightAt(spot.x,spot.z)+0.2, spot.z);
          m.game.fx.bigDust(at, 4.3);
          m.game.fx.ring(at, 4.0, 0x7deaff, 0.7, true);
          m.game.fx.sparks(at, 38, 0xc3faff, 10);
        }
        m.game.camShake(0.85);
        m.game.sfx('fire');
      }
    },
    pose(m, a, p) {
      const charge = smooth(phase(a.t, 0, 1.35))*(1-smooth(phase(a.t, 1.5, 1.72)));
      const blast = smooth(phase(a.t, 1.47, 1.73))*(1-smooth(phase(a.t, 2.9, 4.3)));
      p[P.wing] = 1.10*charge + 0.36*blast;
      p[P.neck1X] -= 0.56*charge - 0.32*blast;
      p[P.headX] -= 0.27*charge - 0.16*blast;
      p[P.jaw] = 0.35*charge + 0.88*blast;
      p[P.pitch] = -0.18*charge + 0.22*blast;
      p[P.tailX] += 0.38*charge;
      p[P.look] = 0.4;
    },
  },
  // セクトラ：両腕を振り上げ、左右の立ち位置に結晶柱を突き上げる。
  crystalPillars: {
    attack: true, dur: 2.8, blend: 0.12,
    pose(m, a, p) {
      const rear = smooth(phase(a.t, 0, 0.68)) * (1 - smooth(phase(a.t, 0.9, 1.08)));
      const slam = smooth(phase(a.t, 0.95, 1.14)) * (1 - smooth(phase(a.t, 1.8, 2.8)));
      p[P.bodyY] = -0.2*rear - 0.57*slam;
      p[P.pitch] = -0.18*rear + 0.22*slam;
      p[P.armLX] -= 1.25*rear - 0.7*slam;
      p[P.armRX] -= 1.25*rear - 0.7*slam;
      p[P.farmL] += 0.75*rear - 0.3*slam;
      p[P.farmR] += 0.75*rear - 0.3*slam;
      p[P.neck1X] += 0.27*slam;
      p[P.tailX] += 0.18*rear;
      p[P.jaw] = 0.3*rear + 0.55*slam;
      p[P.look] = 0.3;
    },
  },
  // セクトラ：尾で大地を割る。中央を打ったあと左右へ裂け目が走る二段技。
  crystalRupture: {
    attack: true, dur: 5.1, blend: 0.12,
    pose(m, a, p) {
      const rear = smooth(phase(a.t, 0, 0.8)) * (1 - smooth(phase(a.t, 1.0, 1.2)));
      const first = smooth(phase(a.t, 1.02, 1.22)) * (1 - smooth(phase(a.t, 2.0, 2.75)));
      const sweep = smooth(phase(a.t, 2.65, 3.65)) * (1 - smooth(phase(a.t, 4.0, 5.1)));
      p[P.bodyY] = -0.3*rear - 0.64*first - 0.52*sweep;
      p[P.pitch] = 0.24*rear - 0.24*first + 0.15*sweep;
      p[P.tailX] += 0.72*rear - 0.42*first + 0.35*sweep;
      p[P.tailY] = 0.75*Math.sin(phase(a.t, 2.5, 4.0)*Math.PI)*sweep;
      p[P.tailCurl] = 0.48*sweep;
      p[P.neck1X] += -0.2*rear + 0.32*first;
      p[P.headX] += -0.15*rear + 0.2*first;
      p[P.armLX] -= 0.45*first + 0.65*sweep;
      p[P.armRX] -= 0.45*first + 0.65*sweep;
      p[P.jaw] = 0.4*first + 0.25*sweep;
      p[P.look] = 0.2;
    },
  },
  wander: {
    dur: m => m.rng.range(4, 7),
    enter(m, a) {
      const ar = AREAS[m.area] || AREAS[2];
      const ang = m.rng.range(0, TAU), r = m.rng.range(0, ar.r * 0.55);
      a.d.tx = ar.x + Math.cos(ang) * r; a.d.tz = ar.z + Math.sin(ang) * r;
    },
    update(m, a, dt) {
      const dx = a.d.tx - m.pos.x, dz = a.d.tz - m.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.5) { a.t = a.dur; return; }
      m._turnToward(Math.atan2(dx, dz), 1.2, dt);
      const f = Math.cos(wrapAngle(Math.atan2(dx, dz) - m.facing));
      const sp = MONSTER.walkSpeed * (m.limping ? 0.55 : 0.75) * Math.max(0, f);
      m._move(Math.sin(m.facing) * sp * dt, Math.cos(m.facing) * sp * dt);
    },
    pose(m, a, p) { p[P.look] = 0; p[P.neck1X] += 0.08; p[P.headX] += 0.12; p[P.neck1Y] = Math.sin(a.t * 0.8) * 0.2; },
  },
  approach: {
    dur: 3.2,
    update(m, a, dt) {
      const rel = m._hunterRel();
      m._turnToward(rel.yaw, MONSTER.turnSpeed, dt);
      if (rel.dist < 8) { a.t = a.dur; return; }
      const f = Math.max(0, Math.cos(wrapAngle(rel.yaw - m.facing)));
      const sp = MONSTER.walkSpeed * (m.limping ? 0.6 : 1.15) * f;
      m._move(Math.sin(m.facing) * sp * dt, Math.cos(m.facing) * sp * dt);
    },
  },
  turn: {
    dur: 2.0,
    enter(m, a) { a.d.yaw = m.demo ? m.facing + 1 : m._hunterRel().yaw; },
    update(m, a, dt) {
      if (!m.demo) a.d.yaw = m._hunterRel().yaw;
      const done = m._turnToward(a.d.yaw, MONSTER.turnSpeed * 1.25, dt);
      if (done && a.t > 0.3) a.t = a.dur;
    },
    pose(m, a, p) { p[P.bodyY] = -0.08; p[P.tailY] = 0.2 * Math.sin(a.t * 3); },
  },
  // 咆哮
  roar: {
    dur: 2.7, noScale: true,
    enter(m, a) {
      a.d.fired = false;
      if (!m.demo) m.game.message(a.o.enrage ? `${m.name}は怒り状態になった！` : '', a.o.enrage ? 'warn' : 'info');
    },
    update(m, a, dt) {
      if (!m.demo && a.t < 0.45) m._turnToward(m._hunterRel().yaw, 2.2, dt);
      if (!a.d.fired && a.t >= 0.5) {
        a.d.fired = true;
        const g = m.game;
        if (!m.demo) g.sfx('roar');
        g.fx.roarWave(m.hb.head.wb.clone());
        if (g.mode === 'hunt') { const d = m.pos.distanceTo(g.hunter.pos); g.camShake(d < 30 ? 0.7 : 0.3); }
      }
      if (a.t > 0.5 && a.t < 2.1 && Math.random() < dt * 20) m.game.camShake(0.03);
    },
    attacks(m, a, out) {
      if (m.demo || a.o.demo) return;
      if (a.t >= 0.5 && a.t < 0.62) out.push(m._atk(a, 0, { kind: 'roar', radius: MONSTER.roarRange, duration: 1.7, damage: 0, power: 0 }));
    },
    pose(m, a, p) {
      const t = a.t;
      const up = smooth(phase(t, 0, 0.45)) * (1 - smooth(phase(t, 2.2, 2.7)));
      const shake = t > 0.5 && t < 2.2 ? Math.sin(t * 38) * 0.04 : 0;
      p[P.neck1X] += -0.45 * up; p[P.neck2X] += -0.15 * up; p[P.headX] += -0.25 * up + shake;
      p[P.jaw] = lerp(0.05, 0.85, up); p[P.chestX] += -0.15 * up; p[P.pitch] = 0.1 * up; p[P.tailX] += 0.15 * up;
      p[P.armLX] -= 0.4 * up; p[P.armRX] -= 0.4 * up; p[P.look] = 1 - up;
    },
  },
  // 噛みつき
  bite: {
    attack: true,
    dur: 1.95,
    enter(m, a) { a.d.prev = 0; },
    update(m, a, dt) {
      if (a.t < 0.55 && !m.demo) m._turnToward(m._hunterRel().yaw, 1.6, dt);
      const d = track(a.t, [[0, 0], [0.62, -0.2], [0.9, 2.3], [1.2, 2.3]]);
      const dd = d - a.d.prev; a.d.prev = d;
      m._move(Math.sin(m.facing) * dd, Math.cos(m.facing) * dd);
      if (a.t >= 0.84 && !a.d.snd) { a.d.snd = true; m.game.sfx('bite'); }
    },
    attacks(m, a, out) {
      if (a.t >= 0.68 && a.t <= 0.9) out.push(m._atk(a, 0, { shapes: m._capsShapes(['head'], 0.25), damage: 24, knock: 'flinch', power: 28 }));
    },
    pose(m, a, p) {
      const t = a.t;
      const back = smooth(phase(t, 0, 0.6)) * (1 - smooth(phase(t, 0.62, 0.8)));
      const strike = smooth(phase(t, 0.62, 0.86)) * (1 - smooth(phase(t, 1.25, 1.95)));
      p[P.neck1X] += -0.35 * back + 0.62 * strike; p[P.neck2X] += 0.1 * strike; p[P.headX] += -0.2 * back + 0.3 * strike;
      p[P.jaw] = 0.7 * back + (t > 0.62 && t < 0.86 ? 0.7 * (1 - phase(t, 0.62, 0.86)) : 0) + 0.05;
      p[P.chestX] += 0.15 * strike; p[P.pitch] = 0.08 * strike - 0.05 * back; p[P.bodyY] = -0.25 * strike;
      p[P.look] = back > 0.1 ? 0.6 : 0.2;
    },
  },
  // 尻尾回転
  tailSpin: {
    attack: true,
    dur: 2.6,
    enter(m, a) { a.d.dir = m.rng.chance(0.5) ? 1 : -1; a.d.base = m.facing; a.d.spun = 0; },
    update(m, a, dt) {
      const k = smooth(phase(a.t, 0.7, 1.45));
      const ang = a.d.dir * (k * TAU - 0.45 * smooth(phase(a.t, 0, 0.7)) * (1 - k));
      m.facing = a.d.base + ang;
      if (a.t > 0.72 && !a.d.snd) { a.d.snd = true; m.game.sfx('swingHeavy'); }
      if (a.t > 1.5 && !m.demo) m._turnToward(m._hunterRel().yaw, 0.6, dt);
    },
    attacks(m, a, out) {
      if (a.t >= 0.78 && a.t <= 1.42) out.push(m._atk(a, 0, { shapes: m._capsShapes(['tail'], 0.35), damage: 30, knock: 'knockdown', power: 45, knockPower: 8 }));
    },
    pose(m, a, p) {
      const crouch = smooth(phase(a.t, 0, 0.6)) * (1 - smooth(phase(a.t, 1.5, 2.3)));
      const spin = phase(a.t, 0.7, 1.45);
      p[P.bodyY] = -0.3 * crouch; p[P.pitch] = 0.06 * crouch;
      p[P.tailY] = a.d.dir * (-0.5 * crouch + (spin > 0 && spin < 1 ? 0.9 * Math.sin(spin * Math.PI) : 0));
      p[P.tailX] += 0.12 * crouch; p[P.neck1Y] = a.d.dir * 0.3 * crouch; p[P.look] = 0.3;
      p[P.roll] = a.d.dir * 0.08 * Math.sin(spin * Math.PI);
      if (a.t > 0.66 && a.t < 1.5) legsStandFK(p);
    },
  },
  // 突進（通り過ぎて、振り返る）
  charge: {
    attack: true,
    dur: 6,
    enter(m, a) { a.d.phase = 'wind'; a.d.runT = 0; a.d.count = a.o.count || (m.enraged && m.rng.chance(0.6) ? 2 : 1); a.d.passed = false; a.d.brakeT = 0; },
    update(m, a, dt) {
      const g = m.game;
      const rel = m.demo ? { yaw: m.facing, dist: 30 } : m._hunterRel();
      if (a.d.phase === 'wind') {
        m._turnToward(rel.yaw, 2.2, dt);
        if (a.t > 0.3 && !a.d.snd) { a.d.snd = true; g.sfx('growl'); }
        if (Math.random() < dt * 8) g.fx.dust(m.legs[1].cur, 2, 1.2);
        if (a.t >= 0.95) { a.d.phase = 'run'; a.d.runT = 0; }
      } else if (a.d.phase === 'run') {
        a.d.runT += dt;
        if (a.d.runT < 0.7 && !m.demo) m._turnToward(rel.yaw, 0.9, dt);
        const sp = MONSTER.runSpeed * Math.min(1, 0.4 + a.d.runT * 2.5);
        const blocked = m._move(Math.sin(m.facing) * sp * dt, Math.cos(m.facing) * sp * dt);
        if (!m.demo && !a.d.passed && Math.abs(rel.ang) > 1.9 && rel.dist > 4) a.d.passed = true;
        if (blocked || a.d.runT > 2.4 || (a.d.passed && a.d.runT > 0.9)) { a.d.phase = 'brake'; a.d.brakeT = 0; a.d.sp = sp; }
      } else if (a.d.phase === 'brake') {
        a.d.brakeT += dt;
        const sp = a.d.sp * Math.max(0, 1 - a.d.brakeT / 0.7);
        m._move(Math.sin(m.facing) * sp * dt, Math.cos(m.facing) * sp * dt);
        if (Math.random() < dt * 20) g.fx.dust(m.legs[a.d.brakeT < 0.35 ? 0 : 1].cur, 2, 2);
        if (a.d.brakeT > 0.7) { a.d.phase = 'turn'; a.d.turnT = 0; }
      } else if (a.d.phase === 'turn') {
        a.d.turnT += dt;
        const done = m._turnToward(rel.yaw, MONSTER.turnSpeed * 1.6, dt);
        if ((done && a.d.turnT > 0.4) || a.d.turnT > 1.6) {
          a.d.count--;
          if (a.d.count > 0 && !m.demo) { a.d.phase = 'run'; a.d.runT = 0; a.d.passed = false; }
          else { a.t = a.dur; }
        }
      }
    },
    attacks(m, a, out) {
      if (a.d.phase === 'run' && a.d.runT > 0.12 || a.d.phase === 'brake' && a.d.brakeT < 0.35) {
        out.push(m._atk(a, a.d.count, { shapes: m._capsShapes(['head', 'neck', 'body', 'legL', 'legR'], 0.15), damage: 34, knock: 'knockdown', power: 60, knockPower: 10 }));
      }
    },
    pose(m, a, p) {
      const ph = a.d.phase;
      if (ph === 'wind') {
        const k = smooth(phase(a.t, 0, 0.5));
        p[P.neck1X] += 0.3 * k; p[P.headX] += 0.15 * k; p[P.bodyY] = -0.3 * k; p[P.pitch] = 0.1 * k; p[P.jaw] = 0.2 + Math.sin(a.t * 12) * 0.1;
        p[P.liftR] = Math.max(0, Math.sin(a.t * 9)) * 0.25 * k;
      } else if (ph === 'run') {
        p[P.neck1X] += 0.35; p[P.headX] += 0.1; p[P.pitch] = 0.14; p[P.bodyY] = -0.2 + Math.abs(Math.sin(m.game.time * 14)) * 0.15; p[P.tailX] += 0.15; p[P.jaw] = 0.3; p[P.look] = 0;
      } else if (ph === 'brake') {
        p[P.pitch] = -0.12; p[P.neck1X] += -0.1; p[P.bodyY] = -0.35; p[P.look] = 0;
      } else { p[P.bodyY] = -0.12; p[P.look] = 0.5; }
    },
  },
  // 飛びかかり
  pounce: {
    attack: true,
    dur: 2.95,
    enter(m, a) {
      a.d.jumped = false; a.d.landed = false;
      const rel = m.demo ? { dist: 12, yaw: m.facing } : m._hunterRel();
      a.d.dist = clamp(rel.dist - 1.0, 5, 17);
    },
    update(m, a, dt) {
      const g = m.game;
      if (a.t < 0.72) { if (!m.demo) m._turnToward(m._hunterRel().yaw, 2.0, dt); }
      else if (a.t < 1.55) {
        if (!a.d.jumped) { a.d.jumped = true; a.d.start = m.pos.clone(); g.fx.dust(m.pos, 10, 2); g.sfx('roll'); }
        const u = phase(a.t, 0.72, 1.55);
        const sp = a.d.dist / 0.83;
        m._move(Math.sin(m.facing) * sp * dt, Math.cos(m.facing) * sp * dt);
        m.air = Math.sin(u * Math.PI) * 3.6;
      } else {
        m.air = 0;
        if (!a.d.landed) {
          a.d.landed = true;
          g.fx.bigDust(m.pos.clone(), 4);
          g.sfx('stomp');
          if (g.mode === 'hunt') { const d = m.pos.distanceTo(g.hunter.pos); g.camShake(d < 25 ? 0.6 * (1 - d / 25) + 0.1 : 0); }
          m._placeFeet();
        }
      }
    },
    attacks(m, a, out) {
      if (a.t >= 1.2 && a.t < 1.62) out.push(m._atk(a, 0, { shapes: m._capsShapes(['body', 'legL', 'legR', 'head', 'neck'], 0.25), damage: 32, knock: 'knockdown', power: 55, knockPower: 8 }));
      if (a.t >= 1.55 && a.t < 1.7) out.push(m._atk(a, 1, { kind: 'tremor', shapes: [{ type: 'cylinder', c: m.pos, r: 7.5, h: 1.2 }], damage: 0, power: 10 }));
    },
    pose(m, a, p) {
      const t = a.t;
      const crouch = smooth(phase(t, 0, 0.7)) * (1 - smooth(phase(t, 0.72, 0.9)));
      const flight = t > 0.72 && t < 1.55 ? 1 : 0;
      const land = smooth(phase(t, 1.55, 1.7)) * (1 - smooth(phase(t, 1.9, 2.9)));
      p[P.bodyY] = -0.75 * crouch - 0.6 * land; p[P.pitch] = 0.12 * crouch - 0.12 * flight + 0.18 * land;
      p[P.neck1X] += 0.25 * crouch - 0.2 * flight + 0.35 * land; p[P.jaw] = 0.6 * flight + 0.1; p[P.tailX] += 0.25 * flight;
      p[P.armLX] -= 0.9 * flight; p[P.armRX] -= 0.9 * flight; p[P.look] = 0.3;
    },
  },
  // 火球
  fireball: {
    attack: true,
    dur: 2.5,
    enter(m, a) { a.d.fired = false; },
    update(m, a, dt) {
      const g = m.game;
      if (a.t < 0.85 && !m.demo) m._turnToward(m._hunterRel().yaw, 1.8, dt);
      m.glow = a.t < 0.95 ? smooth(phase(a.t, 0.2, 0.9)) * 0.8 : Math.max(0, 0.8 - (a.t - 0.95) * 3);
      if (a.t > 0.25 && a.t < 0.95 && Math.random() < dt * 25) g.fx.fire(m.hb.head.wb, 1, 0.3);
      if (!a.d.fired && a.t >= 0.95) {
        a.d.fired = true;
        if (m.tired && m.rng.chance(0.75)) { g.fx.smoke(m.hb.head.wb, 10, 0x6a6460); g.sfx('growl'); if (!m.demo) g.message('火球が不発に終わった（疲れている）', 'info'); }
        else m._spitFire();
      }
      if (a.t >= a.dur - 0.05) m.glow = 0;
    },
    pose(m, a, p) {
      const t = a.t;
      const rear = smooth(phase(t, 0, 0.8)) * (1 - smooth(phase(t, 0.9, 1.05)));
      const spit = smooth(phase(t, 0.9, 1.02)) * (1 - smooth(phase(t, 1.5, 2.5)));
      p[P.neck1X] += -0.45 * rear + 0.25 * spit; p[P.headX] += -0.2 * rear + 0.05 * spit; p[P.jaw] = 0.3 * rear + 0.8 * spit;
      p[P.chestX] += -0.12 * rear; p[P.bodyY] = -0.1 * rear - 0.25 * spit; p[P.pitch] = -0.05 * rear + 0.05 * spit; p[P.look] = 0.5;
    },
  },
  // 足踏み
  stomp: {
    attack: true,
    dur: 1.9,
    enter(m, a) { a.d.side = a.o.side || (m.rng.chance(0.5) ? 'liftR' : 'liftL'); a.d.done = false; },
    update(m, a, dt) {
      if (!a.d.done && a.t >= 0.66) {
        a.d.done = true;
        const L = m.legs[a.d.side === 'liftL' ? 0 : 1];
        const g = m.game;
        g.fx.bigDust(L.cur.clone(), 3);
        g.sfx('stomp');
        a.d.foot = L.cur.clone();
        if (g.mode === 'hunt') { const d = L.cur.distanceTo(g.hunter.pos); g.camShake(d < 20 ? 0.5 * (1 - d / 20) + 0.1 : 0); }
      }
    },
    attacks(m, a, out) {
      if (a.t >= 0.6 && a.t < 0.7) out.push(m._atk(a, 0, { shapes: m._capsShapes([a.d.side === 'liftL' ? 'legL' : 'legR'], 0.4), damage: 18, knock: 'flinch', power: 30 }));
      if (a.d.foot && a.t >= 0.66 && a.t < 0.8) out.push(m._atk(a, 1, { kind: 'tremor', shapes: [{ type: 'cylinder', c: a.d.foot, r: 7, h: 1.2 }], damage: 0, power: 10 }));
    },
    pose(m, a, p) {
      const up = smooth(phase(a.t, 0, 0.5)) * (1 - easeIn(phase(a.t, 0.55, 0.66)));
      p[a.d.side] = up;
      p[P.roll] = (a.d.side === 'liftR' ? 0.08 : -0.08) * up; p[P.bodyY] = -0.15 * up; p[P.neck1X] += 0.1 * up;
    },
  },
  // 怯み
  flinch: {
    dur: 1.35, blend: 0.08,
    enter(m, a) { a.d.dir = m.rng.chance(0.5) ? 1 : -1; m.game.sfx('growl'); },
    update(m, a, dt) { if (a.t < 0.4) m._move(-Math.sin(m.facing) * 1.2 * dt, -Math.cos(m.facing) * 1.2 * dt); },
    pose(m, a, p) {
      const k = Math.sin(phase(a.t, 0, 1.3) * Math.PI);
      const part = a.o.part;
      if (part === 'tail') { p[P.tailY] = a.d.dir * 0.6 * k; p[P.pitch] = -0.1 * k; p[P.neck1X] -= 0.3 * k; p[P.jaw] = 0.6 * k; }
      else { p[P.neck1Y] = a.d.dir * 0.55 * k; p[P.headZ] = a.d.dir * 0.35 * k; p[P.neck1X] -= 0.25 * k; p[P.jaw] = 0.5 * k; p[P.roll] = a.d.dir * 0.06 * k; }
      p[P.bodyY] = -0.2 * k; p[P.look] = 0;
    },
  },
  // 転倒（脚を攻撃し続けると倒れる）
  topple: {
    dur: 5.4, blend: 0.1,
    enter(m, a) { a.d.dir = m.rng.chance(0.5) ? 1 : -1; a.d.thud = false; m.game.sfx('growl'); m.game.message(`${m.name}が転倒した！チャンス！`, 'good'); },
    update(m, a, dt) {
      if (!a.d.thud && a.t > 0.55) { a.d.thud = true; m.game.fx.bigDust(m.pos.clone(), 5); m.game.sfx('stomp'); m.game.camShake(0.4); }
    },
    pose(m, a, p) {
      const t = a.t;
      const fall = easeIn(phase(t, 0, 0.55)) * (1 - smooth(phase(t, 4.3, 5.3)));
      p[P.roll] = a.d.dir * 1.35 * fall; p[P.drop] = -0.35 * fall; p[P.bodyY] = -1.85 * fall;
      p[P.neck1X] += 0.35 * fall; p[P.headX] += 0.2 * fall; p[P.jaw] = 0.35 * fall + Math.sin(t * 7) * 0.1 * fall;
      p[P.tailY] = Math.sin(t * 5) * 0.4 * fall; p[P.neck1Y] = Math.sin(t * 3.5) * 0.3 * fall; p[P.look] = 0;
      if (fall > 0.05) {
        p[P.legFK] = 1;
        const kick = Math.sin(t * 9);
        p[P.thighLX] = -0.9 + kick * 0.5; p[P.shinLX] = 1.1 - kick * 0.4; p[P.footLX] = -0.4;
        p[P.thighRX] = -0.9 - kick * 0.5; p[P.shinRX] = 1.1 + kick * 0.4; p[P.footRX] = -0.4;
      }
    },
  },
  // 雷撃罠でしびれる
  trapped: {
    dur: 8, noScale: true, blend: 0.1,
    update(m, a, dt) { if (a.t >= a.dur - 0.05) m.trapped = false; },
    pose(m, a, p) {
      const j = Math.sin(a.t * 45);
      p[P.neck1X] += -0.25 + j * 0.05; p[P.headZ] = j * 0.08; p[P.jaw] = 0.5 + j * 0.1; p[P.tailX] += 0.3; p[P.tailY] = j * 0.1;
      p[P.bodyY] = -0.25; p[P.roll] = j * 0.02; p[P.look] = 0;
      legsStandFK(p);
      p[P.thighLX] += j * 0.05; p[P.thighRX] -= j * 0.05;
    },
  },
  // 閃光で目がくらむ
  blinded: {
    dur: 10, noScale: true,
    enter(m, a) { a.d.next = 1.2; a.d.sub = null; },
    update(m, a, dt) {
      if (a.t > a.d.next) {
        a.d.next = a.t + m.rng.range(1.4, 2.4);
        m.facing += m.rng.range(-0.8, 0.8);
        a.d.subT = 0; a.d.sub = m.rng.pick(['bite', 'spin', 'none', 'none']); a.d.subId = (m.atkSeq += 10);
        if (a.d.sub !== 'none') m.game.sfx('growl');
      }
      if (a.d.sub) a.d.subT += dt;
      if (a.d.sub === 'spin') m.facing += dt * 6 * (a.d.subT < 1 ? 1 : 0);
    },
    attacks(m, a, out) {
      if (a.d.sub === 'bite' && a.d.subT > 0.3 && a.d.subT < 0.5) out.push({ id: a.d.subId, kind: 'hit', shapes: m._capsShapes(['head'], 0.2), damage: 20, knock: 'flinch', power: 25, srcX: m.pos.x, srcZ: m.pos.z, guardable: true });
      if (a.d.sub === 'spin' && a.d.subT > 0.1 && a.d.subT < 0.9) out.push({ id: a.d.subId, kind: 'hit', shapes: m._capsShapes(['tail'], 0.3), damage: 24, knock: 'knockdown', power: 40, knockPower: 7, srcX: m.pos.x, srcZ: m.pos.z, guardable: true });
    },
    pose(m, a, p) {
      p[P.neck1Y] = Math.sin(a.t * 2.3) * 0.5; p[P.headZ] = Math.sin(a.t * 3.1) * 0.25; p[P.headX] += 0.15; p[P.jaw] = 0.25; p[P.look] = 0;
      if (a.d.sub === 'bite' && a.d.subT < 0.8) { const k = Math.sin(phase(a.d.subT, 0, 0.8) * Math.PI); p[P.neck1X] += 0.5 * k; p[P.jaw] = 0.7 * (1 - k); }
      if (a.d.sub === 'spin' && a.d.subT < 1) p[P.tailY] = 0.8 * Math.sin(a.d.subT * Math.PI);
    },
  },
  // 別のエリアへ移動
  leave: {
    dur: 90,
    enter(m, a) {
      a.d.i = 0;
      m.game.message(a.o.dest === 4 ? `${m.name}は巣の方へ逃げていく…` : `${m.name}が移動を始めた`, 'info');
      m._endCombat();
    },
    update(m, a, dt) {
      const path = a.o.path;
      const tgt = path[Math.min(a.d.i, path.length - 1)];
      const dx = tgt.x - m.pos.x, dz = tgt.z - m.pos.z, d = Math.hypot(dx, dz);
      // 引っかかったら次の目標へ
      a.d.chk = (a.d.chk || 0) + dt;
      if (a.d.best === undefined || d < a.d.best - 1) { a.d.best = d; a.d.chk = 0; }
      if (a.d.chk > 3) { a.d.chk = 0; a.d.best = undefined; a.d.i++; if (a.d.i >= path.length) { m.area = a.o.dest; a.t = a.dur; if (a.o.dest === 4 && m.limping) m.startAction('sleep'); return; } }
      if (d < (a.d.i >= path.length - 1 ? 6 : 8)) {
        a.d.best = undefined;
        a.d.i++;
        if (a.d.i >= path.length) {
          m.area = a.o.dest;
          a.t = a.dur;
          if (a.o.dest === 4 && m.limping) { m.startAction('sleep'); }
          return;
        }
      }
      m._turnToward(Math.atan2(dx, dz), 1.4, dt);
      const f = Math.max(0.2, Math.cos(wrapAngle(Math.atan2(dx, dz) - m.facing)));
      const sp = MONSTER.walkSpeed * (m.limping ? 0.85 : 1.6) * f;
      m._move(Math.sin(m.facing) * sp * dt, Math.cos(m.facing) * sp * dt);
    },
    pose(m, a, p) { p[P.look] = 0; p[P.neck1X] += 0.1; },
  },
  // 巣で眠る
  sleep: {
    dur: 9999, loop: true, noScale: true, blend: 0.8,
    enter(m, a) { m.sleeping = true; m._endCombat(); a.d.zz = 0; m.game.message(`${m.name}は眠っている…`, 'info'); },
    update(m, a, dt) {
      if (!m.sleeping) { a.t = a.dur; return; }
      m.hp = Math.min(m.maxHp * 0.3, m.hp + m.maxHp * 0.0025 * dt);
      a.d.zz -= dt;
      if (a.d.zz <= 0 && m.game.mode === 'hunt') { a.d.zz = 1.4; m.game.fx.floatText(m.hb.head.wb.clone().add(_v.set(0, 1, 0)), 'Zz', 'zz', 1.4); }
    },
    pose(m, a, p) {
      const k = smooth(phase(a.t, 0, 1.4));
      p[P.bodyY] = -2.2 * k; p[P.neck1X] += 0.5 * k; p[P.neck2X] += 0.2 * k; p[P.headX] += 0.15 * k; p[P.jaw] = 0.02;
      p[P.tailY] = 0.6 * k; p[P.tailX] -= 0.1 * k; p[P.chestX] += Math.sin(a.t * 1.1) * 0.03; p[P.look] = 0;
      legsFolded(p, k);
    },
  },
  dead: {
    dur: 9999, loop: true, noScale: true, blend: 0.1,
    enter(m, a) { a.d.thud = false; m.game.sfx('roar'); },
    update(m, a, dt) { m.glow = 0; if (!a.d.thud && a.t > 1.3) { a.d.thud = true; m.game.fx.bigDust(m.pos.clone(), 6); m.game.sfx('stomp'); m.game.camShake(0.5); } },
    pose(m, a, p) {
      const t = a.t;
      const rear = smooth(phase(t, 0, 0.6)) * (1 - smooth(phase(t, 0.7, 1.3)));
      const fall = easeIn(phase(t, 0.7, 1.35));
      p[P.neck1X] += -0.5 * rear + 0.55 * fall; p[P.jaw] = 0.8 * rear + 0.35 * fall; p[P.headX] += 0.25 * fall;
      p[P.roll] = 1.4 * fall; p[P.drop] = -0.35 * fall; p[P.bodyY] = -1.85 * fall; p[P.tailY] = 0.3 * fall; p[P.look] = 0;
      if (fall > 0.02) { p[P.legFK] = 1; p[P.thighLX] = -0.7; p[P.shinLX] = 0.9; p[P.footLX] = -0.3; p[P.thighRX] = -0.5; p[P.shinRX] = 0.6; p[P.footRX] = -0.2; }
    },
  },
};
