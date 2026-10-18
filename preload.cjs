const { contextBridge, ipcRenderer } = require('electron');
let pendingNavigation, navigationHandler;
ipcRenderer.on('main:navigate', (_event, destination) => {
  if (navigationHandler) navigationHandler(destination);
  else pendingNavigation = destination;
});
contextBridge.exposeInMainWorld('desktop', {
  read: () => ipcRenderer.invoke('settings:read'),
  save: state => ipcRenderer.invoke('settings:write', state),
  reset: () => ipcRenderer.invoke('settings:reset'),
  openWidget: () => ipcRenderer.invoke('widget:open'),
  readStartup: () => ipcRenderer.invoke('startup:read'),
  setStartup: enabled => ipcRenderer.invoke('startup:set', enabled),
  closeWidget: () => ipcRenderer.invoke('widget:close'),
  setWidgetExpanded: expanded => ipcRenderer.invoke('widget:set-expanded', expanded),
  prepareWidgetExpanded: expanded => ipcRenderer.invoke('widget:prepare-expanded', expanded),
  presentWidget: id => ipcRenderer.invoke('widget:present', id),
  getWidgetExpanded: () => ipcRenderer.invoke('widget:get-expanded'),
  setWidgetCounterOnly: enabled => ipcRenderer.invoke('widget:counter-only', enabled),
  previewEffect: effect => ipcRenderer.invoke('widget:effect-preview', effect),
  desktopEffect: (effect, point) => ipcRenderer.invoke('widget:desktop-effect', effect, point),
  onEffectPreview: callback => ipcRenderer.on('widget:effect-preview', (_event, effect) => callback(effect)),
  widgetReady: () => ipcRenderer.send('widget:effect-ready'),
  fitWidgetCounter: width => ipcRenderer.invoke('widget:fit-counter', width),
  startCounterDrag: point => ipcRenderer.send('widget:drag-start', point),
  moveCounterDrag: point => ipcRenderer.send('widget:drag-move', point),
  endCounterDrag: () => ipcRenderer.send('widget:drag-end'),
  previewOpacity: opacity => ipcRenderer.send('widget:opacity-preview', opacity),
  onOpacityPreview: callback => ipcRenderer.on('widget:opacity-preview', (_event, opacity) => callback(opacity)),
  showMain: destination => ipcRenderer.invoke('main:show', destination),
  onNavigate: callback => {
    navigationHandler = callback;
    if (pendingNavigation) { const destination = pendingNavigation; pendingNavigation = null; callback(destination); }
  },
  onChange: callback => ipcRenderer.on('settings:changed', (_event, state) => callback(state)),
  onClockRefresh: callback => ipcRenderer.on('clock:refresh', () => callback())
});
