<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Tools como Pydantic models + registry de dispatch

> **Propósito**: Uma fonte de verdade por tool — validação, JSON Schema e documentação saem do mesmo model. Adicionar tool = 1 model + 1 handler + 1 linha.
> **Validado**: 2026-07-08

## Quando usar

- Agente com tools de argumentos tipados (function calling OpenAI/Anthropic).
- Schemas JSON escritos à mão começaram a divergir da validação de runtime.
- Erros de argumento precisam voltar ao LLM de forma útil (autocorreção).

## Implementação

```python
from pydantic import BaseModel, Field, ValidationError

class RankingItemsArgs(BaseModel):
    """Top-N itens por uma métrica numérica, com filtro opcional por categoria."""
    #     ^ a docstring VIRA a description da tool no schema
    metrica: str = Field(description="Métrica numérica; em dúvida, use listar_metricas")
    categoria: str | None = None
    n: int = Field(10, ge=1, le=100)          # limites viram constraints no schema
    ordem: Literal["asc", "desc"] = "desc"

def _ranking(backend, a: RankingItemsArgs) -> ToolResult:
    rows = backend.ranking(a.metrica, categoria=a.categoria, n=a.n, ordem=a.ordem)
    return ToolResult(payload=rows, ids=[str(r["item_id"]) for r in rows], rows=rows)

TOOL_REGISTRY: dict[str, tuple[type[BaseModel], Handler]] = {
    "ranking_items": (RankingItemsArgs, _ranking),
    # adicionar tool = 1 model + 1 handler + 1 linha aqui
}

def openai_tools() -> list[dict]:
    return [
        {"type": "function", "function": {
            "name": name,
            "description": " ".join((model.__doc__ or "").split()),
            "parameters": model.model_json_schema(),
        }}
        for name, (model, _) in TOOL_REGISTRY.items()
    ]

def execute_tool(backend, name: str, raw_args: str) -> ToolResult:
    """Erro NUNCA vira exceção: vira payload p/ o LLM se autocorrigir."""
    entry = TOOL_REGISTRY.get(name)
    if entry is None:
        return ToolResult(payload={"erro": f"tool desconhecida: {name}",
                                   "validas": list(TOOL_REGISTRY)}, error=True)
    model, handler = entry
    try:
        args = model.model_validate_json(raw_args or "{}")
    except ValidationError as exc:
        return ToolResult(payload={"erro": "argumentos inválidos", "detalhe": str(exc)},
                          error=True)
    try:
        return handler(backend, args)
    except ValueError as exc:      # erro de domínio: a mensagem deve LISTAR o que é válido
        return ToolResult(payload={"erro": str(exc)}, error=True)
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| Description da tool | docstring do model | Zero duplicação; normalizar whitespace |
| Erro de validação | payload `{"erro": ..., "detalhe"/"validas": ...}` | O LLM corrige em 1 iteração se a mensagem listar opções válidas |
| Constraints | `Field(ge=, le=, min_length=)` | Viram JSON Schema — o LLM respeita na maioria dos casos |
| Backend nas tools | injetado no handler | Tools são wrappers finos de um backend testável sem LLM |

## Exemplo de uso

```python
r = execute_tool(backend, "ranking_items", '{"metrica": "total", "n": 5}')
# r.payload → volta ao LLM; r.ids/r.rows → grounding determinístico da resposta
```

## Ver também

- [loop-tool-calling-explicito](loop-tool-calling-explicito.md)
- [grounding-deterministico](../concepts/grounding-deterministico.md)
