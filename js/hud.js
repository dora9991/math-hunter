// 狩猟中の画面表示（体力・スタミナ・切れ味・時計・ミニマップ・アイテム・メッセージ）
import { SHARPNESS, SHARPNESS_MAX, HUNTER } from './config.js';
import { ITEMS } from './items.js';
import { WORLD_SIZE, worldToMap, CAMP, AREAS } from './world.js';
import { fmtTime, clamp } from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);

export class HUD {
  constructor(root, game) {
    this.game = game;
    this.root = root;
    root.innerHTML = `
      <div class="hud-tl">
        <div class="clock"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="clock-bg"/><path class="clock-arc" d=""/><circle cx="22" cy="22" r="19" class="clock-rim"/></svg><span class="clock-text">20</span></div>
        <div class="bars">
          <div class="bar hp"><div class="red"></div><div class="fill"></div></div>
          <div class="bar st"><div class="fill"></div></div>
          <div class="sharp"><div class="sharp-segs"></div><div class="sharp-ptr"></div></div>
          <div class="bar spirit hidden"><div class="fill"></div><span>気刃</span></div>
        </div>
      </div>
      <div class="carts"></div>
      <div class="hud-tr"><canvas class="minimap" width="170" height="170"></canvas><div class="area-name"></div></div>
      <div class="hud-br">
        <div class="item-side item-prev"></div>
        <div class="item-cur"><div class="item-mark"></div><div class="item-info"><div class="item-name"></div><div class="item-count"></div></div></div>
        <div class="item-side item-next"></div>
      </div>
      <div class="hud-msgs"></div>
      <div class="hud-hint"></div>
      <div class="hud-help">H：操作ヘルプ　M：地図　Esc：メニュー</div>
      <div class="help-card hidden"></div>
      <div class="mon-bar hidden"><div class="mon-name"></div><div class="mon-track"><div class="mon-fill"></div></div></div>
      <div class="lock-ind hidden">ターゲット中（T）</div>
      <div class="charge-ind hidden"></div>
      <div class="bigmap hidden"><canvas width="460" height="460"></canvas><div class="bigmap-note">M で閉じる</div></div>
      <div class="lock-tip hidden">クリックするとマウスでカメラを回せます（矢印キーでも回せます）</div>
    `;
    this.el = {
      clockArc: $('.clock-arc', root), clockText: $('.clock-text', root),
      hpFill: $('.bar.hp .fill', root), hpRed: $('.bar.hp .red', root), hpBar: $('.bar.hp', root),
      stFill: $('.bar.st .fill', root), stBar: $('.bar.st', root),
      sharpSegs: $('.sharp-segs', root), sharpPtr: $('.sharp-ptr', root),
      spirit: $('.bar.spirit', root), spiritFill: $('.bar.spirit .fill', root),
      carts: $('.carts', root), mini: $('.minimap', root), areaName: $('.area-name', root),
      prev: $('.item-prev', root), next: $('.item-next', root), mark: $('.item-mark', root), name: $('.item-name', root), count: $('.item-count', root),
      msgs: $('.hud-msgs', root), hint: $('.hud-hint', root), help: $('.help-card', root),
      monBar: $('.mon-bar', root), monName: $('.mon-name', root), monFill: $('.mon-fill', root),
      lock: $('.lock-ind', root), charge: $('.charge-ind', root),
      big: $('.bigmap', root), bigCanvas: $('.bigmap canvas', root), lockTip: $('.lock-tip', root),
    };
    // 切れ味の色帯
    for (const s of SHARPNESS) {
      const d = document.createElement('div');
      d.style.flex = String(s.len);
      d.style.background = s.color;
      this.el.sharpSegs.appendChild(d);
    }
    this.el.help.innerHTML = HELP_HTML;
    this.mapImg = null;
    this.last = {};
  }

  setMap(img) { this.mapImg = img; }

  message(text, kind = 'info') {
    const d = document.createElement('div');
    d.className = 'msg ' + kind;
    d.textContent = text;
    this.el.msgs.appendChild(d);
    while (this.el.msgs.children.length > 4) this.el.msgs.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 3200);
    setTimeout(() => d.remove(), 3800);
  }
  clearMessages() { this.el.msgs.innerHTML = ''; }
  toggleHelp(force) { this.el.help.classList.toggle('hidden', force === undefined ? !this.el.help.classList.contains('hidden') : !force); }
  toggleBigMap(force) {
    const show = force === undefined ? this.el.big.classList.contains('hidden') : force;
    this.el.big.classList.toggle('hidden', !show);
    this.bigOpen = show;
  }

  _set(key, val, fn) { if (this.last[key] !== val) { this.last[key] = val; fn(val); } }

  update(dt) {
    const g = this.game, h = g.hunter, q = g.quest;
    if (!h) return;
    // 時計
    const remain = q ? Math.max(0, q.timeLimit - q.time) : 0;
    const frac = q ? remain / q.timeLimit : 1;
    this._set('clock', Math.ceil(remain / 60), v => { this.el.clockText.textContent = String(v); });
    this._set('clockArc', Math.round(frac * 200), () => {
      const a = frac * Math.PI * 2, x = 22 + Math.sin(a) * 17, y = 22 - Math.cos(a) * 17;
      this.el.clockArc.setAttribute('d', frac >= 0.999 ? 'M22,5 A17,17 0 1,1 21.99,5 Z' : `M22,22 L22,5 A17,17 0 ${a > Math.PI ? 1 : 0},1 ${x.toFixed(2)},${y.toFixed(2)} Z`);
    });
    // 体力・スタミナ
    this._set('hp', Math.round(h.hp * 10), () => { this.el.hpFill.style.width = (h.hp / h.maxHp * 100).toFixed(1) + '%'; });
    this._set('red', Math.round((h.hp + h.red) * 10), () => { this.el.hpRed.style.width = (clamp(h.hp + h.red, 0, h.maxHp) / h.maxHp * 100).toFixed(1) + '%'; });
    this._set('st', Math.round(h.stamina * 5), () => { this.el.stFill.style.width = (h.stamina / HUNTER.maxStamina * 100).toFixed(1) + '%'; });
    this._set('stLow', h.exhaustLock || h.stamina < 25, v => this.el.stBar.classList.toggle('low', v));
    this._set('hpLow', h.hp < 30, v => this.el.hpBar.classList.toggle('low', v));
    this._set('sharp', Math.round(h.sharp), () => { this.el.sharpPtr.style.left = (h.sharp / SHARPNESS_MAX * 100).toFixed(1) + '%'; });
    // 気刃ゲージ（太刀のとき）
    this._set('spiritShow', h.W.id === 'ls', v => this.el.spirit.classList.toggle('hidden', !v));
    if (h.W.id === 'ls') {
      this._set('spirit', Math.round(h.spirit), v => { this.el.spiritFill.style.width = v + '%'; });
      this._set('spiritFull', h.spiritFull, v => this.el.spirit.classList.toggle('full', v));
    }
    // 力尽きた回数
    const carts = q ? q.carts : 0, maxC = q ? q.maxCarts : 3;
    this._set('carts', carts, () => {
      this.el.carts.innerHTML = '';
      for (let i = 0; i < maxC; i++) { const s = document.createElement('span'); s.className = i < carts ? 'cart used' : 'cart'; this.el.carts.appendChild(s); }
    });
    // アイテム
    const items = g.items, cur = items.current();
    const pv = ITEMS[(items.sel - 1 + ITEMS.length) % ITEMS.length], nx = ITEMS[(items.sel + 1) % ITEMS.length];
    const key = cur.id + ':' + items.count(cur.id) + ':' + pv.id + ':' + nx.id;
    this._set('item', key, () => {
      this.el.mark.textContent = cur.mark; this.el.mark.style.background = cur.color;
      this.el.name.textContent = cur.name; this.el.count.textContent = '×' + items.count(cur.id);
      this.el.mark.classList.toggle('empty', items.count(cur.id) <= 0);
      this.el.prev.textContent = pv.mark; this.el.prev.style.background = pv.color;
      this.el.next.textContent = nx.mark; this.el.next.style.background = nx.color;
    });
    // ヒント
    const hint = g.currentHint || '';
    this._set('hint', hint, v => { this.el.hint.textContent = v; this.el.hint.classList.toggle('show', !!v); });
    // エリア名
    const area = g.world.terrain.areaAt(h.pos.x, h.pos.z);
    this._set('area', area.name, v => { this.el.areaName.textContent = v; });
    // モンスター体力（設定でON）
    const m = g.monster;
    const showMon = !!(m && (g.settings.monsterHp || g.math) && m.alive !== undefined);
    this._set('monShow', showMon, v => this.el.monBar.classList.toggle('hidden', !v));
    if (showMon) {
      this._set('monName', m.name, v => { this.el.monName.textContent = v; });
      this._set('monHp', Math.round(m.hp), () => { this.el.monFill.style.width = (Math.max(0, m.hp) / m.maxHp * 100).toFixed(1) + '%'; });
    }
    this._set('lock', !!g.camRig.lockOn, v => this.el.lock.classList.toggle('hidden', !v));
    const lockTip = g.mode === 'hunt' && !g.math && !g.input.locked && !g.input.lockFailed && g.settings.mouseCam && !g.paused;
    this._set('lockTip', lockTip, v => this.el.lockTip.classList.toggle('hidden', !v));
    const ch = h.state === 'charge' ? (h.chargeLv === 4 ? '溜めすぎ' : ['', '溜め Lv1', '溜め Lv2', '溜め Lv3'][h.chargeLv]) : '';
    this._set('charge', ch, v => { this.el.charge.textContent = v; this.el.charge.classList.toggle('hidden', !v); this.el.charge.className = 'charge-ind' + (v ? ' lv' + h.chargeLv : ' hidden'); });

    this._drawMini();
    if (this.bigOpen) this._drawBig();
  }

  _icons(ctx, size, scale) {
    const g = this.game, h = g.hunter, m = g.monster;
    // キャンプ
    const [cx, cy] = worldToMap(CAMP.x, CAMP.z, size);
    ctx.fillStyle = '#f0d890'; ctx.fillRect(cx - 4 * scale, cy - 4 * scale, 8 * scale, 8 * scale);
    // モンスター（ペイント中か、近くて見えているとき）
    if (m && m.alive !== undefined && !m.gone) {
      const seen = m.painted || m.visibleToHunter;
      if (seen) {
        const [mx, my] = worldToMap(m.pos.x, m.pos.z, size);
        ctx.save(); ctx.translate(mx, my);
        ctx.fillStyle = m.alive ? (m.enraged ? '#ff4030' : '#ff9a30') : '#888';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 * scale;
        ctx.beginPath(); ctx.arc(0, 0, 6 * scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (m.painted) { ctx.strokeStyle = '#ff60c0'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(0, 0, 9 * scale, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
    }
    // ハンター（矢印）
    const [px, py] = worldToMap(h.pos.x, h.pos.z, size);
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI - h.facing);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a2a40'; ctx.lineWidth = 1.5 * scale;
    ctx.beginPath(); ctx.moveTo(0, -8 * scale); ctx.lineTo(5.5 * scale, 6 * scale); ctx.lineTo(0, 3 * scale); ctx.lineTo(-5.5 * scale, 6 * scale); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // カメラの向き
    const cy2 = g.camRig.yaw;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1 * scale;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.sin(cy2) * 16 * scale, py - Math.cos(cy2) * 16 * scale); ctx.stroke();
  }
  _drawMini() {
    const c = this.el.mini, ctx = c.getContext('2d'), S = c.width;
    ctx.clearRect(0, 0, S, S);
    if (this.mapImg) ctx.drawImage(this.mapImg, 0, 0, S, S);
    this._icons(ctx, S, 0.8);
  }
  _drawBig() {
    const c = this.el.bigCanvas, ctx = c.getContext('2d'), S = c.width;
    ctx.clearRect(0, 0, S, S);
    if (this.mapImg) ctx.drawImage(this.mapImg, 0, 0, S, S);
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    for (const a of AREAS) {
      const [x, y] = worldToMap(a.x, a.z, S);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 52, y + 14, 104, 18);
      ctx.fillStyle = '#f5e6c0'; ctx.fillText(a.name, x, y + 27);
    }
    this._icons(ctx, S, 1.5);
  }
}

export const HELP_HTML = `
  <h3>操作</h3>
  <table>
    <tr><th>移動</th><td>W A S D</td></tr>
    <tr><th>ダッシュ（納刀中）</th><td>Shift</td></tr>
    <tr><th>回避（前転）</th><td>Space</td></tr>
    <tr><th>カメラ</th><td>マウス（画面クリックで固定）／ 矢印キー</td></tr>
    <tr><th>カメラを背後へ</th><td>Q</td></tr>
    <tr><th>ターゲットカメラ</th><td>T</td></tr>
    <tr><th>縦斬り・抜刀攻撃<br><small>長押しで溜め斬り</small></th><td>左クリック ／ J</td></tr>
    <tr><th>なぎ払い</th><td>右クリック ／ K</td></tr>
    <tr><th>斬り上げ</th><td>左右同時・中クリック ／ L</td></tr>
    <tr><th>ガード（大剣）／気刃斬り（太刀）</th><td>C</td></tr>
    <tr><th>抜刀／納刀</th><td>R</td></tr>
    <tr><th>アイテム使用</th><td>E</td></tr>
    <tr><th>アイテム選択</th><td>ホイール ／ Z・X</td></tr>
    <tr><th>剥ぎ取り・支給品</th><td>F</td></tr>
    <tr><th>地図</th><td>M</td></tr>
    <tr><th>メニュー（一時停止）</th><td>Esc</td></tr>
  </table>
  <p class="tip">コツ：攻撃のあとは隙が大きい。モンスターの「予備動作」を見たら Space で回避。<br>尻尾は斬り続けると切れる。頭は溜め斬りでねらおう。</p>
`;
