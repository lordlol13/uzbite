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
  DEFAULT_AGENT_MODEL,
  applyBranchAllocation,
  clearPinnedWidgets,
  clearStoredAuth,
  deleteExpense,
  fetchAgentModels,
  fetchAnalysis,
  fetchBudgets,
  fetchDishes,
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
import { COPY, fmtCompactMoney, type NavTab } from './lib/i18n';
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

function dateRangeForDays(days: number): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - (days - 1) * 86_400_000);
  const from = start.toISOString().slice(0, 10);
  return { from, to };
}

export default function App() {
  const queryClient = useQueryClient();
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<NavTab>('dashboard');
  const [days, setDays] = useState<number>(30);
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
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
  const [agentTurns, setAgentTurns] = useState<AgentChatTurn[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentStatusBanner, setAgentStatusBanner] = useState<string | null>(null);
  const [selectedAgentModel, setSelectedAgentModel] = useState<string>(DEFAULT_AGENT_MODEL);
  const agentTurnsRef = useRef<AgentChatTurn[]>([]);
  const agentInputRef = useRef<HTMLInputElement | null>(null);

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
      const isCtrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      const isAltA = e.altKey && e.key.toLowerCase() === 'a';
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

  const { from, to } = useMemo(() => dateRangeForDays(days), [days]);
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
    queryKey: ['business-expenses', activeRestaurantId],
    queryFn: () => fetchExpenses({}),
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
      if (action.days) setDays(action.days);
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

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden w-64 shrink-0 flex-col justify-between border-r border-[var(--border)] bg-[var(--surface)] p-4 md:flex">
        <div>
          <div className="flex items-center gap-2.5 px-2 py-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f8781d] text-base font-extrabold text-white">
              U
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold tracking-tight">{t.appName}</div>
              <div className="truncate text-[10px] font-semibold text-[var(--muted)]">Cases #24–#26 · Gemini 3.8</div>
            </div>
          </div>

          <div className="mt-4">
            <label className="block px-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              {t.restaurant}
            </label>
            <select
              className="input-field mt-1 text-xs font-bold"
              value={activeRestaurantId}
              onChange={e => void handleRestaurantSwitch(e.target.value)}
            >
              {auth.restaurants.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <nav className="mt-5 grid gap-1">
            {navItems.map(item => {
              const active = tab === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${
                    active
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <span>{t.nav[item]}</span>
                  {item === 'audit' && analysis && (
                    <span className="rounded-full bg-[var(--bad)] px-1.5 py-0.5 text-[10px] font-extrabold text-white tabular-nums">
                      {analysis.findings.length}
                    </span>
                  )}
                  {item === 'agent' && (
                    <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                      AI
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="grid gap-2 border-t border-[var(--border)] pt-3">
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="font-semibold text-[var(--muted)]">{t.theme}</span>
            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
          </div>

          <div className="flex overflow-hidden rounded-xl border border-[var(--border)] text-[11px] font-bold">
            {(['ru', 'uz', 'en'] as const).map(code => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`flex-1 py-1.5 uppercase ${lang === code ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)]'}`}
              >
                {code}
              </button>
            ))}
          </div>

          <div className="px-1 pt-1 text-[11px] text-[var(--muted)]">
            <div className="truncate font-bold text-[var(--text)]">{auth.user.name}</div>
            <div className="truncate">{auth.user.email}</div>
          </div>

          <button type="button" onClick={() => void handleLogout()} className="btn-secondary w-full text-xs">
            {t.logout}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative min-w-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-20">
        {/* Compact Mobile Nav Bar */}
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f8781d] text-xs font-extrabold text-white">
              U
            </div>
            <select
              className="input-field min-h-0 max-w-[160px] py-1 text-xs font-bold"
              value={activeRestaurantId}
              onChange={e => void handleRestaurantSwitch(e.target.value)}
            >
              {auth.restaurants.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1">
            {navItems.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                  tab === item
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface-2)] text-[var(--muted)]'
                }`}
              >
                {t.nav[item]}
              </button>
            ))}
          </div>
        </div>

        <header className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="m-0 text-xl font-extrabold tracking-tight">
              {activeRestaurant?.name ?? auth.user.restaurantName} · {t.nav[tab]}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{t.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedDistrictId && (
              <button
                type="button"
                onClick={() => setSelectedDistrictId('')}
                className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--accent)]"
              >
                District: {selectedDistrictId} ✕
              </button>
            )}

            <div className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold">
              {[
                [7, t.period7],
                [30, t.period30],
                [60, t.period60],
                [90, t.period90],
              ].map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(Number(d))}
                  className={`px-3 py-2 ${days === d ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab !== 'agent' && (
              <button
                type="button"
                onClick={() => setCopilotOpen(v => !v)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-extrabold transition ${
                  copilotOpen
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[var(--accent)]'
                }`}
                title="Ctrl+K / Alt+A"
              >
                <span>AI Copilot</span>
                <span className="rounded-md bg-black/10 px-1.5 py-0.5 text-[10px] font-bold">
                  Ctrl+K
                </span>
              </button>
            )}

            <button type="button" onClick={() => void refreshAll()} className="btn-secondary text-xs">
              {t.refresh}
            </button>
          </div>
        </header>

        {analysisQuery.isError && (
          <div className="card mb-4 border-[var(--bad)] bg-[var(--bad-soft)] p-4 text-xs font-bold text-[var(--bad)]">
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
            onNavigate={setTab}
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

        <div className={tab === 'agent' ? 'block' : 'hidden'}>
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

        {/* Floating Quick AI Copilot Bar on non-Agent Tabs */}
        {tab !== 'agent' && !copilotOpen && (
          <form
            onSubmit={handleQuickAskSubmit}
            className="no-print fixed right-5 bottom-5 z-30 flex w-[calc(100%-2.5rem)] max-w-xl items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl"
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
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--accent-soft)] px-2.5 py-1.5 text-[11px] font-extrabold text-[var(--accent)] transition hover:brightness-95"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span>Gemini 3.8</span>
              {agentTurns.length > 0 && (
                <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.2 text-[10px] font-extrabold text-white tabular-nums">
                  {agentTurns.length}
                </span>
              )}
            </button>
            <input
              type="text"
              className="input-field min-h-0 flex-1 py-1.5 text-xs"
              value={quickAskInput}
              onChange={e => setQuickAskInput(e.target.value)}
              placeholder={
                lang === 'uz'
                  ? 'AI Copilotdan so‘rang (Ctrl+K) — xarita, byudjet, audit...'
                  : lang === 'ru'
                    ? 'Спросить AI Copilot прямо здесь (Ctrl+K) — карта, бюджеты, аудит...'
                    : 'Ask AI Copilot right here (Ctrl+K) — map, budgets, audit...'
              }
            />
            <button
              type="submit"
              disabled={agentBusy}
              className="btn-primary min-h-0 shrink-0 px-3 py-1.5 text-xs"
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
