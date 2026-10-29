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
      const links = [...new Set((await Promise.all([meta.url, ...(meta.lists ?? [])].map((u) => listEventLinks(u).catch(() => [])))).flat())];
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
  url: 'https://www.quarteldasartes.pt/programacao/teatro',
  venue: 'Quartel das Artes',
  lists: ['cinema', 'danca', 'musica', 'outros-eventos', 'stand-up-comedy'].map((t) => `https://www.quarteldasartes.pt/programacao/${t}`),
  city: 'Oliveira do Bairro',
});
export const palmela = municipalPlatform({ id: 'palmela', name: 'CM Palmela', url: 'https://www.cm-palmela.pt/viver/cultura/agenda-de-eventos', city: 'Palmela' });
