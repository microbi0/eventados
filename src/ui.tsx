import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpRight, CalendarDays, CalendarPlus, ChevronDown, Clock, Euro, Gift, MapPin, Navigation, Search, Ticket, X } from 'lucide-react';
import type { EventItem } from './types';
import { formatSpan, startMinutes } from './dates';
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

// Contorno de flor (círculo com 12 pétalas) para o selo "Grátis".
const FLOWER = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 240; i++) {
    const t = (i / 240) * Math.PI * 2;
    const rad = 44 + 6 * Math.cos(12 * t);
    pts.push(`${(50 + rad * Math.cos(t)).toFixed(2)},${(50 + rad * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();

export function FreeBadge({ small }: { small?: boolean }) {
  return (
    <span className={small ? 'free-badge small' : 'free-badge'} title="Entrada gratuita">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d={FLOWER} />
      </svg>
      <span>{small ? 'Free' : 'Grátis'}</span>
    </span>
  );
}

// Data e hora na mesma linha, cada uma com o seu ícone.
export function WhenRow({ e }: { e: EventItem }) {
  return (
    <p className="meta-row when">
      <CalendarDays size={16} strokeWidth={2.2} />
      <span>{formatSpan(e)}</span>
      {e.timesText && (
        <>
          <Clock size={16} strokeWidth={2.2} />
          <span>{e.timesText}</span>
        </>
      )}
    </p>
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
  // Na lista do mapa o dia já está escolhido: sem data nem hora.
  hideWhen?: boolean;
  onOpen: () => void;
}

export function EventCard({ e, labels, tag, showCity, active, index = 0, onOpen }: ItemProps) {
  const place = placeOf(e, showCity);
  return (
    <button className={active ? 'card on' : 'card'} onClick={onOpen} aria-pressed={active} style={stagger(index)}>
      <div className="media">
        {e.image ? <img src={e.image} alt="" loading="lazy" /> : <Placeholder id={tag} />}
        {e.isFree && <FreeBadge />}
      </div>
      <div className="body">
        <Tag id={tag} label={labels[tag] ?? 'Outros'} />
        <h3>{e.title}</h3>
        {place && <MetaRow icon={MapPin}>{place}</MetaRow>}
        <WhenRow e={e} />
      </div>
    </button>
  );
}

// Versão compacta (lista) usada quando o detalhe está aberto ao lado.
export function EventRow({ e, labels, tag, showCity, active, index = 0, hideWhen, onOpen }: ItemProps) {
  const { icon: Icon, color, ink } = styleOf(tag);
  const place = placeOf(e, showCity);
  return (
    <button className={active ? 'row on' : 'row'} onClick={onOpen} aria-pressed={active} style={stagger(index)}>
      <div className="row-thumb">
        {e.image ? <img src={e.image} alt="" loading="lazy" /> : <Placeholder id={tag} size={26} />}
        <span className="row-badge" style={{ background: color, color: ink }} title={labels[tag]}>
          <Icon size={13} />
        </span>
        {e.isFree && <FreeBadge small />}
      </div>
      <div className="row-body">
        <h3>{e.title}</h3>
        {!hideWhen && <p className="row-meta">
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
        </p>}
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

// Link do Google Calendar com o evento preenchido (o utilizador só carrega em "Guardar").
// Com hora conhecida: início a essa hora e 2 h de duração; sem hora: dia(s) inteiro(s).
export function googleCalendarUrl(e: EventItem): string {
  const day = e.dates?.[0] ?? e.startDate;
  const ymd = (s: string) => s.replace(/-/g, '');
  const minutes = startMinutes(e);
  let dates: string;
  if (minutes < 24 * 60) {
    const at = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
    const endDay = minutes + 120 >= 24 * 60 ? nextDay(day) : day;
    dates = `${ymd(day)}T${at(minutes)}/${ymd(endDay)}T${at((minutes + 120) % (24 * 60))}`;
  } else {
    // Datas de fim exclusivas no formato do Google.
    const last = e.dates?.length ? e.dates[0] : e.endDate;
    dates = `${ymd(day)}/${ymd(nextDay(last))}`;
  }
  const details = [e.subtitle, e.description?.slice(0, 600), e.price ? `Preço: ${e.price}` : null, `Mais informação: ${e.url}`].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates,
    ctz: 'Europe/Lisbon',
    details,
    location: [e.venue, e.address, e.city].filter(Boolean).join(', '),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

function Fact({ icon: Icon, label, wide, children }: { icon: typeof MapPin; label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'fact wide' : 'fact'}>
      <span className="fact-label">
        <Icon size={15} strokeWidth={2.2} />
        {label}
      </span>
      <span className="fact-value">{children}</span>
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
        {e.isFree && <FreeBadge />}
      </div>
      <div className="body">
        <div className="detail-tags">
          {e.categories.map((c) => (
            <Tag key={c} id={c} label={labels[c] ?? c} />
          ))}
        </div>
        <h2>{e.title}</h2>
        {e.subtitle && <p className="subtitle">{e.subtitle}</p>}
        <div className="facts">
          <Fact icon={CalendarDays} label="Data">
            {formatSpan(e)}
            {e.datesText && e.datesText !== formatSpan(e) && <small>{e.datesText}</small>}
          </Fact>
          {e.timesText && (
            <Fact icon={Clock} label="Hora">
              {e.timesText}
            </Fact>
          )}
          <Fact icon={Euro} label="Preço">
            {e.price ?? (e.isFree ? 'Entrada gratuita' : 'Ver no site')}
          </Fact>
          <Fact icon={MapPin} label="Local" wide>
            {e.venue ?? e.city}
            <small>
              {[e.address !== e.venue ? e.address : null, e.city, e.district && e.district !== e.city ? e.district : null].filter(Boolean).join(' · ')}
            </small>
          </Fact>
        </div>
        {e.description && <p className="desc">{e.description}</p>}
        <p className="source-note">Fonte: {e.sourceName}</p>
        <div className="actions">
          <a className="btn primary" href={e.url} target="_blank" rel="noreferrer">
            Ver mais <ArrowUpRight size={18} />
          </a>
          {ticketLinks.map((t) => (
            <a key={t.url} className="btn" href={t.url} target="_blank" rel="noreferrer">
              <Ticket size={18} /> {t.name}
            </a>
          ))}
          <a className="btn" href={googleCalendarUrl(e)} target="_blank" rel="noreferrer">
            <CalendarPlus size={18} /> Google Calendar
          </a>
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
