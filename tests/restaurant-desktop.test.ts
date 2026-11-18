import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { io, type Socket } from 'socket.io-client';
import { db } from '../apps/backend/src/config/database.js';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8081';
const origin = process.env.TEST_ORIGIN ?? 'http://localhost:8080';
const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
const password = `UzBiteRest_${suffix}!`;

class CustomerSession {
  cookies = new Map<string, string>();
  csrf = '';
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async request(method: string, path: string, body?: unknown) {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: this.cookieHeader(),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(method === 'GET' ? {} : { 'X-CSRF-Token': this.csrf }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const idx = pair!.indexOf('=');
      this.cookies.set(pair!.slice(0, idx), pair!.slice(idx + 1));
    }
    const payload = (await response.json().catch(() => ({}))) as {
      data?: unknown;
      error?: { code: string; message: string };
    };
    return { status: response.status, data: payload.data, error: payload.error };
  }
  async init() {
    const res = await this.request('GET', '/auth/csrf');
    assert.equal(res.status, 200);
    this.csrf = (res.data as { csrfToken: string }).csrfToken;
  }
}

async function apiJson(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: { code: string; message: string };
  };
  return { status: res.status, data: payload.data, error: payload.error };
}

function waitForSocketEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Socket event "${event}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

let restOwnerId = '';
let rest2OwnerId = '';
let restaurantId = '';
let restaurant2Id = '';
let customerId = '';
let extCustomerId = '';
let courierAId = '';
let courierBId = '';

let restToken = '';
let rest2Token = '';
let courierAToken = '';
let courierBToken = '';

const customer = new CustomerSession();
let customerAddressId = '';
let createdDishId = '';
let historicalOrderId = '';
let onDemandOrderId = '';
let extOrderId = '';
let restSocket: Socket | undefined;
let courierASocket: Socket | undefined;
let extSocket: Socket | undefined;

before(async () => {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200, 'Start PostgreSQL and Backend on 8081 before integration tests');
  await customer.init();
});

after(async () => {
  restSocket?.disconnect();
  courierASocket?.disconnect();
  extSocket?.disconnect();

  const orderIds = [historicalOrderId, onDemandOrderId, extOrderId].filter(Boolean);
  if (orderIds.length) {
    await db.deliveryOffer.deleteMany({ where: { delivery: { orderId: { in: orderIds } } } });
    await db.deliveryRequest.deleteMany({ where: { delivery: { orderId: { in: orderIds } } } });
    await db.courierAssignment.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.deliveryStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.delivery.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
  }

  const restIds = [restaurantId, restaurant2Id].filter(Boolean);
  if (restIds.length) {
    await db.post.deleteMany({ where: { restaurantId: { in: restIds } } });
    await db.dish.deleteMany({ where: { restaurantId: { in: restIds } } });
    await db.restaurantCategory.deleteMany({ where: { restaurantId: { in: restIds } } });
    await db.restaurantCourierAffiliation.deleteMany({ where: { restaurantId: { in: restIds } } });
    await db.restaurant.deleteMany({ where: { id: { in: restIds } } });
  }

  const userIds = [restOwnerId, rest2OwnerId, customerId, extCustomerId, courierAId, courierBId].filter(Boolean);
  if (userIds.length) {
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await db.$disconnect();
});

test('Restaurant auth, role isolation, onboarding, categories, dishes, and draft vs published posts', async () => {
  // Password mismatch rejected
  const badReg = await apiJson('POST', '/restaurant-account/auth/register', undefined, {
    email: `rest1_${suffix}@test.uz`,
    password,
    confirmPassword: 'DifferentPassword1!',
  });
  assert.equal(badReg.status, 400);

  // Register Restaurant 1
  const reg1 = await apiJson('POST', '/restaurant-account/auth/register', undefined, {
    email: `rest1_${suffix}@test.uz`,
    password,
    confirmPassword: password,
    restaurantName: `Test Kitchen ${suffix}`,
  });
  assert.equal(reg1.status, 201, JSON.stringify(reg1.error));
  const d1 = reg1.data as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; role: string; restaurantId: string; onboardingCompleted: boolean };
  };
  assert.equal(d1.user.role, 'RESTAURANT');
  assert.equal(d1.user.onboardingCompleted, false);
  restToken = d1.accessToken;
  restOwnerId = d1.user.id;
  restaurantId = d1.user.restaurantId;

  // Refresh rotation
  const refreshed = await apiJson('POST', '/restaurant-account/auth/refresh', undefined, {
    refreshToken: d1.refreshToken,
  });
  assert.equal(refreshed.status, 200);
  restToken = (refreshed.data as { accessToken: string }).accessToken;

  // Register Restaurant 2
  const reg2 = await apiJson('POST', '/restaurant-account/auth/register', undefined, {
    email: `rest2_${suffix}@test.uz`,
    password,
    confirmPassword: password,
    restaurantName: `Foreign Kitchen ${suffix}`,
  });
  assert.equal(reg2.status, 201);
  const d2 = reg2.data as { accessToken: string; user: { id: string; restaurantId: string } };
  rest2Token = d2.accessToken;
  rest2OwnerId = d2.user.id;
  restaurant2Id = d2.user.restaurantId;

  // Complete Onboarding for Restaurant 1
  const hours = [1, 2, 3, 4, 5, 6, 0].map(day => ({
    day,
    label: `D${day}`,
    isOpen: true,
    openTime: '09:00',
    closeTime: '23:00',
    overnight: false,
  }));
  const onboard = await apiJson('PUT', '/restaurant-account/onboarding', restToken, {
    name: `UzBite Test Plov ${suffix}`,
    description: 'Authentic test kitchen',
    phone: '+998901234567',
    addressText: 'Tashkent, Amir Temur 10',
    landmark: 'Next to metro',
    latitude: 41.3112,
    longitude: 69.2797,
    businessHours: hours,
    timezone: 'Asia/Tashkent',
    acceptCash: true,
    acceptCard: false,
    ownCouriersEnabled: true,
    onDemandCouriersEnabled: true,
    preferredMode: 'OWN_COURIER',
    deliveryFee: 12000,
    courierRewardFee: 10000,
  });
  assert.equal(onboard.status, 200, JSON.stringify(onboard.error));
  assert.equal((onboard.data as { onboardingCompleted: boolean; isOpen: boolean }).onboardingCompleted, true);
  assert.equal((onboard.data as { isOpen: boolean }).isOpen, true);

  // Reserved category "Все" cannot be created
  assert.equal(
    (await apiJson('POST', '/restaurant-account/categories', restToken, { name: 'Все' })).status,
    400,
  );

  // Create category & dish
  const catRes = await apiJson('POST', '/restaurant-account/categories', restToken, { name: 'Горячее' });
  assert.equal(catRes.status, 201);
  const catId = (catRes.data as { id: string }).id;

  const dishRes = await apiJson('POST', '/restaurant-account/dishes', restToken, {
    categoryId: catId,
    sku: `SKU-${suffix}`,
    name: 'Фирменный плов',
    description: 'Свежий плов',
    price: 45000,
    isAvailable: true,
  });
  assert.equal(dishRes.status, 201);
  createdDishId = (dishRes.data as { id: string }).id;

  // Restaurant 2 MUST NOT edit Restaurant 1's dish
  assert.equal(
    (await apiJson('PATCH', `/restaurant-account/dishes/${createdDishId}`, rest2Token, { price: 1 })).status,
    404,
  );

  // Create DRAFT post (should NOT appear in public feed) vs PUBLISHED post (MUST appear)
  const draftPost = await apiJson('POST', '/restaurant-account/posts', restToken, {
    title: 'Черновик',
    caption: 'Hidden draft caption',
    status: 'DRAFT',
    aspectRatio: '9:16',
    mediaType: 'VIDEO',
    mediaUrl: '/media/pasta-making-720p.mp4',
    dishId: createdDishId,
  });
  assert.equal(draftPost.status, 201);
  const draftId = (draftPost.data as { id: string }).id;

  const pubPost = await apiJson('POST', '/restaurant-account/posts', restToken, {
    title: 'Плов дня',
    caption: `Published plov ${suffix}`,
    status: 'PUBLISHED',
    aspectRatio: '16:9',
    mediaType: 'VIDEO',
    mediaUrl: '/media/noodles-cooking-720p.mp4',
    dishId: createdDishId,
  });
  assert.equal(pubPost.status, 201);
  const pubId = (pubPost.data as { id: string }).id;

  const publicDetail = await customer.request('GET', `/restaurants/${restaurantId}`);
  assert.equal(publicDetail.status, 200);
  const publicPostIds = ((publicDetail.data as { posts: Array<{ id: string }> }).posts).map(p => p.id);
  assert.ok(publicPostIds.includes(pubId));
  assert.ok(!publicPostIds.includes(draftId));
});

test('Excel & CSV import preview, formula injection rejection, bulk price update preserving historical orders, and exports', async () => {
  // Register customer and create historical order at price 45000 BEFORE bulk update
  const regCust = await customer.request('POST', '/auth/register', {
    email: `cust_${suffix}@test.uz`,
    password,
  });
  assert.equal(regCust.status, 201);
  customerId = (regCust.data as { id: string }).id;

  // Customer must be rejected from restaurant & courier endpoints
  assert.equal((await customer.request('GET', '/restaurant-account/dashboard')).status, 401);
  assert.equal((await customer.request('GET', '/courier/delivery-offers')).status, 401);

  const addrRes = await customer.request('POST', '/addresses', {
    latitude: 41.315,
    longitude: 69.285,
    addressText: 'Tashkent, Navoi 5',
    label: 'Home',
    entrance: '2',
    floor: '4',
    apartment: '18',
  });
  assert.equal(addrRes.status, 201);
  customerAddressId = (addrRes.data as { id: string }).id;

  // Connect Restaurant Socket.IO before placing order
  restSocket = io(base, {
    transports: ['websocket'],
    auth: { token: restToken },
    reconnection: false,
    timeout: 4000,
  });
  await new Promise<void>((resolve, reject) => {
    restSocket!.once('connect', resolve);
    restSocket!.once('connect_error', reject);
  });
  const joined = await new Promise<{ ok: boolean }>(resolve =>
    restSocket!.emit('restaurant:join', restaurantId, resolve),
  );
  assert.equal(joined.ok, true);

  const orderCreatedPromise = waitForSocketEvent<{ id: string }>(restSocket!, 'order:created');

  const orderRes = await customer.request('POST', '/orders', {
    items: [{ dishId: createdDishId, quantity: 2 }],
    addressId: customerAddressId,
    recipientName: 'Aziz Customer',
    recipientPhone: '+998909876543',
    paymentMethod: 'CASH',
  });
  assert.equal(orderRes.status, 201, JSON.stringify(orderRes.error));
  historicalOrderId = (orderRes.data as { id: string }).id;

  const receivedViaSocket = await orderCreatedPromise;
  assert.equal(receivedViaSocket.id, historicalOrderId);

  // Download menu template .xlsx & .csv
  const tplXlsx = await fetch(`${base}/api/restaurant-account/imports/template?format=xlsx`, {
    headers: { Authorization: `Bearer ${restToken}` },
  });
  assert.equal(tplXlsx.status, 200);
  const tplBuf = Buffer.from(await tplXlsx.arrayBuffer());
  assert.equal(tplBuf[0], 0x50); // ZIP PK

  // Build Excel file updating SKU-${suffix} price 45000 -> 52000, adding a new dish, and including a formula injection row
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Меню');
  ws.addRow(['Артикул', 'Название', 'Описание', 'Категория', 'Цена', 'Доступность']);
  ws.addRow([`SKU-${suffix}`, 'Фирменный плов', 'Обновлённый состав', 'Горячее', 52000, 'Да']);
  ws.addRow([`SKU-NEW-${suffix}`, 'Самса с тыквой (O‘zbek)', 'Свежая выпечка', 'Выпечка', 18000, 'Да']);
  ws.addRow([`SKU-BAD-${suffix}`, '=CMD|"calc"!A0', 'Опасная строка', 'Выпечка', 10000, 'Да']);
  const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());

  const form = new FormData();
  form.set('conflictMode', 'UPDATE_EXISTING');
  form.set('file', new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'update.xlsx');
  const prevRes = await fetch(`${base}/api/restaurant-account/imports/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${restToken}` },
    body: form,
  });
  assert.equal(prevRes.status, 201);
  const preview = ((await prevRes.json()) as {
    data: {
      jobId: string;
      summary: { addCount: number; updateCount: number; errorCount: number };
      rows: Array<{ rowNumber: number; oldPrice: number | null; price: number | null; status: string }>;
    };
  }).data;

  assert.equal(preview.summary.updateCount, 1);
  assert.equal(preview.summary.addCount, 1);
  assert.equal(preview.summary.errorCount, 1);
  assert.equal(preview.rows[0]!.oldPrice, 45000);
  assert.equal(preview.rows[0]!.price, 52000);
  assert.equal(preview.rows[2]!.status, 'ERROR');

  // Confirm partial import
  const confirmRes = await apiJson('POST', `/restaurant-account/imports/${preview.jobId}/confirm`, restToken, {
    createMissingCategories: true,
    allowPartial: true,
  });
  assert.equal(confirmRes.status, 200);
  const confirmData = confirmRes.data as { addedCount: number; updatedCount: number; errorCount: number };
  assert.equal(confirmData.addedCount, 1);
  assert.equal(confirmData.updatedCount, 1);
  assert.equal(confirmData.errorCount, 1);

  // Verify historical order kept 45000 unitPrice!
  const histOrder = await apiJson('GET', `/restaurant-account/orders/${historicalOrderId}`, restToken);
  assert.equal(histOrder.status, 200);
  assert.equal((histOrder.data as { items: Array<{ unitPrice: number }> }).items[0]!.unitPrice, 45000);

  // Export orders CSV WITHOUT contacts and verify phone number is excluded
  const csvExpRes = await fetch(`${base}/api/restaurant-account/exports/orders?format=csv&includeContacts=false`, {
    headers: { Authorization: `Bearer ${restToken}` },
  });
  assert.equal(csvExpRes.status, 200);
  const csvText = await csvExpRes.text();
  assert.ok(csvText.includes(historicalOrderId));
  assert.ok(!csvText.includes('+998909876543'));
});

test('Mode A (Own Courier) workflow: invite consent, assign, reject/re-assign, ready, handover, deliver', async () => {
  // Register Courier A and Courier B
  const regCA = await apiJson('POST', '/courier/auth/register', undefined, {
    email: `courierA_${suffix}@test.uz`,
    password,
    name: 'Courier A',
    phone: '+998901110001',
  });
  assert.equal(regCA.status, 201);
  courierAToken = (regCA.data as { accessToken: string }).accessToken;
  courierAId = (regCA.data as { user: { id: string } }).user.id;

  const regCB = await apiJson('POST', '/courier/auth/register', undefined, {
    email: `courierB_${suffix}@test.uz`,
    password,
    name: 'Courier B',
    phone: '+998901110002',
  });
  assert.equal(regCB.status, 201);
  courierBToken = (regCB.data as { accessToken: string }).accessToken;
  courierBId = (regCB.data as { user: { id: string } }).user.id;

  // Restaurant cannot assign unaffiliated Courier A directly
  assert.equal((await apiJson('POST', `/restaurant-account/orders/${historicalOrderId}/accept`, restToken)).status, 200);
  assert.equal(
    (await apiJson('POST', `/restaurant-account/deliveries/${historicalOrderId}/assign-own`, restToken, {
      courierId: courierAId,
    })).status,
    409,
  );

  // Invite Courier A and Courier A accepts invitation
  const invRes = await apiJson('POST', '/restaurant-account/couriers/invitations', restToken, {
    identifier: `courierA_${suffix}@test.uz`,
  });
  assert.equal(invRes.status, 201);
  const inviteCode = (invRes.data as { inviteCode: string }).inviteCode;
  assert.equal(
    (await apiJson('POST', '/courier/affiliations/accept', courierAToken, { inviteCode })).status,
    200,
  );

  // Connect Courier A Socket.IO
  courierASocket = io(base, {
    transports: ['websocket'],
    auth: { token: courierAToken },
    reconnection: false,
    timeout: 4000,
  });
  await new Promise<void>((resolve, reject) => {
    courierASocket!.once('connect', resolve);
    courierASocket!.once('connect_error', reject);
  });

  // Restaurant assigns Courier A; Courier A receives Socket.IO offer and rejects it
  const offerPromise = waitForSocketEvent<{ offerId: string }>(courierASocket!, 'delivery:offer_created');
  const assign1 = await apiJson('POST', `/restaurant-account/deliveries/${historicalOrderId}/assign-own`, restToken, {
    courierId: courierAId,
  });
  assert.equal(assign1.status, 200);
  const firstOffer = await offerPromise;
  assert.equal(
    (await apiJson('POST', `/courier/delivery-offers/${firstOffer.offerId}/reject`, courierAToken, {
      reason: 'Busy',
    })).status,
    200,
  );

  // Re-assign Courier A -> Courier A accepts -> Order stays ACCEPTED (NOT DELIVERING yet!)
  const offerPromise2 = waitForSocketEvent<{ offerId: string }>(courierASocket!, 'delivery:offer_created');
  assert.equal(
    (await apiJson('POST', `/restaurant-account/deliveries/${historicalOrderId}/assign-own`, restToken, {
      courierId: courierAId,
    })).status,
    200,
  );
  const secondOffer = await offerPromise2;
  const acceptRes = await apiJson('POST', `/courier/delivery-offers/${secondOffer.offerId}/accept`, courierAToken);
  assert.equal(acceptRes.status, 200);
  const afterAccept = acceptRes.data as { status: string; delivery: { id: string; status: string } };
  assert.equal(afterAccept.status, 'ACCEPTED');
  assert.equal(afterAccept.delivery.status, 'COURIER_ACCEPTED');

  // Restaurant prepares, marks ready, hands over -> Courier sets ON_THE_WAY & DELIVERED
  assert.equal(
    (await apiJson('PATCH', `/restaurant-account/orders/${historicalOrderId}/status`, restToken, {
      status: 'PREPARING',
    })).status,
    200,
  );
  assert.equal(
    (await apiJson('POST', `/restaurant-account/deliveries/${historicalOrderId}/mark-ready`, restToken)).status,
    200,
  );
  assert.equal(
    (await apiJson('POST', `/restaurant-account/deliveries/${historicalOrderId}/handover`, restToken, {
      startDelivery: false,
    })).status,
    200,
  );
  // Cannot cancel assignment after handover!
  assert.equal(
    (await apiJson('POST', `/restaurant-account/deliveries/${historicalOrderId}/cancel-assignment`, restToken, {
      reason: 'Too late',
    })).status,
    409,
  );
  const onWay = await apiJson('PATCH', `/courier/deliveries/${afterAccept.delivery.id}/status`, courierAToken, {
    status: 'ON_THE_WAY',
  });
  assert.equal(onWay.status, 200);
  assert.equal((onWay.data as { status: string }).status, 'DELIVERING');

  // Confirm cash payment & complete delivery
  const paymentId = (await apiJson('GET', `/restaurant-account/orders/${historicalOrderId}`, restToken))
    .data as { payment: { id: string } };
  assert.equal(
    (await apiJson('POST', `/restaurant-account/payments/${paymentId.payment.id}/confirm`, restToken)).status,
    200,
  );

  const delivered = await apiJson('PATCH', `/courier/deliveries/${afterAccept.delivery.id}/status`, courierAToken, {
    status: 'DELIVERED',
  });
  assert.equal(delivered.status, 200);
  assert.equal((delivered.data as { status: string }).status, 'DELIVERED');
});

test('Mode B (On-Demand Courier) atomic race condition: only one courier wins concurrent acceptance', async () => {
  // Now customer has no active order -> place a new order
  const orderRes = await customer.request('POST', '/orders', {
    items: [{ dishId: createdDishId, quantity: 1 }],
    addressId: customerAddressId,
    recipientName: 'Aziz OnDemand',
    recipientPhone: '+998909876543',
    paymentMethod: 'CASH',
  });
  assert.equal(orderRes.status, 201, JSON.stringify(orderRes.error));
  onDemandOrderId = (orderRes.data as { id: string }).id;

  // Restaurant accepts and broadcasts on-demand search
  assert.equal((await apiJson('POST', `/restaurant-account/orders/${onDemandOrderId}/accept`, restToken)).status, 200);
  const searchRes = await apiJson(
    'POST',
    `/restaurant-account/deliveries/${onDemandOrderId}/request-on-demand`,
    restToken,
  );
  assert.equal(searchRes.status, 200);
  const searchData = searchRes.data as { delivery: { status: string; offers: unknown[] } };
  assert.equal(searchData.delivery.status, 'SEARCHING');

  // Both Courier A and Courier B fetch their pending offers
  const offersA = ((await apiJson('GET', '/courier/delivery-offers', courierAToken)).data as Array<{
    id: string;
    deliveryId: string;
  }>).filter(o => o.deliveryId === (searchRes.data as { delivery: { id: string } }).delivery.id);
  const offersB = ((await apiJson('GET', '/courier/delivery-offers', courierBToken)).data as Array<{
    id: string;
    deliveryId: string;
  }>).filter(o => o.deliveryId === (searchRes.data as { delivery: { id: string } }).delivery.id);

  assert.equal(offersA.length, 1);
  assert.equal(offersB.length, 1);

  // Concurrent acceptance: ONLY ONE MUST WIN (200), SECOND MUST GET 409
  const [resA, resB] = await Promise.all([
    apiJson('POST', `/courier/delivery-offers/${offersA[0]!.id}/accept`, courierAToken),
    apiJson('POST', `/courier/delivery-offers/${offersB[0]!.id}/accept`, courierBToken),
  ]);
  assert.deepEqual([resA.status, resB.status].sort((a, b) => a - b), [200, 409]);

  // Verify Foreign Restaurant 2 still cannot view Restaurant 1's order
  assert.equal((await apiJson('GET', `/restaurant-account/orders/${onDemandOrderId}`, rest2Token)).status, 404);
});

test('External Customer Client connects cleanly with Bearer tokens, reads backend static media, and exchanges orders with Restaurant Desktop', async () => {
  // Static seed assets served directly by Backend (without apps/frontend)
  const imgRes = await fetch(`${base}/images/uzbite/plov.jpg`);
  assert.equal(imgRes.status, 200);
  const videoRangeRes = await fetch(`${base}/media/pasta-making-720p.mp4`, {
    headers: { Range: 'bytes=0-31' },
  });
  assert.equal(videoRangeRes.status, 206);

  // Separate customer SPA / mobile client running on http://localhost:5173 registers via Bearer token API
  const externalOrigin = 'http://localhost:5173';
  const regRes = await fetch(`${base}/api/auth/token/register`, {
    method: 'POST',
    headers: { Origin: externalOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `ext_${suffix}@test.uz`, password, language: 'ru', theme: 'light' }),
  });
  assert.equal(regRes.status, 201);
  const regData = (
    (await regRes.json()) as { data: { accessToken: string; refreshToken: string; user: { id: string } } }
  ).data;
  extCustomerId = regData.user.id;
  let extAccess = regData.accessToken;

  // Refresh rotation via Bearer token endpoint
  const refRes = await fetch(`${base}/api/auth/token/refresh`, {
    method: 'POST',
    headers: { Origin: externalOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: regData.refreshToken }),
  });
  assert.equal(refRes.status, 200);
  const refData = ((await refRes.json()) as { data: { accessToken: string; refreshToken: string } }).data;
  extAccess = refData.accessToken;

  // Create address & order with Bearer token (no cookies/CSRF required)
  const addrRes = await fetch(`${base}/api/addresses`, {
    method: 'POST',
    headers: {
      Origin: externalOrigin,
      Authorization: `Bearer ${extAccess}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      latitude: 41.32,
      longitude: 69.29,
      addressText: 'External Client Street 7',
      label: 'Client',
    }),
  });
  assert.equal(addrRes.status, 201);
  const extAddrId = ((await addrRes.json()) as { data: { id: string } }).data.id;

  const restGotOrder = waitForSocketEvent<{ id: string }>(restSocket!, 'order:created');
  const orderCreateRes = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: {
      Origin: externalOrigin,
      Authorization: `Bearer ${extAccess}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ dishId: createdDishId, quantity: 1 }],
      addressId: extAddrId,
      recipientName: 'External Client User',
      recipientPhone: '+998901234500',
      paymentMethod: 'CASH',
    }),
  });
  assert.equal(orderCreateRes.status, 201, await orderCreateRes.clone().text());
  extOrderId = ((await orderCreateRes.json()) as { data: { id: string } }).data.id;
  assert.equal((await restGotOrder).id, extOrderId);

  // External client joins order room and receives Restaurant Desktop status change in real time
  extSocket = io(base, {
    transports: ['websocket'],
    auth: { token: extAccess },
    extraHeaders: { Origin: externalOrigin },
    reconnection: false,
    timeout: 4000,
  });
  await new Promise<void>((resolve, reject) => {
    extSocket!.once('connect', resolve);
    extSocket!.once('connect_error', reject);
  });
  const extJoined = await new Promise<{ ok: boolean }>(resolve =>
    extSocket!.emit('order:join', extOrderId, resolve),
  );
  assert.equal(extJoined.ok, true);

  const clientGotUpdate = waitForSocketEvent<{ id: string; status: string }>(extSocket, 'order:updated');
  assert.equal((await apiJson('POST', `/restaurant-account/orders/${extOrderId}/accept`, restToken)).status, 200);
  const updated = await clientGotUpdate;
  assert.equal(updated.id, extOrderId);
  assert.equal(updated.status, 'ACCEPTED');

  const outRes = await fetch(`${base}/api/auth/token/logout`, {
    method: 'POST',
    headers: {
      Origin: externalOrigin,
      Authorization: `Bearer ${extAccess}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: refData.refreshToken }),
  });
  assert.equal(outRes.status, 200);
});
