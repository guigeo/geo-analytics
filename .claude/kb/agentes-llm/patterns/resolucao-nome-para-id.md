<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Resolução nome→id: match exato primeiro, substring como fallback

> **Propósito**: Resolver o nome que o usuário digitou/falou para o id canônico sem contaminar a ação da UI com vizinhos de substring.
> **Validado**: 2026-07-08 (bug real pego em E2E: "Nome" casava também "Nomelândia" e a UI agia sobre os dois)

## Quando usar

- Tool de agente (ou busca de UI) que converte nome de entidade → id canônico, e a
  aplicação **age** sobre os ids retornados (destacar, filtrar, navegar).
- Sintoma do problema: `LIKE '%nome%'` devolve a entidade certa E as que contêm o nome
  como prefixo/substring — o texto da resposta sai certo, mas a ação da UI pega todas.
  Asserts do tipo "contém o id esperado" passam; só o olho na tela pega.

## Implementação

```python
def busca_entidades(self, nome: str, filtro: str | None = None,
                    limite: int = 10) -> list[dict]:
    """Match exato vem sozinho; substring é só fallback quando não há nome igual."""
    exatos = self._busca(nome, filtro, limite, exato=True)
    return exatos or self._busca(nome, filtro, limite, exato=False)

def _busca(self, nome: str, filtro: str | None, limite: int, exato: bool) -> list[dict]:
    # normalização acento/caixa DENTRO do SQL (DuckDB: strip_accents; PG: unaccent)
    match = (
        "strip_accents(lower(nm)) = strip_accents(lower(?))"
        if exato
        else "strip_accents(lower(nm)) LIKE '%' || strip_accents(lower(?)) || '%'"
    )
    clauses, params = [match], [nome]
    if filtro:
        clauses.append("categoria = ?")
        params.append(filtro)
    params.append(int(limite))
    sql = (f"SELECT id, nm, categoria, peso FROM entidades "
           f"WHERE {' AND '.join(clauses)} ORDER BY peso DESC LIMIT ?")
    return rows(self.con.execute(sql, params))
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| Ordenação | por relevância (`peso` — ex.: tamanho/uso) DESC | Homônimos legítimos: o mais provável vem primeiro |
| Normalização | sem acento + lower, no SQL | Usuário digita "sao"; dado tem "São" |
| Homônimos exatos | retornar TODOS os exatos | É desambiguação legítima (mesma cidade em 2 estados) — quem decide é o chamador/LLM |
| Identificadores no SQL | validados contra o schema; valores como parâmetros | Anti-injection: nunca interpolar o que veio do LLM/usuário |

## Exemplo de uso

```python
busca_entidades("nome")    # → só a entidade "Nome" (exato ganhou)
busca_entidades("nom")     # → "Nome", "Nomelândia", ... (fallback substring)
```

## Ver também

- [grounding-deterministico](../concepts/grounding-deterministico.md) — por que os ids desta busca acionam a UI diretamente
- [benchmark-comportamental-yaml](benchmark-comportamental-yaml.md) — e por que só assert não basta (E2E visual)
