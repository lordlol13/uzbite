import { ExpenseCategory, Prisma } from '@prisma/client';
import {
  EXPENSE_CATEGORIES,
  type BusinessAnalysisResponse,
  type BusinessKpiOverview,
  type CategoryBreakdownItem,
  type DishAnalyticsItem,
  type ExpenseBudgetDto,
  type ExpenseCategory as SharedExpenseCategory,
  type HourlyHeatmapCell,
  type TimeseriesPoint,
} from '@uzbite/shared';
import { db } from '../config/database.js';
import {
  analyzeFinancialData,
  buildHeuristicOptimizationReport,
  linearRegressionSlope,
  theilSenSlope,
  zScore,
  type AnalysisBudgetInput,
  type AnalysisExpenseInput,
  type AnalysisOrderInput,
} from './finance-analysis.js';

const ANALYSIS_CACHE_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 200;
const FIXED_MONTHLY_CATEGORIES = new Set<ExpenseCategory>([ExpenseCategory.RENT]);

const analysisCache = new Map<string, { expiresAt: number; value: BusinessAnalysisResponse }>();
const cacheInvalidationListeners = new Set<(restaurantId?: string) => void>();

export function onBusinessCacheInvalidated(listener: (restaurantId?: string) => void): void {
  cacheInvalidationListeners.add(listener);
}

export function invalidateBusinessCache(restaurantId?: string): void {
  if (!restaurantId) {
    analysisCache.clear();
  } else {
    const prefix = `${restaurantId}::`;
    for (const key of analysisCache.keys()) {
      if (key.startsWith(prefix)) {
        analysisCache.delete(key);
      }
    }
  }
  for (const listener of cacheInvalidationListeners) {
    listener(restaurantId);
  }
}

export function resolveDateRange(
  fromParam?: string,
  toParam?: string,
  now: Date = new Date(),
): {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  days: number;
} {
  const to = toParam ? new Date(toParam.length <= 10 ? `${toParam}T23:59:59.999Z` : toParam) : new Date(now);
  const validTo = Number.isFinite(to.getTime()) ? to : now;
  const defaultFrom = new Date(
    Date.UTC(validTo.getUTCFullYear(), validTo.getUTCMonth(), validTo.getUTCDate() - 29, 0, 0, 0, 0),
  );
  const from = fromParam ? new Date(fromParam.length <= 10 ? `${fromParam}T00:00:00.000Z` : fromParam) : defaultFrom;
  const validFrom = Number.isFinite(from.getTime()) && from <= validTo ? from : defaultFrom;

  const fromDayMs = Date.UTC(validFrom.getUTCFullYear(), validFrom.getUTCMonth(), validFrom.getUTCDate());
  const toDayMs = Date.UTC(validTo.getUTCFullYear(), validTo.getUTCMonth(), validTo.getUTCDate());
  const days = Math.max(1, Math.round((toDayMs - fromDayMs) / 86_400_000) + 1);
  const prevTo = new Date(fromDayMs - 1);
  const prevFrom = new Date(fromDayMs - days * 86_400_000);
  return { from: validFrom, to: validTo, prevFrom, prevTo, days };
}

function dec(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Number((((curr - prev) / prev) * 100).toFixed(1));
}

function isRecognizedRevenueOrder(order: {
  status: string;
  payment: { method: string; status: string } | null;
}): boolean {
  if (order.status !== 'DELIVERED') return false;
  if (!order.payment) return true;
  return order.payment.status === 'PAID' || order.payment.method === 'CASH';
}

export function resolveMonthRange(
  monthParam?: string,
  now: Date = new Date(),
): {
  monthStart: Date;
  monthEnd: Date;
  monthKey: string;
  daysInMonth: number;
  elapsedDays: number;
} {
  let year = now.getUTCFullYear();
  let monthIdx = now.getUTCMonth();
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    if (y && m && m >= 1 && m <= 12) {
      year = y;
      monthIdx = m - 1;
    }
  }
  const monthStart = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));
  const daysInMonth = monthEnd.getUTCDate();
  let elapsedDays = daysInMonth;
  if (now >= monthStart && now <= monthEnd) {
    elapsedDays = Math.max(1, now.getUTCDate());
  } else if (now < monthStart) {
    elapsedDays = 1;
  }
  const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  return { monthStart, monthEnd, monthKey, daysInMonth, elapsedDays };
}

function computeBudgetsStatus(
  budgets: Array<{ id: string; restaurantId: string; category: ExpenseCategory; limit: Prisma.Decimal | number }>,
  actualMap: ReadonlyMap<ExpenseCategory, number>,
  monthKey: string,
  daysInMonth: number,
  elapsedDays: number,
): ExpenseBudgetDto[] {
  return budgets.map(b => {
    const limit = dec(b.limit);
    const actual = actualMap.get(b.category) ?? 0;
    const forecast = FIXED_MONTHLY_CATEGORIES.has(b.category)
      ? Math.round(actual)
      : Math.round((actual / elapsedDays) * daysInMonth);
    const variance = Number((limit - actual).toFixed(0));
    const usagePct = limit > 0 ? Number(((actual / limit) * 100).toFixed(1)) : 0;
    const status: ExpenseBudgetDto['status'] =
      actual > limit ? 'OVERRUN' : forecast > limit * 1.05 || usagePct >= 85 ? 'WARNING' : 'OK';
    return {
      id: b.id,
      restaurantId: b.restaurantId,
      category: b.category as SharedExpenseCategory,
      month: monthKey,
      limit,
      actual,
      forecast,
      variance,
      usagePct,
      status,
    };
  });
}

export async function getBudgetsStatus(restaurantId: string, monthParam?: string): Promise<ExpenseBudgetDto[]> {
  const { monthStart, monthEnd, monthKey, daysInMonth, elapsedDays } = resolveMonthRange(monthParam);
  const [budgets, grouped] = await Promise.all([
    db.expenseBudget.findMany({
      where: { restaurantId, month: monthStart },
      orderBy: { category: 'asc' },
    }),
    db.expense.groupBy({
      by: ['category'],
      where: { restaurantId, spentAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
  ]);

  const actualMap = new Map<ExpenseCategory, number>();
  for (const row of grouped) {
    actualMap.set(row.category, dec(row._sum.amount));
  }

  return computeBudgetsStatus(budgets, actualMap, monthKey, daysInMonth, elapsedDays);
}

interface OrderComputeItem {
  dishId: string | null;
  quantity: number;
  unitPrice?: Prisma.Decimal | number;
  dish?: { costPrice: Prisma.Decimal | number } | null;
}

interface OrderComputeRow {
  id: string;
  subtotal: Prisma.Decimal | number;
  total: Prisma.Decimal | number;
  status: string;
  createdAt: Date;
  payment: { method: string; status: string } | null;
  items?: OrderComputeItem[];
}

interface ExpenseComputeRow {
  category: ExpenseCategory;
  amount: Prisma.Decimal | number;
  spentAt: Date;
}

function bucketKeyForDate(date: Date, bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'month') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (bucket === 'week') {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function computeTimeseries(
  orders: OrderComputeRow[],
  expenses: Array<{ spentAt: Date; amount: Prisma.Decimal | number }>,
  from: Date,
  to: Date,
  bucket: 'day' | 'week' | 'month',
): TimeseriesPoint[] {
  const map = new Map<string, TimeseriesPoint>();
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cursor <= to) {
    const key = bucketKeyForDate(cursor, bucket);
    if (!map.has(key)) {
      map.set(key, { bucket: key, revenue: 0, expenses: 0, profit: 0, orders: 0 });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const order of orders) {
    if (!isRecognizedRevenueOrder(order)) continue;
    const key = bucketKeyForDate(order.createdAt, bucket);
    const point = map.get(key) ?? { bucket: key, revenue: 0, expenses: 0, profit: 0, orders: 0 };
    point.revenue += dec(order.subtotal);
    point.orders += 1;
    point.profit = point.revenue - point.expenses;
    map.set(key, point);
  }

  for (const exp of expenses) {
    const key = bucketKeyForDate(exp.spentAt, bucket);
    const point = map.get(key) ?? { bucket: key, revenue: 0, expenses: 0, profit: 0, orders: 0 };
    point.expenses += dec(exp.amount);
    point.profit = point.revenue - point.expenses;
    map.set(key, point);
  }

  return [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function computeOverview(params: {
  from: Date;
  to: Date;
  days: number;
  ordersCurr: OrderComputeRow[];
  ordersPrev: OrderComputeRow[];
  expensesCurr: ExpenseComputeRow[];
  expensesPrev: Array<{ category: ExpenseCategory; amount: Prisma.Decimal | number }>;
  budgets: Array<{ category: ExpenseCategory; limit: Prisma.Decimal | number }>;
  avgRating: number | null;
  reviewCount: number;
  dishCostMap?: ReadonlyMap<string, number>;
  dailySeries?: TimeseriesPoint[];
}): BusinessKpiOverview {
  const {
    from,
    to,
    days,
    ordersCurr,
    ordersPrev,
    expensesCurr,
    expensesPrev,
    budgets,
    avgRating,
    reviewCount,
    dishCostMap,
    dailySeries: precomputedDailySeries,
  } = params;

  let revenue = 0;
  let deliveredOrders = 0;
  let cancelledOrders = 0;
  let lostRevenue = 0;
  let theoreticalCogs = 0;
  let cashOrders = 0;
  let cardOrders = 0;
  let cashRevenue = 0;
  let cardRevenue = 0;
  let unpaidCardOrders = 0;
  let unpaidCardAmount = 0;

  for (const order of ordersCurr) {
    const subtotal = dec(order.subtotal);
    const total = dec(order.total);
    if (order.status === 'CANCELLED') {
      cancelledOrders++;
      lostRevenue += subtotal;
      continue;
    }
    if (order.status === 'DELIVERED') {
      if (order.payment?.method === 'CARD' && order.payment.status !== 'PAID') {
        unpaidCardOrders++;
        unpaidCardAmount += total;
      }
      if (isRecognizedRevenueOrder(order)) {
        deliveredOrders++;
        revenue += subtotal;
        if (order.payment?.method === 'CARD') {
          cardOrders++;
          cardRevenue += subtotal;
        } else {
          cashOrders++;
          cashRevenue += subtotal;
        }
        for (const item of order.items ?? []) {
          const unitCost =
            item.dish?.costPrice !== undefined
              ? dec(item.dish.costPrice)
              : item.dishId && dishCostMap
                ? (dishCostMap.get(item.dishId) ?? 0)
                : 0;
          theoreticalCogs += unitCost * item.quantity;
        }
      }
    }
  }

  let revenuePrev = 0;
  let deliveredOrdersPrev = 0;
  for (const order of ordersPrev) {
    if (isRecognizedRevenueOrder(order)) {
      deliveredOrdersPrev++;
      revenuePrev += dec(order.subtotal);
    }
  }

  const totalOrderPool = deliveredOrders + cancelledOrders;
  const cancelRatePct = totalOrderPool > 0 ? Number(((cancelledOrders / totalOrderPool) * 100).toFixed(1)) : 0;
  const avgOrderValue = deliveredOrders > 0 ? Math.round(revenue / deliveredOrders) : 0;
  const avgOrderValuePrev = deliveredOrdersPrev > 0 ? Math.round(revenuePrev / deliveredOrdersPrev) : 0;

  const currCatTotals = new Map<SharedExpenseCategory, number>();
  const prevCatTotals = new Map<SharedExpenseCategory, number>();
  for (const cat of EXPENSE_CATEGORIES) {
    currCatTotals.set(cat, 0);
    prevCatTotals.set(cat, 0);
  }
  let totalExpenses = 0;
  for (const e of expensesCurr) {
    const amt = dec(e.amount);
    totalExpenses += amt;
    currCatTotals.set(e.category as SharedExpenseCategory, (currCatTotals.get(e.category as SharedExpenseCategory) ?? 0) + amt);
  }
  let totalExpensesPrev = 0;
  for (const e of expensesPrev) {
    const amt = dec(e.amount);
    totalExpensesPrev += amt;
    prevCatTotals.set(e.category as SharedExpenseCategory, (prevCatTotals.get(e.category as SharedExpenseCategory) ?? 0) + amt);
  }

  const budgetMap = new Map<SharedExpenseCategory, number>();
  for (const b of budgets) {
    budgetMap.set(b.category as SharedExpenseCategory, dec(b.limit));
  }

  const categoryBreakdown: CategoryBreakdownItem[] = EXPENSE_CATEGORIES.map(category => {
    const amount = currCatTotals.get(category) ?? 0;
    const prevAmount = prevCatTotals.get(category) ?? 0;
    return {
      category,
      amount,
      sharePct: totalExpenses > 0 ? Number(((amount / totalExpenses) * 100).toFixed(1)) : 0,
      prevAmount,
      growthPct: pctDelta(amount, prevAmount),
      budgetLimit: budgetMap.get(category) ?? null,
    };
  })
    .filter(item => item.amount > 0 || item.prevAmount > 0 || item.budgetLimit !== null)
    .sort((a, b) => b.amount - a.amount);

  const ingredientsAmt = currCatTotals.get('INGREDIENTS') ?? 0;
  const packagingAmt = currCatTotals.get('PACKAGING') ?? 0;
  const deliveryExpAmt = currCatTotals.get('DELIVERY') ?? 0;
  const salaryAmt = currCatTotals.get('SALARY') ?? 0;
  const adminUtilAmt =
    (currCatTotals.get('RENT') ?? 0) +
    (currCatTotals.get('UTILITIES') ?? 0) +
    (currCatTotals.get('COMMUNICATION') ?? 0);

  const primeCost = ingredientsAmt + packagingAmt + salaryAmt;
  const primeCostPct = revenue > 0 ? Number(((primeCost / revenue) * 100).toFixed(1)) : 0;
  const theoreticalFoodCostPct = revenue > 0 ? Number(((theoreticalCogs / revenue) * 100).toFixed(1)) : 0;
  const cogsVarianceUZS = theoreticalCogs > 0 ? Math.round(ingredientsAmt - theoreticalCogs) : 0;
  const cogsVariancePct =
    theoreticalCogs > 0 ? Number((((ingredientsAmt - theoreticalCogs) / theoreticalCogs) * 100).toFixed(1)) : 0;

  const variableCosts = ingredientsAmt + packagingAmt + deliveryExpAmt;
  const fixedCosts = Math.max(0, totalExpenses - variableCosts);
  const cmRatio = revenue > 0 ? 1 - variableCosts / revenue : 0;
  const breakEvenRevenue = revenue > 0 && cmRatio > 0.05 ? Math.round(fixedCosts / cmRatio) : 0;

  const dailySeries = precomputedDailySeries ?? computeTimeseries(ordersCurr, expensesCurr, from, to, 'day');
  const dailyRevenues = dailySeries.map(p => p.revenue);
  const dailyExpenses = dailySeries.map(p => p.expenses);
  const maxDailyExp = dailyExpenses.length > 0 ? Math.max(...dailyExpenses) : 0;
  const hasExpOutlier = dailyExpenses.length >= 4 && zScore(maxDailyExp, dailyExpenses) > 3.5;
  const revenueTrendSlope = Number(linearRegressionSlope(dailyRevenues).toFixed(0));
  const expenseTrendSlope = Number(
    (hasExpOutlier ? theilSenSlope(dailyExpenses) : linearRegressionSlope(dailyExpenses)).toFixed(0),
  );

  const grossProfit = revenue - theoreticalCogs;
  const netProfit = revenue - totalExpenses;
  const netProfitPrev = revenuePrev - totalExpensesPrev;
  const netMarginPct = revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : 0;

  return {
    period: { from: from.toISOString(), to: to.toISOString(), days },
    revenue,
    revenuePrev,
    revenueDeltaPct: pctDelta(revenue, revenuePrev),
    deliveredOrders,
    deliveredOrdersPrev,
    ordersDeltaPct: pctDelta(deliveredOrders, deliveredOrdersPrev),
    cancelledOrders,
    cancelRatePct,
    lostRevenue,
    avgOrderValue,
    avgOrderValuePrev,
    totalExpenses,
    totalExpensesPrev,
    expensesDeltaPct: pctDelta(totalExpenses, totalExpensesPrev),
    TheoreticalCogs: theoreticalCogs,
    foodCostPct: revenue > 0 ? Number(((ingredientsAmt / revenue) * 100).toFixed(1)) : 0,
    laborCostPct: revenue > 0 ? Number(((salaryAmt / revenue) * 100).toFixed(1)) : 0,
    adminUtilityCostPct: revenue > 0 ? Number(((adminUtilAmt / revenue) * 100).toFixed(1)) : 0,
    primeCostPct,
    theoreticalFoodCostPct,
    cogsVarianceUZS,
    cogsVariancePct,
    breakEvenRevenue,
    dailyRevenueAvg: Math.round(revenue / days),
    dailyExpenseBurn: Math.round(totalExpenses / days),
    revenueTrendSlope,
    expenseTrendSlope,
    grossProfit,
    netProfit,
    netProfitPrev,
    netMarginPct,
    avgRating: avgRating !== null ? Number(avgRating.toFixed(2)) : null,
    reviewCount,
    paymentSplit: {
      cashOrders,
      cardOrders,
      cashRevenue,
      cardRevenue,
      unpaidCardOrders,
      unpaidCardAmount,
    },
    categoryBreakdown,
  };
}

export async function getBusinessOverview(
  restaurantId: string,
  fromParam?: string,
  toParam?: string,
): Promise<BusinessKpiOverview> {
  const { from, to, prevFrom, prevTo, days } = resolveDateRange(fromParam, toParam);
  const { monthStart } = resolveMonthRange(`${to.getUTCFullYear()}-${String(to.getUTCMonth() + 1).padStart(2, '0')}`);

  const [ordersCurr, ordersPrev, expensesCurr, expensesPrev, budgets, reviewAgg] = await Promise.all([
    db.order.findMany({
      where: { restaurantId, createdAt: { gte: from, lte: to } },
      include: {
        payment: { select: { method: true, status: true } },
        items: { include: { dish: { select: { costPrice: true } } } },
      },
    }),
    db.order.findMany({
      where: { restaurantId, createdAt: { gte: prevFrom, lte: prevTo } },
      include: { payment: { select: { method: true, status: true } } },
    }),
    db.expense.findMany({
      where: { restaurantId, spentAt: { gte: from, lte: to } },
      select: { category: true, amount: true, spentAt: true },
    }),
    db.expense.findMany({
      where: { restaurantId, spentAt: { gte: prevFrom, lte: prevTo } },
      select: { category: true, amount: true },
    }),
    db.expenseBudget.findMany({
      where: { restaurantId, month: monthStart },
      select: { category: true, limit: true },
    }),
    db.review.aggregate({
      where: { restaurantId, createdAt: { gte: from, lte: to } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  return computeOverview({
    from,
    to,
    days,
    ordersCurr,
    ordersPrev,
    expensesCurr,
    expensesPrev,
    budgets,
    avgRating: reviewAgg._avg.rating,
    reviewCount: reviewAgg._count._all,
  });
}

export async function getRevenueTimeseries(
  restaurantId: string,
  fromParam?: string,
  toParam?: string,
  bucket: 'day' | 'week' | 'month' = 'day',
): Promise<TimeseriesPoint[]> {
  const { from, to } = resolveDateRange(fromParam, toParam);
  const [orders, expenses] = await Promise.all([
    db.order.findMany({
      where: { restaurantId, createdAt: { gte: from, lte: to }, status: 'DELIVERED' },
      include: { payment: { select: { method: true, status: true } } },
    }),
    db.expense.findMany({
      where: { restaurantId, spentAt: { gte: from, lte: to } },
      select: { spentAt: true, amount: true },
    }),
  ]);

  return computeTimeseries(orders, expenses, from, to, bucket);
}

function computeDishAnalytics(
  dishes: Array<{
    id: string;
    name: string;
    price: Prisma.Decimal | number;
    costPrice: Prisma.Decimal | number;
    category: { name: string };
  }>,
  orders: OrderComputeRow[],
): DishAnalyticsItem[] {
  const statsMap = new Map<string, { qty: number; revenue: number }>();
  for (const order of orders) {
    if (!isRecognizedRevenueOrder(order)) continue;
    for (const item of order.items ?? []) {
      if (!item.dishId) continue;
      const entry = statsMap.get(item.dishId) ?? { qty: 0, revenue: 0 };
      entry.qty += item.quantity;
      entry.revenue += dec(item.unitPrice) * item.quantity;
      statsMap.set(item.dishId, entry);
    }
  }

  const totalRevenue = [...statsMap.values()].reduce((s, x) => s + x.revenue, 0);
  const rawList = dishes.map(dish => {
    const price = dec(dish.price);
    const costPrice = dec(dish.costPrice);
    const unitMargin = price - costPrice;
    const marginPct = price > 0 ? Number(((unitMargin / price) * 100).toFixed(1)) : 0;
    const stat = statsMap.get(dish.id) ?? { qty: 0, revenue: 0 };
    const totalCost = costPrice * stat.qty;
    const totalProfit = stat.revenue - totalCost;
    const revenueSharePct = totalRevenue > 0 ? Number(((stat.revenue / totalRevenue) * 100).toFixed(1)) : 0;
    const recommendedPrice =
      costPrice > 0 && (costPrice >= price || marginPct < 30)
        ? Math.max(price, Math.ceil(costPrice / 0.65 / 1000) * 1000)
        : undefined;
    return {
      dishId: dish.id,
      name: dish.name,
      categoryName: dish.category.name,
      price,
      costPrice,
      unitMargin,
      marginPct,
      quantitySold: stat.qty,
      revenue: stat.revenue,
      totalCost,
      totalProfit,
      revenueSharePct,
      ...(recommendedPrice !== undefined ? { recommendedPrice } : {}),
    };
  });

  rawList.sort((a, b) => b.revenue - a.revenue);

  const avgQty = rawList.length > 0 ? rawList.reduce((s, d) => s + d.quantitySold, 0) / rawList.length : 0;
  const avgMargin = rawList.length > 0 ? rawList.reduce((s, d) => s + d.unitMargin, 0) / rawList.length : 0;

  let cumulative = 0;
  return rawList.map(item => {
    const abcClass: DishAnalyticsItem['abcClass'] =
      item.revenue === 0 ? 'C' : cumulative < 70 ? 'A' : cumulative < 90 ? 'B' : 'C';
    cumulative += item.revenueSharePct;

    const highPop = item.quantitySold >= avgQty;
    const highMargin = item.unitMargin >= avgMargin;
    const quadrant: DishAnalyticsItem['quadrant'] =
      highPop && highMargin
        ? 'STAR'
        : highPop && !highMargin
          ? 'PLOWHORSE'
          : !highPop && highMargin
            ? 'PUZZLE'
            : 'DOG';

    return {
      ...item,
      abcClass,
      quadrant,
    };
  });
}

export async function getDishAnalytics(
  restaurantId: string,
  fromParam?: string,
  toParam?: string,
): Promise<DishAnalyticsItem[]> {
  const { from, to } = resolveDateRange(fromParam, toParam);
  const [dishes, orders] = await Promise.all([
    db.dish.findMany({
      where: { restaurantId },
      include: { category: { select: { name: true } } },
    }),
    db.order.findMany({
      where: { restaurantId, createdAt: { gte: from, lte: to }, status: 'DELIVERED' },
      include: {
        payment: { select: { method: true, status: true } },
        items: true,
      },
    }),
  ]);

  return computeDishAnalytics(dishes, orders);
}

function computeHourlyHeatmap(orders: OrderComputeRow[]): HourlyHeatmapCell[] {
  const grid = new Map<string, HourlyHeatmapCell>();
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      grid.set(`${weekday}:${hour}`, { weekday, hour, orders: 0, revenue: 0 });
    }
  }

  for (const order of orders) {
    if (!isRecognizedRevenueOrder(order)) continue;
    // Shift UTC to Tashkent UTC+5 for realistic local business hours
    const localMs = order.createdAt.getTime() + 5 * 3600_000;
    const localDate = new Date(localMs);
    const weekday = (localDate.getUTCDay() + 6) % 7; // 0 = Monday .. 6 = Sunday
    const hour = localDate.getUTCHours();
    const cell = grid.get(`${weekday}:${hour}`)!;
    cell.orders += 1;
    cell.revenue += dec(order.subtotal);
  }

  return [...grid.values()];
}

export async function getHourlyHeatmap(
  restaurantId: string,
  fromParam?: string,
  toParam?: string,
): Promise<HourlyHeatmapCell[]> {
  const { from, to } = resolveDateRange(fromParam, toParam);
  const orders = await db.order.findMany({
    where: { restaurantId, createdAt: { gte: from, lte: to }, status: 'DELIVERED' },
    include: { payment: { select: { method: true, status: true } } },
  });

  return computeHourlyHeatmap(orders);
}

export async function runRestaurantAnalysis(
  restaurantId: string,
  fromParam?: string,
  toParam?: string,
): Promise<BusinessAnalysisResponse> {
  const cacheKey = `${restaurantId}::${fromParam ?? 'default'}::${toParam ?? 'default'}`;
  const nowMs = Date.now();
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return cached.value;
  }

  const now = new Date(nowMs);
  const { from, to, prevFrom, prevTo, days } = resolveDateRange(fromParam, toParam, now);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
  const monthKey = `${to.getUTCFullYear()}-${String(to.getUTCMonth() + 1).padStart(2, '0')}`;
  const { monthStart, monthEnd, daysInMonth, elapsedDays } = resolveMonthRange(monthKey, now);
  const minExpenseDate = new Date(Math.min(prevFrom.getTime(), ninetyDaysAgo.getTime(), monthStart.getTime()));

  const [restaurant, allOrders, allExpenses, dishRows, budgetRows, reviewAgg] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { createdAt: true } }),
    db.order.findMany({
      where: { restaurantId, createdAt: { gte: prevFrom, lte: to } },
      include: {
        payment: { select: { method: true, status: true } },
        items: { select: { dishId: true, quantity: true, unitPrice: true } },
      },
    }),
    db.expense.findMany({
      where: { restaurantId, spentAt: { gte: minExpenseDate } },
      include: { supplier: { select: { name: true } } },
    }),
    db.dish.findMany({
      where: { restaurantId },
      include: { category: { select: { name: true } } },
    }),
    db.expenseBudget.findMany({
      where: { restaurantId, month: monthStart },
      orderBy: { category: 'asc' },
    }),
    db.review.aggregate({
      where: { restaurantId, createdAt: { gte: from, lte: to } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  const ordersPeriod = allOrders.filter(o => o.createdAt >= from && o.createdAt <= to);
  const ordersPrev = allOrders.filter(o => o.createdAt >= prevFrom && o.createdAt <= prevTo);

  const expensesPeriodRaw = allExpenses.filter(e => e.spentAt >= from && e.spentAt <= to);
  const expensesPrevRaw = allExpenses.filter(e => e.spentAt >= prevFrom && e.spentAt <= prevTo);
  const expenses90dRaw = allExpenses.filter(e => e.spentAt >= ninetyDaysAgo);

  const monthActualMap = new Map<ExpenseCategory, number>();
  for (const e of allExpenses) {
    if (e.spentAt >= monthStart && e.spentAt <= monthEnd) {
      monthActualMap.set(e.category, (monthActualMap.get(e.category) ?? 0) + dec(e.amount));
    }
  }

  const dishCostMap = new Map<string, number>();
  for (const d of dishRows) {
    dishCostMap.set(d.id, dec(d.costPrice));
  }

  const dailySeries = computeTimeseries(ordersPeriod, expensesPeriodRaw, from, to, 'day');

  const overview = computeOverview({
    from,
    to,
    days,
    ordersCurr: ordersPeriod,
    ordersPrev,
    expensesCurr: expensesPeriodRaw,
    expensesPrev: expensesPrevRaw,
    budgets: budgetRows,
    avgRating: reviewAgg._avg.rating,
    reviewCount: reviewAgg._count._all,
    dishCostMap,
    dailySeries,
  });

  const dishes = computeDishAnalytics(dishRows, ordersPeriod);
  const budgets = computeBudgetsStatus(budgetRows, monthActualMap, monthKey, daysInMonth, elapsedDays);
  const timeseries = days > 45 ? computeTimeseries(ordersPeriod, expensesPeriodRaw, from, to, 'week') : dailySeries;
  const heatmap = computeHourlyHeatmap(ordersPeriod);

  const mapExpense = (e: (typeof allExpenses)[number]): AnalysisExpenseInput => ({
    id: e.id,
    supplierId: e.supplierId,
    supplierName: e.supplier?.name ?? null,
    category: e.category as SharedExpenseCategory,
    itemName: e.itemName,
    description: e.description,
    amount: dec(e.amount),
    quantity: e.quantity ? dec(e.quantity) : null,
    unit: e.unit,
    unitPrice: e.unitPrice ? dec(e.unitPrice) : null,
    invoiceNumber: e.invoiceNumber,
    spentAt: e.spentAt,
  });

  const mapOrder = (o: (typeof ordersPeriod)[number]): AnalysisOrderInput => ({
    id: o.id,
    total: dec(o.total),
    subtotal: dec(o.subtotal),
    status: o.status,
    createdAt: o.createdAt,
    paymentMethod: o.payment?.method ?? null,
    paymentStatus: o.payment?.status ?? null,
  });

  const mapBudget = (b: ExpenseBudgetDto): AnalysisBudgetInput => ({
    id: b.id,
    category: b.category,
    month: new Date(`${b.month}-01T00:00:00.000Z`),
    limit: b.limit,
    actual: b.actual,
    forecast: b.forecast,
  });

  const findings = analyzeFinancialData({
    now,
    restaurantCreatedAt: restaurant.createdAt,
    periodStart: from,
    periodEnd: to,
    expensesPeriod: expensesPeriodRaw.map(mapExpense),
    expensesPrevPeriod: expensesPrevRaw.map(mapExpense),
    expensesAll90d: expenses90dRaw.map(mapExpense),
    overview,
    ordersPeriod: ordersPeriod.map(mapOrder),
    dishes,
    budgets: budgets.map(mapBudget),
  });

  const report = buildHeuristicOptimizationReport(overview, findings);
  const result: BusinessAnalysisResponse = { overview, findings, report, dishes, budgets, timeseries, heatmap };

  if (analysisCache.size >= MAX_CACHE_ENTRIES) {
    analysisCache.clear();
  }
  analysisCache.set(cacheKey, { expiresAt: nowMs + ANALYSIS_CACHE_TTL_MS, value: result });
  return result;
}
