"""Carrega e valida o registry declarativo (datasets.yaml)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, field_validator

GEODATA_DSN_ENV = "GEODATA_DSN"

PIPELINE_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = PIPELINE_DIR.parent
DEFAULT_REGISTRY = PIPELINE_DIR / "datasets.yaml"


class TileConfig(BaseModel):
    minzoom: int = 0
    maxzoom: int = 14
    simplification: int | None = None


class OutputConfig(BaseModel):
    processed_dir: str = "data/processed"
    # Os .pmtiles NAO sao saida desta aplicacao: sao infraestrutura compartilhada,
    # servida por um host unico para todas as apps derivadas (ver
    # ../webgis/docs/LOCAL.md). Por isso o diretorio e configuracao de AMBIENTE,
    # vinda de GEO_TILES_DIR, e nao do registry versionado. Sem ela o pipeline
    # para: escrever tile dentro do repositorio recria a copia por app que o
    # host existe para eliminar.
    tiles_dir: str | None = None

    def tiles_root(self) -> Path:
        destino = os.environ.get("GEO_TILES_DIR") or self.tiles_dir
        if not destino:
            raise ValueError(
                "defina GEO_TILES_DIR com o diretorio do host de tiles compartilhado "
                "(ex.: ~/dados-webgis/tiles). Ver ../webgis/docs/LOCAL.md"
            )
        return _resolve(destino)


class GeodataSource(BaseModel):
    """Fonte no geodata central (PostGIS): uma consulta, nao um arquivo no repo.

    Os nomes de coluna do banco sao os do IBGE em portugues (cod_uf, nome); os nomes
    de atributo no tile sao contrato com o frontend (CD_UF, NM_UF). O apelido no SQL
    e essa fronteira, e por isso ele mora aqui e nao no codigo: trocar a fonte nao
    pode mudar o que o mapa le. Apelido precisa de aspas — o Postgres minusculiza
    identificador sem elas.
    """

    kind: Literal["geodata"]
    sql: str


class DatasetConfig(BaseModel):
    name: str
    source: str | GeodataSource
    geometry: Literal["polygon", "line", "point"] = "polygon"
    layer: str | None = None
    format: Literal["vector", "csv_points"] = "vector"
    lon_field: str | None = None
    lat_field: str | None = None
    # Parsing de CSV de pontos. has_header=false usa o parser posicional de antenas
    # (antenas.csv nao tem cabecalho); true usa o parser generico por nome de coluna.
    has_header: bool = True
    csv_sep: str = ","
    decimal: str = "."
    encoding: str = "utf-8"
    attributes: list[str] = Field(default_factory=list)
    tile: TileConfig = Field(default_factory=TileConfig)

    @field_validator("name")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not v.isidentifier() and "-" not in v:
            raise ValueError(f"nome de dataset invalido para arquivo: {v!r}")
        return v

    @property
    def do_geodata(self) -> bool:
        return isinstance(self.source, GeodataSource)

    def source_path(self) -> Path:
        if isinstance(self.source, GeodataSource):
            raise ValueError(f"dataset {self.name!r} vem do geodata, nao de arquivo")
        return _resolve(self.source)

    def processed_path(self, output: OutputConfig) -> Path:
        return _resolve(output.processed_dir) / f"{self.name}.parquet"

    def tiles_path(self, output: OutputConfig) -> Path:
        return output.tiles_root() / f"{self.name}.pmtiles"


class BasemapConfig(BaseModel):
    provider: Literal["protomaps"] = "protomaps"
    bbox: list[float]
    maxzoom: int = 8
    out: str = "basemap.pmtiles"

    @field_validator("bbox")
    @classmethod
    def _bbox_len(cls, v: list[float]) -> list[float]:
        if len(v) != 4:
            raise ValueError("bbox deve ter 4 valores: [lon_min, lat_min, lon_max, lat_max]")
        return v

    def out_path(self, output: OutputConfig) -> Path:
        return output.tiles_root() / self.out


class PipelineConfig(BaseModel):
    output: OutputConfig = Field(default_factory=OutputConfig)
    datasets: list[DatasetConfig]
    basemap: BasemapConfig | None = None

    def dataset(self, name: str) -> DatasetConfig:
        for ds in self.datasets:
            if ds.name == name:
                return ds
        raise KeyError(f"dataset nao encontrado: {name!r}")


def _resolve(rel: str) -> Path:
    path = Path(rel)
    return path if path.is_absolute() else (REPO_ROOT / path)


def load_config(path: Path | None = None) -> PipelineConfig:
    registry = path or DEFAULT_REGISTRY
    with registry.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return PipelineConfig.model_validate(raw)


def geodata_dsn() -> str:
    """DSN do geodata para o GDAL. Sem ela o pipeline para, em vez de cair no arquivo.

    Dentro do container o banco nao e `localhost` — e o host. Ver docker-compose.yml.
    """
    valor = os.environ.get(GEODATA_DSN_ENV)
    if not valor:
        raise ValueError(
            f"defina {GEODATA_DSN_ENV} com a conexao do geodata "
            "(ex.: postgresql://geo_reader:SENHA@host.docker.internal:55432/geodata)"
        )
    return valor
