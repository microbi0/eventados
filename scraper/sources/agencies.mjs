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
