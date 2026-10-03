// 配布用の1ファイル版をつくる： node build.mjs → dist/hunter.html
// JS は esbuild で1つにまとめ、CSS と一緒に HTML に埋め込む（ダブルクリックで開ける）
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const r = p => path.join(root, p);

// 3Dモデル（GLB）を base64 にして JS に埋め込む
const modelDir = r('assets/models/kenney');
const embedPlugin = {
  name: 'embed-models',
  setup(b) {
    b.onLoad({ filter: /assetData\.js$/ }, () => {
      const data = {};
      for (const f of fs.readdirSync(modelDir)) if (f.endsWith('.glb')) data[f.replace(/\.glb$/, '')] = fs.readFileSync(path.join(modelDir, f)).toString('base64');
      const zarva = r('assets/models/monster/zarva.glb');
      if (fs.existsSync(zarva)) data['creature:zarva'] = fs.readFileSync(zarva).toString('base64');
      const sektra = r('assets/models/monster/sektra.glb');
      if (fs.existsSync(sektra)) data['creature:sektra'] = fs.readFileSync(sektra).toString('base64');
      const veira = r('assets/models/monster/veira.glb');
      if (fs.existsSync(veira)) data['creature:veira'] = fs.readFileSync(veira).toString('base64');
      for (const f of fs.readdirSync(r('assets/models/monster'))) {
        const id = f.replace(/\.glb$/, '');
        if (f.endsWith('.glb') && !['zarva', 'sektra', 'veira'].includes(id)) data['creature:' + id] = fs.readFileSync(r('assets/models/monster/' + f)).toString('base64');
      }
      const hunterGlb = r('assets/models/hunter/hunter.glb');
      if (fs.existsSync(hunterGlb)) data['creature:hunter'] = fs.readFileSync(hunterGlb).toString('base64');
      const texDir = r('assets/textures');
      if (fs.existsSync(texDir)) for (const f of fs.readdirSync(texDir)) if (f.endsWith('.jpg')) data['tex:' + f.replace(/\.jpg$/, '')] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(texDir, f)).toString('base64');
      return { contents: 'export default ' + JSON.stringify(data) + ';', loader: 'js' };
    });
  },
};

const audioDir = r('assets/audio');
const audioFiles = fs.readdirSync(audioDir).filter(f => f.endsWith('.m4a'));
const embedAudio = {
  name: 'embed-audio',
  setup(b) {
    b.onLoad({ filter: /musicData\.js$/ }, () => ({
      contents: 'export default ' + JSON.stringify(Object.fromEntries(audioFiles.map(f =>
        [path.basename(f, '.m4a'), 'data:audio/mp4;base64,' + fs.readFileSync(path.join(audioDir, f)).toString('base64')]))),
      loader: 'js',
    }));
  },
};
async function bundle(standalone) {
  const result = await build({
    plugins: standalone ? [embedPlugin, embedAudio] : [embedPlugin],
    entryPoints: [r('js/main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    target: 'es2020',
    legalComments: 'none',
    logLevel: 'warning',
  });
  return result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}
const css = fs.readFileSync(r('css/style.css'), 'utf8');
const d = new Date(), pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
function makeHtml(js) {
  let html = fs.readFileSync(r('index.html'), 'utf8');
  html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`);
  html = html.replace(/<!-- IMPORTMAP -->[\s\S]*?<!-- \/IMPORTMAP -->\n?/, () => '');
  html = html.replace(/<!-- APP -->[\s\S]*?<!-- \/APP -->/, () => `<script>\n${js}\n</script>`);
  return html.replace('<head>', () => `<head>\n<!-- 竜狩りの谷 配布版（${stamp} ビルド）。three.js (MIT) を同梱 -->`);
}
fs.mkdirSync(r('dist'), { recursive: true });
const offlineHtml = makeHtml(await bundle(true));
fs.writeFileSync(r('dist/hunter.html'), offlineHtml);
fs.mkdirSync(r('docs'), { recursive: true });
const webHtml = makeHtml(await bundle(false));
fs.writeFileSync(r('docs/index.html'), webHtml);
fs.writeFileSync(r('docs/.nojekyll'), '');
fs.mkdirSync(r('docs/assets/audio'), { recursive: true });
for (const f of audioFiles) fs.copyFileSync(path.join(audioDir, f), r('docs/assets/audio/' + f));
console.log(`dist/hunter.html ${(offlineHtml.length / 1024).toFixed(0)} KB / docs/index.html ${(webHtml.length / 1024).toFixed(0)} KB + BGM ${audioFiles.length}曲`);
