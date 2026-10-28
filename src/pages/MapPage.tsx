import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinOff } from 'lucide-react';
import type { EventItem, EventsData } from '../types';
import { firstOccurrence, iso } from '../dates';
import { ALL, normalize } from '../filters';
import { EventRow } from '../ui';
import { styleOf } from '../categories';

const DAYS = 14;
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PORTUGAL: L.LatLngBoundsExpression = [
  [36.9, -9.6],
  [42.2, -6.1],
];

const iconCache = new Map<string, L.DivIcon>();
function markerIcon(cat: string) {
  if (!iconCache.has(cat)) {
    const { icon: Icon, color, ink } = styleOf(cat);
    const svg = renderToStaticMarkup(<Icon size={16} color={ink} strokeWidth={2.2} />);
    iconCache.set(
      cat,
      L.divIcon({
        className: 'pin',
        html: `<span class="pin-dot" style="background:${color}">${svg}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    );
  }
  return iconCache.get(cat)!;
}

interface Props {
  data: EventsData;
  city: string;
  selected: EventItem | null;
  onSelect: (e: EventItem | null) => void;
}

export default function MapPage({ data, city, selected, onSelect }: Props) {
  const days = useMemo(() => {
    const t = new Date();
    return Array.from({ length: DAYS }, (_, i) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + i));
  }, []);
  const [day, setDay] = useState(iso(days[0]));
  const [hoverId, setHoverId] = useState<string | null>(null);

  const dayEvents = useMemo(() => {
    const list = data.events.filter((e) => (city === ALL || e.city === city) && firstOccurrence(e, day, day));
    // Eventos pontuais primeiro; exposições longas depois.
    return list.sort((a, b) => Number(a.startDate !== a.endDate) - Number(b.startDate !== b.endDate) || normalize(a.title).localeCompare(normalize(b.title)));
  }, [data, city, day]);
  const located = dayEvents.filter((e) => e.lat != null && e.lon != null);

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    map.current = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).fitBounds(PORTUGAL);
    // Mosaicos do OpenStreetMap (uso moderado, com atribuição). Para muito tráfego, usar um fornecedor dedicado.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      className: 'tiles',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Marcadores do dia escolhido.
  useEffect(() => {
    const m = map.current;
    if (!m || !layer.current) return;
    layer.current.clearLayers();
    markers.current.clear();
    located.forEach((e, i) => {
      const mk = L.marker([e.lat!, e.lon!], { icon: markerIcon(e.categories[0]), riseOnHover: true, title: e.title });
      mk.on('click', () => onSelect(e));
      mk.on('add', () => {
        const el = mk.getElement();
        if (el) el.style.setProperty('--i', String(Math.min(i, 20)));
      });
      mk.addTo(layer.current!);
      markers.current.set(e.id, mk);
    });
    if (located.length) m.flyToBounds(L.latLngBounds(located.map((e) => [e.lat!, e.lon!] as [number, number])).pad(0.15), { maxZoom: 15, duration: 0.8 });
    else m.flyToBounds(PORTUGAL, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located]);

  // Realça o marcador do evento sob o rato ou selecionado.
  useEffect(() => {
    markers.current.forEach((mk, id) => mk.getElement()?.classList.toggle('hot', id === hoverId || id === selected?.id));
    if (selected && markers.current.has(selected.id)) map.current?.panTo(markers.current.get(selected.id)!.getLatLng(), { animate: true });
  }, [hoverId, selected, located]);

  return (
    <div className="map-page">
      <div className="day-strip" role="tablist" aria-label="Dia">
        {days.map((d, i) => {
          const id = iso(d);
          return (
            <button key={id} role="tab" aria-selected={day === id} className={day === id ? 'on' : ''} onClick={() => setDay(id)}>
              <small>{i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : WEEKDAYS[d.getDay()]}</small>
              <strong>{d.getDate()}</strong>
              <small>{MONTHS[d.getMonth()]}</small>
            </button>
          );
        })}
      </div>

      <div className="map-layout">
        <aside className="map-list">
          <p className="summary">
            {located.length} no mapa
            {dayEvents.length > located.length && (
              <span className="muted">
                <MapPinOff size={14} /> {dayEvents.length - located.length} sem localização
              </span>
            )}
          </p>
          <div className="rows" key={day}>
            {located.map((e, i) => (
              <div key={e.id} onMouseEnter={() => setHoverId(e.id)} onMouseLeave={() => setHoverId(null)}>
                <EventRow e={e} labels={data.categories} tag={e.categories[0]} showCity={city === ALL} active={selected?.id === e.id} index={i} onOpen={() => onSelect(e)} />
              </div>
            ))}
          </div>
        </aside>
        <div className="map-wrap">
          <div ref={mapEl} className="map" />
        </div>
      </div>
    </div>
  );
}
