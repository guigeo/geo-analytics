"""API do chat: POST /api/chat e GET /api/health.

Dev: `uv run uvicorn geo_agent.main:app --reload --port 8000` (ou `make agent` na raiz).
O front (Vite em :5173) alcanca via proxy /api -> host.docker.internal:8000 (sem CORS).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import openai
from fastapi import FastAPI, HTTPException
from geo_query import GeoQuery

from .agent import SessionStore, run_turn
from .config import settings
from .prompts import MSG_ERRO_OPENAI
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
    log.info("agente pronto: model=%s", settings.openai_model)
    yield
    state["gq"].close()


app = FastAPI(title="geo-agent", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.openai_model}


@app.post("/api/chat")
def chat(req: ChatRequest) -> ChatResponse:
    try:
        return run_turn(state["gq"], state["client"], state["store"], req)
    except openai.OpenAIError:
        log.exception("falha na chamada OpenAI")
        raise HTTPException(status_code=502, detail=MSG_ERRO_OPENAI) from None
