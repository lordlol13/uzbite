import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, '..');
const require = createRequire(import.meta.url);
const rendererUrl = 'http://127.0.0.1:8082';

async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureRenderer() {
  if (await isUp(rendererUrl)) return null;
  const viteBin = resolve(desktopRoot, '../../node_modules/vite/bin/vite.js');
  const proc = spawn(process.execPath, [viteBin, '--port', '8082', '--strictPort'], {
    cwd: desktopRoot,
    stdio: 'inherit',
  });
  let exitedCode = null;
  proc.once('exit', code => {
    exitedCode = code ?? 1;
  });
  for (let i = 0; i < 120; i++) {
    if (await isUp(rendererUrl)) return proc;
    if (exitedCode !== null) {
      throw new Error(`Business Vite dev server exited early with code ${exitedCode}. Check if port 8082 is occupied.`);
    }
    await new Promise(r => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('Business Vite dev server did not respond on http://127.0.0.1:8082 within 30s.');
}

function findElectronBinary() {
  if (process.env.ELECTRON_PATH && existsSync(process.env.ELECTRON_PATH)) {
    return process.env.ELECTRON_PATH;
  }
  try {
    const mod = require('electron');
    if (typeof mod === 'string' && existsSync(mod)) return mod;
  } catch {
    /* Electron package not installed locally; fallback to native desktop app window. */
  }
  return null;
}

function findWindowsBrowserApp() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find(p => existsSync(p)) ?? null;
}

const viteProc = await ensureRenderer();
const electronBin = findElectronBinary();

if (electronBin) {
  const child = spawn(electronBin, [resolve(here, 'main.mjs')], {
    cwd: desktopRoot,
    env: { ...process.env, DESKTOP_DEV: '1', DESKTOP_RENDERER_URL: rendererUrl },
    stdio: 'inherit',
  });
  child.on('exit', code => {
    viteProc?.kill();
    process.exit(code ?? 0);
  });
} else {
  const browserBin = process.platform === 'win32' ? findWindowsBrowserApp() : null;
  if (browserBin) {
    console.log(`Launching UzBite Business desktop window via ${browserBin}`);
    const child = spawn(browserBin, [`--app=${rendererUrl}`, '--window-size=1440,920'], {
      detached: false,
      stdio: 'ignore',
    });
    child.on('exit', () => {
      viteProc?.kill();
      process.exit(0);
    });
  } else {
    console.log(`UzBite Business desktop UI running at ${rendererUrl}`);
  }
}
