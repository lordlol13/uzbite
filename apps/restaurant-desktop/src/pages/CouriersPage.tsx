import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { restaurantApi } from '../api/client';
import { EmptyBox, ErrorBanner, StatusPill } from '../components/Common';
import { Icon } from '../components/Icon';
import { useSession } from '../store/session';
import { deliveryStatusInfo, formatDateTime } from '../utils/format';

export function CouriersPage() {
  const { config } = useSession();
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState('');

  const couriersQuery = useQuery({
    queryKey: ['restaurant-couriers'],
    queryFn: restaurantApi.getCouriers,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['restaurant-couriers'] });

  const inviteMut = useMutation({
    mutationFn: () => restaurantApi.inviteCourier(identifier),
    onSuccess: async res => {
      setError('');
      setIdentifier('');
      setInviteInfo(`Приглашение отправлено! Код привязки для курьера: ${res.inviteCode}`);
      await refresh();
    },
    onError: err => setError(err instanceof Error ? err.message : 'Не удалось пригласить курьера'),
  });

  const statusMut = useMutation({
    mutationFn: ({ affiliationId, status }: { affiliationId: string; status: 'ACTIVE' | 'DISABLED' }) =>
      restaurantApi.updateCourierAffiliation(affiliationId, status),
    onSuccess: refresh,
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка изменения статуса'),
  });

  const couriers = couriersQuery.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="m-0 text-xl font-semibold">Мои курьеры (Режим A)</h1>
        <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
          Собственные курьеры привязываются к ресторану только после согласия курьера в его аккаунте по коду
          приглашения.
        </p>
      </div>

      <ErrorBanner message={error} />
      {inviteInfo && (
        <div className="rounded-xl bg-[var(--good-soft)] p-3 text-xs font-bold text-[var(--good)]">
          {inviteInfo}
        </div>
      )}

      <div className="card flex flex-wrap gap-2 p-4">
        <input
          className="input-field min-w-60 flex-1"
          placeholder="Email, @username или ID курьера UzBite"
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
        />
        <button
          type="button"
          disabled={!identifier.trim() || inviteMut.isPending}
          onClick={() => inviteMut.mutate()}
          className="btn-primary text-xs"
        >
          <Icon name="assignCourier" size={16} /> Пригласить курьера
        </button>
      </div>

      {couriers.length === 0 ? (
        <EmptyBox
          icon="ownCourier"
          title="Собственные курьеры ещё не прикреплены"
          subtitle="Отправьте приглашение курьеру по email или логину — после его подтверждения вы сможете назначать ему заказы."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-bold text-[var(--muted)]">
                <th className="px-4 py-3">Курьер</th>
                <th className="px-4 py-3">Привязка / Код</th>
                <th className="px-4 py-3">Доступность</th>
                <th className="px-4 py-3">Загрузка</th>
                <th className="px-4 py-3">Последнее назначение</th>
                <th className="px-4 py-3">Действие</th>
              </tr>
            </thead>
            <tbody>
              {couriers.map(c => (
                <tr key={c.affiliationId} className="border-b border-[var(--border)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      @{c.username} {c.phone ? `· ${c.phone}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      label={
                        c.status === 'ACTIVE'
                          ? 'Подтверждён'
                          : c.status === 'INVITED'
                            ? 'Ожидает согласия'
                            : c.status
                      }
                      tone={c.status === 'ACTIVE' ? 'good' : c.status === 'INVITED' ? 'warn' : 'neutral'}
                    />
                    {c.inviteCode && (
                      <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">{c.inviteCode}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      label={
                        c.availability === 'AVAILABLE'
                          ? 'Доступен'
                          : c.availability === 'BUSY'
                            ? 'Занят'
                            : c.availability === 'OFFLINE'
                              ? 'Не в сети'
                              : 'Недоступен'
                      }
                      tone={c.availability === 'AVAILABLE' ? 'good' : 'neutral'}
                    />
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums">{c.activeLoad} активн.</td>
                  <td className="px-4 py-3 text-[11px]">
                    {c.lastAssignmentStatus ? (
                      <div>
                        <div className="font-semibold">{deliveryStatusInfo(c.lastAssignmentStatus).label}</div>
                        {c.lastAssignedAt && (
                          <div className="text-[var(--muted)]">
                            {formatDateTime(c.lastAssignedAt, config.language)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        onClick={() => statusMut.mutate({ affiliationId: c.affiliationId, status: 'DISABLED' })}
                        className="btn-danger min-h-0 px-2.5 py-1 text-[11px]"
                      >
                        Отключить
                      </button>
                    ) : c.status === 'DISABLED' ? (
                      <button
                        type="button"
                        onClick={() => statusMut.mutate({ affiliationId: c.affiliationId, status: 'ACTIVE' })}
                        className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
                      >
                        Активировать
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
