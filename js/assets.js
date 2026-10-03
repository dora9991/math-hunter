// 3Dモデル（Kenney「Nature Kit」CC0）の読み込み。色はこのゲームの雰囲気に合わせて塗り替える
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import EMBED from './assetData.js';
import { NEW_BEAST_IDS } from './bestiary.js';

// いま使っているのはキャンプ用品・倒木・遺跡・睡蓮だけ（木・岩・草花は js/scenery.js で作るようにした）
export const MODEL_NAMES = [
  'lily_large', 'lily_small',
  'tent_detailedOpen', 'campfire_stones', 'campfire_logs', 'bed', 'log_stack', 'sign', 'pot_large',
  'log_large', 'log', 'stump_old', 'stump_roundDetailed', 'statue_column', 'statue_columnDamaged', 'statue_obelisk',
];

// 素材の名前 → 色（元は明るい水色の葉とオレンジの幹なので、落ち着いた色に）
const PALETTE = {
  leafsGreen: 0x557f37, leafsDark: 0x335d35, leafsFall: 0x9a6a2a,
  woodBark: 0x6a4a33, woodBarkDark: 0x4d3527, wood: 0x8a6440, woodDark: 0x654630, woodInner: 0xc7a676, woodBirch: 0xe2d8c4,
  grass: 0x5f8d3d, dirt: 0x7b5d41, stone: 0x8e8a83, stoneDark: 0x6b6863,
  colorRed: 0xa93a2c, colorYellow: 0xd9b13a, colorPurple: 0x8757ad, colorBlue: 0x4a78b0, _defaultMat: 0xd8d2c4,
};

export const PROPS = {};
// Blender で作ったキャラクター（骨つき）。名前 → gltf
export const CREATURES = {};
// 地形や樹皮の質感（Poly Haven の CC0 画像）。名前 → Texture
export const TEXTURES = {};
const TEXTURE_NAMES = ['grass', 'dirt', 'rock', 'sand', 'bark'];
const CREATURE_FILES = { zarva: 'assets/models/monster/zarva.glb', sektra: 'assets/models/monster/sektra.glb', veira: 'assets/models/monster/veira.glb', hunter: 'assets/models/hunter/hunter.glb' };
for (const id of NEW_BEAST_IDS) CREATURE_FILES[id] = `assets/models/monster/${id}.glb`;
const matCache = {};
function sharedMat(m) {
  const key = m.name || '_defaultMat';
  if (!matCache[key]) {
    const color = PALETTE[key] !== undefined ? PALETTE[key] : m.color.getHex();
    matCache[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, flatShading: true, side: key.startsWith('leafs') || key === 'grass' ? THREE.DoubleSide : THREE.FrontSide });
    matCache[key].name = key;
  }
  return matCache[key];
}

function b64ToBuf(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

export async function loadAssets() {
  const loader = new GLTFLoader();
  let ok = 0;
  await Promise.all(MODEL_NAMES.map(async name => {
    try {
      const gltf = EMBED && EMBED[name]
        ? await loader.parseAsync(b64ToBuf(EMBED[name]), '')
        : await loader.loadAsync(`assets/models/kenney/${name}.glb`);
      gltf.scene.updateMatrixWorld(true);
      const parts = [];
      const box = new THREE.Box3();
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        g.computeBoundingBox();
        box.union(g.boundingBox);
        parts.push({ geo: g, mat: sharedMat(o.material) });
      });
      PROPS[name] = { parts, box };
      ok++;
    } catch (e) {
      console.warn('モデルを読めませんでした', name, e && e.message);
    }
  }));
  // 骨つきのモデル（竜）
  await Promise.all(Object.entries(CREATURE_FILES).map(async ([name, url]) => {
    try {
      const key = 'creature:' + name;
      const gltf = EMBED && EMBED[key] ? await loader.parseAsync(b64ToBuf(EMBED[key]), '') : await loader.loadAsync(url);
      CREATURES[name] = gltf;
    } catch (e) {
      console.warn('キャラクターのモデルを読めませんでした', name, e && e.message);
    }
  }));
  // 質感の画像
  const tl = new THREE.TextureLoader();
  const jobs = [];
  for (const n of TEXTURE_NAMES) for (const kind of ['color', 'normal']) {
    const key = `${n}_${kind}`;
    const url = EMBED && EMBED['tex:' + key] ? EMBED['tex:' + key] : `assets/textures/${key}.jpg`;
    jobs.push(tl.loadAsync(url).then(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      TEXTURES[key] = t;
    }).catch(e => console.warn('画像を読めませんでした', key)));
  }
  await Promise.all(jobs);
  if (TEXTURE_NAMES.some(n => !TEXTURES[n + '_color'] || !TEXTURES[n + '_normal'])) for (const k of Object.keys(TEXTURES)) delete TEXTURES[k];
  return ok;
}

export const hasProps = () => Object.keys(PROPS).length > 0;

// モデルを1個だけ置く（キャンプの小物など）
export function propMesh(name, scale = 1) {
  const p = PROPS[name];
  if (!p) return null;
  const g = new THREE.Group();
  for (const part of p.parts) {
    const m = new THREE.Mesh(part.geo, part.mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}
