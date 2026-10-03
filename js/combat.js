// 当たり判定とダメージ計算
import * as THREE from 'three';
import { segSegDist2, pointSegDist2 } from './util.js';

// ダメージ = 攻撃力 × モーション値 × 切れ味 × 肉質 × その他
export function calcDamage(attack, mv, sharpMult, zone, mult = 1) {
  return Math.max(1, Math.round(attack * (mv / 100) * sharpMult * (zone / 100) * mult));
}
// 硬い所を切れ味の悪い刃で斬ると弾かれる
export function isBounce(zone, sharpMult, noBounce = false) {
  return !noBounce && zone * sharpMult < 27;
}

const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();

// 大剣の刃（前フレーム→今フレームをスイープ）とモンスターの当たり判定
export function bladeVsHitboxes(blade, hitboxes, bladeR = 0.22, steps = 6) {
  for (let s = 1; s <= steps; s++) {
    const u = s / steps;
    _pa.lerpVectors(blade.pa, blade.a, u);
    _pb.lerpVectors(blade.pb, blade.b, u);
    let best = null, bestD = Infinity;
    for (const hb of hitboxes) {
      if (hb.off) continue;
      const d2 = segSegDist2(_pa, _pb, hb.wa, hb.wb, _c1, _c2);
      const r = hb.r + bladeR;
      if (d2 < r * r && d2 - r * r < bestD) {
        bestD = d2 - r * r;
        const dir = _c1.clone().sub(_c2);
        const len = dir.length() || 1;
        best = { hb, point: _c2.clone().addScaledVector(dir, Math.min(1, hb.r / len)) };
      }
    }
    if (best) return best;
  }
  return null;
}

// モンスターの攻撃の形とハンターのカプセル
const _ha = new THREE.Vector3(), _hb = new THREE.Vector3();
export function shapeHitsHunter(shape, hunter) {
  const hr = hunter.hurtCapsule(_ha, _hb);
  if (shape.type === 'sphere') {
    const r = shape.r + hr;
    return pointSegDist2(shape.c, _ha, _hb) < r * r;
  }
  if (shape.type === 'capsule') {
    const r = shape.r + hr;
    return segSegDist2(shape.a, shape.b, _ha, _hb) < r * r;
  }
  if (shape.type === 'cylinder') {
    // 地面の円（足踏みの揺れなど）
    const dx = hunter.pos.x - shape.c.x, dz = hunter.pos.z - shape.c.z;
    return dx * dx + dz * dz < shape.r * shape.r && Math.abs(hunter.pos.y - shape.c.y) < (shape.h || 2);
  }
  return false;
}
