import type { EventItem } from './types';
import { type DateRange, durationDays, firstOccurrence, rangeBounds, startMinutes } from './dates';

export const ALL = 'all';

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type Hit = { e: EventItem; when: string };

export interface Filters {
  city: string;
  range: DateRange;
  freeOnly?: boolean;
  query?: string;
  categories?: string[];
}

export const matchesQuery = (e: EventItem, q: string) =>
  normalize(`${e.title} ${e.subtitle ?? ''} ${e.venue ?? ''} ${e.city} ${e.rawCategories.join(' ')}`).includes(q);

// Eventos que passam os filtros, com a data em que acontecem dentro do período, ordenados.
export function filterEvents(events: EventItem[], f: Filters): Hit[] {
  const [from, to] = rangeBounds(f.range);
  const q = normalize((f.query ?? '').trim());
  const out: Hit[] = [];
  for (const e of events) {
    if (f.city !== ALL && e.city !== f.city) continue;
    if (f.freeOnly && !e.isFree) continue;
    if (f.categories?.length && !e.categories.some((c) => f.categories!.includes(c))) continue;
    if (q && !matchesQuery(e, q)) continue;
    const when = firstOccurrence(e, from, to);
    if (when) out.push({ e, when });
  }
  // Eventos pontuais primeiro; exposições e temporadas longas descem na lista.
  return out.sort(
    (a, b) =>
      a.when.localeCompare(b.when) ||
      Number(durationDays(a.e) > 7) - Number(durationDays(b.e) > 7) ||
      startMinutes(a.e) - startMinutes(b.e) ||
      a.e.title.localeCompare(b.e.title, 'pt'),
  );
}

const LIVE = new Set(['musica', 'teatro', 'danca', 'humor', 'cinema']);
const QUIET = new Set(['workshops', 'conversas', 'visitas']);

// Relevância: soma de sinais, com as razões legíveis (mostradas no slider da Home).
// O sinal mais forte é editorial — a própria fonte marcou o evento como destaque ou pô-lo na sua homepage.
export function scoreEvent(e: EventItem, venueSources: Set<string>): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (e.featured) {
    score += 6;
    reasons.push(`Destaque ${e.sourceName}`);
  } else if (e.promoted) {
    score += 4;
    reasons.push(`Escolha ${e.sourceName}`);
  }
  if (venueSources.has(e.source)) {
    score += 3;
    reasons.push('Grande sala');
  }
  if (e.alsoAt?.length) {
    score += 2;
    reasons.push(`Anunciado em ${e.alsoAt.length + 1} fontes`);
  }
  const d = durationDays(e);
  if (d === 0) {
    score += 2;
    reasons.push('Só por um dia');
  } else if (d > 30) score -= 3;
  else if (d > 7) score -= 1;
  if (e.image) score += 2;
  // Espetáculos ao vivo atraem mais público do que workshops ou conversas.
  if (e.categories.some((c) => LIVE.has(c))) score += 2;
  else if (e.categories.some((c) => QUIET.has(c))) score -= 1;
  const minutes = startMinutes(e);
  if (minutes < 24 * 60) score += 1;
  if (minutes >= 18 * 60 && minutes < 24 * 60) {
    score += 2;
    reasons.push('Horário nobre');
  }
  if (/estreia|esgotad|festival|antestreia/i.test(`${e.title} ${e.subtitle ?? ''} ${e.datesText ?? ''}`)) {
    score += 1;
    reasons.push('Estreia ou festival');
  }
  return { score, reasons };
}

export const relevance = (e: EventItem, venueSources: Set<string>) => scoreEvent(e, venueSources).score;

// Os mais relevantes, com variedade: sem imagens repetidas, no máximo 2 eventos do mesmo ciclo
// ("O meu 1º FITEI | …"), no máximo `perCategory` por tipo e sem eventos já mostrados (`exclude`).
export function topRelevant(hits: Hit[], venueSources: Set<string>, n: number, exclude = new Set<string>(), perCategory = Infinity): Hit[] {
  const sorted = [...hits].sort((a, b) => relevance(b.e, venueSources) - relevance(a.e, venueSources) || a.when.localeCompare(b.when));
  const images = new Set<string>();
  const series = new Map<string, number>();
  const byCat = new Map<string, number>();
  const out: Hit[] = [];
  for (const h of sorted) {
    if (out.length >= n) break;
    if (exclude.has(h.e.id)) continue;
    if (h.e.image && images.has(h.e.image)) continue;
    const key = normalize(h.e.title.split(/\s[|–-]\s/)[0]);
    if ((series.get(key) ?? 0) >= 2) continue;
    const cat = h.e.categories[0];
    if ((byCat.get(cat) ?? 0) >= perCategory) continue;
    series.set(key, (series.get(key) ?? 0) + 1);
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
    if (h.e.image) images.add(h.e.image);
    out.push(h);
  }
  return out;
}
