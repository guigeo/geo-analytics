#!/usr/bin/env bash
# Renderiza um modelo de deploy para um cliente.
#
#   ./deploy/renderizar.sh deploy/Caddyfile.modelo eb-prime
#   ./deploy/renderizar.sh deploy/agente.service.modelo         # cliente 1
#
# Os valores vêm de `deploy/clientes/<id>.env`. É o mesmo princípio das outras
# duas fronteiras de cliente deste repositório — `web/src/clientes/<id>.ts` e
# `agent/src/geo_agent/clientes/<id>.toml` —, aqui para o que a VPS precisa saber:
# domínio, caminhos, unit do systemd, porta e portão.
#
# Sintaxe do modelo:
#   {{VARIAVEL}}                     substituído; vazio ou ausente é ERRO
#   {{#SE VARIAVEL}} … {{/SE}}       o trecho só sai se a variável tiver valor
#
# Erro alto de propósito: config de deploy incompleta que só aparece depois do
# rsync é a categoria cara — o arquivo já está na VPS quando o problema fala.
set -euo pipefail

MODELO="${1:?uso: renderizar.sh <modelo> [cliente]}"
CLIENTE="${2:-${CLIENTE:-geo-analytics}}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARQUIVO_CLIENTE="$RAIZ/deploy/clientes/$CLIENTE.env"

if [[ ! -f "$ARQUIVO_CLIENTE" ]]; then
  disponiveis="$(cd "$RAIZ/deploy/clientes" && ls *.env 2>/dev/null | sed 's/\.env$//' | paste -sd', ' -)"
  echo "✗ cliente '$CLIENTE' não existe em deploy/clientes/. Disponíveis: $disponiveis" >&2
  exit 1
fi

# O ambiente GANHA do arquivo: `DOMINIO=… ./deploy/renderizar.sh …` serve para
# ensaiar um cliente cujo valor ainda não foi decidido, sem inventá-lo no arquivo.
CLIENTE="$CLIENTE" ARQUIVO_CLIENTE="$ARQUIVO_CLIENTE" python3 - "$MODELO" <<'PY'
import os
import re
import sys

modelo = open(sys.argv[1], encoding="utf-8").read()
cliente = os.environ["CLIENTE"]

# O arquivo do cliente é KEY=VALUE (continua sourceable por shell), lido aqui em
# vez de `.` no bash: assim ele é dado, e não código que roda no meio do deploy.
for linha in open(os.environ["ARQUIVO_CLIENTE"], encoding="utf-8"):
    linha = linha.strip()
    if not linha or linha.startswith("#") or "=" not in linha:
        continue
    chave, valor = linha.split("=", 1)
    os.environ.setdefault(chave.strip(), valor.strip().strip("'\""))

# 1. Blocos condicionais primeiro: o que for cortado não exige suas variáveis.
def bloco(m: re.Match) -> str:
    return m.group(2) if os.environ.get(m.group(1), "") else ""

modelo = re.sub(
    r"\{\{#SE (\w+)\}\}\n(.*?)\{\{/SE\}\}\n", bloco, modelo, flags=re.DOTALL
)

# 2. O que sobrou tem de estar preenchido.
faltando = sorted(
    {n for n in re.findall(r"\{\{(\w+)\}\}", modelo) if not os.environ.get(n, "")}
)
if faltando:
    sys.exit(
        f"✗ deploy/clientes/{cliente}.env não define: {', '.join(faltando)}\n"
        "  (vazio conta como não definido — ver os comentários do arquivo)"
    )

sys.stdout.write(re.sub(r"\{\{(\w+)\}\}", lambda m: os.environ[m.group(1)], modelo))
PY
