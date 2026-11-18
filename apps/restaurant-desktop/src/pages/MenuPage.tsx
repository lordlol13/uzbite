import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MenuImportConflictMode,
  MenuImportPreviewResponse,
  MenuImportResultDto,
  RestaurantDishDto,
} from '@uzbite/shared';
import { downloadFile, restaurantApi } from '../api/client';
import { EmptyBox, ErrorBanner, Modal, StatusPill } from '../components/Common';
import { Icon } from '../components/Icon';
import { useSession } from '../store/session';
import { formatMoney, resolveMediaUrl } from '../utils/format';

export function MenuPage() {
  const { config } = useSession();
  const queryClient = useQueryClient();
  const browserFileRef = useRef<HTMLInputElement>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');

  // Dish create/edit modal
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<RestaurantDishDto | null>(null);
  const [dName, setDName] = useState('');
  const [dSku, setDSku] = useState('');
  const [dCategoryId, setDCategoryId] = useState('');
  const [dPrice, setDPrice] = useState('');
  const [dCostPrice, setDCostPrice] = useState('');
  const [dDescription, setDDescription] = useState('');
  const [dImageUrl, setDImageUrl] = useState('');
  const [dAvailable, setDAvailable] = useState(true);

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);
  const [expFormat, setExpFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [expCategory, setExpCategory] = useState('');
  const [expAvail, setExpAvail] = useState<'all' | 'available' | 'unavailable'>('all');

  // Import wizard modal
  const [importOpen, setImportOpen] = useState(false);
  const [conflictMode, setConflictMode] = useState<MenuImportConflictMode>('UPDATE_EXISTING');
  const [createMissingCats, setCreateMissingCats] = useState(true);
  const [allowPartial, setAllowPartial] = useState(true);
  const [preview, setPreview] = useState<MenuImportPreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<MenuImportResultDto | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['restaurant-categories'],
    queryFn: restaurantApi.getCategories,
  });

  const dishesQuery = useQuery({
    queryKey: ['restaurant-dishes', selectedCategory],
    queryFn: () => restaurantApi.getDishes(selectedCategory === 'ALL' ? undefined : selectedCategory),
  });

  const refreshMenu = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['restaurant-dishes'] }),
      queryClient.invalidateQueries({ queryKey: ['restaurant-categories'] }),
    ]);
  };

  const saveDishMut = useMutation({
    mutationFn: async () => {
      const payload = {
        categoryId: dCategoryId,
        sku: dSku.trim() || null,
        name: dName.trim(),
        description: dDescription.trim(),
        price: Number(dPrice),
        costPrice: Number(dCostPrice) || 0,
        imageUrl: dImageUrl.trim() || undefined,
        isAvailable: dAvailable,
      };
      if (editingDish) {
        return restaurantApi.updateDish(editingDish.id, payload);
      }
      return restaurantApi.createDish(payload);
    },
    onSuccess: async () => {
      setDishModalOpen(false);
      await refreshMenu();
    },
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка сохранения блюда'),
  });

  const toggleAvailMut = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      restaurantApi.updateDish(id, { isAvailable: next }),
    onSuccess: refreshMenu,
  });

  const deleteDishMut = useMutation({
    mutationFn: (id: string) => restaurantApi.deleteDish(id),
    onSuccess: refreshMenu,
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка удаления блюда'),
  });

  function openNewDish() {
    const firstCat = categoriesQuery.data?.[0]?.id ?? '';
    setEditingDish(null);
    setDName('');
    setDSku('');
    setDCategoryId(selectedCategory !== 'ALL' ? selectedCategory : firstCat);
    setDPrice('');
    setDCostPrice('');
    setDDescription('');
    setDImageUrl('');
    setDAvailable(true);
    setError('');
    setDishModalOpen(true);
  }

  function openEditDish(dish: RestaurantDishDto) {
    setEditingDish(dish);
    setDName(dish.name);
    setDSku(dish.sku ?? '');
    setDCategoryId(dish.categoryId);
    setDPrice(String(dish.price));
    setDCostPrice(String(dish.costPrice));
    setDDescription(dish.description);
    setDImageUrl(dish.imageUrl);
    setDAvailable(dish.isAvailable);
    setError('');
    setDishModalOpen(true);
  }

  async function uploadDishPhoto() {
    try {
      const uploaded = await restaurantApi.uploadMedia('image');
      if (uploaded) setDImageUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    }
  }

  async function downloadTemplate(format: 'xlsx' | 'csv') {
    setError('');
    try {
      const res = await downloadFile(
        `/restaurant-account/imports/template?format=${format}`,
        `uzbite-menu-template.${format}`,
      );
      if (res.saved) setStatusNote(`Шаблон меню (.${format}) сохранён.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка скачивания шаблона');
    }
  }

  async function handleExportMenu() {
    setError('');
    try {
      const qs = new URLSearchParams({
        format: expFormat,
        availability: expAvail,
      });
      if (expCategory) qs.set('categoryId', expCategory);
      const res = await downloadFile(
        `/restaurant-account/exports/menu?${qs.toString()}`,
        `uzbite-menu-${new Date().toISOString().slice(0, 10)}.${expFormat}`,
      );
      if (res.saved) {
        setStatusNote(res.filePath ? `Экспорт сохранён: ${res.filePath}` : 'Меню экспортировано.');
        setExportOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка экспорта меню');
    }
  }

  async function startImportFileSelect(browserFile?: File) {
    setError('');
    setImportResult(null);
    setImportLoading(true);
    try {
      const result = await restaurantApi.previewMenuImport(conflictMode, browserFile);
      if (result) {
        setPreview(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка чтения Excel/CSV');
    } finally {
      setImportLoading(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setError('');
    setImportLoading(true);
    try {
      const res = await restaurantApi.confirmMenuImport(preview.jobId, createMissingCats, allowPartial);
      setImportResult(res);
      setPreview(null);
      await refreshMenu();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка подтверждения импорта');
    } finally {
      setImportLoading(false);
    }
  }

  async function cancelImport() {
    if (preview) {
      await restaurantApi.cancelMenuImport(preview.jobId).catch(() => {});
    }
    setPreview(null);
    setImportResult(null);
    setImportOpen(false);
  }

  const categories = categoriesQuery.data ?? [];
  const dishes = dishesQuery.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-extrabold">Меню ресторана</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
            Редактор блюд, цен, доступности и массовый импорт/экспорт Excel и CSV
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void downloadTemplate('xlsx')} className="btn-secondary text-xs">
            <Icon name="excel" size={15} /> Скачать шаблон (.xlsx)
          </button>
          <button type="button" onClick={() => void downloadTemplate('csv')} className="btn-secondary text-xs">
            <Icon name="csv" size={15} /> Шаблон (.csv)
          </button>
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setImportResult(null);
              setError('');
              setImportOpen(true);
            }}
            className="btn-secondary text-xs"
          >
            <Icon name="importFile" size={15} /> Импорт из Excel/CSV
          </button>
          <button type="button" onClick={() => setExportOpen(true)} className="btn-secondary text-xs">
            <Icon name="exportFile" size={15} /> Экспорт меню
          </button>
          <button type="button" onClick={openNewDish} className="btn-primary text-xs">
            <Icon name="plus" size={15} /> Добавить блюдо
          </button>
        </div>
      </div>

      {statusNote && (
        <div className="rounded-xl bg-[var(--good-soft)] px-4 py-2.5 text-xs font-bold text-[var(--good)]">
          {statusNote}
        </div>
      )}
      <ErrorBanner message={error} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedCategory('ALL')}
          className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${
            selectedCategory === 'ALL'
              ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
              : 'border-[var(--border)] bg-[var(--surface)]'
          }`}
        >
          Все
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${
              selectedCategory === cat.id
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--border)] bg-[var(--surface)]'
            }`}
          >
            {cat.name} ({cat.dishCount})
          </button>
        ))}
      </div>

      {dishesQuery.isLoading ? (
        <div className="card p-8 text-center text-xs text-[var(--muted)]">Загрузка меню…</div>
      ) : dishes.length === 0 ? (
        <EmptyBox
          icon="dish"
          title="В этой категории пока нет блюд"
          subtitle="Добавьте блюдо вручную или загрузите меню из Excel/CSV файла."
          action={
            <button type="button" onClick={openNewDish} className="btn-primary text-xs">
              <Icon name="plus" size={15} /> Добавить первое блюдо
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dishes.map(dish => (
            <div key={dish.id} className="card flex flex-col justify-between overflow-hidden">
              <div>
                <div className="relative h-40 w-full bg-[var(--surface-2)]">
                  <img
                    src={resolveMediaUrl(dish.imageUrl, config.apiBaseUrl)}
                    alt={dish.name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute top-2.5 right-2.5">
                    <StatusPill
                      label={dish.isAvailable ? 'В наличии' : 'Нет в наличии'}
                      tone={dish.isAvailable ? 'good' : 'bad'}
                    />
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="m-0 text-sm font-extrabold">{dish.name}</h3>
                    <span className="shrink-0 text-sm font-extrabold text-[var(--accent)] tabular-nums">
                      {formatMoney(dish.price, config.language)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-[var(--muted)]">
                    {dish.categoryName} {dish.sku ? `· Артикул: ${dish.sku}` : ''}
                  </div>
                  <p className="mt-2 mb-0 line-clamp-2 text-xs text-[var(--muted)]">
                    {dish.description || 'Описание не указано'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleAvailMut.mutate({ id: dish.id, next: !dish.isAvailable })}
                  className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
                >
                  {dish.isAvailable ? 'Нет в наличии' : 'Вернуть в продажу'}
                </button>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditDish(dish)}
                    className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
                    title="Редактировать"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDishMut.mutate(dish.id)}
                    className="btn-danger min-h-0 px-2.5 py-1 text-[11px]"
                    title="Удалить или архивировать"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dishModalOpen && (
        <Modal
          title={editingDish ? `Редактировать: ${editingDish.name}` : 'Новое блюдо'}
          onClose={() => setDishModalOpen(false)}
        >
          <div className="grid gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-[var(--muted)]">
                Название *
                <input className="input-field mt-1" value={dName} onChange={e => setDName(e.target.value)} />
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Артикул (SKU)
                <input
                  className="input-field mt-1"
                  value={dSku}
                  onChange={e => setDSku(e.target.value)}
                  placeholder="OSH-001"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-[var(--muted)]">
                Категория *
                <select
                  className="input-field mt-1"
                  value={dCategoryId}
                  onChange={e => setDCategoryId(e.target.value)}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Цена (UZS) *
                <input
                  type="number"
                  min="0"
                  step="100"
                  className="input-field mt-1"
                  value={dPrice}
                  onChange={e => setDPrice(e.target.value)}
                />
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Себестоимость (UZS)
                <input
                  type="number"
                  min="0"
                  step="100"
                  className="input-field mt-1"
                  value={dCostPrice}
                  onChange={e => setDCostPrice(e.target.value)}
                />
              </label>
            </div>

            <label className="text-xs font-bold text-[var(--muted)]">
              Описание
              <textarea
                className="input-field mt-1 min-h-20 py-2"
                value={dDescription}
                onChange={e => setDDescription(e.target.value)}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void uploadDishPhoto()} className="btn-secondary text-xs">
                <Icon name="upload" size={14} /> Загрузить фото блюда
              </button>
              {dImageUrl && <span className="truncate text-xs text-[var(--good)]">Фото выбрано</span>}
            </div>

            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={dAvailable} onChange={e => setDAvailable(e.target.checked)} />
              Доступно для заказа
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setDishModalOpen(false)}>
                Отмена
              </button>
              <button
                type="button"
                disabled={!dName.trim() || !dCategoryId || dPrice === '' || saveDishMut.isPending}
                onClick={() => saveDishMut.mutate()}
                className="btn-primary"
              >
                {saveDishMut.isPending ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {exportOpen && (
        <Modal title="Экспорт меню в Excel / CSV" onClose={() => setExportOpen(false)}>
          <div className="grid gap-3">
            <label className="text-xs font-bold text-[var(--muted)]">
              Формат
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
              Фильтр по категории
              <select
                className="input-field mt-1"
                value={expCategory}
                onChange={e => setExpCategory(e.target.value)}
              >
                <option value="">Все блюда</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Доступность
              <select
                className="input-field mt-1"
                value={expAvail}
                onChange={e => setExpAvail(e.target.value as 'all' | 'available' | 'unavailable')}
              >
                <option value="all">Все</option>
                <option value="available">Только доступные</option>
                <option value="unavailable">Только недоступные</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setExportOpen(false)}>
                Отмена
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleExportMenu()}>
                <Icon name="exportFile" size={16} /> Экспортировать
              </button>
            </div>
          </div>
        </Modal>
      )}

      {importOpen && (
        <Modal title="Импорт меню из Excel / CSV" onClose={() => void cancelImport()} wide>
          {!preview && !importResult && (
            <div className="space-y-4">
              <p className="m-0 text-xs text-[var(--muted)]">
                Выберите файл <code>.xlsx</code> или <code>.csv</code>. Перед сохранением в базу данных вы увидите
                полный предпросмотр новых блюд, изменений цен и возможных ошибок.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-[var(--muted)]">
                  При совпадении артикула/названия
                  <select
                    className="input-field mt-1"
                    value={conflictMode}
                    onChange={e => setConflictMode(e.target.value as MenuImportConflictMode)}
                  >
                    <option value="UPDATE_EXISTING">Обновить существующие (массовое изменение цен)</option>
                    <option value="ADD_NEW">Только добавлять новые (конфликт при совпадении)</option>
                    <option value="SKIP_EXISTING">Пропускать существующие</option>
                  </select>
                </label>

                <div className="flex flex-col justify-end gap-2 text-xs">
                  <label className="flex items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={createMissingCats}
                      onChange={e => setCreateMissingCats(e.target.checked)}
                    />
                    Создавать отсутствующие категории автоматически
                  </label>
                  <label className="flex items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={allowPartial}
                      onChange={e => setAllowPartial(e.target.checked)}
                    />
                    Разрешить частичный импорт валидных строк
                  </label>
                </div>
              </div>

              <input
                ref={browserFileRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void startImportFileSelect(f);
                  e.target.value = '';
                }}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={importLoading}
                  onClick={() => {
                    if (window.uzbiteRestaurant?.dialog) {
                      void startImportFileSelect();
                    } else {
                      browserFileRef.current?.click();
                    }
                  }}
                  className="btn-primary text-xs"
                >
                  <Icon name="importFile" size={16} />
                  {importLoading ? 'Проверка файла…' : 'Выбрать файл .xlsx / .csv'}
                </button>
                <button type="button" onClick={() => void downloadTemplate('xlsx')} className="btn-secondary text-xs">
                  Скачать шаблон .xlsx
                </button>
              </div>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
                <div>
                  <strong>{preview.fileName}</strong> · Всего строк: {preview.totalRows} · Схема {preview.schemaVersion}
                </div>
                <div className="flex flex-wrap gap-2 font-bold">
                  <StatusPill label={`Добавить: ${preview.summary.addCount}`} tone="good" />
                  <StatusPill label={`Обновить: ${preview.summary.updateCount}`} tone="accent" />
                  <StatusPill label={`Пропустить: ${preview.summary.skipCount}`} tone="neutral" />
                  <StatusPill
                    label={`Ошибки/конфликты: ${preview.summary.errorCount + preview.summary.conflictCount}`}
                    tone={preview.summary.errorCount + preview.summary.conflictCount > 0 ? 'bad' : 'neutral'}
                  />
                </div>
              </div>

              {preview.summary.newCategories.length > 0 && (
                <div className="rounded-xl bg-[var(--warn-soft)] p-3 text-xs font-semibold text-[var(--warn)]">
                  Новые категории в файле: {preview.summary.newCategories.join(', ')}.{' '}
                  {createMissingCats ? 'Будут созданы при подтверждении.' : 'Автосоздание отключено.'}
                </div>
              )}

              <div className="max-h-80 overflow-auto rounded-xl border border-[var(--border)]">
                <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--surface-2)] text-[11px] font-bold text-[var(--muted)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-3 py-2">Строка</th>
                      <th className="px-3 py-2">Блюдо</th>
                      <th className="px-3 py-2">Старая цена</th>
                      <th className="px-3 py-2">Новая цена</th>
                      <th className="px-3 py-2">Категория</th>
                      <th className="px-3 py-2">Действие</th>
                      <th className="px-3 py-2">Проверка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map(row => (
                      <tr key={row.rowNumber} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2 tabular-nums">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-semibold">
                          {row.name || '—'}
                          {row.sku && <div className="text-[10px] text-[var(--muted)]">{row.sku}</div>}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                          {row.oldPrice !== null ? formatMoney(row.oldPrice, config.language) : '—'}
                        </td>
                        <td className="px-3 py-2 font-bold tabular-nums">
                          {row.price !== null ? formatMoney(row.price, config.language) : '—'}
                        </td>
                        <td className="px-3 py-2">{row.category || '—'}</td>
                        <td className="px-3 py-2">
                          <StatusPill
                            label={
                              row.status === 'READY_ADD'
                                ? 'Готово к добавлению'
                                : row.status === 'READY_UPDATE'
                                  ? 'Готово к обновлению'
                                  : row.status === 'SKIPPED'
                                    ? 'Пропущено'
                                    : row.status === 'CONFLICT'
                                      ? 'Конфликт'
                                      : 'Ошибка'
                            }
                            tone={
                              row.status === 'READY_ADD'
                                ? 'good'
                                : row.status === 'READY_UPDATE'
                                  ? 'accent'
                                  : row.status === 'SKIPPED'
                                    ? 'neutral'
                                    : 'bad'
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[var(--bad)]">
                          {row.errors.length > 0 ? row.errors.join('; ') : 'OK'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap justify-between gap-2">
                <button type="button" onClick={() => void cancelImport()} className="btn-secondary">
                  Отменить импорт
                </button>
                <div className="flex gap-2">
                  {preview.summary.errorCount + preview.summary.conflictCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        void downloadFile(
                          `/restaurant-account/imports/${preview.jobId}/errors-export?format=xlsx`,
                          `import-errors-${preview.jobId.slice(-6)}.xlsx`,
                        )
                      }
                      className="btn-secondary text-xs"
                    >
                      Скачать отчёт об ошибках
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      importLoading ||
                      (preview.summary.addCount === 0 && preview.summary.updateCount === 0) ||
                      (!allowPartial && preview.summary.errorCount + preview.summary.conflictCount > 0)
                    }
                    onClick={() => void confirmImport()}
                    className="btn-primary"
                  >
                    <Icon name="check" size={16} />
                    {importLoading ? 'Применение…' : 'Подтвердить и сохранить'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {importResult && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[var(--good-soft)] p-4 text-xs font-bold text-[var(--good)]">
                Импорт завершён! Обработано: {importResult.totalRows} · Добавлено: {importResult.addedCount} ·
                Обновлено: {importResult.updatedCount} · Пропущено: {importResult.skippedCount} · Ошибок:{' '}
                {importResult.errorCount}
              </div>
              {importResult.errors.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    void downloadFile(
                      `/restaurant-account/imports/${importResult.jobId}/errors-export?format=xlsx`,
                      `import-errors-${importResult.jobId.slice(-6)}.xlsx`,
                    )
                  }
                  className="btn-secondary text-xs"
                >
                  <Icon name="exportFile" size={15} /> Скачать отчёт об ошибках (.xlsx)
                </button>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setImportResult(null);
                    setImportOpen(false);
                  }}
                  className="btn-primary"
                >
                  Готово
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
