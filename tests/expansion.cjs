// 旧セーブの継続、外伝と本編の独立、強化・討究・勲功の保存を検証する。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const root = path.resolve(__dirname, '..');
  const { Adventure, QUESTS, ALL_QUESTS, SIDE_STORIES, EQUIPMENT, CHAPTERS, MONSTER_QUESTS, normalizeAdventure, huntMedal } = await import(pathToFileURL(path.join(root, 'js/adventure.js')));
  const { NEW_BEASTS } = await import(pathToFileURL(path.join(root, 'js/expansionContent.js')));
  const good = { win:true, time:110, correct:12, rate:100, hitsTaken:0, attacks:['確認した技'], breaks:[] };
  let passed = 0;
  const ok = (name, condition) => { assert.ok(condition, name); passed++; };
  const legacy = () => ({ version:1, introSeen:true, completed:QUESTS.slice(0,13).map(q=>q.id), investigations:{road:['trace','rune']}, materials:{marks:1200,ore:90,wood:60,crystal:75}, crafted:['traveler','breaker'], equipped:'breaker', journal:{raizen:{seen:true,kills:4,attacks:['雷鳴放電'],breaks:['右肩棘'],best:62}}, difficulty:'normal', receipts:['old-receipt'], pendingStory:null });
  let stored;
  const a = new Adventure(legacy(), s => { stored=JSON.parse(JSON.stringify(s)); return true; });
  ok('既存13依頼クリアのセーブから第7章へ続く', a.nextQuest.id==='tide_letter' && a.chaptersDone===6 && a.firstArcDone);
  ok('旧素材・装備・調査・図鑑を保持する', a.state.materials.marks===1200 && a.state.equipped==='breaker' && a.state.journal.raizen.best===62 && Math.abs(a.prepareRun('road').effects.parts-1.6)<1e-9);
  ok('新しい保存項目は安全な初期値で追加される', a.state.materials.core===0 && a.state.materials.sigil===0 && a.state.sideCompleted.length===0 && a.state.upgrades.breaker===0 && a.state.rankXP===1040);
  ok('外伝は章と前の外伝を満たして開放される', a.available('mira_seed') && !a.available('mira_growth') && !a.available('nagi_light'));
  const mainBefore=JSON.stringify(a.state.completed), side=a.finishRun(a.prepareRun('mira_seed'),good);
  ok('外伝を達成しても本編と施設の進行は変わらない', JSON.stringify(a.state.completed)===mainBefore && a.chaptersDone===6 && side.side && side.first && !side.facility);
  ok('外伝で勲章が手に入り、次の外伝が開く', side.reward.sigil===2 && a.available('mira_growth') && a.state.pendingStory==='mira_seed');
  ok('S評価の必要条件をそれぞれ判定する', huntMedal(good)==='S' && huntMedal({...good,hitsTaken:1})==='A' && huntMedal({...good,time:211})==='A' && huntMedal({...good,correct:7})==='B' && huntMedal({...good,win:false})===null);
  const materialBefore=JSON.stringify(a.state.materials), repeatRun=a.prepareRun('mira_seed');
  const repeat=a.finishRun(repeatRun,{...good,rate:70});
  ok('再挑戦で最高評価を下げず、外伝の初回報酬を再付与しない', repeat.medal==='B' && repeat.bestMedal==='S' && !repeat.first && repeat.reward.marks===48 && a.state.sideCompleted.length===1);
  const duplicateBefore=JSON.stringify(a.state);
  ok('同じ外伝結果の重複受領を防ぐ', a.finishRun(repeatRun,good)===null && JSON.stringify(a.state)===duplicateBefore && materialBefore!==JSON.stringify(a.state.materials));
  ok('第6章前や未発見の敵・飛び越した討究Lvを受注できない', new Adventure(null,()=>true).prepareChallenge('raizen',1)===null && !a.prepareChallenge('oraclis',1) && !a.prepareChallenge('raizen',2) && !a.prepareChallenge('raizen',0) && !a.prepareChallenge('raizen',1.5));
  const challenging=a.prepareChallenge('raizen',1,'fierce');
  ok('異変の体力・攻撃・速度補正を戦闘に渡す', challenging.type==='challenge' && challenging.encounter.hp===1.1 && Math.abs(challenging.encounter.damage-1.325)<1e-9 && challenging.encounter.speed<1 && challenging.boss);
  const beforeChallenge=JSON.stringify(a.state.completed), c=a.finishRun(challenging,good);
  ok('討究勝利は本編を進めず、次のLvを開く', c.challenge && !c.first && JSON.stringify(a.state.completed)===beforeChallenge && a.state.anomalies.raizen===1 && !!a.prepareChallenge('raizen',2));
  ok('討究の勲章・評価を個体と基本難易度ごとに保存する', c.reward.sigil===5 && a.state.challengeMedals['raizen:1:fierce:normal']==='S' && !a.state.challengeMedals['raizen:1:normal:normal']);
  const challengeState=JSON.stringify(a.state);
  ok('同じ討究結果の報酬を二重に付与しない', a.finishRun(challenging,good)===null && JSON.stringify(a.state)===challengeState);
  const failed=a.prepareChallenge('raizen',2,'swift'), money=JSON.stringify(a.state.materials), xp=a.state.rankXP;
  a.finishRun(failed,{...good,win:false});
  ok('討究の敗北は素材・経験・討究Lvを減らさず、Lvも進めない', JSON.stringify(a.state.materials)===money && a.state.rankXP===xp && a.state.anomalies.raizen===1);
  for(let tier=2;tier<=20;tier++) a.finishRun(a.prepareChallenge('raizen',tier,tier%2?'armored':'normal'),good);
  ok('Lv.20まで進め、21は受注できない', a.state.anomalies.raizen===20 && !a.prepareChallenge('raizen',21));
  const highest=a.finishRun(a.prepareChallenge('raizen',20,'armored'),good);
  ok('高い討究の再挑戦でも古代核を獲得できる', highest.reward.core===1 && highest.reward.sigil===6);
  ok('未達成の勲功報酬は受け取れない', !a.claim('companions') && !a.equipTitle('companions'));
  const sigil=a.state.materials.sigil;
  ok('勲功報酬と称号は一度だけ受け取れる', a.claim('limit') && a.state.materials.sigil===sigil+12 && a.state.title==='limit' && !a.claim('limit'));
  ok('保存と再読込で新しい評価・討究・称号を保持する', stored.challengeMedals['raizen:1:fierce:normal']==='S' && new Adventure(stored,()=>true).state.title==='limit' && new Adventure(stored,()=>true).state.anomalies.raizen===20);
  // 強化5段階の消費を確認。試験用素材を十分に用意する。
  for(const k of Object.keys(a.state.materials))a.state.materials[k]=10000;
  const base=a.effectsFor('breaker');
  let totalMarks=0,totalCore=0,totalSigil=0;
  for(let n=1;n<=5;n++){
    const cost=a.upgradeCost('breaker');totalMarks+=cost.marks;totalCore+=cost.core||0;totalSigil+=cost.sigil||0;
    assert.ok(a.upgrade('breaker'));assert.equal(a.state.upgrades.breaker,n);
  }
  ok('強化に必要な素材だけを各段階で消費する', a.state.materials.marks===10000-totalMarks && a.state.materials.core===10000-totalCore && a.state.materials.sigil===10000-totalSigil);
  const enhanced=a.effectsFor('breaker'), maxMoney=JSON.stringify(a.state.materials);
  ok('最大+5の補正が実際の装具効果に入る', Math.abs(enhanced.damage/base.damage-1.175)<1e-9 && enhanced.hp===base.hp+10 && enhanced.focus===base.focus+2);
  ok('最大強化後や未製作の強化は素材を消費しない', a.upgradeCost('breaker')===null && !a.upgrade('breaker') && !a.upgrade('duelist') && JSON.stringify(a.state.materials)===maxMoney);
  a.state.materials.marks=0; const low=JSON.stringify(a.state.materials);
  ok('不足素材で強化を始めず、負数を作らない', !a.upgrade('traveler') && JSON.stringify(a.state.materials)===low);
  a.state.materials.marks=10000;
  ok('追加装具には章による製作条件がある', !a.canCraft('bulwark'));
  for(const q of QUESTS.slice(13))a.finishRun(a.prepareRun(q.id),good);
  ok('第二部全24依頼を通して12章を達成する', a.state.completed.length===37 && a.chaptersDone===12 && !a.nextQuest && a.state.pendingStory==='newdawn');
  ok('新しい装具を製作して装備できる', a.craft('duelist') && a.state.equipped==='duelist' && a.effectsFor().counter===2.25);
  for(const q of SIDE_STORIES)if(!a.state.sideCompleted.includes(q.id)){
    assert.ok(a.available(q.id),q.id);a.finishRun(a.prepareRun(q.id),good);
  }
  ok('4人の外伝12話を完結できる', a.state.sideCompleted.length===12 && a.milestones().find(m=>m.id==='companions').ready);
  ok('本編・外伝・敵・装具の数が揃う', QUESTS.length===37 && CHAPTERS.length===12 && SIDE_STORIES.length===12 && MONSTER_QUESTS.length===25 && EQUIPMENT.length===8);
  ok('全49依頼に重複しないIDと解答可能な仕掛け・物語がある', new Set(ALL_QUESTS.map(q=>q.id)).size===49 && ALL_QUESTS.every(q=>q.report.length>=2 && q.choices.length===4 && new Set(q.choices).size===4 && q.choices.includes(q.answer)));
  for(const [id,beast]of Object.entries(NEW_BEASTS)){
    const bytes=fs.readFileSync(path.join(root,'assets/models/monster',id+'.glb'));
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
    ok(`${id}に実際のBlenderモデルと左右部位の骨がある`, bytes.toString('utf8',0,4)==='glTF' && json.skins?.length>0 && ['wingL','wingR'].every(b=>json.nodes.some(n=>n.name===b)) && beast.moves.length===3);
  }
  const invalid=normalizeAdventure({completed:legacy().completed,crafted:['traveler'],upgrades:{traveler:999},materials:{core:-8,sigil:NaN},anomalies:{raizen:900},medals:{road:'X'},title:'stranger',claimed:[],rankXP:-1});
  ok('追加保存項目の不正な値を範囲内に戻す', invalid.upgrades.traveler===5 && invalid.anomalies.raizen===20 && invalid.materials.core===0 && invalid.materials.sigil===0 && !invalid.medals.road && invalid.title===null && invalid.rankXP===0);
  console.log(`拡張と継続セーブのテスト：${passed} 成功 / 0 失敗`);
})().catch(e=>{console.error(e);process.exitCode=1;});
