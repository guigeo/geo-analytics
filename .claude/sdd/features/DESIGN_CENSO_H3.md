# DESIGN: CENSO_H3

> A malha é enumerada em Python e recortada em PostGIS — o hexágono entra no banco como
> índice e números, nunca como polígono guardado

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | CENSO_H3 |
| **Data** | 2026-09-05 |
| **Autor** | design (sessão Claude Code) |
| **DEFINE** | [DEFINE_CENSO_H3.md](DEFINE_CENSO_H3.md) |
| **Status** | Ready for Build |
| **Repositório do código** | `../servidor-dados-gis` (+ emenda no `../webgis`) |

---

## Arquitetura

```text
  recorte (dado, não constante)
  cargas/censo_h3_recortes.tsv ──┐
                                 │
  ┌──────────────────────────────▼──────────────────────────────────────────┐
  │ cargas/derivado_censo_h3.sh          orquestra, valida, publica         │
  └───┬─────────────────────────────────────────────────────────────────┬───┘
      │ 1. pede o contorno                                              │
      │    SELECT ST_AsGeoJSON(geom) FROM ibge.municipio WHERE <recorte>│
      ▼                                                                 │
  ┌───────────────────────────────┐                                     │
  │ metodologia/censo-h3/         │  única coisa que sabe o que é H3    │
  │ gerar_malha.py   (uv, dep h3) │  GeoJSON ──> h3_r9 ; WKT do hexágono│
  └───────────────┬───────────────┘                                     │
                  │ 2. CSV por stdin                                    │
                  ▼                                                     │
  ┌───────────────────────────────┐                                     │
  │ staging.h3_r9                 │  polígonos, GiST — descartada no fim │
  └───────────────┬───────────────┘                                     │
                  │ 3. rateio em SQL: ST_Intersection + peso normalizado│
                  ▼                                                     ▼
  ┌──────────────────────────────────┐   ┌───────────────────────────────────┐
  │ indicadores.censo_h3_r9_celula   │   │ indicadores.censo_h3_r9           │
  │ h3_r9 · centro · area_km2        │◄──┤ h3_r9 · cod_variavel · valor      │
  │ setores_na_celula                │   │ fracao_ausente                    │
  │ fator_desagregacao               │   │ (formato longo, 40 variáveis)     │
  └──────────────────────────────────┘   └───────────────────────────────────┘
          procedência                              números
                  │                                     │
                  └──────────────┬──────────────────────┘
                                 ▼
                    4. validações que ABORTAM a carga
                       fechamento · repetição · fator ≥ 1 · órfãos
                                 ▼
                          meta.fonte + ANALYZE
```

O par de tabelas espelha o que o banco já faz com o setor: `ibge.setor_censitario` guarda
a unidade e `ibge_tabular.setor` guarda os números em formato longo. Aqui é igual, e por
isso o consumidor que já sabe ler setor sabe ler célula.

---

## Componentes

| Componente | Papel | Tecnologia |
|------------|-------|------------|
| `derivado_censo_h3.sh` | Orquestra: contorno → malha → staging → rateio → validação → linhagem | Bash + `_comum.sh` |
| `gerar_malha.py` | Enumera as células que cobrem o recorte e devolve o WKT de cada uma | Python + `h3` (via `uv run`) |
| `staging.h3_r9` | Polígonos das células enquanto o rateio acontece | PostGIS, descartada ao fim |
| `indicadores.censo_h3_r9_celula` | A célula e sua procedência | PostGIS |
| `indicadores.censo_h3_r9` | Os valores, formato longo | PostGIS |
| `censo_h3_recortes.tsv` | Que pedaço do Brasil carregar | TSV versionado |

---

## Decisões

### Decisão 1: a geometria mora no PostGIS; o Python só sabe o que é H3

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-05 |

**Contexto:** o piloto fez tudo em Python — cobertura, interseção, área, rateio — com
`shapely` e pesos em graus². Funcionou, mas coloca a matemática geométrica fora do banco
que o repositório declara ser a fonte única de verdade.

**Escolha:** o Python faz **só** a parte que exige a biblioteca H3 (quais células cobrem o
contorno, e qual o polígono de cada uma). Interseção, área e rateio são SQL no PostGIS.

**Racional:** a única coisa que o PostGIS não sabe fazer aqui é falar H3. Todo o resto ele
faz melhor: área em metros com `geography` — que é princípio escrito do repositório —,
índice espacial, transação, e validação na mesma linguagem da carga.

**Alternativas rejeitadas:**
1. Tudo em Python com `shapely` — rejeitada: duas dependências novas em vez de uma, pesos
   em graus² em vez de metros, e a validação sairia do SQL.
2. Extensão `h3-pg` no Postgres — rejeitada: muda a imagem do banco **em produção** por
   uma função usada uma vez por carga. Custo alto, benefício nenhum.

**Consequências:**
- Uma tabela intermediária de 68 mil polígonos passa a existir durante a carga (e some no fim).
- O peso passa a ser calculado em área real, não em graus — melhora que o piloto não tinha.

---

### Decisão 2: `uv run --script` — a primeira dependência de terceiro do repositório

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-05 |

**Contexto:** todo Python do `servidor-dados-gis` hoje é stdlib pura, rodado com `python3`
do host, e a convenção escrita é "evite dependências novas no host". A malha H3 não é
implementável em stdlib — a indexação é um algoritmo inteiro, não um cálculo.

**Escolha:** `gerar_malha.py` declara `h3` num cabeçalho PEP 723 e roda com
`uv run --script`. O `uv` já é a convenção do `geo-analytics`, e o ambiente é efêmero.

**Racional:** a convenção protege o host de sujeira, não proíbe biblioteca. `uv run` honra
a intenção: nada é instalado no sistema, a versão fica **no arquivo** (portanto versionada,
portanto reexecutável), e não há venv para alguém esquecer de ativar.

**Alternativas rejeitadas:**
1. `pip install h3` no host — rejeitada: é exatamente a sujeira que a convenção evita.
2. Imagem Docker própria — rejeitada: construir imagem para um script de 60 linhas.
3. Reimplementar H3 — rejeitada por motivos óbvios.

**Consequências:**
- O `AGENTS.md` do repositório passa a declarar `uv` como pré-requisito de uma carga.
- Quem rodar sem `uv` recebe erro com a instrução, não um `ImportError`.

---

### Decisão 3: formato longo, e a procedência em tabela irmã

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-05 |

**Contexto:** 40 variáveis por célula cabem numa tabela larga (68 mil linhas, 40 colunas)
ou numa longa (2,7 milhões de linhas de três colunas).

**Escolha:** longo, com uma tabela irmã só da célula, espelhando
`ibge.setor_censitario` + `ibge_tabular.setor`.

**Racional:** **a malha existe para receber variável que ainda não conhecemos.** Em tabela
larga, cada fonte nova — CNEFE, CNPJ, POI, fluxo — é um `ALTER TABLE` e uma migração; em
formato longo é um `INSERT` com outro `cod_variavel`. E `fator_desagregacao` é atributo da
célula, não da variável: repeti-lo em 40 linhas seria desnormalizar sem ganho.

**Alternativas rejeitadas:**
1. Tabela larga — rejeitada: transforma cada variável nova em mudança de schema.
2. Tudo numa tabela só — rejeitada: repetiria a procedência 40 vezes por célula.

**Consequências:**
- Consulta que quer 5 variáveis lado a lado faz `crosstab` ou pivô no cliente.
- 2,7 milhões de linhas para São Paulo; ~11 MB. Irrelevante no disco, indexado por
  `(h3_r9, cod_variavel)`.

---

### Decisão 4: o peso é normalizado por setor — é isso que faz o fechamento existir

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-05 |

**Contexto:** a soma das interseções de um setor com as células nem sempre dá exatamente a
área do setor: borda, precisão numérica e polígono inválido tiram frações.

**Escolha:** o peso de cada pedaço é `area_pedaço / SUM(area_pedaço) OVER (PARTITION BY
cod_setor)` — normalizado **dentro do setor**, não contra a área declarada dele.

**Racional:** o que sai do setor entra inteiro nas células, por construção. O fechamento
deixa de ser uma esperança sobre a qualidade da geometria e passa a ser identidade
algébrica. Medido no piloto: o desvio bruto era de 25 pessoas em 20,7 milhões, e a
normalização o zera.

**Alternativas rejeitadas:**
1. Peso contra `area_km2` da fonte — rejeitada: o erro de borda vira população perdida.
2. Corrigir depois, distribuindo o resíduo — rejeitada: conserta o total e estraga a célula.

**Consequências:**
- Setor cuja geometria não cruza célula nenhuma seria erro fatal, não perda silenciosa —
  e vira validação (AT-005).

---

### Decisão 5: a célula publicada não guarda polígono, guarda o centro

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-05 |

**Contexto:** guardar o hexágono facilitaria consulta espacial futura.

**Escolha:** a tabela publicada guarda `h3_r9`, o **centro** como `geometry(Point,4674)` e
`area_km2`. O polígono existe só em `staging`, e é descartado.

**Racional:** a fronteira é função pura do índice — guardá-la é guardar cache de função
pura, que a regra 6 do ADR-0001 manda evitar. O centro custa 32 bytes, tem índice GiST e
resolve "as células perto daqui", que é a consulta que vai aparecer primeiro.

**Alternativas rejeitadas:**
1. Guardar o polígono — rejeitada pela regra 6, e porque triplica a tabela.
2. Não guardar nada geométrico — rejeitada: toda consulta espacial passaria a exigir Python.

**Consequências:**
- Quem precisar do polígono (tiles, mapa) o deriva do índice — e isso é feature futura.

---

### Decisão 6: ausência não vira zero, e a célula declara quanto lhe faltou

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-05 |

**Contexto:** o Censo suprime valores por sigilo. Somar tratando `NULL` como zero produz
número plausível e errado — e o princípio escrito do repositório proíbe.

**Escolha:** o valor da célula soma só os setores que **têm** o número, e a linha carrega
`fracao_ausente`: a fração da área contribuinte cujo setor estava suprimido para aquela
variável. Célula em que todos os contribuintes estão suprimidos recebe `NULL`, não zero.

**Racional:** é a mesma regra 8 do ADR que já governa o aviso de rateio e a classe social
estimada — o que muda o sentido do número viaja **na linha**, não no prompt de quem lê.

**Alternativas rejeitadas:**
1. `COALESCE(valor, 0)` — rejeitada: inventa zero onde há sigilo.
2. Descartar a célula inteira — rejeitada: perde 39 variáveis por causa de uma.

**Consequências:**
- Uma coluna a mais na tabela longa, e uma decisão a menos para quem consome.

---

### Decisão 7: o recorte é dado versionado, não argumento livre

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-05 |

**Contexto:** a carga precisa rodar em São Paulo agora e no Brasil depois.

**Escolha:** `cargas/censo_h3_recortes.tsv` mapeia um nome para a cláusula SQL e a descrição
que vai para `meta.fonte`. O script aceita o **nome**; nunca SQL vindo de `argv`.

**Racional:** o mesmo princípio de `censo_nomes.tsv` — o que muda entre execuções é dado,
não código. E fecha a porta para SQL arbitrário chegar de linha de comando.

**Consequências:**
- Recorte novo é uma linha no TSV, revisável em diff.

---

## Manifesto de arquivos

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|------------|
| 1 | `../servidor-dados-gis/cargas/censo_h3_recortes.tsv` | Criar | Recortes nomeados (`sp_concentracao`, `brasil`) | — |
| 2 | `../servidor-dados-gis/metodologia/censo-h3/gerar_malha.py` | Criar | GeoJSON → `h3_r9;WKT` (PEP 723, dep `h3`) | — |
| 3 | `../servidor-dados-gis/cargas/derivado_censo_h3.sh` | Criar | A carga: orquestra, ratea, valida, publica, registra | 1, 2 |
| 4 | `../servidor-dados-gis/docs/censo-h3.md` | Criar | Método, o que o fator significa, por que média é aproximada e mediana não entra | 3 |
| 5 | `../servidor-dados-gis/scripts/verificar.sh` | Modificar | `--dados` passa a auditar a camada nova | 3 |
| 6 | `../servidor-dados-gis/README.md` | Modificar | Registrar a carga e o contrato da tabela | 3, 4 |
| 7 | `../servidor-dados-gis/AGENTS.md` | Modificar | Declarar `uv` como pré-requisito de carga | 2 |
| 8 | `../webgis/docs/adr/0001-arquitetura-e-convergencia.md` | Modificar | **Emenda**: dado re-agregado em malha estatística é estimativa | — |
| 9 | `../webgis/AGENTS.md` | Modificar | Versão curta da emenda nas regras invariantes | 8 |

**Nenhum arquivo do `geo-analytics` muda.** Esta feature não toca o app; o único artefato
dela aqui é este par de documentos.

---

## Atribuição de agentes

| Arquivos | Agente | Por quê |
|----------|--------|---------|
| 1, 3, 5 | `geo-analytics-expert` | Bash + SQL de carga, no idioma e nas convenções do repositório de dado |
| 2 | `python-developer` | Script Python com dependência declarada e type hints |
| 4, 6, 7 | `code-documenter` | Documento de método e contrato |
| 8, 9 | **nenhum** | Emenda de ADR é decisão, e decisão se escreve a mão, com o Guilherme |

Na prática o `/build` deve rodar quase inteiro com um agente só: o item 2 tem 60 linhas e
depende do mesmo contexto do item 3. Partir por agente aqui custaria mais do que rende.

---

## Padrões de código

### O núcleo do Python — só H3, nada de geometria

```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["h3==4.5.0"]
# ///
"""Enumera as celulas H3 que cobrem um contorno e devolve o WKT de cada uma.

Le GeoJSON (um Polygon ou MultiPolygon) no stdin e escreve CSV `h3;wkt` no stdout.
Este e o unico arquivo do repositorio que sabe o que e um hexagono H3: interseccao,
area e rateio sao SQL no PostGIS.
"""

import csv
import json
import sys

import h3

RESOLUCAO = 9


def celulas(geojson: dict) -> set[str]:
    poligonos = (
        [geojson["coordinates"]]
        if geojson["type"] == "Polygon"
        else geojson["coordinates"]
    )
    achadas: set[str] = set()
    for coordenadas in poligonos:
        forma = h3.geo_to_h3shape({"type": "Polygon", "coordinates": coordenadas})
        # contain="overlap": a celula entra se ENCOSTA no contorno. O padrao usa o
        # centro da celula, e com ele setor menor que a celula sumiria da malha.
        achadas.update(h3.h3shape_to_cells_experimental(forma, RESOLUCAO, contain="overlap"))
    return achadas


def wkt(celula: str) -> str:
    vertices = h3.cell_to_boundary(celula)
    pares = ", ".join(f"{lng} {lat}" for lat, lng in vertices)
    primeiro = f"{vertices[0][1]} {vertices[0][0]}"
    return f"POLYGON(({pares}, {primeiro}))"


def main() -> None:
    achadas = celulas(json.load(sys.stdin))
    escritor = csv.writer(sys.stdout, delimiter=";")
    for celula in sorted(achadas):
        escritor.writerow([celula, wkt(celula)])
    print(f"   {len(achadas)} celulas res {RESOLUCAO}", file=sys.stderr)


if __name__ == "__main__":
    main()
```

### O rateio — peso normalizado por setor

```sql
-- Um pedaco = a interseccao de um setor com uma celula. O peso e normalizado DENTRO
-- do setor: e isso que faz a soma das celulas ser identica a soma dos setores.
CREATE TEMP TABLE pedaco ON COMMIT DROP AS
WITH bruto AS (
    SELECT h.h3_r9,
           s.cod_setor,
           ST_Area(ST_Intersection(s.geom, h.geom)::geography) AS area_m2,
           ST_Area(s.geom::geography) AS area_setor_m2
      FROM ibge.setor_censitario s
      JOIN ibge.municipio m ON m.cod_municipio = s.cod_municipio
      JOIN staging.h3_r9 h ON ST_Intersects(s.geom, h.geom)
     WHERE :recorte
       AND ST_Area(ST_Intersection(s.geom, h.geom)::geography) > 0
)
SELECT h3_r9, cod_setor, area_setor_m2,
       area_m2 / SUM(area_m2) OVER (PARTITION BY cod_setor) AS peso
  FROM bruto;
```

```sql
-- Os valores. Ausencia nao vira zero: soma o que existe e declara o que faltou.
INSERT INTO indicadores.censo_h3_r9 (h3_r9, cod_variavel, valor, fracao_ausente)
SELECT p.h3_r9,
       t.cod_variavel,
       SUM(t.valor * p.peso) FILTER (WHERE t.valor IS NOT NULL),
       COALESCE(SUM(p.peso) FILTER (WHERE t.valor IS NULL), 0) / NULLIF(SUM(p.peso), 0)
  FROM pedaco p
  JOIN ibge_tabular.setor t ON t.cod_setor = p.cod_setor
  JOIN ibge_tabular.variavel v ON v.cod_variavel = t.cod_variavel
 WHERE v.agregavel                      -- as 38 que somam; as 3 razoes vem depois
 GROUP BY p.h3_r9, t.cod_variavel;
```

```sql
-- A procedencia. O fator e ponderado pela POPULACAO que cada setor entregou aqui:
-- e a populacao que sofre a presuncao de densidade, nao a area.
INSERT INTO indicadores.censo_h3_r9_celula
      (h3_r9, centro, area_km2, setores_na_celula, fator_desagregacao)
SELECT p.h3_r9,
       ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4674),
       c.area_km2,
       count(*),
       SUM(pop.valor * p.peso * GREATEST(p.area_setor_m2 / (c.area_km2 * 1e6), 1.0))
           / NULLIF(SUM(pop.valor * p.peso), 0)
  FROM pedaco p
  JOIN staging.h3_r9 c USING (h3_r9)
  LEFT JOIN ibge_tabular.setor pop
         ON pop.cod_setor = p.cod_setor AND pop.cod_variavel = 'V0001'
 GROUP BY p.h3_r9, c.lng, c.lat, c.area_km2;
```

### As médias, reconstruídas do denominador

```sql
-- media_moradores e renda_media NAO se rateiam: recalculam-se dos totais ja rateados.
-- renda_media pondera por V06001 (responsaveis) porque o IBGE nao publica a contagem
-- de responsaveis COM rendimento -- conferido no dicionario da fonte. E aproximacao,
-- e o comentario da coluna diz isso.
INSERT INTO indicadores.censo_h3_r9 (h3_r9, cod_variavel, valor, fracao_ausente)
SELECT h3_r9, 'V0005', pop.valor / NULLIF(dom.valor, 0), 0 FROM ...;
```

### A validação que aborta

```sql
-- AT-001 fechamento: identidade, nao tolerancia de gosto.
DO $$
DECLARE origem numeric; destino numeric;
BEGIN
    SELECT SUM(t.valor) INTO origem FROM ... ;
    SELECT SUM(valor)   INTO destino FROM indicadores.censo_h3_r9 WHERE cod_variavel='V0001';
    IF abs(destino - origem) / origem > 1e-6 THEN
        RAISE EXCEPTION 'fechamento quebrou: setor=% h3=%', origem, destino;
    END IF;
END $$;
```

---

## Fluxo de dados

1. `derivado_censo_h3.sh <recorte>` lê o TSV e monta a cláusula.
2. `psql -tAc "SELECT ST_AsGeoJSON(ST_Union(geom)) FROM ibge.municipio WHERE <recorte>"`.
3. GeoJSON → `uv run gerar_malha.py` → CSV `h3;WKT` → `\copy staging.h3_r9 FROM STDIN`.
4. GiST em `staging.h3_r9`, `ANALYZE`.
5. `pedaco` (temp) com o peso normalizado.
6. `indicadores.censo_h3_r9_celula` e `indicadores.censo_h3_r9` **na mesma transação**.
7. Validações. Qualquer uma que falhe derruba a transação inteira (AT-008).
8. `DROP TABLE staging.h3_r9`, `registrar_fonte`, `ANALYZE`.

---

## Pontos de integração

| Integração | Direção | Contrato |
|------------|---------|----------|
| `ibge.setor_censitario` | leitura | Geometria e `cod_municipio` |
| `ibge_tabular.setor` / `.variavel` | leitura | Valores e a coluna `agregavel` — que já existia e é o que torna esta feature possível |
| `ibge.municipio` | leitura | `cod_concentracao_urbana` define o recorte de São Paulo |
| `meta.fonte` | escrita | Linhagem, com o recorte na observação |
| `geo_reader` | permissão | `SELECT` nas duas tabelas novas |
| ADR-0001 (`webgis`) | decisão | Emenda: malha estatística é estimativa, mora em `indicadores` |

---

## Estratégia de teste

Este repositório não tem suíte automatizada, e o `AGENTS.md` manda ajustar a verificação ao
risco. Aqui o risco é aritmético, então o teste é aritmético e **roda dentro da carga**:

| Teste | ID | Como |
|-------|-----|------|
| Fechamento das 38 | AT-001 | `SUM` na origem × `SUM` no destino, erro relativo < 1e-6, por variável |
| Assinatura da repetição | AT-002 | Células vizinhas (`ST_Touches` no staging) com `pop_total` idêntico → todas têm `fator > 1` |
| Média não rateada | AT-003 | Comparar a `renda_media` gravada com a média ponderada por área; se forem iguais em toda célula multi-setor, o cálculo errado passou |
| Mediana ausente | AT-004 | `V06006` não pode existir na tabela |
| Célula íntegra | AT-005 | Nenhuma célula com valor e `setores_na_celula = 0`; nenhum setor do recorte sem célula |
| Idempotência | AT-006 | Rodar duas vezes; comparar contagem e totais |
| Contrato | AT-007 | `SELECT` como `geo_reader`; `meta.fonte` preenchido |
| Transação | AT-008 | Interromper no meio (`pg_terminate_backend`) e conferir que a tabela antiga permanece |

AT-001 a AT-005 são `DO $$ ... RAISE EXCEPTION $$` dentro da transação. AT-006 a AT-008 são
verificação manual do build, registradas no relatório.

---

## Erros e configuração

- `set -euo pipefail` e `ON_ERROR_STOP=1`, como toda carga do repositório.
- `exigir_espaco 2` — a malha é pequena, mas `ST_Intersection` em massa gera WAL.
- Sem `uv`, o script para com a instrução de instalar, não com `ImportError`.
- Recorte inexistente no TSV: lista os disponíveis e sai com 1.
- `RESOLUCAO = 9` é **constante no Python**, com o comentário da medição ao lado. Virar
  parâmetro só quando houver segunda resolução materializada — e a decisão do DEFINE é
  que não haverá, porque a hierarquia se deriva por prefixo.

---

## Segurança

- Nenhuma credencial nova; a carga usa `geo_admin` pelo `.env`, como as outras.
- `geo_reader` recebe só `SELECT`.
- O recorte nunca vem de `argv` como SQL — vem do TSV versionado (Decisão 7).

---

## Observabilidade

A carga imprime, em ordem: espaço livre, células geradas, setores lidos, pedaços, linhas
publicadas nas duas tabelas, o resultado de cada validação e o resumo do fator por faixa —
o mesmo quadro que o piloto imprimiu, agora como saída oficial da carga. `meta.fonte`
guarda fonte, versão, script, contagem e **qual recorte** foi carregado.

---

## Histórico

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-05 | design (Claude Code) | Versão inicial |

---

## Próximo passo

**Pronto para:** `/build .claude/sdd/features/DESIGN_CENSO_H3.md`

Com uma ordem que não pode inverter: **a emenda ao ADR-0001 (itens 8 e 9) sai antes ou
junto da carga**, nunca depois — é a mesma regra que o `ZONEAMENTO_SP` seguiu.
