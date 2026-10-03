// 数式バトル（実験）：答えを打つこと＝コマンド。時間は止まらず、敵は予告→攻撃をくり返す
//  ・カードごとに問題が出ていて、答えを打ち終えた瞬間にその行動が出る（選ぶ→解くの二度手間なし）
//  ・立ち位置は3か所（左・中央・右）。中央は頭（弱点）を斬れるが、噛みつきと火球が来る
//  ・弱い攻撃は左右へ動けば避けられる（正負の数）。強い攻撃は「回避」の難しい問題を解く
import * as THREE from 'three';
import { AREAS } from './world.js';
import { CHARGE } from './weapons.js';
import { SHARPNESS_MAX } from './config.js';
import { clamp, dampAngle, Rng, TAU, fmtTime, store } from './util.js';
import { makeProblem, showNum, TOPICS, LEVELS } from './mathproblems.js';
import { BESTIARY } from './bestiary.js';
import { buildBattlefield } from './battlefield.js';

export const TEMPO = {
  // k＝予告の長さの倍率、rest＝攻撃と攻撃の間（秒）
  slow: { label: 'ゆっくり', k: 1.6, rest: 6 },
  normal: { label: 'ふつう', k: 1, rest: 2.1 },
  fast: { label: 'はやい', k: 0.72, rest: 1.5 },
};

// 調整できる項目（拠点の「数式バトル」画面に並ぶ）
export const OPTIONS = {
  input: { label: '答え方', choices: [['choice', '4択をタップ'], ['type', '数字を打つ']] },
  tempo: { label: '敵の速さ（予告と間合い）', choices: [['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', 'はやい']] },
  problem: { label: '問題の難しさ', choices: [['easy', 'やさしい'], ['normal', 'ふつう'], ['hard', 'むずかしい']] },
  slowSec: { label: 'スローの長さ（ゲージ）', choices: [[0, 'なし'], [3, '3秒'], [6, '6秒'], [12, '12秒'], [20, '20秒']] },
  slowRate: { label: 'スローの強さ', choices: [[0.6, '弱い（0.6倍速）'], [0.4, 'ふつう（0.4倍速）'], [0.25, '強い（0.25倍速）']] },
  slowMode: { label: 'スローの出し方', choices: [['key', 'スペースキーで'], ['auto', '危ないとき自動で']] },
  atk: { label: '敵の攻撃力', choices: [[0.4, '弱い'], [1, 'ふつう'], [1.4, '強い']] },
  hp: { label: '敵の体力', choices: [[0.5, '少ない'], [1, 'ふつう'], [1.4, '多い']] },
};
// 難易度：まとめて切り替える組み合わせ
export const PRESETS = {
  easy: { label: 'やさしい', input: 'choice', tempo: 'slow', problem: 'easy', slowSec: 12, slowRate: 0.25, slowMode: 'auto', atk: 0.4, hp: 0.5 },
  normal: { label: 'ふつう', input: 'choice', tempo: 'normal', problem: 'normal', slowSec: 6, slowRate: 0.4, slowMode: 'key', atk: 1, hp: 1 },
  hard: { label: 'むずかしい', input: 'choice', tempo: 'fast', problem: 'hard', slowSec: 3, slowRate: 0.6, slowMode: 'key', atk: 1.4, hp: 1.4 },
};
// 設定をそろえる：難易度（level）を土台に、個別の指定で上書き。選べない値は土台のまま
export function resolveOptions(o = {}) {
  const base = PRESETS[o.level] || PRESETS.normal;
  const out = {};
  for (const [k, def] of Object.entries(OPTIONS)) {
    const hit = def.choices.find(c => String(c[0]) === String(o[k]));
    out[k] = hit ? hit[0] : base[k];
  }
  const same = id => Object.keys(OPTIONS).every(k => PRESETS[id][k] === out[k]);
  out.level = ['easy', 'normal', 'hard'].find(same) || 'custom';
  out.enemy = o.enemy === 'sektra' || o.enemy === 'veira' || BESTIARY[o.enemy] ? o.enemy : 'zarva';
  if (o.seed) out.seed = o.seed;
  return out;
}
export const levelLabel = id => (PRESETS[id] ? PRESETS[id].label : 'カスタム');
const MATH_HP = 2600;
const LANE_NAME = ['左', '中央', '右'];

// コマンド（カード）。並びは画面の左から
const CARDS = [
  { id: 'left', mark: '左', name: '左へ動く', note: '答えは負の数' },
  { id: 'atk', mark: '斬', name: '斬る', note: '' },
  { id: 'big', mark: '溜', name: '溜め斬り', note: '大ダメージ' },
  { id: 'dodge', mark: '避', name: '回避', note: 'その場で避ける' },
  { id: 'heal', mark: '癒', name: '回復', note: '' },
  { id: 'right', mark: '右', name: '右へ動く', note: '答えは正の数' },
];

// 敵の攻撃。tele＝予告の長さ（秒・ふつう）、hitAt＝動き始めてから当たるまで、level＝回避の問題の難しさ
const ENEMY = {
  bite: { name: '噛みつき', level: 1, tele: 5.5, hitAt: 0.8, damage: 22, knock: 'flinch', power: 28 },
  stomp: { name: '踏みつけ', level: 1, tele: 5.5, hitAt: 0.66, damage: 18, knock: 'flinch', power: 30 },
  fireball: { name: '火球', level: 2, tele: 6.5, hitAt: 1.12, damage: 30, knock: 'knockdown', power: 40, knockPower: 7 },
  tailSpin: { name: '尻尾回転', level: 3, tele: 8, hitAt: 1.05, damage: 32, knock: 'knockdown', power: 45, knockPower: 8, all: true },
  crystalPillars: { name: '熔晶柱・左右', level: 2, tele: 6.8, hitAt: 1.05, damage: 28, knock: 'knockdown', power: 43, knockPower: 7 },
  crystalRupture: { name: '裂晶波・中央→左右', level: 3, tele: 7.8, hitAt: 1.08, damage: 33, knock: 'knockdown', power: 48, knockPower: 8 },
  skyDive: { name: '蒼翼急降下', level: 2, tele: 6.8, hitAt: 1.08, damage: 31, knock: 'knockdown', power: 46, knockPower: 8 },
  galeSweep: { name: '翼刃の薙ぎ払い', level: 2, tele: 7.2, hitAt: 1.10, damage: 27, knock: 'flinch', power: 38 },
  meteorBreath: { name: '大技・蒼天落雷', level: 3, tele: 10.2, hitAt: 1.48, damage: 48, knock: 'knockdown', power: 62, knockPower: 11, all: true },
};
for (const [id, beast] of Object.entries(BESTIARY)) beast.moves.forEach((move, i) => {
  ENEMY[`${id}_${i}`] = { ...move, knock: i === 0 ? 'flinch' : 'knockdown', power: 35 + i * 10,
    knockPower: i ? 7 + i : undefined, beast: id };
});

const _v = new THREE.Vector3();

// 地面に沿った輪（内側の半径 r0 を 0 にすると円盤）
function groundRing(T, cx, cz, r0, r1, mat, seg = 40) {
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * TAU, c = Math.cos(a), s = Math.sin(a);
    for (const r of [r0, r1]) { const x = cx + c * r, z = cz + s * r; pos.push(x, T.heightAt(x, z) + 0.08, z); }
  }
  for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 5; m.frustumCulled = false;
  return m;
}

export class MathBattle {
  constructor(game, opts = {}) {
    this.game = game;
    opts = this.opts = resolveOptions(opts);
    this.tempo = TEMPO[opts.tempo];
    this.level = LEVELS[opts.problem];
    this.choice = opts.input !== 'type';   // 4択をタップ（既定）／数字を打つ
    this.rng = new Rng(opts.seed || game.rng.int(1, 1e6));
    this.t = 0;                // ゲーム内の時間（スロー中はゆっくり進む）
    this.rt = 0;               // 実際の時間
    // スロー（集中）：ゲージのぶんだけ世界がゆっくりになる。正解すると少し戻る
    this.focusMax = opts.slowSec; this.focus = opts.slowSec;
    this.slow = false; this.slowManual = false; this.slowUsed = 0;
    this.lane = 1;
    this.buf = '';
    this.lockT = 0;
    this.combo = 0;
    this.counter = false;      // 回避に成功した直後は次の一撃が強い
    this.armed = false;        // 回避の問題を解いてある（当たる瞬間に自動で避ける）
    this.potions = 3;
    this.queue = [];           // 実行待ちの攻撃
    this.swing = null;         // いま振っている攻撃（当たる瞬間に結果を出す）
    this.wantRoll = false;
    this.chargeHold = 0;
    this.over = false; this.endAt = 0;
    this.enemy = { phase: 'intro', t: 0, dur: 1, count: 0, atk: null, last: '' };
    this.stats = { correct: 0, miss: 0, timeSum: 0, maxCombo: 0, hitsTaken: 0, dodges: 0, sidesteps: 0, stopped: 0, damage: 0, topics: {}, missed: [] };
    this.it = game._blankIntent();
    this.blank = game._blankIntent();
    this._placeActors();
    this._buildMarkers();
    this._buildUI();
    for (const c of CARDS) if (c.id !== 'dodge') this._newProblem(c.id);
    this._onKey = e => this._key(e);
    window.addEventListener('keydown', this._onKey, true);
    game.message('数式バトル 開始！', 'big');
  }

  // ---------- 配置 ----------
  _placeActors() {
    const g = this.game, m = g.monster, h = g.hunter, T = g.world.terrain;
    const beast = BESTIARY[m.variant];
    const ar = beast || AREAS[2];
    const yaw = 2.5;
    const A = { x: ar.x + (beast ? 0 : 3), z: ar.z + (beast ? 0 : 2), yaw, fx: Math.sin(yaw), fz: Math.cos(yaw), lx: Math.cos(yaw), lz: -Math.sin(yaw) };
    A.y = T.heightAt(A.x, A.z);
    this.A = A;
    m.resetForHunt({ hp: 1, dmg: 1, speed: 1 });
    m.maxHp = m.hp = Math.round(MATH_HP * this.opts.hp);
    // 頭は怯みにくく（攻めるだけで完封できないように）、脚は転ばせやすく
    m.scripted = true; m.flinchScale = { head: 1.5, legL: 0.6, legR: 0.6 }; m.anchor = A;
    m.pos.set(A.x, T.heightAt(A.x, A.z), A.z);
    m.facing = yaw; m.visF = undefined;
    m.area = beast?.area ?? 2;
    m.inCombat = true;
    m._placeFeet();
    m.startAction('hold');
    m.snapPose = true;
    m.update(0);
    // 3つの立ち位置（モンスターから見た座標：x＝左が正、z＝前）
    const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    const head = m.hb.head.wb;
    const headFwd = (head.x - A.x) * fx + (head.z - A.z) * fz;
    const spot = (x, z) => ({ x: A.x + lx * x + fx * z, z: A.z + lz * x + fz * z });
    // 画面の左＝モンスターの右脚側
    const flying = m.variant === 'veira' || beast?.flying;
    this.spots = beast ? [spot(-beast.spacing, beast.front), spot(0, headFwd + beast.front), spot(beast.spacing, beast.front)]
      : flying ? [spot(-4.2, 1.7), spot(0, headFwd + 3.1), spot(4.2, 1.7)]
      : [spot(-3.1, 0.9), spot(0, headFwd + 2.0), spot(3.1, 0.9)];
    this.parts = beast || flying ? ['wingR', 'head', 'wingL'] : ['legR', 'head', 'legL'];
    if (beast) this.battlefield = buildBattlefield(g, beast, A, this.spots);
    m.aim = this.spots[1];
    m.startAction('roar');
    // ハンター
    const s = this.spots[1];
    h.pos.set(s.x, T.heightAt(s.x, s.z), s.z);
    h.facing = yaw + Math.PI;
    h.drawn = true; h.moveMul = 1.9;
    h.setState('drawn', 0);
    h.snapPose = true;
    h._updatePose(0);
    g.camRig.lockOn = false;
    // behind＝ハンター（中央）からカメラまでの水平距離。向きは、下のカードの高さに合わせて camera() が決める
    this.cam = beast ? { back: headFwd + beast.front + (flying ? 13.5 : 10.5), behind: flying ? 13.5 : 10.5,
      up: flying ? 11.2 : 9.2, lookF: headFwd - 0.5, lookY: flying ? 2.6 : 0.5, follow: 0.25 }
      : flying
      ? { back: headFwd + 3.1 + 12.5, behind: 12.5, up: 10.8, lookF: headFwd - 0.5, lookY: 2.6, follow: 0.28 }
      : { back: headFwd + 2.0 + 9.0, behind: 9.0, up: 8.6, lookF: headFwd - 0.6, lookY: 0, follow: 0.3 };
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.camReady = false;
    this.camera(0);
  }

  _buildMarkers() {
    const g = this.game, T = g.world.terrain;
    this.markers = new THREE.Group();
    this.rings = []; this.zones = [];
    for (const s of this.spots) {
      const ring = groundRing(T, s.x, s.z, 1.15, 1.32, new THREE.MeshBasicMaterial({ color: 0xa8e0ff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
      const zone = groundRing(T, s.x, s.z, 0, 2.1, new THREE.MeshBasicMaterial({ color: 0xff2a18, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
      zone.visible = false;
      this.markers.add(ring, zone);
      this.rings.push(ring); this.zones.push(zone);
    }
    g.scene.add(this.markers);
  }

  // ---------- 画面 ----------
  _buildUI() {
    const root = document.createElement('div');
    root.id = 'math';
    root.className = this.choice ? 'choice' : 'type';
    root.innerHTML = `
      <div class="mb-warn hidden"><div class="mb-warn-row"><span class="mb-warn-name"></span><span class="mb-warn-where"></span><span class="mb-warn-sec"></span></div><div class="mb-warn-bar"><i></i></div><div class="mb-warn-tip"></div></div>
      <div class="mb-veil"><span>スロー中</span></div>
      <div class="mb-side"><div class="mb-combo"></div><div class="mb-lane"></div>
        <div class="mb-control-row"><div class="mb-focus"><button class="mb-focus-btn">集中<small>スロー／スペース</small></button><div class="mb-focus-bar"><i></i></div><span class="mb-focus-sec"></span></div><button type="button" class="mb-pause" aria-label="一時停止">一時停止</button></div>
      </div>
      <div class="mb-bottom">
        <div class="mb-mobile-actions" role="group" aria-label="行動を選ぶ">${CARDS.map(c => `<button type="button" data-action="${c.id}" aria-label="${c.name}" aria-pressed="${c.id === 'atk'}"><span>${c.mark}</span>${c.name}</button>`).join('')}</div>
        <div class="mb-cards">${CARDS.map(c => `
          <div class="mb-card" data-id="${c.id}">
            <div class="mb-head"><span class="mb-mark">${c.mark}</span><span class="mb-name">${c.name}</span></div>
            <div class="mb-note">${c.note}</div>
            <div class="mb-q"></div>
            <div class="mb-choices"></div>
          </div>`).join('')}
        </div>
        <div class="mb-input">
          <span class="mb-ans">答え <b></b></span>
          <span class="mb-pad">${['-', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'back'].map(k => `<button data-k="${k}">${k === '-' ? '−' : k === 'back' ? '消す' : k}</button>`).join('')}</span>
          <span class="mb-tip">${this.choice ? '正しい答えをタップすると、その行動がすぐ出る' : '答えを打つと、その行動がすぐ出る（数字と「−」のキー）'}${this.focusMax > 0 ? '／スペースでスロー' : ''}</span>
        </div>
      </div>`;
    const menu = this.game.overlays.menu;
    menu.parentElement.insertBefore(root, menu);
    this.root = root;
    const $ = s => root.querySelector(s);
    this.el = {
      warn: $('.mb-warn'), warnName: $('.mb-warn-name'), warnWhere: $('.mb-warn-where'), warnSec: $('.mb-warn-sec'), warnBar: $('.mb-warn-bar i'), warnTip: $('.mb-warn-tip'),
      combo: $('.mb-combo'), lane: $('.mb-lane'), ans: $('.mb-ans b'), input: $('.mb-input'),
      focus: $('.mb-focus'), focusBar: $('.mb-focus-bar i'), focusSec: $('.mb-focus-sec'),
    };
    this.el.focus.classList.toggle('hidden', this.focusMax <= 0);
    $('.mb-focus-btn').addEventListener('click', () => { this.game.audio.start(); this.toggleSlow(); });
    $('.mb-pause').addEventListener('click', () => this.game.pause());
    this.cards = {};
    this.mobileAction = 'atk';
    for (const c of CARDS) {
      const el = root.querySelector(`.mb-card[data-id="${c.id}"]`);
      el.classList.toggle('mobile-active', c.id === this.mobileAction);
      this.cards[c.id] = { id: c.id, def: c, el, q: el.querySelector('.mb-q'), ch: el.querySelector('.mb-choices'), note: el.querySelector('.mb-note'), name: el.querySelector('.mb-name'), noteText: c.note, prob: null, shownAt: 0 };
    }
    root.querySelector('.mb-mobile-actions').addEventListener('click', e => {
      const btn = e.target.closest('button[data-action]');
      if (btn) this.selectMobileAction(btn.dataset.action);
    });
    root.querySelectorAll('.mb-pad button').forEach(b => b.addEventListener('click', () => { this.game.audio.start(); this.type(b.dataset.k); }));
    // 4択：押した瞬間（指を離す前）に答えになる
    root.querySelector('.mb-cards').addEventListener('pointerdown', e => {
      const btn = e.target.closest('button[data-v]');
      if (!btn || !this.choice) return;
      e.preventDefault();
      this.game.audio.start();
      this.choose(btn.closest('.mb-card').dataset.id, btn.dataset.v);
    });
    this.last = {};
  }
  selectMobileAction(id) {
    if (!this.cards[id] || this.mobileAction === id) return;
    this.mobileAction = id;
    for (const c of Object.values(this.cards)) c.el.classList.toggle('mobile-active', c.id === id);
    this.root.querySelectorAll('.mb-mobile-actions button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.action === id)));
    this._fitProblem(this.cards[id]);
    this.game.sfx('select');
  }
  _set(key, val, fn) { if (this.last[key] !== val) { this.last[key] = val; fn(val); } }

  // 1コマごとの表示の更新
  frame(raw = 0) {
    const g = this.game, h = g.hunter, E = this.enemy;
    this._set('paused', g.paused, v => this.root.classList.toggle('paused', v));
    this._time(raw);
    this._set('slow', this.slow, v => this.root.classList.toggle('slow', v));
    if (this.focusMax > 0) {
      this.el.focusBar.style.width = (clamp(this.focus / this.focusMax, 0, 1) * 100).toFixed(1) + '%';
      this._set('focusSec', Math.ceil(this.focus * 10), v => { this.el.focusSec.textContent = (v / 10).toFixed(1) + '秒'; });
      this._set('focusEmpty', this.focus <= 0.05, v => this.el.focus.classList.toggle('empty', v));
    }
    for (const c of Object.values(this.cards)) {
      const on = this._enabled(c);
      this._set('on:' + c.id, on, v => c.el.classList.toggle('off', !v));
      this._set('show:' + c.id, !!c.prob, v => c.el.classList.toggle('none', !v));
      const action = this.root.querySelector(`.mb-mobile-actions button[data-action="${c.id}"]`);
      if (action) {
        action.disabled = !on;
        action.classList.toggle('ready', c.id === 'dodge' && on);
      }
      // 打ちかけの答えに合うカードを光らせる
      const hot = on && !this.choice && this.buf && c.prob.ans.startsWith(this.buf);
      this._set('hot:' + c.id, !!hot, v => c.el.classList.toggle('hot', v));
    }
    this._set('note:atk', this.lane + ':' + g.monster.variant, () => { this.cards.atk.note.textContent = this.lane === 1 ? '頭をねらう（弱点）' : BESTIARY[g.monster.variant] ? `${BESTIARY[g.monster.variant].sidePart}をねらう（部位破壊）` : g.monster.variant === 'veira' ? '翼をねらう（部位破壊）' : '脚をねらう（転ばせる）'; });
    this._set('note:heal', this.potions, v => { this.cards.heal.name.textContent = `回復 ×${v}`; });
    this._set('queue', this.queue.length + (this.swing ? 1 : 0), () => { /* 予約数は見た目に出さない */ });
    this._set('buf', this.buf + '|' + (this.lockT > 0), () => {
      this.el.ans.textContent = this.lockT > 0 ? 'ミス！' : showNum(this.buf);
      this.el.input.classList.toggle('miss', this.lockT > 0);
    });
    const mult = this._mult();
    this._set('combo', this.combo + ':' + this.counter, () => {
      this.el.combo.innerHTML = this.combo >= 2 ? `<b>${this.combo}</b> 連続正解　<span>攻撃 ×${mult.toFixed(2)}</span>` : this.counter ? '<span>見切り！ 次の一撃 ×1.5</span>' : '';
    });
    this._set('lane', this.lane, v => { this.el.lane.innerHTML = LANE_NAME.map((n, i) => `<i class="${i === v ? 'on' : ''}">${n}</i>`).join(''); });
    // 予告
    const warn = (E.phase === 'tele' || E.phase === 'strike' || E.phase === 'follow') && E.atk;
    this._set('warn', !!warn, v => this.el.warn.classList.toggle('hidden', !v));
    if (warn) {
      const danger = E.atk.lanes.includes(this.lane) && !this.armed;
      this._set('warnName', E.atk.def.name, v => { this.el.warnName.textContent = '⚠ ' + v; });
      this._set('warnWhere', E.atk.lanes.join(''), () => {
        const lanes = E.atk.lanes;
        this.el.warnWhere.textContent = lanes.length === 3 ? 'すべての場所'
          : lanes.length === 2 ? lanes.includes(1) ? (lanes.includes(0) ? '左・中央（右が安全）' : '中央・右（左が安全）') : '左右（中央が安全）'
            : LANE_NAME[lanes[0]] + ' に来る';
      });
      this._set('warnSec', Math.ceil(Math.max(0, E.t) * 10), v => { this.el.warnSec.textContent = (v / 10).toFixed(1) + ' 秒'; });
      this.el.warnBar.style.width = (clamp(E.t / E.dur, 0, 1) * 100).toFixed(1) + '%';
      this._set('warnSafe', danger, v => this.el.warn.classList.toggle('safe', !v));
      this._set('warnTip', (this.armed ? 'a' : danger ? 'd' : 's') + E.atk.lanes.length, () => {
        this.el.warnTip.textContent = this.armed ? '回避の準備ができた（当たる瞬間に避ける）'
          : !danger ? 'ここは安全。攻めるチャンス'
            : E.atk.lanes.length === 3 ? '逃げ場なし →「回避」の問題を解く' : '「左へ／右へ」で逃げるか、「回避」を解く';
      });
    }
    // 足もとの印
    const pulse = 0.3 + Math.abs(Math.sin(this.t * (E.t < 1.5 ? 9 : 4.5))) * 0.3;
    for (let i = 0; i < 3; i++) {
      this.rings[i].material.opacity = i === this.lane ? 0.75 : 0.28;
      const z = this.zones[i];
      z.visible = !!warn && E.atk.lanes.includes(i);
      if (z.visible) z.material.opacity = pulse;
    }
  }

  // 見わたすカメラ：敵の正面・少し上から、3つの立ち位置がいつも見える
  camera(dt) {
    const g = this.game, cam = g.camera, cr = g.camRig, h = g.hunter, A = this.A, c = this.cam;
    // 下のカードにハンターが隠れないよう、足もとが「カードの少し上」に来る角度にする
    if (!(this.camTick = ((this.camTick || 0) + 1) % 20) || this.uiFrac === undefined) {
      const bottom = this.root && this.root.querySelector('.mb-bottom');
      if (bottom && innerHeight && bottom.offsetHeight) this.uiFrac = bottom.offsetHeight / innerHeight;
      const yf = clamp(1 - (this.uiFrac ?? 0.3) - 0.05, 0.55, 0.74);
      const half = Math.tan(cam.fov * Math.PI / 360);
      const pitch = Math.atan2(c.up, c.behind) - Math.atan((yf - 0.5) * 2 * half);
      c.lookF = c.back - c.up / Math.tan(clamp(pitch, 0.35, 0.9));
    }
    const hx = (h.pos.x - A.x) * A.lx + (h.pos.z - A.z) * A.lz;         // ハンターの左右の位置
    const lift = (g.monster.variant === 'veira' || BESTIARY[g.monster.variant]?.flying) ? Math.max(0, g.monster.air - 1.9) : 0;
    const back = c.back + lift * 0.8;
    const px = A.x + A.fx * back + A.lx * hx * c.follow, pz = A.z + A.fz * back + A.lz * hx * c.follow;
    const tx = A.x + A.fx * c.lookF + A.lx * hx * c.follow * 1.3, tz = A.z + A.fz * c.lookF + A.lz * hx * c.follow * 1.3;
    const k = this.camReady ? 1 - Math.exp(-3.2 * dt) : 1;
    this.camReady = true;
    this.camPos.x += (px - this.camPos.x) * k; this.camPos.z += (pz - this.camPos.z) * k; this.camPos.y = A.y + c.up + lift * 0.25;
    this.camLook.x += (tx - this.camLook.x) * k; this.camLook.z += (tz - this.camLook.z) * k; this.camLook.y = A.y + c.lookY + lift * 1.2;
    cam.position.copy(this.camPos);
    cr.time += dt;
    if (cr.trauma > 0) {
      const a = cr.trauma * cr.trauma * 0.3, t = cr.time * 38;
      cam.position.x += Math.sin(t * 1.1) * a; cam.position.y += Math.sin(t * 1.7 + 1) * a * 0.8; cam.position.z += Math.sin(t * 1.3 + 2) * a;
      cr.trauma = Math.max(0, cr.trauma - dt * 1.6);
    }
    cam.lookAt(this.camLook);
  }

  // 実時間で進むもの：ミスの硬直・スローのゲージ。世界の速さもここで決める
  _time(raw) {
    const g = this.game, E = this.enemy, o = this.opts;
    if (g.paused || this.over) return;
    this.rt += raw;
    const locked = this.lockT > 0;
    this.lockT = Math.max(0, this.lockT - raw);
    // ミスの硬直が明けたら、まちがえたカードは新しい問題に替える
    if (locked && this.lockT <= 0) for (const c of Object.values(this.cards)) if (c.redo) { c.redo = false; if (c.prob) this._newProblem(c.id, c.prob.kind); }
    const live = !this.endAt && g.hunter.state !== 'dead';
    // 自動：予告された場所にいて、当たるまで3秒を切ったら
    if (o.slowMode === 'auto' && !this.slowManual) {
      const danger = (E.phase === 'tele' || E.phase === 'strike' || E.phase === 'follow') && E.atk && E.atk.lanes.includes(this.lane) && !this.armed;
      const want = live && danger && E.t < 3 && this.focus > 0.05;
      if (want && !this.slow) g.sfx('charge1');
      this.slow = want;
    }
    if (this.slow) {
      this.focus -= raw; this.slowUsed += raw;
      if (this.focus <= 0 || !live) { this.focus = Math.max(0, this.focus); this.slow = false; this.slowManual = false; }
    } else this.focus = Math.min(this.focusMax, this.focus + raw * this.focusMax / 60);   // 使っていない間は、60秒で満タンまで戻る
    g.timeScale = (g.forcedTimeScale || 1) * (this.slow ? o.slowRate : 1);
  }
  // スペースキー・ボタン：スローの入り切り
  toggleSlow(on) {
    const g = this.game;
    if (this.over || this.endAt || g.paused || g.mode !== 'hunt' || this.focusMax <= 0) return false;
    if (on === undefined) on = !this.slow;
    if (on && this.focus <= 0.05) { g.sfx('select'); return false; }
    this.slow = on; this.slowManual = on;
    g.sfx(on ? 'charge1' : 'select');
    return on;
  }

  _mult() { return (1 + Math.min(this.combo, 10) * 0.05) * (this.counter ? 1.5 : 1); }

  _enabled(c) {
    const h = this.game.hunter, E = this.enemy;
    if (!c.prob || this.over || this.endAt || h.state === 'dead') return false;
    if (c.id === 'left') return this.lane > 0;
    if (c.id === 'right') return this.lane < 2;
    if (c.id === 'heal') return this.potions > 0 && h.hp < h.maxHp - 1;
    if (c.id === 'dodge') return (E.phase === 'tele' || E.phase === 'strike' || E.phase === 'follow') && !this.armed;
    return this.queue.length < 2;
  }

  _newProblem(id, kind = id) {
    const c = this.cards[id];
    const taken = Object.values(this.cards).filter(o => o !== c && o.prob).map(o => o.prob.ans);
    c.prob = makeProblem(kind, this.rng, taken, this.level);
    c.shownAt = this.rt;
    c.q.textContent = c.prob.text;
    c.redo = false; c.el.classList.remove('ng');
    if (this.choice) c.ch.innerHTML = c.prob.choices.map(v => `<button data-v="${v}">${showNum(v)}</button>`).join('');
    // 「x = 3 のとき」などの前置きがあれば、説明の行に出す
    if (c.id !== 'atk') c.note.textContent = c.prob.pre ? (c.id === 'dodge' ? `${c.noteText}　${c.prob.pre}` : c.prob.pre) : c.noteText;
    c.note.classList.toggle('pre', !!c.prob.pre);
    // 長い式は、はみ出さない大きさまで文字を小さくする
    this._fitProblem(c);
    c.el.classList.remove('pop'); void c.el.offsetWidth; c.el.classList.add('pop');
  }
  _fitProblem(c) {
    c.q.style.fontSize = '';
    if (!c.q.clientWidth) return;
    for (let fs = parseFloat(getComputedStyle(c.q).fontSize); c.q.scrollWidth > c.q.clientWidth + 1 && fs > 11; fs -= 1) c.q.style.fontSize = fs + 'px';
  }

  // ---------- 入力 ----------
  _key(e) {
    const g = this.game;
    if (g.math !== this || g.mode !== 'hunt' || g.paused || e.metaKey || e.ctrlKey || e.altKey) return;
    const c = e.code;
    let ch = null;
    if (c === 'Space') { e.preventDefault(); if (!e.repeat) this.toggleSlow(); return; }
    if (/^(Digit|Numpad)\d$/.test(c)) ch = c.slice(-1);
    else if (c === 'Minus' || c === 'NumpadSubtract') ch = '-';
    else if (c === 'Backspace' || c === 'Delete') ch = 'back';
    else if (/^\d$/.test(e.key)) ch = e.key;
    else if (e.key === '-' || e.key === '−' || e.key === 'ー') ch = '-';
    if (ch === null) return;
    e.preventDefault();
    this.type(ch);
  }

  // 4択：カード id の選択肢 v を選ぶ。正解ならその行動が出る。不正解はミス（正解を見せてから問題を替える）
  choose(id, v) {
    const g = this.game, c = this.cards[id];
    if (this.over || this.endAt || g.paused || g.mode !== 'hunt' || this.lockT > 0 || g.hunter.state === 'dead') return false;
    if (!c || !this._enabled(c)) return false;
    if (Number(v) === c.prob.answer) { this._correct(c); return true; }
    this._miss(c, Number(v));
    return false;
  }

  // 1文字打つ。答えがどれかのカードと一致した瞬間に、その行動が出る
  type(ch) {
    const g = this.game;
    if (this.choice) return;
    if (this.over || this.endAt || g.paused || g.mode !== 'hunt' || this.lockT > 0 || g.hunter.state === 'dead') return;
    if (ch === 'back') { this.buf = this.buf.slice(0, -1); return; }
    this.buf += ch;
    const live = Object.values(this.cards).filter(c => this._enabled(c));
    const hit = live.find(c => c.prob.ans === this.buf);
    if (hit) { this._correct(hit); return; }
    if (!live.some(c => c.prob.ans.startsWith(this.buf))) this._miss();
    else g.sfx('select');
  }

  _correct(c) {
    const g = this.game, h = g.hunter, st = this.stats;
    // 考えた時間：前の入力（正解・ミス）か、問題が出た時の、遅いほうから数える
    const took = this.rt - Math.max(c.shownAt, this.lastT || 0);
    this.lastT = this.rt;
    this.focus = Math.min(this.focusMax, this.focus + this.focusMax * 0.08);   // 正解でスローのゲージが少し戻る
    st.correct++; st.timeSum += took;
    const tp = st.topics[c.prob.topic] || (st.topics[c.prob.topic] = { n: 0, time: 0, miss: 0 });
    tp.n++; tp.time += took;
    this.combo++; st.maxCombo = Math.max(st.maxCombo, this.combo);
    this.buf = '';
    g.sfx('ui');
    c.el.classList.remove('ok'); void c.el.offsetWidth; c.el.classList.add('ok');
    switch (c.id) {
      case 'left': case 'right':
        this.lane += c.id === 'left' ? -1 : 1;
        this.wantRoll = true;
        break;
      case 'atk': case 'big':
        this.queue.push(c.id);
        break;
      case 'dodge':
        this.armed = true;
        g.message('回避の準備ができた', 'good');
        break;
      case 'heal':
        this.potions--;
        h.heal(40);
        g.sfx('heal');
        g.fx.ring(_v.copy(h.pos).setY(h.pos.y + 0.1).clone(), 1.6, 0x7dffa0, 0.5, false);
        g.fx.floatText(_v.copy(h.pos).setY(h.pos.y + 1.9), '+40', 'status', 1.1);
        break;
    }
    if (c.id === 'dodge') { c.prob = null; } else this._newProblem(c.id);
  }

  _miss(c, chosen) {
    const g = this.game, h = g.hunter;
    this.stats.miss++;
    this.lastT = this.rt;
    this.combo = 0;
    this.buf = '';
    this.lockT = 0.7;
    if (c) {
      // どの問題をまちがえたかを残し、正解を見せる
      const p = c.prob;
      this.stats.missed.push({ text: (p.pre && p.pre !== 'x は？' ? p.pre + '　' : '') + p.text, answer: p.answer, chosen, topic: p.topic, isX: p.pre === 'x は？' });
      const tp = this.stats.topics[p.topic] || (this.stats.topics[p.topic] = { n: 0, time: 0, miss: 0 });
      tp.miss = (tp.miss || 0) + 1;
      c.redo = true;
      c.el.classList.add('ng');
      c.ch.querySelectorAll('button').forEach(b => { const v = Number(b.dataset.v); b.classList.toggle('right', v === p.answer); b.classList.toggle('wrong', v === chosen); });
      this.lockT = 1.0;
    }
    g.sfx('bounce');
    if (h.state === 'drawn') h.setState('stagger', 0.08);
  }

  // ---------- 進行（ゲームの1ステップごと。ハンターへの指示を返す） ----------
  step(dt) {
    const g = this.game, h = g.hunter, m = g.monster, it = this.it;
    Object.assign(it, this.blank);
    this.t += dt;
    if (g.quest) g.quest.time += dt;
    if (this.over) return it;
    if (this.endAt) {
      if (this.t >= this.endAt) this.finish(this.endWin, this.endWin ? `${m.name}を倒した` : '力尽きました');
      else if (this.endWin && h.state === 'drawn' && this.t > this.endAt - 2.2) h.setState('victory', 0.2);
      return it;
    }
    h.sharp = SHARPNESS_MAX;
    if (m.alive) this._enemy(dt);
    if (h.state === 'dead') return it;
    if (h.state === 'free') { h.drawn = true; h.setState('drawn', 0.2); }

    const s = this.spots[this.lane];
    const dx = s.x - h.pos.x, dz = s.z - h.pos.z, d = Math.hypot(dx, dz);
    // 立ち位置を変える：まず前転で一気に寄る
    if (this.wantRoll && ['drawn', 'attack', 'charge', 'draw'].includes(h.state)) {
      this.wantRoll = false;
      if (d > 1.6) {
        if (this.swing && !this.swing.done) this.swing = null;
        this.chargeHold = 0;
        h.startRoll({ mx: dx / d, mz: dz / d, moveLen: 1 });
      }
    }
    // 溜め斬り：しばらく溜めてから放す
    if (h.state === 'charge') { this.chargeHold -= dt; it.atkAHeld = this.chargeHold > 0; }
    if (h.state === 'drawn') {
      const tp = this._targetPoint();
      const yaw = Math.atan2(tp.x - h.pos.x, tp.z - h.pos.z);
      if (d > 2.6) { it.mx = dx / d; it.mz = dz / d; it.moveLen = 1; }
      else {
        h.facing = dampAngle(h.facing, yaw, 9, dt);
        if (d > 0.3) { it.mx = dx / d; it.mz = dz / d; it.moveLen = Math.min(1, d * 1.2); it.strafe = true; }
        // 実行待ちの攻撃
        if (this.queue.length && d < 1.3) {
          const id = this.queue.shift();
          const mult = this._mult();
          this.counter = false;
          if (id === 'atk') {
            h.facing = yaw;
            h.startAttack(h.W.moves.vslash);
            this.swing = { move: 'vslash', at: h.move.active[0] + 0.05, mult, done: false };
          } else {
            h.facing = yaw;
            h.chargeT = CHARGE.times[2] - 0.32; h.chargeLv = 2;
            h.setState('charge', 0.12);
            this.chargeHold = 0.62;
            this.swing = { move: 'chargeSlash', at: 0.09, mult, done: false };
          }
        }
      }
    }
    // 攻撃が当たる瞬間：解けていれば必ず当たる
    const sw = this.swing;
    if (sw) {
      if (h.state === 'attack' && h.move.id === sw.move) {
        if (!sw.done && h.t >= sw.at) { sw.done = true; this._strike(sw.mult); }
      } else if (h.state !== 'charge' && h.state !== 'attack') this.swing = null;
      if (sw.done && h.state !== 'attack') this.swing = null;
    }
    return it;
  }

  // ねらう場所（中央＝頭、左右＝脚）
  _targetBox() {
    const m = this.game.monster, part = this.parts[this.lane];
    if (part === 'head') return m.hb.head;
    const boxes = m.hitboxes.filter(b => b.part === part);
    return boxes[1] || boxes[0];
  }
  _targetPoint() {
    const hb = this._targetBox();
    return _v.copy(hb.wa).lerp(hb.wb, 0.5);
  }

  _strike(mult) {
    const g = this.game, h = g.hunter, m = g.monster;
    if (!m.alive) return;
    const hb = this._targetBox();
    const mid = hb.wa.clone().lerp(hb.wb, 0.5);
    const dir = new THREE.Vector3(h.pos.x - mid.x, 0, h.pos.z - mid.z).normalize();
    const point = mid.addScaledVector(dir, hb.r * 0.8);
    h.curMv *= mult;
    const before = m.hp;
    g._applyHunterHit({ hb, point });
    this.stats.damage += before - Math.max(0, m.hp);
  }

  // ---------- 敵の台本 ----------
  _enemy(dt) {
    const g = this.game, m = g.monster, h = g.hunter, E = this.enemy;
    const k = this.tempo.k * (m.enraged ? 0.85 : 1);
    switch (E.phase) {
      case 'intro':
        if (m.state === 'hold') { E.phase = 'rest'; E.t = this.tempo.rest * 0.75; }
        break;
      case 'rest':
        if (m.state !== 'hold') break;
        if (m.pendingEnrage) { m.pendingEnrage = false; m._enrage(); break; }
        E.t -= dt;
        if (E.t <= 0 && h.state !== 'dead') this._telegraph(k);
        break;
      case 'tele':
        if (m.state !== 'hold') { this._stopped(); break; }
        E.t -= dt;
        m.windup = clamp(1 - (E.t - E.lead) / Math.max(0.1, E.dur - E.lead), 0, 1);
        if (E.t <= E.lead) {
          m.windup = 0; m.windKind = null; m.windStyle = null;
          m.startAction(E.atk.action || E.atk.id, E.atk.opts);
          E.phase = 'strike';
        }
        break;
      case 'strike':
        if (m.state !== (E.atk.action || E.atk.id)) { this._stopped(); break; }
        E.t -= dt;
        if (this.armed && !E.rolled && E.t <= 0.22 && !['knock', 'dead', 'flinch', 'stun'].includes(h.state)) {
          // 当たる瞬間に、横へ前転して避ける（左右の立ち位置では外側へ）
          E.rolled = true;
          const sgn = this.lane === 0 ? -1 : this.lane === 2 ? 1 : (E.count % 2 ? 1 : -1);
          if (this.swing && !this.swing.done) this.swing = null;
          h.startRoll({ mx: this.A.lx * sgn, mz: this.A.lz * sgn, moveLen: 1 });
        }
        if (E.t <= 0) this._resolve();
        break;
      case 'follow':
        if (m.state !== (E.atk.action || E.atk.id)) { this._stopped(); break; }
        E.t -= dt;
        if (this.armed && !E.rolled && E.t <= 0.22 && !['knock', 'dead', 'flinch', 'stun'].includes(h.state)) {
          E.rolled = true;
          const sgn = this.lane === 0 ? -1 : this.lane === 2 ? 1 : (E.count % 2 ? 1 : -1);
          if (this.swing && !this.swing.done) this.swing = null;
          h.startRoll({ mx: this.A.lx * sgn, mz: this.A.lz * sgn, moveLen: 1 });
        }
        if (E.t <= 0) this._resolve();
        break;
      case 'after':
        if (m.state === 'hold') { E.phase = 'rest'; E.t = this.tempo.rest * (m.enraged ? 0.62 : 1); }
        break;
    }
  }

  _telegraph(k) {
    const g = this.game, m = g.monster, E = this.enemy, lane = this.lane;
    E.count++;
    let id;
    const beast = BESTIARY[m.variant];
    if (beast) {
      const slot = E.count === 1 ? 0 : E.count === 2 ? 1 : E.count === 4 ? 2
        : this.rng.weighted([[0, E.last === `${m.variant}_0` ? 0.7 : 3], [1, E.last === `${m.variant}_1` ? 0.7 : 3],
          [2, m.wingBroken.L && m.wingBroken.R ? 0 : E.last === `${m.variant}_2` ? 0.35 : 1.7]]);
      id = `${m.variant}_${slot}`;
      if (slot === 2 && m.wingBroken.L && m.wingBroken.R) id = `${m.variant}_1`;
    }
    else if (m.variant === 'sektra' && E.count === 2) id = 'crystalPillars';
    else if (m.variant === 'sektra' && E.count === 4) id = 'crystalRupture';
    else if (m.variant === 'veira' && E.count === 1) id = 'skyDive';
    else if (m.variant === 'veira' && E.count === 2) id = 'galeSweep';
    else if (m.variant === 'veira' && E.count === 4 && !(m.wingBroken.L && m.wingBroken.R)) id = 'meteorBreath';
    else if (E.count <= 1) id = lane === 1 ? 'bite' : 'stomp';
    else {
      const strong = (m.enraged ? 3.2 : 1.8) * (E.last === 'tailSpin' ? 0.3 : 1);
      if (m.variant === 'sektra') id = this.rng.weighted([
        ['bite', lane === 1 ? 2 : 0], ['stomp', lane === 1 ? 0 : 2],
        ['crystalPillars', E.last === 'crystalPillars' ? 0.5 : 3],
        ['crystalRupture', E.last === 'crystalRupture' ? 0.5 : 2.3],
      ]);
      else if (m.variant === 'veira') id = this.rng.weighted([
        ['skyDive', m.wingBroken.L || m.wingBroken.R ? 0 : E.last === 'skyDive' ? 0.8 : 3.0],
        ['galeSweep', E.last === 'galeSweep' ? 1.2 : 3.4],
        ['meteorBreath', m.wingBroken.L && m.wingBroken.R ? 0 : E.last === 'meteorBreath' ? 0.3 : (m.enraged ? 2.3 : 1.2)],
      ]);
      else id = lane === 1
        ? this.rng.weighted([['bite', 4], ['fireball', E.last === 'fireball' ? 1 : 2.6], ['tailSpin', strong]])
        : this.rng.weighted([['stomp', 4.5], ['tailSpin', strong * 1.2]]);
    }
    const def = ENEMY[id];
    const beastLanes = def.beast ? def.pattern === 'all' ? [0,1,2]
      : def.pattern === 'center' ? [1]
      : def.pattern === 'sides' ? [0,2]
        : def.pattern === 'adjacent' ? (lane === 0 ? [0,1] : lane === 2 ? [1,2] : this.rng.chance(0.5) ? [0,1] : [1,2])
          : [lane] : null;
    const sweepLanes = id === 'galeSweep' ? (lane === 0 ? [0, 1] : lane === 2 ? [1, 2] : this.rng.chance(0.5) ? [0, 1] : [1, 2]) : null;
    const lanes = beastLanes || (def.all ? [0, 1, 2] : id === 'crystalPillars' ? [0, 2] : id === 'crystalRupture' ? [1] : id === 'galeSweep' ? sweepLanes : [lane]);
    const opts = id === 'stomp' ? { side: lane === 0 ? 'liftR' : 'liftL' }
      : id === 'skyDive' ? { lane }
        : id === 'galeSweep' ? { lanes, dir: lanes.includes(0) ? 1 : -1 }
          : def.beast ? { style: def.motion, hitAt: def.hitAt, followAt: def.follow ? def.hitAt + 2.25 : null,
            lanes, dir: lanes.includes(0) ? 1 : -1, dur: def.follow ? 5.35 : 3.25 } : {};
    E.last = id;
    E.atk = { id, def, lanes, opts, action: def.beast ? 'beastMove' : null };
    E.dur = def.tele * k; E.t = E.dur;
    E.lead = def.hitAt / (m.speedMul || 1);
    E.phase = 'tele'; E.rolled = false;
    this.armed = false;
    m.windup = 0; m.windKind = id; m.windStyle = def.beast ? def.motion : null; m.windSide = lane === 0 ? 1 : -1;
    this.cards.dodge.noteText = ['', 'やさしめ', 'やや難', '難問'][def.level];
    this._newProblem('dodge', 'dodge' + def.level);
    g.sfx('growl');
  }

  // 怯み・転倒で、敵の攻撃が止まった
  _stopped() {
    const g = this.game, m = g.monster, E = this.enemy;
    m.windup = 0; m.windKind = null; m.windStyle = null;
    this.cards.dodge.prob = null;
    this.armed = false;
    E.atk = null; E.phase = 'after';
    this.stats.stopped++;
    if (m.alive) g.message('敵の攻撃を止めた！', 'good');
  }

  _resolve() {
    const g = this.game, m = g.monster, h = g.hunter, E = this.enemy, a = E.atk, def = a.def;
    const inLane = a.lanes.includes(this.lane);
    if (a.id === 'crystalPillars' || a.id === 'crystalRupture' || def.beast) {
      const magic = ['breath','wave','pulse','storm','phase'].includes(def.motion);
      const heavy = ['quake','slam','root','charge','burrow'].includes(def.motion);
      for (const lane of a.lanes) {
        const spot = this.spots[lane], y = g.world.terrain.heightAt(spot.x, spot.z);
        const at = new THREE.Vector3(spot.x, y + 0.1, spot.z);
        const color = BESTIARY[def.beast]?.color || 0xff8b38;
        if (magic) g.fx.ring(at, a.id.endsWith('_2') ? 4.0 : 3.0, color, 0.65, true);
        if (heavy || !magic) g.fx.bigDust(at, a.id === 'crystalRupture' || def.beast && a.id.endsWith('_2') ? 3.2 : 2.5);
        g.fx.sparks(at, magic ? 32 : 24, color, magic ? 8 : 6);
      }
      g.camShake(a.id === 'crystalRupture' || def.beast && a.id.endsWith('_2') ? 0.5 : 0.3);
      g.sfx(magic ? 'fire' : heavy ? 'stomp' : 'roar');
    }
    if (this.armed) {
      this.armed = false;
      this.stats.dodges++;
      this.counter = true;
      g.message('見切った！ 次の一撃が強くなる', 'good');
      g.fx.floatText(_v.copy(h.pos).setY(h.pos.y + 2), '回避！', 'status', 1.0);
    } else if (inLane) {
      const taken = h.takeHit({
        kind: 'hit', damage: def.damage * this.opts.atk * (m.enraged ? 1.25 : 1), knock: def.knock, power: def.power, knockPower: def.knockPower,
        srcX: m.pos.x, srcZ: m.pos.z, guardable: false,
      });
      if (taken) { this.stats.hitsTaken++; this.combo = 0; this.counter = false; this.queue.length = 0; }
    } else {
      this.stats.sidesteps++;
    }
    this.cards.dodge.prob = null;
    if (def.beast && def.follow && !a.second && m.alive && m.state === a.action) {
      a.second = true;
      a.lanes = def.follow === 'center' ? [1] : def.follow === 'sides' ? [0,2]
        : def.follow === 'adjacent' ? (this.lane === 0 ? [0,1] : this.lane === 2 ? [1,2] : a.lanes.includes(0) ? [0,1] : [1,2])
          : [0,1,2].filter(i => !a.lanes.includes(i));
      a.def = { ...def, name: `${def.name}・追撃`, damage: Math.round(def.damage * 0.7), level: Math.max(1, def.level - 1), follow: null };
      E.phase = 'follow'; E.t = E.dur = 2.25; E.rolled = false;
      this.armed = false;
      this.cards.dodge.noteText = ['', 'やさしめ', 'やや難', '難問'][a.def.level];
      this._newProblem('dodge', 'dodge' + a.def.level);
      g.message(`追撃は${a.lanes.map(i => LANE_NAME[i]).join('・')}！`, 'warn');
      return;
    }
    if (a.id === 'crystalRupture' && !a.second && m.alive && m.state === a.id) {
      a.second = true;
      a.lanes = [0, 2];
      a.def = { ...def, name: '裂晶波・左右', level: 2, damage: 25 };
      E.phase = 'follow'; E.t = E.dur = 2.45; E.rolled = false;
      this.armed = false;
      this.cards.dodge.noteText = 'やや難';
      this._newProblem('dodge', 'dodge2');
      g.message('次は左右に裂晶波！中央へ！', 'warn');
      return;
    }
    E.atk = null; E.phase = 'after';
  }

  // ---------- 終わり ----------
  onMonsterDead() {
    const g = this.game;
    if (this.endAt) return;
    this.endAt = this.t + 3.6; this.endWin = true;
    this.queue.length = 0;
    this.clearTime = this.rt;
    g.message('討伐成功！', 'big');
    g.sfx('fanfare');
    g.audio.bgm(null);
  }
  onHunterDown() {
    if (this.endAt) return;
    this.endAt = this.t + 3.0; this.endWin = false;
    this.game.message('力尽きました…', 'bad');
  }

  finish(win, reason) {
    if (this.over) return;
    this.over = true;
    const g = this.game, st = this.stats;
    const total = st.correct + st.miss;
    const topics = Object.entries(st.topics).map(([k, v]) => ({ name: TOPICS[k] || k, n: v.n, miss: v.miss || 0, avg: v.n ? v.time / v.n : 0 }));
    this.result = {
      win, reason, opts: this.opts, level: levelLabel(this.opts.level), time: win ? this.clearTime : this.rt, slowUsed: this.slowUsed,
      setup: [['対戦相手', g.monster.name], ...(BESTIARY[this.opts.enemy] ? [['フィールド', BESTIARY[this.opts.enemy].field]] : []), ...Object.entries(OPTIONS).map(([k, d]) => [d.label, d.choices.find(c => c[0] === this.opts[k])[1]])],
      correct: st.correct, miss: st.miss, rate: total ? Math.round(st.correct / total * 100) : 0,
      avg: st.correct ? st.timeSum / st.correct : 0, maxCombo: st.maxCombo,
      hitsTaken: st.hitsTaken, dodges: st.dodges, sidesteps: st.sidesteps, stopped: st.stopped,
      missed: st.missed.slice(), damage: Math.round(st.damage), monsterLeft: Math.round(Math.max(0, g.monster.hp) / g.monster.maxHp * 100), topics,
    };
    this.root.classList.add('hidden');
    this.markers.visible = false;
    this.slow = false; g.timeScale = g.forcedTimeScale || 1;
    g.mode = 'result';
    g.input.captureKeys = false;
    g.overlays.hud.classList.add('hidden');
    g.audio.bgm(null);
    if (!win) g.sfx('fail');
    g.lastMath = this.result;
    // 記録を残す（この端末のブラウザに、直近60回ぶん）
    if (!g.noRecord) {
      const d = new Date(), r = this.result;
      const log = store.get('hunter.mathlog', []);
      log.push({ date: `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, win, enemy: this.opts.enemy, level: this.opts.level, levelLabel: r.level, time: Math.round(r.time), correct: r.correct, miss: r.miss, rate: r.rate, avg: +r.avg.toFixed(1), maxCombo: r.maxCombo, topics: r.topics.map(t => ({ name: t.name, n: t.n, miss: t.miss })) });
      store.set('hunter.mathlog', log.slice(-60));
    }
    g.menus.mathResult(this.result);
  }

  dispose() {
    const g = this.game, m = g.monster, h = g.hunter;
    window.removeEventListener('keydown', this._onKey, true);
    this.root.remove();
    g.scene.remove(this.markers);
    this.markers.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    if (this.battlefield) this.battlefield.dispose();
    m.scripted = false; m.aim = null; m.anchor = null; m.flinchScale = null; m.windup = 0; m.windKind = null; m.windStyle = null;
    h.moveMul = 1;
    g.timeScale = g.forcedTimeScale || 1;
    g.camRig.snapBehind(h);
  }

  // テスト用：いまの状態
  get state() {
    const E = this.enemy;
    return {
      t: +this.t.toFixed(2), rt: +this.rt.toFixed(2), slow: this.slow, focus: +this.focus.toFixed(2), opts: this.opts, lane: this.lane, combo: this.combo, armed: this.armed, potions: this.potions, buf: this.buf,
      enemy: { phase: E.phase, t: +E.t.toFixed(2), atk: E.atk ? E.atk.id : null, lanes: E.atk ? E.atk.lanes : null },
      cards: Object.fromEntries(Object.values(this.cards).map(c => [c.id, c.prob ? { text: c.prob.text, ans: c.prob.ans, choices: c.prob.choices, on: this._enabled(c) } : null])),
      stats: { ...this.stats, topics: undefined }, over: this.over, time: fmtTime(this.t),
    };
  }
}
