import { ALL } from './filters';

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
