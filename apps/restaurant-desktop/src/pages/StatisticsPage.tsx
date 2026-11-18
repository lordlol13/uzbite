import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { downloadFile, restaurantApi } from '../api/client';
import { ErrorBanner } from '../components/Common';
import { Icon } from '../components/Icon';
import { useSession } from '../store/session';
import { formatMoney } from '../utils/format';

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-extrabold">Статистика ресторана</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
            Фактические показатели из PostgreSQL: заказы, подтверждённые платежи и структура доставки
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input-field w-auto text-xs" value={from} onChange={e => setFrom(e.target.value)} />
          <input type="date" className="input-field w-auto text-xs" value={to} onChange={e => setTo(e.target.value)} />
          <button type="button" onClick={() => void exportReport('xlsx')} className="btn-secondary text-xs">
            <Icon name="excel" size={15} /> Excel
          </button>
          <button type="button" onClick={() => void exportReport('csv')} className="btn-secondary text-xs">
            <Icon name="csv" size={15} /> CSV
          </button>
        </div>
      </div>

      {exportMsg && (
        <div className="rounded-xl bg-[var(--good-soft)] p-3 text-xs font-bold text-[var(--good)]">
          {exportMsg}
        </div>
      )}
      <ErrorBanner message={statsQuery.error instanceof Error ? statsQuery.error.message : null} />

      {s && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card p-4">
              <div className="text-xs font-bold text-[var(--muted)]">Заказы (сегодня / неделя / месяц)</div>
              <div className="mt-2 text-xl font-extrabold tabular-nums">
                {s.ordersToday} / {s.ordersWeek} / {s.ordersMonth}
              </div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">
                За период: {s.ordersInRange} (завершено: {s.completedOrders}, отменено: {s.cancelledOrders})
              </div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-bold text-[var(--muted)]">Создано заказов на сумму</div>
              <div className="mt-2 text-xl font-extrabold tabular-nums">
                {formatMoney(s.createdOrdersAmount, config.language)}
              </div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">
                Не является выручкой до подтверждения оплаты
              </div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-bold text-[var(--muted)]">Подтверждённые оплаты</div>
              <div className="mt-2 text-xl font-extrabold text-[var(--good)] tabular-nums">
                {formatMoney(s.paidOrdersAmount, config.language)}
              </div>
              <div className="mt-1 text-[11px] text-[var(--muted)] tabular-nums">
                Наличные: {formatMoney(s.cashConfirmedAmount, config.language)} · Карта:{' '}
                {formatMoney(s.cardConfirmedAmount, config.language)}
              </div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-bold text-[var(--muted)]">Доставки (Свои / Заказные)</div>
              <div className="mt-2 text-xl font-extrabold tabular-nums">
                {s.ownCourierDeliveries} / {s.onDemandCourierDeliveries}
              </div>
              <div className="mt-1 text-[11px] text-[var(--muted)] tabular-nums">
                Вознаграждение курьерам: {formatMoney(s.deliveryExpensesAmount, config.language)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mt-0 mb-3 text-sm font-extrabold">Популярные блюда</h2>
              {s.popularDishes.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">Нет продаж за выбранный период</div>
              ) : (
                <div className="space-y-2.5 text-xs">
                  {s.popularDishes.map(d => (
                    <div key={d.dishName} className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <span className="font-bold">{d.dishName}</span>
                      <span className="tabular-nums">
                        {d.quantity} шт · <strong>{formatMoney(d.revenue, config.language)}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-5">
              <h2 className="mt-0 mb-3 text-sm font-extrabold">Популярные категории</h2>
              {s.popularCategories.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">Нет данных за выбранный период</div>
              ) : (
                <div className="space-y-2.5 text-xs">
                  {s.popularCategories.map(c => (
                    <div key={c.categoryName} className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <span className="font-bold">{c.categoryName}</span>
                      <span className="tabular-nums">
                        {c.quantity} шт · <strong>{formatMoney(c.revenue, config.language)}</strong>
                      </span>
                    </div>
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
