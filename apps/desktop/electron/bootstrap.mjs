import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function isLoopbackPortOpen(port, host = '127.0.0.1', timeoutMs = 800) {
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

function findFreeLoopbackPort(preferredPorts = [], host = '127.0.0.1') {
  const tryPort = port =>
    new Promise(resolvePort => {
      const server = createServer();
      server.unref();
      server.once('error', () => resolvePort(null));
      server.listen(port, host, () => {
        const addr = server.address();
        const boundPort = typeof addr === 'object' && addr ? addr.port : port;
        server.close(() => resolvePort(boundPort));
      });
    });

  return (async () => {
    for (const candidate of preferredPorts) {
      const port = await tryPort(candidate);
      if (port) return port;
    }
    const ephemeral = await tryPort(0);
    if (!ephemeral) {
      throw new Error('Could not allocate an open local TCP port.');
    }
    return ephemeral;
  })();
}

export async function checkBackendHealth(apiBase) {
  try {
    const res = await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(2000) });
    const json = await res.json().catch(() => null);
    return {
      ok: res.ok,
      databaseConnected: json?.data?.database === 'connected',
      payload: json,
    };
  } catch {
    return { ok: false, databaseConnected: false, payload: null };
  }
}

function isValidWorkspaceRoot(dir) {
  if (!dir) return false;
  try {
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) return false;
    if (!existsSync(join(dir, 'apps', 'backend', 'package.json'))) return false;
    if (!existsSync(join(dir, 'prisma', 'schema.prisma'))) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg?.name === 'uzbite-business' || pkg?.name === 'uzbite';
  } catch {
    return false;
  }
}

function isValidBundledRuntime(dir) {
  if (!dir) return false;
  return (
    existsSync(join(dir, 'apps', 'backend', 'dist', 'index.js')) &&
    existsSync(join(dir, 'prisma', 'schema.prisma')) &&
    existsSync(join(dir, 'prisma', 'seed.mjs')) &&
    existsSync(join(dir, 'scripts', 'local-postgres.mjs')) &&
    existsSync(join(dir, 'node_modules', '@prisma', 'client')) &&
    existsSync(join(dir, 'node_modules', '.prisma', 'client'))
  );
}

export function discoverBundledRuntime({ appPath, execPath, resourcesPath }) {
  const candidates = [
    process.env.UZBITE_RUNTIME_DIR,
    resourcesPath ? join(resourcesPath, 'runtime') : null,
    execPath ? join(dirname(execPath), 'resources', 'runtime') : null,
    appPath ? join(appPath, '..', 'runtime') : null,
    appPath ? join(appPath, 'dist-electron', 'runtime') : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (isValidBundledRuntime(resolved)) {
      return resolved;
    }
  }
  return null;
}

export function readRuntimeConfig(userDataDir) {
  const file = join(userDataDir, 'uzbite-runtime.json');
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) || {};
  } catch {
    return {};
  }
}

export function saveRuntimeConfig(userDataDir, patch) {
  const file = join(userDataDir, 'uzbite-runtime.json');
  mkdirSync(userDataDir, { recursive: true });
  const next = { ...readRuntimeConfig(userDataDir), ...patch };
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function discoverWorkspaceRoot({ userDataDir, appPath, execPath, resourcesPath }) {
  const config = readRuntimeConfig(userDataDir);
  const candidates = [];

  if (process.env.UZBITE_ROOT) candidates.push(process.env.UZBITE_ROOT);
  if (config.workspaceRoot) candidates.push(config.workspaceRoot);

  const seeds = [process.cwd(), dirname(execPath), appPath, resourcesPath].filter(Boolean);
  for (const seed of seeds) {
    let curr = resolve(seed);
    for (let i = 0; i < 7; i++) {
      candidates.push(curr);
      const parent = dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
  }

  const home = homedir();
  candidates.push(
    join(home, 'Desktop', 'Uzbite-main'),
    join(home, 'Desktop', 'Uzbite'),
    join(home, 'Desktop', 'UzBite-Business'),
    join(home, 'Projects', 'Uzbite-main'),
    join(home, 'Projects', 'Uzbite'),
    join(home, 'Documents', 'Uzbite-main'),
  );

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (isValidWorkspaceRoot(resolved)) {
      return resolved;
    }
  }
  return null;
}

function findToolOnWindows(exeName) {
  const pathDirs = (process.env.PATH || '').split(';').filter(Boolean);
  const extraDirs = [
    'C:\\Program Files\\nodejs',
    'C:\\Program Files (x86)\\nodejs',
    join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
    join(process.env.APPDATA || '', 'npm'),
  ];

  const fnmVersionsDir = join(process.env.APPDATA || '', 'fnm', 'node-versions');
  if (existsSync(fnmVersionsDir)) {
    try {
      for (const entry of readdirSync(fnmVersionsDir)) {
        extraDirs.push(join(fnmVersionsDir, entry, 'installation'));
      }
    } catch {
      /* ignore */
    }
  }
  const nvmDir = process.env.NVM_HOME || join(process.env.APPDATA || '', 'nvm');
  if (existsSync(nvmDir)) {
    try {
      for (const entry of readdirSync(nvmDir)) {
        if (entry.startsWith('v')) extraDirs.push(join(nvmDir, entry));
      }
    } catch {
      /* ignore */
    }
  }

  for (const dir of [...pathDirs, ...extraDirs]) {
    if (!dir) continue;
    const full = join(dir, exeName);
    if (existsSync(full)) return full;
  }
  return null;
}

async function resolveNodeRunner({ mode, execPath }) {
  // In bundled mode, Electron itself (with ELECTRON_RUN_AS_NODE=1) guarantees the exact Node 22+ ABI/ESM runtime
  // even when Node.js is absent or an older Node version is installed on the target Windows PC.
  if (mode === 'bundled' && execPath && existsSync(execPath)) {
    return {
      bin: execPath,
      extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  const systemNode = process.platform === 'win32' ? findToolOnWindows('node.exe') : findToolOnUnix('node');
  if (systemNode) {
    try {
      const { stdout } = await execFileAsync(systemNode, ['-p', 'process.versions.node.split(".")[0]'], {
        windowsHide: true,
        timeout: 3000,
      });
      const major = Number(stdout.trim());
      if (Number.isFinite(major) && major >= 22) {
        return { bin: systemNode, extraEnv: {} };
      }
    } catch {
      /* fall back to Electron runtime */
    }
  }

  if (execPath && existsSync(execPath)) {
    return {
      bin: execPath,
      extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  throw new Error('Could not find a compatible Node.js runtime.');
}

function findToolOnUnix(exeName) {
  const pathDirs = (process.env.PATH || '').split(':').filter(Boolean);
  for (const dir of [...pathDirs, '/usr/local/bin', '/opt/homebrew/bin']) {
    const full = join(dir, exeName);
    if (existsSync(full)) return full;
  }
  return null;
}

function runNodeScript(nodeRunner, scriptArgs, cwd, env, onLog) {
  return new Promise((resolveCmd, rejectCmd) => {
    const child = spawn(nodeRunner.bin, scriptArgs, {
      cwd,
      env: { ...env, ...nodeRunner.extraEnv },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const outputTail = [];
    const forward = chunk => {
      const lines = chunk
        .toString('utf8')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      for (const line of lines) {
        outputTail.push(line);
        if (outputTail.length > 20) outputTail.shift();
      }
      for (const line of lines.slice(-3)) onLog?.(line);
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    child.on('error', rejectCmd);
    child.on('exit', code => {
      if (code === 0) resolveCmd();
      else {
        const tailText = outputTail.slice(-5).join('\n');
        rejectCmd(new Error(`Process exited with code ${code}${tailText ? `:\n${tailText}` : ''}`));
      }
    });
  });
}

function runNpmCommand(npmBin, args, cwd, env, onLog) {
  return new Promise((resolveCmd, rejectCmd) => {
    const isWin = process.platform === 'win32';
    const spawnCmd = isWin ? 'cmd.exe' : npmBin;
    const spawnArgs = isWin ? ['/d', '/c', npmBin, ...args] : args;
    const child = spawn(spawnCmd, spawnArgs, {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const forward = chunk => {
      const lines = chunk
        .toString('utf8')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      for (const line of lines.slice(-3)) onLog?.(line);
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    child.on('error', rejectCmd);
    child.on('exit', code => {
      if (code === 0) resolveCmd();
      else rejectCmd(new Error(`${npmBin} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function parseEnvFile(envPath) {
  const out = {};
  if (!existsSync(envPath)) return out;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function writeEnvFile(envPath, vars) {
  mkdirSync(dirname(envPath), { recursive: true });
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v ?? ''}`);
  writeFileSync(envPath, `${lines.join('\n')}\n`, 'utf8');
}

function ensureStandaloneEnvFile(envPath, { pgPort = 5432, apiPort = 8081 } = {}) {
  const existing = parseEnvFile(envPath);
  const password = randomBytes(24).toString('hex');
  const defaults = {
    DATABASE_URL: `postgresql://uzbite:${password}@127.0.0.1:${pgPort}/uzbite?schema=public`,
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_SECRET: randomBytes(48).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    HOST: '127.0.0.1',
    PORT: String(apiPort),
    // Use development mode in standalone desktop so rate limiting falls back to memory without requiring Redis.
    NODE_ENV: 'development',
    ALLOWED_ORIGINS: 'http://localhost:8082,http://127.0.0.1:8082',
    UZBITE_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'gemini-2.5-flash',
    COARENA_API_KEY: '',
    COARENA_BASE_URL: 'https://coarena.ai/api/v1',
    COARENA_MODEL: 'gemini-3-8-flash',
  };

  let changed = !existsSync(envPath);
  const merged = { ...defaults, ...existing };
  if (!merged.JWT_SECRET || merged.JWT_SECRET.length < 32) {
    merged.JWT_SECRET = defaults.JWT_SECRET;
    changed = true;
  }
  if (!merged.JWT_REFRESH_SECRET || merged.JWT_REFRESH_SECRET.length < 32) {
    merged.JWT_REFRESH_SECRET = defaults.JWT_REFRESH_SECRET;
    changed = true;
  }
  if (!merged.DATABASE_URL) {
    merged.DATABASE_URL = defaults.DATABASE_URL;
    changed = true;
  }
  if (!merged.ALLOWED_ORIGINS) {
    merged.ALLOWED_ORIGINS = defaults.ALLOWED_ORIGINS;
    changed = true;
  }
  if (changed) {
    writeEnvFile(envPath, merged);
  }
  return merged;
}

function isOurEmbeddedPostgresRunning(pgCtl, pgDataDir) {
  if (process.platform !== 'win32' || !existsSync(pgCtl) || !existsSync(join(pgDataDir, 'PG_VERSION'))) {
    return false;
  }
  try {
    execFileSyncWorkaround(pgCtl, ['status', '-D', pgDataDir]);
    return true;
  } catch {
    return false;
  }
}

function execFileSyncWorkaround(cmd, args) {
  // Use synchronous check via spawnSync-like pattern only when needed; async variant below is preferred.
  throw new Error(`Use async check for ${cmd} ${args.join(' ')}`);
}

async function checkOurPostgresRunning(pgCtl, pgDataDir) {
  if (process.platform !== 'win32' || !existsSync(pgCtl) || !existsSync(join(pgDataDir, 'PG_VERSION'))) {
    return false;
  }
  try {
    await execFileAsync(pgCtl, ['status', '-D', pgDataDir], { windowsHide: true, timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

void isOurEmbeddedPostgresRunning;
void execFileSyncWorkaround;

export async function runAutoBootstrap({
  apiBase,
  userDataDir,
  appPath,
  execPath,
  resourcesPath,
  onProgress,
}) {
  const emit = (step, total, title, detail = '') => {
    onProgress?.({ step, total, title, detail });
  };

  const startedChildren = [];
  let stopping = false;
  let pgShutdownTarget = null;

  const shutdown = async () => {
    stopping = true;
    for (const child of [...startedChildren].reverse()) {
      try {
        if (!child.killed) child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }

    if (
      pgShutdownTarget &&
      process.platform === 'win32' &&
      existsSync(pgShutdownTarget.pgCtl) &&
      existsSync(join(pgShutdownTarget.pgDataDir, 'PG_VERSION'))
    ) {
      try {
        await execFileAsync(
          pgShutdownTarget.pgCtl,
          ['stop', '-D', pgShutdownTarget.pgDataDir, '-m', 'fast', '-w', '-t', '10'],
          { windowsHide: true, timeout: 12_000 },
        );
      } catch {
        /* ignore */
      }
    }

    if (process.platform === 'win32') {
      for (const child of startedChildren) {
        if (child.pid) {
          try {
            await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
          } catch {
            /* ignore */
          }
        }
      }
    }
  };

  const totalSteps = 6;

  // Step 1: Fast path — backend + database already running externally
  emit(1, totalSteps, 'Проверка UzBite Business API...', apiBase);
  const initialHealth = await checkBackendHealth(apiBase);
  if (initialHealth.ok && initialHealth.databaseConnected) {
    return { ready: true, needsWorkspace: false, apiBase, shutdown };
  }

  // Detect bundled standalone runtime first (unless explicitly forced into dev workspace mode)
  const forceWorkspace = process.env.UZBITE_FORCE_DEV_WORKSPACE === '1' || process.env.DESKTOP_DEV === '1';
  const bundledRuntime = discoverBundledRuntime({ appPath, execPath, resourcesPath });
  const workspaceRoot = discoverWorkspaceRoot({ userDataDir, appPath, execPath, resourcesPath });

  let mode = null;
  let runtimeRoot = null;
  if (!forceWorkspace && bundledRuntime) {
    mode = 'bundled';
    runtimeRoot = bundledRuntime;
  } else if (workspaceRoot) {
    mode = 'workspace';
    runtimeRoot = workspaceRoot;
    saveRuntimeConfig(userDataDir, { workspaceRoot });
  } else if (bundledRuntime) {
    mode = 'bundled';
    runtimeRoot = bundledRuntime;
  }

  if (!mode || !runtimeRoot) {
    return { ready: false, needsWorkspace: true, apiBase, shutdown };
  }

  try {
    // Step 2: Resolve embedded/Node runtime & prepare writable state in userDataDir
    emit(2, totalSteps, 'Подготовка локального окружения...', mode === 'bundled' ? 'Автономный режим' : runtimeRoot);
    const nodeRunner = await resolveNodeRunner({ mode, execPath });

  mkdirSync(userDataDir, { recursive: true });
  const envPath = mode === 'bundled' ? join(userDataDir, '.env') : join(runtimeRoot, '.env');
  const pgDataDir = mode === 'bundled' ? join(userDataDir, 'postgres') : join(runtimeRoot, '.local', 'postgres');
  const pgLogFile = mode === 'bundled' ? join(userDataDir, 'postgres.log') : join(runtimeRoot, '.local', 'postgres.log');
  const backendLogFile = join(userDataDir, 'backend.log');

  if (mode === 'workspace') {
    if (!existsSync(join(runtimeRoot, 'node_modules', '@prisma', 'client')) || !existsSync(join(runtimeRoot, 'node_modules', 'express'))) {
      const npmBin = process.platform === 'win32' ? findToolOnWindows('npm.cmd') : findToolOnUnix('npm');
      if (!npmBin) {
        throw new Error('Workspace node_modules are missing and npm was not found. Run npm install in the project folder.');
      }
      emit(2, totalSteps, 'Установка зависимостей проекта...', 'npm install');
      await runNpmCommand(npmBin, ['install'], runtimeRoot, process.env, line =>
        emit(2, totalSteps, 'Установка зависимостей...', line),
      );
    }
    if (!existsSync(join(runtimeRoot, '.env'))) {
      await runNodeScript(nodeRunner, [join(runtimeRoot, 'scripts', 'setup-local.mjs')], runtimeRoot, process.env, line =>
        emit(2, totalSteps, 'Создание .env...', line),
      );
    }
    if (!existsSync(join(runtimeRoot, 'node_modules', '.prisma', 'client'))) {
      const prismaCli = join(runtimeRoot, 'node_modules', 'prisma', 'build', 'index.js');
      await runNodeScript(
        nodeRunner,
        [prismaCli, 'generate', '--schema', join(runtimeRoot, 'prisma', 'schema.prisma')],
        runtimeRoot,
        process.env,
        line => emit(2, totalSteps, 'Генерация Prisma Client...', line),
      );
    }
    if (!existsSync(join(runtimeRoot, 'apps', 'backend', 'dist', 'index.js'))) {
      const npmBin = process.platform === 'win32' ? findToolOnWindows('npm.cmd') : findToolOnUnix('npm');
      if (!npmBin) {
        throw new Error('Backend dist/index.js is missing and npm was not found. Run npm run build.');
      }
      await runNpmCommand(npmBin, ['run', 'build', '-w', '@uzbite/backend'], runtimeRoot, process.env, line =>
        emit(2, totalSteps, 'Сборка backend...', line),
      );
    }
  }

  const parsedApiUrl = new URL(apiBase);
  const preferredApiPort = Number(parsedApiUrl.port || 8081);
  const dotEnv =
    mode === 'bundled'
      ? ensureStandaloneEnvFile(envPath, { pgPort: 5432, apiPort: preferredApiPort })
      : parseEnvFile(envPath);

  let pgHost = '127.0.0.1';
  let pgPort = 5432;
  let dbUrlObj = null;
  try {
    const dbUrlRaw = process.env.DATABASE_URL || dotEnv.DATABASE_URL;
    if (dbUrlRaw) {
      dbUrlObj = new URL(dbUrlRaw);
      pgHost = dbUrlObj.hostname || '127.0.0.1';
      pgPort = Number(dbUrlObj.port || 5432);
    }
  } catch {
    /* fallback 127.0.0.1:5432 */
  }

  // Avoid port conflicts with pre-existing PostgreSQL installations on other PCs in bundled mode.
  const pgCtl = join(runtimeRoot, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin', 'pg_ctl.exe');
  if (mode === 'bundled' && ['127.0.0.1', 'localhost'].includes(pgHost) && dbUrlObj) {
    const oursRunning = await checkOurPostgresRunning(pgCtl, pgDataDir);
    if (!oursRunning && (await isLoopbackPortOpen(pgPort, pgHost))) {
      const freePgPort = await findFreeLoopbackPort([55432, 55433, 55434], pgHost);
      pgPort = freePgPort;
      dbUrlObj.port = String(freePgPort);
      dotEnv.DATABASE_URL = dbUrlObj.toString();
      writeEnvFile(envPath, dotEnv);
    }
  }

  // Pick effective API port (avoid collision if another unrelated service holds 8081 on target PC).
  let effectiveApiHost = parsedApiUrl.hostname || '127.0.0.1';
  let effectiveApiPort = Number(process.env.PORT || dotEnv.PORT || preferredApiPort || 8081);
  let effectiveApiBase = `http://${effectiveApiHost}:${effectiveApiPort}`;

  const recheckHealth = await checkBackendHealth(effectiveApiBase);
  if (recheckHealth.ok && recheckHealth.databaseConnected) {
    return { ready: true, needsWorkspace: false, apiBase: effectiveApiBase, shutdown };
  }
  if (mode === 'bundled' && (await isLoopbackPortOpen(effectiveApiPort, effectiveApiHost))) {
    effectiveApiPort = await findFreeLoopbackPort([18081, 28081, 38081], effectiveApiHost);
    effectiveApiBase = `http://${effectiveApiHost}:${effectiveApiPort}`;
  }

  const runtimeEnv = {
    ...process.env,
    ...dotEnv,
    DATABASE_URL: process.env.DATABASE_URL || dotEnv.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL || dotEnv.REDIS_URL || 'redis://127.0.0.1:6379',
    HOST: mode === 'bundled' ? '127.0.0.1' : process.env.HOST || dotEnv.HOST || '0.0.0.0',
    PORT: String(effectiveApiPort),
    NODE_ENV: mode === 'bundled' ? 'development' : process.env.NODE_ENV || dotEnv.NODE_ENV || 'development',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || dotEnv.ALLOWED_ORIGINS || 'http://localhost:8082,http://127.0.0.1:8082',
    UZBITE_API_BASE_URL: effectiveApiBase,
    UZBITE_ENV_FILE: envPath,
    UZBITE_DATA_DIR: mode === 'bundled' ? userDataDir : join(runtimeRoot, '.local'),
    UZBITE_PG_DATA_DIR: pgDataDir,
    UZBITE_PG_LOG_FILE: pgLogFile,
  };

  // Step 3: Start Embedded PostgreSQL
  emit(3, totalSteps, 'Запуск встроенной базы данных PostgreSQL...', `${pgHost}:${pgPort}`);
  const pgAlreadyOpen = await isLoopbackPortOpen(pgPort, pgHost);
  if (!pgAlreadyOpen) {
    if (!['127.0.0.1', 'localhost'].includes(pgHost)) {
      throw new Error(`PostgreSQL at ${pgHost}:${pgPort} is unreachable.`);
    }
    const pgWrapperLogPath = join(userDataDir, 'postgres-wrapper.log');
    const pgWrapperFd = openSync(pgWrapperLogPath, 'a');
    let pgProc;
    try {
      pgProc = spawn(nodeRunner.bin, [join(runtimeRoot, 'scripts', 'local-postgres.mjs')], {
        cwd: runtimeRoot,
        env: { ...runtimeEnv, ...nodeRunner.extraEnv },
        windowsHide: true,
        stdio: ['ignore', pgWrapperFd, pgWrapperFd],
      });
    } finally {
      closeSync(pgWrapperFd);
    }
    startedChildren.push(pgProc);
    pgShutdownTarget = { pgCtl, pgDataDir };

    let pgExitCode = null;
    pgProc.once('exit', code => {
      pgExitCode = code ?? 1;
    });

    const pgDeadline = Date.now() + 60_000;
    let pgUp = false;
    while (Date.now() < pgDeadline && !stopping) {
      const wrapperText = existsSync(pgWrapperLogPath) ? readFileSync(pgWrapperLogPath, 'utf8') : '';
      if (wrapperText.includes('Local PostgreSQL ready on') && (await isLoopbackPortOpen(pgPort, pgHost))) {
        pgUp = true;
        break;
      }
      if (pgExitCode !== null) {
        throw new Error(`Встроенный PostgreSQL завершился с кодом ${pgExitCode}. Проверьте лог: ${pgLogFile}`);
      }
      await new Promise(r => setTimeout(r, 350));
    }
    if (!pgUp) {
      throw new Error(`PostgreSQL не запустился на ${pgHost}:${pgPort} за 60 секунд.`);
    }
  }

  // Step 4: Apply Prisma migrations without needing npx/npm
  emit(4, totalSteps, 'Применение миграций базы данных...', 'prisma migrate deploy');
  const prismaCli = join(runtimeRoot, 'node_modules', 'prisma', 'build', 'index.js');
  const schemaPath = join(runtimeRoot, 'prisma', 'schema.prisma');
  await runNodeScript(
    nodeRunner,
    [prismaCli, 'migrate', 'deploy', '--schema', schemaPath],
    runtimeRoot,
    runtimeEnv,
    line => emit(4, totalSteps, 'Применение миграций базы данных...', line),
  );

  // Step 5: Seed demo analytics if empty (plain Node JS seed.mjs in bundled mode!)
  emit(5, totalSteps, 'Проверка демонстрационных данных...', 'UzBite Business');
  let needsSeed = false;
  try {
    const checkScriptPath = join(runtimeRoot, 'scripts', 'check-db-empty.mjs');
    const checkArgs = existsSync(checkScriptPath)
      ? [checkScriptPath]
      : [
          '--input-type=module',
          '-e',
          "import { PrismaClient } from '@prisma/client'; const p = new PrismaClient(); try { const [restaurants, expenses] = await Promise.all([p.restaurant.count(), p.expense.count()]); console.log(JSON.stringify({ restaurants, expenses })); } finally { await p.$disconnect(); }",
        ];
    const { stdout } = await execFileAsync(nodeRunner.bin, checkArgs, {
      cwd: runtimeRoot,
      env: { ...runtimeEnv, ...nodeRunner.extraEnv },
      windowsHide: true,
    });
    const counts = JSON.parse(stdout.trim().split(/\r?\n/).pop() || '{}');
    needsSeed = !counts.restaurants || !counts.expenses;
  } catch {
    needsSeed = false;
  }

  if (needsSeed) {
    emit(5, totalSteps, 'Заполнение аналитических данных UzBite...', 'seed');
    const compiledSeed = join(runtimeRoot, 'prisma', 'seed.mjs');
    const seedEnv = { ...runtimeEnv, ALLOW_DEVELOPMENT_SEED: 'true' };
    if (existsSync(compiledSeed)) {
      await runNodeScript(nodeRunner, [compiledSeed], runtimeRoot, seedEnv, line =>
        emit(5, totalSteps, 'Заполнение аналитических данных...', line),
      );
    } else {
      const tsxCli = join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      await runNodeScript(
        nodeRunner,
        [tsxCli, join(runtimeRoot, 'prisma', 'seed.ts')],
        runtimeRoot,
        seedEnv,
        line => emit(5, totalSteps, 'Заполнение аналитических данных...', line),
      );
    }
  }

  // Step 6: Start Backend API and wait for /api/health
  emit(6, totalSteps, 'Запуск аналитического сервера UzBite...', effectiveApiBase);
  let backendExitCode = null;
  if (!(await isLoopbackPortOpen(effectiveApiPort, effectiveApiHost))) {
    const backendFd = openSync(backendLogFile, 'a');
    let backendProc;
    try {
      backendProc = spawn(nodeRunner.bin, [join(runtimeRoot, 'apps', 'backend', 'dist', 'index.js')], {
        cwd: runtimeRoot,
        env: { ...runtimeEnv, ...nodeRunner.extraEnv },
        windowsHide: true,
        stdio: ['ignore', backendFd, backendFd],
      });
    } finally {
      closeSync(backendFd);
    }
    backendProc.once('exit', code => {
      backendExitCode = code ?? 1;
    });
    startedChildren.push(backendProc);
  }

  const apiDeadline = Date.now() + 45_000;
  while (Date.now() < apiDeadline && !stopping) {
    const health = await checkBackendHealth(effectiveApiBase);
    if (health.ok && health.databaseConnected) {
      return { ready: true, needsWorkspace: false, mode, apiBase: effectiveApiBase, root: runtimeRoot, shutdown };
    }
    if (backendExitCode !== null) {
      const logTail = existsSync(backendLogFile)
        ? readFileSync(backendLogFile, 'utf8').trim().split(/\r?\n/).slice(-8).join('\n')
        : '';
      throw new Error(
        `Сервер UzBite Business API завершился с кодом ${backendExitCode}.${logTail ? `\n${logTail}` : ''} Лог: ${backendLogFile}`,
      );
    }
    await new Promise(r => setTimeout(r, 350));
  }

  throw new Error(`Сервер UzBite Business API не ответил на ${effectiveApiBase}/api/health за 45 секунд. Лог: ${backendLogFile}`);
  } catch (error) {
    await shutdown();
    throw error;
  }
}
