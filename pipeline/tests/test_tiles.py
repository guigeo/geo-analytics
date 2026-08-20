"""O feed intermediario da tilagem."""

from __future__ import annotations

from geo_pipeline.config import DatasetConfig, OutputConfig
from geo_pipeline.tiles import build_tiles


def test_fgb_residual_e_removido_antes_de_escrever(tmp_path, monkeypatch):
    """Build interrompido deixa um .fgb, e ele quebrava todos os builds seguintes.

    O driver FlatGeobuf nao implementa DeleteLayer, entao o -overwrite do ogr2ogr
    falha com "DeleteLayer() not supported by this dataset" — mensagem que nao diz
    a causa. O `finally` que apaga o .fgb nao roda quando o processo morre, e o
    resido e mais provavel justamente nas camadas lentas (setor leva ~36 min).
    """
    (tmp_path / "processed").mkdir()
    (tmp_path / "processed" / "x.parquet").write_bytes(b"parquet falso")
    residuo = tmp_path / "tiles" / "x.fgb"
    residuo.parent.mkdir()
    residuo.write_bytes(b"fgb pela metade")

    visto: list[bool] = []
    monkeypatch.setattr(
        "geo_pipeline.tiles.subprocess.run",
        lambda *a, **k: visto.append(residuo.exists()) or None,
    )

    ds = DatasetConfig(name="x", source="irrelevante.gpkg")
    output = OutputConfig(processed_dir=str(tmp_path / "processed"), tiles_dir=str(tmp_path / "tiles"))
    build_tiles(ds, output)

    # Primeira chamada e o ogr2ogr que escreve o .fgb: ele nao pode encontrar residuo.
    assert visto and visto[0] is False
    assert not residuo.exists()  # e o finally continua limpando o que ele mesmo criou


def test_exige_parquet_antes_de_tilar(tmp_path):
    ds = DatasetConfig(name="x", source="irrelevante.gpkg")
    output = OutputConfig(processed_dir=str(tmp_path / "vazio"), tiles_dir=str(tmp_path / "tiles"))
    try:
        build_tiles(ds, output)
    except FileNotFoundError as exc:
        assert "convert" in str(exc)
    else:
        raise AssertionError("deveria exigir o GeoParquet")
