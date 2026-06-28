#!/usr/bin/env bash
# Deploy do Geo Intelligence para a VPS (build estático + tiles via rsync).
#
# Uso:
#   VPS_HOST=usuario@SEU_IP ./deploy/deploy.sh            # app + tiles
#   VPS_HOST=usuario@SEU_IP ./deploy/deploy.sh app        # só o frontend (rápido)
#   VPS_HOST=usuario@SEU_IP ./deploy/deploy.sh tiles      # só os tiles (~2 GB)
#
# Variáveis:
#   VPS_HOST  (obrigatória)  ex.: deploy@203.0.113.10
#   VPS_PATH  (opcional)     destino na VPS; padrão /var/www/geo
set -euo pipefail

# Atalho do ~/.ssh/config (rsync/ssh resolvem usuário, IP e chave por ele).
VPS_HOST="${VPS_HOST:-hetzner-gramos}"
VPS_PATH="${VPS_PATH:-/var/www/geo}"
WHAT="${1:-all}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

build_app() {
  echo "▶ Build do frontend (no container)…"
  docker compose run --rm web sh -c "npm install && npm run build"
}

push_app() {
  echo "▶ Enviando frontend → $VPS_HOST:$VPS_PATH/ (exceto tiles)…"
  rsync -avz --delete --exclude 'tiles' \
    web/dist/ "$VPS_HOST:$VPS_PATH/"
}

push_tiles() {
  # Sem --info=progress2: o rsync do macOS (openrsync) não suporta. -v lista
  # cada arquivo conforme envia; o acompanhamento fino é por `du` no servidor.
  echo "▶ Enviando tiles → $VPS_HOST:$VPS_PATH/tiles/ (~2 GB, incremental)…"
  rsync -avz --delete \
    web/public/tiles/ "$VPS_HOST:$VPS_PATH/tiles/"
}

case "$WHAT" in
  app)   build_app; push_app ;;
  tiles) push_tiles ;;
  all)   build_app; push_app; push_tiles ;;
  *) echo "alvo inválido: $WHAT (use: app | tiles | all)"; exit 1 ;;
esac

echo "✔ Concluído."
