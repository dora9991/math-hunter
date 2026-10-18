// 正解で満たし、自分のタイミングで使う。道中からボスまで同じゲージを使う。
export class SpecialGauge {
  constructor(value=0){this.value=Math.max(0,Math.min(100,Number(value)||0));}
  get ready(){return this.value>=100;}
  correct(){this.value=Math.min(100,this.value+10);return this.value;}
  consume(){if(!this.ready)return false;this.value=0;return true;}
}
