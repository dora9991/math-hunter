// 三人称カメラ：マウス（ポインタロック）と矢印キーで回す。Qで背後、Tでモンスターの方へ。
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle, lerp } from './util.js';

const _v = new THREE.Vector3();

export class CameraRig {
  constructor(camera, terrain) {
    this.cam = camera;
    this.terrain = terrain;
    this.yaw = Math.PI;       // カメラがハンターのどちら側にいるか
    this.pitch = 0.3;
    this.dist = 6.2;
    this.target = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.trauma = 0;          // 画面揺れ
    this.resetting = false;
    this.lockOn = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.time = 0;
  }

  snapBehind(h) {
    this.yaw = h.facing + Math.PI;
    this.target.set(h.pos.x, h.pos.y + 1.45, h.pos.z);
  }

  shake(v) { this.trauma = Math.min(1.2, this.trauma + v); }

  update(dt, hunter, monster, input, active) {
    this.time += dt;
    if (active) {
      const s = 0.0024 * this.sensitivity;
      if (input.dx || input.dy) this.resetting = false;
      this.yaw -= input.dx * s;
      this.pitch += input.dy * s * (this.invertY ? -1 : 1);
      // 矢印キー（2ndG の十字キー操作の再現）
      const k = 2.3 * dt;
      if (input.held('ArrowLeft')) { this.yaw += k; this.resetting = false; }
      if (input.held('ArrowRight')) { this.yaw -= k; this.resetting = false; }
      if (input.held('ArrowUp')) this.pitch -= k * 0.7;
      if (input.held('ArrowDown')) this.pitch += k * 0.7;
      if (input.hit('KeyQ')) { this.resetting = true; this.lockOn = false; }
      if (input.hit('KeyT') && monster) this.lockOn = !this.lockOn;
    }
    if (this.lockOn && monster && monster.alive) {
      const dx = monster.focusX() - hunter.pos.x, dz = monster.focusZ() - hunter.pos.z;
      this.yaw = dampAngle(this.yaw, Math.atan2(-dx, -dz), 5, dt);
      this.pitch = damp(this.pitch, 0.22, 3, dt);
    } else if (this.lockOn && (!monster || !monster.alive)) this.lockOn = false;
    if (this.resetting) {
      const goal = hunter.facing + Math.PI;
      this.yaw = dampAngle(this.yaw, goal, 12, dt);
      if (Math.abs(wrapAngle(goal - this.yaw)) < 0.02) this.resetting = false;
    }
    this.pitch = clamp(this.pitch, -0.45, 1.2);
    this.yaw = wrapAngle(this.yaw);

    const low = hunter.state === 'knock' || hunter.state === 'dead' || hunter.state === 'roll';
    _v.set(hunter.pos.x, hunter.pos.y + (low ? 1.1 : 1.45), hunter.pos.z);
    this.target.x = damp(this.target.x, _v.x, 14, dt);
    this.target.y = damp(this.target.y, _v.y, 7, dt);
    this.target.z = damp(this.target.z, _v.z, 14, dt);

    // 少し遠めにするとモンスターが見やすい
    const want = monster && monster.alive && monster.inCombat ? 8.2 : 6.2;
    this.dist = damp(this.dist, want, 1.5, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    let d = this.dist;
    // 地形にめり込まないように
    for (let i = 1; i <= 8; i++) {
      const f = i / 8, dd = d * f;
      const x = this.target.x + Math.sin(this.yaw) * cp * dd, z = this.target.z + Math.cos(this.yaw) * cp * dd;
      const y = this.target.y + sp * dd;
      const g = this.terrain.heightAt(x, z) + 0.45;
      if (y < g) {
        // 高さを上げて逃がす
        const need = g - this.target.y;
        if (dd > 1.2 && need > 0) { d = Math.max(1.2, dd); break; }
      }
    }
    const cam = this.cam;
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * d,
      this.target.y + sp * d,
      this.target.z + Math.cos(this.yaw) * cp * d,
    );
    const floor = this.terrain.heightAt(cam.position.x, cam.position.z) + 0.45;
    if (cam.position.y < floor) cam.position.y = floor;
    this.lookAt.copy(this.target);
    this.lookAt.y += 0.15;
    // 揺れ
    if (this.trauma > 0) {
      const a = this.trauma * this.trauma * 0.35, t = this.time * 38;
      cam.position.x += Math.sin(t * 1.1) * a; cam.position.y += Math.sin(t * 1.7 + 1) * a * 0.8; cam.position.z += Math.sin(t * 1.3 + 2) * a;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    cam.lookAt(this.lookAt);
  }

  // タイトル画面などで景色を回す
  orbit(dt, cx, cy, cz, r, h, speed) {
    this.time += dt;
    const a = this.time * speed;
    this.cam.position.set(cx + Math.sin(a) * r, cy + h, cz + Math.cos(a) * r);
    this.cam.lookAt(cx, cy + 2.5, cz);
  }
}
