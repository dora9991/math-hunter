// 関節（ジョイント）づくりと、腕を武器に届かせる2ボーンIK
import * as THREE from 'three';
import { clamp } from './util.js';

export function joint(name, parent, x = 0, y = 0, z = 0) {
  const j = new THREE.Group();
  j.name = name;
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

// メッシュを作って関節にぶら下げる（影つき）
export function part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = cast;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

// 関節から下（-Y）に伸びるカプセル型の肢
export function limb(parent, radius, length, mat, radius2 = radius) {
  const geo = new THREE.CylinderGeometry(radius, radius2, length, 8, 1);
  geo.translate(0, -length / 2, 0);
  const m = part(parent, geo, mat);
  const cap1 = part(parent, new THREE.SphereGeometry(radius, 8, 6), mat);
  const cap2 = part(parent, new THREE.SphereGeometry(radius2, 8, 6), mat, 0, -length, 0);
  return [m, cap1, cap2];
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _E = new THREE.Vector3();
const _dir = new THREE.Vector3(), _pole = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion();

// 骨（レストで -Y 方向）をワールド方向 dirW に向ける
export function aimBone(bone, dirW) {
  _q.setFromUnitVectors(DOWN, dirW);
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_q));
  bone.updateMatrixWorld(true);
}

// ワールドの向き（クォータニオン）をそのまま与える
export function setWorldQuat(obj, qWorld) {
  obj.parent.getWorldQuaternion(_qp);
  obj.quaternion.copy(_qp.invert().multiply(qWorld));
  obj.updateMatrixWorld(true);
}

// 2ボーンIK：upper（肩）→ lower（肘）→ 先端を targetW に。poleW は肘を向けたい方向
export function solveIK2(upper, lower, lenA, lenB, targetW, poleW) {
  upper.getWorldPosition(_S);
  _T.copy(targetW);
  _dir.subVectors(_T, _S);
  let d = _dir.length();
  const maxLen = (lenA + lenB) * 0.998;
  if (d > maxLen) { _dir.multiplyScalar(maxLen / d); d = maxLen; _T.copy(_S).add(_dir); }
  if (d < 1e-4) { d = 1e-4; _dir.set(0, -1e-4, 0); }
  _dir.normalize();
  const cosA = clamp((lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d), -1, 1);
  const a = Math.acos(cosA);
  _pole.copy(poleW).addScaledVector(_dir, -poleW.dot(_dir));
  if (_pole.lengthSq() < 1e-6) _pole.set(0, 0, -1).addScaledVector(_dir, _dir.z);
  _pole.normalize();
  _E.copy(_S).addScaledVector(_dir, Math.cos(a) * lenA).addScaledVector(_pole, Math.sin(a) * lenA);
  aimBone(upper, _tmp.subVectors(_E, _S).normalize());
  aimBone(lower, _tmp.subVectors(_T, _E).normalize());
}

// 刃の向き b（刀身方向）と刃先 e から、剣の姿勢（X=刃先, Y=刀身, Z=平らな面）を作る
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
export function swordQuat(bx, by, bz, ex, ey, ez, out) {
  _y.set(bx, by, bz).normalize();
  _x.set(ex, ey, ez);
  _x.addScaledVector(_y, -_x.dot(_y));
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _x.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
