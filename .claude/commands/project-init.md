---
name: project-init
description: Kickstart interativo do projeto — coleta contexto do stack, instala KBs, cria agentes de domínio e preenche o CLAUDE.md antes da primeira feature
---

# Comando Project Init

> Primeiro comando a rodar em todo projeto novo. Monta a base de conhecimento antes de qualquer feature.

## Uso

```bash
/project-init
/project-init "FastAPI + PostgreSQL + AWS Lambda serviço de ingestão de dados"
```

---

## O que este comando faz

1. **Entrevista** — Faz 6 perguntas para entender o projeto (a última, com PRD/briefing, é opcional)
2. **Infere** — Deriva lista de KBs e agentes de domínio a partir do stack
3. **Confirma** — Mostra o plano e pede aprovação antes de executar
4. **Instala KBs** — Roda `/create-kb` para cada lib/framework relevante
5. **Cria Agentes** — Gera agentes de domínio específicos para o projeto
6. **Preenche CLAUDE.md** — Substitui todo conteúdo `[placeholder]` por contexto real
7. **Handoff** — Indica o próximo passo (`/brainstorm` ou `/define`)

---

## Processo

### Passo 1: Ler estado atual

```text
Read(.claude/CLAUDE.md)           # Verifica o que já foi preenchido
Read(.claude/kb/_index.yaml)      # Verifica KBs existentes
Glob(.claude/agents/domain/*.md)  # Verifica agentes de domínio existentes
```

Se o CLAUDE.md já estiver preenchido (não é template virgem), confirmar com o usuário antes de sobrescrever.

### Passo 2: Entrevista interativa

Fazer as perguntas **uma de cada vez**. Aguardar resposta antes de passar para a próxima.

#### P1 — Identidade do projeto
```
O que é este projeto? Me dê uma frase.

Exemplo: "Uma API REST que ingere dados de sensores e armazena no PostgreSQL"
```

#### P2 — Stack tecnológico
```
Qual é o seu stack? Liste as principais linguagens, frameworks e bibliotecas.

Exemplos:
  Python + FastAPI + SQLAlchemy + PostgreSQL
  TypeScript + Next.js + Prisma + Supabase
  Python + PySpark + Delta Lake + Databricks
  Python + AWS Lambda + S3 + DynamoDB
```

#### P3 — Domínio
```
Qual domínio melhor descreve este projeto?
(a) API Web / Serviço backend
(b) Pipeline de dados / ETL
(c) Aplicação AI / ML / LLM
(d) Ferramenta CLI / Automação de scripts
(e) Frontend / Full-stack
(f) Infraestrutura / DevOps
(g) Outro: [descreva]
```

#### P4 — Cloud / Infraestrutura
```
Onde este projeto roda?
(a) AWS (Lambda / EC2 / ECS)
(b) GCP (Cloud Run / Cloud Functions)
(c) Azure (Functions / AKS)
(d) Databricks
(e) Local / On-premise
(f) Múltiplos / Híbrido
```

#### P5 — Equipe e contexto
```
Contexto rápido da equipe:
(a) Projeto solo
(b) Equipe pequena (2-5 pessoas)
(c) Equipe maior (6+)

E mais: Existe algum problema ou restrição específica que devo saber?
(Opcional — pode pular se não for relevante)
```

#### P6 — Contexto adicional (opcional)
```
Você tem algum documento ou detalhe adicional para compartilhar?

Pode colar aqui:
  • PRD (documento de requisitos do produto)
  • Notas de reunião ou briefing
  • Regras de negócio específicas
  • Restrições técnicas ou arquiteturais
  • Qualquer outro contexto relevante

(Opcional — se não tiver, pode pular com "não")
```

Se o usuário fornecer conteúdo:
- Extrair entidades de negócio, regras e restrições mencionadas
- Usar para enriquecer o CLAUDE.md na seção de contexto do projeto
- Ajustar a lista de KBs e agentes se o conteúdo revelar tecnologias não mencionadas antes
- Resumir o que foi extraído e confirmar com o usuário antes de avançar

---

### Passo 3: Derivar o plano

A partir das respostas, montar duas listas:

#### Lista de KBs (a partir do stack)

Mapear cada tecnologia para um domínio KB:

| Tecnologia | Domínio KB |
|------------|-----------|
| FastAPI | `fastapi` |
| SQLAlchemy | `sqlalchemy` |
| PostgreSQL | `postgresql` |
| Pydantic | `pydantic` |
| Next.js | `nextjs` |
| Prisma | `prisma` |
| PySpark | `pyspark` |
| Delta Lake | `delta-lake` |
| AWS Lambda | `aws-lambda` |
| AWS S3 | `aws-s3` |
| DynamoDB | `dynamodb` |
| Databricks | `databricks-lakeflow` |
| LangChain | `langchain` |
| Claude API | `claude-api` |
| Docker | `docker` |
| Terraform | `terraform` |
| pytest | `pytest` |

Adicionar KBs de base conforme o domínio:
- **API Web** → adicionar `rest-api-design`, `autenticacao`
- **Pipeline de dados** → adicionar `arquitetura-medalhao`, `qualidade-de-dados`
- **AI/LLM** → adicionar `engenharia-de-prompts`, `padroes-rag`
- **CLI** → adicionar `padroes-cli`

#### Lista de agentes de domínio

Criar 1-3 agentes específicos do projeto conforme o domínio:

| Domínio | Agentes sugeridos |
|--------|-----------------|
| API Web | `api-developer` (endpoints, validação, padrões de auth) |
| Pipeline de dados | `pipeline-developer` (transformações, qualidade, lineage) |
| AI/LLM | `ai-developer` (padrões de prompt, avaliação, retrieval) |
| CLI | `cli-developer` (estrutura de comandos, I/O, tratamento de erros) |
| Full-stack | `frontend-developer` + `backend-developer` |

Sempre adicionar: `{nome-do-projeto}-expert` — agente generalista com contexto completo do projeto.

#### MCPs relevantes por stack (informar ao usuário)

Verificar quais MCPs estão disponíveis globalmente e destacar os mais úteis para o stack declarado:

| Stack / Domínio | MCPs mais úteis |
|-----------------|-----------------|
| Qualquer projeto | `context7` — docs de libs em tempo real; `ref-tools` — busca em documentação |
| Databricks / Spark | `mcp__databricks__*` — operações diretas no workspace |
| AI / LLM | `context7` para docs de SDKs; `exa` para exemplos de código |
| AWS | `context7` para docs da SDK boto3/SAM |

Se o MCP relevante não estiver instalado, informar no plano:
```
⚠️  MCPs recomendados para este stack não detectados:
    • context7 — instale com: claude mcp add --scope user --transport http context7 https://mcp.context7.com/mcp
```

---

### Passo 4: Confirmar o plano

Apresentar o plano antes de executar:

```
PLANO DE INICIALIZAÇÃO DO PROJETO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Projeto: {nome}
Stack:   {resumo do stack}
Domínio: {domínio}
Cloud:   {cloud}

KBs a instalar (via /create-kb):
  • fastapi
  • sqlalchemy
  • pydantic
  • postgresql
  • aws-lambda

Agentes de domínio a criar:
  • api-developer  — padrões de endpoint FastAPI, validação de requests
  • data-expert    — modelo de dados e regras de negócio do projeto

CLAUDE.md: será preenchido com o contexto do projeto

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confirmar? (sim / ajustar)
```

Se o usuário disser "ajustar", aceitar modificações antes de continuar.

---

### Passo 5: Instalar KBs

Para cada KB da lista confirmada, invocar o agente kb-architect:

```text
Para cada kb_dominio na lista_kbs:
    Invocar: agente kb-architect
    Tarefa: "Criar domínio KB para '{kb_dominio}' para um projeto {descricao_projeto}"
    Saída: .claude/kb/{kb_dominio}/

Após todos os KBs criados:
    Atualizar .claude/kb/_index.yaml com todos os novos domínios
```

Exibir progresso:
```
Instalando KBs...
  ✓ fastapi
  ✓ sqlalchemy
  ✓ pydantic
  ⟳ postgresql...
```

---

### Passo 6: Criar agentes de domínio

Para cada agente da lista confirmada, criar `.claude/agents/domain/{nome-do-agente}.md`.

**REGRA CRÍTICA:** Todos os campos devem ser preenchidos com conteúdo real derivado de P1-P6. Nenhum `{placeholder}` genérico pode permanecer no arquivo gerado. Use os KBs criados no Passo 5 para preencher os caminhos exatos em "Padrões principais".

#### Template: agentes de domínio específicos

```markdown
---
name: {nome-do-agente}
description: |
  {Descrição concreta do papel no projeto — use a descrição real de P1}.
  Use quando {gatilho específico derivado do domínio e stack do projeto}.

  <example>
  Context: {Situação real do projeto baseada em P1/P6}
  user: "{Request concreto que um desenvolvedor faria neste projeto}"
  assistant: "Vou usar o {nome-do-agente} para {ação específica}."
  </example>

  <example>
  Context: {Segunda situação real diferente da primeira}
  user: "{Outro request concreto}"
  assistant: "Deixa eu usar o {nome-do-agente} para {ação específica}."
  </example>
tools: [Read, Write, Edit, Grep, Glob, Bash, TodoWrite]
color: blue
---

# {Nome do Agente}

> **Projeto:** {nome real do projeto de P1}
> **Domínio:** {responsabilidade concreta neste projeto}
> **Stack:** {tecnologias reais de P2 relevantes para este agente}

## Responsabilidades

{2-3 frases concretas sobre o que este agente é dono, usando linguagem do domínio do projeto}

## Padrões principais

Carregar antes de agir — usar os caminhos exatos dos KBs criados no Passo 5:
{Para cada KB relevante criado no Passo 5, listar o caminho real:}
- `.claude/kb/{kb-criado-no-passo5}/quick-reference.md`
- `.claude/CLAUDE.md` — convenções do projeto

## Referência de Stack

| Tecnologia | Versão | Uso neste projeto |
|------------|--------|------------------|
{Para cada tecnologia de P2 relevante para este agente, preencher uma linha real}

## Contexto de negócio

{Se P6 forneceu PRD ou regras de negócio: resumir aqui as regras e entidades
 que este agente precisa conhecer para tomar boas decisões}
```

#### Template especial: agente `{nome-do-projeto}-expert`

Este agente é o mais importante — é o especialista generalista do projeto. Deve ter o contexto mais rico.

```markdown
---
name: {nome-do-projeto}-expert
description: |
  Especialista em {nome do projeto} com conhecimento completo do domínio,
  regras de negócio e stack técnico. Use para decisões arquiteturais,
  dúvidas de domínio ou quando nenhum agente específico se aplica.

  <example>
  Context: {Situação de decisão arquitetural real do projeto}
  user: "{Pergunta de alto nível sobre o projeto}"
  assistant: "Vou usar o {nome-do-projeto}-expert para avaliar isso."
  </example>

  <example>
  Context: {Situação de regra de negócio específica do projeto}
  user: "{Pergunta sobre regra de negócio ou comportamento esperado}"
  assistant: "Deixa eu consultar o {nome-do-projeto}-expert."
  </example>
tools: [Read, Write, Edit, Grep, Glob, Bash, TodoWrite]
color: purple
---

# {Nome do Projeto} Expert

> **Projeto:** {nome real do projeto}
> **Papel:** Especialista generalista — domínio + arquitetura + negócio
> **Stack completo:** {stack completo de P2}

## Visão do projeto

{Descrição completa do projeto de P1, expandida com contexto de P5 e P6}

## Domínio de negócio

{Entidades principais, fluxos de negócio e regras extraídas de P6.
 Se P6 não foi fornecido, derivar do contexto de P1 e P3.}

### Entidades principais
{Listar entidades do domínio identificadas}

### Regras de negócio conhecidas
{Listar regras extraídas de P6 ou inferidas do domínio}

### Restrições do projeto
{Restrições técnicas e de negócio de P5 e P6}

## Padrões principais

Carregar antes de qualquer decisão — caminhos exatos dos KBs do Passo 5:
{Listar TODOS os KBs criados no Passo 5}

## Decisões arquiteturais

{Stack escolhido e motivação baseada nas respostas da entrevista}

| Decisão | Escolha | Motivação |
|---------|---------|-----------|
{Preencher com decisões reais do projeto derivadas de P2-P4}
```

---

### Passo 7: Preencher CLAUDE.md

Substituir todas as seções `[placeholder]` com conteúdo real derivado da entrevista:

```text
[PROJECT NAME]           → {nome do projeto da P1}
[One-line description]   → {descrição da P1}
[Business Problem]       → {contexto do problema da P1 + P5 + P6}
[Solution]               → {solução técnica da P1 + P2}
[Stack]                  → {stack tecnológico da P2}
[Team]                   → {tamanho da equipe da P5}
[domain] entries in KB   → {lista de KBs criados}
```

Se P6 forneceu contexto adicional, criar uma seção extra no CLAUDE.md:

```markdown
## Contexto de Negócio

{Resumo das regras de negócio, restrições e entidades extraídas do PRD/briefing fornecido}

### Regras de Negócio
- {regra extraída}

### Restrições Conhecidas
- {restrição extraída}
```

Para a seção Visão Geral da Arquitetura, manter como:
```
[Execute /sync-context após adicionar arquivos-fonte para gerar esta seção automaticamente]
```

Para Diretrizes de Uso dos Agentes, adicionar os agentes de domínio na linha da categoria Domínio.

---

### Passo 8: Commit e relatório final

Antes do relatório, commitar tudo que foi criado:

```bash
git add .claude/kb/ .claude/agents/domain/ .claude/CLAUDE.md
git commit -m "chore: project-init — KBs, domain agents e CLAUDE.md configurados"
```

Se o commit falhar (sem git ou sem stage), registrar no relatório como aviso mas não bloquear.

```
INICIALIZAÇÃO DO PROJETO CONCLUÍDA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ KBs instalados: {quantidade} domínios
  {lista com caminhos reais: .claude/kb/{dominio}/}

✓ Agentes de domínio criados: {quantidade}
  {lista com caminhos reais: .claude/agents/domain/{nome}.md}

✓ CLAUDE.md atualizado com contexto do projeto

✓ Alterações commitadas no git

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRÓXIMOS PASSOS:

1. Adicione seus arquivos-fonte e execute:
   /sync-context      → gera a seção de Arquitetura automaticamente

2. Comece sua primeira feature:
   /brainstorm "..."  → explore a ideia
   /define "..."      → vá direto para os requisitos

3. Se o stack mudar, adicione mais KBs a qualquer momento:
   /create-kb <biblioteca>
```

---

## Gate de qualidade

Antes de marcar como concluído:

```text
[ ] Todas as 5 perguntas da entrevista respondidas
[ ] P6 (contexto adicional) oferecida ao usuário
[ ] Se P6 fornecido: entidades e regras extraídas e confirmadas
[ ] MCPs relevantes verificados e informados no plano
[ ] Plano confirmado pelo usuário antes da execução
[ ] Todos os KBs da lista confirmada criados
[ ] Todos os agentes de domínio criados sem nenhum {placeholder} restante
[ ] Agente {projeto}-expert criado com contexto completo de negócio
[ ] Cada agente aponta para caminhos reais de KBs do Passo 5
[ ] CLAUDE.md sem nenhum texto [placeholder] restante
[ ] Alterações commitadas no git
[ ] Relatório final exibido com caminhos reais e próximos passos
```

---

## Tratamento de casos especiais

| Situação | Ação |
|-----------|--------|
| CLAUDE.md já preenchido | Perguntar: "Projeto já inicializado. Re-executar e sobrescrever?" |
| Usuário pula uma pergunta | Usar padrões razoáveis e registrar o que foi assumido |
| Criação de KB falha | Pular e registrar no relatório — não bloquear os outros KBs |
| Stack incomum (sem mapeamento de KB) | Criar KB mesmo assim com `/create-kb {tech}`, o kb-architect vai pesquisar |
| Usuário adiciona tech não mapeada | Incluir na lista de KBs e criar |

---

## Referências

- Agente de criação de KB: `.claude/agents/exploration/kb-architect.md`
- Template de agente: `.claude/agents/_template.md.example`
- Templates de KB: `.claude/kb/_templates/`
- Índice de KB: `.claude/kb/_index.yaml`
- Próxima fase: `.claude/commands/brainstorm.md`
