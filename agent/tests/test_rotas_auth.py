"""As rotas do portal, exercitadas por HTTP.

Montadas num app MÍNIMO com o portão junto, e não no `main.app`, pelo mesmo motivo do
`test_rotas_desenhos.py`: aquele exige chave da OpenAI e conexão com o geodata no
lifespan, e nenhuma das duas tem a ver com o que se testa aqui.

As contas são um dublê em memória. O que se afirma aqui é comportamento de ROTA —
código de status, sinalizador de cookie, o que vaza na mensagem —, e o comportamento de
BANCO tem o `test_contas.py`, que roda contra o `app_clientes` de verdade.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from geo_agent import rotas_auth, sessao
from geo_agent.agent import RateLimiter
from geo_agent.config import settings
from geo_agent.contas import NOME_DO_COOKIE, SenhaFraca, Usuario
from geo_agent.sessao import ExigeSessao

SENHA = "senha-de-teste-1"
EMAIL = "pessoa@exemplo.com"


class _ContasFalsas:
    """Uma conta, uma sessão, e a memória do que foi revogado."""

    def __init__(self) -> None:
        self.usuario = Usuario(id="u-1", email=EMAIL, trocar_senha=True)
        self.sessoes: dict[str, str] = {}
        self.acessos = 0
        self.varreduras = 0
        self._proximo = 0

    def limpar_vencidas(self) -> None:
        self.varreduras += 1

    def por_email(self, email: str):
        if email.strip().lower() != EMAIL:
            return None
        return self.usuario, "hash-da-senha-certa"

    def verificar_senha(self, guardado: str | None, senha: str) -> bool:
        return guardado is not None and senha == SENHA

    def abrir_sessao(self, usuario_id: str):
        self._proximo += 1
        sid = f"sid-{self._proximo}"
        self.sessoes[sid] = usuario_id
        return sid, None

    def usuario_da_sessao(self, sid: str):
        return self.usuario if sid in self.sessoes else None

    def marcar_acesso(self, usuario_id: str) -> None:
        self.acessos += 1

    def sair(self, sid: str) -> None:
        self.sessoes.pop(sid, None)

    def trocar_senha(self, usuario_id: str, senha_nova: str, sid_atual: str) -> None:
        if len(senha_nova) < 10:
            raise SenhaFraca("A senha precisa de pelo menos 10 caracteres.")
        self.sessoes = {sid_atual: usuario_id}
        self.usuario = Usuario(id=usuario_id, email=EMAIL, trocar_senha=False)


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(ExigeSessao)
    app.include_router(rotas_auth.router)

    @app.get("/api/desenhos")
    def desenhos() -> dict[str, str]:
        return {"itens": "..."}

    return app


@pytest.fixture
def falsas() -> _ContasFalsas:
    return _ContasFalsas()


@pytest.fixture
def cliente(falsas: _ContasFalsas, monkeypatch: pytest.MonkeyPatch):
    # `cookie_secure` desligado aqui pelo mesmo motivo que o `make dev-ia` o desliga: o
    # TestClient fala HTTP, e navegador nenhum guarda cookie `Secure` fora de HTTPS —
    # httpx tampouco. Com o padrao ligado, TODA requisicao seguinte ao login chega sem
    # cookie e o teste mede o cliente HTTP em vez de medir a rota.
    #
    # Que o padrao seja LIGADO e o que `test_secure_e_ligado_por_padrao` afirma.
    monkeypatch.setattr(settings, "cookie_secure", False)
    sessao.estado["contas"] = falsas
    rotas_auth.estado["contas"] = falsas
    rotas_auth.estado["limiter_login"] = RateLimiter(max_requests=5, window_s=300)
    rotas_auth.estado["ip_da_requisicao"] = lambda _req: "1.2.3.4"
    yield TestClient(_app())
    sessao.estado.pop("contas", None)
    rotas_auth.estado.clear()


def _entrar(cliente: TestClient, senha: str = SENHA, email: str = EMAIL):
    return cliente.post("/api/auth/entrar", json={"email": email, "senha": senha})


# --- entrar ------------------------------------------------------------------


def test_entrar_com_credencial_certa(cliente: TestClient):
    resposta = _entrar(cliente)
    assert resposta.status_code == 200
    assert resposta.json() == {"email": EMAIL, "trocar_senha": True}


def test_o_cookie_da_sessao_e_httponly_e_samesite(cliente: TestClient):
    """HttpOnly para o JS da página não conseguir ler; SameSite para não viajar de fora.

    `Secure` não é afirmado aqui porque ele é configuração (D-6): o `make dev-ia` é
    HTTP em localhost, e um `Secure` cravado deixaria o desenvolvimento sem login. O
    padrão do `Settings` é ligado, e é o `.env` de desenvolvimento que o desliga.
    """
    cabecalho = _entrar(cliente).headers["set-cookie"].lower()
    assert "httponly" in cabecalho
    assert "samesite=lax" in cabecalho
    assert f"{NOME_DO_COOKIE}=" in cabecalho


def test_secure_e_ligado_por_padrao():
    """O padrao do Settings, nao o do teste.

    A fixture acima desliga o `Secure` para o TestClient conseguir guardar o cookie em
    HTTP. Este teste existe para que esse desligamento nao possa esconder uma regressao
    no padrao — que e o valor que vale em producao.
    """
    assert type(settings).model_fields["cookie_secure"].default is True


def test_senha_errada_e_email_inexistente_dao_a_mesma_resposta(cliente: TestClient):
    """AT-002 e AT-003, na parte que o corpo da resposta cobre.

    A outra metade — o tempo — está no `test_contas.py`, porque é lá que mora o hash
    de descarte que a garante.
    """
    errada = _entrar(cliente, senha="senha-errada")
    inexistente = _entrar(cliente, email="ninguem@exemplo.com")
    assert errada.status_code == inexistente.status_code == 401
    assert errada.json() == inexistente.json()


def test_recusa_nao_abre_sessao(cliente: TestClient, falsas: _ContasFalsas):
    _entrar(cliente, senha="senha-errada")
    assert falsas.sessoes == {}


def test_limite_por_ip_barra_forca_bruta(cliente: TestClient):
    """AT-011. O limite aqui é apertado e mede outra coisa que o do chat.

    Lá se protege dinheiro (cada pergunta chama um modelo); aqui se barra adivinhação.
    """
    for _ in range(5):
        _entrar(cliente, senha="senha-errada")
    resposta = _entrar(cliente, senha="senha-errada")
    assert resposta.status_code == 429
    assert "Retry-After" in resposta.headers


def test_entrar_varre_as_sessoes_vencidas(cliente: TestClient, falsas: _ContasFalsas):
    """A limpeza acontece no login, e não por cron (D-9)."""
    _entrar(cliente)
    assert falsas.varreduras == 1


# --- o portão sobre as próprias rotas ----------------------------------------


def test_eu_recusa_sem_sessao(cliente: TestClient):
    """O 401 que o `push_app` verifica antes de publicar o frontend.

    Ele prova duas coisas de uma vez: a rota existe (o agente da VPS é o novo) e o
    portão está de pé.
    """
    assert cliente.get("/api/auth/eu").status_code == 401


def test_eu_devolve_quem_entrou(cliente: TestClient):
    _entrar(cliente)
    resposta = cliente.get("/api/auth/eu")
    assert resposta.status_code == 200
    assert resposta.json()["email"] == EMAIL


def test_desenhos_so_responde_com_sessao(cliente: TestClient):
    assert cliente.get("/api/desenhos").status_code == 401
    _entrar(cliente)
    assert cliente.get("/api/desenhos").status_code == 200


# --- sair --------------------------------------------------------------------


def test_sair_revoga_a_sessao(cliente: TestClient):
    """AT-005. Não basta apagar o cookie: a sessão tem de deixar de existir."""
    _entrar(cliente)
    sid = cliente.cookies.get(NOME_DO_COOKIE)
    assert cliente.post("/api/auth/sair").status_code == 204

    cliente.cookies.set(NOME_DO_COOKIE, sid)
    assert cliente.get("/api/auth/eu").status_code == 401


# --- trocar senha ------------------------------------------------------------


def test_trocar_senha_exige_a_atual(cliente: TestClient):
    """Quem passa por uma mesa destravada tem a sessão; sem isto, teria a conta."""
    _entrar(cliente)
    resposta = cliente.post(
        "/api/auth/senha",
        json={"senha_atual": "chute", "senha_nova": "senha-nova-boa-1"},
    )
    assert resposta.status_code == 401


def test_trocar_senha_limpa_a_obrigacao(cliente: TestClient):
    _entrar(cliente)
    resposta = cliente.post(
        "/api/auth/senha",
        json={"senha_atual": SENHA, "senha_nova": "senha-nova-boa-1"},
    )
    assert resposta.status_code == 200
    assert resposta.json()["trocar_senha"] is False


def test_senha_nova_curta_e_422_e_nao_500(cliente: TestClient):
    """Erro de formulário, e a mensagem diz o número."""
    _entrar(cliente)
    resposta = cliente.post(
        "/api/auth/senha",
        json={"senha_atual": SENHA, "senha_nova": "curta"},
    )
    assert resposta.status_code == 422


def test_trocar_senha_mantem_esta_sessao_e_derruba_as_outras(cliente: TestClient, falsas):
    """AT-006, do lado da rota: quem trocou continua trabalhando."""
    _entrar(cliente)
    falsas.sessoes["sid-de-outro-navegador"] = "u-1"
    cliente.post("/api/auth/senha", json={"senha_atual": SENHA, "senha_nova": "senha-nova-boa-1"})

    assert "sid-de-outro-navegador" not in falsas.sessoes
    assert cliente.get("/api/auth/eu").status_code == 200
