"""Valida o parsing/validacao do registry declarativo."""

from __future__ import annotations

from pathlib import Path

import pytest

from geo_pipeline.config import GeodataSource, PipelineConfig, geodata_dsn, load_config


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


def test_uf_vem_do_geodata():
    """Passo 4 do roteiro: dado universal sai de data/ e passa a vir do banco."""
    uf = load_config().dataset("uf")
    assert uf.do_geodata
    assert isinstance(uf.source, GeodataSource)
    # Os apelidos sao o contrato com o frontend; sem aspas o Postgres minusculiza
    # e o mapa perde os campos que le.
    for campo in ("CD_UF", "NM_UF", "SIGLA_UF"):
        assert f'as "{campo}"' in uf.source.sql
    assert uf.attributes == ["CD_UF", "NM_UF", "SIGLA_UF"]


def test_fonte_de_arquivo_continua_string():
    """Nem todo dataset esta no geodata (CNES e INEP ainda nao); a forma antiga vale."""
    cnes = load_config().dataset("saude_cnes")
    assert not cnes.do_geodata
    assert isinstance(cnes.source, str)
    assert cnes.source_path().name == "cnes.gpkg"


def test_source_path_recusa_fonte_de_banco():
    with pytest.raises(ValueError, match="geodata"):
        load_config().dataset("uf").source_path()


def test_dsn_exige_ambiente(monkeypatch):
    """Sem GEODATA_DSN o pipeline para, em vez de cair silenciosamente no arquivo."""
    monkeypatch.delenv("GEODATA_DSN", raising=False)
    with pytest.raises(ValueError, match="GEODATA_DSN"):
        geodata_dsn()
