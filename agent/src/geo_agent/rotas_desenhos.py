"""As rotas do acervo: `/api/desenhos`.

Moram no agente, e não num serviço próprio, porque ele já é a fronteira de cliente do
backend — sabe qual cliente serve, tem `.env` próprio e está atrás do portão. Um
segundo processo por cliente custaria unit, porta e passo de deploy sem preservar a
propriedade que pareceria estar preservando: dado do cliente precisa de backend por
definição, e o processo separado só mudaria *qual* processo tem de estar de pé.

O preço está escrito na emenda de 2026-08-31 à §9 do ADR-0001: a queda do agente passa
a levar os desenhos junto. O que continua valendo é que o SITE não morre — basemap,
satélite, tiles e busca não passam por aqui —, e é por isso que toda falha deste módulo
vira 503 com mensagem, nunca exceção que sobe.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from .acervo import Acervo, AcervoIndisponivel, DesenhoInvalido
from .schemas import Desenho, DesenhoEdicao, DesenhoNovo, PaginaDeDesenhos

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/desenhos", tags=["desenhos"])

# Preenchido no lifespan do main. Fica como dict e não como global tipada pelo mesmo
# motivo do `state` de lá: o objeto nasce no startup e o módulo é importado antes.
estado: dict[str, Any] = {}

_SEM_ACERVO = "O acervo de desenhos está indisponível. O mapa e o chat seguem funcionando."


def _acervo() -> Acervo:
    """A instância viva, ou 503 com mensagem que a UI sabe exibir.

    Sem ACERVO_DSN o agente sobe assim mesmo (config.py): quem não configurou o acervo
    perde os desenhos, não o produto.
    """
    a = estado.get("acervo")
    if a is None:
        raise HTTPException(status_code=503, detail=_SEM_ACERVO)
    return a


def _protegido(acao: str):
    """Traduz as falhas do acervo em respostas, em vez de deixá-las virarem 500.

    `AcervoIndisponivel` é 503 e não 500 de propósito: 500 diz "o servidor quebrou" e
    convida o usuário a desistir; 503 diz "tente de novo", que é a verdade quando o
    banco reiniciou.
    """

    def envolver(fn):
        def chamar(*args, **kwargs):
            try:
                return fn(*args, **kwargs)
            except AcervoIndisponivel:
                log.exception("acervo indisponível em %s", acao)
                raise HTTPException(status_code=503, detail=_SEM_ACERVO) from None
            except DesenhoInvalido as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from None

        return chamar

    return envolver


@router.get("", response_model=PaginaDeDesenhos)
def listar(
    pagina: int = Query(1, ge=1),
    tamanho: int = Query(50, ge=1, le=200),
    categoria: str | None = None,
    q: str | None = Query(None, description="Busca por nome, sem acento e sem caixa"),
) -> Any:
    return _protegido("listar")(_acervo().listar)(
        pagina=pagina, tamanho=tamanho, categoria=categoria, busca=q
    )


@router.get("/geometrias")
def geometrias() -> Any:
    """TODOS os desenhos como FeatureCollection, para o mapa.

    Não pagina, e a diferença para `listar` é deliberada: a lista é uma tela e cabe em
    página; o mapa é o mapa inteiro, e um desenho que sumisse ao virar de página seria
    lido como defeito.
    """
    return _protegido("geometrias")(_acervo().geometrias)()


@router.get("/categorias", response_model=list[str])
def categorias() -> Any:
    """O vocabulário que este cliente já usou, mais frequente primeiro.

    É o que permite a categoria ser texto livre sem virar bagunça: o autocomplete
    sugere o que existe, e categoria nova não custa deploy.
    """
    return _protegido("categorias")(_acervo().categorias)()


@router.post("", response_model=Desenho, status_code=201)
def criar(novo: DesenhoNovo) -> Any:
    return _protegido("criar")(_acervo().criar)(
        tipo=novo.tipo,
        nome=novo.nome,
        geometria=novo.geometria,
        categoria=novo.categoria,
        cor=novo.cor,
        observacao=novo.observacao,
        raio_m=novo.raio_m,
    )


@router.get("/{id_}", response_model=Desenho)
def obter(id_: str) -> Any:
    desenho = _protegido("obter")(_acervo().obter)(id_)
    if desenho is None:
        raise HTTPException(status_code=404, detail="Desenho não encontrado.")
    return desenho


@router.patch("/{id_}", response_model=Desenho)
def atualizar(id_: str, edicao: DesenhoEdicao) -> Any:
    campos = edicao.model_dump(exclude_unset=True)
    desenho = _protegido("atualizar")(_acervo().atualizar)(id_, campos)
    if desenho is None:
        raise HTTPException(status_code=404, detail="Desenho não encontrado.")
    return desenho


@router.delete("/{id_}", status_code=204)
def apagar(id_: str) -> None:
    if not _protegido("apagar")(_acervo().apagar)(id_):
        raise HTTPException(status_code=404, detail="Desenho não encontrado.")
