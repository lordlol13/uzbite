import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImage } from './storage.js';
import { cartSchema } from './orders.js';
import { addressSchema, addressPatchSchema } from '../routes/addresses.js';

test('Image upload validation checks file signatures and rejects disguised SVG', () => {
  assert.equal(detectImage(Buffer.from('<svg onload="alert(1)"/>')), null);
  assert.equal(detectImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))?.mimeType, 'image/png');
  assert.equal(detectImage(Buffer.from([255, 216, 255, 0]))?.mimeType, 'image/jpeg');
});
test('Cart rejects duplicates, negative quantities, and client totals', () => {
  assert.equal(cartSchema.safeParse({ items: [{ dishId: 'a', quantity: 1 }, { dishId: 'a', quantity: 1 }] }).success, false);
  assert.equal(cartSchema.safeParse({ items: [{ dishId: 'a', quantity: -1 }] }).success, false);
  assert.equal(cartSchema.safeParse({ items: [{ dishId: 'a', quantity: 1 }], total: 1 }).success, false);
  assert.equal(cartSchema.safeParse({ items: [{ dishId: 'a', quantity: 2 }] }).success, true);
});
test('Addresses validate named coordinates and require user supplied address text', () => {
  assert.equal(addressSchema.safeParse({ latitude: 91, longitude: 69, addressText: 'Tashkent' }).success, false);
  assert.equal(addressSchema.safeParse({ latitude: 41.3, longitude: 69.2, addressText: '' }).success, false);
  assert.equal(addressSchema.safeParse({ latitude: 41.3, longitude: 69.2, addressText: 'Tashkent, 1' }).success, true);
});
test('Partial address changes preserve fields not sent by the client', () => {
  assert.deepEqual(addressPatchSchema.parse({ isDefault: true }), { isDefault: true });
  assert.deepEqual(addressPatchSchema.parse({ addressText: 'Changed address' }), { addressText: 'Changed address' });
});
