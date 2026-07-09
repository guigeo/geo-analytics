"""Loop de tool-calling com client OpenAI fake (offline): grounding, autocorrecao, teto."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from geo_query import GeoQuery

from geo_agent.agent import RateLimiter, SessionStore, run_turn
from geo_agent.config import settings
from geo_agent.prompts import MSG_ERRO_TOOLS, MSG_LIMITE_ITERACOES
from geo_agent.schemas import ChatRequest, ContextoMapa


def texto(content: str) -> SimpleNamespace:
    return SimpleNamespace(content=content, tool_calls=None)


def tool_call(name: str, args: dict[str, Any], call_id: str = "call_1") -> SimpleNamespace:
    return SimpleNamespace(
        content=None,
        tool_calls=[
            SimpleNamespace(
                id=call_id,
                function=SimpleNamespace(name=name, arguments=json.dumps(args)),
            )
        ],
    )


class FakeClient:
    """Devolve mensagens roteirizadas em sequencia e grava cada request recebido."""

    def __init__(self, script: list[SimpleNamespace]) -> None:
        self.script = list(script)
        self.requests: list[dict[str, Any]] = []
        completions = SimpleNamespace(create=self._create)
        self.chat = SimpleNamespace(completions=completions)

    def _create(self, **kwargs: Any) -> SimpleNamespace:
        self.requests.append(kwargs)
        msg = self.script.pop(0)
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)], usage=None)


@pytest.fixture(scope="module")
def gq() -> GeoQuery:
    q = GeoQuery()
    yield q
    q.close()


def req(pergunta: str, session_id: str = "s1") -> ChatRequest:
    return ChatRequest(pergunta=pergunta, session_id=session_id)


def test_resposta_direta_sem_tools(gq: GeoQuery) -> None:
    client = FakeClient([texto("Não tenho dados de PIB — meus dados são do Censo 2022.")])
    out = run_turn(gq, client, SessionStore(), req("PIB de Fortaleza?"))
    assert "Censo 2022" in out.resposta
    assert out.destaques is None and out.dados is None


def test_destaques_derivados_da_tool(gq: GeoQuery) -> None:
    client = FakeClient(
        [
            tool_call("ranking_municipios", {"metrica": "pop_total", "uf": "CE", "n": 2}),
            texto("Os 2 municípios mais populosos do Ceará são Fortaleza e Caucaia."),
        ]
    )
    trace: list[dict[str, Any]] = []
    out = run_turn(gq, client, SessionStore(), req("top 2 do CE"), trace=trace)
    assert out.destaques is not None and out.destaques.camada == "municipio"
    assert out.destaques.codigos[0] == "2304400"  # Fortaleza, direto da tool
    assert out.dados is not None and out.dados[0]["nm_mun"] == "Fortaleza"
    assert trace[0]["tool"] == "ranking_municipios" and not trace[0]["error"]


def test_autocorrecao_apos_erro_de_metrica(gq: GeoQuery) -> None:
    client = FakeClient(
        [
            tool_call("ranking_municipios", {"metrica": "renda_media"}),
            tool_call("ranking_municipios", {"metrica": "pop_total", "n": 1}),
            texto("O município mais populoso do Brasil é São Paulo."),
        ]
    )
    out = run_turn(gq, client, SessionStore(), req("maior município"))
    assert "São Paulo" in out.resposta
    assert out.destaques is not None and out.destaques.codigos == ["3550308"]
    # o erro voltou ao LLM como tool result
    tool_msgs = [
        m
        for r in client.requests
        for m in r["messages"]
        if m.get("role") == "tool" and "erro" in m["content"]
    ]
    assert tool_msgs


def test_segunda_falha_encerra_com_mensagem_amigavel(gq: GeoQuery) -> None:
    client = FakeClient(
        [
            tool_call("ranking_municipios", {"metrica": "renda_media"}),
            tool_call("ranking_municipios", {"metrica": "idh"}),
        ]
    )
    out = run_turn(gq, client, SessionStore(), req("ranking por renda"))
    assert out.resposta == MSG_ERRO_TOOLS


def test_teto_de_iteracoes(gq: GeoQuery) -> None:
    client = FakeClient(
        [tool_call("listar_metricas", {}) for _ in range(settings.max_tool_iters)]
    )
    out = run_turn(gq, client, SessionStore(), req("loop"))
    assert out.resposta == MSG_LIMITE_ITERACOES
    assert len(client.requests) == settings.max_tool_iters


def test_multi_turno_preserva_historico(gq: GeoQuery) -> None:
    store = SessionStore()
    client = FakeClient([texto("Oi!"), texto("Continuando…")])
    run_turn(gq, client, store, req("primeira pergunta"))
    run_turn(gq, client, store, req("segunda pergunta"))
    ultimos = client.requests[-1]["messages"]
    conteudos = [m.get("content") or "" for m in ultimos]
    assert any("primeira pergunta" in c for c in conteudos)  # historico presente no turno 2


def test_contexto_do_mapa_vai_na_mensagem(gq: GeoQuery) -> None:
    client = FakeClient([texto("Você está vendo a região de Curitiba.")])
    r = ChatRequest(
        pergunta="o que estou vendo?",
        session_id="s-ctx",
        contexto_mapa=ContextoMapa(centro=(-49.27, -25.43), zoom=11, camadas_ativas=["setor"]),
    )
    run_turn(gq, client, SessionStore(), r)
    user_msg = client.requests[0]["messages"][-1]
    assert "[contexto do mapa:" in user_msg["content"] and "-49.27" in user_msg["content"]


def test_rate_limiter_janela_deslizante() -> None:
    rl = RateLimiter(max_requests=2, window_s=10)
    assert rl.allow("ip1", now=0.0)
    assert rl.allow("ip1", now=1.0)
    assert not rl.allow("ip1", now=2.0)  # estourou a janela
    assert rl.allow("ip2", now=2.0)  # outra chave nao e afetada
    assert rl.allow("ip1", now=11.5)  # 1a hit expirou -> libera de novo


def test_trim_corta_em_fronteira_de_turno(gq: GeoQuery) -> None:
    store = SessionStore(max_msgs=4)
    client = FakeClient([texto(f"r{i}") for i in range(4)])
    for i in range(4):
        run_turn(gq, client, store, req(f"pergunta {i}", session_id="s-trim"))
    msgs = store.get("s-trim").messages
    assert len(msgs) <= 4 + 1  # poda aplicada (fronteira pode segurar 1 turno extra)
    assert msgs[0]["role"] == "user"  # nunca comeca em tool/assistant orfao
