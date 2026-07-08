<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# System prompt é código de política (e o benchmark é o teste dele)

> **Propósito**: Tratar o system prompt como a camada de política do agente — versionado, testado por benchmark, corrigido por diff pequeno.
> **Confiança**: 0.9
> **Validado**: 2026-07-08 (2 frases levaram um benchmark real de 13/16 a 16/16, sem tocar em código)

## Visão geral

Defeitos de *comportamento* do agente (chamar tool quando não devia, apresentar nomes
técnicos crus, não mencionar uma ressalva) não se corrigem em código — se corrigem no
system prompt. A disciplina que funciona: regras **numeradas e inegociáveis** no prompt,
um **benchmark comportamental** que as verifica com o LLM real, e correções como diffs
mínimos de texto re-validados pelo benchmark. O prompt vira código: tem testes, tem
regressão, tem histórico.

## O padrão

```text
REGRAS INEGOCIÁVEIS
1. Todo número vem de uma tool. NUNCA responda valores de memória.
   Aritmética simples sobre valores retornados pelas tools é permitida.
2. Fora do escopo dos dados: NÃO chame nenhuma tool. Recuse com educação e
   dê exemplos do que sabe responder — apenas OFEREÇA, sem executar consultas
   que ninguém pediu (a UI age sobre o que as tools retornam; numa recusa,
   nada deve ser executado).
3. Resultado aproximado/limitação conhecida? Mencione a ressalva na resposta.
4. Ao apresentar opções técnicas ao usuário, traduza os identificadores para
   linguagem natural (ex.: "total_population → população total") — nunca
   despeje nomes crus de colunas.

EXEMPLOS   ← few-shots curtos, um por classe de comportamento (uso de tool,
             recusa, esclarecimento de escopo)
```

## Referência rápida

| Sintoma no benchmark | Classe de fix no prompt |
|----------------------|-------------------------|
| Recusa correta, mas executou tool "para ajudar" (e a UI agiu) | Regra explícita: fora de escopo = zero tool call |
| Resposta certa com identificadores crus (`col_x`) | Regra de tradução ao apresentar |
| Ressalva ausente (aproximação, dados de outro ano) | Regra "mencione a ressalva" + few-shot |
| Formato de resposta inconsistente | Instrução de formato (lista numerada com valores etc.) |

## Erros comuns

### Errado

```text
"Seja útil e responda com base nos dados disponíveis."   ← vago; o modelo decide a política
(defeito de comportamento aparece → corrige-se no código com if/else sobre a resposta)
```

### Certo

```text
Regras numeradas + few-shots; defeito de comportamento → 1-2 frases novas no prompt →
re-rodar o benchmark (só os casos afetados primeiro, depois a suíte completa).
```

## Relacionados

- [grounding-deterministico](grounding-deterministico.md)
- [benchmark-comportamental-yaml](../patterns/benchmark-comportamental-yaml.md)
