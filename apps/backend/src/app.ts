import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { db, redis } from './config/database.js';
import { env, isAllowedOrigin } from './config/env.js';
import { originProtection, rateLimit } from './middleware/security.js';
import { optionalAuth } from './middleware/auth.js';
import { businessRouter } from './routes/business.js';
import { errorHandler, notFound } from './utils/errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', async (_req, res) => {
    let database = false;
    try {
      await db.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      /* Report actual service readiness. */
    }
    const ready = database && (env.NODE_ENV !== 'production' || redis.isReady);
    res.status(ready ? 200 : 503).json({
      data: {
        status: ready ? (redis.isReady ? 'ok' : 'degraded') : 'unavailable',
        database: database ? 'connected' : 'unavailable',
        redis: redis.isReady ? 'connected' : 'unavailable',
        rateLimit: redis.isReady
          ? 'redis'
          : env.NODE_ENV === 'production'
            ? 'fail-closed'
            : 'process-memory-development-only',
      },
    });
  });

  app.use('/api', rateLimit('api', 1200, 60), originProtection, optionalAuth);
  app.use('/api/business', businessRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
