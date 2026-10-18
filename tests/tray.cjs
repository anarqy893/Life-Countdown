// Exercise the real Windows tray icon and menu without touching personal settings.
const electron = require('electron');
const { app, Menu, BrowserWindow } = electron;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'life-countdown-tray-'));
app.setPath('userData', temporary);
app.setPath('sessionData', temporary);
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  let menu, showCount = 0, mainCount = 0, quitCount = 0;
  const widget = new BrowserWindow({ show: false, skipTaskbar: true });
  const tray = require('../tray.cjs')({
    Tray: electron.Tray, nativeImage: electron.nativeImage,
    Menu: { buildFromTemplate(template) { menu = Menu.buildFromTemplate(template); return menu; } }
  }, {
    showWidget: () => { showCount++; widget.showInactive(); },
    hideWidget: () => widget.hide(),
    showMain: () => mainCount++,
    quit: () => quitCount++
  });
  assert.equal(tray.isDestroyed(), false);
  assert.ok(tray.getBounds().width > 0, 'a native system tray icon is registered');
  menu.getMenuItemById('show-widget').click();
  assert.equal(widget.isVisible(), true);
  menu.getMenuItemById('hide-widget').click();
  assert.equal(widget.isVisible(), false);
  tray.emit('click');
  assert.equal(showCount, 2, 'clicking the tray brings the widget back');
  menu.getMenuItemById('open-app').click();
  tray.emit('double-click');
  assert.equal(mainCount, 2, 'menu and double click open the full app');
  menu.getMenuItemById('quit').click();
  assert.equal(quitCount, 1, 'Quit has a dedicated action');
  tray.destroy();
  assert.equal(tray.isDestroyed(), true);
  widget.destroy();
  console.log('Tray check passed: native icon, show/hide widget, click, double click, full app, Quit, and cleanup.');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
