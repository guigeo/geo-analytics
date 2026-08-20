"""Valida o parsing/validacao do registry declarativo."""

from __future__ import annotations

from pathlib import Path

import pytest

from geo_pipeline.config import PipelineConfig, load_config


def test_load_real_registry():
    cfg = load_config()
    names = {ds.name for ds in cfg.datasets}
    assert {"uf", "municipio", "bairro", "setor", "antenas"} <= names


def test_dataset_lookup_and_paths(monkeypatch):
    monkeypatch.setenv("GEO_TILES_DIR", "/tiles")
    cfg = load_config()
    setor = cfg.dataset("setor")
    assert setor.layer == "BR_setores_CD2022"
    assert setor.tile.simplification == 10
    assert setor.processed_path(cfg.output).name == "setor.parquet"
    assert setor.tiles_path(cfg.output) == Path("/tiles/setor.pmtiles")


def test_tiles_dir_exige_ambiente(monkeypatch):
    """Sem GEO_TILES_DIR o pipeline para em vez de escrever tile dentro do repo."""
    monkeypatch.delenv("GEO_TILES_DIR", raising=False)
    cfg = load_config()
    with pytest.raises(ValueError, match="GEO_TILES_DIR"):
        cfg.dataset("setor").tiles_path(cfg.output)


def test_antennas_is_csv_points():
    cfg = load_config()
    antenas = cfg.dataset("antenas")
    assert antenas.format == "csv_points"
    assert antenas.lon_field == "lon" and antenas.lat_field == "lat"


def test_basemap_bbox_validation():
    with pytest.raises(ValueError):
        PipelineConfig.model_validate(
            {"datasets": [], "basemap": {"bbox": [-74.0, -34.0, -34.0]}}
        )


def test_unknown_dataset_raises():
    cfg = load_config()
    with pytest.raises(KeyError):
        cfg.dataset("inexistente")
