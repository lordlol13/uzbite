import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { assert } from '../utils/errors.js';
import { paginationSchema, pageMetadata } from '../utils/pagination.js';
import { notificationDto } from '../services/notifications.js';

export const notificationRouter = Router();
notificationRouter.use(requireAuth);
const notificationQuerySchema = paginationSchema.extend({ orderId: z.string().trim().min(1).max(100).optional() });
async function notificationWhere(userId: string, orderId?: string): Promise<Prisma.NotificationWhereInput> {
  if (!orderId) return { userId };
  assert(await db.order.findFirst({ where: { id: orderId, userId }, select: { id: true } }), 404, 'NOT_FOUND', 'Заказ не найден');
  return { userId, type: { in: ['ORDER_CREATED', 'ORDER_STATUS', 'PAYMENT_STATUS'] }, metadata: { path: ['orderId'], equals: orderId } };
}
notificationRouter.get('/', async (req, res) => {
  const { page, pageSize, orderId } = notificationQuerySchema.parse(req.query);
  const where = await notificationWhere(req.user!.id, orderId);
  const [items, total, unreadCount, settings] = await Promise.all([
    db.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    db.notification.count({ where }), db.notification.count({ where: { ...where, readAt: null } }), db.userSettings.findUnique({ where: { userId: req.user!.id } }),
  ]);
  res.json({ data: items.map(item => notificationDto(item, settings?.language)), pagination: pageMetadata(page, pageSize, total), unreadCount });
});
notificationRouter.patch('/read', async (req, res) => {
  const { orderId } = z.object({ orderId: z.string().trim().min(1).max(100) }).strict().parse(req.body);
  const where = await notificationWhere(req.user!.id, orderId);
  const updated = await db.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
  res.json({ data: { read: updated.count } });
});
notificationRouter.patch('/:id/read', async (req, res) => {
  const updated = await db.notification.updateMany({ where: { id: req.params.id as string, userId: req.user!.id }, data: { readAt: new Date() } });
  assert(updated.count === 1, 404, 'NOT_FOUND', 'Уведомление не найдено');
  res.json({ data: { read: true } });
});
