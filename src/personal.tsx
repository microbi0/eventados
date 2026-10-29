import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { EventItem } from './types';
import { usePersisted } from './hooks';
import { iso } from './dates';
import { inPlace } from './places';

// "Os meus eventos": tudo guardado só neste dispositivo (localStorage), sem contas nem servidor.
// - guardados: cópia do evento, para continuar visível mesmo que saia da agenda;
// - preferências: sítios e tipos a mostrar (só estes) ou a esconder, aplicados ao site inteiro;
// - histórico: eventos abertos e guardados, base das sugestões.
export interface Prefs {
  cities: string[];
  cats: string[];
  hideCities: string[];
  hideCats: string[];
}
type Visit = { t: number; w: number; cats: string[]; city: string; venue: string | null };

const NO_PREFS: Prefs = { cities: [], cats: [], hideCities: [], hideCats: [] };
const DAY = 86400000;
const HISTORY_MAX = 300;
// O interesse antigo pesa menos: metade a cada 21 dias, esquecido ao fim de 120.
const HALF_LIFE = 21 * DAY;
const FORGET = 120 * DAY;

interface Personal {
  saved: Record<string, EventItem>;
  isSaved: (id: string) => boolean;
  toggleSave: (e: EventItem) => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  hasPrefs: boolean;
  visit: (e: EventItem) => void;
  history: Visit[];
  clearHistory: () => void;
}

const Ctx = createContext<Personal | null>(null);

export function PersonalProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = usePersisted<Record<string, EventItem>>('saved', {});
  const [prefs, setPrefs] = usePersisted<Prefs>('prefs', NO_PREFS);
  const [history, setHistory] = usePersisted<Visit[]>('history', []);

  const remember = useCallback(
    (e: EventItem, w: number) =>
      setHistory((h) => [...h.filter((v) => Date.now() - v.t < FORGET).slice(-(HISTORY_MAX - 1)), { t: Date.now(), w, cats: e.categories, city: e.city, venue: e.venue }]),
    [setHistory],
  );

  const toggleSave = useCallback(
    (e: EventItem) => {
      if (!saved[e.id]) remember(e, 3);
      setSaved((s) => {
        const { [e.id]: was, ...rest } = s;
        return was ? rest : { ...s, [e.id]: e };
      });
    },
    [saved, setSaved, remember],
  );

  const value = useMemo<Personal>(
    () => ({
      saved,
      isSaved: (id) => !!saved[id],
      toggleSave,
      prefs: { ...NO_PREFS, ...prefs },
      setPrefs,
      hasPrefs: Object.values({ ...NO_PREFS, ...prefs }).some((l) => l.length),
      visit: (e) => remember(e, 1),
      history,
      clearHistory: () => setHistory([]),
    }),
    [saved, toggleSave, prefs, setPrefs, remember, history, setHistory],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePersonal() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePersonal fora do PersonalProvider');
  return v;
}

// Aplica as preferências: com sítios/tipos escolhidos fica só isso; os escondidos desaparecem sempre.
export function applyPrefs(events: EventItem[], p: Prefs): EventItem[] {
  const only = new Set(p.cities), cats = new Set(p.cats), hideC = new Set(p.hideCities), hideT = new Set(p.hideCats);
  if (!only.size && !cats.size && !hideC.size && !hideT.size) return events;
  return events.filter(
    (e) =>
      (!only.size || only.has(e.city)) &&
      !hideC.has(e.city) &&
      (!cats.size || e.categories.some((c) => cats.has(c))) &&
      !e.categories.some((c) => hideT.has(c)),
  );
}

export type Suggestion = { e: EventItem; score: number; why: string };

// Sugestões: interesse recente por tipos, sítios e salas (abertos pesam 1, guardados 3, com decaimento no tempo),
// aplicado aos eventos dos próximos 60 dias que ainda não foram guardados.
export function suggest(events: EventItem[], history: Visit[], saved: Record<string, EventItem>, labels: Record<string, string>, n = 12): Suggestion[] {
  const now = Date.now();
  const cat = new Map<string, number>(), city = new Map<string, number>(), venue = new Map<string, number>();
  const add = (m: Map<string, number>, k: string | null, w: number) => k && m.set(k, (m.get(k) ?? 0) + w);
  for (const v of history) {
    const age = now - v.t;
    if (age > FORGET) continue;
    const w = v.w * Math.pow(0.5, age / HALF_LIFE);
    v.cats.forEach((c) => add(cat, c, w / v.cats.length));
    add(city, v.city, w);
    add(venue, v.venue, w);
  }
  if (!cat.size) return [];
  const total = [...cat.values()].reduce((a, b) => a + b, 0);
  const totalCity = [...city.values()].reduce((a, b) => a + b, 0);
  const today = iso(new Date());
  const until = iso(new Date(now + 60 * DAY));

  const out: Suggestion[] = [];
  for (const e of events) {
    if (saved[e.id] || e.endDate < today || e.startDate > until) continue;
    const c = Math.max(0, ...e.categories.map((k) => (cat.get(k) ?? 0) / total));
    if (!c) continue;
    const p = (city.get(e.city) ?? 0) / totalCity;
    const s = venue.get(e.venue ?? '') ?? 0;
    // Mais perto no tempo conta um pouco mais.
    const soon = 1 - Math.min(1, (Date.parse(e.startDate > today ? e.startDate : today) - now) / (60 * DAY)) * 0.3;
    const score = (c * 2 + p + Math.min(s, 3) * 0.4 + (e.image ? 0.1 : 0)) * soon;
    const topCat = e.categories.reduce((a, b) => ((cat.get(b) ?? 0) > (cat.get(a) ?? 0) ? b : a));
    const why = s >= 1 && e.venue ? 'Já viste eventos desta sala' : p > 0.2 ? `${labels[topCat] ?? topCat} ${inPlace(e.city)}` : `Porque gostas de ${(labels[topCat] ?? topCat).toLowerCase()}`;
    out.push({ e, score, why });
  }
  out.sort((a, b) => b.score - a.score);
  // Variedade: no máximo 2 do mesmo título e 4 da mesma sala.
  const byTitle = new Map<string, number>(), byVenue = new Map<string, number>();
  return out
    .filter(({ e }) => {
      const t = e.title.toLowerCase();
      const ok = (byTitle.get(t) ?? 0) < 2 && (byVenue.get(e.venue ?? e.id) ?? 0) < 4;
      if (ok) {
        byTitle.set(t, (byTitle.get(t) ?? 0) + 1);
        byVenue.set(e.venue ?? e.id, (byVenue.get(e.venue ?? e.id) ?? 0) + 1);
      }
      return ok;
    })
    .slice(0, n);
}
