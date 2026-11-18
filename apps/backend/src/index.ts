import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectServices, db, redis } from './config/database.js';
import { env } from './config/env.js';

const server = createServer(createApp());
server.on('error', error => {
  console.error('Backend could not listen:', error.message);
  process.exit(1);
});
server.listen(env.PORT, env.HOST, () => {
  console.log(`UzBite Business API listening on ${env.HOST}:${env.PORT}`);
});
void connectServices().catch(() => console.warn('Database unavailable; /api/health reports readiness.'));

async function shutdown() {
  server.close();
  await Promise.allSettled([db.$disconnect(), redis.isOpen ? redis.quit() : Promise.resolve()]);
  process.exit(0);
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
