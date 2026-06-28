"""Testes da camada de consulta (rodam contra os parquets reais em data/processed)."""

from __future__ import annotations

import pytest

from geo_query import GeoQuery


@pytest.fixture(scope="module")
def gq() -> GeoQuery:
    q = GeoQuery()
    yield q
    q.close()


def test_municipio_lookup(gq: GeoQuery) -> None:
    sp = gq.municipio("3550308")  # Sao Paulo
    assert sp is not None
    assert sp["nm_mun"] == "São Paulo"
    assert sp["pop_total"] > 11_000_000


def test_setor_lookup_tem_centroide(gq: GeoQuery) -> None:
    s = gq.setor("110001505000002")
    assert s is not None
    assert s["pop_total"] is not None
    assert s["lon"] is not None and s["lat"] is not None


def test_ranking_municipios_pop(gq: GeoQuery) -> None:
    top = gq.ranking_municipios("pop_total", n=3)
    assert [r["nm_mun"] for r in top][:2] == ["São Paulo", "Rio de Janeiro"]


def test_ranking_filtra_por_uf(gq: GeoQuery) -> None:
    top = gq.ranking_municipios("pop_total", uf="Ceará", n=1)
    assert top[0]["nm_mun"] == "Fortaleza"


def test_ranking_metrica_invalida(gq: GeoQuery) -> None:
    with pytest.raises(ValueError):
        gq.ranking_municipios("'; DROP TABLE municipio; --")


def test_setores_proximos(gq: GeoQuery) -> None:
    viz = gq.setores_proximos("230440005130001", raio_km=2.0, limite=5)
    assert len(viz) >= 1
    assert viz[0]["km_aprox"] == 0.0  # o proprio setor
    assert all(v["km_aprox"] <= 2.0 for v in viz)
