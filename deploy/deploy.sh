#!/usr/bin/env bash
# Deploy de UMA aplicação derivada para a VPS (build estático + agente).
#
# Uso:
#   ./deploy/deploy.sh                      # tudo do cliente 1 (frontend + agente)
#   CLIENTE=eb-prime ./deploy/deploy.sh     # app do cliente 2
#   ./deploy/deploy.sh app                  # só o frontend (rápido)
#   ./deploy/deploy.sh ia                   # código do agente (query/ + agent/ + .env) + uv sync
#                                           # (systemd/Caddy na 1ª vez: setup-agente-vps.sh)
#   ENSAIO=1 ./deploy/deploy.sh app         # ENSAIO: não toca a VPS (ver abaixo)
#
# Não há alvo `tiles`: publicar tile é `make ship-tiles` no repositório webgis, que
# é o dono do host compartilhado. Enquanto o comando morasse aqui, era esta
# aplicação a dona de fato do dado universal.
#
# Não há mais alvo `data`: o agente lê o geodata (PostGIS) por GEODATA_DSN, não
# parquets copiados para a VPS. Ver ../webgis/docs/adr, passo 3 do roteiro.
#
# QUAL CLIENTE (fase 6 do passo 5 do ADR-0001): `CLIENTE` escolhe, e os caminhos,
# o domínio, o unit do systemd, a porta e o portão saem de deploy/clientes/<id>.env
# — não mais de constantes cravadas aqui. O padrão é o cliente 1, então quem não
# passa nada continua com o comportamento de sempre.
#
# ENSAIO: com ENSAIO=1 nada sai da máquina. O rsync escreve num diretório local
# (ENSAIO_DIR, padrão /tmp/ensaio-deploy/<cliente>) e todo comando que iria por ssh
# é impresso em vez de executado. É assim que a fase 6 se prova sem publicar.
#
# Variáveis:
#   CLIENTE   (opcional)  qual aplicação; padrão geo-analytics
#   VPS_HOST  (opcional)  atalho ssh ou usuario@IP; padrão hetzner-gramos
#   ENSAIO    (opcional)  1 = não toca a VPS
#   VITE_TILES_BASE_URL   de onde o site publicado lê os tiles (default: produção)
set -euo pipefail

VPS_HOST="${VPS_HOST:-hetzner-gramos}"
CLIENTE="${CLIENTE:-geo-analytics}"
ENSAIO="${ENSAIO:-}"
WHAT="${1:-all}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Quem é este cliente: domínio, caminhos, unit, porta e portão.
# shellcheck source=deploy/carregar-cliente.sh
. "$REPO_ROOT/deploy/carregar-cliente.sh"

if [[ -f .env ]]; then set -a; . ./.env; set +a; fi

# De onde o site PUBLICADO le os tiles. Fica aqui, e nao num .env, porque e verdade
# de deploy e nao de maquina: o Vite le web/.env.local TAMBEM no build de producao, e
# la mora o host LOCAL (:8081) do desenvolvedor. Sem passar explicitamente, o site
# publicado sairia pedindo tile da maquina de quem buildou — e funcionaria no teste
# de quem tem o host local de pe, que e o pior jeito de errar.
TILES_BASE_URL="${VITE_TILES_BASE_URL:-https://tiles.averisen.com/tiles}"

ENSAIO_DIR="${ENSAIO_DIR:-/tmp/ensaio-deploy/$CLIENTE}"
if [[ -n "$ENSAIO" ]]; then
  echo "▶ ENSAIO — nada sai desta máquina. Destino: $ENSAIO_DIR"
  mkdir -p "$ENSAIO_DIR"
fi

# Destino de um rsync: a VPS, ou uma pasta local quando em ensaio.
destino() {
  if [[ -n "$ENSAIO" ]]; then
    mkdir -p "$ENSAIO_DIR/$1"
    echo "$ENSAIO_DIR/$1"
  else
    echo "$VPS_HOST:$1"
  fi
}

# Comando que roda NA VPS. Em ensaio, é impresso e não executado — inclusive o
# `uv sync` e o crontab, que são os que mais doem se rodarem no cliente errado.
no_servidor() {
  if [[ -n "$ENSAIO" ]]; then
    # Uma linha por comando, sem o ruido da indentacao do heredoc: o que importa
    # no ensaio e conferir COM QUE ARGUMENTOS ele iria rodar.
    printf '  [ensaio] ssh %s:\n' "$VPS_HOST"
    printf '%s\n' "$1" | sed '/^[[:space:]]*$/d; s/^[[:space:]]*/      /'
  else
    ssh "$VPS_HOST" "$1"
  fi
}

echo "▶ Cliente: $CLIENTE  ($DOMINIO)"

build_app() {
  echo "▶ Build do frontend de $CLIENTE (no container) — tiles de ${TILES_BASE_URL}…"
  # `npm ci` instala EXATAMENTE o package-lock.json e falha se ele divergir do
  # package.json. Com `npm install` o build de producao resolvia as dependencias
  # por conta propria, e o que a CI validou nao era necessariamente o que subia.
  # O carimbo do build (ver vite.config.ts). Arvore suja vira sufixo "-sujo": sem
  # ele o carimbo diria um commit que NAO descreve o que foi compilado, que e pior
  # do que nao ter carimbo — mentira com aparencia de precisao.
  local commit
  commit="$(git rev-parse --short HEAD)"
  git diff --quiet HEAD 2>/dev/null || commit="${commit}-sujo"

  docker compose run --rm \
    -e VITE_TILES_BASE_URL="$TILES_BASE_URL" -e VITE_CLIENTE="$CLIENTE" \
    -e VITE_COMMIT="$commit" web \
    sh -c "npm ci && npm run build"
  # O bundle e minificado e a URL entra nele literalmente: se nao estiver la, o
  # build pegou outra fonte de configuracao e o deploy nao pode seguir.
  grep -rqF "$TILES_BASE_URL" web/dist/assets/ \
    || { echo "✗ o bundle nao contem ${TILES_BASE_URL} — build pegou outra config" >&2; exit 1; }
  # Mesma paranoia para o cliente: um bundle do cliente errado publicado no
  # dominio certo e o pior erro possivel desta fase, e ele e silencioso — o site
  # sobe, funciona, e mostra a marca de outra empresa.
  toml_do_cliente="agent/src/geo_agent/clientes/$CLIENTE.toml"
  [[ -f "$toml_do_cliente" ]] \
    || { echo "✗ falta $toml_do_cliente — cliente declarado pela metade" >&2; exit 1; }
  nome_esperado="$(sed -n 's/^nome *= *"\(.*\)"/\1/p' "$toml_do_cliente")"
  # Nome vazio faria o grep abaixo casar com QUALQUER bundle: a checagem passaria
  # sempre, que e pior do que nao existir.
  [[ -n "$nome_esperado" ]] \
    || { echo "✗ $toml_do_cliente nao declara 'nome' — sem isso a checagem e cega" >&2; exit 1; }
  grep -rqF "$nome_esperado" web/dist/assets/ \
    || { echo "✗ o bundle nao contem \"$nome_esperado\" — build de outro cliente?" >&2; exit 1; }
  # O carimbo tem de estar no index.html publicado, senao o verificar-vps do
  # `webgis` fica cego justamente para a deriva que ele veio detectar.
  grep -qF "commit=$commit" web/dist/index.html \
    || { echo "✗ o index.html nao tem o carimbo commit=$commit" >&2; exit 1; }
  echo "  ✓ bundle aponta para ${TILES_BASE_URL}, é do $nome_esperado e carimbado $commit"

  # ── 4ª checagem: toda camada declarada tem tile publicado ──────────────────
  #
  # As tres acima conferem que o bundle e o certo. Esta confere que o MUNDO em volta
  # dele esta pronto — e ela existe porque a falha que fecha nao da erro nenhum: o
  # bundle declara uma camada, o `.pmtiles` nao esta no host, e a camada aparece no
  # painel, liga, e nao pinta nada. Ninguem e avisado; o usuario conclui que nao ha
  # dado ali.
  #
  # Escrita em 2026-09-06, como passo da publicacao do ZONEAMENTO_SP — que ficou tres
  # dias pronto na `main` e fora do ar justamente porque um `ship-app` por qualquer
  # outro motivo teria levado a camada junto, morta. Com esta checagem, feature pronta
  # pode esperar na `main` sem risco: o deploy recusa antes de publicar.
  #
  # A lista sai do ARQUIVO DO CLIENTE, que e a fonte de quais camadas este build
  # declara. O bundle nao serve: ele monta a URL do tile em runtime
  # (web/src/map/tileHost.ts), entao nao ha nome de arquivo dentro dele para procurar.
  local camadas
  camadas="$(grep -oE 'CATALOGO\.[a-z0-9_]+' "web/src/clientes/${CLIENTE}.ts" \
             | sed 's/CATALOGO\.//' | sort -u)"

  # Zero camadas nao e "cliente sem camada", e o parse quebrado — alguem mudou a forma
  # de declarar. Publicar aqui seria publicar sem checagem NENHUMA, que e pior do que
  # nao ter a checagem: ela passaria verde para sempre.
  [[ -n "$camadas" ]] || {
    echo "✗ nao extrai camada nenhuma de web/src/clientes/${CLIENTE}.ts" >&2
    echo "  a forma de declarar mudou? conserte a extracao antes de publicar" >&2
    exit 1; }

  # `basemap` entra junto embora nao seja "camada" na configuracao: ele vem do mesmo
  # host (web/src/map/basemap.ts) e, sem ele, o mapa nasce branco — que e a versao
  # mais visivel do defeito que esta checagem existe para pegar.
  local faltando=()
  local nome cod
  for nome in $camadas basemap; do
    cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -I \
           "${TILES_BASE_URL}/${nome}.pmtiles" || echo 000)"
    [[ "$cod" == "200" ]] || faltando+=("${nome}.pmtiles (HTTP ${cod})")
  done

  if (( ${#faltando[@]} > 0 )); then
    echo "✗ o bundle declara camada sem tile publicado em ${TILES_BASE_URL}:" >&2
    printf '    %s\n' "${faltando[@]}" >&2
    echo "  publique os tiles antes: 'make ship-tiles' no repositorio webgis." >&2
    exit 1
  fi
  echo "  ✓ as $(echo "$camadas" | wc -l | tr -d ' ') camadas declaradas + basemap têm tile em ${TILES_BASE_URL}"
}

# A ORDEM DA PUBLICACAO, transformada em checagem para nao depender de alguem
# lembrar dela. Irmã das tres do build_app, e pelo mesmo motivo: o erro que ela fecha
# nao da mensagem nenhuma quando acontece.
#
# O portao novo entra ANTES de o velho sair. Publicar este bundle contra um agente
# antigo poe a tela de entrar no ar batendo em 404 — ninguem usa o produto. E na outra
# ordem, publicar o bloco de Caddy sem `basicauth` antes do agente devolve o /api/chat
# — e a chave da OpenAI atras dele — a internet aberta, que e exatamente o estado que a
# emenda de 2026-08-29 a §8 mediu e decidiu corrigir.
#
# O /api/auth/eu prova as duas coisas com uma resposta so: 401 significa que a rota
# existe (agente novo) E que o portao esta de pe. 404 e agente antigo; 200 e portao
# aberto, que e pior que nao ter publicado.
verificar_portao_da_vps() {
  if [[ -n "$ENSAIO" ]]; then
    echo "  [ensaio] curl https://$DOMINIO/api/auth/eu (esperado 401)"
    return
  fi
  local cod
  cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMINIO/api/auth/eu" || echo 000)"
  case "$cod" in
    401) echo "  ✓ o agente da VPS emite sessão e o portão está de pé (401 no /api/auth/eu)" ;;
    404) echo "✗ /api/auth/eu respondeu 404: o agente da VPS e anterior ao portal." >&2
         echo "  Rode 'make ship-ia' e reinicie o serviço ANTES de publicar o app." >&2
         exit 1 ;;
    200) echo "✗ /api/auth/eu respondeu 200 SEM sessão: o portão está aberto." >&2
         echo "  Nao publique nada até entender por quê." >&2
         exit 1 ;;
    *)   echo "✗ /api/auth/eu respondeu $cod (esperado 401) — VPS fora do ar?" >&2
         exit 1 ;;
  esac
}

push_app() {
  verificar_portao_da_vps
  echo "▶ Enviando frontend → $(destino "$CAMINHO_APP")/ (exceto tiles)…"
  rsync -avz --delete --exclude 'tiles' \
    web/dist/ "$(destino "$CAMINHO_APP")/"
}

push_agent() {
  echo "▶ Enviando query/ + agent/ + deploy/ → $(destino "$CAMINHO_AGENTE")/…"
  no_servidor "mkdir -p $CAMINHO_AGENTE"
  # O exclude e `.env*`, nao `.env`: o segredo por cliente e `.env.<id>`, e com o
  # padrao antigo ele viajava no rsync em massa — a credencial do portao de um
  # cliente aterrissava no diretorio do outro, que era exatamente o que o arquivo
  # por cliente veio evitar. O `.env` de verdade vai depois, montado.
  rsync -avz --delete \
    --exclude '.venv' --exclude '__pycache__' --exclude '.pytest_cache' \
    --exclude '.ruff_cache' --exclude '.env*' \
    query agent deploy "$(destino "$CAMINHO_AGENTE")/"
  # O `.env` que vai para a VPS e o comum MAIS o do cliente, quando existir.
  #
  # Ha segredo que e igual para todo mundo (chave da OpenAI, GEODATA_DSN) e
  # segredo que e de um cliente so — o ACERVO_DSN, que carrega o papel do Postgres
  # DAQUELE cliente. Antes disto havia um `.env` unico para os dois, e a credencial
  # de um cliente aterrissava no diretorio do outro. Nenhum dos dois e versionado.
  # (Ate 2026-09-06 a PORTAO_CREDENCIAL tambem morava aqui; o portao virou sessao.)
  #
  # O do cliente vem por ultimo de proposito: em shell, a ultima atribuicao vence,
  # entao ele tambem serve para sobrescrever um valor comum.
  ENV_CLIENTE="agent/.env.$CLIENTE"
  if [[ -f agent/.env ]]; then
    # O agente nao sobe sem GEODATA_DSN desde que a fachada passou a ler PostGIS.
    # Melhor parar aqui do que descobrir pelo systemd em restart loop na VPS.
    grep -qh '^GEODATA_DSN=' agent/.env "$ENV_CLIENTE" 2>/dev/null \
      || { echo "✗ agent/.env sem GEODATA_DSN — o serviço não sobe. Ver agent/.env.example" >&2; exit 1; }
    JUNTOS="$(mktemp)"
    # O arquivo carrega segredo: nasce fechado e some na saida, inclusive por erro.
    chmod 600 "$JUNTOS"
    trap 'rm -f "$JUNTOS"' EXIT
    cat agent/.env > "$JUNTOS"
    if [[ -f "$ENV_CLIENTE" ]]; then
      printf '\n# --- de %s, no deploy ---\n' "$ENV_CLIENTE" >> "$JUNTOS"
      cat "$ENV_CLIENTE" >> "$JUNTOS"
      echo "▶ Enviando agent/.env + ${ENV_CLIENTE}…"
    else
      echo "▶ Enviando agent/.env (chave OpenAI + GEODATA_DSN)…"
    fi
    # Sem `--chmod`: o rsync do macOS e o 2.6.9 da Apple e nao conhece a opcao.
    # O `-a` preserva o modo da origem, e o temporario ja nasce 600 acima.
    rsync -avz "$JUNTOS" "$(destino "$CAMINHO_AGENTE")/agent/.env"
  else
    echo "⚠ agent/.env não existe local — o serviço não sobe sem a chave e o DSN."
  fi
  echo "▶ uv sync no servidor (instala uv se preciso; python gerenciado 3.12)…"
  no_servidor "
    set -e
    command -v \$HOME/.local/bin/uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh
    cd $CAMINHO_AGENTE/agent && \$HOME/.local/bin/uv sync --no-dev --python 3.12
  "
  # O vigia roda de cron na VPS: o agente reinicia sozinho se morrer, mas ninguem
  # avisa quando ele sobe SEM banco — e nesse estado o mapa segue no ar e so o chat
  # morre, em silencio. Idempotente: reinstala a linha a cada deploy.
  #
  # O filtro do crontab e pelo CAMINHO do cliente, nao por 'vigia-app.sh': com dois
  # clientes, o filtro antigo apagaria o vigia do outro a cada deploy.
  echo "▶ Instalando o cron do vigia de $CLIENTE (a cada 10 min)…"
  no_servidor "
    linha='*/10 * * * * CLIENTE=$CLIENTE \$HOME/$CAMINHO_AGENTE/deploy/vigia-app.sh >> \$HOME/$CAMINHO_AGENTE/vigia.log 2>&1'
    ( crontab -l 2>/dev/null | grep -v '$CAMINHO_AGENTE/deploy/vigia-app.sh' ; echo \"\$linha\" ) | crontab -
  "

  echo "ℹ Primeira vez? Falta o passo ROOT (systemd + bloco do Caddy) — rode na SUA máquina:"
  echo "    ssh -t $VPS_HOST 'sudo bash ~/$CAMINHO_AGENTE/deploy/setup-agente-vps.sh $CLIENTE'"
  echo "  Nas demais vezes, só reinicie o serviço:"
  echo "    ssh -t $VPS_HOST 'sudo systemctl restart $SERVICO'"
}

case "$WHAT" in
  app)   build_app; push_app ;;
  agent|ia) push_agent ;;
  # `all` manda a aplicação inteira: a cara e o agente. Ele significou "app +
  # tiles" até 2026-08-20, quando os tiles saíram para o `webgis` (d2a529a) e
  # sobrou um sinônimo de `app` com nome de tudo — o agente nunca esteve aqui.
  # Isso mordia na primeira subida de um cliente: o setup-agente-vps.sh exige o
  # código do agente já na home, e `make ship` não o mandava. Quem quer só a cara
  # continua tendo o caminho rápido em `app` (`make ship-app`).
  all)   build_app; push_app; push_agent ;;
  *) echo "alvo inválido: $WHAT (use: app | agent | ia | all)"; exit 1 ;;
esac

echo "✔ Concluído${ENSAIO:+ (ensaio — a VPS não foi tocada)}."
