import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { restaurantApi } from '../api/client';
import { ErrorBanner, StatusPill } from '../components/Common';
import { Icon } from '../components/Icon';
import { YandexLocationPicker } from '../components/YandexLocationPicker';
import { useSession } from '../store/session';
import { formatMoney, resolveMediaUrl } from '../utils/format';

export function ProfilePage() {
  const { restaurant, config, refreshProfile } = useSession();
  const [name, setName] = useState(restaurant?.name ?? '');
  const [description, setDescription] = useState(restaurant?.description ?? '');
  const [phone, setPhone] = useState(restaurant?.phone ?? '');
  const [telegram, setTelegram] = useState(restaurant?.telegram ?? '');
  const [logoUrl, setLogoUrl] = useState(restaurant?.logoUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(restaurant?.coverUrl ?? '');
  const [addressText, setAddressText] = useState(restaurant?.addressText ?? '');
  const [landmark, setLandmark] = useState(restaurant?.landmark ?? '');
  const [latitude, setLatitude] = useState(restaurant?.latitude ?? 41.3111);
  const [longitude, setLongitude] = useState(restaurant?.longitude ?? 69.2797);
  const [prepMinutes, setPrepMinutes] = useState(String(restaurant?.preparationMinutes ?? 20));
  const [deliveryFee, setDeliveryFee] = useState(String(restaurant?.deliveryFee ?? 10000));
  const [isOpen, setIsOpen] = useState(restaurant?.isOpen ?? true);

  const [mapOpen, setMapOpen] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const [error, setError] = useState('');

  const saveMut = useMutation({
    mutationFn: async () => {
      await restaurantApi.updateProfile({
        name: name.trim(),
        description: description.trim(),
        phone: phone.trim() || null,
        telegram: telegram.trim() || null,
        logoUrl,
        coverUrl,
        isOpen,
        preparationMinutes: Number(prepMinutes) || 20,
        deliveryFee: Number(deliveryFee) || 0,
      });
      await restaurantApi.updateLocation({
        addressText: addressText.trim(),
        landmark: landmark.trim(),
        latitude,
        longitude,
      });
      await refreshProfile();
    },
    onSuccess: () => {
      setError('');
      setSavedNotice('Профиль ресторана обновлён в общей базе UzBite.');
    },
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка сохранения профиля'),
  });

  async function uploadAsset(target: 'logo' | 'cover') {
    try {
      const res = await restaurantApi.uploadMedia('image');
      if (!res) return;
      if (target === 'logo') setLogoUrl(res.url);
      else setCoverUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файл');
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <div>
          <h1 className="m-0 text-xl font-extrabold">Профиль ресторана</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
            Изменения отображаются в мобильном приложении покупателей UzBite.
          </p>
        </div>

        <ErrorBanner message={error} />
        {savedNotice && (
          <div className="rounded-xl bg-[var(--good-soft)] p-3 text-xs font-bold text-[var(--good)]">
            {savedNotice}
          </div>
        )}

        <div className="card grid gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-[var(--muted)]">
              Название
              <input className="input-field mt-1" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Телефон
              <input className="input-field mt-1" value={phone} onChange={e => setPhone(e.target.value)} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-bold text-[var(--muted)]">
              Telegram
              <input className="input-field mt-1" value={telegram} onChange={e => setTelegram(e.target.value)} />
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Время готовки (мин)
              <input
                type="number"
                className="input-field mt-1"
                value={prepMinutes}
                onChange={e => setPrepMinutes(e.target.value)}
              />
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Доставка (UZS)
              <input
                type="number"
                className="input-field mt-1"
                value={deliveryFee}
                onChange={e => setDeliveryFee(e.target.value)}
              />
            </label>
          </div>
          <label className="text-xs font-bold text-[var(--muted)]">
            Описание
            <textarea
              className="input-field mt-1 min-h-24 py-2"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-[var(--muted)]">
              Адрес
              <input className="input-field mt-1" value={addressText} onChange={e => setAddressText(e.target.value)} />
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Ориентир
              <input className="input-field mt-1" value={landmark} onChange={e => setLandmark(e.target.value)} />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
            <span className="tabular-nums">
              Координаты: {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </span>
            <button type="button" onClick={() => setMapOpen(true)} className="btn-secondary min-h-0 px-3 py-1.5 text-xs">
              <Icon name="map" size={14} /> Выбрать на Яндекс Карте
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void uploadAsset('logo')} className="btn-secondary text-xs">
              <Icon name="upload" size={14} /> Обновить логотип
            </button>
            <button type="button" onClick={() => void uploadAsset('cover')} className="btn-secondary text-xs">
              <Icon name="upload" size={14} /> Обновить обложку
            </button>
            <label className="ml-auto flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={isOpen} onChange={e => setIsOpen(e.target.checked)} />
              Ресторан открыт
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className="btn-primary text-xs"
            >
              <Icon name="check" size={15} /> {saveMut.isPending ? 'Сохранение…' : 'Сохранить профиль'}
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
          Публичный предпросмотр
        </div>
        <div className="card overflow-hidden">
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
                <h2 className="m-0 text-base font-extrabold">{name}</h2>
                <StatusPill label={isOpen ? 'Открыт' : 'Закрыт'} tone={isOpen ? 'good' : 'bad'} />
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">{description || 'Без описания'}</p>
            <div className="mt-3 space-y-1 text-xs">
              <div>{addressText}</div>
              <div className="text-[var(--muted)]">
                Доставка: {formatMoney(deliveryFee, config.language)} · ~{prepMinutes} мин
              </div>
              <div className="text-[var(--muted)]">
                Подписчики: {restaurant?.followerCount ?? 0} · Отзывы: {restaurant?.reviewCount ?? 0}
              </div>
            </div>
          </div>
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
