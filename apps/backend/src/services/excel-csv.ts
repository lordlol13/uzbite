import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import type {
  MenuImportConflictMode,
  MenuImportPreviewResponse,
  MenuImportPreviewRow,
  MenuImportResultDto,
  RestaurantStatisticsDto,
} from '@uzbite/shared';
import { db } from '../config/database.js';
import { ApiError, assert } from '../utils/errors.js';

export const MENU_IMPORT_SCHEMA_VERSION = 'uzbite-menu-v1';
export const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 5000;
export const MAX_SPREADSHEET_COLS = 30;

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
const NEGATIVE_NUMBER_RE = /^-\d+([.,]\d+)?$/;

export function isFormulaInjection(rawValue: unknown): boolean {
  if (rawValue && typeof rawValue === 'object') {
    if ('formula' in rawValue || 'sharedFormula' in rawValue) return true;
    return false;
  }
  if (typeof rawValue !== 'string') return false;
  const trimmed = rawValue.trim();
  if (!trimmed) return false;
  if (NEGATIVE_NUMBER_RE.test(trimmed)) return false;
  return FORMULA_PREFIX_RE.test(trimmed);
}

export function sanitizeSpreadsheetText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (FORMULA_PREFIX_RE.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const safe = FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
  if (/[",;\r\n]/.test(safe) || safe.startsWith(' ') || safe.endsWith(' ')) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

export function serializeCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): Buffer {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(row => row.map(escapeCsvCell).join(',')),
  ];
  return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
}

export function parseCsvText(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let firstLine = '';
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (ch === '\n' || ch === '\r') break;
    firstLine += ch;
  }
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const delimiter = semiCount > commaCount ? ';' : ',';

  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (ch === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  return rows;
}

export function detectSpreadsheetFormat(fileName: string, buffer: Buffer): 'xlsx' | 'csv' {
  const lower = fileName.toLowerCase();
  assert(buffer.length > 0, 400, 'EMPTY_FILE', 'Загруженный файл пуст');
  assert(buffer.length <= MAX_SPREADSHEET_BYTES, 400, 'FILE_TOO_LARGE', 'Файл превышает лимит 5 МБ');

  if (lower.endsWith('.xlsm') || lower.endsWith('.xlsb') || lower.endsWith('.xls')) {
    throw new ApiError(400, 'UNSUPPORTED_FORMAT', 'Поддерживаются только безопасные форматы .xlsx и .csv без макросов');
  }

  const isZip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  if (lower.endsWith('.xlsx')) {
    assert(isZip, 400, 'INVALID_XLSX', 'Файл не является корректным документом Excel (.xlsx)');
    return 'xlsx';
  }
  if (lower.endsWith('.csv')) {
    assert(!isZip && !buffer.includes(0x00), 400, 'INVALID_CSV', 'Содержимое файла не соответствует текстовому CSV');
    return 'csv';
  }
  throw new ApiError(400, 'UNSUPPORTED_FORMAT', 'Поддерживаются только файлы .xlsx и .csv');
}

export function parseStrictPrice(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: false, error: 'Цена обязательна' };
  }
  if (isFormulaInjection(raw)) {
    return { ok: false, error: 'Формулы в ячейке цены запрещены' };
  }
  let num: number;
  if (typeof raw === 'number') {
    num = raw;
  } else {
    const cleaned = String(raw)
      .trim()
      .replace(/[\s\u00A0\u202F]/g, '')
      .replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
      return { ok: false, error: 'Некорректный числовой формат цены' };
    }
    const parts = cleaned.split('.');
    if (parts[1] && parts[1].length > 2) {
      return { ok: false, error: 'Допускается не более 2 знаков после запятой' };
    }
    num = Number(cleaned);
  }
  if (!Number.isFinite(num)) {
    return { ok: false, error: 'Цена должна быть конечным числом' };
  }
  if (num < 0) {
    return { ok: false, error: 'Цена не может быть отрицательной' };
  }
  if (num > 1_000_000_000) {
    return { ok: false, error: 'Цена превышает максимально допустимое значение' };
  }
  return { ok: true, value: Math.round(num * 100) / 100 };
}

export function parseAvailability(raw: unknown): { ok: true; value: boolean } | { ok: false; error: string } {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: true, value: true };
  }
  if (typeof raw === 'boolean') return { ok: true, value: raw };
  if (typeof raw === 'number') {
    if (raw === 1) return { ok: true, value: true };
    if (raw === 0) return { ok: true, value: false };
    return { ok: false, error: 'Некорректное значение доступности' };
  }
  const normalized = String(raw).trim().toLowerCase();
  if (['да', 'yes', 'true', '1', 'в наличии', 'доступно', 'mavjud', 'ha'].includes(normalized)) {
    return { ok: true, value: true };
  }
  if (['нет', 'no', 'false', '0', 'нет в наличии', 'недоступно', 'mavjud emas', "yo'q", 'yo‘q'].includes(normalized)) {
    return { ok: true, value: false };
  }
  return { ok: false, error: 'Доступность должна быть Да/Нет или true/false' };
}

function cellRawToStringOrNumber(raw: unknown): { value: string; formulaError: boolean } {
  if (raw === null || raw === undefined) return { value: '', formulaError: false };
  if (isFormulaInjection(raw)) return { value: String(raw), formulaError: true };
  if (typeof raw === 'object') {
    if ('richText' in raw && Array.isArray((raw as { richText: Array<{ text?: string }> }).richText)) {
      const text = (raw as { richText: Array<{ text?: string }> }).richText.map(part => part.text ?? '').join('');
      return { value: text, formulaError: isFormulaInjection(text) };
    }
    if ('text' in raw && typeof (raw as { text?: unknown }).text === 'string') {
      const text = (raw as { text: string }).text;
      return { value: text, formulaError: isFormulaInjection(text) };
    }
    if ('result' in raw) {
      return { value: String((raw as { result?: unknown }).result ?? ''), formulaError: true };
    }
  }
  const str = String(raw);
  return { value: str, formulaError: false };
}

export interface RawTableRow {
  rowNumber: number;
  cells: Array<{ raw: unknown; text: string; formulaError: boolean }>;
}

export async function readSpreadsheetTable(
  fileName: string,
  buffer: Buffer,
): Promise<{ format: 'xlsx' | 'csv'; headers: string[]; rows: RawTableRow[] }> {
  const format = detectSpreadsheetFormat(fileName, buffer);

  if (format === 'csv') {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new ApiError(400, 'INVALID_ENCODING', 'Файл CSV должен быть в кодировке UTF-8');
    }
    const matrix = parseCsvText(text);
    assert(matrix.length >= 1, 400, 'EMPTY_FILE', 'CSV файл не содержит заголовков');
    const headers = matrix[0]!.map(h => h.trim());
    assert(headers.length <= MAX_SPREADSHEET_COLS, 400, 'TOO_MANY_COLUMNS', `Максимум ${MAX_SPREADSHEET_COLS} столбцов`);
    assert(matrix.length - 1 <= MAX_SPREADSHEET_ROWS, 400, 'TOO_MANY_ROWS', `Максимум ${MAX_SPREADSHEET_ROWS} строк`);

    const rows: RawTableRow[] = [];
    for (let i = 1; i < matrix.length; i++) {
      const line = matrix[i]!;
      if (line.every(c => c.trim() === '')) continue;
      rows.push({
        rowNumber: i + 1,
        cells: line.slice(0, MAX_SPREADSHEET_COLS).map(cell => ({
          raw: cell,
          text: cell.trim(),
          formulaError: isFormulaInjection(cell),
        })),
      });
    }
    return { format, headers, rows };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new ApiError(400, 'INVALID_XLSX', 'Не удалось прочитать файл Excel (.xlsx)');
  }
  const sheet = workbook.worksheets[0];
  assert(sheet, 400, 'EMPTY_FILE', 'В книге Excel отсутствуют листы');
  assert(sheet.columnCount <= MAX_SPREADSHEET_COLS, 400, 'TOO_MANY_COLUMNS', `Максимум ${MAX_SPREADSHEET_COLS} столбцов`);
  assert(sheet.rowCount - 1 <= MAX_SPREADSHEET_ROWS, 400, 'TOO_MANY_ROWS', `Максимум ${MAX_SPREADSHEET_ROWS} строк`);

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  const colLimit = Math.min(Math.max(headerRow.cellCount, sheet.columnCount), MAX_SPREADSHEET_COLS);
  for (let c = 1; c <= colLimit; c++) {
    const parsed = cellRawToStringOrNumber(headerRow.getCell(c).value);
    headers.push(parsed.value.trim());
  }
  assert(headers.some(Boolean), 400, 'EMPTY_HEADERS', 'Первая строка должна содержать заголовки столбцов');

  const rows: RawTableRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: Array<{ raw: unknown; text: string; formulaError: boolean }> = [];
    let hasContent = false;
    for (let c = 1; c <= headers.length; c++) {
      const raw = row.getCell(c).value;
      const parsed = cellRawToStringOrNumber(raw);
      if (parsed.value.trim() !== '') hasContent = true;
      cells.push({ raw, text: parsed.value.trim(), formulaError: parsed.formulaError });
    }
    if (!hasContent) continue;
    rows.push({ rowNumber: r, cells });
  }
  return { format, headers, rows };
}

type ColumnKey = 'id' | 'sku' | 'name' | 'description' | 'category' | 'price' | 'costPrice' | 'isAvailable';

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  id: ['id', 'идентификатор', 'dishid'],
  sku: ['sku', 'артикул', 'artikul', 'код', 'code'],
  name: ['название', 'name', 'nomi', 'блюдо', 'наименование'],
  description: ['описание', 'description', 'tavsif'],
  category: ['категория', 'category', 'kategoriya'],
  price: ['цена', 'цена (uzs)', 'price', 'narx', 'стоимость'],
  costPrice: ['себестоимость', 'cost', 'costprice', 'tannarx'],
  isAvailable: ['доступность', 'available', 'isavailable', 'mavjudligi', 'статус'],
};

function resolveColumnIndices(
  headers: string[],
  customMapping?: Partial<Record<ColumnKey, string>>,
): Record<ColumnKey, number> {
  const normalized = headers.map(h => h.trim().toLowerCase());
  const result = {} as Record<ColumnKey, number>;
  for (const key of Object.keys(HEADER_ALIASES) as ColumnKey[]) {
    const customName = customMapping?.[key]?.trim().toLowerCase();
    if (customName) {
      result[key] = normalized.indexOf(customName);
      continue;
    }
    const aliases = HEADER_ALIASES[key];
    result[key] = normalized.findIndex(h => aliases.includes(h));
  }
  return result;
}

export async function createMenuImportPreview(params: {
  restaurantId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
  conflictMode: MenuImportConflictMode;
  columnMapping?: Partial<Record<ColumnKey, string>>;
}): Promise<MenuImportPreviewResponse> {
  const { format, headers, rows } = await readSpreadsheetTable(params.fileName, params.buffer);
  const cols = resolveColumnIndices(headers, params.columnMapping);
  assert(
    cols.name >= 0 && cols.price >= 0 && cols.category >= 0,
    400,
    'MISSING_REQUIRED_COLUMNS',
    'В файле должны присутствовать обязательные столбцы: Название, Категория, Цена',
  );

  const [existingDishes, existingCategories] = await Promise.all([
    db.dish.findMany({
      where: { restaurantId: params.restaurantId, isArchived: false },
      include: { category: { select: { id: true, name: true } } },
    }),
    db.restaurantCategory.findMany({
      where: { restaurantId: params.restaurantId },
      select: { id: true, name: true },
    }),
  ]);

  const dishById = new Map(existingDishes.map(d => [d.id, d]));
  const dishBySku = new Map(
    existingDishes.filter(d => d.sku).map(d => [d.sku!.trim().toLowerCase(), d]),
  );
  const dishByName = new Map(existingDishes.map(d => [d.name.trim().toLowerCase(), d]));
  const categorySet = new Set(existingCategories.map(c => c.name.trim().toLowerCase()));

  const seenSkus = new Set<string>();
  const seenNames = new Set<string>();
  const newCategoriesSet = new Set<string>();

  const previewRows: MenuImportPreviewRow[] = [];
  const rowErrorRecords: Array<{
    rowNumber: number;
    sku: string | null;
    dishName: string | null;
    field: string | null;
    errorCode: string;
    message: string;
    rawRow: Record<string, unknown>;
  }> = [];

  for (const row of rows) {
    const cellAt = (colIdx: number) => (colIdx >= 0 ? row.cells[colIdx] : undefined);
    const idCell = cellAt(cols.id);
    const skuCell = cellAt(cols.sku);
    const nameCell = cellAt(cols.name);
    const descCell = cellAt(cols.description);
    const catCell = cellAt(cols.category);
    const priceCell = cellAt(cols.price);
    const availCell = cellAt(cols.isAvailable);

    const errors: string[] = [];
    const checkFormula = (cell: { formulaError: boolean; text: string } | undefined, field: string) => {
      if (cell?.formulaError) {
        errors.push(`Запрещённая формула/символ в поле "${field}"`);
        rowErrorRecords.push({
          rowNumber: row.rowNumber,
          sku: skuCell?.text || null,
          dishName: nameCell?.text || null,
          field,
          errorCode: 'FORMULA_INJECTION',
          message: `Запрещённая формула/символ в поле "${field}"`,
          rawRow: Object.fromEntries(headers.map((h, idx) => [h || `col_${idx}`, row.cells[idx]?.text ?? ''])),
        });
      }
    };

    checkFormula(idCell, 'ID');
    checkFormula(skuCell, 'Артикул');
    checkFormula(nameCell, 'Название');
    checkFormula(descCell, 'Описание');
    checkFormula(catCell, 'Категория');

    const name = (nameCell?.text ?? '').slice(0, 160);
    const description = (descCell?.text ?? '').slice(0, 1000);
    const category = (catCell?.text ?? '').slice(0, 80);
    const sku = skuCell?.text ? skuCell.text.slice(0, 64) : null;
    const idVal = idCell?.text || null;

    if (!name) errors.push('Название блюда обязательно');
    if (!category) errors.push('Категория обязательна');

    const priceResult = parseStrictPrice(priceCell?.raw ?? priceCell?.text);
    if (!priceResult.ok) errors.push(priceResult.error);

    const availResult = parseAvailability(availCell?.raw ?? availCell?.text);
    if (!availResult.ok) errors.push(availResult.error);

    let isDuplicateInFile = false;
    if (sku) {
      const skuKey = sku.toLowerCase();
      if (seenSkus.has(skuKey)) {
        isDuplicateInFile = true;
        errors.push(`Дублирующийся артикул "${sku}" внутри файла`);
      } else {
        seenSkus.add(skuKey);
      }
    } else if (name) {
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) {
        isDuplicateInFile = true;
        errors.push(`Дублирующееся блюдо "${name}" внутри файла`);
      } else {
        seenNames.add(nameKey);
      }
    }

    const matchedDish =
      (idVal ? dishById.get(idVal) : undefined) ??
      (sku ? dishBySku.get(sku.toLowerCase()) : undefined) ??
      (name ? dishByName.get(name.toLowerCase()) : undefined);

    const categoryExists = category ? categorySet.has(category.toLowerCase()) : false;
    if (category && !categoryExists) {
      newCategoriesSet.add(category);
    }

    let action: MenuImportPreviewRow['action'] = 'ADD';
    let status: MenuImportPreviewRow['status'] = 'READY_ADD';

    if (errors.length > 0) {
      action = isDuplicateInFile ? 'CONFLICT' : 'ERROR';
      status = isDuplicateInFile ? 'CONFLICT' : 'ERROR';
      if (rowErrorRecords.every(e => e.rowNumber !== row.rowNumber)) {
        rowErrorRecords.push({
          rowNumber: row.rowNumber,
          sku,
          dishName: name || null,
          field: null,
          errorCode: isDuplicateInFile ? 'DUPLICATE_IN_FILE' : 'VALIDATION_ERROR',
          message: errors.join('; '),
          rawRow: Object.fromEntries(headers.map((h, idx) => [h || `col_${idx}`, row.cells[idx]?.text ?? ''])),
        });
      }
    } else if (matchedDish) {
      if (params.conflictMode === 'ADD_NEW') {
        action = 'CONFLICT';
        status = 'CONFLICT';
        errors.push('Блюдо уже существует (режим: только добавление новых)');
        rowErrorRecords.push({
          rowNumber: row.rowNumber,
          sku,
          dishName: name,
          field: sku ? 'sku' : 'name',
          errorCode: 'EXISTING_CONFLICT',
          message: errors[0]!,
          rawRow: Object.fromEntries(headers.map((h, idx) => [h || `col_${idx}`, row.cells[idx]?.text ?? ''])),
        });
      } else if (params.conflictMode === 'SKIP_EXISTING') {
        action = 'SKIP';
        status = 'SKIPPED';
      } else {
        action = 'UPDATE';
        status = 'READY_UPDATE';
      }
    }

    previewRows.push({
      rowNumber: row.rowNumber,
      sku,
      name,
      description,
      category,
      categoryExists,
      price: priceResult.ok ? priceResult.value : null,
      oldPrice: matchedDish ? matchedDish.price.toNumber() : null,
      isAvailable: availResult.ok ? availResult.value : true,
      matchedDishId: matchedDish?.id ?? null,
      action,
      status,
      errors,
    });
  }

  const addCount = previewRows.filter(r => r.status === 'READY_ADD').length;
  const updateCount = previewRows.filter(r => r.status === 'READY_UPDATE').length;
  const skipCount = previewRows.filter(r => r.status === 'SKIPPED').length;
  const errorCount = previewRows.filter(r => r.status === 'ERROR').length;
  const conflictCount = previewRows.filter(r => r.status === 'CONFLICT').length;

  const job = await db.importJob.create({
    data: {
      restaurantId: params.restaurantId,
      userId: params.userId,
      fileName: params.fileName.slice(0, 200),
      fileFormat: format,
      conflictMode: params.conflictMode,
      status: 'PREVIEW',
      totalRows: previewRows.length,
      addedCount: addCount,
      updatedCount: updateCount,
      skippedCount: skipCount,
      errorCount,
      conflictCount,
      previewData: previewRows as unknown as Prisma.InputJsonValue,
      rowErrors: rowErrorRecords.length
        ? {
            create: rowErrorRecords.map(e => ({
              rowNumber: e.rowNumber,
              sku: e.sku,
              dishName: e.dishName,
              field: e.field,
              errorCode: e.errorCode,
              message: e.message,
              rawRow: e.rawRow as Prisma.InputJsonValue,
            })),
          }
        : undefined,
    },
  });

  return {
    jobId: job.id,
    fileName: job.fileName,
    fileFormat: format,
    conflictMode: params.conflictMode,
    schemaVersion: MENU_IMPORT_SCHEMA_VERSION,
    totalRows: previewRows.length,
    summary: {
      addCount,
      updateCount,
      skipCount,
      errorCount,
      conflictCount,
      newCategories: [...newCategoriesSet],
    },
    rows: previewRows,
  };
}

export async function confirmMenuImportJob(params: {
  restaurantId: string;
  jobId: string;
  createMissingCategories: boolean;
  allowPartial: boolean;
}): Promise<MenuImportResultDto> {
  return db.$transaction(async tx => {
    const job = await tx.importJob.findFirst({
      where: { id: params.jobId, restaurantId: params.restaurantId },
      include: { rowErrors: { orderBy: { rowNumber: 'asc' } } },
    });
    assert(job, 404, 'NOT_FOUND', 'Задача импорта не найдена');
    assert(job.status === 'PREVIEW', 409, 'IMPORT_ALREADY_PROCESSED', 'Этот предпросмотр уже применён или отменён');

    const rows = (Array.isArray(job.previewData) ? job.previewData : []) as unknown as MenuImportPreviewRow[];
    if (!params.allowPartial && (job.errorCount > 0 || job.conflictCount > 0)) {
      throw new ApiError(400, 'IMPORT_HAS_ERRORS', 'Исправьте ошибки в строках или включите частичный импорт');
    }

    const existingCategories = await tx.restaurantCategory.findMany({
      where: { restaurantId: params.restaurantId },
      orderBy: { sortOrder: 'asc' },
    });
    const categoryByKey = new Map(existingCategories.map(c => [c.name.trim().toLowerCase(), c]));
    let nextSortOrder = existingCategories.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;

    let added = 0;
    let updated = 0;
    let skipped = 0;
    let errors = job.errorCount + job.conflictCount;

    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: params.restaurantId },
      select: { logoUrl: true },
    });

    for (const row of rows) {
      if (row.status === 'ERROR' || row.status === 'CONFLICT') continue;
      if (row.status === 'SKIPPED') {
        skipped++;
        continue;
      }

      const catKey = row.category.trim().toLowerCase();
      let category = categoryByKey.get(catKey);
      if (!category) {
        if (!params.createMissingCategories) {
          skipped++;
          await tx.importJobRowError.create({
            data: {
              importJobId: job.id,
              rowNumber: row.rowNumber,
              sku: row.sku,
              dishName: row.name,
              field: 'category',
              errorCode: 'MISSING_CATEGORY',
              message: `Категория "${row.category}" не существует`,
            },
          });
          errors++;
          continue;
        }
        category = await tx.restaurantCategory.create({
          data: {
            restaurantId: params.restaurantId,
            name: row.category.trim(),
            sortOrder: nextSortOrder++,
          },
        });
        categoryByKey.set(catKey, category);
      }

      if (row.status === 'READY_UPDATE' && row.matchedDishId) {
        const owned = await tx.dish.findFirst({
          where: { id: row.matchedDishId, restaurantId: params.restaurantId },
        });
        if (!owned) {
          errors++;
          continue;
        }
        await tx.dish.update({
          where: { id: owned.id },
          data: {
            name: row.name,
            description: row.description || owned.description,
            categoryId: category.id,
            price: new Prisma.Decimal(row.price ?? owned.price),
            isAvailable: row.isAvailable,
            ...(row.sku ? { sku: row.sku } : {}),
          },
        });
        updated++;
      } else if (row.status === 'READY_ADD' && row.price !== null) {
        await tx.dish.create({
          data: {
            restaurantId: params.restaurantId,
            categoryId: category.id,
            sku: row.sku,
            name: row.name,
            description: row.description || '',
            price: new Prisma.Decimal(row.price),
            imageUrl: restaurant.logoUrl || '/images/uzbite/plov.jpg',
            isAvailable: row.isAvailable,
          },
        });
        added++;
      }
    }

    await tx.importJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        addedCount: added,
        updatedCount: updated,
        skippedCount: skipped,
        errorCount: errors,
        completedAt: new Date(),
      },
    });

    const allErrors = await tx.importJobRowError.findMany({
      where: { importJobId: job.id },
      orderBy: { rowNumber: 'asc' },
    });

    return {
      jobId: job.id,
      status: 'COMPLETED',
      totalRows: job.totalRows,
      addedCount: added,
      updatedCount: updated,
      skippedCount: skipped,
      errorCount: errors,
      errors: allErrors.map(e => ({
        rowNumber: e.rowNumber,
        sku: e.sku,
        dishName: e.dishName,
        field: e.field,
        errorCode: e.errorCode,
        message: e.message,
      })),
    };
  });
}

export async function buildMenuTemplate(format: 'xlsx' | 'csv'): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const headers = ['Артикул', 'Название', 'Описание', 'Категория', 'Цена', 'Доступность'];
  const sampleRows: Array<Array<string | number>> = [
    ['OSH-001', 'Чайханский плов', 'Рис лазер, говядина, жёлтая морковь и зира (350 г)', 'Узбекская кухня', 42000, 'Да'],
    ['OSH-002', 'Самса с говядиной', 'Хрустящее слоёное тесто, 2 шт', 'Выпечка', 26000, 'Да'],
  ];

  if (format === 'csv') {
    return {
      buffer: serializeCsv(headers, sampleRows),
      mimeType: 'text/csv; charset=utf-8',
      fileName: 'uzbite-menu-template.csv',
    };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UzBite Restaurant';
  const menuSheet = workbook.addWorksheet('Меню');
  menuSheet.addRow(headers);
  menuSheet.getRow(1).font = { bold: true };
  for (const r of sampleRows) menuSheet.addRow(r);
  menuSheet.columns = [
    { width: 16 },
    { width: 28 },
    { width: 44 },
    { width: 22 },
    { width: 14 },
    { width: 16 },
  ];

  const guideSheet = workbook.addWorksheet('Инструкция');
  guideSheet.addRow(['Поле', 'Обязательно', 'Формат и пояснения']);
  guideSheet.getRow(1).font = { bold: true };
  guideSheet.addRows([
    ['Версия схемы', 'Служебная', MENU_IMPORT_SCHEMA_VERSION],
    ['Артикул', 'Рекомендуется', 'Уникальный код блюда для точного массового обновления цен (например, OSH-001)'],
    ['Название', 'Да', 'Название блюда до 160 символов (поддерживаются RU / UZ / EN символы)'],
    ['Описание', 'Нет', 'Краткий состав и граммовка блюда'],
    ['Категория', 'Да', 'Название категории (например, Выпечка). Отсутствующие категории можно создать при импорте'],
    ['Цена', 'Да', 'Число в UZS без символов валюты (например, 42000 или 42000.50). Отрицательные значения запрещены'],
    ['Доступность', 'Нет', 'Да / Нет (или 1 / 0, true / false). По умолчанию: Да'],
  ]);
  guideSheet.columns = [{ width: 20 }, { width: 16 }, { width: 72 }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName: 'uzbite-menu-template.xlsx',
  };
}

export async function exportMenuSpreadsheet(params: {
  restaurantId: string;
  userId: string;
  format: 'xlsx' | 'csv';
  categoryId?: string;
  availability?: 'all' | 'available' | 'unavailable';
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const dishes = await db.dish.findMany({
    where: {
      restaurantId: params.restaurantId,
      isArchived: false,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.availability === 'available'
        ? { isAvailable: true }
        : params.availability === 'unavailable'
          ? { isAvailable: false }
          : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
  });

  const headers = ['ID', 'Артикул', 'Название', 'Описание', 'Категория', 'Цена', 'Доступность'];
  const rows = dishes.map(d => [
    d.id,
    d.sku ?? '',
    sanitizeSpreadsheetText(d.name),
    sanitizeSpreadsheetText(d.description),
    sanitizeSpreadsheetText(d.category.name),
    d.price.toNumber(),
    d.isAvailable ? 'Да' : 'Нет',
  ]);

  const fileName = `uzbite-menu-${new Date().toISOString().slice(0, 10)}.${params.format}`;
  await db.exportJob.create({
    data: {
      restaurantId: params.restaurantId,
      userId: params.userId,
      exportType: 'MENU',
      fileFormat: params.format,
      filters: { categoryId: params.categoryId ?? null, availability: params.availability ?? 'all' },
      rowCount: rows.length,
      fileName,
    },
  });

  if (params.format === 'csv') {
    return { buffer: serializeCsv(headers, rows), mimeType: 'text/csv; charset=utf-8', fileName };
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Меню');
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) sheet.addRow(r);
  sheet.columns = [
    { width: 26 },
    { width: 16 },
    { width: 28 },
    { width: 42 },
    { width: 22 },
    { width: 14 },
    { width: 14 },
  ];
  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName,
  };
}

export async function exportOrdersSpreadsheet(params: {
  restaurantId: string;
  userId: string;
  format: 'xlsx' | 'csv';
  from?: string;
  to?: string;
  status?: string;
  paymentMethod?: string;
  deliveryMode?: string;
  includeContacts?: boolean;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const orders = await db.order.findMany({
    where: {
      restaurantId: params.restaurantId,
      ...(params.status && params.status !== 'ALL' ? { status: params.status as never } : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: new Date(`${params.from.slice(0, 10)}T00:00:00.000Z`) } : {}),
              ...(params.to ? { lte: new Date(`${params.to.slice(0, 10)}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(params.paymentMethod && params.paymentMethod !== 'ALL'
        ? { payment: { method: params.paymentMethod as never } }
        : {}),
      ...(params.deliveryMode && params.deliveryMode !== 'ALL'
        ? { delivery: { mode: params.deliveryMode as never } }
        : {}),
    },
    include: {
      items: true,
      payment: true,
      delivery: { include: { assignedCourier: { select: { name: true, username: true } } } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: MAX_SPREADSHEET_ROWS,
  });

  const headers = [
    'Номер заказа',
    'Дата',
    'Время',
    'Ресторан',
    'Состав заказа',
    'Количество',
    'Сумма блюд',
    'Стоимость доставки',
    'Итоговая сумма',
    'Способ оплаты',
    'Статус оплаты',
    'Статус заказа',
    'Тип доставки',
    'Курьер',
    'Дата завершения',
    ...(params.includeContacts ? ['Получатель', 'Телефон', 'Адрес доставки'] : []),
  ];

  const rows = orders.map(o => {
    const iso = o.createdAt.toISOString();
    const qty = o.items.reduce((s, item) => s + item.quantity, 0);
    const composition = o.items.map(i => `${i.dishName} ×${i.quantity}`).join('; ');
    const courierLabel = o.delivery?.assignedCourier
      ? o.delivery.assignedCourier.name || o.delivery.assignedCourier.username
      : '';
    const completedAt = o.delivery?.deliveredAt?.toISOString() ?? (o.status === 'DELIVERED' ? o.updatedAt.toISOString() : '');
    const addr = (o.addressSnapshot as { addressText?: string } | null)?.addressText ?? '';
    return [
      o.id,
      iso.slice(0, 10),
      iso.slice(11, 19),
      sanitizeSpreadsheetText(o.restaurantName),
      sanitizeSpreadsheetText(composition),
      qty,
      o.subtotal.toNumber(),
      o.deliveryFee.toNumber(),
      o.total.toNumber(),
      o.payment?.method ?? '',
      o.payment?.status ?? '',
      o.status,
      o.delivery?.mode ?? '',
      sanitizeSpreadsheetText(courierLabel),
      completedAt,
      ...(params.includeContacts
        ? [
            sanitizeSpreadsheetText(o.recipientName),
            sanitizeSpreadsheetText(o.recipientPhone),
            sanitizeSpreadsheetText(addr),
          ]
        : []),
    ];
  });

  const fileName = `uzbite-orders-${new Date().toISOString().slice(0, 10)}.${params.format}`;
  await db.exportJob.create({
    data: {
      restaurantId: params.restaurantId,
      userId: params.userId,
      exportType: 'ORDERS',
      fileFormat: params.format,
      filters: {
        from: params.from ?? null,
        to: params.to ?? null,
        status: params.status ?? 'ALL',
        includeContacts: Boolean(params.includeContacts),
      },
      rowCount: rows.length,
      fileName,
    },
  });

  if (params.format === 'csv') {
    return { buffer: serializeCsv(headers, rows), mimeType: 'text/csv; charset=utf-8', fileName };
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Заказы');
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) sheet.addRow(r);
  sheet.columns = headers.map(() => ({ width: 20 }));
  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName,
  };
}

export async function exportStatisticsSpreadsheet(params: {
  restaurantId: string;
  userId: string;
  format: 'xlsx' | 'csv';
  stats: RestaurantStatisticsDto;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const s = params.stats;
  const summaryHeaders = ['Показатель', 'Значение'];
  const summaryRows: Array<[string, string | number]> = [
    ['Период с', s.period.from],
    ['Период по', s.period.to],
    ['Заказов за сегодня', s.ordersToday],
    ['Заказов за неделю', s.ordersWeek],
    ['Заказов за месяц', s.ordersMonth],
    ['Заказов за выбранный период', s.ordersInRange],
    ['Завершённые заказы', s.completedOrders],
    ['Отменённые заказы', s.cancelledOrders],
    ['Сумма созданных заказов (UZS)', s.createdOrdersAmount],
    ['Подтверждённые оплаты (UZS)', s.paidOrdersAmount],
    ['Подтверждённые наличные (UZS)', s.cashConfirmedAmount],
    ['Подтверждённые переводы картой (UZS)', s.cardConfirmedAmount],
    ['Расходы на доставку (UZS)', s.deliveryExpensesAmount],
    ['Доставки своими курьерами', s.ownCourierDeliveries],
    ['Доставки заказными курьерами', s.onDemandCourierDeliveries],
    ['Подписчики', s.followers],
    ['Средний рейтинг', s.averageRating ?? 0],
    ['Количество отзывов', s.reviewCount],
    ['Количество публикаций', s.publicationsCount],
  ];

  const fileName = `uzbite-statistics-${new Date().toISOString().slice(0, 10)}.${params.format}`;
  await db.exportJob.create({
    data: {
      restaurantId: params.restaurantId,
      userId: params.userId,
      exportType: 'STATISTICS',
      fileFormat: params.format,
      filters: s.period,
      rowCount: summaryRows.length,
      fileName,
    },
  });

  if (params.format === 'csv') {
    const combinedRows: Array<Array<string | number>> = [
      ...summaryRows,
      ['', ''],
      ['Популярные блюда', 'Количество / Выручка (UZS)'],
      ...s.popularDishes.map(d => [d.dishName, `${d.quantity} шт · ${d.revenue} UZS`] as [string, string]),
    ];
    return { buffer: serializeCsv(summaryHeaders, combinedRows), mimeType: 'text/csv; charset=utf-8', fileName };
  }

  const workbook = new ExcelJS.Workbook();
  const sheet1 = workbook.addWorksheet('Сводка');
  sheet1.addRow(summaryHeaders);
  sheet1.getRow(1).font = { bold: true };
  for (const r of summaryRows) sheet1.addRow(r);
  sheet1.columns = [{ width: 38 }, { width: 22 }];

  const sheet2 = workbook.addWorksheet('Популярные блюда');
  sheet2.addRow(['Блюдо', 'Продано (шт)', 'Выручка (UZS)']);
  sheet2.getRow(1).font = { bold: true };
  for (const d of s.popularDishes) sheet2.addRow([sanitizeSpreadsheetText(d.dishName), d.quantity, d.revenue]);
  sheet2.columns = [{ width: 32 }, { width: 16 }, { width: 20 }];

  const sheet3 = workbook.addWorksheet('Категории');
  sheet3.addRow(['Категория', 'Продано (шт)', 'Выручка (UZS)']);
  sheet3.getRow(1).font = { bold: true };
  for (const c of s.popularCategories) sheet3.addRow([sanitizeSpreadsheetText(c.categoryName), c.quantity, c.revenue]);
  sheet3.columns = [{ width: 28 }, { width: 16 }, { width: 20 }];

  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName,
  };
}

export async function exportImportErrorsSpreadsheet(
  restaurantId: string,
  jobId: string,
  format: 'xlsx' | 'csv',
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const job = await db.importJob.findFirst({
    where: { id: jobId, restaurantId },
    include: { rowErrors: { orderBy: { rowNumber: 'asc' } } },
  });
  assert(job, 404, 'NOT_FOUND', 'Задача импорта не найдена');

  const headers = ['Строка', 'Артикул', 'Блюдо', 'Поле', 'Код ошибки', 'Причина'];
  const rows = job.rowErrors.map(e => [
    e.rowNumber,
    sanitizeSpreadsheetText(e.sku ?? ''),
    sanitizeSpreadsheetText(e.dishName ?? ''),
    sanitizeSpreadsheetText(e.field ?? ''),
    e.errorCode,
    sanitizeSpreadsheetText(e.message),
  ]);
  const fileName = `import-errors-${job.id.slice(-6)}.${format}`;
  if (format === 'csv') {
    return { buffer: serializeCsv(headers, rows), mimeType: 'text/csv; charset=utf-8', fileName };
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Ошибки импорта');
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) sheet.addRow(r);
  sheet.columns = [{ width: 10 }, { width: 18 }, { width: 28 }, { width: 16 }, { width: 22 }, { width: 48 }];
  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName,
  };
}
