import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Language } from '@uzbite/shared';
import { restaurantApi } from '../api/client';
import { AgentBlocks } from '../components/AgentBlocks';
import { ErrorBanner, StatusPill } from '../components/Common';
import { Icon } from '../components/Icon';
import { useAiWorkspace, type CustomDashboard } from '../store/aiWorkspace';
import { useSession } from '../store/session';
import {
  deliveryModeLabel,
  deliveryStatusInfo,
  formatDateTime,
  formatMoney,
  orderStatusInfo,
  paymentStatusInfo,
} from '../utils/format';

const DASHBOARD_AI_PRESETS: Record<Language, Array<{ label: string; prompt: string }>> = {
  ru: [
    { label: '+ Дашборд: Операции и кухня', prompt: 'Создай дашборд по операциям ресторана, заказам и топ-блюдам' },
    { label: '+ Дашборд: Карта Ташкента', prompt: 'Создай дашборд по районам Ташкента и доставке' },
    { label: '+ Дашборд: Бюджеты (#25)', prompt: 'Создай дашборд по бюджетам и рискам перерасхода' },
    { label: '+ Дашборд: Аудит (#26)', prompt: 'Создай дашборд по коммунальным расходам и аренде' },
    { label: '+ Дашборд: Филиалы (#24)', prompt: 'Создай дашборд по эффективности филиалов' },
  ],
  uz: [
    { label: '+ Panel: Operatsiyalar', prompt: 'Restoran operatsiyalari, buyurtmalar va top taomlar bo‘yicha dashboard yarat' },
    { label: '+ Panel: Toshkent xaritasi', prompt: 'Toshkent tumanlari va yetkazish bo‘yicha dashboard yarat' },
    { label: '+ Panel: Byudjet (#25)', prompt: 'Byudjet ijrosi va xavflar bo‘yicha dashboard yarat' },
    { label: '+ Panel: Kommunal (#26)', prompt: 'Kommunal va ijara xarajatlari bo‘yicha maxsus dashboard yarat' },
    { label: '+ Panel: Filiallar (#24)', prompt: 'Filiallar samaradorligi bo‘yicha dashboard yarat' },
  ],
  en: [
    { label: '+ Dashboard: Live Ops', prompt: 'Create a custom dashboard for restaurant operations, orders, and top dishes' },
    { label: '+ Dashboard: Tashkent Map', prompt: 'Create a custom dashboard for Tashkent districts and delivery' },
    { label: '+ Dashboard: Budgets (#25)', prompt: 'Create a custom dashboard for budget execution and risks' },
    { label: '+ Dashboard: Utilities (#26)', prompt: 'Create a custom dashboard for utilities and rent costs' },
    { label: '+ Dashboard: Branches (#24)', prompt: 'Create a custom dashboard for branch efficiency' },
  ],
};

export function DashboardPage() {
  const { config, refreshProfile } = useSession();
  const {
    busy: aiBusy,
    actionBusyKey,
    statusBanner,
    customDashboards,
    activeCustomDashboardId,
    setActiveCustomDashboardId,
    pinnedBlocks,
    askQuestion,
    executeAction,
    dismissStatusBanner,
    pinBlock,
    unpinBlock,
    renameDashboard,
    deleteDashboard,
    removeWidgetFromDashboard,
  } = useAiWorkspace();

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [aiInput, setAiInput] = useState('');

  const lang = config.language;

  const dashQuery = useQuery({
    queryKey: ['restaurant-dashboard'],
    queryFn: restaurantApi.getDashboard,
  });

  const toggleOpen = useMutation({
    mutationFn: (nextOpen: boolean) =>
      restaurantApi.updateSettings({ isOpen: nextOpen, acceptingOrders: nextOpen }),
    onSuccess: async () => {
      await refreshProfile();
      await queryClient.invalidateQueries({ queryKey: ['restaurant-dashboard'] });
    },
  });

  const activeCustom = activeCustomDashboardId
    ? customDashboards.find(d => d.id === activeCustomDashboardId) ?? null
    : null;

  function startRename(d: CustomDashboard) {
    setEditingId(d.id);
    setDraftTitle(d.title);
  }

  function commitRename(id: string) {
    if (draftTitle.trim()) {
      renameDashboard(id, draftTitle.trim());
    }
    setEditingId(null);
  }

  async function handleAiCommandSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = aiInput.trim();
    if (!clean || aiBusy) return;
    setAiInput('');
    await askQuestion(clean);
  }

  if (dashQuery.isLoading) {
    return <div className="card p-8 text-center text-sm text-[var(--muted)]">Загрузка панели управления…</div>;
  }

  if (dashQuery.isError || !dashQuery.data) {
    return (
      <ErrorBanner
        message={dashQuery.error instanceof Error ? dashQuery.error.message : 'Не удалось загрузить данные'}
      />
    );
  }

  const { restaurant, stats, recentOrders } = dashQuery.data;
  const isAccepting = restaurant.isOpen && restaurant.acceptingOrders;
  const firstPendingOrder = recentOrders.find(o => o.status === 'PENDING_ACCEPTANCE');
  const presets = DASHBOARD_AI_PRESETS[lang];

  const kpis = [
    { label: 'Заказы сегодня', value: String(stats.ordersToday), sub: `Новых: ${stats.newOrders}` },
    { label: 'Активные заказы', value: String(stats.activeOrders), sub: `Завершённые: ${stats.completedOrders}` },
    {
      label: 'Сумма заказов',
      value: formatMoney(stats.ordersRevenue, config.language),
      sub: `Подтверждено оплат: ${formatMoney(stats.confirmedPaymentsAmount, config.language)}`,
    },
    {
      label: 'Аудитория и рейтинг',
      value: stats.averageRating !== null ? `${stats.averageRating.toFixed(1)} / 5` : 'Нет оценок',
      sub: `Подписчики: ${stats.followers} · Публикаций: ${stats.publicationsCount}`,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-extrabold">{restaurant.name}</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">{restaurant.addressText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={toggleOpen.isPending}
            onClick={() => toggleOpen.mutate(!isAccepting)}
            className={isAccepting ? 'btn-secondary text-xs' : 'btn-primary text-xs'}
          >
            <Icon name="clock" size={15} />
            {isAccepting ? 'Закрыть приём заказов' : 'Открыть приём заказов'}
          </button>
          <button
            type="button"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['restaurant-dashboard'] })}
            className="btn-secondary text-xs"
          >
            <Icon name="refresh" size={15} /> Обновить
          </button>
        </div>
      </div>

      {/* AI Custom Dashboards Switcher & Command Bar */}
      <div className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveCustomDashboardId(null)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                !activeCustom
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <Icon name="dashboard" size={13} />
              <span>{lang === 'uz' ? 'Asosiy sharh' : lang === 'ru' ? 'Главный обзор' : 'Overview'}</span>
            </button>

            {customDashboards.map(d => {
              const selected = activeCustom?.id === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActiveCustomDashboardId(d.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)]'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="max-w-[180px] truncate">{d.title}</span>
                  <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] tabular-nums">
                    {d.blocks.length}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => navigate('/ai-chat')}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--accent)] hover:underline"
          >
            <Icon name="sparkles" size={14} />
            <span>
              {lang === 'uz'
                ? 'AI-Chatga o‘tish'
                : lang === 'ru'
                  ? 'Открыть AI-Чат'
                  : 'Open AI Chat'}
            </span>
          </button>
        </div>

        {/* Inline AI Dashboard Command Input */}
        <form
          onSubmit={e => void handleAiCommandSubmit(e)}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input
            type="text"
            className="input-field min-h-0 flex-1 py-2 text-xs"
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            disabled={aiBusy}
            placeholder={
              activeCustom
                ? lang === 'uz'
                  ? `AI orqali «${activeCustom.title}» panelini boshqaring (masalan: «Xaritani qo‘sh», «Jadvalni olib tashla»)...`
                  : lang === 'ru'
                    ? `Управление дашбордом «${activeCustom.title}» через AI (напр.: «Добавь карту Ташкента», «Переименуй в Контроль»)...`
                    : `Ask AI to manage "${activeCustom.title}" (e.g. "Add Tashkent map", "Rename to Q4 Control")...`
                : lang === 'uz'
                  ? 'AI orqali maxsus dashboard yarating (masalan: «Byudjet va Toshkent xaritasi bo‘yicha dashboard yarat»)...'
                  : lang === 'ru'
                    ? 'Попросите AI собрать или изменить дашборд (напр.: «Создай дашборд по расходам и карте Ташкента»)...'
                    : 'Ask AI to build or control custom dashboards (e.g. "Create utilities & Tashkent map dashboard")...'
            }
          />
          <button
            type="submit"
            disabled={aiBusy || !aiInput.trim()}
            className="btn-primary min-h-0 shrink-0 px-4 py-2 text-xs"
          >
            <Icon name="sparkles" size={14} />
            <span>
              {aiBusy
                ? lang === 'uz'
                  ? 'AI bajarilmoqda…'
                  : lang === 'ru'
                    ? 'AI выполняет…'
                    : 'Running…'
                : lang === 'uz'
                  ? 'AI Bajarish'
                  : lang === 'ru'
                    ? 'Выполнить AI'
                    : 'Run AI'}
            </span>
          </button>
        </form>

        {/* Quick 1-Click AI Dashboard Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p, idx) => (
            <button
              key={idx}
              type="button"
              disabled={aiBusy}
              onClick={() => void askQuestion(p.prompt)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
          {activeCustom && (
            <>
              <button
                type="button"
                disabled={aiBusy}
                onClick={() =>
                  void askQuestion(
                    lang === 'uz'
                      ? 'Dashboardga Toshkent tumanlari xaritasini qo‘sh'
                      : lang === 'ru'
                        ? 'Добавь в этот дашборд карту районов Ташкента'
                        : 'Add Tashkent districts map to this dashboard',
                  )
                }
                className="rounded-lg border border-[var(--accent)]/45 bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                {lang === 'uz' ? '+ Xaritani qo‘shish' : lang === 'ru' ? '+ Добавить карту' : '+ Append Map'}
              </button>
              <button
                type="button"
                disabled={aiBusy}
                onClick={() =>
                  void askQuestion(
                    lang === 'uz'
                      ? 'Dashboardga byudjet grafik va jadvalini qo‘sh'
                      : lang === 'ru'
                        ? 'Добавь в этот дашборд бюджеты и прогноз перерасхода'
                        : 'Add budget forecast chart to this dashboard',
                  )
                }
                className="rounded-lg border border-[var(--accent)]/45 bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                {lang === 'uz' ? '+ Byudjetni qo‘shish' : lang === 'ru' ? '+ Добавить бюджеты' : '+ Append Budgets'}
              </button>
            </>
          )}
        </div>

        {statusBanner && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--good)]/45 bg-[var(--good-soft)] px-3.5 py-2 text-xs font-bold text-[var(--good)]">
            <span className="flex items-center gap-1.5">
              <Icon name="check" size={14} />
              <span>{statusBanner}</span>
            </span>
            <button
              type="button"
              onClick={dismissStatusBanner}
              className="opacity-75 hover:opacity-100"
              aria-label="Dismiss"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Active Custom AI Dashboard View */}
      {activeCustom ? (
        <div className="grid gap-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-extrabold text-[var(--accent)]">
                  <Icon name="sparkles" size={11} />
                  AI Custom Dashboard
                </span>
                <span className="text-[11px] text-[var(--muted)]">
                  {formatDateTime(activeCustom.createdAt, lang)}
                </span>
              </div>

              {editingId === activeCustom.id ? (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    commitRename(activeCustom.id);
                  }}
                  className="mt-2 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    className="input-field max-w-sm py-1 text-sm font-bold"
                    value={draftTitle}
                    onChange={e => setDraftTitle(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="btn-primary min-h-0 px-3 py-1.5 text-xs">
                    {lang === 'uz' ? 'Saqlash' : lang === 'ru' ? 'Сохранить' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="btn-secondary min-h-0 px-3 py-1.5 text-xs"
                  >
                    {lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel'}
                  </button>
                </form>
              ) : (
                <h2 className="m-0 mt-1.5 truncate text-lg font-extrabold">{activeCustom.title}</h2>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveCustomDashboardId(null)}
                className="btn-secondary min-h-0 px-3 py-1.5 text-xs"
              >
                <Icon name="back" size={13} />
                <span>{lang === 'uz' ? 'Asosiy sharh' : lang === 'ru' ? 'К обзору' : 'Overview'}</span>
              </button>
              {editingId !== activeCustom.id && (
                <button
                  type="button"
                  onClick={() => startRename(activeCustom)}
                  className="btn-secondary min-h-0 px-3 py-1.5 text-xs"
                >
                  <Icon name="edit" size={13} />
                  <span>{lang === 'uz' ? 'Nomlash' : lang === 'ru' ? 'Переименовать' : 'Rename'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteDashboard(activeCustom.id)}
                className="btn-danger min-h-0 px-3 py-1.5 text-xs"
              >
                <Icon name="trash" size={13} />
                <span>{lang === 'uz' ? 'O‘chirish' : lang === 'ru' ? 'Удалить' : 'Delete'}</span>
              </button>
            </div>
          </div>

          <div className="grid gap-3.5">
            {activeCustom.blocks.map(block => (
              <div key={block.id} className="relative">
                {activeCustom.blocks.length > 1 && (
                  <div className="mb-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeWidgetFromDashboard(activeCustom.id, block.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--bad)]"
                    >
                      <Icon name="close" size={12} />
                      <span>
                        {lang === 'uz'
                          ? 'Vidjetni olib tashlash'
                          : lang === 'ru'
                            ? 'Убрать виджет'
                            : 'Remove widget'}
                      </span>
                    </button>
                  </div>
                )}
                <AgentBlocks
                  blocks={[block]}
                  lang={lang}
                  onAction={act => void executeAction(act)}
                  onPinBlock={pinBlock}
                  actionBusyKey={actionBusyKey}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-widget-id="widget-kpis">
            {kpis.map(k => (
              <div key={k.label} className="card p-4">
                <div className="text-xs font-bold text-[var(--muted)]">{k.label}</div>
                <div className="mt-2 text-2xl font-extrabold tabular-nums">{k.value}</div>
                <div className="mt-1 text-[11px] font-semibold text-[var(--muted)] tabular-nums">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="card p-4" data-widget-id="widget-quick-actions">
            <div className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
              Быстрые действия
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => navigate(firstPendingOrder ? `/orders/${firstPendingOrder.id}` : '/orders')}
                className="btn-primary text-xs"
              >
                <Icon name="accept" size={16} />
                {firstPendingOrder ? `Открыть новый заказ (#${firstPendingOrder.id.slice(-6)})` : 'Все заказы'}
              </button>
              <button type="button" onClick={() => navigate('/ai-chat')} className="btn-secondary text-xs">
                <Icon name="sparkles" size={16} className="text-[var(--accent)]" /> AI-Ассистент (Gemini 3.8)
              </button>
              <button type="button" onClick={() => navigate('/menu')} className="btn-secondary text-xs">
                <Icon name="dish" size={16} /> Добавить блюдо / Excel
              </button>
              <button type="button" onClick={() => navigate('/posts')} className="btn-secondary text-xs">
                <Icon name="video" size={16} /> Создать публикацию
              </button>
              <button type="button" onClick={() => navigate('/delivery')} className="btn-secondary text-xs">
                <Icon name="delivery" size={16} /> Доставка и курьеры
              </button>
            </div>
          </div>

          {/* Pinned AI Widgets Section */}
          {pinnedBlocks.length > 0 && (
            <div className="card grid gap-3.5 p-5" data-widget-id="widget-pinned">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon name="pin" size={15} className="text-[var(--accent)]" />
                  <h2 className="m-0 text-sm font-extrabold">
                    {lang === 'uz'
                      ? 'AI Yordamchidan biriktirilgan vidjetlar'
                      : lang === 'ru'
                        ? 'Закреплённые AI-виджеты'
                        : 'Pinned AI Widgets'}
                  </h2>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--accent)] tabular-nums">
                    {pinnedBlocks.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/ai-chat')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline"
                >
                  <Icon name="plus" size={13} />
                  <span>{lang === 'uz' ? 'AI-Chat' : lang === 'ru' ? 'Добавить из AI-Чата' : 'Add from AI Chat'}</span>
                </button>
              </div>

              <div className="grid gap-3">
                {pinnedBlocks.map(block => (
                  <div key={block.id} className="relative">
                    <div className="mb-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => unpinBlock(block.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--bad)]"
                      >
                        <Icon name="close" size={12} />
                        <span>{lang === 'uz' ? 'Olib tashlash' : lang === 'ru' ? 'Открепить' : 'Unpin'}</span>
                      </button>
                    </div>
                    <AgentBlocks
                      blocks={[block]}
                      lang={lang}
                      onAction={act => void executeAction(act)}
                      actionBusyKey={actionBusyKey}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card overflow-hidden" data-widget-id="widget-recent-orders">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
              <h2 className="m-0 text-sm font-extrabold">Последние заказы</h2>
              <button
                type="button"
                onClick={() => navigate('/orders')}
                className="text-xs font-bold text-[var(--accent)]"
              >
                Открыть все заказы →
              </button>
            </div>
            {recentOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--muted)]">
                Заказов пока нет. Как только покупатель оформит заказ в приложении UzBite, он мгновенно появится здесь.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-bold text-[var(--muted)]">
                      <th className="px-4 py-2.5">Заказ</th>
                      <th className="px-4 py-2.5">Покупатель</th>
                      <th className="px-4 py-2.5">Сумма</th>
                      <th className="px-4 py-2.5">Статус заказа</th>
                      <th className="px-4 py-2.5">Оплата</th>
                      <th className="px-4 py-2.5">Доставка</th>
                      <th className="px-4 py-2.5">Курьер</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map(order => {
                      const os = orderStatusInfo(order.status);
                      const ps = order.payment ? paymentStatusInfo(order.payment.status) : null;
                      const ds = order.delivery ? deliveryStatusInfo(order.delivery.status) : null;
                      return (
                        <tr
                          key={order.id}
                          onClick={() => navigate(`/orders/${order.id}`)}
                          className="cursor-pointer border-b border-[var(--border)] transition hover:bg-[var(--surface-2)]"
                        >
                          <td className="px-4 py-3 font-bold tabular-nums">
                            <div>#{order.id.slice(-6)}</div>
                            <div className="text-[10px] font-normal text-[var(--muted)]">
                              {formatDateTime(order.createdAt, config.language)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold">{order.recipientName}</div>
                            <div className="text-[11px] text-[var(--muted)]">{order.recipientPhone}</div>
                          </td>
                          <td className="px-4 py-3 font-extrabold tabular-nums">
                            {formatMoney(order.total, config.language)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill label={os.label} tone={os.tone} />
                          </td>
                          <td className="px-4 py-3">
                            {ps && (
                              <StatusPill
                                label={`${order.payment?.method === 'CARD' ? 'Карта' : 'Нал'} · ${ps.label}`}
                                tone={ps.tone}
                              />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {order.delivery ? (
                              <div className="space-y-1">
                                <div className="text-[11px] font-semibold">
                                  {deliveryModeLabel(order.delivery.mode)}
                                </div>
                                {ds && <StatusPill label={ds.label} tone={ds.tone} />}
                              </div>
                            ) : (
                              <span className="text-[var(--muted)]">Не назначена</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {order.delivery?.assignedCourier ? (
                              <span className="font-bold">{order.delivery.assignedCourier.name}</span>
                            ) : (
                              <span className="text-[var(--muted)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
