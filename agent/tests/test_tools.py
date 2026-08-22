"""Tools contra o GeoQuery real (geodata em PostGIS, como query/tests)."""

from __future__ import annotations

import json

import pytest
from geo_query import GeoQuery

from geo_agent.tools import TOOL_REGISTRY, execute_tool, normalize_uf, openai_tools

SETOR_FORTALEZA = "230440005130001"


@pytest.fixture(scope="module")
def gq() -> GeoQuery:
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


def test_buscar_bairro_pinta_a_camada_bairro(gq: GeoQuery) -> None:
    """O defeito de origem era o mapa nao ter como pintar bairro: camada e codigos juntos."""
    r = execute_tool(
        gq, "buscar_bairro", json.dumps({"nome": "Copacabana", "municipio": "Rio de Janeiro"})
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


def test_buscar_distrito_pinta_a_camada_distrito(gq: GeoQuery) -> None:
    """Mesma regra do bairro: sem camada e codigos juntos, a resposta vem certa e o
    mapa nao acende (ADR-0001, §6.7)."""
    r = execute_tool(
        gq, "buscar_distrito", json.dumps({"nome": "Sé", "municipio": "São Paulo"})
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
