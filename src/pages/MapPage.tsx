import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds, Map as MapLibre, NavigationControl, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike, type MapLayerMouseEvent, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapPinOff, X } from 'lucide-react';
import type { EventItem, EventsData } from '../types';
import { firstOccurrence, iso } from '../dates';
import { ALL, normalize } from '../filters';
import { EventRow } from '../ui';
import { CATEGORY_STYLE, styleOf } from '../categories';

// O empacotador muda os caminhos internos do MapLibre: indicamos o worker explicitamente.
setWorkerUrl(workerUrl);

const DAYS = 14;
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PORTUGAL: LngLatBoundsLike = [
  [-9.6, 36.9],
  [-6.1, 42.2],
];
// Até este zoom os eventos aparecem agrupados (círculos com o número); depois, um a um.
const CLUSTER_MAX_ZOOM = 15;

// Estilo vetorial "Positron" do OpenFreeMap (gratuito, sem chave), reduzido ao mínimo:
// fundo, água, fronteiras, estradas principais muito ténues e nomes de cidades/vilas.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const KEEP = new Set(['background', 'water', 'boundary_2', 'highway_minor', 'highway_major_inner', 'highway_motorway_inner', 'label_town', 'label_city', 'label_city_capital', 'label_country_1']);
let styleCache: Promise<StyleSpecification> | null = null;

type AnyLayer = StyleSpecification['layers'][number] & { paint?: Record<string, unknown>; layout?: Record<string, unknown>; minzoom?: number };

function minimalStyle(): Promise<StyleSpecification> {
  styleCache ??= fetch(STYLE_URL)
    .then((r) => r.json())
    .then((style: StyleSpecification) => {
      style.layers = style.layers
        .filter((l) => KEEP.has(l.id))
        .map((l) => {
          const layer = { ...l } as AnyLayer;
          if (l.id === 'background') layer.paint = { 'background-color': '#f4f4f4' };
          if (l.id === 'water') layer.paint = { 'fill-color': '#dfe3e6' };
          if (l.id === 'boundary_2') layer.paint = { ...layer.paint, 'line-color': '#c9c9c9' };
          if (l.id.startsWith('highway_')) layer.paint = { ...layer.paint, 'line-color': '#ffffff' };
          if (l.id === 'highway_minor') layer.minzoom = 14;
          if (l.id.startsWith('label_')) {
            // Só o nome, sem o ponto que marca a localidade.
            layer.layout = { ...layer.layout, 'icon-image': '' };
            layer.paint = { 'text-color': '#8a8a8a', 'text-halo-color': '#f4f4f4', 'text-halo-width': 1.5 };
          }
          return layer as StyleSpecification['layers'][number];
        });
      return style;
    });
  return styleCache;
}

// Marcador de cada tipo: círculo na cor do tipo, contorno branco e o ícone ao centro (SVG → imagem do mapa).
function markerSvg(cat: string, size: number): string {
  const { icon: Icon, color, ink } = styleOf(cat);
  const icon = renderToStaticMarkup(<Icon size={size * 0.46} color={ink} strokeWidth={2.2} />).replace('<svg ', `<svg x="${size * 0.27}" y="${size * 0.27}" `);
  const r = size / 2 - 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="4"/>${icon}</svg>`;
}

async function addCategoryIcons(m: MapLibre) {
  await Promise.all(
    Object.keys(CATEGORY_STYLE).map(
      (cat) =>
        new Promise<void>((resolve) => {
          const img = new Image(64, 64);
          img.onload = () => {
            if (!m.hasImage(`cat-${cat}`)) m.addImage(`cat-${cat}`, img, { pixelRatio: 2 });
            resolve();
          };
          img.onerror = () => resolve();
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markerSvg(cat, 64))}`;
        }),
    ),
  );
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
  // Eventos de um grupo que não se separa (mesmo local): a lista mostra só esses.
  const [focusIds, setFocusIds] = useState<string[] | null>(null);

  const dayEvents = useMemo(() => {
    const list = data.events.filter((e) => (city === ALL || e.city === city) && firstOccurrence(e, day, day));
    // Eventos pontuais primeiro; exposições longas depois.
    return list.sort((a, b) => Number(a.startDate !== a.endDate) - Number(b.startDate !== b.endDate) || normalize(a.title).localeCompare(normalize(b.title)));
  }, [data, city, day]);
  // Só eventos com coordenadas dentro de Portugal (continente e ilhas).
  const located = useMemo(() => dayEvents.filter((e) => e.lat != null && e.lon != null && e.lat > 29 && e.lat < 43 && e.lon > -32 && e.lon < -6), [dayEvents]);
  const byId = useMemo(() => new Map(located.map((e) => [e.id, e])), [located]);
  const listed = focusIds ? located.filter((e) => focusIds.includes(e.id)) : located;

  useEffect(() => setFocusIds(null), [day, city]);

  // Área inicial: o concelho escolhido (limites oficiais) ou o país inteiro.
  const placeBounds = useMemo<LngLatBoundsLike>(() => {
    const b = city !== ALL ? data.places?.[city] : null;
    return b ? [[b[0], b[1]], [b[2], b[3]]] : PORTUGAL;
  }, [data, city]);

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const boundsRef = useRef(placeBounds);
  boundsRef.current = placeBounds;

  useEffect(() => {
    let cancelled = false;
    minimalStyle().then((style) => {
      if (cancelled || !mapEl.current) return;
      const m = new MapLibre({
        container: mapEl.current,
        style,
        bounds: boundsRef.current,
        fitBoundsOptions: { padding: 40 },
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new NavigationControl({ showCompass: false }), 'top-left');
      map.current = m;

      m.on('load', async () => {
        await addCategoryIcons(m);
        m.addSource('events', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 46, clusterMaxZoom: CLUSTER_MAX_ZOOM });

        // Grupos: círculo preto com o número de eventos; cresce com a quantidade.
        m.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'events',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#111111',
            'circle-radius': ['step', ['get', 'point_count'], 17, 10, 22, 50, 28],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3,
            'circle-opacity': 0.92,
          },
        });
        m.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'events',
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
          paint: { 'text-color': '#ffffff' },
        });
        // Eventos individuais: marcador com a cor e o ícone do tipo de evento.
        m.addLayer({
          id: 'point',
          type: 'symbol',
          source: 'events',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': ['concat', 'cat-', ['get', 'cat']],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 1],
            'icon-allow-overlap': true,
          },
        });
        // Realce do evento sob o rato ou selecionado: o mesmo marcador, maior.
        m.addLayer({
          id: 'point-hot',
          type: 'symbol',
          source: 'events',
          filter: ['in', ['get', 'id'], ['literal', []]],
          layout: { 'icon-image': ['concat', 'cat-', ['get', 'cat']], 'icon-size': 1.45, 'icon-allow-overlap': true },
        });

        m.on('click', 'clusters', async (ev: MapLayerMouseEvent) => {
          const f = ev.features?.[0];
          if (!f) return;
          const src = m.getSource('events') as GeoJSONSource;
          const clusterId = f.properties.cluster_id as number;
          const zoom = await src.getClusterExpansionZoom(clusterId);
          const center = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
          if (zoom <= CLUSTER_MAX_ZOOM) {
            m.easeTo({ center, zoom: zoom + 0.2, duration: 700 });
          } else {
            // Vários eventos no mesmo local: mostra-os na lista.
            const leaves = await src.getClusterLeaves(clusterId, 100, 0);
            setFocusIds(leaves.map((l) => String(l.properties?.id)));
            m.easeTo({ center, duration: 500 });
          }
        });
        m.on('click', 'point', (ev: MapLayerMouseEvent) => {
          const id = ev.features?.[0]?.properties?.id as string | undefined;
          const e = id ? byIdRef.current.get(id) : undefined;
          if (e) selectRef.current(e);
        });
        for (const layer of ['clusters', 'point']) {
          m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'));
          m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''));
        }
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  // Eventos do dia escolhido e enquadramento.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('events') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: located.map((e) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lon!, e.lat!] },
        properties: { id: e.id, cat: e.categories[0] in CATEGORY_STYLE ? e.categories[0] : 'outros' },
      })),
    });
    if (located.length) {
      const b = new LngLatBounds();
      located.forEach((e) => b.extend([e.lon!, e.lat!]));
      m.fitBounds(b, { padding: 60, maxZoom: 14, duration: 900 });
    } else m.fitBounds(placeBounds, { padding: 40, duration: 900 });
  }, [located, placeBounds, ready]);

  // Realce: evento sob o rato na lista ou selecionado.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const ids = [hoverId, selected?.id].filter(Boolean) as string[];
    m.setFilter('point-hot', ['in', ['get', 'id'], ['literal', ids]]);
    if (selected && byId.has(selected.id)) m.easeTo({ center: [selected.lon!, selected.lat!], duration: 600 });
  }, [hoverId, selected, ready, byId]);

  return (
    <div className="map-page">
      <div className="day-strip" role="tablist" aria-label="Dia">
        {days.map((d, i) => {
          const id = iso(d);
          return (
            <button key={id} role="tab" aria-selected={day === id} className={day === id ? 'on' : ''} onClick={() => setDay(id)}>
              <small>{i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : WEEKDAYS[d.getDay()]}</small>
              <i className="sep" aria-hidden="true" />
              <strong>{d.getDate()}</strong>
              <i className="sep" aria-hidden="true" />
              <small className="month">{MONTHS[d.getMonth()].toUpperCase()}</small>
            </button>
          );
        })}
      </div>

      <div className="map-layout">
        <aside className="map-list">
          <p className="summary">
            {focusIds ? (
              <button className="focus-chip" onClick={() => setFocusIds(null)}>
                {listed.length} no mesmo local <X size={14} />
              </button>
            ) : (
              <>{located.length} no mapa</>
            )}
            {!focusIds && dayEvents.length > located.length && (
              <span className="muted">
                <MapPinOff size={14} /> {dayEvents.length - located.length} sem localização
              </span>
            )}
          </p>
          <div className="rows" key={`${day}|${focusIds?.join() ?? ''}`}>
            {listed.map((e, i) => (
              <div key={e.id} onMouseEnter={() => setHoverId(e.id)} onMouseLeave={() => setHoverId(null)}>
                <EventRow e={e} labels={data.categories} tag={e.categories[0]} showCity={city === ALL} active={selected?.id === e.id} index={i} hideWhen onOpen={() => onSelect(e)} />
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
