import concurrently from 'concurrently';
import { resolve } from 'node:path';
import { startLocalPostgres } from './local-postgres.mjs';

let stopDatabase;
try {
  // Wait for PostgreSQL before starting backend & UzBite Business desktop workspaces.
  stopDatabase = await startLocalPostgres();
  const { result } = concurrently(
    [
      { command: 'npm run dev -w @uzbite/backend', name: 'api', prefixColor: 'yellow' },
      { command: 'npm run dev -w @uzbite/desktop', name: 'business', prefixColor: 'magenta' },
    ],
    { cwd: resolve(import.meta.dirname, '..'), killOthersOn: ['success', 'failure'] },
  );
  await result;
} catch (error) {
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
} finally {
  await stopDatabase?.();
}
