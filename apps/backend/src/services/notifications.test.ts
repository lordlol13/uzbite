import test from 'node:test';
import assert from 'node:assert/strict';
import type { Notification } from '@prisma/client';
import { notificationDto } from './notifications.js';

function notice(overrides: Partial<Notification> = {}): Notification {
  return { id: 'n', userId: 'u', type: 'ORDER_STATUS', title: 'Статус заказа обновлён', body: 'Osh: DELIVERED', metadata: { restaurantName: 'Osh', status: 'DELIVERED' }, link: '/orders', readAt: null, createdAt: new Date(0), ...overrides };
}
test('Notification DTO follows the selected language and never exposes raw order enums', () => {
  assert.equal(notificationDto(notice(), 'en').body, 'Osh · Delivered');
  assert.equal(notificationDto(notice(), 'uz').body, 'Osh · Yetkazildi');
  assert.equal(notificationDto(notice(), 'ru').body, 'Osh · Доставлено');
});
test('Existing notification rows without metadata remain localized', () => {
  assert.equal(notificationDto(notice({ metadata: null }), 'en').body, 'Osh · Delivered');
  assert.equal(notificationDto(notice({ type: 'COMMENT_REPLY', body: 'Aziza ответил на ваш комментарий', metadata: null }), 'en').body, 'Aziza replied to your comment');
  assert.equal(notificationDto(notice({ type: 'ORDER_STATUS', body: 'UNKNOWN_INTERNAL_VALUE', metadata: null }), 'uz').body, 'Buyurtma holati yangilandi');
});
test('Payment rejection and comment notifications localize semantic metadata', () => {
  const payment = notificationDto(notice({ type: 'PAYMENT_STATUS', metadata: { restaurantName: 'Osh', paymentStatus: 'REJECTED' } }), 'en');
  assert.equal(payment.body, 'Osh · Payment rejected');
  const reply = notificationDto(notice({ type: 'COMMENT_REPLY', metadata: { authorName: 'Aziza' } }), 'uz');
  assert.equal(reply.body, 'Aziza izohingizga javob berdi');
});
