// アイテム（ポーチ）と、その効果：回復・砥石・閃光・ペイント・罠
import * as THREE from 'three';
import { SHARPNESS_MAX } from './config.js';

export const ITEMS = [
  { id: 'potion', name: '回復薬', mark: '回', color: '#46b85a', kind: 'drink', dur: 2.15, at: 0.95, flexAt: 1.15, heal: 32, desc: '体力を少し回復する' },
  { id: 'mega', name: '上回復薬', mark: '上', color: '#2fd08a', kind: 'drink', dur: 2.15, at: 0.95, flexAt: 1.15, heal: 60, desc: '体力を大きく回復する' },
  { id: 'whet', name: '砥石', mark: '砥', color: '#9aa3ad', kind: 'whet', dur: 2.9, at: 2.55, desc: '武器の切れ味を最大まで戻す' },
  { id: 'flash', name: '閃光弾', mark: '閃', color: '#f2d64b', kind: 'throw', dur: 0.72, at: 0.36, desc: '強い光でモンスターの目をくらます' },
  { id: 'paint', name: 'ペイント玉', mark: '塗', color: '#e85aa6', kind: 'throw', dur: 0.72, at: 0.36, desc: '当てるとモンスターの位置が地図に出る' },
  { id: 'trap', name: '雷撃罠', mark: '罠', color: '#4aa8f0', kind: 'trap', dur: 1.45, at: 1.0, desc: '踏んだモンスターをしびれさせて止める' },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
export const START_POUCH = { potion: 10, whet: 12, paint: 2 };
export const SUPPLY_BOX = { mega: 2, flash: 2, trap: 1, paint: 1 };

const _v = new THREE.Vector3();

export class Items {
  constructor(game) {
    this.game = game;
    this.counts = {};
    this.sel = 0;
    this.projectiles = [];
    this.traps = [];
    this.supplyTaken = false;
    this.ballGeo = new THREE.SphereGeometry(0.1, 8, 6);
  }
  reset() {
    this.counts = { ...START_POUCH };
    this.sel = 0;
    this.supplyTaken = false;
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    for (const t of this.traps) this.game.scene.remove(t.mesh);
    this.projectiles = []; this.traps = [];
  }
  count(id) { return this.counts[id] || 0; }
  add(id, n) { this.counts[id] = (this.counts[id] || 0) + n; }
  consume(id) { if (this.counts[id] > 0) this.counts[id]--; }
  current() { return ITEMS[this.sel]; }
  select(delta) {
    this.sel = (this.sel + delta + ITEMS.length) % ITEMS.length;
    this.game.sfx('select');
  }
  takeSupply() {
    if (this.supplyTaken) { this.game.message('支給品はもう受け取った', 'info'); return; }
    this.supplyTaken = true;
    const names = [];
    for (const [id, n] of Object.entries(SUPPLY_BOX)) { this.add(id, n); names.push(`${ITEM_BY_ID[id].name}×${n}`); }
    this.game.message('支給品を受け取った：' + names.join('、'), 'good');
    this.game.sfx('item');
  }

  // ハンターのモーション中の決まった時刻に呼ばれる
  effect(id, h) {
    const g = this.game, def = ITEM_BY_ID[id];
    switch (def.kind) {
      case 'drink':
        h.heal(def.heal);
        g.sfx('heal');
        g.fx.sparks(_v.copy(h.pos).setY(h.pos.y + 1.2), 14, 0x7cff9a, 3);
        setTimeout(() => g.sfx('flex'), 200);
        break;
      case 'whet':
        this.consume(id);
        h.sharp = SHARPNESS_MAX;
        g.sfx('sharpen');
        g.message('切れ味が回復した', 'good');
        break;
      case 'throw': {
        this.consume(id);
        g.sfx('throw');
        const fwd = _v.set(Math.sin(h.facing), 0, Math.cos(h.facing));
        const start = h.pos.clone().add(new THREE.Vector3(0, 1.7, 0)).addScaledVector(fwd, 0.4);
        let vel;
        const m = g.monster;
        if (id === 'paint' && m && m.alive) {
          // ペイントはモンスターへ向けて投げる（前方で届く距離なら）
          const tgt = m.focusPoint();
          const d = tgt.clone().sub(start), dist = d.length();
          const ang = Math.abs(Math.atan2(d.x, d.z) - h.facing);
          if (dist < 30 && (Math.cos(ang) > 0.3)) { vel = d.normalize().multiplyScalar(26); vel.y += 2; }
        }
        if (!vel) vel = fwd.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5, 0));
        const mesh = new THREE.Mesh(this.ballGeo, new THREE.MeshBasicMaterial({ color: def.color }));
        mesh.position.copy(start);
        g.scene.add(mesh);
        this.projectiles.push({ id, mesh, vel, t: 0 });
        break;
      }
      case 'trap': {
        this.consume(id);
        const pos = h.pos.clone().add(new THREE.Vector3(Math.sin(h.facing) * 1.1, 0, Math.cos(h.facing) * 1.1));
        pos.y = g.world.terrain.heightAt(pos.x, pos.z);
        const mesh = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x3b4450, metalness: 0.6, roughness: 0.5 }));
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0x4aa8f0, emissive: 0x2a78c0, emissiveIntensity: 0.8 }));
        coil.rotation.x = Math.PI / 2; coil.position.y = 0.1;
        base.position.y = 0.06;
        mesh.add(base, coil);
        mesh.position.copy(pos);
        g.scene.add(mesh);
        this.traps.push({ mesh, pos, t: 0, armed: true, active: false, life: 0 });
        g.sfx('trap');
        g.message('雷撃罠を仕掛けた', 'info');
        break;
      }
    }
  }

  update(dt) {
    const g = this.game, T = g.world.terrain, m = g.monster;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      p.vel.y -= 14 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;
      let done = false;
      if (p.id === 'paint' && m && m.alive && m.pointHits(pos, 0.3)) {
        m.painted = true; m.paintTime = 300;
        g.message('ペイントボールが当たった！', 'good');
        g.fx.sparks(pos, 14, 0xff60c0, 4);
        done = true;
      }
      if (p.id === 'flash' && p.t > 0.42) { g.flashAt(pos.clone()); done = true; }
      if (!done && pos.y < T.heightAt(pos.x, pos.z)) {
        if (p.id === 'flash') g.flashAt(pos.clone());
        else g.fx.sparks(pos, 8, 0xff60c0, 2);
        done = true;
      }
      if (done || p.t > 3) { g.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
    }
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const tr = this.traps[i];
      tr.t += dt;
      tr.mesh.children[1].rotation.z += dt * 3;
      if (tr.armed && m && m.alive && m.canBeTrapped() && m.footNear(tr.pos, 2.0)) {
        tr.armed = false; tr.active = true; tr.life = 0;
        m.trap(tr.pos);
      }
      if (tr.active) {
        tr.life += dt;
        if (tr.life > 8 || !m || !m.trapped) { g.scene.remove(tr.mesh); this.traps.splice(i, 1); continue; }
        if (Math.random() < 0.6) g.fx.electric(tr.pos, 1.8);
      }
      if (tr.t > 120) { g.scene.remove(tr.mesh); this.traps.splice(i, 1); }
    }
  }
}
