export interface EventItem {
  id: string;
  source: string;
  sourceName: string;
  url: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  categories: string[];
  rawCategories: string[];
  city: string;
  district: string | null;
  venue: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  startDate: string;
  endDate: string;
  dates: string[] | null;
  datesText: string | null;
  timesText: string | null;
  price: string | null;
  isFree: boolean;
  image: string | null;
  tickets: string | null;
  featured?: boolean;
  promoted?: boolean;
  alsoAt?: { name: string; source?: string; url: string }[];
  // Artistas portugueses nomeados no evento (ids de EventsData.artists).
  artists?: string[];
}

export interface Artist {
  id: string;
  name: string;
  type: 'cantor' | 'banda' | 'humor';
  photo: string | null;
}

export interface SourceInfo {
  id: string;
  name: string;
  url: string;
  count: number;
  ok: boolean;
  kind?: 'agenda' | 'venue' | 'regional' | 'agency';
  error?: string;
}

export interface EventsData {
  updatedAt: string;
  categories: Record<string, string>;
  sources: SourceInfo[];
  // Limites de cada concelho [oeste, sul, este, norte].
  places?: Record<string, [number, number, number, number]>;
  artists?: Record<string, Artist>;
  events: EventItem[];
}
