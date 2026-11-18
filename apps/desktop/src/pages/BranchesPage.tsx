import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Language } from '@uzbite/shared';
import {
  AnimatedProgressBar,
  EmptyStateCard,
  IconBuilding,
  IconCheck,
  IconChevronDown,
  IconRefresh,
  IconSparkles,
  IconSpinner,
  IconX,
  SkeletonCard,
  SkeletonRows,
} from '../components/DesignWidgets';
import { applyBranchAllocation, fetchBranchAllocation } from '../lib/api';
import { CATEGORY_COLORS, CATEGORY_LABELS, COPY, fmtCompactMoney, fmtMoney } from '../lib/i18n';

const OBJECTIVE_LABELS: Record<'balanced' | 'profit' | 'growth', Record<Language, string>> = {
  balanced: {
    ru: 'Баланс (ROI + Дисциплина)',
    uz: 'Muvozanat (ROI + Intizom)',
    en: 'Balanced (ROI + Discipline)',
  },
  profit: {
    ru: 'Макс. прибыль / ROI',
    uz: 'Maks. foyda / ROI',
    en: 'Max Profit / ROI',
  },
  growth: {
    ru: 'Спрос и рост',
    uz: 'Talab va o‘sish',
    en: 'Demand & Growth',
  },
};

const POOL_PRESETS = [80_000_000, 120_000_000, 180_000_000];

export function BranchesPage({
  lang,
  month,
  onMonthChange,
  onMutated,
}: {
  lang: Language;
  month: string;
  onMonthChange: (m: string) => void;
  onMutated: () => Promise<void>;
}) {
  const [totalBudgetInput, setTotalBudgetInput] = useState('120000000');
  const [objective, setObjective] = useState<'balanced' | 'profit' | 'growth'>('balanced');
  const [applying, setApplying] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const parsedBudget = Number(totalBudgetInput);
  const effectiveBudget = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 120_000_000;

  const query = useQuery({
    queryKey: ['business-branches-allocation', month, effectiveBudget, objective],
    queryFn: () => fetchBranchAllocation({ totalBudget: effectiveBudget, month, objective }),
  });

  const data = query.data;

  async function handleApplyAll() {
    if (!data) return;
    setApplying(true);
    setFeedback(null);
    try {
      const flat = data.branches.flatMap(b =>
        b.categoryAllocations.map(ca => ({
          restaurantId: b.restaurantId,
          category: ca.category,
          limit: ca.recommendedLimit,
        })),
      );
      const res = await applyBranchAllocation(data.month, flat);
      await onMutated();
      setFeedback({
        tone: 'good',
        text:
          lang === 'uz'
            ? `${res.month} uchun ${res.appliedCount} ta byudjet limiti qo‘llandi`
            : lang === 'ru'
              ? `Применено ${res.appliedCount} лимитов бюджета на ${res.month}`
              : `Applied ${res.appliedCount} category budget limits for ${res.month}`,
      });
    } catch (err) {
      setFeedback({
        tone: 'bad',
        text: err instanceof Error ? err.message : 'Failed to apply branch budgets',
      });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="animate-page-enter grid gap-5">
      {/* Header + Controls */}
      <div className="card animate-card-in stagger-1 flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
            Case #24 · Multi-Branch / BXM-BXO Budget Optimizer
          </span>
          <h1 className="m-0 mt-1.5 text-base font-semibold text-[var(--text)]">
            {lang === 'uz'
              ? 'Filiallar kesimida byudjet mablag‘larini optimal taqsimlash'
              : lang === 'ru'
                ? 'Оптимальное распределение бюджета по филиалам (Кейс #24)'
                : 'AI Multi-Branch Budget Optimization (Case #24)'}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {lang === 'uz'
              ? 'Tarixiy daromad, ROI, byudjet intizomi va o‘sish sur’atiga qarab limitlarni taqsimlash.'
              : lang === 'ru'
                ? 'Расчёт оптимальных лимитов по ROI, бюджетной дисциплине и росту спроса каждого филиала.'
                : 'Allocates pooled capital across branches using historical ROI, budget discipline, and growth.'}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {POOL_PRESETS.map(preset => {
              const active = effectiveBudget === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTotalBudgetInput(String(preset))}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums transition-all duration-150 ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'
                  }`}
                >
                  {fmtCompactMoney(preset, lang)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
            {lang === 'uz' ? 'Jami byudjet (UZS)' : lang === 'ru' ? 'Общий пул (UZS)' : 'Total Pool (UZS)'}
            <input
              type="number"
              min="1000000"
              step="1000000"
              className="input-field max-w-[170px] font-bold tabular-nums"
              value={totalBudgetInput}
              onChange={e => setTotalBudgetInput(e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
            {lang === 'uz' ? 'Strategiya' : lang === 'ru' ? 'Цель' : 'Objective'}
            <select
              className="input-field max-w-[200px] text-xs font-bold"
              value={objective}
              onChange={e => setObjective(e.target.value as 'balanced' | 'profit' | 'growth')}
            >
              {(['balanced', 'profit', 'growth'] as const).map(opt => (
                <option key={opt} value={opt}>{OBJECTIVE_LABELS[opt][lang]}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
            {lang === 'uz' ? 'Oy' : lang === 'ru' ? 'Месяц' : 'Month'}
            <input
              type="month"
              className="input-field max-w-[155px]"
              value={month}
              onChange={e => onMonthChange(e.target.value)}
            />
          </label>

          <button
            type="button"
            disabled={applying || !data}
            onClick={() => void handleApplyAll()}
            className="btn-primary text-xs"
          >
            {applying ? <IconSpinner size={13} /> : <IconSparkles size={13} />}
            {applying
              ? '...'
              : lang === 'uz'
                ? 'Tavsiyalarni qo‘llash'
                : lang === 'ru'
                  ? 'Применить AI-бюджеты'
                  : 'Apply AI Budgets'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`animate-slide-up flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-xs font-semibold ${
            feedback.tone === 'good'
              ? 'border-[var(--good)]/40 bg-[var(--good-soft)] text-[var(--good)]'
              : 'border-[var(--bad)]/40 bg-[var(--bad-soft)] text-[var(--bad)]'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {feedback.tone === 'good' && <IconCheck size={14} />}
            {feedback.text}
          </span>
          <button type="button" onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            <IconX size={13} />
          </button>
        </div>
      )}

      {query.isLoading && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
          </div>
          <SkeletonRows rows={3} />
        </>
      )}

      {query.isError && (
        <EmptyStateCard
          icon={<IconBuilding size={18} className="text-[var(--bad)]" />}
          title={
            lang === 'uz'
              ? 'Filiallar ma’lumotini yuklab bo‘lmadi'
              : lang === 'ru'
                ? 'Не удалось загрузить распределение по филиалам'
                : 'Failed to load branch allocation'
          }
          description={query.error instanceof Error ? query.error.message : undefined}
          actionLabel={COPY[lang].refresh}
          onAction={() => void query.refetch()}
        />
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card animate-card-in stagger-2 p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                {lang === 'uz' ? 'Jami byudjet fondi' : lang === 'ru' ? 'Общий пул бюджета' : 'Total Budget Pool'}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
                {fmtMoney(data.totalBudget, lang)}
              </div>
            </div>
            <div className="card animate-card-in stagger-3 p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                {lang === 'uz' ? 'Filiallar reytingi' : lang === 'ru' ? 'Ранжировано филиалов' : 'Branches Ranked'}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
                {data.branches.length}
              </div>
            </div>
            <div className="card animate-card-in stagger-4 p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                {lang === 'uz' ? 'Kutilayotgan foyda o‘sishi' : lang === 'ru' ? 'Ожидаемый эффект оптимизации' : 'Expected Optimization Lift'}
              </div>
              <div className="mt-1 text-lg font-semibold text-[var(--good)] tabular-nums">
                +{fmtMoney(data.expectedTotalProfitLift, lang)}
              </div>
            </div>
          </div>

          <div className="grid gap-3" data-widget-id="widget-branches-list">
            {data.branches.map((b, idx) => {
              const isExpanded = expandedId === b.restaurantId;
              const shareOfPool = data.totalBudget > 0 ? (b.recommendedBudget / data.totalBudget) * 100 : 0;
              return (
                <div
                  key={b.restaurantId}
                  style={{ '--stagger': Math.min(idx + 1, 8) } as React.CSSProperties}
                  className="card animate-card-in overflow-hidden transition-colors hover:border-[var(--border-strong)]"
                >
                  <div className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)] tabular-nums">
                            #{idx + 1} · {lang === 'uz' ? 'Ball' : lang === 'ru' ? 'Скор' : 'Score'} {b.efficiencyScore}/100
                          </span>
                          <span className="text-sm font-semibold text-[var(--text)]">{b.name}</span>
                          <span className="text-xs text-[var(--muted)]">· {b.districtName[lang]}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                              b.growthPct >= 0
                                ? 'bg-[var(--good-soft)] text-[var(--good)]'
                                : 'bg-[var(--bad-soft)] text-[var(--bad)]'
                            }`}
                          >
                            {b.growthPct >= 0 ? '+' : ''}
                            {b.growthPct.toFixed(1)}%
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{b.rationale[lang]}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-5 text-xs tabular-nums">
                        <div>
                          <div className="text-[var(--muted)]">
                            {lang === 'uz' ? 'ROI / Marja' : lang === 'ru' ? 'ROI / Маржа' : 'ROI / Margin'}
                          </div>
                          <div className="font-semibold text-[var(--text)]">{b.roiPct}% / {b.netMarginPct}%</div>
                        </div>
                        <div>
                          <div className="text-[var(--muted)]">
                            {lang === 'uz' ? 'Intizom' : lang === 'ru' ? 'Дисциплина' : 'Discipline'}
                          </div>
                          <div className="font-semibold text-[var(--text)]">{b.budgetDisciplineScore}/100</div>
                        </div>
                        <div>
                          <div className="text-[var(--muted)]">
                            {lang === 'uz' ? 'Joriy' : lang === 'ru' ? 'Текущий' : 'Current'}
                          </div>
                          <div className="font-bold text-[var(--text)]">{fmtCompactMoney(b.currentBudget, lang)}</div>
                        </div>
                        <div>
                          <div className="text-[var(--muted)]">
                            {lang === 'uz' ? 'AI tavsiya' : lang === 'ru' ? 'AI-лимит' : 'AI Recommended'}
                          </div>
                          <div className="font-semibold text-[var(--accent)]">{fmtMoney(b.recommendedBudget, lang)}</div>
                        </div>
                        <div>
                          <div className="text-[var(--muted)]">
                            {lang === 'uz' ? 'O‘zgarish' : lang === 'ru' ? 'Сдвиг' : 'Shift'}
                          </div>
                          <div className={`font-semibold ${b.deltaPct >= 0 ? 'text-[var(--good)]' : 'text-[var(--warn)]'}`}>
                            {b.deltaPct >= 0 ? '+' : ''}{b.deltaPct}%
                          </div>
                        </div>

                        {b.categoryAllocations.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : b.restaurantId)}
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--border-strong)]"
                          >
                            <span>
                              {lang === 'uz'
                                ? 'Toifalar'
                                : lang === 'ru'
                                  ? 'Категории'
                                  : 'Categories'}{' '}
                              ({b.categoryAllocations.length})
                            </span>
                            <IconChevronDown
                              size={13}
                              className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Pool Share & Efficiency Bar */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1">
                        <AnimatedProgressBar
                          pct={shareOfPool}
                          tone={idx === 0 ? 'pink' : idx === 1 ? 'mint' : 'violet'}
                          showThumb={false}
                          heightClass="h-1.5"
                          delayMs={Math.min(idx * 60, 300)}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--muted)]">
                        {shareOfPool.toFixed(1)}% {lang === 'uz' ? 'ulush' : lang === 'ru' ? 'пула' : 'of pool'}
                      </span>
                    </div>
                  </div>

                  {/* Expandable Category Allocations */}
                  {isExpanded && b.categoryAllocations.length > 0 && (
                    <div className="animate-slide-up border-t border-[var(--border)] bg-[var(--surface-2)]/55 px-4 py-3.5">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {b.categoryAllocations.map(ca => {
                          const catShare = b.recommendedBudget > 0
                            ? (ca.recommendedLimit / b.recommendedBudget) * 100
                            : 0;
                          return (
                            <div
                              key={ca.category}
                              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text)]">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: CATEGORY_COLORS[ca.category] }}
                                  />
                                  {CATEGORY_LABELS[ca.category][lang]}
                                </span>
                                <span className="tabular-nums font-semibold text-[var(--accent)]">
                                  {fmtCompactMoney(ca.recommendedLimit, lang)}
                                </span>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex-1">
                                  <AnimatedProgressBar
                                    pct={catShare}
                                    tone="pink"
                                    showThumb={false}
                                    heightClass="h-1.5"
                                  />
                                </div>
                                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--muted)]">
                                  {catShare.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {data.branches.length === 0 && (
              <EmptyStateCard
                icon={<IconBuilding size={18} />}
                title={COPY[lang].noData}
                actionLabel={COPY[lang].refresh}
                onAction={() => void query.refetch()}
              />
            )}
          </div>
        </>
      )}

      {query.isFetching && !query.isLoading && (
        <div className="flex items-center justify-end gap-1.5 text-[11px] text-[var(--muted)]">
          <IconRefresh size={12} className="animate-spin" />
          <span>{lang === 'uz' ? 'Yangilanmoqda...' : lang === 'ru' ? 'Пересчёт...' : 'Recalculating...'}</span>
        </div>
      )}
    </div>
  );
}
