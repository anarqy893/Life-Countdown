// Exercise real windows with isolated settings; record native window options and
// intercept only the balloon so this check does not notify the desktop user.
const electron = require('electron');
const { app, BrowserWindow, Tray } = electron;
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
const windowOptions = new WeakMap(), balloons = [];
const electronForApp = { ...electron };
let nativeTray;
Object.defineProperty(electronForApp, 'BrowserWindow', { value: new Proxy(BrowserWindow, {
  construct(target, args) {
    const window = new target(...args);
    windowOptions.set(window, args[0]);
    return window;
  }
}) });
Object.defineProperty(electronForApp, 'Tray', { value: new Proxy(Tray, {
  construct(target, args) {
    nativeTray = new target(...args);
    nativeTray.displayBalloon = options => balloons.push(options);
    return nativeTray;
  }
}) });

(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-taskbar-'));
  app.setPath('userData', temporary); app.setPath('sessionData', temporary);
  const noticePath = path.join(temporary, 'tray-introduction.json');
  const returning = process.argv.includes('returning');
  const widgetLaunch = process.argv.includes('widget');
  const setupPreview = process.argv.includes('setup-preview') || process.argv.includes('setup-preview-complete');
  const setupCompleteOnly = process.argv.includes('setup-complete');
  if (returning) await fs.writeFile(noticePath, JSON.stringify({ shown: true }));
  if (widgetLaunch) {
    const { defaults } = await import('../src/model.mjs');
    await fs.writeFile(path.join(temporary, 'life-countdown.json'), JSON.stringify({ ...defaults(), birthday: '1990-04-12', onboardingStep: 'done', setupHoursConfirmed: true }));
  }
  if (setupPreview || setupCompleteOnly) {
    const { defaults } = await import('../src/model.mjs');
    await fs.writeFile(path.join(temporary, 'life-countdown.json'), JSON.stringify({ ...defaults(), birthday: '1990-04-12', onboardingStep: 'widget', setupHoursConfirmed: true }));
  }
  const Module = require('node:module'), originalLoad = Module._load;
  Module._load = function(request, parent, ...args) {
    if (request === 'electron' && parent?.filename === path.resolve(__dirname, '../main.cjs')) return electronForApp;
    return originalLoad.call(this, request, parent, ...args);
  };
  try { require('../main.cjs'); } finally { Module._load = originalLoad; }
  async function until(check, label) {
    for (let i = 0; i < 150; i++) { if (await check()) return; await pause(30); }
    throw new Error(`Timed out: ${label}`);
  }
  const mainWindow = () => BrowserWindow.getAllWindows().find(w => windowOptions.get(w)?.title === 'Life Countdown');
  await until(() => BrowserWindow.getAllWindows().length > 0, 'initial window');
  let main;
  if (widgetLaunch) {
    const widget = BrowserWindow.getAllWindows()[0];
    assert.equal(windowOptions.get(widget).skipTaskbar, true, 'widget stays out of the taskbar');
    await until(() => widget.webContents.executeJavaScript('!!document.querySelector("#show-main")').catch(() => false), 'widget loaded');
    if (!returning) await until(() => balloons.length === 1, 'first widget-only notice');
    await widget.webContents.executeJavaScript('window.desktop.showMain()');
    await until(() => mainWindow(), 'open full app');
    main = mainWindow();
  } else {
    main = mainWindow();
    await until(() => main.webContents.executeJavaScript('!!document.querySelector("#setup, #guide-finish")').catch(() => false), 'setup loaded');
    assert.equal(balloons.length, 0, 'no tray notice while full app is open');
    assert.equal(nativeTray, undefined, 'unfinished setup has no tray icon');
    if (setupPreview) {
      await main.webContents.executeJavaScript('window.desktop.openWidget()');
      await until(() => BrowserWindow.getAllWindows().length === 2, 'setup preview');
      assert.equal(nativeTray, undefined, 'preview alone does not enable the tray');
    }
    if (setupCompleteOnly || process.argv.includes('setup-preview-complete')) {
      await main.webContents.executeJavaScript('(async()=>{const state=await window.desktop.read();state.onboardingStep="done";await window.desktop.save(state);})()');
    }
  }
  assert.equal(windowOptions.get(main).skipTaskbar, false, 'full app has a taskbar button');
  main.minimize();
  await until(() => main.isMinimized(), 'minimize full app');
  assert.equal(main.isDestroyed(), false, 'minimize keeps the full app window available');
  assert.equal(balloons.length, widgetLaunch && !returning ? 1 : 0, 'minimize does not produce a tray notice');
  if (nativeTray) nativeTray.emit('double-click');
  else main.restore();
  await until(() => !main.isMinimized() && main.isVisible(), 'restore full app from tray');
  if (!nativeTray) {
    app.once('will-quit', () => {
      try {
        assert.equal(BrowserWindow.getAllWindows().length, 0, 'closing setup also closes any widget preview');
        assert.equal(balloons.length, 0, 'closing setup produces no tray notice');
        console.log(`Setup close check passed: ${setupPreview ? 'with widget preview' : setupCompleteOnly ? 'completed without widget launch' : 'initial introduction'} exits fully without a tray.`);
      } catch (error) { console.error(error); app.exit(1); }
    });
    main.close();
    return;
  }
  main.close();
  await until(() => main.isDestroyed(), 'close full app');
  assert.equal(balloons.length, returning ? 0 : 1, 'notice appears once when only the tray/widget remains');
  assert.deepEqual(JSON.parse(await fs.readFile(noticePath, 'utf8')), { shown: true }, 'notice remembered outside calendar settings');
  if (!returning) {
    assert.equal(balloons[0].noSound, true);
    assert.equal(balloons[0].respectQuietTime, true);
    nativeTray.emit('balloon-click');
  } else nativeTray.emit('double-click');
  await until(() => mainWindow(), 'reopen full app');
  main = mainWindow();
  assert.equal(windowOptions.get(main).skipTaskbar, false, 'reopened full app returns to taskbar');
  main.close();
  assert.equal(balloons.length, returning ? 0 : 1, 'repeated closes do not repeat the notice');
  console.log(`Taskbar check passed: ${widgetLaunch ? 'widget launch' : 'setup'}, taskbar options, minimize, restore, close, notice ${returning ? 'suppression' : 'persistence and click'}, and reopen.`);
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
