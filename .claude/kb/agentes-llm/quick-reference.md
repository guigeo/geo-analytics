# Agentes LLM Quick Reference

> Fast lookup tables. For code examples, see linked files.

## Anatomia do agente mínimo (SDK puro)

| Peça | Implementação | Arquivo de referência |
|------|---------------|-----------------------|
| Tools | Pydantic model + handler + registry dict | patterns/tools-pydantic-registry.md |
| Loop | `while` com `MAX_TOOL_ITERS` (~6) | patterns/loop-tool-calling-explicito.md |
| Saída estruturada | derivada das rows das tools (não do LLM) | concepts/grounding-deterministico.md |
| Política | system prompt com regras numeradas + few-shots | concepts/system-prompt-como-politica.md |
| Sessões | dict em memória + TTL + poda em fronteira de turno | patterns/loop-tool-calling-explicito.md |
| Avaliação | pytest offline (fake) + `-m benchmark` (real) | patterns/avaliacao-* / benchmark-* |

## Decision Matrix

| Use Case | Choose |
|----------|--------|
| 1 agente + tools determinísticas + saída estruturada | SDK puro + Pydantic (este domínio) |
| Multi-agente, memória longa, observabilidade pronta | Framework (Pydantic-AI/Agno; LangGraph se grafo real) |
| LLM precisa de consulta livre aos dados | NÃO como fundação — tool SQL guardada (read-only, timeout, LIMIT) como extensão |
| Corrigir comportamento (recusa, formato, ressalva) | System prompt + re-rodar benchmark — não é código |
| Corrigir mecanismo (loop, validação, dispatch) | Código + teste offline com fake client |

## Common Pitfalls

| Don't | Do |
|-------|-----|
| Pedir ao LLM que copie ids p/ um JSON final (structured output) | Derivar ids/dados das rows das tools no backend |
| Deixar erro de tool virar exceção/500 | Erro = payload com opções válidas → LLM autocorrige (1 chance; na 2ª, mensagem amigável) |
| Podar histórico por contagem simples de mensagens | Podar em fronteira de turno — tool result órfão é REJEITADO pela API |
| Recusa "prestativa" que executa tool mesmo assim | Regra no prompt: fora de escopo = zero tool call (a UI age no que a tool retorna) |
| `LIKE '%nome%'` para resolver nome→id | Match exato primeiro; substring só como fallback |
| Benchmark com valores esperados (quebram com os dados) | Esperar comportamento: tool + args (subset) + forma da saída |
| Rodar benchmark pago no pytest padrão | `addopts = "-m 'not benchmark'"` + marker (CLI `-m benchmark` sobrepõe) |
| Confiar que testes offline validam qualidade | Offline = mecanismo; política só aparece com o LLM real |

## Custo e limites

| Knob | Default sugerido | Efeito |
|------|------------------|--------|
| `MAX_TOOL_ITERS` | 6 | Teto de custo por pergunta; loop infinito impossível |
| Retry de erro de tool | 1 (via LLM) | Autocorreção barata sem loop de falhas |
| Poda de sessão | ~20 msgs / TTL 1 h | Contexto limitado = custo por turno limitado |
| Modelo | mini/pequeno via env var | Upgrade = trocar env var; benchmark decide se precisa |

## Related Documentation

| Topic | Path |
|-------|------|
| Getting Started | `concepts/grounding-deterministico.md` |
| Full Index | `index.md` |
