"""O acervo do cliente: a primeira fachada do sistema que ESCREVE.

Irmã do `query/geo_query`, e oposta a ele em quase tudo. Aquele lê o `geodata`, que
é dado universal, publicado por terceiros e reconstruível por script. Este escreve o
`app_clientes`, que é dado que o próprio cliente criou e que recarga nenhuma traz de
volta — o primeiro do sistema em que "refaço do zero" deixou de ser rede de segurança.

Por que outro banco: a regra 5 do ADR-0001 do `webgis` exige que o `geodata` continue
reconstruível, e desenho de cliente dentro dele transformaria "recarregar" numa
operação que apaga dado insubstituível. Ver a emenda de 2026-08-31 à regra 4.

**O isolamento entre clientes não mora aqui.** Ele é do Postgres: o papel deste
processo só tem `USAGE` no schema deste cliente, e o do vizinho recusa com
`permission denied`. O `_schema` abaixo diz *onde* escrever, não *quem pode* — se ele
apontasse para o schema errado, o banco recusaria em vez de misturar. Isolamento que
depende de a aplicação lembrar de filtrar falha no dia em que alguém esquecer o WHERE.
"""

from __future__ import annotations

import contextlib
import json
from typing import Any

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

# Teto de PAYLOAD, não de geografia. Medido em 2026-08-31: o contorno do município de
# São Paulo tem 21.308 vértices — o pior caso realista de um KML — e cruza com o Censo
# em 617 ms. 50 mil deixa folga de 2,3x e barra requisição absurda sem inventar limite
# geográfico que a medição não pediu. O banco tem o mesmo CHECK; aqui a recusa é cedo
# e com mensagem que diz o número.
MAX_VERTICES = 50_000

# Colunas devolvidas ao front. A geometria sai como GeoJSON porque é o que o MapLibre
# consome; `geom` crua nunca atravessa a API.
_CAMPOS = sql.SQL("""
    id, tipo, nome, categoria, cor, observacao, origem,
    -- ST_Transform para 4326 e obrigatorio, e por duas razoes que se somam. O
    -- RFC 7946 define GeoJSON como WGS84 e REMOVEU o campo `crs`; e o ST_AsGeoJSON
    -- injeta esse campo sozinho quando o SRID nao e 4326, produzindo um GeoJSON que
    -- o MapLibre ignora em silencio. Medido em 2026-08-31: sem isto a saida vinha
    -- com {"crs": {"name": "EPSG:4674"}} pendurado. A conversao custa nada — o erro
    -- de ida e volta entre 4674 e 4326 mediu 0 m.
    ST_AsGeoJSON(ST_Transform(geom, 4326))::json as geometria,
    ST_Area(geom::geography) as area_m2,
    raio_m,
    criado_em, atualizado_em
""")


class AcervoIndisponivel(RuntimeError):
    """O acervo não respondeu. Sobe até a rota, que devolve 503 e deixa o mapa de pé.

    Existe como tipo próprio para a rota não precisar distinguir psycopg de erro de
    programação: a §9 do ADR promete que a queda degrada, não derruba, e o caminho
    dessa promessa precisa ser explícito.
    """


class DesenhoInvalido(ValueError):
    """Geometria que o banco recusaria. Vira 422, não 500."""


def nome_do_schema(cliente_id: str) -> str:
    """`<id-do-cliente>` -> `cliente_<id_do_cliente>`, o que `app_clientes.sh` cria.

    Hífen é válido em id de cliente e exigiria aspas em todo identificador SQL; a
    troca acontece uma vez, aqui e lá, com a mesma regra.

    O exemplo aqui é genérico de propósito: `test_cliente.py` proíbe qualquer `.py`
    de citar um cliente, **inclusive em docstring**, e o teste pegou esta linha na
    primeira execução. A regra é literal porque a fronteira é literal.
    """
    return f"cliente_{cliente_id.replace('-', '_')}"


class Acervo:
    """Uma conexão, dois caminhos: leitura que se retoma, escrita que não."""

    def __init__(self, dsn: str, schema: str, con: psycopg.Connection | None = None) -> None:
        self._dsn = dsn
        self._schema = schema
        self._propria = con is None
        self.con = con or self._conecta()

    def _conecta(self) -> psycopg.Connection:
        try:
            return psycopg.connect(
                self._dsn, row_factory=dict_row, connect_timeout=5, autocommit=True
            )
        except psycopg.Error as exc:
            raise AcervoIndisponivel(str(exc)) from exc

    def _reabre(self) -> None:
        with contextlib.suppress(Exception):
            self.con.close()
        self.con = self._conecta()

    def _tabela(self) -> sql.Composed:
        return sql.SQL("{}.desenho").format(sql.Identifier(self._schema))

    def _executa(self, consulta: sql.Composed | sql.SQL, params: list[Any]) -> list[dict[str, Any]]:
        with self.con.cursor() as cur:
            cur.execute(consulta, params)
            return cur.fetchall() if cur.description else []

    def _le(self, consulta: sql.Composed | sql.SQL, params: list[Any]) -> list[dict[str, Any]]:
        """Uma tentativa, reconexão, e mais uma — como o `GeoQuery._executa_com_retomada`.

        Só para LEITURA, e a diferença é o ponto inteiro desta classe. Lá a repetição é
        segura porque a fachada só lê e não há efeito a duplicar; aqui um INSERT repetido
        criaria dois desenhos, e o usuário veria o dele em dobro sem entender por quê.
        """
        try:
            return self._executa(consulta, params)
        except (psycopg.OperationalError, psycopg.InterfaceError):
            if not self._propria:
                raise
            self._reabre()
            try:
                return self._executa(consulta, params)
            except psycopg.Error as exc:
                raise AcervoIndisponivel(str(exc)) from exc

    def _escreve(self, consulta: sql.Composed | sql.SQL, params: list[Any]) -> list[dict[str, Any]]:
        """Sem retomada, de propósito. Ver `_le`.

        Uma escrita que falhou por conexão morta pode ter chegado ao servidor antes de
        a resposta se perder. Repetir por conta própria troca um erro visível — que o
        usuário resolve clicando de novo — por um duplicado silencioso.
        """
        try:
            return self._executa(consulta, params)
        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
            raise AcervoIndisponivel(str(exc)) from exc
        except psycopg.errors.CheckViolation as exc:
            raise DesenhoInvalido(str(exc)) from exc

    def ping(self) -> None:
        """Toca o banco pelo caminho das consultas, reconectando se preciso.

        É o que o `/api/health` chama. Com dois bancos, "vivo" passou a ter duas
        respostas possíveis, e o health que só olha um mente sobre a outra metade.
        """
        self._le(sql.SQL("select 1"), [])

    # --- leitura -------------------------------------------------------------

    def listar(
        self,
        pagina: int = 1,
        tamanho: int = 50,
        categoria: str | None = None,
        busca: str | None = None,
    ) -> dict[str, Any]:
        """Uma página do acervo, mais o total. Ordenado do mais recente para o mais antigo."""
        filtros = [sql.SQL("true")]
        params: list[Any] = []
        if categoria:
            filtros.append(sql.SQL("categoria = %s"))
            params.append(categoria)
        if busca:
            # Sem acento e sem caixa, com translate() em vez de unaccent: a extensão
            # não está instalada e o consumidor não instala nada (regra 4 da casa do
            # servidor-dados-gis). Mesmo recurso que o `queries.py` usa na busca de
            # município, pelo mesmo motivo.
            filtros.append(
                sql.SQL("""
                translate(lower(nome), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
                like '%%' || translate(lower(%s), 'áàâãäéèêëíìîïóòôõöúùûüçñ',
                                       'aaaaaeeeeiiiiooooouuuucn') || '%%'
            """)
            )
            params.append(busca)
        onde = sql.SQL(" and ").join(filtros)

        total = self._le(
            sql.SQL("select count(*) as n from {} where {}").format(self._tabela(), onde), params
        )[0]["n"]

        itens = self._le(
            sql.SQL("""
                select {campos} from {tabela} where {onde}
                order by criado_em desc limit %s offset %s
            """).format(campos=_CAMPOS, tabela=self._tabela(), onde=onde),
            [*params, tamanho, (max(pagina, 1) - 1) * tamanho],
        )
        return {"itens": itens, "total": total, "pagina": max(pagina, 1), "tamanho": tamanho}

    def geometrias(self) -> dict[str, Any]:
        """TODOS os desenhos como FeatureCollection, para o mapa.

        Não pagina, e é diferente da `listar` de propósito: a lista é uma tela e cabe
        em página, o mapa é o mapa inteiro e um desenho que some ao virar de página
        seria defeito. Com o volume-alvo (~500) são alguns MB; se A-002 furar, é aqui
        que entra carregamento por viewport.
        """
        rows = self._le(
            sql.SQL("select {campos} from {tabela} order by criado_em").format(
                campos=_CAMPOS, tabela=self._tabela()
            ),
            [],
        )
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": str(r["id"]),
                    "geometry": r["geometria"],
                    "properties": {
                        k: (str(v) if k == "id" else v)
                        for k, v in r.items()
                        if k not in ("geometria",)
                    },
                }
                for r in rows
            ],
        }

    def obter(self, id_: str) -> dict[str, Any] | None:
        rows = self._le(
            sql.SQL("select {campos} from {tabela} where id = %s").format(
                campos=_CAMPOS, tabela=self._tabela()
            ),
            [id_],
        )
        return rows[0] if rows else None

    def categorias(self) -> list[str]:
        """As categorias que existem NESTE acervo, mais usadas primeiro.

        É o que faz a categoria ser texto livre sem virar bagunça: o vocabulário nasce
        do uso e o autocomplete sugere o que já existe, em vez de exigir deploy para
        cada categoria nova (Decisão 7 do DESIGN).
        """
        rows = self._le(
            sql.SQL("""
                select categoria, count(*) as n from {}
                where categoria is not null and btrim(categoria) <> ''
                group by categoria order by n desc, categoria
            """).format(self._tabela()),
            [],
        )
        return [r["categoria"] for r in rows]

    def wkb_por_nome(self, nome: str) -> dict[str, Any] | None:
        """A geometria de um desenho pelo nome, em WKB — o que a tool do agente leva.

        WKB e não GeoJSON porque daqui ela vai viajar como PARÂMETRO de uma consulta no
        `geodata` (Decisão 1 do DESIGN): é o que dispensa `postgres_fdw` e mantém o
        banco central sendo lido, nunca escrito. São ~2 kB para um desenho comum.
        """
        rows = self._le(
            sql.SQL("""
                select id, nome, tipo, ST_AsBinary(geom) as wkb,
                       ST_Area(geom::geography) as area_m2
                from {}
                where translate(lower(nome), 'áàâãäéèêëíìîïóòôõöúùûüçñ',
                                'aaaaaeeeeiiiiooooouuuucn')
                    = translate(lower(%s), 'áàâãäéèêëíìîïóòôõöúùûüçñ',
                                'aaaaaeeeeiiiiooooouuuucn')
                order by criado_em desc limit 1
            """).format(self._tabela()),
            [nome],
        )
        return rows[0] if rows else None

    # --- escrita -------------------------------------------------------------

    def criar(
        self,
        tipo: str,
        nome: str,
        geometria: dict[str, Any],
        categoria: str | None = None,
        cor: str = "#2563eb",
        observacao: str | None = None,
        origem: str = "desenho",
    ) -> dict[str, Any]:
        """Grava um desenho. A geometria chega como GeoJSON e é validada antes do INSERT."""
        self._valida_geometria(geometria)
        rows = self._escreve(
            sql.SQL("""
                insert into {tabela} (tipo, nome, categoria, cor, observacao, origem, geom)
                values (%s, %s, %s, %s, %s, %s,
                        -- Duas coisas acontecem aqui, e a ordem importa.
                        --
                        -- O cast `::json` e obrigatorio: sem ele o parametro chega
                        -- como `unknown` e o Postgres nao escolhe entre os overloads
                        -- de ST_GeomFromGeoJSON (text, json, jsonb).
                        --
                        -- E o que chega e WGS84 — e o que o MapLibre produz e o que o
                        -- GeoJSON define —, entao ele e SetSRID em 4326 e depois
                        -- TRANSFORMADO para 4674, o CRS da casa (regra 2 do
                        -- servidor-dados-gis). Rotular direto como 4674 daria o mesmo
                        -- resultado numerico, porque as duas diferem em centimetros,
                        -- e seria errado do mesmo jeito: afirmaria um datum que
                        -- ninguem verificou. Conversao explicita custa nada aqui e
                        -- evita a pergunta "em que CRS isso esta, afinal".
                        ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(%s::json), 4326), 4674))
                returning {campos}
            """).format(tabela=self._tabela(), campos=_CAMPOS),
            [tipo, nome.strip(), categoria, cor, observacao, origem, json.dumps(geometria)],
        )
        return rows[0]

    def atualizar(self, id_: str, campos: dict[str, Any]) -> dict[str, Any] | None:
        """Edita ATRIBUTOS. A geometria não muda por aqui.

        Redesenhar um traçado salvo ficou fora do MVP (DEFINE), e a fronteira mora
        nesta assinatura: para mudar a forma, apaga e desenha de novo.
        """
        permitidos = {"nome", "categoria", "cor", "observacao"}
        mudancas = {k: v for k, v in campos.items() if k in permitidos}
        if not mudancas:
            return self.obter(id_)
        atribuicoes = sql.SQL(", ").join(
            sql.SQL("{} = %s").format(sql.Identifier(k)) for k in mudancas
        )
        rows = self._escreve(
            sql.SQL("""
                update {tabela} set {atribuicoes}, atualizado_em = now()
                where id = %s returning {campos}
            """).format(tabela=self._tabela(), atribuicoes=atribuicoes, campos=_CAMPOS),
            [*mudancas.values(), id_],
        )
        return rows[0] if rows else None

    def apagar(self, id_: str) -> bool:
        rows = self._escreve(
            sql.SQL("delete from {} where id = %s returning id").format(self._tabela()), [id_]
        )
        return bool(rows)

    # --- validação -----------------------------------------------------------

    @staticmethod
    def _valida_geometria(geometria: dict[str, Any]) -> None:
        """Recusa cedo o que o banco recusaria, com mensagem que diz o número.

        O CHECK da tabela é a trava que não cai; esta é a que explica. Sem ela o
        usuário receberia um erro de constraint do Postgres, que não diz quantos
        vértices ele mandou nem quantos cabem.
        """
        if not isinstance(geometria, dict) or "type" not in geometria:
            raise DesenhoInvalido("geometria ausente ou sem 'type'")
        vertices = _conta_vertices(geometria.get("coordinates"))
        if vertices > MAX_VERTICES:
            raise DesenhoInvalido(
                f"geometria com {vertices} vértices; o teto é {MAX_VERTICES}"
            )
        if vertices == 0:
            raise DesenhoInvalido("geometria sem coordenadas")


def _conta_vertices(coordenadas: Any) -> int:
    """Conta pares [lon, lat] em qualquer profundidade de aninhamento do GeoJSON.

    Genérica porque Point, Polygon e MultiPolygon aninham em níveis diferentes, e
    escrever um caso por tipo seria três lugares para errar quando entrar o quarto.
    """
    if not isinstance(coordenadas, (list, tuple)) or not coordenadas:
        return 0
    if isinstance(coordenadas[0], (int, float)):
        return 1
    return sum(_conta_vertices(c) for c in coordenadas)
