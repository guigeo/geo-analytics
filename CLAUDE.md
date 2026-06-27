# CLAUDE.md

Guia prático do código para o Claude Code. Para contexto de produto e workflow SDD,
ver [`.claude/CLAUDE.md`](.claude/CLAUDE.md) e [`.claude/sdd/archive/`](.claude/sdd/archive/).

## O que é

Mapa web estático (MapLibre) + ETL geoespacial em Docker. Pipeline:
`shp/gpkg/csv → GeoParquet (canônico) → PMTiles → MapLibre`. Sem backend em runtime.

## Comandos

```bash
# ETL (no container — gdal/tippecanoe/pmtiles vivem na imagem, NÃO no host)
docker compose build
docker compose run --rm pipeline build                 # tudo: GeoParquet + tiles + basemap
docker compose run --rm pipeline build --only <nome>   # um dataset
docker compose run --rm pipeline build --basemap-only  # só basemap (não re-tila dados)

# Frontend (NÃO há node no host — usar o container)
docker compose up web                                  # http://localhost:5173
docker compose exec web npm run typecheck

# Testes/lint do ETL (lógica pura roda nativa com uv)
cd pipeline && uv sync --group dev && uv run pytest && uv run ruff check .
```

## Arquitetura

- **`pipeline/`** — projeto `uv`. Orquestrado por `cli.py`, dirigido por `datasets.yaml`
  (registry declarativo: 1 entrada por camada → adicionar dataset = editar YAML, sem refactor).
  - `convert.py` usa **`ogr2ogr` (streaming)** p/ converter arquivos grandes sem OOM (reprojeta a EPSG:4326).
  - `antennas.py` parseia CSV de pontos. `tiles.py` chama `tippecanoe`. `basemap.py` extrai recorte Protomaps.
  - venv fica em `/opt/venv` no container (fora do bind mount) — ver `Dockerfile`.
- **`web/`** — React/Vite/TS. `map/layers.ts` define as camadas; `map/MapView.tsx` monta o
  style (basemap + camadas + seleção) e trata clique; `map/selection.ts` faz o highlight via
  fonte GeoJSON (sem `feature-state`). Toggle/clique operam por id base.
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

Fase 2 (chat IA): DuckDB spatial + tool-calling sobre o GeoParquet canônico. Começar por `/brainstorm`.
