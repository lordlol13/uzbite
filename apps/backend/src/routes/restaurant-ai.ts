import { Router, type Request } from 'express';
import { ExpenseCategory as PrismaExpenseCategory } from '@prisma/client';
import { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  TASHKENT_DISTRICT_IDS,
  type AgentScreenContext,
} from '@uzbite/shared';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { invalidateBusinessCache } from '../services/business-analytics.js';
import { listCoarenaModels, submitCoarenaFeedback } from '../services/coarena.js';
import {
  ALL_RESTAURANT_AI_TOOLS,
  DEFAULT_RESTAURANT_AI_MODEL,
  executeRestaurantAiTool,
  runRestaurantAiChat,
} from '../services/restaurant-ai.js';
import { assert } from '../utils/errors.js';

export const restaurantAiRouter = Router();

async function resolveOwnedRestaurant(req: Request) {
  const userId = req.user!.id;
  let restaurant = await db.restaurant.findFirst({
    where: { ownerId: userId },
    select: { id: true, slug: true, name: true, ownerId: true },
  });
  if (!restaurant && env.NODE_ENV !== 'production') {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email === 'owner@uzbite.uz') {
      restaurant = await db.restaurant.findFirst({
        where: { id: 'rest-osh' },
        select: { id: true, slug: true, name: true, ownerId: true },
      });
    }
  }
  assert(restaurant, 404, 'RESTAURANT_NOT_FOUND', 'У аккаунта нет привязанного ресторана');
  return restaurant;
}

async function resolveAllowedRestaurantIds(req: Request, ownedRestaurantId: string): Promise<Set<string>> {
  if (env.NODE_ENV !== 'production') {
    const all = await db.restaurant.findMany({ select: { id: true } });
    return new Set([ownedRestaurantId, ...all.map(r => r.id)]);
  }
  const owned = await db.restaurant.findMany({
    where: { ownerId: req.user!.id },
    select: { id: true },
  });
  return new Set([ownedRestaurantId, ...owned.map(r => r.id)]);
}

restaurantAiRouter.get('/models', async (req, res) => {
  await resolveOwnedRestaurant(req);
  const data = await listCoarenaModels();
  res.json({
    data: {
      ...data,
      activeModel: data.activeModel || DEFAULT_RESTAURANT_AI_MODEL,
    },
  });
});

restaurantAiRouter.get('/tools', async (req, res) => {
  await resolveOwnedRestaurant(req);
  res.json({ data: ALL_RESTAURANT_AI_TOOLS });
});

const toolCallSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    arguments: z.record(z.string(), z.unknown()).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    month: z.string().optional(),
  })
  .strict();

restaurantAiRouter.post('/tools/call', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const input = toolCallSchema.parse(req.body);
  const result = await executeRestaurantAiTool(input.name, input.arguments ?? {}, {
    restaurantId: restaurant.id,
    userId: req.user!.id,
    from: input.from,
    to: input.to,
    month: input.month,
  });
  res.json({ data: { tool: input.name, result } });
});

const restaurantChatSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
    lang: z.enum(['ru', 'uz', 'en']).default('ru'),
    model: z.string().trim().min(1).max(120).optional(),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(4000),
        }),
      )
      .max(12)
      .optional(),
    screenContext: z
      .object({
        activeTab: z
          .enum(['dashboard', 'agent', 'audit', 'expenses', 'budgets', 'branches', 'map', 'sales'])
          .default('agent'),
        restaurantId: z.string().optional(),
        days: z.number().default(30),
        month: z.string().optional(),
        districtId: z.string().optional(),
        restaurantRoute: z.string().trim().max(200).optional(),
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
      })
      .optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    month: z.string().optional(),
    totalBudget: z.number().positive().optional(),
    districtId: z.enum(TASHKENT_DISTRICT_IDS).optional(),
  })
  .strict();

restaurantAiRouter.post('/chat', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const input = restaurantChatSchema.parse(req.body);
  const defaultMonth = new Date().toISOString().slice(0, 7);
  const normalizedScreenContext: AgentScreenContext | undefined = input.screenContext
    ? {
        activeTab: input.screenContext.activeTab,
        restaurantId: input.screenContext.restaurantId || restaurant.id,
        days: input.screenContext.days,
        month: input.screenContext.month || input.month || defaultMonth,
        districtId: input.screenContext.districtId as AgentScreenContext['districtId'],
        restaurantRoute: input.screenContext.restaurantRoute,
        visibleWidgets: input.screenContext.visibleWidgets,
        summaryText: input.screenContext.summaryText,
        activeCustomDashboardId: input.screenContext.activeCustomDashboardId,
        customDashboards: input.screenContext.customDashboards,
        pinnedWidgetsCount: input.screenContext.pinnedWidgetsCount,
      }
    : undefined;

  const response = await runRestaurantAiChat({
    question: input.question,
    lang: input.lang,
    model: input.model || DEFAULT_RESTAURANT_AI_MODEL,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    userId: req.user!.id,
    history: input.history,
    screenContext: normalizedScreenContext,
    from: input.from,
    to: input.to,
    month: input.month,
    totalBudget: input.totalBudget,
    districtId: input.districtId,
  });
  res.json({ data: response });
});

const feedbackSchema = z
  .object({
    requestId: z.string().trim().min(1).max(200),
    rating: z.enum(['up', 'down']),
    comment: z.string().trim().max(500).optional(),
  })
  .strict();

restaurantAiRouter.post('/feedback', async (req, res) => {
  await resolveOwnedRestaurant(req);
  const input = feedbackSchema.parse(req.body);
  const result = await submitCoarenaFeedback(input);
  res.json({ data: result });
});

const fixFindingSchema = z
  .object({
    type: z.literal('fix_finding').optional(),
    label: z.string().max(200).optional(),
    findingId: z.string().trim().min(1).max(200).optional(),
    code: z.enum(['DUPLICATE_INVOICE', 'AMOUNT_MISMATCH', 'CATEGORY_MISMATCH']),
    expenseId: z.string().trim().min(1).optional(),
    duplicateExpenseId: z.string().trim().min(1).optional(),
    expectedAmount: z.coerce.number().positive().max(1_000_000_000).optional(),
    suggestedCategory: z.enum(EXPENSE_CATEGORIES).optional(),
  })
  .strict();

restaurantAiRouter.post('/fix-finding', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const allowedIds = await resolveAllowedRestaurantIds(req, restaurant.id);
  const input = fixFindingSchema.parse(req.body);

  if (input.code === 'DUPLICATE_INVOICE') {
    const targetId = input.duplicateExpenseId ?? input.expenseId;
    assert(targetId, 400, 'VALIDATION', 'Не указан duplicateExpenseId для удаления дубликата');
    const existing = await db.expense.findFirst({
      where: { id: targetId, restaurantId: { in: [...allowedIds] } },
      select: { id: true, restaurantId: true },
    });
    assert(existing, 404, 'NOT_FOUND', 'Расход не найден или недоступен');
    await db.expense.delete({ where: { id: existing.id } });
    invalidateBusinessCache(existing.restaurantId);
    res.json({
      data: {
        fixed: true,
        code: input.code,
        action: 'deleted',
        expenseId: existing.id,
        restaurantId: existing.restaurantId,
      },
    });
    return;
  }

  if (input.code === 'AMOUNT_MISMATCH') {
    assert(input.expenseId, 400, 'VALIDATION', 'Не указан expenseId для исправления суммы');
    assert(
      input.expectedAmount !== undefined && Number.isFinite(input.expectedAmount),
      400,
      'VALIDATION',
      'Не указана корректная сумма expectedAmount',
    );
    const existing = await db.expense.findFirst({
      where: { id: input.expenseId, restaurantId: { in: [...allowedIds] } },
      select: { id: true, restaurantId: true },
    });
    assert(existing, 404, 'NOT_FOUND', 'Расход не найден или недоступен');
    await db.expense.update({
      where: { id: existing.id },
      data: { amount: input.expectedAmount, isVerified: true },
    });
    invalidateBusinessCache(existing.restaurantId);
    res.json({
      data: {
        fixed: true,
        code: input.code,
        action: 'updated_amount',
        expenseId: existing.id,
        amount: input.expectedAmount,
        restaurantId: existing.restaurantId,
      },
    });
    return;
  }

  // CATEGORY_MISMATCH
  assert(input.expenseId, 400, 'VALIDATION', 'Не указан expenseId для исправления категории');
  assert(input.suggestedCategory, 400, 'VALIDATION', 'Не указана категория suggestedCategory');
  const existing = await db.expense.findFirst({
    where: { id: input.expenseId, restaurantId: { in: [...allowedIds] } },
    select: { id: true, restaurantId: true },
  });
  assert(existing, 404, 'NOT_FOUND', 'Расход не найден или недоступен');
  await db.expense.update({
    where: { id: existing.id },
    data: {
      category: input.suggestedCategory as PrismaExpenseCategory,
      isVerified: true,
    },
  });
  invalidateBusinessCache(existing.restaurantId);
  res.json({
    data: {
      fixed: true,
      code: input.code,
      action: 'updated_category',
      expenseId: existing.id,
      category: input.suggestedCategory,
      restaurantId: existing.restaurantId,
    },
  });
});

const applyBranchBudgetsSchema = z
  .object({
    type: z.literal('apply_branch_budgets').optional(),
    label: z.string().max(200).optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    allocations: z
      .array(
        z.object({
          restaurantId: z.string().min(1),
          category: z.enum(EXPENSE_CATEGORIES),
          limit: z.coerce.number().min(0).max(10_000_000_000),
        }),
      )
      .min(1)
      .max(200),
  })
  .strict();

restaurantAiRouter.post('/apply-branch-budgets', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const allowedIds = await resolveAllowedRestaurantIds(req, restaurant.id);
  const input = applyBranchBudgetsSchema.parse(req.body);
  const [y, m] = input.month.split('-').map(Number);
  const monthDate = new Date(Date.UTC(y!, m! - 1, 1, 0, 0, 0, 0));

  const validAllocations = input.allocations.filter(a => allowedIds.has(a.restaurantId));
  assert(
    validAllocations.length > 0,
    400,
    'VALIDATION',
    'Нет доступных филиалов для применения бюджетов',
  );

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
