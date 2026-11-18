import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDelivery } from './delivery.js';

const origin = { latitude: 41.3, longitude: 69.25 };
const options = { averageSpeedKmh: 18, roadFactor: 1.35, pickupMinutes: 5, marginMinutes: 10 };

test('delivery time includes preparation and pickup even when the address is at the restaurant', () => {
  assert.deepEqual(estimateDelivery(origin, origin, 20, options), { minMinutes: 25, maxMinutes: 35, distanceKm: 0 });
});
test('a more distant address increases travel time and the delivery range', () => {
  const near = estimateDelivery(origin, { ...origin, latitude: origin.latitude + 0.01 }, 20, options)!;
  const far = estimateDelivery(origin, { ...origin, latitude: origin.latitude + 0.2 }, 20, options)!;
  assert.ok(near.distanceKm > 1 && near.distanceKm < 1.2);
  assert.ok(far.distanceKm > 22 && far.distanceKm < 22.4);
  assert.ok(far.minMinutes > near.maxMinutes);
  assert.equal(far.maxMinutes - far.minMinutes, 10);
});
test('preparation time and configured courier speed affect the estimate', () => {
  const destination = { ...origin, latitude: origin.latitude + 0.1 };
  const baseline = estimateDelivery(origin, destination, 20, options)!;
  const slower = estimateDelivery(origin, destination, 20, { ...options, averageSpeedKmh: 9 })!;
  const longerPreparation = estimateDelivery(origin, destination, 35, options)!;
  assert.ok(slower.minMinutes > baseline.minMinutes);
  assert.equal(longerPreparation.minMinutes - baseline.minMinutes, 15);
});
test('great-circle distance uses the short path across the date line', () => {
  const estimate = estimateDelivery({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 }, 20, options)!;
  assert.ok(estimate.distanceKm > 22 && estimate.distanceKm < 22.4);
});
test('invalid coordinates and model values never produce a displayed estimate', () => {
  assert.equal(estimateDelivery(origin, { latitude: 91, longitude: 0 }, 20, options), null);
  assert.equal(estimateDelivery(origin, { latitude: NaN, longitude: 0 }, 20, options), null);
  assert.equal(estimateDelivery(origin, origin, -1, options), null);
  assert.equal(estimateDelivery(origin, origin, 20, { ...options, averageSpeedKmh: 0 }), null);
  assert.equal(estimateDelivery(origin, origin, 20, { ...options, roadFactor: Infinity }), null);
});
