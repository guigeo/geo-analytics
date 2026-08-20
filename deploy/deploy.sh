#!/usr/bin/env bash
# Deploy do Geo Intelligence para a VPS (build estático + tiles via rsync).
#
# Uso:
#   ./deploy/deploy.sh            # app + tiles (site estático)
#   ./deploy/deploy.sh app        # só o frontend (rápido)
#
# Não há alvo `tiles`: publicar tile é `make ship-tiles` no repositório webgis, que
# é o dono do host compartilhado. Enquanto o comando morasse aqui, era esta
# aplicação a dona de fato do dado universal.
#   ./deploy/deploy.sh ia         # código do agente (query/ + agent/ + .env) + uv sync
#                                 # (systemd/Caddy na 1ª vez: setup-agent-vps.sh)
#
# Não há mais alvo `data`: o agente lê o geodata (PostGIS) por GEODATA_DSN, não
# parquets copiados para a VPS. Ver ../webgis/docs/adr, passo 3 do roteiro.
#
# Variáveis:
#   VPS_HOST  (opcional)  atalho ssh ou usuario@IP; padrão hetzner-gramos
#   VPS_PATH  (opcional)  destino do site na VPS; padrão /var/www/geo
#   GEO_PATH  (opcional)  destino do agente; padrão projects/geo (relativo à home ssh)
#   VITE_TILES_BASE_URL   de onde o site publicado lê os tiles (default: produção)
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

# De onde o site PUBLICADO le os tiles. Fica aqui, e nao num .env, porque e verdade
# de deploy e nao de maquina: o Vite le web/.env.local TAMBEM no build de producao, e
# la mora o host LOCAL (:8081) do desenvolvedor. Sem passar explicitamente, o site
# publicado sairia pedindo tile da maquina de quem buildou — e funcionaria no teste
# de quem tem o host local de pe, que e o pior jeito de errar.
TILES_BASE_URL="${VITE_TILES_BASE_URL:-https://tiles.averisen.com/tiles}"

build_app() {
  echo "▶ Build do frontend (no container) — tiles de ${TILES_BASE_URL}…"
  docker compose run --rm -e VITE_TILES_BASE_URL="$TILES_BASE_URL" web \
    sh -c "npm install && npm run build"
  # O bundle e minificado e a URL entra nele literalmente: se nao estiver la, o
  # build pegou outra fonte de configuracao e o deploy nao pode seguir.
  grep -rqF "$TILES_BASE_URL" web/dist/assets/ \
    || { echo "✗ o bundle nao contem ${TILES_BASE_URL} — build pegou outra config" >&2; exit 1; }
  echo "  ✓ bundle aponta para ${TILES_BASE_URL}"
}

push_app() {
  echo "▶ Enviando frontend → $VPS_HOST:$VPS_PATH/ (exceto tiles)…"
  rsync -avz --delete --exclude 'tiles' \
    web/dist/ "$VPS_HOST:$VPS_PATH/"
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
  # O vigia roda de cron na VPS: o agente reinicia sozinho se morrer, mas ninguem
  # avisa quando ele sobe SEM banco — e nesse estado o mapa segue no ar e so o chat
  # morre, em silencio. Idempotente: reinstala a linha a cada deploy.
  echo "▶ Instalando o cron do vigia (a cada 10 min)…"
  ssh "$VPS_HOST" "
    linha='*/10 * * * * \$HOME/$GEO_PATH/deploy/vigia-app.sh >> \$HOME/$GEO_PATH/vigia.log 2>&1'
    ( crontab -l 2>/dev/null | grep -v 'vigia-app.sh' ; echo \"\$linha\" ) | crontab -
  "

  echo "ℹ Primeira vez? Falta o passo ROOT (systemd + Caddy /api) — rode na SUA máquina:"
  echo "    ssh -t $VPS_HOST 'sudo bash ~/$GEO_PATH/deploy/setup-agent-vps.sh'"
  echo "  Nas demais vezes, só reinicie o serviço:"
  echo "    ssh -t $VPS_HOST 'sudo systemctl restart geo-agent'"
}

case "$WHAT" in
  app)   build_app; push_app ;;
  agent|ia) push_agent ;;
  all)   build_app; push_app ;;
  *) echo "alvo inválido: $WHAT (use: app | agent | ia | all)"; exit 1 ;;
esac

echo "✔ Concluído."
