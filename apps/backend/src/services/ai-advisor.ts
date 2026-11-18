import { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  type AiChatResponse,
  type AiOptimizationReport,
  type BusinessKpiOverview,
  type ExpenseCategory,
  type Finding,
  type OcrExpenseDraft,
} from '@uzbite/shared';
import { env } from '../config/env.js';
import { callCoarenaJson } from './coarena.js';
import {
  buildHeuristicOptimizationReport,
  calculateDeduplicatedSavings,
  categoryLabel,
  classifyExpenseText,
  computePriorityExpenseSummary,
  type AnalysisExpenseInput,
} from './finance-analysis.js';
import { formatDateRangeLabel, type ParsedDatePeriod } from './date-period-parser.js';

const geminiReportSchema = z.object({
  executiveSummary: z.object({
    ru: z.string().min(10),
    uz: z.string().min(10),
    en: z.string().min(10),
  }),
  recommendations: z.array(z.object({
    priority: z.enum(['high', 'medium', 'low']),
    title: z.object({ ru: z.string(), uz: z.string(), en: z.string() }),
    action: z.object({ ru: z.string(), uz: z.string(), en: z.string() }),
    expectedSavingUZS: z.number().nonnegative(),
    findingCodes: z.array(z.string()),
  })).min(1).max(6),
});

async function callLLMJson(
  prompt: string,
  imagePart?: { base64: string; mimeType: string },
): Promise<unknown | null> {
  if (env.COARENA_API_KEY) {
    const coarena = await callCoarenaJson(prompt, imagePart);
    if (coarena?.data) return coarena.data;
  }

  if (!env.GEMINI_API_KEY) return null;
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (imagePart) {
    parts.push({ inlineData: { data: imagePart.base64, mimeType: imagePart.mimeType } });
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAiOptimizationReport(
  overview: BusinessKpiOverview,
  findings: Finding[],
): Promise<AiOptimizationReport> {
  const baseline = buildHeuristicOptimizationReport(overview, findings);
  if ((!env.COARENA_API_KEY && !env.GEMINI_API_KEY) || findings.length === 0) return baseline;

  const priorityExpenseSummary = computePriorityExpenseSummary({ overview });

  const anonymizedPayload = {
    period: overview.period,
    revenueUZS: Math.round(overview.revenue),
    totalExpensesUZS: Math.round(overview.totalExpenses),
    netProfitUZS: Math.round(overview.netProfit),
    netMarginPct: overview.netMarginPct,
    foodCostPct: overview.foodCostPct,
    laborCostPct: overview.laborCostPct,
    adminUtilityCostPct: overview.adminUtilityCostPct,
    primeCostPct: overview.primeCostPct,
    cogsVarianceUZS: overview.cogsVarianceUZS,
    breakEvenRevenueUZS: overview.breakEvenRevenue,
    priorityExpenseSummary,
    deduplicatedPotentialSavingUZS: baseline.totalPotentialSavingUZS,
    findings: findings.slice(0, 12).map(f => ({
      kind: f.kind,
      code: f.code,
      severity: f.severity,
      category: f.category,
      amountImpactUZS: f.amountImpact,
      titleEn: f.title.en,
      detailEn: f.detail.en,
    })),
  };

  const prompt = [
    'You are a senior restaurant CFO & financial audit AI advisor.',
    'Analyze the anonymized KPIs, priorityExpenseSummary (Taxes, Electricity/Utilities, Base vs Additional), and deterministic audit findings below.',
    'Prioritize Taxes (TAXES), Electricity/Utilities (UTILITIES, COMMUNICATION), and Base (INGREDIENTS, SALARY, RENT) vs Additional costs in executiveSummary and high-priority recommendations.',
    'Do NOT invent new numbers; strictly cite numbers from the input.',
    'Return valid JSON matching: { "executiveSummary": { "ru": string, "uz": string, "en": string }, "recommendations": [{ "priority": "high"|"medium"|"low", "title": { "ru": string, "uz": string, "en": string }, "action": { "ru": string, "uz": string, "en": string }, "expectedSavingUZS": number, "findingCodes": string[] }] }.',
    JSON.stringify(anonymizedPayload),
  ].join('\n');

  const raw = await callLLMJson(prompt);
  if (!raw) return baseline;
  const parsed = geminiReportSchema.safeParse(raw);
  if (!parsed.success) return baseline;

  return {
    ...baseline,
    generatedAt: new Date().toISOString(),
    source: 'gemini',
    executiveSummary: parsed.data.executiveSummary,
    recommendations: parsed.data.recommendations.map((rec, i) => ({
      id: `ai-rec-${i + 1}`,
      ...rec,
    })),
  };
}

const ocrSchema = z.object({
  supplierName: z.string().min(1),
  invoiceNumber: z.string(),
  spentAt: z.string(),
  category: z.enum(EXPENSE_CATEGORIES),
  itemName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  amount: z.number().positive(),
});

export function parseReceiptNumber(raw: string | undefined): number {
  if (!raw) return 0;
  let s = raw.replace(/[ \t\u00A0]+/g, '').trim();
  if (!s) return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    if ((s.match(/,/g)?.length ?? 0) > 1 || /^[1-9]\d*,\d{3}$/.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  } else if (hasDot) {
    if ((s.match(/\./g)?.length ?? 0) > 1 || /^[1-9]\d*\.\d{3}$/.test(s)) {
      s = s.replace(/\./g, '');
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export async function extractInvoiceDraftFromTextOrImage(input: {
  rawText?: string;
  fileName?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<OcrExpenseDraft> {
  const rawText = (input.rawText ?? '').trim();
  const today = new Date().toISOString().slice(0, 10);

  if ((env.COARENA_API_KEY || env.GEMINI_API_KEY) && (rawText.length > 10 || input.imageBase64)) {
    const prompt = [
      'Extract restaurant expense fields from this invoice/receipt and return JSON:',
      '{ "supplierName": string, "invoiceNumber": string, "spentAt": "YYYY-MM-DD", "category": one of ' + EXPENSE_CATEGORIES.join('|') + ', "itemName": string, "quantity": number, "unit": string, "unitPrice": number, "amount": number }.',
      ...(rawText ? ['Text:', rawText] : []),
    ].join('\n');
    const raw = await callLLMJson(
      prompt,
      input.imageBase64 && input.mimeType ? { base64: input.imageBase64, mimeType: input.mimeType } : undefined,
    );
    const parsed = ocrSchema.safeParse(raw);
    if (parsed.success) {
      return {
        ...parsed.data,
        confidence: 0.94,
      };
    }
  }

  // Deterministic structured parser for receipt/invoice text
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const supplierMatch = rawText.match(/(?:поставщик|supplier|vendor|yetkazib beruvchi|ооо|ooo|mchj)[ \t:-]+([^\n,;]+)/i);
  const invMatch = rawText.match(
    /(?:сч[её]т(?:-фактура)?|накладная|инвойс|invoice|inv|№|#)[ \t]*(?:№|#)?[: \t#-]*((?=[a-zA-Zа-яА-Я0-9/-]*\d)[a-zA-Zа-яА-Я0-9/-]{2,24})/i,
  );
  const dateMatch = rawText.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\.\d{2}\.\d{4})/);
  const qtyPriceMatch = rawText.match(
    /(\d+(?:[.,]\d+)?)[ \t]*(кг|kg|л|l|шт|pcs|мес|кВт|kw)?[ \t]*[×xX*][ \t]*(\d[\d \t.,]*)/i,
  );
  const totalMatch = rawText.match(/(?:итого|всего|сумма|jami|total|amount)[ \t]*[:-]?[ \t]*(\d[\d \t.,]*)/i);

  let spentAt = today;
  if (dateMatch) {
    if (dateMatch[1]) {
      spentAt = dateMatch[1];
    } else if (dateMatch[2]) {
      const [dd, mm, yyyy] = dateMatch[2].split('.');
      spentAt = `${yyyy}-${mm}-${dd}`;
    }
  }

  const quantity = qtyPriceMatch ? Math.max(0.001, parseReceiptNumber(qtyPriceMatch[1])) : 1;
  const unit = qtyPriceMatch?.[2] ?? 'шт';
  const unitPrice = qtyPriceMatch ? parseReceiptNumber(qtyPriceMatch[3]) : 0;
  let amount = totalMatch ? parseReceiptNumber(totalMatch[1]) : 0;
  if (amount <= 0 && unitPrice > 0) {
    amount = Math.round(quantity * unitPrice);
  }
  if (amount <= 0) {
    const numbers = [...rawText.matchAll(/\b(\d{4,10})\b/g)].map(m => Number(m[1]));
    amount = numbers.length > 0 ? Math.max(...numbers) : 450000;
  }
  const finalUnitPrice = unitPrice > 0 ? unitPrice : Math.round(amount / quantity);

  const itemName =
    lines.find(l => !/(?:поставщик|supplier|итого|total|сч[её]т|накладная|invoice|дата|date)/i.test(l) && l.length >= 3)?.slice(0, 80) ??
    input.fileName?.replace(/\.[a-z0-9]+$/i, '') ??
    'Расход по накладной';

  const classification = classifyExpenseText(`${rawText} ${itemName}`);
  const supplierName = supplierMatch?.[1]?.trim() ?? 'ООО Ташкент Сервис';
  const invoiceNumber = invMatch?.[1]?.trim() ?? `OCR-${Date.now().toString().slice(-6)}`;

  return {
    supplierName,
    invoiceNumber,
    spentAt,
    category: classification.category as ExpenseCategory,
    itemName,
    quantity,
    unit,
    unitPrice: finalUnitPrice,
    amount,
    confidence: Math.max(0.72, classification.confidence),
  };
}

const aiChatSchema = z.object({
  answer: z.object({
    ru: z.string().min(5),
    uz: z.string().min(5),
    en: z.string().min(5),
  }),
  highlights: z.array(z.string()).max(5),
  relatedFindingCodes: z.array(z.string()).max(6),
});

function fmtNum(v: number): string {
  return `${Math.round(v).toLocaleString('ru-RU')} UZS`;
}

export async function answerFinancialQuestion(params: {
  question: string;
  restaurantName: string;
  overview: BusinessKpiOverview;
  findings: Finding[];
  expenses?: AnalysisExpenseInput[];
  resolvedPeriod?: ParsedDatePeriod | null;
}): Promise<AiChatResponse> {
  const { question, restaurantName, overview, findings, expenses, resolvedPeriod } = params;
  const prioritySummary = computePriorityExpenseSummary({ overview, expenses });
  const periodFrom = resolvedPeriod?.from ?? overview.period.from.slice(0, 10);
  const periodTo = resolvedPeriod?.to ?? overview.period.to.slice(0, 10);
  const periodIsoLabel = periodFrom === periodTo ? periodFrom : `${periodFrom} – ${periodTo}`;
  const periodRu = resolvedPeriod ? `${resolvedPeriod.label.ru} (${periodIsoLabel})` : `${formatDateRangeLabel(periodFrom, periodTo, 'ru')} (${periodIsoLabel})`;
  const periodUz = resolvedPeriod ? `${resolvedPeriod.label.uz} (${periodIsoLabel})` : `${formatDateRangeLabel(periodFrom, periodTo, 'uz')} (${periodIsoLabel})`;
  const periodEn = resolvedPeriod ? `${resolvedPeriod.label.en} (${periodIsoLabel})` : `${formatDateRangeLabel(periodFrom, periodTo, 'en')} (${periodIsoLabel})`;

  if (env.COARENA_API_KEY || env.GEMINI_API_KEY) {
    const context = {
      restaurantName,
      period: { ...overview.period, fromDate: periodFrom, toDate: periodTo },
      revenueUZS: Math.round(overview.revenue),
      totalExpensesUZS: Math.round(overview.totalExpenses),
      netProfitUZS: Math.round(overview.netProfit),
      netMarginPct: overview.netMarginPct,
      foodCostPct: overview.foodCostPct,
      laborCostPct: overview.laborCostPct,
      adminUtilityCostPct: overview.adminUtilityCostPct,
      primeCostPct: overview.primeCostPct,
      cogsVarianceUZS: overview.cogsVarianceUZS,
      breakEvenRevenueUZS: overview.breakEvenRevenue,
      cancelRatePct: overview.cancelRatePct,
      priorityExpenses: prioritySummary,
      topCategories: overview.categoryBreakdown.slice(0, 8),
      ...(expenses && expenses.length > 0
        ? {
            itemizedExpenses: expenses.slice(0, 15).map(e => ({
              date: e.spentAt.toISOString().slice(0, 10),
              category: e.category,
              itemName: e.itemName,
              supplier: e.supplierName,
              quantity: e.quantity,
              unit: e.unit,
              amountUZS: Math.round(e.amount),
            })),
          }
        : {}),
      findings: findings.slice(0, 12).map(f => ({
        kind: f.kind,
        code: f.code,
        severity: f.severity,
        impactUZS: f.amountImpact,
        detail: f.detail.en,
        recommendation: f.recommendation.en,
      })),
    };
    const prompt = [
      'You are an AI financial auditor for a restaurant. Answer the question strictly using the provided data.',
      'Always state the exact resolved period and prioritize Taxes (TAXES), Electricity/Utilities (UTILITIES, COMMUNICATION), and Base vs Additional expenses when relevant.',
      'Return JSON: { "answer": { "ru": string, "uz": string, "en": string }, "highlights": string[], "relatedFindingCodes": string[] }.',
      `Question: ${question}`,
      `Data: ${JSON.stringify(context)}`,
    ].join('\n');
    const raw = await callLLMJson(prompt);
    const parsed = aiChatSchema.safeParse(raw);
    if (parsed.success) {
      return {
        ...parsed.data,
        source: 'gemini',
      };
    }
  }

  // Deterministic data-driven financial advisor Q&A
  const q = question.toLowerCase();
  const topError = findings.find(f => f.kind === 'ERROR');
  const totalSaving = calculateDeduplicatedSavings(findings);
  const kwhSuffixRu =
    prioritySummary.electricityKwh > 0
      ? ` (${Math.round(prioritySummary.electricityKwh).toLocaleString('ru-RU')} кВт·ч)`
      : '';
  const kwhSuffixUz =
    prioritySummary.electricityKwh > 0
      ? ` (${Math.round(prioritySummary.electricityKwh).toLocaleString('ru-RU')} kVt·soat)`
      : '';
  const kwhSuffixEn =
    prioritySummary.electricityKwh > 0
      ? ` (${Math.round(prioritySummary.electricityKwh).toLocaleString('ru-RU')} kWh)`
      : '';

  if (/(налог|ндс|есп|ндфл|soliq|qqs|tax|vat|электр|коммунал|аренд|связ|квт|kwh|elektr|ijara|aloqa|util|rent|telecom|admin)/i.test(q)) {
    const prioFindings = findings.filter(f =>
      ['TAXES', 'UTILITIES', 'RENT', 'COMMUNICATION'].includes(f.category ?? '') ||
      ['ADMIN_UTILITY_SPIKE', 'HIGH_TAX_BURDEN', 'HIGH_ELECTRICITY_COST'].includes(f.code),
    );
    const impact = prioFindings.reduce((s, f) => s + f.amountImpact, 0);
    return {
      answer: {
        ru: `Период: ${periodRu}. По «${restaurantName}» приоритетные расходы: налоги ${fmtNum(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}% от выручки), электричество и коммунальные ${fmtNum(prioritySummary.utilitiesTotal)}${kwhSuffixRu} (${prioritySummary.utilitiesPctOfRevenue}% от выручки). Базовые расходы: ${fmtNum(prioritySummary.baseTotal)}, дополнительные: ${fmtNum(prioritySummary.additionalTotal)}. ${prioFindings.length > 0 ? `Выявлено ${prioFindings.length} приоритетных сигналов на ${fmtNum(impact)}: ${prioFindings.slice(0, 3).map(f => f.title.ru).join('; ')}.` : 'Критичных всплесков по налогам и коммуналке за период не обнаружено.'}`,
        uz: `Davr: ${periodUz}. «${restaurantName}» bo‘yicha ustuvor xarajatlar: soliqlar ${fmtNum(prioritySummary.taxesTotal)} (tushumning ${prioritySummary.taxesPctOfRevenue}%), elektr va kommunal ${fmtNum(prioritySummary.utilitiesTotal)}${kwhSuffixUz} (tushumning ${prioritySummary.utilitiesPctOfRevenue}%). Asosiy xarajatlar: ${fmtNum(prioritySummary.baseTotal)}, qo‘shimcha: ${fmtNum(prioritySummary.additionalTotal)}. ${prioFindings.length > 0 ? `${prioFindings.length} ta muammo aniqlandi (${fmtNum(impact)}): ${prioFindings.slice(0, 3).map(f => f.title.uz).join('; ')}.` : 'Ushbu moddalarda keskin o‘sish aniqlanmadi.'}`,
        en: `Period: ${periodEn}. For ${restaurantName}, priority spend: Taxes ${fmtNum(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}% of revenue), Electricity & Utilities ${fmtNum(prioritySummary.utilitiesTotal)}${kwhSuffixEn} (${prioritySummary.utilitiesPctOfRevenue}% of revenue). Base costs: ${fmtNum(prioritySummary.baseTotal)}, Additional: ${fmtNum(prioritySummary.additionalTotal)}. ${prioFindings.length > 0 ? `Detected ${prioFindings.length} priority alerts totaling ${fmtNum(impact)}: ${prioFindings.slice(0, 3).map(f => f.title.en).join('; ')}.` : 'No critical spikes detected in priority categories.'}`,
      },
      highlights: [
        `Period: ${periodIsoLabel}`,
        `Taxes: ${fmtNum(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}%)`,
        `Electricity & Utilities: ${fmtNum(prioritySummary.utilitiesTotal)}${kwhSuffixEn}`,
        `Potential Savings: ${fmtNum(totalSaving)}`,
      ],
      relatedFindingCodes: [...new Set(prioFindings.map(f => f.code))],
      source: 'heuristic',
    };
  }

  if (/(ошиб|дубл|неверн|аномал|xato|dublikat|error|duplicate|outlier|mismatch)/i.test(q)) {
    const errors = findings.filter(f => f.kind === 'ERROR');
    const errImpact = errors.reduce((s, f) => s + f.amountImpact, 0);
    return {
      answer: {
        ru: `Период: ${periodRu}. В учёте «${restaurantName}» обнаружено ${errors.length} ошибок данных на общую сумму ${fmtNum(errImpact)}. ${errors.length > 0 ? `Главные из них: ${errors.slice(0, 3).map(f => `${f.title.ru} (${fmtNum(f.amountImpact)})`).join('; ')}. Используйте кнопки исправления во вкладке AI-Аудит.` : 'Ошибок учёта за выбранный период не найдено.'}`,
        uz: `Davr: ${periodUz}. «${restaurantName}» hisobotida umumiy ${fmtNum(errImpact)} lik ${errors.length} ta xatolik aniqlandi. ${errors.length > 0 ? `Asosiylari: ${errors.slice(0, 3).map(f => `${f.title.uz} (${fmtNum(f.amountImpact)})`).join('; ')}.` : 'Tanlangan davrda xatoliklar topilmadi.'}`,
        en: `Period: ${periodEn}. Found ${errors.length} accounting/data errors in ${restaurantName} totaling ${fmtNum(errImpact)}. ${errors.length > 0 ? `Top issues: ${errors.slice(0, 3).map(f => `${f.title.en} (${fmtNum(f.amountImpact)})`).join('; ')}. Use the 1-click fixes in the AI Audit tab.` : 'No accounting errors detected in this period.'}`,
      },
      highlights: [
        ...errors.slice(0, 3).map(f => `${f.code}: ${fmtNum(f.amountImpact)}`),
        `Potential Savings: ${fmtNum(totalSaving)}`,
      ],
      relatedFindingCodes: [...new Set(errors.map(f => f.code))],
      source: 'heuristic',
    };
  }

  if (resolvedPeriod || /(расход|затрат|базов|дополн|xarajat|asosiy|qo'shimcha|expense|spend|base|additional)/i.test(q)) {
    const topItems = (expenses ?? []).slice(0, 3).map(e => `${e.itemName} (${fmtNum(e.amount)})`).join(', ');
    return {
      answer: {
        ru: `Период: ${periodRu}. Расходы «${restaurantName}» составили ${fmtNum(prioritySummary.totalExpenses)} (выручка ${fmtNum(overview.revenue)}). Приоритетные: налоги ${fmtNum(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}% выручки), электричество и коммунальные ${fmtNum(prioritySummary.utilitiesTotal)}${kwhSuffixRu}. Базовые (сырьё, ФОТ, аренда): ${fmtNum(prioritySummary.baseTotal)}; дополнительные: ${fmtNum(prioritySummary.additionalTotal)}.${topItems ? ` Крупные позиции: ${topItems}.` : ''}`,
        uz: `Davr: ${periodUz}. «${restaurantName}» xarajatlari ${fmtNum(prioritySummary.totalExpenses)} ni tashkil etdi (tushum ${fmtNum(overview.revenue)}). Ustuvor: soliqlar ${fmtNum(prioritySummary.taxesTotal)} (tushumning ${prioritySummary.taxesPctOfRevenue}%), elektr va kommunal ${fmtNum(prioritySummary.utilitiesTotal)}${kwhSuffixUz}. Asosiy: ${fmtNum(prioritySummary.baseTotal)}; qo‘shimcha: ${fmtNum(prioritySummary.additionalTotal)}.${topItems ? ` Yirik pozitsiyalar: ${topItems}.` : ''}`,
        en: `Period: ${periodEn}. ${restaurantName} expenses totaled ${fmtNum(prioritySummary.totalExpenses)} (revenue ${fmtNum(overview.revenue)}). Priority: Taxes ${fmtNum(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}% of revenue), Electricity & Utilities ${fmtNum(prioritySummary.utilitiesTotal)}${kwhSuffixEn}. Base costs: ${fmtNum(prioritySummary.baseTotal)}; Additional: ${fmtNum(prioritySummary.additionalTotal)}.${topItems ? ` Top items: ${topItems}.` : ''}`,
      },
      highlights: [
        `Period: ${periodIsoLabel}`,
        `Taxes: ${fmtNum(prioritySummary.taxesTotal)} (${prioritySummary.taxesPctOfRevenue}%)`,
        `Utilities & Electricity: ${fmtNum(prioritySummary.utilitiesTotal)}${kwhSuffixEn}`,
        `Base: ${fmtNum(prioritySummary.baseTotal)} | Additional: ${fmtNum(prioritySummary.additionalTotal)}`,
        `Potential Savings: ${fmtNum(totalSaving)}`,
      ],
      relatedFindingCodes: findings.slice(0, 4).map(f => f.code),
      source: 'heuristic',
    };
  }

  if (/(постав|цен|food|сырь|продукт|мяс|рис|yetkazib|narx|masalliq|supplier|price)/i.test(q)) {
    const supplyFindings = findings.filter(f =>
      ['HIGH_FOOD_COST', 'SUPPLIER_PRICE_SPIKE', 'CHEAPER_SUPPLIER_EXISTS'].includes(f.code),
    );
    const supplyImpact = supplyFindings.reduce((s, f) => s + f.amountImpact, 0);
    return {
      answer: {
        ru: `Период: ${periodRu}. Food Cost составляет ${overview.foodCostPct.toFixed(1)}% (целевая норма 28–35%). ${supplyFindings.length > 0 ? `По закупкам и поставщикам выявлено ${supplyFindings.length} точек оптимизации на ${fmtNum(supplyImpact)}: ${supplyFindings.map(f => f.title.ru).join('; ')}.` : 'Скачков закупочных цен и переплат поставщикам не выявлено.'}`,
        uz: `Davr: ${periodUz}. Food Cost ko‘rsatkichi ${overview.foodCostPct.toFixed(1)}% (maqsad 28–35%). ${supplyFindings.length > 0 ? `Xaridlar va yetkazib beruvchilar bo‘yicha ${fmtNum(supplyImpact)} tejash imkoniyati bor: ${supplyFindings.map(f => f.title.uz).join('; ')}.` : 'Narx keskin oshishi aniqlanmadi.'}`,
        en: `Period: ${periodEn}. Current Food Cost is ${overview.foodCostPct.toFixed(1)}% (benchmark 28–35%). ${supplyFindings.length > 0 ? `Procurement audit found ${supplyFindings.length} optimization opportunities worth ${fmtNum(supplyImpact)}: ${supplyFindings.map(f => f.title.en).join('; ')}.` : 'No supplier price spikes or overpayments detected.'}`,
      },
      highlights: [
        `Food Cost: ${overview.foodCostPct.toFixed(1)}%`,
        ...supplyFindings.slice(0, 3).map(f => `${f.code}: ${fmtNum(f.amountImpact)}`),
        `Potential Savings: ${fmtNum(totalSaving)}`,
      ],
      relatedFindingCodes: [...new Set(supplyFindings.map(f => f.code))],
      source: 'heuristic',
    };
  }

  const topCats = overview.categoryBreakdown
    .slice(0, 3)
    .map(c => `${categoryLabel(c.category, 'ru')} (${c.sharePct}%)`)
    .join(', ');

  return {
    answer: {
      ru: `Период: ${periodRu}. Итоги «${restaurantName}»: выручка ${fmtNum(overview.revenue)}, расходы ${fmtNum(overview.totalExpenses)} (налоги ${fmtNum(prioritySummary.taxesTotal)}, свет и ком. ${fmtNum(prioritySummary.utilitiesTotal)}), чистая прибыль ${fmtNum(overview.netProfit)} (маржа ${overview.netMarginPct.toFixed(1)}%). Главные статьи затрат: ${topCats || 'нет'}. Обнаружено ${findings.length} находок с общим потенциалом экономии ${fmtNum(totalSaving)}.${topError ? ` Приоритет №1: ${topError.title.ru}.` : ''}`,
      uz: `Davr: ${periodUz}. «${restaurantName}» yakunlari: tushum ${fmtNum(overview.revenue)}, xarajatlar ${fmtNum(overview.totalExpenses)} (soliqlar ${fmtNum(prioritySummary.taxesTotal)}, elektr/kommunal ${fmtNum(prioritySummary.utilitiesTotal)}), sof foyda ${fmtNum(overview.netProfit)} (marja ${overview.netMarginPct.toFixed(1)}%). Jami ${findings.length} ta muammo va ${fmtNum(totalSaving)} tejamkorlik salohiyati aniqlandi.${topError ? ` Birinchi navbatda: ${topError.title.uz}.` : ''}`,
      en: `Period: ${periodEn}. ${restaurantName} summary: revenue ${fmtNum(overview.revenue)}, expenses ${fmtNum(overview.totalExpenses)} (Taxes ${fmtNum(prioritySummary.taxesTotal)}, Utilities ${fmtNum(prioritySummary.utilitiesTotal)}), net profit ${fmtNum(overview.netProfit)} (${overview.netMarginPct.toFixed(1)}% margin). Found ${findings.length} audit findings with ${fmtNum(totalSaving)} potential savings.${topError ? ` Top priority: ${topError.title.en}.` : ''}`,
    },
    highlights: [
      `Revenue: ${fmtNum(overview.revenue)}`,
      `Expenses: ${fmtNum(overview.totalExpenses)} (Priority: ${fmtNum(prioritySummary.priorityTotal)})`,
      `Net Profit: ${fmtNum(overview.netProfit)} (${overview.netMarginPct.toFixed(1)}%)`,
      `Potential Savings: ${fmtNum(totalSaving)}`,
    ],
    relatedFindingCodes: findings.slice(0, 4).map(f => f.code),
    source: 'heuristic',
  };
}
