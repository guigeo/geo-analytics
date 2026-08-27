# CLAUDE.md

Guia prático do código para o Claude Code. Para contexto de produto e workflow SDD,
ver [`.claude/CLAUDE.md`](.claude/CLAUDE.md) e [`.claude/sdd/archive/`](.claude/sdd/archive/).

## O que é

Mapa web estático (MapLibre) + ETL geoespacial em Docker + **chat com agente de IA**
(Fase 2, local). Pipeline: `shp/gpkg/csv → GeoParquet (canônico) → PMTiles → MapLibre`.
O chat: `web (React) → agent/ (FastAPI + OpenAI function calling) → query/ (PostGIS)` —
o agente responde em texto e o mapa pinta os códigos retornados pelas tools.
**No ar:** https://geo-intelligence.averisen.com (VPS Hetzner + Caddy; ver `deploy/`) —
mapa + satélite + busca (município/UF/endereço) + chat (fase 2.1): o agente roda na VPS
como serviço systemd `geo-agent` (uv/python 3.12 em `~/projects/geo`, só 127.0.0.1:8000;
Caddy expõe `/api`). Parquets do agente na VPS em `~/projects/geo/data/processed` — o
`setor.parquet` de lá é ENXUTO (só CD_SETOR + geom_bbox, 6,5 MB vs 1 GB; gerado no
`deploy.sh data`). Rate limit por IP no backend protege a chave OpenAI (30 perguntas/10 min
no chat) e o proxy de geocoding (20/60s no `/api/geocode`).

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

**Os tiles não moram mais neste repositório.** Vivem num host compartilhado, servido
para todas as aplicações derivadas do `webgis` — uma cópia só, em vez de uma por app
(passo 1 do ADR-0001 de lá). O caminho vem de `TILES_DIR` no `.env` da raiz
(`cp .env.example .env`); em dev, `web/.env.local` aponta o front para o host com
`VITE_TILES_BASE_URL`. Ver `../webgis/docs/LOCAL.md`.

## Comandos (detalhe)

```bash
# ETL (no container — gdal/tippecanoe/pmtiles vivem na imagem, NÃO no host)
# Exige TILES_DIR no .env (host de tiles compartilhado; ver .env.example).
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
  - **A curadoria do Censo não mora mais aqui.** O `census.py` (DuckDB sobre CSV) foi
    removido no passo 4 do roteiro, em 2026-08-20: as camadas passaram a sair do `geodata`
    por consulta declarada no `datasets.yaml`, e `data/` deixou de guardar fonte bruta. A
    escolha de variáveis vive num lugar só — `servidor-dados-gis/cargas/censo_nomes.tsv`,
    41 variáveis, conferidas contra o banco em 2026-08-22 (41 distintas no formato longo).
    Acrescentar variável é uma linha lá, não um dict aqui. Era a pendência 3 do
    `webgis/docs/HERANCA.md`, e ela fecha por não existir mais o segundo dono.
  - venv fica em `/opt/venv` no container (fora do bind mount) — ver `Dockerfile`.
- **`web/`** — React/Vite/TS. `map/layers.ts` define as camadas; `map/basemap.ts` monta o
  basemap vetorial (Protomaps) e o satélite (raster XYZ Esri World Imagery, sem API key) —
  toggle no header; `basemapOverlayLayers()` filtra só `line`/`symbol` do basemap (vias,
  limites, rótulos, POIs) pra manter por cima do raster em modo híbrido (segundo toggle,
  opcional, só aparece com satélite ligado). `map/MapView.tsx` monta o style (basemap/satélite
  + camadas + seleção + destaques) e trata clique; `map/selection.ts` faz o highlight do
  CLIQUE via fonte GeoJSON. `map/highlight.ts` pinta os destaques do AGENTE por código
  (`setFilter` com `CD_MUN`/`CD_SETOR` nas próprias fontes PMTiles — funciona fora do
  viewport, independe do toggle). `chat/ChatPanel.tsx` + `chat/api.ts` = UI e client do chat;
  em dev o Vite faz proxy `/api → host.docker.internal:8000` (agente nativo; sem CORS).
  `components/SearchBox.tsx` combina a busca local de município/UF (`search/index.ts`,
  client-side sobre `search/municipios.json` gerado pelo pipeline) com busca de ENDEREÇO
  (`search/geocode.ts`, debounce 400ms a partir de 4 chars) via `/api/geocode` — proxy do
  agente pro Nominatim/OSM (que não manda CORS, por isso não dá pra chamar direto do
  navegador); endereço aproxima no zoom de rua (17) e não ganha destaque (sem código IBGE).
  `map/tileHost.ts` decide DE ONDE vêm os `.pmtiles`: sem `VITE_TILES_BASE_URL`, de
  `/tiles` na própria origem (o que a VPS serve hoje pelo Caddy); com ela, do HOST DE
  TILES COMPARTILHADO — em dev é o único caminho, porque **este repositório não guarda
  mais tile nenhum**. Ver `../webgis/docs/LOCAL.md`.
- **`query/`** — projeto `uv` (Fase 2). Camada de consulta PostGIS sobre o geodata central —
  **backend de dados do chat**. `db.py` abre a conexão (`GEODATA_DSN`, papel `geo_reader`,
  `autocommit`); `queries.py` expõe `GeoQuery` (lookups, `busca_municipios` nome→código,
  `ranking_municipios`, `setor_no_ponto`, `setores_proximos`, `setores_no_ponto`). Geometria
  exata vive nos PMTiles **e no banco**; o backend devolve `cd_setor`/`cd_mun` e o mapa pinta.
  Espacial é **exato**: `ST_DWithin`/`ST_Distance` sobre o polígono real, em metros. Métrica
  tem dois caminhos — resumo materializado quando a coluna existe lá, formato longo quando não
  (medido; ver `webgis/docs/HERANCA.md` §7.4).
- **`agent/`** — projeto `uv` (Fase 2). Backend do chat: FastAPI + SDK `openai` PURO (sem
  framework de agente — decisão de aprendizado). `tools.py` = 15 tools (args Pydantic →
  JSON Schema; `TOOL_REGISTRY` despacha p/ o `GeoQuery`); `agent.py` = loop de tool-calling
  explícito (teto 6 iterações; erro de tool volta ao LLM p/ autocorreção 1x) + sessões em
  memória (TTL 1 h). **Grounding:** `destaques`/`dados` da resposta saem das rows das tools
  (determinístico), o LLM só escreve o texto. Config via `agent/.env`
  (`OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5-mini`). Benchmark de 30 casos em `benchmark.yaml`.
  **`prompts.py`** define o escopo em prosa (que temas existem, o que é fora de escopo) — ao
  adicionar um tema no censo, atualizar aqui também, senão o agente recusa dado que já existe
  no banco (aconteceu com renda: dado chegou, mas o prompt ainda mandava recusar).
  **As classes são A / B / C / DE — quatro, não cinco.** Os cortes foram calibrados para a
  distribuição nacional reproduzir a do Critério Brasil 2024 (A 3,1%, B 21,5%, C 47,0%,
  DE 28,4%), e a ABEP não separa D de E. Diga "na mesma régua do Critério Brasil", nunca
  "segundo a ABEP": o método é outro — eles classificam por posse e instrução, aqui é
  renda domiciliar estimada.
  **Classe social é a única métrica aqui que o IBGE NÃO publica** (estimativa do
  `servidor-dados-gis`, schema `indicadores`, desde 2026-08-27). Três coisas garantem que
  ela não passe por dado oficial, e são três porque uma só cai: o rótulo diz "(estimada)",
  a regra 8 do system prompt manda declarar, e `_avisos_classe_social()` devolve o aviso
  **junto da linha** — que é a regra 8 do ADR-0001 (o que muda o sentido do número é dado,
  não instrução de prompt). O aviso da tool só existe hoje na cascata `info_local`, porque
  é lá que o canal de `avisos` existe; nas outras `info_*` a marca viaja só pelo rótulo.
  `tools.py` também guarda `METRIC_LABELS` (coluna → rótulo PT-BR das colunas curadas do
  Censo) — embutido no fim do system prompt pra o LLM NUNCA devolver nome cru de coluna
  na resposta (ex.: "pop_total" vira "população total"); `listar_metricas` devolve
  `{campo, rotulo}`. Além do loop de chat, `main.py` expõe `GET /api/geocode` — proxy pro
  Nominatim/OSM pra busca de endereço do front (rate limit próprio por IP, separado do chat).
- **Saídas** (não versionadas): `data/processed/*.parquet` e os `*.pmtiles`, que o
  pipeline escreve direto no host de tiles compartilhado (`TILES_DIR` no `.env` →
  `GEO_TILES_DIR=/tiles` no container). Sem `TILES_DIR`, `docker compose` e
  `deploy.sh tiles` param com mensagem em vez de recriar a cópia por app.

## Convenções

- **Python: sempre `uv`** (nunca pip/venv global). Type hints obrigatórios. Ruff + pytest.
- **`data/` é gitignored** (fontes grandes/reproduzíveis) — só `data/README.md` é versionado.
- **Dados crus nunca lidos em runtime** — convertidos uma vez para GeoParquet.
- Camada pesada (setor ~473k) → tuning no `tippecanoe`; tilagem é o gargalo, não a conversão.
- Idioma: prosa/respostas em **português-BR**; código e nomes de API em inglês.

## KBs locais (`.claude/kb/`)

`maplibre` · `pmtiles-tippecanoe` · `geospatial-etl` — padrões reaproveitáveis já destilados.

## Próximo passo

Fase 2 shipada (benchmark 16/16), fase 2.1 no ar (agente + busca de município/UF/endereço)
e o tema **renda do responsável pelo domicílio** em produção (2026-08-08, commit
`95b6358`) — primeiro dado econômico do app, puxado direto do IBGE fora do release
padrão de setores censitários. Redeploy do agente: `make ship-ia` + `ssh -t
hetzner-gramos 'sudo systemctl restart geo-agent'` (o restart pede senha — só roda
num terminal de verdade, não pelo Claude Code). **Atenção ao redeploy do agente:** o
`.env` (chave OpenAI) às vezes é editado direto na VPS e fica mais novo que o local —
antes de rodar `deploy.sh agent`/`ship-ia`, comparar mtimes pra não sobrescrever a
chave certa com uma desatualizada. A instalação do agente na VPS é **editable** (aponta
pro código-fonte, não copia pra `site-packages`) — `uv sync` sem mudança de dependências
não precisa de `--reinstall-package`, mas o processo do systemd só pega o código novo
depois do `restart`.

Shipado em 2026-08-09: agente/dados movidos na VPS pra `~/projects/geo` (organização,
junto dos outros projetos ali); **toggle de satélite** no mapa (raster Esri, modo
híbrido com vias/limites/rótulos por cima — opcional, dá pra ver só a imagem); **busca
de endereço/rua** no header via `/api/geocode` (proxy do agente pro Nominatim, que não
manda CORS); **glossário de métricas** no agente (`METRIC_LABELS`) — o LLM parou de
vazar nome cru de coluna (`pop_total`) na resposta.

Ideia em aberto (`/brainstorm` ainda não rodado): virar "Fase 3" — mais dados de
cidade/bairro (Atlas do Desenvolvimento Humano/IDHM por município; agregação
setor→bairro, já que o IBGE não publica indicador por bairro; POIs via OSM/Geofabrik,
com ANAC para aeroportos) + operações geoespaciais reais (buffer, distância) — isso
exige gerar geometria em WKB (hoje é GEOARROW, só dá pra centroide aproximado no
`query/`). Também: streaming se a latência do chat doer; novas tools se as perguntas
extrapolarem as 7 atuais; eixo de ruas nacional (OSM) fica pendente de mais espaço na
VPS (hoje ~6 GB livres via Hetzner Volume seria a rota mais barata, não upgrade de plano).
