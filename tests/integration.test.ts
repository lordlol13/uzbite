import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { db } from '../apps/backend/src/config/database.js';
import { updateOrderState } from '../apps/backend/src/services/order-status.js';
import { ApiError } from '../apps/backend/src/utils/errors.js';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8081';
const origin = process.env.TEST_ORIGIN ?? 'http://localhost:8080';
const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
const password = `UzBiteTest_${suffix}!`;
const unicodePassword = 'я'.repeat(36);
type Json = Record<string, unknown>;
class BrowserSession {
  cookies = new Map<string, string>();
  csrf = '';
  cookieHeader() { return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '); }
  async request(method: string, path: string, body?: unknown) {
    const response = await fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: this.cookieHeader(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(method === 'GET' ? {} : { 'X-CSRF-Token': this.csrf }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) { const [pair] = cookie.split(';'); const index = pair!.indexOf('='); this.cookies.set(pair!.slice(0, index), pair!.slice(index + 1)); }
    const payload = await response.json() as { data?: unknown; error?: { code: string; message: string }; pagination?: { page: number; pageSize: number; total: number; hasMore: boolean }; unreadCount?: number };
    return { status: response.status, data: payload.data, error: payload.error, pagination: payload.pagination, unreadCount: payload.unreadCount };
  }
  async init() { const response = await this.request('GET', '/auth/csrf'); assert.equal(response.status, 200); this.csrf = (response.data as { csrfToken: string }).csrfToken; }
}
const alice = new BrowserSession();
const bob = new BrowserSession();
let aliceId = '', bobId = '', addressId = '', activeOrderId = '', firstCommentId = '';
let socket: Socket | undefined;
before(async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200, 'Start PostgreSQL, migrate/seed, and run API before integration tests');
  await alice.init(); await bob.init();
});
after(async () => {
  socket?.disconnect();
  const userIds = [aliceId, bobId].filter(Boolean);
  if (userIds.length) {
    await db.review.deleteMany({ where: { userId: { in: userIds } } });
    await db.payment.deleteMany({ where: { order: { userId: { in: userIds } } } });
    await db.orderItem.deleteMany({ where: { order: { userId: { in: userIds } } } });
    await db.order.deleteMany({ where: { userId: { in: userIds } } });
    await db.upload.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await db.$disconnect();
});
test('Authentication: registration, safe role assignment, wrong password, refresh rotation, session persistence', async () => {
  const simple = new BrowserSession(); await simple.init();
  assert.equal((await simple.request('POST', '/auth/register', { login: `simple_${suffix}`, password })).status, 400);
  assert.equal((await simple.request('POST', '/auth/register', { email: 'invalid-email', password })).status, 400);
  const simpleEmail = `simple_${suffix}@example.test`;
  const minimal = await simple.request('POST','/auth/register',{email:`  SIMPLE_${suffix.toUpperCase()}@EXAMPLE.TEST  `,password});
  assert.equal(minimal.status,201); const minimalId=(minimal.data as Json).id as string;
  try {
    assert.equal((minimal.data as Json).email,simpleEmail);
    assert.match((minimal.data as Json).username as string, /^user_[a-f0-9]{20}$/);
    assert.equal((minimal.data as Json).name,(minimal.data as Json).username);
    assert.equal((minimal.data as Json).usernameChangedAt,null);
    assert.equal((await simple.request('POST', '/auth/register', { email: simpleEmail.toUpperCase(), password })).status, 409);
    const chosenNickname = `chosen_${suffix}`;
    const profile = await simple.request('PATCH', '/profile', { nickname: chosenNickname });
    assert.equal(profile.status, 200);
    assert.equal((profile.data as Json).username, chosenNickname);
    assert.equal((profile.data as Json).name, chosenNickname);
    assert.equal((profile.data as Json).email, simpleEmail);
    assert.equal((await simple.request('POST','/auth/logout')).status,200);
    assert.equal((await simple.request('POST','/auth/login',{login:chosenNickname,password})).status,400);
    const signedIn = await simple.request('POST','/auth/login',{email:simpleEmail.toUpperCase(),password});
    assert.equal(signedIn.status,200);
    assert.equal((signedIn.data as Json).username,chosenNickname);
    assert.equal((await simple.request('POST','/auth/login',{email:simpleEmail,password:'wrong-pass'})).status,401);
  } finally { await db.user.delete({where:{id:minimalId}}); }
  const blocked = await alice.request('POST', '/auth/register', { email: `role_${suffix}@example.test`, password, role: 'RESTAURANT' });
  assert.equal(blocked.status, 400);
  const unicode = await alice.request('POST', '/auth/register', { email: `unicode_${suffix}@example.test`, password: 'я'.repeat(37) }); assert.equal(unicode.status, 400);
  const created = await alice.request('POST', '/auth/register', { email: `alice_${suffix}@example.test`, password, language: 'en', theme: 'dark' });
  assert.equal(created.status, 201, JSON.stringify(created.error)); aliceId = (created.data as Json).id as string;
  assert.equal((created.data as Json).role, 'USER'); assert.equal('passwordHash' in (created.data as Json), false);
  assert.deepEqual((created.data as Json).settings, { userId: aliceId, language: 'en', theme: 'dark' });
  const second = await bob.request('POST', '/auth/register', { email: `bob_${suffix}@example.test`, password: unicodePassword });
  assert.equal(second.status, 201); bobId = (second.data as Json).id as string;
  const unicodeLogin = new BrowserSession(); await unicodeLogin.init();
  assert.equal((await unicodeLogin.request('POST', '/auth/login', { email: `bob_${suffix}@example.test`, password: unicodePassword })).status, 200);
  assert.equal((await unicodeLogin.request('POST', '/auth/login', { email: `bob_${suffix}@example.test`, password: `${unicodePassword}x` })).status, 400);
  assert.equal((await bob.request('PATCH', '/profile', { email: `bob_new_${suffix}@example.test`, currentPassword: `${unicodePassword}x` })).status, 400);
  const incorrect = new BrowserSession(); await incorrect.init();
  assert.equal((await incorrect.request('POST', '/auth/login', { email: `alice_${suffix}@example.test`, password: 'wrong-password' })).status, 401);
  assert.equal((await alice.request('GET', '/auth/me')).status, 200);
  const oldRefresh = alice.cookies.get('uzbite_refresh');
  assert.equal((await alice.request('POST', '/auth/refresh')).status, 200);
  assert.notEqual(alice.cookies.get('uzbite_refresh'), oldRefresh);
  const replay = new BrowserSession(); replay.cookies = new Map(alice.cookies); replay.csrf = alice.csrf; replay.cookies.set('uzbite_refresh', oldRefresh!);
  assert.equal((await replay.request('POST', '/auth/refresh')).status, 401);
  assert.equal((await alice.request('GET', '/auth/me')).status, 200);
  const expired = await db.session.create({ data: { userId: aliceId, refreshHash: '0'.repeat(64), expiresAt: new Date(Date.now() - 1000) } });
  const loggedIn = new BrowserSession(); await loggedIn.init();
  assert.equal((await loggedIn.request('POST', '/auth/login', { email: `alice_${suffix}@example.test`, password })).status, 200);
  assert.equal(await db.session.findUnique({ where: { id: expired.id } }), null);
  assert.equal((await loggedIn.request('POST', '/auth/logout')).status, 200);
  assert.equal((await loggedIn.request('GET', '/auth/me')).status, 401);
});
test('CSRF and private route protections reject forged requests', async () => {
  const guest = new BrowserSession(); await guest.init();
  assert.equal((await guest.request('GET', '/orders')).status, 401);
  const csrf = alice.csrf; alice.csrf = 'forged';
  assert.equal((await alice.request('PATCH', '/profile', { name: 'Forged' })).status, 403);
  alice.csrf = csrf;
  const access = alice.cookies.get('uzbite_access')!; alice.cookies.set('uzbite_access', `${access.slice(0, -8)}tampered`);
  assert.equal((await alice.request('GET', '/auth/me')).status, 401); alice.cookies.set('uzbite_access', access);
  const damaged = new BrowserSession(); damaged.cookies.set('uzbite_csrf', 'invalid-cookie'); await damaged.init(); assert.match(damaged.csrf, /^[a-f0-9]{64}$/);
});
test('Catalog searches restaurants, dishes and categories with real media; profile details keep bank data private', async () => {
  for (const q of ['Osh', 'плов', 'Бургеры']) {
    const response = await alice.request('GET', `/restaurants?q=${encodeURIComponent(q)}`);
    assert.equal(response.status, 200); assert.ok((response.data as { items: unknown[] }).items.length > 0, `No results for ${q}`);
  }
  const detail = await alice.request('GET', '/restaurants/rest-osh');
  assert.equal(detail.status, 200); assert.ok(Array.isArray((detail.data as Json).dishes)); assert.equal('paymentDetails' in (detail.data as Json), false);
  const gallery = (detail.data as Json).galleryUrls as string[];
  assert.ok(Array.isArray(gallery) && gallery.length > 1);
  assert.equal(new Set(gallery).size, gallery.length);
  assert.ok(gallery.every(url => typeof url === 'string' && url.startsWith('/images/uzbite/')));
  assert.equal(((detail.data as Json).addressText as string).includes('демонстрационная точка'), false);
  const feed = await alice.request('GET', '/feed'); assert.equal(feed.status, 200);
  assert.ok((feed.data as { items: { media: unknown[] }[] }).items.every(post => post.media.length));
  const opened = await alice.request('GET', '/restaurants?open=true');
  assert.equal(opened.status, 200);
  assert.equal((opened.data as Json).total, await db.restaurant.count({ where: { isOpen: true } }));
  assert.ok(((opened.data as Json).items as Json[]).every(item => item.isOpen && Array.isArray(item.cuisines)));
  const free = await alice.request('GET', '/restaurants?freeDelivery=true&open=true');
  assert.equal((free.data as Json).total, await db.restaurant.count({ where: { deliveryFee: 0, isOpen: true } }));
  assert.ok(((free.data as Json).items as Json[]).every(item => Number(item.deliveryFee) === 0 && item.isOpen));
  const cheap = await alice.request('GET', '/restaurants?sort=delivery');
  const fees = ((cheap.data as Json).items as Json[]).map(item => Number(item.deliveryFee));
  assert.deepEqual(fees, [...fees].sort((a, b) => a - b));
  const popular = await alice.request('GET', '/restaurants?sort=popular');
  const counts = ((popular.data as Json).items as Json[]).map(item => Number(item.followerCount));
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  const first = await alice.request('GET', '/restaurants?sort=delivery&pageSize=1');
  const second = await alice.request('GET', '/restaurants?sort=delivery&pageSize=1&page=2');
  assert.notEqual(((first.data as Json).items as Json[])[0]?.id, ((second.data as Json).items as Json[])[0]?.id);
  assert.equal((await alice.request('GET', '/restaurants?sort=fastest')).status, 400);
});
test('Likes, replies, follows persist and verified reviews require a delivered owned order', async () => {
  assert.equal((await alice.request('PUT', '/posts/post-rest-osh/like', { liked: true })).status, 200);
  assert.equal((await alice.request('PUT', '/posts/post-rest-osh/like', { liked: true })).status, 200);
  assert.equal(await db.like.count({ where: { userId: aliceId, postId: 'post-rest-osh' } }), 1);
  assert.equal((await alice.request('GET', '/profile/likes')).status, 200);
  assert.equal((await alice.request('PUT', '/posts/post-rest-osh/like', { liked: false })).status, 200);
  assert.equal(await db.like.count({ where: { userId: aliceId } }), 0);
  const comment = await alice.request('POST', '/posts/post-rest-osh/comments', { text: 'Looks excellent' });
  assert.equal(comment.status, 201); firstCommentId = (comment.data as Json).id as string;
  assert.equal((await bob.request('POST', '/posts/post-rest-osh/comments', { text: 'Agreed', parentId: firstCommentId })).status, 201);
  const comments = await alice.request('GET', '/posts/post-rest-osh/comments'); assert.ok((comments.data as { replies: unknown[] }[]).some(comment => comment.replies.length));
  assert.equal((await alice.request('PUT', '/restaurants/rest-osh/follow', { following: true })).status, 200);
  const following = await alice.request('GET', '/feed?following=true'); assert.ok((following.data as { items: unknown[] }).items.length > 0);
  assert.equal((await alice.request('PUT', '/restaurants/rest-osh/follow', { following: false })).status, 200);
  assert.equal((await alice.request('GET', '/feed?following=true')).status, 200);
  assert.equal((await alice.request('POST', '/restaurants/rest-osh/reviews', { orderId: 'nonexistent', rating: 5, text: 'Fake review' })).status, 404);
});
test('Saved addresses: ownership, one default, editing and deletion', async () => {
  const input = { latitude: 41.31, longitude: 69.28, addressText: 'User entered test address, Tashkent', label: 'Test home' };
  const first = await alice.request('POST', '/addresses', input); assert.equal(first.status, 201); addressId = (first.data as Json).id as string; assert.equal((first.data as Json).isDefault, true);
  const second = await alice.request('POST', '/addresses', { ...input, label: 'Work', isDefault: true }); assert.equal(second.status, 201);
  const secondId = (second.data as Json).id as string;
  assert.equal(await db.userAddress.count({ where: { userId: aliceId, isDefault: true } }), 1);
  assert.equal((await bob.request('PATCH', `/addresses/${addressId}`, { label: 'Hacked' })).status, 404);
  assert.equal((await bob.request('DELETE', `/addresses/${addressId}`)).status, 404);
  assert.equal((await alice.request('PATCH', `/addresses/${addressId}`, { addressText: 'Edited user entered test address', isDefault: true })).status, 200);
  const preserved = await db.userAddress.findUnique({ where: { id: addressId } }); assert.equal(preserved?.label, 'Test home');
  assert.equal((await alice.request('DELETE', `/addresses/${secondId}`)).status, 200);
});
test('Delivery address selection is private, persistent and changes restaurant estimates', async () => {
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: 'rest-basilico' } });
  const near = await alice.request('POST', '/addresses', { latitude: restaurant.latitude, longitude: restaurant.longitude, addressText: 'Delivery estimate test: near', label: 'ETA near' });
  assert.equal(near.status, 201); let nearId = (near.data as Json).id as string;
  let farId = '';
  try {
    const far = await alice.request('POST', '/addresses', { latitude: restaurant.latitude + 0.15, longitude: restaurant.longitude + 0.15, addressText: 'Delivery estimate test: far', label: 'ETA far' });
    assert.equal(far.status, 201); farId = (far.data as Json).id as string;
    assert.equal((await bob.request('PUT', '/addresses/delivery', { addressId: nearId })).status, 404);
    assert.equal((await alice.request('PUT', '/addresses/delivery', { addressId: nearId })).status, 200);
    const current = await alice.request('GET', '/addresses/delivery');
    assert.equal(((current.data as Json).address as Json).id, nearId);
    assert.equal((current.data as Json).source, 'selected');
    const nearCatalog = await alice.request('GET', '/restaurants?q=Basilico');
    const nearEstimate = (((nearCatalog.data as Json).items as Json[])[0]!.deliveryEstimate) as Json;
    assert.equal(nearEstimate.distanceKm, 0);
    assert.ok(Number(nearEstimate.minMinutes) >= restaurant.preparationMinutes);
    assert.equal((await alice.request('PUT', '/addresses/delivery', { addressId: farId })).status, 200);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: aliceId } })).deliveryAddressId, farId);
    const farCatalog = await alice.request('GET', '/restaurants?q=Basilico');
    const farEstimate = (((farCatalog.data as Json).items as Json[])[0]!.deliveryEstimate) as Json;
    assert.ok(Number(farEstimate.minMinutes) > Number(nearEstimate.maxMinutes));
    const guest = new BrowserSession(); await guest.init();
    assert.equal((await guest.request('GET', '/addresses/delivery')).status, 401);
    const publicCatalog = await guest.request('GET', '/restaurants');
    assert.ok(((publicCatalog.data as Json).items as Json[]).every(item => item.deliveryEstimate === null));
    const closed = await alice.request('GET', '/restaurants?q=Saffron');
    assert.equal(((closed.data as Json).items as Json[])[0]!.deliveryEstimate, null);
    assert.equal((await alice.request('DELETE', `/addresses/${farId}`)).status, 200); farId = '';
    assert.equal(((await alice.request('GET', '/addresses/delivery')).data as Json).source, 'default');
    assert.equal((((await alice.request('GET', '/addresses/delivery')).data as Json).address as Json).id, addressId);
    assert.equal((await alice.request('DELETE', `/addresses/${nearId}`)).status, 200); nearId = '';
  } finally {
    if (nearId) await alice.request('DELETE', `/addresses/${nearId}`);
    if (farId) await alice.request('DELETE', `/addresses/${farId}`);
  }
});

test('Cart prices come from server; mixed restaurants, invalid quantities and unavailable CARD are rejected', async () => {
  assert.equal((await alice.request('POST', '/orders/quote', { items: [{ dishId: 'dish-plov', quantity: 2 }, { dishId: 'dish-burger', quantity: 1 }] })).status, 400);
  assert.equal((await alice.request('POST', '/orders/quote', { items: [{ dishId: 'dish-plov', quantity: 0 }] })).status, 400);
  const quote = await alice.request('POST', '/orders/quote', { items: [{ dishId: 'dish-plov', quantity: 2 }] });
  assert.equal(quote.status, 200); const value = quote.data as { subtotal: number; deliveryFee: number; total: number; items: { unitPrice: number }[] };
  assert.equal(value.total, value.subtotal + value.deliveryFee); assert.equal(value.subtotal, value.items[0]!.unitPrice * 2);
  assert.equal((await alice.request('POST', '/orders', { items: [{ dishId: 'dish-plov', quantity: 1 }], addressId, recipientName: 'Alice Test', recipientPhone: '+998901234567', paymentMethod: 'CARD' })).status, 409);
});
test('Cloud uploads report missing real credentials and reject public access to private receipts', async () => {
  const health = await fetch(`${base}/api/health`).then(response => response.json()) as { data: { storage: boolean } };
  if (!health.data.storage) {
    const form = new FormData(); form.set('file', new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'test.png');
    const response = await fetch(`${base}/api/uploads/avatar`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookieHeader(), 'X-CSRF-Token': alice.csrf }, body: form });
    assert.equal(response.status, 503); assert.equal((await response.json() as { error: { code: string } }).error.code, 'STORAGE_NOT_CONFIGURED');
  }
  const guest = new BrowserSession(); await guest.init();
  assert.equal((await guest.request('GET', '/uploads/nonexistent-receipt')).status, 401);
  // Private DB fixture tests authorization only; this does not claim an S3 file was uploaded.
  const receipt = await db.upload.create({ data: { userId: aliceId, key: `test/${suffix}/private-receipt.png`, mimeType: 'image/png', size: 8, purpose: 'RECEIPT' } });
  assert.equal((await bob.request('GET', `/uploads/${receipt.id}`)).status, 404);
});
test('Checkout accepts a small order and keeps the courier note in its own address snapshot', async () => {
  const saved = await bob.request('POST', '/addresses', { label: 'Test', addressText: 'Courier note test address', latitude: 41.31, longitude: 69.28, comment: 'Saved address note', isDefault: false });
  assert.equal(saved.status, 201);
  const savedId = (saved.data as Json).id as string;
  const items = [{ dishId: 'dish-achichuk', quantity: 1 }];
  const quote = await bob.request('POST', '/orders/quote', { items });
  assert.equal(quote.status, 200);
  const quoted = quote.data as { subtotal: number; total: number; deliveryFee: number; restaurant: { minOrder: number } };
  assert.ok(quoted.subtotal < quoted.restaurant.minOrder, 'The fixture must be below the former order minimum');
  const input = { items, addressId: savedId, recipientName: 'Courier Note Test', recipientPhone: '+998901234567', paymentMethod: 'CASH', comment: '  Call at the entrance  ' };
  assert.equal((await bob.request('POST', '/orders', { ...input, comment: 'x'.repeat(501) })).status, 400);
  const response = await bob.request('POST', '/orders', input);
  assert.equal(response.status, 201);
  const created = response.data as Json;
  try {
    assert.equal(created.total, quoted.total);
    assert.equal(created.total, quoted.subtotal + quoted.deliveryFee);
    assert.equal((created.addressSnapshot as Json).comment, 'Call at the entrance');
    assert.equal((await db.userAddress.findUniqueOrThrow({ where: { id: savedId } })).comment, 'Saved address note');
    assert.equal(((await bob.request('GET', '/orders/' + created.id)).data as Json).total, quoted.total);
    assert.equal((await alice.request('GET', '/orders/' + created.id)).status, 404);
  } finally { await updateOrderState(created.id as string, 'CANCELLED'); }
});

test('Orders: concurrent requests create exactly one active order; snapshots and ownership persist', async () => {
  const input = { items: [{ dishId: 'dish-plov', quantity: 2 }], addressId, recipientName: 'Alice Test', recipientPhone: '+998901234567', paymentMethod: 'CASH' };
  const results = await Promise.all([alice.request('POST', '/orders', input), alice.request('POST', '/orders', input)]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const created = results.find(result => result.status === 201)!.data as Json; activeOrderId = created.id as string;
  assert.equal(created.status, 'PENDING_ACCEPTANCE');
  const orderSelection = await alice.request('GET', '/addresses/delivery');
  assert.equal((orderSelection.data as Json).source, 'selected');
  assert.equal(((orderSelection.data as Json).address as Json).id, addressId);
  // Accounts created before delivery preferences recover their last order's saved address.
  await db.user.update({ where: { id: aliceId }, data: { deliveryAddressId: null } });
  const recovered = await alice.request('GET', '/addresses/delivery');
  assert.equal((recovered.data as Json).source, 'order');
  assert.equal(((recovered.data as Json).address as Json).id, addressId);
  assert.equal(await db.order.count({ where: { userId: aliceId, status: 'PENDING_ACCEPTANCE' } }), 1);
  assert.equal((await alice.request('POST', '/orders', input)).status, 409);
  assert.equal((await bob.request('GET', `/orders/${activeOrderId}`)).status, 404);
  assert.equal((await alice.request('PATCH', `/orders/${activeOrderId}`, { status: 'DELIVERED' })).status, 404);
  assert.equal((await alice.request('POST', '/restaurants/rest-osh/reviews', { orderId: activeOrderId, rating: 5, text: 'Too early' })).status, 403);
  await alice.request('PATCH', `/addresses/${addressId}`, { addressText: 'A new saved address' });
  const order = await alice.request('GET', `/orders/${activeOrderId}`);
  assert.equal(((order.data as Json).addressSnapshot as Json).addressText, 'Edited user entered test address');
  assert.equal((await alice.request('GET', '/notifications')).status, 200);
  const dish = await db.dish.findUniqueOrThrow({ where: { id: 'dish-plov' } });
  try {
    await db.dish.update({ where: { id: dish.id }, data: { name: 'Changed menu name', price: dish.price.add(5000) } });
    const historical = await alice.request('GET', `/orders/${activeOrderId}`);
    const line = ((historical.data as Json).items as Json[])[0]!;
    assert.equal(line.dishName, dish.name); assert.equal(line.unitPrice, dish.price.toNumber());
  } finally { await db.dish.update({ where: { id: dish.id }, data: { name: dish.name, price: dish.price } }); }
});
test('Order scopes separate the current order from private profile history and expose only public restaurant contacts', async () => {
  const current = await alice.request('GET', '/orders?scope=active&pageSize=1');
  assert.equal(current.status, 200);
  assert.equal(current.pagination?.total, 1);
  assert.deepEqual((current.data as Json[]).map(order => order.id), [activeOrderId]);
  const aliceHistory = await alice.request('GET', '/orders?scope=history');
  assert.equal(aliceHistory.pagination?.total, 0);
  assert.deepEqual(aliceHistory.data, []);
  const bobHistory = await bob.request('GET', '/orders?scope=history');
  assert.ok((bobHistory.pagination?.total ?? 0) > 0);
  assert.ok((bobHistory.data as Json[]).every(order => order.status === 'CANCELLED' && order.userId === bobId));
  assert.equal((await bob.request('GET', '/orders?scope=active')).pagination?.total, 0);
  assert.equal((await alice.request('GET', '/orders?scope=invalid')).status, 400);
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: 'rest-osh' } });
  const contact = (current.data as Json[])[0]!.restaurant as Json;
  assert.deepEqual(Object.keys(contact).sort(), ['id', 'logoUrl', 'name', 'phone', 'telegram']);
  assert.equal(contact.phone, restaurant.phone);
  assert.equal(contact.telegram, restaurant.telegram);
  assert.equal('paymentDetails' in contact, false);
});

test('Order notification history preserves event times and scopes unread state to the owned order', async () => {
  const foreign = await bob.request('GET', '/notifications?orderId=' + activeOrderId);
  assert.equal(foreign.status, 404);
  assert.equal((await bob.request('PATCH', '/notifications/read', { orderId: activeOrderId })).status, 404);
  const unrelated = await db.notification.create({ data: { userId: aliceId, type: 'COMMENT_REPLY', title: 'New reply', body: 'Unrelated notification', link: '/profile', metadata: { orderId: activeOrderId } } });
  const history = await alice.request('GET', '/notifications?orderId=' + activeOrderId);
  assert.equal(history.status, 200);
  assert.equal(history.unreadCount, 1);
  const records = history.data as Json[];
  assert.equal(records.length, 1);
  assert.equal(records[0]!.type, 'ORDER_CREATED');
  assert.equal((records[0]!.metadata as Json).orderId, activeOrderId);
  assert.equal(records[0]!.createdAt, (await db.notification.findUniqueOrThrow({ where: { id: records[0]!.id as string } })).createdAt.toISOString());
  assert.equal((await alice.request('PATCH', '/notifications/read', { orderId: activeOrderId })).status, 200);
  assert.equal((await alice.request('GET', '/notifications?orderId=' + activeOrderId)).unreadCount, 0);
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: unrelated.id } })).readAt, null);
});

test('Socket.IO authorizes connections and rejects subscriptions to another user order', async () => {
  socket = io(base, { transports: ['websocket'], extraHeaders: { Cookie: bob.cookieHeader(), Origin: origin }, reconnection: false, timeout: 4000 });
  await new Promise<void>((resolve, reject) => { socket!.once('connect', resolve); socket!.once('connect_error', reject); });
  const denied = await new Promise<{ ok: boolean }>(resolve => socket!.emit('order:join', activeOrderId, resolve)); assert.equal(denied.ok, false);
  socket.disconnect();
  socket = io(base, { transports: ['websocket'], extraHeaders: { Cookie: alice.cookieHeader(), Origin: origin }, reconnection: false, timeout: 4000 });
  await new Promise<void>((resolve, reject) => { socket!.once('connect', resolve); socket!.once('connect_error', reject); });
  const owned = await new Promise<{ ok: boolean }>(resolve => socket!.emit('order:join', activeOrderId, resolve)); assert.equal(owned.ok, true);
  // An extra untrusted argument must not be mistaken for a callable acknowledgement.
  socket.emit('order:join', false, { forged: true });
  assert.equal(await new Promise<{ ok: boolean }>(resolve => socket!.emit('order:join', activeOrderId, resolve)).then(result => result.ok), true);
  const notification = new Promise<Json>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Notification event timed out')), 4000); socket!.once('notification', data => { clearTimeout(timer); resolve(data as Json); }); });
  assert.equal((await bob.request('POST', '/posts/post-rest-osh/comments', { text: 'Realtime reply', parentId: firstCommentId })).status, 201);
  assert.equal((await notification).type, 'COMMENT_REPLY'); socket.disconnect();
  const guest = io(base, { transports: ['websocket'], reconnection: false, timeout: 4000 });
  const deniedGuest = await new Promise<boolean>(resolve => { guest.once('connect', () => resolve(false)); guest.once('connect_error', () => resolve(true)); }); guest.disconnect(); assert.equal(deniedGuest, true);
});
test('Invalid parameters and forbidden public status changes are rejected', async () => {
  assert.equal((await alice.request('GET', '/restaurants?page=-1')).status, 400);
  assert.equal((await alice.request('POST', '/orders/quote', { items: [{ dishId: 'does-not-exist', quantity: 1 }] })).status, 400);
  assert.equal((await alice.request('POST', '/orders', { items: [{ dishId: 'dish-plov', quantity: 1 }], addressId, recipientName: 'Alice Test', recipientPhone: '       ', paymentMethod: 'CASH' })).status, 400);
  assert.equal((await alice.request('POST', '/addresses', { addressText: 'No point selected', latitude: 100, longitude: 69 })).status, 400);
  assert.equal((await alice.request('POST', '/posts/post-rest-basilico/comments', { text: 'Wrong post reply', parentId: firstCommentId })).status, 400);
  assert.equal((await alice.request('POST', `/orders/${activeOrderId}/status`, { status: 'DELIVERED' })).status, 404);
  assert.equal((await alice.request('POST', '/restaurants/rest-osh/reviews', { orderId: activeOrderId, rating: 6, text: 'Invalid rating' })).status, 400);
});
test('Verified review enforces delivered, owner, uniqueness and updates restaurant rating', async () => {
  // Direct DB transition is private test setup, never a user API.
  await db.order.update({ where: { id: activeOrderId }, data: { status: 'DELIVERED' } });
  const input = { orderId: activeOrderId, rating: 5, text: 'Delivered and verified test review' };
  assert.equal((await bob.request('POST', '/restaurants/rest-osh/reviews', input)).status, 404);
  assert.equal((await alice.request('POST', '/restaurants/rest-osh/reviews', input)).status, 201);
  assert.equal((await alice.request('POST', '/restaurants/rest-osh/reviews', input)).status, 409);
  const restaurant = await alice.request('GET', '/restaurants/rest-osh'); assert.equal((restaurant.data as Json).rating, 5);
});
test('Profile nickname cooldown and sensitive email/password changes are enforced', async () => {
  const race = await Promise.all([alice.request('PATCH', '/profile', { nickname: `changed_${suffix}` }), alice.request('PATCH', '/profile', { nickname: `raced_${suffix}` })]);
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
  assert.equal((await alice.request('PATCH', '/profile', { nickname: `changed2_${suffix}` })).status, 409);
  assert.equal((await alice.request('PATCH', '/profile', { email: `new_${suffix}@example.test` })).status, 403);
  assert.equal((await alice.request('PATCH', '/profile', { language: 'uz', theme: 'dark' })).status, 200);
  const profile = await alice.request('GET', '/profile'); assert.equal(((profile.data as Json).settings as Json).language, 'uz');
  assert.equal((await alice.request('PATCH', '/profile', { phone: null })).status, 200); assert.equal(((await alice.request('GET', '/profile')).data as Json).phone, null);
  assert.equal((await alice.request('PATCH', '/profile', { phone: '       ' })).status, 400);
});
test('Notifications reflect changed preferences and older records without raw status enums', async () => {
  await db.notification.create({ data: { userId: aliceId, type: 'ORDER_STATUS', title: 'Статус заказа обновлён', body: 'Osh & Olov: DELIVERED', link: '/orders' } });
  let notifications = await alice.request('GET', '/notifications');
  assert.ok((notifications.data as Json[]).some(notice => notice.body === 'Osh & Olov · Yetkazildi'));
  assert.equal((await alice.request('PATCH', '/profile', { language: 'en' })).status, 200);
  notifications = await alice.request('GET', '/notifications');
  assert.ok((notifications.data as Json[]).some(notice => notice.title === 'Order placed'));
  assert.ok((notifications.data as Json[]).some(notice => notice.body === 'Osh & Olov · Delivered'));
  assert.ok((notifications.data as Json[]).every(notice => !String(notice.body).includes('DELIVERED')));
});
test('Private order/payment service enforces transitions, separate confirmation and rejection reasons', async () => {
  const address = await bob.request('POST', '/addresses', { latitude: 41.3, longitude: 69.2, addressText: 'Bob private test address' }); assert.equal(address.status, 201);
  const input = { items: [{ dishId: 'dish-plov', quantity: 1 }], addressId: (address.data as Json).id, recipientName: 'Bob Test', recipientPhone: '+998901112233', paymentMethod: 'CASH' };
  const first = await bob.request('POST', '/orders', input); assert.equal(first.status, 201); const rejectedOrderId = (first.data as Json).id as string;
  // CARD/payment rows are private database fixtures; no cloud upload or actual payment is claimed.
  await db.payment.update({ where: { orderId: rejectedOrderId }, data: { method: 'CARD', status: 'AWAITING_CONFIRMATION' } });
  await assert.rejects(updateOrderState(rejectedOrderId, 'ACCEPTED'), error => error instanceof ApiError && error.code === 'PAYMENT_REQUIRED');
  await assert.rejects(updateOrderState(rejectedOrderId, 'PENDING_ACCEPTANCE', 'REJECTED'), error => error instanceof ApiError && error.code === 'PAYMENT_REASON_REQUIRED');
  const rejected = await updateOrderState(rejectedOrderId, 'PENDING_ACCEPTANCE', 'REJECTED', 'Transfer not received');
  assert.equal(rejected.order.payment?.rejectionReason, 'Transfer not received'); assert.equal(rejected.order.status, 'PENDING_ACCEPTANCE');
  await assert.rejects(updateOrderState(rejectedOrderId, 'ACCEPTED'), error => error instanceof ApiError && error.code === 'PAYMENT_REQUIRED');
  await updateOrderState(rejectedOrderId, 'CANCELLED');
  await assert.rejects(updateOrderState(rejectedOrderId, 'ACCEPTED'), error => error instanceof ApiError && error.code === 'INVALID_TRANSITION');
  const second = await bob.request('POST', '/orders', input); assert.equal(second.status, 201); const paidOrderId = (second.data as Json).id as string;
  await db.payment.update({ where: { orderId: paidOrderId }, data: { method: 'CARD', status: 'AWAITING_CONFIRMATION' } });
  const confirmed = await updateOrderState(paidOrderId, 'PENDING_ACCEPTANCE', 'PAID'); assert.equal(confirmed.order.status, 'PENDING_ACCEPTANCE'); assert.equal(confirmed.notifications[0]?.type, 'PAYMENT_STATUS');
  for (const status of ['ACCEPTED', 'PREPARING', 'DELIVERING', 'DELIVERED'] as const) await updateOrderState(paidOrderId, status);
  const notices = await bob.request('GET', '/notifications?orderId=' + paidOrderId + '&pageSize=1');
  assert.equal(notices.pagination?.total, 6);
  assert.equal(notices.unreadCount, 6);
  assert.equal(((notices.data as Json[])[0]!.metadata as Json).status, 'DELIVERED');
  const events = (await bob.request('GET', '/notifications?orderId=' + paidOrderId)).data as Json[];
  assert.deepEqual(new Set(events.filter(notice => notice.type === 'ORDER_STATUS').map(notice => (notice.metadata as Json).status)), new Set(['ACCEPTED', 'PREPARING', 'DELIVERING', 'DELIVERED']));
  assert.ok(events.every(notice => Number.isFinite(Date.parse(notice.createdAt as string)) && (notice.metadata as Json).orderId === paidOrderId));
  await assert.rejects(updateOrderState(paidOrderId, 'DELIVERED', 'AWAITING_PAYMENT'), error => error instanceof ApiError && error.code === 'INVALID_PAYMENT_TRANSITION');
});
test('Pagination returns every older private record and comment without duplicating pages', async () => {
  const snapshot = await db.order.findUniqueOrThrow({ where: { id: activeOrderId }, include: { items: true } });
  await Promise.all(Array.from({ length: 13 }, (_, index) => db.order.create({ data: {
    userId: aliceId, restaurantId: snapshot.restaurantId, restaurantName: snapshot.restaurantName, restaurantAddress: snapshot.restaurantAddress,
    addressSnapshot: snapshot.addressSnapshot!, recipientName: snapshot.recipientName, recipientPhone: snapshot.recipientPhone,
    subtotal: snapshot.subtotal, deliveryFee: snapshot.deliveryFee, total: snapshot.total, status: 'DELIVERED', createdAt: new Date(Date.now() - (index + 1) * 1000),
    items: { create: snapshot.items.map(item => ({ dishId: item.dishId, dishName: item.dishName, unitPrice: item.unitPrice, quantity: item.quantity, imageUrl: item.imageUrl })) },
    payment: { create: { method: 'CASH', status: 'PAID' } },
  } })));
  await db.notification.createMany({ data: Array.from({ length: 13 }, (_, index) => ({ userId: aliceId, type: 'ORDER_STATUS', title: 'Статус заказа обновлён', body: 'Osh: DELIVERED', link: '/orders', metadata: { restaurantName: 'Osh', status: 'DELIVERED' }, createdAt: new Date(Date.now() - index * 1000) })) });
  await db.comment.createMany({ data: Array.from({ length: 13 }, (_, index) => ({ userId: aliceId, postId: 'post-rest-osh', text: `Pagination test ${index}`, createdAt: new Date(Date.now() - index * 1000) })) });
  for (const endpoint of ['/orders', '/orders?scope=history', '/notifications', '/posts/post-rest-osh/comments']) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const first = await alice.request('GET', `${endpoint}${separator}page=1&pageSize=12`); const second = await alice.request('GET', `${endpoint}${separator}page=2&pageSize=12`);
    assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal((first.data as Json[]).length, 12); assert.ok((second.data as Json[]).length > 0);
    assert.equal(first.pagination?.hasMore, true); assert.ok((first.pagination?.total ?? 0) > 12);
    const ids = new Set((first.data as Json[]).map(item => item.id)); assert.ok((second.data as Json[]).every(item => !ids.has(item.id)));
    if (endpoint === '/orders?scope=history') assert.ok([...(first.data as Json[]), ...(second.data as Json[])].every(order => ['DELIVERED', 'CANCELLED'].includes(order.status as string)));
  }
  await db.like.createMany({ data: [{ userId: aliceId, postId: 'post-rest-osh' }, { userId: aliceId, postId: 'post-rest-basilico' }], skipDuplicates: true });
  await db.follow.createMany({ data: [{ userId: aliceId, restaurantId: 'rest-osh' }, { userId: aliceId, restaurantId: 'rest-basilico' }], skipDuplicates: true });
  for (const endpoint of ['/profile/likes', '/profile/follows']) {
    const first = await alice.request('GET', `${endpoint}?pageSize=1`); const second = await alice.request('GET', `${endpoint}?page=2&pageSize=1`);
    assert.equal(first.pagination?.total, 2); assert.equal(first.pagination?.hasMore, true); assert.notEqual((first.data as Json[])[0]?.id, (second.data as Json[])[0]?.id);
  }
});
test('Logout with only a refresh cookie revokes its session and disconnects the socket', async () => {
  const device = new BrowserSession(); await device.init(); assert.equal((await device.request('POST', '/auth/login', { email: `alice_${suffix}@example.test`, password })).status, 200);
  const previousAccess = device.cookies.get('uzbite_access')!;
  const connected = io(base, { transports: ['websocket'], extraHeaders: { Cookie: device.cookieHeader(), Origin: origin }, reconnection: false, timeout: 4000 });
  try {
    await new Promise<void>((resolve, reject) => { connected.once('connect', resolve); connected.once('connect_error', reject); });
    const disconnect = new Promise<string>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Logout did not disconnect socket')), 4000); connected.once('disconnect', reason => { clearTimeout(timer); resolve(reason); }); });
    device.cookies.delete('uzbite_access'); assert.equal((await device.request('POST', '/auth/logout')).status, 200); assert.equal(await disconnect, 'io server disconnect');
    device.cookies.set('uzbite_access', previousAccess); assert.equal((await device.request('GET', '/auth/me')).status, 401);
  } finally { connected.disconnect(); }
});
test('Socket stops at absolute session expiry even if its access JWT is still valid', async () => {
  const device = new BrowserSession(); await device.init(); assert.equal((await device.request('POST', '/auth/login', { email: `alice_${suffix}@example.test`, password })).status, 200);
  const token = device.cookies.get('uzbite_access')!;
  const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sid: string; exp: number };
  assert.ok(payload.exp * 1000 - Date.now() > 60_000);
  await db.session.update({ where: { id: payload.sid }, data: { expiresAt: new Date(Date.now() + 800) } });
  const connected = io(base, { transports: ['websocket'], extraHeaders: { Cookie: device.cookieHeader(), Origin: origin }, reconnection: false, timeout: 4000 });
  try {
    await new Promise<void>((resolve, reject) => { connected.once('connect', resolve); connected.once('connect_error', reject); });
    const reason = await new Promise<string>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Expired session socket stayed open')), 4000); connected.once('disconnect', value => { clearTimeout(timer); resolve(value); }); });
    assert.equal(reason, 'io server disconnect'); assert.equal((await device.request('GET', '/auth/me')).status, 401);
  } finally { connected.disconnect(); }
});
test('Business analytics API enforces role isolation, computes KPIs, detects Item 26 anomalies, and manages expenses', async () => {
  // Customer account must be rejected from business endpoints
  assert.equal((await alice.request('GET', '/business/overview')).status, 401);

  const loginRes = await fetch(`${base}/api/business/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demo: true }),
  });
  assert.equal(loginRes.status, 200);
  const loginJson = (await loginRes.json()) as { data: { accessToken: string; refreshToken: string; user: { role: string; restaurantId: string } } };
  assert.equal(loginJson.data.user.role, 'RESTAURANT');
  const bearer = loginJson.data.accessToken;
  const authHeaders = { Authorization: `Bearer ${bearer}` };

  const overviewRes = await fetch(`${base}/api/business/overview`, { headers: authHeaders });
  assert.equal(overviewRes.status, 200);
  const overviewData = ((await overviewRes.json()) as { data: { revenue: number; totalExpenses: number; deliveredOrders: number } }).data;
  assert.ok(overviewData.revenue > 0);
  assert.ok(overviewData.totalExpenses > 0);
  assert.ok(overviewData.deliveredOrders > 0);

  const analysisRes = await fetch(`${base}/api/business/analysis`, { headers: authHeaders });
  assert.equal(analysisRes.status, 200);
  const analysisData = ((await analysisRes.json()) as { data: { findings: Array<{ code: string }>; report: { healthScore: number; totalPotentialSavingUZS: number } } }).data;
  const codes = new Set(analysisData.findings.map(f => f.code));
  for (const expected of ['DUPLICATE_INVOICE', 'AMOUNT_MISMATCH', 'AMOUNT_OUTLIER', 'CATEGORY_MISMATCH', 'SUPPLIER_PRICE_SPIKE', 'CHEAPER_SUPPLIER_EXISTS', 'NEGATIVE_MARGIN_DISH', 'BUDGET_OVERRUN']) {
    assert.ok(codes.has(expected), `Integration analysis missing ${expected}`);
  }
  assert.ok(analysisData.report.totalPotentialSavingUZS > 0);

  const dishesRes = await fetch(`${base}/api/business/dishes`, { headers: authHeaders });
  assert.equal(dishesRes.status, 200);
  const budgetsRes = await fetch(`${base}/api/business/budgets`, { headers: authHeaders });
  assert.equal(budgetsRes.status, 200);

  // Create and delete a test expense with AI auto-classification
  const createRes = await fetch(`${base}/api/business/expenses`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemName: 'Оплата интернета',
      description: 'Интернет Uztelecom тестовый счёт',
      amount: 350000,
      spentAt: new Date().toISOString().slice(0, 10),
    }),
  });
  assert.equal(createRes.status, 201);
  const created = ((await createRes.json()) as { data: { id: string; category: string } }).data;
  assert.equal(created.category, 'COMMUNICATION');

  const delRes = await fetch(`${base}/api/business/expenses/${created.id}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  assert.equal(delRes.status, 200);
});
