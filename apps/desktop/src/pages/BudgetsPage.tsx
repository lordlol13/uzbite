import { useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  EXPENSE_CATEGORIES,
  type ExpenseBudgetDto,
  type ExpenseCategory,
  type Language,
} from '@uzbite/shared';
import {
  AnimatedProgressBar,
  EmptyStateCard,
  IconCheck,
  IconClock,
  IconEdit,
  IconSpinner,
  IconX,
  SkeletonRows,
} from '../components/DesignWidgets';
import { fetchBudgetVariance, saveBudgetLimit } from '../lib/api';
import { CATEGORY_COLORS, CATEGORY_LABELS, COPY, fmtCompactMoney, fmtMoney } from '../lib/i18n';

const STATUS_LABELS: Record<'ALL' | 'OVERRUN' | 'WARNING' | 'OK', Record<Language, string>> = {
  ALL: { ru: 'Все', uz: 'Barchasi', en: 'All' },
  OVERRUN: { ru: 'Перерасход', uz: 'Oshib ketdi', en: 'Overrun' },
  WARNING: { ru: 'Внимание', uz: 'Ogohlantirish', en: 'Warning' },
  OK: { ru: 'В норме', uz: 'Me’yorda', en: 'On Track' },
};

export function BudgetsPage({
  lang,
  restaurantId,
  month,
  onMonthChange,
  budgets,
  onMutated,
}: {
  lang: Language;
  restaurantId: string;
  month: string;
  onMonthChange: (m: string) => void;
  budgets: ExpenseBudgetDto[];
  onMutated: () => Promise<void>;
}) {
  const t = COPY[lang];
  const [cat, setCat] = useState<ExpenseCategory>('UTILITIES');
  const [limitInput, setLimitInput] = useState('4000000');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OVERRUN' | 'WARNING' | 'OK'>('ALL');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const limitInputRef = useRef<HTMLInputElement | null>(null);

  const varianceQuery = useQuery({
    queryKey: ['business-budget-variance', restaurantId, month],
    queryFn: () => fetchBudgetVariance(month),
    enabled: Boolean(restaurantId),
  });

  const varianceMap = new Map((varianceQuery.data ?? []).map(v => [v.category, v]));

  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const totalActual = budgets.reduce((s, b) => s + b.actual, 0);
  const overallPct = totalLimit > 0 ? Math.round((totalActual / totalLimit) * 100) : 0;
  const overrunCount = budgets.filter(b => b.status === 'OVERRUN').length;
  const warningCount = budgets.filter(b => b.status === 'WARNING').length;

  const filteredBudgets = budgets
    .filter(b => (statusFilter === 'ALL' ? true : b.status === statusFilter))
    .slice()
    .sort((a, b) => b.usagePct - a.usagePct);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const limit = Number(limitInput);
    if (!Number.isFinite(limit) || limit < 0) {
      setFeedback({
        tone: 'bad',
        text:
          lang === 'uz'
            ? 'Noto‘g‘ri limit qiymati'
            : lang === 'ru'
              ? 'Укажите корректный лимит'
              : 'Enter a valid non-negative limit',
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await saveBudgetLimit(cat, month, limit);
      await onMutated();
      setFeedback({
        tone: 'good',
        text: `${CATEGORY_LABELS[cat][lang]}: ${fmtMoney(limit, lang)} ✓`,
      });
    } catch (err) {
      setFeedback({
        tone: 'bad',
        text: err instanceof Error ? err.message : 'Save failed',
      });
    } finally {
      setBusy(false);
    }
  }

  function handleQuickEdit(b: ExpenseBudgetDto) {
    setCat(b.category);
    setLimitInput(String(Math.round(b.limit)));
    limitInputRef.current?.focus();
    limitInputRef.current?.select();
  }

  return (
    <div className="animate-page-enter grid gap-5">
      {/* Header + Quick Limit Editor */}
      <div className="card animate-card-in stagger-1 flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
            Case #25 · Real-Time Plan vs Actual & Breach Early Warning
          </span>
          <h1 className="m-0 mt-1.5 text-base font-semibold text-[var(--text)]">{t.budgetPlanActual}</h1>
          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
            {t.month}:
            <input
              type="month"
              className="input-field max-w-[170px]"
              value={month}
              onChange={e => onMonthChange(e.target.value)}
            />
          </label>
        </div>

        <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
            {t.category}
            <select
              className="input-field"
              value={cat}
              onChange={e => setCat(e.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c][lang]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
            {t.limit}
            <input
              ref={limitInputRef}
              type="number"
              min="0"
              className="input-field max-w-[160px] tabular-nums font-semibold"
              value={limitInput}
              onChange={e => setLimitInput(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy && <IconSpinner size={13} />}
            {t.updateLimit}
          </button>
        </form>
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

      {/* Summary KPI Strip */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card animate-card-in stagger-2 p-4">
            <div className="text-[11px] font-medium text-[var(--muted)]">{t.limit}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
              {fmtCompactMoney(totalLimit, lang)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
              {budgets.length} {lang === 'uz' ? 'toifa' : lang === 'ru' ? 'категорий' : 'categories'}
            </div>
          </div>

          <div className="card animate-card-in stagger-3 p-4">
            <div className="text-[11px] font-medium text-[var(--muted)]">{t.actual}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
              {fmtCompactMoney(totalActual, lang)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
              {fmtMoney(totalLimit - totalActual, lang)}
            </div>
          </div>

          <div className="card animate-card-in stagger-4 p-4">
            <div className="text-[11px] font-medium text-[var(--muted)]">
              {lang === 'uz' ? 'Bajarilish' : lang === 'ru' ? 'Исполнение плана' : 'Plan Utilization'}
            </div>
            <div
              className={`mt-1 text-lg font-semibold tabular-nums ${
                overallPct > 100 ? 'text-[var(--bad)]' : overallPct >= 85 ? 'text-[var(--warn)]' : 'text-[var(--good)]'
              }`}
            >
              {overallPct}%
            </div>
            <div className="mt-2">
              <AnimatedProgressBar
                pct={overallPct}
                tone={overallPct > 100 ? 'bad' : overallPct >= 85 ? 'warn' : 'mint'}
                showThumb={false}
                heightClass="h-1.5"
              />
            </div>
          </div>

          <div className="card animate-card-in stagger-5 p-4">
            <div className="text-[11px] font-medium text-[var(--muted)]">
              {lang === 'uz' ? 'Xavf / Oshish' : lang === 'ru' ? 'Риски и перерасход' : 'Alerts'}
            </div>
            <div className="mt-1 flex items-baseline gap-2.5 tabular-nums">
              <span className="text-lg font-semibold text-[var(--bad)]">{overrunCount}</span>
              <span className="text-xs text-[var(--muted)]">/</span>
              <span className="text-base font-semibold text-[var(--warn)]">{warningCount}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)]">
              {STATUS_LABELS.OVERRUN[lang]} · {STATUS_LABELS.WARNING[lang]}
            </div>
          </div>
        </div>
      )}

      {/* Filter Pills */}
      {budgets.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'OVERRUN', 'WARNING', 'OK'] as const).map(st => {
              const count =
                st === 'ALL' ? budgets.length : budgets.filter(b => b.status === st).length;
              const active = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                    active
                      ? 'border-transparent bg-[var(--cta-bg)] text-[var(--cta-text)] shadow-xs'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'
                  }`}
                >
                  {STATUS_LABELS[st][lang]} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Budget Cards List */}
      <div className="grid gap-3" data-widget-id="widget-budgets-list">
        {varianceQuery.isLoading && budgets.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : (
          filteredBudgets.map((b, idx) => {
            const v = varianceMap.get(b.category);
            const tone = b.status === 'OVERRUN' ? 'bad' : b.status === 'WARNING' ? 'warn' : 'mint';
            return (
              <div
                key={b.id}
                style={{ '--stagger': Math.min(idx + 1, 8) } as React.CSSProperties}
                className="card animate-card-in hover-lift p-4 transition-colors hover:border-[var(--border-strong)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[b.category] }}
                    />
                    <span className="text-sm font-semibold text-[var(--text)]">
                      {CATEGORY_LABELS[b.category][lang]}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tabular-nums ${
                        b.status === 'OVERRUN'
                          ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                          : b.status === 'WARNING'
                            ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                            : 'bg-[var(--good-soft)] text-[var(--good)]'
                      }`}
                    >
                      {STATUS_LABELS[b.status][lang]} ({b.usagePct}%)
                    </span>

                    {v && v.projectedBreachDate && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                          v.riskLevel === 'CRITICAL'
                            ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                            : 'bg-[var(--warn-soft)] text-[var(--warn)]'
                        }`}
                      >
                        <IconClock size={11} />
                        {v.daysUntilBreach === 0
                          ? lang === 'uz'
                            ? `Limit oshdi (${v.projectedBreachDate})`
                            : lang === 'ru'
                              ? `Превышен (${v.projectedBreachDate})`
                              : `Breached (${v.projectedBreachDate})`
                          : lang === 'uz'
                            ? `Prognoz: ${v.projectedBreachDate} (${v.daysUntilBreach}k)`
                            : lang === 'ru'
                              ? `Риск перерасхода: ${v.projectedBreachDate} (${v.daysUntilBreach} дн.)`
                              : `Early Warning: breach ${v.projectedBreachDate} (${v.daysUntilBreach}d)`}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                    <div>
                      <span className="text-[var(--muted)]">{t.limit}: </span>
                      <strong>{fmtMoney(b.limit, lang)}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--muted)]">{t.actual}: </span>
                      <strong>{fmtMoney(b.actual, lang)}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--muted)]">{t.forecast}: </span>
                      <strong className={b.forecast > b.limit ? 'text-[var(--bad)]' : ''}>
                        {fmtMoney(v?.forecast ?? b.forecast, lang)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[var(--muted)]">{t.variance}: </span>
                      <strong className={b.variance < 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'}>
                        {fmtMoney(b.variance, lang)}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickEdit(b)}
                      title={t.updateLimit}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                    >
                      <IconEdit size={12} />
                    </button>
                  </div>
                </div>

                <div className="mt-3.5">
                  <AnimatedProgressBar
                    pct={b.usagePct}
                    tone={tone}
                    delayMs={Math.min(idx * 45, 360)}
                  />
                </div>

                {v && (
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                    <span>{v.drivers.explanation[lang]}</span>
                    <span className="tabular-nums font-semibold">
                      {lang === 'uz' ? 'Kunlik sarf' : lang === 'ru' ? 'Расход/день' : 'Burn'}:{' '}
                      {fmtMoney(v.dailyBurnRate, lang)} ·{' '}
                      {lang === 'uz' ? 'Narx Δ' : lang === 'ru' ? 'Фактор цен Δ' : 'Price Δ'}:{' '}
                      {fmtMoney(v.drivers.priceEffectUZS, lang)}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}

        {!varianceQuery.isLoading && filteredBudgets.length === 0 && (
          <EmptyStateCard
            title={t.noData}
            actionLabel={
              statusFilter !== 'ALL'
                ? lang === 'uz'
                  ? 'Barchasini ko‘rsatish'
                  : lang === 'ru'
                    ? 'Показать все категории'
                    : 'Show all categories'
                : undefined
            }
            onAction={statusFilter !== 'ALL' ? () => setStatusFilter('ALL') : undefined}
          />
        )}
      </div>
    </div>
  );
}
