import { useEffect, useRef, useState } from 'react';
import type { Language, Theme } from '@uzbite/shared';
import { Icon } from './Icon';
import { Modal } from './Common';

type Coordinates = [number, number];
export type LocationPoint = { latitude: number; longitude: number };

type MapChild = { update: (props: Record<string, unknown>) => void };
type MapInstance = {
  addChild: (child: MapChild) => MapInstance;
  update: (props: Record<string, unknown>) => void;
  destroy: () => void;
};
type MapsApi = {
  ready: Promise<void>;
  YMap: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  YMapDefaultSchemeLayer: new (options?: Record<string, unknown>) => MapChild;
  YMapDefaultFeaturesLayer: new (options?: Record<string, unknown>) => MapChild;
  YMapMarker: new (
    options: { coordinates: Coordinates; draggable: boolean; onDragEnd: (coordinates: Coordinates) => void },
    element: HTMLElement,
  ) => MapChild;
  YMapListener: new (options: {
    layer: string;
    onClick: (object: unknown, event: { coordinates: Coordinates }) => void;
  }) => MapChild;
};

let apiPromise: Promise<MapsApi> | undefined;

function loadYandex(language: Language): Promise<MapsApi> {
  if (apiPromise) return apiPromise;
  const existing = (window as unknown as { ymaps3?: MapsApi }).ymaps3;
  if (existing) {
    return existing.ready.then(() => existing);
  }
  const key = import.meta.env.VITE_YANDEX_MAPS_API_KEY as string | undefined;
  if (!key) return Promise.reject(new Error('MAP_KEY_MISSING'));

  apiPromise = new Promise<MapsApi>((resolve, reject) => {
    const globals = window as unknown as { ymaps3?: MapsApi };
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=${language === 'en' ? 'en_US' : 'ru_RU'}`;
    script.async = true;
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error('MAP_TIMEOUT'));
    }, 20000);
    script.onload = () => {
      const maps = globals.ymaps3;
      if (!maps) {
        window.clearTimeout(timeout);
        reject(new Error('MAP_UNAVAILABLE'));
        return;
      }
      maps.ready
        .then(() => {
          window.clearTimeout(timeout);
          resolve(maps);
        })
        .catch(() => {
          window.clearTimeout(timeout);
          reject(new Error('MAP_UNAVAILABLE'));
        });
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('MAP_UNAVAILABLE'));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    apiPromise = undefined;
    throw error;
  });

  return apiPromise;
}

export function YandexLocationPicker({
  initial,
  language,
  theme,
  onConfirm,
  onClose,
}: {
  initial?: LocationPoint;
  language: Language;
  theme: Theme;
  onConfirm: (point: LocationPoint) => void;
  onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const selectedRef = useRef<LocationPoint>(initial ?? { latitude: 41.3111, longitude: 69.2797 });
  const [selected, setSelected] = useState<LocationPoint>(selectedRef.current);
  const [manualLat, setManualLat] = useState(String(selectedRef.current.latitude));
  const [manualLng, setManualLng] = useState(String(selectedRef.current.longitude));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<'key' | 'load' | ''>('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    setLoaded(false);
    setError('');

    loadYandex(language)
      .then(maps => {
        if (disposed || !container.current) return;
        const point = selectedRef.current;
        const center: Coordinates = [point.longitude, point.latitude];
        const map = new maps.YMap(container.current, {
          location: { center, zoom: 14 },
          theme: theme === 'dark' ? 'dark' : 'light',
        });
        mapRef.current = map;
        map.addChild(new maps.YMapDefaultSchemeLayer()).addChild(new maps.YMapDefaultFeaturesLayer());

        const markerElement = document.createElement('div');
        markerElement.setAttribute('aria-label', 'UzBite Restaurant');
        markerElement.style.cssText =
          'width:30px;height:30px;border:5px solid white;border-radius:50% 50% 50% 0;background:#ec5180;box-shadow:0 5px 18px #0005;transform:translate(-50%,-100%) rotate(-45deg);cursor:grab';

        let marker: MapChild | null = null;
        const choose = (coordinates: Coordinates) => {
          const [longitude, latitude] = coordinates;
          if (
            disposed ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180
          ) {
            return;
          }
          selectedRef.current = { latitude, longitude };
          setSelected(selectedRef.current);
          setManualLat(latitude.toFixed(6));
          setManualLng(longitude.toFixed(6));
          if (marker) {
            marker.update({ coordinates });
          } else {
            marker = new maps.YMapMarker({ coordinates, draggable: true, onDragEnd: choose }, markerElement);
            map.addChild(marker);
          }
        };

        map.addChild(
          new maps.YMapListener({
            layer: 'any',
            onClick: (_obj, event) => choose(event.coordinates),
          }),
        );
        choose(center);
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(reason instanceof Error && reason.message === 'MAP_KEY_MISSING' ? 'key' : 'load');
        }
      });

    return () => {
      disposed = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [attempt, language, theme]);

  function applyManualCoordinates() {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      selectedRef.current = { latitude: lat, longitude: lng };
      setSelected(selectedRef.current);
      onConfirm(selectedRef.current);
    }
  }

  return (
    <Modal title="Выбор местоположения на Яндекс Картах" onClose={onClose} wide>
      <p className="mt-0 mb-3 text-xs text-[var(--muted)]">
        Нажмите на карту или перетащите маркер, чтобы точно указать точку вашего ресторана.
      </p>

      <div className="relative h-[380px] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
        <div ref={container} className="h-full w-full" />
        {!loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-2)] text-xs font-semibold text-[var(--muted)]">
            Загрузка Yandex Maps API 3.0…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--surface-2)] p-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Icon name="map" size={22} />
            </div>
            <div className="max-w-md text-xs text-[var(--muted)]">
              {error === 'key'
                ? 'Ключ VITE_YANDEX_MAPS_API_KEY не задан для сборки. Укажите его в конфигурации или введите координаты вручную ниже.'
                : `Карта недоступна. Проверьте интернет и разрешённый HTTP Referer для origin ${window.location.origin} в кабинете разработчика Яндекс.`}
            </div>
            <button type="button" className="btn-secondary text-xs" onClick={() => setAttempt(v => v + 1)}>
              <Icon name="refresh" size={14} /> Повторить загрузку карты
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[var(--muted)]">
          Широта (Latitude)
          <input
            type="number"
            step="0.000001"
            className="input-field mt-1 tabular-nums"
            value={manualLat}
            onChange={e => {
              setManualLat(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n) && Math.abs(n) <= 90) {
                selectedRef.current = { ...selectedRef.current, latitude: n };
                setSelected(selectedRef.current);
              }
            }}
          />
        </label>
        <label className="text-xs font-semibold text-[var(--muted)]">
          Долгота (Longitude)
          <input
            type="number"
            step="0.000001"
            className="input-field mt-1 tabular-nums"
            value={manualLng}
            onChange={e => {
              setManualLng(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n) && Math.abs(n) <= 180) {
                selectedRef.current = { ...selectedRef.current, longitude: n };
                setSelected(selectedRef.current);
              }
            }}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold text-[var(--muted)] tabular-nums">
          Текущая точка: {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn-primary" onClick={applyManualCoordinates}>
            <Icon name="check" size={16} /> Подтвердить точку
          </button>
        </div>
      </div>
    </Modal>
  );
}
