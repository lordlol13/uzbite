import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { BusinessHoursDay, DeliveryMode } from '@uzbite/shared';
import { checkBackendHealth, restaurantApi } from '../api/client';
import { ErrorBanner } from '../components/Common';
import { Icon } from '../components/Icon';
import { useSession } from '../store/session';

export function SettingsPage() {
  const { restaurant, config, updateConfig, refreshProfile } = useSession();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Delivery settings
  const [ownCouriersEnabled, setOwnCouriersEnabled] = useState(
    restaurant?.deliverySettings?.ownCouriersEnabled ?? true,
  );
  const [onDemandCouriersEnabled, setOnDemandCouriersEnabled] = useState(
    restaurant?.deliverySettings?.onDemandCouriersEnabled ?? true,
  );
  const [preferredMode, setPreferredMode] = useState<DeliveryMode>(
    restaurant?.deliverySettings?.preferredMode ?? 'OWN_COURIER',
  );
  const [baseDeliveryFee, setBaseDeliveryFee] = useState(
    String(restaurant?.deliverySettings?.baseDeliveryFee ?? restaurant?.deliveryFee ?? 12000),
  );
  const [courierRewardFee, setCourierRewardFee] = useState(
    String(restaurant?.deliverySettings?.courierRewardFee ?? 10000),
  );

  // Payment settings
  const [acceptCash, setAcceptCash] = useState(restaurant?.acceptCash ?? true);
  const [acceptCard, setAcceptCard] = useState(restaurant?.acceptCard ?? false);
  const [paymentRecipient, setPaymentRecipient] = useState(restaurant?.paymentRecipient ?? '');
  const [paymentDetails, setPaymentDetails] = useState(restaurant?.paymentDetails ?? '');
  const [paymentQrUrl, setPaymentQrUrl] = useState(restaurant?.paymentQrUrl ?? '');
  const [paymentInstructions, setPaymentInstructions] = useState(restaurant?.paymentInstructions ?? '');

  // Schedule & availability
  const [acceptingOrders, setAcceptingOrders] = useState(restaurant?.acceptingOrders ?? true);
  const [timezone, setTimezone] = useState(restaurant?.timezone ?? 'Asia/Tashkent');
  const [hours, setHours] = useState<BusinessHoursDay[]>(restaurant?.settings?.businessHours ?? []);

  // Server URL
  const [serverUrl, setServerUrl] = useState(config.apiBaseUrl);

  const saveAllMut = useMutation({
    mutationFn: async () => {
      await restaurantApi.updateSettings({
        acceptingOrders,
        timezone,
        acceptCash,
        acceptCard,
        paymentRecipient: paymentRecipient.trim() || null,
        paymentDetails: paymentDetails.trim() || null,
        paymentQrUrl: paymentQrUrl.trim() || null,
        paymentInstructions: paymentInstructions.trim() || null,
        deliverySettings: {
          ownCouriersEnabled,
          onDemandCouriersEnabled,
          preferredMode,
          baseDeliveryFee: Number(baseDeliveryFee) || 0,
          courierRewardFee: Number(courierRewardFee) || 0,
        },
      });
      if (hours.length === 7) {
        await restaurantApi.updateBusinessHours({ businessHours: hours, acceptingOrders, timezone });
      }
      await refreshProfile();
    },
    onSuccess: () => {
      setError('');
      setNotice('Все настройки сохранены на сервере UzBite.');
    },
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка сохранения настроек'),
  });

  async function uploadQr() {
    try {
      const res = await restaurantApi.uploadMedia('image');
      if (res) setPaymentQrUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки QR');
    }
  }

  async function saveServerConnection() {
    setError('');
    setNotice('');
    try {
      const clean = serverUrl.trim().replace(/\/+$/, '');
      await updateConfig({ apiBaseUrl: clean });
      const health = await checkBackendHealth(clean);
      setNotice(`Адрес сервера обновлён (${clean}). Статус: ${health.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Некорректный адрес сервера');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="m-0 text-xl font-extrabold">Настройки ресторана и подключения</h1>
        <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
          Способы доставки, реквизиты оплаты, график работы, приём заказов и адрес сервера Backend
        </p>
      </div>

      <ErrorBanner message={error} />
      {notice && (
        <div className="rounded-xl bg-[var(--good-soft)] p-3 text-xs font-bold text-[var(--good)]">{notice}</div>
      )}

      <div className="card space-y-4 p-5">
        <h2 className="m-0 text-sm font-extrabold">Настройки → Доставка</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] p-3 text-xs font-bold">
            <input
              type="checkbox"
              checked={ownCouriersEnabled}
              onChange={e => setOwnCouriersEnabled(e.target.checked)}
            />
            Использовать своих курьеров
          </label>
          <label className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] p-3 text-xs font-bold">
            <input
              type="checkbox"
              checked={onDemandCouriersEnabled}
              onChange={e => setOnDemandCouriersEnabled(e.target.checked)}
            />
            Использовать заказных курьеров UzBite
          </label>
        </div>

        {!ownCouriersEnabled && !onDemandCouriersEnabled && (
          <div className="rounded-xl bg-[var(--bad-soft)] p-3 text-xs font-bold text-[var(--bad)]">
            Оба способа доставки отключены: ресторан не сможет принимать новые заказы на доставку.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold text-[var(--muted)]">
            Режим по умолчанию
            <select
              className="input-field mt-1"
              value={preferredMode}
              onChange={e => setPreferredMode(e.target.value as DeliveryMode)}
            >
              <option value="OWN_COURIER">Свои курьеры</option>
              <option value="ON_DEMAND_COURIER">Заказные курьеры UzBite</option>
            </select>
          </label>
          <label className="text-xs font-bold text-[var(--muted)]">
            Стоимость доставки (UZS)
            <input
              type="number"
              className="input-field mt-1"
              value={baseDeliveryFee}
              onChange={e => setBaseDeliveryFee(e.target.value)}
            />
          </label>
          <label className="text-xs font-bold text-[var(--muted)]">
            Вознаграждение курьера (UZS)
            <input
              type="number"
              className="input-field mt-1"
              value={courierRewardFee}
              onChange={e => setCourierRewardFee(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="m-0 text-sm font-extrabold">Способы оплаты</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] p-3 text-xs font-bold">
            <input type="checkbox" checked={acceptCash} onChange={e => setAcceptCash(e.target.checked)} />
            Принимать наличные
          </label>
          <label className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] p-3 text-xs font-bold">
            <input type="checkbox" checked={acceptCard} onChange={e => setAcceptCard(e.target.checked)} />
            Принимать оплату переводом
          </label>
        </div>
        {acceptCard && (
          <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <label className="text-xs font-bold text-[var(--muted)]">
              Имя получателя
              <input
                className="input-field mt-1"
                value={paymentRecipient}
                onChange={e => setPaymentRecipient(e.target.value)}
              />
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Реквизиты для перевода (номер карты/счёта, без CVV и PIN)
              <input
                className="input-field mt-1"
                value={paymentDetails}
                onChange={e => setPaymentDetails(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void uploadQr()} className="btn-secondary text-xs">
                <Icon name="upload" size={14} /> Загрузить QR-код
              </button>
              {paymentQrUrl && <span className="text-xs text-[var(--good)]">QR сохранён: {paymentQrUrl}</span>}
            </div>
            <label className="text-xs font-bold text-[var(--muted)]">
              Инструкция покупателю
              <input
                className="input-field mt-1"
                value={paymentInstructions}
                onChange={e => setPaymentInstructions(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-sm font-extrabold">График работы и приём заказов</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="input-field min-h-0 w-auto py-1.5 text-xs"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
            >
              <option value="Asia/Tashkent">Asia/Tashkent (UTC+5)</option>
              <option value="Asia/Samarkand">Asia/Samarkand (UTC+5)</option>
            </select>
            <label className="flex items-center gap-2 text-xs font-extrabold">
              <input
                type="checkbox"
                checked={acceptingOrders}
                onChange={e => setAcceptingOrders(e.target.checked)}
              />
              Принимать заказы
            </label>
          </div>
        </div>
        <div className="grid gap-2">
          {hours.map((item, idx) => (
            <div
              key={item.day}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs"
            >
              <label className="flex min-w-32 items-center gap-2 font-bold">
                <input
                  type="checkbox"
                  checked={item.isOpen}
                  onChange={e =>
                    setHours(prev => prev.map((d, i) => (i === idx ? { ...d, isOpen: e.target.checked } : d)))
                  }
                />
                {item.label}
              </label>
              {item.isOpen ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    className="input-field min-h-0 w-28 py-1 text-xs"
                    value={item.openTime}
                    onChange={e =>
                      setHours(prev => prev.map((d, i) => (i === idx ? { ...d, openTime: e.target.value } : d)))
                    }
                  />
                  <span>—</span>
                  <input
                    type="time"
                    className="input-field min-h-0 w-28 py-1 text-xs"
                    value={item.closeTime}
                    onChange={e =>
                      setHours(prev => prev.map((d, i) => (i === idx ? { ...d, closeTime: e.target.value } : d)))
                    }
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={item.overnight}
                      onChange={e =>
                        setHours(prev => prev.map((d, i) => (i === idx ? { ...d, overnight: e.target.checked } : d)))
                      }
                    />
                    После полуночи
                  </label>
                </div>
              ) : (
                <span className="text-[var(--muted)]">Выходной</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saveAllMut.isPending}
            onClick={() => saveAllMut.mutate()}
            className="btn-primary text-xs"
          >
            <Icon name="check" size={15} /> {saveAllMut.isPending ? 'Сохранение…' : 'Сохранить настройки ресторана'}
          </button>
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="m-0 text-sm font-extrabold">Подключение к серверу (LAN / Production)</h2>
        <p className="m-0 text-xs text-[var(--muted)]">
          Измените адрес общего Backend без пересборки программы (например, LAN IP{' '}
          <code>http://192.168.1.100:8081</code> или облачный домен <code>https://api.example.com</code>).
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            className="input-field min-w-64 flex-1"
            value={serverUrl}
            onChange={e => setServerUrl(e.target.value)}
          />
          <button type="button" onClick={() => void saveServerConnection()} className="btn-secondary text-xs">
            Применить и проверить
          </button>
        </div>
      </div>
    </div>
  );
}
