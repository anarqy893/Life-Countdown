// Use native Windows stacking checks: isAlwaysOnTop can be true while covered.
const { app, BrowserWindow, screen, powerMonitor } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  assert.equal(process.platform, 'win32', 'native stacking check requires Windows');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-countdown-topmost-'));
  app.setPath('userData', temporary);
  app.setPath('sessionData', temporary);
  const { defaults } = await import('../src/model.mjs');
  await fs.writeFile(path.join(temporary, 'life-countdown.json'), JSON.stringify({ ...defaults(), birthday: '1990-04-12', onboardingStep: 'done' }));
  require('../main.cjs');
  await app.whenReady();
  let widget;
  for (let i = 0; i < 150; i++) {
    widget = BrowserWindow.getAllWindows()[0];
    if (widget && await widget.webContents.executeJavaScript('!!document.querySelector("#counter-only")').catch(() => false)) break;
    await pause(30);
  }
  assert.ok(widget);
  assert.equal(widget.isAlwaysOnTop(), true);
  const cover = new BrowserWindow({ ...widget.getBounds(), show: false, alwaysOnTop: true });
  await cover.loadURL('data:text/html,<h1>Topmost stacking test</h1>');
  const handle = window => window.getNativeWindowHandle().readBigUInt64LE().toString();
  const nativeCheck = fsSync.readFileSync(path.join(__dirname, 'topmost-order.ps1'), 'utf8');
  const order = () => {
    const command = `& {\n${nativeCheck}\n} -WidgetHandle ${handle(widget)} -CoverHandle ${handle(cover)}`;
    return JSON.parse(execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')
    ], { encoding: 'utf8', windowsHide: true }));
  };
  async function recover(label, trigger = () => {}) {
    cover.show();
    cover.focus();
    cover.moveTop();
    const before = order();
    assert.equal(before.above, false, `${label}: competing topmost window initially covers widget`);
    trigger();
    await pause(1300);
    const result = order();
    assert.equal(result.above, true, `${label}: native stacking recovers`);
    assert.equal(result.foreground, before.foreground, `${label}: recovery preserves keyboard focus`);
  }
  await recover('periodic recovery');
  cover.setFullScreen(true);
  await pause(300);
  await recover('fullscreen competing window');
  cover.setFullScreen(false);
  widget.setAlwaysOnTop(false);
  assert.equal(widget.isAlwaysOnTop(), true, 'lost topmost flag is repaired');
  for (const event of ['resume', 'unlock-screen']) await recover(event, () => powerMonitor.emit(event));
  await recover('display change', () => screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), ['workArea']));
  await widget.webContents.executeJavaScript('document.querySelector("#counter-only").click()');
  await pause(200);
  await recover('counter-only mode');
  await widget.webContents.executeJavaScript('document.querySelector("#restore-widget").click()');
  await pause(200);
  await widget.webContents.executeJavaScript('document.querySelector("#widget-settings-toggle").click()');
  await recover('appearance mode');
  await widget.webContents.executeJavaScript('document.querySelector("#back-to-countdown").click()');
  await widget.webContents.executeJavaScript('window.desktop.setWidgetExpanded(true)');
  await recover('expanded mode');
  widget.hide();
  widget.setAlwaysOnTop(false);
  powerMonitor.emit('resume');
  await pause(1300);
  assert.equal(widget.isVisible(), false, 'recovery respects Hide widget');
  app.emit('second-instance');
  await pause(200);
  assert.equal(widget.isVisible(), true, 'explicit reopen shows widget');
  assert.equal(widget.isAlwaysOnTop(), true, 'reopen repairs hidden topmost flag');
  cover.destroy();
  console.log('Topmost check passed: native stacking, focus preservation, wake/unlock, display changes, widget modes, hiding and reopening.');
  app.quit();
})().catch(error => { console.error(error); app.exit(1); });
