// Salas de espetáculos com agenda própria.
import { fetchText, postText, absUrl, lisbonDate, decodeEntities, splitDateTime, stripHtml, mapLimit } from '../util.mjs';
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
      const alt = block.match(/<img[^>]+alt="([^"]+)"/)?.[1]?.trim();
      const imgTitle = block.match(/<img[^>]+title="([^"]+)"/)?.[1]?.trim();
      const artist = alt || imgTitle;
      const subtitle = artist && !artist.toLowerCase().startsWith('cartaz') && artist.toLowerCase() !== title.toLowerCase() ? decodeEntities(artist) : null;
      const tags = [...block.matchAll(/<li class="tag">([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      const url = absUrl(href, this.meta.url);
      out.set(
        href,
        makeEvent(this.meta, {
          id: href.split('/').pop(),
          url,
          title: decodeEntities(title),
          subtitle,
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
    const carouselMatch = html.match(/window\.__EVENTOS_CARROSSEL__\s*=\s*(\[[\s\S]*?\]);/);
    const carouselEvents = carouselMatch ? JSON.parse(carouselMatch[1]) : [];
    const descBySlug = new Map(carouselEvents.map((c) => [c.slug, c.description?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()]));

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

      const slug = link.replace(/\/$/, '').split('/').pop();
      const desc = descBySlug.get(slug);

      out.set(
        link,
        makeEvent(this.meta, {
          id: slug,
          url: link,
          title: decodeEntities(title),
          description: desc ? decodeEntities(desc) : null,
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
        const subtitle = b.match(/<div class="subtitle">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
            subtitle: subtitle ? decodeEntities(subtitle) : null,
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

// ---------------------------------------------------------------------------
// Auditório CCOP (Círculo Católico de Operários do Porto).
// ---------------------------------------------------------------------------
export const auditorioCCOP = {
  meta: { id: 'auditorioccop', name: 'Auditório CCOP', url: 'https://auditorio-ccop.pt/', city: 'Porto' },
  async scrape() {
    const today = lisbonDate();
    const out = new Map();
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://auditorio-ccop.pt/?p=agenda',
      'User-Agent': 'Mozilla/5.0',
    };

    for (let p2 = 0; p2 <= 2; p2++) {
      let html;
      try {
        const res = await fetch('https://auditorio-ccop.pt/ver1/phps/respostas.php', {
          method: 'POST',
          headers,
          body: `parametros%5Bp1%5D=6&parametros%5Bp2%5D=${p2}&parametros%5Bbsmall%5D=0`,
        });
        html = await res.text();
      } catch {
        break;
      }

      const calls = [...html.matchAll(/showEventoAgenda\((\d+),(\d+),(\d+),(\d+)\)/g)];
      for (const [, p3, p4, o, t] of calls) {
        try {
          const dRes = await fetch('https://auditorio-ccop.pt/ver1/phps/respostas.php', {
            method: 'POST',
            headers,
            body: `parametros%5Bp1%5D=7&parametros%5Bp2%5D=${o}&parametros%5Bp3%5D=${p3}&parametros%5Bp4%5D=${p4}&parametros%5Bp5%5D=${t}`,
          });
          const dHtml = await dRes.text();
          const rawTitle = dHtml.match(/<tx-xlarge><b>([\s\S]*?)<\/b><\/tx-xlarge>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
          const day = dHtml.match(/<tx-xxxlarge><b>(\d+)<\/b><\/tx-xxxlarge>/)?.[1];
          const time = dHtml.match(/<b>(\d{1,2}:\d{2})<\/b>/)?.[1];
          const img = dHtml.match(/data-src="([^"]+)"/)?.[1];
          const tickets = dHtml.match(/window\.open\((?:"|\x27)(https:\/\/[^\x27"]+)/)?.[1];
          const cat = dHtml.match(/<i>([A-ZÇÃÕ\s]+)<\/i>/)?.[1]?.trim();
          const desc = dHtml.match(/<div style="margin-top: 20px; padding: 0 40px 0 40px[^>]*>([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const price = dHtml.match(/Preço:([^\s<]+)/)?.[1]?.trim();

          if (!rawTitle || !day) continue;
          const mm = String(p3).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const dateStr = `${p4}-${mm}-${dd}`;
          const id = `ccop-${p4}-${mm}-${dd}-${t}`;

          if (out.has(id)) continue;

          out.set(
            id,
            makeEvent(this.meta, {
              id,
              url: 'https://auditorio-ccop.pt/?p=agenda',
              title: decodeEntities(rawTitle),
              description: desc ? decodeEntities(desc) : null,
              venue: 'Auditório CCOP',
              address: 'Rua de Costa Cabral 75, Porto',
              lat: 41.1598,
              lon: -8.6012,
              startDate: dateStr,
              endDate: dateStr,
              timesText: time || null,
              price: price || null,
              image: img ? absUrl(img, this.meta.url) : null,
              tickets: tickets || null,
              rawCategories: cat ? [cat] : [],
              fallbackCategory: 'musica',
            }),
          );
        } catch {
          // ignora erro num item individual
        }
      }
    }
    return [...out.values()].filter((e) => e.endDate >= today);
  },
};

// Teatro Académico de Gil Vicente (TAGV, Coimbra) — lista da temporada agrupada por mês ("out", "nov"…),
// sem ano: deduz-se da temporada ("2026/27": set–dez de 2026, jan–ago de 2027). Os já passados vêm marcados.
const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
export const tagv = {
  meta: { id: 'tagv', name: 'Teatro Académico de Gil Vicente', url: 'https://tagv.pt/agenda/', city: 'Coimbra' },
  async scrape() {
    const today = lisbonDate();
    // O site responde devagar (≈40 s).
    const first = await fetchText(this.meta.url, { timeoutMs: 90_000 });
    const season = first.match(/Temporada\s+(\d{4})\s*\/\s*\d{2,4}/)?.[1];
    const startYear = season ? Number(season) : Number(today.slice(0, 4));
    // Cada mês da temporada atual tem a sua página (?temporada=202627-nov, …).
    const code = `${startYear}${String(startYear + 1).slice(2)}`;
    const monthPages = [...new Set([...first.matchAll(new RegExp(`href="(https://tagv\\.pt/agenda/\\?temporada=${code}[^"&]*)"`, 'g'))].map((m) => decodeEntities(m[1])))];
    const pages = [first];
    for (const u of monthPages) pages.push(await fetchText(u, { timeoutMs: 90_000 }).catch(() => ''));
    const out = [];
    const seen = new Set();
    for (const html of pages) {
    const list = html.slice(html.indexOf('id="mostra-list"'), html.indexOf('class="grid-content'));
    let month = null;
    for (const li of list.split(/<li\b/).slice(1)) {
      const m = li.match(/class="row o-mes"[\s\S]*?<p[^>]*>\s*([a-zç]{3})/i);
      if (m) {
        month = MESES[m[1].toLowerCase()] ?? month;
        continue;
      }
      if (!month || /class="past"/.test(li)) continue;
      const href = pickIn(li, /class="link"[^>]*href="([^"]+)"/) ?? pickIn(li, /href="(https:\/\/tagv\.pt\/agenda\/[^"?]+)"/);
      const day = pickIn(li, /evento-dias">\s*<p>(\d{1,2})<\/p>/);
      if (!href || !day) continue;
      const year = month >= 8 ? startYear : startYear + 1;
      const date = `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
      if (date < today || seen.has(href)) continue;
      seen.add(href);
      const time = pickIn(li, /<hr>\s*<p>\s*(?:<!--[\s\S]*?-->)?\s*(\d{1,2}h\d{2})/);
      out.push(
        makeEvent(this.meta, {
          id: href.split('/').filter(Boolean).pop(),
          url: href,
          title: decodeEntities(pickIn(li, /data-title="([^"]+)"/) ?? pickIn(li, /evento-titulo">\s*([\s\S]*?)\s*<\/h3>/) ?? ''),
          venue: 'Teatro Académico de Gil Vicente',
          address: 'Praça da República, Coimbra',
          lat: 40.2093,
          lon: -8.4198,
          startDate: date,
          endDate: date,
          timesText: time,
          rawCategories: [pickIn(li, /class="cat-link"[^>]*>\s*([^<]+?)\s*</)].filter(Boolean),
          fallbackCategory: 'teatro',
          image: pickIn(li, /data-picture="([^"]+)"/),
        }),
      );
    }
    }
    return out;
  },
};

// Espaço Vita (Braga) — WordPress: a API lista os eventos (tipo agenda_cpt); data, hora, sala e preço vêm da página.
// A data não traz ano: deduz-se pela data de publicação (um evento é anunciado antes de acontecer).
export const espacoVita = {
  meta: { id: 'espacovita', name: 'Espaço Vita', url: 'https://www.espacovita.pt/agenda/', city: 'Braga' },
  async scrape() {
    const today = lisbonDate();
    // Categorias do próprio site (id → nome).
    const cats = Object.fromEntries((JSON.parse(await fetchText('https://www.espacovita.pt/wp-json/wp/v2/categoria_agenda_cpt?per_page=100&_fields=id,name').catch(() => '[]')) || []).map((c) => [c.id, decodeEntities(c.name)]));
    const items = [];
    for (let page = 1; page <= 5; page++) {
      const list = JSON.parse(await fetchText(`https://www.espacovita.pt/wp-json/wp/v2/agenda_cpt?per_page=50&page=${page}&_fields=id,link,date,title,categoria_agenda_cpt`).catch(() => '[]'));
      if (!Array.isArray(list) || !list.length) break;
      items.push(...list);
      // Publicados há mais de um ano já não interessam.
      if (list.at(-1).date.slice(0, 10) < String(Number(today.slice(0, 4)) - 1) + today.slice(4)) break;
    }
    const out = [];
    for (const it of items) {
      const html = await fetchText(it.link, { cacheHours: 24 }).catch(() => '');
      const dateText = stripHtml(pickIn(html, /class="data_hora_evento\s*">([\s\S]*?)<\/p>/) ?? '');
      const r = parsePtDateRange(dateText, new Date(it.date));
      if (!r) continue;
      // Ano pela publicação: se a data cai antes da publicação, é do ano seguinte.
      let start = r.start;
      const pub = it.date.slice(0, 10);
      if (start < pub) start = `${Number(start.slice(0, 4)) + 1}${start.slice(4)}`;
      if (start < today) continue;
      out.push(
        makeEvent(this.meta, {
          id: it.id,
          url: it.link,
          title: decodeEntities(it.title?.rendered ?? ''),
          subtitle: stripHtml(pickIn(html, /<h1>[\s\S]*?<\/h1>\s*<h3>([\s\S]*?)<\/h3>/) ?? ''),
          description: stripHtml(pickIn(html, /<p class="p3">([\s\S]*?)<\/p>/) ?? ''),
          venue: `Espaço Vita – ${stripHtml(pickIn(html, /class="espaco_evento">([\s\S]*?)<\/p>/) ?? 'Auditório')}`,
          address: 'Rua de São Domingos, 94B, Braga',
          lat: 41.5457,
          lon: -8.4304,
          startDate: start,
          endDate: start,
          timesText: stripHtml(pickIn(html, /hora_do_evento">([\s\S]*?)<\/p>/) ?? '') || null,
          price: stripHtml(pickIn(html, /class="preco_evento">([\s\S]*?)<\/p>/) ?? '') || null,
          rawCategories: (it.categoria_agenda_cpt ?? []).map((id) => cats[id]).filter(Boolean),
          image: pickIn(html, /<meta property="og:image" content="([^"]+)"/),
        }),
      );
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Casa da Cultura César Oliveira (CCCO - Oliveira do Hospital)
// Website oficial: https://www.ccco.pt/
// Bilheteira / Programação ativa: https://www.ticketline.pt/salas/sala/4148
// ---------------------------------------------------------------------------
export const ccco = {
  meta: {
    id: 'ccco',
    name: 'Casa da Cultura César Oliveira',
    url: 'https://www.ccco.pt/',
    city: 'Oliveira do Hospital',
  },
  async scrape() {
    const today = lisbonDate();
    const out = new Map();

    // 1. Bilheteira oficial na Ticketline (sala 4148 da CCCO)
    const tlHtml = await fetchText('https://www.ticketline.pt/salas/sala/4148', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    }).catch(() => '');

    if (tlHtml) {
      const blocks = tlHtml.split(/schema\.org\/Event/);
      for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i];
        const urlMatch = b.match(/href="([^"]+)"/);
        const dateMatch = b.match(/data-date="([^"]+)"/);
        const titleMatch = b.match(/class="title"[^>]*>([\s\S]*?)<\/p>/);
        const catMatch = b.match(/class="metadata categories"[^>]*>([\s\S]*?)<\/p>/);
        const imgMatch = b.match(/data-src-original="([^"]+)"/) || b.match(/src="([^"]+)"/);

        if (!urlMatch || !titleMatch || !dateMatch) continue;

        const title = decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim());
        const date = dateMatch[1];
        if (date < today) continue;

        const url = 'https://www.ticketline.pt' + urlMatch[1];
        const img = imgMatch ? (imgMatch[1].startsWith('http') ? imgMatch[1] : 'https://www.ticketline.pt' + imgMatch[1]) : null;
        const cat = catMatch ? catMatch[1].trim() : null;

        const rawCats = [];
        if (cat) rawCats.push(cat);
        const titleLower = title.toLowerCase();
        if (/dário guerreiro|jel|humor|comédia|stand-up/i.test(titleLower)) rawCats.push('Humor');
        if (/concert|guitar|uhf|música|fado|rock|jazz/i.test(titleLower)) rawCats.push('Música');
        if (/arte|teatro|peça/i.test(titleLower)) rawCats.push('Teatro');

        const id = url.split('/').filter(Boolean).pop();
        out.set(
          id,
          makeEvent(this.meta, {
            id,
            url,
            title,
            venue: 'Casa da Cultura César Oliveira',
            address: 'Rua do Colégio, 3400-065 Oliveira do Hospital',
            lat: 40.3589,
            lon: -7.8608,
            startDate: date,
            endDate: date,
            tickets: url,
            rawCategories: rawCats,
            fallbackCategory: 'teatro',
            image: img,
          }),
        );
      }
    }

    // 2. Página oficial ccco.pt (se tiver eventos além de "EM BREVE")
    const siteHtml = await fetchText('https://www.ccco.pt/').catch(() => '');
    if (siteHtml) {
      const cards = siteHtml.split(/<article\s+class="program-card">/);
      for (let i = 1; i < cards.length; i++) {
        const card = cards[i].split('</article>')[0];
        const dateText = card.match(/class="program-card-date"[^>]*>([\s\S]*?)<\/span>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        if (!dateText || /em breve/i.test(dateText)) continue;

        const title = card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const category = card.match(/class="program-card-category"[^>]*>([\s\S]*?)<\/span>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const desc = card.match(/<p>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        const img = card.match(/<img[^>]+src="([^"]+)"/)?.[1];
        const ticketLink = card.match(/href="([^"]*(?:ticketline|bol\.pt|ccco)[^"]*)"/)?.[1];

        const dates = parsePtDateRange(dateText);
        if (!title || !dates || dates.end < today) continue;

        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (out.has(id)) continue;

        out.set(
          id,
          makeEvent(this.meta, {
            id,
            url: ticketLink || 'https://www.ccco.pt/#programacao',
            title: decodeEntities(title),
            description: desc || null,
            venue: 'Casa da Cultura César Oliveira',
            address: 'Rua do Colégio, 3400-065 Oliveira do Hospital',
            lat: 40.3589,
            lon: -7.8608,
            startDate: dates.start,
            endDate: dates.end,
            datesText: dateText,
            tickets: ticketLink || null,
            rawCategories: category ? [category] : [],
            fallbackCategory: 'teatro',
            image: img ? absUrl(img, this.meta.url) : null,
          }),
        );
      }
    }

    return [...out.values()];
  },
};

// ---------------------------------------------------------------------------
// Teatro Micaelense — Ponta Delgada, Açores
// ---------------------------------------------------------------------------
export const teatroMicaelense = {
  meta: {
    id: 'teatromicaelense',
    name: 'Teatro Micaelense',
    url: 'https://www.teatromicaelense.pt/agenda/',
    venue: 'Teatro Micaelense',
    address: 'Largo de São João, 9500-106 Ponta Delgada',
    city: 'Ponta Delgada',
    lat: 37.7423,
    lon: -25.6698,
  },
  async scrape() {
    const today = lisbonDate();
    const out = [];
    const seenUrls = new Set();

    for (let page = 1; page <= 5; page++) {
      const pageUrl = page === 1 ? this.meta.url : `https://www.teatromicaelense.pt/agenda/pag-${page}/`;
      let html;
      try {
        html = await fetchText(pageUrl);
      } catch {
        break;
      }

      const cards = [...html.matchAll(/<div class="group relative border[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g)];
      if (!cards.length) break;

      for (const c of cards) {
        const block = c[1];
        const linkMatch = block.match(/href="(\/agenda\/(\d{4}-\d{2}-\d{2})\/[^"]+)"/);
        if (!linkMatch) continue;

        const link = absUrl(linkMatch[1], this.meta.url);
        if (seenUrls.has(link)) continue;
        seenUrls.add(link);

        const startDate = linkMatch[2];
        if (startDate < today) continue;

        const title = block.match(/<div class="text-\[1\.1rem\][^"]*">([\s\S]*?)<\/div>/)?.[1]?.trim();
        const subtitle = block.match(/<div class="uppercase leading-6 text-sm[^"]*">([\s\S]*?)<\/div>/)?.[1]?.trim();
        const when = block.match(/<div class="when">([\s\S]*?)<\/div>/)?.[1]?.trim();
        const img = block.match(/<img[^>]*src="([^"]+)"/)?.[1];
        const bol = block.match(/href="(https:\/\/teatromicaelense\.bol\.pt\/[^"]+)"/)?.[1];

        if (!title) continue;

        const timeMatch = when?.match(/(\d{1,2}[hH]\d{2})/);
        const timesText = timeMatch ? timeMatch[1].toLowerCase() : null;

        const rawCats = [];
        const tLower = (title + ' ' + (subtitle || '')).toLowerCase();
        if (/humor|comédia|bataguas|batáguas/i.test(tLower)) rawCats.push('Humor');
        if (/música|concerto|jazz|tributo|orquestra|recital/i.test(tLower)) rawCats.push('Música');
        if (/teatro|ópera|musical/i.test(tLower)) rawCats.push('Teatro');
        if (/dança|ballet|bailado/i.test(tLower)) rawCats.push('Dança');
        if (/cinema/i.test(tLower)) rawCats.push('Cinema');

        out.push(
          makeEvent(this.meta, {
            id: linkMatch[1].replace(/^\/agenda\/\d{4}-\d{2}-\d{2}\/|\/$/g, ''),
            url: link,
            title: decodeEntities(title),
            subtitle: subtitle ? decodeEntities(subtitle) : null,
            venue: this.meta.venue,
            address: this.meta.address,
            city: this.meta.city,
            lat: this.meta.lat,
            lon: this.meta.lon,
            startDate,
            endDate: startDate,
            timesText,
            datesText: when ? decodeEntities(when) : null,
            tickets: bol || null,
            rawCategories: rawCats,
            fallbackCategory: 'teatro',
            image: img ? absUrl(img, this.meta.url) : null,
          }),
        );
      }
    }

    return out;
  },
};

// ---------------------------------------------------------------------------
// Forum Braga — Braga
// ---------------------------------------------------------------------------
export const forumBraga = {
  meta: {
    id: 'forumbraga',
    name: 'Forum Braga',
    url: 'https://www.forumbraga.com/Agenda/Programacao',
    venue: 'Forum Braga',
    address: 'Av. Dr. Francisco Pires Gonçalves, 4715-558 Braga',
    city: 'Braga',
    lat: 41.5422,
    lon: -8.4239,
  },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const cards = [...html.matchAll(/<article class="u-block-hover[^\"]*">([\s\S]*?)<\/article>/gi)];
    const out = [];
    const seen = new Set();

    for (const c of cards) {
      const raw = c[1];
      const linkRel = raw.match(/href="(\/Detail\/Index\/[^"]+)"/)?.[1];
      const title = raw.match(/<H6>([\s\S]*?)<\/H6>/i)?.[1]?.trim() || raw.match(/alt="([^"]+)"/)?.[1]?.trim();
      const dateRaw = raw.match(/class="[^"]*dateinfo[^"]*">([\s\S]*?)<\/h4>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
      const img = raw.match(/<img[^>]*src="([^"]+)"/)?.[1];
      const ticket = raw.match(/href="(https:\/\/[^"]*ticketline[^"]*)"/)?.[1];
      const isFree = /ENTRADA LIVRE/i.test(raw);

      if (!title || !dateRaw) continue;

      const cleanDateStr = decodeEntities(dateRaw).replace(/\|\s*\d{1,2}:\d{2}/g, '');
      const dates = parsePtDateRange(cleanDateStr);
      if (!dates || dates.end < today) continue;

      const id = linkRel ? linkRel.split('/').pop() : title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (seen.has(id)) continue;
      seen.add(id);

      const timesText = dateRaw.match(/\d{1,2}:\d{2}/)?.[0] ?? null;
      const cleanTitle = decodeEntities(title);

      const rawCats = [];
      const tLower = cleanTitle.toLowerCase();
      if (/humor|comédia|batáguas|bataguas|hugo sousa|raphael ghanem|stand-up/i.test(tLower)) rawCats.push('Humor');
      if (/música|concerto|blues|tributo|orquestra|bandeira|abrunhosa|vercillo|adele|campos/i.test(tLower)) rawCats.push('Música');
      if (/teatro|musical|baião|amor é assim/i.test(tLower)) rawCats.push('Teatro');
      if (/dança|bailado|cisnes|quebra-nozes|dance/i.test(tLower)) rawCats.push('Dança');
      if (/feira|agro|salão|tattoo|games/i.test(tLower)) rawCats.push('Feiras & Congressos');

      out.push(
        makeEvent(this.meta, {
          id,
          url: linkRel ? absUrl(linkRel, this.meta.url) : this.meta.url,
          title: cleanTitle,
          venue: this.meta.venue,
          address: this.meta.address,
          city: this.meta.city,
          lat: this.meta.lat,
          lon: this.meta.lon,
          startDate: dates.start,
          endDate: dates.end,
          timesText,
          datesText: decodeEntities(dateRaw),
          tickets: ticket || null,
          price: isFree ? 'Gratuito' : null,
          rawCategories: rawCats,
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }

    return out;
  },
};

// ---------------------------------------------------------------------------
// Teatro Municipal da Lousã (TML) — Lousã
// ---------------------------------------------------------------------------
export const teatroLousa = {
  meta: {
    id: 'teatrolousa',
    name: 'Teatro Municipal da Lousã',
    url: 'https://tml.cm-lousa.pt/agenda/',
    venue: 'Teatro Municipal da Lousã',
    address: 'Rua Dr. João Santos, 3200-244 Lousã',
    city: 'Lousã',
    lat: 40.1118,
    lon: -8.2458,
  },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const events = [...html.matchAll(/onclick="window\.location\.href='(https:\/\/tml\.cm-lousa\.pt\/evento\/[^']+)'"([\s\S]*?)<\/div>\s*<\/div>/g)];
    const out = [];
    const seen = new Set();

    for (const ev of events) {
      const url = ev[1];
      const body = ev[2];

      const img = body.match(/src="([^"]+)"/)?.[1];
      const time = body.match(/<h3>\s*(\d{1,2}:\d{2})\s*<\/h3>/)?.[1];
      const cat = body.match(/<h3 class="categoryGrid">\s*([\s\S]*?)\s*<\/h3>/)?.[1]?.trim();
      const dateMatch = body.match(/<h2>(\d{2})-(\d{2})-(\d{2,4})[^<]*<\/h2>/);
      const title = body.match(/<h2 class="titleList">\s*([\s\S]*?)\s*<\/h2>/)?.[1]?.replace(/<[^>]+>/g, '').trim();

      if (!url || !title || !dateMatch) continue;

      const day = dateMatch[1];
      const month = dateMatch[2];
      let year = dateMatch[3];
      if (year.length === 2) year = `20${year}`;

      const dateStr = `${year}-${month}-${day}`;
      if (dateStr < today) continue;

      const id = url.replace(/\/$/, '').split('/').pop() || title;
      if (seen.has(id)) continue;
      seen.add(id);

      out.push({
        id,
        url,
        title: decodeEntities(title),
        dateStr,
        time,
        cat,
        img,
      });
    }

    // Detail fetch for tickets and full description
    return await mapLimit(out, 3, async (it) => {
      let ticketLink = null;
      let desc = null;
      try {
        const detailHtml = await fetchText(it.url, { cacheHours: 24 * 7 });
        ticketLink = detailHtml.match(/href="(https:\/\/[^"]*(?:ticketline|bol\.pt)[^"]*)"/)?.[1] ?? null;
        desc = stripHtml(detailHtml.match(/<div class="[^"]*single-content[^"]*">([\s\S]*?)<\/div>/i)?.[1] ?? '');
      } catch {}

      return makeEvent(this.meta, {
        id: it.id,
        url: it.url,
        title: it.title,
        description: desc || null,
        venue: this.meta.venue,
        address: this.meta.address,
        city: this.meta.city,
        lat: this.meta.lat,
        lon: this.meta.lon,
        startDate: it.dateStr,
        endDate: it.dateStr,
        timesText: it.time || null,
        tickets: ticketLink,
        rawCategories: it.cat ? [decodeEntities(it.cat)] : [],
        fallbackCategory: 'teatro',
        image: it.img ? absUrl(it.img, this.meta.url) : null,
      });
    });
  },
};

// ---------------------------------------------------------------------------
// Maus Hábitos — Porto
// ---------------------------------------------------------------------------
export const mausHabitos = {
  meta: {
    id: 'maushabitos',
    name: 'Maus Hábitos',
    url: 'https://www.maushabitos.com/espetaculos-e-clubbing/',
    venue: 'Maus Hábitos',
    address: 'Rua de Passos Manuel 178, 4º Piso, 4000-382 Porto',
    city: 'Porto',
    lat: 41.1472,
    lon: -8.6074,
  },
  async scrape() {
    const today = lisbonDate();
    let structJs;
    try {
      structJs = await fetchText('https://cdn.bndlyr.com/slstbe4votfbw7yg/_p/struct.js?v=1779714830796', { cacheHours: 24 });
    } catch {
      return [];
    }

    const idx = structJs.indexOf('"cEgF7lWBz7gVRoeb":{');
    if (idx === -1) return [];

    let depth = 0;
    let end = idx + '"cEgF7lWBz7gVRoeb":'.length;
    for (let i = end; i < structJs.length; i++) {
      if (structJs[i] === '{') depth++;
      else if (structJs[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    const repeaterCfg = JSON.parse(structJs.slice(idx + '"cEgF7lWBz7gVRoeb":'.length, end));
    repeaterCfg.page = 1;
    repeaterCfg.pagination = { enabled: true, perPage: '100' };

    const payload = {
      hash: '1779714830796',
      target: 'production',
      geoData: { lat: 0, lon: 0 },
      searchQuery: '',
      favorites: [],
      repeater: repeaterCfg,
      locale: 'pt',
      contentId: '0',
      projectId: 'slstbe4votfbw7yg',
    };

    let data;
    try {
      const res = await fetch('https://repeater.bondlayer.com/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return [];
      data = await res.json();
    } catch {
      return [];
    }

    const items = data.items || [];
    const out = [];

    for (const it of items) {
      const titleRaw = it['title-dispaly_crJy']?.all || it._title?.all;
      const cleanTitle = stripHtml(titleRaw || '').replace(/^\d{2}\.\d{2}\.\d{2}\s*/, '').trim();
      const startDateTime = it['start-date-and-time_cHJt'];
      const endDateTime = it['end-date-and-time_cSkH'] || startDateTime;

      if (!cleanTitle || !startDateTime) continue;

      const startDate = startDateTime.slice(0, 10);
      const endDate = endDateTime.slice(0, 10);
      if (endDate < today) continue;

      const startTime = startDateTime.slice(11, 16);
      const subtitle = it.text_sub_header?.all?.replace(/<[^>]+>/g, '').trim();
      const desc = stripHtml(it.description_cHyu?.all ?? '');
      const img = it['cover-image_cr1c']?.all || it.image_img_hor_crop?.all || null;
      const ticketLink = it.link_tickets_link?.all || null;
      const price = it.text_porto_preco?.all?.replace(/<[^>]+>/g, '').trim() || null;
      const slug = it._slug?.all || it.id;

      const rawCats = [];
      const tLower = cleanTitle.toLowerCase();
      if (/jazz|concerto|banda|rock|dj|clubbing|música/i.test(tLower)) rawCats.push('Música');
      if (/teatro|performance/i.test(tLower)) rawCats.push('Teatro');
      if (/exposição|expo|arte/i.test(tLower)) rawCats.push('Arte');
      if (/mercado|market/i.test(tLower)) rawCats.push('Mercados');

      out.push(
        makeEvent(this.meta, {
          id: slug,
          url: `https://www.maushabitos.com/evento/${slug}/`,
          title: cleanTitle,
          subtitle: subtitle || null,
          description: desc || null,
          venue: this.meta.venue,
          address: this.meta.address,
          city: this.meta.city,
          lat: this.meta.lat,
          lon: this.meta.lon,
          startDate,
          endDate,
          timesText: startTime !== '00:00' ? startTime.replace(':', 'h') : null,
          tickets: ticketLink || null,
          price: price || null,
          rawCategories: rawCats,
          fallbackCategory: 'musica',
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }

    return out;
  },
};

// ---------------------------------------------------------------------------
// Helper Ticketline por Sala
// ---------------------------------------------------------------------------
async function scrapeTicketlineSalas(meta, salaIds) {
  const today = lisbonDate();
  const out = new Map();
  for (const sid of (Array.isArray(salaIds) ? salaIds : [salaIds])) {
    const url = `https://www.ticketline.pt/salas/sala/${sid}`;
    let html;
    try {
      html = await fetchText(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cacheHours: 12 });
    } catch {
      continue;
    }
    const items = html.split(/<li\s+class="[^"]*"\s+itemscope\s+itemtype="http:\/\/schema\.org\/Event"/i).slice(1);
    for (const it of items) {
      const linkRel = it.match(/href="(\/evento\/[^"]+)"/)?.[1];
      const startDate = it.match(/itemprop="startDate"\s+content="(\d{4}-\d{2}-\d{2})"/)?.[1];
      const title = it.match(/itemprop="name">([^<]+)<\/p>/)?.[1]?.trim();
      const specificVenue = it.match(/itemprop="location">([^<]+)<\/p>/)?.[1]?.trim() || meta.venue;
      const img = it.match(/data-src-original="([^"?]+)/)?.[1];
      if (!title || !startDate || startDate < today || !linkRel) continue;

      const id = linkRel.replace(/^\/evento\/|\/$/g, '');
      if (out.has(id)) continue;

      const cleanTitle = decodeEntities(title);
      const rawCats = [];
      const tLower = cleanTitle.toLowerCase();
      if (/humor|comédia|stand-up|dário guerreiro|diogo faro/i.test(tLower)) rawCats.push('Humor');
      if (/música|concerto|banda|rock|indie|jazz|tour/i.test(tLower)) rawCats.push('Música');
      if (/teatro|peça|poetas mortos|drama/i.test(tLower)) rawCats.push('Teatro');
      if (/dança|bailado/i.test(tLower)) rawCats.push('Dança');

      out.set(
        id,
        makeEvent(meta, {
          id,
          url: absUrl(linkRel, 'https://www.ticketline.pt'),
          title: cleanTitle,
          venue: specificVenue || meta.venue,
          address: meta.address,
          city: meta.city,
          lat: meta.lat,
          lon: meta.lon,
          startDate,
          endDate: startDate,
          tickets: absUrl(linkRel, 'https://www.ticketline.pt'),
          rawCategories: rawCats,
          fallbackCategory: 'musica',
          image: img ? absUrl(img, 'https://www.ticketline.pt') : null,
        }),
      );
    }
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// Casa da Música — Porto
// ---------------------------------------------------------------------------
export const casaDaMusica = {
  meta: {
    id: 'casadamusica',
    name: 'Casa da Música',
    url: 'https://casadamusica.com/agenda/',
    venue: 'Casa da Música',
    address: 'Avenida da Boavista 604-610, 4149-071 Porto',
    city: 'Porto',
    lat: 41.1589,
    lon: -8.6307,
  },
  async scrape() {
    const today = lisbonDate();
    const out = [];
    const seen = new Set();

    for (let page = 1; page <= 6; page++) {
      const pageUrl = page === 1 ? this.meta.url : `https://casadamusica.com/agenda/page/${page}/`;
      let html;
      try {
        html = await fetchText(pageUrl, { cacheHours: 12 });
      } catch {
        break;
      }

      const blocks = html.split(/<div\s+itemscope\s+itemtype="https:\/\/schema\.org\/Event"/i).slice(1);
      if (!blocks.length) break;

      for (const b of blocks) {
        const timeMatch = b.match(/datetime="(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}):\d{2}"/);
        const dateStr = timeMatch?.[1];
        const hour = timeMatch?.[2];
        const room = b.match(/text-right[^"]*uppercase[^"]*">\s*<div>([^<]+)<\/div>/i)?.[1]?.trim();
        const title = b.match(/itemprop="name">([\s\S]*?)<\/a>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const link = b.match(/href="(https:\/\/casadamusica\.com\/event\/[^"]+)"/i)?.[1];
        const img = b.match(/<img[^>]*src="([^"]+)"/i)?.[1];
        const desc = b.match(/itemprop="description">([\s\S]*?)<\/div>/i)?.[1]?.trim();
        const price = b.match(/class="text-base whitespace-nowrap">([\s\S]*?)<\/span>/i)?.[1]?.replace(/&euro;/g, '€').replace(/&dash;/g, '-').replace(/\s+/g, ' ').trim();

        if (!title || !dateStr || dateStr < today || !link) continue;

        const id = link.replace(/\/$/, '').split('/').pop() || title;
        if (seen.has(id)) continue;
        seen.add(id);

        const venueName = room ? `Casa da Música - ${room}` : this.meta.venue;
        const cleanTitle = decodeEntities(title);

        out.push(
          makeEvent(this.meta, {
            id,
            url: link,
            title: cleanTitle,
            description: desc ? stripHtml(decodeEntities(desc)) : null,
            venue: venueName,
            address: this.meta.address,
            city: this.meta.city,
            lat: this.meta.lat,
            lon: this.meta.lon,
            startDate: dateStr,
            endDate: dateStr,
            timesText: hour ? hour.replace(':', 'h') : null,
            price: price || null,
            tickets: link,
            rawCategories: ['Música'],
            fallbackCategory: 'musica',
            image: img ? absUrl(img, this.meta.url) : null,
          }),
        );
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// LAV — Lisboa Ao Vivo (Ticketline)
// ---------------------------------------------------------------------------
export const lav = {
  meta: {
    id: 'lav',
    name: 'LAV - Lisboa Ao Vivo',
    url: 'https://www.ticketline.pt/salas/sala/1585',
    venue: 'LAV - Lisboa Ao Vivo',
    address: 'Avenida Marechal Gomes da Costa 29, 1800-255 Lisboa',
    city: 'Lisboa',
    lat: 38.7562,
    lon: -9.1026,
  },
  async scrape() {
    return scrapeTicketlineSalas(this.meta, [1585, 3368, 3370]);
  },
};

// ---------------------------------------------------------------------------
// Teatro da Trindade INATEL — Lisboa (Ticketline)
// ---------------------------------------------------------------------------
export const teatroTrindade = {
  meta: {
    id: 'teatrotrindade',
    name: 'Teatro da Trindade INATEL',
    url: 'https://www.ticketline.pt/salas/sala/9',
    venue: 'Teatro da Trindade INATEL',
    address: 'Rua Nova da Trindade 9, 1200-301 Lisboa',
    city: 'Lisboa',
    lat: 38.7126,
    lon: -9.1431,
  },
  async scrape() {
    return scrapeTicketlineSalas(this.meta, [9, 14]);
  },
};

// ---------------------------------------------------------------------------
// Teatro Maria Matos — Lisboa (Ticketline)
// ---------------------------------------------------------------------------
export const mariaMatos = {
  meta: {
    id: 'mariamatos',
    name: 'Teatro Maria Matos',
    url: 'https://www.ticketline.pt/salas/sala/2791',
    venue: 'Teatro Maria Matos',
    address: 'Av. Frei Miguel Contreiras 52, 1700-213 Lisboa',
    city: 'Lisboa',
    lat: 38.7479,
    lon: -9.1415,
  },
  async scrape() {
    return scrapeTicketlineSalas(this.meta, [2791]);
  },
};

// ---------------------------------------------------------------------------
// Hard Club — Porto
// ---------------------------------------------------------------------------
export const hardClub = {
  meta: {
    id: 'hardclub',
    name: 'Hard Club',
    url: 'https://www.hardclubporto.com/PT/agenda/',
    venue: 'Hard Club',
    address: 'Mercado Ferreira Borges, 4050-252 Porto',
    city: 'Porto',
    lat: 41.1412,
    lon: -8.6146,
  },
  async scrape() {
    const today = lisbonDate();
    const out = [];
    const seen = new Set();

    let html;
    try {
      html = await fetchText('https://www.hardclubporto.com/include/ajax_functions.php?action=load-agenda&start=0&passo=50&langid=1', {
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0' },
        cacheHours: 12,
      });
    } catch {
      return [];
    }

    const items = html.split(/<li\s+class="items[^"]*">/i).slice(1);
    for (const it of items) {
      const link = it.match(/href="([^"]+)"/)?.[1];
      const img = it.match(/background-image:url\(([^)]+)\)/)?.[1];
      const title = it.match(/<h3>([^<]+)/)?.[1]?.trim();
      const day = it.match(/class="data">\s*(\d{1,2})/)?.[1];
      const hora = it.match(/class="local_hora">([^<]+)<\/p>/)?.[1]?.trim();

      if (!link || !title || !day) continue;

      const yearMatch = link.match(/-(\d{4})\/$/);
      const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

      const id = link.replace(/^\/PT\/evento\/|\/$/g, '');
      if (seen.has(id)) continue;
      seen.add(id);

      const curM = String(new Date().getMonth() + 1).padStart(2, '0');
      let dateStr = `${year}-${curM}-${day.padStart(2, '0')}`;
      if (dateStr < today) {
        const nextM = String((new Date().getMonth() + 2) % 12 || 12).padStart(2, '0');
        dateStr = `${year}-${nextM}-${day.padStart(2, '0')}`;
      }

      out.push(
        makeEvent(this.meta, {
          id,
          url: absUrl(link, 'https://www.hardclubporto.com'),
          title: decodeEntities(title),
          venue: this.meta.venue,
          address: this.meta.address,
          city: this.meta.city,
          lat: this.meta.lat,
          lon: this.meta.lon,
          startDate: dateStr,
          endDate: dateStr,
          timesText: hora || null,
          rawCategories: ['Música'],
          fallbackCategory: 'musica',
          image: img ? absUrl(img, 'https://www.hardclubporto.com') : null,
        }),
      );
    }

    return out;
  },
};
