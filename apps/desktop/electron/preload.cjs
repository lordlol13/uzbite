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
  bootstrap: {
    pickWorkspace: () => ipcRenderer.invoke('uzbite:bootstrap:pick-workspace'),
    retry: () => ipcRenderer.invoke('uzbite:bootstrap:retry'),
    openLogs: () => ipcRenderer.invoke('uzbite:bootstrap:open-logs'),
    onProgress: listener => {
      const handler = (_event, data) => listener(data);
      ipcRenderer.on('uzbite:bootstrap:progress', handler);
      return () => ipcRenderer.removeListener('uzbite:bootstrap:progress', handler);
    },
  },
});
