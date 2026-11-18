import { useEffect, useRef, useState, type FormEvent } from 'react';
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
      'Что сейчас на моём экране и какие главные выводы?',
      'Создай кастомный дашборд по коммунальным и аренде',
      'Какие главные риски и потенциал экономии за период?',
    ],
    uz: [
      'Hozirgi ekranda nimalar ko‘rinib turibdi va asosiy xulosa nima?',
      'Kommunal va ijara bo‘yicha maxsus dashboard yarat',
      'Asosiy moliyaviy xavflar va tejamkorlik salohiyati qancha?',
    ],
    en: [
      'What is on my current screen and what are the top takeaways?',
      'Create a custom dashboard for utilities and rent costs',
      'What are the top financial risks and savings opportunities?',
    ],
  },
  audit: {
    ru: [
      'Найди ошибки учёта, дубликаты и способы сократить расходы',
      'Какие статьи расходов выросли аномально и как их исправить?',
      'Сколько можно сэкономить на свете, связи и поставщиках?',
    ],
    uz: [
      'Hisob xatolari, dublikatlar va xarajatlarni qisqartirish yo‘llarini top',
      'Qaysi xarajatlar keskin oshgan va qanday tuzatish kerak?',
      'Elektr, aloqa va yetkazib beruvchilardan qancha tejash mumkin?',
    ],
    en: [
      'Find accounting errors, duplicates, and ways to cut costs',
      'Which expense anomalies should I fix first?',
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
      'Найди дубликаты накладных и несоответствия сумм в расходах',
      'Разбери структуру операционных расходов и главные драйверы роста',
      'Где можно быстро сократить административные и коммунальные траты?',
    ],
    uz: [
      'Xarajatlarda dublikat fakturalar va summa xatolarini top',
      'Operatsion xarajatlar tarkibi va o‘sish sabablarini tahlil qil',
      'Kommunal va ma’muriy xarajatlarni qayerda tez qisqartirish mumkin?',
    ],
    en: [
      'Find duplicate invoices and amount mismatches in expenses',
      'Break down operating expense structure and cost drivers',
      'Where can we quickly cut utility and administrative spend?',
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
  onAskQuestion: (question: string) => Promise<void>;
  onClearConversation: () => void;
  onRateTurn: (turnId: string, requestId: string, rating: 'up' | 'down') => Promise<void>;
  onExecuteAction: (action: AgentClientAction) => Promise<string | void>;
  onPinBlock: (block: AgentUiBlock) => void;
}) {
  const [input, setInput] = useState('');
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = input.trim();
    if (!clean || busy) return;
    setInput('');
    await onAskQuestion(clean);
  }

  async function handleActionClick(action: AgentClientAction) {
    const key = `${action.type}:${action.label}`;
    setActionBusyKey(key);
    try {
      const msg = await onExecuteAction(action);
      if (msg) onStatusBanner(msg);
    } finally {
      setActionBusyKey(null);
    }
  }

  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close AI Copilot"
        onClick={onClose}
        className="fixed inset-0 bg-black/25 backdrop-blur-[1px] transition-opacity"
      />

      {/* Slide-over Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="AI Copilot"
        className="relative z-50 flex h-full w-full max-w-[540px] flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex flex-col gap-2.5 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-extrabold text-white">
                AI
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-extrabold tracking-tight">AI Copilot</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--accent)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    {activeModelInfo.displayName}
                  </span>
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
                onClick={onClearConversation}
                className="btn-secondary min-h-0 px-2 py-1.5 text-[11px]"
                title={lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить чат' : 'Clear chat'}
              >
                {lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить' : 'Clear'}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="btn-secondary min-h-0 px-2.5 py-1.5 text-xs font-extrabold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Active Screen Context + Model Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px]">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--accent)]">
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
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-extrabold text-[var(--text)] outline-none"
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
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--good)] bg-[var(--good-soft)] px-3 py-2 text-xs font-bold text-[var(--good)]">
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
            <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
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
                  onClick={() => void onAskQuestion(prompt)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-left text-[11px] font-semibold transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="grid gap-3">
            {turns.length === 0 && (
              <div className="card p-5 text-center text-xs text-[var(--muted)]">
                <div className="font-extrabold text-[var(--text)]">
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
                  <div key={turn.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-white shadow-xs">
                      {turn.text}
                    </div>
                  </div>
                );
              }

              const resp = turn.response;
              return (
                <div key={turn.id} className="card grid gap-2.5 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--text)]">
                        {resp?.source === 'coarena' ? `Coarena · ${resp.model}` : 'Deterministic Fallback'}
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

                    {resp && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void onRateTurn(turn.id, resp.requestId, 'up')}
                          className={`rounded-lg border px-1.5 py-0.5 text-[11px] font-bold ${
                            turn.feedback === 'up'
                              ? 'border-[var(--good)] bg-[var(--good-soft)] text-[var(--good)]'
                              : 'border-[var(--border)] bg-[var(--surface-2)]'
                          }`}
                        >
                          👍
                        </button>
                        <button
                          type="button"
                          onClick={() => void onRateTurn(turn.id, resp.requestId, 'down')}
                          className={`rounded-lg border px-1.5 py-0.5 text-[11px] font-bold ${
                            turn.feedback === 'down'
                              ? 'border-[var(--bad)] bg-[var(--bad-soft)] text-[var(--bad)]'
                              : 'border-[var(--border)] bg-[var(--surface-2)]'
                          }`}
                        >
                          👎
                        </button>
                      </div>
                    )}
                  </div>

                  {turn.feedbackStatus && (
                    <div className="text-[10px] font-semibold text-[var(--muted)]">{turn.feedbackStatus}</div>
                  )}

                  <p className="m-0 whitespace-pre-line text-xs leading-relaxed font-medium text-[var(--text)]">
                    {turn.text}
                  </p>

                  {resp && resp.uiBlocks.length > 0 && (
                    <AgentBlocks
                      blocks={resp.uiBlocks}
                      lang={lang}
                      onAction={act => void handleActionClick(act)}
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
                      {resp.suggestedActions.map((act, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={Boolean(actionBusyKey)}
                          onClick={() => void handleActionClick(act)}
                          className="btn-primary min-h-0 px-2.5 py-1.5 text-[11px]"
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {busy && (
              <div className="card p-3.5 text-xs font-bold text-[var(--accent)]">
                {lang === 'uz'
                  ? `${activeModelInfo.displayName} MCP vositalarini ishga tushirmoqda...`
                  : lang === 'ru'
                    ? `${activeModelInfo.displayName} запускает MCP-инструменты и готовит ответ...`
                    : `${activeModelInfo.displayName} is running MCP tools and synthesizing...`}
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
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              className="input-field min-h-0 flex-1 py-2 text-xs"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                lang === 'uz'
                  ? 'Savol yozing (audit, byudjet, xarita, filiallar, dashboard)...'
                  : lang === 'ru'
                    ? 'Спросите AI Copilot (бюджет, аудит, карта, дашборд)...'
                    : 'Ask AI Copilot (budgets, audit, map, branches, dashboard)...'
              }
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
