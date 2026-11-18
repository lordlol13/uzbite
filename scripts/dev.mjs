import concurrently from 'concurrently';
import { resolve } from 'node:path';
import { startLocalPostgres } from './local-postgres.mjs';

let stopDatabase;
try {
  // Wait for PostgreSQL before starting backend & desktop workspaces.
  stopDatabase = await startLocalPostgres();
  const { result } = concurrently(
    [
      { command: 'npm run dev -w @uzbite/backend', name: 'api', prefixColor: 'yellow' },
      { command: 'npm run dev -w @uzbite/desktop', name: 'analytics', prefixColor: 'magenta' },
      { command: 'npm run dev -w @uzbite/restaurant-desktop', name: 'restaurant', prefixColor: 'cyan' },
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
