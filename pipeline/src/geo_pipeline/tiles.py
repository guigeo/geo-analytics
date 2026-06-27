"""Geracao de PMTiles a partir do GeoParquet via tippecanoe.

Fluxo: GeoParquet -> FlatGeobuf (feed streaming) -> tippecanoe -> .pmtiles
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from .config import DatasetConfig, OutputConfig

log = logging.getLogger(__name__)


def build_tiles(ds: DatasetConfig, output: OutputConfig) -> Path:
    parquet = ds.processed_path(output)
    out = ds.tiles_path(output)
    if not parquet.exists():
        raise FileNotFoundError(f"GeoParquet ausente (rode convert antes): {parquet}")
    out.parent.mkdir(parents=True, exist_ok=True)

    fgb = out.with_suffix(".fgb")
    subprocess.run(
        ["ogr2ogr", "-f", "FlatGeobuf", "-overwrite", str(fgb), str(parquet)],
        check=True,
    )
    try:
        cmd = [
            "tippecanoe",
            "-o", str(out),
            "-l", ds.name,
            f"--minimum-zoom={ds.tile.minzoom}",
            f"--maximum-zoom={ds.tile.maxzoom}",
            "--drop-densest-as-needed",
            "--no-tile-size-limit",
            "--force",
        ]
        if ds.tile.simplification is not None:
            cmd.append(f"--simplification={ds.tile.simplification}")
        cmd.append(str(fgb))

        log.info("tiles %s: %s -> %s", ds.name, parquet.name, out.name)
        subprocess.run(cmd, check=True)
    finally:
        fgb.unlink(missing_ok=True)

    if out.exists():
        log.info("tiles %s: %.1f MB", ds.name, out.stat().st_size / 1e6)
    return out
