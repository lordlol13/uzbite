import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AgentChatResponse,
  AgentClientAction,
  AgentNavTab,
  AgentScreenContext,
  AgentUiBlock,
  Language,
  TashkentDistrictId,
} from '@uzbite/shared';
import { restaurantAiApi } from '../api/client';
import { useSession } from './session';

export interface AiChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  latencyMs?: number;
  response?: AgentChatResponse;
  feedback?: 'up' | 'down' | null;
  feedbackStatus?: string | null;
  error?: boolean;
}

export interface CustomDashboard {
  id: string;
  title: string;
  createdAt: string;
  blocks: AgentUiBlock[];
}

export interface ScreenRouteMeta {
  route: string;
  activeTab: AgentNavTab;
  title: Record<Language, string>;
  quickPrompts: Record<Language, string[]>;
}

const DEFAULT_MODEL = 'gemini-3-8-flash';
const PINNED_PREFIX = 'uzbite_rest_pinned_widgets_v1_';
const DASHBOARDS_PREFIX = 'uzbite_rest_custom_dashboards_v1_';
const TURNS_PREFIX = 'uzbite_rest_ai_turns_v1_';
const MODEL_KEY = 'uzbite_rest_ai_model_v1';

const ALLOWED_RESTAURANT_ROUTES = new Set([
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
]);

const BUSINESS_TAB_TO_ROUTE: Record<AgentNavTab, string> = {
  dashboard: '/dashboard',
  agent: '/ai-chat',
  audit: '/statistics',
  expenses: '/statistics',
  budgets: '/statistics',
  branches: '/statistics',
  map: '/delivery',
  sales: '/menu',
};

const ROUTE_META_MAP: Record<string, ScreenRouteMeta> = {
  '/dashboard': {
    route: '/dashboard',
    activeTab: 'dashboard',
    title: { ru: 'Главная панель', uz: 'Bosh sahifa', en: 'Dashboard' },
    quickPrompts: {
      ru: [
        'Сделай полную сводку операций ресторана за сегодня',
        'Какие статьи бюджета рискуют выйти за лимит в этом месяце?',
        'Создай кастомный дашборд по операциям и расходам',
      ],
      uz: [
        'Bugungi restoran operatsiyalari bo‘yicha to‘liq xulosa ber',
        'Bu oyda qaysi byudjet moddalari limitdan oshishi mumkin?',
        'Operatsiyalar va xarajatlar bo‘yicha maxsus dashboard yarat',
      ],
      en: [
        'Give me a full live summary of restaurant operations today',
        'Which budget categories are at risk of breaching limits this month?',
        'Create a custom dashboard for live ops and expenses',
      ],
    },
  },
  '/orders': {
    route: '/orders',
    activeTab: 'sales',
    title: { ru: 'Заказы', uz: 'Buyurtmalar', en: 'Orders' },
    quickPrompts: {
      ru: [
        'Сколько сейчас новых и активных заказов и есть ли задержки кухни?',
        'Покажи статистику отмен и способы снизить потери выручки',
        'Какие заказы ждут подтверждения оплаты?',
      ],
      uz: [
        'Hozir nechta yangi va faol buyurtma bor, oshxonada kechikish bormi?',
        'Bekor qilingan buyurtmalar va yo‘qotishlarni kamaytirish yo‘llarini ko‘rsat',
        'Qaysi buyurtmalar to‘lov tasdiqlanishini kutmoqda?',
      ],
      en: [
        'How many pending and active orders are in the queue right now?',
        'Show cancellation stats and how to reduce lost revenue',
        'Which orders are awaiting payment confirmation?',
      ],
    },
  },
  '/menu': {
    route: '/menu',
    activeTab: 'sales',
    title: { ru: 'Меню и Excel/CSV', uz: 'Menyu va Excel/CSV', en: 'Menu & Excel/CSV' },
    quickPrompts: {
      ru: [
        'Какие блюда приносят максимум выручки, а какие в стоп-листе или низкомаржинальны?',
        'Оптимизируй себестоимость (Food Cost) и предложи корректировку цен',
        'Создай дашборд по продажам и маржинальности меню',
      ],
      uz: [
        'Qaysi taomlar eng ko‘p daromad keltiradi va qaysilari stop-listda?',
        'Food Cost tannarxini optimallashtir va narx tavsiyalarini ber',
        'Menyu savdosi va marjasi bo‘yicha dashboard yarat',
      ],
      en: [
        'Which dishes drive the most revenue and which are unavailable or low margin?',
        'Optimize food cost and recommend menu pricing adjustments',
        'Create a sales and menu margin custom dashboard',
      ],
    },
  },
  '/categories': {
    route: '/categories',
    activeTab: 'sales',
    title: { ru: 'Категории', uz: 'Kategoriyalar', en: 'Categories' },
    quickPrompts: {
      ru: [
        'Какие категории меню лидируют по выручке и количеству продаж?',
        'Есть ли категории без активных блюд или с падением спроса?',
      ],
      uz: [
        'Qaysi menyu kategoriyalari daromad va sotuv bo‘yicha yetakchi?',
        'Faol taomlari yo‘q yoki talabi pasaygan kategoriyalar bormi?',
      ],
      en: [
        'Which menu categories lead in revenue and volume?',
        'Are there categories with unavailable dishes or declining demand?',
      ],
    },
  },
  '/posts': {
    route: '/posts',
    activeTab: 'sales',
    title: { ru: 'Публикации', uz: 'Nashrlar', en: 'Publications' },
    quickPrompts: {
      ru: [
        'Какие топовые блюда стоит продвинуть в видео-публикациях UzBite?',
        'Из каких районов Ташкента приходит аудитория для таргетинга публикаций?',
      ],
      uz: [
        'UzBite video nashrlarida qaysi top taomlarni targ‘ib qilish kerak?',
        'Nashrlar uchun Toshkentning qaysi tumanlarida talab eng yuqori?',
      ],
      en: [
        'Which top-selling dishes should we feature in UzBite video posts?',
        'Which Tashkent districts have the highest demand for targeting?',
      ],
    },
  },
  '/couriers': {
    route: '/couriers',
    activeTab: 'map',
    title: { ru: 'Мои курьеры', uz: 'Kuryerlarim', en: 'My Couriers' },
    quickPrompts: {
      ru: [
        'Проверь загрузку наших курьеров и SLA доставки прямо сейчас',
        'В каких районах Ташкента доставка убыточна из-за дальности?',
      ],
      uz: [
        'Hozir kuryerlar yuklamasi va yetkazib berish SLA holatini tekshir',
        'Toshkentning qaysi tumanlarida yetkazib berish zararli bo‘lmoqda?',
      ],
      en: [
        'Check current courier load and delivery SLA performance',
        'Which Tashkent districts have loss-making delivery margins?',
      ],
    },
  },
  '/delivery': {
    route: '/delivery',
    activeTab: 'map',
    title: { ru: 'Доставка', uz: 'Yetkazib berish', en: 'Delivery' },
    quickPrompts: {
      ru: [
        'Покажи карту 12 районов Ташкента, тепловую карту заказов и зоны 3.5 км',
        'Где доставка убыточна и как перераспределить своих и on-demand курьеров?',
        'Закрепи карту спроса Ташкента на главный дашборд',
      ],
      uz: [
        'Toshkentning 12 tumani xaritasi, heatmap va 3.5 km qamrov zonasini ko‘rsat',
        'Qayerda yetkazish zararli va kuryerlarni qanday optimal taqsimlash kerak?',
        'Toshkent talab xaritasini bosh dashboardga biriktir',
      ],
      en: [
        'Show the 12-district Tashkent map, order heatmap, and 3.5km coverage zones',
        'Where is delivery unprofitable and how should we balance own vs on-demand couriers?',
        'Pin the Tashkent demand map to the main dashboard',
      ],
    },
  },
  '/payments': {
    route: '/payments',
    activeTab: 'expenses',
    title: { ru: 'Оплата', uz: 'To‘lovlar', en: 'Payments' },
    quickPrompts: {
      ru: [
        'Сколько оплат по карте ждут подтверждения и на какую сумму?',
        'Найди ошибки учёта, дубликаты счетов и расхождения сумм (#26)',
      ],
      uz: [
        'Karta orqali nechta to‘lov tasdiqlanishini kutmoqda va summasi qancha?',
        'Hisob xatolari, dublikat hisob-fakturalar va farqlarni top (#26)',
      ],
      en: [
        'How many card payments are awaiting confirmation and for what total?',
        'Run accounting audit for duplicates and amount mismatches (#26)',
      ],
    },
  },
  '/statistics': {
    route: '/statistics',
    activeTab: 'audit',
    title: { ru: 'Статистика и аналитика', uz: 'Statistika va tahlil', en: 'Statistics & Analytics' },
    quickPrompts: {
      ru: [
        'Кейс #26: Найди ошибки учёта, дубликаты и способы сократить расходы',
        'Кейс #25: Какие статьи превысят бюджет и смоделируй рост тарифов +20%',
        'Кейс #24: Распредели 120 млн UZS между филиалами по ROI и спросу',
      ],
      uz: [
        '#26 Keys: Hisob xatolari, dublikatlar va xarajatlarni qisqartirish yo‘llarini top',
        '#25 Keys: Qaysi moddalar byudjetdan oshadi va +20% tarif ssenariysini hisobla',
        '#24 Keys: 120 mln so‘mni filiallar o‘rtasida ROI bo‘yicha optimal taqsimla',
      ],
      en: [
        'Case #26: Find accounting errors, duplicates, and cost-saving opportunities',
        'Case #25: Forecast budget breaches and run +20% tariff What-If stress test',
        'Case #24: Allocate 120M UZS across branches by ROI and demand',
      ],
    },
  },
  '/profile': {
    route: '/profile',
    activeTab: 'dashboard',
    title: { ru: 'Профиль ресторана', uz: 'Restoran profili', en: 'Restaurant Profile' },
    quickPrompts: {
      ru: [
        'Оцени позиции нашего ресторана и зоны охвата 3.5 км в Ташкенте',
        'Сделай аудит эффективности ресторана и главных точек роста',
      ],
      uz: [
        'Restoranimizning Toshkentdagi 3.5 km qamrov zonasi va holatini bahola',
        'Restoran samaradorligi va asosiy o‘sish nuqtalari bo‘yicha audit o‘tkaz',
      ],
      en: [
        'Evaluate our restaurant location and 3.5km coverage zone in Tashkent',
        'Audit restaurant efficiency and identify top growth levers',
      ],
    },
  },
  '/settings': {
    route: '/settings',
    activeTab: 'dashboard',
    title: { ru: 'Настройки', uz: 'Sozlamalar', en: 'Settings' },
    quickPrompts: {
      ru: [
        'Какие KPI требуют внимания прямо сейчас?',
        'Проверь бюджетные лимиты и статус операций ресторана',
      ],
      uz: [
        'Hozir qaysi KPI ko‘rsatkichlariga e’tibor berish kerak?',
        'Byudjet limitlari va restoran operatsiyalari holatini tekshir',
      ],
      en: [
        'Which KPIs need immediate attention right now?',
        'Review budget limits and current restaurant operational status',
      ],
    },
  },
  '/notifications': {
    route: '/notifications',
    activeTab: 'dashboard',
    title: { ru: 'Уведомления', uz: 'Bildirishnomalar', en: 'Notifications' },
    quickPrompts: {
      ru: [
        'Суммируй критические риски: просроченные заказы, оплаты и перерасходы бюджета',
        'Найди срочные финансовые ошибки и аномалии (#26)',
      ],
      uz: [
        'Kritik xavflarni jamla: kutilayotgan buyurtmalar, to‘lovlar va byudjet oshishi',
        'Shoshilinch moliyaviy xato va anomaliyalarni top (#26)',
      ],
      en: [
        'Summarize urgent risks: pending orders, payments, and budget overruns',
        'Find urgent financial errors and anomalies (#26)',
      ],
    },
  },
  '/onboarding': {
    route: '/onboarding',
    activeTab: 'dashboard',
    title: { ru: 'Настройка запуска', uz: 'Ishga tushirish', en: 'Onboarding' },
    quickPrompts: {
      ru: ['Покажи текущую готовность ресторана, меню и доставки'],
      uz: ['Restoran, menyu va yetkazib berish tayyorligini ko‘rsat'],
      en: ['Show current readiness of the restaurant, menu, and delivery'],
    },
  },
  '/ai-chat': {
    route: '/ai-chat',
    activeTab: 'agent',
    title: { ru: 'AI-Ассистент UzBite', uz: 'UzBite AI Yordamchi', en: 'UzBite AI Assistant' },
    quickPrompts: {
      ru: [
        'Сводка живых операций ресторана: заказы, оплаты, курьеры и топ-блюда',
        'Найди ошибки учёта, дубликаты и экономию по расходам (#26)',
        'Покажи карту 12 районов Ташкента и убыточную доставку',
      ],
      uz: [
        'Jonli restoran operatsiyalari: buyurtmalar, to‘lovlar, kuryerlar va top taomlar',
        'Hisob xatolari, dublikatlar va tejamkorlikni top (#26)',
        'Toshkentning 12 tumani xaritasi va zararli yetkazib berishni ko‘rsat',
      ],
      en: [
        'Live restaurant operations summary: orders, payments, couriers & top dishes',
        'Find accounting errors, duplicates & cost savings (#26)',
        'Show 12-district Tashkent map and unprofitable delivery areas',
      ],
    },
  },
};

export function getScreenMeta(pathname: string): ScreenRouteMeta {
  if (pathname.startsWith('/orders/')) {
    return ROUTE_META_MAP['/orders'];
  }
  return ROUTE_META_MAP[pathname] ?? ROUTE_META_MAP['/dashboard'];
}

function dateRangeForDays(days: number): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - (days - 1) * 86_400_000);
  const from = start.toISOString().slice(0, 10);
  return { from, to };
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage quota errors */
  }
}

function loadPinned(restaurantId: string): AgentUiBlock[] {
  const data = safeReadJson<unknown>(`${PINNED_PREFIX}${restaurantId || 'default'}`, []);
  return Array.isArray(data) ? (data as AgentUiBlock[]) : [];
}

function savePinned(restaurantId: string, blocks: AgentUiBlock[]): AgentUiBlock[] {
  const trimmed = blocks.slice(0, 6);
  safeWriteJson(`${PINNED_PREFIX}${restaurantId || 'default'}`, trimmed);
  return trimmed;
}

function loadDashboards(restaurantId: string): CustomDashboard[] {
  const data = safeReadJson<unknown>(`${DASHBOARDS_PREFIX}${restaurantId || 'default'}`, []);
  return Array.isArray(data) ? (data as CustomDashboard[]) : [];
}

function saveDashboards(restaurantId: string, list: CustomDashboard[]): CustomDashboard[] {
  const trimmed = list.slice(0, 12);
  safeWriteJson(`${DASHBOARDS_PREFIX}${restaurantId || 'default'}`, trimmed);
  return trimmed;
}

function loadTurns(restaurantId: string): AiChatTurn[] {
  const data = safeReadJson<unknown>(`${TURNS_PREFIX}${restaurantId || 'default'}`, []);
  return Array.isArray(data) ? (data as AiChatTurn[]) : [];
}

function saveTurns(restaurantId: string, turns: AiChatTurn[]): void {
  safeWriteJson(`${TURNS_PREFIX}${restaurantId || 'default'}`, turns.slice(-30));
}

function normalizeRoute(route: string): string {
  const clean = route.startsWith('/') ? route : `/${route}`;
  if (ALLOWED_RESTAURANT_ROUTES.has(clean) || clean.startsWith('/orders/')) {
    return clean;
  }
  return '/dashboard';
}

export interface AiWorkspaceContextValue {
  turns: AiChatTurn[];
  busy: boolean;
  actionBusyKey: string | null;
  statusBanner: string | null;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  customDashboards: CustomDashboard[];
  activeCustomDashboardId: string | null;
  setActiveCustomDashboardId: (id: string | null) => void;
  pinnedBlocks: AgentUiBlock[];
  highlightedWidgetId: string | null;
  days: number;
  setDays: (days: number) => void;
  month: string;
  setMonth: (month: string) => void;
  selectedDistrictId: TashkentDistrictId | '';
  setSelectedDistrictId: (id: TashkentDistrictId | '') => void;
  screenMeta: ScreenRouteMeta;
  screenContext: AgentScreenContext;
  askQuestion: (
    question: string,
    overrideScreenContext?: Partial<AgentScreenContext>,
  ) => Promise<AgentChatResponse | null>;
  executeAction: (action: AgentClientAction) => Promise<string | void>;
  rateTurn: (turnId: string, rating: 'up' | 'down') => Promise<void>;
  clearConversation: () => void;
  dismissStatusBanner: () => void;
  pinBlock: (block: AgentUiBlock) => void;
  unpinBlock: (blockId: string) => void;
  renameDashboard: (id: string, title: string) => void;
  deleteDashboard: (id: string) => void;
  removeWidgetFromDashboard: (dashboardId: string, blockId: string) => void;
}

const AiWorkspaceContext = createContext<AiWorkspaceContextValue | null>(null);

export function AiWorkspaceProvider({ children }: { children: ReactNode }) {
  const { auth, restaurant, config } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const lang = config.language;
  const restaurantId = restaurant?.id ?? auth?.user.restaurantId ?? 'default';

  const [turns, setTurns] = useState<AiChatTurn[]>(() => loadTurns(restaurantId));
  const [busy, setBusy] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    try {
      return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [customDashboards, setCustomDashboards] = useState<CustomDashboard[]>(() =>
    loadDashboards(restaurantId),
  );
  const [activeCustomDashboardId, setActiveCustomDashboardId] = useState<string | null>(null);
  const [pinnedBlocks, setPinnedBlocks] = useState<AgentUiBlock[]>(() => loadPinned(restaurantId));
  const [highlightedWidgetId, setHighlightedWidgetId] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [selectedDistrictId, setSelectedDistrictId] = useState<TashkentDistrictId | ''>('');

  const turnsRef = useRef<AiChatTurn[]>(turns);
  turnsRef.current = turns;

  const dashboardsRef = useRef<CustomDashboard[]>(customDashboards);
  dashboardsRef.current = customDashboards;

  const activeDashboardIdRef = useRef<string | null>(activeCustomDashboardId);
  activeDashboardIdRef.current = activeCustomDashboardId;

  // Reload per-restaurant state when restaurant switches
  useEffect(() => {
    setTurns(loadTurns(restaurantId));
    setPinnedBlocks(loadPinned(restaurantId));
    setCustomDashboards(loadDashboards(restaurantId));
    setActiveCustomDashboardId(null);
    setStatusBanner(null);
  }, [restaurantId]);

  // Persist turns per restaurant
  useEffect(() => {
    saveTurns(restaurantId, turns);
  }, [restaurantId, turns]);

  // Global keyboard shortcut Ctrl+K / Alt+A to toggle AI Copilot Drawer (unless already on /ai-chat)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isCtrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      const isAltA = e.altKey && e.key.toLowerCase() === 'a';
      if (!isCtrlK && !isAltA) return;
      e.preventDefault();
      if (location.pathname === '/ai-chat') {
        const inputEl = document.getElementById('ai-chat-main-input');
        if (inputEl instanceof HTMLElement) inputEl.focus();
      } else {
        setDrawerOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [location.pathname]);

  // Scroll & highlight target widget when highlightedWidgetId is set
  useEffect(() => {
    if (!highlightedWidgetId) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-widget-id="${highlightedWidgetId}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid var(--accent)';
        el.style.outlineOffset = '4px';
        setTimeout(() => {
          el.style.outline = '';
          el.style.outlineOffset = '';
        }, 3000);
      }
      setHighlightedWidgetId(null);
    }, 150);
    return () => clearTimeout(timer);
  }, [highlightedWidgetId, location.pathname]);

  const setSelectedModel = useCallback((model: string) => {
    const clean = model.trim() || DEFAULT_MODEL;
    setSelectedModelState(clean);
    try {
      localStorage.setItem(MODEL_KEY, clean);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen(prev => !prev);
  }, []);

  const dismissStatusBanner = useCallback(() => {
    setStatusBanner(null);
  }, []);

  const pinBlock = useCallback(
    (block: AgentUiBlock) => {
      setPinnedBlocks(prev => {
        const deduped = prev.filter(b => b.id !== block.id);
        const next = [{ ...block, id: `${block.id}-${Date.now()}` }, ...deduped];
        return savePinned(restaurantId, next);
      });
      setStatusBanner(
        lang === 'uz'
          ? 'Vidjet asosiy dashboardga biriktirildi'
          : lang === 'ru'
            ? 'Виджет закреплён на главном дашборде'
            : 'Widget pinned to Dashboard',
      );
    },
    [lang, restaurantId],
  );

  const unpinBlock = useCallback(
    (blockId: string) => {
      setPinnedBlocks(prev => savePinned(restaurantId, prev.filter(b => b.id !== blockId)));
    },
    [restaurantId],
  );

  const renameDashboard = useCallback(
    (id: string, title: string) => {
      const clean = title.trim();
      if (!clean) return;
      setCustomDashboards(prev =>
        saveDashboards(
          restaurantId,
          prev.map(d => (d.id === id ? { ...d, title: clean } : d)),
        ),
      );
    },
    [restaurantId],
  );

  const deleteDashboard = useCallback(
    (id: string) => {
      setCustomDashboards(prev => saveDashboards(restaurantId, prev.filter(d => d.id !== id)));
      setActiveCustomDashboardId(curr => (curr === id ? null : curr));
    },
    [restaurantId],
  );

  const removeWidgetFromDashboard = useCallback(
    (dashboardId: string, blockId: string) => {
      setCustomDashboards(prev =>
        saveDashboards(
          restaurantId,
          prev.map(d =>
            d.id === dashboardId ? { ...d, blocks: d.blocks.filter(b => b.id !== blockId) } : d,
          ),
        ),
      );
    },
    [restaurantId],
  );

  const screenMeta = useMemo(() => getScreenMeta(location.pathname), [location.pathname]);

  const screenContext = useMemo<AgentScreenContext>(() => {
    const activeCustom =
      location.pathname === '/dashboard' && activeCustomDashboardId
        ? customDashboards.find(d => d.id === activeCustomDashboardId) ?? null
        : null;

    const summaryParts = [
      `Restaurant: ${restaurant?.name ?? 'UzBite Restaurant'}`,
      `Route: ${location.pathname} (${screenMeta.title[lang]})`,
      `Period: ${days}d, Month: ${month}`,
    ];
    if (selectedDistrictId) summaryParts.push(`District: ${selectedDistrictId}`);
    if (activeCustom) {
      summaryParts.push(
        `Active Custom Dashboard: "${activeCustom.title}" (${activeCustom.blocks.length} blocks)`,
      );
    }

    return {
      activeTab: screenMeta.activeTab,
      restaurantRoute: location.pathname,
      restaurantId,
      days,
      month,
      districtId: selectedDistrictId,
      visibleWidgets:
        location.pathname === '/dashboard'
          ? ['widget-kpis', 'widget-quick-actions', 'widget-recent-orders', 'widget-pinned']
          : [location.pathname.replace(/^\//, 'screen-')],
      summaryText: summaryParts.join(' | '),
      activeCustomDashboardId,
      customDashboards: customDashboards.map(d => ({
        id: d.id,
        title: d.title,
        blockCount: d.blocks.length,
        blockKinds: d.blocks.map(b => b.kind),
      })),
      pinnedWidgetsCount: pinnedBlocks.length,
    };
  }, [
    activeCustomDashboardId,
    customDashboards,
    days,
    lang,
    location.pathname,
    month,
    pinnedBlocks.length,
    restaurant?.name,
    restaurantId,
    screenMeta,
    selectedDistrictId,
  ]);

  const executeAction = useCallback(
    async (action: AgentClientAction): Promise<string | void> => {
      const busyKey = `${action.type}:${action.label}`;
      setActionBusyKey(busyKey);
      try {
        if (action.type === 'navigate_route') {
          const target = normalizeRoute(action.route);
          navigate(target);
          if (target === '/ai-chat') setDrawerOpen(false);
          const msg =
            lang === 'uz'
              ? `Bo‘limga o‘tildi: ${action.label}`
              : lang === 'ru'
                ? `Открыт раздел: ${action.label}`
                : `Navigated to: ${action.label}`;
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'navigate') {
          const target = BUSINESS_TAB_TO_ROUTE[action.tab] ?? '/dashboard';
          navigate(target);
          if (target === '/ai-chat') setDrawerOpen(false);
          const msg =
            lang === 'uz'
              ? `Bo‘limga o‘tildi: ${action.label}`
              : lang === 'ru'
                ? `Открыт раздел: ${action.label}`
                : `Navigated to: ${action.label}`;
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'set_filters') {
          if (action.days) setDays(action.days);
          if (action.month) setMonth(action.month);
          if (action.districtId !== undefined) setSelectedDistrictId(action.districtId);
          const msg =
            lang === 'uz'
              ? `Filtrlar yangilandi: ${action.label}`
              : lang === 'ru'
                ? `Фильтры обновлены: ${action.label}`
                : `Filters updated: ${action.label}`;
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'highlight_widget') {
          if (action.tab) {
            navigate(BUSINESS_TAB_TO_ROUTE[action.tab] ?? '/dashboard');
          }
          setHighlightedWidgetId(action.widgetId);
          return;
        }

        if (action.type === 'pin_widget') {
          pinBlock(action.block);
          return lang === 'ru' ? 'Виджет закреплён на дашборде' : 'Widget pinned to Dashboard';
        }

        if (action.type === 'unpin_widget') {
          if (action.clearAll || !action.blockId) {
            setPinnedBlocks(savePinned(restaurantId, []));
          } else {
            unpinBlock(action.blockId);
          }
          const msg =
            lang === 'uz'
              ? 'Biriktirilgan vidjetlar tozalandi'
              : lang === 'ru'
                ? 'Закреплённые виджеты обновлены'
                : 'Pinned widgets updated';
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'create_dashboard') {
          const created: CustomDashboard = {
            id: `dash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: action.title.trim() || 'AI Custom Dashboard',
            createdAt: new Date().toISOString(),
            blocks: action.blocks,
          };
          const next = saveDashboards(restaurantId, [created, ...dashboardsRef.current]);
          setCustomDashboards(next);
          setActiveCustomDashboardId(created.id);
          navigate('/dashboard');
          const msg =
            lang === 'uz'
              ? `«${created.title}» maxsus paneli yaratildi`
              : lang === 'ru'
                ? `Создан кастомный дашборд «${created.title}»`
                : `Created custom dashboard "${created.title}"`;
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'update_dashboard') {
          const current = dashboardsRef.current;
          const targetId = action.dashboardId ?? activeDashboardIdRef.current ?? current[0]?.id;
          const target = targetId ? current.find(d => d.id === targetId) : undefined;
          let updated: CustomDashboard;
          let nextList: CustomDashboard[];

          if (!target) {
            updated = {
              id: `dash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: action.title?.trim() || 'AI Custom Dashboard',
              createdAt: new Date().toISOString(),
              blocks: action.blocks,
            };
            nextList = saveDashboards(restaurantId, [updated, ...current]);
          } else {
            const blocks =
              action.mode === 'append'
                ? [
                    ...target.blocks,
                    ...action.blocks.map((b, idx) => ({
                      ...b,
                      id: `${b.id}-${Date.now()}-${idx}`,
                    })),
                  ].slice(0, 6)
                : action.blocks;
            updated = {
              ...target,
              title: action.title?.trim() || target.title,
              blocks,
            };
            nextList = saveDashboards(
              restaurantId,
              current.map(d => (d.id === target.id ? updated : d)),
            );
          }

          setCustomDashboards(nextList);
          setActiveCustomDashboardId(updated.id);
          navigate('/dashboard');
          const msg =
            lang === 'uz'
              ? `«${updated.title}» paneli yangilandi (${updated.blocks.length} ta vidjet)`
              : lang === 'ru'
                ? `Дашборд «${updated.title}» обновлён (${updated.blocks.length} виджетов)`
                : `Updated dashboard "${updated.title}" (${updated.blocks.length} widgets)`;
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'rename_dashboard') {
          const current = dashboardsRef.current;
          const targetId = action.dashboardId ?? activeDashboardIdRef.current ?? current[0]?.id;
          if (targetId) {
            renameDashboard(targetId, action.title);
            setActiveCustomDashboardId(targetId);
            navigate('/dashboard');
          }
          const msg =
            lang === 'uz'
              ? `Dashboard nomi «${action.title}» deb o‘zgartirildi`
              : lang === 'ru'
                ? `Дашборд переименован в «${action.title}»`
                : `Renamed dashboard to "${action.title}"`;
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'delete_dashboard') {
          if (action.deleteAll) {
            setCustomDashboards(saveDashboards(restaurantId, []));
            setActiveCustomDashboardId(null);
          } else {
            const current = dashboardsRef.current;
            const targetId = action.dashboardId ?? activeDashboardIdRef.current ?? current[0]?.id;
            if (targetId) {
              deleteDashboard(targetId);
            }
          }
          navigate('/dashboard');
          const msg =
            lang === 'uz'
              ? 'Maxsus dashboard o‘chirildi'
              : lang === 'ru'
                ? 'Кастомный дашборд удалён'
                : 'Custom dashboard deleted';
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'select_dashboard') {
          if (action.dashboardId === null) {
            setActiveCustomDashboardId(null);
          } else {
            const current = dashboardsRef.current;
            const byId = current.find(d => d.id === action.dashboardId);
            const byTitle = action.titleMatch
              ? current.find(d => d.title.toLowerCase().includes(action.titleMatch!.toLowerCase()))
              : undefined;
            const chosen = byId ?? byTitle ?? current[0] ?? null;
            setActiveCustomDashboardId(chosen ? chosen.id : null);
          }
          navigate('/dashboard');
          const msg =
            action.dashboardId === null
              ? lang === 'uz'
                ? 'Asosiy dashboard ochildi'
                : lang === 'ru'
                  ? 'Открыт главный обзор'
                  : 'Switched to main overview'
              : lang === 'uz'
                ? 'Maxsus dashboard ochildi'
                : lang === 'ru'
                  ? 'Открыт кастомный дашборд'
                  : 'Switched to custom dashboard';
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'remove_dashboard_widget') {
          const current = dashboardsRef.current;
          const targetId = action.dashboardId ?? activeDashboardIdRef.current ?? current[0]?.id;
          if (targetId) {
            const next = saveDashboards(
              restaurantId,
              current.map(d =>
                d.id === targetId
                  ? {
                      ...d,
                      blocks: d.blocks.filter(b => {
                        if (action.blockId && b.id === action.blockId) return false;
                        if (action.blockKind && b.kind === action.blockKind) return false;
                        return true;
                      }),
                    }
                  : d,
              ),
            );
            setCustomDashboards(next);
            setActiveCustomDashboardId(targetId);
          }
          navigate('/dashboard');
          const msg =
            lang === 'uz'
              ? 'Vidjet dashboarddan olib tashlandi'
              : lang === 'ru'
                ? 'Виджет удалён с дашборда'
                : 'Widget removed from dashboard';
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'fix_finding') {
          const res = await restaurantAiApi.fixFinding({
            ...(action.findingId ? { findingId: action.findingId } : {}),
            code: action.code,
            ...(action.expenseId ? { expenseId: action.expenseId } : {}),
            ...(action.duplicateExpenseId ? { duplicateExpenseId: action.duplicateExpenseId } : {}),
            ...(action.expectedAmount !== undefined ? { expectedAmount: action.expectedAmount } : {}),
            ...(action.suggestedCategory ? { suggestedCategory: action.suggestedCategory } : {}),
          });
          await queryClient.invalidateQueries();
          const detailByAction =
            res.action === 'deleted'
              ? lang === 'uz'
                ? 'Dublikat hisob-faktura o‘chirildi'
                : lang === 'ru'
                  ? 'Дубликат счёта удалён'
                  : 'Duplicate invoice deleted'
              : res.action === 'updated_amount'
                ? lang === 'uz'
                  ? 'Xarajat summasi tuzatildi'
                  : lang === 'ru'
                    ? 'Сумма расхода исправлена'
                    : 'Expense amount corrected'
                : res.action === 'updated_category'
                  ? lang === 'uz'
                    ? 'Xarajat kategoriyasi tuzatildi'
                    : lang === 'ru'
                      ? 'Категория расхода исправлена'
                      : 'Expense category corrected'
                  : null;
          const msg =
            res.message ||
            detailByAction ||
            (lang === 'uz'
              ? `Xato tuzatildi (${action.code})`
              : lang === 'ru'
                ? `Ошибка исправлена (${action.code})`
                : `Finding fixed (${action.code})`);
          setStatusBanner(msg);
          return msg;
        }

        if (action.type === 'apply_branch_budgets') {
          const res = await restaurantAiApi.applyBranchBudgets({
            month: action.month,
            allocations: action.allocations,
          });
          await queryClient.invalidateQueries();
          const msg =
            lang === 'uz'
              ? `${res.month} uchun ${res.appliedCount} ta filial byudjet limiti qo‘llandi`
              : lang === 'ru'
                ? `Применено ${res.appliedCount} лимитов бюджета филиалов на ${res.month}`
                : `Applied ${res.appliedCount} branch budget limits for ${res.month}`;
          setStatusBanner(msg);
          return msg;
        }
      } catch (err) {
        const errMsg =
          err instanceof Error
            ? err.message
            : lang === 'ru'
              ? 'Не удалось выполнить действие'
              : 'Action execution failed';
        setStatusBanner(errMsg);
        return errMsg;
      } finally {
        setActionBusyKey(null);
      }
    },
    [deleteDashboard, lang, navigate, pinBlock, queryClient, renameDashboard, restaurantId, unpinBlock],
  );

  const askQuestion = useCallback(
    async (
      questionText: string,
      overrideScreenContext?: Partial<AgentScreenContext>,
    ): Promise<AgentChatResponse | null> => {
      const clean = questionText.trim();
      if (!clean || busy) return null;

      const userTurn: AiChatTurn = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        role: 'user',
        text: clean,
        createdAt: new Date().toISOString(),
      };
      const history = turnsRef.current.slice(-6).map(t => ({
        role: t.role,
        content: t.text,
      }));

      setTurns(prev => [...prev, userTurn]);
      setBusy(true);
      setStatusBanner(null);

      const { from, to } = dateRangeForDays(days);
      const startedAt = performance.now();

      try {
        const mergedScreenContext: AgentScreenContext = {
          ...screenContext,
          ...(overrideScreenContext ?? {}),
        };
        const response = await restaurantAiApi.chat({
          question: clean,
          lang,
          model: selectedModel || DEFAULT_MODEL,
          history,
          screenContext: mergedScreenContext,
          from,
          to,
          month,
          ...(selectedDistrictId ? { districtId: selectedDistrictId } : {}),
        });
        const latencyMs = Math.round(performance.now() - startedAt);
        const answerText = response.answer[lang] || response.answer.ru || response.answer.en || '';

        const assistantTurn: AiChatTurn = {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          role: 'assistant',
          text: answerText,
          createdAt: new Date().toISOString(),
          latencyMs,
          response,
          feedback: null,
          feedbackStatus: null,
        };
        setTurns(prev => [...prev, assistantTurn]);

        if (response.autoActions && response.autoActions.length > 0) {
          for (const act of response.autoActions) {
            // Never auto-kick the user off /ai-chat with legacy business-tab navigate/highlight actions;
            // explicit restaurant navigation uses `navigate_route`, and manual action clicks still work.
            if (act.type === 'navigate' || act.type === 'highlight_widget') {
              continue;
            }
            await executeAction(act);
          }
        }
        return response;
      } catch (err) {
        const latencyMs = Math.round(performance.now() - startedAt);
        const msg =
          err instanceof Error
            ? err.message
            : lang === 'ru'
              ? 'Ошибка обращения к AI-ассистенту'
              : 'AI Assistant request failed';
        setTurns(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            text: msg,
            createdAt: new Date().toISOString(),
            latencyMs,
            error: true,
          },
        ]);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, days, executeAction, lang, month, screenContext, selectedDistrictId, selectedModel],
  );

  const rateTurn = useCallback(async (turnId: string, rating: 'up' | 'down') => {
    const target = turnsRef.current.find(t => t.id === turnId);
    const requestId = target?.response?.requestId;
    if (!requestId) return;

    setTurns(prev =>
      prev.map(t => (t.id === turnId ? { ...t, feedback: rating, feedbackStatus: '...' } : t)),
    );
    try {
      const res = await restaurantAiApi.sendFeedback({ requestId, rating });
      setTurns(prev =>
        prev.map(t =>
          t.id === turnId
            ? {
                ...t,
                feedbackStatus: res.ok
                  ? `Coarena OK (${res.status})`
                  : `Saved (${res.status})`,
              }
            : t,
        ),
      );
    } catch {
      setTurns(prev =>
        prev.map(t => (t.id === turnId ? { ...t, feedbackStatus: 'Error' } : t)),
      );
    }
  }, []);

  const clearConversation = useCallback(() => {
    if (busy) return;
    setTurns([]);
    setStatusBanner(null);
  }, [busy]);

  const value = useMemo<AiWorkspaceContextValue>(
    () => ({
      turns,
      busy,
      actionBusyKey,
      statusBanner,
      selectedModel,
      setSelectedModel,
      drawerOpen,
      setDrawerOpen,
      toggleDrawer,
      customDashboards,
      activeCustomDashboardId,
      setActiveCustomDashboardId,
      pinnedBlocks,
      highlightedWidgetId,
      days,
      setDays,
      month,
      setMonth,
      selectedDistrictId,
      setSelectedDistrictId,
      screenMeta,
      screenContext,
      askQuestion,
      executeAction,
      rateTurn,
      clearConversation,
      dismissStatusBanner,
      pinBlock,
      unpinBlock,
      renameDashboard,
      deleteDashboard,
      removeWidgetFromDashboard,
    }),
    [
      actionBusyKey,
      activeCustomDashboardId,
      askQuestion,
      busy,
      clearConversation,
      customDashboards,
      days,
      deleteDashboard,
      dismissStatusBanner,
      drawerOpen,
      executeAction,
      highlightedWidgetId,
      month,
      pinBlock,
      pinnedBlocks,
      rateTurn,
      removeWidgetFromDashboard,
      renameDashboard,
      screenContext,
      screenMeta,
      selectedDistrictId,
      selectedModel,
      setSelectedModel,
      statusBanner,
      toggleDrawer,
      turns,
      unpinBlock,
    ],
  );

  return <AiWorkspaceContext.Provider value={value}>{children}</AiWorkspaceContext.Provider>;
}

export function useAiWorkspace() {
  const ctx = useContext(AiWorkspaceContext);
  if (!ctx) throw new Error('useAiWorkspace must be used inside AiWorkspaceProvider');
  return ctx;
}
