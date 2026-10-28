import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronDown, Gift, Landmark, Search, Sun, CalendarRange } from 'lucide-react';
import type { EventItem, EventsData } from '../types';
import type { DateRange } from '../dates';
import { ALL, filterEvents, scoreEvent, topRelevant, type Hit } from '../filters';
import { placeParts } from '../places';
import Spotlight, { useTone, type Spot } from '../Spotlight';
import { EventCard, stagger } from '../ui';
import { styleOf } from '../categories';
import { HomeAdBanner } from '../ads';

interface Props {
  data: EventsData;
  city: string;
  onSelect: (e: EventItem) => void;
  onPickPlace: () => void;
  // Abre a página Eventos com filtros pré-definidos.
  onExplore: (opts: { query?: string; range?: DateRange; cats?: string[]; freeOnly?: boolean }) => void;
}

export default function Home({ data, city, onSelect, onPickPlace, onExplore }: Props) {
  const [q, setQ] = useState('');
  // Destaque ativo no slider: a sua imagem desfocada é o fundo do topo da página.
  const [active, setActive] = useState<EventItem | null>(null);
  const onActive = useCallback((e: EventItem) => setActive(e), []);
  const tone = useTone(active);
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
    // Slider: os 5 mais relevantes dos próximos 7 dias (no máximo 2 do mesmo tipo).
    const week = filterEvents(data.events, { ...base, range: 'week' });
    const spots: Spot[] = topRelevant(week, venueSources, 5, new Set(), Infinity, 1).map(({ e }) => ({ e, reasons: scoreEvent(e, venueSources).reasons }));
    spots.forEach((s) => shown.add(s.e.id));
    return {
      spots,
      today: take(today),
      weekend: take(weekend),
      venues: take(venues),
      free: take(free),
      counts,
    };
  }, [data, city, venueSources]);

  const place = placeParts(city);

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    onExplore({ query: q.trim(), range: 'all' });
  };

  return (
    <div className="home">
      <div
        className={`home-top ${tone && !tone.dark ? 'light' : 'dark'}`}
        style={{ ['--tone' as string]: tone ? tone.rgb.join(' ') : '40 40 40' }}
      >
        {/* fundo: a imagem do destaque ativo, desfocada, com rampas até à cor da página */}
        <div className="home-backdrop" aria-hidden="true">
          {active?.image && <img key={active.id} src={active.image} alt="" />}
        </div>
        <section className="home-hero">
          <h1>
            O que fazer {place[0]}{' '}
            <button className="place-btn" onClick={onPickPlace} aria-label={`Mudar de sítio (atual: ${place[1]})`}>
              {place[1]}
              <ChevronDown className="place-chevron" strokeWidth={3} />
            </button>
            ?
          </h1>
          <form className="big-search" onSubmit={submit} role="search">
            <Search size={22} />
            <input type="search" placeholder="Concertos, peças, exposições, artistas…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar eventos" />
            <button type="submit">
              Procurar <ArrowRight size={18} />
            </button>
          </form>
        </section>

        <Spotlight spots={sections.spots} title="Destaques" onOpen={onSelect} onActive={onActive} />
      </div>

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

      {/* Banner de anúncio Google Ads na Home entre as categorias e as secções */}
      <HomeAdBanner />

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
