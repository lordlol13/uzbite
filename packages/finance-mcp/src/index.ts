#!/usr/bin/env node

const SERVER_INFO = {
  name: 'uzbite-finance-mcp',
  version: '0.1.0',
};

const DEFAULT_PROTOCOL_VERSION = '2024-11-05';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
]);

const API_BASE_URL = (process.env.UZBITE_API_BASE_URL || 'http://127.0.0.1:8081').replace(/\/+$/, '');
const STATIC_TOKEN = process.env.UZBITE_BUSINESS_TOKEN?.trim() || '';
const DEMO_LOGIN_ENABLED = process.env.UZBITE_DEMO_LOGIN === 'true';
const BUSINESS_EMAIL = process.env.UZBITE_BUSINESS_EMAIL?.trim() || '';
const BUSINESS_PASSWORD = process.env.UZBITE_BUSINESS_PASSWORD?.trim() || '';
const RESTAURANT_ID = process.env.UZBITE_RESTAURANT_ID?.trim() || '';
const REQUEST_TIMEOUT_MS = Number(process.env.UZBITE_MCP_TIMEOUT_MS || 20_000);

type JsonRpcId = string | number | null;
type FramingMode = 'ndjson' | 'content-length';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

interface BackendMcpTool {
  name: string;
  description: string;
  category?: string;
  inputSchema?: Record<string, unknown>;
}

let cachedToken = STATIC_TOKEN;
let responseFraming: FramingMode = 'ndjson';
let stdinEnded = false;
let pendingRequests = 0;

function writeMessage(payload: Record<string, unknown>): void {
  const json = JSON.stringify(payload);
  if (responseFraming === 'content-length') {
    const byteLength = Buffer.byteLength(json, 'utf8');
    process.stdout.write(`Content-Length: ${byteLength}\r\n\r\n${json}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

function sendResult(id: JsonRpcId, result: unknown): void {
  writeMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function sendError(id: JsonRpcId, code: number, message: string, data?: unknown): void {
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  });
}

async function authenticate(forceRefresh = false): Promise<string> {
  if (cachedToken && !forceRefresh) {
    return cachedToken;
  }
  if (STATIC_TOKEN && !forceRefresh) {
    cachedToken = STATIC_TOKEN;
    return cachedToken;
  }

  let loginBody: Record<string, unknown> | null = null;
  if (BUSINESS_EMAIL && BUSINESS_PASSWORD) {
    loginBody = { email: BUSINESS_EMAIL, password: BUSINESS_PASSWORD };
  } else if (DEMO_LOGIN_ENABLED) {
    loginBody = { demo: true };
  }

  if (!loginBody) {
    throw new Error(
      'Authentication required: set UZBITE_BUSINESS_TOKEN or set UZBITE_DEMO_LOGIN=true (dev only).',
    );
  }

  const res = await fetch(`${API_BASE_URL}/api/business/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginBody),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`UzBite business login failed (${res.status}): ${text}`);
  }

  const parsed = JSON.parse(text) as { data?: { accessToken?: string } };
  const token = parsed.data?.accessToken;
  if (!token) {
    throw new Error('UzBite login response did not include data.accessToken');
  }
  cachedToken = token;
  return token;
}

async function callBackendApi<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const perform = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (RESTAURANT_ID) {
      headers['X-Restaurant-Id'] = RESTAURANT_ID;
    }
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(`${API_BASE_URL}${path}`, {
      method: init.method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };

  let token = await authenticate(false);
  let res = await perform(token);

  if (res.status === 401 && (DEMO_LOGIN_ENABLED || (BUSINESS_EMAIL && BUSINESS_PASSWORD))) {
    token = await authenticate(true);
    res = await perform(token);
  }

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Backend ${init.method} ${path} failed (${res.status}): ${raw}`);
  }

  const parsed = JSON.parse(raw) as { data: T };
  return parsed.data;
}

function handleInitialize(params: Record<string, unknown> | undefined): Record<string, unknown> {
  const clientVersion =
    typeof params?.protocolVersion === 'string' && SUPPORTED_PROTOCOL_VERSIONS.has(params.protocolVersion)
      ? params.protocolVersion
      : DEFAULT_PROTOCOL_VERSION;

  return {
    protocolVersion: clientVersion,
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    serverInfo: SERVER_INFO,
  };
}

async function handleToolsList(): Promise<Record<string, unknown>> {
  const descriptors = await callBackendApi<BackendMcpTool[]>('/api/business/agent/tools', {
    method: 'GET',
  });

  const tools = descriptors.map(tool => ({
    name: tool.name,
    description: tool.category ? `[${tool.category}] ${tool.description}` : tool.description,
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
  }));

  return { tools };
}

async function handleToolsCall(params: Record<string, unknown> | undefined): Promise<Record<string, unknown>> {
  const name = typeof params?.name === 'string' ? params.name.trim() : '';
  if (!name) {
    throw new RpcParamError('Missing required string parameter: name');
  }

  const rawArgs = params?.arguments;
  const args =
    rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};

  const payload = await callBackendApi<{ tool: string; result: unknown }>('/api/business/agent/tools/call', {
    method: 'POST',
    body: {
      name,
      arguments: args,
    },
  });

  const resultObj = payload.result;
  const isToolError =
    Boolean(resultObj && typeof resultObj === 'object' && 'error' in (resultObj as Record<string, unknown>));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(resultObj, null, 2),
      },
    ],
    isError: isToolError,
  };
}

class RpcParamError extends Error {}

async function dispatchMessage(msg: JsonRpcRequest): Promise<void> {
  const hasId = msg.id !== undefined && msg.id !== null;
  const id: JsonRpcId = msg.id ?? null;

  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (hasId) {
      sendError(id, -32600, 'Invalid Request');
    }
    return;
  }

  // Notifications carry no id and must not receive a response.
  if (!hasId || msg.method.startsWith('notifications/')) {
    return;
  }

  try {
    switch (msg.method) {
      case 'initialize':
        sendResult(id, handleInitialize(msg.params));
        return;
      case 'ping':
        sendResult(id, {});
        return;
      case 'tools/list':
        sendResult(id, await handleToolsList());
        return;
      case 'tools/call':
        sendResult(id, await handleToolsCall(msg.params));
        return;
      default:
        sendError(id, -32601, `Method not found: ${msg.method}`);
        return;
    }
  } catch (err) {
    if (err instanceof RpcParamError) {
      sendError(id, -32602, err.message);
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (msg.method === 'tools/call') {
      sendResult(id, {
        content: [{ type: 'text', text: message }],
        isError: true,
      });
      return;
    }
    sendError(id, -32603, message);
  }
}

function scheduleDispatch(rawJson: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    sendError(null, -32700, 'Parse error');
    return;
  }

  const messages = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of messages) {
    if (!item || typeof item !== 'object') {
      sendError(null, -32600, 'Invalid Request');
      continue;
    }
    pendingRequests += 1;
    void dispatchMessage(item as JsonRpcRequest)
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[uzbite-finance-mcp] unhandled error: ${msg}\n`);
      })
      .finally(() => {
        pendingRequests -= 1;
        if (stdinEnded && pendingRequests === 0) {
          process.exit(0);
        }
      });
  }
}

let incomingBuffer = Buffer.alloc(0);

function drainBuffer(flushRemainder = false): void {
  while (incomingBuffer.length > 0) {
    // Trim leading CR/LF/spaces for clean framing detection
    let lead = 0;
    while (
      lead < incomingBuffer.length &&
      (incomingBuffer[lead] === 0x0d ||
        incomingBuffer[lead] === 0x0a ||
        incomingBuffer[lead] === 0x20 ||
        incomingBuffer[lead] === 0x09)
    ) {
      lead += 1;
    }
    if (lead > 0) {
      incomingBuffer = incomingBuffer.subarray(lead);
    }
    if (incomingBuffer.length === 0) {
      break;
    }

    const headAscii = incomingBuffer.subarray(0, Math.min(32, incomingBuffer.length)).toString('ascii');
    if (/^content-length:/i.test(headAscii)) {
      const crlfSep = incomingBuffer.indexOf('\r\n\r\n');
      const lfSep = incomingBuffer.indexOf('\n\n');
      let headerEnd = -1;
      let sepLen = 0;
      if (crlfSep !== -1 && (lfSep === -1 || crlfSep < lfSep)) {
        headerEnd = crlfSep;
        sepLen = 4;
      } else if (lfSep !== -1) {
        headerEnd = lfSep;
        sepLen = 2;
      }

      if (headerEnd === -1) {
        break;
      }

      const headerText = incomingBuffer.subarray(0, headerEnd).toString('ascii');
      const lenMatch = headerText.match(/content-length:\s*(\d+)/i);
      if (!lenMatch?.[1]) {
        sendError(null, -32700, 'Invalid Content-Length header');
        incomingBuffer = incomingBuffer.subarray(headerEnd + sepLen);
        continue;
      }

      const bodyLength = Number(lenMatch[1]);
      const totalNeeded = headerEnd + sepLen + bodyLength;
      if (incomingBuffer.length < totalNeeded) {
        break;
      }

      responseFraming = 'content-length';
      const bodyStr = incomingBuffer.subarray(headerEnd + sepLen, totalNeeded).toString('utf8');
      incomingBuffer = incomingBuffer.subarray(totalNeeded);
      scheduleDispatch(bodyStr);
      continue;
    }

    const newlineIdx = incomingBuffer.indexOf(0x0a);
    if (newlineIdx === -1) {
      if (flushRemainder) {
        responseFraming = 'ndjson';
        const line = incomingBuffer.toString('utf8').trim();
        incomingBuffer = Buffer.alloc(0);
        if (line) {
          scheduleDispatch(line);
        }
      }
      break;
    }

    responseFraming = 'ndjson';
    const line = incomingBuffer.subarray(0, newlineIdx).toString('utf8').trim();
    incomingBuffer = incomingBuffer.subarray(newlineIdx + 1);
    if (line) {
      scheduleDispatch(line);
    }
  }
}

process.stdin.on('data', (chunk: Buffer) => {
  incomingBuffer = Buffer.concat([incomingBuffer, chunk]);
  drainBuffer(false);
});

process.stdin.on('end', () => {
  stdinEnded = true;
  drainBuffer(true);
  if (pendingRequests === 0) {
    process.exit(0);
  }
});
