import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const runtimeDir = resolve(root, 'apps/desktop/dist-electron/runtime');

const RUNTIME_SEED_PACKAGES = [
  'express',
  'cors',
  'helmet',
  'jsonwebtoken',
  'bcryptjs',
  'zod',
  'dotenv',
  'redis',
  '@prisma/client',
  'prisma',
  'embedded-postgres',
  '@embedded-postgres/windows-x64',
];

function resolvePackageDir(pkgName, fromDir) {
  let curr = fromDir;
  while (true) {
    const candidate = join(curr, 'node_modules', ...pkgName.split('/'));
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = dirname(curr);
    if (parent === curr) return null;
    curr = parent;
  }
}

function collectRuntimeDependencyClosure(seedPackages) {
  const rootNodeModules = resolve(root, 'node_modules');
  const visited = new Map();
  const queue = seedPackages.map(name => ({ name, from: root }));

  while (queue.length > 0) {
    const { name, from } = queue.shift();
    const resolvedDir = resolvePackageDir(name, from);
    if (!resolvedDir) continue;
    const realDir = realpathSync(resolvedDir);
    if (visited.has(realDir)) continue;

    const pkgJson = JSON.parse(readFileSync(join(realDir, 'package.json'), 'utf8'));
    const relFromRootNm = relative(rootNodeModules, resolvedDir);
    if (relFromRootNm.startsWith('..')) {
      throw new Error(`Unexpected package location outside root node_modules: ${resolvedDir}`);
    }
    visited.set(realDir, {
      name: pkgJson.name,
      realDir,
      relFromRootNm,
    });

    const deps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.optionalDependencies || {}),
    };
    for (const depName of Object.keys(deps)) {
      queue.push({ name: depName, from: realDir });
    }
  }

  return [...visited.values()];
}

function transpileTsToJs(tsSource, fileName) {
  const output = ts.transpileModule(tsSource, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    reportDiagnostics: true,
  });

  const errors = (output.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const msg = errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n');
    throw new Error(`TypeScript transpile failed for ${fileName}:\n${msg}`);
  }
  return output.outputText;
}

function copyFilteredDir(src, dest, shouldSkip) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (shouldSkip?.(srcPath, entry)) continue;
    if (entry.isDirectory()) {
      copyFilteredDir(srcPath, destPath, shouldSkip);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      cpSync(srcPath, destPath, { dereference: true });
    }
  }
}

function getDirSizeBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += getDirSizeBytes(p);
    else if (entry.isFile()) total += statSync(p).size;
  }
  return total;
}

function ensureRepoPrerequisites() {
  if (!existsSync(resolve(root, 'apps/backend/dist/index.js'))) {
    console.log('[prepare-desktop-runtime] Building @uzbite/backend...');
    const npmCmd = process.platform === 'win32' ? 'cmd.exe' : 'npm';
    const npmArgs = process.platform === 'win32'
      ? ['/d', '/c', 'npm', 'run', 'build', '-w', '@uzbite/backend']
      : ['run', 'build', '-w', '@uzbite/backend'];
    execFileSync(npmCmd, npmArgs, { cwd: root, stdio: 'inherit' });
  }

  if (!existsSync(resolve(root, 'node_modules/.prisma/client/index.js'))) {
    console.log('[prepare-desktop-runtime] Generating Prisma Client...');
    execFileSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'generate'], {
      cwd: root,
      stdio: 'inherit',
    });
  }
}

function main() {
  ensureRepoPrerequisites();

  console.log(`[prepare-desktop-runtime] Staging standalone runtime into ${runtimeDir}...`);
  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });

  // 1. Root runtime package.json
  writeFileSync(
    resolve(runtimeDir, 'package.json'),
    JSON.stringify(
      {
        name: 'uzbite-business-runtime',
        version: '1.0.0',
        private: true,
        type: 'module',
      },
      null,
      2,
    ),
    'utf8',
  );

  // 2. Compiled backend
  const backendDistSrc = resolve(root, 'apps/backend/dist');
  const backendDistDest = resolve(runtimeDir, 'apps/backend/dist');
  copyFilteredDir(backendDistSrc, backendDistDest, (_srcPath, entry) => {
    return entry.isFile() && /\.test\.(js|d\.ts|js\.map)$/.test(entry.name);
  });
  cpSync(resolve(root, 'apps/backend/package.json'), resolve(runtimeDir, 'apps/backend/package.json'));

  // 3. Compiled @uzbite/shared package (both packages/shared and node_modules/@uzbite/shared)
  const sharedSource = readFileSync(resolve(root, 'packages/shared/src/index.ts'), 'utf8');
  const sharedCompiledJs = transpileTsToJs(sharedSource, 'packages/shared/src/index.ts');
  const sharedPkgManifest = JSON.stringify(
    {
      name: '@uzbite/shared',
      version: '0.1.0',
      private: true,
      type: 'module',
      main: './dist/index.js',
      exports: './dist/index.js',
    },
    null,
    2,
  );

  for (const targetBase of [
    resolve(runtimeDir, 'packages/shared'),
    resolve(runtimeDir, 'node_modules/@uzbite/shared'),
  ]) {
    mkdirSync(resolve(targetBase, 'dist'), { recursive: true });
    writeFileSync(resolve(targetBase, 'dist/index.js'), sharedCompiledJs, 'utf8');
    writeFileSync(resolve(targetBase, 'package.json'), sharedPkgManifest, 'utf8');
  }

  // Optional MCP package if built
  if (existsSync(resolve(root, 'packages/finance-mcp/dist/index.js'))) {
    cpSync(resolve(root, 'packages/finance-mcp/dist'), resolve(runtimeDir, 'packages/finance-mcp/dist'), {
      recursive: true,
    });
    cpSync(resolve(root, 'packages/finance-mcp/package.json'), resolve(runtimeDir, 'packages/finance-mcp/package.json'));
  }

  // 4. Prisma schema, migrations, and compiled JS seed script
  mkdirSync(resolve(runtimeDir, 'prisma'), { recursive: true });
  cpSync(resolve(root, 'prisma/schema.prisma'), resolve(runtimeDir, 'prisma/schema.prisma'));
  cpSync(resolve(root, 'prisma/migrations'), resolve(runtimeDir, 'prisma/migrations'), { recursive: true });

  const seedTs = readFileSync(resolve(root, 'prisma/seed.ts'), 'utf8');
  let seedJs = transpileTsToJs(seedTs, 'prisma/seed.ts');
  seedJs = seedJs.replace(
    /(['"])\.\.\/apps\/backend\/src\/services\/demo-seed\.js\1/g,
    "'../apps/backend/dist/services/demo-seed.js'",
  );
  writeFileSync(resolve(runtimeDir, 'prisma/seed.mjs'), seedJs, 'utf8');

  // 5. Runtime scripts (local-postgres + check-db-empty helper)
  mkdirSync(resolve(runtimeDir, 'scripts'), { recursive: true });
  cpSync(resolve(root, 'scripts/local-postgres.mjs'), resolve(runtimeDir, 'scripts/local-postgres.mjs'));
  writeFileSync(
    resolve(runtimeDir, 'scripts/check-db-empty.mjs'),
    [
      "import { PrismaClient } from '@prisma/client';",
      'const prisma = new PrismaClient();',
      'try {',
      '  const [restaurants, expenses] = await Promise.all([',
      '    prisma.restaurant.count(),',
      '    prisma.expense.count(),',
      '  ]);',
      '  console.log(JSON.stringify({ restaurants, expenses }));',
      '} finally {',
      '  await prisma.$disconnect();',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  // 6. Production node_modules closure + generated .prisma/client
  const closure = collectRuntimeDependencyClosure(RUNTIME_SEED_PACKAGES);
  const rootNm = resolve(root, 'node_modules');
  const runtimeNm = resolve(runtimeDir, 'node_modules');

  // Copy top-level packages first; nested packages inside another package's node_modules are copied with it.
  const topLevelPackages = closure.filter(entry => !entry.relFromRootNm.includes('node_modules'));
  for (const pkg of topLevelPackages) {
    const src = join(rootNm, pkg.relFromRootNm);
    const dest = join(runtimeNm, pkg.relFromRootNm);
    cpSync(src, dest, { recursive: true, dereference: true });
  }

  // Copy generated Prisma client (.prisma/client)
  const prismaGeneratedSrc = resolve(rootNm, '.prisma/client');
  const prismaGeneratedDest = resolve(runtimeNm, '.prisma/client');
  cpSync(prismaGeneratedSrc, prismaGeneratedDest, { recursive: true, dereference: true });

  // 7. Syntax-check key entrypoints
  for (const relScript of [
    'apps/backend/dist/index.js',
    'prisma/seed.mjs',
    'scripts/local-postgres.mjs',
    'scripts/check-db-empty.mjs',
    'node_modules/@uzbite/shared/dist/index.js',
  ]) {
    execFileSync(process.execPath, ['--check', resolve(runtimeDir, relScript)], { stdio: 'inherit' });
  }

  const totalMb = (getDirSizeBytes(runtimeDir) / (1024 * 1024)).toFixed(1);
  console.log(
    `[prepare-desktop-runtime] Ready (${topLevelPackages.length} packages + .prisma/client, ${totalMb} MB).`,
  );
}

main();
