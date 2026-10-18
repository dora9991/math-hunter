// 第三部「種を運ぶ者たち」。道中の生態系と、新たな大型魔獣。
const attack=(name,motion,pattern,tele,damage,follow=null)=>({name,motion,pattern,tele,damage,level:pattern==='all'?3:pattern==='target'?1:2,hitAt:pattern==='all'?1.5:1.1,...(follow?{follow}:{})});
const small=(name,short,stage,part,color,motions)=>({name,short,stage,field:'道中の縄張り',sidePart:part,color,small:true,scale:.46,hp:.22,damage:.48,area:2,x:0,z:5,spacing:2.5,front:1.6,moves:motions});
const large=(name,short,stage,field,sidePart,color,moves,opts={})=>({name,short,stage,field,sidePart,color,moves,area:2,x:0,z:5,spacing:4.4,front:2.8,...opts});
export const PATH_BEASTS={
  sparko:small('雷尾小獣スパルコ','スパルコ','storm','尾棘',0xf5d975,[attack('ぱちぱち飛びつき','pounce','target',6.8,15),attack('雷尾のひと振り','tail','center',7.4,17),attack('小さな放電','pulse','sides',8.2,20)]),
  bristle:small('石棘猪ブリスト','ブリスト','stone','石棘',0xcbb091,[attack('石鼻の突進','charge','target',7.1,17),attack('小石の跳ね上げ','slam','sides',7.6,16),attack('丸まり転がり','shellguard','center',8.5,22)]),
  capling:small('灯茸コプリン','コプリン','forest','菌傘',0xedaecb,[attack('胞子のくしゃみ','lantern','target',7.2,14),attack('菌糸の輪','root','center',7.8,17),attack('灯の花粉','pulse','sides',8.5,19)]),
  chittra:small('葉羽虫チトラ','チトラ','forest','葉翅',0xb9db88,[attack('葉刃の一閃','scissor','target',6.9,16),attack('羽ばたき払い','wing','adjacent',7.8,17),attack('葉隠れの跳躍','pounce','center',8.6,20)]),
  sandlet:small('砂潜蛇サンドル','サンドル','dune','砂鰭',0xe4c292,[attack('砂からこんにちは','burrow','target',7.1,15),attack('蛇行の砂跡','serpent','sides',7.9,17),attack('砂噴き','breath','center',8.8,20)]),
  dunebeetle:small('砂甲虫デュネ','デュネ','dune','角殻',0xce9c65,[attack('角殻の頭突き','charge','target',7.3,17),attack('砂玉ころがし','shellguard','center',8.0,18),attack('砂煙の羽ばたき','wing','sides',8.8,21)]),
  frosthare:small('雪跳兎フリュネ','フリュネ','ice','霜耳',0xd5f3ed,[attack('雪玉キック','pounce','target',6.7,14),attack('耳払い','sweep','adjacent',7.6,16),attack('白い息','breath','center',8.8,19)]),
  snowcub:small('氷子狼コルフ','コルフ','ice','氷肩',0xa8c9f7,[attack('子狼の飛びつき','pounce','target',6.6,16),attack('氷爪の往復','claw','sides',7.8,17),attack('小さな遠吠え','howl','center',8.6,21)]),
  windling:{...small('風小鴉ウィンル','ウィンル','sky','風羽',0xa9d5e5,[attack('風羽のついばみ','dive','target',7.0,16),attack('風の横切り','wing','adjacent',7.9,17),attack('小つむじ','orbit','sides',8.8,20)]),flying:true},
  nightbat:{...small('星蝙蝠ルミバット','ルミバット','moon','星翼',0xc9b4ef,[attack('逆さ落とし','comet','target',7.1,15),attack('星翼のひらめき','wing','sides',7.8,17),attack('反響音','howl','center',8.7,20)]),flying:true},
  ashling:small('灰蜥蜴アシュル','アシュル','lava','灰鱗',0xdbab8b,[attack('灰爪','claw','target',7.1,16),attack('熱いしっぽ','tail','adjacent',7.9,18),attack('灰息','breath','center',8.8,20)]),
  emberling:small('火玉獣ポルカ','ポルカ','lava','火殻',0xffbe80,[attack('火玉の体当たり','charge','target',7.4,17),attack('火花のくしゃみ','lantern','sides',8.0,17),attack('火輪ころがし','orbit','center',9.0,22)]),
};
export const FRONTIER_BOSSES={
  rhinox:large('鉄角犀ロクサル','ロクサル','stone','芽吹きの大橋','鉄肩',0xc69e78,[attack('三歩の鉄角','charge','target',6.5,35),attack('地削りの角','sweep','adjacent',7.8,37,'other'),attack('大技・大橋砕き','quake','center',11.2,59,'sides')],{spacing:4.0,front:2.4}),
  chelona:large('島甲亀ケロナ','ケロナ','marsh','芽吹きの湿原','島甲',0x9cc69a,[attack('岸辺の押し波','tide','sides',7.0,33),attack('島甲の転身','shellguard','adjacent',8.0,38,'other'),attack('大技・浮島隆起','root','center',11.5,60,'sides')],{spacing:5.2,front:2.3}),
  arachna:large('絹糸蜘蛛アラクナ','アラクナ','forest','絹糸の回廊','糸鋏',0xc9a4e0,[attack('糸鋏の挟撃','scissor','sides',6.6,35),attack('糸渡りの急襲','comet','target',7.8,38,'other'),attack('大技・八糸の檻','root','center',11.3,61,'sides')],{spacing:5.1}),
  seirun:large('流刃蛇セイルーン','セイルーン','marsh','逆流の水路','流刃鰭',0x8ed9d5,[attack('蛇行する流刃','serpent','adjacent',6.3,35),attack('逆流の二重波','tide','center',8.0,39,'sides'),attack('大技・渦環の牢','orbit','all',11.7,62)],{spacing:4.8,front:3.4}),
  vulpira:large('夢尾狐ヴルピラ','ヴルピラ','moon','鏡月の森','夢尾',0xe9b6bd,[attack('鏡返しの爪','claw','target',6.1,34,'other'),attack('夢尾の残光','phase','sides',8.2,38,'center'),attack('大技・九尾の夜道','lantern','all',11.8,63)],{spacing:4.0,front:2.4}),
  mothria:large('月翅蛾モスリア','モスリア','poison','月繭の広場','月翅',0xdcbef0,[attack('月粉の散布','lantern','target',6.8,34),attack('翅模様の反転','wing','adjacent',8.1,39,'other'),attack('大技・月繭の目覚め','pulse','sides',11.8,64,'center')],{flying:true,spacing:5.6}),
  scorvex:large('鉱毒蠍スコルヴェクス','スコルヴェクス','dune','砂陽の鉱脈','鉱鋏',0xd7ba6f,[attack('鉱針の三段突き','lance','target',6.2,36),attack('鋏の採掘線','scissor','sides',8.0,40,'center'),attack('大技・鉱毒噴泉','burrow','center',11.6,64,'sides')],{spacing:4.6}),
  solvyr:large('太陽竜ソルヴィル','ソルヴィル','lava','砂陽の炉心','陽翼',0xffcd79,[attack('陽炎の滑空','dive','target',6.6,36),attack('日輪の返し','orbit','adjacent',8.3,41,'other'),attack('大技・白昼の太陽','howl','all',12.2,67)],{flying:true,spacing:5.8,front:3.6}),
  gryphor:large('風冠鷲グリフォル','グリフォル','sky','嵐鐘の峠','冠羽',0xc1d6aa,[attack('風冠の鉤爪','pounce','target',6.1,36),attack('翼風の往復','wing','sides',8.0,40,'center'),attack('大技・風王の回廊','comet','all',11.8,65)],{flying:true,spacing:5.4,front:3.5}),
  noctyra:large('鐘翼蝠ノクティラ','ノクティラ','moon','反響する鐘楼','鐘翼',0xaaa5db,[attack('鐘音の急襲','comet','target',6.5,36),attack('反響の交差','howl','adjacent',8.3,41,'other'),attack('大技・無音の鐘','pulse','center',12.0,66,'sides')],{flying:true,spacing:5.2}),
  tempestr:large('雷嵐鳥テンペストラ','テンペストラ','storm','天風の稜線','嵐羽',0x93d4f3,[attack('雷羽の斜行','wing','adjacent',6.4,38),attack('雲間の落雷','comet','sides',8.5,43,'center'),attack('大技・天風雷葬','storm','all',12.5,70)],{flying:true,spacing:6.0,front:3.8}),
  mammora:large('霧牙巨象マンモラ','マンモラ','forest','世界樹の根元','霧牙',0xc8c5b5,[attack('霧牙の踏進','charge','target',6.9,39),attack('鼻槌の返し','slam','adjacent',8.5,43,'other'),attack('大技・根海の鼓動','quake','center',12.4,70,'sides')],{spacing:4.9,front:2.4}),
  astravor:large('創星竜アストラヴォル','アストラヴォル','moon','世界樹の岬','創星翼',0xeed6a0,[attack('星路の折り目','serpent','adjacent',6.7,40,'other'),attack('六灯の環流','orbit','sides',8.8,45,'center'),attack('大技・星海開闢','comet','all',13.0,75)],{flying:true,spacing:6.2,front:4.0,hp:1.2}),
};
export const FRONTIER_BEASTS={...PATH_BEASTS,...FRONTIER_BOSSES};
export const ROUTE_PAIRS=[['sparko','bristle'],['capling','chittra'],['sandlet','dunebeetle'],['frosthare','snowcub'],['windling','nightbat'],['ashling','emberling'],['sandlet','sparko'],['capling','chittra'],['dunebeetle','sandlet'],['frosthare','snowcub'],['windling','nightbat'],['ashling','emberling'],['bristle','capling'],['chittra','sandlet'],['nightbat','frosthare'],['dunebeetle','ashling'],['windling','sparko'],['snowcub','emberling']];
export function questRoute(q){
  const pair=ROUTE_PAIRS[q.chapter]||ROUTE_PAIRS[0];
  return [...(q.boss?pair:q.chapter>=12&&!q.side?[pair[0]]:[]).map(enemy=>({enemy,kind:'path'})),{enemy:q.enemy,kind:q.boss?'boss':'target'}];
}
export const FRONTIER_CHAPTERS=[
  {id:'greenbridge',no:'13',name:'芽吹きの湿原',title:'小さな荷物、大きな橋',color:'#a8cda4',art:'marsh',background:'grassland',subtitle:'ナギの手紙が運んできた、六つの土地からの小さな頼みごと。'},
  {id:'silkroad',no:'14',name:'絹糸の回廊',title:'切らずにつなぐ道',color:'#b3c69c',art:'forest',background:'forest',subtitle:'人と魔獣が同じ水を使う森で、新しい橋の架け方を探す。'},
  {id:'mirrormoon',no:'15',name:'鏡月の森',title:'忘れものに名前を',color:'#d1b6df',art:'forest',background:'forest',subtitle:'夢に置き忘れた声を拾い、夜の配達人の地図を作る。'},
  {id:'sunforge',no:'16',name:'砂陽の鉱都',title:'分け合う火',color:'#e8c187',art:'desert',background:'desert',subtitle:'誰か一人のために燃やしていた炉を、町のみんなで動かす。'},
  {id:'stormbell',no:'17',name:'嵐鐘の高地',title:'嵐のあとに鳴る鐘',color:'#a8c9df',art:'summit',background:'summit',subtitle:'離れた町へ同じ知らせを届けるため、風の鐘をつなぐ。'},
  {id:'worldcape',no:'18',name:'世界樹の岬',title:'種を運ぶ者たち',color:'#d4d4b0',art:'summit',background:'summit',subtitle:'六つの土地から預かった種が、世界樹の岬で次の旅を始める。'},
];
const riddles=[
 ['湿原の水位','水位−7から12上がり、3下がる。今の水位は？',[-22,-2,2,8],2,'−7 + 12 − 3を順に計算する。'],
 ['橋の支柱','4x + 6 = 30。支柱の間隔xは？',[4,6,9,24],6,'6を引いた24を4等分する。'],
 ['糸橋の長さ','全長18mの橋の2/3は何m？',[6,9,12,27],12,'18を3で割り、その2倍。'],
 ['水路の比例','毎分3Lの水が流れる。7分で何L？',[10,18,21,24],21,'1分ぶんの3Lを7倍する。'],
 ['鏡の座標','座標−5を原点0に対して反転すると？',[-10,-5,0,5],5,'原点の反対側で、同じ距離の座標を探す。'],
 ['月繭の式','2(x − 4) = 3x − 15。xは？',[3,7,11,19],7,'かっこを開いてxを片側に集めよう。'],
 ['鉱石の配分','鉄鉱石36個を2:1に分ける。多い方は？',[12,18,24,30],24,'全体を3等分し、その2つぶんを取る。'],
 ['太陽炉の温度','−4の2乗ではなく、(−4)² − 6の値は？',[-22,-10,10,22],10,'かっこの中全体を2乗すると16。そこから6を引く。'],
 ['鐘の周期','6分ごとと8分ごとの鐘。最初に同時に鳴るのは何分後？',[12,14,24,48],24,'6と8の最小公倍数を探す。'],
 ['風の測量','5x + 4 = 2x + 25。xは？',[5,7,9,21],7,'両側から2xと4を引いて3x = 21。'],
 ['根の成長','3日で12cm伸びる根。同じ速さなら5日で何cm？',[15,17,20,60],20,'1日ぶんは12 ÷ 3。5日ぶんにする。'],
 ['種の均衡','4(x + 2) = 2x + 26。xは？',[7,8,9,17],9,'かっこを開いて4x + 8 = 2x + 26。'],
];
const q=(id,chapter,enemy,name,brief,report,index,boss=false)=>{const p=riddles[index%12],b=FRONTIER_BOSSES[enemy];return{id,chapter,enemy,name,brief,report,boss,place:FRONTIER_CHAPTERS[chapter-12].name,trace:`${b?.sidePart||'魔獣'}の痕跡`,clue:`${b?.moves[0].name||'攻撃'}の予告を確認しよう。道中で正解を重ね、必殺ゲージを決戦に残す作戦も有効。左右の部位を壊すと大技を封じられる。`,puzzle:p[0],question:p[1],choices:p[2],answer:p[3],hint:p[4],reward:{marks:220+index*8,ore:7+index%4,wood:6+index%3,crystal:8+index%5,...(boss?{core:2,sigil:2}:{})}};};
export const FRONTIER_QUESTS=[
 q('seedparcel',12,'chelona','小さな荷物','ナギから届いた包みには、見たことのない種が六つ。湿原の集落へ、最初の一つを届ける。',['包みには「世界樹の岬まで運んでほしい」とだけ書かれていた。湿原の人は、昔の水路の地図を添えてくれた。','隊長は今度の旅にはついてこない。「帰った人が暮らす場所を、ここで作っておく」。あなたたちは自分の船で出発した。'],0),
 q('ironbridge',12,'rhinox','鉄角の大橋','湿原の大橋を渡る鉄角犀。荷物を運ぶ人と、群れの渡り道が重なっている。',['鉄角の足跡をつなぐと、水が増えた日だけ橋を渡っていることが分かった。橋を独り占めしたいわけではなかった。','トーマは橋の脇に、魔獣が渡る浅瀬を描き足した。荷車と群れが、初めて同じ日に岸へ着いた。'],1),
 q('floatingnursery',12,'chelona','浮島の苗床','島甲亀の背に育つ苗を守るため、湿原の水位を調整する。小型魔獣の巣も避けて進もう。',['甲羅の土には、洪水で流された村の花が咲いていた。魔獣は知らないうちに、種を運んでいたのだ。','ミラは依頼書の「退ける」を「渡りを助ける」に書き換えた。戦う理由も、調べながら変えていい。'],2),
 q('greenpromise',12,'rhinox','橋を分け合う約束','道中の石棘猪を越え、群れの長に新しい浅瀬を示す。橋の灯を二つに分けてともそう。',['長い角が浅瀬へ向きを変えた。橋に戻ったのは、荷車の音だけではなく、対岸から来る子どもたちの声だった。','最初の種は、橋の両端に植えられた。次の包みの宛先は、糸でできた森の回廊だ。'],3,true),
 q('silkpost',13,'arachna','糸で届く便り','森では、魔獣の糸が古い吊り橋を支えていた。切れてしまった配達路を調査する。',['森の配達人は糸の結び目を数えて道を覚えていた。文字を読めない子にも分かる、道しるべだった。','ナギの手紙には「届かなかった道にも、続きを」とあった。あなたは新しい結び目を、最初の枝に残した。'],4),
 q('backwater',13,'seirun','逆流する水路','流刃蛇の移動で水路が逆流している。溜まった倒木を取り除くため、水の動きを読む。',['逆流は、涸れた水路へ水を押し戻していた。流刃蛇は巣を作るため、流れを変えていたのだ。','ガンは一方向に閉じていた水門を、両側へ開く形に直した。水は森と村へ、少しずつ分かれていった。'],5),
 q('threadschool',13,'arachna','結び目の教室','配達人見習いと一緒に、道中の葉羽虫の縄張りを越える。結び目の標識を増やそう。',['見習いは最後の結び目だけ、あなたに教えずに作った。「次の人には、私が教えたいから」','ミラはその結び目をノートに描かなかった。地図には残らなくても、人から人へ届く知識がある。'],6),
 q('riverthread',13,'seirun','川を渡る一本の糸','流刃蛇の長の追撃を読み、村と森をつなぐ最後の水門を開ける。',['水門が動くと、糸橋が川面に映った。二つの道が、同じ場所で人と魔獣を向こう岸へ運んでいる。','二つ目の種は、水門の上へ。夜にだけ見える花が、鏡月の森へ続く道を照らし始めた。'],7,true),
 q('lostnames',14,'vulpira','名前のない忘れもの','鏡月の森には、夢から落ちた忘れものが集まる。夢尾狐を追い、持ち主へ返す手がかりを探す。',['壊れた鈴、片方の靴、書きかけの名前。誰にも要らないものではなく、誰かが探し続けていたものだった。','トーマは名前のない箱を一つ、村へ送った。「見つけた人が、新しく名前を付けてもいい」'],8),
 q('moonletter',14,'mothria','夜の配達人','月翅蛾の粉が浮かぶ夜道を調べ、眠っている町へ手紙を運ぶ。',['月粉を払うと、封筒には昼間には見えない文字が現れた。亡くした人への言葉を、今を生きる人が書いていた。','ガンは空白の封筒を一枚もらった。宛先は書かず、鍛冶屋の窓に置いておくという。'],9),
 q('foxmirror',14,'vulpira','鏡に残った足跡','同じ姿を映す夢尾狐。その足跡は、夢の中でも同じ向きに続いている。',['鏡の道で出会ったのは、旅立った頃の小さな自分だった。答えを間違えても、ちゃんと前へ進んでいた。','ミラは帰り道の標識に「戻っても、やり直してもいい」と書いた。森の道が、一つ増えた。'],10),
 q('moonwake',14,'mothria','月繭がほどける朝','星蝙蝠の反響を越え、月翅蛾の長が守る繭を開く。朝に返す手紙を集めよう。',['繭から出てきたのは、たくさんの小さな翅だった。夜の配達人は一人ではなく、森そのものだったのだ。','三つ目の種に、配達人たちは小さな鈴を結んだ。朝の砂陽の鉱都へ、音のする包みを運ぼう。'],11,true),
 q('sharedfurnace',15,'scorvex','眠った共同炉','燃料の尽きた鉱都で、鉱毒蠍が古い採掘道を守っている。共同炉を起こす材料を探す。',['炉を閉じた理由は、燃料の不足だけではなかった。誰が火を使うかで、町の人が争っていたのだ。','ガンは一人ずつ話を聞き、炉の前に椅子を増やした。先に作り直すのは、火を囲む場所だった。'],12),
 q('sunmeasure',15,'solvyr','太陽を量る','太陽竜が集める熱を測り、燃料を奪い合わない新しい炉の設計図を作る。',['陽翼の影と日なたでは、温度が一定の比率で変わっていた。ミラは測った数を、そのまま炉の目盛りにした。','町の子が最後の目盛りを書いた。「使った分を、次の人にも分かるように」。設計図には、たくさんの筆跡が残った。'],13),
 q('veinreturn',15,'scorvex','掘らない鉱脈','砂甲虫の巣を避け、使わなくなった工具を回収する。新しく掘る代わりに、町の鉄を循環させよう。',['回収した鉄は、忘れられた工具や折れた車軸だった。長く使う方法を見つければ、鉱脈にも休む時間ができる。','ガンは自分の古い槌も炉へ入れた。「形が変わっても、仕事の続きは残るさ」'],14),
 q('sunshared',15,'solvyr','分け合う火','太陽竜の長の白昼の大技を越え、共同炉の反射板を最後の角度に合わせる。',['炉の火が、町じゅうの小さな工房へ分かれていった。大きな煙突は、もう一人だけの仕事の印ではなかった。','四つ目の種は、炉の冷えた灰に植えられた。できたばかりの風鈴を預かり、嵐鐘の高地へ向かう。'],15,true),
 q('windcrown',16,'gryphor','風冠の渡し場','風冠鷲の渡りを調べ、嵐が来る前に峠の小屋へ物資を運ぶ。',['風冠鷲は嵐から逃げる前に、必ず同じ岩へ降りた。岩の下には、風が通らない小さな谷があった。','配達人たちはそこを新しい避難所にした。地図の隅に、魔獣の羽を一本添えた。'],16),
 q('silentbell',16,'noctyra','鳴らない鐘楼','鐘翼蝠の反響が鐘の音を消している。町へ嵐を知らせる、別の音域を探そう。',['低い鐘に、細い風鈴を重ねると、反響の中を音が通った。大きな音で打ち勝つ必要はなかった。','ナギからの返事にも、同じ風鈴が入っていた。遠い港で、あなたたちと同じ工夫をしていたのだ。'],17),
 q('cloudledger',16,'tempestr','雲の通行帳','雷嵐鳥が集める雲の順番を記録し、町から町へ渡す嵐の予報表を作る。',['予報表には、晴れの日だけでなく「まだ分からない日」の欄もできた。知らないことを残すと、次の町が続きを測ってくれる。','ミラは最初の研究ノートを、予報所へ置いてきた。今は、ほかの人が書き足す方が楽しみだと言った。'],18),
 q('stormafter',16,'tempestr','嵐のあとに鳴る鐘','道中の風小鴉と雷尾小獣を越え、雷嵐鳥の長の前で予報用の最後の鐘を鳴らす。',['鐘は嵐を止めなかった。けれど、避難が間に合った町から、一つずつ返事の鐘が鳴った。','五つ目の種に風鈴を結び、最後の包みを開いた。中には小さな空の袋。「六つ目は、旅の終わりに拾ってください」'],19,true),
 q('rootsea',17,'mammora','根が泳ぐ海','世界樹の岬では、霧牙巨象の群れが海辺の根を渡る。木の弱った場所を調べよう。',['根は一つの木のものではなかった。別々の土地から流れ着いた種が、絡まりながら岬を支えていた。','トーマは地図の中心に大きな木を描くのをやめた。ここにも、たくさんの帰る場所がある。'],20),
 q('starcourier',17,'astravor','星路の運び手','創星竜が空へ運ぶ光を調べる。六つ目の種は、見慣れた道の片隅に残っている。',['竜が運んでいたのは、岬で育った種だった。世界を作ったのではなく、長い時間をかけて運び続けていたのだ。','最後の袋に入れたのは、最初の街道で靴に付いた小さな種。あなた自身も、知らないうちに運び手になっていた。'],21),
 q('sharedroots',17,'mammora','同じ根を踏む仲間','巨象の長に続いて、岬の新しい苗床へ進む。別々の土地で学んだ道の作り方を、一つずつ使おう。',['浅瀬、糸橋、水門、反射板、風鈴。旅先で覚えた工夫が、岬に小さな広場を作った。','村から来た船には、隊長とレイ、そして自分の旅から戻ったナギが乗っていた。「今度は、種を受け取りに来たよ」'],22),
 q('worldweave',17,'astravor','世界をつなぐ一粒','道中を越え、創星竜の星海の大技に挑む。六つの種を、同じ場所へではなく、次の旅へ送り出す。',['星路が開き、六つの小さな袋が別々の船へ手渡された。大きな一つの答えより、誰かが続きを考えられる種を。','リュミエ村の広場に、次の配達先を書ける地図が掲げられた。その最初の線を引くのは、あなたではない新しいハンターだ。','第三部をクリアしました。旅で出会った50種の魔獣、道中からつなぐ必殺技、仲間の外伝と討究。次の目標を選んで、また帰ってこよう。'],23,true),
];
