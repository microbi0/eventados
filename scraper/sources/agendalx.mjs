// AgendaLX (Câmara Municipal de Lisboa) — API REST pública do WordPress.
import { fetchJson, decodeEntities, stripHtml, lisbonDate } from '../util.mjs';
import { mapCategory } from '../categories.mjs';

const BASE = 'https://www.agendalx.pt/wp-json/agendalx/v1/events';
const PER_PAGE = 50;

export const meta = { id: 'agendalx', name: 'AgendaLX', url: 'https://www.agendalx.pt/' };

function parsePrice(ev) {
  if (ev.price_cat === 'free') return { price: 'Gratuito', isFree: true };
  // price_val vem serializado em PHP: extraímos os pares value/description.
  const values = [...String(ev.price_val ?? '').matchAll(/s:\d+:"value";s:\d+:"([^"]*)"/g)].map((m) => m[1].trim()).filter(Boolean);
  if (!values.length) return { price: null, isFree: false };
  const nums = values.map((v) => parseFloat(v.replace(',', '.'))).filter(Number.isFinite);
  if (nums.length && nums.every((n) => n === 0)) return { price: 'Gratuito', isFree: true };
  const fmt = (v) => (/\d/.test(v) && !/€/.test(v) ? `${v}€` : v);
  if (nums.length > 1) {
    const [min, max] = [Math.min(...nums), Math.max(...nums)];
    const n = (x) => `${String(x).replace('.', ',')}€`;
    return { price: min === max ? n(min) : `${n(min)} – ${n(max)}`, isFree: false };
  }
  return { price: fmt(values[0]), isFree: false };
}

function normalize(ev, today) {
  const raw = Object.values(ev.categories_name_list ?? {}).map((c) => c.name);
  const categories = [...new Set(raw.map(mapCategory).filter(Boolean))];
  const audience = Object.keys(ev.target_audience ?? {});
  if (audience.includes('familias') || audience.includes('criancas')) categories.push('familias');
  if (!categories.length) categories.push('outros');

  const venue = Object.values(ev.venue ?? {})[0];
  const dates = (ev.occurences ?? []).filter((d) => d >= today);
  const { price, isFree } = parsePrice(ev);

  return {
    id: `agendalx-${ev.id}`,
    source: meta.id,
    sourceName: meta.name,
    url: ev.link,
    title: decodeEntities(ev.title?.rendered),
    subtitle: decodeEntities(ev.subtitle) || null,
    description: stripHtml((ev.description ?? []).join('\n')) || null,
    categories,
    rawCategories: raw,
    city: 'Lisboa',
    venue: venue ? decodeEntities(venue.name) : null,
    address: null,
    lat: null,
    lon: null,
    startDate: dates[0] ?? ev.StartDate,
    endDate: ev.LastDate ?? ev.StartDate,
    dates: dates.length ? dates : null,
    datesText: ev.string_dates || null,
    timesText: ev.string_times || null,
    price,
    isFree,
    image: ev.featured_media_large || null,
  };
}

export async function scrape() {
  const today = lisbonDate();
  const byId = new Map();
  for (let page = 1; page <= 100; page++) {
    const items = await fetchJson(`${BASE}?per_page=${PER_PAGE}&page=${page}`);
    if (!Array.isArray(items) || !items.length) break;
    for (const ev of items) byId.set(ev.id, ev);
  }
  return [...byId.values()].map((ev) => normalize(ev, today)).filter((e) => e.endDate >= today);
}
