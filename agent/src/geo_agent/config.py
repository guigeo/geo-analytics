"""Configuracao via .env / variaveis de ambiente (pydantic-settings)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Vazio por default para testes offline; main.py exige no startup.
    openai_api_key: str = ""
    openai_model: str = "gpt-5-mini"
    max_tool_iters: int = 6
    session_ttl_s: int = 3600
    session_max_msgs: int = 20
    agent_port: int = 8000


settings = Settings()
