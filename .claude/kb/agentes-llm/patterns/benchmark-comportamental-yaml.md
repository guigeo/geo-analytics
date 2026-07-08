<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Benchmark comportamental declarativo (YAML + pytest marker)

> **Propósito**: Régua de regressão do agente com o LLM real — o esperado é COMPORTAMENTO verificável (tool + args + saída estruturada), não valores que mudam com os dados.
> **Validado**: 2026-07-08 (16 casos; 1º run pegou 3 defeitos de política invisíveis aos testes offline)

## Quando usar

- Antes do primeiro deploy e após QUALQUER mudança de system prompt/modelo/tools.
- Lição de campo: testes offline garantem o **mecanismo**; só o run com LLM real valida a
  **política** (ex.: recusa que chamava tool "para ajudar" — mecanismo perfeito, política errada).

## Implementação

Casos em YAML — só o que está declarado em `espera` é verificado:

```yaml
casos:
  - id: BM-01
    pergunta: "Top 5 itens da categoria X por métrica Y?"
    espera:
      tool: ranking_items                    # deve aparecer no trace, sem erro
      args: { metrica: metrica_y, n: 5 }     # subconjunto (args extras são ignorados)
      saida: { n_ids: 5 }                    # a UI recebe exatamente 5 ids
  - id: BM-02
    sessao: continua                          # mesma conversa que o caso anterior c/ essa chave
    pergunta: "E os 10 primeiros?"
    espera: { tool: ranking_items, args: { n: 10 } }   # herda contexto do histórico
  - id: BM-03
    pergunta: "Pergunta fora do escopo dos dados?"
    espera:
      saida: null                             # recusa NÃO aciona a UI
      sem_dados: true
      resposta_contem: ["não"]                # substring case-insensitive, robusta
```

Runner: cada caso é um teste; marker mantém o run padrão offline e grátis:

```python
# pyproject.toml:
#   addopts = "-m 'not benchmark'"           ← run padrão exclui (CLI -m sobrepõe)
#   markers = ["benchmark: chama o LLM real (custo/chave)"]
pytestmark = pytest.mark.benchmark
CASOS = yaml.safe_load(Path("benchmark.yaml").read_text())["casos"]

@pytest.mark.parametrize("caso", CASOS, ids=[c["id"] for c in CASOS])
def test_benchmark(caso, ambiente):
    trace: list[dict] = []                    # o loop grava (tool, args, error) aqui
    out = run_turn(..., caso["pergunta"], trace=trace)
    espera = caso.get("espera") or {}
    if "tool" in espera:
        hits = [t for t in trace if t["tool"] == espera["tool"] and not t["error"]]
        assert hits
        if "args" in espera:
            assert any(subset_match(espera["args"], t["args"]) for t in hits)
    if espera.get("sem_dados"):
        assert out.dados is None
    for trecho in espera.get("resposta_contem", []):
        assert trecho.lower() in out.texto.lower()
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| Nº de casos | 10–20 | Cobre classes: consulta, resolução de nome, multi-turno, contexto, recusa |
| Meta | ≥ 90% num run único | Definida ANTES (no documento de requisitos), não depois |
| Asserts de texto | substrings curtas e estáveis ("aproximad", "2022") | Nunca frases inteiras — LLM parafraseia |
| Asserts de valor | evitar | Ground truth dos números é a suíte do backend de dados, não o LLM |
| Falhou? | classificar: mecanismo (código) × política (prompt) | Política → diff no prompt → re-rodar os afetados → suíte completa |
| Duplo uso | casos viram few-shots do system prompt | Um artefato, dois empregos |

## Exemplo de uso

```bash
uv run pytest                      # offline: benchmark deselected, grátis
uv run pytest -m benchmark -v     # régua real: requer chave; ~1 chamada por caso
```

## Ver também

- [avaliacao-offline-fake-client](avaliacao-offline-fake-client.md) — a metade grátis da avaliação
- [system-prompt-como-politica](../concepts/system-prompt-como-politica.md) — o que o benchmark testa de verdade
