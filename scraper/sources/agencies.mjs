// Agências e promotoras: publicam a digressão completa de cada artista.
// As digressões passam sobretudo por cine-teatros e auditórios municipais que nenhuma agenda de cidade cobre;
// recolher por quem organiza (e não só por local) apanha todas as datas de uma vez.
import { fetchText, absUrl, lisbonDate, decodeEntities, stripHtml } from '../util.mjs';
import { makeEvent } from '../event.mjs';
import { parsePtDateRange } from '../ptdates.mjs';

const pick = (html, re) => html.match(re)?.[1] ?? null;

// KILT (kilt.pt) — stand-up e música. Cada espetáculo tem uma tabela "Datas": dia, "Localidade - Sala", bilhetes.
export const kilt = {
  meta: { id: 'kilt', name: 'KILT', url: 'https://kilt.pt/eventos/' },
  async scrape() {
    const today = lisbonDate();
    const list = await fetchText(this.meta.url);
    const shows = [...new Set([...list.matchAll(/href="(https:\/\/kilt\.pt\/eventos\/[a-z0-9-]+\/)"/g)].map((m) => m[1]))].filter((u) => !/kilt-test/.test(u));
    const out = [];
    for (const url of shows) {
      // Páginas de espetáculo mudam pouco: cache de 24 h.
      const html = await fetchText(url, { cacheHours: 24 }).catch(() => '');
      const table = html.slice(html.indexOf('id="datas-evento"'), html.indexOf('</table>', html.indexOf('id="datas-evento"')));
      if (!table) continue;
      const title = stripHtml(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/) ?? '');
      const image = pick(html, /<figure class="feat-img"><img[^>]*src="([^"]+)"/);
      const description = stripHtml(pick(html, /<section[^>]*class="[^"]*(?:sinopse|descricao|content|text)[^"]*"[^>]*>([\s\S]*?)<\/section>/) ?? '');
      for (const [i, row] of table.split(/<tr\b/).slice(2).entries()) {
        const day = pick(row, /class="data-box">\s*(\d{1,2})/);
        const month = pick(row, /<small>([^<]+)<\/small>/);
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripHtml(m[1]));
        let place = cells[1] ?? '';
        // Linhas ainda por anunciar ("Estúdio Time Out - em breve") ficam de fora.
        if (!day || !month || !place || /em breve|a anunciar|brevemente/i.test(place)) continue;
        // "21h30m Faro - Teatro das Figuras": hora opcional antes da localidade.
        const time = place.match(/^(\d{1,2})h(\d{2})m?\s+/);
        if (time) place = place.slice(time[0].length);
        const [city, ...venue] = place.split(/\s+-\s+/);
        const date = parsePtDateRange(`${day} ${month}`)?.start;
        if (!date || date < today) continue;
        out.push(
          makeEvent(this.meta, {
            id: `${url.split('/').filter(Boolean).pop()}-${date}-${i}`,
            url,
            title,
            description,
            venue: venue.join(' - ') || city,
            city: decodeEntities(city.trim()),
            startDate: date,
            endDate: date,
            timesText: time ? `${time[1]}h${time[2]}` : null,
            rawCategories: [],
            fallbackCategory: 'humor',
            image: image ? absUrl(image, url) : null,
            tickets: pick(row, /href="(https?:\/\/[^"]+)"/),
          }),
        );
      }
    }
    return out;
  },
};
