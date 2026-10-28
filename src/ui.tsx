import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpRight, Building2, CalendarDays, ChevronDown, Clock, Euro, Gift, MapPin, Navigation, Search, Ticket, X } from 'lucide-react';
import type { EventItem } from './types';
import { formatSpan } from './dates';
import { styleOf } from './categories';
import { ALL, normalize } from './filters';

export type City = { name: string; n: number; district: string | null };

// Índice para animações em cascata (limitado para não atrasar listas longas).
export const stagger = (i: number): CSSProperties => ({ ['--i' as string]: Math.min(i, 12) });

export function Tag({ id, label }: { id: string; label: string }) {
  const { icon: Icon, color, ink } = styleOf(id);
  return (
    <span className="tag" style={{ background: color, color: ink }}>
      <Icon size={14} />
      {label}
    </span>
  );
}

export function FreeTag() {
  return (
    <span className="tag light">
      <Gift size={14} />
      Entrada gratuita
    </span>
  );
}

export function Placeholder({ id, size = 56 }: { id: string; size?: number }) {
  const { icon: Icon, color, ink } = styleOf(id);
  return (
    <div className="noimg" style={{ background: color, color: ink }}>
      <Icon size={size} strokeWidth={1.5} />
    </div>
  );
}

export function MetaRow({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return (
    <p className="meta-row">
      <Icon size={16} strokeWidth={2.2} />
      <span>{children}</span>
    </p>
  );
}

const placeOf = (e: EventItem, showCity: boolean) => [e.venue, showCity || !e.venue ? e.city : null].filter(Boolean).join(' / ');

interface ItemProps {
  e: EventItem;
  labels: Record<string, string>;
  tag: string;
  showCity: boolean;
  active?: boolean;
  index?: number;
  onOpen: () => void;
}

export function EventCard({ e, labels, tag, showCity, active, index = 0, onOpen }: ItemProps) {
  const place = placeOf(e, showCity);
  return (
    <button className={active ? 'card on' : 'card'} onClick={onOpen} aria-pressed={active} style={stagger(index)}>
      <div className="media">
        {e.image ? <img src={e.image} alt="" loading="lazy" /> : <Placeholder id={tag} />}
        <div className="tags">
          <Tag id={tag} label={labels[tag] ?? 'Outros'} />
          {e.isFree && <FreeTag />}
        </div>
      </div>
      <div className="body">
        {place && <MetaRow icon={MapPin}>{place}</MetaRow>}
        <MetaRow icon={CalendarDays}>{formatSpan(e)}</MetaRow>
        {e.timesText && <MetaRow icon={Clock}>{e.timesText}</MetaRow>}
        <h3>{e.title}</h3>
        {e.subtitle && <p className="subtitle">{e.subtitle}</p>}
      </div>
    </button>
  );
}

// Versão compacta (lista) usada quando o detalhe está aberto ao lado.
export function EventRow({ e, labels, tag, showCity, active, index = 0, onOpen }: ItemProps) {
  const { icon: Icon, color, ink } = styleOf(tag);
  const place = placeOf(e, showCity);
  return (
    <button className={active ? 'row on' : 'row'} onClick={onOpen} aria-pressed={active} style={stagger(index)}>
      <div className="row-thumb">
        {e.image ? <img src={e.image} alt="" loading="lazy" /> : <Placeholder id={tag} size={26} />}
        <span className="row-badge" style={{ background: color, color: ink }} title={labels[tag]}>
          <Icon size={13} />
        </span>
      </div>
      <div className="row-body">
        <h3>{e.title}</h3>
        <p className="row-meta">
          <span>
            <CalendarDays size={14} />
            {formatSpan(e)}
          </span>
          {e.timesText && (
            <span>
              <Clock size={14} />
              {e.timesText}
            </span>
          )}
        </p>
        {place && (
          <p className="row-meta">
            <span>
              <MapPin size={14} />
              {place}
            </span>
          </p>
        )}
      </div>
    </button>
  );
}

export function CategoryRow({ id, label, count, checked, onToggle }: { id: string; label: string; count: number; checked: boolean; onToggle: () => void }) {
  const { icon: Icon, color, ink } = styleOf(id);
  return (
    <button className={checked ? 'cat-row on' : 'cat-row'} onClick={onToggle} aria-pressed={checked} style={{ ['--cat' as string]: color, ['--ink' as string]: ink }}>
      <span className="cat-icon">
        <Icon size={16} />
      </span>
      <span className="cat-name">{label}</span>
      <span className="count">{count}</span>
    </button>
  );
}

export function CategoryChip({ id, label, count, active, onClick }: { id: string; label: string; count?: number; active: boolean; onClick: () => void }) {
  const { icon: Icon, color, ink } = styleOf(id);
  return (
    <button className={active ? 'chip on' : 'chip'} style={active ? { background: color, color: ink, borderColor: color } : undefined} onClick={onClick}>
      <Icon size={15} />
      {label}
      {count != null && <span className="count">{count}</span>}
      {active && <i className="dot" />}
    </button>
  );
}

export function CityList({ cities, total, current, onPick, autoFocus }: { cities: City[]; total: number; current: string; onPick: (c: string) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const list = cities.filter((c) => normalize(`${c.name} ${c.district ?? ''}`).includes(normalize(q)));
  return (
    <div className="city-list">
      <label className="search">
        <Search size={18} />
        <input autoFocus={autoFocus} type="search" placeholder="Procurar concelho ou distrito…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ul>
        {!q && (
          <li>
            <button className={current === ALL ? 'on' : ''} onClick={() => onPick(ALL)}>
              <MapPin size={16} />
              <span>Todo o país</span>
              <small>{total}</small>
            </button>
          </li>
        )}
        {list.map((c) => (
          <li key={c.name}>
            <button className={current === c.name ? 'on' : ''} onClick={() => onPick(c.name)}>
              <MapPin size={16} />
              <span>
                {c.name}
                {c.district && c.district !== c.name && <em>{c.district}</em>}
              </span>
              <small>{c.n}</small>
            </button>
          </li>
        ))}
        {!list.length && <li className="empty">Sem eventos nesse sítio.</li>}
      </ul>
    </div>
  );
}

// Seletor de sítio do header: botão que abre uma lista pesquisável.
export function CityDropdown({ cities, total, current, label, onPick }: { cities: City[]; total: number; current: string; label: string; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  return (
    <div className="city-dropdown" ref={ref}>
      <button className={open ? 'city-select open' : 'city-select'} onClick={() => setOpen(!open)} aria-expanded={open}>
        <MapPin size={17} strokeWidth={2.2} />
        <span>{label}</span>
        <ChevronDown size={17} />
      </button>
      {open && (
        <div className="popover">
          <CityList
            cities={cities}
            total={total}
            current={current}
            autoFocus
            onPick={(c) => {
              setOpen(false);
              onPick(c);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function Sheet({ className, label, onClose, children }: { className: string; label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`sheet ${className}`} onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function DetailContent({ e, labels, onClose }: { e: EventItem; labels: Record<string, string>; onClose: () => void }) {
  const mapsUrl =
    e.lat != null && e.lon != null
      ? `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`
      : e.venue
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.venue}, ${e.address ?? ''} ${e.city}`)}`
        : null;
  const ticketLinks = [
    ...(e.tickets && e.tickets !== e.url ? [{ name: 'Bilhetes', url: e.tickets }] : []),
    ...(e.alsoAt ?? []).map((a) => ({ name: a.name, url: a.url })),
  ];

  return (
    <article className="detail-content">
      <button className="icon-btn close" onClick={onClose} aria-label="Fechar">
        <X size={20} />
      </button>
      <div className="media">
        {e.image ? <img src={e.image} alt="" /> : <Placeholder id={e.categories[0]} />}
        <div className="tags">
          {e.categories.map((c) => (
            <Tag key={c} id={c} label={labels[c] ?? c} />
          ))}
          {e.isFree && <FreeTag />}
        </div>
      </div>
      <div className="body">
        <h2>{e.title}</h2>
        {e.subtitle && <p className="subtitle">{e.subtitle}</p>}
        <div className="facts">
          <MetaRow icon={CalendarDays}>{e.datesText || formatSpan(e)}</MetaRow>
          {e.timesText && <MetaRow icon={Clock}>{e.timesText}</MetaRow>}
          <MetaRow icon={MapPin}>
            {e.venue && <strong>{e.venue}</strong>}
            {e.venue && <br />}
            {e.address && e.address !== e.venue && (
              <>
                {e.address}
                <br />
              </>
            )}
            {e.city}
            {e.district && e.district !== e.city ? ` · ${e.district}` : ''}
          </MetaRow>
          {(e.price || e.isFree) && <MetaRow icon={Euro}>{e.price ?? 'Entrada gratuita'}</MetaRow>}
          <MetaRow icon={Building2}>Fonte: {e.sourceName}</MetaRow>
        </div>
        {e.description && <p className="desc">{e.description}</p>}
        <div className="actions">
          <a className="btn primary" href={e.url} target="_blank" rel="noreferrer">
            Ver mais <ArrowUpRight size={18} />
          </a>
          {ticketLinks.map((t) => (
            <a key={t.url} className="btn" href={t.url} target="_blank" rel="noreferrer">
              <Ticket size={18} /> {t.name}
            </a>
          ))}
          {mapsUrl && (
            <a className="btn" href={mapsUrl} target="_blank" rel="noreferrer">
              <Navigation size={18} /> Como chegar
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
