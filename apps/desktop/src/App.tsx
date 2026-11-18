import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentClientAction,
  AgentScreenContext,
  AgentUiBlock,
  AiOptimizationReport,
  Language,
  TashkentDistrictId,
  Theme,
} from '@uzbite/shared';
import { AiCopilotDrawer } from './components/AiCopilotDrawer';
import {
  BrandLogoBadge,
  IconBell,
  IconLogOut,
  IconMoon,
  IconRefresh,
  IconSparkles,
  IconSun,
} from './components/DesignWidgets';
import {
  DEFAULT_AGENT_MODEL,
  applyBranchAllocation,
  clearPinnedWidgets,
  clearStoredAuth,
  deleteExpense,
  fetchAgentModels,
  fetchAnalysis,
  fetchBudgets,
  fetchDishes,
  fetchDistrictAnalytics,
  fetchExpenses,
  fetchHeatmap,
  fetchTimeseries,
  loadPinnedWidgets,
  loadStoredAuth,
  normalizeAgentModels,
  removePinnedWidget,
  savePinnedWidget,
  saveStoredAuth,
  sendAgentChat,
  sendAgentFeedback,
  updateExpense,
  type AgentChatTurn,
  type StoredAuth,
} from './lib/api';
import { COPY, fmtCompactMoney, type ExpenseGroupId, type NavTab } from './lib/i18n';
import { AgentPage } from './pages/AgentPage';
import { AuditPage } from './pages/AuditPage';
import { BranchesPage } from './pages/BranchesPage';
import { BudgetsPage } from './pages/BudgetsPage';
import {
  clearAllCustomDashboards,
  createCustomDashboard,
  DashboardPage,
  deleteCustomDashboard,
  loadCustomDashboards,
  removeWidgetFromCustomDashboard,
  renameCustomDashboard,
  updateCustomDashboard,
  type CustomDashboard,
} from './pages/DashboardPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { SalesPage } from './pages/SalesPage';

type PeriodPresetId = 'today' | 'yesterday' | 'last_week' | 'this_month';

type PeriodSelection =
  | { kind: 'days'; days: number }
  | { kind: 'preset'; preset: PeriodPresetId }
  | { kind: 'custom'; from: string; to: string };

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addLocalDays(d: Date, delta: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function resolvePeriodRange(sel: PeriodSelection): { from: string; to: string; days: number } {
  const now = new Date();
  let from: string;
  let to: string;
  if (sel.kind === 'days') {
    to = toYmd(now);
    from = toYmd(addLocalDays(now, -(sel.days - 1)));
    return { from, to, days: sel.days };
  }
  if (sel.kind === 'preset') {
    if (sel.preset === 'today') {
      from = toYmd(now);
      to = from;
    } else if (sel.preset === 'yesterday') {
      from = toYmd(addLocalDays(now, -1));
      to = from;
    } else if (sel.preset === 'last_week') {
      const dow = (now.getDay() + 6) % 7;
      const thisMonday = addLocalDays(now, -dow);
      from = toYmd(addLocalDays(thisMonday, -7));
      to = toYmd(addLocalDays(thisMonday, -1));
    } else {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      to = toYmd(now);
    }
  } else {
    from = sel.from <= sel.to ? sel.from : sel.to;
    to = sel.from <= sel.to ? sel.to : sel.from;
  }
  const diffMs = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  const days = Math.max(1, Math.round(diffMs / 86_400_000) + 1);
  return { from, to, days };
}

function formatShortDateBadge(from: string, to: string): string {
  const fmt = (ymd: string) => {
    const [, m, d] = ymd.split('-');
    return `${d}.${m}`;
  };
  return from === to ? fmt(from) : `${fmt(from)}–${fmt(to)}`;
}

export default function App() {
  const queryClient = useQueryClient();
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<NavTab>('dashboard');
  const [period, setPeriod] = useState<PeriodSelection>({ kind: 'days', days: 30 });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [expensesShowAllDates, setExpensesShowAllDates] = useState(false);
  const [expensesGroupFilter, setExpensesGroupFilter] = useState<ExpenseGroupId>('ALL');
  const [month, setMonth] = useState<string>(() => toYmd(new Date()).slice(0, 7));
  const [selectedDistrictId, setSelectedDistrictId] = useState<TashkentDistrictId | ''>('');
  const [lang, setLang] = useState<Language>('ru');
  const [theme, setTheme] = useState<Theme>('light');
  const [aiReportOverride, setAiReportOverride] = useState<AiOptimizationReport | null>(null);
  const [pinnedBlocks, setPinnedBlocks] = useState<AgentUiBlock[]>([]);
  const [customDashboards, setCustomDashboards] = useState<CustomDashboard[]>([]);
  const [activeCustomDashboardId, setActiveCustomDashboardId] = useState<string | null>(null);
  const [highlightedWidgetId, setHighlightedWidgetId] = useState<string | null>(null);
  const [quickAskInput, setQuickAskInput] = useState('');
  const [dashboardAiBusy, setDashboardAiBusy] = useState(false);
  const [dashboardAiBanner, setDashboardAiBanner] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [agentTurns, setAgentTurns] = useState<AgentChatTurn[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentStatusBanner, setAgentStatusBanner] = useState<string | null>(null);
  const [selectedAgentModel, setSelectedAgentModel] = useState<string>(DEFAULT_AGENT_MODEL);
  const agentTurnsRef = useRef<AgentChatTurn[]>([]);
  const agentInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    agentTurnsRef.current = agentTurns;
  }, [agentTurns]);

  useEffect(() => {
    if (tab === 'agent') {
      setCopilotOpen(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!auth) return;
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const isCtrlK = (e.ctrlKey || e.metaKey) && (key === 'k' || e.code === 'KeyK');
      const isAltA = e.altKey && (key === 'a' || e.code === 'KeyA');
      if (isCtrlK || isAltA) {
        e.preventDefault();
        if (tab === 'agent') {
          agentInputRef.current?.focus();
        } else {
          setCopilotOpen(prev => !prev);
        }
        return;
      }
      if (e.key === 'Escape' && copilotOpen) {
        e.preventDefault();
        setCopilotOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [auth, tab, copilotOpen]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void loadStoredAuth().then(stored => {
      setAuth(stored);
      if (stored?.selectedRestaurantId) {
        setPinnedBlocks(loadPinnedWidgets(stored.selectedRestaurantId));
        setCustomDashboards(loadCustomDashboards(stored.selectedRestaurantId));
      }
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!highlightedWidgetId) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-widget-id="${highlightedWidgetId}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('widget-highlighted');
        setTimeout(() => {
          el.classList.remove('widget-highlighted');
        }, 3200);
      }
      setHighlightedWidgetId(null);
    }, 120);
    return () => clearTimeout(timer);
  }, [highlightedWidgetId, tab]);

  const { from, to, days } = useMemo(() => resolvePeriodRange(period), [period]);
  const defaultMonth = to.slice(0, 7);
  const activeRestaurantId = auth?.selectedRestaurantId ?? '';

  const analysisQuery = useQuery({
    queryKey: ['business-analysis', activeRestaurantId, from, to],
    queryFn: () => fetchAnalysis(from, to),
    enabled: Boolean(auth),
  });

  const timeseriesQuery = useQuery({
    queryKey: ['business-timeseries', activeRestaurantId, from, to, days > 45 ? 'week' : 'day'],
    queryFn: () => fetchTimeseries(from, to, days > 45 ? 'week' : 'day'),
    enabled: Boolean(auth) && analysisQuery.isSuccess && !analysisQuery.data?.timeseries,
  });

  const expensesQuery = useQuery({
    queryKey: [
      'business-expenses',
      activeRestaurantId,
      expensesShowAllDates ? 'all' : 'period',
      expensesShowAllDates ? '' : from,
      expensesShowAllDates ? '' : to,
    ],
    queryFn: () => fetchExpenses(expensesShowAllDates ? {} : { from, to }),
    enabled: Boolean(auth) && tab === 'expenses',
  });

  const budgetsQuery = useQuery({
    queryKey: ['business-budgets', activeRestaurantId, month],
    queryFn: () => fetchBudgets(month),
    enabled: Boolean(auth) && tab === 'budgets' && (!analysisQuery.data?.budgets || month !== defaultMonth),
  });

  const dishesQuery = useQuery({
    queryKey: ['business-dishes', activeRestaurantId, from, to],
    queryFn: () => fetchDishes(from, to),
    enabled: Boolean(auth) && tab === 'sales' && analysisQuery.isSuccess && !analysisQuery.data?.dishes,
  });

  const heatmapQuery = useQuery({
    queryKey: ['business-heatmap', activeRestaurantId, from, to],
    queryFn: () => fetchHeatmap(from, to),
    enabled: Boolean(auth) && tab === 'sales' && analysisQuery.isSuccess && !analysisQuery.data?.heatmap,
  });

  const dashboardGeoQuery = useQuery({
    queryKey: ['business-geo-dashboard', activeRestaurantId, from, to],
    queryFn: () => fetchDistrictAnalytics(from, to, 'all'),
    enabled: Boolean(auth) && tab === 'dashboard',
    staleTime: 60_000,
  });

  const agentModelsQuery = useQuery({
    queryKey: ['agent-models'],
    queryFn: fetchAgentModels,
    enabled: Boolean(auth),
    staleTime: 5 * 60 * 1000,
  });

  const availableAgentModels = useMemo(
    () => normalizeAgentModels(agentModelsQuery.data),
    [agentModelsQuery.data],
  );
  const activeAgentModelInfo = useMemo(
    () => availableAgentModels.find(m => m.id === selectedAgentModel) ?? availableAgentModels[0],
    [availableAgentModels, selectedAgentModel],
  );

  async function refreshAll() {
    setAiReportOverride(null);
    await queryClient.invalidateQueries();
  }

  async function handleRestaurantSwitch(restaurantId: string) {
    if (!auth) return;
    const updated: StoredAuth = { ...auth, selectedRestaurantId: restaurantId };
    await saveStoredAuth(updated);
    setAuth(updated);
    setPinnedBlocks(loadPinnedWidgets(restaurantId));
    setCustomDashboards(loadCustomDashboards(restaurantId));
    setActiveCustomDashboardId(null);
    setAiReportOverride(null);
    setAgentStatusBanner(null);
    await queryClient.invalidateQueries();
  }

  async function handleLogout() {
    await clearStoredAuth();
    setAuth(null);
    setAiReportOverride(null);
    setPinnedBlocks([]);
    setCustomDashboards([]);
    setActiveCustomDashboardId(null);
    setCopilotOpen(false);
    setAgentTurns([]);
    setAgentStatusBanner(null);
    setSelectedAgentModel(DEFAULT_AGENT_MODEL);
    queryClient.clear();
  }

  function handlePinBlock(block: AgentUiBlock) {
    setPinnedBlocks(savePinnedWidget(activeRestaurantId, block));
  }

  function handleUnpinBlock(blockId: string) {
    setPinnedBlocks(removePinnedWidget(activeRestaurantId, blockId));
  }

  function handleRenameCustomDashboard(id: string, title: string) {
    setCustomDashboards(renameCustomDashboard(activeRestaurantId, id, title));
  }

  function handleDeleteCustomDashboard(id: string) {
    setCustomDashboards(deleteCustomDashboard(activeRestaurantId, id));
    if (activeCustomDashboardId === id) {
      setActiveCustomDashboardId(null);
    }
  }

  function handleRemoveWidgetFromDashboard(dashboardId: string, blockId: string) {
    setCustomDashboards(removeWidgetFromCustomDashboard(activeRestaurantId, dashboardId, { blockId }));
  }

  async function handleExecuteAgentAction(action: AgentClientAction): Promise<string | void> {
    if (action.type === 'navigate') {
      setTab(action.tab);
      return;
    }
    if (action.type === 'set_filters') {
      if (action.restaurantId && action.restaurantId !== activeRestaurantId) {
        await handleRestaurantSwitch(action.restaurantId);
      }
      const actionFrom =
        'from' in action && typeof action.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(action.from)
          ? action.from
          : undefined;
      const actionTo =
        'to' in action && typeof action.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(action.to)
          ? action.to
          : undefined;
      if (actionFrom || actionTo) {
        const resolvedFrom = actionFrom ?? actionTo!;
        const resolvedTo = actionTo ?? actionFrom!;
        setPeriod({ kind: 'custom', from: resolvedFrom, to: resolvedTo });
        setExpensesShowAllDates(false);
        if (!action.month) {
          setMonth(resolvedTo.slice(0, 7));
        }
      } else if (action.days) {
        setPeriod({ kind: 'days', days: action.days });
        setExpensesShowAllDates(false);
      }
      if (action.month) setMonth(action.month);
      if (action.districtId !== undefined) setSelectedDistrictId(action.districtId);
      return;
    }
    if (action.type === 'highlight_widget') {
      if (action.tab) setTab(action.tab);
      setHighlightedWidgetId(action.widgetId);
      return;
    }
    if (action.type === 'pin_widget') {
      handlePinBlock(action.block);
      setDashboardAiBanner(
        lang === 'uz'
          ? '✓ AI: Vidjet asosiy dashboardga biriktirildi'
          : lang === 'ru'
            ? '✓ ИИ: Виджет закреплён на главном дашборде'
            : '✓ AI: Widget pinned to Dashboard',
      );
      return 'Widget pinned to Dashboard';
    }
    if (action.type === 'unpin_widget') {
      if (action.clearAll || !action.blockId) {
        setPinnedBlocks(clearPinnedWidgets(activeRestaurantId));
      } else {
        handleUnpinBlock(action.blockId);
      }
      setDashboardAiBanner(
        lang === 'uz'
          ? '✓ AI: Biriktirilgan vidjetlar tozalandi'
          : lang === 'ru'
            ? '✓ ИИ: Закреплённые виджеты очищены'
            : '✓ AI: Pinned widgets cleared',
      );
      return 'Cleared pinned widgets';
    }
    if (action.type === 'create_dashboard') {
      const { list, created } = createCustomDashboard(activeRestaurantId, action.title, action.blocks);
      setCustomDashboards(list);
      setActiveCustomDashboardId(created.id);
      setTab('dashboard');
      const msg =
        lang === 'uz'
          ? `✓ AI: «${created.title}» maxsus paneli yaratildi`
          : lang === 'ru'
            ? `✓ ИИ: Создан кастомный дашборд «${created.title}»`
            : `✓ AI: Created dashboard "${created.title}"`;
      setDashboardAiBanner(msg);
      return msg;
    }
    if (action.type === 'update_dashboard') {
      const targetId = action.dashboardId ?? activeCustomDashboardId ?? customDashboards[0]?.id;
      const { list, updated } = updateCustomDashboard(activeRestaurantId, targetId, {
        title: action.title,
        blocks: action.blocks,
        mode: action.mode,
      });
      setCustomDashboards(list);
      setActiveCustomDashboardId(updated.id);
      setTab('dashboard');
      const msg =
        lang === 'uz'
          ? `✓ AI: «${updated.title}» paneli yangilandi (${updated.blocks.length} ta vidjet)`
          : lang === 'ru'
            ? `✓ ИИ: Дашборд «${updated.title}» обновлён (${updated.blocks.length} виджетов)`
            : `✓ AI: Updated dashboard "${updated.title}" (${updated.blocks.length} widgets)`;
      setDashboardAiBanner(msg);
      return msg;
    }
    if (action.type === 'rename_dashboard') {
      const targetId = action.dashboardId ?? activeCustomDashboardId ?? customDashboards[0]?.id;
      if (targetId) {
        const list = renameCustomDashboard(activeRestaurantId, targetId, action.title);
        setCustomDashboards(list);
        setActiveCustomDashboardId(targetId);
        setTab('dashboard');
      }
      const msg =
        lang === 'uz'
          ? `✓ AI: Dashboard nomi «${action.title}» deb o‘zgartirildi`
          : lang === 'ru'
            ? `✓ ИИ: Дашборд переименован в «${action.title}»`
            : `✓ AI: Renamed dashboard to "${action.title}"`;
      setDashboardAiBanner(msg);
      return msg;
    }
    if (action.type === 'delete_dashboard') {
      if (action.deleteAll) {
        setCustomDashboards(clearAllCustomDashboards(activeRestaurantId));
        setActiveCustomDashboardId(null);
      } else {
        const targetId = action.dashboardId ?? activeCustomDashboardId ?? customDashboards[0]?.id;
        if (targetId) {
          setCustomDashboards(deleteCustomDashboard(activeRestaurantId, targetId));
          if (activeCustomDashboardId === targetId) {
            setActiveCustomDashboardId(null);
          }
        }
      }
      setTab('dashboard');
      const msg =
        lang === 'uz'
          ? '✓ AI: Maxsus dashboard o‘chirildi'
          : lang === 'ru'
            ? '✓ ИИ: Кастомный дашборд удалён'
            : '✓ AI: Custom dashboard deleted';
      setDashboardAiBanner(msg);
      return msg;
    }
    if (action.type === 'select_dashboard') {
      if (action.dashboardId === null) {
        setActiveCustomDashboardId(null);
      } else {
        const current = loadCustomDashboards(activeRestaurantId);
        const byId = current.find(d => d.id === action.dashboardId);
        const byTitle = action.titleMatch
          ? current.find(d => d.title.toLowerCase().includes(action.titleMatch!.toLowerCase()))
          : undefined;
        const chosen = byId ?? byTitle ?? current[0] ?? null;
        setActiveCustomDashboardId(chosen ? chosen.id : null);
      }
      setTab('dashboard');
      const msg =
        action.dashboardId === null
          ? lang === 'uz'
            ? '✓ AI: Asosiy dashboard ochildi'
            : lang === 'ru'
              ? '✓ ИИ: Открыт главный дашборд (Обзор)'
              : '✓ AI: Switched to main overview dashboard'
          : lang === 'uz'
            ? '✓ AI: Maxsus dashboard ochildi'
            : lang === 'ru'
              ? '✓ ИИ: Открыт кастомный дашборд'
              : '✓ AI: Switched to custom dashboard';
      setDashboardAiBanner(msg);
      return msg;
    }
    if (action.type === 'remove_dashboard_widget') {
      const targetId = action.dashboardId ?? activeCustomDashboardId ?? customDashboards[0]?.id;
      if (targetId) {
        const list = removeWidgetFromCustomDashboard(activeRestaurantId, targetId, {
          blockId: action.blockId,
          blockKind: action.blockKind,
        });
        setCustomDashboards(list);
        setActiveCustomDashboardId(targetId);
      }
      setTab('dashboard');
      const msg =
        lang === 'uz'
          ? '✓ AI: Vidjet dashboarddan olib tashlandi'
          : lang === 'ru'
            ? '✓ ИИ: Виджет удалён с дашборда'
            : '✓ AI: Widget removed from dashboard';
      setDashboardAiBanner(msg);
      return msg;
    }
    if (action.type === 'apply_branch_budgets') {
      const res = await applyBranchAllocation(action.month, action.allocations);
      await refreshAll();
      return `Applied ${res.appliedCount} branch budget limits for ${res.month}`;
    }
    if (action.type === 'fix_finding') {
      if (action.code === 'DUPLICATE_INVOICE' && action.duplicateExpenseId) {
        await deleteExpense(action.duplicateExpenseId);
        await refreshAll();
        return 'Duplicate invoice deleted';
      }
      if (action.code === 'AMOUNT_MISMATCH' && action.expenseId && action.expectedAmount) {
        await updateExpense(action.expenseId, { amount: action.expectedAmount, isVerified: true });
        await refreshAll();
        return 'Expense amount corrected';
      }
      if (action.code === 'CATEGORY_MISMATCH' && action.expenseId && action.suggestedCategory) {
        await updateExpense(action.expenseId, { category: action.suggestedCategory, isVerified: true });
        await refreshAll();
        return 'Expense category corrected';
      }
    }
  }

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">Loading...</div>;
  }

  if (!auth) {
    return (
      <LoginPage
        lang={lang}
        onLangChange={setLang}
        onLoggedIn={logged => {
          setAuth(logged);
          setPinnedBlocks(loadPinnedWidgets(logged.selectedRestaurantId));
          setCustomDashboards(loadCustomDashboards(logged.selectedRestaurantId));
          setActiveCustomDashboardId(null);
          setTab('dashboard');
        }}
      />
    );
  }

  const t = COPY[lang];
  const analysis = analysisQuery.data;
  const activeRestaurant = auth.restaurants.find(r => r.id === activeRestaurantId) ?? auth.restaurants[0];
  const resolvedTimeseries = analysis?.timeseries ?? timeseriesQuery.data ?? [];
  const resolvedDishes = analysis?.dishes ?? dishesQuery.data ?? [];
  const resolvedHeatmap = analysis?.heatmap ?? heatmapQuery.data ?? [];
  const resolvedBudgets =
    month === defaultMonth && analysis?.budgets ? analysis.budgets : (budgetsQuery.data ?? []);

  const navItems: NavTab[] = ['dashboard', 'agent', 'audit', 'budgets', 'branches', 'map', 'expenses', 'sales'];

  const activeCustomDashboard =
    tab === 'dashboard' && activeCustomDashboardId
      ? customDashboards.find(d => d.id === activeCustomDashboardId) ?? null
      : null;

  const atRiskBudgets = resolvedBudgets.filter(b => b.status === 'OVERRUN' || b.status === 'WARNING');
  const summaryParts: string[] = [
    `Restaurant: ${activeRestaurant?.name ?? auth.user.restaurantName}`,
    `Tab: ${tab}`,
    `Period: ${days}d (${from}..${to}), Month: ${month}`,
  ];
  if (selectedDistrictId) {
    summaryParts.push(`Selected District: ${selectedDistrictId}`);
  }
  if (activeCustomDashboard) {
    summaryParts.push(
      `Active Custom Dashboard: "${activeCustomDashboard.title}" (${activeCustomDashboard.blocks.length} blocks)`,
    );
  }
  if (analysis) {
    summaryParts.push(
      `Revenue: ${fmtCompactMoney(analysis.overview.revenue, lang)}, Net Profit: ${fmtCompactMoney(analysis.overview.netProfit, lang)} (${analysis.overview.netMarginPct.toFixed(1)}%), Health Score: ${analysis.report.healthScore}/100, Findings: ${analysis.findings.length}`,
    );
    if (analysis.findings[0]) {
      summaryParts.push(`Top Finding: ${analysis.findings[0].code} - ${analysis.findings[0].title[lang]}`);
    }
  }
  if (atRiskBudgets.length > 0) {
    summaryParts.push(
      `Budgets at risk (${atRiskBudgets.length}): ${atRiskBudgets.map(b => `${b.category} (${b.status})`).join(', ')}`,
    );
  }

  const screenContext: AgentScreenContext = {
    activeTab: tab,
    restaurantId: activeRestaurantId,
    days,
    month,
    districtId: selectedDistrictId,
    visibleWidgets:
      tab === 'map'
        ? ['widget-map-districts']
        : tab === 'branches'
          ? ['widget-branches-list']
          : ['widget-health', 'widget-kpis', 'widget-rev-exp', 'widget-categories', 'widget-findings'],
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

  async function askAgentQuestion(questionText: string) {
    const clean = questionText.trim();
    if (!clean || agentBusy) return;

    const userTurn: AgentChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: clean,
    };
    const history = agentTurnsRef.current.slice(-6).map(t => ({ role: t.role, content: t.text }));

    setAgentTurns(prev => [...prev, userTurn]);
    setAgentBusy(true);
    setAgentStatusBanner(null);

    const startedAt = performance.now();
    try {
      const response = await sendAgentChat({
        question: clean,
        lang,
        model: selectedAgentModel,
        history,
        screenContext,
        from,
        to,
        month,
      });
      const latencyMs = Math.round(performance.now() - startedAt);

      const assistantTurn: AgentChatTurn = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: response.answer[lang],
        latencyMs,
        response,
        feedback: null,
        feedbackStatus: null,
      };
      setAgentTurns(prev => [...prev, assistantTurn]);

      for (const act of response.autoActions) {
        const msg = await handleExecuteAgentAction(act);
        if (msg) setAgentStatusBanner(msg);
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startedAt);
      setAgentTurns(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Agent request failed',
          latencyMs,
        },
      ]);
    } finally {
      setAgentBusy(false);
    }
  }

  async function rateAgentTurn(turnId: string, requestId: string, rating: 'up' | 'down') {
    setAgentTurns(prev =>
      prev.map(t => (t.id === turnId ? { ...t, feedback: rating, feedbackStatus: '...' } : t)),
    );
    try {
      const res = await sendAgentFeedback({ requestId, rating });
      setAgentTurns(prev =>
        prev.map(t =>
          t.id === turnId
            ? {
                ...t,
                feedbackStatus: res.ok
                  ? `Coarena /v1/feedback OK (${res.status})`
                  : `Saved locally (${res.status})`,
              }
            : t,
        ),
      );
    } catch {
      setAgentTurns(prev =>
        prev.map(t => (t.id === turnId ? { ...t, feedbackStatus: 'Feedback error' } : t)),
      );
    }
  }

  function clearAgentConversation() {
    if (agentBusy) return;
    setAgentTurns([]);
    setAgentStatusBanner(null);
  }

  function handleQuickAskSubmit(e: FormEvent) {
    e.preventDefault();
    const text = quickAskInput.trim();
    if (!text) {
      setCopilotOpen(true);
      return;
    }
    setQuickAskInput('');
    setCopilotOpen(true);
    void askAgentQuestion(text);
  }

  function handleExpandQuickAskToAgent() {
    const text = quickAskInput.trim();
    setCopilotOpen(false);
    setTab('agent');
    if (text) {
      setQuickAskInput('');
      void askAgentQuestion(text);
    }
    setTimeout(() => {
      agentInputRef.current?.focus();
    }, 60);
  }

  async function handleRunDashboardAiCommand(prompt: string) {
    const clean = prompt.trim();
    if (!clean || dashboardAiBusy) return;
    setDashboardAiBusy(true);
    setDashboardAiBanner(null);
    try {
      const response = await sendAgentChat({
        question: clean,
        lang,
        model: selectedAgentModel,
        screenContext,
        from,
        to,
        month,
      });
      let lastActionMsg: string | void = undefined;
      for (const act of response.autoActions) {
        const resMsg = await handleExecuteAgentAction(act);
        if (resMsg) lastActionMsg = resMsg;
      }
      setDashboardAiBanner(lastActionMsg || response.answer[lang]);
    } catch (err) {
      setDashboardAiBanner(err instanceof Error ? err.message : 'AI command failed');
    } finally {
      setDashboardAiBusy(false);
    }
  }

  const topNavShortLabels: Record<NavTab, string> =
    lang === 'uz'
      ? {
          dashboard: 'Asosiy',
          agent: 'AI Agent',
          audit: 'Audit',
          budgets: 'Byudjet',
          branches: 'Filiallar',
          map: 'Xarita',
          expenses: 'Xarajat',
          sales: 'Savdo',
        }
      : lang === 'en'
        ? {
            dashboard: 'Overview',
            agent: 'AI Agent',
            audit: 'Audit',
            budgets: 'Budgets',
            branches: 'Branches',
            map: 'Map',
            expenses: 'Expenses',
            sales: 'Sales',
          }
        : {
            dashboard: 'Главная',
            agent: 'Агент',
            audit: 'Аудит',
            budgets: 'Бюджеты',
            branches: 'Филиалы',
            map: 'Карта',
            expenses: 'Расходы',
            sales: 'Продажи',
          };

  const userInitials = (auth.user.name || auth.user.email || 'UB')
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Dribbble Sticky Top Navigation Shell */}
      <header className="no-print glass-bar sticky top-0 z-30 border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            {/* Brand & Restaurant Switcher */}
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setTab('dashboard')}
                className="flex shrink-0 items-center gap-2.5 text-left"
              >
                <BrandLogoBadge size={36} />
                <span className="hidden text-[15px] font-semibold tracking-tight 2xl:inline">
                  {t.appName}
                </span>
              </button>

              <select
                aria-label={t.restaurant}
                className="input-field min-h-0 w-auto shrink-0 rounded-full py-1.5 text-xs font-medium"
                value={activeRestaurantId}
                onChange={e => void handleRestaurantSwitch(e.target.value)}
              >
                {auth.restaurants.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Center Horizontal Single-Line Pill Tabs (LG+) */}
            <nav className="no-scrollbar hidden min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--surface-2)]/75 p-1 lg:flex">
              {navItems.map(item => {
                const active = tab === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTab(item)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] whitespace-nowrap transition ${
                      active
                        ? 'bg-[var(--surface)] font-medium text-[var(--text)] shadow-[var(--pill-shadow)]'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span>{topNavShortLabels[item]}</span>
                    {item === 'audit' && analysis && analysis.findings.length > 0 && (
                      <span className="rounded-full bg-[var(--bad-soft)] px-1.5 py-0.2 text-[10px] font-semibold text-[var(--bad)] tabular-nums">
                        {analysis.findings.length}
                      </span>
                    )}
                    {item === 'agent' && (
                      <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.2 text-[10px] font-semibold text-[var(--accent)]">
                        AI
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Right Controls Cluster */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Period Pill + Exact Date Popover */}
              <div className="relative hidden shrink-0 items-center sm:flex">
                <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5 text-[11.5px] font-medium shadow-[var(--pill-shadow)]">
                  {[
                    [7, t.period7],
                    [30, t.period30],
                    [60, t.period60],
                    [90, t.period90],
                  ].map(([d, label]) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setPeriod({ kind: 'days', days: Number(d) });
                        setExpensesShowAllDates(false);
                        setDatePickerOpen(false);
                      }}
                      className={`rounded-full px-2.5 py-1 whitespace-nowrap transition ${
                        period.kind === 'days' && period.days === d
                          ? 'bg-[var(--cta-bg)] text-[var(--cta-text)]'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setDraftFrom(from);
                      setDraftTo(to);
                      setDatePickerOpen(v => !v);
                    }}
                    className={`rounded-full px-2.5 py-1 whitespace-nowrap tabular-nums transition ${
                      period.kind !== 'days'
                        ? 'bg-[var(--cta-bg)] text-[var(--cta-text)]'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {period.kind !== 'days' ? formatShortDateBadge(from, to) : t.periodCustom}
                  </button>
                </div>

                {datePickerOpen && (
                  <div className="card absolute right-0 top-11 z-40 w-80 p-3.5 shadow-xl">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text)]">
                        {t.activePeriod}: {formatShortDateBadge(from, to)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDatePickerOpen(false)}
                        className="rounded-full px-1.5 py-0.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ['today', t.periodToday],
                          ['yesterday', t.periodYesterday],
                          ['last_week', t.periodLastWeek],
                          ['this_month', t.periodThisMonth],
                        ] as Array<[PeriodPresetId, string]>
                      ).map(([presetId, label]) => (
                        <button
                          key={presetId}
                          type="button"
                          onClick={() => {
                            setPeriod({ kind: 'preset', preset: presetId });
                            setExpensesShowAllDates(false);
                            setDatePickerOpen(false);
                          }}
                          className={`rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition ${
                            period.kind === 'preset' && period.preset === presetId
                              ? 'border-transparent bg-[var(--cta-bg)] text-[var(--cta-text)]'
                              : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        if (draftFrom && draftTo) {
                          setPeriod({ kind: 'custom', from: draftFrom, to: draftTo });
                          setExpensesShowAllDates(false);
                          setDatePickerOpen(false);
                        }
                      }}
                      className="grid gap-2 border-t border-[var(--border)] pt-2.5"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1 text-[10.5px] font-medium text-[var(--muted)]">
                          {t.dateFrom}
                          <input
                            type="date"
                            className="input-field min-h-0 px-2.5 py-1.5 text-xs tabular-nums"
                            value={draftFrom}
                            onChange={e => setDraftFrom(e.target.value)}
                            required
                          />
                        </label>
                        <label className="grid gap-1 text-[10.5px] font-medium text-[var(--muted)]">
                          {t.dateTo}
                          <input
                            type="date"
                            className="input-field min-h-0 px-2.5 py-1.5 text-xs tabular-nums"
                            value={draftTo}
                            onChange={e => setDraftTo(e.target.value)}
                            required
                          />
                        </label>
                      </div>
                      <button type="submit" className="btn-primary min-h-0 w-full py-1.5 text-xs">
                        {t.applyRange}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {tab !== 'agent' && (
                <button
                  type="button"
                  onClick={() => setCopilotOpen(v => !v)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition ${
                    copilotOpen
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--pill-shadow)] hover:border-[var(--accent)]'
                  }`}
                  title="Ctrl+K / Alt+A"
                >
                  <IconSparkles size={13} className={copilotOpen ? 'text-white' : 'text-[var(--accent)]'} />
                  <span className="hidden sm:inline">AI</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setTab('audit')}
                title={t.urgentFindings}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--pill-shadow)] transition hover:border-[var(--border-strong)]"
              >
                <IconBell size={15} />
                {analysis && analysis.findings.length > 0 && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                title={t.theme}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--pill-shadow)] transition hover:border-[var(--border-strong)]"
              >
                {theme === 'light' ? <IconMoon size={15} /> : <IconSun size={15} />}
              </button>

              {/* User Rounded-Square Avatar + Popover Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border-strong)] bg-[var(--cta-bg)] text-xs font-semibold text-[var(--cta-text)] shadow-[var(--pill-shadow)] transition hover:opacity-90"
                  title={auth.user.name}
                >
                  {userInitials}
                </button>

                {userMenuOpen && (
                  <div className="card absolute right-0 top-11 z-40 w-60 p-3 shadow-xl">
                    <div className="border-b border-[var(--border)] pb-2.5">
                      <div className="truncate text-xs font-semibold text-[var(--text)]">{auth.user.name}</div>
                      <div className="truncate text-[11px] text-[var(--muted)]">{auth.user.email}</div>
                    </div>

                    <div className="mt-2.5 flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-[11px] font-medium">
                      {(['ru', 'uz', 'en'] as const).map(code => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setLang(code)}
                          className={`flex-1 rounded-full py-1 uppercase transition ${
                            lang === code
                              ? 'bg-[var(--surface)] font-semibold text-[var(--text)] shadow-xs'
                              : 'text-[var(--muted)]'
                          }`}
                        >
                          {code}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        void handleLogout();
                      }}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-[var(--bad)]/30 bg-[var(--bad-soft)] py-1.5 text-xs font-medium text-[var(--bad)] transition hover:border-[var(--bad)]"
                    >
                      <IconLogOut size={13} />
                      {t.logout}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Responsive Secondary Nav Pills Row (< LG) */}
          <nav className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-2.5 lg:hidden">
            {navItems.map(item => {
              const active = tab === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition ${
                    active
                      ? 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--pill-shadow)]'
                      : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <span>{topNavShortLabels[item]}</span>
                  {item === 'audit' && analysis && analysis.findings.length > 0 && (
                    <span className="rounded-full bg-[var(--bad-soft)] px-1.5 text-[10px] font-semibold text-[var(--bad)] tabular-nums">
                      {analysis.findings.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Centered Editorial Content Container */}
      <main className="mx-auto min-w-0 max-w-[1440px] px-4 py-6 pb-12 sm:px-6 lg:px-8">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="m-0 text-[22px] font-medium tracking-[-0.02em] text-[var(--text)]">
              {tab === 'dashboard'
                ? `${activeRestaurant?.name ?? auth.user.restaurantName} · ${t.nav[tab]}`
                : `${t.nav[tab]} · ${activeRestaurant?.name ?? auth.user.restaurantName}`}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{t.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedDistrictId && (
              <button
                type="button"
                onClick={() => setSelectedDistrictId('')}
                className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]"
              >
                District: {selectedDistrictId} ✕
              </button>
            )}

            <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
              <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5 text-[11px] font-medium">
                {[7, 30, 60, 90].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setPeriod({ kind: 'days', days: d });
                      setExpensesShowAllDates(false);
                    }}
                    className={`rounded-full px-2.5 py-1 ${
                      period.kind === 'days' && period.days === d
                        ? 'bg-[var(--cta-bg)] text-[var(--cta-text)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px]">
                <input
                  type="date"
                  aria-label={t.dateFrom}
                  className="bg-transparent text-[11px] outline-none tabular-nums"
                  value={from}
                  onChange={e => {
                    const val = e.target.value;
                    if (val) {
                      setPeriod({ kind: 'custom', from: val, to: val > to ? val : to });
                      setExpensesShowAllDates(false);
                    }
                  }}
                />
                <span className="text-[var(--muted)]">–</span>
                <input
                  type="date"
                  aria-label={t.dateTo}
                  className="bg-transparent text-[11px] outline-none tabular-nums"
                  value={to}
                  onChange={e => {
                    const val = e.target.value;
                    if (val) {
                      setPeriod({ kind: 'custom', from: val < from ? val : from, to: val });
                      setExpensesShowAllDates(false);
                    }
                  }}
                />
              </div>
            </div>

            <button type="button" onClick={() => void refreshAll()} className="btn-secondary min-h-0 px-3.5 py-1.5 text-xs">
              <IconRefresh size={13} />
              {t.refresh}
            </button>
          </div>
        </div>

        {analysisQuery.isError && (
          <div className="card mb-4 border-[var(--bad)]/50 bg-[var(--bad-soft)] p-4 text-xs font-medium text-[var(--bad)]">
            {analysisQuery.error instanceof Error ? analysisQuery.error.message : 'Failed to load analytics'}
          </div>
        )}

        {tab === 'dashboard' && analysis && (
          <DashboardPage
            lang={lang}
            overview={analysis.overview}
            timeseries={resolvedTimeseries}
            findings={analysis.findings}
            report={aiReportOverride ?? analysis.report}
            districtGeo={dashboardGeoQuery.data}
            onNavigate={setTab}
            onOpenExpensesGroup={group => {
              setExpensesGroupFilter(group);
              setTab('expenses');
            }}
            pinnedBlocks={pinnedBlocks}
            onUnpinBlock={handleUnpinBlock}
            onExecuteAction={act => void handleExecuteAgentAction(act)}
            customDashboards={customDashboards}
            activeCustomDashboardId={activeCustomDashboardId}
            onSelectCustomDashboard={setActiveCustomDashboardId}
            onRenameCustomDashboard={handleRenameCustomDashboard}
            onDeleteCustomDashboard={handleDeleteCustomDashboard}
            onRemoveWidgetFromDashboard={handleRemoveWidgetFromDashboard}
            onPinBlock={handlePinBlock}
            onRunAiDashboardCommand={handleRunDashboardAiCommand}
            aiCommandBusy={dashboardAiBusy}
            aiCommandBanner={dashboardAiBanner}
            onDismissAiBanner={() => setDashboardAiBanner(null)}
          />
        )}

        <div className={tab === 'agent' ? 'animate-page-enter block' : 'hidden'}>
          <AgentPage
            lang={lang}
            restaurantName={activeRestaurant?.name ?? auth.user.restaurantName}
            turns={agentTurns}
            busy={agentBusy}
            statusBanner={agentStatusBanner}
            onStatusBanner={setAgentStatusBanner}
            selectedModel={selectedAgentModel}
            onSelectModel={setSelectedAgentModel}
            models={availableAgentModels}
            modelsConfigured={agentModelsQuery.data?.configured}
            onAskQuestion={askAgentQuestion}
            onClearConversation={clearAgentConversation}
            onRateTurn={rateAgentTurn}
            onExecuteAction={handleExecuteAgentAction}
            onPinBlock={handlePinBlock}
            inputRef={agentInputRef}
          />
        </div>

        {tab !== 'dashboard' && tab !== 'agent' && (
          <div key={tab} className="animate-page-enter">
            {tab === 'audit' && analysis && (
              <AuditPage
                lang={lang}
                from={from}
                to={to}
                analysis={analysis}
                aiReportOverride={aiReportOverride}
                onAiReport={setAiReportOverride}
                onMutated={refreshAll}
              />
            )}

            {tab === 'budgets' && (
              <BudgetsPage
                lang={lang}
                restaurantId={activeRestaurantId}
                month={month}
                onMonthChange={setMonth}
                budgets={resolvedBudgets}
                onMutated={refreshAll}
              />
            )}

            {tab === 'branches' && (
              <BranchesPage
                lang={lang}
                month={month}
                onMonthChange={setMonth}
                onMutated={refreshAll}
              />
            )}

            {tab === 'map' && (
              <MapPage
                lang={lang}
                from={from}
                to={to}
                selectedDistrictId={selectedDistrictId}
                onSelectDistrict={setSelectedDistrictId}
                onAskAgentAboutDistrict={prompt => {
                  setCopilotOpen(true);
                  void askAgentQuestion(prompt);
                }}
              />
            )}

            {tab === 'expenses' && (
              <ExpensesPage
                lang={lang}
                expenses={expensesQuery.data ?? []}
                loading={expensesQuery.isLoading}
                from={from}
                to={to}
                showAllDates={expensesShowAllDates}
                onToggleAllDates={setExpensesShowAllDates}
                onDateRangeChange={(nextFrom, nextTo) => {
                  setPeriod({ kind: 'custom', from: nextFrom, to: nextTo });
                  setExpensesShowAllDates(false);
                }}
                groupFilter={expensesGroupFilter}
                onGroupFilterChange={setExpensesGroupFilter}
                onMutated={refreshAll}
              />
            )}

            {tab === 'sales' && (
              <SalesPage
                lang={lang}
                dishes={resolvedDishes}
                heatmap={resolvedHeatmap}
                onMutated={refreshAll}
              />
            )}
          </div>
        )}

        {/* Inline Docked Quick AI Copilot Bar (Non-overlapping below content) */}
        {tab !== 'agent' && !copilotOpen && (
          <form
            onSubmit={handleQuickAskSubmit}
            className="no-print mx-auto mt-6 flex w-full max-w-2xl items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-[var(--card-shadow)] transition-colors focus-within:border-[var(--accent)]/60"
          >
            <button
              type="button"
              onClick={() => setCopilotOpen(true)}
              title={
                lang === 'uz'
                  ? 'AI Copilot panelini ochish (Ctrl+K / Alt+A)'
                  : lang === 'ru'
                    ? 'Открыть AI Copilot поверх экрана (Ctrl+K / Alt+A)'
                    : 'Open AI Copilot drawer (Ctrl+K / Alt+A)'
              }
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] transition hover:brightness-95"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span>{activeAgentModelInfo?.displayName ?? selectedAgentModel}</span>
              {agentTurns.length > 0 && (
                <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-white tabular-nums">
                  {agentTurns.length}
                </span>
              )}
            </button>
            <input
              type="text"
              className="min-h-0 flex-1 border-0 bg-transparent px-2 py-1.5 text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted-soft)]"
              value={quickAskInput}
              onChange={e => setQuickAskInput(e.target.value)}
              placeholder={
                lang === 'uz'
                  ? 'AI Copilotdan so‘rang (Ctrl+K) — xarita, byudjet, audit...'
                  : lang === 'ru'
                    ? 'Спросить AI Copilot (Ctrl+K) — карта, бюджеты, аудит...'
                    : 'Ask AI Copilot (Ctrl+K) — map, budgets, audit...'
              }
            />
            <button
              type="submit"
              disabled={agentBusy}
              className="btn-primary min-h-0 shrink-0 px-4 py-1.5 text-xs"
            >
              {agentBusy ? '...' : lang === 'uz' ? 'So‘rash' : lang === 'ru' ? 'Спросить' : 'Ask'}
            </button>
            <button
              type="button"
              onClick={handleExpandQuickAskToAgent}
              title={
                lang === 'uz'
                  ? 'To‘liq AI-Agent (MCP) sahifasini ochish'
                  : lang === 'ru'
                    ? 'Открыть полный экран AI-Агент (MCP)'
                    : 'Expand to full AI Agent (MCP) tab'
              }
              className="btn-secondary min-h-0 shrink-0 px-2.5 py-1.5 text-xs"
            >
              ↗
            </button>
          </form>
        )}

        {/* Slide-Over AI Copilot Drawer */}
        {tab !== 'agent' && (
          <AiCopilotDrawer
            open={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            onExpandToAgent={() => {
              setCopilotOpen(false);
              setTab('agent');
              setTimeout(() => {
                agentInputRef.current?.focus();
              }, 60);
            }}
            lang={lang}
            restaurantName={activeRestaurant?.name ?? auth.user.restaurantName}
            screenContext={screenContext}
            turns={agentTurns}
            busy={agentBusy}
            statusBanner={agentStatusBanner}
            onStatusBanner={setAgentStatusBanner}
            selectedModel={selectedAgentModel}
            onSelectModel={setSelectedAgentModel}
            models={availableAgentModels}
            modelsConfigured={agentModelsQuery.data?.configured}
            onAskQuestion={askAgentQuestion}
            onClearConversation={clearAgentConversation}
            onRateTurn={rateAgentTurn}
            onExecuteAction={handleExecuteAgentAction}
            onPinBlock={handlePinBlock}
          />
        )}
      </main>
    </div>
  );
}
