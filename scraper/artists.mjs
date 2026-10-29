// Artistas portugueses: cantores, bandas e humoristas (stand-up) com datas na agenda.
// A lista é fixa e revista à mão (a nacionalidade não vem nas fontes); cada evento cujo título ou subtítulo
// nomeia um destes artistas fica ligado a ele.
// Fotografias, por esta ordem e só onde o robots.txt deixa: TheAudioDB (músicos), a página do artista na
// Wikipédia (sobretudo humoristas) e, em último caso, a imagem de um evento do próprio artista.
// Cada pesquisa fica em cache 30 dias, por isso uma recolha normal não faz pedidos novos.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchText, decodeEntities } from './util.mjs';
import { slugify } from './categories.mjs';

// "Nome|outro nome" para variantes; nomes de uma só palavra só contam com as maiúsculas certas.
const LIST = {
  cantor: `Ana Moura; Mariza; Carminho; Camané; Cuca Roseta; Gisela João; Ricardo Ribeiro; Kátia Guerreiro; Raquel Tavares;
    Marco Rodrigues; António Zambujo; Sara Correia; Cristina Branco; Mísia; Dulce Pontes; Teresa Salgueiro; Carlos do Carmo;
    Ana Laíns; Rui Veloso; Jorge Palma; Sérgio Godinho; Pedro Abrunhosa; Paulo Gonzo; Tony Carreira; Mickael Carreira;
    David Carreira; Marisa Liz; Carolina Deslandes; Bárbara Bandeira; Bárbara Tinoco; Ana Bacalhau; Aurea; Diogo Piçarra;
    Nena; Fernando Daniel; Salvador Sobral; Luísa Sobral; Rita Redshoes; Samuel Úria; Luís Severo; B Fachada; Manel Cruz;
    Rui Reininho; Tiago Bettencourt; Miguel Araújo; João Pedro Pais; Mafalda Veiga; Rita Guerra; Paulo de Carvalho;
    Rodrigo Leão; Mimicat; Cláudia Pascoal; Conan Osiris; Slow J; ProfJam; Piruka; Plutónio|Plutonio; Sam The Kid; Boss AC;
    Mundo Segundo; Dillaz; Ivandro; Julinho KSD; Bluay; Van Zee; Nuno Ribeiro; Richie Campbell; Mizzy Miles; Pedro Mafama;
    Rita Vian; Maro; Quim Barreiros; José Malhoa; Ruth Marlene; Mónica Sintra; Jorge Ferreira; Augusto Canário; Zé Amaro;
    Sara Tavares; Luís Represas; João Gil; Rui Massena; Joana Espadinha; Tatanka; Marante; Pedro Moutinho; Hélder Moutinho; Joana Amendoeira; Gonçalo Salgueiro; Beatriz Felício; André Sardet; Fernando Tordo;
    José Cid; Lena d'Água; Adelaide Ferreira; Syro; Nininho Vaz Maia;
    Mariana Bandhold; Lura; Tim; Zeca Medeiros; Cristina Clara; Selma Uamusse; Mário Laginha; Maria João;
    Bernardo Sassetti; Júlio Resende; Ricardo Toscano; João Barradas`,
  banda: `Xutos & Pontapés|Xutos e Pontapés|Xutos; GNR; Delfins; Clã; Ornatos Violeta; Mão Morta; Moonspell; Blasted Mechanism;
    Da Weasel; Buraka Som Sistema; Deolinda; Madredeus; Diabo na Cruz; The Gift; Linda Martini; Capitão Fausto; Dead Combo;
    Expensive Soul; HMB; D.A.M.A; Os Azeitonas; Amor Electro; The Black Mamba; Quinta do Bill; Sétima Legião; Heróis do Mar;
    Trovante; UHF; Peste & Sida; Silence 4; Toranja; Fingertips; Wraygunn; The Legendary Tigerman; Sean Riley & The Slowriders;
    You Can't Win Charlie Brown; Best Youth; Glockenwise; Sensible Soccers; Black Bombaim; Throes + The Shine; Orelha Negra;
    Virgem Suta; Os Quatro e Meia; Bandidos do Cante; Galandum Galundaina; Gaiteiros de Lisboa; Ena Pá 2000; Santos & Pecadores;
    Rádio Macau; Wet Bed Gang; Fado Bicha; Bateu Matou; Lavoisier; Tara Perdida; Mundo Cão; Pólo Norte; Ala dos Namorados;
    Resistência; Anjos; Íris; Mesa; Corvos; Xinobi; Quarteto 1111; Brigada Victor Jara; Terrakota; Kumpania Algazarra;
    Criatura; Bizarra Locomotiva; Censurados; Mler Ife Dada; Mazgani; Cais Sodré Funk Connection; Club Makumba;
    Ciclo Preparatório; Grandfather's House`,
  humor: `Ricardo Araújo Pereira; Bruno Nogueira; Diogo Batáguas; Dário Guerreiro; Salvador Martinha; Nuno Markl; Joana Marques;
    Hugo Sousa; Guilherme Duarte; Pedro Teixeira da Mota; Rui Sinel de Cordes; Herman José; Fernando Rocha; João Seabra;
    Nilton; Luís Franco-Bastos; Eduardo Madeira; Miguel 7 Estacas; Manuel Cardoso; Rui Xará; Cátia Domingues; Gato Fedorento;
    Commedia à la Carte; César Mourão; Carlos Coutinho Vilhena; Jel; Madalena Abecasis;
    Bumba na Fofinha; Rui Unas; Zé Diogo Quintela; Miguel Góis;
    Tiago Dores; Vasco Palmeirim; Hugo van der Ding; Joel Ricardo Santos; Ana Bola; Maria Rueff; José Pedro Gomes;
    António Raminhos`,
};
// Nomes que também são palavras comuns: ficam de fora até haver forma segura de os distinguir.
const SKIP = new Set(['Resistência', 'Anjos', 'Íris', 'Mesa', 'Corvos', 'Tim', 'Jel', 'Xinobi']);
// Página da Wikipédia quando não é o próprio nome.
const WIKI = { Nilton: 'Nilton_(humorista)', Mariza: 'Mariza', Lura: 'Lura_(cantora)', 'Maria João': 'Maria_João_(cantora)', Nena: 'Nena_(cantora_portuguesa)' };

export const TYPES = { cantor: 'Cantores e músicos', banda: 'Bandas', humor: 'Humoristas' };

const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' e ').replace(/\s+/g, ' ').trim();
const idOf = (s) => plain(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const ARTISTS = (() => {
  const seen = new Map();
  for (const [type, text] of Object.entries(LIST)) {
    for (const entry of text.split(';').map((s) => s.trim()).filter(Boolean)) {
      const [name, ...aliases] = entry.split('|').map((s) => s.trim());
      if (SKIP.has(name) || seen.has(idOf(name))) continue;
      const patterns = [name, ...aliases].map((n) => {
        const p = plain(n);
        // Uma palavra (ou sigla): só com as maiúsculas certas; várias palavras: sem distinção.
        const strict = !p.includes(' ') || p === p.toUpperCase();
        return new RegExp(`(?<![\\p{L}\\p{N}])${escape(p).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, strict ? 'u' : 'iu');
      });
      seen.set(idOf(name), { id: idOf(name), name, type, patterns });
    }
  }
  return [...seen.values()];
})();

// Palavras do endereço (".../optimista-ceptico-diogo-bataguas-105165"): os links de bilhetes trazem muitas vezes
// o nome do artista. Só servem para nomes de várias palavras, nunca para os de uma só.
const urlWords = (u) => {
  try {
    return u ? decodeURIComponent(new URL(u).pathname).replace(/[-_/.+]+/g, ' ') : '';
  } catch {
    return '';
  }
};

export function artistsIn(e) {
  const text = plain(`${e.title} ${e.subtitle ?? ''}`);
  const url = plain(`${urlWords(e.url)} ${urlWords(e.tickets)}`);
  return ARTISTS.filter((a) => a.patterns.some((re) => re.test(text) || (re.flags.includes('i') && re.test(url)))).map((a) => a.id);
}

const MONTH = 24 * 30;
const same = (a, b) => plain(a).toLowerCase() === plain(b).toLowerCase();

async function audioDb(a) {
  if (a.type === 'humor') return null;
  try {
    const url = `https://www.theaudiodb.com/api/v1/json/123/search.php?s=${encodeURIComponent(a.name)}`;
    const list = JSON.parse(await fetchText(url, { cacheHours: MONTH })).artists ?? [];
    const hit = list.find((x) => same(x.strArtist, a.name) && (!x.strCountry || /portugal/i.test(x.strCountry)));
    return hit?.strArtistThumb || null;
  } catch {
    return null;
  }
}

async function wikipedia(a) {
  try {
    const page = WIKI[a.name] ?? a.name.replace(/ /g, '_');
    const html = await fetchText(`https://pt.wikipedia.org/wiki/${encodeURIComponent(page)}`, { cacheHours: MONTH });
    // Só se a página for mesmo de um artista português (evita homónimos).
    if (!/portugu[eê]s|portuguesa/i.test(html.slice(0, 60000))) return null;
    const img = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    return img ? decodeEntities(img).replace(/\?utm_[^"]*$/, '') : null;
  } catch {
    return null;
  }
}

// Liga os eventos aos artistas e devolve o dicionário de artistas com datas (com fotografia, se houver).
export async function linkArtists(events, { agencySources = new Set(), titleKey = (t) => slugify(t) } = {}) {
  const found = new Map();
  for (const e of events) {
    const ids = artistsIn(e);
    if (ids.length) e.artists = ids;
    else delete e.artists;
    for (const id of ids) {
      if (!found.has(id)) found.set(id, []);
      found.get(id).push(e);
    }
  }
  const out = {};
  for (const [id, list] of found) {
    const a = ARTISTS.find((x) => x.id === id);
    // Imagem de reserva: a foto da agência ou de um evento com o nome do artista como título.
    const own =
      list.find((e) => e.image && agencySources.has(e.source))?.image ??
      list.find((e) => e.image && titleKey(e.title) === titleKey(a.name))?.image ??
      null;
    const photo = (await audioDb(a)) ?? (await wikipedia(a)) ?? own;
    out[id] = { id, name: a.name, type: a.type, photo };
  }
  return out;
}

// Uso isolado: node scraper/artists.mjs [events.json] — liga os artistas num ficheiro já recolhido.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(process.argv[2] ?? 'public/data/events.json');
  const data = JSON.parse(await readFile(file, 'utf8'));
  const agencySources = new Set(data.sources.filter((s) => s.kind === 'agency').map((s) => s.id));
  data.artists = await linkArtists(data.events, { agencySources });
  await writeFile(file, JSON.stringify(data));
  const n = Object.values(data.artists);
  console.log(`→ ${n.length} artistas com datas (${n.filter((a) => a.photo).length} com fotografia); ${data.events.filter((e) => e.artists).length} eventos ligados`);
}
