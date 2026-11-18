import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentScreenContext,
  AgentUiBlock,
  AiChatResponse,
  AiOptimizationReport,
  BranchAllocationResponse,
  BudgetVarianceItem,
  BusinessAnalysisResponse,
  BusinessKpiOverview,
  BusinessLoginResponse,
  BusinessRestaurantOption,
  BusinessUser,
  DishAnalyticsItem,
  DistrictGeoAnalysisResponse,
  ExpenseBudgetDto,
  ExpenseCategory,
  ExpenseClassificationResult,
  ExpenseDto,
  HourlyHeatmapCell,
  McpToolDescriptor,
  OcrExpenseDraft,
  SupplierDto,
  TashkentDistrictId,
  TimeseriesPoint,
} from '@uzbite/shared';

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: BusinessUser;
  restaurants: BusinessRestaurantOption[];
  selectedRestaurantId: string;
}

interface ElectronBridge {
  isElectron: boolean;
  api: {
    request: (req: {
      method?: string;
      path: string;
      headers?: Record<string, string>;
      body?: unknown;
    }) => Promise<{ status: number; ok: boolean; payload: unknown }>;
  };
  auth: {
    get: () => Promise<StoredAuth | null>;
    set: (payload: StoredAuth) => Promise<boolean>;
    clear: () => Promise<boolean>;
  };
}

declare global {
  interface Window {
    uzbite?: ElectronBridge;
  }
}

const STORAGE_KEY = 'uzbite_business_auth_v1';

export async function loadStoredAuth(): Promise<StoredAuth | null> {
  if (window.uzbite?.auth) {
    return window.uzbite.auth.get();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export async function saveStoredAuth(auth: StoredAuth): Promise<void> {
  if (window.uzbite?.auth) {
    await window.uzbite.auth.set(auth);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export async function clearStoredAuth(): Promise<void> {
  if (window.uzbite?.auth) {
    await window.uzbite.auth.clear();
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}

let inFlightRefresh: Promise<StoredAuth | null> | null = null;

async function rawRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; ok: boolean; payload: unknown }> {
  if (window.uzbite?.api) {
    return window.uzbite.api.request({ method, path, headers, body });
  }
  try {
    const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const payload = (await res.json().catch(() => null)) as unknown;
    return { status: res.status, ok: res.ok, payload };
  } catch {
    return {
      status: 503,
      ok: false,
      payload: {
        error: {
          code: 'SERVER_UNREACHABLE',
          message: 'Backend API (http://127.0.0.1:8081) is unreachable.',
        },
      },
    };
  }
}

export async function checkBusinessBackendHealth(): Promise<{ ok: boolean; status: string }> {
  const res = await rawRequest('GET', '/health', {});
  const data = (res.payload as { data?: { status?: string } } | null)?.data;
  return { ok: res.ok, status: data?.status ?? (res.ok ? 'ok' : 'offline') };
}

async function tryRefresh(current: StoredAuth): Promise<StoredAuth | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      const res = await rawRequest('POST', '/business/auth/refresh', {}, { refreshToken: current.refreshToken });
      if (!res.ok) return null;
      const data = (res.payload as { data?: { accessToken: string; refreshToken: string } } | null)?.data;
      if (!data?.accessToken) return null;
      const updated: StoredAuth = {
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

export async function businessRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  let auth = await loadStoredAuth();
  const headers: Record<string, string> = {};
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  if (auth?.selectedRestaurantId) headers['X-Restaurant-Id'] = auth.selectedRestaurantId;

  let res = await rawRequest(method, path, headers, body);
  if (res.status === 401 && auth?.refreshToken && !path.startsWith('/business/auth/')) {
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
    throw new Error(errPayload?.error?.message ?? `Request failed (${res.status})`);
  }
  if (!res.payload || typeof res.payload !== 'object' || !('data' in res.payload)) {
    throw new Error('Invalid API response payload');
  }
  return (res.payload as { data: T }).data;
}

export async function businessLogin(input: { email: string; password: string } | { demo: true }): Promise<StoredAuth> {
  const data = await businessRequest<BusinessLoginResponse>('POST', '/business/auth/login', input);
  const stored: StoredAuth = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
    restaurants: data.restaurants,
    selectedRestaurantId: data.user.restaurantId,
  };
  await saveStoredAuth(stored);
  return stored;
}

export function fetchOverview(from: string, to: string) {
  return businessRequest<BusinessKpiOverview>('GET', `/business/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function fetchTimeseries(from: string, to: string, bucket: 'day' | 'week' | 'month' = 'day') {
  return businessRequest<TimeseriesPoint[]>(
    'GET',
    `/business/timeseries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=${bucket}`,
  );
}

export function fetchDishes(from: string, to: string) {
  return businessRequest<DishAnalyticsItem[]>('GET', `/business/dishes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function updateDishCost(dishId: string, costPrice: number) {
  return businessRequest<unknown>('PATCH', `/business/dishes/${dishId}/cost`, { costPrice });
}

export function fetchHeatmap(from: string, to: string) {
  return businessRequest<HourlyHeatmapCell[]>('GET', `/business/hours?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function fetchAnalysis(from: string, to: string) {
  return businessRequest<BusinessAnalysisResponse>('GET', `/business/analysis?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function triggerAiSummary(from: string, to: string) {
  return businessRequest<{ report: AiOptimizationReport }>('POST', '/business/analysis/ai-summary', { from, to });
}

export async function fetchExpenses(params: {
  from?: string;
  to?: string;
  category?: ExpenseCategory | '';
  q?: string;
}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  qs.set('pageSize', '200');
  return businessRequest<ExpenseDto[]>('GET', `/business/expenses?${qs.toString()}`);
}

export function fetchSuppliers() {
  return businessRequest<SupplierDto[]>('GET', '/business/suppliers');
}

export function createExpense(payload: {
  supplierName?: string | null;
  category?: ExpenseCategory;
  itemName: string;
  description: string;
  amount: number;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  invoiceNumber?: string | null;
  spentAt: string;
  source?: 'MANUAL' | 'CSV' | 'OCR';
}) {
  return businessRequest<ExpenseDto>('POST', '/business/expenses', payload);
}

export function updateExpense(id: string, payload: Partial<{
  category: ExpenseCategory;
  amount: number;
  isVerified: boolean;
  spentAt: string;
  description: string;
}>) {
  return businessRequest<ExpenseDto>('PATCH', `/business/expenses/${id}`, payload);
}

export function deleteExpense(id: string) {
  return businessRequest<{ deleted: boolean }>('DELETE', `/business/expenses/${id}`);
}

export function classifyExpense(text: string) {
  return businessRequest<ExpenseClassificationResult>('POST', '/business/expenses/classify', { text });
}

export function importExpensesCsv(rows: Array<Record<string, unknown>>) {
  return businessRequest<{ importedCount: number; errors: Array<{ row: number; reason: string }>; findingsTriggered: number }>(
    'POST',
    '/business/expenses/import',
    { rows },
  );
}

export function extractOcrDraft(input: {
  rawText?: string;
  fileName?: string;
  imageBase64?: string;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
}) {
  return businessRequest<OcrExpenseDraft>('POST', '/business/expenses/ocr-draft', input);
}

export function askAiAdvisor(question: string, from?: string, to?: string) {
  return businessRequest<AiChatResponse>('POST', '/business/analysis/ask', { question, from, to });
}

export function reconcileUnpaidOrders() {
  return businessRequest<{ reconciledCount: number }>('POST', '/business/orders/reconcile-unpaid');
}

export function resetDemoData() {
  return businessRequest<{ reset: boolean }>('POST', '/business/demo/reset');
}

export function fetchBudgets(month: string) {
  return businessRequest<ExpenseBudgetDto[]>('GET', `/business/budgets?month=${encodeURIComponent(month)}`);
}

export function saveBudgetLimit(category: ExpenseCategory, month: string, limit: number) {
  return businessRequest<ExpenseBudgetDto[]>('PUT', '/business/budgets', { category, month, limit });
}

export function fetchBudgetVariance(month: string) {
  return businessRequest<BudgetVarianceItem[]>(
    'GET',
    `/business/budgets/variance?month=${encodeURIComponent(month)}`,
  );
}

export function fetchBranchAllocation(params: {
  totalBudget?: number;
  month?: string;
  objective?: 'profit' | 'balanced' | 'growth';
}) {
  const qs = new URLSearchParams();
  if (params.totalBudget && params.totalBudget > 0) qs.set('totalBudget', String(params.totalBudget));
  if (params.month) qs.set('month', params.month);
  if (params.objective) qs.set('objective', params.objective);
  return businessRequest<BranchAllocationResponse>('GET', `/business/branches/allocation?${qs.toString()}`);
}

export function applyBranchAllocation(
  month: string,
  allocations: Array<{ restaurantId: string; category: ExpenseCategory; limit: number }>,
) {
  return businessRequest<{ appliedCount: number; month: string }>('POST', '/business/branches/allocation/apply', {
    month,
    allocations,
  });
}

export function fetchDistrictAnalytics(from: string, to: string, scope: 'current' | 'all' = 'all') {
  return businessRequest<DistrictGeoAnalysisResponse>(
    'GET',
    `/business/geo/districts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&scope=${scope}`,
  );
}

export const DEFAULT_AGENT_MODEL = 'gemini-3-8-flash';

export interface AgentModelInfo {
  id: string;
  displayName: string;
  ownedBy: string;
  freeTier: boolean;
  tools: boolean;
}

export interface AgentModelsResponse {
  activeModel: string;
  configured: boolean;
  models: AgentModelInfo[];
}

export interface AgentChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  latencyMs?: number;
  response?: AgentChatResponse;
  feedback?: 'up' | 'down' | null;
  feedbackStatus?: string | null;
}

export const FALLBACK_AGENT_MODELS: AgentModelInfo[] = [
  {
    id: DEFAULT_AGENT_MODEL,
    displayName: 'Gemini 3.8 Flash',
    ownedBy: 'google',
    freeTier: true,
    tools: true,
  },
  {
    id: 'deepseek-v4-1-flash-1017',
    displayName: 'DeepSeek V4.1 Flash',
    ownedBy: 'deepseek',
    freeTier: true,
    tools: true,
  },
  {
    id: 'gpt-6-luna',
    displayName: 'GPT-6 Luna',
    ownedBy: 'openai',
    freeTier: true,
    tools: true,
  },
];

export function normalizeAgentModels(data?: AgentModelsResponse): AgentModelInfo[] {
  const source = data?.models && data.models.length > 0 ? data.models : FALLBACK_AGENT_MODELS;
  const byId = new Map<string, AgentModelInfo>();

  const defaultFromSource = source.find(m => m.id === DEFAULT_AGENT_MODEL);
  byId.set(
    DEFAULT_AGENT_MODEL,
    defaultFromSource ?? FALLBACK_AGENT_MODELS[0],
  );

  for (const model of source) {
    if (!model.id || byId.has(model.id)) continue;
    byId.set(model.id, model);
  }

  const rest = [...byId.values()].filter(m => m.id !== DEFAULT_AGENT_MODEL);
  rest.sort((a, b) => Number(b.freeTier) - Number(a.freeTier));
  return [byId.get(DEFAULT_AGENT_MODEL)!, ...rest];
}

export function fetchAgentModels() {
  return businessRequest<AgentModelsResponse>('GET', '/business/agent/models');
}

export function fetchAgentMcpTools() {
  return businessRequest<McpToolDescriptor[]>('GET', '/business/agent/tools');
}

export function sendAgentChat(payload: {
  question: string;
  lang: 'ru' | 'uz' | 'en';
  model?: string;
  history?: AgentChatMessage[];
  screenContext?: AgentScreenContext;
  from?: string;
  to?: string;
  month?: string;
  totalBudget?: number;
  districtId?: TashkentDistrictId;
}) {
  return businessRequest<AgentChatResponse>('POST', '/business/agent/chat', {
    ...payload,
    model: payload.model?.trim() || DEFAULT_AGENT_MODEL,
  });
}

export function sendAgentFeedback(payload: {
  requestId: string;
  rating: 'up' | 'down';
  comment?: string;
}) {
  return businessRequest<{ ok: boolean; status: number; upstream: unknown }>('POST', '/business/agent/feedback', payload);
}

const PINNED_WIDGETS_PREFIX = 'uzbite_pinned_widgets_v1_';

export function loadPinnedWidgets(restaurantId: string): AgentUiBlock[] {
  try {
    const raw = localStorage.getItem(`${PINNED_WIDGETS_PREFIX}${restaurantId || 'default'}`);
    return raw ? (JSON.parse(raw) as AgentUiBlock[]) : [];
  } catch {
    return [];
  }
}

export function savePinnedWidget(restaurantId: string, block: AgentUiBlock): AgentUiBlock[] {
  const current = loadPinnedWidgets(restaurantId);
  const baseId = block.id.replace(/-\d{10,}$/, '');
  const deduped = current.filter(b => b.id !== block.id && !b.id.startsWith(`${baseId}-`));
  const next = [{ ...block, id: `${baseId}-${Date.now()}` }, ...deduped].slice(0, 6);
  localStorage.setItem(`${PINNED_WIDGETS_PREFIX}${restaurantId || 'default'}`, JSON.stringify(next));
  return next;
}

export function removePinnedWidget(restaurantId: string, blockId: string): AgentUiBlock[] {
  const next = loadPinnedWidgets(restaurantId).filter(b => b.id !== blockId);
  localStorage.setItem(`${PINNED_WIDGETS_PREFIX}${restaurantId || 'default'}`, JSON.stringify(next));
  return next;
}

export function clearPinnedWidgets(restaurantId: string): AgentUiBlock[] {
  localStorage.removeItem(`${PINNED_WIDGETS_PREFIX}${restaurantId || 'default'}`);
  return [];
}
