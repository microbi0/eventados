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

// Palavras do caminho de um endereço: ".../evento/optimista-ceptico-diogo-bataguas-105165" → "optimista ceptico diogo bataguas".
// Os links de bilhetes trazem muitas vezes o nome do artista, que nem sempre está no título.
const urlWords = (u: string | null | undefined) => {
  if (!u) return '';
  try {
    return decodeURIComponent(new URL(u).pathname).replace(/[-_/.]+/g, ' ').replace(/\b\d+\b/g, ' ');
  } catch {
    return '';
  }
};

// Texto pesquisável de cada evento (calculado uma vez).
const searchText = new WeakMap<EventItem, string>();
function haystack(e: EventItem): string {
  let t = searchText.get(e);
  if (t == null) {
    t = normalize(
      [e.title, e.subtitle, e.venue, e.city, e.address, e.description, e.sourceName, e.rawCategories.join(' '), urlWords(e.url), urlWords(e.tickets), ...(e.alsoAt ?? []).map((a) => urlWords(a.url))]
        .filter(Boolean)
        .join(' '),
    );
    searchText.set(e, t);
  }
  return t;
}

// Todas as palavras da pesquisa têm de aparecer (em qualquer ordem, sem acentos).
export const matchesQuery = (e: EventItem, q: string) => {
  const words = q.split(/\s+/).filter(Boolean);
  const text = haystack(e);
  return words.every((w) => text.includes(w));
};

// Eventos que passam os filtros, com a data em que acontecem dentro do período, ordenados.
// Com pesquisa escrita, procura em todas as datas futuras (quem procura um artista quer ver todas as datas).
export function filterEvents(events: EventItem[], f: Filters): Hit[] {
  const q = normalize((f.query ?? '').trim());
  const [from, to] = rangeBounds(q ? 'all' : f.range);
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
const QUIET = new Set(['workshops', 'conversas', 'visitas', 'ciencia']);

// Dimensão/notoriedade das salas (pelo nome do local, venha o evento de que fonte vier).
// Grandes arenas e coliseus recebem os espetáculos que mais gente procura.
const VENUE_TIERS: [RegExp, number][] = [
  [/meo arena|altice arena|super bock arena|campo pequeno|estadio|est[aá]dio/, 9],
  [/coliseu|tivoli|capitolio|casa da musica|centro cultural de belem|\bccb\b|teatro sa da bandeira|multiusos|pavilhao rosa mota|europarque|fil\b|exponor/, 5],
  [/teatro nacional|sao luiz|trindade|rivoli|teatro municipal|theatro circo|gulbenkian|culturgest|teatro camoes|gil vicente|viriato|aula magna|cineteatro|auditorio/, 3],
];
const venueTier = (e: EventItem) => {
  const v = normalize(`${e.venue ?? ''}`);
  for (const [re, pts] of VENUE_TIERS) if (re.test(v)) return pts;
  return 0;
};

// Relevância para a maioria das pessoas: soma de sinais, com as razões legíveis.
export function scoreEvent(e: EventItem, venueSources: Set<string>): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const text = normalize(`${e.title} ${e.subtitle ?? ''}`);

  // 1. Onde: grandes salas primeiro.
  const tier = Math.max(venueTier(e), venueSources.has(e.source) ? 2 : 0);
  if (tier) {
    score += tier;
    if (tier >= 5) reasons.push('Grande sala');
  }
  // Várias noites seguidas numa arena = muita procura.
  const nights = e.dates?.length ?? durationDays(e) + 1;
  if (tier >= 9 && nights >= 2 && nights <= 7) {
    score += 3;
    reasons.push(`${nights} noites`);
  }
  // 2. O quê: espetáculos ao vivo e festivais; workshops, conversas e visitas descem.
  if (e.categories.some((c) => LIVE.has(c))) score += 3;
  if (e.categories.every((c) => QUIET.has(c) || c === 'familias' || c === 'outros')) score -= 4;
  if (/\bfest(ival)?\b|fest'?\d{2}|digressao|\btour\b|ao vivo/.test(text)) {
    score += 3;
    reasons.push('Festival ou digressão');
  }
  if (/estreia|esgotad|ultimos bilhetes|antestreia/.test(text)) {
    score += 2;
    reasons.push('Estreia');
  }
  // 3. Destaque editorial da própria fonte (peso moderado: as agendas destacam muitas vezes atividades pequenas).
  if (e.featured) {
    score += 3;
    reasons.push(`Destaque ${e.sourceName}`);
  } else if (e.promoted) score += 1;
  // 4. Anunciado em várias fontes = mais procura.
  if (e.alsoAt?.length) {
    score += 2 + Math.min(e.alsoAt.length, 3);
    reasons.push(`Em ${e.alsoAt.length + 1} agendas`);
  }
  // 5. Bilhete pago com preço alto costuma indicar produção grande.
  const prices = (e.price ?? '').match(/\d+(?:[.,]\d+)?/g)?.map((n) => Number(n.replace(',', '.'))) ?? [];
  if (prices.length && Math.max(...prices) >= 20) score += 2;
  // 6. Forma: imagem, data única, horário nobre.
  if (e.image) score += 1;
  else score -= 3;
  const d = durationDays(e);
  if (d > 30) score -= 4;
  else if (d > 7) score -= 2;
  const minutes = startMinutes(e);
  if (minutes >= 19 * 60 && minutes < 24 * 60) {
    score += 1;
    reasons.push('Horário nobre');
  }
  return { score, reasons };
}

export const relevance = (e: EventItem, venueSources: Set<string>) => scoreEvent(e, venueSources).score;

// Os mais relevantes, com variedade: sem imagens repetidas, no máximo 2 eventos do mesmo ciclo
// ("O meu 1º FITEI | …"), no máximo `perCategory` por tipo e sem eventos já mostrados (`exclude`).
export function topRelevant(hits: Hit[], venueSources: Set<string>, n: number, exclude = new Set<string>(), perCategory = Infinity, perSeries = 2): Hit[] {
  const sorted = [...hits].sort((a, b) => relevance(b.e, venueSources) - relevance(a.e, venueSources) || a.when.localeCompare(b.when));
  const images = new Set<string>();
  const series = new Map<string, number>();
  const byCat = new Map<string, number>();
  const out: Hit[] = [];
  for (const h of sorted) {
    if (out.length >= n) break;
    if (exclude.has(h.e.id)) continue;
    if (h.e.image && images.has(h.e.image)) continue;
    const key = normalize(h.e.title.split(/\s[|–:-]\s|\s?\|\s?/)[0]).replace(/^(meo|nos|vodafone|super bock|sagres)\s+/, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(de|da|do|das|dos|e|a|o|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if ((series.get(key) ?? 0) >= perSeries) continue;
    const cat = h.e.categories[0];
    if ((byCat.get(cat) ?? 0) >= perCategory) continue;
    series.set(key, (series.get(key) ?? 0) + 1);
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
    if (h.e.image) images.add(h.e.image);
    out.push(h);
  }
  return out;
}
