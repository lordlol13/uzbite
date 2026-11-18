import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type {
  AgentClientAction,
  AgentScreenContext,
  AgentUiBlock,
  Language,
} from '@uzbite/shared';
import {
  DEFAULT_AGENT_MODEL,
  type AgentChatTurn,
  type AgentModelInfo,
} from '../lib/api';
import { COPY, type NavTab } from '../lib/i18n';
import { AgentBlocks } from './AgentBlocks';

type ContextPromptMap = Record<NavTab, Record<Language, string[]>>;

const SCREEN_PROMPTS: ContextPromptMap = {
  dashboard: {
    ru: [
      'Расходы за 15 ноября',
      'Налоги и электричество за прошлую неделю',
      'Базовые и доп. расходы за прошлую неделю',
      'Что сейчас на моём экране и какие главные выводы?',
    ],
    uz: [
      '15-noyabr xarajatlari',
      'O‘tgan haftadagi soliq va elektr xarajatlari',
      'O‘tgan haftadagi asosiy va qo‘shimcha xarajatlar',
      'Hozirgi ekranda nimalar ko‘rinib turibdi va asosiy xulosa nima?',
    ],
    en: [
      'Expenses on November 15',
      'Taxes & electricity for last week',
      'Base vs additional expenses for last week',
      'What is on my current screen and what are the top takeaways?',
    ],
  },
  audit: {
    ru: [
      'Налоги и электричество за прошлую неделю',
      'Найди ошибки учёта, дубликаты и способы сократить расходы',
      'Сколько можно сэкономить на свете, связи и поставщиках?',
    ],
    uz: [
      'O‘tgan haftadagi soliq va elektr xarajatlari',
      'Hisob xatolari, dublikatlar va xarajatlarni qisqartirish yo‘llarini top',
      'Elektr, aloqa va yetkazib beruvchilardan qancha tejash mumkin?',
    ],
    en: [
      'Taxes & electricity for last week',
      'Find accounting errors, duplicates, and ways to cut costs',
      'How much can we save on utilities, telecom, and suppliers?',
    ],
  },
  budgets: {
    ru: [
      'Какие статьи превысят бюджет до конца месяца и почему?',
      'Смоделируй рост тарифов на свет +20% и цен на сырьё +10%',
      'Подсвети самые рискованные категории бюджета',
    ],
    uz: [
      'Qaysi moddalar oy oxirigacha byudjet limitidan oshib ketadi?',
      'Elektr tarifi +20% va xomashyo +10% oshsa nima bo‘ladi?',
      'Eng xavfli byudjet moddalarini ajratib ko‘rsat',
    ],
    en: [
      'Which budget categories will breach limits this month and why?',
      'Simulate +20% utility tariff hike and +10% ingredient inflation',
      'Highlight the highest-risk budget categories',
    ],
  },
  branches: {
    ru: [
      'Распредели 120 млн UZS оптимально между филиалами по ROI',
      'Сравни эффективность всех филиалов и выдели лидеров',
      'Где перераспределение бюджета даст максимальный рост прибыли?',
    ],
    uz: [
      '120 mln UZS byudjetni filiallar o‘rtasida ROI bo‘yicha taqsimla',
      'Barcha filiallar samaradorligini solishtirib ko‘rsat',
      'Qaysi filialga qo‘shimcha byudjet eng yuqori foyda beradi?',
    ],
    en: [
      'Optimally allocate 120M UZS across branches by ROI and demand',
      'Compare efficiency across all branches and rank leaders',
      'Where will budget reallocation deliver the highest profit lift?',
    ],
  },
  map: {
    ru: [
      'Из каких районов Ташкента больше всего заказов и где доставка убыточна?',
      'Где лучше открыть новый филиал или расширить зону 3.5 км?',
      'Проанализируй текущий выбранный район на карте',
    ],
    uz: [
      'Toshkentning qaysi tumanlaridan eng ko‘p buyurtma va qayerda yetkazish zararli?',
      'Yangi filial ochish yoki 3.5 km zonani kengaytirish uchun eng yaxshi tuman?',
      'Xaritada tanlangan tuman natijalarini tahlil qil',
    ],
    en: [
      'Which Tashkent districts drive the most orders and where is delivery unprofitable?',
      'Where should we expand 3.5 km delivery coverage or open a branch?',
      'Analyze the currently selected district on the map',
    ],
  },
  expenses: {
    ru: [
      'Расходы за 15 ноября',
      'Налоги и электричество за прошлую неделю',
      'Базовые и доп. расходы за прошлую неделю',
      'Найди дубликаты накладных и несоответствия сумм в расходах',
    ],
    uz: [
      '15-noyabr xarajatlari',
      'O‘tgan haftadagi soliq va elektr xarajatlari',
      'O‘tgan haftadagi asosiy va qo‘shimcha xarajatlar',
      'Xarajatlarda dublikat fakturalar va summa xatolarini top',
    ],
    en: [
      'Expenses on November 15',
      'Taxes & electricity for last week',
      'Base vs additional expenses for last week',
      'Find duplicate invoices and amount mismatches in expenses',
    ],
  },
  sales: {
    ru: [
      'Какие блюда самые маржинальные и что требует пересмотра себестоимости?',
      'Как повысить чистую прибыль и средний чек в пиковые часы?',
      'Покажи сводку по выручке, марже и ключевым рискам',
    ],
    uz: [
      'Qaysi taomlar eng daromadli va qaysilarining tannarxini qayta ko‘rish kerak?',
      'Piyk soatlarda o‘rtacha chek va sof foydani qanday oshirish mumkin?',
      'Tushum, marja va asosiy xavflar bo‘yicha qisqa xulosa ber',
    ],
    en: [
      'Which dishes have the highest margin and which need cost review?',
      'How can we lift net profit and average check during peak hours?',
      'Summarize revenue, margin, and key risks for this period',
    ],
  },
  agent: {
    ru: ['Что сейчас на моём экране и какие главные выводы?'],
    uz: ['Hozirgi ekranda nimalar ko‘rinib turibdi?'],
    en: ['What is on my current screen and what should I focus on?'],
  },
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

export function AiCopilotDrawer({
  open,
  onClose,
  onExpandToAgent,
  lang,
  restaurantName,
  screenContext,
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
}: {
  open: boolean;
  onClose: () => void;
  onExpandToAgent: () => void;
  lang: Language;
  restaurantName: string;
  screenContext: AgentScreenContext;
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
}) {
  const [input, setInput] = useState('');
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [doneActionKeys, setDoneActionKeys] = useState<Record<string, boolean>>({});
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, turns.length, busy]);

  if (!open) return null;

  const activeModelInfo =
    models.find(m => m.id === selectedModel) ??
    models[0] ?? {
      id: DEFAULT_AGENT_MODEL,
      displayName: 'Gemini 3.8 Flash',
      ownedBy: 'google',
      freeTier: true,
      tools: true,
    };

  const tabLabel = COPY[lang].nav[screenContext.activeTab as NavTab] ?? screenContext.activeTab;
  const contextPrompts =
    SCREEN_PROMPTS[screenContext.activeTab as NavTab]?.[lang] ?? SCREEN_PROMPTS.dashboard[lang];

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

  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close AI Copilot"
        onClick={onClose}
        className="animate-backdrop-in fixed inset-0 bg-black/30 backdrop-blur-[3px]"
      />

      {/* Slide-over Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="AI Copilot"
        className="animate-drawer-in relative z-50 flex h-full w-full max-w-[540px] flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex flex-col gap-2.5 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="ai-pink-orb animate-orb-breathe flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white">
                AI
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold tracking-tight">AI Copilot</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    {activeModelInfo.displayName}
                  </span>
                  {modelsConfigured === true && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--good-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--good)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)]" />
                      Live
                    </span>
                  )}
                  {modelsConfigured === false && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warn-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--warn)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" />
                      Fallback
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onExpandToAgent}
                title={
                  lang === 'uz'
                    ? 'To‘liq AI-Agent oynasiga o‘tish'
                    : lang === 'ru'
                      ? 'Развернуть во вкладку AI-Агент (MCP)'
                      : 'Expand to full AI Agent (MCP) tab'
                }
                className="btn-secondary min-h-0 px-2.5 py-1.5 text-[11px]"
              >
                {lang === 'uz' ? '↗ To‘liq' : lang === 'ru' ? '↗ Полный экран' : '↗ Full Agent'}
              </button>
              <button
                type="button"
                disabled={turns.length === 0 || busy}
                onClick={handleClear}
                className="btn-secondary min-h-0 px-2 py-1.5 text-[11px]"
                title={lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить чат' : 'Clear chat'}
              >
                {lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить' : 'Clear'}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="btn-secondary min-h-0 px-2.5 py-1.5 text-xs font-semibold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Active Screen Context + Model Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px]">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                {lang === 'uz' ? 'Ekran' : lang === 'ru' ? 'Экран' : 'Screen'}: {tabLabel}
              </span>
              <span className="truncate font-bold text-[var(--text)]">{restaurantName}</span>
              <span className="text-[var(--muted)]">
                · {screenContext.days}d · {screenContext.month}
              </span>
              {screenContext.districtId && (
                <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                  {screenContext.districtId}
                </span>
              )}
            </div>

            <select
              aria-label="Copilot Model"
              value={selectedModel}
              disabled={busy}
              onChange={e => onSelectModel(e.target.value)}
              className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-semibold text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Banner */}
        {statusBanner && (
          <div className="animate-slide-up mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--good)] bg-[var(--good-soft)] px-3 py-2 text-xs font-bold text-[var(--good)]">
            <span className="truncate">{statusBanner}</span>
            <button
              type="button"
              onClick={() => onStatusBanner(null)}
              className="shrink-0 rounded px-1 text-[11px] opacity-80 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Context Quick Prompts */}
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {lang === 'uz'
                ? 'Ushbu ekran bo‘yicha tezkor savollar'
                : lang === 'ru'
                  ? 'Быстрые вопросы по этому экрану'
                  : 'Quick prompts for this screen'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contextPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={busy}
                  style={{ '--stagger': Math.min(idx, 6) } as CSSProperties}
                  onClick={() => void onAskQuestion(prompt)}
                  className="animate-card-in hover-lift rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-left text-[11px] font-semibold hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50 disabled:pointer-events-none disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="grid gap-3">
            {turns.length === 0 && !busy && (
              <div className="card animate-card-in p-5 text-center text-xs text-[var(--muted)]">
                <div className="font-semibold text-[var(--text)]">
                  {lang === 'uz'
                    ? `${activeModelInfo.displayName} tayyor`
                    : lang === 'ru'
                      ? `${activeModelInfo.displayName} готов к работе`
                      : `${activeModelInfo.displayName} is ready`}
                </div>
                <p className="mt-1 mb-0 leading-relaxed">
                  {lang === 'uz'
                    ? 'Joriy ekran konteksti avtomatik uzatiladi. Grafiklar, audit, byudjetlar va 1-klik amallar shu yerda ishlaydi.'
                    : lang === 'ru'
                      ? 'Контекст текущего экрана передаётся автоматически. Графики, карта, аудит, бюджеты и 1-клик действия работают прямо поверх вкладки.'
                      : 'Active screen context is attached automatically. Charts, maps, audit fixes, and budget actions work right on top of your screen.'}
                </p>
              </div>
            )}

            {turns.map(turn => {
              if (turn.role === 'user') {
                return (
                  <div key={turn.id} className="animate-message-in flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-white shadow-xs">
                      {turn.text}
                    </div>
                  </div>
                );
              }

              const resp = turn.response;
              const isCopied = copiedTurnId === turn.id;
              const ratingPending = turn.feedbackStatus === '...';

              return (
                <div key={turn.id} className="card animate-message-in grid gap-2.5 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text)]">
                        {resp?.source === 'coarena'
                          ? `Coarena · ${resp.model}`
                          : lang === 'uz'
                            ? 'Lokal Fallback'
                            : lang === 'ru'
                              ? 'Fallback'
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
                          className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--muted)] tabular-nums"
                        >
                          {tr.tool}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleCopyTurn(turn.id, turn.text)}
                        className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-semibold transition active:scale-95 ${
                          isCopied
                            ? 'animate-scale-in border-[var(--good)] bg-[var(--good-soft)] text-[var(--good)]'
                            : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'
                        }`}
                      >
                        {isCopied
                          ? lang === 'uz'
                            ? '✓'
                            : lang === 'ru'
                              ? '✓ Скопировано'
                              : '✓ Copied'
                          : lang === 'uz'
                            ? 'Nusxa'
                            : lang === 'ru'
                              ? 'Копия'
                              : 'Copy'}
                      </button>

                      {resp && (
                        <>
                          <button
                            type="button"
                            disabled={ratingPending}
                            aria-label="Helpful"
                            onClick={() => void onRateTurn(turn.id, resp.requestId, 'up')}
                            className={`rounded-lg border px-1.5 py-0.5 text-[11px] font-bold transition active:scale-95 disabled:opacity-60 ${
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
                            className={`rounded-lg border px-1.5 py-0.5 text-[11px] font-bold transition active:scale-95 disabled:opacity-60 ${
                              turn.feedback === 'down'
                                ? 'border-[var(--bad)] bg-[var(--bad-soft)] text-[var(--bad)]'
                                : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]'
                            }`}
                          >
                            👎
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {turn.feedbackStatus && (
                    <div className="flex">
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
                    </div>
                  )}

                  <p className="m-0 whitespace-pre-line text-xs leading-relaxed font-medium text-[var(--text)]">
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
                    <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2">
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
                            className={`min-h-0 px-2.5 py-1.5 text-[11px] ${
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
              <div className="card animate-message-in grid gap-2.5 p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="ai-pink-orb animate-orb-breathe flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white">
                    AI
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)]">
                    <span>
                      {lang === 'uz'
                        ? `${activeModelInfo.displayName} ishlamoqda`
                        : lang === 'ru'
                          ? `${activeModelInfo.displayName} думает`
                          : `${activeModelInfo.displayName} is thinking`}
                    </span>
                    <span className="ai-typing-dots" aria-hidden="true">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <div className="skeleton-shimmer h-2.5 w-4/5 rounded-full" />
                  <div className="skeleton-shimmer h-2.5 w-3/5 rounded-full" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Footer Input */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-[var(--border)] bg-[var(--surface)] p-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={
                lang === 'uz'
                  ? 'Savol yozing (Enter — yuborish)...'
                  : lang === 'ru'
                    ? 'Спросите AI Copilot (Enter — отправить)...'
                    : 'Ask AI Copilot (Enter to send)...'
              }
              className="input-field max-h-28 min-h-[36px] flex-1 resize-none py-2 text-xs leading-snug"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="btn-primary min-h-0 shrink-0 px-3.5 py-2 text-xs"
            >
              {busy ? '...' : lang === 'uz' ? 'Yuborish' : lang === 'ru' ? 'Спросить' : 'Send'}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--muted)]">
            <span>
              {lang === 'uz'
                ? 'Tezkor tugmalar: Ctrl+K yoki Alt+A · Yopish: Esc'
                : lang === 'ru'
                  ? 'Горячие клавиши: Ctrl+K или Alt+A · Закрыть: Esc'
                  : 'Shortcuts: Ctrl+K or Alt+A · Close: Esc'}
            </span>
            <span className="font-bold text-[var(--accent)]">{activeModelInfo.id}</span>
          </div>
        </form>
      </aside>
    </div>
  );
}
