"""Funcoes de consulta tipadas sobre as views `setor` e `municipio`.

Cada metodo retorna dados prontos para a resposta da IA e/ou para o mapa destacar
(sempre inclui os codigos `cd_setor`/`cd_mun`). Identificadores (metrica/ordem) sao
validados contra o schema real; valores entram como parametros (anti-injection).
"""

from __future__ import annotations

from typing import Any, Literal

import duckdb

from .db import connect

Ordem = Literal["asc", "desc"]
_NUMERIC = {"BIGINT", "DOUBLE", "INTEGER", "HUGEINT", "FLOAT", "DECIMAL"}


def _rows(cur: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


class GeoQuery:
    """Fachada de consulta. Abre uma conexao DuckDB com as views canonicas."""

    def __init__(self, con: duckdb.DuckDBPyConnection | None = None) -> None:
        self.con = con or connect()
        self._numeric: dict[str, set[str]] = {
            view: {
                r[0] for r in self.con.execute(f"DESCRIBE {view}").fetchall() if r[1] in _NUMERIC
            }
            for view in ("setor", "municipio")
        }

    def metricas(self, view: Literal["setor", "municipio"] = "municipio") -> list[str]:
        """Lista as colunas numericas consultaveis (para a IA escolher uma metrica valida)."""
        return sorted(self._numeric[view])

    def _check_metric(self, view: str, metrica: str) -> str:
        if metrica not in self._numeric[view]:
            raise ValueError(
                f"metrica invalida: {metrica!r}. Validas em {view}: {sorted(self._numeric[view])}"
            )
        return metrica

    # --- lookups -----------------------------------------------------------

    def setor(self, cd_setor: str) -> dict[str, Any] | None:
        """Todos os atributos (+ centroide lon/lat) de um setor pelo codigo."""
        rows = _rows(self.con.execute("SELECT * FROM setor WHERE cd_setor = ?", [cd_setor]))
        return rows[0] if rows else None

    def municipio(self, cd_mun: str) -> dict[str, Any] | None:
        """Todos os atributos de um municipio pelo codigo IBGE."""
        rows = _rows(self.con.execute("SELECT * FROM municipio WHERE cd_mun = ?", [cd_mun]))
        return rows[0] if rows else None

    # --- ranking / agregacao ----------------------------------------------

    def ranking_municipios(
        self, metrica: str, uf: str | None = None, n: int = 10, ordem: Ordem = "desc"
    ) -> list[dict[str, Any]]:
        """Top-N municipios por uma metrica, opcionalmente filtrando por UF (nm_uf)."""
        self._check_metric("municipio", metrica)
        direction = "DESC" if ordem == "desc" else "ASC"
        clauses = [f"{metrica} IS NOT NULL"]
        params: list[Any] = []
        if uf:
            clauses.append("nm_uf = ?")
            params.append(uf)
        params.append(int(n))
        sql = (
            f"SELECT cd_mun, nm_mun, nm_uf, {metrica} AS valor FROM municipio "
            f"WHERE {' AND '.join(clauses)} ORDER BY {metrica} {direction} LIMIT ?"
        )
        return _rows(self.con.execute(sql, params))

    # --- espacial (centroide aproximado) ----------------------------------

    def setores_proximos(
        self, cd_setor: str, raio_km: float = 2.0, limite: int = 20
    ) -> list[dict[str, Any]]:
        """Setores cujo centroide esta a ate `raio_km` do centroide do setor dado.

        Distancia aproximada (graus * 111 km); ignora curvatura. Boa para vizinhanca local.
        """
        alvo = self.setor(cd_setor)
        if not alvo or alvo.get("lon") is None:
            return []
        sql = """
            SELECT cd_setor, nm_mun, pop_total,
                   round(ST_Distance(ST_Point(lon, lat), ST_Point(?, ?)) * 111.0, 3) AS km_aprox
            FROM setor
            WHERE lon IS NOT NULL
              AND ST_Distance(ST_Point(lon, lat), ST_Point(?, ?)) * 111.0 <= ?
            ORDER BY km_aprox
            LIMIT ?
        """
        p = [alvo["lon"], alvo["lat"], alvo["lon"], alvo["lat"], float(raio_km), int(limite)]
        return _rows(self.con.execute(sql, p))

    def close(self) -> None:
        self.con.close()
