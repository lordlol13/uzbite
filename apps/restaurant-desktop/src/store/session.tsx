import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Language, RestaurantProfileDto, Theme } from '@uzbite/shared';
import {
  clearStoredAuth,
  getDesktopConfig,
  loadStoredAuth,
  logoutRestaurant,
  restaurantApi,
  saveDesktopConfig,
  saveStoredAuth,
} from '../api/client';
import { useRestaurantRealtime } from '../hooks/useRealtime';
import type { ConnectionState } from '../services/socket';
import type { DesktopAppConfig, StoredRestaurantAuth } from '../types/electron';

interface SessionContextValue {
  ready: boolean;
  auth: StoredRestaurantAuth | null;
  restaurant: RestaurantProfileDto | null;
  config: DesktopAppConfig;
  connectionState: ConnectionState;
  setAuthSession: (next: StoredRestaurantAuth) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateConfig: (patch: Partial<DesktopAppConfig>) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<StoredRestaurantAuth | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantProfileDto | null>(null);
  const [config, setConfig] = useState<DesktopAppConfig>({
    apiBaseUrl: 'http://127.0.0.1:8081',
    language: 'ru',
    theme: 'light',
  });

  useEffect(() => {
    document.documentElement.dataset.theme = config.theme;
  }, [config.theme]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [loadedConfig, loadedAuth] = await Promise.all([getDesktopConfig(), loadStoredAuth()]);
      if (!active) return;
      setConfig(loadedConfig);
      setAuth(loadedAuth);
      setRestaurant(loadedAuth?.restaurant ?? null);
      if (loadedAuth?.accessToken) {
        try {
          const me = await restaurantApi.getMe();
          if (active) {
            setRestaurant(me.restaurant);
            const updated: StoredRestaurantAuth = {
              ...loadedAuth,
              user: me.user,
              restaurant: me.restaurant,
            };
            setAuth(updated);
            await saveStoredAuth(updated);
          }
        } catch {
          const stillStored = await loadStoredAuth();
          if (active && !stillStored) {
            setAuth(null);
            setRestaurant(null);
          }
        }
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const connectionState = useRestaurantRealtime({
    apiBaseUrl: config.apiBaseUrl,
    accessToken: auth?.accessToken,
    restaurantId: restaurant?.id ?? auth?.user.restaurantId ?? undefined,
    notificationsEnabled: restaurant?.settings?.notificationsEnabled ?? true,
  });

  async function setAuthSession(next: StoredRestaurantAuth) {
    await saveStoredAuth(next);
    setAuth(next);
    setRestaurant(next.restaurant);
    queryClient.clear();
  }

  async function refreshProfile() {
    const me = await restaurantApi.getMe();
    setRestaurant(me.restaurant);
    if (auth) {
      const updated: StoredRestaurantAuth = { ...auth, user: me.user, restaurant: me.restaurant };
      setAuth(updated);
      await saveStoredAuth(updated);
    }
  }

  async function updateConfig(patch: Partial<DesktopAppConfig>) {
    const next = await saveDesktopConfig(patch);
    setConfig(next);
    if (patch.apiBaseUrl) {
      queryClient.invalidateQueries();
    }
  }

  async function logout() {
    await logoutRestaurant();
    await clearStoredAuth();
    setAuth(null);
    setRestaurant(null);
    queryClient.clear();
  }

  return (
    <SessionContext.Provider
      value={{
        ready,
        auth,
        restaurant,
        config,
        connectionState,
        setAuthSession,
        refreshProfile,
        updateConfig,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

export type { Language, Theme };
