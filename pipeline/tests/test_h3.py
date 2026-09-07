from shapely.geometry import Polygon

from geo_pipeline.h3 import _poligono


def test_borda_h3_vira_poligono_geojson_em_lon_lat():
    # Índice r9 conhecido em São Francisco; a geometria é função pura do índice.
    poligono = _poligono("8928308280fffff")
    assert isinstance(poligono, Polygon)
    assert poligono.is_valid
    assert len(poligono.exterior.coords) == 7  # seis lados e fechamento
    assert -123 < poligono.centroid.x < -122
    assert 37 < poligono.centroid.y < 38
