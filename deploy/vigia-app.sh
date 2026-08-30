#!/usr/bin/env bash
#
# Vigia o site e o agente em producao.
#
#   ./deploy/vigia-app.sh            # verifica e alerta se falhar
#   ./deploy/vigia-app.sh --sempre   # alerta mesmo quando esta tudo bem
#
# Roda de cron NA VPS, ao lado do vigia-tiles.sh do webgis. Sao dois de proposito:
# o host de tiles e infraestrutura compartilhada e o site e de um cliente. O
# segundo cliente ganhou o proprio vigia na fase 6 (uma linha de cron por cliente,
# com CLIENTE=<id>), e o dos tiles continua um so.
#
#   CLIENTE=eb-prime ./deploy/vigia-app.sh
#
# NAO faz pergunta ao chat: cada pergunta custa chave da OpenAI, e um monitor que
# gasta dinheiro a cada 5 minutos vira o proximo problema. O /api/health ja toca o
# banco, que e o que precisa ser sabido.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$RAIZ/agent/.env" ] && { set -a; . "$RAIZ/agent/.env"; set +a; }

# Qual cliente este vigia vigia. O dominio sai do arquivo do cliente, nao de uma
# URL cravada: dois clientes, dois dominios, um script.
# Sem dominio nao ha o que vigiar, e "https:///" alertaria a cada 10 minutos: o
# carregador compartilhado ja falha alto nesse caso.
# shellcheck source=deploy/carregar-cliente.sh
. "$RAIZ/deploy/carregar-cliente.sh"

SITE="${SITE_URL:-https://$DOMINIO}"

# Portao: sem a credencial, um site com basic auth responde 401 e o vigia alerta a
# cada 10 minutos sobre um site que esta perfeitamente de pe. A credencial mora no
# agent/.env da VPS (que nao e versionado), no formato usuario:senha — nunca aqui.
CURL_AUTH=()
[ -n "${PORTAO_CREDENCIAL:-}" ] && CURL_AUTH=(-u "$PORTAO_CREDENCIAL")

falhas=()

# 1. O site responde e serve o HTML.
cod="$(curl -s ${CURL_AUTH[@]+"${CURL_AUTH[@]}"} -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/")"
[ "$cod" = "200" ] || falhas+=("site respondeu HTTP $cod")

# 2. O indice de busca, que o front importa. Se sumir, a busca morre calada.
cod="$(curl -s ${CURL_AUTH[@]+"${CURL_AUTH[@]}"} -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/")"
assets="$(curl -s ${CURL_AUTH[@]+"${CURL_AUTH[@]}"} --max-time 20 "$SITE/" | grep -oE 'assets/[^"]+\.js' | head -1)"
if [ -n "$assets" ]; then
    cod="$(curl -s ${CURL_AUTH[@]+"${CURL_AUTH[@]}"} -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/$assets")"
    [ "$cod" = "200" ] || falhas+=("bundle $assets respondeu HTTP $cod")
else
    falhas+=("nao achei o bundle no HTML — build quebrado?")
fi

# 3. O agente, E o banco por tras dele. O /api/health devolve 503 se o geodata
#    nao responder: sem isso, o chat morre em silencio e o mapa segue no ar.
saude="$(curl -s ${CURL_AUTH[@]+"${CURL_AUTH[@]}"} --max-time 20 -w '\n%{http_code}' "$SITE/api/health")"
cod="$(printf '%s' "$saude" | tail -1)"
corpo="$(printf '%s' "$saude" | head -1)"
if [ "$cod" != "200" ]; then
    falhas+=("agente respondeu HTTP $cod: $corpo")
elif ! printf '%s' "$corpo" | grep -q '"geodata":"ok"'; then
    falhas+=("agente no ar mas sem banco: $corpo")
fi

avisar() {
    [ -z "${NTFY_TOPIC:-}" ] && { echo "NTFY_TOPIC ausente — sem alerta" >&2; return; }
    curl -s -H "Title: $1" -H "Priority: ${3:-default}" -H "Tags: $4" \
         -d "$2" "https://ntfy.sh/$NTFY_TOPIC" > /dev/null
}

if [ ${#falhas[@]} -eq 0 ]; then
    echo "$(date '+%F %T') $CLIENTE ok"
    [ "${1:-}" = "--sempre" ] && avisar "$CLIENTE: ok" "Site e agente saudaveis em $(date '+%F %H:%M')" default white_check_mark
    exit 0
fi

printf '%s FALHA\n%s\n' "$(date '+%F %T')" "$(printf '%s\n' "${falhas[@]}")"
avisar "$CLIENTE: FALHA" "$(printf '%s\n' "${falhas[@]}")" urgent rotating_light
exit 1
