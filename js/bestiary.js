// 数式バトル用の新しい10体。各個体の場所、間合い、部位、三つの固有技を一か所で管理する。
const move = (name, motion, pattern, tele, damage, level = 2, hitAt = 1.12) => ({ name, motion, pattern, tele, damage, level, hitAt });

export const BESTIARY = {
  raizen: { name: '雷牙獣ライゼン', short: 'ライゼン', field: '雷鳴の草原', stage: 'storm', area: 1, x: -45, z: 29, spacing: 3.6, front: 2.0, sidePart: '肩棘', color: 0xffd34b, moves: [
    move('雷牙飛びかかり', 'pounce', 'target', 5.7, 25), { ...move('稲妻の往復爪', 'claw', 'target', 6.8, 29), follow: 'adjacent' }, move('大技・雷鳴放電', 'pulse', 'all', 9.5, 46, 3, 1.45)] },
  gradon: { name: '岩甲獣グラドン', short: 'グラドン', field: '崩れた石門', stage: 'stone', area: 4, x: 55, z: -55, spacing: 3.0, front: 1.5, sidePart: '甲殻', color: 0xc49b63, moves: [
    move('岩盾の突進', 'charge', 'target', 6.2, 30), move('双岩落とし', 'slam', 'sides', 7.0, 31), { ...move('大技・大地崩落', 'quake', 'center', 10.4, 49, 3, 1.45), follow: 'sides' }] },
  morga: { name: '深沼竜モルガ', short: 'モルガ', field: '霧の湖畔', stage: 'marsh', area: 3, x: 53, z: 46, spacing: 4.1, front: 2.5, sidePart: '水鰭', color: 0x6cd9bb, moves: [
    move('沼潜り奇襲', 'burrow', 'target', 6.0, 28), move('泡沫の横噴射', 'breath', 'adjacent', 7.0, 27), { ...move('大技・濁流包囲', 'wave', 'sides', 9.0, 42, 3, 1.36), follow: 'center' }] },
  frostra: { name: '氷刃竜フロストラ', short: 'フロストラ', field: '凍てつく湖面', stage: 'ice', area: 3, x: 61, z: 53, spacing: 4.5, front: 3.0, sidePart: '氷翼', color: 0xa7eaff, moves: [
    move('氷刃の刺突', 'lance', 'target', 5.8, 27), { ...move('双氷弧', 'sweep', 'adjacent', 7.2, 30), follow: 'other' }, move('大技・白氷嵐', 'storm', 'all', 10.0, 48, 3, 1.5)] },
  salda: { name: '砂蠍竜サルダ', short: 'サルダ', field: '風化した砂丘', stage: 'dune', area: 2, x: 13, z: -9, spacing: 4.0, front: 1.7, sidePart: '鋏', color: 0xe9bc63, moves: [
    move('毒針一閃', 'tail', 'target', 5.7, 29), { ...move('左右の鋏撃', 'claw', 'sides', 7.3, 31), follow: 'center' }, move('大技・砂塵竜巻', 'spin', 'all', 9.4, 45, 3, 1.42)] },
  velum: { name: '森樹獣ヴェルム', short: 'ヴェルム', field: '古木の聖域', stage: 'forest', area: 1, x: -52, z: 35, spacing: 3.4, front: 2.3, sidePart: '枝角', color: 0x99d772, moves: [
    move('樹根の突き上げ', 'root', 'target', 6.6, 26), move('大枝の横薙ぎ', 'sweep', 'adjacent', 7.5, 30), { ...move('大技・森の逆襲', 'quake', 'center', 10.1, 46, 3, 1.48), follow: 'sides' }] },
  nebra: { name: '毒冠竜ネブラ', short: 'ネブラ', field: '紫煙の遺跡', stage: 'poison', area: 4, x: 62, z: -65, spacing: 3.8, front: 2.6, sidePart: '毒鰭', color: 0xbc80e8, moves: [
    move('毒液散布', 'breath', 'target', 6.2, 27), move('毒冠の開花', 'pulse', 'sides', 7.3, 30), { ...move('大技・瘴気爆発', 'storm', 'sides', 10.3, 47, 3, 1.5), follow: 'center' }] },
  galdo: { name: '鋼翼竜ガルド', short: 'ガルド', field: '高空の石舞台', stage: 'sky', area: 2, x: 0, z: 5, spacing: 5.0, front: 3.4, sidePart: '鋼翼', flying: true, color: 0xa5b9d1, moves: [
    move('鋼羽の急襲', 'dive', 'target', 6.1, 29), { ...move('翼刃の十字斬り', 'wing', 'adjacent', 7.0, 32), follow: 'other' }, move('大技・鋼鉄の暴風', 'storm', 'all', 10.5, 50, 3, 1.5)] },
  barza: { name: '熔岩獣バルザ', short: 'バルザ', field: '火口の裂け目', stage: 'lava', area: 4, x: 58, z: -53, spacing: 3.3, front: 1.7, sidePart: '溶岩甲', color: 0xff743d, moves: [
    move('灼熱の頭突き', 'charge', 'target', 6.0, 31), move('溶岩柱', 'slam', 'sides', 7.1, 34), { ...move('大技・火山噴出', 'quake', 'center', 10.8, 52, 3, 1.48), follow: 'sides' }] },
  lunax: { name: '月影竜ルナクス', short: 'ルナクス', field: '月影の祭壇', stage: 'moon', area: 3, x: 48, z: 57, spacing: 4.6, front: 3.1, sidePart: '影翼', flying: true, color: 0xc3a8ff, moves: [
    move('影渡り', 'phase', 'target', 5.9, 28), { ...move('三日月の刃', 'sweep', 'adjacent', 7.3, 32), follow: 'other' }, move('大技・月蝕', 'pulse', 'all', 10.6, 51, 3, 1.55)] },
};

export const NEW_BEAST_IDS = Object.keys(BESTIARY);
export const enemyName = id => BESTIARY[id]?.name || ({ zarva: '焔角竜ザルヴァ', sektra: '熔晶竜セクトラ', veira: '蒼翼竜ヴェイラ' }[id] || '焔角竜ザルヴァ');
export const enemyShort = id => BESTIARY[id]?.short || ({ zarva: 'ザルヴァ', sektra: 'セクトラ', veira: 'ヴェイラ' }[id] || 'ザルヴァ');
