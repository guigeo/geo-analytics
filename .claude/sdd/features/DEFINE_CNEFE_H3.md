# DEFINE: CNEFE_H3

> O CNEFE 2022 bruto entra no home lab e a malha H3 ganha a primeira variável que o setor
> censitário não sabe — medida por ponto, não rateada por área

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | CNEFE_H3 |
| **Data** | 2026-09-06 |
| **Autor** | define (sessão Claude Code) |
| **Status** | Pronto para /design |
| **Clarity Score** | 15/15 |
| **Origem** | [`BRAINSTORM_CNEFE_H3.md`](BRAINSTORM_CNEFE_H3.md), medido contra as fontes reais |
| **Pré-requisito** | ✅ Nenhum — a regra 9 do ADR-0001 já cobre o caso (ver "Questões em aberto") |
| **Repositório do código** | `../servidor-dados-gis` — esta feature **não toca** este repo |
| **Onde roda** | Home lab (`server-homelab` / `homelab-ts`), 865 GB livres |

---

## Problema

A malha H3 res 9 existe desde 2026-09-05 — 68.448 células sobre a concentração urbana de
São Paulo — e **não tem nenhuma variável que o setor censitário já não tivesse**. Todas as
suas 41 variáveis chegaram por rateio areal do setor, isto é, são um recorte alternativo de
um dado que já existia num recorte melhor documentado. Por isso a feature `CENSO_H3` foi
entregue sem tile, sem camada e sem tool: não havia o que mostrar que o setor não mostrasse.

A malha só justifica a própria existência quando receber dado que **não cabe** no setor. E
a fonte que faz isso está publicada, é gratuita e não está em lugar nenhum do sistema: o
**CNEFE 2022**, o cadastro de endereços do IBGE, em que **cada endereço tem coordenada**.
Endereço entra por ponto — cai num hexágono e pronto, sem esticar nada, sem fator de
desagregação, sem presunção de densidade.

Há um segundo problema, de prazo mais longo e que o Guilherme nomeou primeiro: **toda
transformação futura sobre endereço começa do zero**. Geocodificação própria, cruzamento
com o CNPJ da Receita, densidade de POIs — as três precisam da mesma base de endereços com
coordenada, e hoje cada uma teria de baixar e tratar o CNEFE por conta própria. Carregar o
bruto **fiel à fonte** uma vez, no lab, resolve as três de antemão.

---

## Usuários

| Usuário | Papel | Dor |
|---------|-------|-----|
| **Guilherme** | Dono do produto | Quer transformar endereço em várias direções (geocodificação, CNPJ, POIs) e não tem a base em lugar nenhum; cada tentativa recomeça no FTP do IBGE |
| **Cliente 2 (EB Prime)** | Imobiliária | Não sabe **onde se constrói** nem **onde é vertical** com granularidade menor que o setor censitário — e o setor urbano mediano tem 0,0275 km², com forma que muda de quadra em quadra |
| **A malha H3** | Infraestrutura de dado | Não tem variável própria. Sem uma, não há o que pôr em tela, e ela permanece cano sem água |
| **Features seguintes** | Tela do H3, score composto, geocodificador | Cada uma dependeria de uma carga que ninguém fez |

---

## Objetivos

| Prioridade | Objetivo |
|------------|----------|
| **MUST** | CNEFE 2022 dos **37 municípios** da concentração urbana de SP carregado no `geodata` do **home lab**, **fiel à fonte** (34 colunas), por script re-executável |
| **MUST** | Índice H3 res 9 calculado **da coordenada** em toda linha — nunca do setor |
| **MUST** | Tabela derivada com **16 variáveis** por célula: 8 espécies de endereço, 4 tipos de edificação, 4 finalidades de obra |
| **MUST** | A honestidade da célula em dado, não em prosa: a **distribuição de `NV_GEO_COORD`** preservada por célula |
| **MUST** | **Fechamento exato** contra o Censo, município a município e setor a setor — a carga falha se não fechar |
| **MUST** | Caminho **lab → Mac** para o derivado, com o script **recusando** publicar se a conferência não fechar |
| **MUST** | Linhagem em `meta.fonte` com a versão medida da fonte, e `SELECT` para `geo_reader` |
| **SHOULD** | O recorte ser parâmetro do script (município ou lista), não constante — o `brasil` é o mesmo código |
| **SHOULD** | Rótulos das 16 variáveis em **TSV commitado** (padrão do `censo_nomes.tsv`), não em `dict` no script |
| **COULD** | A conferência por setor ficar guardada como tabela, não só como asserção que passa e some |
| **COULD** | Registrar no ADR-0001, no `/ship`, a aplicação da regra 9 a dado que entra por ponto — com a medição dos 37 municípios junto |

---

## Critérios de sucesso

Todos os números abaixo são **conhecidos antes de a carga rodar** — eles saem do Censo, que
conta o mesmo universo. Não há tolerância percentual em nenhum.

- [ ] **8.741.738 domicílios** carregados como espécie 1 + espécie 2 nos 37 municípios —
      igual, na unidade, a `sum(municipio_basico.domicilios_total)` do recorte
- [ ] **Por município (37 de 37)**: `count(espécie 1)` igual a `domicilios_particulares`
- [ ] **Por setor**: `count(espécie 1)` igual a `setor_basico.domicilios_particulares` em
      **todos** os setores que existem nos dois lados — **zero setor diferente**
- [ ] **Zero célula órfã**: toda célula H3 produzida pela carga existe em
      `indicadores.censo_h3_r9_celula` (68.448 células)
- [ ] **Zero linha sem coordenada** e zero linha sem célula atribuída
- [ ] As **16 variáveis** presentes, e a soma de cada bloco fecha com a contagem bruta:
      Σ(8 espécies) = total de linhas; Σ(4 tipos) = total de domicílios;
      Σ(4 finalidades) = total de espécie 7
- [ ] A **distribuição de `NV_GEO_COORD`** gravada por célula, com as 6 contagens somando
      o total de endereços da célula
- [ ] A carga é **re-executável**: rodar duas vezes seguidas deixa o banco idêntico
- [ ] `meta.fonte` registra URL, versão da fonte medida (`Last-Modified`), script e
      cobertura — os 37 municípios nomeados, não "São Paulo"
- [ ] O derivado chega ao `geodata` do Mac e a publicação **recusa** se a conferência falhar

**Sem alvo de tempo.** A carga roda no lab, sem ninguém esperando, e o `CENSO_H3` mostrou
que prometer minuto em carga grande vira número decorativo. O que importa é o pico de
disco e de memória caber — ver as restrições.

---

## Testes de aceite

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| **AT-001** | Fechamento por setor, o critério central | O CSV de São Caetano do Sul (3548807) carregado | A carga conta espécie 1 por setor e compara com `setor_basico` | 425 setores, **425 iguais, 0 diferentes** — e a carga segue |
| **AT-002** | Fechamento nos 37 municípios | Os 37 municípios carregados | Soma-se espécie 1 + 2 no recorte inteiro | **8.741.738**, na unidade |
| **AT-003** | A armadilha do código de setor | Uma linha do CNEFE com `COD_SETOR = '354880705000121P'` (16 caracteres) | A carga normaliza a chave e junta com a malha (15 caracteres) | Casa. Se a junção for ingênua, o teste falha com **zero linhas** — não com erro |
| **AT-004** | Célula fora da malha | Uma célula H3 produzida pela carga que não exista em `censo_h3_r9_celula` | O script de publicação lab → Mac roda | **Recusa publicar** e nomeia as células órfãs. Medido em São Caetano: 167 de 167 existem, zero órfã |
| **AT-005** | Conferência não fecha | Um município cujo `count(espécie 1)` por setor divirja do Censo | A carga chega ao passo de validação | **Falha com erro**, nomeia o município e os setores divergentes, e não grava o derivado |
| **AT-006** | Re-execução | O banco já carregado com os 37 municípios | A carga roda de novo, inteira | Mesmas contagens, mesmas linhas, nada duplicado |
| **AT-007** | Acentuação da fonte | O CSV é **latin-1**, com `SÃO CAETANO`, `JOSÉ`, `GUARULHOS` | A carga lê e grava | Acento correto no banco. Ler como UTF-8 falha ou corrompe silenciosamente |
| **AT-008** | O lab está vazio | O `geodata` do lab sem `ibge_tabular`, sem Censo, sem malha H3 | A carga bruta e a derivação rodam | Passam. A célula sai de lat/lon; nenhuma tabela do IBGE é consultada do lado da carga |
| **AT-009** | Coordenada imprecisa preservada | Endereços com `NV_GEO_COORD` 3 e 4 (2,09% em São Caetano) | A derivação agrega a célula | As 6 contagens de nível aparecem na linha da célula. **Não** são descartadas nem viram média |
| **AT-010** | Pico de disco | São Paulo capital, 177 MB de zip — 67% do peso do recorte | A carga processa o maior município | Não estoura memória nem enche o disco; o staging de um município é liberado antes do seguinte |

---

## Fora de escopo

Confirmado com o Guilherme no brainstorm. O que segue **não** entra:

- **Geocodificação** — normalizador de endereço, cascata de níveis de batimento,
  interpolação em eixo de rua, OSM/Geofabrik. Cortado por decisão explícita ("não vamos
  misturar ainda"). A carga fiel desta feature já é a base que ela vai precisar.
- **Cruzamento com o CNPJ da Receita Federal** por CNAE.
- **`DSC_ESTABELECIMENTO` como variável de célula** — é texto livre, fica na tabela bruta.
- **Tile PMTiles, camada no catálogo, tematização e tool do agente.** A malha H3 continua
  sem tela, como o `CENSO_H3` decidiu. A tela é feature própria, e a decisão dela é outra:
  qual das 16 variáveis se pinta, como tematizar, e os 6 GB livres da VPS.
- **Qualquer mudança em `geo-analytics/`.** A aplicação não muda nesta feature.
- **Publicação na VPS.** Sem camada e sem tool, não há o que a VPS sirva.
- **Recorte `brasil`** ou qualquer outro além dos 37 municípios — ~90 M endereços, e o
  recorte nacional já está barrado por disco desde o `CENSO_H3`.
- **Espelho do CNEFE em `/data`** nos moldes do `espelhar-censo.sh`. O `dados/` cacheado do
  `_comum.sh` já evita rebaixar, e são 263 MB.

---

## Restrições

| Tipo | Restrição | Impacto no desenho |
|------|-----------|--------------------|
| Técnica | **O `geodata` do lab está vazio** — 15 MB, só os schemas do `lab-preparar.sh`. Sem `ibge_tabular`, sem Censo, sem malha | A carga **não pode** depender de nenhuma tabela do IBGE estar lá. É o que obriga a célula a sair de lat/lon |
| Técnica | **A conferência contra o Censo exige `setor_basico`, que só existe no Mac** | Ou a conferência viaja com o dado, ou o lab recebe o Censo do recorte. Ver "Questões em aberto" |
| Técnica | **O caminho lab → Mac não existe.** Só há Mac→lab (`espelhar-censo.sh`) e Mac→VPS (`vps-publicar-*.sh`) | Peça nova desta feature, e é onde mora a checagem que recusa |
| Técnica | `COD_SETOR` do CNEFE tem **16 caracteres** (sufixo `P`); a malha tem 15 | Junção ingênua devolve **zero linhas sem erro**. Normalizar removendo o sufixo não-numérico, não assumindo `P` |
| Técnica | O CSV é **latin-1**, `;`-separado, 34 colunas | Encoding explícito na leitura, senão corrompe calado |
| Técnica | **São Paulo capital é 177 MB dos 263 MB** de zip | O pico se mede por ela. Carga por município, staging liberado entre um e outro — o padrão que o `ibge_setor.sh` já usa por UF |
| Técnica | `indicadores.censo_h3_r9` tem FK para `ibge_tabular.variavel` e `fracao_ausente NOT NULL` | O CNEFE **não cabe** nessa tabela. Tabela irmã, com coluna de honestidade própria |
| Arquitetural | **Regra 6 do ADR: o lab é cache, nunca fonte** | A carga tem de continuar capaz de rebaixar do IBGE. Nada pode existir só no lab de forma irreprodutível |
| Arquitetural | **Regra 5: o `geodata` permanece reconstruível** | Vale para o do lab também: a tabela bruta se refaz pelo script |
| Operacional | Tailscale precisa estar de pé para alcançar `homelab-ts` de fora de casa; **a primeira conexão pede autenticação no navegador** | Script não-interativo trava nesse ponto. Autenticar antes, ou usar `server-homelab` na LAN |
| Recurso | Lab: 865 GB livres. Mac: 27 GB. VPS: 6 GB | O bruto só cabe confortavelmente no lab, e é a razão de a feature morar lá |

---

## Contexto técnico

| Aspecto | Valor | Observações |
|---------|-------|-------------|
| **Local do código** | `../servidor-dados-gis/cargas/` e `../servidor-dados-gis/scripts/` | Uma carga nova + um script de publicação novo + um TSV de rótulos. **Zero arquivo em `geo-analytics/`** |
| **Onde executa** | Home lab, via `ssh homelab-ts` / `server-homelab` | O `docker compose` do `geodata` já está de pé lá há 10 dias |
| **KBs relevantes** | `geospatial-etl` | Carga particionada, staging, pico de disco, `COPY` em vez de `INSERT` |
| **Impacto de IaC** | Nenhum | Sem recurso novo. O Postgres do lab já existe; a VPS não é tocada |
| **Dependência externa** | `h3` via `uv` com cabeçalho PEP 723 | Exceção já declarada no `AGENTS.md` do `servidor-dados-gis` para o `metodologia/censo-h3/gerar_malha.py` — o mesmo padrão, sem instalar pacote no host |
| **Fonte** | `ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/35_SP/` | Um `.zip` por município, nomeado `<cod7>_<NOME>.zip`. Os 37 casaram |

---

## Premissas

| ID | Premissa | Se estiver errada | Validada? |
|----|----------|-------------------|-----------|
| **A-001** | Os outros 36 municípios têm a mesma estrutura do de São Caetano: 34 colunas, latin-1, `;`, sufixo `P` no `COD_SETOR` | A carga precisa normalizar por município, e o `AT-003` deixa de ser um caso e vira uma família | ❌ **Um município inspecionado de 37.** Conferir o cabeçalho dos 37 é barato e deve ser o primeiro passo do build |
| **A-002** | A igualdade exata contra o Censo vale nos 37, não só em São Caetano | O critério central da feature cai, e é preciso descobrir a natureza da divergência antes de qualquer derivação | ❌ Medido em 1 município (425/425). É o próprio `AT-002` que valida |
| **A-003** | Zero célula órfã nos 37 municípios | A publicação recusa (por desenho) e é preciso decidir o que fazer com os endereços fora da malha | ❌ Medido em 1 município (167/167) |
| **A-004** | O total de linhas fica em torno de **10,2 M**, ancorado nos 8.741.738 domicílios exatos e na razão de São Caetano (domicílios = 85,72% das linhas) | Só muda a estimativa de disco, que tem folga de duas ordens de grandeza no lab | ⚠️ **Corrige o brainstorm**, que dizia ~16 M por extrapolação do tamanho do CSV. A extrapolação por tamanho ignora que a compressão melhora nos arquivos grandes; a ancorada no Censo é mais confiável |
| **A-005** | O `NV_GEO_COORD` da fonte é confiável como declaração de qualidade — o IBGE não marca como "original de campo" coordenada que estimou | A coluna de honestidade da célula mede a coisa errada, e o número fica bonito sem ser verdadeiro | ⚠️ Vem do dicionário oficial da fonte. Não há como verificar por dentro |
| **A-006** | O `h3.latlng_to_cell` da carga produz o mesmo índice que o `gerar_malha.py` do `CENSO_H3` produziu | As duas malhas não se falam, e a junção por `h3_r9` mente | ⚠️ Mesma biblioteca, mesma resolução. **Provado indiretamente**: 167 de 167 células de São Caetano casaram com a malha existente |
| **A-007** | O CNEFE 2022 é o mesmo levantamento do Censo 2022, sem defasagem de recorte de setor | Os 2 setores do CNEFE ausentes na malha viram sintoma de algo maior que 0,19% | ⚠️ Medido em São Caetano: 2 setores do CNEFE fora da malha, 6 setores da malha sem CNEFE |

---

## Clarity Score

| Elemento | Nota | Por quê |
|----------|------|---------|
| Problema | **3** | Duas dores concretas e datadas: a malha entregue sem variável própria em 2026-09-05, e toda transformação sobre endereço recomeçando no FTP |
| Usuários | **3** | Quatro, com dor específica cada um, incluindo o cliente 2 nomeado e o caso de uso dele |
| Objetivos | **3** | Oito MUST, dois SHOULD, um COULD, todos verificáveis |
| Sucesso | **3** | Onze critérios, **todos numéricos e conhecidos antes da carga** — 8.741.738 domicílios, 37 municípios, zero setor diferente, zero célula órfã. Nenhuma tolerância percentual |
| Escopo | **3** | O que entra e o que sai está fechado e confirmado, e o destino do derivado **já está decidido pelo ADR vigente** — o que restou é desenho de tabela, que é trabalho do `/design`, não indefinição de escopo |
| **Total** | **15/15** | Acima do mínimo de 12 |

---

## Questões em aberto

**1. Onde mora a tabela derivada — RESPONDIDA pelo ADR vigente, sem emenda.**

A primeira leitura desta sessão viu contradição onde não há. A emenda de 2026-09-05 à
regra 9 do ADR-0001 já diz, com estas palavras: *"dado re-agregado para uma malha que a
fonte não publica é estimativa — vai para `indicadores`, nunca para `ibge*`"*. O IBGE não
publica por hexágono, logo o CNEFE por célula vai para `indicadores` pelo texto vigente.

E a mesma emenda já separa os dois casos: *"Somar setores inteiros dentro de uma célula é
aritmética exata e não estima nada; espalhar um setor por várias células presume densidade
uniforme e inventa."* Ou seja, **"é exato" e "mora em `indicadores`" já convivem no ADR**.
O erro de leitura foi tratar `indicadores` como o schema do incerto: o critério dele é
**procedência** — entra ali o que a aplicação derivou —, e o que separa exato de estimado é
a linha, não a prateleira.

**O que sobra não é decisão de arquitetura, é desenho de tabela**, e cabe ao `/design`: a
FK para `ibge_tabular.variavel` e o `fracao_ausente NOT NULL` impedem o CNEFE de entrar em
`indicadores.censo_h3_r9`, e a saída recomendada é tabela irmã com coluna de honestidade
própria.

Fica **um registro para o `/ship`, e ele não é pré-requisito de nada**: a regra 9 manda a
linha carregar *"a medida da própria incerteza"* e define essa medida como o fator de
desagregação. Para dado que entra por ponto não há desagregação, e a medida é outra — a
qualidade da coordenada da fonte. Isso é **aplicação** da regra, não mudança dela, e o ADR
já tem precedente de registrar aplicação sem emendar (a pintura categórica do
`ZONEAMENTO_SP`). Registrar no `/ship`, com a medição dos 37 municípios junto, vale mais
do que registrar agora com número de um município só.

**2. Onde roda a conferência, já que o lab não tem o Censo — decisão do `/design`.**

- **Recomendado: a conferência viaja com o dado.** A carga produz também a contagem de
  espécie 1 por setor (~47 mil linhas), e o script de publicação no Mac recusa se algum
  município não fechar. Barato, e tem a forma das quatro checagens do `build_app`.
- **Alternativa:** espelhar `ibge_tabular` do recorte para o lab, que passa a se validar
  sozinho. Mais fiel ao lab como ambiente de reconstrução, mais caro nesta feature.

---

## Histórico de revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-06 | define (sessão Claude Code) | Versão inicial, a partir do `BRAINSTORM_CNEFE_H3.md`. Estimativa de linhas corrigida de ~16 M para ~10,2 M, ancorada nos 8.741.738 domicílios do Censo |
| 1.1 | 2026-09-06 | define (sessão Claude Code) | **A emenda de ADR deixa de ser pré-requisito.** Releitura da regra 9 na íntegra mostrou que a emenda de 2026-09-05 já cobre o caso: o destino é `indicadores` pelo texto vigente, e "exato" não conflita com isso. Escopo passa de 2 para 3, e o score de 14 para 15 |

---

## Próximo passo

**Pronto para:** `/design .claude/sdd/features/DEFINE_CNEFE_H3.md`
