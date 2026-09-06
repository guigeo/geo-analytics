"""As rotas do portal: `/api/auth`.

Moram no agente pelo mesmo motivo que as do acervo: ele já é a fronteira de cliente do
backend — sabe qual cliente serve, tem `.env` próprio e alcança o schema daquele cliente e
de nenhum outro.

O que este módulo NÃO faz, e a ausência é o escopo: não cria conta, não lista pessoas, não
distingue uma da outra. Criar e resetar conta é ato de operação, feito por
`servidor-dados-gis/scripts/criar-usuario.sh`, porque administrador é um papel e papel foi
o que a emenda de 2026-09-05 à §8 do ADR-0001 deixou de fora.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response

from .acervo import AcervoIndisponivel
from .contas import NOME_DO_COOKIE, Contas, SenhaFraca
from .config import settings
from .schemas import Entrar, Eu, TrocaDeSenha

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Preenchido no lifespan do main, como o `estado` de `rotas_desenhos`.
estado: dict[str, Any] = {}

# Uma mensagem só para os dois casos — senha errada e conta inexistente. Ver
# `contas.verificar_senha`: o corpo idêntico só vale se o TEMPO também for, e é por isso
# que a verificação roda mesmo quando não há conta.
MSG_CREDENCIAL = "E-mail ou senha incorretos."
MSG_INDISPONIVEL = "O serviço está indisponível no momento. Tente de novo."


def _contas() -> Contas:
    c = estado.get("contas")
    if c is None:
        raise HTTPException(status_code=503, detail=MSG_INDISPONIVEL)
    return c


@router.post("/entrar", response_model=Eu)
def entrar(dados: Entrar, request: Request, response: Response) -> Eu:
    """A única rota do agente que responde sem sessão, junto com o `/api/health`.

    O limite por IP aqui é muito mais apertado que o do chat, e mede outra coisa: lá se
    protege dinheiro (cada pergunta chama um modelo), aqui se barra adivinhação de senha.
    """
    ip = estado["ip_da_requisicao"](request)
    limitador = estado["limiter_login"]
    if not limitador.allow(ip):
        raise HTTPException(
            status_code=429,
            detail="Muitas tentativas. Espere um pouco e tente de novo.",
            headers={"Retry-After": str(limitador.segundos_para_liberar(ip))},
        )

    contas = _contas()
    try:
        # Varrer as vencidas aqui, e não por cron: cron seria mais um serviço a instalar
        # e vigiar por cliente para apagar algumas dezenas de linhas, e este é o único
        # momento em que a varredura não atrasa ninguém que esteja esperando resposta.
        contas.limpar_vencidas()

        achado = contas.por_email(dados.email)
        usuario, guardado = achado if achado else (None, None)
        if not contas.verificar_senha(guardado, dados.senha) or usuario is None:
            # O e-mail vai para o log e a senha nunca. É o que permite distinguir "o
            # cliente esqueceu a senha" de "alguém está tentando entrar", que é a
            # pergunta que se faz quando o limite por IP começa a disparar.
            log.info("login recusado: ip=%s email=%s", ip, dados.email)
            raise HTTPException(status_code=401, detail=MSG_CREDENCIAL)

        sid, expira = contas.abrir_sessao(usuario.id)
        contas.marcar_acesso(usuario.id)
    except AcervoIndisponivel:
        log.exception("acervo indisponível no login")
        raise HTTPException(status_code=503, detail=MSG_INDISPONIVEL) from None

    response.set_cookie(
        NOME_DO_COOKIE,
        sid,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        expires=expira,
    )
    return Eu(email=usuario.email, trocar_senha=usuario.trocar_senha)


@router.get("/eu", response_model=Eu)
def eu(request: Request) -> Eu:
    """Quem está dentro. Sem sessão, o middleware já respondeu 401 antes daqui.

    Esse 401 é o que o `push_app` do `deploy/deploy.sh` verifica contra a VPS antes de
    publicar o frontend: 401 prova, de uma vez, que a rota existe (o agente é novo) e que
    o portão está de pé.
    """
    usuario = request.state.usuario
    return Eu(email=usuario.email, trocar_senha=usuario.trocar_senha)


@router.post("/senha", response_model=Eu)
def trocar_senha(dados: TrocaDeSenha, request: Request) -> Eu:
    """Troca a própria senha, e derruba as outras sessões da conta.

    A senha atual é cobrada mesmo com a sessão válida: quem passa por uma mesa destravada
    tem a sessão, e sem esta checagem teria também a conta.
    """
    usuario = request.state.usuario
    contas = _contas()
    try:
        achado = contas.por_email(usuario.email)
        if achado is None or not contas.verificar_senha(achado[1], dados.senha_atual):
            raise HTTPException(status_code=401, detail="A senha atual está incorreta.")
        contas.trocar_senha(usuario.id, dados.senha_nova, request.state.sid)
    except SenhaFraca as exc:
        # 422 e não 500: é erro de formulário, e a mensagem diz o número.
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except AcervoIndisponivel:
        log.exception("acervo indisponível na troca de senha")
        raise HTTPException(status_code=503, detail=MSG_INDISPONIVEL) from None

    return Eu(email=usuario.email, trocar_senha=False)


@router.post("/sair", status_code=204)
def sair(request: Request, response: Response) -> None:
    """Apaga a linha da sessão e o cookie. Nesta ordem.

    A linha primeiro porque é ela que revoga: apagar só o cookie deixaria a sessão viva
    para quem tivesse copiado o valor, e o AT-005 verifica exatamente isso com `curl`.
    """
    try:
        _contas().sair(request.state.sid)
    except AcervoIndisponivel:
        # Não impedir a saída porque o banco caiu. O cookie sai do navegador de qualquer
        # forma, e a linha órfã vence sozinha — sair é o pedido que menos pode falhar.
        log.exception("acervo indisponível ao sair; o cookie foi apagado assim mesmo")
    response.delete_cookie(NOME_DO_COOKIE, path="/")
