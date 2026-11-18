import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import { checkBackendHealth, runAutoBootstrap, saveRuntimeConfig } from './bootstrap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const initialApiBase = (process.env.BUSINESS_API_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');
const rendererUrl = process.env.DESKTOP_RENDERER_URL || 'http://127.0.0.1:8082';
const distIndex = resolve(here, '../dist/index.html');
const windowIconPath = process.platform === 'win32'
  ? resolve(here, '../build/icon.ico')
  : resolve(here, '../build/icon.png');

let activeApiBase = initialApiBase;

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

function buildBootstrapHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>UzBite Business — Запуск</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    @keyframes cardEnter {
      from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.985); }
      to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
    }
    @keyframes badgePulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(17, 17, 17, 0.14); }
      50% { box-shadow: 0 0 0 8px rgba(17, 17, 17, 0); }
    }
    @keyframes barShimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(220%); }
    }
    @keyframes dotBounce {
      0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-2px); }
    }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(circle at 20% 20%, #ffffff 0%, #f5f5f2 55%, #ecece6 100%);
      color: #111111;
    }
    .card {
      width: min(520px, 92vw); background: #ffffff; border: 1px solid #e5e5e0;
      border-radius: 20px; padding: 30px 32px;
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
      animation: cardEnter 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .brand { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
    .brand-left { display: flex; align-items: center; gap: 13px; }
    .badge {
      width: 42px; height: 42px; border-radius: 12px; background: #111111; color: #ffffff;
      display: grid; place-items: center; flex-shrink: 0;
      animation: badgePulse 2.4s ease-in-out infinite;
    }
    .step-pill {
      font-size: 11.5px; font-weight: 600; color: #555550; background: #f3f3ef;
      border: 1px solid #e6e6df; border-radius: 999px; padding: 4px 10px;
      white-space: nowrap; transition: background-color 200ms ease, color 200ms ease;
    }
    .step-pill.is-error { background: #fff1f0; border-color: #ffccc7; color: #a8071a; }
    h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    .sub { color: #666660; font-size: 13px; margin-top: 2px; }
    .status-row { display: flex; align-items: center; gap: 8px; margin: 14px 0 6px; }
    .title { font-size: 15px; font-weight: 600; transition: opacity 180ms ease; }
    .dots { display: inline-flex; gap: 3px; align-items: center; }
    .dots.hidden { display: none; }
    .dots span {
      width: 4px; height: 4px; border-radius: 50%; background: #111111;
      animation: dotBounce 1.2s ease-in-out infinite;
    }
    .dots span:nth-child(2) { animation-delay: 0.16s; }
    .dots span:nth-child(3) { animation-delay: 0.32s; }
    .detail {
      font-size: 12px; color: #5f5f59; font-family: Consolas, "Cascadia Mono", monospace;
      min-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .bar-wrap {
      position: relative; width: 100%; height: 8px; border-radius: 999px; background: #ecece6;
      overflow: hidden; margin-top: 16px;
    }
    .bar {
      position: relative; height: 100%; width: 10%; background: #111111; border-radius: 999px;
      overflow: hidden; transition: width 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 200ms ease;
    }
    .bar::after {
      content: ""; position: absolute; inset: 0; width: 45%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
      animation: barShimmer 1.4s ease-in-out infinite;
    }
    .bar.is-error { background: #cf1322; }
    .bar.is-error::after { display: none; }
    .actions { display: none; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
    .actions.show { display: flex; }
    button {
      border: 0; border-radius: 10px; padding: 10px 16px; font-size: 13px; font-weight: 600;
      cursor: pointer; background: #111111; color: #ffffff;
      transition: transform 140ms ease, opacity 140ms ease, background-color 140ms ease;
    }
    button:hover { opacity: 0.92; transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    button.secondary { background: #ecece6; color: #111111; }
    button.hidden { display: none; }
    .error {
      display: none; margin-top: 14px; padding: 11px 13px; border-radius: 10px;
      background: #fff1f0; border: 1px solid #ffccc7; color: #a8071a; font-size: 12.5px;
      white-space: pre-wrap; word-break: break-word; max-height: 150px; overflow-y: auto;
    }
    .error.show { display: block; }
    @media (prefers-reduced-motion: reduce) {
      .card, .badge, .bar::after, .dots span { animation: none !important; }
      .bar, button { transition: none !important; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-left">
        <div class="badge" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="3.5" height="9" rx="1" fill="currentColor" />
            <rect x="10.25" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
            <rect x="16.5" y="8" width="3.5" height="11" rx="1" fill="currentColor" />
            <rect x="4" y="17" width="16" height="2" rx="1" fill="currentColor" />
          </svg>
        </div>
        <div>
          <h1>UzBite Business</h1>
          <div class="sub">Аналитика и AI-финансовый аудит</div>
        </div>
      </div>
      <div id="stepPill" class="step-pill">Запуск</div>
    </div>
    <div class="status-row">
      <div id="title" class="title">Подготовка окружения и запуск сервисов</div>
      <div id="dots" class="dots" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>
    <div id="detail" class="detail">Инициализация локальных сервисов...</div>
    <div class="bar-wrap"><div id="bar" class="bar"></div></div>
    <div id="error" class="error"></div>
    <div id="actions" class="actions">
      <button id="pickBtn" type="button" class="hidden">Выбрать папку проекта UzBite Business</button>
      <button id="retryBtn" type="button">Повторить запуск</button>
      <button id="logsBtn" type="button" class="secondary">Открыть папку логов</button>
    </div>
  </div>
  <script>
    const titleEl = document.getElementById('title');
    const detailEl = document.getElementById('detail');
    const barEl = document.getElementById('bar');
    const errEl = document.getElementById('error');
    const actionsEl = document.getElementById('actions');
    const pickBtn = document.getElementById('pickBtn');
    const retryBtn = document.getElementById('retryBtn');
    const logsBtn = document.getElementById('logsBtn');
    const stepPillEl = document.getElementById('stepPill');
    const dotsEl = document.getElementById('dots');

    if (window.uzbite?.bootstrap) {
      window.uzbite.bootstrap.onProgress(p => {
        if (p.error) {
          titleEl.textContent = p.title || 'Не удалось запустить сервисы';
          errEl.textContent = p.error;
          errEl.classList.add('show');
          actionsEl.classList.add('show');
          pickBtn.classList.add('hidden');
          barEl.classList.add('is-error');
          stepPillEl.textContent = 'Ошибка';
          stepPillEl.classList.add('is-error');
          dotsEl.classList.add('hidden');
          return;
        }
        errEl.classList.remove('show');
        barEl.classList.remove('is-error');
        stepPillEl.classList.remove('is-error');
        dotsEl.classList.remove('hidden');

        if (p.needsWorkspace) {
          titleEl.textContent = 'Укажите папку проекта UzBite Business';
          detailEl.textContent = 'Нужна папка с apps/backend и prisma/schema.prisma';
          actionsEl.classList.add('show');
          pickBtn.classList.remove('hidden');
          barEl.style.width = '20%';
          stepPillEl.textContent = 'Настройка';
          dotsEl.classList.add('hidden');
          return;
        }

        actionsEl.classList.remove('show');
        pickBtn.classList.add('hidden');
        if (p.step && p.total) {
          stepPillEl.textContent = 'Шаг ' + p.step + ' / ' + p.total;
          barEl.style.width = Math.max(10, Math.min(100, Math.round((p.step / p.total) * 100))) + '%';
        }
        if (p.title) titleEl.textContent = p.title;
        if (p.detail !== undefined) detailEl.textContent = p.detail || '';
      });
      pickBtn.addEventListener('click', () => window.uzbite.bootstrap.pickWorkspace());
      retryBtn.addEventListener('click', () => window.uzbite.bootstrap.retry());
      logsBtn.addEventListener('click', () => window.uzbite.bootstrap.openLogs());
    }
  </script>
</body>
</html>`;
}

let mainWindow = null;
let activeShutdown = null;
let bootstrapRunning = false;

function loadMainApp(win) {
  if (win.isDestroyed()) return;
  const loadDevUrl = process.env.DESKTOP_DEV === '1' || !existsSync(distIndex);
  let loadAttempts = 0;
  win.webContents.removeAllListeners('did-fail-load');
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
}

async function startWithBootstrap(win) {
  if (bootstrapRunning || win.isDestroyed()) return;
  bootstrapRunning = true;
  try {
    const initial = await checkBackendHealth(activeApiBase);
    if (initial.ok && initial.databaseConnected) {
      loadMainApp(win);
      return;
    }

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildBootstrapHtml())}`);
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }

    const result = await runAutoBootstrap({
      apiBase: initialApiBase,
      userDataDir: app.getPath('userData'),
      appPath: app.getAppPath(),
      execPath: process.execPath,
      resourcesPath: process.resourcesPath,
      onProgress: payload => {
        if (!win.isDestroyed()) {
          win.webContents.send('uzbite:bootstrap:progress', payload);
        }
      },
    });
    activeShutdown = result.shutdown;
    if (result.apiBase) {
      activeApiBase = result.apiBase.replace(/\/$/, '');
    }

    if (result.needsWorkspace) {
      if (!win.isDestroyed()) {
        win.webContents.send('uzbite:bootstrap:progress', { needsWorkspace: true });
      }
      return;
    }
    if (result.ready) {
      loadMainApp(win);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!win.isDestroyed()) {
      win.webContents.send('uzbite:bootstrap:progress', {
        title: 'Ошибка автоматического запуска',
        error: message,
      });
    }
  } finally {
    bootstrapRunning = false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'UzBite Business — Analytics & AI Financial Audit',
    backgroundColor: '#f7f7f5',
    icon: existsSync(windowIconPath) ? windowIconPath : undefined,
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
  }, 1500);

  mainWindow = win;
  void startWithBootstrap(win);
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

  ipcMain.handle('uzbite:bootstrap:pick-workspace', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите папку проекта UzBite Business',
      properties: ['openDirectory'],
    });
    if (picked.canceled || !picked.filePaths[0]) return false;
    saveRuntimeConfig(app.getPath('userData'), { workspaceRoot: picked.filePaths[0] });
    void startWithBootstrap(mainWindow);
    return true;
  });

  ipcMain.handle('uzbite:bootstrap:retry', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      void startWithBootstrap(mainWindow);
    }
    return true;
  });

  ipcMain.handle('uzbite:bootstrap:open-logs', async () => {
    const dir = app.getPath('userData');
    mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
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

    const url = `${activeApiBase}/api${req.path.startsWith('/') ? req.path : `/${req.path}`}`;
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
            message: `Сервер UzBite (${activeApiBase}) недоступен. Перезапустите приложение.`,
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

let isQuitting = false;
app.on('will-quit', event => {
  if (activeShutdown && !isQuitting) {
    event.preventDefault();
    isQuitting = true;
    void Promise.resolve(activeShutdown()).finally(() => {
      activeShutdown = null;
      app.quit();
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
