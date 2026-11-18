import { useState, type FormEvent, type RefObject } from 'react';
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
    { tag: '#26 Audit', text: 'Xatolarni, dublikatlarni va kommunal xarajatlarni qisqartirish yo‘llarini ko‘rsat' },
    { tag: '#25 Byudjet', text: 'Qaysi moddalar byudjet limitidan oshib ketishi mumkin va sababi nima?' },
    { tag: '#24 Filiallar', text: '120 mln so‘m byudjetni filiallar o‘rtasida optimal taqsimlab ber' },
    { tag: 'Xarita', text: 'Eng ko‘p mijozlar qaysi tumanlardan kelmoqda va qayerda yetkazish zararli?' },
    { tag: 'Ssenariy', text: 'Elektr tarifi +20% va mahsulot narxi +10% oshsa foyda qanday o‘zgaradi?' },
    { tag: 'Dashboard', text: 'Kommunal va ijara xarajatlari bo‘yicha maxsus dashboard yarat' },
    { tag: 'Ekran', text: 'Hozirgi ekranda nimalar ko‘rinib turibdi va asosiy xulosa nima?' },
    { tag: 'Boshqaruv', text: 'Byudjetlar bo‘limini och va xavfli moddalarni ko‘rsat' },
  ],
  ru: [
    { tag: '#26 Аудит', text: 'Найди ошибки учёта, дубликаты и способы сократить расходы на свет и связь' },
    { tag: '#25 Бюджет', text: 'Какие статьи превысят бюджет до конца месяца и почему?' },
    { tag: '#24 Филиалы', text: 'Распредели 120 млн UZS оптимально между всеми филиалами по ROI и спросу' },
    { tag: 'Карта', text: 'Из каких районов Ташкента приходит больше всего заказов и где доставка убыточна?' },
    { tag: 'Сценарий', text: 'Смоделируй рост тарифов на свет +20% и цен на сырьё +10%' },
    { tag: 'Дашборд', text: 'Создай кастомный дашборд по коммунальным расходам и аренде' },
    { tag: 'Экран', text: 'Что сейчас на моём экране и какие главные выводы?' },
    { tag: 'Управление', text: 'Открой вкладку бюджетов и подсвети риски' },
  ],
  en: [
    { tag: '#26 Audit', text: 'Find accounting errors, duplicates, and ways to cut utility & admin costs' },
    { tag: '#25 Budget', text: 'Which budget categories will breach their limits this month and why?' },
    { tag: '#24 Branches', text: 'Optimally allocate 120M UZS across all branches by ROI and demand' },
    { tag: 'Map', text: 'Which Tashkent districts generate the most orders and where is delivery unprofitable?' },
    { tag: 'What-If', text: 'Simulate +20% utility tariff hike and +10% ingredient inflation' },
    { tag: 'Dashboard', text: 'Create a custom dashboard for utilities and rent costs' },
    { tag: 'Screen', text: 'What is on my current screen and what should I focus on?' },
    { tag: 'Control', text: 'Open the budgets tab and highlight at-risk categories' },
  ],
};

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
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [input, setInput] = useState('');
  const [showMcp, setShowMcp] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);

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

  const prompts = QUICK_PROMPTS[lang];

  return (
    <div className="grid gap-4">
      {/* Header Banner */}
      <div className="card flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-extrabold text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {activeModelInfo.displayName} ({activeModelInfo.id})
            </span>
            <span className="rounded-full bg-[var(--good-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--good)]">
              MCP Tools: {mcpQuery.data?.length ?? 9}
            </span>
            {modelsConfigured === false && (
              <span className="rounded-full bg-[var(--warn-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--warn)]">
                Local Fallback Mode
              </span>
            )}
            <span className="text-[11px] font-semibold text-[var(--muted)]">{restaurantName}</span>
          </div>
          <h1 className="m-0 mt-1.5 text-base font-extrabold">
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
          <label className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
              {lang === 'uz' ? 'Model' : lang === 'ru' ? 'Модель' : 'Model'}
            </span>
            <select
              aria-label="AI Model"
              value={selectedModel}
              disabled={busy}
              onChange={e => onSelectModel(e.target.value)}
              className="bg-transparent text-xs font-extrabold text-[var(--text)] outline-none"
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
            onClick={onClearConversation}
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
        <div className="card grid grid-cols-1 gap-2.5 p-4 md:grid-cols-2">
          {mcpQuery.data.map(tool => (
            <div key={tool.name} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-extrabold text-[var(--accent)]">{tool.name}</code>
                <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--muted)]">
                  {tool.category}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{tool.description}</p>
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
            onClick={() => void onAskQuestion(p.text)}
            className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left text-xs font-semibold transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50 disabled:opacity-50"
          >
            <span className="mt-0.5 shrink-0 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--accent)]">
              {p.tag}
            </span>
            <span className="line-clamp-2 leading-snug">{p.text}</span>
          </button>
        ))}
      </div>

      {statusBanner && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--good)] bg-[var(--good-soft)] px-4 py-2.5 text-xs font-bold text-[var(--good)]">
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
        {turns.length === 0 && (
          <div className="card p-8 text-center text-xs text-[var(--muted)]">
            {lang === 'uz'
              ? 'Yuqoridagi tezkor savollardan birini bosing yoki moliyaviy savolingizni yozing.'
              : lang === 'ru'
                ? 'Выберите быстрый сценарий выше или задайте любой вопрос по финансам, бюджетам, филиалам или карте Ташкента.'
                : 'Click a quick prompt above or ask any question about budgets, cost savings, branches, or Tashkent districts.'}
          </div>
        )}

        {turns.map(turn => {
          if (turn.role === 'user') {
            return (
              <div key={turn.id} className="flex justify-end">
                <div className="max-w-2xl rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-xs font-bold text-white shadow-xs">
                  {turn.text}
                </div>
              </div>
            );
          }

          const resp = turn.response;
          return (
            <div key={turn.id} className="card grid gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[10px] font-extrabold text-[var(--text)]">
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
                      className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)] tabular-nums"
                    >
                      {tr.tool} ({tr.durationMs}ms)
                    </span>
                  ))}
                </div>

                {resp && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void onRateTurn(turn.id, resp.requestId, 'up')}
                      className={`rounded-lg border px-2 py-1 text-xs font-bold ${
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
                      className={`rounded-lg border px-2 py-1 text-xs font-bold ${
                        turn.feedback === 'down'
                          ? 'border-[var(--bad)] bg-[var(--bad-soft)] text-[var(--bad)]'
                          : 'border-[var(--border)] bg-[var(--surface-2)]'
                      }`}
                    >
                      👎
                    </button>
                    {turn.feedbackStatus && (
                      <span className="text-[10px] font-semibold text-[var(--muted)]">{turn.feedbackStatus}</span>
                    )}
                  </div>
                )}
              </div>

              <p className="m-0 whitespace-pre-line text-sm leading-relaxed font-medium text-[var(--text)]">
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
                <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-2.5 sm:flex-row sm:flex-wrap">
                  {resp.suggestedActions.map((act, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={Boolean(actionBusyKey)}
                      onClick={() => void handleActionClick(act)}
                      className="btn-primary min-h-0 w-full justify-center px-3 py-2 text-xs sm:w-auto sm:py-1.5"
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
          <div className="card p-4 text-xs font-bold text-[var(--accent)]">
            {lang === 'uz'
              ? `AI agent MCP vositalarini va ${activeModelInfo.displayName} tahlilini ishga tushirmoqda...`
              : lang === 'ru'
                ? `AI-агент запускает MCP-инструменты и синтезирует ответ в ${activeModelInfo.displayName}...`
                : `AI Agent is running MCP tools and synthesizing with ${activeModelInfo.displayName}...`}
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="card sticky bottom-3 flex flex-col gap-2 p-3 shadow-sm sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="text"
          className="input-field flex-1"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={
            lang === 'uz'
              ? 'Savol bering (masalan: Chilonzor tumani natijalari, byudjet prognozi, filiallar)...'
              : lang === 'ru'
                ? 'Спросите AI-агента (бюджеты, экономия, районы карты, дашборд, открой вкладку)...'
                : 'Ask AI Finance Agent (budgets, cost cuts, districts map, custom dashboard, navigate)...'
          }
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn-primary w-full shrink-0 sm:w-auto">
          {busy ? '...' : lang === 'uz' ? 'Yuborish' : lang === 'ru' ? 'Спросить' : 'Send'}
        </button>
      </form>
    </div>
  );
}
