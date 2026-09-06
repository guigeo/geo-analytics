"""API do agente: o chat, o acervo, o geocoding e o portal de login.

Dev: `uv run uvicorn geo_agent.main:app --reload --port 8000` (ou `make agent` na raiz).
O front (Vite em :5173) alcanca via proxy /api -> host.docker.internal:8000 (sem CORS).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import openai
from fastapi import FastAPI, HTTPException, Request, Response
from geo_query import GeoQuery

from . import rotas_auth, rotas_desenhos, sessao
from .acervo import Acervo, nome_do_schema
from .agent import RateLimiter, SessionStore, run_turn
from .contas import Contas
from .sessao import ExigeSessao
from .tools import Contexto
from .cliente import cliente_ativo
from .config import settings
from .geocode import GeocodeIndisponivel
from .geocode import buscar as geocode_buscar
from .observabilidade import ContextoDaRequisicao, configurar_log
from .prompts import MSG_ERRO_OPENAI, MSG_RATE_LIMIT
from .schemas import ChatRequest, ChatResponse, GeocodeHit

# JSON, e nao `basicConfig`, porque dois agentes escrevem no journal da mesma VPS:
# sem `cliente` em cada linha nao da para saber de quem foi o erro. Ver
# observabilidade.py.
configurar_log(cliente_ativo.id)
log = logging.getLogger(__name__)

state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY ausente. Copie agent/.env.example para agent/.env e preencha a chave."
        )
    # O DSN vem do settings (agent/.env): pydantic-settings popula `settings`, nao
    # o ambiente do processo, entao a fachada nao o enxergaria sozinha.
    state["gq"] = GeoQuery(dsn=settings.geodata_dsn or None)
    state["client"] = openai.OpenAI(api_key=settings.openai_api_key)
    state["store"] = SessionStore()
    state["limiter"] = RateLimiter()
    state["geocode_limiter"] = RateLimiter(
        max_requests=settings.geocode_rate_limit_max,
        window_s=settings.geocode_rate_limit_window_s,
    )
    # O ACERVO DEIXOU DE SER OPCIONAL em 2026-09-06, e a mudanca merece explicacao
    # porque ela inverte o que estava escrito aqui.
    #
    # Ate o PORTAL_LOGIN, acervo ausente custava so os desenhos: o chat seguia inteiro
    # e a UI avisava. Com a sessao morando neste mesmo banco, "acervo ausente" passou a
    # significar "ninguem entra" — e um processo que sobe e recusa TODO login e
    # indistinguivel, para quem olha de fora, de todo mundo errando a senha. Falhar
    # alto e cedo, como ja se faz com a chave da OpenAI, e o que torna o defeito
    # legivel. O `Restart=on-failure` + `RestartSec=5` do systemd cobrem o caso benigno
    # de o Postgres ainda estar subindo depois de um reboot: o agente tenta de novo.
    #
    # Isto NAO contradiz a §9 do ADR. A promessa de la e que a queda do agente degrada
    # o chat e os desenhos sem derrubar o site — e o site, desde a emenda de 2026-09-06,
    # e servido pelo Caddy sem passar por aqui. Agente fora do ar continua sendo mapa de
    # pe. O schema sai do id do cliente, com a mesma regra do app_clientes.sh; quem
    # impede um cliente de ler o outro e o PAPEL, nao esta linha.
    if not settings.acervo_dsn:
        raise RuntimeError(
            "ACERVO_DSN ausente. Desde o portal de login a sessao mora no acervo: sem ele "
            "ninguem entra. Preencha em agent/.env (ou agent/.env.<cliente>)."
        )
    state["acervo"] = Acervo(dsn=settings.acervo_dsn, schema=nome_do_schema(cliente_ativo.id))
    rotas_desenhos.estado["acervo"] = state["acervo"]

    # Conta e sessao sobre a MESMA conexao do acervo: mesmo banco, mesmo papel, mesmo
    # schema. Uma segunda conexao seria um segundo jeito de o mesmo processo falhar.
    state["contas"] = Contas(con=state["acervo"].con, schema=nome_do_schema(cliente_ativo.id))
    sessao.estado["contas"] = state["contas"]
    rotas_auth.estado["contas"] = state["contas"]
    rotas_auth.estado["limiter_login"] = RateLimiter(
        max_requests=settings.login_rate_limit_max,
        window_s=settings.login_rate_limit_window_s,
    )
    rotas_auth.estado["ip_da_requisicao"] = _client_ip

    log.info("agente pronto: cliente=%s model=%s", cliente_ativo.id, settings.openai_model)
    yield
    state["gq"].close()
    if acervo := state.get("acervo"):
        acervo.con.close()


app = FastAPI(title="geo-agent", lifespan=lifespan)
# A ORDEM DAS DUAS LINHAS ABAIXO IMPORTA, e ao contrario do que a leitura sugere: o
# `add_middleware` INSERE no inicio da pilha, entao quem e adicionado por ULTIMO fica
# por FORA e ve a requisicao primeiro.
#
# Queremos o `ContextoDaRequisicao` por fora, e por isso ele vem depois: assim um 401
# do portao tambem sai com `X-Request-ID` e duracao no log. Invertido, o 401 sairia
# mudo, e a recusa de sessao e justamente o que se vai querer investigar.
app.add_middleware(ExigeSessao)
app.add_middleware(ContextoDaRequisicao)
app.include_router(rotas_auth.router)
app.include_router(rotas_desenhos.router)


@app.get("/api/health")
def health(response: Response) -> dict[str, str]:
    """Vivo E com dado. O processo de pe nao basta como sinal.

    A degradacao que o ADR-0001 previu e silenciosa dos dois lados: se o geodata
    cair, o mapa continua desenhando (tile e arquivo estatico) e o chat morre sem
    ninguem perceber. Sem tocar o banco aqui, um monitor externo veria "ok" com o
    agente incapaz de responder qualquer pergunta.
    """
    try:
        # ping() e nao um cursor cru: e o mesmo caminho das consultas, entao ele
        # tambem RECONECTA se a conexao morreu. Health que so espia reportaria
        # doente um agente capaz de se curar na proxima pergunta.
        state["gq"].ping()
        banco = "ok"
    except Exception as exc:  # noqa: BLE001 - o motivo vai no corpo, nao no log
        banco = f"erro: {type(exc).__name__}"
        response.status_code = 503

    # Com DOIS bancos, "vivo" passou a ter duas respostas, e o health que olha so um
    # mente sobre a outra metade. O acervo fora do ar NAO e 503: o produto continua
    # servindo mapa e chat, e reportar doente um agente que responde tudo menos
    # desenho faria um monitor externo acordar alguem por degradacao prevista.
    if state.get("acervo") is None:
        acervo = "ausente" if not settings.acervo_dsn else "erro: nao conectou no boot"
    else:
        try:
            state["acervo"].ping()
            acervo = "ok"
        except Exception as exc:  # noqa: BLE001 - o motivo vai no corpo, nao no log
            acervo = f"erro: {type(exc).__name__}"

    return {
        "status": "ok" if banco == "ok" else "degradado",
        # Qual cliente este processo serve. Com um agente por cliente, "esta de pe"
        # deixa de ser resposta suficiente: o erro possivel passa a ser o processo
        # certo na porta errada, e so o health diz de quem ele e.
        "cliente": cliente_ativo.id,
        "model": settings.openai_model,
        "geodata": banco,
        "acervo": acervo,
    }


def _client_ip(request: Request) -> str:
    # Atras do Caddy o client.host e 127.0.0.1; o IP real vem no X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


def _limite_estourado(limiter: RateLimiter, ip: str) -> HTTPException:
    # Retry-After vem do endurecimento do gateway (HERANCA, pendencia 1): o Nginx do
    # webgis-core (repositorio apagado em 2026-08-31) mandava 1 fixo, mas quem sabe o
    # numero certo e o limitador — e o limite mora aqui, nao no Caddy, que nao tem
    # rate limit sem plugin.
    return HTTPException(
        status_code=429,
        detail=MSG_RATE_LIMIT,
        headers={"Retry-After": str(limiter.segundos_para_liberar(ip))},
    )


@app.post("/api/chat")
def chat(req: ChatRequest, request: Request) -> ChatResponse:
    ip = _client_ip(request)
    if not state["limiter"].allow(ip):
        raise _limite_estourado(state["limiter"], ip)
    try:
        # O Contexto e montado a cada turno, e nao guardado no state, porque o acervo
        # pode ter subido depois do boot — ou caido depois dele.
        ctx = Contexto(geodata=state["gq"], acervo=state.get("acervo"))
        return run_turn(ctx, state["client"], state["store"], req)
    except openai.OpenAIError:
        log.exception("falha na chamada OpenAI")
        raise HTTPException(status_code=502, detail=MSG_ERRO_OPENAI) from None


@app.get("/api/geocode")
def geocode(q: str, request: Request) -> list[GeocodeHit]:
    ip = _client_ip(request)
    if not state["geocode_limiter"].allow(ip):
        raise _limite_estourado(state["geocode_limiter"], ip)
    if len(q.strip()) < 3:
        return []
    try:
        itens = geocode_buscar(q)
    except GeocodeIndisponivel:
        raise HTTPException(status_code=502, detail="Geocoding indisponível.") from None

    hits = []
    for item in itens:
        south, north, west, east = (float(v) for v in item["boundingbox"])
        rotulo, *resto = item["display_name"].split(", ")
        hits.append(
            GeocodeHit(rotulo=rotulo, detalhe=", ".join(resto[:2]), bbox=(west, south, east, north))
        )
    return hits
