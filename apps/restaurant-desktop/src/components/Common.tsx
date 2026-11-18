import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`card flex max-h-[90vh] w-full flex-col overflow-hidden shadow-2xl ${
          wide ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="m-0 text-base font-extrabold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
            aria-label="Закрыть"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  const styles: Record<typeof tone, string> = {
    neutral: 'bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)]',
    good: 'bg-[var(--good-soft)] text-[var(--good)] border-transparent',
    warn: 'bg-[var(--warn-soft)] text-[var(--warn)] border-transparent',
    bad: 'bg-[var(--bad-soft)] text-[var(--bad)] border-transparent',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-transparent',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${styles[tone]}`}
    >
      {label}
    </span>
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-[var(--bad)]/35 bg-[var(--bad-soft)] px-4 py-3 text-xs font-semibold text-[var(--bad)]">
      {message}
    </div>
  );
}

export function EmptyBox({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center p-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon name={icon} size={24} />
      </div>
      <div className="text-sm font-bold">{title}</div>
      {subtitle && <p className="mt-1 max-w-md text-xs text-[var(--muted)]">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
