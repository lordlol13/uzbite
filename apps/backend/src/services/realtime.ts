import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env, isAllowedOrigin } from '../config/env.js';
import { db, redis } from '../config/database.js';
import { accessCookie, identityFromAccess } from './auth.js';
import { orderInclude } from './orders.js';
import { jsonValue } from '../utils/serialize.js';
import { notificationDto } from './notifications.js';

let io: Server | undefined;
let subscriber: ReturnType<typeof redis.duplicate> | undefined;

function extractToken(socket: { handshake: { auth?: Record<string, unknown>; headers: Record<string, unknown> } }): string | undefined {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim().length > 0) {
    return authToken.startsWith('Bearer ') ? authToken.slice(7).trim() : authToken.trim();
  }
  const authHeader = socket.handshake.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = typeof socket.handshake.headers.cookie === 'string' ? socket.handshake.headers.cookie : '';
  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const idx = item.indexOf('=');
        return idx === -1 ? [item, ''] : [item.slice(0, idx), item.slice(idx + 1)];
      }),
  );
  const rawCookie = cookies[accessCookie];
  return rawCookie ? decodeURIComponent(rawCookie) : undefined;
}

async function canAccessRestaurantRoom(userId: string, role: string, restaurantId: string): Promise<boolean> {
  if (role !== 'RESTAURANT') return false;
  const restaurant = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, ownerId: true },
  });
  if (!restaurant) return false;
  if (restaurant.ownerId === userId) return true;
  if (env.NODE_ENV !== 'production') {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email === 'owner@uzbite.uz') return true;
  }
  return false;
}

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: (origin, callback) => callback(null, isAllowedOrigin(origin)), credentials: true },
    maxHttpBufferSize: 32 * 1024,
  });

  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && !isAllowedOrigin(origin)) throw new Error('Origin forbidden');
      const token = extractToken(socket);
      if (!token) throw new Error('Missing token');
      socket.data.user = await identityFromAccess(token);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async socket => {
    const user = socket.data.user as { id: string; role: string; accessExpiresAt: number };
    const userId = user.id;
    void socket.join(`user:${userId}`);

    if (user.role === 'RESTAURANT') {
      try {
        const restaurants = await db.restaurant.findMany({
          where: { ownerId: userId },
          select: { id: true },
        });
        for (const r of restaurants) {
          void socket.join(`restaurant:${r.id}`);
        }
      } catch {
        /* Ignore transient lookup error */
      }
    } else if (user.role === 'COURIER') {
      void socket.join(`courier:${userId}`);
      try {
        const dbUser = await db.user.findUnique({ where: { id: userId }, select: { courierAvailability: true } });
        if (dbUser?.courierAvailability === 'AVAILABLE') {
          void socket.join('couriers:available');
        }
      } catch {
        /* Ignore transient lookup error */
      }
    }

    socket.on('order:join', async (orderId: unknown, ack?: (data: { ok: boolean }) => void) => {
      const respond = (ok: boolean) => {
        if (typeof ack === 'function') ack({ ok });
      };
      if (typeof orderId !== 'string' || orderId.length > 100) {
        respond(false);
        return;
      }
      try {
        const token = extractToken(socket);
        if (!token) {
          respond(false);
          return;
        }
        await identityFromAccess(token);
        const order = await db.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            userId: true,
            restaurantId: true,
            delivery: { select: { assignedCourierId: true } },
          },
        });
        if (!order) {
          respond(false);
          return;
        }
        const allowed =
          (user.role === 'USER' && order.userId === userId) ||
          (await canAccessRestaurantRoom(userId, user.role, order.restaurantId)) ||
          (user.role === 'COURIER' && order.delivery?.assignedCourierId === userId);
        if (!allowed) {
          respond(false);
          return;
        }
        await socket.join(`order:${orderId}`);
        respond(true);
      } catch {
        respond(false);
      }
    });

    socket.on('restaurant:join', async (restaurantId: unknown, ack?: (data: { ok: boolean }) => void) => {
      const respond = (ok: boolean) => {
        if (typeof ack === 'function') ack({ ok });
      };
      if (typeof restaurantId !== 'string' || restaurantId.length > 100) {
        respond(false);
        return;
      }
      try {
        if (await canAccessRestaurantRoom(userId, user.role, restaurantId)) {
          await socket.join(`restaurant:${restaurantId}`);
          respond(true);
          return;
        }
        respond(false);
      } catch {
        respond(false);
      }
    });

    socket.on('delivery:join', async (deliveryId: unknown, ack?: (data: { ok: boolean }) => void) => {
      const respond = (ok: boolean) => {
        if (typeof ack === 'function') ack({ ok });
      };
      if (typeof deliveryId !== 'string' || deliveryId.length > 100) {
        respond(false);
        return;
      }
      try {
        const delivery = await db.delivery.findUnique({
          where: { id: deliveryId },
          select: { id: true, restaurantId: true, assignedCourierId: true },
        });
        if (!delivery) {
          respond(false);
          return;
        }
        const allowed =
          (await canAccessRestaurantRoom(userId, user.role, delivery.restaurantId)) ||
          (user.role === 'COURIER' && delivery.assignedCourierId === userId);
        if (!allowed) {
          respond(false);
          return;
        }
        await socket.join(`delivery:${deliveryId}`);
        respond(true);
      } catch {
        respond(false);
      }
    });

    socket.on('post:join', async (postId: unknown) => {
      if (typeof postId !== 'string' || postId.length > 100) return;
      try {
        if (await db.post.findUnique({ where: { id: postId }, select: { id: true } })) {
          await socket.join(`post:${postId}`);
        }
      } catch {
        /* REST remains source of truth. */
      }
    });

    socket.on('post:leave', (postId: unknown) => {
      if (typeof postId === 'string' && postId.length <= 100) void socket.leave(`post:${postId}`);
    });

    // Access credentials expire even on a long-lived socket; clients refresh and reconnect.
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, Number(user.accessExpiresAt) - Date.now()),
    );
    socket.on('disconnect', () => clearTimeout(expiry));
  });

  redis.on('ready', () => {
    void subscribeDeveloperEvents();
  });
  if (redis.isReady) void subscribeDeveloperEvents();
  return io;
}

async function subscribeDeveloperEvents() {
  if (subscriber) return;
  subscriber = redis.duplicate();
  subscriber.on('error', () => {});
  try {
    await subscriber.connect();
    await subscriber.subscribe('uzbite:events', message => {
      void (async () => {
        const event = JSON.parse(message) as {
          userId?: string;
          orderId?: string;
          notificationIds?: string[];
          notification?: { id?: string };
        };
        if (!event.userId || !event.orderId) return;
        const order = await db.order.findFirst({
          where: { id: event.orderId, userId: event.userId },
          include: orderInclude,
        });
        if (order) {
          ioEvent([`user:${event.userId}`, `order:${order.id}`, `restaurant:${order.restaurantId}`], 'order:updated', jsonValue(order));
          ioEvent([`user:${event.userId}`, `restaurant:${order.restaurantId}`], 'payment:updated', {
            orderId: order.id,
            payment: jsonValue(order.payment),
          });
        }
        const ids = event.notificationIds ?? (event.notification?.id ? [event.notification.id] : []);
        if (ids.length) {
          const [notices, settings] = await Promise.all([
            db.notification.findMany({
              where: { id: { in: ids }, userId: event.userId },
              orderBy: { createdAt: 'asc' },
            }),
            db.userSettings.findUnique({ where: { userId: event.userId } }),
          ]);
          for (const notice of notices) {
            ioEvent(`user:${event.userId}`, 'notification', notificationDto(notice, settings?.language));
          }
        }
      })().catch(() => {});
    });
  } catch {
    subscriber = undefined;
  }
}

export async function closeRealtimeRedis() {
  if (subscriber?.isOpen) await subscriber.quit();
}

export function ioEvent(room: string | string[], event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}

export function disconnectSession(sessionId: string) {
  if (io) {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.user?.sessionId === sessionId) socket.disconnect(true);
    }
  }
}

export function disconnectUser(userId: string) {
  if (io) {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.user?.id === userId) socket.disconnect(true);
    }
  }
}
