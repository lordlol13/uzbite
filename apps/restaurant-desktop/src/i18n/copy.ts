import type { Language } from '@uzbite/shared';

export function useTr(lang: Language) {
  return function tr(ru: string, uz?: string, en?: string): string {
    if (lang === 'uz') return uz ?? ru;
    if (lang === 'en') return en ?? ru;
    return ru;
  };
}

export const NAV_LABELS: Record<
  Language,
  {
    aiChat: string;
    dashboard: string;
    orders: string;
    posts: string;
    profile: string;
    settings: string;
    menu: string;
    categories: string;
    couriers: string;
    delivery: string;
    payments: string;
    statistics: string;
    notifications: string;
  }
> = {
  ru: {
    aiChat: 'AI-Чат',
    dashboard: 'Главная',
    orders: 'Заказы',
    posts: 'Публикации',
    profile: 'Профиль',
    settings: 'Настройки',
    menu: 'Меню и Excel/CSV',
    categories: 'Категории',
    couriers: 'Мои курьеры',
    delivery: 'Доставка',
    payments: 'Оплата',
    statistics: 'Статистика',
    notifications: 'Уведомления',
  },
  uz: {
    aiChat: 'AI-Chat',
    dashboard: 'Bosh sahifa',
    orders: 'Buyurtmalar',
    posts: 'Nashrlar',
    profile: 'Profil',
    settings: 'Sozlamalar',
    menu: 'Menyu va Excel/CSV',
    categories: 'Kategoriyalar',
    couriers: 'Kuryerlarim',
    delivery: 'Yetkazib berish',
    payments: 'To‘lovlar',
    statistics: 'Statistika',
    notifications: 'Bildirishnomalar',
  },
  en: {
    aiChat: 'AI Chat',
    dashboard: 'Dashboard',
    orders: 'Orders',
    posts: 'Publications',
    profile: 'Profile',
    settings: 'Settings',
    menu: 'Menu & Excel/CSV',
    categories: 'Categories',
    couriers: 'My Couriers',
    delivery: 'Delivery',
    payments: 'Payments',
    statistics: 'Statistics',
    notifications: 'Notifications',
  },
};

export interface AiCopy {
  title: string;
  subtitle: string;
  badge: string;
  copilotPill: string;
  modelLabel: string;
  groundedBadge: string;
  heuristicBadge: string;
  send: string;
  thinking: string;
  clearChat: string;
  openFullChat: string;
  closeDrawer: string;
  toolsDrawer: string;
  runTool: string;
  runningTool: string;
  toolTraces: string;
  pinToDashboard: string;
  pinnedToDashboard: string;
  unpin: string;
  inputPlaceholder: string;
  drawerPlaceholder: string;
  shortcutHint: string;
  currentScreen: string;
  helpful: string;
  notHelpful: string;
  feedbackSent: string;
  emptyStateTitle: string;
  emptyStateDesc: string;
  customDashboards: string;
  defaultDashboard: string;
  pinnedWidgets: string;
  renameDashboard: string;
  deleteDashboard: string;
  removeWidget: string;
  noPinnedWidgets: string;
  heatmapLayer: string;
  serviceRadius: string;
  metricOrders: string;
  metricRevenue: string;
  metricAvgCheck: string;
  metricDeliveryMargin: string;
  ordersShort: string;
  total: string;
  noData: string;
  noPositiveValues: string;
  primaryForecast: string;
  planLimit: string;
  pool: string;
  branch: string;
  roi: string;
  score: string;
  current: string;
  aiBudget: string;
  delta: string;
  categories: {
    ops: string;
    audit: string;
    budget: string;
    branches: string;
    geo: string;
    ui: string;
  };
}

export const AI_COPY: Record<Language, AiCopy> = {
  ru: {
    title: 'AI-Ассистент UzBite',
    subtitle: 'Операции ресторана, финансовый аудит, бюджеты, гео-карта Ташкента и управление экранами',
    badge: 'AI',
    copilotPill: 'AI-Чат · Gemini 3.8',
    modelLabel: 'Модель',
    groundedBadge: 'Проверено по данным',
    heuristicBadge: 'Быстрый расчёт',
    send: 'Отправить',
    thinking: 'AI анализирует данные…',
    clearChat: 'Очистить чат',
    openFullChat: 'Открыть AI-Чат',
    closeDrawer: 'Свернуть',
    toolsDrawer: 'MCP-инструменты',
    runTool: 'Запустить инструмент',
    runningTool: 'Выполняется…',
    toolTraces: 'Вызовы инструментов',
    pinToDashboard: 'На дашборд',
    pinnedToDashboard: 'Закреплено',
    unpin: 'Открепить',
    inputPlaceholder: 'Спросите про заказы, кухню, расходы, бюджет, районы Ташкента или создайте дашборд…',
    drawerPlaceholder: 'Быстрый вопрос AI-ассистенту…',
    shortcutHint: 'Ctrl+K / Alt+A',
    currentScreen: 'Текущий экран',
    helpful: 'Полезно',
    notHelpful: 'Неточно',
    feedbackSent: 'Отзыв отправлен',
    emptyStateTitle: 'Чем помочь ресторану прямо сейчас?',
    emptyStateDesc: 'Задайте вопрос в свободной форме или выберите готовый сценарий — ассистент построит графики, карту Ташкента и предложит действия в 1 клик.',
    customDashboards: 'AI-дашборды',
    defaultDashboard: 'Основной',
    pinnedWidgets: 'Закреплённые виджеты',
    renameDashboard: 'Переименовать',
    deleteDashboard: 'Удалить',
    removeWidget: 'Убрать виджет',
    noPinnedWidgets: 'Нет закреплённых виджетов',
    heatmapLayer: 'Тепловой слой',
    serviceRadius: 'Радиус 3.5 км',
    metricOrders: 'Заказы',
    metricRevenue: 'Выручка',
    metricAvgCheck: 'Средний чек',
    metricDeliveryMargin: 'Маржа доставки',
    ordersShort: 'зак.',
    total: 'Итого',
    noData: 'Нет данных для графика',
    noPositiveValues: 'Нет положительных значений',
    primaryForecast: 'Факт / Прогноз',
    planLimit: 'Лимит / План',
    pool: 'Пул',
    branch: 'Филиал',
    roi: 'ROI',
    score: 'Индекс',
    current: 'Текущий',
    aiBudget: 'AI-бюджет',
    delta: 'Δ',
    categories: {
      ops: 'Операции ресторана',
      audit: 'Кейс #26: Аудит расходов',
      budget: 'Кейс #25: Бюджет и What-If',
      branches: 'Кейс #24: Бюджет филиалов',
      geo: 'Гео-аналитика Ташкента',
      ui: 'Экраны и AI-дашборды',
    },
  },
  uz: {
    title: 'UzBite AI-Yordamchi',
    subtitle: 'Restoran operatsiyalari, moliyaviy audit, byudjetlar, Toshkent geo-xaritasi va ekranlarni boshqarish',
    badge: 'AI',
    copilotPill: 'AI-Chat · Gemini 3.8',
    modelLabel: 'Model',
    groundedBadge: 'Ma’lumotlarga asoslangan',
    heuristicBadge: 'Tezkor hisob',
    send: 'Yuborish',
    thinking: 'AI ma’lumotlarni tahlil qilmoqda…',
    clearChat: 'Chatni tozalash',
    openFullChat: 'AI-Chatni ochish',
    closeDrawer: 'Yopish',
    toolsDrawer: 'MCP vositalari',
    runTool: 'Vositani ishga tushirish',
    runningTool: 'Bajarilmoqda…',
    toolTraces: 'Vosita chaqiruvlari',
    pinToDashboard: 'Dashboardga biriktirish',
    pinnedToDashboard: 'Biriktirildi',
    unpin: 'Ajratish',
    inputPlaceholder: 'Buyurtmalar, oshxona, xarajatlar, byudjet, Toshkent tumanlari haqida so‘rang yoki dashboard yarating…',
    drawerPlaceholder: 'AI-yordamchiga tezkor savol…',
    shortcutHint: 'Ctrl+K / Alt+A',
    currentScreen: 'Joriy ekran',
    helpful: 'Foydali',
    notHelpful: 'Noaniq',
    feedbackSent: 'Fikr yuborildi',
    emptyStateTitle: 'Restoranga hozir qanday yordam beray?',
    emptyStateDesc: 'Erkin savol bering yoki tayyor ssenariyni tanlang — yordamchi grafiklar, Toshkent xaritasi va 1-klik amallarni tayyorlaydi.',
    customDashboards: 'AI-dashboardlar',
    defaultDashboard: 'Asosiy',
    pinnedWidgets: 'Biriktirilgan vidjetlar',
    renameDashboard: 'Nomini o‘zgartirish',
    deleteDashboard: 'O‘chirish',
    removeWidget: 'Vidjetni olib tashlash',
    noPinnedWidgets: 'Biriktirilgan vidjetlar yo‘q',
    heatmapLayer: 'Issiqlik qatlami',
    serviceRadius: '3.5 km radius',
    metricOrders: 'Buyurtmalar',
    metricRevenue: 'Tushum',
    metricAvgCheck: 'O‘rtacha chek',
    metricDeliveryMargin: 'Yetkazish marjasi',
    ordersShort: 'buy.',
    total: 'Jami',
    noData: 'Grafik uchun ma’lumot yo‘q',
    noPositiveValues: 'Musbat qiymatlar yo‘q',
    primaryForecast: 'Fakt / Prognoz',
    planLimit: 'Limit / Reja',
    pool: 'Byudjet puli',
    branch: 'Filial',
    roi: 'ROI',
    score: 'Indeks',
    current: 'Joriy',
    aiBudget: 'AI-byudjet',
    delta: 'Δ',
    categories: {
      ops: 'Restoran operatsiyalari',
      audit: 'Keys #26: Xarajatlar auditi',
      budget: 'Keys #25: Byudjet va What-If',
      branches: 'Keys #24: Filiallar byudjeti',
      geo: 'Toshkent geo-tahlili',
      ui: 'Ekranlar va AI-dashboardlar',
    },
  },
  en: {
    title: 'UzBite AI Assistant',
    subtitle: 'Restaurant operations, financial audit, budgets, Tashkent geo-map, and screen control',
    badge: 'AI',
    copilotPill: 'AI Chat · Gemini 3.8',
    modelLabel: 'Model',
    groundedBadge: 'Data Grounded',
    heuristicBadge: 'Fast Estimate',
    send: 'Send',
    thinking: 'AI is analyzing live data…',
    clearChat: 'Clear chat',
    openFullChat: 'Open AI Chat',
    closeDrawer: 'Collapse',
    toolsDrawer: 'MCP Tools',
    runTool: 'Run tool',
    runningTool: 'Running…',
    toolTraces: 'Tool traces',
    pinToDashboard: 'Pin to Dashboard',
    pinnedToDashboard: 'Pinned',
    unpin: 'Unpin',
    inputPlaceholder: 'Ask about orders, kitchen, expenses, budgets, Tashkent districts, or build a dashboard…',
    drawerPlaceholder: 'Quick question for AI Assistant…',
    shortcutHint: 'Ctrl+K / Alt+A',
    currentScreen: 'Active screen',
    helpful: 'Helpful',
    notHelpful: 'Inaccurate',
    feedbackSent: 'Feedback sent',
    emptyStateTitle: 'How can I help your restaurant right now?',
    emptyStateDesc: 'Ask anything or pick a preset scenario — the assistant builds charts, the Tashkent 12-district map, and 1-click actions.',
    customDashboards: 'AI Dashboards',
    defaultDashboard: 'Default',
    pinnedWidgets: 'Pinned widgets',
    renameDashboard: 'Rename',
    deleteDashboard: 'Delete',
    removeWidget: 'Remove widget',
    noPinnedWidgets: 'No pinned widgets yet',
    heatmapLayer: 'Heatmap Grid',
    serviceRadius: '3.5km Coverage',
    metricOrders: 'Orders',
    metricRevenue: 'Revenue',
    metricAvgCheck: 'Avg Check',
    metricDeliveryMargin: 'Delivery Margin',
    ordersShort: 'ord',
    total: 'Total',
    noData: 'No chart data',
    noPositiveValues: 'No positive values',
    primaryForecast: 'Actual / Forecast',
    planLimit: 'Limit / Plan',
    pool: 'Pool',
    branch: 'Branch',
    roi: 'ROI',
    score: 'Score',
    current: 'Current',
    aiBudget: 'AI Budget',
    delta: 'Δ',
    categories: {
      ops: 'Restaurant Operations',
      audit: 'Case #26: Expense Audit',
      budget: 'Case #25: Budgets & What-If',
      branches: 'Case #24: Branch Budgets',
      geo: 'Tashkent Geo Analytics',
      ui: 'Screens & AI Dashboards',
    },
  },
};
