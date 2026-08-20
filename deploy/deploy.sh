#!/usr/bin/env bash
# Deploy do Geo Intelligence para a VPS (build estático + tiles via rsync).
#
# Uso:
#   ./deploy/deploy.sh            # app + tiles (site estático)
#   ./deploy/deploy.sh app        # só o frontend (rápido)
#   ./deploy/deploy.sh tiles      # só os tiles (~2 GB)
#   ./deploy/deploy.sh ia         # código do agente (query/ + agent/ + .env) + uv sync
#                                 # (systemd/Caddy na 1ª vez: setup-agent-vps.sh)
#
# Não há mais alvo `data`: o agente lê o geodata (PostGIS) por GEODATA_DSN, não
# parquets copiados para a VPS. Ver ../webgis/docs/adr, passo 3 do roteiro.
#
# Variáveis:
#   VPS_HOST  (opcional)  atalho ssh ou usuario@IP; padrão hetzner-gramos
#   VPS_PATH  (opcional)  destino do site na VPS; padrão /var/www/geo
#   GEO_PATH  (opcional)  destino do agente/dados; padrão projects/geo (relativo à home ssh)
#   TILES_DIR (.env)      diretório do host de tiles compartilhado (fora deste repo)
set -euo pipefail

# Atalho do ~/.ssh/config (rsync/ssh resolvem usuário, IP e chave por ele).
VPS_HOST="${VPS_HOST:-hetzner-gramos}"
VPS_PATH="${VPS_PATH:-/var/www/geo}"
GEO_PATH="${GEO_PATH:-projects/geo}"
WHAT="${1:-all}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Os .pmtiles nao moram mais aqui: vivem no host de tiles compartilhado, fora de
# qualquer repositorio de aplicacao (ver ../webgis/docs/LOCAL.md).
if [[ -f .env ]]; then set -a; . ./.env; set +a; fi

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
  : "${TILES_DIR:?defina TILES_DIR no .env (ver ../webgis/docs/LOCAL.md)}"
  [[ -d "$TILES_DIR" ]] || { echo "TILES_DIR não existe: $TILES_DIR" >&2; exit 1; }
  # Sem --info=progress2: o rsync do macOS (openrsync) não suporta. -v lista
  # cada arquivo conforme envia; o acompanhamento fino é por `du` no servidor.
  echo "▶ Enviando tiles ($TILES_DIR) → $VPS_HOST:$VPS_PATH/tiles/ (~2 GB, incremental)…"
  rsync -avz --delete \
    "$TILES_DIR/" "$VPS_HOST:$VPS_PATH/tiles/"
}

push_agent() {
  echo "▶ Enviando query/ + agent/ + deploy/ → $VPS_HOST:$GEO_PATH/…"
  ssh "$VPS_HOST" "mkdir -p $GEO_PATH"
  rsync -avz --delete \
    --exclude '.venv' --exclude '__pycache__' --exclude '.pytest_cache' \
    --exclude '.ruff_cache' --exclude '.env' \
    query agent deploy "$VPS_HOST:$GEO_PATH/"
  if [[ -f agent/.env ]]; then
    # O agente nao sobe sem GEODATA_DSN desde que a fachada passou a ler PostGIS.
    # Melhor parar aqui do que descobrir pelo systemd em restart loop na VPS.
    grep -q '^GEODATA_DSN=' agent/.env \
      || { echo "✗ agent/.env sem GEODATA_DSN — o serviço não sobe. Ver agent/.env.example" >&2; exit 1; }
    echo "▶ Enviando agent/.env (chave OpenAI + GEODATA_DSN)…"
    rsync -avz agent/.env "$VPS_HOST:$GEO_PATH/agent/.env"
  else
    echo "⚠ agent/.env não existe local — o serviço não sobe sem a chave e o DSN."
  fi
  echo "▶ uv sync no servidor (instala uv se preciso; python gerenciado 3.12)…"
  ssh "$VPS_HOST" "
    set -e
    command -v \$HOME/.local/bin/uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh
    cd $GEO_PATH/agent && \$HOME/.local/bin/uv sync --no-dev --python 3.12
  "
  echo "ℹ Primeira vez? Falta o passo ROOT (systemd + Caddy /api) — rode na SUA máquina:"
  echo "    ssh -t $VPS_HOST 'sudo bash ~/$GEO_PATH/deploy/setup-agent-vps.sh'"
  echo "  Nas demais vezes, só reinicie o serviço:"
  echo "    ssh -t $VPS_HOST 'sudo systemctl restart geo-agent'"
}

case "$WHAT" in
  app)   build_app; push_app ;;
  tiles) push_tiles ;;
  agent|ia) push_agent ;;
  all)   build_app; push_app; push_tiles ;;
  *) echo "alvo inválido: $WHAT (use: app | tiles | agent | ia | all)"; exit 1 ;;
esac

echo "✔ Concluído."
