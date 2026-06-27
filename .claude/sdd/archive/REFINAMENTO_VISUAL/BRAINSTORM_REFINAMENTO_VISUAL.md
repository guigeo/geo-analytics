# BRAINSTORM: Refinamento Visual do Mapa

> Sessão exploratória para clarear intenção e abordagem antes da captura de requisitos

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | REFINAMENTO_VISUAL — polish visual do mapa da Fase 1 |
| **Data** | 2026-06-27 |
| **Autor** | brainstorm-agent |
| **Status** | Pronto para Define |

---

## Ideia Inicial

**Input Bruto:** "refinamento visual do mapa". Após a entrega de [MAPA_FASE1](../archive/MAPA_FASE1/SHIPPED_2026-06-27.md), o usuário achou o resultado **"bem simples"** — em especial **o basemap (ruas)** e **as cores das camadas**. Esta feature é o polish visual, separado conscientemente do ship da Fase 1 para manter o milestone limpo.

**Contexto Coletado:**
- Fase 1 entregue e rodando (`docker compose up web`, http://localhost:5173).
- Esteira pronta: `GeoParquet → PMTiles`; basemap Protomaps auto-hospedado.
- Estado visual atual:
  - Basemap Protomaps `light`, **`maxzoom: 8`** → ruas grosseiras no zoom de cidade (20 MB).
  - Camadas com `fill-opacity: 0.12`, outline da mesma cor; sem rótulos, sem legenda, sem highlight.

**Contexto Técnico Observado (para o Define):**

| Aspecto | Observação | Implicação |
|---------|------------|------------|
| Local do código | `web/src/map/{layers.ts,basemap.ts,MapView.tsx}`, `web/src/panels/`, `pipeline/datasets.yaml`, `pipeline/src/geo_pipeline/basemap.py` | Mudança majoritariamente frontend + 1 config de ETL |
| Regeração de tiles | Apenas **basemap** (maxzoom 8→13). Tiles de dados **não** mudam | Evita re-tilar o setor (~28 min) |
| KB relevante | `maplibre` (a criar) | Padrões de estilo/symbol/highlight |

---

## Perguntas de Descoberta & Respostas

| # | Pergunta | Resposta | Impacto |
|---|----------|----------|---------|
| 1 | Alvo do basemap (detalhe vs tamanho)? | **Simples no alto, ruas detalhadas no zoom próximo** | Subir `maxzoom` para ~13; zoom-out continua simples (vector tiles são por-zoom) |
| 2 | Até onde levar o estilo das camadas? | **Polish + destaque ao clicar** | Paleta, opacidade/outline, rótulos, legenda, highlight; sem data-driven |
| 3 | Referência visual? | **Padrão de bom gosto (eu decido)** | Estética GIS moderna clara, cores distintas porém harmônicas |

**Insight técnico validado com o usuário:**
- Vector tiles são **por-zoom** → subir `maxzoom` não polui a visão nacional; o detalhe só aparece ao aproximar.
- **PMTiles + range requests** → um `basemap.pmtiles` grande **não** gera download grande por usuário (cada um baixa só o viewport). Custo de detalhar = disco no VPS + tempo de geração, **não** banda por acesso.

---

## Inventário de Dados (Amostras)

| Tipo | Localização | Notas |
|------|-------------|-------|
| Estilo atual das camadas | `web/src/map/layers.ts` | Cores e paint atuais (baseline a refinar) |
| Config do basemap | `pipeline/datasets.yaml` (bloco `basemap`) | `maxzoom` a subir |
| Tiles existentes | `web/public/tiles/*.pmtiles` | Tiles de dados reaproveitados sem mudança |

**Como serão usadas:** baseline visual de partida; nenhum dado novo é ingerido.

---

## Abordagens Exploradas

### Abordagem A: Highlight via fonte GeoJSON de seleção ⭐ Recomendada e Escolhida

**Descrição:** Ao clicar, `queryRenderedFeatures` retorna a geometria da feição. Essa geometria é colocada numa fonte GeoJSON "seleção" e renderizada por cima com estilo de realce (contorno grosso contrastante). Funciona igual para polígonos e pontos, **sem mexer nos tiles de dados**.

**Prós:**
- Zero regeração de tiles de dados (não re-tila o setor de 473k).
- Uniforme (polígono e ponto); sem necessidade de id único nas camadas.
- Implementação simples e contida no frontend.

**Contras:**
- A geometria pode vir levemente cortada nas bordas de tile (raro/aceitável para polish).

**Por que recomendada:** entrega o highlight com custo mínimo; o corte de borda não justifica re-tilar tudo.

---

### Abordagem B: Highlight via `feature-state` (promoteId)

**Descrição:** Usar `feature-state` do MapLibre com `promoteId` apontando para um id único por feição.

**Prós:** realce perfeito, sem corte de borda.
**Contras:** exige **id único** em cada camada (antenas não tem) → adicionar campos `id` e **regenerar todos os tiles**, incluindo o setor (~28 min). Trabalho desproporcional para polish.

---

## Abordagem Selecionada

| Atributo | Valor |
|----------|-------|
| **Escolhida** | Abordagem A |
| **Confirmação do Usuário** | 2026-06-27 — "pode seguir" |
| **Raciocínio** | Highlight com custo mínimo, sem re-tilar dados; corte de borda é aceitável para polish |

---

## YAGNI — Cortado/Adiado

| Item | Decisão | Motivo |
|------|---------|--------|
| Estilo data-driven (antenas por operadora, choropleth de setor) | ❌ Adiado | Feature analítica futura; aqui é polish |
| Dark mode | ❌ Fora | Usuário escolheu tema claro |
| Rótulos de bairro/setor | ❌ Fora | Densidade alta → poluição visual |
| Highlight por feature-state | ❌ Fora | Exige re-tilar tudo (Abordagem B) |
| Auto-hospedar fontes/sprites do tema | ❌ Adiado | Otimização de offline, fora do escopo visual |

---

## Rascunho de Requisitos (para o /define)

**Basemap (ETL)**
- `R-1` Regenerar o basemap com `maxzoom: 13` (detalhe de rua no zoom próximo); medir o tamanho resultante e registrar.
- `R-2` Visão nacional/estadual permanece simples (consequência natural de vector tiles por-zoom).

**Estilo das camadas (frontend — `layers.ts`/estilo)**
- `R-3` Paleta refinada: 5 cores distintas e harmônicas, opacidade de preenchimento e outline ajustados para boa legibilidade sobre o basemap claro.
- `R-4` Rótulos (symbol layers) com nomes de **UF** e **município**, aparecendo em faixas de zoom apropriadas; sem rótulo para bairro/setor.

**Highlight (frontend — `MapView.tsx`)**
- `R-5` Ao clicar numa feição, realçá-la no mapa via fonte GeoJSON de seleção (contorno contrastante), para polígonos e pontos.
- `R-6` Clicar fora limpa o realce; abrir nova feição substitui o realce.

**Legenda (frontend — painel)**
- `R-7` Legenda com a cor de cada camada (pode evoluir o swatch já existente no LayerPanel).

**Critério de Aceite:** ao aproximar numa cidade, ver ruas detalhadas no fundo; as camadas têm cores agradáveis e legíveis; clicar destaca a feição; UF/município mostram nomes; há uma legenda. Tiles de dados inalterados.

---

## Próximo Passo

```bash
/define .claude/sdd/features/BRAINSTORM_REFINAMENTO_VISUAL.md
```
