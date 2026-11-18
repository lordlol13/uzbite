/** Live contract checks for the account screens; creates and removes an isolated test account. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ quiet: true });
const baseUrl = process.env.TEST_API_URL || 'http://localhost:8081/api';
const origin = process.env.TEST_ORIGIN || 'http://localhost:8080';
const db = new PrismaClient();
const cookies = new Map();
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const email = `account_ui_${suffix}@example.test`;
const password = randomUUID();
let csrf = '';
let userId;

async function request(path, method = 'GET', payload, status = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Origin: origin, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  for (const raw of response.headers.getSetCookie()) { const pair = raw.split(';')[0]; const equals = pair.indexOf('='); cookies.set(pair.slice(0, equals), pair.slice(equals + 1)); }
  const result = await response.json();
  assert.equal(response.status, status, `${method} ${path}: expected ${status}, got ${response.status} (${result.error?.code || 'unknown'})`);
  return result.data ?? result;
}

try {
  csrf = (await request('/auth/csrf')).csrfToken;
  const user = await request('/auth/register', 'POST', { email, password }, 201);
  userId = user.id;
  assert.equal((await request('/auth/me')).id, userId);
  await request('/profile', 'PATCH', { nickname: `ui_${suffix}`, bio: 'Isolated UI contract test', email, language: 'en', theme: 'dark' });
  const profile = await request('/profile');
  assert.equal(profile.settings.language, 'en');
  assert.equal(profile.settings.theme, 'dark');
  assert.equal(profile.counts.orders, 0);
  console.log('PASS account registration, session and profile/settings payloads');

  const address = await request('/addresses', 'POST', { latitude: 41.3111, longitude: 69.2797, label: 'Test location', addressText: 'Test address, Tashkent', entrance: '1', floor: '2', apartment: '3', comment: 'Contract test', isDefault: false }, 201);
  assert.equal(address.isDefault, true);
  const otherAddress = await request('/addresses', 'POST', { latitude: 41.315, longitude: 69.285, label: 'Other location', addressText: 'Other test address, Tashkent', entrance: '', floor: '', apartment: '', comment: '', isDefault: false }, 201);
  await request(`/addresses/${otherAddress.id}`, 'PATCH', { isDefault: true });
  assert.equal((await request('/addresses')).find(item => item.isDefault).id, otherAddress.id);
  await request(`/addresses/${otherAddress.id}`, 'DELETE');
  assert.equal((await request('/addresses'))[0].isDefault, true);
  console.log('PASS saved-address creation, default changes and deletion');

  const feed = await request('/feed');
  const post = feed.items.find(item => item.restaurant.isOpen && item.dish?.isAvailable);
  assert.ok(post, 'An open restaurant with an available seed dish is required');
  await request(`/posts/${post.id}/like`, 'PUT', { liked: true });
  assert.ok((await request('/profile/likes')).some(item => item.id === post.id));
  await request(`/posts/${post.id}/like`, 'PUT', { liked: false });
  await request(`/restaurants/${post.restaurant.id}/follow`, 'PUT', { following: true });
  assert.ok((await request('/profile/follows')).some(item => item.id === post.restaurant.id));
  await request(`/restaurants/${post.restaurant.id}/follow`, 'PUT', { following: false });
  console.log('PASS liked-post and followed-restaurant profile collections');

  const restaurant = await request(`/restaurants/${post.restaurant.id}`);
  const items = restaurant.dishes.filter(item => item.isAvailable).slice(0, 2).map(item => ({ dishId: item.id, quantity: 2 }));
  const quote = await request('/orders/quote', 'POST', { items });
  assert.equal(quote.total, quote.subtotal + quote.deliveryFee);
  const orderInput = { items, addressId: address.id, recipientName: 'Account UI Test', recipientPhone: '+998 90 123 45 67', paymentMethod: 'CASH' };
  const order = await request('/orders', 'POST', orderInput, 201);
  assert.equal(order.total, quote.total);
  assert.equal(order.status, 'PENDING_ACCEPTANCE');
  assert.equal(order.payment.status, 'AWAITING_PAYMENT');
  assert.equal(order.addressSnapshot.addressText, address.addressText);
  assert.equal(order.items.length, items.length);
  const duplicate = await request('/orders', 'POST', orderInput, 409);
  assert.equal(duplicate.error.code, 'ACTIVE_ORDER_EXISTS');
  const review = await request(`/restaurants/${post.restaurant.id}/reviews`, 'POST', { orderId: order.id, rating: 5, text: 'Must not be accepted before delivery' }, 403);
  assert.equal(review.error.code, 'REVIEW_NOT_ALLOWED');
  assert.equal((await request('/orders'))[0].review, null);
  assert.equal((await request('/auth/me')).phone, orderInput.recipientPhone);
  console.log('PASS checkout quote, cash order, address snapshot, saved contact, one-active-order and review restrictions');

  await request('/auth/logout', 'POST');
  await request('/profile', 'GET', undefined, 401);
  await request('/auth/login', 'POST', { email, password });
  assert.equal((await request('/orders'))[0].id, order.id);
  console.log('PASS logout, protected profile, login and order persistence');
} finally {
  if (userId) {
    // Delete only records owned by the account this script just created.
    await db.$transaction(async tx => {
      await tx.payment.deleteMany({ where: { order: { userId } } });
      await tx.order.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId, email } });
    });
    console.log('PASS isolated test account and order cleanup');
  }
  await db.$disconnect();
}
