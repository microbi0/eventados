// Salas de espetáculos com agenda própria.
import { fetchText, postText, absUrl, lisbonDate, decodeEntities, splitDateTime } from '../util.mjs';
import { makeEvent } from '../event.mjs';
import { parsePtDateRange } from '../ptdates.mjs';

// ---------------------------------------------------------------------------
// MEO Arena — agenda completa em HTML.
// ---------------------------------------------------------------------------
export const meoArena = {
  meta: { id: 'meoarena', name: 'MEO Arena', url: 'https://arena.meo.pt/agenda-completa', city: 'Lisboa' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const out = new Map();
    for (const block of html.split(/class="agendaDestaquesUn/).slice(1)) {
      const href = block.match(/href="(\/agenda\/[^"]+)"/)?.[1];
      const title = block.match(/class="destaquesNome">([^<]+)/)?.[1];
      const dateText = block.match(/class="data-abrev">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ');
      const dates = dateText && parsePtDateRange(dateText);
      if (!href || !title || !dates || out.has(href)) continue;
      const url = absUrl(href, this.meta.url);
      out.set(
        href,
        makeEvent(this.meta, {
          id: href.split('/').pop(),
          url,
          title: decodeEntities(title),
          venue: 'MEO Arena',
          address: 'Rossio dos Olivais, Parque das Nações, Lisboa',
          lat: 38.7685,
          lon: -9.0940,
          startDate: dates.start,
          endDate: dates.end,
          datesText: dateText.replace(/\s+/g, ' ').trim(),
          rawCategories: [],
          fallbackCategory: 'musica',
          image: block.match(/<img src="\s*([^"]+)"/)?.[1]?.trim(),
          tickets: block.match(/href="(https:\/\/[^"]+)"[^>]*class="comprar"/)?.[1],
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Salas do Porto com agenda própria.
// ---------------------------------------------------------------------------
const PORTO_VENUES = {
  rivoli: [41.1497, -8.6105, 'Praça D. João I, Porto'],
  'campo alegre': [41.1556, -8.6327, 'Rua das Estrelas, Porto'],
  'teatro nacional sao joao': [41.1435, -8.6087, 'Praça da Batalha, Porto'],
  'teatro carlos alberto': [41.1474, -8.6146, 'Rua das Oliveiras, 43, Porto'],
  'mosteiro de sao bento da vitoria': [41.143, -8.615, 'Rua de São Bento da Vitória, Porto'],
};
const venueGeo = (name) => {
  const key = Object.keys(PORTO_VENUES).find((k) => slugifyLoose(name).includes(k));
  return key ? { lat: PORTO_VENUES[key][0], lon: PORTO_VENUES[key][1], address: PORTO_VENUES[key][2] } : {};
};
const slugifyLoose = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pickIn = (html, re) => html.match(re)?.[1] ?? null;

// Teatro Municipal do Porto (Rivoli + Campo Alegre) — grelha HTML do programa.
export const rivoli = {
  meta: { id: 'tmp', name: 'Teatro Municipal do Porto', url: 'https://www.teatromunicipaldoporto.pt/pt/programa/', city: 'Porto' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const out = new Map();
    for (const block of html.split(/class="grid-item grid-sizer"/).slice(1)) {
      const href = pickIn(block, /href="(\/pt\/programa\/[^"]+)"/);
      const month = pickIn(block, /mes-item"><p>([^<]+)</);
      const days = [...block.matchAll(/class="dia_dia">(\d{1,2})</g)].map((m) => m[1]);
      if (!href || !month || !days.length || out.has(href)) continue;
      const dates = days.map((d) => parsePtDateRange(`${d} ${month}`)?.start).filter(Boolean).sort();
      if (!dates.length) continue;
      const hall = pickIn(block, /class="local-p">([^<]+)/) ?? 'Rivoli';
      const room = pickIn(block, /class="sep">([^<]+)/);
      const times = [...new Set([...block.matchAll(/class="hora">([^<]+)/g)].map((m) => m[1].replace(':', 'h')))];
      out.set(
        href,
        makeEvent(this.meta, {
          id: href.split('/').filter(Boolean).pop(),
          url: absUrl(href, this.meta.url),
          title: pickIn(block, /<h2>([\s\S]*?)<\/h2>/),
          subtitle: pickIn(block, /class="subtitulo">([\s\S]*?)<\/p>/),
          venue: room ? `${hall} – ${room}` : hall,
          ...venueGeo(hall),
          startDate: dates[0],
          endDate: dates[dates.length - 1],
          dates: [...new Set(dates)],
          timesText: times.length === 1 ? times[0] : times.length ? 'vários horários' : null,
          rawCategories: [...block.matchAll(/class="linka"[^>]*><a[^>]*>([^<]+)/g)].map((m) => m[1]),
          fallbackCategory: 'palcos',
          image: pickIn(block, /data-src="([^"]+)"/),
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// Teatro Nacional São João (TNSJ, Carlos Alberto, Mosteiro de São Bento da Vitória) — microdata schema.org.
export const tnsj = {
  meta: { id: 'tnsj', name: 'Teatro Nacional São João', url: 'https://www.tnsj.pt/pt/agenda/', city: 'Porto' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const out = new Map();
    for (const li of html.split(/class="item-inside-wrap"/).slice(1)) {
      const href = pickIn(li, /itemprop="url" href="([^"]+)"/);
      const dateText = pickIn(li, /<time[^>]*>([\s\S]*?)<\/time>/)?.replace(/<[^>]+>/g, ' ');
      const start = pickIn(li, /itemprop="startDate" datetime="([\d-]+)"/);
      if (!href || !start || out.has(href)) continue;
      const range = dateText ? parsePtDateRange(decodeEntities(dateText).replace(/—/g, ' a ')) : null;
      const venue = pickIn(li, /class="local" itemprop="name">([^<]+)/);
      out.set(
        href,
        makeEvent(this.meta, {
          id: href.split('/').filter(Boolean)[2] ?? href,
          url: absUrl(href, this.meta.url),
          title: pickIn(li, /itemprop="name">([^<]+)<\/span>/),
          description: pickIn(li, /itemprop="description">([\s\S]*?)<\/div>/),
          venue,
          ...venueGeo(venue),
          startDate: start,
          endDate: range?.end && range.end >= start ? range.end : start,
          datesText: decodeEntities(dateText ?? '').replace(/\s+/g, ' ').trim(),
          rawCategories: [pickIn(li, /class="exibicao"><p>([^<]+)/)].filter(Boolean),
          image: absUrl(pickIn(li, /data-src="([^"]+)"/) ?? '', this.meta.url),
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// Coliseu Porto Ageas — API GraphQL pública usada pelo próprio site.
export const coliseuPorto = {
  meta: { id: 'coliseuporto', name: 'Coliseu Porto Ageas', url: 'https://www.coliseu.pt/agenda', city: 'Porto' },
  async scrape() {
    const query = `query events($filter: EventFilter, $paging: OffsetPaging, $sorting: [EventSort!]) {
      events(filter: $filter, paging: $paging, sorting: $sorting) { nodes { id name startDate slug cover ticketsUrl ticketsInfo room { name } } } }`;
    const body = JSON.stringify({
      query,
      variables: {
        filter: { startDate: { gte: new Date().toISOString() }, isVisible: { is: true }, isArchived: { is: false } },
        paging: { limit: 200 },
        sorting: [{ field: 'startDate', direction: 'ASC' }],
      },
    });
    const data = JSON.parse(await postText('https://nest.coliseu.pt/graph/', body));
    return (data.data?.events?.nodes ?? []).map((ev) => {
      const s = splitDateTime(ev.startDate);
      const prices = [...String(ev.ticketsInfo ?? '').matchAll(/(\d+(?:[.,]\d+)?)\s*€/g)].map((m) => Number(m[1].replace(',', '.')));
      return makeEvent(this.meta, {
        id: ev.id,
        url: `https://www.coliseu.pt/evento/${ev.slug}`,
        title: ev.name,
        venue: 'Coliseu Porto Ageas',
        address: 'Rua de Passos Manuel, 137, Porto',
        lat: 41.1468,
        lon: -8.6057,
        startDate: s.date,
        endDate: s.date,
        timesText: s.time,
        price: prices.length ? (Math.min(...prices) === Math.max(...prices) ? `${prices[0]}€` : `${Math.min(...prices)}€ – ${Math.max(...prices)}€`) : null,
        image: ev.cover ? `https://api.coliseu.pt/static/media/${ev.cover}` : null,
        tickets: ev.ticketsUrl ? (ev.ticketsUrl.startsWith('http') ? ev.ticketsUrl : `https://www.ticketline.pt/evento/${ev.ticketsUrl}`) : null,
        rawCategories: [],
        fallbackCategory: 'palcos',
      });
    });
  },
};

// ---------------------------------------------------------------------------
// Sagres Campo Pequeno — listagem HTML da agenda.
// ---------------------------------------------------------------------------
export const campoPequeno = {
  meta: { id: 'campopequeno', name: 'Sagres Campo Pequeno', url: 'https://www.sagrescampopequeno.pt/pt/agenda', city: 'Lisboa' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const out = new Map();
    for (const block of html.split(/class="[^"]*\bevent\b[^"]*"/).slice(1)) {
      const href = block.match(/href="(\/pt\/agenda\/[^"]+)"/)?.[1];
      const title = block.match(/<h3[^>]*class="[^"]*card-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const dateText = block.match(/<div class="date">\s*([\s\S]*?)\s*<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const dates = dateText && parsePtDateRange(dateText);
      if (!href || !title || !dates || out.has(href)) continue;
      const img = block.match(/<img[^>]+src="([^"]+)"/)?.[1];
      const tags = [...block.matchAll(/<li class="tag">([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      const url = absUrl(href, this.meta.url);
      out.set(
        href,
        makeEvent(this.meta, {
          id: href.split('/').pop(),
          url,
          title: decodeEntities(title),
          venue: 'Sagres Campo Pequeno',
          address: 'Campo Pequeno, 1000-082 Lisboa',
          lat: 38.7423,
          lon: -9.1453,
          startDate: dates.start,
          endDate: dates.end,
          datesText: dateText,
          rawCategories: tags,
          fallbackCategory: 'musica',
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Coliseu dos Recreios (Lisboa) — grelha Elementor na homepage.
// ---------------------------------------------------------------------------
export const coliseuLisboa = {
  meta: { id: 'coliseulisboa', name: 'Coliseu dos Recreios', url: 'https://coliseulisboa.com/', city: 'Lisboa' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const out = new Map();
    for (const block of html.split(/class="[^"]*elementor-top-section[^"]*"/).slice(1)) {
      const link = block.match(/href="(https:\/\/coliseulisboa\.com\/eventos\/[^"]+)"/)?.[1];
      if (!link) continue;
      const title = block.match(/<h3 class="elementor-heading-title[^"]*"[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const dateText = block.match(/<span class="elementor-icon-list-text elementor-post-info__item[^"]*">\s*([\s\S]*?)\s*<\/span>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const img = block.match(/<img[^>]+src="([^"]+)"/)?.[1];
      const dates = dateText && parsePtDateRange(dateText);
      if (!title || !dates || out.has(link)) continue;
      out.set(
        link,
        makeEvent(this.meta, {
          id: link.replace(/\/$/, '').split('/').pop(),
          url: link,
          title: decodeEntities(title),
          venue: 'Coliseu dos Recreios',
          address: 'Rua das Portas de Santo Antão, 96, Lisboa',
          lat: 38.7161,
          lon: -9.1408,
          startDate: dates.start,
          endDate: dates.end,
          datesText: dateText,
          rawCategories: [],
          fallbackCategory: 'palcos',
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Fundação Calouste Gulbenkian — agenda e exposições.
// ---------------------------------------------------------------------------
export const gulbenkian = {
  meta: { id: 'gulbenkian', name: 'Fundação Calouste Gulbenkian', url: 'https://gulbenkian.pt/agenda/', city: 'Lisboa' },
  async scrape() {
    const today = lisbonDate();
    const out = new Map();
    for (let page = 1; page <= 5; page++) {
      const html = await fetchText(`https://gulbenkian.pt/agenda/?page=${page}`);
      const matches = [...html.matchAll(/<a\s+href="(https:\/\/gulbenkian\.pt\/agenda\/[^"]+)"[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/article>\s*<\/a>/g)];
      let added = 0;
      for (const [, href, titleAttr, card] of matches) {
        const id = card.match(/data-event-id="(\d+)"/)?.[1] || href.replace(/\/$/, '').split('/').pop();
        if (out.has(id)) continue;
        const title = card.match(/<h3 class="fcg-card__title">\s*([\s\S]*?)\s*<\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim() || titleAttr;
        const dateText = card.match(/<footer class="fcg-card__footer">\s*<time[^>]*>\s*([\s\S]*?)\s*<\/time>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/&ndash;/g, ' a ').replace(/\s+/g, ' ').trim();
        const cat = card.match(/<li class="fcg-card__meta-item">\s*([\s\S]*?)\s*<\/li>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const img = card.match(/<img[^>]+src="([^"]+)"/)?.[1];
        const dates = dateText && parsePtDateRange(dateText);
        if (!title || !dates) continue;
        added++;
        out.set(
          id,
          makeEvent(this.meta, {
            id,
            url: href,
            title: decodeEntities(title),
            venue: 'Fundação Calouste Gulbenkian',
            address: 'Av. de Berna, 45A, Lisboa',
            lat: 38.7372,
            lon: -9.1534,
            startDate: dates.start,
            endDate: dates.end,
            datesText: dateText,
            rawCategories: cat ? [cat] : [],
            fallbackCategory: 'arte',
            image: img ? absUrl(img, this.meta.url) : null,
          }),
        );
      }
      if (added === 0) break;
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Teatro Tivoli BBVA — cartaz oficial.
// ---------------------------------------------------------------------------
export const tivoli = {
  meta: { id: 'tivolibbva', name: 'Teatro Tivoli BBVA', url: 'https://www.teatrotivolibbva.pt/', city: 'Lisboa' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const articles = [...html.matchAll(/<article\b[^>]*id="post-(\d+)"[^>]*>([\s\S]*?)<\/article>/g)];
    const out = new Map();
    for (const [, id, content] of articles) {
      const link = content.match(/<h2 class="df-post-title">\s*<a\s+href="([^"]+)">/)?.[1];
      const title = content.match(/<h2 class="df-post-title">\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const dateText = content.match(/<div class="df-acf-field-inner">\s*([^<]+?)\s*<\/div>/)?.[1]?.trim();
      const dates = dateText && parsePtDateRange(dateText);
      const tag = content.match(/<span class="df-item-wrap df-post-tags-wrap[^"]*">\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim();
      const img = content.match(/background-image:url\(([^)]+)\)/)?.[1]?.trim();
      const tickets = content.match(/href="([^"]*(?:ticketline|blueticket|bol\.pt)[^"]*)"/i)?.[1];
      if (!title || !link || !dates || out.has(link)) continue;
      out.set(
        link,
        makeEvent(this.meta, {
          id,
          url: link,
          title: decodeEntities(title),
          venue: 'Teatro Tivoli BBVA',
          address: 'Avenida da Liberdade, 182-188, Lisboa',
          lat: 38.7208,
          lon: -9.1466,
          startDate: dates.start,
          endDate: dates.end,
          datesText: dateText,
          rawCategories: tag ? [tag] : [],
          fallbackCategory: 'palcos',
          image: img ? absUrl(img, this.meta.url) : null,
          tickets: tickets ? decodeEntities(tickets) : null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Lisbon Venues: Centro de Congressos de Lisboa (CCL) e Feira Internacional de Lisboa (FIL)
// ---------------------------------------------------------------------------
async function scrapeLisbonVenues(targetVenue) {
  const today = lisbonDate();
  const html = await fetchText('https://lisbonvenues.pt/calendario/');
  const cards = html.split(/class="feira-card"/).slice(1);
  const out = new Map();

  for (const card of cards) {
    const title = card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
    const url = card.match(/<a\s+class="feira-media"\s+href="([^"]+)"/)?.[1] || card.match(/<h3[^>]*><a\s+href="([^"]+)"/)?.[1];
    const img = card.match(/<img[^>]+src="([^"]+)"/)?.[1];
    const dataText = card.match(/<p class="data">\s*([\s\S]*?)\s*<\/p>/)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const localText = card.match(/<p class="local">\s*([\s\S]*?)\s*<\/p>/)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const tickets = card.match(/href="([^"]*(?:tickets|bilheteira|ticketline|blueticket)[^"]*)"/i)?.[1];
    const dates = dataText && parsePtDateRange(dataText);
    if (!title || !dates) continue;

    const isMatch = targetVenue === 'ccl' ? /CCL|Centro de Congressos/i.test(localText) : /FIL|Parque das Nações/i.test(localText);
    if (!isMatch) continue;

    const id = (url ?? title).toLowerCase().replace(/https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (out.has(id)) continue;

    const isFil = targetVenue === 'fil';
    out.set(
      id,
      makeEvent(
        isFil
          ? { id: 'fil', name: 'Feira Internacional de Lisboa', url: 'https://fil.pt/', city: 'Lisboa' }
          : { id: 'ccl', name: 'Centro de Congressos de Lisboa', url: 'https://lisbonvenues.pt/agenda/', city: 'Lisboa' },
        {
          id,
          url: url || 'https://lisbonvenues.pt/calendario/',
          title: decodeEntities(title),
          venue: isFil ? 'Feira Internacional de Lisboa (FIL)' : 'Centro de Congressos de Lisboa',
          address: isFil ? 'Rua do Bojador, Parque das Nações, Lisboa' : 'Praça das Indústrias, 1, Lisboa',
          lat: isFil ? 38.7695 : 38.6974,
          lon: isFil ? -9.0945 : -9.1822,
          startDate: dates.start,
          endDate: dates.end,
          datesText: dataText,
          rawCategories: ['Feiras', 'Congressos'],
          fallbackCategory: 'feiras',
          image: img || null,
          tickets: tickets || null,
        },
      ),
    );
  }
  return [...out.values()].filter((e) => e.endDate >= today);
}

export const ccl = {
  meta: { id: 'ccl', name: 'Centro de Congressos de Lisboa', url: 'https://lisbonvenues.pt/agenda/', city: 'Lisboa' },
  scrape() {
    return scrapeLisbonVenues('ccl');
  },
};

export const fil = {
  meta: { id: 'fil', name: 'Feira Internacional de Lisboa', url: 'https://fil.pt/', city: 'Lisboa' },
  scrape() {
    return scrapeLisbonVenues('fil');
  },
};

// ---------------------------------------------------------------------------
// Exponor — Feira Internacional do Porto (Leça da Palmeira, Matosinhos).
// ---------------------------------------------------------------------------
export const exponor = {
  meta: { id: 'exponor', name: 'Exponor', url: 'https://exponor.pt/calendario-de-eventos/', city: 'Matosinhos' },
  async scrape() {
    const today = lisbonDate();
    const out = new Map();
    for (let page = 1; page <= 4; page++) {
      const url = page === 1 ? this.meta.url : `https://exponor.pt/calendario-de-eventos/${page}/`;
      let html;
      try {
        html = await fetchText(url);
      } catch {
        break;
      }
      const items = html.split(/data-elementor-type="loop-item"/).slice(1);
      if (!items.length) break;

      for (const item of items) {
        const link = item.match(/<h3[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*><a\s+href="([^"]+)"/)?.[1];
        const title = item.match(/<h3[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const desc = item.match(/class="[^"]*elementor-widget-text-editor[^"]*"[^>]*><div class="elementor-widget-container">\s*([\s\S]*?)\s*<\/div>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const img = item.match(/<img[^>]+src="([^"]+)"/)?.[1];
        const cat = item.match(/<a\s+href="https:\/\/exponor\.pt\/categoria_calendario\/[^"]+"[^>]*>([^<]+)<\/a>/)?.[1]?.trim();

        const dateTextMatch = item.match(/(?:<span[^>]*class="elementor-icon-list-text[^"]*"[^>]*>|>)\s*(\d{1,2}(?:\s*(?:a|e|-)\s*\d{1,2})?\s*(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s*(?:de\s+)?\d{4})?(?:\s*-\s*\d{1,2}h\d{0,2})?)\s*</i);
        const dateText = dateTextMatch?.[1]?.replace(/<[^>]+>/g, '').trim();
        const dates = dateText && parsePtDateRange(dateText);

        if (!link || !title || !dates || out.has(link)) continue;

        out.set(
          link,
          makeEvent(this.meta, {
            id: link.replace(/\/$/, '').split('/').pop(),
            url: link,
            title: decodeEntities(title),
            description: desc ? decodeEntities(desc) : null,
            venue: 'Exponor – Feira Internacional do Porto',
            address: 'Av. Dr. António Macedo, Leça da Palmeira',
            lat: 41.1983,
            lon: -8.6917,
            startDate: dates.start,
            endDate: dates.end,
            datesText: dateText,
            rawCategories: cat ? [cat] : ['Feira'],
            fallbackCategory: 'feiras',
            image: img ? absUrl(img, this.meta.url) : null,
          }),
        );
      }
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Jazz ao Centro Clube / Salão Brazil (Coimbra).
// ---------------------------------------------------------------------------
export const jazzAoCentro = {
  meta: { id: 'jazzaocentro', name: 'Jazz ao Centro / Salão Brazil', url: 'https://www.jazzaocentroclube.pt/agenda', city: 'Coimbra' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const items = html.split(/class="event-wrapper event-item"/).slice(1);
    const out = new Map();

    for (const item of items) {
      const link = item.match(/href="(\/agenda\/[^"]+)"/)?.[1];
      const title = item.match(/<h2 class="item-featured-title[^"]*">([\s\S]*?)<\/h2>/)?.[1]?.trim();
      const dateStr = item.match(/<div class="item-featured-date">([^<]+)<\/div>/)?.[1]?.trim();
      const img = item.match(/<img[^>]+src="([^"]+)"/)?.[1];
      const cats = [...item.matchAll(/class="category-block">([^<]+)<\/div>/g)].map((m) => m[1].trim());

      const dates = dateStr && parsePtDateRange(dateStr);
      if (!link || !title || !dates || out.has(link)) continue;

      const url = absUrl(link, this.meta.url);
      const isSalao = cats.some((c) => c.toLowerCase().includes('brazil'));
      out.set(
        link,
        makeEvent(this.meta, {
          id: link.replace(/\/$/, '').split('/').pop(),
          url,
          title: decodeEntities(title),
          venue: isSalao ? 'Salão Brazil' : 'Jazz ao Centro Clube',
          address: 'Praça do Comércio 60, Coimbra',
          lat: 40.2089,
          lon: -8.4294,
          startDate: dates.start,
          endDate: dates.end,
          datesText: dateStr,
          rawCategories: cats,
          fallbackCategory: 'musica',
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Convento São Francisco (Coimbra).
// ---------------------------------------------------------------------------
export const conventoSaoFrancisco = {
  meta: { id: 'conventosaofrancisco', name: 'Convento São Francisco', url: 'https://www.coimbraconvento.pt/pt/agenda/', city: 'Coimbra' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const blocks = html.split(/<li class="infinite-item bloco-agenda">/).slice(1);
    const out = new Map();

    for (const b of blocks) {
      const href = b.match(/<a href="(\/pt\/agenda\/[^"]+)"/)?.[1];
      const title = b.match(/<h4><a[^>]*>([\s\S]*?)<\/a><\/h4>/)?.[1]?.trim();
      const cat = b.match(/<h6>([\s\S]*?)<\/h6>/)?.[1]?.trim();
      const room = b.match(/<h5>([\s\S]*?)<\/h5>/)?.[1]?.trim();
      const img = b.match(/<img src="([^"]+)"/)?.[1];
      const when = b.match(/<div class="when">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const dates = when && parsePtDateRange(when);

      if (!href || !title || !dates || out.has(href)) continue;

      const url = absUrl(href, this.meta.url);
      out.set(
        href,
        makeEvent(this.meta, {
          id: href.replace(/\/$/, '').split('/').pop(),
          url,
          title: decodeEntities(title),
          venue: room ? `Convento São Francisco (${decodeEntities(room)})` : 'Convento São Francisco',
          address: 'Av. da Guarda Inglesa 1A, Coimbra',
          lat: 40.2045,
          lon: -8.4344,
          startDate: dates.start,
          endDate: dates.end,
          datesText: when,
          rawCategories: cat ? [decodeEntities(cat)] : [],
          fallbackCategory: 'musica',
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Theatro Circo (Braga).
// ---------------------------------------------------------------------------
export const theatroCirco = {
  meta: { id: 'theatrocirco', name: 'Theatro Circo', url: 'https://theatrocirco.com/programa/', city: 'Braga' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const cards = html.split(/class="highlight-card"/).slice(1);
    const out = new Map();

    for (const c of cards) {
      const link = c.match(/<a href="(https:\/\/theatrocirco\.com\/event\/[^"]+)"/)?.[1];
      const meta = c.match(/<p class="highlight-meta[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const title1 = c.match(/<h3 class="line-one">([\s\S]*?)<\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const title2 = c.match(/<h3 class="line-two">([\s\S]*?)<\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const title = [title1, title2].filter(Boolean).join(' - ');
      const img = c.match(/<img[^>]+src="([^"]+)"/)?.[1];
      const tickets = c.match(/<a href="(https:\/\/[^"]*bol\.pt[^"]+)"/)?.[1];

      const decodedMeta = decodeEntities(meta || '');
      const [datePart, catPart] = decodedMeta.split(/→|&rarr;/).map((s) => s.trim());
      const dates = datePart && parsePtDateRange(datePart);

      if (!link || !title || !dates || out.has(link)) continue;

      out.set(
        link,
        makeEvent(this.meta, {
          id: link.replace(/\/$/, '').split('/').pop(),
          url: link,
          title: decodeEntities(title),
          venue: 'Theatro Circo',
          address: 'Av. da Liberdade 697, Braga',
          lat: 41.5502,
          lon: -8.4208,
          startDate: dates.start,
          endDate: dates.end,
          datesText: datePart,
          rawCategories: catPart ? [catPart] : [],
          fallbackCategory: 'teatro',
          image: img ? absUrl(img, this.meta.url) : null,
          tickets: tickets || null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// gnration (Braga).
// ---------------------------------------------------------------------------
export const gnration = {
  meta: { id: 'gnration', name: 'gnration', url: 'https://www.gnration.pt/ver-todos/', city: 'Braga' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const cards = html.split(/<div class="card column">/).slice(1);
    const out = new Map();

    for (const c of cards) {
      const link = c.match(/<a class="link-cover" href="([^"]+)"/)?.[1];
      const title = c.match(/<h3 class="card__title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const dateText = c.match(/<p class="card__date[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const cat = c.match(/<span class="project__category">([^<]+)<\/span>/)?.[1]?.trim();
      const price = c.match(/<p class="card__price[^>]*>([^<]+)<\/p>/)?.[1]?.trim();
      const img = c.match(/style="background-image:url\(([^)]+)\);"/)?.[1];
      const dates = dateText && parsePtDateRange(dateText);

      if (!link || !title || !dates || out.has(link)) continue;

      out.set(
        link,
        makeEvent(this.meta, {
          id: link.replace(/\/$/, '').split('/').pop(),
          url: link,
          title: decodeEntities(title),
          venue: 'gnration',
          address: 'Praça Conde de Agrolongo 123, Braga',
          lat: 41.5529,
          lon: -8.4262,
          startDate: dates.start,
          endDate: dates.end,
          datesText: dateText,
          rawCategories: cat ? [cat] : [],
          fallbackCategory: 'musica',
          image: img ? absUrl(img, this.meta.url) : null,
          priceRaw: price || null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Teatros Municipais de Leiria (Teatro José Lúcio da Silva & Teatro Miguel Franco).
// ---------------------------------------------------------------------------
export const teatroJLSilva = {
  meta: { id: 'teatrojlsilva', name: 'Teatros Municipais de Leiria', url: 'https://www.teatrojlsilva.pt/', city: 'Leiria' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const grid = html.split('id="tjls-programacao-event-grid"')[1]?.split('</ul')[0];
    const articles = grid ? grid.split('<article').slice(1) : [];
    const out = new Map();

    for (const art of articles) {
      const link = art.match(/<a href="(https:\/\/www\.teatrojlsilva\.pt\/evento\/[^"]+)"/)?.[1];
      const title = art.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const venue = art.match(/<span class="truncate">([^<]+)<\/span>/)?.[1]?.trim();
      const cat = art.match(/<span[^>]*uppercase rounded[^>]*>([^<]+)<\/span>/)?.[1]?.trim();
      const isoDate = art.match(/<time datetime="([^"]+)"/)?.[1];
      const dateText = art.match(/<time[^>]*>([^<]+)<\/time>/)?.[1]?.trim();
      const img = art.match(/<img[^>]+src="([^"]+)"/)?.[1];

      const startDate = isoDate || (dateText && parsePtDateRange(dateText)?.start);
      if (!link || !title || !startDate || out.has(link)) continue;

      out.set(
        link,
        makeEvent(this.meta, {
          id: link.replace(/\/$/, '').split('/').pop(),
          url: link,
          title: decodeEntities(title),
          venue: venue ? decodeEntities(venue) : 'Teatro José Lúcio da Silva',
          address: 'Av. Heróis de Angola, Leiria',
          lat: 39.7436,
          lon: -8.8071,
          startDate,
          endDate: startDate,
          datesText: dateText || startDate,
          rawCategories: cat ? [decodeEntities(cat)] : [],
          fallbackCategory: 'teatro',
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Teatro Viriato (Viseu).
// ---------------------------------------------------------------------------
export const teatroViriato = {
  meta: { id: 'teatroviriato', name: 'Teatro Viriato', url: 'https://www.teatroviriato.com/agenda/', city: 'Viseu' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const seasonPos = html.indexOf('temporada set - dez');
    const nextSeason = seasonPos > -1 ? html.indexOf('class="section-title', seasonPos + 20) : -1;
    const block = seasonPos > -1 && nextSeason > -1 ? html.slice(seasonPos, nextSeason) : html;

    const monthBlocks = block.split(/<div\s+class="panel\s*"\s+data-month="(\d+)"/);
    const year = new Date().getFullYear();
    const out = new Map();

    for (let m = 1; m < monthBlocks.length; m += 2) {
      const monthNum = parseInt(monthBlocks[m], 10);
      const mHtml = monthBlocks[m + 1];
      const cards = mHtml.split(/<a\s+href="([^"]+)"\s+class="show-card"/);

      for (let c = 1; c < cards.length; c += 2) {
        const href = cards[c];
        const b = cards[c + 1];
        const title = b.match(/<div class="title">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const dateText = b.match(/<div class="dates">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const cat = b.match(/<div\s+class="category"[^>]*>([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const img = b.match(/<img[^>]+src="([^"]+)"/)?.[1];

        let dates = null;
        if (dateText) {
          if (/[a-zA-Z]{3}/.test(dateText)) {
            dates = parsePtDateRange(dateText);
          } else {
            const days = dateText.match(/\d{1,2}/g)?.map(Number);
            if (days && days.length) {
              const firstDay = Math.min(...days);
              const lastDay = Math.max(...days);
              const mm = String(monthNum).padStart(2, '0');
              dates = {
                start: `${year}-${mm}-${String(firstDay).padStart(2, '0')}`,
                end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
              };
            }
          }
        }

        if (!href || !title || !dates || title.startsWith('Programação') || out.has(href)) continue;

        const url = absUrl(href, this.meta.url);
        out.set(
          href,
          makeEvent(this.meta, {
            id: href.replace(/\/$/, '').split('/').pop(),
            url,
            title: decodeEntities(title),
            venue: 'Teatro Viriato',
            address: 'Largo José dos Reis, Viseu',
            lat: 40.6575,
            lon: -7.9142,
            startDate: dates.start,
            endDate: dates.end,
            datesText: dateText,
            rawCategories: cat ? [cat] : [],
            fallbackCategory: 'teatro',
            image: img ? absUrl(img, this.meta.url) : null,
          }),
        );
      }
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Município de Évora — Agenda Cultural.
// ---------------------------------------------------------------------------
export const cmEvora = {
  meta: { id: 'cmevora', name: 'Município de Évora', url: 'https://www.cm-evora.pt/municipe/agenda-e-noticias/agenda/lista-de-eventos/', city: 'Évora' },
  async scrape() {
    const today = lisbonDate();
    const out = new Map();

    for (let page = 1; page <= 3; page++) {
      const url = page === 1 ? this.meta.url : `https://www.cm-evora.pt/municipe/agenda-e-noticias/agenda/lista-de-eventos/page/${page}/`;
      let html;
      try {
        html = await fetchText(url);
      } catch {
        break;
      }
      const items = html.split(/<div class="event-001 small-12"/).slice(1);
      if (!items.length) break;

      for (const item of items) {
        const link = item.match(/href="(https:\/\/www\.cm-evora\.pt\/eventos\/[^"]+)"/)?.[1];
        const title = item.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const dateText = item.match(/class="event-001-inner-date-inner[^"]*">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const dates = dateText && parsePtDateRange(dateText);
        const img = item.match(/<img[^>]+src="([^"]+)"/)?.[1];

        if (!link || !title || !dates || out.has(link)) continue;

        out.set(
          link,
          makeEvent(this.meta, {
            id: link.replace(/\/$/, '').split('/').pop(),
            url: link,
            title: decodeEntities(title),
            venue: 'Évora',
            address: 'Praça do Sertório, Évora',
            lat: 38.5725,
            lon: -7.9073,
            startDate: dates.start,
            endDate: dates.end,
            datesText: dateText,
            rawCategories: [],
            fallbackCategory: 'cultura',
            image: img ? absUrl(img, this.meta.url) : null,
          }),
        );
      }
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// ---------------------------------------------------------------------------
// Teatro Municipal de Bragança.
// ---------------------------------------------------------------------------
export const teatroBraganca = {
  meta: { id: 'teatrobraganca', name: 'Teatro Municipal de Bragança', url: 'https://teatromunicipal.cm-braganca.pt/pages/88', city: 'Bragança' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const items = html.split(/<div class="event_item_container">/).slice(1);
    const out = new Map();

    for (const item of items) {
      const link = item.match(/href="(\/programacao\/proximos-espetaculos\/evento\/[^"]+)"/)?.[1];
      const title = item.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const dateHtml = item.match(/<div class="dates[^"]*">([\s\S]*?)<\/div>\s*<\/div>/)?.[1];
      const dateText = dateHtml ? dateHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;
      const dates = dateText && parsePtDateRange(dateText);
      const img = item.match(/<img[^>]+src="([^"]+)"/)?.[1];

      if (!link || !title || !dates || out.has(link)) continue;

      const url = absUrl(link, this.meta.url);
      out.set(
        link,
        makeEvent(this.meta, {
          id: link.replace(/\/$/, '').split('/').pop(),
          url,
          title: decodeEntities(title),
          venue: 'Teatro Municipal de Bragança',
          address: 'Praça Prof. Cavaleiro de Ferreira, Bragança',
          lat: 41.8055,
          lon: -6.7580,
          startDate: dates.start,
          endDate: dates.end,
          datesText: dateText,
          rawCategories: [],
          fallbackCategory: 'teatro',
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};
