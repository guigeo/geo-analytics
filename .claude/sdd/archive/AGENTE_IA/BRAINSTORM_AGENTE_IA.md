# BRAINSTORM: AGENTE_IA (Fase 2 — Chat com o mapa)

> Sessão exploratória para clarificar intenção e abordagem antes da captura de requisitos.
> **Refeita em 2026-07-04** a pedido do usuário (a 1ª sessão gerou confusão na escolha de
> arquitetura); esta versão substitui a anterior, com o mecanismo de tool-calling explicado
> e compreendido antes da decisão.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | AGENTE_IA |
| **Date** | 2026-07-04 (sessão refeita) |
| **Author** | brainstorm (Fase 0) |
| **Status** | Ready for Define |

---

## Initial Idea

**Raw Input:** Fase 2 — o usuário navega no mapa e conversa com um agente que entende e
atua sobre o contexto geoespacial.

**Context Gathered:**
- Fase 1 no ar (https://geo-intelligence.averisen.com): mapa MapLibre estático, camadas IBGE/antenas via PMTiles, highlight por clique via fonte GeoJSON (`web/src/map/selection.ts`).
- A camada `query/` já existe (backend de dados do chat, sem LLM): `GeoQuery` sobre DuckDB expõe `metricas()`, `setor()`, `municipio()`, `ranking_municipios()`, `setores_proximos()` sobre os parquets canônicos do Censo 2022 (`censo_setor.parquet`, `censo_municipio.parquet`).
- Não há backend em runtime hoje — o agente será o **primeiro componente server-side** do projeto.
- Espacial no `query/` é aproximado (centroide × 111 km); geometria exata vive nos PMTiles — o backend devolve códigos e o mapa pinta.

**Technical Context Observed (for Define):**

| Aspect | Observation | Implication |
|--------|-------------|-------------|
| Likely Location | Novo projeto `agent/` (uv) + painel de chat em `web/src/` | `agent/` importa `query/` como dependência; front reusa `selection.ts` |
| Relevant KB Domains | `maplibre`, `geospatial-etl` (ver `.claude/kb/_index.yaml`) | Padrões de camadas/seleção já destilados |
| IaC Patterns | Docker Compose (dev) + deploy/deploy.sh via rsync (Caddy na VPS) | Deploy do agente na VPS fica para o fim da fase / fase 2.1 |

---

## Discovery Questions & Answers

| # | Question | Answer | Impact |
|---|----------|--------|--------|
| 1 | Experiência-alvo do MVP? | **Chat que responde e pinta o mapa** — texto + destaques dos resultados | Fecha o loop mapa↔chat; resposta do backend precisa ser estruturada (texto + códigos) |
| 2 | Qual LLM? | **OpenAI (chave própria do usuário)** — modelo específico a definir no /define | Integração via SDK `openai` + function calling |
| 3 | Onde roda o backend? | **Local primeiro, VPS depois** — deploy Hetzner/Caddy é etapa final da fase ou fase 2.1 | MVP itera em localhost; chave OpenAI via `.env`, sem exposição pública |
| 4 | Amostras para grounding? | **Não tem — gerar no /define** | O /define deve produzir 10–20 perguntas-exemplo com resposta esperada (few-shots + casos de teste) |

---

## Sample Data Inventory

| Type | Location | Count | Notes |
|------|----------|-------|-------|
| Input files | `data/processed/censo_setor.parquet`, `censo_municipio.parquet` | 2 | Parquets canônicos já prontos |
| Output examples | N/A — gerar no /define | 0 | 10–20 pares pergunta→resposta esperada, validados pelo usuário |
| Ground truth | `query/tests/test_queries.py` | 1 suíte | Consultas válidas já codificadas nos testes do GeoQuery |
| Related code | `query/src/geo_query/queries.py`, `web/src/map/selection.ts` | 2 | Tools do agente = wrappers do GeoQuery; pintura = mecanismo de seleção existente |

**How samples will be used:**

- Perguntas-exemplo viram few-shots no system prompt e mini-benchmark de regressão do agente.
- Testes do `query/` garantem que as tools retornam dados corretos por construção.

---

## Approaches Explored

> Nesta sessão refeita, as abordagens foram explicadas com a analogia do "estagiário e o
> arquivo": o LLM é um estagiário articulado que **não toca nos dados**; a diferença entre
> as abordagens é *quem monta o balcão de pedidos* entre ele e o arquivo (os dados do Censo).

### Approach A: Function-calling direto (SDK OpenAI + Pydantic) ⭐ Recommended

**Description:** FastAPI (`agent/`, projeto uv) com o SDK `openai` puro. Cada método do
`GeoQuery` vira uma tool declarada; o loop de tool-calling é explícito (~15–20 linhas,
escrito e visível no nosso código). Pydantic gera os schemas das tools e valida a resposta
estruturada `{resposta, destaques{camada, codigos[]}, dados?}`.

**Em uma frase:** *você monta o balcão* — o LLM preenche o "formulário de pedido"
(tool call), o nosso código executa a função do GeoQuery e devolve o resultado para o LLM
redigir a resposta.

**Pros:**
- Transparência total do mecanismo (objetivo de aprendizado do projeto)
- Zero dependência além de `openai` + `fastapi` + `pydantic`; grounding forte (LLM só acessa o que as tools permitem)
- Portável para o ambiente do trabalho (Windows/Copilot/sem Docker)

**Cons:**
- Loop e histórico gerenciados manualmente (pequenos neste escopo)
- Se evoluir para multi-agente/memória longa, reimplementa o que framework dá pronto

**Why Recommended:** o problema é 1 agente + ~5 tools determinísticas + output estruturado —
o degrau mais simples da escada de agentes. O `while` do loop existe igualmente dentro de
qualquer framework; escrevê-lo na mão é o aprendizado que se transfere. Migrar para framework
depois é fácil; o contrário não.

---

### Approach B: Framework de agente (Pydantic-AI / Agno / LangGraph / CrewAI)

**Description:** Mesma arquitetura com o framework gerenciando loop, schemas e histórico.
*O balcão automatizado pronto* — o mesmo vai-e-volta acontece, mas dentro de uma caixa fechada.

**Pros:**
- Menos boilerplate; memória/observabilidade/retry prontos quando o agente crescer
- Pydantic-AI e Agno são os melhores fits (agente único, tipado); LangGraph/CrewAI são overkill

**Cons:**
- Dependência nova + curva de aprendizado; abstrações escondem o mecanismo
- Debug atravessa camadas do framework; conhecimento menos transferível para o trabalho

---

### Approach C: Text-to-SQL livre sobre o DuckDB

**Description:** O LLM escreve SQL contra as views `setor`/`municipio` em vez de escolher
tools curadas. *Dar a chave do arquivo ao estagiário.*

**Pros:**
- Flexibilidade máxima — responde perguntas que nenhuma tool previu

**Cons:**
- Alucinação de schema/colunas disfarçada de resposta confiante; exige sandbox (read-only, timeout, limite de linhas)
- Descarta a camada `queries.py` recém-construída. **Caminho maduro:** entrar depois como tool adicional (`consulta_sql_avancada`) com guarda-corpos, não como fundação.

---

## Selected Approach

| Attribute | Value |
|-----------|-------|
| **Chosen** | Approach A — SDK OpenAI puro + Pydantic |
| **User Confirmation** | 2026-07-04 (sessão refeita; escolhida **após** o usuário confirmar ter entendido a diferença entre A/B/C via analogia + código lado a lado) |
| **Reasoning** | Aprender o mecanismo, manter grounding e portabilidade; Pydantic entrega o melhor pedaço do Pydantic-AI sem o framework |

---

## Key Decisions Made

| # | Decision | Rationale | Alternative Rejected |
|---|----------|-----------|----------------------|
| 1 | LLM = OpenAI (chave do usuário) | Preferência/custo do usuário | Claude API, modelo local |
| 2 | Tools curadas = wrappers do `GeoQuery` | Correto por construção; reusa código testado | Text-to-SQL livre (fica como extensão futura) |
| 3 | Resposta estruturada Pydantic `{resposta, destaques, dados?}` | Contrato claro backend↔mapa; validação nativa | Texto livre parseado no front |
| 4 | Pintura via mecanismo de seleção existente (`selection.ts`) | Já funciona por id base/GeoJSON; zero refactor no mapa | feature-state / camada nova |
| 5 | Dev local primeiro; VPS ao final da fase (ou 2.1) | Menos risco/custo; chave OpenAI não exposta durante iteração | Deploy público desde o início |
| 6 | Histórico multi-turno em memória por sessão do navegador | Suficiente para MVP; some no refresh | Persistência de conversas |
| 7 | Contexto do mapa (viewport + camada ativa) enviado junto à pergunta | Ancora respostas "no que estou vendo" | Agente cego ao estado do mapa |
| 8 | Números só via tools; fora de escopo = recusa explicada | Elimina alucinação quantitativa; expectativa clara ao usuário | Deixar o LLM responder de memória |

---

## Features Removed (YAGNI)

| Feature Suggested | Reason Removed | Can Add Later? |
|-------------------|----------------|----------------|
| Streaming token-a-token (SSE) | MVP = request→resposta completa; simplifica front e back | Yes |
| Memória persistente de conversas | Sessão em memória basta para validar a experiência | Yes |
| Roteamento de modelos (barato/caro) | Um modelo só até o custo real aparecer | Yes |
| Controle total do mapa (zoom/pan/toggle camadas pelo agente) | MVP só pinta destaques | Yes |
| Text-to-SQL livre | Risco de alucinação; entra como tool guardada se as perguntas reais exigirem | Yes |
| Deploy na VPS | Etapa final da fase ou fase 2.1 dedicada | Yes (planejado) |

---

## Incremental Validations

| Section | Presented | User Feedback | Adjusted? |
|---------|-----------|---------------|-----------|
| Abordagens A/B/C (1ª passada) | ✅ | "Ainda não entendi a diferença" | Sim — reexplicado com analogia do estagiário + código A vs B lado a lado + diagrama do fluxo; usuário então escolheu A com convicção |
| Parte 1: arquitetura (agent/ + resposta estruturada + pintura via selection.ts + contexto do mapa) | ✅ | "Sim, faz sentido" | No |
| Parte 2: cortes YAGNI + critérios de sucesso | ✅ | "Aprovado — gravar documento" | No |

---

## Suggested Requirements for /define

### Problem Statement (Draft)
Explorar o mapa é puramente visual — falta perguntar em linguagem natural sobre os dados exibidos (Censo 2022 por setor/município) e ver a resposta ancorada nos dados e refletida no próprio mapa.

### Target Users (Draft)
| User | Pain Point |
|------|------------|
| Guilherme (analista geo, projeto solo) | Responder perguntas analíticas exige conhecer o schema e escrever consultas; quer perguntar e ver o mapa reagir |

### Success Criteria (Draft)
- [ ] Perguntar "top N municípios de {UF} por {métrica}" no chat retorna texto correto + os N municípios pintados no mapa
- [ ] Perguntar sobre proximidade ("setores num raio de X km de …") pinta os setores correspondentes (ressalva: espacial aproximado por centroide, herdado do `query/`)
- [ ] O agente nunca inventa números: toda resposta quantitativa vem de uma tool do GeoQuery
- [ ] Respostas fora do escopo dos dados são recusadas com explicação do que o agente sabe responder
- [ ] Mini-benchmark de 10–20 perguntas-exemplo (gerado no /define) passa
- [ ] Tudo roda local: `make dev` (ou alvo novo) sobe front + backend do agente

### Constraints Identified
- LLM: OpenAI via chave do usuário (`.env`, nunca no repo); modelo específico a decidir no /define
- Python com `uv` obrigatório; type hints; Ruff + pytest (padrão do projeto)
- `agent/` depende de `query/` (que precisa dos parquets em `data/processed/`)
- Espacial aproximado (centroide) — herdado do `query/`; comunicar na resposta quando relevante
- Idioma: chat responde em português-BR

### Out of Scope (Confirmed)
- Deploy na VPS (fase 2.1)
- Streaming, memória persistente, roteamento de modelos
- Agente controlando navegação/camadas do mapa (só pinta destaques)
- Text-to-SQL

---

## Session Summary

| Metric | Value |
|--------|-------|
| Questions Asked | 4 discovery + 1 reexplicação de abordagens |
| Approaches Explored | 3 |
| Features Removed (YAGNI) | 6 |
| Validations Completed | 3 (abordagem entendida + arquitetura + escopo) |
| Note | Sessão refeita — substitui o brainstorm de mesma data que havia gerado confusão |

---

## Next Step

**Ready for:** `/define .claude/sdd/features/BRAINSTORM_AGENTE_IA.md`
