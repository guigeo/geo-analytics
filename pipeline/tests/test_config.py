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
    assert setor.tile.simplification == 10
    assert setor.processed_path(cfg.output).name == "setor.parquet"
    assert setor.tiles_path(cfg.output) == Path("/tiles/setor.pmtiles")
    # `layer` so faz sentido em fonte de arquivo multicamada; setor veio do banco.
    assert setor.layer is None
    assert cfg.dataset("saude_cnes").layer == "cnes"


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


@pytest.mark.parametrize("nome", ["uf", "municipio", "bairro", "setor"])
def test_malhas_vem_do_geodata(nome):
    """Passo 4 do roteiro: dado universal sai de data/ e passa a vir do banco."""
    ds = load_config().dataset(nome)
    assert ds.do_geodata
    assert isinstance(ds.source, GeodataSource)


def test_uf_vem_do_geodata():
    """Os apelidos do SQL sao o contrato com o frontend."""
    uf = load_config().dataset("uf")
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


def test_municipio_inclui_areas_operacionais():
    """As 2 lagoas do RS saem de ibge.municipio no dado, mas seguem no MAPA.

    Sem elas o sul do Brasil ganha dois buracos de 13.000 km2. Separadas no banco
    para que join por codigo nunca devolva uma lagoa; unidas no tile porque tile e
    desenho. 5.571 + 2 = 5.573, igual ao tile que esta em producao.
    """
    sql = load_config().dataset("municipio").source.sql
    assert "ibge.area_operacional" in sql
    assert "union all" in sql.lower()


def test_bairro_traz_nome_de_municipio_por_join():
    """CD_BAIRRO e NM_BAIRRO vivem em ibge.bairro; NM_MUN e NM_UF vem do join."""
    sql = load_config().dataset("bairro").source.sql
    assert "join ibge.municipio" in sql
    for campo in ("CD_BAIRRO", "NM_BAIRRO", "NM_MUN", "NM_UF"):
        assert f'as "{campo}"' in sql


def test_setor_nao_traz_as_lagoas_e_municipio_traz():
    """A mesma lagoa entra numa camada e nao na outra, e isso e deliberado.

    Em municipio ela e area operacional com nome proprio, e municipio e a camada
    que desenha o contorno do pais — sem ela, buraco. Em setor ela e preenchimento
    de malha: codigo terminado em zeros e CD_MUN, NM_MUN e SITUACAO nulos, que o
    tile atual pinta como setor de popup vazio.
    """
    cfg = load_config()
    assert "area_operacional" in cfg.dataset("municipio").source.sql
    assert "area_operacional" not in cfg.dataset("setor").source.sql


def test_setor_mantem_o_ajuste_fino_da_camada_critica():
    """473 mil feicoes: o gargalo e a tilagem, e o ajuste vive no tippecanoe."""
    setor = load_config().dataset("setor")
    assert setor.tile.simplification == 10
    assert (setor.tile.minzoom, setor.tile.maxzoom) == (6, 14)
