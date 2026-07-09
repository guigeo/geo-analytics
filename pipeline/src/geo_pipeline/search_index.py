"""Indice de busca do front (municipios + UFs com bbox) a partir do GeoParquet canonico.

Gera web/src/search/municipios.json (gitignored) — o Vite empacota como asset com hash,
entao a busca funciona no site ESTATICO (sem backend). Ordenado por populacao (se
censo_municipio.parquet existir) para as sugestoes mais provaveis virem primeiro.

Formato compacto (arrays, bbox arredondado a 3 casas ~ 110 m):
  { "ufs": [{ "sigla", "nome", "bbox" }...],
    "municipios": [[cd_mun, nome, sigla_uf, [w, s, e, n]]...] }
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .config import OutputConfig, _resolve

log = logging.getLogger(__name__)

OUT_REL = "web/src/search/municipios.json"


def build_search_index(output: OutputConfig) -> Path:
    import duckdb

    municipio = _resolve(output.processed_dir) / "municipio.parquet"
    censo_mun = _resolve(output.processed_dir) / "censo_municipio.parquet"
    if not municipio.exists():
        raise SystemExit(f"{municipio} ausente. Rode `build --only municipio` antes.")

    con = duckdb.connect()
    pop_join, pop_order = "", "m.NM_MUN"
    if censo_mun.exists():
        pop_join = (
            f"LEFT JOIN read_parquet('{censo_mun.as_posix()}') c ON c.cd_mun = m.CD_MUN"
        )
        pop_order = "c.pop_total DESC NULLS LAST, m.NM_MUN"

    raw = con.execute(f"""
        SELECT m.CD_MUN, m.NM_MUN, m.SIGLA_UF, m.NM_UF,
               m.geometry_bbox.xmin, m.geometry_bbox.ymin,
               m.geometry_bbox.xmax, m.geometry_bbox.ymax
        FROM read_parquet('{municipio.as_posix()}') m {pop_join}
        ORDER BY {pop_order}
    """).fetchall()
    # bbox e float32 no parquet: arredondar em Python (round do DuckDB deixa
    # artefatos tipo -46.82600021362305, que dobram o tamanho do JSON).
    rows = [
        (cd, nm, uf, nm_uf, round(float(w), 3), round(float(s), 3),
         round(float(e), 3), round(float(n), 3))
        for cd, nm, uf, nm_uf, w, s, e, n in raw
    ]

    municipios = [[cd, nm, uf, [w, s, e, n]] for cd, nm, uf, _, w, s, e, n in rows]

    ufs_agg: dict[str, dict] = {}
    for _, _, sigla, nome_uf, w, s, e, n in rows:
        u = ufs_agg.setdefault(sigla, {"sigla": sigla, "nome": nome_uf, "bbox": [w, s, e, n]})
        b = u["bbox"]
        u["bbox"] = [min(b[0], w), min(b[1], s), max(b[2], e), max(b[3], n)]
    ufs = sorted(ufs_agg.values(), key=lambda u: u["nome"])

    out = _resolve(OUT_REL)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({"ufs": ufs, "municipios": municipios}, ensure_ascii=False,
                   separators=(",", ":")),
        encoding="utf-8",
    )
    log.info("indice de busca: %d municipios, %d UFs -> %s (%.0f KB)",
             len(municipios), len(ufs), out, out.stat().st_size / 1024)
    return out
