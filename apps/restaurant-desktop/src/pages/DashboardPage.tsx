import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Language } from '@uzbite/shared';
import { restaurantApi } from '../api/client';
import { AgentBlocks } from '../components/AgentBlocks';
import { ErrorBanner, StatusPill } from '../components/Common';
import {
  AiInsightOrbCard,
  AlertFeedRow,
  GradientSliderRow,
  LiveSunburstIcon,
  LiveTrackingMiniMap,
  OrderPerformanceBarChart,
  TickStatCard,
} from '../components/DesignWidgets';
import { Icon } from '../components/Icon';
import { useAiWorkspace, type CustomDashboard } from '../store/aiWorkspace';
import { useSession } from '../store/session';
import {
  deliveryModeLabel,
  deliveryStatusInfo,
  formatCompactMoney,
  formatDateTime,
  formatMoney,
  orderStatusInfo,
  paymentStatusInfo,
} from '../utils/format';

const DASHBOARD_AI_PRESETS: Record<Language, Array<{ label: string; prompt: string }>> = {
  ru: [
    { label: 'Расходы за 15 ноября', prompt: 'Расходы за 15 ноября' },
    { label: 'Налоги и свет · прошл. нед.', prompt: 'Налоги и электричество за прошлую неделю' },
    { label: '+ Дашборд: Операции и кухня', prompt: 'Создай дашборд по операциям ресторана, заказам и топ-блюдам' },
    { label: '+ Дашборд: Карта Ташкента', prompt: 'Создай дашборд по районам Ташкента и доставке' },
    { label: '+ Дашборд: Бюджеты (#25)', prompt: 'Создай дашборд по бюджетам и рискам перерасхода' },
    { label: '+ Дашборд: Аудит (#26)', prompt: 'Создай дашборд по коммунальным расходам и аренде' },
    { label: '+ Дашборд: Филиалы (#24)', prompt: 'Создай дашборд по эффективности филиалов' },
  ],
  uz: [
    { label: '15-noyabr xarajatlari', prompt: '15-noyabr xarajatlari' },
    { label: 'Soliq va elektr · o‘tgan hafta', prompt: 'O‘tgan haftadagi soliq va elektr xarajatlari' },
    { label: '+ Panel: Operatsiyalar', prompt: 'Restoran operatsiyalari, buyurtmalar va top taomlar bo‘yicha dashboard yarat' },
    { label: '+ Panel: Toshkent xaritasi', prompt: 'Toshkent tumanlari va yetkazish bo‘yicha dashboard yarat' },
    { label: '+ Panel: Byudjet (#25)', prompt: 'Byudjet ijrosi va xavflar bo‘yicha dashboard yarat' },
    { label: '+ Panel: Kommunal (#26)', prompt: 'Kommunal va ijara xarajatlari bo‘yicha maxsus dashboard yarat' },
    { label: '+ Panel: Filiallar (#24)', prompt: 'Filiallar samaradorligi bo‘yicha dashboard yarat' },
  ],
  en: [
    { label: 'Expenses on Nov 15', prompt: 'Expenses on November 15' },
    { label: 'Taxes & elec · last week', prompt: 'Taxes & electricity for last week' },
    { label: '+ Dashboard: Live Ops', prompt: 'Create a custom dashboard for restaurant operations, orders, and top dishes' },
    { label: '+ Dashboard: Tashkent Map', prompt: 'Create a custom dashboard for Tashkent districts and delivery' },
    { label: '+ Dashboard: Budgets (#25)', prompt: 'Create a custom dashboard for budget execution and risks' },
    { label: '+ Dashboard: Utilities (#26)', prompt: 'Create a custom dashboard for utilities and rent costs' },
    { label: '+ Dashboard: Branches (#24)', prompt: 'Create a custom dashboard for branch efficiency' },
  ],
};

const SLIDER_TONES: Array<'orange' | 'mint' | 'violet' | 'pink'> = ['orange', 'mint', 'violet', 'pink'];

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
  const [showAiBuilder, setShowAiBuilder] = useState(customDashboards.length > 0);

  const lang = config.language;

  const dashQuery = useQuery({
    queryKey: ['restaurant-dashboard'],
    queryFn: restaurantApi.getDashboard,
  });

  const statsQuery = useQuery({
    queryKey: ['restaurant-dashboard-stats'],
    queryFn: () => restaurantApi.getStatistics(),
    staleTime: 60_000,
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
  const activeDeliveryOrder =
    recentOrders.find(o => o.delivery && !['DELIVERED', 'CANCELLED'].includes(o.delivery.status)) ?? recentOrders[0];
  const presets = DASHBOARD_AI_PRESETS[lang];

  const statsData = statsQuery.data;
  const chartBars =
    statsData?.popularCategories && statsData.popularCategories.length > 0
      ? statsData.popularCategories.slice(0, 7).map(c => ({
          label: c.categoryName,
          value: c.revenue,
          formatted: formatMoney(c.revenue, lang),
        }))
      : recentOrders.slice(0, 7).map(o => ({
          label: `#${o.id.slice(-4)}`,
          value: o.total,
          formatted: formatMoney(o.total, lang),
        }));

  const popularDishes = statsData?.popularDishes?.slice(0, 4) ?? [];
  const totalPopularRev = Math.max(
    1,
    popularDishes.reduce((s, d) => s + d.revenue, 0),
  );

  const paidRatio =
    stats.ordersRevenue > 0
      ? Math.min(1, stats.confirmedPaymentsAmount / stats.ordersRevenue)
      : 0.72;

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[22px] font-medium tracking-[-0.02em]">{restaurant.name}</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">{restaurant.addressText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={toggleOpen.isPending}
            onClick={() => toggleOpen.mutate(!isAccepting)}
            className={isAccepting ? 'btn-secondary text-xs' : 'btn-primary text-xs'}
          >
            <Icon name="clock" size={14} />
            {isAccepting ? 'Закрыть приём заказов' : 'Открыть приём заказов'}
          </button>
          <button
            type="button"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['restaurant-dashboard'] })}
            className="btn-secondary text-xs"
          >
            <Icon name="refresh" size={14} /> Обновить
          </button>
        </div>
      </div>

      {/* Sleek AI Custom Dashboards Switcher */}
      <div className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveCustomDashboardId(null)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                !activeCustom
                  ? 'bg-[var(--cta-bg)] text-[var(--cta-text)] shadow-xs'
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
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="max-w-[180px] truncate">{d.title}</span>
                  <span className="rounded-full bg-[var(--surface-2)] px-1.5 text-[10px] text-[var(--muted)]">
                    {d.blocks.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAiBuilder(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-[var(--accent)]"
            >
              <Icon name="sparkles" size={13} className="text-[var(--accent)]" />
              <span>AI Конструктор</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/ai-chat')}
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              {lang === 'uz' ? 'AI-Chat →' : lang === 'ru' ? 'AI-Ассистент →' : 'AI Chat →'}
            </button>
          </div>
        </div>

        {(showAiBuilder || activeCustom) && (
          <div className="grid gap-2.5 border-t border-[var(--border)] pt-3">
            <form onSubmit={e => void handleAiCommandSubmit(e)} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                className="input-field min-h-0 flex-1 rounded-full py-2 text-xs"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                disabled={aiBusy}
                placeholder={
                  activeCustom
                    ? lang === 'uz'
                      ? `AI orqali «${activeCustom.title}» panelini boshqaring...`
                      : lang === 'ru'
                        ? `Управление дашбордом «${activeCustom.title}» через AI...`
                        : `Ask AI to update "${activeCustom.title}"...`
                    : lang === 'uz'
                      ? 'AI orqali maxsus dashboard yarating...'
                      : lang === 'ru'
                        ? 'Попросите AI собрать дашборд (напр.: «Создай дашборд по заказам и районам Ташкента»)...'
                        : 'Ask AI to build or control dashboards...'
                }
              />
              <button
                type="submit"
                disabled={aiBusy || !aiInput.trim()}
                className="btn-primary min-h-0 shrink-0 px-4 py-2 text-xs"
              >
                <Icon name="sparkles" size={14} />
                <span>
                  {aiBusy ? 'AI…' : lang === 'uz' ? 'AI Bajarish' : lang === 'ru' ? 'Выполнить AI' : 'Run AI'}
                </span>
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-1.5">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={aiBusy}
                  onClick={() => void askQuestion(p.prompt)}
                  className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
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
                    className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
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
                    className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    {lang === 'uz' ? '+ Byudjetni qo‘shish' : lang === 'ru' ? '+ Добавить бюджеты' : '+ Append Budgets'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {statusBanner && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--good)]/40 bg-[var(--good-soft)] px-3.5 py-2 text-xs font-medium text-[var(--good)]">
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
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
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
                    className="input-field max-w-sm py-1 text-sm font-medium"
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
                <h2 className="m-0 mt-1.5 truncate text-lg font-medium tracking-tight">{activeCustom.title}</h2>
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
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted)] transition hover:text-[var(--bad)]"
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
          {/* ROW 1: 4 Signature 38-Tick Animated KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-widget-id="widget-kpis">
            <TickStatCard
              title="Заказы сегодня"
              value={String(stats.ordersToday)}
              delta={`Новых: ${stats.newOrders}`}
              deltaTone={stats.newOrders > 0 ? 'good' : 'neutral'}
              fillRatio={Math.min(0.92, Math.max(0.28, (stats.ordersToday + 2) / 30))}
              ticksColor="ink"
              footerLabel="Все заказы"
              footerRight={String(stats.completedOrders)}
              iconName="orders"
              onClick={() => navigate('/orders')}
              delayMs={0}
            />

            <TickStatCard
              title="Активные заказы"
              value={String(stats.activeOrders)}
              delta={stats.activeOrders > 0 ? 'В работе' : 'Свободно'}
              deltaTone={stats.activeOrders > 0 ? 'good' : 'neutral'}
              fillRatio={Math.min(0.95, Math.max(0.22, (stats.activeOrders + 1) / 16))}
              ticksColor="violet"
              footerLabel="Завершённые"
              footerRight={String(stats.completedOrders)}
              iconName="delivery"
              onClick={() => navigate('/delivery')}
              delayMs={60}
            />

            <TickStatCard
              title="Сумма заказов"
              value={formatCompactMoney(stats.ordersRevenue, lang)}
              delta={`${Math.round(paidRatio * 100)}% опл.`}
              deltaTone="good"
              fillRatio={paidRatio}
              ticksColor="pink"
              footerLabel="Подтверждено"
              footerRight={formatCompactMoney(stats.confirmedPaymentsAmount, lang)}
              iconName="payment"
              onClick={() => navigate('/payments')}
              delayMs={120}
            />

            <TickStatCard
              title="Аудитория и рейтинг"
              value={stats.averageRating !== null ? `${stats.averageRating.toFixed(1)} / 5` : '5.0'}
              delta={`${stats.followers} подп.`}
              deltaTone="good"
              fillRatio={stats.averageRating !== null ? stats.averageRating / 5 : 0.85}
              ticksColor="mint"
              footerLabel="Публикации"
              footerRight={String(stats.publicationsCount)}
              iconName="star"
              onClick={() => navigate('/posts')}
              delayMs={180}
            />
          </div>

          {/* Sleek Quick Actions Pill Strip */}
          <div className="card p-4" data-widget-id="widget-quick-actions">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
                Быстрые действия
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate(firstPendingOrder ? `/orders/${firstPendingOrder.id}` : '/orders')}
                  className="btn-primary text-xs"
                >
                  <Icon name="accept" size={15} />
                  {firstPendingOrder ? `Новый заказ #${firstPendingOrder.id.slice(-6)}` : 'Все заказы'}
                </button>
                <button type="button" onClick={() => navigate('/ai-chat')} className="btn-secondary text-xs">
                  <Icon name="sparkles" size={15} className="text-[var(--accent)]" /> AI-Ассистент
                </button>
                <button type="button" onClick={() => navigate('/menu')} className="btn-secondary text-xs">
                  <Icon name="dish" size={15} /> Меню / Excel
                </button>
                <button type="button" onClick={() => navigate('/posts')} className="btn-secondary text-xs">
                  <Icon name="video" size={15} /> Публикация
                </button>
                <button type="button" onClick={() => navigate('/delivery')} className="btn-secondary text-xs">
                  <Icon name="delivery" size={15} /> Доставка
                </button>
              </div>
            </div>
          </div>

          {/* ROW 2: Pink Gradient KPI Chart (2 cols) + Live Tracking Delivery Card (1 col) */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="card p-5 xl:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="m-0 text-[15px] font-medium tracking-tight">Динамика выручки и категорий</h2>
                  <p className="mt-0.5 mb-0 text-xs text-[var(--muted)]">
                    Активные продажи меню и подтверждённые заказы
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/statistics')}
                  className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1 text-[11.5px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Статистика ›
                </button>
              </div>
              <OrderPerformanceBarChart bars={chartBars} />
            </div>

            <div className="card flex flex-col justify-between p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="m-0 text-[15px] font-medium tracking-tight">Живая доставка</h2>
                <button
                  type="button"
                  onClick={() => navigate('/delivery')}
                  className="text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Все ›
                </button>
              </div>

              <LiveTrackingMiniMap activeCount={stats.activeOrders} />

              <button
                type="button"
                onClick={() => navigate(activeDeliveryOrder ? `/orders/${activeDeliveryOrder.id}` : '/delivery')}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/70 p-3 text-left transition hover:border-[var(--border-strong)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#27272a] text-white">
                    <Icon name="delivery" size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-[var(--text)]">
                      {activeDeliveryOrder
                        ? `Заказ #${activeDeliveryOrder.id.slice(-6)} · ${activeDeliveryOrder.recipientName}`
                        : restaurant.name}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--muted)]">
                      {activeDeliveryOrder?.delivery
                        ? deliveryModeLabel(activeDeliveryOrder.delivery.mode)
                        : 'Готов к отправке курьеров'}
                    </div>
                  </div>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: 'var(--mint-soft)', color: 'var(--mint)' }}
                >
                  <LiveSunburstIcon />
                  {isAccepting ? 'Онлайн' : 'Пауза'}
                </span>
              </button>
            </div>
          </div>

          {/* ROW 3: Popular Dishes Gradient Sliders + Live Alert Feed + Glowing Pink AI Orb */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="card flex min-w-0 flex-col justify-between overflow-hidden p-5">
              <div>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="m-0 text-[15px] font-medium tracking-tight">Лидеры меню</h2>
                  <button
                    type="button"
                    onClick={() => navigate('/menu')}
                    className="text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    Меню ›
                  </button>
                </div>

                {popularDishes.length === 0 ? (
                  <p className="py-10 text-center text-xs text-[var(--muted)]">Пока нет продаж по блюдам</p>
                ) : (
                  <div className="grid gap-3.5">
                    {popularDishes.map((dish, idx) => (
                      <GradientSliderRow
                        key={dish.dishName}
                        label={dish.dishName}
                        valueText={`${dish.quantity} шт · ${formatCompactMoney(dish.revenue, lang)}`}
                        sharePct={(dish.revenue / totalPopularRev) * 100}
                        tone={SLIDER_TONES[idx % SLIDER_TONES.length]}
                        delayMs={idx * 70}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 border-t border-[var(--border)] pt-3.5 text-xs">
                <div className="flex items-center justify-between text-[var(--muted)]">
                  <span>Оплачено сегодня</span>
                  <strong className="font-semibold text-[var(--text)] tabular-nums">
                    {formatMoney(stats.confirmedPaymentsAmount, lang)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="card flex min-w-0 flex-col justify-between overflow-hidden p-5">
              <div className="min-w-0">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="m-0 text-[15px] font-medium tracking-tight">События по заказам</h2>
                  <button
                    type="button"
                    onClick={() => navigate('/orders')}
                    className="text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    Все ({recentOrders.length}) ›
                  </button>
                </div>

                {recentOrders.length === 0 ? (
                  <p className="py-10 text-center text-xs text-[var(--muted)]">Нет новых событий по заказам</p>
                ) : (
                  <div className="grid gap-2.5">
                    {recentOrders.slice(0, 4).map((order, idx) => {
                      const os = orderStatusInfo(order.status);
                      const tone =
                        order.status === 'PENDING_ACCEPTANCE'
                          ? 'warn'
                          : order.status === 'CANCELLED'
                            ? 'bad'
                            : 'good';
                      return (
                        <AlertFeedRow
                          key={order.id}
                          icon={<Icon name={order.delivery ? 'delivery' : 'orders'} size={17} />}
                          tone={tone}
                          title={`Заказ #${order.id.slice(-6)} · ${order.recipientName}`}
                          subtitle={os.label}
                          pillText={formatCompactMoney(order.total, lang)}
                          onClick={() => navigate(`/orders/${order.id}`)}
                          delayMs={idx * 75}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <AiInsightOrbCard
              badgeLabel="Gemini 3.8 Copilot"
              updatedLabel={isAccepting ? 'Онлайн сейчас' : 'Приём на паузе'}
              headline={
                firstPendingOrder
                  ? `Новый заказ #${firstPendingOrder.id.slice(-6)} на сумму ${formatMoney(firstPendingOrder.total, lang)} ожидает подтверждения кухни.`
                  : stats.activeOrders > 0
                    ? `Сейчас в обработке ${stats.activeOrders} активных заказов. Подтверждено оплат: ${formatCompactMoney(stats.confirmedPaymentsAmount, lang)}.`
                    : `Все заказы обработаны. Попросите AI собрать аналитику по меню, курьерам или районам Ташкента.`
              }
              statusLine={
                stats.averageRating !== null
                  ? `Рейтинг ресторана: ${stats.averageRating.toFixed(1)} / 5 · ${stats.followers} подписчиков`
                  : `Открыто заказов сегодня: ${stats.ordersToday}`
              }
              ctaLabel="Открыть AI-Ассистент"
              onCta={() => navigate('/ai-chat')}
            />
          </div>

          {/* Pinned AI Widgets Section */}
          {pinnedBlocks.length > 0 && (
            <div className="card grid gap-3.5 p-5" data-widget-id="widget-pinned">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon name="pin" size={15} className="text-[var(--accent)]" />
                  <h2 className="m-0 text-sm font-medium">
                    {lang === 'uz'
                      ? 'AI Yordamchidan biriktirilgan vidjetlar'
                      : lang === 'ru'
                        ? 'Закреплённые AI-виджеты'
                        : 'Pinned AI Widgets'}
                  </h2>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)] tabular-nums">
                    {pinnedBlocks.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/ai-chat')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
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
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted)] transition hover:text-[var(--bad)]"
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

          {/* Recent Orders Clean Table */}
          <div className="card overflow-hidden" data-widget-id="widget-recent-orders">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
              <h2 className="m-0 text-[15px] font-medium tracking-tight">Последние заказы</h2>
              <button
                type="button"
                onClick={() => navigate('/orders')}
                className="text-xs font-medium text-[var(--accent)] hover:underline"
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
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-medium text-[var(--muted)]">
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
                          <td className="px-4 py-3 font-medium tabular-nums">
                            <div>#{order.id.slice(-6)}</div>
                            <div className="text-[10px] font-normal text-[var(--muted)]">
                              {formatDateTime(order.createdAt, config.language)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{order.recipientName}</div>
                            <div className="text-[11px] text-[var(--muted)]">{order.recipientPhone}</div>
                          </td>
                          <td className="px-4 py-3 font-semibold tabular-nums">
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
                                <div className="text-[11px] font-medium">
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
                              <span className="font-medium">{order.delivery.assignedCourier.name}</span>
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
