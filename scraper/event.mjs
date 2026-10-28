// Construção de eventos no formato comum + extração de schema.org/Event (JSON-LD).
import { classify, mapCategory, refineStage } from './categories.mjs';
import { decodeEntities, splitDateTime, stripHtml } from './util.mjs';

// Coordenadas só se estiverem em Portugal (continente, Açores, Madeira); algumas fontes usam 0,0 quando não sabem.
function coords(lat, lon) {
  const la = lat != null && lat !== '' ? Number(lat) : NaN;
  const lo = lon != null && lon !== '' ? Number(lon) : NaN;
  return la > 29 && la < 43 && lo > -32 && lo < -6 ? { lat: la, lon: lo } : { lat: null, lon: null };
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
  let price = e.price ? String(e.price).trim() : null;
  if (price && /^\d+([.,]\d+)?$/.test(price)) price = Number(price.replace(',', '.')) === 0 ? 'Gratuito' : `${price}€`;
  return {
    id: `${meta.id}-${e.id}`,
    source: meta.id,
    sourceName: meta.name,
    url: e.url,
    title: stripHtml(e.title),
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
