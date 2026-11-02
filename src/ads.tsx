import { useEffect, useRef } from 'react';
import { Megaphone } from 'lucide-react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Configuração dos anúncios Google Ads / AdSense.
 * - Client: ca-pub-1904724100833544
 * - Slot Banner (Home): 1160512650
 * - Slot In-Feed (Eventos): 6221267648 / 6449544534
 */
export const ADS_CONFIG = {
  client: (import.meta.env.VITE_GOOGLE_ADS_CLIENT as string) || 'ca-pub-1904724100833544',
  slots: {
    homeBanner: (import.meta.env.VITE_GOOGLE_ADS_SLOT_HOME as string) || '1160512650',
    eventsFeed: (import.meta.env.VITE_GOOGLE_ADS_SLOT_EVENTS as string) || '6221267648',
    eventsInFeedAlt: '6449544534',
  },
};

/**
 * Garante que o script do Google AdSense está carregado no documento.
 */
function useLoadAdSenseScript() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existing = document.querySelector('script[src*="pagead2.googlesyndication.com"]');
    if (!existing) {
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CONFIG.client}`;
      document.head.appendChild(script);
    }
  }, []);
}

interface AdSlotProps {
  slot: string;
  format?: 'auto' | 'fluid' | 'rectangle' | 'horizontal';
  layout?: string;
  layoutKey?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Componente base que encapsula exatamente o bloco <ins class="adsbygoogle" /> oficial do Google AdSense.
 */
export function GoogleAdSlot({
  slot,
  format = 'auto',
  layout,
  layoutKey,
  className,
  style,
}: AdSlotProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);
  useLoadAdSenseScript();

  useEffect(() => {
    const el = adRef.current;
    if (typeof window === 'undefined' || !el) return;

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const tryPush = (attempt = 0) => {
      if (pushedRef.current || !adRef.current) return;
      if (adRef.current.getAttribute('data-adsbygoogle-status')) {
        pushedRef.current = true;
        return;
      }
      if (adRef.current.offsetWidth === 0 && attempt < 15) {
        retryTimer = setTimeout(() => tryPush(attempt + 1), 150);
        return;
      }
      try {
        pushedRef.current = true;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.debug('Erro ao inicializar Google AdSense:', e);
      }
    };

    const raf = requestAnimationFrame(() => tryPush());

    return () => {
      cancelAnimationFrame(raf);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [slot]);

  return (
    <ins
      ref={adRef}
      className={`adsbygoogle ${className ?? ''}`.trim()}
      style={{ display: 'block', width: '100%', ...(style ?? {}) }}
      data-ad-client={ADS_CONFIG.client}
      data-ad-slot={slot}
      data-ad-format={format}
      {...(layout ? { 'data-ad-layout': layout } : {})}
      {...(layoutKey ? { 'data-ad-layout-key': layoutKey } : {})}
      data-full-width-responsive="true"
    />
  );
}

/**
 * 1. Banner da Home (bloco 1160512650)
 */
export function HomeAdBanner({ slot = ADS_CONFIG.slots.homeBanner }: { slot?: string }) {
  return (
    <section className="home-ad-banner" aria-label="Espaço publicitário">
      <div className="home-ad-header">
        <span className="ad-badge-tag">
          <Megaphone size={12} /> Publicidade
        </span>
        <span className="ad-provider-tag">Google Ads</span>
      </div>

      <div className="home-ad-content">
        <GoogleAdSlot
          slot={slot}
          format="auto"
          className="home-ad-ins"
        />
      </div>
    </section>
  );
}

/**
 * 2. Cartão de Anúncio In-Feed entre os eventos (bloco 6221267648 / 6449544534)
 */
export function EventAdCard({ compact, index = 0 }: { compact?: boolean; index?: number }) {
  // Usa o bloco 6221267648 (display/auto in-feed) como principal
  const slot = ADS_CONFIG.slots.eventsFeed;

  if (compact) {
    return (
      <article className="row ad-row" style={{ animationDelay: `${(index % 30) * 30}ms` }} aria-label="Anúncio patrocinado">
        <div className="ad-row-slot">
          <div className="home-ad-header">
            <span className="ad-badge-tag">
              <Megaphone size={11} /> Publicidade
            </span>
            <span className="ad-provider-tag">Google Ads</span>
          </div>
          <GoogleAdSlot
            slot={slot}
            format="auto"
            className="ad-row-ins"
          />
        </div>
      </article>
    );
  }

  return (
    <article className="card ad-card" style={{ animationDelay: `${(index % 30) * 45}ms` }} aria-label="Anúncio patrocinado">
      <div className="ad-card-slot">
        <div className="home-ad-header">
          <span className="ad-badge-tag">
            <Megaphone size={12} /> Publicidade
          </span>
          <span className="ad-provider-tag">Google Ads</span>
        </div>
        <GoogleAdSlot
          slot={slot}
          format="auto"
          className="ad-card-ins"
        />
      </div>
    </article>
  );
}
