import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Language } from '@uzbite/shared';
import { AgentBlocks } from './AgentBlocks';
import { Icon } from './Icon';
import { useAiWorkspace } from '../store/aiWorkspace';
import { useSession } from '../store/session';

const PRIORITY_DATE_PROMPTS: Record<Language, string[]> = {
  ru: [
    'Расходы за 15 ноября',
    'Налоги и электричество за прошлую неделю',
    'Базовые и доп. расходы за прошлую неделю',
  ],
  uz: [
    '15-noyabr xarajatlari',
    'O‘tgan haftadagi soliq va elektr xarajatlari',
    'O‘tgan haftadagi asosiy va qo‘shimcha xarajatlar',
  ],
  en: [
    'Expenses on November 15',
    'Taxes & electricity for last week',
    'Base vs additional expenses for last week',
  ],
};

export function AiCopilotDrawer() {
  const { config, restaurant } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    turns,
    busy,
    actionBusyKey,
    statusBanner,
    selectedModel,
    drawerOpen,
    setDrawerOpen,
    screenMeta,
    askQuestion,
    executeAction,
    rateTurn,
    clearConversation,
    dismissStatusBanner,
    pinBlock,
  } = useAiWorkspace();

  const lang = config.language;
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isOnFullChat = location.pathname === '/ai-chat';

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(focusTimer);
    };
  }, [drawerOpen, setDrawerOpen]);

  useEffect(() => {
    if (drawerOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [drawerOpen, turns.length, busy]);

  if (isOnFullChat) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = input.trim();
    if (!clean || busy) return;
    setInput('');
    await askQuestion(clean);
  }

  const screenPrompts = screenMeta.quickPrompts[lang];
  const combinedPrompts = Array.from(new Set([...PRIORITY_DATE_PROMPTS[lang], ...screenPrompts]));
  const modelLabel = selectedModel === 'gemini-3-8-flash' ? 'Gemini 3.8' : selectedModel;

  return (
    <>
      {/* Slide-Over Copilot Drawer (Triggered cleanly via Header AI pill or Ctrl+K) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/35 backdrop-blur-[2px] transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          <aside
            className="relative z-10 flex h-full w-full max-w-[490px] flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl"
            aria-label="UzBite AI Copilot Drawer"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="ai-pink-orb animate-orb-breathe flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
                  <Icon name="sparkles" size={16} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">
                      {lang === 'uz'
                        ? 'UzBite AI Copilot'
                        : lang === 'ru'
                          ? 'AI-Ассистент UzBite'
                          : 'UzBite AI Copilot'}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                      {modelLabel}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] font-semibold text-[var(--muted)]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--good)]" />
                    <span className="truncate">
                      {lang === 'uz'
                        ? `Joriy ekran: ${screenMeta.title.uz}`
                        : lang === 'ru'
                          ? `Текущий экран: ${screenMeta.title.ru}`
                          : `Current screen: ${screenMeta.title.en}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    navigate('/ai-chat');
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  title={
                    lang === 'uz'
                      ? 'To‘liq ekranga ochish'
                      : lang === 'ru'
                        ? 'Развернуть на весь экран'
                        : 'Expand to full screen'
                  }
                >
                  <Icon name="expand" size={14} />
                </button>
                {turns.length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={clearConversation}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] transition hover:border-[var(--bad)] hover:text-[var(--bad)]"
                    title={lang === 'ru' ? 'Очистить чат' : 'Clear chat'}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                  title="Esc"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            </div>

            {/* Context-Aware Quick Suggestions Strip */}
            <div className="border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                <span>
                  {lang === 'uz'
                    ? 'Ekran bo‘yicha tezkor savollar'
                    : lang === 'ru'
                      ? 'Подсказки для текущего экрана'
                      : 'Suggestions for this screen'}
                </span>
                <span className="truncate font-semibold normal-case text-[var(--muted)]">
                  {restaurant?.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {combinedPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={busy}
                    onClick={() => void askQuestion(prompt)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-left text-[11px] font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50 hover:text-[var(--accent)] disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Banner */}
            {statusBanner && (
              <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--good)]/40 bg-[var(--good-soft)] px-3 py-2 text-[11px] font-bold text-[var(--good)]">
                <span className="truncate">{statusBanner}</span>
                <button
                  type="button"
                  onClick={dismissStatusBanner}
                  className="shrink-0 opacity-75 hover:opacity-100"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            )}

            {/* Shared Live Conversation Stream */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {turns.length === 0 ? (
                <div className="card grid gap-2.5 p-5 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Icon name="bot" size={22} />
                  </div>
                  <div className="text-sm font-semibold">
                    {lang === 'uz'
                      ? 'Savolingizni yozing yoki yuqoridagi ssenariyni tanlang'
                      : lang === 'ru'
                        ? 'Задайте вопрос по ресторану или выберите подсказку'
                        : 'Ask anything about your restaurant or pick a suggestion'}
                  </div>
                  <p className="m-0 text-xs leading-relaxed text-[var(--muted)]">
                    {lang === 'uz'
                      ? 'AI joriy ekraningizni tushunadi, jonli buyurtma va moliya ma’lumotlarini tekshiradi hamda bo‘limlarni boshqaradi.'
                      : lang === 'ru'
                        ? 'AI видит текущий экран, работает с живыми заказами, кейсами #24–#26, картой Ташкента и управляет разделами.'
                        : 'AI sees your active screen, queries live orders, Cases #24–#26, Tashkent map, and navigates or builds dashboards.'}
                  </p>
                </div>
              ) : (
                turns.map(turn => {
                  if (turn.role === 'user') {
                    return (
                      <div key={turn.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)] px-3.5 py-2.5 text-xs font-bold text-white">
                          {turn.text}
                        </div>
                      </div>
                    );
                  }

                  const resp = turn.response;
                  return (
                    <div
                      key={turn.id}
                      className={`card grid gap-2.5 p-3.5 ${
                        turn.error ? 'border-[var(--bad)]/40 bg-[var(--bad-soft)]/30' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text)]">
                            {resp?.source === 'coarena'
                              ? `Coarena · ${resp.model}`
                              : resp?.model ?? 'UzBite AI'}
                          </span>
                          {turn.latencyMs !== undefined && (
                            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] tabular-nums">
                              {turn.latencyMs} ms
                            </span>
                          )}
                        </div>

                        {resp && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void rateTurn(turn.id, 'up')}
                              aria-label="Helpful"
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${
                                turn.feedback === 'up'
                                  ? 'border-[var(--good)] bg-[var(--good-soft)] text-[var(--good)]'
                                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--good)]'
                              }`}
                            >
                              <Icon name="thumbUp" size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void rateTurn(turn.id, 'down')}
                              aria-label="Not helpful"
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${
                                turn.feedback === 'down'
                                  ? 'border-[var(--bad)] bg-[var(--bad-soft)] text-[var(--bad)]'
                                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--bad)]'
                              }`}
                            >
                              <Icon name="thumbDown" size={11} />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="text-xs leading-relaxed font-medium whitespace-pre-wrap text-[var(--text)]">
                        {turn.text}
                      </div>

                      {resp && resp.uiBlocks.length > 0 && (
                        <AgentBlocks
                          blocks={resp.uiBlocks}
                          lang={lang}
                          onAction={act => void executeAction(act)}
                          onPinBlock={pinBlock}
                          actionBusyKey={actionBusyKey}
                        />
                      )}

                      {resp && resp.suggestedActions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)]/70 pt-2">
                          {resp.suggestedActions.map((act, idx) => (
                            <button
                              key={`${act.type}-${idx}`}
                              type="button"
                              disabled={Boolean(actionBusyKey)}
                              onClick={() => void executeAction(act)}
                              className="btn-primary min-h-0 px-2.5 py-1.5 text-[11px]"
                            >
                              <Icon name="zap" size={12} />
                              <span>{act.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {busy && (
                <div className="card flex items-center gap-2.5 border-[var(--accent)]/40 bg-[var(--accent-soft)]/35 p-3 text-xs font-bold text-[var(--accent)]">
                  <Icon name="sparkles" size={15} className="animate-pulse" />
                  <span>
                    {lang === 'uz'
                      ? 'Gemini 3.8 Flash tahlil qilmoqda…'
                      : lang === 'ru'
                        ? 'Gemini 3.8 Flash анализирует данные…'
                        : 'Gemini 3.8 Flash is thinking…'}
                  </span>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Bottom Input Composer */}
            <form
              onSubmit={e => void handleSubmit(e)}
              className="border-t border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  className="input-field min-h-[38px] flex-1 py-2 text-xs"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={
                    lang === 'uz'
                      ? 'Savol yozing…'
                      : lang === 'ru'
                        ? 'Напишите команду или вопрос…'
                        : 'Ask a question or give a command…'
                  }
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="btn-primary min-h-[38px] shrink-0 px-3.5 text-xs"
                >
                  <Icon name="send" size={14} />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-[var(--muted)]">
                <span>Ctrl+K / Alt+A</span>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    navigate('/ai-chat');
                  }}
                  className="font-bold text-[var(--accent)] hover:underline"
                >
                  {lang === 'uz'
                    ? 'To‘liq AI-Chatga o‘tish →'
                    : lang === 'ru'
                      ? 'Открыть полный AI-Чат →'
                      : 'Open full AI Chat →'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
