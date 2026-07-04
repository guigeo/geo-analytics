"""Testes do parser generico de pontos com cabecalho (CNES/INEP-like)."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd

from geo_pipeline.config import DatasetConfig, OutputConfig
from geo_pipeline.points import convert_points


def _write(tmp_path: Path, content: str, name: str = "pontos.csv") -> Path:
    p = tmp_path / name
    p.write_text(content, encoding="utf-8")
    return p


def test_headered_csv_com_decimal_virgula(tmp_path: Path) -> None:
    src = _write(
        tmp_path,
        "NOME;LATITUDE;LONGITUDE;TIPO\n"
        "Escola A;-23,55;-46,63;Municipal\n"
        "Escola B;-3,10;-60,02;Estadual\n"
        "Invalida;;;\n",  # sem coords -> descartada
    )
    ds = DatasetConfig(
        name="escolas",
        source=str(src),
        geometry="point",
        format="csv_points",
        csv_sep=";",
        decimal=",",
        lon_field="LONGITUDE",
        lat_field="LATITUDE",
        attributes=["NOME", "TIPO"],
    )
    out = OutputConfig(processed_dir=str(tmp_path))
    dst = convert_points(ds, out)

    gdf = gpd.read_parquet(dst)
    assert len(gdf) == 2  # a linha invalida foi descartada
    assert list(gdf.columns) == ["NOME", "TIPO", "geometry"]  # so os atributos pedidos
    assert gdf.crs.to_epsg() == 4326
    a = gdf[gdf["NOME"] == "Escola A"].iloc[0]
    assert round(a.geometry.x, 2) == -46.63 and round(a.geometry.y, 2) == -23.55
