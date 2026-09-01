# DESIGN: DESENHO_NO_MAPA

> Desenho de ponto, polígono e buffer sobre o mapa, guardados no acervo do cliente,
> com o agente respondendo sobre a área desenhada.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | DESENHO_NO_MAPA |
| **Data** | 2026-08-31 |
| **DEFINE** | [DEFINE_DESENHO_NO_MAPA.md](DEFINE_DESENHO_NO_MAPA.md) |
| **BRAINSTORM** | [BRAINSTORM_DESENHO_NO_MAPA.md](BRAINSTORM_DESENHO_NO_MAPA.md) |
| **ADR** | ADR-0001 do `webgis`, emendas de 2026-08-31 (commit `8f6ef9c`) |
| **Status** | Pronto para o `/build` |

---

## Visão geral da arquitetura

```text
┌──────────────────────── NAVEGADOR (um build por cliente) ─────────────────────────┐
│                                                                                    │
│  desenho/BarraFerramentas   →  desenho/estado.ts   →  desenho/geometria.ts        │
│    (ponto | polígono | buffer)   máquina do traçado    puro: validação, área,     │
│         │                         (vértices, desfazer)  buffer geodésico          │
│         │                                  │                                       │
│         ▼                                  ▼                                       │
│  map/MapView.tsx  ◄────────────  desenho/fonte.ts  (GeoJSON + camadas MapLibre)   │
│         │                                  ▲                                       │
│         │                                  │                                       │
│  desenho/PainelDesenhos.tsx  ──►  desenho/api.ts  ──┐                             │
│  (lista, busca, filtro, página)                      │                            │
└──────────────────────────────────────────────────────┼────────────────────────────┘
                                                        │  /api/desenhos/*
                            ┌───────────────────────────▼─────────────────────────┐
                            │      AGENTE (um processo por cliente, no portão)     │
                            │                                                      │
                            │  rotas_desenhos.py  ──►  acervo.py   ── ESCREVE ──┐ │
                            │  (APIRouter, CRUD)       fachada nova              │ │
                            │                                                     │ │
                            │  tools.py:info_area_desenhada                      │ │
                            │      │                                             │ │
                            │      ├─► acervo.py ── lê a geometria ──────────────┤ │
                            │      │        (WKB, ~2 kB)                          │ │
                            │      │            │                                 │ │
                            │      │            ▼  viaja como PARÂMETRO           │ │
                            │      └─► query/queries.py ── SÓ LÊ ────────────┐   │ │
                            └────────────────────────────────────────────────┼───┼─┘
                                                                              │   │
                    ┌─────────────────────────────────────────────────────────▼─┐ │
                    │  geodata  (reconstruível, SÓ LEITURA)                      │ │
                    │    ibge.setor_censitario · ibge_tabular.setor_resumo (MV)  │ │
                    └───────────────────────────────────────────────────────────┘ │
                    ┌───────────────────────────────────────────────────────────┐ │
                    │  app_clientes  (dado do cliente, backup próprio) ◄─────────┼─┘
                    │    cliente_geo_analytics.desenho   (papel próprio)         │
                    │    cliente_eb_prime.desenho        (papel próprio)         │
                    │    ── o papel de um NÃO enxerga o schema do outro ──       │
                    └───────────────────────────────────────────────────────────┘
```

**A assimetria é o coração do desenho:** a seta que escreve vai só para o `app_clientes`;
a que chega no `geodata` é sempre de leitura, e o polígono a atravessa como parâmetro,
nunca como `JOIN` entre bancos.

---

## Componentes

| Componente | Propósito | Tecnologia |
|------------|-----------|------------|
| `web/src/desenho/geometria.ts` | Validação, área e buffer geodésico — **puro**, sem React nem MapLibre | TypeScript |
| `web/src/desenho/estado.ts` | Máquina do traçado: vértices, desfazer, encerrar | TypeScript |
| `web/src/desenho/fonte.ts` | Fonte GeoJSON e camadas do MapLibre | MapLibre |
| `web/src/desenho/api.ts` | Cliente REST do acervo | fetch |
| `web/src/desenho/*.tsx` | Barra de ferramentas, formulário e painel de lista | React + shadcn/ui |
| `agent/src/geo_agent/acervo.py` | **Fachada de escrita** no `app_clientes` — a primeira do sistema | psycopg |
| `agent/src/geo_agent/rotas_desenhos.py` | CRUD REST, `APIRouter` | FastAPI |
| `agent/src/geo_agent/tools.py` | Tool `info_area_desenhada` | Pydantic + OpenAI |
| `query/src/geo_query/queries.py` | `cruzamento_por_geometria` — **leitura** do `geodata` | psycopg + PostGIS |
| `app_clientes` (banco) | Schema, papel e tabela por cliente | PostgreSQL + PostGIS |

---

## Decisões

### Decisão 1 — A escrita é fachada nova; o cruzamento continua sendo leitura no `query/`

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-08-31 |

**Contexto:** a feature escreve pela primeira vez. O `query/db.py` declara em prosa que a
fachada nunca escreve, nem DDL — é a regra 4 da casa do `servidor-dados-gis`.

**Escolha:** duas fachadas, com papéis opostos e conexões distintas.

- `agent/acervo.py` — **escreve e lê** o `app_clientes`. Nova, com DSN próprio.
- `query/queries.py` — ganha `cruzamento_por_geometria()`, que **só lê** o `geodata`.

**Justificativa:** o cruzamento espacial é uma consulta de leitura sobre dado universal —
pertence ao `query/` por natureza, e negá-lo ali só criaria uma segunda fachada de leitura
do mesmo banco. O que não pode entrar no `query/` é a **escrita**, e ela não entra.

**Alternativas rejeitadas:**
1. *Tudo no `query/`* — quebraria a promessa que preserva a liberdade de recarregar o banco central.
2. *Tudo no `acervo.py`, inclusive o cruzamento* — duplicaria conexão, catálogo de métricas e tratamento de reconexão que o `GeoQuery` já resolve.

**Consequências:** o agente passa a manter duas conexões. O `acervo.py` nasce com a
responsabilidade de reconexão própria, espelhando `_reabre()` do `GeoQuery`.

---

### Decisão 2 — O buffer é aproximado no cliente para pré-visualizar e **recalculado no servidor** ao salvar

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-08-31 |

**Contexto:** o buffer precisa aparecer enquanto a pessoa digita o raio, mas o número que
fica guardado tem de ser confiável.

**Escolha:** o cliente desenha um círculo de 64 segmentos com a fórmula geodésica que
`medicao.ts` já usa (esfera IUGG). Ao salvar, o servidor descarta essa geometria e gera a
definitiva com `ST_Buffer(ponto::geography, raio)`, guardando centro e raio junto.

**Justificativa:** o cliente precisa de resposta imediata e não tem elipsoide; o PostGIS
tem. Guardar centro e raio além do polígono permite regenerar com mais precisão depois sem
migrar dado.

**Alternativas rejeitadas:**
1. *Só no cliente* — grava no banco uma aproximação esférica como se fosse verdade, e o número medido volta diferente do exibido.
2. *Só no servidor* — cada tecla no campo de raio viraria round-trip.

**Consequências:** o polígono exibido antes de salvar difere do guardado em até ~0,5% (a
faixa já medida em `medicao.test.ts`). O formulário mostra a área **depois** de salvar,
vinda do servidor, para não exibir dois números diferentes para a mesma coisa.

---

### Decisão 3 — Rateio areal com o aviso saindo da row, e o SQL num só round-trip

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-08-31 |

**Contexto:** regra 8 do ADR — o que muda o sentido do número é dado, não instrução de prompt.

**Escolha:** uma consulta devolve, junto: total rateado, contagem de setores, contagem de
parciais e **quanto do total veio de rateio**. O aviso é montado a partir desses campos, em
Python, e viaja no canal `avisos` da row — o mesmo caminho que `_avisos_classe_social()`
já usa.

**Justificativa:** medido — o rateio custa pouco e a informação de borda sai de graça da
mesma consulta. Cobrar um segundo round-trip pelo aviso seria pagar para poder esquecê-lo.

**Números medidos** no `geodata` local (468.097 setores, 2026-08-31):

| Área | Setores | Parciais | Tempo |
|---|---|---|---|
| Buffer 500 m | 65 | **39 (60%)** | 47 ms |
| Buffer 5 km (consulta completa, com join) | 3.892 | 166 (4%) | **119 ms** |
| Buffer 50 km | 49.015 | — | 358 ms |
| Município de SP como desenho (21.308 vértices) | 27.719 | — | 617 ms |

**Consequências:** o método supõe população uniforme dentro do setor, o que é falso em setor
rural grande. O aviso existe porque a premissa é falsa, não apesar disso. **Em área pequena a
borda domina** — 60% no buffer de 500 m —, o que torna o rateio obrigatório e não preferível.

---

### Decisão 4 — Sem limite de área; teto no **payload**, não na geografia

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-08-31 |

**Contexto:** Q-003 e A-004 do DEFINE pediam um teto.

**Escolha:** nenhum limite de extensão geográfica. O teto é de tamanho de requisição:
**50.000 vértices ou 1 MB** por desenho.

**Justificativa:** medido — o contorno do município de São Paulo tem 21.308 vértices e
333 kB, e cruza em 617 ms. O teto fica ~2,3× acima do pior caso realista, então protege
contra requisição absurda sem barrar nada legítimo. Limite geográfico seria uma parede
onde a medição não encontrou nenhuma, e contraria a regra 8: avisar, não recusar.

**Consequências:** uma área que cobre três estados responde, em segundos, com aviso da
extensão. Se a VPS não sustentar (A-001), a saída é cache por desenho — barato, porque o
resultado só muda quando o desenho muda.

---

### Decisão 5 — Isolamento por papel do PostgreSQL, com DSN por cliente

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-08-31 |

**Contexto:** o pedido original — "controle de acesso para os dados não se bagunçarem".

**Escolha:** cada cliente tem schema (`cliente_<id>`) e papel (`app_<id>`) próprios. O papel
recebe `USAGE` só no schema dele e **nenhum privilégio** no do outro. O DSN vai para o `.env`
do cliente; o agente não escolhe schema em runtime — ele nem alcança o do vizinho.

**Justificativa:** isolamento que depende de o código lembrar de filtrar por cliente falha
no dia em que alguém esquecer o `WHERE`. Aqui o banco recusa.

**Alternativas rejeitadas:**
1. *Uma tabela com coluna `cliente` e filtro na aplicação* — um `WHERE` esquecido vaza dado entre clientes, e nada no banco impede.
2. *Row-Level Security na mesma tabela* — protegeria, mas com um processo por cliente é complexidade sem ganho.

**Consequências:** cliente novo exige DDL (schema, papel, grants), que é passo do
`servidor-dados-gis` e não do deploy da aplicação. **AT-004 exige que o teste falhe se a
consulta cruzada devolver 0 linhas em vez de erro** — zero linhas parece sucesso e não é.

---

### Decisão 6 — A lista nasce paginada e com busca no servidor

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-08-31 |

**Contexto:** o volume-alvo é de centenas (~500), decidido no `/define`.

**Escolha:** `GET /api/desenhos` aceita `pagina`, `tamanho` (padrão 50), `categoria` e `q`.
A busca por nome é `ILIKE` sem acento, no mesmo padrão `translate()` que o `queries.py` usa
por não poder instalar `unaccent`.

**Justificativa:** 500 itens não quebram o navegador, mas quebram a usabilidade de uma lista
crua. Paginar depois exige mexer em API, cliente e componente ao mesmo tempo.

**Consequências:** o mapa carrega **todas** as geometrias do cliente (não paginadas) enquanto
a lista pagina — são coisas diferentes, e 500 polígonos em GeoJSON são alguns MB. Se A-002
furar, é aqui que entra carregamento por viewport.

---

### Decisão 7 — Categoria é texto livre com autocomplete vindo do próprio acervo

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-08-31 |

**Contexto:** categoria fixa exigiria deploy; JSONB livre viraria construtor de formulários.

**Escolha:** coluna `categoria text`, e `GET /api/desenhos/categorias` devolve o `DISTINCT`
do cliente, ordenado por frequência.

**Consequências:** "Pedágio" e "pedagio" viram categorias distintas. Mitigação barata: o
autocomplete compara sem acento e sem caixa, e sugere a existente antes de criar nova. Não
há normalização destrutiva — o que a pessoa digitou é o que fica.

---

### Decisão 8 — A UI diz quando o acervo está fora do ar

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-08-31 |

**Contexto:** a emenda à §9 do ADR — agente fora do ar passa a levar os desenhos junto.

**Escolha:** falha ao listar não quebra o mapa. O painel mostra estado de erro explícito
("não foi possível carregar seus desenhos"), com botão de tentar de novo. O basemap, os
tiles e a busca seguem funcionando.

**Justificativa:** a propriedade que a §9 ainda protege é "o site não morre". Uma tela em
branco a violaria na prática, mesmo com o Caddy servindo tudo.

**Consequências:** AT-012 testa exatamente isso e é teste de integração, não unitário.

---

## Manifesto de arquivos

### Fase 1 — alicerce e ponto

| # | Arquivo | Ação | Propósito | Agente | Depende de |
|---|---------|------|-----------|--------|------------|
| 1 | `cargas/app_clientes.sql` *(no `servidor-dados-gis`)* | Criar | Banco, schemas, papéis, grants e tabela `desenho`. Idempotente e aditivo | @python-developer | — |
| 2 | `agent/src/geo_agent/acervo.py` | Criar | Fachada de escrita/leitura do acervo; reconexão espelhando `GeoQuery._reabre()` | @python-developer | 1 |
| 3 | `agent/tests/test_acervo.py` | Criar | CRUD, isolamento entre papéis (AT-004), teto de payload | @test-generator | 2 |
| 4 | `agent/src/geo_agent/schemas.py` | Modificar | `Desenho`, `DesenhoNovo`, `PaginaDeDesenhos` | @python-developer | — |
| 5 | `agent/src/geo_agent/config.py` | Modificar | `acervo_dsn` | @python-developer | — |
| 6 | `agent/src/geo_agent/rotas_desenhos.py` | Criar | `APIRouter` com o CRUD e `/categorias` | @python-developer | 2, 4 |
| 7 | `agent/tests/test_rotas_desenhos.py` | Criar | Rotas, validação, paginação, erros | @test-generator | 6 |
| 8 | `agent/src/geo_agent/main.py` | Modificar | Incluir o router; `/api/health` passa a reportar o acervo | @python-developer | 6 |
| 9 | `web/src/desenho/geometria.ts` | Criar | Puro: validação, área, buffer geodésico | @frontend-developer | — |
| 10 | `web/src/desenho/geometria.test.ts` | Criar | Auto-interseção, degenerado, área conferida contra o PostGIS | @test-generator | 9 |
| 11 | `web/src/desenho/estado.ts` | Criar | Máquina do traçado: vértice, desfazer, encerrar | @frontend-developer | 9 |
| 12 | `web/src/desenho/estado.test.ts` | Criar | Transições e desfazer | @test-generator | 11 |
| 13 | `web/src/desenho/fonte.ts` | Criar | Fonte GeoJSON + camadas (padrão de `selection.ts`) | @frontend-developer | 9 |
| 14 | `web/src/desenho/api.ts` | Criar | Cliente REST | @frontend-developer | 4 |
| 15 | `web/src/desenho/BarraFerramentas.tsx` | Criar | Os três modos | @frontend-developer | 11 |
| 16 | `web/src/desenho/FormularioDesenho.tsx` | Criar | Nome, categoria com autocomplete, cor, observação | @frontend-developer | 14 |
| 17 | `web/src/desenho/PainelDesenhos.tsx` | Criar | Lista com busca, filtro, paginação e estado de erro | @frontend-developer | 14 |
| 18 | `web/src/map/MapView.tsx` | Modificar | Modo de desenho e a fonte dos desenhos | @frontend-developer | 13 |
| 19 | `web/src/map/estilo.ts` + `estilo.test.ts` | Modificar | Camadas de desenho em **todo** cliente (padrão da medição) | @frontend-developer | 13 |
| 20 | `web/src/App.tsx` | Modificar | Compor painel, barra e formulário | @frontend-developer | 15–17 |
| 21 | `deploy/clientes/*.env` + modelos | Modificar | `ACERVO_DSN` por cliente | @python-developer | 1 |

### Fase 2 — polígono · Fase 3 — buffer

| # | Arquivo | Ação | Propósito |
|---|---------|------|-----------|
| 22 | `web/src/desenho/geometria.ts` | Modificar | Auto-interseção e encerramento do traçado (fase 2) |
| 23 | `web/src/desenho/BarraFerramentas.tsx` | Modificar | Modos polígono e buffer |
| 24 | `web/src/desenho/geometria.ts` | Modificar | Círculo geodésico de 64 segmentos (fase 3) |
| 25 | `agent/src/geo_agent/acervo.py` | Modificar | `ST_Buffer` no servidor; guardar centro e raio |

### Fase 4 — o agente enxerga

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|------------|
| 26 | `query/src/geo_query/queries.py` | Modificar | `cruzamento_por_geometria()` — rateio areal, só leitura | — |
| 27 | `query/tests/test_queries.py` | Modificar | Gabarito (AT-005) e reconstituição do setor (AT-006) | 26 |
| 28 | `agent/src/geo_agent/tools.py` | Modificar | `info_area_desenhada` + `_avisos_de_borda()` | 26, 2 |
| 29 | `agent/tests/test_tools.py` | Modificar | AT-007: inspeciona a **row**, não a prosa | 28 |
| 30 | `agent/src/geo_agent/prompts.py` | Modificar | O escopo aprende que "a área que você desenhou" existe | 28 |
| 31 | `agent/benchmark.yaml` | Modificar | Casos de área desenhada | 30 |

**Total: 31 entradas** (24 arquivos distintos; 1 no `servidor-dados-gis`).

---

## Padrões de código

### 1. DDL do acervo — isolamento que o banco garante

```sql
-- cargas/app_clientes.sql (servidor-dados-gis). Idempotente e ADITIVO: roda em banco
-- que já existe, porque database/init/ só alcança volume novo (lição da regra 9).

CREATE DATABASE app_clientes;  -- fora da transação, uma vez
\c app_clientes
CREATE EXTENSION IF NOT EXISTS postgis;

-- Por cliente. O papel NÃO recebe nada no schema do vizinho — e é isso, e não o
-- código da aplicação, que impede a mistura.
CREATE SCHEMA IF NOT EXISTS cliente_geo_analytics;
CREATE ROLE app_geo_analytics LOGIN PASSWORD :'senha';
GRANT USAGE ON SCHEMA cliente_geo_analytics TO app_geo_analytics;

CREATE TABLE IF NOT EXISTS cliente_geo_analytics.desenho (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo          text NOT NULL CHECK (tipo IN ('ponto','poligono','buffer')),
    nome          text NOT NULL CHECK (length(trim(nome)) > 0),
    categoria     text,
    cor           text NOT NULL DEFAULT '#2563eb',
    observacao    text,
    -- EPSG:4674 (SIRGAS 2000), regra 2 da casa. Área e distância por geography.
    geom          geometry(Geometry, 4674) NOT NULL,
    -- Só para buffer: permite regenerar com mais precisão sem migrar dado.
    centro        geometry(Point, 4674),
    raio_m        double precision CHECK (raio_m IS NULL OR raio_m > 0),
    -- Dois produtores: o desenho do usuário e a carga administrativa de KML.
    -- Previsto agora para a carga não virar migração depois.
    origem        text NOT NULL DEFAULT 'desenho' CHECK (origem IN ('desenho','carga')),
    criado_em     timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    -- Teto de payload, não de geografia (Decisão 4). SP tem 21.308 vértices.
    CONSTRAINT desenho_tamanho CHECK (ST_NPoints(geom) <= 50000),
    CONSTRAINT desenho_valido  CHECK (ST_IsValid(geom))
);
CREATE INDEX IF NOT EXISTS desenho_geom_idx ON cliente_geo_analytics.desenho USING gist (geom);
CREATE INDEX IF NOT EXISTS desenho_categoria_idx ON cliente_geo_analytics.desenho (categoria);

GRANT SELECT, INSERT, UPDATE, DELETE ON cliente_geo_analytics.desenho TO app_geo_analytics;
```

### 2. O cruzamento — **medido, 119 ms para 3.892 setores**

```python
# query/src/geo_query/queries.py — SÓ LEITURA. O polígono chega como PARÂMETRO
# (Decisão 1): é o que dispensa postgres_fdw e preserva a promessa do db.py.

def cruzamento_por_geometria(self, wkb: bytes, metricas: list[str]) -> dict[str, Any]:
    """Agrega o Censo sob uma geometria arbitraria, com rateio areal na borda.

    O aviso de borda sai DAQUI, junto do numero, e nao do prompt: regra 8 do
    ADR-0001. Os campos `parciais` e `pop_de_rateio` existem para o chamador poder
    montar a ressalva sem uma segunda consulta -- cobrar um round-trip pelo aviso
    seria pagar para poder esquece-lo.
    """
    return self._rows(
        sql.SQL("""
            with area as (select ST_GeomFromWKB(%s, 4674) as g),
            frac as (
                select s.cod_setor,
                       -- ST_Within primeiro: o caso comum e barato, e o
                       -- ST_Intersection (caro) so roda na borda. E o que faz o
                       -- rateio custar +65% e nao +500%.
                       case when ST_Within(s.geom, a.g) then 1.0
                            else ST_Area(ST_Intersection(s.geom, a.g)::geography)
                                 / nullif(ST_Area(s.geom::geography), 0)
                       end as f
                from ibge.setor_censitario s, area a
                where ST_Intersects(s.geom, a.g)
            )
            select count(*)                                  as setores,
                   count(*) filter (where f < 0.999)         as parciais,
                   round(sum(r.pop_total * f))               as pop_total,
                   round(sum(r.pop_total * f)
                         filter (where f < 0.999))           as pop_de_rateio
            from frac join ibge_tabular.setor_resumo r using (cod_setor)
        """),
        [wkb],
    )[0]
```

> **Nota para o `/build`:** `ibge_tabular.setor_resumo` é **materialized view**, não view —
> `\dv` não a lista, `\dm` sim. Descobrir isso na hora do build custaria uma investigação.

### 3. O aviso de borda como dado — padrão de `_avisos_classe_social()`

```python
# agent/src/geo_agent/tools.py

def _avisos_de_borda(row: dict[str, Any]) -> list[str]:
    """O que o rateio areal obriga a declarar, saindo da ROW e nao do prompt.

    Regra 8 do ADR-0001, a mesma que rege a classe social: o que muda o sentido do
    numero e dado. Ao prompt cabe reescrever com as palavras da resposta, nao decidir
    se o aviso existe.
    """
    parciais = row.get("parciais") or 0
    if not parciais:
        return []
    total, rateada = row.get("pop_total") or 0, row.get("pop_de_rateio") or 0
    pct = round(100 * rateada / total) if total else 0
    return [
        f"a area corta {parciais} setores censitarios ao meio; {pct}% da populacao "
        "informada vem de rateio pela area da intersecao, o que supoe distribuicao "
        "uniforme dentro do setor -- falso em setor rural grande com a vila num canto"
    ]
```

### 4. Geometria pura no cliente — padrão de `medicao.ts`

```ts
// web/src/desenho/geometria.ts
// Fora do React e do MapLibre pelo mesmo motivo de medicao.ts: dá para conferir
// vértice a vértice sem subir navegador nem WebGL.

/** Um polígono que cruza a si mesmo é inválido no PostGIS e o INSERT falharia longe
 *  daqui — com mensagem que o usuário não entende. Recusar no traçado é mais barato. */
export function autoIntersecta(coordenadas: readonly Coordenada[]): boolean { /* … */ }

/** Círculo geodésico de 64 segmentos, só para pré-visualizar (Decisão 2).
 *  A geometria que FICA é a que o PostGIS gera com ST_Buffer sobre geography. */
export function circuloAproximado(centro: Coordenada, raioM: number): Coordenada[] { /* … */ }
```

### 5. Configuração

| Chave | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `ACERVO_DSN` | string | `""` | Conexão do `app_clientes`, com o papel do cliente. Vazio = feature indisponível, com a UI dizendo isso |
| `DESENHO_MAX_VERTICES` | int | `50000` | Teto de payload (Decisão 4) |
| `DESENHO_PAGINA_TAMANHO` | int | `50` | Itens por página na lista |

---

## Fluxo de dados — a pergunta sobre a área desenhada

```text
1. Pessoa desenha e salva
   │  POST /api/desenhos  →  acervo.py  →  INSERT em cliente_<id>.desenho
   ▼
2. Pergunta no chat: "quantas pessoas moram na área X?"
   │  POST /api/chat  →  agent.py (loop de tool-calling)
   ▼
3. O LLM escolhe info_area_desenhada(nome="X")
   │  tools.py → acervo.busca_por_nome() → WKB (~2 kB)  [app_clientes]
   ▼
4. O WKB viaja como PARÂMETRO
   │  query.cruzamento_por_geometria(wkb, …)            [geodata, SÓ LEITURA]
   │  → 119 ms típicos; devolve total, setores, parciais, pop_de_rateio
   ▼
5. A row vira payload + avisos (determinístico; o LLM não decide se o aviso existe)
   ▼
6. Resposta: texto do LLM + destaques dos códigos + a área já pintada no mapa
```

---

## Estratégia de testes

| Tipo | Escopo | Arquivos | Ferramenta | Cobre |
|------|--------|----------|------------|-------|
| Unitário (front) | Geometria e estado, sem navegador | `desenho/geometria.test.ts`, `estado.test.ts` | vitest | AT-009, AT-010 |
| Unitário (back) | Fachada e rotas, com banco de teste | `test_acervo.py`, `test_rotas_desenhos.py` | pytest | AT-001–003, AT-013–016 |
| **Isolamento** | Papel do cliente 2 contra o schema do 1 | `test_acervo.py` | pytest | **AT-004** — falha se vier 0 linhas em vez de erro |
| **Gabarito** | Município como desenho × tool municipal | `query/tests/test_queries.py` | pytest | **AT-005** (≤ 0,5%) |
| **Rateio** | Metades complementares reconstituem o setor | `query/tests/test_queries.py` | pytest | **AT-006** (≤ 1%) |
| **Grounding** | A row traz parciais e fração rateada | `agent/tests/test_tools.py` | pytest | **AT-007** — inspeciona a row, nunca a prosa |
| Integração | Agente parado, mapa de pé | manual + `MapView.test.tsx` | vitest | AT-012 |
| Casca | Camadas de desenho em todo cliente | `map/estilo.test.ts` | vitest | Regra 1 |
| Fronteira | Nenhum `.py`/`.tsx` cita cliente | `clientes.test.ts`, `test_cliente.py` | ambos | AT-017 |
| Benchmark | Perguntas reais sobre área desenhada | `benchmark.yaml` | pytest `-m benchmark` | Fase 4 |

---

## Tratamento de erros

| Erro | Estratégia | Repete? |
|------|------------|---------|
| `ACERVO_DSN` ausente | O agente sobe e o chat funciona; o painel diz que o acervo está indisponível. **Não derruba o processo** — a §9 protege o site | Não |
| Acervo fora do ar ao listar | Estado de erro no painel com "tentar de novo"; mapa intacto (Decisão 8) | Manual |
| Conexão morta entre requisições | `_reabre()`, espelhando o `GeoQuery` | Sim, 1× |
| Geometria inválida (auto-interseção) | Recusada no cliente antes de sair; o `CHECK ST_IsValid` é a segunda trava | Não |
| Payload acima do teto | `413`, com a contagem de vértices na mensagem | Não |
| Nome vazio | `422` do Pydantic | Não |
| Desenho inexistente na tool | Erro volta ao LLM para autocorreção (1×), como as demais tools | Sim, 1× |
| Cruzamento acima de 30 s | `statement_timeout` na conexão; devolve aviso em vez de pendurar o chat | Não |

---

## Segurança

- **Isolamento no banco, não no código** (Decisão 5). O papel do cliente 2 não tem privilégio no schema do 1; AT-004 exige erro, não lista vazia.
- **Toda a superfície fica atrás do portão** do cliente. Nada de `/api/desenhos` público.
- **A senha do portão passa a proteger dado, e não só custo de API.** Registrado na emenda à §8; é A-005 e continua aceito, com a ressalva de que ela é compartilhada e já se perdeu uma vez.
- **Nada de desenho no host de tiles**, que é aberto na internet (`206` sem credencial, medido em 2026-08-31). A geometria do cliente sai por GeoJSON da API.
- **Consultas parametrizadas** — a geometria viaja como parâmetro binário, nunca interpolada em SQL.
- **`Content-Length` verificado antes de parsear** o corpo, para o teto de payload não exigir carregar 1 GB na memória para então recusar.

## Observabilidade

| Aspecto | Implementação |
|---------|----------------|
| Log | JSON com `cliente` em cada linha, via `observabilidade.py` — dois agentes escrevem no mesmo journal |
| `/api/health` | Passa a reportar o acervo além do `geodata`: `{"acervo": "ok"\|"erro: …"}`. Sem isso, "vivo" volta a não bastar |
| Métrica | Duração do cruzamento no log, para validar A-001 **na VPS** em vez de neste Mac |

---

## Riscos e o que fica pendente

| Risco | Mitigação |
|---|---|
| **A-001** — os tempos são deste Mac, não da VPS | Medir na VPS antes da fase 4. Se furar: cache por desenho, invalidado na edição |
| **A-006 / Q-001** — backup do `app_clientes` | **Bloqueia a subida da fase 1 à VPS.** Não é código desta feature |
| **A-002** — 500 desenhos | A API já nasce paginada; o ajuste seria carregamento por viewport, na UI |
| Disco da VPS: 3,9 GB de 38 GB | O acervo é pequeno (KB por desenho); o aperto não vem daqui |
| Duas conexões por processo, × 2 clientes | Pool pequeno e explícito; a §9 já lista RAM como risco |

---

## Histórico de revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-08-31 | sessão `/design` | Versão inicial. Oito decisões, todas as de desempenho ancoradas em medição do `geodata` local; Q-003 fechada (teto de payload, não de geografia) |

---

## Próximo passo

**Pronto para:** `/build .claude/sdd/features/DESIGN_DESENHO_NO_MAPA.md`

Começar pela **fase 1** (itens 1–21). O item 1 é no `servidor-dados-gis` e é
pré-requisito de tudo.
