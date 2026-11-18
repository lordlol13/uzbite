import { useState } from 'react';
import type {
  CategoryBreakdownItem,
  DishAnalyticsItem,
  HourlyHeatmapCell,
  Language,
  TimeseriesPoint,
} from '@uzbite/shared';
import { CATEGORY_COLORS, CATEGORY_LABELS, COPY, fmtCompactMoney, fmtMoney } from '../lib/i18n';

export function RevenueExpenseChart({
  data,
  lang,
}: {
  data: TimeseriesPoint[];
  lang: Language;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-[var(--muted)]">{COPY[lang].noData}</p>;
  }

  const width = 760;
  const height = 260;
  const padL = 56;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = Math.max(
    100_000,
    ...data.flatMap(d => [d.revenue, d.expenses]),
  );

  const step = plotW / data.length;
  const barW = Math.max(4, Math.min(18, step * 0.34));
  const yFor = (val: number) => padT + plotH - (val / maxVal) * plotH;

  const profitPoints = data
    .map((d, i) => {
      const x = padL + i * step + step / 2;
      const clamped = Math.max(0, d.profit);
      return `${x.toFixed(1)},${yFor(clamped).toFixed(1)}`;
    })
    .join(' ');

  const hoveredItem = hovered !== null ? data[hovered] : null;
  const labelStride = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="relative w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#f8781d]" />
            {COPY[lang].revenue}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#64748b]" />
            {COPY[lang].totalExpenses}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-[#1f8b52]" />
            {COPY[lang].netProfit}
          </span>
        </div>
        {hoveredItem && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs tabular-nums">
            <strong className="mr-2">{hoveredItem.bucket}</strong>
            <span className="mr-2 text-[#f8781d]">{COPY[lang].revenue}: {fmtMoney(hoveredItem.revenue, lang)}</span>
            <span className="mr-2 text-[var(--muted)]">{COPY[lang].totalExpenses}: {fmtMoney(hoveredItem.expenses, lang)}</span>
            <span className={hoveredItem.profit >= 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'}>
              {COPY[lang].netProfit}: {fmtMoney(hoveredItem.profit, lang)}
            </span>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const y = padT + plotH * (1 - ratio);
          const v = maxVal * ratio;
          return (
            <g key={ratio}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--border)" strokeDasharray="3 3" />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
                {fmtCompactMoney(v, lang)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const cx = padL + i * step + step / 2;
          const revH = (d.revenue / maxVal) * plotH;
          const expH = (d.expenses / maxVal) * plotH;
          return (
            <g
              key={d.bucket}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <rect
                x={cx - barW - 1}
                y={yFor(d.revenue)}
                width={barW}
                height={Math.max(0, revH)}
                rx={3}
                fill="#f8781d"
                opacity={hovered === i ? 1 : 0.85}
              />
              <rect
                x={cx + 1}
                y={yFor(d.expenses)}
                width={barW}
                height={Math.max(0, expH)}
                rx={3}
                fill="#64748b"
                opacity={hovered === i ? 1 : 0.75}
              />
              {i % labelStride === 0 && (
                <text x={cx} y={height - 10} textAnchor="middle" fontSize="10" fill="var(--muted)">
                  {d.bucket.slice(5)}
                </text>
              )}
            </g>
          );
        })}

        {data.length > 1 && (
          <polyline
            fill="none"
            stroke="#1f8b52"
            strokeWidth="2.2"
            strokeLinejoin="round"
            points={profitPoints}
          />
        )}
      </svg>
    </div>
  );
}

export function CategoryDonutChart({
  items,
  lang,
}: {
  items: CategoryBreakdownItem[];
  lang: Language;
}) {
  const nonZero = items.filter(i => i.amount > 0);
  const total = nonZero.reduce((s, i) => s + i.amount, 0);
  if (total === 0) {
    return <p className="py-10 text-center text-sm text-[var(--muted)]">{COPY[lang].noData}</p>;
  }

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 64;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
          {nonZero.map(item => {
            const len = (item.amount / total) * circ;
            const dashArray = `${Math.max(0, len - 2)} ${circ}`;
            const dashOffset = -offset;
            offset += len;
            return (
              <circle
                key={item.category}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={CATEGORY_COLORS[item.category]}
                strokeWidth="24"
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] font-semibold text-[var(--muted)]">{COPY[lang].totalExpenses}</span>
          <strong className="text-sm font-extrabold tabular-nums">{fmtCompactMoney(total, lang)}</strong>
        </div>
      </div>

      <div className="grid w-full flex-1 gap-2">
        {nonZero.slice(0, 7).map(item => (
          <div key={item.category} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
              />
              <span className="truncate font-medium">{CATEGORY_LABELS[item.category][lang]}</span>
            </div>
            <div className="shrink-0 tabular-nums text-right">
              <span className="font-bold">{fmtCompactMoney(item.amount, lang)}</span>
              <span className="ml-1.5 text-[var(--muted)]">({item.sharePct}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HourlyHeatmap({
  cells,
  lang,
}: {
  cells: HourlyHeatmapCell[];
  lang: Language;
}) {
  const maxOrders = Math.max(1, ...cells.map(c => c.orders));
  const map = new Map<string, HourlyHeatmapCell>();
  for (const c of cells) map.set(`${c.weekday}:${c.hour}`, c);

  const visibleHours = Array.from({ length: 15 }, (_, idx) => idx + 9); // 09:00 .. 23:00
  const weekdays = COPY[lang].weekdays;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="mb-1 grid grid-cols-[44px_repeat(15,minmax(0,1fr))] gap-1 text-center text-[10px] text-[var(--muted)]">
          <div />
          {visibleHours.map(h => (
            <div key={h}>{String(h).padStart(2, '0')}</div>
          ))}
        </div>
        <div className="grid gap-1">
          {weekdays.map((label, w) => (
            <div key={label} className="grid grid-cols-[44px_repeat(15,minmax(0,1fr))] items-center gap-1">
              <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
              {visibleHours.map(h => {
                const cell = map.get(`${w}:${h}`);
                const count = cell?.orders ?? 0;
                const intensity = count / maxOrders;
                const bg =
                  count === 0
                    ? 'var(--surface-2)'
                    : `rgba(248, 120, 29, ${(0.2 + intensity * 0.8).toFixed(2)})`;
                return (
                  <div
                    key={h}
                    title={`${label} ${h}:00 — ${count} (${fmtMoney(cell?.revenue ?? 0, lang)})`}
                    className="flex h-7 items-center justify-center rounded-md border border-[var(--border)] text-[10px] font-bold tabular-nums"
                    style={{
                      backgroundColor: bg,
                      color: intensity > 0.55 ? '#ffffff' : 'var(--text)',
                    }}
                  >
                    {count > 0 ? count : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MenuQuadrantChart({
  dishes,
  lang,
}: {
  dishes: DishAnalyticsItem[];
  lang: Language;
}) {
  if (dishes.length === 0) return null;
  const w = 520;
  const h = 230;
  const pad = 36;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  const maxQty = Math.max(10, ...dishes.map(d => d.quantitySold));
  const minMargin = Math.min(0, ...dishes.map(d => d.unitMargin));
  const maxMargin = Math.max(10_000, ...dishes.map(d => d.unitMargin));
  const marginSpan = Math.max(1, maxMargin - minMargin);

  const avgQty = dishes.reduce((s, d) => s + d.quantitySold, 0) / dishes.length;
  const avgMargin = dishes.reduce((s, d) => s + d.unitMargin, 0) / dishes.length;

  const xOf = (qty: number) => pad + (qty / maxQty) * plotW;
  const yOf = (m: number) => pad + plotH - ((m - minMargin) / marginSpan) * plotH;

  const colors: Record<DishAnalyticsItem['quadrant'], string> = {
    STAR: '#1f8b52',
    PLOWHORSE: '#f8781d',
    PUZZLE: '#3b82f6',
    DOG: '#d13832',
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full">
      <rect x={pad} y={pad} width={plotW} height={plotH} fill="var(--surface-2)" rx={8} />
      <line x1={xOf(avgQty)} y1={pad} x2={xOf(avgQty)} y2={pad + plotH} stroke="var(--border)" strokeDasharray="4 4" />
      <line x1={pad} y1={yOf(avgMargin)} x2={pad + plotW} y2={yOf(avgMargin)} stroke="var(--border)" strokeDasharray="4 4" />
      <text x={pad + 8} y={pad + 14} fontSize="10" fill="var(--muted)">PUZZLE</text>
      <text x={pad + plotW - 42} y={pad + 14} fontSize="10" fill="var(--good)">STAR</text>
      <text x={pad + 8} y={pad + plotH - 6} fontSize="10" fill="var(--bad)">DOG</text>
      <text x={pad + plotW - 70} y={pad + plotH - 6} fontSize="10" fill="var(--accent)">PLOWHORSE</text>

      {dishes.map(d => {
        const cx = xOf(d.quantitySold);
        const cy = yOf(d.unitMargin);
        return (
          <g key={d.dishId}>
            <circle cx={cx} cy={cy} r={7} fill={colors[d.quadrant]} opacity={0.9}>
              <title>{`${d.name}: ${d.quantitySold} шт, ${fmtMoney(d.unitMargin, lang)}`}</title>
            </circle>
            <text x={cx + 9} y={cy + 3} fontSize="10" fontWeight="600" fill="var(--text)">
              {d.name.slice(0, 16)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
