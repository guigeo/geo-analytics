# Exemplos AgentSpec

> Esta pasta não traz exemplos sintéticos. Os **melhores exemplos são reais**: os artefatos
> SDD de features que o seu projeto já entregou.

---

## Onde estão os exemplos reais

- **No seu projeto:** cada feature concluída deixa artefatos em `.claude/sdd/archive/`
  (BRAINSTORM / DEFINE / DESIGN / BUILD_REPORT / SHIPPED). Esses são a melhor referência,
  porque usam o seu domínio e o seu stack.
- **A estrutura de cada artefato:** está em [`.claude/sdd/templates/`](../templates/) — é o que
  os agentes preenchem. Comece por aí para entender o formato esperado.

> Um exemplo real shipado vale mais que um sintético — por isso o template não carrega um
> exemplo "de mentira" com domínio embutido (evita leak e ruído copiado para todo projeto filho).

---

## O que cada fase produz (resumo pedagógico)

### Fase 0 — Brainstorm
- Perguntas de descoberta; inventário do que já existe; abordagens com trade-offs; YAGNI aplicado; validações incrementais.

### Fase 1 — Define
- Problema; usuários-alvo e dores; critérios de sucesso; Contexto Técnico (localização, KB domains, impacto em IaC); restrições e premissas.

### Fase 2 — Design
- Diagramas de arquitetura; decisões com racional; **manifesto de arquivos com coluna de Agente**; seção de Agent Assignment Rationale; padrões de código prontos.

### Fase 3 — Build Report
- Execução de tarefas com **Agent Attribution**; resumo de contribuições por agente; arquivos criados com dono; resultados de verificação.
