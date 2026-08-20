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
from pydantic import BaseModel, Field, ValidationError

Camada = Literal["municipio", "setor"]

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


# Rotulos legiveis (PT-BR) das colunas curadas do Censo 2022 (espelha
# pipeline/src/geo_pipeline/census.py THEMES + DERIVED) — fonte unica pro
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
}


# --- args das tools (docstring = description no schema OpenAI) -----------------


class ListarMetricasArgs(BaseModel):
    """Lista as métricas numéricas consultáveis do Censo 2022 (por município ou setor)."""

    nivel: Literal["municipio", "setor"] = "municipio"


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


# --- resultado + dispatch -------------------------------------------------------


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


def _listar_metricas(gq: GeoQuery, a: ListarMetricasArgs) -> ToolResult:
    campos = gq.metricas(a.nivel)
    payload = [{"campo": c, "rotulo": METRIC_LABELS.get(c, c)} for c in campos]
    return ToolResult(payload=payload)


def _buscar_municipio(gq: GeoQuery, a: BuscarMunicipioArgs) -> ToolResult:
    rows = gq.busca_municipios(a.nome, uf=normalize_uf(a.uf))
    return ToolResult(payload=rows, camada="municipio", codigos=_codes(rows, "cd_mun"), rows=rows)


def _info_municipio(gq: GeoQuery, a: InfoMunicipioArgs) -> ToolResult:
    row = gq.municipio(a.cd_mun)
    if row is None:
        return ToolResult(payload={"erro": f"município {a.cd_mun} não encontrado"}, error=True)
    return ToolResult(payload=row, camada="municipio", codigos=[a.cd_mun], rows=[row])


def _info_setor(gq: GeoQuery, a: InfoSetorArgs) -> ToolResult:
    row = gq.setor(a.cd_setor)
    if row is None:
        return ToolResult(payload={"erro": f"setor {a.cd_setor} não encontrado"}, error=True)
    return ToolResult(payload=row, camada="setor", codigos=[a.cd_setor], rows=[row])


def _ranking(gq: GeoQuery, a: RankingMunicipiosArgs) -> ToolResult:
    rows = gq.ranking_municipios(a.metrica, uf=normalize_uf(a.uf), n=a.n, ordem=a.ordem)
    return ToolResult(payload=rows, camada="municipio", codigos=_codes(rows, "cd_mun"), rows=rows)


def _setores_proximos(gq: GeoQuery, a: SetoresProximosArgs) -> ToolResult:
    rows = gq.setores_proximos(a.cd_setor, raio_km=a.raio_km, limite=a.limite)
    return ToolResult(payload=rows, camada="setor", codigos=_codes(rows, "cd_setor"), rows=rows)


def _setores_no_ponto(gq: GeoQuery, a: SetoresNoPontoArgs) -> ToolResult:
    rows = gq.setores_no_ponto(a.lon, a.lat, raio_km=a.raio_km, limite=a.limite)
    return ToolResult(payload=rows, camada="setor", codigos=_codes(rows, "cd_setor"), rows=rows)


def _setor_que_contem(gq: GeoQuery, a: SetorQueContemArgs) -> ToolResult:
    row = gq.setor_no_ponto(a.lon, a.lat)
    if row is None:
        return ToolResult(
            payload={"erro": f"nenhum setor contém o ponto ({a.lon}, {a.lat})"}, error=True
        )
    return ToolResult(
        payload=row, camada="setor", codigos=[str(row["cd_setor"])], rows=[row]
    )


Handler = Callable[[GeoQuery, Any], ToolResult]

TOOL_REGISTRY: dict[str, tuple[type[BaseModel], Handler]] = {
    "listar_metricas": (ListarMetricasArgs, _listar_metricas),
    "buscar_municipio": (BuscarMunicipioArgs, _buscar_municipio),
    "info_municipio": (InfoMunicipioArgs, _info_municipio),
    "info_setor": (InfoSetorArgs, _info_setor),
    "ranking_municipios": (RankingMunicipiosArgs, _ranking),
    "setores_proximos": (SetoresProximosArgs, _setores_proximos),
    "setores_no_ponto": (SetoresNoPontoArgs, _setores_no_ponto),
    # Nome deliberadamente distante de setores_no_ponto: o LLM escolhe tool por nome
    # e descricao, e dois nomes quase iguais para semanticas diferentes (contem x raio)
    # sao convite a escolha errada.
    "setor_que_contem": (SetorQueContemArgs, _setor_que_contem),
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


def execute_tool(gq: GeoQuery, name: str, raw_args: str) -> ToolResult:
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
        return handler(gq, args)
    except ValueError as exc:  # ex.: metrica invalida (GeoQuery ja lista as validas)
        return ToolResult(payload={"erro": str(exc)}, error=True)
