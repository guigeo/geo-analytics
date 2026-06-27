"""CLI do pipeline: convert -> tiles (+ basemap), dirigido por datasets.yaml.

Uso (dentro do container Docker):
    docker compose run --rm pipeline build
    docker compose run --rm pipeline build --only setor
    docker compose run --rm pipeline build --no-basemap
"""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
from pathlib import Path

from .antennas import convert_antennas
from .basemap import build_basemap
from .config import DatasetConfig, OutputConfig, PipelineConfig, load_config
from .convert import convert_dataset
from .tiles import build_tiles

log = logging.getLogger("geo_pipeline")

REQUIRED_BINARIES = ("ogr2ogr", "tippecanoe")
BASEMAP_BINARY = "pmtiles"


def _check_binaries(names: tuple[str, ...]) -> None:
    missing = [b for b in names if shutil.which(b) is None]
    if missing:
        raise SystemExit(
            f"binarios ausentes: {', '.join(missing)}. "
            "Rode o pipeline via container: `docker compose run --rm pipeline build`."
        )


def _convert(ds: DatasetConfig, output: OutputConfig) -> Path:
    if ds.format == "csv_points":
        return convert_antennas(ds, output)
    return convert_dataset(ds, output)


def _build(
    cfg: PipelineConfig,
    only: str | None,
    do_basemap: bool,
    do_tiles: bool,
    basemap_only: bool,
) -> None:
    if basemap_only:
        if not cfg.basemap:
            raise SystemExit("nenhum basemap configurado em datasets.yaml")
        _check_binaries((BASEMAP_BINARY,))
        build_basemap(cfg.basemap, cfg.output)
        log.info("basemap regenerado (tiles de dados inalterados)")
        return

    datasets = [cfg.dataset(only)] if only else cfg.datasets
    _check_binaries(REQUIRED_BINARIES if do_tiles else ("ogr2ogr",))

    for ds in datasets:
        _convert(ds, cfg.output)
        if do_tiles:
            build_tiles(ds, cfg.output)

    if do_basemap and not only and cfg.basemap:
        _check_binaries((BASEMAP_BINARY,))
        build_basemap(cfg.basemap, cfg.output)

    log.info("build concluido (%d dataset(s))", len(datasets))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="geo-pipeline")
    parser.add_argument("--registry", type=Path, default=None, help="caminho do datasets.yaml")
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="converte fontes e gera tiles")
    build.add_argument("--only", help="processa apenas um dataset pelo nome")
    build.add_argument("--no-basemap", action="store_true", help="pula o basemap Protomaps")
    build.add_argument("--no-tiles", action="store_true", help="apenas converte para GeoParquet")
    build.add_argument(
        "--basemap-only",
        action="store_true",
        help="regenera apenas o basemap (nao re-tila os dados)",
    )

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    cfg = load_config(args.registry)
    if args.command == "build":
        _build(cfg, args.only, not args.no_basemap, not args.no_tiles, args.basemap_only)
    return 0


if __name__ == "__main__":
    sys.exit(main())
