import type { ReactNode } from 'react';

function SvgIcon({
  size = 16,
  className = '',
  children,
}: {
  size?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconSparkles({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </SvgIcon>
  );
}

export function IconBell({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </SvgIcon>
  );
}

export function IconSun({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </SvgIcon>
  );
}

export function IconMoon({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </SvgIcon>
  );
}

export function IconRefresh({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </SvgIcon>
  );
}

export function IconLogOut({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </SvgIcon>
  );
}

export function IconWallet({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </SvgIcon>
  );
}

export function IconCoins({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
    </SvgIcon>
  );
}

export function IconReceipt({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </SvgIcon>
  );
}

export function IconBag({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </SvgIcon>
  );
}

export function IconActivity({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </SvgIcon>
  );
}

export function IconBox({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </SvgIcon>
  );
}

export function IconChevronRight({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="m9 18 6-6-6-6" />
    </SvgIcon>
  );
}

export function IconWrench({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </SvgIcon>
  );
}

export function IconAlertTriangle({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </SvgIcon>
  );
}

export function IconTrendingDown({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </SvgIcon>
  );
}

export function IconTrendingUp({ size = 12, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </SvgIcon>
  );
}

export function IconMoreVertical({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </SvgIcon>
  );
}

export function BrandLogoBadge({ size = 38 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[10px] transition-transform duration-200 hover:scale-[1.03]"
      style={{
        width: size,
        height: size,
        background: 'var(--chrome-badge)',
        color: 'var(--chrome-badge-text)',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.14)',
      }}
    >
      <svg
        width={Math.round(size * 0.56)}
        height={Math.round(size * 0.56)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M4.5 7.2C4.5 6.09543 5.39543 5.2 6.5 5.2H11.6C12.35 5.2 13.03 5.62 13.36 6.29L15.4 10.4L19.5 16.8C19.5 17.9 18.6 18.8 17.5 18.8H12.4C11.65 18.8 10.97 18.38 10.64 17.71L8.6 13.6L4.5 7.2Z"
          fill="currentColor"
        />
        <path
          d="M14.2 5.2H17.8C18.9 5.2 19.6 6.38 19.04 7.33L16.3 11.95L13.1 6.7C12.82 6.05 13.48 5.2 14.2 5.2Z"
          fill="currentColor"
          fillOpacity="0.68"
        />
      </svg>
    </div>
  );
}

export function LiveSunburstIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      className={`animate-spin-slow ${className}`}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="3" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="10" y1="2" x2="10" y2="4.5" />
        <line x1="10" y1="15.5" x2="10" y2="18" />
        <line x1="2" y1="10" x2="4.5" y2="10" />
        <line x1="15.5" y1="10" x2="18" y2="10" />
        <line x1="4.34" y1="4.34" x2="6.1" y2="6.1" />
        <line x1="13.9" y1="13.9" x2="15.66" y2="15.66" />
        <line x1="15.66" y1="4.34" x2="13.9" y2="6.1" />
        <line x1="6.1" y1="13.9" x2="4.34" y2="15.66" />
      </g>
    </svg>
  );
}

interface TickStatCardProps {
  title: string;
  value: string;
  delta?: string;
  deltaTone?: 'good' | 'bad' | 'neutral';
  fillRatio?: number;
  ticksColor?: 'ink' | 'pink' | 'mint' | 'violet';
  footerLabel: string;
  footerRight?: string;
  icon?: ReactNode;
  onClick?: () => void;
  delayMs?: number;
}

export function TickStatCard({
  title,
  value,
  delta,
  deltaTone = 'good',
  fillRatio = 0.72,
  ticksColor = 'ink',
  footerLabel,
  footerRight,
  icon,
  onClick,
  delayMs = 0,
}: TickStatCardProps) {
  const totalTicks = 38;
  const clamped = Math.max(0.08, Math.min(1, fillRatio));
  const filledCount = Math.round(totalTicks * clamped);

  const activeColor =
    ticksColor === 'pink'
      ? 'var(--accent)'
      : ticksColor === 'mint'
        ? 'var(--mint)'
        : ticksColor === 'violet'
          ? 'var(--accent-2)'
          : 'var(--text)';

  const deltaStyle =
    deltaTone === 'good'
      ? { background: 'var(--good-soft)', color: 'var(--good)' }
      : deltaTone === 'bad'
        ? { background: 'var(--bad-soft)', color: 'var(--bad)' }
        : { background: 'var(--surface-2)', color: 'var(--muted)' };

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{ animationDelay: `${delayMs}ms` }}
      className={`card animate-fade-up flex flex-col justify-between p-4 sm:p-5 ${
        onClick ? 'cursor-pointer hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all' : ''
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[var(--muted)]">
            {icon && <span className="shrink-0 text-[var(--muted)]">{icon}</span>}
            <span className="truncate">{title}</span>
          </div>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--muted-soft)] hover:bg-[var(--surface-2)]">
            <IconMoreVertical size={14} />
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-baseline gap-2.5">
          <span className="tabular-nums text-[26px] font-normal tracking-[-0.025em] leading-[1.15] text-[var(--text)] xl:text-[28px]">
            {value}
          </span>
          {delta && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
              style={deltaStyle}
            >
              {delta}
              {deltaTone === 'good' ? (
                <IconTrendingUp size={11} />
              ) : deltaTone === 'bad' ? (
                <IconTrendingDown size={11} />
              ) : null}
            </span>
          )}
        </div>
      </div>

      {/* Signature 38-tick animated meter */}
      <div
        className="my-3.5 flex h-[22px] w-full items-center justify-between gap-[2px]"
        aria-hidden="true"
      >
        {Array.from({ length: totalTicks }).map((_, idx) => {
          const isFilled = idx < filledCount;
          const progressOpacity = isFilled
            ? (0.2 + 0.8 * ((idx + 1) / Math.max(1, filledCount))).toFixed(2)
            : '1';
          return (
            <span
              key={idx}
              className="animate-tick-wave h-full w-[3px] shrink-0 rounded-full"
              style={
                {
                  backgroundColor: isFilled ? activeColor : 'var(--border-strong)',
                  '--tick-opacity': isFilled ? progressOpacity : '0.55',
                  opacity: isFilled ? Number(progressOpacity) : 0.55,
                  animationDelay: `${delayMs + idx * 11}ms`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--muted)]">
        <span className="truncate">{footerLabel}</span>
        {footerRight && <span className="shrink-0 font-medium tabular-nums text-[var(--text)]">{footerRight}</span>}
      </div>
    </div>
  );
}

const SLIDER_GRADIENTS: Record<'orange' | 'mint' | 'violet' | 'pink' | 'blue', { from: string; to: string }> = {
  orange: { from: '#ffb380', to: '#ff7a33' },
  mint: { from: '#8be4cf', to: '#36b89a' },
  violet: { from: '#b8b0ff', to: '#7d6dfd' },
  pink: { from: '#f9a8c4', to: '#ec5180' },
  blue: { from: '#93c5fd', to: '#3b82f6' },
};

export function GradientSliderRow({
  label,
  valueText,
  sharePct,
  tone = 'pink',
  badgeText,
  delayMs = 0,
}: {
  label: string;
  valueText: string;
  sharePct: number;
  tone?: 'orange' | 'mint' | 'violet' | 'pink' | 'blue';
  badgeText?: string;
  delayMs?: number;
}) {
  const palette = SLIDER_GRADIENTS[tone];
  const pct = Math.max(4, Math.min(100, sharePct));

  return (
    <div className="animate-fade-up space-y-1.5" style={{ animationDelay: `${delayMs}ms` }}>
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: palette.to }}
          >
            {badgeText ?? label.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate font-medium text-[var(--text)]">{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 tabular-nums">
          <span className="text-[11.5px] text-[var(--muted)]">{valueText}</span>
          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
            {sharePct.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="relative h-2.5 w-full rounded-full bg-[var(--surface-2)]">
        <div
          className="animate-slider-grow relative h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${palette.from} 0%, ${palette.to} 100%)`,
            animationDelay: `${delayMs + 80}ms`,
          }}
        >
          <span
            className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-[var(--surface)] shadow-sm"
            style={{ border: `2.5px solid ${palette.to}` }}
          />
        </div>
      </div>
    </div>
  );
}

export function AlertFeedRow({
  icon,
  tone = 'info',
  title,
  subtitle,
  pillText,
  onClick,
  delayMs = 0,
}: {
  icon: ReactNode;
  tone?: 'info' | 'warn' | 'bad' | 'good' | 'accent';
  title: string;
  subtitle: string;
  pillText?: string;
  onClick?: () => void;
  delayMs?: number;
}) {
  const toneColors = {
    info: { bg: 'var(--info-soft)', color: 'var(--info)' },
    warn: { bg: 'var(--warn-soft)', color: 'var(--warn)' },
    bad: { bg: 'var(--bad-soft)', color: 'var(--bad)' },
    good: { bg: 'var(--good-soft)', color: 'var(--good)' },
    accent: { bg: 'var(--accent-soft)', color: 'var(--accent)' },
  }[tone];

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{ animationDelay: `${delayMs}ms` }}
      className={`animate-fade-up flex w-full min-w-0 items-center justify-between gap-2.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-all ${
        onClick ? 'cursor-pointer hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: toneColors.bg, color: toneColors.color }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[var(--text)]">{title}</div>
          <div className="truncate text-[11.5px] text-[var(--muted)]">{subtitle}</div>
        </div>
      </div>
      {pillText && (
        <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[var(--muted)]">
          {pillText}
        </span>
      )}
    </div>
  );
}

export function AiInsightOrbCard({
  badgeLabel,
  updatedLabel,
  headline,
  statusLine,
  ctaLabel,
  onCta,
  score,
}: {
  badgeLabel: string;
  updatedLabel: string;
  headline: string;
  statusLine?: string;
  ctaLabel: string;
  onCta: () => void;
  score?: number;
}) {
  return (
    <div className="card relative flex flex-col justify-between overflow-hidden p-5">
      <div className="ai-grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-44" />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <IconSparkles size={12} />
          {badgeLabel}
          {typeof score === 'number' && <strong className="ml-0.5 tabular-nums">{score}/100</strong>}
        </span>
        <span className="text-[11px] font-medium text-[var(--muted-soft)]">{updatedLabel}</span>
      </div>

      <div className="relative z-10 my-5 flex flex-col items-center text-center">
        <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
          <span
            className="animate-orb-halo absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(236,81,128,0.28) 0%, rgba(236,81,128,0) 72%)',
            }}
          />
          <span className="ai-pink-orb animate-orb-breathe relative h-12 w-12 rounded-full" />
        </div>

        <p className="animate-word-blur max-w-[320px] text-[13.5px] font-medium leading-[1.45] text-[var(--text)]">
          {headline}
        </p>

        {statusLine && (
          <p className="mt-2 text-[12px] font-medium" style={{ color: 'var(--mint)' }}>
            {statusLine}
          </p>
        )}
      </div>

      <button type="button" onClick={onCta} className="btn-primary relative z-10 w-full">
        {ctaLabel}
      </button>
    </div>
  );
}
