// タイトル・拠点・一時停止・リザルトなどの画面
import { GAME_TITLE, QUEST } from './config.js';
import { fmtTime, store } from './util.js';
import { CREDITS_HTML } from './credits.js';
import { OPTIONS, PRESETS, resolveOptions } from './mathbattle.js';
import { BESTIARY, NEW_BEAST_IDS, enemyShort } from './bestiary.js';
import { BATTLE_BACKGROUNDS } from './battlefield.js';

const MATH_HELP = `
  <h2>遊び方</h2>
  <table>
    <tr><th>行動する</th><td>スマホでは画面下の行動を選び、4つの答えから正しいものをタップ。その瞬間に行動が出る</td></tr>
    <tr><th>集中（スロー）</th><td>スペースキー、または左上の「集中」ボタン。ゲージのぶんだけ世界がゆっくりになる</td></tr>
    <tr><th>一時停止</th><td>スマホでは「一時停止」ボタン、パソコンでは Esc キー</td></tr>
  </table>
  <h3>戦い方</h3>
  <table>
    <tr><th>立ち位置</th><td>左・中央・右の3か所。中央は頭（弱点）。左右は敵ごとに脚・翼・甲殻など破壊できる部位が変わる</td></tr>
    <tr><th>敵の攻撃</th><td>予告のあと、赤い円の場所に来る。「左へ／右へ」で逃げるか、「回避」を解いてその場で避ける</td></tr>
    <tr><th>回避</th><td>敵の攻撃が強いほど問題が難しい。成功すると次の一撃が1.5倍</td></tr>
    <tr><th>連続正解</th><td>続けて正解するほど攻撃が強くなる（最大1.5倍）。ミスと被弾で0に戻る</td></tr>
    <tr><th>ミス</th><td>正解が緑で示され、1秒動けない。まちがえた問題は結果画面に残る</td></tr>
  </table>`;

export class Menus {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.cur = null;
  }
  _screen(cls, html) {
    this.root.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    this.root.classList.remove('hidden');
    this.cur = cls;
    const el = this.root.firstElementChild;
    el.querySelectorAll('button').forEach(b => b.addEventListener('mouseenter', () => this.game.sfx('select')));
    return el;
  }
  hide() { this.root.classList.add('hidden'); this.root.innerHTML = ''; this.cur = null; }

  title() {
    const el = this._screen('title', `
      <div class="title-box">
        <div class="title-kicker">MATH HUNTING ACTION</div>
        <h1>${GAME_TITLE}</h1>
        <div class="title-sub">― 数式で狩れ ―</div>
        <button class="big start">タップ／クリックしてはじめる</button>
        <div class="title-note">問題を解くと、狩人が動く。タップ（クリック）だけで遊べます・音が出ます</div>
      </div>
      <div class="title-foot">非公式のファンメイド作品です ・ 質感の画像：Poly Haven（CC0）／キャンプ用品：Kenney（CC0）・ クレジットは拠点メニューから</div>`);
    el.querySelector('.start').addEventListener('click', () => { this.game.sfx('ui'); this.game.goHome(); });
  }

  home(tab = 'math') {
    const log = store.get('hunter.mathlog', []);
    const wins = log.filter(x => x.win).length;
    const el = this._screen('home', `
      <div class="home-wrap">
        <div class="home-side">
          <div class="home-title">拠点 ― 狩人の村</div>
          <button data-tab="math">数式バトル</button>
          <button data-tab="record">記録</button>
          <button data-tab="help">遊び方</button>
          <button data-tab="settings">設定</button>
          <button data-tab="credits">クレジット</button>
          <button data-tab="title" class="ghost">タイトルへ</button>
          <div class="home-stats">討伐 ${wins} 回 ／ 挑戦 ${log.length} 回</div>
        </div>
        <div class="home-main"></div>
      </div>`);
    el.querySelectorAll('.home-side button').forEach(b => b.addEventListener('click', () => {
      this.game.sfx('ui');
      if (b.dataset.tab === 'title') { this.game.goTitle(); return; }
      this._tab(el, b.dataset.tab);
    }));
    this._tab(el, tab);
  }

  _tab(el, tab) {
    el.querySelectorAll('.home-side button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const main = el.querySelector('.home-main');
    const g = this.game;
    if (tab === 'math') {
      let cur = resolveOptions(g.settings.math || {});
      main.innerHTML = `
        <div class="quest-card">
          <div class="quest-rank">中1 数学 ・ 正負の数／文字式／一次方程式</div>
          <h2>数式バトル</h2>
          <p class="quest-desc">行動のひとつひとつに問題と4つの答えがついている。<b>正しい答えをタップした瞬間に、その行動が出る。</b><br>時間は止まらない。敵は予告のあと必ず攻撃してくるので、間に合わなければダメージを受ける。<br><b>スペースキー</b>（または「集中」ボタン）で「集中」＝世界がスローになる（ゲージのぶんだけ。正解すると少し戻る）。</p>
          <label class="math-opt"><span>対戦する敵</span><select class="enemy-choice"><option value="zarva">焔角竜ザルヴァ</option><option value="sektra">熔晶竜セクトラ</option><option value="veira">蒼翼竜ヴェイラ</option>${NEW_BEAST_IDS.map(id => `<option value="${id}">${BESTIARY[id].name}｜${BESTIARY[id].field}</option>`).join('')}</select></label>
          <label class="math-opt"><span>戦う背景</span><select class="background-choice"><option value="auto">おすすめ（敵に合わせる）</option>${Object.entries(BATTLE_BACKGROUNDS).map(([id,b]) => `<option value="${id}">${b.name}</option>`).join('')}</select></label>
          <div class="math-go">
            <button class="big depart">はじめる</button>
            <div class="diff">難易度：
              ${Object.entries(PRESETS).map(([k, v]) => `<label><input type="radio" name="level" value="${k}"> ${v.label}</label>`).join('')}
              <label><input type="radio" name="level" value="custom"> カスタム</label>
            </div>
          </div>
          <div class="math-opts">
            ${Object.entries(OPTIONS).map(([k, d]) => `<label class="math-opt"><span>${d.label}</span><select data-o="${k}">${d.choices.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('')}</select></label>`).join('')}
          </div>
          <table class="quest-table">
            <tr><th>斬る</th><td>正負の数のかけ算・わり算</td></tr>
            <tr><th>溜め斬り</th><td>一次方程式（大ダメージ）</td></tr>
            <tr><th>左へ／右へ</th><td>正負の数のたし算・ひき算（左は答えが負、右は答えが正）</td></tr>
            <tr><th>回避</th><td>敵の攻撃が強いほど難しい問題。解ければその場で避けて、次の一撃が1.5倍</td></tr>
            <tr><th>回復</th><td>式の値（3回まで）</td></tr>
          </table>
          <div class="quest-hint">立ち位置は左・中央・右の3か所。<b>中央</b>は頭（弱点）、<b>左右</b>は敵ごとに違う部位を狙える。敵によって間合いとフィールドも変わる。<br>赤い円が出た場所に攻撃が来る。新しい10体はそれぞれ固有技を3つ使い、強力な大技も持つ。左右の部位を壊すと大技を封じられる。連続正解で攻撃が強くなり、ミスすると1秒動けない。<br>問題の難しさ「やさしい」は小さい数と1手の方程式、「むずかしい」は3つの数の計算・2乗・かっこつきの方程式。</div>
        </div>`;
      const show = () => {
        main.querySelector(`input[name=level][value="${cur.level}"]`).checked = true;
        main.querySelectorAll('[data-o]').forEach(sel => { sel.value = String(cur[sel.dataset.o]); });
        main.querySelector('.enemy-choice').value = cur.enemy;
        main.querySelector('.background-choice').value = cur.background;
      };
      const save = () => { const o = Object.assign({}, cur); delete o.seed; g.settings.math = o; g.saveSettings(); };
      show();
      main.querySelectorAll('input[name=level]').forEach(r => r.addEventListener('change', () => {
        if (r.value !== 'custom') cur = resolveOptions({ level: r.value, enemy: cur.enemy, background: cur.background });
        save(); show();
      }));
      main.querySelector('.enemy-choice').addEventListener('change', e => {
        cur.enemy = e.target.value;
        save();
      });
      main.querySelector('.background-choice').addEventListener('change', e => {
        cur.background = e.target.value;
        save();
      });
      main.querySelectorAll('[data-o]').forEach(sel => sel.addEventListener('change', () => {
        cur = resolveOptions(Object.assign({}, cur, { level: undefined, [sel.dataset.o]: sel.value }));
        save(); show();
      }));
      main.querySelector('.depart').addEventListener('click', () => { g.sfx('ui'); g.startMathBattle(cur); });
    } else if (tab === 'record') {
      main.innerHTML = `<div class="panel">${this._recordHtml()}</div>`;
    } else if (tab === 'help') {
      main.innerHTML = `<div class="panel help">${MATH_HELP}</div>`;
    } else if (tab === 'settings') {
      main.innerHTML = `<div class="panel">${this._settingsHtml()}</div>`;
      this._bindSettings(main);
    } else if (tab === 'credits') {
      main.innerHTML = `<div class="panel credits">${CREDITS_HTML}</div>`;
    }
  }

  // これまでの記録（この端末のブラウザに保存）
  _recordHtml() {
    const log = store.get('hunter.mathlog', []);
    if (!log.length) return '<h2>記録</h2><p>まだ記録はありません。数式バトルに挑戦しよう。</p>';
    const best = [['zarva', 'ザルヴァ'], ['sektra', 'セクトラ'], ['veira', 'ヴェイラ'], ...NEW_BEAST_IDS.map(id => [id, BESTIARY[id].short])].flatMap(([enemy, name]) =>
      Object.entries(PRESETS).map(([k, v]) => {
        const w = log.filter(x => x.win && x.level === k && (x.enemy || 'zarva') === enemy);
        return `<tr><th>${name}・${v.label}</th><td>${w.length ? `討伐 ${w.length}回　最速 ${fmtTime(Math.min(...w.map(x => x.time)))}` : 'まだ討伐していない'}</td></tr>`;
      })).join('');
    const tp = {};
    for (const x of log) for (const t of x.topics || []) { const o = tp[t.name] || (tp[t.name] = { n: 0, miss: 0 }); o.n += t.n; o.miss += t.miss || 0; }
    const topics = Object.entries(tp).map(([k, v]) => `<tr><th>${k}</th><td>正解 ${v.n}問・ミス ${v.miss}回（${v.n + v.miss ? Math.round(v.n / (v.n + v.miss) * 100) : 0}%）</td></tr>`).join('');
    const recent = log.slice(-8).reverse().map(x => `<tr><th>${x.date}</th><td>${x.win ? '討伐' : '失敗'}・${enemyShort(x.enemy)}・${x.levelLabel}・${fmtTime(x.time)}・正解 ${x.correct}問（${x.rate}%）</td></tr>`).join('');
    return `<h2>記録</h2>
      <table class="quest-table math-table">${best}</table>
      <h3>単元ごとの正解とミス（合計）</h3><table class="quest-table math-table topics">${topics}</table>
      <h3>最近のバトル</h3><table class="quest-table math-table">${recent}</table>
      <p class="tip">記録は、この端末のこのブラウザだけに保存されます。</p>`;
  }

  _settingsHtml() {
    const s = this.game.settings;
    return `<h2>設定</h2>
      <div class="set-row"><label>音量</label><input type="range" min="0" max="1" step="0.05" data-k="volume" value="${s.volume}"><span class="v">${Math.round(s.volume * 100)}</span></div>
      <div class="set-row"><label>BGM</label><input type="checkbox" data-k="bgm" ${s.bgm ? 'checked' : ''}></div>
      <div class="set-row"><label>画質</label><select data-k="quality">
        <option value="low" ${s.quality === 'low' ? 'selected' : ''}>軽い</option>
        <option value="mid" ${s.quality === 'mid' ? 'selected' : ''}>ふつう</option>
        <option value="high" ${s.quality === 'high' ? 'selected' : ''}>きれい</option></select><span class="v small">（すぐ反映）</span></div>
      <div class="set-row"><label>光のにじみ（重くなります）</label><input type="checkbox" data-k="bloom" ${s.bloom ? 'checked' : ''}></div>
      <div class="set-row"><label>ダメージ数値を表示</label><input type="checkbox" data-k="numbers" ${s.numbers ? 'checked' : ''}></div>
      <div class="set-row"><label>この端末の速さを測る</label><button class="bench-btn">測る（3秒）</button><span class="v bench-out"></span></div>`;
  }
  _bindSettings(root) {
    const g = this.game;
    // 端末チェック：いまの画質で3秒間の本当のコマ時間を測り、重ければ「軽い」を勧める
    const bb = root.querySelector('.bench-btn');
    if (bb) bb.addEventListener('click', () => {
      const out = root.querySelector('.bench-out');
      bb.disabled = true; out.textContent = '測っています…';
      g.frameTimes.length = 0;
      setTimeout(() => {
        const f = g.frameTimes.slice().sort((a, b) => a - b);
        const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length) * 1000, p95 = (f[Math.floor(f.length * 0.95)] || 0) * 1000;
        const fps = Math.round(1000 / Math.max(1, avg));
        let msg = `平均 ${fps} コマ/秒（遅い時で ${Math.round(1000 / Math.max(1, p95))}）`;
        if (avg > 34 && g.settings.quality !== 'low') {
          g.settings.quality = 'low'; g.settings.bloom = false; g.applySettings(); g.saveSettings();
          msg += ' → 重いので、画質を「軽い」にしました';
          const sel = root.querySelector('[data-k=quality]'); if (sel) sel.value = 'low';
        } else msg += avg > 34 ? ' → 重め。それでも答えの判定は時間どおりに動きます' : avg > 20 ? ' → 遊べます' : ' → なめらかです';
        out.textContent = msg; bb.disabled = false;
        g.lastBench = { fps, p95Ms: Math.round(p95), quality: g.settings.quality };
      }, 3000);
    });
    root.querySelectorAll('[data-k]').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? parseFloat(inp.value) : inp.value;
        g.settings[k] = v;
        const out = inp.parentElement.querySelector('.v');
        if (out && inp.type === 'range') out.textContent = k === 'volume' ? Math.round(v * 100) : v;
        g.applySettings();
        g.saveSettings();
      });
    });
  }

  pause() {
    const el = this._screen('pause', `
      <div class="pause-box">
        <h2>一時停止</h2>
        <button class="big resume">バトルに戻る</button>
        <button data-p="help">遊び方</button>
        <button data-p="settings">設定</button>
        <button data-p="retire" class="danger">リタイアして拠点へ</button>
        <div class="pause-sub"></div>
      </div>`);
    const sub = el.querySelector('.pause-sub');
    el.querySelector('.resume').addEventListener('click', () => { this.game.sfx('ui'); this.game.resume(); });
    el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
      this.game.sfx('ui');
      const p = b.dataset.p;
      if (p === 'help') sub.innerHTML = `<div class="panel help">${MATH_HELP}</div>`;
      else if (p === 'settings') { sub.innerHTML = `<div class="panel">${this._settingsHtml()}</div>`; this._bindSettings(sub); }
      else if (p === 'retire') {
        sub.innerHTML = `<div class="panel"><p>バトルをやめて拠点に戻りますか？</p><button class="danger yes">リタイアする</button> <button class="no">やめる</button></div>`;
        sub.querySelector('.yes').addEventListener('click', () => this.game.retire());
        sub.querySelector('.no').addEventListener('click', () => { sub.innerHTML = ''; });
      }
    }));
  }

  result(r) {
    const rows = r.rewards.map(x => `<li><span class="rw-name">${x.name}</span><span class="rw-src">${x.src}</span></li>`).join('');
    const el = this._screen('result ' + (r.success ? 'ok' : 'ng'), `
      <div class="result-box">
        <div class="result-head">${r.success ? 'QUEST CLEAR' : 'QUEST FAILED'}</div>
        <h2>${r.success ? 'クエストクリア！' : 'クエスト失敗…'}</h2>
        <div class="result-reason">${r.reason}</div>
        <table class="quest-table">
          <tr><th>かかった時間</th><td>${fmtTime(r.time)}</td></tr>
          <tr><th>力尽きた回数</th><td>${r.carts}回</td></tr>
          ${r.success ? `<tr><th>報酬金</th><td>${r.money.toLocaleString()} G</td></tr>` : ''}
          ${r.breaks ? `<tr><th>部位破壊</th><td>${r.breaks}</td></tr>` : ''}
        </table>
        ${r.success ? `<h3>手に入れた素材</h3><ul class="rewards">${rows || '<li>なし</li>'}</ul>` : ''}
        <button class="big back">拠点へ戻る</button>
      </div>`);
    el.querySelector('.back').addEventListener('click', () => { this.game.sfx('ui'); this.game.goHome(); });
  }

  // 数式バトルの結果
  mathResult(r) {
    const topics = r.topics.map(t => `<tr><th>${t.name}</th><td>正解 ${t.n}問${t.miss ? `・ミス ${t.miss}回` : ''}${t.n ? `　平均 ${t.avg.toFixed(1)}秒` : ''}</td></tr>`).join('');
    const num = v => String(v).replace('-', '−');
    const missed = (r.missed || []).slice(0, 20).map(m => `<tr><th>${m.text}</th><td>正解 <b>${m.isX ? 'x = ' : ''}${num(m.answer)}</b>　<small>（選んだ答え ${num(m.chosen)}）</small></td></tr>`).join('');
    const el = this._screen('result ' + (r.win ? 'ok' : 'ng'), `
      <div class="result-box">
        <div class="result-head">${r.win ? 'BATTLE CLEAR' : 'BATTLE FAILED'}</div>
        <h2>${r.win ? '討伐成功！' : '討伐失敗…'}</h2>
        <div class="result-reason">${r.reason}${r.win ? '' : `（敵の体力 残り${r.monsterLeft}%）`}</div>
        <table class="quest-table math-table">
          <tr><th>かかった時間</th><td>${fmtTime(r.time)}（難易度：${r.level}）</td></tr>
          <tr><th>正解</th><td>${r.correct}問（ミス ${r.miss}回・正答率 ${r.rate}%）</td></tr>
          <tr><th>1問の平均</th><td>${r.avg.toFixed(1)}秒</td></tr>
          <tr><th>最大の連続正解</th><td>${r.maxCombo}問</td></tr>
          <tr><th>受けた攻撃</th><td>${r.hitsTaken}回（回避 ${r.dodges}回・移動でかわした ${r.sidesteps}回・止めた ${r.stopped}回）</td></tr>
          <tr><th>スローを使った時間</th><td>${r.slowUsed.toFixed(1)}秒</td></tr>
        </table>
        <div class="result-btns"><button class="big again">もう一度</button> <button class="back">拠点へ戻る</button></div>
        ${missed ? `<h3>まちがえた問題</h3><table class="quest-table math-table topics">${missed}</table>` : ''}
        ${topics ? `<h3>解いた問題</h3><table class="quest-table math-table topics">${topics}</table>` : ''}
        <h3>設定</h3><table class="quest-table math-table topics">${r.setup.map(x => `<tr><th>${x[0]}</th><td>${x[1]}</td></tr>`).join('')}</table>
      </div>`);
    el.querySelector('.again').addEventListener('click', () => { this.game.sfx('ui'); this.game.startMathBattle(r.opts); });
    el.querySelector('.back').addEventListener('click', () => { this.game.sfx('ui'); this.game.goHome(); });
  }

  loading(text) {
    this._screen('loading', `<div class="loading-box"><div class="spinner"></div><div>${text}</div></div>`);
  }
}
