import {
  TASHKENT_DISTRICT_MAP,
  type AgentChatMessage,
  type AgentChatResponse,
  type AgentClientAction,
  type AgentNavTab,
  type AgentScreenContext,
  type AgentToolTrace,
  type AgentUiBlock,
  type BranchAllocationResponse,
  type BranchPerformanceItem,
  type BudgetVarianceItem,
  type BusinessAnalysisResponse,
  type DistrictGeoAnalysisResponse,
  type ExpenseCategory as SharedExpenseCategory,
  type Language,
  type McpToolDescriptor,
  type TashkentDistrictId,
} from '@uzbite/shared';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import {
  getBusinessOverview,
  onBusinessCacheInvalidated,
  resolveDateRange,
  resolveMonthRange,
  runRestaurantAnalysis,
} from './business-analytics.js';
import { callCoarenaChat, callGeminiAgentChat, extractJsonFromText, type CoarenaMessage } from './coarena.js';
import {
  calculateDeduplicatedSavings,
  categoryLabel,
  computePriorityExpenseSummary,
  expensePriorityLabel,
  getExpensePriorityTier,
  PRIORITY_EXPENSE_CATEGORIES,
  BASE_EXPENSE_CATEGORIES,
  ADDITIONAL_EXPENSE_CATEGORIES,
  theilSenSlope,
  type AnalysisExpenseInput,
  type PriorityExpenseSummary,
} from './finance-analysis.js';
import {
  formatDateRangeLabel,
  parseDatePeriodFromQuestion,
  type ParsedDatePeriod,
} from './date-period-parser.js';
import {
  HEATMAP_GRID_DEG,
  HEATMAP_MIN_K_ANONYMITY,
  analyzeOrdersByDistrict,
  computeBranchCatchment,
  findGrowthDistricts,
  resolveTashkentDistrict,
} from './geo-districts.js';

const VARIANCE_CACHE_TTL_MS = 20_000;
const ALLOCATION_CACHE_TTL_MS = 20_000;
const AGENT_CHAT_CACHE_TTL_MS = 60_000;

const varianceCache = new Map<string, { expiresAt: number; value: BudgetVarianceItem[] }>();
const allocationCache = new Map<string, { expiresAt: number; value: BranchAllocationResponse }>();
const agentChatCache = new Map<string, { expiresAt: number; value: AgentChatResponse }>();

export function invalidateAgentCaches(restaurantId?: string): void {
  allocationCache.clear();
  if (!restaurantId) {
    varianceCache.clear();
    agentChatCache.clear();
    return;
  }
  const prefix = `${restaurantId}::`;
  for (const key of varianceCache.keys()) {
    if (key.startsWith(prefix)) varianceCache.delete(key);
  }
  for (const key of agentChatCache.keys()) {
    if (key.startsWith(prefix)) agentChatCache.delete(key);
  }
}

onBusinessCacheInvalidated(invalidateAgentCaches);

export interface VarianceExpenseRow {
  category: SharedExpenseCategory;
  itemName: string;
  amount: number;
  quantity: number | null;
  unitPrice: number | null;
  spentAt: Date;
  supplierName: string | null;
}

export interface VarianceBudgetRow {
  category: SharedExpenseCategory;
  limit: number;
}

function fmtUzs(v: number): string {
  return `${Math.round(v).toLocaleString('ru-RU')} UZS`;
}

export function buildBudgetVarianceList(params: {
  monthKey: string;
  monthStart: Date;
  daysInMonth: number;
  elapsedDays: number;
  budgets: VarianceBudgetRow[];
  currExpenses: VarianceExpenseRow[];
  prevExpenses: VarianceExpenseRow[];
}): BudgetVarianceItem[] {
  const { monthKey, monthStart, daysInMonth, elapsedDays, budgets, currExpenses, prevExpenses } = params;

  const limitMap = new Map<SharedExpenseCategory, number>();
  for (const b of budgets) limitMap.set(b.category, b.limit);

  const currByCat = new Map<SharedExpenseCategory, VarianceExpenseRow[]>();
  const prevByCat = new Map<SharedExpenseCategory, VarianceExpenseRow[]>();
  for (const e of currExpenses) {
    const arr = currByCat.get(e.category) ?? [];
    arr.push(e);
    currByCat.set(e.category, arr);
  }
  for (const e of prevExpenses) {
    const arr = prevByCat.get(e.category) ?? [];
    arr.push(e);
    prevByCat.set(e.category, arr);
  }

  const categories = new Set<SharedExpenseCategory>([
    ...limitMap.keys(),
    ...currByCat.keys(),
  ]);

  const results: BudgetVarianceItem[] = [];
  for (const category of categories) {
    const limit = limitMap.get(category) ?? 0;
    const rows = currByCat.get(category) ?? [];
    const prevRows = prevByCat.get(category) ?? [];
    const rawActual = rows.reduce((s, r) => s + r.amount, 0);
    const rawPrevActual = prevRows.reduce((s, r) => s + r.amount, 0);
    const actual = Math.round(rawActual);
    const prevActual = Math.round(rawPrevActual);

    // Daily spend vector across elapsed days for Theil-Sen trend
    const dailySpend = new Array<number>(elapsedDays).fill(0);
    for (const r of rows) {
      const dayIdx = Math.min(
        elapsedDays - 1,
        Math.max(0, Math.floor((r.spentAt.getTime() - monthStart.getTime()) / 86_400_000)),
      );
      dailySpend[dayIdx] = (dailySpend[dayIdx] ?? 0) + r.amount;
    }

    const dailyBurnRate = Math.round(actual / Math.max(1, elapsedDays));
    const slope = Math.round(theilSenSlope(dailySpend));
    const remainingDays = Math.max(0, daysInMonth - elapsedDays);

    let forecast = actual;
    if (category === 'RENT') {
      forecast = actual;
    } else {
      const runRateForecast = Math.round((actual / Math.max(1, elapsedDays)) * daysInMonth);
      const trendAdjusted = Math.round(
        actual + Math.max(0, dailyBurnRate + slope * 0.25) * remainingDays,
      );
      forecast = Math.round(runRateForecast * 0.65 + trendAdjusted * 0.35);
    }

    const variance = Math.round(limit - actual);
    const projectedOverrun = limit > 0 ? Math.max(0, forecast - limit) : 0;
    const usagePct = limit > 0 ? Number(((actual / limit) * 100).toFixed(1)) : 0;

    let projectedBreachDate: string | null = null;
    let daysUntilBreach: number | null = null;
    if (limit > 0) {
      if (actual >= limit) {
        daysUntilBreach = 0;
        projectedBreachDate = new Date(monthStart.getTime() + (elapsedDays - 1) * 86_400_000)
          .toISOString()
          .slice(0, 10);
      } else if (forecast > limit) {
        const effectiveBurn = Math.max(
          dailyBurnRate,
          remainingDays > 0 ? (forecast - actual) / remainingDays : dailyBurnRate,
        );
        if (effectiveBurn > 0) {
          const needed = limit - actual;
          const estDays = Math.max(1, Math.ceil(needed / effectiveBurn));
          if (elapsedDays + estDays <= daysInMonth) {
            daysUntilBreach = estDays;
            const breachDt = new Date(
              monthStart.getTime() + (elapsedDays + estDays - 1) * 86_400_000,
            );
            projectedBreachDate = breachDt.toISOString().slice(0, 10);
          }
        }
      }
    }

    // Price vs Volume vs New items decomposition vs previous month
    const prevByItem = new Map<string, { qty: number; spend: number; avgPrice: number }>();
    for (const p of prevRows) {
      const key = p.itemName.trim().toLowerCase() || p.category;
      const entry = prevByItem.get(key) ?? { qty: 0, spend: 0, avgPrice: 0 };
      const q = p.quantity && p.quantity > 0 ? p.quantity : 1;
      entry.qty += q;
      entry.spend += p.amount;
      entry.avgPrice = entry.spend / entry.qty;
      prevByItem.set(key, entry);
    }

    const currByItem = new Map<string, { qty: number; spend: number }>();
    const supplierSpend = new Map<string, number>();
    for (const c of rows) {
      const key = c.itemName.trim().toLowerCase() || c.category;
      const entry = currByItem.get(key) ?? { qty: 0, spend: 0 };
      const q = c.quantity && c.quantity > 0 ? c.quantity : 1;
      entry.qty += q;
      entry.spend += c.amount;
      currByItem.set(key, entry);
      if (c.supplierName) {
        supplierSpend.set(c.supplierName, (supplierSpend.get(c.supplierName) ?? 0) + c.amount);
      }
    }

    let rawPriceEffect = 0;
    let rawVolumeEffect = 0;
    for (const [key, curr] of currByItem.entries()) {
      const prev = prevByItem.get(key);
      if (!prev || prev.qty <= 0) {
        continue;
      }
      const currPrice = curr.spend / Math.max(1, curr.qty);
      rawPriceEffect += (currPrice - prev.avgPrice) * curr.qty;
      rawVolumeEffect += (curr.qty - prev.qty) * prev.avgPrice;
    }
    for (const [key, prev] of prevByItem.entries()) {
      if (!currByItem.has(key)) {
        rawVolumeEffect -= prev.spend;
      }
    }

    const priceEffectUZS = Math.round(rawPriceEffect);
    const volumeEffectUZS = Math.round(rawVolumeEffect);
    // Exact accounting identity: priceEffectUZS + volumeEffectUZS + newItemsEffectUZS === actual - prevActual
    const newItemsEffectUZS = actual - prevActual - priceEffectUZS - volumeEffectUZS;

    let topSupplierName: string | null = null;
    let topSupplierSpend = 0;
    for (const [name, spend] of supplierSpend.entries()) {
      if (spend > topSupplierSpend) {
        topSupplierName = name;
        topSupplierSpend = spend;
      }
    }

    let riskLevel: BudgetVarianceItem['riskLevel'] = 'LOW';
    if (limit > 0) {
      if (actual > limit) riskLevel = 'CRITICAL';
      else if (forecast > limit * 1.05 || usagePct >= 88) riskLevel = 'HIGH';
      else if (forecast > limit * 0.9 || usagePct >= 75) riskLevel = 'MEDIUM';
    }

    const catRu = categoryLabel(category, 'ru');
    const catUz = categoryLabel(category, 'uz');
    const catEn = categoryLabel(category, 'en');
    const supSuffixRu = topSupplierName ? ` Главный поставщик: ${topSupplierName} (${fmtUzs(topSupplierSpend)}).` : '';
    const supSuffixUz = topSupplierName ? ` Asosiy yetkazib beruvchi: ${topSupplierName} (${fmtUzs(topSupplierSpend)}).` : '';
    const supSuffixEn = topSupplierName ? ` Top supplier: ${topSupplierName} (${fmtUzs(topSupplierSpend)}).` : '';

    const explanation: Record<Language, string> = {
      ru: `${catRu}: факт ${fmtUzs(actual)} при лимите ${fmtUzs(limit)} (${usagePct}%). Ценовой фактор: ${fmtUzs(priceEffectUZS)}, объём: ${fmtUzs(volumeEffectUZS)}.${supSuffixRu}`,
      uz: `${catUz}: fakt ${fmtUzs(actual)}, limit ${fmtUzs(limit)} (${usagePct}%). Narx ta'siri: ${fmtUzs(priceEffectUZS)}, hajm: ${fmtUzs(volumeEffectUZS)}.${supSuffixUz}`,
      en: `${catEn}: actual ${fmtUzs(actual)} vs limit ${fmtUzs(limit)} (${usagePct}%). Price effect: ${fmtUzs(priceEffectUZS)}, volume: ${fmtUzs(volumeEffectUZS)}.${supSuffixEn}`,
    };

    results.push({
      category,
      month: monthKey,
      limit: Math.round(limit),
      actual,
      forecast,
      variance,
      projectedOverrun: Math.round(projectedOverrun),
      usagePct,
      dailyBurnRate,
      trendSlopeUZS: slope,
      projectedBreachDate,
      daysUntilBreach,
      riskLevel,
      drivers: {
        priceEffectUZS: Math.round(priceEffectUZS),
        volumeEffectUZS: Math.round(volumeEffectUZS),
        newItemsEffectUZS: Math.round(newItemsEffectUZS),
        topSupplierName,
        topSupplierSpend: Math.round(topSupplierSpend),
        explanation,
      },
    });
  }

  const rank: Record<BudgetVarianceItem['riskLevel'], number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };
  return results.sort((a, b) => rank[a.riskLevel] - rank[b.riskLevel] || b.actual - a.actual);
}

export async function computeBudgetVarianceAndForecast(
  restaurantId: string,
  monthParam?: string,
): Promise<BudgetVarianceItem[]> {
  const now = new Date();
  const { monthStart, monthEnd, monthKey, daysInMonth, elapsedDays } = resolveMonthRange(monthParam, now);
  const cacheKey = `${restaurantId}::${monthKey}`;
  const nowMs = Date.now();
  const cached = varianceCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return cached.value;
  }
  const prevMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
  const prevMonthEnd = new Date(monthStart.getTime() - 1);

  const [budgets, currExpenses, prevExpenses] = await Promise.all([
    db.expenseBudget.findMany({
      where: { restaurantId, month: monthStart },
      select: { category: true, limit: true },
    }),
    db.expense.findMany({
      where: { restaurantId, spentAt: { gte: monthStart, lte: monthEnd } },
      include: { supplier: { select: { name: true } } },
    }),
    db.expense.findMany({
      where: { restaurantId, spentAt: { gte: prevMonthStart, lte: prevMonthEnd } },
      include: { supplier: { select: { name: true } } },
    }),
  ]);

  const result = buildBudgetVarianceList({
    monthKey,
    monthStart,
    daysInMonth,
    elapsedDays,
    budgets: budgets.map(b => ({
      category: b.category as SharedExpenseCategory,
      limit: b.limit.toNumber(),
    })),
    currExpenses: currExpenses.map(e => ({
      category: e.category as SharedExpenseCategory,
      itemName: e.itemName,
      amount: e.amount.toNumber(),
      quantity: e.quantity ? e.quantity.toNumber() : null,
      unitPrice: e.unitPrice ? e.unitPrice.toNumber() : null,
      spentAt: e.spentAt,
      supplierName: e.supplier?.name ?? null,
    })),
    prevExpenses: prevExpenses.map(e => ({
      category: e.category as SharedExpenseCategory,
      itemName: e.itemName,
      amount: e.amount.toNumber(),
      quantity: e.quantity ? e.quantity.toNumber() : null,
      unitPrice: e.unitPrice ? e.unitPrice.toNumber() : null,
      spentAt: e.spentAt,
      supplierName: e.supplier?.name ?? null,
    })),
  });

  if (varianceCache.size >= 150) varianceCache.clear();
  varianceCache.set(cacheKey, { expiresAt: nowMs + VARIANCE_CACHE_TTL_MS, value: result });
  return result;
}

export interface BranchAllocationSeedInput {
  restaurantId: string;
  name: string;
  districtName: Record<Language, string>;
  districtDemandScore?: number;
  revenue: number;
  expenses: number;
  orders: number;
  growthPct: number;
  currentBudget: number;
  errorPenalty: number;
  overrunCount: number;
  categoryShares: Array<{ category: SharedExpenseCategory; share: number }>;
}

const DEFAULT_CATEGORY_SHARES: Array<{ category: SharedExpenseCategory; share: number }> = [
  { category: 'INGREDIENTS', share: 0.45 },
  { category: 'SALARY', share: 0.22 },
  { category: 'RENT', share: 0.14 },
  { category: 'UTILITIES', share: 0.09 },
  { category: 'MARKETING', share: 0.05 },
  { category: 'PACKAGING', share: 0.03 },
  { category: 'COMMUNICATION', share: 0.02 },
];

export function solveBranchBudgetAllocation(params: {
  branches: BranchAllocationSeedInput[];
  totalBudget: number;
  month: string;
  objective: 'profit' | 'balanced' | 'growth';
}): BranchAllocationResponse {
  const { branches, totalBudget, month, objective } = params;
  if (branches.length === 0) {
    return { totalBudget, objective, month, expectedTotalProfitLift: 0, branches: [] };
  }

  const safeTotal = Math.max(branches.length * 1_000_000, Math.round(totalBudget));
  const floorPerBranch = Math.round((safeTotal * 0.45) / branches.length);
  const capPerBranch = Math.round(safeTotal * 0.42);

  const scored = branches.map(b => {
    const netProfit = b.revenue - b.expenses;
    const netMarginPct = b.revenue > 0 ? Number(((netProfit / b.revenue) * 100).toFixed(1)) : 0;
    const roiPct = b.expenses > 0 ? Number(((netProfit / b.expenses) * 100).toFixed(1)) : 0;
    const discipline = Math.max(25, Math.min(100, 100 - b.overrunCount * 15 - b.errorPenalty * 8));

    const normRoi = Math.max(5, Math.min(100, 40 + roiPct * 0.45));
    const normGrowth = Math.max(5, Math.min(100, 50 + b.growthPct * 0.6));
    const normOrders = Math.max(10, Math.min(100, b.orders * 1.6));
    const districtDemandScore =
      typeof b.districtDemandScore === 'number' && Number.isFinite(b.districtDemandScore)
        ? Math.max(5, Math.min(100, Math.round(b.districtDemandScore)))
        : 50;

    let efficiencyScore = 50;
    if (objective === 'profit') {
      efficiencyScore =
        normRoi * 0.55 + discipline * 0.25 + normOrders * 0.1 + districtDemandScore * 0.1;
    } else if (objective === 'growth') {
      efficiencyScore =
        normGrowth * 0.4 + normOrders * 0.25 + districtDemandScore * 0.2 + normRoi * 0.15;
    } else {
      efficiencyScore =
        normRoi * 0.35 + discipline * 0.25 + normGrowth * 0.25 + districtDemandScore * 0.15;
    }

    return {
      ...b,
      districtDemandScore,
      netProfit,
      netMarginPct,
      roiPct,
      budgetDisciplineScore: Math.round(discipline),
      efficiencyScore: Math.round(efficiencyScore),
    };
  });

  const weightSum = scored.reduce((s, b) => s + Math.max(1, b.efficiencyScore), 0);
  const remainingPool = Math.max(0, safeTotal - floorPerBranch * scored.length);

  // Initial allocation respecting floor and cap
  const rawAllocations = scored.map(b => {
    const share = Math.max(1, b.efficiencyScore) / weightSum;
    return Math.min(capPerBranch, floorPerBranch + Math.round(remainingPool * share));
  });

  // Rebalance rounding/cap residual so sum === safeTotal
  let diff = safeTotal - rawAllocations.reduce((s, v) => s + v, 0);
  let guard = 0;
  while (diff !== 0 && guard < 200) {
    guard++;
    for (let i = 0; i < rawAllocations.length && diff !== 0; i++) {
      if (diff > 0 && rawAllocations[i]! < capPerBranch) {
        const step = Math.min(diff, capPerBranch - rawAllocations[i]!);
        rawAllocations[i] = rawAllocations[i]! + step;
        diff -= step;
      } else if (diff < 0 && rawAllocations[i]! > floorPerBranch) {
        const step = Math.min(-diff, rawAllocations[i]! - floorPerBranch);
        rawAllocations[i] = rawAllocations[i]! - step;
        diff += step;
      }
    }
    if (guard > 20 && diff !== 0) {
      rawAllocations[0] = (rawAllocations[0] ?? 0) + diff;
      diff = 0;
    }
  }

  let expectedTotalProfitLift = 0;
  const items: BranchPerformanceItem[] = scored.map((b, idx) => {
    const recommendedBudget = rawAllocations[idx]!;
    const baselineBudget = b.currentBudget > 0 ? b.currentBudget : Math.round(safeTotal / scored.length);
    const deltaBudget = recommendedBudget - baselineBudget;
    const deltaPct = baselineBudget > 0 ? Number(((deltaBudget / baselineBudget) * 100).toFixed(1)) : 0;
    const marginalRoi = Math.max(0.08, Math.min(0.45, b.roiPct / 100));
    const expectedRevenueLift = deltaBudget > 0 ? Math.round(deltaBudget * (1 + marginalRoi)) : 0;
    const profitLift = Math.round(Math.abs(deltaBudget) * 0.14 + (b.efficiencyScore > 65 ? 650_000 : 250_000));
    expectedTotalProfitLift += profitLift;

    const shares = b.categoryShares.length > 0 ? b.categoryShares : DEFAULT_CATEGORY_SHARES;
    const categoryAllocations = shares.map(s => ({
      category: s.category,
      recommendedLimit: Math.round((recommendedBudget * s.share) / 10_000) * 10_000,
    }));

    const directionRu = deltaBudget >= 0 ? `увеличить на ${deltaPct}%` : `сократить на ${Math.abs(deltaPct)}%`;
    const directionUz = deltaBudget >= 0 ? `${deltaPct}% ga oshirish` : `${Math.abs(deltaPct)}% ga kamaytirish`;
    const directionEn = deltaBudget >= 0 ? `increase by ${deltaPct}%` : `trim by ${Math.abs(deltaPct)}%`;

    return {
      restaurantId: b.restaurantId,
      name: b.name,
      districtName: b.districtName,
      revenue: Math.round(b.revenue),
      expenses: Math.round(b.expenses),
      netProfit: Math.round(b.netProfit),
      netMarginPct: b.netMarginPct,
      roiPct: b.roiPct,
      orders: b.orders,
      growthPct: b.growthPct,
      budgetDisciplineScore: b.budgetDisciplineScore,
      efficiencyScore: b.efficiencyScore,
      currentBudget: Math.round(baselineBudget),
      recommendedBudget,
      deltaBudget,
      deltaPct,
      expectedRevenueLift,
      rationale: {
        ru: `ROI ${b.roiPct}%, дисциплина ${b.budgetDisciplineScore}/100, спрос района ${b.districtDemandScore}/100, эффективность ${b.efficiencyScore}/100 → ${directionRu}.`,
        uz: `ROI ${b.roiPct}%, intizom ${b.budgetDisciplineScore}/100, tuman talabi ${b.districtDemandScore}/100, samaradorlik ${b.efficiencyScore}/100 → ${directionUz}.`,
        en: `ROI ${b.roiPct}%, discipline ${b.budgetDisciplineScore}/100, district demand ${b.districtDemandScore}/100, efficiency ${b.efficiencyScore}/100 → ${directionEn}.`,
      },
      categoryAllocations,
    };
  });

  items.sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  return {
    totalBudget: safeTotal,
    objective,
    month,
    expectedTotalProfitLift: Math.round(expectedTotalProfitLift),
    branches: items,
  };
}

export async function computeMultiBranchAllocation(params: {
  totalBudget?: number;
  month?: string;
  objective?: 'profit' | 'balanced' | 'growth';
}): Promise<BranchAllocationResponse> {
  const now = new Date();
  const { monthKey, monthStart } = resolveMonthRange(params.month, now);
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const objective = params.objective ?? 'balanced';
  const cacheKey = `${monthKey}::${objective}::${params.totalBudget ?? 'auto'}`;
  const nowMs = Date.now();
  const cached = allocationCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return cached.value;
  }

  const [restaurants, geoAnalysis] = await Promise.all([
    db.restaurant.findMany({
      select: { id: true, name: true, addressText: true, latitude: true, longitude: true },
      orderBy: { name: 'asc' },
    }),
    analyzeOrdersByDistrict({ restaurantId: 'ALL' }),
  ]);
  const districtDemandMap = new Map(
    geoAnalysis.districts.map(d => [d.districtId, d.demandScore]),
  );

  const branchAnalyses = await Promise.all(
    restaurants.map(async r => {
      const analysis = await runRestaurantAnalysis(r.id);
      const overview = analysis.overview;
      const budgets =
        monthKey === currentMonthKey && analysis.budgets
          ? analysis.budgets
          : await db.expenseBudget.findMany({
              where: { restaurantId: r.id, month: monthStart },
              select: { category: true, limit: true },
            });
      const districtId = resolveTashkentDistrict(r.latitude, r.longitude, r.addressText);
      const districtDemandScore = districtDemandMap.get(districtId) ?? 50;
      const districtName = TASHKENT_DISTRICT_MAP.get(districtId)?.name ?? {
        uz: 'Toshkent',
        ru: 'Ташкент',
        en: 'Tashkent',
      };
      const currentBudget = budgets.reduce((s, b) => {
        const val = typeof b.limit === 'number' ? b.limit : b.limit.toNumber();
        return s + val;
      }, 0);
      const overrunCount = (analysis.budgets ?? []).filter(b => b.status === 'OVERRUN').length;
      const errorPenalty = analysis.findings.filter(f => f.kind === 'ERROR').length;

      const totalCatExp = overview.categoryBreakdown.reduce((s, c) => s + c.amount, 0);
      const categoryShares =
        totalCatExp > 0
          ? overview.categoryBreakdown.slice(0, 6).map(c => ({
              category: c.category,
              share: c.amount / totalCatExp,
            }))
          : DEFAULT_CATEGORY_SHARES;

      // Ensure branch with minimal expense history has realistic baseline
      const expenses = overview.totalExpenses > 0 ? overview.totalExpenses : 2_500_000;
      const revenue = overview.revenue > 0 ? overview.revenue : 4_200_000;

      return {
        restaurantId: r.id,
        name: r.name,
        districtName,
        districtDemandScore,
        revenue,
        expenses,
        orders: overview.deliveredOrders,
        growthPct: overview.revenueDeltaPct,
        currentBudget: currentBudget > 0 ? currentBudget : Math.round(expenses * 1.15),
        errorPenalty,
        overrunCount,
        categoryShares,
      };
    }),
  );

  const sumCurrent = branchAnalyses.reduce((s, b) => s + b.currentBudget, 0);
  const totalBudget =
    params.totalBudget && params.totalBudget > 0
      ? params.totalBudget
      : Math.max(50_000_000, Math.round(sumCurrent));

  const result = solveBranchBudgetAllocation({
    branches: branchAnalyses,
    totalBudget,
    month: monthKey,
    objective,
  });

  if (allocationCache.size >= 80) allocationCache.clear();
  allocationCache.set(cacheKey, { expiresAt: nowMs + ALLOCATION_CACHE_TTL_MS, value: result });
  return result;
}

export interface MacroScenarioResult {
  baseline: {
    revenue: number;
    expenses: number;
    netProfit: number;
    netMarginPct: number;
  };
  projected: {
    revenue: number;
    expenses: number;
    netProfit: number;
    netMarginPct: number;
    profitDelta: number;
  };
  assumptions: {
    foodInflationPct: number;
    utilityTariffPct: number;
    rentChangePct: number;
    orderVolumeChangePct: number;
    priceIncreasePct: number;
  };
}

export async function simulateMacroScenario(params: {
  restaurantId: string;
  from?: string;
  to?: string;
  foodInflationPct?: number;
  utilityTariffPct?: number;
  rentChangePct?: number;
  orderVolumeChangePct?: number;
  priceIncreasePct?: number;
}): Promise<MacroScenarioResult> {
  const overview = await getBusinessOverview(params.restaurantId, params.from, params.to);
  const foodInf = params.foodInflationPct ?? 0;
  const utilInf = params.utilityTariffPct ?? 0;
  const rentChg = params.rentChangePct ?? 0;
  const volChg = params.orderVolumeChangePct ?? 0;
  const priceChg = params.priceIncreasePct ?? 0;

  const getCat = (cat: SharedExpenseCategory) =>
    overview.categoryBreakdown.find(c => c.category === cat)?.amount ?? 0;

  const baseRev = overview.revenue;
  const baseExp = overview.totalExpenses;
  const baseProfit = overview.netProfit;

  const newRev = Math.round(baseRev * (1 + volChg / 100) * (1 + priceChg / 100));
  const ingCost = getCat('INGREDIENTS') * (1 + volChg / 100) * (1 + foodInf / 100);
  const packCost = getCat('PACKAGING') * (1 + volChg / 100);
  const utilCost = getCat('UTILITIES') * (1 + utilInf / 100);
  const rentCost = getCat('RENT') * (1 + rentChg / 100);
  const otherCost = Math.max(
    0,
    baseExp - getCat('INGREDIENTS') - getCat('PACKAGING') - getCat('UTILITIES') - getCat('RENT'),
  );

  const newExp = Math.round(ingCost + packCost + utilCost + rentCost + otherCost);
  const newProfit = newRev - newExp;
  const newMarginPct = newRev > 0 ? Number(((newProfit / newRev) * 100).toFixed(1)) : 0;

  return {
    baseline: {
      revenue: Math.round(baseRev),
      expenses: Math.round(baseExp),
      netProfit: Math.round(baseProfit),
      netMarginPct: overview.netMarginPct,
    },
    projected: {
      revenue: newRev,
      expenses: newExp,
      netProfit: newProfit,
      netMarginPct: newMarginPct,
      profitDelta: newProfit - Math.round(baseProfit),
    },
    assumptions: {
      foodInflationPct: foodInf,
      utilityTariffPct: utilInf,
      rentChangePct: rentChg,
      orderVolumeChangePct: volChg,
      priceIncreasePct: priceChg,
    },
  };
}

export const MCP_TOOLS: McpToolDescriptor[] = [
  {
    name: 'get_financial_overview',
    description: 'Get revenue, expenses, net profit, food/labor/admin %, and break-even KPIs for a branch.',
    category: 'point_26',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'audit_expenses_and_waste',
    description: 'Detect duplicate invoices, amount/category errors, supplier price spikes, utility anomalies, and deduplicated UZS savings (Point 26).',
    category: 'point_26',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
  },
  {
    name: 'check_budget_execution',
    description: 'Compare planned vs actual budget, predict month-end overrun and exact breach date, and decompose price vs volume variance (Point 25).',
    category: 'point_25',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM' },
      },
    },
  },
  {
    name: 'optimize_branch_budgets',
    description: 'Rank all branches by ROI, discipline, and demand, and optimally allocate total budget across branches (Point 24).',
    category: 'point_24',
    inputSchema: {
      type: 'object',
      properties: {
        totalBudget: { type: 'number', description: 'Total budget pool in UZS' },
        month: { type: 'string', description: 'YYYY-MM' },
        objective: { type: 'string', enum: ['profit', 'balanced', 'growth'] },
      },
    },
  },
  {
    name: 'analyze_district_orders',
    description: 'Analyze order density, revenue, delivery distance, courier margin, and underserved growth zones across Tashkent 12 districts.',
    category: 'geo_map',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'current'] },
        districtId: { type: 'string', description: 'Optional TashkentDistrictId filter' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
  },
  {
    name: 'order_heatmap',
    description: 'Get privacy-safe k-anonymous ~500m (0.005 deg) grid heatmap cells of Tashkent order density and revenue.',
    category: 'geo_map',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'current'] },
        districtId: { type: 'string', description: 'Optional TashkentDistrictId filter' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
  },
  {
    name: 'branch_catchment',
    description: 'Analyze each branch service-area catchment (orders and revenue within vs outside radiusKm) and top districts served.',
    category: 'geo_map',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'current'] },
        radiusKm: { type: 'number', description: 'Catchment radius in km (default 3.5)' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
  },
  {
    name: 'find_growth_districts',
    description: 'Rank Tashkent districts by expansion/marketing opportunity score based on demand, branch distance, and delivery margin.',
    category: 'geo_map',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'current'] },
        limit: { type: 'number', description: 'Max districts to return (default 6)' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
  },
  {
    name: 'simulate_what_if_scenario',
    description: 'Stress-test P&L under utility tariff hikes, ingredient inflation, rent changes, or order growth.',
    category: 'point_25',
    inputSchema: {
      type: 'object',
      properties: {
        foodInflationPct: { type: 'number' },
        utilityTariffPct: { type: 'number' },
        rentChangePct: { type: 'number' },
        orderVolumeChangePct: { type: 'number' },
        priceIncreasePct: { type: 'number' },
      },
    },
  },
  {
    name: 'get_expenses',
    description:
      'Fetch itemized expenses for an exact date or date range (YYYY-MM-DD..YYYY-MM-DD), grouped by Priority (Taxes, Electricity/Utilities), Base, and Additional costs.',
    category: 'point_26',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        category: { type: 'string', description: 'Optional ExpenseCategory filter' },
        group: { type: 'string', enum: ['priority', 'base', 'additional'] },
        limit: { type: 'number', description: 'Max rows (default 50)' },
      },
    },
  },
  {
    name: 'control_app_dashboard',
    description:
      'Navigate the desktop UI to a tab, update active filters (branch, days, from/to dates, month, district), highlight a widget, or manage custom dashboards (create, update/append, rename, switch, delete, remove widget, pin/unpin).',
    category: 'ui_control',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'navigate',
            'create_dashboard',
            'update_dashboard',
            'rename_dashboard',
            'delete_dashboard',
            'select_dashboard',
            'remove_dashboard_widget',
            'pin_widget',
            'unpin_widget',
            'highlight_widget',
            'set_filters',
          ],
        },
        tab: { type: 'string', enum: ['dashboard', 'agent', 'audit', 'expenses', 'budgets', 'branches', 'map', 'sales'] },
        dashboardTitle: { type: 'string', description: 'Title for creating, renaming, or selecting a custom dashboard' },
        dashboardId: { type: 'string', description: 'ID of custom dashboard or "main" for main overview' },
        mode: { type: 'string', enum: ['replace', 'append'] },
        deleteAll: { type: 'boolean' },
        blockKind: { type: 'string', enum: ['kpis', 'chart', 'table', 'alert', 'map', 'allocation'] },
        restaurantId: { type: 'string' },
        days: { type: 'number', enum: [7, 30, 60, 90] },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        month: { type: 'string' },
        districtId: { type: 'string' },
        widgetId: { type: 'string' },
      },
    },
  },
];

function buildLossDeliveryAuditFindings(geo: DistrictGeoAnalysisResponse) {
  return geo.lossMakingDeliveryDistricts
    .filter(d => d.deliveryMargin < 0 && d.orders > 0)
    .map(d => {
      const loss = Math.abs(Math.round(d.deliveryMargin));
      return {
        id: `geo-loss-${d.districtId}`,
        kind: 'INEFFICIENCY' as const,
        code: 'LOSS_MAKING_DELIVERY_ZONE',
        severity: loss >= 150_000 ? ('high' as const) : ('medium' as const),
        category: 'DELIVERY' as SharedExpenseCategory,
        amountImpact: loss,
        title: {
          ru: `Убыточная доставка в районе ${d.name.ru} (-${fmtUzs(loss)})`,
          uz: `${d.name.uz} hududiga zararli yetkazish (-${fmtUzs(loss)})`,
          en: `Loss-making delivery in ${d.name.en} (-${fmtUzs(loss)})`,
        },
        detail: {
          ru: `${d.orders} заказов со средней дистанцией ${d.avgDistanceKm} км: сборы доставки ${fmtUzs(d.deliveryFeeRevenue)} ниже расчётной стоимости курьеров ${fmtUzs(d.estimatedCourierCost)}.`,
          uz: `${d.orders} ta buyurtma, o‘rtacha masofa ${d.avgDistanceKm} km: yetkazish tushumi ${fmtUzs(d.deliveryFeeRevenue)}, kuryer xarajati ${fmtUzs(d.estimatedCourierCost)}.`,
          en: `${d.orders} orders averaging ${d.avgDistanceKm} km: delivery fees ${fmtUzs(d.deliveryFeeRevenue)} vs courier cost ${fmtUzs(d.estimatedCourierCost)}.`,
        },
        recommendation: {
          ru: `Введите зональный тариф доставки для ${d.name.ru} (>5 км), поднимите минимальный чек или объединяйте заказы через ближайший филиал (${d.nearestBranchName}). Экономия до ${fmtUzs(loss)}.`,
          uz: `${d.name.uz} uchun zonal yetkazish narxini joriy qiling (>5 km), minimal chekni oshiring yoki ${d.nearestBranchName} orqali buyurtmalarni birlashtiring. Tejash: ${fmtUzs(loss)} gacha.`,
          en: `Introduce tiered delivery pricing for ${d.name.en} (>5 km), raise min order threshold, or batch via ${d.nearestBranchName} to save up to ${fmtUzs(loss)}.`,
        },
        metrics: {
          districtId: d.districtId,
          orders: d.orders,
          avgDistanceKm: d.avgDistanceKm,
          deliveryMargin: d.deliveryMargin,
        },
        expenseIds: undefined,
      };
    });
}

async function fetchExpensesForPeriod(
  restaurantId: string,
  fromDate: Date,
  toDate: Date,
  opts?: { categories?: SharedExpenseCategory[]; limit?: number },
): Promise<AnalysisExpenseInput[]> {
  const rows = await db.expense.findMany({
    where: {
      restaurantId,
      spentAt: { gte: fromDate, lte: toDate },
      ...(opts?.categories && opts.categories.length > 0
        ? { category: { in: opts.categories } }
        : {}),
    },
    include: { supplier: { select: { name: true } } },
    orderBy: [{ spentAt: 'desc' }, { amount: 'desc' }],
    ...(opts?.limit ? { take: opts.limit } : {}),
  });
  return rows.map(r => ({
    id: r.id,
    supplierId: r.supplierId,
    supplierName: r.supplier?.name ?? null,
    category: r.category as SharedExpenseCategory,
    itemName: r.itemName,
    description: r.description,
    amount: r.amount.toNumber(),
    quantity: r.quantity ? r.quantity.toNumber() : null,
    unit: r.unit,
    unitPrice: r.unitPrice ? r.unitPrice.toNumber() : null,
    invoiceNumber: r.invoiceNumber,
    spentAt: r.spentAt,
  }));
}

export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  context: { restaurantId: string; from?: string; to?: string; month?: string },
): Promise<unknown> {
  const argPeriod = typeof args.period === 'string' ? parseDatePeriodFromQuestion(args.period) : null;
  const from = typeof args.from === 'string' ? args.from : (argPeriod?.from ?? context.from);
  const to = typeof args.to === 'string' ? args.to : (argPeriod?.to ?? context.to);
  const month = typeof args.month === 'string' ? args.month : (argPeriod?.month ?? context.month);
  const districtId =
    typeof args.districtId === 'string' && TASHKENT_DISTRICT_MAP.has(args.districtId as TashkentDistrictId)
      ? (args.districtId as TashkentDistrictId)
      : undefined;

  switch (name) {
    case 'get_financial_overview':
      return getBusinessOverview(context.restaurantId, from, to);
    case 'get_expenses': {
      const range = resolveDateRange(from, to);
      const groupArg =
        args.group === 'priority' || args.group === 'base' || args.group === 'additional'
          ? args.group
          : undefined;
      const categoryArg =
        typeof args.category === 'string' ? (args.category as SharedExpenseCategory) : undefined;
      const categories = categoryArg
        ? [categoryArg]
        : groupArg === 'priority'
          ? [...PRIORITY_EXPENSE_CATEGORIES]
          : groupArg === 'base'
            ? [...BASE_EXPENSE_CATEGORIES]
            : groupArg === 'additional'
              ? [...ADDITIONAL_EXPENSE_CATEGORIES]
              : undefined;
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(200, args.limit) : 50;
      const items = await fetchExpensesForPeriod(context.restaurantId, range.from, range.to, {
        categories,
        limit,
      });
      const prioritySummary = computePriorityExpenseSummary({ expenses: items });
      return {
        period: {
          from: range.from.toISOString().slice(0, 10),
          to: range.to.toISOString().slice(0, 10),
          days: range.days,
        },
        prioritySummary,
        totalCount: items.length,
        totalAmount: Math.round(items.reduce((s, i) => s + i.amount, 0)),
        items: items.map(i => ({
          id: i.id,
          spentAt: i.spentAt.toISOString().slice(0, 10),
          category: i.category,
          priorityTier: getExpensePriorityTier(i.category),
          itemName: i.itemName,
          description: i.description,
          supplierName: i.supplierName,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unitPrice,
          amount: Math.round(i.amount),
          invoiceNumber: i.invoiceNumber,
        })),
      };
    }
    case 'analyze_losses':
    case 'audit_expenses_and_waste': {
      const [analysis, geo] = await Promise.all([
        runRestaurantAnalysis(context.restaurantId, from, to),
        analyzeOrdersByDistrict({ restaurantId: context.restaurantId, from, to }),
      ]);
      const deliveryFindings = buildLossDeliveryAuditFindings(geo);
      const deliveryZoneSavingUZS = deliveryFindings.reduce((s, f) => s + f.amountImpact, 0);
      const mergedFindings = [...analysis.findings, ...deliveryFindings];
      return {
        healthScore: analysis.report.healthScore,
        potentialSavingUZS: analysis.report.totalPotentialSavingUZS + deliveryZoneSavingUZS,
        auditSavingUZS: analysis.report.totalPotentialSavingUZS,
        deliveryZoneSavingUZS,
        lossMakingDeliveryZones: deliveryFindings.map(f => ({
          districtId: f.metrics.districtId,
          potentialSavingUZS: f.amountImpact,
          title: f.title,
          recommendation: f.recommendation,
        })),
        findings: mergedFindings.slice(0, 14).map(f => ({
          id: f.id,
          kind: f.kind,
          code: f.code,
          severity: f.severity,
          category: f.category,
          amountImpact: f.amountImpact,
          title: f.title,
          detail: f.detail,
          recommendation: f.recommendation,
          metrics: f.metrics,
          expenseIds: f.expenseIds,
        })),
      };
    }
    case 'get_budget_variance':
    case 'check_budget_execution':
      return computeBudgetVarianceAndForecast(context.restaurantId, month);
    case 'optimize_branch_budgets':
      return computeMultiBranchAllocation({
        totalBudget: typeof args.totalBudget === 'number' ? args.totalBudget : undefined,
        month,
        objective:
          args.objective === 'profit' || args.objective === 'growth' || args.objective === 'balanced'
            ? args.objective
            : 'balanced',
      });
    case 'analyze_district_orders':
      return analyzeOrdersByDistrict({
        restaurantId: args.scope === 'current' ? context.restaurantId : 'ALL',
        from,
        to,
        districtId,
      });
    case 'order_heatmap': {
      const geo = await analyzeOrdersByDistrict({
        restaurantId: args.scope === 'current' ? context.restaurantId : 'ALL',
        from,
        to,
        districtId,
      });
      return {
        period: geo.period,
        restaurantId: geo.restaurantId,
        gridDeg: HEATMAP_GRID_DEG,
        minOrdersPerCell: HEATMAP_MIN_K_ANONYMITY,
        cellCount: geo.heatmapCells?.length ?? 0,
        heatmapCells: geo.heatmapCells ?? [],
      };
    }
    case 'branch_catchment':
      return computeBranchCatchment({
        restaurantId: args.scope === 'all' ? 'ALL' : context.restaurantId,
        radiusKm: typeof args.radiusKm === 'number' ? args.radiusKm : 3.5,
        from,
        to,
      });
    case 'find_growth_districts':
      return findGrowthDistricts({
        restaurantId: args.scope === 'current' ? context.restaurantId : 'ALL',
        from,
        to,
        limit: typeof args.limit === 'number' ? args.limit : 6,
      });
    case 'simulate_what_if_scenario':
      return simulateMacroScenario({
        restaurantId: context.restaurantId,
        from,
        to,
        foodInflationPct: Number(args.foodInflationPct ?? 0),
        utilityTariffPct: Number(args.utilityTariffPct ?? 0),
        rentChangePct: Number(args.rentChangePct ?? 0),
        orderVolumeChangePct: Number(args.orderVolumeChangePct ?? 0),
        priceIncreasePct: Number(args.priceIncreasePct ?? 0),
      });
    case 'control_app_dashboard':
      return { accepted: true, action: args };
    default:
      return { error: `Unknown MCP tool: ${name}` };
  }
}

const DISTRICT_INTENT_PATTERNS: Array<{ id: TashkentDistrictId; re: RegExp }> = [
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

const BRANCH_INTENT_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: 'rest-osh', re: /(osh\s*&\s*olov|ош\s*и\s*олов|\bosh\b)/i },
  { id: 'rest-basilico', re: /(basilico|базилико)/i },
  { id: 'rest-burger', re: /(burger\s*bureau|бургер\s*бюро)/i },
  { id: 'rest-non', re: /(non\s*house|нон\s*хаус)/i },
  { id: 'rest-mori', re: /(\bmori\b|мори)/i },
  { id: 'rest-saffron', re: /(saffron|шафран)/i },
];

export interface ParsedScenarioAssumptions {
  foodInflationPct: number;
  utilityTariffPct: number;
  rentChangePct: number;
  orderVolumeChangePct: number;
  priceIncreasePct: number;
}

export function parseScenarioAssumptions(question: string): ParsedScenarioAssumptions {
  const lower = question.toLowerCase();
  const matches = [...lower.matchAll(/([+-]?\d+(?:[.,]\d+)?)\s*%/g)];
  const parsed: Partial<ParsedScenarioAssumptions> = {};

  const categories: Array<{ key: keyof ParsedScenarioAssumptions; re: RegExp }> = [
    { key: 'utilityTariffPct', re: /(электр|свет|газ|коммун|тариф|elektr|kommunal|utilit|tariff)/i },
    { key: 'foodInflationPct', re: /(сырь|продукт|мяс|рис|масалли|masalliq|mahsulot|food|ingredient|meat)/i },
    { key: 'rentChangePct', re: /(аренд|ijara|rent)/i },
    { key: 'orderVolumeChangePct', re: /(заказ|спрос|объ[её]м|buyurtma|talab|order|volume|demand)/i },
    { key: 'priceIncreasePct', re: /(меню|чек|прайс|narx|menu|price)/i },
  ];

  for (const m of matches) {
    const val = Number(m[1]!.replace(',', '.'));
    if (!Number.isFinite(val)) continue;
    const idx = m.index ?? 0;
    const windowStart = Math.max(0, idx - 32);
    const windowEnd = Math.min(lower.length, idx + m[0].length + 28);
    const snippet = lower.slice(windowStart, windowEnd);

    for (const cat of categories) {
      if (cat.re.test(snippet) && parsed[cat.key] === undefined) {
        parsed[cat.key] = val;
        break;
      }
    }
  }

  const hasAny = Object.keys(parsed).length > 0;
  return {
    foodInflationPct: parsed.foodInflationPct ?? (hasAny ? 0 : 10),
    utilityTariffPct: parsed.utilityTariffPct ?? (hasAny ? 0 : 20),
    rentChangePct: parsed.rentChangePct ?? (hasAny ? 0 : 5),
    orderVolumeChangePct: parsed.orderVolumeChangePct ?? 0,
    priceIncreasePct: parsed.priceIncreasePct ?? 0,
  };
}

const CATEGORY_INTENT_PATTERNS: Array<{ category: SharedExpenseCategory; re: RegExp }> = [
  { category: 'UTILITIES', re: /(коммунал|свет|электр|квт|газ|вода|тепло|рэс|худудгаз|сувсоз|elektr|suv|gaz|kommunal|utilit|kwh)/i },
  { category: 'RENT', re: /(аренд|ижар|ijara|rent|lease)/i },
  { category: 'COMMUNICATION', re: /(связ|интернет|телефон|aloqa|telecom|communicat)/i },
  { category: 'INGREDIENTS', re: /(сырь|продукт|ингредиент|мяс|рис|масалли|masalliq|mahsulot|ingredient|food)/i },
  { category: 'SALARY', re: /(зарплат|персонал|фот|оклад|ish\s*haqi|maosh|salary|payroll|labor)/i },
  { category: 'MARKETING', re: /(маркетинг|реклам|smm|marketing|promo)/i },
  { category: 'DELIVERY', re: /(доставк|курьер|yetkazish|kuryer|delivery)/i },
  { category: 'PACKAGING', re: /(упаков|посуд|qadoq|packag)/i },
  { category: 'EQUIPMENT', re: /(оборудован|инвентар|uskuna|equipment)/i },
  { category: 'TAXES', re: /(налог|ндс|есп|ндфл|гнк|енп|сбор|soliq|qqs|boj|tax|taxes|vat|fiscal)/i },
];

export function detectQuestionIntents(q: string, now: Date = new Date()): {
  isMap: boolean;
  isBranchAlloc: boolean;
  isBudget: boolean;
  isAudit: boolean;
  isWhatIf: boolean;
  isSales: boolean;
  isExpenseQuery: boolean;
  isPriorityQuery: boolean;
  isCreateDashboard: boolean;
  isUpdateDashboard: boolean;
  dashboardUpdateMode: 'append' | 'replace';
  isRenameDashboard: boolean;
  isDeleteDashboard: boolean;
  deleteAllDashboards: boolean;
  isSelectMainDashboard: boolean;
  isSelectCustomDashboard: boolean;
  isRemoveDashboardWidget: boolean;
  isListDashboards: boolean;
  removeWidgetKind: AgentUiBlock['kind'] | null;
  isPinWidget: boolean;
  isUnpinWidget: boolean;
  isScreenQuestion: boolean;
  requestedCategories: SharedExpenseCategory[];
  requestedNavTab: AgentNavTab | null;
  requestedDistrict: TashkentDistrictId | null;
  requestedRestaurantId: string | null;
  requestedAmountUZS: number | null;
  requestedDays: number | null;
  parsedPeriod: ParsedDatePeriod | null;
  requestedHighlightWidget: string | null;
  requestedDashboardTitle: string | null;
} {
  const lower = q.toLowerCase();
  const isMap = /(карт|район|откуда|клиент|доставк|tuman|xarita|mijoz|hudud|district|map|client|heatmap|sergeli|chilonzor|yunusobod|mirzo|yakkasaroy|mirobod|shayxontohur|olmazor|uchtepa|yashnobod|yangihayot|bektemir|чиланзар|юнусабад|сергели|мирабад|учтепа|алмазар|яшнабад|бектемир|шайхантахур|яккасарай|янгиха)/i.test(lower);
  const isBranchAlloc = /(филиал|бхм|bxm|bxo|распредел|подели|аллокац|filial|taqsim|bo'linma|branch|allocat|split|(?:^|[^\d])(?:#|кейс\s*#?|case\s*#?|keys\s*#?)\s*24\b)/i.test(lower);
  const isBudget = /(бюджет|лимит|перерасх|прогноз|план|факт|byudjet|reja|fakt|prognoz|oshish|budget|forecast|overrun|breach|variance|(?:^|[^\d])(?:#|кейс\s*#?|case\s*#?|keys\s*#?)\s*25\b)/i.test(lower);
  const isAudit = /(ошиб|дубл|аудит|эконом|сократ|свет|электр|связ|постав|xato|dublikat|teja|elektr|aloqa|audit|error|duplicate|saving|cost|(?:^|[^\d])(?:#|кейс\s*#?|case\s*#?|keys\s*#?)\s*26\b)/i.test(lower);
  const isWhatIf = /(сценар|что\s+если|если\s+[^.!?\n]{0,45}(?:%|выраст|упадут|подним|сниз|повыс|увелич|сократ|oshsa|kamaysa|ko'taril|hik|inflat|rise|drop)|инфляц|тариф|what.?if|simulat|stress.?test|ssenariy|inflyatsiya|tarif)/i.test(lower);
  const isSales = /(продаж|меню|блюд|маржинал|abc|star|dog|savdo|taom|menyu|sales|menu\b|dish)/i.test(lower);
  const isExpenseQuery = /(расход|затрат|трат|накладн|сч[её]т|налог|ндс|есп|ндфл|электр|свет|квт|коммунал|газ|вод|базов|дополнит|xarajat|sarflar|soliq|qqs|elektr|svet|kommunal|asosiy|qo'shimcha|expense|spend|spending|cost|tax|taxes|vat|electric|utilit|base|additional)/i.test(lower);
  const isPriorityQuery = /(налог|ндс|есп|ндфл|электр|свет|квт|коммунал|приоритет|базов|дополнит|soliq|qqs|elektr|svet|kommunal|asosiy|qo'shimcha|ustuvor|tax|taxes|vat|electric|kwh|utilit|priority|base|additional)/i.test(lower);
  const parsedPeriod = parseDatePeriodFromQuestion(q, now);

  const hasDashboardWord = /(дашборд|панел|виджет|борд|dashboard|custom\s+board)/i.test(lower);

  const isRenameDashboard =
    /(переименуй|назови\s+дашборд|смени\s+название|измени\s+название|rename\s+.*dashboard|(?:dashboard|panel)[a-zа-яё]*\s+nomini)/i.test(lower);

  // Extract explicit target title; for rename queries prefer the new title after "в"/"на"/"to"/"nomini"
  let requestedDashboardTitle: string | null = null;
  if (isRenameDashboard) {
    const renameMatch =
      q.match(/(?:переименуй|назови|смени\s+название|измени\s+название)(?:\s+(?:этот|текущий|кастомный|мой))?(?:\s+(?:дашборд|панель))?(?:\s+[«"'“][^»"'”]+[»"'”])?\s+(?:в|на)\s+([^\n.,;!?]{2,60})/i) ??
      q.match(/rename(?:\s+(?:this|the|current|custom))?\s+dashboard(?:\s+["'“][^"'”]+["'”])?\s+to\s+([^\n.,;!?]{2,60})/i) ??
      q.match(/(?:dashboard|panel)\w*\s+nomini\s+([^\n.,;!?]{2,60}?)\s+(?:deb|ga)\b/i);
    if (renameMatch?.[1]) {
      requestedDashboardTitle = renameMatch[1].trim().replace(/^[«"'“]+|[»"'”]+$/g, '');
    }
  }
  if (!requestedDashboardTitle) {
    const quoteMatch =
      q.match(/«([^»]{2,60})»/) ??
      q.match(/"([^"]{2,60})"/) ??
      q.match(/“([^”]{2,60})”/);
    if (quoteMatch?.[1]) {
      requestedDashboardTitle = quoteMatch[1].trim();
    }
  }

  let removeWidgetKind: AgentUiBlock['kind'] | null = null;
  if (/(убер[иь]|удал[иь]|скрой|убрать|remove|hide|olib\s+tashla)/i.test(lower) && hasDashboardWord) {
    if (/(таблиц|table|jadval)/i.test(lower)) removeWidgetKind = 'table';
    else if (/(график|диаграмм|чарт|chart|grafik)/i.test(lower)) removeWidgetKind = 'chart';
    else if (/(карт|map|xarita)/i.test(lower)) removeWidgetKind = 'map';
    else if (/(\bkpi\b|карточк|ko'rsatkich)/i.test(lower)) removeWidgetKind = 'kpis';
    else if (/(алерт|предупрежден|alert|ogohlantirish)/i.test(lower)) removeWidgetKind = 'alert';
    else if (/(аллокац|распределен|allocation)/i.test(lower)) removeWidgetKind = 'allocation';
  }
  const isRemoveDashboardWidget = removeWidgetKind !== null;

  const isDeleteDashboard =
    !isRemoveDashboardWidget &&
    /((удал[иь]|убрать|сотри|сбрось|очист[иь])\s+(?:этот\s+|текущий\s+|кастомн[а-яё]*\s+|все\s+|мои\s+|мой\s+)*(дашборд|панел)|(delete|remove|clear|reset)\s+(?:this\s+|current\s+|custom\s+|all\s+)*dashboard|(?:shu\s+|barcha\s+|maxsus\s+)*(?:dashboard|panel)[a-zа-яё]*\s+o'chir)/i.test(lower);
  const deleteAllDashboards =
    isDeleteDashboard && /(все\s+|all\s+|barcha\s+|сбрось|очист|reset|clear)/i.test(lower);

  const isAppendDashboard =
    !isRenameDashboard &&
    !isDeleteDashboard &&
    !isRemoveDashboardWidget &&
    (/((добав[ьи]|дополн[иь]|включ[иь]|встав[ьи])\s+.*(в\s+(?:этот\s+|текущий\s+|кастомн[а-яё]*\s+)*дашборд|на\s+(?:этот\s+|текущий\s+)*дашборд|в\s+панел|на\s+панел|к\s+дашборд|сюда)|(в\s+дашборд|на\s+дашборд|в\s+этот\s+дашборд|в\s+текущий\s+дашборд)\s+.*(добав[ьи]|дополн[иь]|включ[иь]|постав[ьи])|(add|append|insert|include)\s+.*(to|into|on)\s+(?:the\s+|this\s+|current\s+|custom\s+)*dashboard|(?:dashboardga|panelga)\s+.*qo'sh)/i.test(lower));

  const isReplaceDashboard =
    !isRenameDashboard &&
    !isDeleteDashboard &&
    !isRemoveDashboardWidget &&
    !isAppendDashboard &&
    (/((обнов[иь]|измен[иь]|переделай|пересобери|замен[иь]|модифицируй)\s+(?:этот\s+|текущий\s+|кастомн[а-яё]*\s+|мой\s+)*(дашборд|панел)|оставь\s+(?:на\s+дашборде|в\s+дашборде)\s+только|(update|modify|rebuild|replace)\s+(?:this\s+|the\s+|current\s+|custom\s+)*dashboard|(?:dashboardni|panelni)\s+(?:yangila|o'zgartir))/i.test(lower));

  const isUpdateDashboard = isAppendDashboard || isReplaceDashboard;
  const dashboardUpdateMode: 'append' | 'replace' = isAppendDashboard ? 'append' : 'replace';

  const isSelectMainDashboard =
    !isCreateOrModifyKeyword(lower) &&
    /((главн[а-яё]*|основн[а-яё]*|базов[а-яё]*|общ[а-яё]*|стандартн[а-яё]*)\s+(дашборд|обзор|панел|экран)|верн[а-яё]*\s+(?:на\s+)?(главн[а-яё]*|основн[а-яё]*|обзор)|(main|default|overview|primary)\s+dashboard|asosiy\s+(dashboard|panel|sharh))/i.test(lower);

  const isCreateDashboard =
    !isUpdateDashboard &&
    !isRenameDashboard &&
    !isDeleteDashboard &&
    !isRemoveDashboardWidget &&
    !isSelectMainDashboard &&
    (/(созда|собери|построй|сделай|сгенерируй|сформируй|новый|хочу|нужен|create|build|make|generate|new|yarat|tuz|yasab)/i.test(lower) &&
      hasDashboardWord);

  const isSelectCustomDashboard =
    !isCreateDashboard &&
    !isUpdateDashboard &&
    !isRenameDashboard &&
    !isDeleteDashboard &&
    !isRemoveDashboardWidget &&
    !isSelectMainDashboard &&
    (/((переключ[а-яё]*|включ[а-яё]*|выбер[а-яё]*|открой|покажи)\s+(?:на\s+)?(?:(?:кастомн[а-яё]*|пользовательск[а-яё]*)\s+(?:дашборд|панел[ьи])|(?:мой\s+|первый\s+|последний\s+)?(?:дашборд|панел[ьи])\s+[«"'\wа-яё])|(switch\s+to|select|open)\s+(?:my\s+|the\s+|first\s+|latest\s+)?(?:custom\s+dashboard|dashboard\s+["'\w])|(?:maxsus\s+(?:dashboard|panel)|(?:dashboard|panel)ni\s+(?:och|tanla|ko'rsat)))/i.test(lower));

  const isListDashboards =
    !isCreateDashboard &&
    !isUpdateDashboard &&
    !isRenameDashboard &&
    !isDeleteDashboard &&
    !isRemoveDashboardWidget &&
    !isSelectMainDashboard &&
    !isSelectCustomDashboard &&
    /(какие\s+(?:у\s+меня\s+)?(?:есть\s+)?(?:кастомн[а-яё]*\s+)?(?:дашборд|панел|виджет)|список\s+(?:моих\s+)?(?:дашборд|панел)|сколько\s+(?:у\s+меня\s+)?(?:дашборд|виджет)|list\s+(?:my\s+)?(?:custom\s+)?dashboards|what\s+dashboards|how\s+many\s+(?:dashboards|pinned)|qaysi\s+(?:dashboard|panel)|nechta\s+(?:dashboard|vidjet))/i.test(lower);

  const isUnpinWidget = /(откреп[а-яё]*|удали\s+закреп[а-яё]*|очисти\s+закреп[а-яё]*|убери\s+закреп[а-яё]*|unpin|clear\s+pinned|biriktirilgan.*o'chir)/i.test(lower);
  const isPinWidget = !isUnpinWidget && /(закреп[а-яё]*|прикреп[а-яё]*|\bpin\b|biriktir)/i.test(lower);

  const isScreenQuestion = /(на\s+(этом\s+|текущем\s+)?экран|на\s+(этом\s+)?график|на\s+(этой\s+)?страниц|что\s+(тут|здесь|на\s+экране)|объясни\s+(экран|график)|what(?:'s|\s+is)\s+on\s+(?:this\s+)?(?:screen|chart|page)|explain\s+(?:this\s+)?(?:screen|chart)|ekranda|grafikda|sahifada)/i.test(lower);

  const requestedCategories: SharedExpenseCategory[] = [];
  for (const cp of CATEGORY_INTENT_PATTERNS) {
    if (cp.re.test(lower)) requestedCategories.push(cp.category);
  }

  let requestedNavTab: AgentNavTab | null = null;
  const anyDashboardMutation =
    isCreateDashboard ||
    isUpdateDashboard ||
    isRenameDashboard ||
    isDeleteDashboard ||
    isRemoveDashboardWidget ||
    isSelectMainDashboard ||
    isSelectCustomDashboard;

  if (!anyDashboardMutation && /(открой|покажи|перейд|переключ|och|ko'rsat|open|show|switch|go to)/i.test(lower)) {
    if (/(карт|map|xarita|район|tuman)/i.test(lower)) requestedNavTab = 'map';
    else if (/(филиал|branch|filial|(?:#|кейс\s*#?|case\s*#?)\s*24\b)/i.test(lower)) requestedNavTab = 'branches';
    else if (/(бюджет|budget|byudjet|лимит|(?:#|кейс\s*#?|case\s*#?)\s*25\b)/i.test(lower)) requestedNavTab = 'budgets';
    else if (/(аудит|audit|ошиб|xato|(?:#|кейс\s*#?|case\s*#?)\s*26\b)/i.test(lower)) requestedNavTab = 'audit';
    else if (/(расход|expense|xarajat)/i.test(lower)) requestedNavTab = 'expenses';
    else if (/(продаж|меню|sales|savdo)/i.test(lower)) requestedNavTab = 'sales';
    else if (/(обзор|дашборд|dashboard|sharh)/i.test(lower)) requestedNavTab = 'dashboard';
  }

  let requestedDistrict: TashkentDistrictId | null = null;
  for (const dp of DISTRICT_INTENT_PATTERNS) {
    if (dp.re.test(lower)) {
      requestedDistrict = dp.id;
      break;
    }
  }

  let requestedRestaurantId: string | null = null;
  for (const bp of BRANCH_INTENT_PATTERNS) {
    if (bp.re.test(lower)) {
      requestedRestaurantId = bp.id;
      break;
    }
  }

  let requestedAmountUZS: number | null = null;
  const mlnMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:млн|mln|m\b|million)/i);
  if (mlnMatch?.[1]) {
    requestedAmountUZS = Math.round(Number(mlnMatch[1].replace(',', '.')) * 1_000_000);
  } else {
    const rawNum = lower.match(/\b(\d{7,11})\b/);
    if (rawNum?.[1]) requestedAmountUZS = Number(rawNum[1]);
  }

  let requestedDays: number | null = null;
  if (/(?:за\s+|на\s+|период\s+|for\s+|last\s+)?\b(7|семь)\s*(?:дн|сут|day|kun)/i.test(lower) || /(?:за\s+|на\s+)(?:недел|week|hafta)/i.test(lower)) {
    requestedDays = 7;
  } else if (/(?:за\s+|на\s+|период\s+|for\s+|last\s+)?\b(30|тридцать)\s*(?:дн|сут|day|kun)/i.test(lower)) {
    requestedDays = 30;
  } else if (/(?:за\s+|на\s+|период\s+|for\s+|last\s+)?\b(60|шестьдесят)\s*(?:дн|сут|day|kun)/i.test(lower) || /за\s+2\s*месяц/i.test(lower)) {
    requestedDays = 60;
  } else if (/(?:за\s+|на\s+|период\s+|for\s+|last\s+)?\b(90|девяносто)\s*(?:дн|сут|day|kun)/i.test(lower) || /(?:за\s+3\s*месяц|за\s+квартал|last\s+quarter)/i.test(lower)) {
    requestedDays = 90;
  }

  if (!requestedDays && parsedPeriod && [7, 30, 60, 90].includes(parsedPeriod.days)) {
    requestedDays = parsedPeriod.days;
  }

  let requestedHighlightWidget: string | null = null;
  if (/(подсвет|выдел|фокус|покажи\s+виджет|highlight|focus|ajratib)/i.test(lower)) {
    if (/(здоров|health|salomatlik)/i.test(lower)) requestedHighlightWidget = 'widget-health';
    else if (/(\bkpi\b|карточк|выручк[а-яё]*\s+и\s+прибыл)/i.test(lower)) requestedHighlightWidget = 'widget-kpis';
    else if (/(график\s+выручк|динамик|rev.*exp|line\s+chart)/i.test(lower)) requestedHighlightWidget = 'widget-rev-exp';
    else if (/(структур[а-яё]*\s+расход|пончик|donut|оплат)/i.test(lower)) requestedHighlightWidget = 'widget-categories';
    else if (/(находк|срочн|ошиб|finding)/i.test(lower)) requestedHighlightWidget = 'widget-findings';
    else if (/(закреп|pinned)/i.test(lower)) requestedHighlightWidget = 'widget-pinned';
  }

  return {
    isMap,
    isBranchAlloc,
    isBudget,
    isAudit,
    isWhatIf,
    isSales,
    isExpenseQuery,
    isPriorityQuery,
    isCreateDashboard,
    isUpdateDashboard,
    dashboardUpdateMode,
    isRenameDashboard,
    isDeleteDashboard,
    deleteAllDashboards,
    isSelectMainDashboard,
    isSelectCustomDashboard,
    isRemoveDashboardWidget,
    isListDashboards,
    removeWidgetKind,
    isPinWidget,
    isUnpinWidget,
    isScreenQuestion,
    requestedCategories,
    requestedNavTab,
    requestedDistrict,
    requestedRestaurantId,
    requestedAmountUZS,
    requestedDays,
    parsedPeriod,
    requestedHighlightWidget,
    requestedDashboardTitle,
  };
}

export type QuestionIntents = ReturnType<typeof detectQuestionIntents>;

export function resolveConversationalIntents(
  question: string,
  history?: AgentChatMessage[],
  now: Date = new Date(),
): QuestionIntents {
  const current = detectQuestionIntents(question, now);
  if (!history || history.length === 0) return current;

  const userHistory = history.filter(m => m.role === 'user' && m.content.trim().length > 0);
  if (userHistory.length === 0) return current;

  const prevUser = userHistory[userHistory.length - 1]!;
  const prev = detectQuestionIntents(prevUser.content, now);

  const lower = question.toLowerCase();
  const hasAnaphora = /(^а\s+|там\b|туда\b|этого|этот|этой|этих|тем\b|те\b|это\b|подробн|детал|ещ[её]|из\s+этого|продолж|what\s+about|about\s+that|from\s+this|those|there|more\s+detail|pin\s+this|pin\s+it|batafsil|shundan|u\s+yerda|undan|buni)/i.test(lower);
  const currentHasTopic =
    current.isMap ||
    current.isBranchAlloc ||
    current.isBudget ||
    current.isAudit ||
    current.isWhatIf ||
    current.isSales ||
    current.isExpenseQuery ||
    current.isPriorityQuery ||
    current.requestedCategories.length > 0;

  const shouldInheritTopic =
    !currentHasTopic &&
    (hasAnaphora || current.isCreateDashboard || current.isUpdateDashboard || current.isPinWidget);

  const shouldInheritFilters =
    hasAnaphora || shouldInheritTopic || (!current.parsedPeriod && !current.requestedDays && current.isAudit);

  const mergedCategories =
    current.requestedCategories.length > 0
      ? current.requestedCategories
      : shouldInheritTopic
        ? prev.requestedCategories
        : [];

  return {
    ...current,
    isMap: current.isMap || (shouldInheritTopic && prev.isMap),
    isBranchAlloc: current.isBranchAlloc || (shouldInheritTopic && prev.isBranchAlloc),
    isBudget: current.isBudget || (shouldInheritTopic && prev.isBudget),
    isAudit: current.isAudit || (shouldInheritTopic && prev.isAudit),
    isSales: current.isSales || (shouldInheritTopic && prev.isSales),
    isExpenseQuery: current.isExpenseQuery || (shouldInheritTopic && prev.isExpenseQuery),
    isPriorityQuery: current.isPriorityQuery || (shouldInheritTopic && prev.isPriorityQuery),
    requestedCategories: mergedCategories,
    parsedPeriod: current.parsedPeriod ?? (shouldInheritFilters ? prev.parsedPeriod : null),
    requestedDays: current.requestedDays ?? (shouldInheritFilters ? prev.requestedDays : null),
    requestedDistrict: current.requestedDistrict ?? (shouldInheritFilters ? prev.requestedDistrict : null),
    requestedRestaurantId: current.requestedRestaurantId ?? (shouldInheritFilters ? prev.requestedRestaurantId : null),
  };
}

function isCreateOrModifyKeyword(lower: string): boolean {
  return /(созда|собери|построй|сделай|добав|обнов|переимен|удал|create|build|make|add|update|rename|delete)/i.test(lower);
}

export function collectNumericValues(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push(Math.abs(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumericValues(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectNumericValues(v, out);
    }
  }
  return out;
}

export function extractNumbersFromText(text: string): number[] {
  const out: number[] = [];
  if (!text) return out;
  const cleaned = text.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ').replace(/#\d+\b/g, ' ');
  const tokenRe = /\b(\d{1,3}(?:[ \u00A0,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(млн|mln|m\b|million|тыс|ming)?/gi;
  for (const match of cleaned.matchAll(tokenRe)) {
    const numRaw = match[1];
    if (!numRaw) continue;
    const unit = (match[2] ?? '').toLowerCase();
    let normalized = numRaw.replace(/[ \u00A0]/g, '');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
      normalized = normalized.replace(/,/g, '');
    } else {
      normalized = normalized.replace(',', '.');
    }
    let val = Number(normalized);
    if (!Number.isFinite(val)) continue;
    if (unit === 'млн' || unit === 'mln' || unit === 'm' || unit === 'million') {
      val *= 1_000_000;
    } else if (unit === 'тыс' || unit === 'ming') {
      val *= 1_000;
    }
    out.push(Math.abs(val));
  }
  return out;
}

export function verifyLlmNumbersAgainstGroundTruth(
  text: string,
  allowedNumbers: number[],
): { verified: boolean; matchedCount: number; ungroundedNumbers: number[] } {
  const candidates = new Set<number>();
  for (const raw of allowedNumbers) {
    const abs = Math.abs(raw);
    candidates.add(abs);
    if (abs >= 1000) {
      candidates.add(abs / 1_000);
      candidates.add(abs / 1_000_000);
    }
  }
  const candidateArr = [...candidates].filter(n => n > 0);

  // Strip ISO dates (YYYY-MM-DD) and case tags (#24, #25, #26) before scanning numbers
  const cleaned = text.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ').replace(/#\d+\b/g, ' ');
  const tokenRe = /\b(\d{1,3}(?:[ \u00A0,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(млн|mln|m\b|million|тыс|ming)?/gi;

  let matchedCount = 0;
  const ungroundedNumbers: number[] = [];

  for (const match of cleaned.matchAll(tokenRe)) {
    const numRaw = match[1];
    if (!numRaw) continue;
    const unit = (match[2] ?? '').toLowerCase();
    let normalized = numRaw.replace(/[ \u00A0]/g, '');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
      normalized = normalized.replace(/,/g, '');
    } else {
      normalized = normalized.replace(',', '.');
    }
    let val = Number(normalized);
    if (!Number.isFinite(val)) continue;
    if (unit === 'млн' || unit === 'mln' || unit === 'm' || unit === 'million') {
      val *= 1_000_000;
    } else if (unit === 'тыс' || unit === 'ming') {
      val *= 1_000;
    }

    // Only audit substantial financial magnitudes (>= 1000 UZS), ignoring years 2020-2035
    if (val < 1000 || (val >= 2020 && val <= 2035 && Number.isInteger(val))) {
      continue;
    }

    const isGrounded = candidateArr.some(c => {
      const tol = Math.max(2000, c * 0.025);
      return Math.abs(val - c) <= tol;
    });
    if (isGrounded) {
      matchedCount++;
    } else {
      ungroundedNumbers.push(Math.round(val));
    }
  }

  return {
    verified: ungroundedNumbers.length === 0,
    matchedCount,
    ungroundedNumbers,
  };
}

function buildFindingAction(f: BusinessAnalysisResponse['findings'][number], lang: Language): AgentClientAction | null {
  if (f.code === 'DUPLICATE_INVOICE') {
    const dupId =
      typeof f.metrics?.duplicateExpenseId === 'string'
        ? f.metrics.duplicateExpenseId
        : f.expenseIds?.[f.expenseIds.length - 1];
    if (!dupId) return null;
    return {
      type: 'fix_finding',
      findingId: f.id,
      code: f.code,
      duplicateExpenseId: dupId,
      label: lang === 'uz' ? `Dublikatni o'chirish (${fmtUzs(f.amountImpact)})` : lang === 'ru' ? `Удалить дубликат (${fmtUzs(f.amountImpact)})` : `Delete Duplicate (${fmtUzs(f.amountImpact)})`,
    };
  }
  if (f.code === 'AMOUNT_MISMATCH') {
    const expId = f.expenseIds?.[0];
    const expected = Number(f.metrics?.expectedAmount);
    if (!expId || !Number.isFinite(expected) || expected <= 0) return null;
    return {
      type: 'fix_finding',
      findingId: f.id,
      code: f.code,
      expenseId: expId,
      expectedAmount: expected,
      label: lang === 'uz' ? `Summani tuzatish → ${fmtUzs(expected)}` : lang === 'ru' ? `Исправить сумму → ${fmtUzs(expected)}` : `Fix Amount → ${fmtUzs(expected)}`,
    };
  }
  if (f.code === 'CATEGORY_MISMATCH') {
    const expId = f.expenseIds?.[0];
    const suggested = f.metrics?.suggestedCategory as SharedExpenseCategory | undefined;
    if (!expId || !suggested) return null;
    return {
      type: 'fix_finding',
      findingId: f.id,
      code: f.code,
      expenseId: expId,
      suggestedCategory: suggested,
      label: lang === 'uz' ? `Toifani tuzatish → ${categoryLabel(suggested, 'uz')}` : lang === 'ru' ? `Исправить категорию → ${categoryLabel(suggested, 'ru')}` : `Fix Category → ${categoryLabel(suggested, 'en')}`,
    };
  }
  return null;
}

export function buildCustomDashboardSpec(params: {
  lang: Language;
  restaurantName: string;
  requestedCategories: SharedExpenseCategory[];
  analysis: BusinessAnalysisResponse;
  varianceData: BudgetVarianceItem[] | null;
  geoData?: DistrictGeoAnalysisResponse | null;
  branchData?: BranchAllocationResponse | null;
  scenarioData?: MacroScenarioResult | null;
  customTitle?: string | null;
  isSales?: boolean;
  isAudit?: boolean;
  isBudget?: boolean;
}): { title: string; label: string; blocks: AgentUiBlock[] } {
  const {
    lang,
    restaurantName,
    requestedCategories,
    analysis,
    varianceData,
    geoData,
    branchData,
    scenarioData,
    customTitle,
    isSales,
    isAudit,
    isBudget,
  } = params;
  const blocks: AgentUiBlock[] = [];
  const catSet = new Set(requestedCategories);

  const catLabels = requestedCategories.map(c => categoryLabel(c, lang));
  const defaultTitle =
    catLabels.length > 0
      ? lang === 'uz'
        ? `Panel: ${catLabels.join(', ')}`
        : lang === 'ru'
          ? `Дашборд: ${catLabels.join(', ')}`
          : `Dashboard: ${catLabels.join(', ')}`
      : isSales
        ? lang === 'uz'
          ? 'Savdo va menyu samaradorligi paneli'
          : lang === 'ru'
            ? 'Дашборд продаж и меню (ABC)'
            : 'Sales & Menu Engineering Dashboard'
        : branchData
          ? lang === 'uz'
            ? 'Filiallar samaradorligi paneli'
            : lang === 'ru'
              ? 'Дашборд эффективности филиалов'
              : 'Branch Performance Dashboard'
          : geoData
            ? lang === 'uz'
              ? 'Toshkent hududlar paneli'
              : lang === 'ru'
                ? 'Дашборд геоаналитики Ташкента'
                : 'Tashkent Geo Demand Dashboard'
            : isBudget && varianceData
              ? lang === 'uz'
                ? 'Byudjet ijrosi va prognoz paneli'
                : lang === 'ru'
                  ? 'Дашборд контроля бюджетов (#25)'
                  : 'Budget Execution & Forecast Dashboard'
              : isAudit
                ? lang === 'uz'
                  ? 'Moliyaviy audit va tejamkorlik paneli'
                  : lang === 'ru'
                    ? 'Дашборд финансового аудита (#26)'
                    : 'Financial Audit & Savings Dashboard'
                : lang === 'uz'
                  ? `${restaurantName} — Moliyaviy panel`
                  : lang === 'ru'
                    ? `${restaurantName} — Финансовый дашборд`
                    : `${restaurantName} — Financial Dashboard`;

  const title = customTitle?.trim() || defaultTitle;

  if (catSet.size > 0) {
    const matchedBreakdown = analysis.overview.categoryBreakdown.filter(c => catSet.has(c.category));
    const matchedVariance = (varianceData ?? []).filter(v => catSet.has(v.category));
    const matchedFindings = analysis.findings.filter(f => f.category && catSet.has(f.category));

    const totalSpend = matchedBreakdown.reduce((s, c) => s + c.amount, 0);
    const totalShare = Number(matchedBreakdown.reduce((s, c) => s + c.sharePct, 0).toFixed(1));
    const totalLimit = matchedVariance.reduce((s, v) => s + v.limit, 0);
    const totalForecast = matchedVariance.reduce((s, v) => s + v.forecast, 0);
    const totalSaving = matchedFindings.reduce((s, f) => s + f.amountImpact, 0);

    blocks.push({
      id: 'custom-dash-kpis',
      kind: 'kpis',
      title,
      items: [
        {
          label: lang === 'uz' ? 'Tanlangan xarajatlar' : lang === 'ru' ? 'Расходы по выборке' : 'Selected Spend',
          value: fmtUzs(totalSpend),
          sublabel: `${totalShare}% ${lang === 'uz' ? 'ulush' : lang === 'ru' ? 'от всех расходов' : 'of expenses'}`,
          tone: 'neutral',
        },
        {
          label: lang === 'uz' ? 'Byudjet limiti' : lang === 'ru' ? 'Лимит бюджета' : 'Budget Limit',
          value: totalLimit > 0 ? fmtUzs(totalLimit) : '—',
          sublabel: totalForecast > 0 ? `${lang === 'uz' ? 'Prognoz' : lang === 'ru' ? 'Прогноз' : 'Forecast'}: ${fmtUzs(totalForecast)}` : undefined,
          tone: totalLimit > 0 && totalForecast > totalLimit ? 'bad' : 'good',
        },
        {
          label: lang === 'uz' ? 'Tejamkorlik salohiyati' : lang === 'ru' ? 'Потенциал экономии' : 'Savings Potential',
          value: fmtUzs(totalSaving),
          sublabel: `${matchedFindings.length} ${lang === 'uz' ? 'muammo' : lang === 'ru' ? 'находок' : 'findings'}`,
          tone: totalSaving > 0 ? 'warn' : 'good',
        },
      ],
    });

    const chartItems =
      matchedVariance.length > 0
        ? matchedVariance.map(v => ({
            label: categoryLabel(v.category, lang),
            value: v.forecast,
            secondaryValue: v.limit,
            secondaryLabel: lang === 'uz' ? 'Limit' : lang === 'ru' ? 'Лимит' : 'Limit',
          }))
        : matchedBreakdown.map(c => ({
            label: categoryLabel(c.category, lang),
            value: c.amount,
            secondaryValue: c.prevAmount,
            secondaryLabel: lang === 'uz' ? 'Oldingi davr' : lang === 'ru' ? 'Прошлый период' : 'Prev Period',
          }));

    if (chartItems.length > 0) {
      blocks.push({
        id: 'custom-dash-chart',
        kind: 'chart',
        chartType: 'bar',
        title: lang === 'uz' ? 'Fakt / Prognoz vs Limit' : lang === 'ru' ? 'Прогноз / Факт vs Лимит (UZS)' : 'Forecast / Actual vs Limit (UZS)',
        items: chartItems,
      });
    }

    const tableRows =
      matchedVariance.length > 0
        ? matchedVariance.map(v => [
            categoryLabel(v.category, lang),
            fmtUzs(v.actual),
            fmtUzs(v.limit),
            fmtUzs(v.forecast),
            v.riskLevel,
          ])
        : matchedBreakdown.map(c => [
            categoryLabel(c.category, lang),
            fmtUzs(c.amount),
            `${c.sharePct}%`,
            fmtUzs(c.prevAmount),
            `${c.growthPct > 0 ? '+' : ''}${c.growthPct}%`,
          ]);

    if (tableRows.length > 0) {
      blocks.push({
        id: 'custom-dash-table',
        kind: 'table',
        title: lang === 'uz' ? 'Tafsilotlar' : lang === 'ru' ? 'Детализация по категориям' : 'Category Breakdown & Variance',
        columns:
          matchedVariance.length > 0
            ? lang === 'uz'
              ? ['Toifa', 'Fakt', 'Limit', 'Prognoz', 'Xavf']
              : lang === 'ru'
                ? ['Статья', 'Факт', 'Лимит', 'Прогноз', 'Риск']
                : ['Category', 'Actual', 'Limit', 'Forecast', 'Risk']
            : lang === 'uz'
              ? ['Toifa', 'Summa', 'Ulush', 'Oldingi davr', 'O‘sish']
              : lang === 'ru'
                ? ['Статья', 'Сумма', 'Доля', 'Прошлый период', 'Динамика']
                : ['Category', 'Spend', 'Share', 'Previous', 'Growth'],
        rows: tableRows,
      });
    }

    const risky = matchedVariance.filter(v => v.riskLevel === 'CRITICAL' || v.riskLevel === 'HIGH');
    if ((risky.length > 0 || matchedFindings.length > 0) && blocks.length < 4) {
      blocks.push({
        id: 'custom-dash-alert',
        kind: 'alert',
        severity: risky.some(r => r.riskLevel === 'CRITICAL') ? 'critical' : 'warning',
        title: lang === 'uz' ? 'Nazorat signallari' : lang === 'ru' ? 'Аномалии и риски по выборке' : 'Risk & Audit Signals',
        body:
          risky.length > 0
            ? risky.map(r => r.drivers.explanation[lang]).join(' ')
            : matchedFindings
                .slice(0, 2)
                .map(f => f.recommendation[lang])
                .join(' '),
      });
    }
  }

  if (isSales && analysis.dishes && analysis.dishes.length > 0) {
    const topDish = analysis.dishes[0];
    blocks.push({
      id: 'custom-dash-sales-kpis',
      kind: 'kpis',
      title,
      items: [
        { label: lang === 'uz' ? 'Tushum' : lang === 'ru' ? 'Выручка' : 'Revenue', value: fmtUzs(analysis.overview.revenue), tone: 'good' },
        { label: lang === 'uz' ? 'Buyurtmalar' : lang === 'ru' ? 'Заказы' : 'Orders', value: String(analysis.overview.deliveredOrders), sublabel: `${lang === 'uz' ? 'O‘rtacha chek' : lang === 'ru' ? 'Ср. чек' : 'Avg Check'}: ${fmtUzs(analysis.overview.avgOrderValue)}`, tone: 'neutral' },
        { label: lang === 'uz' ? 'Food Cost' : lang === 'ru' ? 'Фудкост' : 'Food Cost', value: `${analysis.overview.foodCostPct.toFixed(1)}%`, tone: analysis.overview.foodCostPct > 35 ? 'bad' : 'good' },
        { label: lang === 'uz' ? 'Top taom' : lang === 'ru' ? 'Топ-блюдо' : 'Top Dish', value: topDish ? topDish.name : '—', sublabel: topDish ? fmtUzs(topDish.revenue) : undefined, tone: 'good' },
      ],
    });
    blocks.push({
      id: 'custom-dash-sales-chart',
      kind: 'chart',
      chartType: 'horizontal_bar',
      title: lang === 'uz' ? 'Top taomlar tushumi va foydasi' : lang === 'ru' ? 'Топ блюд по выручке и марже (UZS)' : 'Top Dishes Revenue vs Profit (UZS)',
      items: analysis.dishes.slice(0, 6).map(d => ({
        label: d.name,
        value: d.revenue,
        secondaryValue: d.totalProfit,
        secondaryLabel: lang === 'uz' ? 'Foyda' : lang === 'ru' ? 'Маржа' : 'Profit',
      })),
    });
    blocks.push({
      id: 'custom-dash-sales-table',
      kind: 'table',
      title: lang === 'uz' ? 'Menyu ABC tahlili' : lang === 'ru' ? 'Матрица меню (ABC / Kasavana-Smith)' : 'Menu Engineering Matrix',
      columns:
        lang === 'uz'
          ? ['Taom', 'Soni', 'Tushum', 'Marja %', 'Kvadrant']
          : lang === 'ru'
            ? ['Блюдо', 'Продано', 'Выручка', 'Маржа %', 'Квадрант']
            : ['Dish', 'Sold', 'Revenue', 'Margin %', 'Quadrant'],
      rows: analysis.dishes.slice(0, 6).map(d => [
        d.name,
        d.quantitySold,
        fmtUzs(d.revenue),
        `${d.marginPct}%`,
        `${d.abcClass} · ${d.quadrant}`,
      ]),
    });
  }

  if (branchData && branchData.branches.length > 0) {
    blocks.push({
      id: 'custom-dash-branch-alloc',
      kind: 'allocation',
      title,
      allocation: branchData,
    });
    blocks.push({
      id: 'custom-dash-branch-chart',
      kind: 'chart',
      chartType: 'bar',
      title: lang === 'uz' ? 'Filiallar byudjeti' : lang === 'ru' ? 'Текущий vs AI-бюджет по филиалам' : 'Current vs AI Budget by Branch',
      items: branchData.branches.map(b => ({
        label: b.name,
        value: b.recommendedBudget,
        secondaryValue: b.currentBudget,
        secondaryLabel: lang === 'uz' ? 'Joriy' : lang === 'ru' ? 'Текущий' : 'Current',
      })),
    });
  }

  if (geoData) {
    blocks.push({
      id: 'custom-dash-geo-map',
      kind: 'map',
      title,
      metric: 'orders',
      districts: geoData.districts,
      branches: geoData.branches,
      heatmapCells: geoData.heatmapCells,
    });
    blocks.push({
      id: 'custom-dash-geo-table',
      kind: 'table',
      title: lang === 'uz' ? 'Tumanlar' : lang === 'ru' ? 'Районы Ташкента' : 'Tashkent Districts',
      columns: ['District', 'Orders', 'Revenue', 'Margin'],
      rows: geoData.districts
        .filter(d => d.orders > 0)
        .slice(0, 6)
        .map(d => [d.name[lang], d.orders, fmtUzs(d.revenue), fmtUzs(d.deliveryMargin)]),
    });
  }

  if (catSet.size === 0 && isBudget && varianceData && varianceData.length > 0) {
    const critical = varianceData.filter(v => v.riskLevel === 'CRITICAL' || v.riskLevel === 'HIGH');
    blocks.push({
      id: 'custom-dash-budget-chart',
      kind: 'chart',
      chartType: 'bar',
      title: lang === 'uz' ? 'Reja (Limit) vs Oy oxiri prognozi' : lang === 'ru' ? 'План (Лимит) vs Прогноз до конца месяца' : 'Budget Plan vs Month-End Forecast',
      items: varianceData.slice(0, 6).map(v => ({
        label: categoryLabel(v.category, lang),
        value: v.forecast,
        secondaryValue: v.limit,
        secondaryLabel: lang === 'uz' ? 'Limit' : lang === 'ru' ? 'Лимит' : 'Limit',
      })),
    });
    blocks.push({
      id: 'custom-dash-budget-table',
      kind: 'table',
      title: lang === 'uz' ? 'Byudjet nazorati (#25)' : lang === 'ru' ? 'Исполнение бюджета и прогноз (#25)' : 'Budget Execution & Breach Dates (#25)',
      columns:
        lang === 'uz'
          ? ['Toifa', 'Limit', 'Fakt', 'Prognoz', 'Xavf']
          : lang === 'ru'
            ? ['Статья', 'Лимит', 'Факт', 'Прогноз', 'Риск']
            : ['Category', 'Limit', 'Actual', 'Forecast', 'Risk'],
      rows: varianceData.slice(0, 6).map(v => [
        categoryLabel(v.category, lang),
        fmtUzs(v.limit),
        fmtUzs(v.actual),
        fmtUzs(v.forecast),
        v.riskLevel,
      ]),
    });
    if (critical.length > 0) {
      blocks.push({
        id: 'custom-dash-budget-alert',
        kind: 'alert',
        severity: critical.some(c => c.riskLevel === 'CRITICAL') ? 'critical' : 'warning',
        title: lang === 'uz' ? 'Byudjet xavfi' : lang === 'ru' ? 'Статьи с риском превышения лимита' : 'Categories at Risk of Overrun',
        body: critical.map(c => c.drivers.explanation[lang]).join(' '),
      });
    }
  }

  if (scenarioData) {
    blocks.push({
      id: 'custom-dash-whatif-kpis',
      kind: 'kpis',
      title: lang === 'uz' ? 'Ssenariy tahlili' : lang === 'ru' ? 'Стресс-тест сценария' : 'Scenario Stress-Test',
      items: [
        { label: lang === 'uz' ? 'Bazaviy foyda' : lang === 'ru' ? 'Базовая прибыль' : 'Baseline Profit', value: fmtUzs(scenarioData.baseline.netProfit), tone: 'neutral' },
        { label: lang === 'uz' ? 'Prognoz foyda' : lang === 'ru' ? 'Прогноз прибыли' : 'Projected Profit', value: fmtUzs(scenarioData.projected.netProfit), tone: scenarioData.projected.netProfit >= 0 ? 'warn' : 'bad' },
        { label: lang === 'uz' ? 'Farq' : lang === 'ru' ? 'Изменение прибыли' : 'Profit Delta', value: fmtUzs(scenarioData.projected.profitDelta), tone: scenarioData.projected.profitDelta < 0 ? 'bad' : 'good' },
        { label: lang === 'uz' ? 'Yangi marja' : lang === 'ru' ? 'Новая маржа' : 'New Margin', value: `${scenarioData.projected.netMarginPct}%`, tone: 'warn' },
      ],
    });
  }

  if (blocks.length === 0) {
    blocks.push({
      id: 'custom-dash-overview-kpis',
      kind: 'kpis',
      title,
      items: [
        { label: lang === 'uz' ? 'Tushum' : lang === 'ru' ? 'Выручка' : 'Revenue', value: fmtUzs(analysis.overview.revenue), tone: 'neutral' },
        { label: lang === 'uz' ? 'Xarajat' : lang === 'ru' ? 'Расходы' : 'Expenses', value: fmtUzs(analysis.overview.totalExpenses), tone: 'neutral' },
        { label: lang === 'uz' ? 'Sof foyda' : lang === 'ru' ? 'Чистая прибыль' : 'Net Profit', value: fmtUzs(analysis.overview.netProfit), tone: analysis.overview.netProfit >= 0 ? 'good' : 'bad' },
        { label: lang === 'uz' ? 'Tejamkorlik' : lang === 'ru' ? 'Потенциал экономии' : 'Savings Potential', value: fmtUzs(analysis.report.totalPotentialSavingUZS), tone: 'warn' },
      ],
    });
    if (analysis.overview.categoryBreakdown.length > 0) {
      blocks.push({
        id: 'custom-dash-overview-chart',
        kind: 'chart',
        chartType: 'donut',
        title: lang === 'uz' ? 'Xarajatlar tarkibi' : lang === 'ru' ? 'Структура расходов' : 'Expense Breakdown',
        items: analysis.overview.categoryBreakdown.slice(0, 6).map(c => ({
          label: categoryLabel(c.category, lang),
          value: c.amount,
        })),
      });
    }
    if (analysis.findings.length > 0) {
      blocks.push({
        id: 'custom-dash-overview-table',
        kind: 'table',
        title: lang === 'uz' ? 'Asosiy topilmalar' : lang === 'ru' ? 'Ключевые находки аудита' : 'Top Audit Findings',
        columns: ['Code', 'Finding', 'Impact'],
        rows: analysis.findings.slice(0, 5).map(f => [f.code, f.title[lang], fmtUzs(f.amountImpact)]),
      });
    }
  }

  if (blocks.length < 2) {
    blocks.push({
      id: 'custom-dash-fallback-chart',
      kind: 'chart',
      chartType: 'horizontal_bar',
      title: lang === 'uz' ? 'Xarajatlar tarkibi' : lang === 'ru' ? 'Структура расходов' : 'Expense Structure',
      items: analysis.overview.categoryBreakdown.slice(0, 5).map(c => ({
        label: categoryLabel(c.category, lang),
        value: c.amount,
      })),
    });
  }

  const label =
    lang === 'uz'
      ? `Panel yaratish: ${title}`
      : lang === 'ru'
        ? `Создать дашборд: ${title}`
        : `Create Dashboard: ${title}`;

  return { title, label, blocks: blocks.slice(0, 4) };
}

export function buildPriorityExpenseBlocks(params: {
  lang: Language;
  periodLabel: string;
  fromStr: string;
  toStr: string;
  overview: BusinessAnalysisResponse['overview'];
  expenses: AnalysisExpenseInput[];
  requestedCategories?: SharedExpenseCategory[];
}): { blocks: AgentUiBlock[]; summary: PriorityExpenseSummary } {
  const { lang, periodLabel, fromStr, toStr, overview, expenses, requestedCategories } = params;
  const summary = computePriorityExpenseSummary({ overview, expenses });
  const revUnit = lang === 'ru' ? 'выр.' : lang === 'uz' ? 'tushum' : 'rev';
  const expUnit = lang === 'ru' ? 'расх.' : lang === 'uz' ? 'xarajat' : 'exp';

  const elecSub =
    summary.electricityKwh > 0
      ? `${Math.round(summary.electricityKwh).toLocaleString('ru-RU')} ${lang === 'ru' ? 'кВт·ч' : lang === 'uz' ? 'kVt·soat' : 'kWh'} · ${fmtUzs(summary.electricityTotal)}`
      : `${summary.utilitiesPctOfRevenue}% ${revUnit}`;

  const blocks: AgentUiBlock[] = [
    {
      id: 'blk-priority-kpis',
      kind: 'kpis',
      title:
        lang === 'ru'
          ? `Приоритетные расходы · ${periodLabel}`
          : lang === 'uz'
            ? `Ustuvor xarajatlar · ${periodLabel}`
            : `Priority Expenses · ${periodLabel}`,
      items: [
        {
          label:
            lang === 'ru'
              ? 'Налоги (Приоритет)'
              : lang === 'uz'
                ? 'Soliqlar (Ustuvor)'
                : 'Taxes (Priority)',
          value: fmtUzs(summary.taxesTotal),
          sublabel: `${summary.taxesPctOfRevenue}% ${revUnit} · ${summary.taxesShareOfExpensesPct}% ${expUnit}`,
          tone: summary.taxesPctOfRevenue > 14 ? 'warn' : 'neutral',
        },
        {
          label:
            lang === 'ru'
              ? 'Свет и ком. (Приоритет)'
              : lang === 'uz'
                ? 'Elektr va kom. (Ustuvor)'
                : 'Electricity & Util. (Priority)',
          value: fmtUzs(summary.utilitiesTotal),
          sublabel: elecSub,
          tone: summary.utilitiesPctOfRevenue > 8 ? 'warn' : 'neutral',
        },
        {
          label:
            lang === 'ru'
              ? 'Базовые (Сырьё, ФОТ, Аренда)'
              : lang === 'uz'
                ? 'Asosiy (Masalliq, Ish haqi, Ijara)'
                : 'Base (Ingredients, Payroll, Rent)',
          value: fmtUzs(summary.baseTotal),
          sublabel: `${summary.baseSharePct}% ${expUnit}`,
          tone: 'neutral',
        },
        {
          label:
            lang === 'ru'
              ? 'Дополнительные расходы'
              : lang === 'uz'
                ? 'Qo‘shimcha xarajatlar'
                : 'Additional Expenses',
          value: fmtUzs(summary.additionalTotal),
          sublabel: `${summary.additionalSharePct}% ${expUnit}`,
          tone: 'neutral',
        },
      ],
    },
    {
      id: 'blk-priority-chart',
      kind: 'chart',
      chartType: 'horizontal_bar',
      title:
        lang === 'ru'
          ? `Приоритет vs Базовые vs Доп. (${fromStr === toStr ? fromStr : `${fromStr}–${toStr}`})`
          : lang === 'uz'
            ? `Ustuvor vs Asosiy vs Qo‘shimcha (${fromStr === toStr ? fromStr : `${fromStr}–${toStr}`})`
            : `Priority vs Base vs Additional (${fromStr === toStr ? fromStr : `${fromStr}–${toStr}`})`,
      items: [
        {
          label:
            lang === 'ru'
              ? 'Налоги (TAXES)'
              : lang === 'uz'
                ? 'Soliqlar (TAXES)'
                : 'Taxes (TAXES)',
          value: summary.taxesTotal,
          color: '#EC5180',
        },
        {
          label:
            lang === 'ru'
              ? 'Свет и ком. (UTILITIES/COMM)'
              : lang === 'uz'
                ? 'Elektr va kommunal'
                : 'Electricity & Utilities',
          value: summary.utilitiesTotal,
          color: '#8172FF',
        },
        {
          label:
            lang === 'ru'
              ? 'Базовые (Сырьё, ФОТ, Аренда)'
              : lang === 'uz'
                ? 'Asosiy xarajatlar'
                : 'Base Costs',
          value: summary.baseTotal,
          color: '#36B89A',
        },
        {
          label:
            lang === 'ru'
              ? 'Дополнительные'
              : lang === 'uz'
                ? 'Qo‘shimcha xarajatlar'
                : 'Additional Costs',
          value: summary.additionalTotal,
          color: '#F59E0B',
        },
      ],
    },
  ];

  const reqSet = new Set(requestedCategories ?? []);
  const filtered =
    reqSet.size > 0 && expenses.some(e => reqSet.has(e.category))
      ? expenses.filter(e => reqSet.has(e.category))
      : expenses;

  const tierRank = { PRIORITY: 0, BASE: 1, ADDITIONAL: 2 } as const;
  const sortedExpenses = [...filtered].sort((a, b) => {
    const tDiff = tierRank[getExpensePriorityTier(a.category)] - tierRank[getExpensePriorityTier(b.category)];
    if (tDiff !== 0) return tDiff;
    const dDiff = b.spentAt.getTime() - a.spentAt.getTime();
    if (dDiff !== 0) return dDiff;
    return b.amount - a.amount;
  });

  if (sortedExpenses.length > 0) {
    const sliced = sortedExpenses.slice(0, 15);
    const highlightRowIndices = sliced
      .map((e, idx) => (getExpensePriorityTier(e.category) === 'PRIORITY' ? idx : -1))
      .filter(idx => idx >= 0);

    blocks.push({
      id: 'blk-expenses-table',
      kind: 'table',
      title:
        lang === 'ru'
          ? `Расходы за ${periodLabel} (${sortedExpenses.length} поз.)`
          : lang === 'uz'
            ? `${periodLabel} uchun xarajatlar (${sortedExpenses.length} ta)`
            : `Itemized Expenses · ${periodLabel} (${sortedExpenses.length})`,
      columns:
        lang === 'ru'
          ? ['Дата', 'Приоритет / Категория', 'Позиция', 'Поставщик', 'Сумма']
          : lang === 'uz'
            ? ['Sana', 'Ustuvorlik / Toifa', 'Nomi', 'Yetkazib beruvchi', 'Summa']
            : ['Date', 'Priority / Category', 'Item', 'Supplier', 'Amount'],
      rows: sliced.map(e => {
        const tier = getExpensePriorityTier(e.category);
        const itemText =
          e.quantity !== null && e.unit
            ? `${e.itemName} (${e.quantity} ${e.unit})`
            : e.itemName;
        return [
          e.spentAt.toISOString().slice(0, 10),
          `[${expensePriorityLabel(tier, lang)}] ${categoryLabel(e.category, lang)}`,
          itemText,
          e.supplierName ?? '—',
          fmtUzs(e.amount),
        ];
      }),
      highlightRowIndices,
    });
  }

  return { blocks, summary };
}

export async function runFinanceAgentChat(params: {
  question: string;
  lang: Language;
  restaurantId: string;
  restaurantName: string;
  model?: string;
  history?: AgentChatMessage[];
  screenContext?: AgentScreenContext;
  from?: string;
  to?: string;
  month?: string;
  totalBudget?: number;
  districtId?: TashkentDistrictId;
}): Promise<AgentChatResponse> {
  const { question, lang, restaurantName } = params;
  const requestedModel = params.model?.trim() || 'gemini-3-8-flash';
  const now = new Date();
  const intents = resolveConversationalIntents(question, params.history, now);
  const parsedPeriod = intents.parsedPeriod;
  const targetRestaurantId = intents.requestedRestaurantId ?? params.restaurantId;
  const activeDistrictId =
    intents.requestedDistrict ??
    params.districtId ??
    (params.screenContext?.districtId && TASHKENT_DISTRICT_MAP.has(params.screenContext.districtId as TashkentDistrictId)
      ? (params.screenContext.districtId as TashkentDistrictId)
      : undefined);

  const traces: AgentToolTrace[] = [];
  const uiBlocks: AgentUiBlock[] = [];
  const autoActions: AgentClientAction[] = [];
  const suggestedActions: AgentClientAction[] = [];
  const relatedFindingCodes = new Set<string>();

  const daysOverride =
    !parsedPeriod && intents.requestedDays
      ? intents.requestedDays
      : !parsedPeriod && !params.from && !params.to && params.screenContext?.days
        ? Math.min(365, Math.max(1, Math.round(params.screenContext.days)))
        : null;
  const daysFromOverride = daysOverride
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (daysOverride - 1)))
        .toISOString()
        .slice(0, 10)
    : undefined;
  const daysToOverride = daysOverride ? now.toISOString().slice(0, 10) : undefined;

  const effectiveFromParam = parsedPeriod?.from ?? daysFromOverride ?? params.from;
  const effectiveToParam = parsedPeriod?.to ?? daysToOverride ?? params.to;
  const month = parsedPeriod?.month ?? params.month ?? params.screenContext?.month ?? now.toISOString().slice(0, 7);
  const { from, to } = resolveDateRange(effectiveFromParam, effectiveToParam, now);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const periodLabel = parsedPeriod?.label[lang] ?? formatDateRangeLabel(fromStr, toStr, lang);

  const normalizedQ = question.trim().toLowerCase();
  const screenCachePart = `${params.screenContext?.activeTab ?? ''}::${params.screenContext?.activeCustomDashboardId ?? ''}::${(params.screenContext?.customDashboards ?? []).map(d => `${d.id}:${d.title}`).join('|')}::${params.screenContext?.pinnedWidgetsCount ?? 0}::${activeDistrictId ?? ''}::${(params.screenContext?.summaryText ?? '').slice(0, 80)}`;
  const chatCacheKey =
    (params.history?.length ?? 0) === 0
      ? `${targetRestaurantId}::${lang}::${requestedModel}::${fromStr}::${toStr}::${month}::${params.totalBudget ?? ''}::${screenCachePart}::${normalizedQ}`
      : null;
  if (chatCacheKey) {
    const cached = agentChatCache.get(chatCacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const hasDashboardControlIntent =
    intents.isCreateDashboard ||
    intents.isUpdateDashboard ||
    intents.isRenameDashboard ||
    intents.isDeleteDashboard ||
    intents.isSelectMainDashboard ||
    intents.isSelectCustomDashboard ||
    intents.isRemoveDashboardWidget ||
    intents.isListDashboards ||
    intents.isPinWidget ||
    intents.isUnpinWidget;

  const effectiveIsSales =
    intents.isSales || (intents.isScreenQuestion && params.screenContext?.activeTab === 'sales');
  const effectiveIsAudit =
    intents.isAudit || (intents.isScreenQuestion && params.screenContext?.activeTab === 'audit');

  const hasSpecificIntent =
    intents.isMap ||
    intents.isBranchAlloc ||
    intents.isBudget ||
    effectiveIsAudit ||
    intents.isWhatIf ||
    effectiveIsSales ||
    intents.isExpenseQuery ||
    intents.isPriorityQuery ||
    Boolean(parsedPeriod) ||
    hasDashboardControlIntent;

  const needExpenses =
    intents.isExpenseQuery ||
    intents.isPriorityQuery ||
    effectiveIsAudit ||
    intents.requestedCategories.length > 0 ||
    (intents.isScreenQuestion && params.screenContext?.activeTab === 'expenses') ||
    (Boolean(parsedPeriod) && !intents.isMap && !effectiveIsSales && !intents.isBudget && !intents.isBranchAlloc);
  const needGeo =
    intents.isMap ||
    effectiveIsAudit ||
    (intents.isScreenQuestion && params.screenContext?.activeTab === 'map');
  const needBudget =
    intents.isBudget ||
    intents.isCreateDashboard ||
    intents.isUpdateDashboard ||
    (intents.isScreenQuestion && params.screenContext?.activeTab === 'budgets');
  const needBranches =
    intents.isBranchAlloc ||
    (intents.isScreenQuestion && params.screenContext?.activeTab === 'branches');

  const toolState: {
    analysis: BusinessAnalysisResponse | null;
    expensesPeriod: AnalysisExpenseInput[];
    geoData: DistrictGeoAnalysisResponse | null;
    varianceData: BudgetVarianceItem[] | null;
    branchData: BranchAllocationResponse | null;
    scenarioData: MacroScenarioResult | null;
    auditTriggered: boolean;
  } = {
    analysis: null,
    expensesPeriod: [],
    geoData: null,
    varianceData: null,
    branchData: null,
    scenarioData: null,
    auditTriggered: effectiveIsAudit,
  };

  const jobs: Array<Promise<void>> = [
    (async () => {
      const s = Date.now();
      const data = await runRestaurantAnalysis(targetRestaurantId, fromStr, toStr);
      toolState.analysis = data;
      traces.push({
        tool: 'get_financial_overview',
        args: { restaurantId: targetRestaurantId, from: fromStr, to: toStr },
        durationMs: Date.now() - s,
        summary: `Rev ${fmtUzs(data.overview.revenue)}, Net ${fmtUzs(data.overview.netProfit)}, Findings ${data.findings.length}`,
      });
    })(),
  ];

  if (needExpenses) {
    jobs.push(
      (async () => {
        const s = Date.now();
        const rows = await fetchExpensesForPeriod(targetRestaurantId, from, to);
        toolState.expensesPeriod = rows;
        const prio = computePriorityExpenseSummary({ expenses: rows });
        traces.push({
          tool: 'get_expenses',
          args: { restaurantId: targetRestaurantId, from: fromStr, to: toStr },
          durationMs: Date.now() - s,
          summary: `${rows.length} expenses (${fmtUzs(prio.totalExpenses)}), Taxes ${fmtUzs(prio.taxesTotal)}, Utilities ${fmtUzs(prio.utilitiesTotal)}`,
        });
      })(),
    );
  }

  if (needGeo) {
    jobs.push(
      (async () => {
        const s = Date.now();
        const data = await analyzeOrdersByDistrict({
          restaurantId: intents.isAudit && !intents.isMap ? targetRestaurantId : 'ALL',
          from: fromStr,
          to: toStr,
          districtId: activeDistrictId,
        });
        toolState.geoData = data;
        traces.push({
          tool: 'analyze_district_orders',
          args: { scope: intents.isAudit && !intents.isMap ? 'current' : 'ALL', districtId: activeDistrictId, from: fromStr, to: toStr },
          durationMs: Date.now() - s,
          summary: `${data.totalOrders} orders across ${data.districts.filter(d => d.orders > 0).length} Tashkent districts`,
        });
      })(),
    );
  }

  if (needBudget) {
    jobs.push(
      (async () => {
        const s = Date.now();
        const data = await computeBudgetVarianceAndForecast(targetRestaurantId, month);
        toolState.varianceData = data;
        traces.push({
          tool: 'check_budget_execution',
          args: { restaurantId: targetRestaurantId, month },
          durationMs: Date.now() - s,
          summary: `${data.length} budget categories, ${data.filter(v => v.riskLevel === 'CRITICAL' || v.riskLevel === 'HIGH').length} high-risk`,
        });
      })(),
    );
  }

  if (needBranches) {
    jobs.push(
      (async () => {
        const s = Date.now();
        const data = await computeMultiBranchAllocation({
          totalBudget: params.totalBudget ?? intents.requestedAmountUZS ?? undefined,
          month,
          objective: /рост|growth|o'sish/i.test(question) ? 'growth' : /прибыль|profit|foyda/i.test(question) ? 'profit' : 'balanced',
        });
        toolState.branchData = data;
        traces.push({
          tool: 'optimize_branch_budgets',
          args: { totalBudget: data.totalBudget, month, objective: data.objective },
          durationMs: Date.now() - s,
          summary: `Allocated ${fmtUzs(data.totalBudget)} across ${data.branches.length} branches`,
        });
      })(),
    );
  }

  if (intents.isWhatIf) {
    const scenarioAssumptions = parseScenarioAssumptions(question);
    jobs.push(
      (async () => {
        const s = Date.now();
        const data = await simulateMacroScenario({
          restaurantId: targetRestaurantId,
          from: fromStr,
          to: toStr,
          ...scenarioAssumptions,
        });
        toolState.scenarioData = data;
        traces.push({
          tool: 'simulate_what_if_scenario',
          args: { ...scenarioAssumptions },
          durationMs: Date.now() - s,
          summary: `Projected profit ${fmtUzs(data.projected.netProfit)} (Δ ${fmtUzs(data.projected.profitDelta)})`,
        });
      })(),
    );
  }

  await Promise.all(jobs);

  const analysis = toolState.analysis!;

  if (parsedPeriod) {
    autoActions.push({
      type: 'set_filters',
      from: fromStr,
      to: toStr,
      ...(parsedPeriod.days === 7 || parsedPeriod.days === 30 || parsedPeriod.days === 60 || parsedPeriod.days === 90
        ? { days: parsedPeriod.days }
        : {}),
      ...(parsedPeriod.kind === 'month' ? { month } : {}),
      ...(intents.requestedRestaurantId && intents.requestedRestaurantId !== params.restaurantId
        ? { restaurantId: intents.requestedRestaurantId }
        : {}),
      ...(intents.requestedDistrict ? { districtId: intents.requestedDistrict } : {}),
      label:
        lang === 'uz'
          ? `Davr: ${parsedPeriod.label.uz}`
          : lang === 'ru'
            ? `Период: ${parsedPeriod.label.ru}`
            : `Period: ${parsedPeriod.label.en}`,
    });
  } else {
    if (intents.requestedRestaurantId && intents.requestedRestaurantId !== params.restaurantId) {
      autoActions.push({
        type: 'set_filters',
        restaurantId: intents.requestedRestaurantId,
        label: `Branch: ${intents.requestedRestaurantId}`,
      });
    }

    if (intents.requestedDays) {
      autoActions.push({
        type: 'set_filters',
        days: intents.requestedDays,
        label:
          lang === 'uz'
            ? `Davr: ${intents.requestedDays} kun`
            : lang === 'ru'
              ? `Период: ${intents.requestedDays} дн.`
              : `Period: ${intents.requestedDays}d`,
      });
    }

    if (intents.requestedDistrict) {
      autoActions.push({
        type: 'set_filters',
        districtId: intents.requestedDistrict,
        label: `Filter: ${intents.requestedDistrict}`,
      });
    }
  }

  if (intents.requestedNavTab) {
    autoActions.push({
      type: 'navigate',
      tab: intents.requestedNavTab,
      label: `Open ${intents.requestedNavTab}`,
    });
    if (intents.requestedNavTab === 'budgets') {
      autoActions.push({
        type: 'highlight_widget',
        widgetId: 'widget-budgets-list',
        tab: 'budgets',
        label: 'Highlight budgets',
      });
    } else if (intents.requestedNavTab === 'dashboard') {
      autoActions.push({
        type: 'highlight_widget',
        widgetId: intents.requestedHighlightWidget ?? 'widget-kpis',
        tab: 'dashboard',
        label: 'Highlight KPIs',
      });
    }
  } else if (intents.requestedHighlightWidget) {
    autoActions.push({
      type: 'highlight_widget',
      widgetId: intents.requestedHighlightWidget,
      tab: 'dashboard',
      label: `Highlight ${intents.requestedHighlightWidget}`,
    });
  }

  const prioritySummary = computePriorityExpenseSummary({
    overview: analysis.overview,
    expenses: toolState.expensesPeriod,
  });

  const buildGroundTruthPayload = () => {
    const lossFindings = toolState.geoData ? buildLossDeliveryAuditFindings(toolState.geoData) : [];
    const combinedFindings = [...analysis.findings, ...lossFindings];
    const gt = {
      branch: restaurantName,
      resolvedPeriod: {
        from: fromStr,
        to: toStr,
        days: analysis.overview.period.days,
        label: periodLabel,
      },
      screenContext: {
        activeTab: params.screenContext?.activeTab ?? 'agent',
        days: params.screenContext?.days ?? 30,
        month,
        districtId: activeDistrictId ?? '',
        visibleWidgets: params.screenContext?.visibleWidgets,
        summaryText: params.screenContext?.summaryText,
        activeCustomDashboardId: params.screenContext?.activeCustomDashboardId ?? null,
        customDashboards: params.screenContext?.customDashboards,
        pinnedWidgetsCount: params.screenContext?.pinnedWidgetsCount ?? 0,
      },
      overview: {
        revenueUZS: Math.round(analysis.overview.revenue),
        expensesUZS: Math.round(analysis.overview.totalExpenses),
        netProfitUZS: Math.round(analysis.overview.netProfit),
        netMarginPct: analysis.overview.netMarginPct,
        foodCostPct: analysis.overview.foodCostPct,
        adminUtilityCostPct: analysis.overview.adminUtilityCostPct,
        potentialSavingUZS:
          analysis.report.totalPotentialSavingUZS +
          lossFindings.reduce((s, f) => s + f.amountImpact, 0),
        healthScore: analysis.report.healthScore,
      },
      priorityExpenses: prioritySummary,
      ...(needExpenses && toolState.expensesPeriod.length > 0
        ? {
            itemizedExpenses: toolState.expensesPeriod.slice(0, 15).map(e => ({
              spentAt: e.spentAt.toISOString().slice(0, 10),
              category: e.category,
              priorityTier: getExpensePriorityTier(e.category),
              itemName: e.itemName,
              supplier: e.supplierName,
              quantity: e.quantity,
              unit: e.unit,
              amountUZS: Math.round(e.amount),
            })),
          }
        : {}),
      ...(toolState.varianceData
        ? {
            budgetVariance: toolState.varianceData.slice(0, 6).map(v => ({
              category: v.category,
              limit: v.limit,
              actual: v.actual,
              forecast: v.forecast,
              risk: v.riskLevel,
              breachDate: v.projectedBreachDate,
              priceEffect: v.drivers.priceEffectUZS,
              topSupplier: v.drivers.topSupplierName,
            })),
          }
        : {}),
      ...(toolState.branchData
        ? {
            branchAllocation: toolState.branchData.branches.map(b => ({
              name: b.name,
              roiPct: b.roiPct,
              efficiency: b.efficiencyScore,
              currentBudget: b.currentBudget,
              recommendedBudget: b.recommendedBudget,
              deltaPct: b.deltaPct,
            })),
          }
        : {}),
      ...(toolState.geoData
        ? {
            districts: toolState.geoData.districts
              .filter(d => d.orders > 0)
              .slice(0, 7)
              .map(d => ({
                district: d.name.en,
                orders: d.orders,
                sharePct: d.sharePct,
                revenue: d.revenue,
                avgDistanceKm: d.avgDistanceKm,
                deliveryMargin: d.deliveryMargin,
                status: d.status,
              })),
          }
        : {}),
      ...(toolState.scenarioData ? { scenario: toolState.scenarioData } : {}),
      topFindings: combinedFindings.slice(0, 6).map(f => ({
        code: f.code,
        kind: f.kind,
        impactUZS: f.amountImpact,
        title: f.title[lang],
        recommendation: f.recommendation[lang],
      })),
    };
    const nums = [
      ...collectNumericValues(gt),
      ...extractNumbersFromText(params.screenContext?.summaryText ?? ''),
    ];
    return { gt, nums };
  };

  let llmAnswer: Record<Language, string> | null = null;
  let requestId = `heuristic-${Date.now()}`;
  let usedModel = requestedModel;
  let source: 'coarena' | 'heuristic' = 'heuristic';

  if (env.COARENA_API_KEY?.trim() || env.GEMINI_API_KEY?.trim()) {
    const FALLBACK_MCP_TOOL_NAMES = new Set([
      'get_expenses',
      'optimize_branch_budgets',
      'check_budget_execution',
      'analyze_district_orders',
      'audit_expenses_and_waste',
      'simulate_what_if_scenario',
      'control_app_dashboard',
    ]);

    const openEndedToolCalling = !hasSpecificIntent && !intents.isScreenQuestion;
    const llmTools = openEndedToolCalling
      ? MCP_TOOLS.filter(t => FALLBACK_MCP_TOOL_NAMES.has(t.name)).map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }))
      : [
          {
            type: 'function',
            function: {
              name: 'control_app_dashboard',
              description: 'Switch UI tab or filter dashboard if user asked to navigate or inspect a specific view.',
              parameters: {
                type: 'object',
                properties: {
                  tab: { type: 'string', enum: ['dashboard', 'agent', 'audit', 'expenses', 'budgets', 'branches', 'map', 'sales'] },
                  districtId: { type: 'string' },
                  from: { type: 'string' },
                  to: { type: 'string' },
                },
              },
            },
          },
        ];

    const langName = lang === 'uz' ? 'Uzbek (Latin)' : lang === 'ru' ? 'Russian' : 'English';
    const systemText = [
      'You are the UzBite AI Financial Controller & Branch Advisor (Hackathon Cases #24, #25, #26 + Tashkent Geo Map).',
      'Strictly use ONLY verified numbers from GroundTruth JSON and tool outputs. Never invent or round into new numbers.',
      'Always state GroundTruth.resolvedPeriod explicitly in your reply when a date or period is discussed.',
      'Prioritize Taxes (TAXES), Electricity/Utilities (UTILITIES, COMMUNICATION + kWh if present), and contrast Base (INGREDIENTS, SALARY, RENT) vs Additional expenses.',
      'If GroundTruth.screenContext.summaryText is present and the user asks about the current screen/chart, explain it directly using screenContext and GroundTruth.',
      `Write 2-3 sharp sentences strictly in ${langName} with concrete UZS figures and next steps.`,
      'Return valid JSON: { "reply": string }.',
    ].join('\n');
    const sysMsg: CoarenaMessage = {
      role: 'system',
      content: systemText,
    };

    const historyMsgs: CoarenaMessage[] = (params.history ?? []).slice(-8).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const initialGt = buildGroundTruthPayload();
    const userMsg: CoarenaMessage = {
      role: 'user',
      content: `Question: ${question}\nGroundTruth: ${JSON.stringify(initialGt.gt)}`,
    };

    const useToolsInRound1 = openEndedToolCalling || Boolean(intents.requestedNavTab);
    const tLlm = Date.now();
    const res = env.COARENA_API_KEY?.trim()
      ? await callCoarenaChat({
          model: requestedModel,
          messages: [sysMsg, ...historyMsgs, userMsg],
          tools: useToolsInRound1 ? llmTools : undefined,
          responseFormat: useToolsInRound1 ? undefined : { type: 'json_object' },
          temperature: 0.15,
          maxTokens: 360,
          timeoutMs: 12_000,
        })
      : null;

    let finalMessageContent: string | null = null;
    let llmProviderLabel = '';

    if (res) {
      requestId = res.requestId;
      usedModel = res.model;
      llmProviderLabel = `coarena:${usedModel}`;
      finalMessageContent = res.message.content;
      const toolCalls = res.message.tool_calls ?? [];

      if (toolCalls.length > 0) {
        const dataToolCalls: Array<{
          id: string;
          name: string;
          args: Record<string, unknown>;
        }> = [];

        for (const tc of toolCalls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
          } catch {
            parsedArgs = {};
          }
          if (tc.function.name === 'control_app_dashboard') {
            const tab = parsedArgs.tab as AgentNavTab | undefined;
            const dId = parsedArgs.districtId as TashkentDistrictId | undefined;
            const act = parsedArgs.action as string | undefined;
            const dTitle = typeof parsedArgs.dashboardTitle === 'string' ? parsedArgs.dashboardTitle.trim() : '';
            const daysArg = typeof parsedArgs.days === 'number' ? parsedArgs.days : undefined;
            const widgetIdArg = typeof parsedArgs.widgetId === 'string' ? parsedArgs.widgetId : undefined;
            const blockKindArg = parsedArgs.blockKind as AgentUiBlock['kind'] | undefined;

            if (act === 'rename_dashboard' && dTitle) {
              autoActions.push({
                type: 'rename_dashboard',
                dashboardId: params.screenContext?.activeCustomDashboardId ?? undefined,
                title: dTitle,
                label: `Rename dashboard to "${dTitle}"`,
              });
            } else if (act === 'delete_dashboard') {
              autoActions.push({
                type: 'delete_dashboard',
                dashboardId: params.screenContext?.activeCustomDashboardId ?? undefined,
                deleteAll: Boolean(parsedArgs.deleteAll),
                label: 'Delete custom dashboard',
              });
            } else if (act === 'select_dashboard') {
              const isMain = parsedArgs.dashboardId === 'main' || (!parsedArgs.dashboardId && !dTitle);
              autoActions.push({
                type: 'select_dashboard',
                dashboardId: isMain ? null : ((parsedArgs.dashboardId as string) || 'latest'),
                titleMatch: dTitle || undefined,
                label: isMain ? 'Switch to Main Dashboard' : `Open ${dTitle || 'Custom Dashboard'}`,
              });
            } else if (act === 'remove_dashboard_widget' && blockKindArg) {
              autoActions.push({
                type: 'remove_dashboard_widget',
                dashboardId: params.screenContext?.activeCustomDashboardId ?? undefined,
                blockKind: blockKindArg,
                label: `Remove ${blockKindArg} from dashboard`,
              });
            } else if (act === 'pin_widget' && !intents.isPinWidget) {
              const spec = buildCustomDashboardSpec({
                lang,
                restaurantName,
                requestedCategories: intents.requestedCategories,
                analysis,
                varianceData: toolState.varianceData,
                geoData: toolState.geoData,
                branchData: toolState.branchData,
                scenarioData: toolState.scenarioData,
                customTitle: dTitle || intents.requestedDashboardTitle,
                isSales: effectiveIsSales,
                isAudit: effectiveIsAudit,
                isBudget: intents.isBudget,
              });
              const pinBlock = spec.blocks.find(b => b.kind === 'chart' || b.kind === 'map' || b.kind === 'table') ?? spec.blocks[0];
              if (pinBlock) {
                autoActions.push({
                  type: 'pin_widget',
                  block: pinBlock,
                  label: lang === 'uz' ? 'Vidjetni Dashboardga biriktirish' : lang === 'ru' ? 'Закрепить виджет на главном дашборде' : 'Pin Widget to Main Dashboard',
                });
              }
            } else if (act === 'unpin_widget') {
              autoActions.push({
                type: 'unpin_widget',
                clearAll: true,
                label: 'Clear pinned widgets',
              });
            } else if (act === 'create_dashboard' && !intents.isCreateDashboard) {
              const spec = buildCustomDashboardSpec({
                lang,
                restaurantName,
                requestedCategories: intents.requestedCategories,
                analysis,
                varianceData: toolState.varianceData,
                geoData: toolState.geoData,
                branchData: toolState.branchData,
                scenarioData: toolState.scenarioData,
                customTitle: dTitle || intents.requestedDashboardTitle,
                isSales: effectiveIsSales,
                isAudit: effectiveIsAudit,
                isBudget: intents.isBudget,
              });
              uiBlocks.push(...spec.blocks);
              autoActions.push({
                type: 'create_dashboard',
                title: spec.title,
                blocks: spec.blocks,
                label: spec.label,
              });
            } else if (act === 'update_dashboard' && !intents.isUpdateDashboard) {
              const spec = buildCustomDashboardSpec({
                lang,
                restaurantName,
                requestedCategories: intents.requestedCategories,
                analysis,
                varianceData: toolState.varianceData,
                geoData: toolState.geoData,
                branchData: toolState.branchData,
                scenarioData: toolState.scenarioData,
                customTitle: dTitle || intents.requestedDashboardTitle,
                isSales: effectiveIsSales,
                isAudit: effectiveIsAudit,
                isBudget: intents.isBudget,
              });
              uiBlocks.push(...spec.blocks);
              autoActions.push({
                type: 'update_dashboard',
                dashboardId: params.screenContext?.activeCustomDashboardId ?? undefined,
                title: dTitle || undefined,
                blocks: spec.blocks,
                mode: parsedArgs.mode === 'replace' ? 'replace' : 'append',
                label: `Update dashboard (${spec.blocks.length} blocks)`,
              });
            }
            if (tab && !autoActions.some(a => a.type === 'navigate' && a.tab === tab)) {
              autoActions.push({ type: 'navigate', tab, label: `Open ${tab}` });
            }
            const fromArg = typeof parsedArgs.from === 'string' ? parsedArgs.from : undefined;
            const toArg = typeof parsedArgs.to === 'string' ? parsedArgs.to : undefined;
            if ((dId || daysArg || fromArg || toArg) && !autoActions.some(a => a.type === 'set_filters')) {
              autoActions.push({
                type: 'set_filters',
                ...(dId ? { districtId: dId } : {}),
                ...(daysArg ? { days: daysArg } : {}),
                ...(fromArg ? { from: fromArg } : {}),
                ...(toArg ? { to: toArg } : {}),
                label: `Filter ${dId ?? (fromArg ? `${fromArg}..${toArg ?? fromArg}` : `${daysArg}d`)}`,
              });
            }
            if (widgetIdArg && !autoActions.some(a => a.type === 'highlight_widget')) {
              autoActions.push({
                type: 'highlight_widget',
                widgetId: widgetIdArg,
                tab: tab ?? 'dashboard',
                label: `Highlight ${widgetIdArg}`,
              });
            }
          } else if (FALLBACK_MCP_TOOL_NAMES.has(tc.function.name)) {
            dataToolCalls.push({ id: tc.id, name: tc.function.name, args: parsedArgs });
          }
        }

        if (dataToolCalls.length > 0) {
          const executed = await Promise.all(
            dataToolCalls.map(async dtc => {
              const s = Date.now();
              const output = await executeMcpTool(dtc.name, dtc.args, {
                restaurantId: targetRestaurantId,
                from: fromStr,
                to: toStr,
                month,
              });
              const durationMs = Date.now() - s;
              traces.push({
                tool: dtc.name,
                args: dtc.args,
                durationMs,
                summary: `Fallback tool executed in ${durationMs}ms`,
              });
              if (dtc.name === 'optimize_branch_budgets') {
                toolState.branchData = output as BranchAllocationResponse;
              } else if (dtc.name === 'check_budget_execution') {
                toolState.varianceData = output as BudgetVarianceItem[];
              } else if (dtc.name === 'analyze_district_orders') {
                toolState.geoData = output as DistrictGeoAnalysisResponse;
              } else if (dtc.name === 'simulate_what_if_scenario') {
                toolState.scenarioData = output as MacroScenarioResult;
              } else if (dtc.name === 'audit_expenses_and_waste') {
                toolState.auditTriggered = true;
              }
              return { id: dtc.id, name: dtc.name, output };
            }),
          );

          const toolMsgs: CoarenaMessage[] = executed.map(ex => ({
            role: 'tool',
            tool_call_id: ex.id,
            name: ex.name,
            content: JSON.stringify(ex.output),
          }));
          const assistantToolMsg: CoarenaMessage = {
            role: 'assistant',
            content: res.message.content ?? null,
            tool_calls: toolCalls,
          };
          const round2Res = await callCoarenaChat({
            model: requestedModel,
            messages: [sysMsg, ...historyMsgs, userMsg, assistantToolMsg, ...toolMsgs],
            responseFormat: { type: 'json_object' },
            temperature: 0.15,
            maxTokens: 340,
            timeoutMs: 12_000,
          });
          if (round2Res) {
            requestId = round2Res.requestId;
            usedModel = round2Res.model;
            llmProviderLabel = `coarena:${usedModel}`;
            finalMessageContent = round2Res.message.content;
          }
        }
      }
    } else if (env.GEMINI_API_KEY?.trim()) {
      const geminiRes = await callGeminiAgentChat({
        systemInstruction: systemText,
        messages: [
          ...(params.history ?? []).slice(-8),
          { role: 'user', content: `Question: ${question}\nGroundTruth: ${JSON.stringify(initialGt.gt)}` },
        ],
        temperature: 0.15,
        maxOutputTokens: 380,
        timeoutMs: 12_000,
      });
      if (geminiRes) {
        requestId = geminiRes.requestId;
        usedModel = geminiRes.model;
        llmProviderLabel = `gemini:${usedModel}`;
        finalMessageContent = geminiRes.content;
      }
    }

    if (res || finalMessageContent) {
      let replyText = '';
      if (finalMessageContent) {
        const parsed = extractJsonFromText(finalMessageContent) as { reply?: string; ru?: string; uz?: string; en?: string } | null;
        if (parsed?.reply && typeof parsed.reply === 'string') {
          replyText = parsed.reply.trim();
        } else if (parsed && typeof parsed[lang] === 'string') {
          replyText = parsed[lang]!.trim();
        } else if (finalMessageContent.trim().length > 12) {
          replyText = finalMessageContent.trim();
        }
      }

      const refreshedGt = buildGroundTruthPayload();
      const allowedNumbers = refreshedGt.nums;

      if (replyText) {
        const grounding = verifyLlmNumbersAgainstGroundTruth(replyText, allowedNumbers);
        const deterministicFallback = buildDeterministicAgentAnswer({
          lang,
          restaurantName,
          analysis,
          prioritySummary,
          fromStr,
          toStr,
          parsedPeriod,
          expenses: toolState.expensesPeriod,
          isExpenseQuery: needExpenses,
          isSales: effectiveIsSales,
          geoData: intents.isMap || !toolState.auditTriggered ? toolState.geoData : null,
          varianceData: toolState.varianceData,
          branchData: toolState.branchData,
          scenarioData: toolState.scenarioData,
          customDashboardTitle: intents.isCreateDashboard
            ? (autoActions.find(a => a.type === 'create_dashboard') as { title?: string } | undefined)?.title ?? intents.requestedDashboardTitle ?? undefined
            : undefined,
          screenSummaryText: intents.isScreenQuestion ? params.screenContext?.summaryText : undefined,
        });
        if (grounding.verified) {
          llmAnswer = { ...deterministicFallback, [lang]: replyText };
          source = 'coarena';
        } else {
          llmAnswer = deterministicFallback;
          source = 'coarena';
        }
        traces.push({
          tool: llmProviderLabel || `coarena:${usedModel}`,
          args: { requestId, grounded: grounding.verified, matchedNumbers: grounding.matchedCount },
          durationMs: Date.now() - tLlm,
          summary: grounding.verified
            ? `Grounded response (${grounding.matchedCount} verified figures)`
            : `Fallback to exact numbers (rejected ${grounding.ungroundedNumbers.join(', ')})`,
        });
      } else {
        traces.push({
          tool: llmProviderLabel || `coarena:${usedModel}`,
          args: { requestId },
          durationMs: Date.now() - tLlm,
          summary: 'UI control tool call processed',
        });
      }
    }
  }

  const { geoData, varianceData, branchData, scenarioData } = toolState;

  if (toolState.auditTriggered) {
    const lossFindings = geoData ? buildLossDeliveryAuditFindings(geoData) : [];
    const totalSaving =
      analysis.report.totalPotentialSavingUZS +
      lossFindings.reduce((s, f) => s + f.amountImpact, 0);
    traces.push({
      tool: 'audit_expenses_and_waste',
      args: { restaurantId: targetRestaurantId },
      durationMs: 4,
      summary: `${analysis.findings.length + lossFindings.length} findings, savings ${fmtUzs(totalSaving)}`,
    });
  }

  let dashboardControlNotice: Record<Language, string> | undefined;
  const customDashboardsList = params.screenContext?.customDashboards;
  const activeDashId =
    params.screenContext?.activeCustomDashboardId ??
    customDashboardsList?.[0]?.id;

  if (intents.isCreateDashboard) {
    const spec = buildCustomDashboardSpec({
      lang,
      restaurantName,
      requestedCategories: intents.requestedCategories,
      analysis,
      varianceData,
      geoData,
      branchData,
      scenarioData,
      customTitle: intents.requestedDashboardTitle,
      isSales: effectiveIsSales,
      isAudit: effectiveIsAudit,
      isBudget: intents.isBudget,
    });
    uiBlocks.push(...spec.blocks);
    const createAction: AgentClientAction = {
      type: 'create_dashboard',
      title: spec.title,
      blocks: spec.blocks,
      label: spec.label,
    };
    autoActions.push(createAction);
    suggestedActions.push(createAction);
    traces.push({
      tool: 'control_app_dashboard',
      args: { action: 'create_dashboard', title: spec.title, blocks: spec.blocks.length },
      durationMs: 2,
      summary: `Created custom dashboard "${spec.title}" (${spec.blocks.length} blocks)`,
    });
  } else if (intents.isUpdateDashboard) {
    const spec = buildCustomDashboardSpec({
      lang,
      restaurantName,
      requestedCategories: intents.requestedCategories,
      analysis,
      varianceData,
      geoData,
      branchData,
      scenarioData,
      customTitle: intents.requestedDashboardTitle,
      isSales: effectiveIsSales,
      isAudit: effectiveIsAudit,
      isBudget: intents.isBudget,
    });
    uiBlocks.push(...spec.blocks);
    const updateAction: AgentClientAction = {
      type: 'update_dashboard',
      dashboardId: activeDashId,
      title: intents.requestedDashboardTitle ?? undefined,
      blocks: spec.blocks,
      mode: intents.dashboardUpdateMode,
      label:
        intents.dashboardUpdateMode === 'append'
          ? lang === 'uz'
            ? `Dashboardga vidjetlarni qo'shish (${spec.blocks.length})`
            : lang === 'ru'
              ? `Добавить виджеты в дашборд (${spec.blocks.length})`
              : `Add Widgets to Dashboard (${spec.blocks.length})`
          : lang === 'uz'
            ? `Dashboardni yangilash: ${spec.title}`
            : lang === 'ru'
              ? `Обновить дашборд: ${spec.title}`
              : `Update Dashboard: ${spec.title}`,
    };
    autoActions.push(updateAction);
    suggestedActions.push(updateAction);
    traces.push({
      tool: 'control_app_dashboard',
      args: { action: 'update_dashboard', mode: intents.dashboardUpdateMode, blocks: spec.blocks.length },
      durationMs: 2,
      summary: `Updated custom dashboard (${intents.dashboardUpdateMode}, ${spec.blocks.length} blocks)`,
    });
    dashboardControlNotice =
      intents.dashboardUpdateMode === 'append'
        ? {
            ru: `В кастомный дашборд по «${restaurantName}» добавлено ${spec.blocks.length} виджетов (выручка ${fmtUzs(analysis.overview.revenue)}, чистая прибыль ${fmtUzs(analysis.overview.netProfit)}).`,
            uz: `«${restaurantName}» maxsus paneliga ${spec.blocks.length} ta vidjet qo‘shildi (tushum ${fmtUzs(analysis.overview.revenue)}, sof foyda ${fmtUzs(analysis.overview.netProfit)}).`,
            en: `Added ${spec.blocks.length} widgets to the custom dashboard for ${restaurantName} (revenue ${fmtUzs(analysis.overview.revenue)}, net profit ${fmtUzs(analysis.overview.netProfit)}).`,
          }
        : {
            ru: `Кастомный дашборд по «${restaurantName}» обновлён (${spec.blocks.length} виджетов, выручка ${fmtUzs(analysis.overview.revenue)}, расходы ${fmtUzs(analysis.overview.totalExpenses)}).`,
            uz: `«${restaurantName}» maxsus paneli yangilandi (${spec.blocks.length} ta vidjet, tushum ${fmtUzs(analysis.overview.revenue)}, xarajatlar ${fmtUzs(analysis.overview.totalExpenses)}).`,
            en: `Updated custom dashboard for ${restaurantName} (${spec.blocks.length} widgets, revenue ${fmtUzs(analysis.overview.revenue)}, expenses ${fmtUzs(analysis.overview.totalExpenses)}).`,
          };
  } else if (intents.isRemoveDashboardWidget && intents.removeWidgetKind) {
    const rmAction: AgentClientAction = {
      type: 'remove_dashboard_widget',
      dashboardId: activeDashId,
      blockKind: intents.removeWidgetKind,
      label:
        lang === 'uz'
          ? `Dashboarddan o'chirish (${intents.removeWidgetKind})`
          : lang === 'ru'
            ? `Убрать блок (${intents.removeWidgetKind}) с дашборда`
            : `Remove ${intents.removeWidgetKind} from Dashboard`,
    };
    autoActions.push(rmAction);
    suggestedActions.push(rmAction);
    traces.push({
      tool: 'control_app_dashboard',
      args: { action: 'remove_dashboard_widget', blockKind: intents.removeWidgetKind },
      durationMs: 1,
      summary: `Removed ${intents.removeWidgetKind} widget from custom dashboard`,
    });
    dashboardControlNotice = {
      ru: `Виджет типа «${intents.removeWidgetKind}» удалён с активного дашборда «${restaurantName}».`,
      uz: `Faol paneldan «${intents.removeWidgetKind}» vidjeti olib tashlandi («${restaurantName}»).`,
      en: `Removed "${intents.removeWidgetKind}" widget from the active dashboard (${restaurantName}).`,
    };
  } else if (intents.isRenameDashboard) {
    const newTitle = intents.requestedDashboardTitle || `${restaurantName} — AI Dashboard`;
    const renAction: AgentClientAction = {
      type: 'rename_dashboard',
      dashboardId: activeDashId,
      title: newTitle,
      label:
        lang === 'uz'
          ? `Dashboard nomini o'zgartirish: «${newTitle}»`
          : lang === 'ru'
            ? `Переименовать дашборд в «${newTitle}»`
            : `Rename Dashboard to "${newTitle}"`,
    };
    autoActions.push(renAction);
    suggestedActions.push(renAction);
    traces.push({
      tool: 'control_app_dashboard',
      args: { action: 'rename_dashboard', title: newTitle },
      durationMs: 1,
      summary: `Renamed custom dashboard to "${newTitle}"`,
    });
    dashboardControlNotice = {
      ru: `Дашборд переименован в «${newTitle}» («${restaurantName}», выручка ${fmtUzs(analysis.overview.revenue)}).`,
      uz: `Dashboard nomi «${newTitle}» deb o‘zgartirildi («${restaurantName}», tushum ${fmtUzs(analysis.overview.revenue)}).`,
      en: `Renamed custom dashboard to "${newTitle}" (${restaurantName}, revenue ${fmtUzs(analysis.overview.revenue)}).`,
    };
  } else if (intents.isDeleteDashboard) {
    const delAction: AgentClientAction = {
      type: 'delete_dashboard',
      dashboardId: activeDashId,
      deleteAll: intents.deleteAllDashboards,
      label: intents.deleteAllDashboards
        ? lang === 'uz'
          ? "Barcha maxsus dashboardlarni o'chirish"
          : lang === 'ru'
            ? 'Удалить все кастомные дашборды'
            : 'Delete All Custom Dashboards'
        : lang === 'uz'
          ? "Joriy dashboardni o'chirish"
          : lang === 'ru'
            ? 'Удалить текущий кастомный дашборд'
            : 'Delete Active Custom Dashboard',
    };
    autoActions.push(delAction);
    suggestedActions.push(delAction);
    traces.push({
      tool: 'control_app_dashboard',
      args: { action: 'delete_dashboard', deleteAll: intents.deleteAllDashboards },
      durationMs: 1,
      summary: intents.deleteAllDashboards ? 'Deleted all custom dashboards' : 'Deleted active custom dashboard',
    });
    dashboardControlNotice = intents.deleteAllDashboards
      ? {
          ru: `Все кастомные дашборды удалены. Открыт основной обзор «${restaurantName}» (выручка ${fmtUzs(analysis.overview.revenue)}).`,
          uz: `Barcha maxsus panellar o‘chirildi. «${restaurantName}» asosiy sharhi ochildi (tushum ${fmtUzs(analysis.overview.revenue)}).`,
          en: `Deleted all custom dashboards and returned to ${restaurantName} main overview (revenue ${fmtUzs(analysis.overview.revenue)}).`,
        }
      : {
          ru: `Кастомный дашборд удалён. Возврат к основному дашборду «${restaurantName}» (выручка ${fmtUzs(analysis.overview.revenue)}).`,
          uz: `Maxsus panel o‘chirildi. «${restaurantName}» asosiy paneliga qaytildi (tushum ${fmtUzs(analysis.overview.revenue)}).`,
          en: `Deleted custom dashboard and returned to ${restaurantName} overview (revenue ${fmtUzs(analysis.overview.revenue)}).`,
        };
  } else if (intents.isListDashboards) {
    const count = customDashboardsList?.length ?? 0;
    const pinnedCount = params.screenContext?.pinnedWidgetsCount ?? 0;
    const names = (customDashboardsList ?? []).map(d => `«${d.title}» (${d.blockCount})`).join(', ');
    if (customDashboardsList && customDashboardsList.length > 0) {
      uiBlocks.push({
        id: 'blk-dashboards-list',
        kind: 'table',
        title: lang === 'uz' ? 'Maxsus panellar' : lang === 'ru' ? 'Кастомные дашборды' : 'Custom Dashboards',
        columns: lang === 'uz' ? ['Nomi', 'Vidjetlar'] : lang === 'ru' ? ['Название', 'Блоки'] : ['Title', 'Blocks'],
        rows: customDashboardsList.map(d => [d.title, d.blockCount]),
      });
    }
    dashboardControlNotice = {
      ru: count > 0 ? `У вас ${count} кастомных дашбордов: ${names}. Закреплено виджетов: ${pinnedCount}.` : `Кастомных дашбордов пока нет (закреплено виджетов: ${pinnedCount}). Могу создать новый — просто напишите тему.`,
      uz: count > 0 ? `Sizda ${count} ta maxsus panel bor: ${names}. Biriktirilgan vidjetlar: ${pinnedCount}.` : `Hozircha maxsus panellar yo‘q (biriktirilgan vidjetlar: ${pinnedCount}). Yangisini yaratish uchun mavzuni yozing.`,
      en: count > 0 ? `You have ${count} custom dashboards: ${names}. Pinned widgets: ${pinnedCount}.` : `No custom dashboards yet (pinned widgets: ${pinnedCount}). Ask me to create one anytime.`,
    };
  } else if (intents.isSelectMainDashboard || intents.isSelectCustomDashboard) {
    const selectMain = intents.isSelectMainDashboard;
    const hasEmptyCustomList = !selectMain && Array.isArray(customDashboardsList) && customDashboardsList.length === 0;
    if (hasEmptyCustomList) {
      dashboardControlNotice = {
        ru: `Кастомных дашбордов для «${restaurantName}» пока нет (выручка ${fmtUzs(analysis.overview.revenue)}). Попросите меня создать дашборд, например по налогам или бюджетам.`,
        uz: `«${restaurantName}» uchun maxsus panellar hali yaratilmagan (tushum ${fmtUzs(analysis.overview.revenue)}). Yangi panel yaratishni so‘rang.`,
        en: `No custom dashboards exist yet for ${restaurantName} (revenue ${fmtUzs(analysis.overview.revenue)}). Ask me to create one first.`,
      };
    } else {
      const matchedCustom = !selectMain
        ? (customDashboardsList ?? []).find(d =>
            intents.requestedDashboardTitle
              ? d.title.toLowerCase().includes(intents.requestedDashboardTitle.toLowerCase())
              : question.toLowerCase().includes(d.title.toLowerCase()),
          ) ?? customDashboardsList?.[0]
        : null;
      const selAction: AgentClientAction = {
        type: 'select_dashboard',
        dashboardId: selectMain ? null : (matchedCustom?.id ?? 'latest'),
        titleMatch: selectMain ? undefined : (intents.requestedDashboardTitle ?? question),
        label: selectMain
          ? lang === 'uz'
            ? 'Asosiy dashboardni ochish'
            : lang === 'ru'
              ? 'Открыть главный дашборд (Обзор)'
              : 'Switch to Main Overview Dashboard'
          : lang === 'uz'
            ? `Dashboardni ochish: ${matchedCustom?.title ?? 'Maxsus'}`
            : lang === 'ru'
              ? `Открыть дашборд: ${matchedCustom?.title ?? 'Кастомный'}`
              : `Switch to Dashboard: ${matchedCustom?.title ?? 'Custom'}`,
      };
      autoActions.push(selAction);
      suggestedActions.push(selAction);
      traces.push({
        tool: 'control_app_dashboard',
        args: { action: 'select_dashboard', target: selectMain ? 'main' : (matchedCustom?.title ?? 'latest') },
        durationMs: 1,
        summary: selectMain ? 'Switched to main overview dashboard' : `Switched to custom dashboard "${matchedCustom?.title ?? 'latest'}"`,
      });
      dashboardControlNotice = selectMain
        ? {
            ru: `Переключено на главный дашборд «${restaurantName}» (выручка ${fmtUzs(analysis.overview.revenue)}, чистая прибыль ${fmtUzs(analysis.overview.netProfit)}).`,
            uz: `«${restaurantName}» asosiy paneliga o‘tildi (tushum ${fmtUzs(analysis.overview.revenue)}, sof foyda ${fmtUzs(analysis.overview.netProfit)}).`,
            en: `Switched to the main overview dashboard for ${restaurantName} (revenue ${fmtUzs(analysis.overview.revenue)}, net profit ${fmtUzs(analysis.overview.netProfit)}).`,
          }
        : {
            ru: `Открыт кастомный дашборд «${matchedCustom?.title ?? 'AI Dashboard'}» по «${restaurantName}» (выручка ${fmtUzs(analysis.overview.revenue)}).`,
            uz: `«${restaurantName}» bo‘yicha «${matchedCustom?.title ?? 'AI Dashboard'}» maxsus paneli ochildi (tushum ${fmtUzs(analysis.overview.revenue)}).`,
            en: `Opened custom dashboard "${matchedCustom?.title ?? 'AI Dashboard'}" for ${restaurantName} (revenue ${fmtUzs(analysis.overview.revenue)}).`,
          };
    }
  } else {
    if (geoData && (intents.isMap || !toolState.auditTriggered)) {
      const g: DistrictGeoAnalysisResponse = geoData;
      const top = g.topDistrict;
      const lossSum = g.lossMakingDeliveryDistricts.reduce((s, d) => s + Math.abs(d.deliveryMargin), 0);
      uiBlocks.push({
        id: 'blk-geo-kpis',
        kind: 'kpis',
        title: lang === 'uz' ? "Tumanlar bo'yicha buyurtmalar" : lang === 'ru' ? 'Геоаналитика заказов' : 'District Geo KPIs',
        items: [
          {
            label: lang === 'uz' ? 'Top tuman' : lang === 'ru' ? 'Топ-район клиентов' : 'Top District',
            value: top ? top.name[lang] : '—',
            sublabel: top ? `${top.orders} (${top.sharePct}%)` : undefined,
            tone: 'good',
          },
          {
            label: lang === 'uz' ? 'Jami buyurtmalar' : lang === 'ru' ? 'Всего заказов' : 'Total Orders',
            value: String(g.totalOrders),
            sublabel: fmtUzs(g.totalRevenue),
            tone: 'neutral',
          },
          {
            label: lang === 'uz' ? 'Kam qamrovli hududlar' : lang === 'ru' ? 'Зоны роста (>5.2 км)' : 'Underserved Zones',
            value: String(g.underservedDistricts.length),
            sublabel: g.underservedDistricts.slice(0, 2).map(d => d.name[lang]).join(', ') || '—',
            tone: g.underservedDistricts.length > 0 ? 'warn' : 'good',
          },
          {
            label: lang === 'uz' ? 'Zararli yetkazish' : lang === 'ru' ? 'Убыточная доставка' : 'Loss Delivery Zones',
            value: String(g.lossMakingDeliveryDistricts.length),
            sublabel: lossSum > 0 ? `-${fmtUzs(lossSum)}` : 'OK',
            tone: g.lossMakingDeliveryDistricts.length > 0 ? 'bad' : 'good',
          },
        ],
      });
      uiBlocks.push({
        id: 'blk-geo-map',
        kind: 'map',
        title: lang === 'uz' ? 'Toshkent tumanlari xaritasi' : lang === 'ru' ? 'Карта спроса по районам Ташкента' : 'Tashkent Districts Demand Map',
        metric: 'orders',
        highlightDistrictId: activeDistrictId ?? top?.districtId,
        districts: g.districts,
        branches: g.branches,
        heatmapCells: g.heatmapCells,
      });
      uiBlocks.push({
        id: 'blk-geo-table',
        kind: 'table',
        title: lang === 'uz' ? 'Tumanlar reytingi' : lang === 'ru' ? 'Рейтинг районов по заказам и марже доставки' : 'District Orders & Delivery Margin',
        columns:
          lang === 'uz'
            ? ['Tuman', 'Buyurtma', 'Ulush', 'Tushum', 'Masofa', 'Yetkazish marjasi']
            : lang === 'ru'
              ? ['Район', 'Заказы', 'Доля', 'Выручка', 'Дистанция', 'Маржа доставки']
              : ['District', 'Orders', 'Share', 'Revenue', 'Distance', 'Delivery Margin'],
        rows: g.districts
          .filter(d => d.orders > 0)
          .slice(0, 8)
          .map(d => [
            d.name[lang],
            d.orders,
            `${d.sharePct}%`,
            fmtUzs(d.revenue),
            `${d.avgDistanceKm} km`,
            fmtUzs(d.deliveryMargin),
          ]),
        highlightRowIndices: [0],
      });
      suggestedActions.push({
        type: 'navigate',
        tab: 'map',
        label: lang === 'uz' ? 'Xarita bo‘limini ochish' : lang === 'ru' ? 'Открыть интерактивную карту' : 'Open Map Tab',
      });
    }

    if (branchData) {
      const bd: BranchAllocationResponse = branchData;
      uiBlocks.push({
        id: 'blk-branch-alloc',
        kind: 'allocation',
        title: lang === 'uz' ? "Filiallar bo'yicha byudjet taqsimoti (Keys #24)" : lang === 'ru' ? 'Оптимальное распределение бюджета по филиалам (Кейс #24)' : 'Optimal Multi-Branch Budget Allocation (Case #24)',
        allocation: bd,
      });
      uiBlocks.push({
        id: 'blk-branch-chart',
        kind: 'chart',
        chartType: 'horizontal_bar',
        title: lang === 'uz' ? 'Joriy va AI-tavsiya etilgan byudjet' : lang === 'ru' ? 'Текущий vs Рекомендуемый AI бюджет (UZS)' : 'Current vs AI Recommended Budget (UZS)',
        items: bd.branches.map(b => ({
          label: b.name,
          value: b.recommendedBudget,
          secondaryValue: b.currentBudget,
          secondaryLabel: lang === 'uz' ? 'Joriy' : lang === 'ru' ? 'Текущий' : 'Current',
        })),
      });
      const flatAllocations = bd.branches.flatMap(b =>
        b.categoryAllocations.map(ca => ({
          restaurantId: b.restaurantId,
          category: ca.category,
          limit: ca.recommendedLimit,
        })),
      );
      suggestedActions.push({
        type: 'apply_branch_budgets',
        month: bd.month,
        allocations: flatAllocations,
        label: lang === 'uz' ? `Barcha filiallar uchun limitlarni qo'llash (${bd.month})` : lang === 'ru' ? `Применить AI-бюджеты ко всем филиалам (${bd.month})` : `Apply AI Budgets to All Branches (${bd.month})`,
      });
      suggestedActions.push({
        type: 'navigate',
        tab: 'branches',
        label: lang === 'uz' ? 'Filiallar sahifasiga o‘tish' : lang === 'ru' ? 'Открыть вкладку «Филиалы»' : 'Open Branches Tab',
      });
    }

    if (varianceData) {
      const vd: BudgetVarianceItem[] = varianceData;
      const critical = vd.filter(v => v.riskLevel === 'CRITICAL' || v.riskLevel === 'HIGH');
      if (critical.length > 0) {
        uiBlocks.push({
          id: 'blk-budget-alert',
          kind: 'alert',
          severity: critical.some(c => c.riskLevel === 'CRITICAL') ? 'critical' : 'warning',
          title:
            lang === 'uz'
              ? `${critical.length} ta modda bo‘yicha byudjet xavfi (Keys #25)`
              : lang === 'ru'
                ? `Раннее предупреждение по бюджету: ${critical.length} статей (Кейс #25)`
                : `Budget Early Warning: ${critical.length} categories at risk (Case #25)`,
          body: critical.map(c => c.drivers.explanation[lang]).join(' '),
        });
      }
      if (vd.length > 0) {
        uiBlocks.push({
          id: 'blk-budget-chart',
          kind: 'chart',
          chartType: 'bar',
          title: lang === 'uz' ? 'Reja (Limit) vs Oy oxiri prognozi' : lang === 'ru' ? 'План (Лимит) vs Прогноз до конца месяца' : 'Budget Plan vs Month-End Forecast',
          items: vd.slice(0, 6).map(v => ({
            label: categoryLabel(v.category, lang),
            value: v.forecast,
            secondaryValue: v.limit,
            secondaryLabel: lang === 'uz' ? 'Limit' : lang === 'ru' ? 'Лимит' : 'Limit',
          })),
        });
        uiBlocks.push({
          id: 'blk-budget-table',
          kind: 'table',
          title: lang === 'uz' ? 'Tafovut sabablari va buzilish sanasi' : lang === 'ru' ? 'Причины отклонений и дата превышения лимита' : 'Variance Drivers & Projected Breach Date',
          columns:
            lang === 'uz'
              ? ['Toifa', 'Limit', 'Fakt', 'Prognoz', 'Buzilish sanasi', 'Narx ta’siri']
              : lang === 'ru'
                ? ['Статья', 'Лимит', 'Факт', 'Прогноз', 'Дата пробития', 'Фактор цены']
                : ['Category', 'Limit', 'Actual', 'Forecast', 'Breach Date', 'Price Effect'],
          rows: vd.slice(0, 7).map(v => [
            categoryLabel(v.category, lang),
            fmtUzs(v.limit),
            fmtUzs(v.actual),
            fmtUzs(v.forecast),
            v.projectedBreachDate ?? 'OK',
            fmtUzs(v.drivers.priceEffectUZS),
          ]),
          highlightRowIndices: vd
            .slice(0, 7)
            .map((v, idx) => (v.riskLevel === 'CRITICAL' || v.riskLevel === 'HIGH' ? idx : -1))
            .filter(i => i >= 0),
        });
      }
      suggestedActions.push({
        type: 'navigate',
        tab: 'budgets',
        label: lang === 'uz' ? 'Byudjetlar bo‘limini ochish' : lang === 'ru' ? 'Открыть вкладку «Бюджеты»' : 'Open Budgets Tab',
      });
    }

    const explicitAuditKeywords = /(ошиб|дубл|аудит|xato|dublikat|audit|error|duplicate|(?:#|кейс\s*#?|case\s*#?|keys\s*#?)\s*26\b)/i.test(question);

    if (
      needExpenses &&
      intents.isPriorityQuery &&
      !explicitAuditKeywords
    ) {
      const builtPriority = buildPriorityExpenseBlocks({
        lang,
        periodLabel,
        fromStr,
        toStr,
        overview: analysis.overview,
        expenses: toolState.expensesPeriod,
        requestedCategories: intents.requestedCategories,
      });
      for (const blk of builtPriority.blocks) {
        if (!uiBlocks.some(b => b.id === blk.id)) {
          uiBlocks.push(blk);
        }
      }
      if (!suggestedActions.some(a => a.type === 'navigate' && a.tab === 'expenses')) {
        suggestedActions.push({
          type: 'navigate',
          tab: 'expenses',
          label:
            lang === 'uz'
              ? 'Xarajatlar bo‘limini ochish'
              : lang === 'ru'
                ? 'Открыть журнал расходов'
                : 'Open Expenses Tab',
        });
      }
    }

    if (toolState.auditTriggered) {
      const lossFindings = geoData ? buildLossDeliveryAuditFindings(geoData) : [];
      const mergedFindings = [...analysis.findings, ...lossFindings];
      const dedupSaving =
        calculateDeduplicatedSavings(analysis.findings) +
        lossFindings.reduce((s, f) => s + f.amountImpact, 0);
      const errors = analysis.findings.filter(f => f.kind === 'ERROR');
      for (const f of mergedFindings.slice(0, 6)) relatedFindingCodes.add(f.code);

      uiBlocks.push({
        id: 'blk-audit-kpis',
        kind: 'kpis',
        title: lang === 'uz' ? 'Xarajatlarni optimallashtirish auditi (Keys #26)' : lang === 'ru' ? 'Финансовый аудит и поиск экономии (Кейс #26)' : 'Cost Optimization & Error Audit (Case #26)',
        items: [
          {
            label: lang === 'uz' ? 'Tejamkorlik salohiyati' : lang === 'ru' ? 'Потенциал экономии' : 'Savings Potential',
            value: fmtUzs(dedupSaving),
            tone: 'good',
          },
          {
            label: lang === 'uz' ? 'Hisob xatolari' : lang === 'ru' ? 'Ошибки учёта' : 'Accounting Errors',
            value: String(errors.length),
            tone: errors.length > 0 ? 'bad' : 'good',
          },
          {
            label: lang === 'uz' ? 'Kommunal va ijara' : lang === 'ru' ? 'Аренда, свет и связь' : 'Rent, Utilities & Telecom',
            value: `${analysis.overview.adminUtilityCostPct.toFixed(1)}%`,
            tone: analysis.overview.adminUtilityCostPct > 12 ? 'warn' : 'neutral',
          },
          {
            label: lang === 'uz' ? 'Salomatlik indeksi' : lang === 'ru' ? 'Индекс здоровья' : 'Health Score',
            value: `${analysis.report.healthScore} / 100`,
            tone: analysis.report.healthScore >= 75 ? 'good' : 'warn',
          },
        ],
      });
      if (mergedFindings.length > 0) {
        uiBlocks.push({
          id: 'blk-audit-table',
          kind: 'table',
          title: lang === 'uz' ? 'Aniqlangan xatolar va samarasiz xarajatlar' : lang === 'ru' ? 'Топ находок AI-аудита' : 'Top Audit Findings & Anomalies',
          columns:
            lang === 'uz'
              ? ['Turi', 'Kod', 'Muammo', 'Ta’sir (UZS)']
              : lang === 'ru'
                ? ['Тип', 'Код', 'Описание', 'Эффект (UZS)']
                : ['Type', 'Code', 'Finding', 'Impact (UZS)'],
          rows: mergedFindings.slice(0, 8).map(f => [
            f.kind,
            f.code,
            f.title[lang],
            fmtUzs(f.amountImpact),
          ]),
          highlightRowIndices: [0, 1].filter(i => i < mergedFindings.length),
        });

        for (const f of analysis.findings) {
          const act = buildFindingAction(f, lang);
          if (act && suggestedActions.length < 4) suggestedActions.push(act);
        }
      }
    }

    if (scenarioData) {
      const sc = scenarioData;
      const parts: string[] = [];
      if (sc.assumptions.utilityTariffPct !== 0) parts.push(`util ${sc.assumptions.utilityTariffPct > 0 ? '+' : ''}${sc.assumptions.utilityTariffPct}%`);
      if (sc.assumptions.foodInflationPct !== 0) parts.push(`food ${sc.assumptions.foodInflationPct > 0 ? '+' : ''}${sc.assumptions.foodInflationPct}%`);
      if (sc.assumptions.rentChangePct !== 0) parts.push(`rent ${sc.assumptions.rentChangePct > 0 ? '+' : ''}${sc.assumptions.rentChangePct}%`);
      if (sc.assumptions.orderVolumeChangePct !== 0) parts.push(`orders ${sc.assumptions.orderVolumeChangePct > 0 ? '+' : ''}${sc.assumptions.orderVolumeChangePct}%`);
      if (sc.assumptions.priceIncreasePct !== 0) parts.push(`price ${sc.assumptions.priceIncreasePct > 0 ? '+' : ''}${sc.assumptions.priceIncreasePct}%`);
      const tag = parts.join(', ') || 'stress test';

      uiBlocks.push({
        id: 'blk-whatif-kpis',
        kind: 'kpis',
        title: lang === 'uz' ? `Ssenariy modeli (${tag})` : lang === 'ru' ? `Стресс-тест (${tag})` : `Macro Stress Test (${tag})`,
        items: [
          { label: lang === 'uz' ? 'Bazaviy foyda' : lang === 'ru' ? 'Текущая прибыль' : 'Baseline Profit', value: fmtUzs(sc.baseline.netProfit), tone: 'neutral' },
          { label: lang === 'uz' ? 'Prognoz foyda' : lang === 'ru' ? 'Прибыль после шока' : 'Projected Profit', value: fmtUzs(sc.projected.netProfit), tone: sc.projected.netProfit >= 0 ? 'warn' : 'bad' },
          { label: lang === 'uz' ? 'Ta’sir' : lang === 'ru' ? 'Изменение прибыли' : 'Profit Impact', value: fmtUzs(sc.projected.profitDelta), tone: sc.projected.profitDelta < 0 ? 'bad' : 'good' },
          { label: lang === 'uz' ? 'Yangi marja' : lang === 'ru' ? 'Новая маржа' : 'New Margin', value: `${sc.projected.netMarginPct}%`, tone: 'warn' },
        ],
      });
    }

    if (effectiveIsSales && analysis.dishes && analysis.dishes.length > 0 && uiBlocks.length === 0) {
      uiBlocks.push({
        id: 'blk-sales-chart',
        kind: 'chart',
        chartType: 'horizontal_bar',
        title: lang === 'uz' ? 'Top taomlar tushumi va foydasi' : lang === 'ru' ? 'Топ блюд по выручке и марже (UZS)' : 'Top Dishes Revenue vs Profit (UZS)',
        items: analysis.dishes.slice(0, 6).map(d => ({
          label: d.name,
          value: d.revenue,
          secondaryValue: d.totalProfit,
          secondaryLabel: lang === 'uz' ? 'Foyda' : lang === 'ru' ? 'Маржа' : 'Profit',
        })),
      });
      uiBlocks.push({
        id: 'blk-sales-table',
        kind: 'table',
        title: lang === 'uz' ? 'Menyu ABC tahlili' : lang === 'ru' ? 'Матрица меню (ABC / Kasavana-Smith)' : 'Menu Engineering Matrix',
        columns:
          lang === 'uz'
            ? ['Taom', 'Soni', 'Tushum', 'Marja %', 'Kvadrant']
            : lang === 'ru'
              ? ['Блюдо', 'Продано', 'Выручка', 'Маржа %', 'Квадрант']
              : ['Dish', 'Sold', 'Revenue', 'Margin %', 'Quadrant'],
        rows: analysis.dishes.slice(0, 6).map(d => [
          d.name,
          d.quantitySold,
          fmtUzs(d.revenue),
          `${d.marginPct}%`,
          `${d.abcClass} · ${d.quadrant}`,
        ]),
      });
    }

    if (needExpenses) {
      const builtPriority = buildPriorityExpenseBlocks({
        lang,
        periodLabel,
        fromStr,
        toStr,
        overview: analysis.overview,
        expenses: toolState.expensesPeriod,
        requestedCategories: intents.requestedCategories,
      });
      for (const blk of builtPriority.blocks) {
        if (!uiBlocks.some(b => b.id === blk.id)) {
          uiBlocks.push(blk);
        }
      }
      if (!suggestedActions.some(a => a.type === 'navigate' && a.tab === 'expenses')) {
        suggestedActions.push({
          type: 'navigate',
          tab: 'expenses',
          label:
            lang === 'uz'
              ? 'Xarajatlar bo‘limini ochish'
              : lang === 'ru'
                ? 'Открыть журнал расходов'
                : 'Open Expenses Tab',
        });
      }
    }

    if (uiBlocks.length === 0) {
      uiBlocks.push({
        id: 'blk-overview-kpis',
        kind: 'kpis',
        title: restaurantName,
        items: [
          { label: lang === 'uz' ? 'Tushum' : lang === 'ru' ? 'Выручка' : 'Revenue', value: fmtUzs(analysis.overview.revenue), tone: 'neutral' },
          { label: lang === 'uz' ? 'Xarajatlar' : lang === 'ru' ? 'Расходы' : 'Expenses', value: fmtUzs(analysis.overview.totalExpenses), tone: 'neutral' },
          { label: lang === 'uz' ? 'Sof foyda' : lang === 'ru' ? 'Чистая прибыль' : 'Net Profit', value: fmtUzs(analysis.overview.netProfit), tone: analysis.overview.netProfit >= 0 ? 'good' : 'bad' },
          { label: lang === 'uz' ? 'Tejamkorlik' : lang === 'ru' ? 'Потенциал экономии' : 'Savings Potential', value: fmtUzs(analysis.report.totalPotentialSavingUZS), tone: 'warn' },
        ],
      });
      if (analysis.overview.categoryBreakdown.length > 0) {
        uiBlocks.push({
          id: 'blk-overview-cats',
          kind: 'chart',
          chartType: 'horizontal_bar',
          title: lang === 'uz' ? 'Xarajatlar tarkibi' : lang === 'ru' ? 'Структура расходов' : 'Expense Structure',
          items: analysis.overview.categoryBreakdown.slice(0, 6).map(c => ({
            label: categoryLabel(c.category, lang),
            value: c.amount,
          })),
        });
      }
    }
  }

  if (intents.isUnpinWidget) {
    const unpinAct: AgentClientAction = {
      type: 'unpin_widget',
      clearAll: true,
      label:
        lang === 'uz'
          ? "Biriktirilgan vidjetlarni o'chirish"
          : lang === 'ru'
            ? 'Очистить закреплённые виджеты'
            : 'Clear Pinned Widgets',
    };
    autoActions.push(unpinAct);
    suggestedActions.push(unpinAct);
    dashboardControlNotice ??= {
      ru: `Закреплённые виджеты на главном дашборде «${restaurantName}» очищены.`,
      uz: `«${restaurantName}» asosiy panelidagi biriktirilgan vidjetlar tozalandi.`,
      en: `Cleared pinned widgets on ${restaurantName} main dashboard.`,
    };
  } else if (intents.isPinWidget && uiBlocks[0]) {
    const pinBlock = uiBlocks.find(b => b.kind === 'chart' || b.kind === 'map' || b.kind === 'table') ?? uiBlocks[0];
    const pinAct: AgentClientAction = {
      type: 'pin_widget',
      block: pinBlock,
      label:
        lang === 'uz'
          ? 'Vidjetni Dashboardga biriktirish'
          : lang === 'ru'
            ? 'Закрепить виджет на главном дашборде'
            : 'Pin Widget to Main Dashboard',
    };
    autoActions.push(pinAct);
    suggestedActions.push(pinAct);
    dashboardControlNotice ??= {
      ru: `Виджет закреплён на главном дашборде «${restaurantName}» (выручка ${fmtUzs(analysis.overview.revenue)}).`,
      uz: `Vidjet «${restaurantName}» asosiy paneliga biriktirildi (tushum ${fmtUzs(analysis.overview.revenue)}).`,
      en: `Pinned widget to ${restaurantName} main dashboard (revenue ${fmtUzs(analysis.overview.revenue)}).`,
    };
  }

  const deterministic =
    dashboardControlNotice ??
    buildDeterministicAgentAnswer({
      lang,
      restaurantName,
      analysis,
      prioritySummary,
      fromStr,
      toStr,
      parsedPeriod,
      expenses: toolState.expensesPeriod,
      isExpenseQuery: needExpenses,
      isSales: effectiveIsSales,
      geoData: intents.isMap || !toolState.auditTriggered ? geoData : null,
      varianceData,
      branchData,
      scenarioData,
      customDashboardTitle: intents.isCreateDashboard
        ? (autoActions.find(a => a.type === 'create_dashboard') as { title?: string } | undefined)?.title
        : undefined,
      screenSummaryText: intents.isScreenQuestion ? params.screenContext?.summaryText : undefined,
    });

  const finalResult: AgentChatResponse = {
    requestId,
    model: usedModel,
    source,
    answer: dashboardControlNotice ? { ...(llmAnswer ?? deterministic), ...dashboardControlNotice } : (llmAnswer ?? deterministic),
    uiBlocks,
    autoActions,
    suggestedActions,
    toolTraces: traces,
    relatedFindingCodes: [...relatedFindingCodes],
  };

  if (chatCacheKey) {
    if (agentChatCache.size >= 120) agentChatCache.clear();
    agentChatCache.set(chatCacheKey, { expiresAt: Date.now() + AGENT_CHAT_CACHE_TTL_MS, value: finalResult });
  }
  return finalResult;
}

export function buildDeterministicAgentAnswer(params: {
  lang: Language;
  restaurantName: string;
  analysis: BusinessAnalysisResponse;
  prioritySummary?: PriorityExpenseSummary;
  fromStr?: string;
  toStr?: string;
  parsedPeriod?: ParsedDatePeriod | null;
  expenses?: AnalysisExpenseInput[];
  isExpenseQuery?: boolean;
  isSales?: boolean;
  geoData: DistrictGeoAnalysisResponse | null;
  varianceData: BudgetVarianceItem[] | null;
  branchData: BranchAllocationResponse | null;
  scenarioData: MacroScenarioResult | null;
  customDashboardTitle?: string;
  screenSummaryText?: string;
}): Record<Language, string> {
  const {
    restaurantName,
    analysis,
    prioritySummary: providedPriority,
    fromStr: providedFrom,
    toStr: providedTo,
    parsedPeriod,
    expenses,
    isExpenseQuery,
    isSales,
    geoData,
    varianceData,
    branchData,
    scenarioData,
    customDashboardTitle,
    screenSummaryText,
  } = params;

  const fromStr = providedFrom ?? parsedPeriod?.from ?? analysis.overview.period.from.slice(0, 10);
  const toStr = providedTo ?? parsedPeriod?.to ?? analysis.overview.period.to.slice(0, 10);
  const isoRange = fromStr === toStr ? fromStr : `${fromStr} – ${toStr}`;
  const periodRu = parsedPeriod ? `${parsedPeriod.label.ru} (${isoRange})` : `${formatDateRangeLabel(fromStr, toStr, 'ru')} (${isoRange})`;
  const periodUz = parsedPeriod ? `${parsedPeriod.label.uz} (${isoRange})` : `${formatDateRangeLabel(fromStr, toStr, 'uz')} (${isoRange})`;
  const periodEn = parsedPeriod ? `${parsedPeriod.label.en} (${isoRange})` : `${formatDateRangeLabel(fromStr, toStr, 'en')} (${isoRange})`;
  const prio = providedPriority ?? computePriorityExpenseSummary({ overview: analysis.overview, expenses });
  const kwhRu = prio.electricityKwh > 0 ? ` (${Math.round(prio.electricityKwh).toLocaleString('ru-RU')} кВт·ч)` : '';
  const kwhUz = prio.electricityKwh > 0 ? ` (${Math.round(prio.electricityKwh).toLocaleString('ru-RU')} kVt·soat)` : '';
  const kwhEn = prio.electricityKwh > 0 ? ` (${Math.round(prio.electricityKwh).toLocaleString('ru-RU')} kWh)` : '';

  if (customDashboardTitle) {
    return {
      ru: `Создан кастомный дашборд «${customDashboardTitle}» на основе проверенных данных по «${restaurantName}» за ${periodRu} (выручка ${fmtUzs(analysis.overview.revenue)}, расходы ${fmtUzs(analysis.overview.totalExpenses)}).`,
      uz: `«${restaurantName}» ma’lumotlari asosida ${periodUz} uchun «${customDashboardTitle}» maxsus paneli yaratildi (tushum ${fmtUzs(analysis.overview.revenue)}, xarajatlar ${fmtUzs(analysis.overview.totalExpenses)}).`,
      en: `Created custom dashboard "${customDashboardTitle}" grounded in ${restaurantName} data for ${periodEn} (revenue ${fmtUzs(analysis.overview.revenue)}, expenses ${fmtUzs(analysis.overview.totalExpenses)}).`,
    };
  }
  if (screenSummaryText) {
    return {
      ru: `На текущем экране «${restaurantName}» (${periodRu}): ${screenSummaryText} Выручка: ${fmtUzs(analysis.overview.revenue)}, чистая прибыль: ${fmtUzs(analysis.overview.netProfit)}.`,
      uz: `Joriy ekranda («${restaurantName}», ${periodUz}): ${screenSummaryText} Tushum: ${fmtUzs(analysis.overview.revenue)}, sof foyda: ${fmtUzs(analysis.overview.netProfit)}.`,
      en: `On the current screen (${restaurantName}, ${periodEn}): ${screenSummaryText} Revenue: ${fmtUzs(analysis.overview.revenue)}, net profit: ${fmtUzs(analysis.overview.netProfit)}.`,
    };
  }
  if (geoData && geoData.topDistrict) {
    const top = geoData.topDistrict;
    const second = geoData.districts[1];
    const loss = geoData.lossMakingDeliveryDistricts;
    return {
      ru: `Период: ${periodRu}. Больше всего заказов приходит из района ${top.name.ru} (${top.orders} заказов, ${top.sharePct}%, выручка ${fmtUzs(top.revenue)})${second ? ` и ${second.name.ru} (${second.orders} заказов, ${second.sharePct}%)` : ''}. ${loss.length > 0 ? `Убыточная доставка зафиксирована в ${loss.map(d => d.name.ru).join(', ')} из-за высокого плеча доставки.` : 'Доставка по ключевым районам рентабельна.'}`,
      uz: `Davr: ${periodUz}. Eng ko‘p buyurtma ${top.name.uz} tumanidan kelmoqda (${top.orders} ta, ${top.sharePct}%, tushum ${fmtUzs(top.revenue)})${second ? ` va ${second.name.uz} (${second.orders} ta, ${second.sharePct}%)` : ''}. ${loss.length > 0 ? `Yetkazish xarajati yuqori bo‘lgan hududlar: ${loss.map(d => d.name.uz).join(', ')}.` : 'Yetkazish marjasi ijobiy.'}`,
      en: `Period: ${periodEn}. Most client orders come from ${top.name.en} (${top.orders} orders, ${top.sharePct}%, ${fmtUzs(top.revenue)})${second ? ` and ${second.name.en} (${second.orders} orders, ${second.sharePct}%)` : ''}. ${loss.length > 0 ? `Loss-making delivery detected in ${loss.map(d => d.name.en).join(', ')}.` : 'Delivery margins are healthy.'}`,
    };
  }
  if (branchData) {
    const topB = branchData.branches[0];
    return {
      ru: `Пул ${fmtUzs(branchData.totalBudget)} перераспределён между ${branchData.branches.length} филиалами. Лидер по эффективности — ${topB?.name ?? ''} (ROI ${topB?.roiPct ?? 0}%, оценка ${topB?.efficiencyScore ?? 0}/100). Ожидаемый эффект оптимизации: +${fmtUzs(branchData.expectedTotalProfitLift)}.`,
      uz: `${fmtUzs(branchData.totalBudget)} byudjet ${branchData.branches.length} ta filial o‘rtasida taqsimlandi. Eng samarali filial — ${topB?.name ?? ''} (ROI ${topB?.roiPct ?? 0}%). Kutilayotgan qo‘shimcha foyda: +${fmtUzs(branchData.expectedTotalProfitLift)}.`,
      en: `Allocated ${fmtUzs(branchData.totalBudget)} across ${branchData.branches.length} branches. Top efficiency branch: ${topB?.name ?? ''} (ROI ${topB?.roiPct ?? 0}%). Expected optimization lift: +${fmtUzs(branchData.expectedTotalProfitLift)}.`,
    };
  }
  if (varianceData && varianceData.length > 0) {
    const risks = varianceData.filter(v => v.riskLevel === 'CRITICAL' || v.riskLevel === 'HIGH');
    const first = risks[0] ?? varianceData[0]!;
    return {
      ru: `Период: ${periodRu}. По контролю бюджета (Кейс #25): ${risks.length} категорий в зоне риска. Главный риск — ${categoryLabel(first.category, 'ru')}: факт ${fmtUzs(first.actual)} при лимите ${fmtUzs(first.limit)}, прогноз ${fmtUzs(first.forecast)}.`,
      uz: `Davr: ${periodUz}. Byudjet nazorati (Keys #25): ${risks.length} ta toifa xavf zonasida. Asosiy xavf — ${categoryLabel(first.category, 'uz')}: fakt ${fmtUzs(first.actual)}, limit ${fmtUzs(first.limit)}, prognoz ${fmtUzs(first.forecast)}.`,
      en: `Period: ${periodEn}. Budget Control (Case #25): ${risks.length} categories at risk. Primary driver is ${categoryLabel(first.category, 'en')}: actual ${fmtUzs(first.actual)} vs limit ${fmtUzs(first.limit)}, forecast ${fmtUzs(first.forecast)}.`,
    };
  }
  if (scenarioData) {
    const a = scenarioData.assumptions;
    return {
      ru: `Сценарий (свет ${a.utilityTariffPct}%, сырьё ${a.foodInflationPct}%, аренда ${a.rentChangePct}%, заказы ${a.orderVolumeChangePct}%): прибыль изменится с ${fmtUzs(scenarioData.baseline.netProfit)} до ${fmtUzs(scenarioData.projected.netProfit)} (${fmtUzs(scenarioData.projected.profitDelta)}).`,
      uz: `Ssenariy (elektr ${a.utilityTariffPct}%, masalliq ${a.foodInflationPct}%, ijara ${a.rentChangePct}%, buyurtma ${a.orderVolumeChangePct}%): foyda ${fmtUzs(scenarioData.baseline.netProfit)} dan ${fmtUzs(scenarioData.projected.netProfit)} gacha o‘zgaradi (${fmtUzs(scenarioData.projected.profitDelta)}).`,
      en: `Scenario (util ${a.utilityTariffPct}%, food ${a.foodInflationPct}%, rent ${a.rentChangePct}%, orders ${a.orderVolumeChangePct}%): net profit shifts from ${fmtUzs(scenarioData.baseline.netProfit)} to ${fmtUzs(scenarioData.projected.netProfit)} (${fmtUzs(scenarioData.projected.profitDelta)}).`,
    };
  }
  if (isSales && analysis.dishes && analysis.dishes.length > 0) {
    const topDish = analysis.dishes[0]!;
    const secondDish = analysis.dishes[1];
    const dogs = analysis.dishes.filter(d => d.quadrant === 'DOG' || d.marginPct < 0).length;
    return {
      ru: `Период: ${periodRu}. По продажам и меню «${restaurantName}»: выручка ${fmtUzs(analysis.overview.revenue)}, Food Cost ${analysis.overview.foodCostPct.toFixed(1)}%. Лидер — «${topDish.name}» (${topDish.quantitySold} порц., ${fmtUzs(topDish.revenue)}, маржа ${topDish.marginPct}%)${secondDish ? `, далее «${secondDish.name}» (${fmtUzs(secondDish.revenue)})` : ''}. ${dogs > 0 ? `Позиций в зоне пересмотра (DOG/низкая маржа): ${dogs}.` : 'Все ключевые позиции меню рентабельны.'}`,
      uz: `Davr: ${periodUz}. «${restaurantName}» savdo va menyu tahlili: tushum ${fmtUzs(analysis.overview.revenue)}, Food Cost ${analysis.overview.foodCostPct.toFixed(1)}%. Yetakchi taom — «${topDish.name}» (${topDish.quantitySold} dona, ${fmtUzs(topDish.revenue)}, marja ${topDish.marginPct}%)${secondDish ? `, keyingi «${secondDish.name}» (${fmtUzs(secondDish.revenue)})` : ''}. ${dogs > 0 ? `Qayta ko‘rib chiqish kerak bo‘lgan pozitsiyalar: ${dogs} ta.` : 'Menyuning asosiy taomlari foydali.'}`,
      en: `Period: ${periodEn}. ${restaurantName} sales & menu engineering: revenue ${fmtUzs(analysis.overview.revenue)}, Food Cost ${analysis.overview.foodCostPct.toFixed(1)}%. Top dish is "${topDish.name}" (${topDish.quantitySold} sold, ${fmtUzs(topDish.revenue)}, ${topDish.marginPct}% margin)${secondDish ? `, followed by "${secondDish.name}" (${fmtUzs(secondDish.revenue)})` : ''}. ${dogs > 0 ? `${dogs} menu items need pricing or cost review.` : 'Core menu margins are healthy.'}`,
    };
  }
  if (isExpenseQuery || parsedPeriod) {
    const itemCount = expenses?.length ?? 0;
    const topItemNoteRu = itemCount > 0 ? ` Проведено ${itemCount} позиций.` : ' За указанный период записей расходов не найдено.';
    const topItemNoteUz = itemCount > 0 ? ` Jami ${itemCount} ta xarajat yozuvi.` : ' Ko‘rsatilgan davr uchun xarajat yozuvlari topilmadi.';
    const topItemNoteEn = itemCount > 0 ? ` Recorded ${itemCount} expense entries.` : ' No expense entries logged for this period.';
    return {
      ru: `Период: ${periodRu}. По «${restaurantName}» расходы составили ${fmtUzs(prio.totalExpenses)} (выручка ${fmtUzs(analysis.overview.revenue)}). Приоритет: налоги ${fmtUzs(prio.taxesTotal)} (${prio.taxesPctOfRevenue}% выручки), электричество и коммунальные ${fmtUzs(prio.utilitiesTotal)}${kwhRu}. Базовые расходы: ${fmtUzs(prio.baseTotal)}; дополнительные: ${fmtUzs(prio.additionalTotal)}.${topItemNoteRu}`,
      uz: `Davr: ${periodUz}. «${restaurantName}» bo‘yicha xarajatlar ${fmtUzs(prio.totalExpenses)} (tushum ${fmtUzs(analysis.overview.revenue)}). Ustuvor: soliqlar ${fmtUzs(prio.taxesTotal)} (tushumning ${prio.taxesPctOfRevenue}%), elektr va kommunal ${fmtUzs(prio.utilitiesTotal)}${kwhUz}. Asosiy xarajatlar: ${fmtUzs(prio.baseTotal)}; qo‘shimcha: ${fmtUzs(prio.additionalTotal)}.${topItemNoteUz}`,
      en: `Period: ${periodEn}. ${restaurantName} expenses totaled ${fmtUzs(prio.totalExpenses)} (revenue ${fmtUzs(analysis.overview.revenue)}). Priority: Taxes ${fmtUzs(prio.taxesTotal)} (${prio.taxesPctOfRevenue}% of revenue), Electricity & Utilities ${fmtUzs(prio.utilitiesTotal)}${kwhEn}. Base costs: ${fmtUzs(prio.baseTotal)}; Additional: ${fmtUzs(prio.additionalTotal)}.${topItemNoteEn}`,
    };
  }
  const saving = calculateDeduplicatedSavings(analysis.findings);
  return {
    ru: `Период: ${periodRu}. Анализ «${restaurantName}»: выручка ${fmtUzs(analysis.overview.revenue)}, расходы ${fmtUzs(analysis.overview.totalExpenses)} (налоги ${fmtUzs(prio.taxesTotal)}, свет и ком. ${fmtUzs(prio.utilitiesTotal)}), чистая прибыль ${fmtUzs(analysis.overview.netProfit)}. Найдено ${analysis.findings.length} аномалий с потенциалом экономии ${fmtUzs(saving)}.`,
    uz: `Davr: ${periodUz}. «${restaurantName}» tahlili: tushum ${fmtUzs(analysis.overview.revenue)}, xarajatlar ${fmtUzs(analysis.overview.totalExpenses)} (soliqlar ${fmtUzs(prio.taxesTotal)}, elektr/kom. ${fmtUzs(prio.utilitiesTotal)}), sof foyda ${fmtUzs(analysis.overview.netProfit)}. ${analysis.findings.length} ta muammo va ${fmtUzs(saving)} tejamkorlik aniqlandi.`,
    en: `Period: ${periodEn}. ${restaurantName}: revenue ${fmtUzs(analysis.overview.revenue)}, expenses ${fmtUzs(analysis.overview.totalExpenses)} (Taxes ${fmtUzs(prio.taxesTotal)}, Utilities ${fmtUzs(prio.utilitiesTotal)}), net profit ${fmtUzs(analysis.overview.netProfit)}. Found ${analysis.findings.length} anomalies with ${fmtUzs(saving)} potential savings.`,
  };
}
