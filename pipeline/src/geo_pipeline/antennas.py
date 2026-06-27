"""Parse do CSV de antenas (`;`, sem cabecalho) para pontos GeoParquet (EPSG:4326)."""

from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd
import pandas as pd

from .config import DatasetConfig, OutputConfig

log = logging.getLogger(__name__)

# Ordem das colunas observada na amostra real de antenas.csv.
COLUMNS = [
    "id", "operadora", "uf", "municipio", "bairro", "endereco",
    "lat", "lon", "cod_ibge", "tipo", "tecnologia", "frequencia",
]


def read_antennas(src: Path, lon_field: str = "lon", lat_field: str = "lat") -> gpd.GeoDataFrame:
    df = pd.read_csv(
        src,
        sep=";",
        header=None,
        names=COLUMNS,
        dtype=str,
        skipinitialspace=True,
    )
    df[lat_field] = pd.to_numeric(df[lat_field], errors="coerce")
    df[lon_field] = pd.to_numeric(df[lon_field], errors="coerce")

    before = len(df)
    df = df.dropna(subset=[lat_field, lon_field])
    dropped = before - len(df)
    if dropped:
        log.warning("antenas: %d linhas descartadas por lat/lon invalido", dropped)

    for col in df.select_dtypes(include=["object", "string"]).columns:
        df[col] = df[col].str.strip()

    geometry = gpd.points_from_xy(df[lon_field], df[lat_field])
    return gpd.GeoDataFrame(df, geometry=geometry, crs="EPSG:4326")


def convert_antennas(ds: DatasetConfig, output: OutputConfig) -> Path:
    src = ds.source_path()
    dst = ds.processed_path(output)
    if not src.exists():
        raise FileNotFoundError(f"fonte ausente: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)

    gdf = read_antennas(src, ds.lon_field or "lon", ds.lat_field or "lat")
    keep = [c for c in ds.attributes if c in gdf.columns]
    gdf = gdf[[*keep, "geometry"]]

    log.info("convert %s: %d pontos -> %s", ds.name, len(gdf), dst.name)
    gdf.to_parquet(dst, index=False)
    return dst
