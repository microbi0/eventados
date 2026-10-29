import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Regras para não sobrecarregar os sites de origem:
// - no máximo 1 pedido de cada vez por domínio, com MIN_INTERVAL_MS entre pedidos (ou o Crawl-delay do robots.txt, se maior);
// - robots.txt é respeitado (pedidos proibidos falham sem contactar o servidor);
// - respostas ficam em cache em .cache/ e são revalidadas com If-None-Match / If-Modified-Since;
// - 429/503 respeitam o Retry-After; outros erros 4xx não são repetidos.
const BOT = 'EventadosBot';
const UA = `${BOT}/0.1 (+agregador de agenda cultural; links para a fonte original)`;
const MIN_INTERVAL_MS = Number(process.env.SCRAPER_MIN_INTERVAL_MS ?? 2000);
const DEFAULT_CACHE_HOURS = Number(process.env.SCRAPER_CACHE_HOURS ?? 12);
const CACHE_DIR = new URL('../.cache/', import.meta.url);

export const stats = { requests: 0, cacheHits: 0, notModified: 0, blockedByRobots: 0 };

// ---------------------------------------------------------------- cache
const cacheFile = (url) => new URL(createHash('sha1').update(url).digest('hex'), CACHE_DIR);

async function readCache(url) {
  try {
    return JSON.parse(await readFile(cacheFile(url), 'utf8'));
  } catch {
    return null;
  }
}

async function writeCache(url, entry) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile(url), JSON.stringify(entry));
}

// ---------------------------------------------------------------- limite por domínio
const hosts = new Map(); // host → { chain: Promise, last: number, delay: number }

function hostState(host) {
  if (!hosts.has(host)) hosts.set(host, { chain: Promise.resolve(), last: 0, delay: MIN_INTERVAL_MS });
  return hosts.get(host);
}

// Serializa os pedidos a cada domínio e garante o intervalo mínimo entre eles.
function throttled(host, fn) {
  const h = hostState(host);
  const run = h.chain.then(async () => {
    const wait = h.last + h.delay - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      h.last = Date.now();
    }
  });
  h.chain = run.catch(() => {});
  return run;
}

async function rawFetch(url, headers = {}, timeoutMs = 30_000) {
  stats.requests++;
  return fetch(url, {
    headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'pt-PT,pt;q=0.9', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// ---------------------------------------------------------------- robots.txt
const robots = new Map(); // origin → Promise<{ rules, crawlDelay }>

function parseRobots(txt) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, field, value] = [m[0], m[1].toLowerCase(), m[2]];
    if (field === 'user-agent') {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [], crawlDelay: null }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') current.rules.push({ allow: field === 'allow', path: value });
    if (field === 'crawl-delay') current.crawlDelay = Number(value) || null;
  }
  // Interpretação conservadora: um grupo aplica-se se o nome indicado estiver contido no nosso
  // (ex.: "bot" aplica-se a "eventadosbot"). Na falta de grupo específico, vale o "*".
  const me = BOT.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && a && me.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return {
    rules: chosen.flatMap((g) => g.rules).filter((r) => r.path || r.allow === false),
    crawlDelay: Math.max(0, ...chosen.map((g) => g.crawlDelay ?? 0)),
  };
}

function ruleMatches(path, rulePath) {
  if (!rulePath) return false;
  const re = new RegExp('^' + rulePath.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  return re.test(path);
}

async function robotsFor(origin) {
  if (!robots.has(origin)) {
    robots.set(
      origin,
      (async () => {
        const url = `${origin}/robots.txt`;
        const hit = await readCache(url);
        if (hit && Date.now() - hit.at < 24 * 3600_000) return parseRobots(hit.body);
        try {
          const res = await throttled(new URL(origin).host, () => rawFetch(url));
          const body = res.ok ? await res.text() : '';
          await writeCache(url, { at: Date.now(), body });
          return parseRobots(body);
        } catch {
          return parseRobots('');
        }
      })(),
    );
  }
  return robots.get(origin);
}

export async function allowedByRobots(url) {
  const u = new URL(url);
  const { rules, crawlDelay } = await robotsFor(u.origin);
  if (crawlDelay) hostState(u.host).delay = Math.max(MIN_INTERVAL_MS, Math.min(crawlDelay, 30) * 1000);
  const path = u.pathname + u.search;
  // A regra mais específica (caminho mais longo) ganha; em empate, Allow ganha.
  let best = null;
  for (const r of rules) {
    if (r.allow === false && !r.path) continue; // "Disallow:" vazio = tudo permitido
    if (!ruleMatches(path, r.path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

// ---------------------------------------------------------------- pedido principal
// cacheHours: durante quanto tempo uma resposta guardada é usada sem contactar o servidor.
export async function fetchText(url, { retries = 2, cacheHours = DEFAULT_CACHE_HOURS, timeoutMs = 30_000 } = {}) {
  const entry = await readCache(url);
  if (entry && Date.now() - entry.at < cacheHours * 3600_000) {
    stats.cacheHits++;
    return entry.body;
  }
  if (!(await allowedByRobots(url))) {
    stats.blockedByRobots++;
    throw new Error(`bloqueado pelo robots.txt: ${url}`);
  }
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const conditional = {};
    if (entry?.etag) conditional['If-None-Match'] = entry.etag;
    if (entry?.lastModified) conditional['If-Modified-Since'] = entry.lastModified;
    const res = await throttled(host, () => rawFetch(url, conditional, timeoutMs)).catch((err) => ({ error: err }));
    if (res.status === 304 && entry) {
      stats.notModified++;
      await writeCache(url, { ...entry, at: Date.now() });
      return entry.body;
    }
    if (res.ok) {
      const body = await res.text();
      await writeCache(url, { at: Date.now(), body, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') });
      return body;
    }
    const retryable = res.error || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      // Servidor em baixo: melhor usar a cópia antiga do que insistir.
      if (entry) return entry.body;
      throw res.error ?? new Error(`HTTP ${res.status} em ${url}`);
    }
    const retryAfter = Number(res.headers?.get?.('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) * 1000 : 5000 * (attempt + 1));
  }
}

// POST (APIs GraphQL): mesmas regras de robots.txt e limite por domínio, cache por URL + corpo.
export async function postText(url, body, { cacheHours = DEFAULT_CACHE_HOURS } = {}) {
  const key = `${url}#${createHash('sha1').update(body).digest('hex')}`;
  const entry = await readCache(key);
  if (entry && Date.now() - entry.at < cacheHours * 3600_000) {
    stats.cacheHits++;
    return entry.body;
  }
  if (!(await allowedByRobots(url))) {
    stats.blockedByRobots++;
    throw new Error(`bloqueado pelo robots.txt: ${url}`);
  }
  const res = await throttled(new URL(url).host, () => {
    stats.requests++;
    return fetch(url, { method: 'POST', body, headers: { 'User-Agent': UA, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000) });
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  const text = await res.text();
  await writeCache(key, { at: Date.now(), body: text });
  return text;
}

export const fetchJson = async (url, opts) => JSON.parse(await fetchText(url, opts));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Executa fn sobre items com no máximo `limit` pedidos em simultâneo.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ordm: 'º', ordf: 'ª', euro: '€' };

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      const lower = e.toLowerCase();
      if (ENTITIES[lower]) return ENTITIES[lower];
      // Letras acentuadas: &aacute; &ccedil; &atilde; …
      const acc = { acute: '́', grave: '̀', tilde: '̃', circ: '̂', cedil: '̧', uml: '̈' };
      const mm = e.match(/^([a-z])(acute|grave|tilde|circ|cedil|uml)$/i);
      return mm ? (mm[1] + acc[mm[2].toLowerCase()]).normalize('NFC') : m;
    })
    // Alguns sites (Bundlr) escrevem "&quot;" como "andquot".
    .replace(/andquot/g, '"');
}

export function stripHtml(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Data local (Europe/Lisbon) no formato YYYY-MM-DD.
export function lisbonDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(d));
}

export function lisbonTime(d) {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' })
    .format(new Date(d))
    .replace(':', 'h');
}

// "2026-10-31T14:00:00" (hora local, sem fuso) ou ISO com fuso → { date, time }
export function splitDateTime(value) {
  if (!value) return { date: null, time: null };
  const s = String(value).trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const time = lisbonTime(s);
    return { date: lisbonDate(s), time: time === '00h00' ? null : time };
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return { date: null, time: null };
  const time = m[2] && !(m[2] === '00' && m[3] === '00') ? `${m[2]}h${m[3]}` : null;
  return { date: m[1], time };
}

const LOWER = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o']);

// "Alfândega da fé" → "Alfândega da Fé", "Albergaria-a-velha" → "Albergaria-a-Velha"
export function municipalityName(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

export const absUrl = (href, base) => {
  try {
    return new URL(decodeEntities(href), base).href;
  } catch {
    return null;
  }
};
