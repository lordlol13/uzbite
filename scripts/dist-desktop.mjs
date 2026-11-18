import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktopDir = resolve(root, 'apps/desktop');
const cli = resolve(root, 'node_modules/electron-builder/cli.js');

const env = {
  ...process.env,
  // Level 3 keeps installer size compact while avoiding 10+ minute ultra-LZMA stalls on 400MB runtime bundles.
  ELECTRON_BUILDER_COMPRESSION_LEVEL: process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || '3',
};

const child = spawn(process.execPath, [cli, '--win', '--x64'], {
  cwd: desktopDir,
  env,
  stdio: 'inherit',
});

child.on('exit', code => {
  process.exit(code ?? 1);
});
