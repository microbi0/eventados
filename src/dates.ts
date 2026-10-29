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

// "28 Out" ou "28 Out — 21 Nov" (com ano quando não é o corrente)
export function formatSpan(e: EventItem): string {
  const year = new Date().getFullYear();
  const withYear = (d: Date) => (d.getFullYear() !== year ? `${short(d)} ${d.getFullYear()}` : short(d));
  const isRun = e.startDate !== e.endDate && !(e.dates && e.dates.length === 1);
  if (!isRun) return withYear(parse(e.dates?.[0] ?? e.startDate));
  return `${short(parse(e.startDate))} — ${withYear(parse(e.endDate))}`;
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
