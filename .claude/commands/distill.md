---
name: distill
description: Destila o aprendizado técnico de uma feature shipada em conteúdo de KB generalizado (sem contexto de negócio), gravando no acervo local do filho para depois ser enviado ao template via /contribute
---

# Comando Distill

> Roda **dentro de um projeto filho**. Fecha o vão entre "feature pronta" e "acervo cresce":
> lê o que a feature ensinou (código + docs SDD) e transforma em patterns/concepts de KB
> **generalizados** — a técnica, sem o negócio.
>
> **Pipeline completo do conhecimento:**
> `feature shipada → /distill (vira KB no filho) → /contribute (KB → acervo do template)`

## Uso

```bash
/distill                       # lista features shipadas e pergunta qual destilar
/distill SILVER_ESTACOES_ERB   # destila uma feature específica
/distill --feature-atual       # destila a feature ativa (ainda não arquivada)
```

---

## O que vira KB e o que NÃO vira

| Vira KB (generalizável) | Fica só no filho (específico) |
|-------------------------|-------------------------------|
| Perrengue/limite descoberto (ex.: "tipo X falha com erro Y") | Regra de negócio do projeto |
| Técnica/função aplicada (ex.: indexação H3) | Entidades e nomes do domínio |
| Pattern que resolveu problema recorrente | Valores específicos (thresholds, bbox do território) |
| Decisão com racional reaproveitável | Racional ligado ao negócio |

Teste de generalização (o coração do comando): *"outro projeto, de outro domínio,
usaria isto sem editar?"* — separa a **técnica** (vai) do **exemplo** (generaliza ou fica).

---

## Processo

### Passo 1: Localizar a feature e o vocabulário de negócio

```text
# Feature: arquivada ou ativa
Glob(.claude/sdd/archive/*/)            # features shipadas
Glob(.claude/sdd/features/*.md)         # feature ativa (--feature-atual)

# Vocabulário de negócio a EXPURGAR (mesma fonte do leak-check do /contribute)
Read(.claude/CLAUDE.md)                 # seção "Contexto de Negócio": entidades, nomes, regras
```

Montar a lista de termos do negócio (entidades, siglas, nomes próprios do domínio) —
é o filtro que vai garantir que nada do negócio vaze para a KB.

### Passo 2: Ler as fontes do aprendizado

```text
Da feature escolhida, ler:
  - SHIPPED_*.md / BUILD_REPORT_*.md   → seções de lições, correções, issues, decisões
  - DESIGN_*.md                        → decisões técnicas e alternativas descartadas
  - DEFINE_*.md                        → restrições e premissas validadas
  - o CÓDIGO que a feature tocou (src/...) → onde as técnicas concretas estão
```

O código é a fonte mais rica — perrengue e técnica costumam estar lá, não nos docs.

### Passo 3: Extrair candidatos a aprendizado

Procurar sinais de conhecimento reaproveitável:

```text
SINAL                                          EXEMPLO
─────────────────────────────────────────────  ─────────────────────────────────
Limite/incompatibilidade descoberta            "GEOMETRY não persiste na Free Edition"
Função/API usada de forma não óbvia            h3_longlatash3(lng, lat, res)
Pattern que resolveu problema recorrente       flag-não-drop para dado suspeito
Armadilha de tipo/encoding/locale              zero à esquerda morre com cast int
Decisão técnica com racional reaproveitável    streaming table vs materialized view
```

### Passo 4: Classificar cada candidato

```text
Generalizável puro       → propor como pattern/concept de KB, como está
Generalizável contaminado → propor APÓS remover o negócio (técnica fica, exemplo neutraliza)
Específico do negócio    → descartar da KB; sugerir registrar no {projeto}-expert ou CLAUDE.md
```

### Passo 5: Decidir destino e generalizar (o coração)

Para cada candidato generalizável:

```text
1. ENRIQUECER existente vs KB NOVA?
   - Consultar o acervo: KBs locais em `.claude/kb/` + as do template
     (resolver `template_path` lendo `.claude/template-link.yaml` — fica na RAIZ
     `.claude/`, NÃO em `.claude/kb/`; se não existir, seguir só com o acervo local)
   - Cabe num domínio existente → adicionar pattern/concept lá
   - É um tema novo que vai crescer → propor domínio novo

2. GENERALIZAR (receita):
   - MANTÉM: a técnica, a função/API, o modo de falha, a regra prática
   - SUBSTITUI: substantivos do projeto → neutros; valores específicos → exemplo genérico + nota
   - REMOVE: racional de negócio, contexto de domínio
   - IDIOMA: prosa explicativa em PORTUGUÊS (convenção do acervo); código, nomes de
     API e keywords técnicas ficam em inglês por natureza (streaming table, ROW_NUMBER…)
   - VERIFICA: nenhum termo da lista do Passo 1 sobrou no texto final
```

### Passo 6: Confirmar o plano

```text
PLANO DE DESTILAÇÃO — feature {nome}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Aprendizados → KB (no filho, depois /contribute):

  KB existente enriquecida:
    • {dominio}/patterns/{novo}.md — {técnica generalizada}

  KB nova proposta:
    • {dominio-novo}/ — {tema} ({n} concepts, {n} patterns)

Descartado (específico do negócio):
    • {aprendizado} — fica no {projeto}-expert / CLAUDE.md

Generalizações aplicadas (técnica → exemplo neutro):
    • "{exemplo do projeto}" → "{exemplo genérico}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confirmar? (sim / ajustar / escolher itens)
```

### Passo 7: Escrever no acervo LOCAL do filho

Seguir os templates de `.claude/kb/_templates/` e os limites de tamanho do `_index.yaml`
(quick-reference ≤100, concept ≤150, pattern ≤200):

```text
KB nova:       criar .claude/kb/{dominio}/ (manifest, index, quick-reference, concepts, patterns)
KB existente:  adicionar arquivos e atualizar o domínio em .claude/kb/_index.yaml
```

**Não** escrever no template aqui — quem leva ao acervo central é o `/contribute`.

### Passo 8: Relatório e ponte para o /contribute

```text
DESTILAÇÃO CONCLUÍDA — feature {nome}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ KBs novas no filho: {lista}
✓ KBs enriquecidas: {lista}
✓ Descartados (negócio): {n}  →  {onde registrar}
✓ Leak-check: nenhum termo de negócio na KB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRÓXIMO PASSO:
  Estas KBs ainda estão só neste projeto. Para enviá-las ao acervo do template
  (e reaproveitar em projetos futuros), rode:  /contribute
```

Opcional: oferecer encadear `/contribute` na hora.

---

## Gate de qualidade

```text
[ ] Feature localizada (arquivada ou ativa)
[ ] Vocabulário de negócio extraído do CLAUDE.md (filtro de leak)
[ ] Aprendizados extraídos de docs SDD E do código tocado
[ ] Cada candidato classificado (puro / contaminado / específico)
[ ] Generalização aplicada: técnica mantida, negócio removido
[ ] Destino decidido por candidato (enriquecer existente vs KB nova)
[ ] Acervo consultado para evitar duplicar pattern já existente
[ ] Plano confirmado antes de escrever
[ ] KBs gravadas no FILHO (não no template) + _index.yaml atualizado
[ ] Leak-check final: nenhum termo de negócio na KB gerada
[ ] Relatório aponta /contribute como próximo passo
```

---

## Casos especiais

| Situação | Ação |
|----------|------|
| Feature sem aprendizado generalizável | Reportar "nada a destilar" — é resultado válido |
| Aprendizado já coberto por pattern existente | Sugerir refinar o existente, não duplicar |
| Técnica inseparável do negócio | Descartar da KB; registrar no `{projeto}-expert` |
| Rodado fora de um projeto filho (sem features SDD) | Avisar: comando é para destilar features de um projeto |
| Sem `template-link.yaml` | Funciona mesmo assim (grava local); só o /contribute precisa do vínculo |

---

## Referências

- Próximo passo (envia ao acervo): `.claude/commands/contribute.md`
- Templates de KB: `.claude/kb/_templates/`
- Limites de tamanho: `.claude/kb/_index.yaml`
- Mesmo teste de generalização do `/contribute` (técnica vs negócio)
