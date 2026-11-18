import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentClientAction, BusinessKpiOverview, ExpenseCategory } from '@uzbite/shared';
import {
  analyzeFinancialData,
  buildHeuristicOptimizationReport,
  calculateDeduplicatedSavings,
  classifyExpenseText,
  coefficientOfVariation,
  computePriorityExpenseSummary,
  getExpensePriorityTier,
  linearRegressionSlope,
  mad,
  modifiedZScore,
  stddev,
  theilSenSlope,
  type AnalysisEngineInput,
  type AnalysisExpenseInput,
} from './finance-analysis.js';
import { resolveDateRange } from './business-analytics.js';
import { parseDatePeriodFromQuestion } from './date-period-parser.js';
import {
  buildDeterministicAgentAnswer,
  buildPriorityExpenseBlocks,
  detectQuestionIntents,
} from './finance-agent.js';
import {
  answerFinancialQuestion,
  extractInvoiceDraftFromTextOrImage,
  parseReceiptNumber,
} from './ai-advisor.js';
import { env } from '../config/env.js';

function makeBaseOverview(overrides: Partial<BusinessKpiOverview> = {}): BusinessKpiOverview {
  return {
    period: { from: '2026-10-18T00:00:00.000Z', to: '2026-11-17T23:59:59.999Z', days: 30 },
    revenue: 20_000_000,
    revenuePrev: 18_000_000,
    revenueDeltaPct: 11.1,
    deliveredOrders: 80,
    deliveredOrdersPrev: 72,
    ordersDeltaPct: 11.1,
    cancelledOrders: 12,
    cancelRatePct: 13.0,
    lostRevenue: 2_500_000,
    avgOrderValue: 250_000,
    avgOrderValuePrev: 250_000,
    totalExpenses: 17_000_000,
    totalExpensesPrev: 13_000_000,
    expensesDeltaPct: 30.8,
    TheoreticalCogs: 7_000_000,
    foodCostPct: 42.0,
    laborCostPct: 32.5,
    adminUtilityCostPct: 24.0,
    grossProfit: 13_000_000,
    netProfit: 3_000_000,
    netProfitPrev: 5_000_000,
    netMarginPct: 15.0,
    avgRating: 4.8,
    reviewCount: 10,
    paymentSplit: {
      cashOrders: 40,
      cardOrders: 40,
      cashRevenue: 10_000_000,
      cardRevenue: 10_000_000,
      unpaidCardOrders: 2,
      unpaidCardAmount: 500_000,
    },
    categoryBreakdown: [
      { category: 'INGREDIENTS', amount: 8_400_000, sharePct: 49.4, prevAmount: 5_500_000, growthPct: 52.7, budgetLimit: 10_000_000 },
      { category: 'SALARY', amount: 6_500_000, sharePct: 38.2, prevAmount: 5_000_000, growthPct: 30.0, budgetLimit: 6_000_000 },
      { category: 'UTILITIES', amount: 2_100_000, sharePct: 12.4, prevAmount: 1_000_000, growthPct: 110.0, budgetLimit: 1_500_000 },
    ],
    ...overrides,
  };
}

test('classifyExpenseText accurately classifies RU, UZ, and EN operational expenses', () => {
  const cases: Array<[string, ExpenseCategory]> = [
    ['Оплата электроэнергии РЭС и трансформатора', 'UTILITIES'],
    ['Аренда кухонного зала на месяц', 'RENT'],
    ['Korporativ internet va aloqa Uztelecom', 'COMMUNICATION'],
    ['Fresh beef meat 40 kg', 'INGREDIENTS'],
    ['Крафт ланч-боксы и стаканы', 'PACKAGING'],
    ['Зарплата поваров и аванс', 'SALARY'],
    ['Реклама и таргет Instagram', 'MARKETING'],
  ];
  for (const [text, expected] of cases) {
    const result = classifyExpenseText(text);
    assert.equal(result.category, expected, `Expected ${expected} for "${text}", got ${result.category}`);
    assert.ok(result.confidence >= 0.65);
  }
});

test('analyzeFinancialData detects all Item 26 errors, inefficiencies, and risks', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');
  const periodStart = new Date('2026-10-18T00:00:00.000Z');
  const periodEnd = new Date('2026-11-17T23:59:59.999Z');

  const expensesPeriod: AnalysisEngineInput['expensesPeriod'] = [
    // Duplicate invoice
    {
      id: 'e-dup-1', supplierId: 'sup-1', supplierName: 'Meat Co', category: 'INGREDIENTS',
      itemName: 'Говядина', description: 'Говядина 50 кг', amount: 4_000_000,
      quantity: 50, unit: 'кг', unitPrice: 80_000, invoiceNumber: 'INV-100',
      spentAt: new Date('2026-11-10T10:00:00.000Z'),
    },
    {
      id: 'e-dup-2', supplierId: 'sup-1', supplierName: 'Meat Co', category: 'INGREDIENTS',
      itemName: 'Говядина', description: 'Повтор INV-100', amount: 4_000_000,
      quantity: 50, unit: 'кг', unitPrice: 80_000, invoiceNumber: 'INV-100',
      spentAt: new Date('2026-11-11T10:00:00.000Z'),
    },
    // Cheaper supplier exists for Говядина
    {
      id: 'e-exp-sup', supplierId: 'sup-2', supplierName: 'Expensive Meat', category: 'INGREDIENTS',
      itemName: 'Говядина', description: 'Говядина дорого', amount: 4_800_000,
      quantity: 50, unit: 'кг', unitPrice: 96_000, invoiceNumber: 'EXP-1',
      spentAt: new Date('2026-11-12T10:00:00.000Z'),
    },
    // Amount mismatch + price spike
    {
      id: 'e-rice-latest', supplierId: 'sup-3', supplierName: 'Rice Base', category: 'INGREDIENTS',
      itemName: 'Рис Лазер', description: 'Рис 100 кг', amount: 3_400_000,
      quantity: 100, unit: 'кг', unitPrice: 28_000, invoiceNumber: 'RICE-4',
      spentAt: new Date('2026-11-14T10:00:00.000Z'),
    },
    // Utilities baseline + statistical outlier
    {
      id: 'e-u-4', supplierId: 'sup-4', supplierName: 'Power Grid', category: 'UTILITIES',
      itemName: 'Электроэнергия', description: 'Свет', amount: 900_000,
      quantity: null, unit: null, unitPrice: null, invoiceNumber: 'U-4',
      spentAt: new Date('2026-11-01T10:00:00.000Z'),
    },
    {
      id: 'e-u-outlier', supplierId: 'sup-4', supplierName: 'Power Grid', category: 'UTILITIES',
      itemName: 'Электроэнергия', description: 'Свет аномалия', amount: 9_800_000,
      quantity: null, unit: null, unitPrice: null, invoiceNumber: 'U-ERR',
      spentAt: new Date('2026-11-15T10:00:00.000Z'),
    },
    // Category mismatch
    {
      id: 'e-cat-err', supplierId: 'sup-4', supplierName: 'Power Grid', category: 'MARKETING',
      itemName: 'Счёт РЭС', description: 'Оплата электроэнергии РЭС', amount: 1_200_000,
      quantity: null, unit: null, unitPrice: null, invoiceNumber: 'RES-1',
      spentAt: new Date('2026-11-12T10:00:00.000Z'),
    },
    // Future date
    {
      id: 'e-future', supplierId: null, supplierName: null, category: 'PACKAGING',
      itemName: 'Коробки', description: 'Упаковка', amount: 500_000,
      quantity: null, unit: null, unitPrice: null, invoiceNumber: 'FUT-1',
      spentAt: new Date('2026-11-25T10:00:00.000Z'),
    },
  ];

  const historical90d: AnalysisEngineInput['expensesAll90d'] = [
    ...expensesPeriod,
    {
      id: 'e-rice-1', supplierId: 'sup-3', supplierName: 'Rice Base', category: 'INGREDIENTS',
      itemName: 'Рис Лазер', description: 'Рис', amount: 1_760_000,
      quantity: 80, unit: 'кг', unitPrice: 22_000, invoiceNumber: 'RICE-1',
      spentAt: new Date('2026-09-20T10:00:00.000Z'),
    },
    {
      id: 'e-rice-2', supplierId: 'sup-3', supplierName: 'Rice Base', category: 'INGREDIENTS',
      itemName: 'Рис Лазер', description: 'Рис', amount: 1_760_000,
      quantity: 80, unit: 'кг', unitPrice: 22_000, invoiceNumber: 'RICE-2',
      spentAt: new Date('2026-10-05T10:00:00.000Z'),
    },
    {
      id: 'e-u-1', supplierId: 'sup-4', supplierName: 'Power Grid', category: 'UTILITIES',
      itemName: 'Электроэнергия', description: 'Свет', amount: 880_000,
      quantity: null, unit: null, unitPrice: null, invoiceNumber: 'U-1',
      spentAt: new Date('2026-09-20T10:00:00.000Z'),
    },
    {
      id: 'e-u-2', supplierId: 'sup-4', supplierName: 'Power Grid', category: 'UTILITIES',
      itemName: 'Электроэнергия', description: 'Свет', amount: 910_000,
      quantity: null, unit: null, unitPrice: null, invoiceNumber: 'U-2',
      spentAt: new Date('2026-10-01T10:00:00.000Z'),
    },
    {
      id: 'e-u-3', supplierId: 'sup-4', supplierName: 'Power Grid', category: 'UTILITIES',
      itemName: 'Электроэнергия', description: 'Свет', amount: 895_000,
      quantity: null, unit: null, unitPrice: null, invoiceNumber: 'U-3',
      spentAt: new Date('2026-10-12T10:00:00.000Z'),
    },
  ];

  const expensesPrevPeriod: AnalysisEngineInput['expensesPrevPeriod'] = [
    {
      id: 'e-prev-u', supplierId: 'sup-4', supplierName: 'Power Grid', category: 'UTILITIES',
      itemName: 'Свет', description: 'Свет прошлый период', amount: 1_800_000,
      quantity: null, unit: null, unitPrice: null, invoiceNumber: 'UPREV',
      spentAt: new Date('2026-10-01T10:00:00.000Z'),
    },
  ];

  const overview = makeBaseOverview();
  const findings = analyzeFinancialData({
    now,
    restaurantCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
    periodStart,
    periodEnd,
    expensesPeriod,
    expensesAll90d: historical90d,
    expensesPrevPeriod,
    overview,
    ordersPeriod: [
      {
        id: 'o-unpaid',
        total: 250_000,
        subtotal: 238_000,
        status: 'DELIVERED',
        createdAt: new Date('2026-11-10T12:00:00.000Z'),
        paymentMethod: 'CARD',
        paymentStatus: 'AWAITING_CONFIRMATION',
      },
    ],
    dishes: [
      {
        dishId: 'd-neg', name: 'Ачичук', price: 18_000, costPrice: 19_500,
        quantitySold: 20, revenue: 360_000, totalProfit: -30_000, revenueSharePct: 3, abcClass: 'C',
      },
      {
        dishId: 'd-low', name: 'Компот', price: 10_000, costPrice: 8_200,
        quantitySold: 10, revenue: 100_000, totalProfit: 18_000, revenueSharePct: 1, abcClass: 'C',
      },
    ],
    budgets: [
      {
        id: 'b-1', category: 'UTILITIES', month: new Date('2026-11-01T00:00:00.000Z'),
        limit: 3_500_000, actual: 10_700_000, forecast: 18_800_000,
      },
      {
        id: 'b-2', category: 'INGREDIENTS', month: new Date('2026-11-01T00:00:00.000Z'),
        limit: 15_000_000, actual: 12_000_000, forecast: 21_000_000,
      },
    ],
  });

  const codes = new Set(findings.map(f => f.code));
  const expectedCodes = [
    'DUPLICATE_INVOICE',
    'AMOUNT_MISMATCH',
    'AMOUNT_OUTLIER',
    'CATEGORY_MISMATCH',
    'FUTURE_OR_INVALID_DATE',
    'UNPAID_DELIVERED_ORDERS',
    'NEGATIVE_MARGIN_DISH',
    'HIGH_FOOD_COST',
    'HIGH_LABOR_COST',
    'ADMIN_UTILITY_SPIKE',
    'SUPPLIER_PRICE_SPIKE',
    'CHEAPER_SUPPLIER_EXISTS',
    'BUDGET_OVERRUN',
    'BUDGET_FORECAST_OVERRUN',
    'LOW_PERFORMING_DISHES',
    'HIGH_CANCELLATION',
  ];
  for (const code of expectedCodes) {
    assert.ok(codes.has(code), `Missing expected finding code: ${code}`);
  }

  const report = buildHeuristicOptimizationReport(overview, findings);
  assert.ok(report.healthScore >= 12 && report.healthScore < 100);
  assert.ok(report.totalPotentialSavingUZS > 0);
  assert.ok(report.errorCount >= 6);
  assert.ok(report.inefficiencyCount >= 5);
  assert.ok(report.riskCount >= 2);
  assert.ok(report.recommendations.length > 0);
  assert.ok(report.executiveSummary.ru.length > 10);
  assert.ok(report.executiveSummary.uz.length > 10);
  assert.ok(report.executiveSummary.en.length > 10);
});

test('classifyExpenseText respects word boundaries, meta-comment stripping, calibration, and Uzbek apostrophes', () => {
  assert.equal(classifyExpenseText('Покупка инвентаря в магазине').category, 'EQUIPMENT');
  assert.equal(classifyExpenseText('Чек в магазине за хозтовары').category, 'OTHER');
  assert.equal(classifyExpenseText('Газированные напитки 10 л').category, 'OTHER');
  assert.equal(classifyExpenseText('Юрист консультация').category, 'OTHER');
  assert.equal(classifyExpenseText('Go‘sht 20 kg').category, 'INGREDIENTS');
  assert.equal(classifyExpenseText('Yoqilg‘i benzin').category, 'DELIVERY');
  assert.equal(classifyExpenseText('Jihoz ta’mir').category, 'EQUIPMENT');

  const gasWater = classifyExpenseText('Счёт за газ и воду');
  assert.equal(gasWater.category, 'UTILITIES');
  assert.ok(gasWater.matchedKeywords.includes('газ'));
  assert.ok(gasWater.matchedKeywords.includes('воду'));
  assert.ok(gasWater.confidence >= 0.85);

  const singleUnambiguous = classifyExpenseText('Оплата интернета');
  assert.equal(singleUnambiguous.category, 'COMMUNICATION');
  assert.ok(singleUnambiguous.confidence >= 0.8);

  const rentUnambiguous = classifyExpenseText('Аренда зала');
  assert.equal(rentUnambiguous.category, 'RENT');
  assert.ok(rentUnambiguous.confidence >= 0.8);

  const ambiguous = classifyExpenseText('Интернет доставка');
  assert.ok(ambiguous.confidence < 0.78);

  const metaStripped = classifyExpenseText('Счёт РЭС за электроэнергию (ошибочно отнесено в Маркетинг)');
  assert.equal(metaStripped.category, 'UTILITIES');
  assert.ok(metaStripped.confidence >= 0.85);
});

test('statistical helpers, KITCHEN_COGS_VARIANCE, HIGH_PRIME_COST, and deduplicated savings work accurately', () => {
  // Sample stddev (Bessel's correction) and MAD / Modified Z-score
  assert.equal(Number(stddev([10, 12, 14]).toFixed(2)), 2);
  assert.equal(mad([880_000, 910_000, 895_000, 900_000]), 7500);
  assert.ok(modifiedZScore(9_800_000, [880_000, 910_000, 895_000, 900_000]) > 3.5);

  const now = new Date('2026-11-17T12:00:00.000Z');
  const periodStart = new Date('2026-10-18T00:00:00.000Z');
  const periodEnd = new Date('2026-11-17T23:59:59.999Z');

  // Theoretical COGS = 4M vs actual ingredients = 10M (> 1.35x and diff > 500k), Prime Cost = 16.5M / 20M = 82.5%
  const overview = makeBaseOverview({
    TheoreticalCogs: 4_000_000,
    foodCostPct: 50.0,
    categoryBreakdown: [
      { category: 'INGREDIENTS', amount: 10_000_000, sharePct: 55.0, prevAmount: 5_000_000, growthPct: 100.0, budgetLimit: 8_000_000 },
      { category: 'SALARY', amount: 6_500_000, sharePct: 35.7, prevAmount: 5_000_000, growthPct: 30.0, budgetLimit: 6_000_000 },
      { category: 'PACKAGING', amount: 1_700_000, sharePct: 9.3, prevAmount: 1_500_000, growthPct: 13.3, budgetLimit: null },
    ],
  });

  const findings = analyzeFinancialData({
    now,
    restaurantCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
    periodStart,
    periodEnd,
    expensesPeriod: [
      {
        id: 'exp-overlap',
        supplierId: 'sup-r',
        supplierName: 'Rice Base',
        category: 'INGREDIENTS',
        itemName: 'Рис Лазер',
        description: 'Рис 100 кг с ошибкой суммы',
        amount: 3_400_000,
        quantity: 100,
        unit: 'кг',
        unitPrice: 28_000,
        invoiceNumber: 'OV-1',
        spentAt: new Date('2026-11-14T10:00:00.000Z'),
      },
    ],
    expensesAll90d: [
      {
        id: 'exp-overlap',
        supplierId: 'sup-r',
        supplierName: 'Rice Base',
        category: 'INGREDIENTS',
        itemName: 'Рис Лазер',
        description: 'Рис 100 кг с ошибкой суммы',
        amount: 3_400_000,
        quantity: 100,
        unit: 'кг',
        unitPrice: 28_000,
        invoiceNumber: 'OV-1',
        spentAt: new Date('2026-11-14T10:00:00.000Z'),
      },
      {
        id: 'exp-r-1',
        supplierId: 'sup-r',
        supplierName: 'Rice Base',
        category: 'INGREDIENTS',
        itemName: 'Рис Лазер',
        description: 'Партия 1',
        amount: 1_760_000,
        quantity: 80,
        unit: 'кг',
        unitPrice: 22_000,
        invoiceNumber: 'OV-0',
        spentAt: new Date('2026-09-25T10:00:00.000Z'),
      },
      {
        id: 'exp-r-2',
        supplierId: 'sup-r',
        supplierName: 'Rice Base',
        category: 'INGREDIENTS',
        itemName: 'Рис Лазер',
        description: 'Партия 2',
        amount: 1_760_000,
        quantity: 80,
        unit: 'кг',
        unitPrice: 22_000,
        invoiceNumber: 'OV-0B',
        spentAt: new Date('2026-10-10T10:00:00.000Z'),
      },
    ],
    expensesPrevPeriod: [],
    overview,
    ordersPeriod: [],
    dishes: [],
    budgets: [],
  });

  const codes = new Set(findings.map(f => f.code));
  assert.ok(codes.has('KITCHEN_COGS_VARIANCE'));
  assert.ok(codes.has('HIGH_PRIME_COST'));

  // Overlapping findings on same expenseId ('exp-overlap' has both AMOUNT_MISMATCH 600k & SUPPLIER_PRICE_SPIKE 600k)
  // and nested INGREDIENTS / PRIME_COST findings must not double count.
  const dedupSample = calculateDeduplicatedSavings([
    findings.find(f => f.code === 'AMOUNT_MISMATCH')!,
    findings.find(f => f.code === 'SUPPLIER_PRICE_SPIKE')!,
  ]);
  assert.equal(dedupSample, 600_000);

  const report = buildHeuristicOptimizationReport(overview, findings);
  const rawSum = findings.reduce((s, f) => s + f.amountImpact, 0);
  assert.ok(report.totalPotentialSavingUZS < rawSum);
  assert.ok(report.totalPotentialSavingUZS > 0);
});

test('resolveDateRange computes exact calendar days and aligned previous windows', () => {
  const r30 = resolveDateRange('2026-10-19', '2026-11-17');
  assert.equal(r30.days, 30);
  assert.equal(r30.prevFrom.toISOString(), '2026-09-19T00:00:00.000Z');
  assert.equal(r30.prevTo.toISOString(), '2026-10-18T23:59:59.999Z');

  const r7 = resolveDateRange('2026-11-11', '2026-11-17');
  assert.equal(r7.days, 7);
  assert.equal(r7.prevFrom.toISOString(), '2026-11-04T00:00:00.000Z');
  assert.equal(r7.prevTo.toISOString(), '2026-11-10T23:59:59.999Z');

  const rDefault = resolveDateRange();
  assert.equal(rDefault.days, 30);
});

test('theilSenSlope resists extreme outliers and coefficientOfVariation measures dispersion', () => {
  const withOutlier = [100, 200, 300, 400, 100_000];
  assert.equal(theilSenSlope(withOutlier), 100);
  assert.ok(linearRegressionSlope(withOutlier) > 10_000);
  assert.ok(coefficientOfVariation([100, 200, 300]) > 0.4);
  assert.equal(coefficientOfVariation([500, 500, 500]), 0);
});

test('secondary duplicate check skips distinct invoices for distinct items', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');
  const periodStart = new Date('2026-10-18T00:00:00.000Z');
  const periodEnd = new Date('2026-11-17T23:59:59.999Z');
  const findings = analyzeFinancialData({
    now,
    restaurantCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
    periodStart,
    periodEnd,
    expensesPeriod: [
      {
        id: 'd-1', supplierId: 'sup-x', supplierName: 'Market Co', category: 'INGREDIENTS',
        itemName: 'Говядина', description: 'Поставка 1', amount: 1_000_000,
        quantity: null, unit: null, unitPrice: null, invoiceNumber: 'INV-A1',
        spentAt: new Date('2026-11-10T10:00:00.000Z'),
      },
      {
        id: 'd-2', supplierId: 'sup-x', supplierName: 'Market Co', category: 'INGREDIENTS',
        itemName: 'Рис Лазер', description: 'Поставка 2', amount: 1_000_000,
        quantity: null, unit: null, unitPrice: null, invoiceNumber: 'INV-B2',
        spentAt: new Date('2026-11-11T10:00:00.000Z'),
      },
    ],
    expensesAll90d: [
      {
        id: 'd-1', supplierId: 'sup-x', supplierName: 'Market Co', category: 'INGREDIENTS',
        itemName: 'Говядина', description: 'Поставка 1', amount: 1_000_000,
        quantity: null, unit: null, unitPrice: null, invoiceNumber: 'INV-A1',
        spentAt: new Date('2026-11-10T10:00:00.000Z'),
      },
      {
        id: 'd-2', supplierId: 'sup-x', supplierName: 'Market Co', category: 'INGREDIENTS',
        itemName: 'Рис Лазер', description: 'Поставка 2', amount: 1_000_000,
        quantity: null, unit: null, unitPrice: null, invoiceNumber: 'INV-B2',
        spentAt: new Date('2026-11-11T10:00:00.000Z'),
      },
    ],
    expensesPrevPeriod: [],
    overview: makeBaseOverview({ foodCostPct: 20, laborCostPct: 20, cancelRatePct: 2 }),
    ordersPeriod: [],
    dishes: [],
    budgets: [],
  });
  assert.equal(findings.some(f => f.code === 'DUPLICATE_INVOICE'), false);
});

test('extractInvoiceDraftFromTextOrImage and answerFinancialQuestion parse accurately and deduplicate savings', async () => {
  assert.equal(parseReceiptNumber('1 480 000'), 1480000);
  assert.equal(parseReceiptNumber('1,480,000'), 1480000);
  assert.equal(parseReceiptNumber('1.480.000'), 1480000);
  assert.equal(parseReceiptNumber('12,5'), 12.5);

  const prevKey = env.GEMINI_API_KEY;
  const prevCoarenaKey = env.COARENA_API_KEY;
  env.GEMINI_API_KEY = undefined;
  env.COARENA_API_KEY = undefined;
  try {
    const draft1 = await extractInvoiceDraftFromTextOrImage({
      rawText: 'Поставщик: Chorvoq Go\'sht\nНакладная № CG-402\nДата: 2026-11-15\nГовядина мякоть\n30 кг x 82 000\nТел: 998901234567',
    });
    assert.equal(draft1.invoiceNumber, 'CG-402');
    assert.equal(draft1.quantity, 30);
    assert.equal(draft1.unitPrice, 82000);
    assert.equal(draft1.amount, 2460000);

    const draft2 = await extractInvoiceDraftFromTextOrImage({
      rawText: 'Поставщик: Toshkent Elektr\nСчёт за электроэнергию\n№ EL-2026-77\nИтого: 1 480 000 UZS',
    });
    assert.equal(draft2.invoiceNumber, 'EL-2026-77');
    assert.equal(draft2.amount, 1480000);
    assert.equal(draft2.category, 'UTILITIES');

    const overview = makeBaseOverview();
    const findings = analyzeFinancialData({
      now: new Date('2026-11-17T12:00:00.000Z'),
      restaurantCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      periodStart: new Date('2026-10-18T00:00:00.000Z'),
      periodEnd: new Date('2026-11-17T23:59:59.999Z'),
      expensesPeriod: [],
      expensesAll90d: [],
      expensesPrevPeriod: [],
      overview,
      ordersPeriod: [],
      dishes: [],
      budgets: [],
    });
    const report = buildHeuristicOptimizationReport(overview, findings);
    const chat = await answerFinancialQuestion({
      question: 'Общий итог за период?',
      restaurantName: 'Osh & Olov',
      overview,
      findings,
    });
    assert.equal(chat.source, 'heuristic');
    assert.ok(
      chat.highlights.some(h => h.includes(Math.round(report.totalPotentialSavingUZS).toLocaleString('ru-RU'))),
      'Q&A Potential Savings must match deduplicated report.totalPotentialSavingUZS',
    );
  } finally {
    env.GEMINI_API_KEY = prevKey;
    env.COARENA_API_KEY = prevCoarenaKey;
  }
});

test('parseDatePeriodFromQuestion parses RU/UZ/EN single dates, ranges, weeks, months, and relative periods', () => {
  const now = new Date('2026-11-18T09:00:00.000Z'); // Wednesday

  // Single calendar dates -> inclusive single-day range
  for (const q of [
    'Расходы за 15 ноября',
    '15 ноября',
    '15.11',
    '15.11.2026',
    '2026-11-15',
    '15 noyabr',
    'Nov 15',
  ]) {
    const res = parseDatePeriodFromQuestion(q, now);
    assert.ok(res, `Expected parsed period for "${q}"`);
    assert.equal(res.from, '2026-11-15', `from mismatch for "${q}"`);
    assert.equal(res.to, '2026-11-15', `to mismatch for "${q}"`);
    assert.equal(res.fromIso, '2026-11-15T00:00:00.000Z');
    assert.equal(res.toIso, '2026-11-15T23:59:59.999Z');
    assert.equal(res.days, 1);
  }

  // Date ranges
  for (const q of [
    'с 10 по 15 ноября',
    '10-15 ноября',
    '10–15 noyabr',
    'Nov 10 to Nov 15',
  ]) {
    const res = parseDatePeriodFromQuestion(q, now);
    assert.ok(res, `Expected parsed range for "${q}"`);
    assert.equal(res.from, '2026-11-10', `from mismatch for "${q}"`);
    assert.equal(res.to, '2026-11-15', `to mismatch for "${q}"`);
    assert.equal(res.days, 6);
  }

  // Relative single days
  assert.equal(parseDatePeriodFromQuestion('Расходы за сегодня', now)?.from, '2026-11-18');
  assert.equal(parseDatePeriodFromQuestion('Расходы за вчера', now)?.from, '2026-11-17');
  assert.equal(parseDatePeriodFromQuestion('Позавчера расходы', now)?.from, '2026-11-16');

  // Previous calendar week (Mon-Sun: 2026-11-09 .. 2026-11-15)
  for (const q of [
    'Налоги и электричество за прошлую неделю',
    'прошлая неделя',
    "o'tgan hafta",
    'last week',
  ]) {
    const res = parseDatePeriodFromQuestion(q, now);
    assert.ok(res, `Expected previous week for "${q}"`);
    assert.equal(res.from, '2026-11-09');
    assert.equal(res.to, '2026-11-15');
    assert.equal(res.days, 7);
    assert.equal(res.kind, 'week');
  }

  // Current week (Mon 2026-11-16 .. Wed 2026-11-18)
  const thisWeek = parseDatePeriodFromQuestion('за эту неделю', now);
  assert.equal(thisWeek?.from, '2026-11-16');
  assert.equal(thisWeek?.to, '2026-11-18');

  // Last N days
  const last5 = parseDatePeriodFromQuestion('за последние 5 дней', now);
  assert.equal(last5?.from, '2026-11-14');
  assert.equal(last5?.to, '2026-11-18');
  assert.equal(last5?.days, 5);

  // Relative & named months
  const prevMonth = parseDatePeriodFromQuestion('за прошлый месяц', now);
  assert.equal(prevMonth?.from, '2026-10-01');
  assert.equal(prevMonth?.to, '2026-10-31');

  const oct = parseDatePeriodFromQuestion('Расходы в октябре', now);
  assert.equal(oct?.from, '2026-10-01');
  assert.equal(oct?.to, '2026-10-31');

  const nov = parseDatePeriodFromQuestion('Расходы в ноябре', now);
  assert.equal(nov?.from, '2026-11-01');
  assert.equal(nov?.to, '2026-11-18');

  // Year rollover in January
  const janNow = new Date('2027-01-10T09:00:00.000Z');
  assert.equal(parseDatePeriodFromQuestion('Расходы за 15 ноября', janNow)?.from, '2026-11-15');

  // Guard against false English "may" modal match
  assert.equal(parseDatePeriodFromQuestion('What may happen with costs?', now), null);
});

test('priority tax/electricity classification, analytics summary, and AI period response blocks work end-to-end', async () => {
  assert.equal(getExpensePriorityTier('TAXES'), 'PRIORITY');
  assert.equal(getExpensePriorityTier('UTILITIES'), 'PRIORITY');
  assert.equal(getExpensePriorityTier('COMMUNICATION'), 'PRIORITY');
  assert.equal(getExpensePriorityTier('INGREDIENTS'), 'BASE');
  assert.equal(getExpensePriorityTier('SALARY'), 'BASE');
  assert.equal(getExpensePriorityTier('RENT'), 'BASE');
  assert.equal(getExpensePriorityTier('PACKAGING'), 'ADDITIONAL');
  assert.equal(getExpensePriorityTier('DELIVERY'), 'ADDITIONAL');
  assert.equal(getExpensePriorityTier('EQUIPMENT'), 'ADDITIONAL');
  assert.equal(getExpensePriorityTier('MARKETING'), 'ADDITIONAL');
  assert.equal(getExpensePriorityTier('OTHER'), 'ADDITIONAL');

  assert.equal(classifyExpenseText('Налог с оборота ЕНП 4% ГНК').category, 'TAXES');
  assert.equal(classifyExpenseText('РЭС электроэнергия дневной тариф 1200 кВт·ч').category, 'UTILITIES');

  const expensesOnNov15: AnalysisExpenseInput[] = [
    {
      id: 'exp-tax-1',
      supplierId: 'sup-gnk',
      supplierName: 'ГНК г. Ташкента',
      category: 'TAXES',
      itemName: 'НДС 12% и налог с оборота',
      description: 'Начисление налогов за период',
      amount: 3_200_000,
      quantity: null,
      unit: null,
      unitPrice: null,
      invoiceNumber: 'TAX-15',
      spentAt: new Date('2026-11-15T11:00:00.000Z'),
    },
    {
      id: 'exp-elec-1',
      supplierId: 'sup-res',
      supplierName: 'РЭС Ташкент',
      category: 'UTILITIES',
      itemName: 'Электроэнергия кухня (дневной тариф)',
      description: 'Счётчик кВт·ч РЭС',
      amount: 1_080_000,
      quantity: 1200,
      unit: 'кВт·ч',
      unitPrice: 900,
      invoiceNumber: 'EL-15',
      spentAt: new Date('2026-11-15T12:00:00.000Z'),
    },
    {
      id: 'exp-ing-1',
      supplierId: 'sup-meat',
      supplierName: 'Chorvoq Meat',
      category: 'INGREDIENTS',
      itemName: 'Говядина',
      description: 'Говядина 40 кг',
      amount: 3_600_000,
      quantity: 40,
      unit: 'кг',
      unitPrice: 90_000,
      invoiceNumber: 'M-15',
      spentAt: new Date('2026-11-15T13:00:00.000Z'),
    },
    {
      id: 'exp-pkg-1',
      supplierId: 'sup-pkg',
      supplierName: 'Pack UZ',
      category: 'PACKAGING',
      itemName: 'Крафт-коробки',
      description: 'Упаковка для доставки',
      amount: 450_000,
      quantity: 500,
      unit: 'шт',
      unitPrice: 900,
      invoiceNumber: 'P-15',
      spentAt: new Date('2026-11-15T14:00:00.000Z'),
    },
  ];

  const overview = makeBaseOverview({
    period: { from: '2026-11-15T00:00:00.000Z', to: '2026-11-15T23:59:59.999Z', days: 1 },
    revenue: 16_000_000,
    totalExpenses: 8_330_000,
    categoryBreakdown: [
      { category: 'INGREDIENTS', amount: 3_600_000, sharePct: 43.2, prevAmount: 3_000_000, growthPct: 20, budgetLimit: 10_000_000 },
      { category: 'TAXES', amount: 3_200_000, sharePct: 38.4, prevAmount: 2_500_000, growthPct: 28, budgetLimit: 4_000_000 },
      { category: 'UTILITIES', amount: 1_080_000, sharePct: 13.0, prevAmount: 700_000, growthPct: 54.3, budgetLimit: 1_500_000 },
      { category: 'PACKAGING', amount: 450_000, sharePct: 5.4, prevAmount: 400_000, growthPct: 12.5, budgetLimit: 800_000 },
    ],
  });

  const prioSummary = computePriorityExpenseSummary({ overview, expenses: expensesOnNov15 });
  assert.equal(prioSummary.taxesTotal, 3_200_000);
  assert.equal(prioSummary.taxesPctOfRevenue, 20.0);
  assert.equal(prioSummary.utilitiesTotal, 1_080_000);
  assert.equal(prioSummary.electricityTotal, 1_080_000);
  assert.equal(prioSummary.electricityKwh, 1200);
  assert.equal(prioSummary.electricityAvgTariffPerKwh, 900);
  assert.equal(prioSummary.priorityTotal, 4_280_000);
  assert.equal(prioSummary.baseTotal, 3_600_000);
  assert.equal(prioSummary.additionalTotal, 450_000);

  const findings = analyzeFinancialData({
    now: new Date('2026-11-18T09:00:00.000Z'),
    restaurantCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
    periodStart: new Date('2026-11-15T00:00:00.000Z'),
    periodEnd: new Date('2026-11-15T23:59:59.999Z'),
    expensesPeriod: expensesOnNov15,
    expensesAll90d: expensesOnNov15,
    expensesPrevPeriod: [],
    overview,
    ordersPeriod: [],
    dishes: [],
    budgets: [],
  });
  const codes = new Set(findings.map(f => f.code));
  assert.ok(codes.has('HIGH_TAX_BURDEN'));
  assert.ok(codes.has('HIGH_ELECTRICITY_COST'));

  const report = buildHeuristicOptimizationReport(overview, findings);
  assert.ok(report.executiveSummary.ru.includes('налоги'));
  assert.ok(report.executiveSummary.uz.includes('soliqlar'));
  assert.ok(report.executiveSummary.en.includes('Taxes'));

  // Intent + Blocks + Deterministic Answer for "Расходы за 15 ноября"
  const now = new Date('2026-11-18T09:00:00.000Z');
  const intents = detectQuestionIntents('Расходы за 15 ноября', now);
  assert.equal(intents.isExpenseQuery, true);
  assert.equal(intents.parsedPeriod?.from, '2026-11-15');
  assert.equal(intents.parsedPeriod?.to, '2026-11-15');

  const { blocks } = buildPriorityExpenseBlocks({
    lang: 'ru',
    periodLabel: intents.parsedPeriod!.label.ru,
    fromStr: '2026-11-15',
    toStr: '2026-11-15',
    overview,
    expenses: expensesOnNov15,
    requestedCategories: intents.requestedCategories,
  });
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0]!.id, 'blk-priority-kpis');
  assert.equal(blocks[1]!.id, 'blk-priority-chart');
  assert.equal(blocks[2]!.id, 'blk-expenses-table');
  if (blocks[2]!.kind === 'table') {
    assert.equal(blocks[2]!.rows.length, 4);
    assert.equal(blocks[2]!.rows[0]![0], '2026-11-15');
    assert.ok(blocks[2]!.rows.some(r => String(r[2]).includes('1200 кВт·ч')));
    assert.deepEqual(blocks[2]!.highlightRowIndices, [0, 1]);
  }

  const answer = buildDeterministicAgentAnswer({
    lang: 'ru',
    restaurantName: 'Osh & Olov',
    analysis: { overview, findings, report },
    prioritySummary: prioSummary,
    fromStr: '2026-11-15',
    toStr: '2026-11-15',
    parsedPeriod: intents.parsedPeriod,
    expenses: expensesOnNov15,
    isExpenseQuery: true,
    geoData: null,
    varianceData: null,
    branchData: null,
    scenarioData: null,
  });
  assert.ok(answer.ru.includes('2026-11-15'));
  assert.match(answer.ru, /1[\s\u00A0]200 кВт·ч/);
  assert.ok(answer.uz.includes('2026-11-15'));
  assert.ok(answer.en.includes('2026-11-15'));

  // AgentClientAction set_filters accepts optional from/to
  const filterAction: AgentClientAction = {
    type: 'set_filters',
    from: '2026-11-15',
    to: '2026-11-15',
    label: 'Период: 15 ноября 2026',
  };
  assert.equal(filterAction.from, '2026-11-15');

  // answerFinancialQuestion with resolvedPeriod and itemized expenses
  const prevKey = env.GEMINI_API_KEY;
  const prevCoarenaKey = env.COARENA_API_KEY;
  env.GEMINI_API_KEY = undefined;
  env.COARENA_API_KEY = undefined;
  try {
    const qa = await answerFinancialQuestion({
      question: 'Налоги и электричество за прошлую неделю',
      restaurantName: 'Osh & Olov',
      overview,
      findings,
      expenses: expensesOnNov15,
      resolvedPeriod: parseDatePeriodFromQuestion('Налоги и электричество за прошлую неделю', now),
    });
    assert.equal(qa.source, 'heuristic');
    assert.ok(qa.answer.ru.includes('2026-11-09 – 2026-11-15'));
    assert.match(qa.answer.ru, /1[\s\u00A0]200 кВт·ч/);
    assert.ok(qa.highlights.some(h => h.includes('Potential Savings')));
  } finally {
    env.GEMINI_API_KEY = prevKey;
    env.COARENA_API_KEY = prevCoarenaKey;
  }
});
