"""Conversao streaming de fontes vetoriais para GeoParquet (EPSG:4326).

Usa ogr2ogr (GDAL) via subprocess para nao carregar arquivos grandes em memoria
(o setor censitario tem ~1.4 GB / ~473k feicoes).
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from .config import DatasetConfig, OutputConfig

log = logging.getLogger(__name__)

TARGET_CRS = "EPSG:4326"


def convert_dataset(ds: DatasetConfig, output: OutputConfig) -> Path:
    src = ds.source_path()
    dst = ds.processed_path(output)
    if not src.exists():
        raise FileNotFoundError(f"fonte ausente: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)

    # Parquet e single-layer: um dst residual (ou com nome de camada diferente) quebra o
    # -overwrite do ogr2ogr ("cannot create layer"). Removemos antes p/ garantir dst limpo.
    dst.unlink(missing_ok=True)

    cmd = [
        "ogr2ogr",
        "-f", "Parquet",
        "-t_srs", TARGET_CRS,
        "-dim", "XY",  # achata p/ 2D: GEOARROW nao cria camada com Z (ex.: CNES vem 3D)
        "-lco", "GEOMETRY_ENCODING=GEOARROW",
        "-nln", ds.name,  # nome de camada deterministico (= dataset), nao o da fonte
        "-overwrite",
    ]
    if ds.attributes:
        cmd += ["-select", ",".join(ds.attributes)]
    cmd += [str(dst), str(src)]
    if ds.layer:
        cmd += [ds.layer]

    log.info("convert %s: %s -> %s", ds.name, src.name, dst.name)
    subprocess.run(cmd, check=True)
    return dst
