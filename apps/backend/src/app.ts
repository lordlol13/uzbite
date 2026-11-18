import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, redis } from './config/database.js';
import { env, isAllowedOrigin, storageReady, receiptStorageReady } from './config/env.js';
import { csrfProtection, rateLimit } from './middleware/security.js';
import { optionalAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { profileRouter } from './routes/profile.js';
import { addressRouter } from './routes/addresses.js';
import { orderRouter } from './routes/orders.js';
import { notificationRouter } from './routes/notifications.js';
import { uploadRouter } from './routes/uploads.js';
import { businessRouter } from './routes/business.js';
import { restaurantAccountRouter } from './routes/restaurant-account.js';
import { courierRouter } from './routes/courier.js';
import { resolveLocalMediaFile } from './services/media-storage.js';
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
  app.use(cookieParser());
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
        storage: storageReady,
        privateReceiptStorage: receiptStorageReady,
      },
    });
  });

  app.get('/api/media/:filename', (req, res) => {
    const file = resolveLocalMediaFile(String(req.params.filename ?? ''));
    if (!file) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Медиафайл не найден' } });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file);
  });

  const publicDir = fileURLToPath(new URL('../public', import.meta.url));
  if (existsSync(publicDir)) {
    app.use('/images', express.static(resolve(publicDir, 'images'), { maxAge: '7d' }));
    app.use('/media', express.static(resolve(publicDir, 'media'), { maxAge: '7d' }));
  }

  app.use('/api', rateLimit('api', 1200, 60), csrfProtection, optionalAuth);
  app.use('/api/auth', authRouter);
  app.use('/api', catalogRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/addresses', addressRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/uploads', uploadRouter);
  app.use('/api/business', businessRouter);
  app.use('/api/restaurant-account', restaurantAccountRouter);
  app.use('/api/courier', courierRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
