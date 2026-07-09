#!/usr/bin/env bash
# Deploy do Geo Intelligence para a VPS (build estático + tiles via rsync).
#
# Uso:
#   ./deploy/deploy.sh            # app + tiles (site estático)
#   ./deploy/deploy.sh app        # só o frontend (rápido)
#   ./deploy/deploy.sh tiles      # só os tiles (~2 GB)
#   ./deploy/deploy.sh data       # parquets do agente (setor enxuto + censo) → ~/geo
#   ./deploy/deploy.sh agent      # código do agente (query/ + agent/ + .env) + uv sync
#   ./deploy/deploy.sh ia         # data + agent (fase 2.1; systemd/Caddy: setup-agent-vps.sh)
#
# Variáveis:
#   VPS_HOST  (opcional)  atalho ssh ou usuario@IP; padrão hetzner-gramos
#   VPS_PATH  (opcional)  destino do site na VPS; padrão /var/www/geo
#   GEO_PATH  (opcional)  destino do agente/dados; padrão geo (relativo à home ssh)
set -euo pipefail

# Atalho do ~/.ssh/config (rsync/ssh resolvem usuário, IP e chave por ele).
VPS_HOST="${VPS_HOST:-hetzner-gramos}"
VPS_PATH="${VPS_PATH:-/var/www/geo}"
GEO_PATH="${GEO_PATH:-geo}"
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

push_data() {
  # setor "enxuto": o backend só usa CD_SETOR + geom_bbox — não sobe 1 GB de geometria.
  echo "▶ Gerando setor enxuto (CD_SETOR + geom_bbox)…"
  (cd query && uv run python -c "
import duckdb
duckdb.connect().execute('''
  COPY (SELECT CD_SETOR, geom_bbox FROM read_parquet('../data/processed/setor.parquet'))
  TO '../data/processed/setor_slim.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)
''')
")
  echo "▶ Enviando parquets → $VPS_HOST:$GEO_PATH/data/processed/…"
  ssh "$VPS_HOST" "mkdir -p $GEO_PATH/data/processed"
  rsync -avz data/processed/setor_slim.parquet \
    "$VPS_HOST:$GEO_PATH/data/processed/setor.parquet"
  rsync -avz data/processed/censo_setor.parquet data/processed/censo_municipio.parquet \
    "$VPS_HOST:$GEO_PATH/data/processed/"
}

push_agent() {
  echo "▶ Enviando query/ + agent/ + deploy/ → $VPS_HOST:$GEO_PATH/…"
  ssh "$VPS_HOST" "mkdir -p $GEO_PATH"
  rsync -avz --delete \
    --exclude '.venv' --exclude '__pycache__' --exclude '.pytest_cache' \
    --exclude '.ruff_cache' --exclude '.env' \
    query agent deploy "$VPS_HOST:$GEO_PATH/"
  if [[ -f agent/.env ]]; then
    echo "▶ Enviando agent/.env (chave OpenAI)…"
    rsync -avz agent/.env "$VPS_HOST:$GEO_PATH/agent/.env"
  else
    echo "⚠ agent/.env não existe local — o serviço não sobe sem a chave."
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
  data)  push_data ;;
  agent) push_agent ;;
  ia)    push_data; push_agent ;;
  all)   build_app; push_app; push_tiles ;;
  *) echo "alvo inválido: $WHAT (use: app | tiles | data | agent | ia | all)"; exit 1 ;;
esac

echo "✔ Concluído."
