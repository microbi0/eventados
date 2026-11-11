import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import type { EventItem } from './types';
import { styleOf } from './categories';
import { FreeBadge, MetaRow, Placeholder, WhenRow } from './ui';

export interface Spot {
  e: EventItem;
  reasons: string[];
}

const INTERVAL = 6000;

export type Tone = { dark: boolean; rgb: [number, number, number] };
const toneCache = new Map<string, Promise<Tone>>();

// Cor média e luminosidade da imagem (amostra 12×12 num canvas). As imagens das fontes permitem CORS;
// se alguma não permitir, assume-se imagem escura (texto claro sobre uma rampa escura).
export function imageTone(url: string | null, fallback: string): Promise<Tone> {
  const hex = fallback.replace('#', '');
  const fb: Tone = { dark: true, rgb: [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)] };
  if (!url) return Promise.resolve({ ...fb, dark: luminance(fb.rgb) < 0.6 });
  if (!toneCache.has(url)) {
    toneCache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = c.height = 12;
            const ctx = c.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(img, 0, 0, 12, 12);
            const px = ctx.getImageData(0, 0, 12, 12).data;
            let r = 0, g = 0, b = 0;
            for (let i = 0; i < px.length; i += 4) {
              r += px[i];
              g += px[i + 1];
              b += px[i + 2];
            }
            const n = px.length / 4;
            const rgb: [number, number, number] = [r / n, g / n, b / n].map(Math.round) as [number, number, number];
            resolve({ rgb, dark: luminance(rgb) < 0.58 });
          } catch {
            resolve(fb);
          }
        };
        img.onerror = () => resolve(fb);
        img.src = url;
      }),
    );
  }
  return toneCache.get(url)!;
}

const luminance = ([r, g, b]: [number, number, number]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export function useTone(e: EventItem | null) {
  const [tone, setTone] = useState<Tone | null>(null);
  useEffect(() => {
    if (!e) return;
    let alive = true;
    imageTone(e.image, styleOf(e.categories[0]).color).then((t) => alive && setTone(t));
    return () => {
      alive = false;
    };
  }, [e]);
  return tone;
}

// Slider dos eventos mais relevantes da semana: avança sozinho e pausa com o rato, o teclado ou o dedo.
// O deslizar é feito à mão (dedo ou rato): o slider segue o dedo 1:1 e, ao largar, se passou de 40% da largura
// (ou foi um gesto rápido) continua para esse lado; senão volta ao sítio. A animação é sempre um ease-in-out.
// Os gestos verticais ficam para o scroll da página (touch-action: pan-y).
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const THRESHOLD = 0.4;

type Drag = { id: number; x: number; y: number; dx: number; axis: 'x' | 'y' | null; lastX: number; lastT: number; vx: number };

export default function Spotlight({ spots, title, onOpen, onActive }: { spots: Spot[]; title: string; onOpen: (e: EventItem) => void; onActive?: (e: EventItem) => void }) {
  const n = spots.length;
  const win = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  // index: o slide indicado nos pontos (segue o gesto em tempo real). settled: onde o slider pousou (fundo da Home e autoplay).
  const [index, setIndex] = useState(0);
  const [settled, setSettled] = useState(0);
  const pos = useRef(0);
  const [hover, setHover] = useState(false);
  const [keyFocus, setKeyFocus] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const moved = useRef(false); // o clique depois de arrastar não abre o evento

  // Põe o track no slide `pos` deslocado `offset` px; com `ms` anima com o ease-in-out.
  const place = useCallback((offset: number, ms = 0) => {
    const el = track.current;
    if (!el) return;
    el.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
    el.style.transform = `translate3d(calc(${-pos.current * 100}% + ${offset}px), 0, 0)`;
  }, []);

  const go = useCallback(
    (i: number, ms = 560) => {
      if (!n) return;
      const next = ((i % n) + n) % n;
      const jump = Math.abs(next - pos.current);
      pos.current = next;
      setIndex(next);
      // atravessar vários slides (ex.: do último para o primeiro) demora um pouco mais
      place(0, ms && Math.round(ms * Math.min(1.6, 1 + 0.15 * Math.max(0, jump - 1))));
      if (!ms) setSettled(next);
    },
    [n, place],
  );

  useEffect(() => go(0, 0), [spots, go]);

  useEffect(() => {
    if (spots[settled]) onActive?.(spots[settled].e);
  }, [settled, spots, onActive]);

  const playing = n > 1 && !hover && !keyFocus && !dragging;
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => go(pos.current + 1), INTERVAL);
    return () => window.clearTimeout(t);
  }, [settled, playing, go]);

  // deslocamento atual do track em relação ao slide `pos` (para apanhar uma animação a meio)
  const currentOffset = () => {
    const el = track.current!;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return m.m41 + pos.current * el.clientWidth;
  };

  const release = (d: Drag) => {
    const w = track.current!.clientWidth || 1;
    const frac = d.dx / w;
    const flick = Math.abs(d.vx) > 0.6 && Math.abs(frac) > 0.1 && Math.sign(d.vx) === Math.sign(d.dx);
    const step = Math.abs(frac) >= THRESHOLD || flick ? (d.dx < 0 ? 1 : -1) : 0;
    const next = Math.max(0, Math.min(n - 1, pos.current + step));
    // a duração acompanha o caminho que falta percorrer
    const left = Math.abs((pos.current - next) * w + d.dx) / w;
    go(next, Math.round(260 + 340 * Math.min(1, left)));
  };

  if (!n) return null;

  return (
    <section
      className="spotlight"
      aria-roledescription="carrossel"
      aria-label={title}
      onPointerEnter={(ev) => ev.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(ev) => ev.pointerType === 'mouse' && setHover(false)}
      onFocus={(ev) => {
        // só o foco do teclado pausa; um toque num botão não deixa o slider parado para sempre
        if ((ev.target as HTMLElement).matches?.(':focus-visible')) setKeyFocus(true);
      }}
      onBlur={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setKeyFocus(false);
      }}
      onKeyDown={(ev) => {
        if (ev.key === 'ArrowRight') go(pos.current + 1);
        if (ev.key === 'ArrowLeft') go(pos.current - 1);
      }}
    >
      <div className="spot-viewport">
        <div
          ref={win}
          className={`spot-window${dragging ? ' dragging' : ''}`}
          onPointerDown={(ev) => {
            if (n < 2 || (ev.pointerType === 'mouse' && ev.button !== 0) || drag.current) return;
            moved.current = false;
            const offset = currentOffset();
            place(offset); // se estava a animar, fica onde está e o dedo pega-lhe daí
            drag.current = { id: ev.pointerId, x: ev.clientX - offset, y: ev.clientY, dx: offset, axis: null, lastX: ev.clientX, lastT: ev.timeStamp, vx: 0 };
          }}
          onPointerMove={(ev) => {
            const d = drag.current;
            if (!d || ev.pointerId !== d.id) return;
            let dx = ev.clientX - d.x;
            if (!d.axis) {
              const dy = ev.clientY - d.y;
              if (Math.abs(dx - d.dx) < 6 && Math.abs(dy) < 6) return;
              d.axis = Math.abs(dx - d.dx) >= Math.abs(dy) ? 'x' : 'y';
              if (d.axis === 'y') {
                // é scroll vertical da página: o slider volta ao sítio e não interfere
                drag.current = null;
                if (Math.abs(d.dx) > 1) go(pos.current, 300);
                return;
              }
              moved.current = true;
              setDragging(true);
              try {
                win.current!.setPointerCapture(ev.pointerId);
              } catch {
                /* ponteiro já terminado */
              }
            }
            // resistência nas pontas (antes do primeiro e depois do último)
            if ((pos.current === 0 && dx > 0) || (pos.current === n - 1 && dx < 0)) dx *= 0.35;
            const dt = ev.timeStamp - d.lastT;
            if (dt > 0) d.vx = 0.7 * ((ev.clientX - d.lastX) / dt) + 0.3 * d.vx;
            d.lastX = ev.clientX;
            d.lastT = ev.timeStamp;
            d.dx = dx;
            place(dx);
            // os pontos mostram já o slide para onde vai ao largar
            const w = track.current!.clientWidth || 1;
            const ahead = Math.abs(dx / w) >= THRESHOLD ? (dx < 0 ? 1 : -1) : 0;
            const live = Math.max(0, Math.min(n - 1, pos.current + ahead));
            setIndex((i) => (i === live ? i : live));
          }}
          onPointerUp={(ev) => {
            const d = drag.current;
            if (!d || ev.pointerId !== d.id) return;
            drag.current = null;
            setDragging(false);
            // velocidade antiga (dedo parado antes de largar) não conta como gesto rápido
            if (ev.timeStamp - d.lastT > 80) d.vx = 0;
            if (d.axis === 'x' || Math.abs(d.dx) > 1) release(d);
          }}
          onPointerCancel={(ev) => {
            const d = drag.current;
            if (!d || ev.pointerId !== d.id) return;
            drag.current = null;
            setDragging(false);
            go(pos.current, 300);
          }}
          onClickCapture={(ev) => {
            if (moved.current) {
              ev.preventDefault();
              ev.stopPropagation();
              moved.current = false;
            }
          }}
          onDragStart={(ev) => ev.preventDefault()}
        >
          <div
            ref={track}
            className="spot-track"
            onTransitionEnd={(ev) => {
              if (ev.target === ev.currentTarget && ev.propertyName === 'transform' && !drag.current) setSettled(pos.current);
            }}
          >
            {spots.map(({ e }, i) => (
              <Slide key={e.id} e={e} active={i === index} label={`${i + 1} de ${n}`} onOpen={() => onOpen(e)} />
            ))}
          </div>
        </div>

        <div className="spot-dots" role="tablist" aria-label="Escolher destaque">
          {spots.map(({ e }, i) => (
            <button key={e.id} role="tab" aria-selected={i === index} aria-label={`Destaque ${i + 1}`} className={i === index ? 'on' : ''} onClick={() => go(i)}>
              {/* barra de progresso do avanço automático */}
              {i === index && i === settled && playing && <i key={settled} style={{ animationDuration: `${INTERVAL}ms` }} />}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Slide({ e, active, label, onOpen }: { e: EventItem; active: boolean; label: string; onOpen: () => void }) {
  const tone = useTone(e);
  const rgb = tone ? tone.rgb.join(' ') : '20 20 20';
  // Texto escuro sobre imagens claras e vice-versa; a rampa usa a cor média da própria imagem.
  const theme = tone && !tone.dark ? 'light' : 'dark';
  return (
    <article
      className={`spot ${theme}${active ? ' on' : ''}`}
      aria-roledescription="slide"
      aria-label={label}
      aria-hidden={!active}
      style={{ ['--tone' as string]: rgb }}
    >
      {/* fundo: a própria imagem, ampliada e desfocada */}
      <div className="spot-bg" aria-hidden="true">
        {e.image && <img src={e.image} alt="" draggable={false} />}
      </div>
      <div className="spot-ramp" aria-hidden="true" />

      <div className="spot-content">
        <button className="spot-media" onClick={onOpen} tabIndex={active ? 0 : -1} aria-label={e.title}>
          {e.image ? <img src={e.image} alt="" draggable={false} /> : <Placeholder id={e.categories[0]} size={80} />}
          {e.isFree && <FreeBadge />}
        </button>
        <div className="spot-info">
          <h3>{e.title}</h3>
          {e.subtitle && <p className="spot-sub">{e.subtitle}</p>}
          <div className="spot-meta">
            {e.venue && <MetaRow icon={MapPin}>{e.venue}</MetaRow>}
            <WhenRow e={e} />
          </div>
          <button className="spot-cta" onClick={onOpen} tabIndex={active ? 0 : -1}>
            Ver evento <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}
