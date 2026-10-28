import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Gift, Landmark, Search, Sparkles, Sun, CalendarRange } from 'lucide-react';
import type { EventItem, EventsData } from '../types';
import type { DateRange } from '../dates';
import { ALL, filterEvents, scoreEvent, topRelevant, type Hit } from '../filters';
import { inPlace } from '../places';
import Spotlight, { type Spot } from '../Spotlight';
import { EventCard, stagger } from '../ui';
import { styleOf } from '../categories';

interface Props {
  data: EventsData;
  city: string;
  onSelect: (e: EventItem) => void;
  // Abre a página Eventos com filtros pré-definidos.
  onExplore: (opts: { query?: string; range?: DateRange; cats?: string[]; freeOnly?: boolean }) => void;
}

const SUGGESTIONS = ['concerto', 'teatro', 'exposição', 'fado', 'stand-up', 'cinema'];

export default function Home({ data, city, onSelect, onExplore }: Props) {
  const [q, setQ] = useState('');
  const venueSources = useMemo(() => new Set(data.sources.filter((s) => s.kind === 'venue').map((s) => s.id)), [data]);

  const sections = useMemo(() => {
    const base = { city };
    const today = filterEvents(data.events, { ...base, range: 'today' });
    const weekend = filterEvents(data.events, { ...base, range: 'weekend' });
    const month = filterEvents(data.events, { ...base, range: 'month' });
    const venues = month.filter((h) => venueSources.has(h.e.source) || h.e.alsoAt?.some((a) => data.sources.some((s) => s.kind === 'venue' && s.name === a.name)));
    const free = filterEvents(data.events, { ...base, range: 'week', freeOnly: true });
    const counts: Record<string, number> = {};
    for (const { e } of month) e.categories.forEach((c) => (counts[c] = (counts[c] ?? 0) + 1));
    // Cada secção evita repetir eventos já mostrados nas anteriores.
    const shown = new Set<string>();
    const take = (hits: Hit[]) => {
      const top = topRelevant(hits, venueSources, 10, shown);
      top.forEach((h) => shown.add(h.e.id));
      return top;
    };
    // Slider: os 5 mais relevantes de hoje (no máximo 2 do mesmo tipo); se hoje houver poucos, completa com os próximos dias.
    let spotTitle = 'Em destaque hoje';
    let pool = today;
    if (topRelevant(today, venueSources, 5, new Set(), 2).length < 5) {
      pool = filterEvents(data.events, { ...base, range: 'week' });
      spotTitle = today.length ? 'Em destaque hoje e nos próximos dias' : 'Em destaque nos próximos dias';
    }
    const spots: Spot[] = topRelevant(pool, venueSources, 5, new Set(), 2).map(({ e }) => ({ e, reasons: scoreEvent(e, venueSources).reasons }));
    spots.forEach((s) => shown.add(s.e.id));
    return {
      spots,
      spotTitle,
      today: take(today),
      weekend: take(weekend),
      venues: take(venues),
      free: take(free),
      counts,
      monthTotal: month.length,
    };
  }, [data, city, venueSources]);

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    onExplore({ query: q.trim(), range: 'all' });
  };

  return (
    <div className="home">
      <section className="home-hero">
        <p className="eyebrow">
          <Sparkles size={16} /> {sections.monthTotal} eventos nos próximos 30 dias
        </p>
        <h1>O que fazer {inPlace(city)}?</h1>
        <form className="big-search" onSubmit={submit} role="search">
          <Search size={22} />
          <input type="search" placeholder="Concertos, peças, exposições, artistas…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar eventos" />
          <button type="submit">
            Procurar <ArrowRight size={18} />
          </button>
        </form>
        <div className="suggestions">
          {SUGGESTIONS.map((s, i) => (
            <button key={s} style={stagger(i)} onClick={() => onExplore({ query: s, range: 'all' })}>
              {s}
            </button>
          ))}
        </div>
      </section>

      <Spotlight spots={sections.spots} labels={data.categories} title={sections.spotTitle} onOpen={onSelect} />

      <section className="home-cats">
        {Object.entries(data.categories)
          .filter(([id]) => sections.counts[id] && id !== 'outros')
          .map(([id, label], i) => {
            const { icon: Icon, color, ink } = styleOf(id);
            return (
              <button key={id} className="cat-tile" style={{ ...stagger(i), background: color, color: ink }} onClick={() => onExplore({ cats: [id], range: 'month' })}>
                <Icon size={26} strokeWidth={1.8} />
                <span>{label}</span>
                <small>{sections.counts[id]}</small>
              </button>
            );
          })}
      </section>

      <Shelf title="Hoje" icon={Sun} hits={sections.today} data={data} city={city} onSelect={onSelect} onMore={() => onExplore({ range: 'today' })} />
      <Shelf title="Este fim de semana" icon={CalendarRange} hits={sections.weekend} data={data} city={city} onSelect={onSelect} onMore={() => onExplore({ range: 'weekend' })} />
      <Shelf title="Nas salas de espetáculos" icon={Landmark} hits={sections.venues} data={data} city={city} onSelect={onSelect} onMore={() => onExplore({ range: 'month', cats: ['teatro', 'danca', 'humor', 'musica'] })} />
      <Shelf title="Gratuitos esta semana" icon={Gift} hits={sections.free} data={data} city={city} onSelect={onSelect} onMore={() => onExplore({ range: 'week', freeOnly: true })} />
    </div>
  );
}

function Shelf({
  title,
  icon: Icon,
  hits,
  data,
  city,
  onSelect,
  onMore,
}: {
  title: string;
  icon: typeof Sun;
  hits: Hit[];
  data: EventsData;
  city: string;
  onSelect: (e: EventItem) => void;
  onMore: () => void;
}) {
  if (!hits.length) return null;
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>
          <Icon size={22} />
          {title}
        </h2>
        <button className="link-btn" onClick={onMore}>
          Ver todos <ArrowRight size={16} />
        </button>
      </div>
      <div className="shelf-track">
        {hits.map(({ e }, i) => (
          <EventCard key={e.id} e={e} labels={data.categories} tag={e.categories[0]} showCity={city === ALL} index={i} onOpen={() => onSelect(e)} />
        ))}
      </div>
    </section>
  );
}
