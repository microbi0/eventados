// Corre todas as fontes e escreve public/data/events.json.
// Uso: node scraper/index.mjs [--out caminho] [--only id1,id2] [--force]
// Os dados não precisam de ser em tempo real: por omissão recusa correr se a última recolha
// tiver menos de MIN_HOURS_BETWEEN_RUNS horas, para não gastar recursos dos sites de origem.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CATEGORIES, PRIVATE_CATEGORIES, slugify } from './categories.mjs';
import { stats } from './util.mjs';
import { normalizePrice } from './event.mjs';
import { municipioAt, municipioBBox, municipioByName, municipioInText } from './geo.mjs';
import * as agendalx from './sources/agendalx.mjs';
import { agendaPorto, viladoconde, fnac } from './sources/bundlr.mjs';
import { gondomar, povoa, superBockArena, saDaBandeira, ccb } from './sources/wordpress.mjs';
import { matosinhos, maia, famalicao, odivelas, viana, aveiro, gaia, quartelDasArtes, palmela } from './sources/municipal.mjs';
import { meoArena, rivoli, tnsj, coliseuPorto, campoPequeno, coliseuLisboa, gulbenkian, tivoli, ccl, fil, exponor, jazzAoCentro, conventoSaoFrancisco, theatroCirco, gnration, teatroJLSilva, teatroViriato, cmEvora, teatroBraganca, auditorioCCOP, tagv, espacoVita } from './sources/venues.mjs';
import { turismoCentro, visitAlentejo, visitAlgarve, visitLisboa, eventsMadeira } from './sources/regional.mjs';
import { uguru, sonsEmTransito } from './sources/agencies.mjs';

// Ordem = prioridade na remoção de duplicados (agendas oficiais primeiro, depois regionais e salas).
// Bilheteiras (BOL, Eventbrite, Ticketline…) ficam de fora de propósito: só agendas públicas e salas.
// Para adicionar uma plataforma: criar um módulo com { meta, scrape() } e juntá-lo aqui.
const SOURCES = [
  agendalx, agendaPorto, viladoconde, matosinhos, gaia, gondomar, maia, povoa, famalicao, odivelas, viana, aveiro,
  turismoCentro, visitAlentejo, visitAlgarve, visitLisboa, eventsMadeira,
  superBockArena, saDaBandeira, coliseuPorto, rivoli, tnsj, ccb, meoArena,
  campoPequeno, coliseuLisboa, gulbenkian, tivoli, ccl, fil, exponor,
  jazzAoCentro, conventoSaoFrancisco, theatroCirco, gnration, teatroJLSilva, teatroViriato, cmEvora, teatroBraganca, auditorioCCOP,
  tagv, quartelDasArtes, palmela, espacoVita,
  // Lojas e centros comerciais
  fnac,
  // Agências: digressões completas (por último: nos duplicados ficam os dados da sala ou agenda).
  uguru, sonsEmTransito,
];
const SOURCE_KIND = {
  superbockarena: 'venue', sadabandeira: 'venue', ccb: 'venue', meoarena: 'venue', coliseuporto: 'venue', tmp: 'venue', tnsj: 'venue',
  campopequeno: 'venue', coliseulisboa: 'venue', gulbenkian: 'venue', tivolibbva: 'venue', ccl: 'venue', fil: 'venue', exponor: 'venue',
  jazzaocentro: 'venue', conventosaofrancisco: 'venue', theatrocirco: 'venue', gnration: 'venue', teatrojlsilva: 'venue', teatroviriato: 'venue', cmevora: 'agenda', teatrobraganca: 'venue', auditorioccop: 'venue',
  fnac: 'venue', tagv: 'venue', quarteldasartes: 'venue', palmela: 'agenda', espacovita: 'venue',
  uguru: 'agency', sonsemtransito: 'agency',
  turismocentro: 'regional', visitalentejo: 'regional', visitalgarve: 'regional', visitlisboa: 'regional', eventsmadeira: 'regional',
};

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const OUT = resolve(arg('--out') ?? 'public/data/events.json');
const ONLY = arg('--only')?.split(',');
const FORCE = process.argv.includes('--force');
const MIN_HOURS_BETWEEN_RUNS = Number(process.env.MIN_HOURS_BETWEEN_RUNS ?? 20);

let previous = [];
let lastRun = null;
try {
  const prev = JSON.parse(await readFile(OUT, 'utf8'));
  previous = prev.events ?? [];
  lastRun = prev.updatedAt ? new Date(prev.updatedAt) : null;
} catch {
  /* primeira execução */
}

const hoursSince = lastRun ? (Date.now() - lastRun.getTime()) / 3600_000 : Infinity;
if (!FORCE && !ONLY && hoursSince < MIN_HOURS_BETWEEN_RUNS) {
  console.log(`Última recolha há ${hoursSince.toFixed(1)} h (< ${MIN_HOURS_BETWEEN_RUNS} h). Nada a fazer; use --force para forçar.`);
  process.exit(0);
}

async function run(src) {
  const started = Date.now();
  try {
    const list = await src.scrape();
    console.log(`✔ ${src.meta.name}: ${list.length} eventos (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    return { list, info: { ...src.meta, count: list.length, ok: true } };
  } catch (err) {
    // Se uma fonte falhar, mantemos os eventos da última recolha bem-sucedida.
    const kept = previous.filter((e) => e.source === src.meta.id);
    console.error(`✖ ${src.meta.name}: ${err.message ?? err} (mantidos ${kept.length} eventos anteriores)`);
    return { list: kept, info: { ...src.meta, count: kept.length, ok: false, error: String(err.message ?? err) } };
  }
}

// Fontes em paralelo (servidores diferentes); cada uma faz os seus pedidos em sequência.
const selected = SOURCES.filter((s) => !ONLY || ONLY.includes(s.meta.id));
const results = await Promise.all(selected.map(run));
if (ONLY) {
  // Execução parcial: mantém as restantes fontes do ficheiro anterior.
  // (só de fontes que ainda existem: uma fonte retirada desaparece logo)
  const active = new Set(SOURCES.map((x) => x.meta.id));
  const kept = previous.filter((e) => !ONLY.includes(e.source) && active.has(e.source));
  const activeNames = new Set(SOURCES.map((x) => x.meta.name));
  for (const e of kept) if (e.alsoAt) e.alsoAt = e.alsoAt.filter((x) => activeNames.has(x.name) || !/^[A-Z]/.test(x.name));
  results.push({ list: kept, info: null });
}

// Concelho e distrito: pelas coordenadas quando existem; senão pelo nome indicado pela fonte.
// Cidades estrangeiras que aparecem em digressões (ficam de fora: o site é sobre Portugal).
const FOREIGN = /\b(londres|london|paris|zurique|zurich|genebra|geneve|luxemburgo|bruxelas|amesterdao|berlim|madrid|barcelona|nova iorque|new york|toronto|boston|newark|sao paulo|rio de janeiro|andorra|munique|frankfurt|mancheste?r|dublin)\b/;

function locate(e) {
  const m =
    (e.lat != null && e.lon != null && municipioAt(e.lat, e.lon)) ||
    municipioByName(e.city) ||
    // Sala já conhecida de outra fonte ("Teatro Tivoli BBVA" → Lisboa).
    municipioByName(venueCity.get(slugify(e.venue ?? ''))) ||
    // Concelho mencionado no nome do local; o título só quando a fonte não deu localidade nenhuma
    // (evita "Tiago Almeida" → concelho de Almeida).
    municipioInText(`${e.city ?? ''} ${e.venue ?? ''}`) ||
    (!e.city || e.city === e.venue ? municipioInText(e.title) : null);
  if (m) {
    e.city = m.name;
    e.district = m.district;
  } else if (FOREIGN.test(slugify(`${e.city ?? ''} ${e.venue ?? ''}`))) {
    e.city = null;
  }
  return e;
}

// Sessões repetidas do mesmo evento (mesma fonte, título e local) passam a um só evento com várias datas.
function collapseSessions(list) {
  const groups = new Map();
  for (const e of list) {
    const k = `${e.source}|${slugify(e.title)}|${slugify(e.venue ?? '')}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  return [...groups.values()].map((g) => {
    if (g.length === 1) return g[0];
    g.sort((a, b) => a.startDate.localeCompare(b.startDate));
    const single = g.every((e) => e.startDate === e.endDate);
    const times = new Set(g.map((e) => e.timesText));
    return {
      ...g[0],
      endDate: g.reduce((m, e) => (e.endDate > m ? e.endDate : m), g[0].endDate),
      dates: single ? [...new Set(g.map((e) => e.startDate))] : null,
      timesText: times.size === 1 ? g[0].timesText : 'vários horários',
      categories: [...new Set(g.flatMap((e) => e.categories))],
    };
  });
}

// Atividades só para escolas (visitas de turmas, programas por nível de ensino) não são abertas ao público.
// Ficam as que também são para famílias.
const SCHOOL_LEVEL = /^(pre-?escolar|primeira infancia|primeiro ciclo|segundo ciclo|terceiro ciclo|ensino secundario|secundario)\b/;
const isPrivate = (e) => {
  const cats = e.rawCategories.map(slugify);
  if (cats.includes('familias')) return false;
  return cats.some((c) => PRIVATE_CATEGORIES.has(c)) || SCHOOL_LEVEL.test(slugify(e.title));
};

// Mesmo título com pequenas variações entre fontes ("Rigoletto, de Giuseppe Verdi" / "Rigoletto, Giuseppe Verdi").
const titleKey = (t) =>
  slugify(t)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(de|da|do|das|dos|e|a|o|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const key = (e) => `${titleKey(e.title)}|${e.startDate}|${e.city}`;
const byKey = new Map();
// Eventos cancelados saem da agenda.
const isCancelled = (e) => /\b(cancelad[oa]s?|anulad[oa]|cancelled|canceled)\b/.test(slugify(`${e.title} ${e.subtitle ?? ''}`));

// Sala → concelho, a partir dos eventos com localização segura (coordenadas ou concelho reconhecido).
const venueCity = new Map();
for (const e of results.flatMap((r) => r.list)) {
  if (!e.venue) continue;
  const m = (e.lat != null && e.lon != null && municipioAt(e.lat, e.lon)) || municipioByName(e.city);
  if (m && !venueCity.has(slugify(e.venue))) venueCity.set(slugify(e.venue), m.name);
}

// "Optimista Céptico" (sala) e "Optimista Céptico – Diogo Batáguas" (agência), ou "Maior Fã – Tiago Almeida" e
// "Tiago Almeida - Maior Fã", no mesmo dia e cidade, são o mesmo evento: o título mais curto cabe no mais longo.
const titleWords = (t) => new Set(titleKey(t).split(' ').filter((w) => w.length > 1));
function sameShow(a, b) {
  if (titleKey(a) === titleKey(b)) return true;
  const A = titleWords(a);
  const B = titleWords(b);
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared >= 2 && shared / Math.min(A.size, B.size) >= 0.8;
}
const byDayCity = new Map();
// Um festival de vários dias e um concerto de um dia desse festival não são o mesmo evento
// (só se juntam durações compatíveis: 2 noites vs 1, sim; uma semana vs 1 dia, não).
function sameSpan(a, b) {
  const da = dayKeys(a).length;
  const db = dayKeys(b).length;
  return Math.max(da, db) <= 3 || Math.abs(da - db) <= 1;
}
// Dias de um evento curto (sessões em dias seguidos ficam num só evento): compara-se qualquer dia em comum.
function dayKeys(e) {
  if (e.dates?.length) return e.dates.slice(0, 14).map((d) => `${d}|${e.city}`);
  const out = [];
  for (let d = new Date(`${e.startDate}T12:00:00Z`); out.length < 7; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > e.endDate) break;
    out.push(`${iso}|${e.city}`);
  }
  return out;
}

for (const e of collapseSessions(results.flatMap((r) => r.list).filter((e) => !isPrivate(e) && !isCancelled(e))).map(locate)) {
  if (!e.city || !e.startDate || !e.title) continue;
  // Datas de agência só entram com concelho português reconhecido.
  if (SOURCE_KIND[e.source] === 'agency' && !e.district) continue;
  const days = dayKeys(e);
  const prev = byKey.get(key(e)) ?? days.map((dc) => byDayCity.get(dc)?.find((p) => sameShow(p.title, e.title) && sameSpan(p, e))).find(Boolean);
  if (!prev) {
    byKey.set(key(e), e);
    for (const dc of days) {
      if (!byDayCity.has(dc)) byDayCity.set(dc, []);
      byDayCity.get(dc).push(e);
    }
    continue;
  }
  // Duplicado: fica o da fonte prioritária, com o link de bilhetes/outra fonte como alternativa.
  // Datas somam-se (a sala pode ter publicado só uma das noites que a agência anuncia).
  const prevDays = dayKeys(prev).map((k) => k.slice(0, 10));
  const newDays = dayKeys(e).map((k) => k.slice(0, 10));
  if (prevDays.length && newDays.length && newDays.some((d) => !prevDays.includes(d))) {
    const all = [...new Set([...prevDays, ...newDays])].sort();
    prev.dates = all;
    prev.startDate = all[0];
    prev.endDate = all[all.length - 1] > prev.endDate ? all[all.length - 1] : prev.endDate;
    for (const d of all) {
      const dc = `${d}|${prev.city}`;
      if (!byDayCity.has(dc)) byDayCity.set(dc, []);
      if (!byDayCity.get(dc).includes(prev)) byDayCity.get(dc).push(prev);
    }
  }
  prev.alsoAt ??= [];
  prev.alsoAt.push({ name: e.sourceName, url: e.tickets ?? e.url });
  prev.image ??= e.image;
  prev.price ??= e.price;
  prev.lat ??= e.lat;
  prev.lon ??= e.lon;
  prev.venue ??= e.venue;
  prev.featured ||= e.featured;
  prev.promoted ||= e.promoted;
}

const events = [...byKey.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'pt'));

// Preço em formato único para todas as fontes ("25€", "15€ – 25€", "Gratuito"), mesmo as que não usam makeEvent.
for (const e of events) {
  e.price = normalizePrice(e.price);
  if (e.price === 'Gratuito') e.isFree = true;
}

// Eventos sem imagem herdam a de outro evento com o mesmo nome (datas de digressão de agências vêm muitas vezes
// sem cartaz, mas a mesma peça noutra sala tem): primeiro título igual, depois as mesmas palavras no título.
const withImage = events.filter((e) => e.image);
const imageByTitle = new Map(withImage.map((e) => [titleKey(e.title), e.image]));
let borrowed = 0;
for (const e of events) {
  if (e.image) continue;
  e.image = imageByTitle.get(titleKey(e.title)) ?? withImage.find((o) => sameShow(o.title, e.title))?.image ?? null;
  if (e.image) borrowed++;
}
if (borrowed) console.log(`  imagens herdadas de eventos com o mesmo nome: ${borrowed}`);
const sources = results.map((r) => r.info).filter(Boolean).map((s) => ({ ...s, kind: SOURCE_KIND[s.id] ?? 'agenda' }));
if (ONLY) {
  try {
    const prevSources = JSON.parse(await readFile(OUT, 'utf8')).sources ?? [];
    sources.push(...prevSources.filter((s) => !ONLY.includes(s.id) && SOURCES.some((x) => x.meta.id === s.id)));
  } catch {
    /* sem fontes anteriores */
  }
}

// Limites de cada concelho presente (para o mapa centrar no sítio escolhido).
const places = Object.fromEntries([...new Set(events.map((e) => e.city))].map((c) => [c, municipioBBox(c)]).filter(([, b]) => b));

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), categories: CATEGORIES, sources, places, events }));
const cities = new Set(events.map((e) => e.city));
console.log(`→ ${events.length} eventos em ${cities.size} concelhos escritos em ${OUT}`);
console.log(`  pedidos HTTP: ${stats.requests} · respostas em cache: ${stats.cacheHits} · não modificadas (304): ${stats.notModified} · bloqueados por robots.txt: ${stats.blockedByRobots}`);
if (sources.every((s) => !s.ok)) process.exit(1);
