import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
if (!existsSync(resolve(root, '.env'))) {
  const password = randomBytes(24).toString('hex');
  const lanPorts = [8082];
  const localAddresses = Object.values(networkInterfaces())
    .flat()
    .filter(info => info && info.family === 'IPv4' && !info.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address))
    .flatMap(info => lanPorts.map(port => `http://${info.address}:${port}`));

  const defaultOrigins = [
    'http://localhost:8082',
    'http://127.0.0.1:8082',
    ...localAddresses,
  ];

  writeFileSync(
    resolve(root, '.env'),
    `DATABASE_URL=postgresql://uzbite:${password}@127.0.0.1:5432/uzbite?schema=public\nREDIS_URL=redis://127.0.0.1:6379\nJWT_SECRET=${randomBytes(48).toString('hex')}\nJWT_REFRESH_SECRET=${randomBytes(48).toString('hex')}\nHOST=0.0.0.0\nPORT=8081\nNODE_ENV=development\nALLOWED_ORIGINS=${defaultOrigins.join(',')}\nUZBITE_API_BASE_URL=http://127.0.0.1:8081\nGEMINI_API_KEY=\nGEMINI_MODEL=gemini-2.5-flash\nCOARENA_API_KEY=\nCOARENA_BASE_URL=https://coarena.ai/api/v1\nCOARENA_MODEL=gemini-3-8-flash\n`,
  );
  console.log('Created ignored local .env with random credentials.');
}

console.log('Local configuration ready. Run npm run db:local, then db:migrate and db:seed.');
