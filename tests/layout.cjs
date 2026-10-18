const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const factor = Number(process.argv[2] || 1);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', String(factor));
(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-layout-'));
  app.setPath('userData', temporary); app.setPath('sessionData', temporary);
  const { defaults } = await import('../src/model.mjs');
  const state = { ...defaults(), birthday: '1989-08-03', lifespan: 90, onboardingStep: 'done', setupHoursConfirmed: true, countdownFormat: 'hours' };
  state.schedules[0].hours = { sleep: 8, work: 40 };
  await fs.writeFile(path.join(temporary, 'life-countdown.json'), JSON.stringify(state));
  await app.whenReady();
  const width = Math.floor(1920 / factor), height = Math.floor(1080 / factor);
  const area = { x:0, y:0, width, height:height-40 };
  screen.getPrimaryDisplay = () => ({ ...screen.getDisplayNearestPoint({x:0,y:0}), workArea:area });
  require('../main.cjs');
  async function until(check) { for(let i=0;i<150;i++){ if(await check()) return; await pause(30); } throw new Error('Layout check timed out'); }
  await until(() => BrowserWindow.getAllWindows().length === 1);
  const widget = BrowserWindow.getAllWindows()[0];
  await widget.webContents.executeJavaScript('window.desktop.showMain()');
  await until(() => BrowserWindow.getAllWindows().length === 2);
  const main = BrowserWindow.getAllWindows().find(w => w !== widget);
  const run = code => main.webContents.executeJavaScript(code);
  await until(() => run('!!document.querySelector(".split-overview #grid .week")').catch(() => false));
  widget.hide(); main.showInactive();
  const capture = async name => {
    await pause(250); await fs.mkdir(path.join(__dirname,'../artifacts'),{recursive:true});
    await fs.writeFile(path.join(__dirname,`../artifacts/layout-${name}-${factor}.png`),(await main.webContents.capturePage()).toPNG());
  };
  const columns = () => run('getComputedStyle(document.querySelector("#grid")).gridTemplateColumns.split(" ").length');
  const fits = () => run(`(() => {
    const grid=document.querySelector('#grid').getBoundingClientRect(), wrap=document.querySelector('.grid-wrap').getBoundingClientRect();
    const content=document.querySelector('main');
    return grid.right<=wrap.right+2 && grid.bottom<=wrap.bottom+2 && grid.width<=wrap.width && grid.height<=wrap.height && content.scrollHeight<=content.clientHeight+1;
  })()`);
  assert.ok(await run('!!document.querySelector(".nav-collapsed")'));
  const ageLabels = await run('document.querySelector(".allocation-axis-y").textContent');
  for(const size of [[Math.min(1380,area.width-40),Math.min(920,area.height-40)],[900,680],[1100,760]]){
    main.setSize(Math.min(size[0],area.width-40),Math.min(size[1],area.height-40)); await pause(300);
    assert.equal(await columns(),52,'column count stays fixed while resizing');
    assert.equal(await run('document.querySelector(".allocation-axis-x span:last-child").textContent'),'52');
    assert.equal(await run('document.querySelector(".allocation-axis-y").textContent'),ageLabels,'age labels stay the same while resizing');
    assert.ok(await fits(),`grid fits ${size} at ${factor} scaling`);
  }
  main.setSize(Math.min(1380,area.width-40),Math.min(920,area.height-40)); await pause(200);
  await capture('52-week');
  for (const [tab, ready] of [['what-matters','.moments-empty'], ['settings','#category-form'], ['appearance','[data-opacity]'], ['help','.help-topics']]) {
    await run('document.querySelector("#navigation-toggle").click()');
    await until(() => run('!!document.querySelector(".layout:not(.nav-collapsed)")'));
    await run(`document.querySelector('#${tab}').click()`);
    await until(() => run(`!!document.querySelector('.nav-collapsed') && !!document.querySelector('${ready}')`));
    assert.equal(await run('document.querySelector("#navigation-toggle").getAttribute("aria-expanded")'), 'false', `${tab} collapses navigation`);
    assert.equal(await run(`document.querySelector('#${tab}').classList.contains('active')`), true);
  }
  await run('document.querySelector("#navigation-toggle").click()');
  await until(() => run('!!document.querySelector(".layout:not(.nav-collapsed)")'));
  await run('document.querySelector("[data-period=five]").click()');
  await until(() => run('!!document.querySelector(".nav-collapsed #grid")'));
  await run('document.querySelector("[data-period=life]").click()');
  await until(() => run('!!document.querySelector(".nav-collapsed .allocation-axis-y")'));
  await run('document.querySelector("#navigation-toggle").click()');
  await until(() => run('!!document.querySelector(".split-overview:not(.nav-collapsed)")'));
  assert.equal(await columns(),52);
  await run('document.querySelector("[data-overview-layout=classic]").click()');
  await until(() => run('!document.querySelector(".split-overview")'));
  await capture('original');
  assert.ok(await columns()>52,'original adaptive grid is preserved');
  await run('document.querySelector("[data-overview-layout=split]").click()');
  await until(() => run('!!document.querySelector(".split-overview")'));
  await run('document.querySelector("#navigation-toggle").click()');
  await until(() => run('!!document.querySelector(".nav-collapsed")'));
  await run('location.reload()');
  await until(() => run('!!document.querySelector(".nav-collapsed #grid")').catch(() => false));
  assert.equal(await columns(),52,'layout preference survives reload');
  await pause(200);
  const gridBefore = await run('({width:document.querySelector("#grid").offsetWidth,height:document.querySelector("#grid").offsetHeight})');
  await run(`(async () => {
    const next=await window.desktop.read();
    for(let i=0;i<20;i++) next.categories.push({id:'extra-'+i,name:'Additional activity '+(i+1)+(i===19?' with a longer descriptive name':''),color:'#'+(10000+i*1000).toString(16).padStart(6,'0'),unit:'week'});
    await window.desktop.save(next);
  })()`);
  await run('location.reload()');
  await until(() => run('document.querySelectorAll(".legend-item").length===24').catch(()=>false));
  await pause(200);
  assert.deepEqual(await run('({width:document.querySelector("#grid").offsetWidth,height:document.querySelector("#grid").offsetHeight})'),gridBefore,'additional activities do not shrink the grid');
  assert.ok(await run(`(() => {
    const legend=document.querySelector('.legend'), grid=document.querySelector('#grid').getBoundingClientRect();
    return legend.getBoundingClientRect().left>grid.right && legend.scrollHeight>legend.clientHeight && getComputedStyle(legend).overflowY==='auto';
  })()`),'right-side legend scrolls independently');
  await run('document.querySelector(".legend-item:last-child").focus()');
  assert.ok(await run('document.querySelector(".legend").scrollTop>0'),'keyboard focus reaches activities below the fold');
  await capture('many-activities');
  await run('document.querySelector(".legend-item:last-child").click()');
  await until(() => run('document.querySelector(".legend-item:last-child").getAttribute("aria-pressed")==="false"'));
  assert.ok(await run('document.querySelector(".legend").scrollTop>0 && document.activeElement===document.querySelector(".legend-item:last-child")'),'toggling a category preserves legend position and focus');
  assert.ok(await fits(),'grid remains visible with a long legend');
  console.log(`Layout check passed at ${factor}: fixed 52 columns, resizing, collapsed navigation, original layout and persistence.`);
  app.exit(0);
})().catch(error=>{console.error(error);app.exit(1);});
