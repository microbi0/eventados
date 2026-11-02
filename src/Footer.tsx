import { useId, useMemo, useState, type FocusEvent, type FormEvent } from 'react';
import { Building2, CheckCircle2, Compass, Info, Landmark, Mail, MapPinned, Send, Sparkles, AlertCircle } from 'lucide-react';
import type { EventsData } from './types';
import type { Page } from './hooks';
import { trackEvent } from './analytics';

const TOTAL_PORTUGAL_MUNICIPIOS = 308;
const SUBJECTS = ['Pedido', 'Sugestão', 'Informações'] as const;
type Subject = (typeof SUBJECTS)[number];

// Destino codificado (XOR 0x5a) para nunca expor o endereço de email em texto simples no código ou na página.
const TARGET_BYTES = [51, 55, 26, 41, 59, 52, 62, 40, 53, 61, 59, 40, 57, 51, 59, 116, 42, 46];
function resolveEndpoint(): string {
  const custom = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_CONTACT_ENDPOINT;
  if (custom) return custom;
  const recipient = String.fromCharCode(...TARGET_BYTES.map((b) => b ^ 0x5a));
  return `https://formsubmit.co/ajax/${recipient}`;
}

export function computePropagation(data: EventsData) {
  const cities = new Set<string>();
  const districts = new Set<string>();
  const venues = new Set<string>();

  for (const e of data.events) {
    if (e.city) cities.add(e.city.trim());
    if (e.district) districts.add(e.district.trim());
    if (e.venue) {
      const norm = e.venue
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (norm) venues.add(norm);
    }
  }

  const venueSources = data.sources.filter((s) => s.kind === 'venue').length;
  const agendaSources = data.sources.filter((s) => (s.kind ?? 'agenda') === 'agenda').length;
  const coveragePct = Math.min(100, Math.round((cities.size / TOTAL_PORTUGAL_MUNICIPIOS) * 100));

  return {
    municipios: cities.size,
    totalMunicipios: TOTAL_PORTUGAL_MUNICIPIOS,
    coveragePct,
    districts: districts.size,
    salas: venues.size,
    venueSources,
    agendaSources,
    totalSources: data.sources.length,
    totalEvents: data.events.length,
  };
}

export default function Footer({ data, page, go }: { data: EventsData; page: Page; go: (p: Page) => void }) {
  const stats = useMemo(() => computePropagation(data), [data]);

  const idPrefix = useId();
  const nameId = `${idPrefix}-name`;
  const nameErrId = `${idPrefix}-name-err`;
  const emailId = `${idPrefix}-email`;
  const emailHintId = `${idPrefix}-email-hint`;
  const emailErrId = `${idPrefix}-email-err`;
  const msgId = `${idPrefix}-msg`;
  const msgErrId = `${idPrefix}-msg-err`;
  const honeyId = `${idPrefix}-website`;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState<Subject>('Pedido');
  const [message, setMessage] = useState('');
  const [honey, setHoney] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Sincroniza aria-invalid com o estado nativo :user-invalid em blur e input.
  const syncAriaInvalid = (el: HTMLInputElement | HTMLTextAreaElement) => {
    try {
      const invalid = el.matches(':user-invalid') || (el.classList.contains('user-invalid-fallback') && !el. validity.valid);
      el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    } catch {
      el.setAttribute('aria-invalid', !el.validity.valid ? 'true' : 'false');
    }
  };

  const handleBlur = (ev: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = ev.currentTarget;
    if (el.value.length > 0 && !el.validity.valid) {
      el.classList.add('user-invalid-fallback');
    } else {
      el.classList.remove('user-invalid-fallback');
    }
    syncAriaInvalid(el);
  };

  const handleInput = (ev: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = ev.currentTarget;
    if (el.validity.valid) {
      el.classList.remove('user-invalid-fallback');
    }
    if (el.hasAttribute('aria-invalid')) {
      syncAriaInvalid(el);
    }
    if (status === 'error' || status === 'sent') {
      setStatus('idle');
    }
  };

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (status === 'sending') return;

    // Honeypot anti-spam
    if (honey.trim() !== '') {
      setStatus('sent');
      return;
    }

    const form = ev.currentTarget;
    if (!form.checkValidity()) {
      const controls = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
      controls.forEach((c) => {
        if (!c.validity.valid) c.classList.add('user-invalid-fallback');
        syncAriaInvalid(c);
      });
      const firstInvalid = form.querySelector<HTMLElement>(':invalid');
      firstInvalid?.focus();
      return;
    }

    setStatus('sending');
    setErrorMsg('');

    try {
      const res = await fetch(resolveEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          Nome: name.trim(),
          Email: email.trim(),
          Assunto: subject,
          Mensagem: message.trim(),
          _subject: `[Eventados · ${subject}] ${name.trim()}`,
          _replyto: email.trim(),
          _template: 'table',
          _captcha: 'false',
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      trackEvent('contact_submit', { subject });
      setStatus('sent');
      setName('');
      setEmail('');
      setSubject('Pedido');
      setMessage('');
      form.querySelectorAll<HTMLElement>('.user-invalid-fallback, [aria-invalid]').forEach((el) => {
        el.classList.remove('user-invalid-fallback');
        el.removeAttribute('aria-invalid');
      });
    } catch {
      setStatus('error');
      setErrorMsg('Não foi possível enviar a mensagem agora. Verifica a tua ligação e tenta novamente.');
    }
  };

  const updatedDate = new Date(data.updatedAt).toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <footer className="site-footer" aria-label="Rodapé do site">
      <div className="footer-inner">
        <div className="footer-grid">
          {/* 1. SOBRE */}
          <section className="footer-col footer-about" aria-labelledby="footer-about-title">
            <div className="footer-brand-row">
              <a
                className="brand footer-brand"
                href="#/"
                onClick={(e) => {
                  e.preventDefault();
                  go('home');
                }}
              >
                Eventados
              </a>
              <span className="footer-badge">
                <Sparkles size={13} /> Curadoria automática
              </span>
            </div>

            <h2 id="footer-about-title" className="footer-heading">
              Sobre a plataforma
            </h2>
            <p className="footer-text">
              O <strong>Eventados</strong> reúne todos os dias a agenda cultural de Portugal a partir das agendas municipais, salas de espetáculos,
              entidades de turismo e promotoras — organizada por concelho, categoria e data.
            </p>
            <p className="footer-text muted">
              Sem bilheteiras comerciais nem destaques pagos: cada evento liga sempre diretamente à fonte oficial.
            </p>

            <div className="footer-links" aria-label="Atalhos">
              <button type="button" className={page === 'home' ? 'footer-pill on' : 'footer-pill'} onClick={() => go('home')}>
                Início
              </button>
              <button type="button" className={page === 'eventos' ? 'footer-pill on' : 'footer-pill'} onClick={() => go('eventos')}>
                Eventos
              </button>
              <button type="button" className={page === 'artistas' ? 'footer-pill on' : 'footer-pill'} onClick={() => go('artistas')}>
                Artistas
              </button>
              <button type="button" className={page === 'mapa' ? 'footer-pill on' : 'footer-pill'} onClick={() => go('mapa')}>
                Mapa
              </button>
              <button type="button" className={page === 'meus' ? 'footer-pill on' : 'footer-pill'} onClick={() => go('meus')}>
                Os meus eventos
              </button>
              <button type="button" className={page === 'sobre' ? 'footer-pill on' : 'footer-pill'} onClick={() => go('sobre')}>
                <Info size={14} /> Sobre e fontes ({stats.totalSources})
              </button>
            </div>
          </section>

          {/* 2. PROPAGAÇÃO */}
          <section className="footer-col footer-reach" aria-labelledby="footer-reach-title">
            <h2 id="footer-reach-title" className="footer-heading">
              <Compass size={19} /> Propagação em Portugal
            </h2>
            <p className="footer-text muted">
              Cobertura atual da plataforma no território nacional, calculada automaticamente a partir dos eventos em agenda.
            </p>

            <div className="reach-cards">
              <div className="reach-card">
                <div className="reach-card-top">
                  <span className="reach-icon">
                    <MapPinned size={18} />
                  </span>
                  <span className="reach-tag">{stats.coveragePct}% do país</span>
                </div>
                <strong className="reach-number">{stats.municipios}</strong>
                <span className="reach-label">municípios presentes</span>
                <div className="reach-bar" role="progressbar" aria-valuenow={stats.municipios} aria-valuemin={0} aria-valuemax={stats.totalMunicipios} aria-label="Municípios com eventos na plataforma">
                  <span style={{ width: `${stats.coveragePct}%` }} />
                </div>
                <small className="reach-sub">
                  Em {stats.totalMunicipios} concelhos · {stats.districts} distritos e regiões
                </small>
              </div>

              <div className="reach-card">
                <div className="reach-card-top">
                  <span className="reach-icon">
                    <Landmark size={18} />
                  </span>
                  <span className="reach-tag">{stats.venueSources} salas diretas</span>
                </div>
                <strong className="reach-number">{stats.salas.toLocaleString('pt-PT')}</strong>
                <span className="reach-label">salas e espaços</span>
                <small className="reach-sub">
                  Teatros, auditórios, coliseus, museus e centros culturais com programação
                </small>
              </div>
            </div>

            <div className="reach-summary">
              <span>
                <Building2 size={15} />
                <strong>{stats.totalEvents.toLocaleString('pt-PT')}</strong> eventos ativos
              </span>
              <span className="reach-dot" aria-hidden="true">·</span>
              <span>
                <strong>{stats.totalSources}</strong> fontes oficiais
              </span>
            </div>
          </section>

          {/* 3. CONTACTOS */}
          <section id="contactos" className="footer-col footer-contact" aria-labelledby="footer-contact-title">
            <h2 id="footer-contact-title" className="footer-heading">
              <Mail size={19} /> Contactos
            </h2>
            <p className="footer-text muted">
              Queres sugerir uma sala ou agenda municipal, fazer um pedido ou pedir informações? Escreve-nos por aqui.
            </p>

            <form className="contact-form" onSubmit={handleSubmit} noValidate>
              {/* Campo honeypot invisível para proteção contra spam */}
              <div className="visually-hidden" aria-hidden="true">
                <label htmlFor={honeyId}>Website</label>
                <input
                  type="text"
                  id={honeyId}
                  name="_honey"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honey}
                  onChange={(e) => setHoney(e.target.value)}
                />
              </div>

              <div className="contact-row">
                <div className="form-field">
                  <label htmlFor={nameId}>Nome</label>
                  <input
                    type="text"
                    id={nameId}
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    placeholder="O teu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleBlur}
                    onInput={handleInput}
                    aria-errormessage={nameErrId}
                  />
                  <span id={nameErrId} className="field-error" role="alert">
                    <AlertCircle size={13} aria-hidden="true" /> Indica o teu nome.
                  </span>
                </div>

                <div className="form-field">
                  <label htmlFor={emailId}>Email</label>
                  <span id={emailHintId} className="field-hint">
                    Para te podermos responder
                  </span>
                  <input
                    type="email"
                    id={emailId}
                    name="email"
                    autoComplete="email"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    required
                    maxLength={160}
                    placeholder="nome@exemplo.pt"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={handleBlur}
                    onInput={handleInput}
                    aria-describedby={emailHintId}
                    aria-errormessage={emailErrId}
                  />
                  <span id={emailErrId} className="field-error" role="alert">
                    <AlertCircle size={13} aria-hidden="true" /> Introduz um email válido.
                  </span>
                </div>
              </div>

              <fieldset className="form-fieldset">
                <legend>Assunto</legend>
                <div className="subject-radios">
                  {SUBJECTS.map((item) => (
                    <label key={item} className={subject === item ? 'subject-option on' : 'subject-option'}>
                      <input
                        type="radio"
                        name="subject"
                        value={item}
                        checked={subject === item}
                        onChange={() => setSubject(item)}
                        className="visually-hidden"
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="form-field">
                <label htmlFor={msgId}>Mensagem</label>
                <textarea
                  id={msgId}
                  name="message"
                  required
                  rows={3}
                  maxLength={2000}
                  placeholder="Escreve aqui o teu pedido, sugestão de agenda/sala ou questão…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onBlur={handleBlur}
                  onInput={handleInput}
                  aria-errormessage={msgErrId}
                />
                <span id={msgErrId} className="field-error" role="alert">
                  <AlertCircle size={13} aria-hidden="true" /> Escreve a tua mensagem.
                </span>
              </div>

              <div className="contact-actions">
                <button type="submit" className="btn primary contact-submit" disabled={status === 'sending'}>
                  <Send size={16} />
                  {status === 'sending' ? 'A enviar…' : 'Enviar mensagem'}
                </button>

                {status === 'sent' && (
                  <p className="contact-feedback ok" role="status" aria-live="polite">
                    <CheckCircle2 size={16} /> Mensagem enviada com sucesso! Obrigado.
                  </p>
                )}
                {status === 'error' && (
                  <p className="contact-feedback err" role="alert" aria-live="assertive">
                    <AlertCircle size={16} /> {errorMsg}
                  </p>
                )}
              </div>
            </form>
          </section>
        </div>

        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} <strong>Eventados</strong> · Agenda cultural de Portugal ({stats.municipios} municípios · {stats.salas.toLocaleString('pt-PT')} salas)
          </p>
          <p className="muted">Última recolha: {updatedDate}</p>
        </div>
      </div>
    </footer>
  );
}
