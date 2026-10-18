const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopEffect', {
  onStart: callback => ipcRenderer.once('desktop-effect:start', (_event, options) => callback(options)),
  done: () => ipcRenderer.send('desktop-effect:done')
});
