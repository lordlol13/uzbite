import {
  TASHKENT_DISTRICTS,
  TASHKENT_DISTRICT_MAP,
  type DistrictBranchMarker,
  type DistrictGeoAnalysisResponse,
  type DistrictStatItem,
  type Language,
  type OrderHeatmapCell,
  type TashkentDistrictId,
} from '@uzbite/shared';
import { db } from '../config/database.js';
import { onBusinessCacheInvalidated, resolveDateRange } from './business-analytics.js';

const GEO_CACHE_TTL_MS = 20_000;
const geoCache = new Map<string, { expiresAt: number; value: DistrictGeoAnalysisResponse }>();
onBusinessCacheInvalidated(() => {
  geoCache.clear();
});

const DISTRICT_TEXT_PATTERNS: Array<{ id: TashkentDistrictId; re: RegExp }> = [
  { id: 'chilonzor', re: /(чиланзар|chilonzor)/i },
  { id: 'yunusobod', re: /(юнусабад|yunusobod|yunusabad)/i },
  { id: 'mirzo_ulugbek', re: /(мирзо[- ]?улугбек|mirzo[- ]?ulug'?bek)/i },
  { id: 'yakkasaroy', re: /(яккасарай|yakkasaroy|yakkasaray)/i },
  { id: 'mirobod', re: /(мирабад|mirobod|mirabad)/i },
  { id: 'shayxontohur', re: /(шайхантахур|shayxontohur|shaykhantaur)/i },
  { id: 'olmazor', re: /(алмазар|олмазор|olmazor|almazar)/i },
  { id: 'uchtepa', re: /(учтепа|uchtepa)/i },
  { id: 'yashnobod', re: /(яшнабад|яшнобод|yashnobod|yashnabad)/i },
  { id: 'sergeli', re: /(сергели|sergeli)/i },
  { id: 'yangihayot', re: /(янгиха[её]т|yangihayot)/i },
  { id: 'bektemir', re: /(бектемир|bektemir)/i },
];

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lng: number, lat: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]![0];
    const yi = polygon[i]![1];
    const xj = polygon[j]![0];
    const yj = polygon[j]![1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function resolveTashkentDistrict(
  latitude: number,
  longitude: number,
  addressText?: string,
): TashkentDistrictId {
  if (addressText) {
    for (const pattern of DISTRICT_TEXT_PATTERNS) {
      if (pattern.re.test(addressText)) return pattern.id;
    }
  }

  for (const district of TASHKENT_DISTRICTS) {
    if (pointInPolygon(longitude, latitude, district.polygon)) {
      return district.id;
    }
  }

  let bestId: TashkentDistrictId = 'mirobod';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const district of TASHKENT_DISTRICTS) {
    const dist = haversineKm(latitude, longitude, district.center.latitude, district.center.longitude);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = district.id;
    }
  }
  return bestId;
}

interface SnapshotCoords {
  latitude: number;
  longitude: number;
  addressText: string;
}

function parseSnapshot(snapshot: unknown, fallbackLat: number, fallbackLng: number): SnapshotCoords {
  if (snapshot && typeof snapshot === 'object') {
    const s = snapshot as Record<string, unknown>;
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    const addressText = typeof s.addressText === 'string' ? s.addressText : '';
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      return { latitude: lat, longitude: lng, addressText };
    }
    return { latitude: fallbackLat, longitude: fallbackLng, addressText };
  }
  return { latitude: fallbackLat, longitude: fallbackLng, addressText: '' };
}

export const HEATMAP_GRID_DEG = 0.005;
export const HEATMAP_MIN_K_ANONYMITY = 2;

export interface HeatmapOrderPoint {
  latitude: number;
  longitude: number;
  revenue: number;
  districtId: TashkentDistrictId;
}

/**
 * Aggregates individual order coordinates onto a ~0.005 deg (~500m) grid
 * and suppresses cells with fewer than `minOrders` (default 2) for k-anonymity.
 */
export function aggregateOrderHeatmapCells(
  points: HeatmapOrderPoint[],
  options?: {
    gridDeg?: number;
    minOrders?: number;
    districtId?: TashkentDistrictId;
  },
): OrderHeatmapCell[] {
  const gridDeg = options?.gridDeg && options.gridDeg > 0 ? options.gridDeg : HEATMAP_GRID_DEG;
  const minOrders = Math.max(1, options?.minOrders ?? HEATMAP_MIN_K_ANONYMITY);
  const filterDistrict = options?.districtId;

  interface CellAcc {
    latCenter: number;
    lngCenter: number;
    orders: number;
    revenue: number;
    districtCounts: Map<TashkentDistrictId, number>;
  }

  const cells = new Map<string, CellAcc>();
  for (const pt of points) {
    if (!Number.isFinite(pt.latitude) || !Number.isFinite(pt.longitude)) continue;
    if (filterDistrict && pt.districtId !== filterDistrict) continue;

    const latIdx = Math.floor(pt.latitude / gridDeg);
    const lngIdx = Math.floor(pt.longitude / gridDeg);
    const key = `${latIdx}:${lngIdx}`;
    const latCenter = Number(((latIdx + 0.5) * gridDeg).toFixed(4));
    const lngCenter = Number(((lngIdx + 0.5) * gridDeg).toFixed(4));

    let acc = cells.get(key);
    if (!acc) {
      acc = {
        latCenter,
        lngCenter,
        orders: 0,
        revenue: 0,
        districtCounts: new Map<TashkentDistrictId, number>(),
      };
      cells.set(key, acc);
    }
    acc.orders += 1;
    acc.revenue += Number.isFinite(pt.revenue) ? pt.revenue : 0;
    acc.districtCounts.set(pt.districtId, (acc.districtCounts.get(pt.districtId) ?? 0) + 1);
  }

  const output: OrderHeatmapCell[] = [];
  for (const acc of cells.values()) {
    if (acc.orders < minOrders) continue;
    let dominantDistrict: TashkentDistrictId = 'mirobod';
    let bestCount = -1;
    for (const [dId, cnt] of acc.districtCounts.entries()) {
      if (cnt > bestCount) {
        bestCount = cnt;
        dominantDistrict = dId;
      }
    }
    output.push({
      latCenter: acc.latCenter,
      lngCenter: acc.lngCenter,
      orders: acc.orders,
      revenue: Math.round(acc.revenue),
      districtId: dominantDistrict,
    });
  }

  return output.sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);
}

export async function analyzeOrdersByDistrict(params: {
  restaurantId?: string | 'ALL';
  from?: string;
  to?: string;
  districtId?: TashkentDistrictId;
}): Promise<DistrictGeoAnalysisResponse> {
  const scopeId = params.restaurantId && params.restaurantId !== 'ALL' ? params.restaurantId : 'ALL';
  const cacheKey = `${scopeId}::${params.from ?? 'default'}::${params.to ?? 'default'}`;
  const nowMs = Date.now();
  const cached = geoCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    if (params.districtId) {
      return {
        ...cached.value,
        topDistrict: cached.value.districts.find(d => d.districtId === params.districtId) ?? cached.value.topDistrict,
        heatmapCells: (cached.value.heatmapCells ?? []).filter(c => c.districtId === params.districtId),
      };
    }
    return cached.value;
  }
  const { from, to, prevFrom, prevTo, days } = resolveDateRange(params.from, params.to);

  const [restaurants, orders] = await Promise.all([
    db.restaurant.findMany({
      select: {
        id: true,
        name: true,
        addressText: true,
        latitude: true,
        longitude: true,
        preparationMinutes: true,
      },
      orderBy: { name: 'asc' },
    }),
    db.order.findMany({
      where: {
        ...(scopeId !== 'ALL' ? { restaurantId: scopeId } : {}),
        createdAt: { gte: prevFrom, lte: to },
      },
      select: {
        id: true,
        userId: true,
        restaurantId: true,
        subtotal: true,
        deliveryFee: true,
        status: true,
        createdAt: true,
        recipientPhone: true,
        addressSnapshot: true,
        payment: { select: { method: true, status: true } },
      },
    }),
  ]);

  const restaurantMap = new Map(restaurants.map(r => [r.id, r]));

  interface DistrictAcc {
    orders: number;
    deliveredOrders: number;
    cancelledOrders: number;
    prevOrders: number;
    revenue: number;
    deliveryFeeRevenue: number;
    estimatedCourierCost: number;
    totalDistanceKm: number;
    totalPrepMin: number;
    clients: Set<string>;
  }

  const accMap = new Map<TashkentDistrictId, DistrictAcc>();
  for (const d of TASHKENT_DISTRICTS) {
    accMap.set(d.id, {
      orders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      prevOrders: 0,
      revenue: 0,
      deliveryFeeRevenue: 0,
      estimatedCourierCost: 0,
      totalDistanceKm: 0,
      totalPrepMin: 0,
      clients: new Set<string>(),
    });
  }

  const branchStats = new Map<string, { orders: number; revenue: number }>();
  for (const r of restaurants) branchStats.set(r.id, { orders: 0, revenue: 0 });
  const heatmapPoints: HeatmapOrderPoint[] = [];

  for (const order of orders) {
    const rest = restaurantMap.get(order.restaurantId);
    const coords = parseSnapshot(order.addressSnapshot, rest?.latitude ?? 41.311, rest?.longitude ?? 69.279);
    const districtId = resolveTashkentDistrict(coords.latitude, coords.longitude, coords.addressText);
    const acc = accMap.get(districtId)!;
    const isCurrent = order.createdAt >= from && order.createdAt <= to;
    const isPrev = order.createdAt >= prevFrom && order.createdAt <= prevTo;

    const recognized =
      order.status === 'DELIVERED' &&
      (!order.payment || order.payment.status === 'PAID' || order.payment.method === 'CASH');

    if (isPrev) {
      if (order.status !== 'CANCELLED') acc.prevOrders += 1;
      continue;
    }
    if (!isCurrent) continue;

    acc.orders += 1;
    const clientKey = order.recipientPhone || `${order.userId}:${coords.addressText}`;
    acc.clients.add(clientKey);

    if (order.status === 'CANCELLED') {
      acc.cancelledOrders += 1;
      continue;
    }

    if (recognized) {
      const subtotal = order.subtotal.toNumber();
      const delivFee = order.deliveryFee.toNumber();
      const distKm = rest
        ? haversineKm(rest.latitude, rest.longitude, coords.latitude, coords.longitude)
        : 3.5;
      const courierCost = Math.round(7500 + distKm * 1900);

      acc.deliveredOrders += 1;
      acc.revenue += subtotal;
      acc.deliveryFeeRevenue += delivFee;
      acc.estimatedCourierCost += courierCost;
      acc.totalDistanceKm += distKm;
      acc.totalPrepMin += rest?.preparationMinutes ?? 20;

      heatmapPoints.push({
        latitude: coords.latitude,
        longitude: coords.longitude,
        revenue: subtotal,
        districtId,
      });

      const bStat = branchStats.get(order.restaurantId);
      if (bStat) {
        bStat.orders += 1;
        bStat.revenue += subtotal;
      }
    }
  }

  const totalOrders = [...accMap.values()].reduce((s, a) => s + a.orders, 0);
  const totalRevenue = [...accMap.values()].reduce((s, a) => s + a.revenue, 0);
  const maxOrders = Math.max(1, ...[...accMap.values()].map(a => a.orders));

  const districts: DistrictStatItem[] = TASHKENT_DISTRICTS.map(shape => {
    const acc = accMap.get(shape.id)!;
    const avgCheck = acc.deliveredOrders > 0 ? Math.round(acc.revenue / acc.deliveredOrders) : 0;
    const sharePct = totalOrders > 0 ? Number(((acc.orders / totalOrders) * 100).toFixed(1)) : 0;
    const growthPct =
      acc.prevOrders > 0
        ? Number((((acc.deliveredOrders - acc.prevOrders) / acc.prevOrders) * 100).toFixed(1))
        : acc.deliveredOrders > 0
          ? 100
          : 0;
    const avgDistanceKm =
      acc.deliveredOrders > 0 ? Number((acc.totalDistanceKm / acc.deliveredOrders).toFixed(2)) : 0;
    const avgPrep = acc.deliveredOrders > 0 ? acc.totalPrepMin / acc.deliveredOrders : 20;
    const avgDeliveryMinutes =
      acc.deliveredOrders > 0
        ? Math.round(avgPrep + 5 + ((avgDistanceKm * 1.35) / 18) * 60)
        : 0;
    const deliveryMargin = Math.round(acc.deliveryFeeRevenue - acc.estimatedCourierCost);

    let nearestBranchId = restaurants[0]?.id ?? '';
    let nearestBranchName = restaurants[0]?.name ?? '—';
    let minBranchDist = Number.POSITIVE_INFINITY;
    for (const r of restaurants) {
      const d = haversineKm(shape.center.latitude, shape.center.longitude, r.latitude, r.longitude);
      if (d < minBranchDist) {
        minBranchDist = d;
        nearestBranchId = r.id;
        nearestBranchName = r.name;
      }
    }

    const orderScore = (acc.orders / maxOrders) * 70;
    const growthBonus = Math.min(30, Math.max(0, growthPct * 0.4));
    const demandScore = Math.min(100, Math.round(orderScore + growthBonus));

    let status: DistrictStatItem['status'] = 'PROFITABLE';
    if (acc.orders > 0 && deliveryMargin < 0 && avgDistanceKm >= 5.0) {
      status = 'LOSS_DELIVERY';
    } else if (sharePct >= 14 || demandScore >= 68) {
      status = 'HIGH_DEMAND';
    } else if (minBranchDist >= 5.2 || (acc.orders > 0 && avgDistanceKm >= 5.5)) {
      status = 'UNDERSERVED';
    }

    return {
      districtId: shape.id,
      name: shape.name,
      center: shape.center,
      orders: acc.orders,
      deliveredOrders: acc.deliveredOrders,
      cancelledOrders: acc.cancelledOrders,
      uniqueClients: acc.clients.size,
      revenue: Math.round(acc.revenue),
      avgCheck,
      sharePct,
      growthPct,
      avgDistanceKm,
      avgDeliveryMinutes,
      deliveryFeeRevenue: Math.round(acc.deliveryFeeRevenue),
      estimatedCourierCost: Math.round(acc.estimatedCourierCost),
      deliveryMargin,
      nearestBranchId,
      nearestBranchName,
      demandScore,
      status,
    };
  }).sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);

  const branches: DistrictBranchMarker[] = restaurants.map(r => {
    const districtId = resolveTashkentDistrict(r.latitude, r.longitude, r.addressText);
    const shape = TASHKENT_DISTRICT_MAP.get(districtId)!;
    const st = branchStats.get(r.id) ?? { orders: 0, revenue: 0 };
    return {
      id: r.id,
      name: r.name,
      addressText: r.addressText,
      latitude: r.latitude,
      longitude: r.longitude,
      districtId,
      districtName: shape.name,
      orders: st.orders,
      revenue: Math.round(st.revenue),
    };
  });

  const topDistrict = districts.find(d => d.orders > 0) ?? null;
  const underservedDistricts = districts.filter(d => d.status === 'UNDERSERVED' || d.avgDistanceKm >= 5.2);
  const lossMakingDeliveryDistricts = districts.filter(d => d.deliveryMargin < 0);
  const heatmapCells = aggregateOrderHeatmapCells(heatmapPoints);

  const result: DistrictGeoAnalysisResponse = {
    period: { from: from.toISOString(), to: to.toISOString(), days },
    restaurantId: scopeId,
    totalOrders,
    totalRevenue: Math.round(totalRevenue),
    topDistrict,
    underservedDistricts,
    lossMakingDeliveryDistricts,
    districts,
    branches,
    heatmapCells,
  };

  if (geoCache.size >= 100) geoCache.clear();
  geoCache.set(cacheKey, { expiresAt: nowMs + GEO_CACHE_TTL_MS, value: result });

  if (params.districtId) {
    return {
      ...result,
      topDistrict: result.districts.find(d => d.districtId === params.districtId) ?? result.topDistrict,
      heatmapCells: heatmapCells.filter(c => c.districtId === params.districtId),
    };
  }
  return result;
}

export interface BranchCatchmentItem {
  branchId: string;
  branchName: string;
  branchDistrictId: TashkentDistrictId;
  branchDistrictName: Record<Language, string>;
  radiusKm: number;
  ordersTotal: number;
  ordersWithinRadius: number;
  ordersOutsideRadius: number;
  inCatchmentSharePct: number;
  avgDistanceKm: number;
  p90DistanceKm: number;
  revenueWithinRadius: number;
  revenueOutsideRadius: number;
  topDistrictsServed: Array<{
    districtId: TashkentDistrictId;
    name: Record<Language, string>;
    orders: number;
    sharePct: number;
    avgDistanceKm: number;
  }>;
}

export interface BranchCatchmentResponse {
  period: { from: string; to: string; days: number };
  radiusKm: number;
  branches: BranchCatchmentItem[];
}

export async function computeBranchCatchment(params: {
  restaurantId?: string | 'ALL';
  radiusKm?: number;
  from?: string;
  to?: string;
}): Promise<BranchCatchmentResponse> {
  const scopeId = params.restaurantId && params.restaurantId !== 'ALL' ? params.restaurantId : 'ALL';
  const radiusKm = params.radiusKm && params.radiusKm > 0 ? Math.min(20, params.radiusKm) : 3.5;
  const { from, to, days } = resolveDateRange(params.from, params.to);

  const [restaurants, orders] = await Promise.all([
    db.restaurant.findMany({
      where: scopeId !== 'ALL' ? { id: scopeId } : undefined,
      select: { id: true, name: true, addressText: true, latitude: true, longitude: true },
      orderBy: { name: 'asc' },
    }),
    db.order.findMany({
      where: {
        ...(scopeId !== 'ALL' ? { restaurantId: scopeId } : {}),
        createdAt: { gte: from, lte: to },
        status: 'DELIVERED',
      },
      select: {
        restaurantId: true,
        subtotal: true,
        addressSnapshot: true,
        payment: { select: { method: true, status: true } },
      },
    }),
  ]);

  interface BranchCatchmentAcc {
    ordersTotal: number;
    ordersWithinRadius: number;
    ordersOutsideRadius: number;
    revenueWithinRadius: number;
    revenueOutsideRadius: number;
    distances: number[];
    byDistrict: Map<TashkentDistrictId, { orders: number; totalDistKm: number }>;
  }

  const accByBranch = new Map<string, BranchCatchmentAcc>();
  for (const r of restaurants) {
    accByBranch.set(r.id, {
      ordersTotal: 0,
      ordersWithinRadius: 0,
      ordersOutsideRadius: 0,
      revenueWithinRadius: 0,
      revenueOutsideRadius: 0,
      distances: [],
      byDistrict: new Map(),
    });
  }

  const restaurantMap = new Map(restaurants.map(r => [r.id, r]));
  for (const order of orders) {
    const recognized = !order.payment || order.payment.status === 'PAID' || order.payment.method === 'CASH';
    if (!recognized) continue;
    const rest = restaurantMap.get(order.restaurantId);
    const acc = accByBranch.get(order.restaurantId);
    if (!rest || !acc) continue;

    const coords = parseSnapshot(order.addressSnapshot, rest.latitude, rest.longitude);
    const distKm = haversineKm(rest.latitude, rest.longitude, coords.latitude, coords.longitude);
    const districtId = resolveTashkentDistrict(coords.latitude, coords.longitude, coords.addressText);
    const revenue = order.subtotal.toNumber();

    acc.ordersTotal += 1;
    acc.distances.push(distKm);
    if (distKm <= radiusKm) {
      acc.ordersWithinRadius += 1;
      acc.revenueWithinRadius += revenue;
    } else {
      acc.ordersOutsideRadius += 1;
      acc.revenueOutsideRadius += revenue;
    }

    const dEntry = acc.byDistrict.get(districtId) ?? { orders: 0, totalDistKm: 0 };
    dEntry.orders += 1;
    dEntry.totalDistKm += distKm;
    acc.byDistrict.set(districtId, dEntry);
  }

  const branches: BranchCatchmentItem[] = restaurants.map(r => {
    const acc = accByBranch.get(r.id)!;
    const branchDistrictId = resolveTashkentDistrict(r.latitude, r.longitude, r.addressText);
    const branchDistrictName = TASHKENT_DISTRICT_MAP.get(branchDistrictId)?.name ?? {
      uz: 'Toshkent',
      ru: 'Ташкент',
      en: 'Tashkent',
    };

    const sortedDistances = [...acc.distances].sort((a, b) => a - b);
    const avgDistanceKm =
      sortedDistances.length > 0
        ? Number((sortedDistances.reduce((s, d) => s + d, 0) / sortedDistances.length).toFixed(2))
        : 0;
    const p90Idx = sortedDistances.length > 0 ? Math.min(sortedDistances.length - 1, Math.floor(sortedDistances.length * 0.9)) : 0;
    const p90DistanceKm = sortedDistances.length > 0 ? Number(sortedDistances[p90Idx]!.toFixed(2)) : 0;
    const inCatchmentSharePct =
      acc.ordersTotal > 0 ? Number(((acc.ordersWithinRadius / acc.ordersTotal) * 100).toFixed(1)) : 0;

    const topDistrictsServed = [...acc.byDistrict.entries()]
      .map(([districtId, st]) => ({
        districtId,
        name: TASHKENT_DISTRICT_MAP.get(districtId)?.name ?? branchDistrictName,
        orders: st.orders,
        sharePct: acc.ordersTotal > 0 ? Number(((st.orders / acc.ordersTotal) * 100).toFixed(1)) : 0,
        avgDistanceKm: Number((st.totalDistKm / Math.max(1, st.orders)).toFixed(2)),
      }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 5);

    return {
      branchId: r.id,
      branchName: r.name,
      branchDistrictId,
      branchDistrictName,
      radiusKm,
      ordersTotal: acc.ordersTotal,
      ordersWithinRadius: acc.ordersWithinRadius,
      ordersOutsideRadius: acc.ordersOutsideRadius,
      inCatchmentSharePct,
      avgDistanceKm,
      p90DistanceKm,
      revenueWithinRadius: Math.round(acc.revenueWithinRadius),
      revenueOutsideRadius: Math.round(acc.revenueOutsideRadius),
      topDistrictsServed,
    };
  });

  return {
    period: { from: from.toISOString(), to: to.toISOString(), days },
    radiusKm,
    branches,
  };
}

export interface GrowthDistrictOpportunity {
  districtId: TashkentDistrictId;
  name: Record<Language, string>;
  orders: number;
  revenue: number;
  growthPct: number;
  demandScore: number;
  avgDistanceKm: number;
  nearestBranchId: string;
  nearestBranchName: string;
  nearestBranchDistanceKm: number;
  deliveryMargin: number;
  opportunityScore: number;
  status: DistrictStatItem['status'];
  recommendedAction: 'OPEN_BRANCH_OR_HUB' | 'OPTIMIZE_DELIVERY_FEE' | 'LOCAL_MARKETING' | 'MAINTAIN';
  rationale: Record<Language, string>;
}

export function rankGrowthDistrictOpportunities(
  districts: DistrictStatItem[],
  branches: DistrictBranchMarker[],
  limit = 6,
): GrowthDistrictOpportunity[] {
  const ranked = districts.map(d => {
    let nearestBranchDistanceKm = d.avgDistanceKm;
    if (branches.length > 0) {
      let minDist = Number.POSITIVE_INFINITY;
      for (const b of branches) {
        const dist = haversineKm(d.center.latitude, d.center.longitude, b.latitude, b.longitude);
        if (dist < minDist) minDist = dist;
      }
      if (Number.isFinite(minDist)) nearestBranchDistanceKm = Number(minDist.toFixed(2));
    }

    const distanceGapScore = Math.min(40, Math.max(0, (Math.max(d.avgDistanceKm, nearestBranchDistanceKm) - 3.0) * 10));
    const lossPenaltyBoost = d.deliveryMargin < 0 ? Math.min(25, Math.abs(d.deliveryMargin) / 15_000) : 0;
    const growthBoost = Math.min(20, Math.max(0, d.growthPct * 0.3));
    const baseDemand = Math.min(35, d.demandScore * 0.35);
    const opportunityScore = Math.min(100, Math.round(baseDemand + distanceGapScore + lossPenaltyBoost + growthBoost));

    let recommendedAction: GrowthDistrictOpportunity['recommendedAction'] = 'MAINTAIN';
    if (d.status === 'UNDERSERVED' || (nearestBranchDistanceKm >= 5.0 && d.orders >= 2)) {
      recommendedAction = 'OPEN_BRANCH_OR_HUB';
    } else if (d.deliveryMargin < 0) {
      recommendedAction = 'OPTIMIZE_DELIVERY_FEE';
    } else if (d.orders === 0 || d.growthPct >= 15 || d.demandScore < 45) {
      recommendedAction = 'LOCAL_MARKETING';
    }

    const rationale: Record<Language, string> = {
      ru: `${d.name.ru}: ${d.orders} заказов, ср. дистанция ${d.avgDistanceKm} км, до ближайшего филиала (${d.nearestBranchName}) ${nearestBranchDistanceKm} км, маржа доставки ${d.deliveryMargin.toLocaleString('ru-RU')} UZS.`,
      uz: `${d.name.uz}: ${d.orders} buyurtma, o‘rtacha masofa ${d.avgDistanceKm} km, eng yaqin filial (${d.nearestBranchName}) ${nearestBranchDistanceKm} km, yetkazish marjasi ${d.deliveryMargin.toLocaleString('ru-RU')} UZS.`,
      en: `${d.name.en}: ${d.orders} orders, avg distance ${d.avgDistanceKm} km, nearest branch (${d.nearestBranchName}) ${nearestBranchDistanceKm} km, delivery margin ${d.deliveryMargin.toLocaleString('ru-RU')} UZS.`,
    };

    return {
      districtId: d.districtId,
      name: d.name,
      orders: d.orders,
      revenue: d.revenue,
      growthPct: d.growthPct,
      demandScore: d.demandScore,
      avgDistanceKm: d.avgDistanceKm,
      nearestBranchId: d.nearestBranchId,
      nearestBranchName: d.nearestBranchName,
      nearestBranchDistanceKm,
      deliveryMargin: d.deliveryMargin,
      opportunityScore,
      status: d.status,
      recommendedAction,
      rationale,
    };
  });

  return ranked
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.orders - a.orders)
    .slice(0, Math.max(1, limit));
}

export async function findGrowthDistricts(params: {
  restaurantId?: string | 'ALL';
  from?: string;
  to?: string;
  limit?: number;
}): Promise<{
  period: { from: string; to: string; days: number };
  restaurantId: string | 'ALL';
  opportunities: GrowthDistrictOpportunity[];
}> {
  const geo = await analyzeOrdersByDistrict({
    restaurantId: params.restaurantId,
    from: params.from,
    to: params.to,
  });
  return {
    period: geo.period,
    restaurantId: geo.restaurantId,
    opportunities: rankGrowthDistrictOpportunities(geo.districts, geo.branches, params.limit ?? 6),
  };
}
