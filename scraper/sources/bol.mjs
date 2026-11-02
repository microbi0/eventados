// Bilheteira Online (BOL.pt) — mais de 2.000 eventos e espetáculos por todo o país.
import { fetchText, lisbonDate, decodeEntities } from '../util.mjs';
import { makeEvent } from '../event.mjs';
import { municipioAt, municipioByName, municipioInText } from '../geo.mjs';

export const bol = {
  meta: { id: 'bol', name: 'BOL (Bilheteira Online)', url: 'https://www.bol.pt/Comprar/Bilhetes/Lista' },
  async scrape() {
    const today = lisbonDate();
    const html = await fetchText(this.meta.url);
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    const out = [];
    const seen = new Set();

    // Extrai categorias da listagem HTML se disponíveis por id
    const catsById = new Map();
    for (const match of html.matchAll(/href="\/Comprar\/Bilhetes\/(\d+)-[^"]*"[\s\S]{1,600}?class="descricao"[^>]*>([\s\S]*?)<\/span>/gi)) {
      const id = match[1];
      const cats = match[2].trim().split(/\s*[\n\r]+\s*/).filter(Boolean);
      catsById.set(id, cats);
    }

    for (const s of scripts) {
      try {
        const obj = JSON.parse(s);
        if (obj['@type'] !== 'Event') continue;
        const startDate = obj.startDate ? obj.startDate.slice(0, 10) : null;
        const endDate = obj.endDate ? obj.endDate.slice(0, 10) : startDate;
        if (!startDate || endDate < today) continue;

        const numId = obj.url?.match(/\/(\d+)-/)?.[1] || obj.productID?.replace(/^1_/, '') || Math.random().toString(36).slice(2, 8);
        if (seen.has(numId)) continue;
        seen.add(numId);

        const lat = obj.location?.geo?.latitude ? parseFloat(obj.location.geo.latitude) : null;
        const lon = obj.location?.geo?.longitude ? parseFloat(obj.location.geo.longitude) : null;
        const venue = obj.location?.name?.trim() || null;
        const locality = obj.location?.address?.addressLocality?.trim() || '';
        const street = obj.location?.address?.streetAddress?.trim() || '';

        // Tenta resolver o concelho oficial
        const mun =
          (lat && lon && municipioAt(lat, lon)) ||
          municipioInText(street) ||
          municipioInText(venue || '') ||
          municipioByName(locality) ||
          municipioInText(locality);

        const cityName = mun ? mun.name : locality || 'Portugal';
        const districtName = mun?.district || locality || null;
        const rawCats = catsById.get(numId) || [];
        const price = obj.offers?.price ? `${obj.offers.price}€` : null;
        const tickets = obj.offers?.url || obj.url;

        out.push(
          makeEvent(this.meta, {
            id: numId,
            url: obj.url,
            title: decodeEntities(obj.name?.trim() || ''),
            venue,
            city: cityName,
            district: districtName,
            address: street || null,
            lat: lat || mun?.center?.[1] || null,
            lon: lon || mun?.center?.[0] || null,
            startDate,
            endDate,
            price,
            tickets,
            image: obj.image || null,
            rawCategories: rawCats,
            fallbackCategory: 'outros',
          }),
        );
      } catch {
        /* ignora entradas com JSON malformado */
      }
    }

    return out;
  },
};
