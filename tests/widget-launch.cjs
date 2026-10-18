const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();

(async () => {
  const temporary = fsSync.mkdtempSync(path.join(os.tmpdir(), 'life-countdown-launch-'));
  app.setPath('userData', temporary);
  app.setPath('sessionData', temporary);
  const { defaults } = await import('../src/model.mjs');
  const state = defaults();
  state.birthday = '1990-04-12'; state.onboardingStep = 'done';
  if (process.argv.includes('legacy')) delete state.onboardingStep;
  state.widgetCounterOnly = true;
  await fs.writeFile(path.join(temporary, 'life-countdown.json'), JSON.stringify(state));
  await app.whenReady();
  const area = screen.getPrimaryDisplay().workArea;
  const offscreen = process.argv.includes('offscreen');
  const positions = {
    normal: { x: area.x + 40, y: area.y + 50, width: 420 },
    counter: { x: area.x + 100, y: area.y + 110, width: 240 }
  };
  if (offscreen) {
    positions.normal.x = positions.counter.x = area.x + area.width + 10000;
    positions.normal.y = positions.counter.y = area.y + area.height + 10000;
  }
  await fs.writeFile(path.join(temporary, 'widget-positions.json'), JSON.stringify(positions));
  require('../main.cjs');
  await app.whenReady();
  async function until(check) {
    for (let i = 0; i < 150; i++) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Launch check timed out');
  }
  await until(() => BrowserWindow.getAllWindows().length > 0);
  const widget = BrowserWindow.getAllWindows()[0];
  await until(() => widget.webContents.executeJavaScript('!!document.querySelector("#restore-widget")').catch(() => false));
  assert.equal(BrowserWindow.getAllWindows().length, 1, 'configured launches create only the widget');
  assert.equal(widget.getBounds().height, 64, 'saved counter-only mode is restored');
  const initial = widget.getBounds();
  if (offscreen) {
    assert.ok(initial.x >= area.x && initial.y >= area.y);
    assert.ok(initial.x + initial.width <= area.x + area.width && initial.y + initial.height <= area.y + area.height, 'missing monitor positions are brought back on screen');
  } else {
    assert.equal(initial.x, positions.counter.x, 'launch restores counter-only horizontal position');
    assert.equal(initial.y, positions.counter.y, 'launch restores counter-only vertical position');
  }
  await widget.webContents.executeJavaScript('document.querySelector("#restore-widget").click()');
  await until(() => widget.webContents.executeJavaScript('!!document.querySelector("#show-main")'));
  if (!offscreen) {
    assert.equal(widget.getBounds().x, positions.normal.x, 'normal view has its own saved horizontal position');
    assert.equal(widget.getBounds().y, positions.normal.y, 'normal view has its own saved vertical position');
  }
  widget.setPosition(area.x + 70, area.y + 80);
  await widget.webContents.executeJavaScript('document.querySelector("#counter-only").click()');
  await until(() => widget.webContents.executeJavaScript('!!document.querySelector("#restore-widget")'));
  widget.setPosition(area.x + 140, area.y + 150);
  await widget.webContents.executeJavaScript('document.querySelector("#restore-widget").click()');
  await until(() => widget.webContents.executeJavaScript('!!document.querySelector("#show-main")'));
  assert.equal(widget.getBounds().x, area.x + 70, 'switching views restores the last normal position');
  assert.equal(widget.getBounds().y, area.y + 80);
  const stored = JSON.parse(await fs.readFile(path.join(temporary, 'widget-positions.json'), 'utf8'));
  assert.equal(stored.counter.x, area.x + 140, 'counter-only movement is saved independently to disk');
  assert.equal(stored.counter.y, area.y + 150);
  assert.equal(stored.normal.x, area.x + 70);
  await widget.webContents.executeJavaScript('document.querySelector("#show-main").click()');
  await until(() => BrowserWindow.getAllWindows().length === 2);
  const main = BrowserWindow.getAllWindows().find(window => window !== widget);
  await until(() => main.webContents.executeJavaScript('!!document.querySelector("#grid .week")').catch(() => false));
  widget.close();
  await until(() => widget.isDestroyed() && BrowserWindow.getAllWindows().length === 1);
  await main.webContents.executeJavaScript('window.desktop.openWidget()');
  await until(() => BrowserWindow.getAllWindows().length === 2);
  const reopened = BrowserWindow.getAllWindows().find(window => window !== main);
  assert.equal(reopened.getBounds().x, area.x + 70, 'reopening restores the saved position');
  assert.equal(reopened.getBounds().y, area.y + 80);
  main.close();
  await until(() => BrowserWindow.getAllWindows().length === 1);
  assert.equal(reopened.isDestroyed(), false, 'closing the full app leaves the widget running');
  const unexpectedQuit = () => { console.error('Closing all windows must leave the tray running'); app.exit(1); };
  app.once('before-quit', unexpectedQuit);
  reopened.close();
  await until(() => BrowserWindow.getAllWindows().length === 0);
  await new Promise(resolve => setTimeout(resolve, 100));
  app.emit('second-instance');
  await until(() => BrowserWindow.getAllWindows().length === 1);
  const restored = BrowserWindow.getAllWindows()[0];
  assert.equal(restored.getBounds().x, area.x + 70, 'launching again brings the existing tray app back');
  assert.equal(restored.getBounds().y, area.y + 80);
  app.removeListener('before-quit', unexpectedQuit);
  console.log('Launch check passed: widget-only launch, separate saved positions, mode switching, offscreen recovery, reopening, and full app access.');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
