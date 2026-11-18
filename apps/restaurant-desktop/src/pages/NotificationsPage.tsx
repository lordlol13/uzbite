import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { restaurantApi } from '../api/client';
import { EmptyBox, StatusPill } from '../components/Common';
import { Icon } from '../components/Icon';
import { useSession } from '../store/session';
import { formatDateTime } from '../utils/format';

export function NotificationsPage() {
  const { config } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const notifQuery = useQuery({
    queryKey: ['restaurant-notifications', 1],
    queryFn: () => restaurantApi.getNotifications(1),
  });

  const markReadMut = useMutation({
    mutationFn: (id?: string) => restaurantApi.markNotificationsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['restaurant-notifications'] }),
  });

  const items = notifQuery.data?.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-extrabold">Уведомления ресторана</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
            Все события заказов, оплат, курьеров, отзывов и подписок сохраняются в PostgreSQL.
          </p>
        </div>
        {items.some(i => !i.readAt) && (
          <button
            type="button"
            disabled={markReadMut.isPending}
            onClick={() => markReadMut.mutate(undefined)}
            className="btn-secondary text-xs"
          >
            <Icon name="check" size={14} /> Отметить все прочитанными
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyBox icon="notifications" title="Уведомлений пока нет" />
      ) : (
        <div className="space-y-2.5">
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => {
                if (!item.readAt) markReadMut.mutate(item.id);
                if (item.link.startsWith('/')) navigate(item.link);
              }}
              className={`card cursor-pointer p-4 transition hover:border-[var(--accent)] ${
                !item.readAt ? 'border-l-4 border-l-[var(--accent)]' : 'opacity-80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold">{item.title}</div>
                <div className="flex items-center gap-2">
                  {!item.readAt && <StatusPill label="Новое" tone="accent" />}
                  <span className="text-[11px] text-[var(--muted)] tabular-nums">
                    {formatDateTime(item.createdAt, config.language)}
                  </span>
                </div>
              </div>
              <p className="mt-1.5 mb-0 text-xs text-[var(--muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
