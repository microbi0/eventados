import type { EventItem } from './types';

export type DateRange = 'today' | 'tomorrow' | 'weekend' | 'week' | 'month' | 'all';

export const DATE_RANGES: { id: DateRange; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: 'tomorrow', label: 'Amanhã' },
  { id: 'weekend', label: 'Fim de semana' },
  { id: 'week', label: '7 dias' },
  { id: 'month', label: '30 dias' },
  { id: 'all', label: 'Todas' },
];

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function rangeBounds(range: DateRange, now = new Date()): [string, string] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case 'today':
      return [iso(today), iso(today)];
    case 'tomorrow':
      return [iso(addDays(today, 1)), iso(addDays(today, 1))];
    case 'weekend': {
      const dow = today.getDay(); // 0 = domingo
      if (dow === 0) return [iso(today), iso(today)];
      const sat = addDays(today, 6 - dow);
      const start = dow === 5 || dow === 6 ? today : addDays(sat, -1); // inclui sexta-feira
      return [iso(start), iso(addDays(sat, 1))];
    }
    case 'week':
      return [iso(today), iso(addDays(today, 6))];
    case 'month':
      return [iso(today), iso(addDays(today, 29))];
    default:
      return [iso(today), '9999-12-31'];
  }
}

// Primeira data em que o evento acontece dentro do intervalo, ou null se não acontece.
export function firstOccurrence(e: EventItem, from: string, to: string): string | null {
  if (e.dates?.length) return e.dates.find((d) => d >= from && d <= to) ?? null;
  if (e.startDate > to || e.endDate < from) return null;
  return e.startDate > from ? e.startDate : from;
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const short = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

// "Quarta, 28 Out"
export const formatDay = (s: string) => {
  const d = parse(s);
  return `${WEEKDAYS[d.getDay()]}, ${short(d)}`;
};

// "28 Out" ou "28 Out a 21 Nov" (com ano quando não é o corrente)
export function formatSpan(e: EventItem): string {
  const year = new Date().getFullYear();
  const withYear = (d: Date) => (d.getFullYear() !== year ? `${short(d)} ${d.getFullYear()}` : short(d));
  const isRun = e.startDate !== e.endDate && !(e.dates && e.dates.length === 1);
  if (!isRun) return withYear(parse(e.dates?.[0] ?? e.startDate));
  return `${short(parse(e.startDate))} a ${withYear(parse(e.endDate))}`;
}

// Minutos desde a meia-noite a partir de textos como "21h30", "21:30" ou "18h"; sem hora vai para o fim.
export function startMinutes(e: EventItem): number {
  const m = e.timesText?.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 24 * 60;
}

// Só uma hora: "dom: 21h", "21h00 às 23h" ou "21:30; 22:00" ficam "21h" / "21h30". Textos sem hora desaparecem, menos "vários horários".
export function oneTime(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/\b([01]?\d|2[0-3])\s*[hH:]\s*([0-5]\d)?(?!\d)/);
  if (!m) return /vários horários/i.test(text) ? text : null;
  return `${Number(m[1])}h${m[2] && m[2] !== '00' ? m[2] : ''}`;
}

export const durationDays = (e: EventItem) => (parse(e.endDate).getTime() - parse(e.startDate).getTime()) / 86400000;

const MONTH_INDEX: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

const FULL_MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_FULL_RE = 'janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
const MONTH_ANY_RE = `${MONTH_FULL_RE}|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez`;
const LANDMARK_PREFIX = /\b(?:rua|avenida|av|praca|largo|ponte|estadio|parque|jardim|travessa|calcada|alameda|rotunda)\s+(?:da\s+|do\s+|de\s+)?(?:\d+(?:o|a)?\s+(?:de\s+)?)?$/;

function validDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

const parseYear = (y?: string) => (y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : undefined);

function formatBoundsLabel(from: Date, to: Date, curYear: number): string {
  const fmt = (d: Date) => (d.getFullYear() !== curYear ? `${short(d)} ${d.getFullYear()}` : short(d));
  return iso(from) === iso(to) ? fmt(from) : `${short(from)} a ${fmt(to)}`;
}

function stripSpan(q: string, index: number, length: number): string {
  return `${q.slice(0, index)} ${q.slice(index + length)}`.replace(/\s+/g, ' ').trim();
}

export interface ParsedDate {
  bounds: [string, string];
  label: string;
  rest: string;
}

// Extrai uma data ou intervalo de datas em português de uma pesquisa já normalizada (sem acentos, minúsculas).
export function parseDateFromQuery(q: string, now = new Date()): ParsedDate | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const curYear = today.getFullYear();

  const finish = (from: Date, to: Date, match: RegExpMatchArray, label?: string): ParsedDate => {
    const clampedFrom = from < today && to >= today ? today : from;
    return {
      bounds: [iso(clampedFrom), iso(to)],
      label: label ?? formatBoundsLabel(from, to, curYear),
      rest: stripSpan(q, match.index ?? 0, match[0].length),
    };
  };

  // 1. Intervalo no mesmo mês: "de 10 a 15 de abril [de 2027]", "10-15 abr", "entre 10 e 15 de abril"
  const sameMonthRe = new RegExp(
    `(?:(?:de|entre|nos?\\s+dias?|para\\s+(?:os?\\s+)?dias?)\\s+)?\\b(\\d{1,2})\\s*(?:a|ate|e|-)\\s*(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_ANY_RE})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`,
  );
  const mSame = q.match(sameMonthRe);
  if (mSame) {
    const d1 = Number(mSame[1]);
    const d2 = Number(mSame[2]);
    const m = MONTH_INDEX[mSame[3]];
    let y = parseYear(mSame[4]) ?? curYear;
    if (!mSame[4]) {
      const probe = validDate(y, m, d2) ?? new Date(y, m, 0);
      if (probe < today) y += 1;
    }
    const from = validDate(y, m, d1);
    const to = validDate(y, m, d2);
    if (from && to && from <= to) return finish(from, to, mSame);
  }

  // 2. Intervalo entre meses: "de 28 de abril a 3 de maio", "28 abr - 3 mai"
  const crossMonthRe = new RegExp(
    `(?:(?:de|entre)\\s+)?\\b(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_ANY_RE})(?:\\s+(?:de\\s+)?(\\d{4}))?\\s*(?:a|ate|e|-)\\s*(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_ANY_RE})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`,
  );
  const mCross = q.match(crossMonthRe);
  if (mCross) {
    const d1 = Number(mCross[1]);
    const m1 = MONTH_INDEX[mCross[2]];
    const d2 = Number(mCross[4]);
    const m2 = MONTH_INDEX[mCross[5]];
    let y1 = parseYear(mCross[3]);
    let y2 = parseYear(mCross[6]);
    if (y1 == null && y2 == null) {
      y1 = curYear;
      y2 = m2 < m1 ? y1 + 1 : y1;
      const probeEnd = validDate(y2, m2, d2);
      if (probeEnd && probeEnd < today) {
        y1 += 1;
        y2 += 1;
      }
    } else if (y1 != null && y2 == null) {
      y2 = m2 < m1 ? y1 + 1 : y1;
    } else if (y1 == null && y2 != null) {
      y1 = m1 > m2 ? y2 - 1 : y2;
    }
    const from = validDate(y1!, m1, d1);
    const to = validDate(y2!, m2, d2);
    if (from && to && from <= to) return finish(from, to, mCross);
  }

  // 3. Intervalo numérico: "10/04 a 15/04", "10-04-2027 a 15-04-2027", "2027-04-10 a 2027-04-15"
  const isoRange = q.match(/(?:(?:de|entre)\s+)?\b(\d{4})-(\d{1,2})-(\d{1,2})\s*(?:a|ate|e|-)\s*(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoRange) {
    const from = validDate(Number(isoRange[1]), Number(isoRange[2]), Number(isoRange[3]));
    const to = validDate(Number(isoRange[4]), Number(isoRange[5]), Number(isoRange[6]));
    if (from && to && from <= to) return finish(from, to, isoRange);
  }

  const numRange = q.match(/(?:(?:de|entre)\s+)?\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s*(?:a|ate|e|-)\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numRange) {
    const d1 = Number(numRange[1]);
    const m1 = Number(numRange[2]);
    const d2 = Number(numRange[4]);
    const m2 = Number(numRange[5]);
    let y1 = parseYear(numRange[3]);
    let y2 = parseYear(numRange[6]);
    if (y1 == null && y2 == null) {
      y1 = curYear;
      y2 = m2 < m1 ? y1 + 1 : y1;
      const probeEnd = validDate(y2, m2, d2);
      if (probeEnd && probeEnd < today) {
        y1 += 1;
        y2 += 1;
      }
    } else if (y1 != null && y2 == null) {
      y2 = m2 < m1 ? y1 + 1 : y1;
    } else if (y1 == null && y2 != null) {
      y1 = m1 > m2 ? y2 - 1 : y2;
    }
    const from = validDate(y1!, m1, d1);
    const to = validDate(y2!, m2, d2);
    if (from && to && from <= to) return finish(from, to, numRange);
  }

  // 4. Dia único com mês: "15 de abril", "dia 15 abr", "15 abril 2027"
  const singleMonthRe = new RegExp(`(?:(?:no\\s+)?dia\\s+|para\\s+(?:o\\s+)?dia\\s+|em\\s+)?\\b(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_ANY_RE})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`);
  const mSingle = q.match(singleMonthRe);
  if (mSingle && !LANDMARK_PREFIX.test(q.slice(0, mSingle.index ?? 0))) {
    const d = Number(mSingle[1]);
    const m = MONTH_INDEX[mSingle[2]];
    let y = parseYear(mSingle[3]) ?? curYear;
    if (!mSingle[3]) {
      const probe = validDate(y, m, d);
      if (probe && probe < today) y += 1;
    }
    const dt = validDate(y, m, d);
    if (dt) return finish(dt, dt, mSingle);
  }

  // 5. Data numérica única: "2027-04-15" ou "15/04[/2027]"
  const isoSingle = q.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoSingle) {
    const dt = validDate(Number(isoSingle[1]), Number(isoSingle[2]), Number(isoSingle[3]));
    if (dt) return finish(dt, dt, isoSingle);
  }

  const numSingle = q.match(/(?:(?:no\s+)?dia\s+|em\s+)?\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numSingle) {
    const d = Number(numSingle[1]);
    const m = Number(numSingle[2]);
    let y = parseYear(numSingle[3]) ?? curYear;
    if (!numSingle[3]) {
      const probe = validDate(y, m, d);
      if (probe && probe < today) y += 1;
    }
    const dt = validDate(y, m, d);
    if (dt) return finish(dt, dt, numSingle);
  }

  // 6. Expressões relativas: "hoje", "amanhã", "fim de semana", "próxima semana", "este mês"...
  const mNextWeekend = q.match(/\b(?:proximo\s+fim\s+de\s+semana|fim\s+de\s+semana\s+que\s+vem)\b/);
  if (mNextWeekend) {
    const dow = today.getDay();
    const daysToNextFri = ((5 - dow + 7) % 7) + (dow >= 5 ? 7 : 0);
    const fri = addDays(today, daysToNextFri);
    return finish(fri, addDays(fri, 2), mNextWeekend, 'Próximo fim de semana');
  }

  const mWeekend = q.match(/\b(?:este\s+)?fim\s+de\s+semana\b|\bfds\b/);
  if (mWeekend) {
    const [f, t] = rangeBounds('weekend', now);
    return finish(parse(f), parse(t), mWeekend, 'Fim de semana');
  }

  const mAfterTomorrow = q.match(/\bdepois\s+de\s+amanha\b/);
  if (mAfterTomorrow) {
    const d = addDays(today, 2);
    return finish(d, d, mAfterTomorrow);
  }

  const mTomorrow = q.match(/\bamanha\b/);
  if (mTomorrow) {
    const d = addDays(today, 1);
    return finish(d, d, mTomorrow, 'Amanhã');
  }

  const mToday = q.match(/\bhoje\b/);
  if (mToday) return finish(today, today, mToday, 'Hoje');

  const mNextWeek = q.match(/\b(?:proxima\s+semana|semana\s+que\s+vem)\b/);
  if (mNextWeek) {
    const dow = today.getDay();
    const daysToMon = dow === 0 ? 1 : 8 - dow;
    const mon = addDays(today, daysToMon);
    return finish(mon, addDays(mon, 6), mNextWeek, 'Próxima semana');
  }

  const mThisWeek = q.match(/\b(?:esta\s+semana|proximos?\s+7\s+dias)\b/);
  if (mThisWeek) {
    const [f, t] = rangeBounds('week', now);
    return finish(parse(f), parse(t), mThisWeek, 'Próximos 7 dias');
  }

  const mNextMonth = q.match(/\b(?:proximo\s+mes|mes\s+que\s+vem)\b/);
  if (mNextMonth) {
    const first = new Date(curYear, today.getMonth() + 1, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const label = first.getFullYear() !== curYear ? `${FULL_MONTHS[first.getMonth()]} ${first.getFullYear()}` : FULL_MONTHS[first.getMonth()];
    return finish(first, last, mNextMonth, label);
  }

  const mThisMonth = q.match(/\beste\s+mes\b/);
  if (mThisMonth) {
    const last = new Date(curYear, today.getMonth() + 1, 0);
    return finish(today, last, mThisMonth, FULL_MONTHS[today.getMonth()]);
  }

  // 7. Dias do mês corrente/próximo sem nome de mês: "dias 10 a 15", "dia 20"
  const mDaysOnly = q.match(/(?:(?:nos?\s+|de\s+)?dias?\s+)(\d{1,2})\s*(?:a|ate|e|-)\s*(\d{1,2})\b/);
  if (mDaysOnly) {
    const d1 = Number(mDaysOnly[1]);
    const d2 = Number(mDaysOnly[2]);
    let m = today.getMonth() + 1;
    let y = curYear;
    if (d2 < today.getDate()) {
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    const from = validDate(y, m, d1);
    const to = validDate(y, m, d2);
    if (from && to && from <= to) return finish(from, to, mDaysOnly);
  }

  const mDayOnly = q.match(/(?:no\s+)?\bdia\s+(\d{1,2})\b/);
  if (mDayOnly) {
    const d = Number(mDayOnly[1]);
    let m = today.getMonth() + 1;
    let y = curYear;
    if (d < today.getDate()) {
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    const dt = validDate(y, m, d);
    if (dt) return finish(dt, dt, mDayOnly);
  }

  // 8. Mês inteiro (apenas nomes completos): "em abril", "abril", "abril de 2027"
  const wholeMonthRe = new RegExp(`(?:(?:em|no\\s+mes\\s+de|mes\\s+de|para)\\s+)?\\b(${MONTH_FULL_RE})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`);
  const mWhole = q.match(wholeMonthRe);
  if (mWhole && !LANDMARK_PREFIX.test(q.slice(0, mWhole.index ?? 0))) {
    const suffix = q.slice((mWhole.index ?? 0) + mWhole[0].length);
    if (!(mWhole[1] === 'marco' && /^\s+de\s+canaveses\b/.test(suffix))) {
      const m = MONTH_INDEX[mWhole[1]];
      let y = parseYear(mWhole[2]) ?? curYear;
      const lastInCur = new Date(y, m, 0);
      if (!mWhole[2] && lastInCur < today) y += 1;
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      const label = y !== curYear ? `${FULL_MONTHS[m - 1]} ${y}` : FULL_MONTHS[m - 1];
      return finish(first, last, mWhole, label);
    }
  }

  return null;
}
