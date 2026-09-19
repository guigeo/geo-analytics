# DESIGN: EQUIPAMENTOS_OFICIAIS_NO_MAPA

> Desenho técnico para levar CNES e Inep ao mapa, ao Raio-X e ao agente.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | EQUIPAMENTOS_OFICIAIS_NO_MAPA |
| **Date** | 2026-09-19 |
| **Author** | Claude Opus 5 (sessão com o Gui) |
| **DEFINE** | [`DEFINE_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md`](DEFINE_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md) |
| **Status** | Aceite visual cumprido — falta publicar tiles e `ship-*` |
| **Handoff** | [`HANDOFF_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md`](HANDOFF_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md) — quem executa o build lê antes |

---

## Architecture Overview

```text
┌──────────────────── servidor-dados-gis (dono do dado) ────────────────────┐
│                                                                            │
│  metodologia/cnes/tipo_unidade.csv   ← NOVO: de-para oficial, versionado   │
│         │                                                                  │
│         ▼                                                                  │
│  cargas/_tipo_unidade.sh             ← NOVO: cria infraestrutura.          │
│         │                              cnes_tipo_unidade (cod, rotulo,     │
│         │                              classe) + linhagem em meta.fonte    │
│         ▼                                                                  │
│  geodata local  ──── vps-publicar-tipo-unidade.sh ────►  réplica na VPS    │
│  (já tem estabelecimento_saude e escola, publicados em 19/09)              │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ GEODATA_DSN (leitura)
┌───────────────────────────────▼──────────── geo-analytics ─────────────────┐
│                                                                            │
│  pipeline/datasets.yaml                                                    │
│    + escolas   (SQL: escola_analisavel      ⨝ classe)                      │
│    + saude     (SQL: estabelecimento_saude_analisavel ⨝ cnes_tipo_unidade) │
│         │                                                                  │
│         ▼  make build --only escolas / --only saude                        │
│    ogr2ogr → tippecanoe → escolas.pmtiles, saude.pmtiles                   │
│         │                                                                  │
│         ▼  (repo webgis) make ship-tiles                                   │
│    tiles.averisen.com ──────────────────────────────┐                      │
│                                                      │                      │
│  web/src/configuracao/                               │                      │
│    esquema.ts  + EsquemaFiltroPorCategoria           │  pmtiles://          │
│    catalogo.ts + escolas, saude                      │                      │
│         │                                            ▼                      │
│         ├──► panels/LayerPanel  → SeletorDeClasses (novo, irmão do          │
│         │                          SeletorDeTema)                           │
│         └──► map/MapView        → setFilter (padrão já existente, :451)     │
│                                                                            │
│  query/src/geo_query/queries.py                                            │
│    + escolas_por_geometria()  + saude_por_geometria()                      │
│    ~ _bloco_equipamentos()    ← troca a fonte do cartão                     │
│         │                                                                  │
│         ├──► agent/rotas_raio_x.py → GET /api/raio-x/{id}  (sem LLM)       │
│         └──► agent/tools.py        → equipamentos_no_ponto (nova)          │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Components

| Componente | Função | Tecnologia |
|---|---|---|
| De-para de tipo | Traduz os 39 códigos `tipo_unidade` em rótulo + classe | CSV versionado + tabela PostGIS |
| Dataset de tile | Achata as views analisáveis em GeoParquet e depois PMTiles | SQL → ogr2ogr → tippecanoe |
| Catálogo | Declara as duas camadas, sua procedência, cobertura e classes filtráveis | TypeScript + Zod |
| Filtro de classe | Liga/desliga subconjunto sem recarregar o tile | MapLibre `setFilter` |
| Fachada de consulta | SQL do Raio-X e das tools, num lugar só | Python + psycopg |
| Tool do agente | Expõe os dois cadastros ao LLM | Pydantic + `TOOL_REGISTRY` |

---

## Key Decisions

### Decisão 1: A taxonomia de classes é portão de aceite, não detalhe de implementação

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-19 |

**Contexto:** o DEFINE fechou em 14/15 com uma única pergunta aberta — quais classes
existem e que código cai em cada uma. Ela depende do de-para oficial, e é a decisão de
produto da feature: define o que o mapa mostra e o que o cartão conta.

**Escolha:** a tarefa 1 do build produz o de-para **e** a taxonomia proposta, e **para**.
O Gui aprova a tabela de classes antes de qualquer SQL de dataset ser escrito. Só então o
build segue.

**Racional:** escrever o `CASE` primeiro e ajustar depois significa regerar tile, republicar
e refazer o aceite visual. O custo de parar é uma mensagem; o de não parar é um ciclo
inteiro.

**Alternativas rejeitadas:**
1. Fixar a taxonomia agora, no DESIGN — seria inventar rótulo para 33 dos 39 códigos, e
   o próprio DEFINE marca "Especialidade" como suspeita.
2. Deixar o build decidir sozinho — é a decisão de produto, não é dele.

**Consequências:**
- O build tem um ponto de bloqueio explícito, e isso é intencional.
- A taxonomia nasce com procedência, não com o palpite de quem estava implementando.

**Resultado (2026-09-19):** portão cumprido antes do build. O de-para saiu da
`CNES/CNV/TP_ESTAB.CNV` do TabNet (45 códigos oficiais), está em
`servidor-dados-gis/metodologia/cnes/tipo_unidade.csv` e o Gui aprovou a taxonomia,
incluindo o item contestado (tipo 36 entra como `especialidade`). O build começa pela
etapa 1 e **não para mais**.

---

### Decisão 2: O de-para mora no `servidor-dados-gis`, como tabela, não como `CASE` no YAML

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-19 |

**Contexto:** o `tipo_unidade` é inteiro sem rótulo. O `datasets.yaml` poderia resolver com
um `CASE WHEN tipo_unidade IN (1,2) THEN 'atenção básica'`.

**Escolha:** uma tabela `infraestrutura.cnes_tipo_unidade (cod, rotulo, classe, conta_no_raio_x)`
carregada de um CSV versionado, com linhagem em `meta.fonte`. O `datasets.yaml` faz `JOIN`,
não `CASE`.

**Racional:** o `CASE` no YAML é invisível para qualquer outro consumidor — a tool do
agente precisaria repeti-lo, e duas cópias divergem. A tabela também permite o AT-010:
código novo numa safra futura **falha ruidosamente** em vez de cair num `ELSE 'outros'`.

**Alternativas rejeitadas:**
1. `CASE` no `datasets.yaml` — duplicaria na fachada `queries.py`.
2. De-para em TypeScript no catálogo — o backend não o enxerga.

**Consequências:**
- Mais um objeto para publicar na VPS (tabela pequena, ~39 linhas).
- A coluna `conta_no_raio_x` transforma a decisão "farmácia não é manchete" em **dado**,
  coerente com a emenda de 2026-09-03 à regra 8 do ADR-0001.

---

### Decisão 3: O filtro de classe copia dois padrões existentes em vez de inventar um

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-19 |

**Contexto:** o DEFINE marcou o filtro como "mecanismo novo em três arquivos" e o maior
risco da feature.

**Escolha:** `MapView.tsx:451` já estabelece que **esconder é por filtro, não por
`visibility`**, e já chama `setFilter` com `filtroDoAcervo`. `LayerPanel.tsx:187` já
renderiza um sub-controle por camada (`SeletorDeTema`). O filtro de classe é
`filtroDeClasses(camada, ocultas)` no MapView e `SeletorDeClasses` no painel — irmãos
diretos dos dois.

**Racional:** o risco medido é menor do que o estimado no DEFINE. O que é de fato novo é só
o campo no `esquema.ts` e o estado das classes ocultas; o resto é forma já escrita.

**Alternativas rejeitadas:**
1. Uma camada MapLibre por classe sobre o mesmo source — multiplicaria `SUFIXOS_SUBCAMADA`
   e quebraria o toggle, que herda do id base.
2. Filtro server-side — o tile é estático; não há servidor para filtrar.

**Consequências:**
- O `esquema.ts` ganha um campo genérico, útil para qualquer camada categórica futura.
- O estado das classes ocultas precisa viver junto do `visible`/`temaAtivo` já existentes.

---

### Decisão 4: A coerência entre cartão e mapa vem do padrão de filtro, não de contarem a mesma coisa

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-19 |

**Contexto:** o Gui decidiu que o cartão conta só assistência, mas o mapa mostra farmácia e
apoio diagnóstico. Isso contraria a regra "desenhar e contar batem sempre" da decisão 2 do
brainstorm.

**Escolha:** as classes com `conta_no_raio_x = true` nascem **ligadas**; as outras nascem
**desligadas**. No estado inicial os dois números coincidem. O cartão nomeia o próprio
recorte, e quem liga farmácia rompe a igualdade por escolha explícita.

**Racional:** preserva as duas decisões do Gui sem escolher entre elas. A mesma coluna do
de-para governa o default do mapa e o recorte do cartão — uma fonte, dois consumidores, sem
chance de divergirem.

**Alternativas rejeitadas:**
1. O cartão contar tudo — "31 unidades de saúde" incluiria a farmácia da esquina.
2. Farmácia fora também do mapa — perderia informação que o usuário pode querer.

**Consequências:**
- Um usuário que liga farmácia e depois lê o cartão vê números diferentes. Aceito, porque
  a ação foi dele e o cartão diz o que conta (AT-006).

---

### Decisão 5: O recorte de assistência sai do `tipo_unidade`, não das flags `ST_ATEND_*`

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-19 |

**Contexto:** a suposição A-004 do DEFINE perguntava se o recorte é derivável só do
`tipo_unidade`. O CSV do DATASUS tem 36 colunas e a carga usou 15; entre as descartadas
estão `ST_ATEND_AMBULATORIAL`, `ST_ATEND_HOSPITALAR` e `ST_SERVICO_APOIO`, que **pareciam**
resolver a separação assistência × apoio oficialmente.

**Escolha:** o `tipo_unidade` continua sendo o critério. As flags ficam fora.

**Racional — medido no CSV em 2026-09-19, sobre os 497.614 ativos:**

| flag | marcados | leitura |
|---|---:|---|
| `ST_ATEND_AMBULATORIAL` | 8.651 | Quase todos tipo 5. **Não** significa "atende ambulatorialmente" — é atributo de hospital. Inútil aqui |
| `ST_SERVICO_APOIO` | 225.883 | Inclui 78.908 consultórios isolados. Ruído |
| `ST_ATEND_HOSPITALAR` | 8.082 | **Útil**: 5.333 em tipo 5, mais 2.749 hospitais que o tipo sozinho não pega |

**Alternativas rejeitadas:**
1. Usar `ST_ATEND_AMBULATORIAL` como recorte de assistência — os números provam que
   mediria outra coisa. Teria passado no teste e mentido no produto.

**Consequências:**
- `ST_ATEND_HOSPITALAR` fica registrado como **refinamento futuro** da classe Hospital.
  Usá-lo exige adicionar a coluna à carga do `servidor-dados-gis`, que o DEFINE pôs fora de
  escopo. Não se faz de contrabando aqui.

---

### Decisão 6: Uma tool para os dois cadastros, não uma por cadastro

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-19 |

**Contexto:** o agente precisa responder sobre escola e sobre saúde.

**Escolha:** `equipamentos_no_ponto(lat, lon, raio_m, dominios: ["ensino","saude"])`, uma
tool, com o SQL em dois métodos separados na fachada.

**Racional:** o LLM escolhe melhor entre poucas tools bem nomeadas. A pergunta real do
usuário ("o que tem de equipamento aqui?") raramente separa os domínios.

**Alternativas rejeitadas:**
1. Duas tools — dobra a superfície de escolha do LLM para ganhar nada.
2. Estender `h3_no_ponto` — o H3 é grade pré-calculada de outra fonte; misturar esconderia
   qual número veio de onde.

**Consequências:**
- O `Literal` `Camada` em `tools.py:22` precisa ganhar as camadas novas — e é a ocasião de
  fechar a divergência com `schemas.py:30`, que o DEFINE listou como COULD.

---

## File Manifest

### Etapa 1 — de-para (portão de aceite ao fim)

| # | Arquivo | Ação | Propósito | Agente | Dep. |
|---|---|---|---|---|---|
| 1 | `servidor-dados-gis/metodologia/cnes/tipo_unidade.csv` | Criar | De-para oficial: `cod, rotulo, classe, conta_no_raio_x` | @geo-analytics-expert | — |
| 2 | `servidor-dados-gis/cargas/_tipo_unidade.sh` | Criar | Carrega o CSV em `infraestrutura.cnes_tipo_unidade`, com linhagem e o teste do AT-010 | @python-developer | 1 |
| 3 | `servidor-dados-gis/docs/cnes.md` | Editar | Documenta o de-para, a procedência e a taxonomia | @code-documenter | 1,2 |
| 4 | `servidor-dados-gis/scripts/verificar.sh` | Editar | Invariante: todo `tipo_unidade` do dado tem linha no de-para | @python-developer | 2 |
| 5 | `servidor-dados-gis/scripts/vps-publicar-tipo-unidade.sh` | Criar | Réplica da tabela pequena; `--ensaio` sem SSH | @python-developer | 2 |

> **PARA AQUI.** A taxonomia vai ao Gui antes da etapa 2 (Decisão 1).

### Etapa 2 — tile

| # | Arquivo | Ação | Propósito | Agente | Dep. |
|---|---|---|---|---|---|
| 6 | `pipeline/datasets.yaml` | Editar | Datasets `escolas` e `saude` | @ai-data-engineer | 1–5 |

### Etapa 3 — catálogo e mapa

| # | Arquivo | Ação | Propósito | Agente | Dep. |
|---|---|---|---|---|---|
| 7 | `web/src/configuracao/esquema.ts` | Editar | `EsquemaFiltroPorCategoria` + validação em `superRefine` | @frontend-developer | — |
| 8 | `web/src/configuracao/catalogo.ts` | Editar | Camadas `escolas` e `saude`, com `fonte`, `cobertura`, `filtros` | @frontend-developer | 7 |
| 9 | `web/src/map/icons.ts` | Editar | `SCHOOL_ICON` e `HEALTH_ICON` + registro em `ICON_SVGS` | @frontend-developer | — |
| 10 | `web/src/clientes/geo-analytics.ts` | Editar | Lista as duas camadas | @frontend-developer | 8 |
| 11 | `web/src/clientes/eb-prime.ts` | Editar | Idem (decisão 8 do DEFINE) | @frontend-developer | 8 |
| 12 | `web/src/map/layers.ts` | Editar | `filtroDeClasses()` — filtro inicial a partir do catálogo | @frontend-developer | 7,8 |
| 13 | `web/src/map/MapView.tsx` | Editar | `setFilter` ao mudar classe oculta, no padrão de `:451` | @frontend-developer | 12 |
| 14 | `web/src/panels/SeletorDeClasses.tsx` | Criar | Sub-controle no painel, irmão do `SeletorDeTema` | @frontend-developer | 7 |
| 15 | `web/src/panels/LayerPanel.tsx` | Editar | Monta o `SeletorDeClasses` | @frontend-developer | 14 |
| 16 | `web/src/panels/grupos.test.ts` | Editar | O teste crava `["antenas","rodovias","ferrovias"]` (`:19`) | @test-generator | 10 |
| 17 | `web/src/map/__snapshots__/layers.test.ts.snap` | Regenerar | Com revisão do diff, não com `-u` cego | @test-generator | 12 |
| 18 | `web/src/map/layers.test.ts` | Editar | Casos do filtro de classe | @test-generator | 12 |
| 19 | `web/src/panels/SeletorDeClasses.test.tsx` | Criar | Liga/desliga classe | @test-generator | 14 |

### Etapa 4 — Raio-X

| # | Arquivo | Ação | Propósito | Agente | Dep. |
|---|---|---|---|---|---|
| 20 | `query/src/geo_query/queries.py` | Editar | `escolas_por_geometria()`, `saude_por_geometria()`, troca de fonte em `_bloco_equipamentos()`, `versao_calculo` → 6 | @python-developer | 1–6 |
| 21 | `agent/src/geo_agent/schemas.py` | Editar | Contrato do bloco: procedência nova e o recorte nomeado | @python-developer | 20 |
| 22 | `web/src/raiox/api.ts` | Editar | Tipos espelhando o contrato | @frontend-developer | 21 |
| 23 | `web/src/raiox/blocos.tsx` | Editar | `BlocoDeEquipamentos` (`:383`): fonte e recorte na tela | @frontend-developer | 22 |
| 24 | `query/tests/test_raio_x.py` | Editar | AT-005, AT-007, AT-008 | @test-generator | 20 |
| 25 | `agent/tests/test_contrato_raio_x.py` | Editar | Contrato novo | @test-generator | 21 |
| 26 | `web/src/raiox/blocos.test.tsx` | Editar | Rótulos e fallback | @test-generator | 23 |

### Etapa 5 — agente

| # | Arquivo | Ação | Propósito | Agente | Dep. |
|---|---|---|---|---|---|
| 27 | `agent/src/geo_agent/tools.py` | Editar | `EquipamentosNoPonto` + handler + registro; fecha o `Literal` de `:22` | @ai-developer | 20 |
| 28 | `agent/src/geo_agent/prompts.py` | Editar | `:68-73` e `:136` descrevem os cadastros oficiais | @ai-prompt-specialist | 27 |
| 29 | `agent/tests/test_tools.py` | Editar | AT-011 | @test-generator | 27 |

### Etapa 6 — publicação

| # | Arquivo | Ação | Propósito | Agente | Dep. |
|---|---|---|---|---|---|
| 30 | `AGENTS.md` + `docs/DECISOES.md` | Editar | Estado novo; risca a pendência de 18/09 | @code-documenter | tudo |

**Total: 30 arquivos** — 7 criados, 22 editados, 1 regenerado. Dois repositórios.

---

## Agent Assignment Rationale

| Agente | Arquivos | Por quê |
|---|---|---|
| @geo-analytics-expert | 1 | A taxonomia é decisão de domínio, não de código |
| @python-developer | 2, 4, 5, 20 | Bash de carga e fachada SQL |
| @frontend-developer | 7–15, 22, 23 | Catálogo, MapLibre, painel |
| @ai-data-engineer | 6 | SQL do dataset e orçamento de tile |
| @ai-developer | 27 | Tool e contrato com o LLM |
| @ai-prompt-specialist | 28 | Prompt do sistema |
| @test-generator | 16–19, 24–26, 29 | Testes de todas as etapas |
| @code-documenter | 3, 30 | Documentação nos dois repos |

**Lição herdada das cargas de 18/09:** "os subagentes pararam na leitura, e a implementação
direta fechou as duas". Se um subagente não escrever em duas tentativas, o build assume
direto em vez de insistir.

---

## Code Patterns

### Pattern 1: De-para como tabela com falha ruidosa

```sql
-- infraestrutura.cnes_tipo_unidade — o ELSE não existe de propósito.
CREATE TABLE infraestrutura.cnes_tipo_unidade (
    cod              integer PRIMARY KEY,
    rotulo           text    NOT NULL,          -- nome oficial do DATASUS
    classe           text    NOT NULL,          -- agrupamento do produto
    conta_no_raio_x  boolean NOT NULL,          -- entra na manchete do cartão
    no_mapa          boolean NOT NULL           -- false exclui do tile (tipo 22)
);

-- Invariante para scripts/verificar.sh (AT-010): código no dado sem linha aqui
-- é erro, não "outros".
SELECT e.tipo_unidade
FROM infraestrutura.estabelecimento_saude_analisavel e
LEFT JOIN infraestrutura.cnes_tipo_unidade t ON t.cod = e.tipo_unidade
WHERE t.cod IS NULL
GROUP BY 1;
-- Qualquer linha aqui derruba a verificação.
```

### Pattern 2: Dataset do tile (`pipeline/datasets.yaml`)

```yaml
  - name: saude            # tem de bater com o id do catálogo: vira saude.pmtiles
    source:
      kind: geodata
      sql: >-
        select e.cod_cnes, e.nome_fantasia as nome, t.rotulo as tipo,
               t.classe, m.nome as municipio, m.sigla_uf as uf, e.geom
        from infraestrutura.estabelecimento_saude_analisavel e
        join infraestrutura.cnes_tipo_unidade t on t.cod = e.tipo_unidade
        join ibge.municipio m using (cod_municipio)
        where t.no_mapa
    geometry: point
    attributes: [cod_cnes, nome, tipo, classe, municipio, uf]
    tile: { minzoom: 6, maxzoom: 14 }
```

> `minzoom: 6`, não 4 como a antena: 263 mil pontos no Brasil inteiro em z4 é mancha, e
> cada zoom a menos é disco que a VPS não tem.
> Apelidos **sem aspas** — o Postgres minusculiza, que é o contrato das camadas de
> infraestrutura. Aspas só no contrato IBGE (`CD_MUN`).

### Pattern 3: Filtro por categoria no catálogo

```ts
// esquema.ts — campo novo, genérico para qualquer camada categórica.
export const EsquemaFiltroPorCategoria = z.object({
  /** Atributo do tile pelo qual se filtra. */
  campo: z.string().min(1),
  rotulo: z.string().min(1),
  classes: z
    .array(
      z.object({
        valor: z.string().min(1),
        rotulo: z.string().min(1),
        /** Nasce ligada? As classes que o Raio-X conta nascem; as outras, não. */
        inicialmenteLigada: z.boolean(),
      }),
    )
    .min(2, "filtro com uma classe só não filtra nada"),
});
```

```ts
// catalogo.ts
  saude: {
    id: "saude",
    rotulo: "Estabelecimentos de saúde",
    grupo: "infraestrutura",
    camadaFonte: "saude",
    geometria: "ponto",
    cor: "#0e7490",
    icone: HEALTH_ICON,
    ancoraIcone: "base",
    iconesPodemSobrepor: true,
    fonte: "CNES · DATASUS",
    // Medido em 2026-09-19: 636.342 publicados, 484.978 analisáveis, e o
    // consultório isolado sai do mapa por decisão de produto, não por qualidade.
    cobertura:
      "Nacional · exclui consultório isolado e ponto sem localização confiável",
    filtros: {
      campo: "classe",
      rotulo: "Tipo de estabelecimento",
      classes: [
        { valor: "atencao_basica", rotulo: "Atenção básica", inicialmenteLigada: true },
        { valor: "hospital", rotulo: "Hospital", inicialmenteLigada: true },
        // … a lista final sai do portão de aceite da Decisão 1
        { valor: "farmacia", rotulo: "Farmácia", inicialmenteLigada: false },
      ],
    },
    atributos: [
      { chave: "nome", rotulo: "Nome" },
      { chave: "tipo", rotulo: "Tipo" },
      { chave: "classe", rotulo: "Classe" },
      { chave: "municipio", rotulo: "Município" },
    ],
  },
```

### Pattern 4: Filtro no mapa — segue `MapView.tsx:451`

```ts
// layers.ts
export function filtroDeClasses(c: DefinicaoCamada, ocultas: string[]): FilterSpecification | null {
  if (!c.filtros || ocultas.length === 0) return null;
  return ["!", ["in", ["get", c.filtros.campo], ["literal", ocultas]]];
}

// MapView.tsx — mesmo gesto que o acervo de desenhos já faz.
useEffect(() => {
  for (const c of camadas) {
    if (!c.filtros || !map.getLayer(c.id)) continue;
    map.setFilter(c.id, filtroDeClasses(c, classesOcultas[c.id] ?? []));
  }
}, [classesOcultas]);
```

### Pattern 5: Fachada do Raio-X

```python
# queries.py — o recorte vem do de-para, não de uma lista literal aqui.
SQL_SAUDE_NA_AREA = """
WITH a AS (SELECT ST_GeomFromWKB(%(wkb)s, 4674) AS g)
SELECT count(*) FILTER (WHERE t.conta_no_raio_x) AS total,
       count(*)                                  AS total_no_mapa,
       jsonb_agg(DISTINCT t.classe) FILTER (WHERE t.conta_no_raio_x) AS classes
FROM infraestrutura.estabelecimento_saude_analisavel e
JOIN infraestrutura.cnes_tipo_unidade t ON t.cod = e.tipo_unidade
CROSS JOIN a
WHERE t.no_mapa AND ST_Intersects(e.geom, a.g)
"""
```

> `total` e `total_no_mapa` juntos existem para o AT-005: o contrato carrega os dois, e o
> teste prova que são iguais quando nenhuma classe extra está ligada.

---

## Data Flow

```text
1. CSV oficial do DATASUS  →  metodologia/cnes/tipo_unidade.csv (versionado)
   │
   ▼
2. cargas/_tipo_unidade.sh  →  infraestrutura.cnes_tipo_unidade + meta.fonte
   │                           ⇢ PORTÃO: taxonomia aprovada pelo Gui
   ▼
3. datasets.yaml  →  ogr2ogr  →  tippecanoe  →  escolas.pmtiles, saude.pmtiles
   │
   ▼
4. webgis: make ship-tiles  →  tiles.averisen.com   (mede disco antes e depois)
   │
   ├──► mapa: catálogo → MapLibre → setFilter por classe
   │
   ├──► Raio-X: queries.py → rotas_raio_x.py → blocos.tsx
   │
   └──► agente: tools.py → equipamentos_no_ponto → resposta com nome de escola
```

---

## Integration Points

| Sistema | Tipo | Autenticação |
|---|---|---|
| DATASUS (dicionário de tipos) | Download manual, versionado no repo | Nenhuma |
| `geodata` local | PostGIS via `GEODATA_DSN` | Usuário do compose |
| Réplica na VPS | PostGIS via `geo_reader` | Senha do `.env` remoto |
| `tiles.averisen.com` | Estático, `webgis/scripts/enviar-tiles.sh` | SSH `hetzner-gramos` |

---

## Testing Strategy

| Tipo | Escopo | Arquivos | Ferramenta | Cobre |
|---|---|---|---|---|
| Invariante de dado | De-para completo | `scripts/verificar.sh` | psql | AT-010 |
| Unidade (Python) | Fachada e contrato | `query/tests/test_raio_x.py`, `agent/tests/test_contrato_raio_x.py` | pytest | AT-005, 007, 008 |
| Unidade (TS) | Filtro e tradução | `layers.test.ts`, `SeletorDeClasses.test.tsx` | vitest | AT-004 |
| Snapshot | Estilo MapLibre | `layers.test.ts.snap` | vitest | AT-001 |
| Painel | Camadas nos dois clientes | `grupos.test.ts`, `clientes.test.ts` | vitest | AT-002 |
| Tool | Resposta do agente | `agent/tests/test_tools.py` | pytest | AT-011 |
| Tile | Conteúdo publicado | inspeção do `.pmtiles` | tippecanoe/pmtiles CLI | AT-003 |
| Manual | Aceite visual | — | o Gui, na tela | AT-006, AT-007 |
| Operacional | Disco | `ship-tiles` | df antes/depois | AT-012 |

**A lição do "dublê fiel demais" vale aqui:** o teste do cartão passa a saída **real** da
fachada pelo contrato, incluindo o caso de área sem equipamento (AT-008). Mock que devolve
número bonito não prova nada.

---

## Error Handling

| Erro | Estratégia | Repetir? |
|---|---|---|
| Código de tipo sem linha no de-para | `verificar.sh` falha; a carga não publica | Não — exige decisão humana |
| Tile maior que o orçamento de disco | `ship-tiles` aborta antes de copiar, com o número medido | Não |
| Área desenhada sem nenhum equipamento | Zero real; o cadastro é nacional, então não há "sem cobertura" | — |
| View analisável vazia (carga não rodou) | Dataset aborta como o `vps-publicar-*` já faz com tabela vazia | Não |
| `classe` ausente no tile | O filtro vira no-op e a camada mostra tudo — **o teste do AT-004 pega** | Não |

---

## Configuration

| Chave | Tipo | Default | O que controla |
|---|---|---|---|
| `tile.minzoom` (saude) | int | `6` | Onde os pontos começam a existir |
| `tile.maxzoom` (ambas) | int | `14` | Precisão no zoom alto; cada nível custa disco |
| `no_mapa` (linha do de-para) | bool | — | Tira o tipo do tile. `false` para o 22 |
| `conta_no_raio_x` | bool | — | Entra na manchete do cartão |
| `inicialmenteLigada` | bool | — | Espelha `conta_no_raio_x` (Decisão 4) |
| `ESPACO_MINIMO_GB` | int | `2` | Piso de disco da VPS no `ship-tiles` |

---

## Security Considerations

- Nenhum dado pessoal: o CNES traz razão social e nome fantasia de estabelecimento; o Inep,
  nome de escola. Endereço de escola já está na tabela e **não** vai para o tile.
- O `geo_reader` continua só lendo — a tabela nova precisa do `GRANT` que ninguém lembra
  (é a armadilha registrada do `ZONEAMENTO_SP`); está no arquivo 2 do manifesto.
- O tile é público em `tiles.averisen.com`. Tudo que entrar no `attributes` é público. Por
  isso o manifesto leva `cod_cnes`, nome, tipo, classe e município — e nada mais.
- O `agent/.env` não viaja para produção (armadilha registrada do portal de login).

---

## Observability

| Aspecto | Implementação |
|---|---|
| Carga do de-para | Linhagem em `meta.fonte`, com URL e data do dicionário |
| Geração de tile | Contagem de features antes e depois do tippecanoe, no log do `make build` |
| Publicação | Disco livre da VPS medido antes e depois, no log do `ship-tiles` |
| Raio-X | `versao_calculo: "6"` no contrato marca a troca de fonte |

---

## Riscos

| # | Risco | Mitigação |
|---|---|---|
| 1 | A taxonomia não convencer e o SQL já estar escrito | Portão de aceite da Decisão 1 |
| 2 | Tipo 36 (93 mil) ser majoritariamente consultório particular | O de-para oficial responde; se for, a classe cai ou vira `no_mapa = false` |
| 3 | Disco da VPS não comportar os dois tiles | `minzoom: 6` e o piso de 2 GB; publicar `escolas` primeiro e medir |
| 4 | Snapshot regenerado sem leitura | O manifesto diz "com revisão do diff, não com `-u` cego" |
| 5 | O snapshot do CNES mudou em 19/09 05:53 (ETag novo no S3) | A carga de 18/09 já está um dia velha. Não bloqueia, mas recarregar antes do tile evita publicar dado vencido |

---

## Revision History

| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 1.0 | 2026-09-19 | Claude Opus 5 | Versão inicial. A-001 validada (dicionário existe), A-004 refinada pela medição das flags `ST_ATEND_*` |

---

## Next Step

**Ready for:** `/build .claude/sdd/features/DESIGN_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md`

O build começa pela etapa 1. O portão da Decisão 1 já foi cumprido — ver o HANDOFF.
