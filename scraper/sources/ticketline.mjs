// Ticketline (ticketline.pt) — espetáculos e concertos em auditórios e salas por todo o país.
import { lisbonDate, decodeEntities } from '../util.mjs';
import { makeEvent } from '../event.mjs';
import { municipioInText } from '../geo.mjs';

export const ticketline = {
  meta: { id: 'ticketline', name: 'Ticketline', url: 'https://www.ticketline.pt/pesquisa' },
  async scrape() {
    const today = lisbonDate();
    const pages = Array.from({ length: 34 }, (_, i) => i + 1);

    const results = await Promise.all(
      pages.map(async (page) => {
        try {
          const res = await fetch(`https://www.ticketline.pt/pesquisa?page=${page}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const html = await res.text();
          return [...html.matchAll(/itemscope itemtype="http:\/\/schema\.org\/Event"[\s\S]*?<\/li>/gi)].map((m) => m[0]);
        } catch {
          return [];
        }
      }),
    );

    const out = [];
    const seen = new Set();

    for (const items of results) {
      for (const item of items) {
        const urlMatch = item.match(/href="(\/evento\/[^"]+)"/);
        const dateMatch = item.match(/data-date="([^"]+)"/) || item.match(/itemprop="startDate"\s+content="([^"]+)"/);
        const titleMatch = item.match(/class="title"\s+itemprop="name">([^<]+)<\/p>/);
        const venueMatch = item.match(/class="venues"\s+itemprop="location">([^<]+)<\/p>/);
        const catMatch = item.match(/class="metadata categories">([^<]+)<\/p>/);
        const imgMatch = item.match(/data-src-original="([^"]+)"/) || item.match(/src="([^"]+)"/);

        if (!urlMatch || !titleMatch) continue;
        const href = urlMatch[1];
        const numId = href.split('-').pop() || '';
        if (!numId || seen.has(numId)) continue;
        seen.add(numId);

        const startDate = dateMatch ? dateMatch[1] : today;
        if (startDate < today) continue;

        const title = decodeEntities(titleMatch[1].trim());
        const venue = venueMatch ? decodeEntities(venueMatch[1].trim()) : null;
        const mun = municipioInText(venue || '') || municipioInText(title);
        const cityName = mun ? mun.name : 'Portugal';
        const districtName = mun?.district || null;
        const rawCats = catMatch ? [decodeEntities(catMatch[1].trim())] : [];
        const fullUrl = `https://www.ticketline.pt${href}`;

        out.push(
          makeEvent(this.meta, {
            id: numId,
            url: fullUrl,
            title,
            venue,
            city: cityName,
            district: districtName,
            startDate,
            endDate: startDate,
            image: imgMatch ? imgMatch[1].trim() : null,
            tickets: fullUrl,
            rawCategories: rawCats,
            fallbackCategory: 'outros',
          }),
        );
      }
    }

    return out;
  },
};
