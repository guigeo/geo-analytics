<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Grounding determinístico: a saída estruturada sai das tools, não do LLM

> **Propósito**: Eliminar alucinação estrutural por construção — a UI só age sobre o que uma tool retornou.
> **Confiança**: 0.95
> **Validado**: 2026-07-08 (benchmark de 16 casos com LLM real)

## Visão geral

Num agente com tool-calling há dois tipos de alucinação: a **textual** (o LLM escreve um
fato errado) e a **estrutural** (o LLM devolve ids/códigos/ações erradas num JSON que a
aplicação executa). A segunda é a perigosa — a UI age sobre ela. A solução não é validar
o JSON do LLM (structured output valida *sintaxe*, não *veracidade*): é **nunca pedir ao
LLM a parte estruturada**. O backend acumula os ids/rows dos resultados das tools que ele
mesmo executou e monta a resposta estruturada; o LLM produz apenas o texto.

## O padrão

```python
@dataclass
class ToolResult:
    payload: Any                      # o que volta ao LLM (tool message)
    ids: list[str] = field(default_factory=list)   # ids p/ a UI agir (ex.: destacar)
    rows: list[dict] | None = None    # dados brutos p/ a resposta da API

def run_turn(...) -> Response:
    acao_ui, dados = None, None
    while ...:
        msg = llm.create(messages=..., tools=...)
        if not msg.tool_calls:
            # LLM só contribui com o TEXTO; a parte estruturada já está pronta
            return Response(texto=msg.content, acao_ui=acao_ui, dados=dados)
        for call in msg.tool_calls:
            result = execute_tool(call)          # nosso código, dados reais
            if result.ids:                       # última tool de dados vence
                acao_ui, dados = result.ids, result.rows
```

## Referência rápida

| Entrada | Saída | Notas |
|---------|-------|-------|
| Tool de dados (ranking, lookup) | `ids` + `rows` capturados | Regra simples: última tool de dados do turno vence |
| Tool de descoberta (listar opções) | sem `ids` | Não gera ação de UI |
| Turno sem tool call (recusa/conversa) | `acao_ui = None` | Nada é executado na UI |

## Erros comuns

### Errado

```python
# Pedir ao LLM que copie os ids para um JSON final (structured output)
schema = {"resposta": str, "ids_para_destacar": list[str]}  # LLM pode copiar errado
final = llm.parse(messages=..., response_format=schema)
```

### Certo

```python
# Backend deriva os ids dos resultados que ELE executou; LLM nem vê o contrato
return Response(texto=msg.content, acao_ui=ids_da_ultima_tool, dados=rows)
```

Bônus: dispensar structured output remove um modo de falha inteiro (schema recusado,
JSON truncado) e o contrato da API passa a ser 100% código seu.

## Relacionados

- [system-prompt-como-politica](system-prompt-como-politica.md)
- [loop-tool-calling-explicito](../patterns/loop-tool-calling-explicito.md)
- [benchmark-comportamental-yaml](../patterns/benchmark-comportamental-yaml.md)
