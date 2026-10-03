// Safari と同じエンジン（WebKit）を外から操作する小さな道具（macOS のみ。追加ライブラリなし）。
// tests/tools/wkdrive.swift をその場でコンパイルして、見えない窓の中でページを動かす。Safari 本体や、その設定・履歴には触らない。
// 使い方は tests/cdp.cjs とほぼ同じ：const b = await launch({ width, height }); const p = await b.page(url); await p.eval('1+1'); await b.close();
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function build() {
  if (process.platform !== 'darwin') throw new Error('WebKit での確認は macOS だけです');
  const src = path.join(__dirname, 'tools', 'wkdrive.swift');
  const out = path.join(os.tmpdir(), 'bs-tools', 'wkdrive');
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync('swiftc', ['-O', src, '-o', out], { stdio: ['ignore', 'ignore', 'ignore'] });
  }
  return out;
}

// DOM の code → macOS のキー番号と文字
const KEYS = {
  Digit0: [29, '0'], Digit1: [18, '1'], Digit2: [19, '2'], Digit3: [20, '3'], Digit4: [21, '4'], Digit5: [23, '5'], Digit6: [22, '6'], Digit7: [26, '7'], Digit8: [28, '8'], Digit9: [25, '9'],
  KeyA: [0, 'a'], KeyS: [1, 's'], KeyD: [2, 'd'], KeyF: [3, 'f'], KeyH: [4, 'h'], KeyG: [5, 'g'], KeyZ: [6, 'z'], KeyX: [7, 'x'], KeyC: [8, 'c'], KeyV: [9, 'v'], KeyB: [11, 'b'], KeyQ: [12, 'q'], KeyW: [13, 'w'], KeyE: [14, 'e'], KeyR: [15, 'r'],
  KeyY: [16, 'y'], KeyT: [17, 't'], KeyO: [31, 'o'], KeyU: [32, 'u'], KeyI: [34, 'i'], KeyP: [35, 'p'], KeyL: [37, 'l'], KeyJ: [38, 'j'], KeyK: [40, 'k'], KeyN: [45, 'n'], KeyM: [46, 'm'],
  Enter: [36, '\r'], Tab: [48, '\t'], Space: [49, ' '], Backspace: [51, '\x7f'], Escape: [53, '\x1b'], Delete: [117, ''], ArrowLeft: [123, ''], ArrowRight: [124, ''], ArrowDown: [125, ''], ArrowUp: [126, '']
};

async function launch(opts) {
  opts = opts || {};
  const W = opts.width || 1440, H = opts.height || 900;
  // 既定では Safari と同じく「音つきの動画は、操作の直後でないと再生できない」。opts.freeAutoplay で外せる
  const proc = spawn(build(), [String(W), String(H)].concat(opts.freeAutoplay ? ['free'] : []), { stdio: ['pipe', 'pipe', 'ignore'] });
  let seq = 0, buf = '', ready = null;
  const pend = new Map();
  const logs = [];
  const isReady = new Promise((r) => { ready = r; });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    for (;;) {
      const i = buf.indexOf('\n');
      if (i < 0) break;
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m = null;
      try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.ev === 'ready') ready();
      else if (m.ev === 'console') logs.push({ type: m.level, text: m.text });
      else if (m.ev) logs.push({ type: m.ev, text: m.text || String(m.n) });
      else if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error)); }
    }
  });
  const dead = new Promise((r) => proc.once('exit', r));
  dead.then(() => { pend.forEach((p) => p.reject(new Error('WebKit の窓が終了しました'))); pend.clear(); });
  const send = (cmd, params) => new Promise((resolve, reject) => { const id = ++seq; pend.set(id, { resolve, reject }); proc.stdin.write(JSON.stringify(Object.assign({ id, cmd }, params || {})) + '\n'); });
  await Promise.race([isReady, new Promise((r, rej) => setTimeout(() => rej(new Error('WebKit の窓を起動できませんでした')), 30000))]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function page(url) {
    const api = {
      engine: 'webkit',
      logs,
      errors: () => logs.filter((l) => l.type === 'error' || l.type === 'exception'),
      async goto(u) { await send('goto', { url: u }); await api.wait('document.readyState === "complete"', 15000); },
      /* 式を評価して値を返す（Promise なら待つ） */
      async eval(expr) {
        // CDP の evaluate と同じく「文の並び。最後の式の値を返す」。「利用者の操作ではない」扱いで実行される
        // （本物の操作は click / drag / key だけ。Safari の「操作の直後でないと音つきの動画を再生できない」制限を確かめられる）
        const v = await send('eval', { js: expr });
        return v == null ? null : JSON.parse(v);
      },
      async wait(expr, ms) {
        const t0 = Date.now();
        for (;;) { let v = false; try { v = await api.eval(expr); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > (ms || 10000)) throw new Error('待ち時間切れ: ' + expr); await sleep(100); }
      },
      async shot(file) { return send('shot', { path: file }); },
      /* ファイルを選ぶ：ファイル選択を開くボタン（文字で探す）を本物のクリックで押し、開いた選択画面で file を選んだことにする */
      async pickFile(inputSelector, file, buttonText) { await api.pickFiles(inputSelector, [file], buttonText); },
      async pickFiles(inputSelector, files, buttonText) { await send('files', { paths: files }); await api.clickText('button', buttonText); },
      async mouse(type, x, y) { await send('mouse', { type, x, y }); },
      async click(x, y) { await api.mouse('move', x, y); await api.mouse('down', x, y); await api.mouse('up', x, y); },
      async drag(x0, y0, x1, y1, steps) {
        await api.mouse('move', x0, y0); await api.mouse('down', x0, y0);
        const n = steps || 8;
        for (let i = 1; i <= n; i++) { await api.mouse('drag', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await sleep(15); }
        await api.mouse('up', x1, y1);
      },
      /* キーを1つ押す。code は 'KeyW' 'Digit5' 'Enter' など */
      async key(code) { const k = KEYS[code]; if (!k) throw new Error('未対応のキー: ' + code); await send('key', { code: k[0], chars: k[1], mods: 0 }); },
      async center(selector) { return api.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top }; })()`); },
      /* 文字で探したボタンを、本物のクリックで押す */
      async clickText(scope, text) {
        const c = await api.eval(`(() => { const b = Array.from(document.querySelectorAll(${JSON.stringify(scope)})).find((x) => x.textContent.includes(${JSON.stringify(text)}) && x.getBoundingClientRect().width > 0); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        if (!c) throw new Error('ボタンが見つかりません: ' + text);
        await api.click(c.x, c.y);
      }
    };
    if (url) await api.goto(url);
    return api;
  }
  async function close() {
    try { await Promise.race([send('quit'), sleep(1500)]); } catch (e) { /* すでに終了 */ }
    await Promise.race([dead, sleep(2000)]);
    if (proc.exitCode === null) proc.kill('SIGKILL');
  }
  return { page, close };
}
module.exports = { launch };
