// 大剣のモーション定義
// 時間はすべて秒。active = 当たり判定が出る区間、mv = モーション値（威力）、
// combo = コンボ受付（comboFrom 以降）で A/B/AB を押したときの次の技、rollFrom = 回避でキャンセルできる時刻
import { track, lerp, smooth, easeIn, easeOut } from './util.js';

const D2R = Math.PI / 180;

// 胸の座標系での構え（大剣を右下に下ろして持つ）
export const STANCE = { gx: -0.15, gy: -0.27, gz: 0.25, bx: -0.52, by: -0.56, bz: -0.64, ex: 0.2, ey: -0.9, ez: 0.3 };
// 振りかぶり（頭上）
const TOP = { gx: 0.0, gy: 0.62, gz: 0.12 };
// 振り下ろしの終わり（前の低い所）
const LOW = { gx: 0.0, gy: -0.1, gz: 0.47 };

// 縦の振り：刀身角 β（胸の前方 +Z から上向きに測る）
function vertical(p, I, beta, gx, gy, gz, dir = -1) {
  const b = beta * D2R;
  p[I.gripX] = gx; p[I.gripY] = gy; p[I.gripZ] = gz;
  p[I.bladeX] = 0; p[I.bladeY] = Math.sin(b); p[I.bladeZ] = Math.cos(b);
  // 刃先は振る方向を向く（dir=-1：振り下ろし、+1：振り上げ）
  p[I.edgeX] = 0; p[I.edgeY] = -dir * -Math.cos(b); p[I.edgeZ] = -dir * Math.sin(b);
}
// 横の振り：刀身角 δ（前 +Z から左 +X へ測る）
function horizontal(p, I, delta, gx, gy, gz, droop = -0.18) {
  const d = delta * D2R, c = Math.sqrt(1 - droop * droop);
  p[I.gripX] = gx; p[I.gripY] = gy; p[I.gripZ] = gz;
  p[I.bladeX] = Math.sin(d) * c; p[I.bladeY] = droop; p[I.bladeZ] = Math.cos(d) * c;
  p[I.edgeX] = Math.cos(d); p[I.edgeY] = 0; p[I.edgeZ] = -Math.sin(d);
}
export function stance(p, I) {
  p[I.gripX] = STANCE.gx; p[I.gripY] = STANCE.gy; p[I.gripZ] = STANCE.gz;
  p[I.bladeX] = STANCE.bx; p[I.bladeY] = STANCE.by; p[I.bladeZ] = STANCE.bz;
  p[I.edgeX] = STANCE.ex; p[I.edgeY] = STANCE.ey; p[I.edgeZ] = STANCE.ez;
}
// 2つの持ち方の間をなめらかに
function blendSword(p, I, a, b, u) {
  for (const k of ['gripX', 'gripY', 'gripZ', 'bladeX', 'bladeY', 'bladeZ', 'edgeX', 'edgeY', 'edgeZ']) p[I[k]] = lerp(a[I[k]], b[I[k]], u);
}
function legsStance(p, I, crouch) {
  p[I.rootY] = -crouch;
  p[I.thighLX] = -0.35 - crouch * 1.2; p[I.shinL] = 0.3 + crouch * 2.4; p[I.footL] = -crouch * 1.1 + 0.05;
  p[I.thighRX] = 0.25 - crouch * 1.0; p[I.shinR] = 0.25 + crouch * 2.2; p[I.footR] = -crouch * 1.0 - 0.1;
  p[I.thighLZ] = 0.12; p[I.thighRZ] = -0.12;
}

export function drawnIdlePose(p, I, t) {
  stance(p, I);
  legsStance(p, I, 0.07 + Math.sin(t * 2.2) * 0.01);
  p[I.chestY] = -0.12; p[I.hipsY] = 0.1; p[I.chestX] = 0.08;
  p[I.ik] = 1; p[I.onBack] = 0;
}

const tmpA = new Float32Array(64), tmpB = new Float32Array(64);

export const GS = {
  // 抜刀斬り（納刀中に攻撃）
  drawSlash: {
    id: 'drawSlash', name: '抜刀斬り', duration: 1.12, active: [0.33, 0.47], mv: 48, hitstop: 0.09,
    comboFrom: 0.72, rollFrom: 0.8, combo: { A: 'vslash', B: 'hslash', AB: 'upswing' },
    chargeable: true, chargeCheck: 0.2, fromSheathed: true, sound: 0.3,
    motion: [[0, 0], [0.12, 0.35], [0.45, 1.2], [0.6, 1.3]],
    pose(p, I, t) {
      if (t < 0.17) {
        // 背中の柄に手を伸ばす
        const u = smooth(t / 0.17);
        p[I.ik] = 0; p[I.onBack] = 1;
        p[I.uArmRX] = lerp(-0.2, -2.7, u); p[I.uArmRZ] = lerp(-0.1, -0.35, u); p[I.fArmR] = lerp(-0.3, -1.2, u);
        p[I.uArmLX] = lerp(-0.2, -2.3, u); p[I.uArmLZ] = lerp(0.1, 0.5, u); p[I.fArmL] = lerp(-0.3, -1.4, u);
        p[I.chestX] = lerp(0, -0.12, u);
        legsStance(p, I, 0.05 + u * 0.05);
        return;
      }
      p[I.ik] = 1; p[I.onBack] = 0;
      if (t < 0.33) {
        vertical(p, I, 152, TOP.gx, TOP.gy, TOP.gz);
        p[I.chestX] = -0.12; legsStance(p, I, 0.1);
      } else {
        const u = smooth((t - 0.33) / 0.14);
        const beta = lerp(152, -25, Math.min(1, (t - 0.33) / 0.14));
        vertical(p, I, beta, lerp(TOP.gx, LOW.gx, u), lerp(TOP.gy, LOW.gy, u), lerp(TOP.gz, LOW.gz, u));
        p[I.chestX] = lerp(-0.12, 0.32, u);
        legsStance(p, I, lerp(0.1, 0.17, u));
        if (t > 0.6) {
          const r = smooth((t - 0.6) / 0.5);
          vertical(tmpA, I, -25, LOW.gx, LOW.gy, LOW.gz); stance(tmpB, I);
          blendSword(p, I, tmpA, tmpB, r);
          p[I.chestX] = lerp(0.32, 0.08, r); p[I.chestY] = lerp(0, -0.12, r);
          legsStance(p, I, lerp(0.17, 0.07, r));
        }
      }
    },
  },
  // 縦斬り（長押しで溜め）
  vslash: {
    id: 'vslash', name: '縦斬り', duration: 1.22, active: [0.46, 0.6], mv: 48, hitstop: 0.09,
    comboFrom: 0.78, rollFrom: 0.85, combo: { A: 'vslash', B: 'hslash', AB: 'upswing' },
    chargeable: true, chargeCheck: 0.3, sound: 0.42,
    motion: [[0, 0], [0.42, 0.1], [0.6, 0.65]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      if (t < 0.42) {
        const u = smooth(t / 0.42);
        stance(tmpA, I); vertical(tmpB, I, 152, TOP.gx, TOP.gy, TOP.gz);
        blendSword(p, I, tmpA, tmpB, u);
        p[I.chestX] = lerp(0.08, -0.14, u); p[I.chestY] = lerp(-0.12, 0.05, u);
        legsStance(p, I, lerp(0.07, 0.11, u));
      } else if (t < 0.62) {
        const k = Math.min(1, (t - 0.42) / 0.16), u = easeIn(k);
        vertical(p, I, lerp(152, -25, u), lerp(TOP.gx, LOW.gx, u), lerp(TOP.gy, LOW.gy, u), lerp(TOP.gz, LOW.gz, u));
        p[I.chestX] = lerp(-0.14, 0.32, u); p[I.chestY] = 0.05;
        legsStance(p, I, lerp(0.11, 0.18, u));
      } else {
        const r = smooth((t - 0.72) / 0.5);
        vertical(tmpA, I, -25, LOW.gx, LOW.gy, LOW.gz); stance(tmpB, I);
        blendSword(p, I, tmpA, tmpB, r);
        p[I.chestX] = lerp(0.32, 0.08, r); p[I.chestY] = lerp(0.05, -0.12, r);
        legsStance(p, I, lerp(0.18, 0.07, r));
      }
    },
  },
  // 溜め斬り（離した瞬間から）
  chargeSlash: {
    id: 'chargeSlash', name: '溜め斬り', duration: 1.1, active: [0.05, 0.2], mv: 48, hitstop: 0.12,
    comboFrom: 0.62, rollFrom: 0.72, combo: { B: 'hslash', AB: 'upswing' }, sound: 0.02,
    motion: [[0, 0], [0.2, 0.55]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      if (t < 0.2) {
        const u = easeIn(t / 0.2);
        vertical(p, I, lerp(165, -28, u), lerp(0.02, LOW.gx, u), lerp(0.6, LOW.gy, u), lerp(0.05, LOW.gz, u));
        p[I.chestX] = lerp(-0.2, 0.36, u);
        legsStance(p, I, lerp(0.14, 0.2, u));
      } else {
        const r = smooth((t - 0.45) / 0.6);
        vertical(tmpA, I, -28, LOW.gx, LOW.gy, LOW.gz); stance(tmpB, I);
        blendSword(p, I, tmpA, tmpB, r);
        p[I.chestX] = lerp(0.36, 0.08, r); p[I.chestY] = lerp(0, -0.12, r);
        legsStance(p, I, lerp(0.2, 0.07, r));
      }
    },
  },
  // なぎ払い
  hslash: {
    id: 'hslash', name: 'なぎ払い', duration: 1.15, active: [0.36, 0.56], mv: 36, hitstop: 0.07,
    comboFrom: 0.7, rollFrom: 0.78, combo: { A: 'vslash', AB: 'upswing', B: 'upswing' }, sound: 0.34,
    motion: [[0, 0], [0.3, 0.15], [0.56, 0.9]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      if (t < 0.34) {
        const u = smooth(t / 0.34);
        stance(tmpA, I); horizontal(tmpB, I, -110, -0.33, -0.1, 0.22);
        blendSword(p, I, tmpA, tmpB, u);
        p[I.chestY] = lerp(-0.12, -0.6, u); p[I.hipsY] = lerp(0.1, -0.25, u); p[I.chestX] = 0.08;
        legsStance(p, I, lerp(0.07, 0.14, u));
      } else if (t < 0.58) {
        const u = smooth((t - 0.34) / 0.22);
        const delta = lerp(-110, 100, u);
        const gx = lerp(-0.33, 0.24, u), gz = 0.22 + Math.sin(u * Math.PI) * 0.26;
        horizontal(p, I, delta, gx, -0.08, gz);
        p[I.chestY] = lerp(-0.6, 0.62, u); p[I.hipsY] = lerp(-0.25, 0.28, u); p[I.chestX] = 0.1;
        legsStance(p, I, 0.14);
      } else {
        const r = smooth((t - 0.66) / 0.45);
        horizontal(tmpA, I, 100, 0.24, -0.08, 0.22); stance(tmpB, I);
        blendSword(p, I, tmpA, tmpB, r);
        p[I.chestY] = lerp(0.62, -0.12, r); p[I.hipsY] = lerp(0.28, 0.1, r); p[I.chestX] = lerp(0.1, 0.08, r);
        legsStance(p, I, lerp(0.14, 0.07, r));
      }
    },
  },
  // 斬り上げ
  upswing: {
    id: 'upswing', name: '斬り上げ', duration: 1.2, active: [0.4, 0.58], mv: 46, hitstop: 0.08,
    comboFrom: 0.76, rollFrom: 0.84, combo: { A: 'vslash', B: 'hslash', AB: 'vslash' }, sound: 0.38,
    motion: [[0, 0], [0.38, 0.2], [0.58, 0.55]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      if (t < 0.38) {
        const u = smooth(t / 0.38);
        stance(tmpA, I); vertical(tmpB, I, -72, -0.08, -0.26, 0.34, 1);
        blendSword(p, I, tmpA, tmpB, u);
        p[I.chestX] = lerp(0.08, 0.34, u); p[I.chestY] = lerp(-0.12, -0.2, u);
        legsStance(p, I, lerp(0.07, 0.2, u));
      } else if (t < 0.6) {
        const u = smooth((t - 0.38) / 0.2);
        vertical(p, I, lerp(-72, 125, u), lerp(-0.08, 0.0, u), lerp(-0.26, 0.55, u), lerp(0.34, 0.14, u), 1);
        p[I.chestX] = lerp(0.34, -0.22, u); p[I.chestY] = lerp(-0.2, 0.05, u);
        legsStance(p, I, lerp(0.2, 0.04, u));
      } else {
        const r = smooth((t - 0.7) / 0.48);
        vertical(tmpA, I, 125, 0.0, 0.55, 0.14, 1); stance(tmpB, I);
        blendSword(p, I, tmpA, tmpB, r);
        p[I.chestX] = lerp(-0.22, 0.08, r); p[I.chestY] = lerp(0.05, -0.12, r);
        legsStance(p, I, lerp(0.04, 0.07, r));
      }
    },
  },
};

// 溜めているときの構え
export function chargePose(p, I, t, level) {
  p[I.ik] = 1; p[I.onBack] = 0;
  const u = smooth(Math.min(1, t / 0.25));
  vertical(tmpA, I, 152, TOP.gx, TOP.gy, TOP.gz);
  vertical(tmpB, I, 166, 0.02, 0.6, 0.05);
  blendSword(p, I, tmpA, tmpB, u);
  const shake = level >= 2 ? Math.sin(t * 60) * 0.012 * level : 0;
  p[I.gripX] += shake;
  p[I.chestX] = lerp(-0.14, -0.22, u); p[I.chestY] = 0.05;
  legsStance(p, I, lerp(0.11, 0.15, u));
}

// 溜めの段階とモーション値
export const CHARGE = {
  times: [0.75, 1.5, 2.25],   // この秒数で Lv1 / Lv2 / Lv3
  over: 2.95,                  // 溜めすぎ
  auto: 3.5,                   // 自動で振る
  mv: [48, 66, 82, 112],
  overMv: 82,
};
export function chargeLevel(ct) {
  if (ct >= CHARGE.over) return 4; // 溜めすぎ
  let lv = 0;
  for (const t of CHARGE.times) if (ct >= t) lv++;
  return lv;
}
export function chargeMv(level) { return level === 4 ? CHARGE.overMv : CHARGE.mv[level]; }

// 大剣の基本性能
export const GREATSWORD = {
  name: '鉄塊の大剣',
  attack: 200,     // 攻撃力（ダメージ計算に使う値）
  bladeLen: 1.5,
};

// =================== 太刀 ===================
// 構え：中段より少し右。刀身は前上がり
export const LS_STANCE = { gx: -0.12, gy: -0.16, gz: 0.3, bx: -0.3, by: 0.5, bz: 0.81, ex: 0, ey: -0.85, ez: 0.5 };
export function lsStance(p, I) {
  p[I.gripX] = LS_STANCE.gx; p[I.gripY] = LS_STANCE.gy; p[I.gripZ] = LS_STANCE.gz;
  p[I.bladeX] = LS_STANCE.bx; p[I.bladeY] = LS_STANCE.by; p[I.bladeZ] = LS_STANCE.bz;
  p[I.edgeX] = LS_STANCE.ex; p[I.edgeY] = LS_STANCE.ey; p[I.edgeZ] = LS_STANCE.ez;
}
export function lsIdlePose(p, I, t) {
  lsStance(p, I);
  p[I.rootY] = -0.08 + Math.sin(t * 2.2) * 0.008;
  p[I.thighLX] = -0.45; p[I.shinL] = 0.45; p[I.footL] = -0.05; p[I.thighRX] = 0.3; p[I.shinR] = 0.35; p[I.footR] = -0.15;
  p[I.thighLZ] = 0.1; p[I.thighRZ] = -0.1;
  p[I.chestY] = -0.25; p[I.hipsY] = -0.15; p[I.chestX] = 0.05;
  p[I.ik] = 1; p[I.onBack] = 0;
}
const LS_TOP = { gx: 0.0, gy: 0.5, gz: 0.2 }, LS_LOW = { gx: 0.0, gy: -0.06, gz: 0.5 };
function lsRecover(p, I, from, t, t0, t1) {
  const r = smooth(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
  lsStance(tmpB, I);
  blendSword(p, I, from, tmpB, r);
  return r;
}
// 斜めの振り（刀身の向きを δ と上下 droop で表す）
function diag(p, I, delta, droop, gx, gy, gz) {
  const dr = Math.max(-0.95, Math.min(0.95, droop));
  horizontal(p, I, delta, gx, gy, gz, dr);
}
function lsLegs(p, I, crouch) {
  p[I.rootY] = -0.08 - crouch;
  p[I.thighLX] = -0.5 - crouch * 1.1; p[I.shinL] = 0.5 + crouch * 2.2; p[I.footL] = -0.05 - crouch;
  p[I.thighRX] = 0.3 - crouch; p[I.shinR] = 0.35 + crouch * 2; p[I.footR] = -0.15 - crouch;
  p[I.thighLZ] = 0.1; p[I.thighRZ] = -0.1;
}

export const LS = {
  drawSlash: {
    id: 'ls_draw', name: '踏み込み斬り', duration: 0.95, active: [0.24, 0.38], mv: 26, hitstop: 0.06, spirit: 9,
    comboFrom: 0.5, rollFrom: 0.55, combo: { A: 'thrust', B: 'thrust', AB: 'fade', S: 'spirit1' }, fromSheathed: true, sound: 0.22,
    motion: [[0, 0], [0.3, 1.4]],
    pose(p, I, t) {
      if (t < 0.13) {
        const u = smooth(t / 0.13);
        p[I.ik] = 0; p[I.onBack] = 1;
        p[I.uArmRX] = lerp(-0.2, -2.7, u); p[I.uArmRZ] = -0.3 * u; p[I.fArmR] = lerp(-0.3, -1.2, u);
        p[I.uArmLX] = lerp(-0.2, -2.2, u); p[I.uArmLZ] = 0.1 + 0.4 * u; p[I.fArmL] = lerp(-0.3, -1.4, u);
        lsLegs(p, I, 0.05);
        return;
      }
      p[I.ik] = 1; p[I.onBack] = 0;
      if (t < 0.24) { vertical(p, I, 125, LS_TOP.gx, LS_TOP.gy, LS_TOP.gz); p[I.chestX] = -0.1; lsLegs(p, I, 0.05); return; }
      const u = smooth(Math.min(1, (t - 0.24) / 0.14));
      vertical(p, I, lerp(125, -28, u), lerp(LS_TOP.gx, LS_LOW.gx, u), lerp(LS_TOP.gy, LS_LOW.gy, u), lerp(LS_TOP.gz, LS_LOW.gz, u));
      p[I.chestX] = lerp(-0.1, 0.3, u); lsLegs(p, I, 0.12 * u);
      if (t > 0.5) { vertical(tmpA, I, -28, LS_LOW.gx, LS_LOW.gy, LS_LOW.gz); const r = lsRecover(p, I, tmpA, t, 0.5, 0.92); p[I.chestX] = lerp(0.3, 0.05, r); p[I.chestY] = -0.25 * r; }
    },
  },
  vslash: {
    id: 'ls_vslash', name: '縦斬り', duration: 0.88, active: [0.22, 0.36], mv: 26, hitstop: 0.06, spirit: 9,
    comboFrom: 0.42, rollFrom: 0.5, combo: { A: 'thrust', B: 'thrust', AB: 'fade', S: 'spirit1' }, sound: 0.2,
    motion: [[0, 0], [0.36, 0.5]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      if (t < 0.2) {
        const u = smooth(t / 0.2);
        lsStance(tmpA, I); vertical(tmpB, I, 125, LS_TOP.gx, LS_TOP.gy, LS_TOP.gz);
        blendSword(p, I, tmpA, tmpB, u);
        p[I.chestX] = lerp(0.05, -0.12, u); p[I.chestY] = lerp(-0.25, 0, u); lsLegs(p, I, 0);
      } else {
        const u = easeIn(Math.min(1, (t - 0.2) / 0.16));
        vertical(p, I, lerp(125, -28, u), lerp(LS_TOP.gx, LS_LOW.gx, u), lerp(LS_TOP.gy, LS_LOW.gy, u), lerp(LS_TOP.gz, LS_LOW.gz, u));
        p[I.chestX] = lerp(-0.12, 0.3, u); lsLegs(p, I, 0.12 * u);
        if (t > 0.45) { vertical(tmpA, I, -28, LS_LOW.gx, LS_LOW.gy, LS_LOW.gz); const r = lsRecover(p, I, tmpA, t, 0.45, 0.85); p[I.chestX] = lerp(0.3, 0.05, r); p[I.chestY] = -0.25 * r; lsLegs(p, I, 0.12 * (1 - r)); }
      }
    },
  },
  thrust: {
    id: 'ls_thrust', name: '突き', duration: 0.78, active: [0.16, 0.3], mv: 18, hitstop: 0.05, spirit: 6,
    comboFrom: 0.38, rollFrom: 0.45, combo: { A: 'rising', B: 'rising', AB: 'fade', S: 'spirit1' }, sound: 0.14,
    motion: [[0, 0], [0.16, 0.1], [0.3, 0.7]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      const back = smooth(Math.min(1, t / 0.15)), fwd = smooth(Math.min(1, Math.max(0, (t - 0.15) / 0.13)));
      lsStance(tmpA, I);
      const T = new Float32Array(64);
      T[I.gripX] = -0.14 + 0.12 * fwd; T[I.gripY] = -0.08 + 0.04 * fwd; T[I.gripZ] = lerp(0.05, 0.6, fwd);
      T[I.bladeX] = 0.02; T[I.bladeY] = 0.06; T[I.bladeZ] = 1; T[I.edgeX] = 0; T[I.edgeY] = -1; T[I.edgeZ] = 0;
      blendSword(p, I, tmpA, T, back);
      p[I.chestY] = lerp(-0.25, -0.45, back) + 0.4 * fwd; p[I.chestX] = 0.12 * fwd;
      lsLegs(p, I, 0.1 * fwd);
      if (t > 0.42) { blendSword(tmpA, I, T, T, 1); const r = lsRecover(p, I, T, t, 0.42, 0.75); p[I.chestY] = lerp(-0.05, -0.25, r); lsLegs(p, I, 0.1 * (1 - r)); }
    },
  },
  rising: {
    id: 'ls_rising', name: '斬り上げ', duration: 0.9, active: [0.18, 0.34], mv: 18, hitstop: 0.05, spirit: 8,
    comboFrom: 0.42, rollFrom: 0.5, combo: { A: 'vslash', B: 'thrust', AB: 'fade', S: 'spirit1' }, sound: 0.17,
    motion: [[0, 0], [0.34, 0.35]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      if (t < 0.17) {
        const u = smooth(t / 0.17);
        lsStance(tmpA, I); vertical(tmpB, I, -60, -0.04, -0.26, 0.38, 1);
        blendSword(p, I, tmpA, tmpB, u);
        p[I.chestX] = lerp(0.05, 0.3, u); lsLegs(p, I, 0.12 * u);
      } else {
        const u = smooth(Math.min(1, (t - 0.17) / 0.17));
        vertical(p, I, lerp(-60, 118, u), lerp(-0.04, 0, u), lerp(-0.26, 0.5, u), lerp(0.38, 0.16, u), 1);
        p[I.chestX] = lerp(0.3, -0.15, u); lsLegs(p, I, 0.12 * (1 - u));
        if (t > 0.45) { vertical(tmpA, I, 118, 0, 0.5, 0.16, 1); const r = lsRecover(p, I, tmpA, t, 0.45, 0.88); p[I.chestX] = lerp(-0.15, 0.05, r); p[I.chestY] = -0.25 * r; }
      }
    },
  },
  fade: {
    id: 'ls_fade', name: '斬り下がり', duration: 0.88, active: [0.1, 0.28], mv: 24, hitstop: 0.05, spirit: 9,
    comboFrom: 0.45, rollFrom: 0.5, combo: { A: 'vslash', B: 'thrust', S: 'spirit1', AB: 'fade' }, sound: 0.08,
    motion: [[0, 0], [0.08, -0.2], [0.5, -2.6]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      const u = smooth(Math.min(1, t / 0.28));
      vertical(p, I, lerp(110, -20, u), 0, lerp(0.42, -0.02, u), lerp(0.22, 0.48, u));
      p[I.chestX] = lerp(-0.1, 0.25, u); p[I.hipsX] = -0.1;
      lsLegs(p, I, 0.06);
      p[I.thighLX] = 0.2; p[I.thighRX] = -0.35;
      if (t > 0.48) { vertical(tmpA, I, -20, 0, -0.02, 0.48); const r = lsRecover(p, I, tmpA, t, 0.48, 0.86); p[I.chestX] = lerp(0.25, 0.05, r); p[I.chestY] = -0.25 * r; }
    },
  },
  // 気刃斬り（C キー。気刃ゲージを使う）
  spirit1: {
    id: 'ls_spirit1', name: '気刃斬りI', duration: 0.95, active: [0.2, 0.36], mv: 28, hitstop: 0.07, cost: 20, spiritMove: true,
    comboFrom: 0.45, rollFrom: 0.55, combo: { S: 'spirit2', A: 'vslash', B: 'thrust', AB: 'fade' }, sound: 0.18,
    motion: [[0, 0], [0.36, 0.6]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      const u = smooth(Math.min(1, Math.max(0, (t - 0.16) / 0.2))), w = smooth(Math.min(1, t / 0.16));
      lsStance(tmpA, I); diag(tmpB, I, 70, 0.6, 0.18, 0.35, 0.28);
      blendSword(p, I, tmpA, tmpB, w);
      if (t >= 0.16) diag(p, I, lerp(70, -115, u), lerp(0.6, -0.5, u), lerp(0.18, -0.24, u), lerp(0.35, -0.14, u), lerp(0.28, 0.35, u));
      p[I.chestY] = lerp(0.35, -0.5, u); p[I.chestX] = 0.1 * u; lsLegs(p, I, 0.08 * u);
      if (t > 0.5) { diag(tmpA, I, -115, -0.5, -0.24, -0.14, 0.35); const r = lsRecover(p, I, tmpA, t, 0.5, 0.92); p[I.chestY] = lerp(-0.5, -0.25, r); }
    },
  },
  spirit2: {
    id: 'ls_spirit2', name: '気刃斬りII', duration: 0.95, active: [0.2, 0.36], mv: 30, hitstop: 0.07, cost: 20, spiritMove: true,
    comboFrom: 0.45, rollFrom: 0.55, combo: { S: 'spirit3', A: 'vslash', B: 'thrust', AB: 'fade' }, sound: 0.18,
    motion: [[0, 0], [0.36, 0.6]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      const u = smooth(Math.min(1, Math.max(0, (t - 0.16) / 0.2))), w = smooth(Math.min(1, t / 0.16));
      lsStance(tmpA, I); diag(tmpB, I, -75, 0.6, -0.2, 0.35, 0.28);
      blendSword(p, I, tmpA, tmpB, w);
      if (t >= 0.16) diag(p, I, lerp(-75, 110, u), lerp(0.6, -0.5, u), lerp(-0.2, 0.2, u), lerp(0.35, -0.14, u), lerp(0.28, 0.35, u));
      p[I.chestY] = lerp(-0.45, 0.5, u); p[I.chestX] = 0.1 * u; lsLegs(p, I, 0.08 * u);
      if (t > 0.5) { diag(tmpA, I, 110, -0.5, 0.2, -0.14, 0.35); const r = lsRecover(p, I, tmpA, t, 0.5, 0.92); p[I.chestY] = lerp(0.5, -0.25, r); }
    },
  },
  // 3連続の斬り（当たり判定が3回）
  spirit3: {
    id: 'ls_spirit3', name: '気刃斬りIII', duration: 1.35, active: [0.14, 0.78], hits: [[0.14, 0.26, 14], [0.34, 0.46, 16], [0.62, 0.78, 36]], hitstop: 0.06, cost: 25, spiritMove: true,
    comboFrom: 0.85, rollFrom: 0.95, combo: { S: 'round', A: 'vslash', B: 'thrust', AB: 'fade' }, sound: 0.12, sounds: [0.12, 0.32, 0.6],
    motion: [[0, 0], [0.3, 0.4], [0.78, 1.0]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      if (t < 0.28) {
        const u = smooth(Math.min(1, Math.max(0, (t - 0.1) / 0.16)));
        diag(p, I, lerp(-100, 85, u), -0.1, lerp(-0.25, 0.22, u), -0.05, 0.3 + Math.sin(u * Math.PI) * 0.2);
        p[I.chestY] = lerp(-0.5, 0.5, u);
      } else if (t < 0.5) {
        const u = smooth(Math.min(1, (t - 0.32) / 0.14));
        diag(p, I, lerp(85, -100, u), -0.1, lerp(0.22, -0.25, u), -0.05, 0.3 + Math.sin(u * Math.PI) * 0.2);
        p[I.chestY] = lerp(0.5, -0.5, u);
      } else {
        const w = smooth(Math.min(1, (t - 0.5) / 0.12)), u = easeIn(Math.min(1, Math.max(0, (t - 0.62) / 0.16)));
        diag(tmpA, I, -100, -0.1, -0.25, -0.05, 0.3); vertical(tmpB, I, 140, 0, 0.55, 0.12);
        blendSword(p, I, tmpA, tmpB, w);
        if (t >= 0.62) vertical(p, I, lerp(140, -30, u), 0, lerp(0.55, -0.08, u), lerp(0.12, 0.5, u));
        p[I.chestY] = lerp(-0.5, 0, w); p[I.chestX] = lerp(-0.15, 0.35, u);
        lsLegs(p, I, 0.14 * u);
        if (t > 0.9) { vertical(tmpA, I, -30, 0, -0.08, 0.5); const r = lsRecover(p, I, tmpA, t, 0.9, 1.32); p[I.chestX] = lerp(0.35, 0.05, r); p[I.chestY] = -0.25 * r; lsLegs(p, I, 0.14 * (1 - r)); }
      }
    },
  },
  // 気刃大回転斬り：その場で一回転
  round: {
    id: 'ls_round', name: '気刃大回転斬り', duration: 1.45, active: [0.24, 0.68], mv: 44, hitstop: 0.1, cost: 25, spiritMove: true,
    comboFrom: 1.0, rollFrom: 1.0, combo: { A: 'vslash', B: 'thrust', AB: 'fade' }, sound: 0.22,
    motion: [[0, 0], [0.3, 0.5]],
    pose(p, I, t) {
      p[I.ik] = 1; p[I.onBack] = 0;
      const w = smooth(Math.min(1, t / 0.22)), spin = smooth(Math.min(1, Math.max(0, (t - 0.22) / 0.48)));
      lsStance(tmpA, I); diag(tmpB, I, -125, -0.05, -0.32, -0.05, 0.12);
      blendSword(p, I, tmpA, tmpB, w);
      if (t >= 0.22) diag(p, I, lerp(-125, -100, spin), -0.05, -0.32, -0.05, 0.3);
      p[I.yawOff] = spin * Math.PI * 2;
      p[I.chestY] = lerp(-0.25, -0.6, w);
      lsLegs(p, I, 0.18 * w);
      if (t > 0.8) { diag(tmpA, I, -100, -0.05, -0.32, -0.05, 0.3); const r = lsRecover(p, I, tmpA, t, 0.8, 1.4); p[I.chestY] = lerp(-0.6, -0.25, r); lsLegs(p, I, 0.18 * (1 - r)); }
    },
  },
};

export const LONGSWORD = {
  name: '太刀「月影」',
  attack: 165,
  bladeLen: 1.55,
};

// 武器の定義（ハンターが使う）
export const WEAPONS = {
  gs: { id: 'gs', name: '大剣', def: GREATSWORD, moves: GS, idle: drawnIdlePose, stance, drawnSpeed: 2.3, canGuard: true, canCharge: true, first: { A: 'vslash', B: 'hslash', AB: 'upswing' }, bladeR: 0.24 },
  ls: { id: 'ls', name: '太刀', def: LONGSWORD, moves: LS, idle: lsIdlePose, stance: lsStance, drawnSpeed: 3.0, canGuard: false, canCharge: false, first: { A: 'vslash', B: 'thrust', AB: 'fade', S: 'spirit1' }, bladeR: 0.16 },
};
