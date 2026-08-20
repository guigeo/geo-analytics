"""Conexao DuckDB e views canonicas (setor/municipio).

As views juntam atributos do censo com o centroide derivado do `geom_bbox` da geometria
(a geometria exata fica nos PMTiles; aqui usamos so o centroide para consultas espaciais
aproximadas). Caminhos resolvidos a partir da raiz do repo.
"""

from __future__ import annotations

from pathlib import Path

import duckdb

# query/src/geo_query/db.py -> sobe 3 niveis ate query/, +1 ate a raiz do repo.
REPO_ROOT = Path(__file__).resolve().parents[3]
PROCESSED = REPO_ROOT / "data" / "processed"

SETOR_GEOM = PROCESSED / "setor.parquet"  # geometria (usamos so CD_SETOR + geom_bbox)
CENSO_SETOR = PROCESSED / "censo_setor.parquet"
CENSO_MUN = PROCESSED / "censo_municipio.parquet"


def _require(*paths: Path) -> None:
    missing = [p for p in paths if not p.exists()]
    if missing:
        nomes = ", ".join(p.name for p in missing)
        raise FileNotFoundError(
            f"parquet(s) ausente(s): {nomes}. Rode o pipeline (build / census / census-municipio)."
        )


def connect() -> duckdb.DuckDBPyConnection:
    """Abre a conexao, carrega o spatial e cria as views `setor` e `municipio`."""
    _require(SETOR_GEOM, CENSO_SETOR, CENSO_MUN)
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")

    con.execute(f"""
        CREATE VIEW setor AS
        SELECT s.*, c.lon, c.lat
        FROM read_parquet('{CENSO_SETOR.as_posix()}') s
        LEFT JOIN (
            -- GROUP BY nao e decoracao: o GeoPackage nacional do IBGE declara
            -- Polygon e quebra o setor multiparte em uma linha por parte (914
            -- setores, um deles com 247 partes), entao a malha tem 472.780
            -- linhas para 468.099 setores. Sem agrupar, o join multiplica o
            -- censo: Corumba respondia 239 setores onde ha 187, e somar
            -- populacao contava a mesma gente varias vezes.
            SELECT CD_SETOR AS cd_setor,
                   (min(geom_bbox.xmin) + max(geom_bbox.xmax)) / 2 AS lon,
                   (min(geom_bbox.ymin) + max(geom_bbox.ymax)) / 2 AS lat
            FROM read_parquet('{SETOR_GEOM.as_posix()}')
            GROUP BY CD_SETOR
        ) c USING (cd_setor)
    """)
    con.execute(
        f"CREATE VIEW municipio AS SELECT * FROM read_parquet('{CENSO_MUN.as_posix()}')"
    )
    return con
