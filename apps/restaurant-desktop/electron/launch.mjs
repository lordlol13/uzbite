import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, '..');
const require = createRequire(import.meta.url);
const rendererUrl = 'http://127.0.0.1:8083';

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
  const proc = spawn(process.execPath, [viteBin, '--port', '8083', '--strictPort'], {
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
      throw new Error(`Restaurant Vite dev server exited early with code ${exitedCode}. Check if port 8083 is occupied.`);
    }
    await new Promise(r => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('Restaurant Vite dev server did not respond on http://127.0.0.1:8083 within 30s.');
}

const viteProc = await ensureRenderer();
let electronBin = process.env.ELECTRON_PATH;
if (!electronBin || !existsSync(electronBin)) {
  const mod = require('electron');
  electronBin = typeof mod === 'string' ? mod : null;
}

if (!electronBin || !existsSync(electronBin)) {
  console.error('Electron binary not found. Run: node node_modules/electron/install.js');
  viteProc?.kill();
  process.exit(1);
}

const child = spawn(electronBin, [resolve(desktopRoot, 'dist-electron/main.js')], {
  cwd: desktopRoot,
  env: { ...process.env, DESKTOP_DEV: '1', DESKTOP_RENDERER_URL: rendererUrl },
  stdio: 'inherit',
});

child.on('exit', code => {
  viteProc?.kill();
  process.exit(code ?? 0);
});
