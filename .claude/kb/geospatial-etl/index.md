# Geospatial ETL Knowledge Base

> **Purpose**: Padronizar e converter dados geográficos heterogêneos (shapefile/GeoPackage/CSV) em GeoParquet, em escala, sem estourar memória.
> **MCP Validated**: 2026-06-27

## Quick Navigation

### Patterns (< 200 lines each)

| File | Purpose |
|------|---------|
| [patterns/conversao-streaming-ogr2ogr.md](patterns/conversao-streaming-ogr2ogr.md) | Converter arquivos vetoriais de vários GB sem OOM |
| [patterns/inspecionar-schema-antes.md](patterns/inspecionar-schema-antes.md) | Descobrir campos/CRS/contagem antes de escrever config |
| [patterns/csv-para-pontos.md](patterns/csv-para-pontos.md) | CSV de lon/lat → pontos GeoParquet (com gotcha de dtype) |

---

## Quick Reference

- [quick-reference.md](quick-reference.md)

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Streaming > in-memory** | `ogr2ogr` streama; GeoPandas carrega tudo na RAM (estoura em GB) |
| **Formato canônico** | Padronizar entradas heterogêneas em um GeoParquet (reprojetado a 4326) |
| **Inspeção antes de config** | Ler schema real (campos/CRS) evita suposições erradas |

---

## Agent Usage

| Agent | Primary Files | Use Case |
|-------|---------------|----------|
| ai-data-engineer | patterns/* | ETL geoespacial reprodutível |
