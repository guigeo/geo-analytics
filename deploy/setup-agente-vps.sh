#!/usr/bin/env bash
# Setup ROOT de UM cliente na VPS — rodar UMA vez por cliente, na VPS, com sudo:
#   ssh -t hetzner-gramos 'sudo bash ~/projects/geo/deploy/setup-agente-vps.sh geo-analytics'
#   ssh -t hetzner-gramos 'sudo bash ~/projects/eb-prime/deploy/setup-agente-vps.sh eb-prime'
#
# Pre-requisito: `CLIENTE=<id> deploy/deploy.sh ia` ja executado (codigo, .env e
# venv na home do gramos). Os dados vem do geodata por GEODATA_DSN, nao de arquivo
# copiado. Este script so faz o que exige root: instalar o unit do systemd e
# publicar o bloco de site no Caddy. Idempotente.
#
# Fase 6 do passo 5 do ADR-0001: tudo que era do cliente 1 virou parametro. O
# bloco do Caddy nao e mais remendado a mao aqui — ele e RENDERIZADO do modelo
# versionado (deploy/Caddyfile.modelo), que e a fonte do que esta em producao.
set -euo pipefail

CLIENTE="${1:-${CLIENTE:-geo-analytics}}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Os dois caminhos de root sao variaveis para o script poder ser ENSAIADO fora da
# VPS: `ENSAIO=1 CADDYFILE=/tmp/x DIR_SYSTEMD=/tmp/y ./deploy/setup-agente-vps.sh`
# escreve nos arquivos de teste e IMPRIME systemctl/caddy em vez de executar.
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
DIR_SYSTEMD="${DIR_SYSTEMD:-/etc/systemd/system}"
ENSAIO="${ENSAIO:-}"

executar() {
  if [[ -n "$ENSAIO" ]]; then
    echo "  [ensaio] $*"
  else
    "$@"
  fi
}

cd "$RAIZ"
# Mesma regra dos outros scripts, e checagem ANTES de mexer no systemd: descobrir
# que falta o dominio depois de instalar o unit e descobrir tarde.
# shellcheck source=deploy/carregar-cliente.sh
. "$RAIZ/deploy/carregar-cliente.sh"

echo "▶ Cliente: $CLIENTE ($DOMINIO) — unit $SERVICO, porta $PORTA_AGENTE"

echo "▶ systemd: instalando $SERVICO.service…"
./deploy/renderizar.sh deploy/agente.service.modelo "$CLIENTE" > "$DIR_SYSTEMD/$SERVICO.service"
executar systemctl daemon-reload
executar systemctl enable --now "$SERVICO"
executar systemctl restart "$SERVICO"

echo "▶ Caddy: bloco de site de ${DOMINIO}…"
BLOCO="/tmp/$CLIENTE.caddy"
./deploy/renderizar.sh deploy/Caddyfile.modelo "$CLIENTE" > "$BLOCO"

if grep -q "^$DOMINIO " "$CADDYFILE" || grep -q "^$DOMINIO{" "$CADDYFILE"; then
  # Acrescentar de novo produziria dois blocos do mesmo dominio. ATUALIZAR e
  # outra operacao, e ela monta o arquivo inteiro a partir das fontes — ver
  # ../webgis/docs/VPS.md, que e o dono desse procedimento.
  echo "  ℹ o bloco de $DOMINIO JA existe no $CADDYFILE — nao mexo nele."
  echo "    O bloco recem-renderizado esta em $BLOCO; compare antes de decidir:"
  echo "      diff <(sed -n '/^$DOMINIO /,/^}/p' $CADDYFILE) $BLOCO"
else
  cp "$CADDYFILE" "$CADDYFILE.bak"
  printf '\n' >> "$CADDYFILE"
  cat "$BLOCO" >> "$CADDYFILE"
  # O validate roda ANTES do reload: config invalida derruba o reload, nao o
  # Caddy que esta servindo os outros sites da maquina.
  if [[ -z "$ENSAIO" ]] && ! caddy validate --config "$CADDYFILE"; then
    cp "$CADDYFILE.bak" "$CADDYFILE"
    echo "✗ config invalida — revertido do .bak, nada foi recarregado." >&2
    exit 1
  fi
  executar systemctl reload caddy
  echo "  ✓ bloco de $DOMINIO acrescentado (backup em $CADDYFILE.bak)"
fi

echo "▶ Verificando…"
if [[ -z "$ENSAIO" ]]; then
  sleep 2
  systemctl is-active "$SERVICO"
  curl -sS -m 10 "http://127.0.0.1:$PORTA_AGENTE/api/health" && echo
else
  echo "  [ensaio] systemctl is-active $SERVICO && curl http://127.0.0.1:$PORTA_AGENTE/api/health"
fi
echo "✔ Setup concluido."
if [[ -n "${PORTAO_USUARIO:-}" ]]; then
  echo "  Teste publico (com portao): curl -u $PORTAO_USUARIO:SENHA https://$DOMINIO/api/health"
else
  echo "  Teste publico: https://$DOMINIO/api/health"
fi
