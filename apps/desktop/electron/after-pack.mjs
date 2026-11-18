import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export default async function afterPack(context) {
  const projectDir = context?.packager?.projectDir || resolve(import.meta.dirname, '..');
  const stagedRuntime = join(projectDir, 'dist-electron', 'runtime');
  const targetRuntime = join(context.appOutDir, 'resources', 'runtime');

  if (!existsSync(join(stagedRuntime, 'apps', 'backend', 'dist', 'index.js'))) {
    throw new Error(`Missing staged desktop runtime at ${stagedRuntime}. Run npm run prepare:runtime first.`);
  }

  rmSync(targetRuntime, { recursive: true, force: true });
  mkdirSync(targetRuntime, { recursive: true });
  cpSync(stagedRuntime, targetRuntime, { recursive: true, dereference: true });

  const requiredFiles = [
    'apps/backend/dist/index.js',
    'prisma/schema.prisma',
    'prisma/seed.mjs',
    'scripts/local-postgres.mjs',
    'scripts/check-db-empty.mjs',
    'node_modules/@uzbite/shared/dist/index.js',
    'node_modules/@prisma/client/default.js',
    'node_modules/.prisma/client/query_engine-windows.dll.node',
    'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe',
    'node_modules/prisma/build/index.js',
  ];

  for (const rel of requiredFiles) {
    const full = join(targetRuntime, rel);
    if (!existsSync(full)) {
      throw new Error(`afterPack verification failed: missing ${full}`);
    }
  }

  console.log(`[afterPack] Bundled standalone runtime verified in ${targetRuntime}`);
}
