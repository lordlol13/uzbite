import type {
  AffiliatedCourierDto,
  AgentChatMessage,
  AgentChatResponse,
  AgentScreenContext,
  BusinessHoursDay,
  DeliveryDto,
  DeliveryMode,
  ExpenseCategory,
  Language,
  McpToolDescriptor,
  MenuImportConflictMode,
  MenuImportPreviewResponse,
  MenuImportResultDto,
  OrderStatus,
  PostStatus,
  RestaurantAuthResponse,
  RestaurantAuthUser,
  RestaurantCategoryDto,
  RestaurantDashboardDto,
  RestaurantDishDto,
  RestaurantNotificationDto,
  RestaurantOrderDto,
  RestaurantPostDto,
  RestaurantProfileDto,
  RestaurantStatisticsDto,
  TashkentDistrictId,
  Theme,
  VideoAspectRatio,
} from '@uzbite/shared';
import type { DesktopAppConfig, OpenedFilePayload, StoredRestaurantAuth } from '../types/electron';

const AUTH_KEY = 'uzbite_restaurant_auth_v1';
const CONFIG_KEY = 'uzbite_restaurant_config_v1';

export async function getDesktopConfig(): Promise<DesktopAppConfig> {
  if (window.uzbiteRestaurant?.config) {
    return window.uzbiteRestaurant.config.get();
  }
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw) as DesktopAppConfig;
  } catch {
    /* Ignore storage read error */
  }
  return {
    apiBaseUrl: 'http://127.0.0.1:8081',
    language: 'ru',
    theme: 'light',
  };
}

export async function saveDesktopConfig(patch: Partial<DesktopAppConfig>): Promise<DesktopAppConfig> {
  if (window.uzbiteRestaurant?.config) {
    return window.uzbiteRestaurant.config.set(patch);
  }
  const current = await getDesktopConfig();
  const next: DesktopAppConfig = {
    apiBaseUrl: patch.apiBaseUrl !== undefined ? patch.apiBaseUrl.trim().replace(/\/+$/, '') : current.apiBaseUrl,
    language: patch.language ?? current.language,
    theme: patch.theme ?? current.theme,
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export async function loadStoredAuth(): Promise<StoredRestaurantAuth | null> {
  if (window.uzbiteRestaurant?.auth) {
    return window.uzbiteRestaurant.auth.get();
  }
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as StoredRestaurantAuth) : null;
  } catch {
    return null;
  }
}

export async function saveStoredAuth(auth: StoredRestaurantAuth): Promise<void> {
  if (window.uzbiteRestaurant?.auth) {
    await window.uzbiteRestaurant.auth.set(auth);
    return;
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export async function clearStoredAuth(): Promise<void> {
  if (window.uzbiteRestaurant?.auth) {
    await window.uzbiteRestaurant.auth.clear();
    return;
  }
  localStorage.removeItem(AUTH_KEY);
}

let inFlightRefresh: Promise<StoredRestaurantAuth | null> | null = null;

async function rawRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; ok: boolean; payload: unknown }> {
  if (window.uzbiteRestaurant?.api) {
    return window.uzbiteRestaurant.api.request({ method, path, headers, body });
  }
  const cfg = await getDesktopConfig();
  const url = `${cfg.apiBaseUrl}/api${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => null)) as unknown;
  return { status: res.status, ok: res.ok, payload };
}

async function tryRefresh(current: StoredRestaurantAuth): Promise<StoredRestaurantAuth | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      const res = await rawRequest('POST', '/restaurant-account/auth/refresh', {}, {
        refreshToken: current.refreshToken,
      });
      if (!res.ok) return null;
      const data = (res.payload as { data?: { accessToken: string; refreshToken: string } } | null)?.data;
      if (!data?.accessToken) return null;
      const updated: StoredRestaurantAuth = {
        ...current,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      };
      await saveStoredAuth(updated);
      return updated;
    })().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  let auth = await loadStoredAuth();
  const headers: Record<string, string> = {};
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;

  let res = await rawRequest(method, path, headers, body);
  if (res.status === 401 && auth?.refreshToken && !path.startsWith('/restaurant-account/auth/')) {
    const refreshed = await tryRefresh(auth);
    if (refreshed) {
      auth = refreshed;
      headers.Authorization = `Bearer ${auth.accessToken}`;
      res = await rawRequest(method, path, headers, body);
    } else {
      await clearStoredAuth();
    }
  }

  if (!res.ok) {
    const errPayload = res.payload as { error?: { message?: string; code?: string } } | null;
    throw new Error(errPayload?.error?.message ?? `Ошибка запроса (${res.status})`);
  }
  return (res.payload as { data: T }).data;
}

export async function apiRequestFull<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{
  data: T;
  pagination?: { page: number; pageSize: number; total: number; hasMore: boolean };
  unreadCount?: number;
}> {
  let auth = await loadStoredAuth();
  const headers: Record<string, string> = {};
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;

  let res = await rawRequest(method, path, headers, body);
  if (res.status === 401 && auth?.refreshToken && !path.startsWith('/restaurant-account/auth/')) {
    const refreshed = await tryRefresh(auth);
    if (refreshed) {
      auth = refreshed;
      headers.Authorization = `Bearer ${auth.accessToken}`;
      res = await rawRequest(method, path, headers, body);
    } else {
      await clearStoredAuth();
    }
  }
  if (!res.ok) {
    const errPayload = res.payload as { error?: { message?: string } } | null;
    throw new Error(errPayload?.error?.message ?? `Ошибка запроса (${res.status})`);
  }
  return res.payload as {
    data: T;
    pagination?: { page: number; pageSize: number; total: number; hasMore: boolean };
    unreadCount?: number;
  };
}

export async function pickAndUploadFile<T>(params: {
  kind: 'spreadsheet' | 'image' | 'video';
  path: string;
  fields?: Record<string, string>;
  browserFile?: File;
}): Promise<T | null> {
  if (window.uzbiteRestaurant?.dialog && window.uzbiteRestaurant?.api && !params.browserFile) {
    const opened: OpenedFilePayload | null = await window.uzbiteRestaurant.dialog.openFile({
      kind: params.kind,
    });
    if (!opened) return null;

    let auth = await loadStoredAuth();
    let res = await window.uzbiteRestaurant.api.upload({
      path: params.path,
      fileName: opened.fileName,
      mimeType: opened.mimeType,
      base64: opened.base64,
      fields: params.fields,
    });
    if (res.status === 401 && auth?.refreshToken) {
      auth = await tryRefresh(auth);
      if (auth) {
        res = await window.uzbiteRestaurant.api.upload({
          path: params.path,
          fileName: opened.fileName,
          mimeType: opened.mimeType,
          base64: opened.base64,
          fields: params.fields,
        });
      }
    }
    if (!res.ok) {
      const err = res.payload as { error?: { message?: string } } | null;
      throw new Error(err?.error?.message ?? `Ошибка загрузки (${res.status})`);
    }
    return (res.payload as { data: T }).data;
  }

  if (!params.browserFile) return null;
  const auth = await loadStoredAuth();
  const cfg = await getDesktopConfig();
  const form = new FormData();
  if (params.fields) {
    for (const [k, v] of Object.entries(params.fields)) form.set(k, v);
  }
  form.set('file', params.browserFile);
  const res = await fetch(`${cfg.apiBaseUrl}/api${params.path}`, {
    method: 'POST',
    headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
    body: form,
  });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(json?.error?.message ?? `Ошибка загрузки (${res.status})`);
  return json?.data ?? null;
}

export async function downloadFile(path: string, defaultFileName: string): Promise<{ saved: boolean; filePath?: string }> {
  if (window.uzbiteRestaurant?.api) {
    const result = await window.uzbiteRestaurant.api.download({ path, defaultFileName });
    if (!result.ok && !result.canceled) {
      throw new Error(result.error || 'Не удалось скачать файл');
    }
    return { saved: result.ok, filePath: result.filePath };
  }

  const auth = await loadStoredAuth();
  const cfg = await getDesktopConfig();
  const res = await fetch(`${cfg.apiBaseUrl}/api${path}`, {
    headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
  });
  if (!res.ok) throw new Error(`Ошибка скачивания (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { saved: true };
}

export async function openExternalYandexMap(latitude: number, longitude: number) {
  const url = `https://yandex.ru/maps/?pt=${encodeURIComponent(`${longitude},${latitude}`)}&z=16&l=map`;
  if (window.uzbiteRestaurant?.shell) {
    await window.uzbiteRestaurant.shell.openYandexMap(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function checkBackendHealth(baseUrl?: string): Promise<{ ok: boolean; status: string }> {
  const cfg = await getDesktopConfig();
  const target = (baseUrl || cfg.apiBaseUrl).replace(/\/+$/, '');
  try {
    const res = await fetch(`${target}/api/health`);
    const json = (await res.json().catch(() => null)) as { data?: { status?: string } } | null;
    return { ok: res.ok, status: json?.data?.status ?? (res.ok ? 'ok' : 'unavailable') };
  } catch {
    return { ok: false, status: 'offline' };
  }
}

export async function loginRestaurant(
  input: { email: string; password: string } | { demo: true },
): Promise<StoredRestaurantAuth> {
  const res = await apiRequest<RestaurantAuthResponse>('POST', '/restaurant-account/auth/login', input);
  const stored: StoredRestaurantAuth = {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    user: res.user,
    restaurant: res.restaurant,
  };
  await saveStoredAuth(stored);
  return stored;
}

export async function registerRestaurant(input: {
  email: string;
  password: string;
  confirmPassword: string;
  restaurantName?: string;
  language: Language;
  theme: Theme;
}): Promise<StoredRestaurantAuth> {
  const res = await apiRequest<RestaurantAuthResponse>('POST', '/restaurant-account/auth/register', input);
  const stored: StoredRestaurantAuth = {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    user: res.user,
    restaurant: res.restaurant,
  };
  await saveStoredAuth(stored);
  return stored;
}

export async function logoutRestaurant(): Promise<void> {
  const auth = await loadStoredAuth();
  try {
    await apiRequest('POST', '/restaurant-account/auth/logout', {
      refreshToken: auth?.refreshToken,
    });
  } catch {
    /* Clear local session even if server is offline */
  }
  await clearStoredAuth();
}

export const restaurantApi = {
  getMe: () => apiRequest<{ user: RestaurantAuthUser; restaurant: RestaurantProfileDto }>('GET', '/restaurant-account/me'),
  completeOnboarding: (payload: Record<string, unknown>) =>
    apiRequest<RestaurantProfileDto>('PUT', '/restaurant-account/onboarding', payload),
  getDashboard: () => apiRequest<RestaurantDashboardDto>('GET', '/restaurant-account/dashboard'),
  getProfile: () => apiRequest<RestaurantProfileDto>('GET', '/restaurant-account/profile'),
  updateProfile: (payload: Partial<RestaurantProfileDto>) =>
    apiRequest<RestaurantProfileDto>('PATCH', '/restaurant-account/profile', payload),
  updateSettings: (payload: Record<string, unknown>) =>
    apiRequest<RestaurantProfileDto>('PUT', '/restaurant-account/settings', payload),
  updateLocation: (payload: { addressText: string; landmark: string; latitude: number; longitude: number }) =>
    apiRequest<RestaurantProfileDto>('PUT', '/restaurant-account/location', payload),
  updateBusinessHours: (payload: { businessHours: BusinessHoursDay[]; acceptingOrders?: boolean; timezone?: string }) =>
    apiRequest('PUT', '/restaurant-account/business-hours', payload),

  getOrders: (filter = 'ALL', q = '', page = 1) =>
    apiRequestFull<RestaurantOrderDto[]>(
      'GET',
      `/restaurant-account/orders?filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}&page=${page}&pageSize=30`,
    ),
  getOrder: (id: string) => apiRequest<RestaurantOrderDto>('GET', `/restaurant-account/orders/${id}`),
  acceptOrder: (id: string) => apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/orders/${id}/accept`),
  updateOrderStatus: (id: string, status: OrderStatus, note?: string) =>
    apiRequest<RestaurantOrderDto>('PATCH', `/restaurant-account/orders/${id}/status`, { status, note }),
  cancelOrder: (id: string, reason: string) =>
    apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/orders/${id}/cancel`, { reason }),

  getPayments: (status = 'ALL') =>
    apiRequest<
      Array<{
        id: string;
        orderId: string;
        method: 'CASH' | 'CARD';
        status: string;
        receiptId: string | null;
        rejectionReason: string | null;
        createdAt: string;
        order: { id: string; recipientName: string; total: number; status: OrderStatus; createdAt: string };
      }>
    >('GET', `/restaurant-account/payments?status=${encodeURIComponent(status)}`),
  getReceiptUrl: (paymentId: string) =>
    apiRequest<{ url: string }>('GET', `/restaurant-account/payments/${paymentId}/receipt`),
  confirmPayment: (paymentId: string) =>
    apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/payments/${paymentId}/confirm`),
  rejectPayment: (paymentId: string, reason: string) =>
    apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/payments/${paymentId}/reject`, { reason }),

  getCategories: () => apiRequest<RestaurantCategoryDto[]>('GET', '/restaurant-account/categories'),
  createCategory: (name: string) =>
    apiRequest<RestaurantCategoryDto>('POST', '/restaurant-account/categories', { name }),
  updateCategory: (id: string, payload: { name?: string; sortOrder?: number }) =>
    apiRequest<RestaurantCategoryDto>('PATCH', `/restaurant-account/categories/${id}`, payload),
  reorderCategories: (categoryIds: string[]) =>
    apiRequest<{ reordered: boolean }>('POST', '/restaurant-account/categories/reorder', { categoryIds }),
  deleteCategory: (id: string) =>
    apiRequest<{ deleted: boolean }>('DELETE', `/restaurant-account/categories/${id}`),

  getDishes: (categoryId?: string) =>
    apiRequest<RestaurantDishDto[]>(
      'GET',
      `/restaurant-account/dishes${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ''}`,
    ),
  createDish: (payload: {
    categoryId: string;
    sku?: string | null;
    name: string;
    description: string;
    price: number;
    costPrice?: number;
    imageUrl?: string;
    isAvailable: boolean;
  }) => apiRequest<RestaurantDishDto>('POST', '/restaurant-account/dishes', payload),
  updateDish: (id: string, payload: Record<string, unknown>) =>
    apiRequest<RestaurantDishDto>('PATCH', `/restaurant-account/dishes/${id}`, payload),
  deleteDish: (id: string) =>
    apiRequest<{ deleted?: boolean; archived?: boolean }>('DELETE', `/restaurant-account/dishes/${id}`),

  getPosts: () => apiRequest<RestaurantPostDto[]>('GET', '/restaurant-account/posts'),
  createPost: (payload: {
    title: string;
    caption: string;
    categoryName?: string | null;
    dishId?: string | null;
    status: PostStatus;
    aspectRatio: VideoAspectRatio;
    mediaType: 'VIDEO' | 'IMAGE';
    mediaUrl: string;
    posterUrl?: string | null;
  }) => apiRequest<RestaurantPostDto>('POST', '/restaurant-account/posts', payload),
  updatePost: (id: string, payload: Record<string, unknown>) =>
    apiRequest<RestaurantPostDto>('PATCH', `/restaurant-account/posts/${id}`, payload),
  deletePost: (id: string) => apiRequest<{ deleted: boolean }>('DELETE', `/restaurant-account/posts/${id}`),

  getCouriers: () => apiRequest<AffiliatedCourierDto[]>('GET', '/restaurant-account/couriers'),
  inviteCourier: (identifier: string) =>
    apiRequest<{ affiliationId: string; inviteCode: string; status: string }>('POST', '/restaurant-account/couriers/invitations', {
      identifier,
    }),
  updateCourierAffiliation: (affiliationId: string, status: 'ACTIVE' | 'DISABLED') =>
    apiRequest('PATCH', `/restaurant-account/couriers/${affiliationId}`, { status }),

  getDeliveries: () => apiRequest<DeliveryDto[]>('GET', '/restaurant-account/deliveries'),
  assignOwnCourier: (orderId: string, courierId: string, rewardAmount?: number, notes?: string) =>
    apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/deliveries/${orderId}/assign-own`, {
      courierId,
      rewardAmount,
      notes,
    }),
  requestOnDemandCourier: (orderId: string, rewardAmount?: number, notes?: string) =>
    apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/deliveries/${orderId}/request-on-demand`, {
      rewardAmount,
      notes,
    }),
  cancelDeliverySearch: (orderId: string, reason?: string) =>
    apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/deliveries/${orderId}/cancel-search`, { reason }),
  cancelDeliveryAssignment: (orderId: string, reason: string) =>
    apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/deliveries/${orderId}/cancel-assignment`, { reason }),
  markReadyForPickup: (orderId: string) =>
    apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/deliveries/${orderId}/mark-ready`),
  handoverDelivery: (orderId: string, startDelivery = false) =>
    apiRequest<RestaurantOrderDto>('POST', `/restaurant-account/deliveries/${orderId}/handover`, { startDelivery }),

  getImports: () =>
    apiRequest<
      Array<{
        id: string;
        fileName: string;
        fileFormat: string;
        conflictMode: string;
        status: string;
        totalRows: number;
        addedCount: number;
        updatedCount: number;
        skippedCount: number;
        errorCount: number;
        createdAt: string;
      }>
    >('GET', '/restaurant-account/imports'),
  previewMenuImport: (conflictMode: MenuImportConflictMode, browserFile?: File) =>
    pickAndUploadFile<MenuImportPreviewResponse>({
      kind: 'spreadsheet',
      path: '/restaurant-account/imports/preview',
      fields: { conflictMode },
      browserFile,
    }),
  confirmMenuImport: (jobId: string, createMissingCategories: boolean, allowPartial: boolean) =>
    apiRequest<MenuImportResultDto>('POST', `/restaurant-account/imports/${jobId}/confirm`, {
      createMissingCategories,
      allowPartial,
    }),
  cancelMenuImport: (jobId: string) =>
    apiRequest<{ cancelled: boolean }>('POST', `/restaurant-account/imports/${jobId}/cancel`),

  uploadMedia: (kind: 'image' | 'video', browserFile?: File) =>
    pickAndUploadFile<{ url: string; mimeType: string; size: number; kind: 'IMAGE' | 'VIDEO' }>({
      kind,
      path: '/restaurant-account/media',
      fields: { kind: kind === 'image' ? 'IMAGE' : 'VIDEO' },
      browserFile,
    }),

  getStatistics: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return apiRequest<RestaurantStatisticsDto>('GET', `/restaurant-account/statistics?${qs.toString()}`);
  },

  getNotifications: (page = 1) =>
    apiRequestFull<RestaurantNotificationDto[]>('GET', `/restaurant-account/notifications?page=${page}&pageSize=30`),
  markNotificationsRead: (id?: string) =>
    apiRequest<{ markedRead: boolean }>('PATCH', '/restaurant-account/notifications/read', id ? { id } : {}),
};

export interface RestaurantAiModelInfo {
  id: string;
  displayName: string;
  ownedBy: string;
  freeTier: boolean;
  tools: boolean;
}

export interface RestaurantAiModelsResponse {
  activeModel: string;
  configured: boolean;
  models: RestaurantAiModelInfo[];
}

export const restaurantAiApi = {
  getModels: () => apiRequest<RestaurantAiModelsResponse>('GET', '/restaurant-account/ai/models'),
  getTools: () => apiRequest<McpToolDescriptor[]>('GET', '/restaurant-account/ai/tools'),
  callTool: (payload: {
    name: string;
    arguments?: Record<string, unknown>;
    from?: string;
    to?: string;
    month?: string;
  }) =>
    apiRequest<{ tool: string; result: unknown }>('POST', '/restaurant-account/ai/tools/call', payload),
  chat: (payload: {
    question: string;
    lang: Language;
    model?: string;
    history?: AgentChatMessage[];
    screenContext?: AgentScreenContext;
    from?: string;
    to?: string;
    month?: string;
    totalBudget?: number;
    districtId?: TashkentDistrictId;
  }) =>
    apiRequest<AgentChatResponse>('POST', '/restaurant-account/ai/chat', {
      ...payload,
      model: payload.model || 'gemini-3-8-flash',
    }),
  sendFeedback: (payload: {
    requestId: string;
    rating: 'up' | 'down';
    comment?: string;
  }) =>
    apiRequest<{ ok: boolean; status: number; upstream: unknown }>(
      'POST',
      '/restaurant-account/ai/feedback',
      payload,
    ),
  fixFinding: (payload: {
    findingId?: string;
    code: string;
    expenseId?: string;
    duplicateExpenseId?: string;
    expectedAmount?: number;
    suggestedCategory?: ExpenseCategory;
  }) =>
    apiRequest<{
      fixed: boolean;
      code?: string;
      action?: string;
      expenseId?: string;
      message?: string;
    }>(
      'POST',
      '/restaurant-account/ai/fix-finding',
      payload,
    ),
  applyBranchBudgets: (payload: {
    month: string;
    allocations: Array<{ restaurantId: string; category: ExpenseCategory; limit: number }>;
  }) =>
    apiRequest<{ appliedCount: number; month: string }>(
      'POST',
      '/restaurant-account/ai/apply-branch-budgets',
      payload,
    ),
};

export type DeliveryModeChoice = DeliveryMode;
