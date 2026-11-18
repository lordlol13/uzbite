import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import { env } from './env.js';

export const db = new PrismaClient();
export const redis = createClient({ url: env.REDIS_URL, socket: { reconnectStrategy: retries => Math.min(retries * 200, 3000), connectTimeout: 2000 } });
redis.on('error', () => { /* Readiness endpoint reports unavailable Redis without exposing credentials. */ });
export async function connectServices() {
  if (!redis.isOpen) void redis.connect().catch(() => {});
  await db.$connect();
}
