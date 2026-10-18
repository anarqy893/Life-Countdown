const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const factor = Number(process.argv[2] || 1);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', String(factor));
(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-moments-batch-'));
  app.setPath('userData', temporary); app.setPath('sessionData', temporary);
  const { defaults } = await import('../src/model.mjs');
  const { estimateOccasions } = await import('../src/moments.mjs');
  const initial = { ...defaults(), birthday: '1986-06-15', lifespan: 80, onboardingStep: 'done' };
  const settingsPath = path.join(temporary, 'life-countdown.json');
  await fs.writeFile(settingsPath, JSON.stringify(initial));
  require('../main.cjs');
  const until = async (check, label) => {
    for (let i = 0; i < 150; i++) { if (await check()) return; await pause(30); }
    throw new Error(`Timed out: ${label}`);
  };
  await until(() => BrowserWindow.getAllWindows().length > 0, 'setup window');
  const widget = BrowserWindow.getAllWindows()[0];
  await until(() => widget.webContents.executeJavaScript('!!document.querySelector("#show-main")').catch(() => false), 'widget ready');
  await widget.webContents.executeJavaScript('window.desktop.showMain()');
  await until(() => BrowserWindow.getAllWindows().length === 2, 'full app');
  widget.hide();
  const main = BrowserWindow.getAllWindows().find(window => window !== widget), run = code => main.webContents.executeJavaScript(code);
  const visible = selector => until(() => run(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false), selector);
  const click = async selector => { await visible(selector); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const saved = async () => JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  const capture = async name => {
    main.showInactive(); await pause(150);
    await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
    await fs.writeFile(path.join(__dirname, `../artifacts/moments-batch-${name}-${factor}.png`), (await main.webContents.capturePage()).toPNG());
  };
  await visible('#what-matters');await click('#what-matters');await click('#add-moment');await visible('#moment-picker');
  assert.equal(await run('document.querySelectorAll("[data-moment-example]").length'), 24);
  assert.equal(await run('[...document.querySelectorAll("[data-moment-example]")].filter(node => !node.hidden).length'), 6);
  assert.equal(await run('document.querySelector("#moment-review").disabled'), true);
  await click('[data-moment-example="0"]'); await click('[data-moment-example="3"]');
  await click('[data-moment-example="3"]');
  assert.equal(await run('document.querySelector("#moment-review").textContent'), 'Review selected (1)', 'second click deselects a bubble');
  await click('[data-moment-example="3"]');
  await capture('picker');
  await click('#moment-more-ideas');
  assert.equal(await run('[...document.querySelectorAll("[data-moment-example]")].filter(node => !node.hidden).length'), 24);
  await click('[data-moment-example="15"]');
  await click('#moment-more-ideas');
  assert.equal(await run('document.querySelectorAll("[data-moment-example]")[15].hidden'), false, 'selected extra ideas stay visible when collapsed');
  await click('#moment-review'); await visible('#moment-batch-form');
  assert.equal(await run('document.querySelectorAll("[data-batch-id]").length'), 3);
  await run(`(() => {
    const rows = document.querySelectorAll('[data-batch-id]');
    rows[0].querySelector('[name=times]').value = '2';
    rows[1].querySelector('[name=times]').value = '5';
    rows[1].querySelector('[name=useReferenceAge]').checked = false;
    rows[1].querySelector('[name=untilAge]').value = '65';
    rows[1].querySelector('[name=times]').dispatchEvent(new Event('input', {bubbles:true}));
    rows[2].querySelector('[name=years]').value = '3';
    rows[2].querySelector('[name=years]').dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  const count = await run('Number(document.querySelectorAll(".moment-batch-preview .occasion-count strong")[1].textContent)');
  assert.equal(count, estimateOccasions(initial.birthday, 80, {times:5,years:1,untilAge:65}));
  await click('#moment-choose-again'); await click('#moment-review');
  assert.equal(await run('document.querySelectorAll("[data-batch-id]")[1].querySelector("[name=times]").value'), '5', 'back to ideas preserves entered frequencies');
  assert.equal(await run('document.querySelectorAll("[data-batch-id]")[1].querySelector("[name=untilAge]").value'), '65');
  await click('#moment-batch-own');
  assert.equal(await run('document.querySelectorAll("[data-batch-id]").length'), 4);
  await run('document.querySelector(".moment-batch-row:last-child [name=name]").value="A special trip"; document.querySelector(".moment-batch-row:last-child [name=name]").dispatchEvent(new Event("input",{bubbles:true}))');
  await click('.moment-batch-row:last-child [data-batch-remove]');
  assert.equal(await run('document.querySelectorAll("[data-batch-id]").length'), 3);
  await capture('review');
  const originalSize = main.getSize(); main.setSize(900, 680); await pause(100);
  assert.ok(await run('document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth + 2'), 'batch review fits a smaller window');
  await capture('small'); main.setSize(...originalSize);
  await run('document.querySelector("[data-batch-id] [name=name]").value="   "; document.querySelector("#moment-batch-form").requestSubmit()');
  assert.equal((await saved()).moments.length, 0, 'invalid batch saves none of the activities');
  assert.ok(await run('document.querySelector("#moment-batch-form .error").textContent.length > 0'));
  await run('document.querySelector("[data-batch-id] [name=name]").value="Swimming in the ocean"; document.querySelector("#moment-batch-form").requestSubmit()');
  await visible('.moments-collection');
  const result = await saved();
  assert.equal(result.moments.length, 3, 'one submission saves all selected activities');
  assert.deepEqual(result.moments.map(({name,times,years,untilAge}) => ({name,times,years,untilAge})), [
    {name:'Swimming in the ocean',times:2,years:1,untilAge:null},
    {name:'Skiing / snowboarding',times:5,years:1,untilAge:65},
    {name:'Annual trips with friends',times:1,years:3,untilAge:null}
  ]);
  assert.deepEqual(result.schedules, initial.schedules);
  await run('location.reload()'); await visible('#what-matters');
  await click('#what-matters'); await visible('.moments-collection');
  assert.equal(await run('document.querySelectorAll("[data-moment-edit]").length'), 3, 'saved batch survives reload and back navigation');
  console.log(`Batch check passed at ${factor}: 24 ideas, disclosure, selection, yearly counts, rarer frequencies, custom end ages, drafts, validation, save all, and persistence.`);
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
