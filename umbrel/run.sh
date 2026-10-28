#!/bin/sh
# Atualiza o código, recolhe os eventos e envia o events.json para o ramo "data" do GitHub.
# O scraper respeita as suas regras (1 pedido por site de cada vez, 2 s de intervalo, robots.txt,
# cache em /data/repo/.cache e no máximo uma recolha a cada 20 h).
set -eu

REPO_URL="git@github.com:microbi0/eventados.git"
DIR=/data/repo
export GIT_SSH_COMMAND="ssh -i /data/ssh/id_ed25519 -o UserKnownHostsFile=/data/ssh/known_hosts -o StrictHostKeyChecking=yes"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') início"
mkdir -p /data/logs

if [ ! -d "$DIR/.git" ]; then
  git clone --branch main --single-branch "$REPO_URL" "$DIR"
fi
cd "$DIR"
git fetch --quiet origin main
git reset --quiet --hard origin/main

# Parte dos últimos dados enviados (reserva se uma fonte falhar e travão das 20 h).
if git fetch --quiet origin data 2>/dev/null; then
  git show origin/data:events.json > public/data/events.json
fi

node scraper/index.mjs "$@"

# Ramo "data" com um único commit (substituído a cada recolha): sem histórico a crescer.
TMP=$(mktemp -d)
cp public/data/events.json "$TMP/events.json"
cd "$TMP"
git init --quiet -b data
git -c user.name="Eventados (Umbrel)" -c user.email="eventados-bot@users.noreply.github.com" add events.json
git -c user.name="Eventados (Umbrel)" -c user.email="eventados-bot@users.noreply.github.com" commit --quiet -m "Eventos $(date '+%Y-%m-%d %H:%M')"
git push --quiet --force "$REPO_URL" data:data
cd / && rm -rf "$TMP"
echo "=== $(date '+%Y-%m-%d %H:%M:%S') fim"
