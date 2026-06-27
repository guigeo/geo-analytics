# geo-analytics

> Aplicação web para **visualizar dados geográficos do Brasil** em mapa interativo e,
> futuramente, **conversar com um agente de IA** sobre eles.

Mapa MapLibre 100% estático sobre tiles **PMTiles**, alimentado por um **ETL em Docker**
que padroniza fontes heterogêneas (shapefile / GeoPackage / CSV) em **GeoParquet** e
gera os tiles. Sem banco de dados, sem backend em runtime.

## Status

| Fase | Entrega | Estado |
|------|---------|--------|
| **1 — Visualização** | Mapa com 5 camadas, toggle, clique→atributos | ✅ Shipped |
| **1.5 — Refinamento visual** | Basemap z13, paleta, rótulos, highlight, legenda | ✅ Shipped |
| **2 — Chat com IA** | Perguntas em PT sobre os dados (DuckDB spatial + tool-calling) | 🔜 Planejado |
| **3 — Expansão de dados** | Novos datasets sem refactor | 🔜 Planejado |

**Camadas:** UF · Município · Bairro · Setor censitário (~473k) · Antenas (~111k).

## Arquitetura

```text
BUILD-TIME (ETL em Docker)                      RUN-TIME (estático)
shp / gpkg / csv                                ┌─────────────────────────┐
      │  ogr2ogr (streaming, reproj 4326)       │  MapLibre GL JS (React)  │
      ▼                                         │  + basemap Protomaps     │
  GeoParquet  ──► FlatGeobuf ──► tippecanoe ──► │  pmtiles:// (range req.) │
  (canônico)                     *.pmtiles      │  toggle · clique · highlight
      │                          basemap.pmtiles└─────────────────────────┘
      └─ (futuro: DuckDB spatial p/ a Fase 2)
```

- **Formato canônico:** GeoParquet (também será a base da Fase 2 / DuckDB).
- **Exibição:** PMTiles para todas as camadas, servidos como arquivos estáticos.
- **Regra única** (`pipeline/datasets.yaml`): novo dataset = nova entrada, sem refactor.

## Stack

Python 3.11 + `uv` · GDAL/`ogr2ogr` · `tippecanoe` · `pmtiles` · GeoParquet ·
MapLibre GL JS · React + Vite + TypeScript · Protomaps · Docker.

## Pré-requisitos

- **Docker** (roda o ETL e o dev server; nada além disso é instalado na máquina)
- As fontes de dados em `data/` (ver [`data/README.md`](data/README.md) — não versionadas)

## Uso

```bash
# 1) Gerar GeoParquet + PMTiles + basemap (ETL no container)
docker compose build
docker compose run --rm pipeline build

# 2) Subir o mapa
docker compose up web          # http://localhost:5173
```

Variações úteis:

```bash
docker compose run --rm pipeline build --only antenas   # um dataset
docker compose run --rm pipeline build --basemap-only   # só o basemap (não re-tila dados)
```

## Desenvolvimento

```bash
# ETL (lógica pura, sem os binários geo)
cd pipeline && uv sync --group dev && uv run pytest && uv run ruff check .

# Frontend
docker compose exec web npm run typecheck
```

## Estrutura

```text
├── pipeline/        # ETL Python/uv (config, convert, tiles, basemap, cli) + Dockerfile
├── web/             # frontend React/Vite/TS (MapLibre, camadas, painéis)
├── data/            # fontes brutas (não versionadas) + saídas do ETL
├── docs/            # PRD
├── docker-compose.yml
└── .claude/         # workflow SDD (features arquivadas) + KBs destiladas
```

## Workflow

Construído com **AgentSpec 4.2 (Spec-Driven Development)**:
`/brainstorm → /define → /design → /build → /ship`. As features entregues estão
arquivadas em [`.claude/sdd/archive/`](.claude/sdd/archive/) com lições aprendidas.

---

🤖 Desenvolvido com [Claude Code](https://claude.com/claude-code).
