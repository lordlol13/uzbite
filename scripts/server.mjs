import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { startLocalPostgres } from './local-postgres.mjs';

const root = resolve(import.meta.dirname, '..');
const builtEntry = resolve(root, 'apps/backend/dist/index.js');

let stopDatabase;
let apiProc;

try {
  stopDatabase = await startLocalPostgres();
  const args = existsSync(builtEntry) ? [builtEntry] : ['--import', 'tsx', resolve(root, 'apps/backend/src/index.ts')];
  apiProc = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
  });

  const forwardSignal = signal => {
    if (apiProc && !apiProc.killed) apiProc.kill(signal);
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  const exitCode = await new Promise(resolveExit => {
    apiProc.on('exit', code => resolveExit(code ?? 0));
  });
  process.exitCode = exitCode;
} catch (error) {
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
} finally {
  await stopDatabase?.();
}
