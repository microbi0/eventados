# Recolha no Umbrel

O AgendaLX e o TNSJ estão atrás da Cloudflare, que bloqueia pedidos vindos de centros de dados
(GitHub Actions, alojamentos). A recolha diária corre por isso num Umbrel em casa e envia o
`events.json` para o ramo `data`; o GitHub Actions publica o site quando esse ramo muda.

Instalação (em `~/eventados-sync` no Umbrel):

```bash
mkdir -p data/ssh data/logs
ssh-keygen -t ed25519 -N "" -C "eventados-umbrel" -f data/ssh/id_ed25519
# chave pública → GitHub › Settings › Deploy keys (com escrita), só neste repositório
ssh-keyscan -t ed25519 github.com > data/ssh/known_hosts   # confirmar a impressão digital oficial
docker compose up -d --build
docker exec eventados-sync eventados-sync --force          # primeira recolha manual
```

Registo: `data/logs/sync.log`. Remover tudo: `docker compose down && rm -rf ~/eventados-sync`
e apagar a deploy key no GitHub.
