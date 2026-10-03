// 画面の確認：配布版（dist/hunter.html）を file:// で開き、場面を作ってスクリーンショットを撮る
//   node tests/view.cjs chrome <場面名>     … headless Chrome
//   node tests/view.cjs webkit <場面名>     … Safari と同じエンジン（WKWebView）
// 場面は tests/scenarios.cjs にある。画像は tests/shots/ に JPEG で出る。
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chrome';
const name = process.argv[3] || 'title';
const { launch } = require(engine === 'webkit' ? './wk.cjs' : './cdp.cjs');
const scenarios = require('./scenarios.cjs');

(async () => {
  const scen = scenarios[name];
  if (!scen) { console.log('場面がありません:', name, '/', Object.keys(scenarios).join(', ')); process.exit(1); }
  const b = await launch({ width: 960, height: 600 });
  const url = 'file://' + encodeURI(path.resolve(__dirname, '../dist/hunter.html')) + '?seed=7';
  const p = await b.page('about:blank');
  const dir = path.join(__dirname, 'shots');
  fs.mkdirSync(dir, { recursive: true });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shot = async (label) => {
    const png = path.join(dir, `${engine}-${label}.png`);
    await p.shot(png);
    const jpg = png.replace(/\.png$/, '.jpg');
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '-Z', '960', png, '--out', jpg], { stdio: 'ignore' });
    fs.unlinkSync(png);
    return jpg;
  };
  let code = 0;
  try {
    await p.goto(url);
    if (process.env.CPU && p.cpu) await p.cpu(Number(process.env.CPU));
    await p.wait('!!window.__hunt && !document.getElementById("boot")', 40000);
    const out = await scen(p, shot, sleep);
    if (out !== undefined) console.log(typeof out === 'string' ? out : JSON.stringify(out));
  } catch (e) {
    console.log('FAILED', e.message); code = 1;
  } finally {
    const errs = p.errors();
    if (errs.length) console.log('PAGE ERRORS', JSON.stringify(errs.slice(0, 6)));
    await b.close();
  }
  process.exit(code);
})();
