"""Tools contra o GeoQuery real (geodata em PostGIS, como query/tests).

Os que tocam o banco exigem GEODATA_DSN e sao pulados sem ela, com a instrucao,
em vez de falharem com erro de conexao — o mesmo contrato de query/tests. A
guarda fica na fixture `ctx`, e nao no modulo, para que os testes offline (que
sao a maioria do valor em CI) continuem rodando. Antes dela a suite quebrava com
42 erros em qualquer ambiente sem o banco de pe, o CI incluso.
"""

from __future__ import annotations

import json
import os

import time
import uuid
from typing import Any

import pytest
from geo_query import GeoQuery

from geo_agent.acervo import Acervo, nome_do_schema

from geo_agent.tools import Contexto, TOOL_REGISTRY, execute_tool, normalize_uf, openai_tools

SETOR_FORTALEZA = "230440005130001"


@pytest.fixture(scope="module")
def ctx() -> Contexto:
    """O par de bancos que as tools alcançam. O acervo entra só onde o teste o pede.

    Sem acervo por padrão de propósito: é o ambiente da maioria das tools, e é também
    o caso que a §9 do ADR promete — o chat inteiro de pé sem o banco do cliente.
    """
    if not os.getenv("GEODATA_DSN"):
        pytest.skip("defina GEODATA_DSN para rodar contra o geodata (ver query/geo_query/db.py)")
    q = GeoQuery()
    yield Contexto(geodata=q)
    q.close()


def test_normalize_uf() -> None:
    assert normalize_uf("PR") == "Paraná"
    assert normalize_uf("sp") == "São Paulo"
    assert normalize_uf("Paraná") == "Paraná"
    assert normalize_uf(None) is None


def test_openai_tools_cobre_o_registry() -> None:
    specs = openai_tools()
    assert {s["function"]["name"] for s in specs} == set(TOOL_REGISTRY)
    assert all(s["function"]["description"] for s in specs)
    assert all("properties" in s["function"]["parameters"] for s in specs)


def test_listar_metricas(ctx: Contexto) -> None:
    r = execute_tool(ctx, "listar_metricas", "{}")
    assert not r.error
    campos = {m["campo"] for m in r.payload}
    assert "pop_total" in campos
    assert all(m["rotulo"] for m in r.payload)  # rotulo nunca vazio (fallback = campo)
    assert r.codigos == []  # tool de descoberta nao pinta o mapa


def test_buscar_municipio_resolve_nome(ctx: Contexto) -> None:
    r = execute_tool(ctx, "buscar_municipio", json.dumps({"nome": "curitiba", "uf": "PR"}))
    assert not r.error
    assert r.camada == "municipio" and r.codigos[0] == "4106902"


def test_info_municipio(ctx: Contexto) -> None:
    r = execute_tool(ctx, "info_municipio", json.dumps({"cd_mun": "3550308"}))
    assert not r.error and r.payload["nm_mun"] == "São Paulo"
    assert r.codigos == ["3550308"]


def test_info_municipio_inexistente(ctx: Contexto) -> None:
    r = execute_tool(ctx, "info_municipio", json.dumps({"cd_mun": "0000000"}))
    assert r.error and "não encontrado" in r.payload["erro"]


def test_info_setor(ctx: Contexto) -> None:
    r = execute_tool(ctx, "info_setor", json.dumps({"cd_setor": SETOR_FORTALEZA}))
    assert not r.error and r.camada == "setor" and r.codigos == [SETOR_FORTALEZA]


def test_ranking_com_sigla_de_uf(ctx: Contexto) -> None:
    r = execute_tool(
        ctx, "ranking_municipios", json.dumps({"metrica": "pop_total", "uf": "CE", "n": 1})
    )
    assert not r.error
    assert r.rows is not None and r.rows[0]["nm_mun"] == "Fortaleza"
    assert r.codigos == ["2304400"]


def test_ranking_metrica_invalida_vira_erro_para_o_llm(ctx: Contexto) -> None:
    r = execute_tool(ctx, "ranking_municipios", json.dumps({"metrica": "pib_percapita"}))
    assert r.error and "pop_total" in r.payload["erro"]  # lista as validas p/ autocorrecao


def test_setores_proximos(ctx: Contexto) -> None:
    r = execute_tool(
        ctx, "setores_proximos", json.dumps({"cd_setor": SETOR_FORTALEZA, "raio_km": 2})
    )
    assert not r.error and r.camada == "setor" and len(r.codigos) >= 1


def test_setores_no_ponto(ctx: Contexto) -> None:
    alvo = ctx.geodata.setor(SETOR_FORTALEZA)
    assert alvo is not None
    r = execute_tool(
        ctx, "setores_no_ponto", json.dumps({"lon": alvo["lon"], "lat": alvo["lat"], "raio_km": 2})
    )
    assert not r.error and SETOR_FORTALEZA in r.codigos


def test_tool_desconhecida(ctx: Contexto) -> None:
    r = execute_tool(ctx, "consulta_sql", "{}")
    assert r.error and "desconhecida" in r.payload["erro"]


def test_args_invalidos(ctx: Contexto) -> None:
    r = execute_tool(ctx, "ranking_municipios", json.dumps({"metrica": "pop_total", "n": 0}))
    assert r.error and r.payload["erro"] == "argumentos inválidos"


# --- bairro (tools acrescentadas em 2026-08-20) -------------------------------

BAIRRO_COPACABANA = "3304557018"
CD_MUN_RIO = "3304557"


def test_listar_metricas_aceita_bairro(ctx: Contexto) -> None:
    r = execute_tool(ctx, "listar_metricas", json.dumps({"nivel": "bairro"}))
    assert not r.error
    assert "pop_total" in {m["campo"] for m in r.payload}


def test_info_local_pinta_a_camada_bairro(ctx: Contexto) -> None:
    """O defeito de origem era o mapa nao ter como pintar bairro: camada e codigos juntos."""
    r = execute_tool(
        ctx, "info_local", json.dumps({"nome": "Copacabana", "municipio": "Rio de Janeiro"})
    )
    assert not r.error
    assert r.camada == "bairro"
    assert r.codigos == [BAIRRO_COPACABANA]


def test_info_bairro(ctx: Contexto) -> None:
    r = execute_tool(ctx, "info_bairro", json.dumps({"cd_bairro": BAIRRO_COPACABANA}))
    assert not r.error
    assert r.payload["nm_bairro"] == "Copacabana"
    assert r.payload["pop_total"] > 100_000
    assert r.camada == "bairro"


def test_info_bairro_codigo_inexistente_vira_erro_legivel(ctx: Contexto) -> None:
    r = execute_tool(ctx, "info_bairro", json.dumps({"cd_bairro": "0000000000"}))
    assert r.error
    assert "não encontrado" in r.payload["erro"]


def test_ranking_bairros(ctx: Contexto) -> None:
    r = execute_tool(
        ctx, "ranking_bairros", json.dumps({"metrica": "pop_total", "cd_mun": CD_MUN_RIO, "n": 5})
    )
    assert not r.error
    assert r.camada == "bairro"
    assert len(r.codigos) == 5


def test_bairro_que_contem(ctx: Contexto) -> None:
    r = execute_tool(ctx, "bairro_que_contem", json.dumps({"lon": -43.18758, "lat": -22.97075}))
    assert not r.error
    assert r.payload["nm_bairro"] == "Copacabana"


def test_bairro_que_contem_fora_da_malha_explica_o_motivo(ctx: Contexto) -> None:
    """Erro que ensina: o LLM precisa saber que e cobertura da malha, nao falha de consulta."""
    r = execute_tool(ctx, "bairro_que_contem", json.dumps({"lon": -63.0, "lat": -4.0}))
    assert r.error
    assert "área urbana" in r.payload["motivo"]


def test_metrica_invalida_lista_as_validas(ctx: Contexto) -> None:
    r = execute_tool(
        ctx, "ranking_bairros", json.dumps({"metrica": "pib_per_capita", "cd_mun": CD_MUN_RIO})
    )
    assert r.error
    assert "pop_total" in r.payload["erro"]


# --- distrito (tools acrescentadas em 2026-08-22) -----------------------------

DIST_SE_SP = "355030878"
CD_MUN_SP = "3550308"


def test_listar_metricas_aceita_distrito(ctx: Contexto) -> None:
    r = execute_tool(ctx, "listar_metricas", json.dumps({"nivel": "distrito"}))
    assert not r.error
    assert "pop_total" in {m["campo"] for m in r.payload}


def test_info_local_pinta_a_camada_distrito(ctx: Contexto) -> None:
    """Mesma regra do bairro: sem camada e codigos juntos, a resposta vem certa e o
    mapa nao acende (ADR-0001, §6.7)."""
    r = execute_tool(ctx, "info_local", json.dumps({"nome": "Sé", "municipio": "São Paulo"}))
    assert not r.error
    assert r.camada == "distrito"
    assert r.codigos == [DIST_SE_SP]


def test_info_distrito(ctx: Contexto) -> None:
    r = execute_tool(ctx, "info_distrito", json.dumps({"cd_distrito": DIST_SE_SP}))
    assert not r.error
    assert r.payload["nm_distrito"] == "Sé"
    assert r.payload["nm_mun"] == "São Paulo"
    assert r.camada == "distrito"


def test_info_distrito_codigo_inexistente_vira_erro_legivel(ctx: Contexto) -> None:
    r = execute_tool(ctx, "info_distrito", json.dumps({"cd_distrito": "000000000"}))
    assert r.error
    assert "não encontrado" in r.payload["erro"]


def test_ranking_distritos(ctx: Contexto) -> None:
    r = execute_tool(
        ctx, "ranking_distritos", json.dumps({"metrica": "pop_total", "cd_mun": CD_MUN_SP, "n": 5})
    )
    assert not r.error
    assert r.camada == "distrito"
    assert len(r.codigos) == 5


def test_distrito_que_contem(ctx: Contexto) -> None:
    r = execute_tool(ctx, "distrito_que_contem", json.dumps({"lon": -46.6314, "lat": -23.5475}))
    assert not r.error
    assert r.payload["nm_distrito"] == "Sé"


def test_distrito_responde_onde_bairro_recusa(ctx: Contexto) -> None:
    """O par que o prompt oferece na regra 3b: no meio do Amazonas bairro nao tem
    resposta e distrito tem. Sem esta tool o agente so podia dizer que nao sabe."""
    ponto = json.dumps({"lon": -63.0, "lat": -4.0})
    assert execute_tool(ctx, "bairro_que_contem", ponto).error
    r = execute_tool(ctx, "distrito_que_contem", ponto)
    assert not r.error
    assert r.payload["nm_mun"] == "Coari"


# --- info_local: a cascata bairro -> distrito -> localizacao (2026-08-22) ------


def test_info_local_bairro_direto_nao_avisa_nada_de_nivel(ctx: Contexto) -> None:
    """Copacabana e bairro de verdade: nada a avisar sobre o NIVEL do dado.

    A asserção é sobre conteúdo, não sobre contagem. Ela já foi `avisos == []` e
    quebrou quando a classe social passou a avisar que é estimativa (2026-08-27) —
    um aviso legítimo, que não tem nada a ver com o que este teste protege.
    """
    r = execute_tool(
        ctx, "info_local", json.dumps({"nome": "Copacabana", "municipio": "Rio de Janeiro"})
    )
    assert not r.error
    assert r.payload["nivel"] == "bairro"
    assert not any(
        "não existe como bairro" in a or "município inteiro" in a for a in r.payload["avisos"]
    )
    assert r.camada == "bairro"


def test_info_local_avisa_que_classe_social_e_estimativa(ctx: Contexto) -> None:
    """Regra 8 do ADR-0001: o que muda o sentido do número sai da tool, não do prompt.

    Um número de classe social lido como se o IBGE o tivesse publicado é o pior
    defeito possível deste produto — o IBGE não divulga classe social. Deixar a
    ressalva por conta de uma instrução num prompt longo é deixá-la cair no dia em
    que o contexto encher.
    """
    r = execute_tool(
        ctx, "info_local", json.dumps({"nome": "Leblon", "municipio": "Rio de Janeiro"})
    )
    assert not r.error
    assert r.payload["dados"]["classe_social_score"] is not None
    assert any("ESTIMATIVA NOSSA" in a and "IBGE" in a for a in r.payload["avisos"])


def test_info_local_cai_para_distrito_e_avisa(ctx: Contexto) -> None:
    """São Paulo não tem malha de bairro: Moema só existe como distrito, e a resposta
    tem de dizer isso — é o dado saindo de um nível diferente do que foi pedido."""
    r = execute_tool(ctx, "info_local", json.dumps({"nome": "Moema", "municipio": "São Paulo"}))
    assert not r.error
    assert r.payload["nivel"] == "distrito"
    assert r.camada == "distrito"
    assert any("não existe como bairro" in a for a in r.payload["avisos"])


def test_info_local_avisa_quando_o_distrito_e_o_municipio_inteiro(ctx: Contexto) -> None:
    """Dois avisos: o fallback de nível E a distorção. Sem o segundo, a renda do
    'distrito de Curitiba' passa por recorte de bairro sendo a cidade toda."""
    r = execute_tool(ctx, "info_local", json.dumps({"nome": "Curitiba", "municipio": "Curitiba"}))
    assert not r.error
    assert r.payload["nivel"] == "distrito"
    # Os DOIS avisos de nível, por conteúdo. Contar avisos amarraria este teste a
    # quantos avisos existem no total, e a classe social já acrescentou o dela.
    assert any("não existe como bairro" in a for a in r.payload["avisos"])
    assert any("município inteiro" in a for a in r.payload["avisos"])


def test_info_local_nome_exato_ganha_de_substring_de_outro_nivel(ctx: Contexto) -> None:
    """Defeito medido em 2026-08-22: encadear 'bairro completo, depois distrito'
    fazia 'Curitiba' parar no bairro 'Cidade Industrial de Curitiba'."""
    r = execute_tool(ctx, "info_local", json.dumps({"nome": "Curitiba", "municipio": "Curitiba"}))
    assert r.payload["dados"]["nm_distrito"] == "Curitiba"


def test_info_local_nome_inexistente_nao_inventa(ctx: Contexto) -> None:
    r = execute_tool(
        ctx, "info_local", json.dumps({"nome": "Bairro do Xyzabc", "municipio": "Curitiba"})
    )
    assert r.error
    assert "não encontrei" in r.payload["erro"]


def test_info_local_recusa_ponto_fora_do_municipio_pedido(ctx: Contexto, monkeypatch) -> None:
    """O defeito que teria dado resposta errada com cara de certeza.

    Medido em 2026-08-22: "Vila Nova Conceição, São Paulo" voltava do Nominatim como
    Vila Conceição, em LARANJAL PAULISTA, porque ele leu "São Paulo" como estado. Sem
    confinar ao município, o agente responderia renda de 2.984 reais (interior) para
    quem perguntou de um bairro da capital. O PostGIS é o juiz: candidato que não cai
    dentro do município pedido não vale, e a tool erra em vez de inventar.
    """
    from geo_agent import tools

    monkeypatch.setattr(tools, "geocode_pontos", lambda termo, limite=5: [(-47.8327, -23.0503)])
    r = execute_tool(
        ctx, "info_local", json.dumps({"nome": "Vila Nova Conceição", "municipio": "São Paulo"})
    )
    assert r.error
    assert "dentro de São Paulo" in r.payload["erro"]


def test_info_local_aceita_ponto_dentro_do_municipio(ctx: Contexto, monkeypatch) -> None:
    """O outro lado: candidato dentro do município vira o recorte que o contém.
    Vila Madalena não é recorte do IBGE; o distrito que a contém é Pinheiros."""
    from geo_agent import tools

    monkeypatch.setattr(tools, "geocode_pontos", lambda termo, limite=5: [(-46.6900, -23.5460)])
    r = execute_tool(
        ctx, "info_local", json.dumps({"nome": "Vila Madalena", "municipio": "São Paulo"})
    )
    assert not r.error
    assert r.payload["dados"]["nm_mun"] == "São Paulo"
    assert any("não é um recorte oficial do IBGE" in a for a in r.payload["avisos"])


# --- a area desenhada (DESENHO_NO_MAPA, fase 4) -------------------------------


@pytest.fixture(scope="module")
def ctx_com_acervo(ctx: Contexto) -> Contexto:
    """O par completo: geodata para agregar, acervo para achar a geometria."""
    dsn = os.getenv("ACERVO_DSN")
    if not dsn:
        pytest.skip("defina ACERVO_DSN para rodar contra o app_clientes (ver acervo.py)")
    a = Acervo(dsn=dsn, schema=nome_do_schema(os.getenv("CLIENTE", "geo-analytics")))
    yield Contexto(geodata=ctx.geodata, acervo=a)
    a.con.close()


@pytest.fixture(scope="module")
def desenho_de_sp(ctx_com_acervo: Contexto):
    """O municipio de Sao Paulo salvo COMO DESENHO, que e o gabarito do AT-005.

    E o unico recorte de que se sabe, por outro caminho, quanta gente mora dentro —
    e ao mesmo tempo o pior caso realista de um KML: 21.308 vertices.
    """
    geometria = ctx_com_acervo.geodata._rows(
        "select ST_AsGeoJSON(ST_Transform(geom, 4326))::json as g "
        "from ibge.municipio where cod_municipio = %s",
        ["3550308"],
    )[0]["g"]
    nome = f"teste-area-{uuid.uuid4().hex[:8]}"
    d = ctx_com_acervo.acervo.criar(tipo="poligono", nome=nome, geometria=geometria)
    yield d
    ctx_com_acervo.acervo.apagar(d["id"])


def test_area_desenhada_confere_com_o_municipio(
    ctx_com_acervo: Contexto, desenho_de_sp: dict[str, Any]
) -> None:
    """AT-005 pelo caminho inteiro: acervo -> WKB -> geodata, atravessando dois bancos."""
    r = execute_tool(
        ctx_com_acervo,
        "info_area_desenhada",
        json.dumps({"nome": desenho_de_sp["nome"], "metricas": ["pop_total"]}),
    )
    assert not r.error
    oficial = float(ctx_com_acervo.geodata.municipio("3550308")["pop_total"])
    obtida = float(r.payload["dados"]["pop_total"])
    assert abs(obtida - oficial) / oficial <= 0.005


def test_aviso_de_borda_vem_como_dado(
    ctx_com_acervo: Contexto, desenho_de_sp: dict[str, Any]
) -> None:
    """AT-007. Inspeciona a ROW, e nao a prosa — a distincao e o teste inteiro.

    Um teste que procurasse a ressalva no texto do LLM passaria enquanto o modelo
    estivesse bem-humorado e falharia numa troca de versao, sem nada ter quebrado. O
    que a regra 8 do ADR exige e que o aviso EXISTA antes de qualquer texto: os campos
    `parciais` e `pop_de_rateio` saem da consulta, e o aviso e montado deles.
    """
    r = execute_tool(
        ctx_com_acervo, "info_area_desenhada", json.dumps({"nome": desenho_de_sp["nome"]})
    )
    assert not r.error
    dados = r.payload["dados"]
    assert dados["parciais"] > 0
    assert dados["pop_de_rateio"] > 0
    assert any("rateio" in a for a in r.payload["avisos"])


def test_area_pequena_o_aviso_de_borda_pesa_mais(ctx_com_acervo: Contexto) -> None:
    """A borda domina em area pequena, e o aviso tem de dizer isso — 500 m, nao 50 km.

    E o caso que o gabarito do municipio nao alcanca: la os parciais sao 3% do total,
    aqui sao a maioria dos setores.
    """
    circulo = ctx_com_acervo.geodata._rows(
        """
        select ST_AsGeoJSON(ST_Transform(
            ST_Buffer(ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4674)::geography, 500)::geometry,
            4326))::json as g
        """,
        [],
    )[0]["g"]
    nome = f"teste-buffer-{uuid.uuid4().hex[:8]}"
    d = ctx_com_acervo.acervo.criar(tipo="poligono", nome=nome, geometria=circulo)
    try:
        r = execute_tool(ctx_com_acervo, "info_area_desenhada", json.dumps({"nome": nome}))
        dados = r.payload["dados"]
        assert dados["parciais"] / dados["setores"] > 0.5
        assert r.payload["avisos"]
    finally:
        ctx_com_acervo.acervo.apagar(d["id"])


def test_desenho_inexistente_lista_os_que_existem(
    ctx_com_acervo: Contexto, desenho_de_sp: dict[str, Any]
) -> None:
    """Nao inventar recorte parecido: o loop do agente da uma chance de autocorrecao,
    e ela so serve se a recusa disser quais nomes existem."""
    r = execute_tool(
        ctx_com_acervo, "info_area_desenhada", json.dumps({"nome": "area que ninguem desenhou"})
    )
    assert r.error
    assert desenho_de_sp["nome"] in r.payload["existem"]


def test_sem_acervo_a_tool_recusa_e_o_resto_do_chat_segue(ctx: Contexto) -> None:
    """A §9 do ADR na camada das tools: sem o banco do cliente, cai UMA tool, nao o chat.

    O `ctx` desta fixture nao tem acervo de proposito — e o ambiente de quem sobe o
    agente sem ACERVO_DSN, que e o padrao.
    """
    assert ctx.acervo is None
    r = execute_tool(ctx, "info_area_desenhada", json.dumps({"nome": "qualquer"}))
    assert r.error
    assert "acervo" in r.payload["erro"]
    # E as outras seguem respondendo no mesmo contexto.
    assert not execute_tool(ctx, "info_municipio", json.dumps({"cd_mun": "3550308"})).error


def test_area_desenhada_nao_pinta_destaque(
    ctx_com_acervo: Contexto, desenho_de_sp: dict[str, Any]
) -> None:
    """O desenho ja esta na tela, na cor do cliente. Pintar os 27 mil setores de dentro
    cobriria justamente o recorte sobre o qual se perguntou."""
    r = execute_tool(
        ctx_com_acervo, "info_area_desenhada", json.dumps({"nome": desenho_de_sp["nome"]})
    )
    assert r.camada is None and r.codigos == []


def test_area_enorme_responde_com_aviso_em_vez_de_recusar(ctx_com_acervo: Contexto) -> None:
    """AT-008. Sem limite de extensao: o teto e de payload, nao de geografia (Decisao 4).

    Um circulo de 50 km sobre a Grande Sao Paulo toca ~49 mil setores e 21 milhoes de
    pessoas. A resposta certa nao e "area grande demais" — e o numero, com a extensao
    declarada, para quem desenhou poder ver que pediu mais do que queria.
    """
    circulo = ctx_com_acervo.geodata._rows(
        """
        select ST_AsGeoJSON(ST_Transform(
            ST_Buffer(ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4674)::geography, 50000)::geometry,
            4326))::json as g
        """,
        [],
    )[0]["g"]
    nome = f"teste-enorme-{uuid.uuid4().hex[:8]}"
    d = ctx_com_acervo.acervo.criar(tipo="poligono", nome=nome, geometria=circulo)
    try:
        t = time.monotonic()
        r = execute_tool(ctx_com_acervo, "info_area_desenhada", json.dumps({"nome": nome}))
        decorrido = time.monotonic() - t
    finally:
        ctx_com_acervo.acervo.apagar(d["id"])

    assert not r.error
    assert r.payload["dados"]["setores"] > 40_000
    assert any("extensa" in a for a in r.payload["avisos"])
    # O teto do AT-008. Medido em 2026-09-01 nesta maquina: 640 ms com cache quente.
    # Na VPS ainda nao foi medido (A-001) — este numero e o piso do que la precisa dar.
    assert decorrido < 3.0


def test_area_menor_que_um_setor_avisa_que_o_numero_e_uma_divisao(
    ctx_com_acervo: Contexto,
) -> None:
    """O caso que so o dado real mostrou, em 2026-09-02.

    As duas primeiras areas de cliente que entraram eram LOTES — 0,7 ha e 2,4 ha —, e
    cada uma cabia inteira dentro de um unico setor censitario. Dizer "corta 1 setor ao
    meio" ali e falso na forma, e esconde o que importa: o numero e a populacao daquele
    setor multiplicada pela fracao de area, e mais nada. Num bairro a premissa de
    distribuicao uniforme se dilui entre centenas de setores; num lote ela responde por
    100% do resultado.
    """
    lote = ctx_com_acervo.geodata._rows(
        """
        -- Um quadrado de ~100 m dentro de um setor urbano povoado: a forma de um lote.
        with s as (
            select geom from ibge.setor_censitario
            where cod_setor = (select cod_setor from ibge_tabular.setor_resumo
                               where pop_total > 300 order by cod_setor limit 1)
        )
        select ST_AsGeoJSON(ST_Transform(
            ST_Buffer(ST_PointOnSurface(geom)::geography, 50)::geometry, 4326))::json as g
        from s
        """,
        [],
    )[0]["g"]
    nome = f"teste-lote-{uuid.uuid4().hex[:8]}"
    d = ctx_com_acervo.acervo.criar(tipo="poligono", nome=nome, geometria=lote)
    try:
        r = execute_tool(ctx_com_acervo, "info_area_desenhada", json.dumps({"nome": nome}))
    finally:
        ctx_com_acervo.acervo.apagar(d["id"])

    assert not r.error
    assert r.payload["dados"]["setores"] == 1
    aviso = " ".join(r.payload["avisos"])
    assert "UM setor" in aviso
    # O que NAO pode aparecer: a linguagem de agregacao, que descreveria mal um lote.
    assert "corta" not in aviso
    assert "ordem de grandeza" in aviso
