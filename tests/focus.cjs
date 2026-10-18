const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const factor = Number(process.argv[2] || 1);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', String(factor));
(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-focus-'));
  app.setPath('userData', temporary); app.setPath('sessionData', temporary);
  require('../main.cjs');
  await app.whenReady();
  async function until(check) { for(let i=0;i<150;i++){ if(await check()) return; await pause(30); } throw new Error('Focus check timed out'); }
  await until(() => BrowserWindow.getAllWindows().length>0);
  const main=BrowserWindow.getAllWindows()[0];
  const run=code=>main.webContents.executeJavaScript(code);
  const visible=selector=>until(()=>run(`!!document.querySelector(${JSON.stringify(selector)})`).catch(()=>false));
  const click=async selector=>{ await visible(selector); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  await visible('#setup'); main.setMinimumSize(600,400); main.setSize(1000,720); main.show();
  // Establish keyboard modality so buttons also paint :focus-visible indicators.
  main.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});
  main.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
  async function check(selector, screenshot) {
    await visible(selector);
    main.focus();
    await until(() => main.isFocused());
    await pause(150);
    main.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});
    main.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
    await pause(50);
    await run(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); el.focus(); el.scrollIntoView({block:'nearest',inline:'nearest'}); })()`);
    await pause(50);
    const result=await run(`(() => {
      const el=document.querySelector(${JSON.stringify(selector)}), style=getComputedStyle(el), rect=el.getBoundingClientRect();
      const extent=Math.max(0,parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset));
      const clipped=[];
      for(let parent=el.parentElement;parent;parent=parent.parentElement){
        const css=getComputedStyle(parent), bounds=parent.getBoundingClientRect();
        const left=bounds.left+parent.clientLeft,top=bounds.top+parent.clientTop;
        if(css.overflowX!=='visible'&&(rect.left-extent<left-.5||rect.right+extent>left+parent.clientWidth+.5))clipped.push(parent.className+' horizontally');
        if(css.overflowY!=='visible'&&(rect.top-extent<top-.5||rect.bottom+extent>top+parent.clientHeight+.5))clipped.push(parent.className+' vertically');
      }
      return {visible:el.matches(':focus-visible')&&parseFloat(style.outlineWidth)>0&&style.outlineStyle!=='none',clipped,active:el===document.activeElement,outline:style.outline};
    })()`);
    assert.ok(result.visible,`${selector} has a visible keyboard focus indicator: ${JSON.stringify(result)}`);
    assert.deepEqual(result.clipped,[],`${selector} focus indicator fits its clipping ancestors`);
    if(screenshot){ await fs.mkdir(path.join(__dirname,'../artifacts'),{recursive:true});await fs.writeFile(path.join(__dirname,`../artifacts/focus-${screenshot}-${factor}.png`),(await main.webContents.capturePage()).toPNG()); }
  }
  await check('#setup'); await click('#setup'); await click('#guide-personalize');
  await check('[name=birthday]'); await check('[name=lifespan]');
  await run('document.querySelector("[name=birthday]").value="1990-04-12";document.querySelector("#profile-form").requestSubmit()');
  await click('#guide-allocate');
  await check('#guide-hours [name=sleep]','sleep'); await check('#guide-hours [name=work]');
  for(let i=0;i<5;i++)await click('#guide-add-activity');
  await check('.guide-extra-activity:last-child [data-guide-name]','custom');
  await check('.guide-extra-activity:last-child [data-guide-hours]');
  await check('.guide-extra-activity:last-child [data-guide-color]');
  await check('.guide-extra-activity:last-child [data-guide-remove]');
  for(let i=0;i<5;i++)await click('[data-guide-remove]');
  await run('const f=document.querySelector("#guide-hours");f.elements.sleep.value="8";f.elements.work.value="40";f.requestSubmit()');
  await click('#moment-skip');
  await click('#guide-finish'); await visible('#settings');
  await check('#settings'); await check('.legend-item:first-child','legend');
  await click('#settings');
  await check('#category-form [data-name]'); await check('#category-form [data-hours]');
  await click('#add-category'); await check('dialog [name=name]'); await check('dialog select'); await check('dialog .primary');
  await click('dialog [data-cancel]'); await click('#appearance');
  await check('[data-opacity]'); await check('[data-hourly-effect]'); await check('#launch-at-login');
  console.log(`Focus check passed at ${factor}: setup fields, scrolled custom activities, sidebar, legend, category form, dialog and appearance controls.`);
  app.exit(0);
})().catch(error=>{console.error(error);app.exit(1);});
