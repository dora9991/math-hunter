import { CHAPTERS, QUESTS, PEOPLE, FACILITIES, EQUIPMENT, MATERIALS } from './adventure.js';
import { enemyName } from './bestiary.js';
import { fmtTime } from './util.js';
import { regionArt, villageArt, portrait } from './adventureArt.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const costText = values => Object.entries(values).map(([k, n]) => `<span class="material ${k}"><i></i>${MATERIALS[k]} <b>${n}</b></span>`).join('');
const heading = (small, title, text = '') => `<div class="adv-heading"><div class="eyebrow">${small}</div><h2>${title}</h2>${text ? `<p>${text}</p>` : ''}</div>`;

export class AdventureUI {
  constructor(menus) { this.menus = menus; this.game = menus.game; }
  get adventure() { return this.game.adventure; }
  get state() { return this.adventure.state; }
  render(main, tab) {
    this.main = main;
    if (tab === 'village') this.village();
    else if (tab === 'map') this.map();
    else if (tab === 'workshop') this.workshop();
    else if (tab === 'journal') this.journal();
    main.scrollTop = 0;
  }
  refresh(tab) { this.menus.home(tab); }
  toast(text) {
    this.menus.root.querySelector('.adv-toast')?.remove();
    const el = document.createElement('div'); el.className = 'adv-toast'; el.setAttribute('role', 'status'); el.textContent = text;
    this.menus.root.appendChild(el); setTimeout(() => el.remove(), 3200);
  }
  village() {
    const a = this.adventure, next = a.nextQuest, done = a.chaptersDone;
    this.main.innerHTML = `<div class="village-page">
      ${heading('HOME · THE SIX LIGHTS', 'リュミエ村', done === 6 ? '六つの灯と、新しい朝。ここがあなたの帰る場所。' : '狩りの先に、誰かの暮らしが戻ってくる。')}
      <div class="village-view">${villageArt(a)}<div class="village-location"><span class="live-dot"></span> ${done === 0 ? '小さなギルドの村' : `${done}つの理石に、灯が戻った`}</div>
        ${FACILITIES.map(f => `<button class="village-spot ${a.facility(f.id) ? 'built' : ''}" style="left:${f.x}%;top:${f.y}%" data-facility="${f.id}" aria-label="${f.name}：${a.facility(f.id) ? '完成' : `第${f.chapter}章で復興`}"><i></i><span>${f.name}</span></button>`).join('')}
      </div>
      <div class="village-bottom"><section class="next-request"><div class="eyebrow">${next ? 'NEXT REQUEST · 次の依頼' : 'STORY COMPLETE'}</div><h3>${next?.name || '冒険は、これからも続く'}</h3><p>${next?.brief || 'すべての地域に灯が戻りました。依頼を再び受け、装具を変えながら狩猟図鑑を完成させよう。'}</p><button class="primary next-quest">${next ? '依頼を確認する' : '世界地図を開く'}<span>→</span></button></section>
      <section class="village-progress"><div class="eyebrow">VILLAGE RESTORATION</div><h3>村の復興 <b>${done + 1}<small> / 7</small></b></h3><div class="restoration-steps">${FACILITIES.map(f => `<span class="${a.facility(f.id) ? 'done' : ''}" title="${f.name}"></span>`).join('')}</div><p>${done < 6 ? `次の復興：${FACILITIES[done + 1].name}<br>${FACILITIES[done + 1].desc}` : '六灯の広場が完成。旅の記録は、図鑑に残っています。'}</p><button class="text-btn open-workshop">装具を整える →</button></section></div>
      <div class="people-row">${Object.entries(PEOPLE).map(([id, p]) => `<button class="person-card" data-person="${id}"><span class="portrait">${portrait(id)}</span><span><small>${p.role}</small><b>${p.name}</b><em>話を聞く →</em></span></button>`).join('')}</div>
      <p class="save-note">${a.saveFailed ? '端末への保存ができません。ブラウザの保存設定をご確認ください。' : '進行状況は、この端末のブラウザに自動保存されます。'}</p>
    </div>`;
    this.main.querySelector('.next-quest').onclick = () => next ? this.quest(next.id) : this.refresh('map');
    this.main.querySelector('.open-workshop').onclick = () => this.refresh('workshop');
    this.main.querySelectorAll('[data-facility]').forEach(b => b.onclick = () => {
      const f = FACILITIES.find(f => f.id === b.dataset.facility);
      this.dialogue([{ person: f.id === 'forge' ? 'gan' : 'mira', title: f.name, text: a.facility(f.id) ? f.desc : `今はまだ、ここにあった建物の跡だけ。第${f.chapter}章を終えると、${f.name}が村に戻ってきます。` }]);
    });
    this.main.querySelectorAll('[data-person]').forEach(b => b.onclick = () => {
      const id = b.dataset.person, p = PEOPLE[id];
      const text = id === 'gan' && !a.facility('forge') ? 'ガンは、森へ続く石門の向こうで足止めされている。街道と石門を取り戻せば、村に鍛冶屋が戻ってくるはずだ。'
        : id === 'toma' && done === 0 ? '昔、六つの理石を調べるために旅立った隊がいた。私も、その隊に地図を渡したんだ。誰も帰らないまま、道だけが荒れてしまった。'
          : done === 6 ? '村に戻ってきた人たちが、みんな君の話をしている。次はどんな狩りに出ようか。' : p.line;
      this.dialogue([{ person: id, text }]);
    });
  }
  map() {
    const a = this.adventure;
    this.main.innerHTML = `<div class="atlas-page">${heading('FIELD ATLAS', '六つの理石をめぐる旅', '道を開くたびに、新しい依頼と村の仲間が待っている。')}
      <div class="journey-progress"><span>物語の進行</span><div><i style="width:${this.state.completed.length / QUESTS.length * 100}%"></i></div><b>${this.state.completed.length} / ${QUESTS.length}</b></div>
      <div class="chapter-grid">${CHAPTERS.map((c, i) => {
        const qs = QUESTS.filter(q => q.chapter === i), open = a.available(qs[0].id), n = qs.filter(q => this.state.completed.includes(q.id)).length;
        return `<button class="chapter-card ${open ? '' : 'locked'} ${n === qs.length ? 'cleared' : ''}" data-chapter="${i}" ${open ? '' : 'disabled'} style="--chapter-color:${c.color}">${regionArt(c.id, c.name)}<div class="chapter-number">${c.no}</div><div class="chapter-copy"><small>${open ? n === qs.length ? '理石の灯が戻った' : `依頼 ${n} / ${qs.length}` : '前の地域をクリアすると開放'}</small><h3>${c.name}</h3><p>${c.title}</p></div><span class="chapter-arrow">${open ? '↗' : '◇'}</span></button>`;
      }).join('')}</div></div>`;
    this.main.querySelectorAll('[data-chapter]').forEach(b => b.onclick = () => this.chapter(Number(b.dataset.chapter)));
  }
  chapter(index) {
    const c = CHAPTERS[index], qs = QUESTS.filter(q => q.chapter === index);
    if (!c || !this.adventure.available(qs[0]?.id)) return;
    this.main.innerHTML = `<div class="chapter-page"><button class="text-btn map-back">← 世界地図へ</button><div class="region-banner">${regionArt(c.id, c.name)}<div><span class="eyebrow">CHAPTER ${c.no}</span><h2>${c.name}</h2><p>${c.subtitle}</p></div></div>
      <div class="quest-list">${qs.map((q, i) => { const open = this.adventure.available(q.id), done = this.state.completed.includes(q.id); return `<button class="quest-entry ${done ? 'done' : ''}" data-quest="${q.id}" ${open ? '' : 'disabled'}><span class="quest-step">${done ? '✓' : String(i + 1).padStart(2, '0')}</span><span class="quest-entry-copy"><small>${q.boss ? 'KEY QUEST · 章の決戦' : 'GUILD REQUEST · ギルド依頼'}</small><b>${q.name}</b><em>${open ? enemyName(q.enemy) : '前の依頼を達成すると開放'}</em></span><span>→</span></button>`; }).join('')}</div><p class="save-note">達成済みの依頼も、装具と難易度を変えて再び受けられます。</p></div>`;
    this.main.querySelector('.map-back').onclick = () => this.map();
    this.main.querySelectorAll('[data-quest]').forEach(b => b.onclick = () => this.quest(b.dataset.quest));
    this.main.scrollTop = 0;
  }
  quest(id) {
    const q = QUESTS.find(q => q.id === id);
    if (!q || !this.adventure.available(id)) return;
    this.game.homeTab = 'quest';
    if (this.game.settings.bgm) this.game.audio.bgm('prebattle');
    const c = CHAPTERS[q.chapter], sites = this.state.investigations[id] || [], equipped = this.adventure.equipment();
    this.main.innerHTML = `<div class="quest-prep" data-quest-id="${q.id}"><button class="text-btn chapter-back">← ${c.name}の依頼へ</button>
      <div class="region-banner compact">${regionArt(q.background || c.id, q.place)}<div><span class="eyebrow">${q.boss ? 'KEY QUEST' : 'GUILD REQUEST'} · CHAPTER ${c.no}</span><h2>${q.name}</h2><p>${q.place}</p></div></div>
      <div class="quest-brief"><span class="portrait">${portrait('mira')}</span><div><small>調査士 ミラからの依頼</small><p>${q.brief}</p></div></div>
      <details class="field-guide" ${q.id === 'road' ? 'open' : ''}><summary>狩りの操作を確認する</summary><p>画面下で行動を選び、4択の答えをタップすると狩人が動きます。赤い攻撃予告が出たら左右へ移動するか、「回避」の問題を解こう。「集中」を押すと、考える時間を作れます。</p></details>
      <div class="section-title"><h3>出発前の現地調査</h3><span>任意 · ${sites.length} / 2 記録済み</span></div><div class="research-sites">
        <button class="research-card ${sites.includes('trace') ? 'recorded' : ''}" data-site="trace"><span class="research-symbol">⌁</span><div><small>OBSERVATION</small><b>${q.trace}</b><p>${sites.includes('trace') ? '調査済み · 部位への蓄積 +15%' : '痕跡から敵の攻撃と部位を調べる'}</p></div><em>${sites.includes('trace') ? '✓' : '→'}</em></button>
        <button class="research-card ${sites.includes('rune') ? 'recorded' : ''}" data-site="rune"><span class="research-symbol">⌖</span><div><small>FIELD PUZZLE</small><b>${q.puzzle}</b><p>${sites.includes('rune') ? '調査済み · 集中 +2秒' : '仕掛けを解き、狩りの準備を整える'}</p></div><em>${sites.includes('rune') ? '✓' : '→'}</em></button>
      </div>
      <div class="prep-bottom"><section><div class="section-title"><h3>持っていく装具</h3><button class="text-btn prepare-gear">鍛冶屋へ →</button></div><div class="loadout-options">${EQUIPMENT.filter(e => this.state.crafted.includes(e.id)).map(e => `<button data-loadout="${e.id}" class="${equipped.id === e.id ? 'selected' : ''}" aria-pressed="${equipped.id === e.id}"><i style="background:${e.color}"></i>${e.name}${equipped.id === e.id ? '<span>装備中</span>' : ''}</button>`).join('')}</div><p class="loadout-description">${equipped.detail}</p></section>
      <section class="quest-rewards"><div class="eyebrow">${this.state.completed.includes(id) ? '再挑戦の報酬は初回の40%' : 'FIRST CLEAR REWARD'}</div><h3>依頼の報酬</h3><div class="materials">${costText(q.reward)}</div><small>部位を壊すと理石のかけらを追加で獲得。</small></section></div>
      <div class="expedition-bar"><label>難易度 <select class="adventure-difficulty" aria-label="冒険の難易度"><option value="easy">やさしい</option><option value="normal">ふつう</option><option value="hard">むずかしい</option></select></label><span>どの難易度でも物語は進みます</span><button class="primary depart-adventure">${enemyName(q.enemy)}を狩る <b>→</b></button></div>
    </div>`;
    this.main.querySelector('.chapter-back').onclick = () => this.chapter(q.chapter);
    this.main.querySelectorAll('[data-site]').forEach(b => b.onclick = () => this.research(q, b.dataset.site));
    this.main.querySelector('.prepare-gear').onclick = () => this.refresh('workshop');
    this.main.querySelectorAll('[data-loadout]').forEach(b => b.onclick = () => { this.adventure.equip(b.dataset.loadout); this.quest(id); });
    const select = this.main.querySelector('.adventure-difficulty'); select.value = this.state.difficulty;
    select.onchange = () => this.adventure.setDifficulty(select.value);
    this.main.querySelector('.depart-adventure').onclick = () => this.game.startAdventureQuest(id);
    this.main.scrollTop = 0;
  }
  research(q, site) {
    if (site === 'trace') {
      this.dialog(`<span class="eyebrow">FIELD NOTES · 痕跡の調査</span><h2>${q.trace}</h2><div class="clue-sketch"><span>⌁</span><i></i><span>◇</span></div><p>${q.clue}</p><div class="research-benefit">部位への蓄積ダメージ +15%<small>この依頼の再挑戦でも有効</small></div><button class="primary record-trace">調査を記録する →</button>`, (root, close) => {
        root.querySelector('.record-trace').onclick = () => { this.adventure.investigate(q.id, 'trace'); close(); this.quest(q.id); this.toast('痕跡を記録しました。左右の部位も狙ってみよう。'); };
      });
      return;
    }
    this.dialog(`<span class="eyebrow">FIELD PUZZLE · 仕掛けの調査</span><h2>${q.puzzle}</h2><div class="puzzle-rune">− &nbsp; ◇ &nbsp; ＋</div><p class="puzzle-question">${q.question}</p><div class="puzzle-choices">${q.choices.map(v => `<button data-answer="${v}">${String(v).replace('-', '−')}</button>`).join('')}</div><p class="puzzle-feedback" role="status">何度でも試せます。調査せず出発することもできます。</p><button class="text-btn puzzle-hint">ミラにヒントを聞く</button><p class="puzzle-hint-copy hidden">${q.hint}</p><div class="research-benefit">成功すると、集中ゲージ +2秒</div>`, (root, close) => {
      root.querySelector('.puzzle-hint').onclick = () => root.querySelector('.puzzle-hint-copy').classList.remove('hidden');
      root.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => {
        if (!this.adventure.investigate(q.id, 'rune', b.dataset.answer)) {
          root.querySelector('.puzzle-feedback').textContent = 'まだ釣り合わないようだ。ヒントを見て、もう一度考えてみよう。';
          b.classList.add('wrong'); return;
        }
        b.classList.add('correct');
        root.querySelector('.puzzle-feedback').textContent = '仕掛けが動いた！ 調査を記録しました。集中 +2秒。';
        root.querySelectorAll('[data-answer]').forEach(x => x.disabled = true);
        const done = document.createElement('button'); done.className = 'primary'; done.textContent = '準備画面へ戻る →';
        done.onclick = () => { close(); this.quest(q.id); }; root.appendChild(done); done.focus();
      });
    }, () => this.quest(q.id));
  }
  workshop() {
    const a = this.adventure, open = a.facility('forge');
    this.main.innerHTML = `<div class="workshop-page">${heading('GANN’S WORKSHOP', 'ガンの鍛冶屋', '自分の狩り方に合わせて、装具を選ぼう。')}
      <div class="smith-note"><span class="portrait">${portrait('gan')}</span><p>${open ? '素材がそろったら、俺に任せろ。部位を壊すか、反撃で仕留めるか、考える時間を作るか。道具を選ぶのも狩りのうちだ。' : '第1章「帰り道に灯を」を終えると、鍛冶屋が村に戻ります。街道と石門を取り戻そう。'}</p></div>
      <div class="materials inventory">${costText(this.state.materials)}</div><div class="equipment-grid">${EQUIPMENT.map(e => {
        const owned = this.state.crafted.includes(e.id), on = this.state.equipped === e.id;
        return `<article class="equipment-card ${on ? 'equipped' : ''}" style="--gear-color:${e.color}"><div class="equipment-symbol">${e.id === 'breaker' ? '⟐' : e.id === 'counter' ? '↗' : e.id === 'focus' ? '✧' : '◇'}</div><span class="eyebrow">${e.type}</span><h3>${e.name}</h3><p>${e.desc}</p><div class="equipment-effect">${e.detail}</div><div class="materials gear-cost">${owned ? '<span>製作済み</span>' : costText(e.cost)}</div>${owned ? `<button data-equip="${e.id}" class="${on ? 'selected' : ''}" ${on ? 'disabled' : ''}>${on ? '✓ 装備中' : '装備する'}</button>` : `<button data-craft="${e.id}" ${a.canCraft(e.id) ? '' : 'disabled'}>${!open ? '鍛冶屋の復興が必要' : a.canCraft(e.id) ? '製作して装備する' : '素材が足りません'}</button>`}</article>`;
      }).join('')}</div><p class="save-note">装具と村の支援は、冒険の依頼で有効になります。自由狩猟は従来の設定で遊べます。</p></div>`;
    this.main.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => { if (a.craft(b.dataset.craft)) { this.workshop(); this.menus.updateAdventureStatus(); this.toast('装具が完成しました。次の冒険から使えます。'); } });
    this.main.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => { if (a.equip(b.dataset.equip)) { this.workshop(); this.toast('装具を変更しました。'); } });
  }
  journal() {
    const seen = Object.keys(this.state.journal).length;
    this.main.innerHTML = `<div class="journal-page">${heading('HUNTER’S FIELD JOURNAL', '狩猟図鑑', `出会った魔獣、見た攻撃、壊した部位。あなたの冒険が記録になる。 ${seen} / 13 種を発見`)}
      <div class="journal-grid">${QUESTS.map(q => { const j = this.state.journal[q.enemy], c = CHAPTERS[q.chapter]; return `<article class="journal-entry ${j ? 'discovered' : ''}"><div class="journal-crest" style="--chapter-color:${c.color}">${j ? c.no : '？'}</div><div class="journal-details"><small>${c.name}</small><h3>${j ? enemyName(q.enemy) : 'まだ出会っていない魔獣'}</h3>${j ? `<div class="journal-stats">討伐 ${j.kills} 回${j.best ? ` · 最速 ${fmtTime(j.best)}` : ''}</div><p>${j.attacks.length ? `観察した攻撃：${j.attacks.map(esc).join(' ／ ')}` : '攻撃を観察すると、ここに記録されます。'}</p><p>${j.breaks.length ? `部位破壊：${j.breaks.map(esc).join(' ／ ')}` : '破壊した部位の記録はまだありません。'}</p><details><summary>生態調査の手がかり</summary><p>${(this.state.investigations[q.id] || []).includes('trace') ? q.clue : '依頼の現地調査で、痕跡を調べよう。'}</p></details>` : '<p>世界地図から依頼を進めよう。</p>'}</div></article>`; }).join('')}</div></div>`;
  }
  resultHTML(result) {
    const r = result.adventure, q = QUESTS.find(q => q.id === r?.questId);
    if (!q) return '';
    const f = FACILITIES.find(f => f.id === r.facility);
    return `<div class="adventure-reward"><span class="eyebrow">${r.ending ? 'THE SIX LIGHTS · 物語クリア' : r.first ? 'REQUEST COMPLETE · 初回達成' : result.win ? 'REQUEST COMPLETE · 再挑戦' : 'FIELD REPORT'}</span><h3>${q.name}</h3>${result.win ? `<div class="materials">${costText(r.reward)}</div>${f ? `<div class="facility-unlocked">✧ ${f.name}が完成！<small>${f.desc}</small></div>` : ''}` : '<p>失った素材はありません。観察した攻撃は図鑑に記録されました。調査や装具を見直して、もう一度挑もう。</p>'}</div>`;
  }
  showArrival() {
    if (!this.state.introSeen) {
      this.dialogue([
        { person: 'mira', title: '序章 · 青い灯の消えた夜', text: '数や図形の法則を宿した「理石」が、六つの土地の釣り合いを守る世界。ある夜、理石の灯が消え、魔獣たちが暴れ始めた。' },
        { person: 'toma', title: '帰ってこなかった人たち', text: '昔、理石を調べるために旅立ったハンター隊がいた。彼らの足跡を追えれば、何が起きたのか分かるかもしれない。だが今は、村への街道さえ閉ざされている。' },
        { person: 'mira', title: '最初の依頼', text: 'あなたは、リュミエ村の新人ハンター。まずは草原を調べ、荷馬車が帰れる道を取り戻そう。痕跡と仕掛けを調べれば、狩りの助けになるはず。さあ、最初の一歩へ。' },
      ], () => this.adventure.seenIntro());
    } else if (this.state.pendingStory) {
      const q = QUESTS.find(q => q.id === this.state.pendingStory);
      if (q) this.dialogue(q.report.map((text, i) => ({ person: i % 2 ? 'mira' : q.id === 'gate' ? 'gan' : 'toma', title: i === 0 ? `依頼の報告 · ${q.name}` : q.id === 'sixlights' ? '六つの理石と、新しい朝' : CHAPTERS[q.chapter].title, text })), () => this.adventure.acknowledgeStory());
    }
  }
  dialogue(pages, onDone = () => {}) {
    let at = 0;
    const show = () => {
      const page = pages[at], person = PEOPLE[page.person || 'mira'];
      this.dialog(`<div class="dialogue-person"><span class="portrait">${portrait(page.person || 'mira')}</span><div><small>${person.role}</small><b>${person.name}</b></div><span>${at + 1} / ${pages.length}</span></div>${page.title ? `<h2>${page.title}</h2>` : ''}<p class="dialogue-copy">${page.text}</p><div class="dialogue-buttons"><button class="text-btn story-skip">閉じる</button><button class="primary story-next">${at + 1 === pages.length ? '旅を続ける' : '次へ'} →</button></div>`, (root, close) => {
        root.querySelector('.story-skip').onclick = () => { close(); onDone(); };
        root.querySelector('.story-next').onclick = () => { close(); if (++at < pages.length) show(); else onDone(); };
      }, onDone);
    };
    show();
  }
  dialog(html, bind, onDismiss = () => {}) {
    this.closeDialog?.();
    const prior = document.activeElement;
    const overlay = document.createElement('div'); overlay.className = 'adv-dialog-backdrop';
    overlay.innerHTML = `<section class="adv-dialog" role="dialog" aria-modal="true" aria-label="冒険の会話と調査"><button class="dialog-close" aria-label="閉じる">×</button>${html}</section>`;
    this.menus.root.appendChild(overlay);
    const close = () => { overlay.remove(); window.removeEventListener('keydown', key, true); this.closeDialog = null; if (prior?.isConnected) prior.focus(); };
    const key = e => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); onDismiss(); }
      if (e.key === 'Tab') {
        const items = [...overlay.querySelectorAll('button:not(:disabled), select, summary')].filter(x => !x.closest('.hidden'));
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    this.closeDialog = close;
    overlay.querySelector('.dialog-close').onclick = () => { close(); onDismiss(); };
    bind?.(overlay.querySelector('.adv-dialog'), close);
    (overlay.querySelector('.primary') || overlay.querySelector('button')).focus();
  }
}
