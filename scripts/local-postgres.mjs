import EmbeddedPostgres from 'embedded-postgres';
import { config } from 'dotenv';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');

function isLoopbackPortBusy(port, host = '127.0.0.1') {
  return new Promise(res => {
    const s = createConnection({ host, port });
    const done = v => {
      s.removeAllListeners();
      s.destroy();
      res(v);
    };
    s.setTimeout(500, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

function findPgCtl(baseRoot) {
  const candidates = [
    resolve(baseRoot, 'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),
    resolve(baseRoot, '../node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),
    resolve(baseRoot, '../../node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0];
}

function resolveDatabasePaths() {
  const dataRoot = process.env.UZBITE_DATA_DIR ? resolve(process.env.UZBITE_DATA_DIR) : resolve(root, '.local');
  const databaseDir = process.env.UZBITE_PG_DATA_DIR
    ? resolve(process.env.UZBITE_PG_DATA_DIR)
    : resolve(dataRoot, 'postgres');
  const logFile = process.env.UZBITE_PG_LOG_FILE
    ? resolve(process.env.UZBITE_PG_LOG_FILE)
    : resolve(dirname(databaseDir), 'postgres.log');
  return { dataRoot, databaseDir, logFile };
}

export async function startLocalPostgres() {
  const envFile = process.env.UZBITE_ENV_FILE ? resolve(process.env.UZBITE_ENV_FILE) : resolve(root, '.env');
  if (existsSync(envFile)) {
    config({ path: envFile, quiet: true });
  }
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Local PostgreSQL supports loopback URLs only. Use npm run dev:app for an external database.');
  }
  const pgPort = Number(url.port || 5432);
  const { dataRoot, databaseDir, logFile } = resolveDatabasePaths();
  mkdirSync(dataRoot, { recursive: true });
  mkdirSync(dirname(databaseDir), { recursive: true });
  mkdirSync(dirname(logFile), { recursive: true });

  // Recover cleanly if a previous initdb crashed before creating PG_VERSION.
  if (existsSync(databaseDir) && !existsSync(resolve(databaseDir, 'PG_VERSION'))) {
    rmSync(databaseDir, { recursive: true, force: true });
  }

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port: pgPort,
    persistent: true,
    authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1'],
    onLog: message => {
      if (process.env.DEBUG_POSTGRES) console.log(message);
    },
    onError: console.error,
  });
  if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) {
    await pg.initialise();
  }

  const windows = process.platform === 'win32';
  const pgCtl = findPgCtl(root);
  let startedHere = false;

  async function stop() {
    if (!startedHere) return;
    if (windows) {
      execFileSync(pgCtl, ['stop', '-D', databaseDir, '-m', 'fast', '-w', '-t', '20'], {
        stdio: 'inherit',
        windowsHide: true,
      });
    } else {
      await pg.stop();
    }
    startedHere = false;
  }

  try {
    if (windows) {
      // pg_ctl creates a restricted child token, so an elevated developer terminal
      // can start PostgreSQL without users, services, or changed system privileges.
      let running = false;
      try {
        execFileSync(pgCtl, ['status', '-D', databaseDir], { stdio: 'ignore', windowsHide: true });
        running = true;
      } catch {
        running = false;
      }
      if (!running) {
        if (await isLoopbackPortBusy(pgPort)) {
          throw new Error(
            `Port 127.0.0.1:${pgPort} is already in use by another process. Stop the conflicting PostgreSQL instance or update DATABASE_URL.`,
          );
        }
        execFileSync(
          pgCtl,
          ['start', '-D', databaseDir, '-l', logFile, '-o', `-h 127.0.0.1 -p ${pgPort}`, '-w', '-t', '60'],
          { stdio: 'inherit', windowsHide: true },
        );
        startedHere = true;
      }
    } else {
      await pg.start();
      startedHere = true;
    }

    if (!process.env.UZBITE_SKIP_CREATE_DB) {
      const database = url.pathname.slice(1);
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(database)) {
        throw new Error('Expected a simple local database name.');
      }
      const client = pg.getPgClient('postgres', '127.0.0.1');
      try {
        await client.connect();
        try {
          await client.query(`CREATE DATABASE "${database}"`);
        } catch (error) {
          if (error.code !== '42P04') throw error;
        }
      } finally {
        await client.end();
      }
    }

    console.log(`Local PostgreSQL ready on 127.0.0.1:${url.port || 5432}. Data persists in ${databaseDir}.`);
    return stop;
  } catch (error) {
    await stop();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stopDatabase = await startLocalPostgres();
  const keepAlive = setInterval(() => {}, 60_000);
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    try {
      await stopDatabase();
    } finally {
      clearInterval(keepAlive);
    }
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
