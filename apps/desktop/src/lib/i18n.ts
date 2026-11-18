import type { ExpenseCategory, Language } from '@uzbite/shared';

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  INGREDIENTS: '#f8781d',
  SALARY: '#3b82f6',
  UTILITIES: '#eab308',
  RENT: '#8b5cf6',
  COMMUNICATION: '#06b6d4',
  PACKAGING: '#10b981',
  MARKETING: '#ec4899',
  DELIVERY: '#f97316',
  EQUIPMENT: '#6366f1',
  TAXES: '#ef4444',
  OTHER: '#64748b',
};

export const CATEGORY_LABELS: Record<ExpenseCategory, Record<Language, string>> = {
  INGREDIENTS: { ru: 'Продукты и сырьё', uz: 'Mahsulotlar', en: 'Ingredients' },
  PACKAGING: { ru: 'Упаковка', uz: 'Qadoqlash', en: 'Packaging' },
  SALARY: { ru: 'Зарплата (ФОТ)', uz: 'Ish haqi', en: 'Payroll' },
  RENT: { ru: 'Аренда', uz: 'Ijara', en: 'Rent' },
  UTILITIES: { ru: 'Коммунальные (свет/газ)', uz: 'Kommunal', en: 'Utilities' },
  COMMUNICATION: { ru: 'Связь и интернет', uz: 'Aloqa va internet', en: 'Communication' },
  MARKETING: { ru: 'Маркетинг', uz: 'Marketing', en: 'Marketing' },
  DELIVERY: { ru: 'Доставка', uz: 'Yetkazish', en: 'Delivery' },
  EQUIPMENT: { ru: 'Оборудование', uz: 'Uskunalar', en: 'Equipment' },
  TAXES: { ru: 'Налоги', uz: 'Soliqlar', en: 'Taxes' },
  OTHER: { ru: 'Прочее', uz: 'Boshqa', en: 'Other' },
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
