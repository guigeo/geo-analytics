# CLAUDE.md

**As instruções deste repositório estão no [`AGENTS.md`](AGENTS.md).** Este arquivo não as
duplica — duas cópias desatualizam em ritmos diferentes, e a errada acaba sendo seguida.

Antes de iniciar qualquer tarefa:

1. **Leia o `AGENTS.md` por completo.** Ele é a fonte de verdade: regras, arquitetura,
   comandos, convenções e o estado atual.
2. Siga o que estiver lá. Em caso de conflito entre este arquivo e o `AGENTS.md`, **vale o
   `AGENTS.md`**.
3. Se a tarefa tocar decisão ou arquitetura, o `AGENTS.md` manda ler antes o
   `../webgis/AGENTS.md` e o ADR-0001. Isso não é opcional.

---

## Só o que o Claude Code roda

O que segue existe apenas nesta ferramenta. O Codex não executa nada disto, e por isso não
está no `AGENTS.md` — mas os **artefatos** que estes comandos produzem
(`.claude/sdd/archive/`) e o acervo de KBs (`.claude/kb/`) servem a qualquer agente e estão
descritos lá.

### Workflow SDD

```text
/brainstorm → /define → /design → /build → /ship
```

`/iterate` atualiza documentos a qualquer momento. Os artefatos vão para
`.claude/sdd/features/` durante o trabalho e para `.claude/sdd/archive/` ao encerrar.

**Os comandos só funcionam numa sessão iniciada neste repositório** — é a razão técnica da
regra "é aqui que se starta a sessão" do `AGENTS.md`.

Os 16 comandos em `.claude/commands/`: `brainstorm` · `build` · `contribute` · `create-kb` ·
`create-pr` · `define` · `design` · `distill` · `iterate` · `memory` · `project-init` ·
`readme-maker` · `review` · `ship` · `sync-context` · `telemetry`.

### Subagentes

23 em `.claude/agents/`, por categoria:

| Categoria | Agentes |
|---|---|
| Workflow SDD | `brainstorm-agent` `define-agent` `design-agent` `build-agent` `ship-agent` `iterate-agent` |
| Domínio | `geo-analytics-expert` `frontend-developer` `ai-developer` |
| Qualidade | `code-reviewer` `code-cleaner` `code-documenter` `python-developer` `test-generator` |
| Exploração | `codebase-explorer` `kb-architect` |
| IA/ML | `llm-specialist` `genai-architect` `ai-prompt-specialist` `ai-data-engineer` |
| Comunicação | `adaptive-explainer` `meeting-analyst` `the-planner` |

### Write-back para o template

`/distill` destila aprendizado de feature shipada em conteúdo de KB, e `/contribute`
devolve ao template. O destino sai de `.claude/template-link.yaml`.
