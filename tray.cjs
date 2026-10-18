function createTray({ Tray, Menu, nativeImage }, actions) {
  // A small clock drawn directly into a bitmap keeps the tray icon crisp and self-contained.
  const size = 32, bitmap = Buffer.alloc(size * size * 4);
  const distanceToLine = (x, y, ax, ay, bx, by) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot(x - 15.5, y - 15.5);
    const ring = Math.max(0, Math.min(1, 1.5 - Math.abs(radius - 11.5)));
    const hands = Math.max(0, Math.min(1, 1.5 - Math.min(
      distanceToLine(x, y, 15.5, 15.5, 15.5, 8), distanceToLine(x, y, 15.5, 15.5, 21, 19))));
    const ink = Math.max(ring, hands), alpha = Math.max(0, Math.min(1, 14.5 - radius));
    const index = (y * size + x) * 4;
    // Electron's Windows bitmap format is premultiplied BGRA.
    bitmap[index] = Math.round((36 + ink * (158 - 36)) * alpha);
    bitmap[index + 1] = Math.round((34 + ink * (226 - 34)) * alpha);
    bitmap[index + 2] = Math.round((24 + ink * (196 - 24)) * alpha);
    bitmap[index + 3] = Math.round(alpha * 255);
  }
  const icon = nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 2 });
  const tray = new Tray(icon);
  tray.setToolTip('Life Countdown');
  tray.setContextMenu(Menu.buildFromTemplate([
    { id: 'show-widget', label: 'Show widget', click: actions.showWidget },
    { id: 'hide-widget', label: 'Hide widget', click: actions.hideWidget },
    { id: 'open-app', label: 'Open full app', click: actions.showMain },
    { type: 'separator' },
    { id: 'quit', label: 'Quit Life Countdown', click: actions.quit }
  ]));
  tray.on('click', actions.showWidget);
  tray.on('double-click', actions.showMain);
  return tray;
}
module.exports = createTray;
