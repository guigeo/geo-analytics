"""Contrato HTTP do Raio-X, sem OpenAI nem bancos reais."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from geo_agent import rotas_raio_x


def _resultado() -> dict:
    referencia = {
        "cd_mun": "3550308", "nm_mun": "São Paulo", "nm_uf": "SP", "pop_total": 1,
        "domicilios_ocupados": 1, "densidade_hab_km2": 1, "renda_media": 1,
        "media_moradores": 1, "pop_masculino": 1, "pop_feminino": 1,
        "pct_classe_a": 1, "pct_classe_b": 1, "pct_classe_c": 1, "pct_classe_de": 1,
    }
    comum = {
        "fonte": "Censo", "periodo": "2022", "metodo": "teste", "cobertura": "teste",
        "avisos": [],
    }
    return {
        "versao_calculo": "1", "gerado_em": datetime.now(UTC).isoformat(), "sintese": "teste",
        "escala": {**comum, "area_km2": 1, "setores": 1, "populacao": 1,
                   "populacao_contida": 1, "populacao_rateada": 0, "setores_parciais": 0,
                   "domicilios_ocupados": 1, "densidade_hab_km2": 1, "municipio": referencia},
        "contraste": {**comum, "metrica": "renda_media", "rotulo": "Renda", "minimo": 1,
                       "maximo": 1, "faixas": [], "setores": [], "truncada": False, "aviso": None},
        "perfil": {**comum, "renda_media": 1, "media_moradores": 1, "pop_masculino": 1,
                    "pop_feminino": 1, "municipio": referencia},
        "classe_social": {**comum, "pct_a": 1, "pct_b": 1, "pct_c": 1, "pct_de": 1,
                           "situacao": "ok", "municipio": referencia},
        "qualidade": {**comum, "fracao_menor": 1, "setores_parciais": 0, "populacao_rateada": 0},
        "regulacao": {**comum, "disponivel": False, "zonas": [], "aviso": "sem cobertura"},
    }


class _AcervoFalso:
    def __init__(self, desenho: dict | None) -> None:
        self.desenho = desenho

    def wkb_por_id(self, _id: str):
        return self.desenho


class _GeoFalso:
    def __init__(self) -> None:
        self.chamadas = 0

    def raio_x_por_geometria(self, _wkb: bytes):
        self.chamadas += 1
        return _resultado()


def _app() -> FastAPI:
    app = FastAPI()
    app.include_router(rotas_raio_x.router)
    return app


@pytest.fixture
def cliente():
    anterior = dict(rotas_raio_x.estado)
    rotas_raio_x.estado.clear()
    yield TestClient(_app())
    rotas_raio_x.estado.clear()
    rotas_raio_x.estado.update(anterior)


def test_acervo_ausente_degrada_com_503(cliente: TestClient) -> None:
    resposta = cliente.get("/api/raio-x/qualquer")
    assert resposta.status_code == 503
    assert "acervo" in resposta.json()["detail"].lower()


def test_desenho_inexistente_nao_vaza_banco(cliente: TestClient) -> None:
    rotas_raio_x.estado.update({"acervo": _AcervoFalso(None), "geodata": _GeoFalso()})
    resposta = cliente.get("/api/raio-x/inexistente")
    assert resposta.status_code == 404
    assert "Nenhum desenho" in resposta.json()["detail"]


def test_ponto_e_recusado_antes_de_consultar_geodata(cliente: TestClient) -> None:
    geodata = _GeoFalso()
    rotas_raio_x.estado.update(
        {"acervo": _AcervoFalso({"tipo": "ponto", "area_m2": 0, "wkb": b"x"}), "geodata": geodata}
    )
    resposta = cliente.get("/api/raio-x/ponto")
    assert resposta.status_code == 422
    assert "Ponto não tem área" in resposta.json()["detail"]
    assert geodata.chamadas == 0


def test_rota_entrega_contrato_e_aviso_de_classe(cliente: TestClient) -> None:
    rotas_raio_x.estado.update(
        {"acervo": _AcervoFalso({"tipo": "poligono", "area_m2": 1, "wkb": b"x"}), "geodata": _GeoFalso()}
    )
    resposta = cliente.get("/api/raio-x/area")
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["sintese"] == "teste"
    assert "ESTIMATIVA NOSSA" in corpo["classe_social"]["avisos"][0]
