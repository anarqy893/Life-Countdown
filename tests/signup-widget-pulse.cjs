const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-signup-pulse-'));
  app.setPath('userData', temporary); app.setPath('sessionData', temporary);
  const { defaults } = await import('../src/model.mjs');
  const settingsPath = path.join(temporary, 'life-countdown.json');
  await fs.writeFile(settingsPath, JSON.stringify({ ...defaults(), birthday: '1989-08-03', onboardingStep: 'widget', setupHoursConfirmed: true, hourlyEffect: 'sweep' }));
  let pulsePreviews = 0;
  const nativeHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => nativeHandle(channel, channel === 'widget:effect-preview' ? (...args) => {
    if (args[1] === 'pulse') pulsePreviews++;
    return handler(...args);
  } : handler);
  try { require('../main.cjs'); } finally { ipcMain.handle = nativeHandle; }
  const until = async (check, label) => {
    for (let i = 0; i < 150; i++) { if (await check()) return; await pause(30); }
    throw new Error('Timed out: ' + label);
  };
  let main;
  await until(() => { main = BrowserWindow.getAllWindows()[0]; return main; }, 'setup window');
  const run = code => main.webContents.executeJavaScript(code);
  const launchReady = () => until(() => run('!!document.querySelector("#guide-show-widget")&&!document.querySelector("#guide-show-widget").disabled').catch(() => false), 'launch button ready');
  const findWidget = () => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('widget=1'));
  await launchReady();
  await run('document.querySelector("#guide-show-widget").click();document.querySelector("#guide-show-widget").click()');
  await until(() => findWidget()?.webContents.executeJavaScript('!!document.querySelector(".hourly-pulse")').catch(() => false), 'cold launch pulse actually plays');
  await launchReady();
  let saved = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  assert.equal(saved.setupWidgetPulseShown, true);
  assert.equal(saved.hourlyEffect, 'sweep', 'introduction does not change the chosen hourly effect');
  assert.equal(pulsePreviews, 1, 'rapid clicks trigger one preview');
  await findWidget().webContents.executeJavaScript('window.desktop.previewEffect("off")');
  await run('document.querySelector("#guide-show-widget").click()'); await launchReady();
  assert.equal(pulsePreviews, 1, 'repeat launches do not repeat the introduction');
  findWidget().destroy();
  await run('location.reload()'); await launchReady();
  await run('document.querySelector("#guide-show-widget").click()'); await launchReady();
  await until(() => findWidget()?.webContents.executeJavaScript('!!document.querySelector("[data-clock]")').catch(() => false), 'new widget ready after reload');
  assert.equal(pulsePreviews, 1, 'saved introduction flag survives reload and widget recreation');
  assert.equal(await findWidget().webContents.executeJavaScript('!!document.querySelector(".hourly-pulse")'), false);
  saved = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  assert.equal(saved.hourlyEffect, 'sweep');
  const fresh = await run('window.desktop.reset()');
  assert.equal(fresh.setupWidgetPulseShown, false, 'reset allows the first-launch introduction again');
  console.log('Signup widget pulse check passed: cold launch, one-time preview, saved effect preference, repeated clicks, reload, recreation, and reset.');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
