import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EXPENSE_CATEGORIES, type ExpenseBudgetDto, type ExpenseCategory, type Language } from '@uzbite/shared';
import { fetchBudgetVariance, saveBudgetLimit } from '../lib/api';
import { CATEGORY_COLORS, CATEGORY_LABELS, COPY, fmtMoney } from '../lib/i18n';

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
  const [busy, setBusy] = useState(false);

  const varianceQuery = useQuery({
    queryKey: ['business-budget-variance', restaurantId, month],
    queryFn: () => fetchBudgetVariance(month),
    enabled: Boolean(restaurantId),
  });

  const varianceMap = new Map((varianceQuery.data ?? []).map(v => [v.category, v]));

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const limit = Number(limitInput);
    if (!Number.isFinite(limit) || limit < 0) return;
    setBusy(true);
    try {
      await saveBudgetLimit(cat, month, limit);
      await onMutated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="card flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-extrabold text-[var(--accent)]">
            Case #25 · Real-Time Plan vs Actual & Breach Early Warning
          </span>
          <h1 className="m-0 mt-1.5 text-base font-extrabold">{t.budgetPlanActual}</h1>
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
              type="number"
              className="input-field max-w-[160px]"
              value={limitInput}
              onChange={e => setLimitInput(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy} className="btn-primary">{t.updateLimit}</button>
        </form>
      </div>

      <div className="grid gap-3" data-widget-id="widget-budgets-list">
        {budgets.map(b => {
          const v = varianceMap.get(b.category);
          const barColor =
            b.status === 'OVERRUN' ? 'var(--bad)' : b.status === 'WARNING' ? 'var(--warn)' : 'var(--good)';
          return (
            <div key={b.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[b.category] }}
                  />
                  <span className="text-sm font-extrabold">{CATEGORY_LABELS[b.category][lang]}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                    b.status === 'OVERRUN'
                      ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                      : b.status === 'WARNING'
                        ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                        : 'bg-[var(--good-soft)] text-[var(--good)]'
                  }`}>
                    {b.status} ({b.usagePct}%)
                  </span>

                  {v && v.projectedBreachDate && (
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                      v.riskLevel === 'CRITICAL'
                        ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                        : 'bg-[var(--warn-soft)] text-[var(--warn)]'
                    }`}>
                      {v.daysUntilBreach === 0
                        ? `Breached (${v.projectedBreachDate})`
                        : `Early Warning: breach ${v.projectedBreachDate} (${v.daysUntilBreach}d)`}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-5 text-xs tabular-nums">
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
                </div>
              </div>

              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, b.usagePct)}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>

              {v && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                  <span>{v.drivers.explanation[lang]}</span>
                  <span className="tabular-nums font-semibold">
                    Burn: {fmtMoney(v.dailyBurnRate, lang)}/day · Price Δ: {fmtMoney(v.drivers.priceEffectUZS, lang)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {budgets.length === 0 && (
          <div className="card p-8 text-center text-xs text-[var(--muted)]">{t.noData}</div>
        )}
      </div>
    </div>
  );
}
