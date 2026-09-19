"""O contrato contra o dado REAL, e não contra o dublê.

Este arquivo existe por causa de um 500 em produção local: `regulacao.fonte` voltava
`None` fora da cobertura do zoneamento, e `ComProveniencia.fonte` é `str`. Todos os
testes passavam — o dublê de `test_rotas_raio_x.py` montava o bloco sem cobertura com
uma proveniência válida, que é uma combinação que o banco nunca produz.

A lição não é sobre zoneamento: **dublê fiel demais esconde justamente o campo que
diverge**. Passar a saída verdadeira pelo modelo cobre todo bloco de uma vez, hoje e
nos que vierem.
"""

from __future__ import annotations

import os

import pytest

from geo_agent.schemas import RaioX

_PRECISA_GEODATA = pytest.mark.skipif(
    not os.getenv("GEODATA_DSN"), reason="sem GEODATA_DSN: o contrato real não pode ser lido"
)


@pytest.fixture(scope="module")
def gq():
    from geo_query import GeoQuery

    consulta = GeoQuery()
    yield consulta
    consulta.close()


def _buffer(gq, lon: float, lat: float, metros: int) -> bytes:
    return gq._rows(
        """
        select ST_AsBinary(
            ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4674)::geography, %s)::geometry
        ) as w
        """,
        [lon, lat, metros],
    )[0]["w"]


@_PRECISA_GEODATA
def test_area_com_zoneamento_satisfaz_o_contrato(gq) -> None:
    """Sé da Sé: dentro da cobertura, o bloco de regulação vem preenchido."""
    RaioX.model_validate(gq.raio_x_por_geometria(_buffer(gq, -46.6333, -23.5505, 300)))


@_PRECISA_GEODATA
def test_area_sem_zoneamento_satisfaz_o_contrato(gq) -> None:
    """Centro de São Caetano do Sul: fora da cobertura — o caso que derrubava a rota.

    O bloco de regulação existe, diz que não há dado para aquele município, e ainda
    assim declara de onde a resposta viria. Ausência afirmada continua tendo fonte.
    """
    contrato = RaioX.model_validate(gq.raio_x_por_geometria(_buffer(gq, -46.5644, -23.6229, 200)))
    assert contrato.regulacao.disponivel is False
    assert contrato.regulacao.aviso
    assert contrato.regulacao.fonte
    assert contrato.equipamentos.disponivel is True
    assert contrato.versao_calculo == "6"


@_PRECISA_GEODATA
def test_area_sem_equipamento_satisfaz_o_contrato(gq) -> None:
    """AT-008: a fachada real, não um dublê, passa pelo Pydantic com zero verdadeiro.

    O ponto precisa cair DENTRO de um setor — senão o Raio-X inteiro some, e o
    teste não alcança o bloco de equipamentos. Medido em 2026-09-19: superfície de
    um setor grande do extremo sul de São Paulo, sem escola nem CNES no mapa a 80 m.
    """
    contrato = RaioX.model_validate(gq.raio_x_por_geometria(_buffer(gq, -46.66259, -23.96245, 80)))
    assert contrato.equipamentos.disponivel is True
    assert contrato.equipamentos.ensino.total == 0
    assert contrato.equipamentos.saude.total == 0
    assert contrato.equipamentos.cobertura == "nacional"
