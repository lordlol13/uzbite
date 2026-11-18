import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  buildMenuTemplate,
  detectSpreadsheetFormat,
  escapeCsvCell,
  isFormulaInjection,
  parseAvailability,
  parseCsvText,
  parseStrictPrice,
  readSpreadsheetTable,
  sanitizeSpreadsheetText,
  serializeCsv,
} from './excel-csv.js';

test('Excel/CSV format detection validates extensions and real binary signatures', async () => {
  const xlsxTemplate = await buildMenuTemplate('xlsx');
  assert.equal(detectSpreadsheetFormat('menu.xlsx', xlsxTemplate.buffer), 'xlsx');
  assert.throws(() => detectSpreadsheetFormat('menu.xlsm', xlsxTemplate.buffer));
  assert.throws(() => detectSpreadsheetFormat('fake.xlsx', Buffer.from('not a zip')));
  assert.throws(() => detectSpreadsheetFormat('fake.csv', xlsxTemplate.buffer));
  assert.equal(detectSpreadsheetFormat('menu.csv', Buffer.from('Название,Категория,Цена\nПлов,Горячее,42000', 'utf8')), 'csv');
});

test('CSV serialization escapes formula injection and preserves Russian and Uzbek UTF-8 characters', () => {
  assert.equal(escapeCsvCell('=CMD|"/C calc"!A0'), `"'=CMD|""/C calc""!A0"`);
  assert.equal(escapeCsvCell('+SUM(1,2)'), `"'+SUM(1,2)"`);
  assert.equal(escapeCsvCell('@IMPORTXML()'), "'@IMPORTXML()");
  assert.equal(sanitizeSpreadsheetText('=1+1'), "'=1+1");
  assert.equal(isFormulaInjection('=1+1'), true);
  assert.equal(isFormulaInjection('-5000'), false);

  const csvBuf = serializeCsv(
    ['Название', 'Описание', 'Цена'],
    [
      ['O‘zbek palovi · Чайханский плов', 'G‘ishtli tandir, салат "Ачичук"', 45000],
      ['=HYPERLINK("http://evil")', 'Нормальное описание', 12000],
    ],
  );
  const parsed = parseCsvText(csvBuf.toString('utf8'));
  assert.equal(parsed.length, 3);
  assert.equal(parsed[1]![0], 'O‘zbek palovi · Чайханский плов');
  assert.equal(parsed[1]![1], 'G‘ishtli tandir, салат "Ачичук"');
  assert.equal(parsed[2]![0], `'=HYPERLINK("http://evil")`);
});

test('CSV reader rejects non-UTF-8 invalid byte sequences and supports semicolon delimiters', async () => {
  const invalidUtf8 = Buffer.from([0x4e, 0x61, 0x6d, 0x65, 0x2c, 0xc0, 0xaf, 0x0a]);
  await assert.rejects(() => readSpreadsheetTable('broken.csv', invalidUtf8));

  const semiCsv = Buffer.from('\uFEFFАртикул;Название;Категория;Цена;Доступность\r\nOSH-1;Плов;Горячее;42000;Да\r\n', 'utf8');
  const parsed = await readSpreadsheetTable('semi.csv', semiCsv);
  assert.equal(parsed.format, 'csv');
  assert.deepEqual(parsed.headers, ['Артикул', 'Название', 'Категория', 'Цена', 'Доступность']);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]!.cells[1]!.text, 'Плов');
});

test('Strict price and availability parsers validate decimals, negatives, and localized flags', () => {
  assert.deepEqual(parseStrictPrice('42 000,50'), { ok: true, value: 42000.5 });
  assert.deepEqual(parseStrictPrice(35000), { ok: true, value: 35000 });
  assert.equal(parseStrictPrice('-100').ok, false);
  assert.equal(parseStrictPrice('42000.123').ok, false);
  assert.equal(parseStrictPrice('abc').ok, false);
  assert.equal(parseStrictPrice('=100+200').ok, false);

  assert.deepEqual(parseAvailability('Да'), { ok: true, value: true });
  assert.deepEqual(parseAvailability('Нет'), { ok: true, value: false });
  assert.deepEqual(parseAvailability('mavjud emas'), { ok: true, value: false });
  assert.deepEqual(parseAvailability(''), { ok: true, value: true });
  assert.equal(parseAvailability('maybe').ok, false);
});

test('Excel workbook reader flags formula cells as unsafe formula injections', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Меню');
  ws.addRow(['Артикул', 'Название', 'Категория', 'Цена']);
  ws.addRow(['SKU-1', 'Шурпа', 'Супы', { formula: '100+200', result: 300 }]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const parsed = await readSpreadsheetTable('formula.xlsx', buf);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]!.cells[3]!.formulaError, true);
});
