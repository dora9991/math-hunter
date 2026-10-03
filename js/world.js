// 狩り場：地形・空・光・水・木や岩・キャンプ・巣・ミニマップ用の画像
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep, smin, distToSeg2D, Rng } from './util.js';
import { PROPS, hasProps, propMesh, TEXTURES } from './assets.js';
import { terrainMaterial, rockMaterial, smoothRock, broadleafTree, pineTree, bush, foliageMaterials, waterNormalTexture, cloudTexture } from './scenery.js';

export const WORLD_SIZE = 240;        // 地形の一辺（m）
const GRID = 200;                      // 地形の分割数
const HALF = WORLD_SIZE / 2;
const STEP = WORLD_SIZE / GRID;

// エリア（番号つき）。x,z は中心、r は広さ、h は地面の高さ
export const AREAS = [
  { id: 0, name: 'ベースキャンプ', short: 'BC', x: -80, z: 72, r: 15, h: 7 },
  { id: 1, name: 'エリア1 草原', short: '1', x: -46, z: 30, r: 27, h: 3.5 },
  { id: 2, name: 'エリア2 大平原', short: '2', x: 8, z: -2, r: 36, h: 0 },
  { id: 3, name: 'エリア3 湖畔', short: '3', x: 56, z: 54, r: 30, h: -0.3 },
  { id: 4, name: 'エリア4 竜の巣', short: '4', x: 58, z: -58, r: 25, h: 5 },
];
// エリア同士をつなぐ道 [a, b, 幅]
export const LINKS = [[0, 1, 9], [1, 2, 16], [2, 3, 16], [2, 4, 15], [3, 4, 14]];
export const LAKE = { x: 68, z: 66, r: 15, depth: 2.2 };
export const WATER_LEVEL = -1.35;
export const CAMP = { x: -82, z: 76, boxX: -78.5, boxZ: 70.5, spawnX: -76, spawnZ: 66, spawnYaw: Math.PI * 0.8 };
export const NEST = { x: 62, z: -62 };

const noise = new ImprovedNoise();
function fbm(x, z, oct, freq, seed = 0) {
  let a = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise.noise(x * freq, z * freq, 7.31 + seed + i * 13.17);
    n += a; a *= 0.5; freq *= 2;
  }
  return s / n;
}

// 遊べる範囲までの符号付き距離（内側がマイナス）
export function regionSDRaw(x, z) {
  let d = 1e9;
  for (const a of AREAS) d = smin(d, Math.hypot(x - a.x, z - a.z) - a.r, 7);
  for (const [i, j, w] of LINKS) {
    const A = AREAS[i], B = AREAS[j];
    d = smin(d, distToSeg2D(x, z, A.x, A.z, B.x, B.z) - w * 0.5, 7);
  }
  return d + fbm(x, z, 2, 1 / 16, 3) * 3.2;
}

function baseHeight(x, z) {
  let ws = 0, hs = 0;
  for (const a of AREAS) {
    const d = Math.max(0, Math.hypot(x - a.x, z - a.z) - a.r * 0.45);
    const w = 1 / (d * d + 40);
    ws += w; hs += w * a.h;
  }
  return hs / ws + fbm(x, z, 4, 1 / 38) * 2.0;
}

export function computeHeight(x, z) {
  const sd = regionSDRaw(x, z);
  let h = baseHeight(x, z);
  if (sd > 0) {
    const rock = fbm(x, z, 4, 1 / 13, 9);
    h += 26 * (1 - Math.exp(-sd / 4.5)) + sd * 0.45 + rock * 6 * smoothstep(0, 9, sd);
  }
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  h -= LAKE.depth * smoothstep(LAKE.r, LAKE.r * 0.25, ld);
  return h;
}

// 地面の色（頂点カラーとミニマップで共用）
const C = {
  grass: [0.26, 0.42, 0.16], grass2: [0.40, 0.48, 0.20], dry: [0.55, 0.52, 0.28],
  dirt: [0.46, 0.36, 0.23], rock: [0.40, 0.38, 0.36], rock2: [0.30, 0.28, 0.27],
  sand: [0.70, 0.63, 0.44], nest: [0.34, 0.28, 0.24],
};
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
export function groundColor(x, z, h, slope, sd) {
  const n1 = fbm(x, z, 3, 1 / 12, 21), n2 = fbm(x, z, 2, 1 / 45, 33);
  let c = mix3(C.grass, C.grass2, clamp(n1 * 1.5 + 0.5, 0, 1));
  c = mix3(c, C.dry, clamp(n2 * 2 + 0.2, 0, 0.7));
  // 道
  let pathD = 1e9;
  for (const [i, j] of LINKS) {
    const A = AREAS[i], B = AREAS[j];
    pathD = Math.min(pathD, distToSeg2D(x, z, A.x, A.z, B.x, B.z) + n1 * 2.5);
  }
  c = mix3(c, C.dirt, smoothstep(4.5, 1.5, pathD) * 0.85);
  // キャンプ・巣
  const campD = Math.hypot(x - CAMP.x, z - CAMP.z);
  c = mix3(c, C.dirt, smoothstep(10, 5, campD) * 0.8);
  const nestD = Math.hypot(x - AREAS[4].x, z - AREAS[4].z);
  c = mix3(c, C.nest, smoothstep(28, 12, nestD) * 0.85);
  // 湖のまわりは砂
  if (h < WATER_LEVEL + 0.9) c = mix3(c, C.sand, smoothstep(WATER_LEVEL + 0.9, WATER_LEVEL + 0.2, h));
  // 急な斜面・範囲の外は岩
  const rockT = Math.max(smoothstep(0.28, 0.55, slope), smoothstep(-0.5, 2.5, sd));
  const band = Math.sin(h * 0.9 + n2 * 6) * 0.5 + 0.5;
  let rc = mix3(C.rock, C.rock2, clamp(n1 + 0.5, 0, 1));
  rc = mix3(rc, [0.47, 0.40, 0.33], band * 0.45);
  rc = mix3(rc, [0.30, 0.36, 0.22], smoothstep(0.62, 0.9, 1 - slope) * 0.6);
  c = mix3(c, rc, rockT);
  const shade = 0.92 + n1 * 0.16;
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}

export class Terrain {
  constructor() {
    const N = GRID + 1;
    this.N = N;
    this.h = new Float32Array(N * N);
    this.sd = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * STEP, z = -HALF + j * STEP;
        this.h[j * N + i] = computeHeight(x, z);
        this.sd[j * N + i] = regionSDRaw(x, z);
      }
    }
  }
  _bilinear(arr, x, z) {
    const N = this.N;
    const fx = clamp((x + HALF) / STEP, 0, N - 1.001), fz = clamp((z + HALF) / STEP, 0, N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const k = j * N + i;
    const a = arr[k], b = arr[k + 1], c = arr[k + N], d = arr[k + N + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  heightAt(x, z) { return this._bilinear(this.h, x, z); }
  sdAt(x, z) { return this._bilinear(this.sd, x, z); }
  // 遊べる範囲の内側へ押し戻す方向（勾配）
  sdGrad(x, z, out) {
    const e = 0.6;
    out.x = (this.sdAt(x + e, z) - this.sdAt(x - e, z)) / (2 * e);
    out.y = (this.sdAt(x, z + e) - this.sdAt(x, z - e)) / (2 * e);
    const l = Math.hypot(out.x, out.y) || 1;
    out.x /= l; out.y /= l;
    return out;
  }
  normalAt(x, z, out) {
    const e = 0.8;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    out.set(-hx, 2 * e, -hz).normalize();
    return out;
  }
  waterDepth(x, z) { return WATER_LEVEL - this.heightAt(x, z); }
  areaAt(x, z) {
    let best = AREAS[2], bd = 1e9;
    for (const a of AREAS) {
      const d = Math.hypot(x - a.x, z - a.z) - a.r;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
}

// ---------- 見た目を作る ----------

function detailTexture() {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const rng = new Rng(77);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = fbm(x, y, 3, 1 / 18, 51) * 0.5 + 0.5;
      const v = 205 + n * 40 + (rng.next() - 0.5) * 28;
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = clamp(v, 0, 255);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(52, 52);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function colorize(geo, rgb, jitter = 0.06, rng = null) {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = rng ? (rng.next() - 0.5) * jitter : 0;
    col[i * 3] = clamp(rgb[0] + j, 0, 1); col[i * 3 + 1] = clamp(rgb[1] + j, 0, 1); col[i * 3 + 2] = clamp(rgb[2] + j, 0, 1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const ni = g => (g.index ? g.toNonIndexed() : g);

function pineGeometry(rng) {
  const parts = [];
  const trunk = ni(new THREE.CylinderGeometry(0.18, 0.3, 3.0, 6)); trunk.translate(0, 1.5, 0);
  parts.push(colorize(trunk, [0.33, 0.22, 0.14], 0.05, rng));
  const tiers = [[2.2, 3.2, 2.0], [1.7, 2.7, 3.6], [1.1, 2.2, 5.0]];
  for (const [r, h, y] of tiers) {
    const cone = ni(new THREE.ConeGeometry(r, h, 7)); cone.translate(0, y + h * 0.5 - 0.4, 0);
    parts.push(colorize(cone, [0.16, 0.32, 0.17], 0.07, rng));
  }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
function broadleafGeometry(rng) {
  const parts = [];
  const trunk = ni(new THREE.CylinderGeometry(0.22, 0.36, 3.2, 6)); trunk.translate(0, 1.6, 0);
  parts.push(colorize(trunk, [0.36, 0.25, 0.16], 0.05, rng));
  const blobs = [[0, 4.2, 0, 2.1], [1.1, 3.6, 0.4, 1.4], [-0.9, 3.8, -0.5, 1.5], [0.2, 5.3, -0.2, 1.4]];
  for (const [x, y, z, r] of blobs) {
    const b = ni(new THREE.IcosahedronGeometry(r, 0)); b.translate(x, y, z);
    parts.push(colorize(b, [0.24, 0.40, 0.16], 0.09, rng));
  }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + noise.noise(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3) * 0.45;
    v.multiplyScalar(k); v.y *= 0.72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const out = ni(g); out.computeVertexNormals();
  return out;
}
function tuftGeometry() {
  const pos = [], col = [], nor = [];
  const rng = new Rng(5);
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, Math.PI * 2), r0 = rng.range(0, 0.16);
    const h = rng.range(0.2, 0.46), w = rng.range(0.012, 0.022), lean = rng.range(0.05, 0.16);
    const cx = Math.cos(a), cz = Math.sin(a);
    const bx = cx * r0, bz = cz * r0, px = -cz * w, pz = cx * w;
    pos.push(bx + px, 0, bz + pz, bx - px, 0, bz - pz, bx + cx * lean, h, bz + cz * lean);
    const t = rng.range(0.85, 1.15);
    col.push(0.07 * t, 0.15 * t, 0.04 * t, 0.07 * t, 0.15 * t, 0.04 * t, 0.24 * t, 0.4 * t, 0.11 * t);
    for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export class World {
  constructor(scene, renderer, quality = 'high') {
    this.scene = scene;
    this.terrain = new Terrain();
    this.colliders = [];      // {x, z, r}：ハンターが通れない丸
    this.time = 0;
    this.windUniform = { value: 0 };
    this.sunDir = new THREE.Vector3(-0.5, 0.78, 0.38).normalize();
    this._buildSkyAndLights(renderer);
    this._buildTerrainMesh();
    this._buildWater();
    this.textured = !!TEXTURES.grass_color;
    if (hasProps()) this.usingModels = true;
    if (this.textured) this._buildScenery(quality);
    else if (this.usingModels) this._buildPropsModels(quality);
    else this._buildProps(quality);
    this._buildCamp();
    this._buildNest();
    if (this.usingModels) this._buildExtras();
  }

  _buildSkyAndLights(renderer) {
    const scene = this.scene;
    const horizon = new THREE.Color(0xc9dce4);
    scene.background = horizon.clone();
    scene.fog = new THREE.Fog(horizon, 80, 330);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3f7fc4) },
        horizon: { value: horizon.clone() },
        bottom: { value: new THREE.Color(0x9aa89c) },
        sunDir: { value: this.sunDir },
        uTime: { value: 0 },
        tCloud: { value: cloudTexture() },
      },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform float uTime; uniform sampler2D tCloud; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir); float y = d.y;
          vec3 c = y > 0.0 ? mix(horizon, top, pow(clamp(y, 0.0, 1.0), 0.6)) : mix(horizon, bottom, clamp(-y * 4.0, 0.0, 1.0));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          // 雲（ゆっくり流れる）
          vec2 cuv = d.xz / max(y + 0.12, 0.08) * 0.11 + vec2(uTime * 0.0008, uTime * 0.0003);
          float cl = texture2D(tCloud, cuv).r, cl2 = texture2D(tCloud, cuv + normalize(sunDir).xz * 0.012).r;
          float cover = smoothstep(0.5, 0.78, cl) * smoothstep(0.0, 0.16, y);
          vec3 cloudCol = mix(vec3(0.62, 0.66, 0.72), vec3(1.0, 0.97, 0.92), clamp(0.55 + (cl - cl2) * 2.6, 0.0, 1.0));
          c = mix(c, cloudCol, cover * 0.88);
          c += vec3(1.0, 0.86, 0.62) * (pow(s, 900.0) * 6.0 * (1.0 - cover) + pow(s, 14.0) * 0.22);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.skyMat = skyMat;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // 環境マップ（金属やつやのある物の映り込み）
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), skyMat));
      this.envMap = pmrem.fromScene(envScene, 0.04).texture;
      scene.environment = this.envMap;
      scene.environmentIntensity = 0.55;
      pmrem.dispose();
    } catch (e) { console.warn('env map failed', e); }

    this.hemi = new THREE.HemisphereLight(0xdcecff, 0x5e4c36, 1.25);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 42;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.045;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
  }

  _buildTerrainMesh() {
    const t = this.terrain, N = t.N;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, GRID, GRID);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setY(k, t.h[k]);
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k), h = pos.getY(k);
      const slope = 1 - nor.getY(k);
      const c = groundColor(x, z, h, slope, t.sd[k]);
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    }
    let mat;
    if (TEXTURES.grass_color) {
      // 画像つき：頂点ごとに「草・土・岩・砂」の重みと、色むら（明るさ・乾いた所）を持たせる
      const splat = new Float32Array(pos.count * 4);
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k), z = pos.getZ(k), h = pos.getY(k), slope = 1 - nor.getY(k), sd = t.sd[k];
        const n1 = fbm(x, z, 3, 1 / 12, 21), n2 = fbm(x, z, 2, 1 / 45, 33);
        const rock = Math.max(smoothstep(0.26, 0.5, slope), smoothstep(-0.5, 2.5, sd));
        const dirt = Math.max(smoothstep(4.5, 1.5, distToPath(x, z) + n1 * 2.5) * 0.9, smoothstep(10, 5, Math.hypot(x - CAMP.x, z - CAMP.z)) * 0.85, smoothstep(28, 12, Math.hypot(x - AREAS[4].x, z - AREAS[4].z)) * 0.8);
        const sand = smoothstep(WATER_LEVEL + 0.9, WATER_LEVEL + 0.2, h);
        let rest = 1 - rock;
        const wSand = sand * rest; rest *= 1 - sand;
        const wDirt = dirt * rest; rest *= 1 - dirt;
        splat.set([rest, wDirt, rock, wSand], k * 4);
        const dry = clamp(n2 * 2 + 0.2, 0, 0.6), b = 0.86 + n1 * 0.3, wet = h < WATER_LEVEL ? 0.62 : 1;
        col[k * 3] = b * lerp(1, 1.22, dry) * wet; col[k * 3 + 1] = b * lerp(1, 1.06, dry) * wet; col[k * 3 + 2] = b * lerp(1, 0.72, dry) * wet;
      }
      geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
      mat = terrainMaterial(TEXTURES);
    } else {
      mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: detailTexture() });
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.scene.add(mesh);
    this.terrainMesh = mesh;
    // 端の外側に遠景の山（霧に溶ける）
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(420, 420, 90, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8a9a92, side: THREE.BackSide, fog: true }));
    ring.position.y = 20;
    this.scene.add(ring);
  }

  _buildWater() {
    const geo = new THREE.CircleGeometry(LAKE.r * 1.35, 40);
    geo.rotateX(-Math.PI / 2);
    this.waterN = waterNormalTexture();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a6278, transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0.3, depthWrite: false, normalMap: this.waterN, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6 });
    const w = new THREE.Mesh(geo, mat);
    w.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
    w.renderOrder = 2;
    this.scene.add(w);
    this.water = w;
  }

  _placeInstances(geo, mat, list, { cast = true, receive = true } = {}) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const o = new THREE.Object3D();
    list.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
      o.scale.set(p.sx ?? p.s, p.sy ?? p.s, p.sz ?? p.s);
      o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    });
    m.castShadow = cast; m.receiveShadow = receive;
    m.instanceMatrix.needsUpdate = true;
    this.scene.add(m);
    return m;
  }

  _buildProps(quality) {
    const t = this.terrain, rng = new Rng(1234);
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const pines = [], leafs = [];
    const nearArenaCenter = (x, z) => AREAS.some(a => Math.hypot(x - a.x, z - a.z) < a.r * 0.62);
    // 崖の上の森
    for (let n = 0; n < 2600 && pines.length + leafs.length < 520; n++) {
      const x = rng.range(-HALF + 4, HALF - 4), z = rng.range(-HALF + 4, HALF - 4);
      const sd = t.sdAt(x, z);
      if (sd < 1.5 || sd > 32) continue;
      const nrm = new THREE.Vector3(); t.normalAt(x, z, nrm);
      if (nrm.y < 0.55) continue;
      const p = { x, y: t.heightAt(x, z) - 0.3, z, ry: rng.range(0, 6.28), s: rng.range(0.9, 1.6) };
      (rng.chance(0.6) ? pines : leafs).push(p);
    }
    // 範囲の内側、ふちの近く（障害物）
    for (let n = 0; n < 1500; n++) {
      const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF);
      const sd = t.sdAt(x, z);
      if (sd > -1.5 || sd < -9 || nearArenaCenter(x, z)) continue;
      if (t.waterDepth(x, z) > -0.3) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 13) continue;
      if (distToPath(x, z) < 5) continue;
      const s = rng.range(0.85, 1.3);
      const p = { x, y: t.heightAt(x, z) - 0.2, z, ry: rng.range(0, 6.28), s };
      (rng.chance(0.5) ? pines : leafs).push(p);
      this.colliders.push({ x, z, r: 0.45 * s + 0.1 });
      if (pines.length + leafs.length > 640) break;
    }
    this.pineMesh = this._placeInstances(pineGeometry(new Rng(3)), treeMat, pines);
    this.leafMesh = this._placeInstances(broadleafGeometry(new Rng(4)), treeMat, leafs);

    // 岩
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d7770, roughness: 0.92, flatShading: true });
    const rockGeos = [rockGeometry(1.1), rockGeometry(7.7), rockGeometry(13.3)];
    const rocks = [[], [], []];
    for (let n = 0; n < 3000; n++) {
      const x = rng.range(-HALF + 3, HALF - 3), z = rng.range(-HALF + 3, HALF - 3);
      const sd = t.sdAt(x, z);
      const inside = sd < -1.2;
      if (inside) {
        if (!rng.chance(0.05)) continue;
        if (nearArenaCenter(x, z) && rng.chance(0.85)) continue;
        if (distToPath(x, z) < 4 || Math.hypot(x - CAMP.x, z - CAMP.z) < 12) continue;
      } else if (sd > 40) continue;
      const s = inside ? rng.range(0.6, 1.8) : rng.range(1.2, 4.5);
      const p = { x, y: t.heightAt(x, z) - s * 0.25, z, rx: rng.range(-0.3, 0.3), ry: rng.range(0, 6.28), rz: rng.range(-0.3, 0.3), s };
      rocks[n % 3].push(p);
      if (inside && s > 0.9) this.colliders.push({ x, z, r: s * 0.85 });
      if (rocks[0].length + rocks[1].length + rocks[2].length > 420) break;
    }
    this.rockMeshes = rocks.map((list, i) => this._placeInstances(rockGeos[i], rockMat, list));

    // 草
    const counts = { low: 6000, mid: 14000, high: 24000 };
    const want = counts[quality] || counts.high;
    const tufts = [];
    for (let n = 0; n < want * 4 && tufts.length < want; n++) {
      const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF);
      const sd = t.sdAt(x, z);
      if (sd > -0.5) continue;
      if (t.waterDepth(x, z) > -0.35) continue;
      if (distToPath(x, z) < 2.2 + rng.range(0, 1.5)) continue;
      if (Math.hypot(x - AREAS[4].x, z - AREAS[4].z) < 22 && rng.chance(0.8)) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 8) continue;
      tufts.push({ x, y: t.heightAt(x, z) - 0.03, z, ry: rng.range(0, 6.28), s: rng.range(0.8, 1.7) });
    }
    const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const wind = this.windUniform;
    grassMat.onBeforeCompile = sh => {
      sh.uniforms.uWind = wind;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
          transformed.x += sin(uWind * 1.7 + ph) * 0.09 * position.y;
          transformed.z += cos(uWind * 1.3 + ph) * 0.06 * position.y;
        #endif`);
    };
    this.grass = this._placeInstances(tuftGeometry(), grassMat, tufts, { cast: false, receive: true });
  }

  // Kenney のモデルをまとめて置く（部品ごとに InstancedMesh）
  _instanceModel(name, list, { cast = true, receive = true } = {}) {
    const p = PROPS[name];
    if (!p || !list.length) return [];
    const o = new THREE.Object3D(), out = [];
    for (const part of p.parts) {
      const m = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((it, i) => {
        o.position.set(it.x, it.y, it.z); o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
        o.scale.setScalar(it.s); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      });
      m.castShadow = cast; m.receiveShadow = receive;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      this.scene.add(m);
      out.push(m);
    }
    return out;
  }

  _buildPropsModels(quality) {
    const t = this.terrain, rng = new Rng(1234);
    const nrm = new THREE.Vector3();
    const nearArenaCenter = (x, z) => AREAS.some(a => Math.hypot(x - a.x, z - a.z) < a.r * 0.62);
    const bins = {};
    const put = (name, it) => { (bins[name] = bins[name] || []).push(it); };
    const PINES = ['tree_pineTallA_detailed', 'tree_pineTallB_detailed', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_pineDefaultA', 'tree_cone'];
    const LEAFY = ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_tall', 'tree_plateau'];
    // 崖の上の森
    let count = 0;
    for (let n = 0; n < 4000 && count < 560; n++) {
      const x = rng.range(-HALF + 4, HALF - 4), z = rng.range(-HALF + 4, HALF - 4);
      const sd = t.sdAt(x, z);
      if (sd < 1.5 || sd > 34) continue;
      t.normalAt(x, z, nrm);
      if (nrm.y < 0.55) continue;
      const pine = rng.chance(0.68);
      put(pine ? rng.pick(PINES) : rng.pick(LEAFY), { x, y: t.heightAt(x, z) - 0.2, z, ry: rng.range(0, 6.28), s: pine ? rng.range(5.2, 7.5) : rng.range(4.2, 6.2) });
      count++;
    }
    // 範囲の内側のふち（ハンターがぶつかる）
    count = 0;
    for (let n = 0; n < 2000 && count < 70; n++) {
      const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF);
      const sd = t.sdAt(x, z);
      if (sd > -1.5 || sd < -9 || nearArenaCenter(x, z)) continue;
      if (t.waterDepth(x, z) > -0.3 || Math.hypot(x - CAMP.x, z - CAMP.z) < 14 || distToPath(x, z) < 5.5) continue;
      const pine = rng.chance(0.35);
      const s = pine ? rng.range(4.6, 6.2) : rng.range(3.8, 5.2);
      put(pine ? rng.pick(PINES) : rng.pick(LEAFY), { x, y: t.heightAt(x, z) - 0.15, z, ry: rng.range(0, 6.28), s });
      this.colliders.push({ x, z, r: 0.5 });
      count++;
    }
    // 岩：中の大岩（障害物）と、崖の岩
    const TALL = ['rock_tallA', 'rock_tallB', 'rock_tallC', 'rock_tallE', 'rock_tallG'];
    const CLIFF = ['stone_tallA', 'stone_tallB', 'stone_largeB', 'stone_largeC', 'stone_largeE'];
    count = 0;
    for (let n = 0; n < 3000 && count < 60; n++) {
      const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF);
      const sd = t.sdAt(x, z);
      if (sd > -1.5 || distToPath(x, z) < 4.5 || Math.hypot(x - CAMP.x, z - CAMP.z) < 13 || t.waterDepth(x, z) > -0.3) continue;
      if (nearArenaCenter(x, z) && rng.chance(0.9)) continue;
      const s = rng.range(2.2, 3.8);
      put(rng.pick(TALL), { x, y: t.heightAt(x, z) - 0.25, z, ry: rng.range(0, 6.28), s });
      this.colliders.push({ x, z, r: s * 0.36 });
      count++;
    }
    for (let n = 0; n < 3000 && count < 60 + 230; n++) {
      const x = rng.range(-HALF + 2, HALF - 2), z = rng.range(-HALF + 2, HALF - 2);
      const sd = t.sdAt(x, z);
      if (sd < 0.5 || sd > 40) continue;
      const s = rng.range(4, 9);
      put(rng.pick(CLIFF), { x, y: t.heightAt(x, z) - s * 0.3, z, rx: rng.range(-0.2, 0.2), ry: rng.range(0, 6.28), rz: rng.range(-0.2, 0.2), s });
      count++;
    }
    // 草むら・花・きのこ（当たり判定なし）
    const mul = { low: 0.35, mid: 0.7, high: 1 }[quality] || 1;
    const deco = [['plant_bush', 140, 3.2, 4.6], ['plant_bushLarge', 90, 3.2, 4.4], ['plant_bushDetailed', 70, 3, 4.2], ['grass_large', 260, 3, 4.2], ['grass_leafsLarge', 200, 3, 4.2],
      ['flower_redA', 90, 3, 4], ['flower_yellowA', 110, 3, 4], ['flower_purpleA', 90, 3, 4], ['mushroom_redGroup', 30, 2.6, 3.4], ['mushroom_tanGroup', 30, 2.6, 3.4]];
    for (const [name, want, s0, s1] of deco) {
      const n0 = Math.round(want * mul);
      let c = 0;
      for (let n = 0; n < n0 * 8 && c < n0; n++) {
        const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF);
        const sd = t.sdAt(x, z);
        if (sd > -0.8 || t.waterDepth(x, z) > -0.35 || distToPath(x, z) < 3 || Math.hypot(x - CAMP.x, z - CAMP.z) < 9) continue;
        const flower = name.startsWith('flower'), mush = name.startsWith('mushroom');
        if ((flower || mush) && sd < -12 && rng.chance(0.7)) continue;
        if (Math.hypot(x - AREAS[4].x, z - AREAS[4].z) < 24 && !mush) continue;
        put(name, { x, y: t.heightAt(x, z) - 0.05, z, ry: rng.range(0, 6.28), s: rng.range(s0, s1) });
        c++;
      }
    }
    this.propMeshes = [];
    for (const [name, list] of Object.entries(bins)) {
      const small = name.startsWith('flower') || name.startsWith('grass') || name.startsWith('mushroom');
      this.propMeshes.push(...this._instanceModel(name, list, { cast: !small, receive: true }));
    }

    // こまかい草（プログラムで作った葉っぱ）
    this._buildGrassBlades(quality, rng);
  }

  // 画像つきの風景：木（幹＋葉の板）・茂み・岩
  _buildScenery(quality) {
    const t = this.terrain, rng = new Rng(1234);
    const nrm = new THREE.Vector3();
    const nearArenaCenter = (x, z) => AREAS.some(a => Math.hypot(x - a.x, z - a.z) < a.r * 0.62);
    const fm = foliageMaterials(TEXTURES, this.windUniform);
    this.rockMat = rockMaterial(TEXTURES);
    const leafy = [broadleafTree(101), broadleafTree(202)], pines = [pineTree(303), pineTree(404)];
    const listL = [[], []], listP = [[], []];
    // 崖の上の森
    let count = 0;
    for (let n = 0; n < 4000 && count < 400; n++) {
      const x = rng.range(-HALF + 4, HALF - 4), z = rng.range(-HALF + 4, HALF - 4);
      const sd = t.sdAt(x, z);
      if (sd < 1.5 || sd > 34) continue;
      t.normalAt(x, z, nrm);
      if (nrm.y < 0.55) continue;
      const pine = rng.chance(0.66), v = rng.int(0, 1);
      (pine ? listP : listL)[v].push({ x, y: t.heightAt(x, z) - 0.2, z, ry: rng.range(0, 6.28), s: pine ? rng.range(0.85, 1.35) : rng.range(0.95, 1.5) });
      count++;
    }
    // 範囲の内側のふち（ハンターがぶつかる）
    count = 0;
    for (let n = 0; n < 2000 && count < 64; n++) {
      const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF);
      const sd = t.sdAt(x, z);
      if (sd > -1.5 || sd < -9 || nearArenaCenter(x, z)) continue;
      if (t.waterDepth(x, z) > -0.3 || Math.hypot(x - CAMP.x, z - CAMP.z) < 14 || distToPath(x, z) < 5.5) continue;
      const pine = rng.chance(0.35), v = rng.int(0, 1);
      (pine ? listP : listL)[v].push({ x, y: t.heightAt(x, z) - 0.15, z, ry: rng.range(0, 6.28), s: pine ? rng.range(0.8, 1.1) : rng.range(0.9, 1.25) });
      this.colliders.push({ x, z, r: 0.5 });
      count++;
    }
    this.propMeshes = [];
    for (let v = 0; v < 2; v++) {
      this.propMeshes.push(this._placeInstances(leafy[v].wood, fm.bark, listL[v]), this._placeInstances(leafy[v].leaves, fm.leaf, listL[v]));
      this.propMeshes.push(this._placeInstances(pines[v].wood, fm.bark, listP[v]), this._placeInstances(pines[v].leaves, fm.pine, listP[v]));
    }
    // 茂み
    const mul = { low: 0.4, mid: 0.7, high: 1 }[quality] || 1;
    const bushes = [];
    for (let n = 0; n < 4000 && bushes.length < 300 * mul; n++) {
      const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF);
      const sd = t.sdAt(x, z);
      if (sd > -0.8 || t.waterDepth(x, z) > -0.35 || distToPath(x, z) < 3.2 || Math.hypot(x - CAMP.x, z - CAMP.z) < 9) continue;
      if (Math.hypot(x - AREAS[4].x, z - AREAS[4].z) < 24) continue;
      if (nearArenaCenter(x, z) && rng.chance(0.8)) continue;
      bushes.push({ x, y: t.heightAt(x, z) - 0.1, z, ry: rng.range(0, 6.28), s: rng.range(0.8, 1.6) });
    }
    this.propMeshes.push(this._placeInstances(bush(55), fm.leaf, bushes, { cast: false }));
    // 岩：中の大岩（障害物）と、崖の岩
    const rockGeos = [smoothRock(1.1, (a, b, c) => noise.noise(a, b, c)), smoothRock(7.7, (a, b, c) => noise.noise(a, b, c)), smoothRock(13.3, (a, b, c) => noise.noise(a, b, c))];
    const rocks = [[], [], []], cliffRocks = [[], [], []];
    count = 0;
    for (let n = 0; n < 3000 && count < 60; n++) {
      const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF);
      const sd = t.sdAt(x, z);
      if (sd > -1.5 || distToPath(x, z) < 4.5 || Math.hypot(x - CAMP.x, z - CAMP.z) < 13 || t.waterDepth(x, z) > -0.3) continue;
      if (nearArenaCenter(x, z) && rng.chance(0.9)) continue;
      const s = rng.range(0.9, 2.0);
      rocks[count % 3].push({ x, y: t.heightAt(x, z) - s * 0.2, z, rx: rng.range(-0.3, 0.3), ry: rng.range(0, 6.28), rz: rng.range(-0.3, 0.3), s });
      this.colliders.push({ x, z, r: s * 0.85 });
      count++;
    }
    for (let n = 0; n < 3000 && count < 60 + 200; n++) {
      const x = rng.range(-HALF + 2, HALF - 2), z = rng.range(-HALF + 2, HALF - 2);
      const sd = t.sdAt(x, z);
      if (sd < 0.5 || sd > 40) continue;
      const s = rng.range(1.6, 4.5);
      cliffRocks[count % 3].push({ x, y: t.heightAt(x, z) - s * 0.3, z, rx: rng.range(-0.3, 0.3), ry: rng.range(0, 6.28), rz: rng.range(-0.3, 0.3), s });
      count++;
    }
    for (let i = 0; i < 3; i++) {
      this.propMeshes.push(this._placeInstances(rockGeos[i], this.rockMat, rocks[i]));
      this.propMeshes.push(this._placeInstances(rockGeos[i], this.rockMat, cliffRocks[i], { cast: false }));
    }
    this._buildGrassBlades(quality, rng);
  }

  _buildGrassBlades(quality, rng) {
    const t = this.terrain;
    const counts = { low: 6000, mid: 14000, high: 24000 };
    const want = counts[quality] || counts.high;
    const tufts = [];
    for (let n = 0; n < want * 4 && tufts.length < want; n++) {
      const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF);
      const sd = t.sdAt(x, z);
      if (sd > -0.5) continue;
      if (t.waterDepth(x, z) > -0.35) continue;
      if (distToPath(x, z) < 2.2 + rng.range(0, 1.5)) continue;
      if (Math.hypot(x - AREAS[4].x, z - AREAS[4].z) < 22 && rng.chance(0.8)) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 8) continue;
      tufts.push({ x, y: t.heightAt(x, z) - 0.03, z, ry: rng.range(0, 6.28), s: rng.range(0.8, 1.7) });
    }
    const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const wind = this.windUniform;
    grassMat.onBeforeCompile = sh => {
      sh.uniforms.uWind = wind;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
          transformed.x += sin(uWind * 1.7 + ph) * 0.09 * position.y;
          transformed.z += cos(uWind * 1.3 + ph) * 0.06 * position.y;
        #endif`);
    };
    this.grass = this._placeInstances(tuftGeometry(), grassMat, tufts, { cast: false, receive: true });
  }

  // 遺跡の柱・湖の睡蓮など
  _buildExtras() {
    const t = this.terrain, rng = new Rng(4321);
    const ruins = [['statue_column', -58, 12, 5], ['statue_columnDamaged', -52, 8, 5], ['statue_column', -64, 20, 5], ['statue_obelisk', -30, 12, 4.5], ['statue_columnDamaged', -36, 50, 5]];
    for (const [name, x, z, s] of ruins) {
      const m = propMesh(name, s);
      if (!m) continue;
      if (this.rockMat) m.traverse(o => { if (o.isMesh) o.material = this.rockMat; });
      m.position.set(x, t.heightAt(x, z) - 0.2, z); m.rotation.y = rng.range(0, 6.28);
      this.scene.add(m);
      this.colliders.push({ x, z, r: 0.9 });
    }
    const lilies = { lily_large: [], lily_small: [] };
    for (let n = 0; n < 400 && lilies.lily_large.length + lilies.lily_small.length < 34; n++) {
      const a = rng.range(0, 6.28), r = rng.range(3, LAKE.r * 1.1);
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      if (t.waterDepth(x, z) < 0.25) continue;
      (rng.chance(0.5) ? lilies.lily_large : lilies.lily_small).push({ x, y: WATER_LEVEL + 0.01, z, ry: rng.range(0, 6.28), s: rng.range(3.2, 4.5) });
    }
    for (const [k, list] of Object.entries(lilies)) this._instanceModel(k, list, { cast: false });
    // 巣のまわりの倒木
    const nest = [['log_large', 7, 3, 4.2, 0.4], ['log_large', -6, -5, 4.2, 1.9], ['stump_old', 9, -6, 4.5, 0], ['stump_roundDetailed', -9, 6, 4, 0], ['log', 4, 9, 4, 2.6]];
    for (const [name, dx, dz, s, ry] of nest) {
      const m = propMesh(name, s);
      if (!m) continue;
      const x = NEST.x + dx, z = NEST.z + dz;
      m.position.set(x, t.heightAt(x, z) - 0.1, z); m.rotation.y = ry;
      this.scene.add(m);
      this.colliders.push({ x, z, r: name.startsWith('log') ? 1.2 : 0.9 });
    }
  }

  _buildCamp() {
    const t = this.terrain, g = new THREE.Group();
    const y0 = t.heightAt(CAMP.x, CAMP.z);
    g.position.set(CAMP.x, y0, CAMP.z);
    // テント（三角柱）
    const kTent = this.usingModels && propMesh('tent_detailedOpen', 6.2);
    if (kTent) {
      kTent.position.set(-2.2, -0.05, 1.8); kTent.rotation.y = 2.5;
      g.add(kTent);
      const extras = [['bed', 3.2, 1.8, -0.2, -2.4, 2.6], ['log_stack', 3.2, -5.5, 0, -1.5, 0.3], ['pot_large', 3, -4.6, 0, 1.2, 0], ['sign', 3.2, 12.5, 0, -10.5, 2.6]];
      for (const [name, sc, x, y, z, ry] of extras) {
        const m = propMesh(name, sc);
        if (!m) continue;
        m.position.set(x, this.terrain.heightAt(CAMP.x + x, CAMP.z + z) - y0 + y, z); m.rotation.y = ry;
        g.add(m);
        this.colliders.push({ x: CAMP.x + x, z: CAMP.z + z, r: name === 'sign' ? 0.4 : 1.0 });
      }
    } else {
      const cloth = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
      const tent = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 5.2, 3, 1, true), cloth);
      tent.rotation.z = Math.PI / 2; tent.rotation.y = 0.5;
      tent.position.set(-2, 1.2, 1);
      tent.castShadow = true;
      g.add(tent);
    }
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9, flatShading: true });
    // 支給品ボックス
    const box = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.8), wood);
    body.position.y = 0.35;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.16, 0.88), new THREE.MeshStandardMaterial({ color: 0x4d3420, roughness: 0.85 }));
    lid.position.y = 0.76;
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xb08d3a, metalness: 0.7, roughness: 0.4 });
    for (const bx of [-0.45, 0.45]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.88, 0.84), bandMat);
      b.position.set(bx, 0.42, 0); box.add(b);
    }
    box.add(body, lid);
    box.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const bx = CAMP.boxX - CAMP.x, bz = CAMP.boxZ - CAMP.z;
    box.position.set(bx, t.heightAt(CAMP.boxX, CAMP.boxZ) - y0, bz);
    box.rotation.y = 0.4;
    g.add(box);
    this.supplyBox = box;
    // たき火
    const fire = new THREE.Group();
    const kStones = this.usingModels && propMesh('campfire_stones', 2.8), kLogs = this.usingModels && propMesh('campfire_logs', 2.8);
    if (kStones && kLogs) { fire.add(kStones, kLogs); }
    else for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x77726c, flatShading: true }));
      const a = i / 8 * Math.PI * 2; s.position.set(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7); fire.add(s);
    }
    for (let i = 0; i < (kStones ? 0 : 3); i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 5), wood);
      l.rotation.z = Math.PI / 2; l.rotation.y = i * 1.05; l.position.y = 0.15; fire.add(l);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffa43a, transparent: true, opacity: 0.85 }));
    flame.position.y = 0.55; fire.add(flame);
    this.flame = flame;
    const light = new THREE.PointLight(0xff9a40, 18, 14, 1.6);
    light.position.y = 1.2; fire.add(light);
    this.fireLight = light;
    fire.position.set(3, t.heightAt(CAMP.x + 3, CAMP.z - 3) - y0, -3);
    g.add(fire);
    this.firePos = new THREE.Vector3(CAMP.x + 3, t.heightAt(CAMP.x + 3, CAMP.z - 3) + 0.5, CAMP.z - 3);
    // 旗
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 5), wood);
    pole.position.set(2.5, 2.5, 4); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ color: 0xa8322a, side: THREE.DoubleSide, roughness: 0.9 }));
    flag.position.set(3.3, 4.4, 4); g.add(flag);
    this.flag = flag;
    this.scene.add(g);
    this.camp = g;
    this.colliders.push({ x: CAMP.x - 2, z: CAMP.z + 1, r: 2.2 });
    this.colliders.push({ x: CAMP.boxX, z: CAMP.boxZ, r: 0.75 });
    this.colliders.push({ x: CAMP.x + 3, z: CAMP.z - 3, r: 0.8 });
  }

  _buildNest() {
    const t = this.terrain, g = new THREE.Group();
    g.position.set(NEST.x, t.heightAt(NEST.x, NEST.z), NEST.z);
    const straw = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.7, 6, 22), new THREE.MeshStandardMaterial({ color: 0x9c7f45, roughness: 1, flatShading: true }));
    straw.rotation.x = Math.PI / 2; straw.scale.z = 0.5; straw.position.y = 0.1;
    straw.receiveShadow = true;
    g.add(straw);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc5, roughness: 0.8, flatShading: true });
    const rng = new Rng(88);
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, rng.range(0.8, 1.8), 5), boneMat);
      shaft.rotation.z = Math.PI / 2;
      b.add(shaft);
      const L = shaft.geometry.parameters.height / 2;
      for (const sx of [-L, L]) { const k = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), boneMat); k.position.x = sx; b.add(k); }
      const a = rng.range(0, 6.28), r = rng.range(6, 14);
      const x = NEST.x + Math.cos(a) * r, z = NEST.z + Math.sin(a) * r;
      b.position.set(x - NEST.x, t.heightAt(x, z) - g.position.y + 0.08, z - NEST.z);
      b.rotation.y = rng.range(0, 6.28);
      g.add(b);
    }
    // 卵
    const egg = new THREE.MeshStandardMaterial({ color: 0xe9e1c9, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), egg);
      e.scale.y = 1.3; e.position.set(-5.2 + i * 0.7, 0.55, 5.5 - i * 0.4); e.castShadow = true;
      g.add(e);
    }
    this.scene.add(g);
    this.nest = g;
  }

  // 太陽の影をハンターのまわりに合わせる
  followShadow(x, z) {
    const y = this.terrain.heightAt(x, z);
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + this.sunDir.x * 120, y + this.sunDir.y * 120, z + this.sunDir.z * 120);
    this.sun.target.updateMatrixWorld();
  }

  update(dt, camera) {
    this.time += dt;
    this.windUniform.value = this.time;
    if (camera) this.sky.position.copy(camera.position);
    if (this.skyMat) this.skyMat.uniforms.uTime.value = this.time;
    if (this.waterN) this.waterN.offset.set(this.time * 0.012, this.time * 0.02);
    if (this.flame) {
      const f = 0.85 + Math.sin(this.time * 17) * 0.08 + Math.sin(this.time * 7.3) * 0.07;
      this.flame.scale.set(f, 0.9 + (1 - f) * 2, f);
      this.fireLight.intensity = 15 + f * 6;
    }
    if (this.flag) this.flag.rotation.y = Math.sin(this.time * 2.1) * 0.25;
  }

  // ミニマップ用の画像（北＝-Z が上）
  makeMapImage(size = 256) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const img = g.createImageData(size, size);
    const t = this.terrain;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = -HALF + (px + 0.5) / size * WORLD_SIZE, z = -HALF + (py + 0.5) / size * WORLD_SIZE;
        const h = t.heightAt(x, z), sd = t.sdAt(x, z);
        const hx = t.heightAt(x + 1, z) - t.heightAt(x - 1, z), hz = t.heightAt(x, z + 1) - t.heightAt(x, z - 1);
        const shade = clamp(1 - (hx * 0.5 + hz * 0.5) * 0.18, 0.6, 1.25);
        let c;
        if (h < WATER_LEVEL) c = [0.22, 0.45, 0.6];
        else if (sd > 0.5) c = [0.22, 0.2, 0.18];
        else c = groundColor(x, z, h, 0, sd).map(v => v * 1.15);
        const k = (py * size + px) * 4;
        img.data[k] = clamp(c[0] * shade * 255, 0, 255);
        img.data[k + 1] = clamp(c[1] * shade * 255, 0, 255);
        img.data[k + 2] = clamp(c[2] * shade * 255, 0, 255);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.font = `bold ${Math.round(size * 0.07)}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const a of AREAS) {
      const [mx, my] = worldToMap(a.x, a.z, size);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath(); g.arc(mx, my, size * 0.05, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f5e6c0';
      g.fillText(a.short, mx, my + 1);
    }
    return cv;
  }
}

export function worldToMap(x, z, size) {
  return [(x + HALF) / WORLD_SIZE * size, (z + HALF) / WORLD_SIZE * size];
}

function distToPath(x, z) {
  let d = 1e9;
  for (const [i, j] of LINKS) {
    const A = AREAS[i], B = AREAS[j];
    d = Math.min(d, distToSeg2D(x, z, A.x, A.z, B.x, B.z));
  }
  return d;
}

// エリアの道順（幅優先探索）
export function areaPath(from, to) {
  if (from === to) return [to];
  const prev = new Map([[from, -1]]), q = [from];
  while (q.length) {
    const a = q.shift();
    for (const [i, j] of LINKS) {
      const b = i === a ? j : j === a ? i : -1;
      if (b < 0 || prev.has(b) || b === 0) continue;
      prev.set(b, a);
      if (b === to) { const path = [b]; let c = a; while (c !== from) { path.unshift(c); c = prev.get(c); } return path; }
      q.push(b);
    }
  }
  return [to];
}
