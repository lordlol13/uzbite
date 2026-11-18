import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Language, McpToolDescriptor } from '@uzbite/shared';
import { restaurantAiApi, type RestaurantAiModelInfo } from '../api/client';
import { AgentBlocks } from '../components/AgentBlocks';
import { Icon, type IconName } from '../components/Icon';
import { useAiWorkspace, type AiChatTurn } from '../store/aiWorkspace';
import { useSession } from '../store/session';

type ScenarioCategory =
  | 'all'
  | 'ops'
  | 'audit26'
  | 'budget25'
  | 'branches24'
  | 'geo'
  | 'control';

interface ScenarioPreset {
  id: string;
  category: Exclude<ScenarioCategory, 'all'>;
  badge: Record<Language, string>;
  title: Record<Language, string>;
  prompt: Record<Language, string>;
  icon: IconName;
}

const CATEGORY_META: Array<{
  id: ScenarioCategory;
  label: Record<Language, string>;
  icon: IconName;
}> = [
  { id: 'all', label: { ru: 'Все сценарии', uz: 'Barchasi', en: 'All' }, icon: 'sparkles' },
  { id: 'ops', label: { ru: 'Операции', uz: 'Operatsiyalar', en: 'Live Ops' }, icon: 'orders' },
  { id: 'audit26', label: { ru: 'Кейс #26 Аудит', uz: '#26 Audit', en: 'Case #26 Audit' }, icon: 'receipt' },
  { id: 'budget25', label: { ru: 'Кейс #25 Бюджет', uz: '#25 Byudjet', en: 'Case #25 Budget' }, icon: 'statistics' },
  { id: 'branches24', label: { ru: 'Кейс #24 Филиалы', uz: '#24 Filiallar', en: 'Case #24 Branches' }, icon: 'restaurant' },
  { id: 'geo', label: { ru: 'Карта Ташкента', uz: 'Toshkent xaritasi', en: 'Tashkent Geo' }, icon: 'map' },
  { id: 'control', label: { ru: 'Экраны и Дашборды', uz: 'Ekranlar va Panellar', en: 'UI & Dashboards' }, icon: 'dashboard' },
];

const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'ops-live',
    category: 'ops',
    icon: 'orders',
    badge: { ru: 'Операции', uz: 'Operatsiya', en: 'Live Ops' },
    title: {
      ru: 'Пульс кухни, заказов, оплат и курьеров',
      uz: 'Oshxona, buyurtma, to‘lov va kuryerlar pulsi',
      en: 'Live kitchen, orders, payments & couriers',
    },
    prompt: {
      ru: 'Сделай живую сводку операций ресторана: новые и активные заказы, кухня, оплаты на проверке, загрузка курьеров и топ-блюда',
      uz: 'Restoranning jonli operatsion xulosasini ber: yangi va faol buyurtmalar, oshxona, kutilayotgan to‘lovlar, kuryerlar yuklamasi va top taomlar',
      en: 'Give a live summary of restaurant operations: pending/active orders, kitchen queue, payment confirmations, courier load, and top dishes',
    },
  },
  {
    id: 'ops-menu',
    category: 'ops',
    icon: 'dish',
    badge: { ru: 'Меню и маржа', uz: 'Menyu va marja', en: 'Menu & Margin' },
    title: {
      ru: 'Топ-блюда, стоп-лист и Food Cost',
      uz: 'Top taomlar, stop-list va Food Cost',
      en: 'Top dishes, stop-list & Food Cost',
    },
    prompt: {
      ru: 'Проанализируй топ-блюда по выручке, позиции в стоп-листе и маржинальность меню — что оптимизировать сегодня?',
      uz: 'Daromad bo‘yicha top taomlar, stop-listdagi pozitsiyalar va menyu marjasini tahlil qil — bugun nimani optimallashtirish kerak?',
      en: 'Analyze top dishes by revenue, unavailable items, and menu margins — what should we optimize today?',
    },
  },
  {
    id: 'audit-26',
    category: 'audit26',
    icon: 'receipt',
    badge: { ru: 'Кейс #26', uz: '#26 Keys', en: 'Case #26' },
    title: {
      ru: 'Аудит ошибок учёта, дубликатов и экономии',
      uz: 'Hisob xatolari, dublikatlar va tejamkorlik auditi',
      en: 'Audit accounting errors, duplicates & savings',
    },
    prompt: {
      ru: 'Найди ошибки учёта, дубликаты счетов, расхождения сумм и способы сократить расходы на коммуналку и связь (с кнопками 1-клик исправления)',
      uz: 'Hisob xatolari, dublikat hisob-fakturalar, summa farqlari hamda kommunal va aloqa xarajatlarini qisqartirish yo‘llarini top',
      en: 'Find accounting errors, duplicate invoices, amount mismatches, and ways to cut utility & admin costs with 1-click fixes',
    },
  },
  {
    id: 'budget-25',
    category: 'budget25',
    icon: 'statistics',
    badge: { ru: 'Кейс #25', uz: '#25 Keys', en: 'Case #25' },
    title: {
      ru: 'Контроль бюджета и дата пробоя лимита',
      uz: 'Byudjet nazorati va limitdan oshish sanasi',
      en: 'Budget variance & breach date forecast',
    },
    prompt: {
      ru: 'Какие статьи расходов превысят бюджет до конца месяца, на какую дату прогнозируется пробой и какие поставщики создают перерасход?',
      uz: 'Oy oxirigacha qaysi xarajat moddalari byudjetdan oshib ketadi, proboy sanasi qachon va qaysi yetkazib beruvchilar sababchi?',
      en: 'Which expense categories will breach their budget limits this month, what is the projected breach date, and what drives the overrun?',
    },
  },
  {
    id: 'whatif-25',
    category: 'budget25',
    icon: 'sliders',
    badge: { ru: 'What-If #25', uz: 'What-If #25', en: 'What-If #25' },
    title: {
      ru: 'Стресс-тест: тарифы +20% и сырьё +10%',
      uz: 'Stress-test: tarif +20% va xomashyo +10%',
      en: 'Stress test: +20% tariffs & +10% ingredients',
    },
    prompt: {
      ru: 'Смоделируй What-If стресс-тест: рост тарифов на электроэнергию и воду +20% и инфляция цен на сырьё +10% — как изменится прибыль?',
      uz: 'What-If stress-testini hisobla: elektr va suv tarifi +20% va mahsulot narxi +10% oshsa sof foyda qanday o‘zgaradi?',
      en: 'Run a What-If stress test: +20% utility tariff hike and +10% ingredient inflation — how does net profit change?',
    },
  },
  {
    id: 'branches-24',
    category: 'branches24',
    icon: 'restaurant',
    badge: { ru: 'Кейс #24', uz: '#24 Keys', en: 'Case #24' },
    title: {
      ru: 'Оптимальный бюджет по филиалам (BXM/BXO)',
      uz: 'Filiallar bo‘yicha optimal byudjet (BXM/BXO)',
      en: 'Optimal branch budget allocation (BXM/BXO)',
    },
    prompt: {
      ru: 'Распредели 120 млн UZS оптимально между филиалами по ROI, спросу и дисциплине бюджета (модель сети филиалов BXM/BXO) с кнопкой применения',
      uz: '120 mln so‘m byudjetni ROI, talab va byudjet intizomi bo‘yicha filiallar (BXM/BXO modeli) o‘rtasida optimal taqsimla',
      en: 'Optimally allocate 120M UZS across all branches by ROI, demand, and budget discipline (BXM/BXO network model) with 1-click apply',
    },
  },
  {
    id: 'geo-tashkent',
    category: 'geo',
    icon: 'map',
    badge: { ru: 'Гео · 12 районов', uz: 'Geo · 12 tuman', en: 'Geo · 12 Districts' },
    title: {
      ru: 'Карта Ташкента, ~500m heatmap и зоны 3.5 км',
      uz: 'Toshkent xaritasi, ~500m heatmap va 3.5 km zona',
      en: 'Tashkent map, ~500m heatmap & 3.5km zones',
    },
    prompt: {
      ru: 'Покажи интерактивную карту 12 районов Ташкента с ~500m тепловой картой заказов, зонами охвата 3.5 км и районами убыточной доставки',
      uz: 'Toshkentning 12 tumani interaktiv xaritasi, ~500m buyurtmalar heatmapi, 3.5 km qamrov zonasi va zararli yetkazish tumanlarini ko‘rsat',
      en: 'Show the interactive 12-district Tashkent map with ~500m order heatmap, 3.5km coverage radii, and loss-making delivery districts',
    },
  },
  {
    id: 'control-dashboard',
    category: 'control',
    icon: 'dashboard',
    badge: { ru: 'Дашборд', uz: 'Dashboard', en: 'Dashboard' },
    title: {
      ru: 'Собрать кастомный дашборд по расходам и доставке',
      uz: 'Xarajat va yetkazish bo‘yicha maxsus dashboard',
      en: 'Build a custom ops & cost dashboard',
    },
    prompt: {
      ru: 'Создай кастомный дашборд по коммунальным расходам, бюджетам и карте спроса Ташкента и открой его',
      uz: 'Kommunal xarajatlar, byudjet va Toshkent talab xaritasi bo‘yicha maxsus dashboard yarat va och',
      en: 'Create a custom dashboard for utilities, budgets, and the Tashkent demand map and open it',
    },
  },
  {
    id: 'control-nav',
    category: 'control',
    icon: 'zap',
    badge: { ru: 'Навигация', uz: 'Navigatsiya', en: 'UI Control' },
    title: {
      ru: 'Открыть нужный раздел и закрепить виджет',
      uz: 'Kerakli bo‘limni ochish va vidjet biriktirish',
      en: 'Navigate screens & pin key widget',
    },
    prompt: {
      ru: 'Что сейчас критичнее всего: проверь заказы и оплаты, предложи быстрые переходы по разделам UzBite Restaurant',
      uz: 'Hozir eng muhimi nima: buyurtma va to‘lovlarni tekshir hamda UzBite Restaurant bo‘limlariga tezkor o‘tishlarni taklif qil',
      en: 'What is most urgent right now: check orders and payments, and provide quick navigation actions across UzBite Restaurant',
    },
  },
];

const FALLBACK_MODELS: RestaurantAiModelInfo[] = [
  { id: 'gemini-3-8-flash', displayName: 'Gemini 3.8 Flash', ownedBy: 'google', freeTier: true, tools: true },
  { id: 'deepseek-v4-1-flash-1017', displayName: 'DeepSeek V4.1 Flash', ownedBy: 'deepseek', freeTier: true, tools: true },
  { id: 'gpt-6-luna', displayName: 'GPT-6 Luna', ownedBy: 'openai', freeTier: true, tools: true },
];

const TOOL_CATEGORY_LABELS: Record<McpToolDescriptor['category'], Record<Language, string>> = {
  restaurant_ops: { ru: 'Операции ресторана', uz: 'Restoran operatsiyalari', en: 'Restaurant Ops' },
  point_26: { ru: 'Кейс #26 Аудит', uz: '#26 Audit', en: 'Case #26 Audit' },
  point_25: { ru: 'Кейс #25 Бюджет', uz: '#25 Byudjet', en: 'Case #25 Budget' },
  point_24: { ru: 'Кейс #24 Филиалы', uz: '#24 Filiallar', en: 'Case #24 Branches' },
  geo_map: { ru: 'Гео Ташкент', uz: 'Toshkent Geo', en: 'Tashkent Geo' },
  ui_control: { ru: 'Управление UI', uz: 'UI Boshqaruvi', en: 'UI Control' },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function ToolTraceAccordion({
  turn,
  lang,
}: {
  turn: AiChatTurn;
  lang: Language;
}) {
  const [open, setOpen] = useState(false);
  const traces = turn.response?.toolTraces ?? [];
  if (traces.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
      >
        <Icon name="sliders" size={12} />
        <span>
          {lang === 'uz'
            ? `MCP chaqiruvlari: ${traces.length}`
            : lang === 'ru'
              ? `Трассировка MCP: ${traces.length}`
              : `MCP Traces: ${traces.length}`}
        </span>
        <Icon
          name="chevronDown"
          size={12}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-2 grid gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
          {traces.map((tr, idx) => (
            <div
              key={`${tr.tool}-${idx}`}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-[var(--surface)] px-2.5 py-2 text-[11px]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <code className="font-extrabold text-[var(--accent)]">{tr.tool}</code>
                  <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--muted)] tabular-nums">
                    {tr.durationMs} ms
                  </span>
                </div>
                <div className="mt-0.5 text-[var(--muted)]">{tr.summary}</div>
              </div>
              {Object.keys(tr.args ?? {}).length > 0 && (
                <code className="max-w-full truncate rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                  {JSON.stringify(tr.args)}
                </code>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiChatPage() {
  const { restaurant, config } = useSession();
  const navigate = useNavigate();
  const {
    turns,
    busy,
    actionBusyKey,
    statusBanner,
    selectedModel,
    setSelectedModel,
    customDashboards,
    pinnedBlocks,
    days,
    setDays,
    month,
    askQuestion,
    executeAction,
    rateTurn,
    clearConversation,
    dismissStatusBanner,
    pinBlock,
  } = useAiWorkspace();

  const lang = config.language;
  const [input, setInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<ScenarioCategory>('all');
  const [showMcpDrawer, setShowMcpDrawer] = useState(false);
  const [showPresetsBar, setShowPresetsBar] = useState(false);
  const [runningToolName, setRunningToolName] = useState<string | null>(null);
  const [toolOutput, setToolOutput] = useState<{
    tool: string;
    durationMs: number;
    data: unknown;
    error?: string;
  } | null>(null);

  const streamEndRef = useRef<HTMLDivElement | null>(null);

  const modelsQuery = useQuery({
    queryKey: ['restaurant-ai-models'],
    queryFn: restaurantAiApi.getModels,
    staleTime: 60_000,
    retry: 1,
  });

  const toolsQuery = useQuery({
    queryKey: ['restaurant-ai-tools'],
    queryFn: restaurantAiApi.getTools,
    staleTime: 60_000,
    retry: 1,
  });

  const modelOptions = useMemo<RestaurantAiModelInfo[]>(() => {
    const raw = modelsQuery.data?.models?.length ? modelsQuery.data.models : FALLBACK_MODELS;
    const hasDefault = raw.some(m => m.id === 'gemini-3-8-flash');
    const list = hasDefault
      ? raw
      : [FALLBACK_MODELS[0], ...raw];
    return [...list].sort((a, b) => {
      if (a.id === 'gemini-3-8-flash') return -1;
      if (b.id === 'gemini-3-8-flash') return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [modelsQuery.data]);

  const activeModelMeta =
    modelOptions.find(m => m.id === selectedModel) ?? modelOptions[0] ?? FALLBACK_MODELS[0];

  const filteredPresets = useMemo(() => {
    if (activeCategory === 'all') return SCENARIO_PRESETS;
    return SCENARIO_PRESETS.filter(p => p.category === activeCategory);
  }, [activeCategory]);

  const groupedTools = useMemo(() => {
    const tools = toolsQuery.data ?? [];
    const groups = new Map<McpToolDescriptor['category'], McpToolDescriptor[]>();
    for (const tool of tools) {
      const list = groups.get(tool.category) ?? [];
      list.push(tool);
      groups.set(tool.category, list);
    }
    return Array.from(groups.entries());
  }, [toolsQuery.data]);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, busy]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = input.trim();
    if (!clean || busy) return;
    setInput('');
    setShowPresetsBar(false);
    await askQuestion(clean);
  }

  async function handleRunTool(tool: McpToolDescriptor) {
    if (runningToolName) return;
    setRunningToolName(tool.name);
    const started = performance.now();
    try {
      const now = new Date();
      const to = now.toISOString().slice(0, 10);
      const from = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
      const res = await restaurantAiApi.callTool({
        name: tool.name,
        arguments: {},
        from,
        to,
        month,
      });
      setToolOutput({
        tool: res.tool,
        durationMs: Math.round(performance.now() - started),
        data: res.result,
      });
    } catch (err) {
      setToolOutput({
        tool: tool.name,
        durationMs: Math.round(performance.now() - started),
        data: null,
        error: err instanceof Error ? err.message : 'Tool execution failed',
      });
    } finally {
      setRunningToolName(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-4">
      {/* Flagship Command Header */}
      <div className="card relative overflow-hidden p-5">
        <div
          className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />

        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-start gap-3.5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, #ff8528, #e85d0c)' }}
            >
              <Icon name="sparkles" size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-lg font-extrabold tracking-tight">
                  {lang === 'uz'
                    ? 'UzBite AI Yordamchi'
                    : lang === 'ru'
                      ? 'AI-Ассистент UzBite'
                      : 'UzBite AI Assistant'}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/35 bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-extrabold text-[var(--accent)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  {activeModelMeta.displayName}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--good-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--good)]">
                  <Icon name="check" size={12} />
                  {lang === 'uz' ? 'Grounded · Live DB' : lang === 'ru' ? 'Grounded · Живые данные' : 'Grounded · Live DB'}
                </span>
              </div>
              <p className="mt-1 mb-0 text-xs leading-relaxed text-[var(--muted)]">
                {lang === 'uz'
                  ? `${restaurant?.name ?? 'Restoran'} · Jonli operatsiyalar, #24–#26 moliya auditi, 12 tuman xaritasi va 1-bosishda boshqaruv.`
                  : lang === 'ru'
                    ? `${restaurant?.name ?? 'Ресторан'} · Живые операции, кейсы #24–#26, карта 12 районов Ташкента, генерация дашбордов и 1-клик действия.`
                    : `${restaurant?.name ?? 'Restaurant'} · Live ops, Cases #24–#26 finance control, 12-district Tashkent map, custom dashboards & 1-click actions.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Model Selector */}
            <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] font-bold">
              <Icon name="bot" size={14} className="shrink-0 text-[var(--accent)]" />
              <select
                aria-label="AI Model"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="bg-transparent text-xs font-extrabold text-[var(--text)] outline-none"
              >
                {modelOptions.map(m => (
                  <option key={m.id} value={m.id} className="bg-[var(--surface)] text-[var(--text)]">
                    {m.displayName} ({m.id})
                  </option>
                ))}
              </select>
            </label>

            {/* Period Pill */}
            <div className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-bold">
              {[7, 30, 60, 90].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1.5 tabular-nums transition ${
                    days === d ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* MCP Tools Toggle */}
            <button
              type="button"
              onClick={() => setShowMcpDrawer(v => !v)}
              className={`min-h-0 px-3 py-2 text-xs ${
                showMcpDrawer ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              <Icon name="sliders" size={14} />
              <span>
                MCP ({toolsQuery.data?.length ?? 10})
              </span>
            </button>

            {/* Quick Presets Toggle when conversation active */}
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPresetsBar(v => !v)}
                className="btn-secondary min-h-0 px-3 py-2 text-xs"
              >
                <Icon name="zap" size={14} />
                <span>{lang === 'uz' ? 'Ssenariylar' : lang === 'ru' ? 'Сценарии' : 'Scenarios'}</span>
              </button>
            )}

            {/* Clear Chat */}
            <button
              type="button"
              disabled={turns.length === 0 || busy}
              onClick={clearConversation}
              className="btn-secondary min-h-0 px-3 py-2 text-xs"
              title={lang === 'uz' ? 'Suhbatni tozalash' : lang === 'ru' ? 'Очистить чат' : 'Clear chat'}
            >
              <Icon name="trash" size={14} />
              <span className="hidden sm:inline">
                {lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить' : 'Clear'}
              </span>
            </button>
          </div>
        </div>

        {/* Workspace Quick Context Strip */}
        {(pinnedBlocks.length > 0 || customDashboards.length > 0) && (
          <div className="relative mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-[11px]">
            <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
              <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-2)] px-2 py-1 font-bold text-[var(--text)]">
                <Icon name="pin" size={12} className="text-[var(--accent)]" />
                {lang === 'uz'
                  ? `Biriktirilgan: ${pinnedBlocks.length}`
                  : lang === 'ru'
                    ? `Закреплено виджетов: ${pinnedBlocks.length}`
                    : `Pinned widgets: ${pinnedBlocks.length}`}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-2)] px-2 py-1 font-bold text-[var(--text)]">
                <Icon name="dashboard" size={12} className="text-[var(--accent)]" />
                {lang === 'uz'
                  ? `Maxsus panellar: ${customDashboards.length}`
                  : lang === 'ru'
                    ? `Кастомные дашборды: ${customDashboards.length}`
                    : `Custom dashboards: ${customDashboards.length}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-1 font-extrabold text-[var(--accent)] hover:underline"
            >
              <span>
                {lang === 'uz'
                  ? 'Dashboardga o‘tish'
                  : lang === 'ru'
                    ? 'Открыть на Главной'
                    : 'View on Dashboard'}
              </span>
              <Icon name="chevron" size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Live MCP Tools Drawer */}
      {showMcpDrawer && (
        <div className="card grid gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Icon name="sliders" size={16} className="text-[var(--accent)]" />
                <h2 className="m-0 text-sm font-extrabold">
                  {lang === 'uz'
                    ? 'Jonli MCP vositalari (Model Context Protocol)'
                    : lang === 'ru'
                      ? 'Живые MCP-инструменты (Model Context Protocol)'
                      : 'Live MCP Tools (Model Context Protocol)'}
                </h2>
              </div>
              <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
                {lang === 'uz'
                  ? 'Istalgan vositani darhol ishga tushiring va jonli JSON natijasini ko‘ring.'
                  : lang === 'ru'
                    ? 'Запустите любой инструмент напрямую по данным ресторана и посмотрите живой результат.'
                    : 'Execute any tool directly against live restaurant data and inspect its output.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMcpDrawer(false)}
              className="btn-secondary min-h-0 px-2.5 py-1.5 text-xs"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {toolsQuery.isLoading ? (
            <div className="text-xs text-[var(--muted)]">
              {lang === 'ru' ? 'Загрузка MCP-инструментов…' : 'Loading MCP tools…'}
            </div>
          ) : (
            <div className="grid gap-4">
              {groupedTools.map(([category, tools]) => (
                <div key={category} className="grid gap-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                    {TOOL_CATEGORY_LABELS[category]?.[lang] ?? category}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {tools.map(tool => {
                      const isRunning = runningToolName === tool.name;
                      return (
                        <div
                          key={tool.name}
                          className="flex flex-col justify-between gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <code className="truncate text-xs font-extrabold text-[var(--accent)]">
                                {tool.name}
                              </code>
                              <span className="shrink-0 rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--muted)]">
                                {tool.category}
                              </span>
                            </div>
                            <p className="mt-1 mb-0 text-[11px] leading-relaxed text-[var(--muted)]">
                              {tool.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={Boolean(runningToolName)}
                              onClick={() => void handleRunTool(tool)}
                              className="btn-secondary min-h-0 px-2.5 py-1.5 text-[11px]"
                            >
                              <Icon name="zap" size={12} className="text-[var(--accent)]" />
                              <span>
                                {isRunning
                                  ? lang === 'ru'
                                    ? 'Выполнение…'
                                    : 'Running…'
                                  : lang === 'uz'
                                    ? 'Vositani ishga tushirish'
                                    : lang === 'ru'
                                      ? 'Запустить инструмент'
                                      : 'Run Tool'}
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setShowMcpDrawer(false);
                                void askQuestion(
                                  lang === 'uz'
                                    ? `${tool.name} vositasini ishga tushir va natijani tahlil qilib ber`
                                    : lang === 'ru'
                                      ? `Запусти инструмент ${tool.name} и объясни ключевые выводы с визуализацией`
                                      : `Run ${tool.name} and explain key findings with visual blocks`,
                                );
                              }}
                              className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                            >
                              {lang === 'uz'
                                ? 'Chatda tahlil →'
                                : lang === 'ru'
                                  ? 'Спросить AI →'
                                  : 'Ask AI →'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {toolOutput && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-extrabold text-[var(--accent)]">{toolOutput.tool}</code>
                  <span className="rounded-full bg-[var(--good-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--good)] tabular-nums">
                    {toolOutput.durationMs} ms
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setToolOutput(null)}
                  className="text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
              {toolOutput.error ? (
                <div className="text-xs font-bold text-[var(--bad)]">{toolOutput.error}</div>
              ) : (
                <pre className="m-0 max-h-60 overflow-auto rounded-lg bg-[var(--surface)] p-3 text-[11px] leading-relaxed text-[var(--text)]">
                  {JSON.stringify(toolOutput.data, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Status Banner */}
      {statusBanner && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--good)]/45 bg-[var(--good-soft)] px-4 py-2.5 text-xs font-bold text-[var(--good)]">
          <div className="flex items-center gap-2">
            <Icon name="check" size={15} />
            <span>{statusBanner}</span>
          </div>
          <button
            type="button"
            onClick={dismissStatusBanner}
            className="opacity-75 transition hover:opacity-100"
            aria-label="Close"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Categorized Quick Scenario Deck (always shown when chat is empty, or toggled via Scenarios button) */}
      {(turns.length === 0 || showPresetsBar) && (
        <div className="card grid gap-3.5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_META.map(cat => {
                const active = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${
                      active
                        ? 'bg-[var(--accent)] text-white'
                        : 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]'
                    }`}
                  >
                    <Icon name={cat.icon} size={13} />
                    <span>{cat.label[lang]}</span>
                  </button>
                );
              })}
            </div>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPresetsBar(false)}
                className="text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPresets.map(preset => (
              <button
                key={preset.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setShowPresetsBar(false);
                  void askQuestion(preset.prompt[lang]);
                }}
                className="group flex flex-col justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/40 disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--accent)]">
                    <Icon name={preset.icon} size={12} />
                    {preset.badge[lang]}
                  </span>
                  <Icon
                    name="chevron"
                    size={14}
                    className="text-[var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
                  />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-[var(--text)]">
                    {preset.title[lang]}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--muted)]">
                    {preset.prompt[lang]}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation Stream */}
      <div className="grid gap-4">
        {turns.map(turn => {
          if (turn.role === 'user') {
            return (
              <div key={turn.id} className="flex justify-end">
                <div className="max-w-2xl rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-3 text-xs font-bold text-white shadow-sm">
                  <div className="leading-relaxed whitespace-pre-wrap">{turn.text}</div>
                  <div className="mt-1 text-right text-[10px] font-semibold text-white/75 tabular-nums">
                    {formatTime(turn.createdAt)}
                  </div>
                </div>
              </div>
            );
          }

          const resp = turn.response;
          const isGrounded = resp?.source === 'coarena';

          return (
            <div
              key={turn.id}
              className={`card grid gap-3.5 p-5 ${
                turn.error ? 'border-[var(--bad)]/40 bg-[var(--bad-soft)]/30' : ''
              }`}
            >
              {/* Assistant Meta Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/70 pb-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Icon name="bot" size={14} />
                  </span>
                  <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[10px] font-extrabold text-[var(--text)]">
                    {isGrounded
                      ? `Coarena · ${resp.model}`
                      : resp
                        ? `Deterministic · ${resp.model}`
                        : 'UzBite AI'}
                  </span>
                  {resp && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--good-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--good)]">
                      <Icon name="check" size={11} />
                      Grounded
                    </span>
                  )}
                  {turn.latencyMs !== undefined && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] tabular-nums">
                      {turn.latencyMs} ms
                    </span>
                  )}
                  <span className="text-[10px] font-semibold text-[var(--muted)] tabular-nums">
                    {formatTime(turn.createdAt)}
                  </span>
                </div>

                {/* Coarena Feedback Controls */}
                {resp && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void rateTurn(turn.id, 'up')}
                      aria-label="Helpful"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                        turn.feedback === 'up'
                          ? 'border-[var(--good)] bg-[var(--good-soft)] text-[var(--good)]'
                          : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--good)] hover:text-[var(--good)]'
                      }`}
                    >
                      <Icon name="thumbUp" size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void rateTurn(turn.id, 'down')}
                      aria-label="Not helpful"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                        turn.feedback === 'down'
                          ? 'border-[var(--bad)] bg-[var(--bad-soft)] text-[var(--bad)]'
                          : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--bad)] hover:text-[var(--bad)]'
                      }`}
                    >
                      <Icon name="thumbDown" size={13} />
                    </button>
                    {turn.feedbackStatus && (
                      <span className="text-[10px] font-bold text-[var(--muted)]">
                        {turn.feedbackStatus}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Assistant Insight Text */}
              <div className="text-sm leading-relaxed font-medium whitespace-pre-wrap text-[var(--text)]">
                {turn.text}
              </div>

              {/* Generative UI Blocks */}
              {resp && resp.uiBlocks.length > 0 && (
                <AgentBlocks
                  blocks={resp.uiBlocks}
                  lang={lang}
                  onAction={act => void executeAction(act)}
                  onPinBlock={pinBlock}
                  actionBusyKey={actionBusyKey}
                />
              )}

              {/* Suggested 1-Click Actions */}
              {resp && resp.suggestedActions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)]/70 pt-3">
                  {resp.suggestedActions.map((act, idx) => (
                    <button
                      key={`${act.type}-${idx}`}
                      type="button"
                      disabled={Boolean(actionBusyKey)}
                      onClick={() => void executeAction(act)}
                      className="btn-primary min-h-0 px-3.5 py-2 text-xs"
                    >
                      <Icon name="zap" size={13} />
                      <span>{act.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Expandable MCP Tool Traces */}
              <ToolTraceAccordion turn={turn} lang={lang} />
            </div>
          );
        })}

        {busy && (
          <div className="card flex items-center gap-3 border-[var(--accent)]/40 bg-[var(--accent-soft)]/35 p-4">
            <div className="flex h-8 w-8 shrink-0 animate-pulse items-center justify-center rounded-xl bg-[var(--accent)] text-white">
              <Icon name="sparkles" size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[var(--accent)]">
                {lang === 'uz'
                  ? `${activeModelMeta.displayName} tahlil qilmoqda…`
                  : lang === 'ru'
                    ? `${activeModelMeta.displayName} анализирует данные ресторана…`
                    : `${activeModelMeta.displayName} is analyzing live restaurant data…`}
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                {lang === 'uz'
                  ? 'Jonli buyurtmalar, moliya auditi (#24–#26) va MCP vositalari so‘ralmoqda'
                  : lang === 'ru'
                    ? 'Выполняются MCP-инструменты, проверка заказов, финансов (#24–#26) и гео-аналитики'
                    : 'Running MCP tools, live orders check, finance audit (#24–#26), and geo-analytics'}
              </div>
            </div>
          </div>
        )}

        <div ref={streamEndRef} />
      </div>

      {/* Sticky Command Input */}
      <form
        onSubmit={e => void handleSubmit(e)}
        className="card sticky bottom-2 z-10 flex flex-col gap-2.5 p-3 shadow-md sm:flex-row sm:items-center"
      >
        <div className="relative flex flex-1 items-center">
          <Icon
            name="sparkles"
            size={16}
            className="pointer-events-none absolute left-3 text-[var(--accent)]"
          />
          <input
            id="ai-chat-main-input"
            type="text"
            className="input-field pl-9"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={
              lang === 'uz'
                ? 'Savol yozing: buyurtmalar, audit #26, byudjet #25, filiallar #24, Toshkent xaritasi yoki dashboard…'
                : lang === 'ru'
                  ? 'Спросите AI: заказы, кухня, аудит #26, бюджеты #25, филиалы #24, карта Ташкента или «создай дашборд»…'
                  : 'Ask AI: orders, kitchen, audit #26, budgets #25, branches #24, Tashkent map, or "create dashboard"…'
            }
          />
        </div>
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="btn-primary shrink-0 px-5"
        >
          <Icon name="send" size={15} />
          <span>
            {busy
              ? '…'
              : lang === 'uz'
                ? 'Yuborish'
                : lang === 'ru'
                  ? 'Спросить'
                  : 'Send'}
          </span>
        </button>
      </form>
    </div>
  );
}
