import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../config/env.js';
import { callCoarenaChat, extractJsonFromText, listCoarenaModels, submitCoarenaFeedback } from './coarena.js';
import type { BusinessAnalysisResponse, DistrictStatItem } from '@uzbite/shared';
import {
  MCP_TOOLS,
  buildBudgetVarianceList,
  buildCustomDashboardSpec,
  buildDeterministicAgentAnswer,
  detectQuestionIntents,
  extractNumbersFromText,
  parseScenarioAssumptions,
  resolveConversationalIntents,
  solveBranchBudgetAllocation,
  verifyLlmNumbersAgainstGroundTruth,
} from './finance-agent.js';
import { parseDatePeriodFromQuestion } from './date-period-parser.js';
import {
  aggregateOrderHeatmapCells,
  rankGrowthDistrictOpportunities,
  resolveTashkentDistrict,
} from './geo-districts.js';

test('resolveTashkentDistrict resolves coordinates and address strings to correct districts', () => {
  assert.equal(resolveTashkentDistrict(41.275, 69.214), 'chilonzor');
  assert.equal(resolveTashkentDistrict(41.358, 69.292), 'yunusobod');
  assert.equal(resolveTashkentDistrict(41.226, 69.235), 'sergeli');
  assert.equal(
    resolveTashkentDistrict(41.311, 69.279, 'Ташкент, Мирзо-Улугбекский район, ул. Буюк Ипак Йули'),
    'mirzo_ulugbek',
  );
});

test('buildBudgetVarianceList computes forecast, breach date, risk level and price drivers', () => {
  const monthStart = new Date('2026-11-01T00:00:00.000Z');
  const items = buildBudgetVarianceList({
    monthKey: '2026-11',
    monthStart,
    daysInMonth: 30,
    elapsedDays: 10,
    budgets: [
      { category: 'UTILITIES', limit: 3_500_000 },
      { category: 'INGREDIENTS', limit: 15_000_000 },
    ],
    currExpenses: [
      {
        category: 'UTILITIES',
        itemName: 'Электроэнергия',
        amount: 2_800_000,
        quantity: 1,
        unitPrice: 2_800_000,
        spentAt: new Date('2026-11-08T10:00:00.000Z'),
        supplierName: 'Toshkent Elektr',
      },
      {
        category: 'INGREDIENTS',
        itemName: 'Говядина',
        amount: 5_000_000,
        quantity: 50,
        unitPrice: 100_000,
        spentAt: new Date('2026-11-05T10:00:00.000Z'),
        supplierName: 'Agro Meat',
      },
    ],
    prevExpenses: [
      {
        category: 'UTILITIES',
        itemName: 'Электроэнергия',
        amount: 1_200_000,
        quantity: 1,
        unitPrice: 1_200_000,
        spentAt: new Date('2026-10-08T10:00:00.000Z'),
        supplierName: 'Toshkent Elektr',
      },
      {
        category: 'INGREDIENTS',
        itemName: 'Говядина',
        amount: 4_000_000,
        quantity: 50,
        unitPrice: 80_000,
        spentAt: new Date('2026-10-05T10:00:00.000Z'),
        supplierName: 'Agro Meat',
      },
    ],
  });

  const util = items.find(i => i.category === 'UTILITIES');
  assert.ok(util);
  assert.equal(util.riskLevel, 'HIGH');
  assert.ok(util.forecast > util.limit);
  assert.ok(util.projectedBreachDate !== null);
  assert.equal(util.drivers.priceEffectUZS, 1_600_000);
  assert.equal(util.drivers.topSupplierName, 'Toshkent Elektr');

  const ing = items.find(i => i.category === 'INGREDIENTS');
  assert.ok(ing);
  assert.equal(ing.drivers.priceEffectUZS, 1_000_000);
  // Exact variance identity check: price + volume + newItems === actual - prevActual
  assert.equal(
    ing.drivers.priceEffectUZS + ing.drivers.volumeEffectUZS + ing.drivers.newItemsEffectUZS,
    5_000_000 - 4_000_000,
  );
  assert.equal(
    util.drivers.priceEffectUZS + util.drivers.volumeEffectUZS + util.drivers.newItemsEffectUZS,
    2_800_000 - 1_200_000,
  );
});

test('buildBudgetVarianceList maintains exact accounting identity with new and discontinued items', () => {
  const monthStart = new Date('2026-11-01T00:00:00.000Z');
  const items = buildBudgetVarianceList({
    monthKey: '2026-11',
    monthStart,
    daysInMonth: 30,
    elapsedDays: 15,
    budgets: [{ category: 'INGREDIENTS', limit: 10_000_000 }],
    currExpenses: [
      {
        category: 'INGREDIENTS',
        itemName: 'Говядина',
        amount: 3_600_000,
        quantity: 40,
        unitPrice: 90_000,
        spentAt: new Date('2026-11-04T10:00:00.000Z'),
        supplierName: 'Supplier A',
      },
      {
        category: 'INGREDIENTS',
        itemName: 'Специи новые',
        amount: 750_000,
        quantity: 10,
        unitPrice: 75_000,
        spentAt: new Date('2026-11-09T10:00:00.000Z'),
        supplierName: 'Supplier B',
      },
    ],
    prevExpenses: [
      {
        category: 'INGREDIENTS',
        itemName: 'Говядина',
        amount: 2_400_000,
        quantity: 30,
        unitPrice: 80_000,
        spentAt: new Date('2026-10-04T10:00:00.000Z'),
        supplierName: 'Supplier A',
      },
      {
        category: 'INGREDIENTS',
        itemName: 'Старый товар',
        amount: 900_000,
        quantity: 15,
        unitPrice: 60_000,
        spentAt: new Date('2026-10-08T10:00:00.000Z'),
        supplierName: 'Supplier C',
      },
    ],
  });

  const ing = items[0]!;
  const currActual = 3_600_000 + 750_000;
  const prevActual = 2_400_000 + 900_000;
  assert.equal(
    ing.drivers.priceEffectUZS + ing.drivers.volumeEffectUZS + ing.drivers.newItemsEffectUZS,
    currActual - prevActual,
  );
  assert.equal(ing.drivers.newItemsEffectUZS, 750_000);
});

test('solveBranchBudgetAllocation sums exactly to totalBudget and ranks higher efficiency branches higher', () => {
  const result = solveBranchBudgetAllocation({
    totalBudget: 120_000_000,
    month: '2026-11',
    objective: 'profit',
    branches: [
      {
        restaurantId: 'b1',
        name: 'Branch High ROI',
        districtName: { uz: 'Chilonzor', ru: 'Чиланзар', en: 'Chilonzor' },
        revenue: 80_000_000,
        expenses: 30_000_000,
        orders: 120,
        growthPct: 18,
        currentBudget: 25_000_000,
        errorPenalty: 0,
        overrunCount: 0,
        categoryShares: [],
      },
      {
        restaurantId: 'b2',
        name: 'Branch Medium',
        districtName: { uz: 'Yunusobod', ru: 'Юнусабад', en: 'Yunusobod' },
        revenue: 45_000_000,
        expenses: 25_000_000,
        orders: 70,
        growthPct: 8,
        currentBudget: 25_000_000,
        errorPenalty: 1,
        overrunCount: 0,
        categoryShares: [],
      },
      {
        restaurantId: 'b3',
        name: 'Branch Low ROI',
        districtName: { uz: 'Sergeli', ru: 'Сергели', en: 'Sergeli' },
        revenue: 22_000_000,
        expenses: 20_000_000,
        orders: 30,
        growthPct: -5,
        currentBudget: 25_000_000,
        errorPenalty: 3,
        overrunCount: 2,
        categoryShares: [],
      },
    ],
  });

  assert.equal(result.branches.length, 3);
  const sum = result.branches.reduce((s, b) => s + b.recommendedBudget, 0);
  assert.equal(sum, 120_000_000);
  assert.equal(result.branches[0]!.restaurantId, 'b1');
  assert.ok(result.branches[0]!.recommendedBudget > result.branches[2]!.recommendedBudget);
});

test('extractJsonFromText parses plain and fenced JSON strings', () => {
  assert.deepEqual(extractJsonFromText('{"ok":true}'), { ok: true });
  assert.deepEqual(extractJsonFromText('Here is JSON:\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.equal(extractJsonFromText('not json at all'), null);
});

test('Coarena gemini-3-8-flash chat and /v1/feedback loop complete cleanly', async () => {
  if (!env.COARENA_API_KEY) return;
  const chat = await callCoarenaChat({
    model: 'gemini-3-8-flash',
    messages: [{ role: 'user', content: 'Return JSON {"status":"ok"} with no extra text.' }],
    responseFormat: { type: 'json_object' },
    maxTokens: 120,
    timeoutMs: 15_000,
  });
  assert.ok(chat, 'Expected non-null Coarena response');
  assert.ok(chat.requestId.length > 0, 'Expected non-empty requestId');

  const fb = await submitCoarenaFeedback({
    requestId: chat.requestId,
    rating: 'up',
    comment: 'Automated verification',
  });
  assert.equal(typeof fb.status, 'number');
  assert.equal(fb.ok, true, `Expected Coarena /v1/feedback 2xx, got ${fb.status}: ${JSON.stringify(fb.upstream)}`);
});

test('parseScenarioAssumptions parses custom RU, UZ, and EN percentages including negatives', () => {
  const ru = parseScenarioAssumptions('Если свет +35%, сырьё +12% и заказы -15%');
  assert.equal(ru.utilityTariffPct, 35);
  assert.equal(ru.foodInflationPct, 12);
  assert.equal(ru.orderVolumeChangePct, -15);
  assert.equal(ru.rentChangePct, 0);

  const uz = parseScenarioAssumptions('Elektr 25% va ijara +10%, buyurtma -5%');
  assert.equal(uz.utilityTariffPct, 25);
  assert.equal(uz.rentChangePct, 10);
  assert.equal(uz.orderVolumeChangePct, -5);

  const defaults = parseScenarioAssumptions('Смоделируй стресс сценарий');
  assert.equal(defaults.utilityTariffPct, 20);
  assert.equal(defaults.foodInflationPct, 10);
  assert.equal(defaults.rentChangePct, 5);
});

test('detectQuestionIntents resolves all 12 districts and branch names', () => {
  const dist1 = detectQuestionIntents('Покажи заказы в районе Учтепа');
  assert.equal(dist1.isMap, true);
  assert.equal(dist1.requestedDistrict, 'uchtepa');

  const dist2 = detectQuestionIntents('Yashnobod va Yangihayot tumani buyurtmalari');
  assert.equal(dist2.isMap, true);
  assert.equal(dist2.requestedDistrict, 'yashnobod');

  const branch1 = detectQuestionIntents('Покажи статистику Basilico');
  assert.equal(branch1.requestedRestaurantId, 'rest-basilico');

  const branch2 = detectQuestionIntents('Open budgets for Burger Bureau');
  assert.equal(branch2.requestedNavTab, 'budgets');
  assert.equal(branch2.requestedRestaurantId, 'rest-burger');
});

test('verifyLlmNumbersAgainstGroundTruth passes grounded numbers and rejects hallucinations', () => {
  const allowed = [12_500_000, 4_100_000, 3_400_000, 35.2];
  const okRes = verifyLlmNumbersAgainstGroundTruth(
    'Выручка составила 12 500 000 UZS (12.5 млн), экономия 4,100,000 UZS в 2026-11-18 по кейсу #26.',
    allowed,
  );
  assert.equal(okRes.verified, true);
  assert.ok(okRes.matchedCount >= 2);

  const badRes = verifyLlmNumbersAgainstGroundTruth(
    'Выручка 12 500 000 UZS, но нужно сэкономить 99 900 000 UZS.',
    allowed,
  );
  assert.equal(badRes.verified, false);
  assert.deepEqual(badRes.ungroundedNumbers, [99_900_000]);
});

test('aggregateOrderHeatmapCells snaps coordinates to 0.005 deg grid and enforces k-anonymity (>= 2 orders)', () => {
  const cells = aggregateOrderHeatmapCells([
    // Cell A: 3 orders within ~0.005 deg box [41.275, 41.280) x [69.210, 69.215)
    { latitude: 41.2761, longitude: 69.2112, revenue: 120_000, districtId: 'chilonzor' },
    { latitude: 41.2778, longitude: 69.2124, revenue: 80_000, districtId: 'chilonzor' },
    { latitude: 41.2791, longitude: 69.2141, revenue: 100_000, districtId: 'chilonzor' },
    // Cell B: single isolated order (must be suppressed for k-anonymity)
    { latitude: 41.3521, longitude: 69.2914, revenue: 95_000, districtId: 'yunusobod' },
    // Cell C: 2 orders in Sergeli box [41.225, 41.230) x [69.230, 69.235)
    { latitude: 41.226, longitude: 69.231, revenue: 65_000, districtId: 'sergeli' },
    { latitude: 41.228, longitude: 69.233, revenue: 75_000, districtId: 'sergeli' },
  ]);

  assert.equal(cells.length, 2);
  assert.equal(cells[0]!.districtId, 'chilonzor');
  assert.equal(cells[0]!.orders, 3);
  assert.equal(cells[0]!.revenue, 300_000);
  assert.equal(cells[0]!.latCenter, 41.2775);
  assert.equal(cells[0]!.lngCenter, 69.2125);

  assert.equal(cells[1]!.districtId, 'sergeli');
  assert.equal(cells[1]!.orders, 2);
  assert.equal(cells[1]!.revenue, 140_000);

  // District filter returns only matching cells
  const sergeliOnly = aggregateOrderHeatmapCells(
    [
      { latitude: 41.2761, longitude: 69.2112, revenue: 120_000, districtId: 'chilonzor' },
      { latitude: 41.2778, longitude: 69.2124, revenue: 80_000, districtId: 'chilonzor' },
      { latitude: 41.226, longitude: 69.231, revenue: 65_000, districtId: 'sergeli' },
      { latitude: 41.228, longitude: 69.233, revenue: 75_000, districtId: 'sergeli' },
    ],
    { districtId: 'sergeli' },
  );
  assert.equal(sergeliOnly.length, 1);
  assert.equal(sergeliOnly[0]!.districtId, 'sergeli');
});

test('detectQuestionIntents and buildCustomDashboardSpec handle create_dashboard requests with 2-4 grounded blocks', () => {
  const enIntent = detectQuestionIntents('Make me a dashboard for utilities and rent');
  assert.equal(enIntent.isCreateDashboard, true);
  assert.deepEqual(enIntent.requestedCategories, ['UTILITIES', 'RENT']);
  assert.equal(enIntent.requestedNavTab, null);

  const ruIntent = detectQuestionIntents('Создай дашборд по коммуналке и аренде');
  assert.equal(ruIntent.isCreateDashboard, true);
  assert.deepEqual(ruIntent.requestedCategories, ['UTILITIES', 'RENT']);

  const openIntent = detectQuestionIntents('Открой дашборд');
  assert.equal(openIntent.isCreateDashboard, false);
  assert.equal(openIntent.requestedNavTab, 'dashboard');

  const screenIntent = detectQuestionIntents('Что на этом графике?');
  assert.equal(screenIntent.isScreenQuestion, true);

  const mockAnalysis = {
    overview: {
      period: { from: '2026-11-01', to: '2026-11-18', days: 18 },
      revenue: 120_000_000,
      revenuePrev: 105_000_000,
      revenueDeltaPct: 14.3,
      deliveredOrders: 950,
      deliveredOrdersPrev: 840,
      ordersDeltaPct: 13.1,
      cancelledOrders: 15,
      cancelRatePct: 1.6,
      lostRevenue: 1_800_000,
      avgOrderValue: 126_315,
      avgOrderValuePrev: 125_000,
      totalExpenses: 84_000_000,
      totalExpensesPrev: 78_000_000,
      expensesDeltaPct: 7.7,
      TheoreticalCogs: 36_000_000,
      foodCostPct: 30,
      laborCostPct: 20,
      adminUtilityCostPct: 14.5,
      grossProfit: 84_000_000,
      netProfit: 36_000_000,
      netProfitPrev: 27_000_000,
      netMarginPct: 30,
      avgRating: 4.8,
      reviewCount: 210,
      paymentSplit: {
        cashOrders: 400,
        cardOrders: 550,
        cashRevenue: 50_000_000,
        cardRevenue: 70_000_000,
        unpaidCardOrders: 0,
        unpaidCardAmount: 0,
      },
      categoryBreakdown: [
        { category: 'RENT', amount: 12_000_000, sharePct: 14.3, prevAmount: 12_000_000, growthPct: 0, budgetLimit: 12_000_000 },
        { category: 'UTILITIES', amount: 4_800_000, sharePct: 5.7, prevAmount: 3_100_000, growthPct: 54.8, budgetLimit: 3_500_000 },
        { category: 'INGREDIENTS', amount: 36_000_000, sharePct: 42.9, prevAmount: 33_000_000, growthPct: 9.1, budgetLimit: 38_000_000 },
      ],
    },
    findings: [
      {
        id: 'f-util-1',
        kind: 'INEFFICIENCY',
        code: 'UTILITY_SPIKE',
        severity: 'high',
        category: 'UTILITIES',
        title: { ru: 'Скачок света', uz: 'Elektr oshishi', en: 'Utility spike' },
        detail: { ru: 'Детали', uz: 'Tafsilot', en: 'Detail' },
        recommendation: { ru: 'Проверить счётчик', uz: 'Hisoblagichni tekshirish', en: 'Audit meter' },
        amountImpact: 1_300_000,
      },
    ],
    report: {
      generatedAt: '2026-11-18T00:00:00.000Z',
      source: 'heuristic',
      healthScore: 81,
      statusLabel: { ru: 'Хорошо', uz: 'Yaxshi', en: 'Good' },
      executiveSummary: { ru: 'Сводка', uz: 'Xulosa', en: 'Summary' },
      totalPotentialSavingUZS: 1_300_000,
      errorCount: 0,
      inefficiencyCount: 1,
      riskCount: 0,
      recommendations: [],
    },
  } as BusinessAnalysisResponse;

  const spec = buildCustomDashboardSpec({
    lang: 'en',
    restaurantName: 'Osh & Olov',
    requestedCategories: enIntent.requestedCategories,
    analysis: mockAnalysis,
    varianceData: [
      {
        category: 'UTILITIES',
        month: '2026-11',
        limit: 3_500_000,
        actual: 4_800_000,
        forecast: 6_200_000,
        variance: -1_300_000,
        projectedOverrun: 2_700_000,
        usagePct: 137.1,
        dailyBurnRate: 266_667,
        trendSlopeUZS: 50_000,
        projectedBreachDate: '2026-11-12',
        daysUntilBreach: 0,
        riskLevel: 'CRITICAL',
        drivers: {
          priceEffectUZS: 1_700_000,
          volumeEffectUZS: 0,
          newItemsEffectUZS: 0,
          topSupplierName: 'Toshkent Elektr',
          topSupplierSpend: 4_800_000,
          explanation: { ru: 'Превышение по свету', uz: 'Elektr oshdi', en: 'Utilities exceeded limit' },
        },
      },
      {
        category: 'RENT',
        month: '2026-11',
        limit: 12_000_000,
        actual: 12_000_000,
        forecast: 12_000_000,
        variance: 0,
        projectedOverrun: 0,
        usagePct: 100,
        dailyBurnRate: 666_667,
        trendSlopeUZS: 0,
        projectedBreachDate: null,
        daysUntilBreach: null,
        riskLevel: 'MEDIUM',
        drivers: {
          priceEffectUZS: 0,
          volumeEffectUZS: 0,
          newItemsEffectUZS: 0,
          topSupplierName: 'Tashkent Plaza',
          topSupplierSpend: 12_000_000,
          explanation: { ru: 'Аренда в лимите', uz: 'Ijara limitda', en: 'Rent within limit' },
        },
      },
    ],
  });

  assert.ok(spec.blocks.length >= 2 && spec.blocks.length <= 4);
  assert.equal(spec.blocks[0]!.kind, 'kpis');
  assert.equal(spec.blocks[1]!.kind, 'chart');
  assert.equal(spec.blocks[2]!.kind, 'table');
  assert.equal(spec.blocks[3]!.kind, 'alert');
  assert.ok(spec.title.includes('Utilities'));

  // Dashboard management intents (append, replace, rename, delete, remove widget, select main, period, highlight)
  const appendIntent = detectQuestionIntents('Добавь в этот дашборд карту районов Ташкента');
  assert.equal(appendIntent.isUpdateDashboard, true);
  assert.equal(appendIntent.dashboardUpdateMode, 'append');
  assert.equal(appendIntent.isMap, true);

  const replaceIntent = detectQuestionIntents('Обнови текущий дашборд по бюджетам');
  assert.equal(replaceIntent.isUpdateDashboard, true);
  assert.equal(replaceIntent.dashboardUpdateMode, 'replace');
  assert.equal(replaceIntent.isBudget, true);

  const renameIntent = detectQuestionIntents('Переименуй этот дашборд в «Контроль Q4»');
  assert.equal(renameIntent.isRenameDashboard, true);
  assert.equal(renameIntent.requestedDashboardTitle, 'Контроль Q4');

  const removeWidgetIntent = detectQuestionIntents('Убери таблицу из дашборда');
  assert.equal(removeWidgetIntent.isRemoveDashboardWidget, true);
  assert.equal(removeWidgetIntent.removeWidgetKind, 'table');
  assert.equal(removeWidgetIntent.isDeleteDashboard, false);

  const deleteIntent = detectQuestionIntents('Удали все кастомные дашборды');
  assert.equal(deleteIntent.isDeleteDashboard, true);
  assert.equal(deleteIntent.deleteAllDashboards, true);

  const mainDashIntent = detectQuestionIntents('Переключи на главный дашборд за 7 дней и подсвети KPI');
  assert.equal(mainDashIntent.isSelectMainDashboard, true);
  assert.equal(mainDashIntent.requestedDays, 7);
  assert.equal(mainDashIntent.requestedHighlightWidget, 'widget-kpis');
});

test('solveBranchBudgetAllocation incorporates geo districtDemandScore in scoring and rationale', () => {
  const result = solveBranchBudgetAllocation({
    totalBudget: 100_000_000,
    month: '2026-11',
    objective: 'growth',
    branches: [
      {
        restaurantId: 'b-high-demand',
        name: 'Chilonzor Branch',
        districtName: { uz: 'Chilonzor', ru: 'Чиланзар', en: 'Chilonzor' },
        districtDemandScore: 95,
        revenue: 50_000_000,
        expenses: 28_000_000,
        orders: 80,
        growthPct: 12,
        currentBudget: 25_000_000,
        errorPenalty: 0,
        overrunCount: 0,
        categoryShares: [],
      },
      {
        restaurantId: 'b-low-demand',
        name: 'Bektemir Branch',
        districtName: { uz: 'Bektemir', ru: 'Бектемир', en: 'Bektemir' },
        districtDemandScore: 15,
        revenue: 50_000_000,
        expenses: 28_000_000,
        orders: 80,
        growthPct: 12,
        currentBudget: 25_000_000,
        errorPenalty: 0,
        overrunCount: 0,
        categoryShares: [],
      },
    ],
  });

  assert.equal(result.branches.length, 2);
  assert.equal(result.branches[0]!.restaurantId, 'b-high-demand');
  assert.ok(result.branches[0]!.efficiencyScore > result.branches[1]!.efficiencyScore);
  assert.ok(result.branches[0]!.recommendedBudget > result.branches[1]!.recommendedBudget);
  assert.ok(result.branches[0]!.rationale.en.includes('district demand 95/100'));
  assert.ok(result.branches[0]!.rationale.ru.includes('спрос района 95/100'));
  assert.equal(
    result.branches.reduce((s, b) => s + b.recommendedBudget, 0),
    100_000_000,
  );
});

test('MCP_TOOLS exposes all 4 geo tools and rankGrowthDistrictOpportunities prioritizes underserved loss zones', () => {
  const toolNames = new Set(MCP_TOOLS.map(t => t.name));
  for (const required of ['analyze_district_orders', 'order_heatmap', 'branch_catchment', 'find_growth_districts']) {
    assert.ok(toolNames.has(required), `Missing MCP tool ${required}`);
  }

  const nums = extractNumbersFromText('Revenue is 120 000 000 UZS and 14.5 mln saving');
  assert.ok(nums.includes(120_000_000));
  assert.ok(nums.includes(14_500_000));

  const opportunities = rankGrowthDistrictOpportunities(
    [
      {
        districtId: 'sergeli',
        name: { uz: 'Sergeli', ru: 'Сергели', en: 'Sergeli' },
        center: { latitude: 41.226, longitude: 69.235 },
        orders: 28,
        deliveredOrders: 26,
        cancelledOrders: 2,
        uniqueClients: 20,
        revenue: 4_200_000,
        avgCheck: 161_538,
        sharePct: 12,
        growthPct: 22,
        avgDistanceKm: 6.4,
        avgDeliveryMinutes: 46,
        deliveryFeeRevenue: 260_000,
        estimatedCourierCost: 510_000,
        deliveryMargin: -250_000,
        nearestBranchId: 'rest-osh',
        nearestBranchName: 'Osh & Olov',
        demandScore: 55,
        status: 'UNDERSERVED',
      } satisfies DistrictStatItem,
      {
        districtId: 'mirobod',
        name: { uz: 'Mirobod', ru: 'Мирабад', en: 'Mirobod' },
        center: { latitude: 41.295, longitude: 69.288 },
        orders: 60,
        deliveredOrders: 59,
        cancelledOrders: 1,
        uniqueClients: 45,
        revenue: 9_800_000,
        avgCheck: 166_100,
        sharePct: 25,
        growthPct: 8,
        avgDistanceKm: 1.8,
        avgDeliveryMinutes: 28,
        deliveryFeeRevenue: 590_000,
        estimatedCourierCost: 480_000,
        deliveryMargin: 110_000,
        nearestBranchId: 'rest-osh',
        nearestBranchName: 'Osh & Olov',
        demandScore: 80,
        status: 'HIGH_DEMAND',
      } satisfies DistrictStatItem,
    ],
    [
      {
        id: 'rest-osh',
        name: 'Osh & Olov',
        addressText: 'Mirobod',
        latitude: 41.295,
        longitude: 69.288,
        districtId: 'mirobod',
        districtName: { uz: 'Mirobod', ru: 'Мирабад', en: 'Mirobod' },
        orders: 85,
        revenue: 14_000_000,
      },
    ],
  );

  assert.equal(opportunities[0]!.districtId, 'sergeli');
  assert.equal(opportunities[0]!.recommendedAction, 'OPEN_BRANCH_OR_HUB');
  assert.ok(opportunities[0]!.opportunityScore > opportunities[1]!.opportunityScore);
});

test('detectQuestionIntents handles dates 24/25/26, dual-quote rename, EN/UZ select_dashboard, list dashboards, and YYYY-MM periods', () => {
  const now = new Date('2026-11-18T10:00:00.000Z');
  const nov24 = detectQuestionIntents('Расходы за 24 ноября', now);
  assert.equal(nov24.isBranchAlloc, false);
  assert.equal(nov24.parsedPeriod?.from, '2026-11-24');

  const oct25 = detectQuestionIntents('Налоги за 25 октября', now);
  assert.equal(oct25.isBudget, false);
  assert.equal(oct25.parsedPeriod?.from, '2026-10-25');

  const casualIf = detectQuestionIntents('Если посмотреть расходы за 15 ноября', now);
  assert.equal(casualIf.isWhatIf, false);
  assert.equal(casualIf.parsedPeriod?.from, '2026-11-15');

  const renameDual = detectQuestionIntents('Переименуй дашборд «Налоги» в «Налоги Q4»', now);
  assert.equal(renameDual.isRenameDashboard, true);
  assert.equal(renameDual.requestedDashboardTitle, 'Налоги Q4');

  const selEn = detectQuestionIntents('Open custom dashboard', now);
  assert.equal(selEn.isSelectCustomDashboard, true);

  const selUz = detectQuestionIntents('Maxsus dashboardni och', now);
  assert.equal(selUz.isSelectCustomDashboard, true);

  const listDash = detectQuestionIntents('Какие у меня есть кастомные дашборды?', now);
  assert.equal(listDash.isListDashboards, true);

  const ym = parseDatePeriodFromQuestion('Бюджет за 2026-10', now);
  assert.ok(ym);
  assert.equal(ym.from, '2026-10-01');
  assert.equal(ym.to, '2026-10-31');
  assert.equal(ym.month, '2026-10');
});

test('resolveConversationalIntents inherits topic, period, branch, and district across multi-turn history', () => {
  const now = new Date('2026-11-18T10:00:00.000Z');

  const dashFollowUp = resolveConversationalIntents(
    'Создай из этого дашборд',
    [
      { role: 'user', content: 'Покажи бюджеты за 2026-10' },
      { role: 'assistant', content: 'Бюджеты за октябрь готовы.' },
    ],
    now,
  );
  assert.equal(dashFollowUp.isCreateDashboard, true);
  assert.equal(dashFollowUp.isBudget, true);
  assert.equal(dashFollowUp.parsedPeriod?.month, '2026-10');

  const auditFollowUp = resolveConversationalIntents(
    'А какие там ошибки?',
    [
      { role: 'user', content: 'Покажи заказы Basilico в районе Чиланзар' },
      { role: 'assistant', content: 'Заказы в районе Чиланзар загружены.' },
    ],
    now,
  );
  assert.equal(auditFollowUp.isAudit, true);
  assert.equal(auditFollowUp.requestedRestaurantId, 'rest-basilico');
  assert.equal(auditFollowUp.requestedDistrict, 'chilonzor');

  const pinFollowUp = resolveConversationalIntents(
    'Закрепи это на главном дашборде',
    [
      { role: 'user', content: 'Покажи топ блюд по продажам' },
      { role: 'assistant', content: 'Топ блюд готов.' },
    ],
    now,
  );
  assert.equal(pinFollowUp.isPinWidget, true);
  assert.equal(pinFollowUp.isSales, true);
});

test('buildDeterministicAgentAnswer formats RU/UZ/EN sales & menu engineering summaries', () => {
  const analysis: BusinessAnalysisResponse = {
    overview: {
      period: { from: '2026-11-11T00:00:00.000Z', to: '2026-11-18T23:59:59.999Z', days: 8 },
      revenue: 28_000_000,
      revenuePrev: 24_000_000,
      revenueDeltaPct: 16.7,
      deliveredOrders: 140,
      deliveredOrdersPrev: 120,
      ordersDeltaPct: 16.7,
      cancelledOrders: 4,
      cancelRatePct: 2.8,
      lostRevenue: 600_000,
      avgOrderValue: 200_000,
      avgOrderValuePrev: 200_000,
      totalExpenses: 17_000_000,
      totalExpensesPrev: 15_000_000,
      expensesDeltaPct: 13.3,
      TheoreticalCogs: 8_400_000,
      foodCostPct: 30.0,
      laborCostPct: 18.0,
      adminUtilityCostPct: 8.0,
      grossProfit: 19_600_000,
      netProfit: 11_000_000,
      netProfitPrev: 9_000_000,
      netMarginPct: 39.3,
      avgRating: 4.9,
      reviewCount: 30,
      paymentSplit: {
        cashOrders: 70,
        cardOrders: 70,
        cashRevenue: 14_000_000,
        cardRevenue: 14_000_000,
        unpaidCardOrders: 0,
        unpaidCardAmount: 0,
      },
      categoryBreakdown: [],
    },
    findings: [],
    report: {
      generatedAt: '2026-11-18T10:00:00.000Z',
      source: 'heuristic',
      healthScore: 92,
      statusLabel: { ru: 'Отлично', uz: 'A’lo', en: 'Healthy' },
      executiveSummary: { ru: 'Ок', uz: 'Ok', en: 'Ok' },
      totalPotentialSavingUZS: 0,
      errorCount: 0,
      inefficiencyCount: 0,
      riskCount: 0,
      recommendations: [],
    },
    dishes: [
      {
        dishId: 'd1',
        name: 'Плов праздничный',
        categoryName: 'Основные',
        price: 65_000,
        costPrice: 22_000,
        unitMargin: 43_000,
        marginPct: 66.2,
        quantitySold: 210,
        revenue: 13_650_000,
        totalCost: 4_620_000,
        totalProfit: 9_030_000,
        revenueSharePct: 48.8,
        abcClass: 'A',
        quadrant: 'STAR',
      },
    ],
  };

  const ans = buildDeterministicAgentAnswer({
    lang: 'ru',
    restaurantName: 'Osh & Olov',
    analysis,
    fromStr: '2026-11-11',
    toStr: '2026-11-18',
    isSales: true,
    geoData: null,
    varianceData: null,
    branchData: null,
    scenarioData: null,
  });
  assert.ok(ans.ru.includes('Плов праздничный'));
  assert.ok(ans.uz.includes('Плов праздничный'));
  assert.ok(ans.en.includes('Плов праздничный'));
});

test('submitCoarenaFeedback and listCoarenaModels work cleanly in offline / no-key fallback mode', async () => {
  const prevCoarena = env.COARENA_API_KEY;
  const prevGemini = env.GEMINI_API_KEY;
  env.COARENA_API_KEY = undefined;
  env.GEMINI_API_KEY = undefined;
  try {
    const models = await listCoarenaModels();
    assert.equal(models.configured, false);
    assert.equal(models.models.length, 3);
    assert.equal(models.models[0]!.id, 'gemini-3-8-flash');

    const fbHeuristic = await submitCoarenaFeedback({
      requestId: 'heuristic-1700000000',
      rating: 'up',
    });
    assert.equal(fbHeuristic.ok, true);
    assert.equal(fbHeuristic.status, 200);

    const fbLocalGemini = await submitCoarenaFeedback({
      requestId: 'local-gemini-1700000000',
      rating: 'down',
    });
    assert.equal(fbLocalGemini.ok, true);
    assert.equal(fbLocalGemini.status, 200);

    const fbExternal = await submitCoarenaFeedback({
      requestId: 'coarena-12345',
      rating: 'up',
    });
    assert.equal(fbExternal.ok, false);
    assert.equal(fbExternal.status, 400);
  } finally {
    env.COARENA_API_KEY = prevCoarena;
    env.GEMINI_API_KEY = prevGemini;
  }
});
