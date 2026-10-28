# Eventados

Agenda de eventos de Portugal, organizada por **concelho** e por **tipo de evento**, recolhida
automaticamente de agendas municipais e salas de espetáculos. Corre na web e é
empacotada para Android com [Capacitor](https://capacitorjs.com/).

## Como funciona

```
scraper/ (Node, 1×/dia)  ──►  public/data/events.json  ──►  app web / Android (React + Vite)
                                                              páginas: Home · Eventos · Mapa · Sobre
```

- A app **nunca** contacta as fontes: só lê o `events.json` já gerado.
- A recolha diária corre num **Umbrel em casa** (04:00, hora de Lisboa) e envia o `events.json` para o
  ramo `data`; a publicação agendada do GitHub (04:30 UTC) usa esses dados. Motivo: o AgendaLX e o TNSJ estão
  atrás da Cloudflare, que bloqueia pedidos vindos de centros de dados. Ver [umbrel/README.md](umbrel/README.md).
- O GitHub Actions continua agendado (04:30 UTC) como reserva; a recolha corre no máximo uma vez a cada 20 h.

### Fontes

Só agendas públicas e salas de espetáculos — **sem bilheteiras** (BOL, Ticketline, Blueticket, Eventbrite…),
por opção.

| Tipo | Fonte | Método |
|---|---|---|
| Agenda municipal | AgendaLX (Lisboa) | API JSON |
| | Agenda Porto, Agenda Vila do Conde | dados Bundlr (JSON) |
| | Matosinhos, Maia, Famalicão, Odivelas, Viana do Castelo, Aveiro | HTML (plataforma comum) |
| | Gaia | HTML |
| | Gondomar, Póvoa de Varzim | API WordPress |
| Salas | Super Bock Arena, Teatro Sá da Bandeira, CCB | API "The Events Calendar" |
| | Coliseu Porto Ageas | API GraphQL do site |
| | Teatro Municipal do Porto (Rivoli, Campo Alegre), Teatro Nacional São João | HTML / microdata |
| | MEO Arena | HTML |

O concelho de cada evento é calculado a partir das coordenadas com os limites oficiais dos
308 concelhos (GeoAPI.pt / CAOP), em `scraper/data/municipios.json`.

## Boa conduta com os sites de origem

Implementado em `scraper/util.mjs` e `scraper/index.mjs`:

- **1 pedido de cada vez por domínio**, com **2 s** entre pedidos (`SCRAPER_MIN_INTERVAL_MS`), ou o
  `Crawl-delay` do `robots.txt` se for maior.
- **`robots.txt` respeitado** antes de cada pedido (interpretação conservadora).
- **Cache em disco** (`.cache/`): listagens reutilizadas durante 12 h, páginas de detalhe durante 7 dias,
  com revalidação por `ETag`/`Last-Modified` (respostas 304 não descarregam nada).
- **429/503** respeitam o `Retry-After`; outros erros não são repetidos. Se um site falhar, são
  mantidos os eventos da recolha anterior em vez de insistir.
- **No máximo 1 recolha a cada 20 h** (`MIN_HOURS_BETWEEN_RUNS`); `--force` para ignorar.
- User-Agent identificável (`EventadosBot`) e cada evento liga para a página original.

## Comandos

```bash
npm install
npm run scrape            # recolhe eventos (respeita o intervalo de 20 h)
node scraper/index.mjs --force             # força uma recolha
node scraper/index.mjs --only gaia,tnsj     # recolhe só algumas fontes
npm run dev               # app em http://localhost:5173
npm run build             # build web em dist/
```

### Android

```bash
npm run android:sync      # build web + copia para android/
npm run android:open      # abre no Android Studio (Run ▶ ou Build › Build APK)
```

Para a app instalada receber eventos novos sem ser reinstalada, compile com o URL dos dados
publicados: `VITE_DATA_URL=https://<utilizador>.github.io/<repo>/data/events.json npm run android:sync`.
Sem essa variável, a app usa o `events.json` incluído na build.

> **Nota:** esta pasta está num disco de rede (SMB) que não suporta symlinks nem os ficheiros de
> bloqueio do Gradle. Os scripts npm chamam as ferramentas diretamente por isso; para compilar o
> APK, copie o projeto para um disco local (ex.: `rsync -a ./ ~/eventados-build/`) e corra lá o Gradle.

## Adicionar uma fonte

1. Criar um módulo em `scraper/sources/` que exporte `{ meta: { id, name, url, city? }, scrape() }`,
   devolvendo eventos criados com `makeEvent()` (`scraper/event.mjs`).
2. Se o site usar uma plataforma já suportada, basta uma linha — p.ex.
   `municipalPlatform({...})`, `bundlrSource({...})` ou `tribeSource({...})`.
3. Juntá-lo à lista `SOURCES` em `scraper/index.mjs` (a ordem define a prioridade nos duplicados).
4. Mapear as categorias da fonte em `scraper/categories.mjs` (o resto é classificado por palavras-chave).

## Mapa

A página Mapa usa [Leaflet](https://leafletjs.com/) com mosaicos do OpenStreetMap. A política de uso do
OSM permite tráfego moderado; se a app crescer, troque por um fornecedor de mosaicos dedicado
(ex.: MapTiler, Stadia Maps) em `src/pages/MapPage.tsx`.
