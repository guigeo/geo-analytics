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


def dsn() -> str:
    """DSN do geodata. Sem a variavel, para com instrucao em vez de adivinhar."""
    valor = os.getenv(VARIAVEL_ENV)
    if not valor:
        raise RuntimeError(_AJUDA)
    return valor


def connect() -> psycopg.Connection:
    """Abre a conexao. connect_timeout curto: banco fora do ar degrada o chat, nao o pendura.

    autocommit=True porque esta fachada so le e vive dentro de um processo longo: sem
    ele, uma consulta que falha deixa a transacao aberta e em estado de erro, e TODAS
    as consultas seguintes da sessao passam a falhar com InFailedSqlTransaction ate
    alguem dar rollback. Uma pergunta malformada ao agente derrubaria o chat inteiro
    ate reiniciar o processo.
    """
    return psycopg.connect(dsn(), row_factory=dict_row, connect_timeout=5, autocommit=True)
