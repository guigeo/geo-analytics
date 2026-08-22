"""Loop de tool-calling explicito + sessoes em memoria.

O `while` que qualquer framework esconderia esta aqui, visivel: LLM decide tool call ->
nosso codigo executa no GeoQuery -> resultado volta ao LLM -> repete ate resposta final.
Destaques/dados saem das rows das tools (ultima tool de dados vence), nunca do LLM.
"""

from __future__ import annotations

import json
import logging
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Protocol

from geo_query import GeoQuery

from .config import settings
from .prompts import MSG_ERRO_TOOLS, MSG_LIMITE_ITERACOES, SYSTEM_PROMPT
from .schemas import ChatRequest, ChatResponse, ContextoMapa, Destaques
from .tools import execute_tool, openai_tools

log = logging.getLogger(__name__)


class ChatClient(Protocol):
    """Superficie minima do SDK openai usada pelo loop (permite fake nos testes)."""

    @property
    def chat(self) -> Any: ...


@dataclass
class Session:
    messages: list[dict[str, Any]] = field(default_factory=list)
    last_used: float = field(default_factory=time.monotonic)


class SessionStore:
    """Sessoes em memoria (1 worker local): TTL + poda do historico por tamanho."""

    def __init__(
        self, ttl_s: int = settings.session_ttl_s, max_msgs: int = settings.session_max_msgs
    ) -> None:
        self._sessions: dict[str, Session] = {}
        self.ttl_s = ttl_s
        self.max_msgs = max_msgs

    def get(self, session_id: str) -> Session:
        now = time.monotonic()
        self._sessions = {
            sid: s for sid, s in self._sessions.items() if now - s.last_used < self.ttl_s
        }
        session = self._sessions.setdefault(session_id, Session())
        session.last_used = now
        return session

    def trim(self, session: Session) -> None:
        # Corta sempre em fronteira de turno (mensagem "user") para nao orfanar
        # um tool result do seu assistant tool_call.
        msgs = session.messages
        while len(msgs) > self.max_msgs:
            try:
                cut = next(i for i, m in enumerate(msgs[1:], start=1) if m["role"] == "user")
            except StopIteration:
                break
            del msgs[:cut]


class RateLimiter:
    """Janela deslizante por chave (IP): protege a chave OpenAI em endpoint publico."""

    def __init__(
        self,
        max_requests: int = settings.rate_limit_max,
        window_s: float = settings.rate_limit_window_s,
    ) -> None:
        self.max_requests = max_requests
        self.window_s = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        t = time.monotonic() if now is None else now
        q = self._hits[key]
        while q and t - q[0] > self.window_s:
            q.popleft()
        if len(q) >= self.max_requests:
            return False
        q.append(t)
        return True

    def segundos_para_liberar(self, key: str, now: float | None = None) -> int:
        """Quanto falta ate a chave voltar a ser aceita — o valor do Retry-After.

        Sem isto o 429 diz "tente mais tarde" sem dizer quando, e cliente educado
        vira cliente que repete em loop. E a janela deslizante: libera quando o hit
        mais antigo sai dela, nao quando a janela inteira passa.
        """
        t = time.monotonic() if now is None else now
        q = self._hits.get(key)
        if not q:
            return 0
        return max(1, math.ceil(self.window_s - (t - q[0])))


def _user_content(pergunta: str, ctx: ContextoMapa | None) -> str:
    if ctx is None:
        return pergunta
    return f"{pergunta}\n\n[contexto do mapa: {ctx.model_dump_json(exclude_none=True)}]"


def _assistant_dict(msg: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"role": "assistant", "content": msg.content}
    if msg.tool_calls:
        out["tool_calls"] = [
            {
                "id": c.id,
                "type": "function",
                "function": {"name": c.function.name, "arguments": c.function.arguments},
            }
            for c in msg.tool_calls
        ]
    return out


def run_turn(
    gq: GeoQuery,
    client: ChatClient,
    store: SessionStore,
    req: ChatRequest,
    trace: list[dict[str, Any]] | None = None,
) -> ChatResponse:
    """Executa um turno da conversa; `trace` (opcional) grava as tool calls do turno."""
    session = store.get(req.session_id)
    session.messages.append({"role": "user", "content": _user_content(req.pergunta, req.contexto_mapa)})

    destaques: Destaques | None = None
    dados: list[dict[str, Any]] | None = None
    erros = 0

    for _ in range(settings.max_tool_iters):
        t0 = time.monotonic()
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, *session.messages],
            tools=openai_tools(),
        )
        msg = resp.choices[0].message
        usage = getattr(resp, "usage", None)
        log.info(
            "openai %.2fs tokens=%s tool_calls=%d",
            time.monotonic() - t0,
            getattr(usage, "total_tokens", "?"),
            len(msg.tool_calls or []),
        )
        session.messages.append(_assistant_dict(msg))

        if not msg.tool_calls:
            store.trim(session)
            return ChatResponse(resposta=msg.content or "", destaques=destaques, dados=dados)

        for call in msg.tool_calls:
            t1 = time.monotonic()
            result = execute_tool(gq, call.function.name, call.function.arguments)
            log.info(
                "tool %s(%s) %.3fs erro=%s",
                call.function.name,
                call.function.arguments,
                time.monotonic() - t1,
                result.error,
            )
            if trace is not None:
                trace.append(
                    {
                        "tool": call.function.name,
                        "args": json.loads(call.function.arguments or "{}"),
                        "error": result.error,
                    }
                )
            session.messages.append(
                {"role": "tool", "tool_call_id": call.id, "content": result.payload_json}
            )
            if result.error:
                erros += 1
                if erros >= 2:  # 1 chance de autocorrecao; na 2a falha, desiste com clareza
                    store.trim(session)
                    return ChatResponse(resposta=MSG_ERRO_TOOLS, destaques=destaques, dados=dados)
            elif result.codigos and result.camada:
                destaques = Destaques(camada=result.camada, codigos=result.codigos)
                dados = result.rows

    store.trim(session)
    return ChatResponse(resposta=MSG_LIMITE_ITERACOES, destaques=destaques, dados=dados)
