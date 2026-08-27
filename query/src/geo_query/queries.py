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

import contextlib
from typing import Any, Literal

import psycopg
from psycopg import sql

from .db import connect

Ordem = Literal["asc", "desc"]
Nivel = Literal["setor", "municipio", "bairro", "distrito"]

# Sem a extensao unaccent: a fachada le, nao altera o schema do banco central (db.py).
# Em 5.571 municipios a varredura e irrelevante; o que importa e nao virar dona do DDL.
_SEM_ACENTO = "translate(lower({}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')"

_RESUMO = {
    "setor": "setor_resumo",
    "municipio": "municipio_resumo",
    "bairro": "bairro_resumo",
    "distrito": "distrito_resumo",
}
_LONGO = {
    "setor": "setor",
    "municipio": "municipio",
    "bairro": "bairro",
    "distrito": "distrito",
}
_CHAVE = {
    "setor": "cod_setor",
    "municipio": "cod_municipio",
    "bairro": "cod_bairro",
    "distrito": "cod_distrito",
}


def _sem_acento(expr: str) -> sql.SQL:
    return sql.SQL(_SEM_ACENTO.format(expr))


class GeoQuery:
    """Fachada de consulta sobre o geodata. Uma conexao, dois caminhos de leitura."""

    def __init__(self, con: psycopg.Connection | None = None, dsn: str | None = None) -> None:
        # Guardamos o DSN e se a conexao e nossa: so reabrimos o que nos abrimos.
        # Conexao injetada (teste, script) tem dono, e reabrir por baixo dele seria
        # trocar o objeto que ele ainda segura.
        self._dsn = dsn
        self._propria = con is None
        self.con = con or connect(dsn)
        self._resumo: dict[str, set[str]] = {}
        self._variaveis: dict[str, str] = {}
        self._carrega_catalogo()

    # --- conexao ------------------------------------------------------------

    def _reabre(self) -> None:
        """Descarta a conexao morta e abre outra. O catalogo nao e relido: ele
        descreve o schema, que nao muda por reinicio de servidor."""
        with contextlib.suppress(Exception):
            self.con.close()
        self.con = connect(self._dsn)

    def _executa(self, consulta: sql.Composed | sql.SQL, params: list[Any]) -> list[dict[str, Any]]:
        with self.con.cursor() as cur:
            cur.execute(consulta, params)
            return cur.fetchall()

    def ping(self) -> None:
        """Toca o banco pelo mesmo caminho das consultas — reconectando se preciso.

        E o que o /api/health chama: health que espia o atributo `con` sem consultar
        nao exercita a reconexao, e continuaria reportando doente um agente que ja
        teria se curado na primeira pergunta.
        """
        self._executa_com_retomada(sql.SQL("select 1"), [])

    def _carrega_catalogo(self) -> None:
        """Le uma vez o que existe: colunas numericas dos resumos e as variaveis do Censo."""
        with self.con.cursor() as cur:
            for nivel, tabela in _RESUMO.items():
                # pg_attribute, e nao information_schema.columns: o padrao SQL nao
                # conhece view materializada, e o information_schema tambem nao --
                # ele lista relkind 'r' e 'v', nunca 'm'. Como setor_resumo foi
                # materializada para derrubar uma consulta de 18 s para 4,5 ms, o
                # catalogo do setor vinha VAZIO desde entao: as 17 colunas
                # numericas existiam e nenhuma era oferecida como metrica, entao
                # toda pergunta de setor caia no formato longo e as colunas
                # derivadas (densidade, pct_agua_rede, pct_esgoto_rede,
                # pct_lixo_coletado) simplesmente nao existiam naquele nivel.
                # Nao dava erro: dava uma lista de metricas mais curta do que devia.
                cur.execute(
                    """
                    select a.attname as column_name
                    from pg_attribute a
                    join pg_class c on c.oid = a.attrelid
                    join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'ibge_tabular' and c.relname = %s
                      and c.relkind in ('r','v','m')
                      and a.attnum > 0 and not a.attisdropped
                      and format_type(a.atttypid, null) in
                          ('numeric','integer','bigint','double precision','real')
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
        return self._executa_com_retomada(consulta, params)

    def _executa_com_retomada(
        self, consulta: sql.Composed | sql.SQL, params: list[Any]
    ) -> list[dict[str, Any]]:
        """Uma tentativa, reconexao, e mais uma. Sem isso o agente morre de vez.

        A conexao nasce no startup e vive enquanto o processo viver. Quando o Postgres
        reinicia — restart do container, manutencao, queda —, ela morre com
        AdminShutdown e NAO se recupera sozinha: todas as perguntas seguintes falham
        com 500 ate alguem reiniciar o agente. Medido em 2026-08-20 reiniciando o
        geodata com o agente de pe.

        Repetir e seguro porque esta fachada so le (db.py): nao ha efeito a duplicar.
        Uma unica repeticao, nao um laco — banco fora do ar deve degradar rapido, e o
        connect_timeout de 5 s ja limita a espera.
        """
        try:
            return self._executa(consulta, params)
        except (psycopg.OperationalError, psycopg.InterfaceError):
            if not self._propria:
                raise
            self._reabre()
            return self._executa(consulta, params)

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
                       -- Classe social: ESTIMATIVA NOSSA, nao numero do IBGE. O
                       -- catalogo de metricas ja a alcanca pelo resumo, mas estas
                       -- buscas tem lista de colunas CURADA -- sem entrar aqui, o
                       -- agente responderia a classe social quando perguntado por
                       -- ela e a omitiria em 'me fale sobre o Leblon'. situacao vem
                       -- junto de proposito: e ela que diz quando as fatias nao
                       -- merecem confianca (ver docs/classe-social.md no
                       -- servidor-dados-gis).
                       r.renda_domiciliar_estimada,
                       r.pct_classe_a, r.pct_classe_b, r.pct_classe_c, r.pct_classe_de,
                       r.classe_social_score, r.classe_social_situacao,
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
                       r.pct_agua_rede, r.pct_esgoto_rede, r.pct_lixo_coletado,
                       -- Classe social: estimativa nossa; ver a busca do setor.
                       r.renda_domiciliar_estimada,
                       r.pct_classe_a, r.pct_classe_b, r.pct_classe_c, r.pct_classe_de,
                       r.classe_social_score, r.classe_social_situacao
                from ibge_tabular.municipio_resumo r
                join ibge.municipio m using (cod_municipio)
                where r.cod_municipio = %s
            """),
            [cd_mun],
        )
        return rows[0] if rows else None

    def bairro(self, cd_bairro: str) -> dict[str, Any] | None:
        """Atributos de um bairro pelo codigo IBGE (10 digitos), com o centroide.

        Mesmas 16 colunas curadas do municipio: bairro_resumo nao e um recorte menor,
        e o que o agente responde de um nivel ele responde do outro.
        """
        rows = self._rows(
            sql.SQL("""
                select r.cod_bairro as cd_bairro, r.nome as nm_bairro,
                       r.cod_municipio as cd_mun, r.nome_municipio as nm_mun,
                       m.nome_uf as nm_uf, r.sigla_uf,
                       b.nome_distrito as nm_distrito, b.area_km2_calculada as area_km2,
                       r.pop_total, r.domicilios_ocupados, r.media_moradores,
                       r.pop_masculino, r.pop_feminino,
                       r.renda_media, r.renda_mediana, r.densidade_hab_km2,
                       r.pct_agua_rede, r.pct_esgoto_rede, r.pct_lixo_coletado,
                       -- Classe social: estimativa nossa; ver a busca do setor.
                       r.renda_domiciliar_estimada,
                       r.pct_classe_a, r.pct_classe_b, r.pct_classe_c, r.pct_classe_de,
                       r.classe_social_score, r.classe_social_situacao,
                       ST_X(ST_Centroid(b.geom)) as lon, ST_Y(ST_Centroid(b.geom)) as lat
                from ibge_tabular.bairro_resumo r
                join ibge.bairro b using (cod_bairro)
                -- ON explicito pelo mesmo motivo do setor: depois do join acima
                -- cod_municipio existe nas duas tabelas e o USING fica ambiguo.
                join ibge.municipio m on m.cod_municipio = b.cod_municipio
                where r.cod_bairro = %s
            """),
            [cd_bairro],
        )
        return rows[0] if rows else None

    def busca_bairros(
        self,
        nome: str,
        municipio: str | None = None,
        uf: str | None = None,
        limite: int = 10,
        exato: bool | None = None,
    ) -> list[dict[str, Any]]:
        """Bairros pelo nome, mais populosos primeiro. Exato antes de substring.

        Nome de bairro repete muito mais que nome de municipio — ha Centro em quase
        toda cidade —, entao o filtro por municipio e o que torna a busca util, e o
        desempate por populacao e o que salva quem nao filtrou.
        """
        if exato is not None:
            return self._busca_bairros(nome, municipio, uf, limite, exato=exato)
        exatos = self._busca_bairros(nome, municipio, uf, limite, exato=True)
        return exatos or self._busca_bairros(nome, municipio, uf, limite, exato=False)

    def _busca_bairros(
        self, nome: str, municipio: str | None, uf: str | None, limite: int, exato: bool
    ) -> list[dict[str, Any]]:
        alvo = _sem_acento("r.nome")
        termo = _sem_acento("%s")
        match = (
            sql.SQL("{} = {}").format(alvo, termo)
            if exato
            else sql.SQL("{} like '%%' || {} || '%%'").format(alvo, termo)
        )
        clauses = [match]
        params: list[Any] = [nome]
        if municipio:
            clauses.append(sql.SQL("{} = {}").format(_sem_acento("r.nome_municipio"), _sem_acento("%s")))
            params.append(municipio)
        if uf:
            clauses.append(sql.SQL("m.nome_uf = %s"))
            params.append(uf)
        params.append(int(limite))
        consulta = sql.SQL("""
            select r.cod_bairro as cd_bairro, r.nome as nm_bairro,
                   r.cod_municipio as cd_mun, r.nome_municipio as nm_mun,
                   m.nome_uf as nm_uf, r.pop_total
            from ibge_tabular.bairro_resumo r
            join ibge.municipio m using (cod_municipio)
            where {}
            order by r.pop_total desc nulls last
            limit %s
        """).format(sql.SQL(" and ").join(clauses))
        return self._rows(consulta, params)

    def distrito(self, cd_distrito: str) -> dict[str, Any] | None:
        """Atributos de um distrito pelo codigo IBGE (9 digitos), com o centroide.

        Mesmas 16 colunas de bairro_resumo — distrito_resumo sai do mesmo modelo de
        view. O que muda e a cobertura: bairro so existe em area urbana mapeada,
        distrito cobre todo municipio instalado ate o Censo 2022.
        """
        rows = self._rows(
            sql.SQL("""
                select r.cod_distrito as cd_distrito, r.nome as nm_distrito,
                       r.cod_municipio as cd_mun, r.nome_municipio as nm_mun,
                       m.nome_uf as nm_uf, r.sigla_uf,
                       d.area_km2_calculada as area_km2,
                       -- Quanto do municipio este distrito ocupa. Em 3.377 dos 10.698
                       -- distritos isso passa de 0,95: o "distrito" e o municipio
                       -- inteiro, e responder por ele sem dizer isso engana quem
                       -- perguntou por um recorte menor (medido em 2026-08-22).
                       round((d.area_km2_calculada / nullif(m.area_km2, 0))::numeric, 4)
                         as fracao_do_municipio,
                       r.pop_total, r.domicilios_ocupados, r.media_moradores,
                       r.pop_masculino, r.pop_feminino,
                       r.renda_media, r.renda_mediana, r.densidade_hab_km2,
                       r.pct_agua_rede, r.pct_esgoto_rede, r.pct_lixo_coletado,
                       -- Classe social: estimativa nossa; ver a busca do setor.
                       r.renda_domiciliar_estimada,
                       r.pct_classe_a, r.pct_classe_b, r.pct_classe_c, r.pct_classe_de,
                       r.classe_social_score, r.classe_social_situacao,
                       ST_X(ST_Centroid(d.geom)) as lon, ST_Y(ST_Centroid(d.geom)) as lat
                from ibge_tabular.distrito_resumo r
                join ibge.distrito d using (cod_distrito)
                -- ON explicito pelo mesmo motivo do setor e do bairro: depois do join
                -- acima cod_municipio existe nas duas tabelas e o USING fica ambiguo.
                join ibge.municipio m on m.cod_municipio = d.cod_municipio
                where r.cod_distrito = %s
            """),
            [cd_distrito],
        )
        return rows[0] if rows else None

    def busca_distritos(
        self,
        nome: str,
        municipio: str | None = None,
        uf: str | None = None,
        limite: int = 10,
        exato: bool | None = None,
    ) -> list[dict[str, Any]]:
        """Distritos pelo nome, mais populosos primeiro. Exato antes de substring.

        Mesma forma da busca de bairros, pelo mesmo motivo: nome de distrito repete
        entre municipios. E repete tambem o nome do PROPRIO municipio — 5.564 dos
        10.698 distritos se chamam como ele (medido em 2026-08-22), porque o distrito
        sede leva o nome da cidade. Buscar "Curitiba" aqui devolve o distrito sede de
        Curitiba, nao o municipio: quem quer o municipio usa busca_municipios.
        """
        if exato is not None:
            return self._busca_distritos(nome, municipio, uf, limite, exato=exato)
        exatos = self._busca_distritos(nome, municipio, uf, limite, exato=True)
        return exatos or self._busca_distritos(nome, municipio, uf, limite, exato=False)

    def _busca_distritos(
        self, nome: str, municipio: str | None, uf: str | None, limite: int, exato: bool
    ) -> list[dict[str, Any]]:
        alvo = _sem_acento("r.nome")
        termo = _sem_acento("%s")
        match = (
            sql.SQL("{} = {}").format(alvo, termo)
            if exato
            else sql.SQL("{} like '%%' || {} || '%%'").format(alvo, termo)
        )
        clauses = [match]
        params: list[Any] = [nome]
        if municipio:
            clauses.append(
                sql.SQL("{} = {}").format(_sem_acento("r.nome_municipio"), _sem_acento("%s"))
            )
            params.append(municipio)
        if uf:
            clauses.append(sql.SQL("m.nome_uf = %s"))
            params.append(uf)
        params.append(int(limite))
        consulta = sql.SQL("""
            select r.cod_distrito as cd_distrito, r.nome as nm_distrito,
                   r.cod_municipio as cd_mun, r.nome_municipio as nm_mun,
                   m.nome_uf as nm_uf, r.pop_total,
                   round((d.area_km2_calculada / nullif(m.area_km2, 0))::numeric, 4)
                     as fracao_do_municipio
            from ibge_tabular.distrito_resumo r
            join ibge.distrito d using (cod_distrito)
            join ibge.municipio m on m.cod_municipio = r.cod_municipio
            where {}
            order by r.pop_total desc nulls last
            limit %s
        """).format(sql.SQL(" and ").join(clauses))
        return self._rows(consulta, params)

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

    def ranking_bairros(
        self,
        metrica: str,
        cd_mun: str | None = None,
        uf: str | None = None,
        n: int = 10,
        ordem: Ordem = "desc",
    ) -> list[dict[str, Any]]:
        """Top-N bairros por uma metrica, filtrando por municipio (codigo) ou por UF.

        O filtro natural aqui e o municipio, nao a UF: "bairros mais populosos" sem
        recorte responde o Brasil inteiro, o que quase nunca e a pergunta.
        """
        self._check_metric("bairro", metrica)
        direcao = sql.SQL("desc") if ordem == "desc" else sql.SQL("asc")
        clauses: list[sql.SQL | sql.Composed] = []
        pos: list[Any] = []
        if cd_mun:
            clauses.append(sql.SQL("and r.cod_municipio = %s"))
            pos.append(cd_mun)
        if uf:
            clauses.append(sql.SQL("and m.nome_uf = %s"))
            pos.append(uf)
        filtros = sql.SQL(" ").join(clauses) if clauses else sql.SQL("")

        if self._no_resumo("bairro", metrica):
            consulta = sql.SQL("""
                select r.cod_bairro as cd_bairro, r.nome as nm_bairro,
                       r.nome_municipio as nm_mun, m.nome_uf as nm_uf, r.{met} as valor
                from ibge_tabular.bairro_resumo r
                join ibge.municipio m using (cod_municipio)
                where r.{met} is not null {filtros}
                order by r.{met} {dir}
                limit %s
            """).format(met=sql.Identifier(metrica), filtros=filtros, dir=direcao)
            params: list[Any] = list(pos)
        else:
            consulta = sql.SQL("""
                select r.cod_bairro as cd_bairro, r.nome as nm_bairro,
                       r.nome_municipio as nm_mun, m.nome_uf as nm_uf, t.valor
                from ibge_tabular.bairro t
                join ibge_tabular.bairro_resumo r using (cod_bairro)
                join ibge.municipio m on m.cod_municipio = r.cod_municipio
                where t.cod_variavel = %s and t.valor is not null {filtros}
                order by t.valor {dir}
                limit %s
            """).format(filtros=filtros, dir=direcao)
            params = [self._variaveis[metrica], *pos]

        params.append(int(n))
        return self._rows(consulta, params)

    def ranking_distritos(
        self,
        metrica: str,
        cd_mun: str | None = None,
        uf: str | None = None,
        n: int = 10,
        ordem: Ordem = "desc",
    ) -> list[dict[str, Any]]:
        """Top-N distritos por uma metrica, filtrando por municipio (codigo) ou por UF.

        Os dois filtros servem de verdade aqui, e e a diferenca para o ranking de
        bairros. Bairro so faz sentido comparado dentro da cidade; distrito cobre o
        pais, entao "maiores distritos do Parana" e uma pergunta legitima. Ao mesmo
        tempo 2.223 dos 5.570 municipios tem mais de um distrito — Sao Paulo tem 96 —,
        e neles o recorte municipal continua sendo o util (medido em 2026-08-22).
        """
        self._check_metric("distrito", metrica)
        direcao = sql.SQL("desc") if ordem == "desc" else sql.SQL("asc")
        clauses: list[sql.SQL | sql.Composed] = []
        pos: list[Any] = []
        if cd_mun:
            clauses.append(sql.SQL("and r.cod_municipio = %s"))
            pos.append(cd_mun)
        if uf:
            clauses.append(sql.SQL("and m.nome_uf = %s"))
            pos.append(uf)
        filtros = sql.SQL(" ").join(clauses) if clauses else sql.SQL("")

        if self._no_resumo("distrito", metrica):
            consulta = sql.SQL("""
                select r.cod_distrito as cd_distrito, r.nome as nm_distrito,
                       r.nome_municipio as nm_mun, m.nome_uf as nm_uf, r.{met} as valor
                from ibge_tabular.distrito_resumo r
                join ibge.municipio m using (cod_municipio)
                where r.{met} is not null {filtros}
                order by r.{met} {dir}
                limit %s
            """).format(met=sql.Identifier(metrica), filtros=filtros, dir=direcao)
            params: list[Any] = list(pos)
        else:
            consulta = sql.SQL("""
                select r.cod_distrito as cd_distrito, r.nome as nm_distrito,
                       r.nome_municipio as nm_mun, m.nome_uf as nm_uf, t.valor
                from ibge_tabular.distrito t
                join ibge_tabular.distrito_resumo r using (cod_distrito)
                join ibge.municipio m on m.cod_municipio = r.cod_municipio
                where t.cod_variavel = %s and t.valor is not null {filtros}
                order by t.valor {dir}
                limit %s
            """).format(filtros=filtros, dir=direcao)
            params = [self._variaveis[metrica], *pos]

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

    def bairro_no_ponto(self, lon: float, lat: float) -> dict[str, Any] | None:
        """Qual bairro CONTEM este ponto. Devolve None fora de area urbana mapeada:
        a malha de bairros do IBGE nao cobre o pais inteiro, so onde ha bairro."""
        rows = self._rows(
            sql.SQL("""
                select cod_bairro from ibge.bairro
                where ST_Contains(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4674))
                limit 1
            """),
            [float(lon), float(lat)],
        )
        return self.bairro(rows[0]["cod_bairro"]) if rows else None

    def distrito_no_ponto(self, lon: float, lat: float) -> dict[str, Any] | None:
        """Qual distrito CONTEM este ponto. Ao contrario do bairro, responde em
        praticamente todo o territorio: todo municipio instalado ate o Censo 2022 tem
        ao menos o distrito sede."""
        rows = self._rows(
            sql.SQL("""
                select cod_distrito from ibge.distrito
                where ST_Contains(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4674))
                limit 1
            """),
            [float(lon), float(lat)],
        )
        return self.distrito(rows[0]["cod_distrito"]) if rows else None

    def municipio_no_ponto(self, lon: float, lat: float) -> dict[str, Any] | None:
        """Qual municipio CONTEM este ponto. E o juiz de um geocoding: nome resolvido
        fora do municipio que a pessoa disse e resultado errado, nao resultado pobre."""
        rows = self._rows(
            sql.SQL("""
                select cod_municipio from ibge.municipio
                where ST_Contains(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4674))
                limit 1
            """),
            [float(lon), float(lat)],
        )
        return self.municipio(rows[0]["cod_municipio"]) if rows else None

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
