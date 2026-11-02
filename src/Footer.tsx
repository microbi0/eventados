import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type FormEvent, type MouseEvent } from 'react';
import { AlertCircle, CheckCircle2, Info, Landmark, Mail, MapPinned, Send, X } from 'lucide-react';
import type { EventsData } from './types';
import type { Page } from './hooks';
import { trackEvent } from './analytics';

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
  const venues = new Set<string>();

  for (const e of data.events) {
    if (e.city) cities.add(e.city.trim());
    if (e.venue) {
      const norm = e.venue.trim().toLowerCase().replace(/\s+/g, ' ');
      if (norm) venues.add(norm);
    }
  }

  return {
    municipios: cities.size,
    salas: venues.size,
    totalSources: data.sources.length,
    totalEvents: data.events.length,
  };
}

// Permite abrir o popup de contacto a partir de qualquer ponto da app (ex.: página Sobre).
export function openContactPopup() {
  window.dispatchEvent(new CustomEvent('open-contact-modal'));
}

export default function Footer({ data, page, go }: { data: EventsData; page: Page; go: (p: Page) => void }) {
  const stats = useMemo(() => computePropagation(data), [data]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const idPrefix = useId();
  const dialogTitleId = `${idPrefix}-dialog-title`;
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

  const openModal = () => {
    const dlg = dialogRef.current;
    if (dlg && !dlg.open) {
      dlg.showModal();
    }
  };

  const closeModal = () => {
    dialogRef.current?.close();
  };

  useEffect(() => {
    const onOpen = () => openModal();
    window.addEventListener('open-contact-modal', onOpen);
    return () => window.removeEventListener('open-contact-modal', onOpen);
  }, []);

  // Fallback para browsers sem suporte nativo a <dialog closedby="any">
  const handleDialogClick = (ev: MouseEvent<HTMLDialogElement>) => {
    const dlg = dialogRef.current;
    if (!dlg || ev.target !== dlg) return;
    if ('closedBy' in HTMLDialogElement.prototype) return;
    const rect = dlg.getBoundingClientRect();
    const inside =
      rect.top <= ev.clientY &&
      ev.clientY <= rect.top + rect.height &&
      rect.left <= ev.clientX &&
      ev.clientX <= rect.left + rect.width;
    if (!inside) dlg.close();
  };

  const syncAriaInvalid = (el: HTMLInputElement | HTMLTextAreaElement) => {
    try {
      const invalid = el.matches(':user-invalid') || (el.classList.contains('user-invalid-fallback') && !el.validity.valid);
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
      form.querySelector<HTMLElement>(':invalid')?.focus();
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

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
      setErrorMsg('Não foi possível enviar agora. Tenta novamente.');
    }
  };

  return (
    <>
      <footer className="site-footer" aria-label="Rodapé">
        <div className="footer-bar">
          <div className="footer-left">
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
            <span className="footer-tagline">Agenda cultural de Portugal, recolhida automaticamente todos os dias.</span>
          </div>

          <div className="footer-stats" aria-label="Propagação na plataforma">
            <span className="footer-stat">
              <MapPinned size={15} />
              <strong>{stats.municipios}</strong> municípios
            </span>
            <span className="footer-stat">
              <Landmark size={15} />
              <strong>{stats.salas.toLocaleString('pt-PT')}</strong> salas
            </span>
          </div>

          <div className="footer-actions">
            <button
              type="button"
              className={page === 'sobre' ? 'footer-btn on' : 'footer-btn'}
              onClick={() => go('sobre')}
            >
              <Info size={15} />
              Sobre
            </button>
            <button type="button" className="footer-btn primary" onClick={openModal}>
              <Mail size={15} />
              Contactos
            </button>
          </div>
        </div>
      </footer>

      <dialog
        ref={dialogRef}
        className="contact-dialog"
        aria-labelledby={dialogTitleId}
        onClick={handleDialogClick}
        {...({ closedby: 'any' } as Record<string, string>)}
      >
        <div className="contact-dialog-box">
          <div className="sheet-head">
            <h2 id={dialogTitleId}>Contactos</h2>
            <button type="button" className="icon-btn" onClick={closeModal} aria-label="Fechar">
              <X size={20} />
            </button>
          </div>

          <form className="contact-form" onSubmit={handleSubmit} noValidate>
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
                  Formato: nome@exemplo.pt
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
                rows={4}
                maxLength={2000}
                placeholder="Escreve aqui a tua mensagem…"
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
                  <CheckCircle2 size={16} /> Mensagem enviada!
                </p>
              )}
              {status === 'error' && (
                <p className="contact-feedback err" role="alert" aria-live="assertive">
                  <AlertCircle size={16} /> {errorMsg}
                </p>
              )}
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
