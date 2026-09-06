"""Conta e sessão do cliente: quem entra, e por quanto tempo continua dentro.

Irmã do `acervo.py`, e deliberadamente parecida com ele: mesmo banco (`app_clientes`),
mesmo papel do Postgres, mesma forma de conexão e de tradução de erro. O que separa as
duas é só o assunto.

**O isolamento entre clientes não mora aqui**, pelo mesmo motivo escrito lá: quem
impede a conta de um cliente de alcançar o schema do outro é o PAPEL do Postgres, e não
uma linha de Python. O `_schema` diz *onde*, nunca *quem pode*.

**Não existe distinção entre pessoas dentro do cliente.** Não há papel, permissão nem
dado por pessoa — a conta diz quem entrou, e o dado continua sendo do cliente. Escopo
fixado na emenda de 2026-09-05 à §8 do ADR-0001 do `webgis`. A ausência de uma coluna de
papel nesta tabela é decisão, não esquecimento.

**Por que este módulo torna o acervo obrigatório.** Antes do portal, o agente subia sem
`ACERVO_DSN` e só os desenhos sumiam. Com a sessão aqui dentro, acervo ausente passou a
significar que ninguém entra — e um processo que sobe e recusa todo login é
indistinguível de todo mundo errando a senha. Ver o `lifespan` em `main.py`.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from psycopg import sql

from .acervo import AcervoIndisponivel
from .config import settings

# Nome curto e sem marca: o cookie é lido por navegador, não por gente, e um nome que
# anuncie a tecnologia só ajuda quem varre.
NOME_DO_COOKIE = "sessao"

# Tamanho do identificador de sessão, em bytes de entropia. 32 bytes = 256 bits, que é o
# que torna irrelevante qualquer ataque de dicionário contra o hash guardado no banco —
# e é o que justifica sha256 ali, em vez de argon2.
_BYTES_DA_SESSAO = 32


class SenhaFraca(ValueError):
    """Senha nova abaixo do mínimo. Vira 422, não 500."""


# Mínimo de comprimento, e nada além disso. Exigir maiúscula, dígito e símbolo é o que
# produz senha anotada em papel colado no monitor: o que mede resistência é comprimento,
# e o resto empurra a pessoa para o pior lugar possível.
MIN_SENHA = 10


@dataclass(frozen=True)
class Usuario:
    """O que a aplicação precisa saber de quem entrou. Nada além disso."""

    id: str
    email: str
    trocar_senha: bool


def normalizar_email(email: str) -> str:
    """Minúscula e sem espaço nas pontas — a mesma regra do `criar-usuario.sh`.

    A tabela tem um CHECK exigindo minúscula, e ele existe para que quem digitar o
    próprio e-mail com maiúscula no login ainda entre. Normalizar dos dois lados, com a
    mesma regra, é o que faz o script e o agente concordarem sobre quem é quem.
    """
    return email.strip().lower()


def _hash_da_sessao(sid: str) -> str:
    """sha256 do identificador do cookie. O banco nunca vê o valor original.

    O `backup-acervo.sh` faz `pg_dump` deste banco. Com o identificador em claro, o
    arquivo de backup viraria um molho de sessões utilizáveis por quem o lesse — e o
    backup é justamente o arquivo que sai da máquina e vai para o iCloud e para o lab.

    sha256 e não argon2: o valor já foi sorteado com 256 bits de entropia, então não há
    dicionário que o ataque, e argon2 aqui só custaria CPU em toda requisição.
    """
    return hashlib.sha256(sid.encode("utf-8")).hexdigest()


class Contas:
    """Conta e sessão, sobre a mesma conexão que o acervo já mantém."""

    def __init__(self, con: psycopg.Connection, schema: str) -> None:
        self.con = con
        self._schema = schema
        self._hasher = PasswordHasher(
            memory_cost=settings.argon2_memoria_kib,
            time_cost=settings.argon2_iteracoes,
            parallelism=settings.argon2_paralelismo,
        )
        # Hash de descarte, gerado uma vez no boot, contra o qual se verifica a senha
        # quando a conta NÃO existe. Sem ele a recusa por e-mail inexistente volta em
        # microssegundos e a por senha errada custa o argon2 inteiro — e aí o relógio
        # conta o que a mensagem esconde. Ver `verificar_senha`.
        self._descarte = self._hasher.hash(secrets.token_urlsafe(32))

    # --- infraestrutura ------------------------------------------------------

    def _tabela(self, nome: str) -> sql.Composed:
        return sql.SQL("{}.{}").format(sql.Identifier(self._schema), sql.Identifier(nome))

    def _executa(self, consulta: sql.Composed | sql.SQL, params: list[Any]) -> list[dict[str, Any]]:
        """Sem retomada, como o `_escreve` do acervo.

        Quase tudo aqui escreve — abrir sessão, renovar, revogar —, e repetir uma
        escrita cuja resposta se perdeu criaria sessão duplicada ou desfaria um logout.
        A leitura pura (`por_email`) paga o mesmo preço em troca de uma regra só.
        """
        try:
            with self.con.cursor() as cur:
                cur.execute(consulta, params)
                return cur.fetchall() if cur.description else []
        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
            raise AcervoIndisponivel(str(exc)) from exc

    # --- senha ---------------------------------------------------------------

    def hash_da_senha(self, senha: str) -> str:
        if len(senha) < MIN_SENHA:
            raise SenhaFraca(f"A senha precisa de pelo menos {MIN_SENHA} caracteres.")
        return self._hasher.hash(senha)

    def verificar_senha(self, hash_guardado: str | None, senha: str) -> bool:
        """Verifica SEMPRE, inclusive quando a conta não existe (`hash_guardado` nulo).

        É o que faz "senha errada" e "conta inexistente" custarem o mesmo tempo. Sem
        isto, as duas respostas ficam idênticas no corpo e distinguíveis no relógio, e
        o portal vira um oráculo que diz quais e-mails têm conta.

        O `return False` do fim não é código morto: quando o alvo é o hash de descarte,
        a verificação pode até passar por acaso teórico, e a conta continua não
        existindo.
        """
        alvo = hash_guardado or self._descarte
        try:
            self._hasher.verify(alvo, senha)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False
        return hash_guardado is not None

    # --- conta ---------------------------------------------------------------

    def por_email(self, email: str) -> tuple[Usuario, str] | None:
        """A conta e o hash dela, ou nada. O hash sai daqui porque só o login o usa."""
        linhas = self._executa(
            sql.SQL("select id, email, trocar_senha, senha_hash from {} where email = %s").format(
                self._tabela("usuario")
            ),
            [normalizar_email(email)],
        )
        if not linhas:
            return None
        linha = linhas[0]
        usuario = Usuario(
            id=str(linha["id"]), email=linha["email"], trocar_senha=linha["trocar_senha"]
        )
        return usuario, linha["senha_hash"]

    def marcar_acesso(self, usuario_id: str) -> None:
        self._executa(
            sql.SQL("update {} set ultimo_acesso = now() where id = %s").format(
                self._tabela("usuario")
            ),
            [usuario_id],
        )

    def trocar_senha(self, usuario_id: str, senha_nova: str, sid_atual: str) -> None:
        """Troca a senha e derruba as OUTRAS sessões, mantendo a de quem trocou.

        Quem troca a senha porque desconfia de vazamento espera exatamente isto: o
        intruso cai e quem trocou continua trabalhando. Derrubar também quem trocou
        seria seguro e hostil — e a pessoa relogaria, o que não acrescenta segurança
        nenhuma.

        As duas escritas numa transação: senha nova com sessão velha viva é o pior dos
        dois mundos, e é o estado em que uma falha no meio deixaria a conta.
        """
        novo_hash = self.hash_da_senha(senha_nova)
        with self.con.transaction():
            self._executa(
                sql.SQL(
                    "update {} set senha_hash = %s, trocar_senha = false where id = %s"
                ).format(self._tabela("usuario")),
                [novo_hash, usuario_id],
            )
            self._executa(
                sql.SQL("delete from {} where usuario_id = %s and id_hash <> %s").format(
                    self._tabela("sessao")
                ),
                [usuario_id, _hash_da_sessao(sid_atual)],
            )

    # --- sessão --------------------------------------------------------------

    def abrir_sessao(self, usuario_id: str) -> tuple[str, datetime]:
        """Sorteia o identificador, grava o hash dele, devolve o original e o vencimento.

        O valor original existe só nesta pilha e no cookie. Ele não é logado, não é
        devolvido em corpo de resposta e não fica no banco.
        """
        sid = secrets.token_urlsafe(_BYTES_DA_SESSAO)
        expira = datetime.now(timezone.utc) + timedelta(days=settings.sessao_dias)
        self._executa(
            sql.SQL("insert into {} (id_hash, usuario_id, expira_em) values (%s, %s, %s)").format(
                self._tabela("sessao")
            ),
            [_hash_da_sessao(sid), usuario_id, expira],
        )
        return sid, expira

    def usuario_da_sessao(self, sid: str) -> Usuario | None:
        """A conta dona da sessão, renovando o vencimento no mesmo caminho.

        Renovar aqui — e não numa rotina à parte — é o que faz a expiração medir
        inatividade. O `RETURNING` evita a segunda ida ao banco: um comando só resolve
        "existe, não venceu, renova e me diga de quem é".
        """
        if not sid:
            return None
        linhas = self._executa(
            sql.SQL("""
                update {sessao} s
                   set expira_em = now() + %s::interval
                  from {usuario} u
                 where s.id_hash = %s
                   and s.expira_em > now()
                   and u.id = s.usuario_id
             returning u.id, u.email, u.trocar_senha
            """).format(sessao=self._tabela("sessao"), usuario=self._tabela("usuario")),
            [f"{settings.sessao_dias} days", _hash_da_sessao(sid)],
        )
        if not linhas:
            return None
        linha = linhas[0]
        return Usuario(
            id=str(linha["id"]), email=linha["email"], trocar_senha=linha["trocar_senha"]
        )

    def sair(self, sid: str) -> None:
        """DELETE, e não uma coluna `ativa = false`.

        A linha some, e o cookie antigo passa a não achar nada. Marcar como inativa
        deixaria a revogação dependente de todo SELECT futuro lembrar do filtro — que é
        a mesma classe de erro que o isolamento por papel do Postgres existe para
        evitar no acervo.
        """
        self._executa(
            sql.SQL("delete from {} where id_hash = %s").format(self._tabela("sessao")),
            [_hash_da_sessao(sid)],
        )

    def limpar_vencidas(self) -> None:
        """Varre as sessões vencidas. Chamada no login, não por cron.

        Cron seria mais um serviço a instalar e vigiar POR CLIENTE, para apagar algumas
        dezenas de linhas. O login já toca esta tabela, e é o único momento em que a
        varredura não atrasa ninguém que esteja esperando resposta.
        """
        self._executa(
            sql.SQL("delete from {} where expira_em <= now()").format(self._tabela("sessao")),
            [],
        )
