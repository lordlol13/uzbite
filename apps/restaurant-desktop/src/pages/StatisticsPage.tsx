import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { downloadFile, restaurantApi } from '../api/client';
import { ErrorBanner } from '../components/Common';
import { GradientSliderRow, OrderPerformanceBarChart, TickStatCard } from '../components/DesignWidgets';
import { Icon } from '../components/Icon';
import { useSession } from '../store/session';
import { formatCompactMoney, formatMoney } from '../utils/format';

const SLIDER_TONES: Array<'orange' | 'mint' | 'violet' | 'pink'> = ['orange', 'mint', 'violet', 'pink'];

export function StatisticsPage() {
  const { config } = useSession();
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportMsg, setExportMsg] = useState('');

  const statsQuery = useQuery({
    queryKey: ['restaurant-statistics', from, to],
    queryFn: () => restaurantApi.getStatistics(from, to),
  });

  async function exportReport(format: 'xlsx' | 'csv') {
    setExportMsg('');
    const res = await downloadFile(
      `/restaurant-account/exports/statistics?format=${format}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      `uzbite-statistics-${from}_${to}.${format}`,
    );
    if (res.saved) {
      setExportMsg(res.filePath ? `Отчёт сохранён: ${res.filePath}` : 'Отчёт выгружен');
    }
  }

  const s = statsQuery.data;
  const totalDishRev = Math.max(
    1,
    (s?.popularDishes ?? []).slice(0, 6).reduce((sum, d) => sum + d.revenue, 0),
  );
  const totalCatRev = Math.max(
    1,
    (s?.popularCategories ?? []).slice(0, 6).reduce((sum, c) => sum + c.revenue, 0),
  );
  const paidPct =
    s && s.createdOrdersAmount > 0 ? Math.min(1, s.paidOrdersAmount / s.createdOrdersAmount) : 0.72;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[22px] font-medium tracking-[-0.02em]">Статистика ресторана</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
            Фактические показатели из PostgreSQL: заказы, подтверждённые платежи и структура доставки
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input-field min-h-0 w-[138px] rounded-full py-1.5 text-xs" value={from} onChange={e => setFrom(e.target.value)} />
          <input type="date" className="input-field min-h-0 w-[138px] rounded-full py-1.5 text-xs" value={to} onChange={e => setTo(e.target.value)} />
          <button type="button" onClick={() => void exportReport('xlsx')} className="btn-secondary text-xs">
            <Icon name="excel" size={15} /> Excel
          </button>
          <button type="button" onClick={() => void exportReport('csv')} className="btn-secondary text-xs">
            <Icon name="csv" size={15} /> CSV
          </button>
        </div>
      </div>

      {exportMsg && (
        <div className="rounded-xl bg-[var(--good-soft)] p-3 text-xs font-medium text-[var(--good)]">
          {exportMsg}
        </div>
      )}
      <ErrorBanner message={statsQuery.error instanceof Error ? statsQuery.error.message : null} />

      {s && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TickStatCard
              title="Заказы (день / нед / мес)"
              value={`${s.ordersToday} / ${s.ordersWeek} / ${s.ordersMonth}`}
              delta={`${s.completedOrders} заверш.`}
              deltaTone="good"
              fillRatio={Math.min(0.95, Math.max(0.25, s.completedOrders / Math.max(1, s.ordersInRange)))}
              ticksColor="ink"
              footerLabel="За период"
              footerRight={`${s.ordersInRange} (отмен: ${s.cancelledOrders})`}
              iconName="orders"
              delayMs={0}
            />

            <TickStatCard
              title="Создано заказов"
              value={formatCompactMoney(s.createdOrdersAmount, config.language)}
              delta={`${s.ordersInRange} шт`}
              deltaTone="neutral"
              fillRatio={0.68}
              ticksColor="violet"
              footerLabel="До подтверждения"
              footerRight={formatMoney(s.createdOrdersAmount, config.language)}
              iconName="statistics"
              delayMs={60}
            />

            <TickStatCard
              title="Подтверждённые оплаты"
              value={formatCompactMoney(s.paidOrdersAmount, config.language)}
              delta={`${Math.round(paidPct * 100)}%`}
              deltaTone="good"
              fillRatio={paidPct}
              ticksColor="mint"
              footerLabel="Нал / Карта"
              footerRight={`${formatCompactMoney(s.cashConfirmedAmount, config.language)} / ${formatCompactMoney(s.cardConfirmedAmount, config.language)}`}
              iconName="payment"
              delayMs={120}
            />

            <TickStatCard
              title="Доставки (Свои / Партн.)"
              value={`${s.ownCourierDeliveries} / ${s.onDemandCourierDeliveries}`}
              delta="Логистика"
              deltaTone="good"
              fillRatio={Math.min(0.92, Math.max(0.2, (s.ownCourierDeliveries + s.onDemandCourierDeliveries) / Math.max(1, s.ordersInRange)))}
              ticksColor="pink"
              footerLabel="Выплаты курьерам"
              footerRight={formatCompactMoney(s.deliveryExpensesAmount, config.language)}
              iconName="delivery"
              delayMs={180}
            />
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="m-0 text-[15px] font-medium tracking-tight">Выручка по категориям</h2>
              <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-[11px] font-medium text-[var(--muted)]">
                {s.popularCategories.length} категорий
              </span>
            </div>
            <OrderPerformanceBarChart
              bars={s.popularCategories.slice(0, 8).map(c => ({
                label: c.categoryName,
                value: c.revenue,
                formatted: formatMoney(c.revenue, config.language),
              }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mt-0 mb-4 text-[15px] font-medium tracking-tight">Популярные блюда</h2>
              {s.popularDishes.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">Нет продаж за выбранный период</div>
              ) : (
                <div className="grid gap-3.5">
                  {s.popularDishes.slice(0, 6).map((d, idx) => (
                    <GradientSliderRow
                      key={d.dishName}
                      label={d.dishName}
                      valueText={`${d.quantity} шт · ${formatCompactMoney(d.revenue, config.language)}`}
                      sharePct={(d.revenue / totalDishRev) * 100}
                      tone={SLIDER_TONES[idx % SLIDER_TONES.length]}
                      delayMs={idx * 65}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="card p-5">
              <h2 className="mt-0 mb-4 text-[15px] font-medium tracking-tight">Популярные категории</h2>
              {s.popularCategories.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">Нет данных за выбранный период</div>
              ) : (
                <div className="grid gap-3.5">
                  {s.popularCategories.slice(0, 6).map((c, idx) => (
                    <GradientSliderRow
                      key={c.categoryName}
                      label={c.categoryName}
                      valueText={`${c.quantity} шт · ${formatCompactMoney(c.revenue, config.language)}`}
                      sharePct={(c.revenue / totalCatRev) * 100}
                      tone={SLIDER_TONES[(idx + 1) % SLIDER_TONES.length]}
                      delayMs={idx * 65}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
