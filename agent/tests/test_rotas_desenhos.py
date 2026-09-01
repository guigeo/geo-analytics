"""As rotas do acervo, exercitadas por HTTP.

O router e montado num app MINIMO, e nao no `main.app`, de proposito: aquele exige
chave da OpenAI e conexao com o geodata no lifespan, e nenhuma das duas tem a ver com
o que se testa aqui. Os testes que tocam o banco pulam sem ACERVO_DSN; os de erro
rodam sempre, e sao justamente os que guardam a promessa da §9 do ADR — acervo fora do
ar degrada, nao derruba.
"""

from __future__ import annotations

import os
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from geo_agent import rotas_desenhos
from geo_agent.acervo import Acervo, nome_do_schema

PONTO = {"type": "Point", "coordinates": [-46.6565, -23.5632]}


def _app() -> FastAPI:
    app = FastAPI()
    app.include_router(rotas_desenhos.router)
    return app


@pytest.fixture
def sem_acervo():
    """O agente de pe SEM acervo: o caminho que a §9 do ADR obriga a existir."""
    anterior = rotas_desenhos.estado.pop("acervo", None)
    yield TestClient(_app())
    if anterior is not None:
        rotas_desenhos.estado["acervo"] = anterior


@pytest.fixture(scope="module")
def cliente_com_acervo():
    dsn = os.getenv("ACERVO_DSN")
    if not dsn:
        pytest.skip("defina ACERVO_DSN para rodar contra o app_clientes (ver acervo.py)")
    acervo = Acervo(dsn=dsn, schema=nome_do_schema(os.getenv("CLIENTE", "geo-analytics")))
    rotas_desenhos.estado["acervo"] = acervo
    yield TestClient(_app())
    acervo.con.close()
    rotas_desenhos.estado.pop("acervo", None)


@pytest.fixture
def limpo(cliente_com_acervo: TestClient):
    criados: list[str] = []
    yield criados
    for id_ in criados:
        cliente_com_acervo.delete(f"/api/desenhos/{id_}")


# --- sem acervo: degrada, nao derruba -------------------------------------------


def test_sem_acervo_responde_503_e_nao_500(sem_acervo: TestClient) -> None:
    """503 e nao 500 de proposito: 500 diz "quebrou" e convida a desistir; 503 diz
    "tente de novo", que e a verdade quando o banco reiniciou."""
    r = sem_acervo.get("/api/desenhos")
    assert r.status_code == 503
    assert "mapa e o chat seguem funcionando" in r.json()["detail"]


def test_sem_acervo_todas_as_rotas_degradam_igual(sem_acervo: TestClient) -> None:
    for metodo, caminho in [
        ("get", "/api/desenhos/geometrias"),
        ("get", "/api/desenhos/categorias"),
        ("get", f"/api/desenhos/{uuid.uuid4()}"),
    ]:
        assert getattr(sem_acervo, metodo)(caminho).status_code == 503


# --- com acervo -----------------------------------------------------------------


def test_criar_listar_editar_apagar(cliente_com_acervo: TestClient, limpo: list[str]) -> None:
    nome = f"rota-{uuid.uuid4().hex[:8]}"
    r = cliente_com_acervo.post(
        "/api/desenhos",
        json={"tipo": "ponto", "nome": nome, "geometria": PONTO, "categoria": "rotas"},
    )
    assert r.status_code == 201, r.text
    criado = r.json()
    limpo.append(criado["id"])
    assert criado["nome"] == nome
    assert criado["origem"] == "desenho"

    pagina = cliente_com_acervo.get("/api/desenhos", params={"q": nome}).json()
    assert pagina["total"] >= 1
    assert any(i["id"] == criado["id"] for i in pagina["itens"])

    r = cliente_com_acervo.patch(f"/api/desenhos/{criado['id']}", json={"cor": "#00ff00"})
    assert r.status_code == 200
    assert r.json()["cor"] == "#00ff00"

    assert cliente_com_acervo.delete(f"/api/desenhos/{criado['id']}").status_code == 204
    assert cliente_com_acervo.get(f"/api/desenhos/{criado['id']}").status_code == 404
    limpo.clear()


def test_geometrias_e_featurecollection(cliente_com_acervo: TestClient, limpo: list[str]) -> None:
    r = cliente_com_acervo.post(
        "/api/desenhos",
        json={"tipo": "ponto", "nome": f"fc-{uuid.uuid4().hex[:8]}", "geometria": PONTO},
    )
    limpo.append(r.json()["id"])
    fc = cliente_com_acervo.get("/api/desenhos/geometrias").json()
    assert fc["type"] == "FeatureCollection"
    assert any(f["id"] == r.json()["id"] for f in fc["features"])


def test_cor_invalida_e_recusada(cliente_com_acervo: TestClient) -> None:
    r = cliente_com_acervo.post(
        "/api/desenhos",
        json={"tipo": "ponto", "nome": "x", "geometria": PONTO, "cor": "vermelho"},
    )
    assert r.status_code == 422


def test_nome_vazio_e_recusado(cliente_com_acervo: TestClient) -> None:
    r = cliente_com_acervo.post(
        "/api/desenhos", json={"tipo": "ponto", "nome": "", "geometria": PONTO}
    )
    assert r.status_code == 422


def test_tipo_desconhecido_e_recusado(cliente_com_acervo: TestClient) -> None:
    r = cliente_com_acervo.post(
        "/api/desenhos", json={"tipo": "circulo", "nome": "x", "geometria": PONTO}
    )
    assert r.status_code == 422


def test_geometria_gigante_vira_422_e_nao_500(cliente_com_acervo: TestClient) -> None:
    """O teto e de payload; o que importa aqui e o CODIGO da resposta.

    Sem a traducao de DesenhoInvalido para 422, uma constraint do Postgres viraria 500
    — que diz "o servidor quebrou" quando o certo e "o que voce mandou nao cabe".
    """
    anel = [[-46.0 + i * 1e-6, -23.0] for i in range(50_001)]
    r = cliente_com_acervo.post(
        "/api/desenhos",
        json={
            "tipo": "poligono",
            "nome": "gigante",
            "geometria": {"type": "Polygon", "coordinates": [anel]},
        },
    )
    assert r.status_code == 422
    assert "50000" in r.json()["detail"]


def test_patch_nao_aceita_geometria(cliente_com_acervo: TestClient, limpo: list[str]) -> None:
    """Redesenhar tracado salvo esta fora do MVP, e o contrato tem de dizer isso."""
    r = cliente_com_acervo.post(
        "/api/desenhos",
        json={"tipo": "ponto", "nome": f"pg-{uuid.uuid4().hex[:8]}", "geometria": PONTO},
    )
    id_ = r.json()["id"]
    limpo.append(id_)
    depois = cliente_com_acervo.patch(
        f"/api/desenhos/{id_}",
        json={"geometria": {"type": "Point", "coordinates": [0, 0]}},
    ).json()
    assert depois["geometria"]["coordinates"] == PONTO["coordinates"]


def test_apagar_inexistente_e_404(cliente_com_acervo: TestClient) -> None:
    assert cliente_com_acervo.delete(f"/api/desenhos/{uuid.uuid4()}").status_code == 404
