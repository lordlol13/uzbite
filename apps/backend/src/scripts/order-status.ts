import { OrderStatus, PaymentStatus } from '@prisma/client';
import { createClient } from 'redis';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { assert } from '../utils/errors.js';
import { updateOrderState } from '../services/order-status.js';

// Private developer CLI only. There is deliberately no HTTP status-update endpoint.
const [orderId, statusArg, paymentArg, rejectionReason] = process.argv.slice(2);
try {
  assert(env.NODE_ENV !== 'production', 403, 'DEVELOPMENT_ONLY', 'Developer tool is disabled in production');
  assert(orderId && statusArg && Object.values(OrderStatus).includes(statusArg as OrderStatus), 400, 'USAGE', 'Usage: npm run order:status -- ORDER_ID STATUS [PAYMENT_STATUS] [REJECTION_REASON]');
  const nextStatus = statusArg as OrderStatus;
  if (paymentArg) assert(Object.values(PaymentStatus).includes(paymentArg as PaymentStatus), 400, 'PAYMENT_STATUS', 'Invalid payment status');
  const { order, notifications } = await updateOrderState(orderId, nextStatus, paymentArg as PaymentStatus | undefined, rejectionReason);
  const publisher = createClient({ url: env.REDIS_URL, socket: { reconnectStrategy: false, connectTimeout: 2000 } });
  publisher.on('error', () => {});
  try { await publisher.connect(); await publisher.publish('uzbite:events', JSON.stringify({ userId: order.userId, orderId: order.id, notificationIds: notifications.map(notice => notice.id) })); } catch { console.warn('Redis unavailable: status is saved; clients resync using REST.'); }
  finally { if (publisher.isOpen) await publisher.quit().catch(() => publisher.destroy()); }
  console.log(`Updated order ${order.id} to ${order.status}`);
} catch (error) { console.error(error instanceof Error ? error.message : 'Could not update order'); process.exitCode = 1; }
finally { await db.$disconnect(); }
