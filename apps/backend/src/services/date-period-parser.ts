import type { Language } from '@uzbite/shared';

export type ParsedDatePeriodKind =
  | 'single_day'
  | 'date_range'
  | 'week'
  | 'relative_days'
  | 'month';

export interface ParsedDatePeriod {
  from: string;
  to: string;
  fromIso: string;
  toIso: string;
  days: number;
  month: string;
  kind: ParsedDatePeriodKind;
  matchedText: string;
  label: Record<Language, string>;
}

interface MonthSpec {
  index: number;
  ruNom: string;
  ruGen: string;
  uz: string;
  en: string;
  pattern: string;
  ambiguousShort?: boolean;
}

const MONTHS: MonthSpec[] = [
  { index: 0, ruNom: 'январь', ruGen: 'января', uz: 'yanvar', en: 'January', pattern: 'январ[ьяею]?|yanvar(?:da|ning|ga|dan)?|january|jan' },
  { index: 1, ruNom: 'февраль', ruGen: 'февраля', uz: 'fevral', en: 'February', pattern: 'феврал[ьяею]?|fevral(?:da|ning|ga|dan)?|february|feb' },
  { index: 2, ruNom: 'март', ruGen: 'марта', uz: 'mart', en: 'March', pattern: 'март[аеу]?|mart(?:da|ning|ga|dan)?|march|mar' },
  { index: 3, ruNom: 'апрель', ruGen: 'апреля', uz: 'aprel', en: 'April', pattern: 'апрел[ьяею]?|aprel(?:da|ning|ga|dan)?|april|apr' },
  { index: 4, ruNom: 'май', ruGen: 'мая', uz: 'may', en: 'May', pattern: 'ма[йяе]|may(?:da|ning|ga|dan)?', ambiguousShort: true },
  { index: 5, ruNom: 'июнь', ruGen: 'июня', uz: 'iyun', en: 'June', pattern: 'июн[ьяею]?|iyun(?:da|ning|ga|dan)?|june|jun' },
  { index: 6, ruNom: 'июль', ruGen: 'июля', uz: 'iyul', en: 'July', pattern: 'июл[ьяею]?|iyul(?:da|ning|ga|dan)?|july|jul' },
  { index: 7, ruNom: 'август', ruGen: 'августа', uz: 'avgust', en: 'August', pattern: 'август[аеу]?|avgust(?:da|ning|ga|dan)?|august|aug' },
  { index: 8, ruNom: 'сентябрь', ruGen: 'сентября', uz: 'sentyabr', en: 'September', pattern: 'сентябр[ьяею]?|(?:sentyabr|sentabr)(?:da|ning|ga|dan)?|september|sept|sep' },
  { index: 9, ruNom: 'октябрь', ruGen: 'октября', uz: 'oktyabr', en: 'October', pattern: 'октябр[ьяею]?|(?:oktyabr|oktabr)(?:da|ning|ga|dan)?|october|oct' },
  { index: 10, ruNom: 'ноябрь', ruGen: 'ноября', uz: 'noyabr', en: 'November', pattern: 'ноябр[ьяею]?|noyabr(?:da|ning|ga|dan)?|november|nov' },
  { index: 11, ruNom: 'декабрь', ruGen: 'декабря', uz: 'dekabr', en: 'December', pattern: 'декабр[ьяею]?|dekabr(?:da|ning|ga|dan)?|december|dec' },
];

const ALL_MONTH_PATTERN = MONTHS.map(m => m.pattern).join('|');
const MONTH_MATCHERS = MONTHS.map(m => ({
  spec: m,
  regex: new RegExp(`^(?:${m.pattern})$`, 'i'),
}));

function resolveMonthSpec(token: string): MonthSpec | null {
  const clean = token.trim().toLowerCase();
  for (const m of MONTH_MATCHERS) {
    if (m.regex.test(clean)) return m.spec;
  }
  return null;
}

function daysInUtcMonth(year: number, monthIdx: number): number {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

function isValidYmd(year: number, monthIdx: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(monthIdx) || !Number.isInteger(day)) return false;
  if (monthIdx < 0 || monthIdx > 11) return false;
  return day >= 1 && day <= daysInUtcMonth(year, monthIdx);
}

function formatYmd(year: number, monthIdx: number, day: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function utcTodayDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addUtcDays(d: Date, delta: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + delta));
}

function inferYearForMonthDay(monthIdx: number, day: number, now: Date, explicitYear?: number): number {
  if (explicitYear && explicitYear >= 2000 && explicitYear <= 2099) return explicitYear;
  const nowYear = now.getUTCFullYear();
  const candidate = Date.UTC(nowYear, monthIdx, day);
  const todayMs = utcTodayDate(now).getTime();
  // If an un-yeared date is > 45 days in the future (e.g. asking about "15 ноября" in Jan), roll back 1 year
  if (candidate - todayMs > 45 * 86_400_000) {
    return nowYear - 1;
  }
  return nowYear;
}

function formatSingleDateLabel(ymd: string, lang: Language): string {
  const [yStr, mStr, dStr] = ymd.split('-');
  const y = Number(yStr);
  const mIdx = Number(mStr) - 1;
  const d = Number(dStr);
  const spec = MONTHS[mIdx];
  if (!spec) return ymd;
  if (lang === 'ru') return `${d} ${spec.ruGen} ${y}`;
  if (lang === 'uz') return `${d}-${spec.uz} ${y}`;
  return `${spec.en} ${d}, ${y}`;
}

export function formatDateRangeLabel(from: string, to: string, lang: Language): string {
  if (from === to) return formatSingleDateLabel(from, lang);
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm && MONTHS[fm! - 1]) {
    const spec = MONTHS[fm! - 1]!;
    if (lang === 'ru') return `${fd}–${td} ${spec.ruGen} ${fy}`;
    if (lang === 'uz') return `${fd}–${td}-${spec.uz} ${fy}`;
    return `${spec.en} ${fd}–${td}, ${fy}`;
  }
  return `${formatSingleDateLabel(from, lang)} — ${formatSingleDateLabel(to, lang)}`;
}

function buildPeriodResult(
  fromDate: Date,
  toDate: Date,
  kind: ParsedDatePeriodKind,
  matchedText: string,
  customLabel?: Record<Language, string>,
): ParsedDatePeriod | null {
  if (fromDate.getTime() > toDate.getTime()) return null;
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);
  const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);
  const rangeStr = formatDateRangeLabel(from, to, 'ru');
  const defaultLabel: Record<Language, string> = {
    ru: rangeStr,
    uz: formatDateRangeLabel(from, to, 'uz'),
    en: formatDateRangeLabel(from, to, 'en'),
  };

  return {
    from,
    to,
    fromIso: `${from}T00:00:00.000Z`,
    toIso: `${to}T23:59:59.999Z`,
    days,
    month: to.slice(0, 7),
    kind,
    matchedText: matchedText.trim(),
    label: customLabel ?? defaultLabel,
  };
}

function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BB\u02BC`´]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDatePeriodFromQuestion(
  question: string,
  now: Date = new Date(),
): ParsedDatePeriod | null {
  const q = normalizeQuestion(question);
  if (!q) return null;

  const today = utcTodayDate(now);

  // 1. Explicit ISO date range: 2026-11-10 .. 2026-11-15
  const isoRangeMatch = q.match(
    /(?:^|[^\d])(20\d{2}-\d{2}-\d{2})\s*(?:по|до|to|-)\s*(20\d{2}-\d{2}-\d{2})(?=$|[^\d])/,
  );
  if (isoRangeMatch) {
    const d1 = new Date(`${isoRangeMatch[1]}T00:00:00.000Z`);
    const d2 = new Date(`${isoRangeMatch[2]}T00:00:00.000Z`);
    if (Number.isFinite(d1.getTime()) && Number.isFinite(d2.getTime()) && d1 <= d2) {
      return buildPeriodResult(d1, d2, d1.getTime() === d2.getTime() ? 'single_day' : 'date_range', isoRangeMatch[0]);
    }
  }

  // 2. Dotted/slashed numeric range: 10.11 - 15.11, с 10.11.2026 по 15.11.2026
  const numRangeMatch = q.match(
    /(?:^|[^\d.])(\d{1,2})[./](\d{2})(?:[./](20\d{2}))?\s*(?:по|до|to|-)\s*(\d{1,2})[./](\d{2})(?:[./](20\d{2}))?(?=$|[^\d.%])/,
  );
  if (numRangeMatch) {
    const d1Num = Number(numRangeMatch[1]);
    const m1Idx = Number(numRangeMatch[2]) - 1;
    const y1Explicit = numRangeMatch[3] ? Number(numRangeMatch[3]) : undefined;
    const d2Num = Number(numRangeMatch[4]);
    const m2Idx = Number(numRangeMatch[5]) - 1;
    const y2Explicit = numRangeMatch[6] ? Number(numRangeMatch[6]) : y1Explicit;
    const y2 = inferYearForMonthDay(m2Idx, d2Num, now, y2Explicit);
    const y1 = inferYearForMonthDay(m1Idx, d1Num, now, y1Explicit ?? (m1Idx > m2Idx ? y2 - 1 : y2));
    if (isValidYmd(y1, m1Idx, d1Num) && isValidYmd(y2, m2Idx, d2Num)) {
      const fromDate = new Date(`${formatYmd(y1, m1Idx, d1Num)}T00:00:00.000Z`);
      const toDate = new Date(`${formatYmd(y2, m2Idx, d2Num)}T00:00:00.000Z`);
      if (fromDate <= toDate) {
        return buildPeriodResult(fromDate, toDate, fromDate.getTime() === toDate.getTime() ? 'single_day' : 'date_range', numRangeMatch[0]);
      }
    }
  }

  // 3. Cross-month named range: "с 28 октября по 5 ноября" / "Oct 28 to Nov 5"
  const crossMonthRuUz = q.match(
    new RegExp(
      `(?:^|[^\\p{L}\\d])(?:с|от|from)?\\s*(\\d{1,2})\\s+(${ALL_MONTH_PATTERN})\\s*(?:по|до|to|-|dan)\\s*(\\d{1,2})\\s+(${ALL_MONTH_PATTERN})(?:\\s+(20\\d{2}))?(?:gacha)?(?=$|[^\\p{L}\\d])`,
      'u',
    ),
  );
  if (crossMonthRuUz) {
    const d1Num = Number(crossMonthRuUz[1]);
    const m1 = resolveMonthSpec(crossMonthRuUz[2]!);
    const d2Num = Number(crossMonthRuUz[3]);
    const m2 = resolveMonthSpec(crossMonthRuUz[4]!);
    const explicitYear = crossMonthRuUz[5] ? Number(crossMonthRuUz[5]) : undefined;
    if (m1 && m2) {
      const y2 = inferYearForMonthDay(m2.index, d2Num, now, explicitYear);
      const y1 = explicitYear ? (m1.index > m2.index ? explicitYear - 1 : explicitYear) : inferYearForMonthDay(m1.index, d1Num, now, m1.index > m2.index ? y2 - 1 : y2);
      if (isValidYmd(y1, m1.index, d1Num) && isValidYmd(y2, m2.index, d2Num)) {
        const fromDate = new Date(`${formatYmd(y1, m1.index, d1Num)}T00:00:00.000Z`);
        const toDate = new Date(`${formatYmd(y2, m2.index, d2Num)}T00:00:00.000Z`);
        if (fromDate <= toDate) {
          return buildPeriodResult(fromDate, toDate, 'date_range', crossMonthRuUz[0]);
        }
      }
    }
  }

  const crossMonthEn = q.match(
    new RegExp(
      `(?:^|[^\\p{L}\\d])(${ALL_MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|-)\\s*(${ALL_MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?(?=$|[^\\p{L}\\d])`,
      'u',
    ),
  );
  if (crossMonthEn) {
    const m1 = resolveMonthSpec(crossMonthEn[1]!);
    const d1Num = Number(crossMonthEn[2]);
    const m2 = resolveMonthSpec(crossMonthEn[3]!);
    const d2Num = Number(crossMonthEn[4]);
    const explicitYear = crossMonthEn[5] ? Number(crossMonthEn[5]) : undefined;
    if (m1 && m2) {
      const y2 = inferYearForMonthDay(m2.index, d2Num, now, explicitYear);
      const y1 = explicitYear ? (m1.index > m2.index ? explicitYear - 1 : explicitYear) : inferYearForMonthDay(m1.index, d1Num, now, m1.index > m2.index ? y2 - 1 : y2);
      if (isValidYmd(y1, m1.index, d1Num) && isValidYmd(y2, m2.index, d2Num)) {
        const fromDate = new Date(`${formatYmd(y1, m1.index, d1Num)}T00:00:00.000Z`);
        const toDate = new Date(`${formatYmd(y2, m2.index, d2Num)}T00:00:00.000Z`);
        if (fromDate <= toDate) {
          return buildPeriodResult(fromDate, toDate, 'date_range', crossMonthEn[0]);
        }
      }
    }
  }

  // 4. Same-month named range: "с 10 по 15 ноября", "10-15 noyabr", "10 dan 15 noyabrgacha", "Nov 10 to 15"
  const sameMonthRuUz = q.match(
    new RegExp(
      `(?:^|[^\\p{L}\\d])(?:с|от|from)?\\s*(\\d{1,2})\\s*(?:по|до|to|-|dan)\\s*(\\d{1,2})\\s+(${ALL_MONTH_PATTERN})(?:\\s+(20\\d{2}))?(?:gacha)?(?=$|[^\\p{L}\\d])`,
      'u',
    ),
  );
  if (sameMonthRuUz) {
    const d1Num = Number(sameMonthRuUz[1]);
    const d2Num = Number(sameMonthRuUz[2]);
    const m = resolveMonthSpec(sameMonthRuUz[3]!);
    const explicitYear = sameMonthRuUz[4] ? Number(sameMonthRuUz[4]) : undefined;
    if (m) {
      const y = inferYearForMonthDay(m.index, d2Num, now, explicitYear);
      if (isValidYmd(y, m.index, d1Num) && isValidYmd(y, m.index, d2Num) && d1Num <= d2Num) {
        const fromDate = new Date(`${formatYmd(y, m.index, d1Num)}T00:00:00.000Z`);
        const toDate = new Date(`${formatYmd(y, m.index, d2Num)}T00:00:00.000Z`);
        return buildPeriodResult(fromDate, toDate, d1Num === d2Num ? 'single_day' : 'date_range', sameMonthRuUz[0]);
      }
    }
  }

  const sameMonthEn = q.match(
    new RegExp(
      `(?:^|[^\\p{L}\\d])(${ALL_MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|-)\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?(?=$|[^\\p{L}\\d])`,
      'u',
    ),
  );
  if (sameMonthEn) {
    const m = resolveMonthSpec(sameMonthEn[1]!);
    const d1Num = Number(sameMonthEn[2]);
    const d2Num = Number(sameMonthEn[3]);
    const explicitYear = sameMonthEn[4] ? Number(sameMonthEn[4]) : undefined;
    if (m) {
      const y = inferYearForMonthDay(m.index, d2Num, now, explicitYear);
      if (isValidYmd(y, m.index, d1Num) && isValidYmd(y, m.index, d2Num) && d1Num <= d2Num) {
        const fromDate = new Date(`${formatYmd(y, m.index, d1Num)}T00:00:00.000Z`);
        const toDate = new Date(`${formatYmd(y, m.index, d2Num)}T00:00:00.000Z`);
        return buildPeriodResult(fromDate, toDate, d1Num === d2Num ? 'single_day' : 'date_range', sameMonthEn[0]);
      }
    }
  }

  // 5. Single ISO date: 2026-11-15
  const isoSingleMatch = q.match(/(?:^|[^\d])(20\d{2})-(\d{2})-(\d{2})(?=$|[^\d])/);
  if (isoSingleMatch) {
    const y = Number(isoSingleMatch[1]);
    const mIdx = Number(isoSingleMatch[2]) - 1;
    const d = Number(isoSingleMatch[3]);
    if (isValidYmd(y, mIdx, d)) {
      const dt = new Date(`${formatYmd(y, mIdx, d)}T00:00:00.000Z`);
      return buildPeriodResult(dt, dt, 'single_day', isoSingleMatch[0]);
    }
  }

  // 5b. Explicit ISO month: 2026-10, 2026-11
  const isoMonthMatch = q.match(/(?:^|[^\d-])(20\d{2})-(0[1-9]|1[0-2])(?=$|[^\d-])/);
  if (isoMonthMatch) {
    const year = Number(isoMonthMatch[1]);
    const monthIdx = Number(isoMonthMatch[2]) - 1;
    const fromDate = new Date(Date.UTC(year, monthIdx, 1));
    const toDate = new Date(Date.UTC(year, monthIdx + 1, 0));
    const spec = MONTHS[monthIdx];
    if (spec) {
      return buildPeriodResult(fromDate, toDate, 'month', isoMonthMatch[0], {
        ru: `${spec.ruNom} ${year}`,
        uz: `${spec.uz} ${year}`,
        en: `${spec.en} ${year}`,
      });
    }
  }

  // 6. Single DD.MM[.YYYY] or DD/MM[/YYYY]
  const dotSingleMatch = q.match(
    /(?:^|[^\d.])(\d{1,2})[./](0[1-9]|1[0-2])(?:[./](20\d{2}))?(?=$|\s|[?!,;:)»"'])(?!\s*(?:%|млн|mln|тыс|ming|квт|kw|uzs|сум|кг|kg))/,
  );
  if (dotSingleMatch) {
    const d = Number(dotSingleMatch[1]);
    const mIdx = Number(dotSingleMatch[2]) - 1;
    const explicitYear = dotSingleMatch[3] ? Number(dotSingleMatch[3]) : undefined;
    const y = inferYearForMonthDay(mIdx, d, now, explicitYear);
    if (isValidYmd(y, mIdx, d)) {
      const dt = new Date(`${formatYmd(y, mIdx, d)}T00:00:00.000Z`);
      return buildPeriodResult(dt, dt, 'single_day', dotSingleMatch[0]);
    }
  }

  // 7. Single Day + Month name: "за 15 ноября", "15 ноября", "15 noyabr", "15 noyabrda"
  const dayMonthMatch = q.match(
    new RegExp(
      `(?:^|[^\\p{L}\\d])(\\d{1,2})\\s+(${ALL_MONTH_PATTERN})(?:\\s+(20\\d{2}))?(?=$|[^\\p{L}\\d])`,
      'u',
    ),
  );
  if (dayMonthMatch) {
    const d = Number(dayMonthMatch[1]);
    const m = resolveMonthSpec(dayMonthMatch[2]!);
    const explicitYear = dayMonthMatch[3] ? Number(dayMonthMatch[3]) : undefined;
    if (m) {
      const y = inferYearForMonthDay(m.index, d, now, explicitYear);
      if (isValidYmd(y, m.index, d)) {
        const dt = new Date(`${formatYmd(y, m.index, d)}T00:00:00.000Z`);
        return buildPeriodResult(dt, dt, 'single_day', dayMonthMatch[0]);
      }
    }
  }

  // 8. Month name + Day: "Nov 15", "November 15, 2026"
  const monthDayMatch = q.match(
    new RegExp(
      `(?:^|[^\\p{L}\\d])(${ALL_MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?(?=$|[^\\p{L}\\d])`,
      'u',
    ),
  );
  if (monthDayMatch) {
    const m = resolveMonthSpec(monthDayMatch[1]!);
    const d = Number(monthDayMatch[2]);
    const explicitYear = monthDayMatch[3] ? Number(monthDayMatch[3]) : undefined;
    if (m) {
      const y = inferYearForMonthDay(m.index, d, now, explicitYear);
      if (isValidYmd(y, m.index, d)) {
        const dt = new Date(`${formatYmd(y, m.index, d)}T00:00:00.000Z`);
        return buildPeriodResult(dt, dt, 'single_day', monthDayMatch[0]);
      }
    }
  }

  // 9. Relative single days: позавчера, вчера, сегодня
  const dayBeforeYesterday = q.match(/(?:позавчера|day\s+before\s+yesterday|kechadan\s+oldin|avvalgi\s+kun)/);
  if (dayBeforeYesterday) {
    const dt = addUtcDays(today, -2);
    return buildPeriodResult(dt, dt, 'single_day', dayBeforeYesterday[0]);
  }
  const yesterday = q.match(/(?:^|[^\p{L}])(вчера|yesterday|kecha)(?=$|[^\p{L}])/u);
  if (yesterday) {
    const dt = addUtcDays(today, -1);
    return buildPeriodResult(dt, dt, 'single_day', yesterday[1]!);
  }
  const todayMatch = q.match(/(?:^|[^\p{L}])(сегодня|today|bugun)(?=$|[^\p{L}])/u);
  if (todayMatch) {
    return buildPeriodResult(today, today, 'single_day', todayMatch[1]!);
  }

  // 10. Relative calendar weeks
  const lastWeekMatch = q.match(
    /(?:за\s+|на\s+)?прошл(?:ую|ой|ая)\s+недел[юея]|(?:o'tgan)\s+hafta|last\s+week|previous\s+week/,
  );
  if (lastWeekMatch) {
    const mon0 = (today.getUTCDay() + 6) % 7; // 0=Mon .. 6=Sun
    const thisMonday = addUtcDays(today, -mon0);
    const lastMonday = addUtcDays(thisMonday, -7);
    const lastSunday = addUtcDays(thisMonday, -1);
    const ruRange = `${lastMonday.toISOString().slice(0, 10)} – ${lastSunday.toISOString().slice(0, 10)}`;
    return buildPeriodResult(lastMonday, lastSunday, 'week', lastWeekMatch[0], {
      ru: `прошлая неделя (${ruRange})`,
      uz: `o‘tgan hafta (${ruRange})`,
      en: `last week (${ruRange})`,
    });
  }

  const thisWeekMatch = q.match(
    /(?:за\s+|на\s+)?(?:эт(?:у|ой|а)|текущ(?:ую|ей)|нынешн(?:юю|ей))\s+недел[юея]|(?:shu|bu|joriy)\s+hafta|this\s+week|current\s+week/,
  );
  if (thisWeekMatch) {
    const mon0 = (today.getUTCDay() + 6) % 7;
    const thisMonday = addUtcDays(today, -mon0);
    const ruRange = `${thisMonday.toISOString().slice(0, 10)} – ${today.toISOString().slice(0, 10)}`;
    return buildPeriodResult(thisMonday, today, 'week', thisWeekMatch[0], {
      ru: `текущая неделя (${ruRange})`,
      uz: `joriy hafta (${ruRange})`,
      en: `this week (${ruRange})`,
    });
  }

  // 11. Relative N days / generic "за неделю"
  const nDaysMatch = q.match(
    /(?:за\s+|на\s+|в\s+|for\s+|in\s+)?(?:последни[ех]\s+|предыдущи[ех]\s+|oxirgi\s+|so'nggi\s+|last\s+|past\s+)?(\d{1,3})\s*(?:дн(?:ей|я)|день|сут(?:ок|ки)?|kun(?:lik)?|days?)(?=$|[^\p{L}\d])/u,
  );
  if (nDaysMatch) {
    const n = Math.min(365, Math.max(1, Number(nDaysMatch[1])));
    const fromDate = addUtcDays(today, -(n - 1));
    return buildPeriodResult(fromDate, today, 'relative_days', nDaysMatch[0]);
  }

  const rollingWeekMatch = q.match(/(?:за\s+|на\s+)?(?:последн(?:юю|ие)\s+)?недел[юи]|(?:oxirgi|bir)\s+hafta|(?:for\s+the\s+|past\s+)week/);
  if (rollingWeekMatch) {
    const fromDate = addUtcDays(today, -6);
    return buildPeriodResult(fromDate, today, 'relative_days', rollingWeekMatch[0]);
  }

  // 12. Relative months: "за прошлый месяц", "за этот месяц"
  const lastMonthMatch = q.match(
    /(?:за\s+|в\s+)?прошл(?:ый|ом)\s+месяц[е]?|o'tgan\s+oy(?:da|ning)?|last\s+month|previous\s+month/,
  );
  if (lastMonthMatch) {
    const year = today.getUTCMonth() === 0 ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
    const monthIdx = today.getUTCMonth() === 0 ? 11 : today.getUTCMonth() - 1;
    const fromDate = new Date(Date.UTC(year, monthIdx, 1));
    const toDate = new Date(Date.UTC(year, monthIdx + 1, 0));
    const spec = MONTHS[monthIdx]!;
    return buildPeriodResult(fromDate, toDate, 'month', lastMonthMatch[0], {
      ru: `${spec.ruNom} ${year}`,
      uz: `${spec.uz} ${year}`,
      en: `${spec.en} ${year}`,
    });
  }

  const thisMonthMatch = q.match(
    /(?:за\s+|в\s+)?(?:этот|этом|текущ(?:ий|ем))\s+месяц[е]?|(?:shu|bu|joriy)\s+oy(?:da|ning)?|this\s+month|current\s+month/,
  );
  if (thisMonthMatch) {
    const year = today.getUTCFullYear();
    const monthIdx = today.getUTCMonth();
    const fromDate = new Date(Date.UTC(year, monthIdx, 1));
    const spec = MONTHS[monthIdx]!;
    return buildPeriodResult(fromDate, today, 'month', thisMonthMatch[0], {
      ru: `${spec.ruNom} ${year} (по ${today.getUTCDate()} ${spec.ruGen})`,
      uz: `${spec.uz} ${year} (${today.getUTCDate()}-${spec.uz}gacha)`,
      en: `${spec.en} ${year} (MTD)`,
    });
  }

  // 13. Standalone named month: "в ноябре", "за октябрь", "noyabr oyi", "in october"
  const namedMonthMatch = q.match(
    new RegExp(
      `(?:^|[^\\p{L}\\d])(?:(за|в|на|for|in|during)\\s+)?(${ALL_MONTH_PATTERN})(?:\\s+(месяц[е]?|oyi|oyida))?(?:\\s+(20\\d{2}))?(?=$|[^\\p{L}\\d])`,
      'u',
    ),
  );
  if (namedMonthMatch) {
    const prep = namedMonthMatch[1];
    const token = namedMonthMatch[2]!;
    const suffix = namedMonthMatch[3];
    const explicitYear = namedMonthMatch[4] ? Number(namedMonthMatch[4]) : undefined;
    const spec = resolveMonthSpec(token);
    if (spec) {
      // Guard English modal "may" unless accompanied by preposition, suffix, or year (or RU Cyrillic)
      const isLatinMay = spec.ambiguousShort && /^[a-z]+$/i.test(token);
      if (isLatinMay && !prep && !suffix && !explicitYear) {
        return null;
      }
      let year = explicitYear ?? today.getUTCFullYear();
      if (!explicitYear && spec.index > today.getUTCMonth() + 1) {
        year -= 1;
      }
      const fromDate = new Date(Date.UTC(year, spec.index, 1));
      const monthEnd = new Date(Date.UTC(year, spec.index + 1, 0));
      const toDate = year === today.getUTCFullYear() && spec.index === today.getUTCMonth() ? today : monthEnd;
      return buildPeriodResult(fromDate, toDate, 'month', namedMonthMatch[0], {
        ru: `${spec.ruNom} ${year}`,
        uz: `${spec.uz} ${year}`,
        en: `${spec.en} ${year}`,
      });
    }
  }

  return null;
}
