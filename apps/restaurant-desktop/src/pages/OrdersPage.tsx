import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { downloadFile, restaurantApi } from '../api/client';
import { EmptyBox, ErrorBanner, Modal, StatusPill } from '../components/Common';
import { Icon } from '../components/Icon';
import { useSession } from '../store/session';
import {
  deliveryModeLabel,
  deliveryStatusInfo,
  formatDateTime,
  formatMoney,
  orderStatusInfo,
  paymentStatusInfo,
} from '../utils/format';

const FILTERS = [
  { id: 'ALL', label: 'Все' },
  { id: 'NEW', label: 'Новые' },
  { id: 'ACCEPTED', label: 'Принятые' },
  { id: 'PREPARING', label: 'Готовятся' },
  { id: 'WAITING_COURIER', label: 'Ожидают курьера' },
  { id: 'DELIVERING', label: 'Доставляются' },
  { id: 'DELIVERED', label: 'Доставлены' },
  { id: 'CANCELLED', label: 'Отменены' },
] as const;

export function OrdersPage() {
  const { config } = useSession();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [exportOpen, setExportOpen] = useState(false);
  const [expFormat, setExpFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [expFrom, setExpFrom] = useState('');
  const [expTo, setExpTo] = useState('');
  const [expPayment, setExpPayment] = useState('ALL');
  const [expDelivery, setExpDelivery] = useState('ALL');
  const [includeContacts, setIncludeContacts] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const ordersQuery = useQuery({
    queryKey: ['restaurant-orders', filter, search, page],
    queryFn: () => restaurantApi.getOrders(filter, search, page),
  });

  async function runExport() {
    setExportMsg('');
    const qs = new URLSearchParams({
      format: expFormat,
      status: filter === 'NEW' ? 'PENDING_ACCEPTANCE' : filter === 'WAITING_COURIER' ? 'ALL' : filter,
      paymentMethod: expPayment,
      deliveryMode: expDelivery,
      includeContacts: String(includeContacts),
    });
    if (expFrom) qs.set('from', expFrom);
    if (expTo) qs.set('to', expTo);
    const res = await downloadFile(
      `/restaurant-account/exports/orders?${qs.toString()}`,
      `uzbite-orders-${new Date().toISOString().slice(0, 10)}.${expFormat}`,
    );
    if (res.saved) {
      setExportMsg(res.filePath ? `Сохранено: ${res.filePath}` : 'Файл успешно сохранён');
    }
  }

  const orders = ordersQuery.data?.data ?? [];
  const pagination = ordersQuery.data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold">Заказы ресторана</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
            Управление принятием, оплатой и доставкой заказов в реальном времени
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setExportOpen(true)} className="btn-secondary text-xs">
            <Icon name="exportFile" size={15} /> Экспорт заказов (Excel/CSV)
          </button>
          <button type="button" onClick={() => void ordersQuery.refetch()} className="btn-secondary text-xs">
            <Icon name="refresh" size={15} /> Обновить
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setFilter(tab.id);
                setPage(1);
              }}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                filter === tab.id
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Icon name="search" size={15} className="absolute top-3 left-3 text-[var(--muted)]" />
          <input
            type="search"
            className="input-field pl-9 text-xs"
            placeholder="Поиск по ID, имени, телефону"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <ErrorBanner message={ordersQuery.error instanceof Error ? ordersQuery.error.message : null} />

      {ordersQuery.isLoading ? (
        <div className="card p-8 text-center text-xs text-[var(--muted)]">Загрузка заказов…</div>
      ) : orders.length === 0 ? (
        <EmptyBox
          icon="orders"
          title="Заказы по фильтру не найдены"
          subtitle="Новые заказы от покупателей появятся здесь автоматически через Socket.IO."
        />
      ) : (
        <div className="grid gap-3">
          {orders.map(order => {
            const os = orderStatusInfo(order.status);
            const ps = order.payment ? paymentStatusInfo(order.payment.status) : null;
            const ds = order.delivery ? deliveryStatusInfo(order.delivery.status) : null;
            return (
              <div
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="card cursor-pointer p-4 transition hover:border-[var(--accent)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">Заказ #{order.id.slice(-6)}</span>
                      <StatusPill label={os.label} tone={os.tone} />
                      {ps && (
                        <StatusPill
                          label={`${order.payment?.method === 'CARD' ? 'Карта' : 'Наличные'} · ${ps.label}`}
                          tone={ps.tone}
                        />
                      )}
                      {ds && <StatusPill label={ds.label} tone={ds.tone} />}
                    </div>
                    <div className="mt-1.5 text-xs text-[var(--muted)]">
                      {formatDateTime(order.createdAt, config.language)} · <strong>{order.recipientName}</strong> (
                      {order.recipientPhone})
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      Адрес: {order.addressSnapshot?.addressText}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums">
                      {formatMoney(order.total, config.language)}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-[var(--muted)]">
                      {order.delivery ? deliveryModeLabel(order.delivery.mode) : 'Доставка не выбрана'}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-xs">
                  <div className="text-[var(--muted)]">
                    {order.items.map(i => `${i.dishName} ×${i.quantity}`).join(', ')}
                  </div>
                  <span className="font-bold text-[var(--accent)]">Подробнее и управление →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pagination && pagination.total > pagination.pageSize && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="btn-secondary min-h-0 py-1.5 text-xs"
          >
            Назад
          </button>
          <span className="font-semibold text-[var(--muted)] tabular-nums">
            Стр. {pagination.page} из {Math.ceil(pagination.total / pagination.pageSize)}
          </span>
          <button
            type="button"
            disabled={!pagination.hasMore}
            onClick={() => setPage(p => p + 1)}
            className="btn-secondary min-h-0 py-1.5 text-xs"
          >
            Вперёд
          </button>
        </div>
      )}

      {exportOpen && (
        <Modal title="Экспорт заказов в Excel / CSV" onClose={() => setExportOpen(false)}>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-[var(--muted)]">
                Формат файла
                <select
                  className="input-field mt-1"
                  value={expFormat}
                  onChange={e => setExpFormat(e.target.value as 'xlsx' | 'csv')}
                >
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv UTF-8)</option>
                </select>
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Способ оплаты
                <select
                  className="input-field mt-1"
                  value={expPayment}
                  onChange={e => setExpPayment(e.target.value)}
                >
                  <option value="ALL">Все</option>
                  <option value="CASH">Наличные</option>
                  <option value="CARD">Карта</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-[var(--muted)]">
                Дата с
                <input type="date" className="input-field mt-1" value={expFrom} onChange={e => setExpFrom(e.target.value)} />
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Дата по
                <input type="date" className="input-field mt-1" value={expTo} onChange={e => setExpTo(e.target.value)} />
              </label>
            </div>
            <label className="text-xs font-bold text-[var(--muted)]">
              Тип доставки
              <select
                className="input-field mt-1"
                value={expDelivery}
                onChange={e => setExpDelivery(e.target.value)}
              >
                <option value="ALL">Все режимы</option>
                <option value="OWN_COURIER">Свои курьеры</option>
                <option value="ON_DEMAND_COURIER">Заказные курьеры UzBite</option>
              </select>
            </label>
            <label className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={includeContacts}
                onChange={e => setIncludeContacts(e.target.checked)}
              />
              <span>
                <strong>Включить контакты покупателей (операционный отчёт)</strong>
                <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                  По умолчанию домашние адреса и телефоны не включаются в финансовый экспорт.
                </span>
              </span>
            </label>
            {exportMsg && (
              <div className="rounded-xl bg-[var(--good-soft)] p-3 text-xs font-bold text-[var(--good)]">
                {exportMsg}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setExportOpen(false)}>
                Закрыть
              </button>
              <button type="button" className="btn-primary" onClick={() => void runExport()}>
                <Icon name="exportFile" size={16} /> Скачать файл
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
