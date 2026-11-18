import type { Language, RestaurantAuthUser, RestaurantProfileDto, Theme } from '@uzbite/shared';

export interface StoredRestaurantAuth {
  accessToken: string;
  refreshToken: string;
  user: RestaurantAuthUser;
  restaurant: RestaurantProfileDto | null;
}

export interface DesktopAppConfig {
  apiBaseUrl: string;
  language: Language;
  theme: Theme;
}

export interface OpenedFilePayload {
  fileName: string;
  size: number;
  mimeType: string;
  base64: string;
}

export interface UzbiteRestaurantBridge {
  isElectron: boolean;
  api: {
    request: (req: {
      method?: string;
      path: string;
      headers?: Record<string, string>;
      body?: unknown;
    }) => Promise<{ status: number; ok: boolean; payload: unknown }>;
    upload: (req: {
      path: string;
      fileName: string;
      mimeType: string;
      base64: string;
      fields?: Record<string, string>;
    }) => Promise<{ status: number; ok: boolean; payload: unknown }>;
    download: (req: {
      path: string;
      defaultFileName: string;
    }) => Promise<{ ok: boolean; canceled: boolean; filePath?: string; error?: string }>;
  };
  auth: {
    get: () => Promise<StoredRestaurantAuth | null>;
    set: (payload: StoredRestaurantAuth) => Promise<boolean>;
    clear: () => Promise<boolean>;
  };
  config: {
    get: () => Promise<DesktopConfigCompat>;
    set: (patch: Partial<DesktopAppConfig>) => Promise<DesktopConfigCompat>;
  };
  dialog: {
    openFile: (req: { kind: 'spreadsheet' | 'image' | 'video' }) => Promise<OpenedFilePayload | null>;
  };
  shell: {
    openYandexMap: (url: string) => Promise<boolean>;
  };
  notify: (payload: { title: string; body: string }) => Promise<boolean>;
}

type DesktopConfigCompat = DesktopAppConfig;

declare global {
  interface Window {
    uzbiteRestaurant?: UzbiteRestaurantBridge;
  }
}
