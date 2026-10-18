const path=require('node:path');const{pathToFileURL}=require('node:url');
module.exports=async({p,dir,width,engine,check})=>{
 const {BESTIARY}=await import(pathToFileURL(path.resolve(__dirname,'../js/bestiary.js')));
 const shot=async name=>{await p.eval(`window.__hunt.game.hud.clearMessages();1`);return p.shot(path.join(dir,`tactics-${engine}-${width}-${name}.png`));};
 const start=async(enemy,level='normal')=>p.eval(`window.__hunt.mathStart({enemy:'${enemy}',level:'${level}',seed:87});window.__hunt.game.hunter.god=true;1`);
 await start('raizen','beginner');
 check('入門は小学生の問題・与える1.35倍・受ける0.25倍',await p.eval(`(()=>{const b=window.__hunt.game.math;return b.level===-1&&b.opts.power===1.35&&b.opts.atk===.25&&Object.values(b.cards).filter(c=>c.prob).every(c=>c.prob.elementary)})()`));
 check('3地点の敵は3つの選択ボタンと床の番号を持つ',await p.eval(`document.querySelectorAll('.mb-lane button').length===3&&document.querySelectorAll('.mb-point-labels button').length===3`));
 await p.eval(`window.__hunt.advance(3);1`);await shot('elementary');
 await start('gradon','beginner');await p.eval(`window.__hunt.advance(2);1`);
 await p.clickText('.mb-lane [data-point="3"]','退避');await p.wait(`window.__hunt.game.math.moveTarget===3`,10000);
 check('地点タップだけでは移動せず、移動問題を表示する',await p.eval(`window.__hunt.game.math.lane===1&&window.__hunt.game.math.mobileAction==='right'&&window.__hunt.game.math.moveTarget===3`));
 await p.eval(`(()=>{const b=window.__hunt.game.math;b.choose('right',b.cards.right.prob.answer+100);return 1})()`);
 check('誤答で地点移動はしない',await p.eval(`window.__hunt.game.math.lane===1&&window.__hunt.game.math.moveTarget===3`));
 await p.eval(`window.__hunt.advance(1.1);1`);
 const answer=await p.eval(`window.__hunt.game.math.cards.right.prob.answer`);
 await p.clickText('.mb-card[data-id="right"] .mb-choices button[data-v="'+answer+'"]',String(answer));
 await p.wait(`window.__hunt.game.math.lane===3`,10000);
 await p.eval(`window.__hunt.advance(3);1`);
 check('移動問題に正解すると4番の退避地点へ動く',await p.eval(`(()=>{const b=window.__hunt.game.math,h=window.__hunt.game.hunter,s=b.spots[3];return b.moveTarget===null&&Math.hypot(s.x-h.pos.x,s.z-h.pos.z)<1.5})()`));
 check('退避地点の剣と必殺は届かず、ゲージも減らない',await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,m=g.monster;b.gauge.value=100;const hp=m.hp;b._strike(1);return m.hp===hp&&!b.unleash()&&b.gauge.value===100&&!b.positionStatus().reachable})()`));
 check('近接攻撃は退避へ届かず、次の遠距離攻撃は追う',await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,m=g.monster;m.startAction('hold');b.enemy.count=0;b._telegraph(1);const melee=b.enemy.atk.lanes.length===0;m.startAction('hold');b.enemy.count=1;b._telegraph(1);return melee&&b.enemy.atk.lanes.includes(3)&&b.enemy.atk.def.tracking})()`));
 await p.eval(`window.__hunt.game.math.frame(0);1`);await shot('four-retreat');
 // 正面装甲・反撃の隙の実ダメージを同じ武器状態で比較する。
 const armor=await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,h=g.hunter,m=g.monster;b.lane=1;m.hp=m.maxHp=100000;m.receiveHit;const hit=open=>{b.openingUntil=open?b.t+5:0;h.move=h.W.moves.vslash;h.curMv=20;const hp=m.hp;b._strike(1);return hp-m.hp};return {closed:hit(false),open:hit(true)}})()`);
 check('攻撃後の隙は正面装甲より実ダメージが大きい',armor.closed>0&&armor.open>armor.closed*4);
 await start('galdo');
 check('飛竜は5地点で高空の正面から届かず、側面の翼に届く',await p.eval(`(()=>{const b=window.__hunt.game.math;return b.points.length===5&&!b.positionStatus(1).reachable&&b.positionStatus(0).reachable&&b.parts[3]==='tail'})()`));
 await p.eval(`window.__hunt.advance(2);1`);await shot('five-high');
 check('高空のモデルも実際に上昇し、低空と片翼破壊で射程が変わる',await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,m=g.monster;const high=m.air>=3.8;b.t=9;const low=b.positionStatus(1).reachable;b.t=2;m._breakWing('L');return high&&low&&b.positionStatus(1).reachable})()`));
 await start('silvark');
 await p.clickText('.mb-lane [data-point="3"]','背後');await p.wait(`window.__hunt.game.math.moveTarget===3`,10000);
 await p.eval(`(()=>{const g=window.__hunt.game,b=g.math;b.choose('right',b.cards.right.prob.answer);window.__hunt.advance(4);return 1})()`);
 check('背後から尾を攻撃でき、切断した後は移動が必要になる',await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,m=g.monster;const before=m.hp;g.hunter.move=g.hunter.W.moves.vslash;g.hunter.curMv=30;b._strike(1);const hit=m.hp<before;m.tailCut=true;return b.lane===3&&hit&&!b.positionStatus().reachable})()`));
 await shot('five-rear');
 // 三段攻撃を時間経過で最後まで実行し、各段の攻撃範囲と姿勢の変化を確認。
 const chain=await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,m=g.monster;m.tailCut=false;b.lane=1;m.startAction('hold');b.enemy.count=1;b._telegraph(1);b.enemy.t=b.enemy.lead;b._enemy(.01);const steps=[b.enemy.atk.lanes.join()],poses=new Set();let last=0;for(let f=0;f<440&&b.enemy.atk;f++){g.tick(1/60);poses.add(m.pose.map(v=>v.toFixed(1)).join());if(b.enemy.atk&&b.enemy.atk.stepIndex!==last){last=b.enemy.atk.stepIndex;steps.push(b.enemy.atk.lanes.join());}}return {steps,phase:b.enemy.phase,poses:poses.size}})()`);
 check('三段攻撃が前方→背後→遠方を順に狙い、モーションが完了する',chain.steps.join('|')==='0,1,2|3|4'&&chain.phase==='after'&&chain.poses>15);
 await start('lunax');
 check('追尾は移動先を追い、照準固定後は追わない',await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,m=g.monster;m.startAction('hold');b.enemy.count=0;b._telegraph(1);b.lane=3;b._enemy(.01);const follow=b.enemy.atk.lanes.includes(3);b.enemy.t=b.enemy.lockAt+.001;b._enemy(.01);const fixed=b.enemy.atk.lanes.slice();b.lane=0;b._enemy(.01);return follow&&b.enemy.atk.locked&&fixed.join()===b.enemy.atk.lanes.join()&&!b.enemy.atk.lanes.includes(0)})()`));
 await p.eval(`window.__hunt.game.math.frame(0);1`);await shot('tracking');
 await start('morga');
 check('残留攻撃は6秒残り、同じ地点に居続けると被弾する',await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,m=g.monster,h=g.hunter;m.startAction('hold');b.enemy.count=0;b._telegraph(1);b.enemy.atk.lanes=[1];b._resolve();const exists=b.hazards.length===1&&b.hazards[0].until===b.t+6;h.god=false;h.iframe=0;h.invuln=false;h.hp=100;b.t+=1.6;b._residualDamage();const hurt=h.hp<100,hp=h.hp;b.lane=0;h.iframe=0;b.t+=1.6;b._residualDamage();const safe=h.hp===hp;b.t+=3;b._residualDamage();return exists&&hurt&&safe&&b.hazards.length===0})()`));
 await start('morga');await p.eval(`(()=>{const g=window.__hunt.game,b=g.math;g.monster.startAction('hold');b.enemy.count=0;b._telegraph(1);b.enemy.atk.lanes=[1];b._resolve();b.frame(0);return 1})()`);await shot('hazard');
 // 4難易度の必殺技は、体力や装甲の違いと独立して実ダメージを比較する。
 const damages=[];
 for(const level of['beginner','easy','normal','hard']){
  await start('zarva',level);
  damages.push(await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,m=g.monster;m.hp=m.maxHp=10000;b.gauge.value=100;b.unleash();window.__hunt.advance(1.8);return {level:'${level}',damage:10000-m.hp,power:b.opts.power,atk:b.opts.atk}})()`));
 }
 check('4難易度で必殺技の実ダメージが倍率通り変わる',damages.map(x=>x.damage).join()==='918,782,680,578');
 console.log(JSON.stringify({difficultyDamage:damages,armor,chain}));
 // 全50種：可変地点、当たり判定、全150技と姿勢、床の衝突を実際のモデルで通す。
 const counts={};
 for(const id of['zarva','sektra','veira',...Object.keys(BESTIARY)]){
  await start(id);
  const result=await p.eval(`(()=>{const g=window.__hunt.game,b=g.math,m=g.monster;let finite=true,valid=true;for(const count of[1,2,4]){b.lane=1;m.startAction('hold');b.enemy.count=count-1;b._telegraph(1);valid&&=b.enemy.atk.lanes.every(i=>b.points[i]);b.enemy.t=b.enemy.lead;b._enemy(.01);for(let f=0;f<100;f++){g.tick(1/60);finite&&=[...m.pose,...m.root.matrixWorld.elements,m.air].every(Number.isFinite);}}return {n:b.points.length,valid,finite,clear:b.spots.every(s=>!g.world.colliders.some(c=>Math.hypot(c.x-s.x,c.z-s.z)<c.r+.8)),markers:b.rings.length===b.points.length&&b.zones.length===b.points.length,parts:b.parts.filter(Boolean).every(part=>m.hitboxes.some(hb=>hb.part===part))}})()`);
  counts[result.n]=(counts[result.n]||0)+1;
  if(!result.valid||!result.finite||!result.clear||!result.markers||!result.parts)console.log(JSON.stringify({id,...result}));
  check(`${id}の地点・全技・モデル・移動先が有効`,result.valid&&result.finite&&result.clear&&result.markers&&result.parts,JSON.stringify(result));
 }
 check('全50体が3・4・5地点に分かれる',counts[3]===17&&counts[4]===10&&counts[5]===23);
 await p.eval(`window.__hunt.game.goHome('math');1`);await p.wait(`!!document.querySelector('.enemy-choice')`,10000);
 await p.eval(`(()=>{const e=document.querySelector('.enemy-choice');e.value='galdo';e.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('input[value="beginner"]').click();return 1})()`);
 check('出発前に地点・戦術・与える/受ける倍率を確認できる',await p.eval(`document.querySelector('.free-monster-tactics').textContent.includes('5地点')&&document.querySelector('.damage-preview').textContent.includes('1.35')&&document.querySelector('.damage-preview').textContent.includes('0.25')`));
 check('自由狩猟の設定が画面からはみ出さない',await p.eval(`document.querySelector('.home-main').scrollWidth<=document.querySelector('.home-main').clientWidth+1`));
 await shot('preparation');
 if(width>=900){const regression=await p.eval(`window.__hunt.game.hunter.god=false;window.__hunt.mathtest()`);console.log(JSON.stringify({battleRegression:regression}));check('既存戦闘の回帰検証も通る',regression.pass===regression.total);}
};
