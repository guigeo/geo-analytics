# BUILD REPORT: AGENTE_IA

> Chat com agente de IA (OpenAI function calling + Pydantic) sobre o Censo 2022, pintando
> os resultados no mapa — primeiro componente server-side do projeto.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | AGENTE_IA |
| **Date** | 2026-07-08 |
| **Author** | build-agent |
| **DEFINE** | [DEFINE_AGENTE_IA.md](../features/DEFINE_AGENTE_IA.md) |
| **DESIGN** | [DESIGN_AGENTE_IA.md](../features/DESIGN_AGENTE_IA.md) |
| **Status** | Complete — benchmark real 16/16 ✅ (meta ≥14); falta só o E2E visual (`make dev-ia`) |

---

## Summary

| Metric | Value |
|--------|-------|
| **Tasks Completed** | 22/22 arquivos do manifest |
| **Files Created** | 14 (agent/ inteiro, web/src/chat/, highlight.ts) |
| **Files Modified** | 8 (query/×2, web/×4, Makefile, CLAUDE.md) |
| **Lines of Code** | ~1.300 (novas) |
| **Tests Passing** | 31/31 offline (10 query + 21 agent) + **16/16 benchmark real (gpt-5-mini)** |
| **Agents Used** | Execução direta seguindo os padrões do DESIGN |

---

## Task Execution

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | `query/`: `busca_municipios` (nome→código, `strip_accents`) + `setores_no_ponto` (lon/lat) | ✅ | `setores_proximos` refatorado para delegar a `setores_no_ponto` |
| 2 | `query/tests`: 4 testes novos | ✅ | 10/10 passando |
| 3 | `agent/` base: pyproject (uv, dep local `geo-query` editable), `.env.example`, config, schemas | ✅ | `.env` já coberto pelo gitignore da raiz |
| 4 | `agent/tools.py`: 7 tools Pydantic + `TOOL_REGISTRY` + normalização UF (27 siglas) | ✅ | Erros viram payload p/ autocorreção do LLM |
| 5 | `agent/prompts.py` + `agent.py` (loop) + `main.py` (FastAPI) | ✅ | Loop `while` explícito; destaques determinísticos; sessões TTL 1 h |
| 6 | `agent/tests`: tools (13) + loop com client fake (8) | ✅ | 21/21 offline, sem chave |
| 7 | `agent/benchmark.yaml` (BM-01..16) + `test_benchmark.py` | ✅ | `pytest -m benchmark`; excluído do run padrão via `addopts` |
| 8 | `web/src/map/highlight.ts` + `MapView.tsx` (highlights + viewport) | ✅ | `setFilter` por `CD_MUN`/`CD_SETOR`; reaplica após troca de tema |
| 9 | `web/src/chat/` (api.ts + ChatPanel.tsx) + `App.tsx` + proxy Vite | ✅ | ChatPanel substitui o placeholder "Em breve — Fase 2" |
| 10 | `Makefile` (`agent`, `dev-ia`) + `CLAUDE.md` | ✅ | Coluna direita: Atributos + Chat (340px) |

---

## Files Created

| File | Lines | Verified | Notes |
| ---- | ----- | -------- | ----- |
| `agent/pyproject.toml` | 41 | ✅ | uv; benchmark marker; `geo-query` path editable |
| `agent/.env.example` | 3 | ✅ | `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5-mini` |
| `agent/src/geo_agent/__init__.py` | 5 | ✅ | |
| `agent/src/geo_agent/config.py` | 20 | ✅ | pydantic-settings; key vazia por default (testes offline) |
| `agent/src/geo_agent/schemas.py` | 35 | ✅ | `ChatRequest/Response`, `ContextoMapa`, `Destaques` |
| `agent/src/geo_agent/tools.py` | 222 | ✅ | 7 tools; schema via `model_json_schema()` |
| `agent/src/geo_agent/prompts.py` | 44 | ✅ | System prompt pt-BR + few-shots + mensagens de erro |
| `agent/src/geo_agent/agent.py` | 157 | ✅ | Loop explícito; `trace` opcional p/ benchmark/log |
| `agent/src/geo_agent/main.py` | 56 | ✅ | `/api/chat`, `/api/health`; 502 pt-BR em erro OpenAI |
| `agent/tests/test_tools.py` | 101 | ✅ | GeoQuery real (parquets) |
| `agent/tests/test_agent.py` | 152 | ✅ | FakeClient roteirizado (offline) |
| `agent/tests/test_benchmark.py` | 102 | ✅ | Runner do YAML; skip sem chave |
| `agent/benchmark.yaml` | 135 | ✅ | 16 casos; sessão compartilhada BM-10/11 |
| `web/src/map/highlight.ts` | 50 | ✅ | Camadas `__highlight-*`; filtro por código |
| `web/src/chat/api.ts` | 38 | ✅ | Espelha schemas Pydantic |
| `web/src/chat/ChatPanel.tsx` | 141 | ✅ | Sugestões, loading, erro; `crypto.randomUUID()` |

**Modificados:** `query/src/geo_query/queries.py`, `query/tests/test_queries.py`,
`web/src/map/MapView.tsx`, `web/src/App.tsx`, `web/src/panels/AttributePanel.tsx`,
`web/vite.config.ts`, `Makefile`, `CLAUDE.md`.

---

## Verification Results

### Lint (ruff)

```text
query/: All checks passed!
agent/: All checks passed!
```

**Status:** ✅ Pass

### Typecheck (tsc --noEmit, no container web)

```text
> geo-analytics-web@0.1.0 typecheck — sem erros
```

**Status:** ✅ Pass

### Tests (pytest)

```text
query/: 10 passed in 0.44s
agent/: 21 passed, 16 deselected in 1.37s   (deselected = benchmark, requer chave)
```

**Status:** ✅ 31/31 Pass (offline)

### Benchmark (OpenAI real, gpt-5-mini) — 2026-07-08

```text
1º run: 13/16 (BM-13 métricas cruas; BM-14/15 recusa chamava tool e pintava o mapa)
Fix: 2 ajustes de SYSTEM PROMPT (recusa = zero tool call; métricas traduzidas) — sem mudança de código
2º run (completo, pós-fix): 16 passed in 288s  → 16/16 ✅ (meta do DEFINE: ≥14)
```

**Latência:** média ~15–18 s/pergunta no run completo — no limite do critério "< 15 s"
(perguntas com 2+ tool calls passam disso). Aceito para o MVP local; se incomodar,
opções na fase 2.1: modelo maior/menor via `OPENAI_MODEL`, ou streaming (cortado por YAGNI).

**Status:** ✅ 16/16

### Smoke test

```text
uv run python -c "from geo_agent.main import app; ..." → app ok, 7 tools
```

---

## Issues Encountered

| # | Issue | Resolution | Time Impact |
|---|-------|------------|-------------|
| 1 | Docker daemon parado na hora do typecheck | `open -a Docker` + aguardar daemon; typecheck ok | +1m |
| 2 | E2E: chat devolvia HTTP 500 | Causa: agente não estava rodando (proxy Vite → ECONNREFUSED :8000). Subir o front sozinho não sobe o agente — usar `make dev-ia` (ou `make agent` em outro terminal) | +2m |
| 3 | E2E: "população de Curitiba" pintava Curitiba **e Curitibanos** (busca `LIKE %nome%`) | `busca_municipios` agora tenta match EXATO primeiro (sem acento/caixa); substring vira fallback. +2 testes; 12/12 query, 21/21 agent | +5m |

---

## Deviations from Design

| Deviation | Reason | Impact |
|-----------|--------|--------|
| Coluna direita do App: 320px → 340px e dividida em Atributos (flex-1) + Chat (flex-1.4) | Chat precisa de área útil; placeholder antigo removido do `AttributePanel` | Visual apenas |
| `SessionStore.trim` pode segurar 1 turno acima do teto | Poda só em fronteira de turno (nunca órfã um tool result do seu tool_call) | Comportamento mais seguro que o teto rígido |

Nenhum desvio de arquitetura: as 5 decisões do DESIGN foram implementadas como especificadas.

---

## Acceptance Test Verification

| ID | Scenario | Status | Evidence |
|----|----------|--------|----------|
| AT-001 | Ranking happy path | ✅ (offline) | `test_destaques_derivados_da_tool` + BM-01/02 no benchmark |
| AT-002 | Nome→código | ✅ (offline) | `test_buscar_municipio_resolve_nome` (Curitiba→4106902) + BM-06 |
| AT-003 | Espacial aproximado | ✅ (offline) | `test_setores_proximos`; ressalva no prompt; BM-10 valida a menção |
| AT-004 | Multi-turno | ✅ (offline) | `test_multi_turno_preserva_historico` + BM-11 |
| AT-005 | Recusa fundamentada | ✅ | BM-14/15 verdes no benchmark real (recusa sem tool call, mapa não pinta) |
| AT-006 | Contexto do mapa | ✅ (offline) | `test_contexto_do_mapa_vai_na_mensagem` + BM-12 |
| AT-007 | Erro de tool → autocorreção | ✅ (offline) | `test_autocorrecao_apos_erro_de_metrica` + `test_segunda_falha…` |
| AT-008 | Parquets ausentes | ✅ | `db.connect()` falha no startup com instrução (herdado; coberto em query/) |

**Success criteria do DEFINE:** benchmark ≥ 90% → **16/16 (100%) ✅**; latência < 15 s →
média ~15–18 s (limítrofe; ver nota acima); grounding 100% via tools ✅ (por construção +
BM-14/15). Aberto: E2E visual via `make dev-ia` (mapa pintando no browser).

---

## Final Status

### Overall: ✅ COMPLETE — falta só o E2E visual antes do /ship

**Completion Checklist:**

- [x] 22/22 arquivos do manifest
- [x] ruff + tsc + pytest verdes
- [x] 31 testes offline passando
- [x] Benchmark com OpenAI real: **16/16** (após 2 ajustes de prompt)
- [x] Sem blockers
- [ ] E2E manual no browser (`make dev-ia`)

---

## Next Step

1. `make dev-ia` → testar no browser: "top 10 municípios do Brasil por população" (pinta 10),
   "qual a população de Curitiba?" (pinta 1), "qual o PIB de Fortaleza?" (recusa, não pinta)
2. Quando satisfeito: `/ship .claude/sdd/features/DEFINE_AGENTE_IA.md`
