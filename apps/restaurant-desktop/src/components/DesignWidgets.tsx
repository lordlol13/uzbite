import { useId, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

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

export function TickStatCard({
  title,
  value,
  delta,
  deltaTone = 'good',
  fillRatio = 0.72,
  ticksColor = 'ink',
  footerLabel,
  footerRight,
  iconName,
  onClick,
  delayMs = 0,
}: {
  title: string;
  value: string;
  delta?: string;
  deltaTone?: 'good' | 'bad' | 'neutral';
  fillRatio?: number;
  ticksColor?: 'ink' | 'pink' | 'mint' | 'violet';
  footerLabel: string;
  footerRight?: string;
  iconName?: IconName;
  onClick?: () => void;
  delayMs?: number;
}) {
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
            {iconName && <Icon name={iconName} size={15} className="shrink-0 text-[var(--muted)]" />}
            <span className="truncate">{title}</span>
          </div>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--muted-soft)]">
            ···
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-baseline gap-2.5">
          <span className="tabular-nums text-[25px] font-normal tracking-[-0.025em] leading-[1.15] text-[var(--text)] xl:text-[27px]">
            {value}
          </span>
          {delta && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
              style={deltaStyle}
            >
              {delta}
            </span>
          )}
        </div>
      </div>

      <div className="my-3.5 flex h-[22px] w-full items-center justify-between gap-[2px]" aria-hidden="true">
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
            {sharePct.toFixed(0)}%
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
}: {
  badgeLabel: string;
  updatedLabel: string;
  headline: string;
  statusLine?: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div className="card relative flex flex-col justify-between overflow-hidden p-5">
      <div className="ai-grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-44" />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Icon name="sparkles" size={12} />
          {badgeLabel}
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

export function OrderPerformanceBarChart({
  bars,
}: {
  bars: Array<{ label: string; value: number; formatted: string }>;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  if (bars.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-[var(--muted)]">
        Нет данных для графика за выбранный период
      </div>
    );
  }

  const width = 700;
  const height = 228;
  const padL = 46;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxVal = Math.max(1, ...bars.map(b => b.value)) * 1.15;
  const step = plotW / bars.length;
  const barW = Math.max(18, Math.min(44, step * 0.44));
  const maxLabelChars = bars.length <= 4 ? 22 : bars.length <= 6 ? 16 : 12;
  const gradId = `rest-bar-${uid}`;
  const stripeId = `rest-stripe-${uid}`;

  return (
    <div className="relative">
      {hovered !== null && bars[hovered] && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1 text-[11.5px] tabular-nums">
          <strong className="font-medium text-[var(--text)]">{bars[hovered].label}</strong>
          <span className="font-semibold text-[var(--accent)]">{bars[hovered].formatted}</span>
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ec5180" stopOpacity="0.96" />
            <stop offset="55%" stopColor="#f59cb8" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#f8d3de" stopOpacity="0.06" />
          </linearGradient>
          <pattern id={stripeId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgba(236, 81, 128, 0.08)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2.5" />
          </pattern>
        </defs>

        {[0, 0.33, 0.66, 1].map(r => {
          const y = padT + plotH * (1 - r);
          return (
            <line
              key={r}
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="var(--border-strong)"
              strokeDasharray="4 4"
              strokeOpacity={0.75}
            />
          );
        })}

        {bars.map((b, i) => {
          const cx = padL + i * step + step / 2;
          const barH = (b.value / maxVal) * plotH;
          const y = padT + plotH - barH;
          const capY = Math.max(padT, y - 10);
          const capH = Math.min(10, Math.max(0, y - padT));

          return (
            <g
              key={b.label}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              {barH > 6 && capH > 2 && (
                <rect
                  x={cx - barW / 2}
                  y={capY}
                  width={barW}
                  height={capH + 4}
                  rx={5}
                  fill={`url(#${stripeId})`}
                  opacity={hovered === i ? 0.95 : 0.65}
                />
              )}
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={Math.max(4, barH)}
                rx={6}
                fill={`url(#${gradId})`}
                className="animate-bar-grow"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'bottom center',
                  animationDelay: `${i * 35}ms`,
                  opacity: hovered === i ? 1 : 0.9,
                }}
              />
              <text x={cx} y={height - 10} textAnchor="middle" fontSize="10.5" fill="var(--muted-soft)">
                {b.label.length > maxLabelChars ? `${b.label.slice(0, maxLabelChars - 1)}…` : b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function LiveTrackingMiniMap({ activeCount }: { activeCount: number }) {
  return (
    <svg
      viewBox="0 0 360 190"
      className="h-48 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
      aria-hidden="true"
    >
      {/* Minimal pale-gray city wireframe */}
      <g stroke="var(--border-strong)" strokeWidth="1.2" opacity="0.85">
        <path d="M0 45 L140 60 L260 35 L360 55" fill="none" />
        <path d="M0 115 L120 95 L220 125 L360 105" fill="none" />
        <path d="M85 0 L105 190" fill="none" />
        <path d="M210 0 L195 190" fill="none" />
        <path d="M295 0 L280 190" fill="none" />
        <circle cx="195" cy="96" r="56" fill="none" strokeDasharray="4 4" />
        <circle cx="195" cy="96" r="92" fill="none" strokeDasharray="4 4" />
      </g>

      {/* Route path */}
      <path
        d="M105 130 Q 150 96, 195 96 T 275 68"
        fill="none"
        stroke="#8172ff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="5 4"
      />

      {/* Origin pin */}
      <circle cx="105" cy="130" r="5" fill="var(--text)" stroke="var(--surface)" strokeWidth="2" />

      {/* Pulsing live location marker */}
      <g>
        <circle
          cx="195"
          cy="96"
          r="20"
          fill="rgba(129, 114, 255, 0.25)"
          className="animate-radar-pulse"
          style={{ transformOrigin: '195px 96px' }}
        />
        <circle cx="195" cy="96" r="7.5" fill="#8172ff" stroke="#ffffff" strokeWidth="2.4" />
      </g>

      {/* Active couriers/orders floating tag */}
      <g transform="translate(232, 46)">
        <rect width="108" height="24" rx="12" fill="var(--surface)" stroke="var(--border-strong)" />
        <circle cx="14" cy="12" r="4" fill="#36b89a" />
        <text x="24" y="15.5" fontSize="10" fontWeight="500" fill="var(--text)">
          {activeCount} в работе
        </text>
      </g>
    </svg>
  );
}
