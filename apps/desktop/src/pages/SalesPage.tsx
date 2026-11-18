import { useState } from 'react';
import type { DishAnalyticsItem, HourlyHeatmapCell, Language } from '@uzbite/shared';
import { HourlyHeatmap, MenuQuadrantChart } from '../components/Charts';
import {
  EmptyStateCard,
  IconArrowUpDown,
  IconCheck,
  IconDownload,
  IconPrinter,
  IconSearch,
  IconSpinner,
  IconX,
} from '../components/DesignWidgets';
import { updateDishCost } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { COPY, fmtCompactMoney, fmtMoney } from '../lib/i18n';

type QuadrantFilter = 'ALL' | DishAnalyticsItem['quadrant'];
type DishSortKey = 'revenue' | 'totalProfit' | 'quantitySold' | 'marginPct';

const QUADRANT_BADGE_STYLE: Record<DishAnalyticsItem['quadrant'], { bg: string; color: string }> = {
  STAR: { bg: 'var(--mint-soft)', color: 'var(--mint)' },
  PLOWHORSE: { bg: 'var(--accent-soft)', color: 'var(--accent)' },
  PUZZLE: { bg: 'rgba(129, 114, 255, 0.14)', color: 'var(--accent-2)' },
  DOG: { bg: 'var(--bad-soft)', color: 'var(--bad)' },
};

export function SalesPage({
  lang,
  dishes,
  heatmap,
  onMutated,
}: {
  lang: Language;
  dishes: DishAnalyticsItem[];
  heatmap: HourlyHeatmapCell[];
  onMutated: () => Promise<void>;
}) {
  const t = COPY[lang];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [costDraft, setCostDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [quadrant, setQuadrant] = useState<QuadrantFilter>('ALL');
  const [sortKey, setSortKey] = useState<DishSortKey>('revenue');
  const [sortDesc, setSortDesc] = useState(true);
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const totalRevenue = dishes.reduce((s, d) => s + d.revenue, 0);
  const totalProfit = dishes.reduce((s, d) => s + d.totalProfit, 0);
  const avgMarginPct =
    dishes.length > 0
      ? dishes.reduce((s, d) => s + d.marginPct, 0) / dishes.length
      : 0;
  const starsCount = dishes.filter(d => d.quadrant === 'STAR').length;
  const dogsCount = dishes.filter(d => d.quadrant === 'DOG').length;

  const q = search.trim().toLowerCase();
  const filteredDishes = dishes
    .filter(d => {
      if (quadrant !== 'ALL' && d.quadrant !== quadrant) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.categoryName.toLowerCase().includes(q)
      );
    })
    .slice()
    .sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDesc ? -diff : diff;
    });

  function toggleSort(key: DishSortKey) {
    if (sortKey === key) {
      setSortDesc(v => !v);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  async function saveCost(dishId: string) {
    const val = Number(costDraft);
    if (!Number.isFinite(val) || val < 0) {
      setFeedback({
        tone: 'bad',
        text:
          lang === 'uz'
            ? 'Noto‘g‘ri tannarx qiymati'
            : lang === 'ru'
              ? 'Укажите корректную себестоимость'
              : 'Enter a valid non-negative cost',
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await updateDishCost(dishId, val);
      setEditingId(null);
      await onMutated();
      setFeedback({
        tone: 'good',
        text: `${t.costPrice}: ${fmtMoney(val, lang)} ✓`,
      });
    } catch (err) {
      setFeedback({
        tone: 'bad',
        text: err instanceof Error ? err.message : 'Update failed',
      });
    } finally {
      setBusy(false);
    }
  }

  function exportMenuCsv() {
    if (filteredDishes.length === 0) return;
    downloadCsv(
      `uzbite-menu-abc-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Dish', 'Category', 'Price', 'CostPrice', 'UnitMargin', 'MarginPct', 'QtySold', 'Revenue', 'Profit', 'ABC', 'Quadrant'],
      filteredDishes.map(d => [
        d.name,
        d.categoryName,
        d.price,
        d.costPrice,
        d.unitMargin,
        d.marginPct,
        d.quantitySold,
        d.revenue,
        d.totalProfit,
        d.abcClass,
        d.quadrant,
      ]),
    );
  }

  return (
    <div className="animate-page-enter grid gap-5">
      {/* Summary KPI Strip */}
      {dishes.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card animate-card-in stagger-1 hover-lift p-4">
            <div className="text-[11px] font-medium text-[var(--muted)]">{t.revenue}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
              {fmtCompactMoney(totalRevenue, lang)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
              {dishes.length} {lang === 'uz' ? 'taom' : lang === 'ru' ? 'позиций' : 'dishes'}
            </div>
          </div>

          <div className="card animate-card-in stagger-2 hover-lift p-4">
            <div className="text-[11px] font-medium text-[var(--muted)]">{t.profit}</div>
            <div
              className={`mt-1 text-lg font-semibold tabular-nums ${
                totalProfit >= 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'
              }`}
            >
              {fmtCompactMoney(totalProfit, lang)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
              {totalRevenue > 0 ? `${((totalProfit / totalRevenue) * 100).toFixed(1)}%` : '—'}
            </div>
          </div>

          <div className="card animate-card-in stagger-3 hover-lift p-4">
            <div className="text-[11px] font-medium text-[var(--muted)]">
              {lang === 'uz' ? 'O‘rtacha marja' : lang === 'ru' ? 'Средняя маржа' : 'Avg Menu Margin'}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--accent)]">
              {avgMarginPct.toFixed(1)}%
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)]">{t.unitMargin}</div>
          </div>

          <div className="card animate-card-in stagger-4 hover-lift p-4">
            <div className="text-[11px] font-medium text-[var(--muted)]">STAR / DOG</div>
            <div className="mt-1 flex items-baseline gap-2 tabular-nums">
              <span className="text-lg font-semibold text-[var(--mint)]">{starsCount}</span>
              <span className="text-xs text-[var(--muted)]">/</span>
              <span className="text-base font-semibold text-[var(--bad)]">{dogsCount}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)]">{t.quadrant}</div>
          </div>
        </div>
      )}

      {/* Menu Engineering Table & Quadrant Matrix */}
      <div className="card animate-card-in stagger-2 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="m-0 text-sm font-semibold text-[var(--text)]">{t.menuEngineering}</h1>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              {lang === 'uz'
                ? 'Tannarxni tahrirlash uchun qiymat ustiga bosing'
                : lang === 'ru'
                  ? 'Нажмите на себестоимость блюда для быстрого редактирования'
                  : 'Click any dish cost price to edit inline'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {feedback && (
              <div
                className={`animate-scale-in inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  feedback.tone === 'good'
                    ? 'bg-[var(--good-soft)] text-[var(--good)]'
                    : 'bg-[var(--bad-soft)] text-[var(--bad)]'
                }`}
              >
                {feedback.tone === 'good' && <IconCheck size={12} />}
                <span>{feedback.text}</span>
                <button type="button" onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
                  <IconX size={11} />
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={filteredDishes.length === 0}
              onClick={exportMenuCsv}
              className="btn-secondary text-xs"
            >
              <IconDownload size={13} />
              {t.exportCsv}
            </button>
            <button type="button" onClick={() => window.print()} className="btn-secondary text-xs">
              <IconPrinter size={13} />
              {t.printPdf}
            </button>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'STAR', 'PLOWHORSE', 'PUZZLE', 'DOG'] as const).map(qf => {
              const count = qf === 'ALL' ? dishes.length : dishes.filter(d => d.quadrant === qf).length;
              const active = quadrant === qf;
              return (
                <button
                  key={qf}
                  type="button"
                  onClick={() => setQuadrant(qf)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-150 ${
                    active
                      ? 'border-transparent bg-[var(--cta-bg)] text-[var(--cta-text)] shadow-xs'
                      : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'
                  }`}
                >
                  {qf === 'ALL' ? t.all : qf} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative">
            <IconSearch
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              type="search"
              className="input-field min-h-[34px] w-56 pl-8 py-1 text-xs"
              placeholder={t.dish}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="overflow-x-auto xl:col-span-2">
            {filteredDishes.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border)] text-[var(--muted)]">
                  <tr>
                    <th className="py-2 pr-3">{t.dish}</th>
                    <th className="py-2 pr-3 text-right">{t.price}</th>
                    <th className="py-2 pr-3 text-right">{t.costPrice}</th>
                    <th className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('marginPct')}
                        className={`inline-flex items-center gap-1 font-semibold hover:text-[var(--text)] ${
                          sortKey === 'marginPct' ? 'text-[var(--accent)]' : ''
                        }`}
                      >
                        {t.unitMargin}
                        <IconArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('quantitySold')}
                        className={`inline-flex items-center gap-1 font-semibold hover:text-[var(--text)] ${
                          sortKey === 'quantitySold' ? 'text-[var(--accent)]' : ''
                        }`}
                      >
                        {t.sold}
                        <IconArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('revenue')}
                        className={`inline-flex items-center gap-1 font-semibold hover:text-[var(--text)] ${
                          sortKey === 'revenue' ? 'text-[var(--accent)]' : ''
                        }`}
                      >
                        {t.revenue}
                        <IconArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('totalProfit')}
                        className={`inline-flex items-center gap-1 font-semibold hover:text-[var(--text)] ${
                          sortKey === 'totalProfit' ? 'text-[var(--accent)]' : ''
                        }`}
                      >
                        {t.profit}
                        <IconArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-2 pr-2 text-center">{t.abcClass}</th>
                    <th className="py-2 text-right">{t.quadrant}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDishes.map(d => {
                    const qStyle = QUADRANT_BADGE_STYLE[d.quadrant];
                    return (
                      <tr
                        key={d.dishId}
                        className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]/70"
                      >
                        <td className="py-2.5 pr-3">
                          <div className="font-bold text-[var(--text)]">{d.name}</div>
                          <div className="text-[11px] text-[var(--muted)]">{d.categoryName}</div>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{fmtMoney(d.price, lang)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {editingId === d.dishId ? (
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                autoFocus
                                className="input-field min-h-[28px] w-24 py-0.5 text-right text-xs tabular-nums"
                                value={costDraft}
                                onChange={e => setCostDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void saveCost(d.dishId);
                                  } else if (e.key === 'Escape') {
                                    setEditingId(null);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void saveCost(d.dishId)}
                                title={t.save}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--good-soft)] text-[var(--good)] hover:brightness-95"
                              >
                                {busy ? <IconSpinner size={11} /> : <IconCheck size={12} />}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setEditingId(null)}
                                title={t.cancel}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)]"
                              >
                                <IconX size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(d.dishId);
                                setCostDraft(String(d.costPrice));
                              }}
                              className="underline decoration-dotted transition-colors hover:text-[var(--accent)]"
                            >
                              {fmtMoney(d.costPrice, lang)}
                            </button>
                          )}
                        </td>
                        <td className={`py-2.5 pr-3 text-right font-bold tabular-nums ${d.unitMargin <= 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'}`}>
                          {fmtMoney(d.unitMargin, lang)} ({d.marginPct}%)
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{d.quantitySold}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{fmtMoney(d.revenue, lang)}</td>
                        <td className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${d.totalProfit < 0 ? 'text-[var(--bad)]' : ''}`}>
                          {fmtMoney(d.totalProfit, lang)}
                        </td>
                        <td className="py-2.5 pr-2 text-center">
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                              d.abcClass === 'A'
                                ? 'bg-[var(--good-soft)] text-[var(--good)]'
                                : d.abcClass === 'B'
                                  ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                                  : 'bg-[var(--surface-2)] text-[var(--muted)]'
                            }`}
                          >
                            {d.abcClass}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <span
                            className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                            style={{ background: qStyle.bg, color: qStyle.color }}
                          >
                            {d.quadrant}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyStateCard
                title={t.noData}
                actionLabel={
                  quadrant !== 'ALL' || search.trim()
                    ? lang === 'uz'
                      ? 'Filtrlarni tozalash'
                      : lang === 'ru'
                        ? 'Сбросить фильтры'
                        : 'Clear filters'
                    : undefined
                }
                onAction={
                  quadrant !== 'ALL' || search.trim()
                    ? () => {
                        setQuadrant('ALL');
                        setSearch('');
                      }
                    : undefined
                }
              />
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <MenuQuadrantChart dishes={filteredDishes} lang={lang} />
          </div>
        </div>
      </div>

      {/* Hourly Heatmap */}
      <div className="card animate-card-in stagger-3 p-5">
        <h2 className="m-0 mb-3 text-sm font-semibold text-[var(--text)]">{t.hourlyHeatmap}</h2>
        <HourlyHeatmap cells={heatmap} lang={lang} />
      </div>
    </div>
  );
}
