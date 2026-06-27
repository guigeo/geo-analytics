# MapLibre GL JS Quick Reference

> Consulta rápida. Para código, ver os arquivos linkados.

## Tipos de layer por geometria

| Geometria | `type` | Picável por clique |
|-----------|--------|--------------------|
| Polígono (área) | `fill` | sim (mesmo com `fill-opacity: 0`) |
| Polígono (borda) | `line` | difícil (largura fina) |
| Ponto | `circle` | sim |
| Rótulo | `symbol` (`text-field`) | não interativo |

## Interação

| Tarefa | API |
|--------|-----|
| Feição sob o cursor | `map.queryRenderedFeatures(point, { layers })` |
| Geometria da feição | `feature.geometry` (GeoJSON) |
| Trocar dados de uma fonte | `(map.getSource(id)).setData(geojson)` |
| Ligar/desligar layer | `map.setLayoutProperty(id, "visibility", "visible"\|"none")` |

## Decision Matrix

| Caso | Escolha |
|------|---------|
| Realçar feição clicada sem mexer nos tiles | Fonte GeoJSON de seleção |
| Realce perfeito, sem corte de borda | `feature-state` + `promoteId` (exige id único + re-tilar) |
| Camada de referência clicável mas sem "lavar" o mapa | `fill` com `fill-opacity: 0` + `line` de contorno |

## Common Pitfalls

| Don't | Do |
|-------|-----|
| Assumir que `fill-opacity: 0` não é clicável | É clicável — `queryRenderedFeatures` ignora opacidade, não visibilidade |
| Esquecer glyphs ao usar `symbol` | Definir `glyphs` no style (URL de fontstack) |
| Recriar o style a cada toggle | Só `setLayoutProperty(visibility)` |

## Related Documentation

| Topic | Path |
|-------|------|
| Servir PMTiles | `concepts/protocolo-pmtiles.md` |
| Full Index | `index.md` |
