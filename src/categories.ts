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

// Cor e ícone de cada tipo de evento. `ink` é a cor do texto sobre a cor de fundo.
export const CATEGORY_STYLE: Record<string, { icon: LucideIcon; color: string; ink: string }> = {
  all: { icon: LayoutGrid, color: '#111111', ink: '#ffffff' },
  musica: { icon: Music, color: '#5b6cf0', ink: '#ffffff' },
  teatro: { icon: Drama, color: '#bc8cb8', ink: '#111111' },
  danca: { icon: PersonStanding, color: '#8f5fd6', ink: '#ffffff' },
  humor: { icon: Laugh, color: '#ffcf33', ink: '#111111' },
  cinema: { icon: Clapperboard, color: '#da5a3d', ink: '#ffffff' },
  arte: { icon: Palette, color: '#a56b50', ink: '#ffffff' },
  conversas: { icon: MessagesSquare, color: '#ff2659', ink: '#ffffff' },
  ciencia: { icon: FlaskConical, color: '#3fb8af', ink: '#111111' },
  familias: { icon: Baby, color: '#a8dba8', ink: '#111111' },
  'ar-livre': { icon: Trees, color: '#749ef0', ink: '#111111' },
  visitas: { icon: Footprints, color: '#e58fb0', ink: '#111111' },
  desporto: { icon: Trophy, color: '#878a4b', ink: '#ffffff' },
  feiras: { icon: PartyPopper, color: '#f08a24', ink: '#111111' },
  workshops: { icon: PencilRuler, color: '#4fd1c5', ink: '#111111' },
  outros: { icon: Sparkles, color: '#b9b9b9', ink: '#111111' },
};

export const styleOf = (id: string) => CATEGORY_STYLE[id] ?? CATEGORY_STYLE.outros;
