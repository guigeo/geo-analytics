"""Contrato da API do chat (espelhado em web/src/chat/api.ts)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ContextoMapa(BaseModel):
    """Estado do mapa no momento da pergunta (ancora respostas 'no que estou vendo')."""

    bbox: tuple[float, float, float, float] | None = None  # oeste, sul, leste, norte
    zoom: float | None = None
    centro: tuple[float, float] | None = None  # lon, lat
    camadas_ativas: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    pergunta: str = Field(min_length=1)
    session_id: str = Field(min_length=1)
    contexto_mapa: ContextoMapa | None = None


class Destaques(BaseModel):
    """O que o mapa deve pintar: codigos IBGE por camada (filtro nos PMTiles)."""

    camada: Literal["municipio", "setor"]
    codigos: list[str]


class ChatResponse(BaseModel):
    resposta: str
    destaques: Destaques | None = None
    dados: list[dict[str, Any]] | None = None
