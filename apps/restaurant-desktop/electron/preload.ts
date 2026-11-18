import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('uzbiteRestaurant', {
  isElectron: true,
  api: {
    request: (req: { method?: string; path: string; headers?: Record<string, string>; body?: unknown }) =>
      ipcRenderer.invoke('uzbite:api:request', req),
    upload: (req: {
      path: string;
      fileName: string;
      mimeType: string;
      base64: string;
      fields?: Record<string, string>;
    }) => ipcRenderer.invoke('uzbite:api:upload', req),
    download: (req: { path: string; defaultFileName: string }) =>
      ipcRenderer.invoke('uzbite:api:download', req),
  },
  auth: {
    get: () => ipcRenderer.invoke('uzbite:auth:get'),
    set: (payload: unknown) => ipcRenderer.invoke('uzbite:auth:set', payload),
    clear: () => ipcRenderer.invoke('uzbite:auth:clear'),
  },
  config: {
    get: () => ipcRenderer.invoke('uzbite:config:get'),
    set: (patch: { apiBaseUrl?: string; language?: string; theme?: string }) =>
      ipcRenderer.invoke('uzbite:config:set', patch),
  },
  dialog: {
    openFile: (req: { kind: 'spreadsheet' | 'image' | 'video' }) =>
      ipcRenderer.invoke('uzbite:dialog:openFile', req),
  },
  shell: {
    openYandexMap: (url: string) => ipcRenderer.invoke('uzbite:shell:openYandexMap', url),
  },
  notify: (payload: { title: string; body: string }) => ipcRenderer.invoke('uzbite:notify', payload),
});
