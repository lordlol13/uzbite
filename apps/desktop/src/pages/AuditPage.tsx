import { useState } from 'react';
import type {
  AiOptimizationReport,
  BusinessAnalysisResponse,
  ExpenseCategory,
  Finding,
  FindingKind,
  Language,
} from '@uzbite/shared';
import {
  EmptyStateCard,
  IconCheck,
  IconSearch,
  IconSparkles,
  IconSpinner,
  IconX,
} from '../components/DesignWidgets';
import { deleteExpense, triggerAiSummary, updateExpense } from '../lib/api';
import { CATEGORY_LABELS, COPY, fmtMoney } from '../lib/i18n';

const KIND_LABELS: Record<FindingKind, Record<Language, string>> = {
  ERROR: { ru: 'Ошибка', uz: 'Xato', en: 'Error' },
  INEFFICIENCY: { ru: 'Неэффективно', uz: 'Samarasiz', en: 'Inefficiency' },
  RISK: { ru: 'Риск', uz: 'Xavf', en: 'Risk' },
};

const PRIORITY_LABELS: Record<'high' | 'medium' | 'low', Record<Language, string>> = {
  high: { ru: 'Высокий', uz: 'Yuqori', en: 'High' },
  medium: { ru: 'Средний', uz: 'O‘rta', en: 'Medium' },
  low: { ru: 'Низкий', uz: 'Past', en: 'Low' },
};

export function AuditPage({
  lang,
  from,
  to,
  analysis,
  aiReportOverride,
  onAiReport,
  onMutated,
}: {
  lang: Language;
  from: string;
  to: string;
  analysis: BusinessAnalysisResponse;
  aiReportOverride: AiOptimizationReport | null;
  onAiReport: (report: AiOptimizationReport) => void;
  onMutated: () => Promise<void>;
}) {
  const t = COPY[lang];
  const [filter, setFilter] = useState<'ALL' | FindingKind>('ALL');
  const [search, setSearch] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const report = aiReportOverride ?? analysis.report;
  const q = search.trim().toLowerCase();
  const findings = analysis.findings.filter(f => {
    if (filter !== 'ALL' && f.kind !== filter) return false;
    if (!q) return true;
    return (
      f.title[lang].toLowerCase().includes(q) ||
      f.detail[lang].toLowerCase().includes(q) ||
      f.code.toLowerCase().includes(q) ||
      (f.category ? CATEGORY_LABELS[f.category][lang].toLowerCase().includes(q) : false)
    );
  });

  const scorePct = Math.max(0, Math.min(100, report.healthScore));
  const ringR = 36;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc * (1 - scorePct / 100);
  const scoreColor =
    scorePct >= 75 ? 'var(--good)' : scorePct >= 50 ? 'var(--warn)' : 'var(--bad)';

  async function handleRunAi() {
    setAiBusy(true);
    setFeedback(null);
    try {
      const res = await triggerAiSummary(from, to);
      onAiReport(res.report);
      setFeedback({
        tone: 'good',
        text:
          lang === 'uz'
            ? 'AI-hisobot yangilandi'
            : lang === 'ru'
              ? 'AI-отчёт успешно обновлён'
              : 'AI audit report refreshed',
      });
    } catch (err) {
      setFeedback({
        tone: 'bad',
        text: err instanceof Error ? err.message : 'AI summary failed',
      });
    } finally {
      setAiBusy(false);
    }
  }

  async function handleFixDuplicate(f: Finding) {
    const dupId = typeof f.metrics?.duplicateExpenseId === 'string'
      ? f.metrics.duplicateExpenseId
      : f.expenseIds?.[f.expenseIds.length - 1];
    if (!dupId) return;
    setActionBusyId(f.id);
    setFeedback(null);
    try {
      await deleteExpense(dupId);
      await onMutated();
      setFeedback({ tone: 'good', text: `${f.code}: ${t.fixDeleteDup} ✓` });
    } catch (err) {
      setFeedback({ tone: 'bad', text: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleFixMismatch(f: Finding) {
    const expId = f.expenseIds?.[0];
    const expected = Number(f.metrics?.expectedAmount);
    if (!expId || !Number.isFinite(expected) || expected <= 0) return;
    setActionBusyId(f.id);
    setFeedback(null);
    try {
      await updateExpense(expId, { amount: expected, isVerified: true });
      await onMutated();
      setFeedback({ tone: 'good', text: `${f.code}: ${fmtMoney(expected, lang)} ✓` });
    } catch (err) {
      setFeedback({ tone: 'bad', text: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleFixCategory(f: Finding) {
    const expId = f.expenseIds?.[0];
    const suggested = f.metrics?.suggestedCategory as ExpenseCategory | undefined;
    if (!expId || !suggested) return;
    setActionBusyId(f.id);
    setFeedback(null);
    try {
      await updateExpense(expId, { category: suggested, isVerified: true });
      await onMutated();
      setFeedback({ tone: 'good', text: `${f.code}: → ${CATEGORY_LABELS[suggested][lang]} ✓` });
    } catch (err) {
      setFeedback({ tone: 'bad', text: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div className="animate-page-enter grid gap-5">
      {/* Top AI Summary & Health Gauge */}
      <div className="card animate-card-in stagger-1 relative overflow-hidden p-6">
        <div className="ai-grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-44" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative flex h-[86px] w-[86px] shrink-0 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-xs">
              <svg viewBox="0 0 84 84" className="absolute inset-0 h-full w-full -rotate-90 p-1">
                <circle
                  cx="42"
                  cy="42"
                  r={ringR}
                  fill="none"
                  stroke="var(--surface-2)"
                  strokeWidth="5"
                />
                <circle
                  cx="42"
                  cy="42"
                  r={ringR}
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={ringCirc}
                  strokeDashoffset={ringOffset}
                  style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }}
                />
              </svg>
              <span className="ai-pink-orb animate-orb-breathe absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full" />
              <div className="relative flex flex-col items-center">
                <span className="text-xl font-semibold leading-none tabular-nums text-[var(--text)]">
                  {report.healthScore}
                </span>
                <span className="mt-0.5 text-[9.5px] font-medium uppercase text-[var(--muted)]">/ 100</span>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                  <IconSparkles size={11} />
                  {report.source === 'gemini' ? 'Gemini AI + Statistical Audit' : 'AI Heuristic + Statistical Audit'}
                </span>
              </div>
              <h1 className="m-0 mt-1.5 text-lg font-medium tracking-tight text-[var(--text)]">
                {report.statusLabel[lang]}
              </h1>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--muted)]">
                {report.executiveSummary[lang]}
              </p>
            </div>
          </div>

          <button type="button" disabled={aiBusy} onClick={handleRunAi} className="btn-primary shrink-0">
            {aiBusy ? <IconSpinner size={14} /> : <IconSparkles size={14} />}
            {aiBusy ? t.runningAi : t.runAiAudit}
          </button>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="animate-card-in stagger-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 transition-transform duration-200 hover:-translate-y-0.5">
            <div className="text-[11px] font-medium text-[var(--muted)]">{t.potentialSaving}</div>
            <div className="mt-1 text-base font-semibold text-[var(--accent)] tabular-nums">
              {fmtMoney(report.totalPotentialSavingUZS, lang)}
            </div>
          </div>
          <div className="animate-card-in stagger-3 rounded-xl border border-[var(--bad)]/20 bg-[var(--bad-soft)] p-3.5 transition-transform duration-200 hover:-translate-y-0.5">
            <div className="text-[11px] font-medium text-[var(--bad)]">{t.errors}</div>
            <div className="mt-1 text-base font-semibold text-[var(--bad)] tabular-nums">{report.errorCount}</div>
          </div>
          <div className="animate-card-in stagger-4 rounded-xl border border-[var(--warn)]/20 bg-[var(--warn-soft)] p-3.5 transition-transform duration-200 hover:-translate-y-0.5">
            <div className="text-[11px] font-medium text-[var(--warn)]">{t.inefficiencies}</div>
            <div className="mt-1 text-base font-semibold text-[var(--warn)] tabular-nums">{report.inefficiencyCount}</div>
          </div>
          <div className="animate-card-in stagger-5 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-soft)] p-3.5 transition-transform duration-200 hover:-translate-y-0.5">
            <div className="text-[11px] font-medium text-[var(--accent)]">{t.risks}</div>
            <div className="mt-1 text-base font-semibold text-[var(--accent)] tabular-nums">{report.riskCount}</div>
          </div>
        </div>
      </div>

      {/* Prioritized AI Recommendations */}
      {report.recommendations.length > 0 && (
        <div className="card animate-card-in stagger-2 p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-semibold text-[var(--text)]">{t.aiRecommendations}</h2>
            <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--muted)]">
              {report.recommendations.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {report.recommendations.map((rec, idx) => (
              <div
                key={rec.id}
                style={{ '--stagger': Math.min(idx + 1, 8) } as React.CSSProperties}
                className="animate-card-in hover-lift rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/70 p-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      rec.priority === 'high'
                        ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                        : rec.priority === 'medium'
                          ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                          : 'bg-[var(--good-soft)] text-[var(--good)]'
                    }`}
                  >
                    {PRIORITY_LABELS[rec.priority][lang]}
                  </span>
                  <span className="text-xs font-semibold text-[var(--good)] tabular-nums">
                    {t.expectedSaving}: {fmtMoney(rec.expectedSavingUZS, lang)}
                  </span>
                </div>
                <div className="mt-2 text-sm font-bold text-[var(--text)]">{rec.title[lang]}</div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{rec.action[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings Filter & List */}
      <div className="card animate-card-in stagger-3 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              ['ALL', `${t.all} (${analysis.findings.length})`],
              ['ERROR', `${t.errors} (${report.errorCount})`],
              ['INEFFICIENCY', `${t.inefficiencies} (${report.inefficiencyCount})`],
              ['RISK', `${t.risks} (${report.riskCount})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all duration-150 ${
                  filter === key
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--border-strong)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <IconSearch
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              />
              <input
                type="search"
                className="input-field min-h-[34px] w-56 pl-8 py-1 text-xs"
                placeholder={t.search}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {feedback && (
              <div
                className={`animate-scale-in inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  feedback.tone === 'good'
                    ? 'bg-[var(--good-soft)] text-[var(--good)]'
                    : 'bg-[var(--bad-soft)] text-[var(--bad)]'
                }`}
              >
                {feedback.tone === 'good' && <IconCheck size={12} />}
                <span>{feedback.text}</span>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  aria-label="Dismiss"
                  className="ml-0.5 opacity-70 hover:opacity-100"
                >
                  <IconX size={11} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          {findings.map((f, idx) => {
            const busy = actionBusyId === f.id;
            return (
              <div
                key={f.id}
                style={{ '--stagger': Math.min(idx + 1, 8) } as React.CSSProperties}
                className="animate-card-in rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/70 p-4 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          f.kind === 'ERROR'
                            ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                            : f.kind === 'INEFFICIENCY'
                              ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                              : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        }`}
                      >
                        {KIND_LABELS[f.kind][lang]}
                      </span>
                      <span className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                        {f.code}
                      </span>
                      {f.category && (
                        <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                          {CATEGORY_LABELS[f.category][lang]}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-[var(--text)]">{f.title[lang]}</span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-[var(--text)]">{f.detail[lang]}</p>
                    <p className="mt-1.5 text-xs font-semibold text-[var(--good)]">→ {f.recommendation[lang]}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="text-right tabular-nums">
                      <div className="text-[10px] font-semibold text-[var(--muted)]">{t.impact}</div>
                      <div className="text-base font-semibold text-[var(--bad)]">{fmtMoney(f.amountImpact, lang)}</div>
                    </div>

                    {f.code === 'DUPLICATE_INVOICE' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleFixDuplicate(f)}
                        className="btn-secondary text-xs"
                      >
                        {busy && <IconSpinner size={12} />}
                        {t.fixDeleteDup}
                      </button>
                    )}

                    {f.code === 'AMOUNT_MISMATCH' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleFixMismatch(f)}
                        className="btn-secondary text-xs"
                      >
                        {busy && <IconSpinner size={12} />}
                        {t.fixMismatch}
                      </button>
                    )}

                    {f.code === 'CATEGORY_MISMATCH' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleFixCategory(f)}
                        className="btn-secondary text-xs"
                      >
                        {busy && <IconSpinner size={12} />}
                        {t.fixCategory}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {findings.length === 0 && (
            <EmptyStateCard
              icon={<IconCheck size={18} className="text-[var(--good)]" />}
              title={
                lang === 'uz'
                  ? 'Topilmalar yo‘q'
                  : lang === 'ru'
                    ? 'Находок не обнаружено'
                    : 'No matching findings'
              }
              description={
                filter !== 'ALL' || search.trim()
                  ? lang === 'uz'
                    ? 'Filtrni yoki qidiruv so‘rovini o‘zgartirib ko‘ring.'
                    : lang === 'ru'
                      ? 'Попробуйте сбросить фильтр или изменить поисковый запрос.'
                      : 'Try clearing the active filter or search query.'
                  : lang === 'uz'
                    ? 'Tanlangan davrda moliyaviy xato va xavflar topilmadi.'
                    : lang === 'ru'
                      ? 'За выбранный период ошибок и рисков не найдено.'
                      : 'No accounting errors or budget risks found in this period.'
              }
              actionLabel={
                filter !== 'ALL' || search.trim()
                  ? lang === 'uz'
                    ? 'Filtrlarni tozalash'
                    : lang === 'ru'
                      ? 'Сбросить фильтры'
                      : 'Clear filters'
                  : undefined
              }
              onAction={
                filter !== 'ALL' || search.trim()
                  ? () => {
                      setFilter('ALL');
                      setSearch('');
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
