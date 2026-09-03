"""O env por cliente: qual arquivo o processo lê, e quem ganha quando os dois falam.

Existe porque o defeito que ele fecha era silencioso nos dois sentidos. O agente do
cliente 2 subia sem erro nenhum, lendo o `ACERVO_DSN` do cliente 1, e só o Postgres
reclamava — com `permission denied` num schema, que se lê como problema de banco e
não como problema de configuração.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic_settings import BaseSettings, SettingsConfigDict

from geo_agent.config import PADRAO, arquivos_de_env, cliente_do_ambiente


def test_sem_nada_declarado_e_o_cliente_1(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("CLIENTE", raising=False)
    monkeypatch.chdir(tmp_path)
    assert cliente_do_ambiente() == PADRAO


def test_o_ambiente_decide(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CLIENTE", "outro-cliente")
    assert cliente_do_ambiente() == "outro-cliente"


def test_o_env_tambem_decide(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """`.env.example` declara CLIENTE dentro do arquivo — ler só o ambiente perderia."""
    monkeypatch.delenv("CLIENTE", raising=False)
    monkeypatch.chdir(tmp_path)
    Path(".env").write_text("# comentário\nCLIENTE=do-arquivo\nOPENAI_MODEL=x\n", encoding="utf-8")
    assert cliente_do_ambiente() == "do-arquivo"


def test_ambiente_ganha_do_arquivo(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    Path(".env").write_text("CLIENTE=do-arquivo\n", encoding="utf-8")
    monkeypatch.setenv("CLIENTE", "do-ambiente")
    assert cliente_do_ambiente() == "do-ambiente"


def test_a_ordem_dos_arquivos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLIENTE", "um-cliente")
    assert arquivos_de_env() == (".env", ".env.um-cliente")
    # O parâmetro existe para o teste não depender do ambiente do processo.
    assert arquivos_de_env("outro") == (".env", ".env.outro")


@pytest.fixture
def sem_ambiente(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tira do ambiente o que estes testes medem nos arquivos.

    Variável de ambiente GANHA de arquivo — é a precedência certa, e é a que faz um
    teste sobre arquivos passar ou falhar conforme quem o roda tenha ou não o `.env`
    carregado no shell. Descoberto assim: verde numa sessão limpa, vermelho na sessão
    em que o DSN real estava exportado.
    """
    for variavel in ("ACERVO_DSN", "OPENAI_MODEL"):
        monkeypatch.delenv(variavel, raising=False)


def test_o_arquivo_do_cliente_ganha_do_compartilhado(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, sem_ambiente: None
) -> None:
    """O ponto inteiro do mecanismo: um segredo por cliente, sobre a base comum.

    É a asserção que vale por todas as outras — se o pydantic-settings invertesse a
    precedência, cada teste acima passaria e o agente continuaria lendo o papel errado.
    """
    monkeypatch.chdir(tmp_path)
    Path(".env").write_text(
        "ACERVO_DSN=postgresql://papel_do_cliente_1@localhost/app_clientes\nOPENAI_MODEL=comum\n",
        encoding="utf-8",
    )
    Path(".env.dois").write_text(
        "ACERVO_DSN=postgresql://papel_do_cliente_2@localhost/app_clientes\n", encoding="utf-8"
    )

    class Recorte(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=arquivos_de_env("dois"), env_file_encoding="utf-8", extra="ignore"
        )
        acervo_dsn: str = ""
        openai_model: str = ""

    lido = Recorte()
    assert "papel_do_cliente_2" in lido.acervo_dsn
    # E o que o cliente NÃO redeclarou continua vindo da base.
    assert lido.openai_model == "comum"


def test_cliente_sem_arquivo_proprio_le_so_a_base(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, sem_ambiente: None
) -> None:
    """Arquivo ausente não é erro: quem não tem segredo próprio segue como sempre."""
    monkeypatch.chdir(tmp_path)
    Path(".env").write_text("OPENAI_MODEL=comum\n", encoding="utf-8")

    class Recorte(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=arquivos_de_env("sem-arquivo"), env_file_encoding="utf-8", extra="ignore"
        )
        openai_model: str = ""

    assert Recorte().openai_model == "comum"
