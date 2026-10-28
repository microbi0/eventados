// Portais regionais de turismo e agendas de âmbito territorial.
import { fetchJson, fetchText, absUrl, lisbonDate, decodeEntities } from '../util.mjs';
import { makeEvent } from '../event.mjs';
import { parsePtDateRange } from '../ptdates.mjs';

// ---------------------------------------------------------------------------
// Turismo do Centro — API REST WordPress oficial (/wp-json/wp/v2/event).
// ---------------------------------------------------------------------------
export const turismoCentro = {
  meta: { id: 'turismocentro', name: 'Turismo do Centro', url: 'https://turismodocentro.pt/agenda/', city: 'Coimbra' },
  async scrape() {
    const today = lisbonDate();
    let counties = new Map();
    try {
      const cData = await fetchJson('https://turismodocentro.pt/wp-json/wp/v2/county_mirror?per_page=100');
      counties = new Map(cData.map((c) => [c.id, c.name]));
    } catch {
      /* fallback se taxonomia falhar */
    }

    const out = [];
    for (let page = 1; page <= 5; page++) {
      let items;
      try {
        items = await fetchJson(`https://turismodocentro.pt/wp-json/wp/v2/event?per_page=50&page=${page}`);
      } catch {
        break;
      }
      if (!Array.isArray(items) || !items.length) break;

      for (const it of items) {
        const c = it.centro;
        if (!c?.start_date) continue;
        const startDate = new Date(c.start_date * 1000).toISOString().slice(0, 10);
        const endDate = c.end_date ? new Date(c.end_date * 1000).toISOString().slice(0, 10) : startDate;
        if (endDate < today) continue;

        const countyId = it.county_mirror?.[0];
        const city = counties.get(countyId) || this.meta.city;

        out.push(
          makeEvent(this.meta, {
            id: it.id,
            url: it.link,
            title: decodeEntities(it.title?.rendered),
            description: it.excerpt?.rendered ? decodeEntities(it.excerpt.rendered.replace(/<[^>]+>/g, '').trim()) : null,
            city,
            startDate,
            endDate,
            datesText: c.date_line ? c.date_line.replace(/<br>/gi, ' a ') : null,
            rawCategories: ['Turismo'],
            fallbackCategory: 'outros',
            image: c.image || null,
          }),
        );
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Visit Alentejo — listagem HTML oficial de eventos.
// ---------------------------------------------------------------------------
export const visitAlentejo = {
  meta: { id: 'visitalentejo', name: 'Visit Alentejo', url: 'https://www.visitalentejo.pt/pt/eventos/', city: 'Évora' },
  async scrape() {
    const today = lisbonDate();
    const out = new Map();

    for (let page = 1; page <= 3; page++) {
      const url = page === 1 ? this.meta.url : `https://www.visitalentejo.pt/pt/eventos/pagina-${page}/`;
      let html;
      try {
        html = await fetchText(url);
      } catch {
        break;
      }
      const items = html.split(/class="events-list-item"/).slice(1);
      if (!items.length) break;

      for (const item of items) {
        const link = item.match(/href="(\/pt\/eventos\/[^"]+)"/)?.[1];
        const title = item.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const dateText = item.match(/<span class="events-list-item-date">\s*([\s\S]*?)\s*<\/span>/)?.[1]?.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim();
        const desc = item.match(/class="events-list-item-resume">\s*([\s\S]*?)\s*<\/a>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const img = item.match(/<img[^>]+src="([^"]+)"/)?.[1];
        const dates = dateText && parsePtDateRange(dateText);

        if (!link || !title || !dates || out.has(link)) continue;

        out.set(
          link,
          makeEvent(this.meta, {
            id: link.replace(/\/$/, '').split('/').pop(),
            url: absUrl(link, this.meta.url),
            title: decodeEntities(title),
            description: desc ? decodeEntities(desc) : null,
            startDate: dates.start,
            endDate: dates.end,
            datesText: dateText,
            rawCategories: ['Alentejo'],
            fallbackCategory: 'outros',
            image: img ? absUrl(img, this.meta.url) : null,
          }),
        );
      }
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Visit Algarve — Guia oficial de eventos da Região de Turismo do Algarve.
// ---------------------------------------------------------------------------
export const visitAlgarve = {
  meta: { id: 'visitalgarve', name: 'Visit Algarve', url: 'https://eventos.visitalgarve.pt/agenda', city: 'Faro' },
  async scrape() {
    const today = lisbonDate();
    const out = [];

    for (let page = 1; page <= 5; page++) {
      let data;
      try {
        data = await fetchJson(`https://api.guiaeventosrta.pt.stage.vf-portal.com/Events/search?page=${page}&pageSize=50`);
      } catch {
        break;
      }
      const items = data.items ?? [];
      if (!items.length) break;

      for (const it of items) {
        if (it.expired) continue;
        const startDate = it.datei ? it.datei.slice(0, 10) : null;
        const endDate = it.datef ? it.datef.slice(0, 10) : startDate;
        if (!startDate || endDate < today) continue;

        const city = it.places?.[0] || this.meta.city;
        const rawCategories = (it.categories ?? []).map((c) => c.title).filter(Boolean);
        const url = it.link?.url ? (it.link.url.startsWith('http') ? it.link.url : `https://eventos.visitalgarve.pt${it.link.url}`) : this.meta.url;

        out.push(
          makeEvent(this.meta, {
            id: it.id,
            url,
            title: decodeEntities(it.title),
            description: it.description ? decodeEntities(it.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : null,
            city,
            startDate,
            endDate,
            rawCategories,
            fallbackCategory: 'outros',
            image: it.image?.link || null,
          }),
        );
      }
      if (page >= (data.totalPages ?? 1)) break;
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Visit Lisboa — agenda de eventos da Associação de Turismo de Lisboa.
// ---------------------------------------------------------------------------
export const visitLisboa = {
  meta: { id: 'visitlisboa', name: 'Visit Lisboa', url: 'https://www.visitlisboa.com/pt-pt/eventos', city: 'Lisboa' },
  async scrape() {
    const today = lisbonDate();
    const out = new Map();

    for (let page = 1; page <= 4; page++) {
      const url = page === 1 ? this.meta.url : `${this.meta.url}?page=${page}`;
      let html;
      try {
        html = await fetchText(url);
      } catch {
        break;
      }
      const blocks = html.split(/<h2 class="[^"]*font-bold[^"]*"><a href="(\/pt-pt\/eventos\/[^"]+)"/).slice(1);
      if (!blocks.length) break;

      for (let i = 0; i < blocks.length; i += 2) {
        const link = blocks[i];
        const rest = blocks[i + 1] ?? '';
        const title = rest.match(/^[^>]*>([\s\S]*?)<\/a><\/h2>/)?.[1]?.trim();
        const timeMatches = [...rest.matchAll(/<time datetime="([\d-]+)">/g)].map((m) => m[1]);
        const startDate = timeMatches[0];
        const endDate = timeMatches[1] || startDate;
        const desc = rest.match(/<p>([\s\S]*?)<\/p>/)?.[1]?.trim();
        const cat = rest.match(/<div class="[^"]*tracking-widest uppercase[^"]*">([^<]+)<\/div>/)?.[1]?.trim();

        if (!link || !title || !startDate || out.has(link)) continue;

        out.set(
          link,
          makeEvent(this.meta, {
            id: link.replace(/\/$/, '').split('/').pop(),
            url: absUrl(link, this.meta.url),
            title: decodeEntities(title),
            description: desc ? decodeEntities(desc) : null,
            city: 'Lisboa',
            startDate,
            endDate,
            rawCategories: cat ? [cat] : ['Turismo'],
            fallbackCategory: 'outros',
          }),
        );
      }
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Events Madeira — portal oficial de eventos da Madeira.
// ---------------------------------------------------------------------------
export const eventsMadeira = {
  meta: { id: 'eventsmadeira', name: 'Events Madeira', url: 'https://eventsmadeira.com/', city: 'Funchal' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const out = new Map();

    for (const block of html.split(/class="gt-event-style-1"/).slice(1)) {
      const link = block.match(/<div class="gt-title"><a href="([^"]+)">([\s\S]*?)<\/a><\/div>/);
      if (!link) continue;
      const url = link[1];
      const title = link[2].trim();
      const dateText = block.match(/<div class="gt-date">[\s\S]*?<span>([\s\S]*?)<\/span><\/div>/)?.[1]?.trim();
      const timeText = block.match(/<div class="gt-time">[\s\S]*?<span>([\s\S]*?)<\/span><\/div>/)?.[1]?.trim();
      const city = block.match(/<div class="gt-location">[\s\S]*?<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() || this.meta.city;
      const cats = [...block.matchAll(/<li class="gt-category-[^"]*"><a[^>]*>([^<]+)<\/a><\/li>/g)].map((m) => m[1].trim());
      const img = block.match(/data-src="([^"]+)"/)?.[1] || block.match(/src="([^"]+)"/)?.[1];
      const dates = dateText && parsePtDateRange(dateText);

      if (!title || !dates || out.has(url)) continue;

      out.set(
        url,
        makeEvent(this.meta, {
          id: url.replace(/\/$/, '').split('/').pop(),
          url,
          title: decodeEntities(title),
          city,
          startDate: dates.start,
          endDate: dates.end,
          datesText: dateText,
          timesText: timeText || null,
          rawCategories: cats,
          fallbackCategory: 'outros',
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};
