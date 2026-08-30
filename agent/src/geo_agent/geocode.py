"""Geocoding por Nominatim (OSM), compartilhado entre o proxy HTTP e as tools.

Existia só como endpoint em `main.py`, para a busca de endereço do front. A tool
`info_local` precisa do mesmo caminho pelo motivo da §8 do HERANCA: topônimo que o
IBGE não reconhece — "Vila Nova Conceição" — não está em bairro, distrito nem no
`nome_bairro` do setor, e a única forma de chegar ao recorte que o contém é resolver
o nome em coordenada e perguntar ao PostGIS quem a contém.
"""

from __future__ import annotations

import logging

import httpx

from .cliente import cliente_ativo

# API publica, sem chave. Nao manda CORS, entao o front passa pelo proxy daqui.
# Uso pessoal/baixo trafego so (a politica do Nominatim nao cobre volume alto).
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# A politica do Nominatim exige um User-Agent que identifique QUEM esta chamando,
# e ate 2026-08-30 quem chamava se dizia o cliente 1 mesmo quando nao era ele.
# Cada aplicacao derivada se identifica com o proprio dominio (fase 5).
NOMINATIM_HEADERS = {"User-Agent": cliente_ativo.dominio}
TIMEOUT_S = 5.0

log = logging.getLogger(__name__)


class GeocodeIndisponivel(RuntimeError):
    """Nominatim fora do ar ou lento. Quem chama decide se é 502 ou fallback."""


def buscar(termo: str, limite: int = 5) -> list[dict]:
    """Resultados crus do Nominatim para um termo, restritos ao Brasil."""
    try:
        resp = httpx.get(
            NOMINATIM_URL,
            params={"format": "jsonv2", "q": termo, "countrycodes": "br", "limit": limite},
            headers=NOMINATIM_HEADERS,
            timeout=TIMEOUT_S,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        log.exception("falha ao consultar Nominatim")
        raise GeocodeIndisponivel(str(exc)) from None
    return resp.json()


def pontos(termo: str, limite: int = 5) -> list[tuple[float, float]]:
    """Candidatos como (lon, lat), na ordem de relevância do Nominatim.

    Devolve vários de propósito, e quem chama filtra por geometria — não pelo LLM.
    Com um só, "Vila Nova Conceição, São Paulo" voltava de Laranjal Paulista: o
    Nominatim leu "São Paulo" como estado e o primeiro resultado era do interior.
    O desempate certo é perguntar ao PostGIS qual candidato cai no município pedido.
    """
    return [(float(h["lon"]), float(h["lat"])) for h in buscar(termo, limite=limite)]
