"""Testes do acervo, contra o `app_clientes` real.

Exigem ACERVO_DSN e sao pulados sem ela, com a instrucao, em vez de falharem com
erro de conexao — o mesmo contrato de `query/tests` e de `test_tools.py`. Quem nao
tem o banco de pe nao esta quebrando nada.

Prepare o banco com:
    servidor-dados-gis/cargas/app_clientes.sh geo-analytics 'senha'
"""

from __future__ import annotations

import os
import uuid

import psycopg
import pytest

from geo_agent.acervo import Acervo, DesenhoInvalido, nome_do_schema
from geo_agent.cliente import clientes_disponiveis

PONTO = {"type": "Point", "coordinates": [-46.6565, -23.5632]}
QUADRADO = {
    "type": "Polygon",
    "coordinates": [
        [[-46.66, -23.57], [-46.65, -23.57], [-46.65, -23.56], [-46.66, -23.56], [-46.66, -23.57]]
    ],
}


@pytest.fixture(scope="module")
def acervo() -> Acervo:
    dsn = os.getenv("ACERVO_DSN")
    if not dsn:
        pytest.skip("defina ACERVO_DSN para rodar contra o app_clientes (ver acervo.py)")
    a = Acervo(dsn=dsn, schema=nome_do_schema(os.getenv("CLIENTE", "geo-analytics")))
    yield a
    a.con.close()


@pytest.fixture
def limpo(acervo: Acervo):
    """Cada teste comeca e termina sem deixar rastro no acervo de desenvolvimento."""
    criados: list[str] = []
    yield criados
    for id_ in criados:
        acervo.apagar(id_)


def test_nome_do_schema() -> None:
    assert nome_do_schema("um-cliente") == "cliente_um_cliente"
    assert nome_do_schema("outro") == "cliente_outro"


def test_ciclo_completo_de_um_ponto(acervo: Acervo, limpo: list[str]) -> None:
    nome = f"teste-ponto-{uuid.uuid4().hex[:8]}"
    d = acervo.criar(tipo="ponto", nome=nome, geometria=PONTO, categoria="teste")
    limpo.append(d["id"])

    assert d["nome"] == nome
    assert d["tipo"] == "ponto"
    assert d["origem"] == "desenho"
    assert d["geometria"]["type"] == "Point"

    lido = acervo.obter(d["id"])
    assert lido is not None and lido["nome"] == nome

    atualizado = acervo.atualizar(d["id"], {"nome": nome + "-novo", "cor": "#ff0000"})
    assert atualizado["nome"] == nome + "-novo"
    assert atualizado["cor"] == "#ff0000"

    assert acervo.apagar(d["id"]) is True
    assert acervo.obter(d["id"]) is None
    limpo.clear()


def test_area_de_poligono_vem_calculada(acervo: Acervo, limpo: list[str]) -> None:
    d = acervo.criar(tipo="poligono", nome=f"area-{uuid.uuid4().hex[:8]}", geometria=QUADRADO)
    limpo.append(d["id"])
    # ~0,01 grau de lado nesta latitude: da ordem de 1 km x 1,1 km.
    assert 900_000 < d["area_m2"] < 1_400_000


def test_atualizar_nao_toca_a_geometria(acervo: Acervo, limpo: list[str]) -> None:
    """Redesenhar tracado salvo ficou fora do MVP, e a fronteira e esta assinatura."""
    d = acervo.criar(tipo="ponto", nome=f"fixo-{uuid.uuid4().hex[:8]}", geometria=PONTO)
    limpo.append(d["id"])
    depois = acervo.atualizar(d["id"], {"nome": "outro", "geometria": QUADRADO, "tipo": "poligono"})
    assert depois["geometria"]["type"] == "Point"
    assert depois["tipo"] == "ponto"


def test_lista_pagina_e_filtra(acervo: Acervo, limpo: list[str]) -> None:
    marca = uuid.uuid4().hex[:8]
    for i in range(3):
        d = acervo.criar(
            tipo="ponto", nome=f"pag-{marca}-{i}", geometria=PONTO, categoria=f"cat-{marca}"
        )
        limpo.append(d["id"])

    pagina = acervo.listar(pagina=1, tamanho=2, categoria=f"cat-{marca}")
    assert pagina["total"] == 3
    assert len(pagina["itens"]) == 2

    segunda = acervo.listar(pagina=2, tamanho=2, categoria=f"cat-{marca}")
    assert len(segunda["itens"]) == 1
    assert {i["id"] for i in pagina["itens"]}.isdisjoint({i["id"] for i in segunda["itens"]})


def test_busca_ignora_acento_e_caixa(acervo: Acervo, limpo: list[str]) -> None:
    d = acervo.criar(tipo="ponto", nome=f"Regiao Sul {uuid.uuid4().hex[:6]}", geometria=PONTO)
    limpo.append(d["id"])
    achados = acervo.listar(busca="regiao sul")["itens"]
    assert any(i["id"] == d["id"] for i in achados)


def test_categorias_saem_do_proprio_acervo(acervo: Acervo, limpo: list[str]) -> None:
    marca = f"cat-{uuid.uuid4().hex[:8]}"
    d = acervo.criar(tipo="ponto", nome=f"c-{marca}", geometria=PONTO, categoria=marca)
    limpo.append(d["id"])
    assert marca in acervo.categorias()


def test_geometrias_devolve_featurecollection(acervo: Acervo, limpo: list[str]) -> None:
    d = acervo.criar(tipo="ponto", nome=f"fc-{uuid.uuid4().hex[:8]}", geometria=PONTO)
    limpo.append(d["id"])
    fc = acervo.geometrias()
    assert fc["type"] == "FeatureCollection"
    feicao = next(f for f in fc["features"] if f["id"] == str(d["id"]))
    assert feicao["geometry"]["type"] == "Point"
    assert feicao["properties"]["nome"] == d["nome"]


def test_geojson_sai_em_wgs84_e_sem_crs(acervo: Acervo, limpo: list[str]) -> None:
    """O RFC 7946 define GeoJSON como WGS84 e REMOVEU o campo `crs`.

    Sem o ST_Transform na saida, o ST_AsGeoJSON injeta {"crs": ...} sozinho sempre
    que o SRID nao e 4326 — e o MapLibre ignora esse campo em silencio, que e o pior
    modo de falhar: nada quebra, e o dado fica afirmando um datum que o consumidor
    nao le. Aconteceu de verdade em 2026-08-31, com o campo EPSG:4674 pendurado na
    resposta.
    """
    d = acervo.criar(tipo="ponto", nome=f"crs-{uuid.uuid4().hex[:8]}", geometria=PONTO)
    limpo.append(d["id"])
    assert "crs" not in d["geometria"]
    lon, lat = d["geometria"]["coordinates"]
    assert lon == pytest.approx(PONTO["coordinates"][0], abs=1e-6)
    assert lat == pytest.approx(PONTO["coordinates"][1], abs=1e-6)

    fc = acervo.geometrias()
    assert all("crs" not in f["geometry"] for f in fc["features"])


def test_wkb_por_nome(acervo: Acervo, limpo: list[str]) -> None:
    nome = f"wkb-{uuid.uuid4().hex[:8]}"
    d = acervo.criar(tipo="poligono", nome=nome, geometria=QUADRADO)
    limpo.append(d["id"])
    achado = acervo.wkb_por_nome(nome.upper())
    assert achado is not None
    assert isinstance(achado["wkb"], (bytes, memoryview))
    assert len(bytes(achado["wkb"])) > 0


def test_geometria_vazia_e_recusada(acervo: Acervo) -> None:
    with pytest.raises(DesenhoInvalido):
        acervo.criar(tipo="ponto", nome="x", geometria={"type": "Point", "coordinates": []})


def test_teto_de_vertices(acervo: Acervo) -> None:
    """O teto e de PAYLOAD, nao de geografia: 50 mil vertices, folga de 2,3x sobre o
    pior caso realista (o municipio de Sao Paulo tem 21.308)."""
    anel = [[-46.0 + i * 1e-6, -23.0] for i in range(50_001)]
    with pytest.raises(DesenhoInvalido, match="50000"):
        acervo.criar(
            tipo="poligono", nome="gigante", geometria={"type": "Polygon", "coordinates": [anel]}
        )


# --- AT-004: o isolamento -------------------------------------------------------


def test_papel_nao_alcanca_o_schema_do_vizinho(acervo: Acervo) -> None:
    """O teste que mais importa da fase 1.

    **Falha se vier lista vazia em vez de erro.** Zero linhas parece sucesso e nao e:
    seria o banco PERMITINDO a consulta e ainda nao havendo dado. O que se exige aqui
    e o Postgres recusando — isolamento que nao depende de a aplicacao lembrar de
    filtrar por cliente.
    """
    eu = os.getenv("CLIENTE", "geo-analytics")
    # Derivado, nao cravado: com um cliente 3 este teste continua valendo sozinho, e
    # nenhum id de cliente precisa morar aqui.
    outros = [c for c in clientes_disponiveis() if c != eu]
    if not outros:
        pytest.skip("so ha um cliente configurado; nao ha vizinho para tentar alcancar")
    vizinho = nome_do_schema(outros[0])
    outro = Acervo(dsn=acervo._dsn, schema=vizinho, con=acervo.con)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        outro.listar()


def test_papel_do_acervo_nao_le_o_geodata(acervo: Acervo) -> None:
    """O papel da aplicacao nao tem por que enxergar o banco central.

    Ele usa o `geo_reader` para isso, por outra conexao. Medido em 2026-08-31: o papel
    do acervo CONECTA no geodata (o Postgres da CONNECT a PUBLIC em todo banco), mas
    nao le nada — o schema `ibge` recusa. Este teste guarda a segunda metade, que e a
    que protege o dado; a primeira ficou anotada como achado para endurecer fora de
    uma feature, porque mexer em banco central em producao nao se faz de passagem.
    """
    dsn_geodata = acervo._dsn.rsplit("/", 1)[0] + "/geodata"
    try:
        con = psycopg.connect(dsn_geodata, connect_timeout=5)
    except psycopg.OperationalError:
        pytest.skip("o papel do acervo ja nao conecta no geodata — melhor ainda")
    with con, con.cursor() as cur, pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("select count(*) from ibge.municipio")
