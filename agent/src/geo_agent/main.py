"""API do chat: POST /api/chat e GET /api/health.

Dev: `uv run uvicorn geo_agent.main:app --reload --port 8000` (ou `make agent` na raiz).
O front (Vite em :5173) alcanca via proxy /api -> host.docker.internal:8000 (sem CORS).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import openai
from fastapi import FastAPI, HTTPException, Request
from geo_query import GeoQuery

from .agent import RateLimiter, SessionStore, run_turn
from .config import settings
from .prompts import MSG_ERRO_OPENAI, MSG_RATE_LIMIT
from .schemas import ChatRequest, ChatResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger(__name__)

state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY ausente. Copie agent/.env.example para agent/.env e preencha a chave."
        )
    state["gq"] = GeoQuery()  # falha cedo com instrucao clara se faltarem os parquets
    state["client"] = openai.OpenAI(api_key=settings.openai_api_key)
    state["store"] = SessionStore()
    state["limiter"] = RateLimiter()
    log.info("agente pronto: model=%s", settings.openai_model)
    yield
    state["gq"].close()


app = FastAPI(title="geo-agent", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.openai_model}


def _client_ip(request: Request) -> str:
    # Atras do Caddy o client.host e 127.0.0.1; o IP real vem no X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


@app.post("/api/chat")
def chat(req: ChatRequest, request: Request) -> ChatResponse:
    if not state["limiter"].allow(_client_ip(request)):
        raise HTTPException(status_code=429, detail=MSG_RATE_LIMIT)
    try:
        return run_turn(state["gq"], state["client"], state["store"], req)
    except openai.OpenAIError:
        log.exception("falha na chamada OpenAI")
        raise HTTPException(status_code=502, detail=MSG_ERRO_OPENAI) from None
