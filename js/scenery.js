// 風景の質感：地形の画像貼り（草・土・岩・砂を混ぜる）、岩、木と茂み（葉は板に葉の絵を貼る）、水面
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from './util.js';

// ---------- 地形：重み（splat）で4種類の地面を混ぜる。岩は三方向から貼って崖でも伸びない ----------
// 軽くするため、その場所で使う地面の画像だけを読む（textureGrad なら分岐の中でも正しくぼかせる）
const TERRAIN_FRAG = `
  vec4 sw = vSplat / max(0.001, vSplat.x + vSplat.y + vSplat.z + vSplat.w);
  vec2 tuv = vWPos.xz;
  vec2 gx = dFdx(tuv), gy = dFdy(tuv);
  vec3 tcol = vec3(0.0); vec2 fl = vec2(0.0);
  if (sw.x > 0.01) {
    vec3 cg = mix(textureGrad(tGrass, tuv * 0.23, gx * 0.23, gy * 0.23).rgb, textureGrad(tGrass, tuv * 0.057 + 0.37, gx * 0.057, gy * 0.057).rgb, 0.45);
    cg = mix(cg, vec3(dot(cg, vec3(0.35, 0.5, 0.15))) * vec3(0.52, 0.86, 0.3) * 1.7, 0.72);   // 枯れ葉色を草の緑に寄せる
    tcol += cg * sw.x;
    fl += (textureGrad(tGrassN, tuv * 0.23, gx * 0.23, gy * 0.23).xy * 2.0 - 1.0) * sw.x;
  }
  if (sw.y > 0.01) {
    tcol += textureGrad(tDirt, tuv * 0.3, gx * 0.3, gy * 0.3).rgb * sw.y;
    fl += (textureGrad(tDirtN, tuv * 0.3, gx * 0.3, gy * 0.3).xy * 2.0 - 1.0) * sw.y;
  }
  if (sw.w > 0.01) {
    tcol += textureGrad(tSand, tuv * 0.33, gx * 0.33, gy * 0.33).rgb * sw.w;
    fl += (textureGrad(tSandN, tuv * 0.33, gx * 0.33, gy * 0.33).xy * 2.0 - 1.0) * sw.w;
  }
  vec3 pert = vec3(fl.x, 0.0, fl.y) * 0.85;
  if (sw.z > 0.01) {
    // 岩：三方向から貼る（崖で伸びないように）
    vec3 bw = pow(abs(vWNrm), vec3(6.0)); bw /= (bw.x + bw.y + bw.z);
    vec3 rp = vWPos * 0.1, rx = dFdx(rp), ry = dFdy(rp);
    vec3 cr = textureGrad(tRock, rp.zy, rx.zy, ry.zy).rgb * bw.x + textureGrad(tRock, rp.xz, rx.xz, ry.xz).rgb * bw.y + textureGrad(tRock, rp.xy, rx.xy, ry.xy).rgb * bw.z;
    cr = mix(cr, vec3(dot(cr, vec3(0.33))), 0.35) * 0.95;
    tcol += cr * sw.z;
    vec2 nx = textureGrad(tRockN, rp.zy, rx.zy, ry.zy).xy * 2.0 - 1.0;
    vec2 ny = textureGrad(tRockN, rp.xz, rx.xz, ry.xz).xy * 2.0 - 1.0;
    vec2 nz = textureGrad(tRockN, rp.xy, rx.xy, ry.xy).xy * 2.0 - 1.0;
    pert += (vec3(0.0, nx.y, nx.x) * bw.x + vec3(ny.x, 0.0, ny.y) * bw.y + vec3(nz.x, nz.y, 0.0) * bw.z) * sw.z * 1.3;
  }
  diffuseColor.rgb = tcol;
  gWorldN = normalize(normalize(vWNrm) + pert);
`;
const ROCK_FRAG = `
  vec3 bw = pow(abs(vWNrm), vec3(5.0)); bw /= (bw.x + bw.y + bw.z);
  vec3 rp = vWPos * 0.16;
  vec3 cr = texture2D(tRock, rp.zy).rgb * bw.x + texture2D(tRock, rp.xz).rgb * bw.y + texture2D(tRock, rp.xy).rgb * bw.z;
  cr = mix(cr, vec3(dot(cr, vec3(0.33))), 0.35);
  diffuseColor.rgb *= cr * 1.6;
  vec2 nx = texture2D(tRockN, rp.zy).xy * 2.0 - 1.0;
  vec2 ny = texture2D(tRockN, rp.xz).xy * 2.0 - 1.0;
  vec2 nz = texture2D(tRockN, rp.xy).xy * 2.0 - 1.0;
  vec3 pert = (vec3(0.0, nx.y, nx.x) * bw.x + vec3(ny.x, 0.0, ny.y) * bw.y + vec3(nz.x, nz.y, 0.0) * bw.z) * 1.3;
  gWorldN = normalize(normalize(vWNrm) + pert);
`;
function worldSpaceMaterial(mat, uniforms, frag, extraAttr = '') {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${extraAttr}varying vec3 vWPos;\nvarying vec3 vWNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${extraAttr ? 'vSplat = splat;' : ''}
        #ifdef USE_INSTANCING
          mat4 wm = modelMatrix * instanceMatrix;
        #else
          mat4 wm = modelMatrix;
        #endif
        vWPos = (wm * vec4(position, 1.0)).xyz;
        vWNrm = normalize(mat3(wm) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass; uniform sampler2D tGrassN; uniform sampler2D tDirt; uniform sampler2D tDirtN;
        uniform sampler2D tRock; uniform sampler2D tRockN; uniform sampler2D tSand; uniform sampler2D tSandN;
        ${extraAttr ? 'varying vec4 vSplat;' : ''} varying vec3 vWPos; varying vec3 vWNrm; vec3 gWorldN;`)
      .replace('#include <map_fragment>', frag)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mat3(viewMatrix) * gWorldN);');
  };
  return mat;
}
function texUniforms(T) {
  return {
    tGrass: { value: T.grass_color }, tGrassN: { value: T.grass_normal }, tDirt: { value: T.dirt_color }, tDirtN: { value: T.dirt_normal },
    tRock: { value: T.rock_color }, tRockN: { value: T.rock_normal }, tSand: { value: T.sand_color }, tSandN: { value: T.sand_normal },
  };
}
export function terrainMaterial(T) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return worldSpaceMaterial(mat, texUniforms(T), TERRAIN_FRAG, 'attribute vec4 splat;\nvarying vec4 vSplat;\n');
}
export function rockMaterial(T, color = 0xffffff) {
  const mat = new THREE.MeshLambertMaterial({ color });
  return worldSpaceMaterial(mat, texUniforms(T), ROCK_FRAG);
}

// なめらかな岩（細かく割った球をでこぼこにする）
export function smoothRock(seed, noiseFn) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const merged = g.index ? g : mergeVerts(g);
  const p = merged.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k = 1 + noiseFn(v.x * 1.2 + seed, v.y * 1.2, v.z * 1.2) * 0.5 + noiseFn(v.x * 3.1, v.y * 3.1 + seed, v.z * 3.1) * 0.16;
    v.multiplyScalar(k); v.y *= 0.74;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  merged.computeVertexNormals();
  return merged;
}
function mergeVerts(g) {
  // 同じ位置の頂点をまとめる（なめらかな陰影にするため）
  const pos = g.attributes.position, map = new Map(), idx = [], out = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let j = map.get(k);
    if (j === undefined) { j = out.length / 3; map.set(k, j); out.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    idx.push(j);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  ng.setIndex(idx);
  return ng;
}

// ---------- 葉の絵（canvas に描く）----------
function leafCanvas(kind, seed) {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rng = new Rng(seed);
  g.clearRect(0, 0, S, S);
  if (kind === 'pine') {
    // 針葉の小枝：中心の軸から細い針がたくさん出る
    g.translate(S / 2, S * 0.98);
    for (let b = 0; b < 7; b++) {
      const ang = (b - 3) * 0.3 + rng.range(-0.08, 0.08), len = S * rng.range(0.55, 0.95) * (1 - Math.abs(b - 3) * 0.07);
      g.save(); g.rotate(ang);
      g.strokeStyle = '#3a2a1c'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len); g.stroke();
      for (let i = 6; i < len; i += 2.4) {
        const l = rng.range(9, 17) * (1 - i / len * 0.45), gr = 60 + rng.int(0, 60);
        g.strokeStyle = `rgb(${24 + rng.int(0, 22)},${gr + 22},${30 + rng.int(0, 22)})`; g.lineWidth = 1.5;
        for (const sdir of [-1, 1]) { g.beginPath(); g.moveTo(0, -i); g.lineTo(sdir * l, -i - l * 0.55); g.stroke(); }
      }
      g.restore();
    }
  } else {
    // 広葉：とがった楕円の葉を重ねる
    for (let i = 0; i < 46; i++) {
      const x = rng.range(26, S - 26), y = rng.range(26, S - 26), l = rng.range(26, 44), w = l * rng.range(0.34, 0.5), a = rng.range(0, Math.PI * 2);
      const lum = rng.range(0.55, 1.15);
      g.save(); g.translate(x, y); g.rotate(a);
      const grd = g.createLinearGradient(0, -l, 0, l);
      grd.addColorStop(0, `rgb(${Math.round(70 * lum)},${Math.round(125 * lum)},${Math.round(38 * lum)})`);
      grd.addColorStop(1, `rgb(${Math.round(34 * lum)},${Math.round(84 * lum)},${Math.round(28 * lum)})`);
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, -l); g.quadraticCurveTo(w, -l * 0.2, 0, l); g.quadraticCurveTo(-w, -l * 0.2, 0, -l); g.fill();
      g.strokeStyle = `rgba(20,50,16,0.55)`; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, -l * 0.9); g.lineTo(0, l * 0.9); g.stroke();
      g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function quad(pos, nor, uv, col, c, right, up, w, h, crown, tint) {
  // 中心 c の板（right, up は単位ベクトル）。法線は樹冠の中心から外向き（陰影がやわらかくなる）
  const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => c.clone().addScaledVector(right, a * w * 0.5).addScaledVector(up, b * h * 0.5));
  const order = [0, 1, 2, 0, 2, 3], UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const i of order) {
    const p = P[i];
    pos.push(p.x, p.y, p.z);
    const n = p.clone().sub(crown).normalize().lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize();
    nor.push(n.x, n.y, n.z);
    uv.push(UV[i][0], UV[i][1]);
    col.push(tint, tint, tint);
  }
}
function leafGeo(pos, nor, uv, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function branch(from, to, r0, r1) {
  const d = to.clone().sub(from), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}

// 広葉樹：幹＋枝＋葉の板
export function broadleafTree(seed) {
  const rng = new Rng(seed);
  const H = rng.range(3.2, 4.2), crown = new THREE.Vector3(rng.range(-0.3, 0.3), H + 1.6, rng.range(-0.3, 0.3));
  const woods = [branch(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(crown.x * 0.5, H, crown.z * 0.5), 0.34, 0.2)];
  const pos = [], nor = [], uv = [], col = [];
  const tips = [];
  const nb = rng.int(5, 7);
  for (let i = 0; i < nb; i++) {
    const a = i / nb * Math.PI * 2 + rng.range(-0.3, 0.3), y0 = H * rng.range(0.55, 0.95), r = rng.range(1.5, 2.6);
    const from = new THREE.Vector3(crown.x * 0.4, y0, crown.z * 0.4), to = new THREE.Vector3(Math.cos(a) * r, y0 + rng.range(1.0, 2.2), Math.sin(a) * r);
    woods.push(branch(from, to, 0.13, 0.05));
    tips.push(to, from.clone().lerp(to, 0.6));
  }
  tips.push(crown.clone(), crown.clone().add(new THREE.Vector3(0, 1.1, 0)));
  for (const tp of tips) {
    const n = rng.int(5, 7);
    for (let k = 0; k < n; k++) {
      const c = tp.clone().add(new THREE.Vector3(rng.range(-0.9, 0.9), rng.range(-0.5, 0.8), rng.range(-0.9, 0.9)));
      const a = rng.range(0, Math.PI * 2), tilt = rng.range(-0.7, 0.7);
      const right = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const up = new THREE.Vector3(-Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt));
      const s = rng.range(1.5, 2.3);
      const inner = c.distanceTo(crown) < 1.6 ? 0.68 : 1.0;
      quad(pos, nor, uv, col, c, right, up, s, s, crown, inner * rng.range(0.82, 1.08));
    }
  }
  return { wood: mergeGeometries(woods), leaves: leafGeo(pos, nor, uv, col) };
}

// 針葉樹：幹＋段ごとに垂れ下がる枝の板
export function pineTree(seed) {
  const rng = new Rng(seed);
  const H = rng.range(7.5, 9.5);
  const woods = [branch(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, H, 0), 0.3, 0.05)];
  const pos = [], nor = [], uv = [], col = [];
  const tiers = 10;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1), y = H * (0.2 + f * 0.8), L = (1 - f) * 2.5 + 0.55, n = 6 - Math.floor(f * 2);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + t * 0.7 + rng.range(-0.2, 0.2), droop = rng.range(0.25, 0.5);
      const out = new THREE.Vector3(Math.cos(a) * Math.cos(droop), -Math.sin(droop), Math.sin(a) * Math.cos(droop));
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const c = new THREE.Vector3(0, y, 0).addScaledVector(out, L * 0.5);
      const crown = new THREE.Vector3(0, y - 0.6, 0);
      const tint = rng.range(0.8, 1.05) * (0.8 + f * 0.25);
      // 板は「外向き」が絵の上になるように（軸を外へ）
      quad(pos, nor, uv, col, c, side, out, L * 0.9, L, crown, tint);
      const side2 = side.clone().cross(out).normalize();
      quad(pos, nor, uv, col, c, side2, out, L * 0.6, L, crown, tint * 0.9);
    }
  }
  return { wood: mergeGeometries(woods), leaves: leafGeo(pos, nor, uv, col) };
}

// 茂み：地面近くの葉のかたまり
export function bush(seed) {
  const rng = new Rng(seed);
  const pos = [], nor = [], uv = [], col = [];
  const crown = new THREE.Vector3(0, 0.1, 0);
  for (let k = 0; k < 13; k++) {
    const c = new THREE.Vector3(rng.range(-0.7, 0.7), rng.range(0.25, 0.95), rng.range(-0.7, 0.7));
    const a = rng.range(0, Math.PI * 2), tilt = rng.range(-0.6, 0.6);
    const right = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const up = new THREE.Vector3(-Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt));
    const s = rng.range(0.9, 1.4);
    quad(pos, nor, uv, col, c, right, up, s, s, crown, rng.range(0.75, 1.05));
  }
  return leafGeo(pos, nor, uv, col);
}

export function foliageMaterials(T, windUniform) {
  const leafMat = kind => {
    const m = new THREE.MeshLambertMaterial({ map: leafCanvas(kind, kind === 'pine' ? 11 : 5), alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true });
    m.onBeforeCompile = sh => {
      sh.uniforms.uWind = windUniform;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23 + position.y * 0.6;
          float sway = max(0.0, position.y) * 0.012;
          transformed.x += sin(uWind * 1.1 + ph) * sway + sin(uWind * 2.7 + ph * 3.0) * 0.02;
          transformed.z += cos(uWind * 0.9 + ph) * sway;
        #endif`);
      // 両面の板でも、裏側の法線をひっくり返さない（葉の陰影がやわらかくなる）
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n normal *= faceDirection;\n#endif');
    };
    return m;
  };
  const bark = T.bark_color ? new THREE.MeshLambertMaterial({ map: T.bark_color, normalMap: T.bark_normal }) : new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  if (T.bark_color) { T.bark_color.repeat.set(2, 3); T.bark_normal.repeat.set(2, 3); }
  return { leaf: leafMat('leaf'), pine: leafMat('pine'), bark };
}

// ---------- 水面のさざ波（くり返せる法線の画像を作る）----------
export function waterNormalTexture() {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S);
  const rng = new Rng(21);
  const waves = [];
  for (let i = 0; i < 9; i++) waves.push({ kx: rng.int(-5, 5), ky: rng.int(1, 6), ph: rng.range(0, 6.28), a: rng.range(0.4, 1) });
  const hgt = (x, y) => { let s = 0; for (const w of waves) s += Math.sin((x * w.kx + y * w.ky) * Math.PI * 2 / S + w.ph) * w.a / (Math.abs(w.kx) + w.ky); return s; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 9, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 9;
    const l = Math.hypot(dx, dy, 1), k = (y * S + x) * 4;
    img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  return tex;
}


// ---------- 雲の画像（つなぎ目なくくり返せる、もこもこした濃淡）----------
export function cloudTexture() {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S);
  const rng = new Rng(31);
  const layers = [4, 8, 16, 32, 64].map(n => ({ n, v: Float32Array.from({ length: n * n }, () => rng.next()) }));
  const sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0, a = 0.5;
    for (const L of layers) {
      const fx = x / S * L.n, fy = y / S * L.n, ix = Math.floor(fx), iy = Math.floor(fy), u = sm(fx - ix), w = sm(fy - iy);
      const at = (i, j) => L.v[((j % L.n + L.n) % L.n) * L.n + ((i % L.n + L.n) % L.n)];
      s += a * ((at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - w) + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * w);
      a *= 0.5;
    }
    const k = (y * S + x) * 4, v = Math.max(0, Math.min(255, s * 263));
    img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
