// 効果音とBGM（すべて Web Audio で合成。外部の音源ファイルは使わない）
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.bgmVolume = 0.45;
    this.bgmMode = null;
    this.bgmTimer = null;
    this.step = 0;
  }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
      this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = this.bgmVolume; this.bgmBus.connect(this.master);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _noise(t, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.5, attack = 0.005 } = {}) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  _tone(t, dur, { type = 'sine', f0 = 440, f1 = f0, gain = 0.3, attack = 0.005, bus } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'swing': this._noise(t, 0.28, { f0: 400, f1: 2200, q: 1.2, gain: 0.35, attack: 0.08 }); break;
      case 'swingHeavy': this._noise(t, 0.35, { f0: 250, f1: 1600, q: 1, gain: 0.5, attack: 0.05 }); this._tone(t, 0.3, { type: 'sine', f0: 120, f1: 60, gain: 0.2 }); break;
      case 'hit': this._tone(t, 0.18, { f0: 160, f1: 45, gain: 0.55 }); this._noise(t, 0.12, { f0: 1800, f1: 500, q: 0.8, gain: 0.45 }); break;
      case 'hitHeavy': this._tone(t, 0.3, { f0: 120, f1: 35, gain: 0.8 }); this._noise(t, 0.22, { f0: 1400, f1: 300, q: 0.7, gain: 0.6 }); break;
      case 'bounce': this._tone(t, 0.25, { type: 'triangle', f0: 2400, f1: 1900, gain: 0.25 }); this._tone(t, 0.18, { type: 'square', f0: 3100, f1: 2900, gain: 0.06 }); break;
      case 'guard': this._tone(t, 0.22, { type: 'triangle', f0: 900, f1: 500, gain: 0.35 }); this._noise(t, 0.15, { f0: 2500, f1: 800, gain: 0.3 }); break;
      case 'charge1': this._tone(t, 0.35, { f0: 880, gain: 0.2 }); break;
      case 'charge2': this._tone(t, 0.35, { f0: 1175, gain: 0.22 }); break;
      case 'charge3': this._tone(t, 0.5, { f0: 1568, gain: 0.25 }); this._tone(t, 0.5, { f0: 2349, gain: 0.08 }); break;
      case 'overcharge': this._tone(t, 0.2, { type: 'sawtooth', f0: 300, f1: 200, gain: 0.08 }); break;
      case 'roll': this._noise(t, 0.3, { type: 'lowpass', f0: 800, f1: 200, gain: 0.25, attack: 0.03 }); break;
      case 'step': this._tone(t, 0.12, { f0: 90, f1: 40, gain: 0.25 }); this._noise(t, 0.12, { type: 'lowpass', f0: 500, f1: 150, gain: 0.2 }); break;
      case 'stomp': this._tone(t, 0.6, { f0: 70, f1: 28, gain: 0.9 }); this._noise(t, 0.5, { type: 'lowpass', f0: 600, f1: 90, gain: 0.6 }); break;
      case 'roar': {
        for (const [f, g] of [[95, 0.3], [142, 0.22], [210, 0.12]]) {
          const c = this.ctx, o = c.createOscillator(), gg = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.7, t); o.frequency.linearRampToValueAtTime(f * 1.2, t + 0.35); o.frequency.linearRampToValueAtTime(f * 0.9, t + 1.8);
          lfo.frequency.value = 23; lg.gain.value = f * 0.08; lfo.connect(lg); lg.connect(o.frequency);
          gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.15); gg.gain.setValueAtTime(g, t + 1.5); gg.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
          const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1400;
          o.connect(flt); flt.connect(gg); gg.connect(this.sfxBus);
          o.start(t); lfo.start(t); o.stop(t + 2.1); lfo.stop(t + 2.1);
        }
        this._noise(t, 1.9, { f0: 700, f1: 400, q: 0.6, gain: 0.35, attack: 0.15 });
        break;
      }
      case 'growl': this._tone(t, 0.7, { type: 'sawtooth', f0: 70, f1: 55, gain: 0.18, attack: 0.1 }); break;
      case 'bite': this._noise(t, 0.12, { f0: 1500, f1: 400, gain: 0.5 }); this._tone(t, 0.15, { f0: 220, f1: 80, gain: 0.3 }); break;
      case 'fire': this._noise(t, 0.9, { type: 'lowpass', f0: 2500, f1: 300, gain: 0.5, attack: 0.05 }); break;
      case 'explode': this._tone(t, 0.7, { f0: 90, f1: 30, gain: 0.8 }); this._noise(t, 0.8, { type: 'lowpass', f0: 3000, f1: 100, gain: 0.7 }); break;
      case 'hurt': this._tone(t, 0.2, { type: 'square', f0: 330, f1: 180, gain: 0.08 }); this._tone(t, 0.25, { f0: 140, f1: 60, gain: 0.5 }); break;
      case 'drink': for (let i = 0; i < 4; i++) this._tone(t + i * 0.18, 0.1, { f0: 300 + i * 30, f1: 180, gain: 0.18 }); break;
      case 'flex': this._tone(t, 0.3, { type: 'triangle', f0: 660, f1: 990, gain: 0.2 }); break;
      case 'heal': this._tone(t, 0.4, { f0: 660, f1: 1320, gain: 0.12 }); break;
      case 'whet': this._noise(t, 0.25, { f0: 3500, f1: 5000, q: 2, gain: 0.25 }); break;
      case 'sharpen': this._tone(t, 0.5, { type: 'triangle', f0: 1760, gain: 0.18 }); break;
      case 'throw': this._noise(t, 0.2, { f0: 700, f1: 1800, gain: 0.25, attack: 0.05 }); break;
      case 'flash': this._noise(t, 0.4, { type: 'highpass', f0: 3000, f1: 6000, gain: 0.4 }); this._tone(t, 0.5, { type: 'triangle', f0: 4000, f1: 3000, gain: 0.1 }); break;
      case 'trap': this._noise(t, 1.2, { type: 'highpass', f0: 4000, f1: 2500, q: 3, gain: 0.25 }); break;
      case 'carve': this._noise(t, 0.12, { f0: 2000, f1: 900, gain: 0.3 }); break;
      case 'item': this._tone(t, 0.12, { type: 'triangle', f0: 1200, f1: 1600, gain: 0.15 }); break;
      case 'select': this._tone(t, 0.06, { type: 'square', f0: 900, gain: 0.05 }); break;
      case 'ui': this._tone(t, 0.1, { type: 'triangle', f0: 700, f1: 1050, gain: 0.15 }); break;
      case 'break': this._noise(t, 0.4, { f0: 1500, f1: 300, q: 0.5, gain: 0.7 }); this._tone(t, 0.4, { f0: 180, f1: 60, gain: 0.5 }); break;
      case 'sheathe': this._noise(t, 0.2, { f0: 2500, f1: 1200, q: 3, gain: 0.15 }); break;
      case 'fanfare': {
        const notes = [523, 659, 784, 1047, 784, 1047];
        notes.forEach((f, i) => { this._tone(t + i * 0.16, 0.3, { type: 'triangle', f0: f, gain: 0.22 }); this._tone(t + i * 0.16, 0.3, { type: 'square', f0: f / 2, gain: 0.04 }); });
        break;
      }
      case 'fail': [392, 330, 262].forEach((f, i) => this._tone(t + i * 0.3, 0.5, { type: 'triangle', f0: f, gain: 0.2 })); break;
      case 'down': this._tone(t, 1.0, { type: 'triangle', f0: 400, f1: 120, gain: 0.25 }); break;
    }
  }

  // BGM：'calm'（拠点・探索）/ 'battle'（戦闘）/ null
  bgm(mode) {
    if (mode === this.bgmMode) return;
    this.bgmMode = mode;
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
    if (!this.ctx || !mode) return;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.bgmTimer = setInterval(() => this._schedule(), 50);
  }
  _schedule() {
    if (!this.ctx) return;
    const c = this.ctx;
    const battle = this.bgmMode === 'battle';
    const bpm = battle ? 150 : 84, spb = 60 / bpm / 2;
    while (this.nextT < c.currentTime + 0.25) {
      const s = this.step, t = this.nextT;
      const B = this.bgmBus;
      if (battle) {
        // 太鼓っぽい低音とかけ声のような和音
        if (s % 4 === 0) this._tone(t, 0.35, { f0: 110, f1: 45, gain: 0.5, bus: B });
        if (s % 8 === 6) this._tone(t, 0.2, { f0: 150, f1: 70, gain: 0.35, bus: B });
        if (s % 2 === 1) this._tone(t, 0.05, { type: 'square', f0: 2200, gain: 0.015, bus: B });
        const scale = [220, 262, 294, 330, 392, 440];
        const mel = [0, 2, 3, 2, 4, 3, 2, 1, 0, 2, 3, 5, 4, 3, 2, 3];
        if (s % 2 === 0) {
          const f = scale[mel[(s / 2) % 16]];
          this._tone(t, spb * 1.8, { type: 'sawtooth', f0: f, gain: 0.05, attack: 0.02, bus: B });
          this._tone(t, spb * 1.8, { type: 'triangle', f0: f * 2, gain: 0.04, attack: 0.02, bus: B });
        }
        if (s % 16 === 0) this._tone(t, spb * 14, { type: 'sawtooth', f0: 55, gain: 0.07, attack: 0.3, bus: B });
      } else {
        const chords = [[196, 247, 294], [175, 220, 262], [165, 208, 247], [175, 220, 294]];
        const ch = chords[Math.floor(s / 16) % 4];
        if (s % 16 === 0) for (const f of ch) this._tone(t, spb * 15, { type: 'triangle', f0: f, gain: 0.035, attack: 0.6, bus: B });
        if (s % 2 === 0) { const f = ch[(s / 2) % 3] * 2; this._tone(t, spb * 1.6, { type: 'sine', f0: f, gain: 0.03, attack: 0.01, bus: B }); }
      }
      this.step++;
      this.nextT += spb;
    }
  }
}
