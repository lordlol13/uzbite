import test from 'node:test';
import assert from 'node:assert/strict';
import type { BusinessKpiOverview, ExpenseCategory } from '@uzbite/shared';
import {
  analyzeFinancialData,
  buildHeuristicOptimizationReport,
  calculateDeduplicatedSavings,
  classifyExpenseText,
  coefficientOfVariation,
  linearRegressionSlope,
  mad,
  modifiedZScore,
  stddev,
  theilSenSlope,
  type AnalysisEngineInput,
} from './finance-analysis.js';
import { resolveDateRange } from './business-analytics.js';
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
