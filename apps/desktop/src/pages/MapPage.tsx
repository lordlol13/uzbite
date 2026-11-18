import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TASHKENT_DISTRICTS, type Language, type TashkentDistrictId } from '@uzbite/shared';
import { TashkentDistrictMap, type DistrictMapMetric } from '../components/TashkentDistrictMap';
import { fetchDistrictAnalytics } from '../lib/api';
import { fmtCompactMoney, fmtMoney } from '../lib/i18n';

function GrowthBadge({ pct }: { pct: number }) {
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        positive ? 'bg-[var(--good-soft)] text-[var(--good)]' : 'bg-[var(--bad-soft)] text-[var(--bad)]'
      }`}
    >
      {positive ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

export function MapPage({
  lang,
  from,
  to,
  selectedDistrictId,
  onSelectDistrict,
  onAskAgentAboutDistrict,
}: {
  lang: Language;
  from: string;
  to: string;
  selectedDistrictId: TashkentDistrictId | '';
  onSelectDistrict: (id: TashkentDistrictId | '') => void;
  onAskAgentAboutDistrict: (prompt: string) => void;
}) {
  const [metric, setMetric] = useState<DistrictMapMetric>('orders');
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [showHeatLayer, setShowHeatLayer] = useState(true);
  const [showServiceRadius, setShowServiceRadius] = useState(true);

  const query = useQuery({
    queryKey: ['business-geo-districts', from, to, scope],
    queryFn: () => fetchDistrictAnalytics(from, to, scope),
  });

  const data = query.data;
  const selectedStat =
    data?.districts.find(d => d.districtId === selectedDistrictId) ?? data?.topDistrict ?? null;

  return (
    <div className="grid gap-5">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="m-0 text-base font-semibold">
            {lang === 'uz'
              ? 'Toshkent tumanlari bo‘yicha buyurtmalar va yetkazish xaritasi'
              : lang === 'ru'
                ? 'Карта клиентов и заказов по 12 районам Ташкента'
                : 'Tashkent 12 Districts Demand & Delivery Margin Map'}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {lang === 'uz'
              ? 'Mijozlar qaysi tumandan kelishi, masofa, yetkazish xarajati va yangi filial nuqtalari.'
              : lang === 'ru'
                ? 'Анализ географии спроса, тепловых кластеров, маржинальности доставки и зон роста.'
                : 'Identify top client districts, heatmap clusters, delivery profitability, and 3.5km branch coverage.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xs font-bold">
            {(['all', 'current'] as const).map(sc => (
              <button
                key={sc}
                type="button"
                onClick={() => setScope(sc)}
                className={`px-3 py-1.5 ${scope === sc ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}
              >
                {sc === 'all'
                  ? lang === 'uz' ? 'Barcha filiallar' : lang === 'ru' ? 'Вся сеть' : 'All Branches'
                  : lang === 'uz' ? 'Faqat joriy filial' : lang === 'ru' ? 'Текущий филиал' : 'Current Branch'}
              </button>
            ))}
          </div>

          <select
            className="input-field max-w-[180px] text-xs font-bold"
            value={selectedDistrictId}
            onChange={e => onSelectDistrict(e.target.value as TashkentDistrictId | '')}
          >
            <option value="">
              {lang === 'uz' ? 'Barcha 12 tuman' : lang === 'ru' ? 'Все 12 районов' : 'All 12 Districts'}
            </option>
            {TASHKENT_DISTRICTS.map(d => (
              <option key={d.id} value={d.id}>
                {d.name[lang]}
              </option>
            ))}
          </select>

          <select
            className="input-field max-w-[180px] text-xs font-bold"
            value={metric}
            onChange={e => setMetric(e.target.value as DistrictMapMetric)}
          >
            <option value="orders">{lang === 'uz' ? 'Buyurtmalar soni' : lang === 'ru' ? 'Количество заказов' : 'Orders Count'}</option>
            <option value="revenue">{lang === 'uz' ? 'Tushum (UZS)' : lang === 'ru' ? 'Выручка (UZS)' : 'Revenue (UZS)'}</option>
            <option value="avgCheck">{lang === 'uz' ? 'O‘rtacha chek' : lang === 'ru' ? 'Средний чек' : 'Avg Order Value'}</option>
            <option value="deliveryMargin">{lang === 'uz' ? 'Yetkazish marjasi' : lang === 'ru' ? 'Маржа доставки' : 'Delivery Margin'}</option>
          </select>
        </div>
      </div>

      {query.isLoading && (
        <div className="card p-8 text-center text-xs text-[var(--muted)]">Loading map analytics...</div>
      )}

      {data && (
        <>
          {/* Summary Insights Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                {lang === 'uz' ? 'Eng faol tuman' : lang === 'ru' ? 'Топ-источник клиентов' : 'Top Client District'}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-base font-semibold text-[var(--good)]">
                  {data.topDistrict ? data.topDistrict.name[lang] : '—'}
                </span>
                {data.topDistrict && <GrowthBadge pct={data.topDistrict.growthPct} />}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)] tabular-nums">
                {data.topDistrict
                  ? `${data.topDistrict.orders} (${data.topDistrict.sharePct}%) · ${fmtCompactMoney(data.topDistrict.revenue, lang)}`
                  : '—'}
              </div>
            </div>

            <div className="card p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                {lang === 'uz' ? 'Yangi filial / marketing uchun hudud' : lang === 'ru' ? 'Зоны роста (далеко от филиалов)' : 'Underserved Growth Zones'}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-base font-semibold text-[var(--warn)]">
                  {data.underservedDistricts[0]?.name[lang] ?? '—'}
                </span>
                {data.underservedDistricts[0] && <GrowthBadge pct={data.underservedDistricts[0].growthPct} />}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {data.underservedDistricts.length > 0
                  ? `${data.underservedDistricts.length} districts (>5.2 km avg distance)`
                  : 'All districts well covered'}
              </div>
            </div>

            <div className="card p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                {lang === 'uz' ? 'Zararli yetkazish tumanlari (#26)' : lang === 'ru' ? 'Убыточная доставка (#26)' : 'Loss-Making Delivery (#26)'}
              </div>
              <div className="mt-1 text-base font-semibold text-[var(--bad)]">
                {data.lossMakingDeliveryDistricts.length}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {data.lossMakingDeliveryDistricts.slice(0, 2).map(d => d.name[lang]).join(', ') || 'No loss zones'}
              </div>
            </div>
          </div>

          {/* Map + District Inspector */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="card grid gap-3 p-5 xl:col-span-2" data-widget-id="widget-map-districts">
              <TashkentDistrictMap
                districts={data.districts}
                branches={data.branches}
                heatmapCells={data.heatmapCells}
                metric={metric}
                lang={lang}
                selectedDistrictId={selectedDistrictId}
                onSelectDistrict={id => onSelectDistrict(selectedDistrictId === id ? '' : id)}
                showHeatLayer={showHeatLayer}
                onToggleHeatLayer={() => setShowHeatLayer(v => !v)}
                showServiceRadius={showServiceRadius}
                onToggleServiceRadius={() => setShowServiceRadius(v => !v)}
              />

              {/* Visual Legend */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--muted)]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-6 rounded-full bg-gradient-to-r from-[#ec5180]/25 to-[#ec5180]" />
                    {metric === 'deliveryMargin'
                      ? (lang === 'uz' ? 'Foydali zona' : lang === 'ru' ? 'Прибыльная доставка' : 'Profitable Margin')
                      : (lang === 'uz' ? 'Talab darajasi' : lang === 'ru' ? 'Плотность спроса' : 'Demand Intensity')}
                  </span>
                  {metric === 'deliveryMargin' && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#d54c4f]/60" />
                      {lang === 'uz' ? 'Zararli zona' : lang === 'ru' ? 'Убыточная зона' : 'Loss Zone'}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ec5180]" />
                    {lang === 'uz' ? '~500m issiqlik klasteri' : lang === 'ru' ? 'Кластер ~500м' : '~500m Heat Cell'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[#36b89a] bg-[#36b89a]/20" />
                    {lang === 'uz' ? '3.5 km qamrov' : lang === 'ru' ? 'Зона 3.5 км' : '3.5km Branch Zone'}
                  </span>
                </div>
                <span className="text-[10px] opacity-80">Tashkent 12 Districts GeoJSON</span>
              </div>
            </div>

            <div className="card flex flex-col justify-between p-5">
              {selectedStat ? (
                <div className="grid gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                          {selectedStat.status}
                        </span>
                        <GrowthBadge pct={selectedStat.growthPct} />
                      </div>
                      <h2 className="m-0 mt-1.5 text-base font-semibold">{selectedStat.name[lang]}</h2>
                    </div>
                    {selectedDistrictId && (
                      <button
                        type="button"
                        onClick={() => onSelectDistrict('')}
                        className="text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                    <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                      <div className="text-[var(--muted)]">Orders / Share</div>
                      <div className="mt-0.5 font-semibold">{selectedStat.orders} ({selectedStat.sharePct}%)</div>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                      <div className="text-[var(--muted)]">Revenue</div>
                      <div className="mt-0.5 font-semibold">{fmtCompactMoney(selectedStat.revenue, lang)}</div>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                      <div className="text-[var(--muted)]">Avg Distance / ETA</div>
                      <div className="mt-0.5 font-semibold">{selectedStat.avgDistanceKm} km · {selectedStat.avgDeliveryMinutes}m</div>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                      <div className="text-[var(--muted)]">Delivery Margin</div>
                      <div className={`mt-0.5 font-semibold ${selectedStat.deliveryMargin < 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'}`}>
                        {fmtMoney(selectedStat.deliveryMargin, lang)}
                      </div>
                    </div>
                    <div className="col-span-2 rounded-xl bg-[var(--surface-2)] p-2.5">
                      <div className="text-[var(--muted)]">Nearest Branch</div>
                      <div className="mt-0.5 font-semibold">{selectedStat.nearestBranchName}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">Click any district on the map to inspect details.</p>
              )}

              <button
                type="button"
                onClick={() =>
                  onAskAgentAboutDistrict(
                    selectedStat
                      ? lang === 'uz'
                        ? `${selectedStat.name.uz} tumanidagi buyurtmalar, yetkazish xarajati va o'sish imkoniyatlarini tahlil qil`
                        : lang === 'ru'
                          ? `Проанализируй район ${selectedStat.name.ru}: заказы, маржу доставки и рекомендации`
                          : `Analyze ${selectedStat.name.en}: orders, delivery margin, and growth recommendations`
                      : 'Which districts bring the most orders?',
                  )
                }
                className="btn-primary mt-4 w-full text-xs"
              >
                {lang === 'uz'
                  ? 'AI Agentdan bu tuman haqida so‘rash →'
                  : lang === 'ru'
                    ? 'Спросить AI-агента про этот район →'
                    : 'Ask AI Agent about this district →'}
              </button>
            </div>
          </div>

          {/* Full 12 Districts Table */}
          <div className="card p-5">
            <h2 className="m-0 mb-3 text-sm font-semibold">
              {lang === 'uz' ? 'Tumanlar bo‘yicha batafsil statistika' : lang === 'ru' ? 'Сводка по районам Ташкента' : 'Tashkent Districts Breakdown'}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
                    <th className="px-2.5 py-2">District</th>
                    <th className="px-2.5 py-2">Orders</th>
                    <th className="px-2.5 py-2">Growth</th>
                    <th className="px-2.5 py-2">Share</th>
                    <th className="px-2.5 py-2">Clients</th>
                    <th className="px-2.5 py-2">Revenue</th>
                    <th className="px-2.5 py-2">Avg Check</th>
                    <th className="px-2.5 py-2">Distance</th>
                    <th className="px-2.5 py-2">Delivery Margin</th>
                    <th className="px-2.5 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.districts.map(d => (
                    <tr
                      key={d.districtId}
                      onClick={() => onSelectDistrict(selectedDistrictId === d.districtId ? '' : d.districtId)}
                      className={`cursor-pointer border-b border-[var(--border)]/60 hover:bg-[var(--surface-2)] ${
                        selectedDistrictId === d.districtId ? 'bg-[var(--accent-soft)]/50' : ''
                      }`}
                    >
                      <td className="px-2.5 py-2 font-bold">{d.name[lang]}</td>
                      <td className="px-2.5 py-2 tabular-nums font-bold">{d.orders}</td>
                      <td className="px-2.5 py-2 tabular-nums"><GrowthBadge pct={d.growthPct} /></td>
                      <td className="px-2.5 py-2 tabular-nums">{d.sharePct}%</td>
                      <td className="px-2.5 py-2 tabular-nums">{d.uniqueClients}</td>
                      <td className="px-2.5 py-2 tabular-nums font-bold">{fmtMoney(d.revenue, lang)}</td>
                      <td className="px-2.5 py-2 tabular-nums">{fmtMoney(d.avgCheck, lang)}</td>
                      <td className="px-2.5 py-2 tabular-nums">{d.avgDistanceKm} km</td>
                      <td className={`px-2.5 py-2 tabular-nums font-bold ${d.deliveryMargin < 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'}`}>
                        {fmtMoney(d.deliveryMargin, lang)}
                      </td>
                      <td className="px-2.5 py-2">
                        <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold">
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
