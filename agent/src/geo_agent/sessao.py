"""O portão: middleware que exige sessão em `/api/*`, com duas exceções escritas.

**Middleware, e não `Depends` por rota, pela direção do erro.** Com `Depends`, uma rota
nova nasce ABERTA e só fecha se alguém lembrar do decorador — e esquecer não levanta erro
nenhum, apenas publica um endpoint sem portão, que é o modo de falha mais caro que existe
aqui. Com middleware, rota nova nasce FECHADA e só abre se alguém escrever o caminho em
`LIVRES`. O `test_sessao.py` congela essa lista: aumentá-la exige alterar o teste, que é
exatamente o atrito desejado.

**Por que o portão saiu do Caddy e veio para cá.** Até 2026-09-06 era `basicauth` no bloco
de Caddy de cada cliente, e ele cobria o site inteiro. A emenda daquela data à §9 do
ADR-0001 do `webgis` mudou o alcance: o portão vale só no `/api`, e o site estático passa a
ser servido sem perguntar nada a ninguém. É o que preserva a promessa da §9 — agente fora
do ar degrada o chat e os desenhos, e não derruba o mapa.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .acervo import AcervoIndisponivel
from .contas import NOME_DO_COOKIE

# Preenchido no lifespan do main, como o `estado` de `rotas_desenhos`.
estado: dict[str, Any] = {}

# As DUAS portas que ficam abertas de propósito. A lista é curta porque cada linha aqui
# é uma superfície pública a mais, e é explícita porque a alternativa — deduzir — é como
# se publica endpoint sem portão sem perceber.
#
# `/api/health`: o `deploy/vigia-app.sh` bate aqui a cada 10 minutos, nos dois clientes,
#   e o `webgis/scripts/verificar-vps.sh` também. Fechado, ele passaria a responder 401 e
#   os dois alertariam queda do agente para sempre, sem nada estar errado. O que ele
#   revela é que existe um agente e se o banco responde — o mesmo que já revelava quando
#   estava atrás de uma senha compartilhada por todo o cliente.
#
# `/api/auth/entrar`: quem entra ainda não tem sessão. É óbvio, e é por isso que é
#   perigoso de esquecer.
#
# O que deliberadamente NÃO está aqui: `/api/auth/eu`. Ele responde 401 sem sessão, e é
# essa resposta que o `push_app` do `deploy/deploy.sh` usa para provar, antes de publicar
# o frontend, que o agente da VPS já sabe emitir sessão E que o portão está de pé.
LIVRES = frozenset({"/api/health", "/api/auth/entrar"})

MSG_SEM_SESSAO = "Sessão expirada. Entre de novo."


def _sem_sessao() -> JSONResponse:
    """401 que também apaga o cookie.

    Cookie morto que fica no navegador faz o front tentar de novo a cada carga da página,
    e quem está olhando vê a tela piscar entre o app e o portão. Apagar na recusa encerra
    o ciclo na primeira volta.
    """
    resposta = JSONResponse({"detail": MSG_SEM_SESSAO}, status_code=401)
    resposta.delete_cookie(NOME_DO_COOKIE, path="/")
    return resposta


class ExigeSessao(BaseHTTPMiddleware):
    """Fecha `/api/*` por padrão; abre só o que está em `LIVRES`."""

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001 - assinatura do starlette
        caminho = request.url.path
        if not caminho.startswith("/api/") or caminho in LIVRES:
            return await call_next(request)

        sid = request.cookies.get(NOME_DO_COOKIE)
        if not sid:
            return _sem_sessao()

        try:
            usuario = estado["contas"].usuario_da_sessao(sid)
        except AcervoIndisponivel:
            # 503 e não 401: dizer "sessão expirada" quando o banco caiu mandaria a
            # pessoa digitar a senha certa repetidas vezes e concluir que esqueceu.
            # A distinção é a mesma que `rotas_desenhos` já faz.
            return JSONResponse(
                {"detail": "O serviço está indisponível no momento. Tente de novo."},
                status_code=503,
            )

        if usuario is None:
            return _sem_sessao()

        # Quem já está dentro fica disponível para as rotas sem que elas precisem
        # consultar o banco de novo.
        request.state.usuario = usuario
        request.state.sid = sid
        return await call_next(request)
