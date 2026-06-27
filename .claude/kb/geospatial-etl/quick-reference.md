# Geospatial ETL Quick Reference

> Consulta rápida. Para código, ver os arquivos linkados.

## Ferramenta por tarefa

| Tarefa | Ferramenta |
|--------|-----------|
| Converter/reprojetar arquivo grande | `ogr2ogr` (GDAL), streaming |
| Inspecionar schema/CRS sem carregar | `pyogrio.read_info` / `list_layers` |
| CSV de lon/lat → pontos | pandas + `geopandas.points_from_xy` |
| Formato canônico analítico | GeoParquet |

## Conversão com ogr2ogr

| Flag | Efeito |
|------|--------|
| `-f Parquet` | Saída GeoParquet |
| `-t_srs EPSG:4326` | Reprojeta numa passada |
| `-select a,b,c` | Projeta só as colunas necessárias |
| `<layer>` (posicional) | Escolhe a layer de um GeoPackage multi-layer |

## Decision Matrix

| Caso | Escolha |
|------|---------|
| Arquivo de centenas de MB / GB | `ogr2ogr` streaming (não GeoPandas in-memory) |
| Precisa só de metadados (campos/CRS) | `pyogrio.read_info` (não lê geometria) |
| Entrada heterogênea (shp/gpkg/csv) | Padronizar em GeoParquet 4326 |

## Common Pitfalls

| Don't | Do |
|-------|-----|
| `geopandas.read_file` num arquivo de GB | `ogr2ogr` streama sem estourar RAM |
| Assumir nomes de coluna | Inspecionar com `pyogrio.read_info` primeiro |
| Imagem GDAL `ubuntu-small` p/ Parquet | Falta driver Arrow/Parquet → use `ubuntu-full` |
| `pandas read_csv(dtype=str)` e checar `== object` | dtype pode ser `string`; use `select_dtypes(["object","string"])` |

## Related Documentation

| Topic | Path |
|-------|------|
| Streaming | `patterns/conversao-streaming-ogr2ogr.md` |
| Full Index | `index.md` |
