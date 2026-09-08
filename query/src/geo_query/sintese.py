"""Texto determinístico do Raio-X, separado do banco para ficar testável."""

from __future__ import annotations

from typing import Any


def _inteiro(valor: Any) -> str:
    return f"{int(round(float(valor or 0))):,}".replace(",", ".")


def _numero(valor: Any, casas: int = 1) -> str:
    return f"{float(valor or 0):,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def montar_sintese(escala: dict[str, Any], contraste: dict[str, Any]) -> str:
    """Resume a primeira dobra sem LLM e com a mesma régua do contrato."""
    area_ha = float(escala.get("area_km2") or 0) * 100
    municipio = escala["municipio"]
    densidade = float(escala.get("densidade_hab_km2") or 0)
    densidade_municipio = float(municipio.get("densidade_hab_km2") or 0)
    posicao = "acima" if densidade >= densidade_municipio else "abaixo"
    texto = (
        f"Área de {_numero(area_ha)} ha, com {_inteiro(escala.get('populacao'))} habitantes e "
        f"{_inteiro(escala.get('domicilios_ocupados'))} domicílios ocupados segundo o Censo 2022 — "
        f"densidade de {_numero(densidade)} hab/km², {posicao} da referência de "
        f"{municipio['nm_mun']}."
    )
    if contraste.get("minimo") is not None and contraste.get("maximo") is not None:
        texto += (
            " A renda média mensal do responsável entre os setores vai de R$ "
            f"{_numero(contraste['minimo'], 2)} a R$ {_numero(contraste['maximo'], 2)}."
        )
    pop = float(escala.get("populacao") or 0)
    rateada = float(escala.get("populacao_rateada") or 0)
    if rateada and pop:
        texto += f" {_numero(100 * rateada / pop)}% da população entra por rateio areal na borda."
    return texto
