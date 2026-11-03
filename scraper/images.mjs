// Escolha da melhor imagem quando o mesmo evento vem de várias fontes.
// Lê só o início de cada ficheiro (Range: 64 KB) para saber as dimensões; os tamanhos ficam em cache
// em .cache/image-sizes.json para não voltar a pedir a mesma imagem nas recolhas seguintes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { UA, mapLimit } from './util.mjs';

const CACHE = new URL('../.cache/image-sizes.json', import.meta.url);
let cache = null;

async function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(CACHE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

// Largura e altura a partir dos primeiros bytes de um PNG, GIF, JPEG ou WebP.
function dimensions(buf) {
  if (buf.length < 30) return null;
  // PNG
  if (buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  // GIF
  if (buf.toString('ascii', 0, 3) === 'GIF') return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
  // WebP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
    }
    if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  }
  // JPEG: procura o marcador SOF
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}

async function probe(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-65535' }, signal: AbortSignal.timeout(10_000) });
    // Imagem que já não existe: conta como a pior.
    if (res.status === 404 || res.status === 410) return [0, 0];
    if (!res.ok) return null;
    // Só os primeiros 64 KB, mesmo que o servidor ignore o Range.
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < 65536) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    return dimensions(Buffer.concat(chunks));
  } catch {
    return null;
  }
}

// Sem dimensões conhecidas: palpite pelo endereço (miniaturas e tamanhos no nome do ficheiro).
function guess(url) {
  const m = url.match(/[-_](\d{2,4})[x_](\d{2,4})(?=[._-]|\.\w+$)/i);
  if (m) return Number(m[1]) * Number(m[2]);
  if (/thumb|\/cache\/|low_|_s\.\w+$|small|liststores/i.test(url)) return 120 * 120;
  return 600 * 400;
}

// Para cada evento com mais de uma imagem candidata, fica a de maior resolução.
export async function pickBestImages(events) {
  const sizes = await loadCache();
  const multi = events.filter((e) => new Set(e.imageCandidates ?? []).size > 1);
  const urls = [...new Set(multi.flatMap((e) => e.imageCandidates))].filter((u) => !(u in sizes));
  await mapLimit(urls, 4, async (u) => {
    // Falhas temporárias (timeout, 5xx) não ficam em cache: tenta-se outra vez na próxima recolha.
    const d = await probe(u);
    if (d) sizes[u] = d;
  });
  let changed = 0;
  for (const e of multi) {
    const score = (u) => (u in sizes ? sizes[u][0] * sizes[u][1] : guess(u));
    const best = [...new Set(e.imageCandidates)].sort((a, b) => score(b) - score(a))[0];
    if (best !== e.image) changed++;
    e.image = best;
  }
  for (const e of events) delete e.imageCandidates;
  await mkdir(new URL('./', CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(sizes));
  return { compared: multi.length, probed: urls.length, changed };
}
