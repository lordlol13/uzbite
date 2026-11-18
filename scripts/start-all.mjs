import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { startLocalPostgres } from './local-postgres.mjs';

const root = resolve(import.meta.dirname, '..');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function log(step, message) {
  console.log(`[UzBite] [${step}] ${message}`);
}

function runSync(cmd, args) {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/c', cmd, ...args], {
      cwd: root,
      stdio: 'inherit',
    });
    return;
  }
  execFileSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
  });
}

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise(resolveOpen => {
    const socket = createConnection({ host, port });
    const done = result => {
      socket.removeAllListeners();
      socket.destroy();
      resolveOpen(result);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function fetchJson(url, options) {
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function isHttpUp(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(fn, timeoutMs, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

function launchWindowsWindow(title, command, minimized = true) {
  const wrapped = `${command} || (echo. & echo [UzBite] Process exited with an error. & pause)`;
  const startArgs = ['/d', '/c', 'start', title];
  if (minimized) startArgs.push('/min');
  startArgs.push('cmd.exe', '/c', wrapped);
  const child = spawn('cmd.exe', startArgs, {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

function launchWindowsExe(exePath) {
  const child = spawn(exePath, [], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

async function ensureEnvironmentAndBuilds(apiAlreadyUp) {
  log('1/6', 'Checking .env, dependencies, and build artifacts...');

  if (!existsSync(resolve(root, '.env'))) {
    log('1/6', 'Creating local .env via scripts/setup-local.mjs...');
    runSync(process.execPath, [resolve(root, 'scripts/setup-local.mjs')]);
  }
  loadEnv({ path: resolve(root, '.env'), quiet: true });

  if (!apiAlreadyUp) {
    if (!existsSync(resolve(root, 'node_modules/.prisma/client'))) {
      log('1/6', 'Generating Prisma Client...');
      runSync(npxBin, ['prisma', 'generate']);
    }

    const requiredDist = [
      'apps/backend/dist/index.js',
      'apps/desktop/dist/index.html',
      'apps/restaurant-desktop/dist/index.html',
      'apps/restaurant-desktop/dist-electron/main.js',
      'packages/finance-mcp/dist/index.js',
    ];
    if (requiredDist.some(rel => !existsSync(resolve(root, rel)))) {
      log('1/6', 'Building workspaces...');
      runSync(npmBin, ['run', 'build']);
    }
  }
}

async function ensureDatabaseReady(apiAlreadyUp) {
  log('2/6', 'Checking local PostgreSQL (127.0.0.1:5432)...');
  const pgUp = await isPortOpen(5432);
  if (!pgUp) {
    log('2/6', 'Starting embedded PostgreSQL...');
    await startLocalPostgres();
  } else {
    log('2/6', 'PostgreSQL is already running on 127.0.0.1:5432.');
  }

  log('3/6', 'Checking Prisma migrations and demo data...');
  if (!apiAlreadyUp) {
    runSync(npxBin, ['prisma', 'migrate', 'deploy']);
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const [restaurants, expenses] = await Promise.all([
        prisma.restaurant.count(),
        prisma.expense.count(),
      ]);
      if (restaurants === 0 || expenses === 0) {
        log('3/6', 'Database is empty — seeding demo catalog and analytics...');
        await prisma.$disconnect();
        runSync(npmBin, ['run', 'db:seed']);
      } else {
        log('3/6', `Database ready (${restaurants} restaurants, ${expenses} expenses).`);
      }
    } finally {
      await prisma.$disconnect();
    }
  } else {
    const restaurants = await fetchJson('http://127.0.0.1:8081/api/restaurants');
    const items = restaurants.data?.data?.items;
    const count = Array.isArray(items)
      ? items.length
      : Number(restaurants.data?.data?.total ?? 0);
    if (count === 0) {
      log('3/6', 'Seeding demo catalog and analytics...');
      runSync(npmBin, ['run', 'db:seed']);
    } else {
      log('3/6', `Database already seeded (${count} restaurants active).`);
    }
  }
}

async function ensureBackendRunning(apiAlreadyUp) {
  log('4/6', 'Checking Backend API + Socket.IO (http://127.0.0.1:8081)...');
  if (apiAlreadyUp) {
    log('4/6', 'Backend API is already running on http://127.0.0.1:8081.');
    return;
  }

  if (await isPortOpen(8081)) {
    const recovered = await waitFor(async () => {
      const health = await fetchJson('http://127.0.0.1:8081/api/health');
      return health.ok && health.data?.data?.database === 'connected';
    }, 5_000);
    if (recovered) {
      log('4/6', 'Backend API is ready on http://127.0.0.1:8081.');
      return;
    }
    throw new Error('Port 8081 is already occupied by an unhealthy or unrelated process. Stop it and retry.');
  }

  launchWindowsWindow('UzBite Backend Server (keep open)', 'npm run dev:server', true);
  const ok = await waitFor(async () => {
    const health = await fetchJson('http://127.0.0.1:8081/api/health');
    return health.ok && health.data?.data?.database === 'connected';
  }, 90_000);

  if (!ok) {
    throw new Error('Backend API did not become healthy on http://127.0.0.1:8081/api/health within 90s.');
  }
  log('4/6', 'Backend API is ready.');
}

async function launchBusinessDesktop() {
  log('5/6', 'Starting UzBite Business (Analytics & AI Financial Controller)...');
  const alreadyUp = await isHttpUp('http://127.0.0.1:8082');
  launchWindowsWindow('UzBite Business Desktop', 'npm run desktop -w @uzbite/desktop', true);
  if (!alreadyUp) {
    const ok = await waitFor(() => isHttpUp('http://127.0.0.1:8082'), 45_000);
    if (!ok) {
      throw new Error('UzBite Business UI did not respond on http://127.0.0.1:8082 within 45s.');
    }
  }
  log('5/6', 'UzBite Business Desktop launched (http://127.0.0.1:8082).');
}

function isRestaurantProcessRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync(
      'tasklist',
      ['/FI', 'IMAGENAME eq UzBite Restaurant.exe', '/NH'],
      { encoding: 'utf8', windowsHide: true },
    );
    return out.includes('UzBite Restaurant.exe');
  } catch {
    return false;
  }
}

async function launchRestaurantDesktop() {
  log('6/6', 'Starting UzBite Restaurant Desktop...');
  const unpackedExe = resolve(root, 'apps/restaurant-desktop/release/win-unpacked/UzBite Restaurant.exe');
  const portableExe = resolve(root, 'apps/restaurant-desktop/release/UzBite-Restaurant-1.0.0-portable.exe');

  if (existsSync(unpackedExe)) {
    launchWindowsExe(unpackedExe);
    const up = await waitFor(() => isHttpUp('http://127.0.0.1:18083'), 25_000);
    if (!up && !isRestaurantProcessRunning()) {
      throw new Error('UzBite Restaurant.exe failed to stay running or listen on http://127.0.0.1:18083.');
    }
    log('6/6', 'UzBite Restaurant.exe launched (http://127.0.0.1:18083).');
    return;
  }
  if (existsSync(portableExe)) {
    launchWindowsExe(portableExe);
    const up = await waitFor(() => isHttpUp('http://127.0.0.1:18083'), 35_000);
    if (!up && !isRestaurantProcessRunning()) {
      throw new Error('UzBite-Restaurant-1.0.0-portable.exe failed to start within 35s.');
    }
    log('6/6', 'UzBite-Restaurant-portable.exe launched.');
    return;
  }

  launchWindowsWindow('UzBite Restaurant Desktop', 'npm run desktop:restaurant', true);
  const devUp = await waitFor(() => isHttpUp('http://127.0.0.1:8083'), 45_000);
  if (!devUp) {
    throw new Error('UzBite Restaurant Vite dev server did not respond on http://127.0.0.1:8083 within 45s.');
  }
  log('6/6', 'UzBite Restaurant Electron dev launched (http://127.0.0.1:8083).');
}

async function verifyAllSystems() {
  const health = await fetchJson('http://127.0.0.1:8081/api/health');
  const bizLogin = await fetchJson('http://127.0.0.1:8081/api/business/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demo: true }),
  });
  const restLogin = await fetchJson('http://127.0.0.1:8081/api/restaurant-account/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demo: true }),
  });

  let toolsCount = 0;
  const token = bizLogin.data?.data?.accessToken;
  const restaurantId = bizLogin.data?.data?.user?.restaurantId;
  if (token && restaurantId) {
    const tools = await fetchJson('http://127.0.0.1:8081/api/business/agent/tools', {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restaurant-Id': restaurantId,
      },
    });
    toolsCount = Array.isArray(tools.data?.data) ? tools.data.data.length : 0;
  }

  console.log('');
  console.log('============================================================');
  console.log('  UzBite Platform — ALL SYSTEMS RUNNING');
  console.log('============================================================');
  console.log(`  PostgreSQL : 127.0.0.1:5432 (${health.data?.data?.database ?? 'unknown'})`);
  console.log(`  Backend API: http://127.0.0.1:8081 (health=${health.status})`);
  console.log(`  Business UI: http://127.0.0.1:8082 + Electron Window`);
  console.log(`  Restaurant : UzBite Restaurant Desktop Window`);
  console.log(`  AI & MCP   : ${toolsCount} financial tools active (packages/finance-mcp/dist/index.js)`);
  console.log(`  Demo Auth  : owner@uzbite.uz / UzBiteBusiness2026! (Business=${bizLogin.ok ? 'OK' : 'ERR'}, Restaurant=${restLogin.ok ? 'OK' : 'ERR'})`);
  console.log('============================================================');
  console.log('');
}

async function main() {
  const initialHealth = await fetchJson('http://127.0.0.1:8081/api/health');
  const apiAlreadyUp = initialHealth.ok && initialHealth.data?.data?.database === 'connected';

  await ensureEnvironmentAndBuilds(apiAlreadyUp);
  await ensureDatabaseReady(apiAlreadyUp);
  await ensureBackendRunning(apiAlreadyUp);
  await launchBusinessDesktop();
  await launchRestaurantDesktop();
  await verifyAllSystems();
}

main().catch(error => {
  console.error('[UzBite] Startup failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
