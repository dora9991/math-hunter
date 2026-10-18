import { SIDE_STORIES, MONSTER_QUESTS, CHAPTERS, PEOPLE, MATERIALS, ANOMALIES } from './adventure.js';
import { enemyName } from './bestiary.js';
import { portrait, regionArt } from './adventureArt.js';
const resources = r => Object.entries(r).map(([k,v])=>`${MATERIALS[k]} ${v}`).join(' ／ ');

export class GuildUI {
  constructor(owner) { this.owner=owner; this.tab='stories'; this.enemy='raizen'; this.tier=1; this.condition='normal'; }
  get a() { return this.owner.adventure; }
  get s() { return this.a.state; }
  render(tab=this.tab) {
    this.tab=tab; const rank=this.a.rank, next=rank*rank*100;
    this.owner.main.innerHTML=`<div class="guild-page"><div class="adv-heading"><div class="eyebrow">HUNTERS’ GUILD</div><h2>ギルドの長い旅</h2><p>仲間の物語、狩りの評価、まだ知らない強敵。次の目標を自分で選ぼう。</p></div>
      <div class="guild-rank"><div><small>HUNTER RANK</small><b>HR ${rank}</b></div><p>依頼と討究の勝利で経験を積む。<span>${this.s.rankXP} XP${rank<20?` ／ 次のランク ${next} XP`:' ／ 最高ランク'}</span></p></div>
      <div class="guild-tabs" role="group" aria-label="ギルドの活動"><button data-guild="stories" class="${tab==='stories'?'on':''}">仲間の外伝 <small>${this.s.sideCompleted.length} / ${SIDE_STORIES.length}</small></button><button data-guild="anomaly" class="${tab==='anomaly'?'on':''}">異変討究 <small>Lv.1–20</small></button><button data-guild="merits" class="${tab==='merits'?'on':''}">勲功と称号 <small>${this.s.claimed.length} / ${this.a.milestones().length}</small></button></div><div class="guild-content"></div></div>`;
    this.owner.main.querySelectorAll('[data-guild]').forEach(b=>b.onclick=()=>this.render(b.dataset.guild));
    const body=this.owner.main.querySelector('.guild-content');
    if(tab==='stories')this.stories(body);else if(tab==='anomaly')this.anomaly(body);else this.merits(body);
    this.owner.menus.updateAdventureStatus();
  }
  stories(body) {
    body.innerHTML=`<p class="guild-intro">本編とは別に進む、4人それぞれの三つの物語。達成すると勲章を受け取り、装具の強化にも使えます。</p>${Object.entries(PEOPLE).map(([id,p])=>`<section class="companion-story"><header><span class="portrait">${portrait(id)}</span><div><small>${p.role}</small><h3>${p.name}</h3></div></header><div class="side-quest-list">${SIDE_STORIES.filter(q=>q.person===id).map(q=>{const open=this.a.available(q.id),done=this.s.sideCompleted.includes(q.id);return `<button data-side="${q.id}" ${open?'':'disabled'}><span class="side-story-state">${done?'✓':open?'◇':'—'}</span><span><b>${q.name}</b><small>${open?`${enemyName(q.enemy)}${this.s.medals[q.id]?` ／ 評価 ${this.s.medals[q.id]}`:''}`:`第${q.unlock}章クリア${q.requires?'・前の外伝達成':''}で開放`}</small></span><em>→</em></button>`;}).join('')}</div></section>`).join('')}`;
    body.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>this.owner.quest(b.dataset.side));
  }
  anomaly(body) {
    if(!this.a.firstArcDone){body.innerHTML=`<div class="guild-locked"><span>◇</span><h3>六つの理石の先に</h3><p>第6章をクリアすると異変討究が開放されます。個体ごとにLv.1から挑戦し、Lv.20を目指す特別な狩りです。勲章と古代核が手に入り、装具をさらに強化できます。</p></div>`;return;}
    const choices=MONSTER_QUESTS.filter(q=>this.s.journal[q.enemy]);
    if(!choices.length){body.innerHTML='<div class="guild-locked"><h3>討究する魔獣を探そう</h3><p>世界地図から依頼へ出発すると、その魔獣が討究に追加されます。</p></div>';return;}
    if(!choices.some(q=>q.enemy===this.enemy))this.enemy=choices[0].enemy;
    const q=choices.find(q=>q.enemy===this.enemy), c=CHAPTERS[q.chapter], high=this.s.anomalies[this.enemy]||0, max=Math.min(20,high+1);
    this.tier=Math.max(1,Math.min(this.tier,max));const cond=ANOMALIES[this.condition], key=`${this.enemy}:${this.tier}:${this.condition}:${this.s.difficulty}`;
    body.innerHTML=`<div class="anomaly-intro">${regionArt(c.art||c.background||c.id,c.name)}<div><span class="eyebrow">ANOMALY INVESTIGATION</span><h3>限界を、一つずつ越える。</h3><p>勝つと同じ敵の次のLvが開放。物語の進行には影響しません。</p></div></div>
      <div class="anomaly-controls"><label>討究する魔獣<select class="anomaly-enemy">${choices.map(x=>`<option value="${x.enemy}">${enemyName(x.enemy)} ／ 最高Lv.${this.s.anomalies[x.enemy]||0}</option>`).join('')}</select></label><label>討究Lv<select class="anomaly-tier">${Array.from({length:max},(_,i)=>`<option value="${i+1}">Lv.${i+1}${i+1>high?' ／ 未踏の強さ':''}</option>`).join('')}</select></label><label>問題と基本難易度<select class="anomaly-difficulty"><option value="easy">やさしい</option><option value="normal">ふつう</option><option value="hard">むずかしい</option></select></label></div>
      <div class="anomaly-mutations">${Object.entries(ANOMALIES).map(([id,m])=>`<button data-mutation="${id}" class="${id===this.condition?'selected':''}" aria-pressed="${id===this.condition}"><b>${m.name}</b><p>${m.desc}</p></button>`).join('')}</div>
      <div class="anomaly-summary"><div><small>${enemyName(this.enemy)}</small><h3>異変討究 Lv.${this.tier}</h3><p>体力 ×${((1+this.tier*.1)*cond.hp).toFixed(2)} ／ 攻撃 ×${((1+this.tier*.06)*cond.damage).toFixed(2)}<br>今回の組み合わせの最高評価：${this.s.challengeMedals[key]||'未達成'}</p></div><div><small>確定報酬</small><p>ギルド貨・鉄鉱石・理石のかけら・勲章<br>${this.tier>=5?'Lv.5以上では古代核も獲得。':'Lv.5から古代核も獲得できる。'}</p><span>敗北しても所持素材と討究Lvは減りません。</span></div></div>
      <button class="primary depart-anomaly">${cond.name}に挑む · Lv.${this.tier} <span>→</span></button><details class="medal-guide"><summary>達成評価の条件を見る</summary><p>S：正答率95%以上・8問以上正解・被弾0回・3分30秒以内。<br>A：正答率85%以上・8問以上正解。B：討伐成功。<br>討究の評価は、敵・Lv・個体・基本難易度ごとに保存します。</p></details>`;
    const enemy=body.querySelector('.anomaly-enemy');enemy.value=this.enemy;enemy.onchange=()=>{this.enemy=enemy.value;this.tier=Math.min(20,(this.s.anomalies[this.enemy]||0)+1);this.render('anomaly');};
    const tier=body.querySelector('.anomaly-tier');tier.value=this.tier;tier.onchange=()=>{this.tier=Number(tier.value);this.render('anomaly');};
    const diff=body.querySelector('.anomaly-difficulty');diff.value=this.s.difficulty;diff.onchange=()=>{this.a.setDifficulty(diff.value);this.render('anomaly');};
    body.querySelectorAll('[data-mutation]').forEach(b=>b.onclick=()=>{this.condition=b.dataset.mutation;this.render('anomaly');});
    body.querySelector('.depart-anomaly').onclick=()=>this.owner.game.startAnomaly(this.enemy,this.tier,this.condition);
  }
  merits(body) {
    body.innerHTML=`<p class="guild-intro">達成した勲功から報酬を受け取ると、称号を名乗れます。報酬は一度だけ。装具強化に使う勲章や古代核を、旅の節目にも受け取ろう。</p><div class="merit-grid">${this.a.milestones().map(m=>`<article class="merit-card ${m.ready?'ready':''}"><div class="merit-emblem">${m.claimed?'✧':m.ready?'◇':'·'}</div><div><h3>${m.name}</h3><small>${Math.min(m.value,m.target)} / ${m.target}${m.id==='perfect'?' · 本編・外伝のS評価':''}</small><div class="merit-progress"><i style="width:${Math.min(100,m.value/m.target*100)}%"></i></div><p>${resources(m.reward)}</p>${m.claimed?`<button data-title="${m.id}" ${this.s.title===m.id?'disabled':''}>${this.s.title===m.id?'名乗っている称号':'この称号を名乗る'}</button>`:`<button data-claim="${m.id}" ${m.ready?'':'disabled'}>${m.ready?'報酬を受け取る':'まだ達成していません'}</button>`}</div></article>`).join('')}</div>`;
    body.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>{if(this.a.claim(b.dataset.claim)){this.render('merits');this.owner.toast('勲功報酬と称号を受け取りました。');}});
    body.querySelectorAll('[data-title]').forEach(b=>b.onclick=()=>{if(this.a.equipTitle(b.dataset.title))this.render('merits');});
  }
}
