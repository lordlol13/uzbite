import { Prisma, type OrderStatus, type PaymentStatus } from '@prisma/client';
import { db } from '../config/database.js';
import { assert } from '../utils/errors.js';
import { orderInclude } from './orders.js';

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING_ACCEPTANCE: ['ACCEPTED', 'CANCELLED'], ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['DELIVERING', 'CANCELLED'], DELIVERING: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [], CANCELLED: [],
};
const paymentTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  AWAITING_PAYMENT: ['PAID'], AWAITING_CONFIRMATION: ['PAID', 'REJECTED'], PAID: [], REJECTED: [],
};

/** Private service for the developer CLI; intentionally has no customer HTTP route. */
export async function updateOrderState(orderId: string, nextStatus: OrderStatus, paymentStatus?: PaymentStatus, rejectionReason?: string) {
  return db.$transaction(async tx => {
    const existing = await tx.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    assert(existing, 404, 'NOT_FOUND', 'Order not found');
    const statusChanged = nextStatus !== existing.status;
    const paymentChanged = Boolean(paymentStatus && paymentStatus !== existing.payment?.status);
    assert(statusChanged ? transitions[existing.status].includes(nextStatus) : paymentChanged, 409, 'INVALID_TRANSITION', 'Invalid or unchanged order status');
    if (paymentChanged) {
      assert(existing.payment && existing.status !== 'CANCELLED' && paymentTransitions[existing.payment.status].includes(paymentStatus!), 409, 'INVALID_PAYMENT_TRANSITION', 'Payment status cannot be changed this way');
      if (paymentStatus === 'REJECTED') assert(rejectionReason && rejectionReason.trim().length >= 3 && rejectionReason.trim().length <= 500, 400, 'PAYMENT_REASON_REQUIRED', 'A payment rejection reason of 3–500 characters is required');
      await tx.payment.update({ where: { orderId }, data: { status: paymentStatus, rejectionReason: paymentStatus === 'REJECTED' ? rejectionReason!.trim() : null } });
    }
    const confirmedStatus = paymentStatus ?? existing.payment?.status;
    if (existing.payment?.method === 'CARD' && ['ACCEPTED', 'PREPARING', 'DELIVERING', 'DELIVERED'].includes(nextStatus)) assert(confirmedStatus === 'PAID', 409, 'PAYMENT_REQUIRED', 'Card payment must be manually confirmed before processing the order');
    const order = statusChanged ? await tx.order.update({ where: { id: orderId }, data: { status: nextStatus }, include: orderInclude }) : await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    const notifications = [];
    if (statusChanged) notifications.push(await tx.notification.create({ data: { userId: existing.userId, type: 'ORDER_STATUS', title: 'Статус заказа обновлён', body: `${existing.restaurantName}: ${nextStatus}`, link: '/orders', metadata: { orderId, restaurantName: existing.restaurantName, status: nextStatus } } }));
    if (paymentChanged) notifications.push(await tx.notification.create({ data: { userId: existing.userId, type: 'PAYMENT_STATUS', title: 'Статус оплаты обновлён', body: existing.restaurantName, link: '/orders', metadata: { orderId, restaurantName: existing.restaurantName, paymentStatus: paymentStatus! } } }));
    return { order, notifications };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
