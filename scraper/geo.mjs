// Descobre o concelho a partir de coordenadas (ponto-em-polígono sobre os limites oficiais simplificados).
import { readFileSync } from 'node:fs';
import { slugify } from './categories.mjs';

const MUNICIPIOS = JSON.parse(readFileSync(new URL('./data/municipios.json', import.meta.url), 'utf8')).map((m) => {
  const xs = m.polygons.flat().map((p) => p[0]);
  const ys = m.polygons.flat().map((p) => p[1]);
  return { ...m, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
});

const BY_NAME = new Map(MUNICIPIOS.map((m) => [slugify(m.name), m]));

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const km = (lat1, lon1, lat2, lon2) => Math.hypot((lat2 - lat1) * 111, (lon2 - lon1) * 111 * Math.cos((lat1 * Math.PI) / 180));

export function municipioAt(lat, lon) {
  lat = Number(lat);
  lon = Number(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  const pad = 0.01;
  for (const m of MUNICIPIOS) {
    const [x0, y0, x1, y1] = m.bbox;
    if (lon < x0 - pad || lon > x1 + pad || lat < y0 - pad || lat > y1 + pad) continue;
    if (m.polygons.some((r) => inRing(lon, lat, r))) return m;
  }
  // Na orla (a simplificação corta alguns metros de costa): concelho com centro mais próximo até 8 km.
  let best = null;
  let bestD = 8;
  for (const m of MUNICIPIOS) {
    const d = km(lat, lon, m.center[1], m.center[0]);
    if (d < bestD) [best, bestD] = [m, d];
  }
  return best;
}

// Nome de concelho reconhecido (normaliza capitalização e acentos), ou null.
export function municipioByName(name) {
  return BY_NAME.get(slugify(name)) ?? null;
}
