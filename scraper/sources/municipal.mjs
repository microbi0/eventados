// Agendas municipais em HTML.
import { fetchText, absUrl, lisbonDate, mapLimit, stripHtml, decodeEntities } from '../util.mjs';
import { makeEvent } from '../event.mjs';
import { parsePtDateRange } from '../ptdates.mjs';

const text = (html) => stripHtml(html ?? '').replace(/\s*\n\s*/g, ' · ');
const pick = (html, re) => html.match(re)?.[1] ?? null;

// ---------------------------------------------------------------------------
// Plataforma comum a várias câmaras (Matosinhos, Maia, Famalicão, Odivelas, Viana do Castelo, Aveiro):
// listagem paginada (?events_list_<n>_page=N) + página de detalhe com campos "adicionar ao calendário".
// ---------------------------------------------------------------------------
async function listEventLinks(listUrl, maxPages = 12) {
  const links = new Set();
  const first = await fetchText(listUrl);
  const param = first.match(/[?&](events_list_\d+_page)=\d+/)?.[1];
  const collect = (html) => {
    let added = 0;
    for (const m of html.matchAll(/href="([^"]*\/evento(?:-\d+)?\/[^"#?]+)"/g)) {
      const url = absUrl(m[1], listUrl);
      if (url && !links.has(url)) {
        links.add(url);
        added++;
      }
    }
    return added;
  };
  collect(first);
  for (let page = 2; param && page <= maxPages; page++) {
    const sep = listUrl.includes('?') ? '&' : '?';
    const html = await fetchText(`${listUrl}${sep}${param}=${page}`);
    if (!collect(html)) break;
  }
  return [...links];
}

function parseDetail(meta, url, html) {
  const start = pick(html, /atc_date_start">([^<]+)/);
  if (!start) return null;
  const end = pick(html, /atc_date_end">([^<]+)/) ?? start;
  const field = (cls) => pick(html, new RegExp(`class="${cls} widget_field[^"]*">([\\s\\S]*?)</div></div>`));
  const geo = html.match(/google\.com\/maps\/(?:place|search)\/[^"]*?(-?\d{1,2}\.\d+),\s*(-?\d{1,2}\.\d+)/);
  const categories = [...(field('categories') ?? '').matchAll(/<span>([^<]+)<\/span>/g)].map((m) => decodeEntities(m[1]).trim());
  const img = pick(html, /class="image_preview"[^>]*>\s*<img[^>]*src="([^"]+)"/) ?? pick(html, /<meta property="og:image" content="([^"]+)"/);
  const startTime = start.slice(11, 16);
  return makeEvent(meta, {
    id: url.split('/').filter(Boolean).pop(),
    url,
    title: pick(html, /atc_title">([^<]+)/) ?? pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/),
    description: field('summary') ?? field('body'),
    // Só as categorias temáticas ("Eventos | Teatro"); "Agenda | Geral" e afins não ajudam.
    rawCategories: categories.filter((c) => !/agenda|destaque|arquivo|geral/i.test(c)),
    // Algumas câmaras deixam "Evento" no campo do local: usa-se o nome da sala (meta.venue), se houver.
    venue: ((v) => (v && !/^evento$/i.test(v.trim()) ? v : meta.venue ?? null))(pick(html, /atc_location">([^<]+)/) ?? text(field('location')?.replace(/<div class="widget_label">[\s\S]*?<\/div>/, ''))),
    lat: geo?.[1],
    lon: geo?.[2],
    startDate: start.slice(0, 10),
    endDate: end.slice(0, 10),
    timesText: text(field('schedule')?.replace(/<div class="widget_label">[\s\S]*?<\/div>/, '')) || (startTime !== '00:00' ? startTime.replace(':', 'h') : null),
    price: text(field('price')?.replace(/<div class="widget_label">[\s\S]*?<\/div>/, '')) || null,
    image: img ? absUrl(img, url) : null,
  });
}

export function municipalPlatform(meta) {
  return {
    meta,
    async scrape() {
      const today = lisbonDate();
      // Algumas câmaras dividem a agenda por tipo (meta.lists): juntam-se todas as listas.
      const links = [...new Set((await Promise.all([meta.url, ...(meta.lists ?? [])].map((u) => listEventLinks(u, meta.maxPages ?? 12).catch(() => [])))).flat())];
      // Páginas de detalhe mudam pouco: reutilizadas durante 7 dias.
      const events = await mapLimit(links, 3, async (url) => {
        try {
          return parseDetail(meta, url, await fetchText(url, { cacheHours: 24 * 7 }));
        } catch {
          return null;
        }
      });
      return events.filter((e) => e && e.endDate >= today);
    },
  };
}

export const matosinhos = municipalPlatform({ id: 'matosinhos', name: 'CM Matosinhos', url: 'https://www.cm-matosinhos.pt/servicos/comunicacao-e-imagem/eventos', city: 'Matosinhos' });
export const maia = municipalPlatform({ id: 'maia', name: 'CM Maia', url: 'https://www.cm-maia.pt/institucional/atualidade-e-participacao/agenda/todos-os-eventos', city: 'Maia' });
export const famalicao = municipalPlatform({ id: 'famalicao', name: 'CM Famalicão', url: 'https://www.famalicao.pt/comunicacao/agenda', city: 'Vila Nova de Famalicão' });
export const odivelas = municipalPlatform({ id: 'odivelas', name: 'CM Odivelas', url: 'https://www.cm-odivelas.pt/descubra-odivelas/agenda-e-eventos/agenda-municipal', city: 'Odivelas' });
export const viana = municipalPlatform({ id: 'viana', name: 'CM Viana do Castelo', url: 'https://www.cm-viana-castelo.pt/areas-de-atividade/comunicacao/agenda-de-eventos', city: 'Viana do Castelo' });
export const aveiro = municipalPlatform({ id: 'aveiro', name: 'CM Aveiro', url: 'https://www.cm-aveiro.pt/visitantes/agenda-aveiro', city: 'Aveiro' });

// ---------------------------------------------------------------------------
// Vila Nova de Gaia — listagem única em HTML
// ---------------------------------------------------------------------------
export const gaia = {
  meta: { id: 'gaia', name: 'CM Gaia', url: 'https://www.cm-gaia.pt/pt/eventos/', city: 'Vila Nova de Gaia' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const list = html.slice(html.indexOf('blocoEventosList'));
    const out = [];
    for (const li of list.split(/<li>/).slice(1)) {
      const href = pick(li, /class="titulo"><a href="([^"]+)"/);
      const dates = parsePtDateRange(decodeEntities(pick(li, /class="data">([^<]+)/) ?? ''));
      if (!href || !dates) continue;
      const url = absUrl(href, this.meta.url);
      out.push(
        makeEvent(this.meta, {
          id: href.split('/').filter(Boolean).pop(),
          url,
          title: pick(li, /class="titulo"><a[^>]*>([\s\S]*?)<\/a>/),
          subtitle: pick(li, /class="descricao">([\s\S]*?)<\/span>/),
          rawCategories: [decodeEntities(pick(li, /#\s*([^<]+)<\/a>/) ?? '').trim()].filter(Boolean),
          startDate: dates.start,
          endDate: dates.end,
          datesText: decodeEntities(pick(li, /class="data">([^<]+)/)),
          image: absUrl(pick(li, /<img[^>]*src="([^"]+)"/) ?? '', url),
        }),
      );
    }
    return out.filter((e) => e.endDate >= today);
  },
};

export const quartelDasArtes = municipalPlatform({
  id: 'quarteldasartes',
  name: 'Quartel das Artes',
  url: 'https://www.quarteldasartes.pt/programacao/todos-os-eventos',
  venue: 'Quartel das Artes',
  city: 'Oliveira do Bairro',
  maxPages: 1,
});
export const palmela = municipalPlatform({ id: 'palmela', name: 'CM Palmela', url: 'https://www.cm-palmela.pt/viver/cultura/agenda-de-eventos', city: 'Palmela' });

// ---------------------------------------------------------------------------
// Tábua — O Encanto das Beiras (Portal Turístico / Agenda Municipal)
// ---------------------------------------------------------------------------
export const tabua = {
  meta: {
    id: 'tabua',
    name: 'Portal Turístico de Tábua',
    url: 'https://tabuaoencantodasbeiras.pt/em-agenda/',
    city: 'Tábua',
  },
  async scrape() {
    const today = lisbonDate();
    const raw = await fetchText('https://tabuaoencantodasbeiras.pt/wp-json/smartgov-saida/v1/eventos').catch(() => '{"data":{"items":[]}}');
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      return [];
    }
    const items = json?.data?.items ?? [];
    const out = [];

    for (const it of items) {
      if (it.status && it.status !== 'publish') continue;

      let start = null;
      let end = null;
      if (it.date?.mode === 'range' && it.date.range) {
        start = it.date.range.start ? it.date.range.start.slice(0, 10) : null;
        end = it.date.range.end ? it.date.range.end.slice(0, 10) : start;
      } else if (it.date?.date) {
        start = it.date.date.slice(0, 10);
        end = start;
      }

      if (!start) continue;
      if (!end) end = start;
      if (end < today) continue;

      const rawContent = (it.content || []).map((c) => c.setup?.text || '').join('\n');
      const timeMatch = rawContent.match(/Hora:\s*(\d{1,2}[:hH]\d{2})/i) || rawContent.match(/(\d{1,2}[:hH]\d{2})/);
      const timesText = timeMatch ? timeMatch[1].replace(':', 'h').toLowerCase() : null;

      const desc = stripHtml(rawContent).replace(/\s+/g, ' ').trim();
      const venue = it.address ? stripHtml(it.address).trim() : 'Tábua';
      const isCCT = /Centro Cultural/i.test(venue);

      const rawCats = Array.isArray(it.category) ? it.category.map((c) => (typeof c === 'string' ? c : c?.name)).filter(Boolean) : [];
      const titleLower = it.title.toLowerCase();
      if (/cinema/i.test(titleLower)) rawCats.push('Cinema');
      if (/exposição|pintura|arte/i.test(titleLower)) rawCats.push('Arte');
      if (/concerto|música|coral|bárbara tinoco|miguel araújo|vizinhos/i.test(titleLower)) rawCats.push('Música');
      if (/dário guerreiro|joão baião|humor|stand-up|comédia/i.test(titleLower)) rawCats.push('Humor');
      if (/teatro|peixes de antónio|eu preciso disto|psicólogo por um dia/i.test(titleLower)) rawCats.push('Teatro');
      if (/caminhada|ténis|desporto|corrida|futebol|fit|ginástica/i.test(titleLower)) rawCats.push('Desporto');
      if (/magusto|jantar|almoço|feira|festa|igualdades/i.test(titleLower)) rawCats.push('Feiras');
      if (/arte de conversar|conversas|livro|literatura/i.test(titleLower)) rawCats.push('Conversas');

      out.push(
        makeEvent(this.meta, {
          id: String(it.id),
          url: 'https://tabuaoencantodasbeiras.pt/em-agenda/',
          title: decodeEntities(it.title),
          description: desc || null,
          venue: venue || 'Tábua',
          address: isCCT ? 'Avenida Dr. Florindo Madeira, 3420-307 Tábua' : venue,
          lat: isCCT ? 40.3609 : 40.3323,
          lon: isCCT ? -8.0287 : -8.0165,
          startDate: start,
          endDate: end,
          timesText,
          rawCategories: rawCats,
          image: it.image?.url ?? null,
        }),
      );
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Visit Seia — Agenda de Eventos do Concelho de Seia
// ---------------------------------------------------------------------------
export const visitSeia = {
  meta: {
    id: 'visitseia',
    name: 'Visit Seia',
    url: 'https://visitseia.pt/eventos/',
    city: 'Seia',
  },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const boxes = html.split('<div class="each-box').slice(1);
    const out = [];

    for (const b of boxes) {
      const link = b.match(/href="([^"]+)"/)?.[1];
      const title = b.match(/class="title-box2">([\s\S]*?)<\/div>/)?.[1]?.trim();
      const dateText = b.match(/class="data-evento">([\s\S]*?)<\/div>/)?.[1]?.trim();
      const loc = b.match(/class="local-evento">([\s\S]*?)<\/div>/)?.[1]?.trim();
      const img = b.match(/<img[^>]*src="([^"]+)"/)?.[1];

      if (!link || !title || !dateText) continue;

      const dates = parsePtDateRange(decodeEntities(dateText));
      if (!dates || dates.end < today) continue;

      const cleanTitle = decodeEntities(title);
      const rawCats = [];
      const titleLower = cleanTitle.toLowerCase();
      if (/música|jazz|blues|concerto|piano|sons/i.test(titleLower)) rawCats.push('Música');
      if (/gastronomia|sabores|queijo|mostra/i.test(titleLower)) rawCats.push('Feiras & Mercados');
      if (/cinema|cineeco/i.test(titleLower)) rawCats.push('Cinema');
      if (/teatro|comédia/i.test(titleLower)) rawCats.push('Teatro');
      if (/trail|downhill|btt|granfondo|nature|caminhada|passeio|percurso/i.test(titleLower)) rawCats.push('Desporto & Aventura');
      if (/natal|festa|marchas|passagem de ano/i.test(titleLower)) rawCats.push('Festas Populares');

      out.push(
        makeEvent(this.meta, {
          id: link.replace(/\/$/, '').split('/').pop() || cleanTitle,
          url: link,
          title: cleanTitle,
          venue: loc ? decodeEntities(loc) : 'Seia',
          address: loc ? `${decodeEntities(loc)}, Seia` : 'Seia',
          lat: 40.4206,
          lon: -7.7032,
          startDate: dates.start,
          endDate: dates.end,
          datesText: decodeEntities(dateText),
          rawCategories: rawCats,
          image: img ? absUrl(img, this.meta.url) : null,
        }),
      );
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Leiriagenda — Município de Leiria
// ---------------------------------------------------------------------------
const PT_MONTHS_MAP = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
};

export const leiriagenda = {
  meta: {
    id: 'leiriagenda',
    name: 'Leiriagenda',
    url: 'https://leiriagenda.cm-leiria.pt/pt/agenda/proximos-eventos',
    city: 'Leiria',
  },
  async scrape() {
    const today = lisbonDate();
    const out = [];
    const seenUrls = new Set();

    for (let page = 1; page <= 4; page++) {
      let html;
      try {
        html = await fetchText(`https://leiriagenda.cm-leiria.pt/pt/agenda/proximos-eventos?page=${page}`);
      } catch {
        break;
      }

      const cards = html.split(/<a\s+href="(https:\/\/leiriagenda\.cm-leiria\.pt\/pt\/agenda\/[^"]+)">\s*<div class="component">/).slice(1);
      if (!cards.length) break;

      for (let i = 0; i < cards.length; i += 2) {
        const url = cards[i];
        const body = cards[i + 1];
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const title = body.match(/class="proximo_title">([^<]+)<\/span>/)?.[1]?.trim();
        const dia = body.match(/class="dia">(\d+)<\/span>/)?.[1];
        const mesRaw = body.match(/class="mes">([^<]+)<\/span>/)?.[1]?.toLowerCase().replace('.', '').trim();
        const ano = body.match(/class="ano">(\d{4})<\/span>/)?.[1];
        const hora = body.match(/class="ano">(\d{1,2}h\d{2})<\/span>/)?.[1];
        const local = body.match(/class="local">([\s\S]*?)<\/span>/)?.[1]?.trim();
        const localidade = body.match(/class="localidade">([\s\S]*?)<\/span>/)?.[1]?.trim();
        const img = body.match(/background-image:\s*url\(([^)]+)\)/)?.[1];
        const rawCats = [...body.matchAll(/class="cat-name">([^<]+)<\/span>/g)].map((m) => m[1].trim());

        if (!title || !dia || !ano) continue;

        const mNum = PT_MONTHS_MAP[mesRaw] || '01';
        const dateStr = `${ano}-${mNum}-${dia.padStart(2, '0')}`;
        if (dateStr < today) continue;

        out.push(
          makeEvent(this.meta, {
            id: url.replace(/\/$/, '').split('/').pop() || title,
            url,
            title: decodeEntities(title),
            venue: local ? decodeEntities(local) : (localidade ? decodeEntities(localidade) : 'Leiria'),
            address: local ? `${decodeEntities(local)}, ${localidade || 'Leiria'}` : 'Leiria',
            city: localidade ? decodeEntities(localidade) : 'Leiria',
            lat: 39.7438,
            lon: -8.8078,
            startDate: dateStr,
            endDate: dateStr,
            timesText: hora || null,
            rawCategories: rawCats,
            image: img ? absUrl(img, this.meta.url) : null,
          }),
        );
      }
    }
    return out;
  },
};
