"""Camada de consulta sobre o geodata central (PostGIS).

Backend de dados do agente: expoe funcoes tipadas que a IA chama via tool-calling.
Construido e testavel SEM o LLM. Exige GEODATA_DSN (ver db.py).
"""

from .queries import GeoQuery

__all__ = ["GeoQuery"]
