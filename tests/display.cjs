const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const factor = Number(process.argv[2] || 1);
const temporary = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'life-countdown-display-'));
app.setPath('userData', temporary); app.setPath('sessionData', temporary);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', String(factor));

(async () => {
  const { defaults } = await import('../src/model.mjs');
  const state = defaults(); state.birthday = '1990-04-12'; state.onboardingStep = 'done';
  await fs.writeFile(path.join(temporary, 'life-countdown.json'), JSON.stringify(state));
  await app.whenReady();
  // A 1920×1080 monitor, with a 40-logical-pixel taskbar at each Windows scale.
  const width = Math.floor(1920 / factor), height = Math.floor(1080 / factor);
  const area = { x:0, y:0, width, height:height-40 };
  const display = { ...screen.getPrimaryDisplay(), bounds:{x:0,y:0,width,height}, workArea:area, scaleFactor:factor };
  screen.getPrimaryDisplay = () => display;
  screen.getDisplayMatching = () => display;
  screen.getDisplayNearestPoint = () => display;
  require('../main.cjs');
  async function until(check) {
    for (let i=0;i<150;i++) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Display check timed out');
  }
  await until(() => BrowserWindow.getAllWindows().length === 1);
  const widget = BrowserWindow.getAllWindows()[0];
  const run = code => widget.webContents.executeJavaScript(code);
  await until(() => run('!!document.querySelector("#show-grid")').catch(() => false));
  const normal = widget.getBounds();
  assert.ok(Math.abs(normal.width-420)<=4 && Math.abs(normal.height-144)<=4, 'normal widget retains its size within native Windows border rounding');
  const assertOnScreen = window => {
    const bounds = window.getBounds();
    assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=area.width && bounds.y+bounds.height<=area.height, JSON.stringify({bounds,area}));
  };
  assertOnScreen(widget);
  await run('document.querySelector("#widget-settings-toggle").click()');
  assert.deepEqual(widget.getBounds(), normal);
  assert.ok(await run('document.querySelector(".widget-appearance-view").scrollHeight <= innerHeight'));
  await run('document.querySelector("#back-to-countdown").click(); document.querySelector("#show-grid").click()');
  await until(() => run('!!document.querySelector("#grid .week")'));
  await new Promise(resolve => setTimeout(resolve, 200));
  assertOnScreen(widget);
  assert.ok(await run(`(() => {
    const wrap=document.querySelector('.grid-wrap'), grid=document.querySelector('#grid');
    return grid.offsetWidth<=wrap.clientWidth && grid.offsetHeight<=wrap.clientHeight
      && document.querySelector('.widget').scrollHeight<=innerHeight;
  })()`), 'expanded grid fits without scrolling');
  await fs.mkdir(path.join(__dirname, '../artifacts'), {recursive:true});
  await fs.writeFile(path.join(__dirname, `../artifacts/preview-1080p-${factor*100}-grid.png`), (await widget.webContents.capturePage()).toPNG());
  const expanded = widget.getBounds();
  await run('document.querySelector("#show-grid").click(); document.querySelector("#show-main").click()');
  await until(() => BrowserWindow.getAllWindows().length === 2);
  const main = BrowserWindow.getAllWindows().find(window => window!==widget);
  await until(() => main.webContents.executeJavaScript('!!document.querySelector("#grid .week")').catch(() => false));
  await new Promise(resolve => setTimeout(resolve, 200));
  assertOnScreen(main);
  assert.ok(await main.webContents.executeJavaScript(`(() => {
    const wrap=document.querySelector('.grid-wrap'), grid=document.querySelector('#grid');
    return grid.offsetWidth<=wrap.clientWidth && grid.offsetHeight<=wrap.clientHeight
      && document.querySelector('.content').scrollHeight<=innerHeight;
  })()`), 'main overview fits without scrolling');
  console.log(JSON.stringify({resolution:'1920×1080', scaling:`${factor*100}%`, workspace:area, widget:normal, expandedGrid:expanded, main:main.getBounds(), result:'passed'}));
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
