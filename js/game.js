// ゲーム全体：画面の切り替え・狩猟の進行・当たり判定の呼び出し・描画ループ
import * as THREE from 'three';
import { GAME_TITLE, MONSTER, QUEST, HUNTER } from './config.js';
import { store, clamp, Rng, fmtTime, lerp } from './util.js';
import { World, CAMP, AREAS, NEST, WATER_LEVEL } from './world.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Hunter } from './hunter.js';
import { Monster } from './monster.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Items } from './items.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';
import { calcDamage, isBounce, bladeVsHitboxes, shapeHitsHunter } from './combat.js';
import { GREATSWORD } from './weapons.js';
import { MathBattle } from './mathbattle.js';

const DEFAULT_SETTINGS = { sensitivity: 1, invertY: false, mouseCam: true, volume: 0.7, bgm: true, quality: 'mid', bloom: false, numbers: true, monsterHp: false, difficulty: 'normal', weapon: 'gs' };
// 画質ごとの「描く画素数」の上限（Retina で全画面にしても重くなりすぎないように）
const PIXEL_BUDGET = { low: 0.65e6, mid: 1.0e6, high: 1.6e6 };
const DIFF = {
  easy: { hp: 0.65, dmg: 0.65, speed: 0.9, label: 'やさしい' },
  normal: { hp: 1, dmg: 1, speed: 1, label: 'ふつう' },
  hard: { hp: 1.35, dmg: 1.35, speed: 1.12, label: '手ごわい' },
};
// 章ボスは専用曲。通常戦闘の難曲は強敵や「むずかしい」で流す仮配置。
const MUSIC_BOSSES = new Set(['zarva', 'sektra', 'veira', 'galdo', 'barza', 'lunax']);
const MUSIC_STRONG = new Set(['gradon', 'frostra', 'nebra']);
const mathBattleMusic = opts => MUSIC_BOSSES.has(opts.enemy) ? 'boss'
  : opts.problem === 'hard' || MUSIC_STRONG.has(opts.enemy) ? 'battle3' : 'battle1';

// 剥ぎ取りの報酬表
const CARVE_BODY = [['焔角竜の鱗', 40], ['焔角竜の甲殻', 30], ['焔角竜の牙', 16], ['焔角竜の爪', 11], ['焔竜玉', 3]];
const CARVE_TAIL = [['焔角竜の尻尾', 62], ['焔角竜の鱗', 28], ['焔角竜の甲殻', 7], ['焔竜玉', 3]];
const QUEST_REWARD = [['焔角竜の鱗', 35], ['焔角竜の甲殻', 30], ['焔角竜の爪', 15], ['焔角竜の牙', 15], ['焔竜玉', 5]];

export class Game {
  constructor(container, overlays) {
    this.container = container;
    this.overlays = overlays;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, store.get('hunter.settings', {}));
    this.params = new URLSearchParams(location.search);
    this.debug = this.params.has('debug');
    this.seed = parseInt(this.params.get('seed') || '0', 10) || (Math.floor(Math.random() * 1e6) + 1);
    this.rng = new Rng(this.seed);
    this.time = 0;
    this.timeScale = 1;
    this.mode = 'boot';
    this.paused = false;

    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    r.domElement.tabIndex = 0;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1400);
    this.world = new World(this.scene, r, 'high');
    this.fx = new FX(this.scene, this.camera, overlays.fx);
    this.audio = new Audio();
    this.items = new Items(this);
    this.input = new Input(r.domElement);
    this.camRig = new CameraRig(this.camera, this.world.terrain);
    this.hunter = new Hunter(this);
    this.scene.add(this.hunter.root);
    this.monster = new Monster(this);
    this.hud = new HUD(overlays.hud, this);
    this.hud.setMap(this.world.makeMapImage(256));
    this.menus = new Menus(overlays.menu, this);
    this.quest = null;
    this.intent = this._blankIntent();
    this.intentQuiet = this._blankIntent();
    this.pendA = -1; this.pendB = -1;
    this.currentHint = '';
    this.fps = 60;
    this.frameTimes = [];

    this.input.onLockChange = locked => {
      if (!locked && this.mode === 'hunt' && !this.paused && !this.quest?.ended) {
        if (this._ignoreUnlock) { this._ignoreUnlock = false; return; }
        this.pause();
      }
    };
    window.addEventListener('keydown', e => this._onKey(e));
    r.domElement.addEventListener('mousedown', () => {
      this.audio.start();
      if (this.mode === 'hunt' && !this.math && !this.paused && this.settings.mouseCam && !this.input.locked && !this.input.lockFailed) {
        this._swallowClick = true;
        this.input.requestLock();
      }
    });
    this._setupPost();
    this.math = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.applySettings();
    this.lastNow = performance.now();
    r.setAnimationLoop(() => this.frame());
    this.goTitle();
    // ?math=1 で、数式バトルから始める
    // 例：?math=1&level=easy ／ ?math=1&slowSec=12&problem=hard
    if (this.params.has('math')) this.startMathBattle(this.params.has('level') || this.params.has('tempo') || this.params.has('problem') || this.params.has('enemy') || this.params.has('background') ? Object.fromEntries(this.params) : (this.settings.math || {}));
  }

  // 画面全体の仕上げ：光のにじみ（ブルーム）と色の調整。画質「軽い」では使わない
  _setupPost() {
    try {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      const c = new EffectComposer(this.renderer, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.34, 0.6, 1.0);
      c.addPass(this.bloom);
      c.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
          void main(){
            vec3 c = texture2D(tDiffuse, vUv).rgb;
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(vec3(l), c, 1.12);                        // 少しあざやかに
            c = c * vec3(1.03, 1.0, 0.96);                    // わずかに暖色へ
            vec2 q = vUv - 0.5;
            c *= 1.0 - dot(q, q) * 0.42;                      // 画面の端を少し暗く
            gl_FragColor = vec4(c, 1.0);
          }`,
      }));
      c.addPass(new OutputPass());
      this.composer = c;
    } catch (e) { console.warn('後処理を用意できませんでした', e); this.composer = null; }
  }
  render() {
    // 影は1コマおきに描き直す（軽くするため）
    this.frameNo = (this.frameNo || 0) + 1;
    this.world.sun.shadow.autoUpdate = false;
    if (this.frameNo % 2 === 0) this.world.sun.shadow.needsUpdate = true;
    if (this.composer && this.settings.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  _blankIntent() {
    return { mx: 0, mz: 0, moveLen: 0, sprint: false, dodge: false, atkA: false, atkB: false, atkAB: false, atkAHeld: false, guard: false, spirit: false, sheathe: false, useItem: false, interact: false };
  }

  // ---------- 設定 ----------
  saveSettings() { store.set('hunter.settings', this.settings); }
  applySettings() {
    const s = this.settings;
    this.camRig.sensitivity = s.sensitivity;
    this.camRig.invertY = s.invertY;
    this.audio.setVolume(s.volume);
    this.fx.showNumbers = s.numbers;
    const sm = s.quality === 'high' ? 2048 : 1024;
    if (this.world.sun.shadow.mapSize.x !== sm) {
      this.world.sun.shadow.mapSize.set(sm, sm);
      if (this.world.sun.shadow.map) { this.world.sun.shadow.map.dispose(); this.world.sun.shadow.map = null; }
    }
    const g = this.world.grass;
    if (g) g.count = Math.floor(g.instanceMatrix.count * ({ low: 0.3, mid: 0.6, high: 1 }[s.quality] || 1));
    if (!s.bgm) this.audio.bgm(null);
    else if (this.mode === 'title') this.audio.bgm('title');
    else if (this.mode === 'home') this.audio.bgm(this.homeTab === 'math' ? 'prebattle' : 'menu');
    else if (this.mode === 'hunt') this.audio.bgm(this.math ? mathBattleMusic(this.math.opts) : this.monster.inCombat ? 'battle1' : 'prebattle');
    else if (this.mode === 'result') this.audio.bgm((this.quest?.math ? this.lastMath?.win : this.quest?.success) ? 'victory' : 'defeat');
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    const budget = PIXEL_BUDGET[this.settings.quality] || PIXEL_BUDGET.mid;
    this.renderer.setPixelRatio(clamp(Math.sqrt(budget / Math.max(1, w * h)), 0.6, devicePixelRatio || 1));
    this.renderer.setSize(w, h);
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.resize(h, this.camera.fov);
    this.w = w; this.h = h;
  }

  sfx(name) { this.audio.play(name); }
  message(text, kind) { this.hud.message(text, kind); }
  camShake(v) { this.camRig.shake(v); }

  // ---------- 画面 ----------
  goTitle() {
    this.mode = 'title';
    this.paused = false;
    this._leaveHunt();
    this.monster.resetForDemo();
    this.menus.title();
    this.audio.bgm(this.settings.bgm ? 'title' : null);
  }
  goHome() {
    this.audio.start();
    this.mode = 'home';
    this.paused = false;
    this._leaveHunt();
    if (!this.monster.demo) this.monster.resetForDemo();
    this.menus.home();
  }
  _leaveHunt() {
    if (this.math) { this.math.dispose(); this.math = null; }
    this.overlays.hud.classList.remove('math');
    this.overlays.hud.classList.add('hidden');
    this.input.captureKeys = false;
    this._ignoreUnlock = true;
    this.input.exitLock();
    this.hunter.root.visible = false;
    this.items.reset();
    this.fx.clear();
    this.hud.clearMessages();
    this.hud.toggleBigMap(false);
    this.hud.toggleHelp(false);
    this.timeScale = this.forcedTimeScale || 1;
  }

  startHunt() {
    this.audio.start();
    this.monster.setVariant('zarva');
    const diff = DIFF[this.settings.difficulty] || DIFF.normal;
    this.diff = diff;
    this.quest = {
      time: 0, timeLimit: QUEST.timeLimit, carts: 0, maxCarts: QUEST.maxCarts,
      rewards: [], breaks: [], ended: false, cleared: false, clearAt: 0, failAt: 0, reason: '',
      carvesBody: 3, carvesTail: 1, stats: { hits: 0, dmg: 0 },
    };
    this.time = 0;
    this.lastHit = null;
    const h = this.hunter;
    h.setWeapon(this.settings.weapon || 'gs');
    h.reset();
    h.root.visible = true;
    h.pos.set(CAMP.spawnX, this.world.terrain.heightAt(CAMP.spawnX, CAMP.spawnZ), CAMP.spawnZ);
    h.facing = CAMP.spawnYaw;
    h._updatePose(0);
    this.items.reset();
    this.monster.resetForHunt(diff);
    this.camRig.snapBehind(h);
    this.camRig.lockOn = false;
    this.menus.hide();
    this.overlays.hud.classList.remove('hidden');
    this.hud.last = {};
    this.mode = 'hunt';
    this.paused = false;
    this.input.captureKeys = true;
    if (this.settings.mouseCam) this.input.requestLock();
    this.message('クエスト開始！', 'big');
    setTimeout(() => this.mode === 'hunt' && this.message('キャンプの支給品ボックス（F）で道具を受け取ろう', 'info'), 1500);
    if (this.settings.bgm) this.audio.bgm('prebattle');
    this.renderer.domElement.focus();
  }

  // 数式バトル（実験）：問題を解くと行動できる。敵は止まらない
  startMathBattle(opts = {}) {
    this.audio.start();
    this._leaveHunt();
    this.monster.setVariant(opts.enemy);
    this.diff = DIFF.normal;
    this.quest = { time: 0, timeLimit: 15 * 60, carts: 0, maxCarts: 1, rewards: [], breaks: [], ended: false, cleared: false, stats: { hits: 0, dmg: 0 }, math: true };
    this.time = 0;
    this.lastHit = null;
    const h = this.hunter;
    h.setWeapon('gs');
    h.reset();
    h.root.visible = true;
    this.items.reset();
    this.mode = 'hunt';
    this.paused = false;
    this.math = new MathBattle(this, opts);
    this.mathOpts = opts;
    this.menus.hide();
    this.overlays.hud.classList.remove('hidden');
    this.overlays.hud.classList.add('math');
    this.hud.last = {};
    this.input.captureKeys = true;
    this.currentHint = '';
    if (this.settings.bgm) this.audio.bgm(mathBattleMusic(this.math.opts));
    this.renderer.domElement.focus();
  }

  pause() {
    if (this.mode !== 'hunt' || this.paused) return;
    this.paused = true;
    this.input.clearAll();
    this.menus.pause();
    this._ignoreUnlock = true;
    this.input.exitLock();
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.menus.hide();
    this.applySettings();
    if (this.settings.mouseCam) this.input.requestLock();
    this.renderer.domElement.focus();
  }
  retire() {
    this.paused = false;
    this.menus.hide();
    if (this.math) { this.math.finish(false, 'リタイアしました'); return; }
    this._endQuest(false, 'リタイアしました');
    this._showResult();
  }

  _onKey(e) {
    if (e.code === 'Escape') {
      if (this.mode === 'hunt') { if (this.paused) this.resume(); else this.pause(); }
    }
    if (this.mode !== 'hunt' || this.paused || this.math) return;
    if (e.code === 'KeyH') this.hud.toggleHelp();
    if (e.code === 'KeyM' || e.code === 'Tab') this.hud.toggleBigMap();
  }

  // ---------- 入力 → 意図 ----------
  _readIntent() {
    const inp = this.input, it = this.intent;
    const k = c => inp.held(c), hit = c => inp.hit(c);
    let fx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), fy = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    const len = Math.min(1, Math.hypot(fx, fy));
    const yaw = this.camRig.yaw;
    let mx = -Math.sin(yaw) * fy + Math.cos(yaw) * fx, mz = -Math.cos(yaw) * fy - Math.sin(yaw) * fx;
    const ml = Math.hypot(mx, mz);
    if (ml > 1e-6) { mx = mx / ml * len; mz = mz / ml * len; }
    it.mx = mx; it.mz = mz; it.moveLen = len;
    it.sprint = k('ShiftLeft') || k('ShiftRight');
    it.dodge = hit('Space');
    it.guard = k('KeyC');
    it.spirit = hit('KeyC');
    it.sheathe = hit('KeyR');
    it.useItem = hit('KeyE');
    it.interact = hit('KeyF');
    it.atkAHeld = inp.down[0] || k('KeyJ');
    // 攻撃ボタン：左右がほぼ同時なら「斬り上げ」
    let mA = inp.mPressed[0], mB = inp.mPressed[2];
    if (this._swallowClick) { mA = false; mB = false; this._swallowClick = false; }
    const aDown = mA || hit('KeyJ'), bDown = mB || hit('KeyK'), abDown = inp.mPressed[1] || hit('KeyL');
    it.atkA = false; it.atkB = false; it.atkAB = false;
    const now = this.inputClock * 1000;
    const WIN = 85;
    if (abDown || (aDown && bDown)) { it.atkAB = true; this.pendA = this.pendB = -1; }
    else {
      if (aDown) { if (this.pendB >= 0) { it.atkAB = true; this.pendB = -1; } else this.pendA = now; }
      if (bDown) { if (this.pendA >= 0 && !aDown) { it.atkAB = true; this.pendA = -1; } else if (!aDown) this.pendB = now; }
    }
    if (this.pendA >= 0 && now - this.pendA > WIN) { it.atkA = true; this.pendA = -1; }
    if (this.pendB >= 0 && now - this.pendB > WIN) { it.atkB = true; this.pendB = -1; }
    // アイテム選択
    if (inp.wheel) this.items.select(inp.wheel > 0 ? 1 : -1);
    if (hit('KeyZ')) this.items.select(-1);
    if (hit('KeyX')) this.items.select(1);
    // 押した瞬間だけの入力を消したもの（同じフレームで2回目以降の更新用）
    const q = this.intentQuiet;
    Object.assign(q, it);
    q.dodge = q.atkA = q.atkB = q.atkAB = q.sheathe = q.useItem = q.interact = q.spirit = false;
  }

  // ---------- 狩猟の進行 ----------
  findInteract(h) {
    const hx = h.pos.x, hz = h.pos.z;
    if (Math.hypot(hx - CAMP.boxX, hz - CAMP.boxZ) < 2.4) return { type: 'supply', x: CAMP.boxX, z: CAMP.boxZ };
    const m = this.monster;
    if (m && !m.alive && m.state === 'dead' && this.quest && this.quest.carvesBody > 0) {
      const p = m.nearestBodyPoint(hx, hz);
      if (p && p.d < 2.6) return { type: 'carve', what: 'body', x: p.x, z: p.z };
    }
    if (m && m.cutTail && this.quest && this.quest.carvesTail > 0) {
      const t = m.cutTail.position;
      if (Math.hypot(hx - t.x, hz - t.z) < 3.2) return { type: 'carve', what: 'tail', x: t.x, z: t.z };
    }
    return null;
  }
  onInteract(h, target) {
    if (!target) return;
    if (target.type === 'supply') { this.items.takeSupply(); return; }
    const q = this.quest;
    if (target.what === 'body' && q.carvesBody > 0) {
      q.carvesBody--;
      const name = this.rng.weighted(CARVE_BODY);
      q.rewards.push({ name, src: '剥ぎ取り' });
      this.message(`${name} を剥ぎ取った${q.carvesBody ? `（あと${q.carvesBody}回）` : ''}`, 'good');
      this.sfx('carve');
      if (q.cleared && q.carvesBody <= 0 && (q.carvesTail <= 0 || !this.monster.cutTail)) q.clearAt = Math.min(q.clearAt, q.time + 4 - QUEST.carveTime);
    } else if (target.what === 'tail' && q.carvesTail > 0) {
      q.carvesTail--;
      const name = this.rng.weighted(CARVE_TAIL);
      q.rewards.push({ name, src: '尻尾の剥ぎ取り' });
      this.message(`${name} を剥ぎ取った`, 'good');
      this.sfx('carve');
    }
  }
  onSwingEnd() { }
  onHunterHurt(dmg, h) {
    this.sfx('hurt');
    this.camShake(clamp(dmg / 45, 0.15, 0.7));
    this.fx.sparks(this.hunter.pos.clone().setY(this.hunter.pos.y + 1.1), 10, 0xff5040, 5);
  }
  onHunterDown() {
    const q = this.quest;
    if (this.math) { this.sfx('down'); this.math.onHunterDown(); return; }
    if (!q || q.ended) return;
    q.carts++;
    this.sfx('down');
    this.camRig.lockOn = false;
    this.message(q.carts >= q.maxCarts ? '力尽きました…' : `力尽きました…（あと${q.maxCarts - q.carts}回でクエスト失敗）`, 'bad');
    q.downAt = q.time;
  }
  flashAt(pos) {
    this.sfx('flash');
    this.fx.ring(pos, 6, 0xffffff, 0.35, true);
    this.fx.sparks(pos, 30, 0xffffff, 10);
    const d = pos.distanceTo(this.camera.position);
    this.fx.flash(clamp(1.1 - d / 40, 0.25, 0.95));
    if (this.monster) this.monster.flash(pos);
  }

  _endQuest(success, reason) {
    const q = this.quest;
    if (!q || q.ended) return;
    q.ended = true;
    q.success = success;
    q.reason = reason;
    q.endTime = q.time;
  }

  _showResult() {
    const q = this.quest;
    this.mode = 'result';
    this.input.captureKeys = false;
    this._ignoreUnlock = true;
    this.input.exitLock();
    this.overlays.hud.classList.add('hidden');
    const rewards = [...q.rewards];
    if (q.success) {
      const n = 3 + this.rng.int(0, 2);
      for (let i = 0; i < n; i++) rewards.push({ name: this.rng.weighted(QUEST_REWARD), src: '基本報酬' });
      for (const b of q.breaks) rewards.push({ name: b.reward, src: b.name + 'の部位破壊' });
      // アイテムボックスへ
      const box = store.get('hunter.box', {});
      for (const r of rewards) box[r.name] = (box[r.name] || 0) + 1;
      store.set('hunter.box', box);
      const st = store.get('hunter.stats', { clears: 0, best: 0, fails: 0 });
      st.clears++;
      if (!st.best || q.clearTime < st.best) st.best = q.clearTime;
      store.set('hunter.stats', st);
    } else {
      const st = store.get('hunter.stats', { clears: 0, best: 0, fails: 0 });
      st.fails = (st.fails || 0) + 1; store.set('hunter.stats', st);
    }
    this.menus.result({
      success: q.success, reason: q.reason, time: q.success ? q.clearTime : q.time, carts: q.carts,
      money: QUEST.reward, rewards, breaks: q.breaks.map(b => b.name).join('、'),
    });
    if (this.settings.bgm) this.audio.bgm(q.success ? 'victory' : 'defeat');
    this.lastResult = { success: q.success, reason: q.reason, rewards: rewards.map(r => r.name) };
  }

  _questStep(dt) {
    const q = this.quest, h = this.hunter, m = this.monster;
    if (!q) return;
    q.time += dt;
    if (!q.ended && !q.cleared && q.time >= q.timeLimit) {
      this._endQuest(false, '制限時間を過ぎました');
      this.message('時間切れ…クエスト失敗', 'bad');
      this.sfx('fail');
      q.failAt = q.time;
    }
    // 力尽きたあと
    if (h.state === 'dead' && q.downAt !== undefined && q.time - q.downAt > 3.2) {
      q.downAt = undefined;
      if (q.carts >= q.maxCarts) {
        this._endQuest(false, `${q.maxCarts}回力尽きました`);
        this.sfx('fail');
        q.failAt = q.time;
      } else {
        const keepSharp = h.sharp;
        h.reset();
        h.sharp = keepSharp;
        h.root.visible = true;
        h.pos.set(CAMP.spawnX, this.world.terrain.heightAt(CAMP.spawnX, CAMP.spawnZ), CAMP.spawnZ);
        h.facing = CAMP.spawnYaw;
        this.camRig.snapBehind(h);
        this.fx.flash(0.6);
        this.message('ベースキャンプに運ばれた', 'info');
        if (m) m.loseTarget();
      }
    }
    if (q.ended && !q.success && q.failAt && q.time - q.failAt > 3.5) { q.failAt = 0; this._showResult(); return; }
    // 討伐後の剥ぎ取り時間
    if (q.cleared && !q.ended && q.time - q.clearAt >= QUEST.carveTime) {
      this._endQuest(true, `${MONSTER.name}を狩猟した`);
      this._showResult();
    }
    // ヒント
    const tgt = h.state === 'free' || h.state === 'drawn' ? this.findInteract(h) : null;
    this.currentHint = !tgt ? '' : tgt.type === 'supply' ? (this.items.supplyTaken ? '支給品はもう受け取った' : 'F：支給品を受け取る')
      : tgt.what === 'tail' ? 'F：尻尾から剥ぎ取る' : `F：剥ぎ取る（残り${q.carvesBody}回）`;
    if (q.cleared && !q.ended) {
      const left = Math.ceil(QUEST.carveTime - (q.time - q.clearAt));
      this.currentHint = (this.currentHint ? this.currentHint + '　' : '') + `剥ぎ取り時間 残り${left}秒`;
    }
  }

  onMonsterDead() {
    const q = this.quest;
    if (this.math) { this.math.onMonsterDead(); return; }
    if (!q || q.cleared || q.ended) return;
    q.cleared = true;
    q.clearAt = q.time;
    q.clearTime = q.time;
    this.message('目標を達成しました！', 'big');
    this.sfx('fanfare');
    if (this.settings.bgm) this.audio.bgm('victory');
    setTimeout(() => this.mode === 'hunt' && this.message(`剥ぎ取り時間は${QUEST.carveTime}秒。モンスターに近づいて F`, 'info'), 1800);
  }
  onPartBreak(name, reward) {
    if (this.quest) this.quest.breaks.push({ name, reward });
    this.message(`${name}を破壊した！`, 'good');
    this.sfx('break');
  }
  onTailCut() {
    this.message('尻尾を切断した！', 'good');
    this.sfx('break');
  }
  onCombatStart() { if (this.settings.bgm && this.mode === 'hunt' && !this.math) this.audio.bgm('battle1'); }
  onCombatEnd() { if (this.settings.bgm && this.mode === 'hunt' && !this.math) this.audio.bgm('prebattle'); }

  // ---------- 当たり判定 ----------
  _combat() {
    const h = this.hunter, m = this.monster;
    if (!m) return;
    if (h.attackActive && m.alive) {
      const hit = bladeVsHitboxes(h.blade, m.hitboxes, h.W.bladeR);
      if (hit) this._applyHunterHit(hit);
    }
    for (const atk of m.activeAttacks) {
      if (h.lastHitBy.has(atk.id)) continue;
      let touched = false;
      if (atk.kind === 'roar') {
        touched = Math.hypot(h.pos.x - atk.srcX, h.pos.z - atk.srcZ) < atk.radius;
      } else {
        for (const s of atk.shapes) if (shapeHitsHunter(s, h)) { touched = true; break; }
      }
      if (!touched) continue;
      const taken = h.takeHit({
        kind: atk.kind, damage: atk.damage * (this.diff ? this.diff.dmg : 1) * (m.enraged ? 1.25 : 1),
        knock: atk.knock, power: atk.power, srcX: atk.srcX, srcZ: atk.srcZ,
        duration: atk.duration, knockPower: atk.knockPower, guardable: atk.guardable,
      });
      if (taken) { h.lastHitBy.set(atk.id, true); if (atk.onHit) atk.onHit(); }
    }
  }

  _applyHunterHit(hit) {
    const h = this.hunter, m = this.monster, mv = h.move;
    const part = hit.hb.part;
    const zone = m.zoneFor(part);
    const sm = h.sharpMult;
    const charged = mv.id === 'chargeSlash';
    const lv = charged ? h.chargeLevelUsed : 0;
    const bounce = isBounce(zone, sm, charged && lv >= 2);
    const sleepBonus = m.sleeping;
    const dmg = calcDamage(h.W.def.attack, h.curMv, sm, zone, (sleepBonus ? 2 : 1) * (h.spiritFull ? 1.1 : 1));
    const heavy = (charged && lv >= 2 && lv !== 4) || mv.id === 'ls_round' || (mv.hits && h.winIdx === mv.hits.length - 1);
    m.receiveHit({ part, damage: dmg, point: hit.point, bounce, charged: heavy, from: h.pos });
    this.lastHit = { dmg, part, zone, bounce, sleep: sleepBonus };
    const hs = mv.hitstop * (charged ? [1, 1.25, 1.6, 2.2, 1.3][lv] : 1);
    h.onHit({ bounce, hitstop: hs });
    if (this.quest) { this.quest.stats.hits++; this.quest.stats.dmg += dmg; }
    if (bounce) {
      this.fx.bounce(hit.point);
      this.sfx('bounce');
    } else {
      this.fx.hitBurst(hit.point, zone >= 45, heavy);
      this.sfx(heavy ? 'hitHeavy' : 'hit');
      this.fx.number(hit.point, dmg, zone >= 45);
      if (heavy) this.camShake(0.35);
    }
    if (sleepBonus) this.message('眠っているところに大ダメージ！', 'good');
  }

  // ---------- ループ ----------
  frame() {
    const now = performance.now();
    const raw = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.fps = lerp(this.fps, 1 / Math.max(raw, 1e-4), 0.05);
    this.frameTimes.push(raw); if (this.frameTimes.length > 600) this.frameTimes.shift();
    this.tick(raw);
    this.render();
  }

  // 1フレームぶん進める（テストでは描画せずに何度も呼べる）
  tick(raw) {
    this.inputClock = (this.inputClock || 0) + raw;
    const dt = raw * this.timeScale;
    const hunting = this.mode === 'hunt' && !this.paused;
    if (hunting && !this.math) this._readIntent();
    if (hunting) {
      const n = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6));
      const sub = dt / n;
      for (let i = 0; i < n; i++) this._step(sub, i === 0 ? this.intent : this.intentQuiet);
      if (this.math) this.math.camera(raw); else this.camRig.update(raw, this.hunter, this.monster, this.input, true);
      this.world.followShadow(this.hunter.pos.x, this.hunter.pos.z);
    } else if (this.mode === 'title' || this.mode === 'home') {
      this.monster.update(dt);
      const m = this.monster;
      this.camRig.orbit(raw, m.pos.x, m.pos.y, m.pos.z, 19, 7, 0.07);
      this.world.followShadow(m.pos.x, m.pos.z);
    } else if (this.mode === 'result') {
      if (!this.paused) this.monster.update(dt * 0.3);
      this.camRig.orbit(raw * 0.3, this.hunter.pos.x, this.hunter.pos.y, this.hunter.pos.z, 10, 4, 0.1);
    }
    if (!this.paused) this.fx.update(this.mode === 'hunt' ? dt : raw, this.w, this.h);
    this.world.update(raw, this.camera);
    if (this.mode === 'hunt') this.hud.update(raw);
    if (this.math && this.mode === 'hunt') this.math.frame(raw);
    if (this.onFrame) this.onFrame(raw);
    this.input.endFrame();
  }

  _step(dt, it) {
    this.time += dt;
    const math = this.math;
    if (math) it = math.step(dt);      // 数式バトル：ハンターへの指示は台本が出す
    if (this.mode !== 'hunt') return;   // 台本の中でバトルが終わった
    this.hunter.update(dt, it);
    this.monster.update(dt);
    this.scene.updateMatrixWorld();
    if (!math) this._combat();
    if (this.hunter.attackActive || (this.hunter.state === 'attack' && this.hunter.t < this.hunter.move.active[1] + 0.05 && this.hunter.t > this.hunter.move.active[0] - 0.04)) {
      const mv = this.hunter.move;
      this.fx.swordTrail(this.hunter, mv && mv.id === 'chargeSlash' && this.hunter.chargeLevelUsed === 3 ? 0xffa060 : mv && mv.spiritMove ? 0xff7a6a : 0xfff2c8);
    }
    if (!math) { this.items.update(dt); this._questStep(dt); }
    const h = this.hunter;
    this.fx.ambient(this.camera.position, dt);
    if (h.state === 'charge' && h.chargeLv >= 1 && h.chargeLv <= 3 && Math.random() < dt * (10 + h.chargeLv * 10)) this.fx.chargeAura(h.pos, h.chargeLv);
    if (h.inWater && (h.speedNow > 1 || h.state === 'roll')) {
      this.splashT = (this.splashT || 0) - dt;
      if (this.splashT <= 0) { this.splashT = 0.22; this.fx.splash(h.pos.clone().setY(WATER_LEVEL + 0.02)); }
    }
  }
}
