// Google Analytics 4 com Consent Mode v2 (RGPD): até o visitante aceitar, nada fica guardado em cookies
// e o Google só recebe medições anónimas. O ID vem de VITE_GA_ID (ex.: G-XXXXXXXXXX); sem ID, nada é carregado.
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;
const CONSENT_KEY = 'consent-analytics';

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

export type Consent = 'granted' | 'denied' | null;

export function storedConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

let started = false;

export function initAnalytics() {
  if (!GA_ID || started) return;
  started = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  const consent = storedConsent();
  // Por omissão tudo recusado; se o visitante já tinha aceitado, aplica-se logo.
  window.gtag('consent', 'default', {
    analytics_storage: consent === 'granted' ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });
  window.gtag('js', new Date());
  // page_view é enviado à mão a cada mudança de página da app.
  window.gtag('config', GA_ID, { send_page_view: false, anonymize_ip: true });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

export function setConsent(value: 'granted' | 'denied') {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* sem armazenamento: a escolha vale só para esta visita */
  }
  window.gtag?.('consent', 'update', { analytics_storage: value });
}

export const analyticsEnabled = () => !!GA_ID;

export function trackPage(page: string, title: string) {
  window.gtag?.('event', 'page_view', { page_title: title, page_location: `${location.origin}${location.pathname}#/${page === 'home' ? '' : page}` });
}

export function trackEvent(name: string, params: Record<string, unknown>) {
  window.gtag?.('event', name, params);
}
