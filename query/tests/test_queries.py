"""Testes da camada de consulta (rodam contra o geodata real).

Exigem GEODATA_DSN. Sem ela os testes sao pulados com a instrucao, em vez de
falharem com erro de conexao — quem nao tem o banco central de pe nao esta
quebrando nada.
"""

from __future__ import annotations

import os

import pytest

from psycopg import sql

from geo_query import GeoQuery
from geo_query.db import connect

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


def test_dsn_explicito_tem_prioridade_sobre_o_ambiente(monkeypatch):
    """O agente passa o DSN; a variavel de ambiente e o outro caminho.

    Sem isso o agente nao sobe: ele le o proprio .env com pydantic-settings, que
    popula `settings` e NAO o ambiente do processo — entao a fachada nao enxergava
    o DSN e falhava no startup, pedindo uma variavel que o .env ja tinha.
    """
    from geo_query.db import dsn

    monkeypatch.setenv("GEODATA_DSN", "postgresql://do-ambiente/x")
    assert dsn("postgresql://do-chamador/y") == "postgresql://do-chamador/y"
    assert dsn() == "postgresql://do-ambiente/x"

    monkeypatch.delenv("GEODATA_DSN")
    assert dsn("postgresql://do-chamador/y") == "postgresql://do-chamador/y"
    with pytest.raises(RuntimeError, match="GEODATA_DSN"):
        dsn()


def test_geoquery_aceita_dsn():
    """O caminho que o main.py do agente usa."""
    import os

    q = GeoQuery(dsn=os.environ["GEODATA_DSN"])
    assert q.municipio("2400208")["nm_mun"] == "Assú"  # nome corrigido na malha 2025
    q.close()


# --- bairro (nivel acrescentado em 2026-08-20) --------------------------------


def test_bairro_lookup_tem_as_mesmas_metricas_do_municipio(gq: GeoQuery) -> None:
    """bairro_resumo nao e um recorte menor: o que responde de municipio responde de bairro."""
    assert set(gq.metricas("bairro")) == set(gq.metricas("municipio"))


def test_bairro_lookup(gq: GeoQuery) -> None:
    b = gq.bairro("3304557018")  # Copacabana, Rio de Janeiro
    assert b is not None
    assert b["nm_bairro"] == "Copacabana"
    assert b["nm_mun"] == "Rio de Janeiro"
    assert b["nm_uf"] == "Rio de Janeiro"
    assert b["pop_total"] > 100_000
    assert b["lon"] is not None and b["lat"] is not None


def test_busca_bairros_filtra_por_municipio(gq: GeoQuery) -> None:
    """'Centro' existe em quase toda cidade — sem o filtro a resposta e outra."""
    curitiba = gq.busca_bairros("Centro", municipio="Curitiba")
    assert curitiba and all(r["nm_mun"] == "Curitiba" for r in curitiba)

    brasil = gq.busca_bairros("Centro")
    assert len(brasil) > 1
    # Sem filtro, os mais populosos primeiro (ordem decrescente, nulos por ultimo).
    pops = [r["pop_total"] for r in brasil if r["pop_total"] is not None]
    assert pops == sorted(pops, reverse=True)


def test_busca_bairros_exato_antes_de_substring(gq: GeoQuery) -> None:
    """Mesmo contrato do municipio: nome igual ganha de nome que contem."""
    r = gq.busca_bairros("Copacabana", municipio="Rio de Janeiro")
    assert [x["nm_bairro"] for x in r] == ["Copacabana"]


def test_ranking_bairros_no_municipio(gq: GeoQuery) -> None:
    top = gq.ranking_bairros("pop_total", cd_mun="3304557", n=5)
    assert len(top) == 5
    assert all(r["nm_mun"] == "Rio de Janeiro" for r in top)
    valores = [r["valor"] for r in top]
    assert valores == sorted(valores, reverse=True)


def test_ranking_bairros_ordem_asc(gq: GeoQuery) -> None:
    piores = gq.ranking_bairros("pct_esgoto_rede", cd_mun="3304557", n=3, ordem="asc")
    valores = [r["valor"] for r in piores]
    assert valores == sorted(valores)


def test_bairro_no_ponto(gq: GeoQuery) -> None:
    copa = gq.bairro("3304557018")
    achado = gq.bairro_no_ponto(copa["lon"], copa["lat"])
    assert achado is not None
    assert achado["cd_bairro"] == copa["cd_bairro"]


def test_bairro_no_ponto_fora_de_area_urbana_e_none(gq: GeoQuery) -> None:
    """A malha de bairros nao cobre o pais — devolver None ali e o comportamento, nao falha."""
    assert gq.bairro_no_ponto(-63.0, -4.0) is None  # meio do Amazonas


# --- distrito (nivel acrescentado em 2026-08-22) ------------------------------

DIST_SE_SP = "355030878"  # distrito da Se, Sao Paulo


def test_distrito_tem_as_mesmas_metricas_do_municipio(gq: GeoQuery) -> None:
    """distrito_resumo sai do mesmo modelo de view de bairro_resumo: 16 colunas iguais."""
    assert set(gq.metricas("distrito")) == set(gq.metricas("municipio"))


def test_distrito_lookup(gq: GeoQuery) -> None:
    d = gq.distrito(DIST_SE_SP)
    assert d is not None
    assert d["nm_distrito"] == "Sé"
    assert d["nm_mun"] == "São Paulo"
    assert d["nm_uf"] == "São Paulo"
    assert d["area_km2"] > 0
    assert d["lon"] is not None and d["lat"] is not None


def test_busca_distritos_filtra_por_municipio(gq: GeoQuery) -> None:
    """'Sao Jose' nomeia 17 distritos — sem o filtro a resposta e outra."""
    alcobaca = gq.busca_distritos("São José", municipio="Alcobaça")
    assert alcobaca and all(r["nm_mun"] == "Alcobaça" for r in alcobaca)

    brasil = gq.busca_distritos("São José")
    assert len(brasil) > 1
    pops = [r["pop_total"] for r in brasil if r["pop_total"] is not None]
    assert pops == sorted(pops, reverse=True)


def test_busca_distritos_acha_o_distrito_sede_com_nome_da_cidade(gq: GeoQuery) -> None:
    """A armadilha que o prompt precisa evitar: 5.564 distritos se chamam como o
    municipio. Buscar 'Curitiba' aqui devolve o DISTRITO sede, nao a cidade."""
    r = gq.busca_distritos("Curitiba", municipio="Curitiba")
    assert [x["nm_distrito"] for x in r] == ["Curitiba"]
    assert r[0]["cd_distrito"] != r[0]["cd_mun"]


def test_ranking_distritos_no_municipio(gq: GeoQuery) -> None:
    """Sao Paulo e o municipio mais subdividido do pais: 96 distritos."""
    top = gq.ranking_distritos("pop_total", cd_mun="3550308", n=5)
    assert len(top) == 5
    assert all(r["nm_mun"] == "São Paulo" for r in top)
    valores = [r["valor"] for r in top]
    assert valores == sorted(valores, reverse=True)


def test_ranking_distritos_por_uf(gq: GeoQuery) -> None:
    """O recorte que bairro nao tem: distrito cobre o pais, entao UF e pergunta valida."""
    top = gq.ranking_distritos("pop_total", uf="Paraná", n=3)
    assert len(top) == 3
    assert all(r["nm_uf"] == "Paraná" for r in top)


def test_ranking_distritos_ordem_asc(gq: GeoQuery) -> None:
    piores = gq.ranking_distritos("pct_esgoto_rede", cd_mun="3550308", n=3, ordem="asc")
    valores = [r["valor"] for r in piores]
    assert valores == sorted(valores)


def test_distrito_no_ponto(gq: GeoQuery) -> None:
    se = gq.distrito(DIST_SE_SP)
    achado = gq.distrito_no_ponto(se["lon"], se["lat"])
    assert achado is not None
    assert achado["cd_distrito"] == se["cd_distrito"]


def test_distrito_cobre_onde_bairro_nao_cobre(gq: GeoQuery) -> None:
    """A razao de existir deste nivel. No meio do Amazonas nao ha bairro mapeado pelo
    IBGE, e ate 2026-08-22 o agente so tinha 'nao sei' para oferecer ali."""
    lon, lat = -63.0, -4.0
    assert gq.bairro_no_ponto(lon, lat) is None
    d = gq.distrito_no_ponto(lon, lat)
    assert d is not None
    assert d["nm_mun"] == "Coari"


# --- reconexao (defeito medido em 2026-08-20) ---------------------------------


def test_reconecta_quando_a_conexao_foi_fechada() -> None:
    """Conexao fechada por baixo nao pode virar erro permanente."""
    q = GeoQuery()
    assert q.municipio("4106902") is not None
    q.con.close()
    assert q.municipio("4106902") is not None  # reabre sozinha
    q.close()


def test_reconecta_quando_o_servidor_derruba_a_conexao() -> None:
    """O caso real: o Postgres reinicia e mata a conexao do lado dele.

    Antes desta correcao o agente ficava 500 para sempre — o banco voltava e ele
    nao. Reproduzido em 2026-08-20 reiniciando o container do geodata com o agente
    de pe; aqui o mesmo efeito sem depender do Docker, via pg_terminate_backend.
    """
    q = GeoQuery()
    pid = q._rows(sql.SQL("select pg_backend_pid() as pid"), [])[0]["pid"]

    carrasco = connect()
    with carrasco.cursor() as cur:
        cur.execute("select pg_terminate_backend(%s)", [pid])
    carrasco.close()

    assert q.municipio("4106902") is not None
    q.close()


def test_ping_tambem_reconecta() -> None:
    """O /api/health chama ping(): ele precisa curar, nao so diagnosticar."""
    q = GeoQuery()
    q.con.close()
    q.ping()
    q.close()
