"""Raio-X: contrato fixo, rateio explícito e tetos de proteção."""

from __future__ import annotations

import os

import pytest

from geo_query import GeoQuery
from geo_query.queries import TETO_AREA_RAIO_X_KM2, TETO_SETORES_RAIO_X
from geo_query.sintese import montar_sintese


def test_sintese_e_pura_e_declara_o_rateio() -> None:
    texto = montar_sintese(
        {
            "area_km2": 0.5,
            "populacao": 1_000,
            "domicilios_ocupados": 400,
            "densidade_hab_km2": 2_000,
            "populacao_rateada": 250,
            "municipio": {"nm_mun": "Exemplo", "densidade_hab_km2": 1_000},
        },
        {"minimo": 1_000, "maximo": 2_000},
    )
    assert "50,0 ha" in texto
    assert "25,0%" in texto
    assert "R$ 1.000,00" in texto


_PRECISA_GEODATA = pytest.mark.skipif(
    not os.getenv("GEODATA_DSN"),
    reason="defina GEODATA_DSN para rodar contra o geodata (ver geo_query/db.py)",
)


@pytest.fixture(scope="module")
def gq() -> GeoQuery:
    consulta = GeoQuery()
    yield consulta
    consulta.close()


def _buffer(gq: GeoQuery, metros: int) -> bytes:
    return gq._rows(
        """
        select ST_AsBinary(
            ST_Buffer(ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4674)::geography, %s)::geometry
        ) as w
        """,
        [metros],
    )[0]["w"]


@_PRECISA_GEODATA
def test_raio_x_devolve_bloco_e_rateio_no_mesmo_retrato(gq: GeoQuery) -> None:
    resultado = gq.raio_x_por_geometria(_buffer(gq, 500))
    assert resultado["escala"]["setores"] > 1
    assert resultado["escala"]["setores_parciais"] > 0
    assert resultado["escala"]["populacao_rateada"] > 0
    assert resultado["perfil"]["renda_media"] is not None
    assert resultado["contraste"]["minimo"] <= resultado["contraste"]["maximo"]
    assert resultado["contraste"]["setores"]
    assert resultado["escala"]["municipio"]["nm_mun"] == "São Paulo"


@_PRECISA_GEODATA
def test_raio_x_degrada_a_lista_sem_descartar_o_agregado(gq: GeoQuery) -> None:
    wkb = gq._rows(
        "select ST_AsBinary(geom) as w from ibge.municipio where cod_municipio = %s",
        ["3550308"],
    )[0]["w"]
    resultado = gq.raio_x_por_geometria(wkb)
    assert resultado["escala"]["setores"] > TETO_SETORES_RAIO_X
    assert resultado["contraste"]["truncada"] is True
    assert resultado["contraste"]["setores"] == []
    assert resultado["contraste"]["faixas"]


@_PRECISA_GEODATA
def test_raio_x_recusa_area_acima_do_teto(gq: GeoQuery) -> None:
    lado = int((TETO_AREA_RAIO_X_KM2**0.5 + 1) * 1_000)
    wkb = _buffer(gq, lado)
    with pytest.raises(ValueError, match="2,000"):
        gq.raio_x_por_geometria(wkb)
