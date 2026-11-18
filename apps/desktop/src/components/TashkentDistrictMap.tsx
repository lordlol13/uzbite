import { useId, useState } from 'react';
import {
  TASHKENT_DISTRICTS,
  type DistrictBranchMarker,
  type DistrictStatItem,
  type Language,
  type OrderHeatmapCell,
  type TashkentDistrictId,
} from '@uzbite/shared';
import { fmtCompactMoney, fmtMoney } from '../lib/i18n';

export type DistrictMapMetric = 'orders' | 'revenue' | 'avgCheck' | 'deliveryMargin';

const MIN_LNG = 69.118;
const MAX_LNG = 69.481;
const MIN_LAT = 41.160;
const MAX_LAT = 41.402;
const COS_LAT = Math.cos((41.281 * Math.PI) / 180);
const SVG_W = 720;
const SVG_H = 520;
const PAD_X = 24;
const PAD_Y = 20;

const SPAN_X = (MAX_LNG - MIN_LNG) * COS_LAT;
const SPAN_Y = MAX_LAT - MIN_LAT;
const MAP_SCALE = Math.min((SVG_W - PAD_X * 2) / SPAN_X, (SVG_H - PAD_Y * 2) / SPAN_Y);
const OFFSET_X = (SVG_W - SPAN_X * MAP_SCALE) / 2;
const OFFSET_Y = (SVG_H - SPAN_Y * MAP_SCALE) / 2;

// 3.5 km service radius projected onto Tashkent (~41.28 deg N) with aspect-true scale
const RADIUS_KM = 3.5;
const DEG_LAT_35 = RADIUS_KM / 111.32;
const SERVICE_RX = Number((DEG_LAT_35 * MAP_SCALE).toFixed(1));
const SERVICE_RY = SERVICE_RX;

function project(lng: number, lat: number): [number, number] {
  const x = OFFSET_X + (lng - MIN_LNG) * COS_LAT * MAP_SCALE;
  const y = SVG_H - OFFSET_Y - (lat - MIN_LAT) * MAP_SCALE;
  return [Number(x.toFixed(1)), Number(y.toFixed(1))];
}

function metricValue(d: DistrictStatItem | undefined, metric: DistrictMapMetric): number {
  if (!d) return 0;
  return d[metric];
}

function fillForDistrict(
  d: DistrictStatItem | undefined,
  metric: DistrictMapMetric,
  maxPositive: number,
  minimal?: boolean,
): string {
  if (minimal) {
    if (!d || d.orders === 0) return 'var(--surface-2)';
    const val = metricValue(d, metric);
    const intensity = Math.max(0.08, Math.min(1, val / Math.max(1, maxPositive)));
    return `rgba(129, 114, 255, ${(0.06 + intensity * 0.14).toFixed(2)})`;
  }
  if (!d || d.orders === 0) return 'var(--surface-2)';
  const val = metricValue(d, metric);
  if (metric === 'deliveryMargin' && val < 0) {
    return 'rgba(213, 76, 79, 0.45)';
  }
  const intensity = Math.max(0.15, Math.min(1, val / Math.max(1, maxPositive)));
  if (metric === 'deliveryMargin') {
    return `rgba(54, 184, 154, ${(0.22 + intensity * 0.65).toFixed(2)})`;
  }
  return `rgba(236, 81, 128, ${(0.16 + intensity * 0.68).toFixed(2)})`;
}

export function TashkentDistrictMap({
  districts,
  branches = [],
  heatmapCells = [],
  metric,
  lang,
  selectedDistrictId,
  onSelectDistrict,
  showHeatLayer: controlledHeat,
  onToggleHeatLayer,
  showServiceRadius: controlledRadius,
  onToggleServiceRadius,
  compact = false,
  minimal = false,
}: {
  districts: DistrictStatItem[];
  branches?: DistrictBranchMarker[];
  heatmapCells?: OrderHeatmapCell[];
  metric: DistrictMapMetric;
  lang: Language;
  selectedDistrictId?: TashkentDistrictId | '';
  onSelectDistrict?: (districtId: TashkentDistrictId) => void;
  showHeatLayer?: boolean;
  onToggleHeatLayer?: () => void;
  showServiceRadius?: boolean;
  onToggleServiceRadius?: () => void;
  compact?: boolean;
  minimal?: boolean;
}) {
  const [hoveredId, setHoveredId] = useState<TashkentDistrictId | null>(null);
  const [internalHeat, setInternalHeat] = useState(true);
  const [internalRadius, setInternalRadius] = useState(true);
  const heatGradId = useId().replace(/:/g, '');

  const showHeatLayer = controlledHeat ?? internalHeat;
  const showServiceRadius = controlledRadius ?? internalRadius;
  const toggleHeat = onToggleHeatLayer ?? (() => setInternalHeat(v => !v));
  const toggleRadius = onToggleServiceRadius ?? (() => setInternalRadius(v => !v));

  const statMap = new Map(districts.map(d => [d.districtId, d]));
  const maxPositive = Math.max(1, ...districts.map(d => Math.max(0, metricValue(d, metric))));
  const maxHeatOrders = Math.max(1, ...heatmapCells.map(c => c.orders));

  const activeId = hoveredId ?? (selectedDistrictId || null);
  const activeStat = activeId ? statMap.get(activeId) : null;

  const formatMetric = (val: number) => {
    if (metric === 'orders') return `${val}`;
    return fmtCompactMoney(val, lang);
  };

  return (
    <div className="relative">
      {!minimal && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleHeat}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                showHeatLayer
                  ? 'border-[#ec5180]/50 bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#ec5180]" />
              {lang === 'uz' ? 'Issiqlik xaritasi' : lang === 'ru' ? 'Тепловой слой' : 'Heatmap Grid'}
              {heatmapCells.length > 0 && <span className="opacity-75">({heatmapCells.length})</span>}
            </button>

            <button
              type="button"
              onClick={toggleRadius}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                showServiceRadius
                  ? 'border-[#36b89a]/50 bg-[var(--mint-soft)] text-[var(--mint)]'
                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]'
              }`}
            >
              <span className="h-2 w-2 rounded-full border border-[#36b89a]" />
              {lang === 'uz' ? '3.5 km radius' : lang === 'ru' ? 'Радиус 3.5 км' : '3.5km Coverage'}
            </button>
          </div>

          {activeStat && (
            <div className="flex flex-wrap items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1 text-xs tabular-nums">
              <strong className="font-semibold">{activeStat.name[lang]}</strong>
              <span>{activeStat.orders} ord ({activeStat.sharePct}%)</span>
              <span className="font-semibold text-[var(--accent)]">{fmtMoney(activeStat.revenue, lang)}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  activeStat.growthPct >= 0
                    ? 'bg-[var(--good-soft)] text-[var(--good)]'
                    : 'bg-[var(--bad-soft)] text-[var(--bad)]'
                }`}
              >
                {activeStat.growthPct >= 0 ? '+' : ''}
                {activeStat.growthPct.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className={`${compact ? 'max-h-[260px]' : 'max-h-[480px]'} w-full rounded-xl border border-[var(--border)] ${
          minimal ? 'bg-[var(--surface-2)]' : 'bg-[var(--bg)]'
        }`}
      >
        <defs>
          <radialGradient id={heatGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ec5180" stopOpacity="0.82" />
            <stop offset="48%" stopColor="#8172ff" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#8172ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Subtle coordinate grid */}
        {[0.25, 0.5, 0.75].map(r => (
          <g key={r} opacity={minimal ? 0.55 : 0.35}>
            <line x1={0} y1={SVG_H * r} x2={SVG_W} y2={SVG_H * r} stroke="var(--border-strong)" strokeDasharray="4 4" />
            <line x1={SVG_W * r} y1={0} x2={SVG_W * r} y2={SVG_H} stroke="var(--border-strong)" strokeDasharray="4 4" />
          </g>
        ))}

        {/* 12 Tashkent District Polygons (OpenStreetMap administrative boundaries) */}
        {[...TASHKENT_DISTRICTS]
          .sort((a, b) => {
            const rank = (id: TashkentDistrictId) =>
              id === selectedDistrictId ? 2 : id === hoveredId ? 1 : 0;
            return rank(a.id) - rank(b.id);
          })
          .map(shape => {
            const stat = statMap.get(shape.id);
            const isSelected = selectedDistrictId === shape.id;
            const isHovered = hoveredId === shape.id;
            const pointsStr = shape.polygon
              .map(([lng, lat]) => project(lng, lat).join(','))
              .join(' ');
            const fill = fillForDistrict(stat, metric, maxPositive, minimal);

            return (
              <polygon
                key={shape.id}
                points={pointsStr}
                fill={fill}
                stroke={isSelected ? 'var(--accent)' : isHovered ? 'var(--accent-2)' : 'var(--border-strong)'}
                strokeWidth={isSelected ? 2.4 : isHovered ? 1.8 : 1.1}
                strokeLinejoin="round"
                onMouseEnter={() => setHoveredId(shape.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelectDistrict?.(shape.id)}
                className={onSelectDistrict ? 'cursor-pointer transition-colors' : undefined}
              />
            );
          })}

        {/* District Labels Layer */}
        {!minimal && (
          <g className="pointer-events-none select-none">
            {TASHKENT_DISTRICTS.map(shape => {
              const stat = statMap.get(shape.id);
              const [cx, cy] = project(shape.center.longitude, shape.center.latitude);
              return (
                <g key={`label-${shape.id}`}>
                  <text
                    x={cx}
                    y={cy - 3}
                    textAnchor="middle"
                    fontSize="10.5"
                    fontWeight="600"
                    fill="var(--text)"
                    stroke="var(--bg)"
                    strokeWidth="2.8"
                    strokeLinejoin="round"
                    paintOrder="stroke"
                  >
                    {shape.shortName[lang]}
                  </text>
                  {stat && stat.orders > 0 && (
                    <text
                      x={cx}
                      y={cy + 10}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="600"
                      fill="var(--text)"
                      stroke="var(--bg)"
                      strokeWidth="2.6"
                      strokeLinejoin="round"
                      paintOrder="stroke"
                      className="tabular-nums"
                    >
                      {formatMetric(metricValue(stat, metric))}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* Privacy-safe ~500m Order Heatmap Grid Layer */}
        {!minimal && showHeatLayer && heatmapCells.length > 0 && (
          <g className="pointer-events-none">
            {heatmapCells.map((cell, idx) => {
              const [hx, hy] = project(cell.lngCenter, cell.latCenter);
              const ratio = Math.max(0.2, Math.min(1, cell.orders / maxHeatOrders));
              const glowR = 11 + ratio * 18;
              return (
                <g key={`${cell.districtId}-${idx}`}>
                  <circle
                    cx={hx}
                    cy={hy}
                    r={glowR}
                    fill={`url(#${heatGradId})`}
                    opacity={0.4 + ratio * 0.55}
                  />
                  <rect
                    x={hx - 4.5}
                    y={hy - 4.5}
                    width={9}
                    height={9}
                    rx={2.5}
                    fill={ratio > 0.65 ? '#ec5180' : '#8172ff'}
                    fillOpacity={0.35 + ratio * 0.45}
                    stroke="#ffffff"
                    strokeOpacity={0.65}
                    strokeWidth={0.8}
                  />
                </g>
              );
            })}
          </g>
        )}

        {/* Branch Service-Area Coverage Radii (~3.5 km) */}
        {!minimal && showServiceRadius && (
          <g className="pointer-events-none">
            {branches.map(branch => {
              const [bx, by] = project(branch.longitude, branch.latitude);
              return (
                <ellipse
                  key={`radius-${branch.id}`}
                  cx={bx}
                  cy={by}
                  rx={SERVICE_RX}
                  ry={SERVICE_RY}
                  fill="rgba(54, 184, 154, 0.08)"
                  stroke="#36b89a"
                  strokeWidth="1.4"
                  strokeDasharray="5 4"
                  opacity={0.85}
                />
              );
            })}
          </g>
        )}

        {/* Branch Markers (pulsing Dribbble violet radar pins) */}
        {branches.map((branch, idx) => {
          const [bx, by] = project(branch.longitude, branch.latitude);
          return (
            <g key={branch.id} className="pointer-events-none">
              <circle
                cx={bx}
                cy={by}
                r={minimal ? 16 : 13}
                fill="rgba(129, 114, 255, 0.24)"
                className={minimal && idx === 0 ? 'animate-radar-pulse' : undefined}
                style={{ transformOrigin: `${bx}px ${by}px` }}
              />
              <circle
                cx={bx}
                cy={by}
                r={minimal ? 6.5 : 5.5}
                fill="#8172ff"
                stroke="#ffffff"
                strokeWidth="2"
              >
                <title>{`${branch.name} (${branch.orders} orders)`}</title>
              </circle>
              {!minimal && (
                <text
                  x={bx + 8}
                  y={by + 3}
                  fontSize="9.5"
                  fontWeight="600"
                  fill="var(--text)"
                  stroke="var(--surface)"
                  strokeWidth="2.6"
                  paintOrder="stroke"
                >
                  {branch.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
