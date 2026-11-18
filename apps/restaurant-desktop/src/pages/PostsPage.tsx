import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VIDEO_ASPECT_RATIOS, type PostStatus, type VideoAspectRatio } from '@uzbite/shared';
import { restaurantApi } from '../api/client';
import { EmptyBox, ErrorBanner, Modal, StatusPill } from '../components/Common';
import { Icon } from '../components/Icon';
import { useSession } from '../store/session';
import { formatDateTime, resolveMediaUrl } from '../utils/format';

export function PostsPage() {
  const { config } = useSession();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [dishId, setDishId] = useState('');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('9:16');
  const [status, setStatus] = useState<PostStatus>('PUBLISHED');
  const [mediaType, setMediaType] = useState<'VIDEO' | 'IMAGE'>('VIDEO');
  const [mediaUrl, setMediaUrl] = useState('');
  const [posterUrl, setPosterUrl] = useState('');

  const postsQuery = useQuery({
    queryKey: ['restaurant-posts'],
    queryFn: restaurantApi.getPosts,
  });

  const dishesQuery = useQuery({
    queryKey: ['restaurant-dishes', 'ALL'],
    queryFn: () => restaurantApi.getDishes(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['restaurant-posts'] });

  const createMut = useMutation({
    mutationFn: () =>
      restaurantApi.createPost({
        title: title.trim(),
        caption: caption.trim(),
        categoryName: categoryName.trim() || null,
        dishId: dishId || null,
        status,
        aspectRatio,
        mediaType,
        mediaUrl,
        posterUrl: posterUrl || null,
      }),
    onSuccess: async () => {
      setModalOpen(false);
      setTitle('');
      setCaption('');
      setMediaUrl('');
      setPosterUrl('');
      await refresh();
    },
    onError: err => setError(err instanceof Error ? err.message : 'Ошибка создания публикации'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, next }: { id: string; next: PostStatus }) =>
      restaurantApi.updatePost(id, { status: next }),
    onSuccess: refresh,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => restaurantApi.deletePost(id),
    onSuccess: refresh,
  });

  async function uploadAsset(kind: 'video' | 'image') {
    setError('');
    try {
      const res = await restaurantApi.uploadMedia(kind);
      if (!res) return;
      if (kind === 'video') {
        setMediaType('VIDEO');
        setMediaUrl(res.url);
      } else if (!mediaUrl) {
        setMediaType('IMAGE');
        setMediaUrl(res.url);
      } else {
        setPosterUrl(res.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки файла');
    }
  }

  const posts = postsQuery.data ?? [];
  const dishes = dishesQuery.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold">Видеопубликации ресторана</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
            Опубликованные ролики попадают в общую ленту покупателей UzBite со ссылкой на реальное блюдо меню.
          </p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className="btn-primary text-xs">
          <Icon name="plus" size={15} /> Новая публикация
        </button>
      </div>

      <ErrorBanner message={error} />

      {posts.length === 0 ? (
        <EmptyBox
          icon="video"
          title="Публикаций пока нет"
          subtitle="Загрузите короткое видео приготовления блюда (9:16, 16:9 или 4:3) и привяжите его к позиции меню."
          action={
            <button type="button" onClick={() => setModalOpen(true)} className="btn-primary text-xs">
              Создать первую публикацию
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {posts.map(post => {
            const media = post.media[0];
            return (
              <div key={post.id} className="card flex flex-col justify-between overflow-hidden">
                <div>
                  <div className="relative h-52 w-full bg-black/90">
                    {media?.type === 'VIDEO' ? (
                      <video
                        src={resolveMediaUrl(media.url, config.apiBaseUrl)}
                        poster={resolveMediaUrl(media.posterUrl, config.apiBaseUrl)}
                        controls
                        className="h-full w-full object-contain"
                      />
                    ) : media ? (
                      <img
                        src={resolveMediaUrl(media.url, config.apiBaseUrl)}
                        alt={post.title || post.caption}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    <div className="absolute top-2.5 right-2.5 flex gap-1.5">
                      <StatusPill label={post.aspectRatio} tone="neutral" />
                      <StatusPill
                        label={
                          post.status === 'PUBLISHED'
                            ? 'Опубликовано'
                            : post.status === 'DRAFT'
                              ? 'Черновик'
                              : 'Скрыто'
                        }
                        tone={post.status === 'PUBLISHED' ? 'good' : post.status === 'DRAFT' ? 'warn' : 'neutral'}
                      />
                    </div>
                  </div>
                  <div className="p-4 text-xs">
                    {post.title && <div className="font-semibold">{post.title}</div>}
                    <p className="mt-1 mb-0 line-clamp-2 text-[var(--muted)]">{post.caption}</p>
                    {post.dish && (
                      <div className="mt-2 font-bold text-[var(--accent)]">Блюдо: {post.dish.name}</div>
                    )}
                    <div className="mt-2 text-[11px] text-[var(--muted)]">
                      Лайки: {post.likeCount} · Комментарии: {post.commentCount} ·{' '}
                      {formatDateTime(post.createdAt, config.language)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3">
                  <div className="flex gap-1.5">
                    {post.status !== 'PUBLISHED' && (
                      <button
                        type="button"
                        onClick={() => statusMut.mutate({ id: post.id, next: 'PUBLISHED' })}
                        className="btn-primary min-h-0 px-2.5 py-1 text-[11px]"
                      >
                        Опубликовать
                      </button>
                    )}
                    {post.status === 'PUBLISHED' && (
                      <button
                        type="button"
                        onClick={() => statusMut.mutate({ id: post.id, next: 'HIDDEN' })}
                        className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
                      >
                        Скрыть
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(post.id)}
                    className="btn-danger min-h-0 px-2.5 py-1 text-[11px]"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <Modal title="Новая публикация" onClose={() => setModalOpen(false)}>
          <div className="grid gap-3">
            <label className="text-xs font-bold text-[var(--muted)]">
              Заголовок
              <input className="input-field mt-1" value={title} onChange={e => setTitle(e.target.value)} />
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Описание *
              <textarea
                className="input-field mt-1 min-h-20 py-2"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Расскажите о блюде и подаче"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-[var(--muted)]">
                Формат видео
                <select
                  className="input-field mt-1"
                  value={aspectRatio}
                  onChange={e => setAspectRatio(e.target.value as VideoAspectRatio)}
                >
                  {VIDEO_ASPECT_RATIOS.map(ar => (
                    <option key={ar} value={ar}>
                      {ar}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Статус
                <select
                  className="input-field mt-1"
                  value={status}
                  onChange={e => setStatus(e.target.value as PostStatus)}
                >
                  <option value="PUBLISHED">Опубликовать сразу</option>
                  <option value="DRAFT">Сохранить черновик</option>
                </select>
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Категория
                <input
                  className="input-field mt-1"
                  value={categoryName}
                  onChange={e => setCategoryName(e.target.value)}
                  placeholder="Узбекская кухня"
                />
              </label>
            </div>

            <label className="text-xs font-bold text-[var(--muted)]">
              Связанное блюдо меню (для заказа из ленты)
              <select className="input-field mt-1" value={dishId} onChange={e => setDishId(e.target.value)}>
                <option value="">Без привязки к блюду</option>
                {dishes.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.price} UZS)
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void uploadAsset('video')} className="btn-secondary text-xs">
                <Icon name="video" size={15} /> Загрузить видео (MP4/WebM)
              </button>
              <button type="button" onClick={() => void uploadAsset('image')} className="btn-secondary text-xs">
                <Icon name="upload" size={15} /> Загрузить обложку / фото
              </button>
            </div>

            {mediaUrl && (
              <div className="text-xs text-[var(--good)]">
                Медиа загружено ({mediaType}): {mediaUrl}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                Отмена
              </button>
              <button
                type="button"
                disabled={!caption.trim() || !mediaUrl || createMut.isPending}
                onClick={() => createMut.mutate()}
                className="btn-primary"
              >
                {createMut.isPending ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
