# PMTiles + tippecanoe Knowledge Base

> **Purpose**: Gerar e servir vector tiles estáticos (PMTiles) a partir de dados geográficos, com tippecanoe; trade-offs de zoom/tamanho.
> **MCP Validated**: 2026-06-27

## Quick Navigation

### Concepts (< 150 lines each)

| File | Purpose |
|------|---------|
| [concepts/vector-tiles-por-zoom-e-range-requests.md](concepts/vector-tiles-por-zoom-e-range-requests.md) | Tiles por-zoom; `maxzoom` × tamanho; range requests |

### Patterns (< 200 lines each)

| File | Purpose |
|------|---------|
| [patterns/geoparquet-para-pmtiles.md](patterns/geoparquet-para-pmtiles.md) | Gerar `.pmtiles` a partir de GeoParquet via tippecanoe |
| [patterns/extrair-recorte-basemap.md](patterns/extrair-recorte-basemap.md) | Extrair um recorte (bbox) de um PMTiles remoto |

---

## Quick Reference

- [quick-reference.md](quick-reference.md)

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Tiles por-zoom** | Subir `maxzoom` adiciona detalhe só no zoom próximo; o zoom-out continua simples |
| **Range requests** | Um `.pmtiles` grande não vira download grande por usuário — custo é disco/geração |
| **Gargalo** | A tilagem (tippecanoe) domina o tempo; a conversão de formato é barata |

---

## Agent Usage

| Agent | Primary Files | Use Case |
|-------|---------------|----------|
| ai-data-engineer | patterns/* | Pipeline de geração de tiles estáticos |
