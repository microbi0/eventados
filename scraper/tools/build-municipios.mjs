// Gera scraper/data/municipios.json (nome, distrito, centro e polígono simplificado dos 308 concelhos)
// a partir da GeoAPI.pt (dados da Carta Administrativa Oficial). Só é preciso correr de novo se os limites mudarem.
// Uso: node scraper/tools/build-municipios.mjs
import { writeFile } from 'node:fs/promises';
import { fetchJson, mapLimit, municipalityName } from '../util.mjs';

const API = 'https://json.geoapi.pt';
const TOLERANCE = 0.002; // ~200 m

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
    // Anel fechado (a == b): usa a distância ao ponto inicial.
    const d = len ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > maxD) [maxD, idx] = [d, i];
  }
  if (maxD <= tol) return [a, b];
  return [...simplify(points.slice(0, idx + 1), tol).slice(0, -1), ...simplify(points.slice(idx), tol)];
}

const round = ([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4];

const names = await fetchJson(`${API}/municipios`);
const list = await mapLimit(names, 4, async (name) => {
  const m = await fetchJson(`${API}/municipio/${encodeURIComponent(name)}`);
  const geom = m.geojson?.geometry;
  const polys = geom?.type === 'MultiPolygon' ? geom.coordinates : geom ? [geom.coordinates] : [];
  return {
    name: municipalityName(m.nome),
    district: municipalityName(m.distrito || m.distrito_ilha || ''),
    center: round(m.geojson?.properties?.centros?.centro ?? [0, 0]),
    // Só o anel exterior de cada polígono, simplificado.
    polygons: polys.map((p) => simplify(p[0], TOLERANCE).map(round)).filter((r) => r.length >= 4),
  };
});

await writeFile(new URL('../data/municipios.json', import.meta.url), JSON.stringify(list));
console.log(`${list.length} municípios gravados`);
