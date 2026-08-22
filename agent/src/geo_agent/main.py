"""API do chat: POST /api/chat e GET /api/health.

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

from .agent import RateLimiter, SessionStore, run_turn
from .config import settings
from .geocode import GeocodeIndisponivel
from .geocode import buscar as geocode_buscar
from .prompts import MSG_ERRO_OPENAI, MSG_RATE_LIMIT
from .schemas import ChatRequest, ChatResponse, GeocodeHit

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
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
    log.info("agente pronto: model=%s", settings.openai_model)
    yield
    state["gq"].close()


app = FastAPI(title="geo-agent", lifespan=lifespan)


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

    return {
        "status": "ok" if banco == "ok" else "degradado",
        "model": settings.openai_model,
        "geodata": banco,
    }


def _client_ip(request: Request) -> str:
    # Atras do Caddy o client.host e 127.0.0.1; o IP real vem no X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


def _limite_estourado(limiter: RateLimiter, ip: str) -> HTTPException:
    # Retry-After vem do endurecimento do gateway (HERANCA, pendencia 1): o Nginx do
    # webgis-core mandava 1 fixo, mas quem sabe o numero certo e o limitador — e o
    # limite mora aqui, nao no Caddy, que nao tem rate limit sem plugin.
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
        return run_turn(state["gq"], state["client"], state["store"], req)
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
