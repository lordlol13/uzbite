import { useState } from 'react';
import type {
  AiOptimizationReport,
  BusinessAnalysisResponse,
  ExpenseCategory,
  Finding,
  FindingKind,
  Language,
} from '@uzbite/shared';
import { deleteExpense, triggerAiSummary, updateExpense } from '../lib/api';
import { CATEGORY_LABELS, COPY, fmtMoney } from '../lib/i18n';

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
  const [aiBusy, setAiBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const report = aiReportOverride ?? analysis.report;
  const findings = analysis.findings.filter(f => (filter === 'ALL' ? true : f.kind === filter));

  async function handleRunAi() {
    setAiBusy(true);
    setActionMessage(null);
    try {
      const res = await triggerAiSummary(from, to);
      onAiReport(res.report);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'AI summary failed');
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
    try {
      await deleteExpense(dupId);
      await onMutated();
      setActionMessage(`${f.code}: OK`);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleFixMismatch(f: Finding) {
    const expId = f.expenseIds?.[0];
    const expected = Number(f.metrics?.expectedAmount);
    if (!expId || !Number.isFinite(expected) || expected <= 0) return;
    setActionBusyId(f.id);
    try {
      await updateExpense(expId, { amount: expected, isVerified: true });
      await onMutated();
      setActionMessage(`${f.code}: ${fmtMoney(expected, lang)}`);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleFixCategory(f: Finding) {
    const expId = f.expenseIds?.[0];
    const suggested = f.metrics?.suggestedCategory as ExpenseCategory | undefined;
    if (!expId || !suggested) return;
    setActionBusyId(f.id);
    try {
      await updateExpense(expId, { category: suggested, isVerified: true });
      await onMutated();
      setActionMessage(`${f.code}: → ${CATEGORY_LABELS[suggested][lang]}`);
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div className="grid gap-5">
      {/* Top AI Summary & Health Gauge */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <span className="text-2xl font-extrabold leading-none tabular-nums">{report.healthScore}</span>
              <span className="mt-1 text-[10px] font-bold uppercase">/ 100</span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--muted)]">
                  Engine: {report.source === 'gemini' ? 'Gemini AI + Statistical Audit' : 'AI Heuristic + Statistical Audit'}
                </span>
              </div>
              <h1 className="m-0 mt-1.5 text-lg font-extrabold">{report.statusLabel[lang]}</h1>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--muted)]">
                {report.executiveSummary[lang]}
              </p>
            </div>
          </div>

          <button type="button" disabled={aiBusy} onClick={handleRunAi} className="btn-primary shrink-0">
            {aiBusy ? t.runningAi : t.runAiAudit}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-[var(--surface-2)] p-3">
            <div className="text-[11px] font-semibold text-[var(--muted)]">{t.potentialSaving}</div>
            <div className="mt-1 text-base font-extrabold text-[var(--accent)] tabular-nums">
              {fmtMoney(report.totalPotentialSavingUZS, lang)}
            </div>
          </div>
          <div className="rounded-xl bg-[var(--bad-soft)] p-3">
            <div className="text-[11px] font-semibold text-[var(--bad)]">{t.errors}</div>
            <div className="mt-1 text-base font-extrabold text-[var(--bad)] tabular-nums">{report.errorCount}</div>
          </div>
          <div className="rounded-xl bg-[var(--warn-soft)] p-3">
            <div className="text-[11px] font-semibold text-[var(--warn)]">{t.inefficiencies}</div>
            <div className="mt-1 text-base font-extrabold text-[var(--warn)] tabular-nums">{report.inefficiencyCount}</div>
          </div>
          <div className="rounded-xl bg-[var(--accent-soft)] p-3">
            <div className="text-[11px] font-semibold text-[var(--accent)]">{t.risks}</div>
            <div className="mt-1 text-base font-extrabold text-[var(--accent)] tabular-nums">{report.riskCount}</div>
          </div>
        </div>
      </div>

      {/* Prioritized AI Recommendations */}
      <div className="card p-5">
        <h2 className="m-0 mb-3 text-sm font-extrabold">{t.aiRecommendations}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {report.recommendations.map(rec => (
            <div key={rec.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div className="flex items-start justify-between gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                  rec.priority === 'high'
                    ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                    : rec.priority === 'medium'
                      ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                      : 'bg-[var(--good-soft)] text-[var(--good)]'
                }`}>
                  {rec.priority}
                </span>
                <span className="text-xs font-extrabold text-[var(--good)] tabular-nums">
                  {t.expectedSaving}: {fmtMoney(rec.expectedSavingUZS, lang)}
                </span>
              </div>
              <div className="mt-2 text-sm font-bold">{rec.title[lang]}</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{rec.action[lang]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Findings Filter & List */}
      <div className="card p-5">
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
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                  filter === key
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {actionMessage && (
            <span className="rounded-lg bg-[var(--good-soft)] px-3 py-1 text-xs font-bold text-[var(--good)]">
              {actionMessage}
            </span>
          )}
        </div>

        <div className="grid gap-3">
          {findings.map(f => {
            const busy = actionBusyId === f.id;
            return (
              <div key={f.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        f.kind === 'ERROR'
                          ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                          : f.kind === 'INEFFICIENCY'
                            ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                            : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      }`}>
                        {f.kind}
                      </span>
                      <span className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                        {f.code}
                      </span>
                      {f.category && (
                        <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                          {CATEGORY_LABELS[f.category][lang]}
                        </span>
                      )}
                      <span className="text-sm font-extrabold">{f.title[lang]}</span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-[var(--text)]">{f.detail[lang]}</p>
                    <p className="mt-1.5 text-xs font-semibold text-[var(--good)]">→ {f.recommendation[lang]}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="text-right tabular-nums">
                      <div className="text-[10px] font-semibold text-[var(--muted)]">{t.impact}</div>
                      <div className="text-base font-extrabold text-[var(--bad)]">{fmtMoney(f.amountImpact, lang)}</div>
                    </div>

                    {f.code === 'DUPLICATE_INVOICE' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleFixDuplicate(f)}
                        className="btn-secondary text-xs"
                      >
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
                        {t.fixCategory}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
