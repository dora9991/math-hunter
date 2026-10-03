// 画面なし（headless）の Chrome を外から操作するための小さな道具（Chrome DevTools Protocol を直接しゃべる。追加ライブラリなし）
// 使い方：const b = await launch({ width, height }); const p = await b.page(url); await p.eval('1+1'); await p.shot('a.png'); await b.close();
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function launch(opts) {
  opts = opts || {};
  const port = opts.port || 9300 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-e2e-'));
  const args = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    `--window-size=${opts.width || 1440},${opts.height || 900}`, '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'].concat(opts.args || []);
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let ver = null;
  for (let i = 0; i < 300 && !ver; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  if (!ver) { proc.kill(); throw new Error('Chrome を起動できませんでした'); }
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pend = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); }
    else if (m.method) listeners.forEach((fn) => fn(m));
  };
  const send = (method, params, sessionId) => new Promise((resolve, reject) => { const id = ++seq; pend.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {}, sessionId })); });

  async function page(url) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (method, params) => send(method, params, sessionId);
    const logs = [];
    listeners.push((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.consoleAPICalled') logs.push({ type: m.params.type, text: m.params.args.map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ') });
      if (m.method === 'Runtime.exceptionThrown') logs.push({ type: 'exception', text: (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text });
    });
    await S('Page.enable'); await S('Runtime.enable'); await S('DOM.enable');
    const api = {
      engine: 'chrome',
      logs,
      errors: () => logs.filter((l) => l.type === 'error' || l.type === 'exception'),
      /* CPU を遅くする（1＝そのまま、4＝4倍遅い） */
      async cpu(rate) { await S('Emulation.setCPUThrottlingRate', { rate }); },
      async goto(u) { await S('Page.navigate', { url: u }); await api.wait('document.readyState === "complete"', 15000); },
      /* 式を評価して値を返す（Promise なら待つ） */
      async eval(expr) {
        const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
        return r.result.value;
      },
      async wait(expr, ms) {
        const t0 = Date.now();
        for (;;) { let v = false; try { v = await api.eval(expr); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > (ms || 10000)) throw new Error('待ち時間切れ: ' + expr); await new Promise((r) => setTimeout(r, 100)); }
      },
      async shot(file) { const r = await S('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file; },
      async setFiles(selector, files) {
        const { root } = await S('DOM.getDocument');
        const { nodeId } = await S('DOM.querySelector', { nodeId: root.nodeId, selector });
        await S('DOM.setFileInputFiles', { nodeId, files });
      },
      /* ファイルを選ぶ：入力欄に直接ファイルを入れて、選んだときの通知を出す（buttonText は WebKit 用の道具と形をそろえるためのもの） */
      async pickFile(inputSelector, file, buttonText) { await api.pickFiles(inputSelector, [file], buttonText); },
      async pickFiles(inputSelector, files, buttonText) {
        await api.setFiles(inputSelector, files);
        await api.eval(`document.querySelector(${JSON.stringify(inputSelector)}).dispatchEvent(new Event("change", { bubbles: true })); 1`);
      },
      async mouse(type, x, y, extra) { await S('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, extra || {})); },
      async click(x, y) { await api.mouse('mouseMoved', x, y, { buttons: 0 }); await api.mouse('mousePressed', x, y); await api.mouse('mouseReleased', x, y); },
      async drag(x0, y0, x1, y1, steps) {
        await api.mouse('mouseMoved', x0, y0, { buttons: 0 }); await api.mouse('mousePressed', x0, y0);
        const n = steps || 8;
        for (let i = 1; i <= n; i++) { await api.mouse('mouseMoved', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await new Promise((r) => setTimeout(r, 15)); }
        await api.mouse('mouseReleased', x1, y1);
      },
      /* キーを1つ押す。code は 'KeyW' 'Digit5' 'Enter' など */
      async key(code, key, text) {
        const base = { code, key: key || code, windowsVirtualKeyCode: vk(code), nativeVirtualKeyCode: vk(code) };
        await S('Input.dispatchKeyEvent', Object.assign({ type: text ? 'keyDown' : 'rawKeyDown', text }, base));
        await S('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
      },
      /* 要素の中心（画面座標） */
      async center(selector) { return api.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top }; })()`); },
      /* 文字で探したボタンを、本物のクリックで押す */
      async clickText(scope, text) {
        const c = await api.eval(`(() => { const b = Array.from(document.querySelectorAll(${JSON.stringify(scope)})).find((x) => x.textContent.includes(${JSON.stringify(text)}) && x.getBoundingClientRect().width > 0); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        if (!c) throw new Error('ボタンが見つかりません: ' + text);
        await api.click(c.x, c.y);
      },
      send: S
    };
    if (url) await api.goto(url);
    return api;
  }
  function vk(code) {
    if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
    if (/^Digit\d$/.test(code)) return 48 + Number(code[5]);
    return { Enter: 13, Escape: 27, Space: 32, ArrowLeft: 37, ArrowRight: 39, Delete: 46, Backspace: 8 }[code] || 0;
  }
  async function close() {
    const gone = new Promise((r) => { if (proc.exitCode !== null) r(); else proc.once('exit', r); });
    try { await send('Browser.close'); } catch (e) { /* すでに終了 */ }
    await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
    if (proc.exitCode === null) { proc.kill('SIGKILL'); await Promise.race([gone, new Promise((r) => setTimeout(r, 2000))]); }
    // Chrome が完全に終わってから消す（書き込み中に消すと、一時プロフィールのフォルダが残る）
    for (let i = 0; i < 5; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); if (!fs.existsSync(profile)) break; } catch (e) { /* もう一度 */ } await new Promise((r) => setTimeout(r, 300)); }
  }
  return { page, close, port };
}
module.exports = { launch };
