import { env } from '../config/env.js';

export interface CoarenaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface CoarenaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | Array<Record<string, unknown>>;
  tool_calls?: CoarenaToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface CoarenaChatResult {
  requestId: string;
  model: string;
  message: {
    role: string;
    content: string | null;
    tool_calls?: CoarenaToolCall[];
  };
  finishReason: string | null;
  usage?: Record<string, unknown>;
}

const FREE_FALLBACK_MODELS = ['gemini-3-8-flash', 'deepseek-v4-1-flash-1017', 'gpt-6-luna'] as const;

function buildCandidateModels(preferred?: string): string[] {
  const first = preferred?.trim() || env.COARENA_MODEL || 'gemini-3-8-flash';
  const ordered = [first, ...FREE_FALLBACK_MODELS];
  return [...new Set(ordered)];
}

export function extractJsonFromText(rawText: string): unknown | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as unknown;
      } catch {
        /* continue */
      }
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function callCoarenaChat(params: {
  messages: CoarenaMessage[];
  tools?: Array<Record<string, unknown>>;
  toolChoice?: 'auto' | 'none';
  responseFormat?: { type: 'json_object' };
  temperature?: number;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}): Promise<CoarenaChatResult | null> {
  const apiKey = env.COARENA_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = env.COARENA_BASE_URL.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;
  const candidates = buildCandidateModels(params.model);
  const timeoutMs = params.timeoutMs ?? 15_000;

  for (const model of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const payload: Record<string, unknown> = {
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens ?? 1400,
      };
      if (model.startsWith('gemini-') || model.startsWith('gpt-')) {
        payload.reasoning_effort = 'low';
      }
      if (params.tools && params.tools.length > 0) {
        payload.tools = params.tools;
        payload.tool_choice = params.toolChoice ?? 'auto';
      }
      if (params.responseFormat) {
        payload.response_format = params.responseFormat;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if ([402, 404, 429, 500, 502, 503, 504].includes(res.status)) {
          continue;
        }
        return null;
      }

      const json = (await res.json()) as {
        id?: string;
        model?: string;
        choices?: Array<{
          finish_reason?: string | null;
          message?: {
            role?: string;
            content?: string | null;
            tool_calls?: CoarenaToolCall[];
          };
        }>;
        usage?: Record<string, unknown>;
      };

      const choice = json.choices?.[0];
      if (!choice?.message) continue;
      if (!choice.message.content?.trim() && (!choice.message.tool_calls || choice.message.tool_calls.length === 0)) {
        continue;
      }

      const headerReqId = res.headers.get('x-coarena-request-id');
      const requestId = headerReqId || json.id || `coarena-${Date.now()}`;
      return {
        requestId,
        model: json.model ?? model,
        message: {
          role: choice.message.role ?? 'assistant',
          content: choice.message.content ?? null,
          tool_calls: choice.message.tool_calls,
        },
        finishReason: choice.finish_reason ?? null,
        usage: json.usage,
      };
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

export async function callGeminiAgentChat(params: {
  systemInstruction: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<{ requestId: string; model: string; content: string } | null> {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiKey) return null;

  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 12_000);

  try {
    const contents = params.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.systemInstruction }] },
        contents,
        generationConfig: {
          temperature: params.temperature ?? 0.15,
          maxOutputTokens: params.maxOutputTokens ?? 400,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;

    return {
      requestId: `local-gemini-${Date.now()}`,
      model,
      content: text,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function callCoarenaJson(
  prompt: string,
  imagePart?: { base64: string; mimeType: string },
  model?: string,
): Promise<{ data: unknown; requestId: string; model: string } | null> {
  if (!env.COARENA_API_KEY?.trim()) return null;

  const content: string | Array<Record<string, unknown>> = imagePart
    ? [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: `data:${imagePart.mimeType};base64,${imagePart.base64}` },
        },
      ]
    : prompt;

  const result = await callCoarenaChat({
    model,
    messages: [{ role: 'user', content }],
    responseFormat: { type: 'json_object' },
    temperature: 0.2,
    maxTokens: 1600,
    timeoutMs: 16_000,
  });

  if (!result?.message.content) return null;
  const parsed = extractJsonFromText(result.message.content);
  if (!parsed) return null;
  return {
    data: parsed,
    requestId: result.requestId,
    model: result.model,
  };
}

export async function submitCoarenaFeedback(params: {
  requestId: string;
  rating: 'up' | 'down';
  comment?: string;
}): Promise<{ ok: boolean; status: number; upstream: unknown }> {
  if (params.requestId.startsWith('heuristic-') || params.requestId.startsWith('local-')) {
    return {
      ok: true,
      status: 200,
      upstream: { accepted: true, localOnly: true, request_id: params.requestId },
    };
  }
  const apiKey = env.COARENA_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 400,
      upstream: { error: 'COARENA_API_KEY is not configured' },
    };
  }

  const baseUrl = env.COARENA_BASE_URL.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/feedback`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const score = params.rating === 'up' ? 1 : -1;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        request_id: params.requestId,
        rating: score,
        score,
        liked: params.rating === 'up',
        thumb: params.rating,
        ...(params.comment ? { comment: params.comment } : {}),
      }),
    });

    const text = await res.text();
    let upstream: unknown = null;
    try {
      upstream = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      upstream = text;
    }

    if (res.ok) {
      return { ok: true, status: res.status, upstream };
    }

    // Retry with string rating if upstream expects 'up'/'down' or 'good'/'bad'
    if (res.status === 400 || res.status === 422) {
      const retryRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          request_id: params.requestId,
          rating: params.rating === 'up' ? 'good' : 'bad',
          ...(params.comment ? { comment: params.comment } : {}),
        }),
      });
      const retryText = await retryRes.text();
      let retryUpstream: unknown = null;
      try {
        retryUpstream = retryText ? (JSON.parse(retryText) as unknown) : null;
      } catch {
        retryUpstream = retryText;
      }
      return { ok: retryRes.ok, status: retryRes.status, upstream: retryUpstream };
    }

    return { ok: false, status: res.status, upstream };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      upstream: { error: err instanceof Error ? err.message : 'Feedback network error' },
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface CoarenaModelInfo {
  id: string;
  displayName: string;
  ownedBy: string;
  freeTier: boolean;
  tools: boolean;
}

export async function listCoarenaModels(): Promise<{
  activeModel: string;
  configured: boolean;
  models: CoarenaModelInfo[];
}> {
  const defaultModels: CoarenaModelInfo[] = [
    { id: 'gemini-3-8-flash', displayName: 'Gemini 3.8 Flash', ownedBy: 'google', freeTier: true, tools: true },
    { id: 'deepseek-v4-1-flash-1017', displayName: 'DeepSeek V4.1 Flash', ownedBy: 'deepseek', freeTier: true, tools: true },
    { id: 'gpt-6-luna', displayName: 'GPT-6 Luna', ownedBy: 'openai', freeTier: true, tools: true },
  ];

  const apiKey = env.COARENA_API_KEY?.trim();
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      activeModel: env.COARENA_MODEL,
      configured: Boolean(geminiKey),
      models: defaultModels,
    };
  }

  const baseUrl = env.COARENA_BASE_URL.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const authFailed = res.status === 401 || res.status === 403;
      return {
        activeModel: env.COARENA_MODEL,
        configured: authFailed ? Boolean(geminiKey) : true,
        models: defaultModels,
      };
    }
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        display_name?: string;
        owned_by?: string;
        capabilities?: { tools?: boolean };
      }>;
    };
    const freeIds = new Set<string>(FREE_FALLBACK_MODELS);
    const models: CoarenaModelInfo[] = (json.data ?? []).map(m => ({
      id: m.id,
      displayName: m.display_name ?? m.id,
      ownedBy: m.owned_by ?? 'unknown',
      freeTier: freeIds.has(m.id),
      tools: Boolean(m.capabilities?.tools ?? true),
    }));
    return {
      activeModel: env.COARENA_MODEL,
      configured: true,
      models: models.length > 0 ? models : defaultModels,
    };
  } catch {
    return { activeModel: env.COARENA_MODEL, configured: true, models: defaultModels };
  } finally {
    clearTimeout(timer);
  }
}
