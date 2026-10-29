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

// Retângulo envolvente do concelho [oeste, sul, este, norte], para o mapa.
export function municipioBBox(name) {
  const m = BY_NAME.get(slugify(name));
  return m ? m.bbox : null;
}

// Concelho mencionado num texto ("A Caça ao Estripador de Lisboa" → Lisboa); nomes mais longos primeiro.
const NAMES_BY_LENGTH = [...BY_NAME.keys()].filter((n) => n.length >= 4).sort((a, b) => b.length - a.length);
export function municipioInText(text) {
  const t = ` ${slugify(text).replace(/[^a-z0-9]+/g, ' ')} `;
  const hit = NAMES_BY_LENGTH.find((n) => t.includes(` ${n.replace(/[^a-z0-9]+/g, ' ')} `));
  return hit ? BY_NAME.get(hit) : null;
}

// Localidades/freguesias que aparecem como "cidade" nas fontes, e o concelho a que pertencem.
const LOCALITIES = {
  'alverca do ribatejo': 'Vila Franca de Xira', alverca: 'Vila Franca de Xira', 'povoa de santa iria': 'Vila Franca de Xira',
  carcavelos: 'Cascais', estoril: 'Cascais', parede: 'Cascais', 'sao joao do estoril': 'Cascais',
  alges: 'Oeiras', 'linda-a-velha': 'Oeiras', miraflores: 'Oeiras', barcarena: 'Oeiras', 'paco de arcos': 'Oeiras',
  queluz: 'Sintra', cacem: 'Sintra', 'agualva-cacem': 'Sintra', 'rio de mouro': 'Sintra', 'mem martins': 'Sintra',
  sacavem: 'Loures', moscavide: 'Loures', 'santa iria de azoia': 'Loures',
  'costa da caparica': 'Almada', 'charneca da caparica': 'Almada', 'cova da piedade': 'Almada',
  amora: 'Seixal', 'corroios': 'Seixal', ermesinde: 'Valongo', 'senhora da hora': 'Matosinhos', 'leca da palmeira': 'Matosinhos',
  gaia: 'Vila Nova de Gaia', famalicao: 'Vila Nova de Famalicao', 'santa maria da feira': 'Santa Maria da Feira',
  'caldas': 'Caldas da Rainha', 'vila real de santo antonio': 'Vila Real de Santo Antonio', 'quarteira': 'Loule', 'vilamoura': 'Loule',
  'praia da rocha': 'Portimao', 'alvor': 'Portimao', 'monte gordo': 'Vila Real de Santo Antonio', 'armacao de pera': 'Silves',
};

// Nome de concelho reconhecido (normaliza capitalização e acentos), ou null; aceita também localidades conhecidas.
export function municipioByName(name) {
  const key = slugify(name);
  return BY_NAME.get(key) ?? (LOCALITIES[key] ? BY_NAME.get(slugify(LOCALITIES[key])) : null) ?? null;
}
