// 実画面の操作と戦闘を通す。adventure-ui.cjs の expand オプションから実行する。
const path = require('node:path');
const {pathToFileURL}=require('node:url');
module.exports=async({p,url,dir,width,engine,check})=>{
  const {QUESTS,SIDE_STORIES}=await import(pathToFileURL(path.resolve(__dirname,'../js/adventure.js')));
  const {NEW_BEASTS}=await import(pathToFileURL(path.resolve(__dirname,'../js/expansionContent.js')));
  const {questRoute}=await import(pathToFileURL(path.resolve(__dirname,'../js/frontierContent.js')));
  const expectedSeen=new Set([...QUESTS.slice(0,13).map(q=>q.enemy),...QUESTS.slice(13,37).flatMap(q=>questRoute(q).map(s=>s.enemy))]).size;
  const legacy={version:1,introSeen:true,completed:QUESTS.slice(0,13).map(q=>q.id),materials:{marks:1800,ore:120,wood:90,crystal:100},crafted:['traveler','breaker'],equipped:'breaker',difficulty:'normal',journal:Object.fromEntries(QUESTS.slice(0,13).map(q=>[q.enemy,{seen:true,kills:1,attacks:[],breaks:[],best:100}])),investigations:{road:['trace','rune']},pendingStory:null};
  const shot=async(name)=>p.shot(path.join(dir,`expansion-${engine}-${width}-${name}.png`));
  const home=async(tab)=>{
    await p.eval(`window.__hunt.game.goHome('${tab}');1`);
    await p.wait(`!!document.querySelector('.home-main')`,10000);
    if(await p.eval(`!!document.querySelector('.story-skip')`)){
      await p.clickText('.story-skip','閉じる');await p.wait(`!document.querySelector('.adv-dialog')`,10000);
    }
  };
  const noOverflow=async(name)=>check(name,await p.eval(`document.querySelector('.home-main').scrollWidth <= document.querySelector('.home-main').clientWidth+1`));
  const fight=async()=>p.eval(`(()=>{const g=window.__hunt.game,b=g.math;g.hunter.god=true;let next=2;for(let t=0;t<500&&g.mode==='hunt';t+=1/60){g.tick(1/60);if(b.rt>=next&&!b.endAt){const id=b._enabled(b.cards.big)?'big':'atk';if(b._enabled(b.cards[id]))b.choose(id,b.cards[id].prob.answer);next=b.rt+1;}}return {win:g.lastMath?.win,mode:g.mode,medal:g.lastMath?.adventure?.medal,correct:g.lastMath?.correct}})()`);
  await p.eval(`localStorage.setItem('hunter.adventure.v1',${JSON.stringify(JSON.stringify(legacy))});1`);
  await p.goto(url);await p.wait('!!window.__hunt?.game',40000);
  await p.clickText('.title button.start','はじめる');await p.wait(`!!document.querySelector('.village-page')`,10000);
  check('旧セーブから第二部に進み、素材と装具を保持する',await p.eval(`window.__hunt.game.adventure.state.completed.length===13 && window.__hunt.game.adventure.nextQuest.id==='tide_letter' && window.__hunt.game.adventure.state.materials.marks===1800 && window.__hunt.game.adventure.state.equipped==='breaker' && !document.querySelector('.adv-dialog')`));
  await p.clickText('[data-tab="map"]','世界地図');await p.wait(`document.querySelectorAll('.chapter-card').length===18`,10000);
  check('18章が表示され、第一部クリアで第7章が開く',await p.eval(`document.querySelectorAll('.chapter-card:not(:disabled)').length===7`));
  await p.eval(`document.querySelector('[data-chapter="6"]').scrollIntoView({block:'center'});1`);await shot('second-journey');
  await noOverflow('スマホでも12章の地図が横にはみ出さない');
  await p.clickText('[data-tab="guild"]','ギルド');await p.wait(`!!document.querySelector('.guild-page')`,10000);
  check('4人の外伝12話と開放条件を表示する',await p.eval(`document.querySelectorAll('[data-side]').length===12 && !document.querySelector('[data-side="mira_seed"]').disabled && document.querySelector('[data-side="nagi_sea"]').disabled`));
  await shot('companions');await noOverflow('外伝画面が横にはみ出さない');
  await p.clickText('[data-side="mira_seed"]','ミラの最初の記録');await p.wait(`!!document.querySelector('.depart-adventure')`,10000);
  check('外伝の依頼主と出発準備が表示される',await p.eval(`document.querySelector('.quest-brief').textContent.includes('調査士 ミラ') && document.querySelector('.chapter-back').textContent.includes('仲間の外伝')`));
  await p.clickText('.depart-adventure','狩る');await p.wait(`window.__hunt.game.mode==='hunt'`,10000);
  await p.eval(`window.__hunt.game.math.clearTime=90;window.__hunt.game.math.finish(true,'外伝達成');1`);
  check('外伝報酬が本編と別に保存される',await p.eval(`window.__hunt.game.adventure.state.sideCompleted.includes('mira_seed') && window.__hunt.game.adventure.state.completed.length===13 && window.__hunt.game.adventure.state.materials.sigil===2`));
  await p.clickText('.result-btns .back','村で報告');await p.wait(`!!document.querySelector('.dialogue-copy')`,10000);
  check('外伝専用の物語が読める',await p.eval(`document.querySelector('.dialogue-copy').textContent.includes('研究ノート')||document.querySelector('.dialogue-copy').textContent.includes('観察')`));
  await p.clickText('.story-skip','閉じる');await p.wait(`!document.querySelector('.adv-dialog')`,10000);
  await p.clickText('[data-tab="workshop"]','鍛冶屋');await p.wait(`!!document.querySelector('[data-upgrade="breaker"]')`,10000);
  const before=await p.eval(`window.__hunt.game.adventure.state.materials.marks`);
  await p.clickText('[data-upgrade="breaker"]','+1 に強化');await p.wait(`window.__hunt.game.adventure.state.upgrades.breaker===1`,10000);
  check('強化で素材を消費し、+1と補正を画面に反映する',await p.eval(`window.__hunt.game.adventure.state.materials.marks===${before-80} && !!document.querySelector('.equipment-card.equipped .upgrade-badge') && document.querySelector('.equipment-card.equipped .upgrade-effects').textContent.includes('3.5%')`));
  await noOverflow('8種の装具をスマホでも操作できる');await shot('upgrades');
  await p.clickText('[data-tab="guild"]','ギルド');await p.wait(`!!document.querySelector('.guild-tabs')`,10000);
  await p.clickText('[data-guild="merits"]','勲功と称号');await p.wait(`!!document.querySelector('[data-claim="firstpath"]')`,10000);
  await p.clickText('[data-claim="firstpath"]','報酬');await p.wait(`!!document.querySelector('[data-title="firstpath"]')`,10000);
  check('勲功を受け取ると称号を名乗り、再受取ボタンが消える',await p.eval(`window.__hunt.game.adventure.state.title==='firstpath' && !document.querySelector('[data-claim="firstpath"]') && document.querySelector('.adventure-side-status').textContent.includes('街道の開拓者')`));
  await shot('merits');
  await p.clickText('[data-guild="anomaly"]','異変討究');await p.wait(`!!document.querySelector('.anomaly-controls')`,10000);
  await p.clickText('[data-mutation="fierce"]','激昂');await p.wait(`!!document.querySelector('[data-mutation="fierce"].selected')`,10000);
  check('4種類の個体と実際の補正倍率を表示する',await p.eval(`document.querySelectorAll('[data-mutation]').length===4 && document.querySelector('.anomaly-summary').textContent.includes('1.33')`));
  await p.eval(`document.querySelector('.anomaly-intro').scrollIntoView({block:'start'});1`);await shot('anomaly');await noOverflow('討究の選択画面が横にはみ出さない');
  await p.clickText('.depart-anomaly','激昂');await p.wait(`window.__hunt.game.mode==='hunt'`,10000);
  check('討究で実際の体力と攻撃・速度が変わる',await p.eval(`window.__hunt.game.monster.maxHp===2860 && window.__hunt.game.activeAdventure.encounter.damage>1.32 && window.__hunt.game.math.tempo.k<1 && window.__hunt.game.hunter.maxHp===117`));
  const won=await fight();check('実際の戦闘で討究を達成し評価を記録する',won.win&&won.mode==='result'&&['A','S'].includes(won.medal));
  check('討究Lvだけが進み、本編13依頼を保持する',await p.eval(`window.__hunt.game.adventure.state.completed.length===13 && window.__hunt.game.adventure.state.anomalies.raizen===1 && !!document.querySelector('.adventure-reward .hunt-medal')`));
  await shot('anomaly-result');
  await p.clickText('.result-btns .again','もう一度');await p.wait(`window.__hunt.game.mode==='hunt'`,10000);
  check('もう一度でも同じ敵・Lv・個体を再挑戦する',await p.eval(`window.__hunt.game.activeAdventure.type==='challenge' && window.__hunt.game.activeAdventure.tier===1 && window.__hunt.game.activeAdventure.condition==='fierce'`));
  await p.eval(`window.__hunt.game.math.finish(false,'撤退');1`);
  await p.clickText('.result-btns .back','ギルド');await p.wait(`!!document.querySelector('.anomaly-tier')`,10000);
  check('次の討究Lvが選択肢に追加される',await p.eval(`document.querySelector('.anomaly-tier').options.length===2`));
  // 第二部の依頼から新しい蟹のモデルで実戦を通す。
  await p.eval(`const g=window.__hunt.game;g.startAdventureQuest('tide_letter');g.math.clearTime=90;g.math.finish(true,'依頼達成');1`);
  await home('village');
  await p.clickText('.next-quest','依頼を確認');await p.wait(`!!document.querySelector('[data-quest-id="tide_harbor"]')`,10000);
  await shot('harbor-quest');await p.clickText('.depart-adventure','狩る');await p.wait(`window.__hunt.game.monster.variant==='thalass'`,10000);
  await p.eval(`window.__hunt.game.hunter.god=true;window.__hunt.advance(4.2);1`);await new Promise(r=>setTimeout(r,500));await shot('thalass');
  check('潮鎧蟹の実戦をクリアして物語を進める',(await fight()).win&&await p.eval(`window.__hunt.game.adventure.state.completed.includes('tide_harbor')`));
  // 新モデル12体の全36技、追撃、部位破壊と移動地点を実際の戦闘処理で通す。
  const models=[];
  for(const [id,def]of Object.entries(NEW_BEASTS)){
    const follow=def.moves.findIndex(a=>a.follow);
    const entry=await p.eval(`(()=>{const g=window.__hunt.game;window.__hunt.mathStart({enemy:'${id}',level:'normal',seed:73});g.hunter.god=true;const b=g.math,m=g.monster;let finite=true;const attacks=[];for(const count of[1,2,4]){m.startAction('hold');b.enemy.phase='rest';b.enemy.count=count-1;b.enemy.t=0;b._telegraph(1);const a=b.enemy.atk;attacks.push({id:a.id,lanes:a.lanes.slice()});b.enemy.t=b.enemy.lead;b._enemy(.01);if(m.state!=='beastMove')throw new Error('${id}: motion');for(let f=0;f<105;f++){g.tick(1/60);finite&&=[...m.pose,m.pos.x,m.pos.y,m.pos.z,m.air].every(Number.isFinite);}}let followOK=true;${follow>=0?`m.startAction('hold');b.enemy.phase='rest';b.enemy.count=${follow===2?3:follow};b.enemy.t=0;b._telegraph(1);b.enemy.t=b.enemy.lead;b._enemy(.01);for(let f=0;f<240&&b.enemy.phase!=='follow';f++)g.tick(1/60);followOK=b.enemy.phase==='follow'&&b.enemy.atk.lanes.length>0;for(let f=0;f<240&&b.enemy.phase==='follow';f++)g.tick(1/60);followOK&&=b.enemy.phase!=='follow';`:''}m._breakWing('L');m._breakWing('R');m.startAction('hold');b.enemy.phase='rest';b.enemy.count=3;b._telegraph(1);return {id:'${id}',model:m.skinned,finite,attacks,followOK,stopped:b.enemy.atk.id!=='${id}_2',parts:b.parts.slice(),spots:b.spots.map(s=>[+s.x.toFixed(2),+s.z.toFixed(2)]),clear:b.spots.every(s=>!g.world.colliders.some(c=>Math.hypot(c.x-s.x,c.z-s.z)<c.r+.8))}})()`);
    check(`${id}のモデル・全3技・追撃・部位破壊が有効`,entry.model&&entry.finite&&entry.followOK&&entry.stopped&&entry.parts[0]==='wingR'&&entry.attacks.map(a=>a.id).join(',')===`${id}_0,${id}_1,${id}_2`&&entry.clear);
    models.push(entry);
    if(['silvark','nivalis','oraclis'].includes(id)){
      await p.eval(`window.__hunt.mathStart({enemy:'${id}',level:'normal',seed:73});window.__hunt.game.hunter.god=true;window.__hunt.advance(4.5);1`);
      await new Promise(r=>setTimeout(r,400));await shot(id);
    }
  }
  check('敵の種類によって移動地点が変わる',new Set(models.map(m=>JSON.stringify(m.spots))).size>=10);
  console.log(JSON.stringify({newModelBattles:models}));
  // 終盤・再読・全外伝の画面と、更新後の保存を確認。勝敗は共通の結果処理を通す。
  await p.eval(`(()=>{const g=window.__hunt.game;for(const id of ${JSON.stringify(QUESTS.slice(15,37).map(q=>q.id))}){g.startAdventureQuest(id);while(g.math.routeIndex<g.math.route.length-1){g.math.clearTime=100;g.math.finish(true,'道中達成');g.math.nextStage();}g.math.clearTime=100;g.math.finish(true,'依頼達成');}g.goHome();1})()`);
  await p.wait(`!!document.querySelector('.dialogue-copy')`,10000);
  check('本編37依頼の第二部エンディングへ到達する',await p.eval(`window.__hunt.game.adventure.state.completed.length===37 && window.__hunt.game.adventure.chaptersDone===12 && document.querySelector('.adv-dialog').textContent.includes('まだない明日へ')`));
  await shot('ending');await p.clickText('.story-skip','閉じる');await p.wait(`!document.querySelector('.adv-dialog')`,10000);
  await p.eval(`(()=>{const g=window.__hunt.game;for(const id of ${JSON.stringify(SIDE_STORIES.slice(1).map(q=>q.id))}){g.startAdventureQuest(id);g.math.clearTime=95;g.math.finish(true,'外伝達成');}g.goHome('guild');1})()`);
  await p.wait(`!!document.querySelector('.story-skip')`,10000);await p.clickText('.story-skip','閉じる');await p.wait(`!document.querySelector('.adv-dialog')`,10000);
  check('外伝12話を本編と別に達成できる',await p.eval(`window.__hunt.game.adventure.state.sideCompleted.length===12 && window.__hunt.game.adventure.state.completed.length===37`));
  await p.clickText('[data-guild="stories"]','仲間の外伝');await p.wait(`!!document.querySelector('[data-side="nagi_sea"]')`,10000);
  await p.clickText('[data-side="nagi_sea"]','次の海への切符');await p.wait(`!!document.querySelector('.reread-story')`,10000);
  await p.clickText('.reread-story','読み返す');await p.wait(`!!document.querySelector('.dialogue-copy')`,10000);
  check('達成済みの物語を報酬なしで読み返せる',await p.eval(`document.querySelector('.dialogue-copy').textContent.includes('切符') && window.__hunt.game.adventure.state.pendingStory===null`));
  await p.clickText('.story-skip','閉じる');await p.wait(`!document.querySelector('.adv-dialog')`,10000);
  await p.goto(url);await p.wait('!!window.__hunt?.game',40000);await p.clickText('.title button.start','はじめる');await p.wait(`!!document.querySelector('.village-page')`,10000);
  check('再読込で本編・外伝・強化・称号・討究・評価を保持する',await p.eval(`(()=>{const s=window.__hunt.game.adventure.state;return s.completed.length===37&&s.sideCompleted.length===12&&s.upgrades.breaker===1&&s.title==='firstpath'&&s.anomalies.raizen===1&&!!s.challengeMedals['raizen:1:fierce:normal']&&!document.querySelector('.adv-dialog')})()`));
  await p.clickText('[data-tab="journal"]','狩猟図鑑');await p.wait(`!!document.querySelector('.journal-page')`,10000);
  check('第二部の魔獣と実際に通った道中の魔獣が図鑑に載る',await p.eval(`document.querySelectorAll('.journal-entry.discovered').length===${expectedSeen}`));
  await p.clickText('[data-tab="map"]','世界地図');await p.wait(`!!document.querySelector('.chapter-card')`,10000);await p.eval(`document.querySelector('[data-chapter="6"]').scrollIntoView({block:'start'});1`);await shot('all-chapters');
};
