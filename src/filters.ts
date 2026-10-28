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

// Relevância para a página inicial: eventos pontuais, com imagem, de salas/agendas oficiais.
export function relevance(e: EventItem, venueSources: Set<string>): number {
  let score = 0;
  if (e.image) score += 3;
  if (venueSources.has(e.source)) score += 3;
  if (e.source !== 'eventbrite') score += 2;
  const d = durationDays(e);
  if (d === 0) score += 2;
  else if (d > 30) score -= 2;
  if (e.timesText) score += 1;
  if (e.alsoAt?.length) score += 1; // anunciado em várias fontes
  return score;
}

// Os mais relevantes, com variedade: sem imagens repetidas, no máximo 2 eventos do mesmo ciclo
// ("O meu 1º FITEI | …") e sem eventos já mostrados (`exclude`).
export function topRelevant(hits: Hit[], venueSources: Set<string>, n: number, exclude = new Set<string>()): Hit[] {
  const sorted = [...hits].sort((a, b) => relevance(b.e, venueSources) - relevance(a.e, venueSources) || a.when.localeCompare(b.when));
  const images = new Set<string>();
  const series = new Map<string, number>();
  const out: Hit[] = [];
  for (const h of sorted) {
    if (out.length >= n) break;
    if (exclude.has(h.e.id)) continue;
    if (h.e.image && images.has(h.e.image)) continue;
    const key = normalize(h.e.title.split(/\s[|–-]\s/)[0]);
    if ((series.get(key) ?? 0) >= 2) continue;
    series.set(key, (series.get(key) ?? 0) + 1);
    if (h.e.image) images.add(h.e.image);
    out.push(h);
  }
  return out;
}
