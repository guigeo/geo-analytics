#!/usr/bin/env bash
# Setup ROOT do agente na VPS (fase 2.1) — rodar UMA vez, na VPS, com sudo:
#   ssh -t hetzner-gramos 'sudo bash ~/projects/geo/deploy/setup-agent-vps.sh'
#
# Pre-requisito: `deploy/deploy.sh agent` + `deploy/deploy.sh data` ja executados
# (codigo, .env, venv e parquets em /home/gramos/projects/geo). Este script so faz o que
# exige root: instalar o unit do systemd e expor /api no Caddy. Idempotente.
set -euo pipefail

GEO=/home/gramos/projects/geo
CADDYFILE=/etc/caddy/Caddyfile

echo "▶ systemd: instalando geo-agent.service…"
cp "$GEO/deploy/geo-agent.service" /etc/systemd/system/geo-agent.service
systemctl daemon-reload
systemctl enable --now geo-agent
systemctl restart geo-agent

echo "▶ Caddy: expondo /api no bloco geo-intelligence…"
python3 - "$CADDYFILE" <<'PY'
import sys
from pathlib import Path

p = Path(sys.argv[1])
s = p.read_text()
if "@api" in s:
    print("  ja configurado — pulando")
else:
    block = (
        "\t# Chat IA (fase 2.1): agente FastAPI local (systemd geo-agent, :8000)\n"
        "\t@api path /api/*\n"
        "\treverse_proxy @api 127.0.0.1:8000\n\n"
    )
    lines = s.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if line.strip().startswith("geo-intelligence") and line.rstrip().endswith("{"):
            lines.insert(i + 1, block)
            break
    else:
        sys.exit("bloco geo-intelligence nao encontrado no Caddyfile")
    p.write_text("".join(lines))
    print("  bloco /api inserido")
PY
caddy validate --config "$CADDYFILE"
systemctl reload caddy

echo "▶ Verificando…"
sleep 2
systemctl is-active geo-agent
curl -sS -m 10 http://127.0.0.1:8000/api/health && echo
echo "✔ Setup concluido. Teste publico: https://geo-intelligence.averisen.com/api/health"
