# Geo Intelligence — fluxo: desenvolve → valida → manda pra VPS.
# Tudo roda em container (não há node/gdal/caddy no host).

VPS_HOST ?= hetzner-gramos

.PHONY: help dev build preview ship ship-app ship-tiles tiles down

help:            ## mostra os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ── Desenvolve ────────────────────────────────────────────────────────────
dev:             ## dev server (Vite + HMR) em http://localhost:5173
	docker compose up web

# ── Valida ────────────────────────────────────────────────────────────────
build:           ## gera o build de produção em web/dist
	docker compose run --rm web sh -c "npm install && npm run build"

preview: build   ## valida o build em http://localhost:8080 (Caddy, IGUAL à VPS)
	@echo "→ Preview de produção em http://localhost:8080 (Ctrl+C p/ sair)"
	docker compose --profile preview up preview

# ── Manda pra VPS ─────────────────────────────────────────────────────────
ship:            ## envia app + tiles para a VPS (build incluso)
	./deploy/deploy.sh all

ship-app:        ## envia só o frontend (redeploy rápido de código)
	./deploy/deploy.sh app

ship-tiles:      ## envia só os tiles (~2 GB, incremental)
	./deploy/deploy.sh tiles

# ── ETL ───────────────────────────────────────────────────────────────────
tiles:           ## (re)gera tiles + basemap (ETL no container)
	docker compose run --rm pipeline build

down:            ## derruba containers em pé
	docker compose --profile preview down
