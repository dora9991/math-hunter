// 計算まわりの回帰テスト： node tests/run.cjs
// （ゲーム全体の通しテストはブラウザで ?autotest=1 を付けて開く）
const path = require('path');
const { pathToFileURL } = require('url');
const imp = p => import(pathToFileURL(path.join(__dirname, '..', p)).href);

(async () => {
  const THREE = await import('three');
  const { calcDamage, isBounce, bladeVsHitboxes } = await imp('js/combat.js');
  const { chargeLevel, chargeMv, GS, LS, WEAPONS } = await imp('js/weapons.js');
  const { segSegDist2, track, wrapAngle, Rng } = await imp('js/util.js');
  const { SHARPNESS, SHARPNESS_MAX, MONSTER } = await imp('js/config.js');
  let pass = 0, fail = 0;
  const ok = (name, cond, detail = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, detail); } };

  // ダメージ計算（攻撃力×モーション値×切れ味×肉質）
  ok('縦斬り×青×脚', calcDamage(200, 48, 1.2, 42) === 48, calcDamage(200, 48, 1.2, 42));
  ok('溜めLv3×青×頭', calcDamage(200, 112, 1.2, 72) === 194, calcDamage(200, 112, 1.2, 72));
  ok('寝ている所は2倍', calcDamage(200, 48, 1.2, 42, 2) === 97);
  ok('最低1ダメージ', calcDamage(1, 1, 0.5, 1) === 1);
  // 弾かれ
  ok('青なら腕(30)で弾かれない', !isBounce(30, 1.2));
  ok('橙だと腕で弾かれる', isBounce(30, 0.75));
  ok('溜めLv2以上は弾かれない', !isBounce(30, 0.5, true));
  // 溜め
  ok('溜め0.5秒はLv0', chargeLevel(0.5) === 0);
  ok('溜め0.8秒はLv1', chargeLevel(0.8) === 1);
  ok('溜め2.3秒はLv3', chargeLevel(2.3) === 3);
  ok('溜めすぎ', chargeLevel(3.0) === 4 && chargeMv(4) < chargeMv(3));
  // 切れ味
  ok('切れ味の合計', SHARPNESS_MAX === SHARPNESS.reduce((s, x) => s + x.len, 0) && SHARPNESS_MAX === 200);
  // 技のつながり：コンボ先がすべて存在する
  for (const [wid, W] of Object.entries(WEAPONS)) {
    for (const [k, mv] of Object.entries(W.moves)) {
      for (const nx of Object.values(mv.combo || {})) ok(`${wid}.${k}→${nx} が存在`, !!W.moves[nx]);
      ok(`${wid}.${k} の当たり区間が技の時間内`, mv.active[1] < mv.duration && mv.comboFrom <= mv.duration);
      const p = new Float32Array(64), I = new Proxy({}, { get: (_, n) => ({ gripX: 27, gripY: 28, gripZ: 29, bladeX: 30, bladeY: 31, bladeZ: 32, edgeX: 33, edgeY: 34, edgeZ: 35, ik: 36, onBack: 37 }[n] ?? 0) });
      for (let t = 0; t <= mv.duration; t += 0.05) mv.pose(p, I, t);
      ok(`${wid}.${k} のポーズに NaN がない`, !Array.from(p).some(Number.isNaN));
    }
    for (const nx of Object.values(W.first)) ok(`${wid} の最初の技 ${nx}`, !!W.moves[nx]);
  }
  // 当たり判定
  const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(0, 0, 2), c = new THREE.Vector3(1, 0, 1), d = new THREE.Vector3(1, 1, 1);
  ok('線分の距離', Math.abs(segSegDist2(a, b, c, d) - 1) < 1e-6);
  const hb = { wa: new THREE.Vector3(0, 1, 0), wb: new THREE.Vector3(0, 1, 3), r: 0.5, part: 'tail', off: false };
  const blade = { pa: new THREE.Vector3(-2, 1, 1), pb: new THREE.Vector3(-3, 1, 1), a: new THREE.Vector3(2, 1, 1), b: new THREE.Vector3(3, 1, 1) };
  ok('刃のスイープで当たる（すり抜けない）', !!bladeVsHitboxes(blade, [hb]));
  hb.off = true;
  ok('切れた尻尾には当たらない', !bladeVsHitboxes(blade, [hb]));
  // 補間・角度・乱数
  ok('キーフレーム', Math.abs(track(0.5, [[0, 0], [1, 10]], t => t) - 5) < 1e-9);
  ok('角度の正規化', Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-9 || Math.abs(wrapAngle(Math.PI * 3) + Math.PI) < 1e-9);
  const r1 = new Rng(7), r2 = new Rng(7);
  ok('シード付き乱数は再現できる', r1.next() === r2.next());
  // モンスターの部位設定
  for (const [k, v] of Object.entries(MONSTER.parts)) ok(`部位 ${k} の肉質`, v.zone > 0 && v.zone <= 100 && v.flinch > 0);

  // ---- 数式バトルの問題：式を別の方法で計算し直して、答えと合うか確かめる ----
  {
    const { KINDS, makeProblem, conflicts } = await imp('js/mathproblems.js');
    const js = t => t.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/x²/g, '(x**2)').replace(/(\d+)²/g, '($1**2)').replace(/\)²/g, ')**2')
      .replace(/(\d)x/g, '$1*x').replace(/(\d)\(/g, '$1*(').replace(/\(\+/g, '(');
    const LV = ['やさしい', 'ふつう', 'むずかしい'];
    const rng = new Rng(77);
    for (const kind of Object.keys(KINDS)) for (let lv = 0; lv < 3; lv++) {
      let bad = '', n = 0;
      for (let i = 0; i < 400 && !bad; i++) {
        const p = makeProblem(kind, rng, [], lv);
        n++;
        if (!Number.isInteger(p.answer) || Math.abs(p.answer) > 99 || p.ans !== String(p.answer)) { bad = `整数でない: ${p.text} → ${p.answer}`; break; }
        let got;
        if (p.text.includes('=')) {                         // 方程式：答えを代入して左辺＝右辺
          const [l, r] = p.text.split('=').map(js);
          const f = new Function('x', `return [${l}, ${r}]`)(p.answer);
          got = Math.abs(f[0] - f[1]) < 1e-9 ? p.answer : NaN;
        } else if (p.pre && p.pre.startsWith('x =')) {      // 式の値
          const x = Number(js(p.pre.match(/x = (\S+)/)[1]));
          got = new Function('x', `return ${js(p.text)}`)(x);
        } else got = new Function(`return ${js(p.text)}`)();
        if (Math.abs(got - p.answer) > 1e-9) bad = `${p.text} → ${p.answer}（検算 ${got}）`;
        // 4択：4つ・重複なし・正解がちょうど1つ・整数。左右は符号で当てられない
        const ch = p.choices;
        if (ch.length !== 4 || new Set(ch).size !== 4 || ch.filter(v => v === p.answer).length !== 1 || !ch.every(Number.isInteger)) bad = `4択がおかしい: ${p.text} → ${ch}`;
        if ((kind === 'left' && !ch.every(v => v < 0)) || (kind === 'right' && !ch.every(v => v > 0))) bad = `左右の4択の符号: ${p.text} → ${ch}`;
        if (kind === 'left' && p.answer >= 0) bad = `左なのに正: ${p.text}`;
        if (kind === 'right' && p.answer <= 0) bad = `右なのに負: ${p.text}`;
      }
      ok(`問題「${kind}」${LV[lv]} 400問の検算`, !bad && n === 400, bad);
    }
    ok('答えのぶつかり判定', conflicts('-1', '-12') && conflicts('3', '3') && !conflicts('-1', '1') && !conflicts('12', '13'));
    let clash = 0;
    for (let i = 0; i < 300; i++) {
      const taken = [];
      for (const k of ['left', 'atk', 'big', 'heal', 'right', 'dodge3']) { const p = makeProblem(k, rng, taken, i % 3); if (taken.some(t => conflicts(t, p.ans))) clash++; taken.push(p.ans); }
    }
    ok('6枚のカードの答えは、打ち始めが重ならない', clash === 0, clash);
  }
  console.log(`node テスト：${pass} 成功 / ${fail} 失敗`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
