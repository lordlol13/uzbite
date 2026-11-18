import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseClassificationResult,
  type ExpenseDto,
  type Language,
} from '@uzbite/shared';
import {
  classifyExpense,
  createExpense,
  deleteExpense,
  extractOcrDraft,
  importExpensesCsv,
  updateExpense,
} from '../lib/api';
import { downloadCsv, parseExpensesCsv, type ParsedCsvExpenseRow } from '../lib/csv';
import {
  ADDITIONAL_EXPENSE_CATEGORIES,
  BASE_EXPENSE_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  COPY,
  EXPENSE_GROUP_META,
  PRIORITY_EXPENSE_CATEGORIES,
  fmtCompactMoney,
  fmtMoney,
  getExpenseGroup,
  type ExpenseGroupId,
} from '../lib/i18n';

const DEMO_CSV_SAMPLE = `supplierName,category,itemName,description,quantity,unit,unitPrice,amount,invoiceNumber,spentAt
Chorvoq Go'sht База,INGREDIENTS,Говядина мякоть,Повторная накладная на говядину из CSV-выгрузки,50,кг,82000,4100000,INV-2026-1104,${new Date().toISOString().slice(0, 10)}
Toshkent Elektr & Kommunal,,Электроэнергия ТЭЦ,Оплата электроэнергии цеха за ноябрь,,кВт,,1350000,EL-2026-551,${new Date().toISOString().slice(0, 10)}
Uztelecom Business,,Интернет и облачная АТС,Корпоративный тариф интернета и связи,1,мес,490000,490000,TEL-2026-11,${new Date().toISOString().slice(0, 10)}
EcoPack Tashkent,PACKAGING,Стаканы и крышки,Упаковка для напитков и соусники,2000,шт,350,700000,PK-2026-309,${new Date().toISOString().slice(0, 10)}
Toshkent Elektr & Kommunal,MARKETING,Счёт за газ и воду,Газ и вода на кухне (ошибочно поставлен Маркетинг),1,мес,990000,990000,GAS-2026-44,${new Date().toISOString().slice(0, 10)}`;

export function ExpensesPage({
  lang,
  expenses,
  loading = false,
  from,
  to,
  showAllDates = false,
  onToggleAllDates,
  onDateRangeChange,
  groupFilter: controlledGroup,
  onGroupFilterChange,
  onMutated,
}: {
  lang: Language;
  expenses: ExpenseDto[];
  loading?: boolean;
  from: string;
  to: string;
  showAllDates?: boolean;
  onToggleAllDates?: (showAll: boolean) => void;
  onDateRangeChange?: (from: string, to: string) => void;
  groupFilter?: ExpenseGroupId;
  onGroupFilterChange?: (group: ExpenseGroupId) => void;
  onMutated: () => Promise<void>;
}) {
  const t = COPY[lang];
  const [search, setSearch] = useState('');
  const [internalGroup, setInternalGroup] = useState<ExpenseGroupId>('ALL');
  const groupFilter = controlledGroup ?? internalGroup;
  const [catFilter, setCatFilter] = useState<ExpenseCategory | ''>('');
  const [panel, setPanel] = useState<'none' | 'add' | 'csv' | 'ocr'>('none');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setGroupFilter(next: ExpenseGroupId) {
    if (onGroupFilterChange) {
      onGroupFilterChange(next);
    } else {
      setInternalGroup(next);
    }
    if (catFilter && next !== 'ALL' && !EXPENSE_GROUP_META[next].categories.includes(catFilter)) {
      setCatFilter('');
    }
  }

  // Add form state
  const [supplierName, setSupplierName] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('INGREDIENTS');
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('кг');
  const [unitPrice, setUnitPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [classification, setClassification] = useState<ExpenseClassificationResult | null>(null);

  // CSV preview
  const [csvRows, setCsvRows] = useState<ParsedCsvExpenseRow[]>([]);

  // OCR draft
  const [ocrText, setOcrText] = useState(
    'Поставщик: ООО Toshkent Elektr & Kommunal\nСчёт № EL-9921\nДата: ' +
      new Date().toISOString().slice(0, 10) +
      '\nЭлектроэнергия кухни и холодильных камер\nИтого: 1480000 UZS',
  );

  const filtered = expenses.filter(e => {
    if (groupFilter !== 'ALL' && getExpenseGroup(e.category) !== groupFilter) return false;
    if (catFilter && e.category !== catFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.itemName.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (e.supplierName ?? '').toLowerCase().includes(q) ||
      (e.invoiceNumber ?? '').toLowerCase().includes(q)
    );
  });

  const totalAmount = Math.max(
    1,
    expenses.reduce((s, e) => s + e.amount, 0),
  );
  const taxesRows = expenses.filter(e => e.category === 'TAXES');
  const taxesSum = taxesRows.reduce((s, e) => s + e.amount, 0);

  const elecRows = expenses.filter(
    e => e.category === 'UTILITIES' || e.category === 'COMMUNICATION',
  );
  const elecSum = elecRows.reduce((s, e) => s + e.amount, 0);
  const totalKwh = elecRows
    .filter(e => e.unit && /квт|kwh/i.test(e.unit) && e.quantity != null)
    .reduce((s, e) => s + (e.quantity ?? 0), 0);

  const baseRows = expenses.filter(e => BASE_EXPENSE_CATEGORIES.includes(e.category));
  const baseSum = baseRows.reduce((s, e) => s + e.amount, 0);

  const additionalRows = expenses.filter(e => ADDITIONAL_EXPENSE_CATEGORIES.includes(e.category));
  const additionalSum = additionalRows.reduce((s, e) => s + e.amount, 0);

  const filteredSum = filtered.reduce((s, e) => s + e.amount, 0);
  const availableCategoriesForSelect =
    groupFilter === 'ALL' ? EXPENSE_CATEGORIES : EXPENSE_GROUP_META[groupFilter].categories;

  async function handleClassify() {
    const text = `${itemName} ${description}`.trim();
    if (!text) return;
    const result = await classifyExpense(text);
    setClassification(result);
    setCategory(result.category);
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatusMsg(null);
    try {
      await createExpense({
        supplierName: supplierName.trim() || null,
        category,
        itemName: itemName.trim() || description.slice(0, 40),
        description: description.trim(),
        amount: Number(amount),
        quantity: quantity ? Number(quantity) : null,
        unit: unit.trim() || null,
        unitPrice: unitPrice ? Number(unitPrice) : null,
        invoiceNumber: invoiceNumber.trim() || null,
        spentAt,
        source: 'MANUAL',
      });
      setPanel('none');
      setItemName('');
      setDescription('');
      setAmount('');
      setQuantity('');
      setUnitPrice('');
      setInvoiceNumber('');
      setClassification(null);
      await onMutated();
      setStatusMsg('OK');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  function handleCsvFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setCsvRows(parseExpensesCsv(text));
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleCsvImport(rowsToImport: ParsedCsvExpenseRow[]) {
    if (rowsToImport.length === 0) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await importExpensesCsv(rowsToImport.map(r => ({ ...r })));
      setCsvRows([]);
      setPanel('none');
      await onMutated();
      setStatusMsg(`Imported ${res.importedCount} rows · ${res.findingsTriggered} findings active`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleOcrExtract() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const draft = await extractOcrDraft({ rawText: ocrText });
      setSupplierName(draft.supplierName);
      setCategory(draft.category);
      setItemName(draft.itemName);
      setDescription(draft.itemName);
      setQuantity(String(draft.quantity));
      setUnit(draft.unit);
      setUnitPrice(String(draft.unitPrice));
      setAmount(String(draft.amount));
      setInvoiceNumber(draft.invoiceNumber);
      setSpentAt(draft.spentAt);
      setPanel('add');
      setStatusMsg(`OCR (${Math.round(draft.confidence * 100)}%)`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await deleteExpense(id);
      await onMutated();
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleVerify(exp: ExpenseDto) {
    setBusy(true);
    try {
      await updateExpense(exp.id, { isVerified: !exp.isVerified });
      await onMutated();
    } finally {
      setBusy(false);
    }
  }

  function handleExportCsv() {
    downloadCsv(
      `uzbite-expenses-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Category', 'Supplier', 'Item', 'Description', 'Qty', 'Unit', 'UnitPrice', 'Amount', 'Invoice', 'Source'],
      filtered.map(e => [
        e.spentAt.slice(0, 10),
        e.category,
        e.supplierName,
        e.itemName,
        e.description,
        e.quantity,
        e.unit,
        e.unitPrice,
        e.amount,
        e.invoiceNumber,
        e.source,
      ]),
    );
  }

  return (
    <div className="grid gap-5">
      {/* Priority Expense Spotlight Strip: Taxes, Electricity/Utilities, Base, Additional */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setGroupFilter('PRIORITY');
            setCatFilter('TAXES');
          }}
          className={`card flex items-center justify-between gap-3 p-4 text-left transition hover:-translate-y-0.5 ${
            catFilter === 'TAXES' ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/30' : ''
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                {t.priorityBadge}
              </span>
              <span className="truncate text-xs font-medium text-[var(--muted)]">{t.taxes}</span>
            </div>
            <div className="mt-1.5 text-base font-semibold tabular-nums text-[var(--text)]">
              {fmtCompactMoney(taxesSum, lang)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
              {taxesRows.length} {lang === 'ru' ? 'поз.' : lang === 'uz' ? 'ta' : 'items'} ·{' '}
              {((taxesSum / totalAmount) * 100).toFixed(1)}%
            </div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bad-soft)] text-[11px] font-bold text-[var(--bad)] tabular-nums">
            {((taxesSum / totalAmount) * 100).toFixed(0)}%
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setGroupFilter('PRIORITY');
            setCatFilter('UTILITIES');
          }}
          className={`card flex items-center justify-between gap-3 p-4 text-left transition hover:-translate-y-0.5 ${
            catFilter === 'UTILITIES' ? 'border-[var(--accent-3)] ring-1 ring-[var(--accent-3)]/30' : ''
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: 'rgba(255, 138, 71, 0.14)', color: 'var(--accent-3)' }}
              >
                {t.priorityBadge}
              </span>
              <span className="truncate text-xs font-medium text-[var(--muted)]">
                {t.electricityUtilities}
              </span>
            </div>
            <div className="mt-1.5 text-base font-semibold tabular-nums text-[var(--text)]">
              {fmtCompactMoney(elecSum, lang)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
              {totalKwh > 0
                ? `${new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU').format(Math.round(totalKwh))} ${lang === 'en' ? 'kWh' : 'кВт·ч'}`
                : `${elecRows.length} ${lang === 'ru' ? 'поз.' : lang === 'uz' ? 'ta' : 'items'}`}{' '}
              · {((elecSum / totalAmount) * 100).toFixed(1)}%
            </div>
          </div>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold tabular-nums"
            style={{ background: 'rgba(255, 138, 71, 0.14)', color: 'var(--accent-3)' }}
          >
            {((elecSum / totalAmount) * 100).toFixed(0)}%
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setGroupFilter('BASE');
            setCatFilter('');
          }}
          className={`card flex items-center justify-between gap-3 p-4 text-left transition hover:-translate-y-0.5 ${
            groupFilter === 'BASE' && !catFilter ? 'border-[var(--mint)] ring-1 ring-[var(--mint)]/30' : ''
          }`}
        >
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-[var(--muted)]">
              {EXPENSE_GROUP_META.BASE.shortLabel[lang]} ·{' '}
              {lang === 'ru' ? 'Сырьё, ФОТ, Аренда' : lang === 'uz' ? 'Masalliq, Haq, Ijara' : 'Ingredients, Payroll, Rent'}
            </div>
            <div className="mt-1.5 text-base font-semibold tabular-nums text-[var(--text)]">
              {fmtCompactMoney(baseSum, lang)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
              {baseRows.length} {lang === 'ru' ? 'поз.' : lang === 'uz' ? 'ta' : 'items'} ·{' '}
              {((baseSum / totalAmount) * 100).toFixed(1)}%
            </div>
          </div>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold tabular-nums"
            style={{ background: 'var(--mint-soft)', color: 'var(--mint)' }}
          >
            {((baseSum / totalAmount) * 100).toFixed(0)}%
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setGroupFilter('ADDITIONAL');
            setCatFilter('');
          }}
          className={`card flex items-center justify-between gap-3 p-4 text-left transition hover:-translate-y-0.5 ${
            groupFilter === 'ADDITIONAL' && !catFilter
              ? 'border-[var(--accent-2)] ring-1 ring-[var(--accent-2)]/30'
              : ''
          }`}
        >
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-[var(--muted)]">
              {EXPENSE_GROUP_META.ADDITIONAL.shortLabel[lang]} ·{' '}
              {lang === 'ru' ? 'Упаковка, Доставка, Маркетинг' : lang === 'uz' ? 'Qadoq, Yetkazish, Marketing' : 'Pack, Delivery, Marketing'}
            </div>
            <div className="mt-1.5 text-base font-semibold tabular-nums text-[var(--text)]">
              {fmtCompactMoney(additionalSum, lang)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
              {additionalRows.length} {lang === 'ru' ? 'поз.' : lang === 'uz' ? 'ta' : 'items'} ·{' '}
              {((additionalSum / totalAmount) * 100).toFixed(1)}%
            </div>
          </div>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold tabular-nums"
            style={{ background: 'rgba(129, 114, 255, 0.14)', color: 'var(--accent-2)' }}
          >
            {((additionalSum / totalAmount) * 100).toFixed(0)}%
          </span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPanel(panel === 'add' ? 'none' : 'add')} className="btn-primary">
            {t.addExpense}
          </button>
          <button type="button" onClick={() => setPanel(panel === 'csv' ? 'none' : 'csv')} className="btn-secondary">
            {t.importCsv}
          </button>
          <button type="button" onClick={() => setPanel(panel === 'ocr' ? 'none' : 'ocr')} className="btn-secondary">
            {t.ocrExtract}
          </button>
          <button type="button" onClick={handleExportCsv} className="btn-secondary">
            {t.exportCsv}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onToggleAllDates && (
            <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => onToggleAllDates(false)}
                className={`rounded-full px-3 py-1 tabular-nums transition ${
                  !showAllDates
                    ? 'bg-[var(--cta-bg)] text-[var(--cta-text)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {t.activePeriod}: {from === to ? from : `${from} — ${to}`}
              </button>
              <button
                type="button"
                onClick={() => onToggleAllDates(true)}
                className={`rounded-full px-3 py-1 transition ${
                  showAllDates
                    ? 'bg-[var(--cta-bg)] text-[var(--cta-text)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {t.allDates}
              </button>
            </div>
          )}

          {statusMsg && (
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
              {statusMsg}
            </span>
          )}
        </div>
      </div>

      {/* Add Expense Drawer */}
      {panel === 'add' && (
        <form onSubmit={handleAddSubmit} className="card grid gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-sm font-semibold">{t.addExpense}</h2>
            <button type="button" onClick={handleClassify} className="btn-secondary text-xs">
              {t.autoClassify}
            </button>
          </div>

          {classification && (
            <div className="rounded-xl bg-[var(--accent-soft)] px-3.5 py-2 text-xs text-[var(--text)]">
              <strong>{CATEGORY_LABELS[classification.category][lang]}</strong> ({Math.round(classification.confidence * 100)}% {t.classifyConfidence}): {classification.reason[lang]}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              {t.item}
              <input className="input-field" value={itemName} onChange={e => setItemName(e.target.value)} required />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              {t.category}
              <select
                className="input-field"
                value={category}
                onChange={e => setCategory(e.target.value as ExpenseCategory)}
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c][lang]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              {t.supplier}
              <input className="input-field" value={supplierName} onChange={e => setSupplierName(e.target.value)} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)] md:col-span-2">
              {t.description}
              <input className="input-field" value={description} onChange={e => setDescription(e.target.value)} required />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              {t.date}
              <input type="date" className="input-field" value={spentAt} onChange={e => setSpentAt(e.target.value)} required />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              {t.qty}
              <input type="number" step="0.001" className="input-field" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              {t.unitPrice}
              <input type="number" step="1" className="input-field" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              {t.amount}
              <input type="number" step="1" className="input-field" value={amount} onChange={e => setAmount(e.target.value)} required />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              {t.unit}
              <input className="input-field" value={unit} onChange={e => setUnit(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              {t.invoice}
              <input className="input-field" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPanel('none')} className="btn-secondary">{t.cancel}</button>
            <button type="submit" disabled={busy} className="btn-primary">{t.save}</button>
          </div>
        </form>
      )}

      {/* CSV Import Panel */}
      {panel === 'csv' && (
        <div className="card grid gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-semibold">{t.importCsv}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleCsvImport(parseExpensesCsv(DEMO_CSV_SAMPLE))}
              className="btn-secondary text-xs"
            >
              {t.loadDemoCsv}
            </button>
          </div>

          <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="text-xs" />

          {csvRows.length > 0 && (
            <div className="grid gap-3">
              <div className="max-h-48 overflow-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-2)] text-[var(--muted)]">
                    <tr>
                      <th className="p-2">{t.date}</th>
                      <th className="p-2">{t.supplier}</th>
                      <th className="p-2">{t.item}</th>
                      <th className="p-2">{t.category}</th>
                      <th className="p-2 text-right">{t.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((r, i) => (
                      <tr key={i} className="border-t border-[var(--border)]">
                        <td className="p-2 tabular-nums">{r.spentAt}</td>
                        <td className="p-2">{r.supplierName ?? '—'}</td>
                        <td className="p-2">{r.itemName}</td>
                        <td className="p-2">{r.category ? CATEGORY_LABELS[r.category][lang] : 'AI Auto'}</td>
                        <td className="p-2 text-right font-bold tabular-nums">{fmtMoney(r.amount, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCsvRows([])} className="btn-secondary">{t.cancel}</button>
                <button type="button" disabled={busy} onClick={() => handleCsvImport(csvRows)} className="btn-primary">
                  {t.importCsv} ({csvRows.length})
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI OCR Draft Panel */}
      {panel === 'ocr' && (
        <div className="card grid gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-semibold">{t.ocrExtract}</h2>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setOcrText(
                    `Поставщик: Chorvoq Go'sht База\nНакладная № CG-402\nДата: ${new Date().toISOString().slice(0, 10)}\nГовядина мякоть\n30 кг x 82000\nИтого: 2460000 UZS`,
                  )
                }
              >
                Sample: Meat
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setOcrText(
                    `Поставщик: Uztelecom Business\nСчёт № UZT-2026-89\nДата: ${new Date().toISOString().slice(0, 10)}\nКорпоративный интернет и IP-телефония\nИтого: 520000 UZS`,
                  )
                }
              >
                Sample: Telecom
              </button>
            </div>
          </div>
          <textarea
            rows={5}
            className="input-field font-mono text-xs"
            value={ocrText}
            onChange={e => setOcrText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPanel('none')} className="btn-secondary">{t.cancel}</button>
            <button type="button" disabled={busy} onClick={handleOcrExtract} className="btn-primary">{t.ocrExtract}</button>
          </div>
        </div>
      )}

      {/* Search & Group Filter + Ledger Table */}
      <div className="card p-5">
        {/* Category Group Pills */}
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="no-scrollbar flex flex-wrap items-center gap-1.5">
            {(['ALL', 'PRIORITY', 'BASE', 'ADDITIONAL'] as const).map(g => {
              const active = groupFilter === g && !catFilter;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGroupFilter(g);
                    setCatFilter('');
                  }}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'border-transparent bg-[var(--cta-bg)] text-[var(--cta-text)] shadow-xs'
                      : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'
                  }`}
                >
                  {EXPENSE_GROUP_META[g].label[lang]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs tabular-nums">
            <span className="text-[var(--muted)]">
              {t.filteredTotal} ({filtered.length}):
            </span>
            <strong className="font-semibold text-[var(--text)]">{fmtMoney(filteredSum, lang)}</strong>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            className="input-field max-w-sm"
            placeholder={t.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="input-field max-w-xs"
            value={catFilter}
            onChange={e => setCatFilter(e.target.value as ExpenseCategory | '')}
          >
            <option value="">{EXPENSE_GROUP_META[groupFilter].label[lang]}</option>
            {availableCategoriesForSelect.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c][lang]}</option>
            ))}
          </select>

          {onDateRangeChange && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs">
              <span className="text-[11px] font-medium text-[var(--muted)]">{t.dateFrom}</span>
              <input
                type="date"
                aria-label={t.dateFrom}
                className="bg-transparent text-xs font-medium text-[var(--text)] outline-none tabular-nums"
                value={from}
                onChange={e => {
                  const val = e.target.value;
                  if (val) {
                    onToggleAllDates?.(false);
                    onDateRangeChange(val, val > to ? val : to);
                  }
                }}
              />
              <span className="text-[11px] font-medium text-[var(--muted)]">{t.dateTo}</span>
              <input
                type="date"
                aria-label={t.dateTo}
                className="bg-transparent text-xs font-medium text-[var(--text)] outline-none tabular-nums"
                value={to}
                onChange={e => {
                  const val = e.target.value;
                  if (val) {
                    onToggleAllDates?.(false);
                    onDateRangeChange(val < from ? val : from, val);
                  }
                }}
              />
            </div>
          )}
        </div>

        {loading ? (
          <p className="py-8 text-center text-xs text-[var(--muted)]">
            {lang === 'ru' ? 'Загрузка расходов...' : lang === 'uz' ? 'Xarajatlar yuklanmoqda...' : 'Loading expenses...'}
          </p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border)] text-[var(--muted)]">
              <tr>
                <th className="py-2.5 pr-3">{t.date}</th>
                <th className="py-2.5 pr-3">{t.category}</th>
                <th className="py-2.5 pr-3">{t.item}</th>
                <th className="py-2.5 pr-3">{t.supplier}</th>
                <th className="py-2.5 pr-3">{t.invoice}</th>
                <th className="py-2.5 pr-3 text-right">{t.qty} · {t.unit}</th>
                <th className="py-2.5 pr-3 text-right">{t.amount}</th>
                <th className="py-2.5 pr-3">{t.status}</th>
                <th className="py-2.5 pr-3">{t.source}</th>
                <th className="py-2.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => {
                const isPriority = PRIORITY_EXPENSE_CATEGORIES.includes(exp.category);
                const qtyText =
                  exp.quantity != null && exp.unitPrice != null
                    ? `${exp.quantity} ${exp.unit ?? ''} × ${fmtMoney(exp.unitPrice, lang)}`
                    : exp.quantity != null
                      ? `${exp.quantity} ${exp.unit ?? ''}`.trim()
                      : exp.unit
                        ? exp.unit
                        : '—';
                return (
                <tr
                  key={exp.id}
                  className={`border-b border-[var(--border)] last:border-0 ${
                    isPriority ? 'bg-[var(--accent-soft)]/25' : ''
                  }`}
                >
                  <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">{exp.spentAt.slice(0, 10)}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-semibold">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[exp.category] }}
                        />
                        {CATEGORY_LABELS[exp.category][lang]}
                      </span>
                      {isPriority && (
                        <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9.5px] font-semibold text-[var(--accent)]">
                          {t.priorityBadge}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="font-bold">{exp.itemName}</div>
                    <div className="max-w-xs truncate text-[11px] text-[var(--muted)]">{exp.description}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--muted)]">{exp.supplierName ?? '—'}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {exp.invoiceNumber ? (
                      <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--text)]">
                        {exp.invoiceNumber}
                      </code>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular-nums text-[var(--muted)]">
                    {qtyText}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold whitespace-nowrap tabular-nums">
                    {fmtMoney(exp.amount, lang)}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleToggleVerify(exp)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                        exp.isVerified
                          ? 'bg-[var(--good-soft)] text-[var(--good)] hover:brightness-95'
                          : 'bg-[var(--warn-soft)] text-[var(--warn)] hover:brightness-95'
                      }`}
                    >
                      <span>{exp.isVerified ? '✓' : '•'}</span>
                      <span>{exp.isVerified ? t.verified : t.unverified}</span>
                    </button>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                      {exp.source}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(exp.id)}
                      className="text-[11px] font-bold text-[var(--bad)] hover:underline"
                    >
                      {t.delete}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-[var(--muted)]">{t.noData}</p>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
