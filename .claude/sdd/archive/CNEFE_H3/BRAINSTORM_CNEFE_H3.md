# BRAINSTORM: CNEFE_H3

> Sessão exploratória para trazer o CNEFE 2022 bruto para o home lab e enriquecer a
> malha H3 res 9 com a primeira variável **medida**, não estimada

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | CNEFE_H3 |
| **Data** | 2026-09-06 |
| **Autor** | brainstorm (sessão Claude Code) |
| **Status** | ✅ Entregue e arquivado em 2026-09-06 — ver [SHIPPED](SHIPPED_2026-09-06.md) |

---

## Ideia inicial

**Entrada bruta:** trazer o CNEFE 2022 (Cadastro Nacional de Endereços para Fins
Estatísticos) para o home lab — **o bruto mesmo**, dos **mesmos 37 municípios** do recorte
da malha H3 —, para poder transformar em usos futuros; e, como primeiro uso, **enriquecer
o H3**. Geocodificação fica explicitamente fora: "não vamos misturar ainda".

**Por que ela importa:** a malha H3 foi entregue em 2026-09-05 e **não tem tela de
propósito** — todas as suas variáveis vieram do Censo por rateio areal do setor, isto é,
são recorte alternativo de um dado que o setor já tinha. O CNEFE entra **por ponto**: cada
endereço tem coordenada e cai num hexágono, sem esticar nada. É o que transforma a malha
de "outro recorte do Censo" em "coisa que sabe algo que o setor não sabe".

**Contexto levantado (medido nesta sessão, contra as fontes reais):**

- O `geodata` do **home lab está vazio**: 15 MB, apenas os schemas que o `lab-preparar.sh`
  criou (`ibge`, `indicadores`, `meta`, `staging`, `public`). Não existe `ibge_tabular`,
  não existe Censo, não existe malha H3. Tudo isso vive só no `geodata` deste Mac.
- **O Tailscale está parado.** `homelab-ts` (100.99.245.126) não responde; `server-homelab`
  pela LAN responde. O `lab-preparar.sh` tem `homelab-ts` como default — quem rodar de fora
  de casa hoje bate em timeout.
- O lab tem **865 GB livres** em `/data`, contra 27 GB no Mac e 6 GB na VPS.
- A malha `indicadores.censo_h3_r9_celula` tem 68.448 células res 9 sobre a concentração
  urbana de São Paulo/SP (37 municípios), só no Mac.
- O `_comum.sh` do `servidor-dados-gis` já tem download cacheável, staging, `psql_` e
  registro de linhagem em `meta.fonte` — a carga nova reaproveita tudo.
- Existe `scripts/espelhar-censo.sh` (Mac → lab) e `scripts/vps-publicar-*.sh` (Mac → VPS).
  **Não existe nada na direção lab → Mac.**

**Contexto técnico observado (para o /define):**

| Aspecto | Observação | Implicação |
|---------|-----------|------------|
| Local provável | `servidor-dados-gis/cargas/`, `servidor-dados-gis/scripts/` | Feature vive **inteira** num repositório só |
| KBs relevantes | `geospatial-etl` | Carga particionada, staging, controle de pico de disco |
| Emenda de ADR | Regra 7 (§6) — dado estimado mora em `indicadores` | **Pendência declarada abaixo**, não resolvida aqui |
| Aplicação derivada | Nenhuma mudança em `geo-analytics/` | Sem tile, sem camada, sem tool (ver YAGNI) |

---

## Levantamento da fonte (feito nesta sessão, contra o FTP do IBGE)

Tudo abaixo foi medido por requisição real e sobre o arquivo real de um município
(São Caetano do Sul, 82.528 linhas), não por documentação.

| # | Achado | Consequência |
|---|--------|--------------|
| 1 | O CNEFE é publicado **por município**, em `.../Arquivos_CNEFE/CSV/Municipio/35_SP/<cod>_<NOME>.zip` | A carga é por município, como o `ibge_setor.sh` é por UF. Recorte por município sai de graça. |
| 2 | **Os 37 municípios do recorte casaram, 37 de 37**, com os zips do FTP | O universo é literalmente o mesmo do H3 (`cod_concentracao_urbana='3550308'`), não um parecido |
| 3 | **263 MB de zip → ~10,2 M linhas** de unidade | São Paulo capital sozinha é 177 MB dos 263. Irrelevante para os 865 GB do lab; seria a maior tabela do sistema no Mac. **Número corrigido no `/define`**: a estimativa original (~16 M, por extrapolação do tamanho do CSV de São Caetano) ignorava que a compressão melhora nos arquivos grandes. A boa é ancorada nos 8.741.738 domicílios que o Censo conta no recorte — universo idêntico ao do CNEFE, ver achado 2 abaixo. |
| 4 | O CSV é `;`-separado, **latin-1**, 34 colunas, e traz `LATITUDE`/`LONGITUDE` em toda linha — **zero coordenada vazia** | Sem tratamento de ausência de ponto. Cada linha cai num hexágono. |
| 5 | **`NV_GEO_COORD` é o nível da coordenada, e vem da fonte**: 83,79% original de campo, 14,11% apartamento deslocado no mesmo número, 1,72% estimada, 0,37% face de quadra, 0,00% setor | A coluna de honestidade da regra 9 **já existe na origem**. Não precisa ser inventada — precisa ser preservada e agregada. |
| 6 | **`COD_ESPECIE`** (8 valores): 85,65% domicílio particular, 12,29% estabelecimento de outras finalidades, **1,13% edificação em construção ou reforma**, 0,45% saúde, 0,21% ensino, 0,20% religioso, 0,07% domicílio coletivo | As 8 espécies são a primeira leva de variáveis. A espécie 7 é o indicador antecedente de onde se constrói. |
| 7 | **`COD_TIPO_ESPECIE` preenche 100% dos domicílios e 0% do resto** (11.785 vazios = exatamente as espécies 4,5,6,7,8): 44,16% apartamento, 39,07% casa, 1,25% casa de vila ou condomínio, 1,24% outros | **Verticalização por hexágono, exata.** Não estava previsto e é a variável mais forte da carga para o cliente 2. |
| 8 | **`COD_INDICADOR_FINALIDADE_CONST`** qualifica a obra: das 934 edificações em obra, 66,92% residencial, 11,67% não residencial, 1,18% misto, 20,24% indeterminado | A obra deixa de ser contagem cega. Ressalva: é esparso — ~2,6 linhas por célula na projeção. |
| 9 | **`DSC_ESTABELECIMENTO` está preenchida em 100% das espécies 4, 5, 6 e 8** (10.831 linhas) e em **0%** dos domicílios e das obras | Texto livre, insumo do cruzamento com CNPJ **no futuro**. Fica na tabela bruta, não vira variável de célula. |
| 10 | **`CEP` preenchido em 100%** das linhas; 652 CEPs distintos no município | Relevante para a geocodificação futura, não para esta feature |

---

## Os três achados que mudaram o desenho

### 1. A célula se calcula sem a malha — e a junção fecha

`h3.latlng_to_cell(lat, lon, 9)` é **função pura da coordenada**: não precisa de
`ST_Contains`, não precisa do setor, não precisa de nenhuma tabela do IBGE do lado do
CNEFE.

Rodado nos 82.528 endereços de São Caetano: caem em **167 células distintas**, e as
**167 existem em `indicadores.censo_h3_r9_celula`. Zero órfã.**

**Consequência:** o lab consegue produzir a tabela derivada inteira sozinho, mesmo com o
banco vazio, e o código da célula é a chave de junção com a malha que vive no Mac. O que
viaja é pequeno; a malha nunca precisa sair do lugar.

### 2. O critério de aceite é exato, não estatístico

O CNEFE e os agregados do Censo 2022 são **o mesmo universo**:

| | CNEFE | Censo 2022 (`ibge_tabular`) |
|---|---|---|
| espécie 1 (domicílio particular) | 70.688 | `domicilios_particulares` = **70.688** |
| espécie 1 + espécie 2 | 70.743 | `domicilios_total` = **70.743** |
| **por setor censitário** | **425 setores** | **425 iguais, 0 diferentes** |

Igualdade na unidade, setor a setor. Isso dá à carga o mesmo grau de critério que o
`CENSO_H3` teve ("a agregação fecha exata, erro 0,000000%"): **se um município não fechar
contra `ibge_tabular.setor_basico`, a carga está errada** — e o erro aparece antes de
qualquer tela, sem depender de olho humano.

### 3. Duas armadilhas silenciosas na chave do setor

1. **O `COD_SETOR` do CNEFE tem 16 caracteres; a malha tem 15.** Todas as 82.528 linhas
   terminam em `P`. `JOIN` direto não dá erro: dá **zero linhas**. A chave é o prefixo de
   15 — e é mais seguro remover o sufixo não-numérico do que assumir que ele é sempre `P`.
2. **Os dois universos de setor não são idênticos.** 2 setores do CNEFE (133 domicílios,
   0,19%) não existem na malha, e 6 setores da malha não têm domicílio no CNEFE. Não afeta
   a derivação — a célula vem da coordenada —, mas afetaria qualquer caminho que passasse
   pelo setor. Mais um argumento para o hexágono sair de lat/lon.

---

## Inventário de amostras

| Tipo | Local | Qtd | Observações |
|------|-------|-----|-------------|
| Arquivo de entrada real | `3548807_SAO_CAETANO_DO_SUL.csv` (baixado nesta sessão) | 1 município, 82.528 linhas | latin-1, `;`, 34 colunas. Todas as medições acima saíram dele. |
| Dicionário da fonte | `Dicionario_CNEFE_Censo_2022.xls` | 1 | Legendas de `NV_GEO_COORD`, `COD_ESPECIE`, `COD_TIPO_ESPECIE`, `COD_INDICADOR_FINALIDADE_CONST` extraídas e conferidas |
| **Verdade-terreno** | `ibge_tabular.setor_basico` e `municipio_basico`, no `geodata` do Mac | 47.083 setores no recorte | **Exata**, não amostral. Decidido nesta sessão: nenhuma outra amostra é necessária. |
| Código a reaproveitar | `servidor-dados-gis/cargas/_comum.sh`, `ibge_setor.sh` | 2 | Download cacheável, staging, `psql_`, `meta.fonte`, carga por partes com pico de disco controlado |

**Como as amostras serão usadas:** o município de São Caetano vira o caso de teste rápido
da carga (roda em segundos, fecha exato); o Censo vira o critério de aceite automático de
**todos** os 37 municípios.

---

## Abordagens exploradas

### Abordagem A: bruto e derivação no lab, só o derivado viaja ⭐ Escolhida

**Descrição:** a carga baixa os 37 zips, carrega as ~16 M linhas fiéis à fonte no `geodata`
do lab, calcula o índice H3 res 9 de cada linha a partir da coordenada e produz a tabela
derivada por célula. Um script novo publica **só a tabela derivada** no `geodata` do Mac.

**Prós:**
- O dado pesado fica onde há 865 GB, que é a razão de o lab existir (LAB.md).
- Não depende de nada estar carregado no lab: a célula sai da coordenada.
- O que trafega são ~68 mil células × 16 variáveis, alguns MB.
- É o "só o derivado viaja" do LAB.md, aplicado na direção que faltava.

**Contras:**
- **Exige peça nova: publicação lab → Mac.** Hoje só existe Mac → lab e Mac → VPS.
- O critério de aceite (contra `setor_basico`) **não roda no lab**, que não tem o Censo.
  Ver "Questão deixada para o /design".

**Por que foi escolhida:** confirmada pelo Guilherme nesta sessão. É a única que põe o dado
pesado no disco grande sem pagar por isso em outro lugar.

---

### Abordagem B: carga no Mac, lab só espelha os zips

**Descrição:** a carga roda no Mac (cabem ~4-6 GB nos 27 livres), ao lado da malha; o lab
recebe só o espelho dos 263 MB de zip, no padrão do `espelhar-censo.sh`.

**Prós:** não inventa caminho novo; a derivação e a validação ficam do mesmo lado da malha.

**Contras:** põe a maior tabela do sistema no disco menor — o oposto da razão de o lab
existir. E a próxima carga (nacional, ou o CNPJ) não caberia.

---

### Abordagem C: bruto no lab, derivação no Mac

**Descrição:** o CNEFE mora no lab e a contagem por célula roda no Mac, junto da malha.

**Contras:** exige mover 16 M linhas pela rede a cada re-derivação, paga o custo dos dois
lados e não entrega vantagem nenhuma — já que a célula se calcula sem a malha. Descartada.

---

## Abordagem selecionada

| Atributo | Valor |
|----------|-------|
| **Escolhida** | Abordagem A |
| **Confirmação** | Guilherme, 2026-09-06, nesta sessão |
| **Razão** | O dado pesado vai para o disco grande; o índice H3 dispensa a malha do lado da carga, então o lab consegue derivar sozinho |

---

## Decisões tomadas no brainstorm

| # | Decisão | Razão | Alternativa rejeitada |
|---|---------|-------|-----------------------|
| 1 | Universo = os **37 municípios** da concentração urbana de SP | É o mesmo recorte da malha H3, pelo mesmo `cod_concentracao_urbana='3550308'`. Universo diferente faria a junção mentir por omissão. | Um município só (São Caetano), que era a ideia inicial da sessão |
| 2 | Bruto **fiel à fonte**: 16 M linhas de unidade, 34 colunas | "Transformar para usos futuros" exige logradouro, CEP e `DSC_ESTABELECIMENTO`, que só a versão fiel tem. Recarregar depois custa baixar tudo de novo. | Tabela enxuta de 7 colunas; e dedupe para 6,7 M endereços distintos |
| 3 | A célula sai de **lat/lon**, nunca do setor | Função pura, sem `JOIN`, sem depender de tabela do IBGE no lab — e imune às 2 armadilhas de chave do setor | `ST_Contains` contra a malha |
| 4 | **16 variáveis** por célula: 8 espécies + 4 tipos de edificação + 4 finalidades de obra | Sai tudo do mesmo `GROUP BY`, custo marginal zero, e as três dimensões já estão no mesmo arquivo | Só as 8 espécies; ou 8 espécies + 4 tipos |
| 5 | A honestidade da célula é a distribuição de **`NV_GEO_COORD`**, não `fracao_ausente` | Regra 9 do ADR: o que muda o sentido do número vai na linha. Aqui não há rateio — o que desloca ponto entre hexágonos são os 2,1% de coordenada estimada ou de face de quadra. | Reusar `fracao_ausente`, que seria zero em 100% das linhas e passaria a significar duas coisas |
| 6 | Critério de aceite = **igualdade exata** contra `ibge_tabular.setor_basico` | Medido: 425 de 425 setores em São Caetano. Não é aproximação, é identidade. | Tolerância percentual; conferência por amostra |
| 7 | A feature **termina na tabela derivada** | A tela é decisão independente (qual das 16 se pinta, como tematizar, 6 GB de VPS) e dobraria o tamanho | Ir até o mapa numa feature só; ou parar no meio, com tool e sem camada |

---

## Funcionalidades removidas (YAGNI)

| Sugerida | Razão da remoção | Dá para acrescentar depois? |
|----------|------------------|------------------------------|
| **Geocodificador próprio** (CNEFE como tabela de JOIN, normalizador, cascata de níveis) | Cortado pelo Guilherme: "não vamos misturar ainda". E a carga fiel desta feature é exatamente a base que ele vai precisar — não se perde nada esperando. | Sim, e sem recarga |
| **Tile PMTiles + camada no catálogo + tematização** | Escopo confirmado: a feature para na tabela derivada. A malha H3 continua sem tela, como o `CENSO_H3` decidiu. | Sim, feature própria |
| **Tool do agente sobre o H3** | O mapa não sabe desenhar célula H3 hoje; o destaque exigiria peça nova. Sem camada, a tool responderia sem poder mostrar. | Sim, junto da tela |
| **`DSC_ESTABELECIMENTO` como variável de célula** | É texto livre, não contagem. O valor dele é o cruzamento com o CNPJ da Receita, que é outra feature. Fica na tabela bruta. | Sim, já estará carregado |
| **Cruzamento com CNPJ da Receita por CNAE** | Depende do geocodificador e de uma fonte que ainda não foi tocada | Sim |
| **Recorte `brasil`** | ~90 M endereços. O recorte `brasil` já existe no `censo_h3_recortes.tsv` e já está barrado por disco desde o `CENSO_H3`. | Sim, com revisão de disco |
| **Publicar na VPS** | Não há o que a VPS sirva sem camada e sem tool. Publicar agora gastaria os 6 GB livres sem entregar nada. | Sim, junto da tela |

---

## Validações incrementais

| Seção | Apresentada | Retorno do Guilherme | Ajustado? |
|-------|-------------|----------------------|-----------|
| Universo e primeiro uso | ✅ | "esqueça esse universo apenas de São Caetano, vamos trabalhar com as 37 cidades do h3"; geocodificação fora | **Sim** — o escopo saiu de 1 município para 37 e perdeu a geocodificação |
| Onde a carga roda e por onde o derivado volta | ✅ | Tudo no lab | Não |
| Quais variáveis a célula recebe | ✅ | Espécie + tipo + finalidade (16) | Não |
| Onde a feature termina | ✅ | Na tabela derivada | Não |
| O que "o bruto mesmo" significa | ✅ | Fiel à fonte, 34 colunas | Não |
| Verdade-terreno | ✅ | Só o Censo basta | Não |

---

## Pendência de ADR (não resolver na sessão da feature)

**Onde mora a tabela derivada.** A regra 7 do ADR-0001 manda dado **estimado** para o
schema `indicadores`, e a emenda de 2026-09-05 acrescentou que re-agregar geometria também
estima. Mas **contar ponto dentro de célula é agregação exata**, não presunção: nada é
esticado, e a soma fecha com a origem na unidade. Este é o primeiro número desta malha que
não é estimativa.

Some a isso um impedimento concreto e medido: `indicadores.censo_h3_r9` tem
`cod_variavel` com **chave estrangeira para `ibge_tabular.variavel`** — as 41 variáveis
curadas do Censo — e `fracao_ausente` **`NOT NULL`**, que mede rateio areal. Espécie de
endereço não é variável do Censo, e `fracao_ausente` seria zero em 100% das linhas,
passando a significar duas coisas diferentes na mesma coluna.

**Encaminhamento:** tabela irmã (`indicadores.cnefe_h3_r9` + companheira de célula com a
distribuição de `NV_GEO_COORD`), apontando para a mesma malha. Mas **se um número exato
mora em `indicadores` junto com os estimados** é emenda ao ADR-0001 do `webgis`, com o
aval do Guilherme, e vira commit lá — não nota nesta sessão.

## Questão deixada para o /design

**O critério de aceite não roda no lab.** A conferência setor a setor exige
`ibge_tabular.setor_basico`, que só existe no Mac. Dois caminhos, ambos baratos:

- **A validação viaja com o dado**: a carga produz também a contagem por setor
  (~16 mil linhas nos 37 municípios), e o script de publicação no Mac recusa se algum
  município não fechar — no espírito das quatro checagens do `build_app`.
- **O lab recebe o Censo**: espelhar `ibge_tabular` do recorte para o lab, que passa a se
  validar sozinho. Mais fiel ao propósito do lab como ambiente de reconstrução, mais caro
  nesta feature.

---

## Requisitos sugeridos para o /define

### Problema (rascunho)

A malha H3 res 9 existe desde 2026-09-05 e não tem nenhuma variável que o setor censitário
já não tivesse — todas chegaram por rateio areal —, então ela não justifica a própria
existência; e o CNEFE 2022, que resolveria isso por ponto e sem rateio, não está em lugar
nenhum do sistema.

### Usuários-alvo (rascunho)

| Usuário | Dor |
|---------|-----|
| Guilherme / futuras features | Não há base de endereços com coordenada no sistema; toda transformação futura (geocodificação, CNPJ, POIs) começa do zero, baixando do IBGE |
| Cliente 2 (EB Prime, imobiliária) | Não sabe **onde se constrói** nem **onde é vertical** com granularidade menor que o setor |
| Malha H3 | Não tem variável própria; sem uma, não há o que pôr em tela |

### Critérios de sucesso (rascunho)

- [ ] Os 37 municípios do recorte carregados, ~16 M linhas, 34 colunas, fiéis à fonte
- [ ] **Para cada um dos 37 municípios**, `count(espécie 1)` por setor **igual**, na
      unidade, a `ibge_tabular.setor_basico.domicilios_particulares` — zero setor diferente
- [ ] `count(espécie 1 + 2)` por município igual a `municipio_basico.domicilios_total`
- [ ] Tabela derivada com 16 variáveis por célula, no formato longo
- [ ] **Zero célula órfã**: toda célula do CNEFE existe em `censo_h3_r9_celula`
- [ ] A distribuição de `NV_GEO_COORD` gravada por célula
- [ ] A carga é re-executável e registra linhagem em `meta.fonte` com a versão da fonte
- [ ] O derivado chega ao `geodata` do Mac por script, e o script **recusa** se a validação
      não fechar

### Restrições identificadas

- O `geodata` do lab está **vazio**: a carga não pode depender de nenhuma tabela do IBGE
  estar lá
- **Tailscale parado**: `homelab-ts` não responde hoje; o `lab-preparar.sh` tem esse host
  como default
- O caminho **lab → Mac não existe** e é peça nova desta feature
- `COD_SETOR` do CNEFE tem 16 caracteres contra 15 da malha — junção ingênua devolve zero
  sem erro
- O CSV é **latin-1**, não UTF-8
- São Paulo capital é 177 MB dos 263 MB: o pico de disco e de memória se mede por ela, não
  pela média
- Regra 6 do ADR: **o lab é cache, nunca fonte** — a carga tem de continuar capaz de
  rebaixar do IBGE

### Fora de escopo (confirmado)

- Geocodificação, normalizador de endereço, cascata de níveis de batimento
- Cruzamento com o CNPJ da Receita Federal
- Tile, camada no catálogo, tematização e tool do agente
- Qualquer mudança em `geo-analytics/` (a aplicação não muda nesta feature)
- Publicação na VPS
- Recorte `brasil` ou qualquer outro além dos 37 municípios

---

## Resumo da sessão

| Métrica | Valor |
|---------|-------|
| Perguntas feitas | 5 (universo, onde roda, variáveis, escopo final, amostra) |
| Abordagens exploradas | 3 |
| Funcionalidades removidas (YAGNI) | 7 |
| Validações concluídas | 6 |
| Medições feitas contra a fonte real | 10 achados + 3 que mudaram o desenho |

---

## Próximo passo

**Pronto para:** `/define .claude/sdd/features/BRAINSTORM_CNEFE_H3.md`
