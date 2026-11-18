import { useState, type FormEvent } from 'react';
import type {
  AgentClientAction,
  AgentUiBlock,
  AiOptimizationReport,
  BusinessKpiOverview,
  DistrictGeoAnalysisResponse,
  Finding,
  Language,
  TimeseriesPoint,
} from '@uzbite/shared';
import { AgentBlocks } from '../components/AgentBlocks';
import { RevenueExpenseChart } from '../components/Charts';
import {
  AiInsightOrbCard,
  AlertFeedRow,
  GradientSliderRow,
  IconActivity,
  IconAlertTriangle,
  IconBag,
  IconBox,
  IconChevronRight,
  IconCoins,
  IconReceipt,
  IconSparkles,
  IconTrendingDown,
  IconWallet,
  IconWrench,
  LiveSunburstIcon,
  TickStatCard,
} from '../components/DesignWidgets';
import { TashkentDistrictMap } from '../components/TashkentDistrictMap';
import {
  ADDITIONAL_EXPENSE_CATEGORIES,
  BASE_EXPENSE_CATEGORIES,
  CATEGORY_LABELS,
  COPY,
  EXPENSE_GROUP_META,
  PRIORITY_EXPENSE_CATEGORIES,
  fmtCompactMoney,
  fmtMoney,
  type ExpenseGroupId,
  type NavTab,
} from '../lib/i18n';

export interface CustomDashboard {
  id: string;
  title: string;
  createdAt: string;
  blocks: AgentUiBlock[];
}

const CUSTOM_DASHBOARDS_PREFIX = 'uzbite_custom_dashboards_v1_';

export function loadCustomDashboards(restaurantId: string): CustomDashboard[] {
  try {
    const raw = localStorage.getItem(`${CUSTOM_DASHBOARDS_PREFIX}${restaurantId || 'default'}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as CustomDashboard[]) : [];
  } catch {
    return [];
  }
}

function saveCustomDashboards(restaurantId: string, list: CustomDashboard[]): void {
  localStorage.setItem(`${CUSTOM_DASHBOARDS_PREFIX}${restaurantId || 'default'}`, JSON.stringify(list));
}

export function createCustomDashboard(
  restaurantId: string,
  title: string,
  blocks: AgentUiBlock[],
): { list: CustomDashboard[]; created: CustomDashboard } {
  const current = loadCustomDashboards(restaurantId);
  const created: CustomDashboard = {
    id: `dash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim() || 'AI Custom Dashboard',
    createdAt: new Date().toISOString(),
    blocks,
  };
  const list = [created, ...current].slice(0, 12);
  saveCustomDashboards(restaurantId, list);
  return { list, created };
}

export function updateCustomDashboard(
  restaurantId: string,
  id: string | undefined,
  params: { title?: string; blocks: AgentUiBlock[]; mode: 'replace' | 'append' },
): { list: CustomDashboard[]; updated: CustomDashboard } {
  const current = loadCustomDashboards(restaurantId);
  const target = (id ? current.find(d => d.id === id) : undefined) ?? current[0];
  if (!target) {
    const { list, created } = createCustomDashboard(
      restaurantId,
      params.title || 'AI Custom Dashboard',
      params.blocks,
    );
    return { list, updated: created };
  }

  let mergedBlocks = params.blocks;
  if (params.mode === 'append') {
    const stamped = params.blocks.map((b, idx) => ({
      ...b,
      id: `${b.id}-${Date.now()}-${idx}`,
    }));
    mergedBlocks = [...target.blocks, ...stamped].slice(0, 6);
  }

  const updated: CustomDashboard = {
    ...target,
    title: params.title?.trim() || target.title,
    blocks: mergedBlocks,
  };
  const list = current.map(d => (d.id === target.id ? updated : d));
  saveCustomDashboards(restaurantId, list);
  return { list, updated };
}

export function removeWidgetFromCustomDashboard(
  restaurantId: string,
  id: string | undefined,
  filter: { blockId?: string; blockKind?: AgentUiBlock['kind'] },
): CustomDashboard[] {
  const current = loadCustomDashboards(restaurantId);
  const target = (id ? current.find(d => d.id === id) : undefined) ?? current[0];
  if (!target) return current;
  const filteredBlocks = target.blocks.filter(b => {
    if (filter.blockId && b.id === filter.blockId) return false;
    if (filter.blockKind && b.kind === filter.blockKind) return false;
    return true;
  });
  const list = current.map(d => (d.id === target.id ? { ...d, blocks: filteredBlocks } : d));
  saveCustomDashboards(restaurantId, list);
  return list;
}

export function renameCustomDashboard(
  restaurantId: string,
  id: string,
  newTitle: string,
): CustomDashboard[] {
  const clean = newTitle.trim();
  if (!clean) return loadCustomDashboards(restaurantId);
  const list = loadCustomDashboards(restaurantId).map(d =>
    d.id === id ? { ...d, title: clean } : d,
  );
  saveCustomDashboards(restaurantId, list);
  return list;
}

export function deleteCustomDashboard(restaurantId: string, id: string): CustomDashboard[] {
  const list = loadCustomDashboards(restaurantId).filter(d => d.id !== id);
  saveCustomDashboards(restaurantId, list);
  return list;
}

export function clearAllCustomDashboards(restaurantId: string): CustomDashboard[] {
  localStorage.removeItem(`${CUSTOM_DASHBOARDS_PREFIX}${restaurantId || 'default'}`);
  return [];
}

const DASHBOARD_AI_PRESETS: Record<Language, Array<{ label: string; prompt: string }>> = {
  ru: [
    { label: '+ Дашборд: Карта Ташкента', prompt: 'Создай дашборд по районам Ташкента и доставке' },
    { label: '+ Дашборд: Бюджеты (#25)', prompt: 'Создай дашборд по бюджетам и рискам перерасхода' },
    { label: '+ Дашборд: Аудит (#26)', prompt: 'Создай дашборд по коммунальным расходам и аренде' },
    { label: '+ Дашборд: Филиалы (#24)', prompt: 'Создай дашборд по эффективности филиалов' },
    { label: '+ Дашборд: Продажи и меню', prompt: 'Создай дашборд по продажам и маржинальности блюд' },
  ],
  uz: [
    { label: '+ Panel: Toshkent xaritasi', prompt: 'Toshkent tumanlari va yetkazish bo‘yicha dashboard yarat' },
    { label: '+ Panel: Byudjet (#25)', prompt: 'Byudjet ijrosi va xavflar bo‘yicha dashboard yarat' },
    { label: '+ Panel: Kommunal (#26)', prompt: 'Kommunal va ijara xarajatlari bo‘yicha maxsus dashboard yarat' },
    { label: '+ Panel: Filiallar (#24)', prompt: 'Filiallar samaradorligi bo‘yicha dashboard yarat' },
    { label: '+ Panel: Savdo va menyu', prompt: 'Savdo va taomlar marjasi bo‘yicha dashboard yarat' },
  ],
  en: [
    { label: '+ Dashboard: Tashkent Map', prompt: 'Create a custom dashboard for Tashkent districts and delivery' },
    { label: '+ Dashboard: Budgets (#25)', prompt: 'Create a custom dashboard for budget execution and risks' },
    { label: '+ Dashboard: Utilities (#26)', prompt: 'Create a custom dashboard for utilities and rent costs' },
    { label: '+ Dashboard: Branches (#24)', prompt: 'Create a custom dashboard for branch efficiency' },
    { label: '+ Dashboard: Sales & Menu', prompt: 'Create a custom dashboard for sales and dish margins' },
  ],
};

const SLIDER_TONES: Array<'orange' | 'mint' | 'violet' | 'pink' | 'blue'> = ['pink', 'orange', 'mint', 'violet', 'blue'];

export function DashboardPage({
  lang,
  overview,
  timeseries,
  findings,
  report,
  districtGeo,
  onNavigate,
  onOpenExpensesGroup,
  pinnedBlocks = [],
  onUnpinBlock,
  onExecuteAction,
  customDashboards = [],
  activeCustomDashboardId = null,
  onSelectCustomDashboard,
  onRenameCustomDashboard,
  onDeleteCustomDashboard,
  onRemoveWidgetFromDashboard,
  onPinBlock,
  onRunAiDashboardCommand,
  aiCommandBusy = false,
  aiCommandBanner = null,
  onDismissAiBanner,
}: {
  lang: Language;
  overview: BusinessKpiOverview;
  timeseries: TimeseriesPoint[];
  findings: Finding[];
  report: AiOptimizationReport;
  districtGeo?: DistrictGeoAnalysisResponse;
  onNavigate: (tab: NavTab) => void;
  onOpenExpensesGroup?: (group: ExpenseGroupId) => void;
  pinnedBlocks?: AgentUiBlock[];
  onUnpinBlock?: (blockId: string) => void;
  onExecuteAction?: (action: AgentClientAction) => void;
  customDashboards?: CustomDashboard[];
  activeCustomDashboardId?: string | null;
  onSelectCustomDashboard?: (id: string | null) => void;
  onRenameCustomDashboard?: (id: string, title: string) => void;
  onDeleteCustomDashboard?: (id: string) => void;
  onRemoveWidgetFromDashboard?: (dashboardId: string, blockId: string) => void;
  onPinBlock?: (block: AgentUiBlock) => void;
  onRunAiDashboardCommand?: (prompt: string) => Promise<void> | void;
  aiCommandBusy?: boolean;
  aiCommandBanner?: string | null;
  onDismissAiBanner?: () => void;
}) {
  const t = COPY[lang];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [showAiBuilder, setShowAiBuilder] = useState(customDashboards.length > 0);
  const [expenseGroup, setExpenseGroup] = useState<ExpenseGroupId>('ALL');

  const activeCustom = activeCustomDashboardId
    ? customDashboards.find(d => d.id === activeCustomDashboardId) ?? null
    : null;

  function startRename(d: CustomDashboard) {
    setEditingId(d.id);
    setDraftTitle(d.title);
  }

  function commitRename(id: string) {
    if (draftTitle.trim()) {
      onRenameCustomDashboard?.(id, draftTitle.trim());
    }
    setEditingId(null);
  }

  function handleAiFormSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = aiInput.trim();
    if (!clean || aiCommandBusy) return;
    setAiInput('');
    if (onRunAiDashboardCommand) {
      void onRunAiDashboardCommand(clean);
    } else {
      onNavigate('agent');
    }
  }

  const presets = DASHBOARD_AI_PRESETS[lang];
  const breakdownWithAmount = overview.categoryBreakdown.filter(c => c.amount > 0);
  const taxesBreakdown = overview.categoryBreakdown.find(c => c.category === 'TAXES');
  const utilitiesBreakdown = overview.categoryBreakdown.find(c => c.category === 'UTILITIES');
  const commBreakdown = overview.categoryBreakdown.find(c => c.category === 'COMMUNICATION');

  const taxesAmount = taxesBreakdown?.amount ?? 0;
  const taxesRevenuePct = overview.revenue > 0 ? (taxesAmount / overview.revenue) * 100 : 0;
  const taxesExpensePct = overview.totalExpenses > 0 ? (taxesAmount / overview.totalExpenses) * 100 : 0;

  const utilitiesAmount = utilitiesBreakdown?.amount ?? 0;
  const commAmount = commBreakdown?.amount ?? 0;
  const electricityUtilitiesAmount = utilitiesAmount + commAmount;
  const electricityExpensePct =
    overview.totalExpenses > 0 ? (electricityUtilitiesAmount / overview.totalExpenses) * 100 : 0;
  const electricityRevenuePct =
    overview.revenue > 0 ? (electricityUtilitiesAmount / overview.revenue) * 100 : 0;

  const priorityTotal = breakdownWithAmount
    .filter(c => PRIORITY_EXPENSE_CATEGORIES.includes(c.category))
    .reduce((s, c) => s + c.amount, 0);
  const baseTotal = breakdownWithAmount
    .filter(c => BASE_EXPENSE_CATEGORIES.includes(c.category))
    .reduce((s, c) => s + c.amount, 0);
  const additionalTotal = breakdownWithAmount
    .filter(c => ADDITIONAL_EXPENSE_CATEGORIES.includes(c.category))
    .reduce((s, c) => s + c.amount, 0);
  const totalGroupBase = Math.max(1, priorityTotal + baseTotal + additionalTotal);

  const visibleCategories =
    expenseGroup === 'ALL'
      ? [
          ...breakdownWithAmount.filter(c => PRIORITY_EXPENSE_CATEGORIES.includes(c.category)),
          ...breakdownWithAmount.filter(c => !PRIORITY_EXPENSE_CATEGORIES.includes(c.category)),
        ].slice(0, 5)
      : breakdownWithAmount.filter(c => EXPENSE_GROUP_META[expenseGroup].categories.includes(c.category));

  const openExpensesWithGroup = (group: ExpenseGroupId) => {
    if (onOpenExpensesGroup) {
      onOpenExpensesGroup(group);
    } else {
      onNavigate('expenses');
    }
  };

  const topDistrict =
    districtGeo?.topDistrict ??
    (districtGeo?.districts ? [...districtGeo.districts].sort((a, b) => b.orders - a.orders)[0] : undefined);
  const liveOrdersCount =
    districtGeo?.districts.reduce((sum, d) => sum + d.orders, 0) || overview.deliveredOrders;

  return (
    <div className="grid gap-5">
      {/* Sleek Dribbble-Style AI Dashboard Switcher & Prompt Bar */}
      <div className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {onSelectCustomDashboard && (
              <button
                type="button"
                onClick={() => onSelectCustomDashboard(null)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  !activeCustom
                    ? 'bg-[var(--cta-bg)] text-[var(--cta-text)] shadow-xs'
                    : 'bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {t.nav.dashboard}
              </button>
            )}
            {customDashboards.map(d => {
              const selected = activeCustom?.id === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectCustomDashboard?.(d.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="max-w-[180px] truncate">{d.title}</span>
                  <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.2 text-[10px] text-[var(--muted)]">
                    {d.blocks.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAiBuilder(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-[var(--accent)]"
            >
              <IconSparkles size={13} className="text-[var(--accent)]" />
              {lang === 'uz' ? 'AI Konstruktor' : lang === 'ru' ? 'AI Конструктор' : 'AI Builder'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('agent')}
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              {lang === 'uz' ? 'AI Agent →' : lang === 'ru' ? 'Чат с ИИ →' : 'AI Chat →'}
            </button>
          </div>
        </div>

        {(showAiBuilder || activeCustom) && (
          <div className="grid gap-2.5 border-t border-[var(--border)] pt-3">
            <form onSubmit={handleAiFormSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                className="input-field min-h-0 flex-1 rounded-full py-2 text-xs"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                disabled={aiCommandBusy}
                placeholder={
                  activeCustom
                    ? lang === 'uz'
                      ? `AI orqali «${activeCustom.title}» panelini boshqaring...`
                      : lang === 'ru'
                        ? `Управление дашбордом «${activeCustom.title}» через ИИ...`
                        : `Ask AI to manage "${activeCustom.title}"...`
                    : lang === 'uz'
                      ? 'AI orqali maxsus dashboard yarating (masalan: «Toshkent xaritasi va yetkazish»)...'
                      : lang === 'ru'
                        ? 'Попросите ИИ собрать кастомный дашборд (напр.: «Создай дашборд по продажам»)...'
                        : 'Ask AI to build a custom dashboard (e.g. "Create sales dashboard")...'
                }
              />
              <button
                type="submit"
                disabled={aiCommandBusy || !aiInput.trim()}
                className="btn-primary min-h-0 shrink-0 px-4 py-2 text-xs"
              >
                {aiCommandBusy
                  ? lang === 'uz'
                    ? 'AI...'
                    : lang === 'ru'
                      ? 'ИИ...'
                      : 'Running...'
                  : lang === 'uz'
                    ? 'Yaratish'
                    : lang === 'ru'
                      ? 'Выполнить ИИ'
                      : 'Run AI'}
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-1.5">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={aiCommandBusy}
                  onClick={() => void onRunAiDashboardCommand?.(p.prompt)}
                  className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))}
              {activeCustom && (
                <>
                  <button
                    type="button"
                    disabled={aiCommandBusy}
                    onClick={() =>
                      void onRunAiDashboardCommand?.(
                        lang === 'uz'
                          ? 'Dashboardga Toshkent tumanlari xaritasini qo‘sh'
                          : lang === 'ru'
                            ? 'Добавь в этот дашборд карту районов Ташкента'
                            : 'Add Tashkent districts map to this dashboard',
                      )
                    }
                    className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    {lang === 'uz' ? '+ Xaritani qo‘shish' : lang === 'ru' ? '+ Добавить карту' : '+ Append Map'}
                  </button>
                  <button
                    type="button"
                    disabled={aiCommandBusy}
                    onClick={() =>
                      void onRunAiDashboardCommand?.(
                        lang === 'uz'
                          ? 'Dashboardga byudjet grafik va jadvalini qo‘sh'
                          : lang === 'ru'
                            ? 'Добавь в этот дашборд бюджеты и прогноз перерасхода'
                            : 'Add budget forecast chart to this dashboard',
                      )
                    }
                    className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    {lang === 'uz' ? '+ Byudjetni qo‘shish' : lang === 'ru' ? '+ Добавить бюджеты' : '+ Append Budgets'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {aiCommandBanner && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--good)]/40 bg-[var(--good-soft)] px-3.5 py-2 text-xs font-medium text-[var(--good)]">
            <span>{aiCommandBanner}</span>
            {onDismissAiBanner && (
              <button
                type="button"
                onClick={onDismissAiBanner}
                className="text-xs font-semibold opacity-75 hover:opacity-100"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selected AI Custom Dashboard View */}
      {activeCustom ? (
        <div className="grid gap-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                  AI Custom Dashboard
                </span>
                <span className="text-[11px] text-[var(--muted)]">
                  {new Date(activeCustom.createdAt).toLocaleString()}
                </span>
              </div>

              {editingId === activeCustom.id ? (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    commitRename(activeCustom.id);
                  }}
                  className="mt-2 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    className="input-field max-w-sm py-1 text-sm font-medium"
                    value={draftTitle}
                    onChange={e => setDraftTitle(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="btn-primary min-h-0 px-3 py-1.5 text-xs">
                    {t.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="btn-secondary min-h-0 px-3 py-1.5 text-xs"
                  >
                    {t.cancel}
                  </button>
                </form>
              ) : (
                <h2 className="m-0 mt-1.5 truncate text-lg font-medium tracking-tight">{activeCustom.title}</h2>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onSelectCustomDashboard && (
                <button
                  type="button"
                  onClick={() => onSelectCustomDashboard(null)}
                  className="btn-secondary min-h-0 px-3 py-1.5 text-xs"
                >
                  ← {lang === 'uz' ? 'Asosiy sharh' : lang === 'ru' ? 'К обзору' : 'Overview'}
                </button>
              )}
              {onRenameCustomDashboard && editingId !== activeCustom.id && (
                <button
                  type="button"
                  onClick={() => startRename(activeCustom)}
                  className="btn-secondary min-h-0 px-3 py-1.5 text-xs"
                >
                  {lang === 'uz' ? 'Nomlash' : lang === 'ru' ? 'Переименовать' : 'Rename'}
                </button>
              )}
              {onDeleteCustomDashboard && (
                <button
                  type="button"
                  onClick={() => onDeleteCustomDashboard(activeCustom.id)}
                  className="rounded-full border border-[var(--bad)]/40 bg-[var(--bad-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--bad)] hover:border-[var(--bad)]"
                >
                  {t.delete}
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3">
            {activeCustom.blocks.map(block => (
              <div key={block.id} className="relative">
                {onRemoveWidgetFromDashboard && activeCustom.blocks.length > 1 && (
                  <div className="mb-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onRemoveWidgetFromDashboard(activeCustom.id, block.id)}
                      className="text-[11px] font-medium text-[var(--muted)] hover:text-[var(--bad)]"
                    >
                      ✕ {lang === 'uz' ? 'Vidjetni olib tashlash' : lang === 'ru' ? 'Убрать виджет' : 'Remove widget'}
                    </button>
                  </div>
                )}
                <AgentBlocks
                  blocks={[block]}
                  lang={lang}
                  onAction={act => onExecuteAction?.(act)}
                  onPinBlock={onPinBlock}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ROW 1: 4 Signature 38-Tick Animated KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-widget-id="widget-kpis">
            <TickStatCard
              title={t.revenue}
              value={fmtCompactMoney(overview.revenue, lang)}
              delta={`${overview.revenueDeltaPct >= 0 ? '+' : ''}${overview.revenueDeltaPct.toFixed(1)}%`}
              deltaTone={overview.revenueDeltaPct >= 0 ? 'good' : 'bad'}
              fillRatio={Math.min(0.92, Math.max(0.32, 0.68 + overview.revenueDeltaPct / 100))}
              ticksColor="ink"
              footerLabel={t.avgCheck}
              footerRight={fmtMoney(overview.avgOrderValue, lang)}
              icon={<IconWallet size={15} />}
              onClick={() => onNavigate('sales')}
              delayMs={0}
            />

            <TickStatCard
              title={t.netProfit}
              value={fmtCompactMoney(overview.netProfit, lang)}
              delta={`${overview.netMarginPct.toFixed(1)}%`}
              deltaTone={overview.netProfit >= 0 ? 'good' : 'bad'}
              fillRatio={Math.min(0.95, Math.max(0.2, Math.abs(overview.netMarginPct) / 40))}
              ticksColor="mint"
              footerLabel={t.margin}
              footerRight={`${overview.netMarginPct.toFixed(1)}%`}
              icon={<IconCoins size={15} />}
              onClick={() => onNavigate('audit')}
              delayMs={60}
            />

            <TickStatCard
              title={t.foodCost}
              value={`${overview.foodCostPct.toFixed(1)}%`}
              delta={overview.foodCostPct <= 35 ? 'OK' : `+${(overview.foodCostPct - 35).toFixed(1)}%`}
              deltaTone={overview.foodCostPct <= 35 ? 'good' : 'bad'}
              fillRatio={Math.min(0.95, Math.max(0.2, overview.foodCostPct / 55))}
              ticksColor="pink"
              footerLabel="Target 28–35%"
              footerRight={fmtCompactMoney(overview.totalExpenses, lang)}
              icon={<IconReceipt size={15} />}
              onClick={() => onNavigate('expenses')}
              delayMs={120}
            />

            <TickStatCard
              title={t.orders}
              value={String(overview.deliveredOrders)}
              delta={`${overview.cancelRatePct.toFixed(1)}%`}
              deltaTone={overview.cancelRatePct <= 6 ? 'good' : 'bad'}
              fillRatio={Math.max(0.25, 1 - overview.cancelRatePct / 35)}
              ticksColor="violet"
              footerLabel={t.cancelRate}
              footerRight={`${overview.cancelledOrders} (${fmtCompactMoney(overview.lostRevenue, lang)})`}
              icon={<IconBag size={15} />}
              onClick={() => onNavigate('sales')}
              delayMs={180}
            />
          </div>

          {/* Secondary Compact KPI Strip preserving all 8 metrics cleanly */}
          <div className="card grid grid-cols-2 divide-y divide-[var(--border)] lg:grid-cols-4 lg:divide-x lg:divide-y-0">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-[11px] font-medium text-[var(--muted)]">{t.totalExpenses}</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums">{fmtMoney(overview.totalExpenses, lang)}</div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                  overview.expensesDeltaPct <= 0
                    ? 'bg-[var(--good-soft)] text-[var(--good)]'
                    : 'bg-[var(--warn-soft)] text-[var(--warn)]'
                }`}
              >
                {overview.expensesDeltaPct >= 0 ? '+' : ''}
                {overview.expensesDeltaPct.toFixed(1)}%
              </span>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-[11px] font-medium text-[var(--muted)]">{t.laborCost}</div>
                <div
                  className={`mt-0.5 text-sm font-semibold tabular-nums ${
                    overview.laborCostPct > 30 ? 'text-[var(--warn)]' : ''
                  }`}
                >
                  {overview.laborCostPct.toFixed(1)}%
                </div>
              </div>
              <span className="text-[11px] text-[var(--muted)]">≤ 30%</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-[11px] font-medium text-[var(--muted)]">{t.adminUtility}</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums">
                  {overview.adminUtilityCostPct.toFixed(1)}%
                </div>
              </div>
              <span className="text-[11px] text-[var(--muted)]">Rent & Utility</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-[11px] font-medium text-[var(--muted)]">{t.lost}</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--bad)]">
                  {fmtMoney(overview.lostRevenue, lang)}
                </div>
              </div>
              <span className="text-[11px] text-[var(--muted)]">{overview.cancelledOrders} ord</span>
            </div>
          </div>

          {/* Priority Expenses Spotlight: Taxes, Electricity & Cost Groups */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" data-widget-id="widget-priority-expenses">
            {/* Taxes Priority Card */}
            <button
              type="button"
              onClick={() => openExpensesWithGroup('PRIORITY')}
              className="card flex items-center justify-between gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                    {t.priorityBadge}
                  </span>
                  <span className="truncate text-[12px] font-medium text-[var(--muted)]">{t.taxes}</span>
                </div>
                <div className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums text-[var(--text)]">
                  {fmtMoney(taxesAmount, lang)}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
                  {taxesRevenuePct.toFixed(1)}%{' '}
                  {lang === 'uz' ? 'tushumdan' : lang === 'ru' ? 'от выручки' : 'of rev'} ·{' '}
                  {taxesExpensePct.toFixed(1)}%{' '}
                  {lang === 'uz' ? 'xarajatdan' : lang === 'ru' ? 'от расходов' : 'of exp'}
                </div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bad-soft)] text-xs font-bold text-[var(--bad)] tabular-nums">
                {taxesExpensePct.toFixed(0)}%
              </div>
            </button>

            {/* Electricity & Utilities Priority Card */}
            <button
              type="button"
              onClick={() => openExpensesWithGroup('PRIORITY')}
              className="card flex items-center justify-between gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: 'rgba(255, 138, 71, 0.14)', color: 'var(--accent-3)' }}
                  >
                    {t.priorityBadge}
                  </span>
                  <span className="truncate text-[12px] font-medium text-[var(--muted)]">
                    {t.electricityUtilities}
                  </span>
                </div>
                <div className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums text-[var(--text)]">
                  {fmtMoney(electricityUtilitiesAmount, lang)}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
                  {electricityExpensePct.toFixed(1)}%{' '}
                  {lang === 'uz' ? 'xarajatdan' : lang === 'ru' ? 'от расходов' : 'of exp'} ·{' '}
                  {electricityRevenuePct.toFixed(1)}%{' '}
                  {lang === 'uz' ? 'tushumdan' : lang === 'ru' ? 'выручки' : 'rev'}
                </div>
              </div>
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold tabular-nums"
                style={{ background: 'rgba(255, 138, 71, 0.14)', color: 'var(--accent-3)' }}
              >
                {electricityExpensePct.toFixed(0)}%
              </div>
            </button>

            {/* Priority vs Base vs Additional Cost Groups */}
            <div className="card flex flex-col justify-between gap-2.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-[var(--muted)]">
                  {lang === 'uz'
                    ? 'Xarajat guruhlari'
                    : lang === 'ru'
                      ? 'Группы затрат'
                      : 'Cost Group Mix'}
                </span>
                <button
                  type="button"
                  onClick={() => openExpensesWithGroup('ALL')}
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
                >
                  {t.all}
                  <IconChevronRight size={12} />
                </button>
              </div>

              <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  style={{
                    width: `${(priorityTotal / totalGroupBase) * 100}%`,
                    background: 'var(--accent)',
                  }}
                />
                <div
                  style={{
                    width: `${(baseTotal / totalGroupBase) * 100}%`,
                    background: 'var(--mint)',
                  }}
                />
                <div
                  style={{
                    width: `${(additionalTotal / totalGroupBase) * 100}%`,
                    background: 'var(--accent-2)',
                  }}
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px] tabular-nums">
                <button
                  type="button"
                  onClick={() => openExpensesWithGroup('PRIORITY')}
                  className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-left transition hover:bg-[var(--accent-soft)]"
                >
                  <div className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    <span className="truncate">{EXPENSE_GROUP_META.PRIORITY.shortLabel[lang]}</span>
                  </div>
                  <div className="font-semibold text-[var(--text)]">{fmtCompactMoney(priorityTotal, lang)}</div>
                </button>
                <button
                  type="button"
                  onClick={() => openExpensesWithGroup('BASE')}
                  className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-left transition hover:bg-[var(--mint-soft)]"
                >
                  <div className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--mint)]" />
                    <span className="truncate">{EXPENSE_GROUP_META.BASE.shortLabel[lang]}</span>
                  </div>
                  <div className="font-semibold text-[var(--text)]">{fmtCompactMoney(baseTotal, lang)}</div>
                </button>
                <button
                  type="button"
                  onClick={() => openExpensesWithGroup('ADDITIONAL')}
                  className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-left transition hover:bg-[var(--info-soft)]"
                >
                  <div className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-2)]" />
                    <span className="truncate">{EXPENSE_GROUP_META.ADDITIONAL.shortLabel[lang]}</span>
                  </div>
                  <div className="font-semibold text-[var(--text)]">{fmtCompactMoney(additionalTotal, lang)}</div>
                </button>
              </div>
            </div>
          </div>

          {/* ROW 2: Key Performance Chart (2 cols) + Live District Tracking Map (1 col) */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="card p-5 xl:col-span-2" data-widget-id="widget-rev-exp">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconActivity size={16} className="text-[var(--muted)]" />
                  <h2 className="m-0 text-[15px] font-medium tracking-tight">{t.revVsExp}</h2>
                </div>
                <span className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1 text-[11.5px] font-medium text-[var(--muted)] tabular-nums">
                  {overview.period.from === overview.period.to
                    ? overview.period.from
                    : `${overview.period.from} — ${overview.period.to}`}{' '}
                  · {timeseries.length}
                </span>
              </div>
              <RevenueExpenseChart data={timeseries} lang={lang} />
            </div>

            {/* Dribbble Live Tracking Card */}
            <div className="card flex flex-col justify-between p-5" data-widget-id="widget-map-preview">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="m-0 text-[15px] font-medium tracking-tight">
                  {lang === 'uz'
                    ? 'Jonli tumanlar xaritasi'
                    : lang === 'ru'
                      ? 'Живая карта доставки'
                      : 'Live Tracking'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('map')}
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  {lang === 'uz' ? 'Barchasi' : lang === 'ru' ? 'Все' : 'See All'}
                  <IconChevronRight size={14} />
                </button>
              </div>

              <TashkentDistrictMap
                districts={districtGeo?.districts ?? []}
                branches={districtGeo?.branches ?? []}
                heatmapCells={districtGeo?.heatmapCells ?? []}
                metric="orders"
                lang={lang}
                compact
                minimal
                onSelectDistrict={() => onNavigate('map')}
              />

              <button
                type="button"
                onClick={() => onNavigate('map')}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/70 p-3 text-left transition hover:border-[var(--border-strong)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#27272a] text-white">
                    <IconBox size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-[var(--text)]">
                      {topDistrict ? topDistrict.name[lang] : 'Tashkent · 12'}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--muted)] tabular-nums">
                      {liveOrdersCount} {t.orders.toLowerCase()} ·{' '}
                      {fmtCompactMoney(topDistrict?.revenue ?? overview.revenue, lang)}
                    </div>
                  </div>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: 'var(--mint-soft)', color: 'var(--mint)' }}
                >
                  <LiveSunburstIcon />
                  {lang === 'uz' ? 'Faol' : lang === 'ru' ? 'Онлайн' : 'On time'}
                </span>
              </button>
            </div>
          </div>

          {/* ROW 3: Gradient Progress Bars (Left) + Alert Feed (Center) + Glowing Pink AI Orb (Right) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Expense Structure Gradient Sliders */}
            <div className="card flex min-w-0 flex-col justify-between overflow-hidden p-5" data-widget-id="widget-categories">
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="m-0 text-[15px] font-medium tracking-tight">{t.expenseStructure}</h2>
                  <button
                    type="button"
                    onClick={() => openExpensesWithGroup(expenseGroup)}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    {lang === 'ru' ? 'Все' : lang === 'uz' ? 'Barchasi' : 'All'}
                    <IconChevronRight size={14} />
                  </button>
                </div>

                {/* Category Group Filter Pills */}
                <div className="no-scrollbar mb-3.5 flex items-center gap-1 overflow-x-auto rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-[11px] font-medium">
                  {(['ALL', 'PRIORITY', 'BASE', 'ADDITIONAL'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setExpenseGroup(g)}
                      className={`shrink-0 rounded-full px-2.5 py-1 whitespace-nowrap transition ${
                        expenseGroup === g
                          ? 'bg-[var(--cta-bg)] text-[var(--cta-text)] shadow-xs'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {EXPENSE_GROUP_META[g].shortLabel[lang]}
                    </button>
                  ))}
                </div>

                {visibleCategories.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[var(--muted)]">{t.noData}</p>
                ) : (
                  <div className="grid gap-3.5">
                    {visibleCategories.map((cat, idx) => (
                      <GradientSliderRow
                        key={cat.category}
                        label={CATEGORY_LABELS[cat.category][lang]}
                        valueText={fmtCompactMoney(cat.amount, lang)}
                        sharePct={cat.sharePct}
                        tone={
                          cat.category === 'TAXES'
                            ? 'pink'
                            : cat.category === 'UTILITIES'
                              ? 'orange'
                              : cat.category === 'COMMUNICATION'
                                ? 'blue'
                                : SLIDER_TONES[idx % SLIDER_TONES.length]
                        }
                        delayMs={idx * 70}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <div className="mb-2 text-[11.5px] font-medium text-[var(--muted)]">{t.paymentSplit}</div>
                <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                  <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                    <div className="text-[11px] text-[var(--muted)]">{t.cash} ({overview.paymentSplit.cashOrders})</div>
                    <div className="mt-0.5 font-semibold text-[var(--text)]">
                      {fmtCompactMoney(overview.paymentSplit.cashRevenue, lang)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                    <div className="text-[11px] text-[var(--muted)]">{t.card} ({overview.paymentSplit.cardOrders})</div>
                    <div className="mt-0.5 font-semibold text-[var(--text)]">
                      {fmtCompactMoney(overview.paymentSplit.cardRevenue, lang)}
                    </div>
                  </div>
                </div>
                {overview.paymentSplit.unpaidCardOrders > 0 && (
                  <div className="mt-2 rounded-xl bg-[var(--bad-soft)] px-3 py-2 text-xs font-medium text-[var(--bad)]">
                    {t.unpaidCard}: {overview.paymentSplit.unpaidCardOrders} (
                    {fmtMoney(overview.paymentSplit.unpaidCardAmount, lang)})
                  </div>
                )}
              </div>
            </div>

            {/* Dribbble Alert Feed */}
            <div className="card flex min-w-0 flex-col justify-between overflow-hidden p-5" data-widget-id="widget-findings">
              <div className="min-w-0">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="m-0 text-[15px] font-medium tracking-tight">
                    {t.urgentFindings} ({findings.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigate('audit')}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    {t.openAudit}
                    <IconChevronRight size={14} />
                  </button>
                </div>

                {findings.length === 0 ? (
                  <p className="py-10 text-center text-xs text-[var(--muted)]">{t.noData}</p>
                ) : (
                  <div className="grid gap-2.5">
                    {findings.slice(0, 4).map((f, idx) => {
                      const tone =
                        f.kind === 'ERROR'
                          ? 'bad'
                          : f.kind === 'INEFFICIENCY'
                            ? 'warn'
                            : 'info';
                      const icon =
                        f.kind === 'ERROR' ? (
                          <IconAlertTriangle size={17} />
                        ) : f.kind === 'INEFFICIENCY' ? (
                          <IconTrendingDown size={17} />
                        ) : (
                          <IconWrench size={17} />
                        );
                      return (
                        <AlertFeedRow
                          key={f.id}
                          icon={icon}
                          tone={tone}
                          title={f.title[lang]}
                          subtitle={f.detail[lang]}
                          pillText={fmtCompactMoney(f.amountImpact, lang)}
                          onClick={() => onNavigate('audit')}
                          delayMs={idx * 75}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Dribbble Glowing Pink AI Orb Insight Card */}
            <div data-widget-id="widget-health" className="flex min-w-0 flex-col [&>.card]:flex-1">
              <AiInsightOrbCard
                badgeLabel={t.healthScore}
                score={report.healthScore}
                updatedLabel={report.statusLabel[lang]}
                headline={report.executiveSummary[lang]}
                statusLine={`${t.potentialSaving}: ${fmtMoney(report.totalPotentialSavingUZS, lang)}`}
                ctaLabel={t.openAudit}
                onCta={() => onNavigate('audit')}
              />
            </div>
          </div>

          {/* Pinned AI Widgets */}
          {pinnedBlocks.length > 0 && (
            <div className="card grid gap-3 p-5" data-widget-id="widget-pinned">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-[15px] font-medium tracking-tight">
                  {lang === 'uz'
                    ? 'AI Agentdan biriktirilgan vidjetlar'
                    : lang === 'ru'
                      ? 'Закреплённые AI-виджеты'
                      : 'Pinned AI Insights'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('agent')}
                  className="text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  + {t.nav.agent}
                </button>
              </div>
              {pinnedBlocks.map(block => (
                <div key={block.id} className="relative">
                  {onUnpinBlock && (
                    <button
                      type="button"
                      onClick={() => onUnpinBlock(block.id)}
                      className="mb-1 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--bad)]"
                    >
                      ✕ Remove widget
                    </button>
                  )}
                  <AgentBlocks
                    blocks={[block]}
                    lang={lang}
                    onAction={act => onExecuteAction?.(act)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
