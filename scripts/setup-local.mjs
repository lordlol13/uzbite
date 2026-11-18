import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
if (!existsSync(resolve(root, '.env'))) {
  const password = randomBytes(24).toString('hex');
  const lanPorts = [3000, 3001, 5173, 8080, 8082, 8083];
  const localAddresses = Object.values(networkInterfaces())
    .flat()
    .filter(info => info && info.family === 'IPv4' && !info.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address))
    .flatMap(info => lanPorts.map(port => `http://${info.address}:${port}`));

  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:8082',
    'http://127.0.0.1:8082',
    'http://localhost:8083',
    'http://127.0.0.1:8083',
    'http://localhost:19006',
    'capacitor://localhost',
    ...localAddresses,
  ];

  writeFileSync(
    resolve(root, '.env'),
    `DATABASE_URL=postgresql://uzbite:${password}@127.0.0.1:5432/uzbite?schema=public\nREDIS_URL=redis://127.0.0.1:6379\nJWT_SECRET=${randomBytes(48).toString('hex')}\nJWT_REFRESH_SECRET=${randomBytes(48).toString('hex')}\nHOST=0.0.0.0\nPORT=8081\nNODE_ENV=development\nALLOWED_ORIGINS=${defaultOrigins.join(',')}\nUZBITE_API_BASE_URL=http://127.0.0.1:8081\nGEMINI_API_KEY=\nGEMINI_MODEL=gemini-2.5-flash\n`,
  );
  console.log('Created ignored local .env with random credentials.');
}

mkdirSync(resolve(root, 'apps/restaurant-desktop'), { recursive: true });
const attachment = process.env.UZBITE_SPEC_PATH;
if (attachment && !existsSync(resolve(root, 'apps/restaurant-desktop/.env'))) {
  const key = readFileSync(attachment, 'utf8').match(/VITE_YANDEX_MAPS_API_KEY=([a-zA-Z0-9-]+)/)?.[1];
  if (key) {
    writeFileSync(resolve(root, 'apps/restaurant-desktop/.env'), `VITE_YANDEX_MAPS_API_KEY=${key}\n`);
  }
}
console.log('Local configuration ready. Run npm run db:local, then db:migrate and db:seed.');
