// 数学・乱数・当たり判定の小物
import { Vector3 } from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const sat = v => clamp(v, 0, 1);
export const smooth = t => { t = sat(t); return t * t * (3 - 2 * t); };
export const smoothstep = (a, b, v) => smooth((v - a) / (b - a));
export const easeOut = t => { t = sat(t); return 1 - (1 - t) * (1 - t); };
export const easeIn = t => { t = sat(t); return t * t; };
export const linear = t => sat(t);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// 角度を -π〜π に
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}
export function approachAngle(a, b, maxStep) {
  const d = wrapAngle(b - a);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}
export function approach(a, b, maxStep) {
  const d = b - a;
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}

// シード付き乱数（mulberry32）
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Rng {
  constructor(seed = 1) { this.next = mulberry32(seed); }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  chance(p) { return this.next() < p; }
  // entries: [[値, 重み], ...]
  weighted(entries) {
    let sum = 0;
    for (const e of entries) sum += Math.max(0, e[1]);
    let r = this.next() * sum;
    for (const e of entries) { r -= Math.max(0, e[1]); if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
}

// キーフレーム補間： kf = [[時刻, 値], ...]（値は数値）
export function track(t, kf, ease = smooth) {
  if (t <= kf[0][0]) return kf[0][1];
  for (let i = 1; i < kf.length; i++) {
    if (t <= kf[i][0]) {
      const t0 = kf[i - 1][0], v0 = kf[i - 1][1], t1 = kf[i][0], v1 = kf[i][1];
      const u = t1 > t0 ? ease((t - t0) / (t1 - t0)) : 1;
      return v0 + (v1 - v0) * u;
    }
  }
  return kf[kf.length - 1][1];
}
// 区間 [a,b] の中での 0→1
export const phase = (t, a, b) => sat((t - a) / (b - a));

// ---- 当たり判定 ----
const _d1 = new Vector3(), _d2 = new Vector3(), _r = new Vector3(), _c1 = new Vector3(), _c2 = new Vector3();
// 2本の線分 p1-q1 と p2-q2 の最短距離の2乗（Real-Time Collision Detection 5.1.9）
export function segSegDist2(p1, q1, p2, q2, out1, out2) {
  const d1 = _d1.subVectors(q1, p1), d2 = _d2.subVectors(q2, p2), r = _r.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  const EPS = 1e-9;
  let s, t;
  if (a <= EPS && e <= EPS) { s = 0; t = 0; }
  else if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), denom = a * e - b * b;
      s = denom > EPS ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  _c1.copy(p1).addScaledVector(d1, s);
  _c2.copy(p2).addScaledVector(d2, t);
  if (out1) out1.copy(_c1);
  if (out2) out2.copy(_c2);
  return _c1.distanceToSquared(_c2);
}

// 点 p と線分 a-b の最短距離の2乗
const _ab = new Vector3(), _ap = new Vector3();
export function pointSegDist2(p, a, b, out) {
  _ab.subVectors(b, a);
  _ap.subVectors(p, a);
  const l2 = _ab.lengthSq();
  const t = l2 > 1e-9 ? clamp(_ap.dot(_ab) / l2, 0, 1) : 0;
  const cx = a.x + _ab.x * t, cy = a.y + _ab.y * t, cz = a.z + _ab.z * t;
  if (out) out.set(cx, cy, cz);
  const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
  return dx * dx + dy * dy + dz * dz;
}

// 2D：点と線分の距離
export function distToSeg2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz;
  const t = l2 > 0 ? clamp(((px - ax) * abx + (pz - az) * abz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

// なめらかな最小値（地形の領域をつなげるのに使う）
export function smin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}

// 数値の書式
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// localStorage を安全に使う
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
};
