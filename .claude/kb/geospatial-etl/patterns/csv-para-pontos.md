<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# CSV de lon/lat para pontos GeoParquet

> **Propósito**: Converter um CSV com colunas de longitude/latitude em pontos GeoParquet, tratando linhas inválidas e um gotcha de dtype do pandas.
> **Validado**: 2026-06-27

## Quando usar

- A fonte é um CSV (eventualmente sem cabeçalho) com coordenadas em colunas.
- Você quer pontos num formato canônico (GeoParquet, EPSG:4326).

## Implementação

```python
import pandas as pd
import geopandas as gpd

def csv_to_points(src, dst, columns, lon="lon", lat="lat", keep=None):
    df = pd.read_csv(src, sep=";", header=None, names=columns,
                     dtype=str, skipinitialspace=True)
    df[lat] = pd.to_numeric(df[lat], errors="coerce")
    df[lon] = pd.to_numeric(df[lon], errors="coerce")
    df = df.dropna(subset=[lat, lon])               # descarta coords inválidas

    # GOTCHA pandas 2.x: read_csv(dtype=str) pode gerar dtype "string" (não "object").
    # Checar "== object" falha silenciosamente; use select_dtypes nos dois.
    for col in df.select_dtypes(include=["object", "string"]).columns:
        df[col] = df[col].str.strip()

    cols = keep or columns
    gdf = gpd.GeoDataFrame(df[cols], geometry=gpd.points_from_xy(df[lon], df[lat]),
                           crs="EPSG:4326")
    gdf.to_parquet(dst, index=False)
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| `dtype=str` na leitura | sim | Preserva zeros à esquerda, evita cast indevido |
| Coords inválidas | `to_numeric(errors="coerce")` + `dropna` | Descarta e conte as linhas perdidas |
| Limpeza de espaços | `select_dtypes(["object","string"])` | Cobre o dtype novo do pandas 2.x |

## Erros comuns

### Errado

```python
for col in columns:
    if df[col].dtype == object:      # FALHA: pandas 2.x usa dtype "string"
        df[col] = df[col].str.strip()
```

### Certo

```python
for col in df.select_dtypes(include=["object", "string"]).columns:
    df[col] = df[col].str.strip()
```

## Ver também

- [conversao-streaming-ogr2ogr](conversao-streaming-ogr2ogr.md)
