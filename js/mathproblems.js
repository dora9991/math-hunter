// 数式バトルの問題づくり（中1：正の数・負の数／式の値／一次方程式）
// 答えは必ず整数。three.js に頼らないので node のテストからも読める

const MINUS = '−';
// 表示用：負の数はかっこ付き
const par = n => (n < 0 ? `(${MINUS}${-n})` : String(n));
// 符号つき：(+3) (−5)
const sgn = n => (n < 0 ? `(${MINUS}${-n})` : `(+${n})`);
// 式の先頭の数：−3x のように、かっこを付けない
const lead = n => (n < 0 ? `${MINUS}${-n}` : String(n));
// 係数つきの x：1x→x、−1x→−x
const coef = a => (a === 1 ? 'x' : a === -1 ? `${MINUS}x` : `${lead(a)}x`);
// 「+ 5」「− 3」のような続きの項
const term = b => (b < 0 ? `${MINUS} ${-b}` : `+ ${b}`);
const termX = a => (a < 0 ? `${MINUS} ${a === -1 ? '' : -a}x` : `+ ${a === 1 ? '' : a}x`);

export const showNum = s => String(s).replace(/-/g, MINUS);

export const TOPICS = {
  addsub: '正負の数：たし算・ひき算',
  muldiv: '正負の数：かけ算・わり算',
  mixed: '四則の混じった計算',
  pow: '累乗をふくむ計算',
  value: '式の値',
  eq1: '一次方程式',
  eq2: '一次方程式（かっこ・移項）',
};

const nz = (rng, lo, hi) => { let v = 0; while (v === 0) v = rng.int(lo, hi); return v; };

const GEN = {
  // 正負の数の加減。want: 'neg'（答えが負）／'pos'（答えが正）
  addsub(rng, want, n = 9) {
    for (let i = 0; i < 200; i++) {
      const a = nz(rng, -n, n), b = nz(rng, -n, n), sub = rng.chance(0.5);
      if (a > 0 && b > 0 && !sub) continue;               // ただのたし算は出さない
      const ans = sub ? a - b : a + b;
      if (ans === 0 || (want === 'neg' && ans > 0) || (want === 'pos' && ans < 0)) continue;
      // よくある間違い：たす・ひくの取り違え／絶対値をたすか引くかの取り違え
      const sg = Math.sign(ans), A = Math.abs(a), B = Math.abs(b);
      return { text: `${sgn(a)} ${sub ? MINUS : '+'} ${sgn(b)}`, answer: ans, topic: 'addsub', wrong: [sub ? a + b : a - b, sg * (A + B), sg * Math.abs(A - B), -ans] };
    }
    return { text: want === 'pos' ? `(${MINUS}2) + (+5)` : `(+2) + (${MINUS}5)`, answer: want === 'pos' ? 3 : -3, topic: 'addsub' };
  },
  // 正負の数の乗除
  // 3つの数の加減（むずかしい）
  addsub3(rng, want) {
    for (let i = 0; i < 300; i++) {
      const a = nz(rng, -9, 9), b = nz(rng, -9, 9), c = nz(rng, -9, 9), s1 = rng.chance(0.5), s2 = rng.chance(0.5);
      if (a > 0 && b > 0 && c > 0) continue;
      const ans = a + (s1 ? -b : b) + (s2 ? -c : c);
      if (ans === 0 || (want === 'neg' && ans > 0) || (want === 'pos' && ans < 0)) continue;
      return { text: `${sgn(a)} ${s1 ? MINUS : '+'} ${sgn(b)} ${s2 ? MINUS : '+'} ${sgn(c)}`, answer: ans, topic: 'addsub', wrong: [a + (s1 ? b : -b) + (s2 ? -c : c), a + (s1 ? -b : b) + (s2 ? c : -c), a + b + c, -ans] };
    }
    return GEN.addsub(rng, want);
  },
  // 3つの数の乗除（むずかしい）
  muldiv3(rng) {
    for (;;) {
      const a = nz(rng, -6, 6), b = nz(rng, -5, 5), c = nz(rng, -4, 4);
      if ((a > 0 && b > 0 && c > 0) || [a, b, c].some(v => Math.abs(v) === 1)) continue;
      if (rng.chance(0.5)) return { text: `${par(a)} × ${par(b)} × ${par(c)}`, answer: a * b * c, topic: 'muldiv', wrong: [-a * b * c, a * b + c, a * (b + c)] };
      return { text: `${par(a * b)} ÷ ${par(b)} × ${par(c)}`, answer: a * c, topic: 'muldiv', wrong: [-a * c, a + c, a * b] };
    }
  },
  muldiv(rng, n = 9) {
    for (;;) {
      const a = nz(rng, -n, n), b = nz(rng, -n, n);
      if (a > 0 && b > 0) continue;
      if (Math.abs(a) === 1 || Math.abs(b) === 1) continue;
      if (rng.chance(0.4)) return { text: `${par(a * b)} ÷ ${par(b)}`, answer: a, topic: 'muldiv', wrong: [-a, b, -b] };
      return { text: `${par(a)} × ${par(b)}`, answer: a * b, topic: 'muldiv', wrong: [-a * b, a + b, a - b] };
    }
  },
  // 四則混合（かけ算・わり算が先）
  mixed(rng) {
    for (;;) {
      const a = nz(rng, -9, 9), b = nz(rng, -6, 6), c = nz(rng, -6, 6);
      if (b > 0 && c > 0 && a > 0) continue;
      if (Math.abs(b) === 1 || Math.abs(c) === 1) continue;
      const k = rng.int(0, 2);
      // よくある間違い：左から順に計算してしまう／符号の取り違え
      if (k === 0) return { text: `${lead(a)} + ${par(b)} × ${par(c)}`, answer: a + b * c, topic: 'mixed', wrong: [(a + b) * c, a - b * c, a + Math.abs(b * c)] };
      if (k === 1) return { text: `${lead(a)} ${MINUS} ${par(b)} × ${par(c)}`, answer: a - b * c, topic: 'mixed', wrong: [(a - b) * c, a + b * c, a - Math.abs(b * c)] };
      return { text: `${par(b * c)} ÷ ${par(c)} ${term(a)}`.replace(/^\((.+?)\)/, '$1'), answer: b + a, topic: 'mixed', wrong: [-b + a, b - a, -(b + a)] };
    }
  },
  // 累乗をふくむ計算
  pow(rng) {
    for (;;) {
      const a = nz(rng, -5, 5), b = nz(rng, -9, 9), k = rng.int(0, 2);
      if (Math.abs(a) === 1) continue;
      const sq = a < 0 ? `(${lead(a)})²` : `${a}²`;
      // よくある間違い：2乗を2倍にする／(−a)² と −a² の取り違え
      if (k === 0) return { text: `${sq} ${term(b)}`, answer: a * a + b, topic: 'pow', wrong: [-a * a + b, a * 2 + b, Math.abs(a) * 2 + b] };
      if (k === 1 && a > 0) return { text: `${MINUS}${a}² ${term(b)}`, answer: -a * a + b, topic: 'pow', wrong: [a * a + b, -a * 2 + b, -(a * a + b)] };
      if (k === 2 && Math.abs(a) <= 3) { const c = nz(rng, -4, 4); if (Math.abs(c) === 1) continue; return { text: `${sq} × ${par(c)}`, answer: a * a * c, topic: 'pow', wrong: [-a * a * c, a * 2 * c, a * a + c] }; }
    }
  },
  // 式の値
  // 式の値（2乗をふくむ：むずかしい）
  value2(rng) {
    for (;;) {
      const x = nz(rng, -4, 4), a = nz(rng, -3, 3), b = nz(rng, -6, 6);
      if (rng.chance(0.5)) return { pre: `x = ${lead(x)} のとき`, text: `${a === 1 ? '' : a === -1 ? MINUS : lead(a)}x² ${termX(b)}`, answer: a * x * x + b * x, topic: 'value', wrong: [-a * x * x + b * x, a * x * x - b * x, a * x * 2 + b * x] };
      return { pre: `x = ${lead(x)} のとき`, text: `${a === 1 ? '' : a === -1 ? MINUS : lead(a)}x² ${term(b)}`, answer: a * x * x + b, topic: 'value', wrong: [-a * x * x + b, a * x * 2 + b, a * x * x - b] };
    }
  },
  value(rng, n = 5) {
    for (;;) {
      const x = nz(rng, -n, n), a = nz(rng, -n, n), b = nz(rng, -9, 9);
      if (Math.abs(a) === 1 && rng.chance(0.6)) continue;
      return { pre: `x = ${lead(x)} のとき`, text: `${coef(a)} ${term(b)}`, answer: a * x + b, topic: 'value', wrong: [-a * x + b, a * x - b, a + x + b] };
    }
  },
  // 1手で解ける方程式（やさしい）： x + b = c ／ ax = c
  eq0(rng) {
    for (;;) {
      const x = nz(rng, -9, 9);
      if (rng.chance(0.5)) { const b = nz(rng, -9, 9); return { text: `x ${term(b)} = ${lead(x + b)}`, pre: 'x は？', answer: x, topic: 'eq1', wrong: [x + 2 * b, -x, x + b] }; }
      const a = nz(rng, -6, 6);
      if (Math.abs(a) === 1) continue;
      return { text: `${coef(a)} = ${lead(a * x)}`, pre: 'x は？', answer: x, topic: 'eq1', wrong: [-x, a * x - a, a * x + a] };
    }
  },
  // 両辺にかっこ（むずかしい）： a(x + b) = c(x + d)
  eq3(rng) {
    for (;;) {
      const x = nz(rng, -6, 6), a = nz(rng, -5, 5), c = nz(rng, -5, 5), b = nz(rng, -6, 6);
      if (a === c || Math.abs(a) === 1 || Math.abs(c) === 1) continue;
      const num = a * (x + b);                 // = c(x + d) となる整数 d を探す
      if (num % c !== 0) continue;
      const d = num / c - x;
      if (d === 0 || Math.abs(d) > 9) continue;
      return { text: `${lead(a)}(x ${term(b)}) = ${lead(c)}(x ${term(d)})`, pre: 'x は？', answer: x, topic: 'eq2', wrong: [-x, x + b, x + d] };
    }
  },
  // 一次方程式 ax + b = c
  eq1(rng) {
    for (;;) {
      const x = nz(rng, -9, 9), a = nz(rng, -6, 6), b = nz(rng, -12, 12);
      if (Math.abs(a) === 1) continue;
      // よくある間違い：移項で符号を変え忘れる（(c + b) ÷ a）／割り忘れ
      const c = a * x + b;
      return { text: `${coef(a)} ${term(b)} = ${lead(c)}`, pre: 'x は？', answer: x, topic: 'eq1', wrong: [(c + b) / a, -x, c - b] };
    }
  },
  // 一次方程式（両辺に x／かっこ）
  eq2(rng) {
    for (;;) {
      const x = nz(rng, -9, 9);
      if (rng.chance(0.5)) {
        const a = nz(rng, -6, 6), c = nz(rng, -6, 6), b = nz(rng, -12, 12);
        if (a === c || Math.abs(a - c) === 1) continue;
        const d = a * x + b - c * x;
        if (d === 0 || Math.abs(d) > 40) continue;
        return { text: `${coef(a)} ${term(b)} = ${coef(c)} ${term(d)}`, pre: 'x は？', answer: x, topic: 'eq2', wrong: [-x, (d + b) / (a - c), (d - b) / (a + c)] };
      }
      const a = nz(rng, -5, 5), b = nz(rng, -6, 6);
      if (Math.abs(a) === 1) continue;
      return { text: `${lead(a)}(x ${term(b)}) = ${lead(a * (x + b))}`, pre: 'x は？', answer: x, topic: 'eq2', wrong: [x + b, -x, x + 2 * b] };
    }
  },
};

// コマンドごとの問題の種類。lv：0＝やさしい／1＝ふつう／2＝むずかしい
export const LEVELS = { easy: 0, normal: 1, hard: 2 };
export const KINDS = {
  // 左へ：答えが負の数（数直線の左）／右へ：答えが正の数（数直線の右）
  left: (rng, lv) => (lv === 2 ? GEN.addsub3(rng, 'neg') : GEN.addsub(rng, 'neg', lv === 0 ? 5 : 9)),
  right: (rng, lv) => (lv === 2 ? GEN.addsub3(rng, 'pos') : GEN.addsub(rng, 'pos', lv === 0 ? 5 : 9)),
  atk: (rng, lv) => (lv === 2 ? (rng.chance(0.5) ? GEN.muldiv3(rng) : GEN.mixed(rng)) : GEN.muldiv(rng, lv === 0 ? 5 : 9)),
  big: (rng, lv) => [GEN.eq0, GEN.eq1, GEN.eq2][lv](rng),
  heal: (rng, lv) => (lv === 2 ? GEN.value2(rng) : GEN.value(rng, lv === 0 ? 3 : 5)),
  // 回避：敵の攻撃が強いほど難しい
  dodge1: (rng, lv) => [r => GEN.addsub(r, null, 9), GEN.mixed, GEN.pow][lv](rng),
  dodge2: (rng, lv) => [r => GEN.muldiv(r, 9), r => (r.chance(0.5) ? GEN.pow(r) : GEN.eq1(r)), GEN.eq2][lv](rng),
  dodge3: (rng, lv) => [GEN.eq1, GEN.eq2, GEN.eq3][lv](rng),
};

// 2つの答えがぶつかる（片方が、もう片方の打ち始めになっている）か
export function conflicts(a, b) {
  a = String(a); b = String(b);
  return a.startsWith(b) || b.startsWith(a);
}

// 4つの選択肢を作る：よくある間違い（wrong）を優先し、足りなければ近い数で埋める
// sameSign：正解と同じ符号だけにする（「左へ＝負」「右へ＝正」の符号だけで当てられないように）
export function makeChoices(p, rng, sameSign = false) {
  const a = p.answer, out = [];
  const ok = v => Number.isInteger(v) && v !== a && Math.abs(v) <= 199 && !out.includes(v) && (!sameSign || a === 0 || Math.sign(v) === Math.sign(a));
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = rng.int(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  for (const v of shuffle((p.wrong || []).slice())) if (out.length < 2 && ok(v)) out.push(v);
  for (const v of shuffle([-a, a + 1, a - 1, a + 2, a - 2, a + 3, a - 3])) if (out.length < 3 && ok(v)) out.push(v);
  for (let k = 4; out.length < 3; k++) for (const v of [a + k, a - k]) if (out.length < 3 && ok(v)) out.push(v);
  return shuffle([a, ...out]);
}

// 他のカードの答え（taken）とぶつからない問題を作る
export function makeProblem(kind, rng, taken = [], level = 1) {
  const gen = KINDS[kind];
  let p = null;
  for (let i = 0; i < 300; i++) {
    p = gen(rng, level);
    if (Math.abs(p.answer) > 99) continue;
    if (!taken.some(t => conflicts(t, p.answer))) break;
  }
  const choices = makeChoices(p, rng, kind === 'left' || kind === 'right');
  return { text: p.text, pre: p.pre || '', answer: p.answer, ans: String(p.answer), choices, topic: p.topic, kind };
}
