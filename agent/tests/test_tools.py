"""Tools contra o GeoQuery real (geodata em PostGIS, como query/tests).

Os que tocam o banco exigem GEODATA_DSN e sao pulados sem ela, com a instrucao,
em vez de falharem com erro de conexao — o mesmo contrato de query/tests. A
guarda fica na fixture `gq`, e nao no modulo, para que os testes offline (que
sao a maioria do valor em CI) continuem rodando. Antes dela a suite quebrava com
42 erros em qualquer ambiente sem o banco de pe, o CI incluso.
"""

from __future__ import annotations

import json
import os

import pytest
from geo_query import GeoQuery

from geo_agent.tools import TOOL_REGISTRY, execute_tool, normalize_uf, openai_tools

SETOR_FORTALEZA = "230440005130001"


@pytest.fixture(scope="module")
def gq() -> GeoQuery:
    if not os.getenv("GEODATA_DSN"):
        pytest.skip("defina GEODATA_DSN para rodar contra o geodata (ver query/geo_query/db.py)")
    q = GeoQuery()
    yield q
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


def test_listar_metricas(gq: GeoQuery) -> None:
    r = execute_tool(gq, "listar_metricas", "{}")
    assert not r.error
    campos = {m["campo"] for m in r.payload}
    assert "pop_total" in campos
    assert all(m["rotulo"] for m in r.payload)  # rotulo nunca vazio (fallback = campo)
    assert r.codigos == []  # tool de descoberta nao pinta o mapa


def test_buscar_municipio_resolve_nome(gq: GeoQuery) -> None:
    r = execute_tool(gq, "buscar_municipio", json.dumps({"nome": "curitiba", "uf": "PR"}))
    assert not r.error
    assert r.camada == "municipio" and r.codigos[0] == "4106902"


def test_info_municipio(gq: GeoQuery) -> None:
    r = execute_tool(gq, "info_municipio", json.dumps({"cd_mun": "3550308"}))
    assert not r.error and r.payload["nm_mun"] == "São Paulo"
    assert r.codigos == ["3550308"]


def test_info_municipio_inexistente(gq: GeoQuery) -> None:
    r = execute_tool(gq, "info_municipio", json.dumps({"cd_mun": "0000000"}))
    assert r.error and "não encontrado" in r.payload["erro"]


def test_info_setor(gq: GeoQuery) -> None:
    r = execute_tool(gq, "info_setor", json.dumps({"cd_setor": SETOR_FORTALEZA}))
    assert not r.error and r.camada == "setor" and r.codigos == [SETOR_FORTALEZA]


def test_ranking_com_sigla_de_uf(gq: GeoQuery) -> None:
    r = execute_tool(
        gq, "ranking_municipios", json.dumps({"metrica": "pop_total", "uf": "CE", "n": 1})
    )
    assert not r.error
    assert r.rows is not None and r.rows[0]["nm_mun"] == "Fortaleza"
    assert r.codigos == ["2304400"]


def test_ranking_metrica_invalida_vira_erro_para_o_llm(gq: GeoQuery) -> None:
    r = execute_tool(gq, "ranking_municipios", json.dumps({"metrica": "pib_percapita"}))
    assert r.error and "pop_total" in r.payload["erro"]  # lista as validas p/ autocorrecao


def test_setores_proximos(gq: GeoQuery) -> None:
    r = execute_tool(
        gq, "setores_proximos", json.dumps({"cd_setor": SETOR_FORTALEZA, "raio_km": 2})
    )
    assert not r.error and r.camada == "setor" and len(r.codigos) >= 1


def test_setores_no_ponto(gq: GeoQuery) -> None:
    alvo = gq.setor(SETOR_FORTALEZA)
    assert alvo is not None
    r = execute_tool(
        gq, "setores_no_ponto", json.dumps({"lon": alvo["lon"], "lat": alvo["lat"], "raio_km": 2})
    )
    assert not r.error and SETOR_FORTALEZA in r.codigos


def test_tool_desconhecida(gq: GeoQuery) -> None:
    r = execute_tool(gq, "consulta_sql", "{}")
    assert r.error and "desconhecida" in r.payload["erro"]


def test_args_invalidos(gq: GeoQuery) -> None:
    r = execute_tool(gq, "ranking_municipios", json.dumps({"metrica": "pop_total", "n": 0}))
    assert r.error and r.payload["erro"] == "argumentos inválidos"


# --- bairro (tools acrescentadas em 2026-08-20) -------------------------------

BAIRRO_COPACABANA = "3304557018"
CD_MUN_RIO = "3304557"


def test_listar_metricas_aceita_bairro(gq: GeoQuery) -> None:
    r = execute_tool(gq, "listar_metricas", json.dumps({"nivel": "bairro"}))
    assert not r.error
    assert "pop_total" in {m["campo"] for m in r.payload}


def test_info_local_pinta_a_camada_bairro(gq: GeoQuery) -> None:
    """O defeito de origem era o mapa nao ter como pintar bairro: camada e codigos juntos."""
    r = execute_tool(
        gq, "info_local", json.dumps({"nome": "Copacabana", "municipio": "Rio de Janeiro"})
    )
    assert not r.error
    assert r.camada == "bairro"
    assert r.codigos == [BAIRRO_COPACABANA]


def test_info_bairro(gq: GeoQuery) -> None:
    r = execute_tool(gq, "info_bairro", json.dumps({"cd_bairro": BAIRRO_COPACABANA}))
    assert not r.error
    assert r.payload["nm_bairro"] == "Copacabana"
    assert r.payload["pop_total"] > 100_000
    assert r.camada == "bairro"


def test_info_bairro_codigo_inexistente_vira_erro_legivel(gq: GeoQuery) -> None:
    r = execute_tool(gq, "info_bairro", json.dumps({"cd_bairro": "0000000000"}))
    assert r.error
    assert "não encontrado" in r.payload["erro"]


def test_ranking_bairros(gq: GeoQuery) -> None:
    r = execute_tool(
        gq, "ranking_bairros", json.dumps({"metrica": "pop_total", "cd_mun": CD_MUN_RIO, "n": 5})
    )
    assert not r.error
    assert r.camada == "bairro"
    assert len(r.codigos) == 5


def test_bairro_que_contem(gq: GeoQuery) -> None:
    r = execute_tool(gq, "bairro_que_contem", json.dumps({"lon": -43.18758, "lat": -22.97075}))
    assert not r.error
    assert r.payload["nm_bairro"] == "Copacabana"


def test_bairro_que_contem_fora_da_malha_explica_o_motivo(gq: GeoQuery) -> None:
    """Erro que ensina: o LLM precisa saber que e cobertura da malha, nao falha de consulta."""
    r = execute_tool(gq, "bairro_que_contem", json.dumps({"lon": -63.0, "lat": -4.0}))
    assert r.error
    assert "área urbana" in r.payload["motivo"]


def test_metrica_invalida_lista_as_validas(gq: GeoQuery) -> None:
    r = execute_tool(
        gq, "ranking_bairros", json.dumps({"metrica": "pib_per_capita", "cd_mun": CD_MUN_RIO})
    )
    assert r.error
    assert "pop_total" in r.payload["erro"]


# --- distrito (tools acrescentadas em 2026-08-22) -----------------------------

DIST_SE_SP = "355030878"
CD_MUN_SP = "3550308"


def test_listar_metricas_aceita_distrito(gq: GeoQuery) -> None:
    r = execute_tool(gq, "listar_metricas", json.dumps({"nivel": "distrito"}))
    assert not r.error
    assert "pop_total" in {m["campo"] for m in r.payload}


def test_info_local_pinta_a_camada_distrito(gq: GeoQuery) -> None:
    """Mesma regra do bairro: sem camada e codigos juntos, a resposta vem certa e o
    mapa nao acende (ADR-0001, §6.7)."""
    r = execute_tool(
        gq, "info_local", json.dumps({"nome": "Sé", "municipio": "São Paulo"})
    )
    assert not r.error
    assert r.camada == "distrito"
    assert r.codigos == [DIST_SE_SP]


def test_info_distrito(gq: GeoQuery) -> None:
    r = execute_tool(gq, "info_distrito", json.dumps({"cd_distrito": DIST_SE_SP}))
    assert not r.error
    assert r.payload["nm_distrito"] == "Sé"
    assert r.payload["nm_mun"] == "São Paulo"
    assert r.camada == "distrito"


def test_info_distrito_codigo_inexistente_vira_erro_legivel(gq: GeoQuery) -> None:
    r = execute_tool(gq, "info_distrito", json.dumps({"cd_distrito": "000000000"}))
    assert r.error
    assert "não encontrado" in r.payload["erro"]


def test_ranking_distritos(gq: GeoQuery) -> None:
    r = execute_tool(
        gq, "ranking_distritos", json.dumps({"metrica": "pop_total", "cd_mun": CD_MUN_SP, "n": 5})
    )
    assert not r.error
    assert r.camada == "distrito"
    assert len(r.codigos) == 5


def test_distrito_que_contem(gq: GeoQuery) -> None:
    r = execute_tool(gq, "distrito_que_contem", json.dumps({"lon": -46.6314, "lat": -23.5475}))
    assert not r.error
    assert r.payload["nm_distrito"] == "Sé"


def test_distrito_responde_onde_bairro_recusa(gq: GeoQuery) -> None:
    """O par que o prompt oferece na regra 3b: no meio do Amazonas bairro nao tem
    resposta e distrito tem. Sem esta tool o agente so podia dizer que nao sabe."""
    ponto = json.dumps({"lon": -63.0, "lat": -4.0})
    assert execute_tool(gq, "bairro_que_contem", ponto).error
    r = execute_tool(gq, "distrito_que_contem", ponto)
    assert not r.error
    assert r.payload["nm_mun"] == "Coari"


# --- info_local: a cascata bairro -> distrito -> localizacao (2026-08-22) ------


def test_info_local_bairro_direto_nao_avisa_nada_de_nivel(gq: GeoQuery) -> None:
    """Copacabana e bairro de verdade: nada a avisar sobre o NIVEL do dado.

    A asserção é sobre conteúdo, não sobre contagem. Ela já foi `avisos == []` e
    quebrou quando a classe social passou a avisar que é estimativa (2026-08-27) —
    um aviso legítimo, que não tem nada a ver com o que este teste protege.
    """
    r = execute_tool(gq, "info_local", json.dumps({"nome": "Copacabana", "municipio": "Rio de Janeiro"}))
    assert not r.error
    assert r.payload["nivel"] == "bairro"
    assert not any(
        "não existe como bairro" in a or "município inteiro" in a
        for a in r.payload["avisos"]
    )
    assert r.camada == "bairro"


def test_info_local_avisa_que_classe_social_e_estimativa(gq: GeoQuery) -> None:
    """Regra 8 do ADR-0001: o que muda o sentido do número sai da tool, não do prompt.

    Um número de classe social lido como se o IBGE o tivesse publicado é o pior
    defeito possível deste produto — o IBGE não divulga classe social. Deixar a
    ressalva por conta de uma instrução num prompt longo é deixá-la cair no dia em
    que o contexto encher.
    """
    r = execute_tool(gq, "info_local", json.dumps({"nome": "Leblon", "municipio": "Rio de Janeiro"}))
    assert not r.error
    assert r.payload["dados"]["classe_social_score"] is not None
    assert any("ESTIMATIVA NOSSA" in a and "IBGE" in a for a in r.payload["avisos"])


def test_info_local_cai_para_distrito_e_avisa(gq: GeoQuery) -> None:
    """São Paulo não tem malha de bairro: Moema só existe como distrito, e a resposta
    tem de dizer isso — é o dado saindo de um nível diferente do que foi pedido."""
    r = execute_tool(gq, "info_local", json.dumps({"nome": "Moema", "municipio": "São Paulo"}))
    assert not r.error
    assert r.payload["nivel"] == "distrito"
    assert r.camada == "distrito"
    assert any("não existe como bairro" in a for a in r.payload["avisos"])


def test_info_local_avisa_quando_o_distrito_e_o_municipio_inteiro(gq: GeoQuery) -> None:
    """Dois avisos: o fallback de nível E a distorção. Sem o segundo, a renda do
    'distrito de Curitiba' passa por recorte de bairro sendo a cidade toda."""
    r = execute_tool(gq, "info_local", json.dumps({"nome": "Curitiba", "municipio": "Curitiba"}))
    assert not r.error
    assert r.payload["nivel"] == "distrito"
    # Os DOIS avisos de nível, por conteúdo. Contar avisos amarraria este teste a
    # quantos avisos existem no total, e a classe social já acrescentou o dela.
    assert any("não existe como bairro" in a for a in r.payload["avisos"])
    assert any("município inteiro" in a for a in r.payload["avisos"])


def test_info_local_nome_exato_ganha_de_substring_de_outro_nivel(gq: GeoQuery) -> None:
    """Defeito medido em 2026-08-22: encadear 'bairro completo, depois distrito'
    fazia 'Curitiba' parar no bairro 'Cidade Industrial de Curitiba'."""
    r = execute_tool(gq, "info_local", json.dumps({"nome": "Curitiba", "municipio": "Curitiba"}))
    assert r.payload["dados"]["nm_distrito"] == "Curitiba"


def test_info_local_nome_inexistente_nao_inventa(gq: GeoQuery) -> None:
    r = execute_tool(gq, "info_local", json.dumps({"nome": "Bairro do Xyzabc", "municipio": "Curitiba"}))
    assert r.error
    assert "não encontrei" in r.payload["erro"]


def test_info_local_recusa_ponto_fora_do_municipio_pedido(gq: GeoQuery, monkeypatch) -> None:
    """O defeito que teria dado resposta errada com cara de certeza.

    Medido em 2026-08-22: "Vila Nova Conceição, São Paulo" voltava do Nominatim como
    Vila Conceição, em LARANJAL PAULISTA, porque ele leu "São Paulo" como estado. Sem
    confinar ao município, o agente responderia renda de 2.984 reais (interior) para
    quem perguntou de um bairro da capital. O PostGIS é o juiz: candidato que não cai
    dentro do município pedido não vale, e a tool erra em vez de inventar.
    """
    from geo_agent import tools

    monkeypatch.setattr(tools, "geocode_pontos", lambda termo, limite=5: [(-47.8327, -23.0503)])
    r = execute_tool(gq, "info_local", json.dumps({"nome": "Vila Nova Conceição", "municipio": "São Paulo"}))
    assert r.error
    assert "dentro de São Paulo" in r.payload["erro"]


def test_info_local_aceita_ponto_dentro_do_municipio(gq: GeoQuery, monkeypatch) -> None:
    """O outro lado: candidato dentro do município vira o recorte que o contém.
    Vila Madalena não é recorte do IBGE; o distrito que a contém é Pinheiros."""
    from geo_agent import tools

    monkeypatch.setattr(tools, "geocode_pontos", lambda termo, limite=5: [(-46.6900, -23.5460)])
    r = execute_tool(gq, "info_local", json.dumps({"nome": "Vila Madalena", "municipio": "São Paulo"}))
    assert not r.error
    assert r.payload["dados"]["nm_mun"] == "São Paulo"
    assert any("não é um recorte oficial do IBGE" in a for a in r.payload["avisos"])
