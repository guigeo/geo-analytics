"""Agente de IA do chat (Fase 2): FastAPI + SDK openai puro + tools sobre o GeoQuery.

O LLM nunca toca nos dados: escolhe tools curadas (wrappers do geo-query) e redige o
texto; destaques/dados da resposta saem deterministicamente dos resultados das tools.
"""
