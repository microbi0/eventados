// Sites em Bundlr (Agenda Porto, Agenda de Vila do Conde): cada página referencia ficheiros
// content.*.js com JSON (window.BndLyrContent). Juntamos a homepage, a pesquisa e as secções.
import { fetchText, absUrl, lisbonDate, lisbonTime, stripHtml } from '../util.mjs';
import { makeEvent } from '../event.mjs';

const raw = (field) => (field && typeof field === 'object' ? field.all ?? field.pt ?? Object.values(field)[0] : field) ?? '';
// Texto limpo: vários campos de texto do Bundlr trazem HTML.
const t = (field) => stripHtml(raw(field)).replace(/\s*\n\s*/g, ' · ');

// Os multiRef aparecem ora como array de ids, ora como objeto { id: ordem }.
const refIds = (ref) => (Array.isArray(ref) ? ref : ref && typeof ref === 'object' ? Object.keys(ref) : []);

const contentUrls = (html) => [...html.matchAll(/https:\/\/cdn\.bndlyr\.com\/[^"']*\/_p\/content\.[^"']+\.js[^"']*/g)].map((m) => m[0]);

function parseBundlr(js) {
  return JSON.parse(js.slice(js.indexOf('{'), js.lastIndexOf('}') + 1));
}

async function loadContent(site) {
  const home = await fetchText(site);
  const sections = [...new Set([...home.matchAll(/href="(seccao\/[^"]+)"/g)].map((m) => absUrl(m[1], site)))];
  const pages = [site, `${site}pesquisa/`, ...sections];
  const events = new Map();
  const related = {};
  const seen = new Set();
  for (const page of pages) {
    const html = page === site ? home : await fetchText(page).catch(() => '');
    for (const url of contentUrls(html)) {
      if (seen.has(url)) continue;
      seen.add(url);
      const content = parseBundlr(await fetchText(url));
      for (const rep of Object.values(content)) {
        if (!rep || typeof rep !== 'object') continue;
        Object.assign(related, rep.related ?? {});
        for (const item of rep.items ?? []) {
          if ('datetime_start_date' in item) events.set(item.id, item);
          else related[item.id] ??= item;
        }
      }
    }
  }
  return { events: [...events.values()], related };
}

function normalize(meta, ev, related) {
  const local = related[ev.ref_local];
  const refs = [ev.ref_seccao, ...refIds(ev.multiRef_tags_1o_nivel), ev.ref_tags_1o_nivel].filter(Boolean);
  const rawCategories = [...new Set(refs.map((id) => t(related[id]?._slug)).filter(Boolean))];
  const start = ev.datetime_start_date;
  const end = ev.datetime_end_date || start;
  const slug = t(ev._slug);
  const tickets = t(ev.text_link_bilhetes);
  return makeEvent(meta, {
    id: ev.id,
    url: slug ? `${meta.url}evento/${slug}/` : meta.url,
    title: t(ev.text_display_title) || t(ev._title),
    subtitle: t(ev.text_subtitle),
    description: raw(ev.text_sinopse),
    rawCategories,
    venue: local ? t(local._title) : t(ev.text_local) || t(ev.text_organizacao_em_texto),
    address: t(ev.text_morada) || (local ? t(local.text_morada) : ''),
    lat: local?.geo_location?.lat,
    lon: local?.geo_location?.lon,
    startDate: lisbonDate(start),
    endDate: lisbonDate(end),
    datesText: t(ev.text_datas_em_texto),
    timesText: t(ev.text_horas) || (!ev.boolean_esconder_hora ? lisbonTime(start) : null),
    price: t(ev.text_price),
    isFree: rawCategories.includes('gratuito') || undefined,
    image: raw(ev.image_image),
    tickets: /^https?:/.test(tickets) ? tickets : null,
  });
}

export function bundlrSource(meta) {
  return {
    meta,
    async scrape() {
      const today = lisbonDate();
      const { events, related } = await loadContent(meta.url);
      return events
        .filter((ev) => !ev.boolean_draft && ev.datetime_start_date)
        .map((ev) => normalize(meta, ev, related))
        .filter((e) => e.endDate >= today);
    },
  };
}

export const agendaPorto = bundlrSource({ id: 'agendaporto', name: 'Agenda Porto', url: 'https://www.agenda-porto.pt/', city: 'Porto' });
export const viladoconde = bundlrSource({ id: 'viladoconde', name: 'Agenda Vila do Conde', url: 'https://agenda.cm-viladoconde.pt/', city: 'Vila do Conde' });
