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


def test_busca_municipios_sem_acento(gq: GeoQuery) -> None:
    hits = gq.busca_municipios("sao paulo")
    assert hits[0]["cd_mun"] == "3550308"  # capital vem primeiro (mais populosa)
    assert hits[0]["nm_mun"] == "São Paulo"


def test_busca_exata_nao_traz_vizinhos_de_substring(gq: GeoQuery) -> None:
    hits = gq.busca_municipios("curitiba")
    assert [h["nm_mun"] for h in hits] == ["Curitiba"]  # sem "Curitibanos"


def test_busca_substring_como_fallback(gq: GeoQuery) -> None:
    hits = gq.busca_municipios("curitib")  # nenhum nome exato -> contains
    nomes = {h["nm_mun"] for h in hits}
    assert {"Curitiba", "Curitibanos"} <= nomes


def test_busca_municipios_filtra_por_uf(gq: GeoQuery) -> None:
    hits = gq.busca_municipios("Curitiba", uf="Paraná")
    assert hits[0]["cd_mun"] == "4106902"
    assert all(h["nm_uf"] == "Paraná" for h in hits)


def test_busca_municipios_sem_resultado(gq: GeoQuery) -> None:
    assert gq.busca_municipios("xyzinexistente") == []


def test_setores_no_ponto(gq: GeoQuery) -> None:
    fortaleza = gq.municipio("2304400")
    ref = gq.setor("230440005130001")
    assert fortaleza is not None and ref is not None
    viz = gq.setores_no_ponto(ref["lon"], ref["lat"], raio_km=2.0, limite=5)
    assert len(viz) >= 1
    assert viz[0]["km_aprox"] == 0.0  # o setor de referencia esta no proprio ponto
    assert all(v["km_aprox"] <= 2.0 for v in viz)
