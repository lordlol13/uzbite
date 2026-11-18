import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';

const here = dirname(fileURLToPath(import.meta.url));
const apiBase = (process.env.BUSINESS_API_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');
const rendererUrl = process.env.DESKTOP_RENDERER_URL || 'http://127.0.0.1:8082';
const distIndex = resolve(here, '../dist/index.html');

function authStorePath() {
  return join(app.getPath('userData'), 'uzbite-business-auth.bin');
}

function readStoredAuth() {
  const file = authStorePath();
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file);
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function writeStoredAuth(payload) {
  const file = authStorePath();
  mkdirSync(dirname(file), { recursive: true });
  const text = JSON.stringify(payload);
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(text)
    : Buffer.from(text, 'utf8');
  writeFileSync(file, data);
}

function clearStoredAuth() {
  const file = authStorePath();
  if (existsSync(file)) {
    try { unlinkSync(file); } catch { /* Ignore cleanup failure. */ }
  }
}

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    title: 'UzBite Business — Analytics & AI Financial Audit',
    backgroundColor: '#f7f7f5',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
    }
  }, 2500);

  const loadDevUrl = process.env.DESKTOP_DEV === '1' || !existsSync(distIndex);
  let loadAttempts = 0;
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || win.isDestroyed()) return;
    if (loadDevUrl && loadAttempts < 5 && validatedURL.startsWith('http://127.0.0.1:')) {
      loadAttempts += 1;
      setTimeout(() => {
        if (!win.isDestroyed()) void win.loadURL(rendererUrl);
      }, 600);
      return;
    }
    if (loadDevUrl && existsSync(distIndex)) {
      void win.loadFile(distIndex);
      return;
    }
    const safeDesc = String(errorDescription || 'Load failed').replace(/[<>&]/g, '');
    void win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<!doctype html><body style="font-family:Segoe UI,sans-serif;padding:32px;background:#f7f7f5;color:#111"><h2>UzBite Business</h2><p>Не удалось загрузить интерфейс (${safeDesc}).</p></body>`,
      )}`,
    );
  });

  if (loadDevUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(distIndex);
  }
  mainWindow = win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  if (!gotLock) return;
  ipcMain.handle('uzbite:auth:get', () => readStoredAuth());
  ipcMain.handle('uzbite:auth:set', (_event, payload) => {
    writeStoredAuth(payload);
    return true;
  });
  ipcMain.handle('uzbite:auth:clear', () => {
    clearStoredAuth();
    return true;
  });

  ipcMain.handle('uzbite:api:request', async (_event, req) => {
    const stored = readStoredAuth();
    const headers = {
      ...(req.headers || {}),
    };
    if (req.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (stored?.accessToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${stored.accessToken}`;
    }

    const url = `${apiBase}/api${req.path.startsWith('/') ? req.path : `/${req.path}`}`;
    let response;
    try {
      response = await fetch(url, {
        method: req.method || 'GET',
        headers,
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      });
    } catch {
      return {
        status: 503,
        ok: false,
        payload: {
          error: {
            code: 'SERVER_UNREACHABLE',
            message: `Сервер UzBite (${apiBase}) недоступен. Запустите Start-UzBite-All.cmd или npm run dev:server.`,
          },
        },
      };
    }
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { error: { code: 'INVALID_JSON', message: text } }; }
    return { status: response.status, ok: response.ok, payload: json };
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
