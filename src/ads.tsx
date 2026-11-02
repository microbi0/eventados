import { useEffect, useRef, useState } from 'react';
import { Sparkles, Megaphone, ExternalLink, MapPin, CalendarDays } from 'lucide-react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export type AdStatus = 'loading' | 'filled' | 'unfilled';

/**
 * Configuração dos anúncios Google Ads / AdSense.
 * Pode ser configurada via variáveis de ambiente (.env) ou editando os valores aqui:
 * - VITE_GOOGLE_ADS_CLIENT: ID do editor (ex: 'ca-pub-1904724100833544')
 * - VITE_GOOGLE_ADS_SLOT_HOME: ID do bloco de anúncios para o banner da Home (opcional)
 * - VITE_GOOGLE_ADS_SLOT_EVENTS: ID do bloco de anúncios para os cartões entre eventos (opcional)
 */
export const ADS_CONFIG = {
  client: (import.meta.env.VITE_GOOGLE_ADS_CLIENT as string) || 'ca-pub-1904724100833544',
  slots: {
    homeBanner: (import.meta.env.VITE_GOOGLE_ADS_SLOT_HOME as string) || '',
    eventsFeed: (import.meta.env.VITE_GOOGLE_ADS_SLOT_EVENTS as string) || '',
  },
  isTestMode: Boolean(import.meta.env.DEV),
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
  slot?: string;
  format?: 'auto' | 'fluid' | 'rectangle' | 'horizontal';
  layout?: string;
  layoutKey?: string;
  className?: string;
  style?: React.CSSProperties;
  onStatusChange?: (status: AdStatus) => void;
}

/**
 * Componente base que encapsula o <ins class="adsbygoogle" /> e gere o ciclo de vida do anúncio.
 */
export function GoogleAdSlot({
  slot,
  format = 'auto',
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
      const iframe = el.querySelector('iframe');
      if (iframe && iframe.offsetHeight > 0) {
        onStatusChange?.('filled');
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
      childList: true,
      subtree: true,
    });

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const tryPush = (attempt = 0) => {
      if (pushedRef.current || !adRef.current) return;
      const status = adRef.current.getAttribute('data-adsbygoogle-status');
      if (status) {
        pushedRef.current = true;
        checkStatus();
        return;
      }
      if (adRef.current.offsetWidth === 0 && attempt < 10) {
        retryTimer = setTimeout(() => tryPush(attempt + 1), 150);
        return;
      }
      try {
        pushedRef.current = true;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.debug('Erro ao inicializar Google AdSense:', e);
        onStatusChange?.('unfilled');
      }
    };

    const raf = requestAnimationFrame(() => tryPush());

    // Se o AdSense for bloqueado (ex.: AdBlock) ou não devolver anúncio após 4s, ativa o fallback visual
    const fallbackTimer = setTimeout(() => {
      if (!checkStatus()) {
        const done = el.getAttribute('data-adsbygoogle-status');
        if (!done) {
          onStatusChange?.('unfilled');
        }
      }
    }, 4000);

    return () => {
      cancelAnimationFrame(raf);
      if (retryTimer) clearTimeout(retryTimer);
      clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, [slot, onStatusChange]);

  return (
    <ins
      ref={adRef}
      className={`adsbygoogle ${className ?? ''}`}
      style={{ display: 'block', width: '100%', ...(style ?? {}) }}
      data-ad-client={ADS_CONFIG.client}
      {...(slot ? { 'data-ad-slot': slot } : {})}
      data-ad-format={format}
      {...(layout ? { 'data-ad-layout': layout } : {})}
      {...(layoutKey ? { 'data-ad-layout-key': layoutKey } : {})}
      {...(ADS_CONFIG.isTestMode ? { 'data-adtest': 'on' } : {})}
      data-full-width-responsive="true"
    />
  );
}

/**
 * 1. Banner da Home (entre categorias e secções)
 */
export function HomeAdBanner() {
  const [status, setStatus] = useState<AdStatus>('loading');

  return (
    <section className="home-ad-banner" aria-label="Espaço publicitário">
      <div className="home-ad-header">
        <span className="ad-badge-tag">
          <Megaphone size={12} /> Publicidade
        </span>
        <span className="ad-provider-tag">Google Ads</span>
      </div>

      <div className="home-ad-content">
        <div
          className="home-ad-slot-wrap"
          style={{ display: status === 'unfilled' ? 'none' : 'block', width: '100%' }}
        >
          <GoogleAdSlot
            slot={ADS_CONFIG.slots.homeBanner}
            format="auto"
            className="home-ad-ins"
            onStatusChange={setStatus}
          />
        </div>

        {status === 'unfilled' && (
          <div className="ad-demo-banner">
            <div className="ad-demo-icon">
              <Sparkles size={24} />
            </div>
            <div className="ad-demo-text">
              <strong>Sugestões & Agenda Cultural</strong>
              <p>Descobre os melhores concertos, espetáculos de teatro, humor e exposições na tua cidade.</p>
            </div>
            <div className="ad-demo-pill">
              <span>Explorar</span>
              <ExternalLink size={14} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const AD_COVERS = [
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=800&auto=format&fit=crop&q=80',
];

/**
 * 2. Cartão de Anúncio entre os eventos (integrado na grelha e na lista compacta)
 */
export function EventAdCard({ compact, index = 0 }: { compact?: boolean; index?: number }) {
  const [status, setStatus] = useState<AdStatus>('loading');
  const coverImage = AD_COVERS[Math.floor(index / 6) % AD_COVERS.length] || AD_COVERS[0];

  if (compact) {
    return (
      <article className="row ad-row" style={{ animationDelay: `${(index % 30) * 30}ms` }} aria-label="Anúncio patrocinado">
        <div
          className="ad-row-slot"
          style={{ display: status === 'unfilled' ? 'none' : 'block', width: '100%' }}
        >
          <div className="home-ad-header">
            <span className="ad-badge-tag">
              <Megaphone size={11} /> Publicidade
            </span>
            <span className="ad-provider-tag">Google Ads</span>
          </div>
          <GoogleAdSlot
            slot={ADS_CONFIG.slots.eventsFeed}
            format="auto"
            className="ad-row-ins"
            onStatusChange={setStatus}
          />
        </div>

        {status === 'unfilled' && (
          <>
            <div className="row-thumb">
              <img src={coverImage} alt="Patrocinado" loading="lazy" />
              <span className="row-badge" style={{ background: '#fef3c7', color: '#92400e' }} title="Patrocinado">
                <Sparkles size={13} />
              </span>
            </div>
            <div className="row-body">
              <h3>Destaques Culturais & Sugestões</h3>
              <p className="row-meta">
                <span>
                  <Sparkles size={14} />
                  Patrocinado
                </span>
              </p>
              <p className="row-meta">
                <span>
                  <MapPin size={14} />
                  Portugal · Google Ads
                </span>
              </p>
            </div>
          </>
        )}
      </article>
    );
  }

  return (
    <article className="card ad-card" style={{ animationDelay: `${(index % 30) * 45}ms` }} aria-label="Anúncio patrocinado">
      <div
        className="ad-card-slot"
        style={{ display: status === 'unfilled' ? 'none' : 'flex' }}
      >
        <div className="home-ad-header">
          <span className="ad-badge-tag">
            <Megaphone size={12} /> Publicidade
          </span>
          <span className="ad-provider-tag">Google Ads</span>
        </div>
        <GoogleAdSlot
          slot={ADS_CONFIG.slots.eventsFeed}
          format="rectangle"
          className="ad-card-ins"
          onStatusChange={setStatus}
        />
      </div>

      {status === 'unfilled' && (
        <>
          <div className="media">
            <img src={coverImage} alt="Patrocinado" loading="lazy" />
            <span className="ad-badge-overlay">Patrocinado</span>
          </div>
          <div className="body">
            <span className="tag" style={{ background: '#fef3c7', color: '#92400e' }}>
              <Sparkles size={14} />
              Patrocinado
            </span>
            <h3>Destaques Culturais & Experiências em Portugal</h3>
            <p className="meta-row">
              <MapPin size={16} strokeWidth={2.2} />
              <span>Portugal · Google Ads</span>
            </p>
            <p className="meta-row">
              <CalendarDays size={16} strokeWidth={2.2} />
              <span>Sugestão recomendada</span>
            </p>
          </div>
        </>
      )}
    </article>
  );
}
