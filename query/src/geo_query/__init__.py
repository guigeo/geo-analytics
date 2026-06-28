"""Camada de consulta sobre o GeoParquet canonico (DuckDB).

Backend de dados da Fase 2: expoe funcoes tipadas que a IA chamara via tool-calling.
Construido e testavel SEM o LLM.
"""

from .queries import GeoQuery

__all__ = ["GeoQuery"]
