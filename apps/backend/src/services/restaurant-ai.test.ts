import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentClientAction } from '@uzbite/shared';
import { MCP_TOOLS } from './finance-agent.js';
import {
  ALL_RESTAURANT_AI_TOOLS,
  DEFAULT_RESTAURANT_AI_MODEL,
  RESTAURANT_APP_ROUTES,
  RESTAURANT_OPS_TOOLS,
  buildRestaurantOpsResponse,
  detectRestaurantOpsIntents,
  executeRestaurantAiTool,
  filterFinanceActionsForRestaurant,
  type RestaurantLiveOpsSnapshot,
} from './restaurant-ai.js';

function createSampleOpsSnapshot(
  overrides?: Partial<RestaurantLiveOpsSnapshot>,
): RestaurantLiveOpsSnapshot {
  const base: RestaurantLiveOpsSnapshot = {
    period: { from: '2026-10-19', to: '2026-11-18' },
    restaurant: {
      id: 'rest-osh',
      name: 'Osh & Olov',
      isOpen: true,
      acceptingOrders: true,
      preparationMinutes: 20,
      deliveryFee: 12_000,
      minOrder: 30_000,
      acceptCash: true,
      acceptCard: true,
      rating: 4.8,
      reviewCount: 42,
      followerCount: 315,
    },
    orders: {
      total: 48,
      today: 9,
      activeCount: 6,
      byStatus: {
        PENDING_ACCEPTANCE: 2,
        ACCEPTED: 1,
        PREPARING: 2,
        DELIVERING: 1,
        DELIVERED: 39,
        CANCELLED: 3,
      },
      pendingAcceptance: [
        {
          id: 'ord-1001-abcd',
          recipientName: 'Azizbek',
          total: 145_000,
          itemsCount: 3,
          createdAt: '2026-11-18T06:55:00.000Z',
          minutesWaiting: 14,
        },
        {
          id: 'ord-1002-efgh',
          recipientName: 'Malika',
          total: 88_000,
          itemsCount: 2,
          createdAt: '2026-11-18T07:05:00.000Z',
          minutesWaiting: 4,
        },
      ],
      todayRevenue: 920_000,
      totalRevenue: 6_450_000,
      avgCheck: 143_333,
      deliveredCount: 39,
      cancelledCount: 3,
      cancelRatePct: 6.3,
    },
    payments: {
      awaitingConfirmationCount: 2,
      awaitingConfirmationAmount: 233_000,
      awaitingPaymentCount: 1,
      paidCount: 41,
      paidAmount: 5_820_000,
      cashPaidAmount: 2_120_000,
      cardPaidAmount: 3_700_000,
      rejectedCount: 1,
      confirmationQueue: [
        {
          orderId: 'ord-1001-abcd',
          paymentId: 'pay-1',
          method: 'CARD',
          amount: 145_000,
          recipientName: 'Azizbek',
          hasReceipt: true,
          createdAt: '2026-11-18T06:56:00.000Z',
        },
        {
          orderId: 'ord-1002-efgh',
          paymentId: 'pay-2',
          method: 'CARD',
          amount: 88_000,
          recipientName: 'Malika',
          hasReceipt: false,
          createdAt: '2026-11-18T07:06:00.000Z',
        },
      ],
    },
    couriersAndDelivery: {
      totalAffiliated: 4,
      activeCouriers: 3,
      availableCouriers: 1,
      busyCouriers: 2,
      offlineCouriers: 0,
      totalActiveLoad: 4,
      couriers: [
        {
          id: 'cour-1',
          name: 'Sardor',
          phone: '+998901112233',
          status: 'ACTIVE',
          availability: 'BUSY',
          activeLoad: 3,
        },
        {
          id: 'cour-2',
          name: 'Jasur',
          phone: '+998904445566',
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          activeLoad: 0,
        },
      ],
      deliveriesTotal: 42,
      deliveriesInProgress: 3,
      deliveriesSearching: 1,
      deliveriesDelivered: 37,
      deliveriesFailedOrCancelled: 2,
      ownCourierCount: 30,
      onDemandCourierCount: 12,
      avgDeliveryMinutes: 34,
      slaOnTimePct: 86.5,
      deliveryRewardTotal: 420_000,
    },
    menu: {
      totalDishes: 24,
      availableDishes: 21,
      unavailableDishes: [
        { id: 'd-stop-1', name: 'Самса с тыквой', categoryName: 'Выпечка', price: 18_000 },
        { id: 'd-stop-2', name: 'Шурпа', categoryName: 'Супы', price: 42_000 },
        { id: 'd-stop-3', name: 'Айран', categoryName: 'Напитки', price: 12_000 },
      ],
      archivedDishes: 2,
      categoriesCount: 5,
      categories: [
        { id: 'cat-1', name: 'Плов', dishCount: 6, quantitySold: 92, revenue: 4_140_000 },
        { id: 'cat-2', name: 'Шашлык', dishCount: 7, quantitySold: 64, revenue: 1_920_000 },
      ],
      topDishes: [
        {
          dishId: 'd-1',
          name: 'Ташкентский плов',
          categoryName: 'Плов',
          price: 45_000,
          costPrice: 19_000,
          marginPct: 57.8,
          quantitySold: 70,
          revenue: 3_150_000,
          isAvailable: true,
        },
        {
          dishId: 'd-2',
          name: 'Шашлык из говядины',
          categoryName: 'Шашлык',
          price: 30_000,
          costPrice: 20_000,
          marginPct: 33.3,
          quantitySold: 40,
          revenue: 1_200_000,
          isAvailable: true,
        },
      ],
      lowMarginDishes: [
        {
          dishId: 'd-2',
          name: 'Шашлык из говядины',
          categoryName: 'Шашлык',
          price: 30_000,
          costPrice: 20_000,
          marginPct: 33.3,
          quantitySold: 40,
          revenue: 1_200_000,
          isAvailable: true,
        },
      ],
    },
    postsAndEngagement: {
      totalPosts: 12,
      publishedPosts: 10,
      draftPosts: 2,
      totalLikes: 840,
      totalComments: 96,
      unreadNotifications: 5,
    },
    imports: {
      totalImportJobs: 3,
      totalExportJobs: 4,
      lastImport: {
        id: 'imp-1',
        fileName: 'menu_november.xlsx',
        fileFormat: 'xlsx',
        status: 'COMPLETED',
        totalRows: 24,
        addedCount: 6,
        updatedCount: 16,
        skippedCount: 1,
        errorCount: 1,
        createdAt: '2026-11-15T10:00:00.000Z',
      },
    },
  };

  return { ...base, ...overrides };
}

test('ALL_RESTAURANT_AI_TOOLS combines MCP_TOOLS and restaurant_ops tools with default gemini-3-8-flash', () => {
  assert.equal(DEFAULT_RESTAURANT_AI_MODEL, 'gemini-3-8-flash');
  assert.equal(ALL_RESTAURANT_AI_TOOLS.length, MCP_TOOLS.length + RESTAURANT_OPS_TOOLS.length);

  const opsNames = new Set(RESTAURANT_OPS_TOOLS.map(t => t.name));
  assert.ok(opsNames.has('get_restaurant_live_ops'));
  assert.ok(opsNames.has('get_pending_orders_and_payments'));
  assert.ok(opsNames.has('get_courier_and_delivery_sla'));
  assert.ok(opsNames.has('get_menu_and_import_health'));
  assert.ok(opsNames.has('navigate_restaurant_app'));

  for (const tool of RESTAURANT_OPS_TOOLS) {
    assert.equal(tool.category, 'restaurant_ops');
  }
});

test('executeRestaurantAiTool handles navigate_restaurant_app cleanly and validates route', async () => {
  const valid = (await executeRestaurantAiTool(
    'navigate_restaurant_app',
    { route: '/couriers', label: 'Курьеры' },
    { restaurantId: 'rest-osh' },
  )) as { accepted: boolean; action: { type: string; route: string; label: string } };

  assert.equal(valid.accepted, true);
  assert.equal(valid.action.type, 'navigate_route');
  assert.equal(valid.action.route, '/couriers');
  assert.equal(valid.action.label, 'Курьеры');

  const fallback = (await executeRestaurantAiTool(
    'navigate_restaurant_app',
    { route: '/unknown-page' },
    { restaurantId: 'rest-osh' },
  )) as { accepted: boolean; action: { type: string; route: string } };

  assert.equal(fallback.action.route, '/dashboard');
});

test('detectRestaurantOpsIntents detects RU/UZ/EN operational intents and explicit route navigation', () => {
  const ordersIntent = detectRestaurantOpsIntents('Покажи текущие заказы на кухне в ожидании принятия');
  assert.equal(ordersIntent.isOrders, true);
  assert.equal(ordersIntent.isAnyOpsIntent, true);

  const paymentsIntent = detectRestaurantOpsIntents("Tasdiqlanmagan karta to'lovlari va cheklarni ko'rsat");
  assert.equal(paymentsIntent.isPayments, true);

  const couriersNav = detectRestaurantOpsIntents('Открой раздел курьеров и покажи их загрузку');
  assert.equal(couriersNav.isCouriers, true);
  assert.equal(couriersNav.explicitNavigation, true);
  assert.equal(couriersNav.requestedRoute, '/couriers');

  const settingsNav = detectRestaurantOpsIntents('Go to settings page');
  assert.equal(settingsNav.explicitNavigation, true);
  assert.equal(settingsNav.requestedRoute, '/settings');

  const menuNav = detectRestaurantOpsIntents('Menyu sahifasiga o‘t va stop-listdagi taomlarni ko‘rsat');
  assert.equal(menuNav.isMenu, true);
  assert.equal(menuNav.requestedRoute, '/menu');

  const notifNav = detectRestaurantOpsIntents('Open notifications');
  assert.equal(notifNav.requestedRoute, '/notifications');

  const onboardNav = detectRestaurantOpsIntents('Открой онбординг ресторана');
  assert.equal(onboardNav.requestedRoute, '/onboarding');

  const allRoutesCount = RESTAURANT_APP_ROUTES.length;
  assert.equal(allRoutesCount, 14);
});

test('buildRestaurantOpsResponse generates rich KPIs, chart, table, alert and navigate_route for orders', () => {
  const ops = createSampleOpsSnapshot();
  const intents = detectRestaurantOpsIntents('Какие заказы сейчас ждут принятия на кухне?');
  const result = buildRestaurantOpsResponse({
    question: 'Какие заказы сейчас ждут принятия на кухне?',
    lang: 'ru',
    ops,
    intents,
  });

  assert.ok(result.uiBlocks.some(b => b.kind === 'alert' && b.id === 'blk-ops-alert'));
  assert.ok(result.uiBlocks.some(b => b.kind === 'kpis' && b.id === 'blk-ops-orders-kpis'));
  assert.ok(result.uiBlocks.some(b => b.kind === 'chart' && b.id === 'blk-ops-orders-chart'));
  assert.ok(result.uiBlocks.some(b => b.kind === 'table' && b.id === 'blk-ops-pending-table'));
  assert.ok(
    result.suggestedActions.some(a => a.type === 'navigate_route' && a.route === '/orders'),
  );
  assert.ok(result.answer.ru.includes('Osh & Olov'));
  assert.ok(result.answer.uz.includes('Osh & Olov'));
  assert.ok(result.answer.en.includes('Osh & Olov'));
});

test('buildRestaurantOpsResponse builds payment confirmation queue, couriers SLA, and menu import blocks', () => {
  const ops = createSampleOpsSnapshot();

  // Payments
  const payRes = buildRestaurantOpsResponse({
    question: 'Проверь очередь подтверждения оплат',
    lang: 'ru',
    ops,
    intents: detectRestaurantOpsIntents('Проверь очередь подтверждения оплат'),
  });
  assert.ok(payRes.uiBlocks.some(b => b.id === 'blk-ops-payments-kpis'));
  assert.ok(payRes.uiBlocks.some(b => b.id === 'blk-ops-payments-table'));
  assert.ok(payRes.suggestedActions.some(a => a.type === 'navigate_route' && a.route === '/payments'));

  // Couriers & Delivery SLA
  const courRes = buildRestaurantOpsResponse({
    question: 'Check courier load and delivery SLA',
    lang: 'en',
    ops,
    intents: detectRestaurantOpsIntents('Check courier load and delivery SLA'),
  });
  assert.ok(courRes.uiBlocks.some(b => b.id === 'blk-ops-couriers-kpis'));
  assert.ok(courRes.uiBlocks.some(b => b.id === 'blk-ops-couriers-table'));
  assert.ok(courRes.suggestedActions.some(a => a.type === 'navigate_route' && a.route === '/couriers'));
  assert.ok(courRes.suggestedActions.some(a => a.type === 'navigate_route' && a.route === '/delivery'));
  assert.ok(courRes.answer.en.includes('34 min'));

  // Menu & Excel import
  const menuRes = buildRestaurantOpsResponse({
    question: 'Какие блюда в стоп-листе и как прошёл импорт Excel меню?',
    lang: 'ru',
    ops,
    intents: detectRestaurantOpsIntents('Какие блюда в стоп-листе и как прошёл импорт Excel меню?'),
  });
  assert.ok(menuRes.uiBlocks.some(b => b.id === 'blk-ops-menu-kpis'));
  assert.ok(menuRes.uiBlocks.some(b => b.id === 'blk-ops-menu-chart'));
  assert.ok(menuRes.uiBlocks.some(b => b.id === 'blk-ops-menu-table'));
  assert.ok(menuRes.suggestedActions.some(a => a.type === 'navigate_route' && a.route === '/menu'));
  assert.ok(menuRes.answer.ru.includes('menu_november.xlsx'));
});

test('buildRestaurantOpsResponse emits autoAction navigate_route on explicit navigation command', () => {
  const ops = createSampleOpsSnapshot();
  const intents = detectRestaurantOpsIntents('Открой раздел публикаций');
  const res = buildRestaurantOpsResponse({
    question: 'Открой раздел публикаций',
    lang: 'ru',
    ops,
    intents,
  });

  assert.ok(res.autoActions.some(a => a.type === 'navigate_route' && a.route === '/posts'));
  assert.ok(res.uiBlocks.some(b => b.id === 'blk-ops-stats-kpis'));
  assert.ok(res.answer.ru.includes('10'));
});

test('buildRestaurantOpsResponse omits alert when there are no operational bottlenecks', () => {
  const calmOps = createSampleOpsSnapshot({
    orders: {
      total: 10,
      today: 2,
      activeCount: 0,
      byStatus: {
        PENDING_ACCEPTANCE: 0,
        ACCEPTED: 0,
        PREPARING: 0,
        DELIVERING: 0,
        DELIVERED: 10,
        CANCELLED: 0,
      },
      pendingAcceptance: [],
      todayRevenue: 150_000,
      totalRevenue: 950_000,
      avgCheck: 95_000,
      deliveredCount: 10,
      cancelledCount: 0,
      cancelRatePct: 0,
    },
    payments: {
      awaitingConfirmationCount: 0,
      awaitingConfirmationAmount: 0,
      awaitingPaymentCount: 0,
      paidCount: 10,
      paidAmount: 950_000,
      cashPaidAmount: 450_000,
      cardPaidAmount: 500_000,
      rejectedCount: 0,
      confirmationQueue: [],
    },
    couriersAndDelivery: {
      totalAffiliated: 2,
      activeCouriers: 2,
      availableCouriers: 2,
      busyCouriers: 0,
      offlineCouriers: 0,
      totalActiveLoad: 0,
      couriers: [],
      deliveriesTotal: 10,
      deliveriesInProgress: 0,
      deliveriesSearching: 0,
      deliveriesDelivered: 10,
      deliveriesFailedOrCancelled: 0,
      ownCourierCount: 10,
      onDemandCourierCount: 0,
      avgDeliveryMinutes: 25,
      slaOnTimePct: 100,
      deliveryRewardTotal: 100_000,
    },
  });

  const res = buildRestaurantOpsResponse({
    question: 'Как дела сегодня?',
    lang: 'ru',
    ops: calmOps,
    intents: detectRestaurantOpsIntents('Как дела сегодня?'),
  });

  assert.equal(
    res.uiBlocks.some(b => b.kind === 'alert'),
    false,
  );
  assert.ok(res.uiBlocks.some(b => b.id === 'blk-ops-overview-kpis'));
  assert.ok(res.suggestedActions.some(a => a.type === 'navigate_route' && a.route === '/dashboard'));
});

test('geo-map and audit prompts do not auto-navigate off /ai-chat or falsely match card payments', () => {
  const geoPrompt = 'Покажи интерактивную карту 12 районов Ташкента, тепловую карту и зоны роста';
  const geoIntents = detectRestaurantOpsIntents(geoPrompt);
  assert.equal(geoIntents.explicitNavigation, false);
  assert.equal(geoIntents.requestedRoute, null);
  assert.equal(geoIntents.isPayments, false);

  const auditPrompt = 'Покажи ошибки учёта, дубликаты накладных и потенциал экономии';
  const auditIntents = detectRestaurantOpsIntents(auditPrompt);
  assert.equal(auditIntents.explicitNavigation, false);
  assert.equal(auditIntents.requestedRoute, null);

  const financeAutoActions: AgentClientAction[] = [
    { type: 'navigate', tab: 'map', label: 'Open map' },
    { type: 'highlight_widget', widgetId: 'widget-budgets-list', tab: 'budgets', label: 'Highlight budgets' },
    { type: 'set_filters', districtId: 'chilonzor', label: 'Filter: chilonzor' },
    { type: 'create_dashboard', title: 'AI Dashboard', blocks: [], label: 'Create Dashboard' },
  ];
  const financeSuggestedActions: AgentClientAction[] = [
    { type: 'navigate', tab: 'map', label: 'Открыть интерактивную карту' },
    { type: 'navigate', tab: 'branches', label: 'Открыть вкладку «Филиалы»' },
    {
      type: 'fix_finding',
      findingId: 'f-1',
      code: 'DUPLICATE_INVOICE',
      duplicateExpenseId: 'exp-2',
      label: 'Удалить дубликат',
    },
    {
      type: 'apply_branch_budgets',
      month: '2026-11',
      allocations: [{ restaurantId: 'rest-osh', category: 'INGREDIENTS', limit: 10_000_000 }],
      label: 'Применить AI-бюджеты',
    },
  ];
  const opsAutoActions: AgentClientAction[] = [];
  const opsSuggestedActions: AgentClientAction[] = [
    { type: 'navigate_route', route: '/delivery', label: 'Открыть доставку' },
  ];

  const filtered = filterFinanceActionsForRestaurant({
    financeAutoActions,
    financeSuggestedActions,
    opsAutoActions,
    opsSuggestedActions,
  });

  // Business tab navigate & highlight_widget must be stripped from autoActions
  assert.equal(filtered.autoActions.some(a => a.type === 'navigate'), false);
  assert.equal(filtered.autoActions.some(a => a.type === 'highlight_widget'), false);
  // Dashboard & filter actions remain intact
  assert.ok(filtered.autoActions.some(a => a.type === 'create_dashboard'));
  assert.ok(filtered.autoActions.some(a => a.type === 'set_filters'));

  // Business tab navigate stripped from suggestedActions; Point 24/26 & restaurant navigate_route preserved
  assert.equal(filtered.suggestedActions.some(a => a.type === 'navigate'), false);
  assert.ok(filtered.suggestedActions.some(a => a.type === 'fix_finding'));
  assert.ok(filtered.suggestedActions.some(a => a.type === 'apply_branch_budgets'));
  assert.ok(filtered.suggestedActions.some(a => a.type === 'navigate_route' && a.route === '/delivery'));

  // Explicit restaurant navigation in opsAutoActions is still preserved
  const withExplicitNav = filterFinanceActionsForRestaurant({
    financeAutoActions: [{ type: 'navigate', tab: 'sales', label: 'Open sales' }],
    financeSuggestedActions: [],
    opsAutoActions: [{ type: 'navigate_route', route: '/orders', label: 'Открыть заказы' }],
    opsSuggestedActions: [],
  });
  assert.equal(withExplicitNav.autoActions.length, 1);
  assert.equal(withExplicitNav.autoActions[0]?.type, 'navigate_route');
});
