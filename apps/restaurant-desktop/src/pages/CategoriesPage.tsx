import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { restaurantApi } from '../api/client';
import { ErrorBanner, StatusPill } from '../components/Common';
import { Icon } from '../components/Icon';

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');

  const categoriesQuery = useQuery({
    queryKey: ['restaurant-categories'],
    queryFn: restaurantApi.getCategories,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['restaurant-categories'] });

  const createMut = useMutation({
    mutationFn: () => restaurantApi.createCategory(newName.trim()),
    onSuccess: async () => {
      setNewName('');
      setError('');
      await refresh();
    },
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка добавления'),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      restaurantApi.updateCategory(id, { name: name.trim() }),
    onSuccess: async () => {
      setEditingId(null);
      setError('');
      await refresh();
    },
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка переименования'),
  });

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => restaurantApi.reorderCategories(ids),
    onSuccess: refresh,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => restaurantApi.deleteCategory(id),
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: err => setError(err instanceof Error ? err.message : 'Нельзя удалить категорию'),
  });

  const categories = categoriesQuery.data ?? [];

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const ids = categories.map(c => c.id);
    const tmp = ids[index]!;
    ids[index] = ids[target]!;
    ids[target] = tmp;
    reorderMut.mutate(ids);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="m-0 text-xl font-semibold">Категории меню</h1>
        <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
          Системный фильтр «Все» всегда присутствует в приложении покупателя и не может быть удалён.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="card flex flex-wrap gap-2 p-4">
        <input
          className="input-field min-w-48 flex-1"
          placeholder="Название новой категории (например, Десерты)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button
          type="button"
          disabled={!newName.trim() || createMut.isPending}
          onClick={() => createMut.mutate()}
          className="btn-primary text-xs"
        >
          <Icon name="plus" size={15} /> Добавить категорию
        </button>
      </div>

      <div className="card divide-y divide-[var(--border)]">
        <div className="flex items-center justify-between bg-[var(--surface-2)] px-4 py-3 text-xs">
          <span className="font-semibold">Все (общий фильтр)</span>
          <StatusPill label="Системная · нельзя удалить" tone="accent" />
        </div>

        {categories.map((cat, idx) => (
          <div key={cat.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
            {editingId === cat.id ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  className="input-field min-h-0 flex-1 py-1.5"
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => renameMut.mutate({ id: cat.id, name: editingName })}
                  className="btn-primary min-h-0 px-3 py-1.5 text-xs"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="btn-secondary min-h-0 px-3 py-1.5 text-xs"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <>
                <div>
                  <span className="font-bold">{cat.name}</span>
                  <span className="ml-2 text-[var(--muted)]">({cat.dishCount} блюд)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => move(idx, -1)}
                    className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
                  >
                    Вверх
                  </button>
                  <button
                    type="button"
                    disabled={idx === categories.length - 1}
                    onClick={() => move(idx, 1)}
                    className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
                  >
                    Вниз
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditingName(cat.name);
                    }}
                    className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={cat.dishCount > 0}
                    title={cat.dishCount > 0 ? 'Сначала перенесите блюда' : 'Удалить'}
                    onClick={() => deleteMut.mutate(cat.id)}
                    className="btn-danger min-h-0 px-2.5 py-1 text-[11px]"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
