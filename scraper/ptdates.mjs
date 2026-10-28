// Interpreta datas escritas em português: "05 e 06 Mar 2027", "13 Out a 22 Nov 2026",
// "29 E 30 JAN 2027", "2026/11/26", "Até 30 Nov". Devolve { start, end } em YYYY-MM-DD.
import { slugify } from './categories.mjs';

const MONTHS = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

const pad = (n) => String(n).padStart(2, '0');

export function parsePtDateRange(text, today = new Date()) {
  const s = slugify(text)
    .replace(/\b\d{1,2}h\d{0,2}\b/gi, ' ')
    .replace(/[,;]/g, ' ')
    .replace(/ /g, ' ');
  const iso = [...s.matchAll(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g)].map((m) => `${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  if (iso.length) return { start: iso[0], end: iso[iso.length - 1] };

  const dmy = [...s.matchAll(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g)].map((m) => `${m[3]}-${pad(m[2])}-${pad(m[1])}`);
  if (dmy.length) return { start: dmy[0], end: dmy[dmy.length - 1] };

  // Tokens: dia [mês] [ano]
  const parts = [...s.matchAll(/(\d{1,2})(?:\s*(?:de\s+)?([a-z]{3,9})\.?)?(?:\s*(?:de\s+)?(\d{4}))?/g)]
    .map((m) => ({ d: Number(m[1]), m: MONTHS[m[2]] ?? null, y: m[3] ? Number(m[3]) : null }))
    .filter((p) => p.d >= 1 && p.d <= 31);
  if (!parts.length) return null;

  // Propaga mês e ano da direita para a esquerda ("5 e 6 mar 2027").
  for (let i = parts.length - 2; i >= 0; i--) {
    parts[i].m ??= parts[i + 1].m;
    parts[i].y ??= parts[i + 1].y;
  }
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first.m || !last.m) return null;

  // Sem ano: assume o próximo ano em que a data ainda não passou (com margem de 2 meses).
  const guessYear = (m) => {
    const y = today.getFullYear();
    return m < today.getMonth() + 1 - 2 ? y + 1 : y;
  };
  last.y ??= guessYear(last.m);
  first.y ??= first.m > last.m ? last.y - 1 : last.y;

  const end = `${last.y}-${pad(last.m)}-${pad(last.d)}`;
  // "Até 30 nov": decorre desde já até essa data.
  if (/^\s*ate\b/.test(s)) return { start: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`, end };
  return { start: `${first.y}-${pad(first.m)}-${pad(first.d)}`, end };
}
