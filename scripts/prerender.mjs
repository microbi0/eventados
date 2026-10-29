// Gera páginas HTML estáticas e indexáveis pelo Google a partir de dist/data/events.json:
//   /eventos/                      índice de concelhos
//   /eventos/<concelho>/           "Eventos no Porto"
//   /eventos/<concelho>/<tipo>/    "Teatro no Porto"
//   /evento/<nome>-<id>/           uma página por evento, com dados estruturados schema.org/Event
//   /sitemap.xml e /robots.txt
// Cada página traz o conteúdo em HTML (o que o Google lê) e abre a app normal já no sítio/tipo/evento certo.
// Corre depois do `vite build`: node scripts/prerender.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const SITE = 'https://eventados.com';
const DIST = new URL('../dist/', import.meta.url);
const DAYS_AHEAD = 60;

const template = await readFile(new URL('index.html', DIST), 'utf8');
const data = JSON.parse(await readFile(new URL('data/events.json', DIST), 'utf8'));

// ---------------------------------------------------------------- utilitários
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s ?? '');

// Preposições dos concelhos ("no Porto", "na Maia"), lidas de src/places.ts para não as duplicar.
const placesSrc = await readFile(new URL('../src/places.ts', import.meta.url), 'utf8');
const setFrom = (name) => new Set([...(placesSrc.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
const MASC = setFrom('MASCULINE');
const FEM = setFrom('FEMININE');
const inPlace = (c) => (MASC.has(c) ? `no ${c}` : FEM.has(c) ? `na ${c}` : `em ${c}`);

// Como as pessoas pesquisam cada tipo ("concertos no Porto", "stand-up em Lisboa").
const CAT_SEO = {
  musica: { slug: 'concertos', title: 'Concertos e música' },
  teatro: { slug: 'teatro', title: 'Teatro' },
  danca: { slug: 'danca', title: 'Dança' },
  humor: { slug: 'stand-up-humor', title: 'Stand-up e humor' },
  cinema: { slug: 'cinema', title: 'Cinema' },
  arte: { slug: 'exposicoes', title: 'Exposições e arte' },
  conversas: { slug: 'conversas-livros', title: 'Conversas e livros' },
  ciencia: { slug: 'ciencia', title: 'Ciência' },
  familias: { slug: 'criancas-familias', title: 'Atividades para crianças e famílias' },
  'ar-livre': { slug: 'ar-livre', title: 'Atividades ao ar livre' },
  visitas: { slug: 'visitas-guiadas', title: 'Visitas guiadas' },
  desporto: { slug: 'desporto', title: 'Desporto' },
  feiras: { slug: 'feiras-festas', title: 'Feiras e festas' },
  workshops: { slug: 'workshops', title: 'Workshops e formação' },
};

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const parse = (d) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
};
const longDate = (d) => {
  const t = parse(d);
  return `${WEEKDAYS[t.getUTCDay()]}, ${t.getUTCDate()} de ${MONTHS[t.getUTCMonth()]} de ${t.getUTCFullYear()}`;
};
const span = (e) => (e.startDate === e.endDate ? longDate(e.startDate) : `${longDate(e.startDate)} a ${longDate(e.endDate)}`);

// Hora local de Lisboa com o fuso certo (verão +01:00 do último domingo de março ao último de outubro).
function lisbonOffset(date) {
  const y = Number(date.slice(0, 4));
  const lastSunday = (m) => {
    const d = new Date(Date.UTC(y, m + 1, 0));
    return d.getUTCDate() - d.getUTCDay();
  };
  const md = date.slice(5);
  const start = `03-${String(lastSunday(2)).padStart(2, '0')}`;
  const end = `10-${String(lastSunday(9)).padStart(2, '0')}`;
  return md >= start && md < end ? '+01:00' : '+00:00';
}
function isoStart(e) {
  const m = e.timesText?.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  if (!m) return e.startDate;
  const hh = String(Math.min(23, Number(m[1]))).padStart(2, '0');
  return `${e.startDate}T${hh}:${m[2] ?? '00'}:00${lisbonOffset(e.startDate)}`;
}

const today = new Date().toISOString().slice(0, 10);
const horizon = new Date(Date.now() + DAYS_AHEAD * 86400_000).toISOString().slice(0, 10);
const upcoming = data.events.filter((e) => e.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
const soon = upcoming.filter((e) => e.startDate <= horizon);

const eventPath = (e) => `/evento/${clip(slug(e.title), 70).replace(/…$/, '').replace(/-$/, '')}-${createHash('sha1').update(e.id).digest('hex').slice(0, 6)}/`;
const cityPath = (c) => `/eventos/${slug(c)}/`;
const catPath = (c, cat) => `${cityPath(c)}${CAT_SEO[cat].slug}/`;

// ---------------------------------------------------------------- escrita das páginas
const written = [];
async function page(path, { title, description, canonical = SITE + path, initial, body, ld = [], image }) {
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(clip(description, 158))}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Eventados" />`,
    `<meta property="og:locale" content="pt_PT" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(clip(description, 200))}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...ld.map(jsonLd),
  ]
    .filter(Boolean)
    .join('\n    ');
  const html = template
    .replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, head)
    .replace('<!--ssr-->', `<main class="ssr">${body}</main>`)
    .replace('<!--initial-->', initial ? `<script>window.__INITIAL__=${JSON.stringify(initial).replace(/</g, '\\u003c')}</script>` : '');
  const dir = new URL(`.${path}`, DIST);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('index.html', dir), html);
  written.push(path);
}

const crumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
});

const eventLi = (e, showCity) =>
  `<li><a href="${eventPath(e)}">${esc(e.title)}</a> — ${esc(e.startDate === e.endDate ? longDate(e.startDate) : `${longDate(e.startDate)} a ${longDate(e.endDate)}`)}${e.timesText ? `, ${esc(e.timesText)}` : ''}${e.venue ? ` · ${esc(e.venue)}` : ''}${showCity ? ` · ${esc(e.city)}` : ''}</li>`;

function listByDay(events, showCity) {
  const out = [];
  let day = '';
  for (const e of events) {
    const d = e.startDate < today ? today : e.startDate;
    if (d !== day) {
      if (day) out.push('</ul>');
      out.push(`<h2>${esc(longDate(d))}</h2><ul>`);
      day = d;
    }
    out.push(eventLi(e, showCity));
  }
  if (day) out.push('</ul>');
  return out.join('');
}

const itemList = (events) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: events.slice(0, 30).map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + eventPath(e), name: e.title })),
});

// Cidades com eventos, das que têm mais para as que têm menos.
const byCity = new Map();
for (const e of upcoming) {
  if (!byCity.has(e.city)) byCity.set(e.city, []);
  byCity.get(e.city).push(e);
}
const cities = [...byCity.entries()].sort((a, b) => b[1].length - a[1].length);
const cityLinks = (except) =>
  `<nav><h2>Eventos noutras cidades</h2><ul>${cities
    .filter(([c]) => c !== except)
    .slice(0, 30)
    .map(([c, l]) => `<li><a href="${cityPath(c)}">Eventos ${esc(inPlace(c))}</a> (${l.length})</li>`)
    .join('')}</ul></nav>`;

// 1) uma página por evento
for (const e of upcoming) {
  const cat = e.categories.find((c) => CAT_SEO[c]);
  const where = [e.venue, e.city].filter(Boolean).join(', ');
  const prices = (e.price ?? '').match(/\d+(?:[.,]\d+)?/g)?.map((n) => Number(n.replace(',', '.'))) ?? [];
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    description: clip(e.description || e.subtitle || `${e.title} ${inPlace(e.city)}.`, 400),
    startDate: isoStart(e),
    endDate: e.endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: SITE + eventPath(e),
    location: {
      '@type': 'Place',
      name: e.venue || e.city,
      address: { '@type': 'PostalAddress', streetAddress: e.address || undefined, addressLocality: e.city, addressRegion: e.district || undefined, addressCountry: 'PT' },
      ...(e.lat != null && e.lon != null ? { geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lon } } : {}),
    },
    ...(e.image ? { image: [e.image] } : {}),
    organizer: { '@type': 'Organization', name: e.sourceName, url: e.url },
    ...(e.isFree || prices.length
      ? { offers: { '@type': 'Offer', url: e.tickets || e.url, price: e.isFree ? 0 : Math.min(...prices), priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } }
      : {}),
  };
  const facts = [
    `<li><strong>Quando:</strong> ${esc(e.datesText || span(e))}</li>`,
    e.timesText ? `<li><strong>Hora:</strong> ${esc(e.timesText)}</li>` : '',
    `<li><strong>Onde:</strong> ${esc([e.venue, e.address, e.city].filter(Boolean).join(', '))}</li>`,
    e.price || e.isFree ? `<li><strong>Preço:</strong> ${esc(e.price ?? 'Entrada gratuita')}</li>` : '',
  ].join('');
  await page(eventPath(e), {
    title: `${e.title} — ${where} | Eventados`,
    description: `${e.title}: ${span(e)}${e.timesText ? `, ${e.timesText}` : ''}${e.venue ? `, ${e.venue}` : ''} ${inPlace(e.city)}. ${e.subtitle ?? e.description ?? ''}`,
    image: e.image,
    initial: { page: 'eventos', city: e.city, eventId: e.id },
    ld: [event, crumbs([['Eventados', '/'], [`Eventos ${inPlace(e.city)}`, cityPath(e.city)], ...(cat ? [[`${CAT_SEO[cat].title} ${inPlace(e.city)}`, catPath(e.city, cat)]] : []), [e.title, eventPath(e)]])],
    body: `<nav><a href="/">Eventados</a> › <a href="${cityPath(e.city)}">Eventos ${esc(inPlace(e.city))}</a>${cat ? ` › <a href="${catPath(e.city, cat)}">${esc(CAT_SEO[cat].title)}</a>` : ''}</nav>
<article><h1>${esc(e.title)}</h1>${e.subtitle ? `<p>${esc(e.subtitle)}</p>` : ''}<ul>${facts}</ul>${e.description ? `<p>${esc(e.description)}</p>` : ''}
<p><a href="${esc(e.url)}" rel="nofollow">Mais informação em ${esc(e.sourceName)}</a>${e.tickets && e.tickets !== e.url ? ` · <a href="${esc(e.tickets)}" rel="nofollow">Bilhetes</a>` : ''}</p></article>`,
  });
}

// 2) cidades e 3) cidade × tipo
for (const [city, all] of cities) {
  const list = all.filter((e) => e.startDate <= horizon);
  const cats = Object.keys(CAT_SEO).filter((c) => list.filter((e) => e.categories.includes(c)).length >= 3);
  const catNav = `<nav><h2>Por tipo de evento</h2><ul>${cats.map((c) => `<li><a href="${catPath(city, c)}">${esc(CAT_SEO[c].title)} ${esc(inPlace(city))}</a></li>`).join('')}</ul></nav>`;
  await page(cityPath(city), {
    title: `Eventos ${inPlace(city)} hoje, este fim de semana e próximos dias | Eventados`,
    description: `${list.length} eventos ${inPlace(city)}: concertos, teatro, stand-up, exposições, cinema e atividades para famílias. Agenda atualizada todos os dias, com datas, horários e locais.`,
    initial: { page: 'eventos', city },
    ld: [itemList(list), crumbs([['Eventados', '/'], ['Eventos', '/eventos/'], [`Eventos ${inPlace(city)}`, cityPath(city)]])],
    body: `<nav><a href="/">Eventados</a> › <a href="/eventos/">Eventos</a></nav><h1>Eventos ${esc(inPlace(city))}</h1>
<p>${list.length} eventos ${esc(inPlace(city))} nos próximos ${DAYS_AHEAD} dias, recolhidos das agendas municipais e das salas de espetáculos.</p>${catNav}${listByDay(list.slice(0, 150), false)}${cityLinks(city)}`,
  });
  for (const cat of cats) {
    const cl = list.filter((e) => e.categories.includes(cat));
    const name = `${CAT_SEO[cat].title} ${inPlace(city)}`;
    await page(catPath(city, cat), {
      title: `${name}: agenda dos próximos dias | Eventados`,
      description: `${cl.length} eventos de ${CAT_SEO[cat].title.toLowerCase()} ${inPlace(city)}, com datas, horários, locais e preços. Agenda atualizada todos os dias.`,
      initial: { page: 'eventos', city, cats: [cat] },
      ld: [itemList(cl), crumbs([['Eventados', '/'], [`Eventos ${inPlace(city)}`, cityPath(city)], [name, catPath(city, cat)]])],
      body: `<nav><a href="/">Eventados</a> › <a href="${cityPath(city)}">Eventos ${esc(inPlace(city))}</a></nav><h1>${esc(name)}</h1>
<p>${cl.length} eventos nos próximos ${DAYS_AHEAD} dias.</p>${listByDay(cl.slice(0, 150), false)}${catNav}`,
    });
  }
}

// 4) índice de cidades
await page('/eventos/', {
  title: 'Eventos em Portugal por cidade | Eventados',
  description: `Agenda de ${upcoming.length} eventos em ${cities.length} concelhos de Portugal: concertos, teatro, stand-up, exposições e mais, organizados por cidade.`,
  initial: { page: 'eventos' },
  ld: [crumbs([['Eventados', '/'], ['Eventos', '/eventos/']])],
  body: `<h1>Eventos em Portugal por cidade</h1><ul>${cities.map(([c, l]) => `<li><a href="${cityPath(c)}">Eventos ${esc(inPlace(c))}</a> (${l.length})</li>`).join('')}</ul>`,
});

// 5) página inicial: ligações para as cidades e próximos eventos (o Google segue estas ligações)
const homeHtml = template.replace(
  '<!--ssr-->',
  `<main class="ssr"><h1>Agenda de eventos em Portugal</h1><p>Concertos, teatro, stand-up, exposições e muito mais, por cidade e por dia.</p>${cityLinks('')}<h2>Próximos eventos</h2><ul>${soon
    .slice(0, 40)
    .map((e) => eventLi(e, true))
    .join('')}</ul></main>`,
).replace('<!--initial-->', '');
await writeFile(new URL('index.html', DIST), homeHtml);
written.unshift('/');

// 6) sitemap e robots
const lastmod = data.updatedAt.slice(0, 10);
await writeFile(
  new URL('sitemap.xml', DIST),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${written
    .map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq></url>`)
    .join('\n')}\n</urlset>\n`,
);
await writeFile(new URL('robots.txt', DIST), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Páginas estáticas: ${written.length} (${upcoming.length} eventos, ${cities.length} concelhos) + sitemap.xml + robots.txt`);
