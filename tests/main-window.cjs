const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-main-window-'));
  app.setPath('userData', temporary); app.setPath('sessionData', temporary);
  const returning = process.argv.includes('returning');
  if (returning) {
    const { defaults } = await import('../src/model.mjs');
    await fs.writeFile(path.join(temporary, 'life-countdown.json'), JSON.stringify({ ...defaults(), birthday: '1989-08-03', onboardingStep: 'done', setupHoursConfirmed: true }));
  }
  require('../main.cjs');
  const until = async (check, label) => {
    for (let i = 0; i < 150; i++) { if (await check()) return; await pause(30); }
    throw new Error('Timed out: ' + label);
  };
  let widget;
  if (returning) {
    await until(() => BrowserWindow.getAllWindows().length, 'widget launch');
    widget = BrowserWindow.getAllWindows()[0];
    await until(() => widget.webContents.executeJavaScript('!!document.querySelector("#show-main")').catch(() => false), 'widget ready');
    await widget.webContents.executeJavaScript('window.desktop.showMain()');
    widget.hide();
  }
  let main;
  const findMain = () => BrowserWindow.getAllWindows().find(window => window !== widget);
  await until(() => { main = findMain(); return main?.isVisible(); }, 'main presented');
  await until(() => main.webContents.executeJavaScript('!!document.querySelector("#setup, [data-clock]")').catch(() => false), 'main loaded');
  assert.equal(main.isMaximized(), !returning, 'first setup maximizes; an existing profile keeps its default window size');
  assert.equal(main.isFullScreen(), false, 'maximized setup retains the normal Windows frame');
  const area = screen.getPrimaryDisplay().workArea;
  const original = main.getNormalBounds();
  assert.ok(Math.abs(original.width - Math.min(1380, area.width - 40)) <= 2);
  assert.ok(Math.abs(original.height - Math.min(920, area.height - 40)) <= 2);
  main.unmaximize();
  await until(() => !main.isMaximized(), 'restore');
  assert.deepEqual(main.getBounds(), original, 'Restore uses the previous default dimensions');
  main.setSize(Math.max(main.getMinimumSize()[0], Math.min(1050, area.width - 60)), Math.max(main.getMinimumSize()[1], Math.min(740, area.height - 60)));
  await pause(300);
  const resized = main.getBounds();
  if (!returning) {
    // Closing unfinished setup now quits; exercise reopening after opting into the widget.
    await main.webContents.executeJavaScript('(async()=>{const state=await window.desktop.read()||(await import("./src/model.mjs")).defaults();state.birthday="1989-08-03";state.onboardingStep="done";state.setupHoursConfirmed=true;await window.desktop.save(state);await window.desktop.openWidget();})()');
    widget=BrowserWindow.getAllWindows().find(window=>window!==main);
    widget.hide();
  }
  const placementPath = path.join(temporary, 'main-window.json');
  const reopen = async () => {
    main.close();
    await until(() => !findMain(), 'main closed');
    if (widget) await widget.webContents.executeJavaScript('window.desktop.showMain()');
    else app.emit('second-instance');
    await until(() => { main = findMain(); return main?.isVisible(); }, 'main reopened');
  };
  await reopen();
  assert.equal(main.isMaximized(), false, 'manual resize remains the preferred window state');
  assert.deepEqual(main.getBounds(), resized, 'reopening restores the chosen size and position');
  main.maximize();
  await until(() => main.isMaximized(), 'maximize');
  await reopen();
  assert.equal(main.isMaximized(), true, 'maximized preference survives closing');
  assert.deepEqual(main.getNormalBounds(), resized, 'maximizing does not replace restored dimensions');
  main.minimize();
  await until(() => main.isMinimized(), 'minimize');
  await reopen();
  const saved = JSON.parse(await fs.readFile(placementPath, 'utf8'));
  assert.equal(saved.maximized, true, 'minimizing preserves the maximized preference');
  assert.equal(main.isMaximized(), true);
  main.unmaximize();
  await until(() => !main.isMaximized(), 'final restore');
  assert.deepEqual(main.getBounds(), resized);
  console.log(`Main window check passed (${returning ? 'existing profile' : 'first setup'}): maximization, native Restore, resizing, reopening, and minimizing.`);
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
