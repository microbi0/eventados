import { useEffect, useRef, useState } from 'react';
import { Sparkles, Megaphone, ExternalLink, Info } from 'lucide-react';

declare global {
  interface Window {
    adsbygoogle?: any[];
  }
}

/**
 * Configuração dos anúncios Google Ads / AdSense.
 * Pode ser configurada via variáveis de ambiente (.env) ou editando os valores aqui:
 * - VITE_GOOGLE_ADS_CLIENT: ID do editor (ex: 'ca-pub-1234567890123456')
 * - VITE_GOOGLE_ADS_SLOT_HOME: ID do bloco de anúncios para o banner da Home
 * - VITE_GOOGLE_ADS_SLOT_EVENTS: ID do bloco de anúncios para os cartões entre eventos
 */
export const ADS_CONFIG = {
  client: (import.meta.env.VITE_GOOGLE_ADS_CLIENT as string) || 'ca-pub-XXXXXXXXXXXXXXXX',
  slots: {
    homeBanner: (import.meta.env.VITE_GOOGLE_ADS_SLOT_HOME as string) || '1234567890',
    eventsFeed: (import.meta.env.VITE_GOOGLE_ADS_SLOT_EVENTS as string) || '0987654321',
  },
  // Ativa modo teste/demonstração quando não há um client ID real configurado
  isTestMode:
    import.meta.env.DEV ||
    !import.meta.env.VITE_GOOGLE_ADS_CLIENT ||
    import.meta.env.VITE_GOOGLE_ADS_CLIENT.includes('XXXX'),
};

/**
 * Garante que o script do Google AdSense é carregado quando há um client ID válido.
 */
function useLoadAdSenseScript() {
  useEffect(() => {
    if (typeof window === 'undefined' || ADS_CONFIG.isTestMode) return;
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
 * Componente base que encapsula o <ins class="adsbygoogle" />.
 */
export function GoogleAdSlot({ slot, format = 'auto', layout, layoutKey, className, style }: AdSlotProps) {
  const adRef = useRef<HTMLModElement>(null);
  const [adLoaded, setAdLoaded] = useState(false);
  useLoadAdSenseScript();

  useEffect(() => {
    if (ADS_CONFIG.isTestMode) return;
    try {
      if (typeof window !== 'undefined' && adRef.current) {
        // Evita chamadas duplicadas
        const isFilled = adRef.current.getAttribute('data-adsbygoogle-status');
        if (!isFilled) {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          setAdLoaded(true);
        }
      }
    } catch (e) {
      console.debug('Erro ao inicializar Google AdSense:', e);
    }
  }, [slot]);

  if (ADS_CONFIG.isTestMode) {
    return null;
  }

  return (
    <ins
      ref={adRef}
      className={`adsbygoogle ${className ?? ''}`}
      style={{ display: 'block', ...(style ?? {}) }}
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
 * 1. Banner da Home (entre categorias e secções)
 */
export function HomeAdBanner() {
  return (
    <section className="home-ad-banner" aria-label="Espaço publicitário">
      <div className="home-ad-header">
        <span className="ad-badge-tag">
          <Megaphone size={12} /> Publicidade
        </span>
        <span className="ad-provider-tag">Google Ads</span>
      </div>

      <div className="home-ad-content">
        <GoogleAdSlot slot={ADS_CONFIG.slots.homeBanner} format="horizontal" className="home-ad-ins" />

        {/* Pré-visualização elegante quando em modo teste ou sem anúncios servidos */}
        {ADS_CONFIG.isTestMode && (
          <div className="ad-demo-banner">
            <div className="ad-demo-icon">
              <Sparkles size={24} />
            </div>
            <div className="ad-demo-text">
              <strong>Anúncio Google Ads</strong>
              <p>Espaço reservado para banner responsivo entre categorias (AdSense / AdMob).</p>
            </div>
            <div className="ad-demo-pill">
              <span>Saber mais</span>
              <ExternalLink size={14} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * 2. Cartão de Anúncio entre os eventos (idêntico visualmente a um EventCard)
 */
export function EventAdCard({ compact, index = 0 }: { compact?: boolean; index?: number }) {
  if (compact) {
    // Formato Linha (compacto quando o detalhe lateral está aberto)
    return (
      <article className="row ad-row" style={{ animationDelay: `${index * 30}ms` }} aria-label="Anúncio patrocinado">
        <div className="row-thumb ad-thumb">
          <div className="ad-thumb-placeholder">
            <Sparkles size={22} strokeWidth={1.75} />
          </div>
          <span className="row-badge ad-badge" title="Patrocinado">
            <Info size={13} />
          </span>
        </div>
        <div className="row-body">
          <div className="ad-row-tags">
            <span className="tag ad-tag">Patrocinado</span>
            <small className="ad-sublabel">Google Ads</small>
          </div>
          <h3>Espaço Patrocinado</h3>
          <p className="row-meta">
            <span>Destaque promovido para eventos, cultura e lazer</span>
          </p>
          <GoogleAdSlot slot={ADS_CONFIG.slots.eventsFeed} format="fluid" layout="in-article" />
        </div>
      </article>
    );
  }

  // Formato Cartão (grelha normal)
  return (
    <article className="card ad-card" style={{ animationDelay: `${index * 45}ms` }} aria-label="Anúncio patrocinado">
      <div className="media ad-media">
        <div className="ad-media-art">
          <div className="ad-icon-halo">
            <Sparkles size={38} strokeWidth={1.5} />
          </div>
          <div className="ad-floating-badge">
            <span>Patrocinado</span>
          </div>
        </div>

        {/* Injeção real do AdSense */}
        <GoogleAdSlot slot={ADS_CONFIG.slots.eventsFeed} format="fluid" layoutKey="-fb+5w+4e-db+86" className="ad-card-ins" />
      </div>

      <div className="body">
        <div className="ad-meta-row">
          <span className="tag ad-tag">Anúncio</span>
          <span className="ad-sublabel">Google Ads</span>
        </div>
        <h3>Sugestão Patrocinada</h3>
        <p className="subtitle">Descobre serviços, marcas e eventos em destaque na tua região.</p>
        <div className="ad-action-row">
          <span className="ad-learn-more">
            Patrocinado <ExternalLink size={13} />
          </span>
        </div>
      </div>
    </article>
  );
}
