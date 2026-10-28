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
