import { createHash } from 'node:crypto';
import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma, ExpenseCategory as PrismaExpenseCategory } from '@prisma/client';
import { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  TASHKENT_DISTRICT_IDS,
  type BusinessLoginResponse,
  type ExpenseDto,
} from '@uzbite/shared';
import { db, redis } from '../config/database.js';
import { env } from '../config/env.js';
import { requireRestaurant } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { createBusinessSession, refreshBusinessSession } from '../services/auth.js';
import {
  getBudgetsStatus,
  getBusinessOverview,
  getDishAnalytics,
  getHourlyHeatmap,
  getRevenueTimeseries,
  invalidateBusinessCache,
  resolveDateRange,
  runRestaurantAnalysis,
} from '../services/business-analytics.js';
import { parseDatePeriodFromQuestion } from '../services/date-period-parser.js';
import {
  ADDITIONAL_EXPENSE_CATEGORIES,
  BASE_EXPENSE_CATEGORIES,
  classifyExpenseText,
  PRIORITY_EXPENSE_CATEGORIES,
} from '../services/finance-analysis.js';
import {
  answerFinancialQuestion,
  extractInvoiceDraftFromTextOrImage,
  generateAiOptimizationReport,
} from '../services/ai-advisor.js';
import { listCoarenaModels, submitCoarenaFeedback } from '../services/coarena.js';
import {
  MCP_TOOLS,
  computeBudgetVarianceAndForecast,
  computeMultiBranchAllocation,
  executeMcpTool,
  runFinanceAgentChat,
} from '../services/finance-agent.js';
import { analyzeOrdersByDistrict } from '../services/geo-districts.js';
import { seedBusinessAnalyticsForRestaurants } from '../services/demo-seed.js';
import { assert } from '../utils/errors.js';
import { pageMetadata } from '../utils/pagination.js';
import { jsonValue } from '../utils/serialize.js';

export const businessRouter = Router();

const emailSchema = z.string().trim().pipe(z.email().max(254)).transform(s => s.toLowerCase());
const loginBodySchema = z.union([
  z.object({ demo: z.literal(true) }).strict(),
  z.object({
    email: emailSchema,
    password: z.string().min(1).max(72),
  }).strict(),
]);

const refreshBodySchema = z.object({ refreshToken: z.string().min(1) }).strict();

async function ensureDemoOwner() {
  const existing = await db.user.findUnique({ where: { email: 'owner@uzbite.uz' } });
  if (existing && existing.role === 'RESTAURANT') {
    const owned = await db.restaurant.findFirst({ where: { ownerId: existing.id } });
    if (!owned) {
      const osh = await db.restaurant.findUnique({ where: { id: 'rest-osh' } });
      if (osh && !osh.ownerId) {
        await db.restaurant.update({ where: { id: osh.id }, data: { ownerId: existing.id } });
      }
    }
    return existing;
  }
  const passwordHash = await bcrypt.hash('UzBiteBusiness2026!', 12);
  const created = await db.user.upsert({
    where: { email: 'owner@uzbite.uz' },
    create: {
      email: 'owner@uzbite.uz',
      username: 'osh_owner',
      name: 'Osh & Olov Business',
      passwordHash,
      role: 'RESTAURANT',
    },
    update: { role: 'RESTAURANT' },
  });
  const osh = await db.restaurant.findUnique({ where: { id: 'rest-osh' } });
  if (osh && !osh.ownerId) {
    await db.restaurant.update({ where: { id: osh.id }, data: { ownerId: created.id } });
  }
  return created;
}

async function resolveBusinessContext(req: Request): Promise<{
  restaurant: { id: string; slug: string; name: string; logoUrl: string; addressText: string };
  restaurants: Array<{ id: string; slug: string; name: string; logoUrl: string; addressText: string }>;
}> {
  const userId = req.user!.id;
  const requestedId = req.get('x-restaurant-id')?.trim();
  const select = { id: true, slug: true, name: true, logoUrl: true, addressText: true, ownerId: true };

  const rows =
    env.NODE_ENV !== 'production'
      ? await db.restaurant.findMany({ select, orderBy: { name: 'asc' } })
      : await db.restaurant.findMany({ where: { ownerId: userId }, select, orderBy: { name: 'asc' } });

  assert(rows.length > 0, 404, 'NOT_FOUND', 'У аккаунта нет привязанного ресторана');

  const owned = rows.filter(r => r.ownerId === userId);
  let activeRow = owned[0] ?? rows.find(r => r.id === 'rest-osh') ?? rows[0]!;
  if (requestedId) {
    const match = rows.find(r => r.id === requestedId || r.slug === requestedId);
    assert(match, 404, 'NOT_FOUND', 'Ресторан не найден или недоступен');
    activeRow = match;
  }

  const restaurants = rows.map(({ ownerId: _ownerId, ...rest }) => rest);
  const { ownerId: _activeOwnerId, ...restaurant } = activeRow;
  return { restaurant, restaurants };
}

businessRouter.post('/auth/login', rateLimit('business-login', 30, 900), async (req, res) => {
  const input = loginBodySchema.parse(req.body);
  let user;
  if ('demo' in input) {
    assert(env.NODE_ENV !== 'production' || process.env.ALLOW_DEVELOPMENT_SEED === 'true', 403, 'FORBIDDEN', 'Демо-вход отключён в production');
    user = await ensureDemoOwner();
  } else {
    const candidate = await db.user.findUnique({ where: { email: input.email } });
    const dummy = '$2b$12$W5HK5wNwf86cby4uX7JS6evD8f54zyvWLVoDjxZdjAh60sFdn7A8S';
    const valid = await bcrypt.compare(input.password, candidate?.passwordHash ?? dummy);
    assert(candidate && valid && candidate.role === 'RESTAURANT', 401, 'INVALID_CREDENTIALS', 'Неверная почта или пароль бизнес-аккаунта');
    user = candidate;
  }

  const allRestaurants =
    env.NODE_ENV !== 'production'
      ? await db.restaurant.findMany({
          select: { id: true, slug: true, name: true, logoUrl: true, addressText: true, ownerId: true },
          orderBy: { name: 'asc' },
        })
      : await db.restaurant.findMany({
          where: { ownerId: user.id },
          select: { id: true, slug: true, name: true, logoUrl: true, addressText: true, ownerId: true },
          orderBy: { name: 'asc' },
        });

  const primary =
    allRestaurants.find(r => r.ownerId === user.id) ??
    allRestaurants.find(r => r.id === 'rest-osh') ??
    allRestaurants[0];
  assert(primary, 404, 'NOT_FOUND', 'Ресторан не найден');

  const session = await createBusinessSession(user);
  const payload: BusinessLoginResponse = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      role: 'RESTAURANT',
      restaurantId: primary.id,
      restaurantName: primary.name,
    },
    restaurants: allRestaurants.map(({ ownerId: _ownerId, ...rest }) => rest),
  };
  res.json({ data: payload });
});

businessRouter.post('/auth/refresh', rateLimit('business-refresh', 120, 900), async (req, res) => {
  const { refreshToken } = refreshBodySchema.parse(req.body);
  const rotated = await refreshBusinessSession(refreshToken);
  res.json({ data: rotated });
});

businessRouter.use(requireRestaurant);

businessRouter.get('/me', async (req, res) => {
  const { restaurant, restaurants } = await resolveBusinessContext(req);
  const user = await db.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, username: true },
  });
  res.json({
    data: {
      user: {
        ...user,
        role: 'RESTAURANT' as const,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
      },
      restaurants,
    },
  });
});

const rangeQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

businessRouter.get('/overview', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { from, to } = rangeQuerySchema.parse(req.query);
  const overview = await getBusinessOverview(restaurant.id, from, to);
  res.json({ data: overview });
});

const timeseriesQuerySchema = rangeQuerySchema.extend({
  bucket: z.enum(['day', 'week', 'month']).default('day'),
});

businessRouter.get('/timeseries', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { from, to, bucket } = timeseriesQuerySchema.parse(req.query);
  const data = await getRevenueTimeseries(restaurant.id, from, to, bucket);
  res.json({ data });
});

businessRouter.get('/dishes', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { from, to } = rangeQuerySchema.parse(req.query);
  const data = await getDishAnalytics(restaurant.id, from, to);
  res.json({ data });
});

const updateDishCostSchema = z.object({
  costPrice: z.coerce.number().min(0).max(50_000_000),
}).strict();

businessRouter.patch('/dishes/:id/cost', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { costPrice } = updateDishCostSchema.parse(req.body);
  const dish = await db.dish.findFirst({ where: { id: req.params.id as string, restaurantId: restaurant.id } });
  assert(dish, 404, 'NOT_FOUND', 'Блюдо не найдено');
  const updated = await db.dish.update({
    where: { id: dish.id },
    data: { costPrice },
  });
  invalidateBusinessCache(restaurant.id);
  res.json({ data: jsonValue(updated) });
});

businessRouter.get('/hours', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { from, to } = rangeQuerySchema.parse(req.query);
  const data = await getHourlyHeatmap(restaurant.id, from, to);
  res.json({ data });
});

businessRouter.get('/suppliers', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const suppliers = await db.supplier.findMany({
    where: { restaurantId: restaurant.id },
    include: {
      expenses: {
        select: { amount: true, spentAt: true, itemName: true },
        orderBy: { spentAt: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  const enriched = suppliers.map(s => {
    const totalSpent = s.expenses.reduce((sum, e) => sum + e.amount.toNumber(), 0);
    const itemsSupplied = [...new Set(s.expenses.map(e => e.itemName).filter(Boolean))];
    return {
      id: s.id,
      restaurantId: s.restaurantId,
      name: s.name,
      taxId: s.taxId,
      phone: s.phone,
      category: s.category,
      expenseCount: s.expenses.length,
      totalSpent,
      lastSpentAt: s.expenses[0]?.spentAt.toISOString() ?? null,
      itemsSupplied,
      createdAt: s.createdAt.toISOString(),
    };
  });
  res.json({ data: enriched });
});

const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  taxId: z.string().trim().max(40).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  category: z.enum(EXPENSE_CATEGORIES).default('INGREDIENTS'),
}).strict();

businessRouter.post('/suppliers', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const input = createSupplierSchema.parse(req.body);
  const supplier = await db.supplier.upsert({
    where: { restaurantId_name: { restaurantId: restaurant.id, name: input.name } },
    create: {
      restaurantId: restaurant.id,
      name: input.name,
      taxId: input.taxId ?? null,
      phone: input.phone ?? null,
      category: input.category as PrismaExpenseCategory,
    },
    update: {
      ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      category: input.category as PrismaExpenseCategory,
    },
  });
  res.status(201).json({ data: jsonValue(supplier) });
});

const expenseListQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.string().trim().max(120).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  group: z.enum(['priority', 'base', 'additional']).optional(),
  supplierId: z.string().optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

function serializeExpense(e: {
  id: string;
  restaurantId: string;
  supplierId: string | null;
  supplier: { name: string } | null;
  category: PrismaExpenseCategory;
  itemName: string;
  description: string;
  amount: Prisma.Decimal;
  quantity: Prisma.Decimal | null;
  unit: string | null;
  unitPrice: Prisma.Decimal | null;
  invoiceNumber: string | null;
  spentAt: Date;
  receiptId: string | null;
  source: string;
  isVerified: boolean;
  createdAt: Date;
}): ExpenseDto {
  return {
    id: e.id,
    restaurantId: e.restaurantId,
    supplierId: e.supplierId,
    supplierName: e.supplier?.name ?? null,
    category: e.category,
    itemName: e.itemName,
    description: e.description,
    amount: e.amount.toNumber(),
    quantity: e.quantity ? e.quantity.toNumber() : null,
    unit: e.unit,
    unitPrice: e.unitPrice ? e.unitPrice.toNumber() : null,
    invoiceNumber: e.invoiceNumber,
    spentAt: e.spentAt.toISOString(),
    receiptId: e.receiptId,
    source: e.source,
    isVerified: e.isVerified,
    createdAt: e.createdAt.toISOString(),
  };
}

businessRouter.get('/expenses', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const query = expenseListQuerySchema.parse(req.query);
  const parsedFromPeriod = query.period
    ? parseDatePeriodFromQuestion(query.period)
    : query.from && !/^\d{4}-\d{2}-\d{2}/.test(query.from)
      ? parseDatePeriodFromQuestion(query.from)
      : null;
  const effectiveFrom = parsedFromPeriod?.from ?? query.from;
  const effectiveTo = parsedFromPeriod?.to ?? query.to;
  const groupCategories =
    query.group === 'priority'
      ? PRIORITY_EXPENSE_CATEGORIES
      : query.group === 'base'
        ? BASE_EXPENSE_CATEGORIES
        : query.group === 'additional'
          ? ADDITIONAL_EXPENSE_CATEGORIES
          : null;

  const where: Prisma.ExpenseWhereInput = {
    restaurantId: restaurant.id,
    ...(query.category
      ? { category: query.category as PrismaExpenseCategory }
      : groupCategories
        ? { category: { in: groupCategories as PrismaExpenseCategory[] } }
        : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(effectiveFrom || effectiveTo
      ? {
          spentAt: {
            ...(effectiveFrom
              ? { gte: new Date(effectiveFrom.length <= 10 ? `${effectiveFrom}T00:00:00.000Z` : effectiveFrom) }
              : {}),
            ...(effectiveTo
              ? { lte: new Date(effectiveTo.length <= 10 ? `${effectiveTo}T23:59:59.999Z` : effectiveTo) }
              : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { itemName: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
            { invoiceNumber: { contains: query.q, mode: 'insensitive' } },
            { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.expense.findMany({
      where,
      include: { supplier: { select: { name: true } } },
      orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.expense.count({ where }),
  ]);

  res.json({
    data: items.map(serializeExpense),
    pagination: pageMetadata(query.page, query.pageSize, total),
  });
});

const expenseCreateSchema = z.object({
  supplierId: z.string().trim().optional().nullable(),
  supplierName: z.string().trim().max(120).optional().nullable(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  itemName: z.string().trim().max(160).default(''),
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number().positive().max(1_000_000_000),
  quantity: z.coerce.number().positive().max(1_000_000).optional().nullable(),
  unit: z.string().trim().max(24).optional().nullable(),
  unitPrice: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  invoiceNumber: z.string().trim().max(80).optional().nullable(),
  spentAt: z.string().min(4),
  source: z.enum(['MANUAL', 'CSV', 'OCR']).default('MANUAL'),
  isVerified: z.boolean().optional(),
}).strict();

const expenseUpdateSchema = expenseCreateSchema.partial().strict();

async function resolveSupplierId(
  restaurantId: string,
  supplierId?: string | null,
  supplierName?: string | null,
  category?: PrismaExpenseCategory,
): Promise<string | null> {
  if (supplierId) {
    const sup = await db.supplier.findFirst({ where: { id: supplierId, restaurantId } });
    if (sup) return sup.id;
  }
  const cleanName = supplierName?.trim();
  if (!cleanName) return null;
  const sup = await db.supplier.upsert({
    where: { restaurantId_name: { restaurantId, name: cleanName } },
    create: { restaurantId, name: cleanName, category: category ?? 'INGREDIENTS' },
    update: {},
  });
  return sup.id;
}

businessRouter.post('/expenses', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const input = expenseCreateSchema.parse(req.body);
  const parsedDate = new Date(input.spentAt.length <= 10 ? `${input.spentAt}T12:00:00.000Z` : input.spentAt);
  assert(Number.isFinite(parsedDate.getTime()), 400, 'VALIDATION', 'Некорректная дата расхода');

  const autoCategory = input.category ?? classifyExpenseText(`${input.itemName} ${input.description}`).category;
  const supplierId = await resolveSupplierId(
    restaurant.id,
    input.supplierId,
    input.supplierName,
    autoCategory as PrismaExpenseCategory,
  );

  const created = await db.expense.create({
    data: {
      restaurantId: restaurant.id,
      supplierId,
      category: autoCategory as PrismaExpenseCategory,
      itemName: input.itemName || input.description.slice(0, 60),
      description: input.description,
      amount: input.amount,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      unitPrice: input.unitPrice ?? null,
      invoiceNumber: input.invoiceNumber || null,
      spentAt: parsedDate,
      source: input.source,
      isVerified: input.isVerified ?? false,
    },
    include: { supplier: { select: { name: true } } },
  });
  invalidateBusinessCache(restaurant.id);
  res.status(201).json({ data: serializeExpense(created) });
});

businessRouter.patch('/expenses/:id', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const input = expenseUpdateSchema.parse(req.body);
  const existing = await db.expense.findFirst({
    where: { id: req.params.id as string, restaurantId: restaurant.id },
  });
  assert(existing, 404, 'NOT_FOUND', 'Расход не найден');

  let parsedDate: Date | undefined;
  if (input.spentAt !== undefined) {
    parsedDate = new Date(input.spentAt.length <= 10 ? `${input.spentAt}T12:00:00.000Z` : input.spentAt);
    assert(Number.isFinite(parsedDate.getTime()), 400, 'VALIDATION', 'Некорректная дата расхода');
  }

  let supplierId: string | null | undefined;
  if (input.supplierId !== undefined || input.supplierName !== undefined) {
    supplierId = await resolveSupplierId(
      restaurant.id,
      input.supplierId,
      input.supplierName,
      (input.category ?? existing.category) as PrismaExpenseCategory,
    );
  }

  const updated = await db.expense.update({
    where: { id: existing.id },
    data: {
      ...(supplierId !== undefined ? { supplierId } : {}),
      ...(input.category !== undefined ? { category: input.category as PrismaExpenseCategory } : {}),
      ...(input.itemName !== undefined ? { itemName: input.itemName } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
      ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
      ...(parsedDate !== undefined ? { spentAt: parsedDate } : {}),
      ...(input.isVerified !== undefined ? { isVerified: input.isVerified } : {}),
    },
    include: { supplier: { select: { name: true } } },
  });
  invalidateBusinessCache(restaurant.id);

  res.json({ data: serializeExpense(updated) });
});

businessRouter.delete('/expenses/:id', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const existing = await db.expense.findFirst({
    where: { id: req.params.id as string, restaurantId: restaurant.id },
    select: { id: true },
  });
  assert(existing, 404, 'NOT_FOUND', 'Расход не найден');
  await db.expense.delete({ where: { id: existing.id } });
  invalidateBusinessCache(restaurant.id);
  res.json({ data: { deleted: true, id: existing.id } });
});

const classifySchema = z.object({ text: z.string().trim().max(500) }).strict();

businessRouter.post('/expenses/classify', async (req, res) => {
  await resolveBusinessContext(req);
  const { text } = classifySchema.parse(req.body);
  res.json({ data: classifyExpenseText(text) });
});

const importRowSchema = z.object({
  supplierName: z.string().trim().max(120).optional().nullable(),
  category: z.enum(EXPENSE_CATEGORIES).optional().nullable(),
  itemName: z.string().trim().max(160).optional().default(''),
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number().positive().max(1_000_000_000),
  quantity: z.coerce.number().positive().max(1_000_000).optional().nullable(),
  unit: z.string().trim().max(24).optional().nullable(),
  unitPrice: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  invoiceNumber: z.string().trim().max(80).optional().nullable(),
  spentAt: z.string().min(4),
});

const importExpensesSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(5000),
}).strict();

businessRouter.post('/expenses/import', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { rows } = importExpensesSchema.parse(req.body);

  const supplierCache = new Map<string, string>();
  const existingSuppliers = await db.supplier.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true, name: true },
  });
  for (const s of existingSuppliers) supplierCache.set(s.name.toLowerCase(), s.id);

  const errors: Array<{ row: number; reason: string }> = [];
  const missingSuppliers = new Map<string, { name: string; category: PrismaExpenseCategory }>();
  const preparedRows: Array<{
    supKey: string | null;
    category: PrismaExpenseCategory;
    itemName: string;
    description: string;
    amount: number;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    invoiceNumber: string | null;
    spentAt: Date;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const date = new Date(row.spentAt.length <= 10 ? `${row.spentAt}T12:00:00.000Z` : row.spentAt);
    if (!Number.isFinite(date.getTime())) {
      errors.push({ row: i + 1, reason: 'Некорректная дата' });
      continue;
    }
    const category = (row.category ?? classifyExpenseText(`${row.itemName} ${row.description}`).category) as PrismaExpenseCategory;
    const supName = row.supplierName?.trim();
    const supKey = supName ? supName.toLowerCase() : null;
    if (supName && supKey && !supplierCache.has(supKey) && !missingSuppliers.has(supKey)) {
      missingSuppliers.set(supKey, { name: supName, category });
    }
    preparedRows.push({
      supKey,
      category,
      itemName: row.itemName || row.description.slice(0, 60),
      description: row.description,
      amount: row.amount,
      quantity: row.quantity ?? null,
      unit: row.unit ?? null,
      unitPrice: row.unitPrice ?? null,
      invoiceNumber: row.invoiceNumber || null,
      spentAt: date,
    });
  }

  if (missingSuppliers.size > 0) {
    const createdSuppliers = await Promise.all(
      [...missingSuppliers.values()].map(info =>
        db.supplier.upsert({
          where: { restaurantId_name: { restaurantId: restaurant.id, name: info.name } },
          create: { restaurantId: restaurant.id, name: info.name, category: info.category },
          update: {},
        }),
      ),
    );
    for (const sup of createdSuppliers) {
      supplierCache.set(sup.name.toLowerCase(), sup.id);
    }
  }

  if (preparedRows.length > 0) {
    await db.expense.createMany({
      data: preparedRows.map(row => ({
        restaurantId: restaurant.id,
        supplierId: row.supKey ? (supplierCache.get(row.supKey) ?? null) : null,
        category: row.category,
        itemName: row.itemName,
        description: row.description,
        amount: row.amount,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: row.unitPrice,
        invoiceNumber: row.invoiceNumber,
        spentAt: row.spentAt,
        source: 'CSV',
        isVerified: false,
      })),
    });
  }

  invalidateBusinessCache(restaurant.id);
  const analysis = await runRestaurantAnalysis(restaurant.id);
  res.status(201).json({
    data: {
      importedCount: preparedRows.length,
      errors,
      findingsTriggered: analysis.findings.length,
    },
  });
});

const ocrDraftSchema = z.object({
  rawText: z.string().trim().max(8000).optional(),
  fileName: z.string().trim().max(200).optional(),
  imageBase64: z.string().max(3_000_000).optional(),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
}).strict();

businessRouter.post('/expenses/ocr-draft', async (req, res) => {
  await resolveBusinessContext(req);
  const input = ocrDraftSchema.parse(req.body);
  const draft = await extractInvoiceDraftFromTextOrImage(input);
  res.json({ data: draft });
});

businessRouter.post('/orders/reconcile-unpaid', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const unpaidPayments = await db.payment.findMany({
    where: {
      method: 'CARD',
      status: { not: 'PAID' },
      order: { restaurantId: restaurant.id, status: 'DELIVERED' },
    },
    select: { id: true },
  });
  if (unpaidPayments.length > 0) {
    await db.payment.updateMany({
      where: { id: { in: unpaidPayments.map(p => p.id) } },
      data: { status: 'PAID' },
    });
    invalidateBusinessCache(restaurant.id);
  }
  res.json({ data: { reconciledCount: unpaidPayments.length } });
});

businessRouter.post('/demo/reset', async (_req, res) => {
  assert(
    env.NODE_ENV !== 'production' || process.env.ALLOW_DEVELOPMENT_SEED === 'true',
    403,
    'FORBIDDEN',
    'Сброс демо отключён в production',
  );
  await seedBusinessAnalyticsForRestaurants(db, new Date());
  invalidateBusinessCache();
  res.json({ data: { reset: true } });
});

const budgetQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

businessRouter.get('/budgets', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { month } = budgetQuerySchema.parse(req.query);
  const data = await getBudgetsStatus(restaurant.id, month);
  res.json({ data });
});

const upsertBudgetSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  limit: z.coerce.number().min(0).max(1_000_000_000),
}).strict();

businessRouter.put('/budgets', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const input = upsertBudgetSchema.parse(req.body);
  const [y, m] = input.month.split('-').map(Number);
  const monthDate = new Date(Date.UTC(y!, m! - 1, 1, 0, 0, 0, 0));

  await db.expenseBudget.upsert({
    where: {
      restaurantId_category_month: {
        restaurantId: restaurant.id,
        category: input.category as PrismaExpenseCategory,
        month: monthDate,
      },
    },
    create: {
      restaurantId: restaurant.id,
      category: input.category as PrismaExpenseCategory,
      month: monthDate,
      limit: input.limit,
    },
    update: { limit: input.limit },
  });

  invalidateBusinessCache(restaurant.id);
  const data = await getBudgetsStatus(restaurant.id, input.month);
  res.json({ data });
});

businessRouter.get('/analysis', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { from, to } = rangeQuerySchema.parse(req.query);
  const analysis = await runRestaurantAnalysis(restaurant.id, from, to);
  res.json({ data: analysis });
});

async function handleAiSummary(req: Request, res: import('express').Response) {
  const { restaurant } = await resolveBusinessContext(req);
  const { from, to } = rangeQuerySchema.parse(req.body ?? {});
  const analysis = await runRestaurantAnalysis(restaurant.id, from, to);

  const signature = createHash('sha256')
    .update(
      JSON.stringify({
        restaurantId: restaurant.id,
        from: analysis.overview.period.from,
        to: analysis.overview.period.to,
        revenue: analysis.overview.revenue,
        expenses: analysis.overview.totalExpenses,
        findings: analysis.findings.map(f => [f.id, f.amountImpact]),
      }),
    )
    .digest('hex')
    .slice(0, 24);
  const cacheKey = `uzbite:ai-report:${restaurant.id}:${signature}`;

  if (redis.isReady) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.json({ data: { report: JSON.parse(cached) } });
        return;
      }
    } catch {
      /* Ignore cache miss or Redis transient read error. */
    }
  }

  const report = await generateAiOptimizationReport(analysis.overview, analysis.findings);

  if (redis.isReady) {
    try {
      await redis.set(cacheKey, JSON.stringify(report), { EX: 3600 });
    } catch {
      /* Ignore cache write failure. */
    }
  }

  res.json({ data: { report } });
}

businessRouter.post('/analysis/ai-summary', handleAiSummary);
businessRouter.post('/ai-optimize', handleAiSummary);

const askSchema = z.object({
  question: z.string().trim().min(2).max(500),
  from: z.string().optional(),
  to: z.string().optional(),
}).strict();

businessRouter.post('/analysis/ask', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { question, from, to } = askSchema.parse(req.body);
  const parsedPeriod = parseDatePeriodFromQuestion(question);
  const effectiveFrom = parsedPeriod?.from ?? from;
  const effectiveTo = parsedPeriod?.to ?? to;
  const range = resolveDateRange(effectiveFrom, effectiveTo);
  const [analysis, periodExpenses] = await Promise.all([
    runRestaurantAnalysis(restaurant.id, effectiveFrom, effectiveTo),
    db.expense.findMany({
      where: { restaurantId: restaurant.id, spentAt: { gte: range.from, lte: range.to } },
      include: { supplier: { select: { name: true } } },
      orderBy: [{ spentAt: 'desc' }, { amount: 'desc' }],
    }),
  ]);
  const answer = await answerFinancialQuestion({
    question,
    restaurantName: restaurant.name,
    overview: analysis.overview,
    findings: analysis.findings,
    expenses: periodExpenses.map(e => ({
      id: e.id,
      supplierId: e.supplierId,
      supplierName: e.supplier?.name ?? null,
      category: e.category,
      itemName: e.itemName,
      description: e.description,
      amount: e.amount.toNumber(),
      quantity: e.quantity ? e.quantity.toNumber() : null,
      unit: e.unit,
      unitPrice: e.unitPrice ? e.unitPrice.toNumber() : null,
      invoiceNumber: e.invoiceNumber,
      spentAt: e.spentAt,
    })),
    resolvedPeriod: parsedPeriod,
  });
  res.json({ data: answer });
});

// --- Point 25: Budget Variance & Early-Warning Forecast ---
businessRouter.get('/budgets/variance', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { month } = budgetQuerySchema.parse(req.query);
  const items = await computeBudgetVarianceAndForecast(restaurant.id, month);
  res.json({ data: items });
});

// --- Point 24: Multi-Branch Budget Optimization ---
const branchAllocationQuerySchema = z.object({
  totalBudget: z.coerce.number().positive().max(100_000_000_000).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  objective: z.enum(['profit', 'balanced', 'growth']).default('balanced'),
});

businessRouter.get('/branches/allocation', async (req, res) => {
  await resolveBusinessContext(req);
  const query = branchAllocationQuerySchema.parse(req.query);
  const data = await computeMultiBranchAllocation(query);
  res.json({ data });
});

const applyBranchAllocationSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  allocations: z.array(
    z.object({
      restaurantId: z.string().min(1),
      category: z.enum(EXPENSE_CATEGORIES),
      limit: z.coerce.number().min(0).max(10_000_000_000),
    }),
  ).min(1).max(200),
}).strict();

businessRouter.post('/branches/allocation/apply', async (req, res) => {
  const { restaurants } = await resolveBusinessContext(req);
  const allowedIds = new Set(restaurants.map(r => r.id));
  const input = applyBranchAllocationSchema.parse(req.body);
  const [y, m] = input.month.split('-').map(Number);
  const monthDate = new Date(Date.UTC(y!, m! - 1, 1, 0, 0, 0, 0));

  const validAllocations = input.allocations.filter(a => allowedIds.has(a.restaurantId));
  assert(validAllocations.length > 0, 400, 'VALIDATION', 'Нет доступных филиалов для применения бюджетов');

  await db.$transaction(
    validAllocations.map(item =>
      db.expenseBudget.upsert({
        where: {
          restaurantId_category_month: {
            restaurantId: item.restaurantId,
            category: item.category as PrismaExpenseCategory,
            month: monthDate,
          },
        },
        create: {
          restaurantId: item.restaurantId,
          category: item.category as PrismaExpenseCategory,
          month: monthDate,
          limit: item.limit,
        },
        update: { limit: item.limit },
      }),
    ),
  );

  for (const rId of new Set(validAllocations.map(a => a.restaurantId))) {
    invalidateBusinessCache(rId);
  }
  res.json({ data: { appliedCount: validAllocations.length, month: input.month } });
});

// --- Tashkent Districts & Order Geo-Analytics ---
const districtGeoQuerySchema = rangeQuerySchema.extend({
  scope: z.enum(['all', 'current']).default('all'),
  districtId: z.enum(TASHKENT_DISTRICT_IDS).optional(),
});

businessRouter.get('/geo/districts', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const { from, to, scope, districtId } = districtGeoQuerySchema.parse(req.query);
  const data = await analyzeOrdersByDistrict({
    restaurantId: scope === 'current' ? restaurant.id : 'ALL',
    from,
    to,
    districtId,
  });
  res.json({ data });
});

// --- AI Finance Agent & MCP Endpoints ---
businessRouter.get('/agent/models', async (req, res) => {
  await resolveBusinessContext(req);
  const data = await listCoarenaModels();
  res.json({ data });
});

businessRouter.get('/agent/tools', async (req, res) => {
  await resolveBusinessContext(req);
  res.json({ data: MCP_TOOLS });
});

const mcpToolCallSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  month: z.string().optional(),
  period: z.string().optional(),
}).strict();

businessRouter.post('/agent/tools/call', async (req, res) => {
  const { restaurant, restaurants } = await resolveBusinessContext(req);
  const input = mcpToolCallSchema.parse(req.body);
  const parsed = input.period ? parseDatePeriodFromQuestion(input.period) : null;
  const argRestId = typeof input.arguments?.restaurantId === 'string' ? input.arguments.restaurantId.trim() : '';
  const targetRestaurant = argRestId ? restaurants.find(r => r.id === argRestId) : undefined;
  const result = await executeMcpTool(input.name, input.arguments ?? {}, {
    restaurantId: targetRestaurant?.id ?? restaurant.id,
    from: parsed?.from ?? input.from,
    to: parsed?.to ?? input.to,
    month: parsed?.month ?? input.month,
  });
  res.json({ data: { tool: input.name, result } });
});

const agentChatSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  lang: z.enum(['ru', 'uz', 'en']).default('uz'),
  model: z.string().trim().min(1).max(120).optional(),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(4000),
    }),
  ).max(12).optional(),
  screenContext: z.object({
    activeTab: z.enum(['dashboard', 'agent', 'audit', 'expenses', 'budgets', 'branches', 'map', 'sales']),
    restaurantId: z.string(),
    days: z.number(),
    month: z.string(),
    districtId: z.string().optional(),
    visibleWidgets: z.array(z.string()).optional(),
    summaryText: z.string().max(2000).optional(),
    activeCustomDashboardId: z.string().nullable().optional(),
    customDashboards: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          blockCount: z.number(),
          blockKinds: z.array(z.string()).optional(),
        }),
      )
      .max(24)
      .optional(),
    pinnedWidgetsCount: z.number().optional(),
  }).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  month: z.string().optional(),
  totalBudget: z.number().positive().optional(),
  districtId: z
    .union([z.enum(TASHKENT_DISTRICT_IDS), z.literal('')])
    .optional()
    .transform(v => (v ? v : undefined)),
}).strict();

businessRouter.post('/agent/chat', async (req, res) => {
  const { restaurant } = await resolveBusinessContext(req);
  const input = agentChatSchema.parse(req.body);
  const response = await runFinanceAgentChat({
    question: input.question,
    lang: input.lang,
    model: input.model,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    history: input.history,
    screenContext: input.screenContext as Parameters<typeof runFinanceAgentChat>[0]['screenContext'],
    from: input.from,
    to: input.to,
    month: input.month,
    totalBudget: input.totalBudget,
    districtId: input.districtId,
  });
  res.json({ data: response });
});

const agentFeedbackSchema = z.object({
  requestId: z.string().trim().min(1).max(200),
  rating: z.enum(['up', 'down']),
  comment: z.string().trim().max(500).optional(),
}).strict();

businessRouter.post('/agent/feedback', async (req, res) => {
  await resolveBusinessContext(req);
  const input = agentFeedbackSchema.parse(req.body);
  const result = await submitCoarenaFeedback(input);
  res.json({ data: result });
});
