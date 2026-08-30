# Geo Intelligence — fluxo: desenvolve → valida → manda pra VPS.
# Tudo roda em container (não há node/gdal/caddy no host).

VPS_HOST ?= hetzner-gramos

# Qual aplicacao derivada os alvos operam. Padrao: o cliente 1, que e o
# comportamento de sempre para quem nao passa nada.
CLIENTE_ALVO = $(or $(CLIENTE),geo-analytics)

.PHONY: help dev dev-cliente dev-lado-a-lado build preview ship ship-app ship-ia ensaio tiles down agente dev-ia

help:            ## mostra os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Desenvolve ────────────────────────────────────────────────────────────
dev:             ## dev server (Vite + HMR) em http://localhost:5173
	docker compose up web

# Uma aplicacao por cliente, do mesmo codigo: a escolha e no build (VITE_CLIENTE),
# nao em runtime. Nomes de projeto distintos para os dois nao brigarem por
# container. Ver web/src/clientes/.
dev-cliente:     ## dev server de outro cliente: make dev-cliente CLIENTE=eb-prime [PORTA=5174] [PORTA_IA=8001]
	@test -n "$(CLIENTE)" || { echo "uso: make dev-cliente CLIENTE=<id> [PORTA=5174] [PORTA_IA=8001]"; exit 1; }
	@test -f web/src/clientes/$(CLIENTE).ts \
	  || { echo "cliente '$(CLIENTE)' nao existe em web/src/clientes/"; exit 1; }
	VITE_CLIENTE=$(CLIENTE) PORTA_WEB=$(or $(PORTA),5174) PORTA_AGENTE=$(PORTA_IA) \
	  docker compose -p geo-$(CLIENTE) up web

dev-lado-a-lado: ## sobe cliente 1 (:5173) e EB Prime (:5174) juntos, em background
	docker compose up -d web
	VITE_CLIENTE=eb-prime PORTA_WEB=5174 PORTA_AGENTE=8001 docker compose -p geo-eb-prime up -d web
	@echo "→ Geo Intelligence  http://localhost:5173   chat: make agente"
	@echo "→ EB Prime          http://localhost:5174   chat: make agente CLIENTE=eb-prime PORTA_IA=8001"
	@echo "  (os agentes rodam nativos, um por terminal — cada web faz proxy para o do seu cliente)"

# ── IA (Fase 2 — chat local) ─────────────────────────────────────────────
# Um agente por cliente, mesmo codigo: CLIENTE escolhe a persona (agent/src/
# geo_agent/clientes/<id>.toml) e PORTA_IA evita que os dois briguem pela mesma.
# Sem argumento nenhum, e o cliente 1 em :8000 — o comportamento de sempre.
PORTA_IA      ?= 8000

agente:          ## agente (uv, nativo): make agente [CLIENTE=eb-prime] [PORTA_IA=8001]
	@test -f agent/src/geo_agent/clientes/$(CLIENTE_ALVO).toml \
	  || { echo "cliente '$(CLIENTE_ALVO)' nao existe em agent/src/geo_agent/clientes/"; exit 1; }
	cd agent && CLIENTE=$(CLIENTE_ALVO) \
	  uv run uvicorn geo_agent.main:app --reload --port $(PORTA_IA)

dev-ia:          ## front (:5173, background) + agente do cliente 1 (:8000)
	docker compose up -d web
	$(MAKE) agente

# ── Valida ────────────────────────────────────────────────────────────────
build:           ## gera o build de produção em web/dist
	docker compose run --rm web sh -c "npm install && npm run build"

preview: build   ## valida o build em http://localhost:8080 (Caddy, IGUAL à VPS)
	@echo "→ Preview de produção em http://localhost:8080 (Ctrl+C p/ sair)"
	docker compose --profile preview up preview

# ── Manda pra VPS ─────────────────────────────────────────────────────────
# TUDO aqui aceita CLIENTE=<id>; sem ele, e o cliente 1. O que cada cliente tem
# de proprio (dominio, caminhos, unit, porta, portao) mora em deploy/clientes/.
ensaio:          ## ENSAIA o deploy sem tocar a VPS: make ensaio [CLIENTE=eb-prime]
	CLIENTE=$(CLIENTE_ALVO) ENSAIO=1 ./deploy/deploy.sh all

ship:            ## envia o app para a VPS (build incluso): make ship [CLIENTE=eb-prime]
	CLIENTE=$(CLIENTE_ALVO) ./deploy/deploy.sh all

ship-app:        ## envia só o frontend (redeploy rápido de código)
	CLIENTE=$(CLIENTE_ALVO) ./deploy/deploy.sh app

ship-ia:         ## envia o agente pra VPS (1ª vez exige setup sudo — ver deploy/)
	CLIENTE=$(CLIENTE_ALVO) ./deploy/deploy.sh ia

# ── ETL ───────────────────────────────────────────────────────────────────
tiles:           ## (re)gera tiles + basemap (ETL no container)
	docker compose run --rm pipeline build

down:            ## derruba containers em pé
	docker compose --profile preview down
