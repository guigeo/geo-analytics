# geo-analytics

> Aplicação para visualização de mapas e chat com um agente de IA.

---

## Contexto do Projeto

**Problema:** Explorar dados geoespaciais em um mapa é uma experiência puramente visual — falta uma forma de *perguntar* sobre o que está no mapa em linguagem natural e obter respostas ancoradas no contexto exibido.

**Solução:** Uma aplicação que combina visualização de mapas com um agente de IA conversacional. O usuário navega no mapa e conversa com um agente que entende e atua sobre o contexto geoespacial.

**Stack:** Python no backend (do agente de IA); biblioteca de mapas e framework do agente a definir no `/brainstorm`. Cloud: local.

**Equipe:** Projeto solo — Guilherme Ramos.

---

## Visão Geral da Arquitetura

[Execute /sync-context após adicionar arquivos-fonte para gerar esta seção automaticamente]

---

## Estrutura do Projeto

```text
[project-root]/
├── src/           # Código-fonte
├── tests/         # Suítes de teste
└── ...
```

---

## Workflows de Desenvolvimento

### AgentSpec 4.2 (Spec-Driven Development)

```text
/brainstorm → /define → /design → /build → /ship
  (Opus)      (Opus)    (Opus)   (Sonnet)  (Haiku)
```

| Comando | Fase | Propósito |
|---------|------|-----------|
| `/brainstorm` | 0 | Explorar ideias (opcional) |
| `/define` | 1 | Capturar e validar requisitos |
| `/design` | 2 | Criar arquitetura e especificação |
| `/build` | 3 | Executar implementação |
| `/ship` | 4 | Arquivar com lições aprendidas |
| `/iterate` | Qualquer | Atualizar documentos mid-stream |

**Artefatos:** `.claude/sdd/features/` e `.claude/sdd/archive/`

### Dev Loop (Nível 2 Agentico)

```bash
/dev "Quero construir X"              # O crafter te guia
/dev tasks/PROMPT_FEATURE.md          # Executa PROMPT existente
/dev tasks/PROMPT_FEATURE.md --resume # Retoma sessão interrompida
```

**Quando usar:** KBs, protótipos, features isoladas, utilitários

---

## Diretrizes de Uso de Agentes

| Categoria | Agentes | Quando usar |
|-----------|---------|-------------|
| **Workflow** | brainstorm, define, design, build, ship, iterate | Construir features com SDD |
| **Qualidade** | code-reviewer, code-documenter, code-cleaner, python-developer, test-generator | Revisar e melhorar código |
| **Exploração** | codebase-explorer, kb-architect | Explorar repositório, criar KBs |
| **Comunicação** | adaptive-explainer, meeting-analyst, the-planner | Explicações, planejamento |
| **AI/ML** | llm-specialist, genai-architect, ai-prompt-specialist, ai-data-engineer | Prompts, agentes de IA, retrieval |
| **Domínio** | geo-analytics-expert, ai-developer, frontend-developer | Tarefas específicas do projeto |

---

## Padrões de Código

### Linguagem: Python 3.11+ (backend) — frontend a definir no /brainstorm

- **Style:** Ruff (a confirmar no /brainstorm)
- **Testes:** pytest
- **Validação:** Pydantic v2 (a confirmar)
- **Type Hints:** Obrigatórios em todas as assinaturas de função

> **Projetos Python — obrigatório:** usar **uv** (não pip/venv). Comandos: `uv init`,
> `uv add <pkg>`, `uv run <cmd>`, `uv sync`; ferramentas one-off com `uvx <ferramenta>`.
> **Nunca instalar pacotes globalmente na máquina** — tudo isolado no ambiente do projeto.

---

## Knowledge Base

| Domínio | Propósito | Ponto de entrada |
|---------|-----------|-----------------|
| *(vazio)* | KBs nascem no `/brainstorm` via `/create-kb` | `.claude/kb/_index.yaml` |

Adicione domínios a qualquer momento com `/create-kb "<dominio>"`. Candidatas para este projeto: `claude-api`, biblioteca de mapas escolhida, `padroes-rag`.

---

## Features Ativas (Em Progresso)

| Feature | Status | Descrição |
|---------|--------|-----------|
| — | — | — |

---

## Features Entregues (Arquivo SDD)

| Feature | Entregue em | Descrição |
|---------|-------------|-----------|
| [MAPA_FASE1](.claude/sdd/archive/MAPA_FASE1/SHIPPED_2026-06-27.md) | 2026-06-27 | Mapa estático (MapLibre) com 5 camadas IBGE/antenas via PMTiles + ETL `GeoParquet→PMTiles` (Docker) |
| [REFINAMENTO_VISUAL](.claude/sdd/archive/REFINAMENTO_VISUAL/SHIPPED_2026-06-27.md) | 2026-06-27 | Polish visual: basemap z13 (ruas), paleta + rótulos UF/município, highlight ao clicar, legenda |

---

## Ajuda

- **Workflow SDD:** [.claude/sdd/_index.md](.claude/sdd/_index.md)
- **Exemplos SDD:** [.claude/sdd/examples/](.claude/sdd/examples/)
- **Dev Loop:** [.claude/dev/_index.md](.claude/dev/_index.md)
- **Agentes:** [.claude/agents/](.claude/agents/)
- **KB Index:** [.claude/kb/_index.yaml](.claude/kb/_index.yaml)
