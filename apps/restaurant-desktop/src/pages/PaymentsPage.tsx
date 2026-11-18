import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentStatus } from '@uzbite/shared';
import { restaurantApi } from '../api/client';
import { EmptyBox, ErrorBanner, Modal, StatusPill } from '../components/Common';
import { Icon } from '../components/Icon';
import { useSession } from '../store/session';
import { formatDateTime, formatMoney, paymentStatusInfo } from '../utils/format';

export function PaymentsPage() {
  const { config } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [error, setError] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const paymentsQuery = useQuery({
    queryKey: ['restaurant-payments', statusFilter],
    queryFn: () => restaurantApi.getPayments(statusFilter),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['restaurant-payments'] });

  const confirmMut = useMutation({
    mutationFn: (id: string) => restaurantApi.confirmPayment(id),
    onSuccess: refresh,
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка подтверждения'),
  });

  const rejectMut = useMutation({
    mutationFn: () => restaurantApi.rejectPayment(rejectId!, rejectReason),
    onSuccess: async () => {
      setRejectId(null);
      setRejectReason('');
      await refresh();
    },
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка отклонения'),
  });

  async function openReceipt(paymentId: string) {
    setError('');
    try {
      const res = await restaurantApi.getReceiptUrl(paymentId);
      setReceiptUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Чек недоступен');
    }
  }

  const rows = paymentsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-extrabold">Оплата заказов и чеки</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
            Ручная проверка переводов на карту и подтверждение получения наличных
          </p>
        </div>
        <select
          className="input-field w-56 text-xs"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="ALL">Все статусы</option>
          <option value="AWAITING_CONFIRMATION">Ожидают проверки чека</option>
          <option value="AWAITING_PAYMENT">Ожидают наличных</option>
          <option value="PAID">Оплачено</option>
          <option value="REJECTED">Отклонено</option>
        </select>
      </div>

      <ErrorBanner message={error} />

      {rows.length === 0 ? (
        <EmptyBox icon="payment" title="Платежей по фильтру нет" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[740px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-bold text-[var(--muted)]">
                <th className="px-4 py-3">Заказ</th>
                <th className="px-4 py-3">Покупатель</th>
                <th className="px-4 py-3">Сумма</th>
                <th className="px-4 py-3">Способ</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const st = paymentStatusInfo(p.status as PaymentStatus);
                return (
                  <tr key={p.id} className="border-b border-[var(--border)]">
                    <td className="px-4 py-3 font-extrabold">
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${p.orderId}`)}
                        className="text-[var(--accent)] hover:underline"
                      >
                        #{p.orderId.slice(-6)}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-semibold">{p.order.recipientName}</td>
                    <td className="px-4 py-3 font-extrabold tabular-nums">
                      {formatMoney(p.order.total, config.language)}
                    </td>
                    <td className="px-4 py-3">{p.method === 'CARD' ? 'Карта (перевод)' : 'Наличные'}</td>
                    <td className="px-4 py-3">
                      <StatusPill label={st.label} tone={st.tone} />
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] tabular-nums">
                      {formatDateTime(p.createdAt, config.language)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {p.receiptId && (
                          <button
                            type="button"
                            onClick={() => void openReceipt(p.id)}
                            className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
                          >
                            <Icon name="receipt" size={13} /> Чек
                          </button>
                        )}
                        {p.status !== 'PAID' && p.order.status !== 'CANCELLED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => confirmMut.mutate(p.id)}
                              className="btn-primary min-h-0 px-2.5 py-1 text-[11px]"
                            >
                              Подтвердить
                            </button>
                            {p.status !== 'REJECTED' && (
                              <button
                                type="button"
                                onClick={() => setRejectId(p.id)}
                                className="btn-danger min-h-0 px-2.5 py-1 text-[11px]"
                              >
                                Отклонить
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {receiptUrl && (
        <Modal title="Чек покупателя" onClose={() => setReceiptUrl(null)}>
          <img src={receiptUrl} alt="Чек" className="max-h-[70vh] w-full rounded-xl object-contain" />
        </Modal>
      )}

      {rejectId && (
        <Modal title="Причина отклонения оплаты" onClose={() => setRejectId(null)}>
          <textarea
            className="input-field min-h-24 py-2"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Укажите причину (минимум 3 символа)"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRejectId(null)}>
              Отмена
            </button>
            <button
              type="button"
              disabled={rejectReason.trim().length < 3 || rejectMut.isPending}
              onClick={() => rejectMut.mutate()}
              className="btn-danger"
            >
              Отклонить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
