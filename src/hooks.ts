import { useEffect, useState } from 'react';

export function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* armazenamento indisponível */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export type Page = 'home' | 'eventos' | 'mapa' | 'sobre';
const PAGES: Page[] = ['home', 'eventos', 'mapa', 'sobre'];

// Navegação por hash (#/eventos): funciona igual no GitHub Pages e dentro da app Android.
export function useHashPage(): [Page, (p: Page) => void] {
  const read = (): Page => {
    const p = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Page;
    return PAGES.includes(p) ? p : 'home';
  };
  const [page, setPage] = useState<Page>(read);
  useEffect(() => {
    const onHash = () => setPage(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (p: Page) => {
    if (p !== page) window.location.hash = `/${p === 'home' ? '' : p}`;
    window.scrollTo({ top: 0 });
  };
  return [page, go];
}
