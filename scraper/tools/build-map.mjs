// Gera src/data/pt-map.json: o contorno de cada concelho já projetado em caminhos SVG
// (continente + Açores e Madeira em caixas à esquerda), a partir de scraper/data/municipios.json.
// Uso: node scraper/tools/build-map.mjs
import { readFile, writeFile } from 'node:fs/promises';

const list = JSON.parse(await readFile(new URL('../data/municipios.json', import.meta.url)));
const TOLERANCE = 0.9; // px

// Cada região tem a sua caixa no desenho: [lon0, lat1] é o canto superior esquerdo, s = px por grau de latitude.
const REGIONS = {
  continente: { lon0: -9.6, lat1: 42.2, s: 150, x: 250, y: 10 },
  acores: { lon0: -31.35, lat1: 39.8, s: 38, x: 14, y: 40, label: 'Açores' },
  madeira: { lon0: -17.35, lat1: 33.15, s: 130, x: 60, y: 230, label: 'Madeira' },
};
const regionOf = (m) => (m.center[0] < -20 ? 'acores' : m.center[0] < -12 ? 'madeira' : 'continente');

const project = (r) => {
  const k = Math.cos(((r.lat1 - 2) * Math.PI) / 180);
  return ([lon, lat]) => [r.x + (lon - r.lon0) * k * r.s, r.y + (r.lat1 - lat) * r.s];
};

function simplify(points, tol) {
  if (points.length < 4) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const d = len ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > maxD) [maxD, idx] = [d, i];
  }
  if (maxD <= tol) return [a, b];
  return [...simplify(points.slice(0, idx + 1), tol).slice(0, -1), ...simplify(points.slice(idx), tol)];
}

const f = (n) => Math.round(n * 10) / 10;
const items = list.map((m) => {
  const region = regionOf(m);
  const p = project(REGIONS[region]);
  const d = m.polygons
    // As Selvagens (Funchal) ficariam muito a sul da caixa da Madeira.
    .filter((ring) => region !== 'madeira' || ring.every(([, lat]) => lat > 32.3))
    .map((ring) => simplify(ring.map(p), TOLERANCE))
    .filter((r) => r.length >= 3)
    .map((r) => 'M' + r.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z')
    .join('');
  const [cx, cy] = p(m.center);
  return { name: m.name, district: m.district, region, d, c: [f(cx), f(cy)] };
});

const boxes = Object.entries(REGIONS)
  .filter(([, r]) => r.label)
  .map(([id, r]) => {
    const own = items.filter((it) => it.region === id).flatMap((it) => [...it.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]));
    const xs = own.map((q) => q[0]);
    const ys = own.map((q) => q[1]);
    const pad = 10;
    return { label: r.label, x: f(Math.min(...xs) - pad), y: f(Math.min(...ys) - pad - 14), w: f(Math.max(...xs) - Math.min(...xs) + pad * 2), h: f(Math.max(...ys) - Math.min(...ys) + pad * 2 + 14) };
  });

const all = items.flatMap((it) => [...it.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]));
const width = Math.ceil(Math.max(...all.map((q) => q[0])) + 10);
const height = Math.ceil(Math.max(...all.map((q) => q[1])) + 10);

const out = { width, height, boxes, items };
await writeFile(new URL('../../src/data/pt-map.json', import.meta.url), JSON.stringify(out));
console.log(`${items.length} concelhos · ${width}×${height} · ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
