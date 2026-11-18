import { type ReactNode, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Language } from '@uzbite/shared';
import { restaurantApi } from '../api/client';
import { AiCopilotDrawer } from '../components/AiCopilotDrawer';
import { Icon, type IconName } from '../components/Icon';
import { Wordmark } from '../components/Wordmark';
import { NAV_LABELS } from '../i18n/copy';
import { useAiWorkspace } from '../store/aiWorkspace';
import { useSession } from '../store/session';

export function DesktopShell({ children }: { children: ReactNode }) {
  const { auth, restaurant, config, connectionState, updateConfig, logout } = useSession();
  const { toggleDrawer, selectedModel } = useAiWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [compactNav, setCompactNav] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ['restaurant-notifications', 1],
    queryFn: () => restaurantApi.getNotifications(1),
    enabled: Boolean(auth),
    refetchInterval: 30000,
  });

  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const labels = NAV_LABELS[config.language];

  const primaryNav: Array<{ to: string; icon: IconName; label: string; tag?: string }> = [
    { to: '/ai-chat', icon: 'sparkles', label: labels.aiChat, tag: 'AI' },
    { to: '/dashboard', icon: 'dashboard', label: labels.dashboard },
    { to: '/orders', icon: 'orders', label: labels.orders },
    { to: '/posts', icon: 'video', label: labels.posts },
    { to: '/profile', icon: 'restaurant', label: labels.profile },
    { to: '/settings', icon: 'settings', label: labels.settings },
  ];

  const operationalNav: Array<{ to: string; icon: IconName; label: string; badge?: number }> = [
    { to: '/menu', icon: 'menu', label: labels.menu },
    { to: '/categories', icon: 'dish', label: labels.categories },
    { to: '/couriers', icon: 'ownCourier', label: labels.couriers },
    { to: '/delivery', icon: 'delivery', label: labels.delivery },
    { to: '/payments', icon: 'payment', label: labels.payments },
    { to: '/statistics', icon: 'statistics', label: labels.statistics },
    { to: '/notifications', icon: 'notifications', label: labels.notifications, badge: unreadCount },
  ];

  const connectionBadge =
    connectionState === 'connected'
      ? { text: 'Онлайн · Socket.IO', dot: 'bg-[var(--good)]', cls: 'text-[var(--good)]' }
      : connectionState === 'connecting'
        ? { text: 'Подключение…', dot: 'bg-[var(--warn)]', cls: 'text-[var(--warn)]' }
        : { text: 'Нет связи с сервером', dot: 'bg-[var(--bad)]', cls: 'text-[var(--bad)]' };

  return (
    <div className="flex h-screen min-w-0 overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <aside
        className={`flex shrink-0 flex-col justify-between border-r border-[var(--border)] bg-[var(--surface)] transition-all duration-150 ${
          compactNav ? 'w-[76px] p-2.5' : 'w-64 p-4'
        }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            {!compactNav && <Wordmark withIcon subtitle="Restaurant" />}
            <button
              type="button"
              onClick={() => setCompactNav(v => !v)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
              title={compactNav ? 'Развернуть меню' : 'Свернуть меню'}
            >
              <Icon name={compactNav ? 'chevron' : 'back'} size={15} />
            </button>
          </div>

          {!compactNav && restaurant && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
              <div className="truncate text-xs font-extrabold">{restaurant.name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                <span
                  className={`h-2 w-2 rounded-full ${
                    restaurant.isOpen && restaurant.acceptingOrders
                      ? 'bg-[var(--good)]'
                      : 'bg-[var(--bad)]'
                  }`}
                />
                <span className="text-[var(--muted)]">
                  {restaurant.isOpen && restaurant.acceptingOrders ? 'Приём заказов открыт' : 'Закрыт'}
                </span>
              </div>
            </div>
          )}

          <div className="mt-4">
            {!compactNav && (
              <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Основное
              </div>
            )}
            <nav className="grid gap-1">
              {primaryNav.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                      isActive
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        : item.tag
                          ? 'border border-[var(--accent)]/30 bg-[var(--accent-soft)]/45 text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]'
                          : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                    }`
                  }
                  title={item.label}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon
                      name={item.icon}
                      size={18}
                      className={`shrink-0 ${item.tag ? 'text-[var(--accent)]' : ''}`}
                    />
                    {!compactNav && <span className="truncate">{item.label}</span>}
                  </span>
                  {!compactNav && item.tag && (
                    <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-white">
                      {item.tag}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="mt-4">
            {!compactNav && (
              <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Операции и отчёты
              </div>
            )}
            <nav className="grid gap-1">
              {operationalNav.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                      isActive
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                    }`
                  }
                  title={item.label}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon name={item.icon} size={18} className="shrink-0" />
                    {!compactNav && <span className="truncate">{item.label}</span>}
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-extrabold text-white tabular-nums">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3">
          {!compactNav && (
            <>
              <div className="flex items-center justify-between px-1 text-xs">
                <span className="font-semibold text-[var(--muted)]">Тема</span>
                <button
                  type="button"
                  onClick={() => void updateConfig({ theme: config.theme === 'light' ? 'dark' : 'light' })}
                  className="btn-secondary min-h-0 px-2.5 py-1 text-[11px]"
                >
                  <Icon name={config.theme === 'light' ? 'moon' : 'sun'} size={13} />
                  {config.theme === 'light' ? 'Тёмная' : 'Светлая'}
                </button>
              </div>
              <div className="flex overflow-hidden rounded-xl border border-[var(--border)] text-[11px] font-bold">
                {(['ru', 'uz', 'en'] as Language[]).map(code => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => void updateConfig({ language: code })}
                    className={`flex-1 py-1.5 uppercase ${
                      config.language === code ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
              <div className="px-1 text-[11px] text-[var(--muted)]">
                <div className="truncate font-bold text-[var(--text)]">{auth?.user.email}</div>
                <div className="truncate text-[10px]">{config.apiBaseUrl}</div>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => void logout().then(() => navigate('/auth'))}
            className="btn-secondary w-full px-2 text-xs"
            title="Выйти"
          >
            <Icon name="logout" size={16} />
            {!compactNav && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass-bar flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm font-extrabold">{restaurant?.name ?? 'UzBite Restaurant'}</span>
            {restaurant && !restaurant.onboardingCompleted && (
              <button
                type="button"
                onClick={() => navigate('/onboarding')}
                className="rounded-full bg-[var(--warn-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--warn)]"
              >
                Завершить настройку ресторана
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => (location.pathname === '/ai-chat' ? navigate('/ai-chat') : toggleDrawer())}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 text-xs font-extrabold text-[var(--accent)] transition hover:border-[var(--accent)] hover:brightness-95"
              title="AI Copilot (Ctrl+K / Alt+A)"
            >
              <Icon name="sparkles" size={15} />
              <span className="hidden sm:inline">{labels.aiChat}</span>
              <span className="hidden rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--muted)] lg:inline">
                {selectedModel === 'gemini-3-8-flash' ? 'Gemini 3.8' : selectedModel}
              </span>
            </button>
            <div className={`flex items-center gap-2 text-xs font-bold ${connectionBadge.cls}`}>
              <span className={`h-2 w-2 rounded-full ${connectionBadge.dot}`} />
              <span className="hidden md:inline">{connectionBadge.text}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
              title="Уведомления"
            >
              <Icon name="notifications" size={17} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <AiCopilotDrawer />
    </div>
  );
}
