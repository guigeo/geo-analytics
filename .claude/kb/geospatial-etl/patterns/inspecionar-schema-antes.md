<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Inspecionar schema antes de escrever config

> **Propósito**: Descobrir campos, CRS, tipo de geometria e contagem de feições sem carregar a geometria — para não escrever config baseada em suposição.
> **Validado**: 2026-06-27

## Quando usar

- Antes de listar `attributes`/colunas num pipeline declarativo.
- Quando os dados vêm de terceiros e o schema real não é conhecido.
- Para confirmar o CRS de origem (define a reprojeção).

## Implementação

`pyogrio.read_info` lê só os metadados (rápido mesmo em arquivos de GB, pois não carrega
geometria). Funciona para shapefile, GeoPackage etc.

```python
import pyogrio

for path in sources:
    print("layers:", pyogrio.list_layers(path))   # nomes de layer (gpkg multi-layer)
    info = pyogrio.read_info(path)
    print("crs:", info["crs"])                      # ex.: EPSG:4674 -> reprojetar p/ 4326
    print("geometry:", info["geometry_type"])       # Polygon / Point / ...
    print("features:", info["features"])            # contagem (decide se precisa tiles)
    print("fields:", list(info["fields"]))          # nomes reais das colunas
```

## Configuração

| Saída | Usa para |
|-------|----------|
| `fields` | preencher `attributes`/`-select` com nomes reais |
| `crs` | decidir a reprojeção (`-t_srs EPSG:4326`) |
| `features` | decidir se a camada é "pesada" (precisa tiles/tuning) |
| `layers` | escolher a layer correta num GeoPackage |

## Por que isso importa

Escrever a config a partir de suposições de nome de coluna gera retrabalho e bugs
silenciosos (atributo que não aparece, clique sem dado). Inspecionar primeiro elimina
esse risco com segundos de custo — os metadados não dependem do tamanho do arquivo.

## Ver também

- [conversao-streaming-ogr2ogr](conversao-streaming-ogr2ogr.md)
