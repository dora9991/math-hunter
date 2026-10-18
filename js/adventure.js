// 冒険の進行と保存。戦闘や画面から独立させ、依頼の順序と報酬をここで管理する。
import { store } from './util.js';
import { ADDED_CHAPTERS, ADDED_QUESTS, SIDE_STORIES, NEW_EQUIPMENT, ANOMALIES } from './expansionContent.js';
import { FRONTIER_CHAPTERS, FRONTIER_QUESTS, PATH_BEASTS, questRoute } from './frontierContent.js';
export { SIDE_STORIES, ANOMALIES } from './expansionContent.js';

export const ADVENTURE_KEY = 'hunter.adventure.v1';
export const MATERIALS = { marks: 'ギルド貨', ore: '鉄鉱石', wood: '古木材', crystal: '理石のかけら', sigil: 'ギルド勲章', core: '古代核' };
export const PEOPLE = {
  mira: { name: '調査士 ミラ', role: '理石を追う研究者', color: '#86cdbb', initial: 'M', line: 'モンスターの足跡にも、きっと理由がある。まずは現地を見てみよう。' },
  gan: { name: '鍛冶師 ガン', role: '村に戻ってきた職人', color: '#eda265', initial: 'G', line: '強さは剣の重さだけじゃない。自分の戦い方に合う道具を選びな。' },
  toma: { name: '地図師 トーマ', role: '行方不明の隊を知る人', color: '#b7b2e5', initial: 'T', line: '地図の空白は、まだ誰も帰ってきていない場所だ。お前たちなら埋められるかもしれん。' },
  nagi: { name: '灯台守 ナギ', role: '海の向こうの旅人', color: '#79becf', initial: 'N', line: '灯を届けるのが私の仕事。いつか、自分の旅にも出てみたいな。' },
};

export const CHAPTERS = [
  { id: 'grassland', no: '01', name: '雷鳴の草原', title: '帰り道に灯を', color: '#a7bf65', subtitle: '止まった荷馬車と、壊れた石門。村の最初の一歩。', facility: 'forge' },
  { id: 'forest', no: '02', name: 'ささやきの森', title: '森が覚えている声', color: '#62b898', subtitle: '根に刻まれた数字は、消えた調査隊の道しるべだった。', facility: 'garden' },
  { id: 'desert', no: '03', name: '忘れられた砂海', title: '砂に眠る天秤', color: '#ddb16d', subtitle: '古代の遺跡で、六つの理石の役目を知る。', facility: 'market' },
  { id: 'snowland', no: '04', name: '白夜の雪国', title: '凍らない約束', color: '#95c6de', subtitle: '終わらない吹雪の奥に、あたたかな結晶が残っていた。', facility: 'clinic' },
  { id: 'summit', no: '05', name: '空渡りの山頂', title: '星を読む者たち', color: '#aaaee0', subtitle: 'かつてのハンター隊が残した観測所を目指す。', facility: 'observatory' },
  { id: 'volcano', no: '06', name: '始まりの火山', title: '六つの理石', color: '#e99570', subtitle: '世界を守ったはずの装置。その最後の選択。', facility: 'plaza' },
  ...ADDED_CHAPTERS,
  ...FRONTIER_CHAPTERS,
];

export const FACILITIES = [
  { id: 'guild', name: 'ギルドの天幕', desc: '依頼を受け、冒険の支度をする場所。', chapter: 0, x: 48, y: 60 },
  { id: 'forge', name: 'ガンの鍛冶屋', desc: '素材から、戦い方を変える装備を作れる。', chapter: 1, x: 24, y: 68 },
  { id: 'garden', name: '薬草園', desc: '冒険へ持っていく回復薬が1つ増える。', chapter: 2, x: 75, y: 75 },
  { id: 'market', name: '旅人の市場', desc: '依頼で手に入るギルド貨が20%増える。', chapter: 3, x: 69, y: 49 },
  { id: 'clinic', name: '山風の診療所', desc: '冒険に出るときの最大体力が15増える。', chapter: 4, x: 17, y: 42 },
  { id: 'observatory', name: '星読みの観測所', desc: '冒険で使える集中ゲージが2秒長くなる。', chapter: 5, x: 81, y: 28 },
  { id: 'plaza', name: '六灯の広場', desc: '六つの理石が灯る、村の新しい中心。', chapter: 6, x: 49, y: 34 },
];

export const EQUIPMENT = [
  { id: 'traveler', name: '旅立ちの装具', type: 'BALANCE', desc: '扱いやすい、最初のハンター装具。', detail: '集中 +1秒。攻撃と回復の基本を覚えやすい。', cost: {}, effects: { focus: 1 }, color: '#c5b58c' },
  { id: 'breaker', name: '雷牙の破砕具', type: 'BREAKER', desc: '部位を崩し、大技を封じる狩人へ。', detail: '部位への蓄積ダメージ +45% ／ 与えるダメージ −5%。', cost: { marks: 65, ore: 6, crystal: 2 }, effects: { parts: 1.45, damage: 0.95 }, color: '#e3bc64' },
  { id: 'counter', name: '風渡りの外套', type: 'COUNTER', desc: '攻撃を見切り、反撃で仕留める。', detail: '回避後の一撃 1.5倍 → 2倍 ／ 最大体力 −10。', cost: { marks: 70, wood: 5, crystal: 3 }, effects: { counter: 2, hp: -10 }, color: '#8ac8c2' },
  { id: 'focus', name: '星読みの護符', type: 'FOCUS', desc: 'じっくり考えるための時間を作る。', detail: '集中 +5秒 ／ 与えるダメージ −8%。', cost: { marks: 60, ore: 3, crystal: 5 }, effects: { focus: 5, damage: 0.92 }, color: '#b0a4de' },
  ...NEW_EQUIPMENT,
];

// 二つの調査地点は任意。観察で部位を狙いやすく、仕掛けを解くと集中が長くなる。
export const QUESTS = [
  { id: 'road', chapter: 0, enemy: 'raizen', name: '街道の雷鳴', place: '草原の古い街道', brief: '荷馬車が村に戻らない。雷牙獣の通り道を調べ、街道を取り戻そう。', trace: '焦げた道しるべ', clue: '肩の棘から放電している。左右の肩棘を両方壊せば、雷鳴放電を封じられる。', puzzle: '街道の標識', question: '標識の地点 0 から西へ3、東へ5。荷馬車の座標は？', choices: [-8, -2, 2, 8], answer: 2, hint: '西をマイナス、東をプラスにして、−3 + 5 を計算しよう。', report: ['荷馬車が戻り、村のかまどに久しぶりの火が入った。けれど森へ続く石門は、まだ大きな影に塞がれている。', 'ミラは焦げた棘の中から、青い理石のかけらを見つけた。「暴走の原因は、これかもしれない」'], reward: { marks: 50, ore: 4, wood: 3, crystal: 2 } },
  { id: 'gate', chapter: 0, enemy: 'gradon', name: '石門を塞ぐもの', place: '草原の崩れた石門', boss: true, brief: '鍛冶師ガンが石門の向こうで足止めされている。岩甲獣を退け、職人を村へ迎えよう。', trace: '砕けた岩盾', clue: '両側の甲殻が重い盾になっている。中央の崩落のあとは左右に追撃。予告が変わるまで油断しないこと。', puzzle: '石門の巻き上げ機', question: '同じ重さの石3個で12。石1個の重さ x は？ 3x = 12', choices: [3, 4, 9, 36], answer: 4, hint: '12を3等分すれば、石1個ぶんの重さになる。', report: ['石門が開いた。ガンは村の壊れた鍛冶場を見て、黙って道具を置いた。「助けてもらった借りだ。ここで、また打つさ」', '鍛冶屋が完成した。素材を使って装具を作れるようになった。森の奥には、行方不明の調査隊の印が残っているという。'], reward: { marks: 90, ore: 6, wood: 3, crystal: 3 } },
  { id: 'roots', chapter: 1, enemy: 'velum', name: '道を隠す根', place: '森林の分かれ道', brief: '一晩で道を塞いだ巨木。根の下には、古い調査隊の手帳が埋もれている。', trace: '折れた枝角', clue: '大枝の横薙ぎは隣り合う2か所を巻き込む。残った安全な場所を見つけよう。', puzzle: '木に刻まれた矢印', question: '分かれ道の座標は −4。東へ7進んだ手帳の場所は？', choices: [-11, -3, 3, 11], answer: 3, hint: '−4 + 7。0まで4進み、残りはいくつ？', report: ['手帳には「理石は六つで釣り合う」と書かれていた。最後のページだけが、水に濡れて読めない。', 'ミラは湖へ向かう古い足跡を指さす。「隊の誰かが、ここから先へ進んでいる」'], reward: { marks: 65, ore: 2, wood: 6, crystal: 3 } },
  { id: 'spring', chapter: 1, enemy: 'morga', name: '水源にひそむ影', place: '森林の霧の湖畔', boss: true, brief: '村へ流れる水が濁り、薬草が育たなくなった。湖を包む深沼竜の影を追う。', trace: '岸辺の泡の跡', clue: '濁流は左右から中央へ続く。最初の一撃を避けたあとも、次の予告を見よう。', puzzle: '水門の目盛り', question: '水門を x だけ開き、6を足すと11になる。x + 6 = 11', choices: [5, 6, 11, 17], answer: 5, hint: '両側から6を引くと、xだけが残る。', report: ['湖に澄んだ水が戻った。村に薬草園ができ、冒険に持っていける回復薬が一つ増えた。', '手帳の文字が乾く。「砂海の天秤で、最初の理石が動いた」。次の手がかりは古代の遺跡だ。'], reward: { marks: 90, ore: 3, wood: 6, crystal: 4 } },
  { id: 'dunes', chapter: 2, enemy: 'salda', name: '砂に消える足跡', place: '砂漠の風化した砂丘', brief: '砂丘を渡る隊商が遺跡への道を知っている。地中から襲う砂蠍竜を調べよう。', trace: '二本の鋏の溝', clue: '左右の鋏撃から中央への追撃に注意。左右の鋏を壊すと、砂塵竜巻を封じられる。', puzzle: '遺跡の石扉', question: '2つの同じ重りと3で13。重り x は？ 2x + 3 = 13', choices: [5, 8, 10, 20], answer: 5, hint: '先に3を引いて10。残った2個の重りで分けよう。', report: ['隊商の長は、遺跡の鍵を預けてくれた。壁画には、六つの光をつなぐハンターたちが描かれている。', 'その中央には、青い月を背にした竜。ミラは調査隊の紋章と同じ形だと気づいた。'], reward: { marks: 80, ore: 6, wood: 2, crystal: 4 } },
  { id: 'scales', chapter: 2, enemy: 'nebra', name: '眠れる天秤', place: '砂漠の紫煙の遺跡', boss: true, brief: '毒の霧に閉ざされた祭室。古代の天秤が、理石の仕組みを伝えている。', trace: '紫色の冠のかけら', clue: '毒冠は左右へ毒を散らす。瘴気爆発は左右のあと中央に届く。両側の毒鰭を狙おう。', puzzle: '地下への昇降機', question: '1回で地下へ2ずつ進む。3回動かすと、地上0からどの高さ？', choices: [-6, -5, 1, 6], answer: -6, hint: '地下へ進むので、−2 × 3。', report: ['天秤が示したのは、理石を一つ動かすと他の土地も変わるという事実だった。調査隊は、迫る大災害を止めようとしていたのだ。', '隊商が村に市場を開いた。依頼のギルド貨が増える。雪国から届いた救難の灯を追おう。'], reward: { marks: 110, ore: 5, wood: 3, crystal: 5 } },
  { id: 'snowpath', chapter: 3, enemy: 'frostra', name: '吹雪の救難灯', place: '雪国の凍てつく湖面', brief: '雪に埋もれた町から救難信号が届いた。氷刃竜の縄張りを越え、避難路を開く。', trace: '氷に残った翼の傷', clue: '氷翼の双氷弧は、反対側へも続く。両翼を破壊すると白氷嵐を止められる。', puzzle: '避難所の温度計', question: '気温 −8度から5度上がった。今の気温は？', choices: [-13, -3, 3, 13], answer: -3, hint: '−8 + 5。0に届くまであと何度必要だろう。', report: ['避難所に火が灯った。町の人々は、雪の奥で赤く光る結晶を見たという。', 'その結晶は氷を溶かしながら、同時に吹雪を呼んでいた。理石の釣り合いが、ここでも崩れている。'], reward: { marks: 100, ore: 4, wood: 5, crystal: 5 } },
  { id: 'embers', chapter: 3, enemy: 'sektra', name: '雪の中の残り火', place: '雪国の熔晶洞', boss: true, brief: '雪原の奥に潜む熔晶竜。熱と冷気の異変を止め、凍えた町に季節を戻そう。', trace: '温かい結晶片', clue: '熔晶柱は左右、裂晶波は中央から左右へ。予告の切り替わりを見て移動しよう。', puzzle: '避難炉の調整弁', question: '調整値を3倍して4引くと11。3x − 4 = 11 の x は？', choices: [3, 5, 7, 15], answer: 5, hint: 'まず4を足して15。それを3で割る。', report: ['吹雪がやみ、町へ朝が戻った。助けた医師が村へ来て診療所を開く。冒険の最大体力が15増えた。', '医師は調査隊の最後の通信を覚えていた。「答えは、空の観測所にある」'], reward: { marks: 120, ore: 6, wood: 4, crystal: 6 } },
  { id: 'skyway', chapter: 4, enemy: 'veira', name: '風の渡り道', place: '山頂の空の回廊', brief: '観測所へ続く尾根を蒼翼竜が巡る。風の流れを読み、空の道へ踏み出そう。', trace: '岩に刺さった蒼い羽', clue: '片翼を壊すと急降下が止まり、両翼を壊すと蒼天落雷を封じられる。', puzzle: '尾根の座標盤', question: '座標 (−2, 3) から東へ5進む。新しい x 座標は？', choices: [-7, -3, 3, 8], answer: 3, hint: '東へ進むとxが増える。−2 + 5を計算しよう。', report: ['雲の切れ間に観測所が現れた。入口には、調査隊が持ち帰るはずだった星図が残されている。', 'トーマの声が震えた。「この筆跡は、隊長のものだ。ここまで来ていたのか」'], reward: { marks: 110, ore: 5, wood: 4, crystal: 6 } },
  { id: 'stars', chapter: 4, enemy: 'galdo', name: '星を閉ざす鋼翼', place: '山頂の高空の石舞台', boss: true, brief: '鋼翼竜の暴風の奥で、観測装置がまだ動いている。調査隊の最後の記録を取り戻そう。', trace: '鋼羽の落下点', clue: '鋼翼の十字斬りは反対側へも続く。両翼を壊し、鋼鉄の暴風を止めよう。', puzzle: '観測鏡の角度', question: '同じ角度を3つ合わせると12。1つぶんの角度は？', choices: [3, 4, 9, 36], answer: 4, hint: '12 ÷ 3 を計算しよう。', report: ['記録には、火山の装置が世界を「一つの状態」に固定しようとしているとあった。理石の暴走は、その装置から逃れるための反動だった。', '村の観測所が完成した。集中が2秒長くなる。最後の座標は、すべてが始まった火山を指している。'], reward: { marks: 140, ore: 6, wood: 4, crystal: 7 } },
  { id: 'crater', chapter: 5, enemy: 'barza', name: '火口の鼓動', place: '火山の火口の裂け目', brief: '装置へ続く道は溶岩に分断されている。熔岩獣を退け、理石の流れを読み取ろう。', trace: '冷えた溶岩甲', clue: '火山噴出は中央のあと左右へ。溶岩甲を両方壊すと、この大技を封じられる。', puzzle: '溶岩水門の目盛り', question: '弁を4倍して2足すと18。4x + 2 = 18 の x は？', choices: [4, 5, 8, 16], answer: 4, hint: '18から2を引いて16。それを4で割る。', report: ['火口の底に、巨大な輪が見えた。六つの理石を集めた装置は、今も同じ夜を繰り返そうとしている。', 'ミラは首を振った。「世界は変わり続ける。その釣り合いを、取り戻そう」'], reward: { marks: 130, ore: 7, wood: 3, crystal: 7 } },
  { id: 'guardian', chapter: 5, enemy: 'zarva', name: '輪を守る焔角', place: '火山の古代装置', boss: true, brief: '装置の前に立つ焔角竜。最後の封印を越え、調査隊が選べなかった答えへ進む。', trace: '焼けた守護の紋章', clue: '中央は頭を狙えるが、噛みつきと火球が来る。尻尾回転は全域を巻き込むので回避を解こう。', puzzle: '封印の調整式', question: '2x + 6 = 20。封印に合わせる x の値は？', choices: [6, 7, 13, 14], answer: 7, hint: '両側から6を引いて、残った値を2で割ろう。', report: ['焔角が退き、装置の輪が開いた。中にいたのは、調査隊の紋章を宿した月影竜だった。', '最後の理石は、竜自身が守っていた。かつて隊長を助けた守護竜は、装置の中で長い夜を見続けていたのだ。'], reward: { marks: 150, ore: 7, wood: 4, crystal: 8 } },
  { id: 'sixlights', chapter: 5, enemy: 'lunax', name: '夜明けの六つの灯', place: '火口の天文台', background: 'summit', boss: true, brief: '月影竜を装置から解き放ち、六つの理石をそれぞれの土地へ返す。長い夜に、夜明けを。', trace: '調査隊の最後の印', clue: '影渡りのあとは位置を確認。影翼を両方壊すと、大技・月蝕を止められる。', puzzle: '六灯の均衡盤', question: '左と右を同じにする。x − 3 = 2x − 8 の x は？', choices: [-5, 3, 5, 11], answer: 5, hint: '両側からxを引くと −3 = x − 8。次に8を足そう。', report: ['輪が止まり、六つの光がそれぞれの土地へ帰っていく。月影竜は一度だけ振り返り、明るくなる空へ飛び立った。', '村の広場には、六つの小さな灯がともった。戻ってきた人々の声が、いつもの朝を作っている。「おかえり、数学ハンター」', '第一部をクリアしました。海の向こうから、新しい救難の灯が届きます。第7章と異変討究が開放されました。'], reward: { marks: 200, ore: 8, wood: 6, crystal: 10 } },
  ...ADDED_QUESTS,
  ...FRONTIER_QUESTS,
];
export const ALL_QUESTS = [...QUESTS, ...SIDE_STORIES];
export const getQuest = id => ALL_QUESTS.find(q => q.id === id);
export const MONSTER_QUESTS = [
  ...ALL_QUESTS.filter((q, i, all) => all.findIndex(x => x.enemy === q.enemy) === i),
  ...Object.keys(PATH_BEASTS).map(enemy=>{const q=QUESTS.find(q=>questRoute(q).some(s=>s.enemy===enemy));return{id:'path_'+enemy,enemy,chapter:q.chapter,small:true,clue:'ボスへ続く道中に生息する小型魔獣。予告を見ながら正解を重ね、必殺ゲージを決戦へ引き継ごう。'};}),
];

const unique = a => [...new Set(Array.isArray(a) ? a : [])];
const count = v => Number.isFinite(v) ? Math.max(0, Math.min(1e7, Math.floor(v))) : 0;
const runId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const medalValue = { B: 1, A: 2, S: 3 };
export function huntMedal(r) {
  if (!r.win) return null;
  if (r.correct >= 8 && r.rate >= 95 && r.hitsTaken === 0 && r.time > 0 && r.time <= 210) return 'S';
  return r.correct >= 8 && r.rate >= 85 ? 'A' : 'B';
}
export function freshAdventure() {
  return { version: 1, introSeen: false, completed: [], sideCompleted: [], investigations: {}, materials: Object.fromEntries(Object.keys(MATERIALS).map(k=>[k,0])), crafted: ['traveler'], equipped: 'traveler', upgrades: {}, medals: {}, challengeMedals: {}, anomalies: {}, rankXP: 0, pathKills:0, specials:0, claimed: [], title: null, difficulty: 'easy', journal: {}, receipts: [], pendingStory: null };
}
export function normalizeAdventure(raw) {
  const s = freshAdventure();
  if (!raw || typeof raw !== 'object') return s;
  s.introSeen = !!raw.introSeen;
  const completed = unique(raw.completed);
  for (const q of QUESTS) { if (!completed.includes(q.id)) break; s.completed.push(q.id); }
  s.sideCompleted = unique(raw.sideCompleted).filter(id=>SIDE_STORIES.some(q=>q.id===id));
  for (const q of ALL_QUESTS) s.investigations[q.id] = unique(raw.investigations?.[q.id]).filter(x => x === 'trace' || x === 'rune');
  for (const k of Object.keys(MATERIALS)) s.materials[k] = count(raw.materials?.[k]);
  s.crafted = unique(['traveler', ...unique(raw.crafted)]).filter(id => EQUIPMENT.some(e => e.id === id));
  s.equipped = s.crafted.includes(raw.equipped) ? raw.equipped : 'traveler';
  for (const id of s.crafted) s.upgrades[id] = Math.min(5, count(raw.upgrades?.[id]));
  for (const q of ALL_QUESTS) if (medalValue[raw.medals?.[q.id]]) s.medals[q.id] = raw.medals[q.id];
  for (const [key,value] of Object.entries(raw.challengeMedals || {})) if (medalValue[value] && key.length < 100) s.challengeMedals[key]=value;
  s.rankXP = raw.rankXP === undefined ? s.completed.length * 80 : count(raw.rankXP);
  s.pathKills=count(raw.pathKills);s.specials=count(raw.specials);
  s.claimed = unique(raw.claimed).filter(x=>typeof x==='string').slice(0,30);
  s.title = s.claimed.includes(raw.title) ? raw.title : null;
  if (['easy', 'normal', 'hard'].includes(raw.difficulty)) s.difficulty = raw.difficulty;
  for (const q of MONSTER_QUESTS) {
    const j = raw.journal?.[q.enemy];
    if (j && typeof j === 'object') s.journal[q.enemy] = { seen: true, kills: count(j.kills), attacks: unique(j.attacks).filter(x => typeof x === 'string').slice(0, 12), breaks: unique(j.breaks).filter(x => typeof x === 'string').slice(0, 12), best: Number.isFinite(j.best) && j.best > 0 ? j.best : null };
    s.anomalies[q.enemy] = Math.min(20, count(raw.anomalies?.[q.enemy]));
  }
  s.receipts = unique(raw.receipts).filter(x => typeof x === 'string').slice(-80);
  s.pendingStory = [...s.completed,...s.sideCompleted].includes(raw.pendingStory) ? raw.pendingStory : null;
  return s;
}

export class Adventure {
  constructor(raw = store.get(ADVENTURE_KEY, null), save = s => store.set(ADVENTURE_KEY, s)) { this.state = normalizeAdventure(raw); this._save = save; this.saveFailed = false; }
  save() { this.saveFailed = this._save(this.state) === false; }
  get nextQuest() { return QUESTS.find(q => !this.state.completed.includes(q.id)) || null; }
  get chaptersDone() { return CHAPTERS.filter((_, i) => QUESTS.filter(q => q.chapter === i).every(q => this.state.completed.includes(q.id))).length; }
  get firstArcDone() { return this.state.completed.includes('sixlights'); }
  get rank() { return Math.min(20, 1 + Math.floor(Math.sqrt(this.state.rankXP / 100))); }
  available(id) {
    const q=getQuest(id); if (!q) return false;
    if (q.side) return this.chaptersDone >= q.unlock && (!q.requires || this.state.sideCompleted.includes(q.requires));
    const i=QUESTS.indexOf(q); return i===0 || this.state.completed.includes(QUESTS[i-1].id);
  }
  facility(id) { const f = FACILITIES.find(f => f.id === id); return !!f && this.chaptersDone >= f.chapter; }
  equipment() { return EQUIPMENT.find(e => e.id === this.state.equipped) || EQUIPMENT[0]; }
  seenIntro() { this.state.introSeen = true; this.save(); }
  acknowledgeStory() { this.state.pendingStory = null; this.save(); }
  setDifficulty(value) { if (!['easy', 'normal', 'hard'].includes(value)) return false; this.state.difficulty = value; this.save(); return true; }
  investigate(id, site, answer) {
    const q = getQuest(id);
    if (!q || !this.available(id) || !['trace', 'rune'].includes(site)) return false;
    if (site === 'rune' && Number(answer) !== q.answer) return false;
    const sites = this.state.investigations[id] || (this.state.investigations[id] = []);
    if (!sites.includes(site)) sites.push(site);
    this.save(); return true;
  }
  canAfford(cost) { return !!cost && Object.entries(cost).every(([k,v])=>this.state.materials[k]>=v); }
  spend(cost) { for (const [k,v] of Object.entries(cost)) this.state.materials[k]-=v; }
  canCraft(id) {
    const e=EQUIPMENT.find(e=>e.id===id);
    return !!e && this.facility('forge') && this.chaptersDone >= (e.unlock||0) && !this.state.crafted.includes(id) && this.canAfford(e.cost);
  }
  craft(id) { if (!this.canCraft(id)) return false; this.spend(EQUIPMENT.find(e=>e.id===id).cost); this.state.crafted.push(id); this.state.equipped=id; this.save(); return true; }
  equip(id) { if (!this.state.crafted.includes(id)) return false; this.state.equipped=id; this.save(); return true; }
  upgradeCost(id) {
    if (!this.state.crafted.includes(id)) return null;
    const n=this.state.upgrades[id]||0; if (n>=5) return null;
    return { marks:80*(n+1), ore:4+n*3, crystal:3+n*2, ...(n>=2?{sigil:n-1}:{}), ...(n>=3?{core:n-2}:{}) };
  }
  canUpgrade(id) { return this.facility('forge') && this.canAfford(this.upgradeCost(id)); }
  upgrade(id) { if (!this.canUpgrade(id)) return false; this.spend(this.upgradeCost(id)); this.state.upgrades[id]=(this.state.upgrades[id]||0)+1; this.save(); return true; }
  effectsFor(id=this.state.equipped) {
    const e=EQUIPMENT.find(e=>e.id===id)||EQUIPMENT[0], n=this.state.upgrades[id]||0;
    const effects={ damage:1,parts:1,counter:1.5,hp:0,focus:0,potions:0,...e.effects };
    effects.damage *= 1+n*.035; effects.hp+=n*2; effects.focus=+(effects.focus+n*.4).toFixed(1);
    return effects;
  }
  observeEnemy(enemy) {
    if(!MONSTER_QUESTS.some(q=>q.enemy===enemy))return false;
    this.state.journal[enemy] ||= {seen:true,kills:0,attacks:[],breaks:[],best:null};
    this.save();return true;
  }
  prepareRun(id, direct=false) {
    const q=getQuest(id); if (!q || !this.available(id)) return null;
    const effects=this.effectsFor(), sites=this.state.investigations[id]||[];
    if (sites.includes('trace')) effects.parts+=.15;
    if (sites.includes('rune')) effects.focus+=2;
    if (this.facility('garden')) effects.potions++;
    if (this.facility('clinic')) effects.hp+=15;
    if (this.facility('observatory')) effects.focus+=2;
    const route=direct?[{enemy:q.enemy,kind:'boss'}]:questRoute(q);this.observeEnemy(route[0].enemy);
    return { id:runId(),type:q.side?'side':'story',questId:q.id,equipment:this.state.equipped,upgrade:this.state.upgrades[this.state.equipped]||0,effects,boss:!!q.boss,difficulty:this.state.difficulty,route,encounter:{hp:1,damage:1,speed:1} };
  }
  prepareChallenge(enemy,tier,condition='normal') {
    if (!this.firstArcDone || !this.state.journal[enemy] || !ANOMALIES[condition] || !Number.isInteger(tier) || tier<1 || tier>Math.min(20,(this.state.anomalies[enemy]||0)+1)) return null;
    const q=ALL_QUESTS.find(q=>q.enemy===enemy&&this.available(q.id)); if(!q) return null;
    const run=this.prepareRun(q.id,true), c=ANOMALIES[condition];
    run.type='challenge'; run.tier=tier; run.condition=condition; run.boss=true;
    run.route=[{enemy,kind:'boss'}];
    run.encounter={hp:(1+tier*.10)*c.hp,damage:(1+tier*.06)*c.damage,speed:c.speed/(1+tier*.025)};
    run.effects.parts*=c.parts||1;
    return run;
  }
  finishStage(run,index,result) {
    const q=getQuest(run?.questId), stage=run?.route?.[index], receipt=`${run?.id}:path:${index}`;
    if(!q||!this.available(q.id)||stage?.kind!=='path'||!PATH_BEASTS[stage.enemy]||!result.win||this.state.receipts.includes(receipt))return null;
    this.state.receipts.push(receipt);this.state.receipts=this.state.receipts.slice(-80);
    this.observeEnemy(stage.enemy);const j=this.state.journal[stage.enemy];
    j.kills++;j.attacks=unique([...j.attacks,...(result.attacks||[])]);j.breaks=unique([...j.breaks,...(result.breaks||[])]);
    if(result.time>0&&(!j.best||result.time<j.best))j.best=result.time;
    const reward={marks:12+q.chapter*2,[index%2?'wood':'ore']:1,crystal:unique(result.breaks).length};
    for(const[k,v]of Object.entries(reward))this.state.materials[k]+=v;
    this.state.pathKills++;this.state.rankXP+=10;
    this.state.specials+=count(result.specials);run.recordedSpecials=(run.recordedSpecials||0)+count(result.specials);
    this.save();return reward;
  }
  milestones() {
    const s=this.state, kills=Object.values(s.journal).reduce((n,j)=>n+j.kills,0), top=Math.max(0,...Object.values(s.anomalies));
    return [
      ['firstpath','街道の開拓者',s.completed.length,2,{sigil:2,marks:80}],
      ['lamplighter','六灯の守り手',this.firstArcDone?1:0,1,{sigil:4,core:2}],
      ['storyteller','仲間の理解者',s.sideCompleted.length,6,{sigil:5,core:2}],
      ['returner','海を越える者',s.completed.includes('newdawn')?1:0,1,{sigil:8,core:4}],
      ['artisan','五段の名工',Math.max(0,...Object.values(s.upgrades)),5,{sigil:4,core:2}],
      ['hunter','百戦の狩人',kills,100,{sigil:10,core:5}],
      ['observer','魔獣の探究者',Object.keys(s.journal).length,MONSTER_QUESTS.length,{sigil:6,core:3}],
      ['perfect','見切りの達人',Object.values(s.medals).filter(x=>x==='S').length,5,{sigil:5,core:2}],
      ['anomaly','異変を鎮める者',top,10,{sigil:8,core:4}],
      ['limit','境界を越える者',top,20,{sigil:12,core:6}],
      ['companions','旅をつなぐ者',s.sideCompleted.length,SIDE_STORIES.length,{sigil:8,core:4}],
      ['trailblazer','道をひらく者',s.pathKills,50,{sigil:6,core:3}],
      ['resonance','六灯の剣士',s.specials,20,{sigil:6,core:3}],
      ['seedbearer','種を運ぶ者',s.completed.includes('worldweave')?1:0,1,{sigil:10,core:5}],
    ].map(([id,name,value,target,reward])=>({id,name,value,target,reward,ready:value>=target,claimed:s.claimed.includes(id)}));
  }
  claim(id) {
    const m=this.milestones().find(m=>m.id===id); if(!m?.ready||m.claimed)return false;
    for(const [k,v]of Object.entries(m.reward))this.state.materials[k]+=v;
    this.state.claimed.push(id);this.state.title=id;this.save();return true;
  }
  equipTitle(id) { if(!this.milestones().some(m=>m.id===id&&m.claimed))return false;this.state.title=id;this.save();return true; }
  finishRun(run,result) {
    const q=getQuest(run?.questId);
    if(!q||!this.available(q.id)||this.state.receipts.includes(run.id))return null;
    this.state.receipts.push(run.id);this.state.receipts=this.state.receipts.slice(-80);
    const observed=MONSTER_QUESTS.some(x=>x.enemy===result.enemy)?result.enemy:q.enemy;
    const j=this.state.journal[observed] ||= {seen:true,kills:0,attacks:[],breaks:[],best:null};
    j.attacks=unique([...j.attacks,...(result.attacks||[])]);j.breaks=unique([...j.breaks,...(result.breaks||[])]);
    const list=q.side?this.state.sideCompleted:this.state.completed, challenge=run.type==='challenge';
    const first=!!result.win&&!challenge&&!list.includes(q.id), before=this.chaptersDone, reward={};
    this.state.specials+=Math.max(0,count(result.specials)-(run.recordedSpecials||0));
    const key=challenge?`${q.enemy}:${run.tier}:${run.condition}:${run.difficulty}`:q.id, medal=huntMedal(result);
    const medals=challenge?this.state.challengeMedals:this.state.medals;
    if(medal&&(!medals[key]||medalValue[medal]>medalValue[medals[key]]))medals[key]=medal;
    if(result.win){
      j.kills++;if(result.time>0&&(!j.best||result.time<j.best))j.best=result.time;
      if(first){list.push(q.id);this.state.pendingStory=q.id;}
      if(challenge){
        const newLevel=run.tier>(this.state.anomalies[q.enemy]||0);this.state.anomalies[q.enemy]=Math.max(run.tier,this.state.anomalies[q.enemy]||0);
        Object.assign(reward,{marks:70+run.tier*12,ore:4+Math.floor(run.tier/3),crystal:4+Math.floor(run.tier/2),sigil:(newLevel?3:1)+Math.floor(run.tier/5)+ANOMALIES[run.condition].extra,...(run.tier>=5?{core:newLevel?2:1}:{})});
      }else{
        for(const [k,value]of Object.entries(q.reward))reward[k]=Math.max(1,Math.floor(value*(first?1:.4)*(k==='marks'&&this.facility('market')?1.2:1)));
      }
      reward.crystal=(reward.crystal||0)+unique(result.breaks).length;
      for(const [k,value]of Object.entries(reward))this.state.materials[k]+=value;
      this.state.rankXP+=challenge?40+run.tier*10:first?q.side?100:80:20;
    }
    const facility=this.chaptersDone>before?FACILITIES.find(f=>f.chapter===this.chaptersDone)?.id:null;
    this.save();
    return {questId:q.id,first,reward,facility,medal,bestMedal:medals[key]||null,challenge,tier:run.tier,condition:run.condition,enemy:q.enemy,side:!!q.side,rank:this.rank,ending:first&&q.id==='worldweave',secondArcEnding:first&&q.id==='newdawn',arcEnding:first&&q.id==='sixlights'};
  }
}
