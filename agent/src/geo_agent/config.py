"""Configuracao via .env / variaveis de ambiente (pydantic-settings)."""

from __future__ import annotations

import contextlib
import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PADRAO = "geo-analytics"


def cliente_do_ambiente() -> str:
    """Qual cliente este processo serve, decidido ANTES de o Settings existir.

    Existe porque o arquivo de env que sera lido DEPENDE desta resposta, e a
    resposta pode estar dentro do proprio arquivo: o `.env.example` mostra
    `CLIENTE=` la dentro, e o `make agente` e o systemd a passam pelo ambiente. Ler
    so o ambiente funcionaria nos dois casos que uso hoje e falharia em silencio no
    terceiro — que e o modo de falha que esta funcao inteira existe para fechar.

    A ordem e a mesma do pydantic-settings: ambiente ganha do arquivo.
    """
    if do_ambiente := os.getenv("CLIENTE", "").strip():
        return do_ambiente
    with contextlib.suppress(OSError):
        for linha in Path(".env").read_text(encoding="utf-8").splitlines():
            chave, _, valor = linha.partition("=")
            if chave.strip() == "CLIENTE":
                return valor.strip().strip("\"'") or PADRAO
    return PADRAO


def arquivos_de_env(cliente: str | None = None) -> tuple[str, str]:
    """`.env` e, por cima dele, `.env.<cliente>`.

    Um processo serve um cliente so — mas em desenvolvimento os dois rodam do MESMO
    diretorio, e portanto do mesmo `.env`. O segredo que os distingue nao cabe num
    arquivo compartilhado: o `ACERVO_DSN` carrega o papel de UM cliente, e o agente
    do segundo subia com o papel do primeiro. O Postgres recusava o schema dele —
    a recusa certa, pelo motivo errado.

    Na VPS o problema nao existe, porque cada cliente tem arvore e `.env` proprios.
    Este arquivo por cliente e o que traz o local para o mesmo formato, em vez de
    inventar um segundo mecanismo so para a maquina de desenvolvimento. O
    `.gitignore` ja o previa (`.env.*`) antes de ele existir.

    Arquivo ausente e ignorado pelo pydantic-settings: cliente sem segredo proprio
    continua lendo so o `.env`, como sempre leu.
    """
    return (".env", f".env.{cliente or cliente_do_ambiente()}")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=arquivos_de_env(), env_file_encoding="utf-8", extra="ignore"
    )

    # Qual cliente esta instancia serve: nome do arquivo em `geo_agent/clientes/`.
    # E a UNICA mencao a um id de cliente em codigo Python, e ela existe para o
    # agente da VPS continuar subindo sem CLIENTE no .env de la (o deploy
    # parametrizado e a fase 6). Ver `cliente.py`.
    cliente: str = PADRAO
    # Vazio por default para testes offline; main.py exige no startup.
    openai_api_key: str = ""
    # Conexao do geodata. Vazio cai no ambiente (GEODATA_DSN); a fachada e quem
    # falha, com instrucao, se nenhum dos dois existir.
    geodata_dsn: str = ""
    # Conexao do acervo do cliente (banco `app_clientes`), com o papel DELE. Vazio
    # nao derruba o processo: o chat continua funcionando e o painel de desenhos diz
    # que esta indisponivel — a §9 do ADR promete que a queda degrada, nao derruba.
    acervo_dsn: str = ""
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
