"""Tools do agente: args Pydantic -> JSON Schema OpenAI; dispatch para o GeoQuery.

Uma tool = um BaseModel (docstring vira description) + um handler no TOOL_REGISTRY.
Adicionar tool = 1 model + 1 handler + 1 linha no registry.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from geo_query import GeoQuery

from .acervo import Acervo, AcervoIndisponivel

from .geocode import GeocodeIndisponivel
from .geocode import pontos as geocode_pontos
from pydantic import BaseModel, Field, ValidationError

Camada = Literal["municipio", "setor", "bairro", "distrito"]

UF_POR_SIGLA: dict[str, str] = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AP": "Amapá",
    "AM": "Amazonas",
    "BA": "Bahia",
    "CE": "Ceará",
    "DF": "Distrito Federal",
    "ES": "Espírito Santo",
    "GO": "Goiás",
    "MA": "Maranhão",
    "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais",
    "PA": "Pará",
    "PB": "Paraíba",
    "PR": "Paraná",
    "PE": "Pernambuco",
    "PI": "Piauí",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul",
    "RO": "Rondônia",
    "RR": "Roraima",
    "SC": "Santa Catarina",
    "SP": "São Paulo",
    "SE": "Sergipe",
    "TO": "Tocantins",
}


def normalize_uf(uf: str | None) -> str | None:
    """'PR'/'pr' -> 'Paraná'; nomes por extenso passam direto (filtro usa nm_uf)."""
    if uf is None:
        return None
    return UF_POR_SIGLA.get(uf.strip().upper(), uf.strip())


# Rotulos legiveis (PT-BR) das colunas curadas do Censo 2022. A CURADORIA (quais
# variaveis existem) e do geodata — servidor-dados-gis/cargas/censo_nomes.tsv, 41
# delas; aqui e so a apresentacao do nome. Ate 2026-08-20 isto espelhava um THEMES
# do pipeline, que nao existe mais — fonte unica pro
# glossario no system prompt e pro payload de listar_metricas, pra o LLM nunca
# precisar (nem arriscar esquecer de) inventar a traducao do nome cru da coluna.
METRIC_LABELS: dict[str, str] = {
    "area_km2": "área (km²)",
    "pop_total": "população total",
    "domicilios_total": "total de domicílios",
    "media_moradores": "média de moradores por domicílio",
    "domicilios_ocupados": "domicílios ocupados",
    "pop_masculino": "população masculina",
    "pop_feminino": "população feminina",
    "cor_branca": "população branca",
    "cor_preta": "população preta",
    "cor_amarela": "população amarela",
    "cor_parda": "população parda",
    "cor_indigena": "população indígena",
    "dom_ocup_perm": "domicílios ocupados permanentes",
    "dom_agua_rede": "domicílios com água da rede geral",
    "dom_esgoto_rede": "domicílios com esgoto na rede geral",
    "dom_lixo_coletado": "domicílios com lixo coletado",
    "responsaveis_com_rendimento": "responsáveis pelo domicílio com rendimento",
    "renda_media": "renda média mensal do responsável (R$)",
    "renda_mediana": "renda mediana mensal do responsável (R$)",
    "densidade_hab_km2": "densidade populacional (hab/km²)",
    "pct_agua_rede": "% de domicílios com água da rede geral",
    "pct_esgoto_rede": "% de domicílios com esgoto na rede geral",
    "pct_lixo_coletado": "% de domicílios com lixo coletado",
    "lon": "longitude do centroide",
    "lat": "latitude do centroide",
    # Classe social: as UNICAS metricas aqui que o IBGE NAO publica. O rotulo diz
    # "estimada" em todas porque ele e o que o LLM le e repete -- a regra 8 do
    # prompt manda declarar a estimativa, e o rotulo e a segunda trava, para o caso
    # de a regra se perder num contexto longo. Ver servidor-dados-gis/docs/classe-social.md.
    "pct_classe_a": "% de domicílios na classe A (estimada)",
    "pct_classe_b": "% de domicílios na classe B (estimada)",
    "pct_classe_c": "% de domicílios na classe C (estimada)",
    # DE e um estrato so, como no Criterio Brasil -- a ABEP nao separa D de E, e um
    # corte inventado no meio de tres cortes ancorados seria indistinguivel deles.
    "pct_classe_de": "% de domicílios no estrato D/E (estimada)",
    "classe_social_score": "posição socioeconômica estimada (0–100, percentil no nível)",
    "renda_domiciliar_estimada": "renda mediana mensal do DOMICÍLIO (estimada)",
    "classe_social_situacao": "confiabilidade da estimativa de classe social",
}


# --- args das tools (docstring = description no schema OpenAI) -----------------


class ListarMetricasArgs(BaseModel):
    """Lista as métricas numéricas consultáveis do Censo 2022 (por município, bairro ou setor)."""

    nivel: Literal["municipio", "setor", "bairro", "distrito"] = "municipio"


class BuscarMunicipioArgs(BaseModel):
    """Busca municípios pelo nome (aceita sem acento) e resolve para o código IBGE.

    Use SEMPRE que o usuário citar um município por nome; os mais populosos vêm primeiro.
    """

    nome: str = Field(min_length=2, description="Nome (ou parte) do município")
    uf: str | None = Field(None, description="UF para desambiguar, por nome ou sigla")


class InfoMunicipioArgs(BaseModel):
    """Todos os atributos do Censo 2022 de um município pelo código IBGE (7 dígitos)."""

    cd_mun: str = Field(min_length=7, max_length=7)


class InfoSetorArgs(BaseModel):
    """Todos os atributos do Censo 2022 de um setor censitário pelo código (15 dígitos)."""

    cd_setor: str = Field(min_length=15, max_length=15)


class RankingMunicipiosArgs(BaseModel):
    """Top-N municípios por uma métrica do Censo 2022, opcionalmente filtrando por UF.

    ordem='desc' = maiores primeiro; 'asc' = menores primeiro (ex.: pior cobertura).
    """

    metrica: str = Field(description="Métrica numérica; em dúvida, use listar_metricas antes")
    uf: str | None = Field(None, description="UF por nome ou sigla (ex.: 'Paraná' ou 'PR')")
    n: int = Field(10, ge=1, le=100)
    ordem: Literal["asc", "desc"] = "desc"


class SetoresProximosArgs(BaseModel):
    """Setores censitários num raio (km) de um setor dado. Distância exata, do polígono real."""

    cd_setor: str = Field(min_length=15, max_length=15)
    raio_km: float = Field(2.0, gt=0, le=50)
    limite: int = Field(20, ge=1, le=100)


class SetoresNoPontoArgs(BaseModel):
    """Setores censitários num raio (km) de um ponto lon/lat — use o centro do viewport
    para perguntas do tipo 'por aqui'. Distância exata, do polígono real."""

    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    raio_km: float = Field(2.0, gt=0, le=50)
    limite: int = Field(20, ge=1, le=100)


class SetorQueContemArgs(BaseModel):
    """O setor censitário que CONTÉM um ponto lon/lat — um só, não um raio.

    Use para "em que setor fica este endereço/ponto?". Para "o que tem por aqui",
    que é vizinhança, use setores_no_ponto.
    """

    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class InfoBairroArgs(BaseModel):
    """Todos os atributos do Censo 2022 de um bairro pelo código IBGE (10 dígitos)."""

    cd_bairro: str = Field(min_length=10, max_length=10)


class RankingBairrosArgs(BaseModel):
    """Top-N bairros por uma métrica do Censo 2022, dentro de um município ou de uma UF.

    Prefira filtrar por município (cd_mun, de buscar_municipio): sem recorte a
    comparação é o Brasil inteiro, que quase nunca é a pergunta.
    ordem='desc' = maiores primeiro; 'asc' = menores primeiro (ex.: pior cobertura).
    """

    metrica: str = Field(description="Métrica numérica; em dúvida, use listar_metricas antes")
    cd_mun: str | None = Field(
        None, min_length=7, max_length=7, description="Código IBGE do município"
    )
    uf: str | None = Field(None, description="UF por nome ou sigla (ex.: 'Paraná' ou 'PR')")
    n: int = Field(10, ge=1, le=100)
    ordem: Literal["asc", "desc"] = "desc"


class BairroQueContemArgs(BaseModel):
    """O bairro que CONTÉM um ponto lon/lat — um só, não um raio.

    A malha de bairros do IBGE só cobre onde há bairro: fora de área urbana mapeada
    não há resposta, e isso não é erro.
    """

    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class InfoDistritoArgs(BaseModel):
    """Todos os atributos do Censo 2022 de um distrito pelo código IBGE (9 dígitos)."""

    cd_distrito: str = Field(min_length=9, max_length=9)


class RankingDistritosArgs(BaseModel):
    """Top-N distritos por uma métrica do Censo 2022, dentro de um município ou de uma UF.

    Diferente do ranking de bairros, aqui os dois recortes servem: distrito cobre o
    país, então "maiores distritos do Paraná" é pergunta legítima — mas o resultado
    virá dominado por distritos sede, que têm o nome da cidade e são a cidade quase
    inteira. Para comparar partes de uma cidade, filtre por cd_mun.
    ordem='desc' = maiores primeiro; 'asc' = menores primeiro (ex.: pior cobertura).
    """

    metrica: str = Field(description="Métrica numérica; em dúvida, use listar_metricas antes")
    cd_mun: str | None = Field(
        None, min_length=7, max_length=7, description="Código IBGE do município"
    )
    uf: str | None = Field(None, description="UF por nome ou sigla (ex.: 'Paraná' ou 'PR')")
    n: int = Field(10, ge=1, le=100)
    ordem: Literal["asc", "desc"] = "desc"


class DistritoQueContemArgs(BaseModel):
    """O distrito que CONTÉM um ponto lon/lat — um só, não um raio.

    Cobre praticamente todo o território: todo município instalado até o Censo 2022
    tem ao menos o distrito sede. É a alternativa quando bairro_que_contem não acha
    nada por estar fora de área urbana mapeada.
    """

    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class InfoLocalArgs(BaseModel):
    """Dados de um lugar citado por nome, no MELHOR recorte disponível ali.

    Use esta tool sempre que o usuário citar um lugar dentro de uma cidade — bairro,
    região, nome de vizinhança. Ela tenta bairro primeiro, cai para distrito quando o
    município não tem malha de bairro, e resolve por localização quando o nome não
    existe no IBGE (Vila Madalena, Higienópolis). A resposta traz `nivel` e `avisos`:
    os avisos são obrigatórios no texto da resposta.

    Informe `municipio` sempre que a pergunta disser de onde é — nome de bairro
    repete em quase toda cidade.
    """

    nome: str = Field(min_length=2, description="Nome do bairro, distrito ou região")
    municipio: str | None = Field(None, description="Nome do município, para desambiguar")
    uf: str | None = Field(None, description="UF para desambiguar, por nome ou sigla")


class InfoAreaDesenhadaArgs(BaseModel):
    """Censo 2022 agregado sob uma AREA QUE O USUARIO DESENHOU no mapa e salvou.

    Use quando a pergunta citar um recorte pelo nome que o usuario deu ("a area de
    cobertura norte", "o poligono da fazenda", "a regiao que eu desenhei").

    NA DUVIDA ENTRE ESTA E info_local, CHAME ESTA PRIMEIRO e nao pergunte ao usuario
    qual das duas e: se nao existir desenho com aquele nome, ela devolve em `existem`
    os nomes que existem, e ai voce chama info_local. Custa uma chamada; perguntar
    custa um turno inteiro. Nomes de desenho parecem nomes de lugar de proposito —
    quem desenha uma area sobre a Se costuma chama-la de "area da Se".

    Peca em `metricas` o que a pergunta quer (use listar_metricas para os nomes). Sem
    `metricas`, volta so a populacao.
    """

    nome: str = Field(min_length=1, description="Nome do desenho, como foi salvo")
    metricas: list[str] | None = Field(
        None, description="Campos do Censo a agregar sob a area (ex.: pop_total, renda_media)"
    )


# --- resultado + dispatch -------------------------------------------------------


@dataclass
class Contexto:
    """Os bancos que uma tool pode alcancar — e a assimetria entre eles.

    Era so a `GeoQuery` ate 2026-09-01. Passou a ser um par quando a pergunta sobre a
    area desenhada entrou: ela le a geometria no `app_clientes` e cruza no `geodata`,
    e sao dois bancos por exigencia da regra 5 do ADR-0001 (o central tem de continuar
    reconstruivel). O tipo mostra a assimetria em vez de escondê-la: o `geodata`
    sempre existe, o `acervo` pode faltar — sem ele o chat continua inteiro, so nao
    responde sobre desenho (§9 do ADR).
    """

    geodata: GeoQuery
    acervo: Acervo | None = None


@dataclass
class ToolResult:
    """Resultado de uma tool: payload p/ o LLM + codigos p/ o mapa (deterministico)."""

    payload: Any
    camada: Camada | None = None
    codigos: list[str] = field(default_factory=list)
    rows: list[dict[str, Any]] | None = None
    error: bool = False

    @property
    def payload_json(self) -> str:
        return json.dumps(self.payload, ensure_ascii=False, default=str)


def _codes(rows: list[dict[str, Any]], key: str) -> list[str]:
    return [str(r[key]) for r in rows if r.get(key) is not None]


def _listar_metricas(ctx: Contexto, a: ListarMetricasArgs) -> ToolResult:
    campos = ctx.geodata.metricas(a.nivel)
    payload = [{"campo": c, "rotulo": METRIC_LABELS.get(c, c)} for c in campos]
    return ToolResult(payload=payload)


def _buscar_municipio(ctx: Contexto, a: BuscarMunicipioArgs) -> ToolResult:
    rows = ctx.geodata.busca_municipios(a.nome, uf=normalize_uf(a.uf))
    return ToolResult(payload=rows, camada="municipio", codigos=_codes(rows, "cd_mun"), rows=rows)


def _info_municipio(ctx: Contexto, a: InfoMunicipioArgs) -> ToolResult:
    row = ctx.geodata.municipio(a.cd_mun)
    if row is None:
        return ToolResult(payload={"erro": f"município {a.cd_mun} não encontrado"}, error=True)
    return ToolResult(payload=row, camada="municipio", codigos=[a.cd_mun], rows=[row])


def _info_setor(ctx: Contexto, a: InfoSetorArgs) -> ToolResult:
    row = ctx.geodata.setor(a.cd_setor)
    if row is None:
        return ToolResult(payload={"erro": f"setor {a.cd_setor} não encontrado"}, error=True)
    return ToolResult(payload=row, camada="setor", codigos=[a.cd_setor], rows=[row])


def _ranking(ctx: Contexto, a: RankingMunicipiosArgs) -> ToolResult:
    rows = ctx.geodata.ranking_municipios(a.metrica, uf=normalize_uf(a.uf), n=a.n, ordem=a.ordem)
    return ToolResult(payload=rows, camada="municipio", codigos=_codes(rows, "cd_mun"), rows=rows)


def _setores_proximos(ctx: Contexto, a: SetoresProximosArgs) -> ToolResult:
    rows = ctx.geodata.setores_proximos(a.cd_setor, raio_km=a.raio_km, limite=a.limite)
    return ToolResult(payload=rows, camada="setor", codigos=_codes(rows, "cd_setor"), rows=rows)


def _setores_no_ponto(ctx: Contexto, a: SetoresNoPontoArgs) -> ToolResult:
    rows = ctx.geodata.setores_no_ponto(a.lon, a.lat, raio_km=a.raio_km, limite=a.limite)
    return ToolResult(payload=rows, camada="setor", codigos=_codes(rows, "cd_setor"), rows=rows)


def _setor_que_contem(ctx: Contexto, a: SetorQueContemArgs) -> ToolResult:
    row = ctx.geodata.setor_no_ponto(a.lon, a.lat)
    if row is None:
        return ToolResult(
            payload={"erro": f"nenhum setor contém o ponto ({a.lon}, {a.lat})"}, error=True
        )
    return ToolResult(payload=row, camada="setor", codigos=[str(row["cd_setor"])], rows=[row])


def _info_bairro(ctx: Contexto, a: InfoBairroArgs) -> ToolResult:
    row = ctx.geodata.bairro(a.cd_bairro)
    if row is None:
        return ToolResult(payload={"erro": f"bairro {a.cd_bairro} não encontrado"}, error=True)
    return ToolResult(payload=row, camada="bairro", codigos=[a.cd_bairro], rows=[row])


def _ranking_bairros(ctx: Contexto, a: RankingBairrosArgs) -> ToolResult:
    rows = ctx.geodata.ranking_bairros(
        a.metrica, cd_mun=a.cd_mun, uf=normalize_uf(a.uf), n=a.n, ordem=a.ordem
    )
    return ToolResult(payload=rows, camada="bairro", codigos=_codes(rows, "cd_bairro"), rows=rows)


def _bairro_que_contem(ctx: Contexto, a: BairroQueContemArgs) -> ToolResult:
    row = ctx.geodata.bairro_no_ponto(a.lon, a.lat)
    if row is None:
        return ToolResult(
            payload={
                "erro": f"nenhum bairro contém o ponto ({a.lon}, {a.lat})",
                "motivo": "a malha de bairros do IBGE cobre apenas área urbana mapeada",
            },
            error=True,
        )
    return ToolResult(payload=row, camada="bairro", codigos=[str(row["cd_bairro"])], rows=[row])


def _info_distrito(ctx: Contexto, a: InfoDistritoArgs) -> ToolResult:
    row = ctx.geodata.distrito(a.cd_distrito)
    if row is None:
        return ToolResult(payload={"erro": f"distrito {a.cd_distrito} não encontrado"}, error=True)
    return ToolResult(payload=row, camada="distrito", codigos=[a.cd_distrito], rows=[row])


def _ranking_distritos(ctx: Contexto, a: RankingDistritosArgs) -> ToolResult:
    rows = ctx.geodata.ranking_distritos(
        a.metrica, cd_mun=a.cd_mun, uf=normalize_uf(a.uf), n=a.n, ordem=a.ordem
    )
    return ToolResult(
        payload=rows, camada="distrito", codigos=_codes(rows, "cd_distrito"), rows=rows
    )


def _distrito_que_contem(ctx: Contexto, a: DistritoQueContemArgs) -> ToolResult:
    row = ctx.geodata.distrito_no_ponto(a.lon, a.lat)
    if row is None:
        return ToolResult(
            payload={"erro": f"nenhum distrito contém o ponto ({a.lon}, {a.lat})"},
            error=True,
        )
    return ToolResult(payload=row, camada="distrito", codigos=[str(row["cd_distrito"])], rows=[row])


# Acima disto, o distrito ocupa quase todo o municipio e responder por ele e responder
# pelo municipio. Vale para 3.377 dos 10.698 distritos — 31,6% (medido em 2026-08-22),
# entao o aviso e caso comum, nao excecao.
LIMIAR_DISTRITO_E_O_MUNICIPIO = 0.95


def _avisa_distorcao(row: dict[str, Any]) -> str | None:
    """Aviso quando o distrito nao e um recorte menor: ele E o municipio."""
    fracao = row.get("fracao_do_municipio")
    if fracao is None or float(fracao) < LIMIAR_DISTRITO_E_O_MUNICIPIO:
        return None
    return (
        f"o distrito {row['nm_distrito']} ocupa {float(fracao) * 100:.0f}% de "
        f"{row['nm_mun']} — este número é o do município inteiro, não de um recorte menor"
    )


# Como a situacao da estimativa se le em portugues. O banco guarda o token canonico
# (ele e a chave, e traduzir na carga apagaria a chave); a traducao mora aqui, do lado
# de quem escreve para gente.
_SITUACAO_CLASSE_SOCIAL = {
    "revisar_mediana_fora": (
        "neste recorte o ajuste erra a mediana que ficou retida como prova, e isso "
        "acontece onde a desigualdade interna é alta — que é justamente onde uma "
        "distribuição só descreve mal quem mora ali"
    ),
    "revisar_cobertura_baixa": (
        "parte dos setores deste recorte está sem dado de renda por sigilo, então a "
        "estimativa cobre menos gente do que o recorte inteiro"
    ),
    "revisar_n_pequeno": (
        "há poucos responsáveis neste recorte, e com poucos a renda fica instável"
    ),
    "revisar_sem_mediana": (
        "o IBGE não publica a mediana deste recorte, então a prova que marcaria um "
        "ajuste ruim não pode ser feita aqui"
    ),
    "sem_dado_de_renda": (
        "a renda deste recorte está suprimida por sigilo, e sem ela não há estimativa "
        "de classe social — o que não é o mesmo que ser pobre"
    ),
}


def _avisos_classe_social(row: dict[str, Any]) -> list[str]:
    """Os avisos que a classe social obriga: que ela e estimativa, e quando duvidar dela.

    Sai da TOOL e nao do prompt por causa da regra 8 do ADR-0001: o que muda o sentido
    de um numero e dado, e ao prompt cabe so escolher as palavras. Um numero de classe
    social lido como se o IBGE o tivesse publicado e o pior defeito possivel deste
    produto, e deixar a ressalva por conta de uma instrucao num prompt longo e deixa-la
    cair no dia em que o contexto ficar cheio.
    """
    if row.get("classe_social_score") is None and row.get("pct_classe_a") is None:
        return []
    avisos = [
        "as classes abaixo são ESTIMATIVA NOSSA a partir do Censo 2022, não número "
        "publicado pelo IBGE — ele não divulga classe social. Os cortes reproduzem a "
        "distribuição nacional do Critério Brasil 2024 (A 3,1%, B 21,5%, C 47,0%, "
        "DE 28,4%), mas o método é outro: a ABEP classifica por posse de bens e "
        "instrução, e aqui é renda domiciliar estimada. D e E não são separados"
    ]
    if motivo := _SITUACAO_CLASSE_SOCIAL.get(str(row.get("classe_social_situacao"))):
        avisos.append(f"a estimativa de classe social aqui é menos confiável: {motivo}")
    return avisos


def _resultado_nivel(nivel: str, row: dict[str, Any], avisos: list[str]) -> ToolResult:
    """Empacota um achado da cascata: o payload que o LLM le e o codigo que o mapa pinta."""
    chave = "cd_bairro" if nivel == "bairro" else "cd_distrito"
    return ToolResult(
        payload={"nivel": nivel, "avisos": avisos + _avisos_classe_social(row), "dados": row},
        camada=nivel,  # type: ignore[arg-type]
        codigos=[str(row[chave])],
        rows=[row],
    )


def _info_local(ctx: Contexto, a: InfoLocalArgs) -> ToolResult:
    """A cascata bairro -> distrito -> localizacao, em codigo e nao no prompt.

    Fica aqui, e nao como instrucao no system prompt, porque o aviso e a parte que
    nao pode falhar: e justamente quando o dado sai de um nivel diferente do que a
    pessoa pediu que ela precisa saber. Regra do projeto — os dados e os destaques
    saem das rows das tools; o LLM so escreve o texto.

    A ordem tem uma sutileza que so apareceu executando: **nome exato em qualquer
    nivel ganha de substring em qualquer nivel**. Encadear "bairro completo, depois
    distrito completo" fazia "Curitiba" achar o bairro "Cidade Industrial de
    Curitiba" por substring e nunca chegar ao distrito de Curitiba, que e exato.
    """
    uf = normalize_uf(a.uf)

    # 1 e 2. Nome exato: bairro (recorte mais fino, 46,7% da populacao) e depois
    #        distrito (leva a cobertura a 76,2% — e o caso de Sao Paulo, que nao tem
    #        bairro nenhum e tem 96 distritos).
    if bairros := ctx.geodata.busca_bairros(a.nome, municipio=a.municipio, uf=uf, exato=True):
        return _resultado_nivel("bairro", ctx.geodata.bairro(bairros[0]["cd_bairro"]), [])

    if distritos := ctx.geodata.busca_distritos(a.nome, municipio=a.municipio, uf=uf, exato=True):
        row = ctx.geodata.distrito(distritos[0]["cd_distrito"])
        return _resultado_nivel("distrito", row, _avisos_distrito(a.nome, row))

    # 3 e 4. So agora substring, na mesma ordem de niveis.
    if bairros := ctx.geodata.busca_bairros(a.nome, municipio=a.municipio, uf=uf, exato=False):
        return _resultado_nivel("bairro", ctx.geodata.bairro(bairros[0]["cd_bairro"]), [])

    if distritos := ctx.geodata.busca_distritos(a.nome, municipio=a.municipio, uf=uf, exato=False):
        row = ctx.geodata.distrito(distritos[0]["cd_distrito"])
        return _resultado_nivel("distrito", row, _avisos_distrito(a.nome, row))

    # 5. O nome nao existe no IBGE em nivel nenhum. Ultimo recurso: resolver em
    #    coordenada e perguntar ao PostGIS quem a contem. E o caso "Vila Nova
    #    Conceicao", ausente de bairro, distrito e do nome_bairro do setor.
    return _info_local_por_localizacao(ctx, a, uf)


def _avisos_distrito(pedido: str, row: dict[str, Any]) -> list[str]:
    """Os dois avisos do nivel distrito: o fallback e, se for o caso, a distorcao."""
    avisos = [
        f"{pedido} não existe como bairro na malha do IBGE; "
        f"os números abaixo são do DISTRITO {row['nm_distrito']}"
    ]
    if (d := _avisa_distorcao(row)) is not None:
        avisos.append(d)
    return avisos


def _info_local_por_localizacao(ctx: Contexto, a: InfoLocalArgs, uf: str | None) -> ToolResult:
    """Resolve o nome em coordenada e devolve o recorte do IBGE que a contem.

    O geocoding e CONFINADO ao municipio informado, e isso nao e refinamento: sem
    o confinamento, "Vila Nova Conceicao, Sao Paulo" voltava de Laranjal Paulista,
    no interior, porque o Nominatim leu "Sao Paulo" como estado. A resposta vinha
    com numeros de outra cidade e cara de certeza. O PostGIS e o juiz — dos
    candidatos do Nominatim, vale o primeiro que cai dentro do municipio pedido.
    """
    alvo = None
    if a.municipio:
        achados = ctx.geodata.busca_municipios(a.municipio, uf=uf)
        if not achados:
            return ToolResult(
                payload={"erro": f"município '{a.municipio}' não encontrado"}, error=True
            )
        alvo = str(achados[0]["cd_mun"])

    termo = ", ".join(t for t in (a.nome, a.municipio, uf, "Brasil") if t)
    try:
        candidatos = geocode_pontos(termo, limite=5)
    except GeocodeIndisponivel:
        return ToolResult(
            payload={
                "erro": f"'{a.nome}' não existe na malha do IBGE e a busca por "
                "localização está indisponível agora",
                "sugestao": "tente o nome do distrito ou do município",
            },
            error=True,
        )

    ponto = None
    for lon, lat in candidatos:
        if alvo is None:
            ponto = (lon, lat)
            break
        m = ctx.geodata.municipio_no_ponto(lon, lat)
        if m is not None and str(m["cd_mun"]) == alvo:
            ponto = (lon, lat)
            break

    if ponto is None:
        return ToolResult(
            payload={
                "erro": f"não encontrei '{a.nome}'"
                + (f" dentro de {a.municipio}" if a.municipio else ""),
                "motivo": "o nome não existe na malha do IBGE e não foi localizado no município",
            },
            error=True,
        )

    lon, lat = ponto
    row = ctx.geodata.bairro_no_ponto(lon, lat) or ctx.geodata.distrito_no_ponto(lon, lat)
    if row is None:
        return ToolResult(
            payload={"erro": f"'{a.nome}' foi localizado mas não caiu em nenhum recorte do IBGE"},
            error=True,
        )

    e_bairro = "cd_bairro" in row
    nivel = "bairro" if e_bairro else "distrito"
    avisos = [
        f"'{a.nome}' não é um recorte oficial do IBGE; localizei o nome e trouxe o "
        f"{nivel.upper()} que o contém, "
        f"{row['nm_bairro'] if e_bairro else row['nm_distrito']}, em {row['nm_mun']}"
    ]
    if not e_bairro and (d := _avisa_distorcao(row)) is not None:
        avisos.append(d)
    return _resultado_nivel(nivel, row, avisos)


Handler = Callable[[Contexto, Any], ToolResult]


def _avisos_de_borda(row: dict[str, Any]) -> list[str]:
    """O que o rateio areal obriga a declarar, saindo da ROW e nao do prompt.

    Regra 8 do ADR-0001, a mesma que rege a classe social: o que muda o sentido do
    numero e dado. Ao prompt cabe reescrever com as palavras da resposta, nao decidir
    se o aviso existe — instrucao em prompt longo cai no dia em que o contexto encher,
    e este aviso e a diferenca entre um numero e um numero que se pode usar.
    """
    parciais = int(row.get("parciais") or 0)
    if not parciais:
        return []
    total = float(row.get("pop_total") or 0)
    rateada = float(row.get("pop_de_rateio") or 0)
    pct = round(100 * rateada / total) if total else 0
    return [
        f"a area corta {parciais} setores censitarios ao meio; {pct}% da populacao "
        "informada vem de rateio pela area da intersecao, o que supoe distribuicao "
        "uniforme dentro do setor -- falso em setor rural grande com a vila num canto"
    ]


def _avisos_de_extensao(row: dict[str, Any]) -> list[str]:
    """Area muito grande responde, e avisa a extensao — nao recusa (Decisao 4 do DESIGN).

    O corte e em 1.000 setores porque e a partir dali que "a area desenhada" deixa de
    ser um lugar e vira uma regiao: quem desenhou um circulo de 50 km sobre a Grande
    Sao Paulo talvez nao esperasse 21 milhoes de pessoas na resposta.
    """
    setores = int(row.get("setores") or 0)
    if setores < 1_000:
        return []
    area = row.get("area_km2")
    return [
        f"a area e extensa: {setores} setores censitarios"
        + (f" e {area} km²" if area else "")
        + ". Vale confirmar se e mesmo o recorte que a pessoa queria"
    ]


def _info_area_desenhada(ctx: Contexto, a: InfoAreaDesenhadaArgs) -> ToolResult:
    """Cruza o Censo com um desenho do cliente. Le num banco, agrega no outro.

    A geometria vem do `app_clientes` em WKB (~2 kB) e viaja como PARAMETRO da consulta
    no `geodata`, que so le. E o caminho inteiro da Decisao 1 do DESIGN: sem
    `postgres_fdw`, sem JOIN entre bancos, e sem o `geodata` deixar de ser reconstruivel.

    O mapa NAO ganha destaque aqui, e a ausencia e deliberada: os destaques pintam
    codigos do IBGE nas fontes PMTiles, e o desenho ja esta na tela, na cor do cliente,
    desde que foi salvo. Pintar os 3 mil setores de dentro cobriria justamente o
    desenho sobre o qual se perguntou.
    """
    if ctx.acervo is None:
        return ToolResult(
            payload={
                "erro": "o acervo de desenhos nao esta disponivel neste ambiente",
                "sugestao": "responda pelos niveis publicados: bairro, distrito ou municipio",
            },
            error=True,
        )

    try:
        desenho = ctx.acervo.wkb_por_nome(a.nome)
    except AcervoIndisponivel:
        return ToolResult(
            payload={"erro": "nao foi possivel ler o acervo de desenhos agora"}, error=True
        )
    if desenho is None:
        nomes = [d["nome"] for d in ctx.acervo.listar(tamanho=20)["itens"]]
        return ToolResult(
            payload={"erro": f"nenhum desenho chamado {a.nome!r}", "existem": nomes}, error=True
        )

    row = ctx.geodata.cruzamento_por_geometria(desenho["wkb"], a.metricas)
    avisos = _avisos_de_borda(row) + _avisos_de_extensao(row)
    return ToolResult(
        payload={
            "desenho": {"nome": desenho["nome"], "tipo": desenho["tipo"]},
            "avisos": avisos,
            "dados": row,
        },
        rows=[row],
    )


TOOL_REGISTRY: dict[str, tuple[type[BaseModel], Handler]] = {
    "listar_metricas": (ListarMetricasArgs, _listar_metricas),
    "buscar_municipio": (BuscarMunicipioArgs, _buscar_municipio),
    "info_municipio": (InfoMunicipioArgs, _info_municipio),
    "info_setor": (InfoSetorArgs, _info_setor),
    "ranking_municipios": (RankingMunicipiosArgs, _ranking),
    # Lugar citado por NOME dentro de uma cidade tem uma porta so: info_local, que
    # cascateia bairro -> distrito -> localizacao e devolve os avisos. buscar_bairro e
    # buscar_distrito saíram do registry em 2026-08-22 por disputarem essa mesma
    # pergunta: no benchmark o LLM escolheu buscar_bairro para "bairro Curitiba, em
    # Curitiba" e parou em "Cidade Industrial de Curitiba" — o defeito que a cascata
    # existe para evitar. Mesma lição do par setores_no_ponto/setor_que_contem, logo
    # abaixo: semânticas próximas com nomes próximos são convite à escolha errada.
    # As funções seguem na fachada, que é de onde a cascata as chama.
    "info_local": (InfoLocalArgs, _info_local),
    "info_bairro": (InfoBairroArgs, _info_bairro),
    "ranking_bairros": (RankingBairrosArgs, _ranking_bairros),
    "bairro_que_contem": (BairroQueContemArgs, _bairro_que_contem),
    "info_distrito": (InfoDistritoArgs, _info_distrito),
    "ranking_distritos": (RankingDistritosArgs, _ranking_distritos),
    "distrito_que_contem": (DistritoQueContemArgs, _distrito_que_contem),
    "setores_proximos": (SetoresProximosArgs, _setores_proximos),
    "setores_no_ponto": (SetoresNoPontoArgs, _setores_no_ponto),
    # Nome deliberadamente distante de setores_no_ponto: o LLM escolhe tool por nome
    # e descricao, e dois nomes quase iguais para semanticas diferentes (contem x raio)
    # sao convite a escolha errada.
    "setor_que_contem": (SetorQueContemArgs, _setor_que_contem),
    # A unica tool que le fora do geodata. Fica por ultimo na lista pelo mesmo motivo
    # pelo qual entrou por ultimo: o produto responde sobre o Brasil publicado, e sobre
    # o desenho do cliente por cima disso.
    "info_area_desenhada": (InfoAreaDesenhadaArgs, _info_area_desenhada),
}


def openai_tools() -> list[dict[str, Any]]:
    """Specs das tools no formato chat.completions (schema direto do Pydantic)."""
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": " ".join((model.__doc__ or "").split()),
                "parameters": model.model_json_schema(),
            },
        }
        for name, (model, _) in TOOL_REGISTRY.items()
    ]


def execute_tool(ctx: Contexto, name: str, raw_args: str) -> ToolResult:
    """Valida args (Pydantic) e despacha. Erros viram payload p/ o LLM se autocorrigir."""
    entry = TOOL_REGISTRY.get(name)
    if entry is None:
        return ToolResult(
            payload={"erro": f"tool desconhecida: {name}", "validas": list(TOOL_REGISTRY)},
            error=True,
        )
    model, handler = entry
    try:
        args = model.model_validate_json(raw_args or "{}")
    except ValidationError as exc:
        return ToolResult(payload={"erro": "argumentos inválidos", "detalhe": str(exc)}, error=True)
    try:
        return handler(ctx, args)
    except ValueError as exc:  # ex.: metrica invalida (GeoQuery ja lista as validas)
        return ToolResult(payload={"erro": str(exc)}, error=True)
