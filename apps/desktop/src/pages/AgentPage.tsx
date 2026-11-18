import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  AgentClientAction,
  AgentUiBlock,
  Language,
} from '@uzbite/shared';
import { AgentBlocks } from '../components/AgentBlocks';
import {
  DEFAULT_AGENT_MODEL,
  fetchAgentMcpTools,
  type AgentChatTurn,
  type AgentModelInfo,
} from '../lib/api';

const QUICK_PROMPTS: Record<Language, Array<{ tag: string; text: string }>> = {
  uz: [
    { tag: 'Sana · 15-noy', text: '15-noyabr xarajatlari' },
    { tag: 'Ustuvor', text: 'O‘tgan haftadagi soliq va elektr xarajatlari' },
    { tag: 'Guruhlar', text: 'O‘tgan haftadagi asosiy va qo‘shimcha xarajatlar' },
    { tag: '#26 Audit', text: 'Xatolarni, dublikatlarni va kommunal xarajatlarni qisqartirish yo‘llarini ko‘rsat' },
    { tag: '#25 Byudjet', text: 'Qaysi moddalar byudjet limitidan oshib ketishi mumkin va sababi nima?' },
    { tag: '#24 Filiallar', text: '120 mln so‘m byudjetni filiallar o‘rtasida optimal taqsimlab ber' },
    { tag: 'Xarita', text: 'Eng ko‘p mijozlar qaysi tumanlardan kelmoqda va qayerda yetkazish zararli?' },
    { tag: 'Ssenariy', text: 'Elektr tarifi +20% va mahsulot narxi +10% oshsa foyda qanday o‘zgaradi?' },
  ],
  ru: [
    { tag: 'Дата · 15 ноя', text: 'Расходы за 15 ноября' },
    { tag: 'Приоритет', text: 'Налоги и электричество за прошлую неделю' },
    { tag: 'Группы', text: 'Базовые и доп. расходы за прошлую неделю' },
    { tag: '#26 Аудит', text: 'Найди ошибки учёта, дубликаты и способы сократить расходы на свет и связь' },
    { tag: '#25 Бюджет', text: 'Какие статьи превысят бюджет до конца месяца и почему?' },
    { tag: '#24 Филиалы', text: 'Распредели 120 млн UZS оптимально между всеми филиалами по ROI и спросу' },
    { tag: 'Карта', text: 'Из каких районов Ташкента приходит больше всего заказов и где доставка убыточна?' },
    { tag: 'Сценарий', text: 'Смоделируй рост тарифов на свет +20% и цен на сырьё +10%' },
  ],
  en: [
    { tag: 'Date · Nov 15', text: 'Expenses on November 15' },
    { tag: 'Priority', text: 'Taxes & electricity for last week' },
    { tag: 'Groups', text: 'Base vs additional expenses for last week' },
    { tag: '#26 Audit', text: 'Find accounting errors, duplicates, and ways to cut utility & admin costs' },
    { tag: '#25 Budget', text: 'Which budget categories will breach their limits this month and why?' },
    { tag: '#24 Branches', text: 'Optimally allocate 120M UZS across all branches by ROI and demand' },
    { tag: 'Map', text: 'Which Tashkent districts generate the most orders and where is delivery unprofitable?' },
    { tag: 'What-If', text: 'Simulate +20% utility tariff hike and +10% ingredient inflation' },
  ],
};

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function AgentPage({
  lang,
  restaurantName,
  turns,
  busy,
  statusBanner,
  onStatusBanner,
  selectedModel,
  onSelectModel,
  models,
  modelsConfigured,
  onAskQuestion,
  onClearConversation,
  onRateTurn,
  onExecuteAction,
  onPinBlock,
  inputRef,
}: {
  lang: Language;
  restaurantName: string;
  turns: AgentChatTurn[];
  busy: boolean;
  statusBanner: string | null;
  onStatusBanner: (msg: string | null) => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  models: AgentModelInfo[];
  modelsConfigured?: boolean;
  onAskQuestion: (question: string) => Promise<void>;
  onClearConversation: () => void;
  onRateTurn: (turnId: string, requestId: string, rating: 'up' | 'down') => Promise<void>;
  onExecuteAction: (action: AgentClientAction) => Promise<string | void>;
  onPinBlock: (block: AgentUiBlock) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const [input, setInput] = useState('');
  const [showMcp, setShowMcp] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [doneActionKeys, setDoneActionKeys] = useState<Record<string, boolean>>({});
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const prevTurnCountRef = useRef(turns.length);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (turns.length > prevTurnCountRef.current || busy) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    prevTurnCountRef.current = turns.length;
  }, [turns.length, busy]);

  const mcpQuery = useQuery({
    queryKey: ['agent-mcp-tools'],
    queryFn: fetchAgentMcpTools,
  });

  const activeModelInfo =
    models.find(m => m.id === selectedModel) ??
    models[0] ?? {
      id: DEFAULT_AGENT_MODEL,
      displayName: 'Gemini 3.8 Flash',
      ownedBy: 'google',
      freeTier: true,
      tools: true,
    };

  async function submitQuestion() {
    const clean = input.trim();
    if (!clean || busy) return;
    setInput('');
    await onAskQuestion(clean);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submitQuestion();
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submitQuestion();
    }
  }

  async function handleActionClick(action: AgentClientAction): Promise<string | void> {
    const key = `${action.type}:${action.label}`;
    setActionBusyKey(key);
    try {
      const msg = await onExecuteAction(action);
      const feedbackMsg =
        msg ||
        (lang === 'uz'
          ? `Amal bajarildi: ${action.label}`
          : lang === 'ru'
            ? `Выполнено: ${action.label}`
            : `Executed: ${action.label}`);
      onStatusBanner(feedbackMsg);
      setDoneActionKeys(prev => ({ ...prev, [key]: true }));
      const timer = window.setTimeout(() => {
        setDoneActionKeys(prev => ({ ...prev, [key]: false }));
      }, 2400);
      timersRef.current.push(timer);
      return msg;
    } finally {
      setActionBusyKey(null);
    }
  }

  async function handleCopyTurn(turnId: string, text: string) {
    const ok = await copyTextSafe(text);
    if (!ok) return;
    setCopiedTurnId(turnId);
    const timer = window.setTimeout(() => {
      setCopiedTurnId(prev => (prev === turnId ? null : prev));
    }, 2000);
    timersRef.current.push(timer);
  }

  function handleClear() {
    setCopiedTurnId(null);
    setDoneActionKeys({});
    onClearConversation();
  }

  const prompts = QUICK_PROMPTS[lang];

  return (
    <div className="grid gap-4">
      {/* Header Banner */}
      <div className="card animate-card-in flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {activeModelInfo.displayName} ({activeModelInfo.id})
            </span>
            <span className="rounded-full bg-[var(--good-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--good)]">
              MCP Tools: {mcpQuery.data?.length ?? 9}
            </span>
            {modelsConfigured === true && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--good)]/30 bg-[var(--good-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--good)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)]" />
                {lang === 'uz' ? 'Live AI (Coarena)' : lang === 'ru' ? 'Онлайн ИИ (Coarena)' : 'Live AI (Coarena)'}
              </span>
            )}
            {modelsConfigured === false && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--warn)]/30 bg-[var(--warn-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--warn)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" />
                {lang === 'uz'
                  ? 'Lokal Fallback Rejimi'
                  : lang === 'ru'
                    ? 'Локальный Fallback-режим'
                    : 'Local Fallback Mode'}
              </span>
            )}
            <span className="text-[11px] font-semibold text-[var(--muted)]">{restaurantName}</span>
          </div>
          <h1 className="m-0 mt-1.5 text-base font-semibold">
            {lang === 'uz'
              ? 'AI Moliyaviy Nazoratchi va Tahlilchi (#24, #25, #26 + Xarita)'
              : lang === 'ru'
                ? 'AI Финансовый Контролёр и Генератор UI (#24, #25, #26 + Карта)'
                : 'AI Financial Controller & Generative UI Agent (#24, #25, #26 + Map)'}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {lang === 'uz'
              ? 'Aniq ma’lumotlarga asoslangan tezkor javoblar, grafiklar, tuman xaritasi va dashboard boshqaruvi.'
              : lang === 'ru'
                ? 'Быстрые ответы по реальным цифрам, генерация графиков и карт, создание дашбордов и фикс ошибок.'
                : 'Grounded financial answers, generative charts & district maps, custom dashboards, and 1-click fixes.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <label className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs transition focus-within:border-[var(--accent)]">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
              {lang === 'uz' ? 'Model' : lang === 'ru' ? 'Модель' : 'Model'}
            </span>
            <select
              aria-label="AI Model"
              value={selectedModel}
              disabled={busy}
              onChange={e => onSelectModel(e.target.value)}
              className="cursor-pointer bg-transparent text-xs font-semibold text-[var(--text)] outline-none"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.id})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={turns.length === 0 || busy}
            onClick={handleClear}
            className="btn-secondary min-h-0 px-3 py-2 text-xs"
          >
            {lang === 'uz' ? 'Suhbatni tozalash' : lang === 'ru' ? 'Очистить чат' : 'Clear Chat'}
          </button>
          <button
            type="button"
            onClick={() => setShowMcp(v => !v)}
            className="btn-secondary min-h-0 px-3 py-2 text-xs"
          >
            {showMcp ? 'Hide MCP Tools' : `MCP Tools (${mcpQuery.data?.length ?? 9})`}
          </button>
        </div>
      </div>

      {/* Expandable MCP Tools Inspector */}
      {showMcp && mcpQuery.data && (
        <div className="card animate-slide-up grid grid-cols-1 gap-2.5 p-4 md:grid-cols-2">
          {mcpQuery.data.map((tool, idx) => (
            <div
              key={tool.name}
              style={{ '--stagger': Math.min(idx, 8) } as CSSProperties}
              className="animate-card-in rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-semibold text-[var(--accent)]">{tool.name}</code>
                <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--muted)]">
                  {tool.category}
                </span>
              </div>
              <p className="mt-1 mb-0 text-[11px] text-[var(--muted)]">{tool.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Responsive Quick Prompts Grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {prompts.map((p, idx) => (
          <button
            key={idx}
            type="button"
            disabled={busy}
            style={{ '--stagger': Math.min(idx, 8) } as CSSProperties}
            onClick={() => void onAskQuestion(p.text)}
            className="animate-card-in hover-lift flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left text-xs font-semibold hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="mt-0.5 shrink-0 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
              {p.tag}
            </span>
            <span className="line-clamp-2 leading-snug">{p.text}</span>
          </button>
        ))}
      </div>

      {statusBanner && (
        <div className="animate-slide-up flex items-center justify-between gap-2 rounded-xl border border-[var(--good)] bg-[var(--good-soft)] px-4 py-2.5 text-xs font-bold text-[var(--good)]">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => onStatusBanner(null)}
            className="rounded-md px-1.5 py-0.5 text-[11px] opacity-80 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Conversation Stream */}
      <div className="grid gap-4">
        {turns.length === 0 && !busy && (
          <div className="card animate-card-in p-8 text-center text-xs text-[var(--muted)]">
            {lang === 'uz'
              ? 'Yuqoridagi tezkor savollardan birini bosing yoki moliyaviy savolingizni yozing.'
              : lang === 'ru'
                ? 'Выберите быстрый сценарий выше или задайте любой вопрос по финансам, бюджетам, филиалам или карте Ташкента.'
                : 'Click a quick prompt above or ask any question about budgets, cost cuts, branches, or Tashkent districts.'}
          </div>
        )}

        {turns.map(turn => {
          if (turn.role === 'user') {
            return (
              <div key={turn.id} className="animate-message-in flex justify-end">
                <div className="max-w-2xl whitespace-pre-wrap rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-xs font-bold text-white shadow-xs">
                  {turn.text}
                </div>
              </div>
            );
          }

          const resp = turn.response;
          const isCopied = copiedTurnId === turn.id;
          const ratingPending = turn.feedbackStatus === '...';

          return (
            <div key={turn.id} className="card animate-message-in grid gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text)]">
                    {resp?.source === 'coarena'
                      ? `Coarena · ${resp.model}`
                      : lang === 'uz'
                        ? 'Lokal tahlil (Fallback)'
                        : lang === 'ru'
                          ? 'Локальный движок (Fallback)'
                          : 'Deterministic Fallback'}
                  </span>
                  {turn.latencyMs !== undefined && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] tabular-nums">
                      {turn.latencyMs} ms
                    </span>
                  )}
                  {resp?.toolTraces.map((tr, idx) => (
                    <span
                      key={idx}
                      title={tr.summary}
                      className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)] tabular-nums"
                    >
                      {tr.tool} ({tr.durationMs}ms)
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleCopyTurn(turn.id, turn.text)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition active:scale-95 ${
                      isCopied
                        ? 'animate-scale-in border-[var(--good)] bg-[var(--good-soft)] text-[var(--good)]'
                        : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'
                    }`}
                  >
                    {isCopied
                      ? lang === 'uz'
                        ? '✓ Nusxalandi'
                        : lang === 'ru'
                          ? '✓ Скопировано'
                          : '✓ Copied'
                      : lang === 'uz'
                        ? 'Nusxalash'
                        : lang === 'ru'
                          ? 'Копировать'
                          : 'Copy'}
                  </button>

                  {resp && (
                    <>
                      <button
                        type="button"
                        disabled={ratingPending}
                        aria-label="Helpful"
                        onClick={() => void onRateTurn(turn.id, resp.requestId, 'up')}
                        className={`rounded-lg border px-2 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-60 ${
                          turn.feedback === 'up'
                            ? 'border-[var(--good)] bg-[var(--good-soft)] text-[var(--good)]'
                            : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        disabled={ratingPending}
                        aria-label="Not helpful"
                        onClick={() => void onRateTurn(turn.id, resp.requestId, 'down')}
                        className={`rounded-lg border px-2 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-60 ${
                          turn.feedback === 'down'
                            ? 'border-[var(--bad)] bg-[var(--bad-soft)] text-[var(--bad)]'
                            : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        👎
                      </button>
                      {turn.feedbackStatus && (
                        <span
                          className={`animate-scale-in rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            turn.feedback === 'up'
                              ? 'border-[var(--good)]/40 bg-[var(--good-soft)] text-[var(--good)]'
                              : turn.feedback === 'down'
                                ? 'border-[var(--bad)]/40 bg-[var(--bad-soft)] text-[var(--bad)]'
                                : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]'
                          }`}
                        >
                          {turn.feedbackStatus}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              <p className="m-0 whitespace-pre-line text-sm leading-relaxed font-medium text-[var(--text)]">
                {turn.text}
              </p>

              {resp && resp.uiBlocks.length > 0 && (
                <AgentBlocks
                  blocks={resp.uiBlocks}
                  lang={lang}
                  onAction={act => handleActionClick(act)}
                  onPinBlock={block => {
                    onPinBlock(block);
                    onStatusBanner(
                      lang === 'uz'
                        ? 'Vidjet Dashboardga biriktirildi'
                        : lang === 'ru'
                          ? 'Виджет закреплён на главном дашборде'
                          : 'Widget pinned to Dashboard',
                    );
                  }}
                  actionBusyKey={actionBusyKey}
                />
              )}

              {resp && resp.suggestedActions.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-2.5 sm:flex-row sm:flex-wrap">
                  {resp.suggestedActions.map((act, idx) => {
                    const key = `${act.type}:${act.label}`;
                    const isBusy = actionBusyKey === key;
                    const isDone = Boolean(doneActionKeys[key]);
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={Boolean(actionBusyKey)}
                        onClick={() => void handleActionClick(act)}
                        className={`min-h-0 w-full justify-center px-3 py-2 text-xs sm:w-auto sm:py-1.5 ${
                          isDone
                            ? 'btn-secondary border-[var(--good)] bg-[var(--good-soft)] text-[var(--good)]'
                            : 'btn-primary'
                        }`}
                      >
                        {isBusy && <span className="h-2 w-2 animate-ping rounded-full bg-current" />}
                        {!isBusy && isDone && <span>✓</span>}
                        <span>{act.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {busy && (
          <div className="card animate-message-in grid gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="ai-pink-orb animate-orb-breathe flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white">
                AI
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)]">
                <span>
                  {lang === 'uz'
                    ? `${activeModelInfo.displayName} MCP vositalarini ishga tushirmoqda`
                    : lang === 'ru'
                      ? `${activeModelInfo.displayName} запускает MCP-инструменты`
                      : `${activeModelInfo.displayName} is running MCP tools`}
                </span>
                <span className="ai-typing-dots" aria-hidden="true">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <div className="skeleton-shimmer h-3 w-3/4 rounded-full" />
              <div className="skeleton-shimmer h-3 w-1/2 rounded-full" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="card glass-bar sticky bottom-3 flex flex-col gap-2 p-3 shadow-sm sm:flex-row sm:items-end"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={
            lang === 'uz'
              ? 'Savol bering (Enter — yuborish, Shift+Enter — yangi qator)...'
              : lang === 'ru'
                ? 'Спросите AI-агента (Enter — отправить, Shift+Enter — перенос строки)...'
                : 'Ask AI Finance Agent (Enter to send, Shift+Enter for new line)...'
          }
          className="input-field max-h-32 min-h-[38px] flex-1 resize-none py-2 leading-snug"
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn-primary w-full shrink-0 sm:w-auto">
          {busy ? '...' : lang === 'uz' ? 'Yuborish' : lang === 'ru' ? 'Спросить' : 'Send'}
        </button>
      </form>
    </div>
  );
}
