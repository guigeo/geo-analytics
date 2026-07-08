# DESIGN: AGENTE_IA

> Design técnico do chat com agente de IA (OpenAI function calling + Pydantic) que responde
> perguntas sobre o Censo 2022 e pinta os resultados no mapa.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | AGENTE_IA |
| **Date** | 2026-07-08 |
| **Author** | design-agent |
| **DEFINE** | [DEFINE_AGENTE_IA.md](./DEFINE_AGENTE_IA.md) |
| **Status** | ✅ Shipped (2026-07-08) |

---

## Architecture Overview

```text
┌──────────────────────────── BROWSER (:5173) ────────────────────────────┐
│                                                                          │
│  ┌───────────────┐   destaques {camada, codigos[]}   ┌───────────────┐  │
│  │  ChatPanel     │ ────────────────────────────────▶ │  MapView       │  │
│  │  (React)       │                                   │  highlight.ts  │  │
│  │                │ ◀──────────────────────────────── │  setFilter por │  │
│  └──────┬────────┘    contexto do mapa (bbox, zoom,   │  CD_MUN/CD_SETOR│ │
│         │              centro, camadas ativas)        └───────┬────────┘  │
│         │ POST /api/chat                                      │ PMTiles   │
└─────────┼──────────────────────────────────────────────────────┼──────────┘
          │ (proxy Vite → host.docker.internal:8000)             │
          ▼                                                      ▼
┌──────── agent/ (FastAPI, uv, host :8000) ────────┐    web/public/tiles/*.pmtiles
│                                                   │    (geometria exata)
│  main.py ─▶ agent.py (loop tool-calling explícito)│
│               │        ▲                          │
│    tool call  ▼        │ tool result              │
│           tools.py ──▶ GeoQuery (query/)          │
│               │            │                      │
│               │            ▼                      │
│               │        DuckDB sobre               │
│               │        data/processed/*.parquet   │
│               ▼                                   │
│  destaques/dados derivados das tools (código,     │
│  não LLM) + resposta em texto do LLM              │
└───────────────┬───────────────────────────────────┘
                │ chat.completions (tools=…)
                ▼
        OpenAI API (OPENAI_MODEL, default gpt-5-mini)
```

---

## Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| `agent/` (novo) | Backend do chat: FastAPI + loop de tool-calling explícito + sessões em memória | Python 3.11+, uv, FastAPI, SDK `openai`, Pydantic v2 |
| `agent/tools.py` | Registry de tools: args Pydantic → JSON Schema; dispatch para o `GeoQuery` | Pydantic `model_json_schema()` |
| `query/` (estende) | +2 métodos: `busca_municipios` (nome→código) e `setores_no_ponto` (lon/lat) | DuckDB (padrão anti-injection existente) |
| `web/src/chat/` (novo) | Painel de chat (UI shadcn existente) + client da API | React/TS, componentes ui já no repo |
| `web/src/map/highlight.ts` (novo) | Camadas de destaque por filtro de código sobre as fontes PMTiles | MapLibre `setFilter` |
| `MapView.tsx` (modifica) | Expõe contexto do mapa (bbox/zoom/camadas) e aplica destaques | React refs/props (padrão atual) |

---

## Key Decisions

### Decision 1: Pintura por filtro nas camadas vetoriais (não `selection.ts`)

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted — **revisa a decisão nº 4 do brainstorm** |
| **Date** | 2026-07-08 |

**Context:** O brainstorm assumiu reusar o mecanismo de seleção (`selection.ts`, fonte GeoJSON).
Na validação (A-001 do DEFINE), constatou-se que ele depende de `queryRenderedFeatures`, que só
enxerga feições **renderizadas no viewport atual** — inútil para destacar "top 10 municípios do
Brasil" com o mapa em Curitiba.

**Choice:** Novas camadas de destaque (`__highlight-fill`/`__highlight-line`) sobre as **mesmas
fontes PMTiles** de `municipio` e `setor`, com filtro
`["in", ["get", "CD_MUN"], ["literal", codigos]]` aplicado via `setFilter`. As propriedades
`CD_MUN`/`CD_SETOR` já estão nos tiles (`pipeline/datasets.yaml`). O visual reusa a cor/estilo do
highlight atual (`#00b3ff`).

**Rationale:** Filtro por propriedade funciona para qualquer código, independente do viewport —
os destaques aparecem conforme os tiles carregam. Zero mudança no ETL e no clique da Fase 1.

**Alternatives Rejected:**
1. Fonte GeoJSON via `queryRenderedFeatures` (brainstorm) — só vê o viewport renderizado.
2. Backend devolver geometrias — duplica o que os PMTiles já servem; payload gigante (setores).
3. `feature-state` — exige `promoteId` e gestão de estado por tile; filtro é mais simples e declarativo.

**Consequences:**
- Destaque fora do viewport só é visto se o usuário navegar até lá (agente não controla zoom/pan — out of scope confirmado; a `resposta` textual cita os nomes, o que mitiga).
- Camadas de destaque ficam **sempre visíveis** (independem do toggle da camada base) — destaque funciona mesmo com a camada município desligada.
- Destaques limitados às camadas com código nos tiles: `municipio` e `setor` (suficiente — são as únicas com dados do Censo).

---

### Decision 2: `destaques` e `dados` derivados das tools, não do LLM

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |

**Context:** O contrato `{resposta, destaques, dados?}` precisa de códigos IBGE corretos. Pedir
ao LLM que os copie para um JSON final (structured output) abre espaço para códigos trocados/
inventados — justamente o que a feature quer eliminar.

**Choice:** O backend **acumula os códigos dos resultados das tools executadas** (as rows já
trazem `cd_mun`/`cd_setor`) e monta `destaques` + `dados` deterministicamente. O LLM produz
apenas o texto de `resposta`. Regra: destaques = códigos da **última tool de dados** executada
no turno (ranking/lookup/espacial); tools sem código (`listar_metricas`) não geram destaque.

**Rationale:** Grounding por construção — o mapa só pinta o que uma tool retornou. Dispensa
structured output no LLM (menos um modo de falha) e simplifica o loop.

**Alternatives Rejected:**
1. Structured output (`response_format`/`.parse`) com o LLM preenchendo códigos — risco de cópia errada; valida sintaxe, não veracidade.
2. LLM escolhe subconjunto a destacar — YAGNI; a última consulta é o que o usuário perguntou.

**Consequences:**
- Perguntas multi-consulta num turno destacam só a última (aceitável no MVP; documentar no system prompt).
- `ChatResponse` é montado 100% no nosso código; o LLM nunca vê/escreve o contrato.

---

### Decision 3: Agente roda nativo no host (uv); front alcança via proxy do Vite

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |

**Context:** O `web` roda em container (não há node no host); o novo backend precisa ser
alcançável pelo browser e iterar rápido com a chave OpenAI local.

**Choice:** `agent/` roda **nativo com uv** (como `query/` já faz — a lógica pura não precisa de
gdal/tippecanoe). O Vite ganha proxy `"/api" → http://host.docker.internal:8000`, então o browser
fala com a própria origem `:5173` — **sem CORS**. Novo alvo `make dev-ia` sobe web (detached) +
agente (foreground, com reload).

**Rationale:** Espelha o padrão do `query/` (nativo, portável para o trabalho sem Docker);
`.env` fica no host; `host.docker.internal` é suportado no Docker Desktop/macOS.

**Alternatives Rejected:**
1. Containerizar o agente já no MVP — atrito de iteração (rebuild) e de `.env`; entra na fase 2.1 junto do deploy.
2. CORS liberado e fetch direto em `:8000` — funciona, mas o proxy é a config de 3 linhas que também vale em produção (Caddy fará o mesmo papel na 2.1).

**Consequences:**
- `host.docker.internal` é Docker Desktop (macOS/Windows) — na VPS Linux será outro arranjo (Caddy reverse-proxy, fase 2.1).
- No trabalho (sem Docker): tudo nativo, proxy aponta para `localhost:8000` — mesmo código.

---

### Decision 4: Tools como Pydantic models + dispatch table; loop explícito com teto de iterações

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |

**Context:** Decisão do brainstorm (SDK puro) precisa de forma concreta: como declarar as ~7
tools sem repetição e manter o loop legível (objetivo de aprendizado).

**Choice:** Cada tool = um `BaseModel` Pydantic (args tipados + docstring = description). O
schema OpenAI é gerado de `model_json_schema()`; um dict `TOOL_REGISTRY: {nome: (Model, handler)}`
faz o dispatch. O loop em `agent.py` é um `while` explícito com `MAX_TOOL_ITERS = 6`; `ValueError`
das tools (ex.: métrica inválida) volta ao LLM como tool result de erro para autocorreção (1
chance — na 2ª falha, resposta de erro amigável).

**Rationale:** Uma fonte de verdade por tool (validação + schema + docs); o loop visível é o
aprendizado transferível que motivou a Abordagem A.

**Alternatives Rejected:**
1. Schemas JSON escritos à mão — drift entre schema e validação.
2. Decorators mágicos estilo framework — esconde o mecanismo (contra o objetivo).

**Consequences:**
- Adicionar tool = 1 model + 1 handler + 1 linha no registry.
- Teto de iterações protege contra loop infinito de tool calls (custo limitado por pergunta).

---

### Decision 5: Sessões multi-turno em dict no processo; benchmark como suíte pytest marcada

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |

**Context:** MUST de multi-turno (BM-11) e o mini-benchmark de 16 perguntas do DEFINE precisam
de forma executável.

**Choice:** (a) Sessões: `dict[str, Session]` no processo (id gerado no front com
`crypto.randomUUID()`, vive no estado do React — some no refresh, conforme DEFINE), com poda
por tamanho (últimas 20 mensagens) e por idade (TTL 1 h). (b) Benchmark: `benchmark.yaml` com os
16 casos (pergunta, tool esperada, args esperados, destaques esperados) + testes
`@pytest.mark.benchmark` que chamam o agente real (exigem `OPENAI_API_KEY`); excluídos do run
padrão via `-m "not benchmark"`.

**Rationale:** Um worker uvicorn local → dict basta (A-005 do DEFINE). Benchmark em YAML é o
artefato reaproveitável (few-shots + regressão) que o DEFINE pediu.

**Alternatives Rejected:**
1. Redis/SQLite para sessão — infra sem necessidade no MVP.
2. Benchmark como script solto — sem asserts estruturados nem integração com pytest.

**Consequences:**
- `uv run pytest` fica rápido e offline; `uv run pytest -m benchmark` roda a régua com custo real (~16 chamadas).
- Restart do backend zera sessões (aceitável em dev local).

---

## File Manifest

| # | File | Action | Purpose | Agent | Dependencies |
|---|------|--------|---------|-------|--------------|
| 1 | `query/src/geo_query/queries.py` | Modify | + `busca_municipios(nome, uf?, limite)` (ILIKE + `strip_accents`) e `setores_no_ponto(lon, lat, raio_km, limite)` (generaliza `setores_proximos`) | @python-developer | None |
| 2 | `query/tests/test_queries.py` | Modify | Testes dos 2 métodos novos (mesmo padrão da suíte atual) | @test-generator | 1 |
| 3 | `agent/pyproject.toml` | Create | Projeto uv: fastapi, uvicorn, openai, pydantic, pydantic-settings + dep local `geo-query` (path) | @python-developer | None |
| 4 | `agent/.env.example` | Create | `OPENAI_API_KEY=`, `OPENAI_MODEL=gpt-5-mini` (documenta o contrato do `.env`) | @python-developer | None |
| 5 | `agent/src/geo_agent/config.py` | Create | `Settings` (pydantic-settings): key, model, host/port, limites | @python-developer | 3 |
| 6 | `agent/src/geo_agent/schemas.py` | Create | `ChatRequest` (pergunta, contexto_mapa, session_id), `ContextoMapa`, `Destaques`, `ChatResponse` | @python-developer | 3 |
| 7 | `agent/src/geo_agent/tools.py` | Create | Models de args das 7 tools + `TOOL_REGISTRY` + dispatch p/ `GeoQuery` + normalização UF sigla→nome | @python-developer | 1, 3 |
| 8 | `agent/src/geo_agent/prompts.py` | Create | System prompt pt-BR (escopo, recusas, ressalva espacial, few-shots do benchmark) | @ai-developer | 7 |
| 9 | `agent/src/geo_agent/agent.py` | Create | Loop de tool-calling explícito + coleta determinística de destaques/dados + sessões em memória | @ai-developer | 5–8 |
| 10 | `agent/src/geo_agent/main.py` | Create | FastAPI: `POST /api/chat`, `GET /api/health`; erros pt-BR; logging de tool calls | @python-developer | 9 |
| 11 | `agent/tests/test_tools.py` | Create | Dispatch, validação de args, normalização de UF (GeoQuery real sobre os parquets, como `query/tests`) | @test-generator | 7 |
| 12 | `agent/tests/test_agent.py` | Create | Loop com client OpenAI **fake** (stub injetado): happy path, erro de tool→autocorreção, teto de iterações, destaques derivados | @test-generator | 9 |
| 13 | `agent/benchmark.yaml` | Create | Os 16 casos BM-01..BM-16 do DEFINE em YAML executável | @ai-developer | None |
| 14 | `agent/tests/test_benchmark.py` | Create | `@pytest.mark.benchmark`: roda os 16 contra a OpenAI real; assert tool+args+destaques | @ai-developer | 9, 13 |
| 15 | `web/src/map/highlight.ts` | Create | Camadas `__highlight-*` p/ municipio/setor + `applyHighlights(map, destaques)` via `setFilter` | @frontend-developer | None |
| 16 | `web/src/map/MapView.tsx` | Modify | + prop `highlights`, callback `onViewportChange` (bbox/zoom/centro em `moveend`), inclui camadas de highlight no style | @frontend-developer | 15 |
| 17 | `web/src/chat/api.ts` | Create | Types TS espelhando os schemas + `fetch POST /api/chat` | @frontend-developer | 6 |
| 18 | `web/src/chat/ChatPanel.tsx` | Create | UI do chat (Card/Input/Button/ScrollArea já existentes); estados carregando/erro; session_id via `crypto.randomUUID()` | @frontend-developer | 17 |
| 19 | `web/src/App.tsx` | Modify | Monta ChatPanel; liga `destaques`→MapView e viewport+camadas ativas→request | @frontend-developer | 16, 18 |
| 20 | `web/vite.config.ts` | Modify | Proxy `"/api" → http://host.docker.internal:8000` | @frontend-developer | None |
| 21 | `Makefile` | Modify | + `agent` (uvicorn com reload) e `dev-ia` (web detached + agente); help atualizado | @python-developer | 3 |
| 22 | `CLAUDE.md` | Modify | Seções Fluxo/Arquitetura/Comandos ganham o `agent/` | (general) | 1–21 |

**Total Files:** 22 (14 create, 8 modify)

---

## Agent Assignment Rationale

| Agent | Files Assigned | Why This Agent |
|-------|----------------|----------------|
| @python-developer | 1, 3–7, 10, 21 | Extensões DuckDB no padrão anti-injection existente; FastAPI/Pydantic/uv |
| @ai-developer | 8, 9, 13, 14 | Dono da camada de IA: system prompt, loop de tool-calling, grounding, benchmark |
| @frontend-developer | 15–20 | Dono do mapa/UI: MapLibre setFilter, painel de chat, acoplamento mapa↔chat |
| @test-generator | 2, 11, 12 | Suítes pytest com fixtures; espelha o padrão de `query/tests` |
| (general) | 22 | Atualização de docs ao final |

**Agent Discovery:** `.claude/agents/**` — casados por domínio (IA/front/python/testes) conforme
diretrizes do `.claude/CLAUDE.md`.

---

## Code Patterns

### Pattern 1: Tool = Pydantic model + handler no registry (`tools.py`)

```python
from pydantic import BaseModel, Field
from geo_query.queries import GeoQuery, Ordem

class RankingMunicipiosArgs(BaseModel):
    """Top-N municípios por uma métrica do Censo 2022, opcionalmente filtrando por UF."""
    metrica: str = Field(description="Métrica numérica; consulte listar_metricas se houver dúvida")
    uf: str | None = Field(None, description="UF por nome ou sigla (ex.: 'Paraná' ou 'PR')")
    n: int = Field(10, ge=1, le=100)
    ordem: Ordem = "desc"

def _ranking(gq: GeoQuery, args: RankingMunicipiosArgs) -> list[dict]:
    uf = normalize_uf(args.uf)  # "PR" -> "Paraná" (dict estático das 27 UFs)
    return gq.ranking_municipios(args.metrica, uf=uf, n=args.n, ordem=args.ordem)

TOOL_REGISTRY: dict[str, tuple[type[BaseModel], Handler]] = {
    "ranking_municipios": (RankingMunicipiosArgs, _ranking),
    # ... 6 demais
}

def openai_tools() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": model.__doc__ or "",
                "parameters": model.model_json_schema(),
            },
        }
        for name, (model, _) in TOOL_REGISTRY.items()
    ]
```

### Pattern 2: Loop de tool-calling explícito com destaques determinísticos (`agent.py`)

```python
def run_turn(session: Session, pergunta: str, ctx: ContextoMapa | None) -> ChatResponse:
    session.append(user_message(pergunta, ctx))          # contexto do mapa vai junto
    destaques, dados = None, None
    for _ in range(settings.max_tool_iters):
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[SYSTEM, *session.messages],
            tools=openai_tools(),
        )
        msg = resp.choices[0].message
        session.append(msg)
        if not msg.tool_calls:
            return ChatResponse(resposta=msg.content, destaques=destaques, dados=dados)
        for call in msg.tool_calls:
            result = execute_tool(call)                   # valida args (Pydantic) + dispatch
            if result.codigos:                            # cd_mun/cd_setor nas rows da tool
                destaques = Destaques(camada=result.camada, codigos=result.codigos)
                dados = result.rows
            session.append(tool_message(call.id, result.payload_json))
    return ChatResponse(resposta=MSG_LIMITE_ITERACOES, destaques=destaques, dados=dados)
```

### Pattern 3: Destaque por filtro de código (`highlight.ts`)

```typescript
// Camadas independentes do toggle: sempre visíveis, filtro vazio = nada pintado.
const CODE_FIELDS = { municipio: "CD_MUN", setor: "CD_SETOR" } as const;
const NONE: FilterSpecification = ["in", ["get", "x"], ["literal", []]];

export function highlightLayers(): LayerSpecification[] {
  return Object.entries(CODE_FIELDS).flatMap(([id]) => [
    { id: `${id}__highlight-fill`, type: "fill", source: id, "source-layer": id,
      filter: NONE, paint: { "fill-color": "#00b3ff", "fill-opacity": 0.25 } },
    { id: `${id}__highlight-line`, type: "line", source: id, "source-layer": id,
      filter: NONE, paint: { "line-color": "#00b3ff", "line-width": 2.5 } },
  ]);
}

export function applyHighlights(map: maplibregl.Map, d: Destaques | null) {
  for (const [camada, field] of Object.entries(CODE_FIELDS)) {
    const codigos = d?.camada === camada ? d.codigos : [];
    const filter = ["in", ["get", field], ["literal", codigos]];
    for (const kind of ["fill", "line"])
      map.setFilter(`${camada}__highlight-${kind}`, filter);
  }
}
```

### Pattern 4: Contrato da API (espelhado em `schemas.py` e `chat/api.ts`)

```jsonc
// POST /api/chat
{
  "pergunta": "top 5 municípios do Paraná por densidade",
  "session_id": "9f1c…",
  "contexto_mapa": {
    "bbox": [-54.6, -26.7, -48.0, -22.5],
    "zoom": 7.2,
    "centro": [-51.3, -24.6],
    "camadas_ativas": ["municipio"]
  }
}
// 200
{
  "resposta": "Os 5 municípios mais densos do Paraná são…",
  "destaques": { "camada": "municipio", "codigos": ["4106902", "…"] },
  "dados": [{ "cd_mun": "4106902", "nm_mun": "Curitiba", "valor": 4027.6 }]
}
```

### Pattern 5: Proxy do Vite (`vite.config.ts`)

```typescript
server: {
  proxy: {
    // web roda em container; agente roda nativo no host (make agent)
    "/api": { target: "http://host.docker.internal:8000", changeOrigin: true },
  },
},
```

### Pattern 6: Caso do benchmark (`benchmark.yaml`)

```yaml
- id: BM-03
  pergunta: "Quais os 5 municípios com pior cobertura de esgoto em Pernambuco?"
  espera:
    tool: ranking_municipios
    args: { metrica: pct_esgoto_rede, uf: Pernambuco, n: 5, ordem: asc }
    destaques: { camada: municipio, n_codigos: 5 }
- id: BM-14
  pergunta: "Qual o PIB de Fortaleza?"
  espera:
    tool: null            # recusa: nenhuma tool de dados
    destaques: null
    resposta_contem: ["PIB", "não"]
```

---

## Data Flow

```text
1. Usuário digita a pergunta; ChatPanel anexa session_id + contexto do mapa
   (bbox/zoom/centro/camadas ativas capturados no último `moveend`)
   │
   ▼
2. Vite proxy encaminha POST /api/chat ao FastAPI (host :8000)
   │
   ▼
3. agent.py monta as mensagens (system + histórico da sessão + pergunta com contexto)
   e entra no loop: LLM decide tool call → tools.py valida args (Pydantic) →
   GeoQuery consulta DuckDB → resultado volta ao LLM (até 6 iterações)
   │
   ▼
4. Backend deriva destaques/dados das rows das tools (determinístico) e devolve
   {resposta (texto do LLM), destaques, dados}
   │
   ▼
5. ChatPanel exibe a resposta; App repassa destaques ao MapView →
   applyHighlights pinta municípios/setores via setFilter nos PMTiles
```

---

## Integration Points

| External System | Integration Type | Authentication |
|-----------------|-----------------|----------------|
| OpenAI API | SDK `openai` (chat.completions + tools) | `OPENAI_API_KEY` via `.env` (nunca no repo) |
| `query/` (GeoQuery) | Dependência local uv (path) | — (mesmo host, parquets locais) |
| PMTiles (`web/public/tiles`) | Fontes vetoriais já existentes | — |

---

## Testing Strategy

| Test Type | Scope | Files | Tools | Coverage Goal |
|-----------|-------|-------|-------|---------------|
| Unit (query) | 2 métodos novos do GeoQuery | `query/tests/test_queries.py` | pytest + parquets reais | Casos felizes + acentos/UF inválida |
| Unit (tools) | Dispatch, validação, normalização UF | `agent/tests/test_tools.py` | pytest + GeoQuery real | Todas as 7 tools |
| Unit (loop) | Tool-calling, autocorreção, teto, destaques derivados | `agent/tests/test_agent.py` | pytest + client OpenAI fake (stub) | AT-004/007 + Decision 2 |
| Benchmark | 16 perguntas do DEFINE contra OpenAI real | `agent/tests/test_benchmark.py` + `benchmark.yaml` | `pytest -m benchmark` (requer API key) | ≥ 90% (critério do DEFINE) |
| E2E manual | Chat→mapa pintado (`make dev-ia`) | — | Browser | BM-01, BM-06, BM-10, BM-14 |
| Typecheck | Front | — | `docker compose exec web npm run typecheck` | Verde |

**Nota:** o run padrão (`uv run pytest`) exclui o benchmark (`-m "not benchmark"` no
`pyproject.toml`) — offline e sem custo.

---

## Error Handling

| Error Type | Handling Strategy | Retry? |
|------------|-------------------|--------|
| Args de tool inválidos (Pydantic) / `ValueError` do GeoQuery (métrica inexistente) | Volta ao LLM como tool result de erro (inclui métricas válidas) para autocorreção; na 2ª falha, resposta pt-BR explicando | 1x (via LLM) |
| OpenAI: rate limit / timeout / 5xx | HTTP 502 com mensagem pt-BR no chat ("tente novamente"); log com detalhe | Não (MVP) |
| `OPENAI_API_KEY` ausente | Falha no startup com instrução (copiar `.env.example`) | — |
| Parquets ausentes | `db.connect()` já dá erro instrutivo → startup falha com a mensagem (AT-008) | — |
| Teto de iterações (6) atingido | Resposta parcial + aviso; destaques do que já foi consultado | Não |
| Sessão desconhecida/expirada (TTL 1 h) | Cria sessão nova transparentemente (histórico recomeça) | — |

---

## Configuration

| Config Key | Type | Default | Description |
|------------|------|---------|-------------|
| `OPENAI_API_KEY` | string | — (obrigatória) | Chave do usuário, só via `agent/.env` |
| `OPENAI_MODEL` | string | `gpt-5-mini` | Modelo; upgrade p/ `gpt-5.1` sem tocar código |
| `MAX_TOOL_ITERS` | int | `6` | Teto do loop de tool-calling por pergunta |
| `SESSION_TTL_S` | int | `3600` | Idade máxima de sessão em memória |
| `SESSION_MAX_MSGS` | int | `20` | Poda do histórico por sessão |
| `AGENT_PORT` | int | `8000` | Porta do uvicorn (casa com o proxy do Vite) |

---

## Security Considerations

- Chave OpenAI apenas em `agent/.env` (gitignored); `.env.example` documenta sem valores.
- LLM **nunca** gera SQL: só escolhe tools; identificadores validados contra o schema e valores
  parametrizados (padrão anti-injection herdado do `query/`).
- Backend escuta só em localhost no MVP; browser acessa via proxy same-origin (sem CORS aberto).
- `dados` devolve no máximo o `LIMIT` das tools (n ≤ 100) — sem dump de tabela.

---

## Observability

| Aspect | Implementation |
|--------|----------------|
| Logging | `logging` padrão (como `pipeline/`): por turno — pergunta, tool calls (nome+args), duração de cada tool e da chamada OpenAI, tokens do usage |
| Metrics | Fora do MVP (log de tokens já permite estimar custo) |
| Tracing | Fora do MVP; o log estruturado do loop é o rastro (base p/ MLflow tracing na 2.1 se quiser) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-08 | design-agent | Versão inicial; valida A-001 e **revisa a decisão nº 4 do brainstorm** (pintura via filtro nas camadas vetoriais, não `selection.ts`); destaques determinísticos (não-LLM) |
| 1.1 | 2026-07-08 | ship-agent | Shipped e arquivado (implementado sem desvios de arquitetura; +busca exata nome→código descoberta no E2E) |

---

## Next Step

**Ready for:** `/build .claude/sdd/features/DESIGN_AGENTE_IA.md`
