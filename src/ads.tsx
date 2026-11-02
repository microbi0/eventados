import { useEffect, useRef, useState } from 'react';
import { Megaphone } from 'lucide-react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export type AdStatus = 'loading' | 'filled' | 'unfilled';

/**
 * Configuração dos anúncios Google Ads / AdSense.
 * - Client: ca-pub-1904724100833544
 * - Slot Banner (Home): 1160512650
 * - Slot In-Feed (Eventos): 6221267648 (e 6449544534)
 */
export const ADS_CONFIG = {
  client: (import.meta.env.VITE_GOOGLE_ADS_CLIENT as string) || 'ca-pub-1904724100833544',
  slots: {
    homeBanner: (import.meta.env.VITE_GOOGLE_ADS_SLOT_HOME as string) || '1160512650',
    eventsFeed: (import.meta.env.VITE_GOOGLE_ADS_SLOT_EVENTS as string) || '6221267648',
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
  fullWidthResponsive?: boolean;
  layout?: string;
  layoutKey?: string;
  className?: string;
  style?: React.CSSProperties;
  onStatusChange?: (status: AdStatus) => void;
}

/**
 * Componente base que encapsula o bloco <ins class="adsbygoogle" /> e deteta se o anúncio foi preenchido.
 */
export function GoogleAdSlot({
  slot,
  format = 'auto',
  fullWidthResponsive = true,
  layout,
  layoutKey,
  className,
  style,
  onStatusChange,
}: AdSlotProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);
  useLoadAdSenseScript();

  useEffect(() => {
    const el = adRef.current;
    if (typeof window === 'undefined' || !el) return;

    const checkStatus = () => {
      const adStatus = el.getAttribute('data-ad-status');
      if (adStatus === 'filled') {
        onStatusChange?.('filled');
        return true;
      }
      if (adStatus === 'unfilled') {
        onStatusChange?.('unfilled');
        return true;
      }
      return false;
    };

    const observer = new MutationObserver(() => {
      checkStatus();
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['data-ad-status', 'data-adsbygoogle-status'],
    });

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const tryPush = (attempt = 0) => {
      if (pushedRef.current || !adRef.current) return;
      if (adRef.current.getAttribute('data-adsbygoogle-status')) {
        pushedRef.current = true;
        checkStatus();
        return;
      }
      if (adRef.current.offsetWidth === 0 && attempt < 15) {
        retryTimer = setTimeout(() => tryPush(attempt + 1), 150);
        return;
      }
      try {
        pushedRef.current = true;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        onStatusChange?.('unfilled');
      }
    };

    const raf = requestAnimationFrame(() => tryPush());

    return () => {
      cancelAnimationFrame(raf);
      if (retryTimer) clearTimeout(retryTimer);
      observer.disconnect();
    };
  }, [slot, onStatusChange]);

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
      data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
    />
  );
}

/**
 * 1. Banner da Home — só mostra a moldura se o anúncio for preenchido (`filled`), e desaparece se `unfilled`.
 */
export function HomeAdBanner({ slot = ADS_CONFIG.slots.homeBanner }: { slot?: string }) {
  const [status, setStatus] = useState<AdStatus>('loading');

  if (status === 'unfilled') return null;

  return (
    <section
      className={`home-ad-banner ${status === 'loading' ? 'ad-loading' : ''}`.trim()}
      aria-label="Espaço publicitário"
    >
      {status === 'filled' && (
        <div className="home-ad-header">
          <span className="ad-badge-tag">
            <Megaphone size={12} /> Publicidade
          </span>
          <span className="ad-provider-tag">Google Ads</span>
        </div>
      )}

      <div className="home-ad-content">
        <GoogleAdSlot
          slot={slot}
          format="auto"
          fullWidthResponsive={true}
          className="home-ad-ins"
          onStatusChange={setStatus}
        />
      </div>
    </section>
  );
}

/**
 * 2. Cartão de Anúncio In-Feed entre os eventos — só mostra a moldura se `filled`, e desaparece se `unfilled`.
 */
export function EventAdCard({ compact, index = 0 }: { compact?: boolean; index?: number }) {
  const [status, setStatus] = useState<AdStatus>('loading');
  const slot = ADS_CONFIG.slots.eventsFeed;

  if (status === 'unfilled') return null;

  if (compact) {
    return (
      <article
        className={`row ad-row ${status === 'loading' ? 'ad-loading' : ''}`.trim()}
        style={{ animationDelay: `${(index % 30) * 30}ms` }}
        aria-label="Anúncio patrocinado"
      >
        <div className="ad-row-slot">
          {status === 'filled' && (
            <div className="home-ad-header">
              <span className="ad-badge-tag">
                <Megaphone size={11} /> Publicidade
              </span>
              <span className="ad-provider-tag">Google Ads</span>
            </div>
          )}
          <GoogleAdSlot
            slot={slot}
            format="auto"
            fullWidthResponsive={false}
            className="ad-row-ins"
            onStatusChange={setStatus}
          />
        </div>
      </article>
    );
  }

  return (
    <article
      className={`card ad-card ${status === 'loading' ? 'ad-loading' : ''}`.trim()}
      style={{ animationDelay: `${(index % 30) * 45}ms` }}
      aria-label="Anúncio patrocinado"
    >
      <div className="ad-card-slot">
        {status === 'filled' && (
          <div className="home-ad-header">
            <span className="ad-badge-tag">
              <Megaphone size={12} /> Publicidade
            </span>
            <span className="ad-provider-tag">Google Ads</span>
          </div>
        )}
        <GoogleAdSlot
          slot={slot}
          format="auto"
          fullWidthResponsive={false}
          className="ad-card-ins"
          onStatusChange={setStatus}
        />
      </div>
    </article>
  );
}
