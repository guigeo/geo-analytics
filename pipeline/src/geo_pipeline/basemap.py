"""Extrai um recorte (bbox Brasil) do basemap Protomaps para PMTiles auto-hospedado.

Usa o `pmtiles` CLI, que extrai um bbox de um PMTiles remoto via HTTP range
(sem baixar o planeta inteiro). A URL do build e configuravel por env var.
"""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

from .config import BasemapConfig, OutputConfig

log = logging.getLogger(__name__)

# Builds datados do Protomaps. Sobrescreva com PROTOMAPS_BUILD_URL para um build mais recente.
# Lista de builds: https://maps.protomaps.com/builds/
# Builds expiram (~90 dias). Atualize aqui ou via PROTOMAPS_BUILD_URL.
DEFAULT_BUILD_URL = "https://build.protomaps.com/20250602.pmtiles"


def build_basemap(basemap: BasemapConfig, output: OutputConfig) -> Path:
    out = basemap.out_path(output)
    out.parent.mkdir(parents=True, exist_ok=True)
    url = os.environ.get("PROTOMAPS_BUILD_URL") or DEFAULT_BUILD_URL
    lon_min, lat_min, lon_max, lat_max = basemap.bbox

    cmd = [
        "pmtiles", "extract", url, str(out),
        f"--bbox={lon_min},{lat_min},{lon_max},{lat_max}",
        f"--maxzoom={basemap.maxzoom}",
    ]
    log.info(
        "basemap: extraindo bbox Brasil (z<=%d) de %s -> %s",
        basemap.maxzoom, url, out.name,
    )
    subprocess.run(cmd, check=True)

    if out.exists():
        log.info("basemap: %.1f MB", out.stat().st_size / 1e6)
    return out
