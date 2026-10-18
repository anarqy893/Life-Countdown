// Runs the actual desktop app in isolated temporary storage; leaves personal settings alone.
const { app, BrowserWindow, powerMonitor, screen } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
app.on('before-quit', () => { console.error('Desktop check quit before completion'); app.exit(1); });

(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'life-countdown-check-'));
  app.setPath('userData', temporary);
  app.setPath('sessionData', temporary);
  // Verify sign-in controls without altering the user's real Windows startup entries.
  let fakeLogin = { openAtLogin: false, enabled: false };
  app.setLoginItemSettings = options => { fakeLogin = options; };
  app.getLoginItemSettings = () => ({ openAtLogin: false, launchItems: fakeLogin.openAtLogin ? [{ name: fakeLogin.name, enabled: fakeLogin.enabled, args: fakeLogin.args, scope: 'user' }] : [] });
  require('../main.cjs');
  await app.whenReady();
  for (let i = 0; i < 100 && BrowserWindow.getAllWindows().length < 1; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const main = BrowserWindow.getAllWindows().find(window => window.getSize()[1] > 200);
  assert.equal(BrowserWindow.getAllWindows().length, 1, 'first use starts with the main window only');
  main.hide();
  const errors = [];
  main.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  main.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason));
  const run = code => main.webContents.executeJavaScript(code);
  async function until(code, label) {
    for (let i = 0; i < 100; i++) {
      if (await run(code)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${label}. ${await run('document.querySelector("dialog .error")?.textContent || document.body.textContent.slice(-600)')}`);
  }
  await until('!!document.querySelector("#setup")', 'initial setup');
  await run('document.querySelector("#setup").click()');
  await until('!!document.querySelector("#guide-personalize")', 'life example');
  await run('document.querySelector("#guide-personalize").click()');
  await until('!!document.querySelector("#profile-form")', 'focused dates step');
  assert.equal(await run('!!document.querySelector("#category-form, [data-opacity]")'), false, 'first step only asks for dates');
  await run(`(() => { const f = document.querySelector('#profile-form'); f.elements.birthday.value = '1990-04-12'; f.elements.lifespan.value = '90'; f.requestSubmit(); })()`);
  await until('!!document.querySelector("#grid .week")', 'life grid');
  assert.ok(await run('document.querySelectorAll("#grid .week").length > 4600'));
  assert.ok(await run('getComputedStyle(document.querySelector("#grid .week")).backgroundImage !== "none"'));
  assert.equal(BrowserWindow.getAllWindows().length, 1, 'calendar does not open widget early');
  await run('document.querySelector("#guide-allocate").click()');
  await until('!!document.querySelector("#guide-hours")', 'live allocation step');
  await run('document.querySelector("#guide-hours").elements.sleep.value="8"; document.querySelector("#guide-hours").elements.work.value="40"; document.querySelector("#guide-hours").requestSubmit()');
  await until('!!document.querySelector("#moment-skip")', 'optional experiences follow time allocations');
  await run('document.querySelector("#moment-skip").click()');
  await until('!!document.querySelector("#guide-finish")', 'widget introduction');
  await run('document.querySelector("#guide-finish").click()');
  await until('!!document.querySelector("[data-clock]")', 'finished setup');
  await run('document.querySelector("[data-grid-view=allocations]").click()');
  await until('!!document.querySelector(".allocation-axis-x span")', 'allocation view');
  assert.equal(BrowserWindow.getAllWindows().length, 1, 'finishing without widget is supported');
  assert.equal(await run('document.querySelector("[data-clock]").dataset.format'), 'seconds', 'new users start with seconds');
  await run('document.querySelector("[data-clock]").click()');
  await until('document.querySelector("[data-clock]").dataset.format === "calendar"', 'seconds cycles to calendar');
  await run('document.querySelector("[data-clock]").click()');
  await until('document.querySelector("[data-clock]").dataset.format === "days"', 'click changes format');
  await run('document.querySelector("#appearance").click()');
  await until('!document.querySelector("#launch-at-login").disabled', 'read Windows startup setting');
  assert.equal(await run('document.querySelector("#launch-at-login").checked'), false);
  await run('document.querySelector("#launch-at-login").click()');
  await until('document.querySelector("#startup-status").textContent.startsWith("On")', 'enable startup');
  assert.equal(fakeLogin.path, process.execPath);
  assert.equal(fakeLogin.args[0], path.resolve(__dirname, '..'));
  assert.equal(fakeLogin.enabled, true);
  await run('document.querySelector("#launch-at-login").click()');
  await until('document.querySelector("#startup-status").textContent.startsWith("Off")', 'disable startup');
  assert.equal(fakeLogin.openAtLogin, false);
  await run('document.querySelector("#settings").click()');
  await run('document.querySelector("#add-category").click()');
  await run(`(() => { const f = document.querySelector('dialog form'); f.elements.name.value = 'Commuting'; f.requestSubmit(); })()`);
  await until('!document.querySelector("dialog")', 'save category');
  assert.ok(await run('document.body.textContent.includes("Commuting")'));
  await run('document.querySelector("[data-edit-schedule]").click()');
  await run(`(() => { const f = document.querySelector('dialog form'); f.elements.sleep.value = '8'; f.elements.work.value = '40'; Array.from(f.querySelectorAll('input[type=number]')).at(-1).value = '10'; f.requestSubmit(); })()`);
  await until('!document.querySelector("dialog")', 'save baseline');
  assert.equal(await run('document.querySelector("[data-hours=sleep]").value'), '8');
  await run(`(() => { const f = document.querySelector('#category-form'); f.querySelector('[data-hours=sleep]').value = '24'; f.requestSubmit(); })()`);
  await until('document.querySelector("#category-form .error").textContent.includes("168")', 'inline hours reject overbooking');
  await run(`(() => { const f = document.querySelector('#category-form'); f.querySelector('[data-hours=sleep]').value = '7.5'; f.requestSubmit(); })()`);
  await until('document.querySelector("[data-hours=sleep]").value === "7.5" && !document.querySelector("#category-form .error").textContent', 'save inline hours');
  const hoursSaved = JSON.parse(await fs.readFile(path.join(temporary, 'life-countdown.json'), 'utf8'));
  assert.equal(hoursSaved.schedules[0].hours.sleep, 7.5);
  assert.equal(hoursSaved.categories[0].name, 'Sleep');
  await run(`(() => { const f = document.querySelector('#category-form'); f.querySelector('[data-hours=sleep]').value = '8'; f.requestSubmit(); })()`);
  await until('document.querySelector("[data-hours=sleep]").value === "8" && document.body.textContent.includes("Sleep 8 h/night")', 'restore baseline hours');
  await run('document.querySelector("#add-schedule").click()');
  await run(`(() => { const f = document.querySelector('dialog form'); f.elements.start.value = '2030-01-01'; f.elements.sleep.value = '24'; f.elements.work.value = '40'; f.requestSubmit(); })()`);
  await until('!!document.querySelector("dialog .error").textContent', 'reject excessive hours');
  assert.ok(await run('document.querySelector("dialog .error").textContent.includes("168")'));
  await run(`(() => { const f = document.querySelector('dialog form'); f.elements.sleep.value = '8'; f.elements.work.value = '20'; f.requestSubmit(); })()`);
  await until('!document.querySelector("dialog")', 'save changed schedule');
  await run('document.querySelector("#add-period").click()');
  await run(`(() => { const f = document.querySelector('dialog form'); f.elements.name.value = 'My forties'; f.elements.start.value = '2030-04-12'; f.elements.end.value = '2040-04-12'; f.requestSubmit(); })()`);
  await until('!!document.querySelector("h1") && document.querySelector("h1").textContent === "My forties"', 'custom period');
  const persisted = JSON.parse(await fs.readFile(path.join(temporary, 'life-countdown.json'), 'utf8'));
  assert.equal(persisted.categories.length, 3);
  assert.equal(persisted.schedules.length, 2);
  assert.equal(persisted.periods.at(-1).name, 'My forties');
  await run('document.querySelector("#open-widget").click()');
  let widget;
  for (let i = 0; i < 100; i++) {
    widget = BrowserWindow.getAllWindows().find(window => window !== main);
    if (widget && await widget.webContents.executeJavaScript('!!document.querySelector(".widget [data-clock]")').catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(widget, 'widget opens');
  widget.hide();
  assert.equal(widget.isAlwaysOnTop(), true);
  const originalWidgetBounds = widget.getBounds();
  function checkWidgetEdges() {
    const original = widget.getBounds();
    const area = screen.getDisplayMatching(original).workArea;
    const getCursor = screen.getCursorScreenPoint;
    screen.getCursorScreenPoint = () => ({ x:area.x + area.width - 1, y:area.y + area.height - 1 });
    try {
      for (const position of [
        {x:area.x-100,y:area.y}, {x:area.x+area.width-10,y:area.y},
        {x:area.x,y:area.y-100}, {x:area.x,y:area.y+area.height-10}
      ]) {
        let prevented = false;
        widget.emit('will-move', {preventDefault:() => { prevented=true; }}, {...original,...position});
        const result = widget.getBounds();
        assert.equal(prevented, true, 'native drag is constrained at the desktop edge');
        assert.ok(result.x >= area.x && result.y >= area.y);
        assert.ok(result.x+result.width <= area.x+area.width && result.y+result.height <= area.y+area.height, 'all widget edges stay inside the work area above the taskbar');
      }
    } finally { screen.getCursorScreenPoint=getCursor; widget.setBounds(original); }
  }
  checkWidgetEdges();
  for (const selector of ['.widget-title-row', '[data-clock]', '#show-grid']) {
    const format = await widget.webContents.executeJavaScript('document.querySelector("[data-clock]").dataset.format');
    await widget.webContents.executeJavaScript(`(() => {
      const target = document.querySelector('${selector}');
      for (const [type,x,y] of [['pointerdown',500,500],['pointermove',440,460],['pointerup',440,460]]) {
        target.dispatchEvent(new PointerEvent(type,{bubbles:true,isPrimary:true,button:0,pointerId:1,screenX:x,screenY:y}));
      }
      if ('${selector}' === '[data-clock]') target.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
    })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(widget.getBounds().x, originalWidgetBounds.x - (selector === '#show-grid' ? 0 : 60), 'dragging background or numbers moves the normal widget; controls do not');
    assert.equal(await widget.webContents.executeJavaScript('document.querySelector("[data-clock]").dataset.format'), format, 'dragging does not change counter format');
    widget.setBounds(originalWidgetBounds);
  }
  assert.equal(await widget.webContents.executeJavaScript('document.querySelector("h2").textContent'), 'My life');
  assert.equal(await widget.webContents.executeJavaScript('!!document.querySelector("[data-opacity]")'), false, 'opacity slider is tucked away');
  widget.showInactive();
  async function openAppearance() {
    await widget.webContents.executeJavaScript('document.querySelector("#widget-settings-toggle").click()');
    for (let i = 0; i < 100; i++) {
      if (await widget.webContents.executeJavaScript('!!document.querySelector(".widget-appearance-view [data-effect-choice]")')) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(BrowserWindow.getAllWindows().filter(window => window.getTitle() !== 'Life Countdown desktop effect').length, 2, 'settings stay in the same widget with no extra settings window');
    assert.equal(await widget.webContents.executeJavaScript('!!document.querySelector(".widget-appearance-view [data-effect-choice]")'), true);
    assert.deepEqual(widget.getBounds(), originalWidgetBounds, 'opening settings leaves the native widget size and position unchanged at the screen edge');
    return widget;
  }
  let appearance = await openAppearance();
  assert.equal(await appearance.webContents.executeJavaScript('!!document.querySelector("[data-opacity]")'), true);
  assert.equal(await appearance.webContents.executeJavaScript('document.querySelector("[data-effect-choice][aria-pressed=true]").dataset.effectChoice'), 'off');
  await appearance.webContents.executeJavaScript(`(() => { const slider=document.querySelector('[data-opacity]'); slider.value='75'; slider.dispatchEvent(new Event('input')); slider.dispatchEvent(new Event('change')); })()`);
  for (let i = 0; i < 100; i++) {
    if (await widget.webContents.executeJavaScript('getComputedStyle(document.querySelector(".widget")).getPropertyValue("--widget-opacity").trim() === "0.75"')) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(await widget.webContents.executeJavaScript('getComputedStyle(document.querySelector(".widget")).getPropertyValue("--widget-opacity").trim()'), '0.75', 'appearance opacity controls remain interactive');
  await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
  await fs.writeFile(path.join(__dirname, '../artifacts/preview-appearance.png'), (await appearance.webContents.capturePage()).toPNG());
  assert.ok(await appearance.webContents.executeJavaScript('document.querySelector(".widget-appearance-view").scrollHeight <= innerHeight'), 'settings fit without resizing or scrolling');
  await appearance.webContents.executeJavaScript('document.querySelector("#back-to-countdown").click()');
  assert.equal(await widget.webContents.executeJavaScript('!!document.querySelector("[data-clock]")'), true, 'Back restores the countdown');
  for (const effect of ['pulse', 'sweep']) {
    const mainBoundsBeforeWave = main.getBounds();
    if (!await widget.webContents.executeJavaScript('!!document.querySelector(".widget-appearance-view")')) appearance = await openAppearance();
    await new Promise(resolve => setTimeout(resolve, 1100));
    const target = await appearance.webContents.executeJavaScript(`(() => {
      const button=document.querySelector('[data-effect-choice="${effect}"]'), rect=button.getBoundingClientRect();
      const x=Math.round(rect.x+rect.width/2), y=Math.round(rect.y+rect.height/2);
      return {x,y,selectable:document.elementFromPoint(x,y)===button};
    })()`);
    assert.equal(target.selectable,true,'effect choice receives clicks without the slider covering it');
    appearance.webContents.sendInputEvent({type:'mouseMove',x:target.x,y:target.y});
    appearance.webContents.sendInputEvent({type:'mouseDown',x:target.x,y:target.y,button:'left',clickCount:1});
    appearance.webContents.sendInputEvent({type:'mouseUp',x:target.x,y:target.y,button:'left',clickCount:1});
    for (let i = 0; i < 100; i++) {
      if (await widget.webContents.executeJavaScript(`!!document.querySelector('.hourly-${effect}')`)) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(await widget.webContents.executeJavaScript(`!!document.querySelector('.hourly-${effect}')`), true, 'selecting an effect immediately previews it');
    assert.equal(await widget.webContents.executeJavaScript(`document.querySelector('[data-clock]').getAnimations().some(animation => animation.effect.getKeyframes().some(frame => frame.color && frame.textShadow))`), true, 'counter numbers shine during both hourly effects');
    assert.equal(await widget.webContents.executeJavaScript('!!document.querySelector(".widget-appearance-view")'), false, 'settings switch back to the countdown before preview');
    assert.deepEqual(widget.getBounds(), originalWidgetBounds, 'preview runs at normal size and position');
    const desktopWave = BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Life Countdown desktop effect');
    assert.ok(desktopWave, 'first repetition spreads across the desktop');
    assert.equal(desktopWave.isFocusable(), false, 'desktop wave never takes keyboard focus');
    assert.equal(desktopWave.isAlwaysOnTop(), true);
    assert.deepEqual(desktopWave.getBounds(), screen.getDisplayMatching(widget.getBounds()).workArea, 'desktop wave stays inside the work area and leaves the taskbar clear');
    assert.equal(desktopWave.isFullScreenable(), false, 'desktop wave cannot enter fullscreen');
    assert.equal(desktopWave.isFocused(), false, 'showing the wave does not activate it');
    const wave = await desktopWave.webContents.executeJavaScript('({effect:document.querySelector("canvas").dataset.effect,origin:JSON.parse(document.querySelector("canvas").dataset.origin)})');
    assert.equal(wave.effect, effect);
    const counter = await widget.webContents.executeJavaScript('(() => {const r=document.querySelector("[data-clock]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
    const content = widget.getContentBounds(), monitor = desktopWave.getBounds();
    assert.ok(Math.abs(wave.origin.x - (content.x + counter.x - monitor.x)) < 1);
    assert.ok(Math.abs(wave.origin.y - (content.y + counter.y - monitor.y)) < 1, 'wave originates at the countdown numbers');
    await new Promise(resolve => setTimeout(resolve, 2150));
    assert.equal(desktopWave.isDestroyed(), true, 'desktop wave ends after the first repetition');
    assert.deepEqual(main.getBounds(), mainBoundsBeforeWave, 'showing and removing the wave leaves the underlying app in place');
    assert.equal(await widget.webContents.executeJavaScript('document.querySelector("[data-clock]").getAnimations().some(a => a.playState === "running")'), true, 'remaining repetitions continue on the widget');
  }
  appearance = await openAppearance();
  assert.ok(await appearance.webContents.executeJavaScript('document.querySelector(".widget-appearance-view").scrollHeight <= innerHeight'), 'all appearance controls fit');
  assert.equal(JSON.parse(await fs.readFile(path.join(temporary, 'life-countdown.json'), 'utf8')).hourlyEffect, 'sweep');
  widget.showInactive();
  assert.equal(await appearance.webContents.executeJavaScript('!!document.querySelector("[data-preview-effect]")'), false, 'no separate Preview button is needed');
  await appearance.webContents.executeJavaScript('document.querySelector("[data-effect-choice=sweep]").click()');
  for (let i = 0; i < 100; i++) {
    if (await widget.webContents.executeJavaScript('!!document.querySelector(".hourly-sweep") && !document.querySelector(".widget-settings")')) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(await widget.webContents.executeJavaScript('!!document.querySelector(".hourly-sweep") && !document.querySelector(".widget-settings")'), true, 'selecting an effect returns to the counter and previews automatically');
  await new Promise(resolve => setTimeout(resolve, 800));
  await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
  await fs.writeFile(path.join(__dirname, '../artifacts/preview-hourly-effect.png'), (await widget.webContents.capturePage()).toPNG());
  await widget.webContents.executeJavaScript('document.querySelector("#counter-only").click()');
  for (let i = 0; i < 100; i++) {
    if (await widget.webContents.executeJavaScript('!!document.querySelector(".widget-minimal #restore-widget")')) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(widget.getSize()[1], 64, 'counter-only shrinks the native window');
  for (let i = 0; i < 100 && widget.getSize()[0] === 420; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const daysStripWidth = widget.getSize()[0];
  assert.ok(daysStripWidth < 420, 'counter strip fits its content');
  await run('window.desktop.previewEffect("pulse")');
  for (let i = 0; i < 100; i++) {
    if (await widget.webContents.executeJavaScript('!!document.querySelector(".widget-minimal .hourly-pulse")')) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(await widget.webContents.executeJavaScript('!!document.querySelector(".widget-minimal .hourly-pulse")'), true, 'effects work in counter-only mode');
  assert.equal(await widget.webContents.executeJavaScript(`document.querySelector('[data-clock]').getAnimations().some(animation => animation.effect.getKeyframes().some(frame => frame.color && frame.textShadow))`), true, 'number shine also runs in counter-only mode');
  await run('window.desktop.previewEffect("off")');
  widget.showInactive();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(BrowserWindow.getAllWindows().some(window => window.getTitle() === 'Life Countdown desktop effect'), false, 'Off also cancels an active desktop wave');
  await widget.webContents.executeJavaScript(`(() => {
    const b = document.querySelector('[data-clock]');
    b.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,isPrimary:true,button:0,pointerId:1,screenX:500,screenY:500}));
    b.dispatchEvent(new PointerEvent('pointermove', {bubbles:true,isPrimary:true,pointerId:1,screenX:440,screenY:460}));
    b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true,isPrimary:true,pointerId:1,screenX:440,screenY:460}));
    b.dispatchEvent(new MouseEvent('click', {bubbles:true,detail:1}));
  })()`);
  for (let i = 0; i < 100 && widget.getBounds().x === originalWidgetBounds.x; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(widget.getBounds().x, originalWidgetBounds.x - 60, 'dragging the numbers moves the native window');
  assert.equal(widget.getBounds().y, originalWidgetBounds.y - 40);
  assert.equal(await widget.webContents.executeJavaScript('document.querySelector("[data-clock]").dataset.format'), 'days', 'dragging does not cycle formats');
  widget.setPosition(originalWidgetBounds.x, originalWidgetBounds.y);
  for (const format of ['weeks', 'hours', 'seconds', 'calendar', 'days']) {
    await widget.webContents.executeJavaScript('document.querySelector("[data-clock]").click()');
    await until(`document.querySelector('[data-clock]').dataset.format === '${format}'`, 'counter-only click changes format');
    await new Promise(resolve => setTimeout(resolve, 50));
    const measurements = await widget.webContents.executeJavaScript(`(() => {
      const counter = document.querySelector('[data-clock]').getBoundingClientRect();
      const restore = document.querySelector('#restore-widget').getBoundingClientRect();
      return { right:restore.right, gap:restore.left-counter.right, width:innerWidth };
    })()`);
    assert.ok(measurements.gap <= 11, 'restore stays next to the counter');
    assert.ok(Math.abs(measurements.width - measurements.right - 12) < 2, `window hugs ${format}: ${JSON.stringify(measurements)}`);
    if (format === 'hours') assert.ok(widget.getSize()[0] < daysStripWidth, 'shorter formats use a smaller window');
  }
  assert.equal(await widget.webContents.executeJavaScript('document.querySelectorAll(".widget button").length'), 2, 'only counter and restore button are rendered');
  assert.equal(await widget.webContents.executeJavaScript('!!document.querySelector(".widget-detail, .widget-bar, h2, #show-grid")'), false);
  widget.showInactive();
  await new Promise(resolve => setTimeout(resolve, 150));
  await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
  await fs.writeFile(path.join(__dirname, '../artifacts/preview-counter-only.png'), (await widget.webContents.capturePage()).toPNG());
  await widget.webContents.executeJavaScript('location.reload()');
  for (let i = 0; i < 100; i++) {
    if (await widget.webContents.executeJavaScript('!!document.querySelector(".widget-minimal #restore-widget")').catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(await widget.webContents.executeJavaScript('!!document.querySelector(".widget-minimal")'), true, 'counter-only preference survives a reload');
  await widget.webContents.executeJavaScript('document.querySelector("#restore-widget").click()');
  for (let i = 0; i < 100; i++) {
    if (await widget.webContents.executeJavaScript('!!document.querySelector("#counter-only")')) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.deepEqual(widget.getBounds(), originalWidgetBounds, 'restore brings back normal size');
  for (const format of ['weeks', 'hours', 'seconds', 'calendar', 'days']) {
    await widget.webContents.executeJavaScript('document.querySelector("[data-clock]").click()');
    await until(`document.querySelector('[data-clock]').dataset.format === '${format}'`, 'widget format syncs to main');
    assert.equal(await widget.webContents.executeJavaScript('document.querySelector("[data-clock]").dataset.format'), format);
  }
  await widget.webContents.executeJavaScript('document.querySelector("#show-grid").click()');
  const popup = widget;
  for (let i = 0; i < 100; i++) {
    if (widget.getOpacity() === 1 && await widget.webContents.executeJavaScript('!!document.querySelector(".widget-expanded #grid .week")')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(BrowserWindow.getAllWindows().length, 2, 'expanding uses the same widget window');
  const gridRun = code => popup.webContents.executeJavaScript(code);
  assert.ok(popup.getSize()[0] >= 640);
  checkWidgetEdges();
  assert.equal(await gridRun('getComputedStyle(document.querySelector(".widget-grid .time-chart")).backgroundColor'), 'rgba(0, 0, 0, 0)', 'grid uses the shared widget background');
  for (const opacity of [0, 75]) {
    await gridRun(`window.desktop.previewOpacity(${opacity})`);
    for (let i = 0; i < 100; i++) {
      if (await gridRun(`getComputedStyle(document.querySelector('.widget')).getPropertyValue('--widget-opacity').trim() === '${opacity / 100}'`)) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(await gridRun('getComputedStyle(document.querySelector(".widget"), "::before").backgroundColor'), opacity === 0 ? 'rgba(24, 34, 36, 0)' : 'rgba(24, 34, 36, 0.75)', 'expanded background follows live opacity changes, including zero');
    assert.equal(await gridRun('getComputedStyle(document.querySelector("#grid .week")).opacity'), '1', 'grid squares remain visible');
  }
  const fullSquareCount = await gridRun('document.querySelectorAll("#grid .week").length');
  await gridRun('document.querySelector("[data-group=sleep]").click()');
  await until('document.querySelector("[data-group=sleep]").getAttribute("aria-pressed") === "false"', 'legend visibility syncs');
  assert.ok(await gridRun('document.querySelectorAll("#grid .week").length') < fullSquareCount);
  assert.equal(await gridRun('Array.from(document.querySelectorAll("#grid .week")).some(square => square.title.includes("Sleep:"))'), false);
  await run('document.querySelector("[data-group=sleep]").click()');
  for (let i = 0; i < 100; i++) {
    if (await gridRun('document.querySelector("[data-group=sleep]").getAttribute("aria-pressed") === "true"')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await gridRun('document.querySelectorAll("#grid .week").length'), fullSquareCount);
  await gridRun(`(async () => {
    for (const button of Array.from(document.querySelectorAll('[data-group]'))) {
      const id = button.dataset.group;
      document.querySelector('[data-group="' + id + '"]').click();
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  })()`);
  assert.equal(await gridRun('!!document.querySelector("#grid.grid-empty")'), true, 'all groups can be hidden without breaking layout');
  await gridRun(`(async () => {
    for (const button of Array.from(document.querySelectorAll('[data-group]'))) {
      const id = button.dataset.group;
      document.querySelector('[data-group="' + id + '"]').click();
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  })()`);
  assert.equal(await gridRun('document.querySelectorAll("#grid .week").length'), fullSquareCount);
  await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
  widget.showInactive();
  await new Promise(resolve => setTimeout(resolve, 150));
  await fs.writeFile(path.join(__dirname, '../artifacts/preview-expanded-widget.png'), (await widget.webContents.capturePage()).toPNG());
  await gridRun('document.querySelector("#show-grid").click()');
  for (let i = 0; i < 100; i++) {
    if (widget.getOpacity() === 1 && await gridRun('!document.querySelector(".widget-expanded")')) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.deepEqual(widget.getBounds(), originalWidgetBounds, 'collapse restores compact size and position');
  await gridRun('document.querySelector("#show-grid").click()');
  for (let i = 0; i < 100; i++) {
    if (widget.getOpacity() === 1 && await gridRun('!!document.querySelector(".widget-expanded")')) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await gridRun('window.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape"}))');
  for (let i = 0; i < 100; i++) {
    if (widget.getOpacity() === 1 && await gridRun('!document.querySelector(".widget-expanded")')) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.deepEqual(widget.getBounds(), originalWidgetBounds, 'Escape collapses without closing the widget');
  await run('document.querySelector("#appearance").click()');
  await run(`(() => { const slider = document.querySelector('[data-opacity]'); slider.value = '0'; slider.dispatchEvent(new Event('input')); slider.dispatchEvent(new Event('change')); })()`);
  for (let i = 0; i < 100; i++) {
    if (await widget.webContents.executeJavaScript('document.querySelector(".widget").classList.contains("clock-only")')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await widget.webContents.executeJavaScript('getComputedStyle(document.body).backgroundColor'), 'rgba(0, 0, 0, 0)');
  assert.equal(await widget.webContents.executeJavaScript('getComputedStyle(document.querySelector(".widget")).getPropertyValue("--widget-opacity").trim()'), '0');
  assert.equal(await widget.webContents.executeJavaScript('getComputedStyle(document.querySelector("[data-clock]")).opacity'), '1');
  assert.equal(widget.getOpacity(), 1, 'numbers do not inherit window transparency');
  await run(`(() => { const slider = document.querySelector('[data-opacity]'); slider.value = '60'; slider.dispatchEvent(new Event('input')); slider.dispatchEvent(new Event('change')); })()`);
  await until('document.querySelector("[data-opacity]").value === "60"', 'save opacity');
  await run('document.querySelector("[data-period=five]").click()');
  for (let i = 0; i < 100; i++) {
    if ((await widget.webContents.executeJavaScript('window.desktop.read()')).selected === 'five') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await widget.webContents.executeJavaScript('document.querySelector("h2").textContent'), 'My life', 'main period navigation leaves the widget unchanged');
  const daysBefore = await run('Number(document.querySelector("[data-clock] b").textContent.replace(/\\D/g, ""))');
  const widgetDaysBefore = await widget.webContents.executeJavaScript('Number(document.querySelector("[data-clock] b").textContent.replace(/\\D/g, ""))');
  const elapsedBefore = await run('document.querySelector(".stat strong").textContent');
  const advanceClock = `(() => { const OriginalDate = Date; window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [OriginalDate.now() + 7 * 86400000])); } static now() { return OriginalDate.now() + 7 * 86400000; } }; })()`;
  await run(advanceClock);
  await widget.webContents.executeJavaScript(advanceClock);
  powerMonitor.emit('resume');
  await until(`Number(document.querySelector('[data-clock] b').textContent.replace(/\\D/g, '')) === ${daysBefore - 7}`, 'wake catches up countdown');
  assert.notEqual(await run('document.querySelector(".stat strong").textContent'), elapsedBefore);
  assert.equal(await widget.webContents.executeJavaScript('Number(document.querySelector("[data-clock] b").textContent.replace(/\\D/g, ""))'), widgetDaysBefore - 7);
  await run('document.querySelector("#settings").click(); document.querySelector("[name=lifespan]").value = "99"');
  powerMonitor.emit('unlock-screen');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await run('document.querySelector("[name=lifespan]").value'), '99');
  await run('location.reload()');
  await until('!!document.querySelector("h1") && document.querySelector("h1").textContent === "Next five years"', 'reload restores saved selection');
  assert.equal(await run('document.querySelector("[data-clock]").dataset.format'), 'days');
  const appearanceSaved = JSON.parse(await fs.readFile(path.join(temporary, 'life-countdown.json'), 'utf8'));
  assert.equal(appearanceSaved.countdownFormat, 'days');
  assert.equal(appearanceSaved.widgetOpacity, 60);
  await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
  main.showInactive();
  await new Promise(resolve => setTimeout(resolve, 500));
  const screenshot = await main.webContents.capturePage();
  await fs.writeFile(path.join(__dirname, '../artifacts/preview.png'), screenshot.toPNG());
  await run('document.querySelector("[data-period=life]").click()');
  await until('document.querySelector("h1").textContent === "My life"', 'life chart preview');
  for (const [width, height] of [[900, 680], [1600, 1000], [1380, 920]]) {
    main.setSize(width, height);
    await new Promise(resolve => setTimeout(resolve, 200));
    const fits = await run(`(() => {
      const wrap = document.querySelector('.grid-wrap');
      const grid = document.querySelector('#grid');
      const content = document.querySelector('.content');
      return grid.getBoundingClientRect().width <= wrap.clientWidth
        && grid.getBoundingClientRect().height <= wrap.clientHeight
        && wrap.scrollHeight <= wrap.clientHeight + 1
        && content.scrollHeight <= content.clientHeight + 1
        && document.documentElement.scrollHeight <= innerHeight + 1;
    })()`);
    if (!fits) console.log(await run(`(() => {
      const metrics = selector => { const e = document.querySelector(selector); return { width:e.clientWidth, height:e.clientHeight, scrollHeight:e.scrollHeight, rectHeight:e.getBoundingClientRect().height }; };
      return { wrap:metrics('.grid-wrap'), grid:metrics('#grid'), content:metrics('.content'), html:metrics('html'), innerHeight };
    })()`));
    assert.ok(fits, `all weeks and overview fit without scrolling at ${width}×${height}`);
    assert.ok(await run(`(() => {
      const grid = document.querySelector('#grid');
      const rect = grid.getBoundingClientRect(), scale = devicePixelRatio;
      const closeToPixel = value => Math.abs(value * scale - Math.round(value * scale)) < .03;
      const cells = Array.from(grid.children).slice(0, 200).map(e => e.getBoundingClientRect());
      return closeToPixel(rect.left) && closeToPixel(rect.top)
        && closeToPixel(parseFloat(grid.style.gap))
        && cells.every(cell => Math.abs(cell.width - cells[0].width) < .03 && Math.abs(cell.height - cells[0].height) < .03);
    })()`), 'grid origin and gaps land on screen pixels with equally sized squares');
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  await fs.writeFile(path.join(__dirname, '../artifacts/preview-life.png'), (await main.webContents.capturePage()).toPNG());
  widget.showInactive();
  await new Promise(resolve => setTimeout(resolve, 250));
  await fs.writeFile(path.join(__dirname, '../artifacts/preview-widget.png'), (await widget.webContents.capturePage()).toPNG());
  assert.deepEqual(errors, []);
  console.log('Desktop check passed: setup, rendering, category, schedules, validation, custom period, persistence, reload, synced widget, wake catch-up, and preserving edits on unlock.');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
