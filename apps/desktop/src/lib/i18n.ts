import type { ExpenseCategory, Language } from '@uzbite/shared';

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  INGREDIENTS: '#ec5180',
  SALARY: '#8172ff',
  UTILITIES: '#ff8a47',
  RENT: '#36b89a',
  COMMUNICATION: '#3b82f6',
  PACKAGING: '#1ea04a',
  MARKETING: '#f472b6',
  DELIVERY: '#f59e0b',
  EQUIPMENT: '#6366f1',
  TAXES: '#d54c4f',
  OTHER: '#71717a',
};

export const CATEGORY_LABELS: Record<ExpenseCategory, Record<Language, string>> = {
  INGREDIENTS: { ru: 'Продукты и сырьё', uz: 'Mahsulotlar', en: 'Ingredients' },
  PACKAGING: { ru: 'Упаковка', uz: 'Qadoqlash', en: 'Packaging' },
  SALARY: { ru: 'Зарплата (ФОТ)', uz: 'Ish haqi', en: 'Payroll' },
  RENT: { ru: 'Аренда', uz: 'Ijara', en: 'Rent' },
  UTILITIES: { ru: 'Электричество и ЖКХ', uz: 'Elektr va kommunal', en: 'Electricity & Utilities' },
  COMMUNICATION: { ru: 'Связь и интернет', uz: 'Aloqa va internet', en: 'Communication' },
  MARKETING: { ru: 'Маркетинг', uz: 'Marketing', en: 'Marketing' },
  DELIVERY: { ru: 'Доставка', uz: 'Yetkazish', en: 'Delivery' },
  EQUIPMENT: { ru: 'Оборудование', uz: 'Uskunalar', en: 'Equipment' },
  TAXES: { ru: 'Налоги и сборы', uz: 'Soliqlar va yig‘imlar', en: 'Taxes & Fees' },
  OTHER: { ru: 'Прочее', uz: 'Boshqa', en: 'Other' },
};

export type ExpenseGroupId = 'ALL' | 'PRIORITY' | 'BASE' | 'ADDITIONAL';

export const PRIORITY_EXPENSE_CATEGORIES: ExpenseCategory[] = ['TAXES', 'UTILITIES', 'COMMUNICATION'];
export const BASE_EXPENSE_CATEGORIES: ExpenseCategory[] = ['INGREDIENTS', 'SALARY', 'RENT'];
export const ADDITIONAL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'PACKAGING',
  'DELIVERY',
  'EQUIPMENT',
  'MARKETING',
  'OTHER',
];

export function getExpenseGroup(category: ExpenseCategory): Exclude<ExpenseGroupId, 'ALL'> {
  if (PRIORITY_EXPENSE_CATEGORIES.includes(category)) return 'PRIORITY';
  if (BASE_EXPENSE_CATEGORIES.includes(category)) return 'BASE';
  return 'ADDITIONAL';
}

export const EXPENSE_GROUP_META: Record<
  ExpenseGroupId,
  {
    label: Record<Language, string>;
    shortLabel: Record<Language, string>;
    description: Record<Language, string>;
    categories: ExpenseCategory[];
    accent: string;
  }
> = {
  ALL: {
    label: { ru: 'Все', uz: 'Barchasi', en: 'All' },
    shortLabel: { ru: 'Все', uz: 'Barchasi', en: 'All' },
    description: {
      ru: 'Все операционные расходы ресторана',
      uz: 'Restoranning barcha operatsion xarajatlari',
      en: 'All restaurant operating expenses',
    },
    categories: [...PRIORITY_EXPENSE_CATEGORIES, ...BASE_EXPENSE_CATEGORIES, ...ADDITIONAL_EXPENSE_CATEGORIES],
    accent: '#09090b',
  },
  PRIORITY: {
    label: {
      ru: 'Налоги и электричество (Приоритет)',
      uz: 'Soliqlar va elektr (Ustuvor)',
      en: 'Taxes & Electricity (Priority)',
    },
    shortLabel: { ru: 'Приоритет', uz: 'Ustuvor', en: 'Priority' },
    description: {
      ru: 'Налоги, электроэнергия (кВт·ч), газ, вода и связь',
      uz: 'Soliqlar, elektr energiyasi (kVt·soat), gaz, suv va aloqa',
      en: 'Taxes, electricity (kWh), gas, water & telecom',
    },
    categories: PRIORITY_EXPENSE_CATEGORIES,
    accent: '#ec5180',
  },
  BASE: {
    label: {
      ru: 'Базовые (Сырьё, ФОТ, Аренда)',
      uz: 'Asosiy (Masalliq, Ish haqi, Ijara)',
      en: 'Base (Ingredients, Payroll, Rent)',
    },
    shortLabel: { ru: 'Базовые', uz: 'Asosiy', en: 'Base' },
    description: {
      ru: 'Продукты и сырьё, зарплата персонала и аренда',
      uz: 'Mahsulotlar, xodimlar ish haqi va ijara',
      en: 'Ingredients, staff payroll, and facility rent',
    },
    categories: BASE_EXPENSE_CATEGORIES,
    accent: '#36b89a',
  },
  ADDITIONAL: {
    label: {
      ru: 'Дополнительные (Упаковка, Доставка, Оборуд., Маркетинг)',
      uz: 'Qo‘shimcha (Qadoqlash, Yetkazish, Uskuna, Marketing)',
      en: 'Additional (Packaging, Delivery, Equip., Marketing)',
    },
    shortLabel: { ru: 'Доп.', uz: 'Qo‘sh.', en: 'Additional' },
    description: {
      ru: 'Упаковка, доставка, техобслуживание, маркетинг и прочее',
      uz: 'Qadoqlash, yetkazish, uskunalar, marketing va boshqalar',
      en: 'Packaging, delivery, equipment, marketing & other',
    },
    categories: ADDITIONAL_EXPENSE_CATEGORIES,
    accent: '#8172ff',
  },
};

export type NavTab =
  | 'dashboard'
  | 'agent'
  | 'audit'
  | 'budgets'
  | 'branches'
  | 'map'
  | 'expenses'
  | 'sales';

export const COPY: Record<Language, {
  appName: string;
  subtitle: string;
  loginTitle: string;
  loginDesc: string;
  email: string;
  password: string;
  signIn: string;
  demoSignIn: string;
  demoHint: string;
  nav: Record<NavTab, string>;
  period7: string;
  period30: string;
  period60: string;
  period90: string;
  periodToday: string;
  periodYesterday: string;
  periodLastWeek: string;
  periodThisMonth: string;
  periodCustom: string;
  dateFrom: string;
  dateTo: string;
  applyRange: string;
  allDates: string;
  activePeriod: string;
  taxes: string;
  electricityUtilities: string;
  priorityBadge: string;
  verified: string;
  unverified: string;
  filteredTotal: string;
  restaurant: string;
  logout: string;
  refresh: string;
  theme: string;
  healthScore: string;
  runAiAudit: string;
  runningAi: string;
  potentialSaving: string;
  errors: string;
  inefficiencies: string;
  risks: string;
  revenue: string;
  netProfit: string;
  totalExpenses: string;
  foodCost: string;
  laborCost: string;
  adminUtility: string;
  orders: string;
  cancelRate: string;
  vsPrev: string;
  margin: string;
  avgCheck: string;
  lost: string;
  revVsExp: string;
  expenseStructure: string;
  paymentSplit: string;
  cash: string;
  card: string;
  unpaidCard: string;
  urgentFindings: string;
  openAudit: string;
  all: string;
  impact: string;
  fixDeleteDup: string;
  fixMismatch: string;
  fixCategory: string;
  aiRecommendations: string;
  expectedSaving: string;
  addExpense: string;
  importCsv: string;
  loadDemoCsv: string;
  ocrExtract: string;
  autoClassify: string;
  classifyConfidence: string;
  save: string;
  cancel: string;
  delete: string;
  supplier: string;
  category: string;
  item: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  amount: string;
  invoice: string;
  date: string;
  source: string;
  search: string;
  budgetPlanActual: string;
  month: string;
  limit: string;
  actual: string;
  forecast: string;
  variance: string;
  status: string;
  updateLimit: string;
  menuEngineering: string;
  dish: string;
  price: string;
  costPrice: string;
  unitMargin: string;
  sold: string;
  profit: string;
  abcClass: string;
  quadrant: string;
  hourlyHeatmap: string;
  exportCsv: string;
  printPdf: string;
  noData: string;
  weekdays: string[];
}> = {
  ru: {
    appName: 'UzBite Business',
    subtitle: 'Аналитика ресторана и AI-финансовый аудит (Кейс #26)',
    loginTitle: 'Вход в UzBite Business',
    loginDesc: 'Полная финансовая аналитика ресторана, контроль бюджетов и AI-поиск ошибок и неэффективных расходов.',
    email: 'Рабочая почта',
    password: 'Пароль',
    signIn: 'Войти',
    demoSignIn: 'Демо-вход владельца (Osh & Olov)',
    demoHint: 'Логин: owner@uzbite.uz · Пароль: UzBiteBusiness2026!',
    nav: {
      dashboard: 'Обзор бизнеса',
      agent: 'AI-Агент (MCP)',
      audit: 'AI-Аудит (#26)',
      budgets: 'Бюджеты (#25)',
      branches: 'Филиалы (#24)',
      map: 'Карта и Районы',
      expenses: 'Расходы и OCR',
      sales: 'Продажи и Меню',
    },
    period7: '7 дней',
    period30: '30 дней',
    period60: '60 дней',
    period90: '90 дней',
    periodToday: 'Сегодня',
    periodYesterday: 'Вчера',
    periodLastWeek: 'Прошлая неделя',
    periodThisMonth: 'Этот месяц',
    periodCustom: 'Даты',
    dateFrom: 'С',
    dateTo: 'По',
    applyRange: 'Применить',
    allDates: 'Все даты',
    activePeriod: 'Период',
    taxes: 'Налоги',
    electricityUtilities: 'Свет и ЖКХ',
    priorityBadge: 'Приоритет',
    verified: 'Проверено',
    unverified: 'На проверке',
    filteredTotal: 'Итого по выборке',
    restaurant: 'Ресторан',
    logout: 'Выйти',
    refresh: 'Обновить',
    theme: 'Тема',
    healthScore: 'Индекс фин. здоровья',
    runAiAudit: 'Обновить AI-отчёт',
    runningAi: 'AI анализирует...',
    potentialSaving: 'Потенциал экономии',
    errors: 'Ошибки учёта',
    inefficiencies: 'Неэффективные траты',
    risks: 'Риски бюджета',
    revenue: 'Выручка',
    netProfit: 'Чистая прибыль',
    totalExpenses: 'Все расходы',
    foodCost: 'Food Cost (Сырьё)',
    laborCost: 'ФОТ / Выручка',
    adminUtility: 'Аренда, свет и связь',
    orders: 'Доставлено заказов',
    cancelRate: 'Доля отмен',
    vsPrev: 'к пред. периоду',
    margin: 'Маржа',
    avgCheck: 'Средний чек',
    lost: 'Упущено',
    revVsExp: 'Выручка, расходы и прибыль по периодам',
    expenseStructure: 'Структура операционных расходов',
    paymentSplit: 'Структура оплат',
    cash: 'Наличные',
    card: 'Карта (перевод)',
    unpaidCard: 'Неподтверждённые CARD-заказы',
    urgentFindings: 'Ключевые находки AI-аудита',
    openAudit: 'Перейти к полному AI-аудиту →',
    all: 'Все',
    impact: 'Финансовый эффект',
    fixDeleteDup: 'Удалить дубликат',
    fixMismatch: 'Исправить сумму',
    fixCategory: 'Исправить категорию',
    aiRecommendations: 'AI-рекомендации по оптимизации',
    expectedSaving: 'Ожидаемая экономия',
    addExpense: '+ Добавить расход',
    importCsv: 'Импорт CSV',
    loadDemoCsv: 'Импортировать демо-CSV',
    ocrExtract: 'AI-разбор накладной (OCR)',
    autoClassify: 'AI-классификация',
    classifyConfidence: 'уверенность',
    save: 'Сохранить',
    cancel: 'Отмена',
    delete: 'Удалить',
    supplier: 'Поставщик',
    category: 'Категория',
    item: 'Позиция',
    description: 'Описание',
    qty: 'Кол-во',
    unit: 'Ед.',
    unitPrice: 'Цена за ед.',
    amount: 'Сумма (UZS)',
    invoice: '№ накладной',
    date: 'Дата',
    source: 'Источник',
    search: 'Поиск по названию, поставщику, накладной...',
    budgetPlanActual: 'Контроль бюджетов: План vs Факт и Прогноз',
    month: 'Месяц',
    limit: 'Лимит (План)',
    actual: 'Факт',
    forecast: 'Прогноз на конец месяца',
    variance: 'Остаток / Перерасход',
    status: 'Статус',
    updateLimit: 'Задать лимит',
    menuEngineering: 'ABC-анализ и матрица маржинальности меню',
    dish: 'Блюдо',
    price: 'Цена',
    costPrice: 'Себестоимость',
    unitMargin: 'Маржа / шт',
    sold: 'Продано',
    profit: 'Прибыль',
    abcClass: 'ABC',
    quadrant: 'Матрица',
    hourlyHeatmap: 'Тепловая карта заказов по дням недели и часам',
    exportCsv: 'Экспорт отчёта (CSV)',
    printPdf: 'Печать / PDF отчёт',
    noData: 'Нет данных за выбранный период',
    weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  },
  uz: {
    appName: 'UzBite Business',
    subtitle: 'Restoran tahlili va AI moliyaviy audit (Keys #26)',
    loginTitle: 'UzBite Business tizimiga kirish',
    loginDesc: 'Restoranning to‘liq moliyaviy tahlili, byudjet nazorati va AI yordamida xatolar hamda samarasiz xarajatlarni aniqlash.',
    email: 'Ish elektron pochtasi',
    password: 'Parol',
    signIn: 'Kirish',
    demoSignIn: 'Demo kirish (Osh & Olov egasi)',
    demoHint: 'Login: owner@uzbite.uz · Parol: UzBiteBusiness2026!',
    nav: {
      dashboard: 'Biznes sharhi',
      agent: 'AI-Agent (MCP)',
      audit: 'AI-Audit (#26)',
      budgets: 'Byudjet (#25)',
      branches: 'Filiallar (#24)',
      map: 'Xarita va Tumanlar',
      expenses: 'Xarajatlar va OCR',
      sales: 'Savdo va Menyu',
    },
    period7: '7 kun',
    period30: '30 kun',
    period60: '60 kun',
    period90: '90 kun',
    periodToday: 'Bugun',
    periodYesterday: 'Kecha',
    periodLastWeek: 'O‘tgan hafta',
    periodThisMonth: 'Shu oy',
    periodCustom: 'Sanalar',
    dateFrom: 'Dan',
    dateTo: 'Gacha',
    applyRange: 'Qo‘llash',
    allDates: 'Barcha sanalar',
    activePeriod: 'Davr',
    taxes: 'Soliqlar',
    electricityUtilities: 'Elektr va kommunal',
    priorityBadge: 'Ustuvor',
    verified: 'Tasdiqlangan',
    unverified: 'Tekshiruvda',
    filteredTotal: 'Tanlov jami',
    restaurant: 'Restoran',
    logout: 'Chiqish',
    refresh: 'Yangilash',
    theme: 'Mavzu',
    healthScore: 'Moliyaviy salomatlik',
    runAiAudit: 'AI-hisobotni yangilash',
    runningAi: 'AI tahlil qilmoqda...',
    potentialSaving: 'Tejamkorlik salohiyati',
    errors: 'Hisob xatolari',
    inefficiencies: 'Samarasiz xarajatlar',
    risks: 'Byudjet xavflari',
    revenue: 'Tushum',
    netProfit: 'Sof foyda',
    totalExpenses: 'Jami xarajatlar',
    foodCost: 'Food Cost (Masalliq)',
    laborCost: 'Ish haqi / Tushum',
    adminUtility: 'Ijara, elektr va aloqa',
    orders: 'Yetkazilgan buyurtmalar',
    cancelRate: 'Bekor qilish ulushi',
    vsPrev: 'avvalgi davrga nisbatan',
    margin: 'Marja',
    avgCheck: 'O‘rtacha chek',
    lost: 'Yo‘qotilgan',
    revVsExp: 'Tushum, xarajatlar va foyda dinamikasi',
    expenseStructure: 'Operatsion xarajatlar tarkibi',
    paymentSplit: 'To‘lov turlari',
    cash: 'Naqd pul',
    card: 'Karta (o‘tkazma)',
    unpaidCard: 'Tasdiqlanmagan CARD buyurtmalar',
    urgentFindings: 'AI-auditning asosiy topilmalari',
    openAudit: 'To‘liq AI-auditga o‘tish →',
    all: 'Barchasi',
    impact: 'Moliyaviy ta’sir',
    fixDeleteDup: 'Dublikatni o‘chirish',
    fixMismatch: 'Summani tuzatish',
    fixCategory: 'Toifani tuzatish',
    aiRecommendations: 'AI optimallashtirish tavsiyalari',
    expectedSaving: 'Kutilayotgan tejamkorlik',
    addExpense: '+ Xarajat qo‘shish',
    importCsv: 'CSV yuklash',
    loadDemoCsv: 'Demo-CSV yuklash',
    ocrExtract: 'AI hisob-faktura tahlili (OCR)',
    autoClassify: 'AI-tasniflash',
    classifyConfidence: 'ishonch',
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    delete: 'O‘chirish',
    supplier: 'Yetkazib beruvchi',
    category: 'Toifa',
    item: 'Mahsulot / xizmat',
    description: 'Tavsif',
    qty: 'Miqdor',
    unit: 'Birlik',
    unitPrice: 'Birlik narxi',
    amount: 'Summa (UZS)',
    invoice: 'Hisob-faktura №',
    date: 'Sana',
    source: 'Manba',
    search: 'Nomi, yetkazib beruvchi, hisob-faktura bo‘yicha qidirish...',
    budgetPlanActual: 'Byudjet nazorati: Reja vs Fakt va Prognoz',
    month: 'Oy',
    limit: 'Limit (Reja)',
    actual: 'Fakt',
    forecast: 'Oy oxiri prognozi',
    variance: 'Qoldiq / Ortiqcha',
    status: 'Holat',
    updateLimit: 'Limitni saqlash',
    menuEngineering: 'ABC-tahlil va menyu rentabellik matritsasi',
    dish: 'Taom',
    price: 'Narx',
    costPrice: 'Tannarx',
    unitMargin: 'Foyda / dona',
    sold: 'Sotildi',
    profit: 'Foyda',
    abcClass: 'ABC',
    quadrant: 'Matritsa',
    hourlyHeatmap: 'Hafta kunlari va soatlar bo‘yicha buyurtmalar xaritasi',
    exportCsv: 'Hisobotni yuklash (CSV)',
    printPdf: 'Chop etish / PDF',
    noData: 'Tanlangan davr uchun ma’lumot yo‘q',
    weekdays: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  },
  en: {
    appName: 'UzBite Business',
    subtitle: 'Restaurant Analytics & AI Financial Audit (Case #26)',
    loginTitle: 'Sign in to UzBite Business',
    loginDesc: 'Full restaurant P&L analytics, budget control, and AI detection of accounting errors & inefficient operating expenses.',
    email: 'Business email',
    password: 'Password',
    signIn: 'Sign in',
    demoSignIn: 'Demo Owner Login (Osh & Olov)',
    demoHint: 'Email: owner@uzbite.uz · Password: UzBiteBusiness2026!',
    nav: {
      dashboard: 'Overview',
      agent: 'AI Agent (MCP)',
      audit: 'AI Audit (#26)',
      budgets: 'Budgets (#25)',
      branches: 'Branches (#24)',
      map: 'Map & Districts',
      expenses: 'Expenses & OCR',
      sales: 'Sales & Menu',
    },
    period7: '7 days',
    period30: '30 days',
    period60: '60 days',
    period90: '90 days',
    periodToday: 'Today',
    periodYesterday: 'Yesterday',
    periodLastWeek: 'Last week',
    periodThisMonth: 'This month',
    periodCustom: 'Dates',
    dateFrom: 'From',
    dateTo: 'To',
    applyRange: 'Apply',
    allDates: 'All dates',
    activePeriod: 'Period',
    taxes: 'Taxes',
    electricityUtilities: 'Electricity & Utilities',
    priorityBadge: 'Priority',
    verified: 'Verified',
    unverified: 'Unverified',
    filteredTotal: 'Filtered Total',
    restaurant: 'Restaurant',
    logout: 'Sign out',
    refresh: 'Refresh',
    theme: 'Theme',
    healthScore: 'Financial Health Score',
    runAiAudit: 'Run AI Report',
    runningAi: 'AI analyzing...',
    potentialSaving: 'Savings Potential',
    errors: 'Accounting Errors',
    inefficiencies: 'Inefficient Spend',
    risks: 'Budget Risks',
    revenue: 'Revenue',
    netProfit: 'Net Profit',
    totalExpenses: 'Total Expenses',
    foodCost: 'Food Cost',
    laborCost: 'Labor / Revenue',
    adminUtility: 'Rent, Utilities & Telecom',
    orders: 'Delivered Orders',
    cancelRate: 'Cancel Rate',
    vsPrev: 'vs prev period',
    margin: 'Margin',
    avgCheck: 'Avg Order',
    lost: 'Lost',
    revVsExp: 'Revenue, Expenses & Profit Trend',
    expenseStructure: 'Operating Expense Breakdown',
    paymentSplit: 'Payment Mix',
    cash: 'Cash',
    card: 'Card Transfer',
    unpaidCard: 'Unconfirmed CARD Orders',
    urgentFindings: 'Top AI Financial Findings',
    openAudit: 'Open Full AI Audit →',
    all: 'All',
    impact: 'Financial Impact',
    fixDeleteDup: 'Delete Duplicate',
    fixMismatch: 'Fix Amount',
    fixCategory: 'Fix Category',
    aiRecommendations: 'AI Cost Optimization Recommendations',
    expectedSaving: 'Expected Saving',
    addExpense: '+ Add Expense',
    importCsv: 'Import CSV',
    loadDemoCsv: 'Import Demo CSV',
    ocrExtract: 'AI Invoice Extractor (OCR)',
    autoClassify: 'AI Classify',
    classifyConfidence: 'confidence',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    supplier: 'Supplier',
    category: 'Category',
    item: 'Item',
    description: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Unit Price',
    amount: 'Amount (UZS)',
    invoice: 'Invoice #',
    date: 'Date',
    source: 'Source',
    search: 'Search item, supplier, invoice...',
    budgetPlanActual: 'Budget Control: Plan vs Actual & Forecast',
    month: 'Month',
    limit: 'Monthly Limit',
    actual: 'Actual',
    forecast: 'Month-End Forecast',
    variance: 'Remaining / Overrun',
    status: 'Status',
    updateLimit: 'Save Limit',
    menuEngineering: 'ABC Analysis & Menu Engineering Matrix',
    dish: 'Dish',
    price: 'Price',
    costPrice: 'Cost Price',
    unitMargin: 'Unit Margin',
    sold: 'Sold',
    profit: 'Profit',
    abcClass: 'ABC',
    quadrant: 'Quadrant',
    hourlyHeatmap: 'Order Intensity Heatmap by Weekday & Hour',
    exportCsv: 'Export CSV Report',
    printPdf: 'Print / PDF Report',
    noData: 'No data in selected period',
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
};

export function fmtMoney(value: number, lang: Language): string {
  const locale = lang === 'uz' ? 'uz-UZ' : lang === 'en' ? 'en-US' : 'ru-RU';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value))} UZS`;
}

export function fmtCompactMoney(value: number, lang: Language): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const suffix = lang === 'en' ? 'M' : 'млн';
    return `${sign}${(abs / 1_000_000).toFixed(1)} ${suffix}`;
  }
  if (abs >= 1_000) {
    const suffix = lang === 'en' ? 'K' : 'тыс';
    return `${sign}${(abs / 1_000).toFixed(0)} ${suffix}`;
  }
  return `${Math.round(value)}`;
}
