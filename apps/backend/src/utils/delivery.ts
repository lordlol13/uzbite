import type { DeliveryEstimate } from '@uzbite/shared';

interface Point { latitude: number; longitude: number }
interface EstimateOptions { averageSpeedKmh: number; roadFactor: number; pickupMinutes: number; marginMinutes: number }
const validPoint = (point: Point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;

/** A planning estimate, not live routing/traffic data. Distance uses the great-circle arc. */
export function estimateDelivery(origin: Point, destination: Point, preparationMinutes: number, options: EstimateOptions): DeliveryEstimate | null {
  if (!validPoint(origin) || !validPoint(destination) || !Number.isFinite(preparationMinutes) || preparationMinutes <= 0 || !Number.isFinite(options.averageSpeedKmh) || options.averageSpeedKmh <= 0 || !Number.isFinite(options.roadFactor) || options.roadFactor < 1 || !Number.isFinite(options.pickupMinutes) || options.pickupMinutes < 0 || !Number.isFinite(options.marginMinutes) || options.marginMinutes <= 0) return null;
  const radians = Math.PI / 180;
  const deltaLatitude = (destination.latitude - origin.latitude) * radians;
  const deltaLongitude = (destination.longitude - origin.longitude) * radians;
  const arc = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(origin.latitude * radians) * Math.cos(destination.latitude * radians) * Math.sin(deltaLongitude / 2) ** 2;
  const distance = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, arc))));
  const travelMinutes = distance * options.roadFactor / options.averageSpeedKmh * 60;
  const minMinutes = Math.ceil((preparationMinutes + options.pickupMinutes + travelMinutes) / 5) * 5;
  return { minMinutes, maxMinutes: minMinutes + Math.ceil(options.marginMinutes / 5) * 5, distanceKm: Math.round(distance * 10) / 10 };
}
