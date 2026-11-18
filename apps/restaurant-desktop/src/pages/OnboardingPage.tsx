import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BusinessHoursDay, DeliveryMode } from '@uzbite/shared';
import { restaurantApi } from '../api/client';
import { ErrorBanner } from '../components/Common';
import { Icon } from '../components/Icon';
import { YandexLocationPicker } from '../components/YandexLocationPicker';
import { useSession } from '../store/session';
import { formatMoney, resolveMediaUrl } from '../utils/format';

const DEFAULT_HOURS: BusinessHoursDay[] = [
  { day: 1, label: 'Понедельник', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 2, label: 'Вторник', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 3, label: 'Среда', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 4, label: 'Четверг', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 5, label: 'Пятница', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 6, label: 'Суббота', isOpen: true, openTime: '10:00', closeTime: '23:30', overnight: false },
  { day: 0, label: 'Воскресенье', isOpen: true, openTime: '10:00', closeTime: '22:30', overnight: false },
];

export function OnboardingPage() {
  const { restaurant, config, refreshProfile } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);

  const [name, setName] = useState(restaurant?.name ?? '');
  const [description, setDescription] = useState(restaurant?.description ?? '');
  const [phone, setPhone] = useState(restaurant?.phone ?? '+998901234567');
  const [logoUrl, setLogoUrl] = useState(restaurant?.logoUrl ?? '/images/uzbite/restaurant-cover.jpg');
  const [coverUrl, setCoverUrl] = useState(restaurant?.coverUrl ?? '/images/uzbite/restaurant-cover.jpg');

  const [addressText, setAddressText] = useState(restaurant?.addressText ?? '');
  const [landmark, setLandmark] = useState(restaurant?.landmark ?? '');
  const [latitude, setLatitude] = useState(restaurant?.latitude ?? 41.3111);
  const [longitude, setLongitude] = useState(restaurant?.longitude ?? 69.2797);

  const [hours, setHours] = useState<BusinessHoursDay[]>(
    restaurant?.settings?.businessHours?.length === 7 ? restaurant.settings.businessHours : DEFAULT_HOURS,
  );
  const [timezone, setTimezone] = useState(restaurant?.timezone ?? 'Asia/Tashkent');

  const [acceptCash, setAcceptCash] = useState(restaurant?.acceptCash ?? true);
  const [acceptCard, setAcceptCard] = useState(restaurant?.acceptCard ?? false);
  const [paymentRecipient, setPaymentRecipient] = useState(restaurant?.paymentRecipient ?? '');
  const [paymentDetails, setPaymentDetails] = useState(restaurant?.paymentDetails ?? '');
  const [paymentQrUrl, setPaymentQrUrl] = useState(restaurant?.paymentQrUrl ?? '');
  const [paymentInstructions, setPaymentInstructions] = useState(restaurant?.paymentInstructions ?? '');

  const [ownCouriersEnabled, setOwnCouriersEnabled] = useState(
    restaurant?.deliverySettings?.ownCouriersEnabled ?? true,
  );
  const [onDemandCouriersEnabled, setOnDemandCouriersEnabled] = useState(
    restaurant?.deliverySettings?.onDemandCouriersEnabled ?? true,
  );
  const [preferredMode, setPreferredMode] = useState<DeliveryMode>(
    restaurant?.deliverySettings?.preferredMode ?? 'OWN_COURIER',
  );
  const [deliveryFee, setDeliveryFee] = useState(String(restaurant?.deliveryFee ?? 12000));
  const [courierRewardFee, setCourierRewardFee] = useState(
    String(restaurant?.deliverySettings?.courierRewardFee ?? 10000),
  );

  async function uploadAsset(target: 'logo' | 'cover' | 'qr') {
    setError('');
    try {
      const uploaded = await restaurantApi.uploadMedia('image');
      if (!uploaded) return;
      if (target === 'logo') setLogoUrl(uploaded.url);
      if (target === 'cover') setCoverUrl(uploaded.url);
      if (target === 'qr') setPaymentQrUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки изображения');
    }
  }

  async function finish() {
    setError('');
    setSaving(true);
    try {
      await restaurantApi.completeOnboarding({
        name: name.trim(),
        description: description.trim(),
        phone: phone.trim() || null,
        logoUrl,
        coverUrl,
        addressText: addressText.trim(),
        landmark: landmark.trim(),
        latitude,
        longitude,
        businessHours: hours,
        timezone,
        acceptCash,
        acceptCard,
        paymentRecipient: paymentRecipient.trim() || null,
        paymentDetails: paymentDetails.trim() || null,
        paymentQrUrl: paymentQrUrl.trim() || null,
        paymentInstructions: paymentInstructions.trim() || null,
        ownCouriersEnabled,
        onDemandCouriersEnabled,
        preferredMode,
        deliveryFee: Number(deliveryFee) || 0,
        courierRewardFee: Number(courierRewardFee) || 0,
      });
      await refreshProfile();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  }

  const steps = ['Информация', 'Адрес и карта', 'График', 'Оплата', 'Доставка', 'Завершение'];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="m-0 text-xl font-semibold">Первоначальная настройка ресторана</h1>
            <p className="mt-1 mb-0 text-xs text-[var(--muted)]">
              Шаг {step} из 6 · {steps[step - 1]}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {steps.map((label, idx) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(idx + 1)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                  step === idx + 1
                    ? 'bg-[var(--accent)] text-white'
                    : idx + 1 < step
                      ? 'bg-[var(--good-soft)] text-[var(--good)]'
                      : 'bg-[var(--surface-2)] text-[var(--muted)]'
                }`}
              >
                {idx + 1}. {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="card p-6">
        {step === 1 && (
          <div className="grid gap-4">
            <h2 className="m-0 text-base font-semibold">Шаг 1. Основная информация</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-[var(--muted)]">
                Название ресторана *
                <input className="input-field mt-1" value={name} onChange={e => setName(e.target.value)} />
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Контактный телефон
                <input className="input-field mt-1" value={phone} onChange={e => setPhone(e.target.value)} />
              </label>
            </div>
            <label className="text-xs font-bold text-[var(--muted)]">
              Описание
              <textarea
                className="input-field mt-1 min-h-24 py-2"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Кухня, особенности заведения и фирменные блюда"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] p-3">
                <div className="text-xs font-bold">Логотип ресторана</div>
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={resolveMediaUrl(logoUrl, config.apiBaseUrl)}
                    alt="Логотип"
                    className="h-14 w-14 rounded-full border border-[var(--border)] object-cover"
                  />
                  <button type="button" className="btn-secondary text-xs" onClick={() => void uploadAsset('logo')}>
                    <Icon name="upload" size={14} /> Загрузить логотип
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] p-3">
                <div className="text-xs font-bold">Обложка / фото</div>
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={resolveMediaUrl(coverUrl, config.apiBaseUrl)}
                    alt="Обложка"
                    className="h-14 w-24 rounded-xl border border-[var(--border)] object-cover"
                  />
                  <button type="button" className="btn-secondary text-xs" onClick={() => void uploadAsset('cover')}>
                    <Icon name="upload" size={14} /> Загрузить фото
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <h2 className="m-0 text-base font-semibold">Шаг 2. Адрес и точка на Яндекс Карте</h2>
            <label className="text-xs font-bold text-[var(--muted)]">
              Текстовый адрес *
              <input
                className="input-field mt-1"
                value={addressText}
                onChange={e => setAddressText(e.target.value)}
                placeholder="Ташкент, улица Амира Темура, 12"
              />
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Ориентир для курьера
              <input
                className="input-field mt-1"
                value={landmark}
                onChange={e => setLandmark(e.target.value)}
                placeholder="Вход со стороны парковки"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div>
                <div className="text-xs font-bold">Координаты ресторана</div>
                <div className="mt-1 text-xs text-[var(--muted)] tabular-nums">
                  {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </div>
              </div>
              <button type="button" className="btn-primary text-xs" onClick={() => setMapOpen(true)}>
                <Icon name="map" size={16} /> Выбрать на карте
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-base font-semibold">Шаг 3. График работы</h2>
              <select
                className="input-field w-auto text-xs"
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
              >
                <option value="Asia/Tashkent">Asia/Tashkent (UTC+5)</option>
                <option value="Asia/Samarkand">Asia/Samarkand (UTC+5)</option>
              </select>
            </div>
            <div className="grid gap-2">
              {hours.map((item, idx) => (
                <div
                  key={item.day}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-xs"
                >
                  <label className="flex min-w-36 items-center gap-2 font-bold">
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
                    <span className="font-semibold text-[var(--muted)]">Выходной</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4">
            <h2 className="m-0 text-base font-semibold">Шаг 4. Способы оплаты</h2>
            <label className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] p-3 text-xs font-bold">
              <input type="checkbox" checked={acceptCash} onChange={e => setAcceptCash(e.target.checked)} />
              Принимать наличные при доставке
            </label>
            <label className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] p-3 text-xs font-bold">
              <input type="checkbox" checked={acceptCard} onChange={e => setAcceptCard(e.target.checked)} />
              Принимать банковский перевод по реквизитам и QR (с проверкой чека)
            </label>

            {acceptCard && (
              <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <label className="text-xs font-bold text-[var(--muted)]">
                  Имя получателя
                  <input
                    className="input-field mt-1"
                    value={paymentRecipient}
                    onChange={e => setPaymentRecipient(e.target.value)}
                    placeholder="ООО UzBite Food / Имя владельца"
                  />
                </label>
                <label className="text-xs font-bold text-[var(--muted)]">
                  Реквизиты перевода (номер карты для перевода или счёт) *
                  <input
                    className="input-field mt-1"
                    value={paymentDetails}
                    onChange={e => setPaymentDetails(e.target.value)}
                    placeholder="8600 **** **** **** · Получатель"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn-secondary text-xs" onClick={() => void uploadAsset('qr')}>
                    <Icon name="upload" size={14} /> Загрузить QR-код оплаты
                  </button>
                  {paymentQrUrl && <span className="text-xs text-[var(--good)]">QR-код загружен</span>}
                </div>
                <label className="text-xs font-bold text-[var(--muted)]">
                  Инструкция покупателю
                  <input
                    className="input-field mt-1"
                    value={paymentInstructions}
                    onChange={e => setPaymentInstructions(e.target.value)}
                    placeholder="Переведите сумму и прикрепите скриншот чека"
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-4">
            <h2 className="m-0 text-base font-semibold">Шаг 5. Способы доставки</h2>
            <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-4">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={ownCouriersEnabled}
                onChange={e => setOwnCouriersEnabled(e.target.checked)}
              />
              <div>
                <div className="text-xs font-semibold">Режим A · Собственные курьеры ресторана</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Приглашайте и выбирайте курьеров, прикреплённых к вашему ресторану.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-4">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={onDemandCouriersEnabled}
                onChange={e => setOnDemandCouriersEnabled(e.target.checked)}
              />
              <div>
                <div className="text-xs font-semibold">Режим B · Заказные курьеры UzBite</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Поиск свободных курьеров платформы по принципу вызова такси.
                </div>
              </div>
            </label>
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
                Доставка для покупателя (UZS)
                <input
                  type="number"
                  className="input-field mt-1"
                  value={deliveryFee}
                  onChange={e => setDeliveryFee(e.target.value)}
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
        )}

        {step === 6 && (
          <div className="grid gap-4">
            <h2 className="m-0 text-base font-semibold">Шаг 6. Предпросмотр профиля ресторана</h2>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <img
                src={resolveMediaUrl(coverUrl, config.apiBaseUrl)}
                alt={name}
                className="h-40 w-full object-cover"
              />
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <img
                    src={resolveMediaUrl(logoUrl, config.apiBaseUrl)}
                    alt={name}
                    className="h-14 w-14 rounded-full border-2 border-[var(--surface)] object-cover"
                  />
                  <div>
                    <div className="text-base font-semibold">{name || 'Без названия'}</div>
                    <div className="text-xs text-[var(--muted)]">{addressText || 'Адрес не указан'}</div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">{description || 'Описание не добавлено'}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1">
                    Доставка: {formatMoney(deliveryFee)}
                  </span>
                  <span className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1">
                    Свои курьеры: {ownCouriersEnabled ? 'Да' : 'Нет'}
                  </span>
                  <span className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1">
                    Заказные курьеры: {onDemandCouriersEnabled ? 'Да' : 'Нет'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-4">
          <button
            type="button"
            disabled={step === 1 || saving}
            onClick={() => setStep(s => Math.max(1, s - 1))}
            className="btn-secondary"
          >
            Назад
          </button>
          {step < 6 ? (
            <button type="button" onClick={() => setStep(s => Math.min(6, s + 1))} className="btn-primary">
              Далее
            </button>
          ) : (
            <button type="button" disabled={saving} onClick={() => void finish()} className="btn-primary">
              <Icon name="check" size={16} />
              {saving ? 'Сохраняем…' : 'Сохранить и открыть кабинет'}
            </button>
          )}
        </div>
      </div>

      {mapOpen && (
        <YandexLocationPicker
          initial={{ latitude, longitude }}
          language={config.language}
          theme={config.theme}
          onConfirm={pt => {
            setLatitude(pt.latitude);
            setLongitude(pt.longitude);
            setMapOpen(false);
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  );
}
