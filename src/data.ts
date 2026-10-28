import type { EventsData } from './types';

// VITE_DATA_URL aponta para o events.json publicado (ex.: GitHub Pages), para que a app Android
// receba eventos novos sem ser reinstalada. O ficheiro incluído na build serve de reserva.
const REMOTE = import.meta.env.VITE_DATA_URL as string | undefined;
const BUNDLED = './data/events.json';

async function get(url: string): Promise<EventsData> {
  const cacheBust = url.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
  const res = await fetch(`${url}${cacheBust}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function loadEvents(): Promise<EventsData> {
  if (REMOTE) {
    try {
      return await get(REMOTE);
    } catch (err) {
      console.warn('Falha ao obter eventos remotos, a usar cópia local', err);
    }
  }
  return get(BUNDLED);
}
