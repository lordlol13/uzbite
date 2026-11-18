import { useState } from 'react';
import type { DishAnalyticsItem, HourlyHeatmapCell, Language } from '@uzbite/shared';
import { HourlyHeatmap, MenuQuadrantChart } from '../components/Charts';
import { updateDishCost } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { COPY, fmtMoney } from '../lib/i18n';

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

  async function saveCost(dishId: string) {
    const val = Number(costDraft);
    if (!Number.isFinite(val) || val < 0) return;
    setBusy(true);
    try {
      await updateDishCost(dishId, val);
      setEditingId(null);
      await onMutated();
    } finally {
      setBusy(false);
    }
  }

  function exportMenuCsv() {
    downloadCsv(
      `uzbite-menu-abc-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Dish', 'Category', 'Price', 'CostPrice', 'UnitMargin', 'MarginPct', 'QtySold', 'Revenue', 'Profit', 'ABC', 'Quadrant'],
      dishes.map(d => [
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
    <div className="grid gap-5">
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="m-0 text-sm font-semibold">{t.menuEngineering}</h1>
          <div className="flex gap-2">
            <button type="button" onClick={exportMenuCsv} className="btn-secondary text-xs">
              {t.exportCsv}
            </button>
            <button type="button" onClick={() => window.print()} className="btn-secondary text-xs">
              {t.printPdf}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="overflow-x-auto xl:col-span-2">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-3">{t.dish}</th>
                  <th className="py-2 pr-3 text-right">{t.price}</th>
                  <th className="py-2 pr-3 text-right">{t.costPrice}</th>
                  <th className="py-2 pr-3 text-right">{t.unitMargin}</th>
                  <th className="py-2 pr-3 text-right">{t.sold}</th>
                  <th className="py-2 pr-3 text-right">{t.revenue}</th>
                  <th className="py-2 pr-3 text-right">{t.profit}</th>
                  <th className="py-2 pr-2 text-center">{t.abcClass}</th>
                  <th className="py-2 text-right">{t.quadrant}</th>
                </tr>
              </thead>
              <tbody>
                {dishes.map(d => (
                  <tr key={d.dishId} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="font-bold">{d.name}</div>
                      <div className="text-[11px] text-[var(--muted)]">{d.categoryName}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{fmtMoney(d.price, lang)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {editingId === d.dishId ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            className="input-field w-24 py-1 text-right text-xs"
                            value={costDraft}
                            onChange={e => setCostDraft(e.target.value)}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => saveCost(d.dishId)}
                            className="text-[11px] font-bold text-[var(--good)]"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(d.dishId);
                            setCostDraft(String(d.costPrice));
                          }}
                          className="underline decoration-dotted hover:text-[var(--accent)]"
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
                    <td className="py-2.5 pr-2 text-center font-semibold">{d.abcClass}</td>
                    <td className="py-2.5 text-right">
                      <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold">
                        {d.quadrant}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <MenuQuadrantChart dishes={dishes} lang={lang} />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="m-0 mb-3 text-sm font-semibold">{t.hourlyHeatmap}</h2>
        <HourlyHeatmap cells={heatmap} lang={lang} />
      </div>
    </div>
  );
}
