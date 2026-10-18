// 冒険のUIから調査・狩猟・村の復興・製作・再読込まで通す。
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chrome';
const { launch } = require(engine === 'webkit' ? './wk.cjs' : './cdp.cjs');
const width = Number(process.argv[3] || 1280), height = width < 600 ? 844 : 860;
(async () => {
  const b = await launch({ width, height });
  const dir = path.resolve(__dirname, 'shots'); fs.mkdirSync(dir, { recursive: true });
  const url = 'file://' + encodeURI(path.resolve(__dirname, '../dist/hunter.html')) + '?debug=1&seed=17';
  let passed = 0;
  const check = (name, cond) => { assert.ok(cond, name); passed++; };
  let p;
  try {
    p = await b.page(url);
    if (engine === 'chrome') await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await p.wait('!!window.__hunt?.game', 40000);
    if (process.argv.includes('expand')) {
      await require('./expansion-browser.cjs')({p,url,dir,width,engine,check});
      check('実行中のページエラーがない', p.errors().length === 0);
      console.log(JSON.stringify({scenario:'expansion',engine,width,pass:passed,errors:p.errors()}));
      return;
    }
    await p.eval(`localStorage.removeItem('hunter.adventure.v1');1`);
    await p.goto(url); await p.wait('!!window.__hunt?.game', 40000);
    check('指定した画面幅で表示される', await p.eval(`innerWidth === ${width}`));
    await p.clickText('.title button.start', 'はじめる');
    await p.wait(`!!document.querySelector('.dialogue-copy')`, 10000);
    check('初回に物語が始まる', await p.eval(`!!document.querySelector('.dialogue-copy')`));
    for (let i = 0; i < 3; i++) {
      await p.clickText('.story-next', i === 2 ? '旅を続ける' : '次へ');
      await p.wait(i === 2 ? `!document.querySelector('.adv-dialog')` : `document.querySelector('.dialogue-person > span:last-child')?.textContent === '${i + 2} / 3'`, 10000);
    }
    check('村と最初の依頼が表示される', await p.eval(`!!document.querySelector('.village-view') && document.querySelector('.next-request').textContent.includes('街道の雷鳴')`));
    await p.shot(path.join(dir, `adventure-${engine}-${width}-village.png`));
    await p.clickText('.next-quest', '依頼を確認する');
    await p.wait(`!!document.querySelector('.quest-prep')`, 10000);
    await p.clickText('[data-site="trace"]', '焦げた道しるべ');
    await p.wait(`!!document.querySelector('.record-trace')`, 10000);
    await p.clickText('.record-trace', '調査を記録する');
    await p.wait(`!document.querySelector('.adv-dialog') && !!document.querySelector('[data-site="trace"].recorded')`, 10000);
    await p.clickText('[data-site="rune"]', '街道の標識');
    await p.wait(`!!document.querySelector('.puzzle-choices')`, 10000);
    await p.clickText('[data-answer="-8"]', '−8');
    await p.wait(`!!document.querySelector('[data-answer="-8"].wrong')`, 10000);
    check('誤答では調査が進まない', await p.eval(`!window.__hunt.game.adventure.state.investigations.road.includes('rune')`));
    await p.clickText('.puzzle-hint', 'ヒント');
    await p.wait(`!document.querySelector('.puzzle-hint-copy').classList.contains('hidden')`, 10000);
    check('仕掛けのヒントが読める', await p.eval(`!document.querySelector('.puzzle-hint-copy').classList.contains('hidden')`));
    await p.clickText('[data-answer="2"]', '2');
    await p.wait(`!!document.querySelector('.adv-dialog .primary')`, 10000);
    await p.clickText('.adv-dialog .primary', '準備画面へ');
    await p.wait(`!document.querySelector('.adv-dialog')`, 10000);
    check('二つの調査が準備画面に反映される', await p.eval(`document.querySelectorAll('.research-card.recorded').length === 2`));
    await p.shot(path.join(dir, `adventure-${engine}-${width}-quest.png`));
    await p.clickText('.depart-adventure', '狩る');
    await p.wait(`window.__hunt.game.mode === 'hunt'`, 10000);
    check('調査と装具の支援が実際の戦闘に入る', await p.eval(`window.__hunt.game.math.focusMax === 15 && window.__hunt.game.math.expedition.effects.parts === 1.15 && window.__hunt.game.activeAdventure.questId === 'road'`));
    const fight = async () => p.eval(`(()=>{const g=window.__hunt.game, m=g.math;g.hunter.god=true;let next=2;for(let t=0;t<500&&g.mode==='hunt';t+=1/60){g.tick(1/60);if(m.rt>=next&&!m.endAt){const id=m._enabled(m.cards.big)?'big':'atk';if(m._enabled(m.cards[id]))m.choose(id,m.cards[id].prob.answer);next=m.rt+1;}}return {win:g.lastMath?.win,mode:g.mode,completed:g.adventure.state.completed.slice()}})()`);
    let result = await fight(); check('実際の戦闘の勝利で依頼が達成になる', result.win && result.mode === 'result' && result.completed.includes('road'));
    check('依頼の報酬が結果画面に載る', await p.eval(`document.querySelector('.adventure-reward').textContent.includes('初回達成')`));
    await p.clickText('.result-btns .back', '村で報告する'); await p.wait(`!!document.querySelector('.story-skip')`, 10000); await p.clickText('.story-skip', '閉じる'); await p.wait(`!document.querySelector('.adv-dialog')`, 10000);
    await p.clickText('.next-quest', '依頼を確認する'); await p.wait(`!!document.querySelector('.quest-prep')`, 10000); await p.clickText('.depart-adventure', '狩る'); await p.wait(`window.__hunt.game.mode === 'hunt'`, 10000);
    result = await fight(); check('章ボスを倒して鍛冶屋と森林を解放できる', result.win && await p.eval(`window.__hunt.game.adventure.facility('forge') && window.__hunt.game.adventure.available('roots')`));
    await p.shot(path.join(dir, `adventure-${engine}-${width}-reward.png`));
    await p.clickText('.result-btns .back', '村で報告する'); await p.wait(`!!document.querySelector('.story-skip')`, 10000); await p.clickText('.story-skip', '閉じる'); await p.wait(`!document.querySelector('.adv-dialog')`, 10000);
    await p.clickText('[data-tab="workshop"]', '鍛冶屋');
    await p.wait(`!!document.querySelector('.workshop-page')`, 10000);
    await p.clickText('[data-craft="breaker"]', '製作して装備する');
    await p.wait(`!!document.querySelector('[data-equip="breaker"]:disabled')`, 10000);
    check('鍛冶屋から製作して装備できる', await p.eval(`window.__hunt.game.adventure.state.equipped === 'breaker' && document.querySelector('[data-equip="breaker"]').disabled`));
    await p.shot(path.join(dir, `adventure-${engine}-${width}-workshop.png`));
    await p.goto(url); await p.wait('!!window.__hunt?.game', 40000); await p.clickText('.title button.start', 'はじめる');
    await p.wait(`!!document.querySelector('.village-page')`, 10000);
    check('再読込しても章・装具・導入の既読を保存する', await p.eval(`window.__hunt.game.adventure.state.completed.length === 2 && window.__hunt.game.adventure.state.equipped === 'breaker' && !document.querySelector('.adv-dialog')`));
    await p.clickText('[data-tab="map"]', '世界地図');
    await p.wait(`!!document.querySelector('.chapter-card')`, 10000);
    check('開放済みの地域だけを選べる', await p.eval(`document.querySelectorAll('.chapter-card:not(:disabled)').length === 2`));
    await p.shot(path.join(dir, `adventure-${engine}-${width}-map.png`));
    check('画面の横にはみ出さない', await p.eval(`document.querySelector('.home-main').scrollWidth <= document.querySelector('.home-main').clientWidth + 1`));
    // 残る地域では戦闘の結果処理を通し、最終章までのUIと支援を確認する。
    await p.eval(`(()=>{const g=window.__hunt.game;for(const id of ['roots','spring','dunes','scales','snowpath','embers','skyway','stars','crater','guardian','sixlights']){g.startAdventureQuest(id);g.math.clearTime=80;g.math.finish(true,'依頼達成');}g.goHome();1})()`);
    check('第一部の報告と完成した村に到達する', await p.eval(`window.__hunt.game.adventure.facility('plaza') && window.__hunt.game.adventure.state.completed.length === 13 && !!document.querySelector('.adv-dialog')`));
    await p.clickText('.story-skip', '閉じる');
    await p.wait(`!document.querySelector('.adv-dialog')`, 10000);
    await p.shot(path.join(dir, `adventure-${engine}-${width}-restored.png`));
    await p.eval(`window.__hunt.game.startAdventureQuest('road');1`);
    check('復興した村が体力と回復薬を支援する', await p.eval(`window.__hunt.game.hunter.maxHp === 115 && window.__hunt.game.math.potions === 4`));
    await p.eval(`window.__hunt.mathStart({enemy:'raizen',level:'normal'});1`);
    check('自由狩猟には冒険の支援を持ち込まない', await p.eval(`window.__hunt.game.math.focusMax === 6 && window.__hunt.game.hunter.maxHp === 100 && window.__hunt.game.math.potions === 3 && window.__hunt.game.activeAdventure === null`));
    if (width >= 900) {
      const regression = await p.eval(`window.__hunt.game.hunter.god=false;window.__hunt.mathtest()`);
      check('既存の数式バトルの検証も通る', regression.pass === regression.total);
      console.log(JSON.stringify({battleRegression:regression}));
    }
    check('実行中のページエラーがない', p.errors().length === 0);
    console.log(JSON.stringify({engine,width,pass:passed,errors:p.errors()}));
  } catch (e) {
    if (p) { await p.shot(path.join(dir, `adventure-${engine}-${width}-failed.png`)); console.error(JSON.stringify({error:e.message,pageErrors:p.errors(),state:await p.eval(`({dialog:document.querySelector('.adv-dialog')?.textContent,mode:window.__hunt?.game.mode})`)})); }
    throw e;
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
