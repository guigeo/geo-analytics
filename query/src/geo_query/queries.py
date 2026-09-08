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
from datetime import UTC, datetime
from typing import Any, Literal

import h3
import psycopg
from psycopg import sql

from .db import connect
from .sintese import montar_sintese

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


# Como cada metrica do resumo se agrega sob uma area desenhada.
#
# Nao da para somar tudo, e a tabela existe porque a alternativa e silenciosa: somar
# `renda_media` de 40 setores devolve um numero grande, plausivel e sem significado
# nenhum. O modo de cada metrica e escolha de metodo, e escolha de metodo tem de estar
# escrita em algum lugar -- aqui, e nao no prompt.
#
# O peso das medias e `domicilios_ocupados` porque as metricas ponderadas do resumo sao
# todas POR DOMICILIO: renda do responsavel, moradores por domicilio, percentual de
# domicilios com agua na rede, fatia de domicilios em cada classe. Ponderar por
# populacao daria peso extra ao setor de familias grandes numa media que nao e de gente.
_SOMAVEIS = frozenset({"pop_total", "domicilios_ocupados", "pop_masculino", "pop_feminino"})

_PESO_DA_MEDIA: dict[str, str] = {
    "media_moradores": "domicilios_ocupados",
    "renda_media": "domicilios_ocupados",
    "renda_domiciliar_estimada": "domicilios_ocupados",
    "classe_social_score": "domicilios_ocupados",
    "pct_agua_rede": "domicilios_ocupados",
    "pct_esgoto_rede": "domicilios_ocupados",
    "pct_lixo_coletado": "domicilios_ocupados",
    "pct_classe_a": "domicilios_ocupados",
    "pct_classe_b": "domicilios_ocupados",
    "pct_classe_c": "domicilios_ocupados",
    "pct_classe_de": "domicilios_ocupados",
}

# Derivadas: nao se agregam, se recalculam. Densidade sob uma area e a populacao
# rateada dividida pela area DESENHADA -- media das densidades dos setores daria outro
# numero, e o errado.
_DERIVADAS = frozenset({"densidade_hab_km2"})

# O que nao tem agregacao possivel, com a saida junto. Recusar nomeando a alternativa
# e o que faz o LLM se autocorrigir em vez de repetir o pedido (o loop do agent.py da
# uma chance).
_SEM_AGREGACAO: dict[str, str] = {
    "renda_mediana": (
        "mediana de medianas nao e mediana: nao existe forma de agregar renda_mediana "
        "sob uma area a partir dos setores. Use renda_media"
    ),
}

# Setor coberto por menos que isto conta como cortado pela borda. Nao e 1.0 exato
# porque ST_Intersection sobre geography devolve 0,9999... para setor inteiro cujo
# poligono encosta na borda, e chamar isso de parcial inflaria o aviso.
_LIMIAR_INTEIRO = "0.999"

# A regra do rateio mora aqui e em nenhum outro lugar. O cruzamento livre do chat e
# o Raio-X têm contratos diferentes, mas "setor cortado" não pode significar uma coisa
# em cada um. ST_Within vem antes para o caminho comum não pagar a interseção cara.
_CTE_FRACAO = """
    with area as (select ST_GeomFromWKB(%s, 4674) as g),
    frac as (
        select s.cod_setor,
               case when ST_Within(s.geom, a.g) then 1.0
                    else ST_Area(ST_Intersection(s.geom, a.g)::geography)
                         / nullif(ST_Area(s.geom::geography), 0)
               end as f
        from ibge.setor_censitario s, area a
        where ST_Intersects(s.geom, a.g)
    )
"""

# Os dois números vêm da medição do desenho do município de São Paulo. A área é uma
# recusa barata antes de varrer o geodata; a lista degrada sem jogar fora o diagnóstico.
TETO_AREA_RAIO_X_KM2 = 2_000
TETO_SETORES_RAIO_X = 500

_METRICAS_RAIO_X = (
    "pop_total",
    "domicilios_ocupados",
    "renda_media",
    "media_moradores",
    "pop_masculino",
    "pop_feminino",
    "pct_classe_a",
    "pct_classe_b",
    "pct_classe_c",
    "pct_classe_de",
)


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
            clauses.append(
                sql.SQL("{} = {}").format(_sem_acento("r.nome_municipio"), _sem_acento("%s"))
            )
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

    def zoneamento_no_ponto(self, lon: float, lat: float) -> dict[str, Any] | None:
        """Zona de uso do solo que contém o ponto.

        A cobertura é somente o município de São Paulo. Fora dela, None não é
        consulta vazia: quem chama precisa dizer que não há zoneamento carregado
        para aquela região (regra 8 do ADR-0001).
        """
        rows = self._rows(
            sql.SQL("""
                select cod_zona, nome_zona, e_zona, lei, cod_municipio, data_atualizacao
                from regulacao.zoneamento
                where ST_Contains(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4674))
                limit 1
            """),
            [float(lon), float(lat)],
        )
        return rows[0] if rows else None

    def h3_no_ponto(self, lon: float, lat: float) -> dict[str, Any] | None:
        """Contagens CNEFE da célula H3 r9 que contém o ponto.

        A célula não guarda polígono no banco: H3 é função pura de latitude/longitude.
        A união preserva as seis células CNEFE que a fonte coloca logo fora do contorno
        de setores; descartá-las apagaria 18 endereços medidos na borda.
        """
        indice = h3.latlng_to_cell(float(lat), float(lon), 9)
        rows = self._rows(
            sql.SQL("""
                with malha as (
                  select h3_r9 from indicadores.censo_h3_r9_celula
                  union
                  select h3_r9 from indicadores.cnefe_h3_r9_celula
                ), valores as (
                  select h3_r9,
                         max(valor) filter (where cod_variavel = 'dom_apartamento') as dom_apartamento,
                         max(valor) filter (where cod_variavel = 'dom_casa') as dom_casa,
                         max(valor) filter (where cod_variavel = 'end_dom_particular') as domicilios_particulares
                    from indicadores.cnefe_h3_r9
                   where h3_r9 = %s
                   group by h3_r9
                )
                select m.h3_r9,
                       coalesce(v.dom_apartamento, 0)::integer as dom_apartamento,
                       coalesce(v.dom_casa, 0)::integer as dom_casa,
                       coalesce(v.domicilios_particulares, 0)::integer as domicilios_particulares,
                       coalesce(c.coord_original, 0)::integer as coord_original,
                       coalesce(c.coord_modificada, 0)::integer as coord_modificada,
                       coalesce(c.coord_estimada, 0)::integer as coord_estimada,
                       coalesce(c.coord_face_quadra, 0)::integer as coord_face_quadra,
                       coalesce(c.coord_localidade, 0)::integer as coord_localidade,
                       coalesce(c.coord_setor, 0)::integer as coord_setor
                  from malha m
                  left join indicadores.cnefe_h3_r9_celula c using (h3_r9)
                  left join valores v using (h3_r9)
                 where m.h3_r9 = %s
            """),
            [indice, indice],
        )
        return rows[0] if rows else None

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

    # --- cruzamento sob geometria arbitraria -------------------------------

    def cruzamento_por_geometria(
        self, wkb: bytes, metricas: list[str] | None = None
    ) -> dict[str, Any]:
        """Agrega o Censo sob uma geometria arbitraria, com rateio areal na borda.

        **So le.** O poligono chega como PARAMETRO, em WKB, e nao como tabela: e o que
        dispensa `postgres_fdw` entre o `app_clientes` e o `geodata` e preserva a
        promessa do `db.py` de que esta fachada nunca escreve no banco central
        (Decisao 1 do DESIGN de DESENHO_NO_MAPA).

        O aviso de borda sai DAQUI, junto do numero, e nao do prompt: regra 8 do
        ADR-0001. Os campos `parciais` e `pop_de_rateio` existem para o chamador poder
        montar a ressalva sem uma segunda consulta -- cobrar um round-trip pelo aviso
        seria pagar para poder esquece-lo.

        `pop_total` volta sempre, pedida ou nao, porque e ela que da sentido a
        `pop_de_rateio`: "26.724 vieram de rateio" sem o total nao diz se e muito.

        Medido em 2026-09-01 (468 mil setores, cache quente):

        | Area                              | Setores | Parciais | Tempo   |
        |-----------------------------------|---------|----------|---------|
        | Buffer 500 m                      |      40 | 30 (75%) |    3 ms |
        | Buffer 5 km                       |   3.286 | 164 (5%) |   36 ms |
        | Buffer 50 km                      |  49.185 |      310 |  640 ms |
        | Municipio de SP (21.308 vertices) |  27.719 |      775 | 1.320 ms|

        E confere: o municipio de SP como desenho devolve 11.451.967 contra os
        11.451.999 da tool municipal -- 0,0003% de diferenca.
        """
        pedidas = list(dict.fromkeys(metricas or []))
        for m in pedidas:
            self._check_metric("setor", m)
            if motivo := _SEM_AGREGACAO.get(m):
                raise ValueError(f"metrica {m!r} nao se agrega sob uma area: {motivo}")

        limiar = sql.SQL(_LIMIAR_INTEIRO)
        colunas: list[sql.Composed | sql.SQL] = [
            sql.SQL("count(*) as setores"),
            sql.SQL("count(*) filter (where f < {}) as parciais").format(limiar),
            sql.SQL("round(sum(r.pop_total * f)) as pop_total"),
            sql.SQL("round(sum(r.pop_total * f) filter (where f < {})) as pop_de_rateio").format(
                limiar
            ),
            # A menor e a maior cobertura entre os setores tocados. Existem por causa
            # do caso que so o dado real mostrou: um lote de 0,7 ha cai INTEIRO dentro
            # de um setor de 6,7 ha, e ai "quantos setores foram cortados" nao descreve
            # nada — o que descreve e "esta area e 10% de um setor so". Sem a fracao,
            # o aviso nao teria como dizer isso.
            sql.SQL("round(min(f)::numeric, 4) as fracao_menor"),
            sql.SQL("round(max(f)::numeric, 4) as fracao_maior"),
        ]
        longas: list[str] = []
        for m in pedidas:
            if m in ("pop_total",) or m in _DERIVADAS:
                continue  # ja vem, ou se calcula depois
            if m in _SOMAVEIS:
                colunas.append(
                    sql.SQL("round(sum(r.{met} * f)) as {met}").format(met=sql.Identifier(m))
                )
            elif peso := _PESO_DA_MEDIA.get(m):
                colunas.append(
                    sql.SQL(
                        "round((sum(r.{met} * r.{peso} * f) / "
                        "nullif(sum(r.{peso} * f), 0))::numeric, 2) as {met}"
                    ).format(met=sql.Identifier(m), peso=sql.Identifier(peso))
                )
            else:
                longas.append(m)

        # O formato longo entra numa CTE separada e SO quando alguem pede: sao 18,9 M
        # linhas, e junta-las por nada dobraria o custo da area grande.
        if longas:
            colunas_longas = [
                sql.SQL(
                    "round(sum(t.valor * f.f) filter (where t.cod_variavel = %s)) as {}"
                ).format(sql.Identifier(m))
                for m in longas
            ]
            trecho_longo = sql.SQL("""
                , lon as (
                    select {colunas}
                    from frac f join ibge_tabular.setor t using (cod_setor)
                    where t.cod_variavel = any(%s)
                )
            """).format(colunas=sql.SQL(",\n                           ").join(colunas_longas))
            juncao = sql.SQL("res cross join lon")
            saida = sql.SQL("res.*, lon.*")
        else:
            trecho_longo = sql.SQL("")
            juncao = sql.SQL("res")
            saida = sql.SQL("res.*")

        consulta = sql.SQL(_CTE_FRACAO + """
            ,
            res as (
                select {colunas}
                from frac join ibge_tabular.setor_resumo r using (cod_setor)
            ){longo}
            select {saida},
                   (select round((ST_Area(g::geography) / 1000000)::numeric, 3) from area)
                       as area_km2
            from {juncao}
        """).format(
            colunas=sql.SQL(",\n                       ").join(colunas),
            longo=trecho_longo,
            saida=saida,
            juncao=juncao,
        )

        params: list[Any] = [wkb]
        if longas:
            params.extend(self._variaveis[m] for m in longas)
            params.append([self._variaveis[m] for m in longas])

        row = self._rows(consulta, params)[0]
        return self._com_derivadas(row, pedidas)

    def zoneamento_por_geometria(self, wkb: bytes) -> list[dict[str, Any]]:
        """Percentual da área que cai em cada zona de uso do solo.

        A ausência de linhas não é tratada como erro aqui: cabe ao contrato declarar
        explicitamente que a cobertura não existe para o município de referência.
        """
        return self._rows(
            sql.SQL("""
                with area as (select ST_GeomFromWKB(%s, 4674) as g)
                select z.cod_zona, z.nome_zona, z.e_zona, z.lei, z.cod_municipio,
                       round((100 * ST_Area(ST_Intersection(z.geom, a.g)::geography)
                              / nullif(ST_Area(a.g::geography), 0))::numeric, 2) as percentual
                from regulacao.zoneamento z, area a
                where ST_Intersects(z.geom, a.g)
                order by percentual desc nulls last, z.cod_zona
            """),
            [wkb],
        )

    def raio_x_por_geometria(self, wkb: bytes) -> dict[str, Any]:
        """Monta o contrato determinístico do Raio-X a partir de uma área salva.

        A lista e o agregado nascem da mesma varredura de ``frac``. A área é medida
        antes da varredura para barrar cedo um pedido que o produto decidiu não servir.
        """
        area = self._rows(
            "select ST_Area(ST_GeomFromWKB(%s, 4674)::geography) / 1000000 as area_km2",
            [wkb],
        )[0]["area_km2"]
        if float(area or 0) > TETO_AREA_RAIO_X_KM2:
            raise ValueError(
                f"a área pedida tem {float(area):.1f} km²; o Raio-X aceita até "
                f"{TETO_AREA_RAIO_X_KM2:,} km²"
            )

        limiar = sql.SQL(_LIMIAR_INTEIRO)
        consulta = sql.SQL(_CTE_FRACAO + """
            , base as (
                select f.cod_setor, f.f, r.cod_municipio, r.pop_total,
                       r.domicilios_ocupados, r.renda_media, r.media_moradores,
                       r.pop_masculino, r.pop_feminino,
                       r.pct_classe_a, r.pct_classe_b, r.pct_classe_c, r.pct_classe_de
                from frac f join ibge_tabular.setor_resumo r using (cod_setor)
            ),
            res as (
                select count(*) as setores,
                       count(*) filter (where f < {limiar}) as parciais,
                       round(sum(pop_total * f)) as pop_total,
                       -- coalesce, e nao NULL: quando nenhum setor entra inteiro o valor
                       -- e ZERO, e a diferenca importa na tela. NULL vira travessao, que
                       -- se le como "nao sei"; o que se sabe aqui e que nao ha nenhum.
                       coalesce(round(sum(pop_total * f) filter (where f >= {limiar})), 0)
                           as pop_contida,
                       round(sum(pop_total * f) filter (where f < {limiar})) as pop_de_rateio,
                       round(sum(domicilios_ocupados * f)) as domicilios_ocupados,
                       round((sum(renda_media * domicilios_ocupados * f) /
                              nullif(sum(domicilios_ocupados * f), 0))::numeric, 2) as renda_media,
                       round((sum(media_moradores * domicilios_ocupados * f) /
                              nullif(sum(domicilios_ocupados * f), 0))::numeric, 2) as media_moradores,
                       round(sum(pop_masculino * f)) as pop_masculino,
                       round(sum(pop_feminino * f)) as pop_feminino,
                       round((sum(pct_classe_a * domicilios_ocupados * f) /
                              nullif(sum(domicilios_ocupados * f), 0))::numeric, 2) as pct_classe_a,
                       round((sum(pct_classe_b * domicilios_ocupados * f) /
                              nullif(sum(domicilios_ocupados * f), 0))::numeric, 2) as pct_classe_b,
                       round((sum(pct_classe_c * domicilios_ocupados * f) /
                              nullif(sum(domicilios_ocupados * f), 0))::numeric, 2) as pct_classe_c,
                       round((sum(pct_classe_de * domicilios_ocupados * f) /
                              nullif(sum(domicilios_ocupados * f), 0))::numeric, 2) as pct_classe_de,
                       round(min(f)::numeric, 4) as fracao_menor
                from base
            ),
            municipio_escolhido as (
                select cod_municipio
                from base
                group by cod_municipio
                order by sum(pop_total * f) desc nulls last, cod_municipio
                limit 1
            ),
            referencia as (
                select m.cod_municipio as cd_mun, m.nome as nm_mun, m.nome_uf as nm_uf,
                       r.pop_total as mun_pop_total, r.domicilios_ocupados as mun_domicilios_ocupados,
                       r.densidade_hab_km2 as mun_densidade_hab_km2,
                       r.renda_media as mun_renda_media, r.media_moradores as mun_media_moradores,
                       r.pop_masculino as mun_pop_masculino, r.pop_feminino as mun_pop_feminino,
                       r.pct_classe_a as mun_pct_classe_a, r.pct_classe_b as mun_pct_classe_b,
                       r.pct_classe_c as mun_pct_classe_c, r.pct_classe_de as mun_pct_classe_de,
                       r.classe_social_situacao
                from municipio_escolhido e
                join ibge_tabular.municipio_resumo r using (cod_municipio)
                join ibge.municipio m using (cod_municipio)
            ),
            dist_base as (
                select cod_setor, f as fracao, renda_media as valor, pop_total
                from base
            ),
            dist as (
                select count(*) as total, min(valor) as minimo, max(valor) as maximo,
                       case when count(*) > {teto} then '[]'::json
                            else coalesce(json_agg(json_build_object(
                                'cod_setor', cod_setor, 'fracao', fracao,
                                'valor', valor, 'pop_total', pop_total
                            ) order by valor desc nulls last), '[]'::json)
                       end as setores_lista
                from dist_base
            ),
            faixas_base as (
                select case when d.maximo is null or d.minimo = d.maximo then 1
                            else width_bucket(b.valor, d.minimo, d.maximo + 0.000001, 4)
                       end as faixa,
                       b.valor, b.pop_total, b.fracao, d.minimo, d.maximo
                from dist_base b cross join dist d
            ),
            faixas_resumo as (
                -- `width_bucket` devolve NULL para setor sem a metrica, e essa linha
                -- viraria uma faixa de limites nulos com zero habitantes: uma barra que
                -- nao significa nada na legenda. Setor sem dado nao e uma faixa a mais,
                -- e a legenda ja tem a cor propria dele.
                select faixa, minimo, maximo, round(sum(pop_total * fracao)) as populacao
                from faixas_base
                where faixa is not null
                group by faixa, minimo, maximo
            ),
            faixas as (
                select coalesce(json_agg(json_build_object(
                    'faixa', faixa,
                    'inferior', round((minimo + (faixa - 1) * (maximo - minimo) / 4)::numeric, 2),
                    'superior', round((minimo + faixa * (maximo - minimo) / 4)::numeric, 2),
                    'populacao', populacao
                ) order by faixa), '[]'::json) as itens
                from faixas_resumo
            )
            select res.*, ref.*, dist.total as setores_total, dist.minimo, dist.maximo,
                   dist.setores_lista, coalesce(faixas.itens, '[]'::json) as faixas,
                   round((ST_Area(a.g::geography) / 1000000)::numeric, 3) as area_km2
            from res cross join referencia ref cross join dist
            cross join area a left join faixas on true
        """).format(limiar=limiar, teto=sql.Literal(TETO_SETORES_RAIO_X))
        row = self._rows(consulta, [wkb])[0]
        row["densidade_hab_km2"] = round(
            float(row["pop_total"] or 0) / float(row["area_km2"] or 1), 1
        )
        truncada = int(row["setores_total"] or 0) > TETO_SETORES_RAIO_X
        referencia = {
            "cd_mun": row["cd_mun"], "nm_mun": row["nm_mun"], "nm_uf": row["nm_uf"],
            "pop_total": row["mun_pop_total"],
            "domicilios_ocupados": row["mun_domicilios_ocupados"],
            "densidade_hab_km2": row["mun_densidade_hab_km2"],
            "renda_media": row["mun_renda_media"], "media_moradores": row["mun_media_moradores"],
            "pop_masculino": row["mun_pop_masculino"], "pop_feminino": row["mun_pop_feminino"],
            "pct_classe_a": row["mun_pct_classe_a"], "pct_classe_b": row["mun_pct_classe_b"],
            "pct_classe_c": row["mun_pct_classe_c"], "pct_classe_de": row["mun_pct_classe_de"],
        }
        escala = {
            "area_km2": row["area_km2"], "setores": row["setores"],
            "populacao": row["pop_total"], "populacao_contida": row["pop_contida"],
            "populacao_rateada": row["pop_de_rateio"], "setores_parciais": row["parciais"],
            "domicilios_ocupados": row["domicilios_ocupados"],
            "densidade_hab_km2": row["densidade_hab_km2"], "municipio": referencia,
            "fonte": "Censo Demográfico 2022 — IBGE", "periodo": "2022",
            "metodo": "interseção exata com rateio areal na borda",
            "cobertura": "setores censitários do IBGE", "avisos": [],
        }
        contraste = {
            "metrica": "renda_media", "rotulo": "Renda média mensal do responsável (R$)",
            "minimo": row["minimo"], "maximo": row["maximo"], "faixas": row["faixas"],
            "setores": row["setores_lista"], "truncada": truncada,
            "aviso": (
                f"a lista foi omitida porque a área toca mais de {TETO_SETORES_RAIO_X} setores"
                if truncada else None
            ), "fonte": "Censo Demográfico 2022 — IBGE", "periodo": "2022",
            "metodo": "valor por setor, ordenado por renda média", "cobertura": "setores tocados",
            "avisos": [],
        }
        perfil = {
            "renda_media": row["renda_media"], "media_moradores": row["media_moradores"],
            "pop_masculino": row["pop_masculino"], "pop_feminino": row["pop_feminino"],
            "municipio": referencia, "fonte": "Censo Demográfico 2022 — IBGE", "periodo": "2022",
            "metodo": "médias ponderadas por domicílios ocupados", "cobertura": "setores tocados",
            "avisos": [],
        }
        classe_social = {
            "pct_a": row["pct_classe_a"], "pct_b": row["pct_classe_b"],
            "pct_c": row["pct_classe_c"], "pct_de": row["pct_classe_de"],
            "municipio": referencia, "situacao": row["classe_social_situacao"],
            "fonte": "Estimativa própria a partir do Censo 2022", "periodo": "2022",
            "metodo": "composição ponderada por domicílios ocupados", "cobertura": "setores tocados",
            "avisos": [],
        }
        qualidade = {
            "fracao_menor": row["fracao_menor"], "setores_parciais": row["parciais"],
            "populacao_rateada": row["pop_de_rateio"], "fonte": "Censo Demográfico 2022 — IBGE",
            "periodo": "2022", "metodo": "rateio areal para setores cortados",
            "cobertura": "setores tocados", "avisos": [],
        }
        zonas = self.zoneamento_por_geometria(wkb)
        regulacao = {
            "disponivel": row["cd_mun"] == "3550308" and bool(zonas), "zonas": zonas,
            "aviso": None if row["cd_mun"] == "3550308" and zonas else (
                f"regulação de uso do solo não carregada para {row['nm_mun']}"
            # Sem cobertura a fonte NAO e nula: e a mesma camada, que existe e nao
            # alcanca este municipio. Nomea-la e o que separa "nao ha dado aqui" de
            # "nao ha dado nenhum" — e um None aqui derrubava a rota inteira, porque
            # o contrato exige que todo bloco declare de onde veio.
            ), "fonte": zonas[0]["lei"] if zonas else "GeoSampa — zoneamento municipal",
            "periodo": "vigente",
            "metodo": "interseção exata da área com as zonas", "cobertura": "Município de São Paulo",
            "avisos": [],
        }
        qualidade["avisos"] = [
            f"{row['parciais']} setores entram parcialmente por rateio areal"
        ] if row["parciais"] else []
        resultado = {
            "versao_calculo": "1", "gerado_em": datetime.now(UTC).isoformat(),
            "escala": escala, "contraste": contraste, "perfil": perfil,
            "classe_social": classe_social, "qualidade": qualidade, "regulacao": regulacao,
        }
        resultado["sintese"] = montar_sintese(escala, contraste)
        return resultado

    @staticmethod
    def _com_derivadas(row: dict[str, Any], pedidas: list[str]) -> dict[str, Any]:
        """Densidade se RECALCULA sobre a area desenhada; media das densidades seria outra coisa."""
        if "densidade_hab_km2" in pedidas:
            area = float(row.get("area_km2") or 0)
            pop = float(row.get("pop_total") or 0)
            row["densidade_hab_km2"] = round(pop / area, 1) if area else None
        return row

    def close(self) -> None:
        self.con.close()
