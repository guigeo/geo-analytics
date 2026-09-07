"""Exporta células H3 do geodata para GeoParquet.

O H3 publicado guarda o índice, não a fronteira. A geometria é recalculada aqui,
na fronteira de cache que produz o tile, a partir do mesmo índice que o agente usa.
São 68 mil linhas: uma carga em memória é deliberada e não muda a regra de streaming
aplicada às malhas nacionais de centenas de milhares de feições.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import geopandas as gpd
import h3
import psycopg
from shapely.geometry import Polygon

from .config import DatasetConfig, H3GeodataSource, OutputConfig, geodata_dsn

log = logging.getLogger(__name__)


def _poligono(indice: str) -> Polygon:
    """Converte a borda H3 (lat/lon) para a ordem lon/lat do GeoJSON."""
    borda = h3.cell_to_boundary(indice)
    return Polygon([(lon, lat) for lat, lon in borda])


def convert_h3_dataset(ds: DatasetConfig, output: OutputConfig) -> Path:
    """Lê atributos do PostGIS e recompõe a borda pura de cada índice H3."""
    if not isinstance(ds.source, H3GeodataSource):
        raise TypeError(f"dataset {ds.name!r} não é uma fonte H3")

    destino = ds.processed_path(output)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.unlink(missing_ok=True)

    with (
        psycopg.connect(geodata_dsn(), row_factory=psycopg.rows.dict_row) as conexao,
        conexao.cursor() as cursor,
    ):
        cursor.execute(ds.source.sql)
        linhas: list[dict[str, Any]] = list(cursor)

    if not linhas:
        raise ValueError(f"dataset H3 {ds.name!r} não devolveu célula alguma")

    indice = ds.source.campo_indice
    indices = [str(linha[indice]) for linha in linhas]
    if len(indices) != len(set(indices)):
        raise ValueError(f"dataset H3 {ds.name!r} devolveu índices repetidos")
    if any(not h3.is_valid_cell(valor) or h3.get_resolution(valor) != 9 for valor in indices):
        raise ValueError(f"dataset H3 {ds.name!r} devolveu índice inválido ou fora da resolução 9")

    geometrias = [_poligono(valor) for valor in indices]
    quadro = gpd.GeoDataFrame(linhas, geometry=geometrias, crs="EPSG:4326")
    quadro.to_parquet(destino, index=False)
    log.info("convert H3 %s: %d células -> %s", ds.name, len(quadro), destino.name)
    return destino
