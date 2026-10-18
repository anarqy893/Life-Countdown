const electron = require('electron');
const { app, BrowserWindow } = electron;
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-widget-periods-'));
  app.setPath('userData', temporary); app.setPath('sessionData', temporary);
  const { defaults, widgetPeriodFor, calculate, countdownParts } = await import('../src/model.mjs');
  const { estimateOccasions } = await import('../src/moments.mjs');
  const state = { ...defaults(), birthday: '1989-08-03', selected: 'five', onboardingStep: 'done', setupHoursConfirmed: true };
  state.periods.push({ id: 'custom', name: 'A chapter & a new beginning', start: '2027-01-01', end: '2037-01-01' });
  state.moments = [{id:'ocean',name:'Swimming in the ocean',times:1,years:1,untilAge:55}];
  const settingsPath = path.join(temporary, 'life-countdown.json');
  await fs.writeFile(settingsPath, JSON.stringify(state));
  let popup;
  // Keep the actual native menu, exposing its items for deterministic selection.
  const electronForApp = { ...electron };
  Object.defineProperty(electronForApp, 'Menu', { value: new Proxy(electron.Menu, {
    get(target, key) {
      if (key !== 'buildFromTemplate') return target[key];
      return template => {
        const menu = target.buildFromTemplate(template), nativePopup = menu.popup.bind(menu);
        menu.popup = options => { popup = {menu,options}; nativePopup(options); };
        return menu;
      };
    }
  }) });
  const Module = require('node:module'), nativeLoad = Module._load;
  Module._load = function(request, parent, ...args) {
    return request === 'electron' && parent?.filename === path.resolve(__dirname, '../main.cjs')
      ? electronForApp : nativeLoad.call(this, request, parent, ...args);
  };
  try { require('../main.cjs'); } finally { Module._load = nativeLoad; }
  const until = async (check, label) => {
    for (let i=0;i<150;i++) { if (await check()) return; await pause(30); }
    throw new Error('Timed out: '+label);
  };
  const findWidget = () => BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().includes('widget=1'));
  let widget;
  await until(()=>{widget=findWidget();return widget;},'widget');
  const run = code=>widget.webContents.executeJavaScript(code);
  const ready = () => until(()=>run('!!document.querySelector("#widget-period-selector")').catch(()=>false),'period selector');
  const saved = async()=>JSON.parse(await fs.readFile(settingsPath,'utf8'));
  const capture = async name=>{
    await pause(100);
    await fs.mkdir(path.join(__dirname,'../artifacts'),{recursive:true});
    await fs.writeFile(path.join(__dirname,`../artifacts/widget-period-${name}.png`),(await widget.webContents.capturePage()).toPNG());
  };
  const selected = ()=>run('document.querySelector("#widget-period-selector").dataset.periodId');
  const openMenu = async()=>{
    popup=null;
    await run('document.querySelector("#widget-period-selector").click()');
    await until(()=>popup,'native menu');
    assert.equal(popup.options.window,widget);
    assert.equal(await run('document.querySelector("#widget-period-selector").getAttribute("aria-expanded")'),'true');
    return popup;
  };
  const choose = async(name,id)=>{
    const {menu}=await openMenu(), item=menu.items.find(item=>item.label===name);
    assert.ok(item,'period is available: '+name);
    item.click();menu.closePopup();
    await until(async()=>await selected()===id&&await run('document.querySelector("#widget-period-selector").getAttribute("aria-expanded")==="false"'),'selected '+id);
  };
  const correctCounter = async()=>{
    const current=await saved(), expected=Number(countdownParts(widgetPeriodFor(current).end,'seconds')[0][1]);
    const actual=await run('Number(document.querySelector("[data-clock] b").textContent.replace(/\\D/g,""))');
    assert.ok(Math.abs(actual-expected)<=2,'countdown uses widget period');
  };
  await ready();
  assert.equal(await selected(),'life','old main selection does not determine widget selection');
  let opened=await openMenu();
  assert.deepEqual(opened.menu.items.map(item=>item.label),['My life','Next five years','Next decade','A chapter & a new beginning']);
  assert.equal(opened.menu.items.find(item=>item.checked).label,'My life');
  opened.menu.closePopup();
  await until(()=>run('document.querySelector("#widget-period-selector").getAttribute("aria-expanded")==="false"'),'cancel menu');
  assert.equal(await selected(),'life');
  await choose('Next decade','decade');await correctCounter();
  assert.equal((await saved()).selected,'five','widget choice does not change main selection');
  await run('window.desktop.showMain()');
  let main;
  await until(()=>{main=BrowserWindow.getAllWindows().find(window=>window!==widget);return main;},'main window');
  const mainRun=code=>main.webContents.executeJavaScript(code);
  await until(()=>mainRun('!!document.querySelector("[data-period=life]")').catch(()=>false),'main ready');
  await mainRun('document.querySelector("[data-period=life]").click()');
  await until(async()=>(await saved()).selected==='life','main browses life');
  assert.equal(await selected(),'decade','main browsing leaves widget selection unchanged');
  await mainRun('document.querySelector("#settings").click()');
  await until(()=>mainRun('!!document.querySelector("#profile-form")'),'main form ready');
  await mainRun('document.querySelector("[name=lifespan]").value="77"');
  await choose('A chapter & a new beginning','custom');await correctCounter();
  assert.equal(await mainRun('document.querySelector("[name=lifespan]").value'),'77','widget selection preserves unsaved main-window inputs');
  await mainRun('document.querySelector("[data-period=life]").click()');
  await capture('counter');
  await run('document.querySelector("#show-grid").click()');
  await until(()=>run('!!document.querySelector("#grid .week")'),'allocation grid');
  await until(()=>widget.getOpacity()===1,'grid presented');
  assert.equal(await run('document.querySelector(".time-chart").dataset.ageReference'),'','custom widget period uses week references even when main shows life');
  assert.equal(await run('document.querySelectorAll("#grid .week").length'),Math.ceil(calculate(state,state.periods.at(-1)).total/168));
  await capture('grid');
  await choose('My life','life');
  assert.equal(await run('document.querySelector(".time-chart").dataset.ageReference'),'90');
  assert.ok(await run('document.querySelectorAll("#grid .week").length>4000'));
  await run('document.querySelector("[data-widget-view=moments]").click()');
  await until(()=>run('!!document.querySelector(".widget-occasion-row")'),'What matters');
  const count=await run('document.querySelector(".occasion-count strong").textContent');
  assert.equal(Number(count),estimateOccasions(state.birthday,90,state.moments[0]));
  await choose('Next five years','five');
  assert.equal(await run('document.querySelector(".occasion-count strong").textContent'),count,'experience horizons remain independent');
  await run('location.reload()');await ready();
  assert.equal(await selected(),'five','widget choice persists across reload');
  await run('document.querySelector("[data-widget-view=allocations]").click()');
  await until(()=>run('!!document.querySelector("#grid .week")'),'allocations restored');
  await choose('A chapter & a new beginning','custom');
  await mainRun('document.querySelector("[data-period=custom]").click()');
  await until(()=>mainRun('!!document.querySelector("#delete-period")'),'custom period page');
  await mainRun('document.querySelector("#delete-period").click()');
  await until(()=>mainRun('!!document.querySelector("dialog .primary")'),'delete confirmation');
  await mainRun('document.querySelector("dialog .primary").click()');
  await until(async()=>await selected()==='life'&&(await saved()).widgetSelected==='life','deleted selection falls back to life');
  opened=await openMenu();
  assert.equal(opened.menu.items.some(item=>item.label===state.periods.at(-1).name),false);
  opened.menu.closePopup();
  await run('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))');
  await until(()=>run('!!document.querySelector("[data-clock]")'),'compact counter');
  await correctCounter();
  console.log('Widget period check passed: native menu, cancellation, independent periods, countdowns, grid references, experience horizons, persistence, and deletion fallback.');
  app.exit(0);
})().catch(error=>{console.error(error);app.exit(1);});
