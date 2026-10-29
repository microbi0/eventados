import { useMemo, useState } from 'react';
import { Bookmark, EyeOff, Filter, MapPin, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import type { EventItem, EventsData } from '../types';
import { iso } from '../dates';
import { styleOf } from '../categories';
import { normalize } from '../filters';
import { suggest, usePersonal, type Prefs } from '../personal';
import { EventCard, stagger, type City } from '../ui';

type Tab = 'guardados' | 'sugeridos' | 'preferencias';
const TABS: { id: Tab; label: string; icon: typeof Bookmark }[] = [
  { id: 'guardados', label: 'Guardados', icon: Bookmark },
  { id: 'sugeridos', label: 'Sugeridos', icon: Sparkles },
  { id: 'preferencias', label: 'Preferências', icon: Filter },
];

interface Props {
  data: EventsData;
  // Eventos já com as preferências aplicadas (para as sugestões).
  shown: EventItem[];
  cities: City[];
  onSelect: (e: EventItem) => void;
}

export default function MyEvents({ data, shown, cities, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>('guardados');
  const { saved, history, clearHistory, prefs, setPrefs, hasPrefs } = usePersonal();
  const today = iso(new Date());

  // Os guardados usam a versão mais recente do evento quando ainda está na agenda.
  const current = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);
  const savedList = Object.values(saved)
    .map((e) => current.get(e.id) ?? e)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const upcoming = savedList.filter((e) => e.endDate >= today);
  const past = savedList.filter((e) => e.endDate < today).reverse();

  const suggestions = useMemo(() => suggest(shown, history, saved, data.categories), [shown, history, saved, data.categories]);

  const card = (e: EventItem, i: number) => (
    <EventCard key={e.id} e={e} labels={data.categories} tag={e.categories[0]} showCity index={i} onOpen={() => onSelect(e)} />
  );

  return (
    <div className="mine">
      <section className="mine-head">
        <h1>Os meus eventos</h1>
        <div className="mine-tabs" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              <Icon size={17} />
              {label}
              {id === 'guardados' && upcoming.length > 0 && <span className="count">{upcoming.length}</span>}
              {id === 'preferencias' && hasPrefs && <i className="dot" />}
            </button>
          ))}
        </div>
      </section>

      {tab === 'guardados' && (
        <>
          {!savedList.length && (
            <Empty icon={Bookmark} title="Ainda não guardaste eventos">
              Carrega no marcador de um evento para o guardares aqui e não te esqueceres de ir.
            </Empty>
          )}
          {upcoming.length > 0 && <div className="grid">{upcoming.map(card)}</div>}
          {past.length > 0 && (
            <>
              <h2 className="mine-sub">Já passaram</h2>
              <div className="grid past">{past.map(card)}</div>
            </>
          )}
        </>
      )}

      {tab === 'sugeridos' && (
        <>
          <p className="muted mine-lead">Escolhidos a partir dos eventos que abriste e guardaste nos últimos tempos{hasPrefs ? ', dentro das tuas preferências' : ''}.</p>
          {suggestions.length ? (
            <div className="grid">
              {suggestions.map(({ e, why }, i) => (
                <div key={e.id} className="suggestion" style={stagger(i)}>
                  <p className="why">
                    <Sparkles size={14} /> {why}
                  </p>
                  {card(e, i)}
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Sparkles} title="Ainda não há sugestões">
              Abre e guarda alguns eventos: as sugestões aparecem aqui conforme o que te interessa.
            </Empty>
          )}
          {history.length > 0 && (
            <button className="link-btn mine-reset" onClick={clearHistory}>
              <RotateCcw size={15} /> Esquecer o histórico
            </button>
          )}
        </>
      )}

      {tab === 'preferencias' && <Preferences prefs={prefs} setPrefs={setPrefs} cities={cities} labels={data.categories} />}
    </div>
  );
}

function Empty({ icon: Icon, title, children }: { icon: typeof Bookmark; title: string; children: React.ReactNode }) {
  return (
    <div className="mine-empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Preferences({ prefs, setPrefs, cities, labels }: { prefs: Prefs; setPrefs: (p: Prefs) => void; cities: City[]; labels: Record<string, string> }) {
  const set = (k: keyof Prefs, v: string[]) => setPrefs({ ...prefs, [k]: v });
  const toggle = (k: keyof Prefs, v: string) => set(k, prefs[k].includes(v) ? prefs[k].filter((x) => x !== v) : [...prefs[k], v]);
  // Escolher "só estes" num tipo tira-o dos escondidos e vice-versa.
  const pickCat = (k: 'cats' | 'hideCats', id: string) => {
    const other = k === 'cats' ? 'hideCats' : 'cats';
    setPrefs({ ...prefs, [k]: prefs[k].includes(id) ? prefs[k].filter((x) => x !== id) : [...prefs[k], id], [other]: prefs[other].filter((x) => x !== id) });
  };
  const cats = Object.keys(labels);
  const allCities = cities.map((c) => c.name);
  const hasAny = Object.values(prefs).some((l) => l.length);

  return (
    <div className="prefs">
      <p className="muted mine-lead">
        As preferências valem para o site todo (Home, Eventos e Mapa) e ficam guardadas só neste dispositivo. Os eventos que não encaixam deixam de
        aparecer.
      </p>

      <section className="pref">
        <h2>
          <MapPin size={20} /> Sítios que me interessam
        </h2>
        <p className="muted">Mostra apenas eventos nestes concelhos. Sem nenhum escolhido, mostra o país todo.</p>
        <PlacePicker values={prefs.cities} options={allCities.filter((c) => !prefs.hideCities.includes(c))} onAdd={(c) => toggle('cities', c)} onRemove={(c) => toggle('cities', c)} />
      </section>

      <section className="pref">
        <h2>
          <Filter size={20} /> Tipos de eventos que me interessam
        </h2>
        <p className="muted">Mostra apenas estes tipos. Sem nenhum escolhido, mostra todos.</p>
        <div className="pref-cats">
          {cats.map((id) => (
            <CatToggle key={id} id={id} label={labels[id]} on={prefs.cats.includes(id)} onClick={() => pickCat('cats', id)} />
          ))}
        </div>
      </section>

      <section className="pref">
        <h2>
          <EyeOff size={20} /> Sítios a esconder
        </h2>
        <p className="muted">Eventos nestes concelhos nunca aparecem.</p>
        <PlacePicker values={prefs.hideCities} options={allCities.filter((c) => !prefs.cities.includes(c))} onAdd={(c) => toggle('hideCities', c)} onRemove={(c) => toggle('hideCities', c)} hide />
      </section>

      <section className="pref">
        <h2>
          <EyeOff size={20} /> Tipos a esconder
        </h2>
        <p className="muted">Eventos destes tipos nunca aparecem.</p>
        <div className="pref-cats">
          {cats.map((id) => (
            <CatToggle key={id} id={id} label={labels[id]} on={prefs.hideCats.includes(id)} onClick={() => pickCat('hideCats', id)} hide />
          ))}
        </div>
      </section>

      {hasAny && (
        <button className="btn" onClick={() => setPrefs({ cities: [], cats: [], hideCities: [], hideCats: [] })}>
          <RotateCcw size={18} /> Repor tudo
        </button>
      )}
    </div>
  );
}

function CatToggle({ id, label, on, hide, onClick }: { id: string; label: string; on: boolean; hide?: boolean; onClick: () => void }) {
  const { icon: Icon, color, ink } = styleOf(id);
  return (
    <button
      className={`chip${on ? ' on' : ''}${hide ? ' hide' : ''}`}
      style={on && !hide ? { background: color, color: ink, borderColor: color } : undefined}
      onClick={onClick}
      aria-pressed={on}
    >
      {on && hide ? <EyeOff size={15} /> : <Icon size={15} />}
      {label}
    </button>
  );
}

function PlacePicker({ values, options, onAdd, onRemove, hide }: { values: string[]; options: string[]; onAdd: (c: string) => void; onRemove: (c: string) => void; hide?: boolean }) {
  const [q, setQ] = useState('');
  const matches = q ? options.filter((c) => !values.includes(c) && normalize(c).includes(normalize(q))).slice(0, 8) : [];
  return (
    <div className="place-picker">
      {values.length > 0 && (
        <div className="pref-cats">
          {values.map((c) => (
            <button key={c} className={`chip on${hide ? ' hide' : ''}`} onClick={() => onRemove(c)} aria-label={`Remover ${c}`}>
              {hide ? <EyeOff size={15} /> : <MapPin size={15} />}
              {c}
              <X size={14} />
            </button>
          ))}
        </div>
      )}
      <label className="search">
        <Plus size={18} />
        <input type="search" placeholder="Adicionar concelho…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {matches.length > 0 && (
        <ul className="place-matches">
          {matches.map((c) => (
            <li key={c}>
              <button
                onClick={() => {
                  onAdd(c);
                  setQ('');
                }}
              >
                <MapPin size={15} /> {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
