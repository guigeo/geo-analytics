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

# SEM CREDENCIAL NENHUMA, desde 2026-09-06. Ate aqui o vigia carregava a
# PORTAO_CREDENCIAL para atravessar o basic auth do Caddy; o portao virou sessao no
# agente e vale so no /api, entao o site responde 200 a qualquer um e o /api/health
# esta na allowlist justamente para que este script nao precise de uma conta. Ver
# `agent/src/geo_agent/sessao.py` e a emenda de 2026-09-06 a §9 do ADR-0001.

falhas=()

# 1. O site responde e serve o HTML — agora SEM sessao, e isso e o esperado.
cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/")"
[ "$cod" = "200" ] || falhas+=("site respondeu HTTP $cod")

# 2. O indice de busca, que o front importa. Se sumir, a busca morre calada.
assets="$(curl -s --max-time 20 "$SITE/" | grep -oE 'assets/[^"]+\.js' | head -1)"
if [ -n "$assets" ]; then
    cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/$assets")"
    [ "$cod" = "200" ] || falhas+=("bundle $assets respondeu HTTP $cod")
else
    falhas+=("nao achei o bundle no HTML — build quebrado?")
fi

# 3. O agente, E o banco por tras dele. O /api/health devolve 503 se o geodata
#    nao responder: sem isso, o chat morre em silencio e o mapa segue no ar.
saude="$(curl -s --max-time 20 -w '\n%{http_code}' "$SITE/api/health")"
cod="$(printf '%s' "$saude" | tail -1)"
corpo="$(printf '%s' "$saude" | head -1)"
if [ "$cod" != "200" ]; then
    falhas+=("agente respondeu HTTP $cod: $corpo")
elif ! printf '%s' "$corpo" | grep -q '"geodata":"ok"'; then
    falhas+=("agente no ar mas sem banco: $corpo")
fi

# 3b. O acervo, que desde o portal tem uma segunda consequencia. Acervo fora do ar
#     nao derruba o mapa nem o chat — mas derruba o LOGIN, porque a sessao mora nele.
#     Quem for acordado por este alerta precisa saber disso antes de abrir o site e
#     concluir que esta tudo bem porque o mapa pintou.
if [ "$cod" = "200" ] && ! printf '%s' "$corpo" | grep -q '"acervo":"ok"'; then
    falhas+=("acervo fora do ar: desenhos indisponiveis E NINGUEM CONSEGUE ENTRAR — $corpo")
fi

# 4. O PORTAO ESTA DE PE. Esta checagem existe por causa de como a anterior falha:
#    desde que o site nasce aberto, "200 no /" deixou de distinguir "publicado
#    certo" de "portao removido por engano". As duas coisas sao verdade ao mesmo
#    tempo — site aberto E /api fechado —, e afirmar so a primeira e o mesmo defeito
#    que a quarta checagem do build_app existe para fechar do outro lado.
#
#    O /api/auth/eu e a rota certa para isso: ela NAO esta na allowlist, entao 401 e
#    a resposta correta sem sessao. 404 significa agente antigo; 200, portao aberto.
cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/api/auth/eu")"
case "$cod" in
    401) ;;
    404) falhas+=("/api/auth/eu respondeu 404 — o agente da VPS e anterior ao portal") ;;
    *)   falhas+=("PORTAO ABERTO: /api/auth/eu respondeu $cod sem sessao (esperado 401)") ;;
esac

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
