<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Loop de tool-calling explícito (SDK puro, sem framework)

> **Propósito**: O `while` de agente que qualquer framework esconde, escrito à mão em ~40 linhas — com teto de iterações, autocorreção de erro de tool e histórico podado com segurança.
> **Validado**: 2026-07-08 (produção local; 21 testes offline + benchmark real 16/16)

## Quando usar

- 1 agente + tools determinísticas + saída estruturada — o degrau mais simples da escada.
- Objetivo de aprendizado/portabilidade: entender e transportar o mecanismo (ambientes sem
  a lib do framework), migrar para framework depois é fácil; o contrário não.
- Quando cada dependência a mais custa (auditoria, ambiente corporativo restrito).

## Implementação

```python
MAX_TOOL_ITERS = 6  # protege contra loop infinito; limita custo por pergunta

def run_turn(client, session, pergunta: str) -> Response:
    session.messages.append({"role": "user", "content": pergunta})
    acao_ui, dados, erros = None, None, 0

    for _ in range(MAX_TOOL_ITERS):
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, *session.messages],
            tools=openai_tools(),                      # ver tools-pydantic-registry
        )
        msg = resp.choices[0].message
        session.messages.append(assistant_dict(msg))   # dict manual: portátil p/ fakes

        if not msg.tool_calls:                          # resposta final em texto
            trim(session)
            return Response(texto=msg.content or "", acao_ui=acao_ui, dados=dados)

        for call in msg.tool_calls:
            result = execute_tool(call.function.name, call.function.arguments)
            session.messages.append(
                {"role": "tool", "tool_call_id": call.id, "content": result.payload_json}
            )
            if result.error:
                erros += 1
                if erros >= 2:                          # 1 chance de autocorreção
                    trim(session)
                    return Response(texto=MSG_ERRO_AMIGAVEL, acao_ui=acao_ui, dados=dados)
            elif result.ids:                            # grounding determinístico
                acao_ui, dados = result.ids, result.rows

    trim(session)
    return Response(texto=MSG_LIMITE_ITERACOES, acao_ui=acao_ui, dados=dados)


def assistant_dict(msg) -> dict:
    """Serializa a mensagem do SDK como dict — funciona com o SDK real E com fakes."""
    out = {"role": "assistant", "content": msg.content}
    if msg.tool_calls:
        out["tool_calls"] = [
            {"id": c.id, "type": "function",
             "function": {"name": c.function.name, "arguments": c.function.arguments}}
            for c in msg.tool_calls
        ]
    return out


def trim(session, max_msgs: int = 20) -> None:
    """Poda SEMPRE em fronteira de turno (mensagem 'user').

    Cortar no meio orfana um tool result do seu assistant tool_call e a API
    REJEITA o histórico no turno seguinte. Aceita segurar 1 turno acima do teto.
    """
    msgs = session.messages
    while len(msgs) > max_msgs:
        try:
            cut = next(i for i, m in enumerate(msgs[1:], start=1) if m["role"] == "user")
        except StopIteration:
            break
        del msgs[:cut]
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| `MAX_TOOL_ITERS` | `6` | Teto de chamadas ao LLM por pergunta (custo e loop infinito) |
| Política de erro de tool | 1 retry via LLM, depois mensagem amigável | Erro volta como tool result (payload), não como exceção |
| Poda de histórico | fronteira de turno, ~20 msgs | Nunca orfanar tool result (ver `trim`) |
| Sessões | dict em memória + TTL | Suficiente p/ 1 worker; store externo só com multi-worker |

## Exemplo de uso

```python
store = SessionStore()          # dict {session_id: Session} com TTL
resp = run_turn(client, store.get(req.session_id), req.pergunta)
# resp.texto → chat; resp.acao_ui/dados → a UI executa (vieram das tools, não do LLM)
```

## Ver também

- [tools-pydantic-registry](tools-pydantic-registry.md) — de onde vêm `openai_tools()`/`execute_tool()`
- [grounding-deterministico](../concepts/grounding-deterministico.md) — por que `acao_ui` nunca vem do LLM
- [avaliacao-offline-fake-client](avaliacao-offline-fake-client.md) — como testar este loop sem rede
