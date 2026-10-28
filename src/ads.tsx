import { useEffect, useRef, useState } from 'react';
import { Sparkles, Megaphone, ExternalLink, MapPin, CalendarDays } from 'lucide-react';

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
  client: (import.meta.env.VITE_GOOGLE_ADS_CLIENT as string) || 'ca-pub-1904724100833544',
  slots: {
    homeBanner: (import.meta.env.VITE_GOOGLE_ADS_SLOT_HOME as string) || '',
    eventsFeed: (import.meta.env.VITE_GOOGLE_ADS_SLOT_EVENTS as string) || '',
  },
  // Se ainda não tiverem sido configurados IDs de bloco específicos (slots),
  // mantém o layout visual preparado e previne erros no adsbygoogle.push
  hasConfiguredSlots: Boolean(
    import.meta.env.VITE_GOOGLE_ADS_SLOT_HOME || import.meta.env.VITE_GOOGLE_ADS_SLOT_EVENTS
  ),
  isTestMode: import.meta.env.DEV,
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
    if (ADS_CONFIG.isTestMode || !slot) return;
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

  if (ADS_CONFIG.isTestMode || !slot) {
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
  const hasSlot = Boolean(ADS_CONFIG.slots.homeBanner);

  return (
    <section className="home-ad-banner" aria-label="Espaço publicitário">
      <div className="home-ad-header">
        <span className="ad-badge-tag">
          <Megaphone size={12} /> Publicidade
        </span>
        <span className="ad-provider-tag">Google Ads</span>
      </div>

      <div className="home-ad-content">
        {hasSlot && (
          <GoogleAdSlot slot={ADS_CONFIG.slots.homeBanner} format="horizontal" className="home-ad-ins" />
        )}

        {/* Pré-visualização elegante quando em modo teste ou sem bloco específico atribuído */}
        {(!hasSlot || ADS_CONFIG.isTestMode) && (
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

const AD_COVERS = [
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=800&auto=format&fit=crop&q=80',
];

/**
 * 2. Cartão de Anúncio entre os eventos (idêntico visualmente a um EventCard)
 */
export function EventAdCard({ compact, index = 0 }: { compact?: boolean; index?: number }) {
  const hasSlot = Boolean(ADS_CONFIG.slots.eventsFeed);
  const coverImage = AD_COVERS[Math.floor(index / 30) % AD_COVERS.length] || AD_COVERS[0];

  if (compact) {
    // Formato Linha (compacto quando o detalhe lateral está aberto - idêntico a EventRow)
    return (
      <article className="row ad-row" style={{ animationDelay: `${(index % 30) * 30}ms` }} aria-label="Anúncio patrocinado">
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
          {hasSlot && (
            <GoogleAdSlot slot={ADS_CONFIG.slots.eventsFeed} format="fluid" layout="in-article" />
          )}
        </div>
      </article>
    );
  }

  // Formato Cartão (grelha normal - idêntico a EventCard)
  return (
    <article className="card ad-card" style={{ animationDelay: `${(index % 30) * 45}ms` }} aria-label="Anúncio patrocinado">
      <div className="media">
        <img src={coverImage} alt="Patrocinado" loading="lazy" />
        <span className="ad-badge-overlay">Patrocinado</span>
        {hasSlot && (
          <GoogleAdSlot slot={ADS_CONFIG.slots.eventsFeed} format="fluid" layoutKey="-fb+5w+4e-db+86" className="ad-card-ins" />
        )}
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
    </article>
  );
}
