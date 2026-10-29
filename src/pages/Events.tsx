import { Fragment, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Search, SlidersHorizontal, X } from 'lucide-react';
import type { EventItem, EventsData } from '../types';
import { DATE_RANGES, type DateRange, formatDay } from '../dates';
import { ALL, filterEvents } from '../filters';
import { CategoryChip, CategoryRow, DetailContent, EventCard, EventRow } from '../ui';
import { styleOf } from '../categories';
import { EventAdCard } from '../ads';

const PAGE = 30;

export interface EventsState {
  range: DateRange;
  setRange: (r: DateRange) => void;
  cats: string[];
  setCats: (c: string[] | ((cur: string[]) => string[])) => void;
  query: string;
  setQuery: (q: string) => void;
}

interface Props extends EventsState {
  data: EventsData;
  city: string;
  selected: EventItem | null;
  onSelect: (e: EventItem | null) => void;
  wide: boolean;
  sidebar: boolean;
}

// O filtro de gratuitos vive no header (App.tsx) e chega já aplicado aos dados.
export default function Events({ data, city, selected, onSelect, wide, sidebar, range, setRange, cats, setCats, query, setQuery }: Props) {
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [city, cats, range, query]);

  // Antes do filtro de tipo (para as contagens por tipo).
  const inScope = useMemo(() => filterEvents(data.events, { city, range, query }), [data, city, range, query]);
  const results = useMemo(() => (cats.length ? inScope.filter(({ e }) => e.categories.some((c) => cats.includes(c))) : inScope), [inScope, cats]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { e } of inScope) e.categories.forEach((k) => (c[k] = (c[k] ?? 0) + 1));
    return c;
  }, [inScope]);

  // Nas barras deslizantes (telemóvel), mantém visível a opção ativa.
  useEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>('.segmented .on, .chips .chip.on')) {
      const bar = el.parentElement!;
      bar.scrollTo({ left: Math.max(0, el.offsetLeft - bar.clientWidth / 2 + el.clientWidth / 2), behavior: 'smooth' });
    }
  }, [cats, range]);

  const toggleCat = (id: string) => setCats((cur) => (id === ALL ? [] : cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  const visibleCats = Object.entries(data.categories).filter(([id]) => counts[id] || cats.includes(id));
  const tagFor = (e: EventItem) => e.categories.find((c) => cats.includes(c)) ?? e.categories[0];
  const compact = !!selected && wide;

  const searchBox = (
    <label className="search">
      <Search size={18} />
      <input type="search" placeholder="Pesquisar evento, local, artista…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Pesquisar eventos" />
      {query && (
        <button onClick={() => setQuery('')} aria-label="Limpar pesquisa">
          <X size={16} />
        </button>
      )}
    </label>
  );

  const visible = results.slice(0, limit);
  const groups: { day: string; items: typeof visible }[] = [];
  for (const r of visible) {
    const last = groups[groups.length - 1];
    if (last && last.day === r.when) last.items.push(r);
    else groups.push({ day: r.when, items: [r] });
  }

  return (
    <div className={compact ? 'layout with-detail' : 'layout'}>
      {/* ---------- coluna 1: tipos ---------- */}
      {sidebar && (
        <aside className="filters" aria-label="Filtros">
          {searchBox}
          <div className="label-row">
            <p className="label">Tipo de evento</p>
            {cats.length > 0 && (
              <button className="link" onClick={() => setCats([])}>
                Limpar
              </button>
            )}
          </div>
          <ul className="cat-list">
            <li>
              <CategoryRow id={ALL} label="Todos os tipos" count={inScope.length} checked={!cats.length} onToggle={() => toggleCat(ALL)} />
            </li>
            {visibleCats.map(([id, label]) => (
              <li key={id}>
                <CategoryRow id={id} label={label} count={counts[id] ?? 0} checked={cats.includes(id)} onToggle={() => toggleCat(id)} />
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* ---------- coluna 2: datas + lista ---------- */}
      <main className="list-col">
        <section className="hero">
          <div className="when-bar">
            <div className={query.trim() ? 'segmented dim' : 'segmented'} role="tablist" aria-label="Quando" title={query.trim() ? 'A pesquisa procura em todas as datas' : undefined}>
              {DATE_RANGES.map((r) => (
                <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>
                  {r.label}
                  {range === r.id && <i className="dot" />}
                </button>
              ))}
            </div>
          </div>
          {!sidebar && searchBox}
          {!sidebar && (
            <div className="chips" aria-label="Tipo de evento">
              <CategoryChip id={ALL} label="Tudo" count={inScope.length} active={!cats.length} onClick={() => toggleCat(ALL)} />
              {visibleCats.map(([id, label]) => (
                <CategoryChip key={id} id={id} label={label} count={counts[id] ?? 0} active={cats.includes(id)} onClick={() => toggleCat(id)} />
              ))}
            </div>
          )}
          <p className="summary">
            <SlidersHorizontal size={15} />
            {results.length} {results.length === 1 ? 'evento' : 'eventos'}
            {query.trim() && <span className="summary-cat">em todas as datas</span>}
            {cats.map((c) => {
              const I = styleOf(c).icon;
              return (
                <span key={c} className="summary-cat">
                  <I size={13} /> {data.categories[c]}
                </span>
              );
            })}
            {query.trim() && cats.length > 0 && inScope.length > results.length && (
              <button className="link summary-more-cats" onClick={() => setCats([])} title="Ver eventos encontrados em todas as categorias">
                +{inScope.length - results.length} noutras categorias (mostrar todos)
              </button>
            )}
          </p>
        </section>

        {!results.length && <div className="state">Nenhum evento com estes filtros.</div>}

        {/* key muda com os filtros para reanimar a lista */}
        <div key={`${city}|${range}|${cats.join()}|${compact}`} className="results">
          {(() => {
            let totalRendered = 0;
            // Anúncios no meio da lista: depois do 6.º evento e depois a cada 12 (não só no fim de cada página).
            const AD_FIRST = 6;
            const AD_INTERVAL = 12;
            return groups.map((g, gi) => (
              <section key={g.day} className="day">
                {(query.trim() || (range !== 'today' && range !== 'tomorrow')) && (
                  <h2 style={{ ['--i' as string]: Math.min(gi, 6) }}>
                    <CalendarDays size={18} />
                    {formatDay(g.day)}
                  </h2>
                )}
                <div className={compact ? 'rows' : 'grid'}>
                  {g.items.map(({ e }, i) => {
                    const itemIndex = totalRendered++;
                    const n = itemIndex + 1;
                    const showAd = n >= AD_FIRST && (n - AD_FIRST) % AD_INTERVAL === 0;
                    const props = {
                      e,
                      labels: data.categories,
                      tag: tagFor(e),
                      showCity: city === ALL,
                      active: selected?.id === e.id,
                      index: i,
                      onOpen: () => onSelect(selected?.id === e.id ? null : e),
                    };
                    return (
                      <Fragment key={e.id}>
                        {compact ? <EventRow {...props} /> : <EventCard {...props} />}
                        {showAd && <EventAdCard compact={compact} index={itemIndex + 1} />}
                      </Fragment>
                    );
                  })}
                </div>
              </section>
            ));
          })()}
        </div>

        {limit < results.length && (
          <button className="more" onClick={() => setLimit(limit + PAGE)}>
            Ver mais <span>{results.length - limit}</span>
          </button>
        )}
      </main>

      {/* ---------- coluna 3: detalhe (só quando há um evento selecionado) ---------- */}
      {compact && (
        <aside className="detail-col" aria-label="Detalhe do evento">
          <DetailContent key={selected.id} e={selected} labels={data.categories} artists={data.artists} onClose={() => onSelect(null)} />
        </aside>
      )}
    </div>
  );
}
