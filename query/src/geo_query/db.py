"""Conexao com o geodata: o banco central PostGIS, lido como consumidor.

A fachada NUNCA escreve, nem DDL. E a regra 4 do servidor-dados-gis ("consumidor
so le"), e e o que preserva a liberdade de recarregar o banco central sem negociar
com as aplicacoes. Consequencia pratica visivel aqui: a busca sem acento e feita
com translate() em vez de instalar a extensao unaccent.
"""

from __future__ import annotations

import os

import psycopg
from psycopg.rows import dict_row

VARIAVEL_ENV = "GEODATA_DSN"

_AJUDA = f"""defina {VARIAVEL_ENV} com a conexao do geodata (PostGIS central).
Exemplo local:
  {VARIAVEL_ENV}=postgresql://geo_reader:SENHA@localhost:55432/geodata
O papel de leitura e o geo_reader; o geo_admin nao deve ser usado por aplicacao."""


def dsn(explicito: str | None = None) -> str:
    """DSN do geodata: o passado pelo chamador, ou o do ambiente.

    Os dois caminhos existem porque os consumidores sao diferentes. O agente le o
    proprio .env com pydantic-settings, que popula `settings` e NAO o ambiente do
    processo — entao ele passa o DSN explicitamente. Quem roda a fachada solta
    (testes, script) usa a variavel de ambiente.
    """
    valor = explicito or os.getenv(VARIAVEL_ENV)
    if not valor:
        raise RuntimeError(_AJUDA)
    return valor


def connect(dsn_explicito: str | None = None) -> psycopg.Connection:
    """Abre a conexao. connect_timeout curto: banco fora do ar degrada o chat, nao o pendura.

    autocommit=True porque esta fachada so le e vive dentro de um processo longo: sem
    ele, uma consulta que falha deixa a transacao aberta e em estado de erro, e TODAS
    as consultas seguintes da sessao passam a falhar com InFailedSqlTransaction ate
    alguem dar rollback. Uma pergunta malformada ao agente derrubaria o chat inteiro
    ate reiniciar o processo.

    Os quatro limites abaixo existem porque o `connect_timeout` so cobre o
    handshake: consulta ja em andamento numa conexao viva nao tem prazo nenhum. Em
    2026-09-16, as 20:10 UTC, o `/api/health` do cliente 2 pendurou mais de 20 s num
    `select 1` e o vigia alertou HTTP 000 -- sem linha no log, porque o middleware so
    escreve quando a requisicao termina, e ela nunca terminou. O processo estava vivo:
    outra rota respondeu em 0,3 ms no mesmo segundo. O que faltava era prazo.

    - `keepalives*`: o kernel cutuca a conexao ociosa e derruba a que nao responde.
      Sem isso, socket meio-aberto (restart de container, NAT que esqueceu a sessao)
      so morre pelo timeout de retransmissao do TCP, que e de minutos.
    - `tcp_user_timeout`: teto para dado enviado e nao confirmado. E ele que
      transforma o pendura-para-sempre em excecao -- e excecao o
      `_executa_com_retomada` ja sabe tratar, reconectando e repetindo uma vez.
      10 s cabe com folga nos 20 s que o vigia espera, contando a repetida.
    - `statement_timeout`: teto do lado do servidor, para consulta que responde mas
      nao acaba. 20 s e generoso -- o Raio-X e as tools leem views materializadas e
      voltam em milissegundos; o que passa disso ja estava inutilizavel na tela.
    """
    return psycopg.connect(
        dsn(dsn_explicito),
        row_factory=dict_row,
        connect_timeout=5,
        autocommit=True,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=3,
        tcp_user_timeout=10000,
        options="-c statement_timeout=20000",
    )
