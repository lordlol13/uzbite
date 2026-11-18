import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Language } from '@uzbite/shared';
import { applyBranchAllocation, fetchBranchAllocation } from '../lib/api';
import { fmtCompactMoney, fmtMoney } from '../lib/i18n';

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
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

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
    setAppliedMessage(null);
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
      setAppliedMessage(`Applied ${res.appliedCount} category budget limits for ${res.month}`);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="card flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
            Hackathon Case #24 · Multi-Branch / BXM-BXO Budget Optimizer
          </span>
          <h1 className="m-0 mt-1.5 text-base font-semibold">
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
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
            {lang === 'uz' ? 'Jami byudjet (UZS)' : lang === 'ru' ? 'Общий пул (UZS)' : 'Total Pool (UZS)'}
            <input
              type="number"
              className="input-field max-w-[170px] font-bold tabular-nums"
              value={totalBudgetInput}
              onChange={e => setTotalBudgetInput(e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
            {lang === 'uz' ? 'Strategiya' : lang === 'ru' ? 'Цель' : 'Objective'}
            <select
              className="input-field max-w-[160px] text-xs font-bold"
              value={objective}
              onChange={e => setObjective(e.target.value as 'balanced' | 'profit' | 'growth')}
            >
              <option value="balanced">Balanced (ROI + Discipline)</option>
              <option value="profit">Max Profit / ROI</option>
              <option value="growth">Demand & Growth</option>
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

      {appliedMessage && (
        <div className="rounded-xl border border-[var(--good)] bg-[var(--good-soft)] px-4 py-2.5 text-xs font-bold text-[var(--good)]">
          {appliedMessage}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">Total Budget Pool</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{fmtMoney(data.totalBudget, lang)}</div>
            </div>
            <div className="card p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">Branches Ranked</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{data.branches.length}</div>
            </div>
            <div className="card p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">Expected Optimization Lift</div>
              <div className="mt-1 text-lg font-semibold text-[var(--good)] tabular-nums">
                +{fmtMoney(data.expectedTotalProfitLift, lang)}
              </div>
            </div>
          </div>

          <div className="grid gap-3" data-widget-id="widget-branches-list">
            {data.branches.map((b, idx) => (
              <div key={b.restaurantId} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                        #{idx + 1} · Score {b.efficiencyScore}/100
                      </span>
                      <span className="text-sm font-semibold">{b.name}</span>
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
                    <p className="mt-1 text-xs text-[var(--muted)]">{b.rationale[lang]}</p>
                  </div>

                  <div className="flex flex-wrap gap-5 text-xs tabular-nums">
                    <div>
                      <div className="text-[var(--muted)]">ROI / Margin</div>
                      <div className="font-semibold">{b.roiPct}% / {b.netMarginPct}%</div>
                    </div>
                    <div>
                      <div className="text-[var(--muted)]">Discipline</div>
                      <div className="font-semibold">{b.budgetDisciplineScore}/100</div>
                    </div>
                    <div>
                      <div className="text-[var(--muted)]">Current</div>
                      <div className="font-bold">{fmtCompactMoney(b.currentBudget, lang)}</div>
                    </div>
                    <div>
                      <div className="text-[var(--muted)]">AI Recommended</div>
                      <div className="font-semibold text-[var(--accent)]">{fmtMoney(b.recommendedBudget, lang)}</div>
                    </div>
                    <div>
                      <div className="text-[var(--muted)]">Shift</div>
                      <div className={`font-semibold ${b.deltaPct >= 0 ? 'text-[var(--good)]' : 'text-[var(--warn)]'}`}>
                        {b.deltaPct >= 0 ? '+' : ''}{b.deltaPct}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
