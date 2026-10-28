import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, MapPin, Star } from 'lucide-react';
import type { EventItem } from './types';
import { styleOf } from './categories';
import { FreeBadge, MetaRow, Placeholder, WhenRow } from './ui';

export interface Spot {
  e: EventItem;
  reasons: string[];
}

const INTERVAL = 6000;

type Tone = { dark: boolean; rgb: [number, number, number] };
const toneCache = new Map<string, Promise<Tone>>();

// Cor média e luminosidade da imagem (amostra 12×12 num canvas). As imagens das fontes permitem CORS;
// se alguma não permitir, assume-se imagem escura (texto claro sobre uma rampa escura).
function imageTone(url: string | null, fallback: string): Promise<Tone> {
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

function useTone(e: EventItem) {
  const [tone, setTone] = useState<Tone | null>(null);
  useEffect(() => {
    let alive = true;
    imageTone(e.image, styleOf(e.categories[0]).color).then((t) => alive && setTone(t));
    return () => {
      alive = false;
    };
  }, [e]);
  return tone;
}

// Slider dos eventos mais relevantes da semana: avança sozinho, pausa com o rato/foco, aceita deslizar no telemóvel.
export default function Spotlight({ spots, title, onOpen }: { spots: Spot[]; labels: Record<string, string>; title: string; onOpen: (e: EventItem) => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const n = spots.length;

  const go = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);

  useEffect(() => setIndex(0), [spots]);

  useEffect(() => {
    if (paused || n < 2) return;
    const t = window.setTimeout(() => go(index + 1), INTERVAL);
    return () => window.clearTimeout(t);
  }, [index, paused, n, go]);

  if (!n) return null;

  return (
    <section
      className="spotlight"
      aria-roledescription="carrossel"
      aria-label={title}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(ev) => {
        if (ev.key === 'ArrowRight') go(index + 1);
        if (ev.key === 'ArrowLeft') go(index - 1);
      }}
      onPointerDown={(ev) => (startX.current = ev.clientX)}
      onPointerUp={(ev) => {
        if (startX.current == null) return;
        const dx = ev.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="spot-head">
        <h2>
          <Star size={22} />
          {title}
        </h2>
      </div>

      <div className="spot-viewport">
        <div className="spot-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {spots.map(({ e }, i) => (
            <Slide key={e.id} e={e} active={i === index} label={`${i + 1} de ${n}`} onOpen={() => onOpen(e)} />
          ))}
        </div>

        <button className="spot-arrow prev" onClick={() => go(index - 1)} aria-label="Anterior">
          <ChevronLeft size={22} />
        </button>
        <button className="spot-arrow next" onClick={() => go(index + 1)} aria-label="Seguinte">
          <ChevronRight size={22} />
        </button>

        <div className="spot-dots" role="tablist" aria-label="Escolher destaque">
          {spots.map(({ e }, i) => (
            <button key={e.id} role="tab" aria-selected={i === index} aria-label={`Destaque ${i + 1}`} className={i === index ? 'on' : ''} onClick={() => go(i)}>
              {/* barra de progresso do avanço automático */}
              {i === index && !paused && n > 1 && <i key={index} style={{ animationDuration: `${INTERVAL}ms` }} />}
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
