"""Fronteira de cliente do agente: a persona é configuração, o resto é da casca.

O critério de saída da fase 5 (passo 5 do ADR-0001) é literal e testável: os dois
agentes respondem com persona diferente e NENHUM `.py` cita cliente. O último
teste deste arquivo é esse critério virado em guarda — se alguém cravar um nome de
cliente no código outra vez, ele cai.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from geo_agent.cliente import (
    DIRETORIO_CLIENTES,
    ClienteInvalido,
    carregar,
    cliente_ativo,
    clientes_disponiveis,
)
from geo_agent.prompts import SYSTEM_PROMPT, montar_system_prompt

FONTE = Path(__file__).parents[1] / "src" / "geo_agent"

# A frase de abertura do cliente 1, como estava cravada em `prompts.py` até
# 2026-08-30. Congelada aqui de propósito: a fase 5 tirou a persona do código, e o
# que prova que ela não MUDOU no caminho é esta linha continuar saindo igual.
ABERTURA_CLIENTE_1 = (
    "Você é o assistente do Geo Intelligence, um mapa interativo do Brasil com dados do "
    "CENSO 2022 do IBGE por município, por DISTRITO, por BAIRRO e por setor censitário"
)


def test_todo_cliente_carrega_e_o_id_bate_com_o_arquivo() -> None:
    disponiveis = clientes_disponiveis()
    assert disponiveis, "nenhum cliente em geo_agent/clientes/"
    for identificador in disponiveis:
        assert carregar(identificador).id == identificador


def test_cliente_inexistente_diz_quais_existem() -> None:
    with pytest.raises(ClienteInvalido) as erro:
        carregar("nao-existe")
    # Errar o nome do cliente é o erro mais provável deste mecanismo; a mensagem
    # tem de listar o que existe, e não só dizer que o arquivo não está lá.
    for identificador in clientes_disponiveis():
        assert identificador in str(erro.value)


@pytest.mark.parametrize("identificador", ["../config", "Geo", "1cliente", "geo/analytics"])
def test_id_fora_do_formato_nao_vira_caminho_de_arquivo(identificador: str) -> None:
    with pytest.raises(ClienteInvalido):
        carregar(identificador)


def test_prompt_do_cliente_1_continua_o_mesmo() -> None:
    assert SYSTEM_PROMPT.startswith(ABERTURA_CLIENTE_1)
    assert cliente_ativo.id == "geo-analytics"


def test_personas_diferentes_sobre_as_mesmas_regras() -> None:
    prompts = {ident: montar_system_prompt(carregar(ident)) for ident in clientes_disponiveis()}
    assert len(set(prompts.values())) == len(prompts), "dois clientes com o mesmo prompt"

    for identificador, prompt in prompts.items():
        cliente = carregar(identificador)
        assert cliente.nome in prompt
        # O nome de um cliente não pode vazar no prompt de outro — é o mesmo
        # isolamento que o bundle do frontend tem, do lado do agente.
        for outro in clientes_disponiveis():
            if outro != identificador:
                assert carregar(outro).nome not in prompt

        # E as regras do dado são as mesmas para todo mundo: o que varia é a
        # persona, não o que o agente pode afirmar sobre um número.
        assert "REGRAS INEGOCIÁVEIS" in prompt
        assert "GLOSSÁRIO DE MÉTRICAS" in prompt
        assert "CLASSE SOCIAL é ESTIMATIVA NOSSA" in prompt


def test_nenhum_py_cita_cliente() -> None:
    """O critério de saída da fase 5, como teste.

    Uma exceção, declarada: o `CLIENTE` padrão em `config.py`. Ele existe para o
    agente da VPS continuar subindo sem a variável no `.env` de lá — o deploy
    parametrizado é a fase 6, e até ela um default vale mais do que um processo
    que não sobe. Fora dele, nome e id de cliente só existem em `clientes/*.toml`.
    """
    termos: list[str] = []
    for identificador in clientes_disponiveis():
        cliente = carregar(identificador)
        termos += [cliente.id, cliente.nome, cliente.dominio]

    ofensas = []
    for arquivo in sorted(FONTE.rglob("*.py")):
        texto = arquivo.read_text(encoding="utf-8")
        for termo in termos:
            if termo not in texto:
                continue
            if arquivo.name == "config.py" and termo == cliente_ativo.id:
                continue
            ofensas.append(f"{arquivo.relative_to(FONTE)} cita {termo!r}")

    assert not ofensas, "cliente cravado em código:\n  " + "\n  ".join(ofensas)


def test_toml_e_a_unica_forma_de_declarar_cliente() -> None:
    # Se um cliente virar `.py`, o teste acima passa a ser inútil sem ninguém
    # perceber: o arquivo do cliente citaria o cliente, e com razão.
    assert not list(DIRETORIO_CLIENTES.glob("*.py"))
