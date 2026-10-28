import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, MapPin, Star } from 'lucide-react';
import type { EventItem } from './types';
import { FreeBadge, MetaRow, Placeholder, Tag, WhenRow } from './ui';

export interface Spot {
  e: EventItem;
  reasons: string[];
}

const INTERVAL = 6000;

// Slider dos eventos mais relevantes do dia: avança sozinho, pausa com o rato/foco, aceita deslizar no telemóvel.
export default function Spotlight({ spots, labels, title, onOpen }: { spots: Spot[]; labels: Record<string, string>; title: string; onOpen: (e: EventItem) => void }) {
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
        <div className="spot-nav">
          <button className="icon-btn" onClick={() => go(index - 1)} aria-label="Anterior">
            <ChevronLeft size={20} />
          </button>
          <button className="icon-btn" onClick={() => go(index + 1)} aria-label="Seguinte">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="spot-viewport">
        <div className="spot-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {spots.map(({ e, reasons }, i) => (
            <article key={e.id} className={i === index ? 'spot on' : 'spot'} aria-roledescription="slide" aria-label={`${i + 1} de ${n}`} aria-hidden={i !== index}>
              <button className="spot-media" onClick={() => onOpen(e)} tabIndex={i === index ? 0 : -1} aria-label={e.title}>
                {e.image ? <img src={e.image} alt="" draggable={false} /> : <Placeholder id={e.categories[0]} size={80} />}
                {e.isFree && <FreeBadge />}
              </button>
              <div className="spot-info">
                <p className="spot-rank">
                  <strong>{String(i + 1).padStart(2, '0')}</strong>
                  <span>/ {String(n).padStart(2, '0')}</span>
                </p>
                <Tag id={e.categories[0]} label={labels[e.categories[0]] ?? 'Outros'} />
                <h3>{e.title}</h3>
                <div className="spot-meta">
                  {e.venue && <MetaRow icon={MapPin}>{e.venue}</MetaRow>}
                  <WhenRow e={e} />
                </div>
                {reasons.length > 0 && (
                  <p className="why" title="Porque está em destaque">
                    {reasons.slice(0, 3).map((r) => (
                      <span key={r}>{r}</span>
                    ))}
                  </p>
                )}
                <button className="btn primary" onClick={() => onOpen(e)} tabIndex={i === index ? 0 : -1}>
                  Ver evento <ArrowRight size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="spot-dots" role="tablist" aria-label="Escolher destaque">
        {spots.map(({ e }, i) => (
          <button key={e.id} role="tab" aria-selected={i === index} aria-label={`Destaque ${i + 1}`} className={i === index ? 'on' : ''} onClick={() => go(i)}>
            {/* barra de progresso do avanço automático */}
            {i === index && !paused && n > 1 && <i key={index} style={{ animationDuration: `${INTERVAL}ms` }} />}
          </button>
        ))}
      </div>
    </section>
  );
}
