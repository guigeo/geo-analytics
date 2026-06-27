# MapLibre GL JS Knowledge Base

> **Purpose**: Padrões de UI de mapas vetoriais com MapLibre GL JS — carregar tiles, estilizar camadas, interação (clique/realce) e toggle.
> **MCP Validated**: 2026-06-27

## Quick Navigation

### Concepts (< 150 lines each)

| File | Purpose |
|------|---------|
| [concepts/protocolo-pmtiles.md](concepts/protocolo-pmtiles.md) | Servir tiles PMTiles estáticos via `addProtocol` |

### Patterns (< 200 lines each)

| File | Purpose |
|------|---------|
| [patterns/highlight-via-fonte-selecao.md](patterns/highlight-via-fonte-selecao.md) | Realçar a feição clicada sem `feature-state`/`promoteId` |
| [patterns/sublayers-companheiras-toggle.md](patterns/sublayers-companheiras-toggle.md) | Contorno/rótulo como sub-layers + toggle por prefixo de id |

---

## Quick Reference

- [quick-reference.md](quick-reference.md) — tabelas de consulta rápida

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Protocolo PMTiles** | Source vetorial lê um `.pmtiles` estático via `pmtiles://`, sem tile server |
| **Realce por seleção** | `queryRenderedFeatures` devolve a geometria → fonte GeoJSON de realce |
| **Sub-layers companheiras** | 1 layer pickable + `__outline`/`__label`; toggle por prefixo de id |

---

## Agent Usage

| Agent | Primary Files | Use Case |
|-------|---------------|----------|
| frontend-developer | patterns/*, concepts/* | Construir/estilizar mapas vetoriais interativos |
