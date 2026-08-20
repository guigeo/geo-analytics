"""Testes da camada de consulta (rodam contra o geodata real).

Exigem GEODATA_DSN. Sem ela os testes sao pulados com a instrucao, em vez de
falharem com erro de conexao — quem nao tem o banco central de pe nao esta
quebrando nada.
"""

from __future__ import annotations

import os

import pytest

from geo_query import GeoQuery

pytestmark = pytest.mark.skipif(
    not os.getenv("GEODATA_DSN"),
    reason="defina GEODATA_DSN para rodar contra o geodata (ver geo_query/db.py)",
)


@pytest.fixture(scope="module")
def gq() -> GeoQuery:
    q = GeoQuery()
    yield q
    q.close()


# --- lookups -----------------------------------------------------------------


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


def test_um_setor_e_uma_linha(gq: GeoQuery) -> None:
    """A malha nacional do IBGE quebra setor multiparte em uma linha por parte.

    No motor anterior isso multiplicava o censo no join (Corumba respondia 239
    setores onde ha 187). O geodata carrega a malha ja agrupada — o invariante
    continua valendo a pena verificar, agora do lado do banco.
    """
    with gq.con.cursor() as cur:
        cur.execute(
            "select count(*) as linhas, count(distinct cod_setor) as setores "
            "from ibge.setor_censitario where cod_municipio = '5003207'"  # Corumba/MS
        )
        r = cur.fetchone()
    assert r["linhas"] == r["setores"]


# --- busca -------------------------------------------------------------------


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


# --- ranking e roteamento de metrica -----------------------------------------


def test_ranking_municipios_pop(gq: GeoQuery) -> None:
    top = gq.ranking_municipios("pop_total", n=3)
    assert [r["nm_mun"] for r in top][:2] == ["São Paulo", "Rio de Janeiro"]


def test_ranking_filtra_por_uf(gq: GeoQuery) -> None:
    top = gq.ranking_municipios("pop_total", uf="Ceará", n=1)
    assert top[0]["nm_mun"] == "Fortaleza"


def test_ranking_metrica_invalida(gq: GeoQuery) -> None:
    with pytest.raises(ValueError):
        gq.ranking_municipios("'; DROP TABLE municipio; --")


def test_metrica_fora_do_resumo_usa_formato_longo(gq: GeoQuery) -> None:
    """O segundo caminho do roteamento: metrica que o resumo nao tem.

    Faixa etaria nao esta no municipio_resumo; a fachada tem de responder assim
    mesmo, lendo o formato longo. Se um dia ela virar coluna do resumo, o
    roteamento muda sozinho e este teste continua valendo.
    """
    assert "pop_70_mais" in gq.metricas("municipio")
    top = gq.ranking_municipios("pop_70_mais", n=3)
    assert [r["nm_mun"] for r in top][:2] == ["São Paulo", "Rio de Janeiro"]
    assert all(r["valor"] is not None for r in top)


# --- espacial: poligono real, nao centroide ----------------------------------


def test_setor_no_ponto_contem(gq: GeoQuery) -> None:
    """A pergunta que o motor anterior nao respondia (ADR-0001, §2.1)."""
    ref = gq.setor("230440005130001")
    assert ref is not None
    achado = gq.setor_no_ponto(ref["lon"], ref["lat"])
    assert achado is not None
    assert achado["cd_setor"] == ref["cd_setor"]


def test_ponto_dentro_do_setor_tem_distancia_zero(gq: GeoQuery) -> None:
    """Mede do poligono, nao do centroide.

    Num setor de 2.634 km2 em Vilhena/RO o metodo antigo informava 2,482 km para
    um ponto DENTRO do setor. Aqui, todo ponto contido tem km = 0 — inclusive no
    maior setor do pais, onde centroide e borda estao mais longe um do outro.
    """
    with gq.con.cursor() as cur:
        cur.execute("""
            select cod_setor, ST_X(ST_PointOnSurface(geom)) as lon,
                   ST_Y(ST_PointOnSurface(geom)) as lat
            from ibge.setor_censitario order by area_km2 desc nulls last limit 1
        """)
        maior = cur.fetchone()
    vizinhos = gq.setores_no_ponto(maior["lon"], maior["lat"], raio_km=1.0, limite=50)
    proprio = [v for v in vizinhos if v["cd_setor"] == maior["cod_setor"]]
    assert proprio, "o setor que contem o ponto tem de aparecer no raio"
    assert float(proprio[0]["km"]) == 0.0


def test_setores_proximos(gq: GeoQuery) -> None:
    viz = gq.setores_proximos("230440005130001", raio_km=2.0, limite=5)
    assert len(viz) >= 1
    assert float(viz[0]["km"]) == 0.0  # o proprio setor
    assert all(float(v["km"]) <= 2.0 for v in viz)


def test_setores_no_ponto(gq: GeoQuery) -> None:
    ref = gq.setor("230440005130001")
    assert ref is not None
    viz = gq.setores_no_ponto(ref["lon"], ref["lat"], raio_km=2.0, limite=5)
    assert len(viz) >= 1
    assert float(viz[0]["km"]) == 0.0
    assert all(float(v["km"]) <= 2.0 for v in viz)


def test_setores_no_ponto_nao_repete_setor(gq: GeoQuery) -> None:
    viz = gq.setores_no_ponto(-57.6528, -19.0086, raio_km=20.0, limite=500)
    codigos = [v["cd_setor"] for v in viz]
    assert len(codigos) == len(set(codigos))
