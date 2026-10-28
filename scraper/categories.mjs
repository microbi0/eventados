// Tipos de evento unificados. Cada fonte mapeia as suas categorias para estes ids.
export const CATEGORIES = {
  musica: 'Música',
  palcos: 'Teatro, Dança & Humor',
  cinema: 'Cinema',
  arte: 'Arte & Exposições',
  conversas: 'Conversas & Literatura',
  ciencia: 'Ciência',
  familias: 'Famílias',
  'ar-livre': 'Ar livre',
  visitas: 'Visitas guiadas',
  desporto: 'Desporto & Movimento',
  feiras: 'Feiras & Festas',
  workshops: 'Workshops & Formação',
  outros: 'Outros',
};

export const slugify = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// Mapeamento de categorias das fontes (slug/nome sem acentos) → id unificado.
const MAP = {
  // AgendaLX
  artes: 'arte',
  musica: 'musica',
  teatro: 'palcos',
  danca: 'palcos',
  'stand up comedy': 'palcos',
  'visitas guiadas': 'visitas',
  cinema: 'cinema',
  ciencias: 'ciencia',
  literatura: 'conversas',
  feiras: 'feiras',
  // Bundlr (Agenda Porto, Vila do Conde)
  'ao-fresco': 'ar-livre',
  'arte-e-exposicoes': 'arte',
  conversas: 'conversas',
  'conversas-e-workshops': 'conversas',
  'desporto-e-movimento': 'desporto',
  familias: 'familias',
  'toda-a-familia': 'familias',
  'musica-e-clubbing': 'musica',
  palcos: 'palcos',
  // BOL
  teatro_arte: 'palcos',
  musica_festivais: 'musica',
  familia: 'familias',
  desporto_aventura: 'desporto',
  // Plataforma municipal (Matosinhos, Maia, …): "Eventos | Teatro"
  exposicao: 'arte',
  exposicoes: 'arte',
  desporto: 'desporto',
  animacao: 'feiras',
  ambiente: 'ar-livre',
  sub18: 'familias',
  infantil: 'familias',
  'concertos': 'musica',
  espetaculos: 'palcos',
  festas: 'feiras',
  workshop: 'workshops',
  workshops: 'workshops',
  formacao: 'workshops',
  // CCB e outras salas (The Events Calendar)
  'mac/ccb': 'arte',
  'centro de arquitetura': 'arte',
  instalacao: 'arte',
  fotografia: 'arte',
  atividades: 'workshops',
  'conferencias e conversas': 'conversas',
  circo: 'palcos',
  musical: 'palcos',
  entretenimento: 'palcos',
  'mais novos': 'familias',
  'fabrica das artes': 'familias',
  concerto: 'musica',
  espetaculo: 'palcos',
  comedia: 'palcos',
  humor: 'palcos',
  'stand-up': 'palcos',
  // TNSJ / Rivoli
  'medeia filmes': 'cinema',
  'novo circo': 'palcos',
  performance: 'palcos',
  'musica ': 'musica',
};

// Categorias que identificam atividades não abertas ao público geral (ex.: visitas de escolas).
export const PRIVATE_CATEGORIES = new Set(['escolas', 'projetos de mediacao']);

export function mapCategory(raw) {
  const key = slugify(raw)
    .replace(/^.*\|\s*/, '') // "Eventos | Teatro" → "teatro"
    .replace(/-\d{6,}$/, ''); // slugs Bundlr com sufixo numérico
  return MAP[key] ?? MAP[key.replace(/\s+/g, '-')] ?? MAP[key.replace(/-/g, ' ')] ?? null;
}

// Classificação por palavras-chave (título/descrição) para fontes sem categorias úteis.
const KEYWORDS = [
  ['cinema', /\b(cinema|film|movie|screening|filme|curtas?[- ]metragens?|documentario|cineclube|sessao de cinema|ante-?estreia)\b/],
  ['palcos', /\b(theatre|theater|comedy|dance|show|teatro|danca|bailado|ballet|stand[- ]?up|comedia|humor|opera|circo|musical|revista|espetaculo|performance|marionetas|monologo)\b/],
  ['musica', /\b(concerts?|live music|jam session|karaoke|singer|orchestra|concertos?|musica|fado|jazz|orquestra|sinfonic\w*|filarmonic\w*|recital|coro|tour|ao vivo|dj|rock|hip[- ]?hop|rap|pop|metal|banda|tuna|festival de musica|guitarra|piano|quarteto)\b/],
  ['arte', /\b(exhibition|art|painting|museu|museum|exposic\w*|exposição|pintura|fotografia|galeria|instalacao|escultura|ilustracao|arte contemporanea|mostra de arte)\b/],
  ['conversas', /\b(conference|talk|meetup|networking|book|conferencia|palestra|conversa|debate|livro|lancamento|literatur\w*|poesia|leitura|tertulia|colóquio|coloquio|seminario|congresso|summit|clube de leitura)\b/],
  ['workshops', /\b(class|classes|course|training|aulas?|workshop|oficina|curso|formacao|masterclass|aula|bootcamp|webinar)\b/],
  ['ciencia', /\b(ciencia|astronomia|observacao astronomica|planetario|tecnologia|robotica)\b/],
  ['desporto', /\b(run|running|hike|hiking|fitness|pilates|corrida|trail|maratona|meia[- ]maratona|futebol|basquet\w*|andebol|voleibol|hoquei|torneio|campeonato|caminhada|yoga|btt|ciclismo|natacao|padel|tenis|surf|euro cup|qualifiers|\w+ x \w+)\b/],
  ['feiras', /\b(party|parties|brunch|wine|tasting|degustacao|prova de vinhos|market|fair|feira|mercado|mercadinho|festa|festas|festival gastronomico|gastronomi\w*|artesanato|magusto|arraial|romaria|carnaval|natal|passagem de ano|halloween|vinhos?)\b/],
  ['visitas', /\b(walking tour|guided tour|tour|visita guiada|visitas guiadas|roteiro|percurso|passeio|tour guiado)\b/],
  ['familias', /\b(kids|children|family|criancas|infantil|familia|familias|bebes|kids|miudos|pais e filhos)\b/],
  ['ar-livre', /\b(ar livre|natureza|parque|jardim|praia)\b/],
];

export function classify(...texts) {
  const s = slugify(texts.filter(Boolean).join(' '));
  return KEYWORDS.filter(([, re]) => re.test(s)).map(([id]) => id);
}
