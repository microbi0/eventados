import {
  Baby,
  Clapperboard,
  Drama,
  FlaskConical,
  Footprints,
  Laugh,
  PersonStanding,
  LayoutGrid,
  MessagesSquare,
  Music,
  Palette,
  PartyPopper,
  PencilRuler,
  Sparkles,
  Trees,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

// Cor e ícone de cada tipo de evento. Paleta harmoniosa: mesma luminosidade e intensidade (OKLCH L 0.80, C 0.105)
// com o tom distribuído pelo círculo cromático; texto escuro com contraste ≥ 9:1 em todas. `ink` é a cor do texto.
export const CATEGORY_STYLE: Record<string, { icon: LucideIcon; color: string; ink: string }> = {
  all: { icon: LayoutGrid, color: '#111111', ink: '#ffffff' },
  musica: { icon: Music, color: '#99beff', ink: '#111111' },
  teatro: { icon: Drama, color: '#dea7e6', ink: '#111111' },
  danca: { icon: PersonStanding, color: '#bfb2fc', ink: '#111111' },
  humor: { icon: Laugh, color: '#cdc06d', ink: '#111111' },
  cinema: { icon: Clapperboard, color: '#f8a78a', ink: '#111111' },
  arte: { icon: Palette, color: '#efae75', ink: '#111111' },
  conversas: { icon: MessagesSquare, color: '#faa2a8', ink: '#111111' },
  ciencia: { icon: FlaskConical, color: '#5ed2d6', ink: '#111111' },
  familias: { icon: Baby, color: '#8ed197', ink: '#111111' },
  'ar-livre': { icon: Trees, color: '#6ecbf3', ink: '#111111' },
  visitas: { icon: Footprints, color: '#f0a2ca', ink: '#111111' },
  desporto: { icon: Trophy, color: '#b2c97b', ink: '#111111' },
  feiras: { icon: PartyPopper, color: '#e0b76c', ink: '#111111' },
  workshops: { icon: PencilRuler, color: '#6fd4b6', ink: '#111111' },
  outros: { icon: Sparkles, color: '#c4c4c4', ink: '#111111' },
};

export const styleOf = (id: string) => CATEGORY_STYLE[id] ?? CATEGORY_STYLE.outros;
