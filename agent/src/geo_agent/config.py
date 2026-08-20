"""Configuracao via .env / variaveis de ambiente (pydantic-settings)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Vazio por default para testes offline; main.py exige no startup.
    openai_api_key: str = ""
    # Conexao do geodata. Vazio cai no ambiente (GEODATA_DSN); a fachada e quem
    # falha, com instrucao, se nenhum dos dois existir.
    geodata_dsn: str = ""
    openai_model: str = "gpt-5-mini"
    max_tool_iters: int = 6
    session_ttl_s: int = 3600
    session_max_msgs: int = 20
    agent_port: int = 8000
    # Protecao da chave OpenAI em endpoint publico: N perguntas por IP por janela.
    rate_limit_max: int = 30
    rate_limit_window_s: int = 600
    # Proxy de geocoding (Nominatim): janela separada, mais folgada (digitar rua = varias teclas).
    geocode_rate_limit_max: int = 20
    geocode_rate_limit_window_s: int = 60


settings = Settings()
