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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ['restaurant-notifications', 1],
    queryFn: () => restaurantApi.getNotifications(1),
    enabled: Boolean(auth),
    refetchInterval: 30000,
  });

  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const labels = NAV_LABELS[config.language];

  const topTabs: Array<{ to: string; icon: IconName; label: string; tag?: string }> = [
    { to: '/dashboard', icon: 'dashboard', label: config.language === 'ru' ? 'Главная' : labels.dashboard },
    { to: '/orders', icon: 'orders', label: labels.orders },
    { to: '/delivery', icon: 'delivery', label: labels.delivery },
    { to: '/couriers', icon: 'ownCourier', label: config.language === 'ru' ? 'Курьеры' : labels.couriers },
    { to: '/menu', icon: 'menu', label: config.language === 'ru' ? 'Меню' : labels.menu },
    { to: '/statistics', icon: 'statistics', label: labels.statistics },
    { to: '/ai-chat', icon: 'sparkles', label: 'AI-Чат', tag: 'AI' },
  ];

  const secondaryNav: Array<{ to: string; icon: IconName; label: string; badge?: number }> = [
    { to: '/categories', icon: 'dish', label: labels.categories },
    { to: '/posts', icon: 'video', label: labels.posts },
    { to: '/payments', icon: 'payment', label: labels.payments },
    { to: '/profile', icon: 'restaurant', label: labels.profile },
    { to: '/settings', icon: 'settings', label: labels.settings },
    { to: '/notifications', icon: 'notifications', label: labels.notifications, badge: unreadCount },
  ];

  const allNav = [...topTabs, ...secondaryNav];
  const isSecondaryActive = secondaryNav.some(item => location.pathname.startsWith(item.to));

  const connectionBadge =
    connectionState === 'connected'
      ? { text: 'Онлайн', dot: 'bg-[var(--good)]', cls: 'text-[var(--good)] bg-[var(--good-soft)]' }
      : connectionState === 'connecting'
        ? { text: 'Соединение…', dot: 'bg-[var(--warn)]', cls: 'text-[var(--warn)] bg-[var(--warn-soft)]' }
        : { text: 'Офлайн', dot: 'bg-[var(--bad)]', cls: 'text-[var(--bad)] bg-[var(--bad-soft)]' };

  const restaurantInitials = (restaurant?.name ?? auth?.user.email ?? 'UB')
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      {/* Dribbble Sticky Top Navigation Bar */}
      <header className="glass-bar sticky top-0 z-30 border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            {/* Brand + Status Chip */}
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex shrink-0 items-center text-left"
              >
                <Wordmark withIcon subtitle="Restaurant" />
              </button>

              {restaurant && (
                <div className="hidden items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs whitespace-nowrap shadow-[var(--pill-shadow)] 2xl:flex">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      restaurant.isOpen && restaurant.acceptingOrders
                        ? 'bg-[var(--good)]'
                        : 'bg-[var(--bad)]'
                    }`}
                  />
                  <span className="max-w-[140px] truncate font-medium text-[var(--text)]">
                    {restaurant.name}
                  </span>
                </div>
              )}
            </div>

            {/* Center Horizontal Single-Line Pill Navigation (LG+) */}
            <nav className="no-scrollbar relative hidden min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--surface-2)]/75 p-1 lg:flex">
              {topTabs.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] whitespace-nowrap transition ${
                      isActive
                        ? 'bg-[var(--surface)] font-medium text-[var(--text)] shadow-[var(--pill-shadow)]'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`
                  }
                >
                  <span>{item.label}</span>
                  {item.tag && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.2 text-[10px] font-semibold text-[var(--accent)]">
                      {item.tag}
                    </span>
                  )}
                </NavLink>
              ))}

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMoreMenuOpen(v => !v)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] whitespace-nowrap transition ${
                    isSecondaryActive
                      ? 'bg-[var(--surface)] font-medium text-[var(--text)] shadow-[var(--pill-shadow)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <span>Ещё</span>
                  <span className="text-[10px]">▾</span>
                </button>

                {moreMenuOpen && (
                  <div className="card absolute right-0 top-11 z-40 w-56 p-1.5 shadow-xl">
                    {secondaryNav.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMoreMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs transition ${
                            isActive
                              ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                              : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                          }`
                        }
                      >
                        <span className="flex items-center gap-2">
                          <Icon name={item.icon} size={15} />
                          <span>{item.label}</span>
                        </span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            {/* Right Controls */}
            <div className="flex shrink-0 items-center gap-2">
              <div
                className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${connectionBadge.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${connectionBadge.dot}`} />
                <span>{connectionBadge.text}</span>
              </div>

              <button
                type="button"
                onClick={() => (location.pathname === '/ai-chat' ? navigate('/ai-chat') : toggleDrawer())}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text)] shadow-[var(--pill-shadow)] transition hover:border-[var(--accent)]"
                title="AI Copilot (Ctrl+K / Alt+A)"
              >
                <Icon name="sparkles" size={14} className="text-[var(--accent)]" />
                <span className="hidden sm:inline">AI</span>
                <span className="hidden text-[10px] text-[var(--muted)] lg:inline">
                  {selectedModel === 'gemini-3-8-flash' ? '3.8' : selectedModel}
                </span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/notifications')}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--pill-shadow)] transition hover:border-[var(--border-strong)]"
                title="Уведомления"
              >
                <Icon name="notifications" size={16} />
                {unreadCount > 0 && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => void updateConfig({ theme: config.theme === 'light' ? 'dark' : 'light' })}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--pill-shadow)] transition hover:border-[var(--border-strong)]"
                title="Тема"
              >
                <Icon name={config.theme === 'light' ? 'moon' : 'sun'} size={15} />
              </button>

              {/* Rounded-Square Restaurant Avatar Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border-strong)] bg-[var(--cta-bg)] text-xs font-semibold text-[var(--cta-text)] shadow-[var(--pill-shadow)] transition hover:opacity-90"
                  title={auth?.user.email ?? 'Аккаунт'}
                >
                  {restaurantInitials}
                </button>

                {userMenuOpen && (
                  <div className="card absolute right-0 top-11 z-40 w-64 p-3 shadow-xl">
                    <div className="border-b border-[var(--border)] pb-2.5">
                      <div className="truncate text-xs font-semibold text-[var(--text)]">
                        {restaurant?.name ?? 'UzBite Restaurant'}
                      </div>
                      <div className="truncate text-[11px] text-[var(--muted)]">{auth?.user.email}</div>
                      <div className="mt-0.5 truncate text-[10px] text-[var(--muted-soft)]">
                        {config.apiBaseUrl}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-[11px] font-medium">
                      {(['ru', 'uz', 'en'] as Language[]).map(code => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => void updateConfig({ language: code })}
                          className={`flex-1 rounded-full py-1 uppercase transition ${
                            config.language === code
                              ? 'bg-[var(--surface)] font-semibold text-[var(--text)] shadow-xs'
                              : 'text-[var(--muted)]'
                          }`}
                        >
                          {code}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        void logout().then(() => navigate('/auth'));
                      }}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-[var(--bad)]/30 bg-[var(--bad-soft)] py-1.5 text-xs font-medium text-[var(--bad)] transition hover:border-[var(--bad)]"
                    >
                      <Icon name="logout" size={14} />
                      <span>Выйти</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Responsive Scrollable Pills Bar (< LG) */}
          <nav className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-2.5 lg:hidden">
            {allNav.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition ${
                    isActive
                      ? 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--pill-shadow)]'
                      : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
                  }`
                }
              >
                <Icon name={item.icon} size={14} />
                <span>{item.label}</span>
                {'badge' in item && item.badge !== undefined && item.badge > 0 && (
                  <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-white tabular-nums">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {restaurant && !restaurant.onboardingCompleted && location.pathname !== '/onboarding' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--warn)]/35 bg-[var(--warn-soft)] px-4 py-2.5 text-xs">
            <span className="font-medium text-[var(--warn)]">
              Профиль ресторана ещё не завершён в мастере настройки.
            </span>
            <button
              type="button"
              onClick={() => navigate('/onboarding')}
              className="btn-secondary min-h-0 px-3 py-1 text-[11px]"
            >
              Завершить настройку →
            </button>
          </div>
        )}
        {children}
      </main>
      <AiCopilotDrawer />
    </div>
  );
}
