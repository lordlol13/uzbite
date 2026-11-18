import { useId, useState } from 'react';
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
  const uid = useId().replace(/:/g, '');
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-[var(--muted)]">{COPY[lang].noData}</p>;
  }

  const width = 760;
  const height = 264;
  const padL = 56;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal =
    Math.max(
      100_000,
      ...data.flatMap(d => [d.revenue, d.expenses]),
    ) * 1.12;

  const step = plotW / data.length;
  const barW = Math.max(5, Math.min(20, step * 0.36));
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

  const revGradId = `rev-grad-${uid}`;
  const expGradId = `exp-grad-${uid}`;
  const stripePatId = `stripe-cap-${uid}`;

  return (
    <div className="relative w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-4 text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text)]">
            <span className="h-2.5 w-2.5 rounded-[4px] bg-[#ec5180]" />
            {COPY[lang].revenue}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-[4px] bg-[#e2d4ec] border border-[#c4b5fd]" />
            {COPY[lang].totalExpenses}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-0.5 w-4 rounded-full bg-[#36b89a]" />
            {COPY[lang].netProfit}
          </span>
        </div>
        {hoveredItem && (
          <div className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1 text-[11.5px] tabular-nums shadow-xs">
            <strong className="mr-2 font-semibold text-[var(--text)]">{hoveredItem.bucket}</strong>
            <span className="mr-2 font-medium text-[#ec5180]">
              {COPY[lang].revenue}: {fmtMoney(hoveredItem.revenue, lang)}
            </span>
            <span className="mr-2 text-[var(--muted)]">
              {COPY[lang].totalExpenses}: {fmtMoney(hoveredItem.expenses, lang)}
            </span>
            <span className={hoveredItem.profit >= 0 ? 'font-medium text-[var(--good)]' : 'font-medium text-[var(--bad)]'}>
              {COPY[lang].netProfit}: {fmtMoney(hoveredItem.profit, lang)}
            </span>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full overflow-visible">
        <defs>
          <linearGradient id={revGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ec5180" stopOpacity="0.96" />
            <stop offset="55%" stopColor="#f59cb8" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#f8d3de" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id={expGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8172ff" stopOpacity="0.52" />
            <stop offset="65%" stopColor="#c7bffc" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#ede9fe" stopOpacity="0.04" />
          </linearGradient>
          <pattern
            id={stripePatId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="rgba(236, 81, 128, 0.08)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2.5" />
          </pattern>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const y = padT + plotH * (1 - ratio);
          const v = maxVal * ratio;
          return (
            <g key={ratio}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="var(--border-strong)"
                strokeDasharray="4 4"
                strokeOpacity={0.75}
              />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted-soft)">
                {fmtCompactMoney(v, lang)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const cx = padL + i * step + step / 2;
          const revH = (d.revenue / maxVal) * plotH;
          const expH = (d.expenses / maxVal) * plotH;
          const delay = `${Math.min(i * 18, 360)}ms`;
          const capY = Math.max(padT, yFor(d.revenue) - 10);
          const capH = Math.min(10, Math.max(0, yFor(d.revenue) - padT));

          return (
            <g
              key={d.bucket}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              {/* Diagonal striped cap above primary bar (Dribbble signature cap) */}
              {revH > 6 && capH > 2 && (
                <rect
                  x={cx - barW - 1}
                  y={capY}
                  width={barW}
                  height={capH + 4}
                  rx={4}
                  fill={`url(#${stripePatId})`}
                  opacity={hovered === i ? 0.95 : 0.65}
                />
              )}
              <rect
                x={cx - barW - 1}
                y={yFor(d.revenue)}
                width={barW}
                height={Math.max(0, revH)}
                rx={5}
                fill={`url(#${revGradId})`}
                className="animate-bar-grow"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'bottom center',
                  animationDelay: delay,
                  opacity: hovered === i ? 1 : 0.92,
                }}
              />
              <rect
                x={cx + 1}
                y={yFor(d.expenses)}
                width={barW}
                height={Math.max(0, expH)}
                rx={5}
                fill={`url(#${expGradId})`}
                className="animate-bar-grow"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'bottom center',
                  animationDelay: delay,
                  opacity: hovered === i ? 1 : 0.88,
                }}
              />
              {i % labelStride === 0 && (
                <text x={cx} y={height - 10} textAnchor="middle" fontSize="10" fill="var(--muted-soft)">
                  {d.bucket.slice(5)}
                </text>
              )}
            </g>
          );
        })}

        {data.length > 1 && (
          <polyline
            fill="none"
            stroke="#36b89a"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={profitPoints}
          />
        )}

        {hovered !== null && data[hovered] && (
          <circle
            cx={padL + hovered * step + step / 2}
            cy={yFor(Math.max(0, data[hovered].profit))}
            r={4.5}
            fill="#36b89a"
            stroke="var(--surface)"
            strokeWidth="2"
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
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
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
  const activeItem = hoveredCat ? nonZero.find(i => i.category === hoveredCat) : null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
          {nonZero.map(item => {
            const len = (item.amount / total) * circ;
            const dashArray = `${Math.max(0, len - 3)} ${circ}`;
            const dashOffset = -offset;
            offset += len;
            const isActive = hoveredCat === item.category;
            const dimmed = hoveredCat !== null && !isActive;
            return (
              <circle
                key={item.category}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={CATEGORY_COLORS[item.category]}
                strokeWidth={isActive ? 25 : 20}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                opacity={dimmed ? 0.35 : 1}
                onMouseEnter={() => setHoveredCat(item.category)}
                onMouseLeave={() => setHoveredCat(null)}
                className="cursor-pointer transition-all duration-200"
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <span className="max-w-[96px] truncate text-[10.5px] font-medium text-[var(--muted)]">
            {activeItem ? CATEGORY_LABELS[activeItem.category][lang] : COPY[lang].totalExpenses}
          </span>
          <strong className="mt-0.5 text-sm font-semibold tracking-tight tabular-nums text-[var(--text)]">
            {fmtCompactMoney(activeItem ? activeItem.amount : total, lang)}
          </strong>
          {activeItem && (
            <span className="text-[10px] font-semibold tabular-nums text-[var(--accent)]">
              {activeItem.sharePct}%
            </span>
          )}
        </div>
      </div>

      <div className="grid w-full flex-1 gap-1.5">
        {nonZero.slice(0, 7).map(item => {
          const isActive = hoveredCat === item.category;
          return (
            <div
              key={item.category}
              onMouseEnter={() => setHoveredCat(item.category)}
              onMouseLeave={() => setHoveredCat(null)}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition-colors ${
                isActive ? 'bg-[var(--surface-2)]' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full transition-transform duration-150"
                  style={{
                    backgroundColor: CATEGORY_COLORS[item.category],
                    transform: isActive ? 'scale(1.25)' : 'scale(1)',
                  }}
                />
                <span className="truncate font-medium text-[var(--text)]">
                  {CATEGORY_LABELS[item.category][lang]}
                </span>
              </div>
              <div className="shrink-0 tabular-nums text-right">
                <span className="font-semibold text-[var(--text)]">{fmtCompactMoney(item.amount, lang)}</span>
                <span className="ml-1.5 text-[var(--muted)]">({item.sharePct}%)</span>
              </div>
            </div>
          );
        })}
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
  const [hoveredCell, setHoveredCell] = useState<{ weekdayLabel: string; hour: number; cell?: HourlyHeatmapCell } | null>(null);
  const maxOrders = Math.max(1, ...cells.map(c => c.orders));
  const map = new Map<string, HourlyHeatmapCell>();
  for (const c of cells) map.set(`${c.weekday}:${c.hour}`, c);

  const visibleHours = Array.from({ length: 15 }, (_, idx) => idx + 9); // 09:00 .. 23:00
  const weekdays = COPY[lang].weekdays;
  const ordersLabel = lang === 'uz' ? 'buyurtma' : lang === 'ru' ? 'зак.' : 'orders';

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2 text-[var(--muted)]">
          <span>{lang === 'uz' ? 'Kam' : lang === 'ru' ? 'Мин' : 'Low'}</span>
          <div className="flex items-center gap-1">
            {[0, 0.25, 0.5, 0.75, 1].map(lvl => (
              <span
                key={lvl}
                className="h-3 w-4 rounded border border-[var(--border)]"
                style={{
                  backgroundColor:
                    lvl === 0 ? 'var(--surface-2)' : `rgba(236, 81, 128, ${(0.18 + lvl * 0.82).toFixed(2)})`,
                }}
              />
            ))}
          </div>
          <span>{lang === 'uz' ? 'Pik' : lang === 'ru' ? 'Пик' : 'Peak'}</span>
        </div>

        <div className="min-h-[26px]">
          {hoveredCell ? (
            <div className="animate-scale-in inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1 text-[11.5px] tabular-nums shadow-xs">
              <strong className="font-semibold text-[var(--text)]">
                {hoveredCell.weekdayLabel} · {String(hoveredCell.hour).padStart(2, '0')}:00
              </strong>
              <span className="font-medium text-[var(--accent)]">
                {hoveredCell.cell?.orders ?? 0} {ordersLabel}
              </span>
              <span className="text-[var(--muted)]">
                {fmtMoney(hoveredCell.cell?.revenue ?? 0, lang)}
              </span>
            </div>
          ) : (
            <span className="text-[var(--muted-soft)]">
              {lang === 'uz'
                ? 'Tafsilotlar uchun katakchaga olib boring'
                : lang === 'ru'
                  ? 'Наведите на ячейку для детализации'
                  : 'Hover any cell for hourly breakdown'}
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="mb-1.5 grid grid-cols-[44px_repeat(15,minmax(0,1fr))] gap-1 text-center text-[10px] font-medium text-[var(--muted)]">
            <div />
            {visibleHours.map(h => (
              <div key={h}>{String(h).padStart(2, '0')}</div>
            ))}
          </div>
          <div className="grid gap-1">
            {weekdays.map((label, w) => (
              <div key={label} className="grid grid-cols-[44px_repeat(15,minmax(0,1fr))] items-center gap-1">
                <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
                {visibleHours.map(h => {
                  const cell = map.get(`${w}:${h}`);
                  const count = cell?.orders ?? 0;
                  const intensity = count / maxOrders;
                  const bg =
                    count === 0
                      ? 'var(--surface-2)'
                      : `rgba(236, 81, 128, ${(0.2 + intensity * 0.8).toFixed(2)})`;
                  const isHovered = hoveredCell?.weekdayLabel === label && hoveredCell.hour === h;
                  return (
                    <div
                      key={h}
                      onMouseEnter={() => setHoveredCell({ weekdayLabel: label, hour: h, cell })}
                      onMouseLeave={() => setHoveredCell(null)}
                      title={`${label} ${h}:00 — ${count} (${fmtMoney(cell?.revenue ?? 0, lang)})`}
                      className={`flex h-7 cursor-pointer items-center justify-center rounded-lg border text-[10px] font-semibold tabular-nums transition-all duration-150 ${
                        isHovered
                          ? 'z-10 scale-110 border-[var(--accent)] shadow-sm'
                          : 'border-[var(--border)]'
                      }`}
                      style={{
                        backgroundColor: bg,
                        color: intensity > 0.45 ? '#ffffff' : 'var(--text)',
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
  const [hoveredDishId, setHoveredDishId] = useState<string | null>(null);
  if (dishes.length === 0) {
    return <p className="py-10 text-center text-xs text-[var(--muted)]">{COPY[lang].noData}</p>;
  }
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
    STAR: '#36b89a',
    PLOWHORSE: '#ec5180',
    PUZZLE: '#8172ff',
    DOG: '#d54c4f',
  };

  const hoveredDish = hoveredDishId ? dishes.find(d => d.dishId === hoveredDishId) : null;

  return (
    <div className="grid gap-2">
      <div className="flex min-h-[28px] items-center justify-between gap-2 px-1 text-[11px]">
        {hoveredDish ? (
          <div className="animate-scale-in flex flex-wrap items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-0.5 tabular-nums shadow-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: colors[hoveredDish.quadrant] }}
            />
            <strong className="font-semibold text-[var(--text)]">{hoveredDish.name}</strong>
            <span className="text-[var(--muted)]">{hoveredDish.quantitySold}</span>
            <span className="font-semibold text-[var(--good)]">
              {fmtMoney(hoveredDish.unitMargin, lang)}
            </span>
          </div>
        ) : (
          <span className="text-[var(--muted)]">
            {lang === 'uz'
              ? 'Menyu matritsasi (marja vs sotuv)'
              : lang === 'ru'
                ? 'Матрица меню (маржа × продажи)'
                : 'Menu Matrix (Margin × Volume)'}
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full overflow-visible">
        <rect x={pad} y={pad} width={plotW} height={plotH} fill="var(--surface)" stroke="var(--border)" rx={10} />
        <line
          x1={xOf(avgQty)}
          y1={pad}
          x2={xOf(avgQty)}
          y2={pad + plotH}
          stroke="var(--border-strong)"
          strokeDasharray="4 4"
        />
        <line
          x1={pad}
          y1={yOf(avgMargin)}
          x2={pad + plotW}
          y2={yOf(avgMargin)}
          stroke="var(--border-strong)"
          strokeDasharray="4 4"
        />
        <text x={pad + 8} y={pad + 14} fontSize="10" fontWeight="600" fill="var(--accent-2)">PUZZLE</text>
        <text x={pad + plotW - 38} y={pad + 14} fontSize="10" fontWeight="600" fill="var(--mint)">STAR</text>
        <text x={pad + 8} y={pad + plotH - 6} fontSize="10" fontWeight="600" fill="var(--bad)">DOG</text>
        <text x={pad + plotW - 72} y={pad + plotH - 6} fontSize="10" fontWeight="600" fill="var(--accent)">PLOWHORSE</text>

        {dishes.map(d => {
          const cx = xOf(d.quantitySold);
          const cy = yOf(d.unitMargin);
          const isHovered = hoveredDishId === d.dishId;
          const dimmed = hoveredDishId !== null && !isHovered;
          return (
            <g
              key={d.dishId}
              onMouseEnter={() => setHoveredDishId(d.dishId)}
              onMouseLeave={() => setHoveredDishId(null)}
              className="cursor-pointer"
              style={{ opacity: dimmed ? 0.35 : 1, transition: 'opacity 0.18s ease' }}
            >
              {isHovered && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={13}
                  fill={colors[d.quadrant]}
                  fillOpacity={0.2}
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 9 : 7}
                fill={colors[d.quadrant]}
                stroke="var(--surface)"
                strokeWidth="1.5"
                style={{ transition: 'r 0.15s ease' }}
              >
                <title>{`${d.name}: ${d.quantitySold} шт, ${fmtMoney(d.unitMargin, lang)}`}</title>
              </circle>
              <text
                x={cx + 10}
                y={cy + 3}
                fontSize="10"
                fontWeight={isHovered ? '700' : '500'}
                fill="var(--text)"
                stroke="var(--surface)"
                strokeWidth="2.5"
                paintOrder="stroke"
              >
                {d.name.slice(0, 16)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
