import { useState, type FormEvent } from 'react';
import type {
  AgentClientAction,
  AgentUiBlock,
  AiOptimizationReport,
  BusinessKpiOverview,
  Finding,
  Language,
  TimeseriesPoint,
} from '@uzbite/shared';
import { AgentBlocks } from '../components/AgentBlocks';
import { CategoryDonutChart, RevenueExpenseChart } from '../components/Charts';
import { COPY, fmtMoney, type NavTab } from '../lib/i18n';

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

function DeltaBadge({ pct, label }: { pct: number; label: string }) {
  const positive = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
      positive ? 'bg-[var(--good-soft)] text-[var(--good)]' : 'bg-[var(--bad-soft)] text-[var(--bad)]'
    }`}>
      {positive ? '+' : ''}{pct.toFixed(1)}% · {label}
    </span>
  );
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

export function DashboardPage({
  lang,
  overview,
  timeseries,
  findings,
  report,
  onNavigate,
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
  onNavigate: (tab: NavTab) => void;
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

  const activeCustom = activeCustomDashboardId
    ? customDashboards.find(d => d.id === activeCustomDashboardId) ?? null
    : null;

  const healthColor =
    report.healthScore >= 80 ? 'var(--good)' : report.healthScore >= 55 ? 'var(--warn)' : 'var(--bad)';

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

  return (
    <div className="grid gap-5">
      {/* AI Dashboard Controller & Switcher Bar */}
      <div className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {onSelectCustomDashboard && (
              <button
                type="button"
                onClick={() => onSelectCustomDashboard(null)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  !activeCustom
                    ? 'bg-[var(--accent)] text-white'
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
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)]'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="max-w-[180px] truncate">{d.title}</span>
                  <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.2 text-[10px] text-[var(--muted)]">
                    {d.blocks.length}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('agent')}
            className="text-xs font-bold text-[var(--accent)] hover:underline"
          >
            {lang === 'uz' ? 'AI Agent suhbati →' : lang === 'ru' ? 'Открыть чат с ИИ →' : 'Open AI Chat →'}
          </button>
        </div>

        {/* Inline AI Command Input for Dashboard Control */}
        <form onSubmit={handleAiFormSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            className="input-field min-h-0 flex-1 py-2 text-xs"
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            disabled={aiCommandBusy}
            placeholder={
              activeCustom
                ? lang === 'uz'
                  ? `AI orqali «${activeCustom.title}» panelini boshqaring (masalan: «Xaritani qo'sh», «Jadvalni olib tashla», «Nomini ... deb o'zgartir»)...`
                  : lang === 'ru'
                    ? `Управление дашбордом «${activeCustom.title}» через ИИ (напр.: «Добавь карту районов», «Убери таблицу», «Переименуй в Контроль»)...`
                    : `Ask AI to manage "${activeCustom.title}" (e.g. "Add district map", "Remove table", "Rename to Q4 Control")...`
                : lang === 'uz'
                  ? 'AI orqali dashboard yarating yoki boshqaring (masalan: «Savdo va menyu bo‘yicha dashboard yarat», «7 kunlik davrni ko‘rsat»)...'
                  : lang === 'ru'
                    ? 'Попросите ИИ собрать или изменить дашборд (напр.: «Создай дашборд по продажам», «Добавь карту Ташкента», «Покажи за 7 дней»)...'
                    : 'Ask AI to build or control dashboards (e.g. "Create sales dashboard", "Add Tashkent map", "Show 7 days")...'
            }
          />
          <button
            type="submit"
            disabled={aiCommandBusy || !aiInput.trim()}
            className="btn-primary min-h-0 shrink-0 px-4 py-2 text-xs"
          >
            {aiCommandBusy
              ? lang === 'uz'
                ? 'AI bajarilmoqda...'
                : lang === 'ru'
                  ? 'ИИ выполняет...'
                  : 'AI Running...'
              : lang === 'uz'
                ? 'AI Bajarish'
                : lang === 'ru'
                  ? 'Выполнить ИИ'
                  : 'Run AI'}
          </button>
        </form>

        {/* Quick 1-click AI Dashboard Presets & Modifiers */}
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p, idx) => (
            <button
              key={idx}
              type="button"
              disabled={aiCommandBusy}
              onClick={() => void onRunAiDashboardCommand?.(p.prompt)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
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
                className="rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                {lang === 'uz' ? '+ Xaritani qo‘shish' : lang === 'ru' ? '+ Добавить карту в дашборд' : '+ Append Map'}
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
                className="rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                {lang === 'uz' ? '+ Byudjetni qo‘shish' : lang === 'ru' ? '+ Добавить бюджеты' : '+ Append Budgets'}
              </button>
            </>
          )}
        </div>

        {aiCommandBanner && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--good)]/50 bg-[var(--good-soft)] px-3.5 py-2 text-xs font-bold text-[var(--good)]">
            <span>{aiCommandBanner}</span>
            {onDismissAiBanner && (
              <button
                type="button"
                onClick={onDismissAiBanner}
                className="text-xs font-extrabold opacity-75 hover:opacity-100"
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
                <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-extrabold text-[var(--accent)]">
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
                    className="input-field max-w-sm py-1 text-sm font-bold"
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
                <h2 className="m-0 mt-1.5 truncate text-lg font-extrabold">{activeCustom.title}</h2>
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
                  className="rounded-xl border border-[var(--bad)]/40 bg-[var(--bad-soft)] px-3 py-1.5 text-xs font-bold text-[var(--bad)] hover:border-[var(--bad)]"
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
                      className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)]"
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
          {/* Item 26 AI Health Banner */}
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5" data-widget-id="widget-health">
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border-2 text-center"
                style={{ borderColor: healthColor, color: healthColor }}
              >
                <span className="text-xl font-extrabold leading-none tabular-nums">{report.healthScore}</span>
                <span className="mt-0.5 text-[10px] font-bold opacity-80">/ 100</span>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{t.healthScore}</div>
                <div className="mt-0.5 text-base font-extrabold">{report.statusLabel[lang]}</div>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
                  {report.executiveSummary[lang]}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[var(--accent-soft)] px-4 py-2.5 text-right">
                <div className="text-[11px] font-semibold text-[var(--muted)]">{t.potentialSaving}</div>
                <div className="text-base font-extrabold text-[var(--accent)] tabular-nums">
                  {fmtMoney(report.totalPotentialSavingUZS, lang)}
                </div>
              </div>
              <button type="button" onClick={() => onNavigate('audit')} className="btn-primary">
                {t.openAudit}
              </button>
            </div>
          </div>

          {/* 8 KPI Cards */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4" data-widget-id="widget-kpis">
            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--muted)]">{t.revenue}</div>
              <div className="mt-1.5 text-xl font-extrabold tabular-nums">{fmtMoney(overview.revenue, lang)}</div>
              <div className="mt-2"><DeltaBadge pct={overview.revenueDeltaPct} label={t.vsPrev} /></div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--muted)]">{t.netProfit}</div>
              <div className={`mt-1.5 text-xl font-extrabold tabular-nums ${overview.netProfit >= 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'}`}>
                {fmtMoney(overview.netProfit, lang)}
              </div>
              <div className="mt-2 text-xs font-semibold text-[var(--muted)]">
                {t.margin}: <strong className="text-[var(--text)]">{overview.netMarginPct.toFixed(1)}%</strong>
              </div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--muted)]">{t.totalExpenses}</div>
              <div className="mt-1.5 text-xl font-extrabold tabular-nums">{fmtMoney(overview.totalExpenses, lang)}</div>
              <div className="mt-2"><DeltaBadge pct={overview.expensesDeltaPct} label={t.vsPrev} /></div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--muted)]">{t.foodCost}</div>
              <div className={`mt-1.5 text-xl font-extrabold tabular-nums ${overview.foodCostPct > 35 ? 'text-[var(--bad)]' : 'text-[var(--good)]'}`}>
                {overview.foodCostPct.toFixed(1)}%
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">Target: 28–35%</div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--muted)]">{t.laborCost}</div>
              <div className={`mt-1.5 text-xl font-extrabold tabular-nums ${overview.laborCostPct > 30 ? 'text-[var(--warn)]' : ''}`}>
                {overview.laborCostPct.toFixed(1)}%
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">Target: ≤ 30%</div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--muted)]">{t.adminUtility}</div>
              <div className="mt-1.5 text-xl font-extrabold tabular-nums">{overview.adminUtilityCostPct.toFixed(1)}%</div>
              <div className="mt-2 text-xs text-[var(--muted)]">Rent + Utilities + Telecom</div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--muted)]">{t.orders}</div>
              <div className="mt-1.5 text-xl font-extrabold tabular-nums">{overview.deliveredOrders}</div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                {t.avgCheck}: <strong className="text-[var(--text)] tabular-nums">{fmtMoney(overview.avgOrderValue, lang)}</strong>
              </div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-[var(--muted)]">{t.cancelRate}</div>
              <div className={`mt-1.5 text-xl font-extrabold tabular-nums ${overview.cancelRatePct > 10 ? 'text-[var(--bad)]' : ''}`}>
                {overview.cancelRatePct.toFixed(1)}% ({overview.cancelledOrders})
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                {t.lost}: <strong className="text-[var(--bad)] tabular-nums">{fmtMoney(overview.lostRevenue, lang)}</strong>
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="card p-5 xl:col-span-2" data-widget-id="widget-rev-exp">
              <h2 className="m-0 mb-3 text-sm font-extrabold">{t.revVsExp}</h2>
              <RevenueExpenseChart data={timeseries} lang={lang} />
            </div>

            <div className="card flex flex-col justify-between p-5" data-widget-id="widget-categories">
              <div>
                <h2 className="m-0 mb-4 text-sm font-extrabold">{t.expenseStructure}</h2>
                <CategoryDonutChart items={overview.categoryBreakdown} lang={lang} />
              </div>

              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <div className="mb-2 text-xs font-bold text-[var(--muted)]">{t.paymentSplit}</div>
                <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                  <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                    <div className="text-[var(--muted)]">{t.cash} ({overview.paymentSplit.cashOrders})</div>
                    <div className="mt-0.5 font-extrabold">{fmtMoney(overview.paymentSplit.cashRevenue, lang)}</div>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                    <div className="text-[var(--muted)]">{t.card} ({overview.paymentSplit.cardOrders})</div>
                    <div className="mt-0.5 font-extrabold">{fmtMoney(overview.paymentSplit.cardRevenue, lang)}</div>
                  </div>
                </div>
                {overview.paymentSplit.unpaidCardOrders > 0 && (
                  <div className="mt-2 rounded-xl bg-[var(--bad-soft)] px-3 py-2 text-xs font-semibold text-[var(--bad)]">
                    {t.unpaidCard}: {overview.paymentSplit.unpaidCardOrders} ({fmtMoney(overview.paymentSplit.unpaidCardAmount, lang)})
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pinned AI Widgets */}
          {pinnedBlocks.length > 0 && (
            <div className="card grid gap-3 p-5" data-widget-id="widget-pinned">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-sm font-extrabold">
                  {lang === 'uz' ? 'AI Agentdan biriktirilgan vidjetlar' : lang === 'ru' ? 'Закреплённые AI-виджеты' : 'Pinned AI Insights'}
                </h2>
                <button type="button" onClick={() => onNavigate('agent')} className="text-xs font-bold text-[var(--accent)]">
                  + {t.nav.agent}
                </button>
              </div>
              {pinnedBlocks.map(block => (
                <div key={block.id} className="relative">
                  {onUnpinBlock && (
                    <button
                      type="button"
                      onClick={() => onUnpinBlock(block.id)}
                      className="mb-1 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)]"
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

          {/* Top Urgent Findings */}
          <div className="card p-5" data-widget-id="widget-findings">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="m-0 text-sm font-extrabold">{t.urgentFindings} ({findings.length})</h2>
              <button type="button" onClick={() => onNavigate('audit')} className="text-xs font-bold text-[var(--accent)]">
                {t.openAudit}
              </button>
            </div>

            <div className="grid gap-2.5">
              {findings.slice(0, 5).map(f => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        f.kind === 'ERROR'
                          ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                          : f.kind === 'INEFFICIENCY'
                            ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                            : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      }`}>
                        {f.kind} · {f.code}
                      </span>
                      <span className="text-sm font-bold">{f.title[lang]}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">{f.detail[lang]}</p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <div className="text-[10px] font-semibold text-[var(--muted)]">{t.impact}</div>
                    <div className="text-sm font-extrabold text-[var(--bad)]">{fmtMoney(f.amountImpact, lang)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
