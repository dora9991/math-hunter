// 調整用の数値をまとめた所（遊びやすさの調整はここを触る）

export const GAME_TITLE = '竜狩りの谷';
export const GAME_SUBTITLE = '― 数式で狩れ ―';

export const HUNTER = {
  maxHp: 100,
  maxStamina: 100,
  runSpeed: 4.8,          // 納刀ダッシュなしの走り（m/s）
  sprintSpeed: 7.0,       // Shift ダッシュ
  drawnSpeed: 2.3,        // 大剣を抜いたまま歩く
  itemWalkSpeed: 0.9,     // 回復薬を飲みながら歩く
  waterSlow: 0.72,        // 水の中の速さ倍率
  sprintCost: 17,         // 1秒あたりのスタミナ消費
  rollCost: 25,
  staminaRegen: 30,       // 1秒あたりの回復
  staminaRegenDelay: 0.45,
  rollTime: 0.56,
  rollIFrames: [0.03, 0.31], // 回避の無敵時間（秒）
  redRegen: 1.4,          // 赤ゲージの自然回復（1秒あたり）
  redRatio: 0.55,         // 受けたダメージのうち赤ゲージになる割合
  radius: 0.42,
  height: 1.8,
};

// 切れ味：色・長さ・倍率（上から減っていく）
export const SHARPNESS = [
  { name: '赤', color: '#d83a2e', len: 20, mult: 0.5 },
  { name: '橙', color: '#e8872a', len: 30, mult: 0.75 },
  { name: '黄', color: '#e8d43a', len: 40, mult: 1.0 },
  { name: '緑', color: '#5ccf4a', len: 50, mult: 1.05 },
  { name: '青', color: '#3f86e8', len: 60, mult: 1.2 },
];
export const SHARPNESS_MAX = SHARPNESS.reduce((s, x) => s + x.len, 0);

export const MONSTER = {
  name: '焔角竜ザルヴァ',
  maxHp: 4400,
  limpRatio: 0.2,         // 体力20%以下で足を引きずる
  walkSpeed: 3.4,
  runSpeed: 12.5,         // 突進
  turnSpeed: 1.7,         // rad/s
  enrageEvery: 0.19,      // 最大体力の何割ぶんダメージを受けたら怒るか
  enrageTime: 65,
  tiredTime: 40,
  sightRange: 34,
  roarRange: 24,
  damageMult: 1.0,
  // 部位：肉質（斬撃の通りやすさ %）と怯み・破壊・切断の値
  parts: {
    head:  { name: '頭',   zone: 72, flinch: 330, breakAt: 2 },
    neck:  { name: '首',   zone: 45, flinch: 420 },
    body:  { name: '胴',   zone: 36, flinch: 520 },
    arm:   { name: '腕',   zone: 30, flinch: 300 },
    legL:  { name: '左脚', zone: 42, flinch: 380, trip: true },
    legR:  { name: '右脚', zone: 42, flinch: 380, trip: true },
    wingL: { name: '左翼', zone: 56, flinch: 350, breakAt: 2 },
    wingR: { name: '右翼', zone: 56, flinch: 350, breakAt: 2 },
    tail:  { name: '尻尾', zone: 55, flinch: 360, cutAt: 520 },
  },
};

export const QUEST = {
  timeLimit: 20 * 60,     // 秒
  maxCarts: 3,
  carveTime: 60,
  reward: 3600,
};
