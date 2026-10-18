const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-timeline-loading-'));
  app.setPath('userData', temporary); app.setPath('sessionData', temporary);
  const { defaults } = await import('../src/model.mjs');
  const settingsPath = path.join(temporary, 'life-countdown.json');
  await fs.writeFile(settingsPath, JSON.stringify({ ...defaults(), onboardingStep: 'profile' }));
  let releaseSave, failSave = true, calendarWrites = 0;
  const nativeHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => nativeHandle(channel, channel === 'settings:write' ? async (event, state) => {
    if (state.onboardingStep === 'calendar') {
      calendarWrites++;
      await new Promise(resolve => { releaseSave = resolve; });
      if (failSave) throw new Error('Test save failure');
    }
    return handler(event, state);
  } : handler);
  try { require('../main.cjs'); } finally { ipcMain.handle = nativeHandle; }
  const until = async (check, label) => {
    for (let i = 0; i < 150; i++) { if (await check()) return; await pause(30); }
    throw new Error('Timed out: ' + label);
  };
  let main;
  await until(() => { main = BrowserWindow.getAllWindows()[0]; return main; }, 'setup window');
  const run = code => main.webContents.executeJavaScript(code);
  await until(() => run('!!document.querySelector("#profile-form")').catch(() => false), 'dates form');
  await run('document.querySelector("#profile-form").requestSubmit()');
  assert.equal(calendarWrites, 0, 'invalid inputs do not start generation');
  assert.equal(await run('document.querySelector("#profile-form button").disabled'), false);
  await run('document.querySelector("[name=birthday]").value="1990-04-12";document.querySelector("[name=lifespan]").value="130";document.querySelector("#profile-form").requestSubmit()');
  await until(() => releaseSave, 'save held open');
  assert.equal(await run('document.querySelector("#profile-form button").textContent'), 'Generating timeline\u2026');
  assert.equal(await run('document.querySelector("#profile-form").getAttribute("aria-busy")'), 'true');
  assert.equal(await run('[...document.querySelectorAll("#profile-form input,#profile-form button,[data-guide-back]")].every(control=>control.disabled)'), true);
  await run('document.querySelector("#profile-form").requestSubmit();document.querySelector("#profile-form").requestSubmit()');
  assert.equal(calendarWrites, 1, 'repeated submissions cannot start duplicate work');
  releaseSave(); releaseSave = null;
  await until(() => run('document.querySelector("#profile-form .error")?.textContent.includes("Test save failure")'), 'save failure shown');
  assert.equal(await run('document.querySelector("#profile-form button").textContent'), 'Show my calendar');
  assert.equal(await run('document.querySelector("#profile-form").hasAttribute("aria-busy")'), false);
  assert.equal(await run('[...document.querySelectorAll("#profile-form input,#profile-form button,[data-guide-back]")].every(control=>!control.disabled)'), true, 'failure restores usable controls');
  assert.equal(JSON.parse(await fs.readFile(settingsPath, 'utf8')).onboardingStep, 'profile');
  failSave = false;
  await run(`window.calendarMounts=0;new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)
      if(node.nodeType===1&&(node.matches('.timeline-grid')||node.querySelector('.timeline-grid')))window.calendarMounts++;
  }).observe(document.querySelector('#app'),{childList:true,subtree:true});
  document.querySelector('#profile-form').requestSubmit()`);
  await until(() => releaseSave, 'retry saving');
  releaseSave();
  await until(() => run('!!document.querySelector("#guide-allocate")'), 'personal timeline ready');
  assert.equal(await run('window.calendarMounts'), 1, 'successful transition constructs the timeline once');
  assert.equal(await run('document.querySelectorAll(".timeline-cell").length'), 130 * 52);
  assert.equal(JSON.parse(await fs.readFile(settingsPath, 'utf8')).onboardingStep, 'calendar');
  console.log('Timeline loading check passed: immediate feedback, duplicate submission prevention, validation, save failure recovery, and one timeline build.');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
