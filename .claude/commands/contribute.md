---
name: contribute
description: Devolve ao template (write-back) o conhecimento reaproveitável criado num projeto filho — KBs de tecnologia e agentes de papel técnico —, deixando para trás tudo que é específico do negócio
---

# Comando Contribute

> Roda **dentro de um projeto filho**. Fecha o ciclo da biblioteca central:
> o que nasceu aqui e serve a outros projetos volta para o acervo do template.
>
> **Regra de ouro:** só volta o que é reaproveitável (conhecimento de tecnologia
> ou papel técnico). Contexto de negócio NUNCA volta — fica no filho.

## Uso

```bash
/contribute                 # analisa tudo e propõe candidatos
/contribute kb pyspark      # contribui um item específico
/contribute agent api-developer
```

---

## O que volta e o que NÃO volta

| Volta para o acervo (reaproveitável) | Fica só no filho (específico) |
|--------------------------------------|-------------------------------|
| KB de tecnologia (`pyspark`, `prisma`...) | KB de regra de negócio do projeto |
| Agente de papel técnico (`api-developer`) | Agente `{projeto}-expert` |
| Pattern/concept genéricos | Exemplos com entidades/dados do projeto |
| Melhoria num componente que veio do template | Decisões arquiteturais do projeto |

Critério de decisão: *"outro projeto, de outro domínio, usaria isto sem editar?"*
Se a resposta depende do negócio deste projeto → **não volta**.

---

## Processo

### Passo 1: Localizar o template

```text
Read(.claude/template-link.yaml)   # template_path, template_version, components
```

Se o arquivo não existir: este projeto não nasceu via `/new-project`. Perguntar o
caminho do template ou abortar. Validar que `template_path` existe e tem `catalog.yaml`.

### Passo 2: Detectar candidatos

Comparar o que existe no filho com o que o template já tem:

```text
KBs:    Glob(.claude/kb/*/)         vs   {template}/.claude/kb/*/
Agentes: Glob(.claude/agents/**/*.md) vs {template}/.claude/agents/**/*.md
```

Classificar cada diferença:

```text
NOVO no filho, ausente no template   → candidato a contribuir
EXISTE em ambos, filho modificado    → candidato a atualizar (mostrar diff)
EXISTE só no template                → ignorar (não é deste fluxo)
```

Excluir automaticamente da lista de candidatos:
- `.claude/agents/domain/{projeto}-expert.md` — sempre específico
- Qualquer KB/agente cujo conteúdo cite entidades, regras ou dados do projeto
  (varrer por nomes do negócio que aparecem no `CLAUDE.md` do filho)
- Componentes `scope: project` (se marcado)

### Passo 3: Triagem de reaproveitabilidade

Para cada candidato, **ler o conteúdo** e decidir:

```text
Reaproveitável puro       → propor contribuir como está
Reaproveitável contaminado → propor contribuir APÓS limpar o contexto de negócio
                             (substituir exemplos do projeto por exemplos genéricos)
Específico do negócio      → descartar, explicar por quê
```

Um agente de papel técnico (ex.: `pipeline-developer`) quase sempre é "contaminado":
o **papel** é reaproveitável, mas os exemplos e o bloco de contexto são do projeto.
Nesse caso, propor uma versão generalizada (sem o `{projeto}`, sem regras de negócio).

### Passo 4: Confirmar o plano

```text
PLANO DE CONTRIBUIÇÃO → {template_path}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contribuir como está ({n}):
  • kb/{nome} — {por que é reaproveitável}

Contribuir após limpar contexto de negócio ({n}):
  • agent/{nome} → versão genérica {nome-generico}
    (remove: exemplos do projeto, bloco de negócio)

Atualizar no template (filho tem versão melhor) ({n}):
  • kb/{nome} — {resumo do diff}

Descartado (específico do negócio) ({n}):
  • kb/{nome} — {por quê}
  • agents/domain/{projeto}-expert — sempre específico
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confirmar? (sim / ajustar / escolher itens)
```

Escrita no acervo central propaga para todos os projetos futuros — **sempre confirmar**.

### Passo 5: Aplicar no template

Para cada item confirmado, escrever em `{template_path}`:

```text
KB novo:      copiar .claude/kb/{nome}/ → {template}/.claude/kb/{nome}/
              registrar em {template}/.claude/kb/_index.yaml (domains:)
              registrar em {template}/catalog.yaml (kbs:) com stacks/domains/last_validated

KB atualizado: sobrescrever {template}/.claude/kb/{nome}/
              atualizar last_validated no catalog.yaml

Agente:        escrever versão generalizada em
              {template}/.claude/agents/{categoria}/{nome}.md
              registrar em {template}/catalog.yaml (agents:) com scope/stacks/domains
```

Ao generalizar um agente: remover `name: {projeto}-*`, trocar exemplos do projeto por
exemplos neutros, remover seção de contexto de negócio, ajustar caminhos de KB.

**Convenção de idioma do acervo:** a prosa explicativa (KBs e descrições) vai em
**português**; código, nomes de API e keywords técnicas ficam em inglês por natureza.
Ao escrever no template, seguir o idioma do acervo, não o do projeto de origem.

### Passo 6: Commit no template e relatório

```bash
cd {template_path}
git add .claude/kb/ .claude/agents/ catalog.yaml
git commit -m "feat: contribuições de {nome-do-projeto-filho} ({lista resumida})"
```

Se o commit falhar (sem git): registrar aviso, não bloquear.

```text
CONTRIBUIÇÃO CONCLUÍDA → {template_path}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ KBs contribuídas: {lista}
✓ Agentes generalizados: {lista}
✓ Itens atualizados: {lista}
✓ Descartados (específicos): {n}
✓ Commitado no template ({SHA curto})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lembre-se: o template é outro repositório. Faça `git push` lá para publicar.
Projetos futuros via /new-project já herdarão estas contribuições.
```

---

## Gate de qualidade

```text
[ ] `.claude/template-link.yaml` (raiz `.claude/`, não `.claude/kb/`) lido e template_path validado
[ ] Candidatos detectados (novos + modificados)
[ ] {projeto}-expert e itens com contexto de negócio excluídos automaticamente
[ ] Cada candidato lido e triado (puro / contaminado / específico)
[ ] Agentes contaminados generalizados (sem {projeto}, sem regra de negócio)
[ ] Plano confirmado pelo usuário antes de escrever no acervo
[ ] KBs novas registradas em _index.yaml E catalog.yaml do template
[ ] Nenhum dado/entidade do projeto vazou para o acervo central
[ ] Commit feito no template
[ ] Relatório lembra do git push no template
```

---

## Casos especiais

| Situação | Ação |
|----------|------|
| Sem `.claude/template-link.yaml` | Perguntar caminho do template ou abortar |
| template_path não existe mais | Abortar com aviso (template movido/apagado) |
| Nenhum candidato reaproveitável | Reportar "nada a contribuir" — é um resultado válido |
| Candidato cita dados do projeto | Generalizar antes; se inseparável, descartar |
| Conflito (template já mudou o item) | Mostrar diff dos dois lados, perguntar antes de sobrescrever |
| Template é repo git sujo | Avisar; deixar o commit das contribuições isolado |

---

## Referências

- Vínculo com o template: `.claude/template-link.yaml`
- Catálogo (destino do registro): `{template}/catalog.yaml`
- Comando irmão (criação): `.claude/commands/new-project.md`
- Regra de separação reaproveitável vs negócio: ver tabela no topo deste arquivo
