<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Conversão streaming com ogr2ogr (arquivos grandes)

> **Propósito**: Converter e reprojetar arquivos vetoriais de vários GB para GeoParquet sem carregar tudo em memória.
> **Validado**: 2026-06-27

## Quando usar

- A fonte tem centenas de MB ou GB (ex.: malhas com centenas de milhares de feições).
- Você quer um formato canônico (GeoParquet) reprojetado a um CRS único (EPSG:4326).
- A máquina não tem RAM para um `GeoDataFrame` do arquivo inteiro.

## Implementação

`ogr2ogr` (GDAL) processa feição-a-feição (streaming) e faz conversão + reprojeção +
seleção de colunas numa única passada. Chame-o por `subprocess` com lista de args fixa
(sem `shell=True`).

```python
import subprocess
from pathlib import Path

def to_geoparquet(src: Path, dst: Path, attributes: list[str],
                  layer: str | None = None) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ogr2ogr", "-f", "Parquet",
           "-t_srs", "EPSG:4326",          # reprojeta numa passada
           "-lco", "GEOMETRY_ENCODING=GEOARROW",
           "-overwrite"]
    if attributes:
        cmd += ["-select", ",".join(attributes)]  # projeta só o necessário
    cmd += [str(dst), str(src)]
    if layer:                                # GeoPackage multi-layer
        cmd += [layer]
    subprocess.run(cmd, check=True)
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| Engine | `ogr2ogr` (GDAL) | Streaming; não estoura RAM |
| CRS alvo | `EPSG:4326` | Padrão para web/tiles |
| Colunas | `-select` explícito | Tiles/arquivos menores |
| Imagem Docker | GDAL `ubuntu-full` | `ubuntu-small` não tem driver Parquet |

## Por que não GeoPandas aqui

`geopandas.read_file()` materializa o arquivo inteiro como `GeoDataFrame` na RAM — um
arquivo de ~1.4 GB pode consumir vários GB e travar a máquina. A conversão de formato em
si é barata quando feita em streaming; o gargalo do pipeline costuma estar adiante (na
geração de tiles), não aqui.

## Exemplo de uso

```python
to_geoparquet(Path("in/dense.gpkg"), Path("out/dense.parquet"),
              attributes=["id", "name"], layer="dense_layer")
```

## Ver também

- [inspecionar-schema-antes](inspecionar-schema-antes.md)
- pmtiles-tippecanoe/patterns/geoparquet-para-pmtiles.md
