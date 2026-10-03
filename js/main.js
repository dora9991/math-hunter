// 入口：ゲームを作って、テスト用の窓口（window.__hunt）を用意する
import { Game } from './game.js';
import { installDebug } from './debug.js';
import { loadAssets } from './assets.js';

async function boot() {
  const el = id => document.getElementById(id);
  try {
    // 3Dモデルを読む（読めなくても、プログラムで作った木や岩で遊べる）
    try { await loadAssets(); } catch (e) { console.warn(e); }
    const game = new Game(el('view'), { hud: el('hud'), menu: el('menu'), fx: el('fx') });
    installDebug(game);
    el('boot').remove();
  } catch (e) {
    console.error(e);
    el('boot').innerHTML = `<div class="boot-err">起動できませんでした：${e.message}<br><small>WebGL が使えるブラウザ（Chrome など）で開いてください。</small></div>`;
  }
}
boot();
