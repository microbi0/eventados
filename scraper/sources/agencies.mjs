// Agências e promotoras: publicam a digressão completa de cada artista.
// As digressões passam sobretudo por cine-teatros e auditórios municipais que nenhuma agenda de cidade cobre;
// recolher por quem organiza (e não só por local) apanha todas as datas de uma vez.
import { fetchText, absUrl, lisbonDate, decodeEntities, stripHtml } from '../util.mjs';
import { makeEvent } from '../event.mjs';
import { parsePtDateRange } from '../ptdates.mjs';

const pick = (html, re) => html.match(re)?.[1] ?? null;

// Uguru (uguru.net) — agência de música: cada artista com as suas datas (dia, cidade, sala, bilhetes).
export const uguru = {
  meta: { id: 'uguru', name: 'Uguru', url: 'https://uguru.net/concertos-e-digressoes/' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const out = [];
    for (const art of html.split(/<article\b/).slice(1)) {
      const artist = stripHtml(pick(art, /<h3[^>]*>([\s\S]*?)<\/h3>/) ?? '');
      const subtitle = stripHtml(pick(art, /<div class="text-uppercase d-block">([\s\S]*?)<\/div>/) ?? '');
      const image = pick(art, /<img[^>]*src="([^"]+)"/);
      // "Misty Fest | José Gonzalez" já inclui o artista; senão "Artista – Título".
      const title = subtitle && subtitle.toLowerCase().includes(artist.toLowerCase()) ? subtitle : [artist, subtitle].filter(Boolean).join(' – ');
      for (const [i, block] of art.split(/class="data_concerto/).slice(1).entries()) {
        const dateText = stripHtml(pick(block, /class="data_data">([\s\S]*?)<\/div>/) ?? '');
        const date = parsePtDateRange(dateText)?.start;
        if (!date || date < today) continue;
        const city = stripHtml(pick(block, /<strong>([\s\S]*?)<\/strong>/) ?? '');
        const venue = stripHtml(pick(block, /<span>([\s\S]*?)<\/span>/) ?? '');
        out.push(
          makeEvent(this.meta, {
            id: `${pick(art, /^[^>]*id="post-(\d+)"/) ?? artist}-${date}-${i}`,
            url: this.meta.url,
            title: title || artist,
            venue: venue || city,
            city,
            startDate: date,
            endDate: date,
            rawCategories: [],
            fallbackCategory: 'musica',
            image: image ? image.replace(/-\d+x\d+(\.\w+)$/, '$1') : null,
            tickets: pick(block, /class="data_botao" href="([^"]+)"/),
          }),
        );
      }
    }
    return out;
  },
};

// Sons em Trânsito (sonsemtransito.com) — agência de música: agenda única com todos os artistas.
// Cada linha: "dd . mês", artista, "Localidade, sala/festival PAÍS"; ficam só as datas em Portugal.
export const sonsEmTransito = {
  meta: { id: 'sonsemtransito', name: 'Sons em Trânsito', url: 'https://www.sonsemtransito.com/pt/agenda/atual/todos' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const out = [];
    for (const [i, row] of html.split(/class="row schedule-show"/).slice(1).entries()) {
      const dateText = stripHtml(pick(row, /schedule-show-date">([\s\S]*?)<\/div>/) ?? '').replace(/\s*\.\s*/, ' ');
      const artist = stripHtml(pick(row, /schedule-show-info">\s*<span>([\s\S]*?)<\/span>/) ?? '');
      const info = stripHtml(pick(row, /schedule-show-info">\s*<span>[\s\S]*?<\/span>([\s\S]*?)<\/div>/) ?? '');
      const country = info.match(/\s([A-Z]{2,3})\s*$/)?.[1];
      if (country && !['POR', 'PT'].includes(country)) continue;
      const place = info.replace(/\s[A-Z]{2,3}\s*$/, '').replace(/\s+,/g, ',').trim();
      const date = parsePtDateRange(dateText)?.start;
      if (!artist || !place || !date || date < today) continue;
      const [first, ...rest] = place.split(/\s*,\s*/);
      out.push(
        makeEvent(this.meta, {
          id: `${artist}-${date}-${i}`,
          url: this.meta.url,
          title: artist,
          subtitle: rest.join(', ') || null,
          // A localidade tanto pode vir primeiro como depois da sala: a localização procura o concelho no texto todo.
          city: first,
          venue: rest.length ? rest.join(', ') : first,
          startDate: date,
          endDate: date,
          rawCategories: [],
          fallbackCategory: 'musica',
          tickets: pick(row, /schedule-show-tickets[^>]*>\s*<a href="([^"]+)"/),
        }),
      );
    }
    return out;
  },
};
