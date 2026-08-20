"""Funcoes de consulta tipadas sobre o geodata (PostGIS).

Mesmo contrato publicado de sempre — cd_setor/cd_mun/nm_mun/nm_uf/pop_total, prontos
para a resposta da IA e para o mapa destacar. O que mudou foi o motor, e com ele a
exatidao: distancia sai do centroide aproximado (graus x 111 km) para o poligono real
em metros, e passa a existir a pergunta que o modelo antigo nao respondia — qual setor
CONTEM este ponto.

Identificador de metrica e validado contra o schema real e composto por
psycopg.sql.Identifier; valor entra sempre como parametro.

De onde cada metrica e lida (medido em 2026-08-20, ver webgis/docs/HERANCA.md, §7.4):
as views largas agregam as 18,9 M linhas do formato longo antes de filtrar e custam
2,8 s — nunca sao alvo de filtro. Sobram dois caminhos: o resumo materializado quando
a metrica esta nele (4 ms), o formato longo para as demais (130 ms). O roteamento sai
das colunas reais do resumo, nao de uma lista escrita a mao: acrescentar coluna la
passa a rotear sozinho.
"""

from __future__ import annotations

from typing import Any, Literal

import psycopg
from psycopg import sql

from .db import connect

Ordem = Literal["asc", "desc"]
Nivel = Literal["setor", "municipio"]

# Sem a extensao unaccent: a fachada le, nao altera o schema do banco central (db.py).
# Em 5.571 municipios a varredura e irrelevante; o que importa e nao virar dona do DDL.
_SEM_ACENTO = "translate(lower({}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')"

_RESUMO = {"setor": "setor_resumo", "municipio": "municipio_resumo"}
_LONGO = {"setor": "setor", "municipio": "municipio"}
_CHAVE = {"setor": "cod_setor", "municipio": "cod_municipio"}


def _sem_acento(expr: str) -> sql.SQL:
    return sql.SQL(_SEM_ACENTO.format(expr))


class GeoQuery:
    """Fachada de consulta sobre o geodata. Uma conexao, dois caminhos de leitura."""

    def __init__(self, con: psycopg.Connection | None = None, dsn: str | None = None) -> None:
        self.con = con or connect(dsn)
        self._resumo: dict[str, set[str]] = {}
        self._variaveis: dict[str, str] = {}
        self._carrega_catalogo()

    def _carrega_catalogo(self) -> None:
        """Le uma vez o que existe: colunas numericas dos resumos e as variaveis do Censo."""
        with self.con.cursor() as cur:
            for nivel, tabela in _RESUMO.items():
                cur.execute(
                    """
                    select column_name from information_schema.columns
                    where table_schema = 'ibge_tabular' and table_name = %s
                      and data_type in ('numeric','integer','bigint','double precision','real')
                    """,
                    (tabela,),
                )
                self._resumo[nivel] = {r["column_name"] for r in cur.fetchall()}
            cur.execute("select nome, cod_variavel from ibge_tabular.variavel")
            self._variaveis = {r["nome"]: r["cod_variavel"] for r in cur.fetchall()}

    # --- catalogo de metricas ---------------------------------------------

    def metricas(self, nivel: Nivel = "municipio") -> list[str]:
        """Metricas consultaveis no nivel: as do resumo mais as variaveis do Censo."""
        return sorted(self._resumo[nivel] | set(self._variaveis))

    def _check_metric(self, nivel: Nivel, metrica: str) -> str:
        if metrica not in self._resumo[nivel] and metrica not in self._variaveis:
            raise ValueError(
                f"metrica invalida: {metrica!r}. Validas em {nivel}: {self.metricas(nivel)}"
            )
        return metrica

    def _no_resumo(self, nivel: Nivel, metrica: str) -> bool:
        """O roteamento da §7.4: resumo quando a coluna existe la, formato longo se nao."""
        return metrica in self._resumo[nivel]

    def _rows(self, consulta: sql.Composed | sql.SQL, params: list[Any]) -> list[dict[str, Any]]:
        with self.con.cursor() as cur:
            cur.execute(consulta, params)
            return cur.fetchall()

    # --- lookups -----------------------------------------------------------

    def setor(self, cd_setor: str) -> dict[str, Any] | None:
        """Atributos de um setor pelo codigo, com o centroide do poligono real."""
        rows = self._rows(
            sql.SQL("""
                select r.cod_setor as cd_setor, r.cod_municipio as cd_mun,
                       r.nome_municipio as nm_mun, m.nome_uf as nm_uf,
                       r.situacao, r.nome_bairro, r.pop_total, r.domicilios_ocupados,
                       r.media_moradores, r.pop_masculino, r.pop_feminino,
                       r.renda_media, r.renda_mediana, r.densidade_hab_km2,
                       r.pct_agua_rede, r.pct_esgoto_rede, r.pct_lixo_coletado,
                       s.area_km2,
                       ST_X(ST_Centroid(s.geom)) as lon, ST_Y(ST_Centroid(s.geom)) as lat
                from ibge_tabular.setor_resumo r
                join ibge.setor_censitario s using (cod_setor)
                -- ON explicito, nao USING: depois do join acima cod_municipio existe
                -- nas duas tabelas e o USING fica ambiguo.
                join ibge.municipio m on m.cod_municipio = s.cod_municipio
                where r.cod_setor = %s
            """),
            [cd_setor],
        )
        return rows[0] if rows else None

    def municipio(self, cd_mun: str) -> dict[str, Any] | None:
        """Atributos de um municipio pelo codigo IBGE."""
        rows = self._rows(
            sql.SQL("""
                select r.cod_municipio as cd_mun, r.nome as nm_mun, m.nome_uf as nm_uf,
                       m.sigla_uf, m.area_km2, r.pop_total, r.domicilios_ocupados,
                       r.domicilios_vagos, r.media_moradores, r.pop_masculino, r.pop_feminino,
                       r.renda_media, r.renda_mediana, r.densidade_hab_km2,
                       r.pct_agua_rede, r.pct_esgoto_rede, r.pct_lixo_coletado
                from ibge_tabular.municipio_resumo r
                join ibge.municipio m using (cod_municipio)
                where r.cod_municipio = %s
            """),
            [cd_mun],
        )
        return rows[0] if rows else None

    def busca_municipios(
        self, nome: str, uf: str | None = None, limite: int = 10
    ) -> list[dict[str, Any]]:
        """Municipios pelo nome (sem acento/caixa), mais populosos primeiro.

        Match exato vem sozinho ("Curitiba" NAO traz "Curitibanos"); substring e so
        fallback quando nao ha nome igual. Resolve nome -> cd_mun p/ as demais consultas.
        """
        exatos = self._busca_municipios(nome, uf, limite, exato=True)
        return exatos or self._busca_municipios(nome, uf, limite, exato=False)

    def _busca_municipios(
        self, nome: str, uf: str | None, limite: int, exato: bool
    ) -> list[dict[str, Any]]:
        alvo = _sem_acento("m.nome")
        termo = _sem_acento("%s")
        match = (
            sql.SQL("{} = {}").format(alvo, termo)
            if exato
            else sql.SQL("{} like '%%' || {} || '%%'").format(alvo, termo)
        )
        clauses = [match]
        params: list[Any] = [nome]
        if uf:
            clauses.append(sql.SQL("m.nome_uf = %s"))
            params.append(uf)
        params.append(int(limite))
        consulta = sql.SQL("""
            select m.cod_municipio as cd_mun, m.nome as nm_mun, m.nome_uf as nm_uf,
                   r.pop_total
            from ibge.municipio m
            left join ibge_tabular.municipio_resumo r using (cod_municipio)
            where {}
            order by r.pop_total desc nulls last
            limit %s
        """).format(sql.SQL(" and ").join(clauses))
        return self._rows(consulta, params)

    # --- ranking / agregacao ----------------------------------------------

    def ranking_municipios(
        self, metrica: str, uf: str | None = None, n: int = 10, ordem: Ordem = "desc"
    ) -> list[dict[str, Any]]:
        """Top-N municipios por uma metrica, opcionalmente filtrando por UF (nm_uf)."""
        self._check_metric("municipio", metrica)
        direcao = sql.SQL("desc") if ordem == "desc" else sql.SQL("asc")
        filtro_uf = sql.SQL("and m.nome_uf = %s") if uf else sql.SQL("")

        if self._no_resumo("municipio", metrica):
            consulta = sql.SQL("""
                select m.cod_municipio as cd_mun, m.nome as nm_mun, m.nome_uf as nm_uf,
                       r.{met} as valor
                from ibge_tabular.municipio_resumo r
                join ibge.municipio m using (cod_municipio)
                where r.{met} is not null {filtro}
                order by r.{met} {dir}
                limit %s
            """).format(met=sql.Identifier(metrica), filtro=filtro_uf, dir=direcao)
            params: list[Any] = []
        else:
            consulta = sql.SQL("""
                select m.cod_municipio as cd_mun, m.nome as nm_mun, m.nome_uf as nm_uf,
                       t.valor
                from ibge_tabular.municipio t
                join ibge.municipio m using (cod_municipio)
                where t.cod_variavel = %s and t.valor is not null {filtro}
                order by t.valor {dir}
                limit %s
            """).format(filtro=filtro_uf, dir=direcao)
            params = [self._variaveis[metrica]]

        if uf:
            params.append(uf)
        params.append(int(n))
        return self._rows(consulta, params)

    # --- espacial (poligono real) ------------------------------------------

    def setor_no_ponto(self, lon: float, lat: float) -> dict[str, Any] | None:
        """Qual setor CONTEM este ponto. Nao existia no motor anterior (ADR-0001, §2.1)."""
        rows = self._rows(
            sql.SQL("""
                select cod_setor from ibge.setor_censitario
                where ST_Contains(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4674))
                limit 1
            """),
            [float(lon), float(lat)],
        )
        return self.setor(rows[0]["cod_setor"]) if rows else None

    def setores_no_ponto(
        self, lon: float, lat: float, raio_km: float = 2.0, limite: int = 20
    ) -> list[dict[str, Any]]:
        """Setores a ate `raio_km` de um ponto, medindo do POLIGONO real, em metros.

        Um setor que contem o ponto tem km = 0 — no metodo antigo, um setor rural de
        2.634 km2 informava 2,482 km para um ponto dentro dele.
        """
        return self._rows(
            sql.SQL("""
                with ponto as (
                    select ST_SetSRID(ST_MakePoint(%s, %s), 4674)::geography as g
                ),
                perto as (
                    select s.cod_setor, ST_Distance(s.geom::geography, p.g) as metros
                    from ibge.setor_censitario s, ponto p
                    where ST_DWithin(s.geom::geography, p.g, %s)
                    order by metros
                    limit %s
                )
                select p.cod_setor as cd_setor, r.nome_municipio as nm_mun, r.pop_total,
                       round((p.metros / 1000)::numeric, 3) as km
                from perto p
                left join ibge_tabular.setor_resumo r using (cod_setor)
                order by p.metros
            """),
            [float(lon), float(lat), float(raio_km) * 1000, int(limite)],
        )

    def setores_proximos(
        self, cd_setor: str, raio_km: float = 2.0, limite: int = 20
    ) -> list[dict[str, Any]]:
        """Setores a ate `raio_km` do setor dado, poligono a poligono (o proprio vem com km 0)."""
        return self._rows(
            sql.SQL("""
                with alvo as (
                    select geom::geography as g from ibge.setor_censitario where cod_setor = %s
                ),
                perto as (
                    select s.cod_setor, ST_Distance(s.geom::geography, a.g) as metros
                    from ibge.setor_censitario s, alvo a
                    where ST_DWithin(s.geom::geography, a.g, %s)
                    order by metros
                    limit %s
                )
                select p.cod_setor as cd_setor, r.nome_municipio as nm_mun, r.pop_total,
                       round((p.metros / 1000)::numeric, 3) as km
                from perto p
                left join ibge_tabular.setor_resumo r using (cod_setor)
                order by p.metros
            """),
            [cd_setor, float(raio_km) * 1000, int(limite)],
        )

    def close(self) -> None:
        self.con.close()
