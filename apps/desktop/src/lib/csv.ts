import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@uzbite/shared';

export interface ParsedCsvExpenseRow {
  supplierName: string | null;
  category: ExpenseCategory | null;
  itemName: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number;
  invoiceNumber: string | null;
  spentAt: string;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseExpensesCsv(csvText: string): ParsedCsvExpenseRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0]!;
  const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';
  const headers = splitCsvLine(headerLine, delimiter).map(h => h.toLowerCase());

  const idx = (names: string[]) => headers.findIndex(h => names.includes(h));
  const iSup = idx(['suppliername', 'supplier', 'поставщик']);
  const iCat = idx(['category', 'категория']);
  const iItem = idx(['itemname', 'item', 'позиция', 'товар']);
  const iDesc = idx(['description', 'desc', 'описание']);
  const iQty = idx(['quantity', 'qty', 'количество']);
  const iUnit = idx(['unit', 'единица']);
  const iPrice = idx(['unitprice', 'price', 'цена']);
  const iAmt = idx(['amount', 'total', 'сумма']);
  const iInv = idx(['invoicenumber', 'invoice', 'накладная']);
  const iDate = idx(['spentat', 'date', 'дата']);

  const catSet = new Set<string>(EXPENSE_CATEGORIES);
  const rows: ParsedCsvExpenseRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!, delimiter);
    const get = (colIndex: number): string => (colIndex >= 0 ? (cols[colIndex] ?? '').trim() : '');
    const num = (colIndex: number): number | null => {
      const v = get(colIndex).replace(/\s+/g, '').replace(',', '.');
      if (!v) return null;
      const parsed = Number(v);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const amount = num(iAmt);
    const description = get(iDesc) || get(iItem);
    if (!amount || amount <= 0 || !description) continue;

    const rawCat = get(iCat).toUpperCase();
    const category = catSet.has(rawCat) ? (rawCat as ExpenseCategory) : null;

    rows.push({
      supplierName: get(iSup) || null,
      category,
      itemName: get(iItem) || description.slice(0, 50),
      description,
      quantity: num(iQty),
      unit: get(iUnit) || null,
      unitPrice: num(iPrice),
      amount,
      invoiceNumber: get(iInv) || null,
      spentAt: get(iDate) || new Date().toISOString().slice(0, 10),
    });
  }

  return rows;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null>>) {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const content = '\uFEFF' + [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
