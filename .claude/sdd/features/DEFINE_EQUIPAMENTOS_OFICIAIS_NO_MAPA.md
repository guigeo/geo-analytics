# DEFINE: EQUIPAMENTOS_OFICIAIS_NO_MAPA

> Levar o cadastro oficial de escolas (Inep) e estabelecimentos de saúde (CNES) — já
> persistido e replicado — ao mapa, ao Raio-X e ao agente, com recorte curado do que conta
> como equipamento.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | EQUIPAMENTOS_OFICIAIS_NO_MAPA |
| **Date** | 2026-09-19 |
| **Author** | Claude Opus 5 (sessão com o Gui) |
| **Status** | Aceite visual cumprido — falta publicar |
| **Clarity Score** | 14/15 |
| **Origem** | [`BRAINSTORM_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md`](BRAINSTORM_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md) |

---

## Problem Statement

O produto descreve ensino e saúde de uma área contando **endereços classificados** do
CNEFE, porque era o que existia quando o Raio-X foi feito. O cadastro oficial — que
identifica a escola e o estabelecimento pelo nome, pelo tipo e pelo código — está
persistido no `geodata` desde 2026-09-18 e replicado na VPS desde 2026-09-19, e não aparece
em lugar nenhum da aplicação: sem camada, sem tile, sem tool, sem cartão.

O impacto não é só cobertura. O usuário que desenha uma área lê "19 endereços de ensino" e
não sabe quais escolas são, de que rede, nem se a unidade de saúde ao lado é um hospital ou
o consultório de um dentista.

---

## Target Users

| Usuário | Papel | Dor |
|---|---|---|
| Analista de território | Desenha áreas no mapa e lê o Raio-X | Sabe quantos endereços de ensino existem; não sabe quais escolas, nem de que rede |
| Cliente avaliando um ponto | Consumidor do relatório de área | "4 equipamentos de saúde" não distingue hospital de consultório particular |
| Usuário do chat | Conversa com o agente sobre a área | Recebe contagem de endereço do CNEFE enquanto a tela mostra estabelecimento — dois números divergentes na mesma sessão |

---

## Goals

| Prioridade | Objetivo |
|---|---|
| **MUST** | Duas camadas de ponto — `escolas` e `saude` — no painel dos dois clientes, apagadas por padrão, com `fonte` e `cobertura` declaradas |
| **MUST** | Recorte curado: consultório isolado não aparece em nenhuma superfície |
| **MUST** | O de-para de `tipo_unidade` existe como dado versionado, com procedência do DATASUS |
| **MUST** | O cartão "Educação e saúde" do Raio-X passa a contar escola Inep e estabelecimento CNES de assistência |
| **MUST** | Filtro de classe no painel liga e desliga subconjuntos sem recarregar o tile |
| **SHOULD** | Tool `equipamentos_no_ponto` responde pelos dois cadastros, com SQL na fachada |
| **COULD** | Fechar a divergência do `Literal` de camada em `tools.py:22` × `schemas.py:30` |

O **COULD** é dívida encontrada de passagem, não pedido desta feature. Cai primeiro.

---

## Success Criteria

- [x] `escolas` e `saude` aparecem no `LayerPanel` dos dois clientes, apagadas por padrão
- [x] Zero estabelecimentos de `tipo_unidade = 22` no parquet/tile local de saúde (236.187 feições; consultório = 0) — publicação na VPS espera aceite visual
- [x] O de-para cobre os códigos de `tipo_unidade` presentes no dado analisável — nenhum cai em "outros" por omissão
- [x] Com os filtros no estado inicial, o número do cartão de saúde é **igual** à contagem de pontos visíveis na área desenhada
- [x] O cartão de ensino é igual à contagem de pontos da camada `escolas` na mesma área
- [x] O `cobertura` de cada camada declara em número o que ficou fora (48.130 escolas e 151.364 estabelecimentos entre publicado e analisável)
- [ ] O tile de cada camada é publicado com medição de disco da VPS **antes e depois**; a publicação aborta se o espaço livre cair abaixo de 2 GB — espera aceite visual
- [x] `equipamentos_no_ponto` devolve os dois cadastros e o agente cita nome de escola e de estabelecimento, não contagem de endereço

---

## Acceptance Tests

| ID | Cenário | Dado | Quando | Então |
|---|---|---|---|---|
| AT-001 | Camada aparece e desenha | Aplicação carregada no cliente 1 | O usuário liga "Escolas" no painel | Pontos aparecem no mapa; o painel mostra "Inep · Censo Escolar 2025" e a cobertura declarada |
| AT-002 | Camada no cliente 2 | Aplicação carregada no EB Prime | O usuário abre o painel | "Escolas" e "Estabelecimentos de saúde" estão listadas e apagadas |
| AT-003 | Consultório isolado não existe | Tile de saúde publicado | Consulta-se o `.pmtiles` por `classe` | Nenhuma feature com classe "consultório isolado"; contagem total ≤ 262.943 |
| AT-004 | Filtro de classe | Camada "Estabelecimentos de saúde" ligada | O usuário desmarca "Hospital" | Os pontos de hospital somem sem nova requisição de rede e sem recarregar o tile |
| AT-005 | Estado inicial coerente | Nenhum filtro tocado | O usuário desenha uma área e abre o Raio-X | O número do cartão de saúde é igual ao de pontos visíveis dentro do desenho |
| AT-006 | Recorte do cartão nomeado | Raio-X aberto | O usuário lê o cartão de saúde | O cartão declara que conta assistência, e que farmácia e apoio diagnóstico ficam fora |
| AT-007 | Cartão troca de fonte | Área com dado CNEFE e CNES | Compara-se o cartão antes e depois | O rótulo de procedência muda para "CNES · DATASUS" e "Inep · Censo Escolar 2025"; nenhum número do CNEFE permanece na tela |
| AT-008 | Área sem equipamento | Área desenhada num vazio urbano | O Raio-X calcula | Cartão mostra zero real, distinto de "sem cobertura" — o cadastro é nacional, então zero é zero |
| AT-009 | Ponto de qualidade duvidosa | Escola ativa com geocódigo de desvio > 800 m | Ela é procurada no mapa e no cartão | Não aparece em nenhum dos dois; a diferença está declarada em `cobertura` |
| AT-010 | De-para completo | Carga do de-para executada | Comparam-se os códigos do de-para com os do dado | Os 39 códigos presentes têm rótulo e classe; um código novo numa safra futura falha ruidosamente, não vira "outros" em silêncio |
| AT-011 | Tool responde | Agente com a tool registrada | "Quais escolas existem nesta área?" | Devolve nomes de escolas do Inep com rede, não contagem de endereços |
| AT-012 | Disco da VPS | Tiles prontos para publicar | Roda-se o `ship-tiles` | Espaço livre medido antes e depois; aborta se ficar abaixo de 2 GB |
| AT-013 | Testes existentes | Suíte verde antes | Build concluído | `layers.test.ts.snap` regenerado com intenção, `grupos.test.ts:19` atualizado, `blocos.test.tsx` e `test_contrato_raio_x.py` cobrindo a fonte nova |

---

## Out of Scope

- Trocar a fonte do tema `equipamentos` do `h3_no_ponto` — a grade H3 é pré-calculada; refazer a agregação é feature própria
- Comparação territorial CNES × CNEFE (AT-008/AT-009 das cargas de 18/09)
- Tornar camada de ponto destacável pelo Raio-X (`campoDestaque`, `highlight.ts`) — hoje nenhuma é
- Filtros por oferta de ensino (creche, médio, EJA…) — a dependência administrativa responde a pergunta mais comum
- Quebrar o cartão do Raio-X por classe
- De-para de `localizacao` e `categoria_escola_privada`
- Qualquer alteração nas cargas do `servidor-dados-gis` além do de-para novo
- Publicar novamente as réplicas — já foram, em 2026-09-19

---

## Constraints

| Tipo | Restrição | Impacto no desenho |
|---|---|---|
| Recurso | **Disco da VPS: 3,3 GB livres de 38 GB (91%)**, medido em 2026-09-19. Série: 6,8 GB (07/09) → 4,2 GB (12/09) → 3,3 GB (19/09) | O `ship-tiles` é incremental mas cumulativo. O recorte curado ajuda: exclui 222.035 pontos antes do tippecanoe |
| Técnica | O `id` da camada no catálogo é o nome do arquivo `.pmtiles` (`web/src/map/tileHost.ts:12`) | Escolher errado é renomear em dois repositórios |
| Técnica | Camada de ponto rejeita `opacidadePreenchimento`, `tracejado`, `faixaCentral`, `larguraLinha` (`esquema.ts:208`) | O estilo disponível é `cor`, `icone`, `ancoraIcone`, `iconesPodemSobrepor`, `rotuloNoMapa` |
| Técnica | Não existe campo de filtro no `esquema.ts` | Mecanismo novo em três arquivos — o maior risco da feature |
| Dados | `tipo_unidade` é inteiro sem rótulo; nenhuma tabela de domínio no `geodata` | O de-para é pré-requisito, não detalhe |
| Dados | `escola_cobertura_municipio` existe; **o CNES não tem equivalente** | A declaração de cobertura do CNES precisa ser medida |
| Processo | Aceite visual antes de produção (`AGENTS.md`, regra de 2026-09-03) | Ship só depois de o Gui ver a tela |
| Processo | Decisão que cruza repositório vira commit no ADR-0001 do `webgis` | O de-para mora no `servidor-dados-gis`; o consumo, aqui |

---

## Technical Context

| Aspecto | Valor | Notas |
|---|---|---|
| **Deployment Location** | `pipeline/datasets.yaml`, `web/src/configuracao/`, `web/src/map/`, `web/src/panels/`, `query/src/geo_query/queries.py`, `agent/src/geo_agent/tools.py` — e `metodologia/cnes/` no `servidor-dados-gis` | Dois repositórios: o de-para é do dono do dado, o consumo é do produto |
| **KB Domains** | `pmtiles-tippecanoe`, `maplibre`, `geospatial-etl`, `agentes-llm` | Os quatro se aplicam; `maplibre` é o que cobre `setFilter` |
| **IaC Impact** | Nenhum recurso novo. Publicação de tile via `webgis` → `make ship-tiles` | Único alvo que toca a VPS |

**Padrões a seguir, já mapeados:**

| Peça | Precedente |
|---|---|
| Entrada de tile | `pipeline/datasets.yaml:92-111` (antena) |
| Camada de ponto no catálogo | `web/src/configuracao/catalogo.ts:118-133` (antena) |
| Declaração de cobertura | `web/src/configuracao/catalogo.ts:91-92` (bairro) |
| Consulta do Raio-X | `query/src/geo_query/queries.py:1186-1223` |
| Contrato do bloco | `query/src/geo_query/queries.py:206-240` |
| Tool com PostGIS | `agent/src/geo_agent/tools.py:253` (args), `:486` (handler), `:1061` (registro) |

---

## Assumptions

| ID | Suposição | Se estiver errada | Validada? |
|---|---|---|---|
| A-001 | O dicionário de `TP_UNIDADE` do DATASUS está publicado e acessível | O de-para cai para a opção B do brainstorm (rótulo nosso, revisado pelo Gui) — decisão 5 muda | [ ] |
| A-002 | Um campo de filtro declarativo no `esquema.ts` + `setFilter` no MapView resolve sem tocar a arquitetura de camadas | Se o `SUFIXOS_SUBCAMADA` ou o `highlight.ts` atrapalharem, o custo do filtro cresce e a Approach B do brainstorm volta à mesa | [ ] |
| A-003 | Dois tiles de ponto (~166k + ~263k features) cabem no orçamento de disco da VPS | Publicar só `escolas` nesta rodada, ou reduzir `maxzoom` | [ ] |
| A-004 | O recorte de assistência (o que o cartão conta) é derivável do `tipo_unidade` sozinho | Precisaria de `natureza_organizacao` ou `ambulatorial_sus` no critério, e o SQL do `datasets.yaml` cresce | [ ] |
| A-005 | Zero no cartão é sempre zero real, porque o cadastro é nacional | Se houver município sem cobertura no CNES, o contrato precisa do mesmo tratamento de `cobertura_pct` que o CNEFE tem hoje (`queries.py:1206`) | [ ] |

**A-001 e A-003 são as que valem checar antes do DESIGN** — as duas mudam decisão, não implementação.

---

## Decisões herdadas do BRAINSTORM

| # | Decisão | Refinamento feito aqui |
|---|---|---|
| 1 | Cadastro oficial substitui o CNEFE no cartão | — |
| 2 | Mapa e cartão leem as views `_analisavel` | **Refinada.** O cartão conta só assistência; farmácia e apoio diagnóstico aparecem no mapa mas não na manchete. Para a regra "desenhar e contar batem" sobreviver, as classes de assistência vêm **ligadas** por padrão e farmácia/laboratório vêm **desligadas** — no estado inicial os dois números coincidem, e o cartão nomeia o próprio recorte (AT-005, AT-006) |
| 3 | Consultório isolado fora | — |
| 4 | Duas camadas com filtro de classe | — |
| 5 | De-para do dicionário oficial do DATASUS, versionado no `servidor-dados-gis` | — |
| 6 | Tool `equipamentos_no_ponto`, SQL na fachada | — |
| 7 | A diferença analisável↔ativo vira `cobertura` declarada | Números fixados: 48.130 escolas e 151.364 estabelecimentos |
| 8 | **Novo:** as duas camadas entram nos dois clientes | Apagadas por padrão; tirar do EB Prime é uma linha, se for o caso |

---

## Clarity Score Breakdown

| Elemento | Nota | Por quê |
|---|---|---|
| Problem | 3 | O dado existe, a tela não mostra, e o número que ela mostra é de outra grandeza. Específico e medido |
| Users | 3 | Três perfis com dor distinta, um deles (o do chat) com defeito observável hoje |
| Goals | 3 | Cinco MUST testáveis, um SHOULD, um COULD que é dívida encontrada |
| Success | 3 | Todos com número ou com igualdade verificável |
| Scope | 2 | O fora de escopo é explícito, mas a taxonomia de classes ainda não está fechada — depende do de-para, que é entrega desta feature |
| **Total** | **14/15** | |

---

## Open Questions

**Uma, e ela não bloqueia o DESIGN.**

A **taxonomia de classes** — quais grupos existem e que código cai em cada um — não está
fechada porque depende do de-para oficial, que é a primeira tarefa do build. O DESIGN deve
propor a taxonomia **junto** com o de-para e submetê-la ao Gui antes de virar SQL: é a
decisão de produto da feature, não um detalhe de implementação.

O esboço a partir do que foi medido e conferido por amostragem:

| Classe | Códigos prováveis | Ordem de grandeza | No cartão? |
|---|---|---:|:---:|
| Atenção básica | 1, 2 | ~49.000 | sim |
| Especialidade | 4, 36 | ~103.000 | sim |
| Hospital | 5, 7, 15, 62 | ~8.000 | sim |
| Urgência | 20, 21, 73 | ~2.000 | sim |
| Apoio diagnóstico | 39 | ~31.000 | não |
| Farmácia | 43 | ~30.000 | não |
| *(excluído)* | 22 | 222.035 | — |

Os códigos 2, 5, 22, 36, 39 e 43 foram **conferidos** contra os `nome_fantasia` reais em
2026-09-19. Os demais são leitura provável e é exatamente o que o dicionário oficial vai
confirmar ou corrigir. A classe "Especialidade" é a mais suspeita: a amostra do tipo 36
misturou APAE com consultório particular, e se ela for majoritariamente consultório, entra
na mesma discussão do tipo 22.

---

## Revision History

| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 1.0 | 2026-09-19 | Claude Opus 5 | Versão inicial, a partir do BRAINSTORM |

---

## Next Step

**Ready for:** `/design .claude/sdd/features/DEFINE_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md`
