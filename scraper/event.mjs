// Construção de eventos no formato comum + extração de schema.org/Event (JSON-LD).
import { classify, mapCategory, refineStage } from './categories.mjs';
import { decodeEntities, splitDateTime, stripHtml } from './util.mjs';

// Coordenadas só se estiverem em Portugal (continente, Açores, Madeira); algumas fontes usam 0,0 quando não sabem.
function coords(lat, lon) {
  const la = lat != null && lat !== '' ? Number(lat) : NaN;
  const lo = lon != null && lon !== '' ? Number(lon) : NaN;
  return la > 29 && la < 43 && lo > -32 && lo < -6 ? { lat: la, lon: lo } : { lat: null, lon: null };
}

// "ANDRÉ RIEU E A SUA ORQUESTRA" → "André Rieu e a Sua Orquestra" (títulos todos em maiúsculas cansam a leitura).
const SMALL = new Set(['a', 'o', 'as', 'os', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'com', 'por', 'para', 'à', 'ao', 'aos', 'um', 'uma']);
function unshout(title) {
  const letters = title.replace(/[^\p{L}]/gu, '');
  if (letters.length < 6 || letters !== letters.toUpperCase()) return title;
  return title
    .toLowerCase()
    .replace(/[\p{L}\d'’]+/gu, (w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .replace(/\b(Dj|Mc|Tv|Uk|Usa|Ccb|Meo|Lx|Ep|Lp)\b/g, (m) => m.toUpperCase())
    // numerais romanos ("XXXIV Festuna", "Ii" → "II")
    .replace(/\b[IVXLC][ivxlc]+\b/g, (m) => (/^(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(m.toUpperCase()) ? m.toUpperCase() : m));
}

// Preço só com valores e símbolos: "25€", "15€ – 25€", "Gratuito". Texto de descontos, notas, contactos… fica de fora.
// Valores são os que vêm junto de "€"/"eur" (ou um número sozinho, ex.: "12"); percentagens não contam.
export function normalizePrice(raw) {
  if (raw == null) return null;
  const text = stripHtml(String(raw)).replace(/\s+/g, ' ').trim();
  if (!text || !/[0-9a-z]/i.test(text)) return null;
  const nums = [];
  // Intervalos "6–10€", "5 a 10 euros".
  for (const m of text.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(€)?\s*(?:–|-|a|até)\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(€|eur)?/gi)) {
    if (!m[2] && !m[4]) continue; // sem € não é preço (pode ser "M/6 a 12 anos")
    nums.push(Number(m[1].replace(',', '.')), Number(m[3].replace(',', '.')));
  }
  for (const m of text.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?\b)|(?:€|eur)\s*(\d{1,4}(?:[.,]\d{1,2})?)/gi)) {
    nums.push(Number((m[1] ?? m[2]).replace(',', '.')));
  }
  if (!nums.length && /^\d{1,4}(?:[.,]\d{1,2})?$/.test(text)) nums.push(Number(text.replace(',', '.')));
  const fmt = (n) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')}€`;
  if (nums.length) {
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    if (hi === 0) return 'Gratuito';
    return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
  }
  if (/gr[aá]t|entrada livre|livre|free|sem custo/i.test(text)) return 'Gratuito';
  return null;
}

export function makeEvent(meta, e) {
  const fromSource = [...new Set((e.rawCategories ?? []).map(mapCategory).filter(Boolean))];
  const categories = fromSource.length ? fromSource : classify(e.title, e.subtitle, e.venue);
  if (!categories.length && e.fallbackCategory) categories.push(e.fallbackCategory);
  if (e.extraCategories) categories.push(...e.extraCategories.filter((c) => !categories.includes(c)));
  if (categories.includes('palcos')) {
    const stage = refineStage(e.title, e.subtitle, e.description, ...(e.rawCategories ?? []));
    categories.splice(categories.indexOf('palcos'), 1, ...stage.filter((c) => !categories.includes(c)));
  }
  const price = normalizePrice(e.price);
  return {
    id: `${meta.id}-${e.id}`,
    source: meta.id,
    sourceName: meta.name,
    url: e.url,
    title: unshout(stripHtml(e.title)),
    subtitle: e.subtitle ? stripHtml(e.subtitle) || null : null,
    description: e.description ? stripHtml(e.description).slice(0, 1200) || null : null,
    categories: categories.length ? categories : ['outros'],
    rawCategories: e.rawCategories ?? [],
    city: e.city ?? meta.city ?? null,
    district: null,
    venue: e.venue ? stripHtml(e.venue) || null : null,
    address: e.address ? stripHtml(e.address) || null : null,
    ...coords(e.lat, e.lon),
    startDate: e.startDate,
    endDate: e.endDate && e.endDate >= e.startDate ? e.endDate : e.startDate,
    dates: e.dates ?? null,
    datesText: e.datesText ? stripHtml(e.datesText) || null : null,
    timesText: e.timesText && /[0-9a-z]/i.test(e.timesText) ? stripHtml(e.timesText) || null : null,
    price,
    isFree: e.isFree ?? (price ? /gr[aá]t|livre|^0([.,]0+)?\s*€?$|free/i.test(price) : false),
    image: e.image || null,
    tickets: e.tickets || null,
    // Sinais editoriais da fonte: "destaque" explícito e presença na homepage da agenda.
    featured: !!e.featured,
    promoted: !!e.promoted,
  };
}

export function jsonLdEvents(html) {
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    if (/Event$/.test([].concat(x['@type'] ?? '').join(' '))) out.push(x);
    for (const k of ['itemListElement', 'item', '@graph']) if (x[k]) walk(x[k]);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1]));
    } catch {
      /* JSON-LD inválido */
    }
  }
  return out;
}

// schema.org/Event → campos de makeEvent
export function fromJsonLd(ld) {
  const start = splitDateTime(ld.startDate);
  const end = splitDateTime(ld.endDate);
  const place = [].concat(ld.location ?? [])[0] ?? {};
  const addr = place.address ?? {};
  const offer = [].concat(ld.offers ?? [])[0];
  const price = offer?.price != null && offer.price !== '' ? (Number(offer.price) === 0 ? 'Gratuito' : `${String(offer.price).replace('.', ',')}€`) : null;
  const image = [].concat(ld.image ?? [])[0];
  return {
    title: decodeEntities(ld.name),
    description: ld.description,
    url: ld.url,
    startDate: start.date,
    endDate: end.date ?? start.date,
    timesText: start.time,
    venue: place.name,
    address: typeof addr === 'string' ? addr : [addr.streetAddress, addr.postalCode, addr.addressLocality].filter(Boolean).join(', '),
    locality: typeof addr === 'object' ? addr.addressLocality : null,
    lat: place.geo?.latitude,
    lon: place.geo?.longitude,
    price,
    image: typeof image === 'string' ? image : image?.url,
    tickets: offer?.url,
    online: /Online/.test(ld.eventAttendanceMode ?? '') || place['@type'] === 'VirtualLocation',
  };
}
