"""Conversao de CSV de pontos COM cabecalho para GeoParquet (EPSG:4326).

Generaliza o caso de antenas (que e sem cabecalho, em `antennas.py`) para fontes tipo
CNES/INEP: colunas nomeadas, `lon_field`/`lat_field` e `attributes` escolhidos por nome
no datasets.yaml. Trata separador, decimal com virgula e encoding via config.
"""

from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd
import pandas as pd

from .config import DatasetConfig, OutputConfig

log = logging.getLogger(__name__)


def convert_points(ds: DatasetConfig, output: OutputConfig) -> Path:
    src = ds.source_path()
    dst = ds.processed_path(output)
    if not src.exists():
        raise FileNotFoundError(f"fonte ausente: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)

    lon, lat = ds.lon_field or "lon", ds.lat_field or "lat"
    df = pd.read_csv(src, sep=ds.csv_sep, dtype=str, encoding=ds.encoding, skipinitialspace=True)

    missing = [c for c in (lon, lat) if c not in df.columns]
    if missing:
        raise KeyError(f"{ds.name}: colunas lon/lat ausentes no CSV: {missing}; tem {list(df.columns)}")

    for col in (lon, lat):
        s = df[col].str.strip()
        if ds.decimal != ".":
            s = s.str.replace(ds.decimal, ".", regex=False)
        df[col] = pd.to_numeric(s, errors="coerce")

    before = len(df)
    df = df.dropna(subset=[lon, lat])
    dropped = before - len(df)
    if dropped:
        log.warning("%s: %d linhas descartadas por lon/lat invalido", ds.name, dropped)

    for col in df.select_dtypes(include=["object", "string"]).columns:
        df[col] = df[col].str.strip()

    keep = [c for c in ds.attributes if c in df.columns]
    geometry = gpd.points_from_xy(df[lon], df[lat])
    gdf = gpd.GeoDataFrame(df[keep], geometry=geometry, crs="EPSG:4326")

    log.info("convert %s: %d pontos -> %s", ds.name, len(gdf), dst.name)
    gdf.to_parquet(dst, index=False)
    return dst
