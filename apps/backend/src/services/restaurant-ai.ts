import {
  type AgentChatMessage,
  type AgentChatResponse,
  type AgentClientAction,
  type AgentScreenContext,
  type AgentToolTrace,
  type AgentUiBlock,
  type CourierAffiliationStatus,
  type CourierAvailability,
  type Language,
  type McpToolDescriptor,
  type OrderStatus,
  type PaymentMethod,
  type TashkentDistrictId,
} from '@uzbite/shared';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { resolveDateRange } from './business-analytics.js';
import { callCoarenaChat, extractJsonFromText, type CoarenaMessage } from './coarena.js';
import {
  MCP_TOOLS,
  collectNumericValues,
  detectQuestionIntents,
  executeMcpTool,
  extractNumbersFromText,
  runFinanceAgentChat,
  verifyLlmNumbersAgainstGroundTruth,
} from './finance-agent.js';

export const DEFAULT_RESTAURANT_AI_MODEL = 'gemini-3-8-flash';

export const RESTAURANT_APP_ROUTES = [
  '/dashboard',
  '/orders',
  '/menu',
  '/categories',
  '/posts',
  '/couriers',
  '/delivery',
  '/payments',
  '/statistics',
  '/profile',
  '/settings',
  '/notifications',
  '/onboarding',
  '/ai-chat',
] as const;

export type RestaurantAppRoute = (typeof RESTAURANT_APP_ROUTES)[number];

export const RESTAURANT_ROUTE_LABELS: Record<RestaurantAppRoute, Record<Language, string>> = {
  '/dashboard': { ru: 'Открыть дашборд', uz: 'Dashboardni ochish', en: 'Open Dashboard' },
  '/orders': { ru: 'Открыть заказы', uz: 'Buyurtmalarni ochish', en: 'Open Orders' },
  '/menu': { ru: 'Открыть меню и блюда', uz: 'Menyu va taomlarni ochish', en: 'Open Menu & Dishes' },
  '/categories': { ru: 'Открыть категории', uz: 'Kategoriyalarni ochish', en: 'Open Categories' },
  '/posts': { ru: 'Открыть публикации', uz: 'Postlarni ochish', en: 'Open Posts' },
  '/couriers': { ru: 'Открыть курьеров', uz: 'Kuryerlarni ochish', en: 'Open Couriers' },
  '/delivery': { ru: 'Открыть доставку', uz: 'Yetkazishni ochish', en: 'Open Delivery' },
  '/payments': { ru: 'Открыть оплаты', uz: "To'lovlarni ochish", en: 'Open Payments' },
  '/statistics': { ru: 'Открыть статистику', uz: 'Statistikani ochish', en: 'Open Statistics' },
  '/profile': { ru: 'Открыть профиль ресторана', uz: 'Restoran profilini ochish', en: 'Open Profile' },
  '/settings': { ru: 'Открыть настройки', uz: 'Sozlamalarni ochish', en: 'Open Settings' },
  '/notifications': { ru: 'Открыть уведомления', uz: 'Bildirishnomalarni ochish', en: 'Open Notifications' },
  '/onboarding': { ru: 'Открыть онбординг', uz: 'Onbordingni ochish', en: 'Open Onboarding' },
  '/ai-chat': { ru: 'Открыть AI-ассистента', uz: 'AI-yordamchini ochish', en: 'Open AI Chat' },
};

export const RESTAURANT_OPS_TOOLS: McpToolDescriptor[] = [
  {
    name: 'get_restaurant_live_ops',
    description:
      'Get live restaurant operations: orders by status, pending acceptance queue, payment confirmation queue, courier load & delivery SLA, top/low-margin dishes, categories, posts, and Excel/CSV import stats.',
    category: 'restaurant_ops',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Optional YYYY-MM-DD start date' },
        to: { type: 'string', description: 'Optional YYYY-MM-DD end date' },
      },
    },
  },
  {
    name: 'get_pending_orders_and_payments',
    description:
      'Inspect orders awaiting kitchen acceptance (PENDING_ACCEPTANCE) and card/cash payments awaiting confirmation (AWAITING_CONFIRMATION).',
    category: 'restaurant_ops',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_courier_and_delivery_sla',
    description:
      'Inspect affiliated courier availability, active load, own vs on-demand deliveries, deliveries currently searching for a courier, and average delivery SLA.',
    category: 'restaurant_ops',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
  },
  {
    name: 'get_menu_and_import_health',
    description:
      'Analyze top-selling dishes, low-margin dishes, unavailable stop-list dishes, category revenue breakdown, and recent Excel/CSV menu import results.',
    category: 'restaurant_ops',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
  },
  {
    name: 'navigate_restaurant_app',
    description:
      'Navigate the UzBite Restaurant desktop app to a route (/dashboard, /orders, /menu, /categories, /posts, /couriers, /delivery, /payments, /statistics, /profile, /settings, /notifications, /onboarding, /ai-chat).',
    category: 'restaurant_ops',
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          enum: [...RESTAURANT_APP_ROUTES],
        },
        label: { type: 'string' },
      },
      required: ['route'],
    },
  },
];

export const ALL_RESTAURANT_AI_TOOLS: McpToolDescriptor[] = [
  ...MCP_TOOLS,
  ...RESTAURANT_OPS_TOOLS,
];

export interface PendingOrderItem {
  id: string;
  recipientName: string;
  total: number;
  itemsCount: number;
  createdAt: string;
  minutesWaiting: number;
}

export interface PaymentConfirmationQueueItem {
  orderId: string;
  paymentId: string;
  method: PaymentMethod;
  amount: number;
  recipientName: string;
  hasReceipt: boolean;
  createdAt: string;
}

export interface CourierLoadItem {
  id: string;
  name: string;
  phone: string | null;
  status: CourierAffiliationStatus;
  availability: CourierAvailability;
  activeLoad: number;
}

export interface DishOpsMetric {
  dishId: string;
  name: string;
  categoryName: string;
  price: number;
  costPrice: number;
  marginPct: number;
  quantitySold: number;
  revenue: number;
  isAvailable: boolean;
}

export interface CategoryOpsMetric {
  id: string;
  name: string;
  dishCount: number;
  quantitySold: number;
  revenue: number;
}

export interface MenuImportJobSummary {
  id: string;
  fileName: string;
  fileFormat: string;
  status: string;
  totalRows: number;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: string;
}

export interface RestaurantLiveOpsSnapshot {
  period: { from: string; to: string };
  restaurant: {
    id: string;
    name: string;
    isOpen: boolean;
    acceptingOrders: boolean;
    preparationMinutes: number;
    deliveryFee: number;
    minOrder: number;
    acceptCash: boolean;
    acceptCard: boolean;
    rating: number | null;
    reviewCount: number;
    followerCount: number;
  };
  orders: {
    total: number;
    today: number;
    activeCount: number;
    byStatus: Record<OrderStatus, number>;
    pendingAcceptance: PendingOrderItem[];
    todayRevenue: number;
    totalRevenue: number;
    avgCheck: number;
    deliveredCount: number;
    cancelledCount: number;
    cancelRatePct: number;
  };
  payments: {
    awaitingConfirmationCount: number;
    awaitingConfirmationAmount: number;
    awaitingPaymentCount: number;
    paidCount: number;
    paidAmount: number;
    cashPaidAmount: number;
    cardPaidAmount: number;
    rejectedCount: number;
    confirmationQueue: PaymentConfirmationQueueItem[];
  };
  couriersAndDelivery: {
    totalAffiliated: number;
    activeCouriers: number;
    availableCouriers: number;
    busyCouriers: number;
    offlineCouriers: number;
    totalActiveLoad: number;
    couriers: CourierLoadItem[];
    deliveriesTotal: number;
    deliveriesInProgress: number;
    deliveriesSearching: number;
    deliveriesDelivered: number;
    deliveriesFailedOrCancelled: number;
    ownCourierCount: number;
    onDemandCourierCount: number;
    avgDeliveryMinutes: number | null;
    slaOnTimePct: number | null;
    deliveryRewardTotal: number;
  };
  menu: {
    totalDishes: number;
    availableDishes: number;
    unavailableDishes: Array<{ id: string; name: string; categoryName: string; price: number }>;
    archivedDishes: number;
    categoriesCount: number;
    categories: CategoryOpsMetric[];
    topDishes: DishOpsMetric[];
    lowMarginDishes: DishOpsMetric[];
  };
  postsAndEngagement: {
    totalPosts: number;
    publishedPosts: number;
    draftPosts: number;
    totalLikes: number;
    totalComments: number;
    unreadNotifications: number;
  };
  imports: {
    totalImportJobs: number;
    totalExportJobs: number;
    lastImport: MenuImportJobSummary | null;
  };
}

export interface RestaurantOpsIntents {
  isOrders: boolean;
  isPayments: boolean;
  isCouriers: boolean;
  isDelivery: boolean;
  isMenu: boolean;
  isCategories: boolean;
  isPosts: boolean;
  isStatistics: boolean;
  isProfile: boolean;
  isSettings: boolean;
  isNotifications: boolean;
  isOnboarding: boolean;
  isAnyOpsIntent: boolean;
  explicitNavigation: boolean;
  requestedRoute: RestaurantAppRoute | null;
}

function fmtUzs(v: number): string {
  return `${Math.round(v).toLocaleString('ru-RU')} UZS`;
}

function statusLabel(status: OrderStatus, lang: Language): string {
  const map: Record<OrderStatus, Record<Language, string>> = {
    PENDING_ACCEPTANCE: { ru: 'Ожидают принятия', uz: 'Qabul kutilmoqda', en: 'Pending Acceptance' },
    ACCEPTED: { ru: 'Приняты', uz: 'Qabul qilingan', en: 'Accepted' },
    PREPARING: { ru: 'Готовятся', uz: 'Tayyorlanmoqda', en: 'Preparing' },
    DELIVERING: { ru: 'В доставке', uz: 'Yetkazilmoqda', en: 'Delivering' },
    DELIVERED: { ru: 'Доставлены', uz: 'Yetkazilgan', en: 'Delivered' },
    CANCELLED: { ru: 'Отменены', uz: 'Bekor qilingan', en: 'Cancelled' },
  };
  return map[status][lang];
}

export function detectRestaurantOpsIntents(question: string): RestaurantOpsIntents {
  const lower = question.toLowerCase();

  const isOrders =
    /(заказ|кухн|приняти|очеред|готовк|отмен|активн[а-яё]*\s+заказ|buyurtma|oshxona|qabul|tayyorlan|order|kitchen|pending|queue)/i.test(
      lower,
    );
  const isPayments =
    /(оплат|платеж|платёж|чек|перевод|подтвержд|наличн|банковск[а-яё]*\s+карт|оплат[а-яё]*\s+карт|перевод[а-яё]*\s+на\s+карт|по\s+карт[еы]|на\s+карт[уе]|картой|to['’`]?lov|chek|karta|naqd|tasdiq|payment|receipt|confirm\s+pay)/i.test(
      lower,
    );
  const isCouriers =
    /(курьер|доставщик|загрузк[аи]\s+курьер|свободн[а-яё]*\s+курьер|kuryer|courier|driver|fleet)/i.test(
      lower,
    );
  const isDelivery =
    /(доставк|\bsla\b|опоздан|поиск\s+курьер|on[- ]?demand|вызов\s+курьер|yetkazish|yetkazib|delivery|dispatch)/i.test(
      lower,
    );
  const isCategories = /(категори|раздел[а-яё]*\s+меню|kategoriya|bo['’`]?lim|categor)/i.test(lower);
  const isMenu =
    isCategories ||
    /(меню|блюд|стоп[- ]?лист|недоступн|позиц|импорт|excel|csv|марж[аи]\s+блюд|себестоимост|menyu|taom|mavjud\s+emas|import|menu|dish|unavailable|stop[- ]?list)/i.test(
      lower,
    );
  const isPosts =
    /(пост|публикац|видео|рилс|лент|лайк|комментар|post|video|reels|publication|engagement)/i.test(lower);
  const isStatistics =
    /(статистик|отч[её]т|рейтинг|отзыв|подписчик|statistika|reyting|sharh|obunachi|statistics|rating|review|follower)/i.test(
      lower,
    );
  const isProfile = /(профил|логотип|обложк|адрес\s+ресторан|описание\s+ресторан|profil|profile)/i.test(lower);
  const isSettings =
    /(настройк|график\s+работ|часы\s+работ|режим\s+работ|реквизит|sozlama|ish\s+vaqt|settings|business\s+hours)/i.test(
      lower,
    );
  const isNotifications =
    /(уведомлен|оповещен|непрочитан|bildirishnoma|notification|unread)/i.test(lower);
  const isOnboarding = /(онбординг|настройк[аи]\s+запуск|onbording|onboarding|setup\s+wizard)/i.test(lower);

  const explicitNavigation =
    /(открой|перейд|переключ|покажи\s+раздел|покажи\s+страниц|зайди\s+в|och(?:ib)?|o['’`]?t(?:ish|ing)?|sahifasiga|bo['’`]?limini\s+och|open|go\s+to|navigate|switch\s+to)/i.test(
      lower,
    );

  let requestedRoute: RestaurantAppRoute | null = null;
  if (explicitNavigation) {
    if (/(онбординг|onbording|onboarding)/i.test(lower)) requestedRoute = '/onboarding';
    else if (/(уведомлен|bildirishnoma|notification)/i.test(lower)) requestedRoute = '/notifications';
    else if (/(настройк|часы\s+работ|sozlama|settings)/i.test(lower)) requestedRoute = '/settings';
    else if (/(профил|profil|profile)/i.test(lower)) requestedRoute = '/profile';
    else if (/(категори|kategoriya|categor)/i.test(lower)) requestedRoute = '/categories';
    else if (/(меню|блюд|импорт|menyu|taom|menu|dish)/i.test(lower)) requestedRoute = '/menu';
    else if (/(пост|публикац|видео|post|video)/i.test(lower)) requestedRoute = '/posts';
    else if (/(курьер|kuryer|courier)/i.test(lower)) requestedRoute = '/couriers';
    else if (/(доставк|yetkazish|delivery)/i.test(lower)) requestedRoute = '/delivery';
    else if (/(оплат|платеж|чек|to['’`]?lov|payment)/i.test(lower)) requestedRoute = '/payments';
    else if (/(статистик|отч[её]т|statistika|statistics)/i.test(lower)) requestedRoute = '/statistics';
    else if (/(заказ|кухн|buyurtma|order)/i.test(lower)) requestedRoute = '/orders';
    else if (/(чат|ассистент|ai[- ]?chat|yordamchi)/i.test(lower)) requestedRoute = '/ai-chat';
    else if (/(дашборд|главн|обзор|dashboard|asosiy)/i.test(lower)) requestedRoute = '/dashboard';
  }

  const isAnyOpsIntent =
    isOrders ||
    isPayments ||
    isCouriers ||
    isDelivery ||
    isMenu ||
    isPosts ||
    isStatistics ||
    isProfile ||
    isSettings ||
    isNotifications ||
    isOnboarding;

  return {
    isOrders,
    isPayments,
    isCouriers,
    isDelivery,
    isMenu,
    isCategories,
    isPosts,
    isStatistics,
    isProfile,
    isSettings,
    isNotifications,
    isOnboarding,
    isAnyOpsIntent,
    explicitNavigation,
    requestedRoute,
  };
}

export async function getRestaurantLiveOpsSnapshot(
  restaurantId: string,
  opts?: { from?: string; to?: string; userId?: string },
): Promise<RestaurantLiveOpsSnapshot> {
  const now = new Date();
  const { from, to } = resolveDateRange(opts?.from, opts?.to, now);
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [
    restaurant,
    orders,
    affiliations,
    deliveries,
    dishes,
    categories,
    posts,
    importJobs,
    exportJobsCount,
    reviews,
    followerCount,
    unreadNotifications,
  ] = await Promise.all([
    db.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        isOpen: true,
        acceptingOrders: true,
        preparationMinutes: true,
        deliveryFee: true,
        minOrder: true,
        acceptCash: true,
        acceptCard: true,
      },
    }),
    db.order.findMany({
      where: {
        restaurantId,
        OR: [
          { createdAt: { gte: from, lte: to } },
          { status: { in: ['PENDING_ACCEPTANCE', 'ACCEPTED', 'PREPARING', 'DELIVERING'] } },
          { payment: { status: 'AWAITING_CONFIRMATION' } },
        ],
      },
      include: {
        items: { select: { dishId: true, dishName: true, unitPrice: true, quantity: true } },
        payment: {
          select: {
            id: true,
            method: true,
            status: true,
            receiptId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.restaurantCourierAffiliation.findMany({
      where: { restaurantId },
      include: {
        courier: {
          select: { id: true, name: true, phone: true, courierAvailability: true },
        },
      },
      orderBy: [{ status: 'asc' }, { activeLoad: 'desc' }],
    }),
    db.delivery.findMany({
      where: {
        restaurantId,
        OR: [
          { createdAt: { gte: from, lte: to } },
          { status: { in: ['SEARCHING', 'OFFERED', 'ASSIGNED', 'COURIER_ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY'] } },
        ],
      },
      select: {
        id: true,
        mode: true,
        status: true,
        courierReward: true,
        createdAt: true,
        startedAt: true,
        deliveredAt: true,
      },
    }),
    db.dish.findMany({
      where: { restaurantId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    }),
    db.restaurantCategory.findMany({
      where: { restaurantId },
      include: { _count: { select: { dishes: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    db.post.findMany({
      where: { restaurantId },
      select: {
        id: true,
        status: true,
        _count: { select: { likes: true, comments: true } },
      },
    }),
    db.importJob.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        fileName: true,
        fileFormat: true,
        status: true,
        totalRows: true,
        addedCount: true,
        updatedCount: true,
        skippedCount: true,
        errorCount: true,
        createdAt: true,
      },
    }),
    db.exportJob.count({ where: { restaurantId } }),
    db.review.findMany({
      where: { restaurantId },
      select: { rating: true },
    }),
    db.follow.count({ where: { restaurantId } }),
    opts?.userId
      ? db.notification.count({ where: { userId: opts.userId, readAt: null } })
      : Promise.resolve(0),
  ]);

  const byStatus: Record<OrderStatus, number> = {
    PENDING_ACCEPTANCE: 0,
    ACCEPTED: 0,
    PREPARING: 0,
    DELIVERING: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };

  let todayCount = 0;
  let todayRevenue = 0;
  let totalRevenue = 0;
  let nonCancelledOrders = 0;
  const pendingAcceptance: PendingOrderItem[] = [];

  let awaitingConfirmationCount = 0;
  let awaitingConfirmationAmount = 0;
  let awaitingPaymentCount = 0;
  let paidCount = 0;
  let paidAmount = 0;
  let cashPaidAmount = 0;
  let cardPaidAmount = 0;
  let rejectedCount = 0;
  const confirmationQueue: PaymentConfirmationQueueItem[] = [];

  const dishSales = new Map<string, { quantity: number; revenue: number }>();
  const dishMetaMap = new Map(dishes.map(d => [d.id, d]));
  const catSales = new Map<string, { quantity: number; revenue: number }>();

  for (const o of orders) {
    const status = o.status as OrderStatus;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const totalNum = o.total.toNumber();

    if (o.createdAt >= startOfDay) {
      todayCount++;
      if (status !== 'CANCELLED') todayRevenue += totalNum;
    }
    if (status !== 'CANCELLED') {
      totalRevenue += totalNum;
      nonCancelledOrders++;
      for (const item of o.items) {
        const lineRev = item.unitPrice.toNumber() * item.quantity;
        if (item.dishId) {
          const prev = dishSales.get(item.dishId) ?? { quantity: 0, revenue: 0 };
          prev.quantity += item.quantity;
          prev.revenue += lineRev;
          dishSales.set(item.dishId, prev);

          const dm = dishMetaMap.get(item.dishId);
          if (dm) {
            const cPrev = catSales.get(dm.categoryId) ?? { quantity: 0, revenue: 0 };
            cPrev.quantity += item.quantity;
            cPrev.revenue += lineRev;
            catSales.set(dm.categoryId, cPrev);
          }
        }
      }
    }

    if (status === 'PENDING_ACCEPTANCE') {
      pendingAcceptance.push({
        id: o.id,
        recipientName: o.recipientName,
        total: Math.round(totalNum),
        itemsCount: o.items.reduce((s, it) => s + it.quantity, 0),
        createdAt: o.createdAt.toISOString(),
        minutesWaiting: Math.max(0, Math.round((now.getTime() - o.createdAt.getTime()) / 60_000)),
      });
    }

    if (o.payment) {
      if (o.payment.status === 'AWAITING_CONFIRMATION') {
        awaitingConfirmationCount++;
        awaitingConfirmationAmount += totalNum;
        confirmationQueue.push({
          orderId: o.id,
          paymentId: o.payment.id,
          method: o.payment.method as PaymentMethod,
          amount: Math.round(totalNum),
          recipientName: o.recipientName,
          hasReceipt: Boolean(o.payment.receiptId),
          createdAt: o.payment.createdAt.toISOString(),
        });
      } else if (o.payment.status === 'AWAITING_PAYMENT') {
        awaitingPaymentCount++;
      } else if (o.payment.status === 'PAID') {
        paidCount++;
        paidAmount += totalNum;
        if (o.payment.method === 'CASH') cashPaidAmount += totalNum;
        else cardPaidAmount += totalNum;
      } else if (o.payment.status === 'REJECTED') {
        rejectedCount++;
      }
    }
  }

  const activeCount =
    byStatus.PENDING_ACCEPTANCE + byStatus.ACCEPTED + byStatus.PREPARING + byStatus.DELIVERING;
  const cancelRatePct =
    orders.length > 0 ? Number(((byStatus.CANCELLED / orders.length) * 100).toFixed(1)) : 0;

  // Couriers & Delivery SLA
  const activeAffiliations = affiliations.filter(a => a.status === 'ACTIVE');
  const courierItems: CourierLoadItem[] = affiliations.map(a => ({
    id: a.courier.id,
    name: a.courier.name,
    phone: a.courier.phone,
    status: a.status as CourierAffiliationStatus,
    availability: (a.courier.courierAvailability ?? a.availability) as CourierAvailability,
    activeLoad: a.activeLoad,
  }));

  let availableCouriers = 0;
  let busyCouriers = 0;
  let offlineCouriers = 0;
  let totalActiveLoad = 0;
  for (const c of courierItems) {
    if (c.status !== 'ACTIVE') continue;
    totalActiveLoad += c.activeLoad;
    if (c.availability === 'AVAILABLE') availableCouriers++;
    else if (c.availability === 'BUSY') busyCouriers++;
    else offlineCouriers++;
  }

  let deliveriesInProgress = 0;
  let deliveriesSearching = 0;
  let deliveriesDelivered = 0;
  let deliveriesFailedOrCancelled = 0;
  let ownCourierCount = 0;
  let onDemandCourierCount = 0;
  let deliveryRewardTotal = 0;
  const deliveryDurationsMin: number[] = [];

  for (const d of deliveries) {
    if (d.mode === 'OWN_COURIER') ownCourierCount++;
    else onDemandCourierCount++;

    if (d.status === 'SEARCHING' || d.status === 'OFFERED') {
      deliveriesSearching++;
      deliveriesInProgress++;
    } else if (['ASSIGNED', 'COURIER_ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY'].includes(d.status)) {
      deliveriesInProgress++;
    } else if (d.status === 'DELIVERED') {
      deliveriesDelivered++;
      if (d.deliveredAt) {
        const startTs = d.startedAt ?? d.createdAt;
        const mins = Math.max(1, (d.deliveredAt.getTime() - startTs.getTime()) / 60_000);
        if (mins <= 240) deliveryDurationsMin.push(mins);
      }
    } else if (d.status === 'FAILED' || d.status === 'CANCELLED') {
      deliveriesFailedOrCancelled++;
    }

    if (d.status !== 'CANCELLED' && d.status !== 'FAILED') {
      deliveryRewardTotal += d.courierReward.toNumber();
    }
  }

  const avgDeliveryMinutes =
    deliveryDurationsMin.length > 0
      ? Math.round(deliveryDurationsMin.reduce((s, m) => s + m, 0) / deliveryDurationsMin.length)
      : null;
  const slaOnTimePct =
    deliveryDurationsMin.length > 0
      ? Number(
          (
            (deliveryDurationsMin.filter(m => m <= 45).length / deliveryDurationsMin.length) *
            100
          ).toFixed(1),
        )
      : null;

  // Menu & Dishes
  const activeDishes = dishes.filter(d => !d.isArchived);
  const unavailableDishes = activeDishes
    .filter(d => !d.isAvailable)
    .map(d => ({
      id: d.id,
      name: d.name,
      categoryName: d.category.name,
      price: Math.round(d.price.toNumber()),
    }));

  const dishMetrics: DishOpsMetric[] = activeDishes.map(d => {
    const price = d.price.toNumber();
    const costPrice = d.costPrice.toNumber();
    const marginPct = price > 0 ? Number((((price - costPrice) / price) * 100).toFixed(1)) : 0;
    const sales = dishSales.get(d.id) ?? { quantity: 0, revenue: 0 };
    return {
      dishId: d.id,
      name: d.name,
      categoryName: d.category.name,
      price: Math.round(price),
      costPrice: Math.round(costPrice),
      marginPct,
      quantitySold: sales.quantity,
      revenue: Math.round(sales.revenue),
      isAvailable: d.isAvailable,
    };
  });

  const topDishes = [...dishMetrics]
    .sort((a, b) => b.revenue - a.revenue || b.quantitySold - a.quantitySold)
    .slice(0, 8);

  const lowMarginDishes = [...dishMetrics]
    .filter(d => d.costPrice > 0 && d.marginPct < 45)
    .sort((a, b) => a.marginPct - b.marginPct)
    .slice(0, 6);

  const categoryMetrics: CategoryOpsMetric[] = categories
    .map(c => {
      const s = catSales.get(c.id) ?? { quantity: 0, revenue: 0 };
      return {
        id: c.id,
        name: c.name,
        dishCount: c._count.dishes,
        quantitySold: s.quantity,
        revenue: Math.round(s.revenue),
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.dishCount - a.dishCount);

  // Posts & Engagement
  const publishedPosts = posts.filter(p => p.status === 'PUBLISHED').length;
  const draftPosts = posts.filter(p => p.status === 'DRAFT').length;
  const totalLikes = posts.reduce((s, p) => s + p._count.likes, 0);
  const totalComments = posts.reduce((s, p) => s + p._count.comments, 0);

  const averageRating =
    reviews.length > 0
      ? Number((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1))
      : null;

  const lastImportRow = importJobs[0] ?? null;

  return {
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      isOpen: restaurant.isOpen,
      acceptingOrders: restaurant.acceptingOrders,
      preparationMinutes: restaurant.preparationMinutes,
      deliveryFee: Math.round(restaurant.deliveryFee.toNumber()),
      minOrder: Math.round(restaurant.minOrder.toNumber()),
      acceptCash: restaurant.acceptCash,
      acceptCard: restaurant.acceptCard,
      rating: averageRating,
      reviewCount: reviews.length,
      followerCount,
    },
    orders: {
      total: orders.length,
      today: todayCount,
      activeCount,
      byStatus,
      pendingAcceptance: pendingAcceptance.slice(0, 10),
      todayRevenue: Math.round(todayRevenue),
      totalRevenue: Math.round(totalRevenue),
      avgCheck: nonCancelledOrders > 0 ? Math.round(totalRevenue / nonCancelledOrders) : 0,
      deliveredCount: byStatus.DELIVERED,
      cancelledCount: byStatus.CANCELLED,
      cancelRatePct,
    },
    payments: {
      awaitingConfirmationCount,
      awaitingConfirmationAmount: Math.round(awaitingConfirmationAmount),
      awaitingPaymentCount,
      paidCount,
      paidAmount: Math.round(paidAmount),
      cashPaidAmount: Math.round(cashPaidAmount),
      cardPaidAmount: Math.round(cardPaidAmount),
      rejectedCount,
      confirmationQueue: confirmationQueue.slice(0, 10),
    },
    couriersAndDelivery: {
      totalAffiliated: affiliations.length,
      activeCouriers: activeAffiliations.length,
      availableCouriers,
      busyCouriers,
      offlineCouriers,
      totalActiveLoad,
      couriers: courierItems.slice(0, 12),
      deliveriesTotal: deliveries.length,
      deliveriesInProgress,
      deliveriesSearching,
      deliveriesDelivered,
      deliveriesFailedOrCancelled,
      ownCourierCount,
      onDemandCourierCount,
      avgDeliveryMinutes,
      slaOnTimePct,
      deliveryRewardTotal: Math.round(deliveryRewardTotal),
    },
    menu: {
      totalDishes: activeDishes.length,
      availableDishes: activeDishes.length - unavailableDishes.length,
      unavailableDishes: unavailableDishes.slice(0, 10),
      archivedDishes: dishes.length - activeDishes.length,
      categoriesCount: categories.length,
      categories: categoryMetrics.slice(0, 10),
      topDishes,
      lowMarginDishes,
    },
    postsAndEngagement: {
      totalPosts: posts.length,
      publishedPosts,
      draftPosts,
      totalLikes,
      totalComments,
      unreadNotifications,
    },
    imports: {
      totalImportJobs: importJobs.length,
      totalExportJobs: exportJobsCount,
      lastImport: lastImportRow
        ? {
            id: lastImportRow.id,
            fileName: lastImportRow.fileName,
            fileFormat: lastImportRow.fileFormat,
            status: lastImportRow.status,
            totalRows: lastImportRow.totalRows,
            addedCount: lastImportRow.addedCount,
            updatedCount: lastImportRow.updatedCount,
            skippedCount: lastImportRow.skippedCount,
            errorCount: lastImportRow.errorCount,
            createdAt: lastImportRow.createdAt.toISOString(),
          }
        : null,
    },
  };
}

function makeNavigateRouteAction(route: RestaurantAppRoute, lang: Language): AgentClientAction {
  return {
    type: 'navigate_route',
    route,
    label: RESTAURANT_ROUTE_LABELS[route][lang],
  };
}

export function buildRestaurantOpsResponse(params: {
  question: string;
  lang: Language;
  ops: RestaurantLiveOpsSnapshot;
  intents: RestaurantOpsIntents;
}): {
  answer: Record<Language, string>;
  uiBlocks: AgentUiBlock[];
  autoActions: AgentClientAction[];
  suggestedActions: AgentClientAction[];
  summaryText: string;
} {
  const { lang, ops, intents } = params;
  const uiBlocks: AgentUiBlock[] = [];
  const autoActions: AgentClientAction[] = [];
  const suggestedActions: AgentClientAction[] = [];

  const pushSuggestedRoute = (route: RestaurantAppRoute) => {
    if (!suggestedActions.some(a => a.type === 'navigate_route' && a.route === route)) {
      suggestedActions.push(makeNavigateRouteAction(route, lang));
    }
  };

  if (intents.requestedRoute) {
    const navAction = makeNavigateRouteAction(intents.requestedRoute, lang);
    autoActions.push(navAction);
    suggestedActions.push(navAction);
  }

  // Operational Alerts
  const alertPartsRu: string[] = [];
  const alertPartsUz: string[] = [];
  const alertPartsEn: string[] = [];

  if (ops.orders.pendingAcceptance.length > 0) {
    const maxWait = Math.max(...ops.orders.pendingAcceptance.map(o => o.minutesWaiting));
    alertPartsRu.push(
      `${ops.orders.pendingAcceptance.length} заказ(ов) ожидают принятия на кухне (макс. ожидание ${maxWait} мин).`,
    );
    alertPartsUz.push(
      `${ops.orders.pendingAcceptance.length} ta buyurtma oshxonada qabul qilinishini kutmoqda (maks. ${maxWait} daq).`,
    );
    alertPartsEn.push(
      `${ops.orders.pendingAcceptance.length} order(s) awaiting kitchen acceptance (max wait ${maxWait} min).`,
    );
  }
  if (ops.payments.awaitingConfirmationCount > 0) {
    alertPartsRu.push(
      `${ops.payments.awaitingConfirmationCount} оплат(а) на ${fmtUzs(ops.payments.awaitingConfirmationAmount)} ждут подтверждения чека.`,
    );
    alertPartsUz.push(
      `${ops.payments.awaitingConfirmationCount} ta to‘lov (${fmtUzs(ops.payments.awaitingConfirmationAmount)}) tasdiqlanishini kutmoqda.`,
    );
    alertPartsEn.push(
      `${ops.payments.awaitingConfirmationCount} payment(s) totaling ${fmtUzs(ops.payments.awaitingConfirmationAmount)} await confirmation.`,
    );
  }
  if (ops.couriersAndDelivery.deliveriesSearching > 0) {
    alertPartsRu.push(
      `${ops.couriersAndDelivery.deliveriesSearching} доставк(а) в поиске курьера.`,
    );
    alertPartsUz.push(
      `${ops.couriersAndDelivery.deliveriesSearching} ta yetkazish kuryer qidirmoqda.`,
    );
    alertPartsEn.push(
      `${ops.couriersAndDelivery.deliveriesSearching} delivery request(s) currently searching for a courier.`,
    );
  }

  const showOrdersBlock = intents.isOrders || (!intents.isAnyOpsIntent && ops.orders.activeCount > 0);
  const showPaymentsBlock = intents.isPayments;
  const showCouriersBlock = intents.isCouriers || intents.isDelivery;
  const showMenuBlock = intents.isMenu;
  const showPostsBlock = intents.isPosts;
  const showStatsBlock = intents.isStatistics;

  // 1. Orders / Kitchen focus
  if (showOrdersBlock) {
    uiBlocks.push({
      id: 'blk-ops-orders-kpis',
      kind: 'kpis',
      title:
        lang === 'uz'
          ? 'Jonli buyurtmalar va oshxona holati'
          : lang === 'ru'
            ? 'Живые заказы и очередь кухни'
            : 'Live Orders & Kitchen Queue',
      items: [
        {
          label: lang === 'uz' ? 'Bugungi buyurtmalar' : lang === 'ru' ? 'Заказы сегодня' : 'Orders Today',
          value: String(ops.orders.today),
          sublabel: fmtUzs(ops.orders.todayRevenue),
          tone: 'neutral',
        },
        {
          label: lang === 'uz' ? 'Qabul kutilmoqda' : lang === 'ru' ? 'Ждут принятия' : 'Pending Acceptance',
          value: String(ops.orders.byStatus.PENDING_ACCEPTANCE),
          tone: ops.orders.byStatus.PENDING_ACCEPTANCE > 0 ? 'warn' : 'good',
        },
        {
          label: lang === 'uz' ? 'Faol buyurtmalar' : lang === 'ru' ? 'Активные заказы' : 'Active Orders',
          value: String(ops.orders.activeCount),
          sublabel: `${ops.orders.byStatus.PREPARING} ${lang === 'uz' ? 'tayyorlanmoqda' : lang === 'ru' ? 'готовятся' : 'preparing'}`,
          tone: 'neutral',
        },
        {
          label: lang === 'uz' ? 'Bekor qilish %' : lang === 'ru' ? 'Отмены' : 'Cancel Rate',
          value: `${ops.orders.cancelRatePct}%`,
          sublabel: `${ops.orders.cancelledCount} / ${ops.orders.total}`,
          tone: ops.orders.cancelRatePct > 10 ? 'bad' : 'good',
        },
      ],
    });

    const statusOrder: OrderStatus[] = [
      'PENDING_ACCEPTANCE',
      'ACCEPTED',
      'PREPARING',
      'DELIVERING',
      'DELIVERED',
      'CANCELLED',
    ];
    uiBlocks.push({
      id: 'blk-ops-orders-chart',
      kind: 'chart',
      chartType: 'bar',
      title:
        lang === 'uz'
          ? "Buyurtmalar holati bo'yicha"
          : lang === 'ru'
            ? 'Заказы по статусам'
            : 'Orders by Status',
      items: statusOrder.map(st => ({
        label: statusLabel(st, lang),
        value: ops.orders.byStatus[st] ?? 0,
      })),
    });

    if (ops.orders.pendingAcceptance.length > 0) {
      uiBlocks.push({
        id: 'blk-ops-pending-table',
        kind: 'table',
        title:
          lang === 'uz'
            ? 'Qabul kutilayotgan buyurtmalar'
            : lang === 'ru'
              ? 'Очередь заказов на принятие'
              : 'Orders Awaiting Acceptance',
        columns:
          lang === 'uz'
            ? ['Buyurtma', 'Mijoz', 'Pozitsiyalar', 'Summa', 'Kutish (daq)']
            : lang === 'ru'
              ? ['Заказ', 'Клиент', 'Позиций', 'Сумма', 'Ожидание (мин)']
              : ['Order', 'Customer', 'Items', 'Total', 'Waiting (min)'],
        rows: ops.orders.pendingAcceptance.slice(0, 6).map(p => [
          p.id.slice(0, 8),
          p.recipientName,
          p.itemsCount,
          fmtUzs(p.total),
          p.minutesWaiting,
        ]),
        highlightRowIndices: ops.orders.pendingAcceptance
          .slice(0, 6)
          .map((p, idx) => (p.minutesWaiting >= 10 ? idx : -1))
          .filter(idx => idx >= 0),
      });
    }
    pushSuggestedRoute('/orders');
  }

  // 2. Payments focus
  if (showPaymentsBlock) {
    uiBlocks.push({
      id: 'blk-ops-payments-kpis',
      kind: 'kpis',
      title:
        lang === 'uz'
          ? "To'lovlar va cheklarni tasdiqlash"
          : lang === 'ru'
            ? 'Оплаты и очередь подтверждения чеков'
            : 'Payments & Receipt Confirmation Queue',
      items: [
        {
          label: lang === 'uz' ? 'Tasdiqlash kutilmoqda' : lang === 'ru' ? 'Ждут подтверждения' : 'Awaiting Confirmation',
          value: String(ops.payments.awaitingConfirmationCount),
          sublabel: fmtUzs(ops.payments.awaitingConfirmationAmount),
          tone: ops.payments.awaitingConfirmationCount > 0 ? 'warn' : 'good',
        },
        {
          label: lang === 'uz' ? "Tasdiqlangan to'lovlar" : lang === 'ru' ? 'Подтверждено' : 'Confirmed Paid',
          value: fmtUzs(ops.payments.paidAmount),
          sublabel: `${ops.payments.paidCount} ${lang === 'uz' ? 'ta' : lang === 'ru' ? 'оплат' : 'paid'}`,
          tone: 'good',
        },
        {
          label: lang === 'uz' ? 'Karta orqali' : lang === 'ru' ? 'Переводы (карта)' : 'Card Transfers',
          value: fmtUzs(ops.payments.cardPaidAmount),
          tone: 'neutral',
        },
        {
          label: lang === 'uz' ? 'Naqd pul' : lang === 'ru' ? 'Наличные' : 'Cash',
          value: fmtUzs(ops.payments.cashPaidAmount),
          tone: 'neutral',
        },
      ],
    });

    if (ops.payments.confirmationQueue.length > 0) {
      uiBlocks.push({
        id: 'blk-ops-payments-table',
        kind: 'table',
        title:
          lang === 'uz'
            ? 'Chek tasdiqlash navbati'
            : lang === 'ru'
              ? 'Очередь подтверждения оплат'
              : 'Payments Awaiting Confirmation',
        columns:
          lang === 'uz'
            ? ['Buyurtma', 'Mijoz', 'Usul', 'Summa', 'Chek']
            : lang === 'ru'
              ? ['Заказ', 'Клиент', 'Метод', 'Сумма', 'Чек']
              : ['Order', 'Customer', 'Method', 'Amount', 'Receipt'],
        rows: ops.payments.confirmationQueue.slice(0, 6).map(p => [
          p.orderId.slice(0, 8),
          p.recipientName,
          p.method,
          fmtUzs(p.amount),
          p.hasReceipt ? 'OK' : '—',
        ]),
        highlightRowIndices: [0],
      });
    }
    pushSuggestedRoute('/payments');
  }

  // 3. Couriers & Delivery SLA focus
  if (showCouriersBlock) {
    const cd = ops.couriersAndDelivery;
    uiBlocks.push({
      id: 'blk-ops-couriers-kpis',
      kind: 'kpis',
      title:
        lang === 'uz'
          ? 'Kuryerlar yuklamasi va yetkazish SLA'
          : lang === 'ru'
            ? 'Курьеры и SLA доставки'
            : 'Couriers & Delivery SLA',
      items: [
        {
          label: lang === 'uz' ? "Bo'sh / Band kuryerlar" : lang === 'ru' ? 'Свободны / Заняты' : 'Available / Busy',
          value: `${cd.availableCouriers} / ${cd.busyCouriers}`,
          sublabel: `${cd.activeCouriers} ${lang === 'uz' ? 'faol' : lang === 'ru' ? 'активных' : 'active'}`,
          tone: cd.availableCouriers === 0 && cd.deliveriesSearching > 0 ? 'bad' : 'good',
        },
        {
          label: lang === 'uz' ? 'Kuryer qidirilmoqda' : lang === 'ru' ? 'В поиске курьера' : 'Searching Courier',
          value: String(cd.deliveriesSearching),
          sublabel: `${cd.deliveriesInProgress} ${lang === 'uz' ? 'jarayonda' : lang === 'ru' ? 'в работе' : 'in progress'}`,
          tone: cd.deliveriesSearching > 0 ? 'warn' : 'good',
        },
        {
          label: lang === 'uz' ? "O'rtacha yetkazish" : lang === 'ru' ? 'Среднее время SLA' : 'Avg Delivery Time',
          value: cd.avgDeliveryMinutes !== null ? `${cd.avgDeliveryMinutes} min` : '—',
          sublabel: cd.slaOnTimePct !== null ? `SLA ≤45m: ${cd.slaOnTimePct}%` : undefined,
          tone: cd.slaOnTimePct !== null && cd.slaOnTimePct < 80 ? 'warn' : 'good',
        },
        {
          label: lang === 'uz' ? "O'z / On-demand" : lang === 'ru' ? 'Свои / On-demand' : 'Own / On-Demand',
          value: `${cd.ownCourierCount} / ${cd.onDemandCourierCount}`,
          sublabel: fmtUzs(cd.deliveryRewardTotal),
          tone: 'neutral',
        },
      ],
    });

    if (cd.couriers.length > 0) {
      uiBlocks.push({
        id: 'blk-ops-couriers-table',
        kind: 'table',
        title:
          lang === 'uz'
            ? 'Biriktirilgan kuryerlar holati'
            : lang === 'ru'
              ? 'Загрузка штатных курьеров'
              : 'Affiliated Couriers & Load',
        columns:
          lang === 'uz'
            ? ['Kuryer', 'Holat', 'Mavjudlik', 'Faol yuklama']
            : lang === 'ru'
              ? ['Курьер', 'Статус', 'Доступность', 'Активных заказов']
              : ['Courier', 'Status', 'Availability', 'Active Load'],
        rows: cd.couriers.slice(0, 8).map(c => [
          c.name,
          c.status,
          c.availability,
          c.activeLoad,
        ]),
        highlightRowIndices: cd.couriers
          .slice(0, 8)
          .map((c, idx) => (c.activeLoad >= 3 ? idx : -1))
          .filter(idx => idx >= 0),
      });
    }
    pushSuggestedRoute(intents.isCouriers ? '/couriers' : '/delivery');
    pushSuggestedRoute(intents.isCouriers ? '/delivery' : '/couriers');
  }

  // 4. Menu, Dishes, Categories & Excel/CSV Imports focus
  if (showMenuBlock) {
    const m = ops.menu;
    uiBlocks.push({
      id: 'blk-ops-menu-kpis',
      kind: 'kpis',
      title:
        lang === 'uz'
          ? 'Menyu, taomlar va Excel/CSV import'
          : lang === 'ru'
            ? 'Меню, маржинальность блюд и импорт'
            : 'Menu Health & Import Stats',
      items: [
        {
          label: lang === 'uz' ? 'Mavjud / Jami taomlar' : lang === 'ru' ? 'В наличии / Всего блюд' : 'Available / Total',
          value: `${m.availableDishes} / ${m.totalDishes}`,
          sublabel: `${m.categoriesCount} ${lang === 'uz' ? 'kategoriya' : lang === 'ru' ? 'категорий' : 'categories'}`,
          tone: m.unavailableDishes.length > 0 ? 'warn' : 'good',
        },
        {
          label: lang === 'uz' ? 'Stop-list (mavjud emas)' : lang === 'ru' ? 'В стоп-листе' : 'Unavailable Dishes',
          value: String(m.unavailableDishes.length),
          tone: m.unavailableDishes.length > 0 ? 'warn' : 'good',
        },
        {
          label: lang === 'uz' ? 'Past marjali taomlar' : lang === 'ru' ? 'Низкая маржа (<45%)' : 'Low-Margin Dishes',
          value: String(m.lowMarginDishes.length),
          tone: m.lowMarginDishes.length > 0 ? 'warn' : 'good',
        },
        {
          label: lang === 'uz' ? 'Oxirgi import' : lang === 'ru' ? 'Последний импорт' : 'Last Menu Import',
          value: ops.imports.lastImport
            ? `${ops.imports.lastImport.addedCount + ops.imports.lastImport.updatedCount}/${ops.imports.lastImport.totalRows}`
            : '—',
          sublabel: ops.imports.lastImport
            ? `${ops.imports.lastImport.fileFormat.toUpperCase()} · ${ops.imports.lastImport.errorCount} err`
            : `${ops.imports.totalImportJobs} jobs`,
          tone: ops.imports.lastImport && ops.imports.lastImport.errorCount > 0 ? 'warn' : 'neutral',
        },
      ],
    });

    if (m.topDishes.length > 0) {
      uiBlocks.push({
        id: 'blk-ops-menu-chart',
        kind: 'chart',
        chartType: 'horizontal_bar',
        title:
          lang === 'uz'
            ? 'Top taomlar tushumi (UZS)'
            : lang === 'ru'
              ? 'Топ блюд по выручке (UZS)'
              : 'Top Dishes by Revenue (UZS)',
        items: m.topDishes.slice(0, 6).map(d => ({
          label: d.name,
          value: d.revenue > 0 ? d.revenue : d.price,
        })),
      });

      uiBlocks.push({
        id: 'blk-ops-menu-table',
        kind: 'table',
        title:
          lang === 'uz'
            ? 'Taomlar samaradorligi va marjasi'
            : lang === 'ru'
              ? 'Топ и низкомаржинальные блюда'
              : 'Top & Low-Margin Dishes',
        columns:
          lang === 'uz'
            ? ['Taom', 'Kategoriya', 'Narx', 'Marja %', 'Sotildi', 'Holat']
            : lang === 'ru'
              ? ['Блюдо', 'Категория', 'Цена', 'Маржа %', 'Продано', 'Статус']
              : ['Dish', 'Category', 'Price', 'Margin %', 'Sold', 'Status'],
        rows: m.topDishes.slice(0, 7).map(d => [
          d.name,
          d.categoryName,
          fmtUzs(d.price),
          `${d.marginPct}%`,
          d.quantitySold,
          d.isAvailable ? 'OK' : 'STOP',
        ]),
        highlightRowIndices: m.topDishes
          .slice(0, 7)
          .map((d, idx) => (!d.isAvailable || (d.costPrice > 0 && d.marginPct < 45) ? idx : -1))
          .filter(idx => idx >= 0),
      });
    }

    pushSuggestedRoute(intents.isCategories ? '/categories' : '/menu');
    pushSuggestedRoute(intents.isCategories ? '/menu' : '/categories');
  }

  // 5. Posts & Engagement / Statistics focus
  if (showPostsBlock || showStatsBlock) {
    uiBlocks.push({
      id: 'blk-ops-stats-kpis',
      kind: 'kpis',
      title:
        lang === 'uz'
          ? 'Statistika, reyting va postlar'
          : lang === 'ru'
            ? 'Статистика ресторана и публикации'
            : 'Restaurant Statistics & Engagement',
      items: [
        {
          label: lang === 'uz' ? 'Reyting' : lang === 'ru' ? 'Рейтинг' : 'Average Rating',
          value: ops.restaurant.rating !== null ? `${ops.restaurant.rating} ★` : '—',
          sublabel: `${ops.restaurant.reviewCount} ${lang === 'uz' ? 'sharh' : lang === 'ru' ? 'отзывов' : 'reviews'}`,
          tone: ops.restaurant.rating !== null && ops.restaurant.rating >= 4.5 ? 'good' : 'neutral',
        },
        {
          label: lang === 'uz' ? 'Obunachilar' : lang === 'ru' ? 'Подписчики' : 'Followers',
          value: String(ops.restaurant.followerCount),
          tone: 'good',
        },
        {
          label: lang === 'uz' ? 'Postlar' : lang === 'ru' ? 'Публикации' : 'Posts',
          value: `${ops.postsAndEngagement.publishedPosts} / ${ops.postsAndEngagement.totalPosts}`,
          sublabel: `${ops.postsAndEngagement.totalLikes} ♥ · ${ops.postsAndEngagement.totalComments} 💬`,
          tone: 'neutral',
        },
        {
          label: lang === 'uz' ? "O'rtacha chek" : lang === 'ru' ? 'Средний чек' : 'Average Check',
          value: fmtUzs(ops.orders.avgCheck),
          sublabel: fmtUzs(ops.orders.totalRevenue),
          tone: 'good',
        },
      ],
    });
    if (showPostsBlock) pushSuggestedRoute('/posts');
    if (showStatsBlock) pushSuggestedRoute('/statistics');
  }

  // Secondary routes for profile/settings/notifications/onboarding
  if (intents.isProfile) pushSuggestedRoute('/profile');
  if (intents.isSettings) pushSuggestedRoute('/settings');
  if (intents.isNotifications) pushSuggestedRoute('/notifications');
  if (intents.isOnboarding) pushSuggestedRoute('/onboarding');

  // If no domain-specific block was created yet, render compact live ops KPIs
  if (uiBlocks.length === 0) {
    uiBlocks.push({
      id: 'blk-ops-overview-kpis',
      kind: 'kpis',
      title:
        lang === 'uz'
          ? `${ops.restaurant.name} — Jonli operatsiyalar`
          : lang === 'ru'
            ? `${ops.restaurant.name} — Живые операции`
            : `${ops.restaurant.name} — Live Operations`,
      items: [
        {
          label: lang === 'uz' ? 'Bugungi buyurtmalar' : lang === 'ru' ? 'Заказы сегодня' : 'Orders Today',
          value: String(ops.orders.today),
          sublabel: fmtUzs(ops.orders.todayRevenue),
          tone: 'neutral',
        },
        {
          label: lang === 'uz' ? 'Qabul kutilmoqda' : lang === 'ru' ? 'Ждут принятия' : 'Pending Orders',
          value: String(ops.orders.byStatus.PENDING_ACCEPTANCE),
          tone: ops.orders.byStatus.PENDING_ACCEPTANCE > 0 ? 'warn' : 'good',
        },
        {
          label: lang === 'uz' ? 'Chek tasdiqlash' : lang === 'ru' ? 'Ждут оплаты' : 'Pending Payments',
          value: String(ops.payments.awaitingConfirmationCount),
          sublabel: fmtUzs(ops.payments.awaitingConfirmationAmount),
          tone: ops.payments.awaitingConfirmationCount > 0 ? 'warn' : 'good',
        },
        {
          label: lang === 'uz' ? "Bo'sh kuryerlar" : lang === 'ru' ? 'Свободные курьеры' : 'Available Couriers',
          value: `${ops.couriersAndDelivery.availableCouriers} / ${ops.couriersAndDelivery.activeCouriers}`,
          tone: ops.couriersAndDelivery.availableCouriers > 0 ? 'good' : 'warn',
        },
      ],
    });
    pushSuggestedRoute('/dashboard');
    if (ops.orders.byStatus.PENDING_ACCEPTANCE > 0) pushSuggestedRoute('/orders');
    if (ops.payments.awaitingConfirmationCount > 0) pushSuggestedRoute('/payments');
  }

  if (alertPartsRu.length > 0) {
    uiBlocks.unshift({
      id: 'blk-ops-alert',
      kind: 'alert',
      severity:
        ops.orders.byStatus.PENDING_ACCEPTANCE >= 3 || ops.couriersAndDelivery.deliveriesSearching > 0
          ? 'critical'
          : 'warning',
      title:
        lang === 'uz'
          ? 'Tezkor operatsion ogohlantirish'
          : lang === 'ru'
            ? 'Требуют внимания прямо сейчас'
            : 'Live Operational Attention Needed',
      body:
        lang === 'uz'
          ? alertPartsUz.join(' ')
          : lang === 'ru'
            ? alertPartsRu.join(' ')
            : alertPartsEn.join(' '),
    });
  }

  // Build grounded multilingual deterministic answer
  const answer = buildDeterministicOpsAnswer(ops, intents);
  const summaryText = `Orders today: ${ops.orders.today} (pending ${ops.orders.byStatus.PENDING_ACCEPTANCE}, active ${ops.orders.activeCount}), payments awaiting confirmation: ${ops.payments.awaitingConfirmationCount}, couriers available: ${ops.couriersAndDelivery.availableCouriers}/${ops.couriersAndDelivery.activeCouriers}, dishes: ${ops.menu.availableDishes}/${ops.menu.totalDishes}`;

  return {
    answer,
    uiBlocks,
    autoActions,
    suggestedActions,
    summaryText,
  };
}

function buildDeterministicOpsAnswer(
  ops: RestaurantLiveOpsSnapshot,
  intents: RestaurantOpsIntents,
): Record<Language, string> {
  const rName = ops.restaurant.name;
  const cd = ops.couriersAndDelivery;

  if (intents.requestedRoute && !intents.isAnyOpsIntent) {
    const lbl = RESTAURANT_ROUTE_LABELS[intents.requestedRoute];
    return {
      ru: `Переключаю на раздел «${lbl.ru}» (${intents.requestedRoute}). Сейчас в «${rName}» ${ops.orders.activeCount} активных заказов и ${ops.payments.awaitingConfirmationCount} оплат на подтверждении.`,
      uz: `«${lbl.uz}» (${intents.requestedRoute}) bo‘limiga o‘tilmoqda. Hozirda «${rName}» restoranida ${ops.orders.activeCount} ta faol buyurtma va ${ops.payments.awaitingConfirmationCount} ta tasdiqlanmagan to‘lov bor.`,
      en: `Navigating to "${lbl.en}" (${intents.requestedRoute}). Currently ${rName} has ${ops.orders.activeCount} active orders and ${ops.payments.awaitingConfirmationCount} payments awaiting confirmation.`,
    };
  }

  if (intents.isPayments && !intents.isOrders && !intents.isCouriers && !intents.isMenu) {
    return {
      ru: `По оплатам «${rName}»: подтверждено ${ops.payments.paidCount} оплат на ${fmtUzs(ops.payments.paidAmount)} (карта ${fmtUzs(ops.payments.cardPaidAmount)}, наличные ${fmtUzs(ops.payments.cashPaidAmount)}). В очереди на подтверждение ${ops.payments.awaitingConfirmationCount} переводов на ${fmtUzs(ops.payments.awaitingConfirmationAmount)}.`,
      uz: `«${rName}» to‘lovlari: ${ops.payments.paidCount} ta to‘lov tasdiqlangan (${fmtUzs(ops.payments.paidAmount)}; karta ${fmtUzs(ops.payments.cardPaidAmount)}, naqd ${fmtUzs(ops.payments.cashPaidAmount)}). Tasdiqlash navbatida ${ops.payments.awaitingConfirmationCount} ta to‘lov (${fmtUzs(ops.payments.awaitingConfirmationAmount)}).`,
      en: `${rName} payments: ${ops.payments.paidCount} confirmed (${fmtUzs(ops.payments.paidAmount)} — card ${fmtUzs(ops.payments.cardPaidAmount)}, cash ${fmtUzs(ops.payments.cashPaidAmount)}). ${ops.payments.awaitingConfirmationCount} transfer(s) totaling ${fmtUzs(ops.payments.awaitingConfirmationAmount)} await confirmation.`,
    };
  }

  if ((intents.isCouriers || intents.isDelivery) && !intents.isOrders && !intents.isMenu) {
    const slaRu =
      cd.avgDeliveryMinutes !== null
        ? `Среднее время доставки ${cd.avgDeliveryMinutes} мин (SLA ≤45 мин: ${cd.slaOnTimePct ?? 0}%).`
        : 'Достаточно данных по времени SLA пока не накоплено.';
    const slaUz =
      cd.avgDeliveryMinutes !== null
        ? `O‘rtacha yetkazish vaqti ${cd.avgDeliveryMinutes} daqiqa (SLA ≤45 daq: ${cd.slaOnTimePct ?? 0}%).`
        : 'Yetkazish SLA bo‘yicha ma’lumot hali yetarli emas.';
    const slaEn =
      cd.avgDeliveryMinutes !== null
        ? `Average delivery time is ${cd.avgDeliveryMinutes} min (SLA ≤45m: ${cd.slaOnTimePct ?? 0}%).`
        : 'Not enough completed delivery timestamps for SLA yet.';
    return {
      ru: `Курьеры и доставка «${rName}»: доступно ${cd.availableCouriers} из ${cd.activeCouriers} штатных курьеров (занято ${cd.busyCouriers}, активная нагрузка ${cd.totalActiveLoad}). В работе ${cd.deliveriesInProgress} доставок, в поиске курьера ${cd.deliveriesSearching}. ${slaRu}`,
      uz: `«${rName}» kuryer va yetkazish: ${cd.activeCouriers} ta faol kuryerdan ${cd.availableCouriers} tasi bo‘sh (${cd.busyCouriers} tasi band, jami yuklama ${cd.totalActiveLoad}). Jarayonda ${cd.deliveriesInProgress} ta yetkazish, kuryer qidirilayotganlar ${cd.deliveriesSearching} ta. ${slaUz}`,
      en: `${rName} couriers & delivery: ${cd.availableCouriers} of ${cd.activeCouriers} active couriers available (${cd.busyCouriers} busy, load ${cd.totalActiveLoad}). ${cd.deliveriesInProgress} deliveries in progress, ${cd.deliveriesSearching} searching for courier. ${slaEn}`,
    };
  }

  if (intents.isMenu && !intents.isOrders && !intents.isCouriers) {
    const top = ops.menu.topDishes[0];
    const imp = ops.imports.lastImport;
    return {
      ru: `Меню «${rName}»: ${ops.menu.availableDishes} из ${ops.menu.totalDishes} блюд доступны в ${ops.menu.categoriesCount} категориях (${ops.menu.unavailableDishes.length} в стоп-листе, ${ops.menu.lowMarginDishes.length} с маржой <45%).${top ? ` Лидер продаж: «${top.name}» (${fmtUzs(top.revenue)}, ${top.quantitySold} шт.).` : ''}${imp ? ` Последний импорт (${imp.fileName}): +${imp.addedCount} / обновл. ${imp.updatedCount}, ошибок ${imp.errorCount}.` : ''}`,
      uz: `«${rName}» menyusi: ${ops.menu.categoriesCount} ta kategoriyada ${ops.menu.availableDishes}/${ops.menu.totalDishes} ta taom mavjud (${ops.menu.unavailableDishes.length} ta stop-listda, ${ops.menu.lowMarginDishes.length} ta past marjali).${top ? ` Eng ko‘p sotilgan: «${top.name}» (${fmtUzs(top.revenue)}, ${top.quantitySold} dona).` : ''}${imp ? ` Oxirgi import (${imp.fileName}): +${imp.addedCount} / yangilandi ${imp.updatedCount}, xato ${imp.errorCount}.` : ''}`,
      en: `${rName} menu: ${ops.menu.availableDishes} of ${ops.menu.totalDishes} dishes available across ${ops.menu.categoriesCount} categories (${ops.menu.unavailableDishes.length} unavailable, ${ops.menu.lowMarginDishes.length} low-margin <45%).${top ? ` Top dish: "${top.name}" (${fmtUzs(top.revenue)}, ${top.quantitySold} sold).` : ''}${imp ? ` Last import (${imp.fileName}): +${imp.addedCount} added, ${imp.updatedCount} updated, ${imp.errorCount} errors.` : ''}`,
    };
  }

  if (intents.isPosts && !intents.isOrders) {
    const pe = ops.postsAndEngagement;
    return {
      ru: `Публикации «${rName}»: опубликовано ${pe.publishedPosts} из ${pe.totalPosts} постов (черновиков ${pe.draftPosts}), всего ${pe.totalLikes} лайков и ${pe.totalComments} комментариев при ${ops.restaurant.followerCount} подписчиках.`,
      uz: `«${rName}» postlari: ${pe.totalPosts} tadan ${pe.publishedPosts} tasi chop etilgan (${pe.draftPosts} ta qoralama), jami ${pe.totalLikes} layk, ${pe.totalComments} izoh va ${ops.restaurant.followerCount} obunachi.`,
      en: `${rName} posts: ${pe.publishedPosts} of ${pe.totalPosts} published (${pe.draftPosts} drafts), ${pe.totalLikes} likes, ${pe.totalComments} comments, and ${ops.restaurant.followerCount} followers.`,
    };
  }

  return {
    ru: `Операционная сводка «${rName}»: сегодня ${ops.orders.today} заказов на ${fmtUzs(ops.orders.todayRevenue)}, активных ${ops.orders.activeCount} (ждут принятия: ${ops.orders.byStatus.PENDING_ACCEPTANCE}). Оплат на подтверждении: ${ops.payments.awaitingConfirmationCount} (${fmtUzs(ops.payments.awaitingConfirmationAmount)}). Свободных курьеров: ${cd.availableCouriers}/${cd.activeCouriers}, в меню доступно ${ops.menu.availableDishes}/${ops.menu.totalDishes} блюд.`,
    uz: `«${rName}» tezkor holati: bugun ${ops.orders.today} ta buyurtma (${fmtUzs(ops.orders.todayRevenue)}), faol ${ops.orders.activeCount} ta (qabul kutilmoqda: ${ops.orders.byStatus.PENDING_ACCEPTANCE}). Tasdiqlanmagan to‘lovlar: ${ops.payments.awaitingConfirmationCount} ta (${fmtUzs(ops.payments.awaitingConfirmationAmount)}). Bo‘sh kuryerlar: ${cd.availableCouriers}/${cd.activeCouriers}, menyuda ${ops.menu.availableDishes}/${ops.menu.totalDishes} taom mavjud.`,
    en: `${rName} live ops: ${ops.orders.today} orders today (${fmtUzs(ops.orders.todayRevenue)}), ${ops.orders.activeCount} active (${ops.orders.byStatus.PENDING_ACCEPTANCE} pending acceptance). ${ops.payments.awaitingConfirmationCount} payments awaiting confirmation (${fmtUzs(ops.payments.awaitingConfirmationAmount)}). Couriers available: ${cd.availableCouriers}/${cd.activeCouriers}; menu: ${ops.menu.availableDishes}/${ops.menu.totalDishes} dishes available.`,
  };
}

export async function executeRestaurantAiTool(
  name: string,
  args: Record<string, unknown>,
  context: { restaurantId: string; userId?: string; from?: string; to?: string; month?: string },
): Promise<unknown> {
  const from = typeof args.from === 'string' ? args.from : context.from;
  const to = typeof args.to === 'string' ? args.to : context.to;

  switch (name) {
    case 'get_restaurant_live_ops':
      return getRestaurantLiveOpsSnapshot(context.restaurantId, {
        from,
        to,
        userId: context.userId,
      });
    case 'get_pending_orders_and_payments': {
      const snap = await getRestaurantLiveOpsSnapshot(context.restaurantId, {
        from,
        to,
        userId: context.userId,
      });
      return {
        restaurantId: snap.restaurant.id,
        restaurantName: snap.restaurant.name,
        pendingAcceptanceCount: snap.orders.pendingAcceptance.length,
        pendingAcceptance: snap.orders.pendingAcceptance,
        ordersByStatus: snap.orders.byStatus,
        awaitingConfirmationCount: snap.payments.awaitingConfirmationCount,
        awaitingConfirmationAmount: snap.payments.awaitingConfirmationAmount,
        confirmationQueue: snap.payments.confirmationQueue,
      };
    }
    case 'get_courier_and_delivery_sla': {
      const snap = await getRestaurantLiveOpsSnapshot(context.restaurantId, {
        from,
        to,
        userId: context.userId,
      });
      return {
        restaurantId: snap.restaurant.id,
        restaurantName: snap.restaurant.name,
        period: snap.period,
        ...snap.couriersAndDelivery,
      };
    }
    case 'get_menu_and_import_health': {
      const snap = await getRestaurantLiveOpsSnapshot(context.restaurantId, {
        from,
        to,
        userId: context.userId,
      });
      return {
        restaurantId: snap.restaurant.id,
        restaurantName: snap.restaurant.name,
        period: snap.period,
        menu: snap.menu,
        imports: snap.imports,
      };
    }
    case 'navigate_restaurant_app': {
      const route =
        typeof args.route === 'string' &&
        (RESTAURANT_APP_ROUTES as readonly string[]).includes(args.route)
          ? (args.route as RestaurantAppRoute)
          : '/dashboard';
      return {
        accepted: true,
        action: {
          type: 'navigate_route',
          route,
          label: typeof args.label === 'string' && args.label.trim() ? args.label.trim() : RESTAURANT_ROUTE_LABELS[route].ru,
        },
      };
    }
    default:
      return executeMcpTool(name, args, {
        restaurantId: context.restaurantId,
        from,
        to,
        month: context.month,
      });
  }
}

function dedupeActions(actions: AgentClientAction[]): AgentClientAction[] {
  const seen = new Set<string>();
  const out: AgentClientAction[] = [];
  for (const act of actions) {
    const key =
      act.type === 'navigate_route'
        ? `navigate_route:${act.route}`
        : act.type === 'navigate'
          ? `navigate:${act.tab}`
          : act.type === 'fix_finding'
            ? `fix_finding:${act.findingId}`
            : act.type === 'apply_branch_budgets'
              ? `apply_branch_budgets:${act.month}`
              : `${act.type}:${act.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(act);
  }
  return out;
}

export function filterFinanceActionsForRestaurant(params: {
  financeAutoActions: AgentClientAction[];
  financeSuggestedActions: AgentClientAction[];
  opsAutoActions: AgentClientAction[];
  opsSuggestedActions: AgentClientAction[];
  extraSuggestedActions?: AgentClientAction[];
}): {
  autoActions: AgentClientAction[];
  suggestedActions: AgentClientAction[];
} {
  const autoActions: AgentClientAction[] = [
    ...params.financeAutoActions.filter(
      act => act.type !== 'navigate' && act.type !== 'highlight_widget',
    ),
    ...params.opsAutoActions,
  ];
  const suggestedActions: AgentClientAction[] = [
    ...params.financeSuggestedActions.filter(act => act.type !== 'navigate'),
    ...params.opsSuggestedActions,
    ...(params.extraSuggestedActions ?? []),
  ];
  return {
    autoActions: dedupeActions(autoActions),
    suggestedActions: dedupeActions(suggestedActions),
  };
}

export async function runRestaurantAiChat(params: {
  question: string;
  lang: Language;
  model?: string;
  restaurantId: string;
  restaurantName: string;
  userId?: string;
  history?: AgentChatMessage[];
  screenContext?: AgentScreenContext;
  from?: string;
  to?: string;
  month?: string;
  totalBudget?: number;
  districtId?: TashkentDistrictId;
}): Promise<AgentChatResponse> {
  const { question, lang, restaurantId, restaurantName } = params;
  const requestedModel = params.model?.trim() || DEFAULT_RESTAURANT_AI_MODEL;

  const financeIntents = detectQuestionIntents(question);
  const opsIntents = detectRestaurantOpsIntents(question);

  const hasDashboardControlIntent =
    financeIntents.isCreateDashboard ||
    financeIntents.isUpdateDashboard ||
    financeIntents.isRenameDashboard ||
    financeIntents.isDeleteDashboard ||
    financeIntents.isSelectMainDashboard ||
    financeIntents.isSelectCustomDashboard ||
    financeIntents.isRemoveDashboardWidget ||
    financeIntents.isPinWidget ||
    financeIntents.isUnpinWidget;

  const hasFinanceIntent =
    financeIntents.isMap ||
    financeIntents.isBranchAlloc ||
    financeIntents.isBudget ||
    financeIntents.isAudit ||
    financeIntents.isWhatIf ||
    hasDashboardControlIntent;

  // Run financial agent if finance/geo/budget/audit/what-if/UI-control is requested, OR if no specific ops intent matched (general question)
  const shouldRunFinanceAgent = hasFinanceIntent || !opsIntents.isAnyOpsIntent;

  const tOps = Date.now();
  const [opsSnapshot, financeResult] = await Promise.all([
    getRestaurantLiveOpsSnapshot(restaurantId, {
      from: params.from,
      to: params.to,
      userId: params.userId,
    }),
    shouldRunFinanceAgent
      ? runFinanceAgentChat({
          question,
          lang,
          model: requestedModel,
          restaurantId,
          restaurantName,
          history: params.history,
          screenContext: params.screenContext,
          from: params.from,
          to: params.to,
          month: params.month,
          totalBudget: params.totalBudget,
          districtId: params.districtId,
        })
      : Promise.resolve(null),
  ]);
  const opsDurationMs = Date.now() - tOps;

  const opsBuilt = buildRestaurantOpsResponse({
    question,
    lang,
    ops: opsSnapshot,
    intents: opsIntents,
  });

  const opsTrace: AgentToolTrace = {
    tool: 'get_restaurant_live_ops',
    args: { restaurantId, from: opsSnapshot.period.from, to: opsSnapshot.period.to },
    durationMs: opsDurationMs,
    summary: opsBuilt.summaryText,
  };

  // Case A: Pure restaurant operations query (fast live ops + Coarena grounding)
  if (!financeResult) {
    let answer = opsBuilt.answer;
    let requestId = `heuristic-ops-${Date.now()}`;
    let usedModel = requestedModel;
    let source: 'coarena' | 'heuristic' = 'heuristic';
    const traces: AgentToolTrace[] = [opsTrace];

    if (env.COARENA_API_KEY) {
      const langName = lang === 'uz' ? 'Uzbek (Latin)' : lang === 'ru' ? 'Russian' : 'English';
      const groundTruth = {
        restaurant: opsSnapshot.restaurant,
        screenContext: {
          restaurantRoute: params.screenContext?.restaurantRoute ?? '/ai-chat',
          summaryText: params.screenContext?.summaryText,
        },
        orders: {
          today: opsSnapshot.orders.today,
          total: opsSnapshot.orders.total,
          activeCount: opsSnapshot.orders.activeCount,
          byStatus: opsSnapshot.orders.byStatus,
          todayRevenueUZS: opsSnapshot.orders.todayRevenue,
          totalRevenueUZS: opsSnapshot.orders.totalRevenue,
          avgCheckUZS: opsSnapshot.orders.avgCheck,
          cancelRatePct: opsSnapshot.orders.cancelRatePct,
          pendingAcceptanceCount: opsSnapshot.orders.pendingAcceptance.length,
        },
        payments: {
          awaitingConfirmationCount: opsSnapshot.payments.awaitingConfirmationCount,
          awaitingConfirmationAmountUZS: opsSnapshot.payments.awaitingConfirmationAmount,
          paidCount: opsSnapshot.payments.paidCount,
          paidAmountUZS: opsSnapshot.payments.paidAmount,
          cashPaidAmountUZS: opsSnapshot.payments.cashPaidAmount,
          cardPaidAmountUZS: opsSnapshot.payments.cardPaidAmount,
        },
        couriersAndDelivery: {
          activeCouriers: opsSnapshot.couriersAndDelivery.activeCouriers,
          availableCouriers: opsSnapshot.couriersAndDelivery.availableCouriers,
          busyCouriers: opsSnapshot.couriersAndDelivery.busyCouriers,
          totalActiveLoad: opsSnapshot.couriersAndDelivery.totalActiveLoad,
          deliveriesInProgress: opsSnapshot.couriersAndDelivery.deliveriesInProgress,
          deliveriesSearching: opsSnapshot.couriersAndDelivery.deliveriesSearching,
          avgDeliveryMinutes: opsSnapshot.couriersAndDelivery.avgDeliveryMinutes,
          slaOnTimePct: opsSnapshot.couriersAndDelivery.slaOnTimePct,
          ownCourierCount: opsSnapshot.couriersAndDelivery.ownCourierCount,
          onDemandCourierCount: opsSnapshot.couriersAndDelivery.onDemandCourierCount,
        },
        menu: {
          totalDishes: opsSnapshot.menu.totalDishes,
          availableDishes: opsSnapshot.menu.availableDishes,
          unavailableCount: opsSnapshot.menu.unavailableDishes.length,
          categoriesCount: opsSnapshot.menu.categoriesCount,
          topDishes: opsSnapshot.menu.topDishes.slice(0, 5),
          lowMarginDishesCount: opsSnapshot.menu.lowMarginDishes.length,
        },
        posts: opsSnapshot.postsAndEngagement,
        lastImport: opsSnapshot.imports.lastImport,
      };

      const allowedNumbers = [
        ...collectNumericValues(groundTruth),
        ...extractNumbersFromText(params.screenContext?.summaryText ?? ''),
      ];

      const sysMsg: CoarenaMessage = {
        role: 'system',
        content: [
          'You are the UzBite Restaurant AI Operations & Finance Copilot.',
          'Strictly use ONLY verified numbers from GroundTruth JSON. Never invent or hallucinate figures.',
          `Write 2-3 clear, actionable operational sentences strictly in ${langName}.`,
          'Return valid JSON: { "reply": string }.',
        ].join('\n'),
      };
      const historyMsgs: CoarenaMessage[] = (params.history ?? []).slice(-4).map(m => ({
        role: m.role,
        content: m.content,
      }));
      const userMsg: CoarenaMessage = {
        role: 'user',
        content: `Question: ${question}\nGroundTruth: ${JSON.stringify(groundTruth)}`,
      };

      const tLlm = Date.now();
      const res = await callCoarenaChat({
        model: requestedModel,
        messages: [sysMsg, ...historyMsgs, userMsg],
        responseFormat: { type: 'json_object' },
        temperature: 0.15,
        maxTokens: 360,
        timeoutMs: 12_000,
      });

      if (res) {
        requestId = res.requestId;
        usedModel = res.model;
        let replyText = '';
        if (res.message.content) {
          const parsed = extractJsonFromText(res.message.content) as {
            reply?: string;
            ru?: string;
            uz?: string;
            en?: string;
          } | null;
          if (parsed?.reply && typeof parsed.reply === 'string') replyText = parsed.reply.trim();
          else if (parsed && typeof parsed[lang] === 'string') replyText = parsed[lang]!.trim();
          else if (res.message.content.trim().length > 12) replyText = res.message.content.trim();
        }

        if (replyText) {
          const grounding = verifyLlmNumbersAgainstGroundTruth(replyText, allowedNumbers);
          source = 'coarena';
          if (grounding.verified) {
            answer = { ...opsBuilt.answer, [lang]: replyText };
          }
          traces.push({
            tool: `coarena:${usedModel}`,
            args: { requestId, grounded: grounding.verified, matchedNumbers: grounding.matchedCount },
            durationMs: Date.now() - tLlm,
            summary: grounding.verified
              ? `Grounded ops response (${grounding.matchedCount} verified figures)`
              : `Fallback to exact ops figures (rejected ${grounding.ungroundedNumbers.join(', ')})`,
          });
        }
      }
    }

    return {
      requestId,
      model: usedModel,
      source,
      answer,
      uiBlocks: opsBuilt.uiBlocks,
      autoActions: dedupeActions(opsBuilt.autoActions),
      suggestedActions: dedupeActions(opsBuilt.suggestedActions),
      toolTraces: traces,
      relatedFindingCodes: [],
    };
  }

  // Case B: Financial / Geo / Budget / Audit / What-If / UI-Control / Hybrid query
  const mergedBlocks: AgentUiBlock[] = [...financeResult.uiBlocks];

  // Enrich with restaurant ops UI blocks if user also asked about live ops or has critical live bottlenecks on general overview
  if (opsIntents.isAnyOpsIntent) {
    for (const blk of opsBuilt.uiBlocks) {
      if (!mergedBlocks.some(b => b.id === blk.id)) {
        mergedBlocks.push(blk);
      }
    }
  } else if (
    !hasFinanceIntent &&
    (opsSnapshot.orders.byStatus.PENDING_ACCEPTANCE > 0 ||
      opsSnapshot.payments.awaitingConfirmationCount > 0)
  ) {
    const opsAlert = opsBuilt.uiBlocks.find(b => b.kind === 'alert');
    if (opsAlert) mergedBlocks.unshift(opsAlert);
  }

  // Add helpful restaurant desktop route suggestions aligned with finance topics
  const extraSuggestedActions: AgentClientAction[] = [];
  if (financeIntents.isSales) {
    extraSuggestedActions.push(makeNavigateRouteAction('/menu', lang));
    extraSuggestedActions.push(makeNavigateRouteAction('/statistics', lang));
  }
  if (financeIntents.isMap) {
    extraSuggestedActions.push(makeNavigateRouteAction('/delivery', lang));
  }
  if (financeIntents.isAudit || financeIntents.isBudget) {
    extraSuggestedActions.push(makeNavigateRouteAction('/statistics', lang));
    extraSuggestedActions.push(makeNavigateRouteAction('/payments', lang));
  }

  const { autoActions: finalAutoActions, suggestedActions: finalSuggestedActions } =
    filterFinanceActionsForRestaurant({
      financeAutoActions: financeResult.autoActions,
      financeSuggestedActions: financeResult.suggestedActions,
      opsAutoActions: opsBuilt.autoActions,
      opsSuggestedActions: opsBuilt.suggestedActions,
      extraSuggestedActions,
    });

  const mergedAnswer: Record<Language, string> =
    opsIntents.isAnyOpsIntent && !hasDashboardControlIntent
      ? {
          ru: `${financeResult.answer.ru}\n\n${opsBuilt.answer.ru}`,
          uz: `${financeResult.answer.uz}\n\n${opsBuilt.answer.uz}`,
          en: `${financeResult.answer.en}\n\n${opsBuilt.answer.en}`,
        }
      : financeResult.answer;

  return {
    ...financeResult,
    answer: mergedAnswer,
    uiBlocks: mergedBlocks.slice(0, 7),
    autoActions: finalAutoActions,
    suggestedActions: finalSuggestedActions,
    toolTraces: [opsTrace, ...financeResult.toolTraces],
  };
}
