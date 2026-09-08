"""Rota determinística do Raio-X de uma área salva."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from geo_query.queries import TETO_AREA_RAIO_X_KM2

from .acervo import Acervo, AcervoIndisponivel
from .rotas_desenhos import _protegido
from .schemas import RaioX
from .tools import _avisos_classe_social

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/raio-x", tags=["raio-x"])
estado: dict[str, Any] = {}

_SEM_ACERVO = "O acervo de desenhos está indisponível. O mapa e o chat seguem funcionando."
_SEM_GEODATA = "Os dados territoriais estão indisponíveis agora. Tente novamente em instantes."


def _acervo() -> Acervo:
    acervo = estado.get("acervo")
    if acervo is None:
        raise HTTPException(status_code=503, detail=_SEM_ACERVO)
    return acervo


@router.get("/{desenho_id}", response_model=RaioX)
def raio_x(desenho_id: str) -> Any:
    """Lê o desenho uma vez, recusa cedo e nunca chama o modelo de linguagem."""
    try:
        desenho = _protegido("raio-x")(_acervo().wkb_por_id)(desenho_id)
    except AcervoIndisponivel:  # guarda de tipo para dublês e mudanças futuras
        raise HTTPException(status_code=503, detail=_SEM_ACERVO) from None
    if desenho is None:
        raise HTTPException(status_code=404, detail="Nenhum desenho com este id.")
    if desenho["tipo"] == "ponto":
        raise HTTPException(
            status_code=422,
            detail="Ponto não tem área; o Raio-X precisa de polígono ou raio.",
        )
    area_km2 = float(desenho["area_m2"] or 0) / 1_000_000
    if area_km2 > TETO_AREA_RAIO_X_KM2:
        raise HTTPException(
            status_code=422,
            detail=(
                f"A área pedida tem {area_km2:.1f} km²; o Raio-X aceita até "
                f"{TETO_AREA_RAIO_X_KM2:,} km²."
            ),
        )
    try:
        resultado = estado["geodata"].raio_x_por_geometria(desenho["wkb"])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except Exception:  # a rota afirma a degradação; o detalhe técnico fica no log
        log.exception("geodata indisponível no Raio-X")
        raise HTTPException(status_code=503, detail=_SEM_GEODATA) from None
    classe = resultado.get("classe_social", {})
    classe["avisos"] = _avisos_classe_social(
        {
            "pct_classe_a": classe.get("pct_a"),
            "classe_social_situacao": classe.get("situacao"),
        }
    )
    return resultado
