import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { House, Info, LayoutList, Map as MapIcon, MapPin, X } from 'lucide-react';
import type { EventItem, EventsData } from './types';
import { loadEvents } from './data';
import type { DateRange } from './dates';
import { ALL } from './filters';
import { INITIAL, useHashPage, useMediaQuery, usePersisted, type Page } from './hooks';
import { CityDropdown, CityList, DetailContent, Sheet, type City } from './ui';
import Home from './pages/Home';
import Events from './pages/Events';
import MapPage from './pages/MapPage';
import About from './pages/About';

const NAV: { id: Page; label: string; icon: typeof House }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'eventos', label: 'Eventos', icon: LayoutList },
  { id: 'mapa', label: 'Mapa', icon: MapIcon },
  { id: 'sobre', label: 'Sobre', icon: Info },
];

export default function App() {
  const [data, setData] = useState<EventsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, go] = useHashPage();
  const [city, setCity] = usePersisted('city', ALL);
  // Filtros da página Eventos (a Home pode pré-defini-los).
  const [cats, setCats] = usePersisted<string[]>('categories', []);
  const [range, setRange] = usePersisted<DateRange>('range', 'week');
  const [freeOnly, setFreeOnly] = usePersisted('freeOnly', false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [pickingCity, setPickingCity] = useState(false);

  // ≥ 1100 px: 3 colunas com detalhe ao lado; ≥ 860 px: filtros numa coluna à esquerda.
  const wide = useMediaQuery('(min-width: 1100px)');
  const sidebar = useMediaQuery('(min-width: 860px)');

  useEffect(() => {
    loadEvents().then(setData, (err) => setError(String(err)));
  }, []);

  useEffect(() => setSelected(null), [page]);

  // Chegada por uma página estática (/eventos/porto/teatro/, /evento/…): aplica o sítio, o tipo e o evento.
  useEffect(() => {
    if (!INITIAL) return;
    if (INITIAL.city) setCity(INITIAL.city);
    // Página de um tipo: só esse tipo; página de um evento ou de uma cidade: sem filtro de tipo.
    setCats(INITIAL.cats ?? []);
    if (INITIAL.cats || INITIAL.eventId) setRange('month');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const id = INITIAL?.eventId;
    const e = id && data?.events.find((x) => x.id === id);
    if (e) setSelected(e);
  }, [data]);

  // Botão "voltar" do Android fecha o que estiver aberto em vez de sair da app.
  useEffect(() => {
    const sub = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (selected) setSelected(null);
      else if (pickingCity) setPickingCity(false);
      else if (page !== 'home') go('home');
      else if (canGoBack) window.history.back();
      else CapApp.exitApp();
    });
    return () => {
      sub.then((s) => s.remove());
    };
  }, [selected, pickingCity, page, go]);

  const cities = useMemo<City[]>(() => {
    const counts = new Map<string, City>();
    data?.events.forEach((e) => {
      const c = counts.get(e.city) ?? { name: e.city, n: 0, district: e.district };
      c.n++;
      counts.set(e.city, c);
    });
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }, [data]);

  const pickCity = (c: string) => {
    setCity(c);
    setPickingCity(false);
    setSelected(null);
  };
  const closeDetail = useCallback(() => setSelected(null), []);

  if (error) return <div className="state">Não foi possível carregar os eventos.<br /><small>{error}</small></div>;
  if (!data) return <div className="state"><span className="loader" />A carregar eventos…</div>;

  const cityLabel = city === ALL ? 'Todo o país' : city;
  // "Só gratuitos" vale para a app inteira (Home, Eventos e Mapa).
  const shown = freeOnly ? { ...data, events: data.events.filter((e) => e.isFree) } : data;
  const freeToggle = (
    <button className={freeOnly ? 'free-toggle on' : 'free-toggle'} role="switch" aria-checked={freeOnly} aria-label="Só eventos grátis" onClick={() => setFreeOnly(!freeOnly)}>
      <span className="free-toggle-label">Grátis</span>
      <span className="free-toggle-knob" />
    </button>
  );

  // Na página Eventos em ecrã largo o detalhe vive na 3.ª coluna; nos outros casos abre por cima.
  const detailInColumn = page === 'eventos' && wide;

  return (
    <>
      <header className="top">
        <div className="bar">
          <a className="brand" href="#/" onClick={() => go('home')} aria-label="Eventados — início">
            Eventados
          </a>
          {sidebar && (
            <nav className="nav" aria-label="Menu">
              {NAV.map(({ id, label, icon: Icon }) => (
                <button key={id} className={page === id ? 'on' : ''} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}>
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </nav>
          )}
          <div className="header-tools">{freeToggle}</div>
          {sidebar ? (
            <CityDropdown cities={cities} total={data.events.length} current={city} label={cityLabel} onPick={pickCity} />
          ) : (
            <button className="city-btn" onClick={() => setPickingCity(true)}>
              <MapPin size={16} strokeWidth={2.2} />
              {cityLabel}
            </button>
          )}
        </div>
      </header>

      <div key={page} className="page">
        {page === 'home' && (
          <Home
            data={shown}
            city={city}
            onSelect={setSelected}
            onPickPlace={() => setPickingCity(true)}
            onExplore={(o) => {
              setQuery(o.query ?? '');
              setRange(o.range ?? 'week');
              setCats(o.cats ?? []);
              setFreeOnly(o.freeOnly ?? false);
              go('eventos');
            }}
          />
        )}
        {page === 'eventos' && (
          <Events
            data={shown}
            city={city}
            selected={selected}
            onSelect={setSelected}
            wide={wide}
            sidebar={sidebar}
            range={range}
            setRange={setRange}
            cats={cats}
            setCats={setCats}
            query={query}
            setQuery={setQuery}
          />
        )}
        {page === 'mapa' && <MapPage data={shown} city={city} selected={selected} onSelect={setSelected} />}
        {page === 'sobre' && <About data={data} />}
      </div>

      {!sidebar && (
        <nav className="tabbar" aria-label="Menu">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'on' : ''} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}>
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {pickingCity && (
        <Sheet className="picker" label="Escolher sítio" onClose={() => setPickingCity(false)}>
          <div className="sheet-head">
            <h2>Onde?</h2>
            <button className="icon-btn" onClick={() => setPickingCity(false)} aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
          <CityList cities={cities} total={data.events.length} current={city} onPick={pickCity} autoFocus />
        </Sheet>
      )}

      {selected && !detailInColumn && (
        <Sheet className="detail" label={selected.title} onClose={closeDetail}>
          <DetailContent e={selected} labels={data.categories} onClose={closeDetail} />
        </Sheet>
      )}
    </>
  );
}
