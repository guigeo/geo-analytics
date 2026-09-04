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


def test_zoneamento_no_ponto_em_sao_paulo(gq: GeoQuery) -> None:
    zona = gq.zoneamento_no_ponto(-46.6540, -23.5614)
    assert zona is not None
    assert zona["cod_municipio"] == "3550308"
    assert zona["lei"] == "Lei 18177/2024"


def test_zoneamento_no_ponto_fora_da_cobertura(gq: GeoQuery) -> None:
    assert gq.zoneamento_no_ponto(-38.5014, -12.9714) is None


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


# --- cascata: fracao do municipio e busca com modo fixo (2026-08-22) -----------


def test_fracao_do_municipio_separa_recorte_de_municipio_inteiro(gq: GeoQuery) -> None:
    """O dado que sustenta o aviso de distorção: 3.377 dos 10.698 distritos passam
    de 0,95 e são, na prática, o município."""
    se = gq.distrito(DIST_SE_SP)
    assert float(se["fracao_do_municipio"]) < 0.01  # 1 de 96 distritos

    curitiba = gq.busca_distritos("Curitiba", municipio="Curitiba", exato=True)[0]
    assert float(curitiba["fracao_do_municipio"]) > 0.95  # distrito único


def test_busca_com_modo_exato_fixo(gq: GeoQuery) -> None:
    """Sem poder fixar o modo, um substring de bairro ganhava de um nome exato de
    distrito: 'Curitiba' achava o bairro 'Cidade Industrial de Curitiba'."""
    assert gq.busca_bairros("Curitiba", municipio="Curitiba", exato=True) == []
    porsubstring = gq.busca_bairros("Curitiba", municipio="Curitiba", exato=False)
    assert any("Curitiba" in b["nm_bairro"] for b in porsubstring)


def test_municipio_no_ponto(gq: GeoQuery) -> None:
    """O juiz do geocoding: ponto resolvido fora do município pedido é erro, não
    resultado pobre."""
    assert gq.municipio_no_ponto(-46.67, -23.59)["nm_mun"] == "São Paulo"
    assert gq.municipio_no_ponto(-47.83, -23.05)["nm_mun"] == "Laranjal Paulista"


# --- cruzamento sob geometria arbitraria (DESENHO_NO_MAPA, fase 4) ------------


@pytest.fixture(scope="module")
def wkb_de_sp(gq: GeoQuery) -> bytes:
    """O contorno do municipio de Sao Paulo, servindo de desenho.

    E o pior caso realista de um KML — 21.308 vertices, 333 kB — e ao mesmo tempo o
    unico gabarito possivel: e a unica geometria de que se sabe, por outro caminho,
    quanta gente mora dentro.
    """
    return gq._rows(
        "select ST_AsBinary(geom) as wkb from ibge.municipio where cod_municipio = %s",
        ["3550308"],
    )[0]["wkb"]


def test_gabarito_o_municipio_como_desenho(gq: GeoQuery, wkb_de_sp: bytes) -> None:
    """AT-005. O rateio areal conferido contra o numero que ja existia.

    Sem isto, o cruzamento so poderia ser conferido contra ele mesmo: qualquer erro
    sistematico no rateio — fracao invertida, geografia projetada errada, setor
    contado duas vezes — daria um numero plausivel e ninguem saberia.
    """
    oficial = float(gq.municipio("3550308")["pop_total"])
    r = gq.cruzamento_por_geometria(wkb_de_sp, ["pop_total"])

    assert abs(float(r["pop_total"]) - oficial) / oficial <= 0.005  # <= 0,5%
    assert r["setores"] > 20_000
    assert r["parciais"] > 0  # a borda do municipio corta setores dos vizinhos


def test_rateio_reconstitui_o_setor(gq: GeoQuery) -> None:
    """AT-006. Duas metades complementares de um setor somam o setor inteiro.

    E o teste que prova que a fracao e area, e nao contagem: se um setor cortado ao
    meio entrasse inteiro nos dois lados, a soma daria o dobro; se entrasse em nenhum,
    daria zero. Ambos passariam despercebidos no teste do municipio, onde a borda e
    0,03% do total.
    """
    alvo = gq._rows(
        """
        select s.cod_setor, ST_XMin(s.geom) x0, ST_XMax(s.geom) x1,
               ST_YMin(s.geom) y0, ST_YMax(s.geom) y1, r.pop_total
        from ibge.setor_censitario s join ibge_tabular.setor_resumo r using (cod_setor)
        where r.pop_total > 500 order by s.cod_setor limit 1
        """,
        [],
    )[0]
    meio = (alvo["x0"] + alvo["x1"]) / 2
    folga = 0.001  # a caixa passa da borda do setor; o que limita e o corte no meio

    def metade(x0: float, x1: float) -> float:
        wkb = gq._rows(
            "select ST_AsBinary(ST_MakeEnvelope(%s, %s, %s, %s, 4674)) as w",
            [x0, alvo["y0"] - folga, x1, alvo["y1"] + folga],
        )[0]["w"]
        # A caixa alcanca setores vizinhos; o que se soma e a fatia DESTE setor.
        return float(
            gq._rows(
                """
                with area as (select ST_GeomFromWKB(%s, 4674) as g)
                select sum(r.pop_total *
                           case when ST_Within(s.geom, a.g) then 1.0
                                else ST_Area(ST_Intersection(s.geom, a.g)::geography)
                                     / nullif(ST_Area(s.geom::geography), 0) end) as pop
                from ibge.setor_censitario s
                join ibge_tabular.setor_resumo r using (cod_setor)
                cross join area a
                where ST_Intersects(s.geom, a.g) and s.cod_setor = %s
                """,
                [wkb, alvo["cod_setor"]],
            )[0]["pop"]
            or 0
        )

    total = float(alvo["pop_total"])
    soma = metade(alvo["x0"] - folga, meio) + metade(meio, alvo["x1"] + folga)
    assert abs(soma - total) / total <= 0.01  # <= 1%


def test_a_borda_domina_em_area_pequena(gq: GeoQuery, wkb_de_sp: bytes) -> None:
    """O que torna o rateio obrigatorio, e nao preferivel.

    Num buffer de 500 m a maioria dos setores esta CORTADA — contar setor inteiro
    ali erraria para cima em quase todos. Num municipio inteiro os parciais somem no
    ruido, e e por isso que medir so o caso grande esconderia o problema.
    """
    wkb = gq._rows(
        """
        select ST_AsBinary(
            ST_Buffer(ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4674)::geography, 500)::geometry
        ) as w
        """,
        [],
    )[0]["w"]
    pequena = gq.cruzamento_por_geometria(wkb)
    assert pequena["parciais"] / pequena["setores"] > 0.5

    grande = gq.cruzamento_por_geometria(wkb_de_sp)
    assert grande["parciais"] / grande["setores"] < 0.1


def test_metricas_do_formato_longo_entram_no_cruzamento(gq: GeoQuery) -> None:
    """As 34 metricas que so existem no formato longo — faixa etaria, cor, tipo de
    domicilio — sao todas contagens, e sao metade da graca de perguntar sobre uma area."""
    wkb = gq._rows(
        """
        select ST_AsBinary(
            ST_Buffer(ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4674)::geography, 2000)::geometry
        ) as w
        """,
        [],
    )[0]["w"]
    r = gq.cruzamento_por_geometria(wkb, ["pop_0_4", "cor_preta", "pop_total"])
    assert r["pop_0_4"] > 0
    assert r["cor_preta"] > 0
    # A faixa de 0 a 4 anos nao pode passar da populacao toda: se a juncao do formato
    # longo duplicasse linhas, e aqui que apareceria.
    assert float(r["pop_0_4"]) < float(r["pop_total"])


def test_media_ponderada_fica_na_faixa_dos_setores(gq: GeoQuery) -> None:
    """Media ponderada, e nao soma: somar renda_media de 3 mil setores daria milhoes.

    O teste ancora no unico invariante que uma media tem: ela cai entre o menor e o
    maior dos valores que a compoem.
    """
    wkb = gq._rows(
        """
        select ST_AsBinary(
            ST_Buffer(ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4674)::geography, 2000)::geometry
        ) as w
        """,
        [],
    )[0]["w"]
    r = gq.cruzamento_por_geometria(wkb, ["renda_media"])
    faixa = gq._rows(
        """
        with area as (select ST_GeomFromWKB(%s, 4674) as g)
        select min(r.renda_media) as menor, max(r.renda_media) as maior
        from ibge.setor_censitario s
        join ibge_tabular.setor_resumo r using (cod_setor)
        cross join area a
        where ST_Intersects(s.geom, a.g) and r.renda_media is not null
        """,
        [wkb],
    )[0]
    assert float(faixa["menor"]) <= float(r["renda_media"]) <= float(faixa["maior"])


def test_densidade_e_recalculada_sobre_a_area_desenhada(gq: GeoQuery) -> None:
    """Derivada, nao agregada: populacao rateada dividida pela area do desenho."""
    wkb = gq._rows(
        """
        select ST_AsBinary(
            ST_Buffer(ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4674)::geography, 2000)::geometry
        ) as w
        """,
        [],
    )[0]["w"]
    r = gq.cruzamento_por_geometria(wkb, ["densidade_hab_km2"])
    esperado = float(r["pop_total"]) / float(r["area_km2"])
    assert abs(r["densidade_hab_km2"] - esperado) < 0.5


def test_recusa_o_que_nao_se_agrega_nomeando_a_saida(gq: GeoQuery, wkb_de_sp: bytes) -> None:
    """Mediana de medianas nao e mediana. A recusa cita renda_media porque o loop do
    agente da uma chance de autocorrecao, e ela so serve se disser para onde ir."""
    with pytest.raises(ValueError, match="renda_media"):
        gq.cruzamento_por_geometria(wkb_de_sp, ["renda_mediana"])
