// Agendas municipais em WordPress com eventos expostos na API REST.
import { fetchJson, lisbonDate, splitDateTime } from '../util.mjs';
import { makeEvent } from '../event.mjs';

// Percorre uma listagem ordenada por publicação (mais recente primeiro) até deixar de haver eventos futuros.
async function crawl(urlForPage, isFuture, maxPages = 15) {
  const all = [];
  let emptyStreak = 0;
  for (let page = 1; page <= maxPages; page++) {
    let items;
    try {
      items = await fetchJson(urlForPage(page));
    } catch (err) {
      if (page > 1 && /HTTP 400/.test(err.message)) break; // fim da paginação
      throw err;
    }
    if (!Array.isArray(items) || !items.length) break;
    all.push(...items);
    // Publicações antigas raramente têm eventos futuros: paramos após 2 páginas seguidas sem nenhum.
    emptyStreak = items.some(isFuture) ? 0 : emptyStreak + 1;
    if (emptyStreak >= 2) break;
  }
  return all;
}

const ogImage = (it) => it.yoast_head_json?.og_image?.[0]?.url ?? null;

// Gondomar — endpoint próprio /sgg/v1/eventos
export const gondomar = {
  meta: { id: 'gondomar', name: 'CM Gondomar', url: 'https://www.cm-gondomar.pt/agenda/', city: 'Gondomar' },
  async scrape() {
    const today = lisbonDate();
    const endOf = (it) => (it.meta?.event_end_date || it.meta?.event_start_date || '').slice(0, 10);
    const items = await crawl((p) => `https://www.cm-gondomar.pt/wp-json/sgg/v1/eventos?per_page=50&page=${p}`, (it) => endOf(it) >= today);
    return items
      .filter((it) => it.meta?.event_start_date && endOf(it) >= today)
      .map((it) => {
        const s = splitDateTime(it.meta.event_start_date);
        const e = splitDateTime(it.meta.event_end_date);
        const cost = it.meta.event_cost;
        return makeEvent(this.meta, {
          id: it.id,
          url: it.permalink,
          title: it.title,
          description: it.excerpt || it.content,
          rawCategories: (it.categories ?? []).map((c) => c.name ?? c),
          startDate: s.date,
          endDate: e.date,
          timesText: it.meta.event_timetable || s.time,
          price: cost ? (/livre|grat/i.test(cost) ? 'Entrada livre' : cost) : null,
          image: it.meta.destaq_image?.url,
        });
      });
  },
};

// Póvoa de Varzim — tipo "event" com metadados de data/local
export const povoa = {
  meta: { id: 'povoa', name: 'CM Póvoa de Varzim', url: 'https://www.cm-pvarzim.pt/agenda/', city: 'Póvoa de Varzim' },
  async scrape() {
    const today = lisbonDate();
    const endOf = (it) => it.meta?._event_end_date || it.meta?._event_start_date || '';
    const items = await crawl(
      (p) => `https://www.cm-pvarzim.pt/wp-json/wp/v2/event?per_page=50&page=${p}&_fields=id,link,title,excerpt,meta,yoast_head_json`,
      (it) => endOf(it) >= today,
    );
    return items
      .filter((it) => it.meta?._event_start_date && endOf(it) >= today)
      .map((it) => {
        const m = it.meta;
        const time = m._event_all_day === '1' ? null : m._event_start_time?.slice(0, 5).replace(':', 'h');
        return makeEvent(this.meta, {
          id: it.id,
          url: it.link,
          title: it.title?.rendered,
          description: it.excerpt?.rendered,
          startDate: m._event_start_date,
          endDate: m._event_end_date,
          datesText: m.event_date,
          timesText: m.event_schedule || time,
          venue: m.location,
          lat: m.latitude || null,
          lon: m.longitude || null,
          image: ogImage(it),
        });
      });
  },
};

// The Events Calendar (plugin "tribe"): Super Bock Arena, Teatro Sá da Bandeira, CCB, …
export function tribeSource(meta) {
  return {
    meta,
    async scrape() {
      const today = lisbonDate();
      const out = [];
      let url = `${new URL(meta.url).origin}/wp-json/tribe/events/v1/events?per_page=50&start_date=${today}`;
      for (let i = 0; url && i < 20; i++) {
        const data = await fetchJson(url);
        out.push(...(data.events ?? []));
        url = data.next_rest_url ?? null;
      }
      return out.map((ev) => {
        const s = splitDateTime(ev.start_date);
        const e = splitDateTime(ev.end_date);
        const v = Array.isArray(ev.venue) ? null : ev.venue;
        return makeEvent(meta, {
          id: ev.id,
          url: ev.url,
          title: ev.title,
          description: ev.excerpt || ev.description,
          rawCategories: (ev.categories ?? []).map((c) => c.name),
          // Nome da sala interna ("Sala Principal") passa a "Teatro Sá da Bandeira – Sala Principal".
          venue: v?.venue && !v.venue.toLowerCase().includes(meta.venue.toLowerCase()) ? `${meta.venue} – ${v.venue}` : meta.venue,
          address: v ? [v.address, v.city].filter(Boolean).join(', ') : meta.address,
          lat: v?.geo_lat ?? meta.lat,
          lon: v?.geo_lng ?? meta.lon,
          startDate: s.date,
          endDate: e.date,
          timesText: ev.all_day ? null : s.time,
          price: ev.cost || null,
          image: ev.image?.sizes?.medium_large?.url ?? ev.image?.url,
          tickets: ev.website || null,
          featured: !!ev.featured,
        });
      });
    },
  };
}

export const superBockArena = tribeSource({
  id: 'superbockarena', name: 'Super Bock Arena', url: 'https://www.superbockarena.pt/agenda/', city: 'Porto',
  venue: 'Super Bock Arena – Pavilhão Rosa Mota', address: 'Rua D. Manuel II, Porto', lat: 41.1486, lon: -8.6255,
});
export const saDaBandeira = tribeSource({
  id: 'sadabandeira', name: 'Teatro Sá da Bandeira', url: 'https://teatrosadabandeira.pt/agenda/', city: 'Porto',
  venue: 'Teatro Sá da Bandeira', address: 'Rua de Sá da Bandeira, 108, Porto', lat: 41.1478, lon: -8.6084,
});
export const ccb = tribeSource({
  id: 'ccb', name: 'Centro Cultural de Belém', url: 'https://www.ccb.pt/eventos/', city: 'Lisboa',
  venue: 'Centro Cultural de Belém', address: 'Praça do Império, Lisboa', lat: 38.6955, lon: -9.2085,
});
