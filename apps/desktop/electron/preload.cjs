// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('uzbite', {
  isElectron: true,
  api: {
    request: req => ipcRenderer.invoke('uzbite:api:request', req),
  },
  auth: {
    get: () => ipcRenderer.invoke('uzbite:auth:get'),
    set: payload => ipcRenderer.invoke('uzbite:auth:set', payload),
    clear: () => ipcRenderer.invoke('uzbite:auth:clear'),
  },
});
