<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Avaliação offline do loop com client fake roteirizado

> **Propósito**: Testar TODO o mecanismo do agente (loop, autocorreção, teto, histórico, grounding) sem rede, sem chave e sem custo — o LLM vira um roteiro.
> **Validado**: 2026-07-08 (21 testes offline cobrindo o loop de produção)

## Quando usar

- Sempre: é a suíte que roda no `pytest` padrão (rápida, grátis, determinística).
- O que ela NÃO cobre: política/qualidade do LLM real — isso é papel do benchmark
  ([benchmark-comportamental-yaml](benchmark-comportamental-yaml.md)). Os dois se complementam.

## Implementação

```python
from types import SimpleNamespace

def texto(content: str) -> SimpleNamespace:
    return SimpleNamespace(content=content, tool_calls=None)

def tool_call(name: str, args: dict, call_id: str = "call_1") -> SimpleNamespace:
    return SimpleNamespace(content=None, tool_calls=[SimpleNamespace(
        id=call_id, function=SimpleNamespace(name=name, arguments=json.dumps(args)))])

class FakeClient:
    """Devolve mensagens roteirizadas em sequência e grava cada request recebido."""
    def __init__(self, script: list[SimpleNamespace]) -> None:
        self.script = list(script)
        self.requests: list[dict] = []       # p/ inspecionar o que o loop enviou
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=self.script.pop(0))],
                               usage=None)
```

Funciona porque o loop serializa a mensagem do assistant **manualmente** (dict), então
qualquer objeto com `.content`/`.tool_calls` serve — SDK real ou `SimpleNamespace`.

## Exemplo de uso

```python
def test_autocorrecao_apos_erro_de_tool(backend):
    client = FakeClient([
        tool_call("ranking_items", {"metrica": "inexistente"}),   # 1ª: erro
        tool_call("ranking_items", {"metrica": "total", "n": 1}), # 2ª: corrigida
        texto("O maior item é X."),
    ])
    out = run_turn(client, nova_sessao(), "maior item?")
    assert out.ids                                    # grounding veio da tool válida
    # e o erro voltou ao LLM como tool result:
    assert any(m.get("role") == "tool" and "erro" in m["content"]
               for r in client.requests for m in r["messages"])

def test_teto_de_iteracoes(backend):
    client = FakeClient([tool_call("listar_opcoes", {})] * MAX_TOOL_ITERS)
    out = run_turn(client, nova_sessao(), "loop")
    assert out.texto == MSG_LIMITE_ITERACOES
    assert len(client.requests) == MAX_TOOL_ITERS     # não passou do teto

def test_multi_turno_preserva_historico(backend):
    store, client = SessionStore(), FakeClient([texto("Oi!"), texto("Continuando…")])
    run_turn(client, store.get("s1"), "primeira pergunta")
    run_turn(client, store.get("s1"), "segunda pergunta")
    ultimas = client.requests[-1]["messages"]
    assert any("primeira pergunta" in (m.get("content") or "") for m in ultimas)
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| O que rotear | 1 script por comportamento do loop | Resposta direta, tool→texto, erro→correção, 2 erros, teto |
| Backend das tools | real (dados de dev) se barato; senão stub | Tools reais pegam drift schema↔dados de graça |
| `requests` gravados | asserts sobre `messages` enviados | Verifica histórico, contexto anexado, tool results |

## Ver também

- [loop-tool-calling-explicito](loop-tool-calling-explicito.md) — o `assistant_dict` que torna o fake possível
- [benchmark-comportamental-yaml](benchmark-comportamental-yaml.md) — a metade paga da avaliação
