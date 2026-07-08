# Agentes LLM Knowledge Base

> **Purpose**: Agente com function calling SEM framework — loop explícito, tools tipadas, grounding determinístico e avaliação (offline + benchmark real).
> **Validado em produção**: 2026-07-08 (feature real: 21 testes offline + benchmark 16/16 com LLM real)

## Quick Navigation

### Concepts (< 150 lines each)

| File | Purpose |
|------|---------|
| [concepts/grounding-deterministico.md](concepts/grounding-deterministico.md) | A saída estruturada que a UI executa sai das tools, nunca do LLM |
| [concepts/system-prompt-como-politica.md](concepts/system-prompt-como-politica.md) | Prompt como camada de política: regras numeradas, testadas por benchmark |

### Patterns (< 200 lines each)

| File | Purpose |
|------|---------|
| [patterns/loop-tool-calling-explicito.md](patterns/loop-tool-calling-explicito.md) | O `while` do agente à mão: teto, autocorreção, poda segura de histórico |
| [patterns/tools-pydantic-registry.md](patterns/tools-pydantic-registry.md) | 1 model = validação + JSON Schema + doc; dispatch por registry |
| [patterns/avaliacao-offline-fake-client.md](patterns/avaliacao-offline-fake-client.md) | Testar o loop sem rede: client fake roteirizado que grava os requests |
| [patterns/benchmark-comportamental-yaml.md](patterns/benchmark-comportamental-yaml.md) | Régua com LLM real: espera = comportamento (tool+args+saída), não valores |
| [patterns/resolucao-nome-para-id.md](patterns/resolucao-nome-para-id.md) | Nome→id sem contaminar a UI: match exato primeiro, substring como fallback |

---

## Quick Reference

- [quick-reference.md](quick-reference.md) — tabelas de decisão e pitfalls

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Grounding determinístico** | Ids/dados da resposta vêm das rows das tools executadas; LLM só escreve o texto |
| **Duas alucinações** | Textual (fato errado) vs estrutural (id errado que a UI executa) — a 2ª se elimina por construção |
| **Mecanismo × política** | Testes offline validam o mecanismo (loop); benchmark real valida a política (prompt) |
| **Erro como payload** | Erro de tool volta ao LLM como tool result com opções válidas → autocorreção em 1 iteração |

---

## Learning Path

| Level | Files |
|-------|-------|
| **Beginner** | concepts/grounding-deterministico.md → patterns/loop-tool-calling-explicito.md |
| **Intermediate** | patterns/tools-pydantic-registry.md → patterns/avaliacao-offline-fake-client.md |
| **Advanced** | patterns/benchmark-comportamental-yaml.md + concepts/system-prompt-como-politica.md |

---

## Agent Usage

| Agent | Primary Files | Use Case |
|-------|---------------|----------|
| llm-specialist / genai-architect | concepts/*, patterns/loop-*, patterns/tools-* | Desenhar/implementar agente com tool-calling |
| ai-prompt-specialist | concepts/system-prompt-como-politica.md | Corrigir comportamento sem tocar código |
| test-generator | patterns/avaliacao-*, patterns/benchmark-* | Suíte offline + régua real |
