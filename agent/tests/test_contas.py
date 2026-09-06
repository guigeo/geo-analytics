"""Conta e sessão.

Dividido em dois: o que não precisa de banco (hash, tempo constante, normalização) roda
sempre; o que toca o `app_clientes` pula sem `ACERVO_DSN`, com a mesma regra do
`test_rotas_desenhos.py` — sem erro, com a instrução.
"""

from __future__ import annotations

import os
import time
import uuid

import pytest

from geo_agent.acervo import Acervo, nome_do_schema
from geo_agent.contas import (
    MIN_SENHA,
    Contas,
    SenhaFraca,
    _hash_da_sessao,
    normalizar_email,
)


class _ConexaoFalsa:
    """O bastante para construir `Contas` sem banco.

    Os métodos de hash não tocam a conexão, e são justamente os que valem testar sem
    infraestrutura: hash de senha é onde uma regressão é silenciosa e cara.
    """


@pytest.fixture(scope="module")
def contas_sem_banco() -> Contas:
    return Contas(con=_ConexaoFalsa(), schema="cliente_teste")  # type: ignore[arg-type]


# --- sem banco ---------------------------------------------------------------


def test_email_normaliza_caixa_e_espaco():
    """A mesma regra do `criar-usuario.sh`, e é o que faz os dois concordarem.

    A tabela tem CHECK exigindo minúscula; sem normalizar no login, quem digitasse o
    próprio e-mail com maiúscula não entraria e não saberia por quê.
    """
    assert normalizar_email("  Maria@Empresa.COM  ") == "maria@empresa.com"


def test_senha_curta_e_recusada(contas_sem_banco: Contas):
    with pytest.raises(SenhaFraca):
        contas_sem_banco.hash_da_senha("a" * (MIN_SENHA - 1))


def test_hash_verifica_a_propria_senha(contas_sem_banco: Contas):
    h = contas_sem_banco.hash_da_senha("senha-boa-o-suficiente")
    assert contas_sem_banco.verificar_senha(h, "senha-boa-o-suficiente")
    assert not contas_sem_banco.verificar_senha(h, "outra-senha-qualquer")


def test_hash_carrega_os_proprios_parametros(contas_sem_banco: Contas):
    """É o que permite tunar o custo na VPS sem invalidar senha já gravada.

    A decisão D-8 do design depende disto: os parâmetros vivem no `.env`, e trocá-los
    não pode obrigar ninguém a redefinir a senha.
    """
    h = contas_sem_banco.hash_da_senha("senha-boa-o-suficiente")
    assert h.startswith("$argon2id$")
    assert "m=" in h and "t=" in h and "p=" in h


def test_conta_inexistente_custa_o_mesmo_tempo_que_senha_errada(contas_sem_banco: Contas):
    """O teste que a resposta idêntica sozinha não daria.

    Sem o hash de descarte, a recusa por e-mail inexistente volta em microssegundos e a
    por senha errada custa o argon2 inteiro. As duas respostas ficam iguais no corpo e
    distinguíveis no relógio — e aí o portal vira um oráculo que diz quais e-mails têm
    conta.

    A margem é generosa de propósito: o que se afirma é que os dois caminhos pagam o
    mesmo hash, não que a máquina seja determinística.
    """
    h = contas_sem_banco.hash_da_senha("senha-boa-o-suficiente")

    inicio = time.perf_counter()
    contas_sem_banco.verificar_senha(h, "senha-errada")
    com_conta = time.perf_counter() - inicio

    inicio = time.perf_counter()
    contas_sem_banco.verificar_senha(None, "senha-errada")
    sem_conta = time.perf_counter() - inicio

    assert sem_conta > com_conta * 0.5, (
        f"e-mail inexistente custou {sem_conta:.4f}s contra {com_conta:.4f}s da senha "
        "errada — o hash de descarte não está sendo verificado"
    )


def test_conta_inexistente_nunca_autentica(contas_sem_banco: Contas):
    """Verificar contra o descarte não pode, em hipótese nenhuma, deixar alguém entrar."""
    assert not contas_sem_banco.verificar_senha(None, "qualquer-coisa")


def test_sessao_e_guardada_como_hash():
    """O banco nunca vê o valor do cookie. Ver D-4: o dump do backup sai deste banco."""
    sid = "um-identificador-qualquer"
    guardado = _hash_da_sessao(sid)
    assert guardado != sid
    assert len(guardado) == 64
    assert _hash_da_sessao(sid) == guardado


# --- com banco ---------------------------------------------------------------


@pytest.fixture(scope="module")
def contas() -> Contas:
    dsn = os.getenv("ACERVO_DSN")
    if not dsn:
        pytest.skip("defina ACERVO_DSN para rodar contra o app_clientes (ver contas.py)")
    schema = nome_do_schema(os.getenv("CLIENTE", "geo-analytics"))
    acervo = Acervo(dsn=dsn, schema=schema)
    yield Contas(con=acervo.con, schema=schema)
    acervo.con.close()


@pytest.fixture
def conta(contas: Contas):
    """Uma conta descartável, apagada no fim. O CASCADE leva as sessões junto."""
    email = f"teste-{uuid.uuid4().hex[:8]}@exemplo.com"
    senha = "senha-de-teste-1"
    with contas.con.cursor() as cur:
        cur.execute(
            f"insert into {contas._schema}.usuario (email, senha_hash) values (%s, %s) returning id",  # noqa: S608, SLF001
            [email, contas.hash_da_senha(senha)],
        )
        usuario_id = str(cur.fetchone()["id"])
    yield usuario_id, email, senha
    with contas.con.cursor() as cur:
        cur.execute(f"delete from {contas._schema}.usuario where id = %s", [usuario_id])  # noqa: S608, SLF001


def test_por_email_acha_a_conta(contas: Contas, conta):
    _, email, senha = conta
    achado = contas.por_email(email.upper())
    assert achado is not None
    assert contas.verificar_senha(achado[1], senha)


def test_sessao_abre_e_reconhece(contas: Contas, conta):
    usuario_id, email, _ = conta
    sid, _expira = contas.abrir_sessao(usuario_id)
    usuario = contas.usuario_da_sessao(sid)
    assert usuario is not None
    assert usuario.email == email


def test_sair_revoga_de_verdade(contas: Contas, conta):
    """AT-005. A linha some, e o valor capturado antes deixa de valer.

    É a diferença entre logout e "apagar o cookie": o segundo deixa a sessão viva para
    quem tiver copiado o valor.
    """
    usuario_id, _, _ = conta
    sid, _ = contas.abrir_sessao(usuario_id)
    assert contas.usuario_da_sessao(sid) is not None
    contas.sair(sid)
    assert contas.usuario_da_sessao(sid) is None


def test_trocar_senha_derruba_as_outras_sessoes(contas: Contas, conta):
    """AT-006. A sessão de quem trocou fica; as outras caem.

    Quem troca a senha porque desconfia de vazamento espera exatamente isto. Derrubar
    também quem trocou seria seguro e hostil, e não acrescentaria segurança nenhuma.
    """
    usuario_id, _, _ = conta
    sid_desta_maquina, _ = contas.abrir_sessao(usuario_id)
    sid_do_outro_navegador, _ = contas.abrir_sessao(usuario_id)

    contas.trocar_senha(usuario_id, "senha-nova-boa-1", sid_desta_maquina)

    assert contas.usuario_da_sessao(sid_desta_maquina) is not None
    assert contas.usuario_da_sessao(sid_do_outro_navegador) is None


def test_trocar_senha_apaga_a_obrigacao_de_trocar(contas: Contas, conta):
    usuario_id, email, _ = conta
    sid, _ = contas.abrir_sessao(usuario_id)
    assert contas.usuario_da_sessao(sid).trocar_senha is True

    contas.trocar_senha(usuario_id, "senha-nova-boa-1", sid)
    assert contas.usuario_da_sessao(sid).trocar_senha is False
    assert contas.verificar_senha(contas.por_email(email)[1], "senha-nova-boa-1")


def test_sessao_vencida_nao_vale(contas: Contas, conta):
    usuario_id, _, _ = conta
    sid, _ = contas.abrir_sessao(usuario_id)
    with contas.con.cursor() as cur:
        cur.execute(
            f"update {contas._schema}.sessao set expira_em = now() - interval '1 second' "  # noqa: S608, SLF001
            "where id_hash = %s",
            [_hash_da_sessao(sid)],
        )
    assert contas.usuario_da_sessao(sid) is None


def test_uso_renova_o_vencimento(contas: Contas, conta):
    """A expiração mede INATIVIDADE, não idade da sessão (D-9)."""
    usuario_id, _, _ = conta
    sid, _ = contas.abrir_sessao(usuario_id)
    with contas.con.cursor() as cur:
        cur.execute(
            f"update {contas._schema}.sessao set expira_em = now() + interval '1 hour' "  # noqa: S608, SLF001
            "where id_hash = %s",
            [_hash_da_sessao(sid)],
        )
    assert contas.usuario_da_sessao(sid) is not None
    with contas.con.cursor() as cur:
        cur.execute(
            f"select expira_em > now() + interval '2 hours' as renovou from {contas._schema}.sessao "  # noqa: S608, SLF001
            "where id_hash = %s",
            [_hash_da_sessao(sid)],
        )
        assert cur.fetchone()["renovou"] is True


def test_apagar_a_conta_leva_as_sessoes(contas: Contas, conta):
    """O CASCADE, para que o script de operação não precise saber da tabela `sessao`."""
    usuario_id, _, _ = conta
    sid, _ = contas.abrir_sessao(usuario_id)
    with contas.con.cursor() as cur:
        cur.execute(f"delete from {contas._schema}.usuario where id = %s", [usuario_id])  # noqa: S608, SLF001
    assert contas.usuario_da_sessao(sid) is None
