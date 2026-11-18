import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { restaurantApi } from '../api/client';
import { EmptyBox, StatusPill } from '../components/Common';
import { useSession } from '../store/session';
import { deliveryModeLabel, deliveryStatusInfo, formatDateTime, formatMoney } from '../utils/format';

export function DeliveryPage() {
  const { config } = useSession();
  const navigate = useNavigate();

  const deliveriesQuery = useQuery({
    queryKey: ['restaurant-deliveries'],
    queryFn: restaurantApi.getDeliveries,
  });

  const deliveries = deliveriesQuery.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="m-0 text-xl font-extrabold">Доставки ресторана</h1>
        <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
          Отслеживание всех активных и завершённых доставок (собственные и заказные курьеры UzBite)
        </p>
      </div>

      {deliveries.length === 0 ? (
        <EmptyBox
          icon="delivery"
          title="Доставок пока нет"
          subtitle="Назначьте курьера на принятый заказ в карточке заказа."
          action={
            <button type="button" onClick={() => navigate('/orders')} className="btn-primary text-xs">
              Перейти к заказам
            </button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-bold text-[var(--muted)]">
                <th className="px-4 py-3">Заказ</th>
                <th className="px-4 py-3">Режим</th>
                <th className="px-4 py-3">Статус доставки</th>
                <th className="px-4 py-3">Курьер</th>
                <th className="px-4 py-3">Вознаграждение</th>
                <th className="px-4 py-3">Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map(d => {
                const st = deliveryStatusInfo(d.status);
                return (
                  <tr
                    key={d.id}
                    onClick={() => navigate(`/orders/${d.orderId}`)}
                    className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-3 font-extrabold tabular-nums">#{d.orderId.slice(-6)}</td>
                    <td className="px-4 py-3 font-semibold">{deliveryModeLabel(d.mode)}</td>
                    <td className="px-4 py-3">
                      <StatusPill label={st.label} tone={st.tone} />
                    </td>
                    <td className="px-4 py-3">
                      {d.assignedCourier ? d.assignedCourier.name : <span className="text-[var(--muted)]">—</span>}
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">
                      {formatMoney(d.courierReward, config.language)}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] tabular-nums">
                      {formatDateTime(d.updatedAt, config.language)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
