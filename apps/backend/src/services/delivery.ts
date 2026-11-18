import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { estimateDelivery } from '../utils/delivery.js';

/** Only the current user's saved addresses may be selected or recovered from order history. */
export async function deliveryAddressForUser(userId?: string) {
  if (!userId) return { address: null, source: 'none' as const };
  const user = await db.user.findUnique({ where: { id: userId }, select: {
    deliveryAddressId: true,
    addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] },
    orders: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { addressSnapshot: true } },
  } });
  if (!user) return { address: null, source: 'none' as const };
  const selected = user.addresses.find(address => address.id === user.deliveryAddressId);
  if (selected) return { address: selected, source: 'selected' as const };
  const snapshot = user.orders[0]?.addressSnapshot;
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    const recent = user.addresses.find(address => address.latitude === snapshot.latitude && address.longitude === snapshot.longitude && address.addressText === snapshot.addressText && address.apartment === (snapshot.apartment ?? '') && address.floor === (snapshot.floor ?? '') && address.entrance === (snapshot.entrance ?? ''));
    if (recent) return { address: recent, source: 'order' as const };
  }
  return { address: user.addresses[0] ?? null, source: user.addresses.length ? 'default' as const : 'none' as const };
}

export function deliveryEstimateFor(restaurant: { latitude: number; longitude: number; preparationMinutes: number; isOpen: boolean }, destination: { latitude: number; longitude: number } | null) {
  if (!destination || !restaurant.isOpen) return null;
  return estimateDelivery(restaurant, destination, restaurant.preparationMinutes, {
    averageSpeedKmh: env.DELIVERY_AVERAGE_SPEED_KMH, roadFactor: env.DELIVERY_ROAD_FACTOR,
    pickupMinutes: env.DELIVERY_PICKUP_MINUTES, marginMinutes: env.DELIVERY_ESTIMATE_MARGIN_MINUTES,
  });
}
