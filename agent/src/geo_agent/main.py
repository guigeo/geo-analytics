"""API do chat: POST /api/chat e GET /api/health.

Dev: `uv run uvicorn geo_agent.main:app --reload --port 8000` (ou `make agent` na raiz).
O front (Vite em :5173) alcanca via proxy /api -> host.docker.internal:8000 (sem CORS).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import httpx
import openai
from fastapi import FastAPI, HTTPException, Request
from geo_query import GeoQuery

from .agent import RateLimiter, SessionStore, run_turn
from .config import settings
from .prompts import MSG_ERRO_OPENAI, MSG_RATE_LIMIT
from .schemas import ChatRequest, ChatResponse, GeocodeHit

# Nominatim (OSM): API publica de geocoding, sem chave. Nao manda CORS, entao o
# front chama este proxy em vez de bater direto nela. Uso pessoal/baixo trafego
# so (política de uso do Nominatim nao e para producao com volume alto).
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "geo-intelligence.averisen.com"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger(__name__)

state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY ausente. Copie agent/.env.example para agent/.env e preencha a chave."
        )
    state["gq"] = GeoQuery()  # falha cedo e com instrucao se faltar GEODATA_DSN
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


@app.get("/api/geocode")
def geocode(q: str, request: Request) -> list[GeocodeHit]:
    if not state["geocode_limiter"].allow(_client_ip(request)):
        raise HTTPException(status_code=429, detail=MSG_RATE_LIMIT)
    if len(q.strip()) < 3:
        return []
    try:
        resp = httpx.get(
            NOMINATIM_URL,
            params={"format": "jsonv2", "q": q, "countrycodes": "br", "limit": 5},
            headers=NOMINATIM_HEADERS,
            timeout=5.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError:
        log.exception("falha ao consultar Nominatim")
        raise HTTPException(status_code=502, detail="Geocoding indisponível.") from None

    hits = []
    for item in resp.json():
        south, north, west, east = (float(v) for v in item["boundingbox"])
        rotulo, *resto = item["display_name"].split(", ")
        hits.append(
            GeocodeHit(rotulo=rotulo, detalhe=", ".join(resto[:2]), bbox=(west, south, east, north))
        )
    return hits
