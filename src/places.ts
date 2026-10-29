import { ALL } from './filters';
import CENTERS from './data/centers.json';
import type { EventItem } from './types';


// Concelhos que levam artigo: "no Porto", "na Maia". Os restantes usam "em" ("em Lisboa", "em Matosinhos").
const MASCULINE = new Set([
  'Porto', 'Funchal', 'Seixal', 'Barreiro', 'Montijo', 'Cartaxo', 'Fundão', 'Entroncamento', 'Bombarral', 'Cadaval', 'Sabugal',
  'Crato', 'Redondo', 'Alandroal', 'Alvito', 'Gavião', 'Sardoal', 'Corvo', 'Nordeste', 'Porto Moniz', 'Porto Santo', 'Peso da Régua',
  'Marco de Canaveses', 'Porto de Mós', 'Bombarral', 'Cartaxo',
]);
const FEMININE = new Set([
  'Maia', 'Amadora', 'Póvoa de Varzim', 'Póvoa de Lanhoso', 'Figueira da Foz', 'Figueira de Castelo Rodrigo', 'Covilhã', 'Guarda',
  'Lourinhã', 'Nazaré', 'Batalha', 'Moita', 'Mealhada', 'Trofa', 'Murtosa', 'Lousã', 'Ribeira Grande', 'Ribeira Brava', 'Calheta',
  'Horta', 'Madalena', 'Ponta do Sol', 'Golegã', 'Chamusca', 'Azambuja', 'Vidigueira', 'Mêda', 'Praia da Vitória', 'Lagoa',
  'Ponta Delgada', 'Vila da Praia da Vitória', 'Anadia', 'Sertã', 'Pampilhosa da Serra', 'Mealhada',
]);

// ["no", "Porto"], ["na", "Maia"], ["em", "Lisboa"]; sem sítio escolhido, ["em", "Portugal"].
export function placeParts(city: string): [string, string] {
  if (city === ALL) return ['em', 'Portugal'];
  if (MASCULINE.has(city)) return ['no', city];
  if (FEMININE.has(city)) return ['na', city];
  return ['em', city];
}

export const inPlace = (city: string) => placeParts(city).join(' ');

// Raio à volta do concelho escolhido (km; 0 = só o concelho). Definido pela App; os filtros de sítio usam inArea.

export const RADII = [0, 10, 20, 30, 40, 50, 60, 100];
const centers = CENTERS as unknown as Record<string, [number, number]>;
let radius = 0;
export const setAreaRadius = (km: number) => void (radius = km);
export const centerOf = (city: string) => centers[city] ?? null;

function km([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// O evento conta para o sítio escolhido: no próprio concelho ou, com raio, a essa distância do centro do concelho.
export function inArea(e: EventItem, city: string): boolean {
  if (city === ALL || e.city === city) return true;
  if (!radius) return false;
  const c = centers[city];
  const p: [number, number] | null = e.lat != null && e.lon != null ? [e.lon, e.lat] : centers[e.city];
  return !!c && !!p && km(c, p) <= radius;
}

// Caixa [oeste, sul, este, norte] do raio (para o mapa).
export function radiusBounds(city: string): [number, number, number, number] | null {
  const c = centers[city];
  if (!c || !radius) return null;
  const dLat = radius / 111, dLon = radius / (111 * Math.cos((c[1] * Math.PI) / 180));
  return [c[0] - dLon, c[1] - dLat, c[0] + dLon, c[1] + dLat];
}
