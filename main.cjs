const electron = require('electron');
const { app, BrowserWindow, ipcMain, screen, powerMonitor } = electron;
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
let widgetSessionReady = false;
let onboardingInProgress = false;
let onboardingWidgetReady = false;
app.on('second-instance', () => { if (widgetSessionReady) { if (onboardingInProgress) showMain(); else createWidget(); } });

let mainWindow, widgetWindow, tray;
let widgetLaunched = false;
let quitting = false, trayIntroductionShown = false;
function ensureTray() {
  if (tray || quitting || onboardingInProgress || !widgetLaunched) return;
  tray = require('./tray.cjs')(electron, {
    showWidget: createWidget,
    hideWidget: () => { stopDesktopEffect(); widgetWindow?.hide(); introduceTray(); },
    showMain,
    quit: () => app.quit()
  });
  tray.on('balloon-click', showMain);
}
function introduceTray() {
  if (process.platform !== 'win32' || quitting || onboardingInProgress || !tray || tray.isDestroyed() || mainWindow || trayIntroductionShown) return;
  const noticePath = path.join(app.getPath('userData'), 'tray-introduction.json');
  if (fsSync.existsSync(noticePath)) { trayIntroductionShown = true; return; }
  try {
    tray.displayBalloon({
      title: 'Life Countdown is still running',
      content: 'Find the green clock beside your Windows clock (it may be under ^). Click for the widget, or right-click to open the full app or quit.',
      iconType: 'info', noSound: true, respectQuietTime: true
    });
    trayIntroductionShown = true;
    fsSync.writeFileSync(noticePath, JSON.stringify({ shown: true }));
  } catch (error) { console.error('Could not show the tray introduction:', error.message); }
}
let desktopEffectWindow;
function stopDesktopEffect() {
  if (desktopEffectWindow && !desktopEffectWindow.isDestroyed()) desktopEffectWindow.destroy();
  desktopEffectWindow = null;
}
let widgetExpanded = false, compactWidgetBounds;
let widgetPresentation, widgetPresentationId = 0;
function finishWidgetPresentation(id) {
  if (!widgetPresentation || widgetPresentation.id !== id) return;
  const { window, timeout } = widgetPresentation;
  clearTimeout(timeout);
  widgetPresentation = null;
  if (!window.isDestroyed()) window.setOpacity(1);
}
let widgetCounterOnly = false;
const WIDGET_HEIGHT = 144;
let widgetPositions = {}, positionTimer;
const positionsPath = () => path.join(app.getPath('userData'), 'widget-positions.json');
function rememberWidgetPosition() {
  clearTimeout(positionTimer);
  if (!widgetWindow || widgetWindow.isDestroyed() || widgetExpanded) return;
  const { x, y, width } = widgetWindow.getBounds();
  widgetPositions[widgetCounterOnly ? 'counter' : 'normal'] = { x, y, width };
  try {
    fsSync.writeFileSync(positionsPath() + '.tmp', JSON.stringify(widgetPositions));
    fsSync.renameSync(positionsPath() + '.tmp', positionsPath());
  } catch (error) { console.error('Could not save widget position:', error.message); }
}
function restoredWidgetBounds(counterOnly, fallback) {
  const saved = widgetPositions[counterOnly ? 'counter' : 'normal'];
  const anchor = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
    ? { ...fallback, x: Math.round(saved.x), y: Math.round(saved.y) } : fallback;
  const area = screen.getDisplayMatching(anchor).workArea;
  const width = counterOnly && Number.isFinite(saved?.width) ? Math.max(120, Math.round(saved.width)) : 420;
  return constrainWidgetBounds({ ...anchor, width, height: counterOnly ? 64 : WIDGET_HEIGHT }, area);
}
let counterDrag;
let widgetReady = false, pendingEffect;
let writeQueue = Promise.resolve();
let resettingSettings = false;
const settingsPath = () => path.join(app.getPath('userData'), 'life-countdown.json');
const startup = require('./startup.cjs')(app);

function raiseWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed() || !widgetWindow.isVisible() || widgetWindow.isMinimized()) return;
  // isAlwaysOnTop alone cannot detect another topmost window covering us.
  // moveTop changes native stacking without activating the widget.
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.moveTop();
}

function createMain() {
  let area = screen.getPrimaryDisplay().workArea;
  let width = Math.min(1380, area.width - 40), height = Math.min(920, area.height - 40);
  let bounds = { width, height,
    x: area.x + Math.floor((area.width - width) / 2), y: area.y + Math.floor((area.height - height) / 2) };
  let maximized = onboardingInProgress;
  const placementPath = path.join(app.getPath('userData'), 'main-window.json');
  try {
    const saved = JSON.parse(fsSync.readFileSync(placementPath, 'utf8'));
    if (['x', 'y', 'width', 'height'].every(key => Number.isInteger(saved.bounds?.[key])) && saved.bounds.width > 0 && saved.bounds.height > 0 && typeof saved.maximized === 'boolean') {
      area = screen.getDisplayMatching(saved.bounds).workArea;
      bounds = constrainWidgetBounds({ ...saved.bounds,
        width: Math.max(Math.min(900, area.width), saved.bounds.width),
        height: Math.max(Math.min(680, area.height), saved.bounds.height) }, area);
      maximized = saved.maximized;
    }
  } catch { /* New or unavailable placement data uses the current default size. */ }
  const window = new BrowserWindow({
    ...bounds, minWidth: Math.min(900, bounds.width), minHeight: Math.min(680, bounds.height),
    backgroundColor: '#111719', title: 'Life Countdown', skipTaskbar: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow = window;
  let placementTimer, presented = false;
  const rememberPlacement = () => {
    clearTimeout(placementTimer);
    if (window.isDestroyed() || !presented) return;
    // Minimize must preserve whether the user was maximized before minimizing.
    if (!window.isMinimized()) maximized = window.isMaximized();
    try {
      fsSync.writeFileSync(placementPath + '.tmp', JSON.stringify({ bounds: window.getNormalBounds(), maximized }));
      fsSync.renameSync(placementPath + '.tmp', placementPath);
    } catch (error) { console.error('Could not save main window size:', error.message); }
  };
  const queuePlacement = () => {
    clearTimeout(placementTimer);
    placementTimer = setTimeout(rememberPlacement, 200);
  };
  window.setMenuBarVisibility(false);
  window.once('ready-to-show', () => {
    presented = true;
    if (maximized) window.maximize();
    window.show();
  });
  for (const event of ['move', 'resize']) window.on(event, queuePlacement);
  window.on('maximize', () => { maximized = true; queuePlacement(); });
  window.on('unmaximize', () => { maximized = false; queuePlacement(); });
  let closeQuitRequested = false;
  window.on('close', event => {
    rememberPlacement();
    if (!quitting && (onboardingInProgress || !tray)) {
      event.preventDefault();
      // Finish pending saves before exiting; even a setup widget preview must quit.
      if (!closeQuitRequested) {
        closeQuitRequested = true;
        writeQueue.then(() => app.quit());
      }
    }
  });
  window.on('closed', () => { clearTimeout(placementTimer); mainWindow = null; introduceTray(); });
  window.loadFile(path.join(__dirname, 'index.html'));
}

function createWidget() {
  if (onboardingInProgress && !onboardingWidgetReady) { showMain(); return; }
  if (widgetWindow) {
    ensureTray();
    if (widgetWindow.isMinimized()) widgetWindow.restore();
    widgetWindow.show();
    raiseWidget();
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  widgetExpanded = false;
  compactWidgetBounds = null;
  widgetReady = false;
  widgetWindow = new BrowserWindow({
    ...restoredWidgetBounds(widgetCounterOnly, {
      width: 420, height: WIDGET_HEIGHT,
      x: Math.max(area.x, area.x + area.width - 444), y: Math.max(area.y, area.y + area.height - WIDGET_HEIGHT - 24)
    }),
    frame: false, resizable: false, alwaysOnTop: true, transparent: true, skipTaskbar: true,
    backgroundColor: '#00000000', hasShadow: false, fullscreenable: false,
    title: 'Life Countdown widget',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  widgetLaunched = true;
  ensureTray();
  for (const event of ['show', 'restore', 'blur', 'leave-full-screen']) widgetWindow.on(event, raiseWidget);
  widgetWindow.on('always-on-top-changed', (_event, onTop) => { if (!onTop) raiseWidget(); });
  // Other apps can change the native stacking without an Electron event.
  // Never show a deliberately hidden widget or take focus during recovery.
  const topmostTimer = setInterval(raiseWidget, 1000);
  topmostTimer.unref();
  widgetWindow.once('closed', () => {
    clearInterval(topmostTimer);
    finishWidgetPresentation(widgetPresentation?.id);
  });
  raiseWidget();
  widgetWindow.loadFile(path.join(__dirname, 'index.html'), { query: { widget: '1' } });
  widgetWindow.webContents.once('did-finish-load', introduceTray);
  widgetWindow.on('move', () => {
    clearTimeout(positionTimer);
    positionTimer = setTimeout(rememberWidgetPosition, 150);
  });
  widgetWindow.on('close', rememberWidgetPosition);
  widgetWindow.on('will-move', (event, proposed) => {
    const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const constrained = constrainWidgetBounds(proposed, workArea);
    if (Object.keys(constrained).some(key => constrained[key] !== proposed[key])) {
      event.preventDefault();
      widgetWindow.setBounds(constrained);
    }
  });
  widgetWindow.on('closed', () => { stopDesktopEffect(); widgetWindow = null; introduceTray(); });
}

ipcMain.handle('widget:desktop-effect', async (event, effect, point) => {
  if (!widgetWindow || event.sender.id !== widgetWindow.webContents.id) return;
  stopDesktopEffect();
  if (effect === 'off') return;
  if (!widgetWindow.isVisible()) return;
  if (!['pulse', 'sweep'].includes(effect) || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const widget = widgetWindow.getContentBounds();
  const area = screen.getDisplayMatching(widget).workArea;
  const origin = {
    x: Math.max(0, Math.min(area.width, widget.x + point.x - area.x)),
    y: Math.max(0, Math.min(area.height, widget.y + point.y - area.y))
  };
  const overlay = new BrowserWindow({
    ...area, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    focusable: false, skipTaskbar: true, resizable: false, movable: false, hasShadow: false,
    fullscreenable: false, title: 'Life Countdown desktop effect',
    webPreferences: { preload: path.join(__dirname, 'effect-preload.cjs'), contextIsolation: true,
      nodeIntegration: false, backgroundThrottling: false }
  });
  desktopEffectWindow = overlay;
  // Stay above ordinary apps without covering the taskbar or presenting a fullscreen window to Windows.
  overlay.setIgnoreMouseEvents(true);
  overlay.setAlwaysOnTop(true);
  const timeout = setTimeout(() => { if (!overlay.isDestroyed()) overlay.destroy(); }, 5000);
  overlay.on('closed', () => {
    clearTimeout(timeout);
    if (desktopEffectWindow === overlay) desktopEffectWindow = null;
  });
  try {
    await overlay.loadFile(path.join(__dirname, 'effect.html'));
    if (overlay.isDestroyed() || desktopEffectWindow !== overlay) return;
    overlay.showInactive();
    raiseWidget();
    overlay.webContents.send('desktop-effect:start', { effect, origin, duration: 2000 });
  } catch {
    if (!overlay.isDestroyed()) overlay.destroy();
  }
});
ipcMain.on('desktop-effect:done', event => {
  if (desktopEffectWindow && event.sender.id === desktopEffectWindow.webContents.id) stopDesktopEffect();
});

function constrainWidgetBounds(bounds, area) {
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
  return { width, height,
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))
  };
}

function setWidgetExpanded(expanded) {
  if (!widgetWindow) return false;
  expanded = expanded === true;
  if (expanded && widgetCounterOnly) return false;
  if (expanded === widgetExpanded) return widgetExpanded;
  const current = widgetWindow.getBounds();
  if (expanded) { rememberWidgetPosition(); compactWidgetBounds = current; }
  const anchor = expanded ? current : compactWidgetBounds || current;
  const area = screen.getDisplayMatching(anchor).workArea;
  const width = expanded ? Math.min(1080, area.width - 24) : Math.min(compactWidgetBounds?.width ?? 420, area.width);
  const height = expanded ? Math.max(1, area.height - 24) : Math.min(compactWidgetBounds?.height ?? WIDGET_HEIGHT, area.height);
  widgetWindow.setBounds({
    width, height,
    x: Math.max(area.x, Math.min(anchor.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(anchor.y, area.y + area.height - height))
  });
  widgetExpanded = expanded;
  return widgetExpanded;
}

function setWidgetCounterOnly(enabled) {
  if (!widgetWindow) return false;
  enabled = enabled === true;
  if (enabled === widgetCounterOnly) return widgetCounterOnly;
  if (widgetExpanded) setWidgetExpanded(false);
  rememberWidgetPosition();
  const bounds = widgetWindow.getBounds();
  widgetCounterOnly = enabled;
  widgetWindow.setBounds(restoredWidgetBounds(enabled, bounds));
  rememberWidgetPosition();
  return widgetCounterOnly;
}

ipcMain.handle('settings:read', async () => {
  await writeQueue;
  try { return JSON.parse(await fs.readFile(settingsPath(), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
});
ipcMain.handle('settings:write', async (event, state) => {
  if (resettingSettings || event.sender.isDestroyed()) throw new Error('Settings are being reset. Please try again.');
  const payload = JSON.stringify(state, null, 2);
  const operation = writeQueue.then(async () => {
    const destination = settingsPath();
    await fs.writeFile(destination + '.tmp', payload, 'utf8');
    await fs.rename(destination + '.tmp', destination);
    onboardingInProgress = !state.birthday || Boolean(state.onboardingStep && state.onboardingStep !== 'done');
    onboardingWidgetReady = state.onboardingStep === 'widget' && state.setupHoursConfirmed === true;
    ensureTray();
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.id !== event.sender.id) window.webContents.send('settings:changed', state);
    }
  });
  writeQueue = operation.catch(() => {});
  await operation;
});
ipcMain.handle('settings:reset', async event => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) throw new Error('Reset from Help & tour in the full app.');
  if (resettingSettings) throw new Error('A reset is already in progress.');
  resettingSettings = true;
  const operation = writeQueue.then(async () => {
    const { defaults } = await import('./src/model.mjs');
    const fresh = defaults();
    const previous = await fs.readFile(settingsPath(), 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    const backupDirectory = path.join(app.getPath('userData'), 'backups');
    await fs.mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `before-reset-${Date.now()}-${require('node:crypto').randomUUID()}.json`);
    await fs.writeFile(backupPath, JSON.stringify({ settings: previous, widgetPositions }, null, 2), 'utf8');
    // Stop the old widget before replacing its settings so it cannot save stale state.
    clearTimeout(positionTimer);
    stopDesktopEffect();
    if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.destroy();
    await fs.writeFile(settingsPath() + '.tmp', JSON.stringify(fresh, null, 2), 'utf8');
    await fs.rename(settingsPath() + '.tmp', settingsPath());
    await fs.writeFile(positionsPath() + '.tmp', '{}', 'utf8');
    await fs.rename(positionsPath() + '.tmp', positionsPath());
    widgetPositions = {};
    widgetExpanded = false;
    widgetCounterOnly = false;
    compactWidgetBounds = null;
    counterDrag = null;
    widgetReady = false;
    pendingEffect = null;
    onboardingInProgress = true;
    onboardingWidgetReady = false;
    widgetLaunched = false;
    tray?.destroy();
    tray = null;
    return fresh;
  });
  writeQueue = operation.catch(() => {});
  try { return await operation; }
  finally { resettingSettings = false; }
});
ipcMain.handle('widget:open', createWidget);
ipcMain.handle('widget:choose-period', async (event, point) => {
  await writeQueue;
  const window = widgetWindow;
  if (!window || window.isDestroyed() || event.sender !== window.webContents) return null;
  const state = JSON.parse(await fs.readFile(settingsPath(), 'utf8'));
  const { widgetPeriodFor } = await import('./src/model.mjs');
  if (window.isDestroyed()) return null;
  const selected = widgetPeriodFor(state)?.id;
  return new Promise((resolve, reject) => {
    let finished = false, menu;
    const finish = (id, error) => {
      if (finished) return;
      finished = true;
      window.removeListener('closed', closed);
      if (error) reject(error); else resolve(id);
    };
    const closed = () => { menu?.closePopup(); finish(null); };
    menu = electron.Menu.buildFromTemplate([
      { id: 'life', name: 'My life', enabled: Boolean(state.birthday) },
      ...state.periods.map(period => ({ id: period.id, name: period.name, enabled: true }))
    ].map(period => ({
      label: period.name, type: 'radio', checked: period.id === selected, enabled: period.enabled,
      click: () => finish(period.id)
    })));
    const bounds = window.getContentBounds();
    const position = Number.isFinite(point?.x) && Number.isFinite(point?.y) ? {
      x: Math.max(0, Math.min(bounds.width - 1, Math.round(point.x))),
      y: Math.max(0, Math.min(bounds.height - 1, Math.round(point.y)))
    } : {};
    window.once('closed', closed);
    try { menu.popup({ window, ...position, callback: () => finish(null) }); }
    catch (error) { finish(null, error); }
  });
});
ipcMain.handle('startup:read', () => startup.read());
ipcMain.handle('startup:set', (_event, enabled) => {
  return startup.set(enabled);
});
ipcMain.handle('widget:close', () => widgetWindow?.close());
ipcMain.handle('widget:set-expanded', (_event, expanded) => setWidgetExpanded(expanded));
ipcMain.handle('widget:prepare-expanded', (event, expanded) => {
  if (!widgetWindow || event.sender !== widgetWindow.webContents) throw new Error('Widget is unavailable.');
  finishWidgetPresentation(widgetPresentation?.id);
  const window = widgetWindow, id = ++widgetPresentationId;
  // Windows can display the old counter at the new bounds before Chromium paints.
  // Keep the same native window and focus, but reveal it only after the new view paints.
  window.setOpacity(0);
  widgetPresentation = { id, window, timeout: setTimeout(() => finishWidgetPresentation(id), 2000) };
  try { return { expanded: setWidgetExpanded(expanded), id }; }
  catch (error) { finishWidgetPresentation(id); throw error; }
});
ipcMain.handle('widget:present', (event, id) => {
  if (event.sender === widgetPresentation?.window.webContents) finishWidgetPresentation(id);
});
ipcMain.handle('widget:get-expanded', () => widgetExpanded);
ipcMain.handle('widget:counter-only', (_event, enabled) => setWidgetCounterOnly(enabled));
ipcMain.on('widget:effect-ready', event => {
  if (!widgetWindow || event.sender.id !== widgetWindow.webContents.id) return;
  widgetReady = true;
  if (pendingEffect) { widgetWindow.webContents.send('widget:effect-preview', pendingEffect); pendingEffect = null; }
});
ipcMain.handle('widget:effect-preview', (_event, effect) => {
  if (!['off', 'pulse', 'sweep'].includes(effect)) throw new Error('Choose an hourly effect.');
  createWidget();
  if (widgetReady) widgetWindow.webContents.send('widget:effect-preview', effect);
  else pendingEffect = effect;
});
ipcMain.handle('widget:fit-counter', (event, requestedWidth) => {
  if (!widgetWindow || event.sender.id !== widgetWindow.webContents.id || !widgetCounterOnly || !Number.isFinite(requestedWidth)) return;
  const bounds = widgetWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.max(120, Math.min(Math.ceil(requestedWidth), area.width));
  if (width === bounds.width) return;
  widgetWindow.setBounds({ ...bounds, width, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)) });
});
function validCounterPointer(event, point) {
  return widgetWindow && event.sender.id === widgetWindow.webContents.id && point && Number.isFinite(point.x) && Number.isFinite(point.y);
}
ipcMain.on('widget:drag-start', (event, point) => {
  if (validCounterPointer(event, point)) counterDrag = { point, bounds: widgetWindow.getBounds() };
});
ipcMain.on('widget:drag-move', (event, point) => {
  if (!counterDrag || !validCounterPointer(event, point)) return;
  const dx = point.x - counterDrag.point.x, dy = point.y - counterDrag.point.y;
  if (Math.hypot(dx, dy) < 4) return;
  const x = Math.round(counterDrag.bounds.x + dx), y = Math.round(counterDrag.bounds.y + dy);
  const area = screen.getDisplayNearestPoint({ x: Math.round(point.x), y: Math.round(point.y) }).workArea;
  const bounds = widgetWindow.getBounds();
  widgetWindow.setPosition(Math.max(area.x, Math.min(x, area.x + area.width - bounds.width)), Math.max(area.y, Math.min(y, area.y + area.height - bounds.height)));
});
ipcMain.on('widget:drag-end', event => {
  if (widgetWindow && event.sender.id === widgetWindow.webContents.id) counterDrag = null;
});
ipcMain.on('widget:opacity-preview', (_event, opacity) => {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) return;
  widgetWindow?.webContents.send('widget:opacity-preview', opacity);
});
function showMain(destination) {
  if (!mainWindow) createMain();
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  }
  if (destination === 'moments') {
    const target = mainWindow;
    const navigate = () => { if (!target.isDestroyed()) target.webContents.send('main:navigate', destination); };
    if (target.webContents.isLoading()) target.webContents.once('did-finish-load', navigate);
    else navigate();
  }
}
ipcMain.handle('main:show', (_event, destination) => showMain(destination));
app.whenReady().then(async () => {
  let setupComplete = false, savedOnboardingStep;
  try {
    const savedPositions = JSON.parse(await fs.readFile(positionsPath(), 'utf8'));
    if (savedPositions && typeof savedPositions === 'object') widgetPositions = savedPositions;
  } catch { /* First launch or unavailable placement data uses the default corner. */ }
  try {
    const saved = JSON.parse(await fs.readFile(settingsPath(), 'utf8'));
    savedOnboardingStep = saved.onboardingStep;
    onboardingWidgetReady = saved.onboardingStep === 'widget' && saved.setupHoursConfirmed === true;
    widgetCounterOnly = saved.widgetCounterOnly === true;
    const { dateValue } = await import('./src/model.mjs');
    dateValue(saved.birthday);
    setupComplete = Number.isInteger(saved.lifespan) && saved.lifespan >= 1 && saved.lifespan <= 130;
  } catch {
    // New or incomplete profiles need the setup window. Leave saved files intact.
  }
  onboardingInProgress = !setupComplete || Boolean(savedOnboardingStep && savedOnboardingStep !== 'done');
  if (onboardingInProgress) createMain();
  else createWidget();
  widgetSessionReady = true;
  const refreshClocks = () => {
    raiseWidget();
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('clock:refresh');
    }
  };
  powerMonitor.on('resume', refreshClocks);
  powerMonitor.on('unlock-screen', refreshClocks);
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, raiseWidget);
});
// Background operation starts only after setup and the first widget launch.
app.on('window-all-closed', () => { if (!tray) app.quit(); });
app.on('before-quit', () => {
  quitting = true;
  rememberWidgetPosition();
  stopDesktopEffect();
  tray?.destroy();
  tray = null;
});
