# BUILD REPORT: CNEFE_H3

> O CNEFE 2022 no home lab, 17 variáveis por célula H3, e o primeiro caminho de dado
> lab → Mac. Entregue e conferido contra o Censo.

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | CNEFE_H3 |
| **Data** | 2026-09-06 |
| **Autor** | build (sessão Claude Code) |
| **DEFINE** | [`DEFINE_CNEFE_H3.md`](../features/DEFINE_CNEFE_H3.md) |
| **DESIGN** | [`DESIGN_CNEFE_H3.md`](../features/DESIGN_CNEFE_H3.md) |
| **Status** | ✅ Completo |
| **Commit** | `servidor-dados-gis` `844380d` |
| **Onde rodou** | Home lab (`homelab-ts` / `server-homelab`) + `geodata` deste Mac |

---

## Resumo

| Métrica | Valor |
|---------|-------|
| Arquivos criados | 6 |
| Arquivos editados | 2 |
| Linhas entregues | 1.303 |
| Testes de aceite | **12** — AT-B1..B3 (carga), AT-D1..D5 (derivação), AT-P1..P4 (conferência) |
| Rollback provado | Sim, por `CNEFE_FORCAR_FALHA` em cada camada |
| Arquivos em `geo-analytics/` | **0**, como o DESIGN previa |
| Tempo da carga bruta | 32 min (37 municípios) |
| Tempo da derivação | 2 min 23 s |

**Números medidos, não previstos:**

| | |
|---|---|
| Endereços carregados | **10.005.534** |
| Domicílios particulares (espécie 1) | **8.735.615** = `domicilios_particulares` do Censo, na unidade |
| Domicílios totais (espécies 1+2) | **8.741.738** = `domicilios_total` do Censo, na unidade |
| Municípios que fecham exato | **37 de 37** |
| Células H3 com endereço | **37.801** (de 68.448 na malha) |
| Valores por célula | **227.167** |
| Qualidade da coordenada | 83,97% original de campo · 13,32% apartamento deslocado · **2,70% imprecisa** |

---

## Arquivos entregues

Todos em `../servidor-dados-gis`.

| # | Arquivo | Ação | Linhas | Verificação |
|---|---------|------|-------:|-------------|
| 1 | `cargas/cnefe_variaveis.tsv` | Criar | 31 | 17 variáveis carregadas no catálogo |
| 2 | `metodologia/cnefe/preparar_csv.py` | Criar | 145 | `ruff check` limpo, `ruff format` aplicado; reproduz 82.528 linhas e 167 células em São Caetano |
| 3 | `cargas/ibge_cnefe.sh` | Criar | 295 | `bash -n`, shellcheck sem achados, AT-B1..B3 com rollback provado |
| 4 | `cargas/derivado_cnefe_h3.sh` | Criar | 293 | idem, AT-D1..D5 |
| 5 | `scripts/lab-trazer-cnefe-h3.sh` | Criar | 222 | idem, AT-P1..P4; recusa provada preservando o publicado |
| 6 | `docs/cnefe.md` | Criar | 149 | as sete armadilhas da fonte, todas medidas |
| 7 | `README.md` | Editar | +47 | carga listada, seção própria, números medidos |
| 8 | `AGENTS.md` | Editar | +12 | a exceção do `uv` passa a valer para dois arquivos; a armadilha do `while read` |

---

## O que a construção descobriu, e o design não previa

Sete achados. Cinco são da fonte, dois são defeitos meus — e três mudaram o critério de
aceite, o que é a parte que mais importa registrar.

### 1. `COD_UNICO_ENDERECO` não é único *(fonte)*

A carga estourou a chave primária na primeira execução. O dicionário avisa numa linha fácil
de perder: *"cada registro representa uma espécie existente no endereço"*. Casa que também é
comércio aparece duas vezes. Em São Caetano: 82.528 linhas para 82.154 códigos, 370
repetidos, até 3 vezes.

**A chave é `(cod_unico_endereco, cod_especie)`** — 82.528 combinações para 82.528 linhas. E
a espécie 1 continua com um registro por domicílio, que é o que faz a contagem bater com o
Censo. Uma linha é um par *(endereço, espécie)*, não uma unidade.

### 2. A 34ª coluna do cabeçalho vem truncada *(fonte)*

O cabeçalho termina em **`COD_TIPO_ESPECI`**, sem o `E` final; o dicionário oficial a chama
de `COD_TIPO_ESPECIE`. Quem escrever o carregador a partir do dicionário não casa o
cabeçalho — e o `preparar_csv.py` para nomeando o município quando isso acontece.

### 3. Os 37 arquivos são ASCII, apesar de declarados latin-1 *(fonte)*

Varredura integral, 2,5 GB: **zero byte acima de 127**. O IBGE tirou os acentos do CNEFE.

**Consequência para o DEFINE:** o `AT-007` (acentuação correta) **não tem o que exercitar**
neste recorte — passaria sem provar nada. A leitura em latin-1 ficou, porque é o que o
dicionário declara e o que uma republicação pode voltar a exigir, mas foi registrada como
defesa e não como teste.

### 4. 354 obras sem finalidade declarada *(fonte — mudou o catálogo)*

O `AT-D3` recusou na primeira execução dos 37: as finalidades somavam 196.547 contra 196.901
obras. São 354 obras (0,18%) sem finalidade, em **27 dos 37 municípios** — característica da
fonte, não arquivo defeituoso. Em São Caetano, onde a feature foi desenhada, as 934 obras
tinham todas.

**A correção não foi afrouxar o teste.** O catálogo ganhou uma **17ª variável**,
`obra_finalidade_ausente`, mapeada ao valor `0`, que não existe na fonte e representa a
ausência. Sem ela essas obras sumiriam da soma do bloco, e "indeterminada" — o IBGE dizendo
que não sabe — se confundiria com "não declarada". Mesma razão de o `censo_h3_r9` ter
`fracao_ausente`.

### 5. A renumeração dos setores *(fonte — mudou o critério central)*

**Este é o achado da feature.** O `AT-P2` exigia zero setor divergente contra o Censo, tinha
sido escrito a partir de um município (São Caetano, 425 de 425) e recusou nos 37: **500 de
43.232 setores divergem (1,16%)** — 291 para menos, 207 para mais, líquido −937.

A investigação mostrou que não é contagem errada. Amostra de 200 setores que o CNEFE tem e a
malha não:

| | |
|---|---|
| endereços que caem **dentro** de um setor da malha | **200 de 200** |
| com o **mesmo código** nos dois lados | **0** |
| que caem num setor que "o CNEFE não tem" | **157 (78,5%)** |

**Os dois produtos do Censo 2022 numeram parte dos mesmos setores de formas diferentes.**
Isso explica de uma vez os 2.490 setores só do CNEFE (377.883 domicílios), os 3.851 só do
Censo, e os 500 divergentes — renumeração parcial desloca domicílio entre vizinhos. E
explica por que o município fecha exato: renumerar não move endereço de município.

**Mudança de critério, e o porquê de não ser afrouxamento:** exigir que dois produtos do
IBGE concordem sobre a borda do setor é exigir o que a fonte não entrega; exigir que contem
o mesmo universo é o que prova a carga, e isso é exato. A recusa passou para o **município**
(exata, 37 de 37) e a divergência por setor passou a ser **declarada** a cada execução.

**A consequência de projeto valida o DESIGN:** o código do setor não serve como chave entre
os dois produtos. A coordenada serve. Uma carga que atribuísse o hexágono pelo setor
herdaria 4,3% de domicílios sem destino, sem erro nenhum.

### 6. `docker compose exec -T` drena o stdin do laço *(defeito meu)*

A primeira execução dos 37 carregou **um** município e não deu erro nenhum no laço: o
`docker compose exec -T` de dentro dele consumiu o here-string inteiro na primeira volta.

**Quem acusou foi o `AT-B3`**, que nomeou os 35 municípios ausentes. Sem essa validação, a
carga teria terminado "com sucesso" cobrindo 3% do recorte. A lista passou a entrar pelo
descritor 3, e a armadilha virou linha no `AGENTS.md` do `servidor-dados-gis`.

### 7. Dois defeitos meus nos próprios testes

- **`AT-P2` passaria em vazio.** Ele percorre um `JOIN`; se a chave do setor quebrasse (os 16
  caracteres contra 15), nada casaria, o laço não acharia divergência e o teste diria que
  está tudo certo. Ganhou guarda: conta os municípios conferidos e exige que sejam todos.
- **`RAISE NOTICE` não conhece `printf`.** `%.2f` imprimiu o número cru seguido de `.2f`,
  porque `%` ali é substituição. O arredondamento foi para o valor.

---

## Desvios em relação ao DEFINE e ao DESIGN

| # | O que o artefato dizia | O que ficou | Por quê |
|---|------------------------|-------------|---------|
| 1 | **16 variáveis** por célula | **17** | A ausência de finalidade precisa ser contável (achado 4) |
| 2 | `AT-002` / `AT-P2`: **zero setor diferente** | Recusa por **município** (exata); setor **declarado** | Renumeração da fonte (achado 5) |
| 3 | **Zero célula órfã**, senão recusa | **Declarada**; recusa passou a ser resolução + conservação | Diferença de conjunto tem os dois sentidos: 6 células só do CNEFE contra 30.653 só do Censo |
| 4 | `AT-007`: acentuação correta | **Sem o que exercitar** | Os 37 arquivos são ASCII (achado 3) |
| 5 | Chave da tabela bruta implícita em `cod_unico_endereco` | `(cod_unico_endereco, cod_especie)` | Achado 1 |
| 6 | `~10,2 M linhas` (estimado) | **10.005.534** (medido) | A estimativa ancorada no Censo errou por 2% |

Os desvios 2 e 3 são os únicos que **enfraqueceriam** a feature se estivessem errados, e por
isso a recusa foi movida e não removida: o que se cobra agora é a identidade por município,
que é exata e conhecida antes da carga, mais a conservação no transporte.

---

## Pré-requisitos descobertos no lab

O DESIGN previa um (`ibge_municipio.sh`). Eram quatro:

1. **O repositório não estava no lab.** `~/projects/geodata` tinha só o compose e o `.env`;
   `/data/repos/servidor-dados-gis` era cópia órfã de 2026-08-27, sem git e sem as cargas
   novas. O checkout completo foi para `~/projects/geodata`, que é quem **é dono do container
   compose** — sem isso, `psql_` do `_comum.sh` não alcança o banco.
2. **`uv` não existia no lab**, e a carga do `CENSO_H3` já o exigia desde 2026-09-05.
3. **`dados/` apontava para o disco de sistema.** Virou link para `/data/geodata-dados`, que
   é o disco de 865 GB — a razão de o lab existir.
4. **`ibge_municipio.sh` falha no fim, num lab vazio**: a validação de órfãos consulta
   `ibge.setor_censitario`, que não existe lá. O `COMMIT` acontece antes, então os 5.571
   municípios entram; mas o script sai com erro. Não foi corrigido — está fora do escopo
   desta feature e vale registrar como pendência.

**Consequência para o `lab-preparar.sh`:** ele envia o compose e a inicialização, mas não as
cargas. Enquanto for assim, rodar carga no lab exige uma sincronização à mão.

---

## Verificação

| Tipo | Resultado |
|------|-----------|
| `./scripts/verificar.sh --estatico` | ✅ passa |
| `shellcheck -S warning` (em container; não está no host) | ✅ sem achados nos três scripts |
| `ruff check` / `ruff format --check` | ✅ limpo no `preparar_csv.py` |
| Fumaça em um município | ✅ 82.528 linhas, 167 células, 425 de 425 setores |
| Rollback da carga bruta (`CNEFE_FORCAR_FALHA=AT-B1`) | ✅ município que não passa **não entra** (0 linhas) |
| Rollback da conferência (`=AT-P2`) | ✅ recusa preserva o publicado |
| Carga dos 37 | ✅ 10.005.534 endereços, AT-B1..B3 |
| Derivação dos 37 | ✅ AT-D1..D5, com os totais dos três blocos fechando |
| Conferência cruzada | ✅ AT-P1..P4; 37 de 37 municípios exatos |

---

## O que NÃO foi feito, por escopo

Tile, camada no catálogo, tematização, tool do agente, geocodificação, cruzamento com CNPJ,
publicação na VPS. Tudo confirmado como fora de escopo no brainstorm. **Nenhum arquivo de
`geo-analytics/` foi tocado.**

---

## Próximo passo

**Pronto para:** `/ship`
