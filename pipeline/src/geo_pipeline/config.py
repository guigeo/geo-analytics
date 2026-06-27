"""Carrega e valida o registry declarativo (datasets.yaml)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, field_validator

PIPELINE_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = PIPELINE_DIR.parent
DEFAULT_REGISTRY = PIPELINE_DIR / "datasets.yaml"


class TileConfig(BaseModel):
    minzoom: int = 0
    maxzoom: int = 14
    simplification: int | None = None


class OutputConfig(BaseModel):
    processed_dir: str = "data/processed"
    tiles_dir: str = "web/public/tiles"


class DatasetConfig(BaseModel):
    name: str
    source: str
    geometry: Literal["polygon", "line", "point"] = "polygon"
    layer: str | None = None
    format: Literal["vector", "csv_points"] = "vector"
    lon_field: str | None = None
    lat_field: str | None = None
    attributes: list[str] = Field(default_factory=list)
    tile: TileConfig = Field(default_factory=TileConfig)

    @field_validator("name")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not v.isidentifier() and "-" not in v:
            raise ValueError(f"nome de dataset invalido para arquivo: {v!r}")
        return v

    def source_path(self) -> Path:
        return _resolve(self.source)

    def processed_path(self, output: OutputConfig) -> Path:
        return _resolve(output.processed_dir) / f"{self.name}.parquet"

    def tiles_path(self, output: OutputConfig) -> Path:
        return _resolve(output.tiles_dir) / f"{self.name}.pmtiles"


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
        return _resolve(output.tiles_dir) / self.out


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
