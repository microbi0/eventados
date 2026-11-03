import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Landmark, MapPinned, Search } from 'lucide-react';
import type { EventsData } from '../types';
import { computePropagation } from '../Footer';
import { normalize } from '../filters';
import { stagger } from '../ui';

type MapData = {
  width: number;
  height: number;
  boxes: { label: string; x: number; y: number; w: number; h: number }[];
  items: { name: string; district: string; region: string; d: string; c: [number, number] }[];
};
type Venue = { name: string; events: number };
type Place = { city: string; district: string; events: number; venues: Venue[] };

// Municípios com eventos e as salas de cada um, a partir da agenda atual.
function placesOf(data: EventsData): Place[] {
  const byCity = new Map<string, { district: string; events: number; venues: Map<string, Venue> }>();
  for (const e of data.events) {
    const city = e.city?.trim();
    if (!city) continue;
    const p = byCity.get(city) ?? { district: e.district ?? '', events: 0, venues: new Map() };
    p.events++;
    if (!p.district && e.district) p.district = e.district;
    const venue = e.venue?.trim();
    if (venue) {
      const key = venue.toLowerCase().replace(/\s+/g, ' ');
      const v = p.venues.get(key) ?? { name: venue, events: 0 };
      v.events++;
      p.venues.set(key, v);
    }
    byCity.set(city, p);
  }
  return [...byCity].map(([city, p]) => ({
    city,
    district: p.district,
    events: p.events,
    venues: [...p.venues.values()].sort((a, b) => b.events - a.events || a.name.localeCompare(b.name, 'pt')),
  }));
}

export default function Coverage({ data, onPickCity }: { data: EventsData; onPickCity: (city: string) => void }) {
  const stats = useMemo(() => computePropagation(data), [data]);
  const places = useMemo(() => placesOf(data), [data]);
  const byCity = useMemo(() => new Map(places.map((p) => [p.city, p])), [places]);
  const [map, setMap] = useState<MapData | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const cards = useRef(new Map<string, HTMLElement | null>());

  // O desenho do mapa (~140 KB) só é carregado quando se abre esta página.
  useEffect(() => {
    import('../data/pt-map.json').then((m) => setMap(m.default as MapData));
  }, []);

  // O distrito do mapa é o oficial; os eventos às vezes não o trazem.
  const districtOf = useMemo(() => new Map(map?.items.map((it) => [it.name, it.district]) ?? []), [map]);
  const maxVenues = Math.max(1, ...places.map((p) => p.venues.length));

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    const out = new Map<string, Place[]>();
    for (const p of places) {
      if (q && !normalize(p.city).includes(q) && !p.venues.some((v) => normalize(v.name).includes(q))) continue;
      const d = districtOf.get(p.city) || p.district || 'Outros';
      out.set(d, [...(out.get(d) ?? []), p]);
    }
    return [...out]
      .map(([district, list]) => [district, list.sort((a, b) => a.city.localeCompare(b.city, 'pt'))] as const)
      .sort(([a], [b]) => a.localeCompare(b, 'pt'));
  }, [places, districtOf, query]);

  const pick = (city: string) => {
    if (!byCity.has(city)) return;
    setPicked(city);
    setQuery('');
    window.setTimeout(() => cards.current.get(city)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const shown = hover ?? picked;
  const info = shown ? byCity.get(shown) : null;

  return (
    <div className="coverage">
      <section className="coverage-hero">
        <p className="eyebrow">Cobertura</p>
        <h1>Municípios e salas</h1>
        <p className="lead">
          Todos os concelhos e espaços com eventos na agenda neste momento. Toca num concelho do mapa para ver as salas que lá tens.
        </p>
        <div className="stats">
          <div style={stagger(0)}>
            <strong>
              {stats.municipios}/{stats.totalMunicipios}
            </strong>
            <span>municípios</span>
          </div>
          <div style={stagger(1)}>
            <strong>{stats.salas.toLocaleString('pt-PT')}</strong>
            <span>salas e espaços</span>
          </div>
          <div style={stagger(2)}>
            <strong>{stats.coveragePct}%</strong>
            <span>do país</span>
          </div>
        </div>
      </section>

      <div className="coverage-body">
        <div className="coverage-map">
          {map ? (
            <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label="Mapa de Portugal com os concelhos que têm eventos">
              {map.boxes.map((b) => (
                <g key={b.label} className="map-box">
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} />
                  <text x={b.x + 10} y={b.y + 16}>
                    {b.label}
                  </text>
                </g>
              ))}
              {map.items.map((it) => {
                const p = byCity.get(it.name);
                const level = p ? 0.3 + 0.7 * Math.sqrt(p.venues.length / maxVenues) : 0;
                const cls = ['muni', p ? 'has' : '', it.name === shown ? 'on' : ''].join(' ');
                return (
                  <path
                    key={it.name}
                    d={it.d}
                    className={cls}
                    style={p ? { ['--lvl' as string]: level } : undefined}
                    onMouseEnter={() => setHover(it.name)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => pick(it.name)}
                  >
                    <title>{p ? `${it.name} · ${p.venues.length} salas · ${p.events} eventos` : `${it.name} · sem eventos`}</title>
                  </path>
                );
              })}
            </svg>
          ) : (
            <div className="coverage-map-loading">
              <span className="loader" />
            </div>
          )}
          <div className="coverage-tip" aria-live="polite">
            {info ? (
              <>
                <strong>{info.city}</strong>
                <span>
                  {info.venues.length} {info.venues.length === 1 ? 'sala' : 'salas'} · {info.events} eventos
                </span>
              </>
            ) : shown ? (
              <>
                <strong>{shown}</strong>
                <span>ainda sem eventos</span>
              </>
            ) : (
              <span>
                <MapPinned size={15} /> Passa ou toca num concelho
              </span>
            )}
          </div>
        </div>

        <div className="coverage-list">
          <label className="search">
            <Search size={18} />
            <input type="search" placeholder="Procurar município ou sala…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Procurar município ou sala" />
          </label>

          {groups.length === 0 && <p className="muted">Nenhum município ou sala com esse nome.</p>}
          {groups.map(([district, list]) => (
            <section key={district} className="coverage-district">
              <h2>
                {district} <span>{list.length}</span>
              </h2>
              {list.map((p) => (
                <article
                  key={p.city}
                  ref={(el) => void cards.current.set(p.city, el)}
                  className={p.city === picked ? 'coverage-city on' : 'coverage-city'}
                  onMouseEnter={() => setHover(p.city)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div className="coverage-city-head">
                    <h3>{p.city}</h3>
                    <button className="coverage-go" onClick={() => onPickCity(p.city)}>
                      {p.events} {p.events === 1 ? 'evento' : 'eventos'} <ArrowRight size={15} />
                    </button>
                  </div>
                  {p.venues.length > 0 && (
                    <ul>
                      {p.venues.map((v) => (
                        <li key={v.name}>
                          <Landmark size={13} />
                          <span>{v.name}</span>
                          <em>{v.events}</em>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
