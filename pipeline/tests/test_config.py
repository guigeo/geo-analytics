"""Valida o parsing/validacao do registry declarativo."""

from __future__ import annotations

import pytest

from geo_pipeline.config import PipelineConfig, load_config


def test_load_real_registry():
    cfg = load_config()
    names = {ds.name for ds in cfg.datasets}
    assert {"uf", "municipio", "bairro", "setor", "antenas"} <= names


def test_dataset_lookup_and_paths():
    cfg = load_config()
    setor = cfg.dataset("setor")
    assert setor.layer == "BR_setores_CD2022"
    assert setor.tile.simplification == 10
    assert setor.processed_path(cfg.output).name == "setor.parquet"
    assert setor.tiles_path(cfg.output).name == "setor.pmtiles"


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
