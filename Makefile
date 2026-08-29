# Geo Intelligence — fluxo: desenvolve → valida → manda pra VPS.
# Tudo roda em container (não há node/gdal/caddy no host).

VPS_HOST ?= hetzner-gramos

.PHONY: help dev dev-cliente dev-lado-a-lado build preview ship ship-app ship-ia tiles down agent dev-ia

help:            ## mostra os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ── Desenvolve ────────────────────────────────────────────────────────────
dev:             ## dev server (Vite + HMR) em http://localhost:5173
	docker compose up web

# Uma aplicacao por cliente, do mesmo codigo: a escolha e no build (VITE_CLIENTE),
# nao em runtime. Nomes de projeto distintos para os dois nao brigarem por
# container. Ver web/src/clientes/.
dev-cliente:     ## dev server de outro cliente: make dev-cliente CLIENTE=eb-prime [PORTA=5174]
	@test -n "$(CLIENTE)" || { echo "uso: make dev-cliente CLIENTE=<id> [PORTA=5174]"; exit 1; }
	@test -f web/src/clientes/$(CLIENTE).ts \
	  || { echo "cliente '$(CLIENTE)' nao existe em web/src/clientes/"; exit 1; }
	VITE_CLIENTE=$(CLIENTE) PORTA_WEB=$(or $(PORTA),5174) \
	  docker compose -p geo-$(CLIENTE) up web

dev-lado-a-lado: ## sobe cliente 1 (:5173) e EB Prime (:5174) juntos, em background
	docker compose up -d web
	VITE_CLIENTE=eb-prime PORTA_WEB=5174 docker compose -p geo-eb-prime up -d web
	@echo "→ Geo Intelligence  http://localhost:5173"
	@echo "→ EB Prime          http://localhost:5174"

# ── IA (Fase 2 — chat local) ─────────────────────────────────────────────
agent:           ## backend do agente (uv, nativo) em :8000 — requer agent/.env com a chave
	cd agent && uv run uvicorn geo_agent.main:app --reload --port 8000

dev-ia:          ## front (:5173, background) + agente (:8000) — Ctrl+C derruba o agente
	docker compose up -d web
	cd agent && uv run uvicorn geo_agent.main:app --reload --port 8000

# ── Valida ────────────────────────────────────────────────────────────────
build:           ## gera o build de produção em web/dist
	docker compose run --rm web sh -c "npm install && npm run build"

preview: build   ## valida o build em http://localhost:8080 (Caddy, IGUAL à VPS)
	@echo "→ Preview de produção em http://localhost:8080 (Ctrl+C p/ sair)"
	docker compose --profile preview up preview

# ── Manda pra VPS ─────────────────────────────────────────────────────────
ship:            ## envia o app para a VPS (build incluso)
	./deploy/deploy.sh all

ship-app:        ## envia só o frontend (redeploy rápido de código)
	./deploy/deploy.sh app

ship-ia:         ## envia o agente pra VPS (1ª vez exige setup sudo — ver deploy/)
	./deploy/deploy.sh ia

# ── ETL ───────────────────────────────────────────────────────────────────
tiles:           ## (re)gera tiles + basemap (ETL no container)
	docker compose run --rm pipeline build

down:            ## derruba containers em pé
	docker compose --profile preview down
