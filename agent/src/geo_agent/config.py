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
    # Conexao do acervo do cliente (banco `app_clientes`), com o papel DELE.
    #
    # ATE 2026-09-06 ISTO ERA OPCIONAL, e o comentario aqui dizia que vazio nao
    # derruba o processo. Deixou de ser verdade com o PORTAL_LOGIN: a sessao mora
    # neste banco, entao "acervo ausente" passou a significar "ninguem entra". Um
    # agente que sobe e recusa todo login e indistinguivel, para quem olha de fora,
    # de todo mundo errando a senha — entao ele para de subir, como ja faz sem a
    # chave da OpenAI. O `Restart=on-failure` do systemd cobre o caso benigno de o
    # Postgres ainda estar subindo depois de um reboot. Ver main.py.
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

    # --- PORTAL_LOGIN --------------------------------------------------------
    # Cookie `Secure` nao viaja em HTTP, e o `make dev-ia` e HTTP em localhost.
    # Padrao seguro, com desligamento EXPLICITO no .env de desenvolvimento.
    #
    # Deriva-lo do X-Forwarded-Proto seria automatico e frágil: o header e escrito
    # por quem esta na frente, e um proxy mal configurado desligaria o Secure em
    # producao sem avisar ninguem. Ler `request.url.scheme` seria pior — atras do
    # Caddy ele e `http`, entao a deteccao desligaria o Secure justamente la.
    cookie_secure: bool = True
    # A expiracao e renovada a cada requisicao autenticada, entao ela mede
    # INATIVIDADE e nao idade. Num app que o cliente abre semanas depois, medir
    # idade transformaria o portal numa cerimonia.
    sessao_dias: int = 30
    # Janela propria, e muito mais apertada que a do chat: aqui o que se barra e
    # adivinhacao de senha, nao gasto com a OpenAI.
    login_rate_limit_max: int = 10
    login_rate_limit_window_s: int = 300
    # Custo do argon2id. Sao os padroes da biblioteca (m=64 MiB, t=3, p=4), e estao
    # aqui — e nao cravados no codigo — porque o custo real so se mede na VPS, que
    # tem 3,7 GB de RAM. Trocar o numero nao invalida hash ja gravado: o argon2
    # guarda os parametros dentro do proprio hash.
    argon2_memoria_kib: int = 65536
    argon2_iteracoes: int = 3
    argon2_paralelismo: int = 4


settings = Settings()
