#!/usr/bin/env bash
# Atualiza o backend na VPS com o que está na main do GitHub — ver docs/runbook-atualizacoes.md.
#   /opt/zhivago/deploy/vps/atualizar.sh            # só reconstrói se algo do backend mudou
#   /opt/zhivago/deploy/vps/atualizar.sh --forcar   # reconstrói mesmo sem mudança
#
# Ordem pensada pra não derrubar o site à toa: backup → build da imagem nova (a antiga continua no ar)
# → migrations → troca do container → teste. Se o teste falhar, volta pra imagem anterior.
set -euo pipefail

cd "$(dirname "$0")"
source .env
repo=/opt/zhivago
forcar=${1:-}

antes=$(git -C "$repo" rev-parse HEAD)
git -C "$repo" pull --ff-only -q
depois=$(git -C "$repo" rev-parse HEAD)

if [ "$antes" = "$depois" ] && [ "$forcar" != "--forcar" ]; then
  echo "Nada novo no GitHub (commit $(git -C "$repo" log --oneline -1)). Nada a fazer."
  exit 0
fi
echo "Commit: $(git -C "$repo" log --oneline -1)"

# O que mudou entre o commit antigo e o novo — só o frontend? então a Netlify cuida e não há o que fazer aqui.
mudou=$(git -C "$repo" diff --name-only "$antes" "$depois")
backend=$(echo "$mudou" | grep -E '^(apps/server/|packages/shared/|package(-lock)?\.json$)' || true)
infra=$(echo "$mudou" | grep -E '^deploy/vps/(docker-compose\.yml|Caddyfile)$' || true)
migrations=$(echo "$mudou" | grep -E '^apps/server/prisma/migrations/' || true)

if [ -z "$backend" ] && [ -z "$infra" ] && [ "$forcar" != "--forcar" ]; then
  echo "Só mudaram arquivos fora do backend (o site a Netlify publica sozinha). Nada a reconstruir."
  exit 0
fi

echo "1/5 Backup antes de mexer..."
./backup.sh

echo "2/5 Construindo a versão nova (a atual continua no ar)..."
if docker image inspect zhivago-server:latest >/dev/null 2>&1; then
  docker tag zhivago-server:latest zhivago-server:anterior
fi
docker compose build -q api

echo "3/5 Mudanças no banco (migrations)..."
if [ -n "$migrations" ] || [ "$forcar" = "--forcar" ]; then
  docker compose run --rm -T api npx prisma migrate deploy
else
  echo "    nenhuma migration nova."
fi

echo "4/5 Trocando para a versão nova..."
if [ -n "$infra" ]; then
  docker compose up -d
else
  docker compose up -d --no-deps api
fi

echo "5/5 Testando https://$API_DOMAIN ..."
for _ in $(seq 1 30); do
  if curl -fsS -m 5 -o /dev/null "https://$API_DOMAIN/hello" && curl -fsS -m 10 -o /dev/null "https://$API_DOMAIN/listings"; then
    docker image prune -f >/dev/null
    echo "OK: backend atualizado e respondendo."
    exit 0
  fi
  sleep 2
done

echo "ERRO: a versão nova não respondeu. Voltando para a anterior..." >&2
docker compose logs --tail 40 api >&2 || true
if docker image inspect zhivago-server:anterior >/dev/null 2>&1; then
  docker tag zhivago-server:anterior zhivago-server:latest
  docker compose up -d --no-deps --no-build api
  echo "Versão anterior restaurada. (Se houve migration, ela NÃO foi desfeita — avise o Claude.)" >&2
fi
exit 1
