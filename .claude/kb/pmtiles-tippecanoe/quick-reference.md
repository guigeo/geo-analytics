# PMTiles + tippecanoe Quick Reference

> Consulta rápida. Para código, ver os arquivos linkados.

## Flags úteis do tippecanoe

| Flag | Efeito |
|------|--------|
| `-o out.pmtiles` | Saída no formato PMTiles |
| `-l <nome>` | Nome da source-layer dentro do tile |
| `--minimum-zoom` / `--maximum-zoom` | Faixa de zoom dos tiles |
| `--drop-densest-as-needed` | Descarta feições em tiles densos (camadas pesadas) |
| `--simplification=N` | Simplifica geometrias (menos detalhe, menor) |
| `--no-tile-size-limit` | Não corta tiles grandes (evita sumiço de feições) |

## Trade-off de zoom (detalhe × tamanho)

| `maxzoom` | Detalhe | Tamanho relativo |
|-----------|---------|------------------|
| baixo (~8) | só formas grandes | muito pequeno |
| médio (~11-12) | ruas principais | moderado |
| alto (~13-14) | ruas/POIs | grande (pode ser GB) |

## Decision Matrix

| Caso | Escolha |
|------|---------|
| Detalhe só ao aproximar | Subir `maxzoom`; zoom-out não muda (tiles são por-zoom) |
| Camada com centenas de milhares de feições | `--drop-densest-as-needed` + `--simplification` |
| Servir sem infra | `.pmtiles` estático + range requests (nginx/CDN) |

## Common Pitfalls

| Don't | Do |
|-------|-----|
| Temer arquivo `.pmtiles` grande pela banda | Range requests baixam só o viewport; custo é disco |
| Reutilizar URL de build datado de basemap | Builds expiram (~90 dias) — torne a URL configurável |
| Alimentar tippecanoe direto de Parquet | tippecanoe lê GeoJSON-Seq/FlatGeobuf; exporte um feed |

## Related Documentation

| Topic | Path |
|-------|------|
| Conceito de zoom/range | `concepts/vector-tiles-por-zoom-e-range-requests.md` |
| Full Index | `index.md` |
