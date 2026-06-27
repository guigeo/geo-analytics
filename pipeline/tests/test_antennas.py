"""Valida o parse do CSV de antenas e a construcao de geometria."""

from __future__ import annotations

from pathlib import Path

from geo_pipeline.antennas import read_antennas

FIXTURE = Path(__file__).parent / "fixtures" / "antenas_sample.csv"


def test_parses_valid_rows_and_drops_invalid():
    gdf = read_antennas(FIXTURE)
    # 4 linhas no fixture, 1 sem lat/lon -> 3 validas.
    assert len(gdf) == 3
    assert gdf.crs == "EPSG:4326"


def test_geometry_from_lonlat():
    gdf = read_antennas(FIXTURE)
    first = gdf.iloc[0]
    assert first.geometry.geom_type == "Point"
    assert round(first.geometry.x, 4) == -54.9075
    assert round(first.geometry.y, 4) == -28.7292


def test_strips_whitespace_in_attributes():
    gdf = read_antennas(FIXTURE)
    assert gdf.iloc[0]["tipo"] == "Greenfield"
    assert gdf.iloc[0]["operadora"] == "TIM"
