"""Indice de busca do front (municipios + UFs com bbox), lido do geodata.

Gera web/src/search/municipios.json (gitignored) — o Vite empacota como asset com
hash, entao a busca funciona no site ESTATICO (sem backend). Ordenado por populacao
para as sugestoes mais provaveis virem primeiro.

A populacao vinha de censo_municipio.parquet, que existia por causa do census.py,
que existia por causa de 2 GB de CSV do Censo em data/ — tudo isso para UMA coluna
de ordenacao. Agora vem de ibge_tabular.municipio_resumo, e a curadoria do Censo
passa a ter um dono so: o geodata (pendencia 3 do webgis/docs/HERANCA.md).

Formato compacto (arrays, bbox arredondado a 3 casas ~ 110 m):
  { "ufs": [{ "sigla", "nome", "bbox" }...],
    "municipios": [[cod_municipio, nome, sigla_uf, [w, s, e, n]]...] }
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import psycopg

from .config import _resolve, geodata_dsn

log = logging.getLogger(__name__)

OUT_REL = "web/src/search/municipios.json"

# ST_Transform para 4326: o banco guarda em 4674 (SIRGAS 2000, o datum do IBGE) e o
# mapa fala 4326. A diferenca e sub-metrica e sumiria no arredondamento de 3 casas,
# mas declarar a projecao e mais barato que explicar depois por que nao esta la.
CONSULTA = """
    select m.cod_municipio, m.nome, m.sigla_uf, m.nome_uf,
           ST_XMin(g.b), ST_YMin(g.b), ST_XMax(g.b), ST_YMax(g.b)
    from ibge.municipio m
    left join ibge_tabular.municipio_resumo r using (cod_municipio)
    cross join lateral (select ST_Transform(m.geom, 4326) as b) g
    order by r.pop_total desc nulls last, m.nome
"""


def build_search_index() -> Path:
    # As 2 areas operacionais (lagoas do RS) ficam de fora: elas estao em
    # ibge.area_operacional, nao em ibge.municipio. Buscar municipio deve devolver
    # municipio — no indice antigo, que saia do tile, as duas apareciam.
    with psycopg.connect(geodata_dsn(), connect_timeout=5) as con:
        raw = con.execute(CONSULTA).fetchall()

    rows = [
        (cd, nm, uf, nm_uf, round(w, 3), round(s, 3), round(e, 3), round(n, 3))
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
