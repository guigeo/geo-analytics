#!/usr/bin/env bash
# Carrega deploy/clientes/$CLIENTE.env — para ser SOURCED, não executado:
#
#   CLIENTE=eb-prime . "$RAIZ/deploy/carregar-cliente.sh"
#
# Regra única, e por isso um arquivo só: **o ambiente ganha do arquivo**. Assim dá
# para ensaiar um cliente cujo valor ainda não foi decidido (`DOMINIO=… make
# ensaio`) sem inventá-lo no arquivo versionado. Três scripts liam este arquivo de
# três jeitos até 2026-08-30, e um deles deixava o vazio do arquivo vencer o
# ambiente — o tipo de divergência que só aparece na hora do deploy.
#
# Define: DOMINIO, CAMINHO_APP, CAMINHO_AGENTE, SERVICO, PORTA_AGENTE,
# PORTAO_USUARIO, PORTAO_HASH — e falha alto se faltar o que é obrigatório.

CLIENTE="${CLIENTE:-geo-analytics}"
_RAIZ_CLIENTE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_ARQUIVO_CLIENTE="$_RAIZ_CLIENTE/deploy/clientes/$CLIENTE.env"

if [[ ! -f "$_ARQUIVO_CLIENTE" ]]; then
  echo "✗ cliente '$CLIENTE' não existe em deploy/clientes/. Disponíveis:" >&2
  (cd "$_RAIZ_CLIENTE/deploy/clientes" && ls ./*.env | sed 's#^\./#    #; s/\.env$//') >&2
  return 1 2>/dev/null || exit 1
fi

while IFS= read -r _linha; do
  _linha="${_linha%%#*}"
  [[ "$_linha" == *=* ]] || continue
  _chave="${_linha%%=*}"; _chave="${_chave//[[:space:]]/}"
  _valor="${_linha#*=}"; _valor="${_valor#"${_valor%%[![:space:]]*}"}"
  _valor="${_valor%"${_valor##*[![:space:]]}"}"
  _valor="${_valor%\'}"; _valor="${_valor#\'}"
  [[ -n "$_chave" ]] || continue
  printf -v "$_chave" '%s' "${!_chave:-$_valor}"
  export "${_chave?}"
done < "$_ARQUIVO_CLIENTE"

: "${DOMINIO:?deploy/clientes/$CLIENTE.env não define DOMINIO — ver os comentários de lá}"
: "${CAMINHO_APP:?deploy/clientes/$CLIENTE.env não define CAMINHO_APP}"
: "${CAMINHO_AGENTE:?deploy/clientes/$CLIENTE.env não define CAMINHO_AGENTE}"
: "${SERVICO:?deploy/clientes/$CLIENTE.env não define SERVICO}"
: "${PORTA_AGENTE:?deploy/clientes/$CLIENTE.env não define PORTA_AGENTE}"
