# DEFINE: AGENTE_IA

> Chat com agente de IA (OpenAI + function calling) que responde perguntas sobre o Censo 2022
> em linguagem natural e pinta os resultados no mapa — primeiro componente server-side do projeto.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | AGENTE_IA |
| **Date** | 2026-07-08 |
| **Author** | define-agent (a partir de BRAINSTORM_AGENTE_IA.md, sessão refeita de 2026-07-04) |
| **Status** | ✅ Shipped (2026-07-08) |
| **Clarity Score** | 14/15 |

---

## Problem Statement

Explorar o mapa do Geo Intelligence é puramente visual: para responder qualquer pergunta
analítica sobre o Censo 2022 ("quais os municípios mais densos do Paraná?") é preciso conhecer
o schema dos parquets e escrever consultas à mão. Falta perguntar em linguagem natural e ver a
resposta **ancorada nos dados** e **refletida no próprio mapa**.

---

## Target Users

| User | Role | Pain Point |
|------|------|------------|
| Guilherme Ramos | Analista geo / dono do projeto (solo) | Responder perguntas analíticas exige schema + SQL; quer perguntar em pt-BR e ver o mapa reagir |
| (secundário) Colegas de trabalho | Replicação do padrão no ambiente corporativo | Precisam de um padrão portável (sem Docker, sem framework pesado) para reproduzir com Copilot/ArcGIS |

---

## Goals

| Priority | Goal |
|----------|------|
| **MUST** | Chat no front que envia pergunta + contexto do mapa (viewport + camada ativa) e recebe resposta estruturada `{resposta, destaques{camada, codigos[]}, dados?}` |
| **MUST** | Backend `agent/` (FastAPI + SDK `openai` puro + Pydantic) com loop de tool-calling explícito sobre tools curadas = wrappers do `GeoQuery` |
| **MUST** | Toda resposta quantitativa vem de tool call (zero número de memória do LLM); fora de escopo → recusa explicando o que o agente sabe responder |
| **MUST** | Mapa pinta os destaques retornados (municípios/setores por código) reusando o mecanismo de seleção existente |
| **MUST** | Resolução nome→código: "população de Curitiba" funciona sem o usuário saber o código IBGE (hoje `GeoQuery.municipio()` só aceita `cd_mun`) |
| **MUST** | Histórico multi-turno em memória por sessão do navegador (perguntas de acompanhamento funcionam; some no refresh) |
| **SHOULD** | Busca espacial pelo ponto central do viewport ("setores por aqui") — hoje `setores_proximos` só parte de um `cd_setor` |
| **SHOULD** | Alvo `make` único que sobe front + backend do agente para dev local |
| **COULD** | Tool de descoberta (`metricas()`) exposta ao usuário ("o que você sabe consultar?") com nomes traduzidos |

---

## Success Criteria

- [ ] Mini-benchmark de 16 perguntas (seção abaixo) passa com **≥ 90%** (14/16): tool correta + argumentos corretos + destaques com os códigos esperados
- [ ] **100%** das respostas quantitativas rastreáveis a uma tool call (verificável no log de execução do benchmark)
- [ ] **0** números inventados nas perguntas de recusa do benchmark (BM-14 a BM-16)
- [ ] Pergunta de ranking pinta exatamente os N municípios retornados pela tool (validação visual + códigos no payload)
- [ ] Resposta completa (sem streaming) em **< 15 s** para as perguntas do benchmark, rodando local
- [ ] Um comando (`make dev` ou alvo novo) sobe front + backend; chave OpenAI só via `.env` (nunca no repo)
- [ ] `uv run pytest` e `uv run ruff check .` verdes em `agent/` (e em `query/` se estendido)

---

## Acceptance Tests

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AT-001 | Ranking (happy path) | Backend no ar, parquets em `data/processed/` | Usuário pergunta "top 10 municípios do Paraná por população" | Resposta lista os 10 com valores vindos de `ranking_municipios("pop_total", uf="Paraná", n=10)`; mapa pinta os 10 municípios |
| AT-002 | Nome→código | Idem | "Qual a população de Curitiba?" | Agente resolve o nome para `cd_mun`, chama `municipio()`, responde o valor e pinta Curitiba |
| AT-003 | Espacial aproximado | Setor válido conhecido | "Setores num raio de 2 km do setor {cd}" | Pinta os setores retornados por `setores_proximos` e **menciona** que a distância é aproximada (centroide) |
| AT-004 | Multi-turno | AT-003 acabou de acontecer | "E num raio de 5 km?" | Agente reusa o setor de referência do histórico e refaz a consulta com `raio_km=5` |
| AT-005 | Recusa fundamentada | Pergunta fora dos dados ("PIB de Fortaleza") | Usuário envia a pergunta | Sem tool call quantitativa; resposta explica que PIB não está no Censo 2022 e lista exemplos do que sabe responder; nenhum número inventado |
| AT-006 | Contexto do mapa | Mapa centrado em Curitiba, camada setores ativa | "O que estou vendo?" | Resposta usa viewport + camada ativa recebidos no request (sem tool de dados obrigatória) |
| AT-007 | Erro de tool | Pergunta com métrica inexistente ("municípios por renda média") | Tool levanta `ValueError` de métrica inválida | Agente recebe o erro, explica que a métrica não existe e oferece as válidas (via `metricas()`); não quebra o chat |
| AT-008 | Parquets ausentes | `data/processed/` vazio | Backend inicia | Erro claro instruindo a rodar o pipeline (comportamento herdado de `db.connect()`), não um stack trace opaco no chat |

---

## Mini-Benchmark (16 perguntas — few-shots + regressão)

> Gerado nesta fase conforme decidido no brainstorm (Q4). O esperado é expresso como
> **comportamento verificável** (tool + argumentos + destaques), não como valores numéricos —
> o ground truth dos valores é o próprio `GeoQuery` (já coberto por `query/tests/`).
> Métricas citadas existem nos parquets: `pop_total`, `domicilios_total`, `domicilios_ocupados`,
> `media_moradores`, `area_km2`, `pop_masculino`, `pop_feminino`, `cor_*`,
> `densidade_hab_km2`, `pct_agua_rede`, `pct_esgoto_rede`, `pct_lixo_coletado`.

### Ranking / agregação

| ID | Pergunta | Comportamento esperado |
|----|----------|------------------------|
| BM-01 | "Quais os 10 municípios mais populosos do Brasil?" | `ranking_municipios("pop_total", n=10)`; pinta os 10 na camada município |
| BM-02 | "Top 5 municípios do Paraná por densidade populacional" | `ranking_municipios("densidade_hab_km2", uf="Paraná", n=5)`; pinta os 5 |
| BM-03 | "Quais os 5 municípios com pior cobertura de esgoto em Pernambuco?" | `ranking_municipios("pct_esgoto_rede", uf="Pernambuco", n=5, ordem="asc")`; pinta os 5 |
| BM-04 | "Onde a média de moradores por domicílio é mais alta? Me dá os 10 primeiros" | `ranking_municipios("media_moradores", n=10)`; pinta os 10 |
| BM-05 | "Top 3 municípios de SP por população" (UF como sigla) | Normaliza "SP"→"São Paulo" e chama `ranking_municipios("pop_total", uf="São Paulo", n=3)` |

### Lookup (município / setor)

| ID | Pergunta | Comportamento esperado |
|----|----------|------------------------|
| BM-06 | "Qual a população de Curitiba?" | Resolve nome→`cd_mun` (4106902), `municipio()`; responde `pop_total` e pinta Curitiba |
| BM-07 | "Quantos domicílios ocupados tem o município 3550308?" | `municipio("3550308")`; responde `domicilios_ocupados` e pinta São Paulo |
| BM-08 | "Qual a proporção de mulheres na população de Salvador?" | `municipio()` de Salvador; calcula `pop_feminino/pop_total` **a partir dos valores da tool** (aritmética sobre valores retornados é permitida) |
| BM-09 | "Me mostra os dados do setor {cd_setor válido}" | `setor(cd)`; responde atributos principais e pinta o setor |

### Espacial (aproximado)

| ID | Pergunta | Comportamento esperado |
|----|----------|------------------------|
| BM-10 | "Quais setores estão num raio de 2 km do setor {cd}?" | `setores_proximos(cd, raio_km=2)`; pinta setores; **menciona aproximação por centroide** |
| BM-11 | (após BM-10) "E num raio de 5 km?" | Reusa o `cd_setor` do histórico; `setores_proximos(cd, raio_km=5)` |

### Contexto do mapa / descoberta

| ID | Pergunta | Comportamento esperado |
|----|----------|------------------------|
| BM-12 | (mapa em Curitiba, camada setores ativa) "O que estou vendo agora?" | Responde com camada ativa + região do viewport enviados no request |
| BM-13 | "Quais métricas você consegue consultar?" | `metricas()`; lista traduzida/explicada em pt-BR |

### Recusa / grounding

| ID | Pergunta | Comportamento esperado |
|----|----------|------------------------|
| BM-14 | "Qual o PIB de Fortaleza?" | Recusa: PIB não está no Censo 2022; oferece o que sabe (população, domicílios, saneamento…); **zero números** |
| BM-15 | "Vai chover em Recife amanhã?" | Recusa: fora do domínio; explica o escopo do agente |
| BM-16 | "Qual era a população do Brasil em 2010?" | Esclarece que os dados são do **Censo 2022**; opcionalmente oferece o valor de 2022 via tool; não responde 2010 de memória |

**Uso:** os 16 pares viram (a) few-shots selecionados no system prompt e (b) suíte de regressão
executável (`agent/tests/` ou script de benchmark) que valida tool + argumentos + destaques.

---

## Out of Scope

- **Deploy na VPS** (Hetzner/Caddy) — fase 2.1 dedicada; MVP roda 100% local
- **Streaming token-a-token (SSE)** — request→resposta completa
- **Memória persistente de conversas** — sessão em memória, some no refresh
- **Roteamento de modelos** (barato/caro) — um modelo só
- **Agente controlando o mapa** (zoom/pan/toggle de camadas) — só pinta destaques
- **Text-to-SQL livre** — pode entrar depois como tool guardada (`consulta_sql_avancada`), não como fundação
- **Framework de agente** (Pydantic-AI/Agno/LangGraph) — decisão do brainstorm: SDK puro

---

## Constraints

| Type | Constraint | Impact |
|------|------------|--------|
| Technical | LLM = OpenAI, default **`gpt-5-mini`**, configurável via `.env` (`OPENAI_MODEL`); chave via `.env`, nunca no repo | Integração via SDK `openai` + function calling; upgrade p/ `gpt-5.1` é troca de env var |
| Technical | Python 3.11+ com **uv**; type hints obrigatórios; Ruff + pytest | `agent/` nasce como projeto uv, mesmo padrão de `query/` |
| Technical | `agent/` depende de `query/`, que exige os parquets em `data/processed/` | Setup local pressupõe pipeline `census`/`census-municipio` já rodado |
| Technical | Espacial é **aproximado** (centroide × 111 km), herdado do `query/` | Resposta deve comunicar a ressalva quando relevante (AT-003/BM-10) |
| Technical | Geometria exata vive nos PMTiles; backend devolve **códigos**, o mapa pinta | Contrato `destaques{camada, codigos[]}`; front resolve códigos→features |
| Technical | Filtro de UF no `GeoQuery` usa `nm_uf` por extenso ("São Paulo") | Agente/tool normaliza siglas (BM-05) |
| Product | Chat responde em **português-BR** | System prompt e mensagens de erro em pt-BR |
| Product | Padrão portável para o trabalho (Windows/Copilot/sem Docker) | Nada de dependência exótica; `agent/` e `query/` rodam nativos com uv |

---

## Technical Context

| Aspect | Value | Notes |
|--------|-------|-------|
| **Deployment Location** | Novo projeto `agent/` (uv) na raiz; painel de chat em `web/src/` | `agent/` importa `query/` como dependência local; front reusa o mecanismo de `web/src/map/selection.ts` |
| **KB Domains** | `maplibre`, `pmtiles-tippecanoe`, `geospatial-etl` | Padrões de camadas/seleção e ETL já destilados em `.claude/kb/` |
| **IaC Impact** | None (MVP local) | Possível serviço novo no `docker-compose` para dev — decidir no design; deploy VPS fica p/ fase 2.1 |

**Extensões previstas em `query/`** (pequenas, dentro do escopo desta feature):
busca de município por nome (`nm_mun` + UF) e, como SHOULD, busca espacial por ponto
(lon/lat do centro do viewport) — ambas seguem o padrão anti-injection existente.

---

## Assumptions

| ID | Assumption | If Wrong, Impact | Validated? |
|----|------------|------------------|------------|
| A-001 | É viável pintar municípios/setores **por código** nas camadas PMTiles existentes (as propriedades `cd_mun`/`cd_setor` estão nos tiles e um filtro/highlight por lista de códigos funciona) | Precisaria de endpoint devolvendo geometrias/bboxes ou de re-tilagem com propriedades extras — muda o contrato `destaques` | [ ] validar no /design |
| A-002 | `gpt-5-mini` dá conta do tool calling com ~5–7 tools e argumentos tipados | Trocar default p/ `gpt-5.1` via `.env` (decisão já tomada: modelo é configurável) | [ ] benchmark valida |
| A-003 | `nm_uf` nos parquets vem por extenso e a normalização sigla→nome resolve o filtro de UF | Ajustar normalização ou adicionar coluna de sigla no pipeline | [ ] checar 1 query |
| A-004 | Parquets canônicos existem localmente (pipeline `census` + `census-municipio` já rodados) | Rodar pipeline antes; erro claro já existe em `db.connect()` | [x] (Fase 2 já os usa) |
| A-005 | Sessão em memória no backend (dict por id de sessão) basta para multi-turno do MVP | Precisaria de store externo — só se houver múltiplos workers, o que não é o caso local | [ ] |

---

## Clarity Score Breakdown

| Element | Score (0-3) | Notes |
|---------|-------------|-------|
| Problem | 3 | Dor específica, usuário identificado, impacto claro |
| Users | 3 | Persona primária real (projeto solo) + secundária (portabilidade p/ trabalho) |
| Goals | 3 | MUST/SHOULD/COULD com decisões do brainstorm incorporadas; lacuna nome→código identificada e promovida a MUST |
| Success | 2 | Critérios numéricos e testáveis; benchmark gerado nesta fase, mas os 16 pares ainda dependem de validação do usuário no review deste documento |
| Scope | 3 | YAGNI do brainstorm confirmado; extensões de `query/` explicitamente dentro do escopo |
| **Total** | **14/15** | |

---

## Open Questions

Nenhuma bloqueante para o /design. Decisões que **pertencem ao design** (não a requisitos):

1. Mecanismo exato de pintura por código no front (filtro nas camadas vetoriais vs. reuso direto de `selection.ts`) — resolve A-001.
2. Forma da resolução nome→código: novo método no `GeoQuery` (preferido, testável) vs. tabela de lookup no `agent/`.
3. Incluir ou não a busca espacial por ponto do viewport (SHOULD) no primeiro corte.

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-08 | define-agent | Versão inicial a partir do BRAINSTORM_AGENTE_IA (sessão refeita); modelo default `gpt-5-mini` decidido com o usuário; mini-benchmark de 16 perguntas gerado |
| 1.1 | 2026-07-08 | ship-agent | Shipped e arquivado (benchmark 16/16; E2E validado no browser) |

---

## Next Step

**Ready for:** `/design .claude/sdd/features/DEFINE_AGENTE_IA.md`
