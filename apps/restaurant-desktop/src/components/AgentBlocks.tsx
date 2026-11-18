import { useId, useState, type ReactNode } from 'react';
import type {
  AgentClientAction,
  AgentUiBlock,
  Language,
} from '@uzbite/shared';
import { AI_COPY } from '../i18n/copy';
import { formatCompactMoney, formatMoney } from '../utils/format';
import { Icon } from './Icon';
import { TashkentDistrictMap } from './TashkentDistrictMap';

type ChartBlock = Extract<AgentUiBlock, { kind: 'chart' }>;
type ChartItem = ChartBlock['items'][number];

const PALETTE = [
  '#ec5180',
  '#8172ff',
  '#36b89a',
  '#ff8a47',
  '#3b82f6',
  '#1ea04a',
  '#f472b6',
  '#6366f1',
];

function itemColor(item: ChartItem, idx: number): string {
  if (item.color) return item.color;
  if (item.secondaryValue !== undefined && item.value > item.secondaryValue) {
    return 'var(--bad)';
  }
  return PALETTE[idx % PALETTE.length];
}

function fmtChartNum(value: number, lang: Language): string {
  if (Math.abs(value) < 1000 && !Number.isInteger(value)) {
    return value.toFixed(1);
  }
  return formatCompactMoney(value, lang);
}

function computeDeltaPct(value: number, secondary?: number): number | null {
  if (secondary === undefined || secondary === 0) return null;
  return ((value - secondary) / Math.abs(secondary)) * 100;
}

function GroupedBarSvg({ items, lang }: { items: ChartItem[]; lang: Language }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const copy = AI_COPY[lang];
  const w = 640;
  const h = 230;
  const padL = 54;
  const padR = 16;
  const padT = 24;
  const padB = 42;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const hasSecondary = items.some(i => i.secondaryValue !== undefined);
  const maxVal = Math.max(1, ...items.flatMap(i => [i.value, i.secondaryValue ?? 0])) * 1.1;
  const yOf = (v: number) => padT + plotH - (Math.max(0, v) / maxVal) * plotH;
  const step = plotW / Math.max(1, items.length);
  const barW = hasSecondary
    ? Math.max(10, Math.min(26, step * 0.32))
    : Math.max(14, Math.min(38, step * 0.52));

  const hovered = hoveredIdx !== null ? items[hoveredIdx] : null;
  const secLabel = items.find(i => i.secondaryLabel)?.secondaryLabel ?? copy.planLimit;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-3 text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />
            {copy.primaryForecast}
          </span>
          {hasSecondary && (
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#94a3b8]/70" />
              {secLabel}
            </span>
          )}
        </div>
        {hovered && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)] tabular-nums">
            <span className="mr-2">{hovered.label}:</span>
            <span className="text-[var(--accent)]">{fmtChartNum(hovered.value, lang)}</span>
            {hovered.secondaryValue !== undefined && (
              <span className="ml-2 text-[var(--muted)]">
                vs {fmtChartNum(hovered.secondaryValue, lang)}
              </span>
            )}
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map(r => {
          const y = padT + plotH * (1 - r);
          return (
            <g key={r}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="var(--border)" strokeDasharray="3 3" />
              <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
                {fmtChartNum(maxVal * r, lang)}
              </text>
            </g>
          );
        })}

        {items.map((item, idx) => {
          const cx = padL + idx * step + step / 2;
          const isHov = hoveredIdx === idx;
          const fill = itemColor(item, idx);
          const pY = yOf(item.value);
          const pH = Math.max(2, padT + plotH - pY);
          const hasSec = item.secondaryValue !== undefined;
          const sVal = item.secondaryValue ?? 0;
          const sY = yOf(sVal);
          const sH = Math.max(2, padT + plotH - sY);

          const primaryX = hasSec ? cx - barW - 2 : cx - barW / 2;
          const secondaryX = cx + 2;

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={padL + idx * step + 2}
                y={padT}
                width={Math.max(4, step - 4)}
                height={plotH}
                rx={6}
                fill="var(--surface-2)"
                opacity={isHov ? 0.8 : 0}
              />
              <rect
                x={primaryX}
                y={pY}
                width={barW}
                height={pH}
                rx={4}
                fill={fill}
                opacity={hoveredIdx === null || isHov ? 0.95 : 0.55}
              >
                <title>{`${item.label}: ${fmtChartNum(item.value, lang)}${hasSec ? ` (${item.secondaryLabel ?? secLabel}: ${fmtChartNum(sVal, lang)})` : ''}`}</title>
              </rect>
              <text
                x={primaryX + barW / 2}
                y={pY - 5}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="700"
                fill="var(--text)"
                className="tabular-nums"
              >
                {fmtChartNum(item.value, lang)}
              </text>

              {hasSec && (
                <>
                  <rect
                    x={secondaryX}
                    y={sY}
                    width={barW}
                    height={sH}
                    rx={4}
                    fill="#94a3b8"
                    opacity={hoveredIdx === null || isHov ? 0.55 : 0.3}
                  />
                  <text
                    x={secondaryX + barW / 2}
                    y={sY - 5}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="var(--muted)"
                    className="tabular-nums"
                  >
                    {fmtChartNum(sVal, lang)}
                  </text>
                </>
              )}

              <text
                x={cx}
                y={h - 14}
                textAnchor="middle"
                fontSize="10"
                fontWeight={isHov ? '800' : '600'}
                fill={isHov ? 'var(--text)' : 'var(--muted)'}
              >
                {item.label.length > 13 ? `${item.label.slice(0, 12)}…` : item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DonutSvg({ items, lang }: { items: ChartItem[]; lang: Language }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const copy = AI_COPY[lang];
  const nonZero = items.filter(i => i.value > 0);
  const total = nonZero.reduce((s, i) => s + i.value, 0);

  if (total <= 0) {
    return <p className="py-6 text-center text-xs text-[var(--muted)]">{copy.noPositiveValues}</p>;
  }

  const size = 168;
  const cx = size / 2;
  const cy = size / 2;
  const r = 58;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  const activeItem = hoveredIdx !== null ? nonZero[hoveredIdx] : null;
  const activeShare = activeItem ? ((activeItem.value / total) * 100).toFixed(1) : null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
          {nonZero.map((item, idx) => {
            const len = (item.value / total) * circ;
            const dashArray = `${Math.max(0, len - 2)} ${circ}`;
            const dashOffset = -offset;
            offset += len;
            const isHov = hoveredIdx === idx;
            return (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={item.color ?? PALETTE[idx % PALETTE.length]}
                strokeWidth={isHov ? 26 : 21}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                opacity={hoveredIdx === null || isHov ? 1 : 0.45}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <title>{`${item.label}: ${fmtChartNum(item.value, lang)} (${((item.value / total) * 100).toFixed(1)}%)`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <span className="max-w-[90px] truncate text-[10px] font-semibold text-[var(--muted)]">
            {activeItem ? activeItem.label : copy.total}
          </span>
          <strong className="text-sm font-semibold text-[var(--text)] tabular-nums">
            {fmtChartNum(activeItem ? activeItem.value : total, lang)}
          </strong>
          {activeShare && (
            <span className="text-[10px] font-bold text-[var(--accent)] tabular-nums">{activeShare}%</span>
          )}
        </div>
      </div>

      <div className="grid w-full flex-1 gap-1.5">
        {nonZero.map((item, idx) => {
          const share = ((item.value / total) * 100).toFixed(1);
          const isHov = hoveredIdx === idx;
          return (
            <div
              key={idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition ${
                isHov ? 'bg-[var(--surface-2)]' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color ?? PALETTE[idx % PALETTE.length] }}
                />
                <span className="truncate font-semibold text-[var(--text)]">{item.label}</span>
              </div>
              <div className="shrink-0 tabular-nums">
                <span className="font-semibold text-[var(--text)]">{fmtChartNum(item.value, lang)}</span>
                <span className="ml-1.5 text-[11px] text-[var(--muted)]">({share}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LineTrendSvg({ items, lang }: { items: ChartItem[]; lang: Language }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const gradId = useId().replace(/:/g, '');
  const copy = AI_COPY[lang];
  const w = 640;
  const h = 220;
  const padL = 54;
  const padR = 18;
  const padT = 22;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const hasSecondary = items.some(i => i.secondaryValue !== undefined);
  const allVals = items.flatMap(i => [i.value, i.secondaryValue ?? 0]);
  const maxVal = Math.max(1, ...allVals) * 1.1;
  const minVal = Math.min(0, ...allVals);
  const span = Math.max(1, maxVal - minVal);

  const xOf = (idx: number) =>
    items.length <= 1 ? padL + plotW / 2 : padL + (idx / (items.length - 1)) * plotW;
  const yOf = (v: number) => padT + plotH - ((v - minVal) / span) * plotH;

  const linePts = items.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.value).toFixed(1)}`).join(' ');
  const areaPts = items.length > 0
    ? `${xOf(0).toFixed(1)},${(padT + plotH).toFixed(1)} ${linePts} ${xOf(items.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)}`
    : '';
  const secPts = hasSecondary
    ? items
        .map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.secondaryValue ?? 0).toFixed(1)}`)
        .join(' ')
    : '';

  const hovered = hoveredIdx !== null ? items[hoveredIdx] : null;
  const stride = Math.max(1, Math.ceil(items.length / 7));

  return (
    <div className="grid gap-2">
      {hovered && (
        <div className="flex justify-end">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)] tabular-nums">
            <span className="mr-2">{hovered.label}:</span>
            <span className="text-[var(--accent)]">{fmtChartNum(hovered.value, lang)}</span>
            {hovered.secondaryValue !== undefined && (
              <span className="ml-2 text-[var(--muted)]">
                ({hovered.secondaryLabel ?? copy.planLimit}: {fmtChartNum(hovered.secondaryValue, lang)})
              </span>
            )}
          </div>
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} className="h-52 w-full overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ec5180" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#ec5180" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map(r => {
          const y = padT + plotH * (1 - r);
          const v = minVal + span * r;
          return (
            <g key={r}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="var(--border)" strokeDasharray="3 3" />
              <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
                {fmtChartNum(v, lang)}
              </text>
            </g>
          );
        })}

        {items.length > 1 && (
          <>
            <polygon points={areaPts} fill={`url(#${gradId})`} />
            {hasSecondary && (
              <polyline
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.8"
                strokeDasharray="5 4"
                points={secPts}
              />
            )}
            <polyline
              fill="none"
              stroke="#ec5180"
              strokeWidth="2.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={linePts}
            />
          </>
        )}

        {items.map((item, idx) => {
          const cx = xOf(idx);
          const cy = yOf(item.value);
          const isHov = hoveredIdx === idx;
          return (
            <g
              key={idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              {isHov && (
                <line x1={cx} y1={padT} x2={cx} y2={padT + plotH} stroke="var(--accent)" strokeDasharray="2 2" opacity={0.6} />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isHov ? 6 : 4}
                fill={item.color ?? '#ec5180'}
                stroke="var(--surface)"
                strokeWidth="2"
              >
                <title>{`${item.label}: ${fmtChartNum(item.value, lang)}`}</title>
              </circle>
              {isHov && (
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="800"
                  fill="var(--text)"
                  className="tabular-nums"
                >
                  {fmtChartNum(item.value, lang)}
                </text>
              )}
              {(idx % stride === 0 || idx === items.length - 1) && (
                <text
                  x={cx}
                  y={h - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isHov ? '800' : '600'}
                  fill={isHov ? 'var(--text)' : 'var(--muted)'}
                >
                  {item.label.length > 11 ? `${item.label.slice(0, 10)}…` : item.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HorizontalBars({ items, lang }: { items: ChartItem[]; lang: Language }) {
  const copy = AI_COPY[lang];
  const maxVal = Math.max(1, ...items.flatMap(i => [i.value, i.secondaryValue ?? 0]));
  return (
    <div className="grid gap-2.5">
      {items.map((item, idx) => {
        const pct = Math.min(100, Math.round((Math.max(0, item.value) / maxVal) * 100));
        const secPct =
          item.secondaryValue !== undefined
            ? Math.min(100, Math.round((Math.max(0, item.secondaryValue) / maxVal) * 100))
            : null;
        const delta = computeDeltaPct(item.value, item.secondaryValue);
        return (
          <div key={idx} className="grid gap-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-bold text-[var(--text)]">{item.label}</span>
                {delta !== null && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                      delta > 0
                        ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                        : 'bg-[var(--good-soft)] text-[var(--good)]'
                    }`}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta.toFixed(0)}%
                  </span>
                )}
              </div>
              <span className="shrink-0 font-semibold text-[var(--text)] tabular-nums">
                {fmtChartNum(item.value, lang)}
                {item.secondaryValue !== undefined && (
                  <span className="ml-1.5 font-normal text-[var(--muted)]">
                    ({item.secondaryLabel ?? copy.planLimit}: {fmtChartNum(item.secondaryValue, lang)})
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              {secPct !== null && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[#94a3b8]/40"
                  style={{ width: `${secPct}%` }}
                />
              )}
              <div
                className="relative h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: itemColor(item, idx),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentChartBlock({
  block,
  lang,
  pinBtn,
}: {
  block: ChartBlock;
  lang: Language;
  pinBtn: ReactNode;
}) {
  const copy = AI_COPY[lang];
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-semibold text-[var(--text)]">{block.title}</span>
            <span className="shrink-0 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--muted)]">
              {block.chartType}
            </span>
          </div>
          {block.subtitle && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{block.subtitle}</div>}
        </div>
        {pinBtn}
      </div>

      {block.items.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--muted)]">{copy.noData}</p>
      ) : block.chartType === 'bar' ? (
        <GroupedBarSvg items={block.items} lang={lang} />
      ) : block.chartType === 'donut' ? (
        <DonutSvg items={block.items} lang={lang} />
      ) : block.chartType === 'line' ? (
        <LineTrendSvg items={block.items} lang={lang} />
      ) : (
        <HorizontalBars items={block.items} lang={lang} />
      )}
    </div>
  );
}

export interface AgentBlocksProps {
  blocks: AgentUiBlock[];
  lang: Language;
  onAction: (action: AgentClientAction) => void;
  onPinBlock?: (block: AgentUiBlock) => void;
  actionBusyKey?: string | null;
}

export function AgentBlocks({
  blocks,
  lang,
  onAction,
  onPinBlock,
  actionBusyKey,
}: AgentBlocksProps) {
  const copy = AI_COPY[lang];

  return (
    <div className="grid gap-3">
      {blocks.map(block => {
        const canPin = Boolean(onPinBlock) && block.kind !== 'actions' && block.kind !== 'alert';
        const pinBtn = canPin && onPinBlock ? (
          <button
            type="button"
            onClick={() => onPinBlock(block)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-bold text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Icon name="pin" size={12} />
            {copy.pinToDashboard}
          </button>
        ) : null;

        if (block.kind === 'kpis') {
          return (
            <div key={block.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text)]">{block.title ?? 'KPIs'}</span>
                {pinBtn}
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {block.items.map((item, idx) => {
                  const toneCls =
                    item.tone === 'good'
                      ? 'text-[var(--good)]'
                      : item.tone === 'bad'
                        ? 'text-[var(--bad)]'
                        : item.tone === 'warn'
                          ? 'text-[var(--warn)]'
                          : 'text-[var(--text)]';
                  return (
                    <div key={idx} className="rounded-xl border border-[var(--border)]/60 bg-[var(--surface-2)] p-2.5">
                      <div className="text-[11px] font-semibold text-[var(--muted)]">{item.label}</div>
                      <div className={`mt-1 text-sm font-semibold tabular-nums ${toneCls}`}>{item.value}</div>
                      {item.sublabel && (
                        <div className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{item.sublabel}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        if (block.kind === 'alert') {
          const style =
            block.severity === 'critical'
              ? 'border-[var(--bad)] bg-[var(--bad-soft)] text-[var(--bad)]'
              : block.severity === 'warning'
                ? 'border-[var(--warn)] bg-[var(--warn-soft)] text-[var(--warn)]'
                : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]';
          return (
            <div key={block.id} className={`rounded-2xl border p-3.5 ${style}`}>
              <div className="text-xs font-semibold">{block.title}</div>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{block.body}</p>
            </div>
          );
        }

        if (block.kind === 'chart') {
          return <AgentChartBlock key={block.id} block={block} lang={lang} pinBtn={pinBtn} />;
        }

        if (block.kind === 'table') {
          const hl = new Set(block.highlightRowIndices ?? []);
          return (
            <div key={block.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text)]">{block.title}</span>
                {pinBtn}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs text-[var(--text)]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
                      {block.columns.map((col, idx) => (
                        <th key={idx} className="px-2 py-1.5 font-bold">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={`border-b border-[var(--border)]/60 ${
                          hl.has(rIdx) ? 'bg-[var(--accent-soft)]/70 font-semibold' : ''
                        }`}
                      >
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-2 py-1.5 tabular-nums">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        if (block.kind === 'map') {
          return (
            <div key={block.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text)]">{block.title}</span>
                {pinBtn}
              </div>
              <TashkentDistrictMap
                districts={block.districts}
                branches={block.branches}
                heatmapCells={block.heatmapCells}
                metric={block.metric}
                lang={lang}
                selectedDistrictId={block.highlightDistrictId}
                compact
                onSelectDistrict={districtId =>
                  onAction({
                    type: 'set_filters',
                    districtId,
                    label: districtId,
                  })
                }
              />
            </div>
          );
        }

        if (block.kind === 'allocation') {
          const alloc = block.allocation;
          return (
            <div key={block.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-[var(--text)]">{block.title}</div>
                  <div className="text-[11px] text-[var(--muted)] tabular-nums">
                    {copy.pool}: {formatMoney(alloc.totalBudget, lang)} · +{formatMoney(alloc.expectedTotalProfitLift, lang)}
                  </div>
                </div>
                {pinBtn}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs text-[var(--text)]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
                      <th className="px-2 py-1.5 font-bold">{copy.branch}</th>
                      <th className="px-2 py-1.5 font-bold">{copy.roi}</th>
                      <th className="px-2 py-1.5 font-bold">{copy.score}</th>
                      <th className="px-2 py-1.5 font-bold">{copy.current}</th>
                      <th className="px-2 py-1.5 font-bold">{copy.aiBudget}</th>
                      <th className="px-2 py-1.5 font-bold">{copy.delta}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alloc.branches.map(b => (
                      <tr key={b.restaurantId} className="border-b border-[var(--border)]/60">
                        <td className="px-2 py-1.5 font-bold">{b.name}</td>
                        <td className="px-2 py-1.5 tabular-nums">{b.roiPct}%</td>
                        <td className="px-2 py-1.5 font-bold text-[var(--accent)] tabular-nums">{b.efficiencyScore}</td>
                        <td className="px-2 py-1.5 tabular-nums">{formatCompactMoney(b.currentBudget, lang)}</td>
                        <td className="px-2 py-1.5 font-semibold tabular-nums">{formatCompactMoney(b.recommendedBudget, lang)}</td>
                        <td className={`px-2 py-1.5 font-bold tabular-nums ${b.deltaPct >= 0 ? 'text-[var(--good)]' : 'text-[var(--warn)]'}`}>
                          {b.deltaPct >= 0 ? '+' : ''}
                          {b.deltaPct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        if (block.kind === 'actions') {
          return (
            <div key={block.id} className="grid gap-1.5">
              {block.title && (
                <div className="text-[11px] font-bold text-[var(--muted)]">{block.title}</div>
              )}
              <div className="flex flex-wrap gap-2">
                {block.actions.map((act, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={Boolean(actionBusyKey)}
                    onClick={() => onAction(act)}
                    className="btn-secondary min-h-[34px] px-3 py-1.5 text-xs"
                  >
                    <Icon name="zap" size={13} className="text-[var(--accent)]" />
                    {act.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
