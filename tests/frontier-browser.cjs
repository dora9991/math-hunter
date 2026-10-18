const path=require('node:path');const{pathToFileURL}=require('node:url');
module.exports=async({p,url,dir,width,engine,check})=>{
 const{QUESTS}=await import(pathToFileURL(path.resolve(__dirname,'../js/adventure.js')));
 const{FRONTIER_BEASTS}=await import(pathToFileURL(path.resolve(__dirname,'../js/frontierContent.js')));
 const shot=name=>p.shot(path.join(dir,`frontier-${engine}-${width}-${name}.png`));
 const start=async raw=>{await p.eval(`localStorage.setItem('hunter.adventure.v1',${JSON.stringify(JSON.stringify(raw))});1`);await p.goto(url);await p.wait('!!window.__hunt?.game',40000);await p.clickText('.title button.start','はじめる');await p.wait(`!!document.querySelector('.village-page')`,10000);};
 const feed=async n=>p.eval(`(()=>{const g=window.__hunt.game,b=g.math;g.hunter.god=true;for(let n=0;n<${n};n++){const id=b.lane===0?'right':'left';b.choose(id,b.cards[id].prob.answer);g.tick(.05);}b.frame(0);return b.gauge.value})()`);
 const fightStage=async()=>p.eval(`(()=>{const g=window.__hunt.game,b=g.math;g.hunter.god=true;let next=b.rt+1;for(let t=0;t<300&&g.mode==='hunt';t+=1/60){g.tick(1/60);if(b.rt>=next&&!b.endAt){const id=b._enabled(b.cards.big)?'big':'atk';if(b._enabled(b.cards[id]))b.choose(id,b.cards[id].prob.answer);next=b.rt+1;}}return {mode:g.mode,win:g.lastMath?.win}})()`);
 await start({introSeen:true,completed:['road'],materials:{marks:100,ore:10,wood:10,crystal:10},crafted:['traveler'],equipped:'traveler',difficulty:'easy',journal:{raizen:{kills:1,attacks:[],breaks:[],best:90}}});
 await p.clickText('.next-quest','依頼を確認');await p.wait(`!!document.querySelector('.quest-route')`,10000);
 check('ボス依頼に道中2戦と決戦を表示する',await p.eval(`document.querySelectorAll('.quest-route span').length===3&&document.querySelector('.quest-route').textContent.includes('スパルコ')&&document.querySelector('.quest-route').textContent.includes('グラドン')`));
 await shot('route-preparation');await p.clickText('.depart-adventure','狩る');await p.wait(`window.__hunt.game.mode==='hunt'`,10000);
 check('最初は弱い小型魔獣との戦闘になる',await p.eval(`window.__hunt.game.monster.variant==='sparko'&&window.__hunt.game.monster.maxHp===286&&window.__hunt.game.monster.root.scale.x===.46&&window.__hunt.game.math.route.length===3`));
 await p.eval(`(()=>{const b=window.__hunt.game.math;b.choose('atk',b.cards.atk.prob.answer+100);window.__hunt.advance(1.1);b.frame(0);return 1})()`);
 check('誤答では必殺ゲージが増えない',await p.eval(`window.__hunt.game.math.gauge.value===0&&document.querySelector('.mb-ultimate').disabled`));
 check('9問正解では発動できない',await feed(9)===90&&await p.eval(`!window.__hunt.game.math.unleash()`));
 check('10問正解でボタンが発動可能になる',await feed(1)===100&&await p.eval(`!document.querySelector('.mb-ultimate').disabled`));
 await shot('ultimate-ready');await p.clickText('.mb-ultimate','星解');await p.wait(`!!window.__hunt.game.math.special`,10000);
 check('ボタン操作でゲージを全消費し、重ねて発動できない',await p.eval(`window.__hunt.game.math.gauge.value===0&&window.__hunt.game.math.stats.specials===1&&!window.__hunt.game.math.unleash()`));
 await p.eval(`window.__hunt.advance(.45);1`);await shot('ultimate-strike');
 check('必殺技に実ダメージがあり、発動回数が記録される',await p.eval(`window.__hunt.game.math.stats.specials===1&&window.__hunt.game.math.stats.damage>0`));
 await p.eval(`window.__hunt.advance(4);1`);await p.wait(`window.__hunt.game.mode==='camp'`,10000);
 check('道中の勝利だけではボス依頼を達成しない',await p.eval(`window.__hunt.game.adventure.state.completed.length===1&&window.__hunt.game.adventure.state.pathKills===1&&window.__hunt.game.adventure.state.journal.sparko.kills===1`));
 const camp=await p.eval(`({time:window.__hunt.game.math.rt,money:window.__hunt.game.adventure.state.materials.marks})`);
 await p.eval(`window.__hunt.game.math.finish(true,'再通知');window.__hunt.advance(5);1`);
 check('中継地点で時間が止まり、道中報酬が重複しない',await p.eval(`window.__hunt.game.math.rt===${camp.time}&&window.__hunt.game.adventure.state.materials.marks===${camp.money}`));
 await p.eval(`window.__hunt.game.hunter.hp=63;window.__hunt.game.math.potions=2;1`);await shot('camp');
 await p.clickText('.camp-continue','道中を進む');await p.wait(`window.__hunt.game.monster.variant==='bristle'&&window.__hunt.game.mode==='hunt'`,10000);
 check('次の道中へ体力と回復薬を引き継ぐ',await p.eval(`window.__hunt.game.hunter.hp===63&&window.__hunt.game.math.potions===2`));
 await feed(10);await fightStage();await p.wait(`window.__hunt.game.mode==='camp'`,10000);
 check('満タンの必殺ゲージを決戦前に温存できる',await p.eval(`window.__hunt.game.math.gauge.value===100&&window.__hunt.game.adventure.state.pathKills===2`));
 await p.clickText('.camp-continue','ボスへ進む');await p.wait(`window.__hunt.game.monster.variant==='gradon'`,10000);
 check('ボス戦に体力・回復薬・必殺ゲージを引き継ぐ',await p.eval(`window.__hunt.game.math.gauge.value===100&&window.__hunt.game.hunter.hp===63&&window.__hunt.game.math.potions===2&&window.__hunt.game.monster.maxHp===1560`));
 await p.eval(`window.__hunt.game.math.frame(0);1`);if(width>=900)await p.key('KeyF','f');else await p.clickText('.mb-ultimate','星解');await p.wait(`!!window.__hunt.game.math.special`,10000);
 await p.eval(`window.__hunt.advance(2);1`);
 check('ボスに難易度補正を反映した3連撃が入り、攻撃を止める',await p.eval(`window.__hunt.game.monster.hp===778&&window.__hunt.game.math.stats.specials===2&&window.__hunt.game.math.enemy.phase==='rest'`));
 await fightStage();await p.wait(`window.__hunt.game.mode==='result'`,10000);
 check('決戦勝利で初めて依頼が達成され、必殺回数が保存される',await p.eval(`window.__hunt.game.lastMath.win&&window.__hunt.game.adventure.state.completed.includes('gate')&&window.__hunt.game.adventure.state.specials===2&&window.__hunt.game.lastMath.pathKills===2&&document.querySelector('.adventure-reward')?.textContent.includes('必殺')`));
 await shot('boss-result');
 await p.clickText('.result-btns .again','もう一度');await p.wait(`window.__hunt.game.mode==='hunt'`,10000);
 await p.eval(`window.__hunt.game.math.clearTime=20;window.__hunt.game.math.finish(true,'道中達成');1`);await p.wait(`!!document.querySelector('.camp-retire')`,10000);
 const material=await p.eval(`JSON.stringify(window.__hunt.game.adventure.state.materials)`);
 await p.clickText('.camp-retire','村へ戻る');await p.wait(`window.__hunt.game.mode==='result'`,10000);
 check('途中帰還しても道中の素材を失わず本編は進まない',await p.eval(`JSON.stringify(window.__hunt.game.adventure.state.materials)===${JSON.stringify(material)}&&window.__hunt.game.adventure.state.completed.length===2&&!window.__hunt.game.lastMath.win`));
 // 第二部のセーブから第三部へ。追加全25種は戦闘で骨格と75技を検証する。
 const legacy={introSeen:true,completed:QUESTS.slice(0,37).map(q=>q.id),materials:{marks:3000,ore:200,wood:200,crystal:200,sigil:20,core:10},crafted:['traveler','breaker'],equipped:'breaker',upgrades:{breaker:3},difficulty:'normal',journal:Object.fromEntries(QUESTS.slice(0,37).map(q=>[q.enemy,{kills:1,attacks:[],breaks:[],best:100}]))};
 await start(legacy);
 check('既存の第二部セーブから第13章へ続く',await p.eval(`window.__hunt.game.adventure.nextQuest.id==='seedparcel'&&window.__hunt.game.adventure.state.upgrades.breaker===3`));
 await p.clickText('[data-tab="map"]','世界地図');await p.wait(`document.querySelectorAll('.chapter-card').length===18`,10000);
 await p.eval(`document.querySelector('[data-chapter="12"]').scrollIntoView({block:'center'});1`);await shot('third-journey');
 check('18章の地図がスマホ幅でもはみ出さない',await p.eval(`document.querySelector('.home-main').scrollWidth<=document.querySelector('.home-main').clientWidth+1`));
 const modelResults=[];
 for(const[id,def]of Object.entries(FRONTIER_BEASTS)){
  const entry=await p.eval(`(()=>{const g=window.__hunt.game;window.__hunt.mathStart({enemy:'${id}',level:'normal',seed:17});g.hunter.god=true;const b=g.math,m=g.monster;let finite=true;const attacks=[];for(const count of[1,2,4]){m.startAction('hold');b.enemy.phase='rest';b.enemy.count=count-1;b._telegraph(1);attacks.push(b.enemy.atk.id);b.enemy.t=b.enemy.lead;b._enemy(.01);if(m.state!=='beastMove')throw new Error('${id}:action');for(let f=0;f<110;f++){g.tick(1/60);finite&&=[...m.pose,...m.root.matrixWorld.elements,m.air].every(Number.isFinite);}}m._breakWing('L');m._breakWing('R');m.startAction('hold');b.enemy.count=3;b._telegraph(1);return{id:'${id}',variant:m.variant,skinned:m.skinned,scale:m.root.scale.x,finite,attacks,stopped:b.enemy.atk.id!=='${id}_2',clear:b.spots.every(s=>!g.world.colliders.some(c=>Math.hypot(c.x-s.x,c.z-s.z)<c.r+.8))}})()`);
  check(`${id}のモデル・全3技・部位破壊が有効`,entry.variant===id&&entry.skinned&&entry.finite&&entry.stopped&&entry.clear&&entry.scale===(def.scale||1)&&entry.attacks.join(',')===`${id}_0,${id}_1,${id}_2`);
  modelResults.push(entry);
  if(['chelona','arachna','astravor'].includes(id)){await p.eval(`window.__hunt.mathStart({enemy:'${id}',level:'normal'});window.__hunt.game.hunter.god=true;window.__hunt.advance(3);1`);await new Promise(r=>setTimeout(r,2700));await shot(id);}
 }
 console.log(JSON.stringify({models:modelResults.length,attacks:modelResults.length*3,valid:modelResults.every(r=>r.finite&&r.skinned&&r.clear)}));
 await p.eval(`(()=>{const g=window.__hunt.game;for(const id of ${JSON.stringify(QUESTS.slice(37).map(q=>q.id))}){if(!g.startAdventureQuest(id))throw new Error(id);while(g.math.routeIndex<g.math.route.length-1){g.math.clearTime=40;g.math.finish(true,'道中達成');g.math.nextStage();}g.math.clearTime=100;g.math.finish(true,'依頼達成');}g.goHome();return 1})()`);
 await p.wait(`!!document.querySelector('.dialogue-copy')`,10000);
 check('第三部全24依頼と道中を通して最終章に到達する',await p.eval(`window.__hunt.game.adventure.state.completed.length===61&&window.__hunt.game.adventure.chaptersDone===18&&document.querySelector('.adv-dialog').textContent.includes('世界をつなぐ一粒')`));
 await shot('ending');await p.clickText('.story-skip','閉じる');await p.wait(`!document.querySelector('.adv-dialog')`,10000);
 await p.clickText('[data-tab="journal"]','狩猟図鑑');await p.wait(`!!document.querySelector('.journal-page')`,10000);
 check('大型38種と小型12種を合わせた50種が図鑑に載る',await p.eval(`document.querySelectorAll('.journal-entry').length===50&&document.querySelectorAll('.journal-entry.discovered').length===50`));
 await p.goto(url);await p.wait('!!window.__hunt?.game',40000);await p.clickText('.title button.start','はじめる');await p.wait(`!!document.querySelector('.village-page')`,10000);
 check('再読込で61依頼・道中討伐・50種の図鑑・旧装具を保持する',await p.eval(`(()=>{const a=window.__hunt.game.adventure;return a.state.completed.length===61&&a.state.pathKills===30&&Object.keys(a.state.journal).length===50&&a.state.upgrades.breaker===3&&!document.querySelector('.adv-dialog')})()`));
 if(width>=900){const regression=await p.eval(`window.__hunt.game.hunter.god=false;window.__hunt.mathtest()`);check('既存戦闘66項目も通る',regression.pass===regression.total);console.log(JSON.stringify({battleRegression:regression}));}
};
