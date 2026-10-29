import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import type { Page } from './hooks';

export type NavItem = { id: Page; label: string; icon: LucideIcon };

// Ordem em que os itens saem do menu quando falta espaço (os restantes ficam num chevron).
const HIDE_ORDER: Page[] = ['sobre', 'mapa', 'meus', 'artistas', 'eventos'];
const CHEVRON = 52;

export default function Nav({ items, page, go }: { items: NavItem[]; page: Page; go: (p: Page) => void }) {
  const ref = useRef<HTMLElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<Page[]>([]);
  const [open, setOpen] = useState(false);
  // Pill que desliza por trás do item ativo (ou do chevron, se o ativo estiver escondido).
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  // Mede a largura de cada item numa cópia invisível e esconde, pela ordem, até caber.
  useLayoutEffect(() => {
    const nav = ref.current;
    const box = measure.current;
    if (!nav || !box) return;
    const fit = () => {
      const widths = new Map(items.map((it, i) => [it.id, (box.children[i] as HTMLElement).offsetWidth + 4]));
      const avail = nav.clientWidth;
      let total = [...widths.values()].reduce((a, b) => a + b, 0);
      const out: Page[] = [];
      for (const id of HIDE_ORDER) {
        if (total + (out.length ? CHEVRON : 0) <= avail) break;
        total -= widths.get(id) ?? 0;
        out.push(id);
      }
      setHidden((h) => (h.join() === out.join() ? h : out));
      place();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(nav);
    fit();
    return () => ro.disconnect();
  }, [items]);

  const place = () => {
    const el = buttons.current.get(hiddenRef.current.includes(pageRef.current) ? 'more' : pageRef.current);
    const nav = ref.current;
    setPill(el && nav ? { x: el.getBoundingClientRect().left - nav.getBoundingClientRect().left, w: el.offsetWidth } : null);
  };
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const pageRef = useRef(page);
  pageRef.current = page;
  useLayoutEffect(place, [page, hidden]);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => ref.current && !ref.current.contains(ev.target as Node) && setOpen(false);
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const button = ({ id, label, icon: Icon }: NavItem, inMenu = false) => (
    <button
      key={id}
      ref={(el) => void (inMenu ? null : buttons.current.set(id, el))}
      className={page === id ? 'on' : ''}
      onClick={() => {
        setOpen(false);
        go(id);
      }}
      aria-current={page === id ? 'page' : undefined}
    >
      <Icon size={17} />
      {label}
    </button>
  );
  const more = items.filter((it) => hidden.includes(it.id));

  return (
    <nav className="nav" aria-label="Menu" ref={ref}>
      <div className="nav-measure" ref={measure} aria-hidden="true">
        {items.map(({ id, label, icon: Icon }) => (
          <button key={id} tabIndex={-1}>
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {pill && <span className="nav-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden="true" />}
      {items.filter((it) => !hidden.includes(it.id)).map((it) => button(it))}
      {more.length > 0 && (
        <div className="nav-more">
          <button
            ref={(el) => void buttons.current.set('more', el)}
            className={more.some((it) => it.id === page) ? 'on' : ''}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="Mais opções do menu"
          >
            <ChevronDown size={18} className={open ? 'flip' : ''} />
          </button>
          {open && <div className="popover nav-popover">{more.map((it) => button(it, true))}</div>}
        </div>
      )}
    </nav>
  );
}
