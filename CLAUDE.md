# CLAUDE.md

Guia prático do código para o Claude Code. Para contexto de produto e workflow SDD,
ver [`.claude/CLAUDE.md`](.claude/CLAUDE.md) e [`.claude/sdd/archive/`](.claude/sdd/archive/).

## O que é

Mapa web estático (MapLibre) + ETL geoespacial em Docker + **chat com agente de IA**
(Fase 2, local). Pipeline: `shp/gpkg/csv → GeoParquet (canônico) → PMTiles → MapLibre`.
O chat: `web (React) → agent/ (FastAPI + OpenAI function calling) → query/ (DuckDB)` —
o agente responde em texto e o mapa pinta os códigos retornados pelas tools.
**No ar:** https://geo-intelligence.averisen.com (VPS Hetzner + Caddy; ver `deploy/`) —
mapa + busca + chat (fase 2.1): o agente roda na VPS como serviço systemd `geo-agent`
(uv/python 3.12 em `~/geo`, só 127.0.0.1:8000; Caddy expõe `/api`). Parquets do agente
na VPS em `~/geo/data/processed` — o `setor.parquet` de lá é ENXUTO (só CD_SETOR +
geom_bbox, 6,5 MB vs 1 GB; gerado no `deploy.sh data`). Rate limit por IP no backend
(30 perguntas/10 min) protege a chave OpenAI.

## Fluxo (Makefile — porta de entrada única)

```bash
make dev        # desenvolve: Vite + HMR em :5173
make dev-ia     # dev + chat: front (:5173) + agente (:8000) — requer agent/.env
make agent      # só o backend do agente (uv nativo, :8000)
make preview    # valida: build + Caddy local em :8080 (IGUAL à VPS)
make ship       # manda pra VPS: app + tiles (build incluso)
make ship-app   # só o frontend (redeploy rápido)   |  make ship-tiles (~2 GB)
make ship-ia    # dados + agente pra VPS (1ª vez: setup sudo — deploy/setup-agent-vps.sh)
make help       # lista todos os alvos
```

`dev` é rápido mas difere da produção; **antes de `ship`, valide com `preview`** (mesmo
Caddy, mesma config de Range/compressão dos tiles). `ship*` usam `deploy/deploy.sh`
(rsync via atalho `hetzner-gramos` do `~/.ssh/config`).

## Comandos (detalhe)

```bash
# ETL (no container — gdal/tippecanoe/pmtiles vivem na imagem, NÃO no host)
docker compose build
docker compose run --rm pipeline build                 # tudo: GeoParquet + tiles + basemap
docker compose run --rm pipeline build --only <nome>   # um dataset
docker compose run --rm pipeline build --basemap-only  # só basemap (não re-tila dados)
docker compose run --rm pipeline census                # ingere Censo 2022 -> data/processed/censo_setor.parquet
docker compose run --rm pipeline census-municipio      # agrega setor -> data/processed/censo_municipio.parquet
cd pipeline && uv run geo-pipeline search-index        # indice de busca do front (nativo, so duckdb)
#   -> web/src/search/municipios.json (gitignored). OBRIGATORIO antes de `npm run build`
#      em clone novo: o front importa esse JSON via `?url` (asset com hash).

# Frontend (NÃO há node no host — usar o container)
docker compose up web                                  # dev :5173 (= make dev)
docker compose exec web npm run typecheck

# Testes/lint do ETL (lógica pura roda nativa com uv)
cd pipeline && uv sync --group dev && uv run pytest && uv run ruff check .

# Camada de consulta (Fase 2 — roda nativa com uv, precisa dos parquets em data/processed)
cd query && uv sync --group dev && uv run pytest && uv run ruff check .

# Agente de IA (Fase 2 — nativo com uv; testes rodam OFFLINE, benchmark chama a OpenAI)
cd agent && uv sync --group dev && uv run pytest && uv run ruff check .
cd agent && uv run pytest -m benchmark -v   # 17 casos reais (requer agent/.env; ~17 chamadas)
```

## Arquitetura

- **`pipeline/`** — projeto `uv`. Orquestrado por `cli.py`, dirigido por `datasets.yaml`
  (registry declarativo: 1 entrada por camada → adicionar dataset = editar YAML, sem refactor).
  - `convert.py` usa **`ogr2ogr` (streaming)** p/ converter arquivos grandes sem OOM (reprojeta a EPSG:4326).
  - `antennas.py` parseia CSV de pontos. `tiles.py` chama `tippecanoe`. `basemap.py` extrai recorte Protomaps.
  - `census.py` (DuckDB) ingere os CSVs do Censo 2022 (`data/censo_2022/`) → tabela canônica de
    atributos `censo_setor.parquet` (sem geometria, chave `cd_setor`). Variáveis curadas em `THEMES`
    (adicionar variável = editar o dict; adicionar tema = 1 entrada nova em `THEMES`, sem tocar
    `query/`/`agent/` — `GeoQuery.metricas()` lê o schema dinamicamente). 6 temas hoje: básico,
    demografia, cor/raça, domicílio1/2, **renda_responsavel** (renda média/mediana mensal do
    responsável pelo domicílio — IBGE, publicado 08/05/2026, fora do release padrão de
    "Agregados por Setores Censitários"). `census-municipio` agrega por `cd_mun` →
    `censo_municipio.parquet` (contagens somam; `media_moradores`/`renda_media`/`renda_mediana`
    ponderadas via `WEIGHTED`; densidade/percentuais recalculados via `DERIVED`). Geometria +
    censo se juntam por `cd_setor`/`cd_mun` em query-time (Fase 2).
  - **Produção (censo):** os parquets canônicos USADOS (`censo_setor`, `censo_municipio`) são
    artefatos de produção — sobem via `deploy.sh data` (`make ship-ia`). FICAM locais: os CSVs brutos
    de `data/censo_2022/` (fonte reproduzível), o domicílio3 (baixado e não usado) e os temas do
    Censo 2022 ainda não baixados (ex.: alfabetização/instrução, migração, nupcialidade — ver
    dicionário de dados no diretório do IBGE).
  - venv fica em `/opt/venv` no container (fora do bind mount) — ver `Dockerfile`.
- **`web/`** — React/Vite/TS. `map/layers.ts` define as camadas; `map/MapView.tsx` monta o
  style (basemap + camadas + seleção + destaques) e trata clique; `map/selection.ts` faz o
  highlight do CLIQUE via fonte GeoJSON. `map/highlight.ts` pinta os destaques do AGENTE por
  código (`setFilter` com `CD_MUN`/`CD_SETOR` nas próprias fontes PMTiles — funciona fora do
  viewport, independe do toggle). `chat/ChatPanel.tsx` + `chat/api.ts` = UI e client do chat;
  em dev o Vite faz proxy `/api → host.docker.internal:8000` (agente nativo; sem CORS).
  `components/SearchBox.tsx` + `search/index.ts` = busca município/UF do header (client-side
  sobre `search/municipios.json` gerado pelo pipeline; seleção = `fitBounds` + destaque).
- **`query/`** — projeto `uv` (Fase 2). Camada de consulta DuckDB sobre os parquets canônicos —
  **backend de dados do chat**. `db.py` cria as views `setor` (censo + centroide do
  `geom_bbox`) e `municipio`; `queries.py` expõe `GeoQuery` (lookups, `busca_municipios`
  nome→código, `ranking_municipios`, `setores_proximos`, `setores_no_ponto`). Geometria exata
  vive nos PMTiles; o backend devolve `cd_setor`/`cd_mun` e o mapa pinta. Espacial é
  **aproximado** (centroide × 111 km), pois `setor.parquet` tem geometria GEOARROW (não WKB).
- **`agent/`** — projeto `uv` (Fase 2). Backend do chat: FastAPI + SDK `openai` PURO (sem
  framework de agente — decisão de aprendizado). `tools.py` = 7 tools (args Pydantic →
  JSON Schema; `TOOL_REGISTRY` despacha p/ o `GeoQuery`); `agent.py` = loop de tool-calling
  explícito (teto 6 iterações; erro de tool volta ao LLM p/ autocorreção 1x) + sessões em
  memória (TTL 1 h). **Grounding:** `destaques`/`dados` da resposta saem das rows das tools
  (determinístico), o LLM só escreve o texto. Config via `agent/.env`
  (`OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5-mini`). Benchmark de 17 casos em `benchmark.yaml`.
  **`prompts.py`** define o escopo em prosa (que temas existem, o que é fora de escopo) — ao
  adicionar um tema no censo, atualizar aqui também, senão o agente recusa dado que já existe
  no banco (aconteceu com renda: dado chegou, mas o prompt ainda mandava recusar).
- **Saídas** (não versionadas): `data/processed/*.parquet`, `web/public/tiles/*.pmtiles`.

## Convenções

- **Python: sempre `uv`** (nunca pip/venv global). Type hints obrigatórios. Ruff + pytest.
- **`data/` é gitignored** (fontes grandes/reproduzíveis) — só `data/README.md` é versionado.
- **Dados crus nunca lidos em runtime** — convertidos uma vez para GeoParquet.
- Camada pesada (setor ~473k) → tuning no `tippecanoe`; tilagem é o gargalo, não a conversão.
- Idioma: prosa/respostas em **português-BR**; código e nomes de API em inglês.

## KBs locais (`.claude/kb/`)

`maplibre` · `pmtiles-tippecanoe` · `geospatial-etl` — padrões reaproveitáveis já destilados.

## Próximo passo

Fase 2 shipada (benchmark 16/16), fase 2.1 no ar (agente + busca de município/UF) e o
tema **renda do responsável pelo domicílio** já em produção (2026-08-08, commit
`95b6358`) — primeiro dado econômico do app, puxado direto do IBGE fora do release
padrão de setores censitários. Redeploy do agente: `make ship-ia` + `ssh -t
hetzner-gramos 'sudo systemctl restart geo-agent'` (o restart pede senha — só roda
num terminal de verdade, não pelo Claude Code).

Ideia em aberto (`/brainstorm` ainda não rodado): virar "Fase 3" — mais dados de
cidade/bairro (Atlas do Desenvolvimento Humano/IDHM por município; agregação
setor→bairro, já que o IBGE não publica indicador por bairro; POIs via OSM/Geofabrik,
com ANAC para aeroportos) + operações geoespaciais reais (buffer, distância) — isso
exige gerar geometria em WKB (hoje é GEOARROW, só dá pra centroide aproximado no
`query/`). Também: streaming se a latência do chat doer; novas tools se as perguntas
extrapolarem as 7 atuais; eixo de ruas nacional (OSM) fica pendente de mais espaço na
VPS (hoje ~6 GB livres via Hetzner Volume seria a rota mais barata, não upgrade de plano).
