import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  safeStorage,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const distDir = resolve(appRoot, 'dist');
const distIndex = resolve(distDir, 'index.html');
const iconPng = resolve(appRoot, 'build/icon.png');
const iconIco = resolve(appRoot, 'build/icon.ico');
const preloadPath = resolve(here, 'preload.cjs');

const devRendererUrl = process.env.DESKTOP_RENDERER_URL || 'http://127.0.0.1:8083';
let activeAppOrigin = new URL(devRendererUrl).origin;
let staticServer: Server | null = null;
let mainWindow: BrowserWindow | null = null;

interface DesktopConfig {
  apiBaseUrl: string;
  language: 'ru' | 'uz' | 'en';
  theme: 'light' | 'dark';
}

const DEFAULT_API_BASE = (process.env.UZBITE_API_BASE_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');

function authStorePath() {
  return join(app.getPath('userData'), 'uzbite-restaurant-auth.bin');
}

function configStorePath() {
  return join(app.getPath('userData'), 'uzbite-restaurant-config.json');
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP or HTTPS URLs are allowed');
  }
  return parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname);
}

function readConfig(): DesktopConfig {
  const file = configStorePath();
  const fallback: DesktopConfig = {
    apiBaseUrl: DEFAULT_API_BASE,
    language: 'ru',
    theme: 'light',
  };
  if (!existsSync(file)) return fallback;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<DesktopConfig>;
    return {
      apiBaseUrl: raw.apiBaseUrl ? normalizeBaseUrl(raw.apiBaseUrl) : fallback.apiBaseUrl,
      language: raw.language === 'uz' || raw.language === 'en' ? raw.language : 'ru',
      theme: raw.theme === 'dark' ? 'dark' : 'light',
    };
  } catch {
    return fallback;
  }
}

function writeConfig(patch: Partial<DesktopConfig>): DesktopConfig {
  const current = readConfig();
  const next: DesktopConfig = {
    apiBaseUrl: patch.apiBaseUrl !== undefined ? normalizeBaseUrl(patch.apiBaseUrl) : current.apiBaseUrl,
    language: patch.language ?? current.language,
    theme: patch.theme ?? current.theme,
  };
  const file = configStorePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function readStoredAuth(): Record<string, unknown> | null {
  const file = authStorePath();
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file);
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeStoredAuth(payload: Record<string, unknown>) {
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
    try {
      unlinkSync(file);
    } catch {
      /* Ignore cleanup error */
    }
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const frameUrl = event.senderFrame?.url;
  if (!frameUrl) throw new Error('Untrusted IPC sender');
  const origin = new URL(frameUrl).origin;
  if (origin !== activeAppOrigin) {
    throw new Error(`Forbidden IPC origin: ${origin}`);
  }
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function startStaticRendererServer(): Promise<string> {
  return new Promise((resolveUrl, rejectUrl) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const rel = normalize(decodeURIComponent(reqUrl.pathname)).replace(/^(\.\.[/\\])+/, '');
      let target = resolve(distDir, rel.replace(/^[/\\]+/, ''));
      if (!target.startsWith(distDir) || !existsSync(target) || statSync(target).isDirectory()) {
        target = distIndex;
      }
      const ext = extname(target).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_MAP[ext] ?? 'application/octet-stream',
        'Cache-Control': target === distIndex ? 'no-store' : 'public, max-age=3600',
      });
      res.end(readFileSync(target));
    });

    server.on('error', () => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          staticServer = server;
          resolveUrl(`http://127.0.0.1:${addr.port}`);
        } else {
          rejectUrl(new Error('Could not bind local renderer server'));
        }
      });
    });

    server.listen(18083, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        staticServer = server;
        resolveUrl(`http://127.0.0.1:${addr.port}`);
      } else {
        rejectUrl(new Error('Could not bind local renderer server'));
      }
    });
  });
}

function buildCspHeader(): string {
  const apiUrl = readConfig().apiBaseUrl;
  const apiOrigin = new URL(apiUrl).origin;
  const wsOrigin = apiOrigin.replace(/^http/i, 'ws');
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api-maps.yandex.ru https://*.yandex.ru https://*.yastatic.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: ${apiOrigin} https://*.yandex.ru https://*.yandex.net https://*.yastatic.net https://images.pexels.com https:`,
    `media-src 'self' blob: data: ${apiOrigin} https:`,
    `connect-src 'self' ${apiOrigin} ${wsOrigin} https://api-maps.yandex.ru https://*.yandex.ru https://*.yandex.net ws://127.0.0.1:* http://127.0.0.1:* ws://localhost:* http://localhost:*`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function createWindow(startUrl: string) {
  const windowIcon = process.platform === 'win32' && existsSync(iconIco)
    ? iconIco
    : existsSync(iconPng)
      ? iconPng
      : undefined;

  const win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    title: 'UzBite Restaurant',
    icon: windowIcon,
    backgroundColor: readConfig().theme === 'dark' ? '#111310' : '#f7f7f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  // Fallback reveal if an external network font stalls ready-to-show.
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
    }
  }, 2500);

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin !== activeAppOrigin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  let loadAttempts = 0;
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || win.isDestroyed()) return;
    if (loadAttempts < 5 && validatedURL.startsWith('http://127.0.0.1:')) {
      loadAttempts += 1;
      setTimeout(() => {
        if (!win.isDestroyed()) void win.loadURL(startUrl);
      }, 600);
      return;
    }
    const safeDesc = String(errorDescription || 'Load failed').replace(/[<>&]/g, '');
    void win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<!doctype html><body style="font-family:Segoe UI,sans-serif;padding:32px;background:#f7f7f5;color:#111"><h2>UzBite Restaurant</h2><p>Не удалось загрузить интерфейс (${safeDesc}).</p></body>`,
      )}`,
    );
  });

  void win.loadURL(startUrl);
  mainWindow = win;
}

app.setAppUserModelId('uz.uzbite.restaurant.desktop');

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

app.whenReady().then(async () => {
  if (!gotLock) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    try {
      if (new URL(details.url).origin === activeAppOrigin) {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [buildCspHeader()],
          },
        });
        return;
      }
    } catch {
      /* Ignore non-URL requests */
    }
    callback({ responseHeaders: details.responseHeaders });
  });

  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  ipcMain.handle('uzbite:auth:get', event => {
    assertTrustedSender(event);
    return readStoredAuth();
  });
  ipcMain.handle('uzbite:auth:set', (event, payload: Record<string, unknown>) => {
    assertTrustedSender(event);
    writeStoredAuth(payload);
    return true;
  });
  ipcMain.handle('uzbite:auth:clear', event => {
    assertTrustedSender(event);
    clearStoredAuth();
    return true;
  });

  ipcMain.handle('uzbite:config:get', event => {
    assertTrustedSender(event);
    return readConfig();
  });
  ipcMain.handle('uzbite:config:set', (event, patch: Partial<DesktopConfig>) => {
    assertTrustedSender(event);
    return writeConfig(patch);
  });

  async function fetchBackend(url: string, init: RequestInit): Promise<Response | null> {
    try {
      return await fetch(url, init);
    } catch {
      return null;
    }
  }

  function unreachableResponse(apiBaseUrl: string) {
    return {
      status: 503,
      ok: false,
      payload: {
        error: {
          code: 'SERVER_UNREACHABLE',
          message: `Сервер UzBite (${apiBaseUrl}) недоступен. Запустите Start-UzBite-Restaurant.cmd / Start-UzBite-All.cmd или укажите адрес в «Сервер».`,
        },
      },
    };
  }

  ipcMain.handle(
    'uzbite:api:request',
    async (
      event,
      req: { method?: string; path: string; headers?: Record<string, string>; body?: unknown },
    ) => {
      assertTrustedSender(event);
      const cfg = readConfig();
      const stored = readStoredAuth();
      const headers: Record<string, string> = { ...(req.headers || {}) };
      if (req.body !== undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      if (typeof stored?.accessToken === 'string' && !headers.Authorization) {
        headers.Authorization = `Bearer ${stored.accessToken}`;
      }
      const cleanPath = req.path.startsWith('/') ? req.path : `/${req.path}`;
      const url = `${cfg.apiBaseUrl}/api${cleanPath}`;
      const response = await fetchBackend(url, {
        method: req.method || 'GET',
        headers,
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      });
      if (!response) return unreachableResponse(cfg.apiBaseUrl);
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { error: { code: 'INVALID_JSON', message: text } };
      }
      return { status: response.status, ok: response.ok, payload: json };
    },
  );

  ipcMain.handle(
    'uzbite:api:upload',
    async (
      event,
      req: {
        path: string;
        fileName: string;
        mimeType: string;
        base64: string;
        fields?: Record<string, string>;
      },
    ) => {
      assertTrustedSender(event);
      const cfg = readConfig();
      const stored = readStoredAuth();
      const form = new FormData();
      const bytes = Buffer.from(req.base64, 'base64');
      if (req.fields) {
        for (const [k, v] of Object.entries(req.fields)) {
          form.set(k, v);
        }
      }
      form.set('file', new Blob([bytes], { type: req.mimeType || 'application/octet-stream' }), req.fileName);

      const headers: Record<string, string> = {};
      if (typeof stored?.accessToken === 'string') {
        headers.Authorization = `Bearer ${stored.accessToken}`;
      }
      const cleanPath = req.path.startsWith('/') ? req.path : `/${req.path}`;
      const response = await fetchBackend(`${cfg.apiBaseUrl}/api${cleanPath}`, {
        method: 'POST',
        headers,
        body: form,
      });
      if (!response) return unreachableResponse(cfg.apiBaseUrl);
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { error: { code: 'INVALID_JSON', message: text } };
      }
      return { status: response.status, ok: response.ok, payload: json };
    },
  );

  ipcMain.handle(
    'uzbite:api:download',
    async (event, req: { path: string; defaultFileName: string }) => {
      assertTrustedSender(event);
      const cfg = readConfig();
      const stored = readStoredAuth();
      const headers: Record<string, string> = {};
      if (typeof stored?.accessToken === 'string') {
        headers.Authorization = `Bearer ${stored.accessToken}`;
      }
      const cleanPath = req.path.startsWith('/') ? req.path : `/${req.path}`;
      const response = await fetchBackend(`${cfg.apiBaseUrl}/api${cleanPath}`, { headers });
      if (!response) {
        return { ok: false, canceled: false, error: `Сервер UzBite (${cfg.apiBaseUrl}) недоступен.` };
      }
      if (!response.ok) {
        const text = await response.text();
        let message = `Ошибка загрузки (${response.status})`;
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          if (parsed.error?.message) message = parsed.error.message;
        } catch {
          /* Ignore parse failure */
        }
        return { ok: false, canceled: false, error: message };
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = extname(req.defaultFileName).replace('.', '') || 'xlsx';
      const saveResult = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: req.defaultFileName,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { ok: false, canceled: true };
      }
      writeFileSync(saveResult.filePath, buffer);
      return { ok: true, canceled: false, filePath: saveResult.filePath };
    },
  );

  ipcMain.handle(
    'uzbite:dialog:openFile',
    async (event, req: { kind: 'spreadsheet' | 'image' | 'video' }) => {
      assertTrustedSender(event);
      const filters =
        req.kind === 'spreadsheet'
          ? [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv'] }]
          : req.kind === 'image'
            ? [{ name: 'Изображения', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
            : [{ name: 'Видео', extensions: ['mp4', 'webm', 'mov'] }];

      const res = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile'],
        filters,
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      const chosen = res.filePaths[0]!;
      const stat = statSync(chosen);
      const maxSize = req.kind === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (stat.size > maxSize) {
        throw new Error('Выбранный файл превышает допустимый размер');
      }
      const ext = extname(chosen).toLowerCase();
      const mimeType =
        ext === '.xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : ext === '.csv'
            ? 'text/csv'
            : MIME_MAP[ext] ?? 'application/octet-stream';
      const buffer = readFileSync(chosen);
      return {
        fileName: chosen.split(/[\\/]/).pop() || 'file',
        size: stat.size,
        mimeType,
        base64: buffer.toString('base64'),
      };
    },
  );

  ipcMain.handle('uzbite:shell:openYandexMap', async (event, url: string) => {
    assertTrustedSender(event);
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      !['yandex.ru', 'yandex.uz', 'yandex.com'].includes(parsed.hostname) ||
      !parsed.pathname.startsWith('/maps')
    ) {
      throw new Error('Разрешены только ссылки Яндекс Карт');
    }
    await shell.openExternal(parsed.toString());
    return true;
  });

  ipcMain.handle('uzbite:notify', (event, payload: { title: string; body: string }) => {
    assertTrustedSender(event);
    if (Notification.isSupported()) {
      new Notification({
        title: String(payload.title || 'UzBite Restaurant').slice(0, 80),
        body: String(payload.body || '').slice(0, 140),
        icon: existsSync(iconPng) ? iconPng : undefined,
      }).show();
    }
    return true;
  });

  const useDevServer = process.env.DESKTOP_DEV === '1' || !existsSync(distIndex);
  const startUrl = useDevServer ? devRendererUrl : await startStaticRendererServer();
  activeAppOrigin = new URL(startUrl).origin;
  createWindow(startUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl);
  });
});

app.on('window-all-closed', () => {
  staticServer?.close();
  if (process.platform !== 'darwin') app.quit();
});
