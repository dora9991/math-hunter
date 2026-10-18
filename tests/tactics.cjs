// 独立した計算で小学生16形式と地点・射程・予告を検証する。
const assert=require('node:assert/strict'),path=require('node:path');const{pathToFileURL}=require('node:url');
(async()=>{
 const imp=f=>import(pathToFileURL(path.resolve(__dirname,'../js',f)));
 const{ELEMENTARY,ELEMENTARY_TOPICS}=await imp('elementaryProblems.js'),{Rng}=await imp('util.js');
 const{makeProblem,conflicts}=await imp('mathproblems.js'),{battleProfile,pointDefinitions,pointState,flightHigh,patternLanes,tacticalMove}=await imp('battleTactics.js');
 const{BESTIARY}=await imp('bestiary.js'),{normalizeAdventure}=await imp('adventure.js');let pass=0;
 const ok=(s,c)=>{assert.ok(c,s);pass++;};
 const solve={add:n=>n[0]+n[1],subtract:n=>n[0]-n[1],tables:n=>n[0]*n[1],divide:n=>n[0]/n[1],blank:n=>n[1]-n[0],multiplyBlank:n=>n[1]/n[0],minutes:n=>n[0]+n[1],clock:n=>n[0]+n[1],length:n=>n[0]*10,money:n=>n[0]-n[1],area:n=>n[0]*n[1],perimeter:n=>n[1]*4,fraction:n=>n[0]/n[1],percent:n=>n[0]/10,sequence:n=>n[2]+n[1]-n[0],compare:n=>Math.max(...n)};
 const rng=new Rng(8873),seen=new Set();
 for(const[k,gen]of Object.entries(ELEMENTARY)){
  for(let i=0;i<200;i++){const p=gen(rng),n=p.text.match(/\d+/g).map(Number);assert.equal(p.answer,solve[k](n),`${k}: ${p.text}`);assert.ok(p.answer>0&&p.answer<=99);seen.add(p.topic);}
  ok(`${k}は暗算の答えが正しい`,true);
 }
 ok('9分野を網羅する',seen.size===Object.keys(ELEMENTARY_TOPICS).length);
 for(const lv of[-1,3]){
  let primary=0,junior=0;
  for(let i=0;i<1000;i++){
   const taken=[];for(const kind of['left','atk','big','right','heal','dodge3']){
    const p=makeProblem(kind,rng,taken,lv);assert.ok(!taken.some(a=>conflicts(a,p.ans)));taken.push(p.ans);
    assert.equal(new Set(p.choices).size,4);assert.ok(p.choices.includes(p.answer));
    if(p.elementary){primary++;assert.ok(p.choices.every(v=>v>0));}else junior++;
   }
  }
  ok(`問題レベル${lv}で入力衝突せず4択を生成する`,lv===-1?primary===6000:primary>2000&&junior>1000);
 }
 const counts={};for(const id of ['zarva','sektra','veira',...Object.keys(BESTIARY)]){
  const profile=battleProfile(id),points=pointDefinitions(profile);counts[points.length]=(counts[points.length]||0)+1;
  assert.equal(points.length,profile.points);for(const pattern of['all','front','center','sides','rear','far','other','adjacent','target'])for(let i=0;i<points.length;i++){
   const lanes=patternLanes(pattern,points,i,[i],true);assert.ok(lanes.every(j=>points[j]));
   assert.ok(patternLanes(pattern,points,i,[i],false,true).every(j=>points[j].kind!=='retreat'));
  }
 }
 ok('50種すべての攻撃が地点の範囲内に収まり3/4/5地点の敵がいる',Object.values(counts).reduce((a,b)=>a+b)===50&&Object.values(counts).every(n=>n>0));
 const armor=battleProfile('gradon'),ap=pointDefinitions(armor),air=battleProfile('galdo'),fp=pointDefinitions(air);
 ok('退避は攻撃不可、正面装甲と攻撃後の隙の倍率が変わる',!pointState(armor,ap,3).reachable&&pointState(armor,ap,1).multiplier===.35&&pointState(armor,ap,1,{time:4,openingUntil:6}).multiplier===1.6);
 ok('飛行は8秒の高空と6秒の低空、翼破壊・必殺で着地する',flightHigh(air,{time:7})&&!flightHigh(air,{time:8})&&flightHigh(air,{time:14})&&!flightHigh(air,{time:1,wingBroken:true})&&!flightHigh(air,{grounded:true}));
 ok('高空の正面は射程外、側面は翼に届き低空の正面は強い',!pointState(air,fp,1,{time:2}).reachable&&pointState(air,fp,0,{time:2}).reachable&&pointState(air,fp,1,{time:9}).multiplier===1.3);
 ok('切断後の尾と遠方は攻撃できない',!pointState(air,fp,3,{time:9,tailCut:true}).reachable&&!pointState(air,fp,4,{time:9}).reachable);
 ok('全地点・前方・背後・遠方・反対の予告を区別する',patternLanes('all',fp,1).length===5&&patternLanes('front',fp,1).join()==='0,1,2'&&patternLanes('rear',fp,1).join()==='3'&&patternLanes('far',fp,1).join()==='4'&&patternLanes('other',fp,1,[0,1,2]).join()==='3,4');
 ok('三段攻撃は前方→背後→遠方、残留・追尾も固有にする',tacticalMove({},battleProfile('silvark'),1).followPatterns.join()==='rear,far'&&tacticalMove({},battleProfile('morga'),0).hazard&&tacticalMove({},battleProfile('lunax'),0).tracking);
 ok('入門の難易度を保存して既存セーブも読める',normalizeAdventure({difficulty:'beginner'}).difficulty==='beginner'&&normalizeAdventure({difficulty:'hard'}).difficulty==='hard');
 console.log(`地点・小学生問題テスト：${pass} 成功 / 0 失敗（分布 ${JSON.stringify(counts)}）`);
})().catch(e=>{console.error(e);process.exitCode=1;});
