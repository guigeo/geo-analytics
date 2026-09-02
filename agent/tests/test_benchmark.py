"""Runner do benchmark.yaml contra a OpenAI real (marcado; fora do run padrao).

Criterio do DEFINE: >= 90% dos 16 casos passando (>= 14). Cada caso e um teste;
conte os verdes no relatorio do pytest.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

import pytest
import yaml
from geo_query import GeoQuery

from geo_agent.agent import SessionStore, run_turn
from geo_agent.tools import Contexto
from geo_agent.config import settings
from geo_agent.schemas import ChatRequest, ChatResponse, ContextoMapa
from geo_agent.tools import normalize_uf

CASOS: list[dict[str, Any]] = yaml.safe_load(
    (Path(__file__).parents[1] / "benchmark.yaml").read_text(encoding="utf-8")
)["casos"]

pytestmark = pytest.mark.benchmark


@pytest.fixture(scope="module")
def ambiente() -> dict[str, Any]:
    if not settings.openai_api_key:
        pytest.skip("OPENAI_API_KEY ausente (agent/.env) — benchmark requer a chave real")
    import openai

    gq = GeoQuery()
    # O acervo entra quando existe: os casos de area desenhada so fazem sentido com
    # ele, e os outros 30 nao o tocam. Sem ACERVO_DSN, aqueles casos pulam.
    acervo = None
    if settings.acervo_dsn:
        from geo_agent.acervo import Acervo, nome_do_schema
        from geo_agent.cliente import cliente_ativo

        acervo = Acervo(dsn=settings.acervo_dsn, schema=nome_do_schema(cliente_ativo.id))
    yield {
        "ctx": Contexto(geodata=gq, acervo=acervo),
        "client": openai.OpenAI(api_key=settings.openai_api_key),
        "store": SessionStore(),
        "sessoes": {},  # chave `sessao` do yaml -> session_id compartilhado
    }
    gq.close()
    if acervo:
        acervo.con.close()


def _args_batem(esperados: dict[str, Any], reais: dict[str, Any]) -> bool:
    for k, v in esperados.items():
        real = reais.get(k)
        if k == "uf":
            v, real = normalize_uf(v), normalize_uf(real)
        if real != v:
            return False
    return True


def _verifica(caso: dict[str, Any], out: ChatResponse, trace: list[dict[str, Any]]) -> None:
    espera = caso.get("espera") or {}

    if "tool" in espera:
        alvo = espera["tool"]
        hits = [t for t in trace if t["tool"] == alvo and not t["error"]]
        assert hits, f"tool {alvo!r} não apareceu no trace: {trace}"
        if "args" in espera:
            assert any(_args_batem(espera["args"], t["args"]) for t in hits), (
                f"nenhuma chamada de {alvo!r} casou com {espera['args']}: "
                f"{[t['args'] for t in hits]}"
            )

    if "destaques" in espera:
        if espera["destaques"] is None:
            assert out.destaques is None, f"não devia pintar, pintou: {out.destaques}"
        else:
            d = espera["destaques"]
            assert out.destaques is not None, "esperava destaques, veio None"
            assert out.destaques.camada == d["camada"]
            if "n_codigos" in d:
                assert len(out.destaques.codigos) == d["n_codigos"]
            for cod in d.get("contem_codigos", []):
                assert cod in out.destaques.codigos

    if espera.get("sem_dados"):
        assert out.dados is None, f"resposta não devia carregar dados: {out.dados}"

    for trecho in espera.get("resposta_contem", []):
        assert trecho.lower() in out.resposta.lower(), (
            f"resposta não contém {trecho!r}: {out.resposta}"
        )


@pytest.mark.parametrize("caso", CASOS, ids=[c["id"] for c in CASOS])
def test_benchmark(caso: dict[str, Any], ambiente: dict[str, Any]) -> None:
    sessao = caso.get("sessao")
    if sessao:
        session_id = ambiente["sessoes"].setdefault(sessao, f"bench-{sessao}")
    else:
        session_id = f"bench-{uuid.uuid4()}"

    ctx = ContextoMapa(**caso["contexto"]) if caso.get("contexto") else None
    req = ChatRequest(pergunta=caso["pergunta"], session_id=session_id, contexto_mapa=ctx)

    trace: list[dict[str, Any]] = []
    out = run_turn(ambiente["ctx"], ambiente["client"], ambiente["store"], req, trace=trace)
    _verifica(caso, out, trace)
