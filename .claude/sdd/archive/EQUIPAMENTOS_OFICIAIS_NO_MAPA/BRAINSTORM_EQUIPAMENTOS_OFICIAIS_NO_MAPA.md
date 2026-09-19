# BRAINSTORM: EQUIPAMENTOS_OFICIAIS_NO_MAPA

> Exploração antes da captura de requisitos — como o cadastro oficial de saúde (CNES) e de
> escolas (Inep), já persistido e replicado, chega ao mapa, ao Raio-X e ao agente.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | EQUIPAMENTOS_OFICIAIS_NO_MAPA |
| **Date** | 2026-09-19 |
| **Author** | Claude Opus 5 (sessão com o Gui) |
| **Status** | Ready for Define |

---

## Initial Idea

**Raw Input:** "publica as réplicas e abre o brainstorm pra gente discutir como vamos
implementar esses layers de escola e CNES… mas apenas suba a infra pra VPS, não coloque
nada na aplicação."

**Contexto reunido:**

- `CNES_NO_GEODATA` e `INEP_NO_GEODATA` fecharam em 2026-09-18 (Codex no desenho, Cursor
  Grok 4.6 no build). Deixaram o dado no PostGIS local e **zero** arquivo de código no
  `geo-analytics`.
- **As réplicas foram publicadas nesta sessão (2026-09-19).** Conferidas na VPS: CNES
  636.342 / 497.614 ativos / 484.978 analisáveis; escolas 214.192 / 180.540 / 166.062 —
  idênticas ao local, com as views, a `escola_cobertura_municipio`, os GRANTs do
  `geo_reader` e a linhagem do `meta.fonte`. Disco da VPS: 3,6 GB → **3,3 GB livres (91%)**.
- Nada foi tocado na aplicação, por instrução explícita. Esta feature é a que toca.
- O Raio-X hoje conta **endereços do CNEFE** (`indicadores.cnefe_equipamento`), não
  estabelecimentos.

**Contexto técnico observado (para o /define):**

| Aspecto | Observação | Implicação |
|---|---|---|
| Tile | tippecanoe → PMTiles, offline. Registry em `pipeline/datasets.yaml:92` (antena) | Uma entrada YAML por camada; sem refactor |
| Hospedagem do tile | repo vizinho `webgis`, `make ship-tiles` → `tiles.averisen.com` | Único alvo que toca a VPS; orçamento de disco apertado |
| Catálogo | `web/src/configuracao/catalogo.ts:118` (antena), Zod em `esquema.ts:137` | Camada de ponto só aceita `cor`, `icone`, `ancoraIcone`, `iconesPodemSobrepor`, `rotuloNoMapa`, `campoDestaque`, `cobertura`, `fonte`, `atributos` |
| Acoplamento id↔arquivo | `web/src/map/tileHost.ts:12` monta `pmtiles://BASE/{id}.pmtiles` | O `id` do catálogo **tem** de ser o `name` do dataset |
| Raio-X | `query/src/geo_query/queries.py:1186` (SQL), `:206` (contrato), `web/src/raiox/blocos.tsx:383` (UI) | O cartão existe e é trocável no lugar |
| Tools | `agent/src/geo_agent/tools.py:1061` (registro), `:486` (handler exemplo) | SQL mora na fachada `queries.py`, não na tool |
| Cobertura declarada | campo `cobertura` do catálogo, `esquema.ts:164`; exemplo em `catalogo.ts:91` | Emenda de 2026-09-03 à regra 8 do ADR-0001: cobertura é dado, não texto em componente |

---

## Discovery Questions & Answers

| # | Pergunta | Resposta do Gui | Impacto |
|---|---|---|---|
| 1 | O Raio-X mostra o cadastro oficial, os dois números, ou fica fora? | **Cadastro oficial substitui o CNEFE** no cartão | O bloco "Educação e saúde" troca de fonte. O número do CNEFE sai da tela |
| 2 | Mapa e cartão leem `_analisavel` ou `_ativo`? | **`_analisavel` nas duas pontas** | Desenhar e contar batem sempre. ~14 mil escolas e ~13 mil unidades ativas ficam fora, e isso vira declaração de cobertura |
| 3 | O que conta como equipamento de saúde? | **Recorte curado por tipo** | Consultório isolado (222.035, 46% do cadastro) sai por padrão. Exige um de-para de `tipo_unidade` que não existe |
| 4 | Quantas camadas no painel? | **Duas camadas, com filtro de classe no painel** | Única decisão que pede mecanismo novo: campo de filtro no `esquema.ts`, checkbox no `LayerPanel`, `setFilter` no `MapView` |
| 5 | De onde sai o de-para de `tipo_unidade`? | **Dicionário oficial do DATASUS**, gravado versionado no `servidor-dados-gis` | Procedência auditável; serve a qualquer consumidor futuro, não só a esta tela |
| 6 | O agente entra? | **Sim — tool nova para os dois cadastros** | Sem ela o agente responderia com CNEFE enquanto a tela mostra CNES/Inep |

---

## Sample Data Inventory

O dado **é** o ground truth, e foi amostrado nesta sessão contra o banco, não suposto.

| Tipo | Local | Contagem | Notas |
|---|---|---:|---|
| Cadastro de saúde | `infraestrutura.estabelecimento_saude_analisavel` (local + VPS) | 484.978 | 21 colunas; `tipo_unidade` é inteiro **sem rótulo** |
| Cadastro de escolas | `infraestrutura.escola_analisavel` (local + VPS) | 166.062 | 35 colunas; 7 campos `oferece_*` booleanos |
| Cobertura por município | `infraestrutura.escola_cobertura_municipio` | — | `escolas_ativas / ativas_com_ponto / ativas_analisaveis`. **Não há equivalente para o CNES** |
| Padrão de tile | `pipeline/datasets.yaml:92-111` (antena) | 1 | Camada de ponto ponta a ponta |
| Padrão de tool | `agent/src/geo_agent/tools.py:253,486` (zoneamento) | 1 | Args + handler + registro |
| Contrato do cartão atual | `query/src/geo_query/queries.py:1186-1223` | 1 | A consulta que será substituída |

### Composição do CNES analisável, medida em 2026-09-19

| tipo | o que é (conferido nos `nome_fantasia`) | linhas |
|---:|---|---:|
| 22 | consultório isolado — dentista, médico particular | 222.035 |
| 36 | clínica / centro de especialidade (mistura APAE com consultório) | 90.874 |
| 2 | UBS, PSF, centro de saúde | 42.457 |
| 39 | laboratório e apoio diagnóstico | 31.175 |
| 43 | farmácia | 29.739 |
| 4 | policlínica | 12.475 |
| 1 | posto de saúde | 6.513 |
| 5 | hospital | 5.405 |

`ambulatorial_sus`: 93.809 verdadeiro, 391.169 falso.

**É o achado que reorientou a feature.** Um cartão dizendo "47 unidades de saúde nesta
área" onde 30 são consultórios de dentista não descreve infraestrutura — descreve mercado.

### Composição das escolas analisáveis

| `dependencia_administrativa` | linhas |
|---:|---:|
| 1 (federal) | 694 |
| 2 (estadual) | 27.944 |
| 3 (municipal) | 97.051 |
| 4 (privada) | 40.373 |

Oferta: creche 72.429 · pré-escola 89.423 · fundamental I 91.125 · fundamental II 56.776 ·
médio 28.758 · EJA 26.422 · profissional 15.817. Os códigos de dependência e de
localização são `smallint` sem rótulo — **mesmo problema do `tipo_unidade`, em escala menor.**

**Como os samples serão usados:** as contagens acima viram os números de aceite do
`/define`; a amostragem de `nome_fantasia` por tipo é a evidência que justifica o recorte
curado; o de-para do DATASUS entra como fonte versionada, não como literal no SQL.

---

## Approaches Explored

### Approach A: Duas camadas com filtro de classe declarado no catálogo ⭐ Escolhida

**Descrição:** dois datasets (`escolas`, `saude`), dois `.pmtiles`, duas entradas no
catálogo. A classe (atenção básica / hospital / urgência / apoio diagnóstico / farmácia;
pública / privada) vira **atributo no tile** e **filtro declarado no catálogo**, renderizado
como sub-caixas no `LayerPanel` e aplicado via `setFilter` no MapView.

**Prós:**
- É o que um analista quer: ver só hospitais, ou só escola pública, sem recarregar nada.
- Dois tiles, não oito — o orçamento de disco da VPS (3,3 GB) não sente.
- O filtro é cliente-side sobre o tile; nenhuma consulta nova ao banco.
- O campo novo no `esquema.ts` é genérico: serve a qualquer camada categórica futura.

**Contras:**
- **É mecanismo novo em três lugares** (`esquema.ts`, `LayerPanel`, `MapView`) — o maior
  risco da feature, e o que pode estourar o prazo.
- O snapshot de `layers.test.ts.snap` e o `grupos.test.ts:19` vão quebrar.

**Por que foi escolhida:** o Gui escolheu de olho no custo declarado. As outras duas
resolvem o mapa e empurram o problema: sem filtro, ou o painel ganha 8 entradas, ou o
usuário perde a única pergunta que ele de fato faz ("onde estão os hospitais?").

---

### Approach B: Duas camadas, classe só no popup

**Descrição:** o padrão exato da antena. Classe aparece ao clicar no ponto.

**Prós:** zero mecanismo novo; entrega em uma fração do tempo.
**Contras:** não dá para isolar hospitais; o mapa em zoom de cidade continua uma mancha
de 485 mil pontos, com ou sem curadoria.

---

### Approach C: Uma camada por classe

**Descrição:** 6–8 entradas no painel, uma por classe, cada uma seu `.pmtiles`.

**Prós:** filtro "de graça", usando só mecanismo existente.
**Contras:** 8 datasets no pipeline e 8 linhas no painel que já tem lista própria; e o
recorte vira estrutura congelada — mudar de ideia sobre uma classe é mexer no pipeline.

---

## Selected Approach

| Attribute | Value |
|---|---|
| **Chosen** | Approach A |
| **User Confirmation** | 2026-09-19, nesta sessão |
| **Reasoning** | Melhor experiência, custo de mecanismo aceito de olhos abertos |

---

## Key Decisions Made

| # | Decisão | Razão | Alternativa rejeitada |
|---|---|---|---|
| 1 | O cartão do Raio-X passa a contar estabelecimento CNES e escola Inep; o CNEFE sai da tela | Uma grandeza só, com nome e fonte corretos. "12 escolas" é o que o usuário entende | Mostrar os dois lado a lado — pede do usuário uma distinção conceitual que ele não tem motivo para ter |
| 2 | Mapa e cartão leem as views `_analisavel` | Desenhar e contar têm de bater. Cartão dizendo 12 com 10 pontos no mapa já gerou reclamação antes | `_ativo` no cartão e `_analisavel` no mapa |
| 3 | Consultório isolado fora do recorte por padrão | 46% do cadastro; sua presença destrói o significado do número | Publicar os 484.978 e deixar o usuário filtrar — só muda a decisão de lugar |
| 4 | Duas camadas com filtro de classe | Ver só hospitais é a pergunta real | Uma camada por classe (8 entradas no painel) |
| 5 | O de-para de `tipo_unidade` sai do dicionário oficial do DATASUS e mora no `servidor-dados-gis` | Procedência auditável, e serve a qualquer consumidor — não só a esta tela | Inventar rótulos a partir dos nomes dos estabelecimentos |
| 6 | Tool `equipamentos_no_ponto` nova, SQL na fachada `queries.py` | Sem ela, agente e tela dão números diferentes na mesma sessão | Deixar o agente herdar só via `obter_raio_x` |
| 7 | A diferença analisável↔ativo vira `cobertura` declarada no catálogo | Emenda de 2026-09-03 à regra 8 do ADR-0001: cobertura é dado | Texto solto num componente |

---

## Features Removed (YAGNI)

| Sugestão | Razão da remoção | Dá para voltar? |
|---|---|---|
| Comparação territorial CNES × CNEFE (AT-008/AT-009 das cargas) | Só faz sentido com tela que mostre a diferença; não é pré-requisito de nada aqui | Sim |
| Trocar a fonte de `h3_no_ponto` (temas `equipamentos`) para os cadastros oficiais | O H3 é grade pré-calculada; refazer a agregação é feature própria, com sua própria carga | Sim — e provavelmente deve |
| Tornar as camadas de ponto destacáveis pelo Raio-X (`campoDestaque` / `highlight.ts`) | Hoje nenhuma camada de ponto é destacável; abrir essa porta é escopo próprio | Sim |
| Filtro por oferta de ensino (creche, médio, EJA…) | 7 booleanos viram 7 filtros; a dependência administrativa já responde a pergunta mais comum | Sim, é só mais um filtro no mesmo mecanismo |
| Cartão do Raio-X quebrado por classe (hospitais vs. UBS separados) | O cartão tem dois números hoje; multiplicá-los antes de ver o uso é adivinhação | Sim |
| Rótulo de `localizacao` e `categoria_escola_privada` no popup | Códigos sem de-para; cada de-para é trabalho de fonte. Começar por `dependencia_administrativa` | Sim |

---

## Incremental Validations

| Seção | Apresentada | Retorno do Gui | Ajustada? |
|---|---|---|---|
| Conflito CNEFE × cadastro oficial no Raio-X | ✅ com mockup do cartão | Escolheu substituir | Não |
| Qual view alimenta mapa e cartão | ✅ com os números dos dois cortes | Escolheu `_analisavel` nas duas | Não |
| Composição real do CNES (achado dos 46% de consultório) | ✅ com tabela medida no banco | Escolheu recorte curado | **Sim — reorientou a feature** |
| Granularidade do painel | ✅ com mockup das três opções e o custo de cada uma | Escolheu a que exige mecanismo novo | Não, custo aceito |
| Origem do de-para e escopo do agente | ✅ | Dicionário oficial; tool entra | Não |

---

## Suggested Requirements for /define

### Problem Statement (rascunho)

O produto descreve ensino e saúde de uma área contando **endereços classificados** do
CNEFE, porque era o que existia. O cadastro oficial — que identifica a escola e o
estabelecimento pelo nome, pelo tipo e pelo código — está persistido e replicado desde
2026-09-18 e não aparece em lugar nenhum da aplicação.

### Target Users (rascunho)

| Usuário | Dor |
|---|---|
| Analista que desenha uma área no mapa | Sabe quantos endereços de ensino existem, não quais escolas nem de que rede |
| Cliente que avalia um ponto comercial | "4 equipamentos de saúde" não diz se é hospital ou consultório de dentista |
| Quem conversa com o agente | Recebe número de endereço enquanto a tela mostra estabelecimento |

### Success Criteria (rascunho)

- [ ] As camadas `escolas` e `saude` existem no painel, apagadas por padrão, com `fonte` e `cobertura` declaradas
- [ ] O filtro de classe liga e desliga subconjuntos sem recarregar o tile
- [ ] O cartão "Educação e saúde" do Raio-X conta escola Inep e estabelecimento CNES
- [ ] O número do cartão é igual ao número de pontos visíveis na área desenhada
- [ ] Consultório isolado não entra em nenhuma das duas superfícies
- [ ] O de-para de `tipo_unidade` está versionado no `servidor-dados-gis` com a URL da fonte
- [ ] `equipamentos_no_ponto` responde pelos dois cadastros, com SQL na fachada
- [ ] O tile publicado cabe no orçamento de disco da VPS, medido antes e depois

### Constraints Identified

- **Disco da VPS:** 3,3 GB livres de 38 GB (91%), medido em 2026-09-19 depois de publicar
  as réplicas. A série é 6,8 GB (07/09) → 4,2 GB (12/09) → 3,3 GB (19/09). O `ship-tiles`
  é incremental mas cumulativo.
- O `id` da camada no catálogo é o nome do arquivo `.pmtiles`. Escolher errado é renomear
  em dois repositórios.
- Camada de ponto não aceita `opacidadePreenchimento`, `tracejado`, `faixaCentral` nem
  `larguraLinha` — o `superRefine` do `esquema.ts:208` rejeita.
- `escola_cobertura_municipio` existe; o CNES não tem equivalente. A declaração de
  cobertura do CNES precisa ser medida.
- Cliente 2 (`eb-prime.ts:105`) tem recorte próprio de camadas — ver as camadas novas é
  decisão de cliente, não default.
- Divergência já existente, a resolver de passagem: `tools.py:22` não lista
  `h3_equipamentos` no `Literal`, mas `tools.py:717` devolve esse valor.

### Out of Scope (confirmado)

- Trocar a fonte do tema `equipamentos` do H3
- Comparação CNES × CNEFE
- Destaque de camada de ponto pelo Raio-X
- Filtros por oferta de ensino
- Qualquer alteração nas cargas do `servidor-dados-gis` além do de-para novo

---

## Session Summary

| Métrica | Valor |
|---|---|
| Perguntas feitas | 6 |
| Abordagens exploradas | 3 |
| Features removidas (YAGNI) | 6 |
| Validações completadas | 5 |
| Duração | uma sessão, 2026-09-19 |

---

## Next Step

**Ready for:** `/define .claude/sdd/features/BRAINSTORM_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md`
