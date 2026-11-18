import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { openExternalYandexMap, restaurantApi } from '../api/client';
import { ErrorBanner, Modal, StatusPill } from '../components/Common';
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

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { restaurant, config } = useSession();

  const [actionError, setActionError] = useState('');
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelOrderModal, setCancelOrderModal] = useState(false);
  const [cancelOrderReason, setCancelOrderReason] = useState('');
  const [ownCourierModal, setOwnCourierModal] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState('');
  const [onDemandConfirmModal, setOnDemandConfirmModal] = useState(false);
  const [cancelAssignModal, setCancelAssignModal] = useState(false);
  const [cancelAssignReason, setCancelAssignReason] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ['restaurant-order', id],
    queryFn: () => restaurantApi.getOrder(id!),
    enabled: Boolean(id),
    refetchInterval: 10000,
  });

  const couriersQuery = useQuery({
    queryKey: ['restaurant-couriers'],
    queryFn: restaurantApi.getCouriers,
  });

  const refreshOrder = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['restaurant-order', id] }),
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['restaurant-dashboard'] }),
    ]);
  };

  const acceptOrderMut = useMutation({
    mutationFn: () => restaurantApi.acceptOrder(id!),
    onSuccess: refreshOrder,
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка принятия заказа'),
  });

  const statusMut = useMutation({
    mutationFn: (nextStatus: 'PREPARING' | 'DELIVERING' | 'DELIVERED') =>
      restaurantApi.updateOrderStatus(id!, nextStatus),
    onSuccess: refreshOrder,
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка обновления статуса'),
  });

  const cancelOrderMut = useMutation({
    mutationFn: () => restaurantApi.cancelOrder(id!, cancelOrderReason),
    onSuccess: async () => {
      setCancelOrderModal(false);
      await refreshOrder();
    },
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка отмены'),
  });

  const confirmPayMut = useMutation({
    mutationFn: (paymentId: string) => restaurantApi.confirmPayment(paymentId),
    onSuccess: refreshOrder,
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка подтверждения оплаты'),
  });

  const rejectPayMut = useMutation({
    mutationFn: (paymentId: string) => restaurantApi.rejectPayment(paymentId, rejectReason),
    onSuccess: async () => {
      setRejectModal(false);
      setRejectReason('');
      await refreshOrder();
    },
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка отклонения оплаты'),
  });

  const assignOwnMut = useMutation({
    mutationFn: () => restaurantApi.assignOwnCourier(id!, selectedCourierId),
    onSuccess: async () => {
      setOwnCourierModal(false);
      await refreshOrder();
    },
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка назначения курьера'),
  });

  const requestOnDemandMut = useMutation({
    mutationFn: () => restaurantApi.requestOnDemandCourier(id!),
    onSuccess: async () => {
      setOnDemandConfirmModal(false);
      await refreshOrder();
    },
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка запуска поиска'),
  });

  const cancelSearchMut = useMutation({
    mutationFn: () => restaurantApi.cancelDeliverySearch(id!),
    onSuccess: refreshOrder,
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка отмены поиска'),
  });

  const cancelAssignMut = useMutation({
    mutationFn: () => restaurantApi.cancelDeliveryAssignment(id!, cancelAssignReason),
    onSuccess: async () => {
      setCancelAssignModal(false);
      setCancelAssignReason('');
      await refreshOrder();
    },
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка отмены назначения'),
  });

  const markReadyMut = useMutation({
    mutationFn: () => restaurantApi.markReadyForPickup(id!),
    onSuccess: refreshOrder,
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка отметки готовности'),
  });

  const handoverMut = useMutation({
    mutationFn: (startDelivery: boolean) => restaurantApi.handoverDelivery(id!, startDelivery),
    onSuccess: refreshOrder,
    onError: err => setActionError(err instanceof Error ? err.message : 'Ошибка передачи курьеру'),
  });

  async function viewReceipt(paymentId: string) {
    setActionError('');
    try {
      const res = await restaurantApi.getReceiptUrl(paymentId);
      setReceiptUrl(res.url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Чек недоступен');
    }
  }

  if (orderQuery.isLoading) {
    return <div className="card p-8 text-center text-xs text-[var(--muted)]">Загрузка заказа…</div>;
  }
  if (orderQuery.isError || !orderQuery.data) {
    return (
      <ErrorBanner
        message={orderQuery.error instanceof Error ? orderQuery.error.message : 'Заказ не найден'}
      />
    );
  }

  const order = orderQuery.data;
  const os = orderStatusInfo(order.status);
  const ps = order.payment ? paymentStatusInfo(order.payment.status) : null;
  const delivery = order.delivery;
  const ds = delivery ? deliveryStatusInfo(delivery.status) : null;

  const activeCouriers = (couriersQuery.data ?? []).filter(c => c.status === 'ACTIVE');
  const ownEnabled = restaurant?.deliverySettings?.ownCouriersEnabled ?? true;
  const onDemandEnabled = restaurant?.deliverySettings?.onDemandCouriersEnabled ?? true;

  const canChooseDelivery =
    ['ACCEPTED', 'PREPARING'].includes(order.status) &&
    (!delivery || ['NOT_REQUESTED', 'FAILED', 'CANCELLED'].includes(delivery.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/orders')} className="btn-secondary min-h-0 px-3 py-1.5 text-xs">
            <Icon name="back" size={15} /> К заказам
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-xl font-extrabold tabular-nums">Заказ #{order.id.slice(-6)}</h1>
              <StatusPill label={os.label} tone={os.tone} />
            </div>
            <div className="mt-0.5 text-xs text-[var(--muted)]">
              Создан: {formatDateTime(order.createdAt, config.language)} · ID: {order.id}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {order.status === 'PENDING_ACCEPTANCE' && (
            <button
              type="button"
              disabled={acceptOrderMut.isPending}
              onClick={() => {
                setActionError('');
                acceptOrderMut.mutate();
              }}
              className="btn-primary text-xs"
            >
              <Icon name="accept" size={16} /> Принять заказ
            </button>
          )}
          {order.status === 'ACCEPTED' && (
            <button
              type="button"
              disabled={statusMut.isPending}
              onClick={() => {
                setActionError('');
                statusMut.mutate('PREPARING');
              }}
              className="btn-primary text-xs"
            >
              <Icon name="cooking" size={16} /> Начать приготовление
            </button>
          )}
          {['PENDING_ACCEPTANCE', 'ACCEPTED', 'PREPARING'].includes(order.status) && (
            <button
              type="button"
              onClick={() => {
                setActionError('');
                setCancelOrderModal(true);
              }}
              className="btn-danger text-xs"
            >
              Отменить заказ
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={actionError} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="card p-5">
            <h2 className="mt-0 mb-3 text-sm font-extrabold">Состав заказа (исторические цены)</h2>
            <div className="divide-y divide-[var(--border)]">
              {order.items.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={item.imageUrl}
                      alt={item.dishName}
                      className="h-11 w-11 shrink-0 rounded-xl border border-[var(--border)] object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-bold">{item.dishName}</div>
                      <div className="text-[11px] text-[var(--muted)] tabular-nums">
                        {formatMoney(item.unitPrice, config.language)} × {item.quantity}
                      </div>
                    </div>
                  </div>
                  <div className="font-extrabold tabular-nums">
                    {formatMoney(item.unitPrice * item.quantity, config.language)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3 text-xs">
              <div className="flex justify-between text-[var(--muted)]">
                <span>Сумма блюд</span>
                <span className="tabular-nums">{formatMoney(order.subtotal, config.language)}</span>
              </div>
              <div className="flex justify-between text-[var(--muted)]">
                <span>Доставка</span>
                <span className="tabular-nums">{formatMoney(order.deliveryFee, config.language)}</span>
              </div>
              <div className="flex justify-between pt-1 text-sm font-extrabold">
                <span>Итого</span>
                <span className="tabular-nums">{formatMoney(order.total, config.language)}</span>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-sm font-extrabold">Доставка и курьер</h2>
              {ds && <StatusPill label={ds.label} tone={ds.tone} />}
            </div>

            {order.status === 'PENDING_ACCEPTANCE' && (
              <p className="mt-3 mb-0 text-xs text-[var(--muted)]">
                Сначала примите заказ (и подтвердите оплату картой, если выбрана карта), затем выберите способ доставки.
              </p>
            )}

            {canChooseDelivery && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!ownEnabled}
                  onClick={() => {
                    setActionError('');
                    setSelectedCourierId(activeCouriers.find(c => c.availability === 'AVAILABLE')?.courierId ?? '');
                    setOwnCourierModal(true);
                  }}
                  className="flex flex-col items-start gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition hover:border-[var(--accent)]"
                >
                  <div className="flex items-center gap-2 text-xs font-extrabold">
                    <Icon name="ownCourier" size={18} className="text-[var(--accent)]" />
                    Доставка своим курьером
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    {ownEnabled
                      ? `Выберите прикреплённого курьера (${activeCouriers.length} в штате)`
                      : 'Отключено в настройках доставки'}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!onDemandEnabled}
                  onClick={() => {
                    setActionError('');
                    setOnDemandConfirmModal(true);
                  }}
                  className="flex flex-col items-start gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition hover:border-[var(--accent)]"
                >
                  <div className="flex items-center gap-2 text-xs font-extrabold">
                    <Icon name="onDemandCourier" size={18} className="text-[var(--accent)]" />
                    Найти курьера UzBite
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    {onDemandEnabled
                      ? 'Заявка свободным курьерам UzBite по принципу такси'
                      : 'Отключено в настройках доставки'}
                  </div>
                </button>
              </div>
            )}

            {delivery && (
              <div className="mt-4 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-[var(--muted)]">Режим: </span>
                    <span className="font-extrabold">{deliveryModeLabel(delivery.mode)}</span>
                  </div>
                  <span className="font-semibold text-[var(--muted)] tabular-nums">
                    Вознаграждение курьера: {formatMoney(delivery.courierReward, config.language)}
                  </span>
                </div>

                {delivery.status === 'SEARCHING' && (
                  <div className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-soft)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-extrabold text-[var(--warn)]">
                        <Icon name="courierSearch" size={16} />
                        Ищем свободного курьера UzBite…
                      </div>
                      <button
                        type="button"
                        disabled={cancelSearchMut.isPending}
                        onClick={() => cancelSearchMut.mutate()}
                        className="btn-secondary min-h-0 px-3 py-1 text-[11px]"
                      >
                        Отменить поиск
                      </button>
                    </div>
                    <div className="mt-1.5 text-[11px] text-[var(--muted)]">
                      Отправлено предложений: {delivery.activeRequest?.offersCount ?? delivery.offers.length}.{' '}
                      {(delivery.activeRequest?.offersCount ?? delivery.offers.length) === 0
                        ? 'Сейчас нет свободных курьеров в сети — заявка остаётся открытой до истечения таймера.'
                        : 'Ожидаем подтверждения от первого принявшего курьера.'}
                    </div>
                  </div>
                )}

                {delivery.status === 'OFFERED' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-soft)] p-3">
                    <span className="font-bold text-[var(--warn)]">
                      Предложение отправлено собственному курьеру. Ожидание подтверждения…
                    </span>
                    <button
                      type="button"
                      disabled={cancelSearchMut.isPending}
                      onClick={() => cancelSearchMut.mutate()}
                      className="btn-secondary min-h-0 px-3 py-1 text-[11px]"
                    >
                      Отозвать
                    </button>
                  </div>
                )}

                {(delivery.status === 'FAILED' || delivery.status === 'CANCELLED') && delivery.cancelReason && (
                  <div className="rounded-xl bg-[var(--bad-soft)] p-3 font-semibold text-[var(--bad)]">
                    {delivery.cancelReason}
                  </div>
                )}

                {delivery.assignedCourier && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-extrabold">
                          Назначенный курьер: {delivery.assignedCourier.name} (@{delivery.assignedCourier.username})
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                          Телефон: {delivery.assignedCourier.phone || 'не указан'} · Принято:{' '}
                          {delivery.acceptedAt ? formatDateTime(delivery.acceptedAt, config.language) : '—'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['ASSIGNED', 'COURIER_ACCEPTED'].includes(delivery.status) && (
                          <button
                            type="button"
                            disabled={markReadyMut.isPending}
                            onClick={() => markReadyMut.mutate()}
                            className="btn-secondary min-h-0 px-3 py-1.5 text-[11px]"
                          >
                            Готово к выдаче
                          </button>
                        )}
                        {['COURIER_ACCEPTED', 'READY_FOR_PICKUP'].includes(delivery.status) && (
                          <>
                            <button
                              type="button"
                              disabled={handoverMut.isPending}
                              onClick={() => handoverMut.mutate(false)}
                              className="btn-primary min-h-0 px-3 py-1.5 text-[11px]"
                            >
                              Передать курьеру
                            </button>
                            <button
                              type="button"
                              disabled={handoverMut.isPending}
                              onClick={() => handoverMut.mutate(true)}
                              className="btn-secondary min-h-0 px-3 py-1.5 text-[11px]"
                            >
                              Передать и отправить (Доставляется)
                            </button>
                          </>
                        )}
                        {!['PICKED_UP', 'ON_THE_WAY', 'DELIVERED'].includes(delivery.status) && (
                          <button
                            type="button"
                            onClick={() => setCancelAssignModal(true)}
                            className="btn-danger min-h-0 px-3 py-1.5 text-[11px]"
                          >
                            Снять курьера
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {delivery.history.length > 0 && (
                  <div className="pt-1">
                    <div className="mb-1.5 text-[11px] font-bold text-[var(--muted)]">История доставки</div>
                    <div className="space-y-1">
                      {delivery.history.map(h => (
                        <div key={h.id} className="flex items-center justify-between text-[11px]">
                          <span>
                            <strong>{deliveryStatusInfo(h.toStatus).label}</strong>
                            {h.note ? ` · ${h.note}` : ''}
                          </span>
                          <span className="text-[var(--muted)] tabular-nums">
                            {formatDateTime(h.createdAt, config.language)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5 text-xs">
            <h2 className="mt-0 mb-3 text-sm font-extrabold">Оплата заказа</h2>
            {order.payment ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Способ</span>
                  <span className="font-bold">
                    {order.payment.method === 'CARD' ? 'Перевод на карту' : 'Наличными'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Статус</span>
                  {ps && <StatusPill label={ps.label} tone={ps.tone} />}
                </div>
                {order.payment.rejectionReason && (
                  <div className="rounded-xl bg-[var(--bad-soft)] p-2.5 text-[var(--bad)]">
                    Причина отклонения: {order.payment.rejectionReason}
                  </div>
                )}
                {order.payment.receiptId && (
                  <button
                    type="button"
                    onClick={() => void viewReceipt(order.payment!.id)}
                    className="btn-secondary w-full text-xs"
                  >
                    <Icon name="receipt" size={15} /> Открыть чек покупателя
                  </button>
                )}
                {receiptUrl && (
                  <img
                    src={receiptUrl}
                    alt="Чек об оплате"
                    className="max-h-64 w-full rounded-xl border border-[var(--border)] object-contain"
                  />
                )}
                {order.payment.status !== 'PAID' && order.status !== 'CANCELLED' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={confirmPayMut.isPending}
                      onClick={() => confirmPayMut.mutate(order.payment!.id)}
                      className="btn-primary flex-1 text-xs"
                    >
                      <Icon name="check" size={15} /> Подтвердить оплату
                    </button>
                    {order.payment.status !== 'REJECTED' && (
                      <button
                        type="button"
                        onClick={() => setRejectModal(true)}
                        className="btn-danger text-xs"
                      >
                        Отклонить
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[var(--muted)]">Данные об оплате отсутствуют</span>
            )}
          </div>

          <div className="card p-5 text-xs">
            <h2 className="mt-0 mb-3 text-sm font-extrabold">Покупатель и адрес доставки</h2>
            <div className="space-y-2">
              <div>
                <span className="text-[var(--muted)]">Получатель: </span>
                <strong>{order.recipientName}</strong>
              </div>
              <div>
                <span className="text-[var(--muted)]">Телефон: </span>
                <strong className="tabular-nums">{order.recipientPhone}</strong>
              </div>
              <div>
                <span className="text-[var(--muted)]">Адрес: </span>
                <strong>{order.addressSnapshot?.addressText}</strong>
              </div>
              {(order.addressSnapshot?.entrance ||
                order.addressSnapshot?.floor ||
                order.addressSnapshot?.apartment) && (
                <div className="text-[var(--muted)]">
                  Подъезд: {order.addressSnapshot.entrance || '—'} · Этаж: {order.addressSnapshot.floor || '—'} ·
                  Кв.: {order.addressSnapshot.apartment || '—'}
                </div>
              )}
              {order.addressSnapshot?.comment && (
                <div className="rounded-xl bg-[var(--surface-2)] p-2.5 text-[11px]">
                  Комментарий: {order.addressSnapshot.comment}
                </div>
              )}
              {Number.isFinite(order.addressSnapshot?.latitude) &&
                Number.isFinite(order.addressSnapshot?.longitude) && (
                  <button
                    type="button"
                    onClick={() =>
                      void openExternalYandexMap(
                        order.addressSnapshot.latitude,
                        order.addressSnapshot.longitude,
                      )
                    }
                    className="btn-secondary mt-2 w-full text-xs"
                  >
                    <Icon name="map" size={15} /> Открыть в Яндекс Картах
                  </button>
                )}
            </div>
          </div>

          {order.statusHistory.length > 0 && (
            <div className="card p-5 text-xs">
              <h2 className="mt-0 mb-3 text-sm font-extrabold">Журнал заказа</h2>
              <div className="space-y-2">
                {order.statusHistory.map(h => (
                  <div key={h.id} className="flex items-start justify-between gap-2 text-[11px]">
                    <div>
                      <div className="font-bold">{orderStatusInfo(h.toStatus).label}</div>
                      {h.note && <div className="text-[var(--muted)]">{h.note}</div>}
                    </div>
                    <span className="shrink-0 text-[var(--muted)] tabular-nums">
                      {formatDateTime(h.createdAt, config.language)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {rejectModal && order.payment && (
        <Modal title="Отклонить оплату" onClose={() => setRejectModal(false)}>
          <label className="text-xs font-bold text-[var(--muted)]">
            Укажите причину отклонения (увидит покупатель)
            <textarea
              className="input-field mt-1 min-h-24 py-2"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Например: Перевод не поступил или неверная сумма в чеке"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRejectModal(false)}>
              Отмена
            </button>
            <button
              type="button"
              disabled={rejectReason.trim().length < 3 || rejectPayMut.isPending}
              onClick={() => rejectPayMut.mutate(order.payment!.id)}
              className="btn-danger"
            >
              Отклонить оплату
            </button>
          </div>
        </Modal>
      )}

      {cancelOrderModal && (
        <Modal title="Отменить заказ" onClose={() => setCancelOrderModal(false)}>
          <label className="text-xs font-bold text-[var(--muted)]">
            Причина отмены
            <input
              className="input-field mt-1"
              value={cancelOrderReason}
              onChange={e => setCancelOrderReason(e.target.value)}
              placeholder="Например: Закончились ингредиенты"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCancelOrderModal(false)}>
              Назад
            </button>
            <button
              type="button"
              disabled={cancelOrderReason.trim().length < 2 || cancelOrderMut.isPending}
              onClick={() => cancelOrderMut.mutate()}
              className="btn-danger"
            >
              Подтвердить отмену
            </button>
          </div>
        </Modal>
      )}

      {ownCourierModal && (
        <Modal title="Назначение собственного курьера" onClose={() => setOwnCourierModal(false)}>
          {activeCouriers.length === 0 ? (
            <div className="space-y-3 text-xs">
              <p className="m-0 text-[var(--muted)]">
                У ресторана пока нет активных прикреплённых курьеров. Пригласите курьера в разделе «Мои курьеры»
                или выберите заказного курьера UzBite.
              </p>
              <button type="button" className="btn-secondary" onClick={() => navigate('/couriers')}>
                Перейти в «Мои курьеры»
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2">
                {activeCouriers.map(c => (
                  <label
                    key={c.courierId}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs ${
                      selectedCourierId === c.courierId
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="ownCourier"
                        checked={selectedCourierId === c.courierId}
                        disabled={c.availability !== 'AVAILABLE'}
                        onChange={() => setSelectedCourierId(c.courierId)}
                      />
                      <div>
                        <div className="font-extrabold">{c.name}</div>
                        <div className="text-[11px] text-[var(--muted)]">
                          @{c.username} · Активных заказов: {c.activeLoad}
                        </div>
                      </div>
                    </div>
                    <StatusPill
                      label={c.availability === 'AVAILABLE' ? 'Доступен' : c.availability}
                      tone={c.availability === 'AVAILABLE' ? 'good' : 'neutral'}
                    />
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setOwnCourierModal(false)}>
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={!selectedCourierId || assignOwnMut.isPending}
                  onClick={() => assignOwnMut.mutate()}
                  className="btn-primary"
                >
                  <Icon name="assignCourier" size={16} /> Отправить заказ курьеру
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {onDemandConfirmModal && (
        <Modal title="Найти заказного курьера UzBite" onClose={() => setOnDemandConfirmModal(false)}>
          <div className="space-y-3 text-xs">
            <p className="m-0 text-[var(--muted)]">
              Будет создана заявка для свободных курьеров UzBite. Первый принявший курьер будет закреплён за
              заказом.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 space-y-1.5">
              <div>
                <span className="text-[var(--muted)]">Точка получения: </span>
                <strong>{restaurant?.addressText}</strong>
              </div>
              <div>
                <span className="text-[var(--muted)]">Адрес доставки: </span>
                <strong>{order.addressSnapshot?.addressText}</strong>
              </div>
              <div>
                <span className="text-[var(--muted)]">Вознаграждение курьера: </span>
                <strong>
                  {formatMoney(restaurant?.deliverySettings?.courierRewardFee ?? 10000, config.language)}
                </strong>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setOnDemandConfirmModal(false)}>
                Отмена
              </button>
              <button
                type="button"
                disabled={requestOnDemandMut.isPending}
                onClick={() => requestOnDemandMut.mutate()}
                className="btn-primary"
              >
                <Icon name="courierSearch" size={16} /> Искать курьера
              </button>
            </div>
          </div>
        </Modal>
      )}

      {cancelAssignModal && (
        <Modal title="Снять назначение курьера" onClose={() => setCancelAssignModal(false)}>
          <label className="text-xs font-bold text-[var(--muted)]">
            Причина снятия курьера
            <input
              className="input-field mt-1"
              value={cancelAssignReason}
              onChange={e => setCancelAssignReason(e.target.value)}
              placeholder="Например: Курьер не выходит на связь"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCancelAssignModal(false)}>
              Назад
            </button>
            <button
              type="button"
              disabled={cancelAssignReason.trim().length < 3 || cancelAssignMut.isPending}
              onClick={() => cancelAssignMut.mutate()}
              className="btn-danger"
            >
              Снять назначение
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
