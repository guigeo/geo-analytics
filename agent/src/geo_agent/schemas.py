"""Contrato da API do chat (espelhado em web/src/chat/api.ts)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class ContextoMapa(BaseModel):
    """Estado do mapa no momento da pergunta (ancora respostas 'no que estou vendo')."""

    bbox: tuple[float, float, float, float] | None = None  # oeste, sul, leste, norte
    zoom: float | None = None
    centro: tuple[float, float] | None = None  # lon, lat
    camadas_ativas: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    pergunta: str = Field(min_length=1)
    session_id: str = Field(min_length=1)
    contexto_mapa: ContextoMapa | None = None


class Destaques(BaseModel):
    """O que o mapa deve pintar: codigos IBGE por camada (filtro nos PMTiles)."""

    camada: Literal["municipio", "setor", "bairro", "distrito", "zoneamento_sp", "h3_domicilios"]
    codigos: list[str]


class ChatResponse(BaseModel):
    resposta: str
    destaques: Destaques | None = None
    dados: list[dict[str, Any]] | None = None


class DesenhoNovo(BaseModel):
    """O que o front manda para criar um desenho.

    A geometria chega como GeoJSON porque e o que o MapLibre produz e consome; o
    servidor a valida e a converte. `origem` NAO entra aqui de proposito: quem cria
    pela API e sempre o usuario desenhando, e a carga administrativa de KML escreve
    pelo banco, nao por esta rota.
    """

    tipo: Literal["ponto", "poligono", "buffer"]
    nome: str = Field(min_length=1, max_length=200)
    geometria: dict[str, Any]
    categoria: str | None = Field(None, max_length=100)
    cor: str = Field("#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")
    observacao: str | None = Field(None, max_length=2000)
    # So no buffer, e ai obrigatorio. O teto de 50 km e o maior raio MEDIDO (49.185
    # setores em 640 ms) — nao e limite geografico, e o limite do que se sabe que
    # responde. O front tem o mesmo numero em `MAX_RAIO_M`, e a razao de existir nos
    # dois e a de sempre: um avisa cedo, o outro protege.
    raio_m: float | None = Field(None, gt=0, le=50_000)

    @model_validator(mode="after")
    def _buffer_precisa_de_centro_e_raio(self) -> DesenhoNovo:
        """No buffer, `geometria` e o CENTRO e o raio e obrigatorio.

        O circulo definitivo e gerado pelo PostGIS com ST_Buffer sobre geography, e nao
        pelo navegador (Decisao 2 do DESIGN): o front manda um Point, nao um poligono
        de 64 lados. Sem esta validacao, um buffer sem raio viraria um desenho de tipo
        'buffer' cuja geometria e um ponto — e ninguem descobriria ate o mapa nao ter
        o que pintar.
        """
        if self.tipo == "buffer":
            if self.raio_m is None:
                raise ValueError("um buffer precisa de raio_m")
            if self.geometria.get("type") != "Point":
                raise ValueError("no buffer, geometria deve ser o centro (um Point)")
        elif self.raio_m is not None:
            raise ValueError("raio_m so faz sentido no tipo 'buffer'")
        return self


class DesenhoEdicao(BaseModel):
    """Edicao de ATRIBUTOS. A geometria nao esta aqui, e a ausencia e a regra.

    Redesenhar tracado salvo ficou fora do MVP (DEFINE): para mudar a forma, apaga e
    desenha de novo. Se um dia entrar, este e o lugar onde a decisao se ve.
    """

    nome: str | None = Field(None, min_length=1, max_length=200)
    categoria: str | None = Field(None, max_length=100)
    cor: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    observacao: str | None = Field(None, max_length=2000)


class Desenho(BaseModel):
    """Um desenho como o front o recebe."""

    id: UUID
    tipo: str
    nome: str
    categoria: str | None = None
    cor: str
    observacao: str | None = None
    origem: str
    geometria: dict[str, Any]
    area_m2: float | None = None
    raio_m: float | None = None
    criado_em: datetime
    atualizado_em: datetime


class PaginaDeDesenhos(BaseModel):
    """Uma pagina da lista. Paginada desde o inicio porque o volume-alvo e de centenas."""

    itens: list[Desenho]
    total: int
    pagina: int
    tamanho: int


class ReferenciaMunicipal(BaseModel):
    """Os valores do município que tornam legível cada número da área."""

    cd_mun: str
    nm_mun: str
    nm_uf: str
    pop_total: float | None = None
    domicilios_ocupados: float | None = None
    densidade_hab_km2: float | None = None
    renda_media: float | None = None
    media_moradores: float | None = None
    pop_masculino: float | None = None
    pop_feminino: float | None = None
    pct_classe_a: float | None = None
    pct_classe_b: float | None = None
    pct_classe_c: float | None = None
    pct_classe_de: float | None = None


class ComProveniencia(BaseModel):
    """Campos que acompanham todo bloco para a ressalva não virar decisão da tela."""

    fonte: str
    periodo: str
    metodo: str
    cobertura: str
    avisos: list[str] = Field(default_factory=list)


class FaixaDoRaioX(BaseModel):
    faixa: int
    inferior: float | None = None
    superior: float | None = None
    populacao: float | None = None


class SetorDoRaioX(BaseModel):
    cod_setor: str
    fracao: float
    valor: float | None = None
    pop_total: float | None = None


class BlocoEscala(ComProveniencia):
    area_km2: float
    setores: int
    populacao: float | None = None
    populacao_contida: float | None = None
    populacao_rateada: float | None = None
    setores_parciais: int
    domicilios_ocupados: float | None = None
    densidade_hab_km2: float | None = None
    municipio: ReferenciaMunicipal


class BlocoContraste(ComProveniencia):
    metrica: str
    rotulo: str
    minimo: float | None = None
    maximo: float | None = None
    faixas: list[FaixaDoRaioX] = Field(default_factory=list)
    setores: list[SetorDoRaioX] = Field(default_factory=list)
    truncada: bool = False
    aviso: str | None = None


class BlocoPerfil(ComProveniencia):
    renda_media: float | None = None
    media_moradores: float | None = None
    pop_masculino: float | None = None
    pop_feminino: float | None = None
    municipio: ReferenciaMunicipal


class BlocoClasseSocial(ComProveniencia):
    pct_a: float | None = None
    pct_b: float | None = None
    pct_c: float | None = None
    pct_de: float | None = None
    municipio: ReferenciaMunicipal
    situacao: str | None = None


class Qualidade(ComProveniencia):
    fracao_menor: float | None = None
    setores_parciais: int
    populacao_rateada: float | None = None


class ZonaNaArea(BaseModel):
    cod_zona: str
    nome_zona: str
    e_zona: bool | None = None
    lei: str | None = None
    cod_municipio: str
    percentual: float | None = None


class BlocoRegulacao(ComProveniencia):
    disponivel: bool
    zonas: list[ZonaNaArea] = Field(default_factory=list)
    aviso: str | None = None


class RaioX(BaseModel):
    """Contrato estável do diagnóstico de uma área, produzido sem LLM."""

    versao_calculo: str
    gerado_em: datetime
    sintese: str
    escala: BlocoEscala
    contraste: BlocoContraste
    perfil: BlocoPerfil
    classe_social: BlocoClasseSocial
    qualidade: Qualidade
    regulacao: BlocoRegulacao


class GeocodeHit(BaseModel):
    """Resultado do proxy de geocoding (Nominatim/OSM) — busca de endereço no front."""

    rotulo: str
    detalhe: str
    bbox: tuple[float, float, float, float]  # oeste, sul, leste, norte


class Entrar(BaseModel):
    """O que a tela de entrar manda. Nada mais existe no portal."""

    # `str`, e nao um tipo de e-mail validado: validar o formato aqui adicionaria a
    # dependencia `email-validator` para nada. Quem digita um endereco malformado
    # simplesmente nao casa com conta nenhuma, e cai no mesmo 401 de senha errada —
    # que e o comportamento desejado, porque distinguir os dois casos ja seria contar
    # quais e-mails existem.
    email: str = Field(min_length=1, max_length=320)
    senha: str = Field(min_length=1, max_length=200)


class TrocaDeSenha(BaseModel):
    """Troca da propria senha — a atual e cobrada mesmo com a sessao valida.

    Quem tem o computador destravado tem a sessao; cobrar a senha atual e o que impede
    que passar por uma mesa aberta vire tomar a conta.
    """

    senha_atual: str = Field(min_length=1, max_length=200)
    senha_nova: str = Field(min_length=1, max_length=200)


class Eu(BaseModel):
    """Quem esta dentro. O front so precisa disto para decidir o que mostrar.

    Nao ha papel nem permissao: o escopo do portal nao distingue pessoas dentro do
    cliente, e um campo a mais aqui seria a primeira rachadura nisso.
    """

    email: str
    trocar_senha: bool
