// テスト・デバッグ用の窓口（window.__hunt）
import { GS } from './weapons.js';
import { conflicts } from './mathproblems.js';

export function installDebug(game) {
  const api = {
    game,
    get state() {
      const h = game.hunter, m = game.monster;
      return {
        mode: game.mode, paused: game.paused, time: +game.time.toFixed(2), fps: Math.round(game.fps),
        hunter: { x: +h.pos.x.toFixed(2), y: +h.pos.y.toFixed(2), z: +h.pos.z.toFixed(2), facing: +h.facing.toFixed(3), state: h.state, t: +h.t.toFixed(2), hp: +h.hp.toFixed(1), red: +h.red.toFixed(1), stamina: +h.stamina.toFixed(1), sharp: h.sharp, drawn: h.drawn, chargeLv: h.chargeLv, invuln: h.invuln },
        cam: { yaw: +game.camRig.yaw.toFixed(3), pitch: +game.camRig.pitch.toFixed(3), lockOn: game.camRig.lockOn, locked: game.input.locked },
        monster: m ? { x: +m.pos.x.toFixed(2), z: +m.pos.z.toFixed(2), hp: Math.round(m.hp), state: m.state, alive: m.alive, enraged: !!m.enraged, tired: !!m.tired, limping: !!m.limping } : null,
        quest: game.quest ? { time: +game.quest.time.toFixed(1), carts: game.quest.carts, cleared: game.quest.cleared, ended: game.quest.ended } : null,
        items: { ...game.items.counts },
      };
    },
    // 入力の注入（実際の入力と同じ経路を通る）
    key(code, ms = 120) {
      game.input.keyDown(code);
      return new Promise(r => setTimeout(() => { game.input.keyUp(code); r(); }, ms));
    },
    down(code) { game.input.keyDown(code); },
    up(code) { game.input.keyUp(code); },
    mouse(button, ms = 60) {
      game.input.mouseDown(button);
      return new Promise(r => setTimeout(() => { game.input.mouseUp(button); r(); }, ms));
    },
    wait: ms => new Promise(r => setTimeout(r, ms)),
    teleport(x, z, facing) {
      const h = game.hunter;
      h.pos.set(x, game.world.terrain.heightAt(x, z), z);
      if (facing !== undefined) h.facing = facing;
      game.camRig.snapBehind(h);
    },
    timeScale(v) { game.timeScale = v; game.forcedTimeScale = v; },
    god(on = true) { game.hunter.god = on; },
    // 攻撃の途中の姿勢で止める（見た目の確認用）
    freezeMove(id, t) {
      const h = game.hunter;
      game.timeScale = 0;
      h.drawn = true;
      h.startAttack(h.W.moves[id] || GS[id]);
      h.t = t; h.blendT = 99;
      h._updatePose(0);
      return h.state;
    },
    freezeState(state, t, extra = {}) {
      const h = game.hunter;
      game.timeScale = 0;
      Object.assign(h, extra);
      h.setState(state, 0);
      h.t = t; h.blendT = 99;
      h._updatePose(0);
      return h.state;
    },
    // 描画の速さに関係なく、ゲームを sec 秒ぶん進める
    advance(sec, dt = 1 / 60) {
      const n = Math.max(1, Math.round(sec / dt));
      for (let i = 0; i < n; i++) game.tick(dt);
      game.render();
      return api.state;
    },
    // キーを押したまま sec 秒進める
    hold(codes, sec, dt = 1 / 60) {
      codes = [].concat(codes);
      for (const c of codes) game.input.keyDown(c);
      api.advance(sec, dt);
      for (const c of codes) game.input.keyUp(c);
      game.tick(dt);
      return api.state;
    },
    tap(code, dt = 1 / 60) { game.input.keyDown(code); game.tick(dt); game.input.keyUp(code); game.tick(dt); return api.state; },
    click(button = 0, dt = 1 / 60) { game.input.mouseDown(button); game.tick(dt); game.input.mouseUp(button); game.tick(dt); return api.state; },
    freezeMonster(on = true) { game.monster.frozen = on; },
    // モンスターの行動の途中で止める（見た目の確認用）
    freezeMonsterAt(name, t, opts = {}) {
      const m = game.monster;
      m.frozen = false;
      m.startAction(name, opts);
      m.act.t = t; m.blendT = 99;
      m.frozen = true;
      game.tick(1 / 60);
      game.render();
      return m.state;
    },
    // カメラを好きな位置に（見た目の確認用）
    view(yawOffset = 0, pitch = 0.25, dist = 7) {
      const h = game.hunter, cr = game.camRig;
      cr.yaw = h.facing + Math.PI + yawOffset; cr.pitch = pitch; cr.dist = dist;
      cr.target.set(h.pos.x, h.pos.y + 1.45, h.pos.z);
      cr.update(0, h, game.monster, game.input, false);
      game.render();
    },
    // モンスターの部位の位置（テスト用）
    partPos(part) {
      const hb = game.monster.hitboxes.find(b => b.part === part && !b.off);
      return hb ? { a: hb.wa.toArray().map(v => +v.toFixed(2)), b: hb.wb.toArray().map(v => +v.toFixed(2)), r: hb.r } : null;
    },
    start() { game.audio.start(); game.startHunt(); },
    // 数式バトル：始める／カードの問題を解く（答えを1文字ずつ打つ）／わざと間違える
    mathStart(opts = {}) { game.startMathBattle(opts); return game.math.state; },
    mathSolve(id) { const b = game.math, c = b.cards[id]; if (!c.prob) return false; if (b.choice) return b.choose(id, c.prob.answer); b.buf = ''; for (const ch of c.prob.ans) b.type(ch); return true; },
    // わざと間違える（4択なら、はずれの選択肢を選ぶ）
    mathMiss(id = 'atk') { const b = game.math, c = b.cards[id]; if (b.choice) return b.choose(id, c.prob.choices.find(v => v !== c.prob.answer)); for (const ch of '99') b.type(ch); return false; },
    mathType(str) { for (const ch of str) game.math.type(ch); return game.math.state; },
    mathSlow(on) { return game.math.toggleSlow(on); },
    get math() { return game.math ? game.math.state : null; },
    // 数式バトルを自動で遊ぶ（think 秒に1問のペースで解く人を想定）。plan: 'smart'（避けて攻める）／'greedy'（攻めるだけ）／'slow'（何もしない）
    mathBot(plan = 'smart', think = 3, maxSec = 600, opts = {}) {
      game.noRecord = true;
      game.startMathBattle(Object.assign({ seed: 11 }, opts));
      const b = game.math;
      let next = think, wrong = opts.wrongEvery || 0, n = 0;
      next = think;
      const log = [];
      for (let t = 0; t < maxSec && game.mode === 'hunt'; t += 1 / 60) {
        game.tick(1 / 60);
        if (plan === 'slow' || b.rt < next || game.mode !== 'hunt') continue;
        const E = b.enemy, danger = (E.phase === 'tele' || E.phase === 'strike' || E.phase === 'follow') && E.atk && E.atk.lanes.includes(b.lane) && !b.armed;
        let id = 'atk';
        if (plan === 'smart') {
          if (danger) id = E.atk.lanes.length === 3 || E.atk.def.level >= 2 ? 'dodge' : (b.lane === 1 ? (n % 2 ? 'left' : 'right') : (b.lane === 0 ? 'right' : 'left'));
          else if (game.hunter.hp < 45 && b.potions > 0) id = 'heal';
          else if (b.lane !== 1 && game.monster.state !== 'topple' && n % 5 === 4) id = b.lane === 0 ? 'right' : 'left';
          else id = n % 4 === 3 ? 'big' : 'atk';
        }
        n++;
        if (wrong && n % wrong === 0) { api.mathMiss(b._enabled(b.cards[id]) ? id : 'atk'); log.push('miss'); }
        else if (b._enabled(b.cards[id])) { api.mathSolve(id); log.push(id); }
        next = b.rt + think * (id === 'big' || id === 'dodge' ? 1.5 : 1);
        if (opts.useSlow) b.toggleSlow(danger && id !== 'atk');
      }
      game.noRecord = false;
      return { result: game.mode === 'result' ? game.lastMath : { win: false, time: maxSec, monsterLeft: Math.round(game.monster.hp / game.monster.maxHp * 100), unfinished: true }, mode: game.mode, hp: Math.round(game.hunter.hp), mon: Math.round(game.monster.hp), log: log.join(' ') };
    },
    home() { game.goHome(); },
  };
  api.autotest = () => autotest(game, api);
  api.mathtest = () => mathtest(game, api);
  window.__hunt = api;
  if (game.params.has('autotest')) setTimeout(() => api.autotest(), 800);
  return api;
}

// ---------------- 自動テスト ----------------
// 描画を待たずにゲームを進めて、主要な機能を順番に確かめる
function autotest(game, api) {
  const results = [];
  const g = game;
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail) }); };
  const run = sec => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) g.tick(1 / 60); };
  const tap = code => { g.input.keyDown(code); g.tick(1 / 60); g.input.keyUp(code); g.tick(1 / 60); };
  const hold = (codes, sec) => { codes = [].concat(codes); codes.forEach(c => g.input.keyDown(c)); run(sec); codes.forEach(c => g.input.keyUp(c)); g.tick(1 / 60); };
  const selectItem = id => { let n = 0; while (g.items.current().id !== id && n++ < 10) g.items.select(1); };
  const t0 = performance.now();
  // テストで記録（素材・狩猟回数）が増えないよう、あとで元に戻す
  const saved = {};
  for (const k of ['hunter.box', 'hunter.stats']) { try { saved[k] = localStorage.getItem(k); } catch { } }
  try {
    api.start();
    const h = g.hunter, m = g.monster;
    api.god(true);
    run(0.5);
    check('狩猟が始まる', g.mode === 'hunt' && h.state === 'free');
    // 移動
    let x0 = h.pos.x, z0 = h.pos.z;
    hold('KeyW', 1.0);
    const moved = Math.hypot(h.pos.x - x0, h.pos.z - z0);
    check('W で前に進む', moved > 3, moved.toFixed(2) + 'm');
    const st0 = h.stamina;
    hold(['KeyW', 'ShiftLeft'], 1.0);
    check('ダッシュでスタミナが減る', h.stamina < st0 - 10, `${st0.toFixed(0)}→${h.stamina.toFixed(0)}`);
    run(2.5);
    check('スタミナが回復する', h.stamina > 95, h.stamina.toFixed(0));
    // 回避
    tap('Space'); run(0.1);
    check('Space で回避（無敵あり）', h.state === 'roll' && h.invuln, `${h.state} invuln=${h.invuln}`);
    run(0.7);
    // 抜刀・納刀
    tap('KeyR'); run(0.6);
    check('R で抜刀', h.drawn && h.state === 'drawn', h.state);
    tap('KeyR'); run(0.9);
    check('R で納刀', !h.drawn && h.state === 'free', h.state);
    // 支給品
    api.teleport(-78.5 + 1.5, 70.5 + 0.5);
    run(0.1);
    tap('KeyF'); run(1.0);
    check('支給品ボックスで受け取れる', g.items.count('mega') === 2 && g.items.count('flash') === 2 && g.items.count('trap') === 1, JSON.stringify(g.items.counts));
    // 回復薬
    h.hp = 50; h.red = 0;
    selectItem('potion');
    const pc = g.items.count('potion');
    tap('KeyE'); run(1.2);
    check('回復薬で回復する', h.hp > 75 && g.items.count('potion') === pc - 1, `hp=${h.hp.toFixed(0)}`);
    run(1.2);
    check('飲んだあとガッツポーズ→元に戻る', h.state === 'free', h.state);
    // 砥石
    h.sharp = 30;
    selectItem('whet');
    tap('KeyE'); run(3.1);
    check('砥石で切れ味が戻る', h.sharp >= 199, h.sharp);
    // モンスターのそばへ
    api.freezeMonster(true);
    const place = (part, dist = 2.4) => {
      const hb = m.hitboxes.find(b => b.part === part && !b.off);
      const px0 = part === 'tail' ? hb.wb.x : hb.wb.x, pz0 = part === 'tail' ? hb.wb.z : hb.wb.z;
      const ang = m.facing + Math.PI / 2;
      const px = px0 + Math.sin(ang) * dist, pz = pz0 + Math.cos(ang) * dist;
      api.teleport(px, pz);
      h.facing = Math.atan2(px0 - px, pz0 - pz);
    };
    place('legL');
    h.setState('free'); h.drawn = false;
    let hp = m.hp;
    tap('KeyJ'); run(1.3);
    check('抜刀斬りがモンスターに当たる', m.hp < hp, `${hp}→${m.hp}`);
    check('モンスターが気づいて戦闘になる', m.inCombat);
    // 溜め斬り
    place('legL'); h.setState('drawn'); h.drawn = true; g.tick(1 / 60);
    hp = m.hp;
    let maxLv = 0;
    g.input.keyDown('KeyJ');
    for (let i = 0; i < 60 * 2.8; i++) { g.tick(1 / 60); maxLv = Math.max(maxLv, h.chargeLv === 4 ? 3 : h.chargeLv); }
    g.input.keyUp('KeyJ'); run(1.2);
    check('溜め斬り Lv3 まで溜まる', maxLv >= 3, 'Lv' + maxLv);
    check('溜め斬りは大ダメージ', hp - m.hp >= 90, hp - m.hp);
    // 尻尾切断（実際に斬る）
    let swings = 0;
    while (!m.tailCut && swings < 30) {
      const tb = m.tailBoxes[1 + (swings % 2)];
      const mid = tb.wa.clone().lerp(tb.wb, 0.5), sa = m.facing + Math.PI / 2;
      api.teleport(mid.x + Math.sin(sa) * 2.2, mid.z + Math.cos(sa) * 2.2);
      h.facing = Math.atan2(mid.x - h.pos.x, mid.z - h.pos.z);
      h.setState('drawn'); h.drawn = true; g.tick(1 / 60);
      tap('KeyJ'); run(1.3);
      swings++;
    }
    check('尻尾を斬り続けると切れる', m.tailCut && !!m.cutTail, `${swings}回`);
    // 部位破壊（頭）
    for (let i = 0; i < 4 && !m.headBroken; i++) m.receiveHit({ part: 'head', damage: 340, point: m.hb.head.wb.clone() });
    check('頭の部位破壊', m.headBroken);
    api.freezeMonster(false);
    // 閃光
    m.hp = Math.max(m.hp, m.maxHp * 0.6);
    const hd = m.hb.head.wb;
    api.teleport(hd.x + Math.sin(m.facing) * 8, hd.z + Math.cos(m.facing) * 8);
    h.facing = Math.atan2(hd.x - h.pos.x, hd.z - h.pos.z);
    h.setState('free'); h.drawn = false;
    selectItem('flash');
    tap('KeyE'); run(1.2);
    check('閃光弾でモンスターの目がくらむ', m.state === 'blinded', m.state);
    // ペイント
    selectItem('paint');
    h.facing = Math.atan2(m.pos.x - h.pos.x, m.pos.z - h.pos.z);
    tap('KeyE'); run(1.5);
    check('ペイント玉が当たる', m.painted);
    // 罠
    m.startAction('idle', { dur: 30 });
    api.freezeMonster(true);
    const foot = m.legs[0].cur;
    api.teleport(foot.x + Math.sin(m.facing) * 1.0, foot.z + Math.cos(m.facing) * 1.0);
    h.facing = Math.atan2(foot.x - h.pos.x, foot.z - h.pos.z);
    selectItem('trap');
    tap('KeyE'); run(1.6);
    api.freezeMonster(false);
    run(0.3);
    check('雷撃罠にかかる', m.state === 'trapped', m.state);
    run(8.5);
    // 怒り
    m.dmgSinceEnrage = m.maxHp;
    m.receiveHit({ part: 'body', damage: 10, point: m.pos.clone() });
    run(0.2);
    for (let i = 0; i < 8 && m.state !== 'roar'; i++) run(1);
    check('怒り状態になる', m.enraged, `state=${m.state}`);
    // 瀕死 → 巣へ逃げて眠る
    m.enrageT = 0.1; run(0.5);
    m.areaChanged = true; m.wantArea = null;
    m.hp = m.maxHp * 0.21;
    m.receiveHit({ part: 'body', damage: m.maxHp * 0.02, point: m.pos.clone() });
    check('足を引きずる', m.limping);
    api.teleport(-60, 40);
    let slept = false;
    for (let i = 0; i < 120 && !slept; i++) { run(1); slept = m.state === 'sleep'; }
    check('巣（エリア4）へ逃げて眠る', slept && m.area === 4, `state=${m.state} area=${m.area}`);
    // 寝ている所を攻撃（胴の横から）
    { const sp = m.hb.spine.wa, sa = m.facing + Math.PI / 2; api.teleport(sp.x + Math.sin(sa) * 3.2, sp.z + Math.cos(sa) * 3.2); h.facing = Math.atan2(sp.x - h.pos.x, sp.z - h.pos.z); }
    h.setState('drawn'); h.drawn = true; g.tick(1 / 60);
    g.lastHit = null;
    tap('KeyJ'); run(1.3);
    const sl = g.lastHit || {};
    check('寝ている所への一撃は2倍', sl.sleep && sl.dmg >= 60, JSON.stringify(sl));
    check('起きて咆哮する', !m.sleeping && (m.state === 'roar' || m.inCombat), m.state);
    // 討伐
    m.hp = 1;
    run(0.3);
    m.receiveHit({ part: 'body', damage: 50, point: m.pos.clone() });
    run(2.0);
    check('討伐できる', m.dead && g.quest.cleared, m.state);
    // 剥ぎ取り
    let carved = 0;
    for (let i = 0; i < 3; i++) {
      const bp = m.nearestBodyPoint(h.pos.x, h.pos.z);
      const hbb = m.hb.spine.wa;
      api.teleport(hbb.x + 2.6, hbb.z);
      run(0.1);
      const before = g.quest.rewards.length;
      tap('KeyF'); run(1.5);
      if (g.quest.rewards.length > before) carved++;
    }
    check('剥ぎ取り3回', carved === 3, carved);
    const tp = m.cutTail ? m.cutTail.position : h.pos;
    api.teleport(tp.x + 1.5, tp.z);
    run(0.1); tap('KeyF'); run(1.5);
    check('切った尻尾から剥ぎ取れる', g.quest.rewards.some(r => r.src.includes('尻尾')), g.quest.rewards.map(r => r.name).join(','));
    for (let i = 0; i < 70 && g.mode !== 'result'; i++) run(1);
    check('リザルト画面（クリア）', g.mode === 'result' && g.lastResult && g.lastResult.success, g.mode);
    // 太刀
    const prevW = g.settings.weapon;
    g.settings.weapon = 'ls';
    api.start(); run(0.5); api.god(true);
    api.freezeMonster(true);
    check('太刀を装備して出発できる', h.W.id === 'ls' && h.sword.name === 'longsword');
    place('legL'); h.setState('free'); h.drawn = false;
    hp = m.hp;
    tap('KeyJ'); run(1.0);
    check('太刀：踏み込み斬りが当たる', m.hp < hp, `${hp}→${m.hp}`);
    const seenMoves = new Set(); let hits = 0, lastHp = m.hp;
    const watch = sec => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { g.tick(1 / 60); if (h.move) seenMoves.add(h.move.id); if (m.hp < lastHp) { hits++; lastHp = m.hp; } } };
    place('legL'); h.setState('drawn'); h.drawn = true; g.tick(1 / 60);
    const sp0 = h.spirit;
    tap('KeyJ'); watch(0.5); tap('KeyJ'); watch(0.45); tap('KeyJ'); watch(1.0);
    check('太刀：縦斬り→突き→斬り上げ', ['ls_vslash', 'ls_thrust', 'ls_rising'].every(k => seenMoves.has(k)), [...seenMoves].join(','));
    check('太刀：当てると気刃ゲージがたまる', h.spirit > sp0, `${sp0}→${h.spirit.toFixed(0)}`);
    h.spirit = 100;
    place('legL'); h.setState('drawn'); h.drawn = true; g.tick(1 / 60);
    seenMoves.clear(); hits = 0; lastHp = m.hp;
    tap('KeyC'); watch(0.55); tap('KeyC'); watch(0.55); tap('KeyC'); watch(0.95); tap('KeyC'); watch(1.6);
    check('太刀：気刃斬りI→II→III→大回転斬り', ['ls_spirit1', 'ls_spirit2', 'ls_spirit3', 'ls_round'].every(k => seenMoves.has(k)), [...seenMoves].join(','));
    check('太刀：気刃斬りIIIは複数回当たる', hits >= 4, `ヒット${hits}回`);
    check('太刀：気刃ゲージを使う', h.spirit < 60, h.spirit.toFixed(0));
    h.spirit = 0;
    run(0.8);
    tap('KeyC'); run(0.1);
    check('太刀：ゲージが無いと気刃斬りは出ない', h.move && h.move.id === 'ls_vslash', h.move && h.move.id);
    run(1.2);
    tap('KeyL'); run(0.15);
    const fx0 = h.pos.clone(); run(0.5);
    check('太刀：斬り下がりで後ろへ下がる', h.move && h.move.id === 'ls_fade' || fx0.distanceTo(h.pos) > 0.5, h.move && h.move.id);
    api.freezeMonster(false);
    g.settings.weapon = prevW;
    // 失敗ルート：3回力尽きる
    api.start();
    run(0.5);
    api.god(false);
    for (let k = 0; k < 3; k++) {
      h.hp = 5;
      h.takeHit({ kind: 'hit', damage: 50, knock: 'knockdown', power: 30, srcX: h.pos.x + 1, srcZ: h.pos.z });
      run(4.0);
    }
    check('3回力尽きると失敗', g.quest.carts === 3 && g.quest.ended && !g.quest.success, `carts=${g.quest.carts}`);
    for (let i = 0; i < 6 && g.mode !== 'result'; i++) run(1);
    check('リザルト画面（失敗）', g.mode === 'result' && g.lastResult && !g.lastResult.success, g.mode);
  } catch (e) {
    check('例外なし', false, e.stack || e.message);
  }
  for (const [k, v] of Object.entries(saved)) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { } }
  const pass = results.filter(r => r.ok).length;
  const summary = `自動テスト ${pass}/${results.length} 成功（${((performance.now() - t0) / 1000).toFixed(1)}秒）`;
  console.log(summary);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}`);
  const box = document.createElement('div');
  box.className = 'autotest';
  box.innerHTML = `<b>${summary}</b><br>` + results.map(r => `<div class="${r.ok ? 'ok' : 'ng'}">${r.ok ? '✔' : '✘'} ${r.name} <small>${r.detail.slice(0, 80)}</small></div>`).join('');
  document.body.appendChild(box);
  window.__autotest = { pass, total: results.length, results };
  return { pass, total: results.length, results };
}

// ---------------- 数式バトルの自動テスト ----------------
function mathtest(game, api) {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: String(detail) });
  const run = sec => { for (let i = 0; i < Math.round(sec * 60); i++) game.tick(1 / 60); };
  const until = (fn, max = 30) => { for (let i = 0; i < max * 60 && !fn(); i++) game.tick(1 / 60); return fn(); };
  const savedLog = localStorage.getItem('hunter.mathlog');
  try {
    localStorage.removeItem('hunter.mathlog');
    const st0 = api.mathStart({ tempo: 'normal', seed: 21 });
    const b = game.math, h = game.hunter, m = game.monster;
    check('開始：狩猟モードで、敵は台本どおりに動く', game.mode === 'hunt' && m.scripted && b.lane === 1, game.mode);
    const answers = () => Object.values(b.cards).filter(c => c.prob).map(c => c.prob.ans);
    const clash = () => { const a = answers(); return a.some((x, i) => a.some((y, j) => i !== j && conflicts(x, y))); };
    check('5枚のカードに問題が出ている', answers().length === 5, answers().join(','));
    check('答えどうしがぶつからない', !clash(), answers().join(','));
    check('左へ＝負の数、右へ＝正の数', b.cards.left.prob.answer < 0 && b.cards.right.prob.answer > 0, `${b.cards.left.prob.ans} / ${b.cards.right.prob.ans}`);
    // 4択：カードごとに答えが4つ。押した瞬間に行動が出る
    run(3.2);
    const btns = id => [...b.cards[id].ch.querySelectorAll('button')];
    const tap = (id, v) => btns(id).find(x => Number(x.dataset.v) === v).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    check('各カードに答えが4つ（正解は1つ）', ['left', 'atk', 'big', 'heal', 'right'].every(id => btns(id).length === 4 && btns(id).filter(x => Number(x.dataset.v) === b.cards[id].prob.answer).length === 1), btns('atk').map(x => x.dataset.v).join(','));
    check('4択では数字の入力欄を出さない', getComputedStyle(b.root.querySelector('.mb-pad')).display === 'none' && getComputedStyle(b.cards.atk.ch).display !== 'none');
    tap('right', b.cards.right.prob.answer);
    check('正しい答えを1回タップすると行動が出る（右へ）', b.lane === 2 && b.stats.correct === 1, `lane=${b.lane}`);
    tap('left', b.cards.left.prob.answer);
    check('続けてタップできる（左へ）', b.lane === 1 && b.stats.correct === 2, `lane=${b.lane}`);
    until(() => h.state === 'drawn' && Math.hypot(h.pos.x - b.spots[1].x, h.pos.z - b.spots[1].z) < 0.6, 6);
    b.stats.correct = 0; b.combo = 0;
    // ミス
    const q0 = b.cards.atk.prob, bad = q0.choices.find(v => v !== q0.answer);
    tap('atk', bad);
    check('はずれをタップするとミス', b.stats.miss === 1 && b.lockT > 0 && b.combo === 0, `miss=${b.stats.miss}`);
    check('ミスすると正解が示される', btns('atk').find(x => x.classList.contains('right')).dataset.v === q0.ans && btns('atk').find(x => x.classList.contains('wrong')).dataset.v === String(bad));
    check('まちがえた問題が記録される', b.stats.missed.length === 1 && b.stats.missed[0].answer === q0.answer && b.stats.missed[0].chosen === bad, JSON.stringify(b.stats.missed));
    api.mathSolve('atk');
    check('ミスの直後は入力できない', b.stats.correct === 0);
    run(1.1);
    check('硬直が明けると新しい問題に替わる', b.cards.atk.prob !== q0 && !b.cards.atk.el.classList.contains('ng') && b.lockT === 0);
    until(() => b.enemy.phase === 'after' || b.enemy.phase === 'rest', 12); until(() => h.state === 'drawn', 6); b.combo = 0;
    // 斬る
    const hp0 = m.hp;
    api.mathSolve('atk');
    check('答えを打ち終えた瞬間に正解になる', b.stats.correct === 1 && b.combo === 1 && b.buf === '');
    run(0.75);
    const dmgAtk = hp0 - m.hp;
    check('斬る：頭にダメージ', dmgAtk > 40 && game.lastHit && game.lastHit.part === 'head', `${dmgAtk} ${game.lastHit && game.lastHit.part}`);
    // 予告 → 回避
    until(() => b.enemy.phase === 'tele');
    check('敵の予告が出て、回避のカードが出る', b.enemy.atk && !!b.cards.dodge.prob && b.enemy.atk.lanes.includes(1), b.enemy.atk && b.enemy.atk.id);
    check('回避の問題も答えがぶつからない', !clash(), answers().join(','));
    api.mathSolve('dodge');
    check('回避を解くと準備ができる', b.armed && !b.cards.dodge.prob);
    const hpH = h.hp;
    until(() => b.enemy.phase === 'after' || b.enemy.phase === 'rest');
    check('当たる瞬間に避けて、ダメージなし', b.stats.dodges === 1 && h.hp === hpH && b.counter, `dodges=${b.stats.dodges} hp=${h.hp}`);
    // 次の予告：動かないと当たる
    until(() => b.enemy.phase === 'tele');
    const hp1 = h.hp;
    until(() => b.enemy.phase === 'after' || b.enemy.phase === 'rest');
    check('解かずにいると攻撃を受ける', b.stats.hitsTaken === 1 && h.hp < hp1 && b.combo === 0, `hits=${b.stats.hitsTaken} hp=${h.hp.toFixed(0)}`);
    until(() => h.state === 'drawn', 6);
    // 回復
    const hp2 = h.hp;
    api.mathSolve('heal');
    check('回復：体力が増えて残り2回', h.hp > hp2 && b.potions === 2, `${hp2.toFixed(0)}→${h.hp.toFixed(0)}`);
    // 左へ動く → 予告された場所から逃げる
    until(() => b.enemy.phase === 'tele');
    const lanes = b.enemy.atk.lanes.slice();
    if (lanes.length === 1) {
      api.mathSolve('left');
      check('左へ：立ち位置が変わる', b.lane === 0);
      const hp3 = h.hp;
      until(() => b.enemy.phase === 'after' || b.enemy.phase === 'rest');
      check('予告の場所から動けば当たらない', b.stats.sidesteps === 1 && h.hp >= hp3 - 0.01, `side=${b.stats.sidesteps}`);
    } else {
      api.mathSolve('dodge'); until(() => b.enemy.phase === 'after' || b.enemy.phase === 'rest'); api.mathSolve('left');
      check('左へ：立ち位置が変わる', b.lane === 0);
      check('全体攻撃は回避で避ける', b.stats.dodges === 2);
    }
    until(() => h.state === 'drawn' && Math.hypot(h.pos.x - b.spots[0].x, h.pos.z - b.spots[0].z) < 0.6, 5);
    check('左の立ち位置に着く', Math.hypot(h.pos.x - b.spots[0].x, h.pos.z - b.spots[0].z) < 0.6, Math.hypot(h.pos.x - b.spots[0].x, h.pos.z - b.spots[0].z).toFixed(2));
    check('左では「左へ」が使えない', !b._enabled(b.cards.left) && b._enabled(b.cards.right));
    api.mathSolve('atk'); run(0.8);
    check('左右では脚を斬る', game.lastHit && /^leg/.test(game.lastHit.part), game.lastHit && game.lastHit.part);
    // 溜め斬り
    api.mathSolve('right');
    until(() => h.state === 'drawn' && Math.hypot(h.pos.x - b.spots[1].x, h.pos.z - b.spots[1].z) < 0.6, 5);
    b.combo = 0; b.counter = false;
    const hp4 = m.hp;
    api.mathSolve('big');
    until(() => h.state === 'attack' && h.move.id === 'chargeSlash', 3); run(0.4);
    check('溜め斬り：斬るより大きいダメージ', hp4 - m.hp > dmgAtk * 1.5, `${hp4 - m.hp} > ${dmgAtk}`);
    // 一時停止中は問題を隠す
    game.pause(); game.tick(1 / 60);
    check('一時停止中は問題が見えない', b.root.classList.contains('paused') && getComputedStyle(b.cards.atk.q).visibility === 'hidden');
    const cPause = b.stats.correct;
    api.mathSolve('atk');
    check('一時停止中は答えられない', b.stats.correct === cPause && b.queue.length === 0);
    game.resume();
    // 勝ち
    until(() => h.state === 'drawn', 5);
    m.hp = 20;
    api.mathSolve('atk');
    until(() => game.mode === 'result', 10);
    check('結果に、まちがえた問題が載る', game.lastMath && game.lastMath.missed.length === 1 && document.querySelector('.result-box').textContent.includes('まちがえた問題'));
    check('倒すと結果画面（勝ち）', game.mode === 'result' && game.lastMath && game.lastMath.win && game.lastMath.correct >= 6, JSON.stringify(game.lastMath && { win: game.lastMath.win, c: game.lastMath.correct }));
    check('結果に単元ごとの記録がある', game.lastMath.topics.length >= 3, game.lastMath.topics.map(t => t.name).join('／'));
    // 負け
    api.mathStart({ tempo: 'fast', seed: 3 });
    until(() => game.mode === 'result', 150);
    check('何もしないと負ける', game.mode === 'result' && game.lastMath && !game.lastMath.win, game.mode);
    // ふつうの狩りに戻れる
    game.goHome();
    const lg = JSON.parse(localStorage.getItem('hunter.mathlog') || '[]');
    check('バトルの記録が残る（勝ち1・負け1）', lg.length === 2 && lg[0].win && !lg[1].win && lg[0].topics.length >= 3, JSON.stringify(lg.map(x => x.win)));
    game.menus.home('record');
    check('記録の画面に出る', document.querySelector('.home-main').textContent.includes('最近のバトル') && document.querySelector('.home-stats').textContent.includes('討伐 1 回'));
    game.menus.home();
    check('拠点は数式バトルだけ（ふつうの狩りの入口はない）', !!document.querySelector('.home-main .math-opts') && !document.querySelector('[data-tab="quest"]') && !document.querySelector('[data-tab="equip"]'));
    check('拠点に戻ると台本が外れる', !game.math && !m.scripted && !m.aim && !document.getElementById('math') && h.moveMul === 1);
    api.start(); run(0.5);
    check('ふつうの狩りが始められる', game.mode === 'hunt' && !game.math && !game.overlays.hud.classList.contains('math'));
    game.goHome();
    // ---- スローと難易度 ----
    const savedSet = localStorage.getItem('hunter.settings'), keepMath = game.settings.math;
    const space = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    api.mathStart({ level: 'normal', seed: 31 });
    let c = game.math;
    check('ふつう：スローのゲージ6秒・スペースで出す', c.opts.level === 'normal' && c.focusMax === 6 && c.opts.slowMode === 'key' && !c.slow, JSON.stringify(c.opts));
    run(3.2);
    space(); game.tick(1 / 60);
    const t0 = c.t, f0 = c.focus;
    run(1);
    check('スペースでスロー：世界が0.4倍速になり、ゲージが減る', c.slow && Math.abs(game.timeScale - 0.4) < 1e-6 && Math.abs((c.t - t0) - 0.4) < 0.03 && Math.abs((f0 - c.focus) - 1) < 0.05, `dt=${(c.t - t0).toFixed(2)} focus=${c.focus.toFixed(2)}`);
    check('スロー中の表示が出る', c.root.classList.contains('slow') && !!c.root.querySelector('.mb-veil'));
    const f1 = c.focus;
    api.mathSolve('atk');
    check('正解するとゲージが少し戻る', c.focus > f1 + 0.3, `${f1.toFixed(2)}→${c.focus.toFixed(2)}`);
    space(); game.tick(1 / 60);
    check('もう一度スペースで元の速さ', !c.slow && game.timeScale === 1);
    c.focus = 0.2; c.root.querySelector('.mb-focus-btn').click(); run(0.5);
    check('ゲージが空になると自動で切れる', !c.slow && c.focus < 0.1 && game.timeScale === 1, `focus=${c.focus}`);
    c.focus = 0;
    check('空のときは出せない', api.mathSlow(true) === false && !c.slow);
    run(6);
    check('使わない間にゲージが少しずつ戻る', c.focus > 0.4 && c.focus < 0.8, c.focus.toFixed(2));
    api.mathStart({ level: 'normal', slowSec: 0, seed: 31 });
    c = game.math;
    check('スローなし：ゲージを出さず、スペースも効かない', c.opts.level === 'custom' && c.el.focus.classList.contains('hidden') && api.mathSlow(true) === false);
    // やさしい：危ないとき自動でスロー
    api.mathStart({ level: 'easy', seed: 32 });
    c = game.math;
    check('やさしい：問題も敵もやさしい設定', c.level === 0 && c.opts.slowMode === 'auto' && c.opts.atk === 0.4 && game.monster.maxHp < 1500, `hp=${game.monster.maxHp}`);
    until(() => c.slow, 40);
    check('やさしい：当たる3秒前に自動でスロー', c.slow && c.enemy.t < 3.05 && Math.abs(game.timeScale - 0.25) < 1e-6, `t=${c.enemy.t.toFixed(2)} scale=${game.timeScale}`);
    api.mathSolve(c.lane === 1 ? 'left' : 'dodge'); game.tick(1 / 60); game.tick(1 / 60);
    check('安全になったらスローが切れる', !c.slow && game.timeScale === 1);
    // むずかしい
    api.mathStart({ level: 'hard', seed: 33 });
    c = game.math;
    check('むずかしい：3つの数の計算が出る', c.level === 2 && (c.cards.left.prob.text.match(/\(/g) || []).length === 3 && c.focusMax === 3, c.cards.left.prob.text);
    check('個別に変えるとカスタムになる', game.math.opts.level === 'hard' && api.mathStart({ level: 'hard', slowSec: 12 }).opts.level === 'custom');
    game.math.toggleSlow(true); game.tick(1 / 60);
    game.math.finish(false, 'テスト');
    check('終わると速さが元に戻り、背景が記録される', game.timeScale === 1 && game.lastMath.setup.some(([name]) => name === '戦う背景'), game.timeScale);
    // 答え方「数字を打つ」
    api.mathStart({ level: 'normal', input: 'type', seed: 21 });
    c = game.math; run(3.2);
    const key = ch => window.dispatchEvent(new KeyboardEvent('keydown', { code: ch === '-' ? 'Minus' : 'Digit' + ch, key: ch, bubbles: true, cancelable: true }));
    check('数字を打つ形：4択を出さず、入力欄を出す', c.opts.level === 'custom' && getComputedStyle(c.cards.atk.ch).display === 'none' && getComputedStyle(c.root.querySelector('.mb-pad')).display !== 'none');
    for (const ch of c.cards.right.prob.ans) key(ch);
    check('数字を打つ形：キーボードで答える（右へ）', c.lane === 2 && c.stats.correct === 1, `lane=${c.lane}`);
    for (const ch of c.cards.left.prob.ans) c.root.querySelector(`.mb-pad button[data-k="${ch}"]`).click();
    check('数字を打つ形：画面のボタンで答える（左へ）', c.lane === 1 && c.stats.correct === 2, `lane=${c.lane}`);
    api.mathType('99');
    check('数字を打つ形：どの答えにもならない入力はミス', c.stats.miss === 1 && c.lockT > 0 && c.buf === '');
    // 端末チェック（設定画面のボタン）
    game.goHome(); game.menus.home('settings');
    const bb = document.querySelector('.bench-btn');
    check('設定に「この端末の速さを測る」がある', !!bb);
    // 設定画面
    game.goHome(); game.menus.home('math');
    const main = document.querySelector('.home-main');
    const pick = v => { const r = main.querySelector(`input[name=level][value="${v}"]`); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); };
    pick('easy');
    check('設定画面：難易度を選ぶと各項目が切り替わる', main.querySelector('[data-o=slowSec]').value === '12' && main.querySelector('[data-o=problem]').value === 'easy' && game.settings.math.slowMode === 'auto');
    const sel = main.querySelector('[data-o=slowRate]'); sel.value = '0.6'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    check('設定画面：項目を変えるとカスタムになり、保存される', main.querySelector('input[name=level][value=custom]').checked && game.settings.math.slowRate === 0.6 && game.settings.math.slowSec === 12, JSON.stringify(game.settings.math));
    main.querySelector('.depart').click();
    check('設定画面：その設定で始まる', game.math && game.math.opts.slowRate === 0.6 && game.math.level === 0);
    game.goHome();
    // 敵ごとのモデル・攻撃・部位
    api.mathStart({ enemy: 'sektra', seed: 40 });
    run(4);
    c = game.math;
    c.enemy.count = 1; c._telegraph(1);
    check('セクトラ：左右を同時に狙う固有攻撃', game.monster.variant === 'sektra' && c.enemy.atk.id === 'crystalPillars' && c.enemy.atk.lanes.join(',') === '0,2');
    c.enemy.count = 3; c._telegraph(1);
    c.enemy.t = c.enemy.lead + 0.04; run(1.25);
    check('セクトラ：中央のあと左右へ二段目', c.enemy.phase === 'follow' && c.enemy.atk?.lanes.join(',') === '0,2', c.enemy.phase);
    game.goHome();
    api.mathStart({ enemy: 'veira', seed: 41 });
    run(4);
    c = game.math;
    const vm = game.monster;
    check('ヴェイラ：翼骨で浮遊し、左右から翼を狙える', vm.variant === 'veira' && vm.J.wingL && vm.J.wingR && vm.air > 1 && c.parts[0] === 'wingR' && c.spots[2].x !== c.spots[1].x);
    c.enemy.count = 3; c._telegraph(1);
    check('ヴェイラ：大技は三か所すべてを狙う', c.enemy.atk.id === 'meteorBreath' && c.enemy.atk.lanes.length === 3);
    for (const side of ['L', 'R']) { vm.receiveHit({ part: 'wing' + side, damage: 360 }); vm.receiveHit({ part: 'wing' + side, damage: 360 }); }
    c.enemy.count = 3; c._telegraph(1);
    check('ヴェイラ：両翼破壊で大技を封じる', vm.wingBroken.L && vm.wingBroken.R && c.enemy.atk.id !== 'meteorBreath', c.enemy.atk.id);
    game.goHome();
    game.settings.math = keepMath;
    if (savedSet === null) localStorage.removeItem('hunter.settings'); else localStorage.setItem('hunter.settings', savedSet);
  } catch (e) {
    check('例外なし', false, e.stack || e.message);
  }
  if (savedLog === null) localStorage.removeItem('hunter.mathlog'); else localStorage.setItem('hunter.mathlog', savedLog);
  const pass = results.filter(r => r.ok).length;
  return { pass, total: results.length, fails: results.filter(r => !r.ok).map(r => r.name + ': ' + r.detail.slice(0, 160)) };
}
