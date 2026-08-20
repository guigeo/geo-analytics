"""Conversao streaming de fontes vetoriais para GeoParquet (EPSG:4326).

Usa ogr2ogr (GDAL) via subprocess para nao carregar arquivos grandes em memoria
(o setor censitario tem ~1.4 GB / ~473k feicoes).

Duas fontes possiveis, e a diferenca e de dono, nao de formato: dado universal do
IBGE vem do geodata central (uma copia, para todas as aplicacoes derivadas); dado
que ainda nao esta la vem de arquivo em data/. O alvo do passo 4 do roteiro e que
sobre so a primeira — cada dataset migrado tira GB de dentro do repositorio.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from .config import DatasetConfig, GeodataSource, OutputConfig, geodata_dsn

log = logging.getLogger(__name__)

TARGET_CRS = "EPSG:4326"

# Lendo de um -sql o GDAL nao sabe o tipo geometrico e reporta "Unknown (any)"; o
# GEOARROW exige tipo concreto e recusa. O registry ja declara a geometria de cada
# dataset — ate agora era so documentacao, aqui vira instrucao. Multi porque a malha
# do IBGE tem feicao multiparte (ilhas, enclaves) e o tipo simples truncaria.
OGR_TIPO = {"polygon": "MULTIPOLYGON", "line": "MULTILINESTRING", "point": "POINT"}


def convert_dataset(ds: DatasetConfig, output: OutputConfig) -> Path:
    dst = ds.processed_path(output)
    if not ds.do_geodata:
        src = ds.source_path()
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
    if isinstance(ds.source, GeodataSource):
        # O SQL ja escolhe as colunas (com os apelidos que o tile publica), entao
        # -select nao entra. OGR_PG_ENABLE_METADATA=NO evita o aviso de USAGE em
        # ogr_system_tables: o geo_reader nao enxerga esse schema, e nem precisa.
        cmd += ["--config", "OGR_PG_ENABLE_METADATA", "NO"]
        cmd += ["-nlt", OGR_TIPO[ds.geometry], "-sql", ds.source.sql]
        cmd += [str(dst), f"PG:{geodata_dsn()}"]
        origem = "geodata"
    else:
        if ds.attributes:
            cmd += ["-select", ",".join(ds.attributes)]
        cmd += [str(dst), str(ds.source_path())]
        if ds.layer:
            cmd += [ds.layer]
        origem = ds.source_path().name

    log.info("convert %s: %s -> %s", ds.name, origem, dst.name)
    subprocess.run(cmd, check=True)
    return dst
