// 地点・射程・予告を、描画から独立した同じルールで扱う。
const styles={
 basic:{points:3,hp:1,damage:1,tempo:1,label:'基本の間合い',description:'左・正面・右の3地点。予告を見て移動か回避を選ぼう。'},
 armor:{points:4,hp:1.2,damage:1.08,tempo:1.1,guard:true,pressure:1,label:'装甲と反撃の隙',description:'正面の装甲は硬い。側面を狙うか、攻撃後の隙に正面へ。退避地点では剣が届かない。'},
 marsh:{points:4,hp:1.05,damage:.95,tempo:1.08,hazard:true,pressure:1,label:'残留する危険',description:'攻撃の跡に6秒間の危険が残る。避けた後も、その地点に戻りすぎないこと。'},
 aerial:{points:5,hp:.95,damage:1.1,tempo:.96,aerial:true,pressure:1,label:'高空と低空',description:'高空中は正面から届かない。側面の翼を狙うか、低空の隙を待とう。片翼破壊で高空を封じる。'},
 trick:{points:5,hp:.9,damage:1.08,tempo:.9,tracking:[0,1],pressure:1,label:'追尾する照準',description:'追尾中は移動先も狙われる。「照準固定」の後に動くか、回避を解こう。背後も活用できる。'},
 blade:{points:5,hp:1,damage:1.15,tempo:.9,chain:1,pressure:1,label:'三段の位置取り',description:'三段攻撃の予告は前方→背後→遠方。今の予告と次の予告を見て移動しよう。'},
 serpent:{points:4,hp:1.05,damage:1.08,tempo:.96,tracking:[0],pressure:1,label:'うねる追撃',description:'最初の攻撃は照準を追い続ける。退避は近接攻撃を避けられるが、波は届く。'},
 giant:{points:5,hp:1.5,damage:1.3,tempo:1.14,guard:true,pressure:1,label:'重装甲の巨体',description:'頑丈な正面と強い一撃。背後の尾、側面の装甲、攻撃後の隙を使い分けよう。'},
 storm:{points:5,hp:1.15,damage:1.22,tempo:.94,hazard:true,chain:1,pressure:1,label:'嵐の連続攻撃',description:'三段の攻撃と残留する雷に注意。遠方も安全が続くとは限らない。'},
 master:{points:5,hp:1.55,damage:1.4,tempo:.9,aerial:true,tracking:[0],chain:1,pressure:1,label:'空と星路の攻防',description:'高空・追尾・三段攻撃を使う強敵。翼破壊で低空を作り、必殺技は届く位置から放とう。'},
};
const assignments={
 raizen:'basic',gradon:'armor',morga:'marsh',frostra:'aerial',salda:'blade',velum:'armor',nebra:'marsh',galdo:'aerial',barza:'giant',lunax:'trick',
 thalass:'armor',voltis:'serpent',mycelia:'marsh',silvark:'blade',ammor:'armor',osiron:'aerial',nivalis:'basic',fenrig:'trick',corvex:'trick',aether:'master',gargant:'giant',oraclis:'master',
 rhinox:'armor',chelona:'giant',arachna:'blade',seirun:'serpent',vulpira:'trick',mothria:'aerial',scorvex:'blade',solvyr:'aerial',gryphor:'aerial',noctyra:'trick',tempestr:'storm',mammora:'giant',astravor:'master',
};
export function battleProfile(id){return {...styles[assignments[id]||'basic'],...(id==='raizen'?{hp:.9,damage:.9,tempo:1.05}:{})};}
export function pointDefinitions(profile,winged=true){
 const points=[{name:'左側',short:'左',kind:'flank',part:winged?'wingR':'legR'},{name:'正面',short:'正面',kind:'front',part:'head'},{name:'右側',short:'右',kind:'flank',part:winged?'wingL':'legL'}];
 if(profile.points===5)points.push({name:'背後',short:'背後',kind:'rear',part:'tail'});
 if(profile.points>3)points.push({name:profile.points===4?'退避':'遠方',short:profile.points===4?'退避':'遠方',kind:'retreat',part:null});
 return points;
}
export function flightHigh(profile,state={}){return !!profile.aerial&&!state.wingBroken&&!state.grounded&&((state.time||0)%14)<8;}
export function pointState(profile,points,index,state={}){
 const point=points[index];if(!point)return{reachable:false,multiplier:0,reason:'移動先を選ぼう'};
 if(point.kind==='retreat')return{reachable:false,multiplier:0,reason:'剣も必殺技も届かない',hint:'近接攻撃の退避に。遠距離攻撃には注意。'};
 if(point.kind==='rear'&&state.tailCut)return{reachable:false,multiplier:0,reason:'尾を切断したため届かない',hint:'側面か正面へ移動しよう。'};
 if(flightHigh(profile,state)&&point.kind!=='flank')return{reachable:false,multiplier:0,reason:'高空中はここから届かない',hint:'側面から翼を狙うか、低空を待とう。'};
 if(profile.guard&&point.kind==='front'){
  if(state.openingUntil>(state.time||0))return{reachable:true,multiplier:1.6,reason:'攻撃後の隙 ×1.60'};
  return{reachable:true,multiplier:.35,reason:'正面装甲 ×0.35',hint:'側面・背後か、攻撃後の隙を狙おう。'};
 }
 if(profile.aerial&&!flightHigh(profile,state)&&point.kind==='front')return{reachable:true,multiplier:1.3,reason:'低空の弱点 ×1.30'};
 return{reachable:true,multiplier:point.kind==='rear'?1.15:1,reason:point.kind==='rear'?'尾を狙える ×1.15':'攻撃が届く ×1.00'};
}
export function patternLanes(pattern,points,lane,previous=[],coin=false,melee=false){
 const all=points.map((_,i)=>i),front=[0,1,2],far=all.at(-1);
 let out;
 if(pattern==='all')out=all;
 else if(pattern==='front')out=front;
 else if(pattern==='center')out=[1];
 else if(pattern==='sides')out=[0,2];
 else if(pattern==='rear')out=points.length===5?[3]:[0,2];
 else if(pattern==='far')out=points.length>3?[far]:[1];
 else if(pattern==='other')out=all.filter(i=>!previous.includes(i));
 else if(pattern==='adjacent'){
  const neighbor=lane===0?1:lane===2?1:lane===1?(coin?0:2):lane===3&&points.length===5?(coin?0:2):1;
  out=[lane,neighbor];
 }else out=[lane];
 return [...new Set(out)].filter(i=>i>=0&&i<points.length&&(!melee||points[i].kind!=='retreat'));
}
export function tacticalMove(base,profile,index){
 const move={...base};
 if(profile.points>3&&index===0)move.melee=true;
 if(profile.tracking?.includes(index))move.tracking=true;
 if(profile.pressure===index&&profile.points>3){move.pattern='target';move.tracking=true;move.melee=false;}
 if(profile.chain===index){move.pattern='front';move.followPatterns=['rear','far'];move.follow=null;move.tracking=false;move.melee=false;}
 if(profile.hazard)move.hazard=true;
 return move;
}
