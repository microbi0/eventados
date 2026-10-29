import { ArrowUpRight, Building2, CalendarClock, Compass, Landmark, MapPinned, Mic2, ShieldCheck } from 'lucide-react';
import type { EventsData, SourceInfo } from '../types';
import { stagger } from '../ui';

const GROUPS: { kind: NonNullable<SourceInfo['kind']>; title: string; icon: typeof Landmark; text: string }[] = [
  { kind: 'agenda', title: 'Agendas municipais', icon: Building2, text: 'Agendas culturais publicadas pelas câmaras municipais.' },
  { kind: 'venue', title: 'Salas de espetáculos', icon: Landmark, text: 'Programação publicada pelos próprios teatros, coliseus e arenas.' },
  { kind: 'regional', title: 'Turismo regional', icon: Compass, text: 'Agendas das entidades regionais de turismo.' },
  { kind: 'agency', title: 'Agências e promotoras', icon: Mic2, text: 'Digressões completas dos artistas, incluindo as datas em salas mais pequenas de todo o país.' },
];

export default function About({ data }: { data: EventsData }) {
  const total = data.events.length;
  const cities = new Set(data.events.map((e) => e.city)).size;
  return (
    <div className="about">
      <section className="about-hero">
        <p className="eyebrow">Sobre</p>
        <h1>
          Toda a agenda cultural,
          <br />
          num só sítio.
        </h1>
        <p className="lead">
          O <strong>Eventados</strong> junta os eventos publicados pelas agendas municipais e pelas salas de espetáculos de Portugal e organiza-os por
          sítio, por tipo e por dia. Em vez de visitar dezenas de sites, encontras aqui o que está a acontecer perto de ti — e cada evento leva-te
          sempre à página original.
        </p>
        <div className="stats">
          <div style={stagger(0)}>
            <strong>{total.toLocaleString('pt-PT')}</strong>
            <span>eventos</span>
          </div>
          <div style={stagger(1)}>
            <strong>{cities}</strong>
            <span>concelhos</span>
          </div>
          <div style={stagger(2)}>
            <strong>{data.sources.length}</strong>
            <span>fontes</span>
          </div>
        </div>
      </section>

      <section className="about-points">
        <article style={stagger(0)}>
          <CalendarClock size={26} />
          <h3>Atualizado uma vez por dia</h3>
          <p>
            Os eventos são recolhidos automaticamente todas as madrugadas. A última atualização foi a{' '}
            {new Date(data.updatedAt).toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short' })}.
          </p>
        </article>
        <article style={stagger(1)}>
          <ShieldCheck size={26} />
          <h3>Respeito pelas fontes</h3>
          <p>
            Fazemos poucos pedidos, espaçados, e só o que cada site permite (robots.txt). Guardamos apenas o essencial e ligamos sempre à página
            oficial de cada evento.
          </p>
        </article>
        <article style={stagger(2)}>
          <MapPinned size={26} />
          <h3>Organizado por concelho</h3>
          <p>Cada evento é colocado no seu concelho a partir da localização da sala, usando os limites oficiais dos 308 concelhos.</p>
        </article>
      </section>

      {GROUPS.map(({ kind, title, icon: Icon, text }) => {
        const list = data.sources.filter((s) => (s.kind ?? 'agenda') === kind);
        if (!list.length) return null;
        return (
          <section key={kind} className="about-sources">
            <h2>
              <Icon size={22} /> {title}
            </h2>
            <p className="muted">{text}</p>
            <ul>
              {list.map((s, i) => (
                <li key={s.id} style={stagger(i)}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.count} eventos</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="about-note">
        <p>
          Os eventos pertencem às respetivas entidades organizadoras. Horários, preços e disponibilidade podem mudar: confirma sempre os detalhes no
          site de origem antes de sair de casa. Encontraste um erro ou queres sugerir uma agenda? Diz-nos.
        </p>
      </section>
    </div>
  );
}
