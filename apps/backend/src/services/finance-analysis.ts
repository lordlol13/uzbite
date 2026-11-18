import type {
  AiOptimizationReport,
  AiRecommendation,
  BusinessKpiOverview,
  CategoryBreakdownItem,
  ExpenseCategory,
  ExpenseClassificationResult,
  Finding,
  Language,
} from '@uzbite/shared';

export type ExpensePriorityTier = 'PRIORITY' | 'BASE' | 'ADDITIONAL';

export const PRIORITY_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'TAXES',
  'UTILITIES',
  'COMMUNICATION',
];

export const BASE_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'INGREDIENTS',
  'SALARY',
  'RENT',
];

export const ADDITIONAL_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'PACKAGING',
  'DELIVERY',
  'EQUIPMENT',
  'MARKETING',
  'OTHER',
];

const PRIORITY_CAT_SET = new Set<ExpenseCategory>(PRIORITY_EXPENSE_CATEGORIES);
const BASE_CAT_SET = new Set<ExpenseCategory>(BASE_EXPENSE_CATEGORIES);

export function getExpensePriorityTier(category: ExpenseCategory): ExpensePriorityTier {
  if (PRIORITY_CAT_SET.has(category)) return 'PRIORITY';
  if (BASE_CAT_SET.has(category)) return 'BASE';
  return 'ADDITIONAL';
}

export function expensePriorityLabel(tier: ExpensePriorityTier, lang: Language): string {
  if (tier === 'PRIORITY') {
    return lang === 'ru' ? 'Приоритет' : lang === 'uz' ? 'Ustuvor' : 'Priority';
  }
  if (tier === 'BASE') {
    return lang === 'ru' ? 'Базовые' : lang === 'uz' ? 'Asosiy' : 'Base';
  }
  return lang === 'ru' ? 'Дополнительные' : lang === 'uz' ? 'Qo‘shimcha' : 'Additional';
}

export function isElectricityExpense(exp: {
  category?: ExpenseCategory;
  itemName?: string;
  description?: string;
  unit?: string | null;
}): boolean {
  const unitLower = (exp.unit ?? '').toLowerCase();
  if (/(?:квт|kwh|kw\b)/i.test(unitLower)) return true;
  const text = `${exp.itemName ?? ''} ${exp.description ?? ''}`.toLowerCase();
  return /(электр|рэс|свет|трансформатор|квт|elektr|svet|electric|power\s*grid|kwh)/i.test(text);
}

export interface PriorityExpenseSummary {
  revenue: number;
  totalExpenses: number;
  taxesTotal: number;
  taxesPctOfRevenue: number;
  taxesShareOfExpensesPct: number;
  utilitiesTotal: number;
  utilitiesOnlyTotal: number;
  communicationTotal: number;
  utilitiesPctOfRevenue: number;
  electricityTotal: number;
  electricityKwh: number;
  electricityAvgTariffPerKwh: number | null;
  priorityTotal: number;
  priorityPctOfRevenue: number;
  prioritySharePct: number;
  baseTotal: number;
  baseSharePct: number;
  additionalTotal: number;
  additionalSharePct: number;
}

export function computePriorityExpenseSummary(params: {
  overview?: BusinessKpiOverview;
  categoryBreakdown?: CategoryBreakdownItem[];
  expenses?: Array<
    Pick<AnalysisExpenseInput, 'category' | 'itemName' | 'description' | 'amount' | 'quantity' | 'unit'>
  >;
}): PriorityExpenseSummary {
  const revenue = params.overview?.revenue ?? 0;
  const breakdown = params.categoryBreakdown ?? params.overview?.categoryBreakdown ?? [];
  const expenses = params.expenses ?? [];

  const catMap = new Map<ExpenseCategory, number>();
  if (expenses.length > 0) {
    for (const e of expenses) {
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amount);
    }
  } else {
    for (const c of breakdown) {
      catMap.set(c.category, (catMap.get(c.category) ?? 0) + c.amount);
    }
  }

  let electricityTotal = 0;
  let electricityKwh = 0;
  for (const e of expenses) {
    if (e.category === 'UTILITIES' && isElectricityExpense(e)) {
      electricityTotal += e.amount;
      if (e.quantity !== null && e.quantity > 0 && /(?:квт|kwh|kw\b)/i.test(e.unit ?? '')) {
        electricityKwh += e.quantity;
      }
    }
  }

  const taxesTotal = Math.round(catMap.get('TAXES') ?? 0);
  const utilitiesOnlyTotal = Math.round(catMap.get('UTILITIES') ?? 0);
  const communicationTotal = Math.round(catMap.get('COMMUNICATION') ?? 0);
  const utilitiesTotal = utilitiesOnlyTotal + communicationTotal;

  const baseTotal = Math.round(
    (catMap.get('INGREDIENTS') ?? 0) +
      (catMap.get('SALARY') ?? 0) +
      (catMap.get('RENT') ?? 0),
  );
  const additionalTotal = Math.round(
    (catMap.get('PACKAGING') ?? 0) +
      (catMap.get('DELIVERY') ?? 0) +
      (catMap.get('EQUIPMENT') ?? 0) +
      (catMap.get('MARKETING') ?? 0) +
      (catMap.get('OTHER') ?? 0),
  );
  const priorityTotal = taxesTotal + utilitiesTotal;
  const computedSum = priorityTotal + baseTotal + additionalTotal;
  const totalExpenses = Math.round(
    expenses.length > 0 ? computedSum : (params.overview?.totalExpenses ?? computedSum),
  );

  const pctRev = (v: number) => (revenue > 0 ? Number(((v / revenue) * 100).toFixed(1)) : 0);
  const pctExp = (v: number) => (totalExpenses > 0 ? Number(((v / totalExpenses) * 100).toFixed(1)) : 0);

  return {
    revenue: Math.round(revenue),
    totalExpenses,
    taxesTotal,
    taxesPctOfRevenue: pctRev(taxesTotal),
    taxesShareOfExpensesPct: pctExp(taxesTotal),
    utilitiesTotal,
    utilitiesOnlyTotal,
    communicationTotal,
    utilitiesPctOfRevenue: pctRev(utilitiesTotal),
    electricityTotal: Math.round(electricityTotal),
    electricityKwh: Number(electricityKwh.toFixed(1)),
    electricityAvgTariffPerKwh:
      electricityKwh > 0 ? Math.round(electricityTotal / electricityKwh) : null,
    priorityTotal,
    priorityPctOfRevenue: pctRev(priorityTotal),
    prioritySharePct: pctExp(priorityTotal),
    baseTotal,
    baseSharePct: pctExp(baseTotal),
    additionalTotal,
    additionalSharePct: pctExp(additionalTotal),
  };
}

export interface AnalysisExpenseInput {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  category: ExpenseCategory;
  itemName: string;
  description: string;
  amount: number;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  invoiceNumber: string | null;
  spentAt: Date;
}

export interface AnalysisOrderInput {
  id: string;
  total: number;
  subtotal: number;
  status: string;
  createdAt: Date;
  paymentMethod: string | null;
  paymentStatus: string | null;
}

export interface AnalysisDishInput {
  dishId: string;
  name: string;
  price: number;
  costPrice: number;
  quantitySold: number;
  revenue: number;
  totalProfit: number;
  revenueSharePct: number;
  abcClass: 'A' | 'B' | 'C';
}

export interface AnalysisBudgetInput {
  id: string;
  category: ExpenseCategory;
  month: Date;
  limit: number;
  actual: number;
  forecast: number;
}

export interface AnalysisEngineInput {
  now: Date;
  restaurantCreatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  expensesPeriod: AnalysisExpenseInput[];
  expensesAll90d: AnalysisExpenseInput[];
  expensesPrevPeriod: AnalysisExpenseInput[];
  overview: BusinessKpiOverview;
  ordersPeriod: AnalysisOrderInput[];
  dishes: AnalysisDishInput[];
  budgets: AnalysisBudgetInput[];
}

function finiteNumbers(values: number[]): number[] {
  return values.filter(Number.isFinite);
}

export function mean(values: number[]): number {
  const valid = finiteNumbers(values);
  if (valid.length === 0) return 0;
  return valid.reduce((acc, v) => acc + v, 0) / valid.length;
}

export function median(values: number[]): number {
  const valid = finiteNumbers(values);
  if (valid.length === 0) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function quartiles(values: number[]): { q1: number; q3: number; iqr: number } {
  const valid = finiteNumbers(values);
  if (valid.length === 0) return { q1: 0, q3: 0, iqr: 0 };
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, mid);
  const upper = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  const q1 = median(lower.length ? lower : sorted);
  const q3 = median(upper.length ? upper : sorted);
  return { q1, q3, iqr: q3 - q1 };
}

export function stddev(values: number[]): number {
  const valid = finiteNumbers(values);
  if (valid.length < 2) return 0;
  const avg = mean(valid);
  const variance = valid.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (valid.length - 1);
  return Math.sqrt(variance);
}

export function coefficientOfVariation(values: number[]): number {
  const valid = finiteNumbers(values);
  if (valid.length < 2) return 0;
  const avg = mean(valid);
  if (avg === 0) return 0;
  return stddev(valid) / Math.abs(avg);
}

export function mad(values: number[]): number {
  const valid = finiteNumbers(values);
  if (valid.length === 0) return 0;
  const med = median(valid);
  return median(valid.map(v => Math.abs(v - med)));
}

export function modifiedZScore(value: number, population: number[]): number {
  if (!Number.isFinite(value)) return 0;
  const valid = finiteNumbers(population);
  const m = mad(valid);
  if (m === 0) return 0;
  return (0.6745 * (value - median(valid))) / m;
}

export function zScore(value: number, population: number[]): number {
  if (!Number.isFinite(value)) return 0;
  const valid = finiteNumbers(population);
  const s = stddev(valid);
  if (s === 0) return 0;
  return (value - mean(valid)) / s;
}

export function linearRegressionSlope(ys: number[]): number {
  const valid = finiteNumbers(ys);
  const n = valid.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += valid[i]!;
    sumXY += i * valid[i]!;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

export function theilSenSlope(ys: number[]): number {
  const valid = finiteNumbers(ys);
  const n = valid.length;
  if (n < 2) return 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      slopes.push((valid[j]! - valid[i]!) / (j - i));
    }
  }
  return median(slopes);
}

const CATEGORY_KEYWORDS: Record<ExpenseCategory, { keywords: string[]; weight: number }> = {
  UTILITIES: {
    weight: 1.15,
    keywords: [
      'электроэнерг', 'электр', 'рэс', 'тэц', 'свет', 'газ', 'водоснаб', 'вода', 'воду', 'воды', 'водой', 'водоканал', 'канализац', 'квт', 'квт·ч', 'квтч', 'худудгаз', 'сувсоз', 'трансформатор', 'мусор', 'жироуловител', 'коммунал', 'отоплен', 'вентиляц', 'счётчик', 'счетчик',
      'elektr', 'energiya', 'gaz', 'suv', 'hududgaz', 'suvsoz', 'kommunal', 'svet',
      'electricity', 'power', 'water', 'gas', 'utilities', 'utility', 'energy', 'kwh',
    ],
  },
  COMMUNICATION: {
    weight: 1.15,
    keywords: [
      'интернет', 'связь', 'связи', 'телефон', 'атс', 'роуминг', 'смс', 'трафик', 'uztelecom', 'beeline', 'ucell', 'mobiuz', 'sip',
      'aloqa', 'internet', 'telefon',
      'telecom', 'communication', 'phone', 'mobile', 'broadband', 'sms',
    ],
  },
  RENT: {
    weight: 1.15,
    keywords: [
      'аренд', 'помещен', 'склад', 'площад', 'субаренд', 'коммунальная доля аренды',
      'ijara', 'ombor', 'bino',
      'rent', 'lease', 'warehouse', 'premises',
    ],
  },
  SALARY: {
    weight: 1.1,
    keywords: [
      'зарплат', 'фот', 'оклад', 'преми', 'аванс', 'сверхуроч', 'смен', 'повар', 'персонал', 'сотрудник', 'кассир',
      'ish haqi', 'maosh', 'oylik', 'xodim', 'oshpaz',
      'salary', 'payroll', 'wage', 'wages', 'staff', 'overtime', 'bonus',
    ],
  },
  INGREDIENTS: {
    weight: 1.0,
    keywords: [
      'говядин', 'баранин', 'мяс', 'куриц', 'рыб', 'лосос', 'рис', 'лазер', 'морков', 'лук', 'масл', 'мук', 'сыр', 'моцарелл',
      'томат', 'помидор', 'овощ', 'фрукт', 'продукт', 'ингредиент', 'зира', 'спец', 'соус', 'лапш', 'молок', 'сливк',
      'go\'sht', 'gosht', 'guruch', 'sabzi', 'piyoz', 'yog\'', 'tovuq', 'baliq', 'sabzavot',
      'meat', 'beef', 'chicken', 'salmon', 'rice', 'flour', 'oil', 'cheese', 'tomato', 'ingredient', 'grocery',
    ],
  },
  PACKAGING: {
    weight: 1.1,
    keywords: [
      'упаков', 'пакет', 'термопакет', 'ланч', 'бокс', 'контейнер', 'стакан', 'крышк', 'прибор', 'салфет', 'фольг', 'коробк',
      'qadoq', 'paket', 'idish', 'stakan', 'quti',
      'packaging', 'box', 'boxes', 'container', 'cup', 'lid', 'napkin', 'bag',
    ],
  },
  MARKETING: {
    weight: 1.05,
    keywords: [
      'маркетинг', 'реклам', 'таргет', 'instagram', 'telegram', 'smm', 'продвижен', 'баннер', 'блогер', 'акци', 'купон',
      'reklama', 'marketing', 'target',
      'ads', 'advertising', 'campaign', 'promo', 'social media',
    ],
  },
  DELIVERY: {
    weight: 1.05,
    keywords: [
      'достав', 'курьер', 'бензин', 'топлив', 'дизел', 'логистик', 'транспорт', 'пробег', 'яндекс такси',
      'yetkazib', 'kuryer', 'benzin', 'yoqilg\'i',
      'delivery', 'courier', 'fuel', 'petrol', 'logistics', 'shipping',
    ],
  },
  EQUIPMENT: {
    weight: 1.05,
    keywords: [
      'оборудован', 'ремонт', 'печь', 'казан', 'холодильник', 'морозиль', 'плит', 'инвентар', 'посуд', 'вытяжк', 'техник',
      'jihoz', 'uskuna', 'ta\'mir', 'muzlatgich',
      'equipment', 'repair', 'oven', 'fridge', 'freezer', 'kitchenware', 'maintenance',
    ],
  },
  TAXES: {
    weight: 1.15,
    keywords: [
      'налог', 'ндс', 'гнк', 'енп', 'есп', 'ндфл', 'инпс', 'соцналог', 'налог с оборота', 'торговый сбор', 'земельный налог', 'пошлин', 'сбор', 'госбюджет', 'социальный налог',
      'soliq', 'qqs', 'boj', 'aylanma', 'jshdsh', 'ijtimoiy soliq', 'daromad solig', 'inps',
      'tax', 'taxes', 'vat', 'duty', 'fiscal',
    ],
  },
  OTHER: {
    weight: 0.7,
    keywords: [
      'дезинфекц', 'санпин', 'уборк', 'канцеляр', 'проч', 'хозтовар', 'охрана',
      'tozalash', 'boshqa', 'sanpin',
      'cleaning', 'disinfection', 'stationery', 'other', 'misc',
    ],
  },
};

const CATEGORY_LABELS: Record<ExpenseCategory, Record<Language, string>> = {
  INGREDIENTS: { ru: 'Продукты и сырьё', uz: 'Mahsulotlar va xomashyo', en: 'Ingredients' },
  PACKAGING: { ru: 'Упаковка и тара', uz: 'Qadoqlash materiallari', en: 'Packaging' },
  SALARY: { ru: 'Зарплата (ФОТ)', uz: 'Ish haqi fondi', en: 'Salaries & Payroll' },
  RENT: { ru: 'Аренда', uz: 'Ijara', en: 'Rent' },
  UTILITIES: { ru: 'Коммунальные услуги', uz: 'Kommunal xizmatlar', en: 'Utilities' },
  COMMUNICATION: { ru: 'Связь и интернет', uz: 'Aloqa va internet', en: 'Communication' },
  MARKETING: { ru: 'Маркетинг и реклама', uz: 'Marketing va reklama', en: 'Marketing' },
  DELIVERY: { ru: 'Доставка и топливо', uz: 'Yetkazib berish va yoqilg‘i', en: 'Delivery & Fuel' },
  EQUIPMENT: { ru: 'Оборудование и ремонт', uz: 'Uskunalar va ta’mirlash', en: 'Equipment & Repairs' },
  TAXES: { ru: 'Налоги и сборы', uz: 'Soliqlar va yig‘imlar', en: 'Taxes & Fees' },
  OTHER: { ru: 'Прочие расходы', uz: 'Boshqa xarajatlar', en: 'Other' },
};

export function categoryLabel(category: ExpenseCategory, lang: Language): string {
  return CATEGORY_LABELS[category][lang];
}

function normalizeClassificationText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BB\u02BC`´]/g, "'")
    // Strip parenthetical audit/meta notes like "(ошибочно ...)", "(xato ...)", "(mistakenly ...)"
    .replace(/\([^)]*(?:ошибоч|ошибк|неверн|неправильн|xato|noto'?g'?ri|mistak|wrong|erroneous)[^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildKeywordRegex(keyword: string): RegExp {
  const normalizedKw = normalizeClassificationText(keyword);
  const escaped = escapeRegex(normalizedKw);
  // Exclude carbonated beverages ("газирован...", "газировка") from matching gas utility
  if (normalizedKw === 'газ') {
    return new RegExp(`(?:^|[^a-zа-яё0-9'])${escaped}(?!иров)`);
  }
  return new RegExp(`(?:^|[^a-zа-яё0-9'])${escaped}`);
}

const COMPILED_CATEGORY_MATCHERS: Array<{
  category: ExpenseCategory;
  weight: number;
  matchers: Array<{ keyword: string; regex: RegExp }>;
}> = (Object.keys(CATEGORY_KEYWORDS) as ExpenseCategory[]).map(category => {
  const config = CATEGORY_KEYWORDS[category];
  const uniqueKeywords = [...new Set(config.keywords)];
  return {
    category,
    weight: config.weight,
    matchers: uniqueKeywords.map(keyword => ({
      keyword,
      regex: buildKeywordRegex(keyword),
    })),
  };
});

export function classifyExpenseText(text: string): ExpenseClassificationResult {
  const normalized = normalizeClassificationText(text);
  if (!normalized) {
    return {
      category: 'OTHER',
      confidence: 0.3,
      matchedKeywords: [],
      reason: {
        ru: 'Текст описания пуст; назначена базовая категория «Прочие расходы».',
        uz: 'Tavsif matni bo‘sh; asosiy «Boshqa xarajatlar» toifasi tanlandi.',
        en: 'Empty description; defaulted to Other.',
      },
    };
  }

  let bestCategory: ExpenseCategory = 'OTHER';
  let bestScore = 0;
  let secondBestScore = 0;
  let bestKeywords: string[] = [];

  for (const entry of COMPILED_CATEGORY_MATCHERS) {
    const matched: string[] = [];
    for (const m of entry.matchers) {
      if (m.regex.test(normalized)) {
        matched.push(m.keyword);
      }
    }
    if (matched.length === 0) continue;
    const score = matched.length * entry.weight + matched.reduce((s, k) => s + Math.min(k.length, 10) * 0.03, 0);
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestCategory = entry.category;
      bestKeywords = matched;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (bestKeywords.length === 0) {
    return {
      category: 'OTHER',
      confidence: 0.35,
      matchedKeywords: [],
      reason: {
        ru: 'Точных ключевых слов не найдено; отнесено к «Прочие расходы».',
        uz: 'Aniq kalit so‘zlar topilmadi; «Boshqa xarajatlar» ga kiritildi.',
        en: 'No strong category keywords matched; assigned to Other.',
      },
    };
  }

  let confidence: number;
  if (secondBestScore === 0) {
    confidence =
      bestScore >= 1.0
        ? Math.min(0.98, Number((0.74 + Math.min(bestKeywords.length, 4) * 0.06).toFixed(2)))
        : Math.min(0.88, Number((0.65 + Math.min(bestKeywords.length, 4) * 0.06).toFixed(2)));
  } else {
    const dominance = Math.max(0, (bestScore - secondBestScore) / bestScore);
    const raw = 0.45 + 0.35 * dominance + Math.min(bestKeywords.length - 1, 3) * 0.06;
    confidence = Math.min(0.96, Math.max(0.45, Number(raw.toFixed(2))));
  }
  const kwList = bestKeywords.slice(0, 4).join(', ');
  return {
    category: bestCategory,
    confidence,
    matchedKeywords: bestKeywords,
    reason: {
      ru: `Определена категория «${CATEGORY_LABELS[bestCategory].ru}» по ключевым словам: ${kwList}`,
      uz: `Kalit so‘zlar bo‘yicha «${CATEGORY_LABELS[bestCategory].uz}» toifasi aniqlandi: ${kwList}`,
      en: `Classified as ${CATEGORY_LABELS[bestCategory].en} based on keywords: ${kwList}`,
    },
  };
}

function fmtUZS(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} UZS`;
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function analyzeFinancialData(input: AnalysisEngineInput): Finding[] {
  const findings: Finding[] = [];
  const periodIds = new Set(input.expensesPeriod.map(e => e.id));

  // 1. DUPLICATE_INVOICE (by supplier + invoiceNumber, and by supplier + amount within ±2 days)
  const byInvoice = new Map<string, AnalysisExpenseInput[]>();
  for (const exp of input.expensesAll90d) {
    const inv = normalizeKey(exp.invoiceNumber);
    const sup = normalizeKey(exp.supplierId ?? exp.supplierName ?? 'unknown');
    if (!inv) continue;
    const key = `${sup}::${inv}`;
    const list = byInvoice.get(key) ?? [];
    list.push(exp);
    byInvoice.set(key, list);
  }
  const seenDuplicateIds = new Set<string>();
  const duplicateExtraIds = new Set<string>();
  for (const [key, list] of byInvoice.entries()) {
    if (list.length < 2) continue;
    if (!list.some(e => periodIds.has(e.id))) continue;
    const sorted = [...list].sort((a, b) => a.spentAt.getTime() - b.spentAt.getTime());
    const extraSum = sorted.slice(1).reduce((s, e) => s + e.amount, 0);
    sorted.forEach(e => seenDuplicateIds.add(e.id));
    sorted.slice(1).forEach(e => duplicateExtraIds.add(e.id));
    const invoiceLabel = sorted[0]!.invoiceNumber ?? key;
    const supplierLabel = sorted[0]!.supplierName ?? 'Поставщик';
    findings.push({
      id: `dup-inv-${invoiceLabel}`,
      kind: 'ERROR',
      code: 'DUPLICATE_INVOICE',
      severity: 'high',
      category: sorted[0]!.category,
      title: {
        ru: `Дубликат накладной ${invoiceLabel} (${supplierLabel})`,
        uz: `Takroriy hisob-faktura ${invoiceLabel} (${supplierLabel})`,
        en: `Duplicate invoice ${invoiceLabel} (${supplierLabel})`,
      },
      detail: {
        ru: `Накладная ${invoiceLabel} проведена ${sorted.length} раза на общую сумму ${fmtUZS(sorted.reduce((s, e) => s + e.amount, 0))}. Лишнее списание: ${fmtUZS(extraSum)}.`,
        uz: `${invoiceLabel} hisob-fakturasi ${sorted.length} marta kiritilgan. Ortiqcha yozilgan summa: ${fmtUZS(extraSum)}.`,
        en: `Invoice ${invoiceLabel} was recorded ${sorted.length} times. Excess duplicate charge: ${fmtUZS(extraSum)}.`,
      },
      recommendation: {
        ru: 'Удалите повторную проводку и проверьте сверку с поставщиком.',
        uz: 'Takroriy yozuvni o‘chiring va yetkazib beruvchi bilan solishtiring.',
        en: 'Delete the duplicate entry and reconcile with the supplier.',
      },
      amountImpact: Math.round(extraSum),
      expenseIds: sorted.map(e => e.id),
      metrics: { count: sorted.length, duplicateExpenseId: sorted[sorted.length - 1]!.id },
    });
  }

  // Secondary duplicate check: same supplier + exact amount within ±2 days without same invoice
  const bySupplierAmount = new Map<string, AnalysisExpenseInput[]>();
  for (const exp of input.expensesAll90d) {
    if (seenDuplicateIds.has(exp.id)) continue;
    const sup = normalizeKey(exp.supplierId ?? exp.supplierName);
    if (!sup) continue;
    const key = `${sup}::${Math.round(exp.amount)}`;
    const list = bySupplierAmount.get(key) ?? [];
    list.push(exp);
    bySupplierAmount.set(key, list);
  }
  for (const [, list] of bySupplierAmount.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.spentAt.getTime() - b.spentAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (!periodIds.has(curr.id) && !periodIds.has(prev.id)) continue;
      const prevInv = normalizeKey(prev.invoiceNumber);
      const currInv = normalizeKey(curr.invoiceNumber);
      const prevItem = normalizeKey(prev.itemName);
      const currItem = normalizeKey(curr.itemName);
      if (prevInv && currInv && prevInv !== currInv && prevItem && currItem && prevItem !== currItem) {
        continue;
      }
      if (Math.abs(curr.spentAt.getTime() - prev.spentAt.getTime()) <= 2 * 86_400_000) {
        duplicateExtraIds.add(curr.id);
        findings.push({
          id: `dup-amt-${curr.id}`,
          kind: 'ERROR',
          code: 'DUPLICATE_INVOICE',
          severity: 'high',
          category: curr.category,
          title: {
            ru: `Возможный дубль платежа (${curr.supplierName ?? curr.itemName})`,
            uz: `Takroriy to‘lov ehtimoli (${curr.supplierName ?? curr.itemName})`,
            en: `Possible duplicate payment (${curr.supplierName ?? curr.itemName})`,
          },
          detail: {
            ru: `Одинаковая сумма ${fmtUZS(curr.amount)} проведена дважды в пределах 2 дней.`,
            uz: `${fmtUZS(curr.amount)} summasi 2 kun ichida ikki marta kiritilgan.`,
            en: `Identical amount ${fmtUZS(curr.amount)} recorded twice within 2 days.`,
          },
          recommendation: {
            ru: 'Подтвердите, что оба платежа соответствуют разным поставкам, или удалите дубликат.',
            uz: 'Ikkala to‘lov alohida yetkazib berishlarga tegishli ekanligini tekshiring yoki dublikatni o‘chiring.',
            en: 'Verify whether both entries correspond to separate deliveries or delete the duplicate.',
          },
          amountImpact: Math.round(curr.amount),
          expenseIds: [prev.id, curr.id],
          metrics: { duplicateExpenseId: curr.id },
        });
        break;
      }
    }
  }

  // 2. AMOUNT_MISMATCH (quantity * unitPrice != amount)
  for (const exp of input.expensesPeriod) {
    if (exp.quantity !== null && exp.unitPrice !== null && exp.quantity > 0 && exp.unitPrice > 0) {
      const expected = exp.quantity * exp.unitPrice;
      const diff = Math.abs(exp.amount - expected);
      if (diff / expected > 0.01 && diff > 100) {
        findings.push({
          id: `mismatch-${exp.id}`,
          kind: 'ERROR',
          code: 'AMOUNT_MISMATCH',
          severity: 'high',
          category: exp.category,
          title: {
            ru: `Арифметическая ошибка в расходе «${exp.itemName || exp.description}»`,
            uz: `Xarajat hisob-kitobida xatolik «${exp.itemName || exp.description}»`,
            en: `Calculation mismatch in "${exp.itemName || exp.description}"`,
          },
          detail: {
            ru: `${exp.quantity} ${exp.unit ?? 'ед.'} × ${fmtUZS(exp.unitPrice)} = ${fmtUZS(expected)}, но в учёте указано ${fmtUZS(exp.amount)} (расхождение ${fmtUZS(diff)}).`,
            uz: `${exp.quantity} ${exp.unit ?? 'dona'} × ${fmtUZS(exp.unitPrice)} = ${fmtUZS(expected)}, lekin tizimda ${fmtUZS(exp.amount)} ko‘rsatilgan (farq ${fmtUZS(diff)}).`,
            en: `${exp.quantity} ${exp.unit ?? 'units'} × ${fmtUZS(exp.unitPrice)} = ${fmtUZS(expected)}, but recorded amount is ${fmtUZS(exp.amount)} (diff ${fmtUZS(diff)}).`,
          },
          recommendation: {
            ru: `Исправьте сумму документа на расчётную (${fmtUZS(expected)}) или уточните цену за единицу.`,
            uz: `Hujjat summasini to‘g‘ri qiymatga (${fmtUZS(expected)}) o‘zgartiring yoki birlik narxini tekshiring.`,
            en: `Correct the recorded total to ${fmtUZS(expected)} or verify the unit price.`,
          },
          amountImpact: Math.round(diff),
          expenseIds: [exp.id],
          metrics: { expectedAmount: Math.round(expected), recordedAmount: Math.round(exp.amount), diff: Math.round(diff) },
        });
      }
    }
  }

  // 3. AMOUNT_OUTLIER (leave-one-out Z-score > 3, Modified Z-score > 3.5, or Tukey IQR fence over last 90d)
  const byCategory90d = new Map<ExpenseCategory, AnalysisExpenseInput[]>();
  for (const exp of input.expensesAll90d) {
    const arr = byCategory90d.get(exp.category) ?? [];
    arr.push(exp);
    byCategory90d.set(exp.category, arr);
  }
  for (const exp of input.expensesPeriod) {
    const catList = byCategory90d.get(exp.category);
    if (!catList || catList.length < 4) continue;
    const others = catList.filter(o => o.id !== exp.id).map(o => o.amount);
    if (others.length < 3) continue;
    const otherMed = median(others);
    const otherAvg = mean(others);
    const otherStd = stddev(others);
    const modZ = modifiedZScore(exp.amount, others);
    const { q3, iqr } = quartiles(others);
    const leaveOneOutZ = otherStd > 0 ? (exp.amount - otherAvg) / otherStd : 0;
    const isOutlier =
      exp.amount > q3 &&
      (leaveOneOutZ > 3 ||
        modZ > 3.5 ||
        (iqr > 0 && exp.amount > q3 + 3 * iqr) ||
        (otherStd === 0 && otherMed > 0 && exp.amount > otherMed * 3));
    if (isOutlier) {
      const impact = Math.max(0, Math.round(exp.amount - otherMed));
      findings.push({
        id: `outlier-${exp.id}`,
        kind: 'ERROR',
        code: 'AMOUNT_OUTLIER',
        severity: 'high',
        category: exp.category,
        title: {
          ru: `Аномальный выброс суммы в категории «${categoryLabel(exp.category, 'ru')}»`,
          uz: `«${categoryLabel(exp.category, 'uz')}» toifasida g‘ayrioddiy katta xarajat`,
          en: `Statistical amount outlier in ${categoryLabel(exp.category, 'en')}`,
        },
        detail: {
          ru: `Платёж «${exp.itemName || exp.description}» на ${fmtUZS(exp.amount)} превышает медиану категории (${fmtUZS(otherMed)}) в ${(exp.amount / Math.max(1, otherMed)).toFixed(1)}× раз (Z-оценка: ${leaveOneOutZ.toFixed(1)}, Mod-Z: ${modZ.toFixed(1)}).`,
          uz: `«${exp.itemName || exp.description}» to‘lovi (${fmtUZS(exp.amount)}) toifa medianasidan (${fmtUZS(otherMed)}) ${(exp.amount / Math.max(1, otherMed)).toFixed(1)}× baravar yuqori.`,
          en: `Entry "${exp.itemName || exp.description}" (${fmtUZS(exp.amount)}) is ${(exp.amount / Math.max(1, otherMed)).toFixed(1)}× above category median (${fmtUZS(otherMed)}).`,
        },
        recommendation: {
          ru: 'Проверьте показания счётчиков/накладную на опечатку в разряде или скрытую утечку ресурсов.',
          uz: 'Hisoblagich ko‘rsatkichlarini yoki hujjatda ortiqcha nol kiritilmaganligini tekshiring.',
          en: 'Audit the meter/invoice for an extra-zero typo or unexpected resource leakage.',
        },
        amountImpact: impact,
        expenseIds: [exp.id],
        metrics: {
          median: Math.round(otherMed),
          zScore: Number(leaveOneOutZ.toFixed(2)),
          modifiedZScore: Number(modZ.toFixed(2)),
        },
      });
    }
  }

  // 4. CATEGORY_MISMATCH (AI semantic classifier contradicts logged category)
  for (const exp of input.expensesPeriod) {
    const classified = classifyExpenseText(`${exp.itemName} ${exp.description}`);
    if (classified.confidence >= 0.78 && classified.category !== 'OTHER' && classified.category !== exp.category) {
      findings.push({
        id: `cat-mismatch-${exp.id}`,
        kind: 'ERROR',
        code: 'CATEGORY_MISMATCH',
        severity: 'medium',
        category: exp.category,
        title: {
          ru: `Неверная категория расхода «${exp.itemName || exp.description}»`,
          uz: `Noto‘g‘ri xarajat toifasi «${exp.itemName || exp.description}»`,
          en: `Misclassified expense "${exp.itemName || exp.description}"`,
        },
        detail: {
          ru: `Запись отнесена в «${categoryLabel(exp.category, 'ru')}», но по тексту («${classified.matchedKeywords.join(', ')}») это «${categoryLabel(classified.category, 'ru')}» (уверенность ${Math.round(classified.confidence * 100)}%).`,
          uz: `Xarajat «${categoryLabel(exp.category, 'uz')}» ga kiritilgan, ammo matn bo‘yicha bu «${categoryLabel(classified.category, 'uz')}» (${Math.round(classified.confidence * 100)}%).`,
          en: `Logged under ${categoryLabel(exp.category, 'en')}, but text indicates ${categoryLabel(classified.category, 'en')} (${Math.round(classified.confidence * 100)}% confidence).`,
        },
        recommendation: {
          ru: `Перенесите расход в категорию «${categoryLabel(classified.category, 'ru')}», чтобы не искажать план-факт отчётность.`,
          uz: `Reja-fakt hisobotini buzmaslik uchun xarajatni «${categoryLabel(classified.category, 'uz')}» toifasiga o‘tkazing.`,
          en: `Reclassify this expense to ${categoryLabel(classified.category, 'en')} for accurate budget tracking.`,
        },
        amountImpact: Math.round(exp.amount),
        expenseIds: [exp.id],
        metrics: { currentCategory: exp.category, suggestedCategory: classified.category },
      });
    }
  }

  // 5. FUTURE_OR_INVALID_DATE
  const tomorrowMs = input.now.getTime() + 86_400_000;
  const minValidMs = input.restaurantCreatedAt.getTime() - 365 * 86_400_000;
  for (const exp of input.expensesAll90d) {
    const t = exp.spentAt.getTime();
    if (t > tomorrowMs || t < minValidMs) {
      findings.push({
        id: `bad-date-${exp.id}`,
        kind: 'ERROR',
        code: 'FUTURE_OR_INVALID_DATE',
        severity: 'medium',
        category: exp.category,
        title: {
          ru: `Некорректная дата документа (${exp.spentAt.toISOString().slice(0, 10)})`,
          uz: `Hujjat sanasi noto‘g‘ri (${exp.spentAt.toISOString().slice(0, 10)})`,
          en: `Invalid future/historical expense date (${exp.spentAt.toISOString().slice(0, 10)})`,
        },
        detail: {
          ru: `Расход «${exp.itemName || exp.description}» на ${fmtUZS(exp.amount)} проведён датой из будущего или до открытия ресторана.`,
          uz: `«${exp.itemName || exp.description}» xarajati (${fmtUZS(exp.amount)}) kelajak sanasi bilan kiritilgan.`,
          en: `Expense "${exp.itemName || exp.description}" (${fmtUZS(exp.amount)}) has an invalid future or pre-opening date.`,
        },
        recommendation: {
          ru: 'Исправьте дату проведения документа на фактическую дату оплаты.',
          uz: 'Hujjat sanasini haqiqiy to‘lov sanasiga to‘g‘rilang.',
          en: 'Correct the transaction date to the actual payment date.',
        },
        amountImpact: Math.round(exp.amount),
        expenseIds: [exp.id],
      });
    }
  }

  // 6. UNPAID_DELIVERED_ORDERS
  const unpaidDelivered = input.ordersPeriod.filter(
    o => o.status === 'DELIVERED' && o.paymentMethod === 'CARD' && o.paymentStatus !== 'PAID',
  );
  if (unpaidDelivered.length > 0) {
    const unpaidSum = unpaidDelivered.reduce((s, o) => s + o.total, 0);
    findings.push({
      id: 'unpaid-delivered-orders',
      kind: 'ERROR',
      code: 'UNPAID_DELIVERED_ORDERS',
      severity: 'high',
      title: {
        ru: `Доставленные заказы без подтверждения оплаты картой (${unpaidDelivered.length} шт.)`,
        uz: `Karta to‘lovi tasdiqlanmagan yetkazilgan buyurtmalar (${unpaidDelivered.length} ta)`,
        en: `Delivered card orders awaiting payment confirmation (${unpaidDelivered.length})`,
      },
      detail: {
        ru: `${unpaidDelivered.length} доставленных заказов с оплатой CARD всё ещё имеют статус оплаты «ожидает подтверждения» на сумму ${fmtUZS(unpaidSum)}.`,
        uz: `${unpaidDelivered.length} ta yetkazilgan buyurtmada karta to‘lovi hali tasdiqlanmagan (${fmtUZS(unpaidSum)}).`,
        en: `${unpaidDelivered.length} delivered CARD orders totaling ${fmtUZS(unpaidSum)} have not been confirmed as PAID.`,
      },
      recommendation: {
        ru: 'Сверьте поступления на карту и переведите заказы в статус PAID или свяжитесь с клиентом.',
        uz: 'Karta tushumlarini tekshiring va to‘lov holatini tasdiqlang.',
        en: 'Reconcile card bank statements and mark confirmed transfers as PAID.',
      },
      amountImpact: Math.round(unpaidSum),
      metrics: { count: unpaidDelivered.length },
    });
  }

  // 7. NEGATIVE_MARGIN_DISH
  const negativeDishes = input.dishes.filter(d => d.costPrice > 0 && d.costPrice >= d.price);
  if (negativeDishes.length > 0) {
    const lossImpact = negativeDishes.reduce((s, d) => s + (d.costPrice - d.price) * Math.max(1, d.quantitySold), 0);
    findings.push({
      id: 'negative-margin-dishes',
      kind: 'ERROR',
      code: 'NEGATIVE_MARGIN_DISH',
      severity: 'high',
      title: {
        ru: `Убыточные блюда в меню (${negativeDishes.map(d => d.name).join(', ')})`,
        uz: `Zarar keltirayotgan taomlar (${negativeDishes.map(d => d.name).join(', ')})`,
        en: `Negative-margin menu items (${negativeDishes.map(d => d.name).join(', ')})`,
      },
      detail: {
        ru: `Себестоимость ${negativeDishes.map(d => `«${d.name}» (${fmtUZS(d.costPrice)} при цене ${fmtUZS(d.price)})`).join(', ')} превышает цену продажи. Прямой убыток за период: ${fmtUZS(lossImpact)}.`,
        uz: `${negativeDishes.map(d => `«${d.name}» (${fmtUZS(d.costPrice)} / ${fmtUZS(d.price)})`).join(', ')} tannarxi sotish narxidan yuqori. Zarar: ${fmtUZS(lossImpact)}.`,
        en: `Cost exceeds selling price for ${negativeDishes.map(d => `${d.name} (${fmtUZS(d.costPrice)} vs ${fmtUZS(d.price)})`).join(', ')}. Period loss: ${fmtUZS(lossImpact)}.`,
      },
      recommendation: {
        ru: 'Повысьте цену в меню минимум на 30% выше себестоимости или пересмотрите граммовку ингредиентов.',
        uz: 'Menyu narxini tannarxdan kamida 30% yuqori belgilang yoki tarkibini qayta ko‘rib chiqing.',
        en: 'Raise menu prices at least 30% above ingredient cost or adjust portion recipes.',
      },
      amountImpact: Math.round(Math.max(1000, lossImpact)),
      dishIds: negativeDishes.map(d => d.dishId),
    });
  }

  // 8. HIGH_FOOD_COST (> 35% of revenue)
  if (input.overview.revenue > 0 && input.overview.foodCostPct > 35) {
    const ingTotal = input.overview.categoryBreakdown.find(c => c.category === 'INGREDIENTS')?.amount ?? 0;
    const excess = Math.max(0, ingTotal - input.overview.revenue * 0.32);
    findings.push({
      id: 'high-food-cost',
      kind: 'INEFFICIENCY',
      code: 'HIGH_FOOD_COST',
      severity: 'high',
      category: 'INGREDIENTS',
      title: {
        ru: `Завышенный Food Cost (${input.overview.foodCostPct.toFixed(1)}% при норме ≤ 35%)`,
        uz: `Food Cost me’yordan yuqori (${input.overview.foodCostPct.toFixed(1)}%, me’yor ≤ 35%)`,
        en: `High Food Cost (${input.overview.foodCostPct.toFixed(1)}% vs ≤ 35% benchmark)`,
      },
      detail: {
        ru: `Затраты на закуп ингредиентов (${fmtUZS(ingTotal)}) составили ${input.overview.foodCostPct.toFixed(1)}% от выручки при отраслевой норме 28–35%. Потенциал оптимизации до 32%: ${fmtUZS(excess)}.`,
        uz: `Masalliq xarajatlari (${fmtUZS(ingTotal)}) tushumning ${input.overview.foodCostPct.toFixed(1)}% ini tashkil qildi (me’yor 28–35%). Tejamkorlik salohiyati: ${fmtUZS(excess)}.`,
        en: `Ingredient spending (${fmtUZS(ingTotal)}) reached ${input.overview.foodCostPct.toFixed(1)}% of revenue (target 28–35%). Savings potential: ${fmtUZS(excess)}.`,
      },
      recommendation: {
        ru: 'Переключитесь на более дешёвых поставщиков, устраните дубликаты накладных и контролируйте списания на кухне.',
        uz: 'Arzonroq yetkazib beruvchilarga o‘ting, dublikatlarni bartaraf eting va oshxona chiqindilarini nazorat qiling.',
        en: 'Consolidate orders with lowest-cost suppliers, eliminate invoice errors, and tighten kitchen portion control.',
      },
      amountImpact: Math.round(excess),
    });
  }

  // 9. HIGH_LABOR_COST (> 30% of revenue)
  if (input.overview.revenue > 0 && input.overview.laborCostPct > 30) {
    const salTotal = input.overview.categoryBreakdown.find(c => c.category === 'SALARY')?.amount ?? 0;
    const excess = Math.max(0, salTotal - input.overview.revenue * 0.28);
    findings.push({
      id: 'high-labor-cost',
      kind: 'INEFFICIENCY',
      code: 'HIGH_LABOR_COST',
      severity: 'medium',
      category: 'SALARY',
      title: {
        ru: `Высокая доля ФОТ в выручке (${input.overview.laborCostPct.toFixed(1)}%)`,
        uz: `Ish haqi ulushi yuqori (${input.overview.laborCostPct.toFixed(1)}%)`,
        en: `Elevated labor cost ratio (${input.overview.laborCostPct.toFixed(1)}%)`,
      },
      detail: {
        ru: `Расходы на оплату труда (${fmtUZS(salTotal)}) превышают целевой порог 30% от выручки на ${fmtUZS(excess)}.`,
        uz: `Ish haqi xarajatlari (${fmtUZS(salTotal)}) tushumning 30% me’yoridan ${fmtUZS(excess)} ga oshgan.`,
        en: `Payroll expenses (${fmtUZS(salTotal)}) exceed the 30% revenue benchmark by ${fmtUZS(excess)}.`,
      },
      recommendation: {
        ru: 'Оптимизируйте графики смен под пиковые часы заказов из тепловой карты и сократите сверхурочные.',
        uz: 'Xodimlar jadvalini buyurtmalar eng ko‘p soatlariga moslashtiring va qo‘shimcha smenalarni kamaytiring.',
        en: 'Align staff shifts with peak order hours shown in the heatmap to reduce idle overtime.',
      },
      amountImpact: Math.round(excess),
    });
  }

  // 9b. KITCHEN_COGS_VARIANCE (actual INGREDIENTS spend vs recipe-based TheoreticalCogs)
  const ingSpend = input.overview.categoryBreakdown.find(c => c.category === 'INGREDIENTS')?.amount ?? 0;
  const theoreticalCogs = input.overview.TheoreticalCogs;
  if (theoreticalCogs > 0 && ingSpend > theoreticalCogs * 1.35 && ingSpend - theoreticalCogs > 500_000) {
    const variance = Math.round(ingSpend - theoreticalCogs);
    const variancePct = ((ingSpend - theoreticalCogs) / theoreticalCogs) * 100;
    findings.push({
      id: 'kitchen-cogs-variance',
      kind: 'INEFFICIENCY',
      code: 'KITCHEN_COGS_VARIANCE',
      severity: ingSpend > theoreticalCogs * 1.6 ? 'high' : 'medium',
      category: 'INGREDIENTS',
      title: {
        ru: `Расхождение закупок и себестоимости кухни (+${variancePct.toFixed(0)}%)`,
        uz: `Oshxona xarid va tannarx tafovuti (+${variancePct.toFixed(0)}%)`,
        en: `Kitchen COGS variance vs recipes (+${variancePct.toFixed(0)}%)`,
      },
      detail: {
        ru: `Фактический закуп продуктов (${fmtUZS(ingSpend)}) превышает расчётную себестоимость проданных блюд (${fmtUZS(theoreticalCogs)}) на ${fmtUZS(variance)}, что указывает на перерасход, списания или неучтённые потери.`,
        uz: `Haqiqiy masalliq xaridi (${fmtUZS(ingSpend)}) sotilgan taomlarning hisobiy tannarxidan (${fmtUZS(theoreticalCogs)}) ${fmtUZS(variance)} ga yuqori.`,
        en: `Actual ingredient spend (${fmtUZS(ingSpend)}) exceeds theoretical recipe COGS (${fmtUZS(theoreticalCogs)}) by ${fmtUZS(variance)}, indicating unrecorded kitchen waste, over-portioning, or shrinkage.`,
      },
      recommendation: {
        ru: 'Проведите инвентаризацию кухни, сверьте граммовку порций по техкартам и исключите дублирующие приходы.',
        uz: 'Oshxona inventarizatsiyasini o‘tkazing, porsiya me’yorlarini tekshiring va takroriy xaridlarni bartaraf eting.',
        en: 'Conduct a kitchen inventory audit, verify portion control against recipes, and remove duplicate invoices.',
      },
      amountImpact: variance,
      metrics: {
        actualIngredients: Math.round(ingSpend),
        theoreticalCogs: Math.round(theoreticalCogs),
        variancePct: Number(variancePct.toFixed(1)),
      },
    });
  }

  // 9c. HIGH_PRIME_COST (INGREDIENTS + PACKAGING + SALARY > 65% of revenue)
  const pkgSpend = input.overview.categoryBreakdown.find(c => c.category === 'PACKAGING')?.amount ?? 0;
  const salSpend = input.overview.categoryBreakdown.find(c => c.category === 'SALARY')?.amount ?? 0;
  const primeCost = ingSpend + pkgSpend + salSpend;
  const primeCostPct = input.overview.revenue > 0 ? (primeCost / input.overview.revenue) * 100 : 0;
  if (input.overview.revenue > 0 && primeCostPct > 65) {
    const excess = Math.max(0, Math.round(primeCost - input.overview.revenue * 0.62));
    if (excess > 0) {
      findings.push({
        id: 'high-prime-cost',
        kind: 'INEFFICIENCY',
        code: 'HIGH_PRIME_COST',
        severity: primeCostPct > 75 ? 'high' : 'medium',
        title: {
          ru: `Высокий Prime Cost (${primeCostPct.toFixed(1)}% при норме ≤ 65%)`,
          uz: `Yuqori Prime Cost (${primeCostPct.toFixed(1)}%, me’yor ≤ 65%)`,
          en: `Elevated Prime Cost (${primeCostPct.toFixed(1)}% vs ≤ 65% benchmark)`,
        },
        detail: {
          ru: `Совокупный Prime Cost (продукты, упаковка и ФОТ: ${fmtUZS(primeCost)}) составил ${primeCostPct.toFixed(1)}% от выручки. Перерасход к целевому уровню 62%: ${fmtUZS(excess)}.`,
          uz: `Jami Prime Cost (masalliq, qadoq va ish haqi: ${fmtUZS(primeCost)}) tushumning ${primeCostPct.toFixed(1)}% ini tashkil etdi. Maqsaddan ortiqcha: ${fmtUZS(excess)}.`,
          en: `Combined ingredients, packaging, and payroll (${fmtUZS(primeCost)}) reached ${primeCostPct.toFixed(1)}% of revenue, exceeding the 62% target by ${fmtUZS(excess)}.`,
        },
        recommendation: {
          ru: 'Совместите оптимизацию закупочных цен с контролем сменного графика кухни и пересмотром цен меню.',
          uz: 'Xarid narxlarini pasaytirishni smena jadvalini optimallashtirish va menyu narxlarini qayta ko‘rish bilan birga olib boring.',
          en: 'Pair supplier cost reduction with shift scheduling and menu price adjustments to restore Prime Cost ≤ 65%.',
        },
        amountImpact: excess,
        metrics: { primeCost: Math.round(primeCost), primeCostPct: Number(primeCostPct.toFixed(1)) },
      });
    }
  }

  // 10. ADMIN_UTILITY_SPIKE (UTILITIES + COMMUNICATION + RENT growth > 25%)
  const adminCats = new Set<ExpenseCategory>(['UTILITIES', 'COMMUNICATION', 'RENT']);
  const currAdmin = input.expensesPeriod.filter(e => adminCats.has(e.category)).reduce((s, e) => s + e.amount, 0);
  const prevAdmin = input.expensesPrevPeriod.filter(e => adminCats.has(e.category)).reduce((s, e) => s + e.amount, 0);
  if (prevAdmin > 0 && (currAdmin - prevAdmin) / prevAdmin > 0.25) {
    const delta = currAdmin - prevAdmin;
    const growth = ((currAdmin - prevAdmin) / prevAdmin) * 100;
    findings.push({
      id: 'admin-utility-spike',
      kind: 'INEFFICIENCY',
      code: 'ADMIN_UTILITY_SPIKE',
      severity: 'high',
      category: 'UTILITIES',
      title: {
        ru: `Резкий рост административно-коммунальных расходов (+${growth.toFixed(0)}%)`,
        uz: `Ma’muriy va kommunal xarajatlar keskin oshdi (+${growth.toFixed(0)}%)`,
        en: `Surge in administrative & utility expenses (+${growth.toFixed(0)}%)`,
      },
      detail: {
        ru: `Электроэнергия, аренда и связь выросли с ${fmtUZS(prevAdmin)} до ${fmtUZS(currAdmin)} (+${fmtUZS(delta)}) за период.`,
        uz: `Elektr, ijara va aloqa xarajatlari ${fmtUZS(prevAdmin)} dan ${fmtUZS(currAdmin)} gacha (+${fmtUZS(delta)}) oshdi.`,
        en: `Utilities, rent, and communication rose from ${fmtUZS(prevAdmin)} to ${fmtUZS(currAdmin)} (+${fmtUZS(delta)}).`,
      },
      recommendation: {
        ru: 'Проведите аудит энергопотребления кухонного оборудования, пересмотрите тарифы связи и проверьте аномальные счета.',
        uz: 'Oshxona jihozlarining elektr sarfini, aloqa tariflarini va g‘ayrioddiy hisob-kitoblarni tekshiring.',
        en: 'Audit kitchen electricity usage, switch telecom plans, and verify anomalous utility charges.',
      },
      amountImpact: Math.round(delta),
      metrics: { prevAdmin: Math.round(prevAdmin), currAdmin: Math.round(currAdmin), growthPct: Number(growth.toFixed(1)) },
    });
  }

  // 10b. HIGH_TAX_BURDEN (Priority: TAXES > 14% of revenue)
  const prioritySummary = computePriorityExpenseSummary({
    overview: input.overview,
    expenses: input.expensesPeriod,
  });
  if (input.overview.revenue > 0 && prioritySummary.taxesTotal > 0 && prioritySummary.taxesPctOfRevenue > 14) {
    const excessTax = Math.max(0, Math.round(prioritySummary.taxesTotal - input.overview.revenue * 0.12));
    findings.push({
      id: 'high-tax-burden',
      kind: 'RISK',
      code: 'HIGH_TAX_BURDEN',
      severity: prioritySummary.taxesPctOfRevenue > 18 ? 'high' : 'medium',
      category: 'TAXES',
      title: {
        ru: `Высокая налоговая нагрузка (${prioritySummary.taxesPctOfRevenue.toFixed(1)}% от выручки)`,
        uz: `Yuqori soliq yuki (tushumning ${prioritySummary.taxesPctOfRevenue.toFixed(1)}%)`,
        en: `Elevated tax burden (${prioritySummary.taxesPctOfRevenue.toFixed(1)}% of revenue)`,
      },
      detail: {
        ru: `Налоги и сборы составили ${fmtUZS(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue.toFixed(1)}% выручки, ${prioritySummary.taxesShareOfExpensesPct.toFixed(1)}% всех расходов).`,
        uz: `Soliqlar va yig‘imlar ${fmtUZS(prioritySummary.taxesTotal)} ni tashkil etdi (tushumning ${prioritySummary.taxesPctOfRevenue.toFixed(1)}%).`,
        en: `Taxes & fees reached ${fmtUZS(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue.toFixed(1)}% of revenue, ${prioritySummary.taxesShareOfExpensesPct.toFixed(1)}% of expenses).`,
      },
      recommendation: {
        ru: 'Сверьте вычеты входящего НДС по электронным счетам-фактурам и проверьте налоговый режим с бухгалтером.',
        uz: 'Elektron hisob-fakturalar bo‘yicha QQS hisobga olinishi va soliq rejimini buxgalter bilan tekshiring.',
        en: 'Reconcile input VAT credits against e-invoices and review tax regime optimization with your accountant.',
      },
      amountImpact: excessTax,
      metrics: {
        taxesTotal: prioritySummary.taxesTotal,
        taxesPctOfRevenue: prioritySummary.taxesPctOfRevenue,
      },
    });
  }

  // 10c. HIGH_ELECTRICITY_COST (Priority: Electricity > 4% of revenue or > 25% spike vs prev period)
  const prevElectricityTotal = Math.round(
    input.expensesPrevPeriod
      .filter(e => e.category === 'UTILITIES' && isElectricityExpense(e))
      .reduce((s, e) => s + e.amount, 0),
  );
  const elecPctRev =
    input.overview.revenue > 0 ? (prioritySummary.electricityTotal / input.overview.revenue) * 100 : 0;
  const elecGrowth =
    prevElectricityTotal > 0 ? (prioritySummary.electricityTotal - prevElectricityTotal) / prevElectricityTotal : 0;
  if (prioritySummary.electricityTotal > 0 && (elecPctRev > 4 || elecGrowth > 0.25)) {
    const targetElec =
      prevElectricityTotal > 0
        ? prevElectricityTotal * 1.1
        : input.overview.revenue > 0
          ? input.overview.revenue * 0.03
          : prioritySummary.electricityTotal * 0.85;
    const excessElec = Math.max(0, Math.round(prioritySummary.electricityTotal - targetElec));
    if (excessElec > 0) {
      const kwhTextRu =
        prioritySummary.electricityKwh > 0
          ? ` (${Math.round(prioritySummary.electricityKwh).toLocaleString('ru-RU')} кВт·ч)`
          : '';
      const kwhTextUz =
        prioritySummary.electricityKwh > 0
          ? ` (${Math.round(prioritySummary.electricityKwh).toLocaleString('ru-RU')} kVt·soat)`
          : '';
      const kwhTextEn =
        prioritySummary.electricityKwh > 0
          ? ` (${Math.round(prioritySummary.electricityKwh).toLocaleString('ru-RU')} kWh)`
          : '';
      findings.push({
        id: 'high-electricity-cost',
        kind: 'INEFFICIENCY',
        code: 'HIGH_ELECTRICITY_COST',
        severity: elecPctRev > 6 || elecGrowth > 0.5 ? 'high' : 'medium',
        category: 'UTILITIES',
        title: {
          ru: `Приоритет: высокий расход электроэнергии (${fmtUZS(prioritySummary.electricityTotal)})${kwhTextRu}`,
          uz: `Ustuvor: elektr energiyasi sarfi yuqori (${fmtUZS(prioritySummary.electricityTotal)})${kwhTextUz}`,
          en: `Priority: high electricity spend (${fmtUZS(prioritySummary.electricityTotal)})${kwhTextEn}`,
        },
        detail: {
          ru: `Затраты на электроэнергию составили ${fmtUZS(prioritySummary.electricityTotal)}${kwhTextRu}${input.overview.revenue > 0 ? ` (${elecPctRev.toFixed(1)}% от выручки)` : ''}.`,
          uz: `Elektr energiyasi xarajatlari ${fmtUZS(prioritySummary.electricityTotal)}${kwhTextUz}${input.overview.revenue > 0 ? ` (tushumning ${elecPctRev.toFixed(1)}%)` : ''} ni tashkil etdi.`,
          en: `Electricity costs totaled ${fmtUZS(prioritySummary.electricityTotal)}${kwhTextEn}${input.overview.revenue > 0 ? ` (${elecPctRev.toFixed(1)}% of revenue)` : ''}.`,
        },
        recommendation: {
          ru: 'Проверьте ночной и пиковый тарифы РЭС, уплотнители холодильных камер и график работы тепловых печей.',
          uz: 'Tungi/kunduzgi elektr tariflarini, sovutgich kameralari va pechlar ish rejimini tekshiring.',
          en: 'Audit peak vs off-peak electricity tariffs, cold-room seals, and kitchen oven schedules.',
        },
        amountImpact: excessElec,
        metrics: {
          electricityTotal: prioritySummary.electricityTotal,
          electricityKwh: prioritySummary.electricityKwh,
        },
      });
    }
  }

  // 11. SUPPLIER_PRICE_SPIKE (unitPrice jumped > 15% over 60d median for same supplier+item)
  const bySupItem = new Map<string, AnalysisExpenseInput[]>();
  for (const exp of input.expensesAll90d) {
    if (duplicateExtraIds.has(exp.id)) continue;
    if (exp.unitPrice === null || exp.unitPrice <= 0 || exp.quantity === null || exp.quantity <= 0) continue;
    const sup = normalizeKey(exp.supplierId ?? exp.supplierName);
    const item = normalizeKey(exp.itemName);
    if (!sup || !item) continue;
    const key = `${sup}::${item}::${normalizeKey(exp.unit)}`;
    const list = bySupItem.get(key) ?? [];
    list.push(exp);
    bySupItem.set(key, list);
  }
  for (const [, list] of bySupItem.entries()) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.spentAt.getTime() - b.spentAt.getTime());
    const latest = sorted[sorted.length - 1]!;
    if (!periodIds.has(latest.id)) continue;
    const earlierPrices = sorted.slice(0, -1).map(e => e.unitPrice!);
    const baseline = median(earlierPrices);
    if (baseline > 0 && (latest.unitPrice! - baseline) / baseline > 0.15) {
      const pct = ((latest.unitPrice! - baseline) / baseline) * 100;
      const impact = Math.round((latest.unitPrice! - baseline) * (latest.quantity ?? 1));
      findings.push({
        id: `price-spike-${latest.id}`,
        kind: 'INEFFICIENCY',
        code: 'SUPPLIER_PRICE_SPIKE',
        severity: 'medium',
        category: latest.category,
        supplierId: latest.supplierId ?? undefined,
        title: {
          ru: `Рост закупочной цены у «${latest.supplierName ?? 'Поставщик'}»: ${latest.itemName} (+${pct.toFixed(1)}%)`,
          uz: `Narx oshishi («${latest.supplierName ?? 'Yetkazib beruvchi'}»): ${latest.itemName} (+${pct.toFixed(1)}%)`,
          en: `Supplier price spike from ${latest.supplierName ?? 'Supplier'}: ${latest.itemName} (+${pct.toFixed(1)}%)`,
        },
        detail: {
          ru: `Цена за ${latest.unit ?? 'ед.'} выросла с медианных ${fmtUZS(baseline)} до ${fmtUZS(latest.unitPrice!)}. Переплата по партии: ${fmtUZS(impact)}.`,
          uz: `${latest.unit ?? 'birlik'} narxi ${fmtUZS(baseline)} dan ${fmtUZS(latest.unitPrice!)} gacha ko‘tarildi. Ortiqcha xarajat: ${fmtUZS(impact)}.`,
          en: `Unit price increased from ${fmtUZS(baseline)} median to ${fmtUZS(latest.unitPrice!)}. Extra batch cost: ${fmtUZS(impact)}.`,
        },
        recommendation: {
          ru: 'Зафиксируйте цену контрактом или запросите альтернативные коммерческие предложения.',
          uz: 'Yetkazib beruvchi bilan narxni shartnomada belgilang yoki muqobil takliflarni so‘rang.',
          en: 'Lock in contract pricing or request quotes from competing suppliers.',
        },
        amountImpact: impact,
        expenseIds: [latest.id],
        metrics: {
          baselineUnitPrice: Math.round(baseline),
          latestUnitPrice: Math.round(latest.unitPrice!),
          spikePct: Number(pct.toFixed(1)),
        },
      });
    }
  }

  // 12. CHEAPER_SUPPLIER_EXISTS (same item bought from multiple suppliers at > 8% higher price)
  const byItemUnit = new Map<string, AnalysisExpenseInput[]>();
  for (const exp of input.expensesAll90d) {
    if (duplicateExtraIds.has(exp.id)) continue;
    if (exp.unitPrice === null || exp.unitPrice <= 0 || exp.quantity === null || exp.quantity <= 0) continue;
    if (!exp.supplierName && !exp.supplierId) continue;
    const item = normalizeKey(exp.itemName);
    if (!item) continue;
    const key = `${item}::${normalizeKey(exp.unit)}`;
    const list = byItemUnit.get(key) ?? [];
    list.push(exp);
    byItemUnit.set(key, list);
  }
  for (const [, list] of byItemUnit.entries()) {
    const suppliers = new Set(list.map(e => normalizeKey(e.supplierId ?? e.supplierName)));
    if (suppliers.size < 2) continue;
    let minExp = list[0]!;
    for (const e of list) {
      if (e.unitPrice! < minExp.unitPrice!) minExp = e;
    }
    const overpriced = list.filter(e => periodIds.has(e.id) && e.unitPrice! > minExp.unitPrice! * 1.08);
    if (overpriced.length === 0) continue;
    const maxOverpricedUnit = Math.max(...overpriced.map(e => e.unitPrice!));
    const savings = overpriced.reduce((s, e) => s + (e.unitPrice! - minExp.unitPrice!) * (e.quantity ?? 1), 0);
    findings.push({
      id: `cheaper-sup-${normalizeKey(minExp.itemName)}`,
      kind: 'INEFFICIENCY',
      code: 'CHEAPER_SUPPLIER_EXISTS',
      severity: 'medium',
      category: minExp.category,
      supplierId: minExp.supplierId ?? undefined,
      title: {
        ru: `Переплата за «${minExp.itemName}» — есть поставщик дешевле`,
        uz: `«${minExp.itemName}» uchun ortiqcha to‘lov — arzonroq yetkazib beruvchi bor`,
        en: `Overpaying for "${minExp.itemName}" — cheaper supplier available`,
      },
      detail: {
        ru: `Позиция закупалась до ${fmtUZS(maxOverpricedUnit)}/${minExp.unit ?? 'ед.'}, хотя у «${minExp.supplierName}» цена ${fmtUZS(minExp.unitPrice!)}. Переплата: ${fmtUZS(savings)}.`,
        uz: `Mahsulot ${fmtUZS(maxOverpricedUnit)}/${minExp.unit ?? 'dona'} narxda olingan, «${minExp.supplierName}» da esa ${fmtUZS(minExp.unitPrice!)}. Ortiqcha sarf: ${fmtUZS(savings)}.`,
        en: `Purchased at up to ${fmtUZS(maxOverpricedUnit)}/${minExp.unit ?? 'unit'} while ${minExp.supplierName} offers ${fmtUZS(minExp.unitPrice!)}. Savings: ${fmtUZS(savings)}.`,
      },
      recommendation: {
        ru: `Переведите закупки «${minExp.itemName}» к «${minExp.supplierName}» для экономии ${fmtUZS(savings)}.`,
        uz: `${fmtUZS(savings)} tejash uchun «${minExp.itemName}» xaridini «${minExp.supplierName}» ga o‘tkazing.`,
        en: `Shift "${minExp.itemName}" procurement to ${minExp.supplierName} to save ${fmtUZS(savings)}.`,
      },
      amountImpact: Math.round(savings),
      expenseIds: overpriced.map(e => e.id),
      metrics: {
        minUnitPrice: Math.round(minExp.unitPrice!),
        maxUnitPrice: Math.round(maxOverpricedUnit),
      },
    });
  }

  // 13. CATEGORY_GROWTH_OUTPACES_REVENUE
  for (const cat of input.overview.categoryBreakdown) {
    if (cat.prevAmount <= 0 || cat.amount < 500_000) continue;
    if (cat.growthPct - input.overview.revenueDeltaPct > 20) {
      const allowed = cat.prevAmount * (1 + Math.max(0, input.overview.revenueDeltaPct) / 100);
      const excess = Math.max(0, Math.round(cat.amount - allowed));
      if (excess < 100_000) continue;
      findings.push({
        id: `cat-growth-${cat.category}`,
        kind: 'INEFFICIENCY',
        code: 'CATEGORY_GROWTH_OUTPACES_REVENUE',
        severity: 'medium',
        category: cat.category,
        title: {
          ru: `Рост «${categoryLabel(cat.category, 'ru')}» (+${cat.growthPct.toFixed(0)}%) опережает выручку`,
          uz: `«${categoryLabel(cat.category, 'uz')}» o‘sishi (+${cat.growthPct.toFixed(0)}%) tushumdan tezroq`,
          en: `${categoryLabel(cat.category, 'en')} growth (+${cat.growthPct.toFixed(0)}%) outpaces revenue`,
        },
        detail: {
          ru: `Категория выросла на ${cat.growthPct.toFixed(1)}% при динамике выручки ${input.overview.revenueDeltaPct.toFixed(1)}%. Опережающий перерасход: ${fmtUZS(excess)}.`,
          uz: `Toifa xarajatlari ${cat.growthPct.toFixed(1)}% ga oshdi, tushum esa ${input.overview.revenueDeltaPct.toFixed(1)}% o‘zgardi.`,
          en: `Spending grew ${cat.growthPct.toFixed(1)}% while revenue changed ${input.overview.revenueDeltaPct.toFixed(1)}%. Excess growth: ${fmtUZS(excess)}.`,
        },
        recommendation: {
          ru: `Установите жёсткий месячный лимит по категории «${categoryLabel(cat.category, 'ru')}» и проверьте причины роста.`,
          uz: `«${categoryLabel(cat.category, 'uz')}» toifasi uchun oylik limit o‘rnating va o‘sish sabablarini tekshiring.`,
          en: `Set a strict monthly budget cap for ${categoryLabel(cat.category, 'en')} and audit cost drivers.`,
        },
        amountImpact: excess,
      });
    }
  }

  // 14. BUDGET_OVERRUN & BUDGET_FORECAST_OVERRUN
  for (const budget of input.budgets) {
    if (budget.limit <= 0) continue;
    if (budget.actual > budget.limit) {
      const overrun = Math.round(budget.actual - budget.limit);
      findings.push({
        id: `budget-over-${budget.category}`,
        kind: 'RISK',
        code: 'BUDGET_OVERRUN',
        severity: 'high',
        category: budget.category,
        title: {
          ru: `Превышен бюджет «${categoryLabel(budget.category, 'ru')}» (+${fmtUZS(overrun)})`,
          uz: `«${categoryLabel(budget.category, 'uz')}» byudjeti oshib ketdi (+${fmtUZS(overrun)})`,
          en: `Budget overrun in ${categoryLabel(budget.category, 'en')} (+${fmtUZS(overrun)})`,
        },
        detail: {
          ru: `Факт (${fmtUZS(budget.actual)}) превысил месячный лимит (${fmtUZS(budget.limit)}) на ${((overrun / budget.limit) * 100).toFixed(1)}%.`,
          uz: `Haqiqiy xarajat (${fmtUZS(budget.actual)}) oylik limitdan (${fmtUZS(budget.limit)}) oshib ketdi.`,
          en: `Actual spend (${fmtUZS(budget.actual)}) exceeded monthly cap (${fmtUZS(budget.limit)}) by ${((overrun / budget.limit) * 100).toFixed(1)}%.`,
        },
        recommendation: {
          ru: 'Заморозьте необязательные траты в этой категории и разберите причины перерасхода.',
          uz: 'Ushbu toifadagi ixtiyoriy xarajatlarni to‘xtating va sababini tahlil qiling.',
          en: 'Freeze non-essential spend in this category and review root causes.',
        },
        amountImpact: overrun,
      });
    } else if (budget.forecast > budget.limit * 1.05) {
      const projectedOver = Math.round(budget.forecast - budget.limit);
      findings.push({
        id: `budget-forecast-${budget.category}`,
        kind: 'RISK',
        code: 'BUDGET_FORECAST_OVERRUN',
        severity: 'medium',
        category: budget.category,
        title: {
          ru: `Прогноз превышения бюджета «${categoryLabel(budget.category, 'ru')}»`,
          uz: `«${categoryLabel(budget.category, 'uz')}» byudjeti oshish xavfi`,
          en: `Forecast budget overrun in ${categoryLabel(budget.category, 'en')}`,
        },
        detail: {
          ru: `При текущем темпе трат прогноз на конец месяца — ${fmtUZS(budget.forecast)} при лимите ${fmtUZS(budget.limit)} (+${fmtUZS(projectedOver)}).`,
          uz: `Joriy sur’atda oy oxirigacha xarajat ${fmtUZS(budget.forecast)} ga yetadi (limit ${fmtUZS(budget.limit)}).`,
          en: `At current run-rate, month-end spend will reach ${fmtUZS(budget.forecast)} vs ${fmtUZS(budget.limit)} limit.`,
        },
        recommendation: {
          ru: 'Снизьте дневной темп закупок до конца месяца, чтобы уложиться в лимит.',
          uz: 'Oy oxirigacha kunlik xaridlarni kamaytirib, limit ichida qoling.',
          en: 'Pace remaining purchases through month-end to stay within budget.',
        },
        amountImpact: projectedOver,
      });
    }
  }

  // 15. LOW_PERFORMING_DISHES (Class C with low margin < 25% and positive margin)
  const lowPerformers = input.dishes.filter(
    d => d.abcClass === 'C' && d.quantitySold > 0 && d.price > 0 && d.costPrice < d.price && (d.price - d.costPrice) / d.price < 0.25,
  );
  if (lowPerformers.length > 0) {
    findings.push({
      id: 'low-performing-dishes',
      kind: 'INEFFICIENCY',
      code: 'LOW_PERFORMING_DISHES',
      severity: 'low',
      title: {
        ru: `Низкомаржинальные блюда класса C (${lowPerformers.length} поз.)`,
        uz: `Past rentabelli C-sinf taomlar (${lowPerformers.length} ta)`,
        en: `Low-margin Class C dishes (${lowPerformers.length})`,
      },
      detail: {
        ru: `Позиции ${lowPerformers.map(d => `«${d.name}»`).join(', ')} дают менее 5% выручки при марже ниже 25%.`,
        uz: `${lowPerformers.map(d => `«${d.name}»`).join(', ')} taomlari kam tushum va 25% dan past foyda bermoqda.`,
        en: `${lowPerformers.map(d => d.name).join(', ')} contribute <5% of revenue with <25% margin.`,
      },
      recommendation: {
        ru: 'Удалите эти позиции из меню или переработайте рецептуру, чтобы снизить замороженные запасы продуктов.',
        uz: 'Ombor xarajatlarini kamaytirish uchun ushbu taomlarni menyudan chiqaring yoki retseptini yangilang.',
        en: 'Consider pruning these dishes or revising recipes to reduce ingredient waste.',
      },
      amountImpact: Math.round(lowPerformers.reduce((s, d) => s + d.revenue * 0.15, 0)),
      dishIds: lowPerformers.map(d => d.dishId),
    });
  }

  // 16. HIGH_CANCELLATION (> 10%)
  if (input.overview.cancelRatePct > 10 && input.overview.cancelledOrders >= 2) {
    findings.push({
      id: 'high-cancellation',
      kind: 'RISK',
      code: 'HIGH_CANCELLATION',
      severity: 'medium',
      title: {
        ru: `Высокий процент отмен заказов (${input.overview.cancelRatePct.toFixed(1)}%)`,
        uz: `Bekor qilingan buyurtmalar ulushi yuqori (${input.overview.cancelRatePct.toFixed(1)}%)`,
        en: `High order cancellation rate (${input.overview.cancelRatePct.toFixed(1)}%)`,
      },
      detail: {
        ru: `Отменено ${input.overview.cancelledOrders} заказов (${input.overview.cancelRatePct.toFixed(1)}%). Упущенная выручка составила ${fmtUZS(input.overview.lostRevenue)}.`,
        uz: `${input.overview.cancelledOrders} ta buyurtma bekor qilindi (${input.overview.cancelRatePct.toFixed(1)}%). Yo‘qotilgan tushum: ${fmtUZS(input.overview.lostRevenue)}.`,
        en: `${input.overview.cancelledOrders} orders cancelled (${input.overview.cancelRatePct.toFixed(1)}%), causing ${fmtUZS(input.overview.lostRevenue)} in lost revenue.`,
      },
      recommendation: {
        ru: 'Ускорьте подтверждение заказов в пиковые часы и проверьте актуальность стоп-листа.',
        uz: 'Tig‘iz soatlarda buyurtmalarni tezroq tasdiqlang va stop-listni yangilang.',
        en: 'Speed up order acceptance during peak hours and keep dish availability up to date.',
      },
      amountImpact: Math.round(input.overview.lostRevenue),
    });
  }

  const severityRank: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };
  const isPriorityFinding = (f: Finding) =>
    f.category === 'TAXES' ||
    f.category === 'UTILITIES' ||
    f.category === 'COMMUNICATION' ||
    f.code === 'ADMIN_UTILITY_SPIKE' ||
    f.code === 'HIGH_TAX_BURDEN' ||
    f.code === 'HIGH_ELECTRICITY_COST';

  findings.sort((a, b) => {
    const rankDiff = severityRank[b.severity] - severityRank[a.severity];
    if (rankDiff !== 0) return rankDiff;
    const prioDiff = Number(isPriorityFinding(b)) - Number(isPriorityFinding(a));
    if (prioDiff !== 0) return prioDiff;
    return b.amountImpact - a.amountImpact;
  });
  return findings;
}

const NON_CASH_SAVING_CODES = new Set([
  'CATEGORY_MISMATCH',
  'FUTURE_OR_INVALID_DATE',
  'HIGH_CANCELLATION',
  'BUDGET_FORECAST_OVERRUN',
  'HIGH_TAX_BURDEN',
]);

const ITEM_EXPENSE_CODES = new Set([
  'DUPLICATE_INVOICE',
  'AMOUNT_MISMATCH',
  'AMOUNT_OUTLIER',
  'SUPPLIER_PRICE_SPIKE',
  'CHEAPER_SUPPLIER_EXISTS',
]);

const SINGLE_CAT_MACRO_CODES = new Set([
  'HIGH_FOOD_COST',
  'KITCHEN_COGS_VARIANCE',
  'HIGH_LABOR_COST',
  'HIGH_ELECTRICITY_COST',
  'CATEGORY_GROWTH_OUTPACES_REVENUE',
  'BUDGET_OVERRUN',
]);

export function calculateDeduplicatedSavings(findings: Finding[]): number {
  const itemSavingsByCat = new Map<ExpenseCategory, number>();
  const macroMaxByCat = new Map<ExpenseCategory, number>();
  const claimedByExpenseId = new Map<string, number>();

  let adminUtilitySpikeImpact = 0;
  let highPrimeCostImpact = 0;
  let otherSavings = 0;

  const itemFindings = findings
    .filter(f => ITEM_EXPENSE_CODES.has(f.code))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'ERROR' ? -1 : 1;
      return b.amountImpact - a.amountImpact;
    });

  for (const f of itemFindings) {
    let targetIds = f.expenseIds ?? [];
    if (f.code === 'DUPLICATE_INVOICE') {
      if (targetIds.length > 1) {
        targetIds = targetIds.slice(1);
      } else if (typeof f.metrics?.duplicateExpenseId === 'string') {
        targetIds = [f.metrics.duplicateExpenseId];
      }
    }

    let alreadyClaimed = 0;
    for (const id of targetIds) {
      alreadyClaimed += claimedByExpenseId.get(id) ?? 0;
    }

    const incremental = Math.max(0, f.amountImpact - alreadyClaimed);
    if (incremental > 0) {
      const cat = f.category ?? 'OTHER';
      itemSavingsByCat.set(cat, (itemSavingsByCat.get(cat) ?? 0) + incremental);
      if (targetIds.length === 1) {
        const id = targetIds[0]!;
        claimedByExpenseId.set(id, (claimedByExpenseId.get(id) ?? 0) + incremental);
      } else if (targetIds.length > 1) {
        const share = incremental / targetIds.length;
        for (const id of targetIds) {
          claimedByExpenseId.set(id, (claimedByExpenseId.get(id) ?? 0) + share);
        }
      }
    }
  }

  for (const f of findings) {
    if (NON_CASH_SAVING_CODES.has(f.code) || ITEM_EXPENSE_CODES.has(f.code)) continue;
    if (SINGLE_CAT_MACRO_CODES.has(f.code) && f.category) {
      macroMaxByCat.set(f.category, Math.max(macroMaxByCat.get(f.category) ?? 0, f.amountImpact));
    } else if (f.code === 'ADMIN_UTILITY_SPIKE') {
      adminUtilitySpikeImpact = Math.max(adminUtilitySpikeImpact, f.amountImpact);
    } else if (f.code === 'HIGH_PRIME_COST') {
      highPrimeCostImpact = Math.max(highPrimeCostImpact, f.amountImpact);
    } else {
      otherSavings += f.amountImpact;
    }
  }

  const categoryTotals = new Map<ExpenseCategory, number>();
  const allCats = new Set([...itemSavingsByCat.keys(), ...macroMaxByCat.keys()]);
  for (const cat of allCats) {
    categoryTotals.set(cat, Math.max(itemSavingsByCat.get(cat) ?? 0, macroMaxByCat.get(cat) ?? 0));
  }

  const adminCats: ExpenseCategory[] = ['UTILITIES', 'COMMUNICATION', 'RENT'];
  const adminSubTotal = adminCats.reduce((sum, cat) => sum + (categoryTotals.get(cat) ?? 0), 0);
  const adminEffective = Math.max(adminSubTotal, adminUtilitySpikeImpact);

  const primeCats: ExpenseCategory[] = ['INGREDIENTS', 'PACKAGING', 'SALARY'];
  const primeSubTotal = primeCats.reduce((sum, cat) => sum + (categoryTotals.get(cat) ?? 0), 0);
  const primeEffective = Math.max(primeSubTotal, highPrimeCostImpact);

  const coveredCats = new Set<ExpenseCategory>([...adminCats, ...primeCats]);
  let remainingCategoryTotal = 0;
  for (const [cat, val] of categoryTotals.entries()) {
    if (!coveredCats.has(cat)) {
      remainingCategoryTotal += val;
    }
  }

  return Math.round(adminEffective + primeEffective + remainingCategoryTotal + otherSavings);
}

export function buildHeuristicOptimizationReport(overview: BusinessKpiOverview, findings: Finding[]): AiOptimizationReport {
  let score = 100;
  let errorCount = 0;
  let inefficiencyCount = 0;
  let riskCount = 0;

  for (const f of findings) {
    if (f.kind === 'ERROR') errorCount++;
    else if (f.kind === 'INEFFICIENCY') inefficiencyCount++;
    else riskCount++;

    const deduction = f.severity === 'high' ? 9 : f.severity === 'medium' ? 5 : 2;
    score -= deduction;
  }
  const healthScore = Math.max(12, Math.min(100, score));

  // Deduplicate overlapping financial impact across identical expenses and nested category/prime-cost scopes
  const totalPotentialSavingUZS = calculateDeduplicatedSavings(findings);

  const statusLabel: Record<Language, string> =
    healthScore >= 80
      ? { ru: 'Отличное финансовое здоровье', uz: 'Moliyaviy holat a’lo', en: 'Healthy Financial State' }
      : healthScore >= 55
        ? { ru: 'Требуется оптимизация расходов', uz: 'Xarajatlarni optimallashtirish kerak', en: 'Optimization Needed' }
        : { ru: 'Критический уровень ошибок и перерасхода', uz: 'Xatolar va ortiqcha xarajatlar yuqori', en: 'Critical Cost & Error Alerts' };

  const prioritySummary = computePriorityExpenseSummary({ overview });

  const executiveSummary: Record<Language, string> = {
    ru: `Приоритетный контроль: налоги ${fmtUZS(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}% выручки), электричество и коммунальные ${fmtUZS(prioritySummary.utilitiesTotal)} (${prioritySummary.utilitiesPctOfRevenue}% выручки). Базовые расходы: ${fmtUZS(prioritySummary.baseTotal)}, дополнительные: ${fmtUZS(prioritySummary.additionalTotal)}. Обнаружено ${errorCount} ошибок, ${inefficiencyCount} неэффективных статей и ${riskCount} рисков (потенциал экономии ${fmtUZS(totalPotentialSavingUZS)}).`,
    uz: `Ustuvor nazorat: soliqlar ${fmtUZS(prioritySummary.taxesTotal)} (tushumning ${prioritySummary.taxesPctOfRevenue}%), elektr va kommunal ${fmtUZS(prioritySummary.utilitiesTotal)} (${prioritySummary.utilitiesPctOfRevenue}%). Asosiy xarajatlar: ${fmtUZS(prioritySummary.baseTotal)}, qo‘shimcha: ${fmtUZS(prioritySummary.additionalTotal)}. ${errorCount} ta xatolik, ${inefficiencyCount} ta samarasiz xarajat va ${riskCount} ta xavf aniqlandi (tejash ${fmtUZS(totalPotentialSavingUZS)}).`,
    en: `Priority spotlight: Taxes ${fmtUZS(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}% of revenue), Electricity & Utilities ${fmtUZS(prioritySummary.utilitiesTotal)} (${prioritySummary.utilitiesPctOfRevenue}% of revenue). Base expenses: ${fmtUZS(prioritySummary.baseTotal)}, Additional: ${fmtUZS(prioritySummary.additionalTotal)}. Found ${errorCount} errors, ${inefficiencyCount} inefficiencies, and ${riskCount} risks (savings potential ${fmtUZS(totalPotentialSavingUZS)}).`,
  };

  const prioritySortedFindings = [...findings].sort((a, b) => {
    const aPrio =
      a.category === 'TAXES'
        ? 3
        : a.category === 'UTILITIES' || a.category === 'COMMUNICATION' || a.code === 'ADMIN_UTILITY_SPIKE'
          ? 2
          : getExpensePriorityTier(a.category ?? 'OTHER') === 'BASE'
            ? 1
            : 0;
    const bPrio =
      b.category === 'TAXES'
        ? 3
        : b.category === 'UTILITIES' || b.category === 'COMMUNICATION' || b.code === 'ADMIN_UTILITY_SPIKE'
          ? 2
          : getExpensePriorityTier(b.category ?? 'OTHER') === 'BASE'
            ? 1
            : 0;
    if (a.severity !== b.severity) {
      const rank: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };
      return rank[b.severity] - rank[a.severity];
    }
    if (aPrio !== bPrio) return bPrio - aPrio;
    return b.amountImpact - a.amountImpact;
  });

  const recommendations: AiRecommendation[] = prioritySortedFindings.slice(0, 6).map((f, index) => ({
    id: `rec-${index + 1}-${f.code}`,
    priority: f.severity,
    title: f.title,
    action: f.recommendation,
    expectedSavingUZS: f.amountImpact,
    findingCodes: [f.code],
  }));

  if (
    prioritySummary.taxesTotal > 0 &&
    !recommendations.some(r => r.findingCodes.includes('HIGH_TAX_BURDEN') || r.title.en.includes('Tax'))
  ) {
    const taxRec: AiRecommendation = {
      id: 'rec-priority-taxes',
      priority: 'high',
      title: {
        ru: `Приоритет: налоговая нагрузка ${fmtUZS(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}% выручки)`,
        uz: `Ustuvor: soliq yuki ${fmtUZS(prioritySummary.taxesTotal)} (tushumning ${prioritySummary.taxesPctOfRevenue}%)`,
        en: `Priority: Tax load ${fmtUZS(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}% of revenue)`,
      },
      action: {
        ru: 'Контролируйте своевременную уплату НДС/ЕНП и проверяйте входящие ЭСФ для зачёта налогов.',
        uz: 'QQS/aylanma soliq to‘lovlari va kiruvchi EHF hisob-fakturalarni muntazam tekshiring.',
        en: 'Track VAT/turnover tax obligations on schedule and verify incoming e-invoices for input credits.',
      },
      expectedSavingUZS: 0,
      findingCodes: ['TAX_PRIORITY_MONITOR'],
    };
    recommendations.unshift(taxRec);
    if (recommendations.length > 6) recommendations.pop();
  }

  if (
    prioritySummary.utilitiesTotal > 0 &&
    !recommendations.some(
      r =>
        r.findingCodes.includes('HIGH_ELECTRICITY_COST') ||
        r.findingCodes.includes('ADMIN_UTILITY_SPIKE') ||
        r.title.en.includes('Utility') ||
        r.title.en.includes('Electricity'),
    )
  ) {
    const utilRec: AiRecommendation = {
      id: 'rec-priority-utilities',
      priority: 'high',
      title: {
        ru: `Приоритет: электричество и коммунальные ${fmtUZS(prioritySummary.utilitiesTotal)} (${prioritySummary.utilitiesPctOfRevenue}% выручки)`,
        uz: `Ustuvor: elektr va kommunal ${fmtUZS(prioritySummary.utilitiesTotal)} (tushumning ${prioritySummary.utilitiesPctOfRevenue}%)`,
        en: `Priority: Electricity & Utilities ${fmtUZS(prioritySummary.utilitiesTotal)} (${prioritySummary.utilitiesPctOfRevenue}% of revenue)`,
      },
      action: {
        ru: 'Сверяйте показания счётчиков кВт·ч РЭС по сменам и отключайте неиспользуемое тепловое оборудование.',
        uz: 'Elektr hisoblagich (kVt·soat) ko‘rsatkichlarini smenalar kesimida nazorat qiling.',
        en: 'Monitor kWh meter logs per shift and power down idle thermal kitchen equipment.',
      },
      expectedSavingUZS: 0,
      findingCodes: ['UTILITY_PRIORITY_MONITOR'],
    };
    recommendations.unshift(utilRec);
    if (recommendations.length > 6) recommendations.pop();
  }

  if (recommendations.length === 0 && overview.revenue > 0) {
    recommendations.push({
      id: 'rec-healthy',
      priority: 'low',
      title: {
        ru: 'Финансовых аномалий не выявлено',
        uz: 'Moliyaviy anomaliyalar aniqlanmadi',
        en: 'No financial anomalies detected',
      },
      action: {
        ru: 'Продолжайте еженедельно загружать накладные и контролировать маржинальность топ-блюд.',
        uz: 'Har hafta hisob-fakturalarni yuklab boring va asosiy taomlar rentabelligini kuzating.',
        en: 'Continue weekly invoice audits and monitor top-dish contribution margins.',
      },
      expectedSavingUZS: 0,
      findingCodes: [],
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'heuristic',
    healthScore,
    statusLabel,
    executiveSummary,
    totalPotentialSavingUZS,
    errorCount,
    inefficiencyCount,
    riskCount,
    recommendations,
  };
}
