"""Qual cliente esta instância do agente serve.

Fronteira de cliente do backend, irmã de `web/src/configuracao/` no frontend: o
que difere entre aplicações derivadas é dado, não código (regra 1 do ADR-0001 do
`webgis`). Aqui esse dado é a **persona** — quem o agente diz que é e para quem
ele responde. As regras de grounding, as tools e o glossário continuam sendo da
casca, iguais para todo cliente, e moram em `prompts.py`.

Cada cliente é um `.toml` em `clientes/`, e `CLIENTE` escolhe qual. Um processo
serve um cliente só — é a mesma composição de build do frontend (§8 do ADR), não
multi-tenancy em runtime: não existe caminho em que uma pergunta chegue com o
cliente dentro dela.

**TOML e não `.py` de propósito.** Persona é texto do cliente, e configuração que
é módulo importável convida código a nascer dentro dela. O critério de saída da
fase 5 é literal — nenhum `.py` cita cliente —, e `tomllib` é da biblioteca padrão
desde o 3.11, então isso não custa dependência nenhuma.

A validação roda na importação, ou seja, no boot do processo, e falha alto: como
no `configuracao/index.ts`, configuração errada que só aparece quando alguém faz a
primeira pergunta custa mais caro do que processo que não sobe.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .config import settings

DIRETORIO_CLIENTES = Path(__file__).parent / "clientes"

# Mesmo formato de id do esquema do frontend (`web/src/configuracao/esquema.ts`):
# minúsculas, dígitos e `-`, começando por letra. Aqui ele também é a defesa que
# impede um `CLIENTE` vindo do ambiente de virar caminho de arquivo.
FORMATO_ID = re.compile(r"^[a-z][a-z0-9-]*$")


class ClienteInvalido(RuntimeError):
    """Cliente inexistente ou arquivo que não passa no esquema."""


class ConfiguracaoCliente(BaseModel):
    """O que uma aplicação derivada diz ao agente sobre si mesma."""

    # `forbid` para campo escrito errado não virar campo ignorado em silêncio: o
    # sintoma seria a persona voltar ao padrão sem ninguém saber por quê.
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=FORMATO_ID.pattern)
    nome: str = Field(min_length=1)
    #: Completa "Você é o assistente do <nome>, <descricao>."
    descricao: str = Field(min_length=1)
    #: Para quem esta aplicação responde. Vazio = sem recorte de público.
    publico: str = ""
    #: Domínio da aplicação; identifica o cliente para o Nominatim.
    dominio: str = Field(min_length=1)


def clientes_disponiveis() -> list[str]:
    return sorted(arquivo.stem for arquivo in DIRETORIO_CLIENTES.glob("*.toml"))


def carregar(identificador: str) -> ConfiguracaoCliente:
    """Lê e valida `clientes/<identificador>.toml`.

    Erra dizendo o que existe, e não "arquivo não encontrado": errar o nome do
    cliente é o erro mais provável deste mecanismo — o `vite.config.ts` faz o
    mesmo do lado do frontend, pela mesma razão.
    """
    if not FORMATO_ID.match(identificador):
        raise ClienteInvalido(
            f'CLIENTE="{identificador}" não é um id válido '
            "(minúsculas, dígitos e -, começando por letra)."
        )

    arquivo = DIRETORIO_CLIENTES / f"{identificador}.toml"
    if not arquivo.is_file():
        raise ClienteInvalido(
            f'CLIENTE="{identificador}" não existe. '
            f"Disponíveis: {', '.join(clientes_disponiveis())}"
        )

    try:
        dados = tomllib.loads(arquivo.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise ClienteInvalido(f"{arquivo.name} não é TOML válido: {exc}") from None

    try:
        cliente = ConfiguracaoCliente(**dados)
    except ValidationError as exc:
        problemas = "\n".join(
            f"  {'.'.join(str(p) for p in e['loc']) or '(raiz)'}: {e['msg']}"
            for e in exc.errors()
        )
        raise ClienteInvalido(f"configuração de cliente inválida em {arquivo.name}:\n{problemas}")

    if cliente.id != identificador:
        # O nome do arquivo é o que `CLIENTE` seleciona; o `id` de dentro é o que
        # o resto do código lê. Divergir é ter dois nomes para a mesma coisa.
        raise ClienteInvalido(
            f'{arquivo.name} declara id="{cliente.id}", que não bate com o nome do arquivo.'
        )

    return cliente


#: O cliente deste processo. Um só, escolhido no boot.
cliente_ativo = carregar(settings.cliente)
