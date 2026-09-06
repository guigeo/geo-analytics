# DESIGN: CNEFE_H3

> Desenho técnico: o CNEFE 2022 bruto no home lab, 16 variáveis por célula H3, e o
> primeiro caminho de dado na direção lab → Mac

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | CNEFE_H3 |
| **Data** | 2026-09-06 |
| **Autor** | design (sessão Claude Code) |
| **DEFINE** | [`DEFINE_CNEFE_H3.md`](DEFINE_CNEFE_H3.md) |
| **Status** | ✅ Construído. **Três decisões mudaram na medição** — ver os achados 4, 5 e 7 do [BUILD_REPORT](../reports/BUILD_REPORT_CNEFE_H3.md) |
| **Repositório** | `../servidor-dados-gis` — **nenhum arquivo em `geo-analytics/`** |
| **Pré-requisito no lab** | `./cargas/ibge_municipio.sh` (ver Decisão 6) |

---

## Arquitetura

```text
  FTP do IBGE                    HOME LAB  (server-homelab / homelab-ts, 865 GB)
  ───────────                    ─────────────────────────────────────────────────
  35_SP/<cod>_<NOME>.zip
    263 MB, 37 arquivos
         │
         │  baixar_e_extrair()  (cache em dados/, do _comum.sh)
         ▼
   dados/<base>/<cod>.csv  ── latin-1, ";", 34 colunas
         │
         │  metodologia/cnefe/preparar_csv.py   ← o ÚNICO que sabe o que é H3
         │    · valida o cabeçalho contra as 34 colunas esperadas
         │    · latin-1 → UTF-8
         │    · cod_setor: tira o sufixo não-numérico  (16 → 15)
         │    · h3_r9 = h3.latlng_to_cell(lat, lon, 9)
         ▼
   \copy →  ibge.cnefe_endereco        ~10,2 M linhas, 34 colunas + cod_setor + h3_r9 + geom
         │   (DELETE + COPY por município, numa transação cada)
         │
         │  cargas/derivado_cnefe_h3.sh   —  GROUP BY h3_r9, sem geometria, sem JOIN
         ▼
   indicadores.cnefe_h3_r9_celula      68 mil células: total + as 6 contagens de NV_GEO_COORD
   indicadores.cnefe_h3_r9             16 variáveis × célula, formato longo
   indicadores.cnefe_variavel          catálogo, vindo do TSV commitado
   indicadores.cnefe_setor_conferencia ~47 mil setores: a validação que VIAJA
         │
         │
         │   scripts/lab-trazer-cnefe-h3.sh   ← roda NO MAC e PUXA (ssh + COPY streaming)
         ▼
  MAC  ───────────────────────────────────────────────────────────────────────────
   indicadores.cnefe_h3_r9_celula  ┐
   indicadores.cnefe_h3_r9         ├── e SÓ ENTÃO a validação cruzada, que recusa:
   indicadores.cnefe_variavel      │     · célula órfã fora de censo_h3_r9_celula
   indicadores.cnefe_setor_conferencia ┘  · setor que não fecha com setor_basico
                                          · município que não fecha com municipio_basico
         │
         └──→ junta com indicadores.censo_h3_r9 por h3_r9 (string), sem geometria
```

**O que não aparece no diagrama, de propósito:** a VPS. Esta feature não a toca.

---

## Componentes

| Componente | Papel | Tecnologia |
|------------|-------|------------|
| `metodologia/cnefe/preparar_csv.py` | Traduz o CSV da fonte: encoding, chave do setor, índice H3. **Único arquivo que conhece H3** | Python 3.12 + `h3==4.5.0`, PEP 723 via `uv run --script` |
| `cargas/ibge_cnefe.sh` | Carga bruta, município a município, com pico de disco controlado | Bash + `_comum.sh` + `psql` |
| `cargas/derivado_cnefe_h3.sh` | As 16 variáveis por célula + a conferência que viaja | Bash + SQL numa transação |
| `cargas/cnefe_variaveis.tsv` | Catálogo das 16 variáveis: código da fonte → nome legível | TSV commitado |
| `scripts/lab-trazer-cnefe-h3.sh` | Traz o derivado do lab e **recusa** se não fechar | Bash + `ssh` + `COPY` streaming |
| `docs/cnefe.md` | Particularidades da fonte — o que morde e por quê | Markdown |

---

## Decisões

### Decisão 1: o índice H3 é calculado na leitura do CSV, não no banco

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** são ~10,2 M linhas que precisam de um índice H3 res 9 cada. O PostGIS do lab
não tem a extensão `h3-pg`, e a malha existente foi construída por um script Python
(`metodologia/censo-h3/gerar_malha.py`) sob o princípio de que **um arquivo só sabe o que é
H3**.

**Escolha:** o `preparar_csv.py` calcula `h3_r9` linha a linha e o emite como coluna extra
no CSV que entra por `\copy`. Uma passada, sem ida e volta ao banco.

**Racional:** o mesmo passe já é obrigatório por outros três motivos — o arquivo é latin-1
e o banco é UTF-8, o `COD_SETOR` precisa perder o 16º caractere, e o cabeçalho precisa ser
conferido. Calcular o H3 ali custa uma chamada de função por linha e zero I/O adicional.
Instalar `h3-pg` no PostGIS resolveria o mesmo problema criando uma dependência de imagem
que a casa não tem e que a VPS teria de ganhar junto.

**Alternativas rejeitadas:**
1. **Extensão `h3-pg` no Postgres** — muda a imagem do banco em três máquinas para uma
   função usada uma vez por carga.
2. **`UPDATE` em lote depois do `COPY`** — reescreve 10,2 M linhas e dobra o WAL, para
   calcular o que já podia ter vindo pronto.

**Consequências:**
- A carga passa a exigir `uv` no lab, como a `derivado_censo_h3.sh` já exige. A exceção já
  está declarada no `AGENTS.md` do `servidor-dados-gis` — passa a valer para dois arquivos.
- Se o índice estiver errado, ele está errado em toda linha da mesma forma. É defeito
  visível (as células não casam com a malha), não deriva silenciosa.

---

### Decisão 2: tabela irmã, e a honestidade da célula é contagem, não fração

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** `indicadores.censo_h3_r9` tem `cod_variavel` com FK para
`ibge_tabular.variavel` — as 41 variáveis curadas do Censo — e `fracao_ausente NOT NULL`,
que mede rateio areal. Espécie de endereço não é variável do Censo, e não há rateio nenhum
aqui para `fracao_ausente` medir.

**Escolha:** `indicadores.cnefe_h3_r9` + `indicadores.cnefe_h3_r9_celula`, irmãs das do
Censo, apontando para a mesma malha **por igualdade de `h3_r9`** e não por chave
estrangeira. A honestidade da célula são as **seis contagens de `NV_GEO_COORD`**, com
`CHECK` de que somam o total.

**Racional:** a regra 9 do ADR manda a linha carregar "a medida da própria incerteza". Para
rateio essa medida é o fator de desagregação; para dado que entra por ponto é a qualidade
da coordenada na origem, que a fonte já declara. Guardar **contagem** em vez de fração
segue o princípio da casa de preservar a fonte: qualquer fração se deriva das seis, e o
contrário não.

**Alternativas rejeitadas:**
1. **Reusar `censo_h3_r9`, cadastrando as 16 no `ibge_tabular.variavel`** — afirmaria que o
   IBGE publicou "edificação em obra" como variável do Censo agregado, que ele não fez.
2. **Reusar `fracao_ausente` com valor zero** — a coluna passaria a significar duas coisas
   na mesma tabela, e zero deixaria de distinguir "não houve rateio" de "houve e fechou".
3. **FK de `cnefe_h3_r9_celula` para `censo_h3_r9_celula`** — impossível no lab, que não tem
   a malha; e criaria DDL diferente nos dois lados, que o `pg_dump --schema-only` do
   publicador carregaria junto. A integridade vira **recusa explícita na publicação**
   (AT-P1), que é onde o dado encontra a malha pela primeira vez.

**Consequências:**
- As duas tabelas se cruzam por `JOIN ... USING (h3_r9)`, sem geometria e sem PostGIS.
- Nada impede, hoje, uma célula do CNEFE inexistente na malha entrar na tabela do lab. O
  que impede é o publicador — e é por isso que ele recusa em vez de avisar.

---

### Decisão 3: a validação se parte em duas, pelo que cada máquina sabe

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** o critério central da feature — igualdade exata contra o Censo, setor a setor
— exige `ibge_tabular.setor_basico`, que só existe no Mac. O lab não tem o Censo.

**Escolha:**

- **No lab, validação interna:** tudo que se verifica sem sair da própria carga — os blocos
  de variáveis fechando com a contagem bruta, as seis contagens de nível somando o total,
  zero linha sem coordenada, zero célula vazia.
- **No Mac, validação cruzada:** a carga produz `indicadores.cnefe_setor_conferencia`
  (~47 mil linhas), essa tabela **viaja junto com o derivado**, e o
  `lab-trazer-cnefe-h3.sh` a confronta com `setor_basico` e `municipio_basico`. Divergiu,
  **recusa** e nomeia os setores.

**Racional:** cada lado valida o que consegue saber sozinho. A alternativa de espelhar o
Censo para o lab resolveria o mesmo problema carregando 1,9 GB de `ibge_tabular.setor` e
1,4 GB de setores para conferir 47 mil números — e criaria uma segunda cópia do Censo que
precisa ser mantida em dia, que é fork silencioso pela regra 6.

**Alternativas rejeitadas:**
1. **Espelhar `ibge_tabular` para o lab** — 3,3 GB e uma segunda cópia do Censo para
   manter. Fica registrado como caminho se o lab virar ambiente de reconstrução completo.
2. **Uma lista fixa de valores esperados commitada no repositório** — é exatamente o que o
   `LAB.md` proíbe: "lista fixa apodreceria calada, servindo arquivo velho como se fosse o
   atual". Os números têm de sair do Censo vivo.

**Consequências:**
- A carga do lab pode terminar "com sucesso" e o dado ser recusado depois. É aceitável e é
  o desenho: a recusa acontece antes de o dado ficar consumível no Mac, que é o que importa.
- `cnefe_setor_conferencia` fica guardada nos dois lados. Ela é a evidência da conferência,
  não um rascunho — 47 mil linhas custam nada e respondem "isto fechou quando?".

---

### Decisão 4: o script roda no Mac e PUXA — por isso "trazer", não "publicar"

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** os dois scripts irmãos da casa empurram: `vps-publicar-*.sh` roda no Mac e
manda para a VPS; `espelhar-censo.sh` roda no Mac e manda para o lab. Este é o primeiro que
vai na direção contrária.

**Escolha:** `scripts/lab-trazer-cnefe-h3.sh`, executado **no Mac**, abrindo `ssh` para o
lab e trazendo por `COPY ... TO STDOUT` encanado em `COPY ... FROM STDIN` local.

**Racional:** a validação cruzada precisa do Censo, que está no Mac — então o lado que
decide aceitar ou recusar tem de ser o Mac. Um script que empurrasse do lab teria de
perguntar ao Mac se pode, o que é a mesma conversa com mais peças. E o nome importa: chamar
de `lab-publicar-*` colocaria no leitor a direção errada, num repositório onde todos os
outros `publicar` empurram.

**Alternativas rejeitadas:**
1. **`pg_dump` no lab + `scp` + `psql` no Mac** — cria arquivo intermediário de vários MB
   sem ganho; o irmão `vps-publicar-zoneamento.sh` já provou que streaming basta.
2. **`postgres_fdw` entre os dois bancos** — a regra 4 do ADR já rejeitou FDW entre bancos
   para o cruzamento do acervo. O mesmo argumento vale aqui.

**Consequências:**
- O Tailscale (ou a LAN) precisa estar de pé no momento de trazer, não no da carga.
- Como o `vps-publicar-*`, as listas de colunas do `COPY` são **explícitas nos dois lados**,
  para que uma divergência de ordem física não passe alinhada errado.

---

### Decisão 5: carga por município, com `DELETE` + `COPY` por transação

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** o `ibge_setor.sh` carrega UF por UF e faz `TRUNCATE` no começo. Aqui são 37
arquivos, e São Paulo capital sozinha é 67% do peso.

**Escolha:** um município por vez, cada um numa transação que apaga o próprio município e
insere de novo. Sem `TRUNCATE` global.

**Racional:** torna a carga **retomável** — interromper no 30º não custa os 29 anteriores —
e torna "recarregar um município só" uma operação válida, que é o que se vai querer quando
o IBGE republicar um arquivo. O `TRUNCATE` global do `ibge_setor.sh` existe porque lá a
chave estrangeira de uma view materializada obrigava; aqui não há esse laço.

**Consequências:**
- Recarregar um recorte menor **não apaga** o que já estava de outro recorte. Isso é
  desejável, e a linhagem em `meta.fonte` registra a cobertura acumulada, não a da última
  execução — o script tem de escrever a cobertura medida da tabela, não o argumento recebido.

---

### Decisão 6: o recorte continua sendo o `censo_h3_recortes.tsv`, e o lab ganha `ibge.municipio`

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-09-06 |

**Contexto:** o recorte do H3 é uma **cláusula SQL** (`m.cod_concentracao_urbana =
'3550308'`) avaliada contra `ibge.municipio` — tabela que o lab não tem, porque o `geodata`
de lá está vazio.

**Escolha:** rodar `./cargas/ibge_municipio.sh` no lab como pré-requisito, e a carga do
CNEFE resolver o recorte pelo **mesmo arquivo** `cargas/censo_h3_recortes.tsv`.

**Racional:** é o que garante, **por construção e não por disciplina**, que o CNEFE e a
malha H3 cobrem o mesmo universo. Se a lista de municípios fosse um parâmetro à parte, as
duas definições divergiriam no dia em que uma fosse corrigida — e a divergência apareceria
como célula órfã, tarde. `ibge.municipio` custa 321 MB e é a primeira carga do README.

**Alternativas rejeitadas:**
1. **`--municipios 3550308,3548807,…` na linha de comando** — segunda definição do mesmo
   recorte, que diverge.
2. **Resolver a lista no Mac e mandar para o lab** — acopla a carga do lab à disponibilidade
   do Mac, e o lab existe para não depender dele.

---

## Esquema

```sql
-- ── Bruto, no geodata do LAB ────────────────────────────────────────────────
CREATE TABLE ibge.cnefe_endereco (
    cod_unico_endereco   bigint PRIMARY KEY,
    cod_uf               char(2)  NOT NULL,
    cod_municipio        char(7)  NOT NULL,
    cod_distrito         char(9),
    cod_subdistrito      char(11),
    cod_setor_fonte      char(16) NOT NULL,   -- como a fonte publica, com o sufixo
    cod_setor            char(15) NOT NULL,   -- normalizado: é por aqui que se junta
    num_quadra           integer,
    num_face             integer,
    cep                  char(8),
    dsc_localidade       text,
    nom_tipo_seglogr     text,
    nom_titulo_seglogr   text,
    nom_seglogr          text,
    num_endereco         text,                -- "S/N" e "12A" existem; não é inteiro
    dsc_modificador      text,
    nom_comp_elem1 text, val_comp_elem1 text,
    nom_comp_elem2 text, val_comp_elem2 text,
    nom_comp_elem3 text, val_comp_elem3 text,
    nom_comp_elem4 text, val_comp_elem4 text,
    nom_comp_elem5 text, val_comp_elem5 text,
    latitude             double precision NOT NULL,
    longitude            double precision NOT NULL,
    nv_geo_coord         smallint NOT NULL CHECK (nv_geo_coord BETWEEN 1 AND 6),
    cod_especie          smallint NOT NULL CHECK (cod_especie BETWEEN 1 AND 8),
    dsc_estabelecimento  text,
    cod_indicador_estab_endereco        smallint,
    cod_indicador_const_endereco        smallint,
    cod_indicador_finalidade_const      smallint,
    cod_tipo_especie                    smallint,
    h3_r9                text NOT NULL,       -- calculado de lat/lon na leitura
    geom                 geometry(Point, 4674) NOT NULL
);
CREATE INDEX cnefe_municipio_idx ON ibge.cnefe_endereco (cod_municipio);
CREATE INDEX cnefe_setor_idx     ON ibge.cnefe_endereco (cod_setor);
CREATE INDEX cnefe_h3_idx        ON ibge.cnefe_endereco (h3_r9);
CREATE INDEX cnefe_geom_idx      ON ibge.cnefe_endereco USING gist (geom);

-- ── Catálogo das 16, do TSV commitado ───────────────────────────────────────
CREATE TABLE indicadores.cnefe_variavel (
    cod_variavel text PRIMARY KEY,
    bloco        text NOT NULL CHECK (bloco IN ('especie','tipo_edificacao','finalidade_obra')),
    coluna_fonte text NOT NULL,   -- COD_ESPECIE | COD_TIPO_ESPECIE | COD_INDICADOR_FINALIDADE_CONST
    valor_fonte  smallint NOT NULL,
    nome         text NOT NULL,
    UNIQUE (coluna_fonte, valor_fonte)
);

-- ── Derivado ────────────────────────────────────────────────────────────────
CREATE TABLE indicadores.cnefe_h3_r9_celula (
    h3_r9             text PRIMARY KEY,
    enderecos_total   integer NOT NULL CHECK (enderecos_total > 0),
    coord_original    integer NOT NULL,   -- NV_GEO_COORD = 1
    coord_modificada  integer NOT NULL,   -- 2, apartamento no mesmo número
    coord_estimada    integer NOT NULL,   -- 3
    coord_face_quadra integer NOT NULL,   -- 4
    coord_localidade  integer NOT NULL,   -- 5
    coord_setor       integer NOT NULL,   -- 6
    CHECK (coord_original + coord_modificada + coord_estimada
         + coord_face_quadra + coord_localidade + coord_setor = enderecos_total)
);
CREATE TABLE indicadores.cnefe_h3_r9 (
    h3_r9        text NOT NULL REFERENCES indicadores.cnefe_h3_r9_celula (h3_r9) ON DELETE CASCADE,
    cod_variavel text NOT NULL REFERENCES indicadores.cnefe_variavel (cod_variavel),
    valor        integer NOT NULL CHECK (valor >= 0),
    PRIMARY KEY (h3_r9, cod_variavel)
);
CREATE INDEX cnefe_h3_r9_variavel_idx ON indicadores.cnefe_h3_r9 (cod_variavel, h3_r9);

-- ── A conferência que viaja ─────────────────────────────────────────────────
CREATE TABLE indicadores.cnefe_setor_conferencia (
    cod_setor               char(15) PRIMARY KEY,
    domicilios_particulares integer NOT NULL CHECK (domicilios_particulares >= 0)
);
```

**`CHECK` de soma na célula, não `trigger` nem asserção de script.** As seis contagens
somarem o total é invariante da tabela, e invariante que o banco garante não depende de
ninguém lembrar de rodar a verificação.

**Não há `valor` nulo em `cnefe_h3_r9`.** Ausência de uma espécie numa célula é **zero
medido**, não desconhecido — a diferença importa, e é o oposto do Censo, onde nulo quer
dizer suprimido.

---

## As 16 variáveis (`cargas/cnefe_variaveis.tsv`)

| bloco | coluna da fonte | valor | `cod_variavel` | nome |
|---|---|---|---|---|
| especie | `COD_ESPECIE` | 1 | `end_dom_particular` | domicílios particulares |
| especie | `COD_ESPECIE` | 2 | `end_dom_coletivo` | domicílios coletivos |
| especie | `COD_ESPECIE` | 3 | `end_agropecuario` | estabelecimentos agropecuários |
| especie | `COD_ESPECIE` | 4 | `end_ensino` | estabelecimentos de ensino |
| especie | `COD_ESPECIE` | 5 | `end_saude` | estabelecimentos de saúde |
| especie | `COD_ESPECIE` | 6 | `end_outras_finalidades` | estabelecimentos de outras finalidades |
| especie | `COD_ESPECIE` | 7 | `end_em_obra` | edificações em construção ou reforma |
| especie | `COD_ESPECIE` | 8 | `end_religioso` | estabelecimentos religiosos |
| tipo_edificacao | `COD_TIPO_ESPECIE` | 101 | `dom_casa` | domicílios em casa |
| tipo_edificacao | `COD_TIPO_ESPECIE` | 102 | `dom_casa_vila` | domicílios em casa de vila ou condomínio |
| tipo_edificacao | `COD_TIPO_ESPECIE` | 103 | `dom_apartamento` | domicílios em apartamento |
| tipo_edificacao | `COD_TIPO_ESPECIE` | 104 | `dom_outros` | domicílios em outro tipo de edificação |
| finalidade_obra | `COD_INDICADOR_FINALIDADE_CONST` | 1 | `obra_residencial` | obras residenciais |
| finalidade_obra | `COD_INDICADOR_FINALIDADE_CONST` | 2 | `obra_nao_residencial` | obras não residenciais |
| finalidade_obra | `COD_INDICADOR_FINALIDADE_CONST` | 3 | `obra_mista` | obras de uso misto |
| finalidade_obra | `COD_INDICADOR_FINALIDADE_CONST` | 4 | `obra_indeterminada` | obras de finalidade indeterminada |

**Medido em São Caetano, e é o que amarra os blocos:** `COD_TIPO_ESPECIE` está preenchido
em **exatamente** as espécies 1 e 2 (70.688 + 55 = 70.743 = soma dos quatro tipos), e vazio
nas espécies 4 a 8. `COD_INDICADOR_FINALIDADE_CONST` só faz sentido na espécie 7. Cada bloco
tem, por isso, um total previsível — e é disso que as validações internas AT-D1 a AT-D3 vivem.

---

## Manifesto de arquivos

Todos em `../servidor-dados-gis`.

| # | Arquivo | Ação | Propósito | Agente | Depende de |
|---|---------|------|-----------|--------|------------|
| 1 | `cargas/cnefe_variaveis.tsv` | Criar | As 16 variáveis: bloco, coluna e valor da fonte, nome | @ai-data-engineer | — |
| 2 | `metodologia/cnefe/preparar_csv.py` | Criar | Cabeçalho, latin-1→UTF-8, `cod_setor` 16→15, `h3_r9` | @python-developer | — |
| 3 | `cargas/ibge_cnefe.sh` | Criar | Carga bruta, município a município, com validações internas | @ai-data-engineer | 2 |
| 4 | `cargas/derivado_cnefe_h3.sh` | Criar | 16 variáveis por célula + `cnefe_setor_conferencia` | @ai-data-engineer | 1, 3 |
| 5 | `scripts/lab-trazer-cnefe-h3.sh` | Criar | Traz o derivado do lab e **recusa** se não fechar | @ai-data-engineer | 4 |
| 6 | `docs/cnefe.md` | Criar | Particularidades da fonte e o que morde | @code-documenter | 2, 3, 4 |
| 7 | `README.md` | Editar | Carga nova, cobertura, contagens, ordem de execução | @code-documenter | 3, 4, 5 |
| 8 | `AGENTS.md` | Editar | A exceção do `uv` passa a valer para dois arquivos; o lab ganha pré-requisito | @code-documenter | 2 |

**Total: 8 arquivos** — 6 novos, 2 editados. **Zero em `geo-analytics/`.**

---

## Padrões de código

### Padrão 1: o preparador de CSV (o único que sabe o que é H3)

```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["h3==4.5.0"]
# ///
"""Traduz um CSV do CNEFE 2022 para o formato que o COPY do Postgres espera.

Le latin-1 no stdin e escreve UTF-8 no stdout. Faz quatro coisas, e todas as
quatro sao armadilhas medidas em 2026-09-06 (ver docs/cnefe.md):

  1. Confere o cabecalho. A carga inteira assume 34 colunas nesta ordem; um
     municipio com cabecalho diferente tem de parar aqui, nomeado, e nao virar
     coluna deslocada 3 GB adiante.
  2. latin-1 -> UTF-8. Ler como UTF-8 falha ou corrompe calado.
  3. cod_setor: a fonte publica 16 caracteres e a malha tem 15. Removemos o
     sufixo NAO-NUMERICO, e nao "o P" -- assumir a letra e apostar que ela e a
     mesma nos 5.571 municipios do pais.
  4. h3_r9 = latlng_to_cell(lat, lon, 9). Funcao pura da coordenada: nao precisa
     da malha, do setor nem de PostGIS.
"""
import csv, sys, h3

RESOLUCAO = 9
COLUNAS_FONTE = [
    "COD_UNICO_ENDERECO", "COD_UF", "COD_MUNICIPIO", "COD_DISTRITO",
    "COD_SUBDISTRITO", "COD_SETOR", "NUM_QUADRA", "NUM_FACE", "CEP",
    # … as 34, na ordem exata em que a fonte publica
]

def cod_setor_15(bruto: str) -> str:
    """'354880705000121P' -> '354880705000121'."""
    digitos = "".join(c for c in bruto if c.isdigit())
    if len(digitos) != 15:
        raise ValueError(f"cod_setor com {len(digitos)} digitos: {bruto!r}")
    return digitos
```

### Padrão 2: validação que aborta dentro da transação

Idêntico ao que a `derivado_censo_h3.sh` já usa — o `DO $at$` levanta exceção e a
`--single-transaction` desfaz a carga inteira. O `CNEFE_FORCAR_FALHA` existe para **provar
que o rollback funciona**, como o `CENSO_H3_FORCAR_FALHA` provou.

```sql
-- AT-D1: as 8 especies tem de somar o total de linhas do recorte.
DO $atd1$
DECLARE origem bigint; destino bigint;
BEGIN
    IF current_setting('cnefe.forcar_falha', true) = 'AT-D1' THEN
        RAISE EXCEPTION 'AT-D1 forçado para provar rollback';
    END IF;
    SELECT count(*) INTO origem FROM ibge.cnefe_endereco e
      JOIN municipio_recorte m USING (cod_municipio);
    SELECT COALESCE(SUM(h.valor), 0) INTO destino
      FROM indicadores.cnefe_h3_r9 h
      JOIN indicadores.cnefe_variavel v USING (cod_variavel)
     WHERE v.bloco = 'especie';
    IF origem <> destino THEN
        RAISE EXCEPTION 'AT-D1: especies somam % e a tabela bruta tem % linhas', destino, origem;
    END IF;
    RAISE NOTICE 'AT-D1 soma das especies: OK (% linhas)', origem;
END
$atd1$;
```

### Padrão 3: a recusa do publicador

```bash
# A conferencia CRUZADA so pode acontecer aqui: o lab nao tem o Censo.
# Ela roda DEPOIS do COPY e ANTES de o dado virar consumivel -- as tabelas
# chegam numa transacao que so committa se as tres conferencias passarem.
divergentes="$(psql_local -tAc "
    SELECT count(*) FROM indicadores.cnefe_setor_conferencia c
    JOIN ibge_tabular.setor_basico s USING (cod_setor)
    WHERE c.domicilios_particulares <> s.domicilios_particulares")"
[ "${divergentes:-1}" -eq 0 ] || {
    echo "✗ ${divergentes} setores nao fecham com o Censo — RECUSANDO." >&2
    psql_local -c "SELECT c.cod_setor, c.domicilios_particulares AS cnefe,
                          s.domicilios_particulares::bigint AS censo
                     FROM indicadores.cnefe_setor_conferencia c
                     JOIN ibge_tabular.setor_basico s USING (cod_setor)
                    WHERE c.domicilios_particulares <> s.domicilios_particulares
                    LIMIT 20" >&2
    exit 1; }
```

---

## Estratégia de teste

Não há suíte automatizada no `servidor-dados-gis` — a verificação é proporcional ao risco,
como o `AGENTS.md` de lá manda. Aqui ela é de três tipos:

| Tipo | Escopo | Como |
|------|--------|------|
| **Estático** | Os três scripts Bash | `bash -n` e `shellcheck`; `./scripts/verificar.sh --estatico` |
| **Unitário** | `preparar_csv.py` | Rodar sobre o CSV de São Caetano já baixado e conferir contra os números medidos: 82.528 linhas, 167 células, 0 sem coordenada, `cod_setor` com 15 dígitos em 100% |
| **Invariante na carga** | `ibge_cnefe.sh`, `derivado_cnefe_h3.sh` | Blocos `DO $at$` dentro da transação; `CNEFE_FORCAR_FALHA=AT-D1` prova o rollback |
| **Cruzado** | `lab-trazer-cnefe-h3.sh` | Contra o Censo vivo do Mac; recusa nomeando os divergentes |
| **Fumaça** | Um município | Rodar a carga só para 3548807 e reproduzir 425/425 antes de disparar os 37 |

### Ordem de execução do build

```text
1.  ssh homelab-ts: ./cargas/ibge_municipio.sh          ← pré-requisito (Decisão 6)
2.  Conferir o CABEÇALHO dos 37 arquivos                ← valida A-001 antes de tudo
3.  ibge_cnefe.sh 3548807 (só São Caetano)              ← fumaça; reproduz 82.528 e 167
4.  derivado_cnefe_h3.sh + lab-trazer  para 1 município ← reproduz 425/425 fim a fim
5.  ibge_cnefe.sh sp_concentracao (os 37)               ← a carga de verdade
6.  derivado_cnefe_h3.sh sp_concentracao
7.  lab-trazer-cnefe-h3.sh                              ← valida A-002 e A-003
8.  docs/cnefe.md, README.md, AGENTS.md                 ← com os números medidos, não os previstos
```

**O passo 2 é o mais barato e o que mais protege.** Baixar os 37 cabeçalhos custa segundos
e valida a premissa A-001, que hoje está apoiada num município de 37. Descobrir no passo 5
que a fonte não é homogênea custaria a carga inteira.

---

## Riscos

| # | Risco | Mitigação |
|---|-------|-----------|
| R-1 | **A premissa A-001 cai**: algum dos 36 tem cabeçalho ou sufixo diferente | O passo 2 acha antes de qualquer carga; o `preparar_csv.py` para nomeando o município |
| R-2 | **A igualdade com o Censo não vale nos 37** (A-002) | O publicador recusa e nomeia os setores. Se a divergência for real e explicável, ela vira conteúdo do `docs/cnefe.md` — não tolerância no código |
| R-3 | **Célula órfã** fora da malha (A-003) | AT-P1 recusa. A malha foi construída com `contain="overlap"` a partir dos setores, então órfã indica endereço fora do setor de origem — que é achado, não ruído |
| R-4 | Pico de disco em São Paulo capital | `exigir_espaco 10`; extração apagada entre municípios; 865 GB de folga |
| R-5 | Tailscale pede autenticação no navegador na primeira conexão | Medido nesta sessão. O `lab-trazer` deve falhar com mensagem clara em vez de pendurar |
| R-6 | `meta.fonte` registrar a cobertura do último argumento em vez da acumulada | Decisão 5: o script escreve a cobertura **medida da tabela** |

---

## Próximo passo

**Pronto para:** `/build .claude/sdd/features/DESIGN_CNEFE_H3.md`
