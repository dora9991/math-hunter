// tests/view.cjs で使う場面。p.eval でゲーム内のテスト窓口（window.__hunt）を呼ぶ。
// 1回ごとに { } で囲む（const の名前が次の呼び出しとぶつからないように）
const J = s => '{ ' + s.replace(/\n\s*/g, ' ') + ' }';

// 開けた場所（エリア2）でハンターを正面・横から見る
const RAW = s => s.replace(/\n\s*/g, ' ');
const PLACE = RAW(`const g = __hunt.game, h = g.hunter, m = g.monster;
  __hunt.start(); __hunt.advance(0.3); __hunt.god(true); __hunt.freezeMonster(true);
  m.pos.set(30, g.world.terrain.heightAt(30, -20), -20); m._placeFeet();
  __hunt.teleport(4, -6, 0.6); __hunt.advance(0.2); g.timeScale = 0;`);

module.exports = {
  // タイトル画面
  async title(p, shot, sleep) { await sleep(1500); await shot('title'); return p.eval('__hunt.state.mode'); },

  // 自動テスト（40項目）と1コマの重さ
  async autotest(p) {
    return p.eval(J(`(() => { const r = __hunt.autotest(); const g = __hunt.game;
      __hunt.start(); __hunt.advance(0.5);
      const t0 = performance.now(); for (let i = 0; i < 60; i++) { g.tick(1/60); g.render(); } g.renderer.getContext().finish();
      return { pass: r.pass, total: r.total, fails: r.results.filter(x => !x.ok).map(x => x.name + ': ' + x.detail.slice(0, 80)), ms: +((performance.now() - t0) / 60).toFixed(2), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, ua: navigator.userAgent.slice(-40) }; })()`));
  },

  // 実時間の速さ（3秒間のフレーム数）
  async fps(p, shot, sleep) {
    await p.eval(J(`__hunt.start(); __hunt.god(true); const m = __hunt.game.monster; __hunt.teleport(m.pos.x - 10, m.pos.z - 5); __hunt.game.frameTimes.length = 0; 1`));
    await sleep(3000);
    return p.eval(J(`(() => { const f = __hunt.game.frameTimes; const s = f.slice().sort((a, b) => a - b); return { frames: f.length, avgMs: +(f.reduce((a, b) => a + b, 0) / f.length * 1000).toFixed(1), p95Ms: +(s[Math.floor(s.length * 0.95)] * 1000).toFixed(1), size: innerWidth + 'x' + innerHeight, dpr: devicePixelRatio }; })()`));
  },

  // どこが重いかの切り分け（設定を変えながら2秒ずつ測る）
  async perf(p, shot, sleep) {
    await p.eval(J(`__hunt.start(); __hunt.god(true); const m = __hunt.game.monster; __hunt.freezeMonster(true); __hunt.teleport(m.pos.x - 10, m.pos.z - 5); 1`));
    const out = {};
    const measure = async (label, js) => {
      await p.eval(J(js + `; __hunt.game.frameTimes.length = 0; 1`));
      await sleep(2200);
      out[label] = await p.eval(J(`(() => { const f = __hunt.game.frameTimes; return +(f.reduce((a, b) => a + b, 0) / Math.max(1, f.length) * 1000).toFixed(1); })()`));
    };
    await measure('base', `const g = __hunt.game; window.__pr = g.renderer.getPixelRatio()`);
    await measure('pixelRatio1', `const g = __hunt.game; g.renderer.setPixelRatio(1); g.resize()`);
    await measure('pr1_noShadow', `const g = __hunt.game; g.renderer.shadowMap.enabled = false; g.world.sun.castShadow = false`);
    await measure('pr1_noShadow_noGrass', `const g = __hunt.game; g.world.grass.visible = false`);
    await measure('pr1_noShadow_noGrass_noProps', `const g = __hunt.game; (g.world.propMeshes || []).forEach(m => m.visible = false)`);
    await measure('pr1_noShadow_noGrass_noProps_noMonster', `const g = __hunt.game; g.monster.root.visible = false`);
    await measure('back_pr175_shadowOn_noGrassNoProps', `const g = __hunt.game; g.monster.root.visible = true; g.renderer.setPixelRatio(window.__pr); g.resize(); g.renderer.shadowMap.enabled = true; g.world.sun.castShadow = true`);
    out.pr = await p.eval('window.__pr');
    return out;
  },

  // 1コマの重さの内訳（設定を1つずつ切って、30コマ描いて測る）
  async cost(p) {
    return p.eval(J(`(() => { const g = __hunt.game; __hunt.start(); __hunt.god(true); __hunt.freezeMonster(true); const m = g.monster; __hunt.teleport(m.pos.x - 10, m.pos.z - 5); __hunt.advance(0.3);
      const gl = g.renderer.getContext(); const out = {};
      const measure = (label) => { for (let i = 0; i < 5; i++) { g.tick(1/60); g.render(); } gl.finish(); const t0 = performance.now(); for (let i = 0; i < 30; i++) { g.tick(1/60); g.render(); } gl.finish(); out[label] = +((performance.now() - t0) / 30).toFixed(1); };
      measure('all');
      const q = g.settings.quality; g.settings.quality = 'low'; measure('noPost'); 
      g.world.sun.castShadow = false; measure('noPost_noShadow'); g.world.sun.castShadow = true;
      g.world.grass.visible = false; measure('noPost_noGrass'); g.world.grass.visible = true;
      (g.world.propMeshes || []).forEach(x => x.visible = false); measure('noPost_noTreesRocks'); (g.world.propMeshes || []).forEach(x => x.visible = true);
      g.world.terrainMesh.visible = false; measure('noPost_noTerrain'); g.world.terrainMesh.visible = true;
      g.hunter.root.visible = false; g.monster.root.visible = false; measure('noPost_noChars'); g.hunter.root.visible = true; g.monster.root.visible = true;
      const pr = g.renderer.getPixelRatio(); g.renderer.setPixelRatio(1); g.resize(); measure('noPost_pr1'); 
      g.settings.quality = q; measure('post_pr1'); g.renderer.setPixelRatio(pr); g.resize();
      out.pr = pr; out.size = innerWidth + 'x' + innerHeight;
      return out; })()`));
  },

  async cost2(p) {
    return p.eval(J(`(() => { const g = __hunt.game; __hunt.start(); __hunt.god(true); __hunt.freezeMonster(true); const m = g.monster; __hunt.teleport(m.pos.x - 10, m.pos.z - 5); __hunt.advance(0.3);
      const gl = g.renderer.getContext(); const out = {};
      const measure = (label) => { for (let i = 0; i < 10; i++) { g.tick(1/60); g.render(); } gl.finish(); const t0 = performance.now(); for (let i = 0; i < 60; i++) { g.tick(1/60); g.render(); } gl.finish(); out[label] = +((performance.now() - t0) / 60).toFixed(1); };
      const tickOnly = (label) => { const t0 = performance.now(); for (let i = 0; i < 60; i++) g.tick(1/60); out[label] = +((performance.now() - t0) / 60).toFixed(2); };
      g.settings.quality = 'low';
      measure('base'); tickOnly('tickOnly');
      g.hunter.root.visible = false; measure('noHunter'); g.hunter.root.visible = true;
      g.monster.root.visible = false; measure('noMonster'); g.monster.root.visible = true;
      measure('base2');
      g.hunter.root.traverse(o => { if (o.isSkinnedMesh) o.castShadow = false; }); g.monster.root.traverse(o => { if (o.isSkinnedMesh) o.castShadow = false; }); measure('charsNoShadowCast');
      g.renderer.shadowMap.enabled = false; g.world.sun.castShadow = false; measure('noShadowsAtAll');
      g.settings.quality = 'high'; measure('post_noShadows');
      return out; })()`));
  },

  // ハンターの見た目
  async hunter(p, shot, sleep) {
    await p.eval(J(PLACE + `__hunt.view(Math.PI - 0.5, 0.08, 3.2); 1`)); await sleep(400); await shot('hunter-front');
    await p.eval(J(`__hunt.view(0.9, 0.12, 3.4); 1`)); await sleep(300); await shot('hunter-back');
    await p.eval(J(`const g = __hunt.game; g.hunter.setState('drawn', 0); g.hunter.drawn = true; g.hunter.blendT = 99; g.timeScale = 1; g.tick(1/60); g.timeScale = 0; __hunt.view(Math.PI - 0.7, 0.1, 3.6); 1`)); await sleep(300); await shot('hunter-drawn');
    await p.eval(J(`__hunt.freezeMove('vslash', 0.5); __hunt.view(Math.PI / 2, 0.1, 4.2); 1`)); await sleep(300); await shot('hunter-slash');
    return 'ok';
  },

  // 風景
  async scene(p, shot, sleep) {
    await p.eval(J(`__hunt.start(); __hunt.advance(0.3); __hunt.game.timeScale = 0; __hunt.game.hunter.facing = -0.9; __hunt.view(0, 0.3, 8); 1`)); await sleep(500); await shot('scene-camp');
    await p.eval(J(PLACE + `m.pos.set(14, g.world.terrain.heightAt(14, 4), 4); m.facing = -2.2; m._placeFeet(); g.timeScale = 1; g.tick(1/60); g.timeScale = 0; h.facing = Math.atan2(14 - h.pos.x, 4 - h.pos.z); __hunt.view(0.3, 0.12, 6.5); 1`)); await sleep(500); await shot('scene-monster');
    await p.eval(J(`__hunt.teleport(48, 50, 0.9); __hunt.view(0.2, 0.2, 7); 1`)); await sleep(500); await shot('scene-lake');
    await p.eval(J(`__hunt.teleport(-40, 34, -2.4); __hunt.view(0, 0.16, 7); 1`)); await sleep(500); await shot('scene-area1');
    await p.eval(J(`__hunt.teleport(56, -54, 2.6); __hunt.view(0.2, 0.22, 8); 1`)); await sleep(500); await shot('scene-nest');
    return 'ok';
  },

  // エフェクト
  async fx(p, shot, sleep) {
    await p.eval(J(PLACE + `m.pos.set(12, g.world.terrain.heightAt(12, 0), 0); m.facing = -2.0; m._placeFeet(); g.timeScale = 1; g.tick(1/60);
      const leg = __hunt.partPos('legL'); const sa = m.facing + Math.PI / 2; const px = leg.b[0] + Math.sin(sa) * 2.4, pz = leg.b[2] + Math.cos(sa) * 2.4;
      __hunt.teleport(px, pz); h.facing = Math.atan2(leg.b[0] - px, leg.b[2] - pz); h.setState('drawn'); h.drawn = true; g.tick(1/60); g.lastHit = null;
      g.input.keyDown('KeyJ'); for (let i = 0; i < 60 * 2.75; i++) g.tick(1/60); g.input.keyUp('KeyJ');
      let hit = false; for (let i = 0; i < 40 && !hit; i++) { g.tick(1/60); hit = !!g.lastHit; } for (let i = 0; i < 3; i++) g.tick(1/60);
      g.timeScale = 0; __hunt.view(0.9, 0.15, 6.5); 1`)); await sleep(300); await shot('fx-hit');
    await p.eval(J(`const g = __hunt.game, m = g.monster, h = g.hunter; g.timeScale = 1; m.frozen = false; m.inCombat = true;
      const a = m.facing; __hunt.teleport(m.pos.x + Math.sin(a) * 16 + Math.cos(a) * 9, m.pos.z + Math.cos(a) * 16 - Math.sin(a) * 9); h.setState('free'); h.drawn = false;
      m.startAction('fireball'); for (let i = 0; i < 60 * 1.25; i++) g.tick(1/60); g.timeScale = 0;
      h.facing = Math.atan2(m.pos.x - h.pos.x, m.pos.z - h.pos.z); __hunt.view(0.5, 0.1, 6); 1`)); await sleep(300); await shot('fx-fire');
    await p.eval(J(`const g = __hunt.game, m = g.monster; g.timeScale = 1; m.startAction('roar'); for (let i = 0; i < 60 * 0.75; i++) g.tick(1/60); g.timeScale = 0; __hunt.view(0.5, 0.1, 6); 1`)); await sleep(300); await shot('fx-roar');
    return 'ok';
  },

  // 数式バトル：開始直後・予告中・攻撃の瞬間・左へ移動した後
  async math(p, shot, sleep) {
    await p.eval(J(`__hunt.mathStart({ tempo: 'normal', seed: 5 }); __hunt.advance(3.4); 1`));
    await sleep(300); await shot('math-1-start');
    const s1 = await p.eval(J(`(() => { __hunt.advance(2.6); return __hunt.math; })()`));
    await sleep(300); await shot('math-2-telegraph');
    await p.eval(J(`__hunt.mathSolve('atk'); __hunt.advance(0.62); 1`));
    await sleep(300); await shot('math-3-attack');
    await p.eval(J(`__hunt.advance(1.2); __hunt.mathSolve('left'); __hunt.advance(1.6); 1`));
    await sleep(300); await shot('math-4-left');
    const s2 = await p.eval(J(`(() => { __hunt.mathSolve('atk'); __hunt.advance(0.6); return __hunt.math; })()`));
    await sleep(300); await shot('math-5-leg');
    return { s1, s2 };
  },

  // 数式バトルを自動で遊んで、勝ち負けと時間を見る（つり合いの確認）
  async mathbot(p) {
    return p.eval(J(`(() => { const out = {};
      for (const [k, a] of Object.entries({ normal3: ['smart', 3, 600, { level: 'normal' }], normal5: ['smart', 5, 600, { level: 'normal' }], normal5slow: ['smart', 5, 600, { level: 'normal', useSlow: true }], normal7: ['smart', 7, 900, { level: 'normal' }], normal7slow: ['smart', 7, 900, { level: 'normal', useSlow: true }], greedy3: ['greedy', 3, 600, { level: 'normal' }], nothing: ['slow', 3, 200, { level: 'normal' }],
        easy7: ['smart', 7, 900, { level: 'easy' }], easy10: ['smart', 10, 900, { level: 'easy' }], easyNothing: ['slow', 3, 300, { level: 'easy' }], hard3: ['smart', 3, 900, { level: 'hard' }], hard5: ['smart', 5, 900, { level: 'hard' }], hard5slow: ['smart', 5, 900, { level: 'hard', useSlow: true }] })) {
        const r = __hunt.mathBot(...a); const x = r.result || {};
        out[k] = [x.win ? 'WIN' : 'LOSE', (x.time && +x.time.toFixed(0)) + 's', 'correct ' + x.correct, 'hits ' + x.hitsTaken, 'dodge ' + x.dodges, 'side ' + x.sidesteps, 'slow ' + (x.slowUsed || 0).toFixed(0) + 's', 'left ' + x.monsterLeft + '%', 'hp ' + r.hp].join(' / ');
      }
      __hunt.home(); return out; })()`));
  },

  // 好きな式を実行する（調べもの用）： JS='...' node tests/view.cjs chrome js
  async js(p, shot, sleep) { const r = await p.eval(J(process.env.JS || '1')); if (process.env.SHOT) { await sleep(300); await shot(process.env.SHOT); } return r; },

  // 動きのなめらかさ：同じ操作をして、頭・手・竜の頭の「急な加速」を、なめらか化あり／なしで比べる
  async smooth(p) {
    return p.eval(J(`(() => { const g = __hunt.game; const out = {};
      const run = (off) => {
        __hunt.start(); __hunt.god(true); const h = g.hunter, m = g.monster; h.smoothOff = off; m.smoothOff = off;
        __hunt.teleport(m.pos.x - 9, m.pos.z - 4, 0.5); __hunt.advance(0.3);
        const tr = { head: [], hand: [], mhead: [] }; const v = new (h.pos.constructor)();
        const rec = () => { h.root.updateMatrixWorld(true);
          tr.head.push(h.J.head.getWorldPosition(v).sub(h.pos).toArray()); tr.hand.push(h.J.fArmR.getWorldPosition(v).sub(h.pos).toArray());
          tr.mhead.push(m.J.head.getWorldPosition(v).sub(m.pos).toArray()); };
        const step = (sec, keys = []) => { keys.forEach(k => g.input.keyDown(k)); for (let i = 0; i < Math.round(sec * 60); i++) { g.tick(1 / 60); rec(); } keys.forEach(k => g.input.keyUp(k)); };
        const tap = k => { g.input.keyDown(k); g.tick(1 / 60); rec(); g.input.keyUp(k); };
        step(1.0, ['KeyW']); step(0.5); step(1.0, ['KeyW', 'KeyD']); step(0.8, ['KeyS']); tap('Space'); step(1.0); tap('KeyJ'); step(1.3); tap('KeyJ'); step(0.9); tap('KeyK'); step(1.4); tap('KeyR'); step(1.2); step(6.0);
        const acc = a => { const r = []; for (let i = 1; i < a.length - 1; i++) { const d = [0, 1, 2].map(k => a[i + 1][k] - 2 * a[i][k] + a[i - 1][k]); r.push(Math.hypot(...d) * 3600); } r.sort((x, y) => x - y); return { max: +r[r.length - 1].toFixed(0), p99: +r[Math.floor(r.length * 0.99)].toFixed(0), p90: +r[Math.floor(r.length * 0.9)].toFixed(0) }; };
        return { hunterHead: acc(tr.head), hunterHand: acc(tr.hand), monsterHead: acc(tr.mhead) };
      };
      out.before = run(true); out.after = run(false); g.hunter.smoothOff = false; g.monster.smoothOff = false; return out; })()`));
  },

  // 数式バトルの自動テスト
  async mathtest(p) { return p.eval(J(`__hunt.mathtest()`)); },

  // 新しい10体のモデル・戦場・攻撃範囲・破壊可能な左右部位を通しで確認する。
  async bestiarytest(p, shot, sleep) {
    const result = await p.eval(J(`(() => {
      const ids = 'raizen gradon morga frostra salda velum nebra galdo barza lunax'.split(' ');
      const out = [];
      for (const id of ids) {
        __hunt.mathStart({ enemy:id, seed:73, level:'normal' });
        __hunt.god(true);
        const g=__hunt.game, b=g.math, m=g.monster;
        const entry={ id, name:m.name, model:m.skinned, stage:b.battlefield?.root?.name,
          parts:b.parts.slice(), spots:b.spots.map(s=>[+s.x.toFixed(1),+s.z.toFixed(1)]), attacks:[],
          blocked:b.spots.map(s=>g.world.colliders.filter(c=>Math.hypot(c.x-s.x,c.z-s.z)<c.r+0.8).length),
          nearby:id==='frostra' ? g.world.colliders.filter(c=>Math.hypot(c.x-b.spots[0].x,c.z-b.spots[0].z)<c.r+2).map(c=>[+c.x.toFixed(1),+c.z.toFixed(1),c.r]) : [] };
        for (const count of [1,2,4]) {
          m.startAction('hold'); b.enemy.phase='rest'; b.enemy.count=count-1; b.enemy.t=0;
          b._telegraph(1);
          const a=b.enemy.atk;
          entry.attacks.push({id:a.id,lanes:a.lanes.slice(),action:a.action});
          b.enemy.t=b.enemy.lead; b._enemy(0.01);
          if (m.state !== 'beastMove') throw new Error(id+' '+a.id+' action '+m.state);
          for (let i=0;i<100;i++) g.tick(1/60);
        }
        const followSlot=['raizen','frostra','salda','galdo','lunax'].includes(id) ? 1 : 2;
        m.startAction('hold'); b.enemy.phase='rest'; b.enemy.count=followSlot===1?1:3; b.enemy.t=0;
        b._telegraph(1); b.enemy.t=b.enemy.lead; b._enemy(0.01);
        for (let i=0;i<240 && b.enemy.phase!=='follow';i++) g.tick(1/60);
        entry.followLanes=b.enemy.phase==='follow' ? b.enemy.atk.lanes.slice() : [];
        for (let i=0;i<240 && b.enemy.phase==='follow';i++) g.tick(1/60);
        entry.followResolves=b.enemy.phase==='after' || b.enemy.phase==='rest' || b.enemy.phase==='tele';
        m._breakWing('L'); m._breakWing('R');
        m.startAction('hold'); b.enemy.phase='rest'; b.enemy.count=3; b.enemy.t=0; b._telegraph(1);
        entry.breakStopsUltimate=b.enemy.atk.id!==id+'_2' && m.wingBroken.L && m.wingBroken.R;
        entry.valid=entry.model && entry.stage && entry.parts[0]==='wingR' &&
          entry.attacks.map(a=>a.id).join(',')===id+'_0,'+id+'_1,'+id+'_2' &&
          entry.followLanes.length>0 && entry.followResolves && entry.breakStopsUltimate;
        out.push(entry);
      }
      return { pass:out.filter(x=>x.valid).length,total:out.length,monsters:out };
    })()`));
    await p.eval(J(`__hunt.mathStart({ enemy:'lunax', level:'easy', seed:73 }); __hunt.god(true); __hunt.advance(3.2); 1`));
    await sleep(1300);
    await shot('bestiary-lunax');
    return result;
  },

  async bestiarybalance(p) {
    return p.eval(J(`(() => {
      const ids='raizen gradon morga frostra salda velum nebra galdo barza lunax'.split(' ');
      return ids.map(id=>{
        const x=__hunt.mathBot('smart',3.8,400,{ enemy:id, level:'normal', seed:31 });
        return { id, win:x.result.win, time:Math.round(x.result.time), hp:x.hp,
          hits:x.result.hitsTaken, left:x.result.monsterLeft, unfinished:!!x.result.unfinished };
      });
    })()`));
  },

  async fieldgallery(p, shot) {
    for (const id of ['gradon','frostra','barza','lunax']) {
      await p.eval(J(`__hunt.mathStart({ enemy:${JSON.stringify(id)}, level:'easy', seed:73 }); __hunt.god(true); __hunt.advance(2.6); document.querySelector('.hud-msgs').innerHTML=''; 1`));
      await shot('field-'+id);
    }
    return '4フィールド撮影';
  },

  // 数式バトルの入口（拠点メニュー）・溜め斬り・回避・結果画面
  async mathui(p, shot, sleep) {
    await p.eval(J(`__hunt.home(); __hunt.game.menus.home('math'); 1`));
    await sleep(600); await shot('mathui-1-menu');
    await p.eval(J(`__hunt.mathStart({ seed: 9 }); __hunt.advance(5); __hunt.mathSolve('big'); __hunt.advance(0.45); 1`));
    await sleep(200); await shot('mathui-2-charge');
    await p.eval(J(`(() => { const g = __hunt.game, b = g.math; for (let i = 0; i < 1200 && b.enemy.phase !== 'tele'; i++) g.tick(1/60); __hunt.mathSolve('dodge'); for (let i = 0; i < 1200 && !(b.enemy.phase === 'strike' && b.enemy.t < 0.05); i++) g.tick(1/60); __hunt.advance(0.12); })()`));
    await sleep(200); await shot('mathui-3-dodge');
    await p.eval(J(`(() => { const g = __hunt.game, b = g.math; __hunt.mathMiss('atk'); g.tick(1/60); })()`));
    await sleep(200); await shot('mathui-4-miss');
    await p.eval(J(`(() => { const g = __hunt.game, b = g.math; __hunt.advance(1.2); for (let i = 0; i < 1200 && b.enemy.phase !== 'tele'; i++) g.tick(1/60); __hunt.advance(1.5); __hunt.mathSlow(true); __hunt.advance(1.2); })()`));
    await sleep(500); await shot('mathui-6-slow');
    const r = await p.eval(J(`(() => { const r = __hunt.mathBot('smart', 4, 600, { seed: 4, wrongEvery: 9 }); return r.result; })()`));
    await sleep(600); await shot('mathui-5-result');
    return r;
  },

  // 数式バトル中の実時間の速さ（4秒間）
  async mathfps(p, shot, sleep) {
    await p.eval(J(`__hunt.mathStart({ seed: 5 }); __hunt.game.frameTimes.length = 0; 1`));
    await sleep(4000);
    return p.eval(J(`(() => { const g = __hunt.game, f = g.frameTimes; const s = f.slice().sort((a, b) => a - b);
      const gl = g.renderer.getContext(); const t0 = performance.now(); for (let i = 0; i < 60; i++) { g.tick(1/60); g.render(); } gl.finish();
      return { frames: f.length, avgMs: +(f.reduce((a, b) => a + b, 0) / f.length * 1000).toFixed(1), p95Ms: +(s[Math.floor(s.length * 0.95)] * 1000).toFixed(1), costMs: +((performance.now() - t0) / 60).toFixed(2), t: g.math.t.toFixed(1) }; })()`));
  },

  // 数式バトル中の重さ：描く画素数・影・草を変えながら、1コマの時間（ms）を測る。CPU=4 を付けると CPU を4倍遅くして測る
  async mathbench(p) {
    return p.eval(J(`(() => { const g = __hunt.game; g.noRecord = true; __hunt.mathStart({ seed: 5 }); __hunt.advance(4); const gl = g.renderer.getContext(); const out = {};
      const run = (label) => { for (let i = 0; i < 8; i++) { g.tick(1/60); g.render(); } gl.finish(); let t0 = performance.now(); for (let i = 0; i < 40; i++) g.tick(1/60); const cpu = (performance.now() - t0) / 40; t0 = performance.now(); for (let i = 0; i < 40; i++) { g.tick(1/60); g.render(); } gl.finish(); out[label] = { frameMs: +((performance.now() - t0) / 40).toFixed(1), tickMs: +cpu.toFixed(2), px: Math.round(g.renderer.domElement.width * g.renderer.domElement.height / 1000) + 'k', calls: g.renderer.info.render.calls, tris: Math.round(g.renderer.info.render.triangles / 1000) + 'k' }; };
      const px = (n) => { g.renderer.setPixelRatio(Math.sqrt(n / (g.w * g.h))); g.renderer.setSize(g.w, g.h); g.camera.updateProjectionMatrix(); };
      g.settings.quality = 'mid'; px(1.0e6); run('A_mid_1.0M');
      px(0.5e6); run('B_0.5M');
      px(0.3e6); run('C_0.3M');
      g.renderer.shadowMap.enabled = false; g.world.sun.castShadow = false; run('D_0.3M_noShadow');
      g.world.grass.visible = false; run('E_+noGrass');
      (g.world.propMeshes || []).forEach(m => { m.visible = false; }); run('F_+noTrees');
      return { size: g.w + 'x' + g.h, out }; })()`));
  },
};
