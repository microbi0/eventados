// Corre todas as fontes e escreve public/data/events.json.
// Uso: node scraper/index.mjs [--out caminho] [--only id1,id2] [--force]
// Os dados não precisam de ser em tempo real: por omissão recusa correr se a última recolha
// tiver menos de MIN_HOURS_BETWEEN_RUNS horas, para não gastar recursos dos sites de origem.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CATEGORIES, PRIVATE_CATEGORIES, slugify } from './categories.mjs';
import { stats } from './util.mjs';
import { municipioAt, municipioBBox, municipioByName } from './geo.mjs';
import * as agendalx from './sources/agendalx.mjs';
import { agendaPorto, viladoconde } from './sources/bundlr.mjs';
import { gondomar, povoa, superBockArena, saDaBandeira, ccb } from './sources/wordpress.mjs';
import { matosinhos, maia, famalicao, odivelas, viana, aveiro, gaia } from './sources/municipal.mjs';
import { meoArena, rivoli, tnsj, coliseuPorto, campoPequeno, coliseuLisboa, gulbenkian, tivoli, ccl, fil, exponor, jazzAoCentro, conventoSaoFrancisco, theatroCirco, gnration, teatroJLSilva, teatroViriato, cmEvora, teatroBraganca, auditorioCCOP } from './sources/venues.mjs';
import { turismoCentro, visitAlentejo, visitAlgarve, visitLisboa, eventsMadeira } from './sources/regional.mjs';

// Ordem = prioridade na remoção de duplicados (agendas oficiais primeiro, depois regionais e salas).
// Bilheteiras (BOL, Eventbrite, Ticketline…) ficam de fora de propósito: só agendas públicas e salas.
// Para adicionar uma plataforma: criar um módulo com { meta, scrape() } e juntá-lo aqui.
const SOURCES = [
  agendalx, agendaPorto, viladoconde, matosinhos, gaia, gondomar, maia, povoa, famalicao, odivelas, viana, aveiro,
  turismoCentro, visitAlentejo, visitAlgarve, visitLisboa, eventsMadeira,
  superBockArena, saDaBandeira, coliseuPorto, rivoli, tnsj, ccb, meoArena,
  campoPequeno, coliseuLisboa, gulbenkian, tivoli, ccl, fil, exponor,
  jazzAoCentro, conventoSaoFrancisco, theatroCirco, gnration, teatroJLSilva, teatroViriato, cmEvora, teatroBraganca, auditorioCCOP,
];
const SOURCE_KIND = {
  superbockarena: 'venue', sadabandeira: 'venue', ccb: 'venue', meoarena: 'venue', coliseuporto: 'venue', tmp: 'venue', tnsj: 'venue',
  campopequeno: 'venue', coliseulisboa: 'venue', gulbenkian: 'venue', tivolibbva: 'venue', ccl: 'venue', fil: 'venue', exponor: 'venue',
  jazzaocentro: 'venue', conventosaofrancisco: 'venue', theatrocirco: 'venue', gnration: 'venue', teatrojlsilva: 'venue', teatroviriato: 'venue', cmevora: 'agenda', teatrobraganca: 'venue', auditorioccop: 'venue',
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
  const kept = previous.filter((e) => !ONLY.includes(e.source));
  results.push({ list: kept, info: null });
}

// Concelho e distrito: pelas coordenadas quando existem; senão pelo nome indicado pela fonte.
function locate(e) {
  const m = (e.lat != null && e.lon != null && municipioAt(e.lat, e.lon)) || municipioByName(e.city);
  if (m) {
    e.city = m.name;
    e.district = m.district;
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

for (const e of collapseSessions(results.flatMap((r) => r.list).filter((e) => !isPrivate(e) && !isCancelled(e))).map(locate)) {
  if (!e.city || !e.startDate || !e.title) continue;
  const k = key(e);
  const prev = byKey.get(k);
  if (!prev) {
    byKey.set(k, e);
    continue;
  }
  // Duplicado: fica o da fonte prioritária, com o link de bilhetes/outra fonte como alternativa.
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
const sources = results.map((r) => r.info).filter(Boolean).map((s) => ({ ...s, kind: SOURCE_KIND[s.id] ?? 'agenda' }));
if (ONLY) {
  try {
    const prevSources = JSON.parse(await readFile(OUT, 'utf8')).sources ?? [];
    sources.push(...prevSources.filter((s) => !ONLY.includes(s.id)));
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
