import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, MapPin, Mic2, Search } from 'lucide-react';
import type { Artist, EventItem, EventsData } from '../types';
import { formatSpan, iso } from '../dates';
import { normalize } from '../filters';
import { ARTIST_TYPES, ArtistPhoto, EventCard, openArtist, stagger } from '../ui';

type Kind = Artist['type'] | 'all';

// Artista aberto: vem do endereço (#/artistas?a=id), para se poder ligar a partir do detalhe de um evento.
function useArtistParam(): string | null {
  const read = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('a');
  const [id, setId] = useState(read);
  useEffect(() => {
    const on = () => setId(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return id;
}

// Página "Artistas": só artistas portugueses (cantores, bandas e humoristas) com datas marcadas.
export default function Artists({ data, onSelect }: { data: EventsData; onSelect: (e: EventItem) => void }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const openId = useArtistParam();
  const today = iso(new Date());

  // Próximas datas de cada artista (já com as preferências e o "Grátis" aplicados).
  const byArtist = useMemo(() => {
    const m = new Map<string, EventItem[]>();
    for (const e of data.events) {
      if (e.endDate < today) continue;
      for (const id of e.artists ?? []) {
        if (!data.artists?.[id]) continue;
        if (!m.has(id)) m.set(id, []);
        m.get(id)!.push(e);
      }
    }
    m.forEach((l) => l.sort((a, b) => a.startDate.localeCompare(b.startDate)));
    return m;
  }, [data, today]);

  const all = useMemo(
    () =>
      [...byArtist.keys()]
        .map((id) => data.artists![id])
        .sort((a, b) => byArtist.get(b.id)!.length - byArtist.get(a.id)!.length || a.name.localeCompare(b.name, 'pt')),
    [byArtist, data],
  );
  const counts = useMemo(() => all.reduce<Record<string, number>>((c, a) => ((c[a.type] = (c[a.type] ?? 0) + 1), c), {}), [all]);
  const list = all.filter((a) => (kind === 'all' || a.type === kind) && (!q || normalize(a.name).includes(normalize(q))));

  const open = openId ? data.artists?.[openId] : null;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [openId]);

  if (open) {
    const events = byArtist.get(open.id) ?? [];
    return (
      <div className="artists">
        <button className="link-btn artist-back" onClick={() => (window.location.hash = '/artistas')}>
          <ArrowLeft size={16} /> Todos os artistas
        </button>
        <section className="artist-hero">
          <ArtistPhoto a={open} />
          <div>
            <p className="eyebrow">{ARTIST_TYPES[open.type]}</p>
            <h1>{open.name}</h1>
            <p className="muted">
              {events.length ? `${events.length} ${events.length === 1 ? 'data marcada' : 'datas marcadas'}` : 'Sem datas marcadas de momento.'}
            </p>
          </div>
        </section>
        <div className="grid">
          {events.map((e, i) => (
            <EventCard key={e.id} e={e} labels={data.categories} tag={e.categories[0]} showCity index={i} onOpen={() => onSelect(e)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="artists">
      <section className="artists-head">
        <h1>Artistas</h1>
        <p className="lead">Artistas portugueses com datas marcadas: cantores, bandas e humoristas. Escolhe um para veres onde vai estar.</p>
        <label className="search big">
          <Search size={20} />
          <input type="search" placeholder="Procurar artista…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips">
          {(['all', 'cantor', 'banda', 'humor'] as Kind[]).map((k) => (
            <button key={k} className={kind === k ? 'chip on' : 'chip'} onClick={() => setKind(k)}>
              {k === 'all' ? 'Todos' : ARTIST_TYPES[k]}
              <span className="count">{k === 'all' ? all.length : (counts[k] ?? 0)}</span>
            </button>
          ))}
        </div>
      </section>

      {list.length ? (
        <div className="artist-grid">
          {list.map((a, i) => {
            const next = byArtist.get(a.id)!;
            return (
              <button key={a.id} className="artist-card" style={stagger(i)} onClick={() => openArtist(a.id)}>
                <ArtistPhoto a={a} />
                <strong>{a.name}</strong>
                <small>
                  <Mic2 size={13} /> {next.length} {next.length === 1 ? 'data' : 'datas'}
                </small>
                <small>
                  <CalendarDays size={13} /> {formatSpan(next[0])}
                </small>
                <small>
                  <MapPin size={13} /> {next[0].city}
                </small>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted artists-empty">Nenhum artista {q ? `com “${q}”` : 'nesta categoria'} com datas marcadas.</p>
      )}
    </div>
  );
}
