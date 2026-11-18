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
} from '../lib/api';
import { downloadCsv, parseExpensesCsv, type ParsedCsvExpenseRow } from '../lib/csv';
import { CATEGORY_COLORS, CATEGORY_LABELS, COPY, fmtMoney } from '../lib/i18n';

const DEMO_CSV_SAMPLE = `supplierName,category,itemName,description,quantity,unit,unitPrice,amount,invoiceNumber,spentAt
Chorvoq Go'sht База,INGREDIENTS,Говядина мякоть,Повторная накладная на говядину из CSV-выгрузки,50,кг,82000,4100000,INV-2026-1104,${new Date().toISOString().slice(0, 10)}
Toshkent Elektr & Kommunal,,Электроэнергия ТЭЦ,Оплата электроэнергии цеха за ноябрь,,кВт,,1350000,EL-2026-551,${new Date().toISOString().slice(0, 10)}
Uztelecom Business,,Интернет и облачная АТС,Корпоративный тариф интернета и связи,1,мес,490000,490000,TEL-2026-11,${new Date().toISOString().slice(0, 10)}
EcoPack Tashkent,PACKAGING,Стаканы и крышки,Упаковка для напитков и соусники,2000,шт,350,700000,PK-2026-309,${new Date().toISOString().slice(0, 10)}
Toshkent Elektr & Kommunal,MARKETING,Счёт за газ и воду,Газ и вода на кухне (ошибочно поставлен Маркетинг),1,мес,990000,990000,GAS-2026-44,${new Date().toISOString().slice(0, 10)}`;

export function ExpensesPage({
  lang,
  expenses,
  onMutated,
}: {
  lang: Language;
  expenses: ExpenseDto[];
  onMutated: () => Promise<void>;
}) {
  const t = COPY[lang];
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<ExpenseCategory | ''>('');
  const [panel, setPanel] = useState<'none' | 'add' | 'csv' | 'ocr'>('none');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

        {statusMsg && (
          <span className="rounded-lg bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
            {statusMsg}
          </span>
        )}
      </div>

      {/* Add Expense Drawer */}
      {panel === 'add' && (
        <form onSubmit={handleAddSubmit} className="card grid gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-sm font-extrabold">{t.addExpense}</h2>
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
            <h2 className="m-0 text-sm font-extrabold">{t.importCsv}</h2>
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
            <h2 className="m-0 text-sm font-extrabold">{t.ocrExtract}</h2>
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

      {/* Search & Filter + Ledger Table */}
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap gap-3">
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
            <option value="">{t.all}</option>
            {EXPENSE_CATEGORIES.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c][lang]}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border)] text-[var(--muted)]">
              <tr>
                <th className="py-2.5 pr-3">{t.date}</th>
                <th className="py-2.5 pr-3">{t.category}</th>
                <th className="py-2.5 pr-3">{t.item}</th>
                <th className="py-2.5 pr-3">{t.supplier}</th>
                <th className="py-2.5 pr-3">{t.invoice}</th>
                <th className="py-2.5 pr-3 text-right">{t.qty} × {t.unitPrice}</th>
                <th className="py-2.5 pr-3 text-right">{t.amount}</th>
                <th className="py-2.5 pr-3">{t.source}</th>
                <th className="py-2.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => (
                <tr key={exp.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">{exp.spentAt.slice(0, 10)}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] font-semibold">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[exp.category] }}
                      />
                      {CATEGORY_LABELS[exp.category][lang]}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="font-bold">{exp.itemName}</div>
                    <div className="max-w-xs truncate text-[11px] text-[var(--muted)]">{exp.description}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--muted)]">{exp.supplierName ?? '—'}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{exp.invoiceNumber ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular-nums text-[var(--muted)]">
                    {exp.quantity && exp.unitPrice ? `${exp.quantity} ${exp.unit ?? ''} × ${fmtMoney(exp.unitPrice, lang)}` : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-extrabold whitespace-nowrap tabular-nums">
                    {fmtMoney(exp.amount, lang)}
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
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-[var(--muted)]">{t.noData}</p>
          )}
        </div>
      </div>
    </div>
  );
}
