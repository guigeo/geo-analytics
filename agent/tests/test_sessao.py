"""O portão: o que fica aberto, e a garantia de que rota nova nasce fechada.

Este arquivo existe por causa da decisão D-1 do design: o portão é middleware, e não
`Depends` por rota, porque com `Depends` uma rota nova nasce ABERTA e esquecer o
decorador não levanta erro nenhum — só publica um endpoint sem portão. O teste que
congela a `LIVRES` é a outra metade dessa decisão: aumentar a lista passa a exigir
alterar um teste, que é o atrito desejado.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from geo_agent import sessao
from geo_agent.acervo import AcervoIndisponivel
from geo_agent.contas import NOME_DO_COOKIE, Usuario
from geo_agent.sessao import LIVRES, ExigeSessao

# A lista congelada. Se este conjunto mudar, o teste abaixo falha — e é para falhar:
# cada caminho aqui é uma superfície pública a mais, e a revisão dessa decisão não pode
# acontecer por descuido dentro de outra feature.
LIVRES_ESPERADAS = {"/api/health", "/api/auth/entrar"}


class _ContasFalsas:
    """Contas em memória: um identificador de sessão que vale, e nada mais."""

    def __init__(self, sid_valido: str | None = "sid-bom", explode: bool = False) -> None:
        self._sid = sid_valido
        self._explode = explode

    def usuario_da_sessao(self, sid: str) -> Usuario | None:
        if self._explode:
            raise AcervoIndisponivel("banco fora do ar")
        if sid == self._sid:
            return Usuario(id="u-1", email="pessoa@exemplo.com", trocar_senha=False)
        return None


def _app() -> FastAPI:
    """Um app mínimo com o portão e três rotas: uma livre, uma fechada, e uma NOVA.

    A terceira é o ponto do arquivo. Ela é criada aqui sem nenhum cuidado especial —
    sem decorador, sem dependência, sem menção a sessão —, que é exatamente como um
    endpoint nasce quando alguém está pensando em outra coisa.
    """
    app = FastAPI()
    app.add_middleware(ExigeSessao)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/desenhos")
    def desenhos() -> dict[str, str]:
        return {"itens": "..."}

    @app.get("/api/rota-nova-que-ninguem-protegeu")
    def rota_nova() -> dict[str, str]:
        return {"segredo": "isto nao deveria sair sem sessao"}

    return app


@pytest.fixture
def cliente():
    anterior = sessao.estado.get("contas")
    sessao.estado["contas"] = _ContasFalsas()
    yield TestClient(_app())
    if anterior is None:
        sessao.estado.pop("contas", None)
    else:
        sessao.estado["contas"] = anterior


# --- a lista de exceções -----------------------------------------------------


def test_livres_e_exatamente_essa_lista():
    """Congela a `LIVRES`. Falhar aqui é o efeito desejado, não um estorvo.

    Quem precisar abrir um caminho novo tem de vir aqui e escrever por quê — que é o
    único momento em que alguém realmente pensa sobre a consequência.
    """
    assert set(LIVRES) == LIVRES_ESPERADAS


def test_o_eu_nao_esta_entre_as_livres():
    """`/api/auth/eu` responde 401 sem sessão, e há quem dependa disso.

    O `push_app` do `deploy/deploy.sh` usa esse 401 para provar, antes de publicar o
    frontend, que o agente da VPS já sabe emitir sessão E que o portão está de pé. Pôr
    o `/eu` em LIVRES quebraria a checagem de ordem do deploy sem quebrar nada visível.
    """
    assert "/api/auth/eu" not in LIVRES


# --- o portão ----------------------------------------------------------------


def test_health_responde_sem_sessao(cliente: TestClient):
    """O vigia bate aqui a cada 10 minutos, nos dois clientes, sem conta nenhuma.

    Fechado, ele alertaria queda do agente para sempre — sem nada estar errado.
    """
    assert cliente.get("/api/health").status_code == 200


def test_rota_fechada_recusa_sem_cookie(cliente: TestClient):
    resposta = cliente.get("/api/desenhos")
    assert resposta.status_code == 401


def test_rota_nova_nasce_fechada(cliente: TestClient):
    """A razão de o portão ser middleware, num teste.

    A rota acima foi escrita sem nenhuma proteção explícita, como quem adiciona um
    endpoint no meio de outra tarefa. Ela responde 401 assim mesmo.
    """
    assert cliente.get("/api/rota-nova-que-ninguem-protegeu").status_code == 401


def test_cookie_valido_passa(cliente: TestClient):
    cliente.cookies.set(NOME_DO_COOKIE, "sid-bom")
    assert cliente.get("/api/desenhos").status_code == 200


def test_cookie_invalido_e_apagado_na_recusa(cliente: TestClient):
    """Cookie morto que fica no navegador faz a tela piscar a cada carga."""
    cliente.cookies.set(NOME_DO_COOKIE, "sid-que-nao-existe")
    resposta = cliente.get("/api/desenhos")
    assert resposta.status_code == 401
    assert NOME_DO_COOKIE in resposta.headers.get("set-cookie", "")


def test_banco_fora_do_ar_e_503_e_nao_401(cliente: TestClient):
    """A distinção que evita a pessoa achar que esqueceu a própria senha.

    401 diz "sua sessão expirou" e manda digitar de novo; com o banco fora do ar, ela
    digitaria a senha certa repetidas vezes e concluiria que a esqueceu. 503 diz a
    verdade: o problema não é dela.
    """
    sessao.estado["contas"] = _ContasFalsas(explode=True)
    cliente.cookies.set(NOME_DO_COOKIE, "sid-bom")
    assert cliente.get("/api/desenhos").status_code == 503


def test_fora_de_api_nao_passa_pelo_portao(cliente: TestClient):
    """O portão vale só no `/api`. Fora dele o Caddy serve arquivo sem perguntar nada.

    É a emenda de 2026-09-06 à §9 do ADR-0001: o site estático deixa de depender do
    agente, e por isso o mapa continua de pé quando ele cai.
    """
    assert cliente.get("/qualquer-outra-coisa").status_code == 404
