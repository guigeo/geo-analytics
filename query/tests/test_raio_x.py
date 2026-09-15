"""Raio-X: contrato fixo, rateio explícito e tetos de proteção."""

from __future__ import annotations

import os

import pytest

from geo_query import GeoQuery
from geo_query.queries import (
    LIMIAR_COBERTURA_FAIXAS_ETARIAS_PCT,
    LIMIAR_COBERTURA_SANEAMENTO_PCT,
    TETO_AREA_RAIO_X_M2,
    TETO_SETORES_RAIO_X,
    _alerta_saneamento,
    _bloco_equipamentos,
    _faixas_etarias,
    validar_area_do_raio_x,
)
from geo_query.sintese import montar_sintese


def test_sintese_e_pura_e_declara_o_rateio() -> None:
    texto = montar_sintese(
        {
            "area_km2": 0.5,
            "populacao": 1_000,
            "domicilios_ocupados": 400,
            "densidade_hab_km2": 2_000,
            "populacao_rateada": 250,
            "municipio": {"nm_mun": "Exemplo", "densidade_hab_km2": 1_000},
        },
        {"minimo": 1_000, "maximo": 2_000},
    )
    assert "50,0 ha" in texto
    assert "25,0%" in texto
    assert "R$ 1.000,00" in texto


def test_alerta_de_saneamento_so_expoe_a_carencia_relevante() -> None:
    alerta = _alerta_saneamento(
        {"pct_agua_rede": 100, "pct_esgoto_rede": 89.9, "pct_lixo_coletado": None}
    )
    assert alerta is not None
    assert alerta["limiar_cobertura_pct"] == LIMIAR_COBERTURA_SANEAMENTO_PCT
    assert alerta["indicadores"] == [
        {
            "metrica": "pct_esgoto_rede",
            "rotulo": "Esgoto pela rede",
            "cobertura_pct": 89.9,
            "ausencia_pct": 10.1,
        }
    ]


def test_alerta_de_saneamento_some_no_corte_ou_sem_dado() -> None:
    assert (
        _alerta_saneamento(
            {"pct_agua_rede": 90, "pct_esgoto_rede": 99.9, "pct_lixo_coletado": None}
        )
        is None
    )


def test_faixas_etarias_percentuam_sobre_o_que_existe_e_nao_sobre_a_populacao() -> None:
    """O denominador e a populacao EM FAIXAS. Dividir por pop_total faria as quatro
    linhas somarem menos de 100% na tela, sem dizer por que."""
    faixas, aviso = _faixas_etarias(
        {
            "pop_0_14": 100,
            "pop_15_29": 100,
            "pop_30_59": 100,
            "pop_60_mais": 100,
            "pop_total": 1_000,
        }
    )
    assert [f["pct"] for f in faixas] == [25.0, 25.0, 25.0, 25.0]
    assert aviso is not None and "40.0%" in aviso


def test_faixas_etarias_calam_o_aviso_quando_o_sigilo_e_irrelevante() -> None:
    _, aviso = _faixas_etarias(
        {
            "pop_0_14": 250,
            "pop_15_29": 250,
            "pop_30_59": 250,
            "pop_60_mais": 249,
            "pop_total": 1_000,
        }
    )
    assert aviso is None


def test_faixas_etarias_somem_inteiras_quando_nao_ha_idade_publicada() -> None:
    """Lista vazia, e nao quatro linhas de travessao: a secao inteira sai da tela."""
    faixas, aviso = _faixas_etarias(
        {
            "pop_0_14": None,
            "pop_15_29": None,
            "pop_30_59": None,
            "pop_60_mais": None,
            "pop_total": 500,
        }
    )
    assert faixas == []
    assert aviso is None


def test_grupo_suprimido_nao_apaga_os_outros_tres() -> None:
    """Grupo ausente vira None na propria linha; os presentes seguem com percentual."""
    faixas, _ = _faixas_etarias(
        {"pop_0_14": None, "pop_15_29": 100, "pop_30_59": 200, "pop_60_mais": 100, "pop_total": 400}
    )
    por_faixa = {f["faixa"]: f for f in faixas}
    assert por_faixa["pop_0_14"]["pessoas"] is None
    assert por_faixa["pop_0_14"]["pct"] is None
    assert por_faixa["pop_30_59"]["pct"] == 50.0
    assert LIMIAR_COBERTURA_FAIXAS_ETARIAS_PCT == 98.0


def test_equipamentos_preserva_zero_quando_a_area_tem_cobertura() -> None:
    bloco = _bloco_equipamentos(
        {
            "cobertura_pct": 100,
            "ensino": 0,
            "saude": 0,
            "ensino_imprecisas": 0,
            "saude_imprecisas": 0,
        }
    )
    assert bloco["disponivel"] is True
    assert bloco["ensino"]["enderecos"] == 0
    assert bloco["saude"]["enderecos"] == 0
    assert bloco["avisos"] == []


def test_equipamentos_nao_chama_fora_da_cobertura_de_zero_medido() -> None:
    bloco = _bloco_equipamentos(
        {
            "cobertura_pct": 0,
            "ensino": 0,
            "saude": 0,
            "ensino_imprecisas": 0,
            "saude_imprecisas": 0,
        }
    )
    assert bloco["disponivel"] is False
    assert "não significa zero" in bloco["avisos"][0]


def test_equipamentos_avisa_cobertura_parcial_e_coordenadas_imprecisas() -> None:
    bloco = _bloco_equipamentos(
        {
            "cobertura_pct": 72.5,
            "ensino": 3,
            "saude": 2,
            "ensino_imprecisas": 1,
            "saude_imprecisas": 2,
        }
    )
    assert bloco["disponivel"] is True
    assert "72,50%" in bloco["avisos"][0]
    assert "3 endereços" in bloco["avisos"][1]


def test_guarda_de_area_aceita_o_teto_e_explica_a_recusa() -> None:
    validar_area_do_raio_x(TETO_AREA_RAIO_X_M2)
    with pytest.raises(ValueError, match=r"51,0 km².*50 km² \(50\.000\.000 m²\).*"):
        validar_area_do_raio_x(TETO_AREA_RAIO_X_M2 + 1_000_000)


_PRECISA_GEODATA = pytest.mark.skipif(
    not os.getenv("GEODATA_DSN"),
    reason="defina GEODATA_DSN para rodar contra o geodata (ver geo_query/db.py)",
)


@pytest.fixture(scope="module")
def gq() -> GeoQuery:
    consulta = GeoQuery()
    yield consulta
    consulta.close()


def _buffer(gq: GeoQuery, metros: int) -> bytes:
    return gq._rows(
        """
        select ST_AsBinary(
            ST_Buffer(ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4674)::geography, %s)::geometry
        ) as w
        """,
        [metros],
    )[0]["w"]


def _buffer_no_pior_esgoto(gq: GeoQuery) -> bytes:
    return gq._rows(
        """
        select ST_AsBinary(ST_Buffer(ST_PointOnSurface(s.geom)::geography, 50)::geometry) as w
        from ibge.setor_censitario s
        join ibge_tabular.setor_resumo r using (cod_setor)
        where r.pct_esgoto_rede is not null
        order by r.pct_esgoto_rede, r.cod_setor
        limit 1
        """,
        [],
    )[0]["w"]


@_PRECISA_GEODATA
def test_raio_x_devolve_bloco_e_rateio_no_mesmo_retrato(gq: GeoQuery) -> None:
    resultado = gq.raio_x_por_geometria(_buffer(gq, 500))
    assert resultado["escala"]["setores"] > 1
    assert resultado["escala"]["setores_parciais"] > 0
    assert resultado["escala"]["populacao_rateada"] > 0
    assert resultado["perfil"]["renda_media"] is not None
    assert resultado["contraste"]["minimo"] <= resultado["contraste"]["maximo"]
    assert resultado["contraste"]["setores"]
    assert resultado["escala"]["municipio"]["nm_mun"] == "São Paulo"
    assert resultado["equipamentos"]["disponivel"] is True
    assert resultado["equipamentos"]["ensino"]["enderecos"] >= 0


@_PRECISA_GEODATA
def test_equipamentos_distingue_area_coberta_de_fora_do_recorte(gq: GeoQuery) -> None:
    coberta = gq.equipamentos_por_geometria(_buffer(gq, 500))
    fora = gq.equipamentos_por_geometria(
        gq._rows(
            """
            select ST_AsBinary(
                ST_Buffer(ST_SetSRID(ST_MakePoint(-47.8825, -15.7942), 4674)::geography, 500)
                    ::geometry
            ) as w
            """,
            [],
        )[0]["w"]
    )
    assert coberta["disponivel"] is True
    assert coberta["cobertura_pct"] == 100
    assert fora["disponivel"] is False
    assert fora["cobertura_pct"] == 0


@_PRECISA_GEODATA
def test_raio_x_mostra_apenas_a_carencia_de_saneamento(gq: GeoQuery) -> None:
    alerta = gq.raio_x_por_geometria(_buffer_no_pior_esgoto(gq))["saneamento"]
    assert alerta is not None
    assert all(
        indicador["cobertura_pct"] < LIMIAR_COBERTURA_SANEAMENTO_PCT
        for indicador in alerta["indicadores"]
    )
    assert "pct_esgoto_rede" in {indicador["metrica"] for indicador in alerta["indicadores"]}


@_PRECISA_GEODATA
def test_raio_x_degrada_a_lista_sem_descartar_o_agregado(gq: GeoQuery) -> None:
    # O município inteiro deixou de ser entrada válida quando a A-001 mediu o teto
    # de 50 km². Um buffer denso sob o teto ainda prova a degradação da lista.
    resultado = gq.raio_x_por_geometria(_buffer(gq, 3_000))
    assert resultado["escala"]["setores"] > TETO_SETORES_RAIO_X
    assert resultado["contraste"]["truncada"] is True
    assert resultado["contraste"]["setores"] == []
    assert resultado["contraste"]["faixas"]


@_PRECISA_GEODATA
def test_raio_x_recusa_area_acima_do_teto(gq: GeoQuery) -> None:
    lado = int(TETO_AREA_RAIO_X_M2**0.5 + 1_000)
    wkb = _buffer(gq, lado)
    with pytest.raises(ValueError, match=r"50 km² \(50\.000\.000 m²\)"):
        gq.raio_x_por_geometria(wkb)


@_PRECISA_GEODATA
def test_populacao_contida_e_zero_e_nao_desconhecido(gq: GeoQuery) -> None:
    """Sem nenhum setor inteiro, a contida vale 0 — não NULL.

    A diferença não é de estilo: na tela, NULL vira travessão e se lê "não sei",
    enquanto o que se sabe aqui é que nenhum setor entrou inteiro. Medido num buffer
    de 200 m em São Caetano do Sul: 7 setores tocados, 7 parciais, contida 0.
    """
    resultado = gq.raio_x_por_geometria(_buffer(gq, 120))
    escala = resultado["escala"]
    assert escala["populacao_contida"] is not None
    assert escala["populacao_contida"] + escala["populacao_rateada"] == escala["populacao"]


@_PRECISA_GEODATA
def test_faixas_nao_carregam_balde_de_limites_nulos(gq: GeoQuery) -> None:
    """Setor sem a métrica não vira uma quinta faixa vazia.

    `width_bucket` devolve NULL para valor nulo, e essa linha chegava à tela como uma
    barra de "— a —" com zero habitantes. Setor sem dado tem cor própria na legenda;
    não é faixa.
    """
    faixas = gq.raio_x_por_geometria(_buffer(gq, 500))["contraste"]["faixas"]
    assert faixas
    assert all(f["faixa"] is not None for f in faixas)
    assert all(f["inferior"] is not None and f["superior"] is not None for f in faixas)
