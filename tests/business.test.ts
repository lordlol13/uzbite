import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../apps/backend/src/app.js';
import { db } from '../apps/backend/src/config/database.js';
import { env } from '../apps/backend/src/config/env.js';

let server: Server;
let baseUrl = '';
let accessToken = '';
let refreshToken = '';
let restaurantId = '';
let createdExpenseId = '';

async function api(method: string, path: string, body?: unknown, token = accessToken) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(restaurantId ? { 'X-Restaurant-Id': restaurantId } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  return { status: res.status, data: payload.data, error: payload.error };
}

before(async () => {
  const app = createApp();
  server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  const health = await api('GET', '/health', undefined, '');
  assert.equal(health.status, 200, 'PostgreSQL must be running and migrated before integration tests');
});

after(async () => {
  if (createdExpenseId) {
    await db.expense.deleteMany({ where: { id: createdExpenseId } });
  }
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.$disconnect();
});

test('UzBite Business auth login, refresh, and /me profile', async () => {
  const unauth = await api('GET', '/business/me', undefined, '');
  assert.equal(unauth.status, 401);

  const login = await api('POST', '/business/auth/login', { demo: true }, '');
  assert.equal(login.status, 200);
  const data = login.data as {
    accessToken: string;
    refreshToken: string;
    user: { role: string; restaurantId: string };
    restaurants: Array<{ id: string }>;
  };
  assert.ok(data.accessToken);
  assert.ok(data.refreshToken);
  assert.equal(data.user.role, 'RESTAURANT');
  assert.ok(data.restaurants.length >= 1);

  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
  restaurantId = data.user.restaurantId;

  const me = await api('GET', '/business/me');
  assert.equal(me.status, 200);

  const refreshed = await api('POST', '/business/auth/refresh', { refreshToken }, '');
  assert.equal(refreshed.status, 200);
  const rotated = refreshed.data as { accessToken: string; refreshToken: string };
  assert.ok(rotated.accessToken);
  accessToken = rotated.accessToken;
  refreshToken = rotated.refreshToken;
});

test('UzBite Business analytics, expenses CRUD, budgets, branches, geo, and AI agent endpoints', async () => {
  const overview = await api('GET', '/business/overview');
  assert.equal(overview.status, 200);

  const analysis = await api('GET', '/business/analysis');
  assert.equal(analysis.status, 200);

  const classified = await api('POST', '/business/expenses/classify', {
    text: 'Оплата электроэнергии РЭС за месяц',
  });
  assert.equal(classified.status, 200);
  assert.equal((classified.data as { category: string }).category, 'UTILITIES');

  const today = new Date().toISOString().slice(0, 10);
  const created = await api('POST', '/business/expenses', {
    itemName: 'Интеграционный тест расхода',
    description: 'Тестовая запись для проверки UzBite Business',
    amount: 125000,
    spentAt: today,
    category: 'OTHER',
  });
  assert.equal(created.status, 201);
  createdExpenseId = (created.data as { id: string }).id;

  const patched = await api('PATCH', `/business/expenses/${createdExpenseId}`, {
    isVerified: true,
    amount: 130000,
  });
  assert.equal(patched.status, 200);
  assert.equal((patched.data as { amount: number }).amount, 130000);

  const deleted = await api('DELETE', `/business/expenses/${createdExpenseId}`);
  assert.equal(deleted.status, 200);
  createdExpenseId = '';

  const budgets = await api('GET', '/business/budgets');
  assert.equal(budgets.status, 200);

  const variance = await api('GET', '/business/budgets/variance');
  assert.equal(variance.status, 200);

  const allocation = await api('GET', '/business/branches/allocation?totalBudget=100000000');
  assert.equal(allocation.status, 200);

  const districts = await api('GET', '/business/geo/districts');
  assert.equal(districts.status, 200);

  const tools = await api('GET', '/business/agent/tools');
  assert.equal(tools.status, 200);
  assert.ok(Array.isArray(tools.data) && tools.data.length > 0);

  const models = await api('GET', '/business/agent/models');
  assert.equal(models.status, 200);
  const modelsData = models.data as { activeModel: string; configured: boolean; models: Array<{ id: string }> };
  assert.ok(modelsData.models.length >= 3);

  const toolCall = await api('POST', '/business/agent/tools/call', {
    name: 'get_expenses',
    period: 'прошлая неделя',
  });
  assert.equal(toolCall.status, 200);

  const aiSummary = await api('POST', '/business/analysis/ai-summary', {});
  assert.equal(aiSummary.status, 200);
  assert.ok((aiSummary.data as { report?: { healthScore: number } }).report?.healthScore !== undefined);

  const aiOptimize = await api('POST', '/business/ai-optimize', {});
  assert.equal(aiOptimize.status, 200);
  assert.ok((aiOptimize.data as { report?: { healthScore: number } }).report?.healthScore !== undefined);

  const ask = await api('POST', '/business/analysis/ask', {
    question: 'Налоги и электричество за прошлую неделю',
  });
  assert.equal(ask.status, 200);
  assert.ok((ask.data as { answer?: { ru: string; uz: string; en: string } }).answer?.ru);
});

test('AI Agent chat, multi-turn history, screenContext, actions, blocks, feedback, and offline no-key fallback', async () => {
  const prevCoarena = env.COARENA_API_KEY;
  const prevGemini = env.GEMINI_API_KEY;
  env.COARENA_API_KEY = undefined;
  env.GEMINI_API_KEY = undefined;

  try {
    const modelsOffline = await api('GET', '/business/agent/models');
    assert.equal(modelsOffline.status, 200);
    assert.equal((modelsOffline.data as { configured: boolean }).configured, false);

    // 1. Period & Priority expenses in RU with screenContext
    const chatRu = await api('POST', '/business/agent/chat', {
      question: 'Налоги и электричество за прошлую неделю',
      lang: 'ru',
      screenContext: {
        activeTab: 'expenses',
        restaurantId,
        days: 30,
        month: new Date().toISOString().slice(0, 7),
        customDashboards: [{ id: 'dash-1', title: 'Налоги', blockCount: 2, blockKinds: ['kpis', 'chart'] }],
        pinnedWidgetsCount: 1,
      },
    });
    assert.equal(chatRu.status, 200);
    const ruBody = chatRu.data as {
      requestId: string;
      source: string;
      answer: { ru: string; uz: string; en: string };
      uiBlocks: Array<{ kind: string }>;
      autoActions: Array<{ type: string }>;
      toolTraces: Array<{ tool: string }>;
    };
    assert.equal(ruBody.source, 'heuristic');
    assert.ok(ruBody.requestId.startsWith('heuristic-'));
    assert.ok(ruBody.answer.ru.length > 10);
    assert.ok(ruBody.uiBlocks.some(b => b.kind === 'kpis'));
    assert.ok(ruBody.autoActions.some(a => a.type === 'set_filters'));
    assert.ok(ruBody.toolTraces.some(t => t.tool === 'get_expenses'));

    // 2. Feedback on offline heuristic response must succeed cleanly
    const fb = await api('POST', '/business/agent/feedback', {
      requestId: ruBody.requestId,
      rating: 'up',
    });
    assert.equal(fb.status, 200);
    assert.equal((fb.data as { ok: boolean }).ok, true);

    // 3. Multi-turn follow-up in UZ creating a custom dashboard
    const chatFollowUp = await api('POST', '/business/agent/chat', {
      question: 'Создай из этого дашборд',
      lang: 'uz',
      history: [
        { role: 'user', content: 'Какие статьи превысят бюджет до конца месяца?' },
        { role: 'assistant', content: 'Прогноз по бюджетам сформирован.' },
      ],
      screenContext: {
        activeTab: 'budgets',
        restaurantId,
        days: 30,
        month: new Date().toISOString().slice(0, 7),
        customDashboards: [],
        pinnedWidgetsCount: 0,
      },
    });
    assert.equal(chatFollowUp.status, 200);
    const followData = chatFollowUp.data as {
      answer: { uz: string };
      autoActions: Array<{ type: string; blocks?: unknown[] }>;
    };
    assert.ok(followData.answer.uz.length > 10);
    assert.ok(followData.autoActions.some(a => a.type === 'create_dashboard' && (a.blocks?.length ?? 0) >= 2));

    // 4. Multi-branch allocation (#24) in EN with apply_branch_budgets suggestedAction
    const chatBranches = await api('POST', '/business/agent/chat', {
      question: 'Optimally allocate 120M UZS across all branches by ROI',
      lang: 'en',
    });
    assert.equal(chatBranches.status, 200);
    const branchBody = chatBranches.data as {
      uiBlocks: Array<{ kind: string }>;
      suggestedActions: Array<{ type: string }>;
    };
    assert.ok(branchBody.uiBlocks.some(b => b.kind === 'allocation'));
    assert.ok(branchBody.suggestedActions.some(a => a.type === 'apply_branch_budgets'));
  } finally {
    env.COARENA_API_KEY = prevCoarena;
    env.GEMINI_API_KEY = prevGemini;
  }
});
