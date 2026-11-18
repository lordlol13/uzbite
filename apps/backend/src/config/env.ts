import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(8081),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  ALLOWED_ORIGINS: z
    .string()
    .default(
      [
        'http://localhost:8082',
        'http://127.0.0.1:8082',
      ].join(','),
    ),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  COARENA_API_KEY: z.string().optional(),
  COARENA_BASE_URL: z.string().default('https://coarena.ai/api/v1'),
  COARENA_MODEL: z.string().default('gemini-3-8-flash'),
});

export const env = schema.parse(process.env);
export const allowedOrigins = env.ALLOWED_ORIGINS.split(',')
  .map(s => s.trim())
  .filter(Boolean);

const privateLanOriginPattern =
  /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d{2,5})?$/;

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (env.NODE_ENV !== 'production' && privateLanOriginPattern.test(origin)) return true;
  return false;
}
