# DESIGN: ZONEAMENTO_SP

> Zoneamento de São Paulo como camada categórica: carga por WFS, pintura por família no
> MapLibre, tool no agente, e a primeira declaração de cobertura do sistema

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | ZONEAMENTO_SP |
| **Data** | 2026-09-03 |
| **Status** | Ready for Build |
| **Origem** | [DEFINE_ZONEAMENTO_SP.md](DEFINE_ZONEAMENTO_SP.md) |
| **Repositórios** | `servidor-dados-gis`, `geo-analytics` (ADR já emendado em `webgis`) |

---

## Visão da arquitetura

```text
  GeoSampa WFS                    servidor-dados-gis              geodata (PostGIS)
  perimetro_zona_lei_18177_24  →  cargas/geosampa_zoneamento.sh → regulacao.zoneamento
  61.784 feições, EPSG:31983      ogr2ogr WFS→PG, reprojeta 4674   38 códigos + e_zona
                                  registra meta.fonte (lei+data)
                                                                          │
                          ┌───────────────────────────────────────────────┤
                          ▼                                               ▼
              geo-analytics/pipeline                          geo-analytics/query
              datasets.yaml: zoneamento_sp                     zoneamento_no_ponto()
              SQL → PMTiles (host compartilhado)                      │
                          │                                           ▼
                          ▼                                   geo-analytics/agent
              geo-analytics/web                                tools.py: nova tool
              catalogo.ts  ← paleta-zoneamento.ts              prompts.py: escopo
              esquema.ts: pinturaPorCategoria + cobertura
              layers.ts: expressão `match` do MapLibre
              LayerPanel: legenda categórica + declaração de cobertura
```

**O que atravessa repositório:** só o dado. A carga escreve no `geodata`; o pipeline lê
dele por consulta declarada no `datasets.yaml`. Nenhum dos dois importa código do outro.

---

## Componentes

| Componente | Repositório | Responsabilidade |
|------------|-------------|------------------|
| `cargas/geosampa_zoneamento.sh` | `servidor-dados-gis` | Baixa do WFS, reprojeta, publica `regulacao.zoneamento`, registra linhagem |
| `carregar_wfs()` em `_comum.sh` | `servidor-dados-gis` | Helper novo: `ogr2ogr` sobre `WFS:` — os existentes só leem arquivo |
| `datasets.yaml` | `geo-analytics/pipeline` | Entrada declarativa → PMTiles |
| `paleta-zoneamento.ts` | `geo-analytics/web` | **Dado**: 38 códigos → cor e família |
| `esquema.ts` | `geo-analytics/web` | Capacidade nova: `pinturaPorCategoria` e `cobertura` |
| `layers.ts` | `geo-analytics/web` | Traduz paleta em expressão `match` do MapLibre |
| `LayerPanel.tsx` | `geo-analytics/web` | Legenda categórica expansível + declaração de cobertura |
| `queries.py` | `geo-analytics/query` | `zoneamento_no_ponto()` |
| `tools.py` + `prompts.py` | `geo-analytics/agent` | Tool e escopo |

---

## Decisões

### Decisão 1: a paleta é DADO, não algoritmo

| Atributo | Valor |
|-----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-03 |

**Contexto:** "matiz por família, tom por sufixo" é uma *regra de geração*. Ela poderia
rodar em runtime (HSL derivado do código) ou virar uma tabela literal commitada.

**Escolha:** tabela literal — `paleta-zoneamento.ts`, 38 entradas `{ codigo, cor, familia }`.
A regra gera os valores uma vez; o que entra no repositório são os valores.

**Razão:** é o padrão da casa, já decidido duas vezes. `lib/novidades.ts` diz "é **dado**,
não JSX"; `tools.py:METRIC_LABELS` é tabela, não derivação. E aqui há motivo próprio: cor
gerada em runtime não se revisa em code review, e colisão entre dois tons vizinhos aparece
só no mapa, para o usuário. Tabela literal é conferível linha a linha e congela em snapshot.

**Alternativas rejeitadas:**
1. Gerar HSL em runtime — colisão silenciosa, ninguém revisa cor que não existe no diff
2. Paleta no banco, junto da row — mistura estilo com dado; a cor é da casca, não do dado

**Consequências:** categoria nova da Prefeitura entra sem cor até alguém acrescentar a
linha. Mitigado pela decisão 4 (a carga falha se aparecer código desconhecido).

---

### Decisão 2: `e_zona` deriva da própria estrutura do dado, e a carga PROVA isso

| Atributo | Valor |
|-----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-03 |

**Contexto:** 36% das feições têm código `Praça/Canteiro`, que não é zona. Precisamos
distinguir sem "transformar exceção em zero por conveniência" (princípio do repositório).

**Escolha:** coluna `e_zona boolean`, derivada de `tx_zoneamento_perimetro IS NOT NULL` —
zona é a linha que **tem descrição**. E a carga **falha** se mais de um código distinto vier
sem descrição.

**Razão:** cravar a string `'Praça/Canteiro'` no SQL é hardcode que envelhece calado. Derivar
da presença de descrição usa a estrutura que a própria fonte impõe e classifica sozinho um
eventual segundo não-zona. O risco — uma zona real chegar sem descrição — é exatamente a
premissa **A-002**, que foi verificada em 30.000 das 61.784. Por isso a asserção: a premissa
deixa de ser suposição e vira invariante que quebra a carga.

**Alternativas rejeitadas:**
1. `WHERE cod <> 'Praça/Canteiro'` — hardcode, e joga fora dado da fonte
2. Coluna sem asserção — a premissa continuaria não validada, e falharia no mapa

**Consequências:** a carga fica mais rígida. É o que se quer: `AGENTS.md` do
`servidor-dados-gis` manda "falhe com erro se uma invariante for violada".

---

### Decisão 3: `pinturaPorCategoria` é capacidade do esquema, não chave de cliente

| Atributo | Valor |
|-----------|-------|
| **Status** | Aceita — 2ª aplicação do critério da regra 1 (ADR, emenda de 2026-08-31) |
| **Data** | 2026-09-03 |

**Contexto:** a casca só pinta camada monocromática (`cor: Cor`).

**Escolha:** `EsquemaCamada` ganha `pinturaPorCategoria?: { campo, entradas[] }`. `cor`
continua obrigatória e passa a ser a **cor representativa** (swatch do painel, fallback).
Nenhum cliente liga ou desliga: quem tem a camada tem a pintura.

**Razão:** critério literal do ADR — não existe cliente plausível que queira *não* distinguir
ZEIS de ZEPAM. Logo é casca.

**Consequências:** `layers.ts` passa a emitir `match` em vez de cor literal quando o campo
existe. O snapshot de `layers.test.ts` muda, e é essa mudança que documenta a capacidade.

---

### Decisão 4: a carga falha diante de código desconhecido

| Atributo | Valor |
|-----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-03 |

**Contexto:** a Prefeitura muda o zoneamento a cada gestão. Código novo chegaria sem cor.

**Escolha:** a lista dos 38 códigos vive em `cargas/zoneamento_sp_codigos.tsv`, versionada,
e a carga **falha com instrução** se a fonte trouxer código fora dela.

**Razão:** é o padrão do `censo_nomes.tsv` — a curadoria mora num arquivo commitado, e a
carga só a aplica. Sem isso, a próxima revisão da lei entra silenciosamente e pinta cinza
um pedaço da cidade.

**Consequências:** revisão da lei vira trabalho consciente (uma linha no `.tsv` e uma na
paleta), em vez de degradação invisível. **A paleta e o `.tsv` ficam em repositórios
diferentes** e podem divergir — mitigado por teste no front que exige cobertura total dos
códigos, e pelo `AT-003`.

---

### Decisão 5: `carregar_wfs()` novo, em vez de baixar arquivo

| Atributo | Valor |
|-----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-03 |

**Contexto:** os helpers atuais (`carregar_shp`, `carregar_camada`) leem arquivo em `dados/`.
O GeoSampa serve WFS, que o `ogr2ogr` abre direto.

**Escolha:** helper novo `carregar_wfs <url> <typename> <tabela>`, mesma forma dos outros —
container GDAL, `-nlt MULTIPOLYGON`, `PG_USE_COPY`. Reprojeção com `-t_srs EPSG:4674`
(`-s_srs` vem do serviço, 31983).

**Razão:** mantém o primeiro invariante do repositório — carga re-executável — sem construir
pipeline de download. Se o WFS cair, o fallback é o padrão Teleco, e o script já falha com
instrução.

**Consequências:** a carga passa a depender de rede na hora de rodar. Aceitável: é o mesmo
que as nove cargas do IBGE já fazem.

---

### Decisão 6: a declaração de cobertura entra como campo da camada — e isso é o mínimo, não o alvo

| Atributo | Valor |
|-----------|-------|
| **Status** | Aceita, com dívida declarada |
| **Data** | 2026-09-03 |

**Contexto:** a emenda de 2026-09-03 à regra 8 diz que a cobertura "sai da camada, como a
descrição da zona sai da row" — ou seja, idealmente **derivada do dado**.

**Escolha:** `cobertura?: string` no `EsquemaCamada`, preenchida com valor **medido e datado**
("São Paulo (capital) · Lei 18.177/2024 · atualizado em 28/03/2025"; para o bairro,
"895 de 5.571 municípios · São Paulo não tem bairro nesta malha").

**Razão e a tensão, dita em voz alta:** isto é configuração versionada, não derivação em
runtime. Fica **um passo aquém** do que a emenda descreve. Derivar de verdade exigiria
consulta ao banco por camada no boot — trabalho que a própria emenda deixou fora, com gatilho
nomeado (terceira camada parcial ou reclamação de cliente).

O que torna aceitável: o valor é **medido**, não redigido — sai de `meta.fonte` e da contagem
real, como a versão do Teleco sai da data do arquivo. É a mesma disciplina, no lugar mais
barato.

**Consequências:** número medido hoje pode envelhecer sem aviso. Mitigado por comentário no
catálogo apontando a consulta que o produziu.

---

## Manifesto de arquivos

### `servidor-dados-gis`

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 1 | `database/init/001-base.sql` | Modificar | `CREATE SCHEMA regulacao` + `GRANT USAGE` a `geo_reader` | — |
| 2 | `cargas/_comum.sh` | Modificar | Helper `carregar_wfs()` | — |
| 3 | `cargas/zoneamento_sp_codigos.tsv` | Criar | Curadoria dos 38 códigos (padrão `censo_nomes.tsv`) | — |
| 4 | `cargas/geosampa_zoneamento.sh` | Criar | A carga | 1, 2, 3 |
| 5 | `docs/zoneamento-sp.md` | Criar | Contrato do dado, no padrão de `docs/bairro.md` | 4 |
| 6 | `README.md` | Modificar | Camada e comando de carga | 4, 5 |
| 7 | `scripts/verificar.sh` | Modificar | Auditar a camada nova no modo `--dados` | 4 |

### `geo-analytics` — pipeline

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 8 | `pipeline/datasets.yaml` | Modificar | Entrada `zoneamento_sp` → PMTiles | 4 |

### `geo-analytics` — web

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 9 | `web/src/configuracao/esquema.ts` | Modificar | `pinturaPorCategoria`, `cobertura`, grupo `regulacao` | — |
| 10 | `web/src/configuracao/paleta-zoneamento.ts` | Criar | 38 entradas `{codigo, cor, familia}` | — |
| 11 | `web/src/configuracao/paleta-zoneamento.test.ts` | Criar | Cobertura total dos códigos; contraste mínimo entre famílias | 10 |
| 12 | `web/src/configuracao/catalogo.ts` | Modificar | Camada `zoneamento_sp` + `cobertura` do `bairro` | 9, 10 |
| 13 | `web/src/configuracao/clientes/geo-analytics.ts` | Modificar | Cliente 1 enxerga a camada | 12 |
| 14 | `web/src/configuracao/clientes/eb-prime.ts` | Modificar | Cliente 2 enxerga a camada | 12 |
| 15 | `web/src/map/layers.ts` | Modificar | Emitir `match` quando há `pinturaPorCategoria` | 9 |
| 16 | `web/src/map/layers.test.ts` | Modificar | Snapshot da saída nova | 15 |
| 17 | `web/src/panels/LegendaCategorica.tsx` | Criar | Legenda agrupada por família, expansível sob a linha da camada | 10 |
| 18 | `web/src/panels/LayerPanel.tsx` | Modificar | Monta a legenda e mostra `cobertura` | 17 |
| 19 | `web/src/panels/LayerPanel.test.tsx` | Modificar | Cobertura visível; legenda só na camada categórica | 18 |

### `geo-analytics` — query e agent

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 20 | `query/src/geo_query/queries.py` | Modificar | `zoneamento_no_ponto(lon, lat)` | 4 |
| 21 | `query/tests/test_queries.py` | Modificar | Ponto em SP, ponto fora | 20 |
| 22 | `agent/src/geo_agent/tools.py` | Modificar | Args Pydantic + `TOOL_REGISTRY` | 20 |
| 23 | `agent/src/geo_agent/prompts.py` | Modificar | **Escopo**: declarar que zoneamento existe | 22 |
| 24 | `agent/tests/test_tools.py` | Modificar | Tool offline | 22 |
| 25 | `agent/benchmark.yaml` | Modificar | Um caso real | 22, 23 |

**Atenção ao item 23.** O `AGENTS.md` avisa: *"ao adicionar um tema, atualizar `prompts.py`
também, senão o agente recusa dado que já existe no banco (aconteceu com renda)"*. Sem isso,
a tool existe e o agente não a usa.

---

## Padrões de código

### Padrão 1 — helper de WFS (`_comum.sh`)

```bash
# carregar_wfs <url_base> <typename> <tabela_staging>
# Como carregar_shp, mas lendo do servico em vez de arquivo. O -t_srs converte do
# 31983 que o GeoSampa serve para o 4674 da casa; o -s_srs vem do proprio servico.
carregar_wfs() {
    local url="$1" typename="$2" tabela="$3"
    docker run --rm --network "$REDE" \
        -e PGPASSWORD="$POSTGRES_PASSWORD" "$GDAL" \
        ogr2ogr -f PostgreSQL \
            "PG:host=postgis port=5432 dbname=${POSTGRES_DB} user=${POSTGRES_USER}" \
            "WFS:${url}" "$typename" \
            -nln "$tabela" -overwrite \
            -lco GEOMETRY_NAME=geom -lco FID=fid -lco SPATIAL_INDEX=NONE \
            -nlt MULTIPOLYGON -t_srs EPSG:4674 \
            --config PG_USE_COPY YES --config OGR_WFS_PAGING_ALLOWED ON
}
```

`OGR_WFS_PAGING_ALLOWED` é obrigatório: o servidor corta em 30.000 por requisição, e as
feições são 61.784. Sem paginação a carga entra com pouco mais de metade, **sem erro**.

### Padrão 2 — as duas asserções da carga

```sql
-- 1. Nenhum codigo fora da curadoria. Revisao da lei vira trabalho consciente.
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM staging.zoneamento_raw z
   WHERE z.cd_zoneamento_perimetro NOT IN (SELECT codigo FROM staging.zoneamento_codigos);
  IF n > 0 THEN RAISE EXCEPTION
    'zoneamento: % feicoes com codigo fora de cargas/zoneamento_sp_codigos.tsv. '
    'A lei pode ter mudado: confira a fonte e atualize o TSV e a paleta do front.', n;
  END IF;
END $$;

-- 2. So UM codigo pode vir sem descricao (Praca/Canteiro). Prova a premissa A-002 e
--    sustenta a coluna e_zona, que deriva da presenca de descricao.
DO $$ DECLARE n int; BEGIN
  SELECT count(DISTINCT cd_zoneamento_perimetro) INTO n
    FROM staging.zoneamento_raw WHERE tx_zoneamento_perimetro IS NULL;
  IF n > 1 THEN RAISE EXCEPTION
    'zoneamento: % codigos distintos sem descricao (esperado 1). '
    'e_zona nao pode mais derivar da descricao — rever a decisao 2 do DESIGN.', n;
  END IF;
END $$;
```

### Padrão 3 — paleta como dado

```ts
/**
 * Cor de cada zona. É DADO, não algoritmo: a regra "matiz por família, tom por
 * sufixo" gerou estes valores uma vez, e o que se versiona são os valores.
 * Cor derivada em runtime não aparece no diff, e colisão entre dois tons vizinhos
 * só apareceria no mapa, para o usuário. Ver decisão 1 do DESIGN.
 */
export interface EntradaDePaleta {
  codigo: string;
  cor: string;
  /** Agrupa na legenda. Zonas da mesma família compartilham matiz. */
  familia: string;
}

export const PALETA_ZONEAMENTO: EntradaDePaleta[] = [
  { codigo: "ZEIS-1", cor: "#1e4e8c", familia: "Interesse social" },
  { codigo: "ZEIS-2", cor: "#2f6bb0", familia: "Interesse social" },
  // ... 38 entradas
  // Praça/Canteiro NÃO entra: não é zona (e_zona = false) e é pintada em neutro.
];
```

### Padrão 4 — `match` do MapLibre em `layers.ts`

```ts
function corDoPreenchimento(c: DefinicaoCamada): DataDrivenPropertyValueSpecification<string> {
  if (!c.pinturaPorCategoria) return c.cor;
  const { campo, entradas } = c.pinturaPorCategoria;
  // `match` com fallback: o que não está na paleta cai no neutro — é o caso do
  // Praça/Canteiro, e a rede contra código novo que escape da asserção da carga.
  return [
    "match",
    ["get", campo],
    ...entradas.flatMap((e) => [e.codigo, e.cor]),
    NEUTRO_SEM_ZONA,
  ];
}
```

### Padrão 5 — query e tool

```python
def zoneamento_no_ponto(self, lon: float, lat: float) -> dict[str, Any] | None:
    """Qual zona de uso do solo CONTEM este ponto. Devolve None fora da cobertura --
    hoje so o municipio de Sao Paulo. Quem chama precisa DIZER que nao ha dado, e
    nao responder vazio: e a regra 8 do ADR-0001 (AT-008)."""
    rows = self._rows(
        sql.SQL("""
            select cod_zona, nome_zona, e_zona, lei, cod_municipio
            from regulacao.zoneamento
            where ST_Contains(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4674))
            limit 1
        """),
        [float(lon), float(lat)],
    )
    return rows[0] if rows else None
```

---

## Fluxo de dados

```text
1. CARGA (manual, sob demanda — o zoneamento muda por gestão, não por safra)
   WFS (paginado, 61.784) → staging.zoneamento_raw → [2 asserções] →
   regulacao.zoneamento (4674, e_zona derivada) → meta.fonte (lei e data do dado)

2. TILE (após a carga)
   datasets.yaml → SQL no geodata → GeoParquet → tippecanoe → zoneamento_sp.pmtiles
   → host de tiles compartilhado

3. MAPA (runtime)
   catalogo.ts + paleta → layers.ts → expressão `match` → MapLibre
   clique → Atributos.tsx (sigla, descrição, lei — tudo da feição)

4. CHAT (runtime)
   pergunta → tools.py:zoneamento_no_ponto → query → row → destaque + texto
   fora da cobertura → row vazia → a tool DIZ que não há dado
```

---

## Pontos de integração

| Integração | Tipo | Falha se | Mitigação |
|------------|------|----------|-----------|
| GeoSampa WFS | HTTP, na carga | Serviço fora, ou `typename` mudou | Carga falha com instrução; fallback é o padrão Teleco |
| `geodata` | PostGIS | Schema `regulacao` inexistente | `001-base.sql` cria; `verificar.sh --banco` confere |
| Host de tiles | Arquivo | `TILES_DIR` ausente | `docker compose` já para com mensagem |
| Paleta ↔ curadoria | Dois repositórios | Divergem | Teste 11 exige cobertura total; asserção 1 da carga é a outra ponta |

---

## Estratégia de teste

| Tipo | Escopo | Ferramenta | Cobre |
|------|--------|-----------|-------|
| Asserção de carga | Códigos e descrição | SQL na própria carga | AT-001, AT-003, A-002 |
| Auditoria | Contagem, geometria, órfãos | `verificar.sh --dados` | AT-001, AT-002 |
| Unitário (front) | Paleta completa e contrastante | vitest | AT-004 |
| Snapshot | Saída do `layers.ts` | vitest | AT-004, AT-005 |
| Componente | Cobertura visível; legenda só na categórica | vitest + testing-library | AT-009, AT-010 |
| Unitário (query) | Ponto dentro e fora de SP | pytest | AT-007, AT-008 |
| Unitário (agent) | Tool offline, com cliente falso | pytest | AT-007, AT-008 |
| Benchmark | Um caso real | pytest -m benchmark | AT-007 |
| Cruzado de cliente | Nenhum `.tsx` cita cliente | teste existente | AT-011 |

**O que NÃO se testa automaticamente:** a distinguibilidade das cores nos dois temas
(premissa A-003). É inspeção visual no `make dev-lado-a-lado`, e fica registrada no
BUILD_REPORT.

---

## Tratamento de erro

| Situação | Comportamento | Por quê |
|----------|---------------|---------|
| WFS fora do ar | Carga aborta, sem tocar a tabela publicada | Transação; recarga troca conteúdo, não tabela |
| Paginação desligada | **Não é erro visível** — entra 30.000 de 61.784 | Por isso `OGR_WFS_PAGING_ALLOWED` é obrigatório, e a asserção de contagem existe |
| Código fora da curadoria | Carga falha com instrução | Decisão 4 |
| >1 código sem descrição | Carga falha citando a decisão 2 | A premissa vira invariante |
| Código sem cor no front | Cai no neutro do `match` | Degrada visível, não quebra |
| Ponto fora da cobertura | Tool devolve "não há dado para esta região" | AT-008; regra 8 do ADR |

---

## Configuração

| Chave | Onde | Valor |
|-------|------|-------|
| `typename` do WFS | `cargas/geosampa_zoneamento.sh` | `geoportal:perimetro_zona_lei_18177_24` |
| Curadoria de códigos | `cargas/zoneamento_sp_codigos.tsv` | 38 linhas |
| Paleta | `web/src/configuracao/paleta-zoneamento.ts` | 38 entradas |
| Grupo do painel | `esquema.ts:GRUPOS_DE_CAMADA` | `regulacao: { rotulo: "Regulação urbana" }` |
| Zoom do tile | `datasets.yaml` | `minzoom: 9, maxzoom: 14` — camada municipal |

---

## Segurança

- `geo_reader` recebe **só `SELECT`** em `regulacao`, como nos demais schemas
- Dado 100% público; nenhuma informação de cliente envolvida
- A tool nova não recebe texto livre em SQL: coordenadas viram `float` antes do bind
- **Não** altera o achado em aberto do `CONNECT`/`TEMPORARY` a `PUBLIC` no `geodata` — segue sendo trabalho próprio

---

## Observabilidade

- `meta.fonte` guarda lei, data e contagem — a única fonte de verdade sobre a vigência
- `verificar.sh --dados` audita a camada junto das outras
- `/api/health` não muda

---

## Histórico de revisão

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-03 | design | Versão inicial |

---

## Próximo passo

**Pronto para:** `/build .claude/sdd/features/DESIGN_ZONEAMENTO_SP.md`

**Ordem obrigatória:** itens 1–7 (`servidor-dados-gis`) antes de 8 (tile), e 8 antes de
9–19 (front). A carga é pré-requisito real: sem tabela não há tile, e sem tile o front não
tem o que pintar.
