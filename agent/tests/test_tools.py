"""Tools contra o GeoQuery real (parquets em data/processed, como query/tests)."""

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
    assert not r.error and "pop_total" in r.payload
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
